#!/usr/bin/env bash
# .onto/ allowlist guard — CI lint.
#
# Phase 1 of the repo-layout migration (PR #151) replaced the blanket
# `.onto/` .gitignore rule with an enumerated list of ephemeral subdirs.
# That flip made `.onto/` default-track instead of default-ignore. Without
# a guard, a contributor adding a new runtime-ephemeral directory (for
# example `.onto/cache/`) and forgetting to add it to .gitignore would
# silently start committing session artifacts.
#
# This script catches that case by verifying every tracked path under
# `.onto/` matches one of the structural subdirectory globs in ALLOWED.
# Paths outside the allowlist fail CI and the contributor sees guidance
# on whether to extend the allowlist (structural) or .gitignore (ephemeral).
#
# Usage:
#   bash scripts/check-onto-allowlist.sh             # Default: check git index
#   bash scripts/check-onto-allowlist.sh --verbose   # Also print per-path match trace
#   bash scripts/check-onto-allowlist.sh --self-test # Fixture-based logic check
#   bash scripts/check-onto-allowlist.sh --help      # Print usage
#
# Exit 0 — pass. Exit 1 — allowlist violation(s) found. Exit 2 — invalid args.

set -euo pipefail

# Structural (versioned) subdirectory prefixes. Runtime-ephemeral directories
# remain ignored; archived command surfaces live under development-records/.
ALLOWED=(
  ".onto/domains"
  ".onto/roles"
  ".onto/processes"
  ".onto/principles"
  ".onto/authority"
)

# Exact-match single files. Use this list (instead of ALLOWED) when a single
# tracked file under `.onto/` does not belong to a structural subdirectory.
# Added 2026-05-22: `.onto/settings.json` is tracked as the project settings
# reference (other onto-X repos still ignore it locally — repo-scoped policy).
ALLOWED_FILES=(
  ".onto/settings.json"
)

# Ephemeral subdirs are ignored via .gitignore (see repo root) and never
# appear in `git ls-files` output. Listed here for documentation:
#   .onto/review/       .onto/builds/       .onto/learnings/
#   .onto/govern/       .onto/reconstruct/  .onto/temp/

VERBOSE=false

usage() {
  cat <<'USAGE'
Usage: scripts/check-onto-allowlist.sh [OPTIONS]

Checks tracked paths under .onto/ against a structural allowlist so that
accidentally-tracked ephemeral files (sessions, caches, temp artifacts)
fail CI instead of silently entering the repo.

OPTIONS:
  --verbose, -v   Print a [match] trace line for each allowed path.
  --self-test     Run guard logic against built-in fixtures (does NOT
                  touch the git index). Exits 0 when all 3 cases pass,
                  1 when any regression is detected.
  --help, -h      Print this message.

Exit codes:
  0  All tracked .onto/ paths are within ALLOWED (or self-test passed)
  1  One or more violations (or self-test regression)
  2  Invalid argument
USAGE
}

# Pure check: evaluates a list of paths against ALLOWED. Prints result lines
# to stdout. Returns 0 if zero violations, 1 otherwise.
#
# Stdout format (machine-parseable):
#   [match] <path>   <prefix>/    (only when VERBOSE=true)
#   [violation] <path>            (one per violation)
#   __SUMMARY__ matched=<n> violations=<n>  (final line, always emitted)
check_paths() {
  local -a paths=("$@")
  local -a violations=()
  local matched=0

  for file in "${paths[@]}"; do
    [ -z "$file" ] && continue
    local is_match=false
    local matched_prefix=""
    for prefix in "${ALLOWED[@]}"; do
      if [[ "$file" == "$prefix"/* ]]; then
        is_match=true
        matched_prefix="$prefix"
        break
      fi
    done
    if [ "$is_match" = "false" ]; then
      for exact in "${ALLOWED_FILES[@]}"; do
        if [[ "$file" == "$exact" ]]; then
          is_match=true
          matched_prefix="$exact"
          break
        fi
      done
    fi
    if [ "$is_match" = "true" ]; then
      matched=$((matched + 1))
      [ "$VERBOSE" = "true" ] && printf "  [match] %s  →  %s/\n" "$file" "$matched_prefix"
    else
      violations+=("$file")
      printf "  [violation] %s\n" "$file"
    fi
  done

  printf "__SUMMARY__ matched=%d violations=%d\n" "$matched" "${#violations[@]}"

  if [ ${#violations[@]} -gt 0 ]; then
    return 1
  fi
  return 0
}

# Renders a failure message with resolution guidance.
print_failure_guidance() {
  cat <<'GUIDANCE'

Resolution guidance:
  - STRUCTURAL (versioned): add the new top-level subdir name to ALLOWED
    in scripts/check-onto-allowlist.sh (example: ".onto/roles").
  - EPHEMERAL (session artifact / cache / temp): add a pattern to
    .gitignore and untrack the files with 'git rm --cached <path>'.

Policy context: .gitignore uses an enumerated-ephemeral list so structural
.onto/X/ dirs are default-tracked. This guard catches accidental tracking
of new ephemeral dirs that weren't listed in .gitignore.
GUIDANCE
}

# Runs three fixture-based test cases against check_paths. Does not touch
# the git index. Returns 0 when all 3 cases match their expected outcome.
run_self_test() {
  echo "[self-test] Running allowlist guard against built-in fixtures (no git index touched)."
  echo ""

  local failed=0

  # Case 1: all paths in allowlist → expect exit 0
  local -a pass_paths=(
    ".onto/domains/software-engineering/concepts.md"
    ".onto/domains/nested/deep/path/file.md"
    ".onto/roles/logic.md"
    ".onto/processes/review.md"
    ".onto/principles/ontology-as-code-guideline.md"
    ".onto/authority/core-lexicon.yaml"
  )
  echo "[self-test] Case 1 (expect PASS): ${#pass_paths[@]} allowlist-conforming paths"
  local case1_out
  case1_out=$(check_paths "${pass_paths[@]}" 2>&1) && case1_rc=0 || case1_rc=$?
  if [ "$case1_rc" -eq 0 ] && echo "$case1_out" | grep -q "__SUMMARY__ matched=6 violations=0"; then
    echo "  ✓ guard accepted all ${#pass_paths[@]} conforming paths"
  else
    echo "  ✗ guard rejected conforming paths (regression)"
    echo "$case1_out" | sed 's/^/    /'
    failed=$((failed + 1))
  fi

  # Case 2: all paths outside allowlist → expect exit 1. Includes Phase 6
  # review follow-up (U-review): `.onto/authorityish/` is a collision-
  # adjacent directory that differs from `.onto/authority` by a suffix.
  # Segment-bound matching (the `/*` glob pattern in check_paths) must
  # reject it; if someone replaces `"$file" == "$prefix"/*` with a bare
  # string prefix test, this case catches the regression.
  local -a fail_paths=(
    ".onto/test-violation/dummy.md"
    ".onto/cache/session.json"
    ".onto/ephemeral.log"
    ".onto/authorityish/collision-adjacent.yaml"
  )
  echo "[self-test] Case 2 (expect FAIL): ${#fail_paths[@]} violating paths"
  local case2_out
  case2_out=$(check_paths "${fail_paths[@]}" 2>&1) && case2_rc=0 || case2_rc=$?
  if [ "$case2_rc" -eq 1 ] && echo "$case2_out" | grep -q "__SUMMARY__ matched=0 violations=4"; then
    echo "  ✓ guard correctly rejected all ${#fail_paths[@]} violating paths"
  else
    echo "  ✗ guard accepted violating paths (logic broken)"
    echo "$case2_out" | sed 's/^/    /'
    failed=$((failed + 1))
  fi

  # Case 3: mixed → expect exit 1 with exactly 1 violation reported
  local -a mixed_paths=(
    ".onto/processes/ok.md"
    ".onto/violation/bad.md"
  )
  echo "[self-test] Case 3 (expect FAIL with 1 violation): mixed"
  local case3_out
  case3_out=$(check_paths "${mixed_paths[@]}" 2>&1) && case3_rc=0 || case3_rc=$?
  if [ "$case3_rc" -eq 1 ] && echo "$case3_out" | grep -q "__SUMMARY__ matched=1 violations=1"; then
    echo "  ✓ guard identified exactly 1 violation out of 2 paths"
  else
    echo "  ✗ guard summary mismatch (expected matched=1 violations=1)"
    echo "$case3_out" | sed 's/^/    /'
    failed=$((failed + 1))
  fi

  # Case 4: exact-match single-file allowlist (ALLOWED_FILES path).
  # Verifies that single-file entries (e.g. `.onto/settings.json`) match
  # without falling under the prefix/* logic. Regression target: someone
  # removing the ALLOWED_FILES loop or merging it into ALLOWED would
  # accidentally match `.onto/settings.json/foo` (a non-existent sub-path)
  # while rejecting `.onto/settings.json` itself.
  local -a exact_paths=(
    ".onto/settings.json"
  )
  echo "[self-test] Case 4 (expect PASS): exact-match single-file allowlist"
  local case4_out
  case4_out=$(check_paths "${exact_paths[@]}" 2>&1) && case4_rc=0 || case4_rc=$?
  if [ "$case4_rc" -eq 0 ] && echo "$case4_out" | grep -q "__SUMMARY__ matched=1 violations=0"; then
    echo "  ✓ guard accepted exact-match allowlist file"
  else
    echo "  ✗ guard rejected exact-match allowlist file (regression)"
    echo "$case4_out" | sed 's/^/    /'
    failed=$((failed + 1))
  fi

  echo ""
  if [ "$failed" -eq 0 ]; then
    echo "[self-test] PASS — 4/4 cases succeeded."
    return 0
  else
    echo "[self-test] FAIL — ${failed}/4 case(s) failed. Guard logic regression."
    return 1
  fi
}

# ─── Arg parsing ─────────────────────────────────────────────────────────
MODE="default"

while [ $# -gt 0 ]; do
  case "$1" in
    --verbose|-v) VERBOSE=true; shift ;;
    --self-test)  MODE="self-test"; shift ;;
    --help|-h)    usage; exit 0 ;;
    *) printf "Unknown argument: %s\n\n" "$1" >&2; usage >&2; exit 2 ;;
  esac
done

# ─── Self-test mode ──────────────────────────────────────────────────────
if [ "$MODE" = "self-test" ]; then
  run_self_test
  exit $?
fi

# ─── Default mode: check git-tracked paths ───────────────────────────────
# Portable array populate (macOS bash 3.2 lacks `mapfile`).
tracked=()
while IFS= read -r line; do
  [ -z "$line" ] && continue
  tracked+=("$line")
done < <(git ls-files '.onto/' 2>/dev/null || true)

if [ ${#tracked[@]} -eq 0 ]; then
  echo "[allowlist-guard] PASS — no tracked files under .onto/."
  exit 0
fi

if check_out=$(check_paths "${tracked[@]}" 2>&1); then
  rc=0
else
  rc=$?
fi

# Parse summary line
summary=$(printf '%s\n' "$check_out" | grep '^__SUMMARY__' | tail -1 || true)
matched=$(printf '%s\n' "$summary" | sed -E 's/.*matched=([0-9]+).*/\1/')
violations=$(printf '%s\n' "$summary" | sed -E 's/.*violations=([0-9]+).*/\1/')
display=$(printf '%s\n' "$check_out" | grep -v '^__SUMMARY__' || true)

if [ "$rc" -ne 0 ]; then
  printf "[allowlist-guard] FAIL — %s violation(s) out of %d tracked .onto/ file(s).\n\n" \
    "$violations" "${#tracked[@]}"
  echo "Tracked paths outside the allowlist:"
  printf '%s\n' "$display" | grep '\[violation\]' | sed 's/  \[violation\] /  /' || true
  print_failure_guidance
  exit 1
fi

printf "[allowlist-guard] PASS — %s tracked .onto/ file(s) all within allowlist:\n" "$matched"
for prefix in "${ALLOWED[@]}"; do
  count=$(printf '%s\n' "${tracked[@]}" | grep -c "^${prefix}/" || true)
  printf "  %s/**  %s file(s)\n" "$prefix" "$count"
done
for exact in "${ALLOWED_FILES[@]}"; do
  count=$(printf '%s\n' "${tracked[@]}" | grep -cFx "$exact" || true)
  printf "  %s    %s file(s)\n" "$exact" "$count"
done
if [ "$VERBOSE" = "true" ]; then
  echo ""
  printf '%s\n' "$display" | grep '\[match\]' || true
fi
exit 0
