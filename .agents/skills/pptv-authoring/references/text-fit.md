# Explicit text and fit policy

PPTV text is intentionally no-reflow. The source declares what line exists,
where its baseline sits, and how wide its future PowerPoint text frame is.
Neither the resolver nor compiler may wrap, shrink, move, or rewrite it.

## Required source

Every native text object in either source form needs:

```xml
<text id="slide.label"
      data-pptv-role="text"
      data-pptv-export="native"
      data-pptv-frame="100 180 600 60"
      data-pptv-line-step="36"
      fill="#17211e"
      font-family="Arial"
      font-size="30"
      x="100"
      y="220">One authored hard line</text>
```

The object must resolve one concrete font family and explicit font size. In a
standalone diagram, declare both with presentation attributes or local
`style`. In a deck, a supported base class and complete theme may resolve them.
The source `x`/`y` baseline and line string are authoritative.

For C7 output, use exactly one direct line per text object. If a paragraph is
visually multiline, create one text object per explicit line and group them.
An editor may later present those lines as one paragraph-like control, but
serialization must preserve the explicit lines.

## Anchor-aware capacity

Compute available horizontal advance in the text object's local coordinate
space:

```text
left  = frame.x
right = frame.x + frame.width

start:  right - line.x
end:    line.x - left
middle: 2 * min(line.x - left, right - line.x)
```

Group translations do not change this capacity because frame and anchor move
together.

Do not compare only with `frame.width`: that is wrong for an off-center start,
middle, or end anchor. Do not use `getBBox().width` as the primary metric;
small negative side bearings can create false overflow. Compare shaped/advance
width with anchor-aware capacity and retain ink bounds only as secondary
evidence.

## Preflight policy

Run C8 with an explicit map of every used face/style:

```bash
pnpm pptv text-fit source.pptv.svg --font-map fonts.json
pnpm pptv text-fit deck.pptv.html --font-map fonts.json
```

```json
{
  "schema": "pptv-font-map/0.1",
  "faces": [
    {
      "family": "Arial",
      "weight": 400,
      "style": "normal",
      "path": "./fonts/Arial.ttf"
    },
    {
      "family": "Arial",
      "weight": 700,
      "style": "normal",
      "path": "./fonts/Arial-Bold.ttf"
    }
  ]
}
```

Paths resolve relative to the map. The command shapes and hashes the exact font
bytes; it never discovers or substitutes a system face. A TTC/OTC collection
entry must include `postscriptName`; on a static font that optional field only
verifies identity.

1. Treat every text edit as capable of invalidating fit.
2. Measure with the exact declared face when available.
3. Record measured advance, capacity, utilization, overrun, family, weight,
   style, font source, and measurement method.
4. Mark missing family/style/glyph coverage as `unverified`; never silently
   substitute and call it clear.
5. Treat utilization `> 1.0` as definite overflow and exactly `1.0` as a
   zero-margin near-limit warning.
6. Warn at `>= 0.90`; prefer ordinary authored lines below `0.85` to leave a
   renderer/font guard band.
7. Never modify text, size, frame, or line breaks automatically.

For trusted source, a browser check after `document.fonts.ready` using SVG
`getComputedTextLength()` is implemented through the explicit-byte browser
adapter. It loads caller-supplied bytes under SHA-derived aliases, requires
precomputed glyph coverage, and labels the engine/version. Missing or unchecked
coverage remains `unverified`; browser fallback never becomes exact evidence.
Chromium and Firefox match the current exact-font kerned calibration, while the
checked WebKit capture follows the unkerned oracle despite explicit kerning.
Treat that as recorded environment variance, not universal parity. Native
PowerPoint render/reopen remains the highest fidelity gate.

Character counts, average-character estimates, CSS width heuristics, and
browser fallback fonts are not acceptable proof.

## Implemented deterministic verifier

The portable API is:

```ts
preflightTextFit(resolvedDeck, measurer)
preflightDiagramTextFit(resolvedDiagram, measurer)
```

The exact-font Node adapter uses pinned `fontkit@2.0.4`. Each portable
preflight line result includes:

- slide ID or diagram ID, plus object ID;
- measured width and anchor-aware capacity;
- utilization and overrun;
- font family, size, weight, and style;
- clear, near-limit, overflow, or unverified status;
- missing codepoints and font content/PostScript identity; and
- the method used.

Direct calls to the Node adapter additionally expose requested/loaded face
evidence and its current unsupported-shaping-feature list. The portable
preflight intentionally normalizes away adapter-specific fields.

The CLI returns success for clear/near-limit lines and failure for definite
overflow or any unverified line.

`editor-pack` accepts the same explicit font map. It embeds only the selected
exact font bytes, their identity and coverage, and matching Node C8 evidence.
The writable browser editor measures those bytes and displays the worse current
Node/browser status. A text edit invalidates embedded Node evidence for that
line, so the editor keeps it `unverified` until exact Node evidence is
recomputed; browser measurement alone does not promote it to clear.

OpenDocKit's current `FontMetricsDB` and pinned bundle are a useful deterministic
warning substrate. They provide advances and limited kerning, but not complete
shaping, ligatures, ink bounds, or robust missing-glyph/style evidence. Keep the
PPTV core independent by injecting a measurer. A good upstream contribution is
a small stable OpenDocKit metrics package that exposes selected face, missing
codepoints, substitution quality, width bounds, and bundle identity.
