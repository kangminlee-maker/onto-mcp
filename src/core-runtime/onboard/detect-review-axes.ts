/**
 * Review UX Redesign P4 — onboard-time detection of review axes.
 *
 * # What this module is
 *
 * A small pure function that aggregates the environmental signals relevant
 * to the review execution configuration (design doc §5.2, stages 1–4) into
 * a single `DetectedReviewAxes` result. The onboard prose flow
 * (`.onto/processes/onboard.md`) invokes this via `npm run onboard:detect-review-axes`
 * and uses the printed JSON as the input to the subsequent interactive
 * questions (stages 5–7).
 *
 * # Why it exists
 *
 * Onboard is prose-driven: the LLM session reads `.onto/processes/onboard.md` and
 * executes each stage textually. Stages 1–4 are purely automatic environment
 * probes, so pulling them into a single deterministic TS entry point keeps
 * the prose stage short ("run this script and read the JSON") and avoids
 * duplicating env-var + binary checks in natural-language instructions. The
 * detection logic itself is reused from
 * `src/core-runtime/discovery/host-detection.ts` — this module is a thin
 * projection into the P4 axis vocabulary (host, agent_teams_available,
 * codex_available).
 *
 * # How it relates
 *
 * - Inputs: process.env (read via the detection helpers from discovery/).
 * - Output: pure data (`DetectedReviewAxes`) — onboard prose renders it and
 *   asks the user axis-by-axis questions.
 * - Write-back seat: `write-review-block.ts` (sibling module).
 * - Consumed by: `.onto/processes/onboard.md` §§ 3.7/3.8 (added in P4).
 */

import {
  detectClaudeCodeEnvSignal,
  detectCodexBinaryAvailable,
  detectCodexEnvSignal,
} from "../discovery/host-detection.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Host category detected from env signals.
 *
 * Narrower vocabulary than `DetectedHostRuntime` from discovery/ because
 * onboard doesn't care about the config-override / env-override priority
 * lanes — it only needs to know which session the user is currently in so
 * it can propose sensible defaults.
 */
export type DetectedOnboardHost = "claude-code" | "codex-cli" | "plain-terminal";

/** Aggregated detection result for onboard stages 1–4. */
export interface DetectedReviewAxes {
  /** Design doc §5.2 stage 1 — host session. */
  host: DetectedOnboardHost;
  /**
   * Design doc §5.2 stage 2 — `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is set
   * to exactly `"1"` (matching the resolver's strict check in
   * `execution-topology-resolver.ts`). When true AND teamlead=main, onboard
   * can offer the Agent Teams transport for controlled lens deliberation.
   */
  agent_teams_available: boolean;
  /**
   * Design doc §5.2 stage 3 — codex binary on PATH + ~/.codex/auth.json.
   * When true, onboard stage 5 surfaces "codex" as a subagent option.
   */
  codex_available: boolean;
}

/** Public result envelope — keeps the JSON shape stable for prose callers. */
export interface DetectReviewAxesResult {
  detected: DetectedReviewAxes;
}

// ---------------------------------------------------------------------------
// Core detection
// ---------------------------------------------------------------------------

const ENV_AGENT_TEAMS = "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS";

/**
 * Map the discovery-layer env signals into the onboard host vocabulary.
 *
 * Priority: Claude Code > Codex CLI > plain terminal. Same ordering as
 * `detectHostRuntime` but projected into the simpler three-value domain.
 * Claude Code takes precedence because an inner Codex process inside a
 * Claude Code session still reports CLAUDECODE=1 — in that case the onboard
 * context is the Claude Code session, and codex availability is surfaced
 * separately as a subagent option.
 */
function detectHost(): DetectedOnboardHost {
  if (detectClaudeCodeEnvSignal()) return "claude-code";
  if (detectCodexEnvSignal()) return "codex-cli";
  return "plain-terminal";
}

/**
 * Detect the four review axes observable from environment alone.
 *
 * Pure w.r.t. process.env — no file writes, no network. Deterministic given
 * the same env snapshot + filesystem state (codex binary + auth.json).
 */
export function detectReviewAxes(): DetectReviewAxesResult {
  const host = detectHost();
  // Exact-match against `"1"` to stay consistent with the resolver's strict
  // check (`execution-topology-resolver.ts:506`). A loose `Boolean(...)` here
  // would disagree with the resolver when the user sets the variable to
  // `"0"` / `"false"` / `""`. Both layers must read the same signal the
  // same way so the onboard UX promise survives the runtime.
  const agent_teams_available = process.env[ENV_AGENT_TEAMS] === "1";
  const codex_available = detectCodexBinaryAvailable();

  return {
    detected: {
      host,
      agent_teams_available,
      codex_available,
    },
  };
}

// ---------------------------------------------------------------------------
// CLI entry — `npm run onboard:detect-review-axes`
// ---------------------------------------------------------------------------

function isMainModule(): boolean {
  // tsx executes this module directly; the ESM equivalent of
  // `require.main === module` is comparing import.meta.url to argv[1].
  const entry = process.argv[1];
  if (typeof entry !== "string" || entry.length === 0) return false;
  try {
    const entryUrl = new URL(`file://${entry}`).href;
    return import.meta.url === entryUrl;
  } catch {
    return false;
  }
}

function printHelp(): void {
  const lines = [
    "onboard:detect-review-axes",
    "",
    "Detects the environmental axes consumed by the onboard prose flow:",
    "  - host            (claude-code | codex-cli | plain-terminal)",
    "  - agent_teams     (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1)",
    "  - codex_available (codex on PATH + ~/.codex/auth.json)",
    "",
    "Usage:",
    "  npm run onboard:detect-review-axes",
    "  npm run onboard:detect-review-axes -- --help",
    "",
    "Output: single-line JSON { detected: { ... } } on stdout.",
  ];
  console.log(lines.join("\n"));
}

if (isMainModule()) {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    process.exit(0);
  }
  const result = detectReviewAxes();
  // Compact single-line JSON so the prose caller can forward it as-is into
  // the LLM context without re-parsing.
  console.log(JSON.stringify(result));
}
