# CONTRACT-C11-OFFICE-VISUAL-EVIDENCE.1.0

**Version:** 1.0
**Status:** in-progress
**Owner:** Will Ackerly
**Type:** Operational
**Cross-repo Promotability:** Yes — candidate for OpenDocKit and Rebar adopters
**Source:** `ROADMAP.md` §6, `PPTV-IMPLEMENTATION-PLAN.md` §6, and
`SVG-TO-EDITABLE-PPTX.md` §8

## Why this exists

Structural equality cannot prove that Word or PowerPoint rendered the intended
document. Visual claims need reproducible artifact, renderer, font,
environment, image, comparison, and human-review identities so a screenshot
cannot be mistaken for universal Office fidelity.

This contract provides one evidence envelope for both Markdown/DOCX and
PPTV/PPTX round trips while keeping native-Office validation distinct from
Quick Look, browser, PDF, or third-party-renderer evidence.

## Who needs this

- **DOCX round-trip tests** — need checked page evidence before and after a
  Markdown/DOCX/Markdown cycle.
- **C9/C10 PPTV workflows** — need source, generated, edited, reconciled, and
  regenerated slide comparisons.
- **CI and release reviewers** — need deterministic thresholds and explicit
  unavailable/manual states rather than an unrecorded visual assertion.
- **Cross-repository adapters** — need a renderer-neutral evidence schema that
  can identify OpenDocKit, browser, Quick Look, or native Office captures.

## Scenarios

### Scenario 1 — deterministic automated smoke

CI renders a trusted generated DOCX with the pinned macOS Quick Look Office
generator and a PPTV SVG in pinned Playwright Chromium. It records source and
image hashes, exact renderer/environment identities, dimensions, and capture
commands. A changed image is compared with the matching-environment baseline
under declared metrics and masks.

### Scenario 2 — native Office unavailable

The host has Microsoft Word installed, but unattended AppleScript export hangs.
The evidence records `unavailable` with the bounded attempt and diagnostic. A
Quick Look pass may still satisfy an automated smoke lane, but cannot be
reported as native Word open/save/reopen proof.

### Scenario 3 — reviewed renderer variance

Browser and PowerPoint text antialiasing differ while object geometry and line
membership agree. The quantitative comparison records its threshold/mask and a
human review records the accepted difference, reviewer, and evidence hash.
Neither step rewrites source or raises the threshold globally.

## Interfaces

```ts
type VisualEvidenceState =
  | "passed"
  | "failed"
  | "unavailable"
  | "manual-required";

interface OfficeVisualEvidence {
  readonly schema: "office180-visual-evidence/0.1";
  readonly evidence_sha256: string;
  readonly subject: {
    readonly lane: "markdown-docx" | "pptv-pptx";
    readonly checkpoint: string;
    readonly artifact_path: string;
    readonly artifact_sha256: string;
    readonly source_sha256?: string;
  };
  readonly capture: VisualCaptureEvidence;
  readonly comparison?: VisualComparisonEvidence;
  readonly native_lifecycle?: NativeOfficeEvidence;
  readonly human_review?: HumanVisualReview;
}
```

The property spellings above are the exact persisted JSON interface. Nested
evidence types likewise use the snake_case names defined by the published
schema; TypeScript-style camelCase is not an alternate wire format.

`VisualCaptureEvidence` records:

- renderer kind, product/binary identity, exact version, and executable path;
- operating system, architecture, display scale/device-pixel ratio, locale,
  and relevant rendering flags;
- explicit font names plus hashes when bytes are controlled;
- input page/slide/viewBox and output pixel dimensions/background;
- exact command/options, bounded timeout, exit status, stdout/stderr digests;
- image/PDF path, SHA-256, media type, page count, and per-page image hashes;
  and
- state plus diagnostic when capture is unavailable or manual.

`VisualComparisonEvidence` records:

- baseline/candidate evidence and image hashes;
- exact dimensions and colorspace;
- comparison implementation and version;
- metric names and raw values;
- thresholds, crop regions, antialias tolerance, and mask path/hash;
- changed-pixel bounds and optional diff-image hash; and
- deterministic pass/fail state.

`NativeOfficeEvidence` records application name/version, open-without-repair,
representative editability checks, save target size/hash, ZIP validation where
applicable, reopen result, exported PDF/image hashes, automation/manual method,
and state.

`HumanVisualReview` records the evidence-envelope hash, reviewer, reviewed
checkpoint/crops, decision, and concise rationale. It does not replace the raw
quantitative result.

## Implemented browser capture profile

`scripts/visual-evidence.py capture-browser-svg` implements the first bounded
browser lane for a trusted standalone `*.pptv.svg` atom. A reconciled C10
result is eligible only after its patch has been applied to a new
`*.pptv.svg`, and that exact output independently passes the normal PPTV
validator. The adapter does not capture a reconciliation patch/report
directly.

The adapter:

- requires an explicit `--trusted` assertion, repository-contained artifact
  and output paths, a `.pptv.svg` input, and a new `.png` destination;
- runs `pnpm pptv validate` without executing embedded viewer/editor content,
  binds the validator's source hash, then requires the Node helper to re-hash
  the same bytes before serving them;
- serves one fixed wrapper and the validated SVG on randomized routes of an
  ephemeral `127.0.0.1` HTTP server; it never uses `file://`;
- disables document JavaScript and service workers, applies restrictive CSP,
  and blocks every browser request outside those two loopback routes;
- uses pinned Playwright Chromium with an opaque six-digit background,
  centered `contain` fit, DPR 1, `en-US`, UTC, reduced motion, and declared
  Chromium flags;
- records the requested viewport, actual PNG dimensions/colorspace, artifact
  and image hashes, Playwright/Chromium versions, redacted executable path,
  helper/flag-bound renderer identity, command result, and evidence-envelope
  hash; and
- deterministically divides the requested timeout between validation and
  browser capture, leaves helper cleanup headroom, refuses existing outputs,
  and publishes a PNG only after header and exact-dimension checks.

This profile is deliberately narrow:

- it captures one standalone SVG view only, not a `*.pptv.html` deck, PPTX,
  PDF, crop set, animation, or interactive runtime;
- width and height are each limited to 4096 pixels and the canvas to
  16,777,216 pixels; output DPR is fixed at 1 and `contain` may letterbox;
- host system fonts are not controlled or embedded, so the evidence records
  `fonts: []`; C8 exact-font evidence and cross-host font equivalence remain
  separate open gates;
- a passing browser image proves only the named Chromium environment. It does
  not prove native PowerPoint rendering, editability, save/reopen, or fidelity;
  and
- untrusted SVG intake remains unsupported. The trusted assertion plus normal
  PPTV validation is not a general hostile-document sandbox.

## Behavioral Contracts

| Behavior | Specification |
|----------|---------------|
| Exact identity | Every durable input, output, mask, diff, and evidence envelope is content-hashed. Renderer/product labels without version/environment identity are insufficient. |
| Trust | Automated direct-open capture accepts only repository-trusted or already validated generated artifacts. Untrusted source requires a separate sandboxed intake. |
| Deterministic capture | A capture command fixes viewport/page size, background, scale, locale, and renderer options. Environment-dependent results are never relabeled universal. |
| Renderer separation | Browser, Quick Look, OpenDocKit, LibreOffice, PDF rasterizer, Word, and PowerPoint are distinct evidence classes. One cannot satisfy another's gate implicitly. |
| Quick Look | macOS Office Quick Look is an automated preview smoke only. It is not native Word/PowerPoint open, editability, save, or reopen evidence. |
| Browser | A browser capture identifies engine/version/platform/DPR and exact font bytes where controlled. The initial adapter records an empty font list when it relies on host fonts and never promotes that result to exact-font or Office-native evidence. |
| PDF | PDF evidence identifies the producer separately from the rasterizer. A stable rasterization does not prove the producer saved/reopened the Office file. |
| Native lifecycle | A native pass requires bounded open without repair, representative supported editability, non-empty save, package/file validation, and reopen. Missing or hung automation is `unavailable`, never pass. |
| Quantitative comparison | Baseline and candidate dimensions/colorspace must agree or be normalized by a declared deterministic operation. Metrics, thresholds, masks, and crops are fixture-specific and reviewable. |
| Masks | A mask may exclude only declared nondeterministic pixels/regions and is itself hashed. It cannot hide text movement, clipping, unexpected wrap, object loss, or z-order change. |
| Antialias variance | Antialias tolerance may absorb small edge/color variance but not geometric displacement. Threshold changes require new reviewed evidence. |
| Human review | Promotion to full native visual fidelity requires a human review of full page/slide plus declared high-risk crops. Automated smoke may remain green without claiming that promotion. |
| Missing capability | Unavailable renderer/application/font is explicit evidence with a bounded diagnostic. CI policy decides whether that state skips, blocks, or requires a manual gate. |
| No source mutation | Capture and comparison never edit canonical source or delivery artifacts. Native editability checks use temporary copies. |
| Privacy | Checked evidence excludes usernames, home paths, hostnames, private document text, and proprietary font bytes; paths are repository-relative or redacted. |

## Error Contracts

| Error | When | Code |
|-------|------|------|
| Invalid manifest | Evidence schema, enum, digest, dimensions, or required identity is invalid | `OFFICE-VISUAL-EVIDENCE-INVALID` |
| Unsafe input | Capture target is untrusted or outside the authorized scope | `OFFICE-VISUAL-UNSAFE-INPUT` |
| Renderer unavailable | Required binary/application/font is absent | `OFFICE-VISUAL-UNAVAILABLE` |
| Capture timeout | Renderer or Office automation exceeds the configured bound | `OFFICE-VISUAL-TIMEOUT` |
| Empty output | Renderer reports success but output is absent or zero bytes | `OFFICE-VISUAL-EMPTY` |
| Dimension mismatch | Baseline/candidate cannot be compared under declared normalization | `OFFICE-VISUAL-DIMENSIONS` |
| Comparison failure | Metric exceeds its threshold or a prohibited structural region changes | `OFFICE-VISUAL-MISMATCH` |
| Invalid mask | Mask is missing, stale, wrong-sized, or hides a prohibited region | `OFFICE-VISUAL-MASK` |
| Native repair/reopen failure | Office repairs, cannot save a non-empty file, or cannot reopen it | `OFFICE-VISUAL-NATIVE` |

## Dependencies

- Depends on: lane-specific structural contracts; C11 never substitutes for them
- Configuration: checked capture profile, thresholds, masks, and timeout
- External: renderer-specific. Initial macOS automation may use `qlmanage`,
  Playwright, ImageMagick, `pdftoppm`, Microsoft Word, and Microsoft PowerPoint.

## Cross-references

- **Source docs:** `ROADMAP.md` §6, `PPTV-IMPLEMENTATION-PLAN.md` §6,
  `SVG-TO-EDITABLE-PPTX.md` §8

## Future evolution

- Add OpenDocKit, LibreOffice, Windows Open XML SDK, and platform-specific
  native Office adapters without merging their evidence identities.
- A shared Rebar practice may consume this envelope after at least two adopter
  implementations agree on privacy and CI policy.

## Implementing Files

- `scripts/visual-evidence.py`
- `scripts/capture-browser-svg.mjs`
- `schemas/office180-visual-evidence-0.1.schema.json`
- `tests/test_visual_evidence.py`
- `tests/fixtures/visual-evidence/`
- `tests/fixtures/roundtrip-evidence/`
- Planned: PDF and OpenDocKit/native-Office adapters

## Test Requirements

- [x] Deterministic trusted SVG/browser capture with exact engine identity and explicit uncontrolled-font evidence
- [ ] Controlled-font browser capture with exact font-byte identity
- [x] Deterministic DOCX and PPTX Quick Look smoke with generator/OS identity
- [x] Checked DOCX and PPTV generated/edited/recovered/regenerated bundles with
      bounded deliberate-change and zero-difference regeneration gates
- [ ] PDF page rasterization with producer and rasterizer identities separated
- [x] Exact-match, tolerated-antialias, masked, dimension-mismatch, and hard-failure comparisons
- [x] Timeout, unavailable renderer, empty output, unsafe input, and invalid mask cases
- [x] Explicit native-Office unavailable/manual evidence paths
- [ ] Native Office representative edit/save/reopen pass
- [x] Privacy scan for checked manifests
- [ ] Human-review record bound to the exact evidence hash

## Change History

| Version | Date | Change | Migration |
|---------|------|--------|-----------|
| 1.0 | 2026-08-01 | Initial cross-lane visual/native evidence contract and bounded Quick Look/browser/compare slice | No predecessor |
