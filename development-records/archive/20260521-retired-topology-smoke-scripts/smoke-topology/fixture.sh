#!/usr/bin/env bash
# shellcheck shell=bash
#
# fixture.sh — common setup for topology smoke test scripts.
#
# Sourced (not executed) by each topology-specific smoke test.
# Exports:
#   SMOKE_TMP_ROOT       — tmp project directory (script must `rm -rf` on success)
#   SMOKE_TARGET_FILE    — minimal markdown target file inside SMOKE_TMP_ROOT
#   SMOKE_INTENT         — intent string for `onto review`
#   SMOKE_CONFIG_FILE    — path to .onto/config.yml inside SMOKE_TMP_ROOT
#   ONTO_REPO_ROOT       — repo root containing dist/core-runtime
#   ONTO_CLI             — absolute path to the built review-invoke.js
# Requires SMOKE_TOPOLOGY_ID to be set by caller before sourcing.

set -euo pipefail

if [[ -z "${SMOKE_TOPOLOGY_ID:-}" ]]; then
  echo "fixture.sh: caller must set SMOKE_TOPOLOGY_ID before sourcing" >&2
  return 1 2>/dev/null || exit 1
fi

ONTO_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ONTO_CLI="${ONTO_REPO_ROOT}/dist/core-runtime/cli/review-invoke.js"

if [[ ! -f "${ONTO_CLI}" ]]; then
  echo "fixture.sh: onto CLI not built. Run \`npm run build:ts-core\` in ${ONTO_REPO_ROOT}" >&2
  return 1 2>/dev/null || exit 1
fi

# Source the shared host-env sanitization helpers so each smoke script can
# wrap its node invocation with `onto_env_codex_host` / `onto_env_claude_host`
# / `onto_env_claude_teams_host` instead of inlining the env-unset list.
# shellcheck disable=SC1091
source "${ONTO_REPO_ROOT}/scripts/host-env.sh"

SMOKE_TMP_ROOT="$(mktemp -d -t "onto-smoke-${SMOKE_TOPOLOGY_ID}-XXXX")"
mkdir -p "${SMOKE_TMP_ROOT}/.onto"

# Minimal review target — one short markdown file. Light mode + single file
# target keeps token cost bounded.
SMOKE_TARGET_FILE="${SMOKE_TMP_ROOT}/target.md"
cat > "${SMOKE_TARGET_FILE}" <<'EOF'
# Smoke Test Target

This is a minimal markdown file used as the `onto review` target during a
topology smoke test. The content is intentionally short to bound token
consumption during the lens and synthesize phases.

## Scope

- A single top-level heading
- A single short paragraph

## Expected lens behavior

Lenses should produce their usual `Finding / Why / How To Fix / Newly
Learned / Applied Learnings` sections even against trivial content —
structural completeness under minimal input is itself a test surface.
EOF

SMOKE_INTENT="smoke test for topology ${SMOKE_TOPOLOGY_ID}"
SMOKE_CONFIG_FILE="${SMOKE_TMP_ROOT}/.onto/config.yml"

# Caller writes topology-specific config.yml contents to SMOKE_CONFIG_FILE
# after sourcing this fixture.

echo "fixture.sh: SMOKE_TMP_ROOT=${SMOKE_TMP_ROOT}" >&2
echo "fixture.sh: ONTO_CLI=${ONTO_CLI}" >&2

# Assertion helpers -----------------------------------------------------------

# Fail with a message and keep tmp dir for debugging.
smoke_fail() {
  local msg="$1"
  echo "SMOKE FAIL [${SMOKE_TOPOLOGY_ID}]: ${msg}" >&2
  echo "  tmp root preserved for debugging: ${SMOKE_TMP_ROOT}" >&2
  exit 1
}

# Skip (prereq not met). Exit code 2 so CI / caller can distinguish.
smoke_skip() {
  local msg="$1"
  echo "SMOKE SKIP [${SMOKE_TOPOLOGY_ID}]: ${msg}" >&2
  rm -rf "${SMOKE_TMP_ROOT}"
  exit 2
}

smoke_pass() {
  echo "SMOKE PASS [${SMOKE_TOPOLOGY_ID}]: all assertions satisfied" >&2
  rm -rf "${SMOKE_TMP_ROOT}"
  exit 0
}

# Check that a file exists and has size > 0.
smoke_assert_nonempty_file() {
  local file="$1"
  local label="$2"
  if [[ ! -f "${file}" ]]; then
    smoke_fail "${label}: file does not exist at ${file}"
  fi
  if [[ ! -s "${file}" ]]; then
    smoke_fail "${label}: file exists but is empty at ${file}"
  fi
}

# Check that an arbitrary log file contains an expected pattern.
# Used for either STDERR or STDOUT logs — stream is decided by caller.
smoke_assert_file_contains() {
  local file="$1"
  local pattern="$2"
  local label="$3"
  if ! grep -qE "${pattern}" "${file}"; then
    smoke_fail "${label}: log did not contain pattern '${pattern}' (see ${file})"
  fi
}

# Back-compat alias. Prefer `smoke_assert_file_contains` for new code.
smoke_assert_stderr_contains() {
  smoke_assert_file_contains "$@"
}

# Check that either the STDERR or STDOUT log contains an expected pattern.
# Some onto diagnostic lines (notably `[review runner] ...`) are emitted to
# STDOUT rather than STDERR, so assertions that care about topology/dispatch
# identity must look across both streams.
smoke_assert_log_contains() {
  local stderr_log="$1"
  local stdout_log="$2"
  local pattern="$3"
  local label="$4"
  if ! grep -qE "${pattern}" "${stderr_log}" "${stdout_log}"; then
    smoke_fail "${label}: neither STDERR nor STDOUT log contained pattern '${pattern}' (see ${stderr_log}, ${stdout_log})"
  fi
}

export SMOKE_TMP_ROOT SMOKE_TARGET_FILE SMOKE_INTENT SMOKE_CONFIG_FILE
export ONTO_REPO_ROOT ONTO_CLI
