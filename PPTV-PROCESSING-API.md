# PPTV Processing API and Semantic Operations

**Status:** design proposal; no implementation yet  
**Primary implementation language:** TypeScript  
**Companions:** [`PPTV-DESIGN-INDEX.md`](PPTV-DESIGN-INDEX.md),
[`PPTV-HTML-CONTAINER.md`](PPTV-HTML-CONTAINER.md), and
[`PPTV-TOOLING-AND-EDITOR.md`](PPTV-TOOLING-AND-EDITOR.md)

## 1. Purpose

This document specifies the intended processing architecture for PPTV.

The goal is not merely to parse SVG or HTML. The goal is to provide one small,
deterministic substrate for:

- token-efficient agent inspection;
- safe semantic editing;
- browser rendering;
- a native visual editor;
- normalization and validation;
- deterministic PPTX compilation; and
- baseline-aware reconciliation of edited PPTX files.

The processing API must make cheap questions cheap. A request for slide order or
visible text must not require resolving every CSS rule, expanding every symbol,
loading every asset, measuring every font, or parsing the final runtime.

## 2. Hard invariants

Every implementation must preserve these invariants:

1. **Canonical content is declarative.** Meaning comes from the manifest, slide
   templates, SVG, supported CSS, reusable definitions, and PPTV annotations.
2. **Executable code is non-authoritative.** Viewer and editor runtimes are never
   executed by validators or compilers to discover document meaning.
3. **Stable IDs are canonical identity.** Browser node identity, PowerPoint shape
   IDs, array positions, and generated indexes are implementation details.
4. **Manifest order is slide order.** Physical slide-template order does not
   reorder the deck.
5. **SVG DOM order is object z-order.** No independent z-index field competes
   with source order inside a slide or group.
6. **Source intent is preserved.** Tools retain whether a property came from an
   attribute, inline style, CSS rule, custom property, or theme token.
7. **Unsupported behavior is explicit.** Tools fail or preserve an opaque asset
   boundary; they do not silently rasterize or reinterpret content.
8. **Semantic operations are transactional.** A stale or partially applicable
   patch must not leave the source half-modified.
9. **Native PPTV editing does not require OOXML.** PowerPoint support is an
   optional adapter, not part of the core editing path.
10. **No network access by default.** Local and embedded dependencies are
    sufficient for inspection, editing, rendering, and compilation.

## 3. Representation layers

PPTV processing uses distinct representations with one-way derivation:

```text
Raw source text and byte spans
  -> source scan and section index
  -> parsed manifest and selected source fragments
  -> hierarchical PPTV semantic tree
  -> optional resolved style and normalized geometry
       -> outline / semantic / editing / resolved projections
       -> browser DOM
       -> editor interaction projection
       -> PPTX adapter IR
```

Only the raw declarative source and the hierarchical PPTV semantic tree are
canonical for native PPTV operations.

### 3.1 Raw source

The exact `.pptv.html`, `.pptv.svg`, or `.pptv-manifest.json` source, including:

- whitespace;
- comments;
- quote choices;
- attribute order;
- CSS formatting;
- runtime text; and
- unselected themes.

Raw source is retained so simple edits can be surgical.

### 3.2 Source scan

A shallow inventory of top-level PPTV sections and their source ranges. It is
created without parsing slide geometry or resolving CSS.

### 3.3 Semantic tree

A hierarchical, format-specific model close to SVG. It preserves stable IDs,
DOM order, source ranges, classes, attributes, roles, export intent, connector
relationships, and source-style provenance.

### 3.4 Resolved model

A derived model containing computed CSS, flattened supported transforms,
resolved theme bindings, normalized geometry, font decisions, and expanded
reusable definitions.

The resolved model is disposable and source-hash-bound.

### 3.5 Interaction model

A derived, potentially flat model optimized for hit testing, selection, drag,
resize, alignment, and spatial queries. It may use an R-tree or fractional
indexes internally but cannot redefine canonical hierarchy or z-order.

### 3.6 PowerPoint adapter model

A derived representation used to write or inspect PresentationML. Office shape
IDs and relationship IDs never become canonical PPTV identity.

## 4. Input abstraction

The core library should accept bytes or text without assuming a filesystem:

```ts
export type PptvInput =
  | { kind: 'text'; text: string; name?: string }
  | { kind: 'bytes'; bytes: Uint8Array; name?: string }
  | { kind: 'path'; path: string }
  | { kind: 'file'; file: File };
```

Browser builds may omit `path`; Node builds may omit `file`.

Dependency resolution is injected:

```ts
export interface DependencyResolver {
  read(ref: PptvDependencyRef): Promise<Uint8Array>;
  stat?(ref: PptvDependencyRef): Promise<PptvDependencyStat>;
}
```

The default resolver:

- permits embedded content;
- permits local files below declared roots;
- rejects path traversal;
- rejects remote HTTP(S) retrieval unless explicitly enabled; and
- records a content hash for every dependency read.

## 5. Processing levels

Callers should request the minimum materialization level they need:

```ts
export type PptvLoadLevel =
  | 'scan'
  | 'manifest'
  | 'outline'
  | 'semantic'
  | 'editing'
  | 'resolved'
  | 'normalized';
```

### 5.1 Work matrix

| Level | Required work | Explicitly deferred |
|---|---|---|
| `scan` | recognize container; locate top-level blocks | JSON parse, slide parse, CSS, assets |
| `manifest` | parse and validate leading manifest | slide geometry, CSS, assets |
| `outline` | manifest plus slide/object shallow index and text snippets | computed styles, paths, fonts, assets |
| `semantic` | selected hierarchical objects and relationships | computed paint, font measurement, expansion |
| `editing` | geometry, classes, token references, source ownership | expensive filters, rasterization, PPTX |
| `resolved` | computed CSS, transforms, dependencies, fonts | target-specific PPTX writing |
| `normalized` | deterministic compiler-ready model | none within supported profile |

A tool must not silently promote a request to a much more expensive level unless
an operation actually requires it.

## 6. Source scanning

### 6.1 Public API

```ts
export interface ScanOptions {
  strictOrder?: boolean;
  computeHash?: boolean;
  maxSourceBytes?: number;
}

export function scanPptvSource(
  input: PptvInput,
  options?: ScanOptions
): Promise<PptvScan>;
```

### 6.2 Scan result

```ts
export interface PptvScan {
  kind: 'svg' | 'html' | 'manifest';
  name?: string;
  encoding: 'utf-8';
  sourceLength: number;
  sourceSha256?: string;
  versionHint?: string;
  sections: PptvSectionRef[];
  diagnostics: Diagnostic[];
}

export interface PptvSectionRef {
  kind:
    | 'html-head'
    | 'manifest'
    | 'output-mount'
    | 'slide'
    | 'library'
    | 'theme'
    | 'viewer-runtime'
    | 'editor-runtime'
    | 'unknown';
  id?: string;
  range: SourceRange;
  openTagRange?: SourceRange;
  contentRange?: SourceRange;
  attributes?: Record<string, string>;
}
```

### 6.3 Scanner behavior

The scanner should:

1. identify the source form from content and filename;
2. reject unsupported encodings or normalize a UTF-8 BOM;
3. locate the manifest before parsing slide bodies;
4. inventory slide, library, theme, and runtime blocks;
5. detect duplicate top-level identifiers;
6. verify strict physical order when requested;
7. avoid executing scripts or loading dependencies; and
8. return useful diagnostics even when later sections are malformed.

The scanner may use a tokenizer rather than constructing a complete browser DOM.
This supports streaming, stable offsets, and cheap control-plane reads.

## 7. Source ranges and indexing

### 7.1 Offset policy

The implementation should retain both UTF-8 byte offsets and JavaScript string
offsets when practical:

```ts
export interface SourceRange {
  byteStart: number;
  byteEnd: number;
  charStart: number;
  charEnd: number;
  lineStart?: number;
  columnStart?: number;
  lineEnd?: number;
  columnEnd?: number;
}
```

Byte ranges make hashing and external tooling precise. Character ranges make
JavaScript editing efficient. A contract must define behavior for malformed
UTF-8 and newline normalization before implementation is declared conforming.

### 7.2 Source index

```ts
export interface PptvSourceIndex {
  sourceSha256: string;
  manifest: SourceRange;
  manifestFields: Map<string, SourceRange>;
  slides: Map<string, IndexedSlide>;
  objects: Map<string, IndexedObject>;
  themes: Map<string, IndexedTheme>;
  libraries: Map<string, IndexedLibrary>;
  runtimes: PptvSectionRef[];
}
```

Each indexed object records the smallest safe replacement ranges for:

- the complete element;
- its opening tag;
- individual attributes when recoverable;
- direct text content;
- inline style;
- and its parent child-list insertion points.

### 7.3 Index guarantees

- Every stable ID resolves to at most one canonical object.
- A duplicate ID is a validation error and is never resolved by last-write-wins.
- Index ranges are valid only for the source hash that produced them.
- Applying a source edit invalidates intersecting ranges and shifts later ranges.
- The patch engine must update or rebuild the index before another transaction.

## 8. Manifest API

```ts
export interface PptvManifest {
  pptv: string;
  title?: string;
  runtime?: string;
  editor?: string;
  theme?: string;
  themes?: string[];
  slides: Array<string | PptvManifestSlide>;
  agentProfile?: string;
  extensions?: Record<string, unknown>;
}

export interface PptvManifestSlide {
  id: string;
  layout?: string;
  hidden?: boolean;
  namespace?: string;
  src?: string;
}
```

### 8.1 Manifest functions

```ts
export function parseManifest(scan: PptvScan): PptvManifest;
export function validateManifest(
  manifest: PptvManifest,
  scan: PptvScan
): Diagnostic[];
export function setActiveTheme(
  deck: PptvDeck,
  themeId: string
): PptvPatch;
export function reorderSlides(
  deck: PptvDeck,
  order: string[]
): PptvPatch;
```

The slide array is the sole canonical slide order. A source template that is
present but not referenced may be reported as unused rather than silently added.

## 9. Semantic model

### 9.1 Deck and slide

```ts
export interface PptvDeck {
  version: string;
  sourceKind: 'svg' | 'html' | 'manifest';
  title?: string;
  activeTheme?: string;
  slideOrder: string[];
  slides: Map<string, PptvSlide>;
  themes: Map<string, PptvTheme>;
  libraries: Map<string, PptvLibrary>;
  dependencies: Map<string, PptvDependency>;
  source: PptvSourceIndex;
  diagnostics: Diagnostic[];
}

export interface PptvSlide {
  id: string;
  layout?: string;
  hidden: boolean;
  viewBox: [number, number, number, number];
  physicalSize?: PptvPhysicalSize;
  children: PptvNode[];
  sourceRange: SourceRange;
}
```

### 9.2 Nodes

```ts
export type PptvNode =
  | PptvShapeNode
  | PptvTextNode
  | PptvConnectorNode
  | PptvGroupNode
  | PptvAssetNode;

export interface PptvNodeBase {
  id: string;
  role: 'shape' | 'text' | 'connector' | 'group' | 'asset';
  export: 'native' | 'svg' | 'raster' | 'ignore';
  elementName: string;
  classes: string[];
  attributes: Record<string, string>;
  transform?: PptvTransform;
  parentId: string | null;
  children: PptvNode[];
  sourceRange: SourceRange;
  styleSources?: PptvStyleSource[];
}
```

Specialized types should expose supported geometry without discarding the
original attributes.

### 9.3 Text

A text node retains:

- direct text and constrained `tspan` structure;
- paragraph and run boundaries where declared;
- whitespace behavior;
- source ranges for editable runs;
- semantic placeholder binding; and
- source and computed typography separately.

The semantic view may collapse this to plain text. The editing and resolved
views retain runs and provenance.

### 9.4 Connectors

```ts
export interface PptvConnectorNode extends PptvNodeBase {
  role: 'connector';
  from?: PptvEndpointRef;
  to?: PptvEndpointRef;
  routing?: 'straight' | 'elbow' | 'polyline';
  markerStart?: string;
  markerEnd?: string;
}
```

Endpoint references are semantic relationships. Geometry remains explicit and
must not be silently recomputed unless an operation or layout policy requests it.

## 10. CSS and theme processing

### 10.1 Style levels

The CSS processor exposes three levels:

```text
source     matching declarations and custom-property expressions
binding    recognized component or PPTV theme-token references
computed   final supported property values for a specific element
```

### 10.2 Style provenance

```ts
export interface PptvResolvedProperty<T = string> {
  property: string;
  computed: T;
  expression?: string;
  customProperty?: string;
  themeToken?: string;
  ruleId?: string;
  selector?: string;
  origin:
    | 'presentation-attribute'
    | 'inline-style'
    | 'theme-rule'
    | 'component-rule'
    | 'inherited'
    | 'default';
  sourceRange?: SourceRange;
}
```

A local color that computes to the same RGB value as a theme token is not
implicitly converted into that token. Binding follows source intent, not color
coincidence.

### 10.3 CSS API

```ts
export function parseTheme(
  deck: PptvDeck,
  themeId: string
): PptvTheme;

export function resolveObjectStyle(
  deck: PptvDeck,
  objectId: string,
  options?: ResolveStyleOptions
): PptvResolvedStyle;

export function traceStyleProperty(
  deck: PptvDeck,
  objectId: string,
  property: string
): PptvResolvedProperty;
```

Unsupported selectors or properties generate diagnostics. They must not vanish
silently from a normalized build.

## 11. Lazy loading and selection

```ts
export interface LoadDeckOptions {
  level?: PptvLoadLevel;
  slides?: string[];
  objectIds?: string[];
  theme?: string;
  strict?: boolean;
  resolver?: DependencyResolver;
}

export function loadDeck(
  input: PptvInput,
  options?: LoadDeckOptions
): Promise<PptvDeck>;
```

Examples:

```ts
await loadDeck(input, { level: 'manifest' });
await loadDeck(input, { level: 'semantic', slides: ['architecture'] });
await loadDeck(input, { level: 'editing', objectIds: ['node.authorization'] });
```

A selected-object load may parse its ancestors and referenced relationships but
should not materialize unrelated slides.

## 12. Projections and queries

### 12.1 Views

```ts
export type ProjectionView =
  | 'outline'
  | 'semantic'
  | 'editing'
  | 'resolved';
```

- **Outline:** deck metadata, ordered slides, stable IDs, roles, short text, and
  relationship summaries.
- **Semantic:** meaningful hierarchy, text, object kinds, placeholders, and
  connectors without detailed paint or paths.
- **Editing:** geometry, classes, run structure, token references, source owners,
  children, and connection endpoints.
- **Resolved:** computed CSS, flattened transforms, resolved fonts and assets,
  normalized geometry, and source fragments.

### 12.2 Query API

```ts
export interface PptvQuery {
  slideId?: string;
  ids?: string[];
  role?: PptvNode['role'];
  className?: string;
  elementName?: string;
  textContains?: string;
  connectedTo?: string;
  descendantOf?: string;
}

export function outlineDeck(deck: PptvDeck): DeckOutline;
export function getSlide(
  deck: PptvDeck,
  slideId: string,
  view?: ProjectionView
): SlideProjection;
export function getObject(
  deck: PptvDeck,
  objectId: string,
  view?: ProjectionView
): ObjectProjection;
export function queryObjects(
  deck: PptvDeck,
  query: PptvQuery,
  view?: ProjectionView
): ObjectProjection[];
export function extractText(
  deck: PptvDeck,
  options?: { slideId?: string; includeHidden?: boolean }
): TextProjection;
```

Results preserve manifest and DOM order unless a caller explicitly requests a
different sort for presentation.

## 13. Semantic patch format

### 13.1 Envelope

```ts
export interface PptvPatch {
  schema: 'pptv-patch/0.1';
  baseSha256: string;
  transactionId?: string;
  author?: string;
  timestamp?: string;
  ops: PptvOperation[];
}
```

`baseSha256` is mandatory for source-changing operations unless the caller opts
into an explicit unsafe mode.

### 13.2 Operation preconditions

Every operation may include:

```ts
export interface OperationPrecondition {
  exists?: boolean;
  parentId?: string | null;
  oldValue?: unknown;
  oldText?: string;
  oldIndex?: number;
  oldClasses?: string[];
}
```

Preconditions allow a patch to fail cleanly when another human or agent changed
the source after the patch was prepared.

### 13.3 Initial operation vocabulary

```text
set-text
set-attribute
remove-attribute
set-inline-style
set-class-list
add-class
remove-class
set-token
set-theme-rule
move
resize
rotate
reorder
move-before
move-after
delete
duplicate
add-shape
add-text
add-connector
group
ungroup
set-slide-order
set-active-theme
```

### 13.4 Representative operations

```json
{
  "op": "set-text",
  "id": "architecture.node.authorization.title",
  "oldText": "Authorization service",
  "value": "Policy and authorization"
}
```

```json
{
  "op": "move-after",
  "id": "architecture.node.authorization",
  "after": "architecture.node.identity",
  "parentId": "architecture.layer.nodes"
}
```

```json
{
  "op": "set-token",
  "theme": "dapple.light",
  "name": "--pptv-scheme-accent-1",
  "oldValue": "#6f5cff",
  "value": "#7257ff"
}
```

```json
{
  "op": "add-connector",
  "parentId": "architecture.layer.connectors",
  "id": "architecture.edge.client.authorization",
  "from": "architecture.node.client",
  "to": "architecture.node.authorization",
  "routing": "straight",
  "classes": ["edge", "edge--encrypted"]
}
```

### 13.5 Transaction behavior

```ts
export function validatePatch(
  deck: PptvDeck,
  patch: PptvPatch
): Diagnostic[];

export function applyPatch(
  deck: PptvDeck,
  patch: PptvPatch,
  options?: ApplyPatchOptions
): PatchResult;
```

Application order:

1. verify patch schema and source hash;
2. resolve every referenced stable ID;
3. validate all preconditions;
4. simulate hierarchy, identity, and ordering effects;
5. reject the complete transaction if any operation is invalid;
6. apply source edits from later offsets to earlier offsets;
7. rebuild affected index regions;
8. reparse affected semantic nodes;
9. rerun profile validation on affected scopes; and
10. return new source text, hash, diagnostics, and affected IDs.

No operation in a failed transaction is committed.

### 13.6 Layout-aware operations

The first core should avoid hidden automatic layout. `move`, `resize`, and
connector geometry changes are explicit.

A future layout engine may offer separate commands that generate an ordinary
reviewable patch:

```ts
const patch = autoLayout(deck, {
  slideId: 'architecture',
  algorithm: 'layered',
  preserveLocked: true
});
```

The layout result is not special state; it is a patch the caller may inspect and
apply.

## 14. Serialization

### 14.1 Two modes

```ts
export type SerializeMode = 'preserve' | 'canonical';
```

**Preserve mode** changes the smallest safe source ranges and retains unrelated
formatting.

**Canonical mode** emits normalized formatting suitable for fixtures, generated
sources, or major structural rewrites.

### 14.2 Preserve-mode rules

- A text replacement edits only the text range when possible.
- An attribute update edits or inserts only the opening tag.
- A manifest reorder edits only the `slides` value.
- A token update edits only the declaration value.
- A within-parent reorder moves complete source element ranges.
- Unchanged runtime and inactive theme blocks remain byte-identical.
- Structural edits may reformat only the smallest affected parent scope.

### 14.3 Canonical-mode rules

Canonical serialization must eventually define:

- newline convention;
- indentation;
- attribute ordering;
- JSON formatting;
- CSS formatting;
- quote style;
- empty-element handling;
- numeric normalization and precision;
- color normalization;
- and stable ordering of generated declarations.

The first implementation may delay a final canonical style, but tests must never
pretend unspecified formatting is normative.

### 14.4 Save API

```ts
export function serializeDeck(
  deck: PptvDeck,
  options?: { mode?: SerializeMode; includeViewer?: boolean; includeEditor?: boolean }
): string;

export async function writeDeck(
  deck: PptvDeck,
  destination: PptvDestination,
  options?: WriteOptions
): Promise<WriteResult>;
```

Browser destinations may use the File System Access API or return a downloadable
Blob. Node destinations may write atomically through a temporary peer file and
rename.

## 15. Normalization

```ts
export interface NormalizeOptions {
  expandUse?: boolean;
  flattenTransforms?: boolean;
  embedLocalCss?: boolean;
  embedAssets?: boolean;
  qualifyIds?: boolean;
  preserveThemeBindings?: boolean;
}

export function normalizeDeck(
  deck: PptvDeck,
  options?: NormalizeOptions
): Promise<NormalizedPptvDeck>;
```

Normalization:

- resolves selected themes;
- expands supported `use` references;
- qualifies imported IDs;
- flattens supported transforms;
- resolves local dependencies;
- records hashes;
- retains source token bindings;
- validates native/asset boundaries; and
- produces deterministic target-independent compiler input.

Normalization must not silently convert a requested native object to raster.

## 16. Browser viewer API

The browser viewer should be a very small client of the manifest and rendering
functions:

```ts
export interface MountDeckOptions {
  target: HTMLElement;
  initialSlide?: string;
  theme?: string;
  printMode?: boolean;
}

export function mountDeck(
  sourceDocument: Document,
  options: MountDeckOptions
): PptvViewer;
```

The viewer may expose navigation and inspection events but cannot mutate
canonical source declarations.

A validator should recognize the viewer runtime by version and optional digest.
A compiler ignores it.

## 17. Native editor contract

The native editor uses the same semantic operation layer:

```text
pointer/keyboard action
  -> editor intent
  -> PptvOperation or PptvPatch
  -> validate and apply transaction
  -> update semantic tree and source index
  -> patch or remount affected SVG DOM
```

The editor may provide live transforms during drag, but commit produces an
ordinary semantic operation. On cancellation, the visual transform is discarded.

Undo and redo store inverse or replayable semantic patches, not arbitrary DOM
snapshots.

## 18. Caching and invalidation

### 18.1 Cache key

Derived artifacts are keyed by:

```text
source SHA-256
PPTV profile version
processor version
selected theme
load level
relevant dependency hashes
font environment fingerprint when measurement is involved
```

### 18.2 Suggested cache entries

```text
scan.json
source-index.json
manifest.json
outline.json
semantic/<slide-id>.json
resolved/<slide-id>-<theme>.json
dependencies.json
thumbnails/<slide-id>.png
```

Caches are disposable and never canonical.

### 18.3 Invalidation

- Manifest-only edits invalidate deck order and viewer output but not untouched
  slide semantic caches.
- A theme token edit invalidates resolved styles and renders for consumers of the
  theme, but not source semantic structure.
- A local text edit invalidates the selected text node, its containing layout,
  and visual output; unrelated slides remain valid.
- A library edit invalidates only slides that reference the library.
- A font-environment change invalidates measurement and rendering caches, not the
  semantic tree.

The dependency graph should make these relationships explicit.

## 19. Diagnostics

```ts
export interface Diagnostic {
  code: string;
  severity: 'info' | 'warning' | 'error' | 'fatal';
  message: string;
  range?: SourceRange;
  slideId?: string;
  objectId?: string;
  related?: DiagnosticRelated[];
  suggestion?: PptvPatch;
}
```

### 19.1 Initial code families

```text
PPTV-SCAN-*       malformed container or source-order problem
PPTV-MANIFEST-*   invalid control-plane data or references
PPTV-ID-*         missing, duplicate, or invalid stable identity
PPTV-SVG-*        unsupported SVG or geometry
PPTV-CSS-*        unsupported selector/property or unresolved token
PPTV-ASSET-*      missing, unsafe, or changed dependency
PPTV-ORDER-*      invalid slide, child, or group ordering operation
PPTV-PATCH-*      stale hash, failed precondition, or invalid transaction
PPTV-RUNTIME-*    unknown, misplaced, or modified executable runtime
PPTV-PPTX-*       target mapping or reconciliation issue
PPTV-SECURITY-*   script, event, traversal, remote fetch, or resource-limit issue
```

Diagnostics should name the nearest valid opaque asset boundary when unsupported
SVG could be preserved as one asset.

## 20. Security and resource limits

The core must:

- use hardened HTML/XML parsing;
- reject DTD/entity expansion where applicable;
- never execute source scripts;
- ignore viewer/editor runtime code during semantic parsing;
- reject event-handler attributes;
- reject path traversal and unsupported URL schemes;
- disable remote fetch by default;
- cap source, asset, decompressed package, element, and recursion sizes;
- detect dependency cycles;
- treat embedded comments as untrusted content;
- verify runtime and editor digests when strict mode requires them; and
- make network and filesystem capabilities explicit injected permissions.

## 21. CLI contract

```text
pptv outline <file> [--format text|json]
pptv show <file> <id> [--view semantic|editing|resolved]
pptv list <file> [--slide ID] [--role ROLE] [--class CLASS]
pptv text <file> [--slide ID] [--format text|jsonl]
pptv theme <file> [--active] [--tokens] [--trace OBJECT PROPERTY]
pptv patch <file> <patch.json> [--check] [--output PATH]
pptv validate <file> [--strict] [--format text|json]
pptv normalize <file> [--output PATH]
pptv render <file> [--slide ID] [--output PATH]
pptv build-pptx <file> [--template PATH] [--output PATH]
pptv inspect-pptx <file.pptx> [--baseline MAP]
pptv reconcile <file.pptx> --source <file.pptv.html> --baseline <map.json>
pptv agent-guide [--profile pptv-agent/1]
```

Exit behavior:

```text
0 success
1 validation or patch failure
2 invocation error
3 dependency or environment failure
4 internal invariant failure
```

Machine output must be stable and versioned. Human text output may evolve without
breaking integrations.

## 22. OpenDocKit adapter boundary

The core PPTV packages do not import a general PPTX renderer or editor.

A narrow adapter may consume:

- font metrics and font resolution;
- matrix and geometry helpers;
- SVG interaction primitives;
- serializable edit-delta patterns;
- OPC package and relationship writing;
- DrawingML theme and color support;
- master, layout, and placeholder semantics;
- structural PPTX inspection; and
- Office-ground-truth visual regression infrastructure.

The direction remains:

```text
PPTV semantic tree -> adapter-specific IR -> PPTX
edited PPTX -> OpenDocKit inspection -> PPTV semantic patch report
```

OpenDocKit's arbitrary-PPTX IR does not become the canonical native PPTV model.

## 23. Performance design targets

These are engineering targets, not current measured claims:

- `outline` should read the leading manifest and shallow section index without
  resolving CSS or assets.
- retrieving one object should avoid parsing unrelated slides.
- applying a text or manifest-order patch should avoid whole-file serialization.
- ordinary semantic projections should exclude path data, runtime code, inactive
  themes, and computed styles.
- resolved style and render work should be cacheable per slide and theme.
- a native editor operation should update only affected semantic and DOM scopes.

Benchmarks should report bytes read, source regions parsed, objects materialized,
and tokens emitted in addition to wall-clock time.

## 24. Test and conformance obligations

### 24.1 Fixture classes

```text
minimal standalone SVG
minimal single-file HTML deck
multiple themes
manifest reorder
unused slide template
reusable symbol expansion
nested groups and z-order
editable text runs
connectors and endpoint references
opaque SVG asset boundary
local raster asset
invalid duplicate IDs
invalid physical source order
unknown runtime
forbidden event handler
stale patch hash
failed operation precondition
mixed valid/invalid transaction
canonical serialization fixture
preserve-mode surgical edit fixture
```

### 24.2 Required test layers

1. scanner and source-range tests;
2. manifest schema tests;
3. semantic model tests;
4. CSS provenance tests;
5. projection golden tests;
6. patch validation and atomicity tests;
7. preserve-mode byte-diff tests;
8. canonical serialization golden tests;
9. viewer browser tests;
10. editor interaction tests;
11. normalization tests;
12. PPTX package and stable-ID tests;
13. rendered visual comparison; and
14. desktop PowerPoint open-without-repair smoke tests.

### 24.3 Agent-efficiency tests

The suite should include explicit budgets for common tasks:

- retrieve slide order;
- retrieve all visible text;
- inspect one object;
- rename one label;
- reorder two slides;
- change one theme token; and
- add one connector.

Tests should verify that those operations do not unnecessarily include or parse
unrelated CSS, paths, assets, runtime code, or slides.

## 25. Implementation sequence

### Phase A — contracts and fixtures

- publish schemas for manifest, projections, patches, and diagnostics;
- define offset and canonical formatting policies;
- create minimal and kitchen-sink fixtures;
- define invalid fixtures and exact diagnostic codes.

### Phase B — scanner and semantic read path

- implement source scan and source index;
- parse manifest and selected slides;
- expose outline, text, semantic, and editing projections;
- implement stable-ID queries.

### Phase C — semantic write path

- implement transactional text, attribute, class, token, and slide-order patches;
- implement preserve serialization;
- add canonical serialization and normalization.

### Phase D — viewer and editor

- generate or verify the tiny viewer runtime;
- build the purpose-specific SVG editor on the patch engine;
- add save/download and optional `.editable.pptv.html` generation.

### Phase E — PowerPoint adapter

- compile native text and simple geometry;
- preserve theme bindings;
- synthesize masters, layouts, and placeholders;
- inspect and reconcile edited PPTX using stable IDs and baselines.

## 26. Design conclusion

The processing API should make PPTV feel less like editing XML and more like
editing a small, typed presentation graph whose source happens to remain ordinary
web technology.

The decisive implementation rule is:

> Parse only what the operation requires, preserve the source ranges and style
> intent that produced it, and express every meaningful change as a stable-ID,
> reviewable, atomic semantic patch.
