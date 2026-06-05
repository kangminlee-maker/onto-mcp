#!/usr/bin/env bash
# Repo-layout guard for retired root-level paths.

set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

failures=0

fail_path() {
  failures=$((failures + 1))
  printf '[retired-root-paths] violation: %s\n' "$1"
}

if [ -e "golden" ]; then
  fail_path "root golden/ is retired and must not exist at the repository root"
fi

tracked_golden=""
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  tracked_golden="$(git ls-files -- golden)"
fi
if [ -n "$tracked_golden" ]; then
  while IFS= read -r path; do
    [ -z "$path" ] && continue
    fail_path "tracked retired root path ${path}"
  done <<< "$tracked_golden"
fi

if [ "$failures" -gt 0 ]; then
  printf '[retired-root-paths] FAIL -- %d retired root path violation(s).\n' "$failures"
  exit 1
fi

printf '[retired-root-paths] PASS -- root golden/ is absent and untracked.\n'
