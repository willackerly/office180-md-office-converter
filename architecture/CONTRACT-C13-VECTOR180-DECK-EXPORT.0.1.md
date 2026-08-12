# CONTRACT-C13-VECTOR180-DECK-EXPORT.0.1

**Version:** 0.1
**Status:** in-progress
**Owner:** Will Ackerly
**Type:** Component
**Cross-repo Promotability:** No
**Source:** `VECTOR180-IMPLEMENTATION-PLAN.md` and the trusted-editor/deck-export acceptance slice

## Why this exists

Canonical Vector180 HTML decks need one bounded path to native editable
PowerPoint without weakening C9's standalone-atom authority. Authors also need
honest local derivatives from the trusted editor: one hydrated selected-slide
SVG, one renderer-labelled PNG, and the complete deck's PPTX plus a
descriptor-only sidecar map.

C13 owns that distinct deck-export surface. It does not turn HTML into the
default visual atom, authorize arbitrary PPTX import, or imply that a product
PNG is C11 native visual evidence.

## Who needs this

- **Deck authors** — need one complete ordered deck exported as native Office
  objects while retaining canonical HTML source.
- **Editor users** — need explicit source-save and derivative-export actions
  whose authority cannot be confused.
- **Agents and reviewers** — need complete source/resolved/emitted/package
  identity and privacy-bounded error context.
- **Future reconciliation work** — needs a new contract before accepting this
  map; C10 remains bound to the C9 standalone-atom map.

## Scenarios

### Scenario 1 — compile one complete deck

The caller supplies a complete, error-free canonical `.vector180.html` deck.
C13 preserves manifest order and hidden-slide state, emits the strict supported
objects as editable native PowerPoint shapes/pictures, and returns exact PPTX
bytes plus `vector180-pptx-deck-map/0.1`.

### Scenario 2 — authenticate shared background media

Several slides reference identical canonical inline PNG bytes. C13 reparses
each exact source data URI, cross-checks its immutable C4/C6 descriptor, emits
one content-addressed package media part, and records only descriptor and
relationship metadata in the sidecar.

### Scenario 3 — export from the trusted editor

An integrity-verified editor session downloads current canonical source
separately from derivatives. Selected-slide SVG is fully hydrated. PNG is a
browser SVG/canvas rendering with exact authenticated raster bytes, verified
mapped font bytes where available, and a renderer label. PPTX compiles the
complete current deck through the same pure kernel as Node; its map is offered
as a separate paired download.

### Scenario 4 — fail closed

Partial materialization, stale/tampered source, unsupported semantics,
unavailable authenticated raster bytes, unsafe output dimensions, or an
existing CLI destination produces no partial authoritative result. The editor
invalidates a previously compiled map after every successful source edit.

## Interfaces

```ts
interface Vector180PptxDeckMap {
  readonly schema: "vector180-pptx-deck-map/0.1";
  readonly source: {
    readonly family: "vector180";
    readonly kind: "deck";
    readonly sha256: string;
    readonly byteLength: number;
    readonly profile: "0.1";
    readonly title?: string;
    readonly activeTheme: string;
    readonly slideOrder: readonly string[];
  };
  readonly compiler: "office180-vector180-pptx-deck/0.1";
  readonly sourceResolvedSchema: "vector180-resolved-deck/0.1";
  readonly pptx: {
    readonly sha256: string;
    readonly byteLength: number;
    readonly partNames: readonly string[];
    readonly relationships: readonly PptxCanaryRelationship[];
  };
  readonly slides: readonly Vector180PptxDeckMapSlide[];
}

function compileVector180PptxDeck(
  deck: Vector180Deck,
): Promise<Vector180PptxDeckArtifact>;

function renderVector180PreviewPng(
  preview: SVGSVGElement,
  options?: Vector180PngDerivativeOptions,
): Promise<Vector180PngDerivative>;
```

The normative JSON form is
`schemas/vector180-pptx-deck-map-0.1.schema.json`. The library artifact schema
is `vector180-pptx-deck-result/0.1`; the CLI command is:

```text
vector180 compile-deck INPUT.vector180.html --output OUTPUT.pptx --map OUTPUT.json
```

## Behavioral Contracts

| Behavior | Specification |
| --- | --- |
| Source authority | Exact canonical HTML bytes remain persistent authority. Save/download source and Export as are visibly separate. SVG, PNG, PPTX, and map are derivatives. |
| Accepted source | One complete non-empty canonical Vector180 0.1 HTML deck that passes C4/C6. Partial slide materialization, standalone atoms, legacy PPTV, mixed families, and unresolved/unsupported input refuse. |
| Slide semantics | Manifest order, stable IDs, layout labels, and hidden state map one-to-one to presentation order, slide parts, and map entries. Deck slides remain `1600 × 900`. |
| Native subset | Plain rectangles, circles/ellipses, straight connectors, translated groups, one explicit hard line per text object, opacity 1, and exact inline static PNG pictures. Rounded rectangles, SVG assets, multiline text, unsupported styles/transforms, and objects crossing the slide refuse the complete export. |
| Raster authentication | Exact source PNG bytes must match C4 and C6 descriptors. Unique digests become `ppt/media/<sha256>.png`; repeated bytes deduplicate across slides. No fetch, transcoding, MIME inference, crop, stretch, or fallback is allowed. |
| Stable identity | Every emitted object is named `src.<stable-id>`. Deterministic Office numeric IDs and relationship IDs are evidence, never source identity. Source/resolved/emitted inventories must be one-to-one. |
| Map privacy | The deterministic sidecar binds exact source/PPTX bytes, source ranges, resolved semantics, OPC parts, relationships, slides, objects, and compiler capabilities. Raster `href`/`xlink:href`, data URIs, base64, and raw media bytes never enter the map. |
| Determinism | Equal exact source, runtime/compiler/dependencies, and authenticated resources produce byte-identical PPTX and canonical map text in browser and Node. The shared C7 package engine uses exact OOXML unit conversion and may accept only one-ULP floating representation residue, never general rounding. |
| Browser SVG | Atom source downloads exactly. A selected deck slide is resolved and hydrated to one independent canonical atom before download; browser DOM/editor overlays never become source. |
| Browser PNG | The current literal C6 preview is cloned without editor overlays, supplied exact authenticated raster bytes and every available verified mapped font byte, then rasterized by browser SVG/canvas. Unmapped/unverified visible faces remain renderer-dependent fallback and must be reported honestly; export does not imply exact-font coverage. Pixel scale is finite in `(0, 4]`, each axis is at most 8192, and total pixels are at most 16,777,216. Output records browser/user-agent/scale identity and is not C11 native Office evidence. |
| Browser PPTX | The browser calls the same pure deck compiler over the current exact source. A source-hash recheck gates download. The PPTX is downloaded first and its exact descriptor-only map remains available until any successful edit, undo, or redo invalidates it. |
| Editor controls | View is the safe default. Edit mode exposes only exact C5-backed numeric controls for supported native geometry, connector endpoints, group translation, one-line text frame/anchor, direct style, same-parent order, and safe deletion. Raster/non-native objects are protected. |
| Publication | The library returns bytes/text without host writes. The CLI requires distinct explicit destinations, refuses overwrite, and publishes the pair transactionally. Browser downloads require an explicit user gesture and do not claim filesystem atomicity. |
| Reconciliation | `vector180-pptx-deck-map/0.1` is not accepted by C10. Deck edit recovery requires a future successor contract and cannot be inferred from C9 behavior. |
| PDF | PDF export is explicitly deferred. A disabled/editor note is not an implementation claim. |

## Error Contracts

| Error | When | Code |
| --- | --- | --- |
| Source | Input is partial, invalid, unresolved, or the wrong source kind | `VECTOR180-DECK-PPTX-INVALID-SOURCE` |
| Family | Source is legacy or mixed | `VECTOR180-DECK-PPTX-FAMILY` |
| Capability | A source/resolved object, style, resource, or placement is outside the subset | `VECTOR180-DECK-PPTX-UNSUPPORTED` |
| Identity | Source, resolved, and emitted inventories or stable identities differ | `VECTOR180-DECK-PPTX-IDENTITY` |
| Map | Sidecar identities disagree with the emitted package | `VECTOR180-DECK-PPTX-MAP` |
| Package | ZIP/OPC part, relationship, content type, or media validation fails | `VECTOR180-DECK-PPTX-OPC` |
| Destination | CLI paths collide or already exist | `VECTOR180-DECK-PPTX-EXISTS` |
| Publication | A different filesystem failure prevents paired atomic publication | `VECTOR180-DECK-PPTX-PUBLISH` |

Browser derivative failures use `Vector180DerivativeExportError` and remain
non-mutating. The trusted editor reports the bounded reason and retains exact
source bytes.

## Dependencies

- Depends on: `CONTRACT:C4-PPTV-SOURCE.2.0`.
- Depends on: `CONTRACT:C5-PPTV-PATCH.2.0` for editor mutations.
- Depends on: `CONTRACT:C6-PPTV-RESOLVED.2.0`.
- Reuses: `CONTRACT:C7-PPTX-CANARY.2.0` package generation without changing
  the public C7 canary boundary.
- Uses: `CONTRACT:C8-PPTV-TEXT-FIT.2.0` exact font identities when available.
- Sibling: `CONTRACT:C9-PPTV-PPTX-BASELINE.2.0` remains the direct atom path.
- Cross-checks: `CONTRACT:C11-OFFICE-VISUAL-EVIDENCE.1.2`; product derivatives
  do not themselves satisfy its native/human evidence requirements.
- External: exact `jszip@3.10.1`; exact development-only `ajv@8.18.0` for
  strict sidecar-schema acceptance; the generated trusted editor runtime;
  browser `Blob`, SVG, canvas, and download APIs.

## Cross-references

- `VECTOR180-PROFILE.md`
- `VECTOR180-TOOLING-AND-EDITOR.md`
- `.agents/skills/vector180-authoring/references/powerpoint-roundtrip.md`

## Future evolution

- Drag handles, arbitrary insertion/reparenting/grouping, rich or multiline
  text editing, mutable/cropped pictures, non-PNG media, additional native
  PowerPoint semantics, and deck reconciliation require matched successor
  contracts and fixtures.
- Native PDF and browser-generated PDF remain separate future surfaces.

## Implementing Files

- `packages/vector180/src/node/pptx-deck.ts`
- `packages/vector180/src/node/pptx-units.ts`
- `packages/vector180/src/node/io.ts`
- `packages/vector180/src/browser/derivative-export.ts`
- `packages/vector180/src/browser/trusted-raster.ts`
- `packages/vector180/src/browser/editor-app.ts`
- `packages/vector180/src/node/editor-pack.ts`
- `packages/vector180/src/cli.ts`
- `schemas/vector180-pptx-deck-map-0.1.schema.json`

## Test Requirements

- [x] Five manifest-ordered slides, including hidden state, compile deterministically.
- [x] Cross-slide PNG bytes authenticate and deduplicate while map text remains descriptor-only.
- [x] Source/resolved/emitted/object/part/relationship inventories are complete and independently reopened from ZIP.
- [x] Browser and Node produce byte-identical PPTX and map for one five-slide acceptance deck.
- [x] Editor renders authenticated backgrounds and exports hydrated SVG plus a 1600 × 900 PNG without editor overlays.
- [x] View/Edit controls use exact C5 transactions; invalid/no-op gestures remain byte-neutral and protected objects refuse.
- [x] Chromium, Firefox, and WebKit editor tests cover source, SVG, PNG, PPTX, and map download behavior.
- [ ] Independent OPC/XSD validation, native PowerPoint open/edit/save review, and representative human visual acceptance remain promotion gates.

## Change History

| Version | Date | Change | Migration |
| --- | --- | --- | --- |
| 0.1 | 2026-08-08 | Add bounded canonical deck-to-PPTX/map and trusted-editor derivative exports | New surface; C9 atom maps remain unchanged |
