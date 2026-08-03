# Project Metrics

<!-- FRESHNESS: Update this date every time you modify this file -->
<!-- freshness: 2026-08-02 -->

**Ground-truth metrics for the Python DOCX pair and canonical TypeScript
Vector180 kernel.**

The fenced block is checked by `scripts/check-ground-truth.sh`. Update it when
source files, tests, contracts, schemas, or themes change.

## Ground Truth (machine-verified)

```text
python_source_files = 2
test_files = 3
test_functions = 32
typescript_source_files = 38
typescript_test_files = 33
typescript_test_cases = 257
contracts = 12
published_schemas = 15
shipped_themes = 3
```

| Metric                    | Meaning                                      | Computed as                                    |
| ------------------------- | -------------------------------------------- | ---------------------------------------------- |
| `python_source_files`     | Root Python converter files                  | root `*.py`                                    |
| `test_files`              | Python `test_*.py` files                     | `tests/test_*.py`                              |
| `test_functions`          | Standalone Python test functions             | `def test_*` in `tests/test_roundtrip.py`      |
| `typescript_source_files` | Portable core, ops, Node IO, and CLI modules | non-test `*.ts` under `packages/vector180/src` |
| `typescript_test_files`   | Vitest files                                 | `packages/vector180/src/__tests__/*.test.ts`   |
| `typescript_test_cases`   | Vitest `it()`/`test()` cases                 | test declarations in those files               |
| `contracts`               | Current component contract IDs               | unique IDs in `architecture/CONTRACT-C*.md`    |
| `published_schemas`       | Vector180/Office evidence JSON Schemas       | `schemas/*.json`                               |
| `shipped_themes`          | DOCX theme JSON files                        | `themes/*.json`                                |

## Codebase Size (informational)

- `md2docx.py` — 1,287 lines.
- `docx2md.py` — 2,261 lines.
- `tests/test_roundtrip.py` — 2,385 lines; `tests/test_visual_evidence.py` —
  1,269 lines; `tests/test_native_office_bridge.py` — 694 lines.
- `packages/vector180/src/` — canonical non-test TypeScript modules across
  the portable source/resolved/text-fit kernel, operations, browser session,
  extraction/editor runtime, Node font/compiler/inspection/filesystem boundary,
  and CLI.
- `packages/vector180/src/__tests__/` — canonical Vitest files (excluding the
  shared helper).
- `packages/vector180/scripts/update-browser-calibration-evidence.mjs` — strict
  of strict Playwright-evidence parsing, validation, and canonical publication.

## Testing Status

- **Python:** 63 passing tests: 32 standalone DOCX tests, 14 C11 visual-evidence
  cases, and 17 native-bridge cases. They cover theme resolution, exact or
  diagnosed canonical equality, embedded-source integrity, Word/Markdown
  refusals, native Word style normalization/counterexamples, transactional CLI
  publication/rollback, three-way merge, visual capture/comparison/binding,
  bridge containment/locking/handoff/save/reopen/package/privacy behavior, link
  demotion, and `--no-footer`.
- **TypeScript:** 314 passing runtime Vitest cases from 257 direct
  `it()`/`test()` declarations (data-driven cases expand at runtime), covering
  exact UTF-8 source handling, BOM/non-BMP coordinates, non-executing security,
  strict HTML/XML/container/manifest validation, diagram/deck distinction,
  hierarchy/order, wire-family-bearing JSON-safe projections, atomic
  preserve-mode operations,
  deterministic slide hydration, exact-source browser sessions/editor packs,
  C6 style/geometry/text resolution, C7 OPC/ZIP/OOXML mappings and failures, C8
  anchor/measurement/font-map/CLI behavior, deterministic three-engine
  calibration evidence updates, C5 0.2 typed native-object operations plus C5
  0.3 connector cloning, C9 explicit atom composition/mapped PPTX baselines,
  C10 proof-carrying normalization/reports/reviewed-copy reconciliation,
  contained C12 input-level incomparable reports, and race-safe CLI atomic
  writes.
- **Repo-scoped authoring skill:** structural validation and its executable
  self-check pass. The atom/deck starters are byte-locked to their scaffold
  helpers; the atom carries the safe discovery breadcrumb, exact ABeeZee face,
  and honest default style-family hint. The one-page atom card is the routine
  authoring surface, while the gate helper exercises atom/deck routing,
  atom-only metadata, default exact-font evidence, editor packaging, and
  explicit-placement PowerPoint paths without inferring geometry.
- **Browser conformance:** the checked ES2022 IIFE is 788,901 bytes with
  SHA-256
  `9c0b85b42b8eadbc6689c24517298f28c445b70e0fb0216eae4e2661d4cb6c3a`.
  Four real-HTTP C4/C6/C8 tests plus three writable-editor tests pass in each
  captured Chromium, Firefox, and WebKit project (21 of 21), including
  normalized Node/browser equality for the minimal deck, arbitrary-viewBox
  standalone kitchen sink, invalid profile, transactional editing, clean
  source/slide downloads, undo/redo, and tamper-safe read-only fallback.
- **Writable trusted editor:** its current generated IIFE is 769,359 bytes with
  SHA-256
  `23143c0782fcbe87aa4af6fc8425adb5fd7d5d67f4f2511d565fcb96ce9301e4`;
  `editor:check` exact-regenerates the app and stylesheet before accepting
  them.
- **Repository enforcement:** Rebar `v3.0.0-beta` Tier 3 runs all 14 adopter
  gates. The generated registry and Steward track twelve current contract IDs
  plus retained superseded contract versions. C8 2.0 is verified; C2–C7 and
  C9–C12 remain honestly `in-progress` where their bounded corpus,
  native/external, or human-review promotion gates are still open.
- **Skipped tests:** zero.

Manual C7 1.1 evidence on the exact artifact hash recorded in its contract
additionally includes ISO/ECMA/DCMI XSD validation, independent OpenDocKit
reopen/parse, and native PowerPoint 16.111.2 open plus two-page 16:9 PDF-render
smoke without repair. Native PPTX save/reopen and quantitative render comparison
remain open for that exact C7 canary.

The checked C11 round-trip bundles contain 19 durable DOCX-lane files, 32
frozen PPTV-lane files, and 32 canonical Vector180-lane files. DOCX
canonical→edited comparison records 7,270 changed pixels confined to
`[222,238,790,19]`; edited→regenerated is an exact same-renderer match. The
canonical Vector180 bundle's source→recovered browser comparison records
175,295 changed pixels confined to `[302,104,757,529]`; baseline→edited Quick
Look records 175,008 changed pixels; edited→regenerated Quick Look is exact.
Its edited/regenerated mapped slide XML is byte-identical, and independent C10
reinspection returns `unchanged`. Every bundle validates its C11 envelopes,
hashes, and privacy record. The canonical bundle also locks its declared
generator/dependency/font inputs in the normal Python suite. Native
representative editing remains `manual-required`, not passed. Those
generated/edit/regenerated fixture claims are separate from the host-scoped
no-op bridge evidence below.

On 2026-08-02, C11 1.2 passed a bounded exact-path, forced-dirty no-op
save → close → reopen → close lifecycle for Microsoft Word and PowerPoint
16.111.2 (build 16.111.26072617) on macOS 26.5.2 arm64. Both published work
copies were non-empty CRC-valid OOXML, reopened without repair, and retained
their saved hash. Same-renderer Quick Look baseline→native-save comparisons
changed 0 of 1,993,600 Word pixels and 0 of 1,443,200 PowerPoint pixels.
Recovered Word Markdown remained byte-identical; its eight native-pruned
heading properties were proven cascade-equivalent with zero drift. C10
classified the PowerPoint save as 111 named serialization-normalization
occurrences with zero source changes. OpenDocKit independently reopened that
native-saved PPTX as one `12192000 × 6858000` EMU slide. Bound evidence remains
`manual-required` with `editability_checked=false` and
`visual_fidelity_checked=false`; representative edits, native/cross-renderer
fidelity, and human review remain open.

The frozen legacy C8 worked-deck regression inventory at
`packages/pptv/test-fixtures/c8/tdflite-text-fit-inventory.json` binds
`TDFLite@2f0cba44a0904c8c964123253050ef32f793e7e2` source
`docs/product-briefing/tdflite-vs-opentdf.pptv.html` at SHA-256
`eda92b47bc92720436a3f5f2c20681d8c2de97685b535505df3d5a39f8928f69`
and exact mapped Microsoft Arial/Consolas files. Across 153 hard lines,
`text-fit` locks 122 clear, 10 at or above the 95% guard band, 21 definite
overflows, and zero unverified lines. The mapped SHA-256 identities are Arial
Regular
`525979822591a3447cfc49d943d6f7683508e25543407871c0ed8fed05fd2bd9`,
Arial Bold
`d72db21f9242aedd6b917d8549ad5921766b24d5f8d0becfda2ff4c620b3c2e0`,
Consolas Regular
`1acfcc504d232e39f1ff4f1b54e29af13234da142b1d1386a1f5c027b49e6ab0`,
and Consolas Bold
`de40b748651bdc09d308c9b542e3f9c0f66c567f830c474ae320553063be4ae5`.
The private source and separately licensed font bytes are not vendored. The
inventory retains an earlier trusted Chromium observation of 18 overflows;
because Consolas was unavailable and the selected face was not captured, that
observation remains explicitly informational and cannot certify parity or
substitution causality.

Independent reproducible browser calibration uses the public OFL ABeeZee
Regular fixture at SHA-256
`2901c8df256648cc2bb2e3afb381cb8d28e65ed3dbe11de20695ae4d5ffdeda9`,
exact `@playwright/test@1.62.0`, and the exact `esbuild@0.28.1` browser kernel
identified above. Against Fontkit 2.0.4 over six samples, Chromium
151.0.7922.34 and Firefox 153.0 match the kerned oracle with maximum absolute
deltas of 0.013875 and 0.021333 SVG units, respectively. WebKit 26.5 follows
the unkerned oracle despite explicit kerning declarations: its maximum
unkerned delta is 0.0000071 units, while its maximum kerned delta is 6.239998
units / 8.054520%. The checked privacy-safe evidence retains that variance,
keeps missing U+1F9EA `unverified`, and verifies four standalone-diagram lines
without slide identity. Native PowerPoint text calibration remains open.

The aggregate gate is:

```bash
pnpm test
```

## Contracts

- `C1-THEME-SCHEMA`, `C2-PROVENANCE`, and `C3-ROUNDTRIP` specify the DOCX
  implementation.
- `C4-PPTV-SOURCE` and `C5-PPTV-PATCH` retain stable historical contract stems
  while their 2.0 successors specify canonical Vector180 plus bounded frozen
  PPTV reads and one unified `vector180-patch/0.1` transaction vocabulary.
- `C6-PPTV-RESOLVED` 2.0 specifies browser-independent canonical atom/deck
  projections, deterministic metadata evidence, and canonical hydration.
- `C7-PPTX-CANARY` 2.0 specifies the deterministic canonical strict-subset
  PPTX writer; expanded native fixtures and quantitative fidelity remain.
- `C8-PPTV-TEXT-FIT` 2.0 specifies pure non-mutating preflight, the packaged
  exact ABeeZee default, and exact-font Node/browser evidence; native
  PowerPoint text calibration remains.
- `C9-PPTV-PPTX-BASELINE` 2.0 specifies explicit atom placement/composition,
  mapped native PPTX output, and canonical metadata/source binding.
- `C10-PPTV-PPTX-RECONCILIATION` 2.0 specifies baseline-aware edited-PPTX
  inspection, proof-carrying normalization, one unified patch proposal, and
  strict reviewed connector-copy resolution.
- `C11-OFFICE-VISUAL-EVIDENCE` specifies the in-progress cross-lane capture,
  quantitative comparison, native lifecycle, and human-review evidence
  envelope; browser/Quick Look/status/checksum/privacy bundles plus the bounded
  native no-op lifecycle bridge and evidence binder are implemented.
- `C12-VECTOR180-SOURCE-DIFF` specifies deterministic stable-ID semantic
  comparison for two complete standalone SVG atoms, including a distinct
  lexical-only result and fail-closed incomparable evidence.

C1 remains `verified`. The current destination-neutral C4-C10 2.0, C11 1.2,
and C12 1.0 successors remain `in-progress` until their new acceptance
matrices pass; this does not erase the retained verified historical evidence.
C2/C3 also remain implemented/in-progress for their declared bounded profiles.

## Dependencies

- **Python runtime:** `python-docx`.
- **Vector180 runtime:** Node.js 20+, `parse5`, `jsonc-parser`, exact `saxes@6.0.0`
  for browser-safe standalone SVG XML scanning, exact `jszip@3.10.1`, and exact
  `fontkit@2.0.4` behind the Node C8 adapter.
- **TypeScript development/test:** TypeScript, Vitest, tsx, Prettier, Node type
  definitions, `@types/fontkit`, exact `esbuild@0.28.1`, and exact
  `@playwright/test@1.62.0`.
- **Browser font fixture:** OFL ABeeZee Regular at exact SHA-256
  `2901c8df256648cc2bb2e3afb381cb8d28e65ed3dbe11de20695ae4d5ffdeda9`;
  the same verified bytes/license are the packaged Vector180 exact-font default
  and canonical scaffold face. Omitted `--font-map` is exactly `default`; no
  host-font discovery or substitution occurs.
- **OpenDocKit:** no runtime dependency. Its sibling checkout is an independent
  C7 and native-saved C9 validation oracle plus optional future
  adapter/upstream-contribution target.
- **Security vulnerabilities:** `pnpm audit --audit-level high` reported no
  known runtime or development dependency vulnerabilities on 2026-08-02; no
  automated dependency scan is configured yet.

## Quality Metrics

- `scripts/check-contract-refs.sh` — every `CONTRACT:` source reference resolves.
- `scripts/check-todos.sh` — no untracked `TODO:` comments.
- `scripts/check-freshness.sh` — truth-bearing documentation is current.
- `scripts/check-ground-truth.sh` — this file matches the workspace.
- `scripts/check-compliance.sh` — rebar version, badge, tier, and maturity agree.
- `pnpm browser:check` — exact-regenerates the browser IIFE/metadata plus the
  editor app/stylesheet, rejects Node built-ins/Fontkit/JSZip in the portable
  bundle, and checks that calibrated evidence still binds exact kernel/tool/
  font identities and derivable engine results.
- `pnpm test:browser:all` — runs the real-HTTP Chromium, Firefox, and WebKit
  conformance/calibration matrix.
- `pnpm format:check`, `pnpm typecheck`, `pnpm test`, and `pnpm build` validate
  the TypeScript implementation and both test suites; `pnpm pack:check` verifies
  the publishable CLI, exports, license, declarations, and copied schemas.

---

<!-- GROUND TRUTH VERIFICATION

When a measured artifact changes:
1. Update the fenced metric above.
2. Run scripts/check-ground-truth.sh.
3. Update the freshness date.
-->
