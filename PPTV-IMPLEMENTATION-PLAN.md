# PPTV Implementation Plan

**Status:** active delivery roadmap; first-class standalone diagrams, shared
browser conformance, the writable trusted editor MVP, C5 1.3 typed
native-object patches plus one exact reviewed connector clone, C9 explicit atom
composition/baselines, C10 1.2 proof-carrying reconciliation, and C11 1.1
browser/Quick Look plus exact-path native no-op lifecycle evidence are
implemented; the hydrated SVG atom is now the documented default source,
pre-production naming/lineage/diff gates remain open, C7 through C11 retain
their remaining promotion gates, and source/profile 0.1.1 text resilience is
banked but not implemented

**Decision date:** 2026-07-28

**Status refreshed:** 2026-08-02

**Sequence:** strict hydrated atom → trusted browser editor → early PPTX
canary → typed patch/atom baseline/reconciliation → pre-production
naming/lineage/diff gates → banked text-resilience contracts →
editor/compiler/evidence expansion

This plan turns the implemented C4 source kernel and C5 patch engine into a
small, reliable visual authoring system and editable PowerPoint compiler. It
intentionally favors deterministic behavior over broad SVG, browser, or Office
feature coverage.

## 1. Honest starting point

PPTV is already structurally well suited to live editing:

- exact source bytes and hashes remain authoritative;
- standalone `.pptv.svg` is a first-class semantic/editable atom rather than a
  synthetic one-slide deck;
- a fully hydrated standalone atom is the default canonical source for an
  independent diagram, figure, reusable visual, or slide-sized canvas;
- self-contained `.pptv.html` is the explicit aggregation, theme, viewer, and
  C7 presentation envelope for a real ordered deck/report, while C9 can
  explicitly generate one from a standalone atom when that aggregate is
  useful;
- stable SVG IDs identify objects across browser, agent, and Office views;
- the semantic tree preserves native group hierarchy;
- DOM sibling order is canonical z-order;
- roles distinguish shapes, text, connectors, groups, and assets;
- export modes distinguish native objects from atomic SVG/raster artwork; and
- all source writes are validated, atomic semantic transactions.

The current kernel now makes the narrow geometry/style/text claims defined by
the verified C6 contract. It resolves fixed-canvas deck primitives or an
arbitrary finite standalone-diagram viewBox, translated group bounds, connector
endpoints, explicit text frames and hard lines, constrained deck CSS/theme
tokens or diagram-local declarations, and provenance without a browser. One
deck slide can be hydrated into an independent `.pptv.svg` by dereferencing its
resolved styles and reloading it through the diagram path. C5 1.3 supports
old-value-preconditioned typed patches for existing rect/ellipse geometry,
line endpoints, explicit group translation, one-line text frame/anchor,
within-parent child order, safe deletion, and direct concrete
presentation-attribute style while preserving legacy 0.1 transactions. Its
`pptv-patch/0.3` envelope adds exactly one structural exception:
`clone-connector` copies one existing native straight connector into the same
parent with an explicit fresh ID, references, endpoints, style, and complete
sibling order. The browser editor still exposes direct text and deck
theme/order controls only; the wider C5 vocabulary is currently a
programmatic/CLI/reconciliation surface. Structured hard-line/rich-text
editing, general hit-testing, generic insertion or duplication, reparenting,
group scaling, and broad native PowerPoint fidelity remain outside the
implemented boundary.

C9 additionally turns one supported standalone atom into a deterministic
one-slide deck and paired PPTX/map through explicit identity or
uniform-scale-plus-translation placement. C10 authenticates an edited
descendant against that exact source/map/placement, records named proof for
accepted native serializer normalizations, emits only typed C5 proposals, and
proves a patchable result by temporary application, regeneration, and
reinspection. Duplicate identity refuses by default. C10 1.2 accepts a strict
hash/fingerprint-bound review document only when one of exactly two occurrences
of one mapped straight connector remains baseline-equivalent; the reviewer
supplies the fresh ID, explicit source references, hashes, occurrence
fingerprints, parent/order, inverse endpoints, and complete style. Zero or two
baseline matches, another finding, or stale/incomplete review data still
refuse with deterministic findings and resolution options. Neither surface is
deck-mode C9, arbitrary PPTX import, or a general converter.

That boundary is useful rather than alarming: the source and identity model do
not need redesign. The next work specializes and proves the intentionally small
visual surface.

### 1.1 Pre-production product gates

Three decisions should land before new source vocabulary is frozen:

1. choose the destination-neutral public format name. `Vector180` is the
   leading candidate; `PPTV` remains the current implementation and wire name
   until one atomic, compatibility-bounded migration is approved;
2. promote inert atom metadata for exact hydration/template lineage and a
   declared non-authoritative style-family hint. Visual similarity remains a
   derived C6 comparison rather than persisted truth; and
3. add a stable-ID semantic source comparison/report surface so an agent can
   distinguish changed meaning from lexical serialization noise without
   hunting through raw SVG.

Naming precedes the metadata schema so a pre-production implementation does not
freeze fresh `pptv-*` vocabulary immediately before renaming it. These gates do
not weaken the current strict source profile or delay direct atom-to-PPTX use.

## 2. Compiler-grade profile decisions

These decisions guide contracts and fixtures. C6 implements the bounded
resolved subset; later editor/compiler behavior is not implemented merely
because it appears in this roadmap.

### 2.1 One fixed 16:9 canvas first

The first HTML-deck/compiler profile uses:

```text
SVG viewBox:       0 0 1600 900
PPTX slide size:   12192000 × 6858000 EMU
Physical size:     13⅓ × 7.5 in
Scale:             7620 EMU per SVG unit
```

Every slide in an HTML deck uses that exact viewBox and one deck-wide PowerPoint
slide size. The compiler never stretches or infers a mismatched slide.
Standalone diagrams may declare any finite four-number viewBox with positive
width and height; C6 retains it as a logical canvas without EMU, inch, DPI, or
slide-size inference. C7 rejects diagrams even when their ratio is 16:9. The
separate C9 path accepts one only with an explicit widescreen target rectangle
and identity or aspect-preserving uniform placement.

Alternate ratios are a later versioned deck-level extension. They are not
per-slide, and the first implementation rejects them with a capability
diagnostic. A future named-size extension can add 4:3 or 16:10 without
introducing arbitrary unit/layout behavior.

### 2.2 Object and grouping boundaries

The author declares role and export intent; the resolver derives the concrete
kind from the SVG element.

| Source boundary | Semantic/editor selection boundary | PowerPoint intent / current C7/C9 status |
|---|---|---|
| `rect`, `circle`, or `ellipse`; role `shape`, export `native` | Independent native primitive | Native shape; strict subset implemented in C7/C9 |
| `text`; role `text`, export `native` | Explicit-line text frame | Native text box; one hard line implemented in C7/C9 |
| `line`; role `connector`, export `native` | Independent straight edge | Native line/connector; straight form implemented in C7/C9 |
| `g`; role `group`, export `native` | Addressable children plus one parent scope | Native PowerPoint group; translated subset implemented in C7/C9 |
| `g`; role `asset`, export `svg` | One atomic vector image; internals are opaque | SVG picture plus PNG fallback; roadmap |
| `image`; role `asset`, export `raster` | One atomic raster image | Native picture; roadmap |

A visual “box with text” is a native group containing a rectangle and a text
object. It is not one inferred compound object. A complex illustration is an
atomic SVG asset, not a native group whose paths happen to be difficult.

Native groups initially allow only a finite `translate(tx ty)` transform.
Children retain explicit local geometry and DOM order. C5 1.3 can replace an
already explicit translation but never inserts an implicit transform. Group
scale, rotation, skew, matrices, resize, flattening, group creation, and
ungrouping are deferred.

Atomic vector assets require explicit bounds on their opaque boundary; a future
compiler must not use browser `getBBox()` as canonical geometry. Their safe
internal SVG may be arbitrarily rich within the separately enforced static
resource policy, but it remains one selection and, if promoted through the
later native gates, one PowerPoint picture.

### 2.3 Executable 0.1 explicit-line text; never automatic reflow

The first native text model makes reflow impossible by design:

- font family, numeric font size, weight, style, color, anchor, frame, and line
  step resolve explicitly;
- direct text is exactly one hard line;
- multiline text uses direct, non-nested line `tspan` children;
- every line position is explicit and validated;
- the editor may present those lines in a paragraph-like multiline control, but
  commit serializes them back to explicit source lines;
- no automatic wrapping, autofit, shrink-to-fit, font-size adjustment, or
  geometry movement exists;
- editing longer text may produce an overflow diagnostic, but it never moves a
  word to another line; and
- styled runs, bullets, columns, text paths, and nested spans are deferred.

The current C7 and C9 writers emit exactly one explicit paragraph with
zero/contracted margins, `wrap="none"`, and `a:noAutofit`; they reject
multiline text. A later multiline writer must emit one explicit
paragraph/break per source hard line. A text frame resize changes only the
frame; it does not reflow or resize text.

Compiler-grade text uses one concrete resolved font family rather than a
browser fallback stack. The first profile supports the small set of font
weights/styles that map without approximation. C8 verifies shaped horizontal
advance only when the caller supplies an exact mapped font face, records its
byte/PostScript identity, and reports missing faces/styles/glyphs as
unverified. The editor pack can embed only those explicit bytes plus Fontkit
coverage, then load them under SHA-derived aliases for environment-labeled
browser measurement. Its overlay uses the worse current Node/browser status;
an edited line whose embedded Node evidence no longer matches is unverified.
C8 does not discover a system font or certify PowerPoint pixel parity. Native
calibration, PPTV/PPTX font embedding, and arbitrary web fonts remain deferred.

The banked source/profile 0.1.1 direction in
[`PPTV-TEXT-RESILIENCE-0.1.1.md`](PPTV-TEXT-RESILIENCE-0.1.1.md)
retains every explicit SVG line as source authority while adding optional
paragraph intent. Its planned PowerPoint export has two named policies:
`reliable` keeps explicit breaks and derives a measured expanded frame;
`editable` keeps the authored tight frame. Both remain native/editable and
non-autofitting. A bounded baseline-free import grace may prefer a diagnosed
small bleed over an unexpected wrap, but its exact default remains pending
native calibration. None of this syntax or behavior is accepted by the
current 0.1 loader, resolver, editor, C7 canary, or C9 compiler.

### 2.4 Small deterministic CSS composition

Viewer/editor chrome is fixed application CSS and is not part of deck themes.
Deck appearance uses:

1. one base/component style block;
2. one selected named theme containing a complete token map; and
3. optional element-local inline overrides.

The first resolver supports only:

- `:root` custom-property declarations in themes;
- simple single-class component rules;
- a small presentation-property allowlist such as solid `fill`, `stroke`,
  `stroke-width`, `opacity`, and explicit font properties;
- deterministic source-order cascade and token provenance; and
- ordinary element-local presentation attributes/inline declarations where
  the contracted browser cascade has an unambiguous result.

It rejects imports, network resources, `@font-face`, media queries, animations,
transitions, `!important`, pseudo selectors, layout-dependent percentages,
`calc()`, unsupported inheritance, gradients, filters, masks, and silent
fallbacks. Themes do not inherit or extend one another initially; each theme
must declare the same complete token schema.

The compiler consumes a pure resolved-style projection. It never calls
`getComputedStyle()` or executes the viewer runtime to discover meaning.

### 2.5 Trusted direct-open scope

The first browser product targets trusted, generated artifacts:

- a deterministic `*.editable.pptv.html` wrapper contains exact clean deck or
  diagram bytes, their SHA-256, and one fixed bundled editor application;
- the wrapper has no network dependencies and carries a strict CSP;
- the embedded canonical source is data, so viewer scripts and event-bearing
  markup are never executed by the editor;
- a source-hash mismatch makes the session read-only;
- editor save/export always produces exact clean canonical `.pptv.html` or
  `.pptv.svg`, never DOM serialization and never the wrapper;
- optional explicitly granted file saves compare the on-disk hash with the last
  successful editor save before every subsequent overwrite; and
- invalid source shows diagnostics rather than a partially editable artifact.

Ordinary canonical decks may retain the fixed digest-verified direct-open
viewer. Both viewer and editor direct-open are explicitly trusted-source
features. Sandboxed untrusted intake is valuable later but is not a blocker for
the first editor/compiler.

### 2.6 Explicit non-goals

The first profile does not support slide transitions, animation, arbitrary
scripts, macros, formulas, charts, SmartArt/GraphML, media, notes, embedded
workbooks, automatic layout, automatic wrapping, autofit, arbitrary native SVG
paths, or arbitrary existing-PPTX import/editing.

Unsupported input fails with a precise diagnostic or must be placed inside a
declared opaque SVG/raster asset boundary. There is no silent native-to-raster
fallback.

### 2.7 Implemented atom-to-deck composition is explicit

C9 promotes the first composition bridge separately from the 0.1.1 text move.
It accepts exactly one self-contained standalone atom and requires its hash,
target placement, and transform/scaling policy. Identity requires the target
dimensions to equal the atom viewBox extent after explicit origin translation.
The only non-identity policy is explicit uniform scale plus translation when
the atom and target rectangle share an aspect ratio; mismatch fails closed.
It never silently stretches, crops, letterboxes, or infers physical size from
the atom's logical canvas.

The candidate is a new deterministic one-slide HTML deck with concrete values,
stable IDs, painter/group order, and a hash-bound composition declaration. It
must independently reload through C4 and resolve through C6. `compile` emits a
paired PPTX and map from that exact placement. C7 remains HTML-deck-only, while
the current C9 slice remains standalone-atom-only: adding atoms to existing
decks, deck-mode C9, qualified identities, external dependencies, multi-root
composition, and cycle rules remain future work.

## 3. Delivery sequence

Progress at the 2026-08-02 integration point:

- C4-C6 load and resolve both self-contained HTML decks and first-class
  standalone SVG diagrams without coercion. The shared browser kernel matches
  Node across minimal, kitchen-sink, and invalid-profile corpora in Chromium,
  Firefox, and WebKit.
- Deck-slide hydration/dereferencing produces a separately valid/resolvable SVG
  atom with stable IDs, hierarchy, painter order, geometry, and hard lines.
- The exact-source editor session and deterministic strict-CSP pack now provide
  writable deck/diagram controls, fresh literal-data projections, integrity
  fail-closed behavior, clean downloads, per-slide SVG extraction, exact
  undo/redo, and stale-safe optional file persistence. The UI controls remain
  direct-text/theme/order only even though C5 1.3 now exposes typed
  native-object operations to programmatic, CLI, and reconciliation callers.
- C7's deterministic primitive-only PPTX canary is implemented. It passes
  applicable ISO/ECMA schemas, independent OpenDocKit reopen, and native
  PowerPoint 16.111.2 open/PDF-render smoke without repair. The C11 bridge also
  passed an exact-path PowerPoint 16.111.2 no-op save/close/reopen on a mapped
  C9 artifact. It is not a general converter, representative-edit, or
  quantitative native-fidelity claim.
- C8's pure anchor-aware deck/diagram preflight, strict explicit font map,
  exact-byte Fontkit adapter, worked-deck regression, environment-labeled
  browser adapter, and conservative editor overlays are implemented. Native
  PowerPoint calibration keeps that contract `in-progress`.
- C5 1.3 preserves the complete `pptv-patch/0.1` behavior and adds opt-in
  `pptv-patch/0.2` operations for rect/ellipse geometry, line endpoints,
  explicit group translation, direct one-line text frame/anchor,
  within-parent full child order, safe deletion, and direct concrete native
  style. Every new operation requires complete old values and C4/C6
  revalidation. Opt-in `pptv-patch/0.3` adds exactly one
  `clone-connector` operation: an exact-template same-parent straight
  connector clone with a fresh ID and fully explicit semantic state/order.
- C9's bounded atom path explicitly composes identity or aspect-preserving
  uniform placement into a deterministic one-slide deck, then emits a paired
  native PPTX and complete hash-bound object map. Deck input, multiline text,
  opaque/raster assets, rounded rectangles, and non-unit opacity remain
  refused.
- C10 1.2 authenticates exact atom, composed-deck, map, placement, and PPTX
  lineage; accepts native-save drift only through named structural proofs;
  emits deterministic findings, blocked candidates, and resolution options;
  and proves patchable results by C5 application and exact-placement C9
  regeneration/reinspection. A strict reviewed resolution can recover exactly
  one same-parent connector copy when exactly one of two occurrences remains
  baseline-equivalent. Duplicate identity otherwise refuses, including zero or
  two matches, and all arbitrary/stale PPTX, missing identity, reparenting,
  group scaling, representation changes, implicit transforms, unsupported
  style rewrites, and unsupported constructs still fail closed.
- C11 1.1 implements deterministic trusted standalone-SVG browser capture,
  DOCX/PPTX Quick Look smoke, evidence-envelope validation/comparison, and a
  bounded non-interactive exact-path native Office bridge. On 2026-08-02 the
  bridge passed no-op save/close/reopen with Word and PowerPoint 16.111.2 while
  preserving DOCX provenance and C9 lineage. Quick Look remains preview
  evidence only, and the no-op bridge does not prove representative edits,
  native text calibration, cross-renderer fidelity, or checked human review.
- PPTV 0.1.1 paragraph intent, reliable/editable PPTX export, and conservative
  baseline-free import grace are banked design only. Current source/container
  identifiers, schemas, and examples remain `0.1`; C4/C6/C7/C8 remain at
  contract revision `1.1`, C5 is verified at `1.3`, C9 is `1.0`, C10 is
  `1.2`, C11 is `1.1`, C7-C11 retain their declared in-progress gates, and the
  npm package is
  `@office180/pptv@0.1.0-alpha.4`.

### Milestone 0 — C6 resolved-profile contract and fixtures (implemented subset)

Define the executable editor/compiler input before adding UI behavior.

Deliver:

- C6 profile/resolved-model contract;
- exact 16:9/viewBox mapping and mismatch diagnostics;
- discriminated geometry for supported primitives;
- native-group translation and world-bound rules;
- explicit text-frame and hard-line representation;
- constrained CSS/token resolver and provenance;
- explicit opaque-asset bounds;
- kitchen-sink and invalid-profile fixtures; and
- an ambiguity-free source/compiler index.

Exit gate:

- every supported value resolves without browser execution;
- every unsupported construct has a stable diagnostic;
- Node and browser produce identical normalized JSON for the fixture corpus;
- all current worked examples either conform or have an explicit normalization
  patch; and
- no physical-size, text-reflow, object-boundary, or style-authority question
  remains for the supported subset.

The listed gates pass for the current declared corpus and source-kind-specific
schemas. C6 remains intentionally bounded; adding a new primitive, resource, or
style behavior requires its own contract/fixture promotion rather than
best-effort browser fallback.

### Milestone 0.5 — Exact-font text-fit preflight (native gate open)

Catch authored hard-line overruns without introducing layout behavior.

Deliver:

- pure C8 preflight over the C6 resolved model;
- start/middle/end anchor-aware horizontal capacity;
- clear, near-limit, overflow, and unverified evidence;
- explicit exact font-map input with no discovery or substitution;
- byte/PostScript font identity, shaping, and missing-glyph evidence;
- CLI output and fail-closed automation behavior; and
- browser/editor warnings that remain secondary environment evidence.

The pure deck/diagram APIs, exact-font Node adapter, CLI, locked worked-deck
inventory, explicit-byte browser adapter, and environment-labeled comparison
are implemented. Editor packs optionally carry the exact selected font bytes,
hash/PostScript identity, precomputed coverage, and original Node line
evidence. The editor reports the worse Node/browser status and treats stale
Node evidence as unverified. Representative native PowerPoint calibration is
the remaining promotion gate. No gate may mutate source or infer a new line.

### Milestone 1 — Trusted browser editor MVP on existing C5 (implemented)

Build a useful editor before broad geometry authoring.

Deliver:

- deterministic `editor-pack` generation for trusted direct-open wrappers;
- slide rail, object tree, diagnostics panel, selection, and inspector;
- scriptless/isolated rendering from semantic projections;
- direct-text editing only;
- active-theme switching;
- manifest slide reordering;
- semantic undo/redo with exact before/after source states and hashes;
- explicit clean deck/diagram download;
- deck-only hydrated single-slide `.pptv.svg` download;
- optional user-granted File System Access save with stale-hash protection.

The canonical browser DOM is never saved. Live previews are disposable; every
commit goes through a C5 transaction and reloads through C4.

Exit gate:

- pack → open → edit → undo → redo → export → CLI validate → reopen passes;
- undo restores byte-identical BOM, newline, whitespace, and entity spelling;
- after loading the wrapper document, the editor performs no subresource or
  network fetch and never executes source runtime code;
- failed edits add no history entry and produce no partial source; and
- Chromium, Firefox, and WebKit agree on hashes, diagnostics, hierarchy, and
  clean-download behavior.

These gates pass for both the minimal deck and standalone diagram editor packs.
The real-HTTP matrix also proves integrity-mismatch read-only behavior, no
source-runtime execution, no editor subresource/network fetch, clean
download/reload, hydrated-slide reload, and stale on-disk save refusal. This
milestone does not include geometry/style/structure controls, structured
`tspan`/rich-text, token-rule, or general SVG editing.

### Milestone 2 — Early PPTX compiler canary (implemented; final fidelity gates open)

Do not wait for a feature-rich editor before testing the Office mapping. After
the editor lifecycle and resolved projection are real, compile a deliberately
small two-slide fixture.

Deliver:

- fresh deterministic OPC package, not mutation of a blank template;
- one blank master/layout and one built-in theme;
- 16:9 slide size;
- white or one resolved solid background;
- rectangles, circles/ellipses, straight connectors, translated native groups,
  and one-line native text;
- direct RGB/font values;
- manifest slide order and DOM object order;
- `src.<stable-id>` PowerPoint object names;
- source hash, compiler version, resolved schema, and active-theme provenance.

C7 deliberately does not emit `.pptv.map.json` yet. Its native names,
deterministic numeric IDs, source hash, and custom package properties are the
canary evidence. C9 now supplies a versioned source/object baseline for its
separate standalone-atom path; it does not retroactively make C7 canary output
mapped. Accessibility descriptions are not used for machine metadata.

Exit gate:

- compiling twice in separate processes produces byte-identical packages;
- relationship/content-type validation and independent reopen pass;
- ISO/ECMA XSD validation or Open XML SDK validation reports zero schema errors;
- PowerPoint opens without repair, saves, and reopens;
- text remains non-wrapping/non-autofitting in emitted OOXML;
- stable names, parent scopes, z-order, and geometry survive reopen;
- Office-exported and trusted-browser renders pass locked visual thresholds and
  human review; and
- unsupported input returns diagnostics and no output artifact.

As of 2026-08-02, deterministic bytes, strict graph/ZIP checks, ISO/ECMA XSDs,
independent reopen, stable identity/order, no-wrap/no-autofit XML, capability
errors, and native PowerPoint open/render smoke pass. C11's ordinary in-place
Save path also passed exact-path no-op save/close/reopen in PowerPoint 16.111.2;
the earlier Open XML Save As experiment's zero-byte output remains rejected
evidence. Quantitative cross-renderer thresholds, representative native edits,
and evidence-bound human review remain.

### Milestone 2.5 — Banked 0.1.1 text-resilience contracts and fixtures

Promote paragraph editability without making renderer-chosen lines canonical.

Deliver, before runtime implementation:

- a C4 successor for source/profile `0.1.1`, explicit paragraph intent, and
  fail-closed version compatibility;
- typed C5 `set-text-lines` and text-intent behavior, never a generic
  attribute writer;
- a versioned C6 projection carrying intent, authored frame, and explicit
  lines without performing layout;
- a C7/compiler successor defining deterministic multiline DrawingML,
  `reliable` expanded-frame and `editable` tight-frame policies, and output
  provenance;
- C8/native evidence sufficient to calibrate the reliability reserve while
  retaining C8's non-mutating boundary; and
- a separate future-import contract for exact measurement, segmentation,
  bounded overflow grace, evidence, and review behavior.

The planned grace remains in the closed range `0..2ch`; its exact `ch`
definition and default are not promoted until exact-font and native
PowerPoint fixtures justify them. Explicit DrawingML breaks are always
preserved. Baseline-aware reconciliation retains source/map hard lines and
does not invoke the import heuristic.

Exit gate:

- the current 0.1 corpus and public behavior remain unchanged;
- new 0.1.1 source is rejected by old tools and interpreted only by a
  capability-declaring implementation;
- serialized SVG line membership remains deterministic in every mode;
- both PPTX policies preserve explicit breaks and never autofit;
- `reliable` derived frames are exact-evidence-bound and source-neutral;
- grace-accepted bleed remains visible as overflow evidence;
- unverified fonts, glyphs, or segmentation fail closed for automation; and
- schema, deterministic-package, independent-reopen, browser/Office render,
  and native PowerPoint open/save/reopen fixtures pass.

### Milestone 3 — Typed native-object patches and atom compiler baseline

The implemented bounded slice promotes typed operations without a generic
`set-attribute` escape hatch. C5 1.3 retains the 0.2 operations:

- kind-specific `set-object-geometry` for existing `<rect>` and true
  `<ellipse>` representations;
- `set-connector-endpoints` for existing straight `<line>` connectors;
- `set-group-translation` only when an explicit source transform already
  exists;
- `set-text-frame` for direct one-hard-line text, retaining its authored
  baseline offset;
- `set-child-order` as one complete within-parent permutation;
- `delete-object` with exact-parent/order and surviving-connector safety; and
- `set-native-style` only for complete concrete values already represented by
  direct SVG presentation attributes; and
- one 0.3 `clone-connector`, which exact-clones an existing childless native
  straight connector into the same parent only with a fresh ID, explicit
  references/endpoints/style, and complete old/new sibling order.

Every operation carries complete old-value preconditions, edits only existing
safe source ranges, and reloads through C4/C6 before success. Circles are not
rewritten as ellipses, implicit transforms or attributes are not inserted, and
CSS/inline/inherited styles are not rewritten. Legacy `pptv-patch/0.1`
transactions remain compatible. Browser drag/resize/style controls have not
yet been built over this vocabulary.

The planned `set-text-lines` operation remains deliberately unimplemented
because source/profile 0.1.1 paragraph intent and multiline compiler behavior
are still banked. Apart from the exact one-connector same-parent clone,
insertion, duplication, group creation/ungrouping, reparenting, group
scale/rotation, and their canonical structural serialization remain deferred;
safe deletion is no longer in that list.

C9 is the corresponding second compiler baseline for one standalone atom. It:

- composes an explicit identity or aspect-preserving uniform placement into a
  newly validated one-slide deck;
- compiles the C7 native rectangle, circle/ellipse, straight-connector,
  translated-group, and one-hard-line text subset;
- emits a paired complete map bound to the exact atom, composed-deck, placement,
  native objects, and PPTX hashes; and
- refuses multiline text, rounded rectangles, non-unit opacity, opaque/raster
  assets, deck input, or any unsupported source before publishing artifacts.

The typed-operation, exact-preservation, deterministic composition,
map-inventory, strict OPC, independent-reopen, C10 regeneration, and C11
exact-path no-op native-save fixtures pass. Browser hit-testing/gesture
controls, additional compiler features, quantitative cross-renderer
comparison, representative native edits, and human review remain separate
gates.

### Milestone 4 — Complete the supported editor/compiler surface (partial)

Expand only where the same conformance fixture works in browser and PowerPoint:

- solid shape styling and approved rounded rectangles;
- straight connectors and arrowheads;
- native translated groups;
- explicit multiline text and approved font styles;
- atomic SVG/raster assets;
- theme token editing after provenance is implemented;
- C9 standalone-atom source-map generation and verification (implemented); and
- slide/deck packaging across the worked examples.

The bounded C7/C9/C10 Node implementations currently remain in
`@office180/pptv`; core, ops, and browser code remain free of OpenDocKit,
filesystem, and OOXML dependencies. A separate optional PPTX adapter should
exist only when independent consumers justify that package boundary.

Exit gate:

- every supported worked example can be edited in the browser, exported,
  compiled, reopened, and visually compared;
- generated objects remain independently editable according to their declared
  role/export boundary; and
- no unsupported browser behavior is required to compile a deck.

### Milestone 5 — OpenDocKit collaboration and production hardening

Use OpenDocKit as an inspection/render oracle and selectively improve reusable
foundations:

- deterministic, source-free `OpcPackageBuilder`;
- presentation-specific fresh `PptxPackageBuilder`;
- valid PresentationML text synthesis and explicit EMU geometry;
- public stable-name/extension handling;
- real DOM/edit/save/reload text fidelity tests;
- public SVG interaction primitives where they help both projects; and
- parser/render package boundaries that avoid the current mandatory
  `pdf-signer` and license-metadata conflict.

Native PowerPoint remains the final compatibility/rendering authority.
OpenDocKit supplies fast structural regression coverage, not canonical PPTV
semantics.

### Milestone 6 — Baseline-aware PowerPoint reconciliation (bounded slice implemented)

C10 now accepts exact standalone-atom source, its complete C9 map, and an edited
descendant PPTX. It authenticates atom, composed-deck, map, placement, and PPTX
lineage; matches unique `src.<stable-id>` names; and accepts native-save drift
only through named, evidence-bearing structural normalization rules. Its result
is `unchanged`, `patchable`, `review-required`, or `refused`.

The patchable slice carries direct one-line text, rect/true-ellipse geometry,
line endpoints, explicit group translation, one-line text frame/anchor,
concrete direct presentation-attribute style, safe deletion, and pure
within-parent sibling order into old-value-preconditioned `pptv-patch/0.2`
operations. `reconcile` writes a report and, only for wholly patchable results,
a reviewable patch. It never mutates source or PowerPoint; application remains
a separate `pptv patch` action.

Duplicate identity refuses by default. For exactly one duplicated mapped
straight connector with exactly two occurrences, C10 reports both composite
fingerprints and the baseline-match classification. It accepts
`pptv-reconcile-resolution/0.1` only when exactly one occurrence remains
baseline-equivalent and the review explicitly binds the source/map/edited/
comparison hashes, both occurrence fingerprints, fresh ID, source `fromId` and
`toId`, same parent, complete old/new order, inverse endpoints, and complete
style. That path emits `pptv-patch/0.3` with exactly one `clone-connector`.
Zero matches, two matches, stale review evidence, another duplicate, or any
other review/refusal finding produces no patch and retains rich deterministic
resolution options.

Before reporting `patchable`, C10 applies the full proposal to temporary source,
reloads C4/C6, regenerates the exact authenticated identity or uniform C9
placement, reinspects it, and requires supported semantic/structural equality
with the edited branch. It fails closed on stale/tampered lineage,
unresolved missing/copied identities, unsupported DrawingML, reparenting,
group scaling,
circle-to-ellipse representation changes, implicit transforms,
inline/inherited style rewrites, rich text, and unsafe source ranges.

Arbitrary or baseline-free PPTX import, general insertion/ID allocation beyond
the reviewed connector exception, and general Office edit recovery remain
separate future projects. C10 preserves mapped hard lines and never invokes the
banked 0.1.1 overflow-grace heuristic. C11's exact-path no-op native lifecycle
passes, while representative editing of a regenerated result, quantitative
cross-renderer comparison, and human review remain promotion gates.

## 4. Browser editor architecture

```text
exact embedded deck/diagram bytes + expected hash
  -> SourceProvider
  -> EditorSession
       -> C4 immutable load
       -> semantic intent dispatcher
       -> C5 1.3 validate/apply (`pptv-patch/0.1`, `/0.2`, or `/0.3`)
       -> exact source/hash history
  -> JSON-safe projections
       -> conditional navigation / tree / inspector / diagnostics
       -> isolated supported-SVG viewport
       -> conservative Node/browser C8 evidence
  -> PersistenceAdapter
       -> clean download
       -> hydrated deck-slide SVG download
       -> explicitly granted file handle
```

The first implementation remains inside `@office180/pptv`:

- `browser/session` owns same-kind source/document, selection, dirty state, and
  history;
- `browser/runtime` and the deterministic browser kernel expose shared
  C4/C5/C6 conformance surfaces;
- `browser/text-measurer` loads explicit bytes through `FontFace` and captures
  engine/version-labeled C8 evidence;
- `browser/editor-app` currently owns supported-SVG reconstruction, controls,
  persistence, and downloads without treating those derived DOM nodes as
  source; and
- Node `editor-pack` validates, resolves, precomputes exact-font evidence, and
  generates the wrapper.

The current MVP deliberately keeps this small rather than inventing
`render`/`viewport`/`intents` packages before independent consumers exist.
The portable session/kernel can apply the contracted C5 1.3 vocabulary, but
the current editor application does not yet expose geometry, endpoint, frame,
style, order, or deletion gestures.

Exact source states back undo/redo because an inverse semantic operation cannot
reconstruct lexical choices such as entity spelling. History is bounded,
hash-checked, and never stores DOM snapshots.

## 5. PPTX compiler architecture

```text
exact HTML deck (C7) or exact standalone atom + explicit placement (C9)
  -> validated semantic deck or deterministic one-slide composition
  -> pure resolved style/geometry/text projection
  -> strict PPTX-normalized IR
  -> PresentationML part graph
  -> fresh deterministic OPC package
  -> reopen/schema/render/native-Office verification
  -> PPTX bytes + provenance + diagnostics
  -> C9 atom path: complete hash-bound source/object map
```

The writer returns bytes or throws one typed compiler error and performs no
filesystem writes. The CLI requires an explicit destination, resolves the
source, validates the complete graph before ZIP generation, converts compiler
errors to diagnostics, and writes bytes atomically. Independent reopen is a
conformance gate rather than a hidden per-command dependency.

Stable identity uses redundant evidence:

1. PowerPoint Selection Pane name `src.<stable-id>`;
2. deterministic but non-semantic slide-local numeric IDs;
3. custom package properties for PPTV source hash, compiler, resolved schema,
   active theme, and, for C9, originating atom; and
4. the C9 `.pptv.map.json`, which records the exact atom/composed-deck/PPTX
   hashes, placement transform, slide part, parent, kind, source order,
   baseline text, typed geometry/style, and emitted Office identity for every
   supported native object.

The current C9 map and compiler accept only the bounded standalone-atom path.
They are not a map for C7 deck-canary output or a promise of general deck
compilation.

C10 consumes that exact C9 lineage through the reverse path:

```text
exact atom + C9 map + edited descendant PPTX
  -> authenticate hashes, placement, package, and stable names
  -> prove named native-save normalizations and report every finding
  -> optionally verify one strict reviewed duplicate-connector resolution
  -> propose typed C5 1.3 operations
  -> temporary apply + exact-placement C9 regenerate + reinspection
  -> unchanged/patchable/review-required/refused report
```

The proposed patch is reviewable output, never an implicit source write.

A custom non-visual extension may carry the stable ID after a
PowerPoint-open/save/reopen experiment proves it is retained. Accessibility
descriptions are not overloaded with machine metadata.

## 6. Required quality cascade

Every promoted feature needs:

1. source/profile validation fixtures;
2. Node/browser normalized-model parity;
3. semantic operation and exact-preservation tests;
4. browser interaction and snapshot tests;
5. fresh OPC relationship/content-type validation;
6. stable-ID, hierarchy, slide-order, and z-order reopen assertions;
7. ISO/ECMA XSD or Open XML SDK schema validation;
8. OpenDocKit parse/render regression checks;
9. Office-exported versus browser-rendered visual comparison;
10. native PowerPoint open-without-repair and save/reopen; and
11. editability checks for text, geometry, and declared grouping boundaries.

No editable-PowerPoint conformance claim precedes the schema, native desktop,
editability, and visual gates.

C11 now supplies the evidence envelope, trusted standalone-SVG Chromium
capture, DOCX/PPTX Quick Look smoke, deterministic comparison primitives, and
the exact-path no-op native Office lifecycle bridge. Word and PowerPoint
16.111.2 passed save/close/reopen on 2026-08-02, but the bound evidence
deliberately remains `manual-required`: a no-op save does not satisfy
representative editability, native text/cross-renderer fidelity, or checked
human review.

## 7. Recommended dependency sequence

The first coherent source/browser/editor vertical slice above is now
implemented. `QUICKCONTEXT.md` remains the sole priority authority; the list
below records implementation dependencies rather than a competing work order:

1. settle the destination-neutral public name and migrate canonical writers,
   suffixes, package/CLI/skill names, and wire vocabulary atomically while
   retaining bounded legacy reads;
2. promote the inert hydration/template/style-family metadata envelope through
   successor C4/C6 contracts, then add metadata inspect/compare commands;
3. add a stable-ID semantic source-diff report over normalized C4/C6
   projections before expanding agent-facing mutation breadth;
4. calibrate representative C8 lines against native PowerPoint and retain the
   observed engine-specific variance as labeled evidence, never automatic
   repair;
5. promote the banked 0.1.1 text-resilience direction through successor
   contracts and fixtures before adding its source syntax or exporter flags;
6. expose browser-editor gestures for the safe C5 1.3 geometry, connector,
   explicit-group-translation, text-frame, order, deletion, and direct-style
   vocabulary; keep `set-text-lines` behind the 0.1.1 contracts;
7. expand C9 to deck input or additional native features only where the same
   C5/C10 fixtures pass browser, schema, independent-reopen, and native Office
   gates;
8. add C11 quantitative browser/Office comparison, checked high-risk crops,
   and evidence-bound human review;
9. extend the proven exact-path native no-op bridge to representative,
   explicitly verified edits without weakening document isolation or bounded
   failure behavior;
10. define static self-contained resource/asset handling before compiling SVG
   or raster assets;
11. add sandboxed untrusted intake without weakening the trusted direct-open
   path; and
12. define canonical structural serialization and typed ID allocation before
   general insertion/duplication, reparenting, group creation/scaling, or
   extending C10 beyond its exact reviewed connector-clone exception; keep
   external multi-atom/dependency composition behind its own hash, capability,
   qualification, root, and cycle contract.

This preserves momentum from the worked examples while keeping the source,
editor, and Office surfaces locked to the same narrow semantics.
