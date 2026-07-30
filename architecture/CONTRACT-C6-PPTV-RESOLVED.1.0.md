# CONTRACT-C6-PPTV-RESOLVED.1.0

**Version:** 1.0
**Status:** in-progress
**Owner:** Will Ackerly
**Type:** Data Model
**Cross-repo Promotability:** Yes — OpenDocKit may adopt the normalized geometry, style-provenance, and explicit-line text model
**Source:** `PPTV-IMPLEMENTATION-PLAN.md` §§2–3

## Why this exists

C4 identifies exact source objects without claiming that a browser and
PowerPoint will draw them alike. This contract defines the deliberately small,
browser-independent projection that an editor and fresh-PPTX compiler may
trust without measuring a DOM, executing deck code, consulting implicit host
fonts, or guessing layout.

The resolved model is a capability gate, not a best-effort renderer. A deck
either resolves every selected slide and object under these rules or produces
diagnostics and no compiler model.

## Who needs this

- **Browser editor** — finite geometry, hard text lines, and computed appearance
  from the same source authority used by the compiler
- **PPTX compiler** — one normalized, JSON-safe input with exact SVG-unit to EMU
  conversion
- **PPTV agents and CLI** — precise capability diagnostics before asking for an
  edit or export
- **OpenDocKit adapters** — a possible upstream-neutral presentation IR
  boundary whose source/browser implementation remains in PPTV

## Scenarios

### Scenario 1 — editable grouped diagram

A slide contains a native group translated by `(100, 40)`, with one local
rectangle and one explicitly framed text object. Resolution retains group and
child identities, computes local and world geometry, preserves DOM painter
order, and resolves visual properties from base CSS plus the active theme.

### Scenario 2 — hard multiline text

A text frame contains direct, non-nested `tspan` lines with explicit `x` and
`y` positions separated by its declared line step. The editor may show one
multiline control, but the model retains separate hard lines. A longer edit can
warn about overflow later, but cannot wrap, shrink, or move a word.

### Scenario 3 — unsupported browser behavior

A source uses a percentage width, `calc()`, group rotation, an incomplete
theme, or implicit text layout. Resolution emits stable diagnostics and returns
no model. The compiler never invokes `getBBox()`, `getComputedStyle()`, font
fallback, or a raster fallback to accept that input.

## Interfaces

Resolution of an already loaded deck is synchronous, pure, and performs no
I/O:

```ts
interface PptvResolvedResult {
  model?: PptvResolvedDeck;
  diagnostics: Diagnostic[];
}

interface PptvResolvedDeck {
  schema: "pptv-resolved/0.1";
  sourceSha256: string;
  activeTheme: string;
  canvas: {
    viewBox: readonly [0, 0, 1600, 900];
    widthEmu: 12192000;
    heightEmu: 6858000;
    emuPerUnit: 7620;
  };
  slides: readonly PptvResolvedSlide[];
}

function resolvePptvDeck(deck: PptvDeck): PptvResolvedResult;
```

Every resolved object is a JSON-safe discriminated union carrying:

```ts
interface PptvResolvedObjectBase {
  id: string;
  slideId: string;
  parentId: string | null;
  kind:
    | "rect"
    | "ellipse"
    | "text"
    | "line"
    | "group"
    | "svg-asset"
    | "raster-asset";
  order: number;
  localBounds: PptvBounds;
  worldBounds: PptvBounds;
  worldOffset: { x: number; y: number };
  style: PptvResolvedStyle;
  styleProvenance: PptvStyleProvenance;
}

interface PptvBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

Concrete geometry retains the source primitive:

- `rect`: `x`, `y`, `width`, `height`, optional `rx` and `ry`
- `ellipse`: `cx`, `cy`, `rx`, `ry`; a source `circle` normalizes to equal
  radii while retaining `sourceElement: "circle" | "ellipse"`
- `line`: `x1`, `y1`, `x2`, `y2`, plus optional stable `fromId` and `toId`
- `group`: local `translateX` and `translateY`, ordered resolved children, and
  bounds derived from the union of its children
- `svg-asset`: explicit declared bounds; opaque internals do not enter the
  native object tree
- `raster-asset`: a reserved resolved kind with explicit declared bounds and a
  resource reference; the dependency-free 1.0 resolver always emits
  `PPTV-PROFILE-RESOURCE` and no model until a self-contained static resource
  table is versioned
- `text`: one explicit frame, line step, anchor, ordered hard lines with
  explicit baseline `x` and `y`, and fixed `wrap="none"`, `autofit="none"`,
  and zero-margin compiler intent

The model contains no DOM/parser nodes, functions, maps, sets, CSSOM objects,
font handles, or runtime state. C6 records one concrete source font family,
weight, and style; installed-font verification and environment fingerprints
belong to the compiler/visual-verification gate, not this pure resolver.

## Source Grammar Added by C6

### Base and theme blocks

One strict HTML deck contains exactly one inert base/component block after
slides/libraries and before themes:

```html
<script type="text/css" data-pptv-style="base">
.title {
  fill: var(--pptv-text-primary);
  font-family: var(--pptv-font-major);
  font-size: 64px;
  font-weight: 700;
}
</script>
```

Every theme is one complete, token-only `:root` rule:

```html
<script type="text/css" data-pptv-theme="light">
:root {
  --pptv-text-primary: #17211e;
  --pptv-font-major: Arial;
}
</script>
```

### Text frames and lines

Every native text object declares a finite, unitless frame and positive line
step:

```xml
<text
  id="title"
  data-pptv-role="text"
  data-pptv-export="native"
  data-pptv-frame="100 60 1400 120"
  data-pptv-line-step="76.8"
  x="100"
  y="120">One hard line</text>
```

Frame values are `x y width height`; width and height are strictly positive.
Direct text represents exactly one line and contains no decoded newline. Its
parent `text` supplies finite unitless `x` and `y`.

Multiline text contains only direct, non-nested `tspan` children plus
formatting whitespace. Each `tspan` supplies finite unitless `x` and `y`; the
parent `text` supplies neither:

```xml
<text
  id="body"
  data-pptv-role="text"
  data-pptv-export="native"
  data-pptv-frame="120 180 900 240"
  data-pptv-line-step="48">
  <tspan x="120" y="220">First hard line</tspan>
  <tspan x="120" y="268">Second hard line</tspan>
</text>
```

Each `tspan` is one line and contains no newline or child element. Successive
baselines have exactly the declared line-step delta; all anchor points and
baselines fall inside the frame. Resolution does not estimate glyph bounds.

### Opaque bounds

Every `svg` or `raster` asset declares:

```xml
data-pptv-bounds="x y width height"
```

Values are finite and unitless; width and height are strictly positive. Bounds
are local to a containing native group and authoritative even if browser
measurement differs. An opaque boundary has no transform; a containing group
supplies translation.

## Behavioral Contracts

### Canvas and finite geometry

| Behavior | Specification |
|----------|---------------|
| Canvas | Every slide is exactly `viewBox="0 0 1600 900"`; another origin, size, ratio, or presentation-bearing root SVG attribute is rejected. The root permits only its mirrored `id`, `viewBox`, optional `data-pptv-layout`, and standard SVG/XLink namespace declarations. |
| Physical mapping | One SVG unit is exactly `7620` EMU; slide size is exactly `12192000 × 6858000` EMU. |
| Numbers | Geometry, transforms, frames, steps, and bounds use finite base-10 SVG numbers with no unit or percentage. Exact authored baseline-delta arithmetic is bounded to 512-character lexemes and a 1024-place scale gap; values beyond that capability fail closed rather than allocating unbounded integers. |
| Positive values | Shape radii, shape/frame/asset dimensions, and line step are strictly positive. Coordinates/endpoints may be negative. |
| Determinism | Normalized fields use finite JavaScript numbers and JSON number serialization, never locale formatting. |

### Object boundaries, grouping, and order

| Source pair | Resolved kind | Rule |
|-------------|---------------|------|
| `rect` + `shape/native` | `rect` | Required `x`, `y`, `width`, `height`; optional finite `rx`, `ry` |
| `circle` or `ellipse` + `shape/native` | `ellipse` | Required center and positive radius/radii |
| `text` + `text/native` | `text` | Explicit frame and hard-line rules apply |
| `line` + `connector/native` | `line` | Straight connector with two distinct endpoints; `polyline` is outside 1.0 |
| `g` + `group/native` | `group` | Addressable children and one optional translation |
| `g` + `asset/svg` | `svg-asset` | One atomic vector picture with explicit bounds |
| `image` + `asset/raster` | reserved `raster-asset` | Atomic bounds/reference grammar is recognized, but dependency-free C6 resolution fails closed with `PPTV-PROFILE-RESOURCE` |

- A native group accepts no `transform` or exactly one
  `translate(tx ty)`/`translate(tx, ty)`; one-argument translate means
  `ty = 0`. Rotation, scale, skew, matrix, lists, and transforms on other
  native objects are rejected.
- Child geometry remains local. `worldOffset` is the sum of ancestor
  translations; world geometry adds that offset exactly once.
- A group has at least one emitted child. Its bounds are the finite union of
  resolved children, never browser-measured.
- DOM order is canonical painter order. `order` counts emitted siblings from
  back to front. A native group and opaque asset each occupy one parent slot.
- `ignore` produces no resolved object or slot. Opaque/ignored descendants are
  not independently resolved.
- Connector `data-pptv-from`/`data-pptv-to`, when present, resolve uniquely in
  the same slide. They express identity and never move endpoints.
- C6 1.0 does not define raster resource bytes. The dependency-free resolver
  therefore emits `PPTV-PROFILE-RESOURCE` and no model for every raster asset;
  a later static resource-table contract must land before raster compilation.

### Explicit text

| Behavior | Specification |
|----------|---------------|
| Hard lines | Source line strings and baseline positions are authoritative; no wrapping or line inference exists. |
| Frame | `data-pptv-frame` is the future PowerPoint text box; resizing it cannot alter text, font size, or line count. |
| No autofit | The model always means PowerPoint `wrap="none"` plus `a:noAutofit`; it exposes no wrap/shrink/fit switch. |
| Paragraph editing | An editor may join lines with `\n`, but commit emits direct text or explicit direct `tspan` lines. |
| Unsupported richness | Nested/styled runs, text paths, `dx`/`dy`, `rotate`, `textLength`, bullets, columns, and ambient non-whitespace text are errors. |
| Overflow | `CONTRACT:C8-PPTV-TEXT-FIT.1.0` defines the deterministic warning preflight; it never mutates text or geometry and is not required for pure C6 resolution. |

### CSS and theme resolution

The author cascade is:

1. fixed defaults;
2. presentation attributes;
3. matching simple single-class base rules in source order; then
4. element-local `style`.

Presentation attributes lose to matching classes; inline declarations win.
Theme blocks supply custom-property values only.

| Behavior | Specification |
|----------|---------------|
| Theme grammar | Exactly one `:root` rule containing unique `--pptv-*` declarations; no other selector/rule. |
| Complete themes | Required tokens are the union of `var(--pptv-*)` references in base CSS. Every theme supplies exactly that set, with no missing or extra tokens. |
| Token values | One literal supported property value; no token chaining, `var()`, or fallback. |
| Base selectors | Only simple single-class selectors such as `.title`; no lists, nesting, combinators, IDs, elements, attributes, universal, or pseudo selectors. |
| Base declarations | Supported properties only, no duplicates per rule. A value is one literal or exactly `var(--pptv-token)` with no fallback. |
| Properties | `fill`, `stroke`, `stroke-width`, `opacity`, `font-family`, `font-size`, `font-weight`, `font-style`, `text-anchor`. |
| Local declarations | The same properties may be presentation attributes or inline declarations; local custom properties and `!important` are rejected. Inline duplicates follow ordinary last-declaration-wins order. |
| Paint | `none` or opaque `#RRGGBB`, normalized lowercase; no gradients, paint servers, alpha/named colors, filters, masks, or patterns. |
| Numeric style | Stroke width is nonnegative unitless/`px`; font size is positive unitless/`px`; opacity is `[0,1]`; percentages are unsupported. |
| Font | One concrete unquoted or quoted family with no comma/generic fallback; weight `400`/`700`; style `normal`/`italic`. Text requires explicit family and size. |
| Anchor | `start`, `middle`, or `end`. |
| Defaults | `fill=#000000`, `stroke=none`, `stroke-width=1`, `opacity=1`, `font-weight=400`, `font-style=normal`, `text-anchor=start`; no font family/size default. |
| Provenance | Every property records default, attribute, selector/source order, or inline origin and substituted token when applicable. |
| Prohibited CSS | All at-rules, URLs, animation, transition, `!important`, inheritance keywords, `calc()`, layout units, unsupported declarations, and silent fallback are errors. |
| No browser authority | CSSOM, `getComputedStyle()`, layout, font fallback, and runtime execution cannot participate. |

The active theme exists. All themes, not just the active one, are validated for
grammar and exact token parity so theme switching cannot cross a silent
capability boundary.

### All-or-nothing result

- C4 diagnostics are retained. Any C4 error/fatal or incomplete materialization
  prevents a model.
- Slides resolve in manifest order. Duplicate declarations are never resolved
  first-or-last.
- Any C6 error prevents `model`; warnings may accompany a model.
- Resolution performs no write, fetch, browser measurement, runtime execution,
  or mutation.
- The same deck produces structurally equal JSON in Node and browsers.

## Error Contracts

| Error | When | Code |
|-------|------|------|
| Invalid C4 base | Deck has an error, is partial, or its index is ambiguous | `PPTV-PROFILE-INVALID-BASE` |
| Unsupported canvas | Slide viewBox differs from `0 0 1600 900` | `PPTV-PROFILE-VIEWBOX` |
| Invalid number | Required number is missing, non-finite, unit-bearing, malformed, or outside its allowed range | `PPTV-PROFILE-NUMBER` |
| Unsupported pair | Element/role/export is outside the object table | `PPTV-PROFILE-OBJECT-KIND` |
| Invalid geometry | Primitive cross-field/reference geometry is inconsistent | `PPTV-PROFILE-GEOMETRY` |
| Unsupported transform | Transform is not permitted native-group translation | `PPTV-PROFILE-TRANSFORM` |
| Invalid text frame | Frame or line-step is invalid | `PPTV-PROFILE-TEXT-FRAME` |
| Invalid hard lines | Text children, positions, newlines, anchor, or baseline deltas violate the grammar | `PPTV-PROFILE-TEXT-LINES` |
| Missing asset bounds | SVG/raster asset lacks valid explicit bounds | `PPTV-PROFILE-ASSET-BOUNDS` |
| CSS syntax | CSS cannot be parsed unambiguously by the subset | `PPTV-PROFILE-CSS-SYNTAX` |
| Unsupported selector | Selector is outside the exact grammar | `PPTV-PROFILE-CSS-SELECTOR` |
| Unsupported property | Declaration is unknown or forbidden in its location | `PPTV-PROFILE-CSS-PROPERTY` |
| Unsupported value | Supported property has a value outside its finite grammar | `PPTV-PROFILE-CSS-VALUE` |
| Theme mismatch | Theme tokens differ, contain extras, or omit requirements | `PPTV-PROFILE-THEME-TOKENS` |
| Unresolved token | Base reference has no valid active-theme value | `PPTV-PROFILE-UNRESOLVED-TOKEN` |
| Unsupported font | Font family is fallback/generic or weight/style cannot map exactly | `PPTV-PROFILE-FONT` |
| Missing resource | Raster asset cannot be resolved without fetching | `PPTV-PROFILE-RESOURCE` |

## Dependencies

- Depends on: `CONTRACT:C4-PPTV-SOURCE.1.0`
- Consumed after writes governed by: `CONTRACT:C5-PPTV-PATCH.1.0`
- Configuration: none; canvas and style capabilities are versioned constants
- External: none beyond C4 parsers; no CSS/browser layout engine
- OpenDocKit: optional downstream adapter/compiler boundary, not a source-kernel
  runtime dependency

## Cross-references

- **Primary plan:** `PPTV-IMPLEMENTATION-PLAN.md` §§2–5
- **Source vocabulary:** `PPTV-PROFILE.md`
- **Editor:** `PPTV-TOOLING-AND-EDITOR.md`
- **PowerPoint mapping:** `SVG-TO-EDITABLE-PPTX.md`

## Future evolution

- Named deck-wide 4:3 or 16:10 canvases require a versioned extension;
  arbitrary per-slide sizes do not enter this version line.
- Rich runs, bullets, auto layout, autofit, wrapping, font embedding, arbitrary
  web fonts, and fallback stacks are deferred.
- More primitives, connectors, transforms, paths, alpha paint, or CSS require
  exact source grammar plus browser/Office parity fixtures first.
- A static resource table must define self-contained raster bytes before raster
  compilation can become verified end-to-end.

## Implementing Files

- `packages/pptv/src/core/styles.ts` — CSS/token parser, cascade, and provenance
- `packages/pptv/src/core/resolved.ts` — pure geometry/text/object/deck
  projection
- `examples/minimal-deck.pptv.html` — smallest conforming two-slide fixture

## Test Requirements

- [x] Exact canvas/EMU constants and alternate-canvas rejection
- [x] Supported primitives plus finite local/translated world geometry
- [x] Nested translation, group union, DOM order, opaque atomicity, and
  transform rejection
- [x] Direct and multiline hard text, exact step/frame, and implicit-layout
  rejection
- [x] Base/theme/token/attribute/class/inline cascade and provenance
- [x] Incomplete/extra themes and prohibited CSS fail closed
- [ ] Node/browser normalized JSON parity
- [x] Invalid C4 and tested C6 capability errors produce no partial model
- [ ] Minimal and kitchen-sink fixtures resolve without browser execution
  (minimal is covered; the standalone kitchen-sink corpus remains)

## Change History

| Version | Date | Change | Migration |
|---------|------|--------|-----------|
| 1.0 | 2026-07-28 | Initial fixed-canvas, finite-geometry, explicit-line, and deterministic-style profile | Normalize worked examples before enabling compiler output |
