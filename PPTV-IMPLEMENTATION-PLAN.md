# PPTV Implementation Plan

**Status:** active delivery roadmap; C6 is executable and C7 promotes the
first compiler canary, while remaining milestones retain their own gates

**Decision date:** 2026-07-28

**Sequence:** strict profile → trusted browser editor → early PPTX canary →
editor/compiler expansion → reconciliation

This plan turns the implemented C4 source kernel and C5 patch engine into a
small, reliable visual authoring system and editable PowerPoint compiler. It
intentionally favors deterministic behavior over broad SVG, browser, or Office
feature coverage.

## 1. Honest starting point

PPTV is already structurally well suited to live editing:

- exact source bytes and hashes remain authoritative;
- stable SVG IDs identify objects across browser, agent, and Office views;
- the semantic tree preserves native group hierarchy;
- DOM sibling order is canonical z-order;
- roles distinguish shapes, text, connectors, groups, and assets;
- export modes distinguish native objects from atomic SVG/raster artwork; and
- all current writes are validated, atomic semantic transactions.

The current kernel now makes the narrow geometry/style/text claims defined by
the in-progress C6 contract. It resolves fixed-canvas primitives, translated
group bounds, connector endpoints, explicit text frames and hard lines,
constrained CSS/theme tokens, and provenance without a browser. It still makes
no writable geometry-operation or native PowerPoint fidelity claim. Move,
resize, hit-testing, typed line edits, and PPTX behavior retain separate gates.

That boundary is useful rather than alarming: the source and identity model do
not need redesign. The next work specializes and proves the intentionally small
visual surface.

## 2. Compiler-grade profile decisions

These decisions guide contracts and fixtures. C6 implements the bounded
resolved subset; later editor/compiler behavior is not implemented merely
because it appears in this roadmap.

### 2.1 One fixed 16:9 canvas first

The first editor/compiler profile uses:

```text
SVG viewBox:       0 0 1600 900
PPTX slide size:   12192000 × 6858000 EMU
Physical size:     13⅓ × 7.5 in
Scale:             7620 EMU per SVG unit
```

Every slide in a deck uses that exact viewBox and one deck-wide PowerPoint
slide size. The compiler never stretches or infers a mismatched slide.

Alternate ratios are a later versioned deck-level extension. They are not
per-slide, and the first implementation rejects them with a capability
diagnostic. A future named-size extension can add 4:3 or 16:10 without
introducing arbitrary unit/layout behavior.

### 2.2 Object and grouping boundaries

The author declares role and export intent; the resolver derives the concrete
kind from the SVG element.

| Source boundary | Meaning in the editor | Initial PowerPoint intent |
|---|---|---|
| `rect`, `circle`, or `ellipse`; role `shape`, export `native` | Independently editable primitive | Native shape |
| `text`; role `text`, export `native` | Explicit-line text frame | Native text box |
| `line`; role `connector`, export `native` | Independently editable straight edge | Native line/connector |
| `g`; role `group`, export `native` | Addressable children plus one parent scope | Native PowerPoint group |
| `g`; role `asset`, export `svg` | One atomic vector image; internals are opaque | SVG picture plus PNG fallback |
| `image`; role `asset`, export `raster` | One atomic raster image | Native picture |

A visual “box with text” is a native group containing a rectangle and a text
object. It is not one inferred compound object. A complex illustration is an
atomic SVG asset, not a native group whose paths happen to be difficult.

Native groups initially allow only a finite `translate(tx ty)` transform.
Children retain explicit local geometry and DOM order. Group scale, rotation,
skew, matrices, resize, flattening, group creation, and ungrouping are deferred.

Atomic vector assets require explicit bounds on their opaque boundary; the
compiler must not use browser `getBBox()` as canonical geometry. Their safe
internal SVG may be arbitrarily rich within the separately enforced static
resource policy, but it remains one selection and one PowerPoint picture.

### 2.3 Explicit-line text; never automatic reflow

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

The current C7 writer emits exactly one explicit paragraph with
zero/contracted margins, `wrap="none"`, and `a:noAutofit`; it rejects multiline
text. A later multiline writer must emit one explicit paragraph/break per source
hard line. A text frame resize changes only the frame; it does not reflow or
resize text.

Compiler-grade text uses one concrete resolved font family rather than a
browser fallback stack. The first profile supports the small set of font
weights/styles that map without approximation. C6/C7 currently validate and
emit that concrete family string; they do not detect whether a font is installed
or substituted and do not record the host font environment. Those checks plus
visual-verification environment provenance are future fidelity gates. Font
embedding and arbitrary web fonts are deferred.

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

- a deterministic `*.editable.pptv.html` wrapper contains the exact clean deck
  bytes, their SHA-256, and one fixed bundled editor application;
- the wrapper has no network dependencies and carries a strict CSP;
- the embedded canonical deck is data, so its viewer script and event-bearing
  markup are never executed by the editor;
- editor save/export always produces a clean canonical `.pptv.html`, never DOM
  serialization and never the wrapper; and
- invalid source shows diagnostics rather than a partially editable deck.

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

## 3. Delivery sequence

Progress at the 2026-07-29 integration point:

- C6's pure resolver and normalized minimal fixture are implemented; standalone
  parity/kitchen-sink corpora keep that contract `in-progress`.
- The exact-source editor session, trusted strict-CSP wrapper, navigation,
  literal-data viewport, integrity check, and clean download are implemented;
  bundled writable controls and stale-safe file persistence remain.
- C7's deterministic primitive-only PPTX canary is implemented. It passes
  applicable ISO/ECMA schemas, independent OpenDocKit reopen, and native
  PowerPoint 16.111.2 open/PDF-render smoke without repair. It is not a general
  converter or quantitative native-fidelity claim; native PPTX save/reopen
  remains unverified on this install.

### Milestone 0 — C6 resolved-profile contract and fixtures

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

### Milestone 1 — Trusted browser editor MVP on existing C5

Build a useful editor before broad geometry authoring.

Deliver:

- deterministic `editor-pack` generation for trusted direct-open wrappers;
- slide rail, object tree, diagnostics panel, selection, and inspector;
- scriptless/isolated rendering from semantic projections;
- direct safe-text editing;
- active-theme switching;
- manifest slide reordering;
- semantic undo/redo with exact before/after source states and hashes;
- explicit clean-deck download; and
- optional user-granted File System Access save with stale-hash protection.

The canonical browser DOM is never saved. Live previews are disposable; every
commit goes through a C5 transaction and reloads through C4.

Exit gate:

- pack → open → edit → undo → redo → export → CLI validate → reopen passes;
- undo restores byte-identical BOM, newline, whitespace, and entity spelling;
- the wrapper performs zero network requests and never executes deck runtime
  code;
- failed edits add no history entry and produce no partial source; and
- Chromium, Firefox, and WebKit agree on hashes, diagnostics, hierarchy, and
  clean-download behavior.

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
canary evidence; a versioned source-map/connector/baseline artifact remains a
later supported-surface deliverable. Accessibility descriptions are not used
for machine metadata.

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

As of 2026-07-29, deterministic bytes, strict graph/ZIP checks, ISO/ECMA XSDs,
independent reopen, stable identity/order, no-wrap/no-autofit XML, capability
errors, and native PowerPoint open/render smoke pass. Quantitative render
thresholds and native PPTX save/reopen remain. PowerPoint 16.111.2 AppleScript
Open XML Save As produces a zero-byte file even for a known-good control, so
that automation result is not evidence.

### Milestone 3 — Geometry, explicit lines, and second compiler canary

Extend C5 only with typed semantic operations:

- `set-text-lines`;
- `set-object-geometry` with an element/kind-specific field schema;
- `set-connector-endpoints`;
- `set-child-order` within one parent scope; and
- native-group translation.

Avoid a generic `set-attribute` escape hatch. Pointer drag is a transient
preview; pointer-up produces one transaction and Escape is byte-neutral.
Initially edit existing objects only. Insert, duplicate, delete, group,
ungroup, cross-parent moves, rotation, and canonical structural serialization
remain deferred.

Extend the compiler canary at the same time with:

- all connector endpoint/editing cases (the C7 writer already covers straight
  native connectors);
- group editing cases (the C7 writer already covers translated native groups);
- explicit multiline text with hard breaks; and
- atomic SVG pictures with PNG fallback.

Exit gate:

- every allowed primitive/field combination has positive and negative tests;
- local/world bounds and hit-testing are deterministic;
- editor source order, semantic order, browser z-order, saved DOM order, and
  reopened PowerPoint order agree;
- unsafe source trivia makes structural operations unavailable rather than
  heuristic;
- text edits and frame changes never cause wrapping, autofit, or word movement;
  and
- the extended canary passes the complete Milestone 2 package/schema/native
  Office cascade.

### Milestone 4 — Complete the supported editor/compiler surface

Expand only where the same conformance fixture works in browser and PowerPoint:

- solid shape styling and approved rounded rectangles;
- straight connectors and arrowheads;
- native translated groups;
- explicit multiline text and approved font styles;
- atomic SVG/raster assets;
- theme token editing after provenance is implemented;
- source-map generation and verification; and
- slide/deck packaging across the worked examples.

PPTX dependencies live in an optional `@office180/pptv-pptx` adapter only when
the dependency boundary is real. The source/browser kernel remains free of
OpenDocKit and OOXML dependencies.

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

### Milestone 6 — Baseline-aware PowerPoint reconciliation

Only after forward compilation is stable:

- inspect edited PPTX against its source hash and generated map;
- recover stable IDs from preserved extensions/names;
- report text, geometry, deletion, and within-parent ordering changes;
- emit reviewable PPTV semantic patches;
- refuse ambiguous identity or unsupported Office changes; and
- regenerate and compare after accepted patches.

Arbitrary PPTX import is a separate future project, not a hidden requirement of
reconciliation.

## 4. Browser editor architecture

```text
exact embedded/file bytes + expected hash
  -> SourceProvider
  -> EditorSession
       -> C4 immutable load
       -> semantic intent dispatcher
       -> C5 validate/apply
       -> exact source/hash history
  -> JSON-safe projections
       -> slide rail / tree / inspector / diagnostics
       -> isolated supported-SVG viewport
  -> PersistenceAdapter
       -> clean download
       -> explicitly granted file handle
```

Keep the first implementation inside `@office180/pptv`:

- `browser/session` owns source, deck, selection, dirty state, and history;
- `browser/render` creates supported SVG from projections;
- `browser/viewport` isolates deck styling from editor chrome;
- `browser/intents` emits typed operations;
- `browser/persistence` implements wrapper, file, handle, and download paths;
- `browser/app` may use plain TypeScript and Web Components; and
- Node `editor-pack` validates and generates the wrapper.

Exact source states back undo/redo because an inverse semantic operation cannot
reconstruct lexical choices such as entity spelling. History is bounded,
hash-checked, and never stores DOM snapshots.

## 5. PPTX compiler architecture

```text
exact PPTV source
  -> validated semantic deck
  -> pure resolved style/geometry/text projection
  -> strict PPTX-normalized IR
  -> PresentationML part graph
  -> fresh deterministic OPC package
  -> reopen/schema/render/native-Office verification
  -> PPTX bytes + provenance + diagnostics
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
   and active theme.

A later `.pptv.map.json` can add slide part, parent, kind, bounds, order, and
connector/baseline records once its own schema/hash contract exists.

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

## 7. Recommended immediate work

The first coherent vertical slice above is now implemented. Continue with:

1. finish C6 standalone fixture and Node/browser normalized-JSON parity gates;
2. bundle writable text/theme/order controls over the existing C5
   exact-source session;
3. add stale-safe user-granted persistence and real browser save/reload tests;
4. add typed geometry/line/order/group operations without a generic attribute
   escape hatch;
5. expand C7 only where those same fixtures pass browser, schema, independent
   reopen, and native Office gates;
6. add quantitative browser/PDF comparison; and
7. complete native PPTX save/reopen on an automation path that first proves a
   non-empty ZIP output.

This preserves momentum from the worked examples while keeping the source,
editor, and Office surfaces locked to the same narrow semantics.
