#!/bin/sh
set -eu

KIT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$KIT_DIR/../.." && pwd)
RUN_STAMP=$(date -u '+%Y%m%dT%H%M%SZ')
RUN_DIR="$KIT_DIR/runs/run-$RUN_STAMP-$$"
PYTHON="$REPO_ROOT/.venv/bin/python"
VISUAL="$REPO_ROOT/scripts/visual-evidence.py"
FONT_MAP="$KIT_DIR/font-map.json"
THEME="$REPO_ROOT/themes/plum.json"
BASELINES="$KIT_DIR/baselines"

WORD_EDITED="$KIT_DIR/office180-primer.edited.docx"
MAP_EDITED="$KIT_DIR/pptv-roundtrip-map.edited.pptx"
TRUST_EDITED="$KIT_DIR/pptv-trust-model.edited.pptx"

for required in \
  "$PYTHON" \
  "$VISUAL" \
  "$FONT_MAP" \
  "$THEME" \
  "$BASELINES/pptv-roundtrip-map.baseline.pptv.map.json" \
  "$BASELINES/pptv-trust-model.baseline.pptv.map.json" \
  "$WORD_EDITED" \
  "$MAP_EDITED" \
  "$TRUST_EDITED"
do
  if [ ! -f "$required" ]; then
    printf 'Missing required file: %s\n' "$required" >&2
    exit 2
  fi
done

mkdir -p "$RUN_DIR"
printf 'Writing this immutable verification run to:\n  %s\n\n' "$RUN_DIR"

on_exit() {
  exit_code=$?
  if [ "$exit_code" -ne 0 ]; then
    printf '\nVerification stopped with exit code %s.\n' "$exit_code" >&2
    printf 'Inspect the retained reports in:\n  %s\n' "$RUN_DIR" >&2
  fi
}
trap on_exit EXIT

pptv() {
  (
    cd "$REPO_ROOT"
    pnpm pptv "$@"
  )
}

capture_quicklook() {
  artifact=$1
  output=$2
  manifest=$3
  lane=$4
  checkpoint=$5
  "$PYTHON" "$VISUAL" capture-quicklook "$artifact" \
    --output "$output" \
    --manifest "$manifest" \
    --lane "$lane" \
    --checkpoint "$checkpoint" \
    --root "$REPO_ROOT" \
    --trusted \
    --pixel-size 1600 \
    --timeout 30
}

compare_exact() {
  baseline_manifest=$1
  candidate_manifest=$2
  comparison_manifest=$3
  "$PYTHON" "$VISUAL" compare \
    "$baseline_manifest" \
    "$candidate_manifest" \
    --manifest "$comparison_manifest" \
    --root "$REPO_ROOT"
}

printf '1/3  Recovering and regenerating the Word branch...\n'
WORD_RECOVERED="$RUN_DIR/office180-primer.recovered.md"
WORD_BASE="$RUN_DIR/office180-primer.embedded-base.md"
WORD_REPORT="$RUN_DIR/office180-primer.reconcile.json"
WORD_REGENERATED="$RUN_DIR/office180-primer.regenerated.docx"

"$PYTHON" "$REPO_ROOT/docx2md.py" "$WORD_EDITED" \
  --out "$WORD_RECOVERED" \
  --base-out "$WORD_BASE" \
  --report "$WORD_REPORT"
"$PYTHON" "$REPO_ROOT/md2docx.py" --check "$WORD_RECOVERED"
"$PYTHON" "$REPO_ROOT/md2docx.py" \
  --template "$THEME" \
  --out "$WORD_REGENERATED" \
  "$WORD_RECOVERED"

WORD_EDITED_PNG="$RUN_DIR/office180-primer.edited.quicklook.png"
WORD_EDITED_EVIDENCE="$RUN_DIR/office180-primer.edited.quicklook.evidence.json"
WORD_REGENERATED_PNG="$RUN_DIR/office180-primer.regenerated.quicklook.png"
WORD_REGENERATED_EVIDENCE="$RUN_DIR/office180-primer.regenerated.quicklook.evidence.json"

capture_quicklook \
  "$WORD_EDITED" \
  "$WORD_EDITED_PNG" \
  "$WORD_EDITED_EVIDENCE" \
  markdown-docx \
  manual-native-edited
capture_quicklook \
  "$WORD_REGENERATED" \
  "$WORD_REGENERATED_PNG" \
  "$WORD_REGENERATED_EVIDENCE" \
  markdown-docx \
  manual-source-regenerated
compare_exact \
  "$WORD_EDITED_EVIDENCE" \
  "$WORD_REGENERATED_EVIDENCE" \
  "$RUN_DIR/office180-primer.edited-vs-regenerated.evidence.json"

verify_pptv_branch() {
  stem=$1
  source=$2
  baseline_map=$3
  edited=$4

  patch="$RUN_DIR/$stem.recovered.pptv.patch.json"
  report="$RUN_DIR/$stem.reconcile.json"
  recovered="$RUN_DIR/$stem.recovered.pptv.svg"
  regenerated="$RUN_DIR/$stem.regenerated.pptx"
  regenerated_map="$RUN_DIR/$stem.regenerated.pptv.map.json"
  resolution="$KIT_DIR/$stem.reconcile-resolution.json"

  if [ -f "$resolution" ]; then
    pptv reconcile "$edited" \
      --source "$source" \
      --baseline "$baseline_map" \
      --resolution "$resolution" \
      --patch "$patch" \
      --report "$report" \
      --format json
  else
    pptv reconcile "$edited" \
      --source "$source" \
      --baseline "$baseline_map" \
      --patch "$patch" \
      --report "$report" \
      --format json
  fi
  pptv patch "$source" "$patch" --check --format json
  pptv patch "$source" "$patch" --output "$recovered" --format json
  pptv validate "$recovered" --format json
  pptv resolve "$recovered" --format json >/dev/null
  pptv text-fit "$recovered" --font-map "$FONT_MAP" --format json >/dev/null
  pptv compile "$recovered" \
    --placement 0,0,1600,900 \
    --policy identity \
    --output "$regenerated" \
    --map "$regenerated_map" \
    --format json

  "$PYTHON" "$VISUAL" capture-browser-svg "$recovered" \
    --output "$RUN_DIR/$stem.recovered.browser.png" \
    --manifest "$RUN_DIR/$stem.recovered.browser.evidence.json" \
    --checkpoint manual-source-recovered \
    --root "$REPO_ROOT" \
    --trusted \
    --width-px 1600 \
    --height-px 900 \
    --background '#ffffff' \
    --timeout 30

  edited_png="$RUN_DIR/$stem.edited.quicklook.png"
  edited_evidence="$RUN_DIR/$stem.edited.quicklook.evidence.json"
  regenerated_png="$RUN_DIR/$stem.regenerated.quicklook.png"
  regenerated_evidence="$RUN_DIR/$stem.regenerated.quicklook.evidence.json"

  capture_quicklook \
    "$edited" \
    "$edited_png" \
    "$edited_evidence" \
    pptv-pptx \
    manual-native-edited
  capture_quicklook \
    "$regenerated" \
    "$regenerated_png" \
    "$regenerated_evidence" \
    pptv-pptx \
    manual-source-regenerated
  compare_exact \
    "$edited_evidence" \
    "$regenerated_evidence" \
    "$RUN_DIR/$stem.edited-vs-regenerated.evidence.json"
}

printf '\n2/3  Reconciling the instructed PowerPoint edits...\n'
verify_pptv_branch \
  pptv-roundtrip-map \
  "$KIT_DIR/pptv-roundtrip-map.pptv.svg" \
  "$BASELINES/pptv-roundtrip-map.baseline.pptv.map.json" \
  "$MAP_EDITED"

printf '\n3/3  Discovering and reconciling the blind PowerPoint edit...\n'
verify_pptv_branch \
  pptv-trust-model \
  "$KIT_DIR/pptv-trust-model.pptv.svg" \
  "$BASELINES/pptv-trust-model.baseline.pptv.map.json" \
  "$TRUST_EDITED"

trap - EXIT
printf '\nPASS: all three native Office branches returned to source and regenerated with exact same-renderer pixels.\n'
printf 'Review the recovered source, typed patches, reports, and captures in:\n  %s\n' "$RUN_DIR"
