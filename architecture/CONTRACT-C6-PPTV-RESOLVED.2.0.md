# CONTRACT-C6-PPTV-RESOLVED.2.0

<!-- SUPERSEDES: CONTRACT-C6-PPTV-RESOLVED.1.1 -->

**Version:** 2.0
**Status:** in-progress
**Owner:** Will Ackerly
**Type:** Data Model
**Cross-repo Promotability:** Yes — OpenDocKit may adopt the normalized geometry, style, provenance, and explicit-line model
**Source:** `VECTOR180-IMPLEMENTATION-PLAN.md` §§2–3 and `VECTOR180-DESIGN-INDEX.md` §4.17

## Why this exists

C4 identifies exact Vector180 source but does not provide compiler-grade
geometry/style/text or safe deck-slide hydration. C6 2.0 carries the existing
resolved semantics into destination-neutral atom/deck schemas, exposes inert
lineage separately from rendering, and derives comparison fingerprints rather
than persisting visual guesses.

## Who needs this

- **Editors and compilers** — need one deterministic browser-independent model.
- **Agents** — need cheap exact template identity and derived style comparison.
- **Extraction** — needs a complete dereference from deck CSS/theme authority into a standalone atom.
- **C8, C9, and C12** — need normalized text, geometry, style, relationships, and order.

## Scenarios

### Scenario 1 — resolve a standalone atom

A canonical atom with arbitrary finite positive `viewBox`, local concrete
styles, explicit frames, and hard lines resolves as
`vector180-resolved-atom/0.1`. No physical size or slide identity is inferred.

### Scenario 2 — compare template and style identity

Two atoms declare identical `templateLineage`. C6 reports the same canonical
metadata digest, but labels verification separately from assertion. It derives
a palette digest from current resolved styles so stale source metadata cannot
override actual appearance.

### Scenario 3 — hydrate one legacy or canonical deck slide

Extraction resolves the selected slide and active theme, removes deck-only
authority, emits only canonical Vector180 controls and local concrete style,
records immediate hydration metadata, then independently reloads/resolves the
new atom before exposing bytes.

## Interfaces

```ts
interface Vector180ResolvedAtom {
  readonly schema: "vector180-resolved-atom/0.1";
  readonly sourceWireFamily: "vector180" | "pptv-legacy";
  readonly sourceSha256: string;
  readonly atomId: string;
  readonly metadata?: Vector180MetadataProjection;
  readonly stylePaletteSha256: string;
  readonly canvas: {
    readonly viewBox: readonly [number, number, number, number];
  };
  readonly objects: readonly Vector180ResolvedAtomObject[];
}

interface Vector180ResolvedDeck {
  readonly schema: "vector180-resolved-deck/0.1";
  readonly sourceWireFamily: "vector180" | "pptv-legacy";
  readonly sourceSha256: string;
  readonly activeTheme: string;
  readonly canvas: {
    readonly viewBox: readonly [0, 0, 1600, 900];
    readonly widthEmu: 12_192_000;
    readonly heightEmu: 6_858_000;
    readonly emuPerUnit: 7_620;
  };
  readonly slides: readonly Vector180ResolvedSlide[];
}

interface Vector180HydrationProvenance {
  readonly method: "vector180-slide-hydration/0.1";
  readonly sourceWireFamily: "vector180" | "pptv-legacy";
  readonly sourceSha256: string;
  readonly sourceObjectId: string;
  readonly sourceObjectSha256: string;
  readonly activeThemeId: string;
}

type Vector180MetadataComparisonClassification =
  | "exact-verified-template"
  | "matching-asserted-template"
  | "matching-declared-style-family"
  | "matching-derived-style-palette"
  | "different"
  | "insufficient-evidence";

function resolveVector180Atom(atom: Vector180Atom): Vector180ResolvedAtomResult;
function resolveVector180Deck(deck: Vector180Deck): Vector180ResolvedDeckResult;
function extractVector180Atom(
  deck: Vector180Deck,
  slideId: string,
): Promise<Vector180AtomExtractionResult>;

function projectAtomMetadata(
  atom: Vector180Atom,
): Promise<Vector180MetadataInspection>;

function compareAtomMetadata(
  left: Vector180Atom,
  right: Vector180Atom,
  options?: { readonly templateBasisBytes?: Uint8Array },
): Promise<Vector180MetadataComparison>;
```

Metadata helper results use
`vector180-atom-metadata-inspection/0.1` and
`vector180-atom-metadata-comparison/0.1`.

## Behavioral Contracts

| Behavior                | Specification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current read schemas    | Atom and deck results use only `vector180-resolved-atom/0.1` and `vector180-resolved-deck/0.1` and always carry exact `sourceWireFamily`. A schema discriminator never coerces one source kind or family into another.                                                                                                                                                                                                                                                                                                                                                      |
| Legacy reads            | Valid legacy source may resolve into the current destination-neutral read model for inspection/C12 only, preserving `sourceWireFamily: "pptv-legacy"` and exact source hash. C8–C10 canonical writers require `vector180` except extraction, which is the explicit one-way read-derived hydration path. Historical `pptv-resolved*` JSON remains frozen evidence and is never relabeled.                                                                                                                                                                                    |
| Existing resolved model | Finite geometry, strict object/export pairs, group translation, world/local bounds, DOM painter order, explicit connector references, hard text lines, exact frames, no wrap/autofit, supported paint/typography, and style provenance from C6 1.1 remain behaviorally unchanged under canonical attribute names.                                                                                                                                                                                                                                                           |
| Atom canvas             | Atom `viewBox` retains arbitrary finite origin/dimensions/aspect ratio. No EMU, inch, point, DPI, slide-size, or default physical mapping is inferred.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Deck canvas             | Deck slides remain exactly `0 0 1600 900` and map one SVG unit to 7620 EMU. Another ratio remains outside this profile.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Canonical styling       | Atoms accept only defaults, supported `data-vector180-*` controls, presentation attributes, and local inline declarations. Deck themes use complete `--vector180-*` token sets.                                                                                                                                                                                                                                                                                                                                                                                             |
| Metadata separation     | Parsed metadata and `metadataSha256` are projected adjacent to the resolved model but never participate in style/geometry/text/identity resolution. Invalid recognized metadata prevents a model through C4.                                                                                                                                                                                                                                                                                                                                                                |
| Template comparison     | `templateLineage` equality compares generator profile, template ID, and lowercase SHA-256 of the immutable input template-basis artifact exactly. It never hashes the current atom. Equal declarations with no basis input classify `matching-asserted-template`. When the caller supplies exact `templateBasisBytes` and their SHA-256 matches both equal declarations, classification is `exact-verified-template`. Supplied bytes that fail either declaration produce `insufficient-evidence` plus `VECTOR180-METADATA-VERIFICATION`, never a false `different` result. |
| Basis input boundary    | Basis verification accepts at most 8 MiB of bytes in memory, copies them before asynchronous work, and hashes that immutable snapshot. C6 performs no path, package, host, network, template registry, or system discovery and never stores the supplied basis bytes in source, projections, or comparison output.                                                                                                                                                                                                                                                          |
| Palette derivation      | For each non-group visual object, form the JSON array `[kind,fill,stroke,strokeWidth,opacity,fontFamilyOrNull,fontSizeOrNull,fontWeightOrNull,fontStyleOrNull]` from C6 canonical values. Deduplicate byte-equal compact arrays, sort their compact UTF-8 JSON byte strings lexicographically, compact-serialize the containing array, and SHA-256 those bytes as `stylePaletteSha256`. IDs, geometry, text, order, source provenance, group containers, and text anchor are excluded. The digest is derived evidence, never written into source.                           |
| Hydration output        | `vector180 extract legacy.pptv.html --slide ID --output OUT.vector180.svg` is the explicit read-derived legacy-deck migration path. Extraction always emits a new `*.vector180.svg`, even from a legacy deck; it never writes, relabels, or serializes the input deck. It preserves IDs/hierarchy/order/geometry/hard lines/assets, materializes supported style, removes deck-only classes/layout, and uses canonical controls/discovery comment.                                                                                                                          |
| Hydration metadata      | Because C4 atom metadata is not deck syntax, extraction authors exactly one fresh `hydration` section with current method/source hashes/slide/theme. It does not infer or copy template/style lineage from deck content, classes, manifest extensions, or visual similarity.                                                                                                                                                                                                                                                                                                |
| Root-slice hash         | `sourceObjectSha256` hashes the exact selected source root-SVG bytes before hydration; it is distinct from the deck hash and emitted atom hash.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Candidate proof         | Extraction exposes no bytes unless the candidate independently passes C4/C6 2.0 as canonical source. It never wraps, reflows, measures, substitutes fonts, or silently drops an unresolved dependency.                                                                                                                                                                                                                                                                                                                                                                      |
| Determinism             | Equal exact source, selected slide, active theme, registered runtime/profile, and dependencies yield equal resolved JSON, metadata digest, palette digest, and hydrated atom bytes in Node and browser.                                                                                                                                                                                                                                                                                                                                                                     |

## Error Contracts

| Error                 | When                                                                              | Code                                                                                        |
| --------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Invalid source/family | C4 source is incomplete, mixed, ambiguous, or disallowed for the requested output | `VECTOR180-RESOLVED-INVALID-SOURCE`                                                         |
| Canvas/geometry       | Canvas, numeric value, transform, bounds, or object kind lies outside the profile | `VECTOR180-PROFILE-VIEWBOX`, `VECTOR180-PROFILE-GEOMETRY`, `VECTOR180-PROFILE-TRANSFORM`    |
| Style/resource        | CSS/token/property/font/paint/resource behavior is unsupported or unresolved      | `VECTOR180-PROFILE-STYLE`, `VECTOR180-PROFILE-FONT`, `VECTOR180-PROFILE-RESOURCE`           |
| Text                  | Frame, baseline, hard-line, richness, or anchor state is invalid                  | `VECTOR180-PROFILE-TEXT`                                                                    |
| Metadata comparison   | Claimed verification bytes do not match declared template/style hashes            | `VECTOR180-METADATA-VERIFICATION`                                                           |
| Hydration source      | Deck/slide/theme is missing, incomplete, or unresolved                            | `VECTOR180-EXTRACT-INVALID-BASE`, `VECTOR180-EXTRACT-SLIDE`, `VECTOR180-EXTRACT-UNRESOLVED` |
| Hydration candidate   | Canonical candidate fails C4/C6 reload or retains unresolved authority            | `VECTOR180-EXTRACT-INVALID-CANDIDATE`                                                       |

Any C4 error/fatal or any C6 error prevents a model. Warnings may accompany a
complete immutable model.

## Dependencies

- Depends on: `CONTRACT:C4-PPTV-SOURCE.2.0`.
- Cross-checks: `CONTRACT:C8-PPTV-TEXT-FIT.2.0` defines optional separate measurement evidence and is not a resolver dependency.
- Schema: `schemas/vector180-atom-metadata-0.1.schema.json`.
- External parser/build dependencies remain pinned as in C6 1.1.

## Cross-references

- **Source docs:** `VECTOR180-PROFILE.md`, `VECTOR180-PROCESSING-API.md`, `VECTOR180-IMPLEMENTATION-PLAN.md`.

## Future evolution

- Paragraph intent, reliable/editable PPTX frame policy, raster resources,
  additional transforms, and other physical deck ratios require successor
  source/resolved contracts and fixtures.

## Retirement / supersession plan

- **Predecessor:** `CONTRACT:C6-PPTV-RESOLVED.1.1` remains frozen for legacy PPTV result schemas.
- **Migration boundary:** canonical consumers adopt atom/deck-specific Vector180 schemas; never relabel historical resolved evidence.
- **Migration owner:** Vector180 resolver maintainer.

## Implementing Files

- `packages/vector180/src/core/resolved.ts`
- `packages/vector180/src/core/styles.ts`
- `packages/vector180/src/core/extract.ts`
- `packages/vector180/src/browser/runtime.ts`
- `packages/vector180/src/ops/projections.ts`

## Test Requirements

- [x] Canonical atom/deck corpus resolves under the new schemas in Node and all checked browsers.
- [ ] Legacy results retain exact family/hash and never enter canonical writers implicitly.
- [ ] Metadata parsing/projection/hash/verification and palette derivation are deterministic.
- [ ] Equal asserted lineage, exact supplied-basis verification, mismatched
      basis refusal, and no-discovery behavior have distinct fixtures.
- [ ] Hydration from both dialects emits canonical independently reloadable atoms.
- [x] Existing finite geometry, style, group, relationship, order, asset, and explicit-text refusals remain covered.

## Change History

| Version | Date       | Change                                                                                                                | Migration                                        |
| ------- | ---------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1.1     | 2026-07-30 | Add PPTV standalone-diagram resolved profile and hydration                                                            | Superseded; retained for legacy evidence         |
| 2.0     | 2026-08-02 | Add Vector180 atom/deck resolved schemas, inert lineage projection, derived palette identity, and canonical hydration | Adopt new schemas; do not rewrite legacy results |
