import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { followRuntimeEvents } from "./event-follower.js";

const tmpDirs: string[] = [];

async function makeSession(lines: string[]): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "onto-events-"));
  await fs.writeFile(
    path.join(dir, "runtime-events.ndjson"),
    lines.join("\n") + "\n",
    "utf8",
  );
  tmpDirs.push(dir);
  return dir;
}

function evLine(n: number, pad = 0): string {
  return JSON.stringify({ event_kind: "runtime_stream", n, pad: "x".repeat(pad) });
}

afterAll(async () => {
  for (const dir of tmpDirs) await fs.rm(dir, { recursive: true, force: true });
});

describe("followRuntimeEvents", () => {
  it("emits the whole backlog for a small log", async () => {
    const root = await makeSession([evLine(0), evLine(1), evLine(2)]);
    const controller = new AbortController();
    const got: Array<{ n: number }> = [];
    for await (const ev of followRuntimeEvents(root, {
      signal: controller.signal,
      pollMs: 5,
    })) {
      got.push(ev as unknown as { n: number });
      if ((ev as unknown as { n: number }).n === 2) controller.abort();
    }
    expect(got.map((e) => e.n)).toEqual([0, 1, 2]);
  });

  it("emits only a bounded tail of a large backlog, never a corrupted partial line", async () => {
    // 60 events of ~200 bytes each (~12KB); a 2KB cap must yield only the tail.
    const lines = Array.from({ length: 60 }, (_, i) => evLine(i, 180));
    const root = await makeSession(lines);
    const controller = new AbortController();
    const got: Array<{ n: number; event_kind: string }> = [];
    for await (const ev of followRuntimeEvents(root, {
      signal: controller.signal,
      backlogBytesCap: 2048,
      pollMs: 5,
    })) {
      got.push(ev as unknown as { n: number; event_kind: string });
      if ((ev as unknown as { n: number }).n === 59) controller.abort();
    }
    // bounded: a tail subset, not all 60
    expect(got.length).toBeGreaterThan(0);
    expect(got.length).toBeLessThan(60);
    // reached the final event
    expect(got.at(-1)!.n).toBe(59);
    // the first emitted event is a COMPLETE parsed event — the partial leading
    // line at the cap boundary was dropped, not yielded as a corrupt fragment.
    expect(got[0]!.event_kind).toBe("runtime_stream");
    expect(Number.isInteger(got[0]!.n)).toBe(true);
  });
});
