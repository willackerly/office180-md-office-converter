# Project Metrics

<!-- FRESHNESS: Update this date every time you modify this file -->
<!-- freshness: 2026-07-30 -->

**Ground-truth metrics for the Python DOCX pair and TypeScript PPTV kernel.**

The fenced block is checked by `scripts/check-ground-truth.sh`. Update it when
source files, tests, contracts, schemas, or themes change.

## Ground Truth (machine-verified)

```text
python_source_files = 2
test_files = 1
test_functions = 7
typescript_source_files = 22
typescript_test_files = 14
typescript_test_cases = 121
contracts = 8
published_schemas = 2
shipped_themes = 3
```

| Metric | Meaning | Computed as |
|---|---|---|
| `python_source_files` | Root Python converter files | root `*.py` |
| `test_files` | Python `test_*.py` files | `tests/test_*.py` |
| `test_functions` | Standalone Python test functions | `def test_*` in `tests/test_roundtrip.py` |
| `typescript_source_files` | Portable core, ops, Node IO, and CLI modules | non-test `*.ts` under `packages/pptv/src` |
| `typescript_test_files` | Vitest files | `packages/pptv/src/__tests__/*.test.ts` |
| `typescript_test_cases` | Vitest `it()`/`test()` cases | test declarations in those files |
| `contracts` | Versioned component contracts | non-template `architecture/CONTRACT-C*.md` |
| `published_schemas` | PPTV JSON Schemas | `schemas/*.json` |
| `shipped_themes` | DOCX theme JSON files | `themes/*.json` |

## Codebase Size (informational)

- `md2docx.py` — 404 lines.
- `docx2md.py` — 267 lines.
- `tests/test_roundtrip.py` — 278 lines.
- `packages/pptv/src/` — 22 non-test TypeScript modules / 12,032 lines across
  the portable source/resolved/text-fit kernel, operations, browser session,
  Node editor/font/compiler boundary, and CLI.
- `packages/pptv/src/__tests__/` — 14 Vitest files / 4,996 lines (excluding the
  shared helper).

## Testing Status

- **Python:** 7 passing standalone tests covering theme resolution, provenance,
  forward/reverse conversion, link demotion, and the `--no-footer` regression.
- **TypeScript:** 169 passing runtime Vitest cases from 121 direct
  `it()`/`test()` declarations (data-driven cases expand at runtime), covering
  exact UTF-8 source handling, BOM/non-BMP coordinates, non-executing security,
  strict container/manifest validation, hierarchy/order, JSON-safe projections,
  atomic preserve-mode operations, exact-source browser sessions/editor packs,
  C6 style/geometry/text resolution, C7 OPC/ZIP/OOXML mappings and failures, C8
  anchor/measurement/font-map/CLI behavior, and CLI atomic writes.
- **Repo-scoped authoring skill:** structural validation passes; its bundled
  starter is locked byte-for-byte to the canonical minimal deck by Vitest.
- **Browser conformance:** the checked ES2022 IIFE is 655,826 bytes with
  SHA-256
  `57a62807006837c8e59d73f69e93f072ae94e8f67cfd8ab587e3fc35e6036533`.
  Four real-HTTP C4/C6/C8 tests pass in each captured Chromium, Firefox, and
  WebKit project (12 of 12), including normalized Node/browser equality for
  the minimal deck, arbitrary-viewBox standalone kitchen sink, and invalid
  profile.
- **Writable trusted editor:** its current generated IIFE is 666,636 bytes with
  SHA-256
  `91caa37d88a5b90f9c15497437df33a121cfcabcd60c7827d31067d539529c3b`;
  `editor:check` exact-regenerates the app and stylesheet before accepting
  them.
- **Repository enforcement:** Rebar `v3.0.0-beta` Tier 3 reports 14/14 adopter
  gates passing; the generated Steward sees all eight contracts with
  implementation and test files and zero discoveries.
- **Skipped tests:** zero.

Manual C7 1.1 evidence on the exact artifact hash recorded in its contract
additionally includes ISO/ECMA/DCMI XSD validation, independent OpenDocKit
reopen/parse, and native PowerPoint 16.111.2 open plus two-page 16:9 PDF-render
smoke without repair. Native PPTX save/reopen and quantitative render comparison
remain open.

The checked C8 worked-deck regression inventory at
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
- `C4-PPTV-SOURCE` and `C5-PPTV-PATCH` specify the implemented PPTV 0.1
  source/read and transactional write subset.
- `C6-PPTV-RESOLVED` specifies the verified browser-independent deck/diagram
  projection; its Node/browser parity and standalone corpus gates are closed,
  while downstream C7/native fidelity remains outside C6.
- `C7-PPTX-CANARY` specifies the implemented deterministic strict-subset PPTX
  writer; expanded native fixtures, quantitative fidelity, and save/reopen
  remain.
- `C8-PPTV-TEXT-FIT` specifies the implemented pure non-mutating preflight plus
  exact-font Node and browser adapters; worked-deck locking and explicit
  three-engine browser calibration are closed, while native PowerPoint text
  calibration remains.

C1 through C6 are `verified`. C7 and C8 remain `in-progress` because their
contracts retain native fidelity promotion gates.

## Dependencies

- **Python runtime:** `python-docx`.
- **PPTV runtime:** Node.js 20+, `parse5`, `jsonc-parser`, exact `saxes@6.0.0`
  for browser-safe standalone SVG XML scanning, exact `jszip@3.10.1`, and exact
  `fontkit@2.0.4` behind the Node C8 adapter.
- **TypeScript development/test:** TypeScript, Vitest, tsx, Prettier, Node type
  definitions, `@types/fontkit`, exact `esbuild@0.28.1`, and exact
  `@playwright/test@1.62.0`.
- **Browser font fixture:** OFL ABeeZee Regular at exact SHA-256
  `2901c8df256648cc2bb2e3afb381cb8d28e65ed3dbe11de20695ae4d5ffdeda9`;
  it is test/calibration data, not a runtime or source-font default.
- **OpenDocKit:** no runtime dependency. Its sibling checkout is an independent
  C7 validation oracle plus optional future adapter/upstream-contribution target.
- **Security vulnerabilities:** `pnpm audit` reported no known runtime or
  development dependency vulnerabilities on 2026-07-29; no
  automated dependency scan is configured yet.

## Quality Metrics

- `scripts/check-contract-refs.sh` — every `CONTRACT:` source reference resolves.
- `scripts/check-todos.sh` — no untracked `TODO:` comments.
- `scripts/check-freshness.sh` — truth-bearing documentation is current.
- `scripts/check-ground-truth.sh` — this file matches the workspace.
- `scripts/check-compliance.sh` — rebar version, badge, tier, and maturity agree.
- `pnpm browser:check` — exact-regenerates the browser IIFE/metadata plus the
  editor app/stylesheet and rejects stale bytes, Node built-ins, Fontkit, or
  JSZip in the portable bundle.
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
