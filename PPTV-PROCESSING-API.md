# PPTV Processing API and Semantic Operations

**Status:** 0.1 source/patch/resolved/editor-foundation APIs plus strict C7
PowerPoint canary implemented; broader editing/normalization/reconciliation remain roadmap
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

### Normative 0.1 boundary

The executable behavior is the single `@office180/pptv` package, C4 through C8,
the published schemas, and their tests. It currently provides:

- `scanPptvSource`, `parseManifest`, `validateManifest`, `loadDeck`, and
  `validateDeck`;
- immutable, exact-source-hash-bound deck/index snapshots;
- outline, inventory, text, semantic, editing, and query projections;
- asynchronous `validatePatch` and `applyPatch`; and
- only `set-text`, `set-active-theme`, and `set-slide-order`;
- pure C6 fixed-canvas constrained-CSS/geometry/group/hard-line resolution;
- exact-source editor sessions plus deterministic strict-CSP editor packs with a
  literal-data viewport;
- the Node-only deterministic C7 strict-subset PPTX compiler/graph validator;
  and
- pure C8 text-fit evidence plus the Node-only explicit exact-font adapter.

Interfaces in this document that exceed the narrow C6 resolver, editor
foundation, C7 canary, or C8 preflight—rich editing, libraries, dependencies,
canonical serialization, broader rendering/PPTX, or reconciliation—remain
roadmap unless explicitly identified as implemented 0.1.

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
6. **Source intent is preserved when interpreted.** The 0.1 kernel retains exact
   source, attributes, classes, hierarchy, and safe ranges. C6 style resolution
   additionally retains whether a property came from an attribute, inline
   style, CSS rule, custom property, or theme token.
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

The exact declarative source bytes are persistent authority. The hierarchical
PPTV semantic tree is an immutable interpretation bound to their SHA-256. It
must be reconstructed after a write and cannot out-authorize the source.

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

The portable 0.1 core accepts bytes or text without assuming a filesystem:

```ts
export type PptvInput =
  | { kind: 'text'; text: string; name?: string }
  | { kind: 'bytes'; bytes: Uint8Array; name?: string };
```

The Node CLI is a separate host layer that reads exact file bytes. Browser
`File` adapters and dependency resolvers are roadmap host interfaces rather
than core input variants.

Future multi-resource dependency resolution should be injected:

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

The implemented loader has one materialization level:

```ts
materialization.level: 'semantic'
```

`slides` can restrict semantic materialization. “Editing” is a projection view
that exposes already-retained attributes/classes/ranges; it is not a second
load mode. `scan` and manifest-only reads are separate functions, not
`loadDeck` levels.

The fuller roadmap remains:

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

### 5.1 Roadmap work matrix

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
  maxSourceBytes?: number;
  maxElements?: number;
  maxDepth?: number;
}

export function scanPptvSource(
  input: PptvInput,
  options?: ScanOptions
): Promise<PptvScan>;
```

### 6.2 Scan result

```ts
export interface PptvScan {
  kind: 'svg' | 'html' | 'manifest' | 'unknown';
  encoding: 'utf-8';
  source: PptvSourceDocument;
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
  attributes: Record<string, string>;
}
```

### 6.3 Scanner behavior

The 0.1 scanner:

1. identify the source form from content and filename;
2. reject malformed byte input as UTF-8, retain a leading BOM as U+FEFF, and
   reject unpaired surrogates in text input;
3. locate the manifest before parsing slide bodies;
4. inventory slide, library, theme, and runtime blocks;
5. detect duplicate top-level identifiers;
6. verify strict physical order when requested;
7. avoid executing scripts or loading dependencies; and
8. return useful diagnostics even when later sections are malformed.

The 0.1 scanner uses `parse5` with source locations and scripting disabled. It
does construct a non-executing parse tree and traverses the whole source to
enforce security/resource limits and verify the viewer-runtime digest. Outline
avoids semantic slide loading, CSS resolution, library expansion, asset work,
and runtime execution; 0.1 does not claim streaming early-stop behavior.

## 7. Source ranges and indexing

### 7.1 Offset policy

The implementation retains both UTF-8 byte offsets and JavaScript string
offsets:

```ts
export interface SourceRange {
  byteStart: number;
  byteEnd: number;
  charStart: number;
  charEnd: number;
  lineStart: number;
  columnStart: number;
  lineEnd: number;
  columnEnd: number;
}
```

All ranges are zero-based and half-open. Bytes address the exact retained UTF-8
input; characters address UTF-16 code units in the exact retained JavaScript
string. Lines and columns are one-based. A leading BOM and CRLF/LF spelling are
retained, included in the hash, and preserved by edits. Malformed UTF-8,
unpaired text-input surrogates, and range boundaries that split a surrogate
pair are rejected. C4 makes these rules normative.

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

Each 0.1 indexed object records:

- the complete element;
- its opening tag;
- individual attributes when recoverable;
- direct text content;
- individual attribute values when recoverable; and
- direct text content when it is safe to replace.

Inline-style token ranges and parent child-list insertion points are roadmap.

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
export function parseManifest(scan: PptvScan): ManifestParseResult;
export function validateManifest(
  manifest: PptvManifest,
  scan: PptvScan
): Diagnostic[];
```

The slide array is the sole canonical slide order. A source template that is
present but not referenced may be reported as unused rather than silently
added. `ManifestParseResult` contains the optional manifest, indexed ranges,
and diagnostics. Theme selection and slide reordering are C5 patch operations,
not manifest mutation helper functions.

The 0.1 manifest requires `pptv: "0.1"` and strict JSON (no comments, trailing
commas, or duplicate keys). Self-contained HTML also requires
`data-pptv-version` to match the manifest version and requires referenced
slides, active theme, and viewer runtime to exist exactly once. Title,
agent-profile, SVG-layout, and `themes`-list mirror/authority rules remain
unresolved; external slide `src`/`namespace` forms are recognized but rejected
as unsupported. The optional manifest `editor` field must resolve to a matching
editor-runtime declaration, but 0.1 registers no trusted editor artifact, so an
executable editor profile is not currently usable.

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
  children: PptvNode[];
  sourceRange: SourceRange;
}
```

The displayed shape is conceptual. The 0.1 deck additionally retains its exact
`PptvSourceDocument`, full source index, manifest, diagnostics, and
materialization record. It does not implement dependencies or physical slide
size. `viewBox` is required and must have positive dimensions.

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

Implemented 0.1 text nodes expose decoded, concatenated plain text with
whitespace preserved and a direct-text replacement range when safe. Nested
`tspan` text may be read in flattened form but is not safely editable and does
not retain per-run style/provenance.

The roadmap text model should retain:

- direct text and constrained `tspan` structure;
- paragraph and run boundaries where declared;
- whitespace behavior;
- source ranges for editable runs;
- semantic placeholder binding; and
- source and computed typography separately.

The semantic view may collapse this to plain text. The editing and resolved
views retain runs and provenance.

### 9.4 Connectors (roadmap semantics)

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
The 0.1 kernel recognizes `line`/`polyline` connector roles and retains raw
attributes, but does not validate endpoints or expose a specialized connector
model.

## 10. CSS and theme processing (roadmap)

No CSS parser, cascade, style provenance, theme inheritance, or token operation
exists in 0.1. Theme blocks are inert indexed text and `set-active-theme` only
changes which already-declared theme ID the manifest selects.

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
  slides?: string[];
  strictOrder?: boolean;
  maxSourceBytes?: number;
  maxElements?: number;
  maxDepth?: number;
}

export function loadDeck(
  input: PptvInput,
  options?: LoadDeckOptions
): Promise<PptvDeck>;
```

Examples:

```ts
await loadDeck(input, { slides: ['architecture'] });
await loadDeck(input);
```

Selected-slide loading does not materialize unrelated slides. Object-selected
loading, dependency resolvers, and theme overrides are roadmap. The current
`strictOrder` option is the operative strictness configuration and defaults to
true.

## 12. Projections and queries

### 12.1 Views

```ts
export type ProjectionView = 'semantic' | 'editing';
```

- **Outline:** a separate `outlineManifest()` projection with deck metadata and
  ordered slides.
- **Semantic:** meaningful hierarchy, text, object kinds, placeholders, and
  connector roles without raw attributes/classes/ranges.
- **Editing:** the same hierarchy plus raw attributes, classes, source ranges,
  and slide `viewBox`.

Inventory and extracted-text projections are also implemented. A resolved view,
placeholders, relationship summaries, computed styles, token bindings, and
normalized geometry are roadmap.

### 12.2 Query API

```ts
export interface PptvQuery {
  slideId?: string;
  ids?: string[];
  role?: PptvNode['role'];
  className?: string;
  elementName?: string;
  textContains?: string;
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

`textContains` is case-insensitive in 0.1. Results are JSON-safe records and
arrays; callers should not serialize the Map-rich in-process deck directly.

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

`baseSha256` is mandatory and hashes the exact retained UTF-8 source bytes,
including a leading BOM. There is no unsafe hash bypass in the library or
reference CLI.

### 13.2 Operation preconditions

The 0.1 operations have only these operation-specific preconditions:

```ts
set-text:         oldText?: string
set-active-theme: oldTheme?: string
set-slide-order:  oldOrder?: string[]
```

Preconditions allow a patch to fail cleanly when another human or agent changed
the source after the patch was prepared.

### 13.3 Implemented 0.1 operation vocabulary

```text
set-text
set-slide-order
set-active-theme
```

`set-text` is limited to a native, non-opaque text object with one safe direct
text range. It compares `oldText` with decoded semantic text while preserving
whitespace, rejects XML control characters, and escapes `&`, `<`, and `>`.

`set-active-theme` selects an existing indexed theme, optionally checks
`oldTheme`, and replaces an existing manifest `theme` value. It does not add
the field or edit CSS.

`set-slide-order` optionally checks `oldOrder`, requires an exact permutation
of current slide IDs, and reorders complete original manifest entries so
object-form layout/hidden metadata is preserved.

Attribute/class/token/geometry/structure/connector operations are roadmap and
must not be sent to 0.1.

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
  "op": "set-active-theme",
  "oldTheme": "dapple.light",
  "theme": "dapple.dark"
}
```

```json
{
  "op": "set-slide-order",
  "oldOrder": ["cover", "architecture"],
  "order": ["architecture", "cover"]
}
```

### 13.5 Transaction behavior

```ts
export function validatePatch(
  deck: PptvDeck,
  patch: unknown
): Promise<Diagnostic[]>;

export function applyPatch(
  deck: PptvDeck,
  patch: unknown
): Promise<PatchResult>;
```

Both functions accept `unknown` because runtime schema validation is part of the
contract. Both are asynchronous because they reconstruct a fresh trusted deck
from `deck.source.text` and verify its retained hash before trusting any index
or range.

Validation/application order:

1. reconstruct and verify a complete trusted base snapshot;
2. validate envelope/schema, source hash, every operation, target, and
   precondition;
3. plan the complete set of source replacements and reject intersecting ranges,
   including competing zero-width insertions;
4. reject the complete transaction if any operation is invalid;
5. for `applyPatch`, apply replacements from later UTF-16 offsets to earlier
   offsets;
6. rescan and semantically reload the complete candidate; and
7. return new source text, exact-byte hash, validated deck, edits, and affected
   IDs only on success.

`validatePatch()` stops after validating the complete plan; it does not build
or reload a candidate. No operation in a failed transaction is committed, and
failure exposes no replacement source/deck/edit list/affected IDs.

### 13.6 Layout-aware operations (roadmap)

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

The only implemented serialization is C5 preserve-mode source replacement
inside `applyPatch()`. There is no general `serializeDeck()`, canonical mode,
or browser writer in 0.1.

### 14.1 Roadmap modes

```ts
export type SerializeMode = 'preserve' | 'canonical';
```

The implemented preserve path changes the smallest supported safe source range
and retains unrelated bytes.

**Canonical mode** emits normalized formatting suitable for fixtures, generated
sources, or major structural rewrites.

### 14.2 Preserve-mode rules

- A text replacement edits only the text range when possible.
- A manifest reorder edits only the `slides` value.
- An active-theme edit changes only the manifest `theme` string value.
- Unchanged runtime and inactive theme blocks remain byte-identical.
- A leading BOM and unchanged newline spelling remain byte-identical.

Attribute, token, and structural replacement rules are roadmap.

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

### 14.4 Roadmap save API

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

These library APIs are not implemented. The Node CLI requires exactly one of
`--check` or an explicit `--output`. The output host writes UTF-8 through a
temporary peer, fsyncs, and atomically renames; the library itself never writes.

## 15. Normalization (roadmap)

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

## 16. Browser viewer API (roadmap)

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

The 0.1 validator recognizes only the installed `pptv-browser/0.1` runtime by
version and required content digest, while semantic loading ignores its
behavior. The C7 compiler consumes only C6 declarative resolved data and
therefore also ignores viewer behavior.

Opening an untrusted deck directly in a browser executes its embedded script
before library validation. Direct-open is trusted-source-only; untrusted source
must be validated first and rendered behind a sandbox/CSP boundary.

## 17. Native editor contract (roadmap)

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

## 18. Caching and invalidation (roadmap)

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

The 0.1 self-contained-source core:

- use hardened HTML/XML parsing;
- never execute source scripts;
- ignore viewer/editor runtime code during semantic parsing;
- reject event-handler attributes;
- reject path traversal, remote/absolute URLs, executable schemes, CSS imports,
  unsafe CSS resource URLs, and unsupported embed elements;
- perform no dependency fetch;
- cap source bytes, element count, and nesting depth;
- treat embedded comments as untrusted content;
- require the registered viewer-runtime digest; and
- isolate filesystem reads/writes in the Node host.

DTD/entity controls for standalone XML, asset/package expansion limits,
dependency-cycle handling, editor-runtime registration, and injected
filesystem/network capabilities are roadmap.

## 21. CLI contract

Implemented 0.1 commands:

```text
pptv outline <file> [--format text|json]
pptv validate <file> [--format text|json]
pptv resolve <file> [--format text|json]
pptv editor-pack <file> --output PATH [--format text|json]
pptv pptx-canary <file> --output PATH [--format text|json]
pptv text-fit <file> --font-map PATH [--near-limit N] [--format text|json]
pptv text <file> [--slide ID] [--include-hidden] [--format text|json|jsonl]
pptv show <file> <id> [--view semantic|editing] [--format json]
pptv list <file> [--slide ID] [--role ROLE] [--class CLASS]
          [--text TEXT] [--view semantic|editing] [--format text|json|jsonl]
pptv patch <file> <patch.json> (--check | --output PATH)
           [--format text|json]
```

Roadmap commands:

```text
pptv theme <file> [--active] [--tokens] [--trace OBJECT PROPERTY]
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
1 validation, resolution, text overflow/unverified evidence, patch, or compiler
  capability failure
2 invocation error
3 dependency or environment failure
```

Machine output must be stable and versioned. Human text output may evolve without
breaking integrations.

## 22. OpenDocKit adapter boundary

The single `@office180/pptv` package has no OpenDocKit runtime dependency.
OpenDocKit was reviewed at clean commit `e4bd919` and its public OPC/PPTX parser
is already used out-of-process as an independent C7 reopen oracle. A future
runtime adapter must remain optional so browser/source editing does not import
a general PPTX renderer or editor.

A narrow adapter can consume public, bounded surfaces such as:

- a future stable font-metrics package that exposes selected face/style,
  missing codepoints, substitution confidence, width bounds, and bundle
  identity;
- `@opendockit/core/opc` package-reader, part, and relationship APIs;
- selected XML, DrawingML theme/color, unit, and geometry utilities;
- font metrics and font resolution once their boundary is stable;
- `@opendockit/elements` spatial/PageModel helpers as a derived interaction
  projection;
- master, layout, and placeholder semantics;
- structural PPTX inspection; and
- Office-ground-truth visual regression infrastructure.

The direction remains:

```text
PPTV semantic tree -> adapter-specific IR -> PPTX
edited PPTX -> OpenDocKit inspection -> PPTV semantic patch report
```

OpenDocKit's arbitrary-PPTX IR does not become the canonical native PPTV model.

The current private editor/PPTX write paths are blocked from direct reuse:

- SVG selection and hidden-input components are application-internal and
  cross-import private editor modules;
- rich-text reconstitution does not preserve per-run properties and the editor
  save path is lossy for rich text;
- fresh-presentation synthesis/package building is incomplete and requires
  OOXML correctness work plus real DOM/save tests;
- OpenDocKit's own mandatory feature-test rigor gate is not yet satisfied; and
- the `@opendockit/pptx` dependency chain includes conflicting license metadata
  in `pdf-signer`, which must be resolved before adoption.

Useful contribution-back targets are a tested public SVG interaction package,
per-run text-save fidelity, a fresh `PptxPackageBuilder`, shared
hash/precondition transaction patterns, and fixtures usable by both projects.
The C7 reopen also exposed a concrete identity gap: OpenDocKit's `GroupIR` and
`ConnectorIR` parsers currently drop `p:cNvPr` ID/name metadata; preserving it
would directly support stable-name live editing and reconciliation.

## 23. Performance design targets

These are engineering targets, not current measured claims:

- `outline` currently scans the full non-executing container and parses the
  manifest without semantically loading slide bodies or resolving CSS/assets.
- A future streaming scanner may stop after safe control-plane inventory.
- Retrieving one object should avoid parsing unrelated slides.
- applying a text or manifest-order patch should avoid whole-file serialization.
- ordinary semantic projections should exclude path data, runtime code, inactive
  themes, and computed styles.
- resolved style and render work should be cacheable per slide and theme.
- a native editor operation should update only affected semantic and DOM scopes.

Benchmarks should report bytes read, source regions parsed, objects materialized,
and tokens emitted in addition to wall-clock time.

## 24. Test and conformance obligations

The 0.1 suite currently covers source recognition/ranges/BOM/CRLF/non-BMP,
strict ordering and security, manifest/deck hierarchy and projections, the
three patch operations and atomic failures, CLI check/explicit-write behavior,
C6 constrained style/geometry/text resolution, the editor/session foundation,
and C7 deterministic PPTX graph/ZIP/mapping errors. The following corpus still
describes the larger roadmap beyond that implemented slice.

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

- **Implemented:** C4/C5, the in-progress C6 resolved profile,
  manifest/patch schemas, exact offset/hash/BOM policy, the normalized minimal
  HTML fixture, and executable diagnostic tests.
- **Remaining:** projection/diagnostic schemas if needed, canonical formatting,
  a kitchen-sink fixture, and a broader invalid-fixture corpus.

### Phase B — scanner and semantic read path

- **Implemented for self-contained HTML:** source scan/index, strict manifest,
  selected-slide loading, outline/text/semantic/editing projections, and
  stable-ID queries, plus pure C6 constrained-CSS/token provenance,
  finite-geometry/group/connector, and explicit-hard-line resolution.
- **Remaining:** standalone SVG semantic loading, external dependencies,
  relationship semantics, raster resource resolution, Node/browser normalized
  parity, and true differentiated lazy levels.

### Phase C — semantic write path

- **Implemented:** transactional direct-text, active-theme selection, and exact
  slide-order patches with preserve replacement and candidate reload.
- **Remaining:** attribute/class/token/geometry/structural operations, canonical
  serialization, and normalization.

### Phase D — viewer and editor

- **Implemented foundation:** the tiny fixture viewer and registered digest,
  exact-source C5 browser session with bounded undo/redo, and deterministic
  strict-CSP `.editable.pptv.html` wrapper with inert bytes, semantic
  navigation, integrity verification, clean download, and a scriptless SVG
  viewport reconstructed from literal C6 data.
- **Remaining:** bundle writable controls, browser parity/snapshot tests, and
  stale-safe user-granted file save.

### Phase E — PowerPoint adapter

- **Implemented C7 canary:** deterministic fresh two-slide package, minimum
  valid master/layout/theme graph, native primitives/connectors/translated
  groups, one-line no-wrap/no-autofit text, strict OPC/ZIP validation, typed
  capability errors, ISO/ECMA XSD validation, and independent OpenDocKit reopen.
- **Native evidence:** the minimal fixture opens without repair and exports a
  coherent two-page 16:9 PDF in PowerPoint 16.111.2.
- **Remaining:** atomic assets, multiline hard lines, source-map schema,
  expanded native fixtures, quantitative render comparison, reliable PPTX
  save/reopen, and edited-PPTX reconciliation.

## 26. Design conclusion

The processing API should make PPTV feel less like editing XML and more like
editing a small, typed presentation graph whose source happens to remain ordinary
web technology.

The decisive implementation rule is:

> Parse only what the operation requires, preserve the source ranges and style
> intent that produced it, and express every meaningful change as a stable-ID,
> reviewable, atomic semantic patch.
