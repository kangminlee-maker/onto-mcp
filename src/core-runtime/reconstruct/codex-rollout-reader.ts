/**
 * Reads a codex rollout transcript and selects the records delivery reconciliation is derived from
 * (design §6-2 stage 1, measurement `20-measurement-rollout-record-structure.md`).
 *
 * WHAT THIS ANSWERS. A dispatch is over; the worker is gone. Two questions remain: which transcript
 * belongs to THIS dispatch, and which of its records say what the MCP server sent versus what actually
 * entered the model's context. This module answers both and nothing else — it does not compare them,
 * does not fold parts, and does not decide delivery. Those are stage 2.
 *
 * FAIL-CLOSED IS THE WHOLE DESIGN. Every uncertainty resolves to a refusal, and a refusal means
 * `unverifiable` upstream — never "nothing was delivered" (§9-M2). In particular an unrecognised
 * record SHAPE refuses the whole transcript rather than being skipped: skipping would silently shrink
 * the received set, and a shrunken received set reads as "less was delivered", which is exactly the
 * false statement this layer exists to avoid (§10-R2-1, §9-M3).
 *
 * FINDING THE FILE. codex names a transcript after the session id it printed on stderr, under
 * `<CODEX_HOME>/sessions/<YYYY>/<MM>/<DD>/`, and the date in that path is the LOCAL date the session
 * started. `locateCodexRollout` therefore looks in the day directories the child's own lifetime spans
 * (plus one either side, which absorbs a midnight crossing and any clock skew) and nowhere else. It
 * never scans the whole store and never falls back to "the newest matching file" — that heuristic is
 * exactly what design §9-M1 forbids, because the wrong transcript passes every later check.
 *
 * NOT DONE HERE, deliberately:
 *   - pairing sent to received. The two carry different id spaces (`exec-<uuid>` against `call_<…>`),
 *     so there is no key to join on — measured, and the reason §9-F1 removes pairing rather than
 *     working around it.
 *   - counting sent against received as a whole-transcript equality. An exec that calls no tool still
 *     produces a received record, so the counts differ in all three measured fixtures. §11-L1's
 *     bidirectional check has to be scoped to our own server first, which is stage 2's job.
 */

import { readdirSync } from "node:fs";
import path from "node:path";

/** Why a transcript cannot be used. Each maps to `unverifiable`, never to "delivered nothing". */
export type CodexRolloutRefusal =
  | "rollout_unparseable"
  | "session_meta_missing"
  | "session_meta_mismatch"
  | "cli_version_not_verified"
  | "rollout_outside_child_window"
  | "record_shape_unrecognised"
  /** No answer marker in the transcript, so "before the answer" cannot be established at all. */
  | "answer_boundary_unresolved";

/** What the MCP server handed back, as codex recorded it before rendering. */
export interface CodexRolloutSentRecord {
  /**
   * `exec-<uuid>` — a DIFFERENT id space from the received records'.
   *
   * EVIDENCE, NOT INPUT. No judgment reads this: `delivery-reconciliation.ts` never mentions it, and
   * that is the point — the two id spaces are disjoint, so there is no key to join on and §9-F1's
   * "remove pairing" is the only available rule rather than a convenience. What keeps that claim
   * honest is `codex-rollout-reader.test.ts`, which asserts the disjointness over the real fixtures.
   * Deleting this field would delete the evidence for the design, not dead weight — and its absence
   * from the judgment is exactly what the order-independence tests in
   * `delivery-reconciliation.test.ts` depend on.
   */
  readonly call_id: string;
  readonly server: string;
  readonly tool: string;
  /** Concatenated `result.Ok.content[*].text`. Absent when the call failed. */
  readonly text: string | null;
  readonly is_error: boolean;
}

/**
 * What entered the model's context BEFORE it answered: the exec's rendered output.
 *
 * Records after the accepted answer are dropped here rather than reported and filtered by the caller.
 * A record that must never be counted is not a record the search should be able to see — the caller
 * that forgets to filter is the failure this shape removes (design §6, §11 R2 MATERIAL).
 */
export interface CodexRolloutReceivedRecord {
  /** `call_<…>` — the exec's own id. Evidence, not input; see the sent record's note. */
  readonly call_id: string;
  /** Concatenated `output[*].text`, in order. This is the ONLY text stage 2 may search (§9-F4). */
  readonly text: string;
  /**
   * codex's own marker that it cut the exec's output.
   *
   * EVIDENCE, NOT INPUT — same standing as `call_id`. The delivered decision is a verbatim
   * containment check and never consults this, which is WHY a change to codex's marker wording
   * cannot flip a delivery: a cut page simply stops containing its own bytes. What reads it is
   * `codex-rollout-reader.test.ts`, pinning the measured truncation counts per fixture — the
   * observation the exec output ceiling (§1-1, §4) was derived from.
   */
  readonly truncated: boolean;
}

export interface CodexRolloutSessionMeta {
  readonly session_id: string;
  readonly cwd: string;
  readonly cli_version: string;
  readonly timestamp: string;
}

export type CodexRolloutReadOutcome =
  | {
    readonly ok: true;
    readonly meta: CodexRolloutSessionMeta;
    readonly sent: readonly CodexRolloutSentRecord[];
    readonly received: readonly CodexRolloutReceivedRecord[];
  }
  | { readonly ok: false; readonly refusal: CodexRolloutRefusal };

export interface CodexRolloutExpectations {
  /** From the child's own stderr banner — never a "newest file" guess (§9-M1). */
  readonly sessionId: string;
  /** Canonical, already resolved by the caller. */
  readonly cwd: string;
  /** The versions this derivation has been verified against (§4 `verified_cli_versions`). */
  readonly verifiedCliVersions: readonly string[];
  /** The child's lifetime; a transcript stamped outside it is not this dispatch's (§9-M1). */
  readonly childWindow: { readonly startedAtMs: number; readonly endedAtMs: number };
}

/** codex's marker for an exec whose output it cut. Measured in 8 of 34 received records. */
const TRUNCATION_MARKER = "Warning: truncated output";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Concatenated `text` of a content array, or `null` when the array is not the measured shape. Null is
 * a REFUSAL signal, never an empty string: "no text" and "a shape we do not recognise" must not
 * collapse, because the first is a fact about the run and the second is a fact about our parser.
 */
function textOfContentArray(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  let text = "";
  for (const item of value) {
    if (!isRecord(item) || typeof item.text !== "string") return null;
    text += item.text;
  }
  return text;
}

export function readCodexRollout(
  transcript: string,
  expect: CodexRolloutExpectations,
): CodexRolloutReadOutcome {
  const lines = transcript.split("\n").filter((line) => line.trim() !== "");
  if (lines.length === 0) return { ok: false, refusal: "rollout_unparseable" };

  const records: { type: unknown; payload: unknown; timestamp: unknown }[] = [];
  for (const line of lines) {
    try {
      const parsed: unknown = JSON.parse(line);
      if (!isRecord(parsed)) return { ok: false, refusal: "rollout_unparseable" };
      records.push({
        type: parsed.type,
        payload: parsed.payload,
        timestamp: parsed.timestamp,
      });
    } catch {
      return { ok: false, refusal: "rollout_unparseable" };
    }
  }

  const metaRecord = records.find((record) => record.type === "session_meta");
  if (!metaRecord || !isRecord(metaRecord.payload)) {
    return { ok: false, refusal: "session_meta_missing" };
  }
  const payload = metaRecord.payload;
  if (
    typeof payload.session_id !== "string" || typeof payload.cwd !== "string" ||
    typeof payload.cli_version !== "string" || typeof metaRecord.timestamp !== "string"
  ) {
    return { ok: false, refusal: "session_meta_missing" };
  }
  const meta: CodexRolloutSessionMeta = {
    session_id: payload.session_id,
    cwd: payload.cwd,
    cli_version: payload.cli_version,
    timestamp: metaRecord.timestamp,
  };

  if (meta.session_id !== expect.sessionId || meta.cwd !== expect.cwd) {
    return { ok: false, refusal: "session_meta_mismatch" };
  }
  if (!expect.verifiedCliVersions.includes(meta.cli_version)) {
    return { ok: false, refusal: "cli_version_not_verified" };
  }
  const stampedAtMs = Date.parse(meta.timestamp);
  if (
    Number.isNaN(stampedAtMs) || stampedAtMs < expect.childWindow.startedAtMs ||
    stampedAtMs > expect.childWindow.endedAtMs
  ) {
    return { ok: false, refusal: "rollout_outside_child_window" };
  }

  const sent: CodexRolloutSentRecord[] = [];
  const received: CodexRolloutReceivedRecord[] = [];

  /**
   * Where the model answered. An output recorded after this point cannot have informed the answer the
   * runtime is about to judge, so counting it would attest a delivery to a moment that had not
   * happened yet (design §6-… "수용된 최종 응답 이후에 기록된 출력은 세면 안 된다", from the R2
   * MATERIAL finding).
   *
   * Two markers, because codex writes the same answer twice — an `agent_message` event and an
   * assistant `response_item`. The EARLIEST is taken: the answer had already been produced by then,
   * so anything later is out regardless of which record type survives a codex change.
   *
   * Measured across the three real fixtures: exactly one of each, `agent_message` immediately before
   * the assistant message, and every tool output before both. A transcript with no marker at all is
   * refused rather than treated as unbounded — an answer we cannot place is an ordering we cannot
   * assert. Multi-answer topologies would make this bound too strict rather than too loose; that
   * direction refuses citations instead of inventing deliveries, which is the safe way to be wrong.
   */
  let answerIndex = Number.POSITIVE_INFINITY;
  for (const [index, record] of records.entries()) {
    if (!isRecord(record.payload)) continue;
    const kind = record.payload.type;
    const isAgentMessage = record.type === "event_msg" && kind === "agent_message";
    const isAssistantMessage = record.type === "response_item" && kind === "message" &&
      record.payload.role === "assistant";
    if (isAgentMessage || isAssistantMessage) {
      answerIndex = Math.min(answerIndex, index);
    }
  }
  if (!Number.isFinite(answerIndex)) {
    return { ok: false, refusal: "answer_boundary_unresolved" };
  }

  for (const [index, record] of records.entries()) {
    if (!isRecord(record.payload)) continue;
    const kind = record.payload.type;

    if (record.type === "event_msg" && kind === "mcp_tool_call_end") {
      const invocation = record.payload.invocation;
      const result = record.payload.result;
      if (
        typeof record.payload.call_id !== "string" || !isRecord(invocation) ||
        typeof invocation.server !== "string" || typeof invocation.tool !== "string" ||
        !isRecord(result)
      ) {
        return { ok: false, refusal: "record_shape_unrecognised" };
      }
      // `result` is a Rust-style tagged union serialized as `{Ok: …}` / `{Err: …}`.
      const ok = result.Ok;
      if (ok === undefined) {
        sent.push({
          call_id: record.payload.call_id,
          server: invocation.server,
          tool: invocation.tool,
          text: null,
          is_error: true,
        });
        continue;
      }
      if (!isRecord(ok) || typeof ok.isError !== "boolean") {
        return { ok: false, refusal: "record_shape_unrecognised" };
      }
      const text = textOfContentArray(ok.content);
      if (text === null) return { ok: false, refusal: "record_shape_unrecognised" };
      sent.push({
        call_id: record.payload.call_id,
        server: invocation.server,
        tool: invocation.tool,
        text,
        is_error: ok.isError,
      });
      continue;
    }

    if (record.type === "response_item" && kind === "custom_tool_call_output") {
      const text = textOfContentArray(record.payload.output);
      if (typeof record.payload.call_id !== "string" || text === null) {
        return { ok: false, refusal: "record_shape_unrecognised" };
      }
      // Shape is still validated above — a malformed record is a fact about the transcript and is
      // refused wherever it sits. Only COUNTING is bounded by the answer.
      if (index > answerIndex) continue;
      received.push({
        call_id: record.payload.call_id,
        text,
        truncated: text.includes(TRUNCATION_MARKER),
      });
    }
  }

  return { ok: true, meta, sent, received };
}

/** Where codex keeps its transcripts. `CODEX_HOME` wins, as codex itself reads it. */
export function codexHomeFrom(env: NodeJS.ProcessEnv, homeDir: string): string {
  const override = env.CODEX_HOME;
  return override !== undefined && override.length > 0 ? override : path.join(homeDir, ".codex");
}

/**
 * The transcript for one session id, or null when it is not where codex would have put it.
 *
 * Null is "we have no transcript", never "nothing was delivered" — the caller reports it as
 * unverifiable (§9-M2).
 */
export function locateCodexRollout(args: {
  readonly codexHome: string;
  readonly sessionId: string;
  readonly childWindow: { readonly startedAtMs: number; readonly endedAtMs: number };
}): string | null {
  const DAY_MS = 86_400_000;
  const days = new Set<string>();
  for (
    const atMs of [
      args.childWindow.startedAtMs - DAY_MS,
      args.childWindow.startedAtMs,
      args.childWindow.endedAtMs,
      args.childWindow.endedAtMs + DAY_MS,
    ]
  ) {
    const at = new Date(atMs);
    days.add(
      path.join(
        String(at.getFullYear()),
        String(at.getMonth() + 1).padStart(2, "0"),
        String(at.getDate()).padStart(2, "0"),
      ),
    );
  }
  for (const day of [...days].sort()) {
    const directory = path.join(args.codexHome, "sessions", day);
    let entries: string[];
    try {
      entries = readdirSync(directory);
    } catch {
      continue;
    }
    const match = entries.find((entry) =>
      entry.endsWith(".jsonl") && entry.includes(args.sessionId)
    );
    if (match !== undefined) return path.join(directory, match);
  }
  return null;
}
