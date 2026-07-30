---
name: pptv-authoring
description: Create, edit, inspect, validate, and compile strict no-reflow PPTV diagrams and presentations. Use when asked to author a standalone PPTV SVG diagram or PPTV HTML deck, turn a brief into editable vector source, repair PPTV structure, choose stable IDs/groups/connectors/text frames, audit text overflow, prepare a browser editor pack, or compile a supported deck to the native PPTX canary.
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

For a new standalone diagram, run:

```bash
python3 .agents/skills/pptv-authoring/scripts/new_diagram.py \
  path/to/architecture.pptv.svg \
  --id architecture --title "System architecture" \
  --width 1200 --height 800
```

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

Never add wrapping, autofit, shrink-to-fit, automatic line breaking, or
character-count fit guesses. If content does not fit, warn and ask the author
to change the words, font size, or declared geometry explicitly.

## Inspect and edit efficiently

The standalone commands below require a checkout that implements the pending
C4/C5/C6 1.1 diagram surfaces. If `validate` does not accept the generated
atom, report that implementation gap and do not claim semantic validation.

Use the narrowest semantic command that answers the question:

```bash
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

## Run the gates

From the `office180-md-office-converter` repository root:

```bash
python3 .agents/skills/pptv-authoring/scripts/pptv_gates.py \
  source.pptv.svg --repo . --font-map fonts.json
```

With the C4/C6 1.1 implementation present, the helper detects deck versus
diagram from matching suffix and content, validates, resolves, inspects
outline/text projections, runs exact-font text fit, and builds a trusted editor
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
