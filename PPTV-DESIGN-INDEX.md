# PPTV Design Index

**Status:** executable 0.1 source/editor/compiler vertical slice plus broader roadmap
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

### Implemented baseline (2026-07-29)

The single TypeScript package `@office180/pptv` now implements the first
contracted vertical slice:

- strict, non-executing recognition and scanning of PPTV HTML, SVG, and manifest
  source forms;
- semantic loading of one self-contained `pptv: "0.1"` HTML deck;
- exact retained UTF-8 bytes and text, including a leading BOM and original
  newline spelling, with SHA-256 over those exact bytes;
- half-open UTF-8 byte and UTF-16 code-unit ranges plus one-based source
  positions;
- immutable, source-hash-bound deck/index snapshots and JSON-safe outline,
  inventory, text, semantic, and editing projections;
- transactional `set-text`, `set-active-theme`, and `set-slide-order` patches;
- exact-source browser sessions, trusted strict-CSP editor-pack generation, and
  a literal-data resolved-model viewport;
- fail-closed C6 fixed-canvas CSS/geometry/group/explicit-line text resolution;
- deterministic C7 fresh-PPTX compilation for the strict primitive subset,
  validated by ISO/ECMA schemas, OpenDocKit reopen, and native PowerPoint
  open/render without repair;
- pure C8 anchor-aware text-fit evidence plus an explicit exact-font Node
  adapter; and
- `outline`, `validate`, `resolve`, `editor-pack`, `pptx-canary`, `text-fit`,
  `text`, `show`, `list`, and `patch` CLI commands.

Contracts
[`CONTRACT-C4-PPTV-SOURCE.1.0.md`](architecture/CONTRACT-C4-PPTV-SOURCE.1.0.md)
and
[`CONTRACT-C5-PPTV-PATCH.1.0.md`](architecture/CONTRACT-C5-PPTV-PATCH.1.0.md),
the shipped schemas, implementation, and fixtures are normative for that
implemented slice. C6, C7, and C8 are implemented but remain `in-progress`
until their parity, corpus, text-fit calibration, quantitative render, and
native save/reopen gates close. Writable bundled controls, geometry/structural
editing, canonical serialization, compilation beyond the canary, and
reconciliation remain roadmap.

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
   canary, conformance gates, and later reconciliation.

6. **[`PPTV-AGENT-GUIDE.md`](PPTV-AGENT-GUIDE.md)**

   Defines the operational `pptv-agent/1` profile: minimum-view selection,
   semantic patch discipline, trust boundaries, task recipes, failure behavior,
   and validation/reporting rules.

7. **[`SVG-TO-EDITABLE-PPTX.md`](SVG-TO-EDITABLE-PPTX.md)**

   Provides the practical reconstruction and QA playbook that motivated PPTV:
   hybrid native/asset conversion, stable PowerPoint object names, source maps,
   render comparison, and reverse inspection.

8. **[`examples/minimal-deck.pptv.html`](examples/minimal-deck.pptv.html)**

   A deliberately small browser-openable and C7-compilable specimen showing
   manifest-defined slide order, inert slide sources, multiple inert themes,
   stable IDs, and the final reference viewer runtime.

9. **[`.agents/skills/pptv-authoring/SKILL.md`](.agents/skills/pptv-authoring/SKILL.md)**

   The repo-scoped, auto-discovered operational workflow for strict deck
   creation/repair, no-reflow text authoring, exact-font overflow audits,
   editor-pack generation, and C7 canary compilation. It packages the design
   packet and gates; it does not replace the contracts.

These files mix implemented status with design rationale. C4 and C5 are the
verified behavioral authorities for the 0.1 source and patch kernels; C6, C7,
and C8 are implemented, tested, in-progress compiler/verification surfaces.
Prose beyond those surfaces remains roadmap until promoted through a contract
and fixture.

## 3. Artifact family

PPTV uses escalating source forms rather than requiring a project directory for
every diagram:

```text
diagram.pptv.svg                 recognition/inventory only; semantic support future
mydeck.pptv.html                 implemented portable whole-deck source
mydeck.pptv-manifest.json        recognition only; external orchestration future
mydeck.editable.pptv.html        implemented generated read-only trusted wrapper
mydeck.pptx                      current strict canary; broader compiler future
mydeck.pptv.map.json             future generated source/object baseline
mydeck.pptv.patch.json           future generated reviewable reverse patch
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

External decomposition remains a design direction when it provides real value.
The 0.1 scanner can recognize/inventory standalone SVG and external manifests,
but semantic loading, editing, resolution, and compilation require one
self-contained `.pptv.html` deck.

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

### 4.13 The first editor/compiler profile is fixed 16:9

The first compiler-grade profile uses one exact `0 0 1600 900` viewBox and one
deck-wide PowerPoint Widescreen size. Alternate aspect ratios remain a
versioned deck-level extension. They are never inferred, stretched silently, or
varied per slide.

### 4.14 Native text never reflows automatically

The first native text surface is explicit-line text with explicit typography
and frame geometry. The editor may expose a paragraph-like multiline field, but
source and PowerPoint output retain hard lines. Wrapping, autofit,
shrink-to-fit, and font-size adjustment are outside the profile.

### 4.15 The direct-open editor is a generated trusted wrapper

The implemented `.editable.pptv.html` foundation is a deterministic,
strict-CSP application wrapper around the exact canonical deck bytes and hash.
It exports a clean canonical deck and never promotes browser DOM serialization
to source authority. Its bundled UI is intentionally read-only until writable
controls and stale-safe persistence pass their own gates.

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
PPTV SVG Core       constrained standalone slide
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

The source/patch kernels, resolved model, trusted editor foundation, and strict
PPTX canary have satisfied the first executable promotion steps. The full
visual/editor/PowerPoint profile still must not be declared a stable standard
based on prose alone. Remaining promotion work includes:

1. lock the C8 worked-deck inventory, add environment-labeled browser/editor
   warnings, and calibrate representative lines against native PowerPoint;
2. complete the C6 standalone fixture corpus and Node/browser JSON parity;
3. bundle writable editor controls and stale-safe user-granted persistence;
4. implement editor operations beyond the three 0.1 patches;
5. extend compilation only with features covered by the same editor fixtures;
6. add quantitative browser/Office visual baselines;
7. pass native PowerPoint PPTX save/reopen (open/render already passes);
8. define canonical structural serialization before insert/delete/group
   authoring; and
9. complete at least one independent implementation or adapter experiment.

The conformance corpus is part of the standard, not supplementary test code.

## 9. Implemented 0.1 command slice

The source package currently provides:

```text
pptv outline
pptv validate
pptv resolve
pptv editor-pack
pptv pptx-canary
pptv text-fit
pptv text
pptv show
pptv list
pptv patch
```

`patch` requires exactly one of `--check` or an explicit `--output`;
`editor-pack` and `pptx-canary` also require explicit destinations; `text-fit`
requires an explicit font map. There is no implicit overwrite. Rich editor
commands, compilation beyond C7, and reconciliation remain roadmap. The
implemented slice proves the source container, stable identity, semantic
loading, projections, constrained patch discipline, trusted read-only editor
foundation, exact-font non-mutating fit evidence, and deterministic strict-subset PPTX
synthesis.

## 10. Open design questions

The following implementation details remain intentionally unresolved until the
next contract, fixtures, and prototypes provide evidence:

- version naming across contract 1.0, manifest/container `0.1`, future SVG
  profile versions, viewer versions, and agent-profile versions;
- authority and mismatch behavior for manifest title/layout/agent profile and
  their HTML/SVG mirrors;
- library reference syntax, expansion, identity qualification, and dependency
  hashing;
- installed-font/substitution detection, visual-fidelity environment recording,
  and any future concrete font allowlist;
- static resource-table and fallback-media syntax for opaque SVG/raster assets;
- canonical formatting versus maximal preservation during structural edits;
- the broader master/layout/source-map surface beyond C7's validated blank
  canary graph;
- and the exact public OpenDocKit adapter/extraction boundary after its
  text-save, package-builder, test-rigor, and license blockers are resolved.

Exact BOM handling, UTF-8/UTF-16 range coordinates, source hashing, strict
default section order, the fixed viewer-runtime digest policy, initial 16:9
scope, explicit frame/line-step syntax, constrained base/theme CSS, opaque SVG
bounds, no-reflow text behavior, no-theme-inheritance direction, and C7's
minimum fresh package are decided. C4/C5 are verified authorities; C6/C7/C8
are contracted, implemented, in-progress authorities for their narrow
surfaces. Broader behavior still requires promotion through contracts and
fixtures.
