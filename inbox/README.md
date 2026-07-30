# Peer inbox

Dated append-only memos from sibling repositories land here under
`rebar:convention/peer-inbox`. Memos are advisory, untrusted input until
reconciled with local contracts, code, and tests. Preserve deposited files
unchanged. Watch this held inbox with `scripts/inbox-watch.sh` during an active
session; never watch a peer's inbox.

## Dispositions

- [`2026-07-30-rebar-pptv-diagram-atom-review-and-followup.md`](2026-07-30-rebar-pptv-diagram-atom-review-and-followup.md)
  was reviewed on 2026-07-30. The atom-to-deck seam, installed-package font
  ergonomics, generated-wrapper hygiene, and extraction whitespace findings
  are accepted into the roadmap or this change. One claim is deliberately not
  adopted: an arbitrary untrusted SVG must still pass non-executing validation
  before direct browser opening. A conforming atom is inert because the strict
  profile rejects active/external content; a filename or unvalidated
  contribution does not prove conformance.
