import path from "node:path";
import type { CodeStructureInventory } from "../code-structure-observer.js";
import type {
  ReconstructRunGoverningSnapshot,
  ReconstructSeedAuthoringReadinessValidationArtifact,
  ReconstructSourceInventoryArtifact,
  ReconstructSourceObservationLineageIndexValidationArtifact,
  ReconstructSourceObservationsArtifact,
  ReconstructSourceSafetyLedgerArtifact,
  ReconstructSourceSafetyLedgerValidationArtifact,
  ReconstructSourceScoutPackArtifact,
  ReconstructSourceScoutPackValidationArtifact,
  ReconstructTargetMaterialProfileArtifact,
  ReconstructTargetMaterialProfileValidationArtifact,
} from "./artifact-types.js";
import { authoringPromptContractSha256 } from "./authoring-llm-call.js";
import {
  competencyQuestionAssessmentProjectionContractSha256,
} from "./authoring-prompt-payloads.js";
import {
  COMPETENCY_QUESTION_ASSESSMENT_PROJECTION_CONTRACT_VERSION,
} from "./competency-projection-contract.js";
import { COMPREHENSION_ARTIFACT_CONTRACT_DESCRIPTOR } from "./comprehension-artifact.js";
import type { ReconstructConfirmationProvider } from "./confirmation-provider-contract.js";
import type { ReconstructDirectiveAuthor } from "./directive-author-contract.js";
import { assertGatingKeyExcludesInEpochOutput } from "./llm-touch-fingerprint.js";
import { DOCUMENT_EXCERPT_PROJECTION_FLOOR } from "./materialize-preparation.js";
import type {
  ReconstructConfirmationProviderRealization,
  ReconstructSemanticAuthorRealization,
} from "./run-manifest.js";
import { sha256Text, stableJson } from "./run-primitives.js";
import {
  workbookInventoryAdapterVersion,
  workbookInventoryDataLayerCaps,
  workbookInventoryValueTileConfig,
} from "./workbook-inventory-reuse-inputs.js";

export interface AuthoredArtifactReuseMatch {
  session_id: string;
  intent_sha256: string;
  target_refs_sha256: string;
  competency_question_assessment_projection_contract_version: string;
  competency_question_assessment_projection_contract_sha256: string;
  target_material_profile_sha256: string;
  target_material_profile_validation_sha256: string | null;
  source_inventory_sha256: string;
  source_observations_sha256: string;
  // M3c: the seed-stage projected observation snapshot is hashed so a changed seed-stage
  // projection invalidates reuse. Null on the pre-seed refreshes (snapshot not yet taken).
  seed_stage_prompt_source_observations_sha256: string | null;
  source_safety_ledger_sha256: string | null;
  source_safety_ledger_validation_sha256: string | null;
  source_scout_pack_sha256: string | null;
  source_scout_pack_validation_sha256: string | null;
  source_observation_lineage_index_validation_sha256: string | null;
  seed_authoring_readiness_validation_sha256: string | null;
  seed_authoring_readiness_taxonomy_version: string | null;
  governing_snapshot_sha256: string;
  requested_domain_ids: string[];
  semantic_author_realization: ReconstructSemanticAuthorRealization;
  confirmation_provider_realization: ReconstructConfirmationProviderRealization;
  directive_author_id: string;
  confirmation_provider_id: string;
  // DET-1 (CG-2): canonical authoring-model identity ("<provider>/<model_id>") for the
  // semantic author + confirmation provider. The realization tag above is the literal
  // "direct_call" and carries no model info, so without these a resume under a DIFFERENT
  // supported model recomputes the same key and silently reuses the prior model's authored
  // artifacts. Folding them rotates the key on a model swap. "unspecified" when no resolved
  // provider+model_id (e.g. an author built without a config); a live run resolves both.
  semantic_author_model_identity: string;
  confirmation_provider_model_identity: string;
  // DET-1 (CG-1 gate): the answer-support JUDGE may run under a different model than
  // the author (judgeLlmConfig, an opt-in independence lever). answer-support-judgment
  // is reuse-eligible, so without folding the judge identity a resume under a swapped
  // judge model recomputes the same key and silently reuses the prior judge's verdict.
  // Equals the author identity when no judge override; "unspecified" without a config.
  judge_model_identity: string;
  // DET-1 (CG-1): sha256 of the authoring prompt-template contract — every host-LLM
  // authoring prompt template (RECONSTRUCT_AUTHORING_PROMPT_CONTRACT). Editing any
  // authoring prompt rotates this sha, so a resume after a prompt edit regenerates
  // instead of reusing artifacts authored under the prior template. The realization
  // tag + model identity above carry no template text; this is the only path for it.
  authoring_prompt_contract_sha256: string;
  // The seed-stage document projection budget shapes the authored prompts (how
  // much of a captured document reaches seed authoring), so a budget change — e.g.
  // a different semantic-author model/window, or a fall back to the FLOOR — must
  // invalidate reuse even when the captured observations are byte-identical.
  document_excerpt_projection_budget: number;
  // Projection-layer breadth fold (design 20260723 §8 PR-3): enabling/disabling it can change the
  // authored directive's detail rung on an overflowing candidate catalog, so — like the projection
  // budget above — it invalidates reuse even when the captured observations are byte-identical.
  source_breadth_fold: boolean;
  // P1-C2-A (R2/R8): the order-independent aggregate of the per-observation leaf-read
  // llm_touch_fingerprints (ⓐ+ⓑ). Folding the fingerprint VALUE — never the leaf-read OUTPUT —
  // rotates the seed key when the leaf-reader model/prompt or a low-confidence region changes, so a
  // resume after a leaf-reader model swap regenerates instead of reusing a stale-labelled seed.
  // null when no low-confidence region triggered a leaf-read.
  leaf_read_aggregate_fingerprint_sha256: string | null;
  // W3 (wiring design 20260702 §5): the semantic-map stage's pre-execution fingerprint VALUE (model
  // identities + prompt-contract sha + version knob + whole stage config + inventory identity).
  // Rotates the seed key when anything that shapes the map changes (F2 topology / X7 caps / X9
  // projection caps / F4 verify model). null when the stage skipped or saw nothing evaluatable.
  semantic_map_aggregate_fingerprint_sha256: string | null;
  /** Phase 1b FD13: the deterministic set-tier fingerprint VALUE (null = opt-in off OR set not
   *  complete/not_applicable) — a completed-set seed can never be reused across changed set
   *  inputs, and a set-failure seed (no overview injected) keys as null like OFF. Adding this
   *  field rotates every reuse key once at upgrade (leaf-read precedent — safe direction). */
  code_set_tier_aggregate_fingerprint_sha256: string | null;
}

function stripVolatileArtifactFields(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stripVolatileArtifactFields(item));
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .filter((key) =>
          key !== "created_at" &&
          key !== "emitted_at" &&
          // In-memory-only G(a) obligation-coverage telemetry — stamped on the artifact for the harvest
          // but never part of reuse identity (the persisted copy is dropped at the write boundary; see
          // artifact-io stripInMemoryOnlyArtifactFields). Excluding it here keeps the in-memory reuse
          // digest invariant so instrumenting a reuse-hashed validation artifact never rotates reuse.
          key !== "asserted_obligation_ids"
        )
        .sort()
        .map((key) => [key, stripVolatileArtifactFields(record[key])]),
    );
  }
  return value;
}

// Exported as a test seam so the obligation-telemetry byte-invariance test can prove that stamping
// `asserted_obligation_ids` on a reuse-hashed validation artifact leaves its reuse digest unchanged.
export function reuseMatchArtifactHash(value: unknown): string {
  return sha256Text(stableJson(stripVolatileArtifactFields(value)));
}

// Stable reuse digest of a source-observation set. Shared by the live source_observations
// hash and the M3c seed-stage snapshot hash so the two are byte-comparable. Exported for the
// resume-regression test (a spreadsheet adapter_version bump must change this digest so a
// stale old-schema seed cannot be silently reused).
export function sourceObservationsReuseSha256(
  artifact: ReconstructSourceObservationsArtifact,
): string {
  const reuseKey = {
    // P1-C1 §12 T2: fold the ComprehensionArtifact contract SHAPE (version + baseline field set) so
    // editing the contract rotates the reuse key tautologically — a seed authored under an older/
    // weaker companion contract fails the resume provenance check.
    // P1-C2-A (R1/R2): the EMBEDDED comprehension artifact stays the DETERMINISTIC companion
    // (LLM-free, inventory-derived, covered by the workbook_inventory fold below), so this invariant
    // holds. The LLM leaf-read lives in a SEPARATE Layer-2 artifact whose model/prompt identity is
    // folded — as a fingerprint VALUE, never the instance — into authoredArtifactReuseMatch.
    comprehension_artifact_contract: COMPREHENSION_ARTIFACT_CONTRACT_DESCRIPTOR,
    observations: artifact.observations.map((observation) => ({
      observation_id: observation.observation_id,
      target_material_kind: observation.target_material_kind,
      adapter_id: observation.adapter_id,
      source_ref: path.resolve(observation.source_ref),
      // Stage 1 source-region-decomposition (design 20260722 §5 "누락된 지점"/§10 PR-1b-2): folded
      // RAW, never path.resolve()'d. A real region anchor (e.g. "L128-210") is not a path — resolving
      // it would silently rewrite it to `${cwd}/L128-210`, making the reuse key CWD-dependent and
      // non-deterministic across replays (the two-CWD determinism test in this PR's suite proves the
      // fix). BYTE-IDENTICAL for every whole-file observation: `location` there is always
      // `detection.ref`, which is ALREADY an absolute, `path.resolve()`-derived string
      // (materialize-preparation.ts's targetRefs / the re-observation paths' inventory unit refs are
      // resolved upstream, before any observation is built) — so `path.resolve` on it was always a
      // no-op. The reuse key rotates ONLY when a real region anchor appears (opt-in on + a decomposed
      // file), never for an off-path or sub-budget-only run.
      location: observation.location,
      structural_data: {
        path_kind: observation.structural_data.path_kind ?? null,
        size_bytes: observation.structural_data.size_bytes ?? null,
        line_count: observation.structural_data.line_count ?? null,
        char_count: observation.structural_data.char_count ?? null,
        content_sha256: observation.structural_data.content_sha256 ?? null,
        excerpt_truncated: observation.structural_data.excerpt_truncated ?? null,
        // Captured excerpt length distinguishes runs authored under different capture
        // budgets (e.g. the 6K vs 200K document cap): for a document longer than both
        // caps `excerpt_truncated` stays true and char_count/sha are identical, so
        // without this a resume could reuse artifacts authored from only the old lead.
        content_excerpt_length:
          typeof observation.structural_data.content_excerpt === "string"
            ? observation.structural_data.content_excerpt.length
            : null,
        // Spreadsheet observer schema version (nested in workbook_inventory): content_sha256
        // is a raw-byte hash and cannot reflect a structural schema change, so without this a
        // resume could silently reuse a seed authored under the OLD inventory shape (e.g. the
        // Stage 1.1 formula_cells → formula_patterns migration). Bumping adapter_version must
        // change this reuse hash so the stale artifact fails the resume provenance check.
        workbook_inventory_adapter_version: workbookInventoryAdapterVersion(
          observation.structural_data.workbook_inventory,
        ),
        // P1-C1 §12 T1: value-tile opts + data-layer caps shape the inventory CONTENT but are
        // invisible to content_sha256 (raw bytes) and adapter_version (schema shape), so fold them
        // here — re-calibrating opts/caps without an adapter bump still rotates the resume key.
        workbook_inventory_value_tile_config: workbookInventoryValueTileConfig(
          observation.structural_data.workbook_inventory,
        ),
        workbook_inventory_data_layer_caps: workbookInventoryDataLayerCaps(
          observation.structural_data.workbook_inventory,
        ),
        // Code structure inventory IDENTITY (design 20260721 §9): content_sha256 is a raw-byte hash
        // and cannot reflect an EXTRACTOR-LOGIC or Linguist-CATALOG change, so an inventory-only run
        // (capture on, map/set-tier off) could silently reuse a seed authored under stale extractor
        // logic. Folded EXISTENCE-CONDITIONALLY (never an always-null key) so a spreadsheet-only or
        // no-capture run's reuse hash is byte-identical — only capture-on runs rotate (the intended,
        // owner-approved 1-time rotation when this lands; extractor_logic_sha256 already folds the
        // layout digest + LINGUIST_CATALOG_SHA256).
        ...(() => {
          const inv = (observation.structural_data as Record<string, unknown>)
            .code_structure_inventory as CodeStructureInventory | undefined;
          return inv
            ? {
                code_structure_inventory_identity: {
                  content_sha256: inv.content_sha256,
                  extractor_logic_sha256: inv.extractor_logic_sha256,
                  ...(inv.extraction_tier !== undefined ? { extraction_tier: inv.extraction_tier } : {}),
                },
              }
            : {};
        })(),
      },
    })),
    skipped_refs: artifact.skipped_refs.map((skipped) => ({
      ref: path.resolve(skipped.ref),
      target_material_kind: skipped.target_material_kind,
      reason: skipped.reason,
    })),
  };
  // P1-C2-A (R3): regression guard — this digest must never carry in-epoch LLM output (the embedded
  // artifact instance's spine_claims / confidence_by_claim / …); only the deterministic descriptor +
  // inventory pre-image. Fail closed if a future edit serializes a leaf-read instance here.
  assertGatingKeyExcludesInEpochOutput("sourceObservationsReuseSha256", reuseKey);
  return sha256Text(stableJson(reuseKey));
}

export function authoredArtifactReuseMatch(args: {
  sessionId: string;
  intent: string;
  targetRefs: string[];
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact;
  targetMaterialProfileValidation?:
    ReconstructTargetMaterialProfileValidationArtifact | null;
  sourceInventory: ReconstructSourceInventoryArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
  seedStagePromptSourceObservations?:
    ReconstructSourceObservationsArtifact | null;
  sourceSafetyLedger?: ReconstructSourceSafetyLedgerArtifact | null;
  sourceSafetyLedgerValidation?:
    ReconstructSourceSafetyLedgerValidationArtifact | null;
  sourceScoutPack?: ReconstructSourceScoutPackArtifact | null;
  sourceScoutPackValidation?: ReconstructSourceScoutPackValidationArtifact | null;
  sourceObservationLineageIndexValidation?:
    ReconstructSourceObservationLineageIndexValidationArtifact | null;
  seedAuthoringReadinessValidation?:
    ReconstructSeedAuthoringReadinessValidationArtifact | null;
  governingSnapshot: ReconstructRunGoverningSnapshot;
  semanticAuthorRealization: ReconstructSemanticAuthorRealization;
  confirmationProviderRealization: ReconstructConfirmationProviderRealization;
  directiveAuthor: ReconstructDirectiveAuthor;
  confirmationProvider: ReconstructConfirmationProvider;
  leafReadAggregateFingerprint?: string | null;
  semanticMapAggregateFingerprint?: string | null;
  codeSetTierAggregateFingerprint?: string | null;
}): AuthoredArtifactReuseMatch {
  const match: AuthoredArtifactReuseMatch = {
    session_id: args.sessionId,
    intent_sha256: sha256Text(args.intent),
    target_refs_sha256: sha256Text(stableJson(args.targetRefs.map((ref) => path.resolve(ref)).sort())),
    competency_question_assessment_projection_contract_version:
      COMPETENCY_QUESTION_ASSESSMENT_PROJECTION_CONTRACT_VERSION,
    competency_question_assessment_projection_contract_sha256:
      competencyQuestionAssessmentProjectionContractSha256(),
    target_material_profile_sha256: sha256Text(stableJson({
      target_refs: args.targetMaterialProfile.target_refs.map((ref) => path.resolve(ref)).sort(),
      target_material_kind: args.targetMaterialProfile.target_material_kind,
      target_material_kind_candidates:
        args.targetMaterialProfile.target_material_kind_candidates,
      support_status: args.targetMaterialProfile.support_status,
      selected_source_profiles: args.targetMaterialProfile.selected_source_profiles,
      detection: args.targetMaterialProfile.detection.per_ref.map((item) => ({
        ref: path.resolve(item.ref),
        exists: item.exists,
        kind: item.kind,
        confidence: item.confidence,
      })),
    })),
    target_material_profile_validation_sha256: args.targetMaterialProfileValidation
      ? reuseMatchArtifactHash(args.targetMaterialProfileValidation)
      : null,
    source_inventory_sha256: sha256Text(stableJson(
      args.sourceInventory.inventory_units.map((unit) => ({
        ref: path.resolve(unit.ref),
        exists: unit.exists,
        target_material_kind: unit.target_material_kind,
        inventory_unit: unit.inventory_unit,
        profile_ref: unit.profile_ref ? path.resolve(unit.profile_ref) : null,
        scan_status: unit.scan_status,
        skip_reason: unit.skip_reason,
      })),
    )),
    source_observations_sha256: sourceObservationsReuseSha256(
      args.sourceObservations,
    ),
    // M3c: hash the seed-stage snapshot with the SAME projection as the live set, so a
    // changed seed-stage projection invalidates reuse; null until the snapshot is taken.
    seed_stage_prompt_source_observations_sha256:
      args.seedStagePromptSourceObservations
        ? sourceObservationsReuseSha256(args.seedStagePromptSourceObservations)
        : null,
    source_safety_ledger_sha256: args.sourceSafetyLedger
      ? reuseMatchArtifactHash(args.sourceSafetyLedger)
      : null,
    source_safety_ledger_validation_sha256: args.sourceSafetyLedgerValidation
      ? reuseMatchArtifactHash(args.sourceSafetyLedgerValidation)
      : null,
    source_scout_pack_sha256: args.sourceScoutPack
      ? reuseMatchArtifactHash(args.sourceScoutPack)
      : null,
    source_scout_pack_validation_sha256: args.sourceScoutPackValidation
      ? reuseMatchArtifactHash(args.sourceScoutPackValidation)
      : null,
    source_observation_lineage_index_validation_sha256:
      args.sourceObservationLineageIndexValidation
        ? reuseMatchArtifactHash(args.sourceObservationLineageIndexValidation)
        : null,
    seed_authoring_readiness_validation_sha256:
      args.seedAuthoringReadinessValidation
        ? reuseMatchArtifactHash(args.seedAuthoringReadinessValidation)
        : null,
    seed_authoring_readiness_taxonomy_version:
      args.seedAuthoringReadinessValidation?.readiness_classification
        ? "seed_authoring_readiness:v1"
        : null,
    governing_snapshot_sha256: sha256Text(stableJson(args.governingSnapshot)),
    requested_domain_ids: args.governingSnapshot.requested_domain_ids,
    semantic_author_realization: args.semanticAuthorRealization,
    confirmation_provider_realization: args.confirmationProviderRealization,
    directive_author_id: args.directiveAuthor.authorId,
    confirmation_provider_id: args.confirmationProvider.providerId,
    semantic_author_model_identity:
      args.directiveAuthor.reuseModelIdentity ?? "unspecified",
    confirmation_provider_model_identity:
      args.confirmationProvider.reuseModelIdentity ?? "unspecified",
    judge_model_identity:
      args.directiveAuthor.reuseJudgeModelIdentity ?? "unspecified",
    // DET-1 (CG-1): the authoring prompt-template contract is module-static, so
    // (unlike the model identity) it is read directly from the catalog rather than
    // off the author instance.
    authoring_prompt_contract_sha256: authoringPromptContractSha256(),
    document_excerpt_projection_budget:
      args.directiveAuthor.documentExcerptProjectionBudget ??
        DOCUMENT_EXCERPT_PROJECTION_FLOOR,
    // Projection-layer breadth fold (design 20260723 §8 PR-3): a directive-prompt projection knob, so
    // it belongs in the reuse key alongside document_excerpt_projection_budget — enabling/disabling it
    // can change the authored directive's detail rung on an overflowing catalog, and a resume across a
    // flag change must regenerate rather than silently reuse the other rung's selection. Always-present
    // boolean (over-rotates every key ONCE at upgrade — the documented safe direction).
    source_breadth_fold: args.directiveAuthor.sourceBreadthFold === true,
    leaf_read_aggregate_fingerprint_sha256:
      args.leafReadAggregateFingerprint ?? null,
    // W3 (wiring design 20260702 §5): the semantic-map stage's pre-execution fingerprint VALUE —
    // model identities + prompt-contract sha + version knob + the WHOLE stage config (topology,
    // caps, projection caps). Always-present-null (leaf-read precedent): adding this field rotates
    // every reuse key ONCE at upgrade (F3 — documented, over-rotate is the safe direction).
    semantic_map_aggregate_fingerprint_sha256:
      args.semanticMapAggregateFingerprint ?? null,
    code_set_tier_aggregate_fingerprint_sha256:
      args.codeSetTierAggregateFingerprint ?? null,
  };
  // P1-C2-A (R3): the seed gating key must never carry in-epoch LLM output — only the fingerprint
  // VALUE folded above. Fail closed if a future edit serializes a comprehension-artifact instance
  // (spine_claims / confidence_by_claim / …) into the reuse match (the self-gating circularity).
  assertGatingKeyExcludesInEpochOutput("authoredArtifactReuseMatch", match);
  return match;
}
