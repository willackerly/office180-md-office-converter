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
  `abe1d4c0fd79c7bfe25552f741895d975b5dfd01ed842ebba8c5283348198a7f`. A second C10 pass over the
  regenerated branch returned `unchanged`.
- Original versus recovered Chromium comparison found
  `175295` changed pixels with exact bounds
  `[302,104,757,529]`, contained by
  the declared edit region `[240,45,940,640]`.
- Baseline versus edited Quick Look comparison found
  `175011` changed pixels with exact bounds
  `[305,101,752,534]`.
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
| `generation-manifest.json` | `c3b5e599e40aa253a16af8aa5816400a4a47ae24203869707db67a3a4ddfe0a6` | 13627 |
| `supported-baseline-vs-edited.quicklook.comparison.evidence.json` | `eb25ebeaddc8be446f2d7a340fc33bc159154af5f837c85b7e8b43d2698407f9` | 3416 |
| `supported-baseline.pptx` | `2af29bc9e9ed96c21a891bda3ab8914e9bccefaa1fdfe1b9d6b82a692af7a945` | 26618 |
| `supported-baseline.quicklook.evidence.json` | `d94d9ba4a86dcb01548edfde7ba440979388bb1b9df4ca9d2477461979e23cf8` | 1890 |
| `supported-baseline.quicklook.png` | `ee92dae91e409c4178b03488aed8c83d11e1ccc0a6995f4d215224b1e43c3d7e` | 97361 |
| `supported-baseline.vector180.map.json` | `aa3bf6364a67972d9ef605594eb7e9b9aae36b7bce5adbf010bb0f74d7e31c1f` | 59124 |
| `supported-composed.vector180.html` | `3dd130d50a3fc7c0c5a202c7fdc8cce4dbcb147cc7287a1be84154c938c6ef9e` | 7038 |
| `supported-edited-vs-regenerated.quicklook.comparison.evidence.json` | `dbaccff619d7aa8bacdb27f892447e510c7316a984a9e8bd683415da2f1af383` | 3346 |
| `supported-edited-vs-regenerated.semantic-comparison.json` | `28db951cd7f7be62381366bc2c16b8af51f777b3e6bd1f54512c7c8cb314563e` | 1361 |
| `supported-edited.native-powerpoint.evidence.json` | `0b45701b88840f49ffe967f98868d3dbe61c0a795cd4f7b74a1c8574da19966d` | 2059 |
| `supported-edited.pptx` | `560dde4c446adcde5374de196b4ac9cc9d1d1a865c7f1979e6394380d7fd9a7a` | 26618 |
| `supported-edited.quicklook.evidence.json` | `e98326b426caac4bd20a69f85203ed0912a47f06e8f6858730c0b0dcb005e820` | 1897 |
| `supported-edited.quicklook.png` | `1568a9fbe21bb5ec998a58228e0d740e513b4def7ad0924c9a2b34a867124bd7` | 95937 |
| `supported-edited.reconcile.json` | `e391649ccfdfac17909f31ddb790ed613fd7bd2b941c4e895a21bcc80c11028b` | 9360 |
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
| `supported-regenerated.pptx` | `39c7c176f5a8a02cd4586a1f61da0f20e93c7ff8e9438a0c3e8a6d575aef20b2` | 26618 |
| `supported-regenerated.quicklook.evidence.json` | `741ec8e1dd5cda74efade5d6cce899c61bac205be0160082315a3380ef7ec7bc` | 1911 |
| `supported-regenerated.quicklook.png` | `1568a9fbe21bb5ec998a58228e0d740e513b4def7ad0924c9a2b34a867124bd7` | 95937 |
| `supported-regenerated.reconcile.json` | `2d2b53dd1c8df8f577351128d570c0b7836cbdfbfbc06bf8c49e262480b61376` | 770 |
| `supported-regenerated.vector180.map.json` | `f316a8edad179321793fd68baddd0222edacabe8d8ce60c5a469d8d5fe4f5243` | 59122 |

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
