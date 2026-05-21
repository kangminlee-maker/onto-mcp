#!/usr/bin/env bash
#
# review-pr.sh — PR review via nested-workers Codex profile + full 9-lens.
#
# Deterministic wrapper. The purpose is to remove LLM-level command
# assembly (diff generation, env unset list, settings block, executor
# paths, flag choices) that is otherwise error-prone on every run
# (e.g. `--no-watch` accidentally inherited from smoke-script copy).
# The subject principal only picks a git ref range; everything else
# is fixed here.
#
# Usage:
#   bash scripts/review-pr.sh [GIT_REF_RANGE]
#
#   GIT_REF_RANGE defaults to `main...HEAD` (three-dot, symmetric).
#   This mirrors GitHub's PR diff semantics: changes on the right-hand
#   side (HEAD) since its merge-base with main, so branches that
#   diverged do not blame each other for mainline drift.
#
#   Explicit examples:
#     bash scripts/review-pr.sh main...HEAD        # default
#     bash scripts/review-pr.sh main...feat/xyz    # review feat/xyz as PR
#     bash scripts/review-pr.sh HEAD~3..HEAD       # last 3 commits (two-dot)
#
# Fixed behaviour (not overridable here — edit the script if you
# truly need a different setup rather than ad-hoc assembly):
#   - Profile:          nested-workers
#                       (teamlead is an external Codex worker, not host main —
#                        deterministic across machines. CODEX_THREAD_ID set,
#                        CLAUDE* unset → non-handoff path so review-invoke
#                        reaches the watcher call site too.)
#   - Review mode:      full (9 lens)
#   - Teamlead:         OpenAI OAuth via Codex worker / gpt-5.4 / high
#   - Lens worker:      OpenAI OAuth via Codex worker / gpt-5.4 / high
#   - Model rationale:  pinning model_id + effort removes machine-local default
#                       drift — same wrapper invocation = same model on any
#                       reviewer's machine.
#   - Watcher:          ENABLED (iTerm2 / tmux / Apple Terminal auto-detected)
#   - Project root:     isolated tmp (settings.json + target diff only)
#   - Onto home:        this repo (authority / roles / lens registry)
#   - Session artifact: preserved on success so round1/*.md + synthesis.md
#                       remain inspectable
#
# Prereqs:
#   - codex binary on PATH + ~/.codex/auth.json
#   - repo's `dist/core-runtime/cli/review-invoke.js` built
#     (`npm run build:ts-core`)
#
# Exit: 0 review completed / non-zero invoke failed (tmp preserved for
# debugging).

set -euo pipefail

REF="${1:-main...HEAD}"
REPO_ROOT="$(git rev-parse --show-toplevel)"

# Shared host-environment sanitizer. PR #185 follow-up #5 — keeps the
# env-unset list single-source across review-pr.sh and the smoke launchers.
# shellcheck disable=SC1091
source "${REPO_ROOT}/scripts/host-env.sh"

# Extract the right-hand ref from REF. Branch-separator parsing: try
# three-dot first (`main...HEAD` → `HEAD`), then two-dot (`main..feat/xyz`
# → `feat/xyz`). Literal-dot replacement would corrupt refs containing a `.`
# (e.g. `main...release/1.2` naively splitting on last `.` yields `2`) —
# fixed in 3rd self-review C2.
if [[ "${REF}" == *...* ]]; then
  RIGHT_REF="${REF##*...}"
elif [[ "${REF}" == *..* ]]; then
  RIGHT_REF="${REF##*..}"
else
  RIGHT_REF="HEAD"
fi
if [[ -z "${RIGHT_REF}" ]]; then
  RIGHT_REF="HEAD"
fi

# ── Prereqs ────────────────────────────────────────────────────────────────
if ! command -v codex >/dev/null 2>&1; then
  echo "ERROR: codex binary not found on PATH. Install codex CLI and run \`codex login\`." >&2
  exit 2
fi
if [[ ! -f "${HOME}/.codex/auth.json" ]]; then
  echo "ERROR: ~/.codex/auth.json missing. Run \`codex login\`." >&2
  exit 2
fi
CLI="${REPO_ROOT}/dist/core-runtime/cli/review-invoke.js"
if [[ ! -f "${CLI}" ]]; then
  echo "ERROR: review-invoke.js not built at ${CLI}. Run \`npm run build:ts-core\` first." >&2
  exit 2
fi

# ── Workspace ──────────────────────────────────────────────────────────────
REVIEW_DIR="$(mktemp -d -t onto-review-pr-XXXXXX)"
mkdir -p "${REVIEW_DIR}/.onto"
echo "review workspace: ${REVIEW_DIR}" >&2

# Generate the diff as the review target. Empty diff → abort so we do
# not burn LLM tokens on a no-op review.
DIFF_FILE="${REVIEW_DIR}/pr.diff"
git -C "${REPO_ROOT}" diff "${REF}" > "${DIFF_FILE}"
if [[ ! -s "${DIFF_FILE}" ]]; then
  echo "ERROR: diff for range '${REF}' is empty. Nothing to review." >&2
  rm -rf "${REVIEW_DIR}"
  exit 2
fi
DIFF_BYTES=$(wc -c < "${DIFF_FILE}" | tr -d " ")
DIFF_LINES=$(wc -l < "${DIFF_FILE}" | tr -d " ")
echo "target diff: ${DIFF_BYTES} bytes, ${DIFF_LINES} lines (${REF})" >&2

# Pinned model/effort. Both teamlead and lens worker use the same Codex-backed
# OpenAI OAuth selection so the wrapper produces the same review on any
# reviewer's machine regardless of local Codex defaults.
PIN_PROVIDER="openai"
PIN_MODEL_ID="gpt-5.4"
PIN_EFFORT="high"

cat > "${REVIEW_DIR}/.onto/settings.json" <<EOF
{
  "review_mode": "full",
  "review": {
    "execution": {
      "mode": "nested-workers",
      "teamlead": {
        "seat": "worker",
        "llm": {
          "auth": "oauth",
          "provider": "${PIN_PROVIDER}",
          "model": "${PIN_MODEL_ID}",
          "effort": "${PIN_EFFORT}"
        }
      },
      "lens": {
        "seat": "worker",
        "llm": {
          "auth": "oauth",
          "provider": "${PIN_PROVIDER}",
          "model": "${PIN_MODEL_ID}",
          "effort": "${PIN_EFFORT}"
        }
      },
      "deliberation": "controlled-lens-deliberation"
    }
  },
  "llm": {
    "auth": "oauth",
    "provider": "${PIN_PROVIDER}",
    "model": "${PIN_MODEL_ID}",
    "effort": "${PIN_EFFORT}"
  }
}
EOF

# Commit sha / intent for traceability in review-record. Record the
# right-hand ref actually being reviewed (not unconditional HEAD) so
# the metadata is meaningful when REF is e.g. `main...feat/xyz` and
# HEAD is on a different branch. INTENT also embeds the pinned
# model/effort so review-record's intent field carries the model
# identity for retrospective grep / cost analysis.
COMMIT_SHA="$(git -C "${REPO_ROOT}" rev-parse --short "${RIGHT_REF}")"
INTENT="PR review (${REF} @ ${COMMIT_SHA}, ${PIN_PROVIDER}/${PIN_MODEL_ID}/${PIN_EFFORT})"

# STDERR banner — same model/effort visible at invocation time for
# the operator (no need to wait for review-record). Independent from
# INTENT (record vs operational visibility serve different consumers).
echo "model pin: ${PIN_PROVIDER}/${PIN_MODEL_ID}/${PIN_EFFORT}" >&2

# ── Execute ────────────────────────────────────────────────────────────────
# NOTE: --no-watch is DELIBERATELY ABSENT so the live watcher pane spawns
# (iTerm2 split / tmux split / Apple Terminal tab, whichever the current
# env supports). CLAUDE_* unset + CODEX_THREAD_ID set routes through the
# non-handoff dispatch path so the watcher call site is actually reached.
cd "${REVIEW_DIR}"
STDOUT_LOG="${REVIEW_DIR}/review.stdout.log"
STDERR_LOG="${REVIEW_DIR}/review.stderr.log"
set +e
CODEX_THREAD_ID="review-pr-$(date +%s)" \
  onto_env_codex_host \
  node "${CLI}" \
    "$(basename "${DIFF_FILE}")" "${INTENT}" \
    --project-root "${REVIEW_DIR}" \
    --onto-home "${REPO_ROOT}" \
    > "${STDOUT_LOG}" 2> "${STDERR_LOG}"
EC=$?
set -e

SESSION_DIR="$(find "${REVIEW_DIR}/.onto/review" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | head -1 || true)"

if [[ "${EC}" -ne 0 ]]; then
  echo "review failed (exit=${EC}). Workspace preserved: ${REVIEW_DIR}" >&2
  exit "${EC}"
fi

echo "" >&2
echo "review complete." >&2
echo "  workspace:  ${REVIEW_DIR}" >&2
if [[ -n "${SESSION_DIR}" ]]; then
  echo "  session:    ${SESSION_DIR}" >&2
  echo "  synthesis:  ${SESSION_DIR}/synthesis.md" >&2
  echo "  final:      ${SESSION_DIR}/final-output.md" >&2
  echo "  round1:     ${SESSION_DIR}/round1/" >&2
fi
