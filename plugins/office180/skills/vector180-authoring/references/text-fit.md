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

Use exactly one direct line per text object for the current native PPTX
baseline. Represent visible multiline copy as separate explicit text objects
inside a common group. Serialization must preserve the authored line
assignment even if an editor presents a paragraph-like control.

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
