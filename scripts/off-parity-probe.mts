/**
 * OFF byte-parity oracle for the maturation answer-support dispatch.
 *
 * The claim "OFF is byte-identical" cannot be checked from one tree — a test written against the new
 * code can only re-derive it. So this script mentions NO opt-in flag and compiles in BOTH trees: run
 * it at the base commit and on the branch, and compare the digests it prints. It hashes the string
 * codex actually receives (system prompt + the "\n\n---\n\n" separator + user prompt), over THREE
 * corpora, because one corpus is not a parity proof:
 *   real_corpus          the real 59-observation fixture (59 < the 64 cap, so the slice never bites)
 *   scaled_past_cap      the same real rows replicated to 500 — exercises the slice
 *   regions_of_one_file  nine regions of ONE file — exercises the per-file region cap
 *
 *   git worktree add /tmp/base <base-commit> --detach
 *   ln -s "$PWD/node_modules" /tmp/base/node_modules
 *   cp scripts/off-parity-probe.mts /tmp/base/scripts/
 *   (cd /tmp/base && npx tsx scripts/off-parity-probe.mts)   # base
 *   npx tsx scripts/off-parity-probe.mts                     # branch
 *
 * Measured 2026-07-27 for stage 3a (design 20260726-observation-catalog-tool §9.3), base 23a00f3 —
 * all three digests identical in both trees:
 *   real_corpus          1,333,472 chars  8658b612d3cdecaf978d2d6898a37e3a147efd54e139fd59ab9377afdbf3d6fb
 *   scaled_past_cap      1,453,819 chars  2575c57f8651284c28b7fbfc27e83244cb4aa60c0c80a879b9bac05d1fb0a1de
 *   regions_of_one_file    112,153 chars  68ef3e47a205eefb39edcb7ead1054e17eaabc0f7f00b6987ab08aa79395e7df
 * Negative controls the same day, each naming the path it covers:
 *   slice 64 -> 63                          moves all three (the cap is also reported in the policy)
 *   region cap 8 -> 7                       moves regions_of_one_file ALONE
 *   region role tier removed                moves regions_of_one_file (the cap's RANKING)
 *   region line-start ranking reversed      moves regions_of_one_file
 *   codexCombinedPrompt separator changed   moves all three (transport assembly)
 * So an unchanged digest is evidence rather than insensitivity.
 *
 * (real_corpus is 1.33 M chars — OVER the worker's 1,048,576-char ceiling. The OFF path really does
 * overflow on this corpus; the parity claim is about not CHANGING that, not about it being healthy.)
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { createDirectCallReconstructDirectiveAuthor } from "../src/core-runtime/reconstruct/direct-call-directive-author.ts";
// The CANONICAL transport assembler, imported rather than reimplemented: a copied separator matches
// itself in both trees, so a change to production's assembly would leave the digests identical
// (cross-family review, third round). It exists at the base commit too, so the probe still compiles
// in both trees.
import { codexCombinedPrompt } from "../src/core-runtime/llm/llm-caller.ts";

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
let lastUserPrompt = "";
const SESSION_ID = String(artifact.session_id);
const CREATED_AT = String(artifact.created_at);


async function offDispatchDigest(observations: AnyRecord[]): Promise<{
  chars: number;
  sha256: string;
  rows: number;
  ids: number;
}> {
const dispatched: string[] = [];
const author = createDirectCallReconstructDirectiveAuthor({
  llmCall: (systemPrompt: string, userPrompt: string) => {
    dispatched.push(codexCombinedPrompt(systemPrompt, userPrompt));
    lastUserPrompt = userPrompt;
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
  sourceObservations: { ...artifact, observations },
});

  if (dispatched.length !== 1) throw new Error(`expected 1 dispatch, got ${dispatched.length}`);
  const combined = dispatched[0]!;
  const payload = JSON.parse(lastUserPrompt) as AnyRecord;
  return {
    chars: combined.length,
    sha256: crypto.createHash("sha256").update(combined, "utf8").digest("hex"),
    rows: (payload.source_observations as AnyRecord[]).length,
    ids: (payload.prompt_visible_observation_ids as string[]).length,
  };
}

/** Replicate the real rows so the >64 SLICE path is covered, with unique ids/refs. */
const scaled = (count: number): AnyRecord[] =>
  Array.from({ length: count }, (_, index) => {
    const source = observations[index % observations.length]!;
    const round = Math.floor(index / observations.length);
    return {
      ...source,
      observation_id: `${source.observation_id}-r${round}`,
      source_ref: `${source.source_ref}.r${round}`,
      location: `${source.location}.r${round}`,
    };
  });

/**
 * Nine regions of ONE file, so the per-file region cap path is covered — and shaped the way the
 * producer shapes regions (`region_role`, `region_line_start`, `region_line_end`), because the cap
 * RANKS by role tier then line start. Rows without those fields all tie at the fallback rank, which
 * left the ranking itself unexercised (cross-family review, third round). The declaration region is
 * deliberately LAST in artifact order, so a ranking change moves membership and the digest.
 */
const regionsOfOneFile = (count: number): AnyRecord[] => {
  const source = observations[0]!;
  return Array.from({ length: count }, (_, index) => ({
    ...source,
    observation_id: `${source.observation_id}-region-${index + 1}`,
    source_ref: source.source_ref,
    location: `L${index * 10}-${index * 10 + 9}`,
    structural_data: {
      ...(source.structural_data as AnyRecord),
      region_role: index === count - 1 ? "declaration" : "body",
      region_line_start: index * 10,
      region_line_end: index * 10 + 9,
    },
  }));
};

// Three arms, because one corpus is not a parity proof: the real corpus (59 < the 64 cap, so the
// slice never bites), a scaled one that DOES hit the slice, and a single file with more regions than
// the per-file cap. Changing the cap from 8 to 7, or the slice from 64 to 63, moves exactly one of
// these digests — a one-arm probe left both invisible (cross-family review, lens B #6).
console.log(JSON.stringify({
  real_corpus: await offDispatchDigest(observations),
  scaled_past_cap: await offDispatchDigest(scaled(500)),
  regions_of_one_file: await offDispatchDigest(regionsOfOneFile(9)),
}, null, 2));
