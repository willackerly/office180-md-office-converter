# @office180/vector180

Source-preserving TypeScript tools for deterministic editable vector atoms and
explicit HTML deck/report aggregations. The package targets Node.js 20+ and
keeps its portable scan/read/patch/resolve/diff kernel separate from Node-only
filesystem, exact-font, editor-wrapper, and PPTX operations.

Current package: `@office180/vector180@0.1.0-alpha.5`. Canonical source syntax
is `0.1`; contract revisions are versioned independently.

## The default is one hydrated SVG atom

Use a self-contained `*.vector180.svg` for each independent diagram, figure,
reusable visual, or slide-sized canvas. A hydrated atom keeps every supported
shape, group, connector, text frame, hard line, style, and reference needed to
interpret it inside the SVG. Stable IDs are identity and SVG DOM sibling order
is painter order.

Use `*.vector180.html` only when the canonical deliverable is an actual ordered
multi-slide deck/report or requires manifest order, shared themes, or deck-only
behavior. Related visuals normally remain a suite of independent atoms.

Generated `*.editable.html`, `*.composed.vector180.html`, PPTX, and sidecar-map
files are derivatives. They never replace the atom as source authority.

## Small agent workflow

An agent usually needs only the CLI and one atom:

```bash
# Start and inspect.
vector180 new atom --output architecture.vector180.svg \
  --id architecture --title "System architecture"
vector180 validate architecture.vector180.svg
vector180 outline architecture.vector180.svg
vector180 list architecture.vector180.svg --format json
vector180 text architecture.vector180.svg --format jsonl
vector180 metadata architecture.vector180.svg --format json

# Check deterministic hard lines with the packaged exact-font default.
vector180 text-fit architecture.vector180.svg --format json

# Compare or patch without replacing the input implicitly.
vector180 diff before.vector180.svg after.vector180.svg --format json
vector180 patch architecture.vector180.svg change.json --check
vector180 patch architecture.vector180.svg change.json \
  --output architecture.updated.vector180.svg

# Produce a writable trusted wrapper or editable native PowerPoint.
vector180 editor-pack architecture.vector180.svg \
  --output architecture.editable.html
vector180 compile architecture.vector180.svg \
  --placement 0,0,1600,900 \
  --output architecture.pptx \
  --map architecture.vector180.map.json
```

`vector180 new atom` defaults to `1600 × 900`, but standalone atoms may declare
any finite positive `viewBox`. The scaffold uses only the packaged ABeeZee
Regular face, explicit no-wrap/no-autofit text, a stable object hierarchy, and
the non-normative authoring-skill discovery comment.

For a real deck/report:

```bash
vector180 new deck --output report.vector180.html --title "System report"
vector180 validate report.vector180.html
vector180 extract report.vector180.html \
  --slide architecture --output architecture.vector180.svg
vector180 pptx-canary report.vector180.html --output report.pptx
```

Extraction is hydration, not a byte slice. It localizes supported resolved
styles, retains identity/hierarchy/order/hard lines, records bounded provenance
metadata, then independently reloads and resolves the result before publishing
any SVG bytes.

Run `vector180 help` for the complete command surface.

## Exact text, deliberately

Executable 0.1 text has explicit font size, frame, baseline, line step, and hard
line membership. Vector180 never wraps, reflows, shrinks, substitutes a font,
or performs autofit. A width warning is preferable to silently moving a word
onto another line.

`text-fit` and text-checking `editor-pack` use the immutable package-owned
default when `--font-map` is omitted or is literally `default`. The default is:

- ABeeZee Regular, weight 400, normal;
- 46,016 font bytes, SHA-256
  `2901c8df256648cc2bb2e3afb381cb8d28e65ed3dbe11de20695ae4d5ffdeda9`;
- SIL Open Font License 1.1, SHA-256
  `f0376d04eb58fb19e9f1690a99a1eb37380ad0246f7d503f2abd8e8a74ed12be`.

The loader is independent of the current directory, verifies map/font/license
bytes and the Fontkit face identity, and records only privacy-bounded Node
version/platform/architecture evidence. It never searches system fonts. The
single regular face does not satisfy bold, italic, another family, or a missing
glyph.

Use an explicit custom map when an atom requires another exact face:

```json
{
  "schema": "vector180-font-map/0.1",
  "faces": [
    {
      "family": "Example Sans",
      "weight": 400,
      "style": "normal",
      "path": "./fonts/ExampleSans-Regular.ttf",
      "postscriptName": "ExampleSans-Regular"
    }
  ]
}
```

Paths are relative to the map. A custom map is never silently replaced by the
default.

Paragraph intent and reliable-expanded versus editable-tight PowerPoint frame
policies are banked 0.1.1 design, not accepted 0.1 syntax.

## Metadata and semantic diff

An atom may carry one direct-child metadata element:

```xml
<metadata data-vector180-metadata="vector180-atom-metadata/0.1">
  {"styleFamily":{"id":"office180.vector180.default","version":"1.0"}}
</metadata>
```

Metadata is descriptive evidence, never geometry/style/patch authority.
`styleFamily` and `templateLineage` are assertions. Two matching assertions do
not prove common origin. Exact template verification requires separately
supplied basis bytes:

```bash
vector180 metadata-compare left.vector180.svg right.vector180.svg \
  --template-basis exact-template.vector180.svg --format json
```

`vector180 diff` compares canonical atoms by stable ID and emits
`vector180-source-diff/0.1`. Unknown or invalid metadata makes the result
`incomparable`; it never fabricates semantic changes. The same diff is used to
prove direct legacy-atom migration.

## Legacy PPTV boundary

PPTV alpha.4 remains a frozen compatibility package. Vector180 can read legacy
syntax only to support bounded transition:

- `vector180 migrate legacy.pptv.svg --output canonical.vector180.svg`
  rewrites one directly loaded legacy SVG atom, inserts the discovery comment
  when absent, reloads/resolves it, and requires a semantic-equivalent C12
  report before publication;
- a legacy PPTV HTML deck is never directly rewritten. Load it read-only and
  extract each desired slide into a fresh canonical hydrated atom;
- canonical patch/write APIs refuse legacy source;
- canonical and legacy maps, PPTX lineage, patches, reports, and resolutions
  never cross.

Migration can optionally publish its proof:

```bash
vector180 migrate legacy.pptv.svg \
  --output canonical.vector180.svg \
  --report canonical.migration.json
```

## One transactional patch vocabulary

All canonical writes use `vector180-patch/0.1`, bound to the exact source
SHA-256. Every operation carries its complete old value (`oldText`,
`oldTheme`, `oldOrder`, or the typed object-state equivalent). The package
plans exact source-range replacements, rejects overlaps/stale preconditions,
reloads the complete candidate through C4/C6, and publishes nothing on failure.

Supported operations cover:

- direct hard-line `set-text`;
- deck-only active theme and slide order;
- direct native geometry, connector endpoints, group translation, text frame,
  same-parent order, safe subtree deletion, and complete concrete style;
- at most one strict same-parent `clone-connector` with an explicit fresh ID,
  existing from/to references, full endpoints/style, and complete old/new
  sibling order.

There is no generic attribute writer, whole-source normalization, or metadata
patch operation.

## PPTX compile and reconcile

`compile` is the normal atom-to-PowerPoint path. It requires an explicit
placement on the `1600 × 900` slide:

- `identity` requires an exact coordinate match;
- `uniform-scale-translate` requires the same aspect ratio and applies one
  finite positive scale plus translation;
- stretching, cropping, letterboxing, inferred physical size, multiline text,
  rounded rectangles, opacity, and raster/SVG assets are outside the current
  native slice.

The command publishes one native editable PPTX and
`vector180-pptx-map/0.1` sidecar atomically. The map binds canonical atom and
metadata hashes, composed-deck hash, compiler/placement, PPTX bytes, stable
`src.<id>` Office names, and before-side native semantics. `compose` exposes the
same deterministic one-slide HTML aggregation only when that derivative is
useful. `pptx-canary` remains the independent deck-only C7 path.

`reconcile` authenticates the complete C9 chain before proposing any
`vector180-patch/0.1`. It emits a deterministic
`vector180-pptx-reconciliation/0.1` report with ranked findings, blocked
candidate operations, privacy-safe evidence, and concrete next actions. Any
unsupported, ambiguous, stale, or trust-sensitive difference omits the patch;
supported independent candidates remain visible for agent review.

One copied straight connector is the only insertion exception. The normal
first pass refuses and reports the exact duplicate finding. A strict
`vector180-reconcile-resolution/0.1` must bind the canonical unresolved-report
digest, finding ID, classification `one-baseline-equivalent-copy`, every
source/map/PPTX/fingerprint value, a fresh ID, existing references,
parent/order, inverse endpoints, and complete style. Rerun `reconcile` with
that reviewed input; any intervening change fails closed.

Applying a proposed patch remains a separate `vector180 patch` action.

## Library

Portable atom/deck operations:

```ts
import {
  applyPatch,
  EditorSession,
  extractAtomText,
  extractText,
  extractVector180Atom,
  loadVector180Document,
  outlineAtom,
  outlineDeck,
  preflightAtomTextFit,
  preflightDeckTextFit,
  resolveVector180Atom,
  resolveVector180Deck,
  scanVector180Source,
} from "@office180/vector180";

const input = { kind: "text", text: source, name } as const;
const scan = await scanVector180Source(input);
const document = await loadVector180Document(input);

const outline =
  document.sourceKind === "html"
    ? outlineDeck(document)
    : outlineAtom(document);
const text =
  document.sourceKind === "html"
    ? extractText(document)
    : extractAtomText(document);

const result = await applyPatch(document, {
  schema: "vector180-patch/0.1",
  baseSha256: document.source.sha256,
  ops: [
    {
      op: "set-text",
      id: text.entries[0]!.objectId,
      oldText: text.entries[0]!.text,
      value: "A new title",
    },
  ],
});

console.log(scan.kind, outline, result.applied);
```

Exact-font and native-PPTX operations live at the Node boundary:

```ts
import {
  compileVector180PptxBaseline,
  createDefaultFontkitTextMeasurer,
  reconcileVector180Pptx,
  reconciliationReportSha256,
} from "@office180/vector180/node";
import {
  loadAtom,
  preflightAtomTextFit,
  resolveVector180Atom,
} from "@office180/vector180";

const atom = await loadAtom({ kind: "text", text: svg });
const resolved = resolveVector180Atom(atom);
if (resolved.model === undefined) throw new Error("Atom is outside C6");

const measurer = await createDefaultFontkitTextMeasurer();
const fit = preflightAtomTextFit(resolved.model, measurer);

const baseline = await compileVector180PptxBaseline(atom, {
  placement: {
    slideId: atom.id,
    x: 0,
    y: 0,
    width: 1600,
    height: 900,
    policy: "identity",
  },
});

const unresolved = await reconcileVector180Pptx(
  atom,
  baseline.map,
  editedPptxBytes,
);
console.log(fit.summary, reconciliationReportSha256(unresolved));
```

`Vector180Atom` and `Vector180Deck` are immutable source-hash-bound snapshots;
`Vector180Document` is their discriminated union. CLI/MCP boundaries should use
the versioned JSON-safe atom/deck projection functions rather than serializing
snapshot maps directly.

## Architecture

```text
exact declarative source bytes (persistent authority)
  -> C4 scan + source index
       -> Vector180Atom (.vector180.svg; default)
       -> Vector180Deck (.vector180.html; explicit collection)
  -> artifact-specific projections
  -> C5 exact-range patch / C6 resolve / C8 exact-font fit / C12 semantic diff
       -> browser-safe conformance + exact-source EditorSession
       -> trusted writable *.editable.html wrapper
       -> deck slide --hydrate--> independent atom
       -> deck --C7 strict canary--> fresh PPTX
       -> atom --C9 explicit placement--> composed deck + native PPTX + map
       -> edited C9 PPTX --C10 typed reconcile/review--> C5 patch
```

The portable core does not depend on OpenDocKit, filesystem APIs, browser
globals, or Office automation. Node-only C7/C9/C10 use exact `jszip@3.10.1`;
C8 uses exact `fontkit@2.0.4`; standalone XML is gated through exact
`saxes@6.0.0`. OpenDocKit remains an independent reopen/inspection oracle and a
future optional adapter/upstream collaboration target.

## Published surfaces

- `@office180/vector180` — portable core, browser session, and operations;
- `@office180/vector180/core` — source/load/resolve/text-fit types and logic;
- `@office180/vector180/browser` — conformance, session, browser font evidence;
- `@office180/vector180/node` — files, wrappers, exact fonts, C7/C9/C10;
- `@office180/vector180/ops` — projections, patch, metadata, migration, diff.

Versioned schema exports:

- `schemas/manifest`
- `schemas/atom-metadata`
- `schemas/patch`
- `schemas/migration-report`
- `schemas/source-diff`
- `schemas/reconciliation`
- `schemas/reconcile-resolution-0.1`

Canonical runtime assets:

- `assets/vector180-browser-0.1.script.html`
- `assets/vector180-browser-kernel-0.1.iife.js`

Package files contain no frozen `pptv-*` wrapper assets; the PPTV package owns
those historical artifacts.

## Current boundaries

Not implemented:

- external manifests/slides/assets or multi-resource dependency resolution;
- general SVG import/coercion or baseline-free PPTX import;
- aspect-changing atom placement;
- rich `tspan` editing, paragraph intent, wrapping, or autofit;
- automatic source repair based on width warnings;
- general browser drag/resize/grouping controls;
- PPTX beyond the strict native C7/C9 primitives;
- representative automated native edits and complete native/cross-renderer
  fidelity proof;
- PowerPoint-native C8 calibration;
- OpenDocKit runtime adapters.

Behavioral authority:

- `CONTRACT:C4-PPTV-SOURCE.2.0`
- `CONTRACT:C5-PPTV-PATCH.2.0`
- `CONTRACT:C6-PPTV-RESOLVED.2.0`
- `CONTRACT:C7-PPTX-CANARY.2.0`
- `CONTRACT:C8-PPTV-TEXT-FIT.2.0`
- `CONTRACT:C9-PPTV-PPTX-BASELINE.2.0`
- `CONTRACT:C10-PPTV-PPTX-RECONCILIATION.2.0`
- `CONTRACT:C11-OFFICE-VISUAL-EVIDENCE.1.2`
- `CONTRACT:C12-VECTOR180-SOURCE-DIFF.1.0`

## Development

From the repository root:

```bash
pnpm --filter @office180/vector180 typecheck
pnpm --filter @office180/vector180 test
pnpm --filter @office180/vector180 test:browser
pnpm --filter @office180/vector180 build
pnpm --filter @office180/vector180 pack:check
pnpm format:check
```

Generated browser/editor assets are checked, not silently rewritten, by the
normal build. Run `pnpm --filter @office180/vector180 browser:build` only when
the portable/browser sources intentionally change, then review the canonical
asset and metadata diffs.
