#!/usr/bin/env python3
"""Focused tests for CONTRACT:C11-OFFICE-VISUAL-EVIDENCE.1.2."""

from __future__ import annotations

import hashlib
import importlib.util
import io
import json
import plistlib
import sys
import tempfile
import time
import unittest
import zipfile
from contextlib import redirect_stdout
from dataclasses import replace
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "native-office-bridge.py"
SPEC = importlib.util.spec_from_file_location("native_office_bridge", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
bridge = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = bridge
SPEC.loader.exec_module(bridge)


def _package(path: Path, extension: str, marker: str = "base") -> None:
    required = (
        "word/document.xml"
        if extension == ".docx"
        else "ppt/presentation.xml"
    )
    with zipfile.ZipFile(path, "w") as package:
        package.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0"?><Types '
            'xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            "</Types>",
        )
        package.writestr(required, f"<root>{marker}</root>")


def _pptx_package(path: Path, slide_count: int = 2) -> None:
    slide_ids = "".join(
        f'<p:sldId id="{256 + index}" r:id="rId{index + 1}"/>'
        for index in range(slide_count)
    )
    with zipfile.ZipFile(path, "w") as package:
        package.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0"?><Types '
            'xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            "</Types>",
        )
        package.writestr(
            "ppt/presentation.xml",
            '<?xml version="1.0"?>'
            '<p:presentation '
            'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            f"<p:sldIdLst>{slide_ids}</p:sldIdLst>"
            "</p:presentation>",
        )


def _pdf(path: Path, page_count: int = 2) -> None:
    kids = " ".join(f"{3 + index} 0 R" for index in range(page_count))
    objects = [
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        (
            "2 0 obj\n"
            f"<< /Type /Pages /Count {page_count} /Kids [{kids}] >>\n"
            "endobj\n"
        ).encode("ascii"),
    ]
    objects.extend(
        (
            f"{3 + index} 0 obj\n"
            "<< /Type /Page /Parent 2 0 R >>\n"
            "endobj\n"
        ).encode("ascii")
        for index in range(page_count)
    )
    value = bytearray(b"%PDF-1.7\n")
    offsets = [0]
    for object_bytes in objects:
        offsets.append(len(value))
        value.extend(object_bytes)
    xref_offset = len(value)
    value.extend(f"xref\n0 {len(offsets)}\n".encode("ascii"))
    value.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        value.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    value.extend(
        (
            f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\n"
            f"startxref\n{xref_offset}\n%%EOF\n"
        ).encode("ascii")
    )
    path.write_bytes(bytes(value))


def _private_staging_root(root: Path) -> Path:
    staging_root = root / "powerpoint-container-tmp"
    staging_root.mkdir(mode=0o700)
    staging_root.chmod(0o700)
    return staging_root


class FakeOffice:
    def __init__(
        self,
        extension: str,
        *,
        save_return: bool = True,
        post_save_saved: bool = True,
        reopen_saved: bool = True,
        attach_on_handoff: bool = True,
    ) -> None:
        self.extension = extension
        self.open_count = 0
        self.read_only = False
        self.saved = True
        self.save_return = save_return
        self.post_save_saved = post_save_saved
        self.reopen_saved = reopen_saved
        self.attach_on_handoff = attach_on_handoff
        self.handoff_count = 0
        self.commands: list[tuple[str, ...]] = []

    def __call__(
        self,
        argv,
        redacted_argv,
        timeout_seconds,
        stdin,
        script_sha256,
    ):
        self.commands.append(tuple(redacted_argv))
        stdout = b""
        if stdin is None:
            self.handoff_count += 1
            self.open_count = 1 if self.attach_on_handoff else 0
            self.saved = (
                self.reopen_saved if self.handoff_count > 1 else True
            )
            stdout = b'{"status":"accepted"}\n'
        else:
            script = stdin.decode("utf8")
            work_copy = Path(argv[-1])
            if "set saved of matchedDocument to false" in script:
                _package(work_copy, self.extension, marker="native-save")
                self.saved = self.post_save_saved
                stdout = f"{str(self.save_return).lower()}\n".encode()
            elif "close matchedDocument" in script:
                self.open_count = 0
                stdout = b"closed\n"
            else:
                stdout = (
                    f"{self.open_count}|"
                    f"{str(self.read_only).lower()}|"
                    f"{str(self.saved).lower()}\n"
                ).encode()
        return bridge.CommandResult(
            argv=tuple(argv),
            redacted_argv=tuple(redacted_argv),
            timeout_seconds=timeout_seconds,
            duration_ms=1,
            exit_code=0,
            stdout=stdout,
            stderr=b"",
            timed_out=False,
            script_sha256=script_sha256,
        )


class DuplicateAttachOffice(FakeOffice):
    def __call__(self, argv, redacted_argv, timeout_seconds, stdin, script_sha256):
        result = super().__call__(
            argv,
            redacted_argv,
            timeout_seconds,
            stdin,
            script_sha256,
        )
        if stdin is not None and b"matchCount" in stdin:
            script = stdin.decode("utf8")
            if "close matchedDocument" not in script and (
                "set saved of matchedDocument to false" not in script
            ):
                return bridge.CommandResult(
                    argv=result.argv,
                    redacted_argv=result.redacted_argv,
                    timeout_seconds=result.timeout_seconds,
                    duration_ms=1,
                    exit_code=0,
                    stdout=b"2|false|true\n",
                    stderr=b"",
                    timed_out=False,
                    script_sha256=result.script_sha256,
                )
        return result


class FakePowerPointRenderer:
    def __init__(
        self,
        *,
        page_count: int = 2,
        attach_on_handoff: bool = True,
        render_timeout: bool = False,
        invalid_pdf: bool = False,
        mutate_work_copy: bool = False,
        symlink_pdf_target: Path | None = None,
    ) -> None:
        self.page_count = page_count
        self.attach_on_handoff = attach_on_handoff
        self.render_timeout = render_timeout
        self.invalid_pdf = invalid_pdf
        self.mutate_work_copy = mutate_work_copy
        self.symlink_pdf_target = symlink_pdf_target
        self.open_count = 0
        self.commands: list[tuple[str, ...]] = []
        self.raw_commands: list[tuple[str, ...]] = []
        self.handoff_paths: list[Path] = []
        self.handoff_directory_modes: list[int] = []
        self.handoff_file_modes: list[int] = []

    def __call__(
        self,
        argv,
        redacted_argv,
        timeout_seconds,
        stdin,
        script_sha256,
    ):
        self.commands.append(tuple(redacted_argv))
        self.raw_commands.append(tuple(argv))
        stdout = b""
        timed_out = False
        exit_code = 0
        if stdin is None:
            work_copy = Path(argv[-1])
            self.handoff_paths.append(work_copy)
            self.handoff_directory_modes.append(
                work_copy.parent.stat().st_mode & 0o777
            )
            self.handoff_file_modes.append(
                work_copy.stat().st_mode & 0o777
            )
            self.open_count = 1 if self.attach_on_handoff else 0
            stdout = b'{"status":"accepted"}\n'
        else:
            script = stdin.decode("utf8")
            if "save matchedPresentation" in script:
                if self.render_timeout:
                    timed_out = True
                    exit_code = None
                else:
                    private_pdf = Path(argv[-1])
                    work_copy = Path(argv[-2])
                    if self.symlink_pdf_target is not None:
                        private_pdf.symlink_to(self.symlink_pdf_target)
                    elif self.invalid_pdf:
                        private_pdf.write_bytes(b"not-a-pdf")
                    else:
                        _pdf(private_pdf, self.page_count)
                    if self.mutate_work_copy:
                        with work_copy.open("ab") as handle:
                            handle.write(b"changed")
                    stdout = f"exported|{self.page_count}\n".encode()
            elif "close matchedDocument" in script:
                self.open_count = 0
                stdout = b"closed\n"
            else:
                stdout = f"{self.open_count}|false|true\n".encode()
        return bridge.CommandResult(
            argv=tuple(argv),
            redacted_argv=tuple(redacted_argv),
            timeout_seconds=timeout_seconds,
            duration_ms=1,
            exit_code=exit_code,
            stdout=stdout,
            stderr=b"",
            timed_out=timed_out,
            script_sha256=script_sha256,
        )


class NativeOfficeBridgeTests(unittest.TestCase):
    def test_handoff_helper_is_explicitly_non_interactive(self):
        helper = (
            ROOT
            / "scripts"
            / "native-office-handoff.swift"
        ).read_text(encoding="utf8")
        self.assertIn("configuration.promptsUserIfNeeded = false", helper)
        self.assertNotIn("System Events", helper)
        self.assertNotIn("click", helper.lower())

    def test_scripts_attach_by_exact_path_and_never_use_active_document(self):
        for app in bridge.APPLICATIONS.values():
            scripts = [
                bridge._apple_probe_script(app),
                bridge._apple_save_script(app),
                bridge._apple_close_script(app),
            ]
            if app.extension == ".pptx":
                render_script = bridge._apple_render_pdf_script(app)
                scripts.append(render_script)
                self.assertIn("matchedPresentation", render_script)
                self.assertIn("as save as PDF", render_script)
                self.assertNotIn(
                    "set saved of matchedPresentation to false",
                    render_script,
                )
            scripts = tuple(scripts)
            for script in scripts:
                self.assertIn(
                    "considering case, diacriticals",
                    script,
                )
                self.assertIn(
                    "candidatePath is equal to wantedPath",
                    script,
                )
                self.assertNotIn("active document", script.lower())
                self.assertNotIn("activate", script.lower())
                self.assertNotIn("file picker", script.lower())

    def test_request_requires_trust_containment_and_distinct_new_paths(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            artifact = root / "input.docx"
            _package(artifact, ".docx")
            output = root / "output.docx"
            report = root / "report.json"
            with self.assertRaises(bridge.NativeOfficeBridgeError) as raised:
                bridge._validate_request(
                    artifact, output, report, root, False, 90
                )
            self.assertEqual(raised.exception.code, "OFFICE-NATIVE-UNSAFE")

            outside = ROOT.parent / "outside.docx"
            with self.assertRaises(bridge.NativeOfficeBridgeError):
                bridge._validate_request(
                    artifact, outside, report, root, True, 90
                )

            with self.assertRaises(bridge.NativeOfficeBridgeError):
                bridge._validate_request(
                    artifact, artifact, report, root, True, 90
                )

    def test_render_request_requires_pptx_pdf_and_repository_containment(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            artifact = root / "input.pptx"
            _pptx_package(artifact)
            output = root / "output.pdf"
            report = root / "report.json"
            with self.assertRaises(bridge.NativeOfficeBridgeError) as raised:
                bridge._validate_render_request(
                    artifact,
                    output,
                    report,
                    root,
                    False,
                    90,
                )
            self.assertEqual(raised.exception.code, "OFFICE-NATIVE-UNSAFE")

            outside = ROOT.parent / "outside.pdf"
            with self.assertRaises(bridge.NativeOfficeBridgeError):
                bridge._validate_render_request(
                    artifact,
                    outside,
                    report,
                    root,
                    True,
                    90,
                )

            wrong_extension = root / "output.pptx"
            with self.assertRaises(bridge.NativeOfficeBridgeError):
                bridge._validate_render_request(
                    artifact,
                    wrong_extension,
                    report,
                    root,
                    True,
                    90,
                )

    def test_powerpoint_staging_root_rejects_symlink_owner_and_mode_violations(
        self,
    ):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            home = Path(directory)
            staging_root = (
                home / bridge.POWERPOINT_CONTAINER_RELATIVE
            )
            staging_root.mkdir(parents=True)
            staging_root.chmod(0o700)
            app = bridge.APPLICATIONS[".pptx"]
            self.assertEqual(
                bridge._prepare_powerpoint_staging_root(
                    app,
                    home_directory=home,
                ),
                staging_root,
            )

            staging_root.chmod(0o770)
            with self.assertRaises(
                bridge.NativeOfficeBridgeError
            ) as mode_error:
                bridge._prepare_powerpoint_staging_root(
                    app,
                    home_directory=home,
                )
            self.assertEqual(mode_error.exception.code, "OFFICE-NATIVE-UNSAFE")
            staging_root.chmod(0o700)

            with mock.patch.object(
                bridge.os,
                "getuid",
                return_value=bridge.os.getuid() + 1,
            ):
                with self.assertRaises(
                    bridge.NativeOfficeBridgeError
                ) as owner_error:
                    bridge._prepare_powerpoint_staging_root(
                        app,
                        home_directory=home,
                    )
            self.assertEqual(
                owner_error.exception.code,
                "OFFICE-NATIVE-UNSAFE",
            )

            staging_root.rmdir()
            symlink_target = home / "outside"
            symlink_target.mkdir(mode=0o700)
            staging_root.symlink_to(symlink_target, target_is_directory=True)
            with self.assertRaises(
                bridge.NativeOfficeBridgeError
            ) as symlink_error:
                bridge._prepare_powerpoint_staging_root(
                    app,
                    home_directory=home,
                )
            self.assertEqual(
                symlink_error.exception.code,
                "OFFICE-NATIVE-UNSAFE",
            )

    def test_render_staging_creation_rejects_swapped_symlink_ancestor(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            home = Path(directory)
            staging_root = home / bridge.POWERPOINT_CONTAINER_RELATIVE
            staging_root.mkdir(parents=True)
            staging_root.chmod(0o700)
            app = bridge.APPLICATIONS[".pptx"]
            checked_root = bridge._prepare_powerpoint_staging_root(
                app,
                home_directory=home,
            )

            containers = home / "Library" / "Containers"
            checked_containers = home / "Library" / "Containers.checked"
            containers.rename(checked_containers)
            redirect = home / "redirect"
            redirected_root = (
                redirect
                / "com.microsoft.Powerpoint"
                / "Data"
                / "tmp"
            )
            redirected_root.mkdir(parents=True)
            redirected_root.chmod(0o700)
            containers.symlink_to(redirect, target_is_directory=True)

            with self.assertRaises(
                bridge.NativeOfficeBridgeError
            ) as raised:
                bridge._create_render_staging_directory(checked_root)
            self.assertEqual(
                raised.exception.code,
                "OFFICE-NATIVE-UNSAFE",
            )
            self.assertEqual(
                list(redirected_root.glob("office180-render-*")),
                [],
            )

    def test_render_staging_creation_rechecks_ancestor_mode_after_preflight(
        self,
    ):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            home = Path(directory)
            staging_root = home / bridge.POWERPOINT_CONTAINER_RELATIVE
            staging_root.mkdir(parents=True)
            staging_root.chmod(0o700)
            app = bridge.APPLICATIONS[".pptx"]
            checked_root = bridge._prepare_powerpoint_staging_root(
                app,
                home_directory=home,
            )

            containers = home / "Library" / "Containers"
            checked_containers = home / "Library" / "Containers.checked"
            containers.rename(checked_containers)
            checked_root.mkdir(parents=True)
            containers.chmod(0o777)
            checked_root.chmod(0o700)

            with self.assertRaises(
                bridge.NativeOfficeBridgeError
            ) as raised:
                bridge._create_render_staging_directory(checked_root)
            self.assertEqual(
                raised.exception.code,
                "OFFICE-NATIVE-UNSAFE",
            )
            self.assertEqual(
                list(checked_root.glob("office180-render-*")),
                [],
            )

    def test_mocked_powerpoint_pdf_render_is_atomic_and_private(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            artifact = root / "input.pptx"
            output = root / "rendered.pdf"
            report_path = root / "rendered.bridge.json"
            _pptx_package(artifact, slide_count=2)
            original = artifact.read_bytes()
            staging_root = _private_staging_root(root)
            sibling = staging_root / "unrelated-sibling.txt"
            sibling.write_text("preserve", encoding="utf8")
            fake = FakePowerPointRenderer(page_count=2)
            observed_pdf_modes: list[int] = []
            original_remove = bridge._remove_render_staging_directory

            def inspect_then_remove(work_directory, expected_root, app):
                rendered = list(work_directory.glob("render-*.pdf"))
                self.assertEqual(len(rendered), 1)
                observed_pdf_modes.append(
                    rendered[0].stat().st_mode & 0o777
                )
                original_remove(work_directory, expected_root, app)

            with (
                mock.patch.object(
                    bridge,
                    "_app_preflight",
                    return_value=None,
                ),
                mock.patch.object(
                    bridge,
                    "_prepare_powerpoint_staging_root",
                    return_value=staging_root,
                ),
                mock.patch.object(
                    bridge,
                    "_remove_render_staging_directory",
                    side_effect=inspect_then_remove,
                ),
                mock.patch.object(
                    bridge,
                    "QUIESCENCE_INTERVAL_SECONDS",
                    0.001,
                ),
            ):
                report = bridge.run_native_pdf_render(
                    artifact,
                    output=output,
                    report_path=report_path,
                    root=root,
                    trusted=True,
                    timeout_seconds=10,
                    runner=fake,
                )

            self.assertEqual(report["status"], "passed")
            self.assertEqual(report["operation"], "render-pdf")
            self.assertEqual(report["phase"], "complete")
            self.assertTrue(report["render"]["source_package_valid"])
            self.assertTrue(report["render"]["exact_path_attachment"])
            self.assertTrue(
                report["render"]["post_export_exact_path_attachment"]
            )
            self.assertTrue(report["render"]["export_event_completed"])
            self.assertTrue(report["render"]["source_bytes_unchanged"])
            self.assertTrue(report["render"]["closed_without_saving"])
            self.assertTrue(report["render"]["pdf_quiescent"])
            self.assertTrue(report["render"]["pdf_valid"])
            self.assertEqual(report["render"]["source_slide_count"], 2)
            self.assertEqual(report["render"]["native_slide_count"], 2)
            self.assertEqual(report["render"]["expected_page_count"], 2)
            self.assertEqual(report["render"]["pdf_page_count"], 2)
            self.assertTrue(report["render"]["page_count_checked"])
            self.assertTrue(report["render"]["page_count_matches"])
            self.assertEqual(artifact.read_bytes(), original)
            self.assertTrue(output.is_file())
            self.assertTrue(report_path.is_file())
            self.assertEqual(
                report["output"]["sha256"],
                hashlib.sha256(output.read_bytes()).hexdigest(),
            )
            durable = report_path.read_text(encoding="utf8")
            self.assertNotIn(str(root), durable)
            self.assertNotIn(str(Path.home()), durable)
            self.assertTrue(
                json.loads(durable)["publication"]["pair_committed"]
            )
            self.assertEqual(
                report["cleanup"]["work_directory_disposition"],
                "removed",
            )
            self.assertNotIn("work_directory", report["cleanup"])
            self.assertEqual(
                report["render"]["staging_scope"],
                "powerpoint-container-data-tmp",
            )
            self.assertTrue(
                report["render"]["staging_ancestors_validated"]
            )
            self.assertFalse(report["render"]["staging_path_disclosed"])
            self.assertRegex(
                report["render"]["staging_directory_name"],
                r"^office180-render-[0-9a-f]{32}$",
            )
            self.assertEqual(sibling.read_text(encoding="utf8"), "preserve")
            self.assertEqual(
                list(staging_root.glob("office180-render-*")),
                [],
            )
            self.assertEqual(fake.handoff_directory_modes, [0o700])
            self.assertEqual(fake.handoff_file_modes, [0o600])
            self.assertEqual(observed_pdf_modes, [0o600])
            self.assertEqual(len(fake.handoff_paths), 1)
            self.assertEqual(fake.handoff_paths[0].parent.parent, staging_root)
            for command in report["commands"]:
                self.assertNotIn(str(root), json.dumps(command))
            render_commands = [
                command
                for command in report["commands"]
                if command.get("operation")
                == "exact-presentation-save-as-pdf"
            ]
            self.assertEqual(len(render_commands), 1)
            self.assertEqual(
                render_commands[0]["argv"][-2:],
                ["<work-copy>", "<private-output>"],
            )

    def test_mocked_powerpoint_pdf_render_timeout_closes_without_output(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            artifact = root / "input.pptx"
            output = root / "rendered.pdf"
            report_path = root / "rendered.bridge.json"
            _pptx_package(artifact)
            staging_root = _private_staging_root(root)
            fake = FakePowerPointRenderer(render_timeout=True)
            with (
                mock.patch.object(
                    bridge,
                    "_app_preflight",
                    return_value=None,
                ),
                mock.patch.object(
                    bridge,
                    "_prepare_powerpoint_staging_root",
                    return_value=staging_root,
                ),
            ):
                report = bridge.run_native_pdf_render(
                    artifact,
                    output=output,
                    report_path=report_path,
                    root=root,
                    trusted=True,
                    timeout_seconds=10,
                    runner=fake,
                )
            self.assertEqual(report["status"], "failed")
            self.assertEqual(
                report["diagnostics"][0]["code"],
                "OFFICE-NATIVE-TIMEOUT",
            )
            self.assertTrue(report["cleanup"]["exact_absence_proven"])
            self.assertFalse(output.exists())
            self.assertTrue(report_path.exists())

    def test_mocked_powerpoint_invalid_pdf_fails_closed(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            artifact = root / "input.pptx"
            output = root / "rendered.pdf"
            report_path = root / "rendered.bridge.json"
            _pptx_package(artifact)
            staging_root = _private_staging_root(root)
            fake = FakePowerPointRenderer(invalid_pdf=True)
            with (
                mock.patch.object(
                    bridge,
                    "_app_preflight",
                    return_value=None,
                ),
                mock.patch.object(
                    bridge,
                    "_prepare_powerpoint_staging_root",
                    return_value=staging_root,
                ),
                mock.patch.object(
                    bridge,
                    "QUIESCENCE_INTERVAL_SECONDS",
                    0.001,
                ),
            ):
                report = bridge.run_native_pdf_render(
                    artifact,
                    output=output,
                    report_path=report_path,
                    root=root,
                    trusted=True,
                    timeout_seconds=10,
                    runner=fake,
                )
            self.assertEqual(report["status"], "failed")
            self.assertEqual(
                report["diagnostics"][0]["code"],
                "OFFICE-NATIVE-PDF",
            )
            self.assertTrue(report["render"]["source_bytes_unchanged"])
            self.assertFalse(report["render"]["pdf_valid"])
            self.assertFalse(output.exists())
            self.assertTrue(report_path.exists())

    def test_mocked_powerpoint_render_rejects_changed_work_copy(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            artifact = root / "input.pptx"
            output = root / "rendered.pdf"
            report_path = root / "rendered.bridge.json"
            _pptx_package(artifact)
            original = artifact.read_bytes()
            staging_root = _private_staging_root(root)
            fake = FakePowerPointRenderer(mutate_work_copy=True)
            with (
                mock.patch.object(
                    bridge,
                    "_app_preflight",
                    return_value=None,
                ),
                mock.patch.object(
                    bridge,
                    "_prepare_powerpoint_staging_root",
                    return_value=staging_root,
                ),
                mock.patch.object(
                    bridge,
                    "QUIESCENCE_INTERVAL_SECONDS",
                    0.001,
                ),
            ):
                report = bridge.run_native_pdf_render(
                    artifact,
                    output=output,
                    report_path=report_path,
                    root=root,
                    trusted=True,
                    timeout_seconds=10,
                    runner=fake,
                )
            self.assertEqual(report["status"], "failed")
            self.assertEqual(
                report["diagnostics"][0]["code"],
                "OFFICE-NATIVE-RENDER",
            )
            self.assertFalse(report["render"]["source_bytes_unchanged"])
            self.assertEqual(artifact.read_bytes(), original)
            self.assertFalse(output.exists())

    def test_mocked_powerpoint_render_rejects_symlink_pdf_without_touching_target(
        self,
    ):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            artifact = root / "input.pptx"
            output = root / "rendered.pdf"
            report_path = root / "rendered.bridge.json"
            external_pdf = root / "external-sentinel.pdf"
            _pptx_package(artifact)
            _pdf(external_pdf)
            original_external = external_pdf.read_bytes()
            staging_root = _private_staging_root(root)
            sibling = staging_root / "unrelated"
            sibling.write_text("preserve", encoding="utf8")
            fake = FakePowerPointRenderer(
                symlink_pdf_target=external_pdf,
            )
            with (
                mock.patch.object(
                    bridge,
                    "_app_preflight",
                    return_value=None,
                ),
                mock.patch.object(
                    bridge,
                    "_prepare_powerpoint_staging_root",
                    return_value=staging_root,
                ),
                mock.patch.object(
                    bridge,
                    "QUIESCENCE_INTERVAL_SECONDS",
                    0.001,
                ),
            ):
                report = bridge.run_native_pdf_render(
                    artifact,
                    output=output,
                    report_path=report_path,
                    root=root,
                    trusted=True,
                    timeout_seconds=10,
                    runner=fake,
                )
            self.assertEqual(report["status"], "failed")
            self.assertEqual(
                report["diagnostics"][0]["code"],
                "OFFICE-NATIVE-PDF",
            )
            self.assertFalse(output.exists())
            self.assertEqual(external_pdf.read_bytes(), original_external)
            self.assertEqual(sibling.read_text(encoding="utf8"), "preserve")
            self.assertEqual(
                list(staging_root.glob("office180-render-*")),
                [],
            )

    def test_unresolved_render_handoff_preserves_private_work_copy(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            artifact = root / "input.pptx"
            output = root / "rendered.pdf"
            report_path = root / "rendered.bridge.json"
            _pptx_package(artifact)
            staging_root = _private_staging_root(root)
            fake = FakePowerPointRenderer(attach_on_handoff=False)
            original_wait = bridge._wait_for_probe_count

            def refuse_attach(*args, **kwargs):
                phase = args[-1]
                if phase == "attach":
                    raise bridge.NativeOfficeBridgeError(
                        "OFFICE-NATIVE-FILE-ACCESS",
                        "attach",
                        "Non-interactive handoff was not attached.",
                    )
                return original_wait(*args, **kwargs)

            with (
                mock.patch.object(
                    bridge,
                    "_app_preflight",
                    return_value=None,
                ),
                mock.patch.object(
                    bridge,
                    "_prepare_powerpoint_staging_root",
                    return_value=staging_root,
                ),
                mock.patch.object(
                    bridge,
                    "_wait_for_probe_count",
                    side_effect=refuse_attach,
                ),
            ):
                report = bridge.run_native_pdf_render(
                    artifact,
                    output=output,
                    report_path=report_path,
                    root=root,
                    trusted=True,
                    timeout_seconds=10,
                    runner=fake,
                )
            self.assertEqual(report["status"], "failed")
            self.assertEqual(
                report["cleanup"]["work_directory_disposition"],
                "preserved-handoff-not-released",
            )
            self.assertFalse(report["cleanup"]["exact_absence_proven"])
            work_directory = (
                staging_root
                / report["render"]["staging_directory_name"]
            )
            self.assertEqual(len(list(work_directory.glob("*.pptx"))), 1)
            durable = report_path.read_text(encoding="utf8")
            self.assertNotIn(str(staging_root), durable)
            self.assertNotIn(str(Path.home()), durable)
            self.assertFalse(output.exists())

    def test_powerpoint_preflight_rejects_wrong_bundle_identity(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            helper = root / "handoff.swift"
            swift = root / "swift"
            bundle = root / "PowerPoint.app"
            helper.write_text("// helper", encoding="utf8")
            swift.write_text("#!/bin/sh", encoding="utf8")
            bundle.mkdir()
            app = replace(
                bridge.APPLICATIONS[".pptx"],
                bundle_path=bundle,
            )
            original_is_file = Path.is_file

            def is_file(path):
                if str(path) == "/usr/bin/osascript":
                    return True
                return original_is_file(path)

            with (
                mock.patch.object(bridge, "HANDOFF_HELPER", helper),
                mock.patch.object(bridge, "SWIFT", swift),
                mock.patch.object(bridge.sys, "platform", "darwin"),
                mock.patch.object(Path, "is_file", is_file),
                mock.patch.object(
                    bridge,
                    "_application_identity",
                    return_value={
                        "bundle_id": "com.example.WrongApp",
                        "short_version": "1.0",
                        "build_version": "1",
                    },
                ),
            ):
                with self.assertRaises(
                    bridge.NativeOfficeBridgeError
                ) as raised:
                    bridge._app_preflight(app)
            self.assertEqual(
                raised.exception.code,
                "OFFICE-NATIVE-UNAVAILABLE",
            )

    def test_safe_package_validation_and_unsafe_inventory(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            valid = root / "valid.pptx"
            _package(valid, ".pptx")
            result = bridge._validate_package(
                valid, bridge.APPLICATIONS[".pptx"]
            )
            self.assertTrue(result["zip_valid"])
            self.assertEqual(result["part_count"], 2)

            unsafe = root / "unsafe.pptx"
            with zipfile.ZipFile(unsafe, "w") as package:
                package.writestr("[Content_Types].xml", "<Types/>")
                package.writestr("ppt/presentation.xml", "<root/>")
                package.writestr("../escape.xml", "<root/>")
            with self.assertRaises(bridge.NativeOfficeBridgeError) as raised:
                bridge._validate_package(
                    unsafe, bridge.APPLICATIONS[".pptx"]
                )
            self.assertEqual(raised.exception.code, "OFFICE-NATIVE-PACKAGE")

            windows_drive = root / "windows-drive.pptx"
            with zipfile.ZipFile(windows_drive, "w") as package:
                package.writestr("[Content_Types].xml", "<Types/>")
                package.writestr("ppt/presentation.xml", "<root/>")
                package.writestr("C:/escape.xml", "<root/>")
            with self.assertRaises(bridge.NativeOfficeBridgeError):
                bridge._validate_package(
                    windows_drive,
                    bridge.APPLICATIONS[".pptx"],
                )

    def test_mocked_lifecycle_publishes_valid_copy_and_private_report(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            artifact = root / "input.pptx"
            output = root / "native.pptx"
            report_path = root / "native.json"
            _package(artifact, ".pptx")
            original = artifact.read_bytes()
            fake = FakeOffice(".pptx")
            with mock.patch.object(bridge, "_app_preflight", return_value=None):
                report = bridge.run_native_lifecycle(
                    artifact,
                    output=output,
                    report_path=report_path,
                    root=root,
                    trusted=True,
                    timeout_seconds=10,
                    runner=fake,
                )

            self.assertEqual(report["status"], "passed")
            self.assertEqual(report["phase"], "complete")
            self.assertTrue(report["lifecycle"]["reopen_passed"])
            self.assertTrue(report["lifecycle"]["reopen_saved"])
            self.assertTrue(report["lifecycle"]["open_without_repair"])
            self.assertTrue(
                report["lifecycle"]["save_event_returned_saved"]
            )
            self.assertTrue(report["lifecycle"]["post_save_saved"])
            self.assertTrue(report["lifecycle"]["zip_valid"])
            self.assertEqual(
                report["lifecycle"]["evidence_scope"],
                "native-no-op-save-lifecycle",
            )
            self.assertEqual(
                report["lifecycle"]["representative_editability"],
                "not-tested",
            )
            self.assertTrue(output.is_file())
            self.assertTrue(report_path.is_file())
            self.assertEqual(artifact.read_bytes(), original)
            self.assertNotEqual(output.read_bytes(), original)
            self.assertEqual(
                report["output"]["sha256"],
                hashlib.sha256(output.read_bytes()).hexdigest(),
            )
            durable = report_path.read_text(encoding="utf8")
            self.assertNotIn(str(root), durable)
            self.assertNotIn(str(Path.home()), durable)
            self.assertNotIn("native-save", durable)
            parsed = json.loads(durable)
            self.assertEqual(parsed["output"]["path"], "native.pptx")
            self.assertTrue(parsed["publication"]["pair_committed"])
            self.assertEqual(
                parsed["publication"]["commit_marker"],
                "report",
            )
            self.assertEqual(
                parsed["cleanup"]["work_directory_disposition"],
                "removed",
            )
            for command in parsed["commands"]:
                self.assertNotIn(str(root), json.dumps(command))
                if command["operation"] == "exact-path-poll":
                    self.assertLessEqual(
                        len(command["sampled_commands"]),
                        bridge.MAX_POLL_COMMAND_SAMPLES,
                    )
                else:
                    self.assertIn("stdout_sha256", command)
                    self.assertIn("stderr_sha256", command)

    def test_duplicate_exact_attachment_fails_without_output(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            artifact = root / "input.docx"
            output = root / "native.docx"
            report_path = root / "native.json"
            _package(artifact, ".docx")
            fake = DuplicateAttachOffice(".docx")
            with mock.patch.object(bridge, "_app_preflight", return_value=None):
                report = bridge.run_native_lifecycle(
                    artifact,
                    output=output,
                    report_path=report_path,
                    root=root,
                    trusted=True,
                    timeout_seconds=10,
                    runner=fake,
                )
            self.assertEqual(report["status"], "failed")
            self.assertEqual(
                report["diagnostics"][0]["code"], "OFFICE-NATIVE-ATTACH"
            )
            self.assertFalse(output.exists())
            self.assertTrue(report_path.exists())
            self.assertFalse(json.loads(report_path.read_text())["output"]["published"])

    def test_save_requires_true_return_and_true_post_save_probe(self):
        cases = (
            (FakeOffice(".docx", save_return=False), "save_event_returned_saved"),
            (
                FakeOffice(".docx", post_save_saved=False),
                "post_save_saved",
            ),
        )
        for fake, false_field in cases:
            with self.subTest(false_field=false_field):
                with tempfile.TemporaryDirectory(dir=ROOT) as directory:
                    root = Path(directory)
                    artifact = root / "input.docx"
                    _package(artifact, ".docx")
                    output = root / "native.docx"
                    report_path = root / "native.json"
                    with mock.patch.object(
                        bridge,
                        "_app_preflight",
                        return_value=None,
                    ):
                        report = bridge.run_native_lifecycle(
                            artifact,
                            output=output,
                            report_path=report_path,
                            root=root,
                            trusted=True,
                            timeout_seconds=10,
                            runner=fake,
                        )
                    self.assertEqual(report["status"], "failed")
                    self.assertEqual(
                        report["diagnostics"][0]["code"],
                        "OFFICE-NATIVE-SAVE",
                    )
                    self.assertFalse(report["lifecycle"][false_field])
                    self.assertFalse(output.exists())

    def test_reopen_requires_clean_saved_state(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            artifact = root / "input.pptx"
            output = root / "native.pptx"
            report_path = root / "native.json"
            _package(artifact, ".pptx")
            fake = FakeOffice(".pptx", reopen_saved=False)
            with mock.patch.object(
                bridge,
                "_app_preflight",
                return_value=None,
            ):
                report = bridge.run_native_lifecycle(
                    artifact,
                    output=output,
                    report_path=report_path,
                    root=root,
                    trusted=True,
                    timeout_seconds=10,
                    runner=fake,
                )
            self.assertEqual(report["status"], "failed")
            self.assertEqual(
                report["diagnostics"][0]["code"],
                "OFFICE-NATIVE-REOPEN",
            )
            self.assertFalse(report["lifecycle"]["reopen_saved"])
            self.assertFalse(report["lifecycle"]["open_without_repair"])
            self.assertFalse(output.exists())

    def test_accepted_handoff_without_attachment_preserves_work_copy(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            artifact = root / "input.pptx"
            output = root / "native.pptx"
            report_path = root / "native.json"
            _package(artifact, ".pptx")
            fake = FakeOffice(".pptx", attach_on_handoff=False)
            original_wait = bridge._wait_for_probe_count

            def refuse_attach(*args, **kwargs):
                phase = args[-1]
                if phase == "attach":
                    raise bridge.NativeOfficeBridgeError(
                        "OFFICE-NATIVE-FILE-ACCESS",
                        "attach",
                        "Non-interactive handoff was not attached.",
                    )
                return original_wait(*args, **kwargs)

            with (
                mock.patch.object(
                    bridge,
                    "_app_preflight",
                    return_value=None,
                ),
                mock.patch.object(
                    bridge,
                    "_wait_for_probe_count",
                    side_effect=refuse_attach,
                ),
            ):
                report = bridge.run_native_lifecycle(
                    artifact,
                    output=output,
                    report_path=report_path,
                    root=root,
                    trusted=True,
                    timeout_seconds=10,
                    runner=fake,
                )

            self.assertEqual(report["status"], "failed")
            self.assertEqual(
                report["cleanup"]["work_directory_disposition"],
                "preserved-handoff-not-released",
            )
            self.assertFalse(
                report["cleanup"]["exact_absence_proven"],
            )
            work_directory = root / report["cleanup"]["work_directory"]
            self.assertTrue(work_directory.is_dir())
            self.assertEqual(
                len(list(work_directory.glob("*.pptx"))),
                1,
            )

    def test_poll_log_is_collapsed_and_final_absence_is_file_access(self):
        fake = FakeOffice(".pptx", attach_on_handoff=False)
        app = bridge.APPLICATIONS[".pptx"]
        commands = []
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            work_copy = Path(directory) / "input.pptx"
            _package(work_copy, ".pptx")
            with self.assertRaises(
                bridge.NativeOfficeBridgeError
            ) as raised:
                bridge._wait_for_probe_count(
                    app,
                    work_copy,
                    1,
                    time.monotonic() + 0.45,
                    fake,
                    commands,
                    "attach",
                )
        self.assertEqual(
            raised.exception.code,
            "OFFICE-NATIVE-FILE-ACCESS",
        )
        self.assertEqual(len(commands), 1)
        self.assertEqual(commands[0]["operation"], "exact-path-poll")
        self.assertLessEqual(
            len(commands[0]["sampled_commands"]),
            bridge.MAX_POLL_COMMAND_SAMPLES,
        )

    def test_input_copy_rejects_snapshot_race(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            artifact = root / "input.docx"
            work_copy = root / "copy.docx"
            _package(artifact, ".docx", marker="before")
            snapshot = bridge._snapshot_input(artifact)
            _package(artifact, ".docx", marker="after")
            with self.assertRaises(
                bridge.NativeOfficeBridgeError
            ) as raised:
                bridge._copy_verified_input(
                    artifact,
                    work_copy,
                    snapshot,
                )
            self.assertEqual(
                raised.exception.code,
                "OFFICE-NATIVE-UNSAFE",
            )

    def test_work_root_and_lock_reject_symlinks_and_non_regular_files(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            elsewhere = root / "elsewhere"
            elsewhere.mkdir()
            work_root = root / bridge.WORK_DIRECTORY_NAME
            work_root.symlink_to(elsewhere, target_is_directory=True)
            with self.assertRaises(bridge.NativeOfficeBridgeError):
                bridge._prepare_work_root(root)
            work_root.unlink()
            work_root.mkdir()
            lock = work_root / "bridge.lock"
            lock.symlink_to(root / "missing")
            with self.assertRaises(bridge.NativeOfficeBridgeError):
                bridge._acquire_lock(work_root)

    def test_lock_remains_held_through_work_directory_cleanup(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            artifact = root / "input.docx"
            output = root / "native.docx"
            report_path = root / "native.json"
            _package(artifact, ".docx")
            original_remove = bridge._remove_work_directory
            observed_busy = []

            def assert_locked(work_directory, work_root):
                with self.assertRaises(
                    bridge.NativeOfficeBridgeError
                ) as raised:
                    bridge._acquire_lock(work_root)
                observed_busy.append(
                    raised.exception.code == "OFFICE-NATIVE-BUSY"
                )
                original_remove(work_directory, work_root)

            with (
                mock.patch.object(
                    bridge,
                    "_app_preflight",
                    return_value=None,
                ),
                mock.patch.object(
                    bridge,
                    "_remove_work_directory",
                    side_effect=assert_locked,
                ),
            ):
                report = bridge.run_native_lifecycle(
                    artifact,
                    output=output,
                    report_path=report_path,
                    root=root,
                    trusted=True,
                    timeout_seconds=10,
                    runner=FakeOffice(".docx"),
                )
            self.assertEqual(report["status"], "passed")
            self.assertEqual(observed_busy, [True])

    def test_application_identity_includes_short_and_build_versions(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            bundle = Path(directory) / "Word.app"
            contents = bundle / "Contents"
            contents.mkdir(parents=True)
            with (contents / "Info.plist").open("wb") as handle:
                plistlib.dump(
                    {
                        "CFBundleIdentifier": "com.microsoft.Word",
                        "CFBundleShortVersionString": "16.111.2",
                        "CFBundleVersion": "26073101",
                    },
                    handle,
                )
            app = replace(
                bridge.APPLICATIONS[".docx"],
                bundle_path=bundle,
            )
            self.assertEqual(
                bridge._application_identity(app),
                {
                    "bundle_id": "com.microsoft.Word",
                    "short_version": "16.111.2",
                    "build_version": "26073101",
                },
            )

    def test_cli_summary_never_prints_requested_paths(self):
        private_root = Path("/private/example/repository")
        report = {
            "status": "failed",
            "phase": "attach",
            "output": {"published": False},
        }
        stdout = io.StringIO()
        with (
            mock.patch.object(
                bridge,
                "run_native_lifecycle",
                return_value=report,
            ),
            mock.patch.object(Path, "exists", return_value=True),
            redirect_stdout(stdout),
        ):
            exit_code = bridge.main(
                [
                    "lifecycle",
                    str(private_root / "secret.pptx"),
                    "--output",
                    str(private_root / "out.pptx"),
                    "--report",
                    str(private_root / "report.json"),
                    "--root",
                    str(private_root),
                    "--trusted",
                ]
            )
        self.assertEqual(exit_code, 2)
        value = stdout.getvalue()
        self.assertNotIn(str(private_root), value)
        self.assertNotIn("secret.pptx", value)

    def test_render_pdf_cli_dispatches_without_printing_requested_paths(self):
        private_root = Path("/private/example/repository")
        report = {
            "status": "passed",
            "phase": "complete",
            "output": {"published": True},
        }
        stdout = io.StringIO()
        with (
            mock.patch.object(
                bridge,
                "run_native_pdf_render",
                return_value=report,
            ) as render,
            mock.patch.object(Path, "exists", return_value=True),
            redirect_stdout(stdout),
        ):
            exit_code = bridge.main(
                [
                    "render-pdf",
                    str(private_root / "secret.pptx"),
                    "--output",
                    str(private_root / "out.pdf"),
                    "--report",
                    str(private_root / "report.json"),
                    "--root",
                    str(private_root),
                    "--trusted",
                    "--timeout",
                    "30",
                ]
            )
        self.assertEqual(exit_code, 0)
        render.assert_called_once()
        self.assertEqual(
            render.call_args.kwargs["timeout_seconds"],
            30,
        )
        value = stdout.getvalue()
        self.assertNotIn(str(private_root), value)
        self.assertNotIn("secret.pptx", value)

    def test_report_is_the_last_pair_commit_marker_and_rolls_back(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            root = Path(directory)
            work_copy = root / "work.docx"
            output = root / "output.docx"
            report_path = root / "report.json"
            _package(work_copy, ".docx")
            calls = 0
            original_publish = bridge._publish_file_exclusive

            def fail_report_publish(source, destination):
                nonlocal calls
                calls += 1
                if calls == 2:
                    raise OSError("injected report publication failure")
                original_publish(source, destination)

            with mock.patch.object(
                bridge,
                "_publish_file_exclusive",
                side_effect=fail_report_publish,
            ):
                with self.assertRaises(OSError):
                    bridge._publish_success(
                        work_copy,
                        output,
                        report_path,
                        {
                            "publication": {
                                "commit_marker": "report",
                                "pair_committed": True,
                            }
                        },
                    )
            self.assertFalse(output.exists())
            self.assertFalse(report_path.exists())

    def test_report_schema_declares_no_op_evidence_and_commit_marker(self):
        schema = json.loads(
            (
                ROOT
                / "schemas"
                / "native-office-bridge-0.1.schema.json"
            ).read_text(encoding="utf8")
        )
        self.assertEqual(
            schema["properties"]["schema"]["const"],
            bridge.SCHEMA,
        )
        lifecycle = schema["$defs"]["lifecycle"]["properties"]
        self.assertEqual(
            lifecycle["evidence_scope"]["const"],
            "native-no-op-save-lifecycle",
        )
        self.assertEqual(
            lifecycle["representative_editability"]["const"],
            "not-tested",
        )
        render = schema["$defs"]["render"]["properties"]
        self.assertEqual(
            render["evidence_scope"]["const"],
            "native-powerpoint-pdf-render",
        )
        self.assertEqual(
            render["method"]["const"],
            "non-interactive-nsworkspace+applescript-save-as-pdf"
            "+powerpoint-container-staging",
        )
        self.assertEqual(
            render["staging_scope"]["const"],
            "powerpoint-container-data-tmp",
        )
        self.assertFalse(render["staging_path_disclosed"]["const"])
        self.assertEqual(
            render["staging_directory_name"]["pattern"],
            "^office180-render-[0-9a-f]{32}$",
        )
        render_branch = schema["allOf"][0]["oneOf"][1]
        self.assertEqual(
            render_branch["properties"]["cleanup"]["not"]["required"],
            ["work_directory"],
        )
        self.assertIn(
            "pdf",
            schema["$defs"]["output"]["properties"]["media_kind"]["enum"],
        )
        self.assertEqual(
            schema["$defs"]["publication"]["properties"][
                "commit_marker"
            ]["const"],
            "report",
        )


if __name__ == "__main__":
    unittest.main()
