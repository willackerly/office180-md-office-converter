# Vector180/PPTX round-trip evidence

This isolated C8/C9/C10/C11 fixture is generated from a synthetic public Vector180
atom using the checked ABeeZee font fixture. The PowerPoint edit is a
deterministic DrawingML simulation of the supported text, rectangle geometry,
and direct native-style surface; it is not presented as a native PowerPoint
edit.

## Reproduce and verify

The generator refuses any existing destination:

```bash
node scripts/generate-vector180-roundtrip-evidence.mjs \
  --destination tests/fixtures/roundtrip-evidence/vector180
```

Validate each C11 envelope with:

```bash
for manifest in tests/fixtures/roundtrip-evidence/vector180/*.evidence.json; do
  .venv/bin/python scripts/visual-evidence.py validate "$manifest" \
    --root tests/fixtures/roundtrip-evidence/vector180
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
| `generation-manifest.json` | `69737c371d388471683e201f78e46dfeeaec2e0e4b64754375b9cb31feb33858` | 13624 |
| `supported-baseline-vs-edited.quicklook.comparison.evidence.json` | `f82964da1198aaee0887fe9c7ad4fa0a774a51c96d1e79948b510dd594e1c80d` | 3419 |
| `supported-baseline.pptx` | `72d67c949ac8a4a1f80285b7781ff03fdc50c663e57a20d41383fa7b61e3ba2c` | 26588 |
| `supported-baseline.quicklook.evidence.json` | `9854b3d2c63c70e4a64e36530c03c7ca285d202af5cb672d497aa8329d91384e` | 1894 |
| `supported-baseline.quicklook.png` | `e85f46c222d5ad7bafcdde855601d5e5671aa4a67849846a7bde1b8182ddb498` | 97419 |
| `supported-baseline.vector180.map.json` | `cee57ebd1cc59bddc0039d52dcb1ea702edb8f9c7f10bba1b6702cf920688162` | 59094 |
| `supported-composed.vector180.html` | `3dd130d50a3fc7c0c5a202c7fdc8cce4dbcb147cc7287a1be84154c938c6ef9e` | 7038 |
| `supported-edited-vs-regenerated.quicklook.comparison.evidence.json` | `768ad27d43cd02813c28b1adff414e0ba3169457d3ff15bb1cdc857efa014b8e` | 3350 |
| `supported-edited-vs-regenerated.semantic-comparison.json` | `c2ea363434141cff4339a4b3f5da283a7ce698c1f05b823d91fca9a5006a62f1` | 1361 |
| `supported-edited.native-powerpoint.evidence.json` | `5088dcd2393f2bbf821a75fb85dc5f659b55d3a68ea1907e961da28ba341ab06` | 2059 |
| `supported-edited.pptx` | `65f0478c3fd7b76533e4025c2560821b6c9f8a73ad95a4e8e019d3c6d99d869a` | 26588 |
| `supported-edited.quicklook.evidence.json` | `8ac60db91560fb9265008fe9d99449a5e448a2e2fc03aa5c1e1156157696fa5b` | 1901 |
| `supported-edited.quicklook.png` | `6b6e8c38094fb531e6369adcd93d9bd821cb37fca42534898d03837d4f58af36` | 95994 |
| `supported-edited.reconcile.json` | `944cfaa83d03291756a58bc4186dee05b283c74c0aa166a73573e5f1027230ac` | 9360 |
| `supported-font-map.json` | `541d0617a01367b7af5bcaba7f45dedfc090716dc440951aab8cb8483c47eb3e` | 274 |
| `supported-original-vs-recovered.browser.comparison.evidence.json` | `6b9d7d73013379f2c38c65cec9f867a342aae2e8d51b3928cf4737b0f9658d99` | 4342 |
| `supported-original.browser.evidence.json` | `779649cb9ffcca99b2e6ed29eedfe71b12803d49c7250ebd3aea57b1ebc776d8` | 2820 |
| `supported-original.browser.png` | `764cd3fc2afb0359b466ba131e5db66a280d7564118201af94023cf13988f377` | 60988 |
| `supported-original.text-fit.json` | `227f4e6206db2f05b651fe1613713bc0aa3d814b870ef39e4b9a99a918b06ebe` | 4374 |
| `supported-original.vector180.svg` | `3bf18821484c9844da740b31f46ffb4cf72fb52802bb55fb97b8bdcbc58f46fc` | 4624 |
| `supported-recovered.browser.evidence.json` | `e20f443439c7cdfbfdaf010e5003f442e87c6299188a488189312e5804a71ea8` | 2824 |
| `supported-recovered.browser.png` | `02f8de51d4e09dc7d842c2d75169f390d5b04144fb6290c5ccfbba7a63ef09a6` | 57776 |
| `supported-recovered.text-fit.json` | `9c926409c0d50884ab20e5b1adc62fae809fe51fb2b7215f549f68968e77f809` | 4374 |
| `supported-recovered.vector180.patch.json` | `ab6c6610bf075c109d97c642b99a3a34a5ae3aed8c3fea2db704128e6d7c0cfa` | 1135 |
| `supported-recovered.vector180.svg` | `e5145ecdaf435d0a04abf92e3bd2e9a20d01396ba013dd6ab26bfa937d59dc8d` | 4624 |
| `supported-regenerated.pptx` | `b915027a645b239ffd0acf973fe613fce035fa806b43c3669c0c924116e94206` | 26588 |
| `supported-regenerated.quicklook.evidence.json` | `6cedc31e7690a125d0b6f4427afef058abaaa58f05171d51378f42d05d2465e9` | 1915 |
| `supported-regenerated.quicklook.png` | `6b6e8c38094fb531e6369adcd93d9bd821cb37fca42534898d03837d4f58af36` | 95994 |
| `supported-regenerated.reconcile.json` | `285eff3c6b10a2b1d8bf1b820dde7dfa80ff343e8eef7bdfe17dc23aca573f96` | 770 |
| `supported-regenerated.vector180.map.json` | `cd9f8afbba0f56dbb93b38814f7fc43ec2e03a5b44ef3615521c6e0da23609a9` | 59092 |

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
