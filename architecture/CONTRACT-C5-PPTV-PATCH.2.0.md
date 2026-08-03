# CONTRACT-C5-PPTV-PATCH.2.0

<!-- SUPERSEDES: CONTRACT-C5-PPTV-PATCH.1.3 -->

**Version:** 2.0
**Status:** in-progress
**Owner:** Will Ackerly
**Type:** Protocol
**Cross-repo Promotability:** Yes — editors and authenticated Office reconciliation may emit the same typed transaction
**Source:** `VECTOR180-PROCESSING-API.md` §§13–14 and `VECTOR180-AGENT-GUIDE.md`

## Why this exists

Vector180 edits must retain C5's exact-source safety without perpetuating three
pre-production PPTV patch envelopes. This contract starts one canonical
`vector180-patch/0.1` vocabulary at the complete verified C5 1.3 capability
and makes every legacy PPTV source read-only until an explicit migration.

## Who needs this

- **Vector180 browser and agent editors** — need atomic stable-ID mutations.
- **C10 reconciliation** — needs complete source-hash-bound inverse operations.
- **Reviewers** — need minimal lexical diffs and preserved metadata/unrelated bytes.
- **Legacy users** — need a clear refusal plus an explicit migrate-first path, without rewriting old bytes.

## Scenarios

### Scenario 1 — patch a canonical atom

An editor submits `vector180-patch/0.1` with the atom's exact SHA-256 and a
`set-text-frame` operation. C5 verifies the complete old frame/anchor, replaces
only existing `data-vector180-frame`, `x`, and `y` values, and reloads the
candidate through C4/C6 2.0.

### Scenario 2 — refuse a cross-family envelope

A `pptv-patch/0.3` transaction targets a Vector180 atom, or a
`vector180-patch/0.1` transaction targets legacy source. The request fails
before range planning; patch schema never selects or migrates source dialect.

### Scenario 3 — preserve inert metadata

A geometry patch targets an atom containing valid lineage metadata. C5 changes
only the contracted geometry ranges and preserves the complete metadata element
byte-for-byte.

## Interfaces

```ts
interface Vector180Patch {
  readonly schema: "vector180-patch/0.1";
  readonly baseSha256: string;
  readonly transactionId?: string;
  readonly author?: string;
  readonly timestamp?: string;
  readonly ops: readonly Vector180PatchOperation[];
}

function validateVector180Patch(
  source: Vector180Atom | Vector180Deck,
  patch: unknown,
): Promise<readonly Diagnostic[]>;

function applyVector180Patch(
  source: Vector180Atom | Vector180Deck,
  patch: unknown,
): Promise<Vector180PatchResult>;
```

The 0.1 operation vocabulary is exactly:

- `set-text`
- `set-active-theme`
- `set-slide-order`
- `set-object-geometry`
- `set-connector-endpoints`
- `set-group-translation`
- `set-text-frame`
- `set-child-order`
- `delete-object`
- `set-native-style`
- exactly zero or one `clone-connector`

When `clone-connector` appears, it is the sole structural insertion and carries
the complete C5 1.3 review state.

## Behavioral Contracts

| Behavior                  | Specification                                                                                                                                                                                                                                                                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical envelope        | Schema is exactly `vector180-patch/0.1`; unknown fields/operations fail closed. The schema contains the complete C5 1.3 operation set rather than inheriting PPTV's 0.1/0.2/0.3 envelope layering.                                                                                                                                                    |
| Family binding            | Canonical patches apply only to C4 2.0 `wireFamily: "vector180"` source. Patch schema cannot convert dialect.                                                                                                                                                                                                                                         |
| Exact source              | `baseSha256` matches exact retained UTF-8 bytes, including BOM and metadata spelling. Fresh same-kind C4 reconstruction verifies the snapshot before range resolution.                                                                                                                                                                                |
| Existing semantics        | Stable addressing, required complete old-value preconditions, finite typed values, atomic planning, non-overlapping reverse-order replacements, deterministic number spelling, no hidden write, and full candidate reload remain mandatory. The new major makes `oldText`, `oldTheme`, and `oldOrder` required for the three original operations too. |
| Canonical attributes      | Frame and connector operations address existing `data-vector180-frame`, `data-vector180-from`, and `data-vector180-to`. Clone templates require literal canonical `role`, `export`, `from`, and `to` attributes.                                                                                                                                      |
| Preserve boundary         | Unchanged text, comments, XML declaration, whitespace, quote style, unknown inert non-rendering content, and the complete atom metadata element remain byte-identical.                                                                                                                                                                                |
| Metadata mutation         | C5 2.0 defines no generic metadata setter. New/template/extraction writers may author contracted metadata through C4/C6; a later typed operation needs its own preconditions and schema revision.                                                                                                                                                     |
| Artifact kind             | Success returns the same atom or deck kind and the same Vector180 dialect. It never wraps, extracts, composes, migrates, or reparents.                                                                                                                                                                                                                |
| Clone boundary            | One same-parent childless native straight connector may be cloned exactly as in C5 1.3. Stable references are explicit and never inferred from geometry or Office IDs.                                                                                                                                                                                |
| Legacy read-only boundary | Frozen `pptv-patch/0.1`, `/0.2`, and `/0.3` schema files remain byte-exact historical references, but C5 2.0 applies no legacy envelope and performs no write against legacy source. Migrate the source, inspect the new hash, then author a fresh canonical transaction.                                                                             |
| Failure                   | Failure returns the original hash and no replacement source, candidate document, edit list, affected IDs, or partial transaction.                                                                                                                                                                                                                     |

## Error Contracts

| Error               | When                                                                       | Code                                                                  |
| ------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Invalid schema      | Envelope/operation fields are invalid or clone cardinality exceeds one     | `VECTOR180-PATCH-SCHEMA`                                              |
| Family mismatch     | Patch and source dialect differ or source is legacy on the canonical path  | `VECTOR180-PATCH-FAMILY`, `VECTOR180-LEGACY-WRITE-REQUIRES-MIGRATION` |
| Invalid/stale base  | Snapshot cannot reconstruct or `baseSha256` differs                        | `VECTOR180-PATCH-INVALID-BASE`, `VECTOR180-PATCH-STALE`               |
| Target/precondition | Stable target is absent/ambiguous/wrong kind or old semantic state differs | `VECTOR180-PATCH-TARGET`, `VECTOR180-PATCH-PRECONDITION`              |
| Unsafe range        | Existing representation is absent, mixed, opaque, or needs wider rewriting | `VECTOR180-PATCH-UNSAFE-RANGE`                                        |
| Reference/conflict  | A connector reference fails or edits overlap/semantically conflict         | `VECTOR180-PATCH-REFERENCE`, `VECTOR180-PATCH-OVERLAP`                |
| Unsupported         | Request needs an uncontracted operation or representation change           | `VECTOR180-PATCH-UNSUPPORTED`                                         |
| Invalid result      | Same-family complete C4/C6 reload or declared postcondition fails          | `VECTOR180-PATCH-INVALID-RESULT`                                      |

## Dependencies

- Depends on: `CONTRACT:C4-PPTV-SOURCE.2.0`.
- Depends on: `CONTRACT:C6-PPTV-RESOLVED.2.0`.
- Schema: `schemas/vector180-patch-0.1.schema.json`.

## Cross-references

- **Source docs:** `VECTOR180-PROCESSING-API.md`, `VECTOR180-AGENT-GUIDE.md`.

## Future evolution

- Metadata mutation, general insertion, rich text, reparenting, and generic
  attribute writes remain outside 2.0.
- Every added operation requires old-value, exact-range, atomicity, and reload
  fixtures plus an additive runtime schema revision.

## Retirement / supersession plan

- **Predecessor:** `CONTRACT:C5-PPTV-PATCH.1.3` documents frozen historical envelopes; it is not a write path in the Vector180 package.
- **Migration boundary:** migrate source first, then generate a new canonical patch against the migrated hash; never translate a stale patch blindly.
- **Migration owner:** Vector180 patch-kernel maintainer.

## Implementing Files

- `packages/vector180/src/core/types.ts`
- `packages/vector180/src/ops/patch.ts`
- `packages/vector180/src/cli.ts`
- `schemas/vector180-patch-0.1.schema.json`

## Test Requirements

- [ ] Every canonical operation passes exact-diff and complete reload tests.
- [ ] Metadata/unrelated bytes remain exact for every operation.
- [x] Every canonical/legacy envelope-source mismatch refuses atomically.
- [ ] Frozen PPTV 0.1/0.2/0.3 schemas/fixtures remain byte-identical and every attempt to apply them refuses.
- [x] Clone cardinality, references, order, insertion spelling, and stale review failures remain covered.

## Change History

| Version | Date       | Change                                                                  | Migration                                                 |
| ------- | ---------- | ----------------------------------------------------------------------- | --------------------------------------------------------- |
| 1.3     | 2026-08-02 | Complete PPTV typed operations plus one reviewed connector clone        | Superseded; historical schema/evidence retained read-only |
| 2.0     | 2026-08-02 | Introduce one Vector180 patch envelope and strict source-family binding | Migrate source, then create a fresh canonical transaction |
