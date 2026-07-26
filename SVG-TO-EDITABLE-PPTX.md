# SVG to Editable PowerPoint

**A reconstruction and round-trip playbook for turning a designed SVG into
an editable `.pptx` without losing the source of truth.**

This is a companion method to the repository's Markdown-to-DOCX workflow.
It is not a shipped converter or a claim that arbitrary SVG can be mapped
losslessly to PowerPoint shapes. The reliable result comes from a deliberate
reconstruction:

- text becomes native PowerPoint text;
- simple geometry becomes native PowerPoint shapes;
- complex vector artwork remains embedded SVG;
- every reconstructed object keeps a stable link to its source;
- the generated slide is rendered, inspected, and opened in PowerPoint before
  delivery; and
- later PowerPoint edits can be classified and ported back to the generator
  and canonical SVG.

That distinction matters. A flattened screenshot may look right but is not
editable. A single embedded SVG remains vector but is barely editable. A
blind path-by-path conversion creates hundreds of fragile Office objects.
This workflow preserves the editability people actually need while keeping
the original visual language intact.

For SVG authored specifically for deterministic conversion, see the
companion [`PPTV PowerPoint Vector Profile`](PPTV-PROFILE.md) proposal. PPTV
encodes object identity, native-versus-asset intent, and DOM-order z-order
directly in a conforming `.pptv.svg` source.

## How it complements Markdown and DOCX

The DOCX pair in this repository uses deterministic Word styles as a semantic
contract: Markdown constructs map forward to styles, and the reverse converter
inverts the same choices.

An editable presentation uses the same architectural idea at object level:

| Document workflow | Presentation workflow |
|---|---|
| Markdown construct | SVG element or semantic visual object |
| Deterministic Word style | Stable PowerPoint object ID and object type |
| DOCX provenance stamp | Source hash, generator reference, and sidecar map |
| Style-driven reverse conversion | Stable-ID object diff |
| Canonical Markdown | Canonical SVG plus generator source |

The reverse presentation leg is not a generic PPTX-to-SVG export. It is a
semantic diff: determine what a person changed in PowerPoint, accept the
intentional changes, and update the canonical SVG and generator accordingly.

## Deliverables

Keep the source, generator, output, and mapping together:

```text
slide.svg                         # canonical visual source
slide-editable.pptx               # delivered, editable deck
slide-pptx-map.json               # source-to-PowerPoint object map
build-slide-pptx.*                # deterministic generator
scratch/
  slide-reference.png             # rendered SVG baseline
  slide-generated.png             # rendered PPTX baseline
  slide-layout.json               # optional geometry/overflow report
  slide-editable.inspect.ndjson   # optional Office object inspection
```

Only the SVG, generator, map, and PPTX are durable artifacts. Renderings and
inspection output are reproducible QA evidence and belong in a scratch
directory unless there is a reason to preserve a reviewed baseline.

## 1. Audit the source before rebuilding it

Do not begin by drawing shapes. First establish exactly what the SVG contains.

1. Record the SVG `viewBox`, rendered aspect ratio, fonts, fills, strokes,
   gradients, clipping paths, filters, masks, and image references.
2. Render the SVG to a reference PNG at the intended slide aspect ratio.
3. Inventory visible objects in reading and z-order:
   background, regions, connectors, nodes, icons, labels, and annotations.
4. Identify repeated components and their alignment rules.
5. Classify every visible object using the reconstruction policy below.
6. Note any SVG text that has already been converted to paths. It will need a
   human-readable source string before it can become editable PowerPoint text.

The reference PNG is the visual contract. The SVG DOM is evidence about how
the design was made, but browsers and Office may render the same SVG feature
differently.

## 2. Use a hybrid reconstruction policy

Choose the PowerPoint representation according to editing value and fidelity:

| Source object | PowerPoint representation | Reason |
|---|---|---|
| Headings, labels, body copy, numbers | Native text box | Text remains editable and searchable |
| Rectangles, rounded rectangles, lines, arrows, dividers | Native shape or connector | High-value direct editing with predictable fidelity |
| Flat circles, pills, badges, simple symbols | Native shape plus native text | Easy recoloring and resizing |
| Complex icons, logos, irregular paths | Embedded SVG picture | Preserves vector fidelity without object explosion |
| Photographs or raster textures | Original raster image | Avoids fake vectorization |
| Unsupported SVG filters or effects | Native approximation or rendered asset | Office rendering is not browser rendering |

The objective is not "100 percent native shapes." The objective is that text,
layout, colors, and meaningful diagram structure are editable while complex
artwork remains crisp and stable.

## 3. Match the source coordinate system

Set the PowerPoint slide size to the SVG aspect ratio before creating objects.
Use one deterministic transform for all source coordinates:

```text
ppt_x = svg_x * slide_width  / viewBox_width
ppt_y = svg_y * slide_height / viewBox_height
ppt_w = svg_w * slide_width  / viewBox_width
ppt_h = svg_h * slide_height / viewBox_height
```

Account for non-zero `viewBox` origins. Do not tune individual objects with
unrecorded offsets. If Office needs an optical correction, encode it as a
named correction in the generator so the reason survives.

Create objects in deliberate z-order:

1. slide background;
2. enclosing surfaces and panels;
3. connectors inside those surfaces;
4. nodes and controls;
5. icons;
6. text and foreground annotations.

A common failure is creating connectors before an enclosing panel. The panel
then covers them even though their geometry is correct.

## 4. Assign stable semantic IDs

Every meaningful PowerPoint object needs a stable name visible in the
Selection Pane. Use a reserved prefix and semantic hierarchy:

```text
src.slide.background
src.header.title
src.stage.2.panel
src.stage.2.connector.input
src.stage.2.icon.identity
src.stage.2.title
src.stage.2.body
```

Rules:

- IDs describe meaning, not drawing order or Office's generated object number.
- An ID is unique within the deck.
- The same semantic object keeps the same ID across regenerations.
- Decorative fragments that must move together may be one embedded SVG with
  one ID.
- A copied PowerPoint object initially duplicates its source ID. During
  reverse inspection, treat that as a new object and assign a new ID before
  establishing the next baseline.
- Deleting an object retires its ID. Do not silently reuse it for a different
  concept.

Stable IDs turn a fragile collection of Office objects into something that can
be diffed.

## 5. Maintain a source map

Store the intended correspondence outside the PPTX as plain JSON. Keep it
small enough to review in a pull request:

```json
{
  "schema": "office180-pptx-map/1",
  "source": {
    "path": "slide.svg",
    "sha256": "FULL_SOURCE_SHA256"
  },
  "generator": {
    "path": "build-slide-pptx.js",
    "version": "1"
  },
  "slide": {
    "number": 1,
    "width": 13.333333,
    "height": 7.5
  },
  "objects": [
    {
      "id": "src.header.title",
      "source": "#title",
      "kind": "text",
      "editable": true
    },
    {
      "id": "src.stage.2.panel",
      "source": "#stage-2-panel",
      "kind": "shape",
      "editable": true
    },
    {
      "id": "src.stage.2.icon.identity",
      "source": "#identity-icon",
      "kind": "svg-picture",
      "editable": false
    }
  ]
}
```

The map is not a cache of every Open XML property. It records identity,
ownership, editability, and enough source information to explain how the
slide was reconstructed.

## 6. Stamp provenance in more than one place

Office applications do not preserve every metadata surface equally. Record
the following in both the sidecar map and the presentation where the chosen
library permits:

- full SHA-256 of the canonical SVG;
- canonical source path relative to the repository;
- generator path and version;
- map schema and map path;
- generation timestamp;
- a plain-language note that the SVG and generator are canonical.

Useful PPTX surfaces include core properties, speaker notes, object names, and
alt text for embedded artwork. Do not rely on only one metadata field.

Metadata must never be allowed to drift silently. A source hash change without
a regenerated PPTX and map is a failed build, not an informational warning.

## 7. Build text for PowerPoint, not for a browser

Text is the most common source of visual drift.

- Resolve font substitution explicitly before layout.
- Use fixed text-box dimensions derived from the SVG.
- Set margins, vertical anchoring, line spacing, and paragraph spacing
  intentionally.
- Prefer source-consistent line breaks for tightly composed headings.
- Disable auto-fit when exact geometry is required; use it only when editable
  copy is expected to grow.
- Check that no text is clipped, unexpectedly wrapped, or shrunk.
- Keep semantic text separate from decorative SVG icons.

PowerPoint and browser text metrics differ even with the same named font.
Treat rendered comparison, not font-size equality, as the final authority.

## 8. Validate the generated file in layers

Do not stop when the generation library returns successfully.

### Structural validation

1. Confirm the output is a valid ZIP/OPC package, for example with
   `unzip -t slide-editable.pptx`.
2. Inspect slide and shape counts.
3. Compare expected stable IDs from the map with actual object names.
4. Fail on missing, unexpected, or duplicate stable IDs.
5. Check for broken relationships and missing media.

### Visual validation

1. Render the canonical SVG to the target slide dimensions.
2. Render the generated PPTX using an Office-compatible renderer.
3. Compare both images at full-slide scale and inspect high-risk crops:
   titles, dense copy, connectors, clipped regions, and embedded icons.
4. Run geometry checks for overflow, accidental overlap, and off-slide
   objects.
5. Verify z-order manually where lines enter or leave enclosing surfaces.

Pixel-perfect equality is not always possible because text engines differ.
The review should distinguish harmless antialiasing from layout drift.

### Native PowerPoint validation

Open a temporary copy in desktop PowerPoint, not the delivery file.

1. Confirm no repair or corruption dialog appears.
2. Confirm the expected number of slides and objects.
3. Select representative text, shapes, connectors, and SVG artwork.
4. Make a temporary text edit and shape-color edit to prove editability.
5. Close the temporary copy without saving.

This catches package and application behavior that static Open XML inspection
cannot.

## 9. Bring human PowerPoint edits back

Treat the delivered PPTX as an editable branch, not a new canonical source.

1. Preserve the original generated PPTX as the comparison baseline.
2. Inspect the edited PPTX into a stable object listing.
3. Match objects by stable ID, then classify differences:
   - text edit;
   - geometry or style edit;
   - deletion;
   - new object;
   - copied object with a duplicate ID;
   - z-order change;
   - incidental Office serialization drift.
4. Review the intentional differences with the editor.
5. Port accepted changes into both the canonical SVG and generator.
6. Assign stable IDs to accepted new or copied objects.
7. Regenerate into a temporary output and compare it with the edited deck.
8. Replace the delivery artifact only after the regenerated version preserves
   the accepted visual and semantic changes.

Never regenerate directly over the only human-edited copy. Office may rewrite
XML, geometry, theme references, and object ordering even when the user made
no corresponding design decision.

## Failure modes and responses

| Failure | What it means | Response |
|---|---|---|
| Slide is one raster image | Fidelity was prioritized over editability | Reconstruct text and meaningful geometry |
| Slide is one embedded SVG | Vector quality exists, but editing is superficial | Split text and high-value diagram objects into native elements |
| Hundreds of tiny shapes | SVG paths were translated mechanically | Group complex artwork into embedded SVG assets |
| Lines disappear | Z-order is wrong or a panel covers connectors | Reorder creation by visual layer |
| PowerPoint reports corruption | OPC relationships or metadata are invalid | Validate the ZIP, inspect relationships, and open a temporary copy |
| Text wraps differently | Font metrics, margins, or auto-fit differ | Fix font substitution and explicit text-box behavior |
| Stable IDs are missing | Reverse mapping is no longer deterministic | Fail QA and repair object naming |
| Stable IDs are duplicated | A user copied an object | Treat copies as new objects and allocate new IDs |
| Source hash is stale | PPTX and canonical SVG no longer correspond | Regenerate or reconcile before delivery |
| Render looks right but edits break it | Geometry depends on browser-only behavior | Replace the affected feature with native Office geometry or a stable asset |

## Definition of done

A slide is ready to deliver only when:

- the canonical SVG renders correctly;
- all visible text is native and editable unless explicitly exempted;
- meaningful geometry is native and editable;
- complex artwork remains crisp vector or original-resolution raster;
- every mapped object has one unique stable ID;
- the sidecar map matches the source hash and generated deck;
- the PPTX package passes structural validation;
- the PPTX render matches the visual baseline within reviewed tolerances;
- text, overlap, clipping, and z-order checks pass;
- desktop PowerPoint opens a temporary copy without repair;
- representative text and shapes are demonstrably editable; and
- the reverse-edit procedure has a preserved baseline to compare against.

## Tooling posture

This workflow is intentionally SDK-neutral. It can be implemented with direct
Open XML, the Open XML SDK, PptxGenJS, or another presentation library that
can create named native objects and embed SVG. Choose tooling based on the
repository and runtime already in use.

Automation should enforce the map, provenance, rendering, and validation
steps. Human judgment is still required for visual equivalence and for
deciding which PowerPoint edits express design intent.
