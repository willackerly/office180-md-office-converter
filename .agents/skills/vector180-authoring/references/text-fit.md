# Explicit text and fit policy

Vector180 text is no-reflow. Source declares each line, baseline, font, and
future native text frame. A resolver/compiler may warn but never wrap, shrink,
move, or rewrite it.

## Required source

```xml
<text id="architecture.label"
      data-vector180-role="text"
      data-vector180-export="native"
      data-vector180-frame="100 180 600 60"
      data-vector180-line-step="36"
      fill="#17211e"
      font-family="Arial"
      font-size="30"
      x="100"
      y="220">One authored hard line</text>
```

That is one hard line. Serialization must preserve the authored line
assignment even if an editor presents a paragraph-like control.

## Several hard lines in one text object

Write a paragraph, a bullet-style list, or any stacked copy as one text object
with one direct `tspan` per hard line. It compiles to one PowerPoint text box
with one paragraph per line (`pptx-canary` for a deck, `compile` for an atom),
so the copy stays one editable box instead of one box per line:

```xml
<text id="architecture.summary"
      data-vector180-role="text"
      data-vector180-export="native"
      data-vector180-frame="100 220 1400 135"
      data-vector180-line-step="45"
      fill="#17211e"
      font-family="Arial"
      font-size="30">
  <tspan x="100" y="260">First authored hard line,</tspan>
  <tspan x="100" y="305">second authored hard line,</tspan>
  <tspan x="100" y="350">third authored hard line.</tspan>
</text>
```

Rules, all checked and none repaired:

- The `text` element declares no `x`/`y`; each `tspan` declares exactly `x`
  and `y` and nothing else. No nested `tspan`, no per-line style.
- Every line uses the same `x`. A different `x` on any line resolves but is
  refused by both PPTX compilers; indent by keeping that line a separate text
  object.
- Consecutive `y` baselines differ by exactly `data-vector180-line-step`.
- Every baseline lies inside the frame, so the frame height must cover all
  lines.
- An empty `tspan` is a supported blank hard line; it keeps its line step.
- PowerPoint places paragraph `k` in the `k`-th line-step band below the frame
  top with exact line spacing, `wrap="none"`, and no autofit: the same place a
  one-line box whose frame top is `(k − 1)` line steps lower puts its line.

Prefer a line step that is a multiple of 5 units for a multi-line object. One
unit is 0.6 pt, so such a step is a whole number of points. macOS Quick Look
(measured on 26.6.2; not PowerPoint evidence) advances later paragraphs by the
whole-point part only: a 48-unit (28.8 pt) step previews as 28 pt, so line `k`
sits `(k − 1) × 0.8 pt` too high, while 45 units (27 pt) previews pixel-identical
to stacked one-line boxes. The PPTX always stores the exact step.

Text-fit measures every hard line separately against the shared frame and
anchor. `patch set-text`, `patch set-text-frame`, and reconciliation of an
edited line or moved frame still accept one direct hard line only; change a
multi-line object by editing its hard lines in source and recompiling.

## Anchor-aware capacity

Compute horizontal advance capacity in the text object's local coordinates:

```text
left  = frame.x
right = frame.x + frame.width

start:  right - line.x
end:    line.x - left
middle: 2 * min(line.x - left, right - line.x)
```

Do not compare only with `frame.width`; that is wrong for offset or centered
anchors. Compare shaped advance with capacity. Retain ink bounds only as
secondary evidence. Group translation does not change capacity when frame and
anchor move together.

## Exact-font preflight

Supply every used face/style explicitly:

```bash
pnpm vector180 text-fit source.vector180.svg --font-map default
```

```json
{
  "schema": "vector180-font-map/0.1",
  "faces": [
    {
      "family": "Arial",
      "weight": 400,
      "style": "normal",
      "path": "./fonts/Arial.ttf"
    }
  ]
}
```

Paths resolve relative to the caller-supplied map. Exact font bytes are hashed;
the tool never discovers or substitutes a system face. A TTC/OTC entry includes
`postscriptName`; on a static font it may verify identity.

For every text edit:

1. Measure with the exact declared face when available.
2. Record advance, anchor-aware capacity, utilization, overrun, face/style,
   font identity, and measurement method.
3. Mark missing face/style/glyph coverage `unverified`; never silently
   substitute and call it clear.
4. Treat utilization `> 1.0` as overflow and `1.0` as zero-margin near-limit.
5. Warn at `>= 0.90`; prefer ordinary lines below `0.85` for renderer guard
   band.
6. Never modify text, font size, frame, baseline, or line breaks
   automatically.

Character counts, average-character estimates, CSS width heuristics,
`getBBox()` alone, and browser fallback fonts are not proof.

## Browser and native evidence

A trusted editor may measure caller-supplied exact bytes after
`document.fonts.ready`, record browser engine/version, and conservatively
combine that with matching Node evidence. A text edit invalidates embedded Node
evidence until recomputed.

Browser variance remains environment evidence, not universal parity. Native
PowerPoint text calibration and human visual review are higher fidelity gates.
Neither structural PPTX reopen nor Quick Look proves native text fidelity.
