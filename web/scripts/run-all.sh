#!/usr/bin/env bash
# Run every headless UI suite against the dev server (:5173) with the fake back-ends, and summarise problems.
#   bash scripts/run-all.sh [out-dir=../.shots/all]
cd "$(dirname "$0")/.."
OUT=${1:-../.shots/all}
mkdir -p "$OUT"
node scripts/fake-llm.mjs 1235 >"$OUT/fake-llm.log" 2>&1 &
node scripts/fake-tryai.mjs 1236 >"$OUT/fake-tryai.log" 2>&1 &
node scripts/fake-engine.mjs 1237 >"$OUT/fake-engine.log" 2>&1 &
node scripts/fake-youtube.mjs 1238 >"$OUT/fake-youtube.log" 2>&1 &
trap 'kill $(jobs -p) 2>/dev/null' EXIT
sleep 2
run() { # name url steps
  echo "=== $1"
  UI_MODE=${4:-pro} node scripts/cdp-shot.mjs "$2" "$OUT/$1" "scripts/$3" >"$OUT/$1.log" 2>&1
  grep -v '^\[shot\]' "$OUT/$1.log" | grep -iE 'error|disabled|no (toast|modal|button|input|result|blocks|sound)|exception|cannot|undefined' | grep -v 'chrome-extension' | head -5
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
run phaseF "http://localhost:5173/#demo" steps-phaseF.json
run describe "http://localhost:5173/#demo" steps-describe.json
run wizard "http://localhost:5173/" steps-wizard.json simple
echo "=== done"
