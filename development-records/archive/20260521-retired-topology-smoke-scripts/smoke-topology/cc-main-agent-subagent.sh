#!/usr/bin/env bash
#
# Smoke test — topology `cc-main-agent-subagent` (sketch v3 option 2-1).
#
# Handoff-only validation. Plain shell 에서는 coordinator-start handoff JSON
# emit 까지만 검증. 실 agent dispatch 는 Claude Code 세션 안에서 주체자 수동
# 실행 필요 (`manual-claude-host-topologies.md` §1 참조).
#
# 주체자 메인 세션이 teamlead, Agent tool 로 lens subagent 를 flat spawn.
# TeamCreate 미사용.
#
# What this script verifies:
#   1. resolver picked `cc-main-agent-subagent`
#   2. STDOUT 에 `coordinator-start` handoff JSON
#   3. handoff topology.id === cc-main-agent-subagent
#
# Full end-to-end validation (lens outputs, synthesis) requires Claude Code
# session — `manual-claude-host-topologies.md` §1.
#
# Requires:
#   - CLAUDECODE=1 env (이 스크립트가 직접 설정)
#   - Repo-built onto CLI (`npm run build:ts-core`)
#
# Exit codes: 0 pass / 1 fail / 2 skip (prereq missing).

set -euo pipefail

export SMOKE_TOPOLOGY_ID="cc-main-agent-subagent"
# shellcheck disable=SC1091
source "$(dirname "$0")/fixture.sh"

# ── Config ─────────────────────────────────────────────────────────────────
# P9.2 (2026-04-21): legacy `execution_topology_priority` field was removed.
# Axis-first review block derives shape `main_native` → cc-main-agent-subagent
# under Claude host + experimentalAgentTeams=false.
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
# CLAUDECODE=1 to satisfy claudeHost signal. Codex session signals unset to
# avoid codex host detection. CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS must be
# unset so shape derivation produces `main_native` (not `main-teams_native`).
onto_env_claude_host \
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
  "\[topology\] cc-main-agent-subagent: matched" \
  "topology resolver match"

smoke_assert_file_contains "${STDOUT_LOG}" \
  "\"handoff\": \"coordinator-start\"" \
  "coordinator-start handoff emission"

smoke_assert_file_contains "${STDOUT_LOG}" \
  "\"id\": \"cc-main-agent-subagent\"" \
  "handoff topology.id"

# (4) teamlead_location per TOPOLOGY_CATALOG.
smoke_assert_file_contains "${STDOUT_LOG}" \
  "\"teamlead_location\": \"onto-main\"" \
  "handoff topology.teamlead_location"

# (5) lens_spawn_mechanism per TOPOLOGY_CATALOG.
smoke_assert_file_contains "${STDOUT_LOG}" \
  "\"lens_spawn_mechanism\": \"claude-agent-tool\"" \
  "handoff topology.lens_spawn_mechanism"

# (6) deliberation_channel per TOPOLOGY_CATALOG.
smoke_assert_file_contains "${STDOUT_LOG}" \
  "\"deliberation_channel\": \"synthesizer-only\"" \
  "handoff topology.deliberation_channel"

# (7) max_concurrent_lenses per TOPOLOGY_CATALOG default (override 없을 때).
smoke_assert_file_contains "${STDOUT_LOG}" \
  "\"max_concurrent_lenses\": 10" \
  "handoff topology.max_concurrent_lenses"

smoke_pass
