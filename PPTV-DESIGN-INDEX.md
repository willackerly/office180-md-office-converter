# PPTV Design Index

**Status:** design packet; no executable PPTV implementation yet  
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

5. **[`SVG-TO-EDITABLE-PPTX.md`](SVG-TO-EDITABLE-PPTX.md)**  
   Provides the practical reconstruction and QA playbook that motivated PPTV:
   hybrid native/asset conversion, stable PowerPoint object names, source maps,
   render comparison, and reverse inspection.

6. **[`examples/minimal-deck.pptv.html`](examples/minimal-deck.pptv.html)**  
   A deliberately small browser-openable specimen showing manifest-defined slide
   order, inert slide sources, multiple inert themes, stable IDs, and the final
   reference viewer runtime.

These files are design rationale. A later versioned contract and conformance
suite will become normative.

## 3. Artifact family

PPTV uses escalating source forms rather than requiring a project directory for
every diagram:

```text
diagram.pptv.svg                 one standalone slide or diagram
mydeck.pptv.html                 preferred portable whole-deck source
mydeck.pptv-manifest.json        optional external multi-file orchestration
mydeck.editable.pptv.html        optional generated deck plus editor application
mydeck.pptx                      generated editable PowerPoint
mydeck.pptv.map.json             generated source/object baseline
mydeck.pptv.patch.json           generated reviewable reverse patch
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

External decomposition remains available when it provides real value.

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

### 4.9 The semantic model is canonical; every other model is a projection

```text
PPTV source spans
  -> PPTV hierarchical semantic tree
       -> browser DOM
       -> editor interaction model
       -> agent projections
       -> normalized compiler model
       -> OpenDocKit / PowerPoint adapter IR
```

The browser DOM, a flat spatial model, generated PPTX, and OpenDocKit IR are not
sources of truth for native PPTV editing.

### 4.10 Agents edit through semantic operations

The normal agent path is:

```text
outline -> retrieve selected semantic objects -> apply stable-ID patch -> validate
```

Reading or rewriting the complete HTML/SVG/CSS source is an explicit diagnostic
or escape-hatch operation, not the default.

### 4.11 The native editor is purpose-built

The PPTV editor should be written from scratch around PPTV's small semantic
surface. It uses the canonical SVG as its visible editing layer and emits the
same semantic operations used by the CLI and agents.

It is not a reduced mode of an arbitrary PPTX editor.

### 4.12 OpenDocKit is a selective dependency and reference implementation source

OpenDocKit can contribute battle-tested geometry, fonts, SVG interaction,
rich-text editing patterns, deltas, OPC/OOXML handling, PowerPoint semantics,
and fidelity infrastructure.

PPTV must not inherit OpenDocKit's general arbitrary-Office complexity on its
native path. Reuse occurs through small packages or adapters.

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

## 8. Promotion path

The current documents should not be declared a stable standard based on prose
alone. Promotion requires:

1. versioned behavioral contracts;
2. JSON Schemas and TypeScript types;
3. a scanner and validator;
4. a canonical serialization policy;
5. a reference viewer runtime;
6. minimal and kitchen-sink fixtures;
7. expected diagnostics for invalid fixtures;
8. semantic patch round-trip tests;
9. browser snapshots and visual baselines;
10. generated PPTX fixtures and structural validation;
11. native PowerPoint open-without-repair checks; and
12. at least one independent implementation or implementation experiment.

The conformance corpus is part of the standard, not supplementary test code.

## 9. Recommended first implementation slice

The first useful release does not need an editor or PPTX compiler. It should
provide:

```text
pptv outline
pptv show
pptv list
pptv text
pptv theme
pptv patch
pptv validate
pptv normalize
```

That slice proves the source container, stable identity, lazy processing,
semantic model, and patch discipline. The viewer, native editor, and PowerPoint
adapter then become clients of the same core rather than parallel
implementations.

## 10. Open design questions

The following remain intentionally unresolved until fixtures and prototypes
provide evidence:

- exact manifest MIME type and schema URI;
- whether strict physical source order is mandatory in every conformance class;
- whether theme inheritance uses CSS imports, manifest metadata, or a constrained
  `extends` field;
- the precise editable text and `tspan` subset;
- source-range representation across UTF-8 bytes versus JavaScript string
  offsets;
- canonical formatting versus maximal preservation during structural edits;
- reference runtime embedding, external referencing, and digest policy;
- the smallest viable PowerPoint master/layout synthesis surface;
- which OpenDocKit modules should be extracted into standalone packages;
- and whether `.editable.pptv.html` enters the first standard or remains a
  generated convenience convention.

These questions should be resolved through contracts and fixtures rather than
implicit implementation behavior.
