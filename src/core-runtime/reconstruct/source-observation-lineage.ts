import { atomicWriteYamlDocument as writeYamlDocument } from "../artifact-io.js";
import type {
  ReconstructReachabilityStageWitness,
  ReconstructSourceObservationDeltaArtifact,
  ReconstructSourceObservationLineageCensus,
  ReconstructSourceObservationLineageIndexArtifact,
  ReconstructStageId,
} from "./artifact-types.js";
import { isoNow } from "./run-primitives.js";
import { readYamlDocument } from "./semantic-map-resume.js";

export async function writeSourceObservationLineageIndexArtifact(args: {
  sessionId: string;
  rows: Array<{
    sourceObservationDeltaPath: string;
    sourceObservationDeltaValidationPath: string;
    sourceObservationReentryValidationPath: string;
  }>;
  outputPath: string;
}): Promise<ReconstructSourceObservationLineageIndexArtifact> {
  const lineageRows: ReconstructSourceObservationLineageIndexArtifact["lineage_rows"] = [];
  for (const row of args.rows) {
    const delta = await readYamlDocument<ReconstructSourceObservationDeltaArtifact>(
      row.sourceObservationDeltaPath,
    );
    lineageRows.push({
      lineage_row_id:
        `source-observation-lineage:${delta.round_id}:${delta.frontier_kind}:${lineageRows.length + 1}`,
      round_id: delta.round_id,
      frontier_kind: delta.frontier_kind,
      source_observation_delta_ref: row.sourceObservationDeltaPath,
      source_observation_delta_validation_ref:
        row.sourceObservationDeltaValidationPath,
      source_observation_reentry_validation_ref:
        row.sourceObservationReentryValidationPath,
      added_observation_ids: [...delta.added_observation_ids],
    });
  }
  const artifact: ReconstructSourceObservationLineageIndexArtifact = {
    schema_version: "1",
    session_id: args.sessionId,
    created_at: isoNow(),
    lineage_rows: lineageRows,
  };
  await writeYamlDocument(args.outputPath, artifact);
  return artifact;
}

/**
 * Reachability witness for the five witness-less observation-lineage stages (design v2 §3,
 * leaf_read/f1a3c1b pattern). Built deterministically from the number of exploration rounds
 * that produced a source-observation delta, and written ALWAYS when the observation-lineage
 * phase runs (even with zero delta rounds) — so "ran and legitimately produced nothing" is a
 * recorded fact, distinct from "never ran" (no census). A graceful terminal reads this to
 * authorize a legit_conditional skip; the manifest builder cannot self-declare a no-op the
 * census does not confirm.
 *
 * delta / delta-validation / reentry-validation are produced per round and produce nothing when
 * the exploration loop converged without accepting new frontier refs — a legitimate no-op (the
 * only way the loop reaches this phase with zero delta rounds is convergence; a non-convergent
 * overrun throws and never reaches the census). The lineage index and its validation are written
 * unconditionally once the phase closes, so they always produced.
 */
export function buildSourceObservationLineageCensus(args: {
  sessionId: string;
  deltaRoundsProduced: number;
}): ReconstructSourceObservationLineageCensus {
  const deltaProduced = args.deltaRoundsProduced > 0;
  const deltaGroup: ReconstructReachabilityStageWitness[] = [
    "source_observation_delta",
    "source_observation_delta_validation",
    "source_observation_reentry_validation",
  ].map((stepId) => ({
    step_id: stepId as ReconstructStageId,
    produced: deltaProduced,
    legit_no_op: !deltaProduced,
  }));
  return {
    schema_version: "1",
    session_id: args.sessionId,
    stage_witnesses: [
      ...deltaGroup,
      { step_id: "source_observation_lineage_index", produced: true, legit_no_op: false },
      {
        step_id: "source_observation_lineage_index_validation",
        produced: true,
        legit_no_op: false,
      },
    ],
  };
}
