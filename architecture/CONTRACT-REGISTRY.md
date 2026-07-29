# Contract Registry

This is a solo-maintained source-conversion repository (no rebar Steward, no
`compute-registry.sh` — see `architecture/README.md`), so this registry is
hand-maintained. `scripts/check-contract-refs.sh` is the enforcement
mechanism that keeps every `CONTRACT:` reference in source honest against
the files listed here.

**To verify it's current:**
```bash
scripts/check-contract-refs.sh
```

---

## Components

| ID | Version | Status | Impl Files | Purpose |
|----|---------|--------|------------|---------|
| C1-THEME-SCHEMA | 1.0 | verified | 4 | Theme JSON schema, deep-merge semantics, template resolution order |
| C2-PROVENANCE | 1.0 | verified | 2 | DOCX core-properties round-trip provenance stamp |
| C3-ROUNDTRIP | 1.0 | verified | 4 | Canonical-MD round-trip guarantee (docx2md's style→construct inversion) |
| C4-PPTV-SOURCE | 1.0 | verified | 5 | Exact-source PPTV scan, manifest, semantic hierarchy, identity, and order |
| C5-PPTV-PATCH | 1.0 | verified | 2 | Hash-bound atomic semantic patch transactions |
| C6-PPTV-RESOLVED | 1.0 | in-progress | 3 | Pure compiler-grade geometry, text, style, font, and asset projection |
| C7-PPTX-CANARY | 1.0 | in-progress | 4 | Deterministic primitive-only fresh-PPTX compiler canary |

`Impl Files` counts the artifacts explicitly listed under each contract's
`Implementing Files` section; it is not a count of transitive consumers carrying
a `CONTRACT:` header.

## Contract Files

- `CONTRACT-C1-THEME-SCHEMA.1.0.md`
- `CONTRACT-C2-PROVENANCE.1.0.md`
- `CONTRACT-C3-ROUNDTRIP.1.0.md`
- `CONTRACT-C4-PPTV-SOURCE.1.0.md`
- `CONTRACT-C5-PPTV-PATCH.1.0.md`
- `CONTRACT-C6-PPTV-RESOLVED.1.0.md`
- `CONTRACT-C7-PPTX-CANARY.1.0.md`

## Owners

All seven contracts: Will Ackerly (sole maintainer).

## Known Consumers

Single-repo project — no declared external (cross-repo) consumers yet. If a
surface is vendored or imported by another project, that project should add a
`CONSUMES.md` declaring which contract version it pins to (see
`CONSUMES.md` in this repo for the format).

## Quick Audit (manual — no `compute-registry.sh` in this repo)

```bash
# Contracts with no implementing code (orphaned contracts)
for f in architecture/CONTRACT-C*.md; do
  id=$(basename "$f" .md | sed 's/CONTRACT-//')
  count=$(grep -rl "CONTRACT:$id" -- *.py packages/pptv/src 2>/dev/null | wc -l)
  [ "$count" -eq 0 ] && echo "ORPHAN: $f (0 implementing files)"
done

# Code with contract refs pointing to non-existent contracts
scripts/check-contract-refs.sh
```
