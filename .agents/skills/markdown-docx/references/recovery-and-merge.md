# Word recovery and merge

Use this page when a DOCX may contain human edits or when Markdown changed
after the DOCX branch was generated.

## Recover one Word branch

Always write new, pairwise-distinct output paths:

```bash
python3 SKILL/scripts/office180_word.py docx2md review.edited.docx \
  --out review.word-edits.md \
  --base-out review.embedded-base.md \
  --report review.recovery.json
```

The report binds exact input/output hashes, embedded-source state, semantic
normalization, controlled-style evidence, warnings, and refusal state. A
missing internally consistent base still permits bounded style-driven
inspection when otherwise supported, but it cannot authenticate a merge base.

## Merge concurrent branches

```bash
python3 SKILL/scripts/office180_word.py docx2md review.edited.docx \
  --merge-current current.md \
  --out review.merged.md \
  --base-out review.embedded-base.md \
  --report review.merge.json
```

The current source must itself be exact canonical supported Markdown.
Semantics are:

- base: embedded canonical Markdown;
- theirs: canonical Markdown recovered from edited Word;
- mine: current canonical Markdown; and
- merge: `git merge-file --diff3`.

Exit `0` means a clean merge. A positive conflict count is published as exit
`1`, a conflict-marked output, and a report whose merge state is
`conflicted`. Preserve it for review. Tool errors, signals, unsafe paths, or
invalid inputs refuse without being relabelled as conflicts.

Never merge when provenance is missing, inconsistent, or tampered. A
truncated core-property hash, filename, theme resemblance, or similar text is
not a substitute.

## Word structures that refuse

The reverse preflight covers the document body and all header/footer stories.
It refuses, among other things:

- tracked revisions, comments, notes, and content controls/wrappers;
- drawings, images, text boxes, unsupported embedded objects, and fields;
- hyperlinks, tabs, hard/page breaks, and unsupported run content;
- unknown or contradictory styles and direct-format drift;
- native numbering, nested bullet styles, merged/nested tables, and unknown
  body blocks; and
- unsupported sections, headers, or alternate stories.

The diagnostic is the safe result. Do not unzip and scrape text as a fallback,
because that would erase ordering, style, provenance, and loss evidence.

## Native Word normalization

Known bounded Word save normalizations may be accepted only when the report
contains the contracted proof: exact relevant property projections, no
contradiction, and no controlled-style drift. Application identity, a matching
theme name, or a visually similar heading is not proof.

## Review checklist

1. Preserve the exact DOCX and current Markdown.
2. Read the report before the recovered Markdown.
3. Confirm embedded-source status and diagnostics.
4. If merging, inspect exit status and every conflict marker.
5. Run forward `--check` on the accepted merged Markdown.
6. Generate a new DOCX branch; never rewrite the reviewed input.
7. Record what still needs native Word or human visual review.
