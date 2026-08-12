#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Installed-package acceptance for the two Python console entry points."""

import importlib.metadata
import os
import subprocess
import sys
import sysconfig
import tempfile
import traceback
from pathlib import Path


PROJECT_NAME = "office180-md-office-converter"
PROJECT_VERSION = "0.2.0"
REPO_ROOT = Path(__file__).resolve().parent.parent
ENTRY_POINTS = {
    "office180-md2docx": "md2docx:main",
    "office180-docx2md": "docx2md:main",
}


def _entry_point_path(name):
    suffix = ".exe" if os.name == "nt" else ""
    return Path(sysconfig.get_path("scripts")) / f"{name}{suffix}"


def _run(command):
    result = subprocess.run(
        [str(part) for part in command],
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert result.returncode == 0, (
        f"{' '.join(str(part) for part in command)} failed "
        f"with exit {result.returncode}\n"
        f"stdout:\n{result.stdout}\n"
        f"stderr:\n{result.stderr}"
    )
    return result


def test_installed_metadata_and_entry_points():
    distribution = importlib.metadata.distribution(PROJECT_NAME)
    assert distribution.version == PROJECT_VERSION
    assert distribution.metadata["Requires-Python"] == ">=3.9"
    assert "python-docx==1.2.0" in (distribution.requires or ())

    installed = {
        entry.name: entry.value
        for entry in distribution.entry_points
        if entry.group == "console_scripts"
    }
    assert installed == ENTRY_POINTS


def test_installed_and_direct_help():
    for name in ENTRY_POINTS:
        installed = _entry_point_path(name)
        assert installed.is_file(), f"missing installed entry point: {installed}"
        result = _run([installed, "--help"])
        assert "usage:" in result.stdout.lower()

    for script in ("md2docx.py", "docx2md.py"):
        result = _run([sys.executable, REPO_ROOT / script, "--help"])
        assert "usage:" in result.stdout.lower()


def test_installed_console_round_trip():
    with tempfile.TemporaryDirectory(prefix="office180-python-package-") as temporary:
        root = Path(temporary)
        source = root / "source.md"
        document = root / "source.docx"
        recovered = root / "recovered.md"
        canonical = "# Package smoke\n\nA deterministic paragraph.\n"
        source.write_text(canonical, encoding="utf-8")

        _run([
            _entry_point_path("office180-md2docx"),
            source,
            "--out",
            document,
        ])
        assert document.is_file()

        _run([
            _entry_point_path("office180-docx2md"),
            document,
            "--out",
            recovered,
        ])
        assert recovered.read_text(encoding="utf-8") == canonical


def main():
    tests = [
        (name, function)
        for name, function in sorted(globals().items())
        if name.startswith("test_") and callable(function)
    ]
    failures = []
    for name, function in tests:
        try:
            function()
        except Exception:
            failures.append(name)
            print(f"FAIL {name}")
            traceback.print_exc()
        else:
            print(f"PASS {name}")

    print()
    print(f"{len(tests) - len(failures)}/{len(tests)} passed")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
