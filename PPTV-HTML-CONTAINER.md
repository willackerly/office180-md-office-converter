# PPTV HTML Container

**Status:** source container, C6 resolution, trusted editor foundation, and
strict C7 PPTX canary implemented; broader composition/editing remain roadmap

PPTV HTML is a declarative, single-file deck container for PPTV slides. It keeps
canonical slide content web-native and browser-viewable while making deck order,
theme selection, reusable definitions, and agent access explicit and cheap to
process.

The compound extension is:

```text
mydeck.pptv.html
```

A separate multi-file assembly manifest remains optional and uses the convention:

```text
mydeck.pptv-manifest.json
```

The manifest is orchestration metadata, not a JSON encoding of PPTV itself.

## Implemented 0.1 boundary

`@office180/pptv` implements the self-contained HTML read/edit kernel described
by C4 and C5. It retains the exact decoded source and exact UTF-8 bytes,
including a leading BOM and original newline spelling; computes SHA-256 over
those bytes; records half-open UTF-8 byte and UTF-16 code-unit ranges; validates
the fixed viewer by version and content digest without executing it; loads the
manifest-selected slide order and SVG DOM hierarchy; and supports only
`set-text`, `set-active-theme`, and `set-slide-order` writes.

Standalone SVG and external manifests are recognized and inventoried but are
not semantically loaded or patched in 0.1. Libraries and theme blocks are
indexed and security-checked; libraries are not expanded. C6 parses the strict
base/component CSS plus complete selected-theme token map, resolves concrete
styles/provenance, and requires exact `0 0 1600 900`/16:9 dimensions. Metadata
mirrors, theme-list authority, and library reference semantics remain outside
the implemented contract.

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
7. **Progressive decomposition.** External slides, styles, and assets are available
   when useful but never required for the basic case.

## Source forms

The scanner recognizes three related source forms:

```text
diagram.pptv.svg              # one standalone slide or diagram
mydeck.pptv.html              # one portable browser-viewable deck
mydeck.pptv-manifest.json     # optional external multi-file assembly
```

The HTML container is the implemented whole-deck authoring surface. Semantic
loading for the other two forms and external dependency resolution are future
work.

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

When an external standalone slide is imported, the loader may apply a declared
namespace before normalization.

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

The compiler should preserve recognized token provenance where possible. A value
that originates from a PPTV theme token should become a native PowerPoint theme
binding rather than only a direct RGB value.

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

## Logical normalization (C6 subset implemented; broader roadmap)

The normalized PPTV object model is a compiler representation, not necessarily
another user-visible file. C6 currently performs steps 1–3 for the strict
self-contained profile, fixed primitive/group geometry, explicit hard-line
text, and opaque SVG bounds. The broader loader should:

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

The 0.1 implementation exposes outline, text, semantic, editing, and C6 resolved
projections. The resolved view includes constrained style provenance, finite
geometry, connector references, groups, and explicit text. Library expansion,
raster resources, richer relationship semantics, and canonical normalization
remain roadmap.

Raw HTML, SVG, CSS, and embedded artwork are often the wrong interface for an
agent. PPTV tooling should expose progressively richer projections.

### Outline view

```bash
pnpm pptv outline dapple-overview.pptv.html
```

Example output:

```text
Dapple Architecture
theme: dapple.light

1 cover
2 system-overview
3 trust-boundaries
```

The current outline command scans and validates the container and manifest but
does not semantically parse slide bodies or resolve CSS/assets.

### Semantic view

```bash
pnpm pptv show dapple-overview.pptv.html \
  trust-boundaries --view semantic
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

The 0.1 editing projection adds raw attributes, classes, source ranges, and the
slide `viewBox`; it intentionally stays close to source. Use the separate C6
`resolve` projection for validated geometry, connector references, token
provenance, concrete styles/fonts, translated groups, text frames, and opaque
SVG bounds.

### Semantic patches

Agents should normally edit through the three stable-ID/source-bound 0.1
operations rather than rewriting XML:

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
reconstructs a trusted deck from the snapshot's retained source before it
resolves ranges. `validatePatch()` validates the complete edit plan.
`applyPatch()` additionally builds, rescans, and semantically reloads the
candidate before returning success. Failed transactions return no replacement
source or deck.

The implemented vocabulary is:

```text
set-text
set-active-theme
set-slide-order
```

Attribute/class/token/geometry/connector/grouping/duplication operations require
new smallest-safe replacement contracts and tests before implementation.

## Agent guidance and trust

A PPTV source may declare a known agent profile:

```html
<meta name="pptv-agent-profile" content="pptv-agent/1">
```

or, for standalone SVG:

```xml
<svg data-pptv-agent-profile="pptv-agent/1">
```

The profile identifier refers to trusted, versioned tooling guidance installed
with the PPTV toolchain. Freeform comments and document content are not agent
instructions and must not override the toolchain's policy.

A non-normative source comment may point humans toward the toolchain:

```html
<!-- PPTV document. Prefer a conforming PPTV tool for semantic editing. -->
```

This avoids turning embedded document comments into a prompt-injection channel.

## CLI surface

Implemented in 0.1:

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
`editor-pack` and `pptx-canary` also require explicit atomic destinations;
`text-fit` requires an explicit exact-font map. The broader roadmap is:

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

## Implemented conformance boundary

A `.pptv.html` document is conforming when:

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

## Relationship to the PPTV SVG profile

`PPTV-PROFILE.md` defines the constrained SVG object model for deterministic
conversion to editable PowerPoint. This proposal adds a whole-deck container and
orchestration layer without changing the central SVG rules:

- SVG remains the canonical visual language;
- stable IDs remain canonical object identity;
- author intent still selects native versus asset representation;
- SVG DOM order still defines object z-order; and
- reverse conversion still produces a reviewable semantic patch.

The implemented source-container behavior is governed by C4, safe writes by C5,
the fixed resolved projection/editor viewport by C6, and the strict fresh-PPTX
canary by C7. Broader writable-editor, compiler, and reconciliation claims
remain design rationale until promoted through their own contracts and fixtures.
