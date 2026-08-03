# CONTRACT-C1-THEME-SCHEMA.1.1

<!-- SUPERSEDES: CONTRACT-C1-THEME-SCHEMA.1.0 -->

**Version:** 1.1
**Status:** verified
**Owner:** Will Ackerly
**Type:** Data Model
**Cross-repo Promotability:** No
**Source:** `ROADMAP.md` §4 and the C3 1.2 native Word resilience gate

## Why this exists

`md2docx` renders every document through a JSON theme instead of hard-coded
styling, so one tool can produce visually distinct DOCX output without a code
change. This contract defines the complete theme vocabulary, deterministic
deep-merge and resolution rules, and the Word-style materialization that keeps
the configured result stable across native save/reopen.

Native Word exposed a requirement beyond the original JSON interface: applying
a theme to built-in styles must materialize every controlled script property
explicitly. Word 16.111.2 also proved one benign inverse: it may remove
redundant direct heading fonts and explicit `italic=false` while retaining an
exact `Heading N` → `Normal` cascade and the fully materialized linked
`Heading N Char` style.

## Who needs this

- **`md2docx.py` `Converter`** — reads every schema key and materializes the
  controlled Word styles.
- **Theme authors** (`themes/*.json`) — need the complete vocabulary and
  predictable fallback behavior.
- **`docx2md.py`** — projects controlled style meaning so native serializer
  churn is distinguished from visual drift.
- **C3 round-trip tooling** — relies on the forward converter's style choices
  as canonical structural markers.

## Scenarios

### Scenario 1 — minimal theme override

A theme author writes
`{"name": "Brief", "headings": {"h1": {"size_pt": 24}}}`. Every omitted
value falls back through `deep_merge()` to the built-in defaults; the author
does not restate the full schema to change one value.

### Scenario 2 — missing explicit template

A user runs `md2docx.py -t missing.json report.md`. The explicit path is a
promise, not a hint, so conversion exits with
`template not found: missing.json` instead of silently selecting a default.

### Scenario 3 — native Word normalization

The generated DOCX directly materializes all controlled Normal and Heading
properties. If Word later removes only the narrowly proven redundant heading
font and non-italic declarations, C3 reports proof-carrying native
normalization; a theme reference, conflicting inheritance, or partial omission
remains drift.

## Interfaces

```python
DEFAULTS: dict  # the complete built-in schema in md2docx.py

def deep_merge(base: dict, over: dict) -> dict:
    """Recursively merge dictionaries; non-dict values replace wholesale."""

def resolve_template(explicit: str | None) -> tuple[dict, Path | None, str]:
    """Return merged config, selected path, and a human-readable message."""

def materialize_word_style_font(
    style,
    family: str,
    size_pt: float,
    *,
    bold: bool | None,
    italic: bool | None,
) -> None:
    """Write complete non-theme Word run properties for a controlled style."""
```

## Behavioral Contracts

| Behavior                         | Specification                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Schema keys                      | `fonts.{body,mono}`, `base.{size_pt,color,space_after_pt}`, `headings.{h1,h2,h3,h4}.{size_pt,color}` plus `headings.{bold,space_before_pt,space_after_pt}`, `table.{style,header_fill,header_color,header_bold,cell_size_pt}`, `code.{fill,color,block_size_pt}`, `blockquote.{color,size_pt,border_color,border_size_eighths,indent_in}`, `footer.{text,color,size_pt,bold}`, and `cui_banner.{detect,size_pt,bold,color}`.                           |
| Colors                           | Colors are six hexadecimal digits without a `#` prefix, for example `9C3D9E`, and are consumed by `rgb()`.                                                                                                                                                                                                                                                                                                                                             |
| Omitted key                      | An omitted key falls back to `DEFAULTS`, or to the parent value while merging a layered mapping; omission is not an error.                                                                                                                                                                                                                                                                                                                             |
| Unknown top-level key            | Keys such as `name` and `_comment` pass through untouched. The converter ignores unknown keys except where separate tooling deliberately consumes one, such as the provenance `tpl` label.                                                                                                                                                                                                                                                             |
| Resolution order                 | Resolution is: 1) `--template`/`-t`, 2) `md2docx-template.json` beside the script, 3) `themes/neutral.json` beside the script, 4) hard-coded `DEFAULTS`.                                                                                                                                                                                                                                                                                               |
| Missing explicit template        | An explicit path that does not exist exits with `template not found: <path>` and never falls back.                                                                                                                                                                                                                                                                                                                                                     |
| No discovered template           | If the default search finds nothing, conversion uses `DEFAULTS` and prints `template: built-in defaults (...)`.                                                                                                                                                                                                                                                                                                                                        |
| Deep merge                       | Nested dictionaries merge key by key. Any non-dictionary override, including a list, replaces the corresponding base value wholesale. Base-only keys remain untouched.                                                                                                                                                                                                                                                                                 |
| Controlled body style            | `Normal` materializes the configured body family in `ascii`, `hAnsi`, `eastAsia`, and `cs`; `sz` and `szCs` equal the configured base size.                                                                                                                                                                                                                                                                                                            |
| Controlled heading styles        | `Heading 1` through `Heading 4` materialize the configured body family in all four script slots, equal `sz`/`szCs`, `b`/`bCs` from `headings.bold`, and explicit `i=false`/`iCs=false`. C1 has no implicit heading-italic setting.                                                                                                                                                                                                                     |
| Linked character styles          | `Heading 1 Char` through `Heading 4 Char` receive the same controlled family, size, bold, italic, and color as their linked paragraph style.                                                                                                                                                                                                                                                                                                           |
| Theme references                 | Controlled Normal and Heading run properties contain none of `asciiTheme`, `hAnsiTheme`, `eastAsiaTheme`, or `cstheme`; Word cannot choose a theme font over the configured family.                                                                                                                                                                                                                                                                    |
| Color and spacing                | Heading color and paragraph-spacing materialization remain driven by the merged schema values.                                                                                                                                                                                                                                                                                                                                                         |
| Other styles                     | C1 does not normalize every built-in Word style. Uncontrolled latent styles and harmless serializer metadata are outside the projection.                                                                                                                                                                                                                                                                                                               |
| Writer authority                 | Forward generation always retains complete direct materialization. A native-normalized input never relaxes or feeds back into writer behavior.                                                                                                                                                                                                                                                                                                         |
| Native paragraph-font omission   | Read-only C3 inspection may accept all four omitted direct font slots on one `Heading N` paragraph only when it is an exact paragraph-style child of fully materialized root `Normal`, has no theme references, is linked bidirectionally to the matching fully materialized `Heading N Char`, and that character style is an exact child of controlled-property-neutral `DefaultParagraphFont`. The effective four-script family must equal `Normal`. |
| Native paragraph-italic omission | C3 may accept both omitted direct heading `i`/`iCs` values only under the same exact style/link chain, when the linked character style explicitly materializes both false and the `Normal` plus document-default cascade proves both effective values false.                                                                                                                                                                                           |
| Refusal boundary                 | Partial omission, any theme reference, wrong type or `basedOn`, non-neutral inherited character style, missing or wrong link, wrong linked property, inherited italic true, or any explicit conflict is visual drift. Semantic resemblance or application identity is not proof.                                                                                                                                                                       |
| Semantic inspection              | C3 projects the controlled properties and bounded cascade proof semantically. Raw `styles.xml` byte equality is never a theme-fidelity claim.                                                                                                                                                                                                                                                                                                          |

## Error Contracts

| Error                          | When                                                                                         | Code                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Missing explicit template      | `-t`/`--template` names a path that does not exist                                           | `SystemExit("template not found: <path>")`, process exit 1      |
| Invalid theme JSON             | The selected template is not valid JSON                                                      | uncaught `json.JSONDecodeError`, process exit 1                 |
| Missing controlled value       | Materialization receives an invalid merged configuration lacking a required controlled value | conversion fails rather than retaining a built-in style default |
| Controlled style contradiction | C3 cannot prove the required direct or inherited controlled style value                      | C3 visual-style drift evidence; semantic recovery follows C3    |

## Dependencies

- Depends on: none for schema merge and resolution.
- Used by: `CONTRACT:C3-ROUNDTRIP.1.2`.
- External: standard-library `json`; `python-docx` for Word style
  materialization and semantic inspection.
- Configuration: `-t`/`--template`.

## Cross-references

- **Source docs:** `ROADMAP.md` §4.
- **Shipped themes:** `themes/neutral.json`, `themes/plum.json`,
  `themes/marked-docs.json`.

## Future evolution

- JSONC and an `extends` chain would change resolution semantics and require a
  major version.
- A backward-compatible optional `branding.logo` block may use a future minor
  version.

## Retirement / supersession plan

- **Predecessor:** C1 1.0 is retained in Git history; this 1.1 file is the sole
  current C1 contract.
- **Migration boundary:** all implementation and documentation references move
  to C1 1.1 in the same delivery.
- **Migration owner:** DOCX theme and round-trip maintainer.

## Implementing Files

- `md2docx.py` — schema, merge, resolution, and direct materialization.
- `docx2md.py` — read-only semantic projection.
- `themes/neutral.json` — complete base theme.
- `themes/plum.json` — purple-accented override.
- `themes/marked-docs.json` — banner-forward override.
- `tests/test_roundtrip.py`.

## Test Requirements

- [x] Recursive deep merge and complete resolution-order behavior.
- [x] Every shipped theme parses and merges.
- [x] Normal, Heading 1–4, and linked heading character styles use four
      explicit script fonts and no theme references.
- [x] Controlled sizes agree across `sz` and `szCs`.
- [x] Controlled heading bold agrees across `b` and `bCs`.
- [x] Heading italic is explicitly false, including Heading 4.
- [x] C3 detects removed explicit heading fonts plus surviving theme
      references without comparing raw XML bytes.
- [x] A direct generated baseline remains `materialized`.
- [x] The exact Word 16.111.2 save/reopen output is
      `native-normalized-materialized-equivalent` with eight proof events,
      zero drift, and exact canonical Markdown.
- [x] Theme references, wrong bases, inherited or linked mismatch, explicit
      conflict, missing links, and partial direct values remain drift.

## Change History

| Version | Date       | Change                                                                                                 | Migration                                                                                                                  |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| 1.0     | 2026-07-08 | JSON theme vocabulary and deep-merge resolution                                                        | —                                                                                                                          |
| 1.1     | 2026-08-02 | Explicit all-script Word style materialization plus narrowly proven native heading-cascade equivalence | Regenerate DOCX baselines before claiming native style equivalence; readers accept only the exact bounded omission profile |
