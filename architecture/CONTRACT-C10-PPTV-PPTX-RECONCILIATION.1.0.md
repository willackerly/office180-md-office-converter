# CONTRACT-C10-PPTV-PPTX-RECONCILIATION.1.0

**Version:** 1.0
**Status:** in-progress
**Owner:** Will Ackerly
**Type:** Component
**Cross-repo Promotability:** No
**Source:** `PPTV-IMPLEMENTATION-PLAN.md` Milestone 6 and
`SVG-TO-EDITABLE-PPTX.md` §9

## Why this exists

An edited PowerPoint file is an editable branch of canonical PPTV source, not a
replacement source format. Reconciliation must recover stable supported edits,
ignore incidental Office serialization, and produce a reviewable semantic
patch without overwriting either the human-edited presentation or the
authoritative SVG/deck.

## Who needs this

- **PPTV authors** — need reviewed PowerPoint changes to return to stable source
  instead of being lost on regeneration.
- **C5 patch consumers** — need only typed, source-hash-bound operations that
  can be applied atomically and independently revalidated.
- **C9 compilers** — need reconciliation to prove that their object identity,
  baseline map, and editability are sufficient for a real round trip.
- **Review and CI systems** — need explicit patchable, review-required, and
  refused states rather than heuristic success.

## Scenarios

### Scenario 1 — supported text and geometry edit

A user changes one native label and moves one native rectangle in PowerPoint.
The inspector matches both by unique `src.<stable-id>` names, verifies the
source and baseline hashes, normalizes their supported DrawingML values, and
returns the minimal typed C5 operations with old-value preconditions. It writes
neither source nor PPTX.

### Scenario 2 — duplicate identity after copy

A user copies a mapped shape, so two Office objects now carry the same source
name. Reconciliation reports the duplicate, produces no automatically
applicable patch, and asks for reviewed ID allocation rather than selecting the
first object or inventing identity from z-order.

### Scenario 3 — independently changed source

The source file no longer matches the C9 baseline hash. Reconciliation refuses
the two-way overwrite. The caller must supply the correct baseline or perform a
separate three-way source merge.

## Interfaces

```ts
type PptvReconciliationStatus =
  "unchanged" | "patchable" | "review-required" | "refused";

interface PptvReconciliationResult {
  readonly schema: "pptv-pptx-reconciliation/0.1";
  readonly status: PptvReconciliationStatus;
  readonly sourceSha256: string;
  readonly baselineMapSha256: string;
  readonly editedPptxSha256: string;
  readonly changes: readonly PptvOfficeChange[];
  readonly patch?: PptvPatch;
  readonly diagnostics: readonly Diagnostic[];
}

function reconcilePptx(
  source: PptvDeck | PptvDiagram,
  baseline: PptvPptxMap,
  editedPptxBytes: Uint8Array,
): Promise<PptvReconciliationResult>;
```

The public CLI is read-only with respect to source and presentation:

```text
pptv reconcile edited.pptx \
  --source diagram.pptv.svg \
  --baseline diagram.pptv.map.json \
  --patch proposed.pptv.patch.json \
  --report reconciliation.json
```

`--patch` is written only when the status is `patchable`. Destinations are
explicit, atomic, and must not exist. Applying the returned patch remains a
separate `pptv patch` action.

The implemented bounded slice accepts the C9 standalone-atom maps produced by
either `identity` or `uniform-scale-translate` placement. It proposes
`pptv-patch/0.2` operations for direct single-hard-line text, true rect/ellipse
geometry, connector endpoints, explicitly represented group translation,
direct one-line text frame/anchor, pure within-parent order, safe subtree
deletion, and concrete style properties that already have direct SVG
presentation attributes. Before returning `patchable`, it applies the complete
proposal to temporary source and regenerates the exact C9 placement, including
a finite-positive uniform transform when present. Reparenting, group scaling,
circle-to-ellipse representation changes, implicit transforms, inherited or
inline style rewrites, and unsupported DrawingML remain `review-required` or
`refused`.

## Behavioral Contracts

| Behavior                   | Specification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Required lineage           | Exact canonical C4 source, a complete C9 map with its hash-bound composed-deck identity, and an edited PPTX descended from the mapped compiler baseline are all required.                                                                                                                                                                                                                                                                                                                                                         |
| Hash binding               | Atom hash, composed-deck hash, map hash, embedded compiler/placement identities, and edited PPTX hash are checked before semantic comparison. The embedded `pptv.atomSha256` must identify the canonical atom, while reserved `pptv.sourceSha256` identifies the exact composed deck.                                                                                                                                                                                                                                             |
| Stable matching            | `src.<stable-id>` names are the primary identity. Numeric Office IDs, array indexes, geometry proximity, text equality, and z-order never substitute for a missing or duplicate stable name.                                                                                                                                                                                                                                                                                                                                      |
| Raw ZIP inventory          | Before JSZip decoding, the inspector validates central-directory and local-header names and rejects exact, case-folded, or path-normalized collisions and central/local filename disagreement as `PPTV-RECONCILE-INVALID-PPTX`.                                                                                                                                                                                                                                                                                                   |
| Supported normalization    | The inspector normalizes only C9-supported DrawingML text, exact transforms, connector endpoints, group transforms, literal solid/none paint, line width, exact single-run font/alignment style, deletion, and within-parent order. Namespace/prefix/part-order/XML trivia are ignored. Parsed semantic values alone are masked from structural signatures; an unparsed attribute or child still changes structure.                                                                                                               |
| Implemented patch slice    | Direct one-line text produces `set-text`. Rect and true-ellipse bounds produce `set-object-geometry`; line transforms produce `set-connector-endpoints`; explicit group offsets produce `set-group-translation`; text bounds plus paragraph anchor produce `set-text-frame`; pure sibling permutations produce `set-child-order`; safe missing subtrees produce `delete-object`; and exactly parsed, directly represented style produces `set-native-style`. Every new operation carries the complete mandatory C5 1.2 old value. |
| Composition transform      | Identity and uniform C9 maps are authenticated and deterministically regenerated with the exact recorded placement. Every accepted coordinate or length is inverted through the recorded finite-positive scale and applicable top-level translation, then checked by exact forward EMU or hundredth-point reconstruction. Child-local coordinates do not receive the root translation.                                                                                                                                            |
| Text baseline retention    | DrawingML carries the frame and horizontal paragraph anchor but not the authored SVG baseline Y. A text-frame edit retains the exact source `line.y - frame.y` offset and applies it to the new frame. C5/C6 then reject an anchor outside the new frame.                                                                                                                                                                                                                                                                         |
| Typed output               | Every automatically patchable difference maps to a contracted typed C5 operation with an old-value precondition. There is no generic attribute patch.                                                                                                                                                                                                                                                                                                                                                                             |
| Minimality                 | Unchanged objects produce no operation. One supported semantic change produces exactly its smallest safe operation unless object-kind invariants require an atomic compound operation.                                                                                                                                                                                                                                                                                                                                            |
| Deletion                   | A missing known object maps to one deletion root; descendants of an already missing group do not create competing operations. C5 rejects roots, opaque objects, unsafe ranges, and references from surviving connectors. A connector deleted in the same transaction is considered before the hazard decision.                                                                                                                                                                                                                    |
| New/copied objects         | An unexpected or duplicate object never receives an inferred source ID automatically. It is review-required or refused until explicit ID allocation and structural insertion are contracted.                                                                                                                                                                                                                                                                                                                                      |
| Group/order scope          | Reordering is representable only as a complete permutation within one mapped parent with no deletion in that parent. Cross-parent moves, regrouping, flattening, group scaling, or ungrouping are review-required/refused. Group translation is patchable only when extents and child coordinate space remain byte-semantically unchanged and the source already has `transform`.                                                                                                                                                 |
| Opaque assets              | Internal edits to an SVG/raster asset are never reverse-engineered. Whole-asset replacement requires an explicit future resource operation.                                                                                                                                                                                                                                                                                                                                                                                       |
| Unsupported Office changes | Rotation, effects, unsupported shapes, master/layout edits, notes, animation, hidden fallback content, or other out-of-profile changes are reported and never silently dropped.                                                                                                                                                                                                                                                                                                                                                   |
| No implicit mutation       | Reconciliation never writes or replaces source, map, baseline PPTX, or edited PPTX.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Patch validation           | A proposal uses `pptv-patch/0.2` and must pass C5 1.2 validation and all-or-nothing application against the exact source before status can be `patchable`.                                                                                                                                                                                                                                                                                                                                                                        |
| Regeneration proof         | A patchable result requires applying the patch to temporary source, C4/C6 reload, and C9 regeneration with the exact recorded identity or uniform placement. The regenerated PPTX is independently reinspected, and its supported object inventory, hierarchy/order, structure-with-semantic-masks, text, typed geometry, and typed style must equal the edited branch. Promotion additionally requires C11 visual/native evidence.                                                                                               |
| Arbitrary import           | Baseline-free arbitrary PPTX-to-PPTV conversion is outside this contract.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## Error Contracts

| Error                | When                                                                                          | Code                              |
| -------------------- | --------------------------------------------------------------------------------------------- | --------------------------------- |
| Invalid source       | Canonical source is incomplete, ambiguous, or does not resolve                                | `PPTV-RECONCILE-INVALID-SOURCE`   |
| Invalid baseline     | Map schema, inventory, finite-positive transform, composed-deck binding, or digest is invalid | `PPTV-RECONCILE-INVALID-BASELINE` |
| Stale source         | Canonical source hash differs from the baseline                                               | `PPTV-RECONCILE-STALE-SOURCE`     |
| Lineage mismatch     | Edited package lacks or contradicts compiler/source/map identity                              | `PPTV-RECONCILE-LINEAGE`          |
| Invalid package      | OPC/ZIP/XML graph cannot be inspected safely                                                  | `PPTV-RECONCILE-INVALID-PPTX`     |
| Missing identity     | A visible supported Office object lacks a stable mapped name                                  | `PPTV-RECONCILE-MISSING-ID`       |
| Duplicate identity   | More than one Office object claims one mapped stable ID                                       | `PPTV-RECONCILE-DUPLICATE-ID`     |
| Unsupported change   | A changed object/field cannot map to the supported profile                                    | `PPTV-RECONCILE-UNSUPPORTED`      |
| Ambiguous structure  | Cross-parent order/group changes or unsafe source ranges have more than one interpretation    | `PPTV-RECONCILE-AMBIGUOUS`        |
| Invalid patch        | Proposed operations do not pass current C5 validation                                         | `PPTV-RECONCILE-PATCH`            |
| Existing destination | A requested report/patch path already exists                                                  | `PPTV-RECONCILE-EXISTS`           |

Errors that affect identity, lineage, or package trust set status `refused` and
omit `patch`. Representable supported changes may coexist with
`review-required` findings, but automation still omits the combined patch
until the unsupported findings are dispositioned.

## Dependencies

- Depends on: `CONTRACT:C4-PPTV-SOURCE.1.1`
- Depends on: `CONTRACT:C5-PPTV-PATCH.1.2`
- Depends on: `CONTRACT:C6-PPTV-RESOLVED.1.1`
- Depends on: `CONTRACT:C9-PPTV-PPTX-BASELINE.1.0`
- Depends on: `CONTRACT:C11-OFFICE-VISUAL-EVIDENCE.1.0`
- External: ZIP/XML parsing only; OpenDocKit may be an independent oracle but
  is not canonical identity authority

## Cross-references

- **Source docs:** `PPTV-PROFILE.md` §Reverse inspector and patcher,
  `PPTV-IMPLEMENTATION-PLAN.md` Milestone 6,
  `SVG-TO-EDITABLE-PPTX.md` §9

## Future evolution

- Baseline-free import requires a separate contract and cannot weaken lineage
  checks here.
- Source/profile 0.1.1 paragraph intent and overflow grace require their own
  versioned source/compiler/import rules.
- Accepted insertion, duplication, asset replacement, cross-parent move, group
  scaling, or implicit representation creation requires canonical structural
  serialization and successor typed C5 operations first.

## Implementing Files

- `packages/pptv/src/node/pptx-inspect.ts`
- `packages/pptv/src/node/reconcile.ts`
- `packages/pptv/src/cli.ts`

## Test Requirements

- [x] Identity and uniform no-op baselines yield `unchanged` and no patch
- [x] Direct single-line text edit and explicit review-required run, line,
      group-scale, reparent, implicit-transform, inline-style, and package changes
- [x] One minimal old-value-preconditioned C5 `set-text` operation per
      supported text change
- [x] Stale/tampered map and lineage refusals
- [x] Missing/duplicate identity refusals
- [x] No source/PPTX write on every exercised success and failure path
- [x] Temporary text-patch application, C4/C6 reload, and identity/uniform C9
      regeneration
- [x] Rect/ellipse geometry, endpoint, explicit translation, direct text frame,
      supported style, safe deletion, and within-parent order typed C5 operations
- [x] Identity and uniform exact inverse-placement fixtures
- [x] Raw duplicate/path-equivalent ZIP, stripped lineage, copied identity,
      unsupported run, group scaling, and cross-parent move refusal corpus
- [x] Supported structural/semantic equality after C5 apply and C9 regeneration
- [x] C11 source/recovered browser and edited/regenerated Quick Look
      same-renderer comparisons
- [ ] Native PowerPoint representative edit/save/reopen and cross-renderer
      comparison of the regenerated result

## Change History

| Version | Date       | Change                                                                                                                                                                   | Migration      |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| 1.0     | 2026-08-01 | Initial baseline-aware reconciliation contract with typed C5 1.2 native-object patches, fail-closed DrawingML/ZIP inspection, and exact identity/uniform C9 regeneration | No predecessor |
