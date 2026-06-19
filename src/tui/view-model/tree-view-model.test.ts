import { describe, expect, it } from "vitest";
import { isTerminalStatus, type WorkflowStatus } from "./tree-view-model.js";

describe("isTerminalStatus", () => {
  it("treats completed, failed, and halted as terminal (stop polling)", () => {
    const terminal: WorkflowStatus[] = ["completed", "failed", "halted"];
    for (const status of terminal) expect(isTerminalStatus(status)).toBe(true);
  });

  it("treats a running workflow as non-terminal (keep polling)", () => {
    expect(isTerminalStatus("running")).toBe(false);
  });
});
