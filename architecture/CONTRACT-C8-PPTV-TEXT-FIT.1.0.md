# CONTRACT-C8-PPTV-TEXT-FIT.1.0

**Version:** 1.0
**Status:** in-progress
**Owner:** Will Ackerly
**Type:** Verification
**Cross-repo Promotability:** Yes — the injected measurement boundary and
evidence model can accept a future small OpenDocKit metrics package
**Source:** `PPTV-IMPLEMENTATION-PLAN.md` §2.3

## Why this exists

C6 makes text frames, fonts, anchors, baselines, and hard lines explicit, then
deliberately refuses to estimate glyph bounds. That preserves source authority
but allows a syntactically valid line to extend beyond its declared future
PowerPoint text box.

C8 defines a deterministic, read-only preflight. It measures each authored hard
line against the horizontal capacity implied by its frame and anchor, records
the exact font evidence used, and warns without wrapping, shrinking, moving,
rewriting, or otherwise repairing source.

## Interfaces

The portable operation is synchronous and pure. Font loading, shaping, browser
measurement, and filesystem access remain behind an injected measurer:

```ts
interface PptvTextMeasureRequest {
  slideId: string;
  objectId: string;
  lineIndex: number;
  text: string;
  font: {
    family: string;
    size: number;
    weight: 400 | 700;
    style: "normal" | "italic";
  };
}

type PptvTextMeasurement =
  | {
      kind: "measured";
      width: number;
      method: string;
      fontIdentity: string;
      missingCodepoints?: readonly number[];
    }
  | {
      kind: "unverified";
      method: string;
      reason: string;
      fontIdentity?: string;
      missingCodepoints?: readonly number[];
    };

function preflightTextFit(
  deck: PptvResolvedDeck,
  measurer: PptvTextMeasurer,
  options?: { nearLimit?: number },
): PptvTextFitResult;
```

The result schema is `pptv-text-fit/0.1`. It retains manifest/DOM/hard-line
order and records source hash, threshold, summary counts, and one result per
line with:

- slide/object/line identity and source text;
- concrete font request and horizontal anchor;
- horizontal frame origin/width, line anchor x-coordinate, and anchor-aware
  available width;
- `clear`, `near-limit`, `overflow`, or `unverified`;
- measured width, utilization, and overrun when verified;
- measurement method, font identity, missing codepoints, and reason.

The model is JSON-safe and immutable. It contains no font handles, buffers,
filesystem paths required for remeasurement, DOM nodes, or functions.

## Anchor-aware capacity

All values use the text object's local coordinate space:

```text
left  = frame.x
right = frame.x + frame.width

start:  right - line.x
end:    line.x - left
middle: 2 × min(line.x - left, right - line.x)
```

An ancestor group translation cancels because frame and baseline anchor move
together. Comparing every line to `frame.width` is incorrect for off-center
anchors.

Advance width is the primary horizontal measurement. Ink bounds may be retained
as secondary adapter evidence later, but a small negative side bearing must not
turn a fitting advance into a false overrun.

## Classification

- `overflow`: verified measured advance is greater than available width.
- `near-limit`: verified advance fits but utilization is greater than or equal
  to the configured threshold, which defaults to `0.9`.
- `clear`: verified advance is below the near-limit threshold.
- `unverified`: the exact requested face/style is unavailable, a codepoint is
  missing, the adapter fails, or its result/evidence is invalid.

Exactly full capacity is `near-limit`, not `overflow`; it has zero safety
margin but does not mathematically exceed the frame. A non-empty width against
zero capacity is overflow. Utilization is `null`, never non-finite, when a
positive width is compared with zero capacity or a finite ratio would overflow
the JSON number range.

The portable core validates adapter width, method, font identity, missing
codepoints, and result kind. A bad or throwing adapter produces `unverified`
for that line and does not suppress results for the rest of the deck.

## Exact-font Node adapter

The first Node adapter accepts only an explicit versioned
`pptv-font-map/0.1`:

```json
{
  "schema": "pptv-font-map/0.1",
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

Paths resolve relative to the map. The adapter does not discover system fonts
or silently substitute another face. It loads and caches exact bytes, verifies
family/weight/style metadata, hashes the bytes, shapes with pinned
`fontkit@2.0.4`, and scales summed glyph advances by the requested font size and
font units per em. A collection requires `postscriptName` to select one face;
for a static font that field is optional identity verification, never a named
variation selector. Every loaded identity includes the selected font's actual
PostScript name.

Font-map configuration is invocation data, not PPTV persistent authority. Font
files are never embedded into or copied beside the source by preflight. The
caller explicitly grants access to the paths in the map. The Node adapter
accepts at most 32 mapped faces, reads regular files only, limits one file to
64 MiB, limits distinct font bytes across a map to 256 MiB, and parses cached
bounded bytes rather than an unbounded stream or special file.

## Behavioral boundaries

- Preflight never changes source, text, font size, frame, anchor, line breaks,
  or geometry.
- It never wraps, autofits, shrinks, truncates, or proposes an automatic
  repair.
- It measures C6 hard lines independently; vertical fit and baseline parity are
  outside C8 1.0.
- A structural C4/C6 error prevents preflight because no resolved model exists.
- Fontkit evidence certifies the reported shaped advance for the identified
  bytes and adapter. It is not a claim of pixel-identical browser or PowerPoint
  rendering.
- C7 1.1 maps native font size and frame geometry through the same physical
  scale, so their horizontal utilization ratio remains in SVG user space.
  PowerPoint shaping/render calibration is still required.
- Browser `getComputedTextLength()` after `document.fonts.ready` may become a
  second environment-labeled adapter. Native Office render comparison remains
  the highest fidelity gate.
- A future OpenDocKit LUT adapter may provide conservative width bounds and
  substitution evidence. It must not become a PPTV core dependency or call a
  fallback result exact.

## CLI contract

The Node CLI command is:

```bash
pptv text-fit deck.pptv.html --font-map fonts.json [--near-limit 0.9]
```

JSON output uses the complete `pptv-text-fit/0.1` result. Text output lists
every non-clear line and a summary. Definite overflow or any unverified line
returns exit code 1; a deck containing only clear/near-limit lines returns 0.
Invocation errors return 2 and environment/font-loading failures return 3.

## Error and promotion gates

C8 remains `in-progress` until:

- pure anchor/status/adversarial-measurer fixtures pass;
- exact-font adapter, font-map, and CLI fixtures pass;
- the worked TDFLite deck locks its known overrun inventory;
- browser advance measurements are compared with the exact-font adapter; and
- representative lines are calibrated against native PowerPoint rendering.

No gate may be promoted by automatically changing an authored line.

## Dependencies

- Depends on: `CONTRACT:C6-PPTV-RESOLVED.1.0`
- Exact-font Node adapter: pinned `fontkit@2.0.4`
- OpenDocKit: no runtime dependency

## Implementing Files

- `packages/pptv/src/core/text-fit.ts`
- `packages/pptv/src/node/fontkit-text-measurer.ts`
- `packages/pptv/src/cli.ts`

## Test Requirements

- [x] Anchor-aware start/middle/end capacity and nested-group invariance
- [x] Clear, boundary/near-limit, overflow, zero-capacity, and custom threshold
- [x] Deterministic manifest/DOM/line ordering and immutable JSON-safe results
- [x] Missing face/style/codepoint and invalid/throwing measurer results
- [x] Strict font-map parsing, exact face metadata, content hash, and shaping
- [x] CLI JSON/text output and exit codes
- [ ] TDFLite worked-deck regression inventory
- [ ] Browser and native Office calibration evidence
