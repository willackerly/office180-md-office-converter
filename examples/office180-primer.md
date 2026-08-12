# Office180 primer

Office180 keeps a small, reviewable source file authoritative while Microsoft Office remains the familiar editing surface.

## Two source-first lanes

- Word lane: canonical Markdown → editable DOCX branch.

- Visual lane: canonical Vector180 atom → editable PPTX branch.

The source is deterministic and friendly to version control. The Office file is generated for review, presentation, and supported native edits.

## Word workflow

1. Author the supported Markdown profile.

2. Compile it with an explicit Word theme.

3. Review or edit the generated DOCX.

4. Recover supported edits with a fidelity report.

5. Merge against current Markdown only when both branches changed.

The converter embeds exact original and canonical Markdown as a merge base. Unsupported Word structures fail with diagnostics instead of becoming silent loss.

## PowerPoint workflow

- Keep each independent visual as one fully hydrated `*.vector180.svg` atom.

- Give every rendered object a stable ID, explicit geometry, concrete style, and authored hard text lines.

- Compile one atom directly to editable PPTX with an explicit placement.

- Keep the hash-bound map beside the PPTX.

- Reconcile supported PowerPoint edits into a reviewed source patch.

Vector180 never relies on browser wrapping or autofit. A small visible overrun is easier to diagnose than an unexpected word moving to another line and shifting the composition.

## Why agents benefit

An agent can inspect a compact outline, query one object by stable ID, measure text before export, and compare revisions semantically. It only loads the full compiler model when the task actually needs it.

> Office180 favors exact authority, narrow supported semantics, and rich refusal evidence over best-effort conversion.
