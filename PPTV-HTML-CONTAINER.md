# PPTV HTML Container

**Status:** design proposal; no executable implementation yet

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

## Design goals

1. **Simple base case.** One portable HTML file may contain the whole deck.
2. **Hierarchy first.** The canonical manifest appears before slide bodies, themes,
   component libraries, and browser runtime.
3. **No duplicate truth.** The manifest defines deck order; SVG DOM order defines
   z-order inside each slide.
4. **Browser useful.** Opening the file renders a readable deck without PowerPoint.
5. **Compiler deterministic.** PPTX compilers parse declarations directly and never
   execute the embedded runtime.
6. **Agent efficient.** Tools expose compact semantic projections and ID-addressed
   patches so agents rarely need to ingest raw SVG, CSS, or runtime code.
7. **Progressive decomposition.** External slides, styles, and assets are available
   when useful but never required for the basic case.

## Source forms

A conforming implementation may accept three related source forms:

```text
diagram.pptv.svg              # one standalone slide or diagram
mydeck.pptv.html              # one portable browser-viewable deck
mydeck.pptv-manifest.json     # optional external multi-file assembly
```

The HTML container is the preferred whole-deck authoring surface. The external
manifest is appropriate for generated projects, independently maintained slides,
or reusable template bundles.

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

This source order is normative for strict conformance. It lets humans and agents
open the file and immediately see the deck hierarchy and active configuration,
and lets streaming tools stop before expensive sections they do not need.

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

Authoring tools may use these definitions conveniently. A normalizer expands or
otherwise resolves them into deterministic, uniquely identified compiler input.

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

Only the manifest-selected theme is active. Inactive themes must not participate
in the CSS cascade.

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

## Logical normalization

The normalized PPTV object model is a compiler representation, not necessarily
another user-visible file. A loader should:

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

Raw HTML, SVG, CSS, and embedded artwork are often the wrong interface for an
agent. PPTV tooling should expose progressively richer projections.

### Outline view

```bash
python3 -m pptv outline dapple-overview.pptv.html
```

Example output:

```text
Dapple Architecture
theme: dapple.light

1 cover
2 system-overview
3 trust-boundaries
```

The outline command should ordinarily need only the leading manifest block.

### Semantic view

```bash
python3 -m pptv show dapple-overview.pptv.html \
  trust-boundaries --view semantic
```

Example output:

```json
{
  "slide": "trust-boundaries",
  "layout": "architecture",
  "objects": [
    {"id": "trust-boundaries.title", "role": "text",
     "text": "Trust boundaries"},
    {"id": "trust-boundaries.zone.client", "role": "group",
     "kind": "trust-zone", "label": "Client environment"},
    {"id": "trust-boundaries.edge.client.dapple", "role": "connector",
     "from": "trust-boundaries.zone.client",
     "to": "trust-boundaries.zone.dapple",
     "kind": "encrypted"}
  ]
}
```

The semantic view omits CSS declarations, path geometry, inactive themes,
runtime JavaScript, embedded icons, and provenance unless explicitly requested.

### Editing view

An editing projection adds selected geometry, classes, children, connector
relationships, and token references. A resolved diagnostic view may additionally
include computed CSS, transforms, font resolution, source fragments, and asset
details.

### Semantic patches

Agents should normally edit through stable-ID operations rather than rewriting
XML:

```json
{
  "ops": [
    {
      "op": "set_text",
      "id": "architecture.node.authorization.title",
      "value": "Policy and authorization"
    },
    {
      "op": "move",
      "id": "architecture.node.authorization",
      "dx": 80,
      "dy": 0
    },
    {
      "op": "set_token",
      "name": "--pptv-accent-1",
      "value": "#7257ff"
    }
  ]
}
```

The patcher owns escaping, ID validation, geometry updates, connector behavior,
source formatting, provenance, dependency hashes, and post-edit validation.

An initial patch vocabulary should include:

```text
set_text
set_attribute
set_class
add_class
remove_class
set_token
move
resize
reorder
delete
duplicate
add_shape
add_text
add_connector
group
ungroup
```

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

## Suggested CLI surface

```text
pptv outline
pptv show
pptv query
pptv patch
pptv validate
pptv normalize
pptv render
pptv build
pptv inspect-pptx
pptv reconcile
pptv bundle
pptv explode
pptv agent-guide
```

The CLI is the universal substrate. MCP servers, editor integrations, and agent
skills should call the same underlying library rather than implement independent
parsers.

## Conformance boundary

A `.pptv.html` document is conforming when:

- its manifest is valid and appears in the canonical leading position;
- every referenced slide exists exactly once;
- stable IDs are unique across the deck;
- slide order derives only from the manifest;
- object z-order derives only from SVG DOM order;
- the selected theme exists and inactive themes do not cascade;
- all canonical content is declarative;
- the runtime is known and non-authoritative;
- parsing and compilation require no network access by default; and
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

The HTML container should eventually become its own versioned contract. Until a
validator, reference runtime, compiler, and test corpus exist, this document
remains design rationale rather than a claim of implemented conformance.
