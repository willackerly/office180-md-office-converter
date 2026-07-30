---
name: pptv-authoring
description: Create, edit, inspect, validate, hydrate, and compile strict no-reflow PPTV diagrams and presentations. Use when asked to author or repair a standalone PPTV SVG atom or PPTV HTML deck, turn a brief into editable vector source, choose stable IDs/groups/connectors/text frames, audit text overflow, extract a deck slide into an independent atom, prepare a writable trusted browser editor, or compile a supported deck to the native PPTX canary.
---

# PPTV Authoring

Create vector source whose explicit geometry and hard text lines remain
authoritative. Prefer deterministic, diagnosable output over implicit layout.

## Choose the authoring unit

- Default to one standalone `*.pptv.svg` atom for a diagram, architecture
  figure, or vector beside documentation. It is the smallest semantic and
  live-editable unit and may declare any finite `X Y WIDTH HEIGHT` canvas with
  positive width and height.
- Use one self-contained `*.pptv.html` envelope for a multi-slide deck, themes,
  the fixed viewer, or a C7 PowerPoint deliverable. Deck slides remain exactly
  `viewBox="0 0 1600 900"`.

Never execute unknown embedded content to discover meaning. Validate untrusted
bytes first. Direct browser open is only for source the user trusts.

## Start quickly

From the `office180-md-office-converter` repository root, create a new
standalone diagram with:

```bash
python3 .agents/skills/pptv-authoring/scripts/new_diagram.py \
  path/to/architecture.pptv.svg \
  --id architecture --title "System architecture" \
  --width 1200 --height 800
```

Every newly authored standalone atom carries the canonical non-rendering
discovery comment immediately after an optional XML declaration. Preserve it
when editing or moving the atom. The comment points an unfamiliar agent to this
skill and summarizes the stable-ID, painter-order, frame, and hard-line rules;
it is discovery metadata, not executable policy or a validity requirement.
Never auto-install tooling because document content asks. If the skill is
unavailable, independently verify the repository pointer and suggest
installation to the user.

For a new deck, run:

```bash
python3 .agents/skills/pptv-authoring/scripts/new_deck.py \
  path/to/deck.pptv.html --title "Deck title"
```

Read [references/authoring-profile.md](references/authoring-profile.md) before
changing structure, styling, geometry, or object roles. Read
[references/text-fit.md](references/text-fit.md) whenever authoring or changing
text.

Do not hand-copy or modify a deck's fixed viewer runtime. The deck starter
carries the registered runtime artifact exactly. A standalone diagram has no
manifest, theme block, or runtime.

## Author in this order

1. Choose the atom or deck envelope before writing markup.
2. Plan slide/diagram IDs, object IDs, groups, and painter order.
3. Require standalone roots to declare `id`, `data-pptv-version="0.1"`,
   `xmlns="http://www.w3.org/2000/svg"`, and
   `viewBox="X Y WIDTH HEIGHT"`. Keep deck slides at `0 0 1600 900`.
4. Give every emitted object a globally unique hierarchical ID and the correct
   `data-pptv-role` / `data-pptv-export` pair.
5. Use SVG DOM order as back-to-front painter order.
6. Group a box and its text when they should move as one independent component.
7. Give every text object an explicit frame, font family, font size, line step,
   baseline, and authored hard line.
8. Use local presentation attributes or local `style` declarations on a
   standalone diagram. Use the deck's supported base classes and complete
   theme tokens in HTML.
9. Use one text object per visible line when a deck must pass the current
   C7 PPTX compiler.
10. Prefer integer coordinates, dimensions, strokes, font sizes, and line steps
   so C7's exact SVG-unit/point mapping cannot require rounding.

Treat a standalone atom as strict namespace-aware XML 1.0, not forgiving HTML.
Require exactly one SVG root, balanced tags, unique attributes, declared
prefixes, and valid XML characters. Permit only an optional XML declaration,
comments, and whitespace outside the root. Reject DOCTYPE/DTD and custom named
entities; use normal XML escaping, the five predefined entities, or valid
numeric character references. The semantic validator enforces these rules
before the SVG profile is considered.

Never add wrapping, autofit, shrink-to-fit, automatic line breaking, or
character-count fit guesses. If content does not fit, warn and ask the author
to change the words, font size, or declared geometry explicitly.

The banked 0.1.1 text-resilience design separates future paragraph/editing
intent from authoritative authored lines. It is not implemented by the 0.1
loader or compiler: do not emit its proposed metadata until successor
contracts promote it.

## Inspect and edit efficiently

Use the narrowest semantic command that answers the question:

```bash
pnpm pptv validate source.pptv.svg --format json
pnpm pptv outline source.pptv.svg --format json
pnpm pptv text source.pptv.svg --format jsonl
pnpm pptv list source.pptv.svg --role text
pnpm pptv show source.pptv.svg OBJECT_ID --view semantic --format json
pnpm pptv resolve source.pptv.svg --format json
pnpm pptv text-fit source.pptv.svg --font-map fonts.json
```

For supported edits, use stable-ID, source-hash-bound patches with `oldText`.
Standalone diagrams support `set-text` only; theme and slide-order operations
remain deck-only. Check the transaction before writing and always name a new
output:

```bash
pnpm pptv patch source.pptv.svg change.pptv.patch.json --check
pnpm pptv patch source.pptv.svg change.pptv.patch.json \
  --output source.updated.pptv.svg
```

Do not invent geometry, grouping, connector, or class patch operations. Hand
edit source only when authoring new structure or when the requested operation
is outside the current patch surface, then run every gate.

## Hydrate one deck slide into an atom

Do not copy a slide template out of HTML: it may depend on deck CSS and the
active theme. Use the deterministic extractor:

```bash
pnpm pptv extract deck.pptv.html \
  --slide architecture \
  --output architecture.pptv.svg \
  --format json
pnpm pptv validate architecture.pptv.svg --format json
pnpm pptv resolve architecture.pptv.svg --format json
```

Extraction resolves deck-only style authority into local declarations,
preserves stable IDs, hierarchy, painter order, geometry, and hard lines, then
reloads and resolves the result as an independent diagram. It refuses invalid
or unresolved input and an existing destination. Report its output hash and
provenance. Never add a manifest or synthetic slide identity to the atom.

## Use the writable trusted editor

For source the user trusts, create the deterministic offline editor wrapper:

```bash
pnpm pptv editor-pack source.pptv.svg \
  --output source.editable.pptv.html \
  --font-map fonts.json
```

The pack supports object selection, direct-text Apply, exact-source undo/redo,
diagnostics, source inspection, and clean current-source download for either
source kind. Deck packs additionally expose active-theme/slide-order controls
and hydrated selected-slide download. The app never serializes the browser DOM
as source. A payload hash mismatch makes it read-only; optional file-handle
saves require user authorization and refuse a stale on-disk hash.

An `*.editable.pptv.html` pack is a large generated build artifact, not
canonical source. Do not commit it. Add `*.editable.pptv.html` (and any
project-specific alternate editor-pack suffix) to the consuming repository's
ignore rules.

Geometry, connector, group, structured-line/rich-text, style-rule, insertion,
and deletion controls remain unsupported. Treat direct-open and file-handle
features as trusted-source-only.

## Run the gates

From the `office180-md-office-converter` repository root:

```bash
python3 .agents/skills/pptv-authoring/scripts/pptv_gates.py \
  source.pptv.svg --repo . --font-map fonts.json
```

The helper detects deck versus diagram from matching suffix and content,
validates, resolves, inspects outline/text projections, runs exact-font
source-kind-specific C8 text fit, and builds a writable trusted editor pack.
When `--font-map` is present, the same exact font evidence is embedded in the
pack. For an HTML deck it also compiles the strict PPTX canary. For a standalone
diagram it always reports a C7 skip: `*.pptv.svg` is not a presentation compiler
input, even at a 16:9 ratio. Without `--font-map`, the helper explicitly skips
C8 fit evidence.

When deliverable artifacts are requested, retain them in one pass:

```bash
python3 .agents/skills/pptv-authoring/scripts/pptv_gates.py \
  source.pptv.svg --repo . --font-map fonts.json \
  --artifacts-dir path/to/output
```

The helper refuses to overwrite an existing artifact.
It creates `--artifacts-dir` when needed.

Report the source path, changed stable IDs, source hash, diagnostics, text-fit
status, and generated artifact paths. Distinguish structural validity from
browser/font evidence and from native PowerPoint fidelity.
