#!/usr/bin/env bash
#
# Smoke test — topology `codex-nested-subprocess` (sketch v3 option codex-A).
#
# Host-agnostic: works from plain terminal, Claude Code Bash tool, or Codex
# CLI session. Requires only `codex` binary + `~/.codex/auth.json`.
#
# What this script verifies:
#   1. Resolver selects `codex-nested-subprocess` given the priority config.
#   2. `runReviewInvokeCli` routes through the PR-L dispatch branch
#      (executeReviewPromptExecution 가 `executeReviewViaCodexNested` 호출).
#   3. Outer codex teamlead spawns nested codex per lens; lens output files
#      (round1/*.md) are non-empty.
#   4. Synthesize step runs via codex executor (not part of nested bridge)
#      and synthesis.md is non-empty.
#   5. [topology] STDERR line confirms `codex-nested-subprocess` match.
#
# Exit codes: 0 pass / 1 fail / 2 skip (prereq missing).

set -euo pipefail

export SMOKE_TOPOLOGY_ID="codex-nested-subprocess"
# shellcheck disable=SC1091
source "$(dirname "$0")/fixture.sh"

# ── Prereqs ────────────────────────────────────────────────────────────────
if ! command -v codex >/dev/null 2>&1; then
  smoke_skip "codex binary not on PATH"
fi
if [[ ! -f "${HOME}/.codex/auth.json" ]]; then
  smoke_skip "~/.codex/auth.json missing; run \`codex login\` first"
fi

# ── Config ─────────────────────────────────────────────────────────────────
# P9.2 (2026-04-21): legacy `execution_topology_priority` field removed.
# Axis-first: external codex teamlead + codex subagent (no Claude host, no
# codex session active) derives shape `ext-teamlead_native` →
# codex-nested-subprocess.
cat > "${SMOKE_CONFIG_FILE}" <<EOF
review:
  teamlead:
    model:
      provider: codex
      model_id: gpt-5.4
      effort: medium
  subagent:
    provider: codex
    model_id: gpt-5.4
    effort: medium
review_mode: core-axis
EOF

# ── Execute ────────────────────────────────────────────────────────────────
STDERR_LOG="${SMOKE_TMP_ROOT}/review.stderr.log"
STDOUT_LOG="${SMOKE_TMP_ROOT}/review.stdout.log"

cd "${SMOKE_TMP_ROOT}"
# Force project-root to tmp so .onto/config.yml is picked up. All Claude
# signals unset (including CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS per
# host-detection.ts CLAUDE_ENV_SIGNALS) so claudeHost reads false and the
# external-codex teamlead shape derivation is unambiguous.
onto_env_plain_terminal \
  node "${ONTO_CLI}" \
    "$(basename "${SMOKE_TARGET_FILE}")" "${SMOKE_INTENT}" \
    --project-root "${SMOKE_TMP_ROOT}" \
    --onto-home "${ONTO_REPO_ROOT}" \
    --no-watch \
    > "${STDOUT_LOG}" 2> "${STDERR_LOG}" || {
      smoke_fail "onto review exited non-zero; see ${STDERR_LOG}"
    }

# ── Assertions ─────────────────────────────────────────────────────────────

# (1) Resolver picked codex-nested-subprocess. `[topology] ... matched` is on STDERR.
smoke_assert_stderr_contains "${STDERR_LOG}" \
  "\[topology\] codex-nested-subprocess: matched" \
  "topology resolver match"

# (2) PR-L dispatch branch active. `[review runner] ...` is emitted on STDOUT
#     by run-review-prompt-execution, so check both streams.
smoke_assert_log_contains "${STDERR_LOG}" "${STDOUT_LOG}" \
  "\[review runner\] topology=codex-nested-subprocess" \
  "PR-L dispatch branch"

# (3) Lens outputs non-empty.
SESSION_ROOT_LINE="$(grep -Eo 'session_root: .*' "${STDOUT_LOG}" | head -1 || true)"
if [[ -z "${SESSION_ROOT_LINE}" ]]; then
  # Alt: session root is written into .onto/review/.latest-session symlink
  SESSION_ROOT="$(cat "${SMOKE_TMP_ROOT}/.onto/review/.latest-session" 2>/dev/null || echo "")"
else
  SESSION_ROOT="${SESSION_ROOT_LINE#session_root: }"
fi
if [[ -z "${SESSION_ROOT}" || ! -d "${SESSION_ROOT}" ]]; then
  smoke_fail "unable to locate session_root; stdout=${STDOUT_LOG} stderr=${STDERR_LOG}"
fi

ROUND1_COUNT="$(find "${SESSION_ROOT}/round1" -maxdepth 1 -name "*.md" -type f | wc -l | tr -d ' ')"
if [[ "${ROUND1_COUNT}" -lt 1 ]]; then
  smoke_fail "no round1/*.md files produced under ${SESSION_ROOT}"
fi
for f in "${SESSION_ROOT}/round1"/*.md; do
  smoke_assert_nonempty_file "${f}" "lens output ${f##*/}"
done

# (4) Synthesize output.
smoke_assert_nonempty_file "${SESSION_ROOT}/synthesis.md" "synthesis.md"

# (5) Final output.
if [[ -f "${SESSION_ROOT}/final-output.md" ]]; then
  smoke_assert_nonempty_file "${SESSION_ROOT}/final-output.md" "final-output.md"
fi

smoke_pass
