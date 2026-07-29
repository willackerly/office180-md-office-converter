# Project Metrics

<!-- FRESHNESS: Update this date every time you modify this file -->
<!-- freshness: 2026-07-29 -->

**Ground-truth metrics for the Python DOCX pair and TypeScript PPTV kernel.**

The fenced block is checked by `scripts/check-ground-truth.sh`. Update it when
source files, tests, contracts, schemas, or themes change.

## Ground Truth (machine-verified)

```text
python_source_files = 2
test_files = 1
test_functions = 7
typescript_source_files = 20
typescript_test_files = 11
typescript_test_cases = 104
contracts = 7
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
- `packages/pptv/src/` — 20 non-test TypeScript modules / 10,854 lines across
  the portable source/resolved kernel, operations, browser session, Node
  editor/compiler boundary, and CLI.
- `packages/pptv/src/__tests__/` — 11 Vitest files / 3,942 lines (excluding the
  shared helper).

## Testing Status

- **Python:** 7 passing standalone tests covering theme resolution, provenance,
  forward/reverse conversion, link demotion, and the `--no-footer` regression.
- **TypeScript:** 147 passing runtime Vitest cases from 104 direct
  `it()`/`test()` declarations (data-driven cases expand at runtime), covering
  exact UTF-8 source handling, BOM/non-BMP coordinates, non-executing security,
  strict container/manifest validation, hierarchy/order, JSON-safe projections,
  atomic preserve-mode operations, exact-source browser sessions/editor packs,
  C6 style/geometry/text resolution, C7 OPC/ZIP/OOXML mappings and failures, and
  CLI atomic writes.
- **Skipped tests:** zero.

Manual C7 evidence on the exact recorded contract hash additionally includes
ISO/ECMA/DCMI XSD validation, independent OpenDocKit reopen/parse, and native
PowerPoint 16.111.2 open plus two-page 16:9 PDF-render smoke without repair.
Native PPTX save/reopen and quantitative render comparison remain open.

The aggregate gate is:

```bash
pnpm test
```

## Contracts

- `C1-THEME-SCHEMA`, `C2-PROVENANCE`, and `C3-ROUNDTRIP` specify the DOCX
  implementation.
- `C4-PPTV-SOURCE` and `C5-PPTV-PATCH` specify the implemented PPTV 0.1
  source/read and transactional write subset.
- `C6-PPTV-RESOLVED` specifies the implemented fixed-canvas compiler-grade
  projection; parity/corpus gates remain.
- `C7-PPTX-CANARY` specifies the implemented deterministic strict-subset PPTX
  writer; expanded native fixtures, quantitative fidelity, and save/reopen
  remain.

C1 through C5 are `verified`. C6 and C7 remain `in-progress` despite their
implemented/tested surfaces because their contracts retain explicit promotion
gates.

## Dependencies

- **Python runtime:** `python-docx`.
- **PPTV runtime:** Node.js 20+, `parse5`, `jsonc-parser`, and exact
  `jszip@3.10.1`.
- **TypeScript development/test:** TypeScript, Vitest, tsx, Prettier, and Node
  type definitions.
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
