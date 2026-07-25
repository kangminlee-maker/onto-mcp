import path from "node:path";
import { atomicWriteYamlDocument as writeYamlDocument } from "../artifact-io.js";
import type { TargetMaterialRefDetection } from "../target-material-kind.js";
import type {
  ReconstructSourceFrontierArtifact,
  ReconstructSourceFrontierValidationArtifact,
  ReconstructSourceInventoryArtifact,
  ReconstructSourceInventoryUnit,
  ReconstructSourceObservationsArtifact,
  ReconstructTargetMaterialProfileArtifact,
  ReconstructTargetMaterialProfileValidationArtifact,
} from "./artifact-types.js";
import { validationDetailSummary } from "./authoring-prompt-payloads.js";
import type { ReconstructDirectiveAuthor } from "./directive-author-contract.js";
import { GracefulTerminalSignal } from "./graceful-terminal.js";
import {
  buildReconstructSourceObservation,
  observeInventoryUnitDeep,
  spreadsheetUnsupportedReason,
} from "./materialize-preparation.js";
import { isoNow } from "./run-primitives.js";
import { regionCoverageKeys, regionKey } from "./source-observations.js";
import type { ReconstructSourceObservation } from "./source-observations.js";

export function assertRuntimeValidationValid(args: {
  artifactName: string;
  artifactRef: string;
  validation: {
    validation_status: "valid" | "invalid";
    violations?: unknown;
  };
}): void {
  if (args.validation.validation_status === "valid") return;
  throw new Error(
    `${args.artifactName} validation failed at ${args.artifactRef}: ${
      validationDetailSummary(args.validation as unknown as Record<string, unknown>)
    }`,
  );
}

// Core Stage 2 inter-document breadth (design §6/§7 PR-2b, PRELIMINARY — real-corpus tuning is a
// named follow-up, PR-2c): the inter-file admission budget — at most this many admitted files are
// promoted to a deep observation per admission-selection stage run, priority-ranked then stable
// resolved-source_ref order (capAdmissionSelectionAcceptedRefs). Orthogonal to
// MAX_PROJECTED_REGIONS_PER_FILE (intra-file): this bounds how many FILES go deep, that bounds how
// many REGIONS one file contributes once it does — no shared pool (design §6).
export const SOURCE_ADMISSION_DEEP_FILE_LIMIT = 16;

// The minimum accepted files the runtime guarantees regardless of what the admission-selection LM
// proposes (design §7 floor policy) — matches the design's literal admission_budget.
// must_select_at_least. Semantic authoring must never proceed with zero deep observations while
// admitted evidence sits unread.
export const SOURCE_ADMISSION_SELECTION_FLOOR = 1;

const ADMISSION_SELECTION_PRIORITY_RANK: Record<"high" | "medium" | "low", number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/**
 * Core Stage 2 inter-document breadth (design §6 inter-file budget, PR-2b): the runtime-owned
 * budget clamp over an ALREADY-VALIDATED accepted set. `validateSourceFrontier` only enforces
 * dedup/inventory-membership (no size cap); this ranks the accepted rows priority-first (high
 * before medium before low), then by stable resolved source_ref, and slices to `fileLimit` — so
 * an admission-selection LM that proposes more than the budget still yields a deterministic,
 * priority-respecting subset rather than an arbitrary one. Pure, exported for direct unit testing.
 */
export function capAdmissionSelectionAcceptedRefs(args: {
  sourceFrontier: ReconstructSourceFrontierArtifact;
  acceptedFrontierRefIds: string[];
  fileLimit: number;
}): string[] {
  const byId = new Map(
    args.sourceFrontier.frontier_refs.map((frontier) => [frontier.frontier_ref_id, frontier]),
  );
  return args.acceptedFrontierRefIds
    .flatMap((id) => {
      const row = byId.get(id);
      return row ? [{ id, row }] : [];
    })
    .sort((a, b) =>
      ADMISSION_SELECTION_PRIORITY_RANK[a.row.priority] -
        ADMISSION_SELECTION_PRIORITY_RANK[b.row.priority] ||
      path.resolve(a.row.source_ref).localeCompare(path.resolve(b.row.source_ref))
    )
    .slice(0, args.fileLimit)
    .map((entry) => entry.id);
}

/**
 * Core Stage 2 inter-document breadth (design §7 floor policy, PR-2b): mirrors
 * {@link applyFirstFrontierScoutPolicy}'s exact shape (append synthetic, runtime-authored
 * frontier_refs rows; leave a non-empty/already-adequate proposal untouched) but triggers on the
 * VALIDATED accepted count rather than the raw authored count — an LM proposal that names refs
 * outside the admitted inventory validates to 0 accepted despite a non-empty `frontier_refs`
 * array, and that case must ALSO reach the floor (design §7 "LM이 전부 defer"). Candidates are
 * admitted units not already accepted, stable-sorted by resolved source_ref (deterministic
 * tiebreak, design §7) — never re-consulting the LM. The disclosure channel is the SAME one the
 * scout policy uses: a runtime-authored `rationale` string distinguishes a floor-promoted row from
 * an LM-selected one (design §7 "selection_basis" intent), so no new field/type is needed. Pure —
 * the caller re-validates the returned frontier (this function never re-validates itself, matching
 * applyFirstFrontierScoutPolicy's own contract).
 */
export function applyAdmissionSelectionFloorPolicy(args: {
  sourceFrontier: ReconstructSourceFrontierArtifact;
  sourceFrontierValidation: ReconstructSourceFrontierValidationArtifact;
  admittedUnits: ReconstructSourceInventoryUnit[];
  floor: number;
}): ReconstructSourceFrontierArtifact {
  const acceptedCount = args.sourceFrontierValidation.accepted_frontier_ref_ids.length;
  if (acceptedCount >= args.floor) return args.sourceFrontier;
  const acceptedById = new Set(args.sourceFrontierValidation.accepted_frontier_ref_ids);
  const alreadyAcceptedRefs = new Set(
    args.sourceFrontier.frontier_refs
      .filter((frontier) => acceptedById.has(frontier.frontier_ref_id))
      .map((frontier) => path.resolve(frontier.source_ref)),
  );
  const needed = args.floor - acceptedCount;
  const candidates = args.admittedUnits
    .filter((unit) => !alreadyAcceptedRefs.has(path.resolve(unit.ref)))
    .sort((a, b) => path.resolve(a.ref).localeCompare(path.resolve(b.ref)))
    .slice(0, needed);
  if (candidates.length === 0) return args.sourceFrontier;
  return {
    ...args.sourceFrontier,
    frontier_refs: [
      ...args.sourceFrontier.frontier_refs,
      ...candidates.map((unit, index) => ({
        frontier_ref_id: `admission_floor_${index + 1}`,
        source_ref: unit.ref,
        rationale:
          `Runtime admission floor policy: the source-admission-selection author accepted fewer ` +
          `than ${args.floor} file(s); the runtime deterministically promoted this admitted unit ` +
          "(selection_basis: runtime_floor) so semantic authoring never proceeds with zero deep " +
          "observations while admitted evidence sits unread (design 20260722-inter-document-" +
          "breadth-stage2 §7).",
        priority: "high" as const,
      })),
    ],
    no_next_frontier_rationale: null,
  };
}

// Exported for direct unit testing (Stage 1 source-region-decomposition design 20260722 §5/§11
// Bucket A negative-control tests — the highest-value proof this design calls for, exercising the
// REAL dedup site rather than a mock). Not part of the public reconstruct core API surface.
export function validateSourceFrontier(args: {
  sessionId: string;
  roundId: string;
  sourceFrontier: ReconstructSourceFrontierArtifact;
  sourceFrontierRef: string;
  sourceInventory: ReconstructSourceInventoryArtifact;
  sourceInventoryRef: string;
  sourceObservations: ReconstructSourceObservationsArtifact;
  sourceObservationsRef: string;
  targetMaterialProfileValidation: ReconstructTargetMaterialProfileValidationArtifact;
  targetMaterialProfileValidationRef: string;
}): ReconstructSourceFrontierValidationArtifact {
  // A1 (design §5): regionKey-keyed. unit.location/frontier.location are
  // additive-absent in this PR, so every query key here is `regionKey(ref)`
  // (no location) — the bare resolved ref, byte-identical to the prior
  // `path.resolve()` keys. The observation/inventory-unit (authoritative) side
  // registers under regionCoverageKeys so a location-aware query (PR-1b-2) can
  // also find it later without changing this PR's behavior.
  const inventoryRefs = new Set(
    args.sourceInventory.inventory_units.flatMap((unit) =>
      regionCoverageKeys(unit.ref, unit.location)
    ),
  );
  const observedRefs = new Set(
    args.sourceObservations.observations.flatMap((observation) =>
      regionCoverageKeys(observation.source_ref, observation.location)
    ),
  );
  const accepted: string[] = [];
  const rejected: ReconstructSourceFrontierValidationArtifact["rejected_frontier_refs"] = [];
  const seen = new Set<string>();
  for (const frontier of args.sourceFrontier.frontier_refs) {
    const key = regionKey(frontier.source_ref, frontier.location);
    if (seen.has(key)) {
      rejected.push({
        frontier_ref_id: frontier.frontier_ref_id,
        source_ref: frontier.source_ref,
        reason: "duplicate_frontier_ref",
      });
      continue;
    }
    seen.add(key);
    if (observedRefs.has(key)) {
      rejected.push({
        frontier_ref_id: frontier.frontier_ref_id,
        source_ref: frontier.source_ref,
        reason: "already_observed",
      });
      continue;
    }
    if (!inventoryRefs.has(key)) {
      rejected.push({
        frontier_ref_id: frontier.frontier_ref_id,
        source_ref: frontier.source_ref,
        reason: "not_in_source_inventory",
      });
      continue;
    }
    accepted.push(frontier.frontier_ref_id);
  }
  const noNextFrontierAccepted =
    args.sourceFrontier.frontier_refs.length === 0 &&
    typeof args.sourceFrontier.no_next_frontier_rationale === "string" &&
    args.sourceFrontier.no_next_frontier_rationale.length > 0;
  const terminalAlreadyObservedFrontier =
    accepted.length === 0 &&
    rejected.length > 0 &&
    rejected.every((frontier) => frontier.reason === "already_observed");
  const fatalRejectedFrontiers = rejected.filter((frontier) =>
    frontier.reason !== "already_observed"
  );
  const upstreamValid =
    args.targetMaterialProfileValidation.validation_status === "valid";
  if (!upstreamValid) {
    rejected.push({
      frontier_ref_id: null,
      source_ref: null,
      reason: "target_material_profile_validation_invalid",
    });
  }
  const valid =
    upstreamValid &&
    fatalRejectedFrontiers.length === 0 &&
    (
      accepted.length > 0 ||
      noNextFrontierAccepted ||
      terminalAlreadyObservedFrontier
    );
  return {
    schema_version: "1",
    session_id: args.sessionId,
    round_id: args.roundId,
    created_at: isoNow(),
    source_frontier_ref: args.sourceFrontierRef,
    source_inventory_ref: args.sourceInventoryRef,
    source_observations_ref: args.sourceObservationsRef,
    target_material_profile_validation_ref:
      args.targetMaterialProfileValidationRef,
    upstream_validation_statuses: {
      target_material_profile:
        args.targetMaterialProfileValidation.validation_status,
    },
    validation_status: valid ? "valid" : "invalid",
    accepted_frontier_ref_ids: accepted,
    rejected_frontier_refs: rejected,
    no_next_frontier_accepted: noNextFrontierAccepted,
    validation_results: [
      ...(valid ? ["source_frontier_boundary_valid"] : []),
      ...(upstreamValid ? ["target_material_profile_validation_valid"] : []),
      ...(noNextFrontierAccepted ? ["no_next_frontier_rationale_present"] : []),
      ...(terminalAlreadyObservedFrontier
        ? ["terminal_frontier_refs_already_observed"]
        : []),
    ],
  };
}

/**
 * Core Stage 2 inter-document breadth (design 20260722-inter-document-breadth-stage2 §4-§7/§13
 * PR-2b, INVARIANT-CHANGE): the admission-selection round-0 stage. Runs ONCE per reconstruct run,
 * guarded on Stage-2-active — returns `null` (no-op) when no unit is `"admitted"` (opt-in off, or
 * on but materialize stayed below SOURCE_ADMISSION_SELECTION_THRESHOLD), so the caller can branch
 * on the return value alone without a separate guard.
 *
 * Order (design §6 gate-ordering, §7 floor, §15 is_runtime_target_source split):
 *   1. author call — the author sees only the bounded `admitted_outlines` catalog, never
 *      whole-file content (design §4.3).
 *   2. `validateSourceFrontier` — REUSED VERBATIM (allowlist = admitted units via
 *      `regionCoverageKeys`; `observedRefs` = ∅ since admission mode leaves
 *      `source-observations.yaml` empty, design §1).
 *   3. floor policy (design §7) when the VALIDATED accepted count is under `floor` — re-validates
 *      afterward so the returned validation is always internally consistent with the returned
 *      frontier.
 *   4. inter-file budget cap (design §6, priority-ranked then stable source_ref) over the
 *      (possibly floor-augmented) accepted set.
 *   5. promotion via `observeInventoryUnitDeep` with `isRuntimeTargetSource:true` — the SAME
 *      helper the off-path deep-observe-all loop uses (materialize-preparation.ts), so
 *      `expandSourceObservationIntoRegions`'s one call site is untouched (an unselected/deferred
 *      unit never reaches this helper, hence never reaches decomposition either — a call-graph
 *      property, design §6). NEVER `observeAcceptedFrontierRefs` (below): that path stamps
 *      `is_runtime_target_source:false` plus a non-null `triggering_frontier_validation_ref` — a
 *      source-safety authority DOWNGRADE on the user's own runtime-target files that the boundary
 *      validator (source-observations.ts mutual-exclusion rule) rejects outright (design §5/§15).
 *
 * Persists the admission-selection artifact + its validation, and the UPDATED source-inventory /
 * source-observations, to the paths the caller already owns (`sourceInventoryRef`/
 * `sourceObservationsRef` — the SAME `preparationRefs.*` paths materialize wrote), so a downstream
 * reader that re-reads from disk (writeSourceSafetyLedgerArtifact, the round loop's delta writer)
 * sees the promoted state without the caller doing anything beyond adopting the returned objects.
 *
 * A promoted unit's `scan_status` stays `"admitted"` (design §2 — promotion never rewrites status,
 * it only adds an observation); `deferredSourceRefs` derives which admitted units remain
 * un-promoted from the returned `sourceObservations`.
 */
export async function runSourceAdmissionSelectionStage(args: {
  sessionId: string;
  intent: string;
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact;
  targetMaterialProfileValidation: ReconstructTargetMaterialProfileValidationArtifact;
  targetMaterialProfileValidationRef: string;
  sourceInventory: ReconstructSourceInventoryArtifact;
  sourceInventoryRef: string;
  sourceObservations: ReconstructSourceObservationsArtifact;
  sourceObservationsRef: string;
  directiveAuthor: Pick<ReconstructDirectiveAuthor, "writeSourceAdmissionSelection">;
  admissionSelectionPath: string;
  admissionSelectionValidationPath: string;
  fileLimit?: number;
  floor?: number;
  sourceRegionDecomposition?: boolean;
  codeStructureObservation?: boolean;
  codeSetTierObservation?: boolean;
  codeStructureLayout?: boolean;
}): Promise<{
  sourceInventory: ReconstructSourceInventoryArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
  admissionSelection: ReconstructSourceFrontierArtifact;
  admissionSelectionValidation: ReconstructSourceFrontierValidationArtifact;
  /**
   * Resolved source refs this stage actually tried to deep-observe (accepted ∩ file-limit cap) —
   * NOT every frontier ref. Everything admitted outside this set was deferred by design, which is
   * what lets the zero-observation graceful-terminal gate tell "held back" apart from "unread".
   */
  attemptedSourceRefs: ReadonlySet<string>;
} | null> {
  const admittedUnits = args.sourceInventory.inventory_units.filter(
    (unit) => unit.scan_status === "admitted",
  );
  if (admittedUnits.length === 0) return null;
  const fileLimit = args.fileLimit ?? SOURCE_ADMISSION_DEEP_FILE_LIMIT;
  const floor = args.floor ?? SOURCE_ADMISSION_SELECTION_FLOOR;

  const authoredSelection = await args.directiveAuthor.writeSourceAdmissionSelection({
    sessionId: args.sessionId,
    intent: args.intent,
    targetMaterialProfile: args.targetMaterialProfile,
    sourceInventory: args.sourceInventory,
    admissionFileLimit: fileLimit,
    admissionFloor: floor,
  });
  await writeYamlDocument(args.admissionSelectionPath, authoredSelection);

  const revalidate = (
    frontier: ReconstructSourceFrontierArtifact,
  ): ReconstructSourceFrontierValidationArtifact =>
    validateSourceFrontier({
      sessionId: args.sessionId,
      roundId: "admission",
      sourceFrontier: frontier,
      sourceFrontierRef: args.admissionSelectionPath,
      sourceInventory: args.sourceInventory,
      sourceInventoryRef: args.sourceInventoryRef,
      sourceObservations: args.sourceObservations,
      sourceObservationsRef: args.sourceObservationsRef,
      targetMaterialProfileValidation: args.targetMaterialProfileValidation,
      targetMaterialProfileValidationRef: args.targetMaterialProfileValidationRef,
    });

  let effectiveSelection = authoredSelection;
  let effectiveValidation = revalidate(effectiveSelection);
  if (effectiveValidation.accepted_frontier_ref_ids.length < floor) {
    effectiveSelection = applyAdmissionSelectionFloorPolicy({
      sourceFrontier: effectiveSelection,
      sourceFrontierValidation: effectiveValidation,
      admittedUnits,
      floor,
    });
    effectiveValidation = revalidate(effectiveSelection);
    await writeYamlDocument(args.admissionSelectionPath, effectiveSelection);
  }
  await writeYamlDocument(args.admissionSelectionValidationPath, effectiveValidation);
  assertRuntimeValidationValid({
    artifactName: "source-admission-selection",
    artifactRef: args.admissionSelectionValidationPath,
    validation: effectiveValidation,
  });

  const cappedAcceptedIds = new Set(
    capAdmissionSelectionAcceptedRefs({
      sourceFrontier: effectiveSelection,
      acceptedFrontierRefIds: effectiveValidation.accepted_frontier_ref_ids,
      fileLimit,
    }),
  );
  const frontierBySourceRef = new Map(
    effectiveSelection.frontier_refs
      .filter((frontier) => cappedAcceptedIds.has(frontier.frontier_ref_id))
      .map((frontier) => [path.resolve(frontier.source_ref), frontier] as const),
  );

  const promotedObservations: ReconstructSourceObservation[] = [];
  const promotionSkippedRefs: ReconstructSourceObservationsArtifact["skipped_refs"] = [];
  const nextInventoryUnits: ReconstructSourceInventoryUnit[] = [];
  for (const unit of args.sourceInventory.inventory_units) {
    const accepted = unit.scan_status === "admitted"
      ? frontierBySourceRef.get(path.resolve(unit.ref))
      : undefined;
    if (!accepted) {
      nextInventoryUnits.push(unit);
      continue;
    }
    const detection: TargetMaterialRefDetection = {
      ref: unit.ref,
      exists: unit.exists,
      kind: unit.target_material_kind,
      confidence: unit.exists ? 0.92 : 0.1,
      confidence_basis: "source-admission-selection accepted inventory ref",
    };
    // §5 scenario 1: materialize's deep-observe helper, isRuntimeTargetSource:true (the split).
    const deep = await observeInventoryUnitDeep(unit, detection, {
      isRuntimeTargetSource: true,
      sourceRegionDecomposition: args.sourceRegionDecomposition === true,
      ...(args.codeStructureObservation === true ? { codeStructureObservation: true } : {}),
      ...(args.codeSetTierObservation === true ? { codeSetTierObservation: true } : {}),
      ...(args.codeStructureLayout === true ? { codeStructureLayout: true } : {}),
      lineage: {
        roundId: "admission",
        observationBatchId: "source-observation-batch:admission",
      },
    });
    promotedObservations.push(...deep.observations);
    nextInventoryUnits.push(...deep.units);
    if (deep.skippedRef) promotionSkippedRefs.push(deep.skippedRef);
  }

  const nextSourceInventory: ReconstructSourceInventoryArtifact = {
    ...args.sourceInventory,
    inventory_units: nextInventoryUnits,
  };
  const nextSourceObservations: ReconstructSourceObservationsArtifact = {
    ...args.sourceObservations,
    created_at: isoNow(),
    observations: [...args.sourceObservations.observations, ...promotedObservations],
    skipped_refs: [...args.sourceObservations.skipped_refs, ...promotionSkippedRefs],
    validation_results: [
      ...new Set([
        ...args.sourceObservations.validation_results,
        "source_admission_selection_promoted",
      ]),
    ],
  };
  await writeYamlDocument(args.sourceInventoryRef, nextSourceInventory);
  await writeYamlDocument(args.sourceObservationsRef, nextSourceObservations);

  return {
    sourceInventory: nextSourceInventory,
    sourceObservations: nextSourceObservations,
    admissionSelection: effectiveSelection,
    admissionSelectionValidation: effectiveValidation,
    attemptedSourceRefs: new Set(frontierBySourceRef.keys()),
  };
}

// Exported for direct unit testing — see validateSourceFrontier's export comment above.
export async function observeAcceptedFrontierRefs(args: {
  sourceFrontier: ReconstructSourceFrontierArtifact;
  sourceFrontierValidation: ReconstructSourceFrontierValidationArtifact;
  sourceFrontierValidationPath: string;
  sourceInventory: ReconstructSourceInventoryArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
  sourceObservationsPath: string;
  codeStructureObservation?: boolean;
  codeSetTierObservation?: boolean;
  codeStructureLayout?: boolean;
}): Promise<ReconstructSourceObservationsArtifact> {
  // A2 (design §5): regionKey-keyed coverage set (registered under both the
  // file-level and precise forms — see regionCoverageKeys). inventoryByRef
  // stays file-level (one inventory unit per file — unchanged by this PR).
  const observedSourceRefs = new Set(
    args.sourceObservations.observations.flatMap((observation) =>
      regionCoverageKeys(observation.source_ref, observation.location)
    ),
  );
  const frontierById = new Map(
    args.sourceFrontier.frontier_refs.map((frontier) => [
      frontier.frontier_ref_id,
      frontier,
    ]),
  );
  const inventoryByRef = new Map(
    args.sourceInventory.inventory_units.map((unit) => [
      path.resolve(unit.ref),
      unit,
    ]),
  );
  const addedObservations: ReconstructSourceObservationsArtifact["observations"] = [];

  for (const frontierRefId of args.sourceFrontierValidation.accepted_frontier_ref_ids) {
    const frontier = frontierById.get(frontierRefId);
    if (!frontier) {
      throw new Error(`accepted source frontier id has no source-frontier row: ${frontierRefId}`);
    }
    const resolvedSourceRef = path.resolve(frontier.source_ref);
    // coverageKey: frontier.location is additive-absent in this PR, so this is
    // the file-level form (see regionKey's doc comment) — byte-identical to the
    // prior bare `path.resolve()` lookup.
    const coverageKey = regionKey(frontier.source_ref, frontier.location);
    if (observedSourceRefs.has(coverageKey)) continue;
    const inventoryUnit = inventoryByRef.get(resolvedSourceRef);
    if (!inventoryUnit) {
      throw new Error(
        `accepted source frontier ref is not present in source inventory: ${frontier.source_ref}`,
      );
    }
    const detection: TargetMaterialRefDetection = {
      ref: inventoryUnit.ref,
      exists: inventoryUnit.exists,
      kind: inventoryUnit.target_material_kind,
      confidence: inventoryUnit.exists ? 0.92 : 0.1,
      confidence_basis:
        `source-frontier accepted inventory ref ${frontierRefId}`,
    };
    const observation = await buildReconstructSourceObservation(detection, {
      roundId: args.sourceFrontier.round_id,
      observationBatchId:
        `source-observation-batch:${args.sourceFrontier.round_id}:source_frontier`,
      triggeringFrontierValidationRef: args.sourceFrontierValidationPath,
    }, {
      ...(args.codeStructureObservation === true
        ? { codeStructureObservation: true, ...(args.codeSetTierObservation === true ? { codeSetTierObservation: true } : {}), ...(args.codeStructureLayout === true ? { codeStructureLayout: true } : {}) }
        : {}),
      // A2 thread-through (design §5/§10 PR-1b-2): frontier.location is additive-absent — no
      // producer sets it in this PR (the round-N frontier-authoring prompt has no location field) —
      // so this spread is a no-op today, unconditionally safe to always evaluate.
      ...(frontier.location !== undefined ? { locationOverride: frontier.location } : {}),
    });
    // A null observation (vanished ref) and an unsupported workbook format
    // (.xls/.xlsb/.ods — inventory carries only `unsupported_reason`, no evidence) are both
    // un-observable by the current runtime. Site 2 graceful terminal (design site2 §9): this is a
    // normal-but-unmet stop, not a crash. Skipping the ref is NOT viable — the delta writer requires
    // every accepted frontier id to produce a NEW observation
    // (source-observation-delta-validation.ts:257), so a skip-and-continue would crash deeper. Throw
    // a graceful signal instead: it propagates out BEFORE the delta write (call site ~13030), and
    // the run-level catch assembles an honest blocked terminal from the context that call site set.
    if (!observation || spreadsheetUnsupportedReason(observation)) {
      const unsupportedReason = observation
        ? spreadsheetUnsupportedReason(observation)
        : null;
      throw new GracefulTerminalSignal({
        disposition: "blocked",
        terminalStepId: "source_observation_delta",
        reason:
          `accepted source frontier ref cannot be observed by current runtime: ${frontier.source_ref}` +
          (unsupportedReason
            ? ` (unsupported: ${unsupportedReason})`
            : " (ref unavailable at observation time)"),
      });
    }
    addedObservations.push(observation);
    // Register the newly added observation under both coverage forms — same as
    // the initial Set construction above — so a LATER accepted frontier row for
    // the same file within this same batch is also correctly recognized.
    for (const k of regionCoverageKeys(observation.source_ref, observation.location)) {
      observedSourceRefs.add(k);
    }
  }

  const nextSourceObservations: ReconstructSourceObservationsArtifact = {
    ...args.sourceObservations,
    created_at: isoNow(),
    observations: [
      ...args.sourceObservations.observations,
      ...addedObservations,
    ],
    skipped_refs: args.sourceObservations.skipped_refs.filter((skipped) =>
      !observedSourceRefs.has(regionKey(skipped.ref))
    ),
    validation_results: [
      ...new Set([
        ...args.sourceObservations.validation_results,
        "source_frontier_refs_observed",
      ]),
    ],
  };
  await writeYamlDocument(args.sourceObservationsPath, nextSourceObservations);
  return nextSourceObservations;
}
