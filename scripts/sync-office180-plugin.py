#!/usr/bin/env python3
"""Synchronize the installable Office180 plugin from repository authority."""

from __future__ import annotations

import argparse
import shutil
import sys
import tempfile
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
PLUGIN_ROOT = REPO_ROOT / "plugins" / "office180"
SKILL_NAMES = ("markdown-docx", "vector180-authoring")
PYTHON_RUNTIME_FILES = ("md2docx.py", "docx2md.py")
IGNORED_NAMES = {"__pycache__", ".DS_Store"}
IGNORED_SUFFIXES = {".pyc", ".pyo"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Copy canonical Office180 skills, Word converters/themes, and "
            "license into the repository-owned Codex plugin."
        )
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="report drift without modifying the plugin",
    )
    return parser.parse_args()


def ignored(path: Path) -> bool:
    return path.name in IGNORED_NAMES or path.suffix in IGNORED_SUFFIXES


def copy_tree(source: Path, destination: Path) -> None:
    if not source.is_dir():
        raise SystemExit(f"missing canonical directory: {source}")
    for path in sorted(source.rglob("*")):
        if any(ignored(part) for part in (path, *path.parents)):
            continue
        relative = path.relative_to(source)
        target = destination / relative
        if path.is_dir():
            target.mkdir(parents=True, exist_ok=True)
        elif path.is_file():
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)


def stage_expected(root: Path) -> None:
    for skill_name in SKILL_NAMES:
        copy_tree(
            REPO_ROOT / ".agents" / "skills" / skill_name,
            root / "skills" / skill_name,
        )
    copy_tree(REPO_ROOT / "themes", root / "assets" / "themes")
    copy_tree(REPO_ROOT / "themes", root / "scripts" / "themes")
    for filename in PYTHON_RUNTIME_FILES:
        shutil.copy2(REPO_ROOT / filename, root / "scripts" / filename)
    shutil.copy2(REPO_ROOT / "LICENSE", root / "LICENSE")


def inventory(root: Path) -> dict[str, bytes]:
    if not root.exists():
        return {}
    return {
        str(path.relative_to(root)): path.read_bytes()
        for path in sorted(root.rglob("*"))
        if path.is_file() and not ignored(path)
    }


def managed_inventory(root: Path) -> dict[str, bytes]:
    result: dict[str, bytes] = {}
    for skill_name in SKILL_NAMES:
        skill_root = root / "skills" / skill_name
        result.update(
            {
                f"skills/{skill_name}/{name}": contents
                for name, contents in inventory(skill_root).items()
            }
        )
    result.update(
        {
            f"assets/themes/{name}": contents
            for name, contents in inventory(root / "assets" / "themes").items()
        }
    )
    result.update(
        {
            f"scripts/themes/{name}": contents
            for name, contents in inventory(root / "scripts" / "themes").items()
        }
    )
    for filename in PYTHON_RUNTIME_FILES:
        path = root / "scripts" / filename
        if path.is_file():
            result[f"scripts/{filename}"] = path.read_bytes()
    license_path = root / "LICENSE"
    if license_path.is_file():
        result["LICENSE"] = license_path.read_bytes()
    return result


def describe_drift(expected: dict[str, bytes], actual: dict[str, bytes]) -> list[str]:
    messages: list[str] = []
    for path in sorted(expected.keys() - actual.keys()):
        messages.append(f"missing: {path}")
    for path in sorted(actual.keys() - expected.keys()):
        messages.append(f"unexpected: {path}")
    for path in sorted(expected.keys() & actual.keys()):
        if expected[path] != actual[path]:
            messages.append(f"changed: {path}")
    return messages


def replace_managed(expected_root: Path) -> None:
    for skill_name in SKILL_NAMES:
        destination = PLUGIN_ROOT / "skills" / skill_name
        if destination.exists():
            shutil.rmtree(destination)
        shutil.copytree(expected_root / "skills" / skill_name, destination)
    themes_destination = PLUGIN_ROOT / "assets" / "themes"
    if themes_destination.exists():
        shutil.rmtree(themes_destination)
    shutil.copytree(expected_root / "assets" / "themes", themes_destination)
    runtime_themes_destination = PLUGIN_ROOT / "scripts" / "themes"
    if runtime_themes_destination.exists():
        shutil.rmtree(runtime_themes_destination)
    shutil.copytree(
        expected_root / "scripts" / "themes",
        runtime_themes_destination,
    )
    for filename in PYTHON_RUNTIME_FILES:
        shutil.copy2(
            expected_root / "scripts" / filename,
            PLUGIN_ROOT / "scripts" / filename,
        )
    shutil.copy2(expected_root / "LICENSE", PLUGIN_ROOT / "LICENSE")


def main() -> int:
    args = parse_args()
    if not (PLUGIN_ROOT / ".codex-plugin" / "plugin.json").is_file():
        raise SystemExit(f"missing Office180 plugin scaffold: {PLUGIN_ROOT}")

    with tempfile.TemporaryDirectory(prefix="office180-plugin-sync.") as directory:
        expected_root = Path(directory)
        stage_expected(expected_root)
        expected = managed_inventory(expected_root)
        actual = managed_inventory(PLUGIN_ROOT)
        drift = describe_drift(expected, actual)
        if not drift:
            print("Office180 plugin mirrors are synchronized.")
            return 0
        if args.check:
            print("Office180 plugin mirror drift:", file=sys.stderr)
            for message in drift:
                print(f"  {message}", file=sys.stderr)
            return 1
        replace_managed(expected_root)

    print(
        "Synchronized Office180 plugin skills and themes "
        f"({len(drift)} corrected path(s))."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
