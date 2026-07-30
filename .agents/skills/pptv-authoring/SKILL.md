---
name: pptv-authoring
description: Create, edit, inspect, validate, and compile strict no-reflow PPTV presentations. Use when asked to author PPTV or PPTV SVG slides, turn a brief into a deck, repair PPTV structure, choose stable IDs/groups/connectors/text frames, audit text overflow, prepare a browser editor pack, or compile the supported native PPTX subset.
---

# PPTV Authoring

Create presentation source whose explicit SVG geometry and hard text lines remain
authoritative in the browser and in compiled PowerPoint. Prefer deterministic,
diagnosable output over implicit layout.

## Choose the supported container

Author a self-contained `*.pptv.html` file containing SVG slide templates.
Treat requests for a “PPTV SVG” as this container unless the user explicitly
wants a standalone inventory-only artifact. Standalone `*.pptv.svg` is
recognized, but the current semantic edit, resolve, editor-pack, and PPTX
pipeline accepts self-contained HTML only.

Never execute an unknown deck's embedded script to discover meaning. Validate
untrusted bytes first. Direct browser open is only for source the user trusts.

## Start quickly

For a new deck, run:

```bash
python3 .agents/skills/pptv-authoring/scripts/new_deck.py \
  path/to/deck.pptv.html --title "Deck title"
```

Then read [references/authoring-profile.md](references/authoring-profile.md)
before changing structure, CSS, geometry, or object roles. Read
[references/text-fit.md](references/text-fit.md) whenever authoring or changing
text.

Do not hand-copy or modify the fixed viewer runtime. The starter carries the
registered runtime artifact exactly.

## Author in this order

1. Plan slide IDs, object IDs, groups, and painter order before writing markup.
2. Keep the canvas at `viewBox="0 0 1600 900"` (16:9).
3. Give every emitted object a globally unique hierarchical ID and the correct
   `data-pptv-role` / `data-pptv-export` pair.
4. Use SVG DOM order as back-to-front painter order.
5. Group a box and its text when they should move as one independent component.
6. Give every text object an explicit frame, font family, font size, line step,
   baseline, and authored hard line.
7. Use one text object per visible line when the output must pass the current
   C7 PPTX compiler.
8. Keep CSS in supported single-class rules and keep every theme's token set
   complete.
9. Prefer integer coordinates, dimensions, strokes, font sizes, and line steps
   so C7's exact SVG-unit/point mapping cannot require rounding.

Never add wrapping, autofit, shrink-to-fit, automatic line breaking, or
character-count fit guesses. If content does not fit, warn and ask the author
to change the words, font size, or declared geometry explicitly.

## Inspect and edit efficiently

Use the narrowest semantic command that answers the question:

```bash
pnpm pptv outline deck.pptv.html --format json
pnpm pptv text deck.pptv.html --slide SLIDE_ID --format jsonl
pnpm pptv list deck.pptv.html --slide SLIDE_ID --role text
pnpm pptv show deck.pptv.html OBJECT_ID --view semantic --format json
pnpm pptv resolve deck.pptv.html --format json
pnpm pptv text-fit deck.pptv.html --font-map fonts.json
```

For supported edits, use stable-ID, source-hash-bound patches with `oldText`.
Check the transaction before writing and always name a new output:

```bash
pnpm pptv patch deck.pptv.html change.pptv.patch.json --check
pnpm pptv patch deck.pptv.html change.pptv.patch.json \
  --output deck.updated.pptv.html
```

Do not invent geometry, grouping, connector, or class patch operations. Hand
edit source only when authoring new structure or when the requested operation
is outside the current patch surface, then run every gate.

## Run the gates

From the `office180-md-office-converter` repository root:

```bash
python3 .agents/skills/pptv-authoring/scripts/pptv_gates.py \
  deck.pptv.html --repo . --font-map fonts.json
```

The helper validates, resolves, inspects outline/text projections, runs
exact-font text fit, builds a trusted editor pack, and compiles the strict PPTX
canary in a temporary directory. Without `--font-map`, it explicitly skips fit
and runs structural/compiler gates only.

When deliverable artifacts are requested, retain them in one pass:

```bash
python3 .agents/skills/pptv-authoring/scripts/pptv_gates.py \
  deck.pptv.html --repo . --font-map fonts.json \
  --artifacts-dir path/to/output
```

The helper refuses to overwrite an existing artifact.
It creates `--artifacts-dir` when needed.

Report the source path, changed stable IDs, source hash, diagnostics, text-fit
status, and generated artifact paths. Distinguish structural validity from
browser/font evidence and from native PowerPoint fidelity.
