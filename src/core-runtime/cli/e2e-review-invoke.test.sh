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
ORIGINAL_HOME="${HOME:-}"
export HOME="$FIXTURE_DIR/home"
mkdir -p "$HOME/.onto"

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
  if [ -n "$ORIGINAL_HOME" ]; then
    export HOME="$ORIGINAL_HOME"
  fi
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

T6B_OUT=$(npm run review:invoke -- \
  src/core-runtime/cli/review-invoke.ts "single lens" \
  --executor-realization mock \
  --lens-id logic 2>&1)
T6B_EXIT=$?
T6B_SESSION_ROOT=$(echo "$T6B_OUT" | grep '"session_root"' | head -1 | sed 's/.*: "//;s/".*//')
if [ $T6B_EXIT -eq 0 ] && [ -n "$T6B_SESSION_ROOT" ] &&
  grep -q 'minimum_participating_lenses: 1' "$T6B_SESSION_ROOT/lens-completion-barrier.yaml" &&
  grep -q 'observed_dispatch_width: 1' "$T6B_SESSION_ROOT/lens-completion-barrier.yaml" &&
  grep -q 'downstream_allowed: true' "$T6B_SESSION_ROOT/lens-completion-barrier.yaml"; then
  echo "  PASS  T6B: single-lens review"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo "  FAIL! T6B: single-lens review (exit=$T6B_EXIT session=$T6B_SESSION_ROOT)"
  UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
fi

run_expect_pass "T9: bundle" \
  --primary-ref src/core-runtime/cli/review-invoke.ts \
  --member-ref package.json \
  --target-scope-kind bundle \
  --executor-realization mock \
  --request-text "bundle review"

run_expect_pass "T12: all-selected-lenses-parallel" \
  src/ "parallelism test" \
  --executor-realization mock --review-mode core-axis

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

run_expect_fail "T13: max-concurrent-removed" \
  src/ "parallelism cap removed" \
  --executor-realization mock --review-mode core-axis --max-concurrent-lenses 2

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

echo "=== E23a: value-alignment-confirmation-gate ==="
E23A_OUT=$(npm run review:invoke -- src/core-runtime/cli/review-invoke.ts "ambiguous value gate" \
  --executor-realization mock --review-mode core-axis \
  --ambiguity-note "principal intent requires confirmation" 2>&1)
E23A_EXIT=$?
if [ $E23A_EXIT -ne 0 ] && echo "$E23A_OUT" | grep -q "Review value-alignment criteria require confirmation"; then
  echo "  PASS  E23a: value-alignment-confirmation-gate"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo "  FAIL! E23a: value-alignment-confirmation-gate (exit=$E23A_EXIT)"
  UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
fi

echo "=== E23b: value-alignment-confirmed-allow-path ==="
E23B_OUT=$(npm run review:invoke -- \
  src/core-runtime/cli/review-invoke.ts "ambiguous but confirmed value gate" \
  --executor-realization mock --review-mode core-axis \
  --ambiguity-note "principal intent was confirmed out of band" \
  --confirm-value-alignment 2>&1)
E23B_EXIT=$?
E23B_SESSION_ROOT=$(cat "$PROJECT_ROOT/.onto/review/.latest-session" 2>/dev/null)
E23B_VALUE_FILE="$E23B_SESSION_ROOT/execution-preparation/review-value-alignment-criteria.yaml"
if [ $E23B_EXIT -eq 0 ] && \
  [ -f "$E23B_VALUE_FILE" ] && \
  grep -q "ambiguity_status: clear" "$E23B_VALUE_FILE" && \
  grep -q "dispatch_state: allow_dispatch" "$E23B_VALUE_FILE"; then
  echo "  PASS  E23b: value-alignment-confirmed-allow-path"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo "  FAIL! E23b: value-alignment-confirmed-allow-path (exit=$E23B_EXIT value_file=$E23B_VALUE_FILE)"
  UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
fi

echo "=== E23c: direct-call-provider-route-preflight ==="
E23C_ROOT="$FIXTURE_DIR/provider-route-missing"
mkdir -p "$E23C_ROOT/.onto"
printf 'provider route missing credential\n' > "$E23C_ROOT/target.txt"
cat > "$E23C_ROOT/.onto/settings.json" <<'JSON'
{
  "llm": {
    "auth": "api_key",
    "provider": "openai",
    "model": "gpt-5.5",
    "api_key_env": "ONTO_E2E_MISSING_OPENAI_API_KEY"
  }
}
JSON
E23C_OUT=$(env -u ONTO_E2E_MISSING_OPENAI_API_KEY npm run review:invoke -- \
  target.txt "provider route must fail before dispatch" \
  --project-root "$E23C_ROOT" --onto-home "$PROJECT_ROOT" \
  --no-domain --review-mode core-axis --no-watch \
  --executor-bin "$PROJECT_ROOT/node_modules/.bin/tsx" \
  --executor-arg "$PROJECT_ROOT/src/core-runtime/cli/inline-http-review-unit-executor.ts" 2>&1)
E23C_EXIT=$?
if [ $E23C_EXIT -ne 0 ] && echo "$E23C_OUT" | grep -q "provider credential environment variable is missing"; then
  echo "  PASS  E23c: direct-call-provider-route-preflight"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo "  FAIL! E23c: direct-call-provider-route-preflight (exit=$E23C_EXIT)"
  UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
fi

echo "=== E23d: codex-actor-route-mismatch ==="
E23D_ROOT="$FIXTURE_DIR/codex-actor-route-mismatch"
mkdir -p "$E23D_ROOT/.onto" "$E23D_ROOT/bin" "$HOME/.codex"
printf '#!/bin/sh\nexit 99\n' > "$E23D_ROOT/bin/codex"
chmod +x "$E23D_ROOT/bin/codex"
printf '{}\n' > "$HOME/.codex/auth.json"
printf 'codex actor mismatch\n' > "$E23D_ROOT/target.txt"
cat > "$E23D_ROOT/.onto/settings.json" <<'JSON'
{
  "llm": {
    "auth": "oauth",
    "provider": "openai",
    "model": "gpt-5.5"
  },
  "review": {
    "execution": {
      "lens": {
        "seat": "worker",
        "llm": {
          "auth": "api_key",
          "provider": "openai",
          "model": "gpt-5.5",
          "api_key_env": "ONTO_E2E_MISSING_OPENAI_API_KEY"
        }
      }
    }
  }
}
JSON
E23D_OUT=$(PATH="$E23D_ROOT/bin:$PATH" npm run review:invoke -- \
  target.txt "codex actor route mismatch must fail before dispatch" \
  --project-root "$E23D_ROOT" --onto-home "$PROJECT_ROOT" \
  --no-domain --review-mode core-axis --no-watch \
  --executor-realization codex 2>&1)
E23D_EXIT=$?
if [ $E23D_EXIT -ne 0 ] && echo "$E23D_OUT" | grep -q "Codex worker route cannot dispatch"; then
  echo "  PASS  E23d: codex-actor-route-mismatch"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo "  FAIL! E23d: codex-actor-route-mismatch (exit=$E23D_EXIT)"
  UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
fi

echo ""

# ─────────────────────────────────────────────
# 7. OPTION INTERACTIONS
# ─────────────────────────────────────────────

echo "── Option Interactions ──"

run_expect_fail "E24: diff+bundle-conflict" \
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

run_expect_status "E26: single-lens-completes" "completed" \
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

echo "=== E38b: packet-hash-mismatch-fails-before-dispatch ==="
if [ -n "${E38_SESSION_ROOT:-}" ] && [ -d "$E38_SESSION_ROOT" ]; then
  printf '\nmanual packet mutation\n' >> "$E38_SESSION_ROOT/prompt-packets/logic.prompt.md"
  E38B_OUT=$(npm run review:run-prompt-execution -- \
    --project-root "$PROJECT_ROOT" \
    --session-root "$E38_SESSION_ROOT" \
    --executor-bin "$PROJECT_ROOT/node_modules/.bin/tsx" \
    --executor-arg "$PROJECT_ROOT/src/core-runtime/cli/mock-review-unit-executor.ts" 2>&1)
  E38B_EXIT=$?
  if [ $E38B_EXIT -ne 0 ] && echo "$E38B_OUT" | grep -q "prompt packet hash changed"; then
    echo "  PASS  E38b: packet-hash-mismatch-fails-before-dispatch"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "  FAIL! E38b: packet-hash-mismatch-fails-before-dispatch (exit=$E38B_EXIT)"
    UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
  fi
else
  echo "  SKIP  E38b: no prepare-only session"
fi

echo "=== E38c: manifest-schema-version-fails-before-dispatch ==="
E38C_OUT=$(npm run review:invoke -- \
  src/ "manifest schema guard test" \
  --executor-realization mock --review-mode core-axis --prepare-only 2>&1)
E38C_EXIT=$?
E38C_SESSION_ROOT=$(echo "$E38C_OUT" | grep '"session_root"' | head -1 | sed 's/.*: "//;s/".*//')
if [ $E38C_EXIT -eq 0 ] && [ -n "$E38C_SESSION_ROOT" ] && [ -d "$E38C_SESSION_ROOT" ]; then
  node --input-type=module - "$E38C_SESSION_ROOT/execution-preparation/review-context-manifest.yaml" <<'NODE'
import fs from "node:fs";
import YAML from "yaml";
const filePath = process.argv[2];
const doc = YAML.parse(fs.readFileSync(filePath, "utf8"));
doc.schema_version = "999";
fs.writeFileSync(filePath, YAML.stringify(doc), "utf8");
NODE
  E38C_RUN_OUT=$(npm run review:run-prompt-execution -- \
    --project-root "$PROJECT_ROOT" \
    --session-root "$E38C_SESSION_ROOT" \
    --executor-bin "$PROJECT_ROOT/node_modules/.bin/tsx" \
    --executor-arg "$PROJECT_ROOT/src/core-runtime/cli/mock-review-unit-executor.ts" 2>&1)
  E38C_RUN_EXIT=$?
  if [ $E38C_RUN_EXIT -ne 0 ] && echo "$E38C_RUN_OUT" | grep -q "schema version is unsupported"; then
    echo "  PASS  E38c: manifest-schema-version-fails-before-dispatch"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "  FAIL! E38c: manifest-schema-version-fails-before-dispatch (exit=$E38C_RUN_EXIT)"
    UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
  fi
else
  echo "  FAIL! E38c: prepare-only setup failed (exit=$E38C_EXIT)"
  UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
fi

echo "=== E38d: manifest-derived-matrix-mismatch-fails-before-dispatch ==="
E38D_OUT=$(npm run review:invoke -- \
  src/ "manifest matrix guard test" \
  --executor-realization mock --review-mode core-axis --prepare-only 2>&1)
E38D_EXIT=$?
E38D_SESSION_ROOT=$(echo "$E38D_OUT" | grep '"session_root"' | head -1 | sed 's/.*: "//;s/".*//')
if [ $E38D_EXIT -eq 0 ] && [ -n "$E38D_SESSION_ROOT" ] && [ -d "$E38D_SESSION_ROOT" ]; then
  node --input-type=module - "$E38D_SESSION_ROOT/execution-preparation/review-context-manifest.yaml" <<'NODE'
import fs from "node:fs";
import YAML from "yaml";
const filePath = process.argv[2];
const doc = YAML.parse(fs.readFileSync(filePath, "utf8"));
doc.derived_context_access_matrix["lens:logic"] = ["materialized-input"];
fs.writeFileSync(filePath, YAML.stringify(doc), "utf8");
NODE
  E38D_RUN_OUT=$(npm run review:run-prompt-execution -- \
    --project-root "$PROJECT_ROOT" \
    --session-root "$E38D_SESSION_ROOT" \
    --executor-bin "$PROJECT_ROOT/node_modules/.bin/tsx" \
    --executor-arg "$PROJECT_ROOT/src/core-runtime/cli/mock-review-unit-executor.ts" 2>&1)
  E38D_RUN_EXIT=$?
  if [ $E38D_RUN_EXIT -ne 0 ] && echo "$E38D_RUN_OUT" | grep -q "access matrix does not match"; then
    echo "  PASS  E38d: manifest-derived-matrix-mismatch-fails-before-dispatch"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "  FAIL! E38d: manifest-derived-matrix-mismatch-fails-before-dispatch (exit=$E38D_RUN_EXIT)"
    UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
  fi
else
  echo "  FAIL! E38d: prepare-only setup failed (exit=$E38D_EXIT)"
  UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
fi

echo "=== E38e: packet-forbidden-context-ref-fails-before-dispatch ==="
E38E_OUT=$(npm run review:invoke -- \
  src/ "packet context guard test" \
  --executor-realization mock --review-mode core-axis --prepare-only 2>&1)
E38E_EXIT=$?
E38E_SESSION_ROOT=$(echo "$E38E_OUT" | grep '"session_root"' | head -1 | sed 's/.*: "//;s/".*//')
if [ $E38E_EXIT -eq 0 ] && [ -n "$E38E_SESSION_ROOT" ] && [ -d "$E38E_SESSION_ROOT" ]; then
  node --input-type=module - "$E38E_SESSION_ROOT/execution-preparation/review-context-manifest.yaml" <<'NODE'
import fs from "node:fs";
import YAML from "yaml";
const filePath = process.argv[2];
const doc = YAML.parse(fs.readFileSync(filePath, "utf8"));
const packet = doc.packet_refs.find((item) => item.consumer_id === "synthesize");
if (!packet) throw new Error("synthesize packet ref missing");
packet.consumed_context_refs = [...packet.consumed_context_refs, "domain:logic_rules"];
fs.writeFileSync(filePath, YAML.stringify(doc), "utf8");
NODE
  E38E_RUN_OUT=$(npm run review:run-prompt-execution -- \
    --project-root "$PROJECT_ROOT" \
    --session-root "$E38E_SESSION_ROOT" \
    --executor-bin "$PROJECT_ROOT/node_modules/.bin/tsx" \
    --executor-arg "$PROJECT_ROOT/src/core-runtime/cli/mock-review-unit-executor.ts" 2>&1)
  E38E_RUN_EXIT=$?
  if [ $E38E_RUN_EXIT -ne 0 ] && echo "$E38E_RUN_OUT" | grep -q "Prompt packet context refs do not match"; then
    echo "  PASS  E38e: packet-forbidden-context-ref-fails-before-dispatch"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "  FAIL! E38e: packet-forbidden-context-ref-fails-before-dispatch (exit=$E38E_RUN_EXIT)"
    UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
  fi
else
  echo "  FAIL! E38e: prepare-only setup failed (exit=$E38E_EXIT)"
  UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
fi

echo "=== E38f: packet-unknown-consumer-fails-before-dispatch ==="
E38F_OUT=$(npm run review:invoke -- \
  src/ "packet unknown consumer guard test" \
  --executor-realization mock --review-mode core-axis --prepare-only 2>&1)
E38F_EXIT=$?
E38F_SESSION_ROOT=$(echo "$E38F_OUT" | grep '"session_root"' | head -1 | sed 's/.*: "//;s/".*//')
if [ $E38F_EXIT -eq 0 ] && [ -n "$E38F_SESSION_ROOT" ] && [ -d "$E38F_SESSION_ROOT" ]; then
  node --input-type=module - "$E38F_SESSION_ROOT/execution-preparation/review-context-manifest.yaml" <<'NODE'
import fs from "node:fs";
import YAML from "yaml";
const filePath = process.argv[2];
const doc = YAML.parse(fs.readFileSync(filePath, "utf8"));
const packet = doc.packet_refs.find((item) => item.consumer_id === "lens:logic");
if (!packet) throw new Error("logic packet ref missing");
doc.packet_refs.push({
  ...packet,
  consumer_id: "lens:unknown",
});
fs.writeFileSync(filePath, YAML.stringify(doc), "utf8");
NODE
  E38F_RUN_OUT=$(npm run review:run-prompt-execution -- \
    --project-root "$PROJECT_ROOT" \
    --session-root "$E38F_SESSION_ROOT" \
    --executor-bin "$PROJECT_ROOT/node_modules/.bin/tsx" \
    --executor-arg "$PROJECT_ROOT/src/core-runtime/cli/mock-review-unit-executor.ts" 2>&1)
  E38F_RUN_EXIT=$?
  if [ $E38F_RUN_EXIT -ne 0 ] && \
     echo "$E38F_RUN_OUT" | grep -q "consumer is not admitted" && \
     grep -R "details_kind: context_eligibility" "$E38F_SESSION_ROOT/failures" >/dev/null 2>&1; then
    echo "  PASS  E38f: packet-unknown-consumer-fails-before-dispatch"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "  FAIL! E38f: packet-unknown-consumer-fails-before-dispatch (exit=$E38F_RUN_EXIT)"
    UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
  fi
else
  echo "  FAIL! E38f: prepare-only setup failed (exit=$E38F_EXIT)"
  UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
fi

echo "=== E38g: artifact-write-failure-is-structured ==="
E38G_OUT=$(npm run review:invoke -- \
  src/ "artifact write guard test" \
  --executor-realization mock --review-mode core-axis --prepare-only 2>&1)
E38G_EXIT=$?
E38G_SESSION_ROOT=$(echo "$E38G_OUT" | grep '"session_root"' | head -1 | sed 's/.*: "//;s/".*//')
if [ $E38G_EXIT -eq 0 ] && [ -n "$E38G_SESSION_ROOT" ] && [ -d "$E38G_SESSION_ROOT" ]; then
  mkdir "$E38G_SESSION_ROOT/review-run-manifest.yaml"
  E38G_RUN_OUT=$(npm run review:run-prompt-execution -- \
    --project-root "$PROJECT_ROOT" \
    --session-root "$E38G_SESSION_ROOT" \
    --executor-bin "$PROJECT_ROOT/node_modules/.bin/tsx" \
    --executor-arg "$PROJECT_ROOT/src/core-runtime/cli/mock-review-unit-executor.ts" 2>&1)
  E38G_RUN_EXIT=$?
  if [ $E38G_RUN_EXIT -ne 0 ] && \
     echo "$E38G_RUN_OUT" | grep -q "required review execution artifact" && \
     grep -R "details_kind: artifact_write" "$E38G_SESSION_ROOT/failures" >/dev/null 2>&1; then
    echo "  PASS  E38g: artifact-write-failure-is-structured"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "  FAIL! E38g: artifact-write-failure-is-structured (exit=$E38G_RUN_EXIT)"
    UNEXPECTED_COUNT=$((UNEXPECTED_COUNT + 1))
  fi
else
  echo "  FAIL! E38g: prepare-only setup failed (exit=$E38G_EXIT)"
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

if [ $E39_EXIT -eq 0 ] && echo "$E39_OUT" | grep -q "onto-mcp"; then
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
