#!/usr/bin/env bash
#
# onto runtime stream watcher
#
# Renders runtime-events.ndjson from a review or reconstruct session. The
# stream is intentionally generic: each line is already tagged with pipeline,
# source, and stdout/stderr/status by the deterministic runtime.
#
# Usage:
#   bash scripts/onto-runtime-watch.sh /path/to/session
#   bash scripts/onto-runtime-watch.sh                 # newest runtime stream

set -uo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

if [ "${1:-}" != "" ]; then
  SESSION_ROOT="$1"
else
  LATEST_LOG="$(
    find .onto -path '*/runtime-events.ndjson' -type f -print 2>/dev/null \
      | while IFS= read -r log; do
          mtime="$(stat -f %m "$log" 2>/dev/null || stat -c %Y "$log" 2>/dev/null || echo 0)"
          printf '%s\t%s\n' "$mtime" "$log"
        done \
      | sort -rn \
      | head -1 \
      | cut -f2-
  )"
  if [ -n "$LATEST_LOG" ]; then
    SESSION_ROOT="$(dirname "$LATEST_LOG")"
  fi
fi

if [ -z "${SESSION_ROOT:-}" ] || [ ! -d "$SESSION_ROOT" ]; then
  echo "Error: no runtime-observed session found." >&2
  echo "  Pass an explicit session-root: bash scripts/onto-runtime-watch.sh \"<session-root>\"" >&2
  exit 1
fi

SESSION_ROOT="$(cd "$SESSION_ROOT" && pwd)"
EVENT_LOG="$SESSION_ROOT/runtime-events.ndjson"
SESSION_ID="$(basename "$SESSION_ROOT")"

if [ -t 1 ]; then
  C_RESET=$'\033[0m'
  C_BOLD=$'\033[1m'
  C_DIM=$'\033[2m'
  C_GREEN=$'\033[32m'
  C_RED=$'\033[31m'
  C_CYAN=$'\033[36m'
else
  C_RESET=""
  C_BOLD=""
  C_DIM=""
  C_GREEN=""
  C_RED=""
  C_CYAN=""
fi

echo "${C_BOLD}onto runtime stream${C_RESET} ${C_DIM}${SESSION_ID}${C_RESET}"
echo "${C_DIM}${SESSION_ROOT}${C_RESET}"

for _ in {1..120}; do
  [ -f "$EVENT_LOG" ] && break
  sleep 0.5
done

if [ ! -f "$EVENT_LOG" ]; then
  echo "${C_RED}No runtime-events.ndjson appeared within 60s.${C_RESET}" >&2
  exit 1
fi

tail -n +1 -F "$EVENT_LOG" 2>/dev/null | node -e '
const readline = require("node:readline");

const tty = process.stdout.isTTY;
const c = {
  reset: tty ? "\u001b[0m" : "",
  dim: tty ? "\u001b[2m" : "",
  green: tty ? "\u001b[32m" : "",
  red: tty ? "\u001b[31m" : "",
  cyan: tty ? "\u001b[36m" : "",
};

function timeOf(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  return date.toLocaleTimeString("en-GB", { hour12: false });
}

function streamColor(stream) {
  if (stream === "stderr") return c.red;
  if (stream === "stdout") return c.green;
  return c.cyan;
}

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    process.stdout.write(`${c.dim}${line}${c.reset}\n`);
    return;
  }
  const source = event.source ?? {};
  const sourceParts = [source.label ?? source.kind ?? "runtime"];
  if (source.unitId) sourceParts.push(source.unitId);
  if (source.stageId) sourceParts.push(source.stageId);
  if (source.processId) sourceParts.push(`pid=${source.processId}`);
  const stream = event.stream ?? "status";
  const prefix =
    `${c.dim}[${timeOf(event.timestamp)}]${c.reset} ` +
    `[${event.pipeline ?? "runtime"}] ` +
    `[${sourceParts.join(":")}] ` +
    `${streamColor(stream)}[${stream}]${c.reset}`;
  process.stdout.write(`${prefix} ${String(event.message ?? "")}\n`);
});
'
