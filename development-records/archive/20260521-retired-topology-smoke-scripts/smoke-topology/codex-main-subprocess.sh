#!/usr/bin/env bash
#
# Smoke test — topology `codex-main-subprocess` (sketch v3 option codex-B).
#
# Simulates a Codex CLI session via `CODEX_THREAD_ID` env. The resolver
# requires this signal AND codex binary to match this topology. onto TS
# main runs as teamlead (codex host 안), lens 당 codex CLI subprocess
# dispatch.
#
# Difference vs codex-nested-subprocess (codex-A): no outer-codex
# teamlead layer — onto TS directly spawns codex per lens via the
# existing per-lens worker pool with codex executor.
#
# Requires:
#   - codex binary + ~/.codex/auth.json
#
# Exit codes: 0 pass / 1 fail / 2 skip (prereq missing).

set -euo pipefail

export SMOKE_TOPOLOGY_ID="codex-main-subprocess"
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
# Axis-first: main teamlead + main-native subagent under codex session
# (CODEX_THREAD_ID set) derives shape `main_native` → codex-main-subprocess.
cat > "${SMOKE_CONFIG_FILE}" <<EOF
review:
  teamlead:
    model: main
  subagent:
    provider: main-native
review_mode: core-axis
EOF

# ── Execute ────────────────────────────────────────────────────────────────
STDERR_LOG="${SMOKE_TMP_ROOT}/review.stderr.log"
STDOUT_LOG="${SMOKE_TMP_ROOT}/review.stdout.log"

cd "${SMOKE_TMP_ROOT}"
# Set CODEX_THREAD_ID to simulate codex CLI session host (enables codex-B
# requirement: codexSessionActive=true). All Claude env signals (including
# CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS — see host-detection.ts
# CLAUDE_ENV_SIGNALS) must be unset so claudeHost signal reads false.
CODEX_THREAD_ID="smoke-${SMOKE_TOPOLOGY_ID}-$(date +%s)" \
  onto_env_codex_host \
  node "${ONTO_CLI}" \
    "$(basename "${SMOKE_TARGET_FILE}")" "${SMOKE_INTENT}" \
    --project-root "${SMOKE_TMP_ROOT}" \
    --onto-home "${ONTO_REPO_ROOT}" \
    --no-watch \
    > "${STDOUT_LOG}" 2> "${STDERR_LOG}" || {
      smoke_fail "onto review exited non-zero; see ${STDERR_LOG}"
    }

# ── Assertions ─────────────────────────────────────────────────────────────

smoke_assert_stderr_contains "${STDERR_LOG}" \
  "\[topology\] codex-main-subprocess: matched" \
  "topology resolver match"

# `[plan:executor] ...` may appear on either stream depending on invoke path.
smoke_assert_log_contains "${STDERR_LOG}" "${STDOUT_LOG}" \
  "\[plan:executor\] topology=codex-main-subprocess" \
  "PR-F executor mapping"

SESSION_ROOT="$(cat "${SMOKE_TMP_ROOT}/.onto/review/.latest-session" 2>/dev/null || true)"
if [[ -z "${SESSION_ROOT}" || ! -d "${SESSION_ROOT}" ]]; then
  smoke_fail "unable to locate session_root; stderr=${STDERR_LOG}"
fi

ROUND1_COUNT="$(find "${SESSION_ROOT}/round1" -maxdepth 1 -name "*.md" -type f | wc -l | tr -d ' ')"
if [[ "${ROUND1_COUNT}" -lt 1 ]]; then
  smoke_fail "no round1/*.md files produced under ${SESSION_ROOT}"
fi
for f in "${SESSION_ROOT}/round1"/*.md; do
  smoke_assert_nonempty_file "${f}" "lens output ${f##*/}"
done
smoke_assert_nonempty_file "${SESSION_ROOT}/synthesis.md" "synthesis.md"

smoke_pass
