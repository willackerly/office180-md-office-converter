#!/usr/bin/env python3
"""Create a standalone PPTV diagram from the skill's strict SVG starter."""

from __future__ import annotations

import argparse
import html
import re
from pathlib import Path


STARTER_ID = "diagram"
STARTER_TITLE = "Minimal PPTV diagram"
STARTER_WIDTH = 1200
STARTER_HEIGHT = 800
STABLE_ID_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9._:-]{0,127}$")


def canvas_dimension(value: str) -> int:
    try:
        parsed = int(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("must be an integer") from error
    if parsed < 64:
        raise argparse.ArgumentTypeError("must be at least 64")
    return parsed


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    parser.add_argument("--id", required=True, dest="diagram_id")
    parser.add_argument("--title", required=True)
    parser.add_argument("--width", type=canvas_dimension, default=STARTER_WIDTH)
    parser.add_argument("--height", type=canvas_dimension, default=STARTER_HEIGHT)
    return parser.parse_args()


def layout(width: int, height: int) -> dict[str, int]:
    shortest = min(width, height)
    margin = max(4, shortest // 20)
    font_size = max(8, min(64, shortest // 12))
    line_step = round(font_size * 1.2)
    frame_height = line_step * 2
    return {
        "margin": margin,
        "font_size": font_size,
        "line_step": line_step,
        "frame_width": width - 2 * margin,
        "frame_height": frame_height,
        "baseline": margin + font_size,
    }


def replace_once(source: str, old: str, new: str) -> str:
    if source.count(old) != 1:
        raise SystemExit(f"starter invariant failed for {old!r}")
    return source.replace(old, new)


def main() -> int:
    args = parse_args()
    output = args.output.expanduser().resolve()
    if [suffix.lower() for suffix in output.suffixes[-2:]] != [
        ".pptv",
        ".svg",
    ]:
        raise SystemExit("output must end in .pptv.svg")
    if output.exists():
        raise SystemExit(f"refusing to overwrite existing file: {output}")
    if not output.parent.is_dir():
        raise SystemExit(f"output directory does not exist: {output.parent}")
    if STABLE_ID_PATTERN.fullmatch(args.diagram_id) is None:
        raise SystemExit(
            "--id must start with a letter, contain only letters, digits, "
            "dot, underscore, colon, or hyphen, and be at most 128 characters"
        )
    if not args.title.strip():
        raise SystemExit("--title must not be empty")

    values = layout(args.width, args.height)
    starter = Path(__file__).parent.parent / "assets" / "starter.pptv.svg"
    source = starter.read_text(encoding="utf-8")
    title_xml = html.escape(args.title, quote=False)

    id_marker = f'id="{STARTER_ID}'
    if source.count(id_marker) != 3:
        raise SystemExit(f"starter invariant failed for {id_marker!r}")
    source = source.replace(id_marker, f'id="{args.diagram_id}')
    source = replace_once(
        source,
        f"<title>{STARTER_TITLE}</title>",
        f"<title>{title_xml}</title>",
    )
    source = replace_once(
        source,
        f">{STARTER_TITLE}</text>",
        f">{title_xml}</text>",
    )
    source = replace_once(
        source,
        f'viewBox="0 0 {STARTER_WIDTH} {STARTER_HEIGHT}"',
        f'viewBox="0 0 {args.width} {args.height}"',
    )
    source = replace_once(
        source,
        f'width="{STARTER_WIDTH}" height="{STARTER_HEIGHT}"',
        f'width="{args.width}" height="{args.height}"',
    )
    source = replace_once(
        source,
        'data-pptv-frame="40 40 1120 154"',
        (
            'data-pptv-frame="'
            f'{values["margin"]} {values["margin"]} '
            f'{values["frame_width"]} {values["frame_height"]}"'
        ),
    )
    source = replace_once(
        source,
        'data-pptv-line-step="77"',
        f'data-pptv-line-step="{values["line_step"]}"',
    )
    source = replace_once(
        source,
        'x="40" y="104"',
        f'x="{values["margin"]}" y="{values["baseline"]}"',
    )
    source = replace_once(
        source,
        "font-size:64px",
        f'font-size:{values["font_size"]}px',
    )

    output.write_text(source, encoding="utf-8", newline="")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
