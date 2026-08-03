# Vector180 Design Index

**Status:** executable 0.1 source/editor, typed-patch, atom-composition,
compiler-baseline, and bounded-reconciliation slice; banked 0.1.1
text-resilience direction; plus broader roadmap
**Audience:** implementers, tool authors, presentation-system designers, and agents  
**Canonical public name:** Vector180
**Legacy dialect:** PPTV 0.1, readable but read-only until explicit migration

## 1. Purpose

Vector180 is the current name for a constrained, web-native visual source model
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

Vector180 does not attempt to replace SVG, HTML, CSS, or PresentationML. It defines a
strict intersection and a set of author-intent annotations that make reliable
translation possible.

### Default source posture

The canonical default is one fully hydrated standalone `*.vector180.svg` atom. It is
self-contained: one strict SVG root, stable IDs, explicit geometry and hard
lines, concrete local styling, and no manifest, deck CSS/theme authority,
runtime, or external dependency. A suite of diagrams remains a suite of atoms.

Use `*.vector180.html` only when the artifact is an actual ordered multi-slide
deck/report or needs shared deck themes, the fixed viewer, or the deck-only C7
compiler. Generated `*.editable.html` and `*.composed.vector180.html` files are
derived artifacts. A one-slide PowerPoint branch compiles directly from the
atom; HTML composition is not a source prerequisite.

### Implemented, locally test-accepted release candidate (2026-08-02)

The single TypeScript package `@office180/vector180@0.1.0-alpha.5` now implements
the first contracted vertical slice and has passed the current local
repository, package, browser, packaging, and installed-style CLI paths. It is
not npm-published, and package-level acceptance does not promote every
successor contract:

- strict, non-executing recognition/scanning of Vector180 HTML, SVG, and manifest
  forms plus namespace-aware XML well-formedness for standalone SVG;
- semantic loading of either one self-contained `.vector180.svg` diagram atom or
  one self-contained `vector180: "0.1"` HTML deck, with no synthetic coercion;
- exact retained UTF-8 bytes and text, including a leading BOM and original
  newline spelling, with SHA-256 over those exact bytes;
- half-open UTF-8 byte and UTF-16 code-unit ranges plus one-based source
  positions;
- immutable, source-hash-bound diagram/deck indexes and artifact-specific
  JSON-safe outline, inventory, text, semantic, and editing projections;
- one `vector180-patch/0.1` envelope covering direct text/deck transactions,
  typed geometry, connector, explicit group-translation,
  direct text-frame, within-parent order, safe-deletion, and concrete
  presentation-attribute style operations, plus exactly one
  exact-template same-parent native straight connector clone;
- exact-source browser sessions and writable strict-CSP diagram/deck editor
  packs with literal C6 viewports, clean source download, exact undo/redo, and
  stale-safe user-granted persistence;
- fail-closed C6 arbitrary-canvas diagram and fixed-16:9 deck
  CSS/geometry/group/explicit-line text resolution;
- deterministic CSS/theme hydration of a resolvable deck slide into an
  independently reloaded/resolved `.vector180.svg` atom;
- deterministic shared browser/editor bundles and normalized C4/C6 parity
  across Chromium, Firefox, and WebKit;
- deterministic C7 fresh-PPTX compilation for the strict primitive subset,
  with canonical envelope/refusal and separate-process/time-zone determinism
  tests; C7's complete durable OPC/XSD/independent-validity oracle and
  frozen-artifact acceptance gates remain open;
- verified C8 2.0 anchor-aware text-fit evidence with exact-font Node and
  explicit-byte browser adapters, worked-deck inventory, and checked
  three-engine evidence;
- explicit C9 identity or uniform-scale-plus-translation placement of one
  standalone atom into a deterministic self-contained one-slide deck, plus a
  paired native PPTX and hash-bound source/object baseline map;
- authenticated C10 2.0 inspection of an edited descendant of that C9
  baseline, producing named native-save normalization proofs, deterministic
  findings/candidates/resolution options, bounded typed C5 proposals, and one
  strict hash/fingerprint-bound reviewed connector-copy path; patchable results
  are proved by temporary C5 application, C4/C6 reload, exact-placement C9
  regeneration, and reinspection;
- C11 evidence envelopes, deterministic trusted-SVG browser capture,
  DOCX/PPTX Quick Look smoke, deterministic image comparison, and a bounded
  exact-path native no-op lifecycle bridge; plus a durable SHA-locked
  Vector180 browser/Quick Look/C9-C10 round-trip bundle whose PowerPoint edit
  is a deterministic DrawingML simulation, not a native edit; and
- validation-locked `new atom`/`new deck`; generic `outline`, `validate`,
  `resolve`, `editor-pack`, `text-fit`, `text`, `show`, `list`, and `patch`;
  atom-only `metadata`, `metadata-compare`, and `diff`; explicit legacy-atom
  `migrate`; deck-only `extract` and `pptx-canary`; and standalone-atom
  `compose`, `compile`, and baseline-aware `reconcile`.

Contracts
[`CONTRACT-C4-PPTV-SOURCE.2.0.md`](architecture/CONTRACT-C4-PPTV-SOURCE.2.0.md)
and
[`CONTRACT-C5-PPTV-PATCH.2.0.md`](architecture/CONTRACT-C5-PPTV-PATCH.2.0.md),
the C6–C8 contracts, and
[`CONTRACT-C9-PPTV-PPTX-BASELINE.2.0.md`](architecture/CONTRACT-C9-PPTV-PPTX-BASELINE.2.0.md),
[`CONTRACT-C10-PPTV-PPTX-RECONCILIATION.2.0.md`](architecture/CONTRACT-C10-PPTV-PPTX-RECONCILIATION.2.0.md),
and
[`CONTRACT-C11-OFFICE-VISUAL-EVIDENCE.1.2.md`](architecture/CONTRACT-C11-OFFICE-VISUAL-EVIDENCE.1.2.md),
together with the shipped schemas, implementation, and fixtures, are normative
for that implemented slice. C8 2.0 is verified. C4–C7 and C9–C12 remain
`in-progress` for their own remaining rows: complete C4/C12 corpora; C5/C6
family and full-corpus locks; C7 durable OPC/XSD/independent-validity and
frozen-artifact checks; C9/C10 family, counterexample, independent/native checks; and C11
controlled-font, cross-family, PDF, representative-native, native-fidelity,
and hash-bound human-review evidence. This preserves historical 1.x evidence
without pretending it alone proves the destination-neutral cutover.
Browser-editor controls for the new C5 operations, canonical general
insertion/duplication/reparenting serialization beyond the exact connector
exception, C9 deck input, arbitrary PPTX import, rich text, broader rendering,
and general PPTX conversion remain roadmap. The planned 0.1.1
text-resilience behavior is banked separately and is not accepted by current
loaders, resolvers, editors, or compilers.

## 2. Current design packet

Do not read the whole packet by default. Route by task:

Ordinary work is intentionally three-tiered: the 27-line, approximately
1.2 KB scaffold plus approximately 4.5 KB atom card; narrow semantic outputs
of roughly 0.15–0.6 KB for routine inspection; then focused references and
contracts only on demand. A full starter `resolve` projection is approximately
23.8 KB and belongs in the last tier when compiler-grade detail is necessary.
The deep design packet is not base authoring context.

| Task                                              | Read first                                                                                                                                              | Read next only when needed                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Produce, read, compare, edit, or convert an asset | [authoring skill](.agents/skills/vector180-authoring/SKILL.md) and its [one-page atom card](.agents/skills/vector180-authoring/references/atom-card.md) | [agent guide](VECTOR180-AGENT-GUIDE.md), then [profile](VECTOR180-PROFILE.md) for uncommon structure |
| Implement source, projections, patches, or diff   | [processing API](VECTOR180-PROCESSING-API.md)                                                                                                           | C4–C6 contracts and [profile](VECTOR180-PROFILE.md)                                                  |
| Build or inspect an actual deck/report            | [HTML container](VECTOR180-HTML-CONTAINER.md)                                                                                                           | [tooling/editor](VECTOR180-TOOLING-AND-EDITOR.md)                                                    |
| Work on the browser editor                        | [tooling/editor](VECTOR180-TOOLING-AND-EDITOR.md)                                                                                                       | [agent guide](VECTOR180-AGENT-GUIDE.md) and C5/C6 contracts                                          |
| Work on PowerPoint conversion/recovery            | [SVG→PPTX playbook](SVG-TO-EDITABLE-PPTX.md)                                                                                                            | C7/C9/C10/C11 contracts                                                                              |
| Plan the next implementation slice                | [implementation plan](VECTOR180-IMPLEMENTATION-PLAN.md)                                                                                                 | [0.1.1 text design](VECTOR180-TEXT-RESILIENCE-0.1.1.md) when text behavior is involved               |

Use
[`examples/minimal-diagram.vector180.svg`](examples/minimal-diagram.vector180.svg) as
the smallest standalone arbitrary-viewBox atom. Use
[`examples/minimal-deck.vector180.html`](examples/minimal-deck.vector180.html) only when
the task needs manifest order, shared themes, extraction, the fixed viewer, or
the C7 deck canary.

These files mix implemented status with design rationale. C8 2.0 is verified;
C4–C7 and C9–C12 remain `in-progress` while their contract-specific acceptance
matrices are exercised. Implemented bounded surfaces have local test evidence,
but prose beyond those surfaces remains roadmap until promoted through a
contract and fixture.

## 3. Artifact family

Vector180 uses escalating source forms rather than requiring a project directory for
every diagram:

```text
diagram.vector180.svg                 implemented default standalone diagram atom
mydeck.vector180.html                 implemented portable whole-deck source
mydeck.vector180-manifest.json        recognition only; external orchestration future
mydeck.editable.html                  implemented generated writable trusted wrapper
mydeck.pptx                      current strict deck-only C7 canary
diagram.composed.vector180.html       C9 deterministic one-atom/one-slide composition
diagram.pptx                     C9 strict standalone-atom compiler baseline
diagram.vector180.map.json            C9 generated hash-bound source/object baseline
diagram.reconciliation.json      C10 read-only reconciliation report
diagram.vector180.patch.json          C10 reviewable patch when every change is patchable
```

The manifest filename is a convention. JSON is not an alternate encoding of
Vector180; it is only deck orchestration metadata.

For a one-slide PPTX, `compile` consumes the atom directly and the composed
HTML is internal unless explicitly requested. For an asset suite, track the
atoms themselves; do not create HTML merely to group filenames.

## 4. Core decisions

### 4.1 SVG is the canonical visual language

Slide geometry and semantic objects remain ordinary SVG. A Vector180 file adds stable
identity and explicit conversion intent but remains browser-renderable.

### 4.2 HTML is an explicit portable deck/report envelope

A `.vector180.html` file can contain the complete deck, shared CSS themes, reusable
symbols, and a tiny browser runtime without requiring users to manage many peer
files.

The independent `.vector180.svg` atom is the default unit for a diagram or doc
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
PowerPoint shape-tree order. Vector180 does not add a competing `z-index` or numeric
z-order field.

### 4.5 Local SVG styling is atom authority; deck CSS is collection authority

A standalone atom resolves only concrete local presentation attributes and
supported inline style. It forbids class, stylesheet, theme-token, custom
property, and external styling authority so that it remains hydration-complete.

An HTML deck may additionally use the contracted base stylesheet, component
classes, and complete selected theme tokens. In either source kind, Vector180
annotations control stable identity, export representation, connector
relationships, and round-trip intent; descriptive metadata never silently
becomes styling authority.

### 4.6 Themes appear late in the physical source

Strict `.vector180.html` uses a deliberate book-like source order:

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
exact Vector180 source bytes and spans
  -> Vector180 hierarchical semantic tree
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
not sources of truth for native Vector180 editing.

### 4.10 Agents edit through semantic operations

The normal agent path is:

```text
outline -> retrieve selected semantic objects -> apply stable-ID patch -> validate
```

Reading or rewriting the complete HTML/SVG/CSS source is an explicit diagnostic
or escape-hatch operation, not the default.

### 4.11 The native editor is purpose-built

The Vector180 editor should be written from scratch around Vector180's small semantic
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
changing Vector180 authority or making arbitrary Office parsing part of the native
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
no physical size. The zero-decision atom scaffold uses `0 0 1600 900`, the
common 16:9 profile; another atom ratio is always an explicit author choice.
The first PowerPoint compiler profile likewise uses exact `0 0 1600 900`
slides and one deck-wide Widescreen size. Alternate deck ratios remain a
versioned extension; they are never inferred, stretched, or varied silently
per slide.

### 4.14 Executable 0.1 native text never reflows automatically

The first native text surface is explicit-line text with explicit typography
and frame geometry. The editor may expose a paragraph-like multiline field, but
source and PowerPoint output retain hard lines. Wrapping, autofit,
shrink-to-fit, and font-size adjustment are outside the profile.

The banked
[`VECTOR180-TEXT-RESILIENCE-0.1.1.md`](VECTOR180-TEXT-RESILIENCE-0.1.1.md)
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
Its current controls commit C5 direct text plus deck-only theme/order
transactions. The wider C5 2.0 typed geometry/style/order/deletion vocabulary
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
translation when aspect ratios agree. An aspect mismatch fails closed. Vector180
never silently stretches, crops, letterboxes, or infers physical size from an
arbitrary atom viewBox.

This is not general deck assembly: C9 currently refuses deck input, external
dependencies, multiline text, opaque SVG/raster assets, rounded rectangles,
and non-unit opacity. Capability, qualified-ID, dependency-hash, multi-root,
and cycle rules remain future external-composition work. C7 remains the
separate deck-only canary.

### 4.17 Template lineage is descriptive, versioned, and hash-verifiable

Vector180 0.1 permits one optional inert direct-child SVG `<metadata>` envelope
identified by `data-vector180-metadata="vector180-atom-metadata/0.1"`. It can
describe:

- immediate derivation origin that tooling can prove;
- logical template family/version plus the exact template-byte SHA-256; and
- optional design-system family/version/hash as a non-authoritative assertion.

The payload must contain no local path, URL, hostname, username, email,
executable instruction, or fetchable dependency. Exact hashes can prove
equality against known local metadata; family labels alone cannot. Metadata
never controls rendering, stable object identity, or style. `metadata`,
`metadata-compare`, outline, extraction, patches, editor downloads, C9 sidecar
maps, and reconciliation preserve or project it under their contracts; a
composed HTML slide itself remains metadata-free. A
derived style-palette fingerprint is comparison evidence only and is never
persisted as source authority. Atoms without metadata remain valid.

### 4.18 Vector180 is the canonical public name

PPTV accurately described the original PowerPoint goal but understated a
destination-neutral visual atom. `Slide180` and `Diagram180` would each bind
the same atom to one use. `Vector180` names the SVG-native common layer while
leaving PowerPoint as an adapter and allowing both diagrams and slides.

The migration is atomic across compound suffixes, package, CLI, skill,
TypeScript API, wire prefixes, contracts, and schemas. PPTV 0.1 remains a
frozen legacy dialect: the canonical reader may inspect it, but every mutation
or export refuses. `vector180 migrate` writes a separate canonical atom from
one legacy SVG. For a legacy deck, `extract` may hydrate a selected slide into
a new canonical atom; callers explicitly build any new deck. A source may use
exactly one namespace. Comments, visible text, and stable IDs are content and
do not determine the dialect.

## 5. Authority hierarchy

When representations disagree, use this order:

1. versioned Vector180 contract and conformance fixtures;
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

A Vector180 source may declare known version identifiers for:

- the Vector180 profile;
- the HTML container;
- the agent guidance profile;
- the browser viewer runtime; and
- an optional editor runtime.

Freeform comments, visible slide text, CSS comments, and arbitrary embedded
instructions are document content, not trusted agent or compiler policy.

Strict mode rejects arbitrary executable scripts, event handlers, unexpected
network access, and runtime-generated canonical content.

Non-executing library validation does not make a source safe to direct-open.
Opening an untrusted `.vector180.html` in a browser executes its embedded script
before the library can validate it. Direct browser opening is therefore a
trusted-source convenience; untrusted input must be validated first and viewed
through an appropriate sandbox/CSP boundary.

## 7. Conformance classes under consideration

```text
Vector180 SVG Core       constrained standalone diagram atom
Vector180 HTML Deck      manifest-first portable deck container
Vector180 Authoring      local reusable CSS, symbols, and assets before normalization
Vector180 Tooling        projections, semantic patches, validation, serialization
Vector180 Template       theme, master, layout, and placeholder mapping
Vector180 PowerPoint     deterministic editable PPTX compilation
Vector180 Round Trip     baseline-aware edited-PPTX reconciliation
Vector180 Editor         native visual editing through semantic operations
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
3. expose useful browser-editor controls for the current C5 2.0 vocabulary and
   contract additional operations only with exact-source fixtures;
4. extend C9 to deck input or additional native/asset features only where the
   same editor and reverse fixtures pass;
5. add C11 quantitative cross-renderer browser/Office visual baselines and
   checked human review;
6. pass native PowerPoint representative edit/save/reopen for C9/C10
   artifacts; C11's 2026-08-02 exact-path no-op save/close/reopen pass is a
   narrower structural/normalization proof, not this gate;
7. define canonical structural serialization before general insertion,
   duplication beyond the exact reviewed connector exception, reparenting, or
   group creation; and
8. complete at least one independent implementation or adapter experiment.

The conformance corpus is part of the standard, not supplementary test code.

## 9. Implemented 0.1 command slice

The source package currently provides:

```text
vector180 outline
vector180 validate
vector180 resolve
vector180 new atom
vector180 new deck
vector180 extract
vector180 editor-pack
vector180 pptx-canary
vector180 compose
vector180 compile
vector180 reconcile
vector180 text-fit
vector180 text
vector180 show
vector180 list
vector180 patch
vector180 metadata
vector180 metadata-compare
vector180 diff
vector180 migrate
```

`patch` requires exactly one of `--check` or an explicit `--output`;
`editor-pack` and `pptx-canary` also require explicit destinations; `text-fit`
uses the shipped exact OFL default map when `--font-map` is omitted or
`default`; an explicit alternate map remains available. C9 `compose` requires an explicit placement and
deck destination; C9 `compile` requires explicit paired PPTX/map destinations;
C10 `reconcile` requires the exact source, C9 baseline, edited PPTX, and
explicit report/patch destinations. Reconciliation never applies its proposal:
that remains a separate `vector180 patch` transaction. There is no implicit
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
- the broader master/layout/source-map surface beyond C7's implemented blank
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
The destination-neutral C8 2.0 successor is verified. C4–C7 2.0, C9–C10 2.0,
C11 1.2, and C12 1.0 are implemented/`in-progress` authorities pending their
declared acceptance gates. Broader behavior still requires promotion through
contracts and fixtures.
