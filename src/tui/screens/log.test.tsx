import { describe, expect, it } from "vitest";
import { render } from "ink-testing-library";
import { LogScreen } from "./log.js";
import type { RuntimeStreamEvent } from "../../core-api/runtime-observation.js";

function event(
  partial: Pick<RuntimeStreamEvent, "timestamp" | "source" | "stream" | "message">,
): RuntimeStreamEvent {
  return {
    schema_version: 1,
    event_kind: "runtime_stream",
    pipeline: "review",
    session_id: "s",
    session_root: "/s",
    ...partial,
  };
}

const events: RuntimeStreamEvent[] = [
  event({
    timestamp: "2026-06-16T00:29:03+09:00",
    source: { kind: "onto_review", label: "onto_review", stageId: "start" },
    stream: "status",
    message: "review session starting",
  }),
  event({
    timestamp: "2026-06-16T00:29:28+09:00",
    source: { kind: "model", label: "codex", stageId: "lens" },
    stream: "model_call",
    message: "call model=gpt-5.5 effort=xhigh",
  }),
];

describe("LogScreen", () => {
  it("renders the event tail with clock time, source label, and message", () => {
    const { lastFrame } = render(<LogScreen sessionId="sess-1" events={events} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("onto watch · sess-1 · log");
    expect(frame).toContain("00:29:03");
    expect(frame).toContain("onto_review");
    expect(frame).toContain("review session starting");
    expect(frame).toContain("codex");
    expect(frame).toContain("call model=gpt-5.5 effort=xhigh");
  });

  it("shows an empty message when there are no events", () => {
    const { lastFrame } = render(<LogScreen sessionId="sess-1" events={[]} />);
    expect(lastFrame() ?? "").toContain("no events yet");
  });
});
