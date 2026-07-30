#!/usr/bin/env python3
"""Create a PPTV deck from the skill's registered-runtime starter."""

from __future__ import annotations

import argparse
import html
import json
from pathlib import Path


STARTER_TITLE = "Minimal PPTV deck"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    parser.add_argument("--title", required=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    output = args.output.expanduser().resolve()
    if output.suffixes[-2:] != [".pptv", ".html"]:
        raise SystemExit("output must end in .pptv.html")
    if output.exists():
        raise SystemExit(f"refusing to overwrite existing file: {output}")
    if not output.parent.is_dir():
        raise SystemExit(f"output directory does not exist: {output.parent}")

    starter = Path(__file__).parent.parent / "assets" / "starter.pptv.html"
    source = starter.read_text(encoding="utf-8")
    title_html = html.escape(args.title, quote=False)
    title_json = (
        json.dumps(args.title, ensure_ascii=False)[1:-1]
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("&", "\\u0026")
    )

    replacements = {
        f"<title>{STARTER_TITLE}</title>": f"<title>{title_html}</title>",
        f'"title": "{STARTER_TITLE}"': f'"title": "{title_json}"',
        f">{STARTER_TITLE}</text>": f">{title_html}</text>",
    }
    for old, new in replacements.items():
        if source.count(old) != 1:
            raise SystemExit(f"starter invariant failed for {old!r}")
        source = source.replace(old, new)

    output.write_text(source, encoding="utf-8", newline="")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
