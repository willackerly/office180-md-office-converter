# CONTRACT-C2-PROVENANCE.2.0

<!-- SUPERSEDES: CONTRACT-C2-PROVENANCE.1.0 -->

**Version:** 2.0
**Status:** in-progress
**Owner:** Will Ackerly
**Type:** Data Model
**Cross-repo Promotability:** No
**Source:** `ROADMAP.md` §7.2

## Why this exists

A source hash can detect drift, but it cannot reconstruct the Markdown version
that produced an edited DOCX. Baseline-aware reconciliation needs the generated
document to carry its own exact original and canonical Markdown merge bases,
without weakening the standard core-property breadcrumb defined by C2 1.0.

## Who needs this

- **`docx2md.py`** — verifies and extracts the embedded source before a
  three-way merge.
- **DOCX authors** — can return supported Word edits even when the original
  source branch has moved on.
- **Review and CI tooling** — can distinguish internally consistent, missing,
  stripped, and structurally contradictory provenance.

## Scenarios

### Scenario 1 — canonical merge base survives a package save

`md2docx` canonicalizes a supported source, stages the DOCX, and adds one
related custom XML item containing both the exact original UTF-8 bytes and the
exact canonical bytes. A package reopen/save retains the item. `docx2md`
checks the graph, deterministic identity, core breadcrumb, canonicalization
relation, and both full SHA-256 values before returning either string.

### Scenario 2 — custom XML is stripped

A third-party editor removes custom XML. Style-driven inversion may still
produce supported Markdown, but the fidelity report says the merge base is
missing and baseline-aware merge refuses. It never substitutes the truncated
core-property hash for the missing bytes.

### Scenario 3 — embedded bytes are changed

The custom XML payload, digest, deterministic identity, relationship, or core
breadcrumb is modified without updating every bound field. Extraction refuses
with `DOCX-ROUNDTRIP-PROVENANCE`; it does not return contradictory merge input.

## Interfaces

```python
def embed_source_snapshot(
    docx_path: str | Path,
    original_bytes: bytes,
    canonical_text: str,
) -> dict:
    """Atomically add one related, hash-bound custom XML source item."""

@dataclass(frozen=True)
class EmbeddedSourceSnapshot:
    schema: str
    part: str
    original_text: str
    canonical_text: str
    original_sha256: str
    canonical_sha256: str

def read_embedded_source(
    docx_path: str | Path,
    required: bool = False,
) -> EmbeddedSourceSnapshot | None:
    """Check and return one package-internally-consistent source item."""
```

## Behavioral Contracts

| Behavior | Specification |
|----------|---------------|
| C2 1.0 compatibility | The five-key compact core-property JSON, subject, keywords, category, timestamp, and 16-hex hashes remain unchanged. |
| Custom XML schema | Root namespace `urn:office180:md-source:0.1`, `schema="office180-md-source/0.1"`, and `encoding="utf-8"`. |
| Payloads | `original` contains the exact source-file bytes; `canonical` contains the exact supported canonical Markdown used to build the Word body. Both are standard base64 text. |
| Digests | `originalSha256` and `canonicalSha256` are full lowercase 64-hex SHA-256 digests over the decoded bytes. The core `srcsha` must be present, well-formed, and equal the first 16 hex characters of `originalSha256`. |
| Canonical relation | The canonical text is idempotent under C3 and exactly equals `canonicalize_markdown(decoded original UTF-8)`. The public writer refuses a mismatch before ZIP mutation, and the reader independently rechecks the relation. A digest-valid but unrelated replacement refuses. |
| OPC graph | The item is related internally from `word/document.xml`, has exactly one internally related custom-XML-properties part, and has unambiguous XML/custom-properties content types. Relationship IDs and content-type part names are unique. External targets, ambiguous declarations, and graph contradictions refuse. Existing unrelated bibliography/custom XML items are preserved. |
| Allocation | The writer chooses the next unused `customXml/itemN.xml`, related properties names, and next unused document relationship ID. A collision refuses. |
| Item identity | The datastore item UUID is recomputed and required to equal UUIDv5 over schema plus both full digests. It is package identity, not external merge authority. |
| Limits | Each decoded Markdown payload is at most 8 MiB; package inspection is capped at 10,000 parts and 256 MiB uncompressed. Duplicate, encrypted, absolute, traversal, or backslash part names refuse. |
| Atomic write | Embedding writes a same-directory temporary ZIP, validates its ZIP structure, reopens it through the public C2 semantic reader, verifies the exact new item and both digests, and only then atomically replaces the just-generated DOCX. Failure leaves no partial replacement. |
| Extraction | A missing item returns `None` only when `required=False`. More than one office180 item, malformed relationships/XML/base64/UTF-8, missing properties, non-deterministic identity, canonical/core mismatch, or any hash contradiction refuses. Encoded size is bounded before base64 allocation. |
| Trust boundary | All bindings above live in the same mutable package. They establish internal consistency and detect corruption or uncoordinated edits; they do not authenticate authorship against a party able to rewrite the DOCX. A caller-pinned digest, signature, or external trust store is required before using authenticated/externally verified terminology. |
| Privacy | The embedded item contains source content and hashes, but no additional absolute path, username, hostname, or environment identity. C2 1.0's core subject remains the legacy resolved-absolute-source-path field; changing that separate, documented compatibility behavior requires an explicit privacy migration. |
| No implicit merge | Reading provenance never mutates source or DOCX and never initiates reconciliation. |

## Error Contracts

| Error | When | Code |
|-------|------|------|
| Invalid/internally inconsistent package or item | OPC graph, XML, base64, UTF-8, limits, identity, canonical relation, core binding, or digests fail | `DOCX-ROUNDTRIP-PROVENANCE` or `DOCX-ROUNDTRIP-PACKAGE` |
| Required base absent | No related office180 custom XML item exists | `DOCX-ROUNDTRIP-NO-MERGE-BASE` |
| Core contradiction | C2 1.0 `srcsha` differs from the embedded original digest prefix | `DOCX-ROUNDTRIP-PROVENANCE` |

## Dependencies

- Supersedes and preserves: `CONTRACT:C2-PROVENANCE.1.0`
- Depends on: `CONTRACT:C3-ROUNDTRIP.1.1` for canonical Markdown
- External: Python standard-library ZIP, XML, base64, UUID, and hashing

## Cross-references

- **Source docs:** `ROADMAP.md` §§7.2–7.5

## Future evolution

- Google Docs may strip custom XML; an external content-addressed merge-base
  store can use the core hash but must be a separate explicit trust boundary.
- Per-block source maps, table captions, and content controls are additive
  successor work and cannot reinterpret these whole-source payloads.

## Retirement / supersession plan

C2 1.0 remains the compatibility contract for core properties. Writers that
claim C2 2.0 implement both; readers may degrade to C2 1.0 informational
provenance only when the custom item is missing.

## Implementing Files

- `md2docx.py` — `embed_source_snapshot()` and retained core stamp
- `docx2md.py` — `read_embedded_source()`
- `tests/test_roundtrip.py`

## Test Requirements

- [x] Original and canonical bytes/digests round-trip from a generated DOCX
- [x] Existing custom XML parts remain intact and the new OPC graph is complete
- [x] Independent `python-docx` reopen/save preserves the internally consistent item
- [x] Payload/digest, UUID, canonical relation, core, and relationship contradictions refuse
- [x] The staged writer output passes the public semantic reader and binds the exact new item/digests before replacement
- [x] Missing required base and package limits refuse
- [ ] Native Word open, non-empty save, reopen, and internally consistent item persistence
- [ ] Google Docs loss is recorded as missing rather than internally consistent

## Change History

| Version | Date | Change | Migration |
|---------|------|--------|-----------|
| 2.0 | 2026-08-01 | Add full embedded original/canonical merge bases and strict OPC verification | C2 1.0 readers retain informational core properties; baseline-aware merge requires 2.0 |
