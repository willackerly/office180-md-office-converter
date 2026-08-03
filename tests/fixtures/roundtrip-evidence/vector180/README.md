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
| `generation-manifest.json` | `0d659e37ca2b46ff33f871b12fedef05279e1468ea5b0f4cd62a490eb1749d9d` | 13626 |
| `supported-baseline-vs-edited.quicklook.comparison.evidence.json` | `634deefad1ff61ffe7d653cedc17eaedc8aae338e28a01c148fe55653604d23b` | 3415 |
| `supported-baseline.pptx` | `72d67c949ac8a4a1f80285b7781ff03fdc50c663e57a20d41383fa7b61e3ba2c` | 26588 |
| `supported-baseline.quicklook.evidence.json` | `8f230e6a56eb3231e1ab8d3b0a3c37da778f276a60d71fbdf558fff91aca8c2f` | 1890 |
| `supported-baseline.quicklook.png` | `e85f46c222d5ad7bafcdde855601d5e5671aa4a67849846a7bde1b8182ddb498` | 97419 |
| `supported-baseline.vector180.map.json` | `cee57ebd1cc59bddc0039d52dcb1ea702edb8f9c7f10bba1b6702cf920688162` | 59094 |
| `supported-composed.vector180.html` | `3dd130d50a3fc7c0c5a202c7fdc8cce4dbcb147cc7287a1be84154c938c6ef9e` | 7038 |
| `supported-edited-vs-regenerated.quicklook.comparison.evidence.json` | `168c4250766cd838b4db4edcc3f82408212678600c81d94e65dcf42fcf5e2c63` | 3346 |
| `supported-edited-vs-regenerated.semantic-comparison.json` | `4f11ee8191f99fca5149c864adb70071032f38d89c20587cdb88ac1c3520d165` | 1361 |
| `supported-edited.native-powerpoint.evidence.json` | `4560a6115e62247d03f9cafd5ed88762e002b87491afa473bf5a4abc88bad33f` | 2059 |
| `supported-edited.pptx` | `65f0478c3fd7b76533e4025c2560821b6c9f8a73ad95a4e8e019d3c6d99d869a` | 26588 |
| `supported-edited.quicklook.evidence.json` | `0803423339da175d05ea126f858768d60966bbedd210fb15922c6407de654805` | 1897 |
| `supported-edited.quicklook.png` | `6b6e8c38094fb531e6369adcd93d9bd821cb37fca42534898d03837d4f58af36` | 95994 |
| `supported-edited.reconcile.json` | `944cfaa83d03291756a58bc4186dee05b283c74c0aa166a73573e5f1027230ac` | 9360 |
| `supported-font-map.json` | `541d0617a01367b7af5bcaba7f45dedfc090716dc440951aab8cb8483c47eb3e` | 274 |
| `supported-original-vs-recovered.browser.comparison.evidence.json` | `a63bd0b105daf583a2040d647d754876bc840541847a76e7eb9b7ba2e1f2162e` | 4344 |
| `supported-original.browser.evidence.json` | `1f8867e0ef0193f076a204181f40330c1b2956982955f73c6572c2911b04a8f9` | 2822 |
| `supported-original.browser.png` | `764cd3fc2afb0359b466ba131e5db66a280d7564118201af94023cf13988f377` | 60988 |
| `supported-original.text-fit.json` | `227f4e6206db2f05b651fe1613713bc0aa3d814b870ef39e4b9a99a918b06ebe` | 4374 |
| `supported-original.vector180.svg` | `3bf18821484c9844da740b31f46ffb4cf72fb52802bb55fb97b8bdcbc58f46fc` | 4624 |
| `supported-recovered.browser.evidence.json` | `512bbdfa3aa95197eef244bc0bf35925ebe8f030ca1d0240c6299a50189579de` | 2826 |
| `supported-recovered.browser.png` | `02f8de51d4e09dc7d842c2d75169f390d5b04144fb6290c5ccfbba7a63ef09a6` | 57776 |
| `supported-recovered.text-fit.json` | `9c926409c0d50884ab20e5b1adc62fae809fe51fb2b7215f549f68968e77f809` | 4374 |
| `supported-recovered.vector180.patch.json` | `ab6c6610bf075c109d97c642b99a3a34a5ae3aed8c3fea2db704128e6d7c0cfa` | 1135 |
| `supported-recovered.vector180.svg` | `e5145ecdaf435d0a04abf92e3bd2e9a20d01396ba013dd6ab26bfa937d59dc8d` | 4624 |
| `supported-regenerated.pptx` | `b915027a645b239ffd0acf973fe613fce035fa806b43c3669c0c924116e94206` | 26588 |
| `supported-regenerated.quicklook.evidence.json` | `ad0114b645d9fd6522e4526e665f384b34c56860edb808e0cfb11d1b27e66857` | 1911 |
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
