#!/usr/bin/env bash
# pre-commit.sh — Pre-commit hook for repository truth and both implementations
# rebar-scripts: 2026.03.20
#
# Install: scripts/setup.sh (symlinks this as .git/hooks/pre-commit)
#
# The repository is small enough to run typechecking and both test suites here.
#
# Skip with: git commit --no-verify (use sparingly)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# If installed as a git hook, scripts are at ../../scripts/
# If run directly, they're in the same directory
if [ -f "$SCRIPT_DIR/check-todos.sh" ]; then
  BASE="$SCRIPT_DIR"
elif [ -f "$SCRIPT_DIR/../../scripts/check-todos.sh" ]; then
  BASE="$SCRIPT_DIR/../../scripts"
else
  echo "Warning: Cannot find check scripts. Skipping pre-commit checks."
  exit 0
fi

failed=0
REPO_ROOT="$(cd "$BASE/.." && pwd)"

echo "Pre-commit: checking TODO tracking..."
if [ -x "$BASE/check-todos.sh" ]; then
  "$BASE/check-todos.sh" || failed=$((failed + 1))
fi

echo ""
echo "Pre-commit: checking contract references..."
if [ -x "$BASE/check-contract-refs.sh" ]; then
  "$BASE/check-contract-refs.sh" || failed=$((failed + 1))
fi

echo ""
echo "Pre-commit: checking ground truth metrics..."
if [ -x "$BASE/check-ground-truth.sh" ]; then
  "$BASE/check-ground-truth.sh" || failed=$((failed + 1))
fi

echo ""
echo "Pre-commit: checking documentation freshness..."
if [ -x "$BASE/check-freshness.sh" ]; then
  "$BASE/check-freshness.sh" || failed=$((failed + 1))
fi

echo ""
echo "Pre-commit: checking rebar compliance..."
if [ -x "$BASE/check-compliance.sh" ]; then
  "$BASE/check-compliance.sh" || failed=$((failed + 1))
fi

echo ""
echo "Pre-commit: checking TypeScript formatting..."
(cd "$REPO_ROOT" && pnpm format:check) || failed=$((failed + 1))

echo ""
echo "Pre-commit: typechecking TypeScript..."
(cd "$REPO_ROOT" && pnpm typecheck) || failed=$((failed + 1))

echo ""
echo "Pre-commit: running TypeScript and Python tests..."
(cd "$REPO_ROOT" && pnpm test) || failed=$((failed + 1))

echo ""
echo "Pre-commit: building the TypeScript package..."
(cd "$REPO_ROOT" && pnpm build) || failed=$((failed + 1))

if [ "$failed" -gt 0 ]; then
  echo ""
  echo "Pre-commit checks failed. Fix the issues above before committing."
  echo "To skip (not recommended): git commit --no-verify"
  exit 1
fi

echo ""
echo "Pre-commit checks passed."
exit 0
