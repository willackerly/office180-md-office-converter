# Native Office test notes

Fill this in after the edit/save/reopen pass, or report the observations back
to the agent and let it record them.

## Automated no-op lifecycle — 2026-08-02

The repository bridge completed a bounded, exact-path open → forced no-op
save → close → reopen → close lifecycle against the immutable Word and
trust-model PowerPoint baselines on this host:

- macOS 26.5.2, arm64;
- Microsoft Word 16.111.2, build 16.111.26072617;
- Microsoft PowerPoint 16.111.2, build 16.111.26072617.

Both work copies were writable, returned a successful Save state, became
quiescent non-empty CRC-valid Office packages, reopened without repair, and
retained the exact post-save hash on reopen. Quick Look rendered each native
save identically to its checked baseline: Word changed 0 of 1,993,600 pixels;
PowerPoint changed 0 of 1,443,200 pixels.

Word's recovered Markdown remained byte-identical to the canonical source.
Its eight omitted Heading 1–4 font/italic declarations were proven equivalent
through the exact Normal/linked-style cascade and reported as
`native-normalized-materialized-equivalent`, with zero style drift. The
PowerPoint save produced 111 named proof-carrying serialization-normalization
occurrences, zero source changes, and an `unchanged` C10 result when used as
the exact native baseline. OpenDocKit independently reopened the saved PPTX as
one 12,192,000 × 6,858,000 EMU slide.

The bridge reports and raw Office-normalized work copies stay under ignored
`.office180-native-work/` because native Office files may contain account
metadata. Their SHA-256 bindings are:

| Lane | Bridge report | Saved Office work copy |
| --- | --- | --- |
| Word | `4db2680789765ada2c957395b6de405a015b44f945a531f978c98a6e4277fe02` | `e1a25d963f936fb26a804d8a6e8aab0e55c43d8266dc668eb9273199598bce1e` |
| PowerPoint | `d8375d9838edf1d3d84b276bcf2b3e5b8a1c2c335b3080466e5fe163c7381e2a` | `f5ba3ce47a71527f8d7c3cfaed7cfeb57d9db9a0bb01c37f25c718c6d903e5c0` |

This closes the structural native lifecycle check for these exact artifacts
and application builds. It does not claim representative editability or
native visual fidelity: the bound C11 evidence intentionally keeps
`editability_checked: false`, `visual_fidelity_checked: false`, and
`status: manual-required`.

## Environment

- Microsoft Word version:
- Microsoft PowerPoint version:
- macOS version:
- Test date:

## Open and reopen

| Artifact | Opened without repair warning | Saved and reopened | Still editable | Visual notes |
| --- | --- | --- | --- | --- |
| office180 primer |  |  |  |  |
| PPTV round-trip map |  |  |  |  |
| PPTV trust model |  |  |  |  |

## Edits made

- Word corrections:
- New Word observation:
- Round-trip map correction:
- New map insight:
- Round-trip map style change:
- Round-trip map geometry change:
- Blind trust-model edit:

## Verification

- `verify-edits.sh` result:
- Timestamped run directory:
- Reconciliation or visual findings:
