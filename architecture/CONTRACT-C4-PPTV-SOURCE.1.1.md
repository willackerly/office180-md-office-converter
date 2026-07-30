# CONTRACT-C4-PPTV-SOURCE.1.1

<!-- SUPERSEDES: CONTRACT-C4-PPTV-SOURCE.1.0 -->

**Version:** 1.1
**Status:** in-progress
**Owner:** Will Ackerly
**Type:** Data Model
**Cross-repo Promotability:** Yes — a future optional OpenDocKit adapter may consume PPTV projections without becoming a core dependency
**Source:** `PPTV-DESIGN-INDEX.md`, `PPTV-PROFILE.md`, `PPTV-HTML-CONTAINER.md`, and `PPTV-PROCESSING-API.md`

## Why this exists

PPTV needs one executable definition of where visual meaning lives before the
CLI, browser viewer, editor, or PowerPoint translator can agree. This contract
fixes the source forms, authority rules, offsets, identities, and minimum
read-path behavior for both whole HTML decks and standalone SVG diagram atoms.
A diagram is not a degenerate or synthetic one-slide deck: it has no manifest,
slide order, active theme, or invented slide identity.

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

### Scenario 4 — load one diagram atom directly

A caller loads a self-contained `.pptv.svg` whose root declares its stable ID,
PPTV version, SVG namespace, and arbitrary positive finite `viewBox`. The
result is a `PptvDiagram` with one root object tree in DOM painter order, not a
fabricated manifest, deck, slide, theme, or slide-order entry.

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
function loadDiagram(
  input: PptvInput,
  options?: LoadDiagramOptions
): Promise<PptvDiagram>;
function loadPptvDocument(
  input: PptvInput,
  options?: LoadPptvDocumentOptions
): Promise<PptvDocument>;
function validateDeck(deck: PptvDeck): Diagnostic[];
function validateDiagram(diagram: PptvDiagram): Diagnostic[];
```

`PptvScan` explicitly retains an immutable `PptvSourceDocument` containing the
decoded source. This resolves the proposal's impossible
`parseManifest(scan)` signature, whose documented scan type did not retain the
manifest bytes or text.

`PptvDocument` is the discriminated union `PptvDeck | PptvDiagram`.
`PptvDiagram` is an immutable, hash-bound semantic source with
`sourceKind: "svg"`, `version`, `id`, arbitrary finite-positive `viewBox`,
ordered root children, exact source, ambiguity-safe root/object index, and
diagnostics. It does not implement, inherit from, or contain `PptvDeck`; a host
that wants a deck must author an HTML deck explicitly. `loadDeck()` continues
to accept only the HTML form. `loadDiagram()` accepts only the SVG form.
`loadPptvDocument()` dispatches by content and returns the corresponding
distinct semantic type.

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
| Artifact kinds | A self-contained HTML source semantically loads as a `PptvDeck`; a standalone SVG source semantically loads as a `PptvDiagram`. Neither loader coerces one kind into the other. External manifests remain inventory-only. |
| HTML authority | The manifest defines slide order; physical template order does not. Strict HTML requires explicit `html`/`head`/`body`, allowlisted container/control-block attributes, an inert head, exactly one manifest, an empty inert `main`/`div` output mount, exactly one inert `<script type="text/css" data-pptv-style="base">`, and one recognized viewer runtime. Canonical body order is manifest, output mount, slides, libraries, base style, themes, runtime. All C4 1.0 HTML behavior is preserved. |
| Diagram root | A standalone diagram contains exactly one source-located root `svg` and otherwise only an optional XML declaration, comments, and whitespace. The root requires a non-empty stable `id`, `data-pptv-version="0.1"`, `xmlns="http://www.w3.org/2000/svg"`, and a four-number finite unitless `viewBox` whose width and height are strictly positive. Its origin, size, and aspect ratio are otherwise arbitrary. Filename-derived identity is never semantic authority. |
| Diagram control plane | A diagram has no manifest, slide/template wrapper, output mount, library, theme, executable runtime, dependency, or active-theme/slide-order authority. No such state is synthesized during loading or projection. |
| Diagram styling boundary | Standalone SVG 0.1 has no stylesheet, class, theme, custom-property, token, or `var()` surface. A `style` element or `class` attribute is unsupported. C6 permits only its fixed defaults, supported presentation attributes, and supported element-local `style` declarations. |
| SVG authority | Stable SVG `id` is canonical object identity and DOM sibling order is canonical painter/z-order. |
| Object boundaries | Annotated native objects require a supported role and export mode. Children below `svg`, `raster`, or `ignore` boundaries are opaque. |
| Duplicate identity | Duplicate diagram-root/object, slide, theme, library, base-style, or object IDs are errors. Ambiguous slide/theme/library declarations are omitted from their lookup indexes. Public object query APIs suppress IDs named by duplicate diagnostics instead of resolving first- or last-write-wins; the raw source index is not an ambiguity-safe query API. |
| Cheap reads | Scan and manifest operations inventory but do not resolve base/theme CSS, expand SVG definitions, load assets, or semantically parse slides. The scanner does inspect the fixed viewer-runtime bytes to verify its registered digest; JSON-safe projections omit runtime source and unrelated CSS. |
| Source intent | Semantic nodes retain their original attributes, permitted classes, hierarchy, export intent, and safe replacement ranges. Standalone diagrams reject classes instead of retaining them as an alternate styling authority. |
| Unsupported constructs | Unsupported native SVG and forbidden executable behavior produce diagnostics; there is no implicit native-to-raster fallback. |
| Initial conformance scope | Contract 1.1 governs PPTV source format `0.1` and semantically loads either one self-contained `.pptv.html` deck or one self-contained `.pptv.svg` diagram. External-manifest inputs remain recognized and inventoried only. |
| Snapshot versus output | The Map-rich deck or diagram/index is an immutable, hash-bound in-process snapshot. Versioned CLI/MCP projections use JSON-safe arrays and records and preserve the artifact-kind distinction. |

## Error Contracts

| Error | When | Code |
|-------|------|------|
| Unsupported or ambiguous source | Content is not a recognized PPTV source form | `PPTV-SCAN-UNRECOGNIZED` |
| Source too large | UTF-8 input exceeds the configured byte ceiling | `PPTV-SCAN-SOURCE-LIMIT` |
| Structure too large | Parsed element count or nesting depth exceeds configured limits | `PPTV-SCAN-STRUCTURE-LIMIT` |
| Invalid UTF-8 | Byte input cannot be decoded losslessly | `PPTV-SCAN-INVALID-UTF8` |
| Invalid physical order | Strict HTML sections violate the contract order | `PPTV-SCAN-PHYSICAL-ORDER` |
| Wrong semantic loader | A deck-only, diagram-only, or document loader receives another recognized source kind | `PPTV-DOCUMENT-KIND` |
| Competing container content | HTML/head/body, top-level text, or the output mount contains behavior or visible source outside canonical sections | `PPTV-SCAN-HTML-STRUCTURE`, `PPTV-SCAN-HTML-HEAD`, `PPTV-SCAN-OUTPUT-NONEMPTY`, `PPTV-SCAN-UNKNOWN-SECTION` |
| Unsupported control attributes | A manifest/template/base-style/theme/runtime control block carries attributes outside its strict allowlist | `PPTV-SCAN-SECTION-ATTRIBUTES` |
| Invalid base-style identity | The sole `data-pptv-style` value is not exactly `base` | `PPTV-SCAN-STYLE-ID` |
| Invalid diagram root ID | A standalone root omits a valid explicit stable ID | `PPTV-DIAGRAM-ROOT-ID` |
| Invalid diagram version | A standalone root does not declare `data-pptv-version="0.1"` | `PPTV-DIAGRAM-ROOT-VERSION` |
| Invalid diagram namespace | A standalone root does not declare the exact SVG namespace | `PPTV-DIAGRAM-ROOT-NAMESPACE` |
| Invalid diagram viewBox | A standalone root omits the four-number finite-positive viewBox | `PPTV-SVG-VIEWBOX` |
| Unsupported diagram root attribute | A standalone root has an attribute outside its strict allowlist | `PPTV-DIAGRAM-ROOT-ATTRIBUTES` |
| Unsupported diagram stylesheet | A standalone diagram contains a `style` element, `class`, or another stylesheet/theme control surface | `PPTV-DIAGRAM-STYLE` |
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
- **Write path:** `CONTRACT:C5-PPTV-PATCH.1.1`

## Future evolution

- External multi-file dependency resolution, normalization, canonical
  serialization, and broader PowerPoint compilation extend this contract only
  when executable fixtures define them.
- Physical slide size, the authority and reconciliation rules for duplicated
  title/version/layout/agent-profile metadata, theme-list semantics, and library
  expansion remain outside this contract.
- Changing either offset coordinate system or the identity/order authority is a
  major-version change.

## Implementing Files

- `packages/pptv/src/core/source.ts` — UTF-8 decoding, hashing, and coordinate mapping
- `packages/pptv/src/core/scan.ts` — source recognition, section scanning, security inventory
- `packages/pptv/src/core/manifest.ts` — manifest parsing, field indexing, and validation
- `packages/pptv/src/core/deck.ts` — hierarchical semantic deck/diagram loaders
  and ambiguity-safe object indexes
- `packages/pptv/src/ops/projections.ts` — ordered, token-efficient read projections

## Test Requirements

- [x] UTF-8 byte and UTF-16 range behavior, including BOM, CRLF, and non-BMP text (`source-scan.test.ts`)
- [x] Physical order, inert base-style inventory, and non-executing, digest-verified runtime inventory (`source-scan.test.ts`)
- [x] Manifest order independent from template order (`manifest-deck.test.ts`)
- [x] Duplicate IDs and unsupported native constructs (`manifest-deck.test.ts`)
- [x] Outline/text/object projections exclude unrelated runtime and CSS content (`manifest-deck.test.ts`)
- [ ] Required standalone root metadata, arbitrary finite-positive viewBox, and no filename-derived identity
- [ ] Standalone diagram materialization, stylesheet/class rejection, object queries, duplicate suppression, and JSON-safe projections
- [ ] Deck and diagram loaders reject cross-kind input without synthesizing another artifact kind

## Retirement / supersession plan

- **Predecessor:** `CONTRACT:C4-PPTV-SOURCE.1.0` — retired by this additive
  source-kind revision; HTML callers require no source migration.
- **Migration boundary:** update implementation headers and consumers to 1.1
  when standalone semantic loading, fixtures, and projections land.
- **Migration owner:** PPTV source-kernel maintainer.

## Change History

| Version | Date | Change | Migration |
|---------|------|--------|-----------|
| 1.0 | 2026-07-28 | Initial executable contract, including the pre-publication base-style control block, verified against the 0.1 TypeScript source kernel and source-scan/manifest-deck tests | — |
| 1.1 | 2026-07-30 | Add a first-class standalone SVG diagram atom with strict root metadata, stylesheet-free local styling, arbitrary positive finite viewBox, and a semantic type distinct from decks | Existing HTML sources and `loadDeck()` behavior are unchanged; SVG callers adopt `loadDiagram()`/`loadPptvDocument()` and must declare required root metadata |
