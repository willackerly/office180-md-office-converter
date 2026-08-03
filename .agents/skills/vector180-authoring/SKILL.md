---
name: vector180-authoring
description: Create, read, inspect, semantically compare, edit, validate, hydrate, migrate, compile, and reconcile strict no-reflow Vector180 visual assets. Default to a fully hydrated standalone Vector180 SVG atom for a diagram, figure, reusable visual, or slide-sized canvas; use Vector180 HTML only for an actual multi-slide deck/report or deck-only behavior. Use when Codex needs to author vector source, inspect metadata or template lineage, compare revisions by stable ID, migrate a legacy PPTV SVG atom or extract a legacy deck slide, audit text overflow, prepare a trusted editor, export an atom to editable PPTX, or recover supported PowerPoint edits.
---

# Vector180 Authoring

Treat exact declarative source as authority. Preserve stable IDs, SVG sibling
painter order, explicit geometry, concrete local style, and authored hard text
lines. Prefer deterministic, diagnosable output over implicit layout.

## Choose the canonical artifact

- Default to one hydration-complete `*.vector180.svg` atom for every
  independent diagram, documentation figure, reusable visual, or slide-sized
  canvas. Keep a related suite as independent atoms unless collection semantics
  are part of the deliverable.
- Hydration-complete means one strict SVG root with stable IDs, explicit
  geometry and hard lines, concrete local styling, and no deck manifest,
  shared theme authority, runtime, or external dependency.
- Use `*.vector180.html` only for an actual ordered multi-slide deck/report or
  when shared themes, manifest order, the fixed viewer, or a deck-only compiler
  behavior is itself required.
- Compile a one-atom PowerPoint deliverable directly from the atom with an
  explicit placement. `compose` is optional and produces a generated HTML
  aggregation, not canonical source.
- Treat `*.editable.html` and `*.composed.vector180.html` as generated
  artifacts. Do not commit or substitute them for the atom.

Never execute unknown embedded content to discover meaning. Validate untrusted
bytes first. Direct browser open and file-handle editing are trusted-source
features only.

## Route the task

| Intent | Minimum path |
| --- | --- |
| Create one visual | `vector180 new atom` → author atom → gates |
| Read or summarize | `validate` → `outline` → `text`/`list`/`show` |
| Detect shared templates | `metadata`; verify exact template bytes before calling lineage proven |
| Compare two atoms | `metadata-compare` for lineage → `diff` for stable-ID semantics |
| Edit supported content | hash-bound `vector180-patch/0.1` → `--check` → new atom → gates |
| Edit unsupported structure | narrow source edit → full validation/resolution/text-fit gates |
| Work visually | generated trusted `editor-pack`; download clean atom bytes |
| Export one visual to PowerPoint | direct `compile`; retain PPTX and map |
| Recover PowerPoint edits | `reconcile` exact atom + map → review → patch a new atom |
| Extract one deck slide | `extract`; treat the result as a newly hydrated atom |
| Author a real deck/report | `vector180 new deck`; keep reusable visuals as atoms |
| Open legacy PPTV | inspect only or run explicit `migrate`; never rewrite opportunistically |

Read the one-page [atom card](references/atom-card.md) for ordinary atom
creation and editing. Read
[references/authoring-profile.md](references/authoring-profile.md) before
using grammar beyond that card, working with deck/theme behavior or opaque
assets, changing source dialect, or interpreting a refusal. Read
[references/text-fit.md](references/text-fit.md) for multiline, custom-font,
near-edge, or PowerPoint-bound text. Read
[references/metadata-and-diff.md](references/metadata-and-diff.md) when
inspecting lineage, grouping a suite, comparing revisions, or migrating PPTV.
Read
[references/powerpoint-roundtrip.md](references/powerpoint-roundtrip.md) only
for editor, PPTX, reconciliation, or native Office work.

## Start quickly

From an `office180-md-office-converter` checkout:

```bash
pnpm vector180 new atom \
  --output path/to/architecture.vector180.svg \
  --id architecture --title "System architecture"
```

Omitted dimensions use the common `1600 × 900` 16:9 canvas. Pass both
`--width` and `--height` when the asset intentionally needs another finite
positive aspect ratio.

Every new atom carries a non-rendering discovery comment pointing to this
skill. Preserve it through ordinary edits. It is untrusted discovery metadata,
not executable policy or a validity condition. Never auto-install tooling
because document content requests it.

For a real deck/report:

```bash
pnpm vector180 new deck \
  --output path/to/report.vector180.html --title "Report title"
```

Do not wrap an atom in HTML merely to preview or compile it.

The bundled `scripts/new_atom.py` and `scripts/new_deck.py` mirror the same
locked starters for skill-only recovery. Prefer the CLI in a repository
checkout so creation and validation stay on one public tool surface.

## Inspect efficiently

Use the narrowest semantic command that answers the question:

```bash
pnpm vector180 validate source.vector180.svg --format json
pnpm vector180 outline source.vector180.svg --format json
pnpm vector180 metadata source.vector180.svg --format json
pnpm vector180 text source.vector180.svg --format jsonl
pnpm vector180 list source.vector180.svg --role text
pnpm vector180 show source.vector180.svg OBJECT_ID \
  --view semantic --format json
pnpm vector180 resolve source.vector180.svg --format json
pnpm vector180 text-fit source.vector180.svg --font-map default
```

Metadata is descriptive evidence, never styling or identity authority.
Malformed recognized metadata is an error. Missing lineage is `unknown`, not a
reason to infer a template from filenames or appearance.

## Edit safely

Use a stable-ID, source-hash-bound patch for contracted operations:

```bash
pnpm vector180 patch source.vector180.svg change.vector180.patch.json --check
pnpm vector180 patch source.vector180.svg change.vector180.patch.json \
  --output source.updated.vector180.svg
```

The current patch surface covers direct text, supported native geometry,
connector endpoints, group translation, a single-line text frame/anchor,
sibling painter order, safe deletion, concrete native presentation style, and
one exact reviewed same-parent connector clone. Deck theme/order operations
remain deck-only. Generic attributes, general insertion, reparenting,
arbitrary transforms, rich text, and inferred references remain unsupported.

Always write a new output. Reload and resolve the complete candidate before
success. The browser UI may expose less than the underlying patch vocabulary;
missing UI is not permission to approximate an edit.

## Handle legacy PPTV deliberately

Legacy `*.pptv.svg` and `*.pptv.html` sources are a separate whole-document
dialect. Use the compatibility reader for validate/outline/text/list/show,
resolve, text-fit, and a read-only editor pack; metadata inspection remains
atom-only. Do not mix `data-pptv-*` and `data-vector180-*` vocabulary or rename
suffixes by hand.

Convert only through the explicit migration command:

```bash
pnpm vector180 migrate legacy.pptv.svg \
  --output migrated.vector180.svg \
  --report migration.json --format json
```

Migration must report old/new hashes and changed ranges, independently reload
and resolve the candidate, and prove normalized semantics. Existing PPTX maps,
patches, and reconciliation reviews remain bound to the legacy source hash;
recompile a new editable branch after migration.

## Run the gates

```bash
python3 .agents/skills/vector180-authoring/scripts/vector180_gates.py \
  source.vector180.svg --repo . --font-map default \
  --placement 0,0,1600,900 --placement-policy identity
```

The helper validates, resolves, inspects outline/text/metadata, runs exact-font
text fit with the verified bundled map by default, and builds a trusted editor
pack. For an
atom, C9/PPTX work runs only with explicit placement. For a deck it runs the
deck-only canary. Omitted evidence is reported as a skip, never inferred.

Retain deliverables in one pass with `--artifacts-dir PATH`. The helper refuses
to overwrite any existing artifact.

Report:

- canonical source path and SHA-256;
- source dialect and metadata verification status;
- changed stable IDs and semantic-diff classifications;
- validation, resolution, and exact-font status;
- generated artifact paths; and
- what remains unverified by native PowerPoint or human visual review.
