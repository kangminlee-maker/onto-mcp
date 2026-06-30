/**
 * Single source of truth for the competency-question assessment prompt-projection
 * contract: the field set + budget constants that define the host-LLM assessment
 * prompt surface. The reconstruct runtime (run.ts) imports the contract fn + budgets
 * from here, and the G(b) parity guard (scripts/check-prompt-projection-parity.ts)
 * asserts the registry node `prompt_projection_contracts.competency_question_assessment`
 * declares exactly this surface — so a field/budget change cannot silently drift from
 * its registry declaration (INV-SCHEMA-1). Side-effect-free.
 */

export const COMPETENCY_QUESTION_ASSESSMENT_PROJECTION_CONTRACT_VERSION =
  // v3 added the cited source-evidence bodies surface (source_evidence); v4 bounded it to a
  // deterministic per-payload SERIALIZED-SIZE budget; v5 (M2) derives that evidence reserve
  // from the WHOLE prompt budget per batch (= prompt_char_limit − measured non-evidence
  // payload − margin) instead of a static budget, so the evidence uses the room actually
  // left under the 50K cap. v6 scopes the claim_realization_map projection to each batch's
  // linked claims (questions' linked_claim_ids) instead of embedding the WHOLE map in every
  // batch — the whole-map fixed overhead grew unbounded with claim count and overflowed the
  // 50K cap before M3 (a claim-count-dependent pre-dispatch hard stop). Each version +
  // contract change rotates the reuse-match hash so resume mode cannot reuse an assessment
  // authored under a different (or content-blind, pre-v3) evidence projection of the same
  // sources — in particular a v5 assessment authored under the unscoped whole-map projection.
  "competency_question_assessment_compact_projection:v6";
export const COMPETENCY_QUESTION_ASSESSMENT_PROMPT_CHAR_LIMIT = 50_000;
// Per-observation excerpt budget for the cited source-evidence bodies projected
// into the assessment prompt, so answer_status is judged on evidence content
// rather than observation-id labels alone.
// Per-observation excerpt budget on each cited evidence body, kept as a real pre-cap so one
// huge observation (e.g. a streaming spreadsheet) cannot eat the whole evidence reserve.
export const COMPETENCY_QUESTION_ASSESSMENT_EVIDENCE_EXCERPT_LIMIT = 4_000;
// Margin held back from the prompt cap when deriving the per-batch evidence reserve and when
// building batches, so the projection metadata that grows as evidence is added still fits.
export const COMPETENCY_QUESTION_ASSESSMENT_BATCH_BUILD_BUDGET_RESERVE_CHARS = 1000;

export function competencyQuestionAssessmentProjectionContract(): Record<string, unknown> {
  return {
    projection_kind: "competency_question_assessment_compact_projection",
    projection_contract_version:
      COMPETENCY_QUESTION_ASSESSMENT_PROJECTION_CONTRACT_VERSION,
    semantic_authority:
      "host_llm_assesses_answer_status_and_explanation_fields",
    prompt_char_limit: COMPETENCY_QUESTION_ASSESSMENT_PROMPT_CHAR_LIMIT,
    question_projection:
      "full question text is included without truncation; runtime keeps the full artifact authority",
    evidence_projection:
      "evidence_observation_ids and evidence_source_basenames are prompt-visible; full evidence_refs remain runtime authority",
    source_evidence_projection:
      "cited evidence observation bodies (from linked claim realizations, question evidence_refs, and domain competency semantic assessment evidence_refs) are projected as source_evidence, bounded greedily by serialized payload size to the per-batch evidence reserve, so answer_status is judged on content not id labels alone",
    // The per-observation excerpt budget and the evidence-reserve derivation are part of the
    // contract: tuning either changes the assessment prompt surface, so they rotate the
    // reuse-match sha.
    source_evidence_excerpt_char_limit:
      COMPETENCY_QUESTION_ASSESSMENT_EVIDENCE_EXCERPT_LIMIT,
    source_evidence_reserve_derivation:
      "per batch = prompt_char_limit − measured non-evidence payload (system prompt + questions + claim map + validation + policy, empty evidence) − build budget reserve, clamped >= 0; a budget stub (evidence_body_omitted_for_budget) carries no body and is counted as omitted",
    validation_projection:
      "validation status, counts, required evidence scope count, validation results, and invalid prompt-visible violations are prompt-visible",
    claim_realization_projection:
      "claim_id, stance, evidence observation ids, evidence source basenames, and compact rationale are prompt-visible, SCOPED to the batch's linked claims (union of the batch questions' linked_claim_ids); claim_realization_count retains the full map count and scoped_claim_realization_count surfaces the in-batch count, so a batch of zero-link (domain-competency) questions honestly shows an empty scoped list against the full count",
    runtime_derivations: [
      "required_seed_refs",
      "linked_claim_ids",
      "evidence_refs",
      "downstream_effect",
    ],
    batching_policy: {
      mode: "deterministic_prompt_budget",
      order: "canonical_competency_question_order",
      build_budget_reserve_chars:
        COMPETENCY_QUESTION_ASSESSMENT_BATCH_BUILD_BUDGET_RESERVE_CHARS,
      single_question_overflow: "fail_loud_before_dispatch",
    },
    fail_loud_policy:
      "runtime fails before provider dispatch when any final batch exceeds prompt_char_limit",
  };
}
