import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import {
  type DeliveryReconciliationInput,
  attestEmissionDelivery,
  reconcileDelivery,
} from "./delivery-reconciliation.js";
import { coversWholeObservation } from "./observation-read-coverage.js";
import type { ReconstructSourceSafetyLedgerArtifact } from "./artifact-types.js";
import { fixObservationSnapshot, readObservationPage } from "./observation-read.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ROLLOUT_DIR = path.join(REPO_ROOT, "scripts/fixtures/codex-rollout");

function transcriptOf(id: string): string {
  return readFileSync(path.join(ROLLOUT_DIR, `${id}.jsonl`), "utf8");
}

function expectationsFor(id: string): DeliveryReconciliationInput["expect"] {
  return {
    sessionId: id,
    cwd: "/Users/kangmin/Documents/onto-mcp",
    verifiedCliVersions: ["0.145.0"],
    childWindow: {
      startedAtMs: Date.parse("2026-07-27T00:00:00.000Z"),
      endedAtMs: Date.parse("2026-07-28T00:00:00.000Z"),
    },
    server: "probe",
    tool: "probe_fetch",
  };
}

/**
 * What the server sent, lifted out of the transcript itself. In production the facade records these as
 * it emits them; replaying them from the transcript is what lets these tests run against a REAL
 * corpus, and it is honest because the two are the same bytes by construction — the bidirectional
 * check below is exactly the assertion that they are.
 */
function emissionsFromTranscript(id: string): { canonical_text: string }[] {
  const emissions: { canonical_text: string }[] = [];
  for (const line of transcriptOf(id).split("\n").filter((entry) => entry.trim() !== "")) {
    const record = JSON.parse(line) as { payload?: Record<string, any> };
    if (record.payload?.type !== "mcp_tool_call_end") continue;
    const ok = record.payload.result?.Ok;
    if (!ok) continue;
    emissions.push({
      canonical_text: (ok.content as { text: string }[]).map((part) => part.text).join(""),
    });
  }
  return emissions;
}

/**
 * THE KNOWN ANSWERS. Measured independently of this module, directly over the transcripts: for each
 * emission, does its exact text appear in any received record? This is what makes stage 2 falsifiable
 * without a live run (design §6-5).
 *
 * They are not round numbers by accident — the exec output ceiling (~40,150 chars) cuts the larger
 * payloads, and the `store`/`load` session delivers exactly the one payload it re-printed later.
 */
const KNOWN_ANSWERS = [
  {
    name: "four calls in one exec, output truncated at the ceiling",
    id: "019fa332-ae9e-75b1-ba34-3cd43e25952e",
    emissionChars: [2_015, 8_001, 32_035, 128_007],
    delivered: [true, true, false, false],
  },
  {
    name: "four calls, one stored and printed by a LATER exec",
    id: "019fa334-7926-78d0-8082-67624edfdeb1",
    emissionChars: [2_015, 8_001, 32_035, 128_007],
    delivered: [false, false, true, false],
  },
  {
    name: "one call whose single payload never fit",
    id: "019fa33f-3382-7b00-8d5a-ce8e9e7be00d",
    emissionChars: [128_049],
    delivered: [false],
  },
] as const;

describe("delivery reconciliation — replay against real transcripts", () => {
  it.each(KNOWN_ANSWERS)("$name", (answer) => {
    const emissions = emissionsFromTranscript(answer.id);
    expect(emissions.map((emission) => emission.canonical_text.length))
      .toEqual([...answer.emissionChars]);

    const outcome = attestEmissionDelivery({
      emissions,
      transcript: transcriptOf(answer.id),
      expect: expectationsFor(answer.id),
    });
    expect(outcome.status).toBe("verified");
    if (outcome.status !== "verified") return;
    expect(outcome.attestation.map((entry) => entry.disposition === "verbatim_delivered"))
      .toEqual([...answer.delivered]);
  });

  /**
   * THE SHAPE THE OTHER THREE DO NOT HAVE: the model speaks BEFORE it fetches. This is the real
   * `onto_observation` façade run, and its transcript carries interim commentary at record 9/10, the
   * tool outputs at 12 and 17, and the accepted answer at 20+.
   *
   * A boundary rule that took the earliest answer marker placed it at 9 and discarded both outputs —
   * measured, `delivered` went from two observations to none, and the other three fixtures all passed
   * because each carries exactly one `agent_message`, at the end. Binding the boundary to
   * `task_complete.last_agent_message` is what distinguishes commentary from the accepted answer.
   */
  it("counts outputs that follow interim commentary but precede the accepted answer", () => {
    const id = "019fa8af-6551-73e0-a1ca-c91c47a71af4";
    const emissions = emissionsFromTranscript(id);
    expect(emissions.map((entry) => entry.canonical_text.length)).toEqual([15_177]);

    const outcome = attestEmissionDelivery({
      emissions,
      transcript: transcriptOf(id),
      expect: {
        sessionId: id,
        cwd: "/Users/kangmin/Documents/onto-mcp",
        verifiedCliVersions: ["0.145.0"],
        childWindow: {
          startedAtMs: Date.parse("2026-07-28T00:00:00.000Z"),
          endedAtMs: Date.parse("2026-07-29T00:00:00.000Z"),
        },
        server: "onto_observation",
        tool: "onto_observation_read",
      },
    });
    expect(outcome.status).toBe("verified");
    if (outcome.status !== "verified") return;
    // The page arrived. Taking the earliest marker instead reports `verbatim_delivery_not_attested`.
    expect(outcome.attestation.map((entry) => entry.disposition)).toEqual(["verbatim_delivered"]);
  });

  it("does not conclude from a corpus that delivered everything or nothing", () => {
    // Non-vacuity: the three transcripts together contain both outcomes, so a rule stuck on either
    // answer fails at least one of them.
    const dispositions = KNOWN_ANSWERS.flatMap((answer) => [...answer.delivered]);
    expect(dispositions).toContain(true);
    expect(dispositions).toContain(false);
  });

  it("refuses when the transcript shows a send our record does not account for (§11-L1)", () => {
    const id = KNOWN_ANSWERS[0].id;
    const emissions = emissionsFromTranscript(id);
    // The crash window: the server wrote the response, then died before committing its receipt.
    const outcome = attestEmissionDelivery({
      emissions: emissions.slice(0, -1),
      transcript: transcriptOf(id),
      expect: expectationsFor(id),
    });
    expect(outcome.status).toBe("unverifiable");
    if (outcome.status !== "verified") expect(outcome.reason).toBe("sent_without_recorded_emission");
  });

  it("refuses when our record claims an emission the transcript never shows", () => {
    const id = KNOWN_ANSWERS[0].id;
    const outcome = attestEmissionDelivery({
      emissions: [...emissionsFromTranscript(id), { canonical_text: "a page nobody sent" }],
      transcript: transcriptOf(id),
      expect: expectationsFor(id),
    });
    expect(outcome.status).toBe("unverifiable");
    if (outcome.status !== "verified") {
      expect(outcome.reason).toBe("recorded_emission_without_sent_record");
    }
  });

  it("scopes to our own server before comparing — another server's calls are not ours", () => {
    const id = KNOWN_ANSWERS[0].id;
    const outcome = attestEmissionDelivery({
      emissions: [],
      transcript: transcriptOf(id),
      expect: { ...expectationsFor(id), server: "someone-else" },
    });
    // Nothing from `someone-else` is in the transcript, so an empty record set is consistent.
    expect(outcome.status).toBe("verified");
    if (outcome.status === "verified") expect(outcome.attestation).toHaveLength(0);
  });

  it("passes the reader's refusal straight through", () => {
    const id = KNOWN_ANSWERS[0].id;
    const outcome = attestEmissionDelivery({
      emissions: emissionsFromTranscript(id),
      transcript: transcriptOf(id),
      expect: { ...expectationsFor(id), verifiedCliVersions: ["0.146.0"] },
    });
    expect(outcome.status).toBe("unverifiable");
    if (outcome.status !== "verified") expect(outcome.reason).toBe("cli_version_not_verified");
  });
});

/**
 * The fold half, over REAL pages. `readObservationPage` produces them from the real 59-observation
 * corpus, so the part indexes, counts and allowances are the ones the runtime actually serves rather
 * than numbers chosen to make the test pass.
 */
/**
 * Is this observation covered WHOLE by the reconciliation's delivered ranges?
 *
 * `delivered` is coverage, not a set of ids — a worker that read one section of an 800 KB observation
 * received that section — so "was it delivered" is a question about the ranges. The rule itself lives
 * in `observation-read-coverage.ts`; this only locates the record.
 */
function deliveredWhole(
  outcome: { readonly delivered: readonly { observation_id: string; ranges: readonly (readonly [number, number])[]; body_length: number | null }[] },
  observationId: string,
): boolean {
  const record = outcome.delivered.find((entry) => entry.observation_id === observationId);
  return record !== undefined &&
    coversWholeObservation({ ranges: record.ranges, bodyLength: record.body_length ?? undefined });
}

describe("delivery reconciliation — folding real pages into delivered ids", () => {
  // BOTH artifacts are the real, paired ones from the 59-file value bench (see that fixture's
  // PROVENANCE.md). The ledger is loaded rather than synthesized on purpose: writing an "admit
  // everything" ledger by hand means copying a 20-field row schema into this file, where it drifts —
  // and the first attempt at exactly that admitted nothing, so the snapshot was empty and the fold
  // tests would have concluded from a corpus of zero.
  const FIXTURES = path.join(REPO_ROOT, "scripts/fixtures/observation-catalog");
  const artifactText = readFileSync(path.join(FIXTURES, "source-observations.yaml"), "utf8");
  const ledger = parseYaml(
    readFileSync(path.join(FIXTURES, "source-safety-ledger.yaml"), "utf8"),
  ) as ReconstructSourceSafetyLedgerArtifact;
  const snapshot = fixObservationSnapshot(artifactText, ledger);
  const ids = snapshot.entries.map((entry) => entry.observation_id);

  it("admits a non-empty corpus before anything is concluded from it", () => {
    expect(ids.length).toBeGreaterThan(0);
  });

  /**
   * A transcript in which `sent` went out and `rendered` reached the model's context. The two are
   * separate arguments on purpose: string-replacing a page out of a finished transcript does nothing,
   * because the transcript holds the ESCAPED form of that JSON — the first attempt did exactly that,
   * silently mutated nothing, and the test passed while proving the opposite of what it claimed.
   */
  function transcriptRendering(
    sent: readonly string[],
    rendered: readonly string[],
    sessionId: string,
  ): string {
    const meta = {
      timestamp: "2026-07-27T11:00:00.000Z",
      type: "session_meta",
      payload: {
        session_id: sessionId,
        cwd: "/repo",
        cli_version: "0.145.0",
      },
    };
    const sentRecords = sent.map((text, index) => ({
      timestamp: "2026-07-27T11:00:01.000Z",
      type: "event_msg",
      payload: {
        type: "mcp_tool_call_end",
        call_id: `exec-${index}`,
        invocation: { server: "onto", tool: "observation_read" },
        result: { Ok: { content: [{ type: "text", text }], isError: false } },
      },
    }));
    const received = {
      timestamp: "2026-07-27T11:00:02.000Z",
      type: "response_item",
      payload: {
        type: "custom_tool_call_output",
        call_id: "call_0",
        output: [
          { type: "input_text", text: "Script completed\nWall time 0.0 seconds\nOutput:\n" },
          { type: "input_text", text: rendered.join("\n") },
        ],
      },
    };
    // Every real transcript ends with the model answering, and the reader now needs that boundary to
    // decide what counted (it refuses a transcript it cannot place an answer in). Appending it here
    // is what makes these fixtures the shape codex actually writes rather than a prefix of one.
    // The answer, then codex's own declaration of which answer was accepted. The reader binds its
    // boundary to `last_agent_message`, so a fixture without it is not a shape codex writes.
    const answered = {
      timestamp: "2026-07-27T11:00:03.000Z",
      type: "event_msg",
      payload: { type: "agent_message", message: "done" },
    };
    const completed = {
      timestamp: "2026-07-27T11:00:04.000Z",
      type: "event_msg",
      payload: { type: "task_complete", last_agent_message: "done" },
    };
    return [meta, ...sentRecords, received, answered, completed]
      .map((record) => JSON.stringify(record)).join("\n");
  }

  function expectFor(sessionId: string): DeliveryReconciliationInput["expect"] {
    return {
      sessionId,
      cwd: "/repo",
      verifiedCliVersions: ["0.145.0"],
      childWindow: {
        startedAtMs: Date.parse("2026-07-27T00:00:00.000Z"),
        endedAtMs: Date.parse("2026-07-28T00:00:00.000Z"),
      },
      server: "onto",
      tool: "observation_read",
    };
  }

  /** Serve one request end to end, following the cursor, and return the emitted page strings. */
  function serveAll(observationIds: readonly string[], pageCharBudget: number): string[] {
    const texts: string[] = [];
    let page = readObservationPage({
      snapshot,
      request: { observation_ids: [...observationIds] },
      pageCharBudget,
    });
    texts.push(JSON.stringify(page));
    while (page.next_cursor) {
      page = readObservationPage({ snapshot, request: { cursor: page.next_cursor }, pageCharBudget });
      texts.push(JSON.stringify(page));
    }
    return texts;
  }

  it("admits an observation whose every part arrived", () => {
    const target = ids[0]!;
    const texts = serveAll([target], 65_536);
    const outcome = reconcileDelivery({
      emissions: texts.map((canonical_text) => ({ canonical_text })),
      transcript: transcriptRendering(texts, texts, "s-whole"),
      expect: expectFor("s-whole"),
    });
    expect(outcome.status).toBe("verified");
    if (outcome.status !== "verified") return;
    expect(deliveredWhole(outcome, target)).toBe(true);
  });

  it("withholds an observation whose tail was cut out of the context", () => {
    // The biggest observation, at a budget that splits it — then the context renders every page but
    // the last. Non-vacuous by assertion: it really does split.
    const biggest = [...snapshot.entries]
      .sort((left, right) => right.body.length - left.body.length)[0]!
      .observation_id;
    const texts = serveAll([biggest], 65_536);
    expect(texts.length).toBeGreaterThan(1);

    const outcome = reconcileDelivery({
      emissions: texts.map((canonical_text) => ({ canonical_text })),
      // Every page was SENT; the context received all but the last.
      transcript: transcriptRendering(texts, texts.slice(0, -1), "s-cut"),
      expect: expectFor("s-cut"),
    });
    expect(outcome.status).toBe("verified");
    if (outcome.status !== "verified") return;
    expect(deliveredWhole(outcome, biggest)).toBe(false);
    expect(outcome.attestation.filter((entry) => entry.disposition === "verbatim_delivered"))
      .toHaveLength(texts.length - 1);
  });

  it("refuses when our own record is not a page", () => {
    const outcome = reconcileDelivery({
      emissions: [{ canonical_text: "not a page at all" }],
      transcript: transcriptRendering(["not a page at all"], ["not a page at all"], "s-bad"),
      expect: expectFor("s-bad"),
    });
    expect(outcome.status).toBe("unverifiable");
    if (outcome.status !== "verified") expect(outcome.reason).toBe("emission_not_a_page");
  });

  /**
   * The bidirectional check counts HOW MANY TIMES each page appears, not merely whether it appears.
   * Every other fixture here serves distinct pages, so a membership test would satisfy them all — and
   * a repeated fetch of one part is a real emission, not a hypothetical: the fold treats it as one
   * part precisely because the facade can serve it twice (`observation-read-coverage.test.ts`).
   *
   * With counting dropped, both halves below reconcile as `verified`: an emission the transcript never
   * shows, and a send our record never accounted for, each hide behind the OTHER copy of the same text.
   */
  /**
   * The two phases the measurement (§5) left unmeasured — CONCURRENT tool calls and OVERLAPPING outer
   * execs — reach the judgment only as order and grouping. Neither is something the judgment looks at:
   * `call_id` is carried by the reader and read by nothing here, the send comparison is a multiset,
   * the containment search scans every received record, and the fold is order independent (stage 0b).
   *
   * So instead of buying live dispatches to produce those shapes, this pins the property that makes
   * them irrelevant: pages scattered across SEVERAL received records, interleaved with the sends in an
   * order no single-exec transcript would produce, must reconcile exactly as the tidy shape does.
   * If any of those three ever starts pairing by call_id or assuming one output record, this fails.
   */
  it("judges the same whether the pages arrive in one exec output or several, in any order", () => {
    const target = ids[0]!;
    const texts = serveAll([target], 8_192);
    expect(texts.length, "the fixture must split, or one record and several are the same case")
      .toBeGreaterThan(1);

    /** Every page in its own `custom_tool_call_output`, records emitted in the given order. */
    const scattered = (order: readonly number[], sessionId: string): string => {
      const meta = {
        timestamp: "2026-07-27T11:00:00.000Z",
        type: "session_meta",
        payload: { session_id: sessionId, cwd: "/repo", cli_version: "0.145.0" },
      };
      const records: unknown[] = [meta];
      for (const index of order) {
        // Interleaved on purpose: send and its rendering do not arrive adjacent under concurrency.
        records.push({
          timestamp: "2026-07-27T11:00:01.000Z",
          type: "event_msg",
          payload: {
            type: "mcp_tool_call_end",
            // Deliberately NOT a per-page id: overlapping execs reuse and interleave these, and the
            // judgment must not care. A pairing rule would break right here.
            call_id: "shared-call-id",
            invocation: { server: "onto", tool: "observation_read" },
            result: { Ok: { content: [{ type: "text", text: texts[index]! }], isError: false } },
          },
        });
        records.push({
          timestamp: "2026-07-27T11:00:02.000Z",
          type: "response_item",
          payload: {
            type: "custom_tool_call_output",
            call_id: "shared-call-id",
            output: [
              { type: "input_text", text: "Script completed\nWall time 0.0 seconds\nOutput:\n" },
              { type: "input_text", text: texts[index]! },
            ],
          },
        });
      }
      records.push({
        timestamp: "2026-07-27T11:00:03.000Z",
        type: "event_msg",
        payload: { type: "agent_message", message: "done" },
      });
      records.push({
        timestamp: "2026-07-27T11:00:04.000Z",
        type: "event_msg",
        payload: { type: "task_complete", last_agent_message: "done" },
      });
      return records.map((record) => JSON.stringify(record)).join("\n");
    };

    const emissions = texts.map((canonical_text) => ({ canonical_text }));
    const tidy = reconcileDelivery({
      emissions,
      transcript: transcriptRendering(texts, texts, "s-one-exec"),
      expect: expectFor("s-one-exec"),
    });
    expect(tidy.status).toBe("verified");
    if (tidy.status !== "verified") return;
    expect(deliveredWhole(tidy, target)).toBe(true);

    const forward = texts.map((_, index) => index);
    for (const [attempt, order] of [forward, [...forward].reverse()].entries()) {
      const outcome = reconcileDelivery({
        emissions,
        transcript: scattered(order, `s-scattered-${attempt}`),
        expect: expectFor(`s-scattered-${attempt}`),
      });
      expect(outcome.status, `order ${order.join(",")}`).toBe("verified");
      if (outcome.status !== "verified") continue;
      expect(deliveredWhole(outcome, target)).toBe(true);
      expect(outcome.attestation).toEqual(tidy.attestation);
    }
  });

  /**
   * §11 R2 (MATERIAL, `15-review-gpt-5.6-sol-r2.md`) and design §6 in three places: **an output
   * recorded AFTER the accepted final answer must not count.** Those bytes cannot have informed the
   * answer the runtime is about to judge, so attesting them is a delivery claim about a moment that
   * had not happened yet.
   *
   * The requirement was accepted into the design and never implemented — the search scanned every
   * received record. Measured on the real corpus this shape does not occur today (0 of 3 transcripts
   * have an output after the answer), so it was latent rather than live; a codex change that appends
   * a debug output would have made it live silently.
   */
  it("does not count an output recorded after the accepted final answer", () => {
    const [page] = serveAll([ids[0]!], 65_536);
    const sessionId = "s-after-answer";
    const meta = {
      timestamp: "2026-07-27T11:00:00.000Z",
      type: "session_meta",
      payload: { session_id: sessionId, cwd: "/repo", cli_version: "0.145.0" },
    };
    const sent = {
      timestamp: "2026-07-27T11:00:01.000Z",
      type: "event_msg",
      payload: {
        type: "mcp_tool_call_end",
        call_id: "exec-0",
        invocation: { server: "onto", tool: "observation_read" },
        result: { Ok: { content: [{ type: "text", text: page! }], isError: false } },
      },
    };
    const answer = {
      timestamp: "2026-07-27T11:00:02.000Z",
      type: "event_msg",
      payload: { type: "agent_message", message: "done" },
    };
    const lateOutput = {
      timestamp: "2026-07-27T11:00:03.000Z",
      type: "response_item",
      payload: {
        type: "custom_tool_call_output",
        call_id: "call_0",
        // The page IS here, byte for byte — and that is exactly what must not be enough.
        output: [{ type: "input_text", text: page! }],
      },
    };
    const completed = {
      timestamp: "2026-07-27T11:00:04.000Z",
      type: "event_msg",
      payload: { type: "task_complete", last_agent_message: "done" },
    };
    const transcript = [meta, sent, answer, lateOutput, completed]
      .map((record) => JSON.stringify(record)).join("\n");

    const outcome = reconcileDelivery({
      emissions: [{ canonical_text: page! }],
      transcript,
      expect: expectFor(sessionId),
    });
    expect(outcome.status).toBe("verified");
    if (outcome.status !== "verified") return;
    expect(outcome.attestation[0]!.disposition).toBe("verbatim_delivery_not_attested");
    expect(outcome.delivered).toEqual([]);
  });

  /**
   * codex writes the same answer TWICE — an `agent_message` event and then an assistant
   * `response_item`. The boundary is the EARLIER of them, because by the time the first appears the
   * answer already exists and nothing later can have informed it.
   *
   * Nothing pinned that choice: in every real fixture the two are adjacent with no output between,
   * so taking the later marker instead changed no outcome and the whole suite stayed green. This is
   * the gap between them.
   */
  it("bounds at the FIRST answer marker, not the last — an output between the two does not count", () => {
    const [page] = serveAll([ids[0]!], 65_536);
    const sessionId = "s-between-markers";
    const record = (timestamp: string, type: string, payload: unknown) => ({
      timestamp,
      type,
      payload,
    });
    const transcript = [
      record("2026-07-27T11:00:00.000Z", "session_meta", {
        session_id: sessionId,
        cwd: "/repo",
        cli_version: "0.145.0",
      }),
      record("2026-07-27T11:00:01.000Z", "event_msg", {
        type: "mcp_tool_call_end",
        call_id: "exec-0",
        invocation: { server: "onto", tool: "observation_read" },
        result: { Ok: { content: [{ type: "text", text: page! }], isError: false } },
      }),
      // Marker 1: the answer exists from here on.
      record("2026-07-27T11:00:02.000Z", "event_msg", { type: "agent_message", message: "done" }),
      // Lands BETWEEN the two markers. Counted if the boundary is the last marker; not counted if it
      // is the first — and the first is right, because the answer above is already written.
      record("2026-07-27T11:00:03.000Z", "response_item", {
        type: "custom_tool_call_output",
        call_id: "call_0",
        output: [{ type: "input_text", text: page! }],
      }),
      // Marker 2: the same answer, as a conversation item.
      record("2026-07-27T11:00:04.000Z", "response_item", {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "done" }],
      }),
      record("2026-07-27T11:00:05.000Z", "event_msg", {
        type: "task_complete",
        last_agent_message: "done",
      }),
    ].map((entry) => JSON.stringify(entry)).join("\n");

    const outcome = reconcileDelivery({
      emissions: [{ canonical_text: page! }],
      transcript,
      expect: expectFor(sessionId),
    });
    expect(outcome.status).toBe("verified");
    if (outcome.status !== "verified") return;
    expect(outcome.attestation[0]!.disposition).toBe("verbatim_delivery_not_attested");
  });

  it("counts repeats — one page emitted twice is not accounted for by one send", () => {
    const [page] = serveAll([ids[0]!], 65_536);

    const recordedTwice = attestEmissionDelivery({
      emissions: [{ canonical_text: page! }, { canonical_text: page! }],
      transcript: transcriptRendering([page!], [page!], "s-dup-recorded"),
      expect: expectFor("s-dup-recorded"),
    });
    expect(recordedTwice.status).toBe("unverifiable");
    if (recordedTwice.status !== "verified") {
      expect(recordedTwice.reason).toBe("recorded_emission_without_sent_record");
    }

    const sentTwice = attestEmissionDelivery({
      emissions: [{ canonical_text: page! }],
      transcript: transcriptRendering([page!, page!], [page!], "s-dup-sent"),
      expect: expectFor("s-dup-sent"),
    });
    expect(sentTwice.status).toBe("unverifiable");
    if (sentTwice.status !== "verified") {
      expect(sentTwice.reason).toBe("sent_without_recorded_emission");
    }

    // The control: the SAME page, emitted and sent the same number of times, still reconciles. Without
    // this the two assertions above would also pass a rule that refused every duplicate outright.
    const balanced = attestEmissionDelivery({
      emissions: [{ canonical_text: page! }, { canonical_text: page! }],
      transcript: transcriptRendering([page!, page!], [page!], "s-dup-even"),
      expect: expectFor("s-dup-even"),
    });
    expect(balanced.status).toBe("verified");
  });
});
