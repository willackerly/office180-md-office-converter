# CONTRACT-C7-PPTX-CANARY.2.1

<!-- SUPERSEDES: CONTRACT-C7-PPTX-CANARY.2.0 -->

**Version:** 2.1
**Status:** in-progress
**Owner:** Will Ackerly
**Type:** Artifact Compiler
**Cross-repo Promotability:** Yes — the strict OPC graph and deterministic STORE writer remain OpenDocKit contribution candidates
**Source:** `VECTOR180-IMPLEMENTATION-PLAN.md` §§4–5

## Why this exists

C7 proves that the strict Vector180 deck profile can produce a deterministic,
inspectable fresh PPTX without conflating package validity with visual
fidelity. Version 2.0 changes the accepted resolved schema and embedded lineage
to Vector180 while preserving the deliberately narrow C7 1.1 compiler subset.
Version 2.1 keeps every 2.0 byte for a one-line text object and adds one
bounded mapping: a text object with several authored hard lines becomes one
native text box with one paragraph per line, so a deck no longer explodes into
one PowerPoint text box per visible line.

## Who needs this

- **Vector180 deck/report authors** — need a bounded deterministic native-object canary
  whose paragraphs and lists stay one editable PowerPoint text box each.
- **C9** — reuses the package graph and primitive mapping.
- **C10/C11** — authenticate new package lineage and retain separate native/visual gates.
- **OpenDocKit collaboration** — may reuse the package graph without taking a source dependency.

## Scenarios

### Scenario 1 — compile a canonical deck

An exact `vector180-resolved-deck/0.1` model containing supported primitives
becomes a byte-deterministic PPTX. Stable object names remain
`src.<stable-id>`, while custom properties identify the Vector180 compiler,
resolved schema, active theme, and exact source hash.

### Scenario 2 — reject legacy relabeling

A `pptv-resolved/0.1` model or a package carrying `pptv.*` lineage is not
accepted as Vector180 merely because its values resemble the canonical model.
Historical C7 1.1 remains the validator for that artifact.

### Scenario 3 — compile a paragraph as one text box

A text object declares three direct `tspan` hard lines that share one anchor x
and whose baselines are exactly one declared line step apart. C7 emits one
`p:sp` text box named `src.<stable-id>` holding three `a:p` paragraphs with
exact point line spacing, `wrap="none"`, no autofit, and zero insets. Nothing
reflows: each paragraph occupies the line-step band that a separate one-line
box would have occupied.

### Scenario 4 — refuse an indented hard line

One hard line of a multi-line object declares a different anchor x. C6 still
resolves it, but one native text box cannot place it without a per-paragraph
approximation the profile has not contracted. C7 refuses with
`VECTOR180-PPTX-UNSUPPORTED-OBJECT`, names both anchors, and emits no package.

## Interfaces

```ts
interface Vector180PptxCanaryArtifact {
  readonly schema: "vector180-pptx-canary/0.1";
  readonly compiler: "office180-vector180-pptx-canary/0.1";
  readonly sourceSha256: string;
  readonly bytes: Uint8Array;
  readonly sha256: string;
  readonly parts: readonly Vector180PptxPart[];
}

function compileVector180PptxCanary(
  input: Vector180ResolvedDeck | Vector180ResolvedDeckResult,
): Promise<Vector180PptxCanaryArtifact>;
```

CLI result schema is `vector180-pptx-canary-result/0.1`.

## Behavioral Contracts

| Behavior            | Specification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accepted input      | Input is exactly one complete, error-free `vector180-resolved-deck/0.1` with the C6 2.0 fixed 1600×900 canvas and exact source SHA-256. Atom input remains outside C7; C9 handles explicit atom placement.                                                                                                                                                                                                                                                                                                                                                                  |
| Primitive subset    | Plain rectangles, circles/ellipses, straight lines, nondegenerate translated groups, and native text objects whose one or more hard lines pass hard-line admission remain the subset. Unsupported content fails; there is no raster fallback.                                                                                                                                                                                                                                                                                                                               |
| Hard-line text box  | A text object with N ≥ 1 resolved hard lines compiles to exactly one `p:sp` text box whose `p:txBody` holds exactly N `a:p` paragraphs in source line order. It never becomes N boxes and never uses `a:br`. Every paragraph repeats the one-line paragraph properties: alignment and `marL`/`marR` derived from the shared anchor, `indent="0"`, `a:lnSpc/a:spcPts` equal to the declared line step, zero `a:spcBef`/`a:spcAft`, and `a:buNone`. The body stays `wrap="none"`, `a:noAutofit`, zero insets, top anchor. A one-line object emits the C7 2.0 bytes unchanged. |
| Hard-line admission | For N ≥ 2 every hard line must declare exactly the first line's anchor x, and consecutive baselines must differ by exactly the declared line step in exact EMU arithmetic. A differing anchor x, an irregular or reversed step, or zero lines is refused, never approximated. One object has one style; there is no per-line or per-run style.                                                                                                                                                                                                                              |
| Empty hard line     | A zero-length hard line of a multi-line object is supported explicitly: it is a run-less `a:p` carrying the same paragraph properties and an `a:endParaRPr` with the complete object style, so it advances exactly one line step. A non-empty line is one `a:r` plus the matching `a:endParaRPr`.                                                                                                                                                                                                                                                                           |
| Vertical placement  | Authored baselines are validated but are not emitted. The frame top plus exact line spacing place every paragraph: in DrawingML, paragraph k starts (k − 1) exact line steps below paragraph 1, which is where a one-line box whose frame top is (k − 1) line steps lower starts its line. Whether a renderer honors a fractional-point line step between paragraphs is C11 renderer evidence, not a C7 claim.                                                                                                                                                              |
| Numeric mapping     | One SVG unit is exactly 7620 EMU and one font unit maps exactly to hundredth-points. Values requiring implicit rounding/clamping fail as in C7 1.1.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Stable identity     | `p:cNvPr/@name` remains `src.<stable-id>`. Deterministic numeric IDs remain implementation details derived from stable IDs, never reconciliation authority.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Compiler identity   | The emitted compiler is exactly `office180-vector180-pptx-canary/0.1`. Package application/title/theme labels say Vector180.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Package lineage     | Custom properties are `vector180.compiler`, `vector180.resolvedSchema`, `vector180.activeTheme`, and `vector180.sourceSha256`. No `pptv.*` property appears in a canonical package.                                                                                                                                                                                                                                                                                                                                                                                         |
| OPC graph           | Content types, relationships, reachable parts, XML schemas, slide/master/layout/theme graph, STORE-only deterministic ZIP order/timestamps, and ZIP32 limits remain the exact C7 1.1 boundary.                                                                                                                                                                                                                                                                                                                                                                              |
| Text                | Authored line membership, text, baseline, font/style, no-wrap, and no-autofit remain explicit. No substitution, inferred wrap, repair, or source mutation occurs.                                                                                                                                                                                                                                                                                                                                                                                                           |
| Determinism         | Equal exact resolved input, compiler, and dependencies produce byte-identical package bytes across processes, time zones, and hosts within the checked environment.                                                                                                                                                                                                                                                                                                                                                                                                         |
| Claims              | Structural/compiler success is distinct from C8 text evidence, C11 renderer comparison, native open/save/reopen, representative edits, and human review.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Legacy artifacts    | Existing C7 1.1 PPTX bytes, custom properties, hashes, validation records, and evidence remain immutable and are validated only by the predecessor path.                                                                                                                                                                                                                                                                                                                                                                                                                    |

## Error Contracts

| Error                       | When                                                                                                                                            | Code                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Unresolved/invalid model    | Input lacks the exact canonical schema/hash/canvas/order invariants                                                                             | `VECTOR180-PPTX-UNRESOLVED`, `VECTOR180-PPTX-INVALID-MODEL`                |
| Unsupported object/geometry | Object, zero hard lines, hard lines without one shared anchor x or one exact line step, geometry, opacity, or transform lies outside the canary | `VECTOR180-PPTX-UNSUPPORTED-OBJECT`, `VECTOR180-PPTX-UNSUPPORTED-GEOMETRY` |
| Numeric mapping             | Geometry/font values do not map exactly                                                                                                         | `VECTOR180-PPTX-NON-INTEGRAL-EMU`, `VECTOR180-PPTX-NON-INTEGRAL-FONT`      |
| Identity                    | Deterministic native numeric IDs collide                                                                                                        | `VECTOR180-PPTX-ID-COLLISION`                                              |
| Package                     | OPC graph/XML/ZIP constraints fail                                                                                                              | `VECTOR180-PPTX-OPC-GRAPH`, `VECTOR180-PPTX-ZIP-LIMIT`                     |
| Family mismatch             | Legacy resolved or package lineage reaches the canonical compiler                                                                               | `VECTOR180-PPTX-FAMILY`                                                    |

## Dependencies

- Depends on: `CONTRACT:C6-PPTV-RESOLVED.2.0`.
- Depends on: `CONTRACT:C8-PPTV-TEXT-FIT.2.0` for separately requested text evidence.
- External: exact `jszip@3.10.1`; no OpenDocKit runtime dependency.

## Cross-references

- **Source docs:** `VECTOR180-IMPLEMENTATION-PLAN.md`, `SVG-TO-EDITABLE-PPTX.md`.

## Future evolution

- Per-line anchors (indentation carried by x), per-run styles, native bullets,
  and additional native objects require matched
  source/resolved/compiler/reconciliation/visual fixtures.
- Native PowerPoint open/save/reopen and C11 renderer comparison of
  multi-paragraph hard-line boxes are promotion evidence that 2.1 does not
  claim. A 2026-11-23 macOS Quick Look measurement found pixel-identical output
  against stacked one-line boxes for whole-point line steps (multiples of 5
  units) and a per-paragraph upward drift equal to the fractional point for
  other steps (28.8 pt advanced as 28 pt); native PowerPoint was not measured.
- C7 remains a canary; general atom compilation belongs to C9.

## Retirement / supersession plan

- **Predecessors:** `CONTRACT:C7-PPTX-CANARY.1.1` remains authority for
  historical PPTV packages. C7 2.0 is in Git history; 2.1 is the sole current
  C7 contract and reproduces every 2.0 package byte for byte.
- **Migration boundary:** regenerate from canonical Vector180 source; never
  rewrite lineage in an existing PPTX. A source that kept one text object per
  line for C7 2.0 stays valid; merging those objects into one multi-line object
  is an ordinary reviewed source edit, not an automatic rewrite.
- **Migration owner:** Vector180 PPTX compiler maintainer.

## Implementing Files

- `packages/vector180/src/node/pptx-canary.ts`
- `packages/vector180/src/cli.ts`

## Test Requirements

- [x] Exact canonical input/schema/custom-property/compiler IDs are enforced.
- [ ] Complete primitive, text, numeric, ID, OPC, XML-schema, and ZIP corpus passes.
- [x] Legacy resolved input and mixed lineage fail without an artifact.
- [x] Equal canonical input produces byte-identical PPTX in separate processes/time zones.
- [ ] Existing C7 1.1 artifacts remain byte-identical and independently valid.
- [x] Multi-line hard-line objects compile to one text box with one exact
      paragraph per line, including empty lines and all three anchors, and
      match stacked one-line boxes paragraph for paragraph.
- [x] Mixed anchors, irregular line steps, absent lines, and out-of-frame
      lines refuse without an artifact; one-line output stays byte-identical.
- [ ] Native PowerPoint lifecycle and C11 renderer comparison cover
      multi-paragraph hard-line boxes.

## Change History

| Version | Date       | Change                                                                                 | Migration                                                                                                          |
| ------- | ---------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1.1     | 2026-07-29 | Correct C7 text/geometry mapping and verify the PPTV canary                            | Superseded; historical package proof retained                                                                      |
| 2.0     | 2026-08-02 | Consume Vector180 resolved decks and emit Vector180 compiler/package lineage           | Regenerate from canonical source; do not relabel PPTX bytes                                                        |
| 2.1     | 2026-11-23 | Compile a multi-line hard-line text object to one text box with one paragraph per line | None required; one-line sources and packages are byte-identical, previously refused multi-line sources now compile |
