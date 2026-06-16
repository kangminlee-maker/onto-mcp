import { describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { WorkflowTree } from "./workflow-tree.js";
import type { TreeViewModel } from "../view-model/tree-view-model.js";

const reviewVm: TreeViewModel = {
  pipeline: "review",
  sessionId: "20260616-62411f81",
  sessionRoot: "/s/review/20260616-62411f81",
  status: "running",
  headline: "route codex/gpt-5.5",
  narrator: "isolated lens execution — 3 running",
  liveness: { state: "running_recent_signal", secondsSinceSignal: 1, pollMs: 2000 },
  phases: [
    {
      id: "manifest_validation",
      label: "manifest validation",
      state: "completed",
      nodes: [],
    },
    {
      id: "isolated_lens_execution",
      label: "isolated lens execution",
      state: "running",
      nodes: [
        { id: "axiology", label: "lens:axiology", status: "running", kind: "lens", signalAgeSec: 1, attempts: 1 },
        { id: "logic", label: "lens:logic", status: "pending", kind: "lens" },
      ],
    },
  ],
  summary: {
    findings: { blocker: 0, high: 0, medium: 1, low: 0, info: 0, material: ["issue-001 MCP host path missing"] },
  },
  runControl: { cancellable: true, continuable: false },
};

const reconstructVm: TreeViewModel = {
  pipeline: "reconstruct",
  sessionId: "judge-conv-run",
  sessionRoot: "/s/reconstruct/judge-conv-run",
  status: "running",
  narrator: "maturation round 1 — answer-support ledger",
  liveness: { state: "running", secondsSinceSignal: null, pollMs: 1500 },
  phases: [
    {
      id: "pipeline",
      label: "pipeline",
      state: "running",
      nodes: [
        { id: "ontology_seed", label: "ontology seed", status: "completed", kind: "ontology_seed", owner: "host_llm" },
        { id: "answer_support_ledger", label: "answer-support ledger", status: "running", kind: "answer_support_ledger", owner: "host_llm" },
      ],
    },
  ],
  summary: { counts: { CQ: 7, supported: 0, deferred: 7 } },
  runControl: { cancellable: true, continuable: false },
};

describe("WorkflowTree HUD", () => {
  it("renders a review session: header, narrator, lens nodes, finding severity footer", () => {
    const { lastFrame } = render(<WorkflowTree vm={reviewVm} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("review · 20260616-62411f81");
    expect(frame).toContain("running");
    expect(frame).toContain("isolated lens execution — 3 running");
    expect(frame).toContain("lens:axiology");
    expect(frame).toContain("Findings");
    expect(frame).toContain("⬤1 med");
    expect(frame).toContain("issue-001 MCP host path missing");
  });

  it("renders a reconstruct session with stages + a coverage (counts) footer", () => {
    const { lastFrame } = render(<WorkflowTree vm={reconstructVm} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("reconstruct · judge-conv-run");
    expect(frame).toContain("answer-support ledger");
    expect(frame).toContain("ontology seed");
    expect(frame).toContain("Coverage");
    expect(frame).toContain("CQ 7");
    expect(frame).not.toContain("Findings");
  });
});
