# CONTRACT-C5-PPTV-PATCH.1.0

**Version:** 1.0
**Status:** verified
**Owner:** Will Ackerly
**Type:** Protocol
**Cross-repo Promotability:** Yes — OpenDocKit collaboration/edit layers may adopt the transaction and precondition shape
**Source:** `PPTV-PROCESSING-API.md` §§13–14 and `PPTV-AGENT-GUIDE.md`

## Why this exists

PPTV edits must be reviewable and safe when a human, editor, and agent all work
from the same source. This contract defines a stable-ID, hash-bound transaction
that either produces one validated replacement source or makes no change.

## Who needs this

- **PPTV agents and CLI** — source-safe edits without whole-file rewriting
- **Native editor** — one undoable operation substrate shared with automation
- **PPTX reconciler** — reviewable changes derived from an edited presentation
- **Version-control reviewers** — minimal, attributable source diffs

## Scenarios

### Scenario 1 — surgical text change

An agent reads a text object's ID and old text, then submits `set-text` against
the source hash it inspected. Only that text range changes; inactive themes and
the reference runtime remain byte-identical.

### Scenario 2 — stale concurrent edit

The source changes after a patch was prepared. The base hash mismatch rejects
the complete transaction with `PPTV-PATCH-STALE`; no operation is applied and
no destination is written.

### Scenario 3 — mixed valid and invalid operations

A transaction contains a valid title edit followed by a reference to an unknown
object. Validation rejects both operations, demonstrating that list order is
not partial-commit order.

## Interfaces

```ts
interface PptvPatch {
  schema: 'pptv-patch/0.1';
  baseSha256: string;
  transactionId?: string;
  author?: string;
  timestamp?: string;
  ops: PptvOperation[];
}

function validatePatch(
  deck: PptvDeck,
  patch: unknown
): Promise<Diagnostic[]>;
function applyPatch(deck: PptvDeck, patch: unknown): Promise<PatchResult>;
```

Version 1.0 implements `set-text`, `set-active-theme`, and
`set-slide-order`. New backward-compatible operation kinds may be added in a
minor contract revision after their source-edit rules and fixtures exist.

## Behavioral Contracts

| Behavior | Specification |
|----------|---------------|
| Schema | The envelope uses `pptv-patch/0.1`; operation names use kebab case. |
| Source binding | `baseSha256` is mandatory and matches the exact retained UTF-8 source bytes from C4, including a leading BOM when present. |
| Stable addressing | Operations address canonical slide, object, or theme IDs, never DOM handles, PowerPoint numeric IDs, or array indexes alone. |
| Preconditions | Every supplied old value is checked before any source edit is constructed. |
| Atomic validation | Schema, hash, ID resolution, preconditions, hierarchy/order effects, and overlapping edit ranges are validated for the whole transaction first. |
| Untrusted snapshots | Validation and application reconstruct a fresh deck from the supplied snapshot's retained source and verify its hash before resolving ranges; mutated indexes are never trusted. |
| Source application | Non-overlapping replacements are applied from later character offsets to earlier offsets. |
| Validation API | `validatePatch()` is asynchronous because it reconstructs a trusted deck. It validates the complete edit plan but does not construct and reload a candidate source. |
| Preserve mode | `set-text` replaces one safe direct-text span and XML-escapes the new value; `set-active-theme` and `set-slide-order` replace only their manifest JSON values. |
| Text edit | `set-text` targets a native, non-opaque text object with a direct text range. `oldText`, when present, is compared with the current decoded semantic text with whitespace preserved. Rich or mixed `tspan` content is not editable in 1.0. |
| Theme selection | `set-active-theme` selects an already declared theme and requires an existing manifest `theme` field; it does not add a field or edit CSS. |
| Slide reorder | `set-slide-order` requires a permutation of the current slide IDs and preserves each string/object entry, including layout and hidden metadata. It cannot add or remove slides. |
| Revalidation | `applyPatch()` rescans and semantically reloads the candidate source before success is returned. |
| No hidden write | The library returns replacement source; only an explicit CLI or host destination performs an atomic filesystem write. |
| CLI write | `pptv patch` requires exactly one of `--check` or `--output`; only the explicit output path is written, through a temporary peer plus fsync and atomic rename. |
| Failure | A failed transaction returns the original source hash and no replacement source, edit list, affected IDs, or deck. |

## Error Contracts

| Error | When | Code |
|-------|------|------|
| Unsupported schema | Patch envelope version is unknown | `PPTV-PATCH-SCHEMA` |
| Invalid base snapshot | The supplied deck/source snapshot cannot be reconstructed or its retained hash is inconsistent | `PPTV-PATCH-INVALID-BASE` |
| Incomplete snapshot | The supplied deck was loaded for only a subset of slides | `PPTV-PATCH-INCOMPLETE-SNAPSHOT` |
| Stale source | `baseSha256` differs from the loaded source | `PPTV-PATCH-STALE` |
| Missing target | Stable target ID does not resolve uniquely | `PPTV-PATCH-TARGET` |
| Failed precondition | An `old*` value differs from current semantic state | `PPTV-PATCH-PRECONDITION` |
| Unsupported operation | Operation kind is outside the implemented vocabulary | `PPTV-PATCH-UNSUPPORTED` |
| Invalid text | Replacement text contains characters that cannot appear in XML text | `PPTV-PATCH-INVALID-TEXT` |
| Unsafe text boundary | Text has nested structure without a safe direct replacement span | `PPTV-PATCH-UNSAFE-RANGE` |
| Conflicting edits | Two operations replace intersecting source ranges | `PPTV-PATCH-OVERLAP` |
| Invalid result | Candidate source fails source/profile validation | `PPTV-PATCH-INVALID-RESULT` |

## Dependencies

- Depends on: `CONTRACT:C4-PPTV-SOURCE.1.0`
- Configuration: no unsafe hash bypass in the reference CLI
- External: none beyond C4's parser dependencies

## Cross-references

- **Source docs:** `PPTV-PROCESSING-API.md` §§13–14, 17; `PPTV-AGENT-GUIDE.md`

## Future evolution

- Attribute/class/token/geometry/structural operations require exact smallest-safe
  replacement rules and atomicity fixtures before entering this version line.
- Collaboration metadata may wrap a patch but cannot weaken hash or
  precondition behavior.

## Implementing Files

- `packages/pptv/src/ops/patch.ts` — validation, source replacements, reload, and result reporting
- `packages/pptv/src/cli.ts` — explicit check/output behavior and atomic destination write

## Test Requirements

- [x] Successful text, active-theme, and slide-order transactions (`patch.test.ts`)
- [x] Stale hash and precondition failures (`patch.test.ts`)
- [x] Mixed valid/invalid operation atomicity (`patch.test.ts`)
- [x] Overlapping range rejection, including competing zero-width insertions (`patch.test.ts`)
- [x] Preserve-mode byte identity outside affected ranges, including leading BOM (`patch.test.ts`)
- [x] Candidate-source revalidation rejects an invalid result atomically (`hardening-extra.test.ts`)

## Change History

| Version | Date | Change | Migration |
|---------|------|--------|-----------|
| 1.0 | 2026-07-28 | Initial asynchronous atomic protocol, verified for the exact three-operation 0.1 scope | — |
