# PPTV Tooling and Editor Architecture

**Status:** single-package TypeScript vertical slice implemented through the C6
resolver, trusted browser-editor foundation, and strict C7 PPTX canary; broader
editing and PowerPoint adaptation remain roadmap
**Companion:** [`PPTV-HTML-CONTAINER.md`](PPTV-HTML-CONTAINER.md)  
**Reference inspiration:** [OpenDocKit](https://github.com/willackerly/opendockit)

## 1. Summary

PPTV should ship with a deliberately small TypeScript toolchain whose primary
job is to make PPTV cheap, safe, and predictable for humans, browsers, build
systems, and agents.

The reference toolchain should not begin as a reduced mode of a general PPTX
editor. PPTV has a dramatically simpler source model:

- HTML provides the optional deck envelope;
- a small JSON manifest defines deck order and active configuration;
- SVG provides slide content and object z-order;
- CSS provides visual styling and design tokens;
- stable IDs provide semantic identity; and
- constrained operations provide deterministic editing and conversion.

OpenDocKit contains substantial reusable engineering for SVG interaction,
text editing, geometry, fonts, OOXML parsing, package writing, deltas, visual
regression, and PowerPoint fidelity. PPTV should use those pieces selectively,
through narrow adapters, while retaining its own source-bound semantic model
and a much smaller editor.

The recommended split is:

```text
PPTV source
  -> PPTV parser and source index
  -> source-hash-bound PPTV semantic tree
  -> projections and semantic patch engine
       -> browser viewer
       -> native PPTV editor
       -> agent CLI
       -> PPTX compiler/reconciler adapter
```

The exact retained declarative source bytes are persistent authority. The
semantic tree is an immutable, hash-bound interpretation; browser DOM, editor
interaction models, PowerPoint IR, and generated PPTX are projections.

The implemented `@office180/pptv` package provides non-executing scan,
manifest/deck loading, semantic/editing projections, exact source ranges and
hashing, three atomic patch operations, a constrained C6 CSS/geometry/text
resolver, an exact-source browser session, a deterministic trusted editor
wrapper, a strict fresh-package C7 PPTX compiler, and a Node CLI. It does not
yet provide canonical serialization, general visual editing, broad PPTX
translation/reconciliation, or an OpenDocKit runtime adapter.

## 2. Why TypeScript should be primary

The reference implementation should be TypeScript/JavaScript first.

### 2.1 One implementation can run in both browser and Node.js

The same core can power:

- a command-line tool;
- the fixed browser viewer runtime;
- an optional in-browser editor;
- test and validation tooling;
- build integrations; and
- agent or MCP adapters.

A Python implementation would require either a second browser implementation
or a browser-to-server boundary for editing. PPTV is intentionally useful as a
portable local HTML file, so that split would work against the format.

### 2.2 The native source technologies are browser technologies

PPTV uses HTML, SVG, CSS, templates, and DOM ordering. JavaScript has direct,
well-tested access to those models and can manipulate them without translating
through a second representation merely to edit the source.

### 2.3 OOXML does not require Python

PowerPoint files are ZIP/OPC packages containing XML and binary assets.
OpenDocKit already demonstrates that parsing, rendering, editing, and package
writing can live in TypeScript in both browser and Node.js environments.

### 2.4 Python can remain an optional convenience surface

A future Python package may expose the same schemas or invoke a standalone PPTV
binary, but it should not define the primary behavior. The normative behavior
must live in language-neutral contracts and fixtures.

## 3. Non-goals

The initial PPTV toolchain is not:

- an arbitrary HTML editor;
- an arbitrary SVG editor;
- an arbitrary CSS browser engine;
- an arbitrary PPTX importer;
- a full clone of PowerPoint;
- a fork of OpenDocKit's general editor;
- or a promise that every Office feature can round-trip.

Unsupported constructs must remain explicit validation errors or opaque asset
boundaries.

## 4. Current package structure

Keep one package until independent consumers justify a split:

```text
packages/pptv/                  @office180/pptv
  src/core/                     source, scan, deck, constrained styles/resolver
  src/ops/                      JSON-safe projections and patch engine
  src/browser/                  exact-source editor session and history
  src/node/                     file I/O, trusted wrapper, strict PPTX canary
  src/cli.ts                    Node command surface
  schemas/                      manifest and patch schemas
```

Public boundaries are the root package plus `@office180/pptv/core`,
`@office180/pptv/ops`, `@office180/pptv/browser`, `@office180/pptv/node`, and
versioned schema subpaths. Internal module names are not permission to publish
seven speculative packages. A future split should follow actual
browser/editor/PPTX consumers and keep one implementation of C4-C7.

### 4.1 Portable core

Implemented responsibilities are exact source retention/hashing/range mapping,
source recognition, strict non-executing HTML inventory, manifest parsing,
stable-ID hierarchical loading, security/resource diagnostics, and immutable
source-hash-bound snapshots. The core has no filesystem, UI, PowerPoint, or
OpenDocKit dependency.

### 4.2 Operations

Implemented read operations are outline, inventory, text, semantic/editing
projection, and stable-ID/role/class/element/text/descendant queries.
Implemented writes are asynchronous, transactional `set-text`,
`set-active-theme`, and `set-slide-order`; both validation and application
reconstruct a trusted base instead of trusting caller-mutated indexes.

### 4.3 Node host and CLI

The host reads exact bytes and writes only to an explicit destination through a
temporary peer, fsync, and atomic rename. The CLI exposes `outline`, `validate`,
`resolve`, `editor-pack`, `pptx-canary`, `text`, `show`, `list`, and `patch`.
`editor-pack` and `pptx-canary` require an explicit `--output`; `patch`
requires exactly one of `--check` or `--output`.

### 4.4 Implemented boundaries and roadmap

Constrained CSS/theme resolution, a browser editor-session API and trusted
wrapper, and strict PPTX compilation now live behind logical interfaces within
this package. Writable theme/geometry editing, general rendering, broad PPTX
compile/inspect/reconcile, and any PowerPoint/OpenDocKit adapter remain
roadmap. The adapter must remain optional. Separate packages are warranted only
when they provide a real dependency or runtime boundary.

## 5. Source authority and semantic model

PPTV defines a small hierarchical IR bound to the exact retained source bytes.
The source is persistent authority; the Map-rich model is an immutable
in-process snapshot and is not serialized directly across CLI/MCP boundaries.

```ts
interface PptvDeck {
  version: string;
  title?: string;
  activeTheme?: string;
  slideOrder: string[];
  slides: Map<string, PptvSlide>;
  themes: Map<string, PptvTheme>;
  libraries: Map<string, PptvLibrary>;
  source: PptvSourceIndex;
}

interface PptvSlide {
  id: string;
  layout?: string;
  viewBox: [number, number, number, number];
  children: PptvNode[];
}

interface PptvNode {
  id: string;
  role: 'shape' | 'text' | 'connector' | 'group' | 'asset';
  export: 'native' | 'svg' | 'raster' | 'ignore';
  element: string;
  classes: string[];
  attributes: Record<string, string>;
  children: PptvNode[];
  sourceRange: PptvSourceRange;
}
```

The real types will specialize geometry, text, connectors, assets, and groups,
but the initial model remains recognizably close to SVG. The 0.1 type also
retains the exact source document, source index, manifest, materialization
record, and diagnostics. It does not yet specialize geometry, connectors, or
rich-text runs.

### 5.1 Preserve hierarchy

The PPTV semantic model must preserve SVG group hierarchy and DOM order.

An editor may derive a flat spatial interaction model, but that flat model is
not canonical. This avoids importing a second z-order authority such as a
fractional index into the source format.

### 5.2 Preserve source ranges

The parser indexes both half-open UTF-8 byte and UTF-16 code-unit ranges for:

- manifest fields;
- slide templates;
- objects by stable ID;
- theme blocks;
- library blocks; and
- the reference runtime.

A leading BOM and newline spelling are retained; SHA-256 covers the exact bytes.
Token-declaration ranges are roadmap. Current safe edits avoid reserializing the
entire HTML file.

### 5.3 Preserve source intent

The 0.1 kernel retains exact source, raw attributes/classes, hierarchy, export
intent, and source ranges. Future style processing must additionally retain:

- direct attributes;
- inline style declarations;
- matched CSS rules;
- custom-property bindings;
- and computed values.

A future patch should be able to change a shared token, a component rule, or
one local override without guessing which layer the author intended.

## 6. Processing functions

The public API should emphasize small, composable functions rather than one
large compiler object.

### 6.1 Load and index

```ts
scanPptvSource(input, options): Promise<PptvScan>
parseManifest(scan): ManifestParseResult
loadDeck(input, options): Promise<PptvDeck>
validateDeck(deck): Diagnostic[]
```

`scanPptvSource()` builds a non-executing source-located inventory, enforces
resource/security policy, and verifies the fixed runtime digest. `loadDeck()`
semantically materializes all or selected slides. Outline/manifest reads do not
semantically parse slide bodies or resolve CSS, libraries, or assets, though the
scanner currently traverses the full container rather than streaming only the
leading control plane.

### 6.2 Query and projections

```ts
outlineManifest(manifest): DeckOutline
getSlide(deck, slideId, view): SlideProjection
getObject(deck, objectId, view): ObjectProjection
queryObjects(deck, query, view): ObjectProjection[]
extractText(deck, options): TextProjection
```

Implemented object/slide views:

```text
semantic  hierarchy, roles, exports, elements, and decoded text
editing   semantic data plus raw attributes, classes, ranges, and slide viewBox
```

Outline, inventory, and text are separate JSON-safe projections. C6 provides a
deck-level resolved projection for the contracted CSS, token provenance,
geometry, explicit text, and opaque-asset boundaries. General font discovery,
asset loading, relationships, and a resolved per-object `show` view remain
roadmap. The default object view is `semantic`.

### 6.3 Patch and save

```ts
applyPatch(deck, input: unknown): Promise<PatchResult>
validatePatch(deck, input: unknown): Promise<Diagnostic[]>
```

Patches are stable-ID-addressed and transactional:

```json
{
  "schema": "pptv-patch/0.1",
  "baseSha256": "...",
  "ops": [
    {
      "op": "set-text",
      "id": "node.authorization.title",
      "oldText": "Authorization service",
      "value": "Policy and authorization"
    },
    {
      "op": "set-active-theme",
      "oldTheme": "dapple.light",
      "theme": "dapple.dark"
    },
    {
      "op": "set-slide-order",
      "oldOrder": ["cover", "architecture"],
      "order": ["architecture", "cover"]
    }
  ]
}
```

The engine reconstructs a trusted base snapshot, validates every operation and
overlap before mutation, applies replacements from later offsets to earlier
offsets, and reloads the candidate before success. `validatePatch()` is also
asynchronous but validates only the complete plan. General serialization and
library/browser writers are roadmap; the Node CLI alone owns explicit atomic
filesystem output.

### 6.4 C6 resolution and broader normalize/render roadmap

```ts
resolvePptvDeck(deck): PptvResolvedResult
```

The current resolver maps the fixed canvas, supported CSS, finite
primitive/group geometry, opaque asset boundaries, and explicit one-line text
to compiler-grade data with diagnostics. It performs no network or filesystem
asset resolution.

Broader normalization and rendering remain roadmap:

```ts
normalizeDeck(deck, options): NormalizedDeck
renderSlide(deck, slideId, options): SVGElement | string
renderDeckHtml(deck, options): string
renderThumbnail(deck, slideId, options): Promise<Blob | Uint8Array>
```

Normalization resolves authoring conveniences into deterministic compiler input
but need not create additional files unless requested.

### 6.5 C7 PPTX canary and broader PowerPoint adapter

Implemented:

```ts
compilePptxCanary(
  input: PptvResolvedDeck | PptvResolvedResult
): Promise<PptxCanaryArtifact>
createPptxCanaryGraph(model: PptvResolvedDeck): PptxCanaryGraph
validatePptxCanaryGraph(graph: PptxCanaryGraph): void
```

The canary emits and validates a deterministic, template-free OPC package for
the narrow native subset. Unsupported content is an error, not a silent raster
fallback.

The broader adapter remains roadmap:

```ts
compilePptx(deck, options): Promise<PptxBuildResult>
inspectPptx(bytes, baseline): Promise<PptxInspection>
reconcilePptx(bytes, deck, baseline): Promise<PptvPatch>
```

The PowerPoint adapter should consume normalized PPTV. It must not interpret
arbitrary browser runtime behavior.

## 7. Token-efficient agent interface

Tool-mediated access is part of the format's practical design, not merely a UI
feature.

### 7.1 Reference CLI

Implemented 0.1:

```text
pptv outline <file> [--format text|json]
pptv validate <file> [--format text|json]
pptv resolve <file> [--format text|json]
pptv editor-pack <file> --output PATH [--format text|json]
pptv pptx-canary <file> --output PATH [--format text|json]
pptv text <file> [--slide ID] [--include-hidden] [--format text|json|jsonl]
pptv show <file> <id> [--view semantic|editing] [--format json]
pptv list <file> [--slide ID] [--role ROLE] [--class CLASS] [--text TEXT]
          [--view semantic|editing] [--format text|json|jsonl]
pptv patch <file> <patch.json> (--check | --output PATH)
           [--format text|json]
```

Roadmap:

```text
pptv theme <file> [--active] [--tokens]
pptv normalize <file>
pptv render <file>
pptv build-pptx <file>
pptv inspect-pptx <file.pptx>
pptv reconcile <file.pptx> --source <file.pptv.html>
```

### 7.2 Cheap operations remain cheap

`outline` and manifest reads currently scan the whole non-executing container
but do not semantically parse slides or resolve CSS, fonts, paths, libraries, or
assets. Selected-slide semantic loads avoid materializing unrelated slides.

### 7.3 Machine output

Formats vary by command in 0.1:

```text
--format text
--format json
--format jsonl
```

JSONL is useful for streaming large object inventories without constructing one
large response.

### 7.4 Installed agent guidance

A conforming toolchain should ship a versioned agent guide or skill instructing
agents to:

1. inspect `outline` before reading raw source;
2. retrieve only the relevant slide or object;
3. use semantic patch operations instead of rewriting XML or HTML;
4. validate after every transaction; and
5. render only when visual confirmation is needed.

A PPTV file may declare a known profile identifier, but comments and arbitrary
embedded text are never trusted as agent instructions.

## 8. Native PPTV editor: foundation implemented, writable UI roadmap

The editor should be a small application built from scratch around the PPTV
model.

### 8.1 Editing architecture

```text
Canonical PPTV semantic tree
  -> derived SVG content DOM
  -> SVG interaction overlay
  -> semantic operation
  -> patch engine
  -> semantic tree and source spans
  -> affected SVG DOM update
```

There is no cold OOXML layer in native PPTV editing. The three-layer Office
pipeline can collapse to:

```text
PPTV source spans (persistent)
  -> PPTV semantic model (hot)
  -> SVG DOM (derived)
```

The editor never treats a browser-generated clone as canonical source.

### 8.2 Pure SVG viewport

The primary viewport should use:

```text
SVG content layer   pointer events and visible slide
SVG overlay layer   selection, handles, guides, caret
hidden input        keyboard and IME capture
```

Canvas is appropriate only for thumbnails, export, measurement, or visual
comparison.

### 8.3 CSS-aware editing

The property inspector should make the style origin explicit:

```text
Fill: var(--pptv-scheme-accent-1)
Resolved: #6f5cff
Origin: theme dapple.light
```

A user can choose:

- change the shared token;
- change the matched component rule; or
- create a local override.

The editor must not flatten every computed style into inline declarations.

### 8.4 Source and visual views

The initial editor may expose:

- slide navigator;
- visual SVG canvas;
- semantic object tree;
- manifest and theme controls;
- property inspector;
- source fragment view for the selected object;
- diagnostics; and
- export/download controls.

A complete general HTML or CSS IDE is not required.

### 8.5 Saving from a browser

A self-contained HTML file cannot universally overwrite itself because browser
security models differ. The editor should support progressive save modes:

1. File System Access API when the browser and user permit it;
2. download a replacement canonical `.pptv.html` file;
3. communicate with a local CLI or desktop host for direct save; or
4. run inside a desktop shell or editor extension.

The source format must remain usable when none of those enhanced modes exist.

## 9. Trusted `*.editable.pptv.html` foundation and roadmap

An optional fat, portable editing artifact is plausible, but it should be a
generated convenience artifact rather than a second canonical representation.

```text
mydeck.pptv.html            canonical portable deck
mydeck.editable.pptv.html   optional generated deck plus editor application
```

The first editable artifact is a deterministic trusted wrapper. It contains the
exact canonical deck bytes as an inert base64 payload, their SHA-256, one fixed
bundled editor application, and no network dependencies. It opens directly into
authoring mode without asking the browser DOM to reproduce the original source.

Rules:

- the wrapper declares that it is a trusted generated artifact;
- a strict CSP prevents network and unexpected executable dependencies;
- the canonical deck payload is loaded through C4 and checked against its
  embedded hash;
- deck viewer/editor scripts and event-bearing markup remain inert data;
- the editor application is non-authoritative;
- export always produces a clean canonical `.pptv.html`, never the wrapper or
  DOM serialization;
- the wrapper declares its editor version and required digest;
- arbitrary additional scripts remain invalid in strict mode; and
- wrapper generation is deterministic.

The same editor may also accept an explicitly selected canonical file through
the File API. The wrapper is useful for offline direct-open sharing but is not
required for ordinary editing.

Neither artifact is safe to direct-open when its source is untrusted. Browser
opening executes embedded script before the portable library can validate it.
Untrusted source must first pass non-executing validation and then be rendered
inside an appropriate sandbox/CSP boundary.

## 10. Selective OpenDocKit reuse

The local OpenDocKit checkout was verified clean and current at commit
`e4bd919` for this assessment. The 0.1 PPTV package intentionally has no
OpenDocKit dependency. OpenDocKit should be treated as an optional source of
public packages and contribution opportunities, not as canonical PPTV
architecture.

### 10.1 Usable behind a narrow adapter

- public `@opendockit/core/opc` package-reader, part, and relationship APIs;
- selected public XML parsing and targeted OOXML helpers;
- DrawingML theme and color mapping;
- unit, geometry, matrix, and color utilities whose import boundary is public;
- `@opendockit/elements` PageModel/spatial utilities for a derived interaction
  model only;
- font metrics and resolution after confirming their standalone boundary;
- PowerPoint master/layout/placeholder parsing;
- PPTX visual regression and Office ground-truth workflow; and
- generated file structural validation.

### 10.2 Reuse through adapters

OpenDocKit's format-agnostic `PageModel` is a useful interaction projection:
fixed-size pages, flat back-to-front elements, bounds, hit testing, search, and
spatial utilities.

PPTV should derive such a model for interaction, but should not adopt it as its
canonical source model because PPTV requires:

- SVG group hierarchy;
- DOM order as the sole canonical z-order;
- CSS classes and token provenance;
- source ranges; and
- connector and template semantics.

The adapter direction is:

```text
PPTV semantic tree -> PageModel interaction projection
PPTV patch ops      <- editor interaction deltas
```

### 10.3 Blocked code and contribution-back work

OpenDocKit's SVG editing modules contain valuable logic, but current direct
consumption would cross private application boundaries. Selection, handles,
caret, and hidden-input code should first be extracted behind public,
plain-SVG host interfaces with real DOM tests.

The write path also needs correctness work before PPTV relies on it:

- rich-text reconstitution currently ignores per-run properties and clones one
  run-property shape, so round-trip editing is lossy;
- fresh-presentation synthesis/package building is incomplete and needs
  PresentationML schema validation, relationship/content-type construction,
  and a dedicated `PptxPackageBuilder`;
- OpenDocKit's documented mandatory feature-test rigor gate still has open
  items; and
- `@opendockit/pptx` currently pulls a `pdf-signer` package whose
  `package.json` and repository license text conflict, so licensing must be
  resolved before dependency adoption.

Candidate public interfaces to contribute upstream:

```ts
interface TextMeasurer { ... }
interface SelectionOverlay { ... }
interface HiddenTextInput { ... }
interface RichTextEditor { ... }
interface ShapeManipulator { ... }
```

Each extracted component should be testable against plain SVG and a small host
callback contract.

PPTV's C5 hash/precondition/atomic transaction shape and shared fixtures may
also be useful contributions to OpenDocKit collaboration and save layers. The
projects should share protocols and tests where they fit, not merge their
format-specific semantic models.

### 10.4 Code not required for native PPTV editing

The native editor does not need:

- arbitrary PPTX parsing on its critical path;
- DOCX, XLSX, or PDF packages;
- general DrawingML rendering for existing slides;
- OOXML surgical write-back during each edit;
- the full OpenDocKit editor format-module architecture;
- Canvas rendering in the main viewport; or
- broad Office feature capability negotiation.

Those capabilities belong in the optional PowerPoint adapter or separate
import workflows.

## 11. Suggested implementation phases

`PPTV-IMPLEMENTATION-PLAN.md` is the detailed, decision-backed milestone and
acceptance-gate authority. This section is only the architecture summary.

### Phase 0: contracts and fixtures

- **Implemented:** C4/C5, manifest/patch schemas, exact source-range/hash policy,
  a C6 fixed-canvas/explicit-line/CSS profile contract, a normalized minimal
  PPTV HTML fixture, its pure C6 constrained-CSS/token/native-group/text
  resolver, and executable diagnostic tests.
- **Next:** add Node/browser normalized parity plus kitchen-sink and invalid
  profile fixture corpora.

### Phase 1: scanner, index, and agent CLI

- **Implemented:** strict source/manifest/slide/theme/library inventory,
  semantic loading for self-contained HTML, JSON-safe projections and stable-ID
  queries, exact preserve writes for direct text/active theme/slide order, and
  the `outline`, `validate`, `resolve`, `editor-pack`, `pptx-canary`, `text`,
  `show`, `list`, and `patch` CLI.
- **Remaining:** rich-text and token edits, external dependencies,
  geometry/structural operations, and canonical serialization.

This implemented slice already delivers high-value agent workflows, the trusted
editor/session foundation, and a deliberately narrow C7 PPTX compiler canary
without claiming a general converter.

### Phase 2: fixed browser runtime

- **Implemented foundation:** the minimal fixture's trusted direct-open viewer
  and fixed runtime digest verification; deterministic trusted wrapper; exact
  source browser session; clean download; and scriptless semantic SVG viewport
  reconstructed from literal C6 data.
- **Remaining:** writable bundled controls, stale-safe persistence, browser
  tests/snapshots, and full declared-version failure behavior. Sandboxed
  untrusted intake follows the trusted lifecycle.

### Phase 3: native visual editor

- selection and object tree;
- existing direct-text, theme, and slide-order operations first;
- exact source/hash undo and redo;
- clean download and stale-safe explicitly granted file save;
- continuous validation.

### Phase 4: early PowerPoint canary

- **Implemented:** deterministic fresh two-slide package; native rectangles,
  ellipses, straight connectors, translated groups, and one-line
  no-wrap/no-autofit text; stable PowerPoint object names; source/compiler
  provenance; a strict blank master/layout/theme graph; ISO/ECMA validation; and
  OpenDocKit reopen.
- **Native smoke:** the minimal fixture opens read/write in PowerPoint 16.111.2
  without repair and exports a coherent two-page 16:9 PDF.
- **Remaining:** a versioned source map, expanded native fixture, quantitative
  render comparison, and PPTX save/reopen. AppleScript Save As on the current
  install produces zero-byte output even for a known-good control.

### Phase 5: editor/compiler expansion

- typed geometry, connector, child-order, and explicit-line operations;
- arrowheads and expanded connector behavior (straight connectors already
  compile in C7);
- translated-group editor operations (translated native groups already compile
  in C7);
- explicit multiline text;
- atomic SVG/raster assets; and
- theme-token editing after CSS provenance exists.

### Phase 6: reconciliation and collaboration

- inspect edited PPTX against a known baseline;
- generate PPTV semantic patches;
- support edit batches and attribution;
- add collaboration adapters; and
- distinguish shared theme edits from local overrides.

## 12. Design decision

The recommended posture is:

> Build the native PPTV toolchain and mini-editor from scratch around a small,
> hierarchical semantic model bound to exact source bytes. Keep one
> `@office180/pptv` package until real consumers justify a split. Reuse
> OpenDocKit only through narrow optional adapters after the relevant public-API,
> save-fidelity, test-rigor, package-builder, and license blockers are resolved.

This keeps the common path small while preserving a credible route to a very
capable PPTX compiler and reverse-inspection workflow.
