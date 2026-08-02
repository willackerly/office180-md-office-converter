# CONTRACT-C5-PPTV-PATCH.1.2

<!-- SUPERSEDES: CONTRACT-C5-PPTV-PATCH.1.1 -->

**Version:** 1.2
**Status:** verified
**Owner:** Will Ackerly
**Type:** Protocol
**Cross-repo Promotability:** Yes — native editors and PPTX reconciliation layers may emit the same typed transactions
**Source:** `PPTV-PROCESSING-API.md` §§13–14 and `PPTV-AGENT-GUIDE.md`

## Why this exists

PPTV needs a source-safe way to carry native-object edits back from an editor
or PPTX reconciliation pass without turning SVG attributes into an untyped
write API. This successor keeps exact source authoritative and adds only
operations whose current meaning can be proven through the C4 source model and
the C6 resolved presentation.

## Who needs this

- **Browser/native editors** — persist drag, resize, style, ordering, and
  deletion gestures without serializing arbitrary DOM state
- **PPTX reconciliation** — express authenticated native-shape differences as
  typed, reviewable source proposals
- **PPTV agents** — make non-text edits with the same hash and old-value
  protections as direct text edits
- **Reviewers and hosts** — retain minimal exact-source diffs and one atomic
  write boundary

## Scenarios

### Scenario 1 — move and resize a native shape

An editor reads a rectangle's C6 geometry and source hash, then emits one
`set-object-geometry` operation containing both the old and desired geometry.
Only its four existing geometry attribute values change.

### Scenario 2 — carry back conservative native-PPTX edits

A reconciler authenticates a PPTX shape through C9 source-map metadata, inverts
its placement, and proposes typed geometry, endpoint, translation, ordering,
deletion, or concrete style operations. C5 checks the original PPTV state
again before applying them.

### Scenario 3 — reject a representation-changing shortcut

A circle is resized into unequal radii, a group has no explicit transform, or a
style comes from CSS. The transaction fails instead of converting element
types, inserting attributes, or rewriting CSS.

### Scenario 4 — delete a referenced subtree safely

Deleting a shape while a connector still points to it is rejected. A single
transaction that deletes both the connector and shape is accepted after all
deletion subtrees and references are considered together.

### Scenario 5 — preserve legacy producers

An existing client continues to send a byte-for-byte `pptv-patch/0.1`
direct-text transaction. It receives the same behavior and does not need to
adopt the 0.2 schema until it emits a new operation.

## Compatibility boundary

The implementation accepts both envelope versions:

- `pptv-patch/0.1` retains exactly the C5 1.1 operation vocabulary and optional
  preconditions.
- `pptv-patch/0.2` accepts the three legacy operations plus the typed
  operations in this contract.

An operation introduced in 0.2 inside a 0.1 envelope is unsupported. Existing
0.1 bytes, decoding, diagnostics, and behavior require no migration.

## Interfaces

```ts
type PptvPatch = PptvPatch01 | PptvPatch02;

interface PptvPatch01 {
  schema: "pptv-patch/0.1";
  baseSha256: string;
  transactionId?: string;
  author?: string;
  timestamp?: string;
  ops: PptvLegacyOperation[];
}

interface PptvPatch02 {
  schema: "pptv-patch/0.2";
  baseSha256: string;
  transactionId?: string;
  author?: string;
  timestamp?: string;
  ops: PptvOperation[];
}
```

The 0.2 typed operations are:

```ts
type SetObjectGeometryOperation =
  | {
      op: "set-object-geometry";
      id: string;
      oldGeometry: {
        kind: "rect";
        x: number;
        y: number;
        width: number;
        height: number;
      };
      geometry: {
        kind: "rect";
        x: number;
        y: number;
        width: number;
        height: number;
      };
    }
  | {
      op: "set-object-geometry";
      id: string;
      oldGeometry: {
        kind: "ellipse";
        cx: number;
        cy: number;
        rx: number;
        ry: number;
      };
      geometry: {
        kind: "ellipse";
        cx: number;
        cy: number;
        rx: number;
        ry: number;
      };
    };

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

interface SetNativeStyleOperation {
  op: "set-native-style";
  id: string;
  oldStyle: PptvConcreteNativeStyle;
  style: PptvConcreteNativeStyle;
}
```

`PptvConcreteNativeStyle` is the complete C6 style value: `fill`, `stroke`,
`strokeWidth`, `opacity`, optional exact `fontFamily` and `fontSize`,
`fontWeight`, `fontStyle`, and `textAnchor`.

## Behavioral Contracts

| Behavior                     | Specification                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source binding and atomicity | C5 1.1 hash binding, trusted-snapshot reconstruction, whole-plan validation, overlap rejection, reverse-offset application, and failure-result rules remain unchanged.                                                                                                                                                                                                         |
| Mandatory 0.2 preconditions  | Every new operation carries a complete `old*` semantic value. It must equal the matching C6 value before any candidate is returned.                                                                                                                                                                                                                                            |
| Typed values                 | All numeric values are finite. Width, height, `rx`, `ry`, and font size are positive; stroke width is nonnegative; opacity is in `[0,1]`; connector endpoints differ. Paints and enum values remain inside C6.                                                                                                                                                                 |
| Representation rule          | A changed value must already have one unambiguous source representation. The patcher replaces that value in place and preserves the attribute name, surrounding whitespace, quote kind, and unrelated bytes. It never inserts a missing attribute or rewrites a complete opening tag.                                                                                          |
| Rect geometry                | `set-object-geometry` with `kind: "rect"` targets a resolved native `<rect>` and replaces existing `x`, `y`, `width`, and `height` values. Optional corner radii are untouched.                                                                                                                                                                                                |
| Ellipse geometry             | `set-object-geometry` with `kind: "ellipse"` targets a resolved native `<ellipse>` and replaces existing `cx`, `cy`, `rx`, and `ry` values. A `<circle>` is rejected instead of silently changing representation.                                                                                                                                                              |
| Connector endpoints          | `set-connector-endpoints` targets a resolved native `<line>` and replaces existing `x1`, `y1`, `x2`, and `y2`. Stable `data-pptv-from` and `data-pptv-to` references are preserved.                                                                                                                                                                                            |
| Group translation            | `set-group-translation` targets a resolved native group with an existing C6 `translate(...)` attribute. A group whose zero translation is implicit is rejected instead of gaining an attribute.                                                                                                                                                                                |
| Text frame                   | `set-text-frame` targets a resolved native direct-text object with exactly one hard line. It replaces existing `data-pptv-frame`, `x`, and `y` values together. Nested or mixed text, including `tspan` lines, is rejected in 0.2. The new anchor must remain inside the new frame after C6 reload.                                                                            |
| Child order                  | `set-child-order` addresses a diagram root, slide root, or resolved native group by stable `parentId`. `oldOrder` must exactly match its direct C6 child IDs and `order` must be an exact permutation. Each existing child element occupies one source slot; interstitial source bytes stay in place. Containers with ignored or otherwise mixed direct children are rejected. |
| Safe deletion                | `delete-object` removes one exact native, non-opaque object element range. `oldParentId` and zero-based C6 `oldOrder` are mandatory. Diagram/slide roots cannot be deleted. A subtree cannot be deleted while any surviving connector refers to it; deleting that connector in the same transaction removes the hazard.                                                        |
| Concrete native style        | `set-native-style` compares the complete C6 style. Every changed property must currently resolve from its own existing SVG presentation attribute. Default, base-rule, inline-style, absent, or otherwise mixed representations are rejected. Optional font properties cannot be added or removed. This is not a generic property or attribute operation.                      |
| Minimal spelling             | Unchanged attributes are not edited. Changed numbers use a deterministic finite decimal spelling; tuple and transform values use one space separator while retaining the original attribute envelope and quote.                                                                                                                                                                |
| C4/C6 revalidation           | New operations require a valid C6 base. Every 0.2 candidate reloads through the matching C4 loader and matching C6 resolver before success. A transaction that leaves the supported profile is rejected atomically.                                                                                                                                                            |
| Artifact preservation        | All operations work directly against the received diagram or deck and return the same source kind. No diagram is wrapped in a deck and no deck slide is extracted implicitly.                                                                                                                                                                                                  |

## Error Contracts

C5 1.1 errors remain stable. The successor uses:

| Error                                     | When                                                                                               | Code                        |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------- |
| Invalid 0.2 shape/value                   | Required typed fields are missing, unknown, nonfinite, or outside their value domain               | `PPTV-PATCH-SCHEMA`         |
| Missing/wrong target                      | A stable ID is absent or its C6 kind does not match the operation                                  | `PPTV-PATCH-TARGET`         |
| Failed old value/order                    | A mandatory old geometry, position, order, parent, or style differs                                | `PPTV-PATCH-PRECONDITION`   |
| Absent/ambiguous representation           | A required attribute range is absent, mixed, opaque, or cannot be replaced without wider rewriting | `PPTV-PATCH-UNSAFE-RANGE`   |
| Connector hazard                          | A surviving connector refers to an object in a deletion subtree                                    | `PPTV-PATCH-REFERENCE`      |
| Root deletion / wrong envelope vocabulary | The requested operation is deliberately outside the supported surface                              | `PPTV-PATCH-UNSUPPORTED`    |
| Intersecting operations                   | Reorder/delete/property operations claim overlapping source ranges                                 | `PPTV-PATCH-OVERLAP`        |
| Invalid C4/C6 candidate                   | Candidate reload or resolved-profile validation fails                                              | `PPTV-PATCH-INVALID-RESULT` |

## Dependencies

- Depends on: `CONTRACT:C4-PPTV-SOURCE.1.1`
- Depends on: `CONTRACT:C6-PPTV-RESOLVED.1.1`
- External: none beyond the existing portable C4/C6 dependencies

## Implementing Files

- `packages/pptv/src/ops/patch.ts`
- `packages/pptv/src/core/types.ts`
- `schemas/pptv-patch-0.2.schema.json`

## Test Requirements

- [x] Existing 0.1 transactions and rejection behavior remain green
- [x] Rect, ellipse, connector, explicit group translation, direct text frame,
      within-parent order, safe deletion, and direct native-style success
- [x] Mandatory old-value failures are atomic
- [x] Missing, circle/ellipse, implicit transform, mixed text, ignored-child,
      opaque/delete-root, and non-presentation style representations are rejected
- [x] Surviving connector reference hazards are rejected; deleting the
      connector in the same transaction is allowed
- [x] Multi-operation overlaps and invalid C4/C6 candidates return no source
- [x] Exact source outside edited ranges remains unchanged

## Retirement / supersession plan

- **Predecessor:** C5 1.1 remains in Git history. Its complete 0.1 behavior is
  preserved normatively by this successor's compatibility boundary.
- **Migration boundary:** consumers opt into `pptv-patch/0.2` only when they
  emit a new typed operation; legacy operation-only producers may stay on 0.1.
- **Migration owner:** PPTV patch-kernel maintainer.

## Change History

| Version | Date       | Change                                                                                          | Migration                                                                   |
| ------- | ---------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1.0     | 2026-07-28 | Initial three-operation atomic protocol                                                         | —                                                                           |
| 1.1     | 2026-07-30 | Extend direct text edits to standalone diagrams                                                 | Existing deck patches unchanged                                             |
| 1.2     | 2026-08-01 | Add the opt-in 0.2 typed native-object operation surface with C6 preconditions and revalidation | Keep using 0.1 until emitting a new operation; no existing envelope changes |
