# Editor and PowerPoint round trip

Use this reference only for trusted editor packs, atom/deck PPTX compilation,
mapped PowerPoint reconciliation, or the native Office lifecycle bridge.

## Hydrate one deck slide

Do not copy a slide template from HTML; it may depend on deck CSS and theme
authority.

```bash
pnpm vector180 extract report.vector180.html \
  --slide architecture \
  --output architecture.vector180.svg --format json
pnpm vector180 validate architecture.vector180.svg --format json
pnpm vector180 resolve architecture.vector180.svg --format json
```

Extraction localizes supported style, preserves stable IDs, hierarchy, painter
order, geometry, and hard lines, replaces immediate hydration provenance, and
reloads the result as an independent atom. It refuses invalid/unresolved input
and an existing destination.

## Use the writable trusted editor

```bash
pnpm vector180 editor-pack architecture.vector180.svg \
  --output architecture.editable.html \
  --font-map default
```

The pack embeds exact source bytes and SHA-256 under strict CSP, reconstructs
from resolved data, commits edits through the hash-bound session, and exports
clean current source rather than browser DOM. A hash mismatch makes it
read-only. File-handle saves require explicit user authorization and stale-disk
checks.

The broader typed patch surface may exceed current browser controls. Do not
approximate missing geometry, connector, group, style, insertion, or deletion
controls.

## Compile one atom

The compiler never guesses placement, stretches, crops, or letterboxes:

```bash
pnpm vector180 compile architecture.vector180.svg \
  --placement 40,50,1200,800 --policy identity \
  --output architecture.pptx \
  --map architecture.vector180.map.json --format json
```

Use `identity` only when the target extent equals the atom viewBox extent. Use
`uniform-scale-translate` only for an exactly matching aspect ratio.

Run `compose` separately only when a generated one-slide HTML aggregation is
requested for inspection, report assembly, or debugging:

```bash
pnpm vector180 compose architecture.vector180.svg \
  --placement 40,50,1200,800 --policy identity \
  --output architecture.composed.vector180.html --format json
```

Keep the atom authoritative.

## Reconcile a supported PowerPoint edit

```bash
pnpm vector180 reconcile architecture.edited.pptx \
  --source architecture.vector180.svg \
  --baseline architecture.vector180.map.json \
  --native-baseline architecture.native-save.pptx \
  --patch architecture.recovered.vector180.patch.json \
  --report architecture.reconcile.json --format json
pnpm vector180 patch architecture.vector180.svg \
  architecture.recovered.vector180.patch.json --check
pnpm vector180 patch architecture.vector180.svg \
  architecture.recovered.vector180.patch.json \
  --output architecture.recovered.vector180.svg
```

Reconciliation authenticates exact source, map, package topology, stable shape
names, and the supported delta. It is not arbitrary PPTX import. Use
`--native-baseline` only for the exact no-op native save immediately preceding
the edit.

Duplicate identities refuse by default. For one copied mapped straight
connector, inspect the persistent refusal and continue only when the report
proves exactly one of two occurrences remains baseline-equivalent. A strict
review document must bind current hashes/fingerprints, parent/order,
endpoints/style, a reviewer-chosen fresh stable ID, and explicit existing
from/to IDs. Never manufacture a resolution to make reconciliation pass.

Apply any proposal to a new atom, compile with the same placement, and compare
edited versus regenerated renderings before claiming visual fidelity.

## Native lifecycle evidence

For trusted source on macOS:

```bash
.venv/bin/python scripts/native-office-bridge.py lifecycle \
  architecture.pptx \
  --output .office180-native-work/architecture.native-save.pptx \
  --report .office180-native-work/architecture.native-save.bridge.json \
  --root . --trusted --timeout 90
```

The bridge targets one exact work-copy path, never grants file access or clicks
dialogs, and proves a bounded no-op save/close/reopen package lifecycle. It
does not prove representative editing, native text calibration, cross-renderer
fidelity, or human visual acceptance.
