# CONTRACT-C10-PPTV-PPTX-RECONCILIATION.1.2

<!-- SUPERSEDED BY: CONTRACT-C10-PPTV-PPTX-RECONCILIATION.2.0 -->
<!-- SUPERSEDES: CONTRACT-C10-PPTV-PPTX-RECONCILIATION.1.0 -->

**Version:** 1.2
**Status:** superseded
**Owner:** Will Ackerly
**Type:** Component
**Cross-repo Promotability:** No
**Source:** `PPTV-IMPLEMENTATION-PLAN.md` Milestone 6 and
`SVG-TO-EDITABLE-PPTX.md` §9

## Why this exists

An edited PowerPoint file is a branch of canonical PPTV source, not a
replacement source format. Reconciliation must authenticate its C9 lineage,
recover only supported stable-ID edits, distinguish incidental Office
serialization through narrow structural proofs, and return a deterministic
reviewable patch without overwriting either branch.

A common native gesture is copying and moving one straight connector. Duplicate
identity remains a refusal by default. Only an explicit, hash- and
fingerprint-bound review document may identify one baseline-equivalent
occurrence, allocate a fresh stable ID, declare source references, and request
the single same-parent connector clone contracted by C5 1.3.

## Who needs this

- **PPTV authors** — return reviewed PowerPoint changes to stable source
  without accepting save noise.
- **Agents and reviewers** — receive ranked deterministic findings, exact
  evidence, resolution choices, and blocked candidate operations without
  private author metadata.
- **C5 consumers** — receive only a complete source-hash-bound typed
  transaction that independently validates and regenerates.
- **C9 compilers** — prove their stable identity, map, placement, and
  editability support a bounded round trip.
- **Review and CI systems** — distinguish unchanged, patchable,
  review-required, and refused states.

## Scenarios

### Scenario 1 — supported text and geometry edit

A user edits one native label and moves one rectangle. C10 matches both by
unique `src.<stable-id>`, authenticates source/map/baseline identity, inverts
the C9 placement exactly, and proposes minimal old-value-preconditioned C5
operations. It writes neither source nor PPTX.

### Scenario 2 — native save plus a later edit

A generated baseline is opened and saved in PowerPoint. The exact native-save
bytes are supplied as `nativeBaselinePptxBytes`; C10 first proves their
supported semantics equal deterministic C9 regeneration, then uses only named
structural normalizations and compares the later edit against those exact
bytes.

### Scenario 3 — reviewed copied connector

An edited PPTX has exactly two occurrences of one mapped connector. Exactly one
matches the authenticated comparison occurrence's composite fingerprint; a
reviewer allocates a new stable ID and supplies exact hashes, both occurrence
fingerprints, source references, inverse endpoints/style, and insertion order.
C10 emits one `clone-connector` only after C5 apply and C9 regeneration prove
the complete result.

### Scenario 4 — ambiguous identity or stale source

Both copies changed, neither changed, another duplicate exists, the source no
longer matches the map, or a structural predicate is only a near match. C10
refuses or requires review; it never chooses by numeric ID, geometry, text,
connection, z-order, producer name, or observed corpus membership.

## Interfaces

```ts
type PptvReconciliationStatus =
  "unchanged" | "patchable" | "review-required" | "refused";

interface PptvReconcileResolution {
  readonly schema: "pptv-reconcile-resolution/0.1";
  readonly sourceSha256: string;
  readonly baselineMapSha256: string;
  readonly editedPptxSha256: string;
  readonly comparisonPptxSha256: string;
  readonly duplicateId: string;
  readonly newId: string;
  readonly baselineOccurrenceFingerprintSha256: string;
  readonly copiedOccurrenceFingerprintSha256: string;
  readonly parentId: string;
  readonly oldOrder: readonly string[];
  readonly order: readonly string[];
  readonly connector: {
    readonly fromId: string;
    readonly toId: string;
    readonly endpoints: { x1: number; y1: number; x2: number; y2: number };
    readonly style: PptvConcreteNativeStyle;
  };
}

interface PptvReconciliationOptions {
  readonly nativeBaselinePptxBytes?: Uint8Array;
  readonly resolution?: PptvReconcileResolution;
}

interface PptvReconciliationResult {
  readonly schema: "pptv-pptx-reconciliation/0.2";
  readonly status: PptvReconciliationStatus;
  readonly sourceSha256: string;
  readonly baselineMapSha256: string;
  readonly editedPptxSha256: string;
  readonly nativeBaselinePptxSha256?: string;
  readonly changes: readonly PptvOfficeChange[];
  readonly summary: PptvReconciliationSummary;
  readonly findings: readonly PptvReconciliationFinding[];
  readonly candidateOperations: readonly PptvCandidateOperation[];
  readonly patch?: PptvPatch;
  readonly diagnostics: readonly Diagnostic[];
}

function reconcilePptx(
  source: PptvDeck | PptvDiagram,
  baseline: PptvPptxMap,
  editedPptxBytes: Uint8Array,
  options?: PptvReconciliationOptions,
): Promise<PptvReconciliationResult>;
```

Persistent schemas:

```text
schemas/pptv-pptx-reconciliation-0.2.schema.json
schemas/pptv-reconcile-resolution-0.1.schema.json
```

The compatibility `changes`, `diagnostics`, and optional `patch` fields remain.
`summary`, `findings`, and `candidateOperations` are the agent-grade
presentation. Without a reviewed clone the applicable transaction is
`pptv-patch/0.2`; a successful resolution may produce
`pptv-patch/0.3` containing exactly one `clone-connector`.

The CLI is read-only with respect to source and presentation:

```text
pptv reconcile edited.pptx \
  --source diagram.pptv.svg \
  --baseline diagram.pptv.map.json \
  [--native-baseline saved-by-powerpoint.pptx] \
  [--resolution reviewed-resolution.json] \
  --patch proposed.pptv.patch.json \
  --report reconciliation.json
```

`--patch` is written only for `patchable`. Destinations are explicit, atomic,
and must not exist. Patch application remains a separate `pptv patch` action.

The bounded slice accepts C9 standalone-atom maps with `identity` or
`uniform-scale-translate` placement. It supports direct single-hard-line text,
true rect/ellipse geometry, connector endpoints, explicit group translation,
direct one-line text frame/anchor, within-parent order, safe subtree deletion,
direct concrete style, and the one reviewed connector clone.

## Behavioral Contracts

### Authority, inspection, and ordinary edits

| Behavior                         | Specification                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Required lineage                 | Exact canonical C4 source, complete C9 map with hash-bound composed-deck identity, and an edited PPTX descended from the mapped compiler baseline are required.                                                                                                                                                                                                                       |
| Hash binding                     | Atom, composed-deck, map, embedded compiler/placement, comparison, and edited PPTX hashes are checked before semantic comparison. `pptv.atomSha256` identifies the atom; reserved `pptv.sourceSha256` identifies the composed deck.                                                                                                                                                   |
| Persistent authority             | Exact C4 source, canonical C9 map, and authenticated comparison baseline remain authority. Office metadata and producer versions are evidence only.                                                                                                                                                                                                                                   |
| Stable matching                  | `src.<stable-id>` names are primary identity. Numeric/creation IDs, indexes, geometry, connections, text, z-order, and painter order never substitute.                                                                                                                                                                                                                                |
| Raw ZIP inventory                | Before JSZip decoding, central-directory and local-header names are checked. Exact, case-folded, or normalized collisions and central/local disagreement are invalid PPTX.                                                                                                                                                                                                            |
| Supported semantic normalization | C10 parses only C9-supported DrawingML text, exact transforms/endpoints/group transforms, literal solid/none paint, line width, exact single-run font/alignment style, deletion, and within-parent order. Namespace, prefix, part order, and XML trivia are ignored. Parsed semantic values alone are masked from structural signatures; unparsed attributes/children remain changes. |
| Implemented patch slice          | Direct text maps to `set-text`; rect/ellipse bounds to `set-object-geometry`; line transforms to `set-connector-endpoints`; explicit group offsets to `set-group-translation`; text bounds/anchor to `set-text-frame`; sibling permutations to `set-child-order`; safe missing subtrees to `delete-object`; direct style to `set-native-style`. Each carries complete C5 old values.  |
| Composition transform            | Identity and uniform C9 maps are authenticated and regenerated with exact placement. Coordinates and lengths invert through finite-positive scale and applicable root translation, then forward-reconstruct exactly in EMU or hundredth points. Child-local coordinates do not receive root translation.                                                                              |
| Text baseline retention          | DrawingML does not carry authored SVG baseline Y. A frame edit retains exact source `line.y - frame.y`; C5/C6 reject an anchor outside the new frame.                                                                                                                                                                                                                                 |
| Typed output                     | Every automatically patchable difference maps to a contracted typed C5 operation; there is no generic attribute patch.                                                                                                                                                                                                                                                                |
| Minimality                       | Unchanged objects produce no operation. One semantic change produces its smallest safe operation unless object invariants require an atomic compound operation.                                                                                                                                                                                                                       |
| Deletion                         | A missing known object maps to one deletion root; descendants of a missing group do not compete. C5 rejects roots, opaque objects, unsafe ranges, and surviving connector references after considering same-transaction connector deletion.                                                                                                                                           |
| New or copied objects            | Unexpected or duplicate objects never receive inferred identity automatically. Only the reviewed connector protocol below admits one insertion.                                                                                                                                                                                                                                       |
| Group/order scope                | Reordering is a complete same-parent permutation with no deletion in that parent. Cross-parent moves, regrouping, flattening, group scaling, or ungrouping refuse/review. Group translation is patchable only with unchanged extents/child coordinates and an existing source transform.                                                                                              |
| Opaque assets                    | Internal SVG/raster asset edits are not reverse engineered. Whole-asset replacement requires a future resource operation.                                                                                                                                                                                                                                                             |
| Unsupported Office changes       | Rotation, effects, unsupported shapes, master/layout edits, notes, animation, hidden fallback content, and other out-of-profile changes remain visible and never silently drop.                                                                                                                                                                                                       |
| No text weakening                | Text remains one explicit hard line, no wrap, and no autofit under source/profile 0.1. Normalization never infers paragraphs/wrapping or discards text/style deltas.                                                                                                                                                                                                                  |
| No implicit mutation             | Reconciliation never writes or replaces source, map, generated/native baseline, or edited PPTX.                                                                                                                                                                                                                                                                                       |
| Arbitrary import                 | Baseline-free PPTX-to-PPTV conversion remains outside this contract.                                                                                                                                                                                                                                                                                                                  |

### Proof-carrying native-save normalization and report

| Behavior              | Specification                                                                                                                                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native baseline       | Optional native bytes pass complete ZIP, OPC, XML, lineage, inventory, and identity inspection. After contracted normalization, supported inventory, hierarchy, order, structure, text, geometry, and style must equal deterministic C9 regeneration or reconciliation refuses. |
| Comparison point      | An authenticated native baseline becomes the exact before-side and its SHA-256 is reported. It never replaces or weakens the map/generated baseline.                                                                                                                            |
| Identity state        | Every mapped ID is `unique`, `missing`, or `duplicate` with occurrence evidence. Only `unique` enters ordinary comparison; `missing` may enter safe deletion; `duplicate` is a trust failure and never becomes deletion.                                                        |
| Duplicate evidence    | Each occurrence reports parseable kind, numeric ID, parent, order, typed geometry/style, resolved connections, creation-ID presence, and local semantic parse errors. None is selected automatically.                                                                           |
| Rule selection        | Every normalization rule requires all structural predicates. Producer/version, OS, application metadata, or corpus membership never selects or weakens it.                                                                                                                      |
| Fail closed           | Unknown child/attribute, extra occurrence, failed predicate, out-of-domain value, affected content, unresolved relationship, or near match remains a difference or invalid package.                                                                                             |
| Content types         | `pptv-c10/content-type-set/1` treats duplicate-free `Default` and `Override` declarations as semantic sets and removes only exact accepted inert optional parts.                                                                                                                |
| Relationship graph    | `pptv-c10/relationship-graph/1` ignores declaration order and incidental unique relationship IDs only after safe internal-target resolution. `pptv-c10/relationship-reference/1` replaces resolved `r:id` references with relationship type, mode, and target.                  |
| View properties       | `pptv-c10/view-properties-inert/1` excludes only the exact bounded `viewProps.xml`, matching content type, and one matching internal presentation relationship.                                                                                                                 |
| Table styles          | `pptv-c10/table-styles-inert/1` excludes only the exact empty default table-style list, matching content type, one relationship, and a package with no table, graphic-frame, chart, or image content.                                                                           |
| Slide size            | `pptv-c10/slide-size-preset-omitted/1` restores only omitted `screen16x9` when extents are exactly `12192000 × 6858000` EMU.                                                                                                                                                    |
| Root transform        | `pptv-c10/root-zero-group-transform/1` removes only one attribute-free root `a:xfrm` containing exactly `off`, `ext`, `chOff`, and `chExt`, all coordinates zero, with no rotation, flip, or extra content.                                                                     |
| Theme defaults        | `pptv-c10/theme-empty-defaults/1` removes only empty, attribute-free `objectDefaults` and `extraClrSchemeLst`.                                                                                                                                                                  |
| Presentation defaults | `pptv-c10/presentation-property-defaults/1` removes only the exact three known image/chart default extensions when the package has no image, chart, table, or graphic-frame content.                                                                                            |
| Existing text marker  | `pptv-c10/end-paragraph-style-marker-omitted/1` accepts an omitted `a:endParaRPr` only for one complete existing paragraph/run with fully parsed run style. A present marker exactly equals run style; the rule says nothing about inserted text.                               |
| Generated metadata    | `pptv-c10/generated-metadata/1` marks `docProps/app.xml` and `docProps/core.xml` non-authoritative save evidence. Custom lineage remains exact authority; private author/company/account values never enter reports.                                                            |
| Patch planning        | Supported unique-object changes map to the smallest old-value-preconditioned operation. The complete transaction validates and regenerates before becoming patchable.                                                                                                           |
| Candidate operations  | Supported typed operations remain visible when another finding blocks them. Each records applicability, every blocking finding ID, and regeneration-proof state. A blocked candidate is not a patch.                                                                            |
| Report determinism    | Finding and operation IDs derive from canonical semantic content. Findings sort by disposition, effect, scope, then ID; equal inputs produce byte-semantically equal report data.                                                                                               |
| Report dispositions   | `auto-fixable` is a proven normalization or supported typed source delta; `review-required` lacks a contracted inverse; `refused` means source, lineage, package, identity, baseline, resolution, or patch trust failed. Review/refusal blocks the complete transaction.        |
| Evidence              | Normalization findings name rule, scope, occurrence count, predicates, and available part digests. Source changes contain exact semantic before/after values. Trust findings explain boundaries and concrete resolution options.                                                |
| Privacy               | Report construction recursively redacts `lastModifiedBy`, creator, author, user/name, account, and company fields. Digests and non-personal versions may remain; raw private XML values never do.                                                                               |

### Reviewed connector-copy resolution

| Behavior                   | Specification                                                                                                                                                                                                                                                                                               |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default refusal            | A duplicate without `resolution` remains refused, reports every occurrence, and produces no patch. C10 never creates a resolution or allocates an ID.                                                                                                                                                       |
| Exact review binding       | Resolution binds exact source, canonical serialized map, edited PPTX, and authenticated comparison PPTX SHA-256 values. Any mismatch is a resolution trust error.                                                                                                                                           |
| Strict document            | No fields are unknown or omitted. Digests are lowercase SHA-256, IDs obey C5 grammar, arrays contain unique IDs, numbers are finite, endpoints are nondegenerate, and style is complete.                                                                                                                    |
| One duplicate              | Complete edited inspection contains exactly one duplicated mapped identity with exactly two occurrences, named by `duplicateId`. Any other duplicate remains unresolved.                                                                                                                                    |
| Connector only             | The source template and both edited occurrences are strict supported straight `p:cxnSp` connectors with complete geometry/style and no semantic parse error.                                                                                                                                                |
| Composite fingerprint      | Fingerprint includes supported kind, mapped parent, direct-child order, full structure signature, line geometry, style, connection evidence, and creation-ID presence. Structure masks only the stable-name and Office numeric-ID values required for reviewed rename comparison.                           |
| Baseline separation        | The authenticated comparison occurrence has one fingerprint and exactly one edited occurrence must match it. Zero matches means both copies changed/structure drifted; two is ambiguous. Both refuse.                                                                                                       |
| Exact occurrence review    | Resolution carries exact baseline and copied fingerprints and cannot replay after either changes.                                                                                                                                                                                                           |
| Fresh identity             | `newId` differs from `duplicateId` and is absent from source root and complete object inventory. C10 never repairs collisions.                                                                                                                                                                              |
| Same parent                | Both occurrences remain in the mapped template parent and `parentId` names its source root/group. Reparenting is not recoverable.                                                                                                                                                                           |
| Explicit references        | `fromId` and `toId` are reviewer choices naming existing mapped source objects. Geometry, PowerPoint connections, numeric IDs, and proximity never infer them.                                                                                                                                              |
| Exact inverse              | Copied endpoints/style invert exactly through C9 to finite source values. Changed style properties require C5 direct SVG representation, and resolution repeats the exact inverse values.                                                                                                                   |
| One insertion order        | `oldOrder` is complete source sibling order. `order` replaces the copied occurrence with `newId`, adds exactly that ID, and preserves all old relative order. Gaps, ties, reorder, deletion, or reparenting refuse.                                                                                         |
| Complete transaction       | Success emits `pptv-patch/0.3` with exactly one clone plus independent supported operations. Any other review/refusal finding blocks and omits it.                                                                                                                                                          |
| C5/C9 proof                | C10 applies the complete transaction in memory, recompiles exact C9 placement, re-inspects, and requires exact normalized supported slide semantics. It compares the reviewed occurrence through `newId`; PPTX bytes are never rewritten to manufacture proof.                                              |
| Resolution report evidence | Duplicate findings include comparison hash, occurrence fingerprints, baseline-match-count classification, and deterministic next actions for eligible, zero-match, two-match, unsupported-fingerprint, and wrong-count states. Success adds an auto-fixable source finding bound to the clone operation ID. |
| Legacy compatibility       | Omitting `resolution` retains duplicate refusal and emits C5 0.2 for ordinary supported edits.                                                                                                                                                                                                              |

### Transaction proof

| Behavior           | Specification                                                                                                                                                                                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Patch validation   | A proposed 0.2 or reviewed 0.3 transaction passes current C5 validation and all-or-nothing application against exact source before status becomes patchable.                                                                                                               |
| Regeneration proof | Temporary source applies the patch, reloads through C4/C6, and regenerates exact C9 placement. Independent reinspection must equal edited supported inventory, hierarchy/order, masked structure, text, geometry, and style. Promotion additionally requires C11 evidence. |

## Error Contracts

| Error                       | When                                                                                                                           | Code                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| Invalid source              | Canonical source is incomplete, ambiguous, or unresolved                                                                       | `PPTV-RECONCILE-INVALID-SOURCE`   |
| Invalid baseline            | Map/generated/native baseline schema, inventory, transform, binding, digest, or semantic-equivalence proof fails               | `PPTV-RECONCILE-INVALID-BASELINE` |
| Stale source                | Canonical source hash differs from the map                                                                                     | `PPTV-RECONCILE-STALE-SOURCE`     |
| Lineage mismatch            | Edited/comparison package lacks or contradicts compiler/source/map identity                                                    | `PPTV-RECONCILE-LINEAGE`          |
| Invalid package             | OPC/ZIP/XML graph cannot be inspected safely                                                                                   | `PPTV-RECONCILE-INVALID-PPTX`     |
| Missing identity            | A visible supported Office object lacks usable stable identity                                                                 | `PPTV-RECONCILE-MISSING-ID`       |
| Duplicate identity          | Multiple Office objects claim one mapped ID and no exact reviewed resolution succeeds                                          | `PPTV-RECONCILE-DUPLICATE-ID`     |
| Unsupported change          | A changed package/object field has no supported inverse or a normalization near-match fails                                    | `PPTV-RECONCILE-UNSUPPORTED`      |
| Ambiguous structure         | Cross-parent order/group changes or unsafe ranges have multiple interpretations                                                | `PPTV-RECONCILE-AMBIGUOUS`        |
| Invalid or stale resolution | Schema, hashes, IDs, fingerprints, classification, explicit references, inverse values, or order do not match current evidence | `PPTV-RECONCILE-RESOLUTION`       |
| Invalid patch               | Proposed operations fail current C5 validation or regeneration proof                                                           | `PPTV-RECONCILE-PATCH`            |
| Existing destination        | Requested report or patch path already exists                                                                                  | `PPTV-RECONCILE-EXISTS`           |

Identity, lineage, package, baseline, stale-source, resolution, and patch trust
errors set `refused`. Unsupported deltas set `review-required`. Both omit the
top-level patch, though safe typed candidates remain visible and inapplicable.
Resolution failures retain the duplicate finding, add concrete diagnostics,
and block every candidate.

## Dependencies

- Depends on: `CONTRACT:C4-PPTV-SOURCE.1.1`.
- Depends on: `CONTRACT:C5-PPTV-PATCH.1.3`.
- Depends on: `CONTRACT:C6-PPTV-RESOLVED.1.1`.
- Depends on: `CONTRACT:C9-PPTV-PPTX-BASELINE.1.0`.
- Depends on: `CONTRACT:C11-OFFICE-VISUAL-EVIDENCE.1.1`.
- External: ZIP/XML parsing only. OpenDocKit may remain an independent oracle
  but is neither runtime dependency nor identity authority.

## Cross-references

- **Source docs:** `PPTV-PROFILE.md` §Reverse inspector and patcher,
  `PPTV-IMPLEMENTATION-PLAN.md` Milestone 6, and
  `SVG-TO-EDITABLE-PPTX.md` §9.

## Future evolution

- A trusted UI may construct strict resolution data but still requires a
  human-chosen stable ID and explicit from/to references.
- Other insertions, assets, cross-parent moves, group scaling, or implicit
  representation creation require successor C5/C10 contracts.
- Native-save normalization expands only through named predicates,
  counterexamples, real native evidence, and a contract version bump.
- Paragraph intent and overflow grace remain source/profile 0.1.1 work and
  cannot weaken explicit-line 0.1 semantics.
- Baseline-free import requires a separate contract and cannot weaken lineage.

## Retirement / supersession plan

- **Predecessor:** C10 1.0 remains in Git history and is directly superseded by
  this 1.2 file. The unreleased 1.1 implementation checkpoint was folded into
  1.2 before publication and remains only in the change history below.
- **Migration boundary:** consumers accept
  `pptv-pptx-reconciliation/0.2`; callers omit `resolution` for existing
  behavior and supply it only for the reviewed connector clone.
- **Migration owner:** PPTV reconciliation maintainer.

## Implementing Files

- `packages/pptv/src/node/pptx-normalization.ts`.
- `packages/pptv/src/node/pptx-inspect.ts`.
- `packages/pptv/src/node/reconcile-resolution.ts`.
- `packages/pptv/src/node/reconciliation-report.ts`.
- `packages/pptv/src/node/reconcile.ts`.
- `packages/pptv/src/cli.ts`.
- `schemas/pptv-reconcile-resolution-0.1.schema.json`.
- `schemas/pptv-pptx-reconciliation-0.2.schema.json`.

## Test Requirements

- [x] Identity/uniform no-op and recompressed baselines are unchanged.
- [x] Text, geometry, endpoints, translation, frame, style, deletion, and order
      produce minimal old-value-preconditioned C5 operations.
- [x] Stale/tampered source, map, lineage, missing/duplicate identity, unsafe
      ZIP, unsupported structure/style, group scale, and cross-parent moves
      fail closed without mutating source or PPTX.
- [x] Identity and uniform inverse-placement, C5 application, C4/C6 reload, C9
      regeneration, and supported semantic equality are proven.
- [x] C11 browser and Quick Look generated/edited/recovered/regenerated
      same-renderer comparisons are bound to exact artifacts.
- [x] Exact native-save envelope normalizations produce no source changes and
      every accepted rule emits named proof evidence.
- [x] Nonzero root transform and conflicting end-paragraph style fail closed.
- [x] Optional native baseline authenticates before comparison; a semantically
      edited baseline refuses.
- [x] Duplicate evidence is complete and never planned as deletion.
- [x] Candidate operations are blocked by all review/refusal findings.
- [x] Equal inputs produce deterministic findings/candidate IDs and private
      metadata is recursively redacted.
- [x] No-resolution duplicate behavior remains unchanged under the 1.2
      implementation.
- [x] One exact copied connector with a fully matched resolution produces one
      C5 0.3 clone and passes C5 apply/C9 semantic regeneration.
- [x] Independent supported operations remain in the same validated 0.3 patch.
- [x] Stale source/map/edited/comparison hashes and occurrence fingerprints
      refuse.
- [x] Reused/invalid IDs, missing references, inverse mismatch, changed parent,
      and insertion-plus-reorder refuse.
- [x] Zero/two baseline-equivalent occurrences, two changed copies,
      nonconnector duplicates, third occurrences, and extra review findings
      produce no patch.
- [x] Numeric-ID changes never select an occurrence.
- [x] Resolution parsing and serialization are strict and deterministic.
- [x] The real native edited corpus is exercised as a local privacy-safe oracle
      without committing raw PII-bearing PPTX bytes.
- [ ] Representative PowerPoint supported edit/save/reopen corpus passes
      against an exact captured native baseline on every promoted platform,
      with cross-renderer comparison of the regenerated result.

## Change History

| Version | Date       | Change                                                                                                                                                     | Migration                                                                     |
| ------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1.0     | 2026-08-01 | Initial baseline-aware typed reconciliation and exact C9 regeneration proof                                                                                | No predecessor                                                                |
| 1.1     | 2026-08-02 | Unreleased implementation checkpoint: proof-carrying native-save normalization, native baseline, explicit identity states, deterministic agent report, blocked candidates, and privacy redaction | Folded into 1.2 before publication; no standalone contract file               |
| 1.2     | 2026-08-02 | Explicit hash/fingerprint-bound review input for one same-parent copied connector and exact C5 0.3/C9 proof                                                | Existing 0.2-report callers omit `resolution`; only reviewed connector copies use C5 0.3 |
