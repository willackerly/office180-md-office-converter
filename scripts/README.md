# Scripts

Enforcement scripts for the converter repository's Rebar `v3.0.0-beta` Tier 3
adoption. See the [root README](../README.md) for the project itself and
`../.rebarrc` for the tier declaration.

The reusable scripts come from the released Rebar bootstrap and retain their
`rebar-scripts:` provenance marker. Project-specific scripts preserve the
converter's Python/TypeScript exclusions and machine-verified metrics.
`inbox-watch.sh` additionally carries a clearly marked office180 safety delta
pending REBAR upstream: atomic non-symlink lock directories, duplicate-watch
refusal, convention-shaped filenames, and bounded control-sanitized previews.

## Enforcement Checks

Each script is standalone, runs in a few seconds, and exits 0 (pass) or 1 (fail).

| Script | What It Checks |
|--------|---------------|
| `check-contract-refs.sh` | Every `CONTRACT:` ref in source points to a real `architecture/CONTRACT-*.md` file |
| `check-contract-headers.sh` | Behavior-bearing source files declare a contract or architecture header |
| `check-doc-refs.sh` | Tracked Markdown does not link to an untracked local file |
| `check-todos.sh` | No untracked `TODO:` comments (two-tag system — see `AGENTS.md`) |
| `check-freshness.sh` | Doc `freshness:` markers aren't stale (>14 days) |
| `compute-registry.sh --check` | Generated contract registry matches the contract filesystem |
| `check-jtbd-presence.sh` | Contracts declare users and scenarios |
| `check-prefix-uniqueness.sh` | Contract numeric prefixes are unique |
| `check-ground-truth.sh` | `METRICS.md` matches Python/TypeScript sources, tests, contracts, schemas, and themes |
| `check-compliance.sh` | `.rebar-version`, `.rebarrc`, the README badge, and `AGENTS.md` all agree, plus contract maturity weighting |
| `steward.sh` | Contract lifecycle, implementation, testing, and enforcement health |

## Composite / Setup

| Script | When to Run |
|--------|-------------|
| `cold-start-checks.sh` | Advisory SessionStart health block used by `.claude/settings.json` |
| `ci-check.sh --strict` | Atomic Rebar contract/document/Steward gate |
| `pre-commit.sh` | Git hook — runs every enforcement script, format/type/build checks, and both test suites |
| `setup.sh` | One-time: symlinks `pre-commit.sh` as `.git/hooks/pre-commit` |
| `refresh-context.sh` | Session start / checkpoint — QUICKCONTEXT freshness + worktree state |
| `inbox-watch.sh [--preview] [inbox ...]` | Session-scoped held-inbox monitor; reports new append-only peer memos after arming. Watch only inboxes this repo holds, run it through a persistent monitor, and never wire it into CI. A live holder, unsafe lock, invalid filename, or non-regular memo fails closed |

## Visual evidence

`visual-evidence.py` creates and validates the content-bound C11 evidence
envelope. Its renderer classes stay separate: a Quick Look or browser pass
does not imply native Word or PowerPoint open/edit/save/reopen evidence.

| Command | Purpose |
|---------|---------|
| `validate` | Validate the envelope, privacy rules, self-hash, and bound files |
| `capture-browser-svg` | Capture one trusted, validated standalone `*.pptv.svg` through pinned Playwright Chromium |
| `capture-quicklook` | Capture one trusted DOCX/PPTX macOS Quick Look preview smoke |
| `compare` | Compare two passing capture images under explicit thresholds and an optional hashed mask |
| `record-status` | Record an explicit unavailable or manual-required renderer/native gate without fabricating a capture |

Run a standalone SVG browser smoke into the ignored Playwright result area:

```bash
.venv/bin/python scripts/visual-evidence.py capture-browser-svg \
  examples/minimal-diagram.pptv.svg \
  --output packages/pptv/test-results/c11-smoke/minimal.png \
  --manifest packages/pptv/test-results/c11-smoke/minimal.evidence.json \
  --checkpoint standalone-browser-smoke \
  --root . --trusted \
  --width-px 1600 --height-px 900 \
  --background '#ffffff' --timeout 30

.venv/bin/python scripts/visual-evidence.py validate \
  packages/pptv/test-results/c11-smoke/minimal.evidence.json \
  --root .
```

The browser command accepts only a repository-contained `.pptv.svg` and a new
`.png` destination after the source passes `pnpm pptv validate`. The internal
`capture-browser-svg.mjs` helper rechecks the validated hash, serves randomized
ephemeral `127.0.0.1` routes rather than `file://`, disables page JavaScript
and service workers, blocks non-capture requests, fixes DPR/locale/timezone and
records the exact Chromium profile. Do not call the helper directly to bypass
the Python trust, containment, validator, evidence, and atomic-publish checks.

The current browser profile captures one centered `contain` view at DPR 1,
uses an opaque `#RRGGBB` background, limits each dimension to 4096 pixels and
the canvas to 16,777,216 pixels, and may letterbox. It does not capture HTML
decks or PPTX files. Host fonts are uncontrolled and therefore recorded as
`fonts: []`; browser success is neither C8 exact-font proof nor native Office
fidelity.

Capture exit codes are 0 for passed, 1 for failed, 2 for manual-required, and 3
for unavailable. Run the focused harness directly or through the aggregate
Python target:

```bash
.venv/bin/python tests/test_visual_evidence.py
pnpm test:python
```

### Checked round-trip bundles

Two generators exercise the complete supported paths and publish durable C11
evidence only after structural, semantic, visual, hash, and privacy checks pass:

| Generator | Proven lane |
|-----------|-------------|
| `generate-docx-roundtrip-evidence.py` | canonical Markdown → DOCX → deliberate supported body edit → recovered Markdown → regenerated DOCX |
| `generate-pptv-roundtrip-evidence.mjs` | standalone PPTV atom → explicit C9 composition/mapped PPTX → deliberate supported DrawingML edit → C10 patch → recovered atom → regenerated PPTX |

```bash
.venv/bin/python scripts/generate-docx-roundtrip-evidence.py \
  --destination tests/fixtures/roundtrip-evidence/docx

node scripts/generate-pptv-roundtrip-evidence.mjs \
  --destination tests/fixtures/roundtrip-evidence/pptv
```

Both commands refuse an existing destination, build in a private sibling
staging directory, validate every evidence envelope and bound artifact, scan
durable package members for workstation/private data, write a complete
`SHA256SUMS`, and rename the completed bundle into place only at the end. The
checked fixtures record native Word/PowerPoint as `manual-required`; the
deterministic Python/OOXML edit simulations and Quick Look previews never
masquerade as native Office lifecycle evidence.

## Installation

```bash
scripts/setup.sh   # symlinks the pre-commit hook, chmods scripts/*.sh
```

## Running Everything

Run the full adopter and product suite:

```bash
scripts/ci-check.sh --strict
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm pack:check
```

## Dependencies

- **bash** — all scripts are Bash 3.2 compatible
- **jq, grep, find, date, git** — Steward and enforcement dependencies
- **Node.js 20+ and pnpm** — TypeScript checks and aggregate test command
- **Pinned Playwright Chromium** — trusted standalone PPTV SVG browser capture
- **`.venv/bin/python` with `python-docx`** — Python round-trip tests invoked by
  `pnpm test`

The adopter-local `ci-check.sh` intentionally omits Rebar's
source-repository-only bootstrap-template drift gate. Repository-wide scans
exclude `.git`, `.venv`, `node_modules`, `dist`, vendor, and agent-worktree
state so local dependencies do not create false findings.
