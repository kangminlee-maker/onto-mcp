import { describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { SessionSelector } from "./session-selector.js";
import type { SessionRef } from "../data/session-discovery.js";

const NOW = 1_000_000_000_000;
const sessions: SessionRef[] = [
  { pipeline: "review", sessionId: "20260616-62411f81", sessionRoot: "/s/review/a", modifiedMs: NOW - 2000 },
  { pipeline: "reconstruct", sessionId: "judge-conv-run", sessionRoot: "/s/reconstruct/b", modifiedMs: NOW - 120_000 },
];

describe("SessionSelector", () => {
  it("lists sessions with the cursor on the selected row and relative ages", () => {
    const { lastFrame } = render(
      <SessionSelector sessions={sessions} selectedIndex={1} nowMs={NOW} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("onto watch · sessions");
    expect(frame).toContain("review");
    expect(frame).toContain("20260616-62411f81");
    expect(frame).toContain("reconstruct");
    expect(frame).toContain("judge-conv-run");
    expect(frame).toContain("2s ago");
    expect(frame).toContain("2m ago");
    // cursor marker precedes the selected (index 1) row's pipeline.
    expect(frame).toMatch(/›\s+reconstruct/);
  });

  it("shows an empty message when there are no sessions", () => {
    const { lastFrame } = render(
      <SessionSelector sessions={[]} selectedIndex={0} nowMs={NOW} />,
    );
    expect(lastFrame() ?? "").toContain("no review/reconstruct sessions found");
  });
});
