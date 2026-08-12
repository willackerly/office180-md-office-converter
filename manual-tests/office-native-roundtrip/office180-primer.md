# office180 Primer

`office180-md-office-converter` is a source-first toolkit for creating Microsoft Office files without surrendering the structure that made them understandable in the first place. It treats an Office artifact as an editable branch of a precise source document, not as an opaque endpoint. The project currently develops two complementary lanes: strict PPTV vector diagrams that compile to editable PowerPoint, and canonical Markdown documents that compile to styled Word files.

The central promise is deliberately narrower than general document conversion. Within a contracted profile, a source can travel into an Office application, accept a supported human edit, and return to authoritative text or vector source with a reviewable explanation of what changed. Outside that profile, the safer answer is a clear refusal rather than a conversion that looks plausible while silently losing meaning.

> Preserve authority in simple source, make Office output genuinely useful, and prove every supported return path.

## The problem this library addresses

Office documents are valuable because people can open them, inspect them visually, and make familiar edits. They are difficult automation targets because a `.docx` or `.pptx` is a graph of XML parts, relationships, styles, coordinates, and application conventions packaged in a ZIP container. A small visual change can produce a large package diff, while a structurally important change can be hidden behind an apparently unchanged page.

Source formats have the opposite strengths. Markdown is easy to review and merge. SVG is a precise vector language with explicit geometry and stable identifiers. Both work well with version control and agents. Their weakness is that many collaborators still expect Word or PowerPoint as the place where review happens.

office180 connects those worlds by keeping the source format authoritative and making the Office artifact traceable to an exact supported baseline. It does not claim that every Word or PowerPoint feature has a clean inverse. Instead, it identifies a small semantic surface, gives that surface explicit contracts, and expands only when tests and evidence agree.

## Two lanes with one philosophy

The two conversion lanes use different implementation techniques, but they share the same discipline.

| Lane | Authoritative source | Office branch | Return result |
| --- | --- | --- | --- |
| Diagrams | Standalone PPTV SVG atom | Mapped native PPTX | Typed patch and recovered SVG |
| Documents | Canonical supported Markdown | Styled DOCX | Canonical Markdown and fidelity report |

Both lanes preserve stable meaning across formats. Both bind generated artifacts to exact source bytes or hashes. Both distinguish structural correctness from visual evidence. Both reject edits that cannot be represented honestly in the current source profile.

### PPTV SVG to PowerPoint and back

A standalone `.pptv.svg` file is the default diagram atom. It contains vector primitives, groups, connectors, text frames, stable IDs, and explicit painter order. Those choices are not incidental rendering details. They are the vocabulary that allows a rectangle in SVG to remain an independently editable rectangle in PowerPoint and then return to the same source identity.

Compilation is explicit. The caller chooses identity placement or an aspect-preserving uniform placement into the initial 16:9 slide canvas. The compiler does not silently stretch, crop, or letterbox the diagram. It emits a native PPTX plus a complete sidecar map that records source lineage and object correspondence.

After a supported PowerPoint edit, reconciliation authenticates the edited file against that exact baseline. It can classify bounded changes such as text, geometry, connector endpoints, group translation, sibling order, safe deletion, and native style. The result is a typed, old-value-preconditioned patch for review. Applying the patch changes the SVG source through source-range edits, reloads the complete candidate, and recompiles it to prove that the recovered source expresses the edited PowerPoint semantics.

- Stable SVG IDs remain object identity.

- SVG sibling order remains painter order.

- Groups retain independently editable children.

- Atomic assets remain one opaque selectable object.

- A box with text is represented as a group containing a shape and a text object.

The HTML form, `.pptv.html`, is an aggregation mechanism for decks. A slide can be hydrated out of a deck into an independent SVG atom by resolving supported deck context into local values and then validating the result on its own. The atom remains the natural unit for one diagram and the mapped PowerPoint round trip.

### Markdown to Word and back

The document lane starts by canonicalizing a supported Markdown profile. Headings, flat bullets, literal numbered paragraphs, simple pipe tables, fenced code, blockquotes, normal paragraphs, and separate bold, italic, and inline-code spans map to specific Word styles and run properties.

The generated DOCX embeds both the exact original Markdown and the exact canonical Markdown in a separately hash-bound package part. The canonical source is the merge base because it is the text that the Word body actually represents. Standard core properties add informational lineage, while the embedded source part supports exact inversion and later reconciliation.

When the DOCX returns, the converter inspects the full supported Word story surface and inverts styles back into canonical Markdown. Unsupported content such as tracked revisions, drawings, text boxes, fields, native numbering, nested tables, or ambiguous run formatting causes a stable refusal. For accepted files, the recovered Markdown is canonical and the fidelity report records input and output hashes, diagnostics, embedded-source state, and merge information.

If canonical Markdown evolved separately while a reviewer edited Word, the tool can perform a three-way merge. The embedded canonical source is the base, current Markdown is one branch, and style-inverted Word content is the other. Non-conflicting work can combine automatically; overlapping edits return explicit conflict markers.

## Contracts make the boundary visible

The library treats persistent formats and behavioral protocols as contracts, not informal implementation details. Contracts define supported constructs, authority rules, canonical spellings, error codes, security limits, and promotion evidence. A change to identity, patch vocabulary, or style inversion is therefore a versioned design change rather than an opportunistic code tweak.

The contract set separates concerns:

- C2 describes DOCX source embedding and provenance.

- C3 describes canonical Markdown inversion, refusals, reports, and merge behavior.

- C4 through C6 describe PPTV source interpretation, exact patches, and resolved geometry.

- C7 through C10 describe native PowerPoint generation, text-fit evidence, mapped baselines, and reconciliation.

- C11 describes visual and native Office lifecycle evidence for both lanes.

This separation matters because internally consistent provenence is not the same thing as external authentication. Hashes inside a package can prove that its own parts agree with each other. They do not prove who sent the package. Untrusted artifacts still need ordinary delivery-channel, signature, and review controls.

## Why text refuses to reflow

Text layout is where apparently small conversion differences become destructive. If a renderer moves one word to the next line, it can push every later line down, collide with another object, or change the perceived hierarchy of a diagram. A clipped character or a diagnosed slight overrun is often a more local and understandable failure than surprise reflow.

PPTV 0.1 therefore uses explicit line membership, explicit font size, and explicit text-frame geometry. Wrapping, autofit, shrink-to-fit, and automatic font-size repair are out of the executable profile. The system can measure text with explicit font bytes and report guard-band or overflow evidence, but it does not silently rewrite the design.

This makes rendering more determininstic across browsers, SVG, and PowerPoint. It also creates a useful editing rule: if a PowerPoint edit changes text within the supported frame, reconciliation should recover that exact text rather than allowing a renderer to invent new line membership.

The planned 0.1.1 text-resilience design may add paragraph intent and configurable reliable or editable PowerPoint frame policies. Even then, explicit SVG lines remain the authority. The design is banked for future contracts and calibration; it is not accepted syntax today.

## Trust boundaries and fail-closed behavior

The project assumes that source files and Office packages may be untrusted. Safety begins before semantic conversion.

- PPTV scanners do not execute embedded viewer or editor JavaScript to discover meaning.

- Active SVG behavior, external resource fetches, malformed XML, unsafe package paths, duplicate ZIP members, and unsupported structures are rejected.

- Patches are bound to an exact source SHA-256 and include old-value preconditions.

- Candidate source is completely reloaded and resolved before any patch succeeds.

- DOCX reverse conversion reads one immutable package snapshot so validation, parsing, reporting, and merge cannot observe mixed file states.

- Command-line output is staged and published transactionally, with alias checks and rollback on ordinary replacement failure.

Fail-closed behavior is a product feature. A refusal identifies the boundary that needs a contract, fixture, and test before it can become supported. It prevents a convenient converter from becoming a silent data-loss machine.

## Visual evidence is a separate proof

A structurally correct package can still look wrong. A visually correct preview can still hide broken mappings. office180 keeps those questions separate and records evidence for both.

C11 evidence bundles bind captures and comparisons to exact source and artifact hashes. PPTV source is rendered in a browser, PPTX and DOCX are rendered through a platform renderer, and changed-pixel bounds help show whether an intended edit stayed inside its expected region. An edited artifact and a regenerated artifact can then be compared with the same renderer.

The checked fixtures already demonstrate pixel-identical edited and regenerated previews for supported edits. They also demonstrate byte-identical supported PowerPoint slide XML after reconciliation and recompilation. These are strong repeatable checks, but they are not substitutes for a human opening Microsoft Office.

The native lifecycle closes that remaining gap:

1. Open the generated file in Word or PowerPoint without a repair warning.

2. Make representative supported edits using the application interface.

3. Save the file, close it, and reopen the saved result.

4. Confirm that the intended objects and text remain editable and visually sound.

5. Run the edited file through reconciliation and inspect the proposed source changes.

6. Regenerate the Office artifact and compare the result with the Office-saved branch.

## A practical PPTV workflow

The normal atom workflow is explicit and reviewable.

1. Author or extract a valid standalone PPTV SVG with stable semantic IDs.

2. Validate and resolve the atom before compilation.

3. Compile with an explicit placement policy and retain the generated map beside the PPTX.

4. Edit only the supported objects in PowerPoint.

5. Reconcile the saved PPTX against the original source and exact map.

6. Review the typed patch before applying it to source.

7. Recompile and inspect structural plus visual evidence.

Typical commands look like this:

```
pnpm pptv validate diagram.pptv.svg
pnpm pptv resolve diagram.pptv.svg
pnpm pptv compile diagram.pptv.svg --placement 0,0,1200,800 --policy identity --output diagram.pptx --map diagram.pptv.map.json
pnpm pptv reconcile diagram.edited.pptx --source diagram.pptv.svg --baseline diagram.pptv.map.json --patch recovered.pptv.patch.json --report reconciliation.json
pnpm pptv patch diagram.pptv.svg recovered.pptv.patch.json --output diagram.recovered.pptv.svg
```

The map and original source belong with the test case. A baseline-free PowerPoint import is intentionally not inferred.

## A practical Markdown workflow

The document workflow starts with canonical source so that later differences represent real edits.

1. Normalize the Markdown and review the canonical spelling.

2. Run the exact round-trip check before distributing the DOCX.

3. Generate the styled Word artifact.

4. Ask the reviewer to stay inside the supported style and content profile.

5. Save, close, and reopen the edited file in Word.

6. Recover canonical Markdown with a fidelity report.

7. Merge against independently changed canonical Markdown only when the embedded base is internally consistent.

Typical commands look like this:

```
.venv/bin/python md2docx.py --normalize primer.md
.venv/bin/python md2docx.py --check primer.md
.venv/bin/python md2docx.py -o primer.docx primer.md
.venv/bin/python docx2md.py primer.edited.docx --out primer.recovered.md --report primer.report.json
```

Word styles are semantic markers in this lane. Changing a heading to an arbitrary visual approximation, applying tracked changes, inserting a text box, or using native numbering moves the document outside the supported inverse.

## What is implemented and what is not

| Area | Implemented now | Honest boundary |
| --- | --- | --- |
| PPTV source | Strict SVG atoms, deck aggregation, stable IDs, exact-source patches | Not general SVG conversion |
| PPTX output | Native bounded shapes, mapped atom compilation, supported edit reconciliation | Not arbitrary PPTX import |
| PPTV text | Explicit lines, no wrap, exact-font measurement evidence | No automatic repair or native text calibration |
| Markdown | Exact canonical supported-profile round trip | No full CommonMark or rich document model |
| DOCX | Styled generation, embedded bases, strict inversion, reports, three-way merge | No images, text boxes, tracked revisions, or native numbering |
| Visual proof | Browser and platform-renderer evidence with quantitative comparisons | Native Office lifecycle still requires a human run |

The restrictions are intentional staging points. Rich text, insertion, duplication, reparenting, multiline compiler support, wider Markdown syntax, and general Office import all require source semantics and reverse behavior to evolve together.

## How to evaluate this manual test

Open the generated Word primer and PowerPoint diagrams in their native applications. Look first for repair dialogs, substituted fonts, clipped text, unexpected wrapping, displaced connectors, or flattened objects. Make the requested supported edits, correct the spelling mistakes you notice, and add one observation that was not known when the fixtures were authored.

After saving, close each application completely and reopen the saved files. The reopened state matters because an application may normalize package content only during save. Keep the edited files beside their original baselines and maps so reconciliation can distinguish intentional edits from unsupported structural changes.

The most useful result is not merely that the files open. It is that the edits remain natural in Office, the return tools explain them precisely, regenerated artifacts match the edited intent, and any unsupported action fails with enough detail to guide the next contract.

## Your turn

YOUR NEW OBSERVATION GOES HERE
