# PPTV 0.1.1 Text Resilience

**Status:** banked design; not implemented or accepted by current loaders

**Decision date:** 2026-07-30

**Version line:** planned PPTV source/profile `0.1.1`, independent from npm,
contract, viewer-runtime, and agent-profile versions

## 1. Why bank this

PPTV's most important text-fidelity property is deterministic line membership:
an authored word must not unexpectedly move to the next line and push later
content down merely because another renderer shapes the same font a little
differently.

The executable 0.1 profile already prevents implicit reflow by making every
visible line explicit. The banked 0.1.1 direction retains that authority while
adding paragraph intent for text that users reasonably expect to edit as a
wrapping paragraph in PowerPoint. It deliberately prefers a small, diagnosed
horizontal bleed over an unrequested line break.

This document records a future design target. It was banked while
`@office180/pptv@0.1.0-alpha.3` was current; the later alpha.4 round-trip
release deliberately leaves the same text semantics untouched. It does not
change:

- the currently accepted source/container identifier `0.1`;
- current `@office180/pptv@0.1.0-alpha.4` runtime behavior;
- C4/C6-C8 at revision 1.1, C5 at revision 1.2, or the C9/C10 1.0
  compiler/reconciliation profiles;
- the `pptv-resolved*/0.1`, `pptv-text-fit*/0.1`, browser, or compiler
  capability identifiers;
- the current C7 one-line `wrap="none"` canary; or
- any shipped schema, starter, example, skill, CLI, or runtime behavior.

## 2. Canonical source authority

The planned per-text distinction is:

```xml
<text
  id="body"
  data-pptv-role="text"
  data-pptv-export="native"
  data-pptv-text-intent="paragraph"
  data-pptv-frame="120 180 900 240"
  data-pptv-line-step="48">
  <tspan x="120" y="220">Every visible line remains explicit.</tspan>
  <tspan x="120" y="268">Paragraph intent does not authorize SVG reflow.</tspan>
</text>
```

`paragraph` is the banked schema term; informal descriptions may call this
text “wrappy.” Absence of the new attribute remains equivalent to
`hard-lines` for backward compatibility.

The invariants are:

1. Ordered direct text or direct `tspan` strings remain the only textual
   content authority.
2. Their explicit line membership, anchor positions, baselines, frame, and
   line step remain canonical SVG layout.
3. Paragraph intent is metadata about supported editing/export behavior, not
   an alternate unwrapped string.
4. A browser, DOM, CSS layout engine, editor control, or PowerPoint render
   never silently rewrites canonical source lines.
5. No mode enables autofit, shrink-to-fit, automatic font-size changes, or
   inferred geometry movement.
6. An explicit re-line operation, when later contracted, is a deliberate
   source edit with ordinary C5 hash/precondition/atomicity behavior.

A source that uses paragraph intent will require the eventual executable
source/profile identifier `0.1.1`. Current 0.1 loaders must continue to reject
unknown versions and attributes rather than interpreting them partially.

## 3. Banked PowerPoint export policies

Paragraph intent will map to one editable DrawingML paragraph whose authored
visual lines remain explicit breaks, expected initially as `a:br` boundaries
inside one `a:p`. Each hard segment may wrap only according to the selected
export policy. Exact OOXML whitespace, empty-line, run-property, line-spacing,
and baseline rules require schema and native-Office fixtures before promotion.

The planned API/CLI vocabulary is:

```text
--text-export reliable
--text-export editable
```

### 3.1 Reliable

`reliable` is the planned default for paragraph-intent text and prioritizes
stable rendering:

- keep every authored break;
- keep the authored font size, line step, anchor, and baseline intent;
- enable native paragraph wrapping/editability;
- keep `a:noAutofit`;
- derive an output-only expanded text frame whose anchor-aware capacity covers
  the widest authored line plus a contracted reserve; and
- retain the authored PPTV frame unchanged.

The exporter must use exact identified font evidence. It must record the
source frame, emitted frame, export policy, reserve policy, selected face, and
measurement identity in compiler evidence or the future source map. It must
fail closed or return an explicit unverified result when it cannot prove the
required capacity.

This is a layout-reliability policy, not a PDF-equivalence or pixel-fidelity
claim. Native PowerPoint calibration, quantitative render comparison, and
save/reopen remain promotion gates.

### 3.2 Editable

`editable` prioritizes a tight, convenient PowerPoint selection/editing box:

- keep every authored break;
- enable native paragraph wrapping/editability;
- keep `a:noAutofit`;
- emit the authored text frame without reliability expansion; and
- report insufficient reserve rather than silently changing source.

Both modes produce editable native text. The distinction is generated frame
geometry and the resulting tolerance to renderer variance, not whether the
content is editable.

Text without paragraph intent retains the current hard-line principle and
maps to non-wrapping output. A paragraph export option must never silently
reinterpret an ordinary hard-line object.

## 4. Banked import and reconciliation rule

Explicit DrawingML paragraph and line-break boundaries are authoritative input
and remain explicit PPTV lines. A baseline-aware reconciliation path uses the
original source/map line membership and must not re-run a wrapping heuristic.

Automatic PowerPoint wraps are not stored as explicit line breaks. A future
baseline-free importer therefore needs a deterministic layout step or
environment-labeled native render evidence. Only that path may use the banked
overflow-grace heuristic:

1. Measure a candidate line, including the next word and its exact whitespace,
   with an explicitly identified face.
2. Keep that word on the current line when its measured overrun is within the
   configured grace.
3. Wrap before it only when the overrun exceeds the grace.
4. Serialize the result immediately as explicit PPTV lines with paragraph
   intent.
5. Retain any mathematical C8 overflow as overflow evidence; grace does not
   relabel it `clear`.

The planned grace is font-relative and bounded:

```text
0 <= overflow-grace <= 2ch
```

The exact `ch` definition, default, script/word-boundary subset, and behavior
when the reference glyph is missing remain pending exact-font and native
PowerPoint calibration. Character counts, generic average-width estimates,
browser fallback, and silent font substitution are not acceptable
implementations. Unverified measurement or segmentation requires review
instead of guessed line movement.

Arbitrary PPTX import remains a separate future project. This rule does not
expand the current C7 compiler or Milestone 6 baseline-aware reconciliation.

## 5. Authoring reserve

Resilience begins in the source design:

- leave deliberate horizontal room in labels and paragraphs;
- keep critical final words away from the declared edge;
- run C8 after every text edit with explicitly mapped font bytes;
- treat utilization at or above `0.90` as a warning; and
- prefer ordinary authored lines below `0.85` while native calibration remains
  open.

These are authoring suggestions, not permission for the current C8 preflight
to repair a line. The current evidence already exposes measured width,
anchor-aware capacity, utilization, and overrun. A later C8 revision is needed
only if a versioned result adds new reserve fields or measurements.

## 6. Promotion gates

No runtime work begins until the applicable successor contracts and fixtures
exist:

- **C4 source:** recognize profile `0.1.1`, paragraph intent, compatibility,
  projection, and fail-closed version behavior.
- **C5 patch:** add typed `set-text-lines` and `set-text-intent`, or one
  equivalent typed operation; never use a generic attribute writer.
- **C6 resolved model:** carry intent, authored frame, and authoritative hard
  lines in a versioned schema without performing layout.
- **C7/compiler:** define multiline DrawingML, reliable/editable policies,
  derived-frame provenance, capability errors, and deterministic bytes.
- **C8 evidence:** preserve its read-only boundary; version only new
  measurement/result fields and complete native PowerPoint calibration.
- **Future import contract:** define baseline-free measurement, segmentation,
  overflow grace, evidence, and review behavior independently from
  baseline-aware reconciliation.

Required fixtures include start/middle/end anchors, explicit and empty lines,
spaces at break boundaries, exact-capacity and slightly-overrun lines, all
grace boundaries, unverified fonts/glyphs, deterministic PPTX bytes, schema
validation, independent reopen, PowerPoint open/save/reopen, and quantitative
browser/Office render comparison.

## 7. Version vocabulary

`0.1.1` in this document names the banked PPTV source/profile capability line.
It is not:

- the current npm package version;
- contract revision `1.1`;
- viewer `pptv-browser/0.1`;
- compiler `office180-pptv-pptx-canary/0.1`; or
- agent profile `pptv-agent/1`.

One package version may eventually understand more than one exact source
version. Package publication and source-profile promotion therefore remain
separate decisions.
