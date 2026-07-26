# PPTV Tooling and Editor Architecture

**Status:** design proposal; no implementation yet  
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
through narrow adapters, while retaining its own canonical model and a much
smaller editor.

The recommended split is:

```text
PPTV source
  -> PPTV parser and source index
  -> canonical PPTV semantic tree
  -> projections and semantic patch engine
       -> browser viewer
       -> native PPTV editor
       -> agent CLI
       -> PPTX compiler/reconciler adapter
```

The semantic tree is canonical. Browser DOM, editor interaction models,
PowerPoint IR, and generated PPTX are projections.

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

## 4. Proposed package structure

A future standalone repository may use this package split:

```text
packages/
  core/       @pptv/core
  css/        @pptv/css
  ops/        @pptv/ops
  browser/    @pptv/browser
  editor/     @pptv/editor
  pptx/       @pptv/pptx
  cli/        @pptv/cli
```

A first implementation can keep these as modules in one package, but the
interfaces should preserve these boundaries.

### 4.1 `@pptv/core`

Responsibilities:

- recognize `.pptv.svg`, `.pptv.html`, and `.pptv-manifest.json`;
- parse the manifest without executing script;
- scan and index slide templates, libraries, themes, and the reference runtime;
- create the canonical semantic tree;
- preserve stable source locations;
- validate IDs, roles, export modes, and physical source order;
- serialize canonical source;
- calculate source and dependency hashes; and
- expose deterministic diagnostics.

It must not depend on PowerPoint or an editor UI.

### 4.2 `@pptv/css`

Responsibilities:

- parse the constrained PPTV CSS profile;
- resolve theme inheritance and custom properties;
- distinguish token references from computed values;
- expose selected styles without forcing all styles into every agent view;
- canonicalize supported rules; and
- reject unsupported or nondeterministic CSS.

This package should retain both:

```text
computed value: #6f5cff
source binding: --pptv-scheme-accent-1
```

The source binding is essential for native PowerPoint theme generation and for
compact theme-level patches.

### 4.3 `@pptv/ops`

Responsibilities:

- generate outline, semantic, editing, and resolved projections;
- query objects by stable ID, role, class, type, slide, or relationship;
- apply semantic patch transactions;
- validate preconditions and source hashes;
- maintain undoable operation batches; and
- report the minimal affected source ranges.

This is the preferred interface for agents and programmatic editing.

### 4.4 `@pptv/browser`

Responsibilities:

- implement the fixed reference viewer runtime;
- read the manifest;
- activate one named theme;
- clone slides into manifest order;
- provide navigation and print-friendly output; and
- expose optional read-only inspection hooks.

The browser runtime is generated boilerplate. It is not authoritative and is
never executed by validators or compilers.

### 4.5 `@pptv/editor`

Responsibilities:

- provide a small, native PPTV authoring application;
- edit PPTV semantic objects, not arbitrary browser DOM;
- render the same SVG the user is editing;
- use an SVG overlay only for selection, handles, guides, and cursors;
- emit semantic operations through `@pptv/ops`;
- preserve CSS classes and token bindings rather than flattening styles;
- validate continuously; and
- save or export canonical `.pptv.html` and `.pptv.svg`.

It should be written specifically for PPTV rather than adapting a full Office
editor UI.

### 4.6 `@pptv/pptx`

Responsibilities:

- compile canonical PPTV into editable PPTX;
- map PPTV themes onto DrawingML theme slots when possible;
- synthesize or bind masters, layouts, and placeholders;
- embed complex SVG assets with fallbacks;
- write stable PowerPoint object names and provenance;
- inspect generated and edited PPTX files;
- generate reviewable reverse patches; and
- reuse selected OpenDocKit OOXML and fidelity infrastructure.

This package is optional for users who only need browser-native PPTV.

### 4.7 `@pptv/cli`

Responsibilities:

- expose the core, query, patch, validation, rendering, and conversion APIs;
- produce compact human or machine output;
- remain scriptable without launching a server; and
- provide the canonical tool path documented for agents.

## 5. Canonical semantic model

PPTV should define its own small hierarchical IR.

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
but the initial model should remain recognizably close to SVG.

### 5.1 Preserve hierarchy

The PPTV semantic model must preserve SVG group hierarchy and DOM order.

An editor may derive a flat spatial interaction model, but that flat model is
not canonical. This avoids importing a second z-order authority such as a
fractional index into the source format.

### 5.2 Preserve source ranges

The parser should index byte or character ranges for:

- manifest fields;
- slide templates;
- objects by stable ID;
- theme blocks;
- token declarations;
- library blocks; and
- the reference runtime.

This enables surgical edits and cheap retrieval without reserializing the
entire HTML file.

### 5.3 Preserve source intent

For relevant properties, retain:

- direct attributes;
- inline style declarations;
- matched CSS rules;
- custom-property bindings;
- and computed values.

A patch should be able to change a shared token, a component rule, or one local
override without guessing which layer the author intended.

## 6. Processing functions

The public API should emphasize small, composable functions rather than one
large compiler object.

### 6.1 Load and index

```ts
scanPptvSource(input, options): Promise<PptvScan>
parseManifest(scan): PptvManifest
buildSourceIndex(scan): PptvSourceIndex
loadDeck(input, options): Promise<PptvDeck>
validateDeck(deck, options): Diagnostic[]
```

`scanPptvSource()` should discover the control plane before parsing all slide
geometry. A caller requesting only an outline should not pay to resolve CSS or
expand reusable artwork.

### 6.2 Query and projections

```ts
outlineDeck(deck, options): DeckOutline
getSlide(deck, slideId, view): SlideProjection
getObject(deck, objectId, view): ObjectProjection
queryObjects(deck, query, view): ObjectProjection[]
getTheme(deck, themeId, view): ThemeProjection
```

Supported views:

```text
outline   manifest, slides, object IDs, roles, relationships, text snippets
semantic  meaningful objects and text, excluding paint and path detail
editing   geometry, text, classes, token references, children, connections
resolved  computed CSS, flattened transforms, fonts, assets, source fragments
```

The default agent view should be `semantic`.

### 6.3 Patch and save

```ts
applyPatch(deck, patch, options): PatchResult
validatePatch(deck, patch): Diagnostic[]
serializeDeck(deck, options): string
writeDeck(deck, destination, options): Promise<WriteResult>
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
      "old": "Authorization service",
      "value": "Policy and authorization"
    },
    {
      "op": "move",
      "id": "node.authorization",
      "dx": 80,
      "dy": 0
    },
    {
      "op": "set-token",
      "theme": "dapple.light",
      "name": "--pptv-scheme-accent-1",
      "value": "#7257ff"
    }
  ]
}
```

Preconditions prevent stale or ambiguous edits. The patch result identifies
which source spans changed and reruns profile validation.

### 6.4 Normalize and render

```ts
normalizeDeck(deck, options): NormalizedDeck
renderSlide(deck, slideId, options): SVGElement | string
renderDeckHtml(deck, options): string
renderThumbnail(deck, slideId, options): Promise<Blob | Uint8Array>
```

Normalization resolves authoring conveniences into deterministic compiler input
but need not create additional files unless requested.

### 6.5 PowerPoint adapter

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

```text
pptv outline <file>
pptv show <file> <id> [--view semantic|editing|resolved]
pptv list <file> [--slide ID] [--role ROLE] [--class CLASS]
pptv text <file> [--slide ID]
pptv theme <file> [--active] [--tokens]
pptv patch <file> <patch.json>
pptv validate <file>
pptv normalize <file>
pptv render <file>
pptv build-pptx <file>
pptv inspect-pptx <file.pptx>
pptv reconcile <file.pptx> --source <file.pptv.html>
```

### 7.2 Cheap operations remain cheap

`outline`, `text`, and manifest edits should parse only the required source
regions. They must not resolve all CSS, fonts, paths, or embedded assets.

### 7.3 Machine output

Commands should support:

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

## 8. Native PPTV editor

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

## 9. `*.editable.pptv.html`

An optional fat, portable editing artifact is plausible, but it should be a
generated convenience artifact rather than a second canonical representation.

```text
mydeck.pptv.html            canonical portable deck
mydeck.editable.pptv.html   optional generated deck plus editor application
```

The editable artifact may embed or reference the editor bundle and open directly
into authoring mode. It must preserve the same declarative manifest, slide,
library, and theme blocks.

Rules:

- the canonical deck data remains parseable without executing the editor;
- the editor application is non-authoritative;
- validators and PPTX compilers ignore executable editor code;
- export produces a clean canonical `.pptv.html` by default;
- the editable artifact declares its editor version and optional digest;
- arbitrary additional scripts remain invalid in strict mode; and
- a missing editor bundle degrades to ordinary view-only PPTV.

An alternative is to use the same `.pptv.html` file and open it through a
separate editor application. The fat artifact is useful for offline sharing,
but should not be required for ordinary editing.

## 10. Selective OpenDocKit reuse

OpenDocKit should be treated as a source of proven packages and patterns, not as
the canonical PPTV architecture.

### 10.1 Strong candidates for direct reuse or extraction

- OPC package and relationship handling;
- XML parsing and targeted OOXML patching;
- DrawingML theme and color mapping;
- font metrics and font resolution;
- geometry and matrix utilities;
- SVG selection, handles, hit testing, caret, and hidden-input patterns;
- rich-text run model and measurement interfaces;
- spatial indexing and collision queries;
- serializable edit deltas and conflict handling;
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

### 10.3 Code to extract carefully

OpenDocKit's SVG editing modules contain valuable logic, but some currently
live inside a general editor and retain assumptions from PPTX rendering. They
should be mined or extracted behind small interfaces rather than imported as a
large application dependency.

Candidate interfaces:

```ts
interface TextMeasurer { ... }
interface SelectionOverlay { ... }
interface HiddenTextInput { ... }
interface RichTextEditor { ... }
interface ShapeManipulator { ... }
```

Each extracted component should be testable against plain SVG and a small host
callback contract.

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

### Phase 0: contracts and fixtures

- finalize HTML container proposal;
- define semantic projection and patch schemas;
- create minimal and kitchen-sink PPTV HTML fixtures;
- define expected diagnostics and canonical serialization; and
- establish browser snapshots.

### Phase 1: scanner, index, and agent CLI

- scan manifest, slides, themes, and libraries;
- produce outline and semantic views;
- address objects by stable ID;
- apply text, manifest-order, and token patches;
- preserve source formatting where practical; and
- validate physical source order and IDs.

This phase already delivers high-value agent workflows without an editor or
PPTX compiler.

### Phase 2: fixed browser runtime

- render manifest order;
- activate named themes;
- navigate and print;
- verify digest/version behavior; and
- degrade clearly when declarations are invalid.

### Phase 3: native visual editor

- selection and object tree;
- move, resize, reorder, and delete;
- text editing;
- property and token editing;
- undo/redo using semantic operations;
- browser save/download; and
- continuous validation.

### Phase 4: PowerPoint compiler

- native text and simple geometry;
- embedded SVG assets;
- theme-slot preservation;
- stable PowerPoint object names;
- provenance and source map;
- masters, layouts, and placeholders; and
- OpenDocKit-backed validation and render comparison.

### Phase 5: reconciliation and collaboration

- inspect edited PPTX against a known baseline;
- generate PPTV semantic patches;
- support edit batches and attribution;
- add collaboration adapters; and
- distinguish shared theme edits from local overrides.

## 12. Design decision

The recommended posture is:

> Build the native PPTV toolchain and mini-editor from scratch around a small,
> hierarchical, source-preserving semantic model. Reuse OpenDocKit only through
> narrow packages and adapters, especially for interaction primitives, fonts,
> geometry, OOXML, PowerPoint semantics, and fidelity testing.

This keeps the common path small while preserving a credible route to a very
capable PPTX compiler and reverse-inspection workflow.