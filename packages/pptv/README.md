# @office180/pptv

Source-preserving TypeScript tools for the first executable PPTV vertical slice.
The package runs in Node.js 20+ and keeps its portable scanner, semantic
snapshot, projections, patch engine, and browser-session state separate from
the explicit Node filesystem/wrapper boundary.

## Implemented in 0.1

- non-executing `.pptv.html` scan and strict physical-section validation;
- strict manifest JSON parsing with duplicate-key and source-range diagnostics;
- manifest-ordered slides, SVG DOM-ordered hierarchical objects, and stable-ID
  lookup;
- semantic/editing, outline, inventory, query, and text projections;
- UTF-8 byte plus UTF-16 source ranges, including BOM, CRLF, and non-BMP text;
- strict container/resource checks for arbitrary scripts, event handlers,
  active SVG, and every non-fragment fetch;
- source byte, element/depth, manifest-complexity, and Unicode-scalar limits;
- atomic, hash-bound `set-text`, `set-active-theme`, and `set-slide-order`
  transactions;
- an exact-source browser session with bounded undo/redo and failed-edit
  atomicity;
- a deterministic, strict-CSP trusted wrapper with inert exact deck bytes,
  semantic navigation, a literal-data SVG preview, integrity verification, and
  clean-deck download;
- fail-closed C6 base/theme CSS, finite geometry, native groups, connector,
  hard-line text, opaque-SVG bounds, and provenance resolution;
- deterministic C7 fresh-PPTX compilation for plain rectangles, ellipses,
  straight connectors, translated native groups, and one hard line per text
  frame;
- pure C8 anchor-aware text-fit preflight plus an exact-font, hash-evidenced
  Fontkit adapter that never discovers or substitutes a system face; and
- `outline`, `validate`, `resolve`, `editor-pack`, `pptx-canary`, `text-fit`,
  `text`, `show`, `list`, and `patch` CLI commands.

Standalone `.pptv.svg` and external `.pptv-manifest.json` inputs are recognized
and inventoried, but semantic loading and patching are deliberately limited to
one self-contained HTML resource in 0.1.

## CLI

From the repository root:

```bash
pnpm pptv outline examples/minimal-deck.pptv.html
pnpm pptv validate examples/minimal-deck.pptv.html
pnpm pptv resolve examples/minimal-deck.pptv.html
pnpm pptv editor-pack examples/minimal-deck.pptv.html \
  --output minimal-deck.editable.pptv.html
pnpm pptv pptx-canary examples/minimal-deck.pptv.html \
  --output minimal-deck.pptx
pnpm pptv text-fit examples/minimal-deck.pptv.html \
  --font-map fonts.json
pnpm pptv text examples/minimal-deck.pptv.html --slide cover --format json
pnpm pptv show examples/minimal-deck.pptv.html cover.title --view editing
pnpm pptv list examples/minimal-deck.pptv.html --role connector
```

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

Patches never overwrite implicitly. Check one without writing:

```bash
pnpm pptv patch deck.pptv.html change.pptv.patch.json --check
```

Or name an explicit atomic destination:

```bash
pnpm pptv patch deck.pptv.html change.pptv.patch.json \
  --output deck.updated.pptv.html
```

The patch `baseSha256` is available from:

```bash
pnpm pptv validate deck.pptv.html --format json
```

## Library

```ts
import {
  applyPatch,
  EditorSession,
  extractText,
  loadDeck,
  outlineManifest,
  scanPptvSource,
} from '@office180/pptv';

const scan = await scanPptvSource({ kind: 'text', text: html });
const deck = await loadDeck({ kind: 'text', text: html });
const text = extractText(deck);

const result = await applyPatch(deck, {
  schema: 'pptv-patch/0.1',
  baseSha256: deck.source.sha256,
  ops: [{ op: 'set-text', id: 'cover.title', value: 'A new title' }],
});

const session = await EditorSession.open({ kind: 'text', text: html });
await session.dispatch({
  kind: 'set-text',
  id: 'cover.title',
  value: 'Edited through the same C5 transaction engine',
});
session.undo(); // restores the prior exact source snapshot
```

Exact-font fit is also available as a library composition. Font discovery and
fallback remain the caller's responsibility:

```ts
import {
  loadDeck,
  preflightTextFit,
  resolvePptvDeck,
} from '@office180/pptv';
import {
  createFontkitTextMeasurer,
  parseFontMap,
} from '@office180/pptv/node';

const deck = await loadDeck({ kind: 'text', text: html });
const resolved = resolvePptvDeck(deck);
if (resolved.model === undefined) throw new Error('Deck is outside C6');

const fontMap = parseFontMap(JSON.parse(fontMapJson), process.cwd());
const measurer = await createFontkitTextMeasurer(fontMap.faces);
const fit = preflightTextFit(resolved.model, measurer, { nearLimit: 0.95 });
```

`PptvDeck` is an immutable, source-hash-bound in-process snapshot and contains
`Map` indexes. CLI/MCP boundaries should use the versioned JSON-safe projection
functions rather than serializing that snapshot directly.

## Architecture

```text
exact declarative source bytes (persistent authority)
  -> scan + source index
  -> hash-bound hierarchical semantic interpretation
  -> C6 normalized styles/geometry/hard lines
  -> C8 injected exact-font text-fit evidence
  -> JSON-safe projections and semantic operations
       -> Node CLI and deterministic editor-pack
       -> browser-safe exact-source editor session
       -> strict C7 deterministic PPTX canary
```

The package has no OpenDocKit dependency. C7 writes a small fresh package
directly and uses exact `jszip@3.10.1`; C8 uses exact `fontkit@2.0.4` only
behind its Node adapter. OpenDocKit is an independent inspection oracle and a
future optional metrics adapter/contribution target. A broader adapter can
consume selected OpenDocKit OPC, OOXML, rendering, font-metrics, and fidelity
APIs behind a narrow boundary without changing PPTV's source model.

Portable browser state is exported at `@office180/pptv/browser`; explicit
filesystem and trusted-wrapper generation are exported at
`@office180/pptv/node`. The latter also exports `compilePptxCanary()`,
`createPptxCanaryGraph()`, `validatePptxCanaryGraph()`,
`createFontkitTextMeasurer()`, and `parseFontMap()`.

The versioned manifest and patch schemas ship at the
`@office180/pptv/schemas/manifest` and `@office180/pptv/schemas/patch`
subpaths. The exact fixed viewer snippet accepted by the scanner ships as
`@office180/pptv/assets/pptv-browser-0.1.script.html`; the example deck embeds
that artifact byte-for-byte. `prepack` performs a clean build so published
exports cannot point at stale local output.

## Scope boundaries

Not implemented yet:

- a writable bundled browser UI (the first generated wrapper shell is
  intentionally read-only; host integrations can use `EditorSession`);
- C6 Node/browser normalized-JSON parity and the standalone fixture corpus;
- C8 browser/native calibration and a locked worked-deck overflow fixture;
- theme-token patches;
- rich `tspan` editing;
- geometry and structural operations;
- canonical serialization or multi-resource dependency hashing;
- PPTX compilation beyond the strict C7 primitive subset, native save/reopen,
  quantitative render fidelity, or reconciliation; and
- OpenDocKit adapters.

See `architecture/CONTRACT-C4-PPTV-SOURCE.1.0.md` and
`architecture/CONTRACT-C5-PPTV-PATCH.1.0.md` for verified executable behavior,
and `architecture/CONTRACT-C6-PPTV-RESOLVED.1.0.md` for the implemented but
still in-progress compiler-grade projection. See
`architecture/CONTRACT-C7-PPTX-CANARY.1.1.md` for the implemented canary,
structural/native-open evidence, deliberate capability errors, and remaining
fidelity gates, and `architecture/CONTRACT-C8-PPTV-TEXT-FIT.1.0.md` for the
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
