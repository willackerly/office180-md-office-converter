# CONTRACT-C4-PPTV-SOURCE.1.0

**Version:** 1.0
**Status:** verified
**Owner:** Will Ackerly
**Type:** Data Model
**Cross-repo Promotability:** Yes — a future optional OpenDocKit adapter may consume PPTV projections without becoming a core dependency
**Source:** `PPTV-DESIGN-INDEX.md`, `PPTV-PROFILE.md`, `PPTV-HTML-CONTAINER.md`, and `PPTV-PROCESSING-API.md`

## Why this exists

PPTV needs one executable definition of where presentation meaning lives before
the CLI, browser viewer, editor, or PowerPoint translator can agree. This
contract fixes the source forms, authority rules, offsets, identities, and
minimum read-path behavior that prose proposals previously left open.

## Who needs this

- **PPTV CLI and agents** — cheap, deterministic outline, text, object, and diagnostic views
- **Native PPTV editor** — a hierarchical source model with stable identities and safe source ranges
- **PPTX adapter** — deterministic slide/object order and explicit native-versus-asset intent
- **OpenDocKit adapters** — a narrow, format-specific input that does not make Office IR canonical

## Scenarios

### Scenario 1 — inspect a deck without executing it

A caller scans a `.pptv.html` file and reads its leading manifest, physical
section inventory, and ordered slide outline. Embedded runtime JavaScript is
returned only as an indexed opaque section and is never evaluated.

### Scenario 2 — reject ambiguous identity

Two slide objects declare the same stable SVG `id`. Validation returns
`PPTV-ID-DUPLICATE`; neither an object query nor a later patch resolves the
collision by first- or last-write-wins.

### Scenario 3 — preserve semantic order across physical layout

Slide templates appear in a different physical order from the manifest. The
deck projection follows the manifest while each SVG group's child sequence
follows DOM order; neither introduces a numeric z-index.

## Interfaces

```ts
type PptvInput =
  | { kind: 'text'; text: string; name?: string }
  | { kind: 'bytes'; bytes: Uint8Array; name?: string };

function scanPptvSource(
  input: PptvInput,
  options?: ScanOptions
): Promise<PptvScan>;

function parseManifest(scan: PptvScan): ManifestParseResult;
function loadDeck(input: PptvInput, options?: LoadDeckOptions): Promise<PptvDeck>;
function validateDeck(deck: PptvDeck): Diagnostic[];
```

`PptvScan` explicitly retains an immutable `PptvSourceDocument` containing the
decoded source. This resolves the proposal's impossible
`parseManifest(scan)` signature, whose documented scan type did not retain the
manifest bytes or text.

## Behavioral Contracts

| Behavior | Specification |
|----------|---------------|
| Source forms | Recognize `.pptv.html`, `.pptv.svg`, and `.pptv-manifest.json` from content with filename used only as a compatible hint. |
| Encoding | Byte input is strict UTF-8 and text input rejects unpaired UTF-16 surrogates. A leading UTF-8 BOM is retained as U+FEFF in text, included in hashing, and preserved by edits; malformed input is fatal. |
| Character offsets | `charStart` and `charEnd` are zero-based, half-open JavaScript UTF-16 code-unit offsets into the exact retained source string. |
| Byte offsets | `byteStart` and `byteEnd` are zero-based, half-open offsets into the exact retained UTF-8 bytes. |
| Lines and columns | Line and column values are one-based and refer to the decoded, non-normalized source. Newline spelling is preserved. |
| Executable content | Implemented scanning, validation, and semantic loading never execute source scripts or fetch dependencies. Strict HTML accepts only inline data/base-style/theme blocks and a content-digest-verified fixed viewer runtime. Future compilers must preserve this invariant. |
| Browser direct-open | Non-executing validation does not make browser direct-open safe: opening an untrusted HTML source executes its embedded script before validation. Direct-open is trusted-source-only; untrusted source requires validation plus a sandbox/CSP rendering boundary. |
| HTML authority | The manifest defines slide order; physical template order does not. Strict HTML requires explicit `html`/`head`/`body`, allowlisted container/control-block attributes, an inert head, exactly one manifest, an empty inert `main`/`div` output mount, exactly one inert `<script type="text/css" data-pptv-style="base">`, and one recognized viewer runtime. Canonical body order is manifest, output mount, slides, libraries, base style, themes, runtime. |
| SVG authority | Stable SVG `id` is canonical object identity and DOM sibling order is canonical painter/z-order. |
| Object boundaries | Annotated native objects require a supported role and export mode. Children below `svg`, `raster`, or `ignore` boundaries are opaque. |
| Duplicate identity | Duplicate slide, theme, library, base-style, or object IDs are errors. Ambiguous slide/theme/library declarations are omitted from their lookup indexes. Public object query APIs suppress IDs named by duplicate diagnostics instead of resolving first- or last-write-wins; the raw source index is not an ambiguity-safe query API. |
| Cheap reads | Scan and manifest operations inventory but do not resolve base/theme CSS, expand SVG definitions, load assets, or semantically parse slides. The scanner does inspect the fixed viewer-runtime bytes to verify its registered digest; JSON-safe projections omit runtime source and unrelated CSS. |
| Source intent | Semantic nodes retain their original attributes, classes, hierarchy, export intent, and safe replacement ranges. |
| Unsupported constructs | Unsupported native SVG and forbidden executable behavior produce diagnostics; there is no implicit native-to-raster fallback. |
| Initial conformance scope | Contract 1.0 governs PPTV source format `0.1` and semantically loads one self-contained `.pptv.html` resource. Standalone SVG and external-manifest inputs are recognized and inventoried only until later contract revisions add their load/dependency rules. |
| Snapshot versus output | The Map-rich deck/index is an immutable, hash-bound in-process snapshot. Versioned CLI/MCP projections use JSON-safe arrays and records. |

## Error Contracts

| Error | When | Code |
|-------|------|------|
| Unsupported or ambiguous source | Content is not a recognized PPTV source form | `PPTV-SCAN-UNRECOGNIZED` |
| Source too large | UTF-8 input exceeds the configured byte ceiling | `PPTV-SCAN-SOURCE-LIMIT` |
| Structure too large | Parsed element count or nesting depth exceeds configured limits | `PPTV-SCAN-STRUCTURE-LIMIT` |
| Invalid UTF-8 | Byte input cannot be decoded losslessly | `PPTV-SCAN-INVALID-UTF8` |
| Invalid physical order | Strict HTML sections violate the contract order | `PPTV-SCAN-PHYSICAL-ORDER` |
| Competing container content | HTML/head/body, top-level text, or the output mount contains behavior or visible source outside canonical sections | `PPTV-SCAN-HTML-STRUCTURE`, `PPTV-SCAN-HTML-HEAD`, `PPTV-SCAN-OUTPUT-NONEMPTY`, `PPTV-SCAN-UNKNOWN-SECTION` |
| Unsupported control attributes | A manifest/template/base-style/theme/runtime control block carries attributes outside its strict allowlist | `PPTV-SCAN-SECTION-ATTRIBUTES` |
| Invalid base-style identity | The sole `data-pptv-style` value is not exactly `base` | `PPTV-SCAN-STYLE-ID` |
| Invalid manifest | JSON or required field shape is invalid | `PPTV-MANIFEST-INVALID` |
| Manifest too complex | Manifest node count or nesting exceeds fixed parser limits | `PPTV-MANIFEST-LIMIT` |
| Missing reference | Manifest slide, theme, or runtime has no declaration | `PPTV-MANIFEST-MISSING-REFERENCE` |
| Duplicate identity | A stable identifier occurs more than once | `PPTV-ID-DUPLICATE` |
| Missing object annotation | A native renderable object lacks identity, role, or export intent | `PPTV-ID-MISSING` |
| Forbidden executable behavior | Arbitrary script, event-handler attribute, active SVG animation, or embed surface is present | `PPTV-SECURITY-EXECUTABLE` |
| Unsafe resource reference | Any fetching reference outside a same-document fragment, or CSS import/escape bypass, is present | `PPTV-SECURITY-URL` |
| Unrecognized runtime | An executable runtime ID/content pair does not match an installed fixed artifact | `PPTV-SECURITY-RUNTIME` |
| Unsupported native SVG | A native boundary contains an unsupported construct | `PPTV-SVG-UNSUPPORTED-NATIVE` |

## Dependencies

- Depends on: none
- Configuration: strict order, source-size, element-count, and nesting-depth limits are explicit scan/load options
- External: `parse5` for non-executing WHATWG HTML tokenization with source locations; `jsonc-parser` for strict JSON value ranges

## Cross-references

- **Source docs:** `PPTV-DESIGN-INDEX.md` §§4–10; `PPTV-PROCESSING-API.md` §§2–12, 19–20, 24
- **Write path:** `CONTRACT:C5-PPTV-PATCH.1.0`

## Future evolution

- Standalone SVG semantic loading, external multi-file dependency resolution, CSS resolution/provenance, normalization,
  canonical serialization, and PowerPoint compilation extend this contract only
  when executable fixtures define them.
- Physical slide size, the authority and reconciliation rules for duplicated
  title/version/layout/agent-profile metadata, theme-list semantics, and library
  expansion remain outside verified 1.0 behavior.
- Changing either offset coordinate system or the identity/order authority is a
  major-version change.

## Implementing Files

- `packages/pptv/src/core/source.ts` — UTF-8 decoding, hashing, and coordinate mapping
- `packages/pptv/src/core/scan.ts` — source recognition, section scanning, security inventory
- `packages/pptv/src/core/manifest.ts` — manifest parsing, field indexing, and validation
- `packages/pptv/src/core/deck.ts` — hierarchical semantic deck and object index
- `packages/pptv/src/ops/projections.ts` — ordered, token-efficient read projections

## Test Requirements

- [x] UTF-8 byte and UTF-16 range behavior, including BOM, CRLF, and non-BMP text (`source-scan.test.ts`)
- [x] Physical order, inert base-style inventory, and non-executing, digest-verified runtime inventory (`source-scan.test.ts`)
- [x] Manifest order independent from template order (`manifest-deck.test.ts`)
- [x] Duplicate IDs and unsupported native constructs (`manifest-deck.test.ts`)
- [x] Outline/text/object projections exclude unrelated runtime and CSS content (`manifest-deck.test.ts`)

## Change History

| Version | Date | Change | Migration |
|---------|------|--------|-----------|
| 1.0 | 2026-07-28 | Initial executable contract, including the pre-publication base-style control block, verified against the 0.1 TypeScript source kernel and source-scan/manifest-deck tests | — |
