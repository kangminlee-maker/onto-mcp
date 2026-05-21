#!/usr/bin/env bash
#
# Smoke test — live watcher pane spawn integration path.
#
# The other 8 topology smoke scripts pass `--no-watch` to keep assertions
# deterministic and avoid opening visible side panes during automated
# runs. That means those scripts cannot detect a regression in
# `spawn-watcher.ts` — if the iTerm2 / tmux / Apple Terminal detection
# logic breaks, smoke will continue to pass silently. This script fills
# that blind spot.
#
# Why it uses the codex-main-subprocess path:
#   review-invoke.ts calls `spawnWatcherPane` AFTER the CLAUDECODE=1
#   coordinator-start handoff / --prepare-only early returns. Under
#   CLAUDECODE=1 the invoke exits at the handoff before reaching the
#   watcher site, so CLAUDE-host topologies cannot cover the watcher
#   call site in integration. The codex-main-subprocess path
#   (CODEX_THREAD_ID set, CLAUDECODE unset) goes through the full
#   review dispatch, which is where watcher actually spawns.
#
# Side-effect control:
#   `ONTO_WATCHER_DRY_RUN=1` makes spawn-watcher.ts report spawned=true
#   after detection but skip the actual osascript / tmux split. No new
#   side pane or terminal tab appears. This matches the 3 detection
#   paths via env (tmux / iTerm2 / Apple Terminal).
#
# What this script verifies:
#   1. review-invoke's watcher call site is actually reached (regression
#      guard for a refactor that accidentally moves the early-return
#      past L2059).
#   2. spawn-watcher.ts detects at least one of: tmux / iTerm2 /
#      Apple Terminal based on current env.
#   3. The log line format is stable for downstream log parsers:
#      - dry-run:    `[review runner] live watcher detection via <mechanism>`
#      - real attach: `[review runner] live watcher attached via <mechanism>`
#      This smoke asserts the dry-run form (ONTO_WATCHER_DRY_RUN=1).
#
# Requires:
#   - codex binary + ~/.codex/auth.json  (base path same as
#     codex-main-subprocess.sh)
#   - at least one of $TMUX / iTerm2 session / Apple Terminal
#
# LLM calls: ~7 (one per lens + synthesize). Cost ~$1-2 at
# gpt-5.4 / effort=medium. This is the minimum that still exercises
# the watcher call site — review-invoke does not expose a
# "watcher-only" shortcut, so full dispatch runs through.
#
# Exit codes: 0 pass / 1 fail / 2 skip (prereq missing).

set -euo pipefail

export SMOKE_TOPOLOGY_ID="watcher-spawn"
# shellcheck disable=SC1091
source "$(dirname "$0")/fixture.sh"

# ── Prereqs ────────────────────────────────────────────────────────────────
if ! command -v codex >/dev/null 2>&1; then
  smoke_skip "codex binary not on PATH"
fi
if [[ ! -f "${HOME}/.codex/auth.json" ]]; then
  smoke_skip "~/.codex/auth.json missing; run \`codex login\` first"
fi

HAS_TMUX=0
HAS_ITERM=0
HAS_TERMINAL=0
[[ -n "${TMUX:-}" ]] && HAS_TMUX=1
# iTerm2 and Apple Terminal branches in spawn-watcher.ts gate on
# process.platform === "darwin". Smoke must match or it will
# incorrectly claim those mechanisms are available on Linux.
PLATFORM="$(uname -s)"
if [[ "${PLATFORM}" == "Darwin" ]]; then
  [[ "${TERM_PROGRAM:-}" == "iTerm.app" && -n "${ITERM_SESSION_ID:-}" ]] && HAS_ITERM=1
  [[ "${TERM_PROGRAM:-}" == "Apple_Terminal" ]] && HAS_TERMINAL=1
fi

if [[ "$HAS_TMUX" == "0" && "$HAS_ITERM" == "0" && "$HAS_TERMINAL" == "0" ]]; then
  smoke_skip "no watcher mechanism detectable (need TMUX env, or on macOS: iTerm2 session / Apple Terminal)"
fi

# spawn-watcher.ts resolves `<project-root>/scripts/onto-review-watch.sh`
# (projectRoot here is SMOKE_TMP_ROOT). Install a mock watcher so the
# existsSync check passes. Its contents are never read under dry-run.
MOCK_WATCHER="${SMOKE_TMP_ROOT}/scripts/onto-review-watch.sh"
mkdir -p "$(dirname "${MOCK_WATCHER}")"
cat > "${MOCK_WATCHER}" <<'MOCKEOF'
#!/usr/bin/env bash
# smoke-test mock watcher. Never invoked under ONTO_WATCHER_DRY_RUN=1.
MOCKEOF
chmod +x "${MOCK_WATCHER}"

# ── Config ─────────────────────────────────────────────────────────────────
# Same axis-first block as codex-main-subprocess.sh: main teamlead +
# main-native subagent, under codex session host (CODEX_THREAD_ID set,
# CLAUDECODE unset) → shape=main_native → topology=codex-main-subprocess.
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
# --no-watch deliberately ABSENT. ONTO_WATCHER_DRY_RUN=1 skips actual
# osascript/tmux spawn while still running detection priority ladder.
# CODEX_THREAD_ID simulates codex CLI host so resolver picks
# codex-main-subprocess (not the CLAUDECODE handoff path, which would
# early-return before reaching the watcher call site).
CODEX_THREAD_ID="smoke-${SMOKE_TOPOLOGY_ID}-$(date +%s)" \
  ONTO_WATCHER_DRY_RUN=1 \
  onto_env_codex_host \
  node "${ONTO_CLI}" \
    "$(basename "${SMOKE_TARGET_FILE}")" "${SMOKE_INTENT}" \
    --project-root "${SMOKE_TMP_ROOT}" \
    --onto-home "${ONTO_REPO_ROOT}" \
    > "${STDOUT_LOG}" 2> "${STDERR_LOG}" || {
      smoke_fail "onto review exited non-zero; see ${STDERR_LOG}"
    }

# ── Assertions ─────────────────────────────────────────────────────────────

# (1) Watcher call site was reached AND reported success. Dry-run uses
# the "detection via" verb to distinguish from a real pane attach.
smoke_assert_log_contains "${STDERR_LOG}" "${STDOUT_LOG}" \
  "\[review runner\] live watcher detection via (tmux|iterm2|apple_terminal)" \
  "watcher detection log line (dry-run variant)"

# (2) Mechanism in log matches an env signal we actually provided.
if grep -qE "detection via tmux" "${STDOUT_LOG}" "${STDERR_LOG}"; then
  [[ "$HAS_TMUX" == "1" ]] \
    || smoke_fail "watcher reported tmux but TMUX env was not set"
elif grep -qE "detection via iterm2" "${STDOUT_LOG}" "${STDERR_LOG}"; then
  [[ "$HAS_ITERM" == "1" ]] \
    || smoke_fail "watcher reported iterm2 but ITERM_SESSION_ID/TERM_PROGRAM env was incomplete (or non-macOS)"
elif grep -qE "detection via apple_terminal" "${STDOUT_LOG}" "${STDERR_LOG}"; then
  [[ "$HAS_TERMINAL" == "1" ]] \
    || smoke_fail "watcher reported apple_terminal but TERM_PROGRAM was not Apple_Terminal (or non-macOS)"
else
  smoke_fail "watcher detection log present but mechanism token not recognized"
fi

# (3) Topology resolved to codex-main-subprocess (host signal plumbing
# sanity — if CODEX_THREAD_ID did not take, the resolver would pick
# something else and we'd have no reason to trust the watcher result).
smoke_assert_file_contains "${STDERR_LOG}" \
  "\[topology\] codex-main-subprocess: matched" \
  "topology resolver match"

smoke_pass
