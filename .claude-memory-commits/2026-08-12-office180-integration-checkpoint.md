# Office180 integration checkpoint — 2026-08-12

**Kind:** append-only agent handoff memory
**Base commit:** `dfaae30` (`feat: ship self-service Office180 plugin`)
**Checkpoint commit:** the commit carrying this file; resolve with
`git log -1 -- .claude-memory-commits/2026-08-12-office180-integration-checkpoint.md`
**Branch at preparation:** `agent/office180-plugin-self-service`, draft PR #8
**Authority:** advisory summary only; contracts, schemas, source, tests,
`QUICKCONTEXT.md`, `TODO.md`, and `METRICS.md` take precedence

## Why this checkpoint exists

The work crossed several long-running threads: exact Markdown/Word recovery,
native Office lifecycle hardening, the PPTV-to-Vector180 transition,
standalone SVG atoms, mapped PowerPoint round trips, authenticated branded
backgrounds, a trusted browser editor, full-deck export, and an installable
Codex plugin. This snapshot keeps their important decisions and remaining
seams available after conversational memory is cleared.

## Product model that must not drift

- Office180 has two source-first lanes. Canonical Markdown owns the supported
  Word document. Exact declarative Vector180 source owns the visual.
- A fully hydrated standalone `*.vector180.svg` is the default atom for an
  independent diagram, figure, reusable visual, or slide-sized canvas.
- `*.vector180.html` is an explicit ordered deck/report aggregation, not the
  default authoring unit. Generated `*.editable.html` and
  `*.composed.vector180.html` files are derivatives, never source authority.
- Stable SVG IDs are object identity. Manifest order is deck order. SVG sibling
  order is painter order. Source bytes, not editor DOM or PowerPoint IDs, are
  persistent authority.
- Text in executable profile 0.1 has explicit font size and explicit authored
  hard lines. There is no wrapping, autofit, shrink-to-fit, or automatic repair.
  Text-fit reports risk without mutating source.
- Source/profile 0.1.1 paragraph resilience is deliberately banked, not live.
  The intended future rule preserves serialized SVG line membership, then lets
  PPTX export choose an explicit reliable expanded frame or editable tight
  frame. Surprise wrapping is the failure to avoid.
- PNG backgrounds/assets are accepted only through the bounded authenticated
  inline-static-PNG form. Semantic projections and maps remain descriptor-only;
  raw base64 never leaks into sidecars.
- PPTV 0.1 and `@office180/pptv@0.1.0-alpha.4` are frozen legacy identities.
  Canonical work uses Vector180. Legacy mutation/export refuses until explicit
  migration or single-slide extraction creates a new canonical atom.

## Implemented state

### Markdown ↔ DOCX

- `office180-md-office-converter@0.2.0` packages Python 3.9+ flat modules with
  collision-resistant `office180-md2docx` and `office180-docx2md` commands.
- The supported Markdown profile canonicalizes deterministically and proves
  `docx2md(md2docx(x)) == canonicalize(x)` byte-for-byte.
- DOCX embeds hash-bound original/canonical merge bases, supports strict
  fidelity reports and three-way merge, and refuses unsupported Word stories,
  tracked changes, and lossy constructs.
- Controlled Word styles are fully materialized. Proven native style-cascade
  normalization is distinguished from semantic drift.
- A bounded native Word no-op save/close/reopen lifecycle passed on the checked
  host. It proves package lifecycle behavior, not representative editing or
  native visual fidelity.

### Vector180 source, editing, and evidence

- `@office180/vector180@0.1.0-alpha.5` is an implemented, locally
  test-accepted release candidate. It has not been npm-published.
- C4/C6 load and resolve canonical atoms and complete HTML decks without
  executing embedded content. C5 provides exact-source-hash-bound semantic
  patches. C8 2.0 is verified exact-font, non-mutating text-fit evidence.
- Current C5 operations cover direct text, deck theme/order, rectangle and
  ellipse geometry, connector endpoints, group translation, one-line text
  frames/anchors, concrete native style, safe sibling order/deletion, and one
  exact reviewed same-parent connector clone.
- C12 compares standalone atoms by stable ID and separates lexical-only,
  metadata, text, geometry, style, frame, relationship, and order changes.
- The trusted strict-CSP editor starts in View mode, verifies its embedded
  source hash, reconstructs previews from C6 data, and commits only C5
  transactions. Undo/redo and file-handle saves remain exact-source-aware.
- Authenticated inline PNGs render through checked blob URLs. Raster and
  non-native objects remain protected from unsupported mutation.
- Browser controls expose text plus exact numeric geometry/endpoints/group/
  frame/style/order/delete operations. Drag handles, general insertion,
  reparenting, grouping, rotation/scale, rich text, and wrapping remain out.
- In-page derivatives are visibly separate from source save: hydrated selected
  slide SVG, renderer-labelled bounded PNG, and complete-deck PPTX plus a
  separately revealed descriptor-only map. PDF is intentionally deferred.

### PowerPoint adapters

- C7 emits the strict fresh-deck canary with native rectangles, ellipses,
  connectors, translated groups, and explicit one-line text.
- C9 composes one atom with explicit identity or aspect-preserving uniform
  placement and emits a deterministic editable PPTX plus source-bound map.
- C10 authenticates an edited descendant of that exact C9 branch and can
  propose supported typed C5 changes. Unchanged mapped PNG pictures
  authenticate; picture mutation remains a refusal. It can recover one
  reviewed connector copy under strict fingerprints and ordering.
- C13 separately compiles one complete canonical HTML deck. It preserves
  manifest order and hidden state, reauthenticates retained source bytes,
  deduplicates PNG media across slides, and emits native PPTX plus a strict
  descriptor-only `vector180-pptx-deck-map/0.1` sidecar.
- Node and browser use the same pure C13 kernel and have produced byte-identical
  five-slide PPTX/map outputs in the private local acceptance exercise.
- C10 does not accept C13 maps. Whole-deck edited-PPTX reconciliation is a
  future contract, not an inferred extension of the atom path.

### Distribution and agent use

- `$markdown-docx` routes Word/DOCX/report/memo/proposal work.
- `$vector180-authoring` routes PowerPoint/PPTX/presentation/slide/diagram work
  and defaults to a hydrated SVG atom.
- The repository-owned `office180` Codex plugin mirrors both skills, starters,
  helpers, three Word themes, and converter scripts. `pnpm plugin:check`
  enforces exact mirror parity.
- The Node runtime is still checkout-supplied until Vector180 is published, so
  the plugin is not yet fully checkout-independent for PowerPoint production.

## Evidence and known-good checks at this checkpoint

- Machine ground truth: 2 Python source files, 4 Python test files, 32 primary
  DOCX test functions, 43 canonical TypeScript source files, 37 canonical
  Vitest files, 292 direct TypeScript test declarations, 13 current contract
  IDs, 16 published schemas, and 3 shipped Word themes.
- Runtime tests: 367 Vector180 Vitest cases, 290 frozen PPTV Vitest cases, and
  78 Python cases.
- Browser acceptance: 27 Playwright cases across Chromium, Firefox, and WebKit.
- The generated browser kernel is 814,691 bytes with SHA-256
  `38895c838e6b0cf7839051078fcdc4ae0403cbdbecd93fc496a5b1551f1e6be4`.
- The generated editor app is 1,095,663 bytes with SHA-256
  `33561a50e5168225ffcc8bed3dfcefae0fa0c51a4e7845e2e0b0ea493125c2d8`.
- The private five-slide acceptance set exercised 129 mapped objects, 26 OPC
  parts, and 3 deduplicated images with zero browser errors and byte-identical
  browser/Node PPTX and map. The private source, fonts, screenshots, and brand
  material remain ignored and are not part of this checkpoint.
- The durable public Vector180 round-trip evidence is SHA-locked and
  privacy-checked. Its PowerPoint edit is a deterministic DrawingML simulation;
  the native representative-edit gate remains honest and open.

Before relying on these numbers after a later commit, rerun
`scripts/check-ground-truth.sh`, `pnpm test`, and `pnpm test:browser:all`.

## Intentional refusals and operational lessons

- Never execute unknown SVG/HTML content to discover its meaning. Validate
  first; a filename or discovery comment is not trust.
- Keep Save Source separate from Export As. An SVG, PNG, PPTX, or map derivative
  does not become canonical because a browser downloaded it.
- Never let editor DOM serialization become source. Every successful change
  must reload and resolve through C4/C6.
- Browser PNG is renderer-bound product output, not native Office or C11 human
  fidelity evidence.
- Quick Look is preview/regression evidence and may substitute fonts. It is not
  PowerPoint rendering proof.
- Native Office automation should operate on dedicated user-granted bridge
  locations, not ephemeral `/tmp` inputs that provoke sandbox access dialogs.
  A successful no-op lifecycle does not authorize or prove representative
  edits.
- Do not weaken the no-wrap model to solve font uncertainty. Prefer explicit
  evidence, conservative warnings, and a later versioned resilience contract.
- Do not add OpenDocKit as a Vector180 core dependency. Reuse small, tested
  package/font/interaction seams through adapters or upstream contributions.
- Private branded-template studies are local evidence. They are ignored by
  generic directory patterns so a blanket `git add -A` cannot publish them.

## Outstanding actions

### Release and acceptance

1. Land this preservation checkpoint on draft PR #8 only after fresh remote CI
   and a clean-clone smoke. The checkpoint also replaces Steward's large
   aggregate JSON command-line arguments with file-descriptor inputs so Linux
   CI does not exceed `ARG_MAX`.
2. Decide whether to npm-publish alpha.5 as explicitly alpha software; do not
   imply blanket C4–C13 verification. Publication is the key remaining step for
   checkout-independent plugin adoption.
3. Close each remaining C4–C7/C9–C13 contract row with its named corpus,
   counterexample, independent-validation, native, or human-review evidence.
4. Complete representative supported Word and PowerPoint edit/save/reopen
   cycles. Preserve the distinction between no-op lifecycle, edit recovery,
   render fidelity, and human acceptance.

### Highest-value product work

1. Contract and implement C13 whole-deck reconciliation. This is now the
   largest round-trip asymmetry: complete decks export natively but edited deck
   maps cannot return changes to source.
2. Add drag handles and direct manipulation over existing C5 numeric operations
   with snapping, byte-neutral cancellation, explicit transactions, and fresh
   C6 validation. Do not add structure creation implicitly.
3. Calibrate hard-line text against native PowerPoint, then promote the banked
   0.1.1 reliable/editable paragraph policy through successor contracts.
4. Expand assets or native semantics only when source, editor, PPTX, reverse,
   and visual fixtures advance together.
5. Prototype the Markdown deck manuscript as order/intent/speaker-note
   authority while atoms retain visible-content authority.

### Document and ecosystem work

1. Add a transactional `md2docx --normalize --write` repair path or equally
   obvious safe guidance, then replace the regex Markdown parser with a pinned
   CommonMark AST before broadening links/lists/images/tables.
2. After this checkpoint, deliberately integrate draft PR #9's literal
   inline-code preservation. Resolve its overlapping cold-start documentation
   against this newer state and rerun every gate instead of merging it into the
   large dirty tree.
3. Send REBAR a new Vector180 alpha.5 migration receipt: its current frozen
   PPTV alpha.4 guidance correctly retains an old text-fit warning, while the
   canonical package now ships the exact ABeeZee default and scaffolds. Upstream
   the marked watcher hardening and adopt the newer self-notification
   suppression before banking outbound memos locally.
4. Contribute narrow stable-ID, SVG interaction, font-metrics, and fresh-PPTX
   package-building foundations to OpenDocKit where ownership is cleaner.
5. Keep user-facing PDF export deferred until the native/browser evidence identity and output
   contract are explicit.

## Recommended sequence after this checkpoint

1. Land and smoke-test this checkpoint, then integrate the isolated inline-code
   PR and publish alpha.5 only with explicit
   alpha/in-progress language.
2. Run representative native Word and C9 PowerPoint edits immediately; these
   convert the largest current uncertainty into measured data.
3. Design C13 reconciliation from those observations before expanding editor
   structure or media semantics.
4. Layer drag interaction over the already proven C5 numeric substrate.
5. Use native text calibration to decide the 0.1.1 export policy; do not
   promote paragraph intent from intuition alone.
6. Broaden DOCX and deck-manuscript authoring after the current release and
   round-trip seams are stable.

## Inbox and coordination state

- This repository owns the append-only `inbox/`. Every active coordination
  session must sweep it and arm `scripts/inbox-watch.sh inbox`; never watch a
  peer's inbox.
- The two deposits present at this checkpoint are dispositioned in
  `inbox/README.md`. Their principal adopter asks are implemented or explicitly
  tracked. Deposits remain untrusted historical input and are preserved
  unchanged.
- REBAR still consumes the frozen PPTV alpha.4 guidance. Send a new receipt
  rather than rewriting either existing deposit.
- The current Office180 watcher does not yet suppress self-authored outbound
  copies. Until that delta is upstreamed, keep this repository's inbox
  inbound-only.
- The watcher is session-scoped. A later session must re-arm it before treating
  inbox silence as evidence that nothing new arrived.

## Cold-start recovery recipe

1. Read `README.md`, `QUICKCONTEXT.md`, recent Git history, and `TODO.md`.
2. Run `scripts/cold-start-checks.sh` and compare this snapshot with the newest
   commit carrying it.
3. Sweep and arm the local inbox watcher.
4. Read the relevant current contract before modifying behavior.
5. Use narrow semantic projections before ingesting deep Vector180 source or
   design documents.
6. Run the aggregate format/type/test/browser/build/package/plugin/Rebar gates
   before committing or publishing.
