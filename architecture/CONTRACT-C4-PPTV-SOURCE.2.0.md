# CONTRACT-C4-PPTV-SOURCE.2.0

<!-- SUPERSEDES: CONTRACT-C4-PPTV-SOURCE.1.1 -->

**Version:** 2.0
**Status:** in-progress
**Owner:** Will Ackerly
**Type:** Data Model
**Cross-repo Promotability:** Yes — OpenDocKit may consume the destination-neutral projections through an optional adapter
**Source:** `VECTOR180-DESIGN-INDEX.md` §§4.17–4.18, `VECTOR180-PROCESSING-API.md` §§12.3–12.6, and `VECTOR180-PROFILE.md`

## Why this exists

The canonical visual source is now Vector180 rather than a
PowerPoint-named format. This contract changes the public wire atomically while
retaining exact, non-executing reads of legacy PPTV 0.1 and refusing any
artifact that mixes the two control vocabularies.

`C4-PPTV-SOURCE` remains the stable historical Rebar contract ID; `PPTV` in
that ID is not a current public format or wire identifier.

## Who needs this

- **Vector180 authors and agents** — need one hydration-complete SVG atom as the default independent visual source.
- **Deck/report consumers** — need explicit HTML aggregation without making it the default atom.
- **C5–C12 consumers** — need exact family, identity, source ranges, hashes, and optional lineage metadata.
- **Legacy repositories** — need bounded read-only interpretation of existing PPTV 0.1 bytes.

## Scenarios

### Scenario 1 — load a canonical atom

A caller loads `architecture.vector180.svg`. The root declares
`data-vector180-version="0.1"` and uses only `data-vector180-*` control
attributes. C4 returns a hash-bound `Vector180Atom` without inventing a deck,
physical size, theme, or runtime.

### Scenario 2 — inspect legacy source without rewriting it

A caller validates an existing `.pptv.svg` or `.pptv.html`. C4 selects the
legacy dialect once, preserves and hashes the exact bytes, and exposes the same
normalized semantic meaning with `wireFamily: "pptv-legacy"`. Canonical write
operations require an explicit migration first.

### Scenario 3 — reject a mixed dialect

A Vector180 root contains `data-pptv-frame`, or a legacy deck selects a
`vector180-browser/0.1` runtime. Loading fails with
`VECTOR180-NAMESPACE-MIXED`; no field-by-field aliasing, downgrade, or partial
model is returned.

## Interfaces

```ts
type VisualWireFamily = "vector180" | "pptv-legacy";

interface Vector180SourceDocument {
  readonly wireFamily: VisualWireFamily;
  readonly text: string;
  readonly bytes: Uint8Array;
  readonly sha256: string;
}

interface Vector180Atom {
  readonly sourceKind: "svg";
  readonly wireFamily: VisualWireFamily;
  readonly version: "0.1";
  readonly id: string;
  readonly viewBox: readonly [number, number, number, number];
  readonly metadata?: Vector180AtomMetadata;
  readonly source: Vector180SourceDocument;
}

interface Vector180Deck {
  readonly sourceKind: "html";
  readonly wireFamily: VisualWireFamily;
  readonly source: Vector180SourceDocument;
}

function loadVector180Document(
  input: Vector180Input,
): Promise<Vector180Atom | Vector180Deck>;
function migratePptvAtom(
  input: Vector180Input,
): Promise<Vector180MigrationResult>;
```

Canonical public projections use:

- `vector180-atom-outline/0.1`
- `vector180-atom-inventory/0.1`
- `vector180-atom/0.1`
- `vector180-atom-object/0.1`
- `vector180-atom-query/0.1`
- `vector180-atom-text/0.1`
- `vector180-deck-outline/0.1`
- `vector180-deck-inventory/0.1`
- `vector180-slide/0.1`
- `vector180-deck-text/0.1`

These are the current read-API response identities, not claims about the
input's wire. Every response carries `wireFamily`; a legacy input remains
`pptv-legacy` with its exact hash/ranges. The frozen package's historical
`pptv-*` projection bytes remain historical evidence and are never relabeled.

## Behavioral Contracts

| Behavior                 | Specification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical atom           | One strict namespace-aware XML SVG root with stable `id`, exact `data-vector180-version="0.1"`, SVG namespace, and finite positive `viewBox`. A hydration-complete atom has local concrete styling and no manifest, runtime, deck theme, or external dependency.                                                                                                                                                                                                                                                                                                                             |
| Canonical deck/report    | A self-contained `*.vector180.html` uses `data-vector180-version`, `id="vector180-manifest"`, `type="application/vnd.office180.vector180+json"`, manifest key `"vector180": "0.1"`, and only `data-vector180-*` controls. HTML is canonical only when collection order/shared theme/viewer behavior is part of the deliverable.                                                                                                                                                                                                                                                              |
| Canonical suffixes       | Writers use `.vector180.svg`, `.vector180.html`, and `.vector180-manifest.json`. Content remains authority; a suffix mismatch is diagnosed and never changes dialect.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Atom discovery comment   | Canonical atom creators, migrators, and extractors emit the maintained non-normative Vector180 authoring-skill discovery comment near the top of the SVG. C4 never treats it as dialect, identity, metadata, or executable instruction; comment-stripped and hand-authored conforming atoms remain valid.                                                                                                                                                                                                                                                                                    |
| Reserved attributes      | The complete canonical family is `data-vector180-version`, `role`, `export`, `from`, `to`, `frame`, `line-step`, `bounds`, `layout`, `slide`, `library`, `style`, `theme`, `output`, `runtime`, `editor-runtime`, `object-id`, and `metadata`.                                                                                                                                                                                                                                                                                                                                               |
| CSS/runtime vocabulary   | Canonical deck custom properties use `--vector180-*`; runtime and agent profiles use `vector180-browser/0.1`, `vector180-editor/0.1`, and `vector180-agent/1`.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| One dialect decision     | The scanner selects one dialect from syntactic control surfaces before semantic loading. It never aliases individual attributes, JSON keys, CSS tokens, schema IDs, or runtime IDs.                                                                                                                                                                                                                                                                                                                                                                                                          |
| Mixed refusal            | Any opposing-family reserved attribute, manifest control, CSS token, runtime/profile, or recognized metadata marker is fatal. Comments, visible text, stable IDs, ordinary classes, and arbitrary strings containing `pptv` or `vector180` are not namespace evidence.                                                                                                                                                                                                                                                                                                                       |
| Legacy read boundary     | Exact PPTV 0.1 SVG/HTML and current PPTV inventory forms remain non-executing read inputs. Their bytes, ranges, diagnostics, and SHA-256 values are not normalized or relabeled as canonical source.                                                                                                                                                                                                                                                                                                                                                                                         |
| Canonical write boundary | Creation, writable editor publication, patching, composition, and canonical serialization accept only `wireFamily: "vector180"`. A legacy atom requires explicit C4 migration. The sole legacy-deck output exception is C6 `extract`: it reads one selected slide/theme and publishes a separately verified canonical hydrated atom without mutating, relabeling, or serializing the legacy deck. No new feature enters the legacy grammar.                                                                                                                                                  |
| Migration                | The 2.0 migration writer accepts one valid legacy standalone SVG atom. It uses source-range replacements, preserves stable IDs/content/geometry/order/unrelated spelling, never infers lineage, reloads through C4/C6 2.0, and emits `vector180-migration-report/0.1` with old/new hashes, exact byte/character/line/column replacement ranges, and C12 proof. Legacy HTML stays read-only: extract its slides to canonical atoms through C6 and explicitly aggregate a new deck when needed.                                                                                                |
| Migration atomicity      | Candidate source bytes and report are returned or published together only after canonical reload and semantic-equivalence proof. Any failure returns diagnostics with no output source, success report, or partially renamed bytes.                                                                                                                                                                                                                                                                                                                                                          |
| Exact source             | Strict UTF-8, BOM retention, UTF-16 character ranges, UTF-8 byte ranges, source limits, immutable snapshots, and no execution/fetch behavior from C4 1.1 remain unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Identity/order           | Stable SVG IDs remain object authority; DOM sibling order remains painter order; manifest order remains deck order. Filename, array index, browser node, and Office numeric ID never compete.                                                                                                                                                                                                                                                                                                                                                                                                |
| Metadata                 | Zero or one direct-child `<metadata data-vector180-metadata="vector180-atom-metadata/0.1">` containing one strict JSON object is permitted only on a standalone atom SVG root. The exact text between tags is JSON input; XML character/entity references, CDATA, child elements, comments inside the payload, duplicate JSON keys, and trailing non-whitespace fail. A recognized atom-metadata marker inside deck HTML is unsupported and fails rather than becoming hidden lineage. Metadata is inert, untrusted, and never rendering, identity, styling, or agent-instruction authority. |
| Legacy metadata boundary | PPTV 0.1 never defined `data-pptv-metadata`; the legacy dialect remains frozen and that spelling is unsupported rather than an alias for canonical atom metadata. Unmarked inert legacy `<metadata>` may survive atom migration byte-for-byte but does not become structured lineage.                                                                                                                                                                                                                                                                                                        |
| Metadata hashing         | Exact source SHA-256 covers lexical metadata bytes. `metadataSha256` is SHA-256 over duplicate-free, recursively key-sorted compact UTF-8 JSON. Absence is valid.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Metadata limits          | The payload is at most 4096 UTF-8 bytes and depth four, has no unknown keys, and contains no path, URL, host, username, email, author, command, executable text, or external dependency.                                                                                                                                                                                                                                                                                                                                                                                                     |
| Template identity        | `templateLineage` contains generator profile, template ID, and SHA-256 of the exact immutable input template-basis artifact bytes consumed before instantiation. It never hashes the current output atom or defines a self-excluding/self-referential digest. A basis artifact cannot self-certify; matching declarations are assertions, and verified equality additionally requires independently available basis bytes whose hash matches.                                                                                                                                                |
| Style identity           | `styleFamily` is a declared grouping hint only. Its optional `definitionSha256` identifies exact immutable external style-family definition bytes, never the current atom and never a resource to fetch. Equality is an assertion unless those bytes are independently supplied and verified. A current visual palette fingerprint is derived from C6 resolved output and is never persisted as source truth.                                                                                                                                                                                |
| Default atom scaffold    | `vector180 new atom` uses `0 0 1600 900` when dimensions are omitted and accepts another finite positive width and height only when both are explicit. It may stamp exactly `styleFamily: {"id":"office180.vector180.default","version":"1.0"}` with no `definitionSha256`. It does not stamp `templateLineage`: the starter consumes no separately identified immutable template-basis bytes and must not self-hash. Deck scaffolding carries no atom metadata.                                                                                                                             |
| Security                 | DTD/DOCTYPE/custom entities, malformed XML, behavior-bearing HTML/SVG, external resources, and unknown executable surfaces fail closed exactly as in C4 1.1.                                                                                                                                                                                                                                                                                                                                                                                                                                 |

The metadata schema is
`https://office180.dev/schemas/vector180-atom-metadata-0.1.schema.json`.

## Error Contracts

| Error                 | When                                                                                       | Code                                            |
| --------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| Unrecognized source   | Content is neither canonical Vector180 nor supported legacy PPTV                           | `VECTOR180-SCAN-UNRECOGNIZED`                   |
| Mixed namespace       | Both reserved dialects appear or the selected root/manifest/runtime disagree               | `VECTOR180-NAMESPACE-MIXED`                     |
| Wrong source kind     | A kind-specific loader receives another recognized kind                                    | `VECTOR180-DOCUMENT-KIND`                       |
| Invalid atom root/XML | Required canonical root state or namespace-aware XML is invalid                            | `VECTOR180-ATOM-ROOT`, `VECTOR180-SCAN-SVG-XML` |
| Invalid manifest      | Canonical JSON is malformed, duplicated, unknown, or inconsistent with HTML controls       | `VECTOR180-MANIFEST-INVALID`                    |
| Invalid metadata      | Recognized metadata is duplicated, malformed, oversized, over-deep, or violates its schema | `VECTOR180-METADATA-INVALID`                    |
| Legacy write          | A canonical mutation is requested against `pptv-legacy` source                             | `VECTOR180-LEGACY-WRITE-REQUIRES-MIGRATION`     |
| Migration kind        | Direct namespace migration is requested for legacy HTML/deck source                        | `VECTOR180-MIGRATION-KIND`                      |
| Migration failure     | Source cannot migrate and independently reload/compare without semantic drift              | `VECTOR180-MIGRATION-REFUSED`                   |

All existing source-size, structure-size, duplicate-ID, resource, executable,
and ambiguity failures remain fail-closed with Vector180-prefixed canonical
diagnostics. The frozen legacy read-compatibility API retains PPTV 0.1
diagnostics.

## Dependencies

- Depends on: none.
- Schema: `schemas/vector180-manifest-0.1.schema.json`.
- Schema: `schemas/vector180-atom-metadata-0.1.schema.json`.
- Schema: `schemas/vector180-migration-report-0.1.schema.json`.
- Cross-checks: `CONTRACT:C6-PPTV-RESOLVED.2.0` and `CONTRACT:C12-VECTOR180-SOURCE-DIFF.1.0`.
- External parsing dependencies remain pinned as in C4 1.1.

## Cross-references

- **Source docs:** `VECTOR180-PROFILE.md`, `VECTOR180-PROCESSING-API.md`, `VECTOR180-DESIGN-INDEX.md`.

## Future evolution

- The banked paragraph-intent/no-surprise-wrap profile requires a later
  source-profile revision; it is not admitted by Vector180 0.1.
- Legacy reads may be removed no earlier than a public Vector180 2.0 release.

## Retirement / supersession plan

- **Predecessor:** `CONTRACT:C4-PPTV-SOURCE.1.1` remains the frozen PPTV 0.1 behavioral authority.
- **Migration boundary:** canonical writers emit Vector180 only; legacy bytes migrate explicitly and retain an out-of-band proof report.
- **Migration owner:** Vector180 source-kernel maintainer.

## Implementing Files

- `packages/vector180/src/core/source.ts`
- `packages/vector180/src/core/scan.ts`
- `packages/vector180/src/core/manifest.ts`
- `packages/vector180/src/core/deck.ts`
- `packages/vector180/src/core/types.ts`
- `packages/vector180/src/ops/projections.ts`
- `packages/vector180/src/cli.ts`

## Test Requirements

- [x] Canonical atom/deck reads and projections use only Vector180 wire IDs.
- [ ] Every legacy PPTV 0.1 fixture still reads with exact bytes and hash.
- [ ] Cross-product mixed namespace fixtures fail before semantic loading.
- [ ] Atom migration is deterministic, range-minimal, independently reloadable, and C12-equivalent; direct legacy-deck migration refuses.
- [ ] Metadata schema, bounds, duplicate keys, hashing, preservation, and trust limits are exercised.
- [ ] Canonical metadata in deck HTML and structured legacy metadata refuse;
      unmarked inert legacy metadata migrates only as reported opaque bytes.
- [ ] The default atom scaffold carries only the honest default style-family
      assertion; deck scaffold and atom template lineage remain absent.
- [ ] No canonical writer emits a `data-pptv-*`, `--pptv-*`, or `pptv-*/0.*` control.

## Change History

| Version | Date       | Change                                                                                                                         | Migration                                                               |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| 1.1     | 2026-07-30 | Add first-class PPTV SVG atoms                                                                                                 | Superseded; retained for legacy reads                                   |
| 2.0     | 2026-08-02 | Make Vector180 the canonical atom/deck wire, add strict dialect selection, explicit migration, and inert atom lineage metadata | New writers emit Vector180; legacy PPTV remains bounded read-only input |
