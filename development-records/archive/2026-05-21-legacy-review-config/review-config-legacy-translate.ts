/**
 * Review UX Redesign P1 — legacy → v3 axis translation (pure functions).
 *
 * # What this module is
 *
 * Two pure translators that convert **legacy** config representations
 * (`execution_topology_priority` entries, or legacy provider-profile YAML)
 * into the new `OntoReviewConfig` axis form:
 *
 *   - `legacyTopologyIdToAxes(id)` — single topology id → partial axes.
 *   - `legacyFieldsToReviewConfig(raw)` — top-level YAML (possibly holding
 *     `execution_topology_priority`) → partial `OntoReviewConfig`.
 *
 * # Why it exists
 *
 * P4 (onboard) and P5 (`onto config`) migrate existing configs to the new
 * schema. Doing the translation in a pure, side-effect-free module means
 * both flows share identical semantics and P1 can ship coverage tests
 * without any runtime wiring. P1 does NOT call these functions from
 * runtime — they are library-only.
 *
 * # How it relates
 *
 * - Input: legacy identifier(s) from the existing sketch-v3 schema.
 * - Output: `Partial<OntoReviewConfig>` — caller overlays remaining
 *   user preferences (effort, concurrency) on top.
 * - Mapping table: see design doc §7.2 (authoritative).
 *
 * # Scope note (post-P9.2, 2026-04-21)
 *
 * P9.2 removed `execution_topology_priority` from the `OntoConfig` type.
 * In-process code can no longer carry this field, so this translator's
 * only remaining caller is **disk-based legacy YAML migration** (onboard
 * re-detect reading an old `.onto/config.yml` before any typing pass).
 * The `raw` parameter stays typed as `Record<string, unknown>` precisely
 * to support that pre-type reading — the input shape is what YAML
 * produced, not a current OntoConfig.
 */

import type {
  OntoReviewConfig,
  SubagentSpec,
  TeamleadSpec,
} from "../discovery/config-chain.js";

// ---------------------------------------------------------------------------
// Translation result type
// ---------------------------------------------------------------------------

export interface TranslatedAxes {
  teamlead?: TeamleadSpec;
  subagent?: SubagentSpec;
  /**
   * Runtime flags the translator inferred from the legacy id but cannot
   * express via the axis block alone (e.g. "this topology requires D=true
   * agent-teams env"). Onboard / config-edit surface these as runtime
   * preconditions when migrating.
   */
  runtime_preconditions: {
    /** Topology implies `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` must be set. */
    requires_agent_teams_env?: boolean;
    /** Topology implies host = Codex CLI (host detection should verify). */
    implies_host_codex?: boolean;
    /** Topology implies host = plain terminal (no Claude Code / Codex session). */
    implies_host_plain_terminal?: boolean;
  };
  /**
   * lens_deliberation axis value implied by the legacy id (only for
   * `cc-teams-lens-agent-deliberation`). Caller merges this into the
   * overall OntoReviewConfig.
   */
  lens_deliberation?: "synthesizer-only" | "sendmessage-a2a";
}

// ---------------------------------------------------------------------------
// Legacy topology id → axes
// ---------------------------------------------------------------------------

/**
 * Translate a single legacy topology id (from `execution_topology_priority`)
 * to partial axis config.
 *
 * Returns `null` for:
 *   - Unknown ids.
 *   - `generic-*` ids (explicitly marked "unimplemented / invalid" in
 *     design doc §7.2, dropped from the v3 catalog).
 *
 * Mapping table is the authoritative design doc §7.2.
 */
export function legacyTopologyIdToAxes(id: string): TranslatedAxes | null {
  switch (id) {
    case "cc-main-agent-subagent":
      return {
        teamlead: { model: "main" },
        subagent: { provider: "main-native" },
        runtime_preconditions: {},
      };
    case "cc-main-codex-subprocess":
      return {
        teamlead: { model: "main" },
        subagent: {
          provider: "codex",
          // model_id is required by the discriminated union. Legacy configs
          // did not carry it at this level (codex.* block held it). Caller
          // overlays from `config.codex.model` if available; absent that,
          // the validator will later flag this partial translation.
          model_id: "",
        },
        runtime_preconditions: {},
      };
    case "cc-teams-agent-subagent":
      return {
        teamlead: { model: "main" },
        subagent: { provider: "main-native" },
        runtime_preconditions: {
          requires_agent_teams_env: true,
        },
      };
    case "cc-teams-codex-subprocess":
      return {
        teamlead: { model: "main" },
        subagent: {
          provider: "codex",
          model_id: "",
        },
        runtime_preconditions: {
          requires_agent_teams_env: true,
        },
      };
    case "cc-teams-litellm-sessions":
      return {
        teamlead: { model: "main" },
        subagent: {
          provider: "litellm",
          model_id: "",
        },
        runtime_preconditions: {
          requires_agent_teams_env: true,
        },
      };
    case "cc-teams-lens-agent-deliberation":
      return {
        teamlead: { model: "main" },
        subagent: { provider: "main-native" },
        lens_deliberation: "sendmessage-a2a",
        runtime_preconditions: {
          requires_agent_teams_env: true,
        },
      };
    case "codex-main-subprocess":
      return {
        teamlead: { model: "main" },
        subagent: { provider: "main-native" },
        runtime_preconditions: {
          implies_host_codex: true,
        },
      };
    case "codex-nested-subprocess":
      return {
        teamlead: {
          model: {
            provider: "codex",
            model_id: "",
          },
        },
        subagent: {
          provider: "codex",
          model_id: "",
        },
        runtime_preconditions: {
          implies_host_plain_terminal: true,
        },
      };
    // generic-nested-subagent / generic-main-subagent: dropped per §7.2.
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Legacy config block → partial OntoReviewConfig
// ---------------------------------------------------------------------------

export interface LegacyTranslationOutput {
  config: Partial<OntoReviewConfig>;
  /** Topology id actually used as the translation source (first entry). */
  source_topology_id: string | null;
  /** Runtime preconditions bubbled up from the topology. */
  runtime_preconditions: TranslatedAxes["runtime_preconditions"];
  /** Warnings for the principal — e.g. partial fields needing user fill-in. */
  warnings: string[];
}

/**
 * Translate a legacy-shaped YAML object (top-level, post-cast) to partial
 * OntoReviewConfig. Consults `execution_topology_priority` first entry and
 * overlays model/effort from per-provider blocks (codex.*, litellm.*, etc.)
 * when available.
 *
 * Returns `null` when no legacy signal is present (no
 * `execution_topology_priority` entry and no recognized provider block).
 */
export function legacyFieldsToReviewConfig(
  raw: unknown,
): LegacyTranslationOutput | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const obj = raw as Record<string, unknown>;

  const priority = obj.execution_topology_priority;
  if (!Array.isArray(priority) || priority.length === 0) {
    return null;
  }
  const firstId = priority[0];
  if (typeof firstId !== "string") {
    return null;
  }

  const axes = legacyTopologyIdToAxes(firstId);
  if (!axes) {
    return null;
  }

  const warnings: string[] = [];
  const out: Partial<OntoReviewConfig> = {};

  if (axes.teamlead) {
    out.teamlead = overlayTeamleadModelFields(axes.teamlead, obj, warnings);
  }
  if (axes.subagent) {
    out.subagent = overlaySubagentModelFields(axes.subagent, obj, warnings);
  }
  if (axes.lens_deliberation) {
    out.lens_deliberation = axes.lens_deliberation;
  }

  return {
    config: out,
    source_topology_id: firstId,
    runtime_preconditions: axes.runtime_preconditions,
    warnings,
  };
}

function overlayTeamleadModelFields(
  teamlead: TeamleadSpec,
  raw: Record<string, unknown>,
  warnings: string[],
): TeamleadSpec {
  if (teamlead.model === "main") {
    return teamlead;
  }
  // External teamlead — overlay model_id / effort from legacy per-provider
  // block (only codex is reachable via current legacy topology ids).
  const provider = teamlead.model.provider;
  const block = readProviderBlock(raw, provider);
  const modelId =
    teamlead.model.model_id || readModelIdFromBlock(block) || "";
  const effort = teamlead.model.effort || readEffortFromBlock(block);

  if (!modelId) {
    warnings.push(
      `teamlead.model.model_id 미지정 — 기존 config 의 ${provider}.model 이 없습니다. ` +
        "새 config 의 teamlead.model.model_id 를 직접 채워주세요.",
    );
  }

  return {
    model: {
      provider,
      model_id: modelId,
      ...(effort ? { effort } : {}),
    },
  };
}

function overlaySubagentModelFields(
  subagent: SubagentSpec,
  raw: Record<string, unknown>,
  warnings: string[],
): SubagentSpec {
  if (subagent.provider === "main-native") {
    return subagent;
  }
  const provider = subagent.provider;
  const block = readProviderBlock(raw, provider);
  const modelId = subagent.model_id || readModelIdFromBlock(block) || "";
  const effort = subagent.effort || readEffortFromBlock(block);

  if (!modelId) {
    warnings.push(
      `subagent.model_id 미지정 — 기존 config 의 ${provider}.model 이 없습니다. ` +
        "새 config 의 subagent.model_id 를 직접 채워주세요.",
    );
  }

  return {
    provider,
    model_id: modelId,
    ...(effort ? { effort } : {}),
  };
}

function readProviderBlock(
  raw: Record<string, unknown>,
  provider: string,
): Record<string, unknown> | null {
  const block = raw[provider];
  if (typeof block === "object" && block !== null && !Array.isArray(block)) {
    return block as Record<string, unknown>;
  }
  return null;
}

function readModelIdFromBlock(
  block: Record<string, unknown> | null,
): string | null {
  if (!block) return null;
  const model = block.model;
  return typeof model === "string" && model.length > 0 ? model : null;
}

function readEffortFromBlock(
  block: Record<string, unknown> | null,
): string | null {
  if (!block) return null;
  const effort = block.effort;
  return typeof effort === "string" && effort.length > 0 ? effort : null;
}
