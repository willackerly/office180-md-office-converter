#!/usr/bin/env python3
"""Dispatch the Word skill to an authenticated Office180 runtime location."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve()
SKILL_ROOT = SCRIPT_PATH.parents[1]
PLUGIN_ROOT = SCRIPT_PATH.parents[3]
REPOSITORY_ROOT = SCRIPT_PATH.parents[4]
THEME_NAMES = ("neutral", "plum", "marked-docs")
RUNTIMES = {
    "md2docx": ("md2docx.py", "office180-md2docx"),
    "docx2md": ("docx2md.py", "office180-docx2md"),
}


def preferred_python() -> Path:
    for ancestor in SCRIPT_PATH.parents:
        interpreter = ancestor / ".venv" / "bin" / "python"
        if (
            interpreter.is_file()
            and (ancestor / "pyproject.toml").is_file()
            and (ancestor / "md2docx.py").is_file()
            and (ancestor / "docx2md.py").is_file()
        ):
            return interpreter
    return Path(sys.executable)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Run Office180 Markdown/Word conversion from a repository skill, "
            "an installed Office180 plugin, or installed package entry point."
        )
    )
    parser.add_argument("command", choices=tuple(RUNTIMES))
    parser.add_argument(
        "arguments",
        nargs=argparse.REMAINDER,
        help="arguments passed to the selected Office180 converter",
    )
    return parser.parse_args()


def runtime_command(command: str) -> list[str]:
    script_name, executable_name = RUNTIMES[command]
    interpreter = preferred_python()
    candidates = (
        PLUGIN_ROOT / "scripts" / script_name,
        REPOSITORY_ROOT / script_name,
    )
    executable = shutil.which(executable_name)
    for candidate in candidates:
        if candidate.is_file():
            check = subprocess.run(
                [
                    str(interpreter),
                    "-c",
                    (
                        "import docx, sys; "
                        "sys.exit(0 if docx.__version__ == '1.2.0' else 1)"
                    ),
                ],
                check=False,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            if check.returncode == 0:
                return [str(interpreter), str(candidate)]
            if executable is not None:
                return [executable]
            raise SystemExit(
                "The bundled Office180 Word runtime requires exact "
                "python-docx==1.2.0. Install the Office180 Python package "
                "in an isolated environment or use a prepared repository "
                "checkout; the skill will not install dependencies silently."
            )
    if executable is not None:
        return [executable]
    raise SystemExit(
        f"Office180 {command} runtime was not found. Install the Python "
        "package or use the skill from an Office180 repository/plugin checkout."
    )


def theme_path(name: str) -> Path:
    if name not in THEME_NAMES:
        raise SystemExit(
            f"unknown Office180 theme {name!r}; choose {', '.join(THEME_NAMES)}"
        )
    candidates = (
        PLUGIN_ROOT / "assets" / "themes" / f"{name}.json",
        REPOSITORY_ROOT / "themes" / f"{name}.json",
    )
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise SystemExit(
        f"Office180 theme {name!r} was not found in this repository/plugin."
    )


def expand_theme(command: str, arguments: list[str]) -> list[str]:
    expanded: list[str] = []
    index = 0
    while index < len(arguments):
        argument = arguments[index]
        if argument != "--theme":
            expanded.append(argument)
            index += 1
            continue
        if command != "md2docx":
            raise SystemExit("--theme is available only for md2docx")
        if index + 1 >= len(arguments):
            raise SystemExit("--theme requires a bundled theme name")
        expanded.extend(("--template", str(theme_path(arguments[index + 1]))))
        index += 2
    return expanded


def main() -> int:
    args = parse_args()
    command = runtime_command(args.command)
    arguments = expand_theme(args.command, list(args.arguments))
    return subprocess.run([*command, *arguments], check=False).returncode


if __name__ == "__main__":
    raise SystemExit(main())
