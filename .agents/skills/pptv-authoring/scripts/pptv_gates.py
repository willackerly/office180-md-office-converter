#!/usr/bin/env python3
"""Run strict PPTV deck or diagram gates with optional artifact retention."""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Literal


SourceKind = Literal["deck", "diagram"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument(
        "--repo",
        type=Path,
        required=True,
        help="office180-md-office-converter checkout",
    )
    parser.add_argument(
        "--artifacts-dir",
        type=Path,
        help="retain editor-pack and PPTX outputs in this directory",
    )
    parser.add_argument(
        "--font-map",
        type=Path,
        help="run exact-font C8 text-fit with this explicit font map",
    )
    parser.add_argument(
        "--near-limit",
        type=float,
        default=0.9,
        help="C8 warning threshold (default: 0.9)",
    )
    return parser.parse_args()


def run(repo: Path, arguments: list[str], show_output: bool = False) -> None:
    command = ["pnpm", "--silent", "pptv", *arguments]
    print("+", " ".join(command), flush=True)
    result = subprocess.run(
        command,
        cwd=repo,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        if result.stdout:
            sys.stdout.write(result.stdout)
        if result.stderr:
            sys.stderr.write(result.stderr)
        raise SystemExit(result.returncode)
    if show_output and result.stdout:
        sys.stdout.write(result.stdout)
    if show_output and result.stderr:
        sys.stderr.write(result.stderr)
    print("PASS", flush=True)


def source_suffix_kind(source: Path) -> SourceKind:
    suffixes = [suffix.lower() for suffix in source.suffixes[-2:]]
    if suffixes == [".pptv", ".html"]:
        return "deck"
    if suffixes == [".pptv", ".svg"]:
        return "diagram"
    raise SystemExit("source must end in .pptv.html or .pptv.svg")


def content_kind(source: Path) -> SourceKind:
    text = source.read_text(encoding="utf-8")
    remaining = text.removeprefix("\ufeff").lstrip()
    while remaining.startswith("<!--"):
        comment_end = remaining.find("-->")
        if comment_end < 0:
            raise SystemExit("source begins with an unterminated comment")
        remaining = remaining[comment_end + 3 :].lstrip()
    if remaining.startswith("<?xml"):
        declaration_end = remaining.find("?>")
        if declaration_end < 0:
            raise SystemExit("source begins with an unterminated XML declaration")
        remaining = remaining[declaration_end + 2 :].lstrip()
    lowered = remaining.lower()
    if re.match(r"<svg(?:\s|>)", lowered):
        return "diagram"
    if lowered.startswith("<!doctype html") or re.match(
        r"<html(?:\s|>)",
        lowered,
    ):
        return "deck"
    raise SystemExit("source content is not a PPTV HTML deck or standalone SVG")


def detect_source_kind(source: Path) -> SourceKind:
    suffix_kind = source_suffix_kind(source)
    detected_kind = content_kind(source)
    if suffix_kind != detected_kind:
        raise SystemExit(
            f"source suffix selects {suffix_kind}, but content is {detected_kind}"
        )
    return detected_kind


def source_stem(source: Path, kind: SourceKind) -> str:
    suffix = ".pptv.html" if kind == "deck" else ".pptv.svg"
    return source.name[: -len(suffix)]


def run_artifact_gates(
    repo: Path,
    source: Path,
    kind: SourceKind,
    output: Path,
) -> None:
    stem = source_stem(source, kind)
    editor_pack = output / f"{stem}.editable.pptv.html"
    artifacts = [editor_pack]
    if kind == "deck":
        artifacts.append(output / f"{stem}.pptx")
    for artifact in artifacts:
        if artifact.exists():
            raise SystemExit(f"refusing to overwrite existing artifact: {artifact}")
    run(
        repo,
        [
            "editor-pack",
            str(source),
            "--output",
            str(editor_pack),
            "--format",
            "json",
        ],
    )
    print(f"editor pack: {editor_pack}")
    if kind == "diagram":
        print(
            "SKIP PPTX canary: standalone PPTV diagrams are not C7 "
            "presentation inputs."
        )
        return

    pptx = artifacts[1]
    run(
        repo,
        [
            "pptx-canary",
            str(source),
            "--output",
            str(pptx),
            "--format",
            "json",
        ],
    )
    print(f"PPTX canary: {pptx}")


def main() -> int:
    args = parse_args()
    repo = args.repo.expanduser().resolve()
    source = args.source.expanduser().resolve()
    if not (repo / "package.json").is_file():
        raise SystemExit(f"not a PPTV tool repository: {repo}")
    if not source.is_file():
        raise SystemExit(f"PPTV source does not exist: {source}")
    kind = detect_source_kind(source)
    artifacts_dir = (
        None
        if args.artifacts_dir is None
        else args.artifacts_dir.expanduser().resolve()
    )
    if artifacts_dir is not None:
        if artifacts_dir.exists() and not artifacts_dir.is_dir():
            raise SystemExit(f"artifacts path is not a directory: {artifacts_dir}")
        artifacts_dir.mkdir(parents=True, exist_ok=True)
    if not 0 < args.near_limit < 1:
        raise SystemExit("--near-limit must be greater than 0 and less than 1")
    font_map = (
        None if args.font_map is None else args.font_map.expanduser().resolve()
    )
    if font_map is not None and not font_map.is_file():
        raise SystemExit(f"font map does not exist: {font_map}")

    run(repo, ["validate", str(source), "--format", "json"])
    run(repo, ["resolve", str(source), "--format", "text"])
    run(repo, ["outline", str(source), "--format", "json"])
    run(repo, ["text", str(source), "--format", "jsonl"])
    if font_map is None:
        print("SKIP text-fit: supply --font-map for exact-font evidence.")
    else:
        run(
            repo,
            [
                "text-fit",
                str(source),
                "--font-map",
                str(font_map),
                "--near-limit",
                str(args.near_limit),
                "--format",
                "text",
            ],
            show_output=True,
        )

    if artifacts_dir is None:
        with tempfile.TemporaryDirectory(prefix="pptv-gates-") as temporary:
            run_artifact_gates(repo, source, kind, Path(temporary))
    else:
        run_artifact_gates(repo, source, kind, artifacts_dir)

    print("All configured PPTV authoring gates passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
