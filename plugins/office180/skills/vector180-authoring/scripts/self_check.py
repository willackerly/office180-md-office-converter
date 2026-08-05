#!/usr/bin/env python3
"""Check Vector180 starters, discovery comments, and gate command policy."""

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
Vector180 atom: deterministic, editable vector source.
Authoring skill: vector180-authoring
https://github.com/willackerly/office180-md-office-converter/tree/main/.agents/skills/vector180-authoring
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
            f"{path} is missing the canonical Vector180 breadcrumb "
            "after its XML declaration",
        )
    else:
        require(
            content.startswith(BREADCRUMB + "\n"),
            f"{path} is missing the canonical Vector180 breadcrumb at the top",
        )


def require_atom_breadcrumbs() -> None:
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
        [
            "git",
            "-C",
            str(root),
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "--",
            "*.vector180.svg",
        ],
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    require(inventory.returncode == 0, inventory.stderr)
    atoms = [
        root / relative
        for relative in inventory.stdout.splitlines()
        if not relative.startswith("manual-tests/")
    ]
    require(atoms, "Vector180 SVG atom inventory is empty")
    for atom in atoms:
        require_breadcrumb(atom)


def load_gates() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "vector180_authoring_gates",
        SCRIPTS / "vector180_gates.py",
    )
    require(spec is not None and spec.loader is not None, "cannot load gates")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> int:
    with tempfile.TemporaryDirectory(
        prefix="vector180-skill-check-"
    ) as temporary:
        root = Path(temporary)

        deck = root / "starter.vector180.html"
        result = run(
            str(SCRIPTS / "new_deck.py"),
            str(deck),
            "--title",
            "Minimal Vector180 deck",
        )
        require(result.returncode == 0, result.stderr)
        require(
            deck.read_bytes()
            == (SKILL / "assets" / "starter.vector180.html").read_bytes(),
            "new_deck.py no longer preserves registered starter bytes",
        )

        atom = root / "starter.vector180.svg"
        result = run(
            str(SCRIPTS / "new_atom.py"),
            str(atom),
            "--id",
            "atom",
            "--title",
            "Minimal Vector180 atom",
        )
        require(result.returncode == 0, result.stderr)
        require(
            atom.read_bytes()
            == (SKILL / "assets" / "starter.vector180.svg").read_bytes(),
            "new_atom.py default output differs from its starter",
        )
        require_breadcrumb(SKILL / "assets" / "starter.vector180.svg")
        require_breadcrumb(atom)

        bom_atom = root / "starter-bom.vector180.svg"
        bom_atom.write_text(
            "\ufeff" + atom.read_text(encoding="utf-8"),
            encoding="utf-8",
        )
        require_breadcrumb(bom_atom)

        custom = root / "architecture.vector180.svg"
        result = run(
            str(SCRIPTS / "new_atom.py"),
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
        require(
            parsed.attrib["data-vector180-version"] == "0.1",
            "canonical version attribute missing",
        )
        require(
            "font-family:ABeeZee" in custom_text,
            "starter does not use the bundled exact default font",
        )
        require(
            "font-weight: 400" in custom_text,
            "starter requests an unavailable default-font weight",
        )
        metadata = parsed.find("{http://www.w3.org/2000/svg}metadata")
        require(metadata is not None, "starter style-family metadata missing")
        require(
            metadata.attrib.get("data-vector180-metadata")
            == "vector180-atom-metadata/0.1",
            "starter metadata schema marker is not canonical",
        )
        require(
            metadata.text
            == '{"styleFamily":{"id":"office180.vector180.default","version":"1.0"}}',
            "starter style-family declaration drifted",
        )
        deck_text = deck.read_text(encoding="utf-8")
        require(
            "application/vnd.office180.vector180+json" in deck_text,
            "deck starter does not use the canonical manifest MIME",
        )

        invalid = run(
            str(SCRIPTS / "new_atom.py"),
            str(root / "invalid.vector180.svg"),
            "--id",
            "9-invalid",
            "--title",
            "Invalid",
        )
        require(invalid.returncode != 0, "invalid stable ID was accepted")

        legacy_suffix = run(
            str(SCRIPTS / "new_atom.py"),
            str(root / "legacy.pptv.svg"),
            "--id",
            "legacy",
            "--title",
            "Legacy",
        )
        require(
            legacy_suffix.returncode != 0,
            "canonical scaffold accepted a legacy PPTV suffix",
        )

        gates = load_gates()
        require(gates.detect_source_kind(deck) == "deck", "deck routing failed")
        require(gates.detect_source_kind(atom) == "atom", "atom routing failed")

        prolog = root / "prolog.vector180.svg"
        prolog.write_text(
            '<?xml version="1.0"?>\n<!-- trusted atom -->\n'
            + atom.read_text(encoding="utf-8"),
            encoding="utf-8",
            newline="",
        )
        require(
            gates.detect_source_kind(prolog) == "atom",
            "XML declaration/comment atom routing failed",
        )

        mismatched = root / "mismatched.vector180.html"
        mismatched.write_bytes(atom.read_bytes())
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
        font_map = str(root / "fonts.json")
        try:
            gates.run_source_gates(root, atom, "atom", font_map, 0.87)
            require(
                [arguments[0] for arguments in captured]
                == [
                    "validate",
                    "resolve",
                    "outline",
                    "metadata",
                    "text",
                    "text-fit",
                ],
                "atom source gates omitted or reordered contracted evidence",
            )

            captured.clear()
            gates.run_source_gates(root, deck, "deck", "default", 0.9)
            require(
                [arguments[0] for arguments in captured]
                == ["validate", "resolve", "outline", "text", "text-fit"],
                "deck source gates requested atom-only metadata",
            )
            require(
                captured[-1][2:4] == ["--font-map", "default"],
                "deck source gates did not use the verified default font map",
            )

            captured.clear()
            gates.run_artifact_gates(
                root,
                atom,
                "atom",
                artifacts,
                font_map,
                0.87,
                None,
                "identity",
                None,
            )
            require(len(captured) == 1, "atom gates inferred placement")
            require(
                captured[0][0] == "editor-pack",
                "atom gates did not build an editor pack",
            )
            require(
                captured[0][4:8]
                == ["--font-map", font_map, "--near-limit", "0.87"],
                "editor pack did not retain exact-font options",
            )

            captured.clear()
            gates.run_artifact_gates(
                root,
                atom,
                "atom",
                artifacts,
                font_map,
                0.87,
                "0,0,1200,800",
                "identity",
                "atom.slide",
            )
            require(
                [arguments[0] for arguments in captured]
                == ["editor-pack", "compose", "compile"],
                "atom gates did not retain editor/compose/compile path",
            )
            require("--map" in captured[2], "compile omitted sidecar map")

            captured.clear()
            gates.run_artifact_gates(
                root,
                deck,
                "deck",
                artifacts,
                "default",
                0.9,
                None,
                "identity",
                None,
            )
            require(
                [arguments[0] for arguments in captured]
                == ["editor-pack", "pptx-canary"],
                "deck gates did not retain editor/canary path",
            )
            require(
                captured[0][4:8]
                == ["--font-map", "default", "--near-limit", "0.9"],
                "deck editor pack did not use the verified default font map",
            )
        finally:
            gates.run = original_run

    require_atom_breadcrumbs()
    print("Vector180 authoring skill self-check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
