# PPTV Tooling and Editor Architecture

**Status:** single-package TypeScript vertical slice implemented through
first-class deck/diagram C4-C6 semantics, the writable trusted browser editor,
and the strict C7 PPTX canary; geometry/rich-text editing and broader
PowerPoint adaptation remain roadmap
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
first-class HTML-deck and standalone-SVG-diagram loading, semantic/editing
projections, exact source ranges and hashing, a constrained C6
CSS/geometry/text resolver, C5 direct-text edits for both source kinds,
deck-only active-theme/slide-order edits, deterministic deck-slide hydration
into an independent diagram atom, and an exact-source browser session. Its
generated trusted editor is writable, works offline for either source kind,
downloads clean current source, extracts one hydrated deck slide as
`.pptv.svg`, and refuses stale file-handle saves. The package also contains a
strict fresh-package C7 PPTX canary and Node CLI. It does not yet provide
canonical serialization, geometry or structured-rich-text editing, broad PPTX
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
  src/browser/                  session, shared runtime/measurement, editor app
  src/node/                     file I/O, exact-font fit, pack, PPTX canary
  src/cli.ts                    Node command surface
  schemas/                      manifest and patch schemas
```

Public boundaries are the root package plus `@office180/pptv/core`,
`@office180/pptv/ops`, `@office180/pptv/browser`, `@office180/pptv/node`, and
versioned schema subpaths. Internal module names are not permission to publish
seven speculative packages. A future split should follow actual
browser/editor/PPTX consumers and keep one implementation of C4-C8.

### 4.1 Portable core

Implemented responsibilities are exact source retention/hashing/range mapping,
source recognition, strict non-executing HTML/SVG inventory, manifest parsing,
stable-ID hierarchical deck/diagram loading, security/resource diagnostics,
deck-slide hydration/dereferencing, and immutable source-hash-bound snapshots.
The core has no filesystem, UI, PowerPoint, or OpenDocKit dependency.

### 4.2 Operations

Implemented read operations are outline, inventory, text, semantic/editing
projection, and stable-ID/role/class/element/text/descendant queries.
Implemented writes are asynchronous and transactional: `set-text` applies to a
deck or standalone diagram, while `set-active-theme` and `set-slide-order` are
explicitly deck-only. Both validation and application reconstruct a trusted
same-kind base instead of trusting caller-mutated indexes.

### 4.3 Node host and CLI

The host reads exact bytes and writes only to an explicit destination through a
temporary peer, fsync, and atomic rename or exclusive no-overwrite publication.
The CLI exposes `outline`, `validate`, `resolve`, `extract`, `editor-pack`,
`pptx-canary`, `text-fit`, `text`, `show`, `list`, and `patch`. `extract`,
`editor-pack`, and `pptx-canary` require an explicit `--output`; extraction
additionally refuses overwrite. `editor-pack` optionally accepts an explicit
font map and near-limit threshold
for exact/browser C8 evidence; `text-fit` requires an explicit font map; and
`patch` requires exactly one of `--check` or `--output`. C7 remains HTML-deck
only even when a standalone diagram happens to use a 16:9 viewBox.

### 4.4 Implemented boundaries and roadmap

Constrained CSS/theme resolution, the shared browser runtime, writable
exact-source editor session and trusted wrapper, environment-labeled plus
exact-font non-mutating fit evidence, and strict PPTX compilation now live
behind logical interfaces within this package. Direct-text, active-theme, and
slide-order controls are implemented; geometry, structured hard-line/rich-text,
theme-token, and general visual editing remain roadmap. Broad PPTX
compile/inspect/reconcile and any PowerPoint/OpenDocKit adapter also remain
roadmap. The adapter must remain optional. Separate packages are warranted only
when they provide a real dependency or runtime boundary.

## 5. Source authority and semantic model

PPTV defines a small hierarchical IR bound to the exact retained source bytes.
The source is persistent authority; the Map-rich model is an immutable
in-process snapshot and is not serialized directly across CLI/MCP boundaries.

```ts
interface PptvDeck {
  sourceKind: 'html';
  version: string;
  title?: string;
  activeTheme?: string;
  slideOrder: string[];
  slides: Map<string, PptvSlide>;
  baseStyle?: PptvBaseStyle;
  themes: Map<string, PptvTheme>;
  libraries: Map<string, PptvLibrary>;
  source: PptvSourceDocument;
  index: PptvSourceIndex;
  manifest: PptvManifest;
  materialization: {
    level: 'semantic';
    slideIds: string[];
    complete: boolean;
  };
  diagnostics: Diagnostic[];
}

interface PptvDiagram {
  sourceKind: 'svg';
  version: '0.1';
  id: string;
  viewBox: [number, number, number, number];
  children: PptvNode[];
  sourceRange: SourceRange;
  source: PptvSourceDocument;
  index: PptvDiagramIndex;
  diagnostics: Diagnostic[];
}

interface PptvSlide {
  id: string;
  layout?: string;
  hidden: boolean;
  viewBox: [number, number, number, number];
  children: PptvNode[];
  sourceRange: SourceRange;
}

interface PptvNode {
  id: string;
  role: 'shape' | 'text' | 'connector' | 'group' | 'asset';
  exportMode: 'native' | 'svg' | 'raster' | 'ignore';
  elementName: string;
  classes: string[];
  attributes: Record<string, string>;
  parentId: string | null;
  children: PptvNode[];
  text?: string;
  opaque: boolean;
  sourceRange: SourceRange;
  openTagRange: SourceRange;
  directTextRange?: SourceRange;
}
```

The C4 semantic types remain recognizably close to SVG; C6 separately
specializes supported geometry, text, connectors, assets, and groups without
making those resolved values a second source authority. Both source kinds
retain the exact source document, their own source index, and diagnostics. A
deck additionally retains its manifest and materialization record. A diagram
does not synthesize a manifest, slide identity/order, theme, or physical
PowerPoint canvas.

### 5.1 Preserve hierarchy

The PPTV semantic model must preserve SVG group hierarchy and DOM order.

An editor may derive a flat spatial interaction model, but that flat model is
not canonical. This avoids importing a second z-order authority such as a
fractional index into the source format.

### 5.2 Preserve source ranges

The parser indexes both half-open UTF-8 byte and UTF-16 code-unit ranges for:

- manifest fields;
- slide templates;
- standalone diagram roots;
- objects by stable ID;
- theme blocks;
- library blocks; and
- the reference runtime.

A leading BOM and newline spelling are retained; SHA-256 covers the exact bytes.
Token-declaration ranges are roadmap. Current safe edits avoid reserializing the
entire HTML file.

### 5.3 Preserve source intent

The 0.1 kernel retains exact source, raw attributes/classes where allowed,
hierarchy, export intent, and source ranges. C6 already records concrete values
and property provenance for its deliberately small cascade:

- direct attributes;
- inline style declarations;
- matched CSS rules;
- custom-property bindings;
- and computed values.

A future typed style patch should be able to change a shared token, a component
rule, or one local override without guessing which layer the author intended.
The writable editor does not expose a generic CSS or attribute writer.

## 6. Processing functions

The public API should emphasize small, composable functions rather than one
large compiler object.

### 6.1 Load and index

```ts
scanPptvSource(input, options): Promise<PptvScan>
parseManifest(scan): ManifestParseResult
loadDeck(input, options): Promise<PptvDeck>
loadDiagram(input, options): Promise<PptvDiagram>
loadPptvDocument(input, options): Promise<PptvDeck | PptvDiagram>
validateDeck(deck): Diagnostic[]
validateDiagram(diagram): Diagnostic[]
```

`scanPptvSource()` builds a non-executing source-located inventory, enforces
resource/security policy, and verifies the fixed runtime digest where an HTML
deck has one. `loadDeck()` semantically materializes all or selected slides;
`loadDiagram()` materializes one complete standalone SVG atom; and the generic
loader dispatches without coercing either kind. Outline/manifest reads do not
resolve CSS, libraries, or assets, though the scanner currently traverses the
full input rather than streaming only the leading control plane.

### 6.2 Query and projections

```ts
outlineManifest(manifest): DeckOutline
getSlide(deck, slideId, view): SlideProjection
getObject(deck, objectId, view): ObjectProjection
queryObjects(deck, query, view): ObjectProjection[]
extractText(deck, options): TextProjection
outlineDiagram(diagram): DiagramOutline
getDiagram(diagram, view): DiagramProjection
getDiagramObject(diagram, objectId, view): DiagramObjectProjection
queryDiagramObjects(diagram, query, view): DiagramQueryProjection
extractDiagramText(diagram): DiagramTextProjection
```

Implemented object/slide views:

```text
semantic  hierarchy, roles, exports, elements, and decoded text
editing   semantic data plus raw attributes, classes, ranges, and slide viewBox
```

Outline, inventory, and text are separate source-kind-specific JSON-safe
projections. C6 provides a physical fixed-canvas deck projection and a distinct
logical-canvas diagram projection for the contracted style provenance,
geometry, explicit text, and opaque-asset boundaries. The diagram model has no
synthetic slide/theme/EMU fields. General font discovery, asset loading,
relationships, and a resolved per-object `show` view remain roadmap. The
default object view is `semantic`.

### 6.3 Patch and save

```ts
applyPatch(deckOrDiagram, input: unknown): Promise<PatchResult>
validatePatch(deckOrDiagram, input: unknown): Promise<Diagnostic[]>
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

The engine reconstructs a trusted same-kind base snapshot, validates every
operation and overlap before mutation, applies replacements from later offsets
to earlier offsets, and reloads the candidate before success. Standalone
diagrams accept direct `set-text` only; theme/order operations fail explicitly
instead of inventing deck state. `validatePatch()` is also asynchronous but
validates only the complete plan. General serialization and library writers
are roadmap; the Node CLI owns explicit atomic filesystem output, while the
trusted editor returns exact current bytes through download or an explicitly
granted file handle.

### 6.4 C6 resolution and broader normalize/render roadmap

```ts
resolvePptvDeck(deck): PptvResolvedResult
resolvePptvDiagram(diagram): PptvResolvedDiagramResult
extractPptvDiagram(deck, slideId): Promise<PptvDiagramExtractionResult>
```

The current resolver maps the fixed deck canvas or arbitrary finite standalone
diagram viewBox, supported style subset, finite primitive/group geometry,
opaque asset boundaries, and explicit hard-line text to deterministic data with
diagnostics. C6 accepts a direct line or direct, non-nested `tspan` lines; C7 is
the HTML-deck-only surface that currently requires one line per text object.
`extractPptvDiagram()` hydrates one fully resolved deck slide by dereferencing
its active theme/base classes into local supported declarations, then reloads
the new SVG through the independent diagram C4/C6 path. The resolver and
extractor perform no network or filesystem asset resolution.

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
pptv extract <file> --slide ID --output PATH [--format text|json]
pptv editor-pack <file> --output PATH [--font-map PATH] [--near-limit N]
                 [--format text|json]
pptv pptx-canary <file> --output PATH [--format text|json]
pptv text-fit <file> --font-map PATH [--near-limit N] [--format text|json]
pptv text <file> [--slide ID] [--include-hidden] [--format text|json|jsonl]
pptv show <file> <id> [--view semantic|editing] [--format json]
pptv list <file> [--slide ID] [--role ROLE] [--class CLASS] [--text TEXT]
          [--view semantic|editing] [--format text|json|jsonl]
pptv patch <file> <patch.json> (--check | --output PATH)
           [--format text|json]
```

The read commands, direct-text patch, text-fit, and editor-pack accept either a
self-contained `.pptv.html` deck or first-class `.pptv.svg` diagram. Deck-only
flags and operations fail for diagrams. `extract` hydrates one HTML-deck slide
into a validated standalone atom and refuses overwrite; `pptx-canary` also
accepts HTML decks only. Neither the CLI nor editor wraps a diagram into a
synthetic slide.

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

The repository ships `.agents/skills/pptv-authoring/SKILL.md` as the versioned
operational guide. It instructs agents to:

1. inspect `outline` before reading raw source;
2. retrieve only the relevant slide or object;
3. use semantic patch operations instead of rewriting XML or HTML;
4. validate after every transaction; and
5. render only when visual confirmation is needed.

A PPTV file may declare a known profile identifier, but comments and arbitrary
embedded text are never trusted as agent instructions.

## 8. Native PPTV editor: writable trusted MVP implemented

The editor is a small application built from scratch around the PPTV model.
The implemented trusted MVP supports a deck or standalone diagram, while
geometry handles, structured line/rich-text editing, token-rule editing, and
general SVG authoring remain roadmap.

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

The editor never treats a browser-generated clone as canonical source. Every
successful direct-text/theme/order intent commits through `EditorSession` and
C5, reloads through C4, then regenerates outline, inventory, C6, and C8 views.
Failed edits add no history and leave exact source unchanged.

### 8.2 Pure SVG viewport

The current primary viewport reconstructs only supported SVG from literal C6
data and uses object clicks for selection. Text-fit frame overlays are amber
for near-limit, red for overflow, purple for unverified, and absent for clear.
The richer interaction architecture remains:

```text
SVG content layer   pointer events and visible slide
SVG overlay layer   selection, handles, guides, caret
hidden input        keyboard and IME capture
```

Canvas is appropriate only for thumbnails, export, measurement, or visual
comparison. Drag handles, caret/IME capture, geometry changes, and hit-testing
beyond supported object selection are not implemented.

### 8.3 CSS-aware editing

The property inspector should make the style origin explicit:

```text
Fill: var(--pptv-scheme-accent-1)
Resolved: #6f5cff
Origin: theme dapple.light
```

A future style editor could let a user choose:

- change the shared token;
- change the matched component rule; or
- create a local override.

The implemented editor exposes deck active-theme selection but no token,
component-rule, or local-style editing. It must not flatten every computed
style into inline declarations.

### 8.4 Source and visual views

The implemented editor exposes:

- conditional slide/diagram navigator;
- visual SVG canvas;
- semantic object tree;
- direct-text Apply;
- deck-only active-theme and slide-order controls;
- exact-source undo/redo;
- property inspector;
- exact current source view;
- diagnostics; and
- clean source download;
- deck-only hydrated single-slide `.pptv.svg` download; and
- optional stale-safe File System Access save.

A complete general HTML or CSS IDE is not required.

### 8.5 Saving from a browser

A self-contained HTML file cannot universally overwrite itself because browser
security models differ. The implemented editor supports the first two
progressive save modes:

1. File System Access API when the browser and user permit it; the first picker
   selection explicitly authorizes overwrite, and every later save compares the
   on-disk SHA-256 with the last successful editor save before writing;
2. download exact current clean `.pptv.html` or `.pptv.svg` bytes;
3. communicate with a local CLI or desktop host for direct save; or
4. run inside a desktop shell or editor extension.

The source format must remain usable when none of those enhanced modes exist.

## 9. Trusted `*.editable.pptv.html` pack

The implemented fat, portable editing artifact is a generated convenience
artifact rather than a second canonical representation.

```text
mydeck.pptv.html            canonical portable deck
mydeck.editable.pptv.html   optional generated deck plus editor application
diagram.pptv.svg            canonical standalone atom
diagram.editable.pptv.html  optional generated diagram plus editor application
```

The implemented editable artifact is a deterministic trusted wrapper. It
contains exact canonical deck or diagram bytes as an inert base64 payload,
their SHA-256, source-kind-specific fresh projections, one fixed
TypeScript/esbuild-bundled editor application, and no network dependencies. It
opens directly into authoring mode without asking the browser DOM to reproduce
the original source.

Rules:

- the wrapper declares that it is a trusted generated artifact;
- a strict CSP prevents network and unexpected executable dependencies;
- the canonical deck/diagram payload is loaded through C4 and checked against
  its embedded hash; a mismatch keeps the session read-only;
- source viewer/editor scripts and event-bearing markup remain inert data;
- the editor application is non-authoritative;
- export always produces exact current clean `.pptv.html` or `.pptv.svg`,
  never the wrapper or DOM serialization;
- one deck slide may be downloaded as a newly hydrated standalone atom only
  after theme/class dereferencing and independent C4/C6 diagram reload;
- the wrapper declares its editor version and required digest;
- arbitrary additional scripts remain invalid in strict mode; and
- wrapper generation is deterministic.

With an explicit font map, the pack embeds only caller-selected font bytes,
their SHA-256/PostScript identity, precomputed Fontkit glyph coverage, and the
matching Node C8 result. The browser loads those bytes through `FontFace`
BufferSource and records its engine/version measurement. The overlay uses the
worse Node/browser status. Embedded Node evidence is reused only while the
current line, font, anchor, and capacity still match; an edited line without
current Node evidence is conservatively `unverified`, even if the browser can
measure it. Neither path wraps, repairs, resizes, or re-lines text.

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

- **Implemented:** C4/C5 deck and standalone-diagram semantics, manifest/patch
  schemas, exact source-range/hash policy, distinct physical-deck and
  logical-diagram C6 projections, normalized minimal fixtures, constrained
  CSS/local-style/native-group/text resolution, kitchen-sink/invalid corpora,
  and normalized Node/browser parity across Chromium, Firefox, and WebKit.
- **Remaining:** broader C6 capabilities stay contract-first; the current
  profile remains deliberately small.

### Phase 1: scanner, index, and agent CLI

- **Implemented:** strict source/manifest/slide/theme/library inventory,
  semantic loading for self-contained HTML decks and SVG diagrams, distinct
  JSON-safe projections and stable-ID queries, exact preserve writes for
  direct text in either kind plus deck-only active theme/slide order, and the
  `outline`, `validate`, `resolve`, `extract`, `editor-pack`, `pptx-canary`,
  `text-fit`, `text`, `show`, `list`, and `patch` CLI.
- **Remaining:** rich-text and token edits, external dependencies,
  geometry/structural operations, and canonical serialization.

This implemented slice already delivers high-value agent workflows, the
writable trusted editor/session, and a deliberately narrow C7 PPTX compiler
canary without claiming a general converter.

### Phase 2: fixed browser runtime

- **Implemented:** the minimal fixture's trusted direct-open viewer and fixed
  runtime digest verification; a deterministic shared browser kernel; exact
  deck/diagram source sessions; trusted writable packs; scriptless semantic SVG
  reconstruction; clean downloads; exact-font browser measurement; and
  Chromium/Firefox/WebKit conformance tests.
- **Remaining:** sandboxed untrusted intake follows the now-proven trusted
  lifecycle.

### Phase 3: native visual editor

- **Implemented MVP:** deck/diagram navigation, object selection/tree,
  direct-text Apply, deck theme/order controls, exact source/hash undo/redo,
  diagnostics/inspector/source views, conservative dual C8 overlays, clean
  download, hydrated per-slide SVG download, and stale-safe explicitly granted
  file save.
- **Remaining:** typed geometry, connector, explicit-line/structured-text,
  grouping/order, style/token, and insertion/deletion operations.

### Phase 4: early PowerPoint canary

- **Implemented:** deterministic fresh two-slide package; native rectangles,
  ellipses, straight connectors, translated groups, and one-line
  no-wrap/no-autofit text; stable PowerPoint object names; source/compiler
  provenance; a strict blank master/layout/theme graph; ISO/ECMA validation; and
  OpenDocKit reopen.
- **Native smoke:** the minimal fixture opens in PowerPoint 16.111.2 without
  repair and exports a coherent two-page 16:9 PDF.
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
