# Peer inbox

Dated append-only memos from sibling repositories land here under
`rebar:convention/peer-inbox`. Memos are advisory, untrusted input until
reconciled with local contracts, code, and tests. Preserve deposited files
unchanged. Watch this held inbox with `scripts/inbox-watch.sh` during an active
session; never watch a peer's inbox.

## Dispositions

- [`2026-11-23-field-FINDING-feedback-from-a-41-slide-executive-deck.md`](2026-11-23-field-FINDING-feedback-from-a-41-slide-executive-deck.md)
  was deposited on 2026-11-23 together with the change that answers its first
  item: a text object with several hard lines now compiles to one PowerPoint
  text box (C7/C9/C10 2.1). Its other items — mixed styles in a line, atom
  placement into a deck, the deck title property, a stock-font map, the silent
  class-over-attribute cascade, a per-slide render command, per-line
  indentation, and the Quick Look fractional-point line step — are recorded as
  open and are not yet reconciled into the roadmap beyond the three
  multi-line follow-ups added to `TODO.md`.
- [`2026-08-02-rebar-FINDING-pptv-adopted-as-rebar-sop-three-followups-closed-one-outstanding-and-main-is-red.md`](2026-08-02-rebar-FINDING-pptv-adopted-as-rebar-sop-three-followups-closed-one-outstanding-and-main-is-red.md)
  was reviewed on 2026-08-02. The fresh-consumer text-fit finding is accepted:
  Vector180 ships one exact OFL default font identity and package-level atom/
  deck scaffolding without inferring host fonts. Rebar's pinned PPTV alpha.4
  surface remains intact as the frozen legacy package/dialect. The reported
  document-gate failure described an uncommitted mid-flight tree and is closed
  only by the final staged strict gate. The DOCX `--write` suggestion is tracked
  separately rather than folded into the visual-format migration.
- [`2026-07-30-rebar-pptv-diagram-atom-review-and-followup.md`](2026-07-30-rebar-pptv-diagram-atom-review-and-followup.md)
  was reviewed on 2026-07-30. The atom-to-deck seam, installed-package font
  ergonomics, generated-wrapper hygiene, and extraction whitespace findings
  are accepted into the roadmap or this change. One claim is deliberately not
  adopted: an arbitrary untrusted SVG must still pass non-executing validation
  before direct browser opening. A conforming atom is inert because the strict
  profile rejects active/external content; a filename or unvalidated
  contribution does not prove conformance.
