import { describe, expect, it } from "vitest";
import { parseRuntimeIssueStanceSchemaContext } from "./runtime-submit-context.js";

/** Packet fixture mirroring the live projection shape (see
 * worker-structured-output.test.ts): two issues, each owning one finding of
 * the requested lens, plus one graph relation touching issue-001's finding. */
function stancePacket(): string {
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
    evidence_refs: []
    surface_finding_ids:
      - finding-001
    relation_refs: []
  - issue_id: issue-002
    evidence_refs: []
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
relation_summaries:
  - relation_id: rel-007
    from_finding_id: finding-001
    to_finding_id: finding-002
singleton_findings: []
issue_dependencies: []
\`\`\`
`;
}

describe("parseRuntimeIssueStanceSchemaContext (on-disk parity policy)", () => {
  const context = parseRuntimeIssueStanceSchemaContext(stancePacket());
  const issue1 = new Set(context.issue_evidence_refs["issue-001"]);
  const issue2 = new Set(context.issue_evidence_refs["issue-002"]);

  it("parses a non-vacuous per-issue allowed set", () => {
    expect(issue1.size).toBeGreaterThan(0);
    expect(issue2.size).toBeGreaterThan(0);
  });

  it("keeps finding-ledger anchors issue-strict (no cross-issue union)", () => {
    expect(issue1.has("finding-ledger.yaml#finding-001")).toBe(true);
    // negative control: the OTHER issue's finding anchor must be absent —
    // the on-disk validator rejects it, so submit must too.
    expect(issue1.has("finding-ledger.yaml#finding-002")).toBe(false);
    expect(issue2.has("finding-ledger.yaml#finding-001")).toBe(false);
  });

  it("still unions the lens's RAW finding evidence refs across issues (on-disk parity)", () => {
    const raw2 = ".onto/review/session-001/round1/logic.findings.yaml#logic-candidate-002";
    expect(issue1.has(raw2)).toBe(true);
  });

  it("accepts the bare graph-endpoint relation id (rel-007 class)", () => {
    // rel-007 touches finding-001 (issue-001) and finding-002 (issue-002):
    // both issues get the bare id AND the anchored variants.
    for (const refs of [issue1, issue2]) {
      expect(refs.has("rel-007")).toBe(true);
      expect(refs.has("finding-relation-graph.yaml#rel-007")).toBe(true);
    }
  });
});
