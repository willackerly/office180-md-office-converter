#!/usr/bin/env bash
# check-contract-refs.sh — Verify every CONTRACT: reference points to a real file
# rebar-scripts: 2026.03.20
#
# Usage: ./scripts/check-contract-refs.sh [architecture-dir]
# Default: architecture/
#
# Exit code: 0 = all refs valid, 1 = broken refs found

set -euo pipefail

ARCH_DIR="${1:-architecture}"

if [ ! -d "$ARCH_DIR" ]; then
  echo "Architecture directory '$ARCH_DIR' not found."
  exit 1
fi

broken=0
total=0

# Find all CONTRACT: references in supported source files.
while IFS= read -r line; do
  file="${line%%:*}"
  remainder="${line#*:}"
  lineno="${remainder%%:*}"

  # Extract every contract ID on the line (e.g., C1-THEME-SCHEMA.1.1).
  while IFS= read -r match; do
    ref="${match#CONTRACT:}"
    total=$((total + 1))

    # Check if the contract file exists
    expected="${ARCH_DIR}/CONTRACT-${ref}.md"
    if [ ! -f "$expected" ]; then
      echo "BROKEN: $file:$lineno references CONTRACT:$ref"
      echo "        Expected: $expected"
      broken=$((broken + 1))
    fi
  done < <(
    printf '%s\n' "$line" |
      grep -o 'CONTRACT:[A-Za-z0-9_-]*\.[0-9]*\.[0-9]*'
  )
done < <(grep -rn "CONTRACT:[A-Za-z0-9_-]*\.[0-9]*\.[0-9]*" \
  --exclude-dir=".git" --exclude-dir=".venv" --exclude-dir="node_modules" \
  --exclude-dir="dist" --exclude-dir="vendor" --exclude-dir=".claude" \
  --include="*.py" --include="*.go" --include="*.ts" --include="*.tsx" \
  --include="*.js" --include="*.mjs" --include="*.rs" --include="*.jsx" \
  . 2>/dev/null | grep -v "node_modules\|vendor\|dist\|\.git\|\.claude/worktrees")

echo ""
echo "Checked $total contract references, $broken broken."

if [ "$broken" -gt 0 ]; then
  echo ""
  echo "Fix by either:"
  echo "  1. Creating the missing contract in $ARCH_DIR/"
  echo "  2. Updating the code reference to the correct contract version"
  exit 1
fi

exit 0
