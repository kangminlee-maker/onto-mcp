#!/usr/bin/env bash
#
# Smoke test — topology `cc-teams-litellm-sessions` (sketch v3 option 3-1).
#
# Handoff-only validation. TeamCreate teamlead + LiteLLM HTTP per lens. 실
# dispatch 는 Claude Code 세션 + LiteLLM endpoint 필요 — 본 스크립트는
# resolver + handoff JSON 검증만.
#
# What this script verifies:
#   1. resolver picked `cc-teams-litellm-sessions`
#   2. STDOUT 에 `coordinator-start` handoff JSON
#   3. handoff topology.id === cc-teams-litellm-sessions
#
# Requires:
#   - CLAUDECODE=1 (스크립트가 설정)
#   - CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 (부모 환경)
#   - LiteLLM / OpenAI-compatible endpoint 가 `$LITELLM_BASE_URL` 또는 default
#     http://localhost:4000 으로 reachable. resolver 의 litellm signal 이
#     true 로 감지되어야 함 — 부재 시 skip.
#   - Repo-built onto CLI (`npm run build:ts-core`)
#
# Exit codes: 0 pass / 1 fail / 2 skip (prereq missing).

set -euo pipefail

export SMOKE_TOPOLOGY_ID="cc-teams-litellm-sessions"
# shellcheck disable=SC1091
source "$(dirname "$0")/fixture.sh"

# ── Prereqs ────────────────────────────────────────────────────────────────
if [[ -z "${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-}" ]]; then
  smoke_skip "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS env not set"
fi

# LiteLLM endpoint reachability probe (simple TCP/HTTP ping). Default 4000.
LITELLM_URL="${LITELLM_BASE_URL:-http://localhost:4000}"
if ! curl -fsS --max-time 2 "${LITELLM_URL}/health" >/dev/null 2>&1 \
  && ! curl -fsS --max-time 2 "${LITELLM_URL}/v1/models" >/dev/null 2>&1; then
  smoke_skip "LiteLLM endpoint ${LITELLM_URL} not reachable; resolver's litellm signal will be false and this topology cannot match"
fi

# ── Config ─────────────────────────────────────────────────────────────────
# P9.2 (2026-04-21): legacy `execution_topology_priority` field removed.
# Axis-first: `subagent.provider=litellm` under Claude host + teams=true
# derives shape `main-teams_foreign(litellm)` → cc-teams-litellm-sessions.
# `llm_base_url` stays top-level (feeds resolver's litellm signal detection).
cat > "${SMOKE_CONFIG_FILE}" <<EOF
llm_base_url: ${LITELLM_URL}
review:
  subagent:
    provider: litellm
    model_id: llama-8b
review_mode: core-axis
EOF

# ── Execute ────────────────────────────────────────────────────────────────
STDERR_LOG="${SMOKE_TMP_ROOT}/review.stderr.log"
STDOUT_LOG="${SMOKE_TMP_ROOT}/review.stdout.log"

cd "${SMOKE_TMP_ROOT}"
onto_env_claude_teams_host \
  node "${ONTO_CLI}" \
    "$(basename "${SMOKE_TARGET_FILE}")" "${SMOKE_INTENT}" \
    --project-root "${SMOKE_TMP_ROOT}" \
    --onto-home "${ONTO_REPO_ROOT}" \
    --no-watch \
    > "${STDOUT_LOG}" 2> "${STDERR_LOG}" || {
      smoke_fail "onto review exited non-zero; see ${STDERR_LOG}"
    }

# ── Assertions ─────────────────────────────────────────────────────────────

smoke_assert_file_contains "${STDERR_LOG}" \
  "\[topology\] cc-teams-litellm-sessions: matched" \
  "topology resolver match"

smoke_assert_file_contains "${STDOUT_LOG}" \
  "\"handoff\": \"coordinator-start\"" \
  "coordinator-start handoff emission"

smoke_assert_file_contains "${STDOUT_LOG}" \
  "\"id\": \"cc-teams-litellm-sessions\"" \
  "handoff topology.id"

# (4) teamlead_location per TOPOLOGY_CATALOG.
smoke_assert_file_contains "${STDOUT_LOG}" \
  "\"teamlead_location\": \"claude-teamcreate\"" \
  "handoff topology.teamlead_location"

# (5) lens_spawn_mechanism per TOPOLOGY_CATALOG.
smoke_assert_file_contains "${STDOUT_LOG}" \
  "\"lens_spawn_mechanism\": \"litellm-http\"" \
  "handoff topology.lens_spawn_mechanism"

# (6) deliberation_channel per TOPOLOGY_CATALOG.
smoke_assert_file_contains "${STDOUT_LOG}" \
  "\"deliberation_channel\": \"synthesizer-only\"" \
  "handoff topology.deliberation_channel"

# (7) max_concurrent_lenses per TOPOLOGY_CATALOG default (LiteLLM 단일 큐 가정).
smoke_assert_file_contains "${STDOUT_LOG}" \
  "\"max_concurrent_lenses\": 1" \
  "handoff topology.max_concurrent_lenses"

smoke_pass
