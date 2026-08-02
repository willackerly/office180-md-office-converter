# PPTV/PPTX round-trip evidence

This isolated C8/C9/C10/C11 fixture is generated from a synthetic public PPTV
atom using the checked ABeeZee font fixture. The PowerPoint edit is a
deterministic DrawingML simulation of the supported text, rectangle geometry,
and direct native-style surface; it is not presented as a native PowerPoint
edit.

## Reproduce and verify

The generator refuses any existing destination:

```bash
node scripts/generate-pptv-roundtrip-evidence.mjs \
  --destination tests/fixtures/roundtrip-evidence/pptv
```

Validate each C11 envelope with:

```bash
for manifest in tests/fixtures/roundtrip-evidence/pptv/*.evidence.json; do
  .venv/bin/python scripts/visual-evidence.py validate "$manifest" \
    --root tests/fixtures/roundtrip-evidence/pptv
done
```

From this directory, verify all durable file hashes with:

```bash
shasum -a 256 -c SHA256SUMS
```

## Automated observations

- C8 exact-font preflight passed for both original and recovered atoms with no
  overflow or unverified line.
- C10 returned `patchable` with exactly one `set-text`, one
  `set-object-geometry`, and one `set-native-style` operation. Separate C5
  application produced the recovered atom, and a fresh C9 compile produced the
  regenerated PPTX/map.
- The edited and regenerated slide XML parts are byte-identical at
  `9f0c0d53f9e10499f0acf8f85b6cfc43b67068e868fd7d52b13714f43568ca8f`. A second C10 pass over the
  regenerated branch returned `unchanged`.
- Original versus recovered Chromium comparison found
  `175295` changed pixels with exact bounds
  `[302,104,757,529]`, contained by
  the declared edit region `[240,45,940,640]`.
- Baseline versus edited Quick Look comparison found
  `175008` changed pixels with exact bounds
  `[305,76,752,559]`.
- Edited versus regenerated Quick Look comparison passed with
  `0` changed pixels, changed fraction
  `0`, mean absolute error
  `0`, and maximum channel delta
  `0`.
- Native PowerPoint state is `manual-required`:
  Native Microsoft PowerPoint open, representative edit, save, and reopen were not automated by this generator; manual lifecycle validation remains required.
- The final privacy pass covers every durable file, every uncompressed PPTX
  member, workstation paths/account metadata, host identity, high-confidence
  credential patterns, sensitive environment values, and prohibited public
  marking strings. It passed 32 files and
  45 PPTX members before publication.

## Exact artifact hashes

| Artifact | SHA-256 | Bytes |
|----------|---------|------:|
| `generation-manifest.json` | `704033c18f3c3924564790a66616eeedb2beb734624238a161fdcfa6b2987769` | 13541 |
| `supported-baseline-vs-edited.quicklook.comparison.evidence.json` | `64ffaec9fc4f0e8e9b380018458f9996beaf8b99f3f11ab8c8186322b748fae2` | 3410 |
| `supported-baseline.pptv.map.json` | `0a814430d57342407ec28724b6f04cdac21e557dbcbeaf3ecec6f5b2f2e1dabf` | 58774 |
| `supported-baseline.pptx` | `7ea97b85eca73ab196a8201003dbb8764d7e9fc9e785df176b532d3d52131904` | 26484 |
| `supported-baseline.quicklook.evidence.json` | `f217049570a397dee6a843436d5cc9d5e278307e7840386c4210d91f89fb06d3` | 1885 |
| `supported-baseline.quicklook.png` | `e85f46c222d5ad7bafcdde855601d5e5671aa4a67849846a7bde1b8182ddb498` | 97419 |
| `supported-composed.pptv.html` | `c3fde65f00394df4fb3065e2dc9794ad42261f260467f5e9a3d19f58bc0a3636` | 6671 |
| `supported-edited-vs-regenerated.quicklook.comparison.evidence.json` | `2246b25d619e4169d9da0aff58ab9fb91b33eca111162cb52b876dc604de9a6e` | 3336 |
| `supported-edited-vs-regenerated.semantic-comparison.json` | `d303a511a9b7fc0427b6b5b03546fca84d2fd3d9507318cddedfcb5a4effc6a2` | 1356 |
| `supported-edited.native-powerpoint.evidence.json` | `1652d14e42b45b4217a2bd36b223f67d658e98c0c71028836fa3a01fd40ce544` | 2054 |
| `supported-edited.pptx` | `4cf72c93e821adc4460f723c2bbd5085b54116a9067907ed0c60ec6eeebb9ca9` | 26484 |
| `supported-edited.quicklook.evidence.json` | `c4ecb1b6d9bdd75e734136c9b0a798f0f6633d4a64babd3c8e0872a8a92d4024` | 1892 |
| `supported-edited.quicklook.png` | `6b6e8c38094fb531e6369adcd93d9bd821cb37fca42534898d03837d4f58af36` | 95994 |
| `supported-edited.reconcile.json` | `f7a723ab93c16c4b96de33aaaa54684b27198a1bd86d1d74756fb12845134ccb` | 2777 |
| `supported-font-map.json` | `54fb3800bd17d780ecce41955843225af3d2c8b5ccfacdff6a38037f210b44f5` | 264 |
| `supported-original-vs-recovered.browser.comparison.evidence.json` | `1d5c34b6f87b5dc75a5023ff2715dd6b841fba4deed6172dcdb9e01242e8e500` | 4329 |
| `supported-original.browser.evidence.json` | `9106e16112ff221d79b69d817162598ec833de90752bd66bfb783556c177dc8b` | 2807 |
| `supported-original.browser.png` | `764cd3fc2afb0359b466ba131e5db66a280d7564118201af94023cf13988f377` | 60988 |
| `supported-original.pptv.svg` | `91cb7546a81d2e4edc41e22e314c7e51194c32917133b2909113688f94021f11` | 4279 |
| `supported-original.text-fit.json` | `4e00f26e9c90eb73f9f9fc8d27ba24787a681ba368510d2573e03b04989bd713` | 4393 |
| `supported-recovered.browser.evidence.json` | `10f866c2303ffb2baf9d32d0644bbd21720d82356975c686546aa09e35f52848` | 2811 |
| `supported-recovered.browser.png` | `02f8de51d4e09dc7d842c2d75169f390d5b04144fb6290c5ccfbba7a63ef09a6` | 57776 |
| `supported-recovered.pptv.patch.json` | `631da8587e5ec71578b4f0303139359d9836eb753d90f04b5004544c67689d1e` | 1130 |
| `supported-recovered.pptv.svg` | `b1b23147e3512ba80a276b79837599d1d954c2968626d1bc44c70d860023cffa` | 4279 |
| `supported-recovered.text-fit.json` | `6bc0a923375cba91321aebf1fee5607c8aed8cbf0ab749bbbce1f22d87e7794e` | 4393 |
| `supported-regenerated.pptv.map.json` | `818cee3dcce52d6570225b7cf53ae257ee3580a65e68aa43cc7d5001b7b771a6` | 58772 |
| `supported-regenerated.pptx` | `d02246f4090b3378fb6a29dfbc5f6dd0cb69b731e44a64f0a21fda4df9c66771` | 26484 |
| `supported-regenerated.quicklook.evidence.json` | `9c073ea274a365cbccb75f908260f7b849225fbb5a0042b849f5818fdd7554fd` | 1901 |
| `supported-regenerated.quicklook.png` | `6b6e8c38094fb531e6369adcd93d9bd821cb37fca42534898d03837d4f58af36` | 95994 |
| `supported-regenerated.reconcile.json` | `e1f3eea09f5c175d10ae0035b4431747e379afaba4fd4d6947907170cd448272` | 377 |

## Limitations

- Browser and Quick Look captures rely on host fonts; the separate C8 report
  is the exact-font claim.
- Quick Look is a first-slide automated preview, not native PowerPoint
  lifecycle evidence.
- The edited PPTX is a deterministic trusted-package simulation. Native
  PowerPoint open, representative editability, save, and reopen remain the
  separately recorded gate.
- Exact slide XML and C10 supported-semantic equality do not imply byte-equal
  packages because regenerated lineage properties intentionally bind the
  recovered atom and composed deck.
- No C11 human-review envelope or cross-host rendering equivalence is claimed.
