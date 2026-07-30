#!/usr/bin/env bash
# inbox-watch.sh — Live watch on peer inbox/ dirs; one line per new deposit.
# rebar-scripts: 2026.07.11
# office180 hardening: 2026-07-30 (pending REBAR upstream)
#
# REBAR-derived implementation of practices/inbox-watch.md and federation
# Principle 5 ("a held inbox is a watched inbox"). Polls one or more
# inbox directories and emits
#
#   NEW INBOX DEPOSIT: <path>
#
# once for each file that appears after the watch is armed. Pre-existing
# files are never reported (the arming snapshot is the baseline). With more
# than one watched directory, the path is prefixed with the directory the
# deposit landed in.
#
# SOP (2026-07-06, ratified as Principle 5 2026-07-11):
#   - Watch YOUR OWN inbox only — watching a peer's inbox self-echoes
#     your own outbound deposits. Multi-dir mode is for seats that hold
#     several repos' own inboxes, never for peer surveillance.
#   - One watcher per inbox — each watcher atomically acquires a PID lock
#     directory (.inbox-watch.lock, a hidden path) in the inbox. A second
#     watcher skips that inbox. Symlink/legacy locks fail closed.
#   - Only regular, non-symlink dated Markdown memo names are reported.
#     Preview text is byte-capped and terminal controls are replaced.
#
# Runs until killed — arm it as a persistent background monitor at session
# start (coordination-seat cold start; see practices/session-lifecycle.md).
# Each emitted line is an event the hosting harness can surface into the
# agent's session.
#
# Usage:
#   ./scripts/inbox-watch.sh [options] [dir ...]
#
#   dir ...            inbox directories to watch (default: ./inbox)
#
# Options:
#   -i, --interval N   poll every N seconds (default: 30)
#   --preview          append the memo's first line to each deposit line
#   -h, --help         show this header
#
# A watched directory must already exist so the watcher can acquire its lock.
#
# Zero dependencies beyond POSIX tools. Bash 3.2 compatible (macOS default).

set -uo pipefail

INTERVAL=30
PREVIEW=0
DIRS=()

while [ $# -gt 0 ]; do
  case "$1" in
    -i|--interval)
      shift
      if [ $# -eq 0 ]; then
        echo "inbox-watch: --interval needs a value" >&2
        exit 2
      fi
      INTERVAL="$1"
      ;;
    --interval=*) INTERVAL="${1#--interval=}" ;;
    --preview) PREVIEW=1 ;;
    -h|--help)
      sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    --)
      shift
      while [ $# -gt 0 ]; do
        DIRS[${#DIRS[@]}]="${1%/}"
        shift
      done
      break
      ;;
    -*)
      echo "inbox-watch: unknown option '$1' (try --help)" >&2
      exit 2
      ;;
    *) DIRS[${#DIRS[@]}]="${1%/}" ;;
  esac
  shift
done

case "$INTERVAL" in
  ''|*[!0-9]*)
    echo "inbox-watch: interval must be a positive integer, got '$INTERVAL'" >&2
    exit 2
    ;;
esac
if [ "$INTERVAL" -lt 1 ]; then
  echo "inbox-watch: interval must be >= 1 second, got '$INTERVAL'" >&2
  exit 2
fi

if [ "${#DIRS[@]}" -eq 0 ]; then
  DIRS=("./inbox")
fi

# --- Principle 5 arm-time checks -------------------------------------------

# Per-dir arm-time checks: own-inbox scope + a per-inbox lock.
#
# The real double-coverage hazard is TWO watchers on the SAME inbox (split
# provenance), NOT two unrelated watchers on one host. A process-global
# `pgrep inbox-watch` warns on every legitimate sibling seat in a
# single-machine, multi-seat setup — a cry-wolf that trains operators to
# ignore the warning (go-tak-server / _atlas, 2026-07-11). Instead each
# watcher atomically creates a lock directory in its inbox and skips only a
# directory already held by another live watcher. A numeric child directory
# carries the PID without a symlink-following file write.
LOCK_NAME=".inbox-watch.lock"
LOCKS=()
ACTIVE_DIRS=()
lock_holder() {
  local lock="$1" marker holder
  [ -d "$lock" ] && [ ! -L "$lock" ] || return 0
  for marker in "$lock"/*; do
    [ -d "$marker" ] && [ ! -L "$marker" ] || continue
    holder="${marker##*/}"
    case "$holder" in
      ''|*[!0-9]*) continue ;;
    esac
    printf '%s\n' "$holder"
    return 0
  done
}

for dir in "${DIRS[@]}"; do
  abs="$(cd "$dir" 2>/dev/null && pwd || echo "$dir")"

  # Own-inbox scope check: a watched dir outside the current working tree is
  # usually a peer's inbox — self-echo territory. Heuristic, so warn only.
  case "$abs" in
    "$PWD"|"$PWD"/*) : ;;
    *)
      echo "inbox-watch: WARN — $dir resolves outside the current repo ($PWD). Watch your OWN inbox only; a peer's inbox self-echoes your outbound deposits (Principle 5 / SOP 2026-07-06). Proceeding — make sure this is a seat you hold." >&2
      ;;
  esac

  if [ ! -d "$dir" ]; then
    echo "inbox-watch: WARN — $dir does not exist; skipping because it cannot be locked safely" >&2
    continue
  fi

  # Atomic per-inbox lock. Refuse symlinks and unknown legacy lock shapes
  # instead of following or overwriting them.
  lock="$abs/$LOCK_NAME"
  if [ -L "$lock" ]; then
    echo "inbox-watch: WARN — refusing symlink lock $lock; inspect and remove it before watching $dir" >&2
    continue
  fi
  if [ -d "$lock" ]; then
    holder="$(lock_holder "$lock")"
    # An empty lock can be the narrow initialization window after another
    # process won mkdir(2) and before it created its numeric owner marker.
    # Treat it as busy/malformed rather than reclaiming it; that keeps lock
    # acquisition atomic at the fixed-directory mkdir boundary.
    if [ -z "$holder" ]; then
      echo "inbox-watch: WARN — lock $lock is initializing or malformed; skipping $dir" >&2
      continue
    fi
    if [ "$holder" = "$$" ]; then
      echo "inbox-watch: WARN — $dir resolves to an inbox already listed for this watcher; skipping duplicate argument" >&2
      continue
    fi
    if [ -n "$holder" ] && [ "$holder" != "$$" ] && kill -0 "$holder" 2>/dev/null; then
      echo "inbox-watch: WARN — a live watcher (PID $holder) already holds $dir; skipping duplicate coverage" >&2
      continue
    fi
    if [ -n "$holder" ]; then
      rmdir "$lock/$holder" 2>/dev/null || true
    fi
    if ! rmdir "$lock" 2>/dev/null; then
      echo "inbox-watch: WARN — stale or malformed lock $lock could not be reclaimed safely; skipping $dir" >&2
      continue
    fi
  fi
  if [ -e "$lock" ]; then
    echo "inbox-watch: WARN — refusing non-directory lock $lock; inspect and remove it before watching $dir" >&2
    continue
  fi
  if mkdir "$lock" 2>/dev/null; then
    if mkdir "$lock/$$" 2>/dev/null; then
      LOCKS[${#LOCKS[@]}]="$lock"
      ACTIVE_DIRS[${#ACTIVE_DIRS[@]}]="$dir"
    else
      # This process created the fixed lock, so it alone may try to remove an
      # empty initialization shell after its owner marker failed.
      rmdir "$lock" 2>/dev/null || true
      echo "inbox-watch: WARN — created $lock but could not record ownership; skipping $dir" >&2
    fi
  else
    # A failed fixed-directory mkdir means another contender won. Never
    # remove that contender's lock, including during its pre-marker window.
    echo "inbox-watch: WARN — could not acquire $lock atomically; skipping $dir" >&2
  fi
done

# ---------------------------------------------------------------------------

DIRS=(${ACTIVE_DIRS[@]+"${ACTIVE_DIRS[@]}"})
if [ "${#DIRS[@]}" -eq 0 ]; then
  echo "inbox-watch: no safely lockable inbox directories; nothing to watch" >&2
  exit 0
fi

# Prefix emitted paths with the watched dir only when watching several.
MULTI=0
if [ "${#DIRS[@]}" -gt 1 ]; then
  MULTI=1
fi

STATE_DIR="$(mktemp -d)"
SLEEP_PID=""
cleanup() {
  if [ -n "$SLEEP_PID" ]; then
    kill "$SLEEP_PID" 2>/dev/null
  fi
  # rmdir never follows a replaced symlink and never removes foreign contents.
  for lk in ${LOCKS[@]+"${LOCKS[@]}"}; do
    rmdir "$lk/$$" 2>/dev/null || true
    rmdir "$lk" 2>/dev/null || true
  done
  rm -rf "$STATE_DIR"
}
trap cleanup EXIT
trap 'exit 0' INT TERM

# List only convention-shaped regular memo files. The ASCII filename allowlist
# makes the newline ledger and emitted notification one-record-per-line.
list_dir() {
  local entry name
  [ -d "$1" ] || return 0
  for entry in "$1"/*; do
    [ -f "$entry" ] && [ ! -L "$entry" ] || continue
    name="${entry##*/}"
    case "$name" in
      [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]-?*.md)
        case "$name" in
          *[!A-Za-z0-9._-]*) continue ;;
        esac
        printf '%s\n' "$name"
        ;;
    esac
  done | LC_ALL=C sort
}

# Seed the seen-ledger: everything present at arm time is old news. From here
# the ledger only grows (union each poll), so it is a permanent per-filename
# record of what has been reported, not a rolling snapshot of the last listing.
i=0
for dir in "${DIRS[@]}"; do
  list_dir "$dir" > "$STATE_DIR/snap.$i"
  i=$((i + 1))
done

echo "inbox-watch: armed — watching ${DIRS[*]} every ${INTERVAL}s (pre-existing files not reported)" >&2

while true; do
  # Background sleep + wait keeps the loop responsive to signals: a kill
  # lands immediately instead of after the current sleep completes.
  sleep "$INTERVAL" &
  SLEEP_PID=$!
  wait "$SLEEP_PID"
  SLEEP_PID=""

  i=0
  for dir in "${DIRS[@]}"; do
    snap="$STATE_DIR/snap.$i"
    cur="$STATE_DIR/cur.$i"
    list_dir "$dir" > "$cur"
    # comm -13: lines only in the current listing = new deposits. Pin the
    # merge walk to C collation: comm assumes its inputs are sorted in the
    # CURRENT locale, but list_dir and the union below both sort under
    # LC_ALL=C. Without this pin, comm compares C-sorted files using locale
    # collation and mis-reports a stable subset every poll (go-tak-server
    # FRICTION #2, 2026-07-11). Every sort/merge on these files is C-collated.
    LC_ALL=C comm -13 "$snap" "$cur" | while IFS= read -r name; do
      [ -n "$name" ] || continue
      if [ "$MULTI" -eq 1 ]; then
        path="$dir/$name"
      else
        path="$name"
      fi
      line="NEW INBOX DEPOSIT: $path"
      if [ "$PREVIEW" -eq 1 ] && [ -f "$dir/$name" ] && [ ! -L "$dir/$name" ]; then
        first="$(
          LC_ALL=C head -c 512 "$dir/$name" 2>/dev/null |
            LC_ALL=C tr '\000-\010\013-\037\177' '?' |
            head -n 1
        )"
        if [ -n "$first" ]; then
          line="$line — $first"
        fi
      fi
      printf '%s\n' "$line"
    done
    # Union cur INTO the seen-ledger, never replace it. A filename, once seen,
    # stays seen for the life of the watcher. This is what makes a re-emit
    # impossible when a git operation (merge/checkout/stash) transiently
    # removes-and-restores tracked inbox files: the restored names are already
    # in the ledger, so they don't re-diff as new. (A plain `mv cur snap` keyed
    # the baseline to the LAST listing, so a transient empty dir reset it and
    # the whole backlog re-emitted on the next poll — go-tak-server, 2026-07-11.)
    # Trade-off: a deleted-then-recreated same-name file won't re-notify. That
    # is correct for the inbox convention (dated, unique, append-only names).
    # LC_ALL=C is REQUIRED, not cosmetic: list_dir emits C-collated listings,
    # so the ledger must stay C-collated or comm (above) merge-walks two
    # differently-ordered files and re-emits a stable subset every poll. A
    # plain `sort -u` here re-collates under the default locale and reintroduces
    # exactly that (go-tak-server FRICTION #2, 2026-07-11 — worse than the bug
    # this block fixed, because it fires every poll, not just on git ops).
    LC_ALL=C sort -u "$snap" "$cur" -o "$snap"
    rm -f "$cur"
    i=$((i + 1))
  done
done
