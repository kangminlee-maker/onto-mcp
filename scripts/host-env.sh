#!/usr/bin/env bash
# shellcheck shell=bash
#
# host-env.sh — shared host-environment sanitization helpers for onto
# launcher scripts.
#
# # What this is
#
# Three functions that wrap a child-command invocation with the env
# stripping / setting required for a specific host context. Each function
# is a thin wrapper around `env -u … child-command …` so callers do not
# need to remember the exact set of variables to unset for their host.
#
# # Why this exists
#
# Before this helper, every launcher inlined the same `env -u` argument
# list (CLAUDECODE / CLAUDE_PROJECT_DIR / CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
# for codex host, or the inverse for claude host). Three drift modes
# resulted:
#   1. New env signal added to host detection but not added to all
#      launchers — partial pollution leaks the wrong host signal.
#   2. Pattern variations: cc-teams-* preserves CLAUDE_CODE_EXPERIMENTAL_
#      AGENT_TEAMS=1 while cc-main-* strips it. Easy to confuse when
#      copying between scripts.
#   3. Stale comments referring to old signal lists.
# A shared helper makes the pattern single-source and amendments single-
# point. Aligns with `feedback_deterministic_cli_wrapper.md` (2026-04-22):
# "조건분기 재사용 operation 은 LLM 매번 조립 금지, shell/CLI wrapper 로
# 내재화. 모든 영역 적용." Same principle, different domain (env
# sanitization instead of CLI flag assembly).
#
# # How it relates
#
# Sourced (not executed) by:
#   - scripts/review-pr.sh
#
# Functions:
#   onto_env_codex_host CMD…
#       Codex CLI host context. Strips all Claude Code signals so the
#       host-detection ladder picks codex (or falls through to plain
#       terminal when CODEX_THREAD_ID is also unset).
#
#   onto_env_claude_host CMD…
#       Claude Code session WITHOUT Agent Teams. Sets CLAUDECODE=1 and
#       strips codex signals + CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS so
#       the resolver derives a main-workers style Claude path when the
#       host provides that worker surface.
#
#   onto_env_claude_teams_host CMD…
#       Claude Code session WITH Agent Teams (CLAUDE_CODE_EXPERIMENTAL_
#       AGENT_TEAMS=1 inherited from the parent env). Sets CLAUDECODE=1
#       and strips codex signals only — agent-teams flag is preserved.
#       For nested host-team style execution.
#
#   onto_env_plain_terminal CMD…
#       Plain terminal (no Claude Code session, no codex CLI session).
#       Strips ALL host signals (CLAUDE_* and CODEX_*). Used by
#       nested-workers Codex execution where the outer worker is not tied
#       to a Claude or Codex host session.
#
# Each function:
#   - takes the child command as positional args (no shell expansion of
#     pre-built strings — passes argv array through cleanly)
#   - returns the child's exit code
#   - prepends env mutations to a single `env` invocation so the child
#     process sees the intended environment exactly (no double-wrapping
#     issues with subshells)
#
# # Self-test
#
#   bash scripts/host-env.sh --self-test
#
# Each function is invoked with `env` as the child command (which prints
# the current process environment), and the output is grepped for the
# expected presence/absence of each watched variable. Exit 0 on PASS,
# 1 on FAIL.

# Guard against double-source. Functions are idempotent but the
# self-test entrypoint at the bottom should not re-trigger if a caller
# sources this twice.
if [[ -n "${ONTO_HOST_ENV_HELPER_SOURCED:-}" && "${1:-}" != "--self-test" ]]; then
  return 0 2>/dev/null || exit 0
fi
ONTO_HOST_ENV_HELPER_SOURCED=1

onto_env_codex_host() {
  env -u CLAUDECODE -u CLAUDE_PROJECT_DIR -u CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS "$@"
}

onto_env_claude_host() {
  CLAUDECODE=1 env -u CLAUDE_PROJECT_DIR -u CODEX_THREAD_ID -u CODEX_CI -u CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS "$@"
}

onto_env_claude_teams_host() {
  CLAUDECODE=1 env -u CLAUDE_PROJECT_DIR -u CODEX_THREAD_ID -u CODEX_CI "$@"
}

onto_env_plain_terminal() {
  env -u CLAUDECODE -u CLAUDE_PROJECT_DIR -u CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS \
      -u CODEX_THREAD_ID -u CODEX_CI "$@"
}

# ─── Self-test ──────────────────────────────────────────────────────────
# Only runs when this file is executed directly with `--self-test`. The
# `${BASH_SOURCE[0]}` vs `$0` check distinguishes "sourced" from
# "executed" — when sourced from a launcher, this block must NOT fire.

if [[ "${BASH_SOURCE[0]}" == "${0}" && "${1:-}" == "--self-test" ]]; then
  set -euo pipefail

  failed=0

  # Pollute the environment so each function has something to strip.
  export CLAUDECODE=PARENT_VALUE
  export CLAUDE_PROJECT_DIR=/parent/project
  export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
  export CODEX_THREAD_ID=parent-thread
  export CODEX_CI=1

  echo "[host-env self-test] parent env polluted with all watched vars"
  echo ""

  # Helper: run the named function with `env` as the child, capture
  # output, and assert each var is absent (unset) or has the expected
  # value (set).
  assert_env() {
    local label="$1"; shift
    local fn="$1"; shift
    # Remaining args: alternating var=expected entries. Empty expected
    # means "must be absent from output". Non-empty means "var=<value>"
    # must appear.
    local out
    out=$("$fn" env 2>&1)

    local case_failed=0
    while [[ $# -gt 0 ]]; do
      local var="$1"; shift
      local expected="$1"; shift
      if [[ -z "$expected" ]]; then
        if echo "$out" | grep -qE "^${var}="; then
          echo "  ✗ $label — ${var} should be absent but is present"
          case_failed=1
        fi
      else
        if ! echo "$out" | grep -qE "^${var}=${expected}\$"; then
          echo "  ✗ $label — ${var} should be '${expected}' but"
          echo "$out" | grep -E "^${var}=" | sed 's/^/      actual: /' || echo "      actual: <absent>"
          case_failed=1
        fi
      fi
    done

    if [[ $case_failed -eq 0 ]]; then
      echo "  ✓ $label"
    else
      failed=$((failed + 1))
    fi
  }

  echo "[host-env self-test] Case 1: onto_env_codex_host strips all Claude signals, preserves codex signals"
  assert_env "codex_host" onto_env_codex_host \
    CLAUDECODE "" \
    CLAUDE_PROJECT_DIR "" \
    CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS "" \
    CODEX_THREAD_ID parent-thread \
    CODEX_CI 1

  echo "[host-env self-test] Case 2: onto_env_claude_host sets CLAUDECODE=1, strips CLAUDE_PROJECT_DIR + experimental + codex signals"
  assert_env "claude_host" onto_env_claude_host \
    CLAUDECODE 1 \
    CLAUDE_PROJECT_DIR "" \
    CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS "" \
    CODEX_THREAD_ID "" \
    CODEX_CI ""

  echo "[host-env self-test] Case 3: onto_env_claude_teams_host sets CLAUDECODE=1, preserves CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS, strips CLAUDE_PROJECT_DIR + codex"
  assert_env "claude_teams_host" onto_env_claude_teams_host \
    CLAUDECODE 1 \
    CLAUDE_PROJECT_DIR "" \
    CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS 1 \
    CODEX_THREAD_ID "" \
    CODEX_CI ""

  echo "[host-env self-test] Case 4: onto_env_plain_terminal strips ALL host signals (Claude + codex)"
  assert_env "plain_terminal" onto_env_plain_terminal \
    CLAUDECODE "" \
    CLAUDE_PROJECT_DIR "" \
    CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS "" \
    CODEX_THREAD_ID "" \
    CODEX_CI ""

  echo ""
  if [[ $failed -eq 0 ]]; then
    echo "[host-env self-test] PASS — 4/4 cases succeeded."
    exit 0
  else
    echo "[host-env self-test] FAIL — ${failed}/4 case(s) failed."
    exit 1
  fi
fi
