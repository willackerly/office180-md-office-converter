# CONTRACT-C3-ROUNDTRIP.1.2

<!-- SUPERSEDES: CONTRACT-C3-ROUNDTRIP.1.1 -->

**Version:** 1.2
**Status:** in-progress
**Owner:** Will Ackerly
**Type:** Component
**Cross-repo Promotability:** No
**Source:** `ROADMAP.md` §§7.3–7.5 and the native Word resilience fixture

## Why this exists

The supported Markdown/DOCX lane needs one canonical spelling, exact
forward/reverse equality, explicit lossiness refusals, a machine-readable
fidelity report, and a baseline-aware way to combine Word edits with separately
evolved Markdown.

Native editing also exposed two bounded serializer effects that raw package
equality cannot classify correctly. Word may leave trailing ordinary spaces on
otherwise supported prose, and may remove redundant heading fonts and
non-italic declarations while retaining an exactly equivalent controlled style
cascade. C3 distinguishes exact recovery, diagnosed semantic normalization,
proven native style equivalence, and actual visual drift without weakening the
supported Markdown profile.

## Who needs this

- **Markdown authors** — normalize once and see only semantic Word edits on
  return.
- **Word reviewers** — edit the supported styled body without making DOCX the
  new opaque source of truth.
- **CI and agents** — run exact checks and receive stable, hash-bound
  diagnostics.
- **Merge tooling** — receive internally consistent base/current/edited hashes
  and explicit conflict state.
- **Visual reviewers** — distinguish semantic text recovery from the separate
  controlled-style and native-render evidence.

## Scenarios

### Scenario 1 — exact canonical cycle

A supported Markdown file is normalized, converted, and inverted. The returned
string, including block spacing and final newline, exactly equals the canonical
input.

### Scenario 2 — independent edits

Word changes one supported paragraph while current canonical Markdown changes a
different paragraph. The embedded canonical source is the base, current
Markdown is "mine", and style-inverted Word Markdown is "theirs".
`git merge-file --diff3` returns both changes without conflict.

### Scenario 3 — diagnosed native normalization

Word adds trailing U+0020 to a prose paragraph or removes only a fully proven
redundant heading property. Recovery remains usable, but the report identifies
the exact normalization and never relabels it raw-exact.

### Scenario 4 — unsafe construct or style contradiction

Pending revisions, an image, text box, nested list, protected whitespace, or
another unsupported story construct refuses. A controlled style contradiction
does not change recovered Markdown, but produces visible drift diagnostics.

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

CLI:

```text
md2docx.py --normalize source.md
md2docx.py --check source.md
docx2md.py edited.docx --base-out base.md
docx2md.py edited.docx --merge-current current.md --out merged.md
              [--report report.json]
```

The report schema is `office180-docx-roundtrip-report/0.2`; its controlled
style projection is
`office180-docx-visual-style-projection/0.2`. Added report fields are
backward-compatible; canonical Markdown remains the return value.

## Behavioral Contracts

| Behavior                      | Specification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Supported blocks              | Headings 1–4, flat bullets, literal numbered paragraphs, pipe tables, fenced code without an info string, blockquotes, the marking banner, and normal paragraphs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Supported inline              | Plain text plus separate bold, italic, and inline-code spans. Combined or nested emphasis and Word formatting without a unique canonical inverse refuse. Links retain the documented deterministic demotion.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Canonical spelling            | LF newlines, no BOM, `-` bullets, literal ordered numbers, ATX headings, one blank line between every emitted block or list item, normalized pipe tables, joined soft lines, no trailing whitespace, and exactly one final newline.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Forward authority             | `md2docx` reads explicit UTF-8 bytes, canonicalizes before constructing the Word body, embeds original and canonical sources through C2 2.0, and atomically publishes only the complete DOCX.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Immutable reverse snapshot    | Each public reverse conversion or merge and each CLI invocation reads the input DOCX once. OPC/provenance validation, `python-docx` parsing, report hashing, and merge consume that same immutable snapshot; later path replacement cannot mix package states.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Exact guarantee               | For accepted input, `docx2md(md2docx(x)) == canonicalize_markdown(x)`. `--check` additionally requires `x == canonicalize_markdown(x)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Explicit refusal              | Images in any Markdown spelling, nested lists/blockquotes/emphasis, underscore emphasis, heading levels 5–6, setext headings, indented code, hard line breaks, multi-backtick or unterminated code spans, fence info strings, escaped or inline-code table pipes, malformed or width-inconsistent tables, malformed fences/comments, and unsupported Word story content refuse. Word preflight covers body, all default/first/even headers and footers, notes, and comments for revisions, drawings/text boxes, hyperlinks, fields, notes, controls/wrappers, semantic tabs, hard/page breaks, unsupported run formatting/content, unknown body blocks, merged/nested tables, unsupported headers/sections/styles, nested bullet styles, and native numbering. Text-free `w:lastRenderedPageBreak` is ignored because it does not change supported text semantics. |
| Canonical inverse             | Reverse conversion proves emitted Markdown is canonical, emitted block kinds agree with Word styles, and forward inline parsing recreates Word run semantics before reporting exactness.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Fidelity report               | Reports exact input/output hashes, output bytes, internally consistent or missing embedded-source state, diagnostics, semantic normalization, controlled-style projection, and merge hashes/state when applicable. Package-internal consistency is not external authentication. A missing base is a warning for style inversion and a refusal for merge.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Merge base                    | Only an internally consistent C2 2.0 canonical source is accepted. The truncated core hash or a visually similar document is never a substitute, and no package-local binding authenticates an untrusted sender.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Current source                | `--merge-current` requires valid UTF-8 and exact canonical supported Markdown. Noncanonical or unsupported current source refuses before merge.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Merge semantics               | `git merge-file -p --diff3 current base edited`; exit 0 is merged, positive conflict-count exits 1–127 return explicit conflict markers, and tool-error or signal exits refuse. A conflict warning on stderr does not override that documented positive status. Library calls return text and never write.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| CLI writes                    | Merge requires explicit `--out`. Input DOCX, current Markdown, Markdown output, base output, and report output are pairwise distinct after absolute/symlink/existing-file identity resolution and conservative NFC-plus-case-folded prospective-path checks. Outputs stage first and existing destinations are backed up before atomic replacement; an ordinary replacement failure rolls back already published destinations. This is not a cross-filesystem power-loss transaction. A conflicted artifact is written explicitly and exits 1.                                                                                                                                                                                                                                                                                                                     |
| Style-only fallback           | A DOCX without C2 2.0 may invert the exact supported style profile, but reports `embeddedSource.state="missing"` and cannot baseline-merge.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Trailing-space normalization  | One or more trailing U+0020 characters on a non-empty supported, non-code body paragraph are removed before canonical emission. The event is never called exact.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Normalization evidence        | Every event records stable code, story part, zero-based body-paragraph index, Word style ID/name, edge, code point, count, and SHA-256 of the pre-normalized rendered paragraph. Source text is excluded from diagnostics.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Semantic state                | With no events, report state is `exact-supported-profile` and `semanticNormalization.state` is `exact`. With events, report state is `normalized-supported-profile` and semantic state is `normalized`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Unsafe neighboring whitespace | Leading whitespace, trailing non-U+0020 whitespace including NBSP, table-cell outer whitespace, banner outer whitespace, and trailing whitespace on non-empty code lines refuse. Tabs and hard breaks refuse during story preflight. A non-code body paragraph containing only whitespace refuses instead of becoming an empty generated spacer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Empty generated spacers       | A body paragraph with no text is ignorable. The forward tool's shaded single-space representation of an empty fenced-code line retains its canonical empty-line behavior.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Controlled style projection   | Reverse inspection projects Normal, Heading 1–4, and linked character styles into ordered JSON values for explicit script fonts, theme references, script sizes, bold/italic pairs, color, link, and base style. Theme major/minor Latin names are context only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Projection validation         | The projection checks C1 1.1 complete matching explicit script families, absence of controlled theme references, matching `sz`/`szCs`, matching script bold/italic values, explicitly non-italic headings, exact style type/base/link relationships, and effective paragraph/linked-character agreement. Relevant document-default italic values and the `DefaultParagraphFont` controlled-property surface are included.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Native style normalization    | All four omitted direct font slots or both omitted direct italic toggles on a heading paragraph are `native-normalized-materialized-equivalent` only when the exact C1 1.1 Normal/Heading/linked-character/default-character cascade independently proves identical effective values. Each accepted property produces an ordered `DOCX-ROUNDTRIP-VISUAL-STYLE-NATIVE-NORMALIZATION` info event with the direct omission, base and linked values, relevant document defaults, and effective result.                                                                                                                                                                                                                                                                                                                                                                 |
| Native normalization boundary | Application metadata, theme resemblance, or another heading is never evidence. Partial direct values, theme references, wrong type/base/link, non-neutral default character base, inherited italic true, wrong linked values, missing links, and explicit conflicts remain drift.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Projection states             | Direct generation is `materialized`; a zero-drift projection with proven omission events is `native-normalized-materialized-equivalent`; a violated invariant is `drifted`. Visual normalization does not change canonical Markdown or the top-level semantic state.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Visual drift evidence         | A violated invariant leaves recovered Markdown unchanged but adds `DOCX-ROUNDTRIP-VISUAL-STYLE-DRIFT` warnings identifying the affected style/property.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| No raw-style hash claim       | Namespace additions, rsids, XML order, latent styles, and unrelated Word metadata do not create drift by themselves. The projection compares controlled meaning, not `styles.xml` bytes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Trust boundary                | C2 remains the exact source snapshot. Style projection detects self-contained contradictions; it is not external authentication and cannot reconstruct an absent historical theme.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| CLI visibility                | Visual-style warnings are printed to stderr and included in a requested report, so conversion without `--report` never silently claims clean materialization.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Visual claim                  | Canonical/structural success and semantic style projection are separate from C11 page-render, representative editability, and native Word lifecycle evidence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## Error Contracts

| Error                        | When                                                                                                                                                                                        | Code                                                                                                                                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unsupported Markdown         | Canonicalization encounters an unsupported construct, invalid UTF-8, or a source over the C2 limit                                                                                          | `MD-CANON-*`                                                                                                                                                                                                                                          |
| Invalid generated DOCX       | Forward package construction or staged C2 semantic validation fails                                                                                                                         | `MD-CANON-PACKAGE`                                                                                                                                                                                                                                    |
| Invalid DOCX package         | ZIP/OPC safety validation or `python-docx` parsing rejects the immutable snapshot                                                                                                           | `DOCX-ROUNDTRIP-PACKAGE`                                                                                                                                                                                                                              |
| Unsupported DOCX story       | A revision, image/textbox, hyperlink, field, note, control/wrapper, break, unsupported inline/block/table/header/section/style/list/numbering construct, or noncanonical inverse is present | `DOCX-ROUNDTRIP-TRACKED-CHANGES`, `-IMAGE`, `-TEXTBOX`, `-HYPERLINK`, `-FIELD`, `-NOTE`, `-CONTENT-CONTROL`, `-BREAK`, `-UNSUPPORTED-ELEMENT`, `-INLINE`, `-NONCANONICAL`, `-TABLE`, `-HEADER`, `-SECTION`, `-STYLE`, `-NESTED-LIST`, or `-NUMBERING` |
| Unsafe outer whitespace      | Leading, non-U+0020 trailing, whitespace-only body text, or protected code/table/banner whitespace is present                                                                               | `DOCX-ROUNDTRIP-NONCANONICAL`                                                                                                                                                                                                                         |
| Missing or invalid base      | Required embedded source is absent or fails C2 2.0                                                                                                                                          | `DOCX-ROUNDTRIP-NO-MERGE-BASE` or `DOCX-ROUNDTRIP-PROVENANCE`                                                                                                                                                                                         |
| Invalid current source       | Current Markdown is invalid UTF-8, unsupported, or noncanonical                                                                                                                             | `DOCX-ROUNDTRIP-CURRENT-*`                                                                                                                                                                                                                            |
| Merge unavailable or failed  | `git merge-file` is missing or returns a tool-error status                                                                                                                                  | `DOCX-ROUNDTRIP-MERGE-UNAVAILABLE` or `DOCX-ROUNDTRIP-MERGE`                                                                                                                                                                                          |
| Semantic conflict            | Both branches change the same region                                                                                                                                                        | `MergeResult.conflicts=True`; CLI writes markers and exits 1                                                                                                                                                                                          |
| Unsafe or failed publication | Paths alias or staged publication fails                                                                                                                                                     | `MD-CANON-PATH-ALIAS`, `MD-CANON-IO`, `DOCX-ROUNDTRIP-PATH-ALIAS`, or `DOCX-ROUNDTRIP-IO`                                                                                                                                                             |
| Proven native style omission | The exact controlled cascade proves the same effective heading property                                                                                                                     | report info `DOCX-ROUNDTRIP-VISUAL-STYLE-NATIVE-NORMALIZATION`; semantic recovery continues                                                                                                                                                           |
| Visual style contradiction   | The controlled C1 1.1 projection differs                                                                                                                                                    | report warning `DOCX-ROUNDTRIP-VISUAL-STYLE-DRIFT`; semantic recovery continues                                                                                                                                                                       |

## Dependencies

- Preserves the C3 1.0 style-inversion subset retained in Git history.
- Depends on: `CONTRACT:C1-THEME-SCHEMA.1.1`.
- Depends on: `CONTRACT:C2-PROVENANCE.2.0`.
- Depends on: `CONTRACT:C11-OFFICE-VISUAL-EVIDENCE.1.1` for promotion.
- External: `python-docx`; `git merge-file` only for explicit reconciliation.

## Cross-references

- **Source docs:** `ROADMAP.md` §§7.1–7.5.

## Future evolution

- Replace the deliberately small internal block AST with a pinned CommonMark
  parser before admitting nested lists, richer inline syntax, real hyperlinks,
  images, or language-tagged code fences.
- New supported constructs require forward, reverse, refusal, exact-equality,
  merge, style-projection, and C11 fixtures together.

## Retirement / supersession plan

- **Predecessors:** C3 1.0 and 1.1 remain in Git history; this 1.2 file is the
  sole current C3 contract.
- **Migration boundary:** callers may consume the 0.2 report fields while all
  existing Python and CLI interfaces remain source-compatible.
- **Migration owner:** DOCX round-trip maintainer.

## Implementing Files

- `md2docx.py`.
- `docx2md.py`.
- `tests/fixtures/kitchen-sink.md`.
- `tests/test_roundtrip.py`.

## Test Requirements

- [x] Exact kitchen-sink canonical equality and canonicalizer idempotence.
- [x] `--normalize` and `--check` byte-exact UTF-8/LF behavior.
- [x] Story-wide Word and supported Markdown lossiness probes refuse with stable
      codes.
- [x] Reverse conversion, report, CLI, and merge stay bound to one immutable
      DOCX snapshot.
- [x] Internally consistent embedded base survives package reopen/save.
- [x] Non-conflicting and conflicting Word/Markdown edits produce the required
      merge or diff3 conflict state.
- [x] Contradictory or missing bases refuse merge.
- [x] Existing/symlink and case/normalization-equivalent prospective path
      aliases refuse; outputs stage before publication and rollback restores
      old destinations.
- [x] C11 generated/edited/regenerated DOCX Quick Look comparisons bind exact
      canonical and recovered Markdown artifacts.
- [x] Exact supported input retains exact semantic state and no normalization
      events.
- [x] Trailing U+0020 recovers canonical Markdown with hash-bound evidence and
      deterministic event order.
- [x] Leading, NBSP, whitespace-only, code, table, banner, tab, and hard-break
      neighbors refuse.
- [x] Normalized Word edits preserve C2 source and merge behavior.
- [x] Clean C1 1.1 styles project as materialized; explicit-font removal with a
      surviving theme reference projects as drift.
- [x] Harmless non-projected serializer metadata does not create drift.
- [x] Exact Word 16.111.2 no-op save/reopen recovers exact Markdown and reports
      eight proof-carrying omission events with zero drift.
- [x] Theme, base, inherited, linked, explicit-conflict, missing-link, and
      partial-value counterexamples remain drifted.
- [ ] Native Word representative supported edit, non-empty save, reopen, and
      C2 source-part persistence is proven and visually reviewed.

## Change History

| Version | Date       | Change                                                                                                                      | Migration                                                                                                                             |
| ------- | ---------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0     | 2026-07-08 | Style-driven canonical inversion compatibility subset                                                                       | —                                                                                                                                     |
| 1.1     | 2026-08-01 | Exact canonical equality, refusals, reports, embedded-base merge                                                            | Normalize Markdown before merge                                                                                                       |
| 1.2     | 2026-08-02 | Diagnosed trailing U+0020 normalization, controlled-style projection, and proof-carrying native heading-cascade equivalence | Regenerate DOCX for C1 1.1 direct materialization; distinguish direct materialized, proven native-equivalent, and drifted projections |
