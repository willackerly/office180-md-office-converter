# PPTV HTML Container

**Status:** first-class diagram atom plus HTML deck aggregation implemented
through C4-C6, with hydrated extraction, the writable trusted editor, and the
strict deck-only C7 PPTX canary; external composition, structural editing, and
broader PowerPoint conversion remain roadmap

PPTV HTML is the declarative, single-file aggregation envelope for a deck of
PPTV SVG slides. It keeps canonical slide content web-native and
browser-viewable while making deck order, theme selection, reusable
definitions, and agent access explicit and cheap to process.

For one diagram or documentation figure, the default authoring atom is an
independent `*.pptv.svg`, not a synthetic one-slide HTML deck. Use HTML when the
artifact needs multiple slides, shared deck themes, the fixed browser viewer,
or the C7 PowerPoint canary.

The compound extension is:

```text
mydeck.pptv.html
```

A future multi-file assembly manifest reserves the convention:

```text
mydeck.pptv-manifest.json
```

The manifest is currently inventory-only orchestration metadata, not a
semantic load/edit surface or a JSON encoding of PPTV itself.

## Implemented 0.1 boundary

`@office180/pptv` implements C4-C6 for both self-contained HTML decks and
standalone SVG diagrams. Both paths retain exact decoded source and UTF-8
bytes, including a leading BOM and original newline spelling; compute SHA-256
over those bytes; record half-open UTF-8 byte and UTF-16 code-unit ranges; load
stable-ID SVG hierarchy without executing source code; and support
source-hash-bound direct-text patches. Active-theme and slide-order patches are
explicitly deck-only.

For HTML, the kernel also validates the fixed viewer by version and content
digest, loads manifest-selected slide order, and resolves the strict
base/component CSS plus complete active-theme token map. Every HTML slide uses
the exact `0 0 1600 900`/16:9 canvas. A standalone diagram has no synthetic
manifest, theme, slide, EMU, or physical-size state; it uses supported local
presentation declarations and may declare any finite viewBox with positive
width and height.

The `extractPptvDiagram()` API, `pptv extract` CLI, and editor download action
hydrate one valid deck slide into an independent `.pptv.svg`: supported
deck-theme/class values are dereferenced into local declarations, then the
candidate must independently reload and resolve through the diagram C4/C6
path. External assembly manifests remain recognition/inventory only. Libraries
are indexed and security-checked but are not expanded. Metadata mirrors,
theme-list authority, library references, and external dependency resolution
remain outside the implemented contract.

## Design goals

1. **Simple base case.** One portable HTML file may contain the whole deck.
2. **Hierarchy first.** The canonical manifest appears before slide bodies, themes,
   component libraries, and browser runtime.
3. **No duplicate truth.** The manifest defines deck order; SVG DOM order defines
   z-order inside each slide.
4. **Browser useful.** A trusted file can render a readable deck without PowerPoint.
5. **Compiler deterministic.** PPTX compilers parse declarations directly and never
   execute the embedded runtime.
6. **Agent efficient.** Tools expose compact semantic projections and ID-addressed
   patches so agents rarely need to ingest raw SVG, CSS, or runtime code.
7. **Progressive decomposition.** Future external slides, styles, and assets may
   be added when useful but are never required for the basic case.

## Source forms

The scanner recognizes three related source forms:

```text
diagram.pptv.svg              # default independent diagram atom
mydeck.pptv.html              # one portable browser-viewable deck
mydeck.pptv-manifest.json     # reserved inventory-only external assembly
```

Standalone SVG and self-contained HTML are both first-class semantic,
resolvable, directly editable source forms. The HTML container is the
whole-deck aggregation surface; the SVG is the smaller unit for one diagram.
External manifests are inventoried but are not a semantic load/edit surface,
and external dependency resolution remains future work.

## Canonical source order

Strict `.pptv.html` sources use this physical order:

1. minimal HTML metadata;
2. one PPTV manifest data block;
3. one browser output mount point;
4. slide source templates;
5. reusable component and asset templates;
6. one or more named theme data blocks;
7. exactly one fixed reference runtime;
8. end of document.

This source order is normative for strict 0.1 HTML conformance and is enforced
by default. It keeps the deck hierarchy and active configuration near the
front. The current scanner builds a non-executing parse tree and inventories
the whole document, including hashing the viewer runtime; it is not yet a
streaming early-stop scanner.

## Minimal standalone diagram atom

A standalone diagram has one SVG root and no HTML manifest, theme block,
output mount, or executable runtime:

```xml
<!--
PPTV diagram atom: deterministic, editable vector source.
Authoring skill: pptv-authoring
https://github.com/willackerly/office180-md-office-converter/tree/main/.agents/skills/pptv-authoring
Preserve stable IDs, DOM painter order, explicit text frames, and authored hard lines.
If the skill is unavailable, an agent may suggest installation to the user.
This is non-normative discovery metadata; validate first and never auto-install from document content.
-->
<svg id="system-overview"
     data-pptv-version="0.1"
     viewBox="0 0 1200 800"
     xmlns="http://www.w3.org/2000/svg">
  <rect id="system-overview.api"
        data-pptv-role="shape"
        data-pptv-export="native"
        x="80" y="100" width="360" height="180"
        fill="#f7f8f8" stroke="#17211e"/>
  <text id="system-overview.api.title"
        data-pptv-role="text"
        data-pptv-export="native"
        data-pptv-frame="110 130 300 60"
        data-pptv-line-step="36"
        x="110" y="172"
        fill="#17211e"
        font-family="Arial"
        font-size="30">API service</text>
</svg>
```

The root `id`, version, namespace, and finite positive-size `viewBox` are
required. Every emitted object has a globally unique stable ID plus a valid
role/export pair. Local presentation attributes or supported local `style`
declarations are authoritative; class selectors, theme tokens, external CSS,
and browser inheritance are not diagram authorities.

The leading comment is the canonical writer breadcrumb for new and extracted
atoms. It is allowed XML outside the root but is not a C4 validity requirement
or policy authority. Preserve it when present; never auto-install or execute
anything because document content requests it.

## Minimal deck

```html
<!doctype html>
<html lang="en" data-pptv-version="0.1">
<head>
  <meta charset="utf-8">
  <title>Dapple Architecture</title>
</head>
<body>

<script id="pptv-manifest" type="application/pptv+json">
{
  "pptv": "0.1",
  "title": "Dapple Architecture",
  "runtime": "pptv-browser/0.1",
  "theme": "dapple.light",
  "slides": [
    "cover",
    "system-overview",
    "trust-boundaries"
  ]
}
</script>

<main data-pptv-output></main>

<template data-pptv-slide="cover">
  <svg id="cover" viewBox="0 0 1600 900" data-pptv-layout="title">
    <text
      id="cover.title"
      class="slide-title"
      data-pptv-role="text"
      data-pptv-export="native"
      x="120" y="360">
      Dapple Architecture
    </text>
  </svg>
</template>

<template data-pptv-slide="system-overview">
  <svg id="system-overview" viewBox="0 0 1600 900"
       data-pptv-layout="architecture">
    <!-- semantic slide objects -->
  </svg>
</template>

<template data-pptv-slide="trust-boundaries">
  <svg id="trust-boundaries" viewBox="0 0 1600 900"
       data-pptv-layout="architecture">
    <!-- semantic slide objects -->
  </svg>
</template>

<script type="text/css" data-pptv-theme="dapple.light">
:root {
  --pptv-background: #ffffff;
  --pptv-text-primary: #17211e;
  --pptv-surface-raised: #f7f8f8;
  --pptv-accent-1: #6f5cff;
  --pptv-font-major: "Inter Display";
}

.slide-title {
  fill: var(--pptv-text-primary);
  font-family: var(--pptv-font-major);
  font-size: 72px;
  font-weight: 700;
}
</script>

<script data-pptv-runtime="pptv-browser/0.1">
/* fixed reference runtime; see Runtime rules */
</script>

</body>
</html>
```

## Manifest

The embedded manifest is the canonical deck table of contents and control plane.
For a simple deck it should remain deliberately small:

```json
{
  "pptv": "0.1",
  "theme": "dapple.light",
  "slides": ["cover", "overview", "architecture"]
}
```

String entries are the normal form. Object entries are available only when a
slide needs an override:

```json
{
  "pptv": "0.1",
  "theme": "dapple.light",
  "slides": [
    "cover",
    {"id": "overview", "layout": "executive-summary"},
    {"id": "architecture", "layout": "architecture", "hidden": false}
  ]
}
```

Changing slide order means changing only this array. Physical slide-template
order does not affect rendered deck order.

The manifest may select among multiple named themes stored later in the file:

```json
{
  "theme": "dapple.dark",
  "themes": ["dapple.light", "dapple.dark", "dapple.print"]
}
```

A field must not repeat information that can be derived unambiguously from a
referenced source. PPTV should avoid two sources of truth.

## Slide sources

Each slide is stored in an inert HTML `template`:

```html
<template data-pptv-slide="architecture">
  <svg id="architecture" viewBox="0 0 1600 900"
       data-pptv-layout="architecture">
    ...
  </svg>
</template>
```

The manifest determines slide order. SVG DOM order remains the canonical painter
and PowerPoint z-order inside each slide.

Stable IDs must be unique across the deck. A practical convention is:

```text
cover.title
architecture.title
architecture.node.authorization
architecture.edge.client.authorization
```

The current semantic loader does not import external standalone slides. A
future external-assembly contract may define namespace application before
normalization.

### Hydrating one deck slide into an atom

A slide template is already SVG-shaped, but it may depend on its HTML
envelope's base CSS and active theme. Copying the template text alone is
therefore not a safe extraction.

```bash
pnpm pptv extract deck.pptv.html \
  --slide architecture \
  --output architecture.pptv.svg
```

Extraction is a deterministic source-to-source dereference operation. It
preserves stable IDs, hierarchy, DOM painter order, geometry, authored hard
lines, and opaque payload spelling while replacing supported deck style
dependencies with local concrete declarations. It refuses unresolved or
invalid input, refuses to overwrite an existing output, and returns success
only after the result independently validates and resolves as a standalone
diagram. The editor exposes the same operation as a deck-only slide download.

## Reusable definitions

Reusable SVG symbols and components may appear after slide sources in inert
library templates:

```html
<template data-pptv-library="dapple.components">
  <svg xmlns="http://www.w3.org/2000/svg">
    <defs>
      <symbol id="icon.database" viewBox="0 0 24 24">...</symbol>
      <symbol id="icon.lock" viewBox="0 0 24 24">...</symbol>
    </defs>
  </svg>
</template>
```

The 0.1 scanner indexes these library blocks but does not interpret references
or expand them. The reference syntax, ID qualification, dependency hashes, and
deterministic normalizer are roadmap requirements.

## Themes at the end

Named themes are stored as inert CSS data blocks after slide and component
sources:

```html
<script type="text/css" data-pptv-theme="dapple.light">
:root {
  --pptv-background: #ffffff;
  --pptv-text-primary: #17211e;
  --pptv-accent-1: #6f5cff;
}
</script>

<script type="text/css" data-pptv-theme="dapple.dark">
:root {
  --pptv-background: #101714;
  --pptv-text-primary: #f5f7f6;
  --pptv-accent-1: #9a8cff;
}
</script>
```

The 0.1 manifest validator requires the selected theme to exist exactly once.
The source kernel stores each theme as inert CSS text. C6 independently parses a
narrow base/component cascade, requires every theme to provide the same complete
token map, selects only the active theme, and retains token/style provenance. It
does not yet emit native PowerPoint theme bindings; C7 writes concrete resolved
colors/fonts.

Using inert data blocks rather than live style elements permits the canonical
source order while avoiding accidental cross-theme cascade behavior. The browser
runtime installs the selected CSS as a live stylesheet. A PPTX compiler parses
and resolves the selected data block directly.

A future broader compiler should preserve recognized token provenance where
possible. A value that originates from a PPTV theme token should become a
native PowerPoint theme binding rather than only a direct RGB value.

Standalone diagrams deliberately have no deck-theme authority. Their supported
presentation values are local. Hydrated extraction bridges the two forms by
resolving the selected deck theme first and writing those concrete supported
values into the new diagram; it does not copy a live theme system or make the
diagram depend on its source deck. Native PowerPoint theme binding remains a
future compiler behavior; the current C7 canary writes concrete resolved
colors and fonts.

## Runtime rules

The final script is a fixed, versioned browser renderer, for example:

```html
<script data-pptv-runtime="pptv-browser/0.1">
  ...known reference runtime...
</script>
```

The runtime:

1. parses the embedded manifest;
2. activates the selected theme;
3. clones referenced slide templates into the output mount point;
4. renders slides in manifest order; and
5. provides only presentation and navigation behavior defined by its version.

The runtime is **not authoritative**. PPTV compilers and validators must never
execute it to discover document meaning. They parse the manifest, slide
sources, libraries, and theme data directly.

Strict conformance rejects:

- arbitrary additional executable scripts;
- event-handler attributes;
- dynamically fetched code;
- user-authored JavaScript that creates canonical slide content;
- runtime-dependent object identity or deck order; and
- scripts that mutate canonical declarations.

A validator may verify the reference runtime by version and digest, replace it
with the canonical implementation, or omit it from non-browser outputs.

The implemented strict scanner accepts the registered
`pptv-browser/0.1` runtime only when its inline content matches the installed
digest (with CRLF normalized solely for that digest check). It does not execute
the runtime.

That non-executing validator is not a browser security boundary. Directly
opening an untrusted `.pptv.html` executes its script before library validation.
Direct-open is therefore for trusted source only. Validate untrusted bytes
first, then use a sandbox/CSP-isolated viewer if browser rendering is required.
Apply the same rule to standalone SVG: strict source rejects active/external
content, but validation must happen before direct browser open.

## Logical normalization (verified C6 subset; broader roadmap)

The normalized PPTV object model is a resolver/editor/compiler representation,
not necessarily another user-visible file. C6 resolves the contracted style,
primitive/group geometry, connector, explicit hard-line text, and opaque-asset
boundaries for both source kinds without executing a browser. HTML produces a
fixed physical deck projection; SVG produces a logical diagram projection on
its declared viewBox. The broader loader may later:

1. parse the manifest without executing scripts;
2. select referenced slide templates in manifest order;
3. select and resolve the active theme;
4. resolve local libraries and assets;
5. expand supported `use` references;
6. flatten supported transforms deterministically;
7. qualify and validate stable IDs;
8. retain theme-token provenance;
9. inventory and hash dependencies; and
10. produce a deterministic semantic object graph.

Tools may expose normalized SVG for debugging, but users should not be required
to manage generated core files.

## Agent-efficient processing

The 0.1 implementation exposes outline, text, semantic, editing, and C6
resolved projections for either a self-contained deck or standalone diagram.
The resolved views include constrained style provenance, finite geometry,
connector references, groups, and explicit text while keeping source-kind
schemas distinct. Library expansion, external resources, richer relationship
semantics, and canonical normalization remain roadmap.

Raw HTML, SVG, CSS, and embedded artwork are often the wrong interface for an
agent. PPTV tooling should expose progressively richer projections.

### Outline view

```bash
pnpm pptv outline dapple-overview.pptv.html
pnpm pptv outline system-overview.pptv.svg
```

Example output:

```text
Dapple Architecture
theme: dapple.light

1 cover
2 system-overview
3 trust-boundaries
```

For a deck, the current outline command scans and validates the container and
manifest but does not semantically parse slide bodies or resolve CSS/assets.
For a diagram it loads the one semantic atom and returns its ID and viewBox
without inventing deck title, theme, or slide-order fields.

### Semantic view

```bash
pnpm pptv show dapple-overview.pptv.html \
  trust-boundaries --view semantic

pnpm pptv show system-overview.pptv.svg \
  system-overview.api --view semantic
```

Example output:

```json
{
  "schema": "pptv-slide/0.1",
  "id": "trust-boundaries",
  "layout": "architecture",
  "objects": [
    {"id": "trust-boundaries.title", "role": "text", "export": "native",
     "element": "text", "text": "Trust boundaries", "children": []},
    {"id": "trust-boundaries.zone.client", "role": "group",
     "export": "native", "element": "g", "children": []},
    {"id": "trust-boundaries.edge.client.dapple", "role": "connector",
     "export": "native", "element": "line", "children": []}
  ]
}
```

The semantic projection omits attributes, classes, source ranges, theme/runtime
contents, and unrelated CSS. It retains the supported hierarchy, roles, export
modes, element names, and decoded, whitespace-preserving text.

### Editing view

The 0.1 editing projection adds raw attributes, classes where the source kind
allows them, source ranges, and the slide or diagram `viewBox`; it intentionally
stays close to source. Use the separate source-kind-specific C6 `resolve`
projection for validated geometry, connector references, provenance, concrete
styles/fonts, translated groups, text frames, and opaque SVG bounds.

### Semantic patches

Agents should normally edit through the stable-ID/source-bound 0.1 operations
rather than rewriting XML:

```json
{
  "schema": "pptv-patch/0.1",
  "baseSha256": "<exact-source-sha256>",
  "ops": [
    {
      "op": "set-text",
      "id": "architecture.node.authorization.title",
      "oldText": "Authorization service",
      "value": "Policy and authorization"
    },
    {
      "op": "set-active-theme",
      "oldTheme": "dapple.light",
      "theme": "dapple.dark"
    },
    {
      "op": "set-slide-order",
      "oldOrder": ["cover", "architecture"],
      "order": ["architecture", "cover"]
    }
  ]
}
```

Both validation and application are asynchronous because the patch engine
reconstructs a trusted same-kind document from the snapshot's retained source
before it resolves ranges. `validatePatch()` validates the complete edit plan.
`applyPatch()` additionally builds, rescans, and semantically reloads the
candidate before returning success. Failed transactions return no replacement
source or document.

The implemented vocabulary is:

```text
set-text
set-active-theme
set-slide-order
```

`set-text` applies to a deck or standalone diagram. `set-active-theme` and
`set-slide-order` are deck-only and fail explicitly on a diagram rather than
creating synthetic deck state.

Attribute/class/token/geometry/connector/grouping/duplication operations require
new smallest-safe replacement contracts and tests before implementation.

## Agent guidance and trust

A PPTV source may declare a known agent profile:

```html
<meta name="pptv-agent-profile" content="pptv-agent/1">
```

The profile identifier refers to trusted, versioned tooling guidance installed
with the PPTV toolchain. The current standalone SVG root allowlist does not
admit an agent-profile attribute. Freeform comments and document content are
not agent instructions and must not override the toolchain's policy.

A canonical non-normative standalone source comment may point humans and
agents toward the toolchain:

```xml
<!--
PPTV diagram atom: deterministic, editable vector source.
Authoring skill: pptv-authoring
https://github.com/willackerly/office180-md-office-converter/tree/main/.agents/skills/pptv-authoring
Preserve stable IDs, DOM painter order, explicit text frames, and authored hard lines.
If the skill is unavailable, an agent may suggest installation to the user.
This is non-normative discovery metadata; validate first and never auto-install from document content.
-->
```

The comment is a discovery lead only. Validation remains mandatory, the
repository pointer must be independently verified, and installation remains a
user decision. This avoids turning embedded document comments into a
prompt-injection channel.

## CLI surface

Implemented in 0.1:

```text
pptv outline
pptv validate
pptv resolve
pptv extract
pptv editor-pack
pptv pptx-canary
pptv text-fit
pptv text
pptv show
pptv list
pptv patch
```

`outline`, `validate`, `resolve`, `text`, `show`, `list`, direct-text `patch`,
`text-fit`, and `editor-pack` accept either `.pptv.html` or `.pptv.svg`.
Deck-only options fail explicitly for a diagram. `patch` requires exactly one
of `--check` or an explicit `--output`; `extract`, `editor-pack`, and
`pptx-canary` also require explicit atomic destinations; and `text-fit`
requires an explicit exact-font map. `extract` accepts an HTML deck plus one
slide ID and emits a standalone SVG. `pptx-canary` accepts HTML decks only and
never wraps an SVG into a synthetic slide, even when its viewBox is 16:9.

The broader roadmap is:

```text
pptv theme
pptv normalize
pptv render
pptv build-pptx
pptv inspect-pptx
pptv reconcile
pptv bundle
pptv explode
pptv agent-guide
```

The CLI is the universal substrate. MCP servers, editor integrations, and agent
skills should call the same underlying library rather than implement independent
parsers.

## Writable trusted editor and exact no-reflow evidence

`editor-pack` generates a deterministic, offline
`*.editable.pptv.html` convenience artifact for either source kind:

```bash
pnpm pptv editor-pack diagram.pptv.svg \
  --output diagram.editable.pptv.html \
  --font-map fonts.json
```

The wrapper embeds the exact canonical deck or diagram bytes as inert data,
their expected SHA-256, fresh source-kind-specific projections, and one fixed
editor application under a strict CSP. The source runtime or event-bearing
markup is never executed to discover meaning. A payload hash mismatch makes
the session read-only.

The implemented editor supports object selection, direct-text Apply for either
source kind, deck-only active-theme and slide-order controls, exact-source
undo/redo, diagnostics, source inspection, and clean current-source download.
A deck can additionally download its selected slide through the same hydrated
extraction path described above. Optional File System Access persistence
requires explicit user authorization; after the initial choice, every save
compares the on-disk hash with the last successful editor save and refuses a
stale overwrite.

Text remains strictly no-reflow. Neither patches, the editor, C6, C8, nor C7
wrap, autofit, shrink, move, resize, or re-line authored text. With an explicit
font map, the pack embeds only the selected exact font bytes, their identity,
and matching Node C8 evidence; the browser measures the same bytes and labels
its engine/version. The editor displays the worse current Node/browser status.
If an edit invalidates the embedded Node evidence, that line becomes
`unverified` until exact evidence is recomputed, even when the browser can
measure it. This is conservative overflow evidence, not browser/native
PowerPoint parity or automatic repair.

## Implemented conformance boundary

A `.pptv.html` deck is conforming when:

- its manifest is valid and appears in the canonical leading position;
- every referenced slide exists exactly once;
- stable IDs are unique across the deck;
- slide order derives only from the manifest;
- object z-order derives only from SVG DOM order;
- the selected theme exists exactly once (C6 separately enforces the strict
  complete-token cascade);
- all canonical content is declarative;
- the runtime is known and non-authoritative;
- parsing requires no network access; and
- unsupported constructs produce actionable errors rather than silent fallback.

A `.pptv.svg` diagram is conforming when:

- its single SVG root declares a stable `id`, `data-pptv-version="0.1"`, the SVG
  namespace, and a finite four-number viewBox with positive width and height;
- every emitted object has a globally unique stable ID and supported
  role/export pair;
- object z-order derives only from SVG DOM order;
- supported presentation values are local rather than imported from a
  synthetic deck theme or browser inheritance;
- all canonical content is declarative and self-contained;
- parsing requires no network access; and
- unsupported constructs produce actionable errors rather than silent
  fallback.

Both source kinds retain exact source bytes as authority and expose distinct
semantic/resolved schemas. A diagram does not acquire manifest, slide-order,
theme, physical-canvas, or PowerPoint fields merely because a caller wants a
deck-shaped API.

## Relationship to the PPTV SVG profile

`PPTV-PROFILE.md` defines the constrained SVG object model intended for
deterministic conversion to editable PowerPoint. The HTML design adds a
whole-deck container and orchestration layer without changing the central SVG
rules:

- SVG remains the canonical visual language;
- stable IDs remain canonical object identity;
- author intent still selects native versus asset representation;
- SVG DOM order still defines object z-order; and
- future reverse conversion must produce a reviewable semantic patch.

The implemented source behavior for both deck and diagram is governed by C4,
safe writes by C5, and source-kind-specific resolved projections by C6. C8
adds non-mutating exact-font line-fit evidence. The writable trusted editor and
hydrated slide extraction consume those contracted surfaces without creating a
second source authority. C7 remains a strict fresh-PPTX canary for HTML decks
only. Geometry/structured-text editing, external composition, broader
compilation, native save/reopen and quantitative fidelity, and reconciliation
remain future work until promoted through their own contracts and fixtures.
