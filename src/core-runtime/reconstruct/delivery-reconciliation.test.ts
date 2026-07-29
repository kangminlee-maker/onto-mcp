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
    return [meta, ...sentRecords, received].map((record) => JSON.stringify(record)).join("\n");
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
    expect(outcome.delivered.has(target)).toBe(true);
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
    expect(outcome.delivered.has(biggest)).toBe(false);
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
    expect(tidy.delivered.has(target)).toBe(true);

    const forward = texts.map((_, index) => index);
    for (const [attempt, order] of [forward, [...forward].reverse()].entries()) {
      const outcome = reconcileDelivery({
        emissions,
        transcript: scattered(order, `s-scattered-${attempt}`),
        expect: expectFor(`s-scattered-${attempt}`),
      });
      expect(outcome.status, `order ${order.join(",")}`).toBe("verified");
      if (outcome.status !== "verified") continue;
      expect(outcome.delivered.has(target)).toBe(true);
      expect(outcome.attestation).toEqual(tidy.attestation);
    }
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
