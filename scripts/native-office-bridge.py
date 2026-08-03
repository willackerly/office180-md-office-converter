#!/usr/bin/env python3
"""Bounded native Microsoft Office open/save/reopen bridge for macOS.

CONTRACT:C11-OFFICE-VISUAL-EVIDENCE.1.1

The bridge never opens a canonical or delivery artifact directly. It copies a
trusted repository-contained DOCX/PPTX to an ignored repository work
directory, hands that exact file to Office through Launch Services, attaches
by exact POSIX path, forces an in-place Save, validates quiescent package
bytes, reopens the same copy, and only then publishes a new explicit output.

AppleScript controls only the exact work-copy path. It never uses the active
document, never opens a file picker, never grants broader access, never quits
Office, and never closes unrelated documents.
"""

from __future__ import annotations

import argparse
import contextlib
import dataclasses
import fcntl
import hashlib
import json
import os
import platform
import plistlib
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import unicodedata
import uuid
import zipfile
from pathlib import Path
from typing import Any, Callable, Iterable, Sequence


SCHEMA = "office180-native-office-bridge/0.1"
WORK_DIRECTORY_NAME = ".office180-native-work"
MAX_PACKAGE_BYTES = 256 * 1024 * 1024
MAX_UNCOMPRESSED_BYTES = 512 * 1024 * 1024
MAX_PARTS = 10_000
MIN_TIMEOUT_SECONDS = 10.0
MAX_TIMEOUT_SECONDS = 300.0
POLL_SECONDS = 0.25
QUIESCENCE_POLLS = 3
QUIESCENCE_INTERVAL_SECONDS = 0.4
EMPTY_SHA256 = hashlib.sha256(b"").hexdigest()
POLL_COMMAND_SECONDS = 1.5
POLL_MIN_REMAINING_SECONDS = 0.35
MAX_POLL_COMMAND_SAMPLES = 2
HANDOFF_HELPER = Path(__file__).with_name("native-office-handoff.swift")
SWIFT = Path("/usr/bin/swift")
PUBLICATION_RESIDUAL_LIMIT = (
    "The report is the pair commit marker and is published last. A process or "
    "power loss between output publication and report publication can leave an "
    "uncommitted orphan output, which consumers must ignore."
)


@dataclasses.dataclass(frozen=True)
class OfficeApplication:
    extension: str
    media_kind: str
    application: str
    bundle_id: str
    bundle_path: Path
    collection: str
    full_path_property: str
    required_part: str
    renderer_class: str


APPLICATIONS = {
    ".docx": OfficeApplication(
        extension=".docx",
        media_kind="docx",
        application="Microsoft Word",
        bundle_id="com.microsoft.Word",
        bundle_path=Path("/Applications/Microsoft Word.app"),
        collection="documents",
        full_path_property="posix full name",
        required_part="word/document.xml",
        renderer_class="native-word",
    ),
    ".pptx": OfficeApplication(
        extension=".pptx",
        media_kind="pptx",
        application="Microsoft PowerPoint",
        bundle_id="com.microsoft.Powerpoint",
        bundle_path=Path("/Applications/Microsoft PowerPoint.app"),
        collection="presentations",
        full_path_property="full name",
        required_part="ppt/presentation.xml",
        renderer_class="native-powerpoint",
    ),
}


class NativeOfficeBridgeError(RuntimeError):
    """One stable, phase-bound bridge failure."""

    def __init__(
        self,
        code: str,
        phase: str,
        message: str,
        *,
        retryable: bool = False,
        next_actions: Sequence[str] = (),
        status: str = "failed",
    ) -> None:
        super().__init__(message)
        self.code = code
        self.phase = phase
        self.message = message
        self.retryable = retryable
        self.next_actions = tuple(next_actions)
        self.status = status


@dataclasses.dataclass(frozen=True)
class CommandResult:
    argv: tuple[str, ...]
    redacted_argv: tuple[str, ...]
    timeout_seconds: float
    duration_ms: int
    exit_code: int | None
    stdout: bytes
    stderr: bytes
    timed_out: bool
    script_sha256: str | None = None

    def report(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "argv": list(self.redacted_argv),
            "timeout_seconds": self.timeout_seconds,
            "duration_ms": self.duration_ms,
            "exit_code": self.exit_code,
            "timed_out": self.timed_out,
            "stdout_sha256": _sha256_bytes(self.stdout),
            "stderr_sha256": _sha256_bytes(self.stderr),
        }
        if self.script_sha256 is not None:
            result["script_sha256"] = self.script_sha256
        return result


@dataclasses.dataclass(frozen=True)
class Probe:
    count: int
    read_only: bool | None
    saved: bool | None


@dataclasses.dataclass(frozen=True)
class InputSnapshot:
    sha256: str
    bytes: int
    device: int
    inode: int
    modified_ns: int
    changed_ns: int


CommandRunner = Callable[
    [Sequence[str], Sequence[str], float, bytes | None, str | None],
    CommandResult,
]


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _stat_token(value: os.stat_result) -> tuple[int, int, int, int, int]:
    return (
        value.st_dev,
        value.st_ino,
        value.st_size,
        value.st_mtime_ns,
        value.st_ctime_ns,
    )


def _snapshot_input(path: Path) -> InputSnapshot:
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
    except OSError as exc:
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-UNSAFE",
            "preflight",
            "The trusted input could not be opened as one stable regular file.",
        ) from exc
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode):
            raise NativeOfficeBridgeError(
                "OFFICE-NATIVE-UNSAFE",
                "preflight",
                "The trusted input must be a regular file.",
            )
        digest = hashlib.sha256()
        while True:
            chunk = os.read(descriptor, 1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
        after = os.fstat(descriptor)
    finally:
        os.close(descriptor)
    try:
        current = os.stat(path, follow_symlinks=False)
    except OSError as exc:
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-UNSAFE",
            "preflight",
            "The trusted input changed while it was being inspected.",
        ) from exc
    if _stat_token(before) != _stat_token(after) or (
        current.st_dev,
        current.st_ino,
    ) != (after.st_dev, after.st_ino):
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-UNSAFE",
            "preflight",
            "The trusted input changed while it was being inspected.",
        )
    return InputSnapshot(
        sha256=digest.hexdigest(),
        bytes=after.st_size,
        device=after.st_dev,
        inode=after.st_ino,
        modified_ns=after.st_mtime_ns,
        changed_ns=after.st_ctime_ns,
    )


def _copy_verified_input(
    artifact: Path,
    work_copy: Path,
    expected: InputSnapshot,
) -> None:
    source_flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    destination_flags = (
        os.O_WRONLY
        | os.O_CREAT
        | os.O_EXCL
        | getattr(os, "O_NOFOLLOW", 0)
    )
    source = -1
    destination = -1
    digest = hashlib.sha256()
    try:
        source = os.open(artifact, source_flags)
        before = os.fstat(source)
        if (
            not stat.S_ISREG(before.st_mode)
            or before.st_dev != expected.device
            or before.st_ino != expected.inode
            or before.st_size != expected.bytes
            or before.st_mtime_ns != expected.modified_ns
            or before.st_ctime_ns != expected.changed_ns
        ):
            raise NativeOfficeBridgeError(
                "OFFICE-NATIVE-UNSAFE",
                "copy",
                "The trusted input changed before its work copy was created.",
            )
        destination = os.open(work_copy, destination_flags, 0o600)
        while True:
            chunk = os.read(source, 1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
            view = memoryview(chunk)
            while view:
                written = os.write(destination, view)
                view = view[written:]
        os.fsync(destination)
        after = os.fstat(source)
        copied = os.fstat(destination)
        current = os.stat(artifact, follow_symlinks=False)
        if (
            _stat_token(before) != _stat_token(after)
            or (current.st_dev, current.st_ino)
            != (after.st_dev, after.st_ino)
            or copied.st_size != expected.bytes
            or digest.hexdigest() != expected.sha256
        ):
            raise NativeOfficeBridgeError(
                "OFFICE-NATIVE-UNSAFE",
                "copy",
                "The trusted input changed while its work copy was created.",
            )
    except OSError as exc:
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-UNSAFE",
            "copy",
            "The trusted input could not be copied into the private work area.",
        ) from exc
    finally:
        if source >= 0:
            os.close(source)
        if destination >= 0:
            os.close(destination)
    if digest.hexdigest() != expected.sha256:
        with contextlib.suppress(OSError):
            work_copy.unlink()
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-UNSAFE",
            "copy",
            "The private work copy does not match the inspected input bytes.",
        )


def _canonical_path_key(path: Path) -> str:
    return unicodedata.normalize("NFC", str(path)).casefold()


def _resolved_new_path(path: Path) -> Path:
    parent = path.parent.resolve(strict=True)
    return parent / path.name


def _inside(root: Path, path: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def _relative(root: Path, path: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError as exc:
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-UNSAFE",
            "preflight",
            "A requested path resolves outside the declared repository root.",
        ) from exc


def _prepare_work_root(root: Path) -> Path:
    work_root = root / WORK_DIRECTORY_NAME
    try:
        work_root.mkdir(mode=0o700)
    except FileExistsError:
        pass
    except OSError as exc:
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-UNSAFE",
            "preflight",
            "The private native Office work root could not be created safely.",
        ) from exc
    try:
        metadata = os.lstat(work_root)
        resolved = work_root.resolve(strict=True)
    except OSError as exc:
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-UNSAFE",
            "preflight",
            "The private native Office work root is unavailable.",
        ) from exc
    if (
        stat.S_ISLNK(metadata.st_mode)
        or not stat.S_ISDIR(metadata.st_mode)
        or resolved != work_root
        or work_root.parent != root
        or metadata.st_uid != os.getuid()
    ):
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-UNSAFE",
            "preflight",
            "The private native Office work root must be a real repository-contained directory.",
        )
    try:
        os.chmod(work_root, 0o700)
    except OSError as exc:
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-UNSAFE",
            "preflight",
            "The private native Office work root permissions could not be secured.",
        ) from exc
    return work_root


def _acquire_lock(work_root: Path) -> int:
    lock_path = work_root / "bridge.lock"
    flags = (
        os.O_RDWR
        | os.O_CREAT
        | getattr(os, "O_CLOEXEC", 0)
        | getattr(os, "O_NOFOLLOW", 0)
    )
    try:
        descriptor = os.open(lock_path, flags, 0o600)
        opened = os.fstat(descriptor)
        current = os.lstat(lock_path)
        if (
            not stat.S_ISREG(opened.st_mode)
            or stat.S_ISLNK(current.st_mode)
            or not stat.S_ISREG(current.st_mode)
            or opened.st_dev != current.st_dev
            or opened.st_ino != current.st_ino
            or opened.st_nlink != 1
            or opened.st_uid != os.getuid()
        ):
            raise NativeOfficeBridgeError(
                "OFFICE-NATIVE-UNSAFE",
                "preflight",
                "The repository bridge lock must be one regular non-linked file.",
            )
        os.fchmod(descriptor, 0o600)
        try:
            fcntl.flock(
                descriptor,
                fcntl.LOCK_EX | fcntl.LOCK_NB,
            )
        except BlockingIOError as exc:
            raise NativeOfficeBridgeError(
                "OFFICE-NATIVE-BUSY",
                "preflight",
                "Another native Office lifecycle holds the repository bridge lock.",
                retryable=True,
            ) from exc
        return descriptor
    except NativeOfficeBridgeError:
        if "descriptor" in locals():
            os.close(descriptor)
        raise
    except OSError as exc:
        if "descriptor" in locals():
            os.close(descriptor)
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-UNSAFE",
            "preflight",
            "The repository bridge lock could not be opened safely.",
        ) from exc


def _release_lock(descriptor: int | None) -> None:
    if descriptor is None:
        return
    with contextlib.suppress(OSError):
        fcntl.flock(descriptor, fcntl.LOCK_UN)
    os.close(descriptor)


def _validate_request(
    artifact: Path,
    output: Path,
    report: Path,
    root: Path,
    trusted: bool,
    timeout_seconds: float,
) -> tuple[Path, Path, Path, Path, OfficeApplication]:
    if not trusted:
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-UNSAFE",
            "preflight",
            "Native Office lifecycle requires an explicit trusted-artifact assertion.",
        )
    if not (MIN_TIMEOUT_SECONDS <= timeout_seconds <= MAX_TIMEOUT_SECONDS):
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-UNSAFE",
            "preflight",
            f"Timeout must be between {MIN_TIMEOUT_SECONDS:g} and "
            f"{MAX_TIMEOUT_SECONDS:g} seconds.",
        )
    root = root.resolve(strict=True)
    artifact = artifact.resolve(strict=True)
    output = _resolved_new_path(output)
    report = _resolved_new_path(report)
    if not root.is_dir() or not artifact.is_file():
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-UNSAFE",
            "preflight",
            "Repository root must be a directory and input must be a regular file.",
        )
    if any(not _inside(root, path) for path in (artifact, output, report)):
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-UNSAFE",
            "preflight",
            "Input, output, and report must resolve inside the repository.",
        )
    if output.exists() or report.exists():
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-UNSAFE",
            "preflight",
            "Output and report destinations must not already exist.",
        )
    paths = (artifact, output, report)
    if len({_canonical_path_key(path) for path in paths}) != len(paths):
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-UNSAFE",
            "preflight",
            "Input, output, and report paths must be distinct after conservative normalization.",
        )
    extension = artifact.suffix.lower()
    app = APPLICATIONS.get(extension)
    if app is None or output.suffix.lower() != extension:
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-UNSAFE",
            "preflight",
            "The bridge accepts .docx or .pptx and requires a matching output extension.",
        )
    if artifact.stat().st_size <= 0 or artifact.stat().st_size > MAX_PACKAGE_BYTES:
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-UNSAFE",
            "preflight",
            "Input is empty or exceeds the native lifecycle package limit.",
        )
    for value in (artifact.name, output.name, report.name):
        if any(ord(character) < 0x20 for character in value):
            raise NativeOfficeBridgeError(
                "OFFICE-NATIVE-UNSAFE",
                "preflight",
                "Lifecycle filenames must not contain control characters.",
            )
    return artifact, output, report, root, app


def _application_identity(app: OfficeApplication) -> dict[str, Any]:
    info_path = app.bundle_path / "Contents" / "Info.plist"
    try:
        with info_path.open("rb") as handle:
            info = plistlib.load(handle)
        bundle_id = info.get("CFBundleIdentifier")
        short_version = info.get("CFBundleShortVersionString")
        build_version = info.get("CFBundleVersion")
    except (OSError, plistlib.InvalidFileException):
        bundle_id = None
        short_version = None
        build_version = None
    return {
        "bundle_id": (
            bundle_id
            if isinstance(bundle_id, str) and bundle_id
            else "unknown"
        ),
        "short_version": (
            short_version
            if isinstance(short_version, str) and short_version
            else "unknown"
        ),
        "build_version": (
            build_version
            if isinstance(build_version, str) and build_version
            else "unknown"
        ),
    }


def _run_command(
    argv: Sequence[str],
    redacted_argv: Sequence[str],
    timeout_seconds: float,
    stdin: bytes | None = None,
    script_sha256: str | None = None,
) -> CommandResult:
    started = time.monotonic()
    try:
        completed = subprocess.run(
            list(argv),
            input=stdin,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout_seconds,
            check=False,
        )
        return CommandResult(
            argv=tuple(argv),
            redacted_argv=tuple(redacted_argv),
            timeout_seconds=timeout_seconds,
            duration_ms=round((time.monotonic() - started) * 1000),
            exit_code=completed.returncode,
            stdout=completed.stdout,
            stderr=completed.stderr,
            timed_out=False,
            script_sha256=script_sha256,
        )
    except subprocess.TimeoutExpired as exc:
        return CommandResult(
            argv=tuple(argv),
            redacted_argv=tuple(redacted_argv),
            timeout_seconds=timeout_seconds,
            duration_ms=round((time.monotonic() - started) * 1000),
            exit_code=None,
            stdout=_as_bytes(exc.stdout),
            stderr=_as_bytes(exc.stderr),
            timed_out=True,
            script_sha256=script_sha256,
        )


def _as_bytes(value: bytes | str | None) -> bytes:
    if value is None:
        return b""
    return value if isinstance(value, bytes) else value.encode("utf8", "replace")


def _remaining(deadline: float, cap: float) -> float:
    value = min(cap, deadline - time.monotonic())
    if value <= 0:
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-TIMEOUT",
            "lifecycle",
            "The bounded native Office lifecycle exhausted its deadline.",
            retryable=True,
            next_actions=(
                "Close any Office modal dialog without granting broader file access.",
                "Rerun with a fresh output and report path.",
            ),
        )
    return max(0.1, value)


def _apple_probe_script(app: OfficeApplication) -> str:
    return f"""on exactPathMatch(candidatePath, wantedPath)
considering case, diacriticals
  return candidatePath is equal to wantedPath
end considering
end exactPathMatch

on run argv
set wantedPath to item 1 of argv
set matchCount to 0
set readOnlyValue to false
set savedValue to false
tell application "{app.application}"
  set candidateDocuments to get {app.collection}
  repeat with candidateDocument in candidateDocuments
    try
      set candidatePath to ({app.full_path_property} of candidateDocument) as text
      if my exactPathMatch(candidatePath, wantedPath) then
        set matchCount to matchCount + 1
        set readOnlyValue to (read only of candidateDocument)
        set savedValue to (saved of candidateDocument)
      end if
    end try
  end repeat
end tell
return (matchCount as text) & "|" & (readOnlyValue as text) & "|" & (savedValue as text)
end run
"""


def _apple_save_script(app: OfficeApplication) -> str:
    return f"""on exactPathMatch(candidatePath, wantedPath)
considering case, diacriticals
  return candidatePath is equal to wantedPath
end considering
end exactPathMatch

on run argv
set wantedPath to item 1 of argv
set matchCount to 0
set matchedDocument to missing value
tell application "{app.application}"
  set candidateDocuments to get {app.collection}
  repeat with candidateDocument in candidateDocuments
    try
      set candidatePath to ({app.full_path_property} of candidateDocument) as text
      if my exactPathMatch(candidatePath, wantedPath) then
        set matchCount to matchCount + 1
        set matchedDocument to candidateDocument
      end if
    end try
  end repeat
  if matchCount is not 1 then error "exact-path attachment count is not one" number 1700
  if read only of matchedDocument then error "exact-path work copy is read-only" number 1701
  set saved of matchedDocument to false
  save matchedDocument
  return (saved of matchedDocument) as text
end tell
end run
"""


def _apple_close_script(app: OfficeApplication) -> str:
    saving_value = (
        "do not save changes"
        if app.extension == ".docx"
        else "no"
    )
    return f"""on exactPathMatch(candidatePath, wantedPath)
considering case, diacriticals
  return candidatePath is equal to wantedPath
end considering
end exactPathMatch

on run argv
set wantedPath to item 1 of argv
set matchCount to 0
set matchedDocument to missing value
tell application "{app.application}"
  set candidateDocuments to get {app.collection}
  repeat with candidateDocument in candidateDocuments
    try
      set candidatePath to ({app.full_path_property} of candidateDocument) as text
      if my exactPathMatch(candidatePath, wantedPath) then
        set matchCount to matchCount + 1
        set matchedDocument to candidateDocument
      end if
    end try
  end repeat
  if matchCount is 0 then return "absent"
  if matchCount is not 1 then error "exact-path attachment count is not one" number 1700
  close matchedDocument saving {saving_value}
  return "closed"
end tell
end run
"""


def _run_applescript(
    script: str,
    arguments: Sequence[str],
    timeout_seconds: float,
    runner: CommandRunner,
    label: str,
) -> CommandResult:
    script_bytes = script.encode("utf8")
    argv = ["/usr/bin/osascript", "-", *arguments]
    redacted = ["/usr/bin/osascript", f"<{label}-script>", "<work-copy>"]
    return runner(
        argv,
        redacted,
        timeout_seconds,
        script_bytes,
        _sha256_bytes(script_bytes),
    )


def _parse_probe(result: CommandResult, phase: str) -> Probe:
    if result.timed_out:
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-TIMEOUT",
            phase,
            f"Native Office exact-path {phase} query timed out.",
            retryable=True,
            next_actions=(
                "Dismiss any activation, repair, compatibility, or file-access "
                "dialog without granting broader access.",
                "Rerun with a fresh output and report path.",
            ),
        )
    if result.exit_code != 0:
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-ATTACH",
            phase,
            f"Native Office exact-path {phase} query failed.",
            retryable=True,
            next_actions=(
                "Confirm macOS Automation permission for the invoking terminal or Codex host.",
                "Confirm Office is activated, then rerun without using a file picker.",
            ),
        )
    try:
        text = result.stdout.decode("utf8").strip()
        count_text, read_only_text, saved_text = text.split("|")
        count = int(count_text)
        read_only = _parse_bool(read_only_text) if count == 1 else None
        saved = _parse_bool(saved_text) if count == 1 else None
    except (UnicodeDecodeError, ValueError) as exc:
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-ATTACH",
            phase,
            "Native Office returned an invalid exact-path attachment response.",
        ) from exc
    return Probe(count=count, read_only=read_only, saved=saved)


def _parse_bool(value: str) -> bool:
    if value == "true":
        return True
    if value == "false":
        return False
    raise ValueError(f"invalid AppleScript boolean {value!r}")


def _command_record(
    result: CommandResult,
    *,
    phase: str,
    operation: str,
) -> dict[str, Any]:
    record = result.report()
    record["phase"] = phase
    record["operation"] = operation
    return record


def _run_probe(
    app: OfficeApplication,
    work_copy: Path,
    timeout_seconds: float,
    runner: CommandRunner,
    phase: str,
) -> tuple[CommandResult, Probe]:
    result = _run_applescript(
        _apple_probe_script(app),
        [str(work_copy)],
        timeout_seconds,
        runner,
        "probe",
    )
    return result, _parse_probe(result, phase)


def _probe(
    app: OfficeApplication,
    work_copy: Path,
    timeout_seconds: float,
    runner: CommandRunner,
    commands: list[dict[str, Any]],
    phase: str,
) -> Probe:
    result, probe = _run_probe(
        app,
        work_copy,
        timeout_seconds,
        runner,
        phase,
    )
    commands.append(
        _command_record(result, phase=phase, operation="exact-path-probe")
    )
    return probe


def _poll_record(
    *,
    phase: str,
    expected_count: int,
    attempt_count: int,
    samples: Sequence[CommandResult],
    counts: dict[int, int],
    timed_out_attempts: int,
    outcome: str,
) -> dict[str, Any]:
    return {
        "phase": phase,
        "operation": "exact-path-poll",
        "expected_count": expected_count,
        "attempt_count": attempt_count,
        "observed_counts": {
            str(key): counts[key] for key in sorted(counts)
        },
        "timed_out_attempts": timed_out_attempts,
        "sampled_commands": [
            result.report() for result in samples[:MAX_POLL_COMMAND_SAMPLES]
        ],
        "omitted_attempts": max(0, attempt_count - len(samples)),
        "outcome": outcome,
    }


def _wait_for_probe_count(
    app: OfficeApplication,
    work_copy: Path,
    expected_count: int,
    deadline: float,
    runner: CommandRunner,
    commands: list[dict[str, Any]],
    phase: str,
) -> Probe:
    last = Probe(count=-1, read_only=None, saved=None)
    samples: list[CommandResult] = []
    attempt_count = 0
    counts: dict[int, int] = {}
    timed_out_attempts = 0
    while True:
        remaining = deadline - time.monotonic()
        if remaining < POLL_MIN_REMAINING_SECONDS:
            break
        attempt_timeout = min(POLL_COMMAND_SECONDS, remaining)
        result = _run_applescript(
            _apple_probe_script(app),
            [str(work_copy)],
            attempt_timeout,
            runner,
            "probe",
        )
        attempt_count += 1
        if not samples:
            samples.append(result)
        elif len(samples) < MAX_POLL_COMMAND_SAMPLES:
            samples.append(result)
        else:
            samples[-1] = result
        if result.timed_out:
            timed_out_attempts += 1
            if time.monotonic() < deadline:
                time.sleep(min(POLL_SECONDS, max(0, deadline - time.monotonic())))
            continue
        try:
            last = _parse_probe(result, phase)
        except NativeOfficeBridgeError:
            commands.append(
                _poll_record(
                    phase=phase,
                    expected_count=expected_count,
                    attempt_count=attempt_count,
                    samples=samples,
                    counts=counts,
                    timed_out_attempts=timed_out_attempts,
                    outcome="invalid-response",
                )
            )
            raise
        counts[last.count] = counts.get(last.count, 0) + 1
        if last.count == expected_count:
            commands.append(
                _poll_record(
                    phase=phase,
                    expected_count=expected_count,
                    attempt_count=attempt_count,
                    samples=samples,
                    counts=counts,
                    timed_out_attempts=timed_out_attempts,
                    outcome="matched",
                )
            )
            return last
        if last.count > 1:
            commands.append(
                _poll_record(
                    phase=phase,
                    expected_count=expected_count,
                    attempt_count=attempt_count,
                    samples=samples,
                    counts=counts,
                    timed_out_attempts=timed_out_attempts,
                    outcome="duplicate",
                )
            )
            raise NativeOfficeBridgeError(
                "OFFICE-NATIVE-ATTACH",
                phase,
                "More than one native Office document claims the exact work-copy path.",
            )
        if time.monotonic() < deadline:
            time.sleep(min(POLL_SECONDS, max(0, deadline - time.monotonic())))
    commands.append(
        _poll_record(
            phase=phase,
            expected_count=expected_count,
            attempt_count=attempt_count,
            samples=samples,
            counts=counts,
            timed_out_attempts=timed_out_attempts,
            outcome="deadline",
        )
    )
    if last.count < 0 and timed_out_attempts:
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-TIMEOUT",
            phase,
            f"Native Office exact-path {phase} queries timed out.",
            retryable=True,
            next_actions=(
                "Dismiss any Office modal dialog without granting broader file access.",
                "Rerun with fresh output and report paths.",
            ),
        )
    code = (
        "OFFICE-NATIVE-FILE-ACCESS"
        if expected_count == 1
        else "OFFICE-NATIVE-CLEANUP"
    )
    raise NativeOfficeBridgeError(
        code,
        phase,
        (
            "Launch Services handed off the work copy, but Office did not expose "
            "one exact-path document before the deadline."
            if expected_count == 1
            else "Office did not release the exact work copy before the deadline."
        ),
        retryable=True,
        next_actions=(
            "Cancel any Grant File Access dialog; do not select a broader folder.",
            "Dismiss any activation, repair, or compatibility dialog and rerun.",
        ),
    )


def _open_with_launch_services(
    app: OfficeApplication,
    work_copy: Path,
    timeout_seconds: float,
    runner: CommandRunner,
    commands: list[dict[str, Any]],
) -> None:
    argv = [
        str(SWIFT),
        str(HANDOFF_HELPER),
        str(app.bundle_path),
        str(work_copy),
    ]
    redacted = [
        str(SWIFT),
        "<native-office-handoff>",
        "<office-application>",
        "<work-copy>",
    ]
    result = runner(argv, redacted, timeout_seconds, None, None)
    commands.append(
        _command_record(
            result,
            phase="handoff",
            operation="non-interactive-launch-services-open",
        )
    )
    if result.timed_out:
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-FILE-ACCESS",
            "open",
            "The bounded non-interactive Launch Services handoff did not complete.",
            retryable=True,
            next_actions=(
                "Cancel any Grant File Access dialog; do not select a file or folder.",
                "Rerun with fresh output and report paths.",
            ),
        )
    try:
        response = json.loads(result.stdout.decode("utf8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        response = {}
    if (
        result.exit_code != 0
        or not isinstance(response, dict)
        or response.get("status") != "accepted"
    ):
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-FILE-ACCESS",
            "open",
            "Launch Services declined the exact non-interactive work-copy handoff.",
            retryable=True,
            next_actions=(
                "Confirm the Office application is installed and the input is "
                "a valid trusted artifact.",
                "Do not use a file picker or grant a file or parent directory.",
            ),
        )


def _save_exact_document(
    app: OfficeApplication,
    work_copy: Path,
    timeout_seconds: float,
    runner: CommandRunner,
    commands: list[dict[str, Any]],
) -> None:
    result = _run_applescript(
        _apple_save_script(app),
        [str(work_copy)],
        timeout_seconds,
        runner,
        "save",
    )
    commands.append(
        _command_record(
            result,
            phase="save",
            operation="exact-path-in-place-save",
        )
    )
    if result.timed_out:
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-TIMEOUT",
            "save",
            "Native Office Save timed out.",
            retryable=True,
            next_actions=(
                "Dismiss any Office modal dialog without granting broader file access.",
                "Rerun against a new output path.",
            ),
        )
    if result.exit_code != 0:
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-SAVE",
            "save",
            "Native Office could not save the exact writable work copy.",
            retryable=True,
            next_actions=(
                "Confirm Office is activated and the work copy is not read-only.",
                "Inspect the failure report command digests before rerunning.",
            ),
        )
    try:
        save_returned_saved = _parse_bool(
            result.stdout.decode("utf8").strip()
        )
    except (UnicodeDecodeError, ValueError) as exc:
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-SAVE",
            "save",
            "Native Office returned an invalid post-Save state.",
            retryable=True,
        ) from exc
    if not save_returned_saved:
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-SAVE",
            "save",
            "Native Office completed Save but still reported the document unsaved.",
            retryable=True,
        )


def _close_exact_document(
    app: OfficeApplication,
    work_copy: Path,
    timeout_seconds: float,
    runner: CommandRunner,
    commands: list[dict[str, Any]],
) -> str:
    result = _run_applescript(
        _apple_close_script(app),
        [str(work_copy)],
        timeout_seconds,
        runner,
        "close",
    )
    commands.append(
        _command_record(
            result,
            phase="close",
            operation="exact-path-close-without-save",
        )
    )
    if result.timed_out or result.exit_code != 0:
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-CLEANUP",
            "close",
            "Native Office could not close only the exact work-copy document.",
            retryable=True,
            next_actions=(
                "Close only the named temporary Office document manually if it remains open.",
                "Do not quit Office or close unrelated documents.",
            ),
        )
    try:
        state = result.stdout.decode("utf8").strip()
    except UnicodeDecodeError as exc:
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-CLEANUP",
            "close",
            "Native Office returned an invalid exact-path close response.",
        ) from exc
    if state not in {"closed", "absent"}:
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-CLEANUP",
            "close",
            "Native Office returned an invalid exact-path close response.",
        )
    return state


def _wait_for_quiescence(work_copy: Path, deadline: float) -> dict[str, Any]:
    stable = 0
    previous: tuple[int, str] | None = None
    observations = 0
    while time.monotonic() < deadline:
        try:
            size = work_copy.stat().st_size
            digest = _sha256_file(work_copy) if size > 0 else EMPTY_SHA256
        except OSError:
            size = 0
            digest = EMPTY_SHA256
        observations += 1
        current = (size, digest)
        if size > 0 and current == previous:
            stable += 1
        else:
            stable = 1 if size > 0 else 0
        if stable >= QUIESCENCE_POLLS:
            return {
                "save_size": size,
                "save_sha256": digest,
                "quiescence_observations": observations,
                "quiescence_polls": QUIESCENCE_POLLS,
            }
        previous = current
        time.sleep(QUIESCENCE_INTERVAL_SECONDS)
    raise NativeOfficeBridgeError(
        "OFFICE-NATIVE-SAVE",
        "save",
        "Saved Office bytes did not become non-empty and quiescent before the deadline.",
        retryable=True,
    )


def _validate_package(path: Path, app: OfficeApplication) -> dict[str, Any]:
    try:
        size = path.stat().st_size
    except OSError as exc:
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-PACKAGE",
            "validate",
            "Saved Office package is unavailable.",
        ) from exc
    if size <= 0 or size > MAX_PACKAGE_BYTES:
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-PACKAGE",
            "validate",
            "Saved Office package is empty or exceeds the package limit.",
        )
    try:
        with zipfile.ZipFile(path, "r") as package:
            infos = package.infolist()
            names = [info.filename for info in infos]
            normalized = [_normalized_zip_name(name) for name in names]
            if (
                not infos
                or len(infos) > MAX_PARTS
                or len(set(names)) != len(names)
                or len(set(normalized)) != len(normalized)
                or sum(info.file_size for info in infos)
                > MAX_UNCOMPRESSED_BYTES
            ):
                raise ValueError("unsafe, duplicate, or excessive part inventory")
            for info in infos:
                if (
                    not _safe_zip_name(info.filename)
                    or info.flag_bits & 0x1
                    or info.file_size > MAX_UNCOMPRESSED_BYTES
                ):
                    raise ValueError(f"unsafe package part {info.filename!r}")
            if package.testzip() is not None:
                raise ValueError("CRC validation failed")
            required = {"[Content_Types].xml", app.required_part}
            if not required.issubset(names):
                raise ValueError("required Office package part is missing")
            content_types = package.read("[Content_Types].xml")
            if b"<!DOCTYPE" in content_types.upper():
                raise ValueError("content-types part contains a DTD")
    except (OSError, zipfile.BadZipFile, RuntimeError, ValueError) as exc:
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-PACKAGE",
            "validate",
            "Saved bytes are not a safe CRC-valid Office Open XML package.",
        ) from exc
    return {
        "zip_valid": True,
        "part_count": len(infos),
        "uncompressed_bytes": sum(info.file_size for info in infos),
    }


def _normalized_zip_name(name: str) -> str:
    segments: list[str] = []
    for segment in name.replace("\\", "/").split("/"):
        if segment in {"", "."}:
            continue
        if segment == "..":
            if segments:
                segments.pop()
            else:
                segments.append(segment)
        else:
            segments.append(segment)
    return unicodedata.normalize("NFC", "/".join(segments)).casefold()


def _safe_zip_name(name: str) -> bool:
    path = name[:-1] if name.endswith("/") else name
    return (
        bool(path)
        and not path.startswith("/")
        and re.match(r"^[A-Za-z]:", path) is None
        and "\\" not in path
        and "\x00" not in path
        and all(segment not in {"", ".", ".."} for segment in path.split("/"))
    )


def _diagnostic(error: NativeOfficeBridgeError) -> dict[str, Any]:
    return {
        "code": error.code,
        "phase": error.phase,
        "message": error.message,
        "retryable": error.retryable,
        "next_actions": list(error.next_actions),
    }


def _base_report(
    artifact: Path,
    output: Path,
    root: Path,
    app: OfficeApplication,
    timeout_seconds: float,
    input_snapshot: InputSnapshot,
) -> dict[str, Any]:
    identity = _application_identity(app)
    return {
        "schema": SCHEMA,
        "status": "failed",
        "phase": "preflight",
        "input": {
            "path": _relative(root, artifact),
            "sha256": input_snapshot.sha256,
            "bytes": input_snapshot.bytes,
            "media_kind": app.media_kind,
            "copy_verified": False,
        },
        "application": {
            "name": app.application,
            **identity,
            "renderer_class": app.renderer_class,
        },
        "environment": {
            "operating_system": "macOS",
            "version": platform.mac_ver()[0] or "unknown",
            "architecture": platform.machine() or "unknown",
        },
        "lifecycle": {
            "method": "non-interactive-nsworkspace+applescript",
            "timeout_seconds": timeout_seconds,
            "evidence_scope": "native-no-op-save-lifecycle",
            "representative_editability": "not-tested",
            "visual_fidelity": "not-tested",
            "handoff_attempts": 0,
            "handoff_accepted": 0,
            "exact_path_attachment": False,
            "read_only": None,
            "forced_dirty_save": False,
            "save_event_returned_saved": False,
            "post_save_saved": False,
            "save_quiescent": False,
            "closed_after_save": False,
            "zip_valid": False,
            "reopen_saved": False,
            "reopen_passed": False,
            "open_without_repair": False,
        },
        "commands": [],
        "output": {
            "path": _relative(root, output),
            "published": False,
        },
        "cleanup": {
            "exact_absence_proven": True,
            "work_directory_disposition": "not-created",
        },
        "publication": {
            "commit_marker": "report",
            "pair_committed": False,
            "residual_limit": PUBLICATION_RESIDUAL_LIMIT,
        },
        "diagnostics": [],
    }


def _publish_file_exclusive(source: Path, destination: Path) -> None:
    if destination.exists():
        raise FileExistsError(destination)
    os.link(source, destination)


def _fsync_directory(path: Path) -> None:
    descriptor = os.open(
        path,
        os.O_RDONLY
        | getattr(os, "O_DIRECTORY", 0)
        | getattr(os, "O_CLOEXEC", 0),
    )
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _write_failure_report(report_path: Path, report: dict[str, Any]) -> None:
    report_bytes = (
        json.dumps(report, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    ).encode("utf8")
    with tempfile.NamedTemporaryFile(
        prefix=f".{report_path.name}.",
        suffix=".tmp",
        dir=report_path.parent,
        delete=False,
    ) as handle:
        staged = Path(handle.name)
        handle.write(report_bytes)
        handle.flush()
        os.fsync(handle.fileno())
    try:
        _publish_file_exclusive(staged, report_path)
        _fsync_directory(report_path.parent)
    finally:
        with contextlib.suppress(OSError):
            staged.unlink()


def _publish_success(
    work_copy: Path,
    output: Path,
    report_path: Path,
    report: dict[str, Any],
    before_commit: Callable[[], None] | None = None,
) -> None:
    with tempfile.NamedTemporaryFile(
        prefix=f".{output.name}.",
        suffix=".tmp",
        dir=output.parent,
        delete=False,
    ) as handle:
        staged_output = Path(handle.name)
    with tempfile.NamedTemporaryFile(
        prefix=f".{report_path.name}.",
        suffix=".tmp",
        dir=report_path.parent,
        delete=False,
    ) as handle:
        staged_report = Path(handle.name)
    output_published = False
    report_published = False
    try:
        shutil.copyfile(work_copy, staged_output)
        with staged_output.open("rb") as handle:
            os.fsync(handle.fileno())
        if before_commit is not None:
            before_commit()
        report_bytes = (
            json.dumps(report, indent=2, sort_keys=True, ensure_ascii=False)
            + "\n"
        ).encode("utf8")
        with staged_report.open("wb") as handle:
            handle.write(report_bytes)
            handle.flush()
            os.fsync(handle.fileno())
        _publish_file_exclusive(staged_output, output)
        output_published = True
        _fsync_directory(output.parent)
        _publish_file_exclusive(staged_report, report_path)
        report_published = True
        _fsync_directory(report_path.parent)
    except OSError:
        if report_published:
            with contextlib.suppress(OSError):
                report_path.unlink()
                _fsync_directory(report_path.parent)
        if output_published:
            with contextlib.suppress(OSError):
                output.unlink()
                _fsync_directory(output.parent)
        raise
    finally:
        with contextlib.suppress(OSError):
            staged_output.unlink()
        with contextlib.suppress(OSError):
            staged_report.unlink()


def _app_preflight(app: OfficeApplication) -> None:
    identity = _application_identity(app)
    try:
        helper_metadata = os.lstat(HANDOFF_HELPER)
    except OSError:
        helper_metadata = None
    if (
        sys.platform != "darwin"
        or not Path("/usr/bin/osascript").is_file()
        or not SWIFT.is_file()
        or helper_metadata is None
        or stat.S_ISLNK(helper_metadata.st_mode)
        or not stat.S_ISREG(helper_metadata.st_mode)
        or not app.bundle_path.is_dir()
    ):
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-UNAVAILABLE",
            "preflight",
            "The required macOS Launch Services, osascript, or Office application is unavailable.",
            status="unavailable",
        )
    if (
        identity["bundle_id"] != app.bundle_id
        or identity["short_version"] == "unknown"
        or identity["build_version"] == "unknown"
    ):
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-UNAVAILABLE",
            "preflight",
            "The exact Office bundle identifier, short version, and build version are required.",
            status="unavailable",
        )


def _phase_deadline(lifecycle_deadline: float, cap_seconds: float) -> float:
    return min(lifecycle_deadline, time.monotonic() + cap_seconds)


def _remove_work_directory(work_directory: Path, work_root: Path) -> None:
    try:
        metadata = os.lstat(work_directory)
    except FileNotFoundError:
        return
    except OSError as exc:
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-CLEANUP",
            "cleanup",
            "The exact private work directory could not be inspected for removal.",
        ) from exc
    if (
        stat.S_ISLNK(metadata.st_mode)
        or not stat.S_ISDIR(metadata.st_mode)
        or work_directory.parent != work_root
        or work_root / work_directory.name != work_directory
    ):
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-CLEANUP",
            "cleanup",
            "The exact private work directory failed its removal safety check.",
        )
    try:
        shutil.rmtree(work_directory)
    except OSError as exc:
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-CLEANUP",
            "cleanup",
            "The exact private work directory could not be removed.",
        ) from exc


def run_native_lifecycle(
    artifact: Path,
    *,
    output: Path,
    report_path: Path,
    root: Path,
    trusted: bool,
    timeout_seconds: float = 90.0,
    keep_workdir: bool = False,
    runner: CommandRunner = _run_command,
) -> dict[str, Any]:
    """Run one bounded native no-op-save lifecycle and publish its report."""

    artifact, output, report_path, root, app = _validate_request(
        artifact, output, report_path, root, trusted, timeout_seconds
    )
    input_snapshot = _snapshot_input(artifact)
    if (
        input_snapshot.bytes <= 0
        or input_snapshot.bytes > MAX_PACKAGE_BYTES
    ):
        raise NativeOfficeBridgeError(
            "OFFICE-NATIVE-UNSAFE",
            "preflight",
            "Input is empty or exceeds the native lifecycle package limit.",
        )
    report = _base_report(
        artifact,
        output,
        root,
        app,
        timeout_seconds,
        input_snapshot,
    )
    commands: list[dict[str, Any]] = report["commands"]
    work_root: Path | None = None
    lock_descriptor: int | None = None
    work_directory: Path | None = None
    work_copy: Path | None = None
    office_attached = False
    exact_absence_proven = True
    deadline = time.monotonic() + timeout_seconds
    succeeded = False
    error: NativeOfficeBridgeError | None = None

    try:
        _app_preflight(app)
        work_root = _prepare_work_root(root)
        lock_descriptor = _acquire_lock(work_root)
        work_directory = Path(
            tempfile.mkdtemp(prefix="lifecycle-", dir=work_root)
        )
        work_metadata = os.lstat(work_directory)
        if (
            not stat.S_ISDIR(work_metadata.st_mode)
            or stat.S_ISLNK(work_metadata.st_mode)
            or work_directory.parent != work_root
        ):
            raise NativeOfficeBridgeError(
                "OFFICE-NATIVE-UNSAFE",
                "copy",
                "The private lifecycle directory was not created safely.",
            )
        report["cleanup"] = {
            "exact_absence_proven": True,
            "work_directory": _relative(root, work_directory),
            "work_directory_disposition": "active",
        }
        work_copy = (
            work_directory / f"input-{uuid.uuid4().hex}{app.extension}"
        )
        _copy_verified_input(artifact, work_copy, input_snapshot)
        report["input"]["copy_verified"] = True
        initial_work_sha = _sha256_file(work_copy)

        report["phase"] = "open"
        initial_probe = _probe(
            app,
            work_copy,
            _remaining(deadline, 3.0),
            runner,
            commands,
            "pre-open",
        )
        if initial_probe.count != 0:
            raise NativeOfficeBridgeError(
                "OFFICE-NATIVE-ATTACH",
                "pre-open",
                "The unique work-copy path was already open before handoff.",
            )
        report["lifecycle"]["handoff_attempts"] += 1
        exact_absence_proven = False
        report["cleanup"]["exact_absence_proven"] = False
        _open_with_launch_services(
            app,
            work_copy,
            _remaining(deadline, 20.0),
            runner,
            commands,
        )
        report["lifecycle"]["handoff_accepted"] += 1
        attached = _wait_for_probe_count(
            app,
            work_copy,
            1,
            _phase_deadline(deadline, 15.0),
            runner,
            commands,
            "attach",
        )
        office_attached = True
        report["lifecycle"]["exact_path_attachment"] = True
        report["lifecycle"]["read_only"] = attached.read_only
        if attached.read_only:
            raise NativeOfficeBridgeError(
                "OFFICE-NATIVE-READ-ONLY",
                "attach",
                "Office reports the exact work copy as read-only.",
            )

        report["phase"] = "save"
        _save_exact_document(
            app,
            work_copy,
            _remaining(deadline, 30.0),
            runner,
            commands,
        )
        report["lifecycle"]["forced_dirty_save"] = True
        report["lifecycle"]["save_event_returned_saved"] = True
        post_save = _probe(
            app,
            work_copy,
            _remaining(deadline, 3.0),
            runner,
            commands,
            "post-save",
        )
        if post_save.count != 1 or post_save.saved is not True:
            raise NativeOfficeBridgeError(
                "OFFICE-NATIVE-SAVE",
                "save",
                "The exact document did not remain uniquely attached and saved after Save.",
                retryable=True,
            )
        report["lifecycle"]["post_save_saved"] = True
        save_state = _wait_for_quiescence(
            work_copy,
            _phase_deadline(deadline, 15.0),
        )
        report["lifecycle"]["save_quiescent"] = True
        report["lifecycle"].update(save_state)
        report["lifecycle"]["bytes_changed"] = (
            save_state["save_sha256"] != initial_work_sha
        )

        report["phase"] = "close"
        _close_exact_document(
            app,
            work_copy,
            _remaining(deadline, 8.0),
            runner,
            commands,
        )
        _wait_for_probe_count(
            app,
            work_copy,
            0,
            _phase_deadline(deadline, 8.0),
            runner,
            commands,
            "close",
        )
        office_attached = False
        exact_absence_proven = True
        report["cleanup"]["exact_absence_proven"] = True
        report["lifecycle"]["closed_after_save"] = True

        report["phase"] = "validate"
        package_state = _validate_package(work_copy, app)
        report["lifecycle"].update(package_state)

        report["phase"] = "reopen"
        report["lifecycle"]["handoff_attempts"] += 1
        exact_absence_proven = False
        report["cleanup"]["exact_absence_proven"] = False
        _open_with_launch_services(
            app,
            work_copy,
            _remaining(deadline, 20.0),
            runner,
            commands,
        )
        report["lifecycle"]["handoff_accepted"] += 1
        reopened = _wait_for_probe_count(
            app,
            work_copy,
            1,
            _phase_deadline(deadline, 15.0),
            runner,
            commands,
            "reopen",
        )
        office_attached = True
        if reopened.read_only:
            raise NativeOfficeBridgeError(
                "OFFICE-NATIVE-REOPEN",
                "reopen",
                "The saved package reopened read-only.",
            )
        if reopened.saved is not True:
            raise NativeOfficeBridgeError(
                "OFFICE-NATIVE-REOPEN",
                "reopen",
                "The reopened package did not report a clean saved state.",
                retryable=True,
            )
        report["lifecycle"]["reopen_saved"] = True
        reopen_hash = _sha256_file(work_copy)
        if reopen_hash != save_state["save_sha256"]:
            raise NativeOfficeBridgeError(
                "OFFICE-NATIVE-REOPEN",
                "reopen",
                "The no-save reopen unexpectedly changed the saved package bytes.",
            )
        report["lifecycle"]["reopen_sha256"] = reopen_hash
        _close_exact_document(
            app,
            work_copy,
            _remaining(deadline, 8.0),
            runner,
            commands,
        )
        _wait_for_probe_count(
            app,
            work_copy,
            0,
            _phase_deadline(deadline, 8.0),
            runner,
            commands,
            "reopen-close",
        )
        office_attached = False
        exact_absence_proven = True
        report["cleanup"]["exact_absence_proven"] = True
        report["lifecycle"]["reopen_passed"] = True
        report["lifecycle"]["open_without_repair"] = True

        report["phase"] = "publish"
        output_hash = _sha256_file(work_copy)
        output_size = work_copy.stat().st_size
        report["status"] = "passed"
        report["phase"] = "complete"
        report["output"] = {
            "path": _relative(root, output),
            "published": True,
            "sha256": output_hash,
            "bytes": output_size,
            "media_kind": app.media_kind,
        }
        report["cleanup"]["work_directory_disposition"] = (
            "remove-before-pair-commit"
        )
        report["publication"]["pair_committed"] = True
        report["diagnostics"] = []

        def remove_success_work_directory() -> None:
            if work_directory is None or work_root is None:
                raise NativeOfficeBridgeError(
                    "OFFICE-NATIVE-CLEANUP",
                    "cleanup",
                    "The private success work directory is unavailable.",
                )
            _remove_work_directory(work_directory, work_root)
            report["cleanup"]["work_directory_disposition"] = "removed"

        try:
            _publish_success(
                work_copy,
                output,
                report_path,
                report,
                remove_success_work_directory,
            )
        except OSError as exc:
            raise NativeOfficeBridgeError(
                "OFFICE-NATIVE-PUBLISH",
                "publish",
                "Commit-marker publication of the native Office output/report failed.",
            ) from exc
        succeeded = True
    except NativeOfficeBridgeError as caught:
        error = caught
    except OSError:
        error = NativeOfficeBridgeError(
            "OFFICE-NATIVE-UNSAFE",
            report["phase"],
            "The native Office bridge encountered a bounded local file error.",
        )
    finally:
        if error is not None:
            report["status"] = error.status
            report["phase"] = error.phase
            report["publication"]["pair_committed"] = False
            report["output"]["published"] = False
            report["diagnostics"].append(_diagnostic(error))
        if (
            error is not None
            and office_attached
            and work_copy is not None
        ):
            try:
                _close_exact_document(
                    app,
                    work_copy,
                    min(5.0, max(0.1, deadline - time.monotonic())),
                    runner,
                    commands,
                )
                _wait_for_probe_count(
                    app,
                    work_copy,
                    0,
                    _phase_deadline(deadline, 5.0),
                    runner,
                    commands,
                    "failure-cleanup",
                )
                office_attached = False
                exact_absence_proven = True
            except NativeOfficeBridgeError as cleanup_error:
                report["diagnostics"].append(_diagnostic(cleanup_error))
        report["cleanup"]["exact_absence_proven"] = exact_absence_proven
        if (
            work_directory is not None
            and work_root is not None
            and not (
                succeeded
                and report["cleanup"]["work_directory_disposition"]
                == "removed"
            )
        ):
            should_remove = (
                exact_absence_proven
                and (succeeded or not keep_workdir)
            )
            if should_remove:
                try:
                    _remove_work_directory(work_directory, work_root)
                    report["cleanup"]["work_directory_disposition"] = "removed"
                except NativeOfficeBridgeError as cleanup_error:
                    report["cleanup"]["work_directory_disposition"] = (
                        "preserved-cleanup-failed"
                    )
                    report["diagnostics"].append(_diagnostic(cleanup_error))
            elif not exact_absence_proven:
                report["cleanup"]["work_directory_disposition"] = (
                    "preserved-handoff-not-released"
                )
            else:
                report["cleanup"]["work_directory_disposition"] = (
                    "preserved-by-request"
                )
        if error is not None:
            try:
                _write_failure_report(report_path, report)
            except OSError:
                pass
        _release_lock(lock_descriptor)

    return report


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Bounded native Microsoft Office lifecycle bridge."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    lifecycle = subparsers.add_parser("lifecycle")
    lifecycle.add_argument("artifact", type=Path)
    lifecycle.add_argument("--output", type=Path, required=True)
    lifecycle.add_argument("--report", type=Path, required=True)
    lifecycle.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
    )
    lifecycle.add_argument("--trusted", action="store_true")
    lifecycle.add_argument("--timeout", type=float, default=90.0)
    lifecycle.add_argument("--keep-workdir", action="store_true")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    try:
        report = run_native_lifecycle(
            args.artifact,
            output=args.output,
            report_path=args.report,
            root=args.root,
            trusted=args.trusted,
            timeout_seconds=args.timeout,
            keep_workdir=args.keep_workdir,
        )
    except (NativeOfficeBridgeError, OSError) as error:
        code = (
            error.code
            if isinstance(error, NativeOfficeBridgeError)
            else "OFFICE-NATIVE-PUBLISH"
        )
        print(
            json.dumps(
                {"schema": SCHEMA, "status": "failed", "code": code},
                sort_keys=True,
            )
        )
        return 1
    print(
        json.dumps(
            {
                "schema": SCHEMA,
                "status": report["status"],
                "phase": report["phase"],
                "reportPublished": args.report.exists(),
                "outputPublished": report["output"]["published"],
            },
            sort_keys=True,
        )
    )
    return 0 if report["status"] == "passed" else 2


if __name__ == "__main__":
    raise SystemExit(main())
