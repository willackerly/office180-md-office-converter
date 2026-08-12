# Native Office round-trip challenge

> **Frozen predecessor evidence:** this checked challenge preserves the exact
> PPTV-named artifacts and commands used for the 2026-08-02 native acceptance
> run. Do not use it as a new-authoring template. Current visual work starts
> from a standalone `*.vector180.svg` atom and the `$vector180-authoring` skill;
> migrate or rebuild this kit under a successor contract before refreshing its
> baselines.

This kit is a human-in-the-loop acceptance test for the two source-first
office180 lanes:

- canonical Markdown → styled Word → canonical Markdown;
- standalone PPTV SVG atom → mapped native PowerPoint → typed patch → recovered
  SVG.

The three baseline Office files are ready to open. They contain three seeded
spelling errors in total, obvious supported edit targets, and two places for
content that the author could not predict.

## Open these immutable baselines

1. `baselines/office180-primer.baseline.docx`
2. `baselines/pptv-roundtrip-map.baseline.pptx`
3. `baselines/pptv-trust-model.baseline.pptx`

Before editing, note whether each file opens without a repair or compatibility
warning. In PowerPoint, confirm that boxes, text, lines, groups, and the marked
targets are selectable native objects rather than one flattened image.

The checked-in baselines are generated, PII-free artifacts. Save human work
beside this README under the `.edited.docx` / `.edited.pptx` names below; those
work products, Office lock files, and timestamped verification runs are
intentionally ignored by git.

## Word challenge

In `baselines/office180-primer.baseline.docx`:

1. Find and correct the two seeded spelling errors.
2. Replace `YOUR NEW OBSERVATION GOES HERE` with one or two sentences containing
   a genuine new observation about the library.
3. Keep the replacement as a normal paragraph. Leave Track Changes off, and do
   not add drawings, text boxes, fields, native numbering, or comments in this
   run.
4. Save As `office180-primer.edited.docx` in this directory.
5. Close the saved file, reopen it, and confirm that it still looks correct and
   remains editable.

## Round-trip map challenge

In `baselines/pptv-roundtrip-map.baseline.pptx`:

1. Find and correct the one seeded spelling error.
2. Replace `YOUR NEW INSIGHT GOES HERE` with a new one-line insight of at most
   about 70 characters. Keep its existing font, size, and alignment.
3. Recolor the visible `STYLE TARGET` rectangle with a literal solid fill.
   Avoid gradients, effects, or theme-dependent styling.
4. Move the visible `MOVE DOT` ellipse a small but unmistakable distance. Do not
   rotate it or move the surrounding group.
5. Save As `pptv-roundtrip-map.edited.pptx` in this directory.
6. Close the saved file, reopen it, and confirm that the edit branch is intact.

For precise child selection, open PowerPoint's Selection Pane and use:

- `src.pptv-roundtrip-map.office.style-edit-target`
- `src.pptv-roundtrip-map.office.geometry-edit-target`
- `src.pptv-roundtrip-map.insight.placeholder`

## Blind trust-model challenge

In `baselines/pptv-trust-model.baseline.pptx`, make exactly one supported
surprise edit without telling the verifier in advance. Choose one of:

- replace the contents of one direct, one-line text object;
- move the marked `ID` ellipse without rotating or regrouping it;
- change the marked style-target rectangle to another literal solid fill or
  outline.

Useful Selection Pane names are:

- `src.pptv-trust-model.source-authority.stable-id-seal.geometry-edit-target`
- `src.pptv-trust-model.office-branch.native-object.style-edit-target`

Save As `pptv-trust-model.edited.pptx` in this directory, then close and reopen
the saved file.

For the direct-edit challenge, do not insert, delete, reparent, regroup,
ungroup, rotate, scale a group, add a line break, or apply rich text. General
copy/insertion remains a deliberate C10 boundary rather than a silently lossy
operation. The one reviewed connector-copy exception is described below.

## Optional reviewed connector-copy challenge

C5 1.3/C10 1.2 can recover one narrowly defined native gesture: copy one
mapped straight connector, leave exactly one of the two occurrences
baseline-equivalent, move/restyle only the copy within the same parent, and
keep every pre-existing sibling in relative order. Do not copy a group, box,
text object, or arbitrary line. Do not change both connectors or rely on
PowerPoint numeric IDs.

The first verifier run without a resolution intentionally stops after writing
a rich duplicate report. Review its exact source/map/edited/comparison hashes,
the baseline and copied occurrence fingerprints, parent/order, endpoints, and
complete style. Then create
`pptv-trust-model.reconcile-resolution.json` (or the matching round-trip-map
filename) beside this README using the strict
`pptv-reconcile-resolution/0.1` schema. Choose a fresh semantic stable ID and
explicit existing `fromId`/`toId`; never infer those references from proximity.
Rerun the verifier. It automatically supplies the matching resolution file.

Zero baseline-equivalent occurrences means both copies changed or their
structure drifted; two means the intended copy is ambiguous. Both fail closed
with recovery options and no patch. Resolution files are human/agent review
work products and are intentionally ignored by git.

## Verify the return path

Once all three edited files exist, run:

```bash
./manual-tests/office-native-roundtrip/verify-edits.sh
```

The verifier creates a new timestamped directory under `runs/`. It never
overwrites source, baselines, maps, edited Office files, or an earlier run.
It:

1. recovers canonical Markdown from the Word file and regenerates a Plum DOCX;
2. reconciles each PowerPoint file into a typed, old-value-preconditioned PPTV
   patch;
3. applies each patch to a new SVG atom, reruns exact-font fit, and recompiles a
   new mapped PPTX;
4. captures the edited and regenerated Office branches through the same
   renderer and requires exact pixel agreement.

If a native Office save introduces an unsupported structure, the verifier
stops rather than guessing. The timestamped run directory retains the report
that explains the boundary.

The bounded no-op native Word/PowerPoint lifecycle has already passed on this
host. Exact application versions, package/reopen facts, same-renderer
zero-pixel comparisons, and deliberate non-claims are recorded in
`NATIVE-TEST-NOTES.md`. The challenge above still matters: a no-op lifecycle
does not prove representative edit recovery or native visual fidelity.

## Baseline evidence

`baselines/evidence/` contains hash-bound browser and Quick Look captures
produced before the manual run. The two diagram sources and their generated
PowerPoint files were informally inspected side by side; that observation is
not C11 native/cross-renderer fidelity evidence. Both use locally installed
Arial, and exact C8 measurement reports every authored line clear with zero
near-limit, overflow, or unverified results.

`font-map.json` intentionally points to the macOS Arial file used on this
workstation so the measurement bytes and native renderer agree. A run on
another operating system should update that local font path before invoking
the verifier.
