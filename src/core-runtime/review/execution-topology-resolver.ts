/**
 * Execution Topology Resolver — axis-first only (P9.1, 2026-04-21).
 *
 * # What this module is
 *
 * Single seat for selecting ONE canonical execution topology for a review
 * session. Topology is the top-level decision — teamlead location + lens
 * spawn mechanism + deliberation channel.
 *
 * # Why it exists
 *
 * `config.review` is the canonical execution intent. Invalid or unsupported
 * axes fail loudly.
 *
 * # How it relates
 *
 * - `resolveExecutionTopology()` — run axis-first derivation →
 *   prerequisite check → return topology or `no_host`. Emits `[topology]`
 *   STDERR for every branch (mirrors `[plan]` pattern from PR #96).
 * - `TOPOLOGY_CATALOG` — metadata for the 8 canonical options.
 * - `DIRECT_SPAWN_SUPPORTED_TOPOLOGIES` — spawn-time support set.
 *
 * # Design reference
 *
 * - P9 handoff: `project_review_ux_redesign_p9_handoff.md` (memory)
 * - Completion doc: `development-records/evolve/20260421-review-ux-redesign-completion.md`
 * - Sketch v3: `development-records/evolve/20260418-execution-topology-priority-sketch.md`
 */

import type { OntoConfig } from "../discovery/config-chain.js";
import {
  detectClaudeCodeEnvSignal,
  detectCodexBinaryAvailable,
  detectCodexEnvSignal,
} from "../discovery/host-detection.js";
import { validateReviewConfig } from "./review-config-validator.js";
import {
  deriveTopologyShape,
  type ShapeDerivationSignals,
} from "./topology-shape-derivation.js";
import { shapeToTopologyId } from "./shape-to-topology-id.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Canonical topology identifier.
 *
 * Prefix convention:
 *   - `cc-teams-*` : Claude Code + TeamCreate teamlead
 *   - `cc-main-*`  : Claude Code + onto TS main teamlead
 *   - `codex-*`    : codex-subprocess-based (host-agnostic or codex host)
 */
export type TopologyId =
  | "cc-teams-lens-agent-deliberation"
  | "cc-teams-agent-subagent"
  | "cc-teams-codex-subprocess"
  | "cc-main-agent-subagent"
  | "cc-main-codex-subprocess"
  | "codex-nested-subprocess"
  | "codex-main-subprocess";

/** Where the teamlead agent runs. */
export type TeamleadLocation =
  | "onto-main"
  | "claude-teamcreate"
  | "codex-subprocess";

/** Mechanism used to spawn each per-lens reasoning unit. */
export type LensSpawnMechanism =
  | "claude-agent-tool"
  | "claude-teamcreate-member"
  | "codex-subprocess";

/** Transport rank inherited from sketch v2; here a derived property. */
export type TransportRank = "S0" | "S1" | "S2" | "S3";

/** Whether lens agents can run the Agent Teams deliberation transport before synthesize. */
export type DeliberationChannel = "controlled-lens-deliberation";

/**
 * The resolved topology: a Topology metadata snapshot plus the decision
 * trace that led to its selection. plan_trace mirrors `[topology]` STDERR.
 */
export interface ExecutionTopology {
  id: TopologyId;
  teamlead_location: TeamleadLocation;
  lens_spawn_mechanism: LensSpawnMechanism;
  max_concurrent_lenses: number;
  transport_rank: TransportRank;
  deliberation_channel: DeliberationChannel;
  plan_trace: string[];
}

export type ExecutionTopologyResolution =
  | { type: "resolved"; topology: ExecutionTopology }
  | { type: "no_host"; plan_trace: string[]; reason: string };

export interface ResolveExecutionTopologyArgs {
  ontoConfig: OntoConfig;
  /** Environment snapshot; defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /**
   * Whether a Claude Code session is hosting this invocation. Defaults to
   * `detectClaudeCodeEnvSignal()`. Injected for test isolation.
   */
  claudeHost?: boolean;
  /**
   * Whether the Claude Code experimental agent-teams flag is set. Defaults
   * to `env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === "1"`.
   */
  experimentalAgentTeams?: boolean;
  /**
   * Whether codex binary and `~/.codex/auth.json` are both reachable.
   * Defaults to `detectCodexBinaryAvailable()`.
   */
  codexAvailable?: boolean;
  /**
   * Whether a Codex CLI session is currently hosting this invocation.
   * Defaults to `detectCodexEnvSignal()`.
   */
  codexSessionActive?: boolean;
}

// ---------------------------------------------------------------------------
// Topology catalog (sketch v3 §3 table)
// ---------------------------------------------------------------------------

type TopologyMetadata = Omit<ExecutionTopology, "plan_trace">;

/**
 * Canonical metadata for each topology option.
 *
 * Per sketch v3 §3: once a topology id is chosen, all other attributes
 * (teamlead location, spawn mechanism, max concurrency, transport rank,
 * deliberation channel) are static. Principal cannot override them
 * individually — they must change the topology id.
 *
 * `execution_topology_overrides` in config allows per-topology
 * `max_concurrent_lenses` adjustment only. Other fields are immutable.
 */
export const TOPOLOGY_CATALOG: Record<TopologyId, TopologyMetadata> = {
  "cc-teams-lens-agent-deliberation": {
    id: "cc-teams-lens-agent-deliberation",
    teamlead_location: "claude-teamcreate",
    lens_spawn_mechanism: "claude-teamcreate-member",
    max_concurrent_lenses: 10,
    transport_rank: "S2",
    deliberation_channel: "controlled-lens-deliberation",
  },
  "cc-teams-agent-subagent": {
    id: "cc-teams-agent-subagent",
    teamlead_location: "claude-teamcreate",
    lens_spawn_mechanism: "claude-agent-tool",
    max_concurrent_lenses: 10,
    transport_rank: "S2",
    deliberation_channel: "controlled-lens-deliberation",
  },
  "cc-teams-codex-subprocess": {
    id: "cc-teams-codex-subprocess",
    teamlead_location: "claude-teamcreate",
    lens_spawn_mechanism: "codex-subprocess",
    max_concurrent_lenses: 5,
    transport_rank: "S0",
    deliberation_channel: "controlled-lens-deliberation",
  },
  "cc-main-agent-subagent": {
    id: "cc-main-agent-subagent",
    teamlead_location: "onto-main",
    lens_spawn_mechanism: "claude-agent-tool",
    max_concurrent_lenses: 10,
    transport_rank: "S2",
    deliberation_channel: "controlled-lens-deliberation",
  },
  "cc-main-codex-subprocess": {
    id: "cc-main-codex-subprocess",
    teamlead_location: "onto-main",
    lens_spawn_mechanism: "codex-subprocess",
    max_concurrent_lenses: 5,
    transport_rank: "S0",
    deliberation_channel: "controlled-lens-deliberation",
  },
  "codex-nested-subprocess": {
    id: "codex-nested-subprocess",
    teamlead_location: "codex-subprocess",
    lens_spawn_mechanism: "codex-subprocess",
    max_concurrent_lenses: 5,
    transport_rank: "S0",
    deliberation_channel: "controlled-lens-deliberation",
  },
  "codex-main-subprocess": {
    id: "codex-main-subprocess",
    teamlead_location: "onto-main",
    lens_spawn_mechanism: "codex-subprocess",
    max_concurrent_lenses: 5,
    transport_rank: "S0",
    deliberation_channel: "controlled-lens-deliberation",
  },
};

/**
 * Topology ids whose spawn path is implemented in the direct executor path.
 */
export const DIRECT_SPAWN_SUPPORTED_TOPOLOGIES: ReadonlySet<TopologyId> = new Set<TopologyId>([
  "cc-main-agent-subagent",
  "cc-main-codex-subprocess",
  "codex-main-subprocess",
]);

// ---------------------------------------------------------------------------
// Observability
// ---------------------------------------------------------------------------

/**
 * Emit a `[topology]` prefixed decision line to STDERR.
 *
 * Parallels the `[plan]`, `[model-call]`, `[plan:executor]` prefixes.
 * `[topology]` sits at the top
 * of the layer stack: a reviewer scanning STDERR sees `[topology]` first
 * (macro decision) then `[plan]` (projection details) then `[model-call]`
 * (per-request invocation).
 *
 * No suppressor env var: topology decisions are load-bearing for review
 * reproducibility. Tests capture via `vi.spyOn(process.stderr, "write")`.
 */
function emitTopologyLog(line: string): void {
  process.stderr.write(`[topology] ${line}\n`);
}

// ---------------------------------------------------------------------------
// Per-topology requirement checks
// ---------------------------------------------------------------------------

interface DetectionSignals {
  claudeHost: boolean;
  experimentalAgentTeams: boolean;
  lensAgentTeamsMode: boolean;
  codexAvailable: boolean;
  codexSessionActive: boolean;
}

interface RequirementCheckResult {
  ok: boolean;
  /** Human-readable reason when ok === false, used for `[topology] skip` logs. */
  reason: string;
}

/**
 * Evaluate whether the given topology id's prerequisites are satisfied by
 * the current detection signals. Returns a `{ ok, reason }` pair: `reason`
 * is populated for both branches so trace output explains matches AND skips.
 */
function checkTopologyRequirements(
  id: TopologyId,
  signals: DetectionSignals,
): RequirementCheckResult {
  switch (id) {
    case "cc-teams-lens-agent-deliberation": {
      if (!signals.claudeHost) return { ok: false, reason: "need CLAUDECODE=1" };
      if (!signals.experimentalAgentTeams) {
        return { ok: false, reason: "need CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1" };
      }
      if (!signals.lensAgentTeamsMode) {
        return { ok: false, reason: "need config.lens_agent_teams_mode=true" };
      }
      return { ok: true, reason: "CLAUDECODE + experimental-teams + lens_agent_teams_mode all set" };
    }
    case "cc-teams-agent-subagent": {
      if (!signals.claudeHost) return { ok: false, reason: "need CLAUDECODE=1" };
      if (!signals.experimentalAgentTeams) {
        return { ok: false, reason: "need CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1" };
      }
      return { ok: true, reason: "CLAUDECODE + experimental-teams set" };
    }
    case "cc-teams-codex-subprocess": {
      if (!signals.claudeHost) return { ok: false, reason: "need CLAUDECODE=1" };
      if (!signals.experimentalAgentTeams) {
        return { ok: false, reason: "need CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1" };
      }
      if (!signals.codexAvailable) {
        return { ok: false, reason: "need codex binary + ~/.codex/auth.json" };
      }
      return { ok: true, reason: "CLAUDECODE + experimental-teams + codex binary all set" };
    }
    case "cc-main-agent-subagent": {
      if (!signals.claudeHost) return { ok: false, reason: "need CLAUDECODE=1" };
      return { ok: true, reason: "CLAUDECODE=1 detected" };
    }
    case "cc-main-codex-subprocess": {
      if (!signals.claudeHost) return { ok: false, reason: "need CLAUDECODE=1" };
      if (!signals.codexAvailable) {
        return { ok: false, reason: "need codex binary + ~/.codex/auth.json" };
      }
      return { ok: true, reason: "CLAUDECODE + codex binary both present" };
    }
    case "codex-nested-subprocess": {
      if (!signals.codexAvailable) {
        return { ok: false, reason: "need codex binary + ~/.codex/auth.json" };
      }
      return { ok: true, reason: "codex binary present (host-agnostic)" };
    }
    case "codex-main-subprocess": {
      if (!signals.codexSessionActive) {
        return { ok: false, reason: "need Codex CLI session signal (CODEX_THREAD_ID / CODEX_CI)" };
      }
      if (!signals.codexAvailable) {
        return { ok: false, reason: "need codex binary + ~/.codex/auth.json" };
      }
      return { ok: true, reason: "codex session + codex binary both present" };
    }
  }
}

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------

/**
 * Derive a single ExecutionTopology for this review session.
 *
 * Decision surface:
 *   1. `config.review` must be present.
 *   2. The axis block must validate and map to a known topology.
 *   3. The chosen topology must satisfy its environment requirements.
 *
 * After a TopologyId is resolved, `checkTopologyRequirements` still runs
 * against it — the axis/shape pipeline gates on host presence only, while
 * `checkTopologyRequirements` covers the full signal set (codex binary,
 * experimental flag, etc). A requirement miss yields `no_host`.
 *
 * Returns:
 *   - `{ type: "resolved", topology }` — resolved id passed its requirements.
 *   - `{ type: "no_host", plan_trace, reason }`
 */
export function resolveExecutionTopology(
  args: ResolveExecutionTopologyArgs,
): ExecutionTopologyResolution {
  const env = args.env ?? process.env;
  const trace: string[] = [];
  const log = (line: string): void => {
    emitTopologyLog(line);
    trace.push(line);
  };

  const signals: DetectionSignals = {
    claudeHost: args.claudeHost ?? detectClaudeCodeEnvSignal(),
    experimentalAgentTeams:
      args.experimentalAgentTeams ?? env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === "1",
    lensAgentTeamsMode: args.ontoConfig.lens_agent_teams_mode === true,
    codexAvailable: args.codexAvailable ?? detectCodexBinaryAvailable(),
    codexSessionActive: args.codexSessionActive ?? detectCodexEnvSignal(),
  };

  log(
    `signals: claudeHost=${signals.claudeHost} experimental=${signals.experimentalAgentTeams} ` +
      `lens_agent_teams_mode=${signals.lensAgentTeamsMode} codex=${signals.codexAvailable} ` +
      `codex_session=${signals.codexSessionActive}`,
  );

  const axisFirstId = resolveAxisFirstTopology(args.ontoConfig, signals, log);
  if (!axisFirstId) {
    log("no topology resolved");
    return {
      type: "no_host",
      plan_trace: trace,
      reason: buildNoTopologyReason(signals),
    };
  }

  log(`topology source=review-axes id=${axisFirstId}`);

  const check = checkTopologyRequirements(axisFirstId, signals);
  if (!check.ok) {
    log(`${axisFirstId}: skip — ${check.reason}`);
    log("derived topology failed detailed requirements check");
    return {
      type: "no_host",
      plan_trace: trace,
      reason: buildNoTopologyReason(signals),
    };
  }
  log(`${axisFirstId}: matched — ${check.reason}`);

  const metadata = applyReviewConcurrencyOverride(
    TOPOLOGY_CATALOG[axisFirstId],
    args.ontoConfig.review?.max_concurrent_lenses,
    log,
  );

  return {
    type: "resolved",
    topology: { ...metadata, plan_trace: trace },
  };
}

/**
 * Apply `review.max_concurrent_lenses` (Axis C) on top of the catalog
 * default. P9.2 (2026-04-21) made this the canonical override seat — the
 * previous `execution_topology_overrides` map was removed. Non-positive
 * values are ignored (fall back to catalog default) with a warning log.
 */
function applyReviewConcurrencyOverride(
  metadata: TopologyMetadata,
  requested: number | undefined,
  log: (line: string) => void,
): TopologyMetadata {
  if (requested === undefined) return metadata;
  // The TypeScript type already narrows `requested` to `number`, but
  // YAML parsing can yield `"6"` (string) or other non-numeric shapes
  // for this field. The runtime typeof check is defensive against that
  // parse-time coercion, not against typed in-process call sites.
  if (typeof requested !== "number" || requested <= 0) {
    log(
      `${metadata.id}: review.max_concurrent_lenses=${requested} ignored (must be positive integer)`,
    );
    return metadata;
  }
  if (requested === metadata.max_concurrent_lenses) return metadata;
  log(
    `${metadata.id}: override max_concurrent_lenses ${metadata.max_concurrent_lenses} → ${requested} (via review.max_concurrent_lenses)`,
  );
  return { ...metadata, max_concurrent_lenses: requested };
}

// ---------------------------------------------------------------------------
// Error message composition
// ---------------------------------------------------------------------------

function buildNoTopologyReason(signals: DetectionSignals): string {
  const lines: string[] = [];
  lines.push("Execution topology 를 도출할 수 없습니다.");
  lines.push("");
  lines.push("현재 환경 시그널:");
  lines.push(`  - Claude Code 세션 (CLAUDECODE=1):              ${signals.claudeHost}`);
  lines.push(`  - Experimental Agent Teams:                     ${signals.experimentalAgentTeams}`);
  lines.push(`  - Lens Agent Teams mode (config):               ${signals.lensAgentTeamsMode}`);
  lines.push(`  - Codex 바이너리 + ~/.codex/auth.json:          ${signals.codexAvailable}`);
  lines.push(`  - Codex CLI 세션 (CODEX_THREAD_ID / CODEX_CI):  ${signals.codexSessionActive}`);
  lines.push("");
  lines.push("해결 방법 (한 가지 선택):");
  lines.push("  1. Claude Code 세션에서 실행");
  lines.push("  2. codex CLI 설치 + `codex login` 구성");
  lines.push(
    "  3. `.onto/config.yml` 의 `review:` axis block 을 현재 환경에서 실행 가능한 형태로 조정",
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Spawn-time support check
// ---------------------------------------------------------------------------

/**
 * Error thrown when a resolver picks an option this install cannot spawn.
 *
 * The resolver itself never throws — it always returns a resolution.
 * Callers dispatching to executors call `assertDirectSpawnSupported(topology)`
 * before attempting to spawn.
 */
export class UnsupportedTopologyError extends Error {
  constructor(public readonly topologyId: TopologyId) {
    super(buildUnsupportedTopologyMessage(topologyId));
    this.name = "UnsupportedTopologyError";
  }
}

function buildUnsupportedTopologyMessage(id: TopologyId): string {
  const supported = [...DIRECT_SPAWN_SUPPORTED_TOPOLOGIES].join(", ");
  const requiredSurface =
    id === "cc-teams-agent-subagent" ||
    id === "cc-teams-codex-subprocess"
      ? "TeamCreate coordinator execution"
      : id === "codex-nested-subprocess"
        ? "external codex teamlead execution"
        : id === "cc-teams-lens-agent-deliberation"
          ? "controlled deliberation transport"
          : "provider adapter design";
  return [
    `ExecutionTopology id="${id}" 는 현 설치에서 직접 spawn 할 수 없습니다. 필요한 실행 표면: ${requiredSurface}.`,
    "지원되는 topology:",
    ...[...DIRECT_SPAWN_SUPPORTED_TOPOLOGIES].map((s) => `  - ${s}`),
    "",
    `Direct spawn 지원 옵션: ${supported}`,
  ].join("\n");
}

/**
 * Guard used by spawn-time code. Throws `UnsupportedTopologyError` when the
 * resolved topology is not wired for direct spawn in the current install.
 */
export function assertDirectSpawnSupported(topology: ExecutionTopology): void {
  if (!DIRECT_SPAWN_SUPPORTED_TOPOLOGIES.has(topology.id)) {
    throw new UnsupportedTopologyError(topology.id);
  }
}

// ---------------------------------------------------------------------------
// P2 axis-first helper (Review UX Redesign)
// ---------------------------------------------------------------------------

/**
 * Attempt to derive a `TopologyId` from the `review:` axis block.
 */
function resolveAxisFirstTopology(
  config: OntoConfig,
  signals: DetectionSignals,
  log: (line: string) => void,
): TopologyId | null {
  const reviewBlock = config.review;
  if (reviewBlock === undefined) {
    return null;
  }

  const validation = validateReviewConfig(reviewBlock);
  if (!validation.ok) {
    log("review-axes: validation failed");
    for (const err of validation.errors) {
      log(`review-axes: invalid — ${err.path}: ${err.message}`);
    }
    return null;
  }

  const derivationSignals: ShapeDerivationSignals = {
    claudeHost: signals.claudeHost,
    codexSessionActive: signals.codexSessionActive,
    experimentalAgentTeams: signals.experimentalAgentTeams,
    lensAgentTeamsMode: signals.lensAgentTeamsMode,
  };
  const derivation = deriveTopologyShape(validation.config, derivationSignals);
  for (const line of derivation.ok ? derivation.derived.trace : derivation.trace) {
    log(`review-axes: ${line}`);
  }
  if (!derivation.ok) {
    log("review-axes: shape derivation failed");
    for (const reason of derivation.reasons) {
      log(`review-axes: ${reason}`);
    }
    return null;
  }

  const mapping = shapeToTopologyId({
    shape: derivation.derived.shape,
    subagent_provider: derivation.derived.subagent_provider,
    signals: {
      claudeHost: signals.claudeHost,
      codexSessionActive: signals.codexSessionActive,
    },
  });
  for (const line of mapping.trace) {
    log(`review-axes: ${line}`);
  }
  if (!mapping.ok) {
    log("review-axes: shape→TopologyId mapping failed");
    log(`review-axes: ${mapping.reason}`);
    return null;
  }

  log(`review-axes: derived TopologyId=${mapping.topology_id}`);
  return mapping.topology_id;
}
