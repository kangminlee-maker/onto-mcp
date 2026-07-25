import fs from "node:fs/promises";
import path from "node:path";
import { atomicWriteYamlDocument as writeYamlDocument } from "../artifact-io.js";
import {
  dispatchIncompleteArtifactPath,
  isDispatchIncompleteArtifact,
} from "../llm/dispatch-breaker.js";
import type {
  DispatchBreakerPolicy,
  DispatchDeadLetterEntry,
  DispatchIncompleteArtifact,
} from "../llm/dispatch-breaker.js";
import type { WorkbookStructuralInventory } from "../spreadsheet-structure-observer.js";
import type {
  ReconstructPostSeedValidationViolation,
  ReconstructSemanticMapCensus,
  ReconstructSemanticMapCensusObservation,
  ReconstructSemanticMapResumeValidationArtifact,
  ReconstructSemanticMapSidecar,
  ReconstructSemanticMapSidecarObservation,
  ReconstructSourceObservationsArtifact,
} from "./artifact-types.js";
import { isGracefulTerminalSignal } from "./graceful-terminal.js";
import { readReconstructLlmDispatchFailureError } from "./llm-dispatch-failure.js";
import { isoNow } from "./run-primitives.js";
import {
  renderSemanticMapProjection,
  semanticMapRenderCharBudget,
} from "./semantic-map-authoring.js";
import type {
  SemanticMapAnyProjection,
  SemanticMapArtifactKind,
} from "./semantic-map-projection.js";
import {
  semanticMapCodeObservationFingerprint,
  semanticMapCodeSourceExcerptGuardFailure,
  semanticMapCodeStructural,
  semanticMapEligibleObservations,
  semanticMapObservationFingerprint,
} from "./semantic-map-stage.js";
import type {
  SemanticMapObservation,
  SemanticMapPreImageBase,
  SemanticMapRecoveryContext,
  SemanticMapStageConfig,
} from "./semantic-map-stage.js";
import { parse as parseYaml } from "yaml";

export async function readYamlDocument<T>(filePath: string): Promise<T> {
  return parseYaml(await fs.readFile(filePath, "utf8")) as T;
}

export function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

export async function readYamlDocumentIfPresent<T>(filePath: string): Promise<T | null> {
  try {
    return await readYamlDocument<T>(filePath);
  } catch (error) {
    if (isGracefulTerminalSignal(error)) throw error;
    if (readReconstructLlmDispatchFailureError(error)) throw error;
    if (isMissingFile(error)) return null;
    throw error;
  }
}

export async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (isGracefulTerminalSignal(error)) throw error;
    if (readReconstructLlmDispatchFailureError(error)) throw error;
    if (isMissingFile(error)) return false;
    throw error;
  }
}

export function semanticMapCensusPath(sessionRoot: string): string {
  return path.join(sessionRoot, "comprehension", "semantic-map-census.yaml");
}

export function semanticMapSidecarPath(sessionRoot: string): string {
  return path.join(sessionRoot, "comprehension", "semantic-map.yaml");
}

export function semanticMapResumeValidationPath(sessionRoot: string): string {
  return path.join(sessionRoot, "semantic-map-resume-validation.yaml");
}

function semanticMapSkipReasonForCurrentObservation(
  observation: SemanticMapObservation,
): "no_workbook_inventory" | "no_value_tiles" | "no_code_inventory" | "code_extraction_unsupported" | "code_source_excerpt_unavailable" | "code_layout_tier_not_applicable" | null {
  if (observation.target_material_kind === "code") {
    const { inventory, unsupportedReason } = semanticMapCodeStructural(observation);
    if (unsupportedReason !== undefined) return "code_extraction_unsupported";
    if (!inventory) return "no_code_inventory";
    // Grammar-free ROUGH layout evidence is explicitly not sliced into the LLM map stage (§6-2). The
    // check sits AFTER inventory-presence and BEFORE the excerpt guard so the live and resume paths
    // agree on the reason even for a >6K non-whole-capture layout file (else source_ref_mismatch).
    if (inventory.extraction_tier === "layout") return "code_layout_tier_not_applicable";
    return semanticMapCodeSourceExcerptGuardFailure(observation, inventory) === null
      ? null
      : "code_source_excerpt_unavailable";
  }
  const inventory = observation.structural_data.workbook_inventory as
    | WorkbookStructuralInventory
    | undefined;
  if (!inventory) return "no_workbook_inventory";
  const tileSheets = inventory.segmented_value_tiles;
  return !tileSheets || tileSheets.length === 0 ? "no_value_tiles" : null;
}

function resumeValidationViolation(args: {
  code: ReconstructPostSeedValidationViolation["code"];
  message: string;
  subjectId?: string | null;
}): ReconstructPostSeedValidationViolation {
  return {
    code: args.code,
    message: args.message,
    subject_id: args.subjectId ?? null,
  };
}

function duplicateIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates].sort();
}

function isSemanticMapCensus(value: unknown): value is ReconstructSemanticMapCensus {
  const candidate = value as ReconstructSemanticMapCensus | null;
  return Boolean(
    candidate &&
      typeof candidate === "object" &&
      candidate.schema_version === "1" &&
      Array.isArray(candidate.by_observation),
  );
}

function isSemanticMapSidecar(value: unknown): value is ReconstructSemanticMapSidecar {
  const candidate = value as ReconstructSemanticMapSidecar | null;
  return Boolean(
    candidate &&
      typeof candidate === "object" &&
      candidate.schema_version === "1" &&
      Array.isArray(candidate.observations),
  );
}

function projectionIsRenderable(
  projection: SemanticMapAnyProjection,
  noteKind: SemanticMapArtifactKind,
  labelRoot: string | null,
): boolean {
  try {
    // Per-kind budget (DD10) — the resume check must judge renderability against the SAME budget
    // the live prompt surfaces will use, else a code projection sized for 12,000 would fail the
    // 4,000 check and silently doom valid resumes (or vice versa).
    renderSemanticMapProjection(
      projection,
      semanticMapRenderCharBudget(noteKind),
      true,
      noteKind,
      labelRoot,
    );
    return true;
  } catch (error) {
    if (isGracefulTerminalSignal(error)) throw error;
    if (readReconstructLlmDispatchFailureError(error)) throw error;
    return false;
  }
}

function buildSemanticMapResumeValidationArtifact(args: {
  sessionId: string;
  resumeMode: "fresh" | "reuse_existing_authored_artifacts";
  dispatchBreakerEnabled: boolean;
  semanticMapCapabilityPresent: boolean;
  currentObservationIds: string[];
  observationsById: Map<string, SemanticMapObservation>;
  dispatchIncompleteRef: string | null;
  dispatchIncomplete: DispatchIncompleteArtifact | null;
  semanticMapCensusRef: string | null;
  semanticMapCensus: ReconstructSemanticMapCensus | null;
  semanticMapSidecarRef: string | null;
  semanticMapSidecar: ReconstructSemanticMapSidecar | null;
  preImageBase: SemanticMapPreImageBase;
  /** Step 6 (DD6): the CODE ⓑ' base (code prompt-contract sha) — required to re-derive a retained
   *  code row's fingerprint. Absent ⇔ code kind ineligible for this run. */
  codePreImageBase?: SemanticMapPreImageBase;
  verifyModelIdentity: string;
  config: SemanticMapStageConfig;
  /** DD10 (리뷰 inv MN2): render-label root for the renderability re-check — the SAME root the
   *  live prompt surfaces use, so resume validation judges the projection the seed will see. */
  labelRoot: string | null;
  backupRefs?: Partial<ReconstructSemanticMapResumeValidationArtifact["backup_refs"]>;
}): {
  artifact: ReconstructSemanticMapResumeValidationArtifact;
  retainedRowsByObservationId: Map<string, ReconstructSemanticMapCensusObservation>;
  retainedSidecarByObservationId: Map<string, ReconstructSemanticMapSidecarObservation>;
  retainedCompletedItemIds: string[];
  retainedDeadLetter: DispatchDeadLetterEntry[];
  incompleteItemIds: string[];
} {
  const violations: ReconstructPostSeedValidationViolation[] = [];
  const dispatch = args.dispatchIncomplete;
  const currentSet = new Set(args.currentObservationIds);
  const completed = dispatch?.completed_item_ids ?? [];
  const deadLetter = dispatch?.dead_letter ?? [];
  const deadLetterIds = deadLetter.map((entry) => entry.item_id);
  const incomplete = dispatch?.incomplete_item_ids ?? [];
  const planned = [...completed, ...deadLetterIds, ...incomplete];
  const plannedSet = new Set(planned);
  const duplicateItemIds = duplicateIds(planned);
  const unknownItemIds = planned
    .filter((itemId) => !currentSet.has(itemId))
    .filter((itemId, index, arr) => arr.indexOf(itemId) === index)
    .sort();
  const completedSet = new Set(completed);
  const deadLetterSet = new Set(deadLetterIds);
  const incompleteSet = new Set(incomplete);
  const overlappingItemIds = args.currentObservationIds.filter((itemId) =>
    Number(completedSet.has(itemId)) +
      Number(deadLetterSet.has(itemId)) +
      Number(incompleteSet.has(itemId)) > 1
  );
  const exactCurrentSetMatch =
    plannedSet.size === currentSet.size &&
    args.currentObservationIds.every((itemId) => plannedSet.has(itemId));

  if (!dispatch) {
    violations.push(resumeValidationViolation({
      code: "missing_required_ref",
      message: "semantic-map resume validation requires dispatch-incomplete.yaml when it is evaluated",
      subjectId: "dispatch-incomplete.yaml",
    }));
  } else {
    if (dispatch.pipeline !== "reconstruct" || dispatch.batch_label !== "semantic-map") {
      violations.push(resumeValidationViolation({
        code: "source_ref_mismatch",
        message:
          `dispatch-incomplete.yaml belongs to ${dispatch.pipeline}/${dispatch.batch_label}, not reconstruct/semantic-map`,
        subjectId: "dispatch-incomplete.yaml",
      }));
    }
    if (duplicateItemIds.length > 0) {
      violations.push(resumeValidationViolation({
        code: "duplicate_id",
        message: `dispatch partition repeats item ids: ${duplicateItemIds.join(",")}`,
        subjectId: "dispatch-incomplete.yaml",
      }));
    }
    if (unknownItemIds.length > 0) {
      violations.push(resumeValidationViolation({
        code: "unknown_id",
        message: `dispatch partition contains ids outside current eligible observations: ${unknownItemIds.join(",")}`,
        subjectId: "dispatch-incomplete.yaml",
      }));
    }
    if (overlappingItemIds.length > 0) {
      violations.push(resumeValidationViolation({
        code: "conflicting_state",
        message: `dispatch partition overlaps completed/dead-letter/incomplete sets: ${overlappingItemIds.join(",")}`,
        subjectId: "dispatch-incomplete.yaml",
      }));
    }
    if (!exactCurrentSetMatch) {
      violations.push(resumeValidationViolation({
        code: "source_ref_mismatch",
        message:
          "dispatch partition must exactly match the current sorted eligible observation id set",
        subjectId: "dispatch-incomplete.yaml",
      }));
    }
    if (!dispatch.breaker.tripped && incomplete.length > 0) {
      violations.push(resumeValidationViolation({
        code: "conflicting_state",
        message:
          "non-tripped semantic-map dispatch artifacts must not carry incomplete_item_ids",
        subjectId: "dispatch-incomplete.yaml",
      }));
    }
    if (
      dispatch.breaker.tripped &&
      (args.resumeMode !== "reuse_existing_authored_artifacts" ||
        !args.dispatchBreakerEnabled)
    ) {
      violations.push(resumeValidationViolation({
        code: "conflicting_state",
        message:
          "tripped semantic-map recovery requires resumeMode=reuse_existing_authored_artifacts and dispatch_breaker.enabled=true",
        subjectId: "dispatch-incomplete.yaml",
      }));
    }
    if (dispatch.breaker.tripped && !args.semanticMapCapabilityPresent) {
      violations.push(resumeValidationViolation({
        code: "conflicting_state",
        message:
          "tripped semantic-map recovery requires the synthesizeSemanticMapNode/verifySemanticMapBoundary capability pair",
        subjectId: "dispatch-incomplete.yaml",
      }));
    }
  }

  const recoveryAttempted = Boolean(
    dispatch?.breaker.tripped &&
      args.resumeMode === "reuse_existing_authored_artifacts" &&
      args.dispatchBreakerEnabled &&
      args.semanticMapCapabilityPresent,
  );
  const retainedItemIds = recoveryAttempted
    ? [...completed, ...deadLetterIds]
      .filter((itemId) => currentSet.has(itemId))
      .filter((itemId, index, arr) => arr.indexOf(itemId) === index)
      .sort((a, b) => args.currentObservationIds.indexOf(a) - args.currentObservationIds.indexOf(b))
    : [];
  const retainedSet = new Set(retainedItemIds);
  const discardedItemIds = recoveryAttempted
    ? incomplete
      .filter((itemId) => currentSet.has(itemId))
      .filter((itemId, index, arr) => arr.indexOf(itemId) === index)
      .sort((a, b) => args.currentObservationIds.indexOf(a) - args.currentObservationIds.indexOf(b))
    : [];
  const discardedSet = new Set(discardedItemIds);

  const censusRows = args.semanticMapCensus?.by_observation ?? [];
  const censusRowsById = new Map<string, ReconstructSemanticMapCensusObservation>();
  for (const row of censusRows) {
    if (censusRowsById.has(row.observation_id)) {
      violations.push(resumeValidationViolation({
        code: "duplicate_id",
        message: `prior semantic-map census repeats observation_id ${row.observation_id}`,
        subjectId: row.observation_id,
      }));
    }
    censusRowsById.set(row.observation_id, row);
  }
  const incompleteCensusIds = censusRows
    .map((row) => row.observation_id)
    .filter((id) => discardedSet.has(id))
    .sort();
  const unknownCensusIds = censusRows
    .map((row) => row.observation_id)
    .filter((id) => !currentSet.has(id))
    .filter((id, index, arr) => arr.indexOf(id) === index)
    .sort();
  const extraCensusIds = recoveryAttempted
    ? censusRows
      .map((row) => row.observation_id)
      .filter((id) =>
        currentSet.has(id) && !retainedSet.has(id) && !discardedSet.has(id)
      )
      .filter((id, index, arr) => arr.indexOf(id) === index)
      .sort()
    : [];
  const missingRetainedIds = retainedItemIds.filter((id) => !censusRowsById.has(id));
  const nonReusableRetainedIds: string[] = [];
  const fingerprintMismatchIds: string[] = [];
  const retainedRowsByObservationId = new Map<string, ReconstructSemanticMapCensusObservation>();

  if (recoveryAttempted && (!args.semanticMapCensus || !args.semanticMapSidecar)) {
    violations.push(resumeValidationViolation({
      code: "missing_required_ref",
      message:
        "semantic-map recovery requires prior semantic-map-census.yaml and semantic-map.yaml",
      subjectId: "semantic-map artifacts",
    }));
  }

  for (const id of retainedItemIds) {
    const row = censusRowsById.get(id);
    const observation = args.observationsById.get(id);
    if (!row || !observation) continue;
    if (row.skip_reason === "deterministic_phase_failed") {
      nonReusableRetainedIds.push(id);
      continue;
    }
    if (row.fingerprint === null) {
      const currentSkipReason = semanticMapSkipReasonForCurrentObservation(observation);
      if (
        row.skip_reason !== "no_workbook_inventory" &&
        row.skip_reason !== "no_value_tiles" &&
        row.skip_reason !== "no_code_inventory" &&
        row.skip_reason !== "code_extraction_unsupported" &&
        row.skip_reason !== "code_source_excerpt_unavailable" &&
        row.skip_reason !== "code_layout_tier_not_applicable"
      ) {
        nonReusableRetainedIds.push(id);
        continue;
      }
      if (row.skip_reason !== currentSkipReason) {
        fingerprintMismatchIds.push(id);
        continue;
      }
      retainedRowsByObservationId.set(id, row);
      continue;
    }
    // Step 6 (DD7): re-derive the retained fingerprint per KIND — a code row without the code
    // preImageBase (code no longer eligible) can never match and correctly falls to mismatch.
    let currentFingerprint: string | null = null;
    if (observation.target_material_kind === "code") {
      const { inventory: codeInventory } = semanticMapCodeStructural(observation);
      if (codeInventory && args.codePreImageBase) {
        currentFingerprint = semanticMapCodeObservationFingerprint({
          observation,
          inventory: codeInventory,
          preImageBase: args.codePreImageBase,
          verifyModelIdentity: args.verifyModelIdentity,
          config: args.config,
        });
      }
    } else {
      const inventory = observation.structural_data.workbook_inventory as
        | WorkbookStructuralInventory
        | undefined;
      if (inventory) {
        currentFingerprint = semanticMapObservationFingerprint({
          observation,
          inventory,
          preImageBase: args.preImageBase,
          verifyModelIdentity: args.verifyModelIdentity,
          config: args.config,
        });
      }
    }
    if (currentFingerprint === null || row.fingerprint !== currentFingerprint) {
      fingerprintMismatchIds.push(id);
      continue;
    }
    retainedRowsByObservationId.set(id, row);
  }

  if (missingRetainedIds.length > 0) {
    violations.push(resumeValidationViolation({
      code: "missing_required_ref",
      message: `prior semantic-map census is missing retained ids: ${missingRetainedIds.join(",")}`,
      subjectId: "semantic-map-census.yaml",
    }));
  }
  if (nonReusableRetainedIds.length > 0) {
    violations.push(resumeValidationViolation({
      code: "conflicting_state",
      message: `prior semantic-map census contains non-reusable retained ids: ${nonReusableRetainedIds.join(",")}`,
      subjectId: "semantic-map-census.yaml",
    }));
  }
  if (fingerprintMismatchIds.length > 0) {
    violations.push(resumeValidationViolation({
      code: "source_ref_mismatch",
      message: `prior semantic-map census retained fingerprints/skip reasons do not match current observations: ${fingerprintMismatchIds.join(",")}`,
      subjectId: "semantic-map-census.yaml",
    }));
  }
  if (unknownCensusIds.length > 0) {
    violations.push(resumeValidationViolation({
      code: "unknown_id",
      message: `prior semantic-map census contains ids outside current eligible observations: ${unknownCensusIds.join(",")}`,
      subjectId: "semantic-map-census.yaml",
    }));
  }
  if (extraCensusIds.length > 0) {
    violations.push(resumeValidationViolation({
      code: "conflicting_state",
      message: `prior semantic-map census contains rows outside the dispatch partition: ${extraCensusIds.join(",")}`,
      subjectId: "semantic-map-census.yaml",
    }));
  }

  const sidecarRows = args.semanticMapSidecar?.observations ?? [];
  const sidecarRowsById = new Map<string, ReconstructSemanticMapSidecarObservation>();
  let projectionRenderable = true;
  let nodeEpochsShapeValid = true;
  for (const row of sidecarRows) {
    if (sidecarRowsById.has(row.observation_id)) {
      violations.push(resumeValidationViolation({
        code: "duplicate_id",
        message: `prior semantic-map sidecar repeats observation_id ${row.observation_id}`,
        subjectId: row.observation_id,
      }));
    }
    sidecarRowsById.set(row.observation_id, row);
    if (!projectionIsRenderable(row.projection, row.target_material_kind === "code" ? "code" : "spreadsheet", args.labelRoot)) {
      projectionRenderable = false;
    }
    if (
      !Array.isArray(row.node_epochs) ||
      row.node_epochs.some((entry) =>
        typeof entry.key !== "string" ||
        typeof entry.subtree_epoch_contribution !== "string"
      )
    ) {
      nodeEpochsShapeValid = false;
    }
  }
  const retainedSidecarByObservationId =
    new Map<string, ReconstructSemanticMapSidecarObservation>();
  const retainedSidecarIds: string[] = [];
  const missingMapPresentSidecarIds: string[] = [];
  const incompleteSidecarIds = sidecarRows
    .map((row) => row.observation_id)
    .filter((id) => discardedSet.has(id))
    .sort();
  const unknownSidecarIds = sidecarRows
    .map((row) => row.observation_id)
    .filter((id) => !currentSet.has(id))
    .filter((id, index, arr) => arr.indexOf(id) === index)
    .sort();
  const expectedSidecarIds = new Set<string>();
  for (const id of retainedItemIds) {
    const row = retainedRowsByObservationId.get(id);
    if (!row?.map_present) continue;
    expectedSidecarIds.add(id);
    const sidecarRow = sidecarRowsById.get(id);
    if (!sidecarRow) {
      missingMapPresentSidecarIds.push(id);
      continue;
    }
    retainedSidecarIds.push(id);
    retainedSidecarByObservationId.set(id, sidecarRow);
  }
  const extraSidecarIds = sidecarRows
    .map((row) => row.observation_id)
    .filter((id) => retainedSet.has(id) && !expectedSidecarIds.has(id))
    .sort();

  if (missingMapPresentSidecarIds.length > 0) {
    violations.push(resumeValidationViolation({
      code: "missing_required_ref",
      message: `prior semantic-map sidecar is missing retained map_present ids: ${missingMapPresentSidecarIds.join(",")}`,
      subjectId: "semantic-map.yaml",
    }));
  }
  if (extraSidecarIds.length > 0) {
    violations.push(resumeValidationViolation({
      code: "conflicting_state",
      message: `prior semantic-map sidecar has rows for retained map_absent ids: ${extraSidecarIds.join(",")}`,
      subjectId: "semantic-map.yaml",
    }));
  }
  if (unknownSidecarIds.length > 0) {
    violations.push(resumeValidationViolation({
      code: "unknown_id",
      message: `prior semantic-map sidecar contains ids outside current eligible observations: ${unknownSidecarIds.join(",")}`,
      subjectId: "semantic-map.yaml",
    }));
  }
  if (!projectionRenderable) {
    violations.push(resumeValidationViolation({
      code: "schema_shape_invalid",
      message: "prior semantic-map sidecar contains a projection that cannot render through the canonical renderer",
      subjectId: "semantic-map.yaml",
    }));
  }
  if (!nodeEpochsShapeValid) {
    violations.push(resumeValidationViolation({
      code: "schema_shape_invalid",
      message: "prior semantic-map sidecar node_epochs entries must contain string key and subtree_epoch_contribution fields",
      subjectId: "semantic-map.yaml",
    }));
  }

  const censusCompletePartition = Boolean(
    args.semanticMapCensus &&
      args.semanticMapCensus.observations_total === censusRows.length &&
      args.semanticMapCensus.observations_total ===
        args.semanticMapCensus.observations_map_present +
          args.semanticMapCensus.observations_map_absent,
  );
  if (args.semanticMapCensus && !censusCompletePartition) {
    violations.push(resumeValidationViolation({
      code: "conflicting_state",
      message: "prior semantic-map census totals do not form a complete partition",
      subjectId: "semantic-map-census.yaml",
    }));
  }

  const valid = violations.length === 0;
  const activationDecision: ReconstructSemanticMapResumeValidationArtifact["activation_decision"] =
    valid && recoveryAttempted
      ? "recovery_activated"
      : valid
        ? "normal_full_stage"
        : "recovery_rejected";
  const artifact: ReconstructSemanticMapResumeValidationArtifact = {
    schema_version: "1",
    session_id: args.sessionId,
    created_at: isoNow(),
    dispatch_incomplete_ref: args.dispatchIncompleteRef,
    semantic_map_census_ref: args.semanticMapCensusRef,
    semantic_map_sidecar_ref: args.semanticMapSidecarRef,
    validation_status: valid ? "valid" : "invalid",
    recovery_attempted: valid && recoveryAttempted,
    activation_decision: activationDecision,
    resume_mode: args.resumeMode,
    dispatch_breaker_enabled: args.dispatchBreakerEnabled,
    pipeline: "reconstruct",
    batch_label: "semantic-map",
    current_observation_ids: args.currentObservationIds,
    retained_item_ids: retainedItemIds,
    discarded_item_ids: discardedItemIds,
    prior_retry_totals: {
      breaker_retry_synthesize_calls:
        args.semanticMapCensus?.breaker_retry_synthesize_calls ?? null,
      breaker_retry_verify_calls:
        args.semanticMapCensus?.breaker_retry_verify_calls ?? null,
    },
    prior_refs: {
      dispatch_incomplete: args.dispatchIncompleteRef,
      semantic_map_census: args.semanticMapCensusRef,
      semantic_map_sidecar: args.semanticMapSidecarRef,
    },
    backup_refs: {
      dispatch_incomplete: args.backupRefs?.dispatch_incomplete ?? null,
      semantic_map_census: args.backupRefs?.semantic_map_census ?? null,
      semantic_map_sidecar: args.backupRefs?.semantic_map_sidecar ?? null,
    },
    partition_validation: {
      planned_item_ids: planned,
      completed_item_ids: completed,
      dead_letter_item_ids: deadLetterIds,
      incomplete_item_ids: incomplete,
      unknown_item_ids: unknownItemIds,
      duplicate_item_ids: duplicateItemIds,
      overlapping_item_ids: overlappingItemIds,
      exact_current_set_match: exactCurrentSetMatch,
    },
    census_validation: {
      retained_census_ids: retainedItemIds.filter((id) => censusRowsById.has(id)),
      incomplete_census_ids: incompleteCensusIds,
      unknown_census_ids: unknownCensusIds,
      extra_census_ids: extraCensusIds,
      missing_retained_ids: missingRetainedIds,
      non_reusable_retained_ids: nonReusableRetainedIds,
      fingerprint_mismatch_ids: fingerprintMismatchIds,
      census_complete_partition: censusCompletePartition,
    },
    sidecar_validation: {
      retained_sidecar_ids: retainedSidecarIds,
      incomplete_sidecar_ids: incompleteSidecarIds,
      unknown_sidecar_ids: unknownSidecarIds,
      missing_map_present_sidecar_ids: missingMapPresentSidecarIds,
      extra_sidecar_ids: extraSidecarIds,
      projection_renderable: projectionRenderable,
      node_epochs_shape_valid: nodeEpochsShapeValid,
    },
    validation_results: valid
      ? ["semantic_map_resume_validation_valid"]
      : ["semantic_map_resume_validation_invalid"],
    asserted_obligation_ids: [],
    violations,
  };
  return {
    artifact,
    retainedRowsByObservationId,
    retainedSidecarByObservationId,
    retainedCompletedItemIds: completed.filter((id) => retainedSet.has(id)),
    retainedDeadLetter: deadLetter.filter((entry) => retainedSet.has(entry.item_id)),
    incompleteItemIds: incomplete.filter((id) => currentSet.has(id)),
  };
}

async function readResumeYamlIfPresent<T>(
  filePath: string,
): Promise<{ value: T | null; error: unknown | null }> {
  try {
    return { value: await readYamlDocumentIfPresent<T>(filePath), error: null };
  } catch (error) {
    if (isGracefulTerminalSignal(error)) throw error;
    if (readReconstructLlmDispatchFailureError(error)) throw error;
    return { value: null, error };
  }
}

async function backupSemanticMapRecoveryInputs(args: {
  sessionRoot: string;
  attemptId: string;
  dispatchIncompletePath: string;
  censusPath: string;
  sidecarPath: string;
}): Promise<ReconstructSemanticMapResumeValidationArtifact["backup_refs"]> {
  const backupDir = path.join(
    args.sessionRoot,
    "comprehension",
    "recovery",
    args.attemptId,
  );
  await fs.mkdir(backupDir, { recursive: true });
  const copyIfPresent = async (
    sourcePath: string,
    basename: string,
  ): Promise<string | null> => {
    if (!(await exists(sourcePath))) return null;
    const targetPath = path.join(backupDir, basename);
    await fs.copyFile(sourcePath, targetPath);
    return targetPath;
  };
  return {
    dispatch_incomplete: await copyIfPresent(
      args.dispatchIncompletePath,
      "dispatch-incomplete.yaml",
    ),
    semantic_map_census: await copyIfPresent(
      args.censusPath,
      "semantic-map-census.yaml",
    ),
    semantic_map_sidecar: await copyIfPresent(
      args.sidecarPath,
      "semantic-map.yaml",
    ),
  };
}

export async function prepareSemanticMapResumeContext(args: {
  sessionId: string;
  sessionRoot: string;
  attemptId: string;
  sourceObservations: ReconstructSourceObservationsArtifact;
  resumeMode: "fresh" | "reuse_existing_authored_artifacts";
  dispatchBreaker?: DispatchBreakerPolicy;
  semanticMapCapabilityPresent?: boolean;
  preImageBase: SemanticMapPreImageBase;
  /** Step 6 (DD7): code kind eligibility (settings 옵트인 ∩ author 광고) — the resume partition must
   *  match the STAGE's eligible set exactly, or recovery re-dispatch would mis-partition. */
  codeEligible?: boolean;
  codePreImageBase?: SemanticMapPreImageBase;
  verifyModelIdentity: string;
  config: SemanticMapStageConfig;
  /** DD10 (리뷰 inv MN2): render-label root threaded to the renderability re-check (null = v1
   *  absolute-passthrough — callers without a project root). */
  labelRoot: string | null;
}): Promise<SemanticMapRecoveryContext | null> {
  const dispatchPath = dispatchIncompleteArtifactPath(args.sessionRoot);
  if (!(await exists(dispatchPath))) return null;

  const validationPath = semanticMapResumeValidationPath(args.sessionRoot);
  const censusPath = semanticMapCensusPath(args.sessionRoot);
  const sidecarPath = semanticMapSidecarPath(args.sessionRoot);
  const eligibleObservations = semanticMapEligibleObservations(
    args.sourceObservations,
    args.codeEligible === true,
  );
  const currentObservationIds = eligibleObservations.map((observation) =>
    observation.observation_id
  );
  const observationsById = new Map(
    eligibleObservations.map((observation) => [
      observation.observation_id,
      observation,
    ]),
  );
  const dispatchRead =
    await readResumeYamlIfPresent<DispatchIncompleteArtifact>(dispatchPath);
  const censusRead =
    await readResumeYamlIfPresent<ReconstructSemanticMapCensus>(censusPath);
  const sidecarRead =
    await readResumeYamlIfPresent<ReconstructSemanticMapSidecar>(sidecarPath);

  const parseViolations: ReconstructPostSeedValidationViolation[] = [];
  const dispatch = isDispatchIncompleteArtifact(dispatchRead.value)
    ? dispatchRead.value
    : null;
  if (dispatchRead.error || (dispatchRead.value !== null && !dispatch)) {
    parseViolations.push(resumeValidationViolation({
      code: "schema_shape_invalid",
      message: `dispatch-incomplete.yaml is not a readable schema_version=1 dispatch artifact: ${
        dispatchRead.error instanceof Error ? dispatchRead.error.message : "shape mismatch"
      }`,
      subjectId: "dispatch-incomplete.yaml",
    }));
  }
  const census = isSemanticMapCensus(censusRead.value) ? censusRead.value : null;
  if (censusRead.error || (censusRead.value !== null && !census)) {
    parseViolations.push(resumeValidationViolation({
      code: "schema_shape_invalid",
      message: `semantic-map-census.yaml is not a readable schema_version=1 census artifact: ${
        censusRead.error instanceof Error ? censusRead.error.message : "shape mismatch"
      }`,
      subjectId: "semantic-map-census.yaml",
    }));
  }
  const sidecar = isSemanticMapSidecar(sidecarRead.value) ? sidecarRead.value : null;
  if (sidecarRead.error || (sidecarRead.value !== null && !sidecar)) {
    parseViolations.push(resumeValidationViolation({
      code: "schema_shape_invalid",
      message: `semantic-map.yaml is not a readable schema_version=1 sidecar artifact: ${
        sidecarRead.error instanceof Error ? sidecarRead.error.message : "shape mismatch"
      }`,
      subjectId: "semantic-map.yaml",
    }));
  }

  const backupRefs = parseViolations.length === 0
    ? await backupSemanticMapRecoveryInputs({
      sessionRoot: args.sessionRoot,
      attemptId: args.attemptId,
      dispatchIncompletePath: dispatchPath,
      censusPath,
      sidecarPath,
    })
    : {
      dispatch_incomplete: null,
      semantic_map_census: null,
      semantic_map_sidecar: null,
    };
  const { artifact, ...context } = buildSemanticMapResumeValidationArtifact({
    sessionId: args.sessionId,
    resumeMode: args.resumeMode,
    dispatchBreakerEnabled: args.dispatchBreaker?.enabled === true,
    semanticMapCapabilityPresent: args.semanticMapCapabilityPresent ?? true,
    currentObservationIds,
    observationsById,
    dispatchIncompleteRef: dispatchPath,
    dispatchIncomplete: dispatch,
    semanticMapCensusRef: censusRead.value !== null ? censusPath : null,
    semanticMapCensus: census,
    semanticMapSidecarRef: sidecarRead.value !== null ? sidecarPath : null,
    semanticMapSidecar: sidecar,
    preImageBase: args.preImageBase,
    ...(args.codePreImageBase !== undefined ? { codePreImageBase: args.codePreImageBase } : {}),
    verifyModelIdentity: args.verifyModelIdentity,
    config: args.config,
    labelRoot: args.labelRoot,
    backupRefs,
  });
  artifact.violations.push(...parseViolations);
  if (parseViolations.length > 0) {
    artifact.validation_status = "invalid";
    artifact.activation_decision = "recovery_rejected";
    artifact.recovery_attempted = false;
    artifact.validation_results = ["semantic_map_resume_validation_invalid"];
  }
  await writeYamlDocument(validationPath, artifact);
  if (artifact.validation_status !== "valid") {
    throw new Error(
      `semantic-map resume validation failed at ${validationPath}: ${
        artifact.violations.map((violation) => violation.message).join("; ")
      }`,
    );
  }
  if (!artifact.recovery_attempted) return null;
  return {
    validationPath,
    dispatchIncompletePath: dispatchPath,
    backupRefs,
    retainedRowsByObservationId: context.retainedRowsByObservationId,
    retainedSidecarByObservationId: context.retainedSidecarByObservationId,
    retainedCompletedItemIds: context.retainedCompletedItemIds,
    retainedDeadLetter: context.retainedDeadLetter,
    incompleteItemIds: context.incompleteItemIds,
    priorRetryTotals: artifact.prior_retry_totals,
  };
}
