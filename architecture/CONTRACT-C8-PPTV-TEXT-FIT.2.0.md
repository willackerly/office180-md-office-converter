# CONTRACT-C8-PPTV-TEXT-FIT.2.0

<!-- SUPERSEDES: CONTRACT-C8-PPTV-TEXT-FIT.1.1 -->

**Version:** 2.0
**Status:** verified
**Owner:** Will Ackerly
**Type:** Verification
**Cross-repo Promotability:** Yes — the injected measurement boundary and evidence model remain portable
**Source:** `VECTOR180-IMPLEMENTATION-PLAN.md` §2.3 and `VECTOR180-TEXT-RESILIENCE-0.1.1.md`

## Why this exists

Vector180 keeps authored line membership deterministic and therefore needs
measurement evidence that warns about overflow without changing layout. C8 2.0
renames all request/result/font/calibration identities, consumes the C6 2.0
atom/deck models, and preserves the exact-font, anchor-aware, no-repair
boundary.

## Who needs this

- **Vector180 authors and agents** — need early overflow warnings tied to exact lines/frames/fonts.
- **Browser editor** — needs checked engine/font evidence without making browser layout authoritative.
- **C9/C11 reviewers** — need source-hash-bound text risk evidence before native export claims.

## Scenarios

### Scenario 1 — preflight an atom

An atom line with explicit frame, anchor, family, size, and hard text is shaped
using an explicitly mapped font file. The result records requested/available
width, status, font SHA-256, adapter identity, and exact source hash under
`vector180-text-fit-atom/0.1`.

### Scenario 2 — refuse silent fallback

The requested family/style is absent from the explicit font map. C8 returns
`unverified` evidence and never substitutes a system font, estimates by
character count, wraps, shrinks, or mutates source.

### Scenario 3 — use the redistributable packaged default

An author runs `vector180 text-fit` without `--font-map`, or explicitly passes
`--font-map default`. Both select the same immutable package-owned ABeeZee
Regular map and bytes. The report identifies that packaged map, exact font and
license hashes, adapter, and privacy-bounded host environment; it does not
search installed fonts or the working directory.

## Interfaces

```ts
function preflightAtomTextFit(
  atom: Vector180ResolvedAtom,
  measurer: Vector180AtomTextMeasurer,
  options?: Vector180TextFitOptions,
): Vector180AtomTextFitResult; // vector180-text-fit-atom/0.1

function preflightDeckTextFit(
  deck: Vector180ResolvedDeck,
  measurer: Vector180DeckTextMeasurer,
  options?: Vector180TextFitOptions,
): Vector180DeckTextFitResult; // vector180-text-fit-deck/0.1
```

The exact Node adapter accepts `vector180-font-map/0.1`. Browser capture and
checked evidence use:

- `vector180-browser-text-calibration-capture/0.1`
- `vector180-browser-text-calibration-evidence/0.1`
- `vector180-browser-conformance/0.1`

The installed-package default has identity
`office180-vector180-default-font-map/0.1` and contains exactly one mapped face:

- family `ABeeZee`, PostScript name `ABeeZee-Regular`, weight `400`, style
  `normal`;
- 46,016 font bytes with SHA-256
  `2901c8df256648cc2bb2e3afb381cb8d28e65ed3dbe11de20695ae4d5ffdeda9`;
- SIL Open Font License 1.1 text with SHA-256
  `f0376d04eb58fb19e9f1690a99a1eb37380ad0246f7d503f2abd8e8a74ed12be`.

## Behavioral Contracts

| Behavior            | Specification                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Inputs              | Only complete C6 2.0 `vector180-resolved-atom/0.1` or `vector180-resolved-deck/0.1` models enter canonical evidence. Family/schema mismatches refuse.                                                                                                                                                                                                                                                                                                                          |
| Hard-line authority | Every authored line is measured independently; C8 never discovers, inserts, removes, or moves a line break.                                                                                                                                                                                                                                                                                                                                                                    |
| Anchor capacity     | Available width derives exactly from explicit frame and start/middle/end baseline anchor as in C8 1.1. Invalid anchor/frame relationships remain resolver errors, not measurement repairs.                                                                                                                                                                                                                                                                                     |
| Classification      | `fits`, `near-limit`, `overflow`, and `unverified` remain monotonic evidence states. A worse result is never silently downgraded.                                                                                                                                                                                                                                                                                                                                              |
| Exact fonts         | Node loads only explicit font bytes, verifies family/weight/style, hashes bytes, and shapes through pinned Fontkit. There is no system discovery or fallback.                                                                                                                                                                                                                                                                                                                  |
| Packaged default    | For `text-fit` and text-checking `editor-pack` flows, omitted `--font-map` and literal `--font-map default` select exactly `office180-vector180-default-font-map/0.1` from package resources, independent of current directory; an explicit non-`default` value remains a caller map path. Any missing, altered, unreadable, or identity-mismatched packaged font/license fails closed. The one regular face never satisfies bold, italic, another family, or a missing glyph. |
| Default evidence    | Results using the packaged default record its identity, exact font byte length/SHA-256/PostScript name, `OFL-1.1`, exact license SHA-256, Fontkit version, Node version, OS platform, and architecture. They record no local package path, username, hostname, or environment variables. Custom maps remain explicitly caller-supplied and are never silently replaced by the default.                                                                                         |
| Starter alignment   | `vector180 new atom` and `vector180 new deck` scaffolds use only the packaged default face unless the caller explicitly chooses another authoring profile. Scaffolding is operational convenience; C8 still measures the resolved source actually supplied.                                                                                                                                                                                                                    |
| Browser evidence    | Browser loading uses explicit bytes under a private SHA-derived family alias and records browser engine/version, platform, DPR, user agent, and font hash. Browser metrics are evidence, not source authority.                                                                                                                                                                                                                                                                 |
| Source binding      | Results carry exact source SHA-256, artifact kind/ID, line stable ID/order, frame/anchor, threshold, measurer identity, and summary counts.                                                                                                                                                                                                                                                                                                                                    |
| Metadata boundary   | Template/style-family metadata may accompany identity output but never changes font selection, width, threshold, or classification.                                                                                                                                                                                                                                                                                                                                            |
| No repair           | C8 performs no wrapping, autofit, shrink, font substitution, frame expansion, baseline movement, source edit, or suggested patch application.                                                                                                                                                                                                                                                                                                                                  |
| Legacy evidence     | Existing `pptv-*` calibration, inventory, and text-fit fixtures retain their exact bytes/hashes. New evidence uses only Vector180 IDs.                                                                                                                                                                                                                                                                                                                                         |
| Native claim        | Browser/Fontkit agreement does not prove PowerPoint metrics. Native calibration and cross-renderer review remain separately labeled gates.                                                                                                                                                                                                                                                                                                                                     |

## Error Contracts

| Error                | When                                                                            | Code                                                      |
| -------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Invalid input/family | Resolved input is incomplete, wrong schema, or legacy on canonical path         | `VECTOR180-TEXT-FIT-INVALID`, `VECTOR180-TEXT-FIT-FAMILY` |
| Invalid threshold    | Near-limit value is non-finite or outside the contracted range                  | `VECTOR180-TEXT-FIT-THRESHOLD`                            |
| Font map             | Map/schema/path/duplicate face/metadata/hash is invalid                         | `VECTOR180-FONT-MAP-INVALID`                              |
| Packaged default     | Packaged map/font/license bytes or pinned identities are unavailable or altered | `VECTOR180-FONT-MAP-DEFAULT-INTEGRITY`                    |
| Unmapped face        | Exact requested face is unavailable                                             | Result status `unverified`; no exception-driven fallback  |
| Measurement failure  | Adapter returns invalid width/evidence or cannot shape requested content        | `VECTOR180-TEXT-FIT-MEASUREMENT`                          |
| Stale calibration    | Kernel/font/engine/platform/DPR/hash does not match checked evidence            | `VECTOR180-TEXT-FIT-CALIBRATION`                          |

## Dependencies

- Depends on: `CONTRACT:C6-PPTV-RESOLVED.2.0`.
- External: exact `fontkit@2.0.4`, explicit font bytes, the pinned packaged OFL
  ABeeZee default above, and checked browser engines.
- No source mutation dependency on C5.

## Cross-references

- **Source docs:** `VECTOR180-TEXT-RESILIENCE-0.1.1.md`, `VECTOR180-PROCESSING-API.md`.

## Future evolution

- Native PowerPoint calibration may add engine-specific evidence but cannot
  create automatic repair behavior.
- Paragraph intent and reliable/editable frame policies require the future
  Vector180 0.1.1 source/resolved/compiler contracts.

## Retirement / supersession plan

- **Predecessor:** `CONTRACT:C8-PPTV-TEXT-FIT.1.1` remains authority for historical PPTV evidence.
- **Migration boundary:** regenerate evidence from canonical source and explicit font bytes; never relabel old JSON.
- **Migration owner:** Vector180 text-evidence maintainer.

## Implementing Files

- `packages/vector180/src/core/text-fit.ts`
- `packages/vector180/src/node/fontkit-text-measurer.ts`
- `packages/vector180/src/browser/text-measurer.ts`
- `packages/vector180/src/cli.ts`
- `packages/vector180/test-fixtures/c8/`

## Test Requirements

- [x] Atom/deck output uses only canonical schemas and exact source hashes.
- [x] Anchor capacity, thresholds, kerning/spaces/mixed text, near-limit, exact-boundary, and overflow corpus passes.
- [x] Missing/wrong fonts remain explicit unverified evidence with no fallback.
- [x] Omitted/default selection is identical, cwd-independent, hash/license
      checked, privacy-bounded, and never substitutes for a custom map.
- [x] Browser calibration is content/kernel/font/environment bound.
- [x] All legacy C8 evidence remains byte-identical.

## Change History

| Version | Date       | Change                                                | Migration                                           |
| ------- | ---------- | ----------------------------------------------------- | --------------------------------------------------- |
| 1.1     | 2026-07-30 | Add PPTV atom-specific exact-font evidence            | Superseded; evidence retained                       |
| 2.0     | 2026-08-02 | Adopt Vector180 atom/deck/font/calibration identities | Regenerate new evidence; preserve historical hashes |
