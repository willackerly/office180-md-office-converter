# CONTRACT-C8-PPTV-TEXT-FIT.1.1

<!-- SUPERSEDES: CONTRACT-C8-PPTV-TEXT-FIT.1.0 -->

**Version:** 1.1
**Status:** in-progress
**Owner:** Will Ackerly
**Type:** Verification
**Cross-repo Promotability:** Yes — the injected measurement boundary and
evidence model can accept a future small OpenDocKit metrics package
**Source:** `PPTV-IMPLEMENTATION-PLAN.md` §2.3

## Why this exists

C6 makes text frames, fonts, anchors, baselines, and hard lines explicit in
both decks and standalone diagrams, then deliberately refuses to estimate
glyph bounds. That preserves source authority but allows a syntactically valid
line to extend beyond its declared text frame.

C8 defines a deterministic, read-only preflight. It measures each authored hard
line against the horizontal capacity implied by its frame and anchor, records
the exact font evidence used, and warns without wrapping, shrinking, moving,
rewriting, or otherwise repairing source.

## Who needs this

- Authors who need to catch line overruns before a no-reflow deck reaches
  PowerPoint.
- Editors and CI systems that must distinguish exact-font evidence from
  substitution-prone environment measurements.
- Compiler maintainers who need deterministic warnings without changing source
  text, font size, line breaks, or geometry.
- Documentation-diagram authors who need evidence keyed to a diagram atom,
  without fabricated slide or deck identity.

## Scenarios

- Measure every authored hard line with explicitly mapped font bytes and report
  clear, near-limit, overflow, or unverified evidence.
- Preserve start, middle, and end anchor semantics when computing available
  horizontal capacity.
- Refuse to certify a line when the requested face or required glyph coverage
  cannot be proven.
- Produce standalone-diagram evidence keyed by `diagramId` while retaining the
  existing deck evidence keyed by `slideId`.

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

interface PptvDiagramTextMeasureRequest {
  diagramId: string;
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

function preflightDiagramTextFit(
  diagram: PptvResolvedDiagram,
  measurer: PptvDiagramTextMeasurer,
  options?: { nearLimit?: number },
): PptvDiagramTextFitResult;
```

The existing deck result schema remains `pptv-text-fit/0.1`. It retains
manifest/DOM/hard-line order and records source hash, threshold, summary
counts, and one result per line with:

- slide/object/line identity and source text;
- concrete font request and horizontal anchor;
- horizontal frame origin/width, line anchor x-coordinate, and anchor-aware
  available width;
- `clear`, `near-limit`, `overflow`, or `unverified`;
- measured width, utilization, and overrun when verified;
- measurement method, font identity, missing codepoints, and reason.

The standalone result schema is `pptv-diagram-text-fit/0.1`. It carries the
same threshold, summary, line, font, frame, measurement, and status evidence,
but has one required top-level `diagramId` and each line uses `diagramId`
instead of `slideId`. Results retain diagram-root DOM/hard-line order. A
diagram result contains no slide ID, manifest order, active theme, EMU scale,
or inferred PowerPoint context.

Both models are JSON-safe and immutable. They contain no font handles, buffers,
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
for that line and does not suppress results for the rest of the artifact.

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

## Exact-font browser adapter and checked calibration

The browser adapter accepts exact caller-supplied font bytes plus explicit
precomputed codepoint coverage. It hashes the bytes, loads each face through
`FontFace` under a private SHA-derived family alias, adds it to the document
font set, awaits `document.fonts.ready`, and measures a hidden SVG text node
with `getComputedTextLength()`. Each result identifies the font SHA-256 and
browser engine/version, actual platform, device-pixel ratio, and user agent.
An unmapped face, unchecked codepoint, known missing glyph, unavailable private
alias, or invalid browser width is `unverified`; fallback glyphs never become
exact evidence.

Checked evidence recaptured on 2026-08-02 in
`packages/pptv/test-fixtures/c8/browser-calibration-evidence.json` uses exact
`@playwright/test@1.62.0`, exact `esbuild@0.28.1`, Fontkit 2.0.4, and the
722,018-byte browser-kernel SHA-256
`ee946661bf592d41ae36e821c6bbb94651628f8ab03c11529516f29ed4e577e5`,
and the OFL ABeeZee Regular fixture SHA-256
`2901c8df256648cc2bb2e3afb381cb8d28e65ed3dbe11de20695ae4d5ffdeda9`.
Six samples cover kerning, spaces, mixed text, near-limit, exact-boundary, and
overflow behavior. Acceptance is an absolute delta at or below 0.75 SVG units
or a relative delta at or below 1%.

| Engine capture         | Platform / DPR   |                                 Compared oracle | Maximum absolute delta | Maximum relative delta | Result            |
| ---------------------- | ---------------- | ----------------------------------------------: | ---------------------: | ---------------------: | ----------------- |
| Chromium 151.0.7922.34 | macOS / 1        |                                  Fontkit kerned |               0.013875 |              0.015974% | pass              |
| Firefox 153.0          | macOS / 1        |                                  Fontkit kerned |               0.021333 |              0.018960% | pass              |
| WebKit 26.5            | macOS / 2        |                                Fontkit unkerned |              0.0000071 |             0.0000059% | recorded variance |
| Chromium 151.0.7922.34 | Linux x86_64 / 1 | Fontkit kerned plus checked pixel-grid envelope |               2.448000 |              1.900041% | recorded variance |

Despite explicit browser kerning declarations, this WebKit capture follows the
Fontkit `kern=false` oracle; its maximum delta from Fontkit's kerned oracle is
6.239998 SVG units / 8.054520%. This is retained as engine-specific evidence,
not rewritten as kerned parity.

The Linux Chromium capture returns six exact whole-pixel widths. It is accepted
only for the recorded engine version, platform, and DPR when every width
exactly matches the checked capture, remains inside the sum of each Fontkit
shaped glyph advance's distance to its nearest pixel, and preserves every
non-boundary fit band. This is a separate
`pass-with-platform-grid-fitting-variance` result, not a wider global
tolerance. The exact-boundary sample may conservatively change from boundary
to overflow; clear, near-limit, and overflow samples may not change band.

The missing-glyph sample U+1F9EA remains `unverified`, and standalone-diagram
integration produces four ordered, verified lines under
`pptv-diagram-text-fit/0.1` without slide identity.

The browser evidence file is privacy-safe and shape/inventory locked by
Vitest. It records browser identities, actual platform, and DPR but no local
path, username, hostname, private source text, or private font bytes.

Its deterministic updater accepts only the exact passed C8 Playwright JSON
result for one zero-retry Chromium, Firefox, and WebKit project on the declared
UTC capture date. Each post-assertion attachment contains only the browser
environment and ordered raw browser widths plus exact input identities. The
updater independently recomputes every Fontkit width, glyph count, pixel
envelope, available width, delta, band, maximum, and engine/grid status from
the checked local bytes. The durable aggregate binds the browser kernel,
calibration fixture, font bytes and manifest, C8 test source, and diagram
fixture by SHA-256 and byte length; `browser-calibration:check` refuses any
stale identity. A failed, skipped, flaky, wrong-project, wrong-spec, private,
stale, algebra-bearing, or otherwise malformed synthetic attachment publishes
no evidence. This is strict integrity validation for an explicit
maintainer-supplied local report, not cryptographic runner attestation.
Inputs are read through bounded non-symlink descriptors; update mode holds an
exclusive adjacent lock, rechecks the destination bytes before publication,
syncs a same-directory temporary file, and renames only the complete canonical
aggregate.

## Checked worked-deck inventory

The private TDFLite worked example is represented only by a checked,
content- and font-hash-bound inventory at
`packages/pptv/test-fixtures/c8/tdflite-text-fit-inventory.json`; neither its
source nor separately licensed font bytes are vendored. The inventory binds
TDFLite commit `2f0cba44a0904c8c964123253050ef32f793e7e2`, source SHA-256
`eda92b47bc92720436a3f5f2c20681d8c2de97685b535505df3d5a39f8928f69`,
Fontkit 2.0.4, and the four exact font-byte identities. At a 0.95 near-limit
threshold its 153 hard lines lock 122 clear, 10 near-limit, 21 overflow, and
zero unverified results.

## Behavioral boundaries

- Preflight never changes source, text, font size, frame, anchor, line breaks,
  or geometry.
- It never wraps, autofits, shrinks, truncates, or proposes an automatic
  repair.
- It measures C6 hard lines independently; vertical fit and baseline parity are
  outside C8 1.1.
- A structural C4/C6 error prevents preflight because no resolved model exists.
- Fontkit evidence certifies the reported shaped advance for the identified
  bytes and adapter. It is not a claim of pixel-identical browser or PowerPoint
  rendering.
- For HTML decks, C7 1.1 maps native font size and frame geometry through the
  same physical scale, so their horizontal utilization ratio remains in SVG
  user space. PowerPoint shaping/render calibration is still required.
- Standalone-diagram utilization is evidence only in its declared logical
  coordinate space. It supplies no physical-size or C7 compilation claim.
- Browser `getComputedTextLength()` after exact `FontFace` loading and
  `document.fonts.ready` is an implemented, environment-labeled adapter. Its
  checked engine-specific calibration is not a universal renderer-parity
  claim. Native Office render comparison remains the highest fidelity gate.
- A future OpenDocKit LUT adapter may provide conservative width bounds and
  substitution evidence. It must not become a PPTV core dependency or call a
  fallback result exact.

## CLI contract

The Node CLI command is:

```bash
pptv text-fit deck.pptv.html --font-map fonts.json [--near-limit 0.9]
pptv text-fit diagram.pptv.svg --font-map fonts.json [--near-limit 0.9]
```

JSON output uses the complete source-kind-specific result:
`pptv-text-fit/0.1` for a deck or `pptv-diagram-text-fit/0.1` for a diagram.
Text output lists every non-clear line and a summary. Definite overflow or any
unverified line returns exit code 1; an artifact containing only
clear/near-limit lines returns 0. Invocation errors return 2 and
environment/font-loading failures return 3.

## Error and promotion gates

C8 remains `in-progress` until every promotion gate is closed:

- [x] Pure anchor/status/adversarial-measurer fixtures pass.
- [x] Exact-font adapter, font-map, and CLI fixtures pass.
- [x] Standalone-diagram ordering, identity, schema, and CLI fixtures pass.
- [x] The worked TDFLite deck locks its known overrun inventory.
- [x] Browser advance measurements are compared with the exact-font adapter,
      including explicit WebKit kerning variance.
- [ ] Representative lines are calibrated against native PowerPoint rendering.

No gate may be promoted by automatically changing an authored line.

## Dependencies

- Depends on: `CONTRACT:C6-PPTV-RESOLVED.1.1`
- Exact-font Node adapter: pinned `fontkit@2.0.4`
- Browser build/calibration: exact `esbuild@0.28.1` and
  `@playwright/test@1.62.0`
- Browser font fixture: OFL ABeeZee Regular, exact SHA-256
  `2901c8df256648cc2bb2e3afb381cb8d28e65ed3dbe11de20695ae4d5ffdeda9`
- OpenDocKit: no runtime dependency

## Implementing Files

- `packages/pptv/src/core/text-fit.ts`
- `packages/pptv/src/node/fontkit-text-measurer.ts`
- `packages/pptv/src/browser/text-measurer.ts`
- `packages/pptv/src/cli.ts`
- `packages/pptv/e2e/browser-conformance.spec.ts`
- `packages/pptv/scripts/update-browser-calibration-evidence.mjs`
- `packages/pptv/test-fixtures/c8/browser-calibration-evidence.json`
- `packages/pptv/test-fixtures/c8/tdflite-text-fit-inventory.json`
- `packages/pptv/src/__tests__/browser-calibration-updater.test.ts`
- `packages/pptv/src/__tests__/browser-calibration-evidence.test.ts`
- `packages/pptv/src/__tests__/c8-regression-inventory.test.ts`

## Test Requirements

- [x] Anchor-aware start/middle/end capacity and nested-group invariance
- [x] Clear, boundary/near-limit, overflow, zero-capacity, and custom threshold
- [x] Deterministic manifest/DOM/line ordering and immutable JSON-safe results
- [x] Missing face/style/codepoint and invalid/throwing measurer results
- [x] Strict font-map parsing, exact face metadata, content hash, and shaping
- [x] CLI JSON/text output and exit codes
- [x] Standalone diagram evidence uses diagram identity/root DOM order and
      contains no synthetic slide/deck/physical-canvas state
- [x] Diagram CLI emits `pptv-diagram-text-fit/0.1` with the same exact-font
      classification and exit semantics
- [x] TDFLite worked-deck regression inventory
- [x] Browser exact-font calibration evidence in Chromium, Firefox, and WebKit
- [x] Strict Playwright-result ingestion, local Fontkit/grid derivation,
      input-identity freshness, refusal atomicity, and deterministic evidence
      publication
- [ ] Native PowerPoint calibration evidence

## Retirement / supersession plan

- **Predecessor:** `CONTRACT:C8-PPTV-TEXT-FIT.1.0` — retired by this additive
  diagram-evidence revision; existing deck result/request schemas are retained.
- **Migration boundary:** update implementation headers and consumers to 1.1
  when diagram request/result types, CLI dispatch, and fixtures land.
- **Migration owner:** PPTV text-fit maintainer.

## Change History

| Version | Date       | Change                                                                                                                              | Migration                                                                                           |
| ------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1.0     | 2026-07-29 | Initial exact-font, anchor-aware, non-mutating deck text-fit preflight                                                              | —                                                                                                   |
| 1.1     | 2026-07-30 | Add diagram-specific measurement requests and `pptv-diagram-text-fit/0.1` evidence without synthetic slide or physical-canvas state | Existing deck requests/results are unchanged; diagram callers use the dedicated function and schema |
