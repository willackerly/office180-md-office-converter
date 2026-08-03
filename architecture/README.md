# Architecture Directory

Contracts and the registry for the DOCX and Vector180 implementations.
For the visual lane, a fully hydrated standalone Vector180 SVG atom is the
canonical default; HTML contracts apply only to an explicit deck/report
aggregation. `PPTV` remains in the stable C4–C10 Rebar contract IDs as a
historical trace token and names only the bounded legacy 0.1 read path.

See the [root README](../README.md) for how contracts fit into the overall
project.

## Quick Reference

```bash
# Find all contracts
ls architecture/CONTRACT-*.md

# Find code implementing a specific contract
rg "CONTRACT:C4-PPTV-SOURCE" packages/vector180/src

# Find what contract a source file implements
head -10 md2docx.py
head -10 packages/vector180/src/core/scan.ts

# Check every CONTRACT: reference resolves to a real file
scripts/check-contract-refs.sh
```

## What's In Here

```
architecture/
  README.md                         # this file
  CONTRACT-TEMPLATE.md              # annotated template for new contracts
  CONTRACT-REGISTRY.md              # generated contract index
  CONTRACT-C1-THEME-SCHEMA.1.1.md   # theme schema plus deterministic Word styles
  CONTRACT-C2-PROVENANCE.1.0.md     # superseded core-props-only provenance
  CONTRACT-C2-PROVENANCE.2.0.md     # embedded original/canonical merge base
  CONTRACT-C3-ROUNDTRIP.1.2.md      # canonical round trip plus native normalization
  CONTRACT-C4-PPTV-SOURCE.1.1.md    # superseded legacy PPTV exact-source model
  CONTRACT-C4-PPTV-SOURCE.2.0.md    # Vector180 source, metadata, and legacy-read boundary
  CONTRACT-C5-PPTV-PATCH.1.3.md     # superseded legacy typed patches
  CONTRACT-C5-PPTV-PATCH.2.0.md     # canonical Vector180 typed patch
  CONTRACT-C6-PPTV-RESOLVED.1.1.md  # superseded legacy resolved profiles
  CONTRACT-C6-PPTV-RESOLVED.2.0.md  # Vector180 atom/deck resolved profiles and hydration
  CONTRACT-C7-PPTX-CANARY.1.1.md    # superseded legacy PPTX canary
  CONTRACT-C7-PPTX-CANARY.2.0.md    # Vector180 deterministic primitive-only PPTX canary
  CONTRACT-C8-PPTV-TEXT-FIT.1.1.md  # superseded legacy text-fit evidence
  CONTRACT-C8-PPTV-TEXT-FIT.2.0.md  # Vector180 atom/deck exact-font evidence
  CONTRACT-C9-PPTV-PPTX-BASELINE.1.0.md # superseded legacy compiler/map
  CONTRACT-C9-PPTV-PPTX-BASELINE.2.0.md # Vector180 compiler/composition/map
  CONTRACT-C10-PPTV-PPTX-RECONCILIATION.1.2.md # superseded legacy reconciliation
  CONTRACT-C10-PPTV-PPTX-RECONCILIATION.2.0.md # Vector180 PPTX reconciliation
  CONTRACT-C11-OFFICE-VISUAL-EVIDENCE.1.1.md # superseded legacy bound-evidence harness
  CONTRACT-C11-OFFICE-VISUAL-EVIDENCE.1.2.md # dual-family visual/native evidence
  CONTRACT-C12-VECTOR180-SOURCE-DIFF.1.0.md # stable-ID semantic source comparison
```

Superseded major versions remain beside their successors for migration and
hash/evidence history. Compatible minor predecessors live in Git history; only
the latest minor file is normally retained in this directory. C11 1.1 remains
as a deliberate exception because frozen generator/native-bridge source and
checked evidence bind that exact contract ID and script bytes.

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

| Prefix | Meaning   | Example                            |
| ------ | --------- | ---------------------------------- |
| `C`    | Component | `C1-THEME-SCHEMA`, `C2-PROVENANCE` |

Every contract so far is a `C`-prefixed Component. The `S` (Service), `I`
(Interface), and `P`
(Protocol) prefixes from the broader rebar convention are reserved for
future use (e.g., if the repository grows a plugin interface — see
`ROADMAP.md` §4).

## Contract Lifecycle

Each contract **declares** its maturity honestly in a `**Status:**` header line.
The Steward separately computes implementation presence from repository
evidence; computed lifecycle does not override the declared status.

| Value           | Meaning                                                                |
| --------------- | ---------------------------------------------------------------------- |
| **stub**        | Placeholder; structure exists, content is not real                     |
| **draft**       | Real attempt, not yet reviewed/applied                                 |
| **in-progress** | Actively being built; expect churn                                     |
| **active**      | In use; defines current behavior                                       |
| **verified**    | Active + has passing tests/scenarios proving it                        |
| **superseded**  | Historical major retained for migration/evidence; not current behavior |

`scripts/check-compliance.sh` reads these `**Status:**` lines and weights
the README's rebar badge — see `conventions` in the rebar project this repo
adopted, or `scripts/check-compliance.sh` itself for the exact thresholds.

## Versioning

| Change                       | Version Bump      |
| ---------------------------- | ----------------- |
| Doc fix (no behavior change) | None              |
| New optional key/field       | Minor (1.0 → 1.1) |
| Changed schema, removed key  | Major (1.1 → 2.0) |
| New contract                 | New ID + 1.0      |

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

CONTRACT:C1-THEME-SCHEMA.1.1
CONTRACT:C2-PROVENANCE.2.0
"""
```

This creates doubly-linked traceability — searchable in either direction
with `grep`.
