# @office180/pptv

Source-preserving TypeScript tools for first-class PPTV HTML decks and
standalone SVG diagram atoms. The package runs in Node.js 20+ and keeps its
portable scanner, semantic snapshots, projections, patch/resolved/text-fit
engines, and browser-session state separate from the explicit Node
filesystem/wrapper/PPTX boundary.

## Implemented in 0.1

- non-executing `.pptv.html` scanning and strict physical-section validation;
- namespace-aware XML 1.0 well-formedness gating for standalone `.pptv.svg`
  before structural scanning, including fail-closed duplicate-attribute,
  mismatched-tag, undeclared-prefix, invalid-character, multi-root, and
  DOCTYPE/DTD/custom-entity handling;
- strict deck manifest JSON parsing with duplicate-key and source-range
  diagnostics;
- immutable `PptvDeck` and `PptvDiagram` semantic snapshots, with
  `PptvDocument` content dispatch; manifest-ordered slides, SVG DOM-ordered
  hierarchical objects, and stable-ID lookup;
- artifact-specific semantic/editing, outline, inventory, query, and text
  projections;
- UTF-8 byte plus UTF-16 source ranges, including BOM, CRLF, and non-BMP text;
- strict container/resource checks for arbitrary scripts, event handlers,
  active SVG, and every non-fragment fetch;
- source byte, element/depth, manifest-complexity, and Unicode-scalar limits;
- atomic, hash-bound `pptv-patch/0.1` text/theme/order transactions plus
  `pptv-patch/0.2` exact-range native geometry, connector, explicit group
  translation, direct text-frame, sibling-order, safe-deletion, and complete
  concrete-style operations;
- deterministic `extractPptvDiagram()` hydration of one deck slide into an
  independently reloaded/resolved standalone SVG atom;
- exact-source browser sessions for decks and diagrams with bounded undo/redo
  and failed-edit atomicity;
- a byte-locked browser conformance kernel and explicit-font browser text
  measurer over the same portable C4/C6/C8 code;
- deterministic strict-CSP writable editor wrappers for decks and diagrams
  with inert exact bytes, fresh C6 navigation/viewport, integrity verification,
  C5 controls, undo/redo, extraction, current-source download, and optional
  stale-safe user-granted file save;
- fail-closed C6 base/theme deck CSS and local-only diagram styling, finite
  geometry, native groups/connectors, hard-line text, opaque-SVG bounds, and
  provenance resolution;
- deck-only deterministic C7 fresh-PPTX compilation for plain rectangles,
  ellipses, straight connectors, translated native groups, and one hard line
  per text frame;
- a bounded C9 atom-to-deck bridge and standalone-atom compiler that place one
  `.pptv.svg` on one widescreen slide through an explicit identity or matching
  uniform scale-and-translate transform, preserve the native object tree,
  scale concrete geometry/text/style values, and return deterministic
  hash-bound deck/PPTX/map artifacts;
- a bounded C10 inspector/reconciler for that C9 baseline: it authenticates
  exact source, canonical map, embedded lineage, raw ZIP/package structure, and
  unique stable names; ignores only contracted ZIP/XML trivia and Office
  numeric object-ID renumbering; and returns minimal C5 1.2 patches for
  supported direct text, geometry, connector, explicit group translation,
  direct text-frame, sibling-order, safe-deletion, and concrete-style edits;
- artifact-specific pure C8 anchor-aware text-fit preflight plus an exact-font,
  hash-evidenced Fontkit adapter that never discovers or substitutes a system
  face; and
- `outline`, `validate`, `resolve`, `extract`, `editor-pack`, `pptx-canary`,
  `compose`, `compile`, `reconcile`, `text-fit`, `text`, `show`, `list`, and
  `patch` CLI commands.

External `.pptv-manifest.json` remains a scan/parse inventory form rather than
a semantic document in 0.1.

PPTV source/profile 0.1.1 text resilience is
[banked design](../../PPTV-TEXT-RESILIENCE-0.1.1.md), not implemented package
behavior. The installed package is `@office180/pptv@0.1.0-alpha.4`, current
loaders accept exactly source/container `0.1`, and the active contract revisions
remain independently versioned.

## CLI

From the repository root:

```bash
pnpm pptv outline examples/minimal-deck.pptv.html
pnpm pptv validate examples/minimal-deck.pptv.html
pnpm pptv resolve examples/minimal-deck.pptv.html
pnpm pptv validate examples/minimal-diagram.pptv.svg
pnpm pptv resolve examples/minimal-diagram.pptv.svg
pnpm pptv extract examples/minimal-deck.pptv.html \
  --slide architecture --output architecture.pptv.svg
pnpm pptv editor-pack examples/minimal-deck.pptv.html \
  --output minimal-deck.editable.pptv.html
pnpm pptv editor-pack examples/minimal-diagram.pptv.svg \
  --output minimal-diagram.editable.pptv.html
pnpm pptv pptx-canary examples/minimal-deck.pptv.html \
  --output minimal-deck.pptx
pnpm pptv compose examples/minimal-diagram.pptv.svg \
  --placement 50,60,600,400 \
  --policy uniform-scale-translate \
  --output minimal-diagram.pptv.html
pnpm pptv compile examples/minimal-diagram.pptv.svg \
  --placement 50,60,600,400 \
  --policy uniform-scale-translate \
  --output minimal-diagram.pptx \
  --map minimal-diagram.pptv.map.json
pnpm pptv reconcile minimal-diagram.edited.pptx \
  --source examples/minimal-diagram.pptv.svg \
  --baseline minimal-diagram.pptv.map.json \
  --patch proposed.pptv.patch.json \
  --report reconciliation.json
pnpm pptv text-fit examples/minimal-deck.pptv.html \
  --font-map fonts.json
pnpm pptv text examples/minimal-deck.pptv.html --slide cover --format json
pnpm pptv show examples/minimal-deck.pptv.html cover.title --view editing
pnpm pptv list examples/minimal-deck.pptv.html --role connector
```

`outline`, `validate`, `resolve`, `editor-pack`, `text-fit`, `text`, `show`,
`list`, and `patch` accept either an HTML deck or standalone SVG diagram.
`--slide`/`--include-hidden`, theme/order patches, `extract`, and
`pptx-canary` are deck-only. Extraction is a C6 hydration/dereference step:
it preserves IDs, hierarchy, painter order, geometry, hard lines, and opaque
SVG payloads while replacing deck CSS/theme authority with local values. The
candidate must independently reload through C4/C6 before the CLI publishes it.
Publication is atomic and refuses to overwrite an existing output.

`compose` and `compile` are the bounded C9 standalone-atom path. Both require
an explicit target inside the `1600 × 900` slide. Policy defaults to
`identity`; select `--policy uniform-scale-translate` only when target and
source aspects match exactly. Uniform placement scales coordinates, extents,
group translations, connector endpoints, text frames/baselines/line steps,
font sizes, and stroke widths with one finite positive scale. It never
stretches, crops, letterboxes, or inserts a synthetic wrapper object.

`compose` writes a deterministic self-contained one-slide deck, embeds the
digest-locked packaged `pptv-browser/0.1` runtime, records the atom hash,
placement, and transform in the inert `office180.c9Composition` manifest
extension, and independently reloads/resolves the candidate before its
no-overwrite publication. `compile` uses that same composed C6 model and writes
the PPTX and sidecar map as one atomic no-overwrite publication. The map binds
the atom and composed-deck hashes and every admitted object to its stable
`src.<id>` Office name, source/resolved/composed values, and normalized
DrawingML baseline. Deck input, aspect mismatch, multiline text, rounded
rectangles, non-unit opacity, and SVG/raster assets fail explicitly. `pptx-canary`
remains the independent deck-only C7 path.

`reconcile` is read-only with respect to the source, map, and edited PPTX. It
requires the exact C9 atom and sidecar that produced the PowerPoint branch,
writes an explicit no-overwrite report for every inspected result, and writes
an explicit no-overwrite `pptv-patch/0.2` only when every difference has one
exact supported inverse. Supported changes cover direct one-line text,
rect/true-ellipse geometry, connector endpoints, explicit group translation,
direct one-line text frames, complete direct native style, pure same-parent
order, and safe subtree deletion. Identity and uniform composition are inverted
exactly, and the proposal must apply through C5 and regenerate equivalent C9
DrawingML semantics before it is returned. Unchanged semantic XML, including a
recompressed/native save with different ZIP bytes, yields `unchanged`.
Insertion/copying, circle representation changes, reparenting, group scaling,
implicit transforms, inline/inherited style rewrites, multiple runs/lines,
unsupported package parts/effects, and tampered identity/lineage never produce
a partial patch; they return `review-required` or `refused`. Applying a proposed
patch remains a separate `pptv patch` action.

`text-fit` requires exact font files rather than system discovery:

```json
{
  "schema": "pptv-font-map/0.1",
  "faces": [
    {
      "family": "Arial",
      "weight": 400,
      "style": "normal",
      "path": "./fonts/Arial.ttf"
    }
  ]
}
```

Paths are relative to the map. Add one entry for every used
family/weight/style. The command returns nonzero for definite overflow or any
unverified line; it never wraps, resizes, substitutes, or changes source.
There is no installed-package default font alias today. Callers must source and
license-check their exact fonts and pass a map. An explicitly selected,
redistributable OFL default environment and a public `pptv new diagram|deck`
scaffold are follow-ups; neither may silently discover or substitute a system
font. The current starter scripts live only in the repository-scoped authoring
skill.

`editor-pack` outputs are large, deterministic generated applications around
the canonical source, not the source itself. Unless a project intentionally
distributes a wrapper, keep these build artifacts out of version control:

```gitignore
*.editable.html
*.editable.pptv.html
```

Continue to track the underlying `.pptv.svg` or `.pptv.html`.

Patches never overwrite their input implicitly. Check one without writing:

```bash
pnpm pptv patch source.pptv.svg change.pptv.patch.json --check
```

Or name an explicit atomic destination:

```bash
pnpm pptv patch source.pptv.svg change.pptv.patch.json \
  --output source.updated.pptv.svg
```

The patch `baseSha256` is available from:

```bash
pnpm pptv validate source.pptv.svg --format json
```

Safe direct `set-text` works for either artifact. `set-active-theme` and
`set-slide-order` are rejected for standalone diagrams. New native-object
operations require a `pptv-patch/0.2` envelope, mandatory complete old values,
an unambiguous existing source representation, and successful C4/C6 reload;
there is no generic attribute writer.

## Library

```ts
import {
  applyPatch,
  EditorSession,
  extractDiagramText,
  extractPptvDiagram,
  extractText,
  loadPptvDocument,
  outlineDiagram,
  outlineDeck,
  resolvePptvDiagram,
  scanPptvSource,
} from "@office180/pptv";

const input = { kind: "text", text: source, name } as const;
const scan = await scanPptvSource(input);
const document = await loadPptvDocument(input);

const outline =
  document.sourceKind === "html"
    ? outlineDeck(document)
    : outlineDiagram(document);
const text =
  document.sourceKind === "html"
    ? extractText(document)
    : extractDiagramText(document);
console.log(scan.kind, outline, text);

const result = await applyPatch(document, {
  schema: "pptv-patch/0.1",
  baseSha256: document.source.sha256,
  ops: [{ op: "set-text", id: text.entries[0].objectId, value: "A new title" }],
});

const session = await EditorSession.open(input);
await session.dispatch({
  kind: "set-text",
  id: text.entries[0].objectId,
  value: "Edited through the same C5 transaction engine",
});
session.undo(); // restores the prior exact source snapshot

if (document.sourceKind === "html") {
  const extracted = await extractPptvDiagram(document, "cover");
  console.log(extracted.diagram?.id, extracted.sourceSha256);
} else {
  console.log(resolvePptvDiagram(document).model?.diagramId);
}
```

Exact-font fit is also available as a library composition. Font discovery and
fallback remain the caller's responsibility:

```ts
import {
  loadDeck,
  loadDiagram,
  preflightDiagramTextFit,
  preflightTextFit,
  resolvePptvDeck,
  resolvePptvDiagram,
} from "@office180/pptv";
import {
  composePptvDiagramDeck,
  createFontkitTextMeasurer,
  parseFontMap,
} from "@office180/pptv/node";

import { dirname, resolve } from "node:path";

const deck = await loadDeck({ kind: "text", text: html });
const resolved = resolvePptvDeck(deck);
if (resolved.model === undefined) throw new Error("Deck is outside C6");

const fontMapPath = "/absolute/path/to/fonts.json";
const fontMap = parseFontMap(
  JSON.parse(fontMapJson),
  dirname(resolve(fontMapPath)),
);
const measurer = await createFontkitTextMeasurer(fontMap.faces);
const fit = preflightTextFit(resolved.model, measurer, { nearLimit: 0.95 });

const diagram = await loadDiagram({ kind: "text", text: svg });
const diagramResolved = resolvePptvDiagram(diagram);
if (diagramResolved.model === undefined) {
  throw new Error("Diagram is outside C6");
}
const composition = await composePptvDiagramDeck(diagram, {
  slideId: "scaled-overview",
  x: 50,
  y: 60,
  width: 600,
  height: 400,
  policy: "uniform-scale-translate",
});
console.log(composition.sourceSha256, composition.scale);
const diagramFit = preflightDiagramTextFit(diagramResolved.model, measurer, {
  nearLimit: 0.95,
});
```

The standalone identity/uniform compiler and bounded reconciler are exported
from the Node boundary:

```ts
import { compilePptxBaseline, reconcilePptx } from "@office180/pptv/node";

const artifact = await compilePptxBaseline(diagram, {
  placement: {
    slideId: "system-overview",
    x: 200,
    y: 50,
    width: 1200,
    height: 800,
    policy: "identity",
  },
});

console.log(
  artifact.pptxSha256,
  artifact.mapSha256,
  artifact.map.slides[0].objects.length,
);

const reconciliation = await reconcilePptx(
  diagram,
  artifact.map,
  editedPptxBytes,
);
if (reconciliation.status === "patchable") {
  console.log(reconciliation.patch);
}
```

Library calls return bytes and canonical map text without writing.

`PptvDeck` and `PptvDiagram` are immutable, source-hash-bound in-process
snapshots with `Map` indexes; `PptvDocument` is their discriminated union.
CLI/MCP boundaries should use the artifact-specific versioned JSON-safe
projection functions rather than serializing either snapshot directly.

## Architecture

```text
exact declarative source bytes (persistent authority)
  -> scan + source index
       -> PptvDeck (.pptv.html)
       -> PptvDiagram (.pptv.svg)
  -> hash-bound PptvDocument semantic interpretation
  -> artifact-specific projections / C5 operations / C6 resolution / C8 fit
       -> Node CLI and deterministic writable editor-pack
       -> browser-safe conformance + exact-source EditorSession
       -> deck slide --hydrate/dereference--> standalone diagram atom
       -> deck only --C7 strict canary--> deterministic PPTX
       -> standalone atom --C9 identity/uniform placement--> deck + PPTX + map
       -> edited C9 PPTX --C10 authenticated typed diff--> review + C5 patch
```

The package has no OpenDocKit dependency. C7 writes a small fresh package
directly and C9 reuses that strict graph for its supported atom baseline; both
use exact `jszip@3.10.1`. C8 uses exact `fontkit@2.0.4` only behind its Node
adapter. Standalone SVGs pass exact browser-safe `saxes@6.0.0` before the
structural scanner. OpenDocKit is an independent inspection oracle and a future
optional metrics adapter/contribution target. A broader adapter can consume
selected OpenDocKit OPC, OOXML, rendering, font-metrics, and fidelity APIs
behind a narrow boundary without changing PPTV's source model.

Portable browser state is exported at `@office180/pptv/browser`; explicit
filesystem and trusted-wrapper generation are exported at
`@office180/pptv/node`. The browser subpath exports `EditorSession`,
`inspectPptvConformance()`, and the explicit-font browser measurement adapter.
The Node subpath exports `createEditorPack()`, `compilePptxCanary()`,
`composePptvDiagramDeck()`, `compilePptxBaseline()`,
`inspectPptxForReconciliation()`, `reconcilePptx()`,
`createPptxCanaryGraph()`, `validatePptxCanaryGraph()`,
`createFontkitTextMeasurer()`, `parseFontMap()`, and atomic filesystem helpers.

The versioned manifest and patch schemas ship at
`@office180/pptv/schemas/manifest`, the legacy
`@office180/pptv/schemas/patch`, and
`@office180/pptv/schemas/patch-0.2`. The exact fixed viewer snippet accepted by
the scanner ships as
`@office180/pptv/assets/pptv-browser-0.1.script.html`; the example deck embeds
that artifact byte-for-byte. `prepack` performs a clean build so published
exports cannot point at stale local output.

## Scope boundaries

Not implemented yet:

- external manifests/slides/assets, dependency resolution, or an embedded
  source editor runtime;
- deck input to the C9 baseline and aspect-changing atom placement;
- theme-token patches;
- rich `tspan` editing;
- browser drag/resize/grouping controls (the typed patch and C10 reverse
  surfaces exist, but the trusted browser UI still exposes direct text only);
- source/profile 0.1.1 paragraph intent, reliable expanded-frame versus
  editable tight-frame PPTX export, or bounded baseline-free import grace;
- a packaged default exact-font environment or installed-package source
  scaffolding;
- canonical serialization or multi-resource dependency hashing;
- general drag/resize/alignment interaction components;
- PPTX compilation beyond the strict native C7/C9 primitive subset, native
  representative edit/save/reopen, or arbitrary/baseline-free reconciliation;
- PowerPoint-native C8 calibration beyond the checked Node/browser evidence;
- and OpenDocKit adapters.

See `architecture/CONTRACT-C4-PPTV-SOURCE.1.1.md` and
`architecture/CONTRACT-C5-PPTV-PATCH.1.2.md` for verified executable behavior,
and `architecture/CONTRACT-C6-PPTV-RESOLVED.1.1.md` for the verified
compiler-grade deck/diagram projection. See
`architecture/CONTRACT-C7-PPTX-CANARY.1.1.md` for the implemented canary,
structural/native-open evidence, deliberate capability errors, and remaining
fidelity gates, and `architecture/CONTRACT-C8-PPTV-TEXT-FIT.1.1.md` for the
implemented exact-font non-mutating preflight and its remaining calibration
gates. `architecture/CONTRACT-C9-PPTV-PPTX-BASELINE.1.0.md` defines the
in-progress broader baseline; this package implements its bounded
identity/uniform standalone-atom composition and compilation slice.
`architecture/CONTRACT-C10-PPTV-PPTX-RECONCILIATION.1.0.md` defines the
implemented fail-closed typed reconciliation slice and its remaining C11/native
promotion gates.

## Development

```bash
pnpm typecheck
pnpm test:ts
pnpm build
pnpm pack:check
pnpm format:check
```
