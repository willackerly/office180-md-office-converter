# Claude memory commits

This directory stores reviewed, checked-in memory for substantial repository
integration points and non-derivable collaboration facts. A dated snapshot
preserves decisions, verified state, known gaps, and next moves that would
otherwise exist only in one agent conversation.

These files are checked-in memory, not behavioral authority:

- contracts and schemas define supported behavior;
- `QUICKCONTEXT.md` defines current priority ordering;
- `TODO.md` tracks outstanding work;
- `METRICS.md` owns quantitative repository claims; and
- source plus tests decide whether an implementation claim is true.

## Rules

1. Add one dated Markdown file after a material integration or before clearing
   conversational memory. Do not rewrite old snapshots to match later reality.
2. Record the base commit and describe the containing checkpoint as “the commit
   carrying this file”; discover it with `git log -1 -- <snapshot>` rather than
   attempting a self-referential commit hash.
3. Include decisions, implemented boundaries, evidence, refusals, outstanding
   actions, and a recommended sequence. Link to current authority instead of
   copying whole contracts.
4. Never include secrets, tokens, personal data, proprietary source material,
   private screenshots, local absolute paths, or raw inbox contents. A private
   local acceptance corpus may be acknowledged only generically.
5. Treat snapshots as historical input. On cold start, read `README.md`,
   `QUICKCONTEXT.md`, recent Git history, and `TODO.md` first. Read only the
   newest relevant memory snapshot when resuming a long arc or after context
   compaction.
6. Put durable working preferences in one narrowly named file and index it from
   `MEMORY.md`. Do not turn this directory into a second task tracker or a
   transcript archive; verify every time-sensitive fact against current source.

## Durable memories

- [`MEMORY.md`](MEMORY.md) — short index of non-derivable collaboration facts.

## Snapshots

- [`2026-08-12-office180-integration-checkpoint.md`](2026-08-12-office180-integration-checkpoint.md) —
  DOCX round trip, Vector180 alpha.5/C13, trusted editor exports, plugin,
  evidence, remaining release gates, and recommended post-checkpoint sequence.
