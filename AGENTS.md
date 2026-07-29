# Agent Guidelines

<!-- FRESHNESS: Update this date every time you modify this file -->
<!-- freshness: 2026-07-29 -->

**How AI agents work effectively on the DOCX and PPTV tracks.**

---

## Quick Start for New Agents (Cold Start / Read Before Coding)

### Essential Reading Order (5 minutes)
1. **README.md** — what is this project?
2. **QUICKCONTEXT.md** — what's true right now? (test status, active work, "What's Next")
3. **VERIFY:** Run `git log --since='7 days' --oneline | head -20` and
   cross-reference against QUICKCONTEXT claims. Flag any discrepancies.
4. **TODO.md** — what needs doing? (open items only, scannable in 10 seconds)
5. **This file** — how do we work together?

### Project Context
- **Project type:** dual-language source-conversion toolkit: two flat Python
  DOCX CLIs plus one pnpm/TypeScript PPTV package and CLI
- **PPTV boundary:** C4/C5 verify the self-contained HTML source/read/patch
  kernel. The exact-source browser session, trusted read-only wrapper, literal
  semantic viewport, and C6 compiler-grade CSS/geometry/text resolver are
  implemented. C6 retains parity/fixture gates. The narrow C7 deterministic
  fresh-PPTX compiler and CLI are implemented and pass schema, OpenDocKit
  reopen, and native PowerPoint open/render smoke; quantitative comparison and
  PPTX save/reopen remain gates. Writable bundled controls, broader compilation,
  and reconciliation remain roadmap; use `PPTV-IMPLEMENTATION-PLAN.md` for the
  agreed delivery sequence.
- **Team size:** Solo (Will Ackerly)
- **Rebar tier:** 3 (Enforced) — contract refs, TODO tracking, freshness,
  ground truth, and compliance all enforced; see `.rebarrc` for why the
  full rebar Steward / ASK CLI is deliberately not part of this repo
- **Quality standards:** contract-first for persistent formats and operation
  protocols; `pnpm format:check`, `pnpm typecheck`, `pnpm test`, and
  `pnpm build` green before handoff

---

## Contract-Driven Development

### Core Principle
**Don't implement without a contract. Don't modify code without checking its contract.**

Seven behavioral contracts live in `architecture/CONTRACT-*.md`:

| Contract | Covers |
|----------|--------|
| `CONTRACT:C1-THEME-SCHEMA.1.0` | Theme JSON keys, deep-merge semantics, template resolution order |
| `CONTRACT:C2-PROVENANCE.1.0` | DOCX core-properties provenance stamp fields |
| `CONTRACT:C3-ROUNDTRIP.1.0` | Canonical-MD round-trip guarantee (`docx2md`'s style→construct inversion) |
| `CONTRACT:C4-PPTV-SOURCE.1.0` | Exact-source PPTV scan, manifest, identity/order, semantic read model |
| `CONTRACT:C5-PPTV-PATCH.1.0` | Hash-bound atomic PPTV semantic patch transactions |
| `CONTRACT:C6-PPTV-RESOLVED.1.0` | Fixed-canvas compiler-grade style, geometry, group, and hard-line projection |
| `CONTRACT:C7-PPTX-CANARY.1.0` | Deterministic primitive-only fresh-PPTX canary and strict OPC graph |

### The Four Contract Principles
1. **Don't implement without a contract** — new schema-level surfaces,
   persistent authority rules, or patch behaviors need a contract or a version
   bump to an existing one
2. **Don't modify code without checking its contract** — before changing
   `deep_merge()`, `stamp_provenance()`, or anything in `docx2md.py`'s
   inversion logic, read the relevant `CONTRACT-C*.md` file
3. **Don't update a contract without searching all implementations** —
   `rg "CONTRACT:C4-PPTV-SOURCE" packages schemas architecture`
4. **Contract changes that break interfaces** → write the change and migration
   in the contract history before changing implementations and fixtures

### Contract Linking

```python
"""md2docx — Markdown → styled DOCX, themed by a JSON template.

CONTRACT:C1-THEME-SCHEMA.1.0
CONTRACT:C2-PROVENANCE.1.0
"""
```

Python modules use module docstrings and TypeScript modules use leading block
comments. `scripts/check-contract-refs.sh` verifies every `CONTRACT:` reference
resolves to a real file.

---

## Agent Coordination

This repository does not run the rebar ASK CLI or persistent role-based agents
(`ask architect`, `ask product`, `ask steward`, `ask englead`) — it's a
solo-maintained project small enough that the maintainer fills those roles
directly. If you're an agent working here, act as your own architect and
reviewer: read the relevant contract before changing behavior, and check
`scripts/check-compliance.sh` / `scripts/check-ground-truth.sh` the way a
steward agent would.

For multi-agent fan-out, keep assignments read-only or give each agent
non-overlapping file ownership; see `agents/subagent-guidelines.md`.

---

## Single Source of Truth for Metrics

Every quantitative claim in documentation has ONE authoritative source:
`METRICS.md`. `scripts/check-ground-truth.sh` verifies it against the
actual repo (source, test, contract, schema, and theme counts). When one of
those artifacts changes, update `METRICS.md` and re-run the script—don't
hand-edit the count anywhere else.

---

## Testing Cascade

**Fast inner loops, one aggregate gate before committing.** There is no
deployed service. Native Office/render comparison is the manual highest tier
for every C7 compiler change.

| Tier | Name | Speed | When to Run |
|------|------|-------|-------------|
| **T0** | Format/type | seconds | `pnpm format:check` and `pnpm typecheck` |
| **T1** | Targeted | seconds | `pnpm test:ts` or `.venv/bin/python tests/test_roundtrip.py`; exercise the affected CLI |
| **T2** | Full repository | seconds | `pnpm test`, `pnpm build`, and all `scripts/check-*.sh` |
| **T3** | Office/render fidelity | manual/slow | Generated PPTX reopen, render comparison, and native PowerPoint validation |

Run `pnpm pack:check` when package metadata, exports, the CLI entry point, or
published schemas change.

**Quality enforcement (run before committing):**
```bash
scripts/check-contract-refs.sh
scripts/check-todos.sh
scripts/check-freshness.sh
scripts/check-ground-truth.sh
scripts/check-compliance.sh
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

### The Scout Rule: Zero Tolerance for Broken Tests

**You're a scout. Leave the camp cleaner than you found it.**

| Situation | Action |
|-----------|--------|
| Test fails after your change | Fix the code or fix the test |
| Test was already failing before your change | Fix it NOW — you found it, you own it |
| Skipped test | Fix the skip. Scope it properly or delete. Never leave a `skip`. |
| Obsolete test (behavior removed) | Remove carefully. Verify the behavior is actually gone. |

**Forbidden phrases:** "pre-existing failure," "not caused by our changes," or
"flaky" without a root cause. Keep both suites at zero failures and zero skips.

---

## Two-Tag System

### TODO Tracking
- **`TODO:` in code** = untracked = **blocks commit** (`scripts/check-todos.sh`)
- **`TRACKED-TASK:` in code** = tracked in `TODO.md` = commit allowed

```python
# BAD: This blocks commit
# TODO: handle escaped pipes in table cells

# GOOD: This is tracked and commit-safe
# TRACKED-TASK:TODO.md#markdown-it-py-ast-rewrite handle escaped pipes (fixed by the AST swap)
```

---

## Session Lifecycle

### Checkpoint (every few commits, or when context feels stale)
- Update `QUICKCONTEXT.md` (at minimum: timestamp + what shipped)
- Commit work-in-progress
- Re-run the affected targeted suite

### Session End
- Update `QUICKCONTEXT.md` with current state (not aspirational)
- Update `TODO.md` — check off completed items, add newly discovered items
- Clean up worktrees if any were used: `git worktree list` → `git worktree prune`
- Verify: does `QUICKCONTEXT.md` match `git log --oneline -10`?

---

## Priority and Issue Tracking Rules

### Priority Tracking
- **`QUICKCONTEXT.md` "What's Next"** = the single source of truth for priorities
- **`TODO.md`** = detailed task list with context, NOT a separate priority list
- If both files have a priority ordering, `QUICKCONTEXT.md` wins

### Issue Tracking
- **`TODO.md` "Known Issues"** = what's broken + workaround + fix tracking
- **Cross-reference, don't duplicate.** One canonical entry per issue.

---

## Project-Specific Guidelines

### Domain Knowledge
- The forward converter (`md2docx.py`) is a **regex-based line parser**,
  not a real Markdown AST — it has known limits (see `TODO.md` § Known
  Issues) that `ROADMAP.md` §0 addresses by swapping to `markdown-it-py`.
  Don't patch around individual parser bugs; they're a known class fixed
  by that rewrite.
- The round-trip contract is **style-driven inversion**, not byte-for-byte
  symmetry. The forward converter's choice of Word style (`Heading 2`,
  `List Bullet`, a shaded paragraph, a left border) is itself the
  contract; changing which style marks a construct is a breaking change
  to `CONTRACT:C3-ROUNDTRIP.1.0`, not a free-standing bug fix.
- The marking-style banner feature (a `**CUI...**`-shaped first line) is
  generic and intentionally documented with a placeholder example
  (`**CUI//TEST**` in `tests/fixtures/kitchen-sink.md`). Never introduce a
  real classification or confidentiality marking string into this repo —
  it's public.
- PPTV exact declarative source is persistent authority. Its `Map`-rich
  semantic deck is an immutable, source-hash-bound interpretation; CLI outputs
  are versioned JSON-safe projections.
- Manifest order is slide order, SVG DOM sibling order is painter order, and
  stable IDs are identity. Do not add competing array-index, z-index, browser
  node, or PowerPoint numeric-ID authorities.
- Semantic loading/editing supports self-contained `.pptv.html` only. Do not
  describe standalone SVG, external manifests, C6 parity as verified,
  geometry/rich-text edits, a writable bundled editor, general PPTX
  conversion, or native/render fidelity as implemented.
- Never execute embedded viewer/editor JavaScript to discover meaning. Treat
  comments, visible content, metadata, and runtime strings as untrusted input.

### Code Patterns
- The Python scripts remain single-file, stdlib + `python-docx`.
- PPTV portable code lives in `packages/pptv/src/core`, `ops`, and `browser`;
  filesystem/wrapper behavior belongs in `node`/CLI. Keep core and ops
  independent from OpenDocKit, browser globals, and filesystem APIs.
- Use source-range replacements for C5 edits and reload the complete candidate
  before success. Do not silently normalize or rewrite the whole source.
- Don't add a third-party dependency without updating `README.md`,
  `METRICS.md`, the lockfile, and the relevant contract dependency section.
- Theme files (`themes/*.json`) are pure data — no theme should require a
  code change to load; `test_shipped_themes_load` in
  `tests/test_roundtrip.py` enforces this generically for any new file
  dropped into `themes/`.

### Integration Points
No services, APIs, or databases. The sibling OpenDocKit checkout is already an
independent C7 reopen/parse oracle and remains a future optional adapter/upstream
collaboration target; it is not a runtime dependency.

---

## Autonomy Levels

### Current: Guided Development
- **READ** any project file to understand context
- **MODIFY** code within the seven established contracts
- **CREATE** tests, documentation, new themes, new contracts (for genuinely
  new surfaces)
- **RUN** quality checks and enforcement scripts
- **UPDATE** `QUICKCONTEXT.md`, `TODO.md`, and `METRICS.md`

### What Requires Extra Care
- **Breaking a contract's Behavioral Contracts table** — requires a
  version bump and a Change History entry, not a silent edit
- **New third-party dependency** — note it in `README.md` and `METRICS.md`
- **C4 source-coordinate, authority, identity, or security rules** — these are
  foundational and require contract/schema/fixture review
- **C5 patch vocabulary or preserve boundaries** — requires schema, atomicity,
  exact-diff, and reload tests
- **Adding OpenDocKit to core/ops** — prohibited; use a narrow optional adapter
- **Removing the marking-banner feature** — it's explicitly called out in
  `ROADMAP.md` as worth keeping; don't drop it without discussion

---

## Success Metrics

- Both test suites stay at 0 failing and 0 skipped
- `scripts/check-compliance.sh` and `scripts/check-ground-truth.sh` pass
- TypeScript format/type/build gates pass
- Documentation distinguishes verified C4/C5 behavior, in-progress C6/C7
  work, native-validation evidence, and the remaining PPTV roadmap

---

**Remember:** keep the implementation smaller than the design. Promote one
tested semantic surface at a time, preserve source authority, and resist pulling
general Office-editor complexity into the PPTV core.
