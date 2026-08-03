# PPTV Design Index

**Status:** executable 0.1 source/editor, typed-patch, atom-composition,
compiler-baseline, and bounded-reconciliation slice; banked 0.1.1
text-resilience direction; plus broader roadmap
**Audience:** implementers, tool authors, presentation-system designers, and agents  
**Current implementation name:** PPTV — PowerPoint Vector Profile
**Pre-production naming gate:** open; the public atom name should remain
destination-neutral even though PowerPoint is a first-class adapter

## 1. Purpose

PPTV is the current name for a constrained, web-native visual source model
intended to make diagrams, figures, reusable visuals, and slide-sized canvases
simultaneously:

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

### Default source posture

The canonical default is one fully hydrated standalone `*.pptv.svg` atom. It is
self-contained: one strict SVG root, stable IDs, explicit geometry and hard
lines, concrete local styling, and no manifest, deck CSS/theme authority,
runtime, or external dependency. A suite of diagrams remains a suite of atoms.

Use `*.pptv.html` only when the artifact is an actual ordered multi-slide
deck/report or needs shared deck themes, the fixed viewer, or the deck-only C7
compiler. Generated `*.editable.pptv.html` and `*.composed.pptv.html` files are
derived artifacts. A one-slide PowerPoint branch compiles directly from the
atom; HTML composition is not a source prerequisite.

### Implemented baseline (2026-08-02)

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
- backward-compatible `pptv-patch/0.1` transactions plus C5 1.3's opt-in
  `pptv-patch/0.2` typed geometry, connector, explicit group-translation,
  direct text-frame, within-parent order, safe-deletion, and concrete
  presentation-attribute style operations, plus exactly one
  `pptv-patch/0.3` exact-template same-parent native straight connector clone;
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
- authenticated C10 1.2 inspection of an edited descendant of that C9
  baseline, producing named native-save normalization proofs, deterministic
  findings/candidates/resolution options, bounded typed C5 proposals, and one
  strict hash/fingerprint-bound reviewed connector-copy path; patchable results
  are proved by temporary C5 application, C4/C6 reload, exact-placement C9
  regeneration, and reinspection;
- C11 evidence envelopes, deterministic trusted-SVG browser capture,
  DOCX/PPTX Quick Look smoke, deterministic image comparison, and a bounded
  exact-path native no-op lifecycle bridge; Word and PowerPoint 16.111.2 passed
  save/close/reopen on 2026-08-02, while representative edits/fidelity remain
  distinct; and
- generic `outline`, `validate`, `resolve`, `editor-pack`, `text-fit`, `text`,
  `show`, `list`, and `patch`; deck-only `extract` and `pptx-canary`; and
  standalone-atom `compose`, `compile`, and baseline-aware `reconcile`.

Contracts
[`CONTRACT-C4-PPTV-SOURCE.1.1.md`](architecture/CONTRACT-C4-PPTV-SOURCE.1.1.md)
and
[`CONTRACT-C5-PPTV-PATCH.1.3.md`](architecture/CONTRACT-C5-PPTV-PATCH.1.3.md),
the C6–C8 contracts, and
[`CONTRACT-C9-PPTV-PPTX-BASELINE.1.0.md`](architecture/CONTRACT-C9-PPTV-PPTX-BASELINE.1.0.md),
[`CONTRACT-C10-PPTV-PPTX-RECONCILIATION.1.2.md`](architecture/CONTRACT-C10-PPTV-PPTX-RECONCILIATION.1.2.md),
and
[`CONTRACT-C11-OFFICE-VISUAL-EVIDENCE.1.1.md`](architecture/CONTRACT-C11-OFFICE-VISUAL-EVIDENCE.1.1.md),
together with the shipped schemas, implementation, and fixtures, are normative
for that implemented slice. C4, C5, and C6 are verified. C7 through C11 remain
`in-progress` until their stated native calibration, quantitative comparison,
representative-editability, and other promotion gates close. Browser-editor
controls for the new C5 operations, canonical general
insertion/duplication/reparenting serialization beyond the exact connector
exception, C9 deck input, arbitrary PPTX import, rich text, broader rendering,
and general PPTX conversion remain roadmap. The planned 0.1.1
text-resilience behavior is banked separately and is not accepted by current
loaders, resolvers, editors, or compilers.

## 2. Current design packet

Do not read the whole packet by default. Route by task:

| Task | Read first | Read next only when needed |
| --- | --- | --- |
| Produce, read, compare, edit, or convert an asset | [authoring skill](.agents/skills/pptv-authoring/SKILL.md) | [agent guide](PPTV-AGENT-GUIDE.md), then [profile](PPTV-PROFILE.md) for structure |
| Implement source, projections, patches, or diff | [processing API](PPTV-PROCESSING-API.md) | C4–C6 contracts and [profile](PPTV-PROFILE.md) |
| Build or inspect an actual deck/report | [HTML container](PPTV-HTML-CONTAINER.md) | [tooling/editor](PPTV-TOOLING-AND-EDITOR.md) |
| Work on the browser editor | [tooling/editor](PPTV-TOOLING-AND-EDITOR.md) | [agent guide](PPTV-AGENT-GUIDE.md) and C5/C6 contracts |
| Work on PowerPoint conversion/recovery | [SVG→PPTX playbook](SVG-TO-EDITABLE-PPTX.md) | C7/C9/C10/C11 contracts |
| Plan the next implementation slice | [implementation plan](PPTV-IMPLEMENTATION-PLAN.md) | [0.1.1 text design](PPTV-TEXT-RESILIENCE-0.1.1.md) when text behavior is involved |

Use
[`examples/minimal-diagram.pptv.svg`](examples/minimal-diagram.pptv.svg) as
the smallest standalone arbitrary-viewBox atom. Use
[`examples/minimal-deck.pptv.html`](examples/minimal-deck.pptv.html) only when
the task needs manifest order, shared themes, extraction, the fixed viewer, or
the C7 deck canary.

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

For a one-slide PPTX, `compile` consumes the atom directly and the composed
HTML is internal unless explicitly requested. For an asset suite, track the
atoms themselves; do not create HTML merely to group filenames.

## 4. Core decisions

### 4.1 SVG is the canonical visual language

Slide geometry and semantic objects remain ordinary SVG. A PPTV file adds stable
identity and explicit conversion intent but remains browser-renderable.

### 4.2 HTML is an explicit portable deck/report envelope

A `.pptv.html` file can contain the complete deck, shared CSS themes, reusable
symbols, and a tiny browser runtime without requiring users to manage many peer
files.

The independent `.pptv.svg` atom is the default unit for a diagram or doc
figure, reusable visual, or slide-sized canvas. HTML is selected only when deck
or report semantics are required and remains the current C7 compilation input.
C9 can explicitly compose one self-contained atom into a new generated
one-slide HTML deck; it does not add an atom to an existing deck. External
manifests are inventory-only, and future multi-file composition still needs
explicit hashes, capabilities, roots, and cycle behavior.

### 4.3 The manifest is the deck table of contents

The leading manifest defines slide order and active theme. Reordering slides
means editing one compact array, not moving large SVG subtrees.

### 4.4 SVG DOM order is object z-order

Inside each slide, document order remains the only canonical painter and
PowerPoint shape-tree order. PPTV does not add a competing `z-index` or numeric
z-order field.

### 4.5 Local SVG styling is atom authority; deck CSS is collection authority

A standalone atom resolves only concrete local presentation attributes and
supported inline style. It forbids class, stylesheet, theme-token, custom
property, and external styling authority so that it remains hydration-complete.

An HTML deck may additionally use the contracted base stylesheet, component
classes, and complete selected theme tokens. In either source kind, PPTV
annotations control stable identity, export representation, connector
relationships, and round-trip intent; descriptive metadata never silently
becomes styling authority.

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
transactions. The wider C5 1.3 typed geometry/style/order/deletion vocabulary
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

### 4.17 Template lineage is descriptive, versioned, and hash-verifiable

Source/profile 0.1 has no machine-readable template or design-family identity.
Agents must not infer lineage from appearance, filenames, comments, deck layout
labels, or matching colors.

The next C4/C6 source successor should define one optional inert direct-child
SVG `<metadata>` envelope with a strict schema. It should distinguish:

- immediate derivation origin that tooling can prove;
- logical template family/version plus the exact template-byte SHA-256; and
- optional design-system family/version/hash as a non-authoritative assertion.

The payload must contain no local path, hostname, username, email, executable
instruction, or fetchable dependency. Exact hashes can prove equality against
known local metadata; family labels alone cannot. Metadata never controls
rendering, stable object identity, or style. Cheap outline/identity projections
should expose it, and extraction, patches, editor downloads, compilation maps,
and reconciliation must preserve or explicitly transform it. Legacy atoms
without metadata remain valid.

### 4.18 The public name is a production gate, not a cosmetic alias

PPTV accurately describes the original PowerPoint goal but now understates a
destination-neutral visual atom. `Slide180` and `Diagram180` each bind the same
atom to one use. The current leading replacement is `Vector180`: it describes
the SVG-native common layer while leaving PowerPoint as an adapter and allowing
both diagrams and slides.

No rename has been implemented. Before production, record one atomic migration
decision covering the format family, compound atom/deck suffixes, package, CLI,
skill, TypeScript API, wire prefixes, contracts, schemas, and bounded legacy
read behavior. New metadata and the 0.1.1 source successor should land only on
the chosen public namespace. Avoid a docs-only rename or mixed namespaces
inside one artifact.

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

1. decide and migrate the destination-neutral public format namespace before
   adding another source-version family;
2. contract inert template/design-family lineage and stable-ID-aware semantic
   source diff without making metadata styling authority;
3. calibrate representative C8 lines against native PowerPoint while retaining
   environment-specific Node/browser identities;
4. promote the banked 0.1.1 text behavior only through successor
   source/patch/resolved/compiler contracts and conformance fixtures;
5. expose useful browser-editor controls for the current C5 1.3 vocabulary and
   contract additional operations only with exact-source fixtures;
6. extend C9 to deck input or additional native/asset features only where the
   same editor and reverse fixtures pass;
7. add C11 quantitative cross-renderer browser/Office visual baselines and
   checked human review;
8. pass native PowerPoint representative edit/save/reopen for C9/C10
   artifacts; C11's 2026-08-02 exact-path no-op save/close/reopen pass is a
   narrower structural/normalization proof, not this gate;
9. define canonical structural serialization before general insertion,
   duplication beyond the exact reviewed connector exception, reparenting, or
   group creation; and
10. complete at least one independent implementation or adapter experiment.

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
renderer-specific evidence identities plus exact-path no-op lifecycle are
decided. The 0.1.1
paragraph-intent/resilience direction is banked but not executable.
C4/C5/C6 are verified authorities; C7 through C11 are contracted, implemented,
in-progress authorities for their narrow compiler, preflight, atom-baseline,
reconciliation, and evidence surfaces. Broader behavior still requires
promotion through contracts and fixtures.
