#!/usr/bin/env python3
"""Check the skill's deterministic starters and source-kind routing."""

from __future__ import annotations

import importlib.util
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from types import ModuleType


SKILL = Path(__file__).parent.parent
SCRIPTS = SKILL / "scripts"


def run(*arguments: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, *arguments],
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def load_gates() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "pptv_authoring_gates",
        SCRIPTS / "pptv_gates.py",
    )
    require(spec is not None and spec.loader is not None, "cannot load gates")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="pptv-skill-check-") as temporary:
        root = Path(temporary)

        deck = root / "starter.pptv.html"
        result = run(
            str(SCRIPTS / "new_deck.py"),
            str(deck),
            "--title",
            "Minimal PPTV deck",
        )
        require(result.returncode == 0, result.stderr)
        require(
            deck.read_bytes() == (SKILL / "assets" / "starter.pptv.html").read_bytes(),
            "new_deck.py no longer preserves registered starter bytes",
        )

        diagram = root / "starter.pptv.svg"
        result = run(
            str(SCRIPTS / "new_diagram.py"),
            str(diagram),
            "--id",
            "diagram",
            "--title",
            "Minimal PPTV diagram",
        )
        require(result.returncode == 0, result.stderr)
        require(
            diagram.read_bytes() == (SKILL / "assets" / "starter.pptv.svg").read_bytes(),
            "new_diagram.py default output differs from its starter",
        )

        custom = root / "architecture.pptv.svg"
        result = run(
            str(SCRIPTS / "new_diagram.py"),
            str(custom),
            "--id",
            "system.architecture",
            "--title",
            "System & policy",
            "--width",
            "960",
            "--height",
            "640",
        )
        require(result.returncode == 0, result.stderr)
        custom_text = custom.read_text(encoding="utf-8")
        require('viewBox="0 0 960 640"' in custom_text, "custom viewBox missing")
        require("System &amp; policy" in custom_text, "title was not XML escaped")
        parsed = ET.parse(custom).getroot()
        require(parsed.attrib["id"] == "system.architecture", "custom root ID missing")

        invalid = run(
            str(SCRIPTS / "new_diagram.py"),
            str(root / "invalid.pptv.svg"),
            "--id",
            "9-invalid",
            "--title",
            "Invalid",
        )
        require(invalid.returncode != 0, "invalid stable ID was accepted")

        gates = load_gates()
        require(gates.detect_source_kind(deck) == "deck", "deck routing failed")
        require(
            gates.detect_source_kind(diagram) == "diagram",
            "diagram routing failed",
        )
        mismatched = root / "mismatched.pptv.html"
        mismatched.write_bytes(diagram.read_bytes())
        try:
            gates.detect_source_kind(mismatched)
        except SystemExit:
            pass
        else:
            raise SystemExit("suffix/content mismatch was accepted")

    print("PPTV authoring skill self-check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
