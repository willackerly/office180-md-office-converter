# CONTRACT-C3-ROUNDTRIP.1.1

<!-- SUPERSEDES: CONTRACT-C3-ROUNDTRIP.1.0 -->

**Version:** 1.1
**Status:** in-progress
**Owner:** Will Ackerly
**Type:** Component
**Cross-repo Promotability:** No
**Source:** `ROADMAP.md` §§7.3–7.5

## Why this exists

Token preservation is not a sufficient round-trip claim. The supported
Markdown/DOCX lane needs one explicit canonical spelling, exact forward/reverse
equality, lossiness refusals, a machine-readable fidelity report, and a
baseline-aware way to combine Word edits with separately evolved Markdown.

## Who needs this

- **Markdown authors** — can normalize once and see only semantic Word edits on
  return.
- **Word reviewers** — can edit the supported styled body without becoming the
  new opaque source of truth.
- **CI and agents** — can run an exact `--check` rather than a token-bag proxy.
- **Merge tooling** — receives internally consistent base/current/edited hashes
  and explicit conflict state.

## Scenarios

### Scenario 1 — exact canonical cycle

A supported Markdown file is normalized, converted, and inverted. The returned
string, including block spacing and final newline, is exactly the canonical
input string.

### Scenario 2 — independent non-conflicting edits

Word changes one supported paragraph while current canonical Markdown changes a
different paragraph. The internally consistent embedded canonical source is the base;
current Markdown is "mine"; style-inverted Word Markdown is "theirs".
`git merge-file --diff3` returns both changes with no conflict.

### Scenario 3 — unsafe Word construct

The DOCX contains pending revisions, an image, text box, nested bullet style,
or native numbering outside this profile. Conversion refuses with a stable code
instead of dropping or flattening the construct.

## Interfaces

```python
def canonicalize_markdown(text: str) -> str:
    """Return the one spelling of supported-profile Markdown."""

def check_canonical_roundtrip(
    text: str,
    cfg: dict | None = None,
    tpl_path: Path | None = None,
) -> tuple[str, str]:
    """Return canonical input and recovered output from an isolated cycle."""

def convert_with_report(
    docx_path: str | Path,
    report_provenance: bool = True,
) -> tuple[str, dict]:
    """Return canonical Markdown and a hash-bound fidelity report."""

def merge_with_current(
    docx_path: str | Path,
    current_path: str | Path,
    report_provenance: bool = True,
) -> MergeResult:
    """Three-way merge supported Word edits into canonical current Markdown."""
```

CLI additions:

```text
md2docx.py --normalize source.md
md2docx.py --check source.md
docx2md.py edited.docx --base-out base.md
docx2md.py edited.docx --merge-current current.md --out merged.md
              [--report report.json]
```

## Behavioral Contracts

| Behavior | Specification |
|----------|---------------|
| Supported blocks | C3 1.0 headings 1–4, flat bullets, literal numbered paragraphs, pipe tables, fenced code without info string, blockquotes, banner, and normal paragraphs. |
| Supported inline | Plain text plus separate bold, italic, and inline-code spans. Combined/nested emphasis and Word formatting without a unique canonical Markdown inverse refuse. Links retain C3 1.0's documented deterministic demotion. |
| Canonical spelling | LF newlines, no BOM, `-` bullets, literal ordered numbers, ATX headings, one blank line between every emitted block/list item, normalized pipe tables, joined soft lines, no trailing whitespace, and exactly one final newline. |
| Forward authority | `md2docx` reads explicit UTF-8 bytes, canonicalizes before building the Word body, embeds both original and canonical sources through C2 2.0, and atomically publishes only the complete resulting DOCX. |
| Immutable reverse snapshot | Each public reverse conversion/merge and each CLI invocation reads the input DOCX once. OPC/provenance validation, `python-docx` parsing, report input hashing, and merge all consume that same immutable byte snapshot; a later path replacement cannot mix package states. |
| Exact guarantee | For accepted input, `docx2md(md2docx(x)) == canonicalize_markdown(x)`. `--check` additionally requires `x == canonicalize_markdown(x)`. |
| Explicit refusal | Images in any Markdown spelling, nested lists/blockquotes/emphasis, underscore emphasis, heading levels 5–6, setext headings, indented code, hard line breaks, multi-backtick or unterminated code spans, fence info strings, escaped or inline-code table pipes, malformed or width-inconsistent tables, malformed fences/comments, and unsupported Word story content refuse. Word preflight covers body, all default/first/even headers and footers, notes, and comments for revisions, drawings/text boxes, hyperlinks, fields, notes, content controls/wrappers, semantic tabs, hard/page breaks, unsupported run formatting/content, unknown body blocks, merged/nested tables, unsupported headers/sections/styles, nested bullet styles, and native numbering. Word's text-free `w:lastRenderedPageBreak` pagination artifact is explicitly ignored because it does not change supported text semantics. |
| Canonical inverse | Reverse conversion proves emitted Markdown is canonical, that emitted block kinds agree with Word styles, and that forward inline parsing recreates Word run semantics before reporting exactness. |
| Fidelity report | Reports exact input/output hashes, output bytes, internally-consistent/missing embedded-source state, diagnostics, and merge hashes/state when applicable. Package-internal consistency is not external authentication. A missing base is a warning for style inversion and a refusal for merge. |
| Merge base | Only an internally consistent C2 2.0 canonical source is accepted. The truncated core hash or a visually similar document is never a substitute, and no package-local binding is described as authenticating an untrusted sender. |
| Current source | `--merge-current` requires valid UTF-8 and exact canonical supported Markdown. Noncanonical or unsupported current source refuses before merge. |
| Merge semantics | `git merge-file -p --diff3 current base edited`; per [`git-merge-file(1)`](https://git-scm.com/docs/git-merge-file), exit 0 is merged, positive conflict-count exits 1–127 return explicit conflict markers, and tool-error/signal exits refuse. A conflict warning on stderr does not override that documented positive status. Library calls return text and never write. |
| CLI writes | Merge requires explicit `--out`. Input DOCX, current Markdown, Markdown output, base output, and report output must be pairwise distinct after absolute/symlink/existing-file identity resolution and a conservative NFC-plus-case-folded prospective-path check. Every requested output is staged and every existing destination is backed up before any atomic replacement; an ordinary replacement failure rolls already-published destinations back. This is not a cross-filesystem power-loss transaction. A conflicted artifact is written explicitly and CLI exits 1. |
| Style-only fallback | A DOCX without C2 2.0 may still invert the exact supported style profile, but its report says `embeddedSource.state="missing"` and it cannot baseline-merge. |
| Visual claim | Structural/canonical success is separate from C11 page-render and native Word lifecycle evidence. |

## Error Contracts

| Error | When | Code |
|-------|------|------|
| Unsupported Markdown | Canonicalizer encounters a construct the forward parser cannot preserve, invalid UTF-8, or a source over the C2 limit | `MD-CANON-*` |
| Invalid generated DOCX | Forward package construction or staged C2 semantic validation fails | `MD-CANON-PACKAGE` |
| Invalid DOCX package | ZIP/OPC safety validation or `python-docx` parsing rejects the immutable snapshot | `DOCX-ROUNDTRIP-PACKAGE` |
| Unsupported DOCX story | Revisions, image/textbox, hyperlink, field, note, control/wrapper, break, unsupported inline/block/table/header/section/style/list/numbering, or a noncanonical inverse is present | `DOCX-ROUNDTRIP-TRACKED-CHANGES`, `-IMAGE`, `-TEXTBOX`, `-HYPERLINK`, `-FIELD`, `-NOTE`, `-CONTENT-CONTROL`, `-BREAK`, `-UNSUPPORTED-ELEMENT`, `-INLINE`, `-NONCANONICAL`, `-TABLE`, `-HEADER`, `-SECTION`, `-STYLE`, `-NESTED-LIST`, or `-NUMBERING` |
| Missing/invalid base | Required embedded source is absent or fails C2 2.0 | `DOCX-ROUNDTRIP-NO-MERGE-BASE` or `DOCX-ROUNDTRIP-PROVENANCE` |
| Invalid current source | Current Markdown is invalid UTF-8, unsupported, or noncanonical | `DOCX-ROUNDTRIP-CURRENT-*` |
| Merge unavailable/fails | `git merge-file` is missing or returns a tool-error status | `DOCX-ROUNDTRIP-MERGE-UNAVAILABLE` or `DOCX-ROUNDTRIP-MERGE` |
| Semantic conflict | Both branches change the same region | returned `MergeResult.conflicts=True`; CLI writes markers and exits 1 |
| Unsafe/failed publication | Forward or reverse CLI paths alias by resolved spelling, prospective NFC-plus-casefold spelling, or existing-file identity; or staged publication fails | `MD-CANON-PATH-ALIAS`, `MD-CANON-IO`, `DOCX-ROUNDTRIP-PATH-ALIAS`, or `DOCX-ROUNDTRIP-IO` |

## Dependencies

- Preserves the C3 1.0 style-inversion subset retained in Git history.
- Depends on: `CONTRACT:C2-PROVENANCE.2.0`
- Depends on: `CONTRACT:C11-OFFICE-VISUAL-EVIDENCE.1.0` for promotion
- External: `python-docx`; `git merge-file` only for explicit reconciliation

## Cross-references

- **Source docs:** `ROADMAP.md` §§7.1–7.5

## Future evolution

- Replace the deliberately small internal block AST with a pinned CommonMark
  parser before admitting nested lists, richer inline syntax, real hyperlinks,
  images, or language-tagged code fences.
- New supported constructs require forward, reverse, refusal, exact-equality,
  merge, and C11 fixtures together.

## Retirement / supersession plan

C3 1.0 remains the style-inversion compatibility subset in Git history. C3 1.1
adds exact canonical and merge requirements without changing its existing
construct spellings.

## Implementing Files

- `md2docx.py`
- `docx2md.py`
- `tests/fixtures/kitchen-sink.md`
- `tests/test_roundtrip.py`

## Test Requirements

- [x] Exact kitchen-sink canonical equality and canonicalizer idempotence
- [x] `--normalize` and `--check` byte-exact UTF-8/LF success/failure behavior
- [x] Story-wide Word and supported Markdown lossiness probes refuse with stable codes
- [x] Reverse conversion, report, CLI, and merge stay bound to one immutable DOCX byte snapshot
- [x] Internally consistent embedded base survives independent package reopen/save
- [x] Non-conflicting Word/Markdown edits merge exactly
- [x] One or multiple conflicting edits return diff3 markers and conflict state
- [x] Contradictory/missing base refuses merge
- [x] Existing/symlink and case/normalization-equivalent prospective path aliases refuse; all outputs stage before publication; a mid-publication replacement failure restores old destinations
- [x] C11 generated/edited/regenerated DOCX Quick Look comparisons bound to the
      exact canonical and recovered Markdown artifacts
- [ ] Native Word open, representative edit, non-empty save, reopen, and source-part persistence

## Change History

| Version | Date | Change | Migration |
|---------|------|--------|-----------|
| 1.0 | 2026-07-08 | Style-driven canonical inversion compatibility subset | — |
| 1.1 | 2026-08-01 | Exact canonical equality, refusals, fidelity report, embedded-base three-way merge | Normalize current sources before opting into merge |
