# CONTRACT-C7-PPTX-CANARY.1.1

**Version:** 1.1
**Status:** in-progress
**Owner:** Will Ackerly
**Type:** Artifact Compiler
**Cross-repo Promotability:** Yes — the strict OPC graph and deterministic
STORE writer are candidates for a future OpenDocKit fresh-package builder
**Source:** `PPTV-IMPLEMENTATION-PLAN.md` §§4–5

## Why this exists

C6 produces a browser-independent resolved deck, but does not prove that a
fresh PowerPoint package can be synthesized safely. This contract defines the
first deliberately narrow compiler canary: a deterministic, inspectable PPTX
containing native plain rectangles, ellipses, straight lines, translated native
groups, and one explicitly hard line per text frame.

This is an OPC/XML conformance canary, not a native-render-fidelity claim.
PowerPoint open without repair now passes; PPTX save/reopen plus quantitative
source-to-render and baseline-to-glyph comparison remain required before the
compiler may be described as native-validated.

## Interfaces

The Node-only compiler is asynchronous only for in-memory ZIP generation and
performs no filesystem writes:

```ts
interface PptxCanaryArtifact {
  bytes: Uint8Array;
  partNames: readonly string[];
  sourceSha256: string;
}

function compilePptxCanary(
  input: PptvResolvedDeck | PptvResolvedResult,
): Promise<PptxCanaryArtifact>;
```

`createPptxCanaryGraph()` exposes the pre-ZIP content-part/relationship graph
for inspection. `validatePptxCanaryGraph()` validates that graph independently
before XML relationship parts, `[Content_Types].xml`, and ZIP records are
materialized. These low-level interfaces are experimental within C7.

Compilation throws `PptxCanaryCompileError` and returns no bytes on any error.
For the exact geometry/style fields covered below, it never drops, rasterizes,
approximates, or rounds an unsupported value. Text baseline placement is the
documented canary exception: the frame and horizontal anchor map exactly, while
native glyph-baseline parity remains a measured future gate.

## Behavioral Contracts

### Accepted resolved input

- Input schema is exactly `pptv-resolved/0.1`, with C6's exact
  `12192000 × 6858000` EMU canvas and `7620` EMU per SVG unit.
- A `PptvResolvedResult` must contain a model and no error/fatal diagnostic.
- Slides and siblings retain C6 manifest/DOM order. `order` must be contiguous.
- Object IDs are unique per slide and appear as XML-safe
  `p:cNvPr name="src.&lt;PPTV-id&gt;"` metadata.
- PowerPoint slide IDs and object non-visual numeric IDs are deterministic
  hashes of stable PPTV IDs, not z-order indexes. A hash collision fails.
- The XML order of shapes/groups is the C6 painter order.

### Initial object capability

| C6 kind                      | C7 behavior                                                      |
| ---------------------------- | ---------------------------------------------------------------- |
| `rect`                       | Native `p:sp` with plain rectangular preset geometry             |
| `ellipse`                    | Native `p:sp` with ellipse preset geometry                       |
| `line`                       | Native straight `p:cxnSp`; declared endpoints stay authoritative |
| `group`                      | Native `p:grpSp` with exact translation and ordered children     |
| `text`                       | Native text-box `p:sp` with exactly one explicit hard line       |
| `svg-asset` / `raster-asset` | Error; no raster or picture fallback                             |

Rounded `rect` values (`rx` or `ry`), multiple hard lines, degenerate group
bounds, and opacity other than `1` on any object are outside this canary. They
fail until their PowerPoint mapping and fidelity gates are specified. Opacity is
rejected globally because applying alpha independently to native child fill and
stroke is not equivalent to SVG object/group compositing.

### Exact numeric mapping

- Every position, extent, radius, endpoint, translation, line width, and
  paragraph margin used in DrawingML must map to a safe integer after
  multiplication by exactly `7620`. Non-integral or unsafe values fail.
- Font size and line step are SVG user-space values. They map to hundredths of
  a point by multiplication by exactly `60`, derived from the same physical
  scale as geometry (`7620` EMU per unit divided by `127` EMU per hundredth
  point). Non-integral or unsafe values fail.
- There is no implicit rounding, clamping, locale formatting, or unit fallback.
- Values must also fit their emitted DrawingML simple types: coordinates stay
  within `-27273042329600..27273042316900`, extents within
  `0..27273042316900`, line widths within `0..20116800`, font sizes within
  `100..400000`, point spacing within `1..158400`, and paragraph margins within
  `0..51206400`. A positive extent is required where the canary geometry is
  two-dimensional.
- Text frames map exactly. The text body explicitly uses `wrap="none"`,
  `a:noAutofit`, and zero `lIns`/`tIns`/`rIns`/`bIns`.
- The one source line maps to one `a:p`/`a:r`/`a:t` sequence. DrawingML's
  `a:t` is emitted without `xml:space` because its schema type is `xsd:string`
  (whose whitespace facet is already `preserve`) and does not admit the XML
  attribute. Paragraph alignment/margins retain the declared horizontal anchor.
  Paragraph indentation is zero, bullets are disabled, and the concrete font
  family is emitted for Latin, East Asian, and complex-script text so theme
  inheritance cannot silently substitute a typeface.
- SVG baseline-to-native PowerPoint glyph placement is not claimed exact by
  this canary. The source `line.y` is validated inside its frame but is not
  written into an accessibility description or claimed as an exact DrawingML
  glyph baseline. The complete source hash links the artifact to the
  authoritative value; quantitative baseline comparison and a proper versioned
  map/extension remain future gates.
- Machine metadata is not placed in `p:cNvPr/@descr`; descriptions remain
  available for accessibility content.

### Fresh OPC package

The package contains no copied template parts and includes:

- `[Content_Types].xml` and root `_rels/.rels`
- `docProps/core.xml`, `docProps/app.xml`, and `docProps/custom.xml`
- `ppt/presentation.xml`, `ppt/presProps.xml`, and the presentation
  relationships that connect them
- one theme referenced by both the presentation and slide master
- one slide master and its relationships
- one blank slide layout and its relationships
- one slide plus relationships for every resolved slide

Custom properties record compiler identity, resolved schema, active theme, and
the complete C6 source SHA-256. Core created/modified times and ZIP DOS
timestamps are fixed at `2000-01-01T00:00:00Z`.
The emitted `office180-pptv-pptx-canary/0.1` compiler identity is the stable
output capability-profile identifier, not this contract document's revision;
the C7 contract version and source history record implementation corrections
that preserve the same output profile.

Before ZIP generation:

- part paths are canonical relative ASCII OPC names with no backslashes,
  empty/dot segments, percent escapes, queries, fragments, controls, or
  case-folded duplicates;
- each content part has the exact content type permitted for its path;
- relationship IDs are unique within their source;
- every internal target resolves canonically to an existing part;
- every content part is reachable from root relationships;
- the canary's exact root/presentation/master/layout/slide relationship graph
  is present with no extra relationship.

ZIP output uses lexicographically sorted ASCII part names with no encoding
ambiguity, no directory entries, no data descriptors, method `STORE`, fixed
timestamps, and no ZIP64. Package-limit overflow fails.

## Error Contracts

| Code                             | When                                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------- |
| `PPTV-PPTX-UNRESOLVED`           | Input result has no model or retains an error                                                  |
| `PPTV-PPTX-INVALID-MODEL`        | Resolved schema/canvas/identity/order/geometry invariants are inconsistent                     |
| `PPTV-PPTX-UNSUPPORTED-OBJECT`   | Object kind or text-line count is outside the canary                                           |
| `PPTV-PPTX-UNSUPPORTED-GEOMETRY` | Rounded rectangle, degenerate group, non-opaque object, out-of-range value, or unrepresentable geometry |
| `PPTV-PPTX-NON-INTEGRAL-EMU`     | SVG value does not map exactly to integer EMU                                                  |
| `PPTV-PPTX-NON-INTEGRAL-FONT`    | Font/line value does not map exactly to hundredth-points                                       |
| `PPTV-PPTX-ID-COLLISION`         | Stable numeric PowerPoint IDs collide                                                          |
| `PPTV-PPTX-OPC-GRAPH`            | Part/content-type/relationship/reachability validation fails                                   |
| `PPTV-PPTX-ZIP-LIMIT`            | STORE-only ZIP32 limits are exceeded                                                           |

## Dependencies

- Depends on: `CONTRACT:C6-PPTV-RESOLVED.1.0`
- External runtime dependency: exactly `jszip@3.10.1`, configured with fixed
  dates, `createFolders: false`, `STORE`, empty comments, explicit DOS
  platform/permissions, and sorted insertion
- OpenDocKit: optional independent inspection oracle only; the compiler does
  not import `@opendockit/pptx`

## Implementing Files

- `packages/pptv/src/node/pptx-canary.ts`
- `packages/pptv/src/node/index.ts`
- `packages/pptv/src/node/io.ts`
- `packages/pptv/src/cli.ts`

## Test Requirements

- [x] Same resolved input produces byte-identical output in one and separate
      Node processes
- [x] ZIP entries are STORE-only, fixed-date, directory-free, and sorted
- [x] Required content types, provenance, and relationship graph are present
- [x] Two-slide manifest order and native painter order are retained
- [x] Plain rectangle, ellipse, line, translated group, and direct hard-line
      text XML contain exact integer mappings and stable names/IDs
- [x] All connector flip quadrants, nested group transforms, DrawingML range
      boundaries, object/slide numeric-ID collisions, central-directory order,
      zero extras/comments, and ZIP extension exclusions have adversarial tests
- [x] Unresolved input, assets, rounded rectangles, multiline text,
      non-integral units, graph duplicates, bad paths/content types, and dangling
      relationships fail without bytes
- [x] Applicable ISO/ECMA XML schemas validate independently
- [x] Independent OPC reopen/inspection succeeds
- [x] Native PowerPoint opens without repair and a PDF/render smoke is coherent
- [ ] Native PPTX save/reopen and quantitative source-to-PDF render comparison
      succeed

## Validation Evidence

On 2026-07-29, the 1.1 compiler mapped text and geometry through one physical
scale. Source
`a4e23c1b7b8dc7034150352dea5bbf03028a76f50025059de259a80af1563bf8`
produced the 17-part, 26,412-byte canary
`8709452fe68f909ca4c469486e6e4c3e7bbde25dff114fdc79587cc75b8e8c96`.
That exact artifact:

- passed the applicable ISO/ECMA PresentationML, DrawingML, document-property,
  content-type, and relationship XSDs;
- reopened through OpenDocKit 0.2 with exact `12192000 × 6858000` size, manifest
  slide order, both slide-layout-master chains, theme, native shapes, text,
  groups, and connector;
- opened in Microsoft PowerPoint 16.111.2 with two slides, no repair dialog or
  corruption diagnostic, and exported a coherent 14,630-byte, two-page
  960 × 540-point PDF
  (`fda8cbd680cad913f10921e06c19956dd0e8dc2ad01192409dbbcc8dcb59d88f`)
  without hard-line reflow; and
- retained byte-identical output across process time zones.

The native artifact contains rectangles, untransformed groups, one forward
horizontal connector, and one-line text. Ellipse, translated/nested group,
reversed-connector, near-edge/space-sensitive text, and range-boundary behavior
currently have structural unit coverage only and remain required native-fixture
expansions before C7 promotion.

PowerPoint 16.111.2 AppleScript Open XML Save As produced a zero-byte target for
both this canary and a known-good PowerPoint-authored control. Save/reopen is
therefore still unverified; any future gate must require a non-empty target,
`unzip -t`, and successful reopen. Exact SVG-baseline-to-native-glyph placement
remains outside the current claim.

## Change History

| Version | Date       | Change                                                                                                                                        | Migration                                            |
| ------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 1.1     | 2026-07-29 | Correct font-size and line-step mapping to geometry-derived 60 hundredth-points per unit; renew exact artifact/schema/OpenDocKit/native evidence | Regenerate C7 artifacts; source remains unchanged    |
| 1.0     | 2026-07-29 | Initial deterministic primitive-only fresh-PPTX canary                                                                                        | No prior compiler artifact                           |
