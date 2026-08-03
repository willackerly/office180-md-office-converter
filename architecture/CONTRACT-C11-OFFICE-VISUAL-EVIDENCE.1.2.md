# CONTRACT-C11-OFFICE-VISUAL-EVIDENCE.1.2

<!-- SUPERSEDES: CONTRACT-C11-OFFICE-VISUAL-EVIDENCE.1.1 -->

**Version:** 1.2
**Status:** in-progress
**Owner:** Will Ackerly
**Type:** Operational
**Cross-repo Promotability:** Yes — candidate for OpenDocKit and Rebar adopters
**Source:** `ROADMAP.md` §6, `VECTOR180-IMPLEMENTATION-PLAN.md` §6,
`SVG-TO-EDITABLE-PPTX.md` §8, and the 2026-08-02 macOS native lifecycle run

## Why this exists

Structural equality cannot prove that Word or PowerPoint rendered the intended
document. Visual claims need reproducible artifact, renderer, font,
environment, image, comparison, native-lifecycle, and human-review identities
so one screenshot or successful save is not mistaken for universal Office
fidelity.

C11 provides one renderer-neutral evidence envelope for Markdown/DOCX,
canonical Vector180/PPTX, and legacy PPTV/PPTX round trips. It also defines a
bounded local bridge for one native
Office no-op save/reopen lifecycle without modifying the delivery artifact,
taking over unrelated documents, hanging indefinitely, or interacting with a
file-access dialog. That lifecycle is useful structural evidence and a
version-bound normalization baseline, but it does not prove representative
editability or visual fidelity.

## Who needs this

- **DOCX round-trip tests** — need page evidence and native package persistence
  around Markdown/DOCX/Markdown recovery.
- **C9/C10 Vector180 and legacy PPTV workflows** — need source, generated,
  native-saved, edited, reconciled, and regenerated slide evidence without
  crossing lineage families.
- **CI and release reviewers** — need deterministic thresholds and explicit
  unavailable/manual states.
- **Agents** — need a privacy-safe, digest-bound native lifecycle report that
  cannot overclaim the scope it proved.
- **Cross-repository adapters** — need distinct identities for OpenDocKit,
  browser, Quick Look, PDF, and native Office evidence.

## Scenarios

### Scenario 1 — deterministic automated smoke

CI renders a trusted DOCX with a pinned Quick Look generator and a validated
Vector180 or legacy PPTV SVG with pinned Playwright Chromium. It records
source/image hashes,
renderer/environment identities, dimensions, options, and comparison metrics.

### Scenario 2 — bounded native no-op lifecycle

The bridge copies one trusted repository artifact to ignored private state,
hands that exact path to Word or PowerPoint without prompting, forces an
ordinary in-place save, validates the package, closes, reopens without repair,
and publishes a new saved copy plus a last-published report commit marker.

### Scenario 3 — unavailable or denied native access

Office is absent, automation times out, or Launch Services cannot hand off the
exact file without a grant dialog. Evidence records a bounded unavailable or
failed state. The bridge never clicks or grants access, and Quick Look cannot
substitute for native evidence.

### Scenario 4 — reviewed renderer variance

Browser and PowerPoint antialiasing differ while geometry and line membership
agree. Quantitative evidence records thresholds/masks, and a human review binds
its decision to the evidence hash. Neither step rewrites source or widens a
global tolerance.

## Interfaces

### Renderer-neutral evidence

```ts
type VisualEvidenceState =
  "passed" | "failed" | "unavailable" | "manual-required";

interface OfficeVisualEvidence {
  readonly schema: "office180-visual-evidence/0.1";
  readonly evidence_sha256: string;
  readonly subject: {
    readonly lane: "markdown-docx" | "vector180-pptx" | "pptv-pptx";
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

These snake_case spellings are the exact persisted JSON interface; camelCase
is not an alternate wire format.

`VisualCaptureEvidence` records renderer kind/product/binary/version, OS and
architecture, display scale/DPR, locale and flags, controlled font identities,
input/output geometry and background, bounded command evidence, image/PDF
hashes and media inventory, and explicit state/diagnostic.

`VisualComparisonEvidence` records exact baseline/candidate evidence and image
hashes, dimensions/colorspace, implementation/version, raw metrics,
thresholds/crops/antialias/mask evidence, changed-pixel bounds and optional diff
hash, and deterministic pass/fail.

`NativeOfficeEvidence` records application/version, open without repair,
representative editability checks, saved size/hash, package validation, reopen,
optional exported evidence, method, scope, and state.

`HumanVisualReview` binds reviewer, checkpoints/crops, decision, and rationale
to the exact evidence-envelope hash. It never replaces quantitative evidence.

### Native lifecycle bridge

```python
def run_native_lifecycle(
    artifact: Path,
    *,
    output: Path,
    root: Path,
    trusted: bool,
    timeout_seconds: float,
) -> dict:
    """Return one office180-native-office-bridge/0.1 report."""
```

```text
scripts/native-office-bridge.py lifecycle INPUT \
  --output SAVED_COPY --report REPORT.json \
  --root REPOSITORY --trusted [--timeout SECONDS]
```

The bridge report has:

```json
{
  "schema": "office180-native-office-bridge/0.1",
  "status": "passed | failed | unavailable",
  "phase": "preflight | open | attach | save | close | validate | reopen | publish | complete",
  "input": {},
  "application": {},
  "environment": {},
  "lifecycle": {},
  "commands": [],
  "output": {},
  "diagnostics": []
}
```

Input/output bind repository-relative paths, SHA-256, byte size, and Office
media kind. Application binds exact bundle ID, short version, and build.
Lifecycle separates handoff, exact attachment, writable/saved state, forced
dirty save, Save return, independent post-Save probe, quiescence, ZIP
validation, close, and reopen. Command records contain redacted descriptions,
timeouts, duration, exit status, and output digests. Repeated attachment polls
collapse to one bounded summary.

The bridge schema is `schemas/native-office-bridge-0.1.schema.json`. A passed
report labels its scope `native-no-op-save-lifecycle`; representative
editability and visual fidelity remain `not-tested`.

## Implemented browser capture profile

`scripts/visual-evidence.py capture-browser-svg` captures one trusted,
validated standalone canonical `*.vector180.svg` atom or frozen legacy
`*.pptv.svg` atom. A reconciled C10 result becomes eligible only after its
patch is applied to a new same-family atom and that exact output independently
validates.

The adapter:

- requires explicit `--trusted`, repository-contained input/output, a
  `.vector180.svg` or legacy `.pptv.svg` input, and new `.png` destination;
- selects source family once, runs the matching non-executing validator, and
  re-hashes the same bytes before serving; canonical validation is exactly
  `vector180-atom-validation/0.1`, while legacy evidence retains
  `pptv-diagram-validation/0.1`;
- serves one fixed wrapper and validated SVG at randomized routes on an
  ephemeral `127.0.0.1` server, never `file://`;
- disables document JavaScript/service workers, applies restrictive CSP, and
  blocks requests outside those routes;
- fixes pinned Chromium, opaque background, centered `contain`, DPR 1,
  `en-US`, UTC, reduced motion, and declared flags;
- records viewport, PNG geometry/colorspace, artifact/image hashes, exact
  Playwright/Chromium identities, redacted executable path, command evidence,
  and envelope hash; and
- bounds validation/capture/cleanup, refuses existing outputs, and publishes
  only after PNG header and dimension checks.

This captures one SVG view, not a deck, PPTX, PDF, crop set, animation, or
interactive runtime. Width/height are each at most 4096 pixels and area at most
16,777,216 pixels. Host fonts are uncontrolled and recorded as `fonts: []`;
C8 exact-font evidence remains separate. A pass proves only the named browser
environment, and trusted validation is not a hostile-document sandbox.

## Behavioral Contracts

### General visual and review evidence

| Behavior                | Specification                                                                                                                                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact identity          | Every durable input, output, mask, diff, bridge report, and evidence envelope is content-hashed. Product labels without version/environment identity are insufficient.                                                                             |
| Visual lane family      | Canonical evidence uses `vector180-pptx`; frozen historical evidence retains `pptv-pptx`. Lane, suffix, validator schema, exact source family, C9/C10 lineage, and checkpoint must agree. Cross-family pairs fail rather than relabeling evidence. |
| Trust                   | Automated direct-open capture accepts only repository-trusted or already validated artifacts. Untrusted source requires separate sandboxed intake.                                                                                                 |
| Deterministic capture   | Capture fixes viewport/page size, background, scale, locale, renderer options, and bounded execution. Environment-dependent results are never universalized.                                                                                       |
| Renderer separation     | Browser, Quick Look, OpenDocKit, LibreOffice, PDF producer/rasterizer, Word, and PowerPoint are distinct evidence classes and never satisfy one another implicitly.                                                                                |
| Quick Look              | Quick Look is automated preview smoke only, not native Office open, editability, save, or reopen evidence.                                                                                                                                         |
| Browser                 | Browser capture identifies engine/version/platform/DPR and controlled font bytes when available. An empty font list cannot become exact-font or Office evidence.                                                                                   |
| PDF                     | PDF evidence identifies producer separately from rasterizer. Stable rasterization does not prove Office save/reopen.                                                                                                                               |
| Full native lifecycle   | A full native pass requires bounded open without repair, representative supported editability, non-empty save, package validation, reopen, and the separately required visual review. Missing/hung automation is unavailable, never pass.          |
| Quantitative comparison | Dimensions/colorspace agree or use a declared deterministic normalization. Metrics, thresholds, masks, and crops are fixture-specific and reviewable.                                                                                              |
| Masks                   | A hashed mask excludes only declared nondeterministic regions and cannot hide text movement, clipping, unexpected wrap, object loss, or z-order change.                                                                                            |
| Antialias variance      | Tolerance may absorb edge/color variance, not geometric displacement. Threshold changes require reviewed evidence.                                                                                                                                 |
| Human review            | Full native visual promotion requires review of the full page/slide and declared high-risk crops. Automated smoke can remain green without that claim.                                                                                             |
| Missing capability      | Unavailable renderer/application/font is explicit bounded evidence; CI decides whether it skips, blocks, or invokes a manual gate.                                                                                                                 |
| No source mutation      | Capture/comparison never edit canonical source or delivery artifacts. Native checks use temporary copies.                                                                                                                                          |
| Privacy                 | Checked evidence excludes usernames, home paths, hostnames, private document text, proprietary font bytes, and raw private Office metadata; paths are repository-relative or redacted.                                                             |

### Native no-op lifecycle bridge

| Behavior                   | Specification                                                                                                                                                                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trusted scoped input       | Caller asserts `--trusted`; input/output/report/work root resolve inside the repository. Input is one non-empty DOCX/PPTX and destinations are new. Descriptor-bound identity/hash checks reject changes during the work copy.                                  |
| Safe private state         | Ignored work root is a real repository child, never a symlink. The repository lock is regular, non-symlink, single-link, and held through Office cleanup, work disposition, and report publication.                                                             |
| Exact-file handoff         | The bridge copies input to a unique ignored work directory and uses the checked-in NSWorkspace helper with `promptsUserIfNeeded=false`. AppleScript never opens a path directly or interacts with grant UI.                                                     |
| Handoff lifecycle          | Attempt, helper acceptance, Office attachment, and proven post-close absence are separate. After attempted handoff, work state is deleted only after exact attachment and proven absence; denied/unresolved handoff is preserved.                               |
| In-place Office save       | Office saves only the handed-off work copy. The bridge forces `saved=false` and invokes ordinary Save, never Save As. Save succeeds only when the event returns true and an independent exact-path probe sees one writable document with `saved=true`.          |
| Exact attachment           | Every AppleScript action matches exact POSIX full path under case/diacritic consideration. Name, frontmost/active document, order, case folding, Unicode normalization, or activation never substitutes.                                                        |
| User-state isolation       | The bridge probes for collision before handoff, never quits an app, never closes unrelated documents, and closes only its work copy.                                                                                                                            |
| Bounded execution          | Handoff, Apple events, attachment polling, quiescence, cleanup, and total lifecycle have finite deadlines. Timeout terminates only the bridge child, never Office. Poll reports remain constant size.                                                           |
| File-access classification | A final observed zero after accepted handoff is `OFFICE-NATIVE-FILE-ACCESS`, not a last-millisecond timeout. The bridge never clicks, types into, or bypasses a grant dialog.                                                                                   |
| Save quiescence            | Saved bytes are non-empty and stable in size/SHA-256 across bounded polls; successful Apple events with absent/empty/changing bytes fail.                                                                                                                       |
| Package validation         | DOCX/PPTX is a safe CRC-valid ZIP with required content types/main part. Duplicate, encrypted, POSIX-absolute, Windows-drive, traversal, and backslash names refuse.                                                                                            |
| Reopen                     | The exact copy closes, is handed off again, attaches exactly, reports writable and `saved=true`, closes, and retains its package hash before `open_without_repair` becomes true.                                                                                |
| Publication                | After reopen, saved bytes publish to the explicit new output, followed by the canonical report as logical pair commit marker. Consumers require the last-published report, `pair_committed=true`, and matching output hash. Failure never commits output.       |
| Publication residual       | Output/report may occupy different directories, so power loss can leave an orphan output. Absence of the report commit marker makes it invalid and is the recovery signal.                                                                                      |
| Failure cleanup            | After unique attachment, failure attempts bounded exact-path close without save. Cleanup failure is recorded and work state is preserved whenever absence is unproven.                                                                                          |
| Application identity       | A pass binds exact bundle identifier, `CFBundleShortVersionString`, and `CFBundleVersion`; missing/mismatched identity is unavailable.                                                                                                                          |
| Normalization baseline     | A passed copy may be supplied to C10 only with its exact application/version report. It is evidence for that environment, not a universal allowlist.                                                                                                            |
| Bridge privacy             | Reports and summaries contain repository-relative/redacted paths and hashes, never usernames, home paths, hostnames, text, requested absolute paths, Office metadata values, or raw helper/AppleScript output.                                                  |
| Evidence composition       | `visual-evidence.py bind-native-bridge` binds an exact valid bridge-report digest/output identity into an existing passing capture while retaining `native_lifecycle.status=manual-required`, `editability_checked=false`, and `visual_fidelity_checked=false`. |

The binder verifies report/output relative path, hash, size, lane/application
pairing, exact application identity, required lifecycle flags, bounded/redacted
shape, and privacy. Its `evidence_scope` remains
`native-no-op-save-lifecycle`; binding never converts the evidence envelope to
a native `passed` claim.

## Error Contracts

### Visual evidence

| Error                        | When                                                                            | Code                             |
| ---------------------------- | ------------------------------------------------------------------------------- | -------------------------------- |
| Invalid manifest             | Schema, enum, digest, dimensions, identity, or bound bridge evidence is invalid | `OFFICE-VISUAL-EVIDENCE-INVALID` |
| Visual family mismatch       | Lane, suffix, validator schema, source family, or C9/C10 lineage disagree       | `OFFICE-VISUAL-FAMILY`           |
| Unsafe input                 | Capture target is untrusted or outside scope                                    | `OFFICE-VISUAL-UNSAFE-INPUT`     |
| Renderer unavailable         | Required renderer/application/font is absent                                    | `OFFICE-VISUAL-UNAVAILABLE`      |
| Capture timeout              | Renderer or Office automation exceeds its bound                                 | `OFFICE-VISUAL-TIMEOUT`          |
| Empty output                 | Renderer succeeds without non-empty output                                      | `OFFICE-VISUAL-EMPTY`            |
| Dimension mismatch           | Inputs cannot compare under declared normalization                              | `OFFICE-VISUAL-DIMENSIONS`       |
| Comparison failure           | Metric exceeds threshold or prohibited region changes                           | `OFFICE-VISUAL-MISMATCH`         |
| Invalid mask                 | Mask is missing, stale, wrong-sized, or hides a prohibited region               | `OFFICE-VISUAL-MASK`             |
| Native repair/reopen failure | Office repairs, cannot save non-empty bytes, or cannot reopen                   | `OFFICE-VISUAL-NATIVE`           |

### Native bridge

| Error           | When                                                                | Code                        |
| --------------- | ------------------------------------------------------------------- | --------------------------- |
| Unsafe request  | Trust, containment, extension, alias, or new-destination rule fails | `OFFICE-NATIVE-UNSAFE`      |
| Busy bridge     | Another lifecycle holds the repository bridge lock                  | `OFFICE-NATIVE-BUSY`        |
| App unavailable | Platform, Launch Services, osascript, or Office bundle is absent    | `OFFICE-NATIVE-UNAVAILABLE` |
| File access     | Exact handoff cannot complete without broader access                | `OFFICE-NATIVE-FILE-ACCESS` |
| Timeout         | One bounded phase expires                                           | `OFFICE-NATIVE-TIMEOUT`     |
| Attachment      | Exact work path cannot be found uniquely                            | `OFFICE-NATIVE-ATTACH`      |
| Read-only       | Office reports the copy read-only                                   | `OFFICE-NATIVE-READ-ONLY`   |
| Save            | Save event or byte quiescence fails                                 | `OFFICE-NATIVE-SAVE`        |
| Package         | Saved bytes fail safe ZIP/required-part validation                  | `OFFICE-NATIVE-PACKAGE`     |
| Reopen          | Exact saved copy cannot close/reopen cleanly                        | `OFFICE-NATIVE-REOPEN`      |
| Publish         | Ordered output/report publication fails                             | `OFFICE-NATIVE-PUBLISH`     |
| Cleanup         | Bridge cannot close only its work copy                              | `OFFICE-NATIVE-CLEANUP`     |

No native error path publishes a partial Office output or passing report.

## Dependencies

- Depends on lane-specific C3, `CONTRACT:C9-PPTV-PPTX-BASELINE.2.0`, and
  `CONTRACT:C10-PPTV-PPTX-RECONCILIATION.2.0` package/semantic validation;
  C11 never substitutes for them.
- Legacy `pptv-pptx` evidence remains interpreted under C9 1.0/C10 1.2 and is
  never rewritten.
- Configuration: capture profile, thresholds, masks, trust assertion, work
  root, and finite timeout.
- Browser: pinned Playwright/Chromium through repository tooling.
- Native macOS: standard-library Python, `/usr/bin/swift`,
  `/usr/bin/osascript`, AppKit `NSWorkspace`, Word or PowerPoint.
- Other renderer adapters remain optional and separately identified.

## Cross-references

- **Source docs:** `ROADMAP.md` §6, `VECTOR180-IMPLEMENTATION-PLAN.md` §6, and
  `SVG-TO-EDITABLE-PPTX.md` §8.

## Future evolution

- Add OpenDocKit, LibreOffice, Windows Open XML SDK, controlled-font browser,
  PDF, and platform-specific native adapters without merging identities.
- Add a representative native-edit driver only with equally strict
  exact-document isolation and explicit edit verification.
- A shared Rebar practice may consume this envelope after at least two adopters
  agree on privacy and CI policy.

## Retirement / supersession plan

- **Predecessor:** C11 1.0 remains in Git history. C11 1.1 stays beside this
  current 1.2 contract as a superseded historical file because frozen legacy
  generator/native-bridge source and checked evidence bind its exact ID and
  script bytes.
- **Migration boundary:** existing `office180-visual-evidence/0.1` manifests
  and `pptv-pptx` lanes remain valid; new canonical visual evidence uses
  `vector180-pptx`, and native automation opts into the separate bridge report
  and binder.
- **Migration owner:** Office evidence maintainer.

## Implementing Files

- `scripts/visual-evidence.py`.
- `scripts/capture-browser-svg.mjs`.
- `scripts/native-office-bridge.py`.
- `scripts/native-office-handoff.swift`.
- `schemas/office180-visual-evidence-0.1.schema.json`.
- `schemas/native-office-bridge-0.1.schema.json`.
- `tests/test_visual_evidence.py`.
- `tests/test_native_office_bridge.py`.
- `tests/fixtures/visual-evidence/`.
- `tests/fixtures/roundtrip-evidence/`.

## Test Requirements

- [x] Deterministic trusted SVG/browser capture with exact engine identity and
      explicit uncontrolled-font evidence.
- [ ] Controlled-font browser capture with exact font-byte identity.
- [x] Deterministic DOCX/PPTX Quick Look smoke with generator/OS identity.
- [x] Checked DOCX and PPTV generated/edited/recovered/regenerated bundles with
      bounded deliberate-change and zero-difference regeneration gates.
- [x] Canonical `vector180-pptx` browser/native/round-trip evidence uses the
      matching validator and C9/C10 2.0 lineage while legacy evidence remains
      byte-identical.
- [ ] Every lane/suffix/validator/lineage cross-family pair refuses.
- [ ] PDF page rasterization with producer and rasterizer identities separated.
- [x] Exact-match, tolerated-antialias, masked, dimension-mismatch, and hard
      comparison failures.
- [x] Timeout, unavailable renderer, empty output, unsafe input, and invalid
      mask cases.
- [x] Explicit native-Office unavailable/manual evidence paths.
- [x] Checked-manifest privacy scan.
- [ ] Human-review record bound to the exact evidence hash.
- [x] Unit tests cover bridge containment, symlink-safe work state, regular
      locking, input-copy race rejection, redaction, exact application identity,
      case/diacritic attachment, Save/post-Save/reopen state, package safety,
      bounded polls, unresolved handoff preservation, lock-held cleanup, and
      commit-marker publication without launching Office.
- [x] Native Word 16.111.2 no-op save, non-empty package validation, exact
      close/reopen, and embedded C2 source persistence.
- [x] Native PowerPoint 16.111.2 no-op save, non-empty package validation,
      exact close/reopen, and C9 lineage persistence.
- [ ] A real file-access denial is captured and reported without UI
      interaction.
- [x] Visual evidence binds the exact bridge-report digest while retaining
      manual-required scope.
- [x] Full native reports pass repository privacy validation.
- [ ] Native Office representative supported edit/save/reopen is proven for
      both lanes.
- [ ] Native full-page/slide and high-risk-crop visual fidelity receives
      hash-bound human review.

## Change History

| Version | Date       | Change                                                                                                                                                                            | Migration                                                                                   |
| ------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1.0     | 2026-08-01 | Initial renderer-neutral visual/native evidence envelope and bounded browser/Quick Look/compare slice                                                                             | No predecessor                                                                              |
| 1.1     | 2026-08-02 | Bounded non-interactive native lifecycle bridge, exact save/reopen evidence, safe preserved handoff state, report commit marker, binder, and version-bound normalization baseline | Existing 0.1 manifests remain valid; native automation opts into the separate bridge report |
| 1.2     | 2026-08-02 | Add canonical `vector180-pptx` lane and validator identity while preserving `pptv-pptx` as a frozen legacy evidence family                                                        | New evidence selects one family; old manifests remain byte-identical                        |
