import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  type CodexRolloutExpectations,
  readCodexRollout,
} from "./codex-rollout-reader.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const FIXTURE_DIR = path.join(REPO_ROOT, "scripts/fixtures/codex-rollout");

/**
 * The three REAL transcripts, and the phase each one carries. See the fixture directory's
 * PROVENANCE.md; the counts below are measured, and asserting them is what keeps this suite from
 * concluding anything about a corpus that quietly changed shape.
 */
const FIXTURES = {
  multiCallOneOutput: {
    id: "019fa332-ae9e-75b1-ba34-3cd43e25952e",
    sent: 4,
    received: 2,
    truncated: 1,
  },
  multiCallStoredThenLoaded: {
    id: "019fa334-7926-78d0-8082-67624edfdeb1",
    sent: 4,
    received: 3,
    truncated: 0,
  },
  singleCall: {
    id: "019fa33f-3382-7b00-8d5a-ce8e9e7be00d",
    sent: 1,
    received: 2,
    truncated: 1,
  },
} as const;

function transcriptOf(id: string): string {
  return readFileSync(path.join(FIXTURE_DIR, `${id}.jsonl`), "utf8");
}

function expectationsFor(id: string): CodexRolloutExpectations {
  return {
    sessionId: id,
    cwd: "/Users/kangmin/Documents/onto-mcp",
    verifiedCliVersions: ["0.145.0"],
    // The measured transcripts are stamped 2026-07-27; a window around that day stands in for the
    // child's lifetime, which the runtime supplies for real.
    childWindow: {
      startedAtMs: Date.parse("2026-07-27T00:00:00.000Z"),
      endedAtMs: Date.parse("2026-07-28T00:00:00.000Z"),
    },
  };
}

describe("codex rollout reader — real transcripts", () => {
  it.each(Object.entries(FIXTURES))(
    "selects the sent and received records of %s",
    (_name, fixture) => {
      const outcome = readCodexRollout(transcriptOf(fixture.id), expectationsFor(fixture.id));
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;

      expect(outcome.meta.session_id).toBe(fixture.id);
      expect(outcome.meta.cli_version).toBe("0.145.0");
      expect(outcome.sent).toHaveLength(fixture.sent);
      expect(outcome.received).toHaveLength(fixture.received);
      expect(outcome.received.filter((record) => record.truncated)).toHaveLength(fixture.truncated);

      // Both record kinds carry real payloads, and the two id spaces are disjoint — which is why the
      // reader offers no pairing (§9-F1).
      for (const record of outcome.sent) {
        expect(record.call_id).toMatch(/^exec-/);
        expect(record.server).toBe("probe");
        expect(record.is_error).toBe(false);
        expect(record.text!.length).toBeGreaterThan(0);
      }
      for (const record of outcome.received) {
        expect(record.call_id).toMatch(/^call_/);
      }
      const sentIds = new Set(outcome.sent.map((record) => record.call_id));
      expect(outcome.received.some((record) => sentIds.has(record.call_id))).toBe(false);
    },
  );

  it("counts sent and received differently — L1 cannot be a naive count comparison", () => {
    // An exec that calls no tool still produces a received record, so whole-transcript equality is
    // wrong in every one of the three real transcripts.
    for (const fixture of Object.values(FIXTURES)) {
      expect(fixture.sent, fixture.id).not.toBe(fixture.received);
    }
  });

  it("carries the phase reviewer F1 predicted: four sent, one MCP-bearing output", () => {
    const fixture = FIXTURES.multiCallOneOutput;
    const outcome = readCodexRollout(transcriptOf(fixture.id), expectationsFor(fixture.id));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.sent).toHaveLength(4);
    // Exactly one received record actually carries the four payloads; ordinal pairing would map
    // sent[1..3] onto records that do not exist.
    const carrying = outcome.received.filter((record) => record.text.includes("the quick brown fox"));
    expect(carrying).toHaveLength(1);
    expect(carrying[0]!.truncated).toBe(true);
  });

  /**
   * The phase that matters most for §9-F1. This session fetches four payloads in one exec and prints
   * `done`, then a LATER exec does `load("probe2"); text(…)` — so one of the four reaches context
   * several turns after the call that produced it, and three never do. Any rule that pairs a sent
   * record with "its" output, or that only looks at the output of the exec that made the call, gets
   * this run wrong in both directions. Searching every received record is the only shape that does not.
   */
  it("carries the phase where a payload reaches context through a LATER exec", () => {
    const fixture = FIXTURES.multiCallStoredThenLoaded;
    const outcome = readCodexRollout(transcriptOf(fixture.id), expectationsFor(fixture.id));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.sent).toHaveLength(4);
    for (const record of outcome.sent) expect(record.text!.length).toBeGreaterThan(1_000);

    const fetching = outcome.received.find((record) => record.text.trimEnd().endsWith("done"))!;
    expect(fetching.text).not.toContain("the quick brown fox"); // the fetching exec rendered nothing
    const carrying = outcome.received.filter((record) => record.text.includes("the quick brown fox"));
    expect(carrying).toHaveLength(1); // …but a later one carried the stored payload
    expect(carrying[0]!.call_id).not.toBe(fetching.call_id);
  });
});

describe("codex rollout reader — every uncertainty refuses", () => {
  const id = FIXTURES.singleCall.id;

  it("refuses a transcript belonging to another session", () => {
    const outcome = readCodexRollout(transcriptOf(id), {
      ...expectationsFor(id),
      sessionId: "019fffff-0000-0000-0000-000000000000",
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.refusal).toBe("session_meta_mismatch");
  });

  it("refuses a transcript from another working directory", () => {
    const outcome = readCodexRollout(transcriptOf(id), {
      ...expectationsFor(id),
      cwd: "/Users/kangmin/Documents/other-repo",
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.refusal).toBe("session_meta_mismatch");
  });

  it("refuses an unverified cli version — the version gate, exercised", () => {
    const outcome = readCodexRollout(transcriptOf(id), {
      ...expectationsFor(id),
      verifiedCliVersions: ["0.146.0"],
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.refusal).toBe("cli_version_not_verified");
  });

  it("refuses a transcript stamped outside the child's lifetime", () => {
    const outcome = readCodexRollout(transcriptOf(id), {
      ...expectationsFor(id),
      childWindow: {
        startedAtMs: Date.parse("2026-07-28T00:00:00.000Z"),
        endedAtMs: Date.parse("2026-07-29T00:00:00.000Z"),
      },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.refusal).toBe("rollout_outside_child_window");
  });

  /**
   * codex ultracode review, PR #271. The only "outside the lifetime" case started AFTER the transcript,
   * so the lower bound alone decided every rejection and the upper bound could be deleted unnoticed —
   * a transcript stamped after the worker exited would then be accepted as this dispatch's.
   */
  it("refuses a transcript stamped AFTER the child exited", () => {
    const stampedAtMs = Date.parse("2026-07-27T11:04:16.265Z");
    const outcome = readCodexRollout(transcriptOf(id), {
      ...expectationsFor(id),
      childWindow: { startedAtMs: stampedAtMs - 60_000, endedAtMs: stampedAtMs - 1 },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.refusal).toBe("rollout_outside_child_window");
  });

  it("refuses a transcript with no session_meta", () => {
    const withoutMeta = transcriptOf(id)
      .split("\n")
      .filter((line) => line.trim() !== "" && !line.includes('"session_meta"'))
      .join("\n");
    const outcome = readCodexRollout(withoutMeta, expectationsFor(id));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.refusal).toBe("session_meta_missing");
  });

  it.each([
    ["empty", ""],
    ["not json", "this is not a transcript"],
    ["a json array per line", "[1,2,3]"],
  ])("refuses %s", (_name, text) => {
    const outcome = readCodexRollout(text, expectationsFor(id));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.refusal).toBe("rollout_unparseable");
  });

  /**
   * The shape gate. A received record whose `output` is not the measured array-of-`{text}` must refuse
   * the WHOLE transcript rather than be skipped: skipping shrinks the received set, and a shrunken
   * received set reads downstream as "less was delivered" — a false statement rather than a refusal.
   */
  /**
   * Mutate the PARSED record and re-serialize, never the raw text: a regex edit can leave JSON that no
   * longer parses, and the reader would then refuse for the wrong reason — a control that passes while
   * proving nothing about the shape gate.
   */
  function mutateFirst(
    payloadType: string,
    mutate: (payload: Record<string, any>) => void,
  ): string {
    let done = false;
    const lines = transcriptOf(id).split("\n").filter((line) => line.trim() !== "").map((line) => {
      const record = JSON.parse(line) as { payload?: Record<string, any> };
      if (!done && record.payload?.type === payloadType) {
        mutate(record.payload);
        done = true;
      }
      return JSON.stringify(record);
    });
    expect(done, `no ${payloadType} record to mutate`).toBe(true);
    return lines.join("\n");
  }

  it.each([
    ["output became a bare string", (p: Record<string, any>) => { p.output = "Script completed"; }],
    ["output element lost its text", (p: Record<string, any>) => { p.output = [{ type: "input_text" }]; }],
    ["output became empty", (p: Record<string, any>) => { p.output = []; }],
    ["call_id disappeared", (p: Record<string, any>) => { delete p.call_id; }],
  ])("refuses when %s", (_name, mutate) => {
    const mutated = mutateFirst("custom_tool_call_output", mutate);
    expect(mutated).not.toBe(transcriptOf(id));
    const outcome = readCodexRollout(mutated, expectationsFor(id));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.refusal).toBe("record_shape_unrecognised");
  });

  it.each([
    ["invocation lost its tool", (p: Record<string, any>) => { p.invocation = { server: "probe" }; }],
    ["result content is not an array", (p: Record<string, any>) => { p.result.Ok.content = "text"; }],
    ["result lost isError", (p: Record<string, any>) => { delete p.result.Ok.isError; }],
  ])("refuses when a sent record's %s", (_name, mutate) => {
    const mutated = mutateFirst("mcp_tool_call_end", mutate);
    expect(mutated).not.toBe(transcriptOf(id));
    const outcome = readCodexRollout(mutated, expectationsFor(id));
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.refusal).toBe("record_shape_unrecognised");
  });
});
