# DOCX round-trip evidence

This isolated C2/C3/C11 fixture is generated from the public kitchen-sink
Markdown profile. The source used for both DOCX generations is staged beneath
`/private/tmp/office180-evidence/source/`, keeping the legacy C2 absolute
subject free of workstation account paths.

## Reproduce and verify

The generator refuses any existing destination:

```bash
.venv/bin/python scripts/generate-docx-roundtrip-evidence.py \
  --destination tests/fixtures/roundtrip-evidence/docx
```

Validate each C11 envelope with:

```bash
for manifest in tests/fixtures/roundtrip-evidence/docx/*.evidence.json; do
  .venv/bin/python scripts/visual-evidence.py validate "$manifest" \
    --root tests/fixtures/roundtrip-evidence/docx
done
```

From this directory, verify all durable file hashes with:

```bash
shasum -a 256 -c SHA256SUMS
```

## Automated observations

- Canonical, plain-text-edited, and regenerated DOCX files passed the same
  Quick Look Office-generator capture profile.
- Canonical versus edited comparison found
  `7270` changed pixels with exact bounds
  `[222, 238, 790, 19]`. Those bounds are contained by
  the declared paragraph crop `[170, 220, 900, 60]`; a zero change or any
  escaped pixel fails generation.
- Edited versus regenerated preview comparison passed with
  `0` changed pixels, changed fraction
  `0.0`, mean absolute error
  `0.0`, and maximum channel delta
  `0`.
- Native Word state is `manual-required`: Native Microsoft Word open, representative edit, save, and reopen were not automated by this generator; manual lifecycle validation remains required.
- The final privacy pass covers every durable file, every uncompressed DOCX
  member, both fixed temporary Markdown sources, account/home/host tokens,
  high-confidence credential patterns, and sensitive environment values.

## Exact artifact hashes

| Artifact | SHA-256 | Bytes |
|----------|---------|------:|
| `generation-manifest.json` | `2b24a653e05d5e288295a1870c75a53599456f9335d1fad4076f8a43aef6efb6` | 6428 |
| `supported-canonical-vs-edited.comparison.evidence.json` | `0ff1e7a731da969b5b6f8450ab8a720c2cd111e7350dd13ceecdcc5ca1c75c0a` | 3482 |
| `supported-canonical.docx` | `d5dc28d3a48f2a20a0f064dd2057b50d4634116493e21d99f4ad1211ead3b5c8` | 41072 |
| `supported-canonical.md` | `f4bc912013a84b1cacc449a84293f66f561bc258ee344f89c3a38a51b6cccb48` | 1144 |
| `supported-canonical.quicklook.evidence.json` | `5315ec4ab25e5c92b531dad37740528c8c1999347b85dd8fb8a3122b92fda5cd` | 1894 |
| `supported-canonical.quicklook.png` | `53a67216390a2874f7f2fa8479df5188bd28ff404e3144f1350f8146295e26d4` | 193028 |
| `supported-edited-vs-regenerated.comparison.evidence.json` | `1456680d4762db3c090c21247445f2b748efe500766e35f877080dcaa4eff333` | 3345 |
| `supported-edited.docx` | `4706144d3ed3c06aabeff076097746cf7c061dc2ce1e495fe5e3b48415d9fd08` | 41079 |
| `supported-edited.native-word.evidence.json` | `fa5ef0d5f7b4f5c60b8c9eb5edc8cd85ff5ad9ae96f65665fc02c5ef42e53882` | 1980 |
| `supported-edited.quicklook.evidence.json` | `e9c58a81381c43383451c283829ae33c46ba2ee959d3ac2a858e6cbe2eac2a34` | 1891 |
| `supported-edited.quicklook.png` | `c398f667898670645e39d3a260ca393b9033e81c9b73505b2257d7cce438341f` | 192544 |
| `supported-edited.report.json` | `ce758dd9c1451245c6feca345697265560532fb9498a8b1ab6743b02648d4429` | 689 |
| `supported-embedded-base.md` | `f4bc912013a84b1cacc449a84293f66f561bc258ee344f89c3a38a51b6cccb48` | 1144 |
| `supported-recovered.md` | `1999150e15f59ece6ba1ff90f91c083703ceea67200bd048363b56b3661c4c91` | 1132 |
| `supported-regenerated.docx` | `be0c18b388e6d05f684a2d849fa7f4323fc2c46bc538c939226b819b87ca832c` | 41102 |
| `supported-regenerated.quicklook.evidence.json` | `fd066ad3442263263f80dc292c2d0e54ba4e637a1ec23c7c46b4385226ad31c5` | 1909 |
| `supported-regenerated.quicklook.png` | `c398f667898670645e39d3a260ca393b9033e81c9b73505b2257d7cce438341f` | 192544 |

## Limitations

- Quick Look is a first-page automated preview, not native Word lifecycle
  evidence.
- The supported plain-text edit is a python-docx simulation; native Word
  open/edit/save/reopen remains the separately recorded gate.
- Quick Look relies on host fonts, so no exact-font or cross-host equivalence
  claim is made.
- DOCX bytes are content-bound for this run but not byte-reproducible across
  runs because provenance and ZIP metadata include generation-time values.
- No mask, tolerance, native pass, or C11 human-review envelope is claimed.
