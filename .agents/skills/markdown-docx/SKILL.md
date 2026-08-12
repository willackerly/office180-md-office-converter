---
name: markdown-docx
description: Word, DOCX, report, memo, proposal, and Markdown-to-Word authoring or editing with the Office180 supported profile. Create, theme, validate, inspect, recover, and merge Microsoft Word documents while keeping canonical Markdown authoritative. Use when Codex is asked to make, write, generate, style, convert, edit, inspect, or recover a Word document or DOCX; turn Markdown into DOCX or DOCX into Markdown; diagnose fidelity or provenance; or merge supported Word edits into current Markdown.
---

# Markdown-first Word authoring

Keep one canonical Markdown file as authority. Treat DOCX as a styled,
reviewable branch that may carry supported human edits back through an
explicit recovery report. Never make both files competing authorities.

## Route the request

| Intent | Minimum path |
| --- | --- |
| Create a Word document | author supported Markdown → canonical check → themed DOCX |
| Create a report, memo, or proposal | start from `assets/starter.md` → edit source → compile |
| Restyle an existing canonical source | compile the same Markdown to a new DOCX with an explicit theme |
| Read or inspect a generated DOCX | recover to a new Markdown path with `--report`; do not overwrite source |
| Recover supported Word edits | `docx2md` to a new branch plus hash-bound report |
| Word and Markdown both changed | `--merge-current` with explicit new output/report; review exit status |
| Missing provenance or unsupported Word structure | preserve inputs and stop with the diagnostic/report |

Read the one-page [Word card](references/word-card.md) for ordinary production.
Read [recovery and merge](references/recovery-and-merge.md) before treating a
DOCX as edited input, using `--merge-current`, or interpreting a refusal.

## Use the portable launcher

The skill includes a launcher that resolves either the repository converters,
the plugin-bundled converters, or the installed collision-resistant console
scripts. It never searches for similarly named generic tools:

```bash
python3 .agents/skills/markdown-docx/scripts/office180_word.py --help
```

When this skill is installed through the Office180 plugin, invoke the same
script relative to this `SKILL.md`. The launcher accepts `--theme neutral`,
`--theme plum`, or `--theme marked-docs` for the forward command and resolves
the exact bundled/repository JSON file.

## Create and validate

Start with a separate canonical source file. Use only the supported constructs
on the Word card:

```bash
cp .agents/skills/markdown-docx/assets/starter.md report.md

python3 .agents/skills/markdown-docx/scripts/office180_word.py \
  md2docx --check report.md

python3 .agents/skills/markdown-docx/scripts/office180_word.py \
  md2docx --theme plum report.md --out report.review.docx
```

The output path must be new. Keep `report.md` beside the delivered DOCX. A
failed `--check` means the source needs an explicit canonicalization review;
never generate from known noncanonical or unsupported Markdown and describe it
as round-trip safe.

For an installed Python package outside a repository/plugin checkout:

```bash
office180-md2docx --check report.md
office180-md2docx --template path/to/theme.json \
  report.md --out report.review.docx
```

## Recover without losing branches

Recover an edited Word document into a new path and always request a report:

```bash
python3 .agents/skills/markdown-docx/scripts/office180_word.py \
  docx2md report.edited.docx \
  --out report.word-edits.md \
  --base-out report.embedded-base.md \
  --report report.recovery.json
```

If current Markdown also changed:

```bash
python3 .agents/skills/markdown-docx/scripts/office180_word.py \
  docx2md report.edited.docx \
  --merge-current report.md \
  --out report.merged.md \
  --base-out report.embedded-base.md \
  --report report.merge.json
```

Exit `0` is a clean merge. Exit `1` with a published output and report is an
explicit diff3 conflict, not permission to discard either branch. Higher
errors are refusals. Review conflict markers and the report before creating a
new DOCX.

## Preserve the boundary

The supported profile is intentionally narrow. Refuse or redesign tracked
changes, comments/notes, text boxes, drawings/images, hyperlinks or fields,
native numbering, nested lists/blockquotes/emphasis, unknown styles, and other
constructs named in the recovery reference. Do not flatten them into plain
text or infer a merge base from visual similarity.

Never overwrite the input DOCX, current Markdown, embedded base, recovered
branch, merge result, or report. Preserve each exact input until the reviewed
canonical Markdown is accepted.

## Report the result

Hand back:

- canonical Markdown path;
- generated or inspected DOCX path;
- explicit theme identity/path;
- recovery, base, merge, and report paths when applicable;
- command exit state and whether provenance was internally consistent;
- any refusal or conflict code; and
- the remaining native Word or human visual review requirement.
