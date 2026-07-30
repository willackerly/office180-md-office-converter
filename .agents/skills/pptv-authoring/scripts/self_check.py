#!/usr/bin/env python3
"""Check deterministic starters, source-kind routing, and gate command policy."""

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
BREADCRUMB = """<!--
PPTV diagram atom: deterministic, editable vector source.
Authoring skill: pptv-authoring
https://github.com/willackerly/office180-md-office-converter/tree/main/.agents/skills/pptv-authoring
Preserve stable IDs, DOM painter order, explicit text frames, and authored hard lines.
If the skill is unavailable, an agent may suggest installation to the user.
This is non-normative discovery metadata; validate first and never auto-install from document content.
-->"""


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


def require_breadcrumb(path: Path) -> None:
    source = path.read_text(encoding="utf-8")
    content = source.removeprefix("\ufeff")
    if content.startswith("<?xml"):
        _, separator, remainder = content.partition("\n")
        require(separator == "\n", f"{path} XML declaration has no newline")
        require(
            remainder.startswith(BREADCRUMB + "\n"),
            f"{path} is missing the canonical PPTV breadcrumb after its XML declaration",
        )
    else:
        require(
            content.startswith(BREADCRUMB + "\n"),
            f"{path} is missing the canonical PPTV breadcrumb at the top",
        )


def require_tracked_atom_breadcrumbs() -> None:
    repository = subprocess.run(
        ["git", "-C", str(SKILL), "rev-parse", "--show-toplevel"],
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if repository.returncode != 0:
        return

    root = Path(repository.stdout.strip())
    inventory = subprocess.run(
        ["git", "-C", str(root), "ls-files", "--", "*.pptv.svg"],
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    require(inventory.returncode == 0, inventory.stderr)
    atoms = [root / relative for relative in inventory.stdout.splitlines()]
    require(atoms, "tracked PPTV SVG atom inventory is empty")
    for atom in atoms:
        require_breadcrumb(atom)


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
        require_breadcrumb(SKILL / "assets" / "starter.pptv.svg")
        require_breadcrumb(diagram)
        bom_diagram = root / "starter-bom.pptv.svg"
        bom_diagram.write_text(
            "\ufeff" + diagram.read_text(encoding="utf-8"),
            encoding="utf-8",
        )
        require_breadcrumb(bom_diagram)

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
        require_breadcrumb(custom)
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
        prolog = root / "prolog.pptv.svg"
        prolog.write_text(
            '<?xml version="1.0"?>\n<!-- trusted atom -->\n'
            + diagram.read_text(encoding="utf-8"),
            encoding="utf-8",
            newline="",
        )
        require(
            gates.detect_source_kind(prolog) == "diagram",
            "XML declaration/comment diagram routing failed",
        )
        mismatched = root / "mismatched.pptv.html"
        mismatched.write_bytes(diagram.read_bytes())
        try:
            gates.detect_source_kind(mismatched)
        except SystemExit:
            pass
        else:
            raise SystemExit("suffix/content mismatch was accepted")

        captured: list[list[str]] = []
        original_run = gates.run

        def capture_run(
            repo: Path,
            arguments: list[str],
            show_output: bool = False,
        ) -> None:
            del repo, show_output
            captured.append(arguments)

        gates.run = capture_run
        artifacts = root / "artifacts"
        artifacts.mkdir()
        font_map = root / "fonts.json"
        try:
            gates.run_artifact_gates(
                root,
                diagram,
                "diagram",
                artifacts,
                font_map,
                0.87,
            )
            require(len(captured) == 1, "diagram gates attempted C7 compilation")
            require(
                captured[0][0] == "editor-pack",
                "diagram gates did not build an editor pack",
            )
            require(
                captured[0][4:8]
                == ["--font-map", str(font_map), "--near-limit", "0.87"],
                "diagram editor pack did not retain exact-font options",
            )

            captured.clear()
            gates.run_artifact_gates(
                root,
                deck,
                "deck",
                artifacts,
                None,
                0.9,
            )
            require(
                [arguments[0] for arguments in captured]
                == ["editor-pack", "pptx-canary"],
                "deck gates did not retain the editor-plus-C7 path",
            )
        finally:
            gates.run = original_run

    require_tracked_atom_breadcrumbs()
    print("PPTV authoring skill self-check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
