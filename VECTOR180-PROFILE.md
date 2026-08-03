# Vector180: Current PowerPoint Vector Profile

**Status:** 0.1 standalone diagram atom, HTML deck aggregation, C5 2.0 typed
source-preserving edits plus one exact reviewed connector clone, C6
resolution/hydration, browser conformance, writable trusted editor, C9 explicit
atom placement/baseline, C10 2.0 proof-carrying reconciliation, and C11 1.2
browser/Quick Look plus exact-path native no-op lifecycle evidence implemented;
C7 through C11 retain their remaining promotion gates; 0.1.1 text resilience
is banked design only

Vector180 is the current implementation name for a constrained, destination-neutral
SVG authoring profile with deterministic editable-PowerPoint conversion as one
first-class adapter. A conforming source uses the compound extension
`.vector180.svg`:

```text
diagram.vector180.svg
```

The file remains ordinary, renderable SVG. It is the default canonical source
for an independent diagram, figure, reusable visual, or slide-sized canvas—not
merely an interchange staging file for PowerPoint. The additional name and
attributes tell tools how the author intends each object to behave and how a
Vector180 compiler may represent it in PowerPoint.

Every canonical standalone atom is hydration-complete: all supported geometry,
concrete styling, hard-line text, stable identity, and references required for
interpretation are local. A suite of visuals remains a set of atoms. HTML is
reserved for a real deck/report or deck-only behavior; generated editor and C9
composition HTML are derived artifacts.

This proposal turns the reconstruction method in
[`SVG-TO-EDITABLE-PPTX.md`](SVG-TO-EDITABLE-PPTX.md) into a potential
machine-readable source contract. It deliberately places responsibility on
the SVG author rather than asking a converter to infer which objects should
be editable.

## Implemented boundary and version vocabulary

C4 now loads either one standalone `Vector180Atom` or one HTML `Vector180Deck` in the
single TypeScript package `@office180/vector180@0.1.0-alpha.5`. C5 2.0 preserves
direct-text and deck theme/order transactions, typed operations over existing
safe source representations, and at most one exact same-parent connector clone
inside one `vector180-patch/0.1` envelope.
C6 resolves both without a browser: a diagram has an arbitrary explicit
logical canvas; a deck keeps the fixed physical PowerPoint profile. C7
implements a narrow deterministic fresh-PPTX canary for the deck form only. C9
implements a separate one-atom placement, composition, paired PPTX, and
source-map baseline. C10 reconciles only edited descendants authenticated by
that C9 baseline. The executable format identifier is root
`data-vector180-version="0.1"` for a diagram or manifest `vector180: "0.1"` mirrored by
HTML `data-vector180-version="0.1"`. Contract revisions, package version, viewer
`vector180-browser/0.1`, and agent profile `vector180-agent/1` are independent version
lines.

[`VECTOR180-TEXT-RESILIENCE-0.1.1.md`](VECTOR180-TEXT-RESILIENCE-0.1.1.md)
banks the next source/profile capability name. It does not change the current
accepted marker, npm package version, contracts, schemas, examples, or compiler.
The future 0.1.1 source may declare paragraph intent while keeping explicit SVG
lines authoritative, then choose measured expanded-frame `reliable` or authored
tight-frame `editable` PowerPoint export. Current tools must reject that syntax
until successor contracts and fixtures land.

The older “Vector180 version 1” language below describes the proposed complete SVG
to PowerPoint profile, not an implemented file-version alias. In 0.1:

- a self-contained `.vector180.svg` atom is XML-well-formed, semantically loaded
  directly, and has an arbitrary finite-positive `viewBox`;
- one self-contained `.vector180.html` deck is loaded in manifest slide order;
- external manifests remain recognition/inventory-only;
- its slide SVGs require one direct root, matching IDs, and C6's exact
  `0 0 1600 900` `viewBox`;
- C4 recognizes annotated `rect`/`circle`/`ellipse` shapes, `text`,
  `line`/`polyline` connectors, `g` groups, and `image`/`g` assets;
- C6 resolves rectangles, circles/ellipses, straight `line` connectors,
  translated native groups, explicit hard-line text, and opaque SVG bounds;
  `polyline` and dependency-backed raster assets remain outside its resolved
  model;
- C7 compiles only its still narrower native rectangle, ellipse, straight-line,
  translated-group, and one-hard-line text subset;
- exact source bytes, including a leading BOM, stable IDs, annotations, and DOM
  order are retained;
- direct-text replacement is writable in either form; active-theme selection
  and complete slide reorder remain deck-only;
- C5 2.0 additionally supports old-value-preconditioned rect/ellipse geometry,
  straight-line endpoints, explicit group translation, direct one-line text
  frame/anchor, within-parent full child order, safe deletion, and concrete
  direct presentation-attribute style, plus exactly one same-parent native
  straight connector clone with a fresh ID and complete explicit state/order;
- a shared browser kernel, exact-source session, and writable trusted editor
  pack exist for both forms;
- a fully resolvable deck slide can be hydrated into an independent SVG atom;
- the strict C7 primitive subset compiles from a deck through `pptx-canary`;
- one supported standalone atom can be explicitly composed and compiled under
  C9 with identity or aspect-preserving uniform placement into a deterministic
  one-slide deck plus paired PPTX/map;
- C10 2.0 can inspect an authenticated edited descendant, prove named
  native-save normalizations, propose only supported typed C5 reverse
  operations, and accept a strict reviewed resolution for one unambiguous
  copied connector; and
- C11 can capture trusted standalone SVG in pinned Chromium, capture DOCX/PPTX
  Quick Look smoke, validate evidence envelopes, compare images under declared
  deterministic policies, and run a bounded exact-path native no-op
  save/close/reopen lifecycle.

Geometry/CSS semantics, physical slide size, native groups/connectors, and
explicit text frames are implemented within C6. C7 generates native PPTX for
its strict subset and passes schema, independent reopen, and minimal-fixture
PowerPoint open/render smoke. Browser C4/C6 parity and explicit-byte C8
calibration are checked across Chromium, Firefox, and WebKit. C9/C10 provide
the bounded mapped atom round trip described below. External libraries, rich
`tspan` editing, browser controls for the wider C5 vocabulary, C9 deck input,
opaque/raster asset compilation, arbitrary PPTX import, quantitative
cross-renderer fidelity, checked human review, and representative native PPTX
edits remain open. Word and PowerPoint 16.111.2 exact-path no-op
save/close/reopen passed on 2026-08-02 but do not satisfy those gates.

## The parallel with Markdown and DOCX

```text
document.md          -> md2docx.py         -> document.docx
diagram.vector180.svg     -> trusted editor     -> diagram.vector180.svg
deck.vector180.html       -> C7 PPTX canary     -> deck.pptx
diagram.vector180.svg     -> C9 explicit compile -> diagram.pptx + map

document.docx        -> docx2md.py         -> document.md
diagram.edited.pptx  -> C10 + source/map   -> reviewed Vector180 patch
```

The common architecture is:

1. a canonical, inspectable source;
2. a deterministic forward mapping;
3. stable semantic identities in the Office artifact;
4. a source hash and mapping record;
5. reverse inspection against a known baseline; and
6. explicit handling of changes that cannot be inverted safely.

Vector180 cannot promise unrestricted inversion. PowerPoint permits users to draw,
group, convert, and replace arbitrary objects. Its reverse tool therefore
produces a reviewable patch only for changes covered by the bounded profile;
source application remains a separate explicit transaction.

## File family

For a canonical source named `diagram.vector180.svg`, the current bounded artifact
family is:

```text
diagram.vector180.svg            # canonical authored source
diagram.editable.html       # generated trusted editor around inert exact bytes
diagram.composed.vector180.html  # C9 generated one-atom/one-slide deck
diagram.pptx                # C9 explicit-placement native baseline
diagram.vector180.map.json       # C9 generated hash-bound source/object baseline
diagram.edited.pptx         # optional human-edited branch
diagram.reconciliation.json # C10 read-only report
diagram.vector180.patch.json     # C10 proposal when every change is patchable
```

One `.vector180.svg` is the implemented standalone atom. It is not a degenerate
one-slide deck and has no manifest, theme, slide identity, or physical size.
The implemented whole-deck aggregation is `.vector180.html`, whose leading manifest
orders inert slide SVG templates. External multi-file composition remains
roadmap.

## Conformance marker and initial canvas decision

The filename is a convention, not proof of conformance. A standalone atom
requires explicit root identity/version/namespace plus any finite-positive
logical viewBox, for example:

```xml
<svg
  id="system-overview"
  xmlns="http://www.w3.org/2000/svg"
  viewBox="-100 -50 1200 800"
  data-vector180-version="0.1">
  ...
</svg>
```

It does not infer inches or EMUs. By contrast, every slide inside the
implemented HTML/C7 deck profile must use `viewBox="0 0 1600 900"`. C6 maps
those `1600 × 900` source units exactly to
PowerPoint Widescreen
`12192000 × 6858000` EMUs (`13⅓ × 7.5 in`), or `7620` EMUs per source unit.
Every slide uses that one deck-wide size.

The first compiler rejects another viewBox/aspect ratio rather than stretching
or inferring it. A future profile may add named alternate deck sizes. It must
not introduce per-slide sizes or silently change existing geometry.

The implemented C9 atom-to-deck bridge is explicit rather than inferred. Its
composition declaration names the atom hash, target rectangle, and
transform/scaling policy. Identity requires the target dimensions to equal the
atom viewBox extent after explicit origin translation. The only non-identity
policy is uniform scale plus translation when aspect ratios match; mismatch
fails closed. Silent stretch, crop, letterbox, and physical-size inference
remain prohibited.

The output is a new deterministic self-contained one-slide deck that
independently reloads through C4 and resolves through C6. C9 does not add an
atom to an existing deck and currently refuses deck input, external
dependencies, multiline text, opaque SVG/raster assets, rounded rectangles,
and non-unit opacity. Broader composition remains separate from 0.1.1 text
resilience.

## Author annotations

Each object emitted into PowerPoint has:

- a unique standard SVG `id`;
- `data-vector180-role`, describing its semantic PowerPoint role; and
- `data-vector180-export`, declaring its representation.

The implemented 0.1 loader and proposed complete profile share these roles:

| Role        | Meaning                                         |
| ----------- | ----------------------------------------------- |
| `shape`     | Editable visual geometry                        |
| `text`      | Editable, searchable text                       |
| `connector` | A line expressing a relationship                |
| `group`     | An authored collection with one parent position |
| `asset`     | Artwork treated as one object                   |

They share these export modes:

| Export   | Behavior                                                             |
| -------- | -------------------------------------------------------------------- |
| `native` | Reconstruct as native PowerPoint text, geometry, connector, or group |
| `svg`    | Embed the annotated subtree as one SVG picture                       |
| `raster` | Render the annotated subtree as one raster picture                   |
| `ignore` | Do not emit the subtree                                              |

Example:

```xml
<g
  id="stage.2"
  data-vector180-role="group"
  data-vector180-export="native">

  <rect
    id="stage.2.panel"
    data-vector180-role="shape"
    data-vector180-export="native"
    x="100" y="200" width="400" height="240"
    rx="8"
    fill="#ffffff"
    stroke="#d7dcda"/>

  <line
    id="stage.2.input"
    data-vector180-role="connector"
    data-vector180-export="native"
    data-vector180-from="stage.1"
    data-vector180-to="stage.2"
    x1="40" y1="320" x2="100" y2="320"
    stroke="#1c302b"/>

  <text
    id="stage.2.title"
    data-vector180-role="text"
    data-vector180-export="native"
    x="132" y="262">
    Human approval
  </text>

  <g
    id="stage.2.icon"
    data-vector180-role="asset"
    data-vector180-export="svg">
    <!-- Complex paths remain vector artwork inside one PowerPoint object. -->
  </g>
</g>
```

Children of an opaque `svg`, `raster`, or `ignore` subtree do not need Vector180
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

Vector180 therefore does not define `data-vector180-z`, numeric layer indexes, or a CSS
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

### Reverse ordering rules (implemented bounded slice)

The C9 map records the stable-ID sequence for each parent scope. C10 compares
those sequences, not raw numeric positions:

```json
{
  "parentId": "architecture",
  "order": [
    "slide.background",
    "layer.connectors",
    "stage.1",
    "stage.2",
    "header.title"
  ]
}
```

When the edited PPTX contains exactly the same direct children under exactly
the same mapped parent, an intentional reorder becomes one complete,
old-value-preconditioned C5 2.0 permutation:

```json
{
  "op": "set-child-order",
  "parentId": "architecture",
  "oldOrder": [
    "slide.background",
    "layer.connectors",
    "stage.1",
    "stage.2",
    "header.title"
  ],
  "order": [
    "slide.background",
    "layer.connectors",
    "stage.2",
    "stage.1",
    "header.title"
  ]
}
```

C5 reorders the corresponding existing SVG child slots while retaining
interstitial source bytes. C10 does not emit an order operation when that
parent also has a deletion. Insertions, copied objects, cross-parent moves,
regrouping, flattening, and ungrouping are review-required or refused rather
than inferred from position.

PowerPoint shape-tree order can also influence keyboard navigation order.
Vector180 authors should keep semantic progression and visual layering compatible
where practical; version 1 does not introduce a second accessibility-order
channel.

## Supported source surface

The complete strict native surface should remain intentionally small:

| SVG source                       | Native PowerPoint result                                |
| -------------------------------- | ------------------------------------------------------- |
| `rect`                           | Rectangle or rounded rectangle                          |
| `circle`, `ellipse`              | Ellipse                                                 |
| `line`                           | Line or connector                                       |
| `polyline`                       | Multi-segment line when supported without approximation |
| `text`, constrained line `tspan` | Explicit-line text box                                  |
| constrained `g`                  | Native group                                            |
| `image` with a local PNG/JPEG    | Picture                                                 |

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

## Explicit-line text model (C6; C7/C9 direct-line subset)

Executable 0.1 native Vector180 text is positioned authoring data, not a browser
paragraph-layout request.

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

The current C7 and C9 writers accept exactly one hard line and emit one
explicit paragraph with contracted/zero margins, `wrap="none"`, and
`a:noAutofit`. Concrete source syntax for frame/bounds and line step is defined
by C6. Both writers reject multiline text until its native mapping and fidelity
fixtures land.

The banked 0.1.1 extension adds intent, not a second text authority. A planned
`data-vector180-text-intent="paragraph"` object still serializes every visible line
explicitly. Its future PowerPoint mapping retains authored breaks and
`a:noAutofit`; `reliable` derives an output-only wider frame from exact-font
evidence, while `editable` retains the authored tight frame. A baseline-free
importer may later tolerate a bounded measured overrun before creating a new
line, preferring a diagnosed small bleed to a surprise wrap. The exact default,
up to a banked maximum of `2ch`, remains pending native calibration. None of
these behaviors is part of the current C6/C7/C9 surface.

## Stable identity

The SVG `id` is the canonical semantic identity in the implemented source
kernel. C7 and C9 write the PowerPoint Selection Pane name as:

```text
src.<svg-id>
```

That mapping is stable across regenerations. The C9 map records both source ID
and emitted name, and C10 accepts only a unique mapped `src.*` name.
Office-generated numeric shape IDs are implementation details and must never
be used for semantic matching.

Copying a shape in PowerPoint initially copies its semantic name. Duplicate
`src.*` names refuse by default. C10 2.0 has one narrow recovery path: exactly
one copied mapped straight connector may receive a reviewer-chosen fresh SVG ID
when exactly one of its two occurrences remains baseline-equivalent and the
strict resolution binds all hashes, fingerprints, source references,
parent/order, endpoints, and style. Every other copied object remains refused
until canonical source is authored explicitly.

## Forward compiler behavior

The TypeScript CLI extends the implemented `vector180` command rather than
introducing independent Python semantics:

```bash
vector180 new atom --output diagram.vector180.svg \
  --id diagram --title "Diagram" --width 1200 --height 800
vector180 new deck --output deck.vector180.html --title "Deck"
vector180 validate deck.vector180.html
vector180 validate diagram.vector180.svg
vector180 resolve deck.vector180.html
vector180 metadata diagram.vector180.svg --format json
vector180 metadata-compare before.vector180.svg after.vector180.svg \
  --template-basis template-basis.svg --format json
vector180 diff before.vector180.svg after.vector180.svg --format json
vector180 migrate legacy.pptv.svg --output migrated.vector180.svg \
  --report migration.json
vector180 text-fit diagram.vector180.svg
vector180 extract deck.vector180.html --slide architecture --output architecture.vector180.svg
vector180 pptx-canary deck.vector180.html --output deck.pptx
vector180 compose diagram.vector180.svg --placement X,Y,W,H \
  --policy identity --output diagram.composed.vector180.html
vector180 compile diagram.vector180.svg --placement X,Y,W,H \
  --policy identity --output diagram.pptx --map diagram.vector180.map.json
```

Semantic validation, queries, direct-text patching, resolution, text-fit, and
editor-pack support either self-contained form. `text-fit` is a read-only
exact-font warning gate and never changes a line. Omitting `--font-map` and
passing `--font-map default` both select the verified packaged ABeeZee map; a
different value is an explicit caller-supplied map path. `metadata`,
`metadata-compare`, and `diff` operate on atoms only, and `migrate` is the
explicit legacy-PPTV-atom write boundary. `extract` resolves and
localizes deck context, then independently reloads/resolves the SVG candidate;
it is not a blind subtree copy. `pptx-canary` is deliberately deck-only,
strict, fresh-package, and template-free.

C9 `compose` and `compile` are deliberately standalone-atom-only. Both require
an explicit target rectangle. `identity` requires matching coordinate extents;
`uniform-scale-translate` is an explicit alternative only when source and
target aspect ratios match. `compose` emits a deterministic, independently
reloaded/resolved one-slide HTML deck. `compile` emits a paired PPTX and
`vector180-pptx-map/0.1` sidecar bound to the exact atom, composed deck, placement,
supported object baseline, canonical atom-metadata hash when present, and PPTX
hashes. Atom-only metadata is not copied into the generated HTML slide. Neither
command overwrites an existing destination.

The implemented C7 canary:

1. validates the Vector180 profile;
2. maps the exact `1600 × 900` coordinate system to the fixed 16:9 slide size;
3. emits supported native objects in normative DOM order;
4. writes stable object names and source/compiler provenance; and
5. validates its OPC graph before producing deterministic ZIP bytes.

The implemented C9 baseline reuses the strict C7 package graph for a narrower
one-atom capability:

1. authenticate and resolve the standalone atom;
2. apply only the declared identity or uniform placement;
3. create and independently reload/resolve the deterministic one-slide deck;
4. emit the supported native objects and complete object baseline map; and
5. bind exact atom, composed-deck, map, and PPTX identities.

C9 refuses HTML-deck input, multiline text, rounded rectangles, non-unit
opacity, opaque SVG/raster assets, and external resources. Template-backed
compilation, asset fallbacks, C9 deck input, and general PPTX generation remain
roadmap. None is performed implicitly by `pptx-canary` or `compile`. C11's
no-op bridge is a separate structural acceptance action; representative
PowerPoint editing and fidelity remain separate gates.

Strict behavior is a feature. Unsupported content produces an actionable
validation error naming the element and the nearest valid opaque boundary.
There is no silent fallback from `native` to raster.

## Reverse inspector and patcher (implemented bounded slice)

C10 reconciliation requires the edited presentation, exact canonical source,
and its C9 baseline:

```bash
vector180 reconcile diagram.edited.pptx \
  --source diagram.vector180.svg \
  --baseline diagram.vector180.map.json \
  --native-baseline diagram.native-save.pptx \
  --patch proposed.vector180.patch.json \
  --report reconciliation.json
```

C10 authenticates atom, composed-deck, map, placement, package, and edited-PPTX
lineage before comparing mapped `src.<stable-id>` names. A stale source,
tampered map, missing lineage, or missing identity fails closed rather than
falling back to numeric IDs, geometry, text, or z-order. A duplicate also
refuses by default. The result is `unchanged`, `patchable`, `review-required`,
or `refused`, with deterministic findings, candidate operations, normalization
proofs, and resolution options.

The implemented patchable subset is:

- direct single-hard-line text;
- existing `<rect>` and true `<ellipse>` geometry;
- existing straight `<line>` endpoints;
- explicitly represented group translation;
- direct one-line text frame plus horizontal anchor, retaining the source
  baseline offset;
- complete within-parent sibling permutations when that parent has no
  deletion;
- safe subtree deletion with surviving-connector checks; and
- complete concrete style values already represented as direct SVG
  presentation attributes.

Each difference becomes the smallest contracted, old-value-preconditioned
`vector180-patch/0.1` operation. Before returning `patchable`, C10 applies the whole
proposal to temporary source, reloads C4/C6, regenerates the exact C9 identity
or uniform placement, reinspects it, and requires supported structural and
semantic equality with the edited branch.

For exactly one duplicate mapped straight connector with exactly two
occurrences, C10 reports a composite fingerprint for each and compares them to
the authenticated baseline occurrence. It accepts a
`vector180-reconcile-resolution/0.1` document only when exactly one occurrence is
baseline-equivalent. The document must carry the exact
source/map/edited/comparison hashes, baseline and copied fingerprints,
reviewer-chosen fresh ID, explicit existing `fromId`/`toId`, same parent,
complete old/new sibling order, inverse endpoints, and complete style. Success
emits `vector180-patch/0.1` with exactly one `clone-connector`. Zero matches means
both copies changed or structure drifted; two matches is ambiguous. Both,
along with stale/incomplete review evidence or any other blocking finding,
refuse with no partial patch.

Circle-to-ellipse representation changes, implicit transforms, CSS rules,
inline/inherited style rewrites, rich text or multiple runs,
general insertion/duplication or ID allocation beyond that one connector
exception, reparenting, group scaling/flattening, opaque-asset edits,
unsupported Office effects, and arbitrary or baseline-free PPTX import remain
review-required, refused, or future work.

The command always writes its explicit report destination. It writes the
explicit patch destination only for a wholly `patchable` result. It never
modifies canonical source, map, baseline, or edited PPTX; applying an accepted
proposal is a separate `vector180 patch` transaction.

## TypeScript package boundary

The implementation deliberately uses one package:

```text
@office180/vector180
  core              exact source, scanner, semantic deck/diagram, hydration
  ops               projections and C5 patch transactions
  browser           shared conformance, editor session/app, exact-byte metrics
  node/cli           host I/O, trusted pack, fonts, C7/C9/C10 PPTX commands
```

Splitting CSS, browser, editor, or PPTX packages is deferred until distinct
consumers justify those dependency boundaries. Core, ops, and browser code
remain independent of filesystem, OOXML, and OpenDocKit APIs. The sibling
OpenDocKit checkout remains an optional independent reopen/inspection oracle,
not a runtime dependency or a replacement for exact Vector180 source authority.

## Test strategy

The current TypeScript and Playwright suites cover exact UTF-8/UTF-16 ranges,
BOM/CRLF/non-BMP behavior, XML-well-formed and non-executing scans,
deck/diagram hierarchy, supported/opaque objects, projections and queries,
artifact-specific atomic patches, hydration, trusted-editor writes, and
explicit CLI output. A checked standalone kitchen-sink/invalid corpus produces
normalized-identical C4/C6 JSON in Node and all three browser engines.

C5 2.0 tests cover every typed operation, mandatory old-value failures, unsafe
representation/source-range refusals, connector-safe deletion, exact-template
same-parent connector cloning, overlap atomicity, and exact preservation. C9
fixtures cover identity and uniform placement, aspect/capability refusal,
deterministic composition/PPTX/map, complete mapped inventory, OPC/schema
checks, and independent reopen. C10 fixtures edit the supported DrawingML
values, prove named native-save normalizations, exercise lineage/identity/
structure refusals and all reviewed connector-match outcomes, then prove
supported proposals through C5 application and exact-placement C9
regeneration/reinspection. C11 fixtures cover trusted SVG browser capture,
DOCX/PPTX Quick Look smoke, deterministic comparisons, bounded native bridge
behavior, evidence binding/validation, unavailable/manual states, and privacy
checks.

The minimum automated cascade is:

1. profile validation;
2. forward package generation;
3. OPC and relationship validation;
4. expected-versus-actual stable-ID inventory;
5. expected object sequence in every scope;
6. render comparison;
7. supported edited-PPTX fixtures for text, geometry, style, deletion, and
   ordering;
8. reverse patch generation;
9. patch application to a temporary SVG;
10. regeneration and structural/render comparison; and
11. desktop PowerPoint representative edit/save/reopen validation.

The implemented C9/C10 automated cascade reaches structural regeneration and
reinspection. The C11 bridge passed exact-path no-op save/close/reopen for Word
and PowerPoint 16.111.2 on 2026-08-02. Browser/Quick Look and no-op lifecycle
evidence do not substitute for the remaining quantitative cross-renderer,
human-review, representative-editability, or native-text gates.

## Contracts and remaining promotion

C4 through C12 are the current behavioral authorities and remain
`in-progress`. Their implemented bounded surfaces cover source/read, typed
exact-source patching, resolution/hydration, the strict deck-only fresh-PPTX
canary, non-mutating exact-font preflight, explicit standalone-atom
composition/PPTX/map baselines, authenticated reconciliation,
renderer-specific visual/native evidence, and stable-ID atom diff. Their stated
native-calibration, quantitative-comparison, human-review,
representative-editing, and other promotion gates remain open. This document
remains the author-facing rationale and broader roadmap.

Vector180 source/profile 0.1.1 text resilience remains banked prose until C4 source,
C5 patch, C6 resolved, C7/compiler, C8 evidence, and separate future-import
contracts and fixtures promote it. Its name is independent from
`@office180/vector180@0.1.0-alpha.5`, current C4-C10 contract revision `2.0`,
C11 revision `1.2`, C12 revision `1.0`, and the executable source/profile
version `0.1`.

Before claiming general editable PowerPoint conformance, extend C9 beyond its
one-atom subset only through matched C5/C10 fixtures, add quantitative
browser/Office comparisons and evidence-bound human review, and pass native
PowerPoint representative edit/save/reopen. C11 has already proven exact-path
no-op save/close/reopen; that narrower evidence does not close this gate. C6/C7
already contract physical mapping, no-reflow intent, constrained CSS/theme
resolution, normalized
geometry/text frames, fresh package construction, stable object naming, and
minimal-fixture PowerPoint open without repair. C9/C10 add the bounded mapped
atom baseline and authenticated reverse proof; C11 keeps browser, Quick Look,
and native Office claims explicitly separate.

## References

- [W3C SVG 2 rendering model](https://www.w3.org/TR/SVG/render.html)
- [Microsoft PowerPoint shape z-order](https://learn.microsoft.com/en-us/office/vba/api/powerpoint.shape.zorder)
- [Microsoft PowerPoint slide sizes](https://support.microsoft.com/en-us/powerpoint/change-the-size-of-your-powerpoint-slides)
- [PresentationML shape tree](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.presentation.shapetree)
- [Microsoft Office SVG picture storage](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-odrawxml/7e1f1524-1569-4aa2-a6c9-aab2d855bd48)
- [`python-pptx` image API](https://python-pptx.readthedocs.io/en/stable/api/image.html)
