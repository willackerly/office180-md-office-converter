# CONTRACT-C9-PPTV-PPTX-BASELINE.1.0

**Version:** 1.0
**Status:** in-progress
**Owner:** Will Ackerly
**Type:** Component
**Cross-repo Promotability:** No
**Source:** `PPTV-IMPLEMENTATION-PLAN.md` Milestones 3–4 and
`SVG-TO-EDITABLE-PPTX.md` §§2–8

## Why this exists

C7 proves that a deliberately small resolved PPTV deck can become a valid,
deterministic PowerPoint package. A real editable round trip additionally needs
an explicit way to place a standalone SVG atom on a slide, a reviewable map
between every supported source object and native Office object, and a preserved
baseline against which later PowerPoint edits can be interpreted.

This contract promotes that supported compiler baseline without turning C7's
canary into a claim about arbitrary SVG or PowerPoint.

## Who needs this

- **PPTV authors** — need a deterministic supported path from an independent
  `.pptv.svg` atom or self-contained `.pptv.html` deck to editable PowerPoint.
- **C10 reconciliation** — needs stable identities, source hashes, composition
  transforms, and baseline object values rather than a visual guess.
- **C11 visual evidence** — needs exact source, PPTX, map, renderer, and
  environment identities for each comparison.
- **Native Office reviewers** — need explicit capability/refusal reporting and
  a package that never hides unsupported source behind an accidental fallback.

## Scenarios

### Scenario 1 — place one independent diagram

An author compiles a standalone `1600 × 900` diagram into one widescreen slide
with identity placement. The compiler retains every stable ID, DOM painter
order, group boundary, hard text line, and supported style, emits native Office
objects, and returns a sidecar map bound to the exact source and PPTX hashes.

### Scenario 2 — explicitly scale a compatible atom

An atom has a non-zero origin and the same aspect ratio as an explicitly
declared target rectangle. Composition applies one recorded uniform scale and
translation to every supported value. An aspect mismatch, implicit
letterboxing, per-axis stretch, crop, or inferred physical size fails before a
deck or PPTX artifact is returned.

### Scenario 3 — reject unsupported artwork

A source contains a rounded rectangle, non-unit opacity, external resource,
unsupported transform, raster asset, or another construct outside the declared
capability. Compilation returns a stable capability diagnostic and no partial
deck, map, or PPTX. It never silently flattens a native object or changes its
export intent.

## Interfaces

```ts
interface PptvPlacement {
  readonly slideId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly policy: "identity" | "uniform-scale-translate";
}

interface PptvPptxMap {
  readonly schema: "pptv-pptx-map/0.1";
  readonly source: {
    readonly kind: "diagram" | "deck";
    readonly id: string;
    readonly sha256: string;
    readonly profile: "0.1";
  };
  readonly composition?: {
    readonly placement: PptvPlacement;
    readonly scale: number;
    readonly translateX: number;
    readonly translateY: number;
    readonly composedDeckSha256: string;
  };
  readonly compiler: "office180-pptv-pptx-baseline/0.1";
  readonly resolvedSchema: "pptv-resolved/0.1";
  readonly slides: readonly PptvPptxMapSlide[];
}

interface PptvDiagramCompositionArtifact {
  readonly sourceText: string;
  readonly sourceSha256: string;
  readonly sourceResolved: PptvResolvedDiagram;
  readonly resolved: PptvResolvedDeck;
  readonly placement: PptvPlacement;
  readonly scale: number;
  readonly translateX: number;
  readonly translateY: number;
  readonly diagnostics: readonly Diagnostic[];
}

interface PptvPptxBaselineArtifact {
  readonly pptxBytes: Uint8Array;
  readonly pptxSha256: string;
  readonly map: PptvPptxMap;
  readonly mapSha256: string;
  readonly composedDeckSource?: string;
  readonly composedDeckSha256?: string;
  readonly diagnostics: readonly Diagnostic[];
}

function composePptvDiagramDeck(
  source: PptvDiagram,
  placement: PptvPlacement,
): Promise<PptvDiagramCompositionArtifact>;

function compilePptxBaseline(
  source: PptvDeck | PptvDiagram,
  options: { readonly placement?: PptvPlacement },
): Promise<PptvPptxBaselineArtifact>;
```

Each `PptvPptxMapSlide` records manifest order and every emitted object in
within-parent painter order. Each object entry records:

- stable PPTV ID, source kind, parent ID, and source order;
- emitted `p:cNvPr` name and deterministic numeric ID;
- baseline text, geometry, endpoints, group transform, and supported style;
- source and resolved coordinate values;
- composition transform, if any; and
- capability/export classification.

The public CLI requires explicit destinations:

```text
pptv compose atom.pptv.svg --placement X,Y,W,H \
  [--policy identity|uniform-scale-translate] --output deck.pptv.html
pptv compile atom.pptv.svg --placement X,Y,W,H \
  --output source.pptx --map source.pptv.map.json \
  [--policy identity|uniform-scale-translate]
```

Neither command overwrites an existing destination. The CLI defaults
`--policy` to `identity`; selecting uniform scale is always an explicit caller
choice.

The implemented first slice is deliberately narrower than the complete 1.0
contract above. `composePptvDiagramDeck` and `pptv compose` accept one
standalone diagram plus an explicit `identity` or
`uniform-scale-translate` placement and return or publish a deterministic
self-contained one-slide deck. `pptv compile` uses that exact composition and
publishes a paired PPTX/map; its library artifact also carries the composed
deck source and hash. Deck input, multiline text, rounded rectangles, non-unit
opacity, and SVG/raster assets remain refused. Those refusals are capability
boundaries, not best-effort omissions.

## Behavioral Contracts

| Behavior                | Specification                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accepted source         | The implemented bounded slice accepts one complete, error-free C4 1.1 standalone diagram that resolves through C6 1.1. HTML-deck input remains a later C9 1.0 slice. Source/profile `0.1.1` remains outside C9 1.0 until its successor contracts land.                                                                                    |
| Deck canvas             | Existing deck slides remain exact `0 0 1600 900` and preserve manifest order.                                                                                                                                                                                                                                                             |
| Diagram target          | A standalone diagram compiles only through an explicit widescreen target placement. No physical size is inferred from its viewBox.                                                                                                                                                                                                        |
| Identity placement      | Identity requires the source viewBox and target rectangle to use the same coordinate extent after accounting for the explicit origin translation.                                                                                                                                                                                         |
| Uniform placement       | Non-identity placement uses one finite positive scale plus translation. Source and target aspect ratios must match exactly under bounded decimal arithmetic. The scale applies to geometry, group translations, connector endpoints, text frames/baselines/line step/font size, and stroke width; it is never a per-axis stretch.         |
| Composition source      | The generated one-slide HTML deck is a new deterministic artifact with concrete supported values. It preserves stable IDs and painter/group order, carries the exact composed-deck hash, and does not claim lexical identity with the atom. The candidate independently reloads through C4 and resolves through C6 before it is returned. |
| Composition declaration | The composed manifest records extension key `office180.c9Composition` with schema `pptv-c9-composition/0.1`, the atom SHA-256, placement, finite-positive scale, and translation. The manifest selects `pptv-browser/0.1`, and the emitted runtime is the exact packaged digest-locked `assets/pptv-browser-0.1.script.html` artifact.    |
| Initial native subset   | Plain rectangles, circles/ellipses, straight connectors, non-degenerate translated groups, and explicit hard-line native text. Multiline text may be emitted only after its exact DrawingML contract and fixtures land.                                                                                                                   |
| Asset boundary          | An inline opaque SVG asset is admitted only after a self-contained media-part and fallback contract is implemented. External and raster resources fail in 1.0.                                                                                                                                                                            |
| Style subset            | Concrete solid fill/stroke, finite stroke width, opacity exactly `1`, concrete font family/size/weight/style, and start/middle/end text anchor.                                                                                                                                                                                           |
| Text behavior           | Every admitted line retains its authored text and explicit break membership. Output uses no autofit and performs no source mutation, inferred wrap, font substitution, or repair.                                                                                                                                                         |
| Stable identity         | Every emitted native object is named `src.<stable-id>`. Numeric Office IDs are deterministic implementation details and never reconciliation authority.                                                                                                                                                                                   |
| Source map              | The map is complete, deterministic, JSON-safe, and hash-bound to exact atom source, the mandatory composed-deck SHA-256 for the atom path, compiler capability, and final PPTX bytes. The root and per-object composition records carry the same finite-positive scale and translation.                                                   |
| OPC package             | The baseline extends C7's strict graph/ZIP rules. Package lineage reserves `pptv.sourceSha256` for the exact composed-deck hash and records the originating atom hash separately as `pptv.atomSha256`. Unsupported content produces no composed deck, PPTX, or map.                                                                       |
| Determinism             | Equal exact source, placement, compiler, and dependencies produce byte-identical composed source, map, and PPTX in separate processes and time zones.                                                                                                                                                                                     |
| No implicit write       | Library calls return bytes/text. CLI writes only explicit destinations atomically and refuses existing targets.                                                                                                                                                                                                                           |
| Visual/native claim     | Structural success is distinct from C11 quantitative comparison and native PowerPoint open/save/reopen evidence.                                                                                                                                                                                                                          |

## Error Contracts

| Error                | When                                                                         | Code                               |
| -------------------- | ---------------------------------------------------------------------------- | ---------------------------------- |
| Invalid source       | C4/C6 source is incomplete, ambiguous, or unresolved                         | `PPTV-BASELINE-INVALID-SOURCE`     |
| Missing placement    | A standalone diagram has no explicit target rectangle/policy                 | `PPTV-BASELINE-PLACEMENT-REQUIRED` |
| Invalid placement    | Target values are non-finite, non-positive, unsafe, or outside the slide     | `PPTV-BASELINE-PLACEMENT`          |
| Aspect mismatch      | Uniform composition would stretch, crop, or letterbox                        | `PPTV-BASELINE-ASPECT`             |
| Unsupported source   | Object, style, transform, text, asset, or resource is outside the capability | `PPTV-BASELINE-UNSUPPORTED`        |
| Identity collision   | Stable names or deterministic Office numeric IDs collide                     | `PPTV-BASELINE-IDENTITY`           |
| Map mismatch         | Emitted object inventory and map are not one-to-one                          | `PPTV-BASELINE-MAP`                |
| OPC failure          | Part, relationship, content type, XML, or ZIP validation fails               | `PPTV-BASELINE-OPC`                |
| Existing destination | A requested CLI output already exists                                        | `PPTV-BASELINE-EXISTS`             |

Every failure returns no partial composed source, map, or PPTX artifact.

## Dependencies

- Depends on: `CONTRACT:C4-PPTV-SOURCE.1.1`
- Depends on: `CONTRACT:C6-PPTV-RESOLVED.1.1`
- Depends on: `CONTRACT:C7-PPTX-CANARY.1.1` for the minimum package graph
- Depends on: `CONTRACT:C8-PPTV-TEXT-FIT.1.1` when exact text evidence is required
- Depends on: `CONTRACT:C11-OFFICE-VISUAL-EVIDENCE.1.0` for promotion evidence
- External: exact `jszip@3.10.1` and the packaged digest-locked
  `pptv-browser/0.1` runtime artifact; no OpenDocKit runtime dependency

## Cross-references

- **Source docs:** `PPTV-PROFILE.md`, `PPTV-IMPLEMENTATION-PLAN.md`,
  `SVG-TO-EDITABLE-PPTX.md`

## Future evolution

- Source/profile 0.1.1 paragraph intent and reliable/editable frame policies
  require their promised C4–C8 successors before entering C9.
- Inline SVG/raster media, rounded rectangles, non-unit opacity, arrowheads,
  richer styles, and additional slide ratios require additive capability
  versions and matching reverse/visual fixtures.
- Arbitrary SVG ingestion and generic PPTX generation are non-goals.

## Implementing Files

- `packages/pptv/src/node/pptx-baseline.ts`
- `packages/pptv/src/node/pptx-canary.ts`
- `packages/pptv/src/node/io.ts`
- `packages/pptv/src/node/index.ts`
- `packages/pptv/src/cli.ts`

## Test Requirements

- [x] Identity placement, including non-zero source origins
- [x] Uniform-placement composition and aspect-mismatch diagnostics
- [x] Deterministic one-slide deck, composition extension/hash, registered
      runtime lock, and independent C4/C6 reload
- [x] Placement/capability refusals return no artifact
- [x] Primitive, connector, translated/nested-group, text, style, and painter-order corpus
- [x] Complete stable-ID/map/PPTX inventory equality
- [x] Separate-process and separate-time-zone byte determinism
- [x] Strict OPC validation and independent ZIP/package reopen
- [x] C11 generated-PPTX Quick Look capture with a checked evidence envelope
- [ ] Cross-renderer browser/Office quantitative comparison
- [ ] Native PowerPoint open, representative editability, save, and reopen

## Change History

| Version | Date       | Change                                                                                                                       | Migration                                |
| ------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 1.0     | 2026-08-01 | Initial supported compiler baseline with bounded identity/uniform atom composition, hash-bound composed deck, and source map | C7 remains the independent strict canary |
