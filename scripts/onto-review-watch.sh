#!/usr/bin/env bash
#
# onto:review live progress watcher
#
# Polls .onto/review/{session-id}/error-log.md and renders lens dispatch events.
# Designed to be invoked automatically (via tmux split-window or iTerm2 osascript)
# or manually (via this script).
#
# Usage:
#   bash scripts/onto-review-watch.sh                    # auto-discover latest session
#   bash scripts/onto-review-watch.sh /path/to/session   # explicit session-root
#
# Exits when final-output.md appears (review complete) or on Ctrl+C.

set -uo pipefail

# Resolve project root from script location
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Resolve session-root
#
# The auto-spawn path in review-invoke.ts now always passes an explicit
# session-root, so this zero-arg branch is only exercised by manual
# manual zero-arg invocations. When multiple review sessions are
# active concurrently the `.latest-session` pointer and `ls -t` heuristic
# both point to whichever session was most recently touched — which may
# not be the one the user wanted to watch. To avoid rendering the wrong
# session's events, the zero-arg path refuses to guess when more than one
# session has been active in the recent past; it lists the candidates and
# exits so the caller can rerun with an explicit argument.
if [ "${1:-}" != "" ]; then
  SESSION_ROOT="$1"
else
  # Use each session's error-log.md mtime as the liveness marker.
  # If two or more sessions have a recently updated error-log.md, the
  # zero-arg heuristic is ambiguous; show the candidates and exit so the
  # caller reruns with an explicit session-root.
  RECENT_CANDIDATES=()
  if [ -d ".onto/review" ]; then
    while IFS= read -r error_log; do
      RECENT_CANDIDATES+=("$(dirname "$error_log")")
    done < <(find ".onto/review" -mindepth 2 -maxdepth 2 -type f \
      -name "error-log.md" \
      -newermt "$(date -v-120S '+%Y-%m-%dT%H:%M:%S' 2>/dev/null || date -d '-120 seconds' '+%Y-%m-%dT%H:%M:%S' 2>/dev/null)" \
      2>/dev/null)
  fi

  if [ "${#RECENT_CANDIDATES[@]}" -gt 1 ]; then
    echo "${C_YELLOW:-}Ambiguous:${C_RESET:-} multiple review sessions have been active recently:" >&2
    for cand in "${RECENT_CANDIDATES[@]}"; do
      echo "  - ${cand}" >&2
    done
    echo "" >&2
    echo "${C_DIM:-}Pass an explicit session-root to avoid picking the wrong one:${C_RESET:-}" >&2
    echo "  bash scripts/onto-review-watch.sh \"<session-root>\"" >&2
    exit 2
  fi

  if [ "${#RECENT_CANDIDATES[@]}" -eq 1 ]; then
    SESSION_ROOT="${RECENT_CANDIDATES[0]}"
    echo "${C_DIM:-}Resolved to ${SESSION_ROOT} via error-log liveness lookup.${C_RESET:-}"
    echo "${C_DIM:-}  For explicit targeting: bash scripts/onto-review-watch.sh \"<session-root>\"${C_RESET:-}"
  else
    # No live error-log marker yet; wait for .latest-session to appear, then
    # fall back to the newest session directory. This covers sessions that
    # are still starting and have not created or updated error-log.md.
    echo "${C_DIM:-}Waiting for review session to start (zero-arg mode; no live error-log marker yet)...${C_RESET:-}"
    for i in {1..60}; do
      if [ -f ".onto/review/.latest-session" ]; then
        SESSION_ROOT="$(cat .onto/review/.latest-session)"
        [ -d "$SESSION_ROOT" ] && break
      fi
      sleep 1
    done

    if [ -z "${SESSION_ROOT:-}" ] || [ ! -d "${SESSION_ROOT:-}" ]; then
      LATEST_DIR="$(ls -t .onto/review/ 2>/dev/null | grep -v '^\.' | head -1)"
      if [ -n "$LATEST_DIR" ] && [ -d ".onto/review/$LATEST_DIR" ]; then
        SESSION_ROOT=".onto/review/$LATEST_DIR"
      fi
    fi

    if [ -n "${SESSION_ROOT:-}" ] && [ -d "${SESSION_ROOT:-}" ]; then
      echo "${C_DIM:-}Resolved to ${SESSION_ROOT} via zero-arg lookup.${C_RESET:-}"
      echo "${C_DIM:-}  For explicit targeting: bash scripts/onto-review-watch.sh \"<session-root>\"${C_RESET:-}"
    fi
  fi
fi

if [ -z "${SESSION_ROOT:-}" ] || [ ! -d "$SESSION_ROOT" ]; then
  echo "Error: no review session found." >&2
  echo "  Tried: \$1, error-log liveness lookup, .onto/review/.latest-session, ls .onto/review/" >&2
  exit 1
fi

# Make absolute
SESSION_ROOT="$(cd "$SESSION_ROOT" && pwd)"
ERROR_LOG="$SESSION_ROOT/error-log.md"
EXECUTION_PLAN="$SESSION_ROOT/execution-plan.yaml"
FINAL_OUTPUT="$SESSION_ROOT/final-output.md"
SESSION_ID="$(basename "$SESSION_ROOT")"
# Real-time outer codex stream (nested-workers Codex path only).
# spawn-watcher/teamlead-executor tee the outer codex stdout into this
# file as it emits; open in a side pane with `tail -f` to see live
# reasoning / tool calls / ENV-BEFORE / ENV-AFTER / summary sentinel.
# The file is absent for other execution profiles.
NESTED_OUTER_STDOUT="$SESSION_ROOT/nested-outer-stdout.log"

# ANSI colors (only if TTY)
if [ -t 1 ]; then
  C_RESET=$'\033[0m'
  C_BOLD=$'\033[1m'
  C_DIM=$'\033[2m'
  C_GREEN=$'\033[32m'
  C_BLUE=$'\033[34m'
  C_YELLOW=$'\033[33m'
  C_RED=$'\033[31m'
  C_CYAN=$'\033[36m'
else
  C_RESET=""
  C_BOLD=""
  C_DIM=""
  C_GREEN=""
  C_BLUE=""
  C_YELLOW=""
  C_RED=""
  C_CYAN=""
fi

# Extract a top-level scalar YAML field. Handles both bare and quoted values.
# Returns empty string when the file or key is missing, so callers can branch
# on presence without tripping `set -u`.
read_yaml_scalar() {
  local file="$1" key="$2"
  [ -f "$file" ] || { echo ""; return; }
  sed -n "s/^${key}: *//p" "$file" | head -n 1 | sed 's/^"\(.*\)"$/\1/'
}

file_mtime_epoch() {
  local file="$1"
  local value=""
  [ -e "$file" ] || { echo ""; return; }
  value="$(stat -f %m "$file" 2>/dev/null || true)"
  if [[ "$value" =~ ^[0-9]+$ ]]; then
    echo "$value"
    return
  fi
  value="$(stat -c %Y "$file" 2>/dev/null || true)"
  if [[ "$value" =~ ^[0-9]+$ ]]; then
    echo "$value"
    return
  fi
  echo ""
}

format_age() {
  local epoch="$1"
  [ -n "$epoch" ] || { echo ""; return; }
  local now age
  now="$(date +%s)"
  age=$((now - epoch))
  if [ "$age" -lt 60 ]; then
    echo "${age}s"
  elif [ "$age" -lt 3600 ]; then
    echo "$((age / 60))m"
  else
    echo "$((age / 3600))h"
  fi
}

execution_plan_lens_rows() {
  [ -f "$EXECUTION_PLAN" ] || return
  awk '
    function strip(v) {
      gsub(/^[ \t]+|[ \t]+$/, "", v)
      gsub(/^"/, "", v)
      gsub(/"$/, "", v)
      return v
    }
    function flush() {
      if (lens != "") print lens "|" output
      lens = ""
      output = ""
    }
    /^lens_execution_seats:/ {
      in_lens = 1
      next
    }
    in_lens && /^[^ \t-]/ {
      flush()
      in_lens = 0
    }
    in_lens && /^[ \t]*-[ \t]*lens_id:/ {
      flush()
      value = $0
      sub(/^[ \t]*-[ \t]*lens_id:[ \t]*/, "", value)
      lens = strip(value)
      next
    }
    in_lens && /^[ \t]*lens_id:/ {
      value = $0
      sub(/^[ \t]*lens_id:[ \t]*/, "", value)
      lens = strip(value)
      next
    }
    in_lens && /^[ \t]*output_path:/ {
      value = $0
      sub(/^[ \t]*output_path:[ \t]*/, "", value)
      output = strip(value)
      next
    }
    END {
      if (in_lens) flush()
    }
  ' "$EXECUTION_PLAN"
}

latest_lens_runtime_event() {
  local lens="$1"
  [ -f "$ERROR_LOG" ] || { echo ""; return; }
  awk -v lens="$lens" '
    /^## / {
      if ($0 ~ ("runner dispatch started: " lens "$") ||
          $0 ~ ("runner dispatch retry: " lens "$") ||
          $0 ~ ("runner dispatch completed: " lens "$") ||
          $0 ~ ("runner nested dispatch completed: " lens "$") ||
          $0 ~ ("lens failure: " lens "$")) {
        latest = $0
      }
    }
    END { print latest }
  ' "$ERROR_LOG"
}

unit_signal_epoch() {
  local running_log="$1"
  local latest_epoch=""
  local candidate=""
  if [ -n "$running_log" ]; then
    candidate="$(file_mtime_epoch "$running_log")"
    [ -n "$candidate" ] && latest_epoch="$candidate"
  fi
  candidate="$(file_mtime_epoch "$ERROR_LOG")"
  if [ -n "$candidate" ] && { [ -z "$latest_epoch" ] || [ "$candidate" -gt "$latest_epoch" ]; }; then
    latest_epoch="$candidate"
  fi
  echo "$latest_epoch"
}

LAST_SNAPSHOT=""
print_lens_snapshot() {
  local rows
  rows="$(execution_plan_lens_rows)"
  [ -n "$rows" ] || return

  local snapshot=""
  local lens output running_log event status label color detail epoch age
  while IFS='|' read -r lens output; do
    [ -n "$lens" ] || continue
    running_log=""
    if [ -n "$output" ]; then
      running_log="$(dirname "$output")/.${lens}.running.log"
    fi
    event="$(latest_lens_runtime_event "$lens")"
    status="pending"
    if [ -n "$output" ] && [ -s "$output" ]; then
      status="completed"
    elif [[ "$event" == *"runner dispatch completed:"* ]] || [[ "$event" == *"runner nested dispatch completed:"* ]]; then
      status="completed"
    elif [[ "$event" == *"lens failure:"* ]]; then
      status="failed"
    elif [[ "$event" == *"runner dispatch retry:"* ]]; then
      status="retrying"
    elif [[ "$event" == *"runner dispatch started:"* ]] || { [ -n "$running_log" ] && [ -f "$running_log" ]; }; then
      status="running"
    fi

    epoch="$(unit_signal_epoch "$running_log")"
    age="$(format_age "$epoch")"
    if { [ "$status" = "running" ] || [ "$status" = "retrying" ]; } && [ -n "$epoch" ]; then
      local now stale_age
      now="$(date +%s)"
      stale_age=$((now - epoch))
      if [ "$stale_age" -gt 300 ]; then
        status="running_stale"
      fi
    fi

    case "$status" in
      completed) label="DONE";  color="$C_GREEN" ;;
      failed) label="FAIL"; color="$C_RED" ;;
      retrying) label="RETRY"; color="$C_YELLOW" ;;
      running_stale) label="STALE"; color="$C_YELLOW" ;;
      running) label="RUN"; color="$C_BLUE" ;;
      *) label="WAIT"; color="$C_DIM" ;;
    esac

    detail=""
    if [ -n "$running_log" ] && [ -f "$running_log" ]; then
      detail="$running_log"
    elif [ -n "$output" ] && [ -f "$output" ]; then
      detail="$output"
    fi
    [ -n "$age" ] && age=" ${C_DIM}${age}${C_RESET}"
    [ -n "$detail" ] && detail=" ${C_DIM}${detail}${C_RESET}"
    snapshot+="  ${color}${label}${C_RESET}  ${lens}${age}${detail}"$'\n'
  done <<< "$rows"

  [ -n "$snapshot" ] || return
  if [ "$snapshot" != "$LAST_SNAPSHOT" ]; then
    echo "${C_CYAN}──────────────── lens snapshot ────────────────${C_RESET}"
    printf "%s" "$snapshot"
    LAST_SNAPSHOT="$snapshot"
  fi
}

print_header() {
  local metadata="$SESSION_ROOT/session-metadata.yaml"
  local interpretation="$SESSION_ROOT/interpretation.yaml"
  local target domain intent realization host_runtime review_mode profile
  target="$(read_yaml_scalar "$metadata" "requested_target")"
  domain="$(read_yaml_scalar "$metadata" "requested_domain_token")"
  realization="$(read_yaml_scalar "$metadata" "execution_realization")"
  host_runtime="$(read_yaml_scalar "$metadata" "host_runtime")"
  review_mode="$(read_yaml_scalar "$metadata" "review_mode")"
  intent="$(read_yaml_scalar "$interpretation" "intent_summary")"

  if [ -n "$realization" ] && [ -n "$host_runtime" ]; then
    profile="${realization} + ${host_runtime}"
    [ -n "$review_mode" ] && profile="${profile} (${review_mode})"
  fi

  echo "${C_CYAN}════════════════════════════════════════════════════════════════${C_RESET}"
  echo "${C_BOLD}  onto:review live watcher${C_RESET}"
  echo "  Session: ${C_BOLD}${SESSION_ID}${C_RESET}"
  echo "  ${C_DIM}${SESSION_ROOT}${C_RESET}"
  if [ -n "$target" ] || [ -n "$intent" ] || [ -n "${profile:-}" ]; then
    echo "${C_CYAN}────────────────────────────────────────────────────────────────${C_RESET}"
    [ -n "$target" ]         && echo "  Target:  ${target}"
    [ -n "$domain" ]         && echo "  Domain:  ${domain}"
    [ -n "$intent" ]         && echo "  Intent:  ${intent}"
    [ -n "${profile:-}" ]    && echo "  Profile: ${C_DIM}${profile}${C_RESET}"
  fi
  echo "${C_CYAN}════════════════════════════════════════════════════════════════${C_RESET}"
  # Nested-only hint: gate strictly on the outer stream file itself.
  if [ -f "$NESTED_OUTER_STDOUT" ]; then
    echo "  ${C_DIM}Outer codex live stream (nested-workers only):${C_RESET}"
    echo "  ${C_DIM}  tail -f '${NESTED_OUTER_STDOUT}'${C_RESET}"
    echo "${C_CYAN}════════════════════════════════════════════════════════════════${C_RESET}"
  fi
  echo ""
}

print_footer_complete() {
  echo ""
  echo "${C_CYAN}════════════════════════════════════════════════════════════════${C_RESET}"
  echo "${C_GREEN}${C_BOLD}  ✓ Review complete${C_RESET}"
  echo "  Final:  ${FINAL_OUTPUT}"
  echo "  Record: ${SESSION_ROOT}/review-record.yaml"
  echo "${C_CYAN}════════════════════════════════════════════════════════════════${C_RESET}"
  echo ""
  echo "${C_DIM}Press Enter to close this pane...${C_RESET}"
  # shellcheck disable=SC2034
  read -r _ || true
}

print_header
print_lens_snapshot

# Session-directory disappearance guard.
#
# If the session directory is deleted while we are watching (e.g. the runner
# aborts and the caller rm -rf's the failed session, or an outer cleanup
# script moves the tree), continuing to poll an absent file spams the pane
# with `tail: No such file`. Detect the deletion at each loop head and exit
# cleanly so stale watcher panes do not outlive their session.
check_session_alive() {
  if [ ! -d "$SESSION_ROOT" ]; then
    echo ""
    echo "${C_DIM}Session directory removed (${SESSION_ROOT}). Watcher exiting.${C_RESET}"
    exit 0
  fi
}

# Wait for error-log.md to appear (max 60 seconds)
WAIT_COUNT=0
while [ ! -f "$ERROR_LOG" ]; do
  check_session_alive
  if [ "$WAIT_COUNT" -ge 60 ]; then
    echo "${C_RED}Error: $ERROR_LOG did not appear within 60s${C_RESET}" >&2
    exit 1
  fi
  if [ "$WAIT_COUNT" -eq 0 ]; then
    echo "${C_DIM}Waiting for runtime to start producing events...${C_RESET}"
  fi
  sleep 1
  WAIT_COUNT=$((WAIT_COUNT + 1))
done

# Trap Ctrl+C for clean exit
trap 'echo ""; echo "${C_DIM}Watcher stopped (review may still be running).${C_RESET}"; exit 0' INT TERM

# Poll loop
LAST_LINE=0
LAST_SNAPSHOT_EPOCH=0
SNAPSHOT_INTERVAL_SECONDS=5
while true; do
  check_session_alive
  CURRENT_LINES=$(wc -l < "$ERROR_LOG" 2>/dev/null || echo 0)
  if [ "$CURRENT_LINES" -gt "$LAST_LINE" ]; then
    sed -n "$((LAST_LINE + 1)),${CURRENT_LINES}p" "$ERROR_LOG" | awk \
      -v c_green="$C_GREEN" \
      -v c_blue="$C_BLUE" \
      -v c_yellow="$C_YELLOW" \
      -v c_red="$C_RED" \
      -v c_dim="$C_DIM" \
      -v c_reset="$C_RESET" '
      /^## .* runner dispatch started:/ {
        ts = ""
        if (match($0, /## [0-9T:+.-]+/)) {
          ts = substr($0, RSTART + 3, RLENGTH - 3)
          # Extract HH:MM:SS portion
          if (match(ts, /T[0-9:]+/)) {
            ts = substr(ts, RSTART + 1, 8)
          }
        }
        sub(/.*runner dispatch started: /, "")
        printf "  %s%s%s  %s▶ START%s   %s\n", c_dim, ts, c_reset, c_blue, c_reset, $0
      }
      /^## .* runner dispatch completed:/ {
        ts = ""
        if (match($0, /## [0-9T:+.-]+/)) {
          ts = substr($0, RSTART + 3, RLENGTH - 3)
          if (match(ts, /T[0-9:]+/)) {
            ts = substr(ts, RSTART + 1, 8)
          }
        }
        sub(/.*runner dispatch completed: /, "")
        printf "  %s%s%s  %s✓ DONE%s    %s\n", c_dim, ts, c_reset, c_green, c_reset, $0
      }
      /^## .* runner halted:/ {
        ts = ""
        if (match($0, /## [0-9T:+.-]+/)) {
          ts = substr($0, RSTART + 3, RLENGTH - 3)
          if (match(ts, /T[0-9:]+/)) {
            ts = substr(ts, RSTART + 1, 8)
          }
        }
        sub(/.*runner halted: /, "")
        printf "  %s%s%s  %s✗ HALT%s    %s\n", c_dim, ts, c_reset, c_red, c_reset, $0
      }
      /max_concurrent_lenses:/ {
        printf "  %s%s%s\n", c_dim, $0, c_reset
      }
    '
    LAST_LINE=$CURRENT_LINES
    print_lens_snapshot
    LAST_SNAPSHOT_EPOCH="$(date +%s)"
  else
    CURRENT_EPOCH="$(date +%s)"
    if [ $((CURRENT_EPOCH - LAST_SNAPSHOT_EPOCH)) -ge "$SNAPSHOT_INTERVAL_SECONDS" ]; then
      print_lens_snapshot
      LAST_SNAPSHOT_EPOCH="$CURRENT_EPOCH"
    fi
  fi

  if [ -f "$FINAL_OUTPUT" ]; then
    # Final flush, then exit
    sleep 1
    CURRENT_LINES=$(wc -l < "$ERROR_LOG" 2>/dev/null || echo 0)
    if [ "$CURRENT_LINES" -gt "$LAST_LINE" ]; then
      sed -n "$((LAST_LINE + 1)),${CURRENT_LINES}p" "$ERROR_LOG" | awk '
        /runner dispatch completed:/ {
          sub(/.*runner dispatch completed: /, "")
          printf "  ✓ DONE    %s\n", $0
        }
      '
    fi
    print_lens_snapshot
    print_footer_complete
    exit 0
  fi

  sleep 1
done
