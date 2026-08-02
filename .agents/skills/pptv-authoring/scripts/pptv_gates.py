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
        help=(
            "retain editor pack and applicable C7/C9 deck, PPTX, and map "
            "outputs in this directory"
        ),
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
    parser.add_argument(
        "--placement",
        help=(
            "for a diagram, retain C9 composition/PPTX/map artifacts using "
            "explicit X,Y,W,H slide placement"
        ),
    )
    parser.add_argument(
        "--placement-policy",
        choices=("identity", "uniform-scale-translate"),
        default="identity",
        help="C9 diagram placement policy (default: identity)",
    )
    parser.add_argument(
        "--slide-id",
        help="optional C9 composed slide ID (default: diagram root ID)",
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
    if remaining.startswith("<?xml"):
        declaration_end = remaining.find("?>")
        if declaration_end < 0:
            raise SystemExit("source begins with an unterminated XML declaration")
        remaining = remaining[declaration_end + 2 :].lstrip()
    while remaining.startswith("<!--"):
        comment_end = remaining.find("-->")
        if comment_end < 0:
            raise SystemExit("source begins with an unterminated comment")
        remaining = remaining[comment_end + 3 :].lstrip()
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
    font_map: Path | None,
    near_limit: float,
    placement: str | None,
    placement_policy: str,
    slide_id: str | None,
) -> None:
    stem = source_stem(source, kind)
    editor_pack = output / f"{stem}.editable.pptv.html"
    artifacts = [editor_pack]
    if kind == "deck":
        artifacts.append(output / f"{stem}.pptx")
    elif placement is not None:
        artifacts.extend(
            [
                output / f"{stem}.composed.pptv.html",
                output / f"{stem}.pptx",
                output / f"{stem}.pptv.map.json",
            ]
        )
    for artifact in artifacts:
        if artifact.exists():
            raise SystemExit(f"refusing to overwrite existing artifact: {artifact}")
    editor_arguments = [
        "editor-pack",
        str(source),
        "--output",
        str(editor_pack),
    ]
    if font_map is not None:
        editor_arguments.extend(
            [
                "--font-map",
                str(font_map),
                "--near-limit",
                str(near_limit),
            ]
        )
    editor_arguments.extend(["--format", "json"])
    run(repo, editor_arguments)
    print(f"writable trusted editor pack: {editor_pack}")
    if kind == "diagram":
        if placement is None:
            print(
                "SKIP C9 PPTX baseline: supply --placement X,Y,W,H; "
                "composition geometry is never inferred."
            )
            return
        common_arguments = [
            str(source),
            "--placement",
            placement,
            "--policy",
            placement_policy,
        ]
        if slide_id is not None:
            common_arguments.extend(["--slide-id", slide_id])
        composed_deck, pptx, sidecar_map = artifacts[1:]
        run(
            repo,
            [
                "compose",
                *common_arguments,
                "--output",
                str(composed_deck),
                "--format",
                "json",
            ],
        )
        print(f"C9 composed deck: {composed_deck}")
        run(
            repo,
            [
                "compile",
                *common_arguments,
                "--output",
                str(pptx),
                "--map",
                str(sidecar_map),
                "--format",
                "json",
            ],
        )
        print(f"C9 mapped PPTX: {pptx}")
        print(f"C9 sidecar map: {sidecar_map}")
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
    if kind == "deck" and args.placement is not None:
        raise SystemExit(
            "--placement is a C9 standalone-diagram option; "
            "HTML decks use their authored 1600 x 900 slide geometry"
        )
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
            run_artifact_gates(
                repo,
                source,
                kind,
                Path(temporary),
                font_map,
                args.near_limit,
                args.placement,
                args.placement_policy,
                args.slide_id,
            )
    else:
        run_artifact_gates(
            repo,
            source,
            kind,
            artifacts_dir,
            font_map,
            args.near_limit,
            args.placement,
            args.placement_policy,
            args.slide_id,
        )

    print("All configured PPTV authoring gates passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
