# CONTRACT-C12-VECTOR180-SOURCE-DIFF.1.0

**Version:** 1.0
**Status:** in-progress
**Owner:** Will Ackerly
**Type:** Component
**Cross-repo Promotability:** Yes — stable-ID semantic comparison is useful to agent and review tooling
**Source:** `VECTOR180-PROCESSING-API.md` §12.3 and `VECTOR180-IMPLEMENTATION-PLAN.md` §1.1

## Why this exists

A raw SVG/XML diff makes an agent hunt through whitespace, attribute spelling,
and serialization noise, while a visual diff cannot explain which stable
objects changed. C12 produces deterministic, source-hash-bound semantic
comparison with compact before/after context and keeps lexical, metadata, and
rendering differences explicitly separate.

## Who needs this

- **Agents and reviewers** — need changed IDs, categories, source ranges, and compact normalized evidence.
- **Namespace migration** — needs proof that reserved wire renaming did not alter supported visual semantics.
- **Editors/CI** — need exact/semantic/changed classification without auto-applying a patch.
- **C10 users** — need a clear boundary: source diff never substitutes for mapped-PPTX reconciliation.

## Scenarios

### Scenario 1 — compare two atom revisions

Two independently valid atoms share stable IDs. C12 joins by ID and reports one
text change, one connector relationship change, and one within-parent reorder
with exact left/right ranges and resolved snapshots. Unchanged objects are
summarized rather than repeated.

### Scenario 2 — prove namespace migration

The left atom is legacy PPTV 0.1 and the right atom is canonical Vector180 0.1.
They are separate valid artifacts, so this is not a mixed namespace. C12
classifies the family/lexical migration separately and can report supported
semantic equivalence when their normalized C4/C6 meaning agrees.

### Scenario 3 — refuse incomparable sources

An SVG atom is compared with generated HTML, a source has fatal diagnostics,
or stable identity is ambiguous. C12 returns `incomparable`, exact source
diagnostics, and no guessed pairing or partial semantic equivalence.

## Interfaces

```ts
type Vector180DiffClassification =
  "exact" | "semantic-equivalent" | "changed" | "incomparable";

interface Vector180SourceDiff {
  readonly schema: "vector180-source-diff/0.1";
  readonly classification: Vector180DiffClassification;
  readonly left: Vector180DiffSourceIdentity;
  readonly right: Vector180DiffSourceIdentity;
  readonly lexical: { readonly equal: boolean };
  readonly metadata: Vector180MetadataDiff;
  readonly summary: Vector180DiffSummary;
  readonly changes: readonly Vector180SemanticChange[];
  readonly diagnostics: readonly Diagnostic[];
}

function diffVector180Atoms(
  left: Vector180Atom,
  right: Vector180Atom,
): Vector180SourceDiff;
```

CLI:

```text
vector180 diff LEFT.vector180.svg RIGHT.vector180.svg
  [--output REPORT.json] [--format text|json]
```

The first slice accepts atom-to-atom comparison only. Each side may be
canonical Vector180 or separately valid legacy PPTV.

## Behavioral Contracts

| Behavior            | Specification                                                                                                                                                                                                                                                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact identity      | Left/right always record exact SHA-256 and byte length. Recognized inputs also record wire family, source kind, profile, stable root ID, and optional metadata SHA-256; an invalid side uses `unknown` where family/kind cannot be established and never invents profile or ID. Input order is retained.                                       |
| Comparability       | Both inputs independently pass C4 and C6 for atom semantics with no error/fatal or ambiguous ID. Atom-to-deck, source-to-generated HTML/PPTX, and malformed input are incomparable.                                                                                                                                                            |
| Stable join         | Root and object records join only by exact stable ID. Geometry, text, order, proximity, source range, and array index never infer identity.                                                                                                                                                                                                    |
| Normalized meaning  | Comparison uses JSON-safe C4/C6 normalized semantics, not DOM nodes or editing projections that retain family-specific attribute spelling. Finite numbers compare exactly with negative zero canonicalized to zero; there is no tolerance, rounding, or string-to-number guessing.                                                             |
| Change kinds        | Deterministic categories are `root`, `added`, `removed`, `parent`, `order`, `relationship`, `text`, `geometry`, `transform`, `frame`, `style`, `export-intent`, and `metadata`. One object may carry multiple ordered field changes.                                                                                                           |
| Ordering            | Changes sort by canonical scope, then painter traversal/stable ID, then fixed category and field-path order. JSON object key order never changes meaning or result order.                                                                                                                                                                      |
| Context             | Changed object records include stable ID, parent IDs/order when applicable, left/right source ranges when present, and compact normalized before/after snapshots limited to the affected fields. Root/metadata records omit inapplicable parent/order fields. Unchanged full objects and raw source bytes are omitted.                         |
| Added/removed       | Addition/removal includes the complete compact normalized object subtree and parent/order context, subject to report size limits. It is not guessed as a rename.                                                                                                                                                                               |
| Metadata separation | For comparable atoms, metadata compares presence, canonical digest, hydration, template lineage, and style-family assertions separately. Metadata-only change does not become a rendering/style change. An incomparable report uses metadata classification `unknown` and makes no partial metadata claim.                                     |
| Family migration    | Opposing wire families are allowed only because each input is independently valid. Family change is reported as root field `/wireFamily`, but that namespace-only record is excluded from visual-semantic classification. `semantic-equivalent` requires all other non-metadata C4/C6 meaning to match; metadata disposition remains explicit. |
| Lexical separation  | `lexical.equal` compares exact source hashes only. Lexical inequality does not imply semantic change, and semantic equivalence never claims byte equality.                                                                                                                                                                                     |
| Classification      | `exact` requires equal hashes. `semantic-equivalent` requires comparable normalized meaning with no non-metadata semantic changes other than the explicit `/wireFamily` migration record. `changed` requires at least one supported visual-semantic delta. `incomparable` contains no guessed change set.                                      |
| No mutation         | C12 performs no write, patch generation/application, ID allocation, migration, layout, render, font measurement, or PPTX inspection.                                                                                                                                                                                                           |
| Hash binding        | Report records exact inputs. A persisted report is stale when either current source hash differs.                                                                                                                                                                                                                                              |
| Report digest       | When another artifact cites a C12 report, its `reportSha256` is SHA-256 over duplicate-free, recursively key-sorted compact UTF-8 JSON of the complete report. The digest is external and never inserted recursively into the report.                                                                                                          |
| Bounded output      | Inputs retain C4 size/depth limits; report has deterministic change/snapshot/byte ceilings. Exceeding a ceiling returns incomparable diagnostics rather than truncating and claiming completeness.                                                                                                                                             |
| C10 boundary        | Edited PPTX comparison always uses C10 with exact C9 lineage. C12 never compares PPTX/map/composed HTML as peer source.                                                                                                                                                                                                                        |

## Error Contracts

| Error              | When                                                              | Code                                                          |
| ------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------- |
| Invalid side       | One side cannot independently pass C4/C6 atom validation          | `VECTOR180-DIFF-INVALID-LEFT`, `VECTOR180-DIFF-INVALID-RIGHT` |
| Kind mismatch      | Inputs are not both standalone atoms                              | `VECTOR180-DIFF-KIND`                                         |
| Ambiguous identity | Duplicate or invalid stable IDs prevent exact join                | `VECTOR180-DIFF-IDENTITY`                                     |
| Unsupported model  | A valid source contains meaning outside the comparable C6 profile | `VECTOR180-DIFF-UNSUPPORTED`                                  |
| Limit              | Change count, snapshot, depth, or report byte ceiling is exceeded | `VECTOR180-DIFF-LIMIT`                                        |
| Stale report       | Persisted report hashes no longer match supplied sources          | `VECTOR180-DIFF-STALE`                                        |

Every error produces classification `incomparable`, metadata classification
`unknown`, at least one diagnostic, an empty change list, and zero summary
counts; no partial comparison is presented as complete.

## Dependencies

- Depends on: `CONTRACT:C4-PPTV-SOURCE.2.0`.
- Depends on: `CONTRACT:C6-PPTV-RESOLVED.2.0`.
- Schema: `schemas/vector180-source-diff-0.1.schema.json`.
- No renderer, browser, filesystem, Office, or OpenDocKit dependency in core.

## Cross-references

- **Source docs:** `VECTOR180-PROCESSING-API.md`, `VECTOR180-AGENT-GUIDE.md`.

## Future evolution

- Same-family deck/report comparison may be added after manifest/theme/library
  authority has its own fixtures.
- An optional patchability annotation may cite C5 operations but cannot become
  an automatically applied patch or weaken C5 preconditions.

## Implementing Files

- `packages/vector180/src/ops/source-diff.ts`
- `packages/vector180/src/cli.ts`
- `schemas/vector180-source-diff-0.1.schema.json`

## Test Requirements

- [x] Exact, lexical-only, metadata-only, semantic-equivalent, changed, and incomparable classifications pass.
- [ ] Every category has stable-ID/range/snapshot positive and negative fixtures.
- [ ] Added/removed/reorder/reparent/relationship cases never infer identity.
- [ ] Cross-family migration equivalence succeeds only for independently valid complete atoms.
- [ ] Order, output bytes, hashes, and bounds are deterministic across processes.
- [x] C12 refuses deck/PPTX/composed source and never emits or applies a patch.

## Change History

| Version | Date       | Change                                                                                | Migration      |
| ------- | ---------- | ------------------------------------------------------------------------------------- | -------------- |
| 1.0     | 2026-08-02 | Initial stable-ID Vector180 atom semantic comparison and migration-equivalence report | No predecessor |
