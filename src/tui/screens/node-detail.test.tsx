import { describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { NodeDetail } from "./node-detail.js";
import type { TreeNode } from "../view-model/tree-view-model.js";

const node: TreeNode = {
  id: "lens:coverage",
  label: "lens:coverage",
  status: "running",
  kind: "lens",
  signalAgeSec: 2,
  attempts: 2,
  outputPath: "/s/round1/coverage.findings.yaml",
};

describe("NodeDetail", () => {
  it("renders node metadata + output tail", () => {
    const { lastFrame } = render(
      <NodeDetail node={node} tail={["reading diff hunk 3/7", "candidate: missing forward"]} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("lens:coverage");
    expect(frame).toContain("status running");
    expect(frame).toContain("try2");
    expect(frame).toContain("/s/round1/coverage.findings.yaml");
    expect(frame).toContain("output (tail)");
    expect(frame).toContain("reading diff hunk 3/7");
  });

  it("renders a failure message and omits the tail section when empty", () => {
    const failed: TreeNode = {
      id: "lens:logic",
      label: "lens:logic",
      status: "failed",
      kind: "lens",
      failureMessage: "timeout 1200s",
    };
    const { lastFrame } = render(<NodeDetail node={failed} tail={[]} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("timeout 1200s");
    expect(frame).not.toContain("output (tail)");
  });
});
