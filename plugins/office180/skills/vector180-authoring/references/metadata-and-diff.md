# Metadata, comparison, and legacy migration

Use this reference when identifying a template/style family, comparing
revisions, grouping a suite of assets, or converting legacy PPTV source.

## Metadata is evidence

A canonical atom may carry zero or one recognized direct child:

```xml
<metadata data-vector180-metadata="vector180-atom-metadata/0.1">
{"hydration":{...},"templateLineage":{...},"styleFamily":{...}}
</metadata>
```

The payload is compact canonical JSON with duplicate keys rejected, bounded
size/depth, strict known properties, bounded ASCII identifiers, and lowercase
SHA-256 values. It contains no paths, URLs, hostnames, prose instructions,
commands, authors, or external-resolution hooks.

The optional sections have different strength:

- `hydration` records immediate tool-generated origin such as extraction
  method, source deck hash, exact slide-root hash, slide ID, and active theme.
- `templateLineage` records a generator profile, logical template ID, and the
  SHA-256 of exact immutable input template-basis bytes that tooling actually
  consumed before instantiation.
- `styleFamily` is only a declared grouping hint.

The source hash covers the metadata element. A canonical metadata hash covers
the parsed canonical JSON. A basis artifact cannot self-certify its own hash,
and the hash is never computed from an output atom or from bytes with the
metadata field selectively removed. A trusted catalog/sidecar may bind the
separate basis. Two equal claimed hashes remain assertions until those exact
bytes are supplied and independently hashed. If tooling did not consume a
verifiable basis, omit `templateLineage`; never infer it from a filename,
comment, object IDs, or visual resemblance.

A derived `stylePaletteSha256` may compare sorted resolved visual tuples while
excluding IDs, geometry, text, painter order, provenance, groups, and text
anchor. It is comparison evidence, not persistent styling authority.

## Inspect or group assets

```bash
pnpm vector180 metadata first.vector180.svg --format json
pnpm vector180 metadata-compare first.vector180.svg second.vector180.svg \
  --format json
pnpm vector180 metadata-compare first.vector180.svg second.vector180.svg \
  --template-basis templates/card-basis.svg --format json
```

Without independently supplied basis bytes, equal template declarations are
`matching-asserted-template`. With exact basis bytes that hash to both
declarations, the result may be `exact-verified-template`. A supplied mismatch
is `insufficient-evidence` with a verification diagnostic; it does not prove
the atoms use different templates.

Retain the tool's distinction among:

- exact verified template match;
- matching asserted template lineage;
- matching declared style family;
- matching derived style palette;
- different evidence;
- insufficient evidence; and
- malformed or unsupported metadata.

Never collapse those into a boolean `sameTemplate`.

## Compare source semantics

Use the stable-ID-aware source diff instead of starting with raw XML:

```bash
pnpm vector180 diff before.vector180.svg after.vector180.svg \
  --format json
```

Inspect root/viewBox, metadata, added/deleted IDs, parent/painter order,
role/export, hard-line text, connector references, resolved geometry/style,
and opaque-subtree hashes. A valid `changed` result is successful comparison,
not a command failure. The diff is evidence only; it never manufactures a
patch.

Use raw text diff afterward to review exact lexical edits and preservation
boundaries. Use `reconcile`, not source diff, for a mapped PPTX branch.

## Migrate legacy PPTV

Legacy sources remain valid inputs to bounded readers but are not canonical
Vector180 source. Never perform a search/replace or suffix-only rename.

```bash
pnpm vector180 migrate legacy.pptv.svg \
  --output migrated.vector180.svg \
  --report migration.json --format json
```

Require the report to bind both hashes, record every recognized vocabulary
change, reload and resolve the new source, and compare normalized semantics.
Reject mixed namespaces. Preserve stable object IDs and painter order.

Legacy exact-source edits remain legacy. Migration invalidates source-bound
patches, maps, PPTX custom lineage, and reconciliation reviews; compile a new
branch from the migrated atom.
