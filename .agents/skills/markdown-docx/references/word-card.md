# Office180 Word card

Use this page for ordinary Markdown-first Word production.

## Authority

- Canonical `*.md` is source authority.
- Generated `*.docx` is a styled review/edit branch.
- Every generated DOCX embeds exact original and canonical Markdown as an
  internal merge base.
- Internal provenance proves package consistency, not who sent the file.

## Supported Markdown

| Construct | Canonical spelling |
| --- | --- |
| Headings | ATX `#` through `####` |
| Paragraph | soft source lines join; blank line separates blocks |
| Bullet | flat `- item` |
| Numbered item | flat literal `1. item` text |
| Table | one consistent pipe table; first row is the header |
| Code block | unlabelled triple-backtick fence |
| Inline | separate `**bold**`, `*italic*`, and single-backtick code |
| Link | deterministic print-friendly label/URL demotion |
| Quote | one-level `> text` |
| Banner | optional first nonblank `**CUI...**`-shaped line |
| Comment/rule | skipped under the documented profile |

Use LF, UTF-8 without BOM, no trailing whitespace, one blank line between
blocks/list items, and one final newline.

## Refuse before conversion

- images in any Markdown spelling;
- nested lists, blockquotes, or emphasis;
- underscore emphasis, setext headings, h5/h6, and hard line breaks;
- escaped/table-code pipes, malformed or width-inconsistent tables;
- language-labelled, indented, malformed, or unclosed code blocks;
- complex/multi-backtick code spans; and
- ambiguous leading/trailing whitespace.

Do not “simplify” a refusal silently. Rewrite the source deliberately or keep
the unsupported content outside this profile.

## Production path

```bash
python3 SKILL/scripts/office180_word.py md2docx --check source.md
python3 SKILL/scripts/office180_word.py \
  md2docx --theme neutral source.md --out source.review.docx
```

Replace `SKILL` with the directory containing this card's parent `SKILL.md`.
Available bundled themes are:

- `neutral` — restrained default;
- `plum` — purple-accented house style; and
- `marked-docs` — banner-forward black-and-white style.

Use a new output path. `--no-footer` is available when the source/theme should
not produce footer text.

## Review

Structural round-trip acceptance is automated. Native Word rendering,
representative native edits, and human page-level review remain separate
evidence. Check pagination, tables, long code lines, typography, header/footer
behavior, and any marking banner before delivery.
