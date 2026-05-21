#!/usr/bin/env bash
#
# Smoke test — topology `cc-teams-codex-subprocess` (sketch v3 option 1-2).
#
# Handoff-only validation. TeamCreate teamlead 는 Claude agent, lens 는 codex
# CLI subprocess. 모델 혼재 (Claude teamlead + GPT lens) 패턴. 실 dispatch
# 는 Claude Code 세션 필요 — 본 스크립트는 handoff JSON 검증만 수행.
#
# What this script verifies:
#   1. resolver picked `cc-teams-codex-subprocess`
#   2. STDOUT 에 `coordinator-start` handoff JSON
#   3. handoff topology.id === cc-teams-codex-subprocess
#
# Requires:
#   - CLAUDECODE=1 (스크립트가 설정)
#   - CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 (부모 환경)
#   - codex binary + ~/.codex/auth.json
#   - Repo-built onto CLI (`npm run build:ts-core`)
#
# Exit codes: 0 pass / 1 fail / 2 skip (prereq missing).

set -euo pipefail

export SMOKE_TOPOLOGY_ID="cc-teams-codex-subprocess"
# shellcheck disable=SC1091
source "$(dirname "$0")/fixture.sh"

# ── Prereqs ────────────────────────────────────────────────────────────────
if [[ -z "${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-}" ]]; then
  smoke_skip "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS env not set"
fi
if ! command -v codex >/dev/null 2>&1; then
  smoke_skip "codex binary not on PATH"
fi
if [[ ! -f "${HOME}/.codex/auth.json" ]]; then
  smoke_skip "~/.codex/auth.json missing; run \`codex login\` first"
fi

# ── Config ─────────────────────────────────────────────────────────────────
# P9.2 (2026-04-21): legacy `execution_topology_priority` field removed.
# Axis-first: `subagent.provider=codex` under Claude host + teams=true
# derives shape `main-teams_foreign(codex)` → cc-teams-codex-subprocess.
cat > "${SMOKE_CONFIG_FILE}" <<EOF
review:
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
  "\[topology\] cc-teams-codex-subprocess: matched" \
  "topology resolver match"

smoke_assert_file_contains "${STDOUT_LOG}" \
  "\"handoff\": \"coordinator-start\"" \
  "coordinator-start handoff emission"

smoke_assert_file_contains "${STDOUT_LOG}" \
  "\"id\": \"cc-teams-codex-subprocess\"" \
  "handoff topology.id"

# (4) teamlead_location per TOPOLOGY_CATALOG.
smoke_assert_file_contains "${STDOUT_LOG}" \
  "\"teamlead_location\": \"claude-teamcreate\"" \
  "handoff topology.teamlead_location"

# (5) lens_spawn_mechanism per TOPOLOGY_CATALOG.
smoke_assert_file_contains "${STDOUT_LOG}" \
  "\"lens_spawn_mechanism\": \"codex-subprocess\"" \
  "handoff topology.lens_spawn_mechanism"

# (6) deliberation_channel per TOPOLOGY_CATALOG.
smoke_assert_file_contains "${STDOUT_LOG}" \
  "\"deliberation_channel\": \"synthesizer-only\"" \
  "handoff topology.deliberation_channel"

# (7) max_concurrent_lenses per TOPOLOGY_CATALOG default (override 없을 때).
smoke_assert_file_contains "${STDOUT_LOG}" \
  "\"max_concurrent_lenses\": 5" \
  "handoff topology.max_concurrent_lenses"

smoke_pass
