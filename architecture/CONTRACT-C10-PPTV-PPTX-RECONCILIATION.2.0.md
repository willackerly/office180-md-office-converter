# CONTRACT-C10-PPTV-PPTX-RECONCILIATION.2.0

<!-- SUPERSEDES: CONTRACT-C10-PPTV-PPTX-RECONCILIATION.1.2 -->

**Version:** 2.0
**Status:** in-progress
**Owner:** Will Ackerly
**Type:** Component
**Cross-repo Promotability:** No
**Source:** `VECTOR180-IMPLEMENTATION-PLAN.md` Milestone 6 and `SVG-TO-EDITABLE-PPTX.md` §9

## Why this exists

An edited PPTX remains an authenticated branch of exact canonical Vector180
source, never replacement source. C10 2.0 moves maps, package lineage,
inspection, normalization, reports, resolutions, and proposed patches to one
Vector180 family while preserving every historical PPTV proof chain under its
predecessor.

## Who needs this

- **Vector180 authors** — need supported Office edits proposed back as reviewable source patches.
- **Agents/reviewers** — need deterministic findings, evidence, next actions, and elegant refusal context.
- **C5** — receives only complete canonical typed operations.
- **C11** — binds native lifecycle and visual evidence to exact source/map/package identities.

## Scenarios

### Scenario 1 — reconcile supported edits

An edited PPTX descends from a C9 2.0 baseline. C10 authenticates the canonical
atom, serialized map, package custom properties, optional native-save
comparison, and every mapped stable name before proposing a complete
`vector180-patch/0.1`.

### Scenario 2 — review one copied connector

Exactly one of two same-parent occurrences remains baseline-equivalent. A
reviewer supplies a strict `vector180-reconcile-resolution/0.1` document bound
to the exact unresolved report/finding, all current hashes/fingerprints, the
one allowed classification, fresh stable ID, explicit references,
parent/order, inverse endpoints, and complete style; no other finding remains.

### Scenario 3 — refuse a cross-family chain

A Vector180 atom is paired with a PPTV map/PPTX or vice versa. C10 emits a
family/lineage finding and no patch. It never translates custom properties,
map schemas, normalization IDs, or source hashes to make the chain appear
current.

## Interfaces

```ts
interface Vector180ReconciliationResult {
  readonly schema: "vector180-pptx-reconciliation/0.1";
  readonly status: "unchanged" | "patchable" | "review-required" | "refused";
  readonly sourceSha256: string;
  readonly baselineMapSha256: string;
  readonly editedPptxSha256: string;
  readonly nativeBaselinePptxSha256?: string;
  readonly changes: readonly Vector180OfficeChange[];
  readonly findings: readonly Vector180ReconciliationFinding[];
  readonly candidateOperations: readonly Vector180CandidateOperation[];
  readonly patch?: Vector180Patch;
}

function reconcileVector180Pptx(
  source: Vector180Atom,
  baseline: Vector180PptxMap,
  editedPptx: Uint8Array,
  options?: Vector180ReconciliationOptions,
): Promise<Vector180ReconciliationResult>;
```

Canonical related IDs are:

- `vector180-pptx-inspection/0.1`
- `vector180-pptx-reconciliation/0.1`
- `vector180-reconcile-resolution/0.1`
- `vector180-reconcile-result/0.1`
- `vector180-patch/0.1`

## Behavioral Contracts

| Behavior             | Specification                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Required family      | Exact canonical C4 2.0 atom, C9 2.0 `vector180-pptx-map/0.1`, and edited descendant carrying exact `vector180.*` lineage are required. Every family/schema/compiler/property must agree.                                                                                                                                                                                                                                                            |
| Hash binding         | Source, metadata digest when present, composed deck, canonical serialized map, compiler/placement, generated baseline, optional comparison baseline, edited PPTX, occurrence fingerprints, unresolved reconciliation report, finding ID, and resolution hashes are checked before semantic comparison.                                                                                                                                              |
| Persistent authority | Exact source, canonical C9 map, and authenticated before-side remain authority. Office producer/application metadata and atom descriptive metadata are evidence only.                                                                                                                                                                                                                                                                               |
| Inspection           | OPC parts, relationships, stable `src.<id>` occurrences, within-parent order, text, geometry, endpoints, group transforms, and complete supported style are parsed without Office automation. Numeric IDs and proximity never establish identity.                                                                                                                                                                                                   |
| Typed output         | Every automatically patchable difference maps to one C5 2.0 typed operation. There is no generic attribute, metadata, or namespace patch. Candidate application/regeneration/reinspection proves the complete transaction before `patchable`.                                                                                                                                                                                                       |
| No partial patch     | Any invalid, ambiguous, unsupported, stale, privacy-sensitive, or review-required finding omits `patch`; supported independent candidates may remain in the report for agent context.                                                                                                                                                                                                                                                               |
| Native baseline      | An authenticated exact PowerPoint no-op save may become the comparison before-side only after supported normalization proves semantic equivalence. It never replaces/weaken source or map lineage.                                                                                                                                                                                                                                                  |
| Normalization rules  | Current rules are renamed `vector180-c10/content-type-set/1`, `relationship-graph/1`, `relationship-reference/1`, `view-properties-inert/1`, `table-styles-inert/1`, `slide-size-preset-omitted/1`, `root-zero-group-transform/1`, `theme-empty-defaults/1`, `presentation-property-defaults/1`, `end-paragraph-style-marker-omitted/1`, and `generated-metadata/1`. Their structural predicates and fail-closed boundaries remain exactly C10 1.2. |
| Connector duplicate  | Duplicate identity refuses by default. One strict resolution is eligible only when exactly one of exactly two same-parent straight-connector occurrences remains baseline-equivalent and every other finding is resolved.                                                                                                                                                                                                                           |
| Resolution proof     | Resolution binds the unresolved report digest (SHA-256 over duplicate-free, recursively key-sorted compact UTF-8 JSON) and finding ID, source/map/edited/comparison hashes, both occurrence fingerprints, classification `one-baseline-equivalent-copy`, fresh ID, explicit existing references, parent/order, inverse endpoints, and complete style. Stale/incomplete/mismatched proof refuses.                                                    |
| Metadata             | C10 does not import or mutate atom metadata. Source/map hashes transitively bind it; a proposed C5 patch preserves it byte-for-byte.                                                                                                                                                                                                                                                                                                                |
| Privacy              | Reports recursively redact creator/author/user/account/company/private paths and raw private XML. Digests and non-personal version identities may remain.                                                                                                                                                                                                                                                                                           |
| Arbitrary import     | Baseline-free PPTX-to-Vector180 conversion, heuristic object matching, and unsupported structural recovery remain outside this contract.                                                                                                                                                                                                                                                                                                            |
| Legacy chains        | C10 1.2 reports, maps, packages, and resolutions remain frozen historical evidence. The Vector180 package may inspect their declared identity but does not generate or apply a legacy patch; use source migration plus a fresh C9/C10 chain. Canonical and legacy components never cross.                                                                                                                                                           |

## Error Contracts

| Error                          | When                                                                                   | Code                                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Invalid source/map             | Canonical source or map is incomplete, wrong schema, ambiguous, or inconsistent        | `VECTOR180-RECONCILE-INVALID-SOURCE`, `VECTOR180-RECONCILE-INVALID-BASELINE`                          |
| Family/lineage                 | Source, map, compiler, package properties, or family disagree                          | `VECTOR180-RECONCILE-FAMILY`, `VECTOR180-RECONCILE-LINEAGE`                                           |
| Stale source                   | Exact source hash differs from the map                                                 | `VECTOR180-RECONCILE-STALE-SOURCE`                                                                    |
| Invalid PPTX                   | OPC/XML/relationship/identity package cannot be inspected safely                       | `VECTOR180-RECONCILE-INVALID-PPTX`                                                                    |
| Missing/duplicate/ambiguous ID | Mapped stable identity is absent, repeated, or cannot be classified                    | `VECTOR180-RECONCILE-MISSING-ID`, `VECTOR180-RECONCILE-DUPLICATE-ID`, `VECTOR180-RECONCILE-AMBIGUOUS` |
| Unsupported delta              | Changed value or structure lacks a contracted inverse                                  | `VECTOR180-RECONCILE-UNSUPPORTED`                                                                     |
| Resolution                     | Schema/hash/fingerprint/classification/reference/order/style proof is stale or invalid | `VECTOR180-RECONCILE-RESOLUTION`                                                                      |
| Patch proof                    | Proposed C5 transaction fails validation/application/regeneration/reinspection         | `VECTOR180-RECONCILE-PATCH`                                                                           |

## Dependencies

- Depends on: `CONTRACT:C4-PPTV-SOURCE.2.0`.
- Depends on: `CONTRACT:C5-PPTV-PATCH.2.0`.
- Depends on: `CONTRACT:C6-PPTV-RESOLVED.2.0`.
- Depends on: `CONTRACT:C9-PPTV-PPTX-BASELINE.2.0`.
- Cross-checks: `CONTRACT:C11-OFFICE-VISUAL-EVIDENCE.1.2` binds separate native and visual evidence.
- Schema: `schemas/vector180-pptx-reconciliation-0.1.schema.json`.
- Schema: `schemas/vector180-reconcile-resolution-0.1.schema.json`.
- External: exact ZIP/XML dependencies already pinned by C9; no Office or OpenDocKit runtime dependency.

## Cross-references

- **Source docs:** `VECTOR180-PROCESSING-API.md`, `VECTOR180-TOOLING-AND-EDITOR.md`, `SVG-TO-EDITABLE-PPTX.md`.

## Future evolution

- Additional duplicate/object insertion, multiline text, assets, and native
  normalizations require counterexamples, real native evidence, and matched
  C5/C9/C10/C11 revisions.
- Baseline-free import remains a separate measured project.

## Retirement / supersession plan

- **Predecessor:** `CONTRACT:C10-PPTV-PPTX-RECONCILIATION.1.2` remains authority for historical PPTV chains.
- **Migration boundary:** complete chains remain in their original family; migrate source and regenerate C9 artifacts before using C10 2.0.
- **Migration owner:** Vector180 reconciliation maintainer.

## Implementing Files

- `packages/vector180/src/node/pptx-inspect.ts`
- `packages/vector180/src/node/pptx-normalization.ts`
- `packages/vector180/src/node/reconciliation-report.ts`
- `packages/vector180/src/node/reconcile-resolution.ts`
- `packages/vector180/src/node/reconcile.ts`
- `packages/vector180/src/cli.ts`
- `schemas/vector180-pptx-reconciliation-0.1.schema.json`
- `schemas/vector180-reconcile-resolution-0.1.schema.json`

## Test Requirements

- [ ] Complete Vector180 family/hash/lineage authentication passes and all cross-family combinations refuse.
- [x] Unchanged, supported typed edits, unsupported edits, stale chains, privacy redaction, and no-partial-patch behavior pass.
- [ ] Every normalization rule retains exact structural positive/negative fixtures under its new ID.
- [x] Reviewed connector resolution accepts only the one contracted classification and exact proof.
- [x] Temporary patch/regenerate/reinspect proof reaches semantic equality before `patchable`.
- [x] Historical C10 1.2 source/map/PPTX/report/patch bytes remain untouched.

## Change History

| Version | Date       | Change                                                                                    | Migration                                               |
| ------- | ---------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1.2     | 2026-08-02 | Add proof-carrying PPTV native normalization and reviewed connector-copy resolution       | Superseded; complete legacy chains retained             |
| 2.0     | 2026-08-02 | Bind inspection, normalization, reports, resolutions, and patches to Vector180 C9 lineage | Migrate source and regenerate the complete C9/C10 chain |
