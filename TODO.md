# TODO

<!-- FRESHNESS: Update this date every time you modify this file -->
<!-- freshness: 2026-07-29 -->
<!-- last-synced: 2026-07-29 — verified against the current workspace -->

Active tasks only. Priority ordering lives in `QUICKCONTEXT.md`.

## PPTV next slice

- [x] Promote `PPTV-IMPLEMENTATION-PLAN.md` section 2 into C6 and normalize the
  minimal fixture: exact `0 0 1600 900`/16:9 mapping, explicit text-frame/line
  syntax, primitive/group/asset bounds, CSS authority, and capability errors.
- [ ] Add C6 kitchen-sink and invalid-profile fixture corpora plus normalized
  Node/browser JSON parity locks.
- [x] Build the pure resolved model: discriminated finite geometry, translated
  native-group world bounds, explicit hard-line text, concrete font resolution,
  complete theme-token maps, constrained base CSS, and source provenance.
- [x] Add pure C8 text-fit preflight with anchor-aware capacity, immutable
  per-line evidence, clear/near/overflow/unverified states, and no source
  mutation.
- [x] Add the exact-font Node adapter and `text-fit` CLI with a strict explicit
  font map, byte/PostScript identity, shaping, missing-glyph reporting, and
  fail-closed exit behavior.
- [ ] Lock the worked TDFLite deck as a C8 regression, add environment-labeled
  browser/editor measurement and overlays, and calibrate representative lines
  against native PowerPoint. Never turn this into wrapping or automatic repair.
- [ ] Remove first-declaration entries for duplicate object IDs from the raw C4
  index; public queries suppress ambiguous IDs and C6/C7 reject ambiguous
  decks, so this is internal representation cleanup rather than a compiler
  safety gap.
- [x] Generate a deterministic trusted `.editable.pptv.html` wrapper around
  inert exact canonical bytes/hash with strict CSP, slide rail, object tree,
  diagnostics, selection, integrity verification, and clean-source download.
- [x] Add a browser-safe session that wires direct text, theme, and slide-order
  C5 operations into bounded, exact-source hash-checked undo/redo.
- [x] Reconstruct the trusted wrapper viewport from literal C6 data without
  source DOM cloning, CSSOM, or source-runtime execution.
- [ ] Bundle writable editor controls into the wrapper, then add stale-safe
  user-granted file save.
- [x] Build the first deterministic fresh-PPTX canary with native
  rectangles/ellipses/connectors/translated groups/one-line text, exact
  stable-ID metadata, strict OPC graph validation, and atomic CLI output.
- [x] Validate the minimal canary artifact against applicable ISO/ECMA XSDs,
  reopen/parse it through OpenDocKit, and native-open/render it in PowerPoint
  16.111.2 without repair or hard-line reflow.
- [ ] Add quantitative SVG/PDF render comparison and native PPTX save/reopen.
  PowerPoint 16.111.2 AppleScript Save As currently returns a zero-byte file for
  both the canary and a known-good control; future evidence must require
  non-empty output, `unzip -t`, and reopen.
- [ ] Expand the native fixture across ellipse, translated/nested groups, all
  connector flip quadrants, near-edge/space-sensitive text, and schema-range
  boundaries before promoting C7 from `in-progress`.
- [ ] Add typed `set-text-lines`, `set-object-geometry`,
  `set-connector-endpoints`, `set-child-order`, and native-group-translate
  transactions; do not add a generic attribute writer.
- [ ] Extend the same canary with atomic SVG assets as the matching editor
  operation and static resource-table contract land. Native connectors,
  translated groups, and explicit lines are already covered.
- [ ] Split `@office180/pptv-pptx` only when the real OOXML dependency boundary
  exists; keep the source/browser core independent.
- [ ] Add standalone `.pptv.svg`, library/`use`, and external-manifest dependency
  resolution only after capability, cycle, root, and hash contracts exist.
- [ ] Define canonical serialization independently from preserve-mode patching.
- [ ] Extend the implemented source-byte, element/depth, and manifest-complexity
  ceilings with patch-operation, future asset, and decompressed-package limits.
- [ ] Add sandboxed/CSP untrusted intake after the trusted generated editor
  lifecycle is proven; validation cannot protect code already executed by
  direct-open.

## OpenDocKit joint work

- [ ] Execute OpenDocKit's editing rigor gate; fix per-run formatting
  reconstitution, bulk typing-style propagation, and real DOM/save/reload tests.
- [ ] Extract a small stable OpenDocKit font-metrics surface that exposes the
  chosen face/style, missing codepoints, substitution class, kerned/un-kerned
  width bounds, and bundle identity for a conservative optional C8 adapter.
- [ ] Extract public SVG interaction primitives with host-owned semantic
  operation callbacks; do not make OpenDocKit's flat element model canonical.
- [ ] Add or co-design a valid fresh `PptxPackageBuilder`; fix synthesis
  namespace/schema issues and validate with an independent Office oracle.
- [ ] Preserve `p:cNvPr` ID/name in OpenDocKit `GroupIR` and `ConnectorIR`;
  its current group parser drops the stable native identity that C7 emits and
  PPTV live editing/reconciliation needs.
- [ ] Resolve the `@opendockit/pptx` → `pdf-signer` mandatory dependency and
  conflicting license metadata before distributing that dependency.
- [ ] Consider upstreaming C5's hash/precondition transaction envelope and
  shared PPTV/PPTX conformance fixtures.

## DOCX roadmap

- [ ] Package as `pyproject.toml` with `pipx` entry points — `ROADMAP.md` §0/§8.
- [ ] Replace the regex line parser with `markdown-it-py` — `ROADMAP.md` §0.
- [ ] Emit real `w:hyperlink` runs — `ROADMAP.md` §5.1.
- [ ] Add nested lists and real Word numbering — `ROADMAP.md` §5.2.
- [ ] Add PNG/JPG images — `ROADMAP.md` §3.
- [ ] Implement the wide-table strategy — `ROADMAP.md` §2.
- [ ] Add structured warnings and `--strict` — `ROADMAP.md` §6.

## Known limitations

- PPTV semantic loading currently supports only self-contained `.pptv.html`.
  Standalone SVG and external manifests are recognition/inventory-only.
- Strict 0.1 resource references are same-document fragments only. Relative,
  absolute, remote, and embedded-data fetches require a future dependency
  resolver and hash/capability contract.
- PPTV preserve mode supports only direct text, an existing active-theme value,
  and slide-order permutations. Rich text, CSS, and structural edits fail
  explicitly.
- Group hierarchy/order, translated world bounds, explicit text frames, and
  opaque SVG asset bounds resolve today. The strict C7 subset emits native
  groups/connectors and passes schema, independent reopen, and PowerPoint
  open/render smoke validation. Hit-testing, typed geometry edits, raster
  resources, quantitative fidelity, and PPTX save/reopen remain open.
- C8 exact-font shaped advance catches horizontal hard-line overrun without
  changing source. Browser/native parity, vertical fit, font embedding, system
  discovery, silent substitution, and automatic repair remain out.
- The minimal fixture has one base/component style block plus complete
  token-only themes. Theme token editing remains a typed-operation follow-up.
- `docx2md.py` does not reject pending tracked changes (`ROADMAP.md` §7.5).
- Relative link targets are intentionally not recoverable in the current DOCX
  round trip (C3 Scenario 2).
- The Python regex parser still mis-handles nested emphasis, escaped table
  pipes, complex code spans, multi-paragraph lists, indented code, setext
  headings, and hard breaks. The AST rewrite is the fix.

## Code debt

No `TRACKED-TASK:` comments are currently present. `scripts/check-todos.sh`
scans both Python and TypeScript and rejects untracked `TODO:` comments.

<details>
<summary><strong>Recently completed</strong></summary>

- [x] Repo-scoped `$pptv-authoring` skill with strict authoring/text-fit
  references, canonical starter parity lock, and end-to-end gate helper —
  2026-07-29
- [x] C8 pure anchor-aware text-fit preflight, exact-font Fontkit adapter, font
  map, CLI, and worked TDFLite audit — 2026-07-29
- [x] Deterministic C7 fresh-PPTX canary, strict OPC/ZIP validator, atomic Node
  API/CLI, ISO/ECMA XSD validation, OpenDocKit reopen, and native PowerPoint
  open/render smoke — 2026-07-29
- [x] C6 fixed-canvas resolved model plus trusted strict-CSP editor pack,
  literal-data viewport, and exact-source editor session — 2026-07-29
- [x] PPTV C4 source/read contract, C5 patch contract, and two JSON Schemas —
  2026-07-28
- [x] `@office180/pptv` exact-source scanner, manifest/deck model, projections,
  atomic patch engine, Node IO, CLI, and Vitest suite — 2026-07-28
- [x] Verified related OpenDocKit checkout current and completed reuse/upstream
  assessment — 2026-07-28
- [x] DOCX forward/reverse converters, three themes, C1–C3, seven round-trip
  tests, and Rebar Tier 3 enforcement — 2026-07-08

</details>
