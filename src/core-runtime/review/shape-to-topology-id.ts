/**
 * Review topology shape → TopologyId mapping.
 *
 * # What this module is
 *
 * A pure function that converts the axis-derived `TopologyShape` plus
 * host-context signals into a canonical `TopologyId`.
 *
 * # Why it exists
 *
 * Shape does not uniquely determine TopologyId because several shapes
 * depend on host type:
 *
 *   - `main_native` + Claude host  → `cc-main-agent-subagent`
 *   - `main_native` + Codex host   → `codex-main-subprocess`
 *   - `main_foreign` (codex) + CC  → `cc-main-codex-subprocess`
 *   - `main-teams_foreign` (codex) → `cc-teams-codex-subprocess`
 *
 * # How it relates
 *
 * - Input: `TopologyShape` (from `topology-shape-derivation.ts`) +
 *   `{claudeHost, codexSessionActive}` + optional foreign subagent provider.
 * - Output: a `TopologyId` or a failure reason.
 */

import type { ForeignProvider } from "../discovery/config-chain.js";
import type { TopologyId } from "./execution-topology-resolver.js";
import type { TopologyShape } from "./topology-shape-derivation.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ShapeMappingSignals {
  /** Claude Code session is hosting. Determines CC vs Codex branch. */
  claudeHost: boolean;
  /** Codex CLI session is hosting (used when claudeHost is false). */
  codexSessionActive: boolean;
}

export interface ShapeMappingInput {
  shape: TopologyShape;
  /** Foreign subagent provider when the shape carries one. null for native. */
  subagent_provider: ForeignProvider | null;
  signals: ShapeMappingSignals;
}

export interface ShapeMappingSuccess {
  ok: true;
  topology_id: TopologyId;
  trace: string[];
}

export interface ShapeMappingFailure {
  ok: false;
  reason: string;
  trace: string[];
}

export type ShapeMappingResult = ShapeMappingSuccess | ShapeMappingFailure;

// ---------------------------------------------------------------------------
// Main mapping function
// ---------------------------------------------------------------------------

/**
 * Map a shape classification to a canonical TopologyId value.
 *
 * Returns failure when the shape + signal combination has no canonical
 * TopologyId in the current catalog. Failure cases (post-P2):
 *   - `main_native` with neither Claude nor Codex host (plain terminal
 *     without codex OAuth — truly unreachable).
 *   - `main_foreign` with a provider that has no `cc-main-<provider>`
 *     entry in the catalog. Currently only `codex` has such an entry;
 *     non-codex LLM model selection now belongs to `llm`, not this topology
 *     axis.
 */
export function shapeToTopologyId(input: ShapeMappingInput): ShapeMappingResult {
  const { shape, subagent_provider, signals } = input;
  const trace: string[] = [];
  const log = (line: string): void => {
    trace.push(line);
  };

  log(
    `mapping shape=${shape} subagent_provider=${subagent_provider ?? "null"} ` +
      `claudeHost=${signals.claudeHost} codexSessionActive=${signals.codexSessionActive}`,
  );

  switch (shape) {
    case "main_native": {
      if (signals.claudeHost) {
        log("→ cc-main-agent-subagent (Claude host + native = Agent tool)");
        return { ok: true, topology_id: "cc-main-agent-subagent", trace };
      }
      if (signals.codexSessionActive) {
        log("→ codex-main-subprocess (Codex host + native = codex subprocess)");
        return { ok: true, topology_id: "codex-main-subprocess", trace };
      }
      log("no canonical TopologyId: main_native requires Claude or Codex host");
      return {
        ok: false,
        reason:
          "main_native shape requires Claude Code or Codex CLI host session. " +
          "Neither CLAUDECODE=1 nor CODEX_THREAD_ID detected.",
        trace,
      };
    }

    case "main_foreign": {
      if (signals.claudeHost && subagent_provider === "codex") {
        log("→ cc-main-codex-subprocess (Claude + main + codex lens)");
        return { ok: true, topology_id: "cc-main-codex-subprocess", trace };
      }
      log(
        `no canonical TopologyId: main_foreign with provider=${subagent_provider} ` +
          `requires teams mode or a different provider`,
      );
      return {
        ok: false,
        reason:
          `main_foreign shape with provider=${subagent_provider} has no canonical TopologyId. ` +
          "Either (a) enable CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 for main-teams_foreign, " +
          "or (b) use provider=codex under Claude host for cc-main-codex-subprocess.",
        trace,
      };
    }

    case "main-teams_native": {
      log("→ cc-teams-agent-subagent (TeamCreate + native lens)");
      return { ok: true, topology_id: "cc-teams-agent-subagent", trace };
    }

    case "main-teams_foreign": {
      if (subagent_provider === "codex") {
        log("→ cc-teams-codex-subprocess (TeamCreate + codex lens)");
        return { ok: true, topology_id: "cc-teams-codex-subprocess", trace };
      }
      log(
        `no canonical TopologyId: main-teams_foreign with provider=${subagent_provider}`,
      );
      return {
        ok: false,
        reason:
          `main-teams_foreign shape with provider=${subagent_provider} has no canonical TopologyId. ` +
          "Only provider=codex is mapped in the review topology axis. Use llm.provider for API-key/local model selection.",
        trace,
      };
    }

    case "main-teams_a2a": {
      log("→ cc-teams-lens-agent-deliberation (TeamCreate + native + a2a)");
      return {
        ok: true,
        topology_id: "cc-teams-lens-agent-deliberation",
        trace,
      };
    }

    case "ext-teamlead_native": {
      // Only codex is supported as external teamlead in the current catalog.
      log("→ codex-nested-subprocess (external codex teamlead + nested codex lens)");
      return { ok: true, topology_id: "codex-nested-subprocess", trace };
    }
  }
}
