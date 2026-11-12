#!/usr/bin/env bash
# Run every headless UI suite against the dev server (:5173) with the fake back-ends, and summarise problems.
#   bash scripts/run-all.sh [out-dir=../.shots/all]
#   SUITES="v3 review"  run only these suites
#   STRICT=1            exit 1 when a suite prints an unexpected problem (CI release gate)
#   OFFLINE=1           skip suites that need the internet / big model downloads (describe)
cd "$(dirname "$0")/.."
OUT=${1:-../.shots/all}
mkdir -p "$OUT"
node scripts/fake-llm.mjs 1235 >"$OUT/fake-llm.log" 2>&1 &
node scripts/fake-tryai.mjs 1236 >"$OUT/fake-tryai.log" 2>&1 &
node scripts/fake-engine.mjs 1237 >"$OUT/fake-engine.log" 2>&1 &
node scripts/fake-youtube.mjs 1238 >"$OUT/fake-youtube.log" 2>&1 &
trap 'kill $(jobs -p) 2>/dev/null' EXIT
sleep 2
FAILED=0
# Lines some suites print by design (e.g. the demo has no voiceover, toasts that vanished before the check).
EXPECTED='no button \(no voiceover\?\)|"no modal"|"apply disabled"|"no toast"|getAllPromptList|chrome-extension|Receiving end does not exist|TensorFlow Lite XNNPACK delegate|OpenGL error checking is disabled'
run() { # name url steps [ui-mode]
  if [ -n "$SUITES" ] && [[ " $SUITES " != *" $1 "* ]]; then return; fi
  if [ -n "$OFFLINE" ] && [[ " describe " == *" $1 "* ]]; then return; fi
  echo "=== $1"
  local bad try
  # A suite that reports a problem runs once more: a real bug fails twice, a one-off timing hiccup (slow CI) does not.
  for try in 1 2; do
    UI_MODE=${4:-pro} timeout 240 node scripts/cdp-shot.mjs "$2" "$OUT/$1" "scripts/$3" >"$OUT/$1.log" 2>&1 || echo "[eval] \"suite error or timeout (exit $?)\"" >>"$OUT/$1.log"
    bad=$(grep -v '^\[shot\]' "$OUT/$1.log" | grep -iE 'error|disabled|no (toast|modal|button|input|result|blocks|sound)|exception|cannot|undefined' | grep -vE "$EXPECTED" | head -5)
    [ -z "$bad" ] && break
    if [ "$try" = 1 ]; then
      cp "$OUT/$1.log" "$OUT/$1.try1.log"
      echo "[retry] $1 reported a problem, running it once more"
      if [ -n "$GITHUB_ACTIONS" ]; then echo "::warning title=UI suite $1 retried::$(echo "$bad" | head -2 | tr '
' ' ' | cut -c1-400)"; fi
    fi
  done
  if [ -n "$bad" ]; then
    echo "$bad"; FAILED=1
    # In CI, show the whole suite log so the cause is visible in the job output.
    if [ -n "$STRICT" ]; then echo "--- $1 log (last 40 lines) ---"; grep -vE "$EXPECTED" "$OUT/$1.log" | tail -40; echo "---"; fi
    # On GitHub Actions also raise an annotation (visible on the run page and through the public API).
    if [ -n "$GITHUB_ACTIONS" ]; then echo "::error title=UI suite $1::$(echo "$bad" | head -3 | tr '
' ' ' | cut -c1-600)"; fi
  fi
}
run v3 "http://localhost:5173/#demo" steps-v3.json
run review "http://localhost:5173/#projects" steps-review-v3.json
run phaseA "http://localhost:5173/#demo" steps-phaseA.json
run silence "http://localhost:5173/#demo" steps-silence.json
run phaseB "http://localhost:5173/#demo" steps-phaseB.json
run ai "http://localhost:5173/#demo" steps-ai.json
run tryai "http://localhost:5173/" steps-tryai.json
run aivideo "http://localhost:5173/" steps-aivideo.json
run prompts "http://localhost:5173/#demo" steps-prompts.json
run growth "http://localhost:5173/#demo" steps-growth.json
run handdrawn "http://localhost:5173/" steps-handdrawn.json
run phaseE "http://localhost:5173/#demo" steps-phaseE.json
run describe "http://localhost:5173/#demo" steps-describe.json
run typostudio "http://localhost:5173/#demo" steps-typostudio.json
run timeline "http://localhost:5173/#demo" steps-timeline.json
run dragdrop "http://localhost:5173/#demo" steps-dragdrop.json
run formats "http://localhost:5173/#demo" steps-formats.json
run newproject "http://localhost:5173/#projects" steps-newproject.json
run v36 "http://localhost:5173/#demo" steps-v36.json
run tidy "http://localhost:5173/#demo" steps-tidy.json
run overview "http://localhost:5173/#demo" steps-overview.json
run motion "http://localhost:5173/#demo" steps-motion.json
run story "http://localhost:5173/#demo" steps-story.json
run smart "http://localhost:5173/#demo" steps-smart.json
run stick "http://localhost:5173/#demo" steps-stick.json
run cartoon "http://localhost:5173/#demo" steps-cartoon.json
run pip "http://localhost:5173/#demo" steps-pip.json
run wizard "http://localhost:5173/" steps-wizard.json simple
echo "=== done"
if [ -n "$STRICT" ] && [ "$FAILED" = 1 ]; then echo "UI suites reported problems"; exit 1; fi
