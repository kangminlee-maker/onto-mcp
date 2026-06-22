import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { assertArrayField, atomicWriteYamlDocument as writeYamlDocument } from "../artifact-io.js";
import type {
  ReconstructMaturationClosureFrontierArtifact,
  ReconstructMaturationClosureFrontierValidationArtifact,
  ReconstructSourceFrontierArtifact,
  ReconstructSourceFrontierValidationArtifact,
  ReconstructSourceObservationDeltaArtifact,
  ReconstructSourceObservationDeltaFrontierKind,
  ReconstructSourceObservationDeltaValidationArtifact,
  ReconstructSourceObservationDeltaValidationViolation,
  ReconstructSourceObservationLineageIndexArtifact,
  ReconstructSourceObservationLineageIndexValidationArtifact,
  ReconstructSourceObservationLineageIndexValidationViolation,
  ReconstructSourceObservationReentryValidationArtifact,
  ReconstructSourceObservationReentryValidationViolation,
  ReconstructSourceObservationsArtifact,
  ReconstructSourceSafetyLedgerArtifact,
  ReconstructSourceSafetyLedgerValidationArtifact,
} from "./artifact-types.js";
import type { ReconstructSourceObservation } from "./source-observations.js";
import { sourceSafetyRowIdForObservation } from "./source-safety-validation.js";
import { assertObligation } from "./obligation-assertion.js";

type SourceObservationDeltaFrontierArtifact =
  | ReconstructSourceFrontierArtifact
  | ReconstructMaturationClosureFrontierArtifact;

type SourceObservationDeltaFrontierValidationArtifact =
  | ReconstructSourceFrontierValidationArtifact
  | ReconstructMaturationClosureFrontierValidationArtifact;

interface NormalizedFrontierForDelta {
  roundId: string;
  validationStatus: "valid" | "invalid";
  acceptedRefIds: string[];
  rowsById: Map<string, { sourceRef: string }>;
}

function isoNow(): string {
  return new Date().toISOString();
}

async function readYamlDocument<T>(filePath: string): Promise<T> {
  return parseYaml(await fs.readFile(filePath, "utf8")) as T;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(record[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sourceObservationHash(
  observation: ReconstructSourceObservation,
): string {
  return crypto.createHash("sha256").update(stableJson(observation)).digest("hex");
}

function violation(args: {
  code: ReconstructSourceObservationDeltaValidationViolation["code"];
  message: string;
  subjectId?: string | null;
}): ReconstructSourceObservationDeltaValidationViolation {
  return {
    code: args.code,
    message: args.message,
    subject_id: args.subjectId ?? null,
  };
}

function reentryViolation(args: {
  code: ReconstructSourceObservationReentryValidationViolation["code"];
  message: string;
  subjectId?: string | null;
}): ReconstructSourceObservationReentryValidationViolation {
  return {
    code: args.code,
    message: args.message,
    subject_id: args.subjectId ?? null,
  };
}

function lineageIndexViolation(args: {
  code: ReconstructSourceObservationLineageIndexValidationViolation["code"];
  message: string;
  subjectId?: string | null;
}): ReconstructSourceObservationLineageIndexValidationViolation {
  return {
    code: args.code,
    message: args.message,
    subject_id: args.subjectId ?? null,
  };
}

function duplicateIds(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function setDiff(left: readonly string[], right: readonly string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value)).sort();
}

function samePathRef(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  if (!left || !right) return false;
  return path.resolve(left) === path.resolve(right);
}

function observationsBySourceRef(
  observations: ReconstructSourceObservationsArtifact,
): Map<string, ReconstructSourceObservation> {
  assertArrayField(observations.observations, "source-observations", "observations");
  return new Map(observations.observations.map((observation) => [
    path.resolve(observation.source_ref),
    observation,
  ]));
}

function hasSourceFrontierRows(
  frontier: SourceObservationDeltaFrontierArtifact,
): frontier is ReconstructSourceFrontierArtifact {
  return Array.isArray((frontier as ReconstructSourceFrontierArtifact).frontier_refs);
}

function hasMaturationClosureSourceRequests(
  frontier: SourceObservationDeltaFrontierArtifact,
): frontier is ReconstructMaturationClosureFrontierArtifact {
  return Array.isArray(
    (frontier as ReconstructMaturationClosureFrontierArtifact).source_requests,
  );
}

function normalizeFrontierForDelta(args: {
  frontierKind: ReconstructSourceObservationDeltaFrontierKind;
  frontier: SourceObservationDeltaFrontierArtifact;
  frontierValidation: SourceObservationDeltaFrontierValidationArtifact;
  violations?: ReconstructSourceObservationDeltaValidationViolation[];
}): NormalizedFrontierForDelta | null {
  if (args.frontierKind === "source_frontier") {
    if (!hasSourceFrontierRows(args.frontier)) {
      args.violations?.push(violation({
        code: "frontier_kind_mismatch",
        message: "source_frontier delta requires a source-frontier artifact",
      }));
      return null;
    }
    const validation =
      args.frontierValidation as ReconstructSourceFrontierValidationArtifact;
    if (!Array.isArray(validation.accepted_frontier_ref_ids)) {
      args.violations?.push(violation({
        code: "frontier_kind_mismatch",
        message:
          "source_frontier delta requires a source-frontier validation artifact",
      }));
      return null;
    }
    return {
      roundId: args.frontier.round_id,
      validationStatus: validation.validation_status,
      acceptedRefIds: [...(validation.accepted_frontier_ref_ids ?? [])],
      rowsById: new Map(args.frontier.frontier_refs.map((frontier) => [
        frontier.frontier_ref_id,
        { sourceRef: frontier.source_ref },
      ])),
    };
  }
  if (!hasMaturationClosureSourceRequests(args.frontier)) {
    args.violations?.push(violation({
      code: "frontier_kind_mismatch",
      message:
        "maturation_closure_frontier delta requires a maturation-closure-frontier artifact",
    }));
    return null;
  }
  const validation =
    args.frontierValidation as ReconstructMaturationClosureFrontierValidationArtifact;
  if (!Array.isArray(validation.accepted_source_request_ids)) {
    args.violations?.push(violation({
      code: "frontier_kind_mismatch",
      message:
        "maturation_closure_frontier delta requires a maturation-closure-frontier validation artifact",
    }));
    return null;
  }
  return {
    roundId: args.frontier.round_id,
    validationStatus: validation.validation_status,
    acceptedRefIds: [...(validation.accepted_source_request_ids ?? [])],
    rowsById: new Map(args.frontier.source_requests.map((request) => [
      request.source_request_id,
      { sourceRef: request.requested_source_ref },
    ])),
  };
}

export function buildSourceObservationDeltaArtifact(args: {
  sessionId: string;
  roundId: string;
  frontierKind: ReconstructSourceObservationDeltaFrontierKind;
  frontier: SourceObservationDeltaFrontierArtifact;
  frontierRef: string;
  frontierValidation: SourceObservationDeltaFrontierValidationArtifact;
  frontierValidationRef: string;
  sourceInventoryRef: string;
  previousSourceObservations: ReconstructSourceObservationsArtifact;
  previousSourceObservationsRef: string;
  nextSourceObservations: ReconstructSourceObservationsArtifact;
  sourceObservationsRef: string;
}): ReconstructSourceObservationDeltaArtifact {
  const normalizedFrontier = normalizeFrontierForDelta({
    frontierKind: args.frontierKind,
    frontier: args.frontier,
    frontierValidation: args.frontierValidation,
  });
  if (!normalizedFrontier) {
    throw new Error(
      `frontier artifact does not match source observation delta frontier kind: ${args.frontierKind}`,
    );
  }
  const previousBySourceRef = observationsBySourceRef(
    args.previousSourceObservations,
  );
  const nextBySourceRef = observationsBySourceRef(args.nextSourceObservations);
  const deltaRows = normalizedFrontier.acceptedRefIds.map((
    frontierRefId,
  ) => {
    const frontier = normalizedFrontier.rowsById.get(frontierRefId);
    if (!frontier) {
      throw new Error(`accepted frontier id has no frontier row: ${frontierRefId}`);
    }
    const resolvedSourceRef = path.resolve(frontier.sourceRef);
    const observation = nextBySourceRef.get(resolvedSourceRef);
    if (!observation || previousBySourceRef.has(resolvedSourceRef)) {
      throw new Error(
        `accepted frontier id did not produce a new observation: ${frontierRefId}`,
      );
    }
    if (
      observation.round_id !== args.roundId ||
      !observation.observation_batch_id ||
      observation.triggering_frontier_validation_ref !== args.frontierValidationRef
    ) {
      throw new Error(
        `accepted frontier id produced an observation without matching round/batch lineage: ${frontierRefId}`,
      );
    }
    return {
      delta_row_id: `source-observation-delta:${args.roundId}:${frontierRefId}`,
      frontier_ref_id: frontierRefId,
      source_ref: frontier.sourceRef,
      observation_id: observation.observation_id,
      observation_batch_id: observation.observation_batch_id,
      triggering_frontier_validation_ref: args.frontierValidationRef,
      target_material_kind: observation.target_material_kind,
      observation_hash: sourceObservationHash(observation),
      lineage_status: "added" as const,
      limitation_refs: [],
    };
  });
  return {
    schema_version: "1",
    session_id: args.sessionId,
    round_id: args.roundId,
    created_at: isoNow(),
    frontier_kind: args.frontierKind,
    frontier_ref: args.frontierRef,
    frontier_validation_ref: args.frontierValidationRef,
    source_inventory_ref: args.sourceInventoryRef,
    previous_source_observations_ref: args.previousSourceObservationsRef,
    source_observations_ref: args.sourceObservationsRef,
    accepted_frontier_ref_ids: [
      ...normalizedFrontier.acceptedRefIds,
    ],
    added_observation_ids: deltaRows.map((row) => row.observation_id),
    delta_rows: deltaRows,
  };
}

export function validateSourceObservationDelta(args: {
  delta: ReconstructSourceObservationDeltaArtifact;
  deltaRef?: string | null;
  frontier: SourceObservationDeltaFrontierArtifact;
  frontierValidation: SourceObservationDeltaFrontierValidationArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
}): ReconstructSourceObservationDeltaValidationArtifact {
  assertArrayField(args.sourceObservations.observations, "source-observations", "observations");
  assertArrayField(args.delta.delta_rows, "source-observation-delta", "delta_rows");
  assertArrayField(args.delta.accepted_frontier_ref_ids, "source-observation-delta", "accepted_frontier_ref_ids");
  assertArrayField(args.delta.added_observation_ids, "source-observation-delta", "added_observation_ids");
  const violations: ReconstructSourceObservationDeltaValidationViolation[] = [];
  // G(a) slice 5: record the four delta obligations with a distinct enforcement region, before any
  // per-row loop so they are proven wired on a zero-row delta. validate_delta_frontier_kind_is_supported
  // stays parked (ledger audit note): normalizeFrontierForDelta checks kind-vs-artifact CONSISTENCY,
  // not that the kind value itself is in a supported set, so an unsupported kind can fall through.
  const assertedObligationIds: string[] = [];
  assertObligation(
    assertedObligationIds,
    "validate_delta_observation_refs_exist_in_source_observations",
  );
  assertObligation(
    assertedObligationIds,
    "validate_delta_rows_match_accepted_frontier_refs",
  );
  assertObligation(
    assertedObligationIds,
    "validate_delta_rows_preserve_observation_batch_id_and_triggering_frontier_validation_ref",
  );
  assertObligation(
    assertedObligationIds,
    "validate_delta_source_ref_material_kind_and_observation_hash_match_observed_content",
  );
  if (args.delta.schema_version !== "1") {
    violations.push(violation({
      code: "schema_shape_invalid",
      message: "source observation delta schema_version must be 1",
    }));
  }
  if (args.delta.session_id !== args.sourceObservations.session_id) {
    violations.push(violation({
      code: "session_id_mismatch",
      message: "source observation delta session_id must match source observations",
      subjectId: args.delta.session_id,
    }));
  }
  const normalizedFrontier = normalizeFrontierForDelta({
    frontierKind: args.delta.frontier_kind,
    frontier: args.frontier,
    frontierValidation: args.frontierValidation,
    violations,
  });
  if (normalizedFrontier && args.delta.round_id !== normalizedFrontier.roundId) {
    violations.push(violation({
      code: "round_id_mismatch",
      message: "source observation delta round_id must match frontier artifact",
      subjectId: args.delta.round_id,
    }));
  }
  if (normalizedFrontier && normalizedFrontier.validationStatus !== "valid") {
    violations.push(violation({
      code: "frontier_validation_invalid",
      message: "source observation delta requires valid frontier validation",
      subjectId: args.delta.frontier_validation_ref,
    }));
  }
  for (const duplicate of duplicateIds(args.delta.delta_rows.map((row) =>
    row.delta_row_id
  ))) {
    violations.push(violation({
      code: "duplicate_id",
      message: `duplicate source observation delta row id ${duplicate}`,
      subjectId: duplicate,
    }));
  }
  for (const duplicate of duplicateIds(args.delta.accepted_frontier_ref_ids)) {
    violations.push(violation({
      code: "duplicate_id",
      message: `duplicate accepted source observation frontier ref id ${duplicate}`,
      subjectId: duplicate,
    }));
  }
  for (const duplicate of duplicateIds(args.delta.delta_rows.map((row) =>
    row.frontier_ref_id
  ))) {
    violations.push(violation({
      code: "duplicate_id",
      message: `duplicate source observation delta frontier ref id ${duplicate}`,
      subjectId: duplicate,
    }));
  }
  for (const duplicate of duplicateIds(args.delta.added_observation_ids)) {
    violations.push(violation({
      code: "duplicate_id",
      message: `duplicate source observation delta observation id ${duplicate}`,
      subjectId: duplicate,
    }));
  }
  const acceptedIds = new Set(normalizedFrontier?.acceptedRefIds ?? []);
  const normalizedAcceptedRefIds = sortedUnique(normalizedFrontier?.acceptedRefIds ?? []);
  const declaredAcceptedRefIds = sortedUnique(args.delta.accepted_frontier_ref_ids);
  const missingAcceptedRefIds = setDiff(
    normalizedAcceptedRefIds,
    declaredAcceptedRefIds,
  );
  const extraAcceptedRefIds = setDiff(
    declaredAcceptedRefIds,
    normalizedAcceptedRefIds,
  );
  if (missingAcceptedRefIds.length > 0 || extraAcceptedRefIds.length > 0) {
    violations.push(violation({
      code: "accepted_frontier_ref_set_mismatch",
      message:
        `source observation delta accepted_frontier_ref_ids must exactly match validated frontier accepted ids; missing=${missingAcceptedRefIds.join(",") || "none"} extra=${extraAcceptedRefIds.join(",") || "none"}`,
    }));
  }
  const frontierById = normalizedFrontier?.rowsById ?? new Map();
  const observationsById = new Map(args.sourceObservations.observations.map((
    observation,
  ) => [observation.observation_id, observation]));
  const rowObservationIds = sortedUnique(args.delta.delta_rows.map((row) =>
    row.observation_id
  ));
  const declaredAddedObservationIds = sortedUnique(args.delta.added_observation_ids);
  const missingAddedObservationIds = setDiff(rowObservationIds, declaredAddedObservationIds);
  const extraAddedObservationIds = setDiff(declaredAddedObservationIds, rowObservationIds);
  if (missingAddedObservationIds.length > 0 || extraAddedObservationIds.length > 0) {
    violations.push(violation({
      code: "added_observation_id_set_mismatch",
      message:
        `source observation delta added_observation_ids must exactly match delta row observation ids; missing=${missingAddedObservationIds.join(",") || "none"} extra=${extraAddedObservationIds.join(",") || "none"}`,
    }));
  }
  const deltaByFrontierId = new Map(args.delta.delta_rows.map((row) => [
    row.frontier_ref_id,
    row,
  ]));
  for (const acceptedId of acceptedIds) {
    if (!frontierById.has(acceptedId)) {
      violations.push(violation({
        code: "accepted_frontier_missing",
        message: `accepted frontier id has no source frontier row: ${acceptedId}`,
        subjectId: acceptedId,
      }));
    }
    if (!deltaByFrontierId.has(acceptedId)) {
      violations.push(violation({
        code: "delta_row_missing",
        message: `accepted frontier id has no source observation delta row: ${acceptedId}`,
        subjectId: acceptedId,
      }));
    }
  }
  for (const row of args.delta.delta_rows) {
    if (!acceptedIds.has(row.frontier_ref_id)) {
      violations.push(violation({
        code: "delta_row_unknown_frontier",
        message: `delta row references a frontier id that was not accepted: ${row.frontier_ref_id}`,
        subjectId: row.delta_row_id,
      }));
    }
    const frontier = frontierById.get(row.frontier_ref_id);
    const observation = observationsById.get(row.observation_id);
    if (!observation) {
      violations.push(violation({
        code: "delta_row_unknown_observation",
        message: `delta row references unknown observation id ${row.observation_id}`,
        subjectId: row.delta_row_id,
      }));
      continue;
    }
    if (
      !observation.round_id ||
      !observation.observation_batch_id ||
      !observation.triggering_frontier_validation_ref
    ) {
      violations.push(violation({
        code: "observation_lineage_identity_missing",
        message:
          `delta row observation ${row.observation_id} must carry round, batch, and triggering frontier validation lineage`,
        subjectId: row.delta_row_id,
      }));
    }
    if (
      observation.round_id !== args.delta.round_id ||
      observation.observation_batch_id !== row.observation_batch_id ||
      observation.triggering_frontier_validation_ref !==
        row.triggering_frontier_validation_ref ||
      row.triggering_frontier_validation_ref !== args.delta.frontier_validation_ref
    ) {
      violations.push(violation({
        code: "observation_batch_mismatch",
        message:
          `delta row observation ${row.observation_id} must match round, batch, and frontier validation lineage`,
        subjectId: row.delta_row_id,
      }));
    }
    if (frontier && path.resolve(row.source_ref) !== path.resolve(frontier.sourceRef)) {
      violations.push(violation({
        code: "source_ref_mismatch",
        message: "delta row source_ref must match the accepted frontier source_ref",
        subjectId: row.delta_row_id,
      }));
    }
    if (path.resolve(row.source_ref) !== path.resolve(observation.source_ref)) {
      violations.push(violation({
        code: "source_ref_mismatch",
        message: "delta row source_ref must match the observed source_ref",
        subjectId: row.delta_row_id,
      }));
    }
    if (row.target_material_kind !== observation.target_material_kind) {
      violations.push(violation({
        code: "target_material_kind_mismatch",
        message: "delta row target_material_kind must match the observation",
        subjectId: row.delta_row_id,
      }));
    }
    if (row.observation_hash !== sourceObservationHash(observation)) {
      violations.push(violation({
        code: "observation_hash_mismatch",
        message: "delta row observation_hash must match the observation content",
        subjectId: row.delta_row_id,
      }));
    }
  }
  return {
    schema_version: "1",
    session_id: args.delta.session_id,
    round_id: args.delta.round_id,
    created_at: isoNow(),
    source_observation_delta_ref: args.deltaRef ?? null,
    frontier_ref: args.delta.frontier_ref,
    frontier_validation_ref: args.delta.frontier_validation_ref,
    source_observations_ref: args.delta.source_observations_ref,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    accepted_frontier_ref_count: args.delta.accepted_frontier_ref_ids.length,
    added_observation_count: args.delta.added_observation_ids.length,
    validation_results: violations.length === 0
      ? ["source_observation_delta_valid"]
      : ["source_observation_delta_invalid"],
    asserted_obligation_ids: assertedObligationIds,
    violations,
  };
}

export function validateSourceObservationReentry(args: {
  delta: ReconstructSourceObservationDeltaArtifact;
  deltaValidation: ReconstructSourceObservationDeltaValidationArtifact;
  deltaValidationRef?: string | null;
  sourceObservations: ReconstructSourceObservationsArtifact;
  sourceSafetyLedger: ReconstructSourceSafetyLedgerArtifact;
  sourceSafetyLedgerValidation: ReconstructSourceSafetyLedgerValidationArtifact;
  sourceSafetyLedgerValidationRef?: string | null;
}): ReconstructSourceObservationReentryValidationArtifact {
  assertArrayField(args.sourceObservations.observations, "source-observations", "observations");
  assertArrayField(args.sourceSafetyLedger.safety_rows, "source-safety-ledger", "safety_rows");
  assertArrayField(args.delta.added_observation_ids, "source-observation-delta", "added_observation_ids");
  const violations: ReconstructSourceObservationReentryValidationViolation[] = [];
  // G(a) slice 5: record the four re-entry obligations. R1/R4 are top-level gate checks; R2/R3 are
  // per-observation, so all four are stamped before the loop to be proven wired on a zero-observation
  // delta. Each was audited to a distinct enforcement region (no laundering).
  const assertedObligationIds: string[] = [];
  assertObligation(
    assertedObligationIds,
    "validate_delta_validation_passed_before_prompt_reentry",
  );
  assertObligation(
    assertedObligationIds,
    "validate_each_delta_observation_exists_in_source_observations",
  );
  assertObligation(
    assertedObligationIds,
    "validate_each_delta_observation_has_exact_prompt_context_source_safety_row",
  );
  assertObligation(
    assertedObligationIds,
    "validate_source_safety_validation_passed_before_prompt_reentry",
  );
  if (args.delta.schema_version !== "1") {
    violations.push(reentryViolation({
      code: "schema_shape_invalid",
      message: "source observation delta schema_version must be 1",
    }));
  }
  if (args.deltaValidation.validation_status !== "valid") {
    violations.push(reentryViolation({
      code: "delta_validation_invalid",
      message: "source observation re-entry requires valid source observation delta validation",
      subjectId: args.deltaValidationRef ?? null,
    }));
  }
  if (args.sourceSafetyLedgerValidation.validation_status !== "valid") {
    violations.push(reentryViolation({
      code: "source_safety_validation_invalid",
      message: "source observation re-entry requires valid source safety validation",
      subjectId: args.sourceSafetyLedgerValidationRef ?? null,
    }));
  }
  const observationsById = new Map(args.sourceObservations.observations.map((
    observation,
  ) => [observation.observation_id, observation]));
  const safetyByRowId = new Map(args.sourceSafetyLedger.safety_rows.map((
    row,
  ) => [row.safety_row_id, row]));
  for (const observationId of args.delta.added_observation_ids) {
    const observation = observationsById.get(observationId);
    if (!observation) {
      violations.push(reentryViolation({
        code: "delta_observation_missing_from_source_observations",
        message: `delta observation ${observationId} is missing from source observations`,
        subjectId: observationId,
      }));
      continue;
    }
    const expectedSafetyRowId = sourceSafetyRowIdForObservation(observation);
    const safetyRow = safetyByRowId.get(expectedSafetyRowId);
    if (!safetyRow) {
      violations.push(reentryViolation({
        code: "delta_observation_missing_safety_row",
        message:
          `delta observation ${observationId} has no observation-specific source safety row ${expectedSafetyRowId}`,
        subjectId: observationId,
      }));
      continue;
    }
    if (
      safetyRow.subject_kind !== "source_ref" ||
      path.resolve(safetyRow.subject_ref) !== path.resolve(observation.source_ref)
    ) {
      violations.push(reentryViolation({
        code: "delta_observation_missing_safety_row",
        message:
          `delta observation ${observationId} source safety row ${expectedSafetyRowId} does not bind to the observed source_ref`,
        subjectId: observationId,
      }));
      continue;
    }
    if (
      safetyRow.visibility_tier === "no_prompt_use" ||
      safetyRow.visibility_tier === "no_replay_use"
    ) {
      violations.push(reentryViolation({
        code: "delta_observation_not_prompt_visible",
        message: `delta observation ${observationId} is not eligible for prompt re-entry`,
        subjectId: observationId,
      }));
    }
  }
  return {
    schema_version: "1",
    session_id: args.delta.session_id,
    round_id: args.delta.round_id,
    created_at: isoNow(),
    source_observation_delta_validation_ref: args.deltaValidationRef ?? null,
    source_safety_ledger_validation_ref:
      args.sourceSafetyLedgerValidationRef ?? null,
    source_observations_ref: args.delta.source_observations_ref,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    reentered_observation_ids: violations.length === 0
      ? [...args.delta.added_observation_ids]
      : [],
    validation_results: violations.length === 0
      ? ["source_observation_reentry_valid"]
      : ["source_observation_reentry_invalid"],
    asserted_obligation_ids: assertedObligationIds,
    violations,
  };
}

export async function validateSourceObservationLineageIndex(args: {
  sessionId: string;
  lineageIndex: ReconstructSourceObservationLineageIndexArtifact;
  lineageIndexRef?: string | null;
  sourceObservations: ReconstructSourceObservationsArtifact;
  sourceObservationsRef?: string | null;
}): Promise<ReconstructSourceObservationLineageIndexValidationArtifact> {
  assertArrayField(args.sourceObservations.observations, "source-observations", "observations");
  assertArrayField(args.lineageIndex.lineage_rows, "source-observation-lineage-index", "lineage_rows");
  const violations: ReconstructSourceObservationLineageIndexValidationViolation[] = [];
  const seen = new Set<string>();
  const observationsById = new Map(args.sourceObservations.observations.map((
    observation,
  ) => [observation.observation_id, observation]));
  const addedObservationIds = new Set<string>();
  // G(a) slice 6: record the seven lineage-index obligations before the per-row loop so they are
  // proven wired on a zero-row index. Each was audited to a distinct enforcement region (no
  // laundering). asserted_obligation_ids is excluded from the reuse-match identity hash (see
  // stripVolatileArtifactFields in run.ts), so adding it to this reuse-hashed artifact is hash-neutral.
  const assertedObligationIds: string[] = [];
  assertObligation(
    assertedObligationIds,
    "require_each_lineage_row_delta_validation_to_be_valid",
  );
  assertObligation(
    assertedObligationIds,
    "require_each_lineage_row_reentry_validation_to_be_valid",
  );
  assertObligation(
    assertedObligationIds,
    "validate_each_lineage_added_observation_exists_in_source_observations",
  );
  assertObligation(
    assertedObligationIds,
    "validate_each_lineage_added_observation_was_reentered_by_its_validation",
  );
  assertObligation(
    assertedObligationIds,
    "validate_each_lineage_row_delta_ref_is_readable_and_session_matching",
  );
  assertObligation(
    assertedObligationIds,
    "validate_lineage_added_observation_ids_match_delta_added_observation_ids",
  );
  assertObligation(
    assertedObligationIds,
    "validate_unique_session_level_lineage_row_ids",
  );
  if (args.lineageIndex.schema_version !== "1") {
    violations.push(lineageIndexViolation({
      code: "schema_shape_invalid",
      message: "source observation lineage index schema_version must be 1",
    }));
  }
  if (args.lineageIndex.session_id !== args.sessionId) {
    violations.push(lineageIndexViolation({
      code: "session_id_mismatch",
      message: "source observation lineage index session_id must match session",
      subjectId: args.lineageIndex.session_id,
    }));
  }
  for (const row of args.lineageIndex.lineage_rows) {
    if (seen.has(row.lineage_row_id)) {
      violations.push(lineageIndexViolation({
        code: "duplicate_id",
        message: `duplicate lineage_row_id ${row.lineage_row_id}`,
        subjectId: row.lineage_row_id,
      }));
    }
    seen.add(row.lineage_row_id);
    let delta: ReconstructSourceObservationDeltaArtifact | null = null;
    try {
      delta = await readYamlDocument<ReconstructSourceObservationDeltaArtifact>(
        row.source_observation_delta_ref,
      );
    } catch {
      violations.push(lineageIndexViolation({
        code: "lineage_delta_missing",
        message: "lineage row must reference a readable source-observation delta",
        subjectId: row.lineage_row_id,
      }));
    }
    let deltaValidation: ReconstructSourceObservationDeltaValidationArtifact | null = null;
    try {
      deltaValidation =
        await readYamlDocument<ReconstructSourceObservationDeltaValidationArtifact>(
          row.source_observation_delta_validation_ref,
        );
    } catch {
      violations.push(lineageIndexViolation({
        code: "lineage_delta_validation_missing",
        message: "lineage row must reference a readable delta validation",
        subjectId: row.lineage_row_id,
      }));
    }
    let reentryValidation: ReconstructSourceObservationReentryValidationArtifact | null = null;
    try {
      reentryValidation =
        await readYamlDocument<ReconstructSourceObservationReentryValidationArtifact>(
          row.source_observation_reentry_validation_ref,
        );
    } catch {
      violations.push(lineageIndexViolation({
        code: "lineage_reentry_validation_missing",
        message: "lineage row must reference a readable re-entry validation",
        subjectId: row.lineage_row_id,
      }));
    }
    if (delta && delta.session_id !== args.sessionId) {
      violations.push(lineageIndexViolation({
        code: "session_id_mismatch",
        message: "lineage row delta session_id must match session",
        subjectId: row.source_observation_delta_ref,
      }));
    }
    if (delta && delta.round_id !== row.round_id) {
      violations.push(lineageIndexViolation({
        code: "round_id_mismatch",
        message: "lineage row round_id must match delta round_id",
        subjectId: row.lineage_row_id,
      }));
    }
    if (delta && delta.frontier_kind !== row.frontier_kind) {
      violations.push(lineageIndexViolation({
        code: "frontier_kind_mismatch",
        message: "lineage row frontier_kind must match delta frontier_kind",
        subjectId: row.lineage_row_id,
      }));
    }
    if (deltaValidation && deltaValidation.validation_status !== "valid") {
      violations.push(lineageIndexViolation({
        code: "lineage_delta_validation_invalid",
        message: "lineage row delta validation must be valid",
        subjectId: row.source_observation_delta_validation_ref,
      }));
    }
    if (deltaValidation) {
      if (deltaValidation.session_id !== args.sessionId) {
        violations.push(lineageIndexViolation({
          code: "session_id_mismatch",
          message: "lineage row delta validation session_id must match session",
          subjectId: row.source_observation_delta_validation_ref,
        }));
      }
      if (deltaValidation.round_id !== row.round_id) {
        violations.push(lineageIndexViolation({
          code: "round_id_mismatch",
          message: "lineage row delta validation round_id must match lineage row",
          subjectId: row.source_observation_delta_validation_ref,
        }));
      }
      if (!samePathRef(
        deltaValidation.source_observation_delta_ref,
        row.source_observation_delta_ref,
      )) {
        violations.push(lineageIndexViolation({
          code: "lineage_validation_ref_mismatch",
          message:
            "lineage row delta validation must validate the same source-observation delta ref",
          subjectId: row.lineage_row_id,
        }));
      }
      if (
        delta &&
        (
          deltaValidation.frontier_validation_ref !== delta.frontier_validation_ref ||
          deltaValidation.source_observations_ref !== delta.source_observations_ref
        )
      ) {
        violations.push(lineageIndexViolation({
          code: "lineage_validation_ref_mismatch",
          message:
            "lineage row delta validation must preserve the delta frontier and source-observations refs",
          subjectId: row.lineage_row_id,
        }));
      }
    }
    if (reentryValidation && reentryValidation.validation_status !== "valid") {
      violations.push(lineageIndexViolation({
        code: "lineage_reentry_validation_invalid",
        message: "lineage row re-entry validation must be valid",
        subjectId: row.source_observation_reentry_validation_ref,
      }));
    }
    if (reentryValidation) {
      if (reentryValidation.session_id !== args.sessionId) {
        violations.push(lineageIndexViolation({
          code: "session_id_mismatch",
          message: "lineage row re-entry validation session_id must match session",
          subjectId: row.source_observation_reentry_validation_ref,
        }));
      }
      if (reentryValidation.round_id !== row.round_id) {
        violations.push(lineageIndexViolation({
          code: "round_id_mismatch",
          message: "lineage row re-entry validation round_id must match lineage row",
          subjectId: row.source_observation_reentry_validation_ref,
        }));
      }
      if (!samePathRef(
        reentryValidation.source_observation_delta_validation_ref,
        row.source_observation_delta_validation_ref,
      )) {
        violations.push(lineageIndexViolation({
          code: "lineage_validation_ref_mismatch",
          message:
            "lineage row re-entry validation must consume the same delta validation ref",
          subjectId: row.lineage_row_id,
        }));
      }
      if (
        delta &&
        reentryValidation.source_observations_ref !== delta.source_observations_ref
      ) {
        violations.push(lineageIndexViolation({
          code: "lineage_validation_ref_mismatch",
          message:
            "lineage row re-entry validation must preserve the delta source-observations ref",
          subjectId: row.lineage_row_id,
        }));
      }
    }
    if (delta) {
      const expected = sortedUnique(delta.added_observation_ids);
      const actual = sortedUnique(row.added_observation_ids);
      if (expected.join("\n") !== actual.join("\n")) {
        violations.push(lineageIndexViolation({
          code: "lineage_added_observation_mismatch",
          message: "lineage row added_observation_ids must match delta added_observation_ids",
          subjectId: row.lineage_row_id,
        }));
      }
    }
    const reentered = new Set(reentryValidation?.reentered_observation_ids ?? []);
    for (const observationId of row.added_observation_ids) {
      if (addedObservationIds.has(observationId)) {
        violations.push(lineageIndexViolation({
          code: "duplicate_id",
          message:
            "source observation lineage index must not assign one observation to multiple lineage rows",
          subjectId: observationId,
        }));
      }
      addedObservationIds.add(observationId);
      if (!observationsById.has(observationId)) {
        violations.push(lineageIndexViolation({
          code: "lineage_observation_missing",
          message: "lineage row added observation must exist in source observations",
          subjectId: observationId,
        }));
      }
      if (reentryValidation && !reentered.has(observationId)) {
        violations.push(lineageIndexViolation({
          code: "lineage_added_observation_mismatch",
          message: "lineage row added observation must be re-entered by its validation",
          subjectId: observationId,
        }));
      }
    }
  }
  return {
    schema_version: "1",
    session_id: args.sessionId,
    created_at: isoNow(),
    source_observation_lineage_index_ref: args.lineageIndexRef ?? null,
    source_observations_ref: args.sourceObservationsRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    lineage_row_count: args.lineageIndex.lineage_rows.length,
    added_observation_count: addedObservationIds.size,
    validation_results: violations.length === 0
      ? ["source_observation_lineage_index_valid"]
      : ["source_observation_lineage_index_invalid"],
    asserted_obligation_ids: assertedObligationIds,
    violations,
  };
}

export async function writeSourceObservationDeltaArtifact(args: {
  sessionId: string;
  roundId: string;
  frontierKind: ReconstructSourceObservationDeltaFrontierKind;
  frontierPath: string;
  frontierValidationPath: string;
  sourceInventoryPath: string;
  previousSourceObservations: ReconstructSourceObservationsArtifact;
  previousSourceObservationsRef: string;
  sourceObservationsPath: string;
  outputPath: string;
}): Promise<ReconstructSourceObservationDeltaArtifact> {
  const [frontier, frontierValidation, nextSourceObservations] =
    await Promise.all([
      readYamlDocument<SourceObservationDeltaFrontierArtifact>(args.frontierPath),
      readYamlDocument<SourceObservationDeltaFrontierValidationArtifact>(
        args.frontierValidationPath,
      ),
      readYamlDocument<ReconstructSourceObservationsArtifact>(
        args.sourceObservationsPath,
      ),
    ]);
  const artifact = buildSourceObservationDeltaArtifact({
    sessionId: args.sessionId,
    roundId: args.roundId,
    frontierKind: args.frontierKind,
    frontier,
    frontierRef: args.frontierPath,
    frontierValidation,
    frontierValidationRef: args.frontierValidationPath,
    sourceInventoryRef: args.sourceInventoryPath,
    previousSourceObservations: args.previousSourceObservations,
    previousSourceObservationsRef: args.previousSourceObservationsRef,
    nextSourceObservations,
    sourceObservationsRef: args.sourceObservationsPath,
  });
  await writeYamlDocument(args.outputPath, artifact);
  return artifact;
}

export async function writeSourceObservationDeltaValidationArtifact(args: {
  deltaPath: string;
  frontierPath: string;
  frontierValidationPath: string;
  sourceObservationsPath: string;
  outputPath: string;
}): Promise<ReconstructSourceObservationDeltaValidationArtifact> {
  const [delta, frontier, frontierValidation, sourceObservations] =
    await Promise.all([
      readYamlDocument<ReconstructSourceObservationDeltaArtifact>(
        args.deltaPath,
      ),
      readYamlDocument<SourceObservationDeltaFrontierArtifact>(args.frontierPath),
      readYamlDocument<SourceObservationDeltaFrontierValidationArtifact>(
        args.frontierValidationPath,
      ),
      readYamlDocument<ReconstructSourceObservationsArtifact>(
        args.sourceObservationsPath,
      ),
    ]);
  const validation = validateSourceObservationDelta({
    delta,
    deltaRef: args.deltaPath,
    frontier,
    frontierValidation,
    sourceObservations,
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}

export async function writeSourceObservationReentryValidationArtifact(args: {
  deltaPath: string;
  deltaValidationPath: string;
  sourceObservationsPath: string;
  sourceSafetyLedgerPath: string;
  sourceSafetyLedgerValidationPath: string;
  outputPath: string;
}): Promise<ReconstructSourceObservationReentryValidationArtifact> {
  const [
    delta,
    deltaValidation,
    sourceObservations,
    sourceSafetyLedger,
    sourceSafetyLedgerValidation,
  ] = await Promise.all([
    readYamlDocument<ReconstructSourceObservationDeltaArtifact>(args.deltaPath),
    readYamlDocument<ReconstructSourceObservationDeltaValidationArtifact>(
      args.deltaValidationPath,
    ),
    readYamlDocument<ReconstructSourceObservationsArtifact>(
      args.sourceObservationsPath,
    ),
    readYamlDocument<ReconstructSourceSafetyLedgerArtifact>(
      args.sourceSafetyLedgerPath,
    ),
    readYamlDocument<ReconstructSourceSafetyLedgerValidationArtifact>(
      args.sourceSafetyLedgerValidationPath,
    ),
  ]);
  const validation = validateSourceObservationReentry({
    delta,
    deltaValidation,
    deltaValidationRef: args.deltaValidationPath,
    sourceObservations,
    sourceSafetyLedger,
    sourceSafetyLedgerValidation,
    sourceSafetyLedgerValidationRef: args.sourceSafetyLedgerValidationPath,
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}

export async function writeSourceObservationLineageIndexValidationArtifact(args: {
  sessionId: string;
  lineageIndexPath: string;
  sourceObservationsPath: string;
  outputPath: string;
}): Promise<ReconstructSourceObservationLineageIndexValidationArtifact> {
  const [lineageIndex, sourceObservations] = await Promise.all([
    readYamlDocument<ReconstructSourceObservationLineageIndexArtifact>(
      args.lineageIndexPath,
    ),
    readYamlDocument<ReconstructSourceObservationsArtifact>(
      args.sourceObservationsPath,
    ),
  ]);
  const validation = await validateSourceObservationLineageIndex({
    sessionId: args.sessionId,
    lineageIndex,
    lineageIndexRef: args.lineageIndexPath,
    sourceObservations,
    sourceObservationsRef: args.sourceObservationsPath,
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}
