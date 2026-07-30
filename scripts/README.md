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
- **`.venv/bin/python` with `python-docx`** — Python round-trip tests invoked by
  `pnpm test`

The adopter-local `ci-check.sh` intentionally omits Rebar's
source-repository-only bootstrap-template drift gate. Repository-wide scans
exclude `.git`, `.venv`, `node_modules`, `dist`, vendor, and agent-worktree
state so local dependencies do not create false findings.
