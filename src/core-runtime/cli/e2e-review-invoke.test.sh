#!/usr/bin/env bash
# E2E Test Suite for review:invoke
# Run from project root: bash src/core-runtime/cli/e2e-review-invoke.test.sh
#
# Exit codes:
#   0 = all tests passed
#   1 = at least one test failed unexpectedly

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$PROJECT_ROOT"
export PATH="$PROJECT_ROOT/bin:$PATH"

PASS_COUNT=0
FAIL_COUNT=0
UNEXPECTED_COUNT=0

# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

run_expect_pass() {
  local tname="$1"
  shift
  local tout
  tout=$(npm run review:invoke -- "$@" 2>&1)
  local texit=$?
  local tstatus
  tstatus=$(echo "$tout" | grep '"record_status"' | head -1 | sed 's/.*: "//;s/".*//')

  if [ $texit -eq 0 ]; then
    echo "  PASS  $tname (status=$tstatus)"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "  FAIL! $tname (expected pass, got exit=$texit)"
    UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
  fi
}

run_expect_fail() {
  local tname="$1"
  shift
  local tout
  tout=$(npm run review:invoke -- "$@" 2>&1)
  local texit=$?

  if [ $texit -ne 0 ]; then
    echo "  PASS  $tname (expected fail, exit=$texit)"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "  FAIL! $tname (expected fail, but passed)"
    UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
  fi
}

run_expect_status() {
  local tname="$1"
  local expected_status="$2"
  shift 2
  local tout
  tout=$(npm run review:invoke -- "$@" 2>&1)
  local texit=$?
  local tstatus
  tstatus=$(echo "$tout" | grep '"record_status"' | head -1 | sed 's/.*: "//;s/".*//')

  if [ $texit -eq 0 ] && [ "$tstatus" = "$expected_status" ]; then
    echo "  PASS  $tname (status=$tstatus)"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "  FAIL! $tname (expected status=$expected_status, got exit=$texit status=$tstatus)"
    UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
  fi
}

# ─────────────────────────────────────────────
# Setup fixtures
# ─────────────────────────────────────────────

FIXTURE_DIR="/tmp/onto-e2e-fixtures-$$"
mkdir -p "$FIXTURE_DIR"

setup_fixtures() {
  # binary file
  printf '\x89PNG\r\n' > "$FIXTURE_DIR/binary.png"

  # empty file
  touch "$FIXTURE_DIR/empty.ts"

  # Korean path
  mkdir -p "$FIXTURE_DIR/한글폴더"
  echo "const x = 1;" > "$FIXTURE_DIR/한글폴더/test.ts"

  # non-UTF-8 file
  printf '\xB0\xA1\xB3\xAA\xB4\xD9\xB6\xF3' > "$FIXTURE_DIR/euckr.txt"

  # dotfile
  echo "SECRET=abc" > "$FIXTURE_DIR/.env"

  # deep nested path
  mkdir -p "$FIXTURE_DIR/a/b/c/d/e/f/g/h/i/j"
  echo "x" > "$FIXTURE_DIR/a/b/c/d/e/f/g/h/i/j/deep.ts"

  # path with spaces
  mkdir -p "$FIXTURE_DIR/space dir"
  echo "const x = 1;" > "$FIXTURE_DIR/space dir/my file.ts"

  # large directory
  mkdir -p "$FIXTURE_DIR/large-dir"
  for i in $(seq 1 100); do touch "$FIXTURE_DIR/large-dir/file-$i.ts"; done

  # symlink loop
  ln -sf "$FIXTURE_DIR/link-b" "$FIXTURE_DIR/link-a" 2>/dev/null
  ln -sf "$FIXTURE_DIR/link-a" "$FIXTURE_DIR/link-b" 2>/dev/null

  # non-git directory
  mkdir -p "$FIXTURE_DIR/no-git"
  echo "x" > "$FIXTURE_DIR/no-git/a.txt"
}

cleanup_fixtures() {
  rm -rf "$FIXTURE_DIR"
  # Clean up collision test session
  rm -rf "$PROJECT_ROOT/.onto/review/e2e-collision-test"
}

trap cleanup_fixtures EXIT
setup_fixtures

echo "review:invoke E2E Test Suite"
echo "================================="
echo "project root: $PROJECT_ROOT"
echo "fixtures: $FIXTURE_DIR"
echo ""

# ─────────────────────────────────────────────
# 1. HAPPY PATH
# ─────────────────────────────────────────────

echo "── Happy Path ──"

run_expect_pass "T1: file/light/mock" \
  src/core-runtime/cli/review-invoke.ts "security check" \
  --executor-realization mock --review-mode core-axis

run_expect_pass "T2: dir/full/mock" \
  . "architecture review" \
  --executor-realization mock --review-mode full

run_expect_pass "T3: external-dir/auto-approve" \
  /tmp "external dir review" \
  --executor-realization mock

run_expect_pass "T4: domain-token" \
  src/ "ontology check" \
  --domain llm-native-development --executor-realization mock --review-mode core-axis

run_expect_pass "T5: diff-range" \
  . "changes review" \
  --diff-range ad8ce13..c19e107 \
  --executor-realization mock --review-mode core-axis

run_expect_pass "T6: custom-lenses" \
  src/core-runtime/cli/ "logic only" \
  --executor-realization mock \
  --lens-id logic --lens-id pragmatics

run_expect_pass "T9: bundle" \
  --primary-ref src/core-runtime/cli/review-invoke.ts \
  --member-ref package.json \
  --target-scope-kind bundle \
  --executor-realization mock \
  --request-text "bundle review"

run_expect_pass "T12: max-concurrent" \
  src/ "parallelism test" \
  --executor-realization mock --max-concurrent-lenses 2 --review-mode core-axis

echo ""

# ─────────────────────────────────────────────
# 2. ERROR PATH
# ─────────────────────────────────────────────

echo "── Error Path ──"

run_expect_fail "T7: invalid-target" \
  /nonexistent/path "test" \
  --executor-realization mock

run_expect_fail "T8: missing-intent" \
  src/core-runtime/cli/review-invoke.ts \
  --executor-realization mock

echo ""

# ─────────────────────────────────────────────
# 3. SECURITY EDGE CASES
# ─────────────────────────────────────────────

echo "── Security ──"

run_expect_fail "E1: diff-range-injection" \
  . "test" \
  --diff-range '$(echo hacked)' \
  --executor-realization mock

echo "=== E2: session-id-collision ==="
FIRST_OUT=$(npm run review:invoke -- src/core-runtime/cli/review-invoke.ts "first" \
  --executor-realization mock --session-id e2e-collision-test --review-mode core-axis 2>&1)
FIRST_EXIT=$?
SECOND_OUT=$(npm run review:invoke -- src/core-runtime/cli/review-invoke.ts "second" \
  --executor-realization mock --session-id e2e-collision-test --review-mode core-axis 2>&1)
SECOND_EXIT=$?
if [ $FIRST_EXIT -eq 0 ] && [ $SECOND_EXIT -ne 0 ]; then
  echo "  PASS  E2: session-id-collision (first=ok second=blocked)"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo "  FAIL! E2: session-id-collision (first=$FIRST_EXIT second=$SECOND_EXIT)"
  UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
fi

run_expect_fail "E3: unsupported-executor-realization-api" \
  src/ "test" \
  --executor-realization api --review-mode core-axis

echo ""

# ─────────────────────────────────────────────
# 4. INPUT VALIDATION
# ─────────────────────────────────────────────

echo "── Input Validation ──"

echo "=== E4: request-text-truncation ==="
LONG_TEXT=$(python3 -c "print('x' * 3000)")
E4_OUT=$(npm run review:invoke -- src/core-runtime/cli/review-invoke.ts "$LONG_TEXT" \
  --executor-realization mock --review-mode core-axis 2>&1)
E4_EXIT=$?
if [ $E4_EXIT -eq 0 ]; then
  echo "  PASS  E4: request-text-truncation"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo "  FAIL! E4: request-text-truncation (exit=$E4_EXIT)"
  UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
fi

run_expect_pass "E5: max-embed-lines-zero" \
  src/core-runtime/cli/review-invoke.ts "test" \
  --executor-realization mock --review-mode core-axis --max-embed-lines=1

echo ""

# ─────────────────────────────────────────────
# 5. INPUT BOUNDARY
# ─────────────────────────────────────────────

echo "── Input Boundary ──"

run_expect_pass "E6: binary-file" \
  "$FIXTURE_DIR/binary.png" "binary test" \
  --executor-realization mock --review-mode core-axis

run_expect_pass "E7: empty-file" \
  "$FIXTURE_DIR/empty.ts" "empty test" \
  --executor-realization mock --review-mode core-axis

run_expect_pass "E8: korean-path" \
  "$FIXTURE_DIR/한글폴더/test.ts" "korean test" \
  --executor-realization mock --review-mode core-axis

run_expect_fail "E9: diff-no-git" \
  "$FIXTURE_DIR/no-git" "test" \
  --diff-range HEAD~1 \
  --executor-realization mock --review-mode core-axis

run_expect_fail "E10: invalid-commit" \
  . "test" \
  --diff-range "0000000..fffffff" \
  --executor-realization mock --review-mode core-axis

run_expect_pass "E12: non-utf8" \
  "$FIXTURE_DIR/euckr.txt" "encoding test" \
  --executor-realization mock --review-mode core-axis

run_expect_pass "E13: symlink-loop-dir" \
  "$FIXTURE_DIR" "symlink test" \
  --executor-realization mock --review-mode core-axis

run_expect_pass "E15: large-directory" \
  "$FIXTURE_DIR/large-dir" "large test" \
  --executor-realization mock --review-mode core-axis

run_expect_pass "E17: deep-nested" \
  "$FIXTURE_DIR/a/b/c/d/e/f/g/h/i/j/deep.ts" "deep test" \
  --executor-realization mock --review-mode core-axis

run_expect_pass "E18: spaces-in-path" \
  "$FIXTURE_DIR/space dir/my file.ts" "space test" \
  --executor-realization mock --review-mode core-axis

run_expect_pass "E19: dotfile" \
  "$FIXTURE_DIR/.env" "dotfile test" \
  --executor-realization mock --review-mode core-axis

run_expect_fail "E20: diff-empty-range" \
  . "no change" \
  --diff-range "HEAD..HEAD" \
  --executor-realization mock --review-mode core-axis

echo ""

# ─────────────────────────────────────────────
# 6. CONFIG EDGE CASES
# ─────────────────────────────────────────────

echo "── Config ──"

run_expect_pass "E21: no-domain-default" \
  src/core-runtime/cli/review-invoke.ts "no domain" \
  --executor-realization mock --review-mode core-axis

run_expect_pass "E22: explicit-no-domain (@- syntax)" \
  src/core-runtime/cli/review-invoke.ts "no domain" \
  --executor-realization mock --review-mode core-axis \
  --requested-domain-token "@-"

run_expect_pass "E22a: --no-domain canonical flag" \
  src/core-runtime/cli/review-invoke.ts "no domain" \
  --executor-realization mock --review-mode core-axis \
  --no-domain

run_expect_pass "E22b: --domain canonical option" \
  src/core-runtime/cli/review-invoke.ts "explicit domain" \
  --executor-realization mock --review-mode core-axis \
  --domain software-engineering

run_expect_fail "E22c: --domain conflicts with --no-domain" \
  src/core-runtime/cli/review-invoke.ts "conflict" \
  --executor-realization mock --review-mode core-axis \
  --domain software-engineering --no-domain

run_expect_fail "E23: unknown-executor-rejected" \
  src/ "test" \
  --executor-realization banana --review-mode core-axis

echo ""

# ─────────────────────────────────────────────
# 7. OPTION INTERACTIONS
# ─────────────────────────────────────────────

echo "── Option Interactions ──"

run_expect_pass "E24: diff+bundle-priority" \
  --diff-range ad8ce13..c19e107 \
  --primary-ref src/core-runtime/cli/review-invoke.ts \
  --member-ref package.json \
  --target-scope-kind bundle \
  --executor-realization mock \
  --request-text "conflict test" \
  --requested-target .

run_expect_pass "E25: light+9lenses-override" \
  src/ "override test" \
  --executor-realization mock --review-mode core-axis \
  --lens-id logic --lens-id structure --lens-id dependency \
  --lens-id semantics --lens-id pragmatics --lens-id evolution \
  --lens-id coverage --lens-id conciseness --lens-id axiology

run_expect_status "E26: single-lens-halts" "halted_partial" \
  src/ "single lens" \
  --executor-realization mock \
  --lens-id logic

echo ""

# ─────────────────────────────────────────────
# 8. STATE / RECOVERY
# ─────────────────────────────────────────────

echo "── State / Recovery ──"

run_expect_fail "E11: write-permission" \
  src/core-runtime/cli/review-invoke.ts "test" \
  --executor-realization mock --review-mode core-axis \
  --project-root /nonexistent-readonly

echo "=== E14: partial-session-complete ==="
EXISTING_SESSION=$(ls -dt "$PROJECT_ROOT/.onto/review/20260405-"* 2>/dev/null | head -1)
if [ -d "$EXISTING_SESSION" ]; then
  PARTIAL="$PROJECT_ROOT/.onto/review/e2e-partial-test"
  mkdir -p "$PARTIAL/round1" "$PARTIAL/execution-preparation"
  cp "$EXISTING_SESSION/binding.yaml" "$PARTIAL/"
  cp "$EXISTING_SESSION/interpretation.yaml" "$PARTIAL/"
  cp "$EXISTING_SESSION/session-metadata.yaml" "$PARTIAL/"
  cp "$EXISTING_SESSION/execution-plan.yaml" "$PARTIAL/"
  # Copy only 3/9 lens outputs
  for f in logic.md structure.md axiology.md; do
    cp "$EXISTING_SESSION/round1/$f" "$PARTIAL/round1/" 2>/dev/null
  done
  E14_OUT=$(npm run review:complete-session -- \
    --project-root "$PROJECT_ROOT" \
    --session-root "$PARTIAL" \
    --request-text "partial test" 2>&1)
  E14_EXIT=$?
  rm -rf "$PARTIAL"
  if [ $E14_EXIT -eq 0 ]; then
    echo "  PASS  E14: partial-session-complete"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "  FAIL! E14: partial-session-complete (exit=$E14_EXIT)"
    UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
  fi
else
  echo "  SKIP  E14: no existing session to copy from"
fi

echo "=== E27: complete-nonexistent ==="
E27_OUT=$(npm run review:complete-session -- \
  --project-root "$PROJECT_ROOT" \
  --session-root "$PROJECT_ROOT/.onto/review/nonexistent" \
  --request-text "ghost" 2>&1)
E27_EXIT=$?
if [ $E27_EXIT -ne 0 ]; then
  echo "  PASS  E27: complete-nonexistent (expected fail)"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo "  FAIL! E27: complete-nonexistent (unexpected pass)"
  UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
fi

echo ""

# ─────────────────────────────────────────────
# 9. CONCURRENCY
# ─────────────────────────────────────────────

echo "── Concurrency ──"

echo "=== E29: parallel-reviews ==="
npm run review:invoke -- src/ "parallel-A" \
  --executor-realization mock --review-mode core-axis > /tmp/onto-e2e-a.out 2>&1 &
PID_A=$!
npm run review:invoke -- src/ "parallel-B" \
  --executor-realization mock --review-mode core-axis > /tmp/onto-e2e-b.out 2>&1 &
PID_B=$!
wait $PID_A; EXIT_A=$?
wait $PID_B; EXIT_B=$?
if [ $EXIT_A -eq 0 ] && [ $EXIT_B -eq 0 ]; then
  echo "  PASS  E29: parallel-reviews (both completed)"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo "  FAIL! E29: parallel-reviews (A=$EXIT_A B=$EXIT_B)"
  UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
fi
rm -f /tmp/onto-e2e-a.out /tmp/onto-e2e-b.out

echo ""

# ─────────────────────────────────────────────
# 10. PREPARE-ONLY
# ─────────────────────────────────────────────

echo "── Prepare-Only ──"

echo "=== E38: prepare-only ==="
E38_OUT=$(npm run review:invoke -- \
  src/ "prepare only test" \
  --executor-realization mock --review-mode core-axis --prepare-only 2>&1)
E38_EXIT=$?
E38_PREPARE=$(echo "$E38_OUT" | grep '"prepare_only"' | head -1)
E38_SESSION_ROOT=$(echo "$E38_OUT" | grep '"session_root"' | head -1 | sed 's/.*: "//;s/".*//')

E38_REQUEST_TEXT=$(echo "$E38_OUT" | grep '"request_text"' | head -1 | sed 's/.*: "//;s/".*//')

if [ $E38_EXIT -eq 0 ] && [ -n "$E38_PREPARE" ] && [ -d "$E38_SESSION_ROOT" ]; then
  # Verify request_text is present and non-empty (only non-derivable value in PrepareOnlyResult)
  if [ -z "$E38_REQUEST_TEXT" ]; then
    echo "  FAIL! E38: prepare-only (request_text missing or empty in PrepareOnlyResult)"
    UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
  # Verify session artifacts exist
  elif [ -f "$E38_SESSION_ROOT/execution-plan.yaml" ] && \
     [ -f "$E38_SESSION_ROOT/binding.yaml" ] && \
     [ -d "$E38_SESSION_ROOT/prompt-packets" ]; then
    # Verify execution artifacts do NOT exist (execution was skipped)
    if [ ! -f "$E38_SESSION_ROOT/execution-result.yaml" ] && \
       [ ! -f "$E38_SESSION_ROOT/review-record.yaml" ] && \
       [ ! -f "$E38_SESSION_ROOT/final-output.md" ]; then
      echo "  PASS  E38: prepare-only (session prepared, execution skipped, request_text present)"
      PASS_COUNT=$((PASS_COUNT + 1))
    else
      echo "  FAIL! E38: prepare-only (execution artifacts should not exist)"
      UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
    fi
  else
    echo "  FAIL! E38: prepare-only (session artifacts missing)"
    UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
  fi
else
  echo "  FAIL! E38: prepare-only (exit=$E38_EXIT, prepare_only=$E38_PREPARE)"
  UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
fi

echo ""

# ─────────────────────────────────────────────
# 11. PUBLIC CLI BOUNDARY
# ─────────────────────────────────────────────

echo "── Public CLI Boundary ──"

# E39: onto --version
echo "=== E39: onto-version ==="
E39_OUT=$(onto --version 2>&1)
E39_EXIT=$?

if [ $E39_EXIT -eq 0 ] && echo "$E39_OUT" | grep -q "onto-core"; then
  echo "  PASS  E39: onto-version"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo "  FAIL! E39: onto-version (exit=$E39_EXIT)"
  UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
fi

# E40: onto --help exposes only active public command
echo "=== E40: onto-help ==="
E40_OUT=$(onto --help 2>&1)
E40_EXIT=$?

if [ $E40_EXIT -eq 0 ] && echo "$E40_OUT" | grep -q "Usage: onto mcp" && echo "$E40_OUT" | grep -q "onto.review"; then
  echo "  PASS  E40: onto-help"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo "  FAIL! E40: onto-help (exit=$E40_EXIT)"
  UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
fi

# E41: public review subcommand is unsupported
echo "=== E41: onto-review-unsupported ==="
E41_OUT=$(onto review src/ "public cli review boundary" 2>&1)
E41_EXIT=$?

if [ $E41_EXIT -ne 0 ] && echo "$E41_OUT" | grep -q "Unsupported public CLI subcommand"; then
  echo "  PASS  E41: onto-review-unsupported"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo "  FAIL! E41: onto-review-unsupported (exit=$E41_EXIT)"
  UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
fi

# E42: public config subcommand is unsupported
echo "=== E42: onto-config-unsupported ==="
E42_OUT=$(onto config validate 2>&1)
E42_EXIT=$?

if [ $E42_EXIT -ne 0 ] && echo "$E42_OUT" | grep -q "Unsupported public CLI subcommand"; then
  echo "  PASS  E42: onto-config-unsupported"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo "  FAIL! E42: onto-config-unsupported (exit=$E42_EXIT)"
  UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
fi

# E43: external project without onto-home fails loudly on missing runtime assets
echo "=== E43: external-project-missing-onto-home ==="
E43_TMPDIR=$(mktemp -d)
mkdir -p "$E43_TMPDIR/.git"  # make it look like a project
echo "test content" > "$E43_TMPDIR/test.txt"
E43_OUT=$(npm run review:invoke -- "$E43_TMPDIR/test.txt" "trust test" \
  --executor-realization mock --review-mode core-axis \
  --project-root "$E43_TMPDIR" 2>&1)
E43_EXIT=$?

if [ $E43_EXIT -ne 0 ] && echo "$E43_OUT" | grep -q "Role definition not found"; then
  echo "  PASS  E43: external-project-missing-onto-home"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo "  FAIL! E43: external-project-missing-onto-home (exit=$E43_EXIT, expected role resolution failure)"
  UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
fi
rm -rf "$E43_TMPDIR"

# E44: external project succeeds when runtime assets are supplied via onto-home
echo "=== E44: external-project-with-onto-home ==="
E44_TMPDIR=$(mktemp -d)
mkdir -p "$E44_TMPDIR/.git"
echo "test content" > "$E44_TMPDIR/test.txt"
E44_OUT=$(npm run review:invoke -- "$E44_TMPDIR/test.txt" "trust allow test" \
  --executor-realization mock --review-mode core-axis \
  --project-root "$E44_TMPDIR" --onto-home "$PROJECT_ROOT" --allow-onto-init 2>&1)
E44_EXIT=$?

if [ $E44_EXIT -eq 0 ]; then
  echo "  PASS  E44: external-project-with-onto-home"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo "  FAIL! E44: external-project-with-onto-home (exit=$E44_EXIT)"
  UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
fi
rm -rf "$E44_TMPDIR"

echo ""

# ─────────────────────────────────────────────
# 12. COORDINATOR STATE MACHINE
# ─────────────────────────────────────────────

echo "── Coordinator State Machine ──"

# E45: coordinator start (mock, light)
echo "=== E45: coordinator-start ==="
E45_OUT=$(npm run coordinator:start -- \
  src/ "coordinator test" \
  --executor-realization mock --review-mode core-axis \
  --project-root "$PROJECT_ROOT" 2>&1)
E45_EXIT=$?
E45_STATE=$(echo "$E45_OUT" | grep '"state"' | head -1 | sed 's/.*: "//;s/".*//')
E45_SESSION_ROOT=$(echo "$E45_OUT" | grep '"session_root"' | head -1 | sed 's/.*: "//;s/".*//')
E45_AGENTS=$(echo "$E45_OUT" | grep '"lens_id"' | wc -l | tr -d ' ')

if [ $E45_EXIT -eq 0 ] && [ "$E45_STATE" = "awaiting_lens_dispatch" ] && [ -n "$E45_SESSION_ROOT" ] && [ "$E45_AGENTS" -gt 0 ]; then
  echo "  PASS  E45: coordinator-start (state=$E45_STATE, agents=$E45_AGENTS)"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo "  FAIL! E45: coordinator-start (exit=$E45_EXIT, state=$E45_STATE, agents=$E45_AGENTS)"
  UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
fi

# E46: coordinator status
echo "=== E46: coordinator-status ==="
if [ -n "$E45_SESSION_ROOT" ] && [ -d "$E45_SESSION_ROOT" ]; then
  E46_OUT=$(npm run coordinator:status -- --session-root "$E45_SESSION_ROOT" 2>&1)
  E46_EXIT=$?
  E46_STATE=$(echo "$E46_OUT" | grep '"current_state"' | head -1 | sed 's/.*: "//;s/".*//')

  if [ $E46_EXIT -eq 0 ] && [ "$E46_STATE" = "awaiting_lens_dispatch" ]; then
    echo "  PASS  E46: coordinator-status (current_state=$E46_STATE)"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "  FAIL! E46: coordinator-status (exit=$E46_EXIT, state=$E46_STATE)"
    UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
  fi
else
  echo "  SKIP  E46: no session from E45"
fi

# E47: coordinator next (lens validation → halted_partial since mock executor didn't write lens outputs)
echo "=== E47: coordinator-next-halt ==="
if [ -n "$E45_SESSION_ROOT" ] && [ -d "$E45_SESSION_ROOT" ]; then
  E47_OUT=$(npm run coordinator:next -- \
    --session-root "$E45_SESSION_ROOT" \
    --project-root "$PROJECT_ROOT" 2>&1)
  E47_EXIT=$?
  E47_STATE=$(echo "$E47_OUT" | grep '"state"' | head -1 | sed 's/.*: "//;s/".*//')

  if [ $E47_EXIT -eq 0 ] && [ "$E47_STATE" = "halted_partial" ]; then
    echo "  PASS  E47: coordinator-next-halt (state=$E47_STATE — no lens outputs)"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "  FAIL! E47: coordinator-next-halt (exit=$E47_EXIT, state=$E47_STATE)"
    UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
  fi
else
  echo "  SKIP  E47: no session from E45"
fi

# E48: coordinator next on terminal state → error
echo "=== E48: coordinator-next-terminal ==="
if [ -n "$E45_SESSION_ROOT" ] && [ -d "$E45_SESSION_ROOT" ]; then
  E48_OUT=$(npm run coordinator:next -- \
    --session-root "$E45_SESSION_ROOT" \
    --project-root "$PROJECT_ROOT" 2>&1)
  E48_EXIT=$?

  if [ $E48_EXIT -ne 0 ]; then
    echo "  PASS  E48: coordinator-next-terminal (expected fail on terminal state)"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "  FAIL! E48: coordinator-next-terminal (should fail on terminal state)"
    UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
  fi
else
  echo "  SKIP  E48: no session from E45"
fi

# E49: coordinator full cycle with mock lens outputs
echo "=== E49: coordinator-full-cycle ==="
write_e49_mock_lens_output() {
  local output_path="$1"
  local lens_name
  lens_name=$(basename "$output_path" .md)
  printf '%s\n' \
    "# Mock ${lens_name} Review Result" \
    "" \
    "### Structural Inspection" \
    "- Mock structural inspection." \
    "" \
    "### Finding" \
    "- Mock finding." \
    "" \
    "### Why" \
    "- Mock reason." \
    "" \
    "### How To Fix" \
    "- none" \
    "" \
    "### Newly Learned" \
    "- none" \
    "" \
    "### Applied Learnings" \
    "- none" \
    "" \
    "### Domain Constraints Used" \
    "[]" \
    "" \
    "### Domain Context Assumptions" \
    "[]" \
    > "$output_path"
}
write_e49_mock_lens_deliberation_output() {
  local output_path="$1"
  printf '%s\n' \
    "## Re-evaluation Summary" \
    "- mock deliberation response" \
    "" \
    "## Accepted From Other Lenses" \
    "- none" \
    "" \
    "## Contested Points" \
    "- none" \
    "" \
    "## Position Changes" \
    "- none" \
    "" \
    "## Final Lens Position" \
    "- unchanged" \
    > "$output_path"
}
write_e49_mock_teamlead_deliberation_output() {
  local output_path="$1"
  printf '%s\n' \
    '---' \
    'deliberation_status: performed' \
    '---' \
    '' \
    '## Consensus' \
    '- mock deliberation' \
    '' \
    '## Conditional Consensus' \
    '- none' \
    '' \
    '## Disagreement' \
    '- none' \
    '' \
    '## Deliberation Decision' \
    '- mock' \
    '' \
    '## Axiology-Proposed Additional Perspectives' \
    '- none' \
    '' \
    '## Purpose Alignment Verification' \
    '- mock' \
    '' \
    '## Final Review Result' \
    '- mock final review result' \
    '' \
    '## Immediate Actions Required' \
    '- none' \
    '' \
    '## Recommendations' \
    '- none' \
    '' \
    '## Unique Finding Tagging' \
    '- mock' \
    > "$output_path"
}
write_e49_mock_synthesis_output() {
  local output_path="$1"
  printf '%s\n' \
    '---' \
    'deliberation_status: performed' \
    '---' \
    '' \
    '## Consensus' \
    '- mock synthesis' \
    '' \
    '## Conditional Consensus' \
    '- none' \
    '' \
    '## Disagreement' \
    '- none' \
    '' \
    '## Deliberation Decision' \
    '- mock' \
    '' \
    '## Axiology-Proposed Additional Perspectives' \
    '- none' \
    '' \
    '## Purpose Alignment Verification' \
    '- mock' \
    '' \
    '## Final Review Result' \
    '- mock final review result' \
    '' \
    '## Immediate Actions Required' \
    '- none' \
    '' \
    '## Recommendations' \
    '- none' \
    '' \
    '## Unique Finding Tagging' \
    '- mock' \
    > "$output_path"
}
write_e49_mock_issue_artifact_output() {
  local output_path="$1"
  local session_id="$2"
  local primary_lens="$3"
  mkdir -p "$(dirname "$output_path")"
  case "$(basename "$output_path")" in
    finding-ledger.yaml)
      printf 'schema_version: 1\nsession_id: %s\nfindings:\n  - finding_id: finding-001\n    lens_id: %s\n    source_ref: round1/%s.md#finding-1\n    target: mock-target\n    evidence_anchor: mock-anchor\n    claim: mock finding\n    proposed_action: none\n    severity: low\nvalidation:\n  unaddressable_findings: []\n' "$session_id" "$primary_lens" "$primary_lens" > "$output_path"
      ;;
    finding-relation-graph.yaml)
      printf 'schema_version: 1\nsession_id: %s\nrelations: []\nsingleton_findings:\n  - finding_id: finding-001\n    reason: mock singleton\n' "$session_id" > "$output_path"
      ;;
    issue-ledger.yaml)
      printf 'schema_version: 1\nsession_id: %s\nissues:\n  - issue_id: issue-001\n    root_cause_hypothesis: mock root\n    root_confidence: low\n    surface_finding_ids: [finding-001]\n    relation_refs: []\n    raised_by_lens_ids: [%s]\n    issue_statement: mock issue\n    proposed_action: none\n    severity: low\n    singleton_reason: mock singleton\nvalidation:\n  unclustered_finding_ids: []\n' "$session_id" "$primary_lens" > "$output_path"
      ;;
    issue-stance-matrix.yaml)
      printf 'schema_version: 1\nsession_id: %s\nissues:\n  - issue_id: issue-001\n    stances:\n' "$session_id" > "$output_path"
      for lens_id in $E49_LENS_IDS; do
        printf '      - lens_id: %s\n        stance: support\n        rationale: mock stance\n        root_hypothesis_position: accepts\n        severity_position: keeps\n        evidence_refs: [round1/%s.md]\n' "$lens_id" "$lens_id" >> "$output_path"
      done
      printf 'validation:\n  missing_stances: []\n' >> "$output_path"
      ;;
    deliberation-plan.yaml)
      printf 'schema_version: 1\nsession_id: %s\nplanned_issues: []\nskipped_issues:\n  - issue_id: issue-001\n    reason: no material conflict\n' "$session_id" > "$output_path"
      ;;
    problem-framing.yaml)
      printf 'schema_version: 1\nsession_id: %s\nclassification_context:\n  common_spine_version: 1\n  session_domain: none\n  domain_profile_ref: ""\n  domain_profile_doc_type: custom:problem_framing_profile\n  domain_profile_status: not_requested\nclassifications:\n  - issue_id: issue-001\n    problem_definition: mock problem\n    issue_role: independent_issue\n    judgment_state: observed\n    impact_kind: maintainability_evolvability\n    timing_class: defer_watch\n    closure_class: watch\n    domain_axes: {}\n    rationale: mock rationale\n    related_surface_finding_ids: [finding-001]\n' "$session_id" > "$output_path"
      ;;
    *)
      echo "unsupported E49 issue artifact: $output_path" >&2
      return 1
      ;;
  esac
}
E49_START_OUT=$(npm run coordinator:start -- \
  src/core-runtime/cli/review-invoke.ts "full cycle test" \
  --executor-realization mock --review-mode core-axis \
  --project-root "$PROJECT_ROOT" 2>&1)
E49_START_EXIT=$?
E49_SESSION_ROOT=$(echo "$E49_START_OUT" | grep '"session_root"' | head -1 | sed 's/.*: "//;s/".*//')

if [ $E49_START_EXIT -eq 0 ] && [ -n "$E49_SESSION_ROOT" ] && [ -d "$E49_SESSION_ROOT" ]; then
  E49_SESSION_ID=$(basename "$E49_SESSION_ROOT")
  E49_LENS_IDS=$(grep 'lens_id:' "$E49_SESSION_ROOT/execution-plan.yaml" | sed 's/.*lens_id: //' | tr -d '"' | tr -d "'" | awk '!seen[$0]++' | tr '\n' ' ')
  E49_PRIMARY_LENS_ID=$(echo "$E49_LENS_IDS" | awk '{print $1}')

  E49_LENS_OUTPUT_PATHS=$(grep 'output_path:' "$E49_SESSION_ROOT/execution-plan.yaml" | sed 's/.*output_path: //' | tr -d '"' | tr -d "'" | grep '/round1/' | grep -v '/deliberation/')
  for op in $E49_LENS_OUTPUT_PATHS; do
    mkdir -p "$(dirname "$op")"
    write_e49_mock_lens_output "$op"
  done

  # Step 2: next through issue artifact agents → awaiting_deliberation
  E49_NEXT1_OUT=$(npm run coordinator:next -- \
    --session-root "$E49_SESSION_ROOT" \
    --project-root "$PROJECT_ROOT" 2>&1)
  E49_NEXT1_EXIT=$?
  E49_NEXT1_STATE=$(echo "$E49_NEXT1_OUT" | grep '"state"' | head -1 | sed 's/.*: "//;s/".*//')

  while [ $E49_NEXT1_EXIT -eq 0 ] && [ "$E49_NEXT1_STATE" = "awaiting_adjudication" ]; do
    E49_ARTIFACT_OUTPUT=$(echo "$E49_NEXT1_OUT" | grep '"output_path"' | head -1 | sed 's/.*: "//;s/".*//')
    if [ -n "$E49_ARTIFACT_OUTPUT" ]; then
      write_e49_mock_issue_artifact_output "$E49_ARTIFACT_OUTPUT" "$E49_SESSION_ID" "$E49_PRIMARY_LENS_ID"
    fi
    E49_NEXT1_OUT=$(npm run coordinator:next -- \
      --session-root "$E49_SESSION_ROOT" \
      --project-root "$PROJECT_ROOT" 2>&1)
    E49_NEXT1_EXIT=$?
    E49_NEXT1_STATE=$(echo "$E49_NEXT1_OUT" | grep '"state"' | head -1 | sed 's/.*: "//;s/".*//')
  done

  if [ $E49_NEXT1_EXIT -eq 0 ] && [ "$E49_NEXT1_STATE" = "awaiting_deliberation" ]; then
    E49_DELIBERATION_RESPONSE_PATHS=$(grep 'output_path:' "$E49_SESSION_ROOT/execution-plan.yaml" | sed 's/.*output_path: //' | tr -d '"' | tr -d "'" | grep '/deliberation/round1/')
    for op in $E49_DELIBERATION_RESPONSE_PATHS; do
      mkdir -p "$(dirname "$op")"
      write_e49_mock_lens_deliberation_output "$op"
    done

    E49_NEXT1_OUT=$(npm run coordinator:next -- \
      --session-root "$E49_SESSION_ROOT" \
      --project-root "$PROJECT_ROOT" 2>&1)
    E49_NEXT1_EXIT=$?
    E49_NEXT1_STATE=$(echo "$E49_NEXT1_OUT" | grep '"state"' | head -1 | sed 's/.*: "//;s/".*//')
    E49_TEAMLEAD_OUTPUT=$(echo "$E49_NEXT1_OUT" | grep '"output_path"' | head -1 | sed 's/.*: "//;s/".*//')
    if [ $E49_NEXT1_EXIT -eq 0 ] && [ "$E49_NEXT1_STATE" = "awaiting_deliberation" ] && [ -n "$E49_TEAMLEAD_OUTPUT" ]; then
      mkdir -p "$(dirname "$E49_TEAMLEAD_OUTPUT")"
      write_e49_mock_teamlead_deliberation_output "$E49_TEAMLEAD_OUTPUT"
      E49_NEXT1_OUT=$(npm run coordinator:next -- \
        --session-root "$E49_SESSION_ROOT" \
        --project-root "$PROJECT_ROOT" 2>&1)
      E49_NEXT1_EXIT=$?
      E49_NEXT1_STATE=$(echo "$E49_NEXT1_OUT" | grep '"state"' | head -1 | sed 's/.*: "//;s/".*//')
    fi

    E49_PROBLEM_OUTPUT=$(echo "$E49_NEXT1_OUT" | grep '"output_path"' | head -1 | sed 's/.*: "//;s/".*//')
    if [ $E49_NEXT1_EXIT -eq 0 ] && [ "$E49_NEXT1_STATE" = "awaiting_deliberation" ] && [ "$(basename "$E49_PROBLEM_OUTPUT")" = "problem-framing.yaml" ]; then
      write_e49_mock_issue_artifact_output "$E49_PROBLEM_OUTPUT" "$E49_SESSION_ID" "$E49_PRIMARY_LENS_ID"
      E49_NEXT1_OUT=$(npm run coordinator:next -- \
        --session-root "$E49_SESSION_ROOT" \
        --project-root "$PROJECT_ROOT" 2>&1)
      E49_NEXT1_EXIT=$?
      E49_NEXT1_STATE=$(echo "$E49_NEXT1_OUT" | grep '"state"' | head -1 | sed 's/.*: "//;s/".*//')
    fi
  fi

  if [ $E49_NEXT1_EXIT -eq 0 ] && [ "$E49_NEXT1_STATE" = "awaiting_synthesize_dispatch" ]; then
    # Write mock synthesis output
    E49_SYNTH_OUTPUT=$(echo "$E49_NEXT1_OUT" | grep '"output_path"' | head -1 | sed 's/.*: "//;s/".*//')
    if [ -n "$E49_SYNTH_OUTPUT" ]; then
      mkdir -p "$(dirname "$E49_SYNTH_OUTPUT")"
      write_e49_mock_synthesis_output "$E49_SYNTH_OUTPUT"
    fi

    # Step 3: next → completed
    E49_NEXT2_OUT=$(npm run coordinator:next -- \
      --session-root "$E49_SESSION_ROOT" \
      --project-root "$PROJECT_ROOT" 2>&1)
    E49_NEXT2_EXIT=$?
    E49_NEXT2_STATE=$(echo "$E49_NEXT2_OUT" | grep '"state"' | head -1 | sed 's/.*: "//;s/".*//')

    if [ $E49_NEXT2_EXIT -eq 0 ] && [ "$E49_NEXT2_STATE" = "completed" ]; then
      E49_FINAL=$(echo "$E49_NEXT2_OUT" | grep '"final_output_path"' | head -1 | sed 's/.*: "//;s/".*//')
      if [ -n "$E49_FINAL" ] && [ -f "$E49_FINAL" ]; then
        echo "  PASS  E49: coordinator-full-cycle (start→lens→synthesize→completed)"
        PASS_COUNT=$((PASS_COUNT + 1))
      else
        echo "  FAIL! E49: coordinator-full-cycle (final_output missing: $E49_FINAL)"
        UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
      fi
    else
      echo "  FAIL! E49: coordinator-full-cycle step3 (exit=$E49_NEXT2_EXIT, state=$E49_NEXT2_STATE)"
      UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
    fi
  else
    echo "  FAIL! E49: coordinator-full-cycle step2 (exit=$E49_NEXT1_EXIT, state=$E49_NEXT1_STATE)"
    UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
  fi
else
  echo "  FAIL! E49: coordinator-full-cycle step1 (exit=$E49_START_EXIT)"
  UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
fi

echo ""

# ─────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────

TOTAL=$((PASS_COUNT + UNEXPECTED_COUNT))
echo "================================="
echo "Total: $TOTAL | Pass: $PASS_COUNT | Unexpected: $UNEXPECTED_COUNT"
echo "================================="

if [ $UNEXPECTED_COUNT -gt 0 ]; then
  echo "RESULT: FAIL"
  exit 1
else
  echo "RESULT: ALL PASS"
  exit 0
fi
