#!/usr/bin/env bash
#
# Smoke test — topology `cc-main-codex-subprocess` (sketch v3 option 2-2).
#
# Simulates Claude Code host environment via CLAUDECODE=1 env. In this env
# `review:invoke` emits a `coordinator-start` handoff JSON to STDOUT and
# exits — actual agent orchestration must happen inside a real Claude Code
# session (주체자 세션). This script cannot validate the self path from a
# plain shell; it instead asserts that the handoff payload correctly
# describes the resolved topology.
#
# What this script verifies:
#   1. resolver picked `cc-main-codex-subprocess`
#   2. STDOUT contains a `coordinator-start` handoff JSON
#   3. handoff JSON `topology.id` = cc-main-codex-subprocess
#   4. handoff JSON `topology.teamlead_location` = onto-main
#   5. handoff JSON `topology.lens_spawn_mechanism` = codex-subprocess
#
# Full end-to-end validation (lens outputs, synthesis, final-output) requires
# executing the handoff inside a Claude Code session — see
# `manual-claude-host-topologies.md` for that path.
#
# Requires:
#   - codex binary + ~/.codex/auth.json
#   - Repo-built onto CLI (`npm run build:ts-core`)
#
# Exit codes: 0 pass / 1 fail / 2 skip (prereq missing).

set -euo pipefail

export SMOKE_TOPOLOGY_ID="cc-main-codex-subprocess"
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
# Axis-first: `subagent.provider=codex` under Claude host + teams=false
# derives shape `main_foreign(codex)` → cc-main-codex-subprocess.
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
# CLAUDECODE=1 to satisfy claudeHost. Codex session env unset to avoid codex
# host detection. CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS unset so shape stays
# in the non-teams branch (`main_foreign` vs `main-teams_foreign`).
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

# (1) Resolver picked cc-main-codex-subprocess. `[topology] ...` is on STDERR.
smoke_assert_file_contains "${STDERR_LOG}" \
  "\[topology\] cc-main-codex-subprocess: matched" \
  "topology resolver match"

# (2) coordinator-start handoff emitted to STDOUT (CLAUDECODE=1 path).
smoke_assert_file_contains "${STDOUT_LOG}" \
  "\"handoff\": \"coordinator-start\"" \
  "coordinator-start handoff emission"

# (3) handoff JSON topology.id matches.
smoke_assert_file_contains "${STDOUT_LOG}" \
  "\"id\": \"cc-main-codex-subprocess\"" \
  "handoff topology.id"

# (4) handoff JSON teamlead_location = onto-main.
smoke_assert_file_contains "${STDOUT_LOG}" \
  "\"teamlead_location\": \"onto-main\"" \
  "handoff topology.teamlead_location"

# (5) handoff JSON lens_spawn_mechanism = codex-subprocess.
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
