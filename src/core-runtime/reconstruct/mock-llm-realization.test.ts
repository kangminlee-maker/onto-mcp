import { describe, expect, it } from "vitest";
import { callReconstructMockLlm } from "./mock-llm-realization.js";

const ANSWER_SUPPORT_SYSTEM_PROMPT = "Author answer-support-ledger.yaml.";

async function answerSupportClusters(userPayload: Record<string, unknown>) {
  const result = await callReconstructMockLlm(
    ANSWER_SUPPORT_SYSTEM_PROMPT,
    JSON.stringify(userPayload),
  );
  return (JSON.parse(result.text) as {
    evidence_clusters: Array<Record<string, unknown>>;
  }).evidence_clusters;
}

describe("Defect-3 answer-support mock conditional authoring", () => {
  it("returns no clusters when the frontier is empty (preserves existing completion runs)", async () => {
    const clusters = await answerSupportClusters({
      questions: [],
      prompt_visible_observation_ids: [],
    });
    expect(clusters).toEqual([]);
  });

  it("returns no clusters when there are questions but no prompt-visible observations", async () => {
    const clusters = await answerSupportClusters({
      questions: [{ question_id: "mq-1" }],
      prompt_visible_observation_ids: [],
    });
    expect(clusters).toEqual([]);
  });

  it("derives a direct_authority cluster from frontier questions + a prompt-visible observation", async () => {
    const clusters = await answerSupportClusters({
      questions: [{ question_id: "mq-1" }, { question_id: "mq-2" }],
      prompt_visible_observation_ids: ["obs_target_1", "obs_target_2"],
    });
    expect(clusters).toHaveLength(1);
    const cluster = clusters[0]!;
    // direct_authority (not runtime_proof) so proof_refs may stay empty (G4).
    expect(cluster.support_mode).toBe("direct_authority");
    expect(cluster.proof_refs).toEqual([]);
    // question_refs resolve to the supplied frontier question ids.
    expect(cluster.question_refs).toEqual(["mq-1", "mq-2"]);
    // evidence cites a prompt-visible observation (the bounded prompt contract).
    expect(cluster.evidence_observation_ids).toEqual(["obs_target_1"]);
  });
});
