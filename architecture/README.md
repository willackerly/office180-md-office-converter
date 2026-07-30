# Architecture Directory

Contracts and the registry for the DOCX and PPTV implementations.

See the [root README](../README.md) for how contracts fit into the overall
project.

## Quick Reference

```bash
# Find all contracts
ls architecture/CONTRACT-*.md

# Find code implementing a specific contract
rg "CONTRACT:C4-PPTV-SOURCE" packages/pptv/src

# Find what contract a source file implements
head -10 md2docx.py
head -10 packages/pptv/src/core/scan.ts

# Check every CONTRACT: reference resolves to a real file
scripts/check-contract-refs.sh
```

## What's In Here

```
architecture/
  README.md                         # this file
  CONTRACT-TEMPLATE.md              # annotated template for new contracts
  CONTRACT-REGISTRY.md              # generated contract index
  CONTRACT-C1-THEME-SCHEMA.1.0.md   # theme JSON keys, deep-merge, resolution order
  CONTRACT-C2-PROVENANCE.1.0.md     # DOCX core-props provenance stamp
  CONTRACT-C3-ROUNDTRIP.1.0.md      # canonical-MD round-trip guarantees
  CONTRACT-C4-PPTV-SOURCE.1.1.md    # PPTV deck/diagram exact-source read models
  CONTRACT-C5-PPTV-PATCH.1.1.md     # PPTV deck/diagram atomic patch protocol
  CONTRACT-C6-PPTV-RESOLVED.1.1.md  # PPTV deck/diagram resolved profiles
  CONTRACT-C7-PPTX-CANARY.1.1.md    # deterministic primitive-only PPTX canary
  CONTRACT-C8-PPTV-TEXT-FIT.1.1.md  # deck/diagram exact-font text-fit evidence
```

`CONTRACT-REGISTRY.md` is generated from the contract filesystem:

```bash
scripts/compute-registry.sh
scripts/compute-registry.sh --check
```

Do not edit it by hand. `scripts/steward.sh` combines contract completeness,
implementation/test links, discoveries, and the Tier 3 enforcement results.

## Naming Convention

```
CONTRACT-{ID}-{NAME}.{MAJOR}.{MINOR}.md
```

| Prefix | Meaning | Example |
|--------|---------|---------|
| `C` | Component | `C1-THEME-SCHEMA`, `C2-PROVENANCE` |

Every contract so far is a `C`-prefixed Component. The `S` (Service), `I`
(Interface), and `P`
(Protocol) prefixes from the broader rebar convention are reserved for
future use (e.g., if the repository grows a plugin interface — see
`ROADMAP.md` §4).

## Contract Lifecycle

Each contract **declares** its maturity honestly in a `**Status:**` header line.
The Steward separately computes implementation presence from repository
evidence; computed lifecycle does not override the declared status.

| Value | Meaning |
|-------|---------|
| **stub** | Placeholder; structure exists, content is not real |
| **draft** | Real attempt, not yet reviewed/applied |
| **in-progress** | Actively being built; expect churn |
| **active** | In use; defines current behavior |
| **verified** | Active + has passing tests/scenarios proving it |

`scripts/check-compliance.sh` reads these `**Status:**` lines and weights
the README's rebar badge — see `conventions` in the rebar project this repo
adopted, or `scripts/check-compliance.sh` itself for the exact thresholds.

## Versioning

| Change | Version Bump |
|--------|-------------|
| Doc fix (no behavior change) | None |
| New optional key/field | Minor (1.0 → 1.1) |
| Changed schema, removed key | Major (1.1 → 2.0) |
| New contract | New ID + 1.0 |

When bumping minor within one compatible major:
1. Rename the current file to the new minor version; Git retains the old text.
2. Add `SUPERSEDES`, a retirement/migration section, and a Change History row.
3. Update all `CONTRACT:` implementation references in the same delivery.
4. Preserve every existing behavior unless the change is reclassified as major.

When bumping major:
1. Create the new version file.
2. Mark old: `<!-- SUPERSEDED BY: CONTRACT-{ID}.{NEW} -->` and set its
   `**Status:**` to `superseded`.
3. `grep -rn "CONTRACT:{ID}.{OLD}"` → update all code.
4. Keep the old version file for history.

## Code-to-Contract Linking

Behavior-bearing source modules declare applicable contracts in a header
comment:

```python
"""md2docx — Markdown → styled DOCX, themed by a JSON template.

CONTRACT:C1-THEME-SCHEMA.1.0
CONTRACT:C2-PROVENANCE.1.0
"""
```

This creates doubly-linked traceability — searchable in either direction
with `grep`.
