/**
 * Topology → ReviewUnitExecutor mapping.
 *
 * # What this module is
 *
 * A thin function seat that maps a resolved `ExecutionTopology` (from
 * `src/core-runtime/review/execution-topology-resolver.ts`) to the concrete
 * `ReviewUnitExecutorConfig` (bin + argv) used by
 * `executeReviewPromptExecution` to spawn each lens / synthesize unit.
 *
 * # Why it exists
 *
 * Topology is the primary decision seat. This module maps topology metadata
 * to the executor binary for per-lens reasoning.
 *
 * The mapping is deterministic — it reads only `topology.lens_spawn_mechanism`:
 *
 *   - `codex-subprocess`          → codex-review-unit-executor.ts
 *   - `claude-agent-tool`         → coordinator-start handoff path
 *                                   (no standalone executor binary; the
 *                                   Claude coordinator subagent spawns
 *                                   lens subagents via its own Agent tool)
 *   - `claude-teamcreate-member`  → PR-D (SendMessage A2A lifecycle)
 *
 * # How it relates
 *
 * - `resolveExecutionTopology()` decides WHICH topology applies.
 * - `mapTopologyToExecutorConfig()` (here) decides HOW to run each lens
 *   under that topology at the TS subprocess level.
 * - The TeamCreate teamlead layer (`cc-teams-*` variants vs `cc-main-*`)
 *   is an orthogonal coordinator-state-machine concern — same lens
 *   executor applies within either teamlead pattern.
 */

import type {
  ExecutionTopology,
  LensSpawnMechanism,
  TopologyId,
} from "../review/execution-topology-resolver.js";
import type { ReviewUnitExecutorConfig } from "./run-review-prompt-execution.js";

// ---------------------------------------------------------------------------
// Direct executor support set
// ---------------------------------------------------------------------------

/**
 * Topology ids whose lens spawn path is wired to a direct executor.
 */
export const PR_B_SUPPORTED_TOPOLOGIES: ReadonlySet<TopologyId> = new Set<TopologyId>([
  "cc-main-agent-subagent",
  "cc-main-codex-subprocess",
  "codex-main-subprocess",
  "cc-teams-agent-subagent",
  "cc-teams-codex-subprocess",
]);

/**
 * Mechanisms whose executor binary lives in the onto TS distribution.
 *
 * `claude-agent-tool` is NOT in this set — there is no standalone binary
 * for it; lens subagents are spawned by the Claude coordinator via its
 * own Agent tool invocation, not via `child_process.spawn` from TS.
 */
const TS_EXECUTABLE_MECHANISMS: ReadonlySet<LensSpawnMechanism> = new Set<LensSpawnMechanism>([
  "codex-subprocess",
]);

/**
 * True when the topology's lens spawn mechanism resolves to a TS-executable
 * binary (`codex-review-unit-executor.ts` or
 * `inline-http-review-unit-executor.ts`), i.e. the caller can invoke
 * `mapTopologyToExecutorConfig()` and feed the result to
 * `executeReviewPromptExecution()`.
 *
 * For `claude-agent-tool` topologies the caller must route via the
 * coordinator-start handoff instead — no subprocess executor exists.
 */
export function hasStandaloneLensExecutor(topology: ExecutionTopology): boolean {
  return TS_EXECUTABLE_MECHANISMS.has(topology.lens_spawn_mechanism);
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class TopologyExecutorMappingError extends Error {
  constructor(
    public readonly topologyId: TopologyId,
    public readonly reason: string,
  ) {
    super(
      `ExecutionTopology id="${topologyId}" 를 ReviewUnitExecutor 로 매핑할 수 없습니다: ${reason}`,
    );
    this.name = "TopologyExecutorMappingError";
  }
}

// ---------------------------------------------------------------------------
// Executor config builders (delegate to existing binary paths)
// ---------------------------------------------------------------------------

/**
 * Kept local (not imported from review-invoke) to avoid circular imports
 * — review-invoke.ts already imports from cli/run-review-prompt-execution,
 * and this module imports from cli/run-review-prompt-execution's type
 * exports. Direct dependency on review-invoke would close the cycle.
 */
import path from "node:path";

function codexExecutorConfig(ontoHome: string): ReviewUnitExecutorConfig {
  return {
    bin: "node",
    args: [path.join(ontoHome, "dist", "core-runtime", "cli", "codex-review-unit-executor.js")],
  };
}

// ---------------------------------------------------------------------------
// Main mapping function
// ---------------------------------------------------------------------------

/**
 * Map a resolved topology to the review-unit executor that handles each
 * lens / synthesize invocation under that topology.
 *
 * Throws `TopologyExecutorMappingError` when:
 *   - The topology id is not in `PR_B_SUPPORTED_TOPOLOGIES` (caller should
 *     not reach this function for unsupported ids; guard upstream).
 *   - The lens_spawn_mechanism requires a TS-invisible dispatch path
 *     (`claude-agent-tool`, `claude-teamcreate-member`) —
 *     these are not subprocess executors; see `hasStandaloneLensExecutor`.
 *
 * This module's scope is mechanism→binary, not config→argv.
 */
export function mapTopologyToExecutorConfig(
  topology: ExecutionTopology,
  ontoHome: string,
): ReviewUnitExecutorConfig {
  if (!PR_B_SUPPORTED_TOPOLOGIES.has(topology.id)) {
    throw new TopologyExecutorMappingError(
      topology.id,
      `PR-B 지원 set 밖. 지원되는 옵션: ${[...PR_B_SUPPORTED_TOPOLOGIES].join(", ")}`,
    );
  }
  switch (topology.lens_spawn_mechanism) {
    case "codex-subprocess":
      return codexExecutorConfig(ontoHome);
    case "claude-agent-tool":
      throw new TopologyExecutorMappingError(
        topology.id,
        "claude-agent-tool lens spawn 은 coordinator-start handoff 로 route 하세요 " +
          "(Claude coordinator subagent 가 Agent tool 로 lens subagent 를 spawn). " +
          "Subprocess executor 가 존재하지 않습니다.",
      );
    case "claude-teamcreate-member":
      throw new TopologyExecutorMappingError(
        topology.id,
        "claude-teamcreate-member lens spawn 은 PR-D 에서 제공 예정 " +
          "(SendMessage A2A deliberation lifecycle).",
      );
  }
}

// ---------------------------------------------------------------------------
// Coordinator handoff enrichment
// ---------------------------------------------------------------------------

/**
 * The coordinator state machine, running as a Claude subagent, reads this
 * structure from the coordinator-start handoff payload to decide its own
 * orchestration shape. PR-A added `topology_id` to `ExecutionPlan` as an
 * observation field; PR-B promotes it to a first-class handoff attribute.
 *
 * Fields are a JSON-serializable subset of `ExecutionTopology` — the
 * `plan_trace` is intentionally elided (not load-bearing for downstream
 * dispatch and would bloat the handoff JSON).
 */
export interface CoordinatorTopologyDescriptor {
  id: TopologyId;
  teamlead_location: ExecutionTopology["teamlead_location"];
  lens_spawn_mechanism: LensSpawnMechanism;
  max_concurrent_lenses: number;
  transport_rank: ExecutionTopology["transport_rank"];
  deliberation_channel: ExecutionTopology["deliberation_channel"];
}

/** Drop `plan_trace` for handoff transmission. */
export function toCoordinatorTopologyDescriptor(
  topology: ExecutionTopology,
): CoordinatorTopologyDescriptor {
  return {
    id: topology.id,
    teamlead_location: topology.teamlead_location,
    lens_spawn_mechanism: topology.lens_spawn_mechanism,
    max_concurrent_lenses: topology.max_concurrent_lenses,
    transport_rank: topology.transport_rank,
    deliberation_channel: topology.deliberation_channel,
  };
}
