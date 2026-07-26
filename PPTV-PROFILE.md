# PPTV: A PowerPoint Vector Profile

**Status:** design proposal; no executable implementation yet

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

## The parallel with Markdown and DOCX

```text
document.md          -> md2docx.py    -> document.docx
diagram.pptv.svg     -> pptv2pptx.py  -> diagram.pptx

document.docx        -> docx2md.py    -> document.md
diagram.pptx         -> pptx2pptv.py  -> reviewed changes to diagram.pptv.svg
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

One `.pptv.svg` represents one slide in version 1. A future deck manifest may
order several slide sources, but multi-slide composition does not belong
inside SVG.

## Conformance marker

The filename is a convention, not proof of conformance. A PPTV source declares
its profile version and physical slide size on the root SVG:

```xml
<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 1600 900"
  data-pptv-version="1"
  data-pptv-slide-width="13.333333"
  data-pptv-slide-height="7.5"
  data-pptv-slide-unit="in">
  ...
</svg>
```

The `viewBox` is mandatory and defines the authoring coordinate system. The
physical dimensions define the PowerPoint slide. Their aspect ratios must
match within a documented tolerance.

## Author annotations

Each object emitted into PowerPoint has:

- a unique standard SVG `id`;
- `data-pptv-role`, describing its semantic PowerPoint role; and
- `data-pptv-export`, declaring its representation.

Version 1 roles:

| Role | Meaning |
|---|---|
| `shape` | Editable visual geometry |
| `text` | Editable, searchable text |
| `connector` | A line expressing a relationship |
| `group` | An authored collection with one parent position |
| `asset` | Artwork treated as one object |

Version 1 export modes:

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

## Normative z-order model

PPTV version 1 uses **SVG DOM order as the only canonical z-order**.

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

### Reverse ordering rules

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
  "op": "move_after",
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

The strict version 1 native surface should be intentionally small:

| SVG source | Native PowerPoint result |
|---|---|
| `rect` | Rectangle or rounded rectangle |
| `circle`, `ellipse` | Ellipse |
| `line` | Line or connector |
| `polyline` | Multi-segment line when supported without approximation |
| `text`, constrained `tspan` | Text box and paragraphs/runs |
| constrained `g` | Native group |
| `image` with a local PNG/JPEG | Picture |

Complex `path`, `polygon`, clipping, masking, filters, patterns, blend modes,
text on a path, and arbitrary transforms are not silently approximated.
Authors place those features inside an object exported as `svg`, or validation
fails.

Version 1 should accept:

- presentation attributes and inline `style`;
- static local assets whose hashes can be recorded;
- explicit translate, scale, and rotation transforms that can be flattened
  deterministically; and
- direct text plus constrained `tspan` line and run formatting.

Version 1 should reject:

- external stylesheets or remote assets;
- scripting, animation, and event handlers;
- `foreignObject`;
- path-outlined text declared as editable;
- percentage geometry that depends on browser layout;
- ambiguous or duplicate IDs; and
- unsupported content outside an opaque asset boundary.

## Stable identity

The SVG `id` is the canonical semantic identity. The compiler writes the
PowerPoint Selection Pane name as:

```text
src.<svg-id>
```

The mapping is stable across regenerations. Office-generated numeric shape IDs
are implementation details and are never used for semantic matching.

Copying a shape in PowerPoint initially copies its semantic name. The reverse
tool treats duplicate `src.*` names as copied objects requiring newly assigned
SVG IDs before a new baseline can be established.

## Forward compiler behavior

The proposed command surface mirrors `md2docx.py`:

```bash
python3 pptv2pptx.py --check diagram.pptv.svg
python3 pptv2pptx.py diagram.pptv.svg
python3 pptv2pptx.py -o out/ diagram.pptv.svg
python3 pptv2pptx.py --template corporate.pptx diagram.pptv.svg
```

The compiler:

1. validates the PPTV profile;
2. resolves and hashes every local dependency;
3. maps the SVG coordinate system to the declared slide size;
4. emits objects in normative DOM order;
5. writes stable object names;
6. creates a PNG fallback for every embedded SVG;
7. stamps source, profile, generator, and dependency provenance;
8. writes `diagram.pptv.map.json`;
9. validates the OPC package and stable-ID inventory; and
10. optionally renders and opens a temporary copy for native PowerPoint QA.

Strict behavior is a feature. Unsupported content produces an actionable
validation error naming the element and the nearest valid opaque boundary.
There is no silent fallback from `native` to raster.

## Reverse inspector and patcher

The proposed reverse command requires both the edited presentation and its
canonical source:

```bash
python3 pptx2pptv.py diagram.edited.pptx \
  --source diagram.pptv.svg \
  --report diagram.pptv.patch.json

python3 pptx2pptv.py diagram.edited.pptx \
  --source diagram.pptv.svg \
  --apply
```

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

## Proposed Python structure

The repository can retain paired entry points while sharing a small internal
model:

```text
pptv.py             # profile parser, validation, mapping, and diff model
pptv2pptx.py        # forward CLI
pptx2pptv.py        # reverse CLI
```

`python-pptx` can provide native shapes, text, and presentation properties.
A bounded Open XML helper will likely be needed for embedded SVG, its PNG
fallback, stable metadata surfaces, and any connector behavior not exposed by
the public API.

## Test strategy

A `kitchen-sink.pptv.svg` fixture should exercise every supported object,
export mode, group scope, and z-order transition.

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

## Promotion to an implementation contract

Before executable PPTV code lands, the normative source surface, ordering
rules, identity rules, error behavior, and round-trip guarantees should move
into `architecture/CONTRACT-C4-PPTV-PROFILE.1.0.md`.

This proposal should remain the design rationale and author-facing overview.
The contract should become the versioned behavioral authority.

## References

- [W3C SVG 2 rendering model](https://www.w3.org/TR/SVG/render.html)
- [Microsoft PowerPoint shape z-order](https://learn.microsoft.com/en-us/office/vba/api/powerpoint.shape.zorder)
- [PresentationML shape tree](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.shapetree)
- [Microsoft Office SVG picture storage](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-odrawxml/7e1f1524-1569-4aa2-a6c9-aab2d855bd48)
- [`python-pptx` image API](https://python-pptx.readthedocs.io/en/stable/api/image.html)
