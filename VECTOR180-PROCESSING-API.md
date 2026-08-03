# Vector180 Processing API and Semantic Operations

**Status:** `@office180/vector180` `0.1.0-alpha.5` implements the strict Vector180 0.1
deck/atom kernel, the unified C5 `vector180-patch/0.1` protocol, C6/C8
projections, trusted
browser editor, C7 deck canary, bounded C9 atom composition/PPTX compilation,
and C10 2.0 mapped-PPTX reconciliation; C11 1.2 automates browser/Quick Look
evidence and a bounded exact-path native no-op lifecycle, while general
authoring/import, representative native edits, and native text/cross-renderer
fidelity remain open.
**Primary implementation language:** TypeScript  
**Companions:** [`VECTOR180-DESIGN-INDEX.md`](VECTOR180-DESIGN-INDEX.md),
[`VECTOR180-AGENT-GUIDE.md`](VECTOR180-AGENT-GUIDE.md), and
[`VECTOR180-TOOLING-AND-EDITOR.md`](VECTOR180-TOOLING-AND-EDITOR.md)

## 1. Purpose

This document specifies the intended processing architecture for Vector180.

The default document is one fully hydrated standalone SVG atom. HTML is an
explicit collection layer for a real deck/report, not a prerequisite for
reading, editing, rendering, or compiling one visual. The goal is to provide
one small, deterministic substrate for:

- token-efficient agent inspection;
- safe semantic editing;
- browser rendering;
- a native visual editor;
- normalization and validation;
- deterministic PPTX compilation; and
- baseline-aware reconciliation of edited PPTX files.

The processing API must make cheap questions cheap. Reading one atom's identity,
text, or selected objects must not require a manifest, deck CSS, runtime, font
measurement, or a whole-source ingestion by the agent. Deck order/theme queries
may add only the collection-level work they actually require.

### Executable 0.1 boundary

The executable source profile remains Vector180 `0.1`: authored hard lines,
no wrapping, and no autofit. The package version is
`@office180/vector180@0.1.0-alpha.5`; the banked 0.1.1 paragraph-resilience design is
not accepted syntax or compiler behavior. The single package, C4 through C10,
the published schemas, C11 evidence tooling, and their tests currently provide:

- `scanVector180Source`; deck-only `parseManifest`/`validateManifest`; explicit
  `loadDeck` and `loadAtom`; and discriminated-union `loadVector180Document`;
- immutable, exact-source-hash-bound `Vector180Deck` and `Vector180Atom` snapshots,
  with `Vector180Document` as their union;
- deck-specific and atom-specific outline, inventory, text, semantic,
  editing, query, C6 resolved, and C8 text-fit projections;
- asynchronous `validatePatch` and `applyPatch` over either artifact:
  one `vector180-patch/0.1` envelope covers direct-text and deck theme/order,
  exact typed rectangle/ellipse
  geometry, connector endpoints, explicit group translation, one-line text
  frame/anchor, within-parent painter order, safe deletion, and complete
  directly represented native style, plus at most one exact-template
  same-parent native straight connector clone;
- `extractVector180Atom`, which deterministically hydrates one fully resolved
  deck slide into a validated, context-free `.vector180.svg` atom;
- pure C6 constrained-CSS/geometry/group/hard-line resolution: fixed 16:9 for
  decks and arbitrary finite positive `viewBox` for standalone diagrams;
- exact-source browser editor sessions, a byte-locked browser conformance
  kernel, explicit-font browser C8 measurement, and deterministic strict-CSP
  writable editor packs for decks and atoms;
- the Node-only deterministic C7 strict-subset PPTX compiler/graph validator,
  intentionally limited to self-contained HTML decks; and
- pure C8 non-mutating text-fit evidence plus the Node-only explicit exact-font
  adapter for both artifact kinds;
- C9 explicit identity or aspect-preserving uniform composition of one
  standalone atom into a deterministic one-slide deck and mapped native PPTX;
- C10 fail-closed inspection of an edited descendant of that exact C9
  baseline, producing named native-save normalization proofs, deterministic
  findings/candidates/options, a reviewable C5 typed patch for authenticated
  representable differences, or one C5 connector clone after strict
  reviewed resolution, then proving it by patch/apply/recompile;
- C11 browser-SVG and Quick Look capture/comparison envelopes plus the bounded
  native Office bridge. Word and PowerPoint 16.111.2 passed exact-path no-op
  save/close/reopen on 2026-08-02; bound visual evidence remains
  `manual-required`; and
- C12 atom-only stable-ID source comparison, with exact lexical, metadata, and
  supported semantic changes kept distinct.

Interfaces in this document that exceed those bounded surfaces—rich text,
structural insertion/reparenting, browser geometry/style controls, external
dependencies, canonical serialization, arbitrary SVG/PPTX import, broader
rendering, or representative native Office edit automation—remain roadmap
unless explicitly identified as implemented.

Behavioral authority lives in
[`CONTRACT:C4-PPTV-SOURCE.2.0`](architecture/CONTRACT-C4-PPTV-SOURCE.2.0.md),
[`CONTRACT:C5-PPTV-PATCH.2.0`](architecture/CONTRACT-C5-PPTV-PATCH.2.0.md),
[`CONTRACT:C6-PPTV-RESOLVED.2.0`](architecture/CONTRACT-C6-PPTV-RESOLVED.2.0.md),
[`CONTRACT:C7-PPTX-CANARY.2.0`](architecture/CONTRACT-C7-PPTX-CANARY.2.0.md),
and
[`CONTRACT:C8-PPTV-TEXT-FIT.2.0`](architecture/CONTRACT-C8-PPTV-TEXT-FIT.2.0.md),
[`CONTRACT:C9-PPTV-PPTX-BASELINE.2.0`](architecture/CONTRACT-C9-PPTV-PPTX-BASELINE.2.0.md),
[`CONTRACT:C10-PPTV-PPTX-RECONCILIATION.2.0`](architecture/CONTRACT-C10-PPTV-PPTX-RECONCILIATION.2.0.md),
[`CONTRACT:C11-OFFICE-VISUAL-EVIDENCE.1.2`](architecture/CONTRACT-C11-OFFICE-VISUAL-EVIDENCE.1.2.md),
and
[`CONTRACT:C12-VECTOR180-SOURCE-DIFF.1.0`](architecture/CONTRACT-C12-VECTOR180-SOURCE-DIFF.1.0.md).
All current C4-C12 successor contracts remain `in-progress`; “implemented” in
this document describes tested bounded code, not contract promotion.

## 2. Hard invariants

Every implementation must preserve these invariants:

1. **Canonical content is declarative.** An atom's meaning comes from its SVG,
   concrete local styling, and Vector180 annotations. An explicit deck/report may
   additionally use its manifest, slide templates, supported CSS/theme, and
   reusable definitions.
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
9. **Native Vector180 editing does not require OOXML.** PowerPoint support is an
   optional adapter, not part of the core editing path.
10. **No network access by default.** Local and embedded dependencies are
    sufficient for inspection, editing, rendering, and compilation.

## 3. Representation layers

Vector180 processing uses distinct representations with one-way derivation:

```text
Raw source text and byte spans
  -> source scan and section index
  -> content dispatch
       -> standalone SVG atom
       -> explicit HTML deck/report -> parsed manifest + selected slides
  -> artifact-specific hierarchical Vector180 semantic tree
  -> optional resolved style and normalized geometry
       -> outline / semantic / editing / resolved projections
       -> browser DOM
       -> editor interaction projection
       -> C7 deck canary
       -> C9 explicit atom composition -> mapped PPTX baseline
            -> C10 authenticated edited-PPTX inspection
            -> reviewable C5 typed patch or strict reviewed C5 connector clone
            -> C9 regeneration proof
       -> C11 renderer-specific evidence + exact-path no-op Office lifecycle
```

The exact declarative source bytes are persistent authority. The hierarchical
Vector180 semantic tree is an immutable interpretation bound to their SHA-256. It
must be reconstructed after a write and cannot out-authorize the source.

### 3.1 Raw source

The exact `.vector180.html`, `.vector180.svg`, or `.vector180-manifest.json` source, including:

- whitespace;
- comments;
- quote choices;
- attribute order;
- CSS formatting;
- runtime text; and
- unselected themes.

Raw source is retained so simple edits can be surgical.

The artifact boundary is explicit. A self-contained `.vector180.html` loads as a
`Vector180Deck`; a standalone `.vector180.svg` loads as a `Vector180Atom`; and
`Vector180Document` is the discriminated union of those two semantic forms.
Standalone manifest JSON remains scan/parse inventory rather than a semantic
document in 0.1.

### 3.2 Source scan

A shallow inventory of top-level Vector180 sections and their source ranges. It is
created without parsing slide geometry or resolving CSS.

### 3.3 Semantic tree

A hierarchical, format-specific model close to SVG. It preserves stable IDs,
DOM order, source ranges, classes, attributes, roles, export intent, connector
relationships, and source-style provenance.

### 3.4 Resolved model

C6 derives either `Vector180ResolvedDeck` or `Vector180ResolvedAtom`. Both contain
computed supported CSS, translated native groups, normalized finite geometry,
explicit hard text lines, and source style provenance. Deck resolution binds
base/theme CSS to the fixed 1600×900 canvas. Diagram resolution uses only local
presentation attributes/inline styles and retains the standalone root's finite
positive `viewBox`; it does not synthesize manifest, theme, slide, EMU, or
physical-page state.

The resolved model is disposable and source-hash-bound. Unsupported selectors,
properties, geometry, or semantic boundaries produce diagnostics rather than
browser-dependent recovery.

### 3.5 Interaction model

A derived, potentially flat model optimized for hit testing, selection, drag,
resize, alignment, and spatial queries. It may use an R-tree or fractional
indexes internally but cannot redefine canonical hierarchy or z-order.

### 3.6 PowerPoint adapter model

A derived representation used to write or inspect PresentationML. Office shape
IDs and relationship IDs never become canonical Vector180 identity.

## 4. Input abstraction

The portable 0.1 core accepts bytes or text without assuming a filesystem:

```ts
export type Vector180Input =
  | { kind: "text"; text: string; name?: string }
  | { kind: "bytes"; bytes: Uint8Array; name?: string };
```

The Node CLI is a separate host layer that reads exact file bytes. Browser
`File` input is converted to one of these portable variants by the host;
dependency resolvers remain roadmap host interfaces rather than core input
variants.

Future multi-resource dependency resolution should be injected:

```ts
export interface DependencyResolver {
  read(ref: Vector180DependencyRef): Promise<Uint8Array>;
  stat?(ref: Vector180DependencyRef): Promise<Vector180DependencyStat>;
}
```

The default resolver:

- permits embedded content;
- permits local files below declared roots;
- rejects path traversal;
- rejects remote HTTP(S) retrieval unless explicitly enabled; and
- records a content hash for every dependency read.

## 5. Processing levels

The implemented semantic loaders have one materialization level:

```ts
materialization.level: 'semantic'
```

A standalone diagram is already one atom and has no slide selector. `slides`
can restrict semantic materialization only after content dispatch selects an
HTML deck/report. “Editing” is a projection view that exposes already-retained
attributes/classes/ranges; it is not a second load mode. `scan` and deck-only
manifest reads are separate functions, not loader levels.

The fuller roadmap remains:

```ts
export type Vector180LoadLevel =
  | "scan"
  | "manifest"
  | "outline"
  | "semantic"
  | "editing"
  | "resolved"
  | "normalized";
```

### 5.1 Roadmap work matrix

| Level        | Required work                                          | Explicitly deferred                         |
| ------------ | ------------------------------------------------------ | ------------------------------------------- |
| `scan`       | recognize atom or collection; locate relevant blocks   | JSON parse, object parse, CSS, assets       |
| `manifest`   | deck-only parse and validate leading manifest          | slide geometry, CSS, assets                 |
| `outline`    | atom identity or deck manifest plus shallow index/text | computed styles, paths, fonts, assets       |
| `semantic`   | selected hierarchical objects and relationships        | computed paint, font measurement, expansion |
| `editing`    | geometry, classes, token references, source ownership  | expensive filters, rasterization, PPTX      |
| `resolved`   | computed CSS, transforms, dependencies, fonts          | target-specific PPTX writing                |
| `normalized` | deterministic compiler-ready model                     | none within supported profile               |

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

export function scanVector180Source(
  input: Vector180Input,
  options?: ScanOptions,
): Promise<Vector180Scan>;
```

### 6.2 Scan result

```ts
export interface Vector180Scan {
  kind: "svg" | "html" | "manifest" | "unknown";
  wireFamily?: "vector180" | "pptv-legacy";
  encoding: "utf-8";
  source: Vector180SourceDocument;
  versionHint?: string;
  sections: Vector180SectionRef[];
  diagnostics: Diagnostic[];
}

export interface Vector180SectionRef {
  kind:
    | "html-head"
    | "manifest"
    | "output-mount"
    | "slide"
    | "library"
    | "style"
    | "theme"
    | "viewer-runtime"
    | "editor-runtime"
    | "unknown";
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
3. for SVG, enforce XML well-formedness and locate the single atom root;
4. for HTML, locate the manifest before parsing slide bodies and inventory
   slide, library, theme, and runtime blocks;
5. detect duplicate applicable identifiers;
6. verify strict physical order when requested;
7. avoid executing scripts or loading dependencies; and
8. return useful diagnostics even when later sections are malformed.

For self-contained HTML, the 0.1 scanner uses `parse5` with source locations
and scripting disabled. It constructs a non-executing parse tree and traverses
the whole source to enforce security/resource limits and verify the
viewer-runtime digest.

For standalone SVG, the scanner first runs exact `saxes@6.0.0` as a
namespace-aware XML 1.0 well-formedness gate, before any `parse5` structural
scan. Duplicate attributes, mismatched or omitted end tags, undeclared
prefixes, invalid XML characters, multiple roots, DOCTYPE/DTD, and custom
entities fail fatally as `VECTOR180-SCAN-SVG-XML`; no semantic atom is returned.
An optional XML 1.0 declaration and the predefined XML entities are accepted.
Browser parser recovery is never semantic authority.

Outline avoids semantic deck-slide loading, CSS resolution, library expansion,
asset work, and runtime execution; 0.1 does not claim streaming early-stop
behavior.

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
export interface Vector180SourceIndex {
  readonly sourceSha256: string;
  readonly manifest: SourceRange;
  readonly manifestFields: ReadonlyMap<string, SourceRange>;
  readonly manifestSlideEntries: ReadonlyMap<string, SourceRange>;
  readonly slides: ReadonlyMap<string, IndexedSlide>;
  readonly objects: ReadonlyMap<string, IndexedObject>;
  readonly style?: IndexedStyle;
  readonly themes: ReadonlyMap<string, IndexedTheme>;
  readonly libraries: ReadonlyMap<string, IndexedLibrary>;
  readonly runtimes: readonly Vector180SectionRef[];
}

export interface Vector180AtomIndex {
  readonly sourceSha256: string;
  readonly root: IndexedAtom;
  readonly objects: ReadonlyMap<string, IndexedAtomObject>;
  readonly metadata?: IndexedAtomMetadata;
}
```

The deck index also retains manifest-slide entry ranges for surgical ordering.
The atom index has no synthetic manifest, slide, theme, or runtime ranges.
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
export interface Vector180Manifest {
  vector180: string;
  title?: string;
  runtime?: string;
  editor?: string;
  theme?: string;
  themes?: string[];
  slides: Array<string | Vector180ManifestSlide>;
  agentProfile?: string;
  extensions?: Record<string, unknown>;
}

export interface Vector180ManifestSlide {
  id: string;
  layout?: string;
  hidden?: boolean;
  namespace?: string;
  src?: string;
}
```

### 8.1 Manifest functions

```ts
export function parseManifest(scan: Vector180Scan): ManifestParseResult;
export function validateManifest(
  manifest: Vector180Manifest,
  scan: Vector180Scan,
): Diagnostic[];
```

The slide array is the sole canonical slide order. A source template that is
present but not referenced may be reported as unused rather than silently
added. `ManifestParseResult` contains the optional manifest, indexed ranges,
and diagnostics. Theme selection and slide reordering are C5 patch operations,
not manifest mutation helper functions.

The 0.1 manifest requires `vector180: "0.1"` and strict JSON (no comments, trailing
commas, or duplicate keys). Self-contained HTML also requires
`data-vector180-version` to match the manifest version and requires referenced
slides, active theme, and viewer runtime to exist exactly once. Title,
agent-profile, SVG-layout, and `themes`-list mirror/authority rules remain
unresolved; external slide `src`/`namespace` forms are recognized but rejected
as unsupported. The optional manifest `editor` field must resolve to a matching
editor-runtime declaration, but 0.1 registers no embedded editor-runtime
artifact. The implemented writable editor is instead a generated trusted
wrapper: `createEditorPack()` embeds the exact deck or atom bytes as inert
data and never executes source runtime text.

## 9. Semantic model

### 9.1 Document, deck, atom, and slide

```ts
export interface Vector180Deck {
  readonly version: string;
  readonly sourceKind: "html";
  readonly wireFamily: "vector180" | "pptv-legacy";
  readonly title?: string;
  readonly activeTheme?: string;
  readonly slideOrder: readonly string[];
  readonly slides: ReadonlyMap<string, Vector180Slide>;
  readonly baseStyle?: Vector180BaseStyle;
  readonly themes: ReadonlyMap<string, Vector180Theme>;
  readonly libraries: ReadonlyMap<string, Vector180Library>;
  readonly source: Vector180SourceDocument;
  readonly index: Vector180SourceIndex;
  readonly manifest: Vector180Manifest;
  readonly materialization: {
    readonly level: "semantic";
    readonly slideIds: readonly string[];
    readonly complete: boolean;
  };
  readonly diagnostics: readonly Diagnostic[];
}

export interface Vector180Atom {
  readonly version: "0.1";
  readonly sourceKind: "svg";
  readonly wireFamily: "vector180" | "pptv-legacy";
  readonly id: string;
  readonly viewBox: readonly [number, number, number, number];
  readonly children: readonly Vector180Node[];
  readonly metadata?: Vector180AtomMetadata;
  readonly metadataSha256?: string;
  readonly sourceRange: SourceRange;
  readonly source: Vector180SourceDocument;
  readonly index: Vector180AtomIndex;
  readonly diagnostics: readonly Diagnostic[];
}

export type Vector180Document = Vector180Deck | Vector180Atom;

export interface Vector180Slide {
  readonly id: string;
  readonly layout?: string;
  readonly hidden: boolean;
  readonly viewBox: readonly [number, number, number, number];
  readonly children: readonly Vector180Node[];
  readonly sourceRange: SourceRange;
}
```

`sourceKind` is the discriminant; APIs do not fabricate a one-slide deck around
an atom. The 0.1 core does not implement external dependencies. Deck C6
requires every slide to use `viewBox="0 0 1600 900"` and derives the fixed
13⅓×7.5-inch EMU canvas. A standalone diagram requires a finite four-number
`viewBox` with positive dimensions but does not acquire physical slide size.

### 9.2 Nodes

```ts
export interface Vector180Node {
  readonly id: string;
  readonly role: "shape" | "text" | "connector" | "group" | "asset";
  readonly exportMode: "native" | "svg" | "raster" | "ignore";
  readonly elementName: string;
  readonly classes: readonly string[];
  readonly attributes: Readonly<Record<string, string>>;
  readonly parentId: string | null;
  readonly children: readonly Vector180Node[];
  readonly text?: string;
  readonly opaque: boolean;
  readonly sourceRange: SourceRange;
  readonly openTagRange: SourceRange;
  readonly directTextRange?: SourceRange;
}
```

The semantic `Vector180Node` intentionally stays close to exact source. C6 resolved
types expose supported geometry and style provenance without discarding this
source-bound representation.

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

The semantic/editing projections expose the supported plain/direct-text
surface. C6 separately retains authored hard lines plus computed typography and
style provenance; it still does not claim a general rich-run model.

The executable 0.1 profile never reflows these lines. It does not wrap,
autofit, shrink, or infer line breaks. The proposed 0.1.1 paragraph-intent and
PowerPoint frame policies are banked design only; they require successor
source/resolution/compiler contracts before any producer may emit them.

### 9.4 Connectors

```ts
export interface Vector180ResolvedLine extends Vector180ResolvedObjectBase {
  readonly kind: "line";
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly fromId?: string;
  readonly toId?: string;
}
```

Endpoint references are semantic relationships. Geometry remains explicit and
is not silently recomputed. The C4 semantic node retains raw `line`/`polyline`
attributes; C6 resolves supported straight lines, validates optional
`data-vector180-from`/`data-vector180-to` references within the artifact, and emits the
specialized resolved line. C5 typed can replace all four existing endpoints of a
resolved native `<line>` while preserving stable relationship references.
Elbow routing, marker semantics, automatic endpoint following, and browser
connector controls remain roadmap.

## 10. C6 CSS and theme processing

C6 implements a deliberately constrained, fail-closed CSS resolver. Decks may
resolve the base stylesheet plus the active declared theme, local presentation
attributes, and local inline styles. Standalone diagrams forbid stylesheet,
class, theme-control, custom-property, and `var()` authority; they resolve only
portable local presentation values and inline styles.

The resolver supports the profile's exact selector/property/value subset,
source-order cascade, inherited supported typography/paint, explicit defaults,
and style provenance. Unsupported selectors, declarations, variables,
resource-bearing CSS, or ambiguous authority are diagnostics. C5 can select an
already-declared deck theme. C5 typed can replace a complete concrete native
style only when every affected property already comes from its own direct SVG
presentation attribute; it never rewrites base rules, inline style, tokens, or
defaults. Theme-token mutation remains roadmap.

### 10.1 Style levels

The resolver preserves three useful levels:

```text
source     presentation attribute, base rule/token, or inline expression
binding    exact supported --vector180-* token reference when authored
computed   final supported property values for a specific element
```

### 10.2 Style provenance

```ts
export type Vector180StyleOrigin =
  "default" | "presentation-attribute" | "base-rule" | "inline-style";

export interface Vector180ResolvedPropertyProvenance {
  readonly origin: Vector180StyleOrigin;
  readonly expression: string;
  readonly selector?: string;
  readonly sourceOrder?: number;
  readonly token?: string;
  readonly sourceRange?: SourceRange;
}
```

A local color that computes to the same RGB value as a theme token is not
implicitly converted into that token. Binding follows source intent, not color
coincidence.

### 10.3 Implemented CSS API

```ts
export function resolveVector180Styles(
  deck: Vector180Deck,
): Vector180StyleResolution;
export function resolveVector180AtomStyles(
  atom: Vector180Atom,
): Vector180StyleResolution;

export function resolveVector180Deck(
  deck: Vector180Deck,
): Vector180ResolvedDeckResult;
export function resolveVector180Atom(
  atom: Vector180Atom,
): Vector180ResolvedAtomResult;
```

`Vector180StyleResolution` is an internal/compiler-facing map keyed by stable object
ID. `Vector180ResolvedDeckResult` and `Vector180ResolvedAtomResult` expose JSON-safe,
artifact-specific models when all required C6 semantics resolve. There is no
general public `parseTheme`, arbitrary CSSOM, or single-property tracing API in
0.1.

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
  input: Vector180Input,
  options?: LoadDeckOptions,
): Promise<Vector180Deck>;

export function loadAtom(
  input: Vector180Input,
  options?: LoadAtomOptions,
): Promise<Vector180Atom>;

export function loadVector180Document(
  input: Vector180Input,
  options?: LoadVector180DocumentOptions,
): Promise<Vector180Document>;

export function validateDeck(deck: Vector180Deck): Diagnostic[];
export function deckIsValid(deck: Vector180Deck): boolean;
export function validateAtom(atom: Vector180Atom): Diagnostic[];
export function atomIsValid(atom: Vector180Atom): boolean;
```

Examples:

```ts
await loadAtom(svgInput);
const atom = await loadVector180Document(svgInput);
if (atom.sourceKind === "svg") {
  console.log(atom.id);
}

// Collection-only loading:
await loadDeck(input, { slides: ["architecture"] });
await loadDeck(input);
const document = await loadVector180Document(deckOrAtomInput);
```

Selected-slide loading does not materialize unrelated slides. Object-selected
loading, dependency resolvers, and theme overrides are roadmap. A diagram is
always loaded as one independent atom; `LoadVector180DocumentOptions.slides` applies
only when content dispatches to an HTML deck. The current `strictOrder` option
is the operative strictness configuration and defaults to true.

## 12. Projections and queries

### 12.1 Views

```ts
export type ProjectionView = "semantic" | "editing";
```

- **Outline:** `outlineAtom()` returns atom identity and `viewBox`;
  `outlineManifest()`/`outlineDeck()` return collection metadata and ordered
  slides.
- **Semantic:** meaningful hierarchy, text, object kinds, and connector roles
  without raw attributes/classes/ranges.
- **Editing:** the same hierarchy plus raw attributes, classes, source ranges,
  and slide `viewBox`.

Artifact-specific inventory and extracted-text projections are implemented.
`resolveVector180Deck()` and `resolveVector180Atom()` are separate C6 projections with
computed supported style, finite geometry, groups, connectors, and explicit
hard lines. Placeholders, broader relationship summaries, and general
normalization remain roadmap.

### 12.2 Query API

```ts
export interface Vector180Query {
  slideId?: string;
  ids?: string[];
  role?: Vector180Node["role"];
  className?: string;
  elementName?: string;
  textContains?: string;
  descendantOf?: string;
}

export function outlineDeck(deck: Vector180Deck): DeckOutline;
export function outlineAtom(atom: Vector180Atom): AtomOutline;
export function inventoryDeck(deck: Vector180Deck): DeckInventory;
export function inventoryAtom(atom: Vector180Atom): AtomInventory;

export function getSlide(
  deck: Vector180Deck,
  slideId: string,
  view?: ProjectionView,
): SlideProjection | undefined;
export function getAtom(
  atom: Vector180Atom,
  view?: ProjectionView,
): AtomProjection;

export function getObject(
  deck: Vector180Deck,
  objectId: string,
  view?: ProjectionView,
): ObjectProjection | undefined;
export function getAtomObject(
  atom: Vector180Atom,
  objectId: string,
  view?: ProjectionView,
): AtomObjectProjection | undefined;

export function queryObjects(
  deck: Vector180Deck,
  query: Vector180Query,
  view?: ProjectionView,
): ObjectProjection[];
export function queryAtomObjects(
  atom: Vector180Atom,
  query: Vector180AtomQuery,
  view?: ProjectionView,
): AtomQueryProjection;

export function extractText(
  deck: Vector180Deck,
  options?: { slideId?: string; includeHidden?: boolean },
): TextProjection;
export function extractAtomText(atom: Vector180Atom): AtomTextProjection;
```

Results preserve manifest and DOM order unless a caller explicitly requests a
different sort for presentation.

`textContains` is case-insensitive in 0.1. Atom queries omit the deck-only
`slideId` filter. Results are versioned JSON-safe records and arrays; callers
should not serialize the Map-rich in-process deck or atom directly.

### 12.3 Source-to-source semantic comparison

```ts
export function diffVector180Atoms(
  left: Vector180Atom,
  right: Vector180Atom,
): Vector180SourceDiff;
```

The C12 comparison report retains exact source hashes and separately classifies
added/removed objects, stable-ID text, relationship, geometry, style, frame,
and within-parent order changes. Lexical-only differences remain separate. It
does not compare a canonical atom with generated HTML/PPTX as though they were
peer sources. C10 remains the authenticated mapped-PPTX comparison path.

### 12.4 Artifact-specific C8 text-fit

```ts
export function preflightTextFit(
  deck: Vector180ResolvedDeck,
  measurer: Vector180TextMeasurer,
  options?: Vector180TextFitOptions,
): Vector180TextFitResult; // schema: vector180-text-fit-deck/0.1

export function preflightAtomTextFit(
  atom: Vector180ResolvedAtom,
  measurer: Vector180AtomTextMeasurer,
  options?: Vector180TextFitOptions,
): Vector180AtomTextFitResult; // schema: vector180-text-fit-atom/0.1
```

Both functions inspect explicit hard lines without wrapping, resizing,
substituting fonts, or mutating source/geometry. The portable core accepts an
injected measurer. The Node-only Fontkit adapter uses only explicitly mapped
font files and returns face/hash/method evidence; it performs no system font
discovery or silent fallback. Browser editor packs may embed those exact faces
and compare current browser measurements with the Node evidence.

### 12.5 Deck-slide hydration into an atom

```ts
export function extractVector180Atom(
  deck: Vector180Deck,
  slideId: string,
): Promise<Vector180AtomExtractionResult>;
```

Extraction is a deterministic source-to-source dereference operation, not a
raw subtree copy and not a browser screenshot. It requires a complete,
error-free deck and a valid C6 resolution. It retains the selected SVG root,
stable IDs, hierarchy, painter order, geometry, authored hard lines, and opaque
SVG payloads; removes deck-only classes/control attributes; materializes
resolved paint and typography as local inline presentation values; and adds the
standard XLink namespace only if retained source uses that prefix. It prepends
the canonical non-normative `vector180-authoring` discovery comment after any XML
declaration. The comment is writer metadata, not source authority or a validity
requirement.

The candidate is reloaded through the standalone C4 XML/semantic gate and C6
diagram resolver. Only a context-free valid `.vector180.svg` is returned, together
with its hash, `Vector180Atom`, diagnostics, and
`vector180-slide-hydration/0.1` provenance. On any failure, no candidate source bytes
are exposed. The CLI form:

```text
vector180 extract deck.vector180.html --slide ID --output slide.vector180.svg
```

publishes by an atomic same-filesystem no-overwrite operation and fails
race-safely if the destination already exists.

### 12.6 Atom lineage metadata

Vector180 0.1 admits zero or one strict inert direct-child `<metadata>` payload
identified by `data-vector180-metadata="vector180-atom-metadata/0.1"`. It
separates:

- immediate tool-generated hydration/origin provenance;
- logical template ID/version plus exact template-basis SHA-256; and
- an optional non-authoritative design-family grouping.

```ts
export function projectAtomMetadata(
  atom: Vector180Atom,
): Promise<Vector180MetadataInspection>;

export function compareAtomMetadata(
  left: Vector180Atom,
  right: Vector180Atom,
  options?: Vector180MetadataComparisonOptions,
): Promise<Vector180MetadataComparison>;
```

The normal atom hash covers exact metadata bytes. A separately derived
canonical metadata hash supports cheap comparison, while a C6 style palette
fingerprint is computed from current resolved output rather than stored where
it can become stale. Metadata contains no paths, hosts, user identity,
commands, URLs, or external dependencies and never selects styling, object
identity, or agent behavior.

Extraction should preserve template/design family, replace immediate hydration
provenance deterministically, and advance its method version. C5 preserves the
block byte-for-byte; C9 binds its canonical metadata hash in the sidecar map
but does not place atom-only metadata in the generated HTML slide. C10 remains
bound transitively through exact source/map hashes. Absent metadata remains
valid. Canonical schema authority is
`schemas/vector180-atom-metadata-0.1.schema.json`.

## 13. Semantic patch format

### 13.1 Envelope

```ts
interface Vector180PatchMetadata {
  baseSha256: string;
  transactionId?: string;
  author?: string;
  timestamp?: string;
}

export interface Vector180Patch extends Vector180PatchMetadata {
  schema: "vector180-patch/0.1";
  ops: Vector180PatchOperation[];
}
```

`baseSha256` is mandatory and hashes the exact retained UTF-8 source bytes,
including a leading BOM. There is no unsafe hash bypass in the library or
reference CLI. One envelope contains the complete operation vocabulary and
may contain at most one contracted connector clone.

### 13.2 Operation preconditions

The direct text/deck operations retain their optional preconditions:

```ts
set-text:         oldText?: string
set-active-theme: oldTheme?: string
set-slide-order:  oldOrder?: string[]
```

Every typed operation has a mandatory complete old value:
`oldGeometry`, `oldEndpoints`, `oldTranslation`,
`oldFrame` + `oldLineAnchor`, `oldOrder`, `oldParentId` + `oldOrder`, or
`oldStyle`. These values are compared with the current C6 projection before
any replacement is planned. The old-value and source-hash checks make
concurrent or stale changes fail cleanly.

The connector clone additionally carries complete `oldConnector`, desired
`connector`, and complete `oldOrder`/`order`. An envelope contains at most one
clone operation.

### 13.3 Implemented operation vocabulary

`vector180-patch/0.1` accepts direct operations:

- `set-text` for one safe direct native text range in either artifact;
- deck-only `set-active-theme`; and
- deck-only `set-slide-order`.

The same envelope accepts typed operations:

- `set-object-geometry` for existing native `<rect>` or true `<ellipse>`
  geometry;
- `set-connector-endpoints` for all four existing `<line>` coordinates;
- `set-group-translation` for an already explicit C6 `translate(...)`;
- `set-text-frame` for an existing direct one-hard-line frame and anchor;
- `set-child-order` for an exact direct-child permutation in a diagram root,
  slide root, or native group;
- `delete-object` for one safe exact native subtree; and
- `set-native-style` for the complete concrete C6 style when every affected
  property is already represented by its own presentation attribute.

The typed surface is deliberately representation-preserving. It does not add
missing attributes, convert circles to ellipses, rewrite inline/CSS/theme
style, generally insert objects, reparent, scale groups, or provide a generic
attribute writer. Deletion accounts for connector references across the complete
transaction. Every typed apply reloads through C4 and resolves through C6 before
success.

The same envelope accepts at most one `clone-connector`:

```ts
interface Vector180ConnectorCloneState {
  fromId: string;
  toId: string;
  endpoints: { x1: number; y1: number; x2: number; y2: number };
  style: Vector180ConcreteNativeStyle;
}

interface CloneConnectorOperation {
  op: "clone-connector";
  templateId: string;
  newId: string;
  parentId: string;
  oldOrder: string[];
  order: string[];
  oldConnector: Vector180ConnectorCloneState;
  connector: Vector180ConnectorCloneState;
}

type Vector180PatchOperation = Vector180Operation | CloneConnectorOperation;
```

The template is one childless native `<line>` whose required attributes already
exist. C5 copies its exact element spelling and changes only clone-local ID,
explicit existing from/to references, endpoints, and eligible direct style.
The fresh ID and complete same-parent sibling order are caller authority; C5
never allocates identity, infers references, reparents, clones another object
kind, or accepts more than one clone.

These operations are available through the portable patch API and CLI. The
generated browser editor UI still exposes only direct text plus deck
theme/order controls; it does not yet present geometry, style, ordering, or
deletion controls.

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

```json
{
  "schema": "vector180-patch/0.1",
  "baseSha256": "...",
  "ops": [
    {
      "op": "set-object-geometry",
      "id": "architecture.service",
      "oldGeometry": {
        "kind": "rect",
        "x": 100,
        "y": 120,
        "width": 300,
        "height": 160
      },
      "geometry": {
        "kind": "rect",
        "x": 120,
        "y": 120,
        "width": 320,
        "height": 160
      }
    }
  ]
}
```

### 13.5 Transaction behavior

```ts
export function validatePatch(
  document: Vector180Document,
  patch: unknown,
): Promise<Diagnostic[]>;

export function applyPatch(
  document: Vector180Document,
  patch: unknown,
): Promise<PatchResult>;
```

Both functions accept `unknown` because runtime schema validation is part of the
contract. Both are asynchronous because they reconstruct a fresh trusted
same-kind document from its retained source text and verify its hash before
trusting any index or range.

Validation/application order:

1. reconstruct and verify a complete trusted base snapshot of the same
   artifact kind;
2. validate envelope/schema, source hash, every operation, target,
   representation, and precondition, resolving the base through C6 for
   typed/connector-clone;
3. plan the complete set of source replacements and reject intersecting ranges,
   including competing zero-width insertions;
4. reject the complete transaction if any operation is invalid;
5. for `applyPatch`, apply replacements from later UTF-16 offsets to earlier
   offsets;
6. rescan and semantically reload the complete candidate, resolving it through
   C6 for typed/connector-clone; and
7. return new source text, exact-byte hash, a validated `deck` or `atom`,
   edits, and affected IDs only on success.

`validatePatch()` stops after validating the complete plan; it does not build
or reload a candidate. `applyPatch()` performs candidate C4 reload and, for
typed/connector-clone, C6 validation. No operation in a failed transaction is committed, and
failure exposes no replacement source/deck/edit list/affected IDs.

### 13.6 Layout generation (roadmap)

The core avoids hidden automatic layout. Supported geometry, translation,
frame, order, and connector changes are explicit typed operations.

A future layout engine may offer separate commands that generate an ordinary
reviewable patch:

```ts
const patch = autoLayout(deck, {
  slideId: "architecture",
  algorithm: "layered",
  preserveLocked: true,
});
```

The layout result is not special state; it is a patch the caller may inspect and
apply.

## 14. Serialization

The only general semantic serialization is C5 preserve-mode source replacement
inside `applyPatch()`. There is no `serializeDeck()`/`serializeAtom()` or
canonical mode in 0.1. `EditorSession` exposes the exact current source after
each validated transaction; the generated browser editor can download it and,
when the File System Access API is available, write it to a user-selected file
with a stale-on-disk hash check.

### 14.1 Roadmap modes

```ts
export type SerializeMode = "preserve" | "canonical";
```

The implemented preserve path changes the smallest supported safe source range
and retains unrelated bytes.

**Canonical mode** emits normalized formatting suitable for fixtures, generated
sources, or major structural rewrites.

### 14.2 Preserve-mode rules

- A text replacement edits only the text range when possible.
- A manifest reorder edits only the `slides` value.
- An active-theme edit changes only the manifest `theme` string value.
- A typed value change replaces only existing attribute value ranges and
  preserves each attribute name, envelope, quote kind, surrounding whitespace,
  and every unrelated byte.
- A child-order operation moves complete existing child-element payloads among
  their source slots while keeping interstitial bytes in place.
- A deletion removes the one exact validated object-element range.
- Unchanged runtime and inactive theme blocks remain byte-identical.
- A leading BOM and unchanged newline spelling remain byte-identical.

Generic attributes, missing-attribute insertion, token/rule rewrites,
structural insertion/reparenting, and canonical whole-document serialization
remain roadmap.

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
  deck: Vector180Deck,
  options?: {
    mode?: SerializeMode;
    includeViewer?: boolean;
    includeEditor?: boolean;
  },
): string;

export async function writeDeck(
  deck: Vector180Deck,
  destination: Vector180Destination,
  options?: WriteOptions,
): Promise<WriteResult>;
```

These library APIs are not implemented. The `patch` CLI requires exactly one of
`--check` or an explicit `--output`; the `extract` CLI requires an explicit
destination and uniquely refuses overwrite. Node output writes use a temporary
peer, fsync, and atomic same-filesystem publication; portable core/ops code
never writes.

## 15. Normalization and target adapters

### 15.1 General normalization (roadmap)

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
  deck: Vector180Deck,
  options?: NormalizeOptions,
): Promise<NormalizedVector180Deck>;
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

### 15.2 Implemented bounded C9/C10 PowerPoint path

The C9 atom path does not wait for a general normalization API and does not
coerce arbitrary SVG. It consumes one complete C4/C6 standalone diagram plus a
caller-supplied widescreen placement:

```ts
composeVector180AtomDeck(
  atom: Vector180Atom,
  placement: Vector180Placement
): Promise<Vector180AtomCompositionArtifact>

compilePptxBaseline(
  atom: Vector180Atom,
  options: { placement: Vector180Placement }
): Promise<Vector180PptxBaselineArtifact>
```

`identity` requires matching extents. `uniform-scale-translate` requires an
exact aspect match and records one positive scale and translation. C9 never
infers physical size, stretches, crops, or letterboxes. It emits a
deterministic self-contained one-slide deck aggregation, a native PPTX, and a
canonical `vector180-pptx-map/0.1` sidecar that binds the atom, composed deck,
placement, supported object inventory, and PPTX hashes. The atom remains source
authority. Current C9 compilation accepts atoms only; deck input stays on the
independent C7 canary.

The Node boundary exposes fail-closed inspection and reconciliation:

```ts
inspectPptxForReconciliation(
  editedPptxBytes,
  baselineMap
): Promise<PptxInspectionResult>

reconcilePptx(
  source: Vector180Document,
  baselineMap: Vector180PptxMap,
  editedPptxBytes: Uint8Array,
  options?: {
    nativeBaselinePptxBytes?: Uint8Array;
    resolution?: Vector180ReconcileResolution;
  }
): Promise<Vector180ReconciliationResult>
```

The implemented C10 slice accepts only an edited descendant of an exact C9
standalone-atom baseline. It authenticates raw ZIP/OPC structure, lineage,
source/map hashes, stable `src.<stable-id>` names, hierarchy/order, and the
supported DrawingML subset. An exact optional native baseline is accepted only
after named structural normalization rules prove its supported semantics
equivalent; each accepted occurrence remains visible in the report. C10 emits
deterministic findings, blocked candidate operations, and resolution options.
It can propose direct text plus the complete C5 typed surface. Before
returning `patchable`, it applies the proposal to temporary source, reloads
C4/C6, recompiles with the exact recorded placement, and requires normalized
supported DrawingML semantic equality.

Missing identity and duplicates refuse by default. A strict
`vector180-reconcile-resolution/0.1` document can resolve only one duplicated mapped
straight connector with exactly two occurrences and exactly one
baseline-equivalent composite fingerprint. It binds the exact
source/map/edited/comparison hashes, baseline and copied occurrence
fingerprints, reviewer-chosen fresh ID, explicit existing `fromId`/`toId`, same
parent, complete old/new order, inverse endpoints, and complete style. Success
emits one C5 connector-clone `clone-connector`. Zero matches means both copies changed or
structure drifted; two matches is ambiguous. Both, stale data, another
duplicate, reparenting, insertion plus reorder, group scaling, representation
changes, inherited/inline style rewrites, unsupported runs/effects, another
blocking finding, or arbitrary baseline-free PPTX input remain review-required
or refused with no partial patch. Source and presentation inputs are never
overwritten.

### 15.3 Implemented C11 evidence boundary

`scripts/visual-evidence.py` provides versioned, hash-bound browser SVG and
Quick Look captures, deterministic image comparison, schema validation, and
explicit native lifecycle status records for both Office lanes.
`scripts/native-office-bridge.py` adds the bounded non-interactive exact-path
no-op lifecycle on a repository-contained ignored work copy: ordinary Save,
package validation, close, reopen, and hash-bound report publication. It never
clicks or grants file access, quits Office, or closes unrelated documents.
Word and PowerPoint 16.111.2 passed on 2026-08-02.

Quick Look is an automated preview smoke, not Word or PowerPoint proof. Browser
evidence is engine/environment-specific; uncontrolled fonts are reported
honestly. Binding the no-op bridge report retains `manual-required`,
`editability_checked=false`, and `visual_fidelity_checked=false`.
Representative native edits, native text/cross-renderer fidelity, and human
review bound to the exact evidence hash remain promotion gates.

## 16. Browser runtime and trusted editor-pack boundaries

The browser-safe export at `@office180/vector180/browser` includes:

```ts
export class EditorSession {
  /* exact-source C4/C5 session */
}
export function inspectVector180Conformance(
  input: Vector180Input,
): Promise<Vector180BrowserConformanceResult>;
export function prepareVector180BrowserTextMeasurer(
  options: PrepareVector180BrowserTextMeasurerOptions,
): Promise<Vector180PreparedBrowserTextMeasurer>;
```

`inspectVector180Conformance()` loads and resolves exact bytes through the same
portable C4/C6 TypeScript as Node. It does not consult a DOM, CSSOM, filesystem,
source runtime, or host font. Its versioned JSON-safe result separates scan,
C4, and C6 values/diagnostics, enabling exact Node/browser parity checks. The
generated `Vector180BrowserKernel` IIFE is byte-locked to its TypeScript inputs and
the browser build fails if Node built-ins, Fontkit, or JSZip enter the graph.
The browser-safe `saxes` XML gate is included.

The Node-only `createEditorPack()` boundary accepts either a deck or atom,
validates/resolves it, optionally loads explicitly mapped Fontkit faces, and
generates a deterministic strict-CSP HTML wrapper. Exact source and optional
font bytes are inert base64 payloads. Source viewer/editor scripts are never
inserted into markup or executed.

The generated `vector180-editor/0.1` application is writable only through
`EditorSession` and C5 transactions. Its current UI exposes:

- safe direct text for decks or diagrams;
- active-theme selection and slide reordering for decks;
- bounded exact-source undo/redo;
- fresh C6 viewport/tree/diagnostics after each commit;
- current-source download for either artifact;
- deck-slide extraction/download as a standalone diagram;
- optional stale-safe user-granted file save; and
- Node/browser C8 evidence comparison when exact fonts are embedded.

It has no geometry, rich-`tspan`, structure, or arbitrary source editor. A
failed integrity check or invalid source makes writable controls read-only.
The portable C5 kernel can apply typed geometry/style/order/deletion
transactions and the one connector clone programmatically, including
transactions proposed by C10; that does not imply corresponding editor
controls.

The source-embedded `vector180-browser/0.1` viewer remains a fixed digest-recognized
artifact whose behavior is ignored during semantic loading. No embedded editor
runtime is registered. Opening an arbitrary source deck directly would execute
its embedded viewer before validation, so source direct-open is
trusted-source-only; the generated wrapper is the validated strict-CSP path.

## 17. Editor contract: implemented foundation and roadmap

The implemented browser editor uses the same semantic operation layer:

```text
pointer/keyboard action
  -> editor intent
  -> Vector180Operation or Vector180Patch
  -> validate and apply transaction
  -> update semantic tree and source index
  -> patch or remount affected SVG DOM
```

Every editor commit produces an ordinary hash-bound direct text/deck-control
C5 transaction and
reloads complete candidate source. Undo and redo retain bounded exact-source
snapshots, never arbitrary live DOM state. Selection and C6 preview are derived
state. The typed/connector-clone protocols supply the persistence substrate for future typed
controls without making those controls part of this MVP.

Live pointer transforms, move/resize, alignment, structural changes, connector
rerouting, rich-text editing, and a reusable native interaction component are
roadmap. When introduced, they must still commit reviewable semantic operations
and discard uncommitted visual transforms on cancellation.

## 18. Caching and invalidation (roadmap)

### 18.1 Cache key

Derived artifacts are keyed by:

```text
source SHA-256
Vector180 profile version
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
  severity: "info" | "warning" | "error" | "fatal";
  message: string;
  range?: SourceRange;
  slideId?: string;
  atomId?: string;
  objectId?: string;
  related?: DiagnosticRelated[];
}
```

### 19.1 Initial code families

```text
VECTOR180-SCAN-*       malformed container or source-order problem
VECTOR180-MANIFEST-*   invalid control-plane data or references
VECTOR180-ID-*         missing, duplicate, or invalid stable identity
VECTOR180-SVG-*        unsupported SVG or geometry
VECTOR180-CSS-*        unsupported selector/property or unresolved token
VECTOR180-ASSET-*      missing, unsafe, or changed dependency
VECTOR180-ORDER-*      invalid slide, child, or group ordering operation
VECTOR180-PATCH-*      stale hash, failed precondition, or invalid transaction
VECTOR180-RUNTIME-*    unknown, misplaced, or modified executable runtime
VECTOR180-PPTX-*       target mapping or reconciliation issue
VECTOR180-SECURITY-*   script, event, traversal, remote fetch, or resource-limit issue
```

Diagnostics should name the nearest valid opaque asset boundary when unsupported
SVG could be preserved as one asset.

## 20. Security and resource limits

The 0.1 self-contained-source core:

- uses non-executing HTML parsing and a namespace-aware XML 1.0
  well-formedness gate;
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

Standalone XML rejects DOCTYPE/DTD, custom entities, undeclared namespace
prefixes, duplicate attributes, invalid XML characters, and malformed/multiple
roots before semantic loading. Asset/package expansion limits,
dependency-cycle handling, embedded editor-runtime registration, and injected
filesystem/network capabilities are roadmap.

## 21. CLI contract

Implemented alpha.5 commands over the Vector180 0.1 source profile:

```text
vector180 new atom --output PATH --id ID --title TITLE [--width N --height N]
vector180 new deck --output PATH --title TITLE
vector180 outline <file.vector180.html|file.vector180.svg> [--format text|json]
vector180 validate <file.vector180.html|file.vector180.svg> [--format text|json]
vector180 resolve <file.vector180.html|file.vector180.svg> [--format text|json]
vector180 extract <deck.vector180.html> --slide ID --output file.vector180.svg
             [--format text|json]
vector180 editor-pack <file.vector180.html|file.vector180.svg> --output PATH
                 [--font-map default|PATH] [--near-limit N] [--format text|json]
vector180 pptx-canary <deck.vector180.html> --output PATH [--format text|json]
vector180 compose <atom.vector180.svg> --placement X,Y,W,H --output deck.vector180.html
             [--slide-id ID] [--policy identity|uniform-scale-translate]
             [--format text|json]
vector180 compile <atom.vector180.svg> --placement X,Y,W,H --output file.pptx
             --map file.vector180.map.json [--slide-id ID]
             [--policy identity|uniform-scale-translate]
             [--format text|json]
vector180 reconcile <edited.pptx> --source atom.vector180.svg
               --baseline file.vector180.map.json --patch proposal.vector180.patch.json
               --report reconciliation.json [--format text|json]
vector180 text-fit <file.vector180.html|file.vector180.svg> [--font-map PATH|default]
              [--near-limit N] [--format text|json]
vector180 text <file.vector180.html|file.vector180.svg>
          [--slide ID] [--include-hidden] [--format text|json|jsonl]
vector180 show <file.vector180.html|file.vector180.svg> <id>
          [--view semantic|editing] [--format json]
vector180 list <file.vector180.html|file.vector180.svg>
          [--slide ID] [--role ROLE] [--class CLASS]
          [--text TEXT] [--view semantic|editing] [--format text|json|jsonl]
vector180 metadata <atom.vector180.svg|atom.pptv.svg> [--format text|json]
vector180 metadata-compare <left.vector180.svg|left.pptv.svg>
          <right.vector180.svg|right.pptv.svg>
          [--template-basis PATH] [--format text|json]
vector180 diff <left.vector180.svg|left.pptv.svg>
          <right.vector180.svg|right.pptv.svg>
          [--output REPORT.json] [--format text|json]
vector180 migrate <legacy.pptv.svg> --output file.vector180.svg
          [--report migration.json] [--format text|json]
vector180 patch <file.vector180.html|file.vector180.svg> <patch.json>
           (--check | --output PATH)
           [--format text|json]
```

`--slide` and `--include-hidden` are deck-only query options.
`set-active-theme` and `set-slide-order` are deck-only patch operations.
`metadata`, `metadata-compare`, and `diff` are atom-only; each input may be
canonical Vector180 or a separately valid legacy PPTV atom. `--template-basis`
supplies exact independent bytes for lineage verification. `diff --output`
optionally persists the same report that is available on stdout. `migrate`
accepts one legacy PPTV atom, requires a canonical output path, and may also
publish its proof report.
`extract` and C7 `pptx-canary` accept only self-contained HTML decks.
`compose` and `compile` accept only one standalone atom and require explicit
placement; their outputs are deterministic aggregation/delivery artifacts, not
new source authority. `compile` publishes the PPTX and sidecar map as one
exclusive transaction. `reconcile` accepts only an edited descendant of that
mapped atom baseline, always writes its report, and writes a patch only for
`patchable` status. It never applies the patch or overwrites any input.
Standalone diagrams remain first-class for every other applicable command.
For `text-fit` and text-checking `editor-pack` flows, omitting `--font-map` is
identical to `--font-map default`: both select the immutable packaged ABeeZee
map. Any other value is an explicit caller-supplied map path; neither path
searches host fonts or silently substitutes a face.

Roadmap commands:

```text
vector180 theme <file> [--active] [--tokens] [--trace OBJECT PROPERTY]
vector180 normalize <file> [--output PATH]
vector180 render <file> [--slide ID] [--output PATH]
vector180 build-pptx <general-input> [--template PATH] [--output PATH]
vector180 import-pptx <unmapped-file.pptx> [--output PATH]
vector180 agent-guide [--profile vector180-agent/1]
```

The roadmap `build-pptx`/`import-pptx` names denote broader or baseline-free
work. They are not aliases for the implemented bounded `compile`/`reconcile`
commands.

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

The single `@office180/vector180` package has no OpenDocKit runtime dependency.
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
Vector180 semantic tree -> bounded C7/C9 writer -> PPTX
mapped edited PPTX -> bounded C10 inspector -> C5 semantic patch report
                         optional OpenDocKit/Office independent oracle
```

OpenDocKit's arbitrary-PPTX IR does not become the canonical native Vector180 model.
The shipped C9 writer and C10 inspector are local Node boundaries with no
OpenDocKit runtime dependency.

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

The current suite covers source recognition/ranges/BOM/CRLF/non-BMP,
standalone namespace-aware XML failures, strict ordering/security,
manifest/deck and diagram hierarchy, artifact-specific projections, diagram
hydration, direct text/deck-control patch compatibility, all seven C5 typed
operations and the one C5 connector clone with atomic failures, CLI
check/explicit-write/no-overwrite behavior, C6 deck/diagram
style/geometry/text resolution, C8 deck/diagram exact-font evidence,
Node/browser conformance and calibration, writable editor sessions/packs, and
C7 deterministic deck-only PPTX graph/ZIP/mapping errors. C9 adds
identity/uniform atom composition, deterministic PPTX/map, lineage and
exclusive-publication tests. C10 adds authenticated no-op and typed edit round
trips, named native-save normalization proofs, deterministic
findings/candidates/options, every strict reviewed connector-match outcome,
exact inverse placement, raw-ZIP collision checks, unsupported
DrawingML/identity/structure refusals, and apply/recompile equality. C11 adds
capture/comparison/status/schema/privacy and bounded native-bridge tests. The
following corpus also includes the larger roadmap beyond those implemented
slices.

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

- **Implemented:** C4/C5/C6/C8 deck-and-diagram contracts, the deck-only C7
  contract, bounded C9/C10/C11 contracts, manifest and C5 0.1 patch
  schemas, C10 reconciliation/resolution schemas, C11 evidence/native-bridge
  schemas, exact offset/hash/BOM/XML policy, minimal
  HTML, standalone SVG, C6 kitchen-sink, mapped-PPTX, reconciliation, and visual
  evidence fixtures, and executable diagnostic tests.
- **Remaining:** projection/diagnostic schemas if needed, canonical formatting,
  and a broader invalid-fixture corpus.

### Phase B — scanner and semantic read path

- **Implemented:** self-contained HTML `Vector180Deck` and standalone SVG
  `Vector180Atom` scan/index/load paths; `Vector180Document` content dispatch;
  namespace-aware XML fail-closed validation; deck- and diagram-specific
  outline/inventory/text/semantic/editing/query projections; pure C6
  constrained-CSS provenance, finite geometry/groups/connectors, and explicit
  hard-line resolution; and byte-locked Node/browser conformance.
- **Remaining:** external dependencies/manifests, broader relationship
  semantics, raster resource loading, and true differentiated lazy levels.

### Phase C — semantic write path

- **Implemented:** transactional direct text for decks and diagrams plus
  deck-only active-theme selection and exact slide-order patches, all with
  preserve replacement and same-kind candidate reload; opt-in C5 typed
  rectangle/ellipse geometry, connector endpoint, explicit group translation,
  direct one-line frame/anchor, child-order, safe-delete, and complete
  directly represented native-style patches with C6 preconditions and
  candidate revalidation; one exact-template same-parent C5 connector clone;
  and deterministic deck-slide hydration into an independently validated
  diagram atom.
- **Remaining:** generic attribute/class/token operations, general insertion,
  reparenting, representation-changing transforms, rich text, canonical
  serialization, and general normalization.

### Phase D — viewer and editor

- **Implemented:** the tiny fixed-digest source viewer; exact-source C5 browser
  session with bounded undo/redo; byte-locked conformance runtime; explicit
  browser font measurement; and deterministic strict-CSP editor packs for
  decks/diagrams with inert bytes, integrity verification, fresh C6 viewport,
  direct-text editing, deck theme/order controls, extraction, current-source
  download, and stale-safe user-granted file save.
- **Remaining:** geometry/rich-text/structural controls, a reusable pointer
  interaction layer, broader browser interaction snapshots, and host
  integrations.

### Phase E — PowerPoint adapter

- **Implemented deck-only C7 canary:** deterministic fresh two-slide package,
  minimum valid master/layout/theme graph, native
  primitives/connectors/translated groups, one-line no-wrap/no-autofit text,
  strict OPC/ZIP validation, typed capability errors, ISO/ECMA XSD validation,
  and independent OpenDocKit reopen.
- **Native evidence:** the minimal fixture opens without repair and exports a
  coherent two-page 16:9 PDF in PowerPoint 16.111.2.
- **Implemented bounded C9 baseline:** explicit identity or same-aspect uniform
  atom composition, independently reloaded one-slide deck, native primitive
  PPTX, complete deterministic `vector180-pptx-map/0.1`, stable names, lineage, and
  atomic paired publication.
- **Implemented bounded C10 reverse path:** exact source/map/PPTX
  authentication, fail-closed DrawingML/ZIP inspection, typed text/geometry/
  endpoint/translation/frame/order/deletion/style patch proposal, named
  native-save normalization proofs, agent-grade findings/candidates/options,
  one strict reviewed connector-copy resolution, temporary C5 apply, and
  exact-placement C9 regeneration proof.
- **Implemented C11 automation:** hash-bound trusted browser-SVG and Quick Look
  capture, deterministic comparison, checked evidence envelopes/privacy, and
  bounded exact-path native no-op lifecycle; Word and PowerPoint 16.111.2
  passed save/close/reopen on 2026-08-02.
- **Remaining:** atomic assets, multiline hard lines, broader source forms,
  arbitrary PPTX import, expanded cross-renderer quantitative evidence,
  controlled-font visual capture, human review, and reliable representative
  native PowerPoint edit/save/reopen. Bound evidence remains manual-required;
  that gate is not implied by Quick Look, browser success, or the narrower
  no-op lifecycle.

## 26. Design conclusion

The processing API should make Vector180 feel less like editing XML and more like
editing a small, typed presentation graph whose source happens to remain ordinary
web technology.

The decisive implementation rule is:

> Parse only what the operation requires, preserve the source ranges and style
> intent that produced it, and express every meaningful change as a stable-ID,
> reviewable, atomic semantic patch.
