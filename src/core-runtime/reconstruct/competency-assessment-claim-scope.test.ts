import { describe, expect, it } from "vitest";
import type { ReconstructClaimRealizationMapArtifact } from "./artifact-types.js";
import {
  compactClaimRealizationMapForAssessmentPrompt,
} from "./authoring-prompt-payloads.js";

function claimRealizationMap(): ReconstructClaimRealizationMapArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: "2026-06-02T00:00:00.000Z",
    ontology_seed_ref: "ontology-seed.yaml",
    claim_realizations: ["claim-a", "claim-b", "claim-c"].map((claim_id) => ({
      claim_id,
      stance: "observed_runtime_behavior" as const,
      evidence_refs: [],
      rationale: `rationale for ${claim_id}`,
    })),
    directive_author: { owner: "host_llm", author_id: "test-author" },
  };
}

type ScopedMap = {
  claim_realization_count: number;
  scoped_claim_realization_count: number;
  claim_realization_scope: string;
  claim_realizations: Array<{ claim_id: string }>;
};

describe("Defect (CQ-assessment v6): claim_realization_map is scoped to the batch's linked claims", () => {
  it("filters claim_realizations to the linked claim ids while retaining the full count", () => {
    const scoped = compactClaimRealizationMapForAssessmentPrompt(
      claimRealizationMap(),
      new Set(["claim-a", "claim-c"]),
    ) as ScopedMap;

    expect(scoped.claim_realization_count).toBe(3); // honest full count
    expect(scoped.scoped_claim_realization_count).toBe(2);
    expect(scoped.claim_realization_scope).toBe("batch_linked_claims");
    expect(scoped.claim_realizations.map((r) => r.claim_id)).toEqual([
      "claim-a",
      "claim-c",
    ]);
  });

  it("yields an empty scoped list for a pure zero-link (domain-competency) batch, full count retained", () => {
    // The dominant runtime path: domain-competency questions carry no linked_claim_ids,
    // so a pure-domain batch scopes to an empty claim map (those questions are judged on
    // their own evidence). The full count stays honest; scoped count is 0.
    const scoped = compactClaimRealizationMapForAssessmentPrompt(
      claimRealizationMap(),
      new Set<string>(),
    ) as ScopedMap;

    expect(scoped.claim_realizations).toEqual([]);
    expect(scoped.scoped_claim_realization_count).toBe(0);
    expect(scoped.claim_realization_count).toBe(3);
  });
});
