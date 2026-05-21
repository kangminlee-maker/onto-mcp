/**
 * Review UX Redesign P2 — topology shape derivation (pure function).
 *
 * # What this module is
 *
 * Takes a validated `OntoReviewConfig` (user-facing axes) plus environment
 * signals and derives the **topology shape** — one of 6 internal classes
 * that capture "how the review execution is shaped" (teamlead location ×
 * lens spawn mechanism × deliberation channel) independent of the concrete
 * host adapter.
 *
 * # Why it exists
 *
 * Design doc §4.1: "User 는 config 의 A-F 만 결정; runtime 이 아래 6 shape
 * 중 하나로 유도해서 `[topology]` STDERR + session-metadata 에 기록."
 *
 * The shape is the intermediate vocabulary. User-facing axes are decision
 * variables; internal TopologyId (10 canonical values) is implementation
 * detail. Shape sits between: it is stable across host choices (Claude /
 * Codex / plain terminal) but varies with agent-teams availability and
 * deliberation choice.
 *
 * # How it relates
 *
 * - Input:  validated `OntoReviewConfig` (from `review-config-validator.ts`),
 *           environment signals (host type + teams env).
 * - Output: `{ shape, subagent_provider?, trace[] }` or `{ ok: false, reasons }`.
 * - Next stage: `shape-to-topology-id.ts` converts the shape + host signals
 *   into a concrete `TopologyId` the existing executor catalog supports.
 * - P2 does not spawn or dispatch — it only derives. `resolveExecutionTopology`
 *   is the integrating caller.
 */

import type {
  ForeignProvider,
  OntoReviewConfig,
  SubagentSpec,
} from "../discovery/config-chain.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * 6 canonical topology shapes (design doc §4.1).
 *
 * Shape semantics:
 *   - `main_native`         : host main session as teamlead; host's native
 *                             subagent mechanism (Claude Agent tool or
 *                             Codex subprocess).
 *   - `main_foreign`        : host main session as teamlead; foreign
 *                             provider subagent (explicit spec).
 *   - `main-teams_native`   : TeamCreate wrapping as teamlead (Claude only);
 *                             native lens spawn inside the team.
 *   - `main-teams_foreign`  : TeamCreate wrapping; foreign-provider lens.
 *   - `main-teams_a2a`      : TeamCreate wrapping; native lens + lens-to-lens
 *                             SendMessage deliberation channel active.
 *   - `ext-teamlead_native` : external process (currently codex) as teamlead;
 *                             that process's native subagent (nested codex).
 */
export type TopologyShape =
  | "main_native"
  | "main_foreign"
  | "main-teams_native"
  | "main-teams_foreign"
  | "main-teams_a2a"
  | "ext-teamlead_native";

/**
 * Environment signals required to pick the shape. Subset of the full
 * `DetectionSignals` used by the resolver — only the signals that influence
 * shape derivation (teams availability, host type).
 */
export interface ShapeDerivationSignals {
  /** Claude Code session is hosting (CLAUDECODE=1 or related). */
  claudeHost: boolean;
  /** Codex CLI session is hosting (CODEX_THREAD_ID / CODEX_CI). */
  codexSessionActive: boolean;
  /** CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 (D axis, auto-detected). */
  experimentalAgentTeams: boolean;
}

export interface DerivedShape {
  shape: TopologyShape;
  /**
   * Foreign subagent provider when the shape carries one (main_foreign,
   * main-teams_foreign, ext-teamlead_native). `null` for native shapes.
   *
   * The shape-to-topology-id mapper consults this for provider-specific
   * codex subprocess mappings.
   */
  subagent_provider: ForeignProvider | null;
  /** Derivation trace (each line is a human-readable reasoning step). */
  trace: string[];
}

export type ShapeDerivationResult =
  | { ok: true; derived: DerivedShape }
  | { ok: false; reasons: string[]; trace: string[] };

// ---------------------------------------------------------------------------
// Main derivation function
// ---------------------------------------------------------------------------

/**
 * Derive the topology shape from validated axes + environment signals.
 *
 * Logic (design doc §4.2 Host × Shape table):
 *
 *   teamlead=external  → ext-teamlead_native (currently codex only)
 *
 *   teamlead=main AND lens_deliberation=sendmessage-a2a:
 *     → main-teams_a2a  (requires D=true + subagent=main-native)
 *     → error otherwise
 *
 *   teamlead=main AND teams available (Claude + D=true):
 *     subagent=main-native → main-teams_native
 *     subagent=foreign     → main-teams_foreign
 *
 *   teamlead=main AND teams NOT available:
 *     subagent=main-native → main_native
 *     subagent=foreign     → main_foreign
 *
 * Returns `ok=false` when a user-specified axis conflicts with the
 * environment (e.g. a2a requested but teams not available). Caller
 * decides whether to fall back (P3) or fail.
 */
export function deriveTopologyShape(
  reviewConfig: OntoReviewConfig,
  signals: ShapeDerivationSignals,
): ShapeDerivationResult {
  const trace: string[] = [];
  const log = (line: string): void => {
    trace.push(line);
  };

  // Step 1: resolve teamlead. Default = main when block absent.
  const teamleadModel = reviewConfig.teamlead?.model ?? "main";
  log(
    `teamlead=${teamleadModel === "main" ? "main" : `external(${teamleadModel.provider})`}`,
  );

  // Step 2: external teamlead path.
  if (teamleadModel !== "main") {
    if (teamleadModel.provider !== "codex") {
      return {
        ok: false,
        reasons: [
          `External teamlead provider '${teamleadModel.provider}' is not supported (only 'codex').`,
        ],
        trace,
      };
    }
    log("shape=ext-teamlead_native (external codex teamlead)");
    return {
      ok: true,
      derived: {
        shape: "ext-teamlead_native",
        subagent_provider: "codex",
        trace,
      },
    };
  }

  // Step 3: main teamlead — inspect subagent.
  const subagent: SubagentSpec =
    reviewConfig.subagent ?? { provider: "main-native" };
  log(
    `subagent=${subagent.provider}${subagent.provider !== "main-native" ? `(model_id=${subagent.model_id})` : ""}`,
  );

  const teamsAvailable = signals.claudeHost && signals.experimentalAgentTeams;
  log(
    `teams_available=${teamsAvailable} (claudeHost=${signals.claudeHost}, experimentalAgentTeams=${signals.experimentalAgentTeams})`,
  );

  const wantsA2a = reviewConfig.lens_deliberation === "sendmessage-a2a";
  log(
    `lens_deliberation=${reviewConfig.lens_deliberation ?? "synthesizer-only(default)"}`,
  );

  // Step 4: a2a deliberation requires teams + native subagent.
  if (wantsA2a) {
    const violations: string[] = [];
    if (!teamsAvailable) {
      violations.push(
        "lens_deliberation=sendmessage-a2a requires Claude host + CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1, but one or both are missing.",
      );
    }
    if (subagent.provider !== "main-native") {
      violations.push(
        `lens_deliberation=sendmessage-a2a requires subagent.provider=main-native, but got '${subagent.provider}'.`,
      );
    }
    if (violations.length > 0) {
      return { ok: false, reasons: violations, trace };
    }
    log("shape=main-teams_a2a (teams + native + a2a)");
    return {
      ok: true,
      derived: {
        shape: "main-teams_a2a",
        subagent_provider: null,
        trace,
      },
    };
  }

  // Step 5: teams-available branch.
  if (teamsAvailable) {
    if (subagent.provider === "main-native") {
      log("shape=main-teams_native (teams + native)");
      return {
        ok: true,
        derived: {
          shape: "main-teams_native",
          subagent_provider: null,
          trace,
        },
      };
    }
    log(`shape=main-teams_foreign (teams + provider=${subagent.provider})`);
    return {
      ok: true,
      derived: {
        shape: "main-teams_foreign",
        subagent_provider: subagent.provider,
        trace,
      },
    };
  }

  // Step 6: no teams — flat main path.
  if (subagent.provider === "main-native") {
    log("shape=main_native (flat main + native)");
    return {
      ok: true,
      derived: { shape: "main_native", subagent_provider: null, trace },
    };
  }
  log(`shape=main_foreign (flat main + provider=${subagent.provider})`);
  return {
    ok: true,
    derived: {
      shape: "main_foreign",
      subagent_provider: subagent.provider,
      trace,
    },
  };
}
