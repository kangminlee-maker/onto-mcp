import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendRuntimeModelCallLogFromCurrentContext,
  appendRuntimeStreamChunkSync,
  runWithRuntimeObservationContext,
  runtimeStreamEventLogPath,
} from "./runtime-stream-observation.js";

const tempRoots: string[] = [];

function mkSessionRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "onto-runtime-stream-"));
  tempRoots.push(root);
  return path.join(root, ".onto", "review", "session-1");
}

function readEvents(sessionRoot: string): unknown[] {
  return fs.readFileSync(runtimeStreamEventLogPath(sessionRoot), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as unknown);
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("runtime stream observation", () => {
  it("writes source-tagged stdout/stderr chunks as ndjson events", () => {
    const sessionRoot = mkSessionRoot();
    appendRuntimeStreamChunkSync(
      {
        pipeline: "review",
        sessionRoot,
        source: {
          kind: "process",
          label: "lens:logic",
          unitId: "logic",
          processId: 123,
        },
        stream: "stderr",
      },
      "first line\nsecond line\n",
    );

    const events = readEvents(sessionRoot) as Array<Record<string, unknown>>;
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      schema_version: 1,
      event_kind: "runtime_stream",
      pipeline: "review",
      session_id: "session-1",
      source: {
        kind: "process",
        label: "lens:logic",
        unitId: "logic",
        processId: 123,
      },
      stream: "stderr",
      message: "first line",
    });
    expect(events[1]).toMatchObject({
      stream: "stderr",
      message: "second line",
    });
  });

  it("mirrors model-call logs into the active runtime observation context", () => {
    const sessionRoot = mkSessionRoot();
    runWithRuntimeObservationContext(
      {
        pipeline: "reconstruct",
        sessionRoot,
        source: {
          kind: "llm",
          label: "reconstruct",
          stageId: "seed_candidate",
        },
      },
      () => appendRuntimeModelCallLogFromCurrentContext("openai call: model=\"x\""),
    );

    const events = readEvents(sessionRoot) as Array<Record<string, unknown>>;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      pipeline: "reconstruct",
      source: {
        kind: "llm",
        label: "reconstruct",
        stageId: "seed_candidate",
      },
      stream: "stderr",
      message: "[model-call] openai call: model=\"x\"",
    });
  });
});
