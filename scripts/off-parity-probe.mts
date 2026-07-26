/**
 * OFF byte-parity oracle for the maturation answer-support dispatch.
 *
 * The claim "OFF is byte-identical" cannot be checked from one tree — a test written against the new
 * code can only re-derive it. So this script mentions NO opt-in flag and compiles in BOTH trees: run
 * it at the base commit and on the branch, and compare the sha256 it prints for the payload the OFF
 * path dispatches over the real 59-observation corpus (scripts/fixtures/observation-catalog/).
 *
 *   git worktree add /tmp/base <base-commit> --detach
 *   ln -s "$PWD/node_modules" /tmp/base/node_modules
 *   cp scripts/off-parity-probe.mts /tmp/base/scripts/
 *   (cd /tmp/base && npx tsx scripts/off-parity-probe.mts)   # base
 *   npx tsx scripts/off-parity-probe.mts                     # branch
 *
 * Measured 2026-07-27 for stage 3a (design 20260726-observation-catalog-tool §9.3), base 23a00f3:
 *   both trees -> 1,331,365 chars, sha256 bebb095a9852cbcc4834bea7610bdc2bf9631a2a32f0bd30d7a72e3382d6cfca
 * Negative control run the same day: swapping two adjacent payload keys flips the digest to
 * eee936a4..., so an unchanged digest is evidence rather than insensitivity.
 *
 * (That payload is 1.33 M chars — OVER the worker's 1,048,576-char ceiling. The OFF path really does
 * overflow on this corpus; the parity claim is about not CHANGING that, not about it being healthy.)
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { createDirectCallReconstructDirectiveAuthor } from "../src/core-runtime/reconstruct/direct-call-directive-author.ts";

type AnyRecord = Record<string, any>;
const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const artifact = parseYaml(
  await fs.readFile(
    path.join(REPO_ROOT, "scripts/fixtures/observation-catalog/source-observations.yaml"),
    "utf8",
  ),
) as AnyRecord;
const observations = artifact.observations as AnyRecord[];
if (!Array.isArray(observations) || observations.length === 0) {
  throw new Error("fixture empty — the comparison would be vacuous");
}
const SESSION_ID = String(artifact.session_id);
const CREATED_AT = String(artifact.created_at);

const dispatched: string[] = [];
const author = createDirectCallReconstructDirectiveAuthor({
  llmCall: (_systemPrompt: string, userPrompt: string) => {
    dispatched.push(userPrompt);
    return Promise.resolve({ text: JSON.stringify({ evidence_clusters: [] }) });
  },
} as never);

await (author as AnyRecord).writeAnswerSupportLedger({
  sessionId: SESSION_ID,
  roundId: "maturation-round-1",
  maturationQuestionFrontier: {
    schema_version: "1",
    session_id: SESSION_ID,
    created_at: CREATED_AT,
    maturation_baseline_ref: "maturation-baseline.yaml",
    maturation_baseline_validation_ref: "maturation-baseline-validation.yaml",
    actionability_matrix_ref: "baseline-actionability-matrix.yaml",
    actionability_matrix_validation_ref: "baseline-actionability-matrix-validation.yaml",
    questions: [{
      question_id: "q-parity",
      question: "Parity probe question?",
      materiality: "blocker",
      materiality_ref: "matrix-row-parity",
      actionability_surface_refs: ["dynamic_surface"],
      maturity_dimension_refs: ["evidence"],
      purpose_element_refs: ["purpose-parity"],
      baseline_row_refs: ["baseline-parity"],
      competency_question_refs: [],
      competency_assessment_refs: [],
      domain_competency_trace_refs: [],
      seed_ref_refs: ["object-parity"],
      current_answer_status: "unsupported",
      expected_answer_kind: "explanation",
      evidence_needed: "Parity evidence.",
      authority_need: {
        authority_kind: "none",
        authority_scope: null,
        blocking_if_unavailable: true,
        expected_response_kind: "unavailable_reason",
      },
      closure_frontier_hint_refs: [],
      limitation_refs: [],
    }],
    directive_author: { owner: "host_llm", author_id: "parity" },
  },
  maturationQuestionFrontierRef: "maturation-question-frontier.yaml",
  maturationQuestionFrontierValidation: {
    schema_version: "1",
    session_id: SESSION_ID,
    created_at: CREATED_AT,
    maturation_question_frontier_ref: "maturation-question-frontier.yaml",
    maturation_baseline_validation_ref: "maturation-baseline-validation.yaml",
    actionability_matrix_validation_ref: "baseline-actionability-matrix-validation.yaml",
    validation_status: "valid",
    question_count: 1,
    material_frontier_question_count: 1,
    validation_results: [],
    violations: [],
  },
  maturationClosureFrontier: {
    schema_version: "1",
    session_id: SESSION_ID,
    created_at: CREATED_AT,
    round_id: "maturation-round-1",
    question_frontier_ref: "maturation-question-frontier.yaml",
    source_requests: [{
      source_request_id: "source-request-parity",
      question_refs: ["q-parity"],
      member_scope_refs: [],
      member_source_refs: [],
      cross_material_ref_refs: [],
      requested_source_ref: String(observations[0]!.source_ref),
      requested_location: String(observations[0]!.source_ref),
      target_material_kind: "code",
      expected_evidence_kind: "parity source",
      reason: "Parity probe.",
    }],
    authority_requests: [],
    directive_author: { owner: "host_llm", author_id: "parity" },
  },
  maturationClosureFrontierValidation: {
    schema_version: "1",
    session_id: SESSION_ID,
    created_at: CREATED_AT,
    maturation_closure_frontier_ref: "maturation-closure-frontier.yaml",
    maturation_question_frontier_validation_ref: "maturation-question-frontier-validation.yaml",
    source_inventory_ref: "source-inventory.yaml",
    source_observations_ref: "source-observations.yaml",
    validation_status: "valid",
    source_request_count: 1,
    authority_request_count: 0,
    accepted_source_request_ids: ["source-request-parity"],
    rejected_source_requests: [],
    validation_results: [],
    asserted_obligation_ids: [],
    violations: [],
  },
  maturationAuthorityResponse: {
    schema_version: "1",
    session_id: SESSION_ID,
    created_at: CREATED_AT,
    closure_frontier_ref: "maturation-closure-frontier.yaml",
    responses: [],
  },
  maturationAuthorityResponseValidation: {
    schema_version: "1",
    session_id: SESSION_ID,
    created_at: CREATED_AT,
    maturation_authority_response_ref: "maturation-authority-response.yaml",
    maturation_closure_frontier_validation_ref: "maturation-closure-frontier-validation.yaml",
    validation_status: "valid",
    response_count: 0,
    provided_response_count: 0,
    unavailable_response_count: 0,
    validation_results: [],
    violations: [],
  },
  sourceObservations: artifact,
});

if (dispatched.length !== 1) throw new Error(`expected 1 dispatch, got ${dispatched.length}`);
const userPrompt = dispatched[0]!;
console.log(JSON.stringify({
  chars: userPrompt.length,
  sha256: crypto.createHash("sha256").update(userPrompt, "utf8").digest("hex"),
  observation_rows: (JSON.parse(userPrompt) as AnyRecord).source_observations.length,
}));
