# PPTV Design Index

**Status:** executable 0.1 source/editor, typed-patch, atom-composition,
compiler-baseline, and bounded-reconciliation slice; banked 0.1.1
text-resilience direction; plus broader roadmap
**Audience:** implementers, tool authors, presentation-system designers, and agents  
**Canonical acronym:** PPTV — PowerPoint Vector Profile

## 1. Purpose

PPTV is a constrained, web-native presentation source model intended to make
slides simultaneously:

- directly renderable in browsers;
- compact and legible in source control;
- compatible with CSS design systems;
- editable through semantic tools and a native visual editor;
- deterministically convertible to editable PowerPoint;
- inspectable and patchable by agents without repeatedly consuming raw SVG,
  CSS, runtime code, or OOXML; and
- reconcilable after human editing in PowerPoint.

PPTV does not attempt to replace SVG, HTML, CSS, or PresentationML. It defines a
strict intersection and a set of author-intent annotations that make reliable
translation possible.

### Implemented baseline (2026-08-01)

The single TypeScript package `@office180/pptv@0.1.0-alpha.4` now implements
the first contracted vertical slice:

- strict, non-executing recognition/scanning of PPTV HTML, SVG, and manifest
  forms plus namespace-aware XML well-formedness for standalone SVG;
- semantic loading of either one self-contained `.pptv.svg` diagram atom or
  one self-contained `pptv: "0.1"` HTML deck, with no synthetic coercion;
- exact retained UTF-8 bytes and text, including a leading BOM and original
  newline spelling, with SHA-256 over those exact bytes;
- half-open UTF-8 byte and UTF-16 code-unit ranges plus one-based source
  positions;
- immutable, source-hash-bound diagram/deck indexes and artifact-specific
  JSON-safe outline, inventory, text, semantic, and editing projections;
- backward-compatible `pptv-patch/0.1` transactions plus C5 1.2's opt-in
  `pptv-patch/0.2` typed geometry, connector, explicit group-translation,
  direct text-frame, within-parent order, safe-deletion, and concrete
  presentation-attribute style operations;
- exact-source browser sessions and writable strict-CSP diagram/deck editor
  packs with literal C6 viewports, clean source download, exact undo/redo, and
  stale-safe user-granted persistence;
- fail-closed C6 arbitrary-canvas diagram and fixed-16:9 deck
  CSS/geometry/group/explicit-line text resolution;
- deterministic CSS/theme hydration of a resolvable deck slide into an
  independently reloaded/resolved `.pptv.svg` atom;
- deterministic shared browser/editor bundles and normalized C4/C6 parity
  across Chromium, Firefox, and WebKit;
- deterministic C7 fresh-PPTX compilation for the strict primitive subset,
  validated by ISO/ECMA schemas and OpenDocKit reopen, with minimal-fixture
  native PowerPoint open/render smoke without repair;
- pure C8 anchor-aware text-fit evidence with exact-font Node and explicit-byte
  browser adapters, worked-deck inventory, and checked three-engine evidence;
- explicit C9 identity or uniform-scale-plus-translation placement of one
  standalone atom into a deterministic self-contained one-slide deck, plus a
  paired native PPTX and hash-bound source/object baseline map;
- authenticated C10 inspection of an edited descendant of that C9 baseline,
  producing bounded typed C5 proposals and proving patchable results by
  temporary C5 application, C4/C6 reload, exact-placement C9 regeneration, and
  reinspection;
- C11 evidence envelopes, deterministic trusted-SVG browser capture,
  DOCX/PPTX Quick Look smoke, and deterministic image comparison, while
  keeping Quick Look distinct from native Office lifecycle evidence; and
- generic `outline`, `validate`, `resolve`, `editor-pack`, `text-fit`, `text`,
  `show`, `list`, and `patch`; deck-only `extract` and `pptx-canary`; and
  standalone-atom `compose`, `compile`, and baseline-aware `reconcile`.

Contracts
[`CONTRACT-C4-PPTV-SOURCE.1.1.md`](architecture/CONTRACT-C4-PPTV-SOURCE.1.1.md)
and
[`CONTRACT-C5-PPTV-PATCH.1.2.md`](architecture/CONTRACT-C5-PPTV-PATCH.1.2.md),
the C6–C8 contracts, and
[`CONTRACT-C9-PPTV-PPTX-BASELINE.1.0.md`](architecture/CONTRACT-C9-PPTV-PPTX-BASELINE.1.0.md),
[`CONTRACT-C10-PPTV-PPTX-RECONCILIATION.1.0.md`](architecture/CONTRACT-C10-PPTV-PPTX-RECONCILIATION.1.0.md),
and
[`CONTRACT-C11-OFFICE-VISUAL-EVIDENCE.1.0.md`](architecture/CONTRACT-C11-OFFICE-VISUAL-EVIDENCE.1.0.md),
together with the shipped schemas, implementation, and fixtures, are normative
for that implemented slice. C4, C5, and C6 are verified. C7 through C11 remain
`in-progress` until their stated native calibration, quantitative comparison,
native lifecycle, and other promotion gates close. Browser-editor controls for
the new C5 operations, canonical insertion/duplication/reparenting
serialization, C9 deck input, arbitrary PPTX import, rich text, broader
rendering, and general PPTX conversion remain roadmap. The planned 0.1.1
text-resilience behavior is banked separately and is not accepted by current
loaders, resolvers, editors, or compilers.

## 2. Current design packet

Read these documents in order:

1. **[`PPTV-PROFILE.md`](PPTV-PROFILE.md)**  
   Defines the constrained SVG object profile: stable identity, semantic roles,
   native-versus-asset export intent, DOM-order z-order, source maps, forward
   compilation, and reverse patches.

2. **[`PPTV-HTML-CONTAINER.md`](PPTV-HTML-CONTAINER.md)**  
   Defines the preferred whole-deck source form: a manifest-first,
   browser-viewable `.pptv.html` file with inert slide templates, reusable
   libraries, named themes near the end, and one fixed non-authoritative runtime
   at the very end.

3. **[`PPTV-PROCESSING-API.md`](PPTV-PROCESSING-API.md)**  
   Defines the proposed scanner, source index, lazy processing stages, semantic
   model, query projections, transactional patch operations, serialization,
   diagnostics, caching, and test obligations.

4. **[`PPTV-TOOLING-AND-EDITOR.md`](PPTV-TOOLING-AND-EDITOR.md)**  
   Defines the TypeScript-first package architecture, agent CLI, native PPTV
   visual editor, optional `.editable.pptv.html`, and selective OpenDocKit reuse.

5. **[`PPTV-IMPLEMENTATION-PLAN.md`](PPTV-IMPLEMENTATION-PLAN.md)**

   Records the decision-backed delivery sequence: fixed 16:9 profile,
   explicit-line/no-reflow text, narrow CSS, trusted editor wrapper, early PPTX
   canary, typed native-object patches, explicit atom baselines, bounded
   reconciliation, evidence gates, and remaining promotion work.

6. **[`PPTV-TEXT-RESILIENCE-0.1.1.md`](PPTV-TEXT-RESILIENCE-0.1.1.md)**

   Banks a future source/profile move that keeps explicit SVG lines
   authoritative while adding paragraph intent, reliability-versus-editability
   PowerPoint export policies, and a conservative baseline-free import
   heuristic. It is design, not current executable behavior.

7. **[`PPTV-AGENT-GUIDE.md`](PPTV-AGENT-GUIDE.md)**

   Defines the operational `pptv-agent/1` profile: minimum-view selection,
   semantic patch discipline, trust boundaries, task recipes, failure behavior,
   and validation/reporting rules.

8. **[`SVG-TO-EDITABLE-PPTX.md`](SVG-TO-EDITABLE-PPTX.md)**

   Provides the practical reconstruction and QA playbook that motivated PPTV:
   hybrid native/asset conversion, stable PowerPoint object names, source maps,
   render comparison, and reverse inspection.

9. **[`examples/minimal-diagram.pptv.svg`](examples/minimal-diagram.pptv.svg)
   and [`examples/minimal-deck.pptv.html`](examples/minimal-deck.pptv.html)**

   The first is the smallest standalone arbitrary-viewBox atom. The second is
   a browser-openable/C7-compilable aggregation showing manifest order, inert
   slide sources, themes, extraction, and the reference viewer runtime.

10. **[`.agents/skills/pptv-authoring/SKILL.md`](.agents/skills/pptv-authoring/SKILL.md)**

   The repo-scoped, auto-discovered operational workflow defaults to a
   standalone atom for one figure or the bounded C9 atom/PPTX lane, and HTML
   for an authored multi-slide deck or the C7 canary. It covers no-reflow
   authoring, exact-font audits, extraction, editor generation, and the bounded
   C7/C9/C10 compilation and reconciliation workflows without replacing the
   contracts.

These files mix implemented status with design rationale. C4–C6 are verified
behavioral authorities for source, patch, resolution, and hydration. C7/C8 are
implemented, tested, in-progress native compiler/verification surfaces. C9
through C11 are implemented, tested, in-progress atom-baseline,
baseline-reconciliation, and evidence surfaces. Prose beyond those bounded
surfaces remains roadmap until promoted through a contract and fixture.

## 3. Artifact family

PPTV uses escalating source forms rather than requiring a project directory for
every diagram:

```text
diagram.pptv.svg                 implemented default standalone diagram atom
mydeck.pptv.html                 implemented portable whole-deck source
mydeck.pptv-manifest.json        recognition only; external orchestration future
mydeck.editable.pptv.html        implemented generated writable trusted wrapper
mydeck.pptx                      current strict deck-only C7 canary
diagram.composed.pptv.html       C9 deterministic one-atom/one-slide composition
diagram.pptx                     C9 strict standalone-atom compiler baseline
diagram.pptv.map.json            C9 generated hash-bound source/object baseline
diagram.reconciliation.json      C10 read-only reconciliation report
diagram.pptv.patch.json          C10 reviewable patch when every change is patchable
```

The manifest filename is a convention. JSON is not an alternate encoding of
PPTV; it is only deck orchestration metadata.

## 4. Core decisions

### 4.1 SVG is the canonical visual language

Slide geometry and semantic objects remain ordinary SVG. A PPTV file adds stable
identity and explicit conversion intent but remains browser-renderable.

### 4.2 HTML is the preferred portable deck envelope

A `.pptv.html` file can contain the complete deck, shared CSS themes, reusable
symbols, and a tiny browser runtime without requiring users to manage many peer
files.

The independent `.pptv.svg` atom is the default unit for a diagram or doc
figure. HTML is the preferred portable deck envelope and the current C7
compilation input. C9 can explicitly compose one self-contained atom into a
new one-slide HTML deck; it does not add an atom to an existing deck. External
manifests are inventory-only, and future multi-file composition still needs
explicit hashes, capabilities, roots, and cycle behavior.

### 4.3 The manifest is the deck table of contents

The leading manifest defines slide order and active theme. Reordering slides
means editing one compact array, not moving large SVG subtrees.

### 4.4 SVG DOM order is object z-order

Inside each slide, document order remains the only canonical painter and
PowerPoint shape-tree order. PPTV does not add a competing `z-index` or numeric
z-order field.

### 4.5 CSS owns visual design; PPTV metadata owns presentation semantics

CSS controls colors, fonts, fills, strokes, typography, component classes, and
design tokens.

PPTV metadata controls stable identity, export representation, connector
relationships, placeholders, layouts, templates, and round-trip intent.

### 4.6 Themes appear late in the physical source

Strict `.pptv.html` uses a deliberate book-like source order:

```text
manifest and control plane
slide sources
reusable definitions
theme definitions
fixed reference runtime
```

Named themes are inert data blocks. Only the manifest-selected theme participates
in rendering or compilation.

### 4.7 The browser runtime is fixed and non-authoritative

The final JavaScript runtime is generated or verified boilerplate. It renders the
declarative source in a browser but cannot define canonical content, identity,
order, or semantics.

Validators and compilers parse declarations directly and never execute runtime
JavaScript to discover document meaning.

### 4.8 TypeScript is the primary reference implementation

The same implementation can run in Node.js, browsers, editor applications,
agent tools, tests, and build systems. Normative behavior remains
language-neutral through schemas, contracts, fixtures, and expected diagnostics.

Python may later provide a convenience wrapper but should not define independent
semantics.

### 4.9 Exact source is persistent authority; semantic models are interpretations

```text
exact PPTV source bytes and spans
  -> PPTV hierarchical semantic tree
       -> browser DOM
       -> editor interaction model
       -> agent projections
       -> normalized compiler model
       -> OpenDocKit / PowerPoint adapter IR
```

The exact retained declarative bytes, stable IDs, and accepted patch history are
the persistent editing authority. The immutable semantic tree is the
hash-bound interpretation used to validate and edit them. The browser DOM, a
flat spatial model, generated PPTX, and OpenDocKit IR are derived projections,
not sources of truth for native PPTV editing.

### 4.10 Agents edit through semantic operations

The normal agent path is:

```text
outline -> retrieve selected semantic objects -> apply stable-ID patch -> validate
```

Reading or rewriting the complete HTML/SVG/CSS source is an explicit diagnostic
or escape-hatch operation, not the default.

### 4.11 The native editor is purpose-built

The PPTV editor should be written from scratch around PPTV's small semantic
surface. It renders a disposable SVG view from the canonical semantic
projection and emits the same semantic operations used by the CLI and agents.
The implemented trusted viewport follows this rule rather than cloning the
source DOM.

It is not a reduced mode of an arbitrary PPTX editor.

### 4.12 OpenDocKit is an optional adapter and upstream collaboration target

The 0.1 package has no OpenDocKit dependency. C7 uses the sibling checkout only
as an independent OPC/PPTX reopen oracle. C8's pure injected boundary can also
accept a future small, evidence-rich OpenDocKit metrics adapter. Other optional
adapters can use OpenDocKit's public OPC reader/part/relationship APIs and
selected XML, theme, color, unit, and derived `PageModel` utilities without
changing PPTV authority or making arbitrary Office parsing part of the native
path.

Current private SVG editor/write-back code is not a safe package boundary:
its rich-text save path does not retain per-run properties, its editor modules
are application-internal, its fresh-presentation synthesis/package-builder
surface is incomplete, and the `@opendockit/pptx` dependency chain has a
license-metadata conflict to resolve. Suitable contribution-back work includes
public SVG interaction interfaces, per-run text fidelity and DOM tests, a
fresh-package builder, shared transaction/precondition patterns, and cross-repo
fixtures.

### 4.13 Diagram canvases are arbitrary; the first PowerPoint profile is 16:9

Standalone diagrams use any explicit finite-positive logical viewBox and infer
no physical size. The first PowerPoint compiler profile uses exact
`0 0 1600 900` slides and one deck-wide Widescreen size. Alternate deck ratios
remain a versioned extension; they are never inferred, stretched, or varied
silently per slide.

### 4.14 Executable 0.1 native text never reflows automatically

The first native text surface is explicit-line text with explicit typography
and frame geometry. The editor may expose a paragraph-like multiline field, but
source and PowerPoint output retain hard lines. Wrapping, autofit,
shrink-to-fit, and font-size adjustment are outside the profile.

The banked
[`PPTV-TEXT-RESILIENCE-0.1.1.md`](PPTV-TEXT-RESILIENCE-0.1.1.md)
direction does not weaken source authority. It may add explicit `paragraph`
intent while serialized SVG lines remain deterministic. A future PowerPoint
exporter can choose a measured expanded-frame `reliable` policy or an authored
tight-frame `editable` policy; neither is implemented in 0.1, and neither
permits autofit or silent source reflow.

### 4.15 The direct-open editor is a generated trusted wrapper

The implemented editor pack is a deterministic strict-CSP application around
the exact canonical diagram or deck bytes and expected hash. It opens through
the shared C4/C5 session, rebuilds every preview/projection from current C6
data, exports clean source, and never promotes DOM serialization to authority.
Its current controls commit legacy C5 direct text plus deck-only theme/order
transactions. The wider C5 1.2 typed geometry/style/order/deletion vocabulary
is available through the patch API/CLI and C10 reconciliation, but does not yet
have browser controls. A user-selected file may be overwritten once by explicit
picker consent; later saves compare its disk hash with the editor's last saved
hash and refuse stale writes.

### 4.16 Atom-to-deck composition is an explicit transform

C9 implements the first bridge independently from the banked 0.1.1 text move.
`compose` accepts exactly one self-contained standalone atom, its exact source
hash, and an explicit target rectangle/policy, then publishes a deterministic
self-contained one-slide HTML deck only after C4 reload and C6 resolution.
`compile` uses the same transform to publish a paired native PPTX and C9 map.
Identity requires the target dimensions to equal the atom viewBox extent;
non-identity placement permits only one explicit uniform scale plus
translation when aspect ratios agree. An aspect mismatch fails closed. PPTV
never silently stretches, crops, letterboxes, or infers physical size from an
arbitrary atom viewBox.

This is not general deck assembly: C9 currently refuses deck input, external
dependencies, multiline text, opaque SVG/raster assets, rounded rectangles,
and non-unit opacity. Capability, qualified-ID, dependency-hash, multi-root,
and cycle rules remain future external-composition work. C7 remains the
separate deck-only canary.

## 5. Authority hierarchy

When representations disagree, use this order:

1. versioned PPTV contract and conformance fixtures;
2. canonical declarative source and its stable IDs;
3. accepted semantic patch history and source hash;
4. generated source map and provenance;
5. normalized compiler model;
6. browser-rendered DOM;
7. editor interaction model;
8. generated PowerPoint object model;
9. visual rendering evidence.

Visual evidence remains critical for fidelity, but it does not silently redefine
semantic identity or source intent.

## 6. Trust boundaries

A PPTV source may declare known version identifiers for:

- the PPTV profile;
- the HTML container;
- the agent guidance profile;
- the browser viewer runtime; and
- an optional editor runtime.

Freeform comments, visible slide text, CSS comments, and arbitrary embedded
instructions are document content, not trusted agent or compiler policy.

Strict mode rejects arbitrary executable scripts, event handlers, unexpected
network access, and runtime-generated canonical content.

Non-executing library validation does not make a source safe to direct-open.
Opening an untrusted `.pptv.html` in a browser executes its embedded script
before the library can validate it. Direct browser opening is therefore a
trusted-source convenience; untrusted input must be validated first and viewed
through an appropriate sandbox/CSP boundary.

## 7. Conformance classes under consideration

```text
PPTV SVG Core       constrained standalone diagram atom
PPTV HTML Deck      manifest-first portable deck container
PPTV Authoring      local reusable CSS, symbols, and assets before normalization
PPTV Tooling        projections, semantic patches, validation, serialization
PPTV Template       theme, master, layout, and placeholder mapping
PPTV PowerPoint     deterministic editable PPTX compilation
PPTV Round Trip     baseline-aware edited-PPTX reconciliation
PPTV Editor         native visual editing through semantic operations
```

A tool should declare exactly which classes and versions it implements.

## 8. Promotion path and status

The diagram/deck source and typed patch kernels, C6 resolved model/browser
parity, writable trusted editor, text calibration fixtures, strict deck canary,
C9 atom baseline, C10 bounded reverse proposal, and C11 automated evidence
slice have satisfied the first executable promotion steps. The full
visual/editor/PowerPoint profile still must not be declared a stable standard
based on prose alone. Remaining promotion work includes:

1. calibrate representative C8 lines against native PowerPoint while retaining
   environment-specific Node/browser identities;
2. promote the banked 0.1.1 text behavior only through successor
   source/patch/resolved/compiler contracts and conformance fixtures;
3. expose useful browser-editor controls for the current C5 1.2 vocabulary and
   contract additional operations only with exact-source fixtures;
4. extend C9 to deck input or additional native/asset features only where the
   same editor and reverse fixtures pass;
5. add C11 quantitative cross-renderer browser/Office visual baselines and
   checked human review;
6. pass native PowerPoint representative edit/save/reopen for C9/C10
   artifacts (only C7 minimal-fixture open/render smoke currently passes);
7. define canonical structural serialization before insertion, duplication,
   reparenting, or group creation; and
8. complete at least one independent implementation or adapter experiment.

The conformance corpus is part of the standard, not supplementary test code.

## 9. Implemented 0.1 command slice

The source package currently provides:

```text
pptv outline
pptv validate
pptv resolve
pptv extract
pptv editor-pack
pptv pptx-canary
pptv compose
pptv compile
pptv reconcile
pptv text-fit
pptv text
pptv show
pptv list
pptv patch
```

`patch` requires exactly one of `--check` or an explicit `--output`;
`editor-pack` and `pptx-canary` also require explicit destinations; `text-fit`
requires an explicit font map. C9 `compose` requires an explicit placement and
deck destination; C9 `compile` requires explicit paired PPTX/map destinations;
C10 `reconcile` requires the exact source, C9 baseline, edited PPTX, and
explicit report/patch destinations. Reconciliation never applies its proposal:
that remains a separate `pptv patch` transaction. There is no implicit
overwrite. Rich editor controls, C9 deck compilation, baseline-free arbitrary
PPTX import, and general PPTX conversion remain roadmap. The implemented slice
proves both source atoms, stable identity, semantic loading, projections,
typed exact-source patch discipline, deterministic hydration, a writable
trusted editor, exact-font non-mutating fit evidence, strict-subset PPTX
synthesis, explicit atom placement, mapped baseline generation, and bounded
round-trip proposals.

## 10. Open design questions

The following implementation details remain intentionally unresolved until the
next contract, fixtures, and prototypes provide evidence:

- compatibility negotiation and exact migration rules from executable
  source/container `0.1` to the banked source/profile `0.1.1`; package,
  contract, viewer, compiler, and agent-profile versions remain independent;
- authority and mismatch behavior for manifest title/layout/agent profile and
  their HTML/SVG mirrors;
- library reference syntax, expansion, identity qualification, and dependency
  hashing;
- installed-font/substitution detection, visual-fidelity environment recording,
  and any future concrete font allowlist;
- static resource-table and fallback-media syntax for opaque SVG/raster assets;
- canonical formatting versus maximal preservation during structural edits;
- the broader master/layout/source-map surface beyond C7's validated blank
  canary graph and C9's mapped one-atom/one-slide baseline;
- and the exact public OpenDocKit adapter/extraction boundary after its
  text-save, package-builder, test-rigor, and license blockers are resolved.

Exact BOM handling, UTF-8/UTF-16 range coordinates, source hashing, strict
default section order, the fixed viewer-runtime digest policy, arbitrary
diagram canvases versus the initial 16:9 deck scope, explicit frame/line-step
syntax, constrained base/theme CSS, opaque SVG
bounds, executable 0.1 no-reflow text behavior, no-theme-inheritance
direction, C7's minimum fresh package, C9's explicit identity/uniform atom
placement, C10's authenticated typed reverse boundary, and C11's
renderer-specific evidence identities are decided. The 0.1.1
paragraph-intent/resilience direction is banked but not executable.
C4/C5/C6 are verified authorities; C7 through C11 are contracted, implemented,
in-progress authorities for their narrow compiler, preflight, atom-baseline,
reconciliation, and evidence surfaces. Broader behavior still requires
promotion through contracts and fixtures.
