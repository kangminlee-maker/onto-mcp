import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildWorkerSubmitSchema,
  writeRuntimeSubmitArtifactFromPayload,
} from "./worker-structured-output.js";

let tmp: string | null = null;

afterEach(async () => {
  if (tmp) await fs.rm(tmp, { recursive: true, force: true });
  tmp = null;
});

function issueStancePacket(): string {
  return `# Issue Stance Response Prompt

requested_lens_id: logic

## Lens Source Refs
- .onto/review/session-001/round1/logic.findings.yaml

## Runtime Issue Stance Input Projection
\`\`\`yaml
source_artifact_refs:
  finding_ledger: .onto/review/session-001/finding-ledger.yaml
  finding_relation_graph: .onto/review/session-001/finding-relation-graph.yaml
  issue_ledger: .onto/review/session-001/issue-ledger.yaml
issues:
  - issue_id: issue-001
    evidence_refs:
      - .onto/review/session-001/round1/logic.findings.yaml#logic-candidate-001
    surface_finding_ids:
      - finding-001
    relation_refs: []
  - issue_id: issue-002
    evidence_refs:
      - .onto/review/session-001/round1/logic.findings.yaml#logic-candidate-002
    surface_finding_ids:
      - finding-002
    relation_refs: []
finding_summaries:
  - finding_id: finding-001
    lens_id: logic
    evidence_refs:
      - .onto/review/session-001/round1/logic.findings.yaml#logic-candidate-001
  - finding_id: finding-002
    lens_id: logic
    evidence_refs:
      - .onto/review/session-001/round1/logic.findings.yaml#logic-candidate-002
relation_summaries: []
singleton_findings: []
issue_dependencies: []
\`\`\`
`;
}

describe("worker structured output schema", () => {
  it("collapses issue-stance anyOf rows for provider schemas while preserving submit validation", async () => {
    const { schema, state } = buildWorkerSubmitSchema({
      outputFormat: "issue-stance-response",
      unitId: "issue-stance:logic",
      sessionId: "session-001",
      rawPacketText: issueStancePacket(),
    });

    const workerSchema = schema as {
      properties: {
        stances: {
          items: {
            anyOf?: unknown;
            properties: { issue_id: { enum: string[] } };
          };
        };
      };
    };

    expect(workerSchema.properties.stances.items.anyOf).toBeUndefined();
    expect(workerSchema.properties.stances.items.properties.issue_id.enum).toEqual([
      "issue-001",
      "issue-002",
    ]);

    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "onto-worker-schema-"));
    await expect(
      writeRuntimeSubmitArtifactFromPayload({
        payload: {
          stances: [
            {
              issue_id: "issue-999",
              stance: "support",
              rationale: "Unsupported issue id remains a runtime validation failure.",
              root_hypothesis_position: "accepts",
              severity_position: "keeps",
              evidence_refs: [],
            },
          ],
        },
        outputPath: path.join(tmp, "stance.yaml"),
        state: state.runtimeSubmitState,
      }),
    ).rejects.toThrow(/issue_id is not in the runtime issue projection/);
  });
});
