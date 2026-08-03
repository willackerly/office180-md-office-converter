# CONTRACT-C9-PPTV-PPTX-BASELINE.2.0

<!-- SUPERSEDES: CONTRACT-C9-PPTV-PPTX-BASELINE.1.0 -->

**Version:** 2.0
**Status:** in-progress
**Owner:** Will Ackerly
**Type:** Component
**Cross-repo Promotability:** No
**Source:** `VECTOR180-IMPLEMENTATION-PLAN.md` Milestones 3–4 and `SVG-TO-EDITABLE-PPTX.md` §§2–8

## Why this exists

A canonical Vector180 atom needs an explicit, deterministic bridge to editable
PowerPoint without becoming HTML source first. C9 2.0 binds the supported
native baseline, composition artifact, sidecar map, and PPTX lineage to exact
Vector180 source and keeps every historical PPTV chain independently
verifiable.

## Who needs this

- **Vector180 authors** — need direct supported atom-to-PPTX export.
- **C10 reconciliation** — needs complete source/object/composition baselines.
- **C11 reviewers** — need exact source, map, package, renderer, and environment identities.
- **Agents** — need rich capability refusals rather than a silent flattening fallback.

## Scenarios

### Scenario 1 — compile one atom directly

An author supplies a canonical atom and explicit widescreen target rectangle.
C9 applies identity or one aspect-preserving uniform scale plus translation,
emits native objects, and publishes a paired PPTX and
`vector180-pptx-map/0.1` bound to exact source/composition/package hashes.

### Scenario 2 — bind lineage without trusting it as layout

The atom contains template/hydration metadata. C9 records its exact source and
metadata hashes in the map; it never copies atom metadata into generated deck
source or lets it choose placement, style, identity, or native capability.

### Scenario 3 — reject an old chain on the new path

A legacy atom, `pptv-pptx-map/0.1`, or PPTX carrying `pptv.*` custom properties
reaches canonical compilation. C9 refuses and directs the caller to explicit
source migration; existing predecessor artifacts remain untouched.

## Interfaces

```ts
interface Vector180Placement {
  readonly slideId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly policy: "identity" | "uniform-scale-translate";
}

interface Vector180PptxMap {
  readonly schema: "vector180-pptx-map/0.1";
  readonly source: {
    readonly family: "vector180";
    readonly kind: "atom";
    readonly id: string;
    readonly sha256: string;
    readonly profile: "0.1";
    readonly metadataSha256?: string;
  };
  readonly compiler: "office180-vector180-pptx-baseline/0.1";
  readonly sourceResolvedSchema: "vector180-resolved-atom/0.1";
  readonly resolvedSchema: "vector180-resolved-deck/0.1";
  readonly composition: Vector180CompositionMap;
  readonly slides: readonly Vector180PptxMapSlide[];
}

function compileVector180PptxBaseline(
  atom: Vector180Atom,
  options: { readonly placement: Vector180Placement },
): Promise<Vector180PptxBaselineArtifact>;
```

Related identifiers are:

- `vector180-composition/0.1`
- `vector180-compose-result/0.1`
- `vector180-pptx-baseline/0.1`
- `vector180-pptx-baseline-result/0.1`
- compiler `office180-vector180-pptx-baseline/0.1`

## Behavioral Contracts

| Behavior                | Specification                                                                                                                                                                                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accepted source         | The implemented slice accepts one complete error-free canonical C4 2.0 atom that resolves through C6 2.0. Legacy source and canonical HTML deck input remain refused.                                                                                                                    |
| Direct atom path        | The atom stays persistent authority. Optional generated one-slide `.vector180.html` is a deterministic derived aggregation, not canonical source or a required intermediate authoring form.                                                                                              |
| Placement               | Target rectangle/policy is explicit. Identity requires equal source/target extents after origin translation. Uniform placement uses one finite positive scale and translation with exact aspect agreement. Stretch, crop, letterbox, per-axis scaling, and physical-size inference fail. |
| Native subset           | Plain rectangles, circles/ellipses, straight connectors, nondegenerate translated groups, and one explicit hard line per text object retain the exact C9 1.0 capability. Unsupported content emits no partial artifact.                                                                  |
| Style/text              | Concrete supported paint/stroke/opacity/font/anchor values, authored text, hard-line membership, no wrap, and no autofit remain exact. No substitution, repair, or source mutation occurs.                                                                                               |
| Stable identity         | Every emitted native object remains named `src.<stable-id>`; deterministic numeric Office IDs never become reconciliation authority.                                                                                                                                                     |
| Composition declaration | Generated deck manifest extension `office180.vector180Composition` has schema `vector180-composition/0.1` and records atom hash, placement, scale, and translation. It selects the exact digest-locked `vector180-browser/0.1` runtime.                                                  |
| Metadata                | Map records the source atom's `metadataSha256` when present. Generated deck source does not copy the atom metadata element: atom metadata is atom-only C4 authority, while exact atom/map hashes retain its provenance. Metadata never controls composition or native output.            |
| Source map              | Map is complete, deterministic, JSON-safe, and one-to-one with emitted objects. It binds exact atom, metadata digest when present, composed-deck hash, placement/capability, final PPTX bytes, and every baseline semantic value.                                                        |
| Package lineage         | Custom properties use only `vector180.compiler`, `vector180.resolvedSchema`, `vector180.sourceSha256`, `vector180.atomSha256`, `vector180.mapSchema`, `vector180.placement`, `vector180.sourceId`, `vector180.sourceKind`, and `vector180.sourceResolvedSchema`.                         |
| Determinism             | Equal exact atom, metadata, placement, compiler, runtime, and dependencies produce byte-identical composition, map, and PPTX across processes/time zones.                                                                                                                                |
| Atomic publication      | Library returns bytes/text. CLI writes explicit no-overwrite destinations atomically and never publishes a map without its exact PPTX peer.                                                                                                                                              |
| Legacy chains           | C9 1.0 maps, composed HTML, PPTX custom properties, package bytes, and evidence remain immutable. They are never upgraded by editing JSON/XML labels.                                                                                                                                    |
| Claims                  | Structural success remains distinct from native Office editing, C8 metrics, C11 comparison, and checked human review.                                                                                                                                                                    |

## Error Contracts

| Error                 | When                                                                         | Code                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Invalid/family source | C4/C6 source is incomplete, unresolved, legacy, or wrong kind                | `VECTOR180-BASELINE-INVALID-SOURCE`, `VECTOR180-BASELINE-FAMILY`                                     |
| Placement             | Placement is missing, invalid, unsafe, out of slide, or aspect-incompatible  | `VECTOR180-BASELINE-PLACEMENT-REQUIRED`, `VECTOR180-BASELINE-PLACEMENT`, `VECTOR180-BASELINE-ASPECT` |
| Capability            | Object/style/text/transform/asset/resource lies outside the subset           | `VECTOR180-BASELINE-UNSUPPORTED`                                                                     |
| Identity/map          | Stable/native identity collides or source/resolved/emitted inventory differs | `VECTOR180-BASELINE-IDENTITY`, `VECTOR180-BASELINE-MAP`                                              |
| Package               | OPC part/relationship/content-type/XML/ZIP validation fails                  | `VECTOR180-BASELINE-OPC`                                                                             |
| Destination           | Requested output already exists or paired atomic publication cannot complete | `VECTOR180-BASELINE-EXISTS`                                                                          |

Every failure returns no partial composition, map, or PPTX.

## Dependencies

- Depends on: `CONTRACT:C4-PPTV-SOURCE.2.0`.
- Depends on: `CONTRACT:C6-PPTV-RESOLVED.2.0`.
- Depends on: `CONTRACT:C7-PPTX-CANARY.2.0`.
- Depends on: `CONTRACT:C8-PPTV-TEXT-FIT.2.0` when text evidence is requested.
- Cross-checks: `CONTRACT:C11-OFFICE-VISUAL-EVIDENCE.1.2` supplies promotion evidence and is not a compiler dependency.
- External: exact `jszip@3.10.1` and digest-locked `vector180-browser/0.1`.

## Cross-references

- **Source docs:** `VECTOR180-PROFILE.md`, `VECTOR180-IMPLEMENTATION-PLAN.md`, `SVG-TO-EDITABLE-PPTX.md`.

## Future evolution

- Deck input, multiline hard lines, atomic SVG/raster media, rounded
  rectangles, opacity, arrowheads, additional ratios, and the banked 0.1.1
  text profile require matched successor contracts and reverse/visual fixtures.

## Retirement / supersession plan

- **Predecessor:** `CONTRACT:C9-PPTV-PPTX-BASELINE.1.0` remains authority for existing PPTV maps/packages.
- **Migration boundary:** migrate canonical source and regenerate a fresh Vector180 chain; never rewrite old map or PPTX lineage.
- **Migration owner:** Vector180 PPTX baseline maintainer.

## Implementing Files

- `packages/vector180/src/node/pptx-baseline.ts`
- `packages/vector180/src/node/pptx-canary.ts`
- `packages/vector180/src/node/io.ts`
- `packages/vector180/src/cli.ts`

## Test Requirements

- [x] Identity/uniform placement, non-zero origins, aspect refusal, and explicit target bounds pass.
- [x] Canonical composition/map/PPTX use only Vector180 IDs and exact hashes.
- [ ] Metadata is preserved inertly and cannot affect output semantics.
- [x] Map/source/resolved/emitted/PPTX inventory is complete and deterministic.
- [ ] Legacy/mixed chains refuse without modifying historical artifacts.
- [ ] OPC, independent reopen, native lifecycle, and C11 promotion gates remain distinct and checked.

## Change History

| Version | Date       | Change                                                                           | Migration                                        |
| ------- | ---------- | -------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1.0     | 2026-08-01 | Add bounded PPTV atom composition, map, and editable-PPTX baseline               | Superseded; historical chain retained            |
| 2.0     | 2026-08-02 | Bind direct atom compilation, composition, map, and package lineage to Vector180 | Migrate source and regenerate the complete chain |
