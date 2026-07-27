import { describe, expect, it } from "vitest";
import { createDirectCallReconstructDirectiveAuthor } from "./direct-call-directive-author.js";

// Spec basis: design 20260726-observation-catalog-tool §3 (`인용 ⊆ 조회 ⊆ 스냅샷`), stage 3b. Under the
// `source_observation_catalog_tool` opt-in a claim's supporting evidence resolves against the
// observations its OWN cited clusters carry, not against every approved observation.
//
// GATED on that opt-in on purpose. The mismatch below exists with the flag off too, but narrowing there
// would change a default-path contract that the canonical maturation design does not require and no
// validator enforces; the ON/OFF contrast arm holds that line.
//
// Why this is not merely a validation preference: the claims payload gives the model its evidence
// clusters and NO observation catalog, so the set it could NAME was strictly wider than the set it
// could SEE. Under the pull layer the gap is worse than a guess — an id outside the clusters is content
// no dispatch ever fetched, which the ledger surface already refuses one artifact upstream.

const SESSION_ID = "answer-claims-boundary-fixture";

function observation(id: string) {
  return {
    observation_id: id,
    source_ref: `/corpus/${id}.ts`,
    location: `/corpus/${id}.ts`,
    target_material_kind: "code" as const,
    observed_at: "2026-07-27T00:00:00.000Z",
    content_excerpt: `body of ${id}`,
    observation_kind: "content" as const,
  };
}

function evidenceRef(id: string) {
  return {
    observation_id: id,
    target_material_kind: "code" as const,
    source_ref: `/corpus/${id}.ts`,
    location: `/corpus/${id}.ts`,
  };
}

/** Two clusters; the corpus holds a third observation that NO cluster cites. */
const IN_CLUSTER = "obs_in_cluster";
const OTHER_CLUSTER = "obs_other_cluster";
const OUTSIDE = "obs_approved_but_uncited";

const answerSupportLedger = {
  schema_version: "1",
  session_id: SESSION_ID,
  created_at: "2026-07-27T00:00:00.000Z",
  round_id: "maturation-round-1",
  evidence_clusters: [
    {
      evidence_cluster_id: "cluster-a",
      question_refs: ["q-1"],
      support_mode: "direct_authority",
      proposed_answer_summary: "A supports it.",
      evidence_refs: [evidenceRef(IN_CLUSTER)],
      proof_refs: [],
      user_confirmation_refs: [],
      authority_response_refs: [],
      independence_basis: "fixture",
      contradiction_refs: [],
      limitation_refs: [],
    },
    {
      evidence_cluster_id: "cluster-b",
      question_refs: ["q-1"],
      support_mode: "direct_authority",
      proposed_answer_summary: "B supports it.",
      evidence_refs: [evidenceRef(OTHER_CLUSTER)],
      proof_refs: [],
      user_confirmation_refs: [],
      authority_response_refs: [],
      independence_basis: "fixture",
      contradiction_refs: [],
      limitation_refs: [],
    },
  ],
  directive_author: { owner: "host_llm", author_id: "fixture" },
};

// Every observation is APPROVED for prompt use — the boundary under test is the cluster boundary, not
// the consumption gate. If this artifact were already narrow the test would prove nothing.
const sourceObservations = {
  schema_version: "1",
  session_id: SESSION_ID,
  created_at: "2026-07-27T00:00:00.000Z",
  observations: [observation(IN_CLUSTER), observation(OTHER_CLUSTER), observation(OUTSIDE)],
};

function authorClaiming(
  options: { clusters: string[]; support: string[]; catalogTool?: boolean },
) {
  return createDirectCallReconstructDirectiveAuthor({
    sourceObservationCatalogTool: options.catalogTool !== false,
    llmCall: () =>
      Promise.resolve({
        text: JSON.stringify({
          answer_claims: [{
            answer_claim_id: "claim-1",
            question_id: "q-1",
            answer: "The answer.",
            answer_status: "answered",
            support_mode: "direct_authority",
            evidence_cluster_refs: options.clusters,
            supporting_evidence_observation_ids: options.support,
            target_surface_refs: [],
            target_dimension_refs: [],
            purpose_element_refs: [],
            limitation_refs: [],
          }],
        }),
      }),
  } as never);
}

function claimsInput() {
  return {
    sessionId: SESSION_ID,
    roundId: "maturation-round-1",
    maturationQuestionFrontier: { questions: [{ question_id: "q-1" }] },
    maturationQuestionFrontierValidation: { validation_status: "valid" },
    answerSupportLedger,
    answerSupportLedgerValidation: { validation_status: "valid" },
    sourceObservations,
  } as never;
}

describe("answer claims — supporting evidence is bounded by the clusters the claim cites", () => {
  it("admits supporting evidence drawn from the cited clusters", async () => {
    const author = authorClaiming({ clusters: ["cluster-a"], support: [IN_CLUSTER] });
    const claims = await (author as any).writeMaturationAnswerClaims(claimsInput());
    expect(claims.answer_claims[0].supporting_evidence_refs.map((r: any) => r.observation_id))
      .toEqual([IN_CLUSTER]);
  });

  it("rejects an approved observation that no cited cluster carries", async () => {
    // OUTSIDE is in the approved observation set — the OLD resolution set — so this arm fails only
    // because the boundary narrowed to the cited clusters.
    const author = authorClaiming({ clusters: ["cluster-a"], support: [OUTSIDE] });
    await expect((author as any).writeMaturationAnswerClaims(claimsInput())).rejects.toThrow(
      /outside the evidence clusters it cites/,
    );
  });

  it("rejects an observation carried only by a cluster this claim did NOT cite", async () => {
    // The sharpest arm: OTHER_CLUSTER is cited by the ledger, just not by THIS claim. A boundary drawn
    // at "anything the ledger touched" would admit it; the boundary drawn per claim does not.
    const author = authorClaiming({ clusters: ["cluster-a"], support: [OTHER_CLUSTER] });
    await expect((author as any).writeMaturationAnswerClaims(claimsInput())).rejects.toThrow(
      /outside the evidence clusters it cites/,
    );
    // Contrast (non-vacuous): citing that cluster makes the very same id admissible.
    const citing = authorClaiming({
      clusters: ["cluster-a", "cluster-b"],
      support: [OTHER_CLUSTER],
    });
    const claims = await (citing as any).writeMaturationAnswerClaims(claimsInput());
    expect(claims.answer_claims[0].supporting_evidence_refs[0].observation_id).toBe(OTHER_CLUSTER);
  });

  it("rejects a MIXED list rather than keeping the part that resolves", async () => {
    // The resolver drops unknown ids whenever at least one resolves, so narrowing alone turned a
    // partly-outside citation into a silently shortened one: the claim survives with materially
    // different evidence and the validator sees only the altered list. Design §8 — the runtime rejects
    // a citation, it does not repair it.
    const author = authorClaiming({ clusters: ["cluster-a"], support: [IN_CLUSTER, OUTSIDE] });
    await expect((author as any).writeMaturationAnswerClaims(claimsInput())).rejects.toThrow(
      /outside the evidence clusters it cites/,
    );
  });

  it("leaves the boundary untouched when the catalog-tool opt-in is off", async () => {
    // The default path must keep the previous resolution set exactly: the same citation that the ON
    // arms reject is authored without complaint here. Without this contrast the suite would have
    // locked in a silent behaviour change to every run that never enabled the opt-in.
    const author = authorClaiming({
      clusters: ["cluster-a"],
      support: [IN_CLUSTER, OUTSIDE],
      catalogTool: false,
    });
    const claims = await (author as any).writeMaturationAnswerClaims(claimsInput());
    expect(claims.answer_claims[0].supporting_evidence_refs.map((r: any) => r.observation_id))
      .toEqual([IN_CLUSTER, OUTSIDE]);
  });

  it("does not let an unresolvable cluster ref widen the boundary", async () => {
    // A ref that matches no cluster contributes no observations. Treating it as "unknown, so allow
    // everything" would turn a validation failure into a permission.
    const author = authorClaiming({ clusters: ["cluster-does-not-exist"], support: [IN_CLUSTER] });
    await expect((author as any).writeMaturationAnswerClaims(claimsInput())).rejects.toThrow(
      /outside the evidence clusters it cites/,
    );
  });
});
