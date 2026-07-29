# PPTV: A PowerPoint Vector Profile

**Status:** 0.1 source/patch/resolved/editor-foundation and strict PPTX canary
implemented for self-contained HTML; broader SVG/editor/compiler profile remains

PPTV is a constrained SVG authoring profile for deterministic conversion to
editable PowerPoint. A conforming source uses the compound extension
`.pptv.svg`:

```text
diagram.pptv.svg
```

The file remains ordinary, renderable SVG. The additional name and attributes
tell a PPTV compiler how the author intends each visual object to appear in
PowerPoint.

This proposal turns the reconstruction method in
[`SVG-TO-EDITABLE-PPTX.md`](SVG-TO-EDITABLE-PPTX.md) into a potential
machine-readable source contract. It deliberately places responsibility on
the SVG author rather than asking a converter to infer which objects should
be editable.

## Implemented boundary and version vocabulary

C4 now implements the source/read subset in the single TypeScript package
`@office180/pptv`, C5 implements three source patches, C6 implements the strict
fixed-canvas resolved projection, and C7 implements a narrow deterministic
fresh-PPTX canary. The executable
format identifier is manifest `pptv: "0.1"` mirrored by HTML
`data-pptv-version="0.1"`. Contract version `1.0`, viewer
`pptv-browser/0.1`, and agent profile `pptv-agent/1` are independent version
lines.

The older “PPTV version 1” language below describes the proposed complete SVG
to PowerPoint profile, not an implemented file-version alias. In 0.1:

- standalone `.pptv.svg` and external manifests are recognized/inventoried but
  not semantically loaded;
- one self-contained `.pptv.html` deck is loaded in manifest slide order;
- its slide SVGs require one direct root, matching IDs, and C6's exact
  `0 0 1600 900` `viewBox`;
- supported native pairs are `rect`/`circle`/`ellipse` shapes, `text`,
  `line`/`polyline` connectors, `g` groups, and `image`/`g` assets;
- exact source bytes, including a leading BOM, stable IDs, annotations, and DOM
  order are retained; and
- only direct-text replacement, active-theme selection, and complete slide
  reorder are writable;
- an exact-source browser session and trusted read-only editor pack exist; and
- the strict C7 primitive subset compiles through `pptx-canary`.

Geometry/CSS semantics, physical slide size, native groups/connectors, and
explicit text frames are implemented within C6. C7 generates native PPTX for
its strict subset and passes schema, independent reopen, and minimal-fixture
PowerPoint open/render smoke. Libraries, rich `tspan` editing, writable
geometry/structure controls, compilation beyond C7, quantitative fidelity,
native PPTX save/reopen, and reverse Office reconciliation remain open.

## The parallel with Markdown and DOCX

```text
document.md          -> md2docx.py         -> document.docx
deck.pptv.html       -> C7 PPTX canary     -> deck.pptx

document.docx        -> docx2md.py        -> document.md
diagram.pptx         -> future reconciler -> reviewed PPTV patch
```

The common architecture is:

1. a canonical, inspectable source;
2. a deterministic forward mapping;
3. stable semantic identities in the Office artifact;
4. a source hash and mapping record;
5. reverse inspection against a known baseline; and
6. explicit handling of changes that cannot be inverted safely.

PPTV cannot promise unrestricted inversion. PowerPoint permits users to draw,
group, convert, and replace arbitrary objects. Its reverse tool therefore
produces a reviewable patch and only applies changes covered by the profile.

## File family

For a canonical source named `diagram.pptv.svg`, the related files are:

```text
diagram.pptv.svg          # canonical authored source
diagram.pptx              # generated editable presentation
diagram.pptv.map.json     # generated source/object baseline
diagram.edited.pptx       # optional human-edited branch
diagram.pptv.patch.json   # reverse diff for review or application
```

One `.pptv.svg` remains the proposed standalone one-slide form. The implemented
whole-deck form is `.pptv.html`, whose leading manifest orders inert slide SVG
templates. External multi-file composition remains roadmap.

## Conformance marker and initial canvas decision

The filename is a convention, not proof of conformance. C6 requires this exact
slide canvas:

```xml
<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 1600 900"
  data-pptv-version="0.1">
  ...
</svg>
```

The implemented C6 HTML resolver maps `1600 × 900` source units exactly to
PowerPoint Widescreen
`12192000 × 6858000` EMUs (`13⅓ × 7.5 in`), or `7620` EMUs per source unit.
Every slide uses that one deck-wide size.

The first compiler rejects another viewBox/aspect ratio rather than stretching
or inferring it. A future profile may add named alternate deck sizes. It must
not introduce per-slide sizes or silently change existing geometry.

## Author annotations

Each object emitted into PowerPoint has:

- a unique standard SVG `id`;
- `data-pptv-role`, describing its semantic PowerPoint role; and
- `data-pptv-export`, declaring its representation.

The implemented 0.1 loader and proposed complete profile share these roles:

| Role | Meaning |
|---|---|
| `shape` | Editable visual geometry |
| `text` | Editable, searchable text |
| `connector` | A line expressing a relationship |
| `group` | An authored collection with one parent position |
| `asset` | Artwork treated as one object |

They share these export modes:

| Export | Behavior |
|---|---|
| `native` | Reconstruct as native PowerPoint text, geometry, connector, or group |
| `svg` | Embed the annotated subtree as one SVG picture |
| `raster` | Render the annotated subtree as one raster picture |
| `ignore` | Do not emit the subtree |

Example:

```xml
<g
  id="stage.2"
  data-pptv-role="group"
  data-pptv-export="native">

  <rect
    id="stage.2.panel"
    data-pptv-role="shape"
    data-pptv-export="native"
    x="100" y="200" width="400" height="240"
    rx="8"
    fill="#ffffff"
    stroke="#d7dcda"/>

  <line
    id="stage.2.input"
    data-pptv-role="connector"
    data-pptv-export="native"
    data-pptv-from="stage.1"
    data-pptv-to="stage.2"
    x1="40" y1="320" x2="100" y2="320"
    stroke="#1c302b"/>

  <text
    id="stage.2.title"
    data-pptv-role="text"
    data-pptv-export="native"
    x="132" y="262">
    Human approval
  </text>

  <g
    id="stage.2.icon"
    data-pptv-role="asset"
    data-pptv-export="svg">
    <!-- Complex paths remain vector artwork inside one PowerPoint object. -->
  </g>
</g>
```

Children of an opaque `svg`, `raster`, or `ignore` subtree do not need PPTV
annotations. The annotated parent is the object boundary.

For the compiler-grade profile, an opaque SVG/raster asset boundary also
requires explicit source bounds. Browser-measured `getBBox()` is interaction
evidence, not canonical compiler geometry. A visual box with editable text is
instead a native group containing a shape and a text object.

## Normative z-order model

The proposed complete profile, and the implemented 0.1 semantic loader, use
**SVG DOM order as the only canonical z-order**.

SVG already uses a painter's model: earlier rendered siblings are painted
first and later siblings appear above them. PresentationML uses the same
ordering direction in its shape tree: the first shape is backmost and the
last is topmost.

PPTV therefore does not define `data-pptv-z`, numeric layer indexes, or a CSS
`z-index` override. A separate ordering value would create two sources of
truth and ambiguous conflict resolution.

### Forward ordering rules

1. Renderable siblings are emitted in DOM order, back to front.
2. Non-rendered elements such as `defs`, `metadata`, `title`, and `desc` do
   not consume a PowerPoint z-order position.
3. A `native` group occupies one position in its parent scope. Its children
   preserve their own DOM order inside the PowerPoint group.
4. An `svg` or `raster` asset is atomic in its parent scope. Its internal
   painter order stays inside the embedded asset.
5. A group may be flattened only when the profile explicitly permits it and
   doing so cannot change opacity, clipping, masking, filtering, or blending.
   Version 1 should prefer native or opaque groups instead.
6. CSS ordering overrides are rejected in version 1.
7. SVG `use` elements are rejected unless a normalization step expands them
   into an ordinary, uniquely identified subtree before validation.

Authors may use semantic groups such as `layer.background`,
`layer.connectors`, and `layer.labels` to make the DOM easy to scan. Their
names do not override document order.

### Reverse ordering rules (roadmap)

The generated map records the stable-ID sequence for each parent scope. The
reverse tool compares sequences, not raw numeric positions:

```json
{
  "scope": "slide",
  "order": [
    "src.slide.background",
    "src.layer.connectors",
    "src.stage.1",
    "src.stage.2",
    "src.header.title"
  ]
}
```

Sequence comparison should use stable IDs and a longest-common-subsequence or
equivalent algorithm. This prevents one inserted object from making every
later z-position appear changed.

An intentional PowerPoint reorder becomes a relative patch:

```json
{
  "op": "move-after",
  "id": "src.stage.2",
  "after": "src.stage.1",
  "scope": "slide"
}
```

Accepted moves reorder the corresponding SVG elements within their parent.
Cross-parent moves are reported but not automatically applied in version 1.

PowerPoint shape-tree order can also influence keyboard navigation order.
PPTV authors should keep semantic progression and visual layering compatible
where practical; version 1 does not introduce a second accessibility-order
channel.

## Supported source surface

The complete strict native surface should remain intentionally small:

| SVG source | Native PowerPoint result |
|---|---|
| `rect` | Rectangle or rounded rectangle |
| `circle`, `ellipse` | Ellipse |
| `line` | Line or connector |
| `polyline` | Multi-segment line when supported without approximation |
| `text`, constrained line `tspan` | Explicit-line text box |
| constrained `g` | Native group |
| `image` with a local PNG/JPEG | Picture |

Complex `path`, `polygon`, clipping, masking, filters, patterns, blend modes,
text on a path, and arbitrary transforms are not silently approximated.
Authors place those features inside an object exported as `svg`, or validation
fails.

C6 accepts:

- presentation attributes and inline `style`;
- opaque SVG assets with explicit bounds (C7 does not compile them);
- finite unitless primitive geometry;
- one finite `translate(tx ty)` on a native group; and
- direct one-line text plus direct, non-nested explicit-line `tspan` children.

C6 rejects:

- external stylesheets or remote assets;
- scripting, animation, and event handlers;
- `foreignObject`;
- path-outlined text declared as editable;
- percentage geometry that depends on browser layout;
- automatic wrapping, autofit, shrink-to-fit, or automatic font sizing;
- native scale, rotation, skew, or arbitrary matrix transforms;
- ambiguous or duplicate IDs; and
- unsupported content outside an opaque asset boundary.

## Explicit-line text model (C6; C7 direct-line subset)

Native PPTV text is positioned authoring data, not a browser paragraph-layout
request.

- Direct text is exactly one hard line.
- Multiline text uses one direct `tspan` per line with explicit, validated line
  positions and line step.
- Font family, size, approved weight/style, color, anchor, and frame geometry
  must resolve to concrete values.
- The editor may expose one multiline paragraph-like control, but commits
  serialize its newlines back to explicit lines.
- Longer text may overflow and produce a diagnostic. It never wraps, moves a
  word, shrinks, changes font size, or resizes geometry automatically.
- Styled runs, bullets, columns, text paths, and nested spans are deferred.

The current C7 writer accepts exactly one hard line and emits one explicit
paragraph with contracted/zero margins, `wrap="none"`, and `a:noAutofit`.
Concrete source syntax for frame/bounds and line step is defined by C6. C7
rejects multiline text until its native mapping and fidelity fixtures land.

## Stable identity

The SVG `id` is the canonical semantic identity in the implemented source
kernel. C7 writes the PowerPoint Selection Pane name as:

```text
src.<svg-id>
```

That mapping is stable across regenerations. Office-generated
numeric shape IDs are implementation details and must never be used for
semantic matching.

Copying a shape in PowerPoint initially copies its semantic name. The reverse
tool treats duplicate `src.*` names as copied objects requiring newly assigned
SVG IDs before a new baseline can be established.

## Forward compiler behavior

The TypeScript CLI extends the implemented `pptv` command rather than
introducing independent Python semantics:

```bash
pptv validate deck.pptv.html
pptv resolve deck.pptv.html
pptv pptx-canary deck.pptv.html --output deck.pptx
```

Semantic validation/compilation is currently limited to self-contained HTML.
`pptx-canary` is deliberately strict, fresh-package, and template-free.
Template-backed or broader `build-pptx` behavior remains roadmap.

The implemented C7 canary:

1. validates the PPTV profile;
2. maps the exact `1600 × 900` coordinate system to the fixed 16:9 slide size;
3. emits supported native objects in normative DOM order;
4. writes stable object names and source/compiler provenance; and
5. validates its OPC graph before producing deterministic ZIP bytes.

A broader compiler may later hash local dependencies, generate explicit opaque
asset fallbacks, write a versioned `.pptv.map.json`, and participate in
render/native-QA workflows. None of those steps is performed implicitly by
`pptx-canary`; native PowerPoint QA is a separate acceptance action.

Strict behavior is a feature. Unsupported content produces an actionable
validation error naming the element and the nearest valid opaque boundary.
There is no silent fallback from `native` to raster.

## Reverse inspector and patcher (roadmap)

The proposed reverse command requires both the edited presentation and its
canonical source:

```bash
pptv reconcile diagram.edited.pptx \
  --source diagram.pptv.svg \
  --baseline diagram.pptv.map.json
```

`reconcile` is not implemented. C5 currently patches PPTV source directly and
does not inspect PowerPoint.

The source hash in the presentation must match the comparison baseline. If
the source changed independently, the tool stops and requests reconciliation
rather than applying a two-way overwrite.

Version 1 can automatically represent these changes:

- text and supported run formatting;
- position, dimensions, and rotation;
- supported fill and stroke properties;
- deletion of known objects;
- within-parent z-order changes; and
- addition or duplication of supported native primitives after ID allocation.

Version 1 reports but does not automatically apply:

- internal edits to an embedded SVG asset;
- conversion of SVG artwork into Office shapes;
- unsupported Office effects or custom geometry;
- cross-parent moves;
- changes that depend on a missing font or asset; and
- ambiguous duplicate identities.

The default action is report-only. `--apply` changes the canonical SVG only
after validation confirms that every selected patch operation is supported.
The human-edited PPTX is never overwritten.

## TypeScript package boundary

The implementation deliberately uses one package:

```text
@office180/pptv
  core              exact source, scanner, manifest, semantic deck
  ops               projections and C5 patch transactions
  node/cli           explicit host I/O and commands
  future adapter     optional PPTX/OpenDocKit integration
```

Splitting CSS, browser, editor, or PPTX packages is deferred until distinct
consumers justify those dependency boundaries. A future PowerPoint adapter may
use selected public OpenDocKit OPC/OOXML/theme utilities, but must remain
optional and cannot replace the exact PPTV source/semantic model.

## Test strategy

The current TypeScript suite covers exact UTF-8/UTF-16 ranges, BOM/CRLF/non-BMP
behavior, strict non-executing source scanning, manifest/deck hierarchy,
supported/opaque objects, projections and queries, three atomic patch
operations, and explicit CLI output.

A future `kitchen-sink.pptv.svg` or HTML fixture should exercise every complete
compiler-profile object, export mode, group scope, and z-order transition.

The minimum automated cascade is:

1. profile validation;
2. forward package generation;
3. OPC and relationship validation;
4. expected-versus-actual stable-ID inventory;
5. expected object sequence in every scope;
6. render comparison;
7. scripted PowerPoint edits to text, geometry, and ordering;
8. reverse patch generation;
9. patch application to a temporary SVG;
10. regeneration and structural/render comparison; and
11. desktop PowerPoint open-without-repair smoke validation where available.

## Contracts and remaining promotion

C4 is the verified behavioral authority for the implemented 0.1 source/read
surface, C5 governs the constrained patch path, C6 governs the implemented
resolved profile, and C7 governs the strict fresh-PPTX canary. This document
remains the author-facing rationale and broader compiler/reconciliation roadmap.

Before claiming general editable PowerPoint conformance, expand the native
fixture, add source-map/reverse comparison, quantitative render fidelity, and
native PPTX save/reopen. C6/C7 already contract physical mapping, no-reflow
intent, constrained CSS/theme resolution, normalized geometry/text frames,
fresh package construction, stable object naming, and minimal-fixture
PowerPoint open without repair.

## References

- [W3C SVG 2 rendering model](https://www.w3.org/TR/SVG/render.html)
- [Microsoft PowerPoint shape z-order](https://learn.microsoft.com/en-us/office/vba/api/powerpoint.shape.zorder)
- [Microsoft PowerPoint slide sizes](https://support.microsoft.com/en-us/powerpoint/change-the-size-of-your-powerpoint-slides)
- [PresentationML shape tree](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.shapetree)
- [Microsoft Office SVG picture storage](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-odrawxml/7e1f1524-1569-4aa2-a6c9-aab2d855bd48)
- [`python-pptx` image API](https://python-pptx.readthedocs.io/en/stable/api/image.html)
