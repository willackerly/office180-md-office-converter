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
| `sync-office180-plugin.py --check` | Installable plugin skills, DOCX converters, and themes are exact mirrors of repository authority |
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
does not imply native Word or PowerPoint evidence. C11 1.2's separate native
bridge can prove a bounded no-op save/close/reopen lifecycle, but still does
not claim representative edits or native visual fidelity.

| Command | Purpose |
|---------|---------|
| `validate` | Validate the envelope, privacy rules, self-hash, and bound files |
| `capture-browser-svg` | Capture one trusted, validated standalone `*.vector180.svg` through pinned Playwright Chromium |
| `capture-quicklook` | Capture one trusted DOCX/PPTX macOS Quick Look preview smoke |
| `compare` | Compare two passing capture images under explicit thresholds and an optional hashed mask |
| `record-status` | Record an explicit unavailable or manual-required renderer/native gate without fabricating a capture |
| `bind-native-bridge` | Bind a passed native Office no-op save/reopen report to a passing capture without claiming representative editability |

Run a standalone SVG browser smoke into the ignored Playwright result area:

```bash
.venv/bin/python scripts/visual-evidence.py capture-browser-svg \
  examples/minimal-diagram.vector180.svg \
  --output packages/vector180/test-results/c11-smoke/minimal.png \
  --manifest packages/vector180/test-results/c11-smoke/minimal.evidence.json \
  --checkpoint standalone-browser-smoke \
  --root . --trusted \
  --width-px 1600 --height-px 900 \
  --background '#ffffff' --timeout 30

.venv/bin/python scripts/visual-evidence.py validate \
  packages/vector180/test-results/c11-smoke/minimal.evidence.json \
  --root .
```

After capturing the exact DOCX/PPTX emitted by
`native-office-bridge.py lifecycle`, bind its separately content-addressed
report into a new evidence envelope:

```bash
.venv/bin/python scripts/visual-evidence.py bind-native-bridge \
  path/to/native-save.quicklook.evidence.json \
  path/to/native-save.bridge.json \
  --manifest path/to/native-save.bound.evidence.json \
  --root .
```

Binding requires a passed, privacy-safe bridge report whose published
path/hash exactly match the capture subject and whose application matches the
DOCX or PPTX lane. The resulting native lifecycle stays `manual-required`:
the no-op open/save/reopen proves structural lifecycle behavior only.
Representative editing and human-reviewed visual fidelity remain separate
gates. The command therefore publishes the envelope and exits `2`, matching
the existing C11 `manual-required` exit convention.

The browser command accepts only a repository-contained `.vector180.svg` and a new
`.png` destination after the source passes `pnpm vector180 validate`. The internal
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

### Native Office lifecycle bridge

On macOS, run one trusted DOCX or PPTX through the bounded native bridge:

```bash
.venv/bin/python scripts/native-office-bridge.py lifecycle \
  path/to/input.docx \
  --output .office180-native-work/input.native-save.docx \
  --report .office180-native-work/input.native-save.bridge.json \
  --root . --trusted --timeout 90
```

The input, new output, new report, ignored work root, and lock must resolve
inside the repository. The bridge descriptor-binds the input before copying,
hands one unique work copy to Word or PowerPoint through non-interactive
`NSWorkspace`, and locates it only by exact case/diacritic-sensitive POSIX
path. It never activates or quits Office, targets an unrelated document,
clicks a dialog, types into UI, grants file access, or uses Save As.

Success requires a writable exact attachment, a forced-dirty ordinary Save
whose event and independent post-save probe both report saved, bounded hash/
size quiescence, a safe CRC-valid Office package, exact close and reopen
without repair, and an unchanged post-reopen hash. Every handoff, Apple event,
poll, and whole lifecycle has a deadline. An unresolved handoff preserves its
private work directory for safe user dismissal; no failure publishes a
partial Office output. The privacy-safe `office180-native-office-bridge/0.1`
report binds the exact Office bundle, short/build version, OS/architecture,
artifact hashes, bounded command digests, lifecycle facts, and actionable
diagnostics.

The checked 2026-08-02 host run passed this structural lifecycle for Word and
PowerPoint 16.111.2. See
`../manual-tests/office-native-roundtrip/NATIVE-TEST-NOTES.md` for exact facts
and non-claims.

### Checked round-trip bundles

The two checked bundles were generated under the names current when their
exact hashes were recorded. Do not relabel or rewrite the legacy PPTV bundle:

| Generator | Proven lane |
|-----------|-------------|
| `generate-docx-roundtrip-evidence.py` | canonical Markdown → DOCX → deliberate supported body edit → recovered Markdown → regenerated DOCX |
| `generate-pptv-roundtrip-evidence.mjs` | frozen standalone PPTV atom → explicit C9 composition/mapped PPTX → deliberate supported DrawingML edit → C10 patch → recovered atom → regenerated PPTX |

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
checked generated/edit/regenerated fixtures still record native Word/PowerPoint
as `manual-required`; the deterministic Python/OOXML edit simulations and
Quick Look previews never masquerade as native Office lifecycle evidence. The
new host-scoped bridge result is separately content-bound and does not rewrite
those older fixture claims.

`generate-vector180-roundtrip-evidence.mjs` is the canonical successor for new
evidence. It exercises the same bounded path with Vector180 wire IDs and the
`vector180-pptx` evidence lane, including atom-only metadata binding in the map
without copying metadata into the generated deck:

```bash
node scripts/generate-vector180-roundtrip-evidence.mjs \
  --destination tests/fixtures/roundtrip-evidence/vector180
```

Publish a durable canonical bundle only after reviewing it as new evidence
rather than renaming the checked legacy files.

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
- **Pinned Playwright Chromium** — trusted standalone Vector180 SVG browser capture
- **Python 3.9+ with exact `python-docx==1.2.0`** — install the package
  editable into `.venv`; `pnpm test` invokes the round-trip suites and
  `tests/test_python_package.py` checks installed entry points separately

The adopter-local `ci-check.sh` intentionally omits Rebar's
source-repository-only bootstrap-template drift gate. Repository-wide scans
exclude `.git`, `.venv`, `node_modules`, `dist`, vendor, and agent-worktree
state so local dependencies do not create false findings.
