# CONTRACT-C5-PPTV-PATCH.1.3

<!-- SUPERSEDES: CONTRACT-C5-PPTV-PATCH.1.2 -->

**Version:** 1.3
**Status:** verified
**Owner:** Will Ackerly
**Type:** Protocol
**Cross-repo Promotability:** Yes — native editors and reviewed PPTX reconciliation layers may emit the same typed transaction
**Source:** `PPTV-PROCESSING-API.md` §§13–14 and `PPTV-AGENT-GUIDE.md`

## Why this exists

PPTV edits must remain reviewable and exact-source-safe when a human, editor,
PowerPoint reconciliation pass, and agent work from the same source. This
contract defines one stable-ID, hash-bound transaction that either produces a
validated replacement of the same artifact kind or makes no change.

The operation vocabulary is deliberately bounded. It covers safe direct text,
deck theme/order, typed native geometry/style/order/deletion, and one reviewed
same-parent connector clone. It never becomes an untyped SVG attribute writer,
generic insertion API, or identity inference mechanism.

## Who needs this

- **PPTV agents and CLI** — perform source-safe edits without whole-file
  rewriting.
- **Browser and native editors** — persist bounded gestures through the same
  undoable operation substrate.
- **PPTX reconciliation** — express authenticated, reviewable native-object
  differences and one explicitly reviewed connector copy.
- **Reviewers and hosts** — retain old-value checks, minimal source diffs, and
  an all-or-nothing write boundary.

## Scenarios

### Scenario 1 — surgical text change

An agent submits `set-text` with the exact source hash, stable object ID, and
old text. Only the safe direct-text range changes; unrelated bytes remain
identical.

### Scenario 2 — typed native edit

An editor emits complete old and desired rectangle geometry. C5 verifies the
C6 value, replaces only the four existing attribute values, reloads the full
candidate through C4/C6, and returns the same artifact kind.

### Scenario 3 — reviewed connector copy

A reviewer approves one PowerPoint connector copy, allocates a fresh stable ID,
and supplies explicit source references, endpoints, style, and same-parent
order. C5 clones the template's exact element spelling and changes only the
approved clone-local values.

### Scenario 4 — stale or representation-changing request

A source hash or old value is stale, a circle would need to become an ellipse,
a style comes only from CSS, or insertion would require reparenting. The whole
transaction fails and exposes no candidate source.

### Scenario 5 — legacy producer

An existing client sends a byte-for-byte `pptv-patch/0.1` transaction. It keeps
the same behavior and need not adopt 0.2 or 0.3 until it emits a newer
operation.

## Compatibility boundary

The implementation accepts three envelope versions:

- `pptv-patch/0.1` contains only `set-text`, `set-active-theme`, and
  `set-slide-order`.
- `pptv-patch/0.2` contains the 0.1 vocabulary plus typed native
  geometry/style/order/deletion operations.
- `pptv-patch/0.3` contains the 0.2 vocabulary plus exactly one
  `clone-connector` operation.

A newer operation in an older envelope is unsupported. A 0.3 envelope with
zero or more than one clone operation is invalid. Existing 0.1/0.2 bytes,
decoding, diagnostics, and behavior require no migration.

## Interfaces

```ts
interface PptvPatchMetadata {
  baseSha256: string;
  transactionId?: string;
  author?: string;
  timestamp?: string;
}

interface PptvPatch01 extends PptvPatchMetadata {
  schema: "pptv-patch/0.1";
  ops: PptvLegacyOperation[];
}

interface PptvPatch02 extends PptvPatchMetadata {
  schema: "pptv-patch/0.2";
  ops: PptvOperation[];
}

interface PptvPatch03 extends PptvPatchMetadata {
  schema: "pptv-patch/0.3";
  ops: PptvPatchOperation[];
}

type PptvPatch = PptvPatch01 | PptvPatch02 | PptvPatch03;

function validatePatch(
  source: PptvDeck | PptvDiagram,
  patch: unknown,
): Promise<Diagnostic[]>;

function applyPatch(
  source: PptvDeck | PptvDiagram,
  patch: unknown,
): Promise<PatchResult>;
```

Legacy operations:

```ts
interface SetTextOperation {
  op: "set-text";
  id: string;
  oldText?: string;
  value: string;
}

interface SetActiveThemeOperation {
  op: "set-active-theme";
  theme: string;
  oldTheme?: string;
}

interface SetSlideOrderOperation {
  op: "set-slide-order";
  order: string[];
  oldOrder?: string[];
}
```

Typed 0.2 operations:

```ts
type PptvObjectGeometry =
  | { kind: "rect"; x: number; y: number; width: number; height: number }
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number };

interface SetObjectGeometryOperation {
  op: "set-object-geometry";
  id: string;
  oldGeometry: PptvObjectGeometry;
  geometry: PptvObjectGeometry;
}

interface SetConnectorEndpointsOperation {
  op: "set-connector-endpoints";
  id: string;
  oldEndpoints: { x1: number; y1: number; x2: number; y2: number };
  endpoints: { x1: number; y1: number; x2: number; y2: number };
}

interface SetGroupTranslationOperation {
  op: "set-group-translation";
  id: string;
  oldTranslation: { x: number; y: number };
  translation: { x: number; y: number };
}

interface SetTextFrameOperation {
  op: "set-text-frame";
  id: string;
  oldFrame: { x: number; y: number; width: number; height: number };
  frame: { x: number; y: number; width: number; height: number };
  oldLineAnchor: { x: number; y: number };
  lineAnchor: { x: number; y: number };
}

interface SetChildOrderOperation {
  op: "set-child-order";
  parentId: string;
  oldOrder: string[];
  order: string[];
}

interface DeleteObjectOperation {
  op: "delete-object";
  id: string;
  oldParentId: string | null;
  oldOrder: number;
}

interface PptvConcreteNativeStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  fontFamily?: string;
  fontSize?: number;
  fontWeight: 400 | 700;
  fontStyle: "normal" | "italic";
  textAnchor: "start" | "middle" | "end";
}

interface SetNativeStyleOperation {
  op: "set-native-style";
  id: string;
  oldStyle: PptvConcreteNativeStyle;
  style: PptvConcreteNativeStyle;
}
```

The 0.3 structural operation:

```ts
interface PptvConnectorCloneState {
  fromId: string;
  toId: string;
  endpoints: { x1: number; y1: number; x2: number; y2: number };
  style: PptvConcreteNativeStyle;
}

interface CloneConnectorOperation {
  op: "clone-connector";
  templateId: string;
  newId: string;
  parentId: string;
  oldOrder: string[];
  order: string[];
  oldConnector: PptvConnectorCloneState;
  connector: PptvConnectorCloneState;
}

type PptvLegacyOperation =
  SetTextOperation | SetActiveThemeOperation | SetSlideOrderOperation;

type PptvOperation =
  | PptvLegacyOperation
  | SetObjectGeometryOperation
  | SetConnectorEndpointsOperation
  | SetGroupTranslationOperation
  | SetTextFrameOperation
  | SetChildOrderOperation
  | DeleteObjectOperation
  | SetNativeStyleOperation;

type PptvPatchOperation = PptvOperation | CloneConnectorOperation;
```

`PatchResult` sets exactly one of `deck` or `diagram` on success according to
the input `sourceKind`; failure sets neither. `parentId` may address a diagram
root, slide root, or native group even though a resolved root object's
`parentId` is `null`.

## Behavioral Contracts

| Behavior                   | Specification                                                                                                                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema vocabulary          | Envelope and operation versions are enforced exactly; operation names use kebab case and unknown fields or operations fail closed.                                                                                                                                        |
| Source binding             | `baseSha256` is mandatory and matches exact retained UTF-8 C4 source bytes, including a leading BOM.                                                                                                                                                                      |
| Stable addressing          | Operations use canonical diagram, slide, object, theme, or parent IDs; DOM handles, Office numeric IDs, geometry, text equality, z-order, and array indexes never substitute.                                                                                             |
| Preconditions              | Every supplied old value is checked against current semantic state before an edit is constructed. Every 0.2/0.3 operation carries the complete required old semantic value.                                                                                               |
| Atomic validation          | Schema, hash, ID resolution, preconditions, hierarchy/order effects, semantic conflicts, and intersecting ranges are validated for the complete transaction first.                                                                                                        |
| Untrusted snapshots        | Validation and application reconstruct a fresh same-kind C4 document from retained source and verify its hash before resolving ranges; mutated indexes are never trusted.                                                                                                 |
| Source application         | Non-overlapping replacements apply from later source offsets to earlier offsets.                                                                                                                                                                                          |
| Validation API             | `validatePatch()` reconstructs and validates the complete edit plan asynchronously but does not construct and reload a candidate.                                                                                                                                         |
| Preserve mode              | `set-text` replaces one safe direct-text span and XML-escapes the value in either source kind. Deck-only theme/order operations replace only their manifest JSON values. Typed values replace only their existing representation.                                         |
| Text edit                  | `set-text` targets a native, non-opaque direct-text object. Optional `oldText` compares decoded semantic text with whitespace preserved. Rich or mixed `tspan` content is not editable.                                                                                   |
| Theme selection            | On a deck, `set-active-theme` selects an already declared theme and requires an existing manifest `theme` field. It never adds a field or edits CSS. On a diagram it is unsupported.                                                                                      |
| Slide reorder              | On a deck, `set-slide-order` requires an exact permutation and preserves every string/object entry including layout and hidden metadata. It cannot add or remove slides. On a diagram it is unsupported.                                                                  |
| Typed values               | Numeric values are finite. Width, height, radii, and font size are positive; stroke width is nonnegative; opacity is in `[0,1]`; connector endpoints differ; paints and enums remain within C6.                                                                           |
| Representation rule        | A changed value must already have one unambiguous source representation. The patcher preserves attribute name, whitespace, quote kind, and unrelated bytes; it never inserts a missing attribute or rewrites a complete opening tag.                                      |
| Rect geometry              | `set-object-geometry` with `rect` targets a native `<rect>` and replaces existing `x`, `y`, `width`, and `height`; corner radii remain untouched.                                                                                                                         |
| Ellipse geometry           | `set-object-geometry` with `ellipse` targets a native `<ellipse>` and replaces `cx`, `cy`, `rx`, and `ry`; a `<circle>` refuses rather than changing representation.                                                                                                      |
| Connector endpoints        | `set-connector-endpoints` targets a native `<line>`, replaces `x1`, `y1`, `x2`, and `y2`, and preserves stable from/to references.                                                                                                                                        |
| Group translation          | `set-group-translation` requires an existing C6 `translate(...)` attribute; an implicit zero translation does not gain an attribute.                                                                                                                                      |
| Text frame                 | `set-text-frame` targets a resolved direct-text object with one hard line and replaces existing `data-pptv-frame`, `x`, and `y` together. Mixed or `tspan` text refuses, and C6 reload proves the new anchor remains inside the frame.                                    |
| Child order                | `set-child-order` addresses a root or native group. `oldOrder` exactly matches direct C6 child IDs and `order` is an exact permutation. Existing child slots retain interstitial source bytes; mixed ignored direct children refuse.                                      |
| Safe deletion              | `delete-object` removes one exact native non-opaque object range. Parent and zero-based order are mandatory; roots cannot be deleted. A subtree cannot be deleted while a surviving connector refers to it, though the connector may be deleted in the same transaction.  |
| Concrete native style      | `set-native-style` compares the complete C6 style. Changed properties must each come from an existing direct SVG presentation attribute. Default, base-rule, inline-style, missing, or mixed representation refuses; optional font properties cannot be added or removed. |
| Minimal spelling           | Unchanged attributes are untouched. Changed numbers use deterministic finite decimal spelling; tuple and transform values use one space while retaining the original attribute envelope and quote.                                                                        |
| Clone cardinality          | `clone-connector` is the only 0.3 structural addition and appears exactly once in a 0.3 envelope. It does not authorize another insertion, shape/text/group/asset clone, descendant-ID allocation, reparenting, or generic attribute write.                               |
| Clone template             | `templateId` uniquely identifies a native, non-opaque childless SVG `<line>` in `parentId` with literal `id`, `data-pptv-role`, `data-pptv-export`, `data-pptv-from`, `data-pptv-to`, `x1`, `y1`, `x2`, and `y2`.                                                         |
| Old connector state        | `oldConnector` exactly equals the template connector's C6 references, endpoints, and complete concrete style.                                                                                                                                                             |
| New connector identity     | `newId` obeys the stable-ID grammar and is unused by every source object and root. C5 never allocates or repairs it.                                                                                                                                                      |
| Clone references           | Desired `fromId` and `toId` explicitly name unique resolved objects in the template slide/diagram. Geometry, connection-site metadata, numeric IDs, and proximity never infer them.                                                                                       |
| Same-parent insertion      | `oldOrder` exactly equals complete direct-child order and contains the template once. `order` contains each old ID once plus `newId` once while preserving all old relative order; movement or reparenting refuses.                                                       |
| Exact lexical clone        | The template's exact element bytes are copied and only clone-local identity, from/to references, endpoints, and approved changed style values change. The template and unrelated bytes remain untouched.                                                                  |
| Clone style                | Complete desired style is explicit. Unchanged properties retain cloned lexical spelling; changed properties require direct presentation attributes. Optional font properties cannot be added or removed.                                                                  |
| Insertion spelling         | The clone occupies a deterministic zero-width sibling anchor. Before a child, it uses that child's exact preceding whitespace slot; at the end, it reuses the exact whitespace slot before the former last child. A non-whitespace slot is unsafe.                        |
| Semantic conflicts         | One transaction cannot reorder/delete a sibling in the insertion parent, delete clone references, or mutate template bytes. Semantic conflicts fail even if raw ranges merely touch.                                                                                      |
| C4/C6 revalidation         | Every 0.2/0.3 candidate reloads through matching C4 and C6. Clone postconditions additionally prove exact new ID, parent order, references, endpoints, and style.                                                                                                         |
| Artifact-kind preservation | Every transaction returns the same source kind. No diagram is wrapped, no slide is extracted, and no implicit resource operation occurs.                                                                                                                                  |
| No hidden write            | The library returns replacement source. Only an explicit host or CLI destination writes it.                                                                                                                                                                               |
| CLI write                  | `pptv patch` requires exactly one of `--check` or `--output`; output uses a temporary peer, fsync, and atomic rename.                                                                                                                                                     |
| Failure                    | Failure returns the original source hash and no replacement source, edit list, affected IDs, deck, or diagram.                                                                                                                                                            |

## Error Contracts

| Error                       | When                                                                                                                                         | Code                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Invalid or unknown envelope | Schema is unknown, fields/values are invalid, or 0.3 does not contain exactly one clone                                                      | `PPTV-PATCH-SCHEMA`              |
| Invalid base snapshot       | Supplied source cannot be reconstructed or retained hash is inconsistent                                                                     | `PPTV-PATCH-INVALID-BASE`        |
| Incomplete snapshot         | A deck was loaded for only some slides                                                                                                       | `PPTV-PATCH-INCOMPLETE-SNAPSHOT` |
| Stale source                | `baseSha256` differs from the loaded source                                                                                                  | `PPTV-PATCH-STALE`               |
| Missing or wrong target     | A stable ID is absent, ambiguous, or has the wrong required C6 kind/container                                                                | `PPTV-PATCH-TARGET`              |
| Failed precondition         | An old text, geometry, endpoints, translation, frame, order, parent, connector state, new-ID availability, or style value differs            | `PPTV-PATCH-PRECONDITION`        |
| Unsupported operation       | Operation lies outside the envelope vocabulary, a deck-only operation targets a diagram, or a root/representation-changing request is made   | `PPTV-PATCH-UNSUPPORTED`         |
| Invalid text                | Replacement text cannot appear in XML text                                                                                                   | `PPTV-PATCH-INVALID-TEXT`        |
| Unsafe source range         | Direct text, attribute, template, element, or whitespace insertion boundary is absent, ambiguous, mixed, opaque, or requires wider rewriting | `PPTV-PATCH-UNSAFE-RANGE`        |
| Invalid connector reference | A surviving or cloned connector refers to an absent, cross-slide, or deleted object                                                          | `PPTV-PATCH-REFERENCE`           |
| Conflicting edits           | Operations claim intersecting raw ranges or semantically conflict over template/container structure                                          | `PPTV-PATCH-OVERLAP`             |
| Invalid result              | Complete same-kind C4/C6 reload or declared postcondition fails                                                                              | `PPTV-PATCH-INVALID-RESULT`      |

All errors are atomic and expose no replacement source, candidate document,
edit list, or affected IDs.

## Dependencies

- Depends on: `CONTRACT:C4-PPTV-SOURCE.1.1`.
- Depends on: `CONTRACT:C6-PPTV-RESOLVED.1.1`.
- Configuration: no unsafe hash bypass in the reference CLI.
- External: none beyond portable C4/C6 dependencies.

## Cross-references

- **Source docs:** `PPTV-PROCESSING-API.md` §§13–14, 17 and
  `PPTV-AGENT-GUIDE.md`.

## Future evolution

- Every new operation requires an exact smallest-safe replacement rule,
  old-value and atomicity fixtures, and a compatible contract revision.
- Collaboration metadata may wrap a transaction but cannot weaken source hash,
  stable identity, or precondition behavior.
- General insertion, rich-text mutation, reparenting, and attribute escape
  hatches remain outside this line.

## Retirement / supersession plan

- **Predecessors:** C5 1.0–1.2 remain in Git history; this 1.3 file is the sole
  current C5 contract. Runtime schemas `pptv-patch/0.1` and `/0.2` remain
  supported.
- **Migration boundary:** producers stay on 0.1/0.2 until they need the
  constrained connector clone; only that operation requires 0.3.
- **Migration owner:** PPTV patch-kernel maintainer.

## Implementing Files

- `packages/pptv/src/core/types.ts`.
- `packages/pptv/src/ops/patch.ts`.
- `packages/pptv/src/cli.ts`.
- `schemas/pptv-patch-0.1.schema.json`.
- `schemas/pptv-patch-0.2.schema.json`.
- `schemas/pptv-patch-0.3.schema.json`.

## Test Requirements

- [x] Existing 0.1 text/theme/order behavior, stale/precondition rejection,
      mixed-operation atomicity, exact-diff preservation, BOM handling, and
      same-kind candidate reload remain green.
- [x] Diagram text succeeds while diagram theme/order remains deterministically
      unsupported and atomic.
- [x] Rect, ellipse, connector, explicit group translation, direct text frame,
      child order, safe deletion, and native-style operations succeed.
- [x] Mandatory old-value failures, representation-changing requests, implicit
      transforms, mixed text/children, opaque/root deletion, connector hazards,
      overlapping operations, and invalid C4/C6 candidates refuse atomically.
- [x] Exact source outside edited ranges remains unchanged.
- [x] One root-level or group-level native connector clones before, between, or
      after siblings while retaining exact unrelated bytes.
- [x] New ID, explicit references, endpoints, style, same-parent order, and
      C4/C6 clone postconditions are exact.
- [x] Stale connector/order, reused IDs, absent/cross-slide references, missing
      literal attributes, unsafe style materialization, and mixed insertion
      slots refuse.
- [x] Zero or multiple clone operations, wrong envelope versions, sibling
      reorder/deletion, template mutation, and intersecting transactions refuse
      atomically.

## Change History

| Version | Date       | Change                                                                               | Migration                                            |
| ------- | ---------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| 1.0     | 2026-07-28 | Initial three-operation atomic protocol                                              | —                                                    |
| 1.1     | 2026-07-30 | Extend direct text edits to standalone diagrams                                      | Existing deck patches unchanged                      |
| 1.2     | 2026-08-01 | Add opt-in 0.2 typed native-object operations with C6 preconditions and revalidation | Keep using 0.1 until emitting a typed operation      |
| 1.3     | 2026-08-02 | Add opt-in 0.3 exact-template same-parent native connector cloning                   | Keep using 0.1/0.2 unless emitting `clone-connector` |
