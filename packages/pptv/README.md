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
- atomic, hash-bound `set-text` transactions for decks and diagrams, plus
  deck-only `set-active-theme` and `set-slide-order`;
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
- artifact-specific pure C8 anchor-aware text-fit preflight plus an exact-font,
  hash-evidenced Fontkit adapter that never discovers or substitutes a system
  face; and
- `outline`, `validate`, `resolve`, `extract`, `editor-pack`, `pptx-canary`,
  `text-fit`, `text`, `show`, `list`, and `patch` CLI commands.

External `.pptv-manifest.json` remains a scan/parse inventory form rather than
a semantic document in 0.1.

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
`set-slide-order` are rejected for standalone diagrams.

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
} from '@office180/pptv';

const input = { kind: 'text', text: source, name } as const;
const scan = await scanPptvSource(input);
const document = await loadPptvDocument(input);

const outline =
  document.sourceKind === 'html'
    ? outlineDeck(document)
    : outlineDiagram(document);
const text =
  document.sourceKind === 'html'
    ? extractText(document)
    : extractDiagramText(document);
console.log(scan.kind, outline, text);

const result = await applyPatch(document, {
  schema: 'pptv-patch/0.1',
  baseSha256: document.source.sha256,
  ops: [{ op: 'set-text', id: text.entries[0].objectId, value: 'A new title' }],
});

const session = await EditorSession.open(input);
await session.dispatch({
  kind: 'set-text',
  id: text.entries[0].objectId,
  value: 'Edited through the same C5 transaction engine',
});
session.undo(); // restores the prior exact source snapshot

if (document.sourceKind === 'html') {
  const extracted = await extractPptvDiagram(document, 'cover');
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
} from '@office180/pptv';
import {
  createFontkitTextMeasurer,
  parseFontMap,
} from '@office180/pptv/node';
import { dirname, resolve } from 'node:path';

const deck = await loadDeck({ kind: 'text', text: html });
const resolved = resolvePptvDeck(deck);
if (resolved.model === undefined) throw new Error('Deck is outside C6');

const fontMapPath = '/absolute/path/to/fonts.json';
const fontMap = parseFontMap(
  JSON.parse(fontMapJson),
  dirname(resolve(fontMapPath)),
);
const measurer = await createFontkitTextMeasurer(fontMap.faces);
const fit = preflightTextFit(resolved.model, measurer, { nearLimit: 0.95 });

const diagram = await loadDiagram({ kind: 'text', text: svg });
const diagramResolved = resolvePptvDiagram(diagram);
if (diagramResolved.model === undefined) {
  throw new Error('Diagram is outside C6');
}
const diagramFit = preflightDiagramTextFit(
  diagramResolved.model,
  measurer,
  { nearLimit: 0.95 },
);
```

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
```

The package has no OpenDocKit dependency. C7 writes a small fresh package
directly and uses exact `jszip@3.10.1`; C8 uses exact `fontkit@2.0.4` only
behind its Node adapter. Standalone SVGs pass exact browser-safe
`saxes@6.0.0` before the structural scanner. OpenDocKit is an independent
inspection oracle and a future optional metrics adapter/contribution target. A
broader adapter can consume selected OpenDocKit OPC, OOXML, rendering,
font-metrics, and fidelity APIs behind a narrow boundary without changing
PPTV's source model.

Portable browser state is exported at `@office180/pptv/browser`; explicit
filesystem and trusted-wrapper generation are exported at
`@office180/pptv/node`. The browser subpath exports `EditorSession`,
`inspectPptvConformance()`, and the explicit-font browser measurement adapter.
The Node subpath exports `createEditorPack()`, `compilePptxCanary()`,
`createPptxCanaryGraph()`, `validatePptxCanaryGraph()`,
`createFontkitTextMeasurer()`, `parseFontMap()`, and atomic filesystem helpers.

The versioned manifest and patch schemas ship at the
`@office180/pptv/schemas/manifest` and `@office180/pptv/schemas/patch`
subpaths. The exact fixed viewer snippet accepted by the scanner ships as
`@office180/pptv/assets/pptv-browser-0.1.script.html`; the example deck embeds
that artifact byte-for-byte. `prepack` performs a clean build so published
exports cannot point at stale local output.

## Scope boundaries

Not implemented yet:

- external manifests/slides/assets, dependency resolution, or an embedded
  source editor runtime;
- theme-token patches;
- rich `tspan` editing;
- geometry and structural operations;
- canonical serialization or multi-resource dependency hashing;
- general drag/resize/alignment interaction components;
- PPTX compilation beyond the strict C7 primitive subset, native save/reopen,
  quantitative render fidelity, or reconciliation;
- PowerPoint-native C8 calibration beyond the checked Node/browser evidence;
- and OpenDocKit adapters.

See `architecture/CONTRACT-C4-PPTV-SOURCE.1.1.md` and
`architecture/CONTRACT-C5-PPTV-PATCH.1.1.md` for verified executable behavior,
and `architecture/CONTRACT-C6-PPTV-RESOLVED.1.1.md` for the verified
compiler-grade deck/diagram projection. See
`architecture/CONTRACT-C7-PPTX-CANARY.1.1.md` for the implemented canary,
structural/native-open evidence, deliberate capability errors, and remaining
fidelity gates, and `architecture/CONTRACT-C8-PPTV-TEXT-FIT.1.1.md` for the
implemented exact-font non-mutating preflight and its remaining calibration
gates.

## Development

```bash
pnpm typecheck
pnpm test:ts
pnpm build
pnpm pack:check
pnpm format:check
```
