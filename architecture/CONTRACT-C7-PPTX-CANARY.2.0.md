# CONTRACT-C7-PPTX-CANARY.2.0

<!-- SUPERSEDES: CONTRACT-C7-PPTX-CANARY.1.1 -->

**Version:** 2.0
**Status:** in-progress
**Owner:** Will Ackerly
**Type:** Artifact Compiler
**Cross-repo Promotability:** Yes — the strict OPC graph and deterministic STORE writer remain OpenDocKit contribution candidates
**Source:** `VECTOR180-IMPLEMENTATION-PLAN.md` §§4–5

## Why this exists

C7 proves that the strict Vector180 deck profile can produce a deterministic,
inspectable fresh PPTX without conflating package validity with visual
fidelity. Version 2.0 changes the accepted resolved schema and embedded lineage
to Vector180 while preserving the deliberately narrow C7 1.1 compiler subset.

## Who needs this

- **Vector180 deck/report authors** — need a bounded deterministic native-object canary.
- **C9** — reuses the package graph and primitive mapping.
- **C10/C11** — authenticate new package lineage and retain separate native/visual gates.
- **OpenDocKit collaboration** — may reuse the package graph without taking a source dependency.

## Scenarios

### Scenario 1 — compile a canonical deck

An exact `vector180-resolved-deck/0.1` model containing supported primitives
becomes a byte-deterministic PPTX. Stable object names remain
`src.<stable-id>`, while custom properties identify the Vector180 compiler,
resolved schema, active theme, and exact source hash.

### Scenario 2 — reject legacy relabeling

A `pptv-resolved/0.1` model or a package carrying `pptv.*` lineage is not
accepted as Vector180 merely because its values resemble the canonical model.
Historical C7 1.1 remains the validator for that artifact.

### Scenario 3 — package one C9-authenticated static PNG

The C9 caller supplies exact PNG bytes keyed to one resolved raster object's
slide ID, stable object ID, and immutable C4 descriptor. The shared C7 package
engine verifies the byte length and SHA-256, emits one content-addressed media
part and image relationship, and serializes the object as a stable-name
`p:pic`. The public resolved-deck-only C7 command does not invent or fetch
missing resource bytes.

## Interfaces

```ts
interface Vector180PptxCanaryArtifact {
  readonly schema: "vector180-pptx-canary/0.1";
  readonly compiler: "office180-vector180-pptx-canary/0.1";
  readonly sourceSha256: string;
  readonly bytes: Uint8Array;
  readonly sha256: string;
  readonly parts: readonly Vector180PptxPart[];
}

function compileVector180PptxCanary(
  input: Vector180ResolvedDeck | Vector180ResolvedDeckResult,
): Promise<Vector180PptxCanaryArtifact>;
```

CLI result schema is `vector180-pptx-canary-result/0.1`.

## Behavioral Contracts

| Behavior               | Specification                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accepted input         | Input is exactly one complete, error-free `vector180-resolved-deck/0.1` with the C6 2.0 fixed 1600×900 canvas and exact source SHA-256. Atom input remains outside C7; C9 handles explicit atom placement.                                                                                                                                                                                                                            |
| Primitive subset       | Plain rectangles, circles/ellipses, straight lines, nondegenerate translated groups, and one hard text line per native text object remain the public C7 subset. Unsupported content fails; there is no native-to-raster fallback.                                                                                                                                                                                                     |
| C9 raster extension    | The shared package engine additionally accepts C9-supplied exact bytes for C4/C6 `raster-asset` descriptors. Each supplied `(slideId, objectId)` entry must be consumed exactly once and match media type, SHA-256, byte length, and resolved descriptor; missing, extra, duplicate, or mismatched bytes fail. This internal package boundary does not make the resolved-deck-only `pptx-canary` command a general resource resolver. |
| Picture packaging      | A validated static PNG is stored once as `ppt/media/<sha256>.png`, related from its slide by deterministic image relationship IDs beginning at `rId2`, and emitted as `p:pic` with `p:cNvPr/@name="src.<stable-id>"`, `a:picLocks noChangeAspect="1"`, one embedded `a:blip`, `a:stretch/a:fillRect`, and unadjusted rectangle geometry. No JPEG, SVG picture, crop, effect, external target, or fallback rendering is admitted.      |
| Numeric mapping        | One SVG unit is exactly 7620 EMU and one font unit maps exactly to hundredth-points. Values requiring implicit rounding/clamping fail as in C7 1.1.                                                                                                                                                                                                                                                                                   |
| Authored text baseline | For the one-hard-line subset, signed `a:bodyPr/@tIns` is exactly `(line.y - frame.y - fontSize) × 7620` EMU within the bounded text-margin range. `lIns`, `rIns`, and `bIns` are zero; `anchor="t"`, `wrap="none"`, and exactly one empty `a:noAutofit` are required. The compiler names the declared font but does not claim that Quick Look or another renderer will avoid host-font substitution.                                  |
| Stable identity        | `p:cNvPr/@name` remains `src.<stable-id>`. Deterministic numeric IDs remain implementation details derived from stable IDs, never reconciliation authority.                                                                                                                                                                                                                                                                           |
| Compiler identity      | The emitted compiler is exactly `office180-vector180-pptx-canary/0.1`. Package application/title/theme labels say Vector180.                                                                                                                                                                                                                                                                                                          |
| Package lineage        | Custom properties are `vector180.compiler`, `vector180.resolvedSchema`, `vector180.activeTheme`, and `vector180.sourceSha256`. No `pptv.*` property appears in a canonical package.                                                                                                                                                                                                                                                   |
| OPC graph              | Content types, relationships, reachable parts, XML schemas, slide/master/layout/theme graph, content-addressed PNG media when supplied by C9, STORE-only deterministic ZIP order/timestamps, and ZIP32 limits are validated as one strict graph.                                                                                                                                                                                      |
| Text                   | Authored line membership, text, baseline, font/style, no-wrap, and no-autofit remain explicit. No compiler-side font substitution, inferred wrap, repair, or source mutation occurs.                                                                                                                                                                                                                                                  |
| Determinism            | Equal exact resolved input, authenticated raster resource table when present, compiler, and dependencies produce byte-identical package bytes across processes, time zones, and hosts within the checked environment.                                                                                                                                                                                                                 |
| Claims                 | Structural/compiler success is distinct from C8 text evidence, C11 renderer comparison, native open/save/reopen, representative edits, native PDF export, and human review. Quick Look is preview smoke and may substitute host fonts.                                                                                                                                                                                                |
| Legacy artifacts       | Existing C7 1.1 PPTX bytes, custom properties, hashes, validation records, and evidence remain immutable and are validated only by the predecessor path.                                                                                                                                                                                                                                                                              |

## Error Contracts

| Error                       | When                                                                              | Code                                                                       |
| --------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Unresolved/invalid model    | Input lacks the exact canonical schema/hash/canvas/order invariants               | `VECTOR180-PPTX-UNRESOLVED`, `VECTOR180-PPTX-INVALID-MODEL`                |
| Unsupported object/geometry | Object, text-line count, geometry, opacity, or transform lies outside the canary  | `VECTOR180-PPTX-UNSUPPORTED-OBJECT`, `VECTOR180-PPTX-UNSUPPORTED-GEOMETRY` |
| Numeric mapping             | Geometry/font values do not map exactly                                           | `VECTOR180-PPTX-NON-INTEGRAL-EMU`, `VECTOR180-PPTX-NON-INTEGRAL-FONT`      |
| Raster resource             | C9 resource bytes are missing, extra, duplicated, or disagree with the descriptor | `VECTOR180-PPTX-INVALID-MODEL`, `VECTOR180-PPTX-UNSUPPORTED-OBJECT`        |
| Identity                    | Deterministic native numeric IDs collide                                          | `VECTOR180-PPTX-ID-COLLISION`                                              |
| Package                     | OPC graph/XML/ZIP constraints fail                                                | `VECTOR180-PPTX-OPC-GRAPH`, `VECTOR180-PPTX-ZIP-LIMIT`                     |
| Family mismatch             | Legacy resolved or package lineage reaches the canonical compiler                 | `VECTOR180-PPTX-FAMILY`                                                    |

## Dependencies

- Depends on: `CONTRACT:C6-PPTV-RESOLVED.2.0`.
- Depends on: `CONTRACT:C8-PPTV-TEXT-FIT.2.0` for separately requested text evidence.
- Reused by: `CONTRACT:C13-VECTOR180-DECK-EXPORT.0.1`; this does not widen the
  public C7 canary command or its lineage identity.
- External: exact `jszip@3.10.1`; no OpenDocKit runtime dependency.

## Cross-references

- **Source docs:** `VECTOR180-IMPLEMENTATION-PLAN.md`, `SVG-TO-EDITABLE-PPTX.md`.

## Future evolution

- Multiline hard lines, mutable pictures, SVG/JPEG media, and additional
  native objects require matched source/resolved/compiler/reconciliation/visual
  fixtures.
- C7 remains a canary; direct atom compilation belongs to C9 and bounded
  complete-deck export belongs to C13.

## Retirement / supersession plan

- **Predecessor:** `CONTRACT:C7-PPTX-CANARY.1.1` remains authority for historical PPTV packages.
- **Migration boundary:** regenerate from canonical Vector180 source; never rewrite lineage in an existing PPTX.
- **Migration owner:** Vector180 PPTX compiler maintainer.

## Implementing Files

- `packages/vector180/src/node/pptx-canary.ts`
- `packages/vector180/src/cli.ts`

## Test Requirements

- [x] Exact canonical input/schema/custom-property/compiler IDs are enforced.
- [ ] Complete primitive, text, numeric, ID, OPC, XML-schema, and ZIP corpus passes.
- [x] Legacy resolved input and mixed lineage fail without an artifact.
- [x] Equal canonical input produces byte-identical PPTX in separate processes/time zones.
- [x] C9-authenticated static PNG bytes produce deterministic content-addressed
      media, image relationships, stable-name `p:pic` objects, and strict
      missing/extra/mismatch refusals.
- [x] Authored SVG baselines map to signed `tIns` with fixed no-wrap,
      no-autofit, zero-side/bottom-margin text-body state.
- [ ] Existing C7 1.1 artifacts remain byte-identical and independently valid.

## Change History

| Version | Date       | Change                                                                                                               | Migration                                                   |
| ------- | ---------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1.1     | 2026-07-29 | Correct C7 text/geometry mapping and verify the PPTV canary                                                          | Superseded; historical package proof retained               |
| 2.0     | 2026-08-05 | Consume Vector180 resolved decks; add authored-baseline text mapping and C9-authenticated static-PNG package support | Regenerate from canonical source; do not relabel PPTX bytes |
