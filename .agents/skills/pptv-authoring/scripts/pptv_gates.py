#!/usr/bin/env python3
"""Run strict PPTV authoring gates with optional artifact retention."""

from __future__ import annotations

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("deck", type=Path)
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


def run_artifact_gates(repo: Path, deck: Path, output: Path) -> None:
    stem = deck.name.removesuffix(".pptv.html")
    editor_pack = output / f"{stem}.editable.pptv.html"
    pptx = output / f"{stem}.pptx"
    for artifact in (editor_pack, pptx):
        if artifact.exists():
            raise SystemExit(f"refusing to overwrite existing artifact: {artifact}")
    run(
        repo,
        [
            "editor-pack",
            str(deck),
            "--output",
            str(editor_pack),
            "--format",
            "json",
        ],
    )
    run(
        repo,
        [
            "pptx-canary",
            str(deck),
            "--output",
            str(pptx),
            "--format",
            "json",
        ],
    )
    print(f"editor pack: {editor_pack}")
    print(f"PPTX canary: {pptx}")


def main() -> int:
    args = parse_args()
    repo = args.repo.expanduser().resolve()
    deck = args.deck.expanduser().resolve()
    if not (repo / "package.json").is_file():
        raise SystemExit(f"not a PPTV tool repository: {repo}")
    if not deck.is_file():
        raise SystemExit(f"deck does not exist: {deck}")
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

    run(repo, ["validate", str(deck), "--format", "json"])
    run(repo, ["resolve", str(deck), "--format", "text"])
    run(repo, ["outline", str(deck), "--format", "json"])
    run(repo, ["text", str(deck), "--format", "jsonl"])
    if font_map is None:
        print("SKIP text-fit: supply --font-map for exact-font evidence.")
    else:
        run(
            repo,
            [
                "text-fit",
                str(deck),
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
            run_artifact_gates(repo, deck, Path(temporary))
    else:
        run_artifact_gates(repo, deck, artifacts_dir)

    print("All configured PPTV authoring gates passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
