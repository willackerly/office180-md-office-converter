# Vector180 branded template bases

<!-- freshness: 2026-08-04 -->

**Status:** proposal and privacy-safe extraction playbook
**Audience:** template authors, agents, compiler implementers, and brand owners

## 1. Outcome

A branded PowerPoint should not become a second opaque template runtime inside
Vector180. The preferred reusable unit is a small set of content-free, fully
hydrated standalone `*.vector180.svg` basis atoms:

- title and body;
- two-column;
- centered section cover;
- title with a media slot;
- blank diagram canvas; and
- an optional dense appendix.

Each basis atom is normal Vector180 source. It directly carries concrete
geometry, palette, typography, stable IDs, and no private presentation
content. A derived atom records the exact basis-byte SHA-256 in
`templateLineage`; `styleFamily` remains only a convenient grouping hint.

This approach keeps ordinary authoring small, independently testable, and
compatible with the current atom-first toolchain. It avoids importing hundreds
of historical PowerPoint layouts or making a private deck the runtime source
of truth.

## 2. Evidence and privacy boundary

A privacy-bounded local audit of a matched board-deck PDF/PPTX pair confirmed
that a visually coherent presentation can still contain a large amount of
export history: near-duplicate masters and layouts, repeated media, embedded
font declarations, notes, and comments. Reproducing that package graph would
copy noise and confidential state rather than preserve the design system.

The reusable audit path may retain only approved aggregate structural
observations. It must not publish or persist:

- slide text, speaker notes, comments, authors, dates, or document properties;
- private filenames, paths, hashes, or screenshots;
- extracted logos, backgrounds, pictures, or other media;
- embedded font programs or font bytes harvested from the presentation; or
- a reconstructed master/layout package copied from the source.

Private source files and local comparison renders remain outside the repository.
Only newly authored, content-free atoms and explicitly approved brand inputs
may become fixtures.

## 3. Template-basis contract

No new package format is required for the first slice. Use the existing
standalone atom metadata:

```json
{
  "styleFamily": {
    "id": "example.board",
    "version": "1.0"
  },
  "templateLineage": {
    "generatorProfile": "office180.vector180.brand-template/0.1",
    "templateId": "example.board.title-body.v1",
    "templateSha256": "<sha256 of exact basis bytes>"
  }
}
```

The basis atom itself has no self-lineage. An instantiated atom contains the
lineage declaration above. Verification requires the caller to supply the
exact immutable basis bytes:

```bash
pnpm vector180 metadata-compare \
  derived.vector180.svg \
  sibling.vector180.svg \
  --template-basis bases/title-body.vector180.svg \
  --format json
```

An equal family name or a similar palette does not prove common ancestry.
`styleFamily.definitionSha256` should remain absent until one immutable
style-definition artifact and a verification path actually exist.

## 4. Stable identity

Basis atoms should use role-oriented IDs that remain meaningful after content
replacement. Prefix each instance role from the atom ID:

```text
<atom>.chrome.background
<atom>.title.text
<atom>.body.line.01
<atom>.footer.page
<atom>.media.slot
<atom>.diagram.node.01
<atom>.diagram.edge.01
```

Connectors bind stable `from` and `to` object IDs and retain explicit
endpoints. Template IDs and stable object IDs contain no board names, slide
content, user names, or source-package identifiers.

## 5. Geometry and visual tokens

Start from the common `0 0 1600 900` canvas when the reference deck is 16:9.
Capture only a small, reviewed set of reusable decisions:

- outer margins and title/body/footer bands;
- common column widths and gutters;
- concrete fill, stroke, and text colors;
- title, body, caption, and numeric typography;
- repeated node/connector grammar; and
- optional media-slot bounds without embedding media.

Rebuild flat backgrounds, bands, rules, and simple marks as native tokenized
geometry. Do not copy layout XML or rasterize a full slide into an opaque
background. Rare slide structures remain custom atoms rather than forcing
every historical layout into the basis set.

Current compiler-grade bases use the supported native primitive subset. A
rounded corner, arrowhead, raster resource, or opaque brand asset stays an
explicit counterexample until the relevant C9 source/compiler/reconciliation
surface accepts it. It is never silently downgraded.

## 6. Font policy

Font measurement and font licensing are separate gates.

Final Vector180 text-fit evidence continues to use the exact caller-supplied
`vector180-font-map/0.1`, digest-locked font bytes, and Fontkit shaping. There
is no host-font discovery, silent substitution, or family-name-only
certification.

For branded bases:

1. identify the smallest family/weight set actually used by the selected
   archetypes;
2. use canonical family names plus numeric weights, never synthetic family
   aliases such as `Example Light`;
3. acquire font bytes from an approved upstream or organization-owned font
   package with its license artifacts;
4. record exact digests in the font map and run `text-fit`;
5. treat substitution as preview-only and label it unverified; and
6. never extract or redistribute an embedded Office font merely because the
   package contains it.

A license-aware metadata/LUT package may provide an inexpensive early audit:
advance widths, kerning, units per em, ascender/descender, cap height, line
gap, codepoint coverage, and license tags. It cannot override final exact-byte
shaping or convert an unavailable font into verified evidence.

A future public fixture pack may contain a deliberately small OFL-only font
set with exact license files. Proprietary or organization-licensed faces
belong in a private overlay and remain caller supplied.

## 7. Brand assets

The first public basis fixtures should be logo-free. A media slot is explicit
geometry, not permission to recover media from a reference deck.

When a brand owner supplies an independently approved logo:

- prefer an exact vector source with documented redistribution rights;
- preserve it as one opaque, stable asset object when independent child
  editing is not required;
- keep a native-geometry alternative for simple backgrounds and rules; and
- require explicit source/compiler/reconciliation support before claiming the
  asset is editable in PowerPoint.

Embedded `data:` resources are outside strict Vector180 0.1. A future static
resource table needs dependency hashes, media type, capability declarations,
fallback behavior, and a separate contract.

## 8. Extraction workflow

The repeatable, privacy-safe workflow is:

1. inventory and hash the private reference pair locally;
2. inspect only package structure, master/theme/layout relationships, font
   declarations, media dimensions/hashes, and primitive counts;
3. independently inspect the rendered PDF for canvas size, font-use evidence,
   and image instances;
4. compute text-free structural fingerprints and cluster layout families;
5. have a human select four to six archetypes;
6. author new content-free atoms from reviewed geometry and tokens;
7. validate, resolve, run exact-font text-fit, and verify basis lineage;
8. compile only supported native objects;
9. compare private local renders without committing them; and
10. publish only approved synthetic fixtures and aggregate evidence.

The process derives a design system; it does not convert or sanitize the
private deck.

## 9. Acceptance fixtures

Build the reusable basis in increments:

1. A logo-free title/body basis plus one synthetic derived atom proving exact
   lineage and wrong-basis refusal.
2. Section-cover and two-column bases with C12 semantic-diff coverage.
3. A blank diagram basis using rectangles, ellipses, straight connectors,
   groups, stable IDs, and exact text-fit evidence.
4. Approved, digest-locked OFL typography with all required license files.
5. A synthetic asset counterexample proving the current C9 refusal.
6. A synthetic multi-atom deck/PPTX with browser and native-render evidence.
7. Negative tests for wrong template hash, wrong font hash, missing face,
   missing glyph, unsupported asset, and style-family-only false confidence.

Private paired visual review stays local and manual until the brand owner
explicitly approves a publishable fixture.

## 10. OpenDocKit boundary

OpenDocKit is useful here as an optional independent inspector, not a
Vector180 runtime dependency. A narrow upstream contribution could expose an
opt-in privacy-safe `inspectPresentationStructure` or layout-fingerprint API
that returns:

- counts and relationship graphs;
- deduplicated media hashes and dimensions;
- master/theme/layout fingerprints;
- embedded-font declaration and header metadata; and
- explicit evidence that text, notes, comments, authors, dates, and document
  properties were excluded.

Vector180 remains authoritative for source, template lineage, stable IDs,
semantic operations, compiler behavior, and reconciliation.

## 11. Promotion gate

A branded basis is reusable only when:

- every basis atom validates and resolves independently;
- every derived atom verifies against exact basis bytes;
- exact approved font bytes pass text-fit or remain explicitly unverified;
- unsupported native features refuse instead of flattening;
- source, compiler, map, reconciliation, and C12 diff agree;
- synthetic browser/PPTX evidence passes;
- private comparison material remains uncommitted; and
- the brand owner has approved every distributed name, token, font, and asset.

Until then it is a local design study, not a shipped template.
