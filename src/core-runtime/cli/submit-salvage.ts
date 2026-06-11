/**
 * Submit salvage recovery — pure decision/merge logic (no I/O, no LLM calls).
 *
 * After a structured-submit unit exhausts its regular retries with
 * `output_contract`, the executor can be re-invoked in salvage mode to
 * recover the already-produced semantics without re-engaging the violating
 * model. This module owns the parts that must be deterministic and
 * unit-testable: failure-mode classification, prompt construction, the
 * invention guard sentinel, and the missing-rows merge. The LLM calls and
 * file I/O stay in the executor; validation/serialization stay in
 * worker-structured-output (same validator as self-submitted payloads).
 *
 * Design: development-records/design/submit-salvage-recovery-design.md.
 */

/** Invention guard: the transcription model must answer this when the frozen
 * text lacks required content instead of inventing it. */
export const SALVAGE_INCOMPLETE_SENTINEL = "SALVAGE_INCOMPLETE";

/** Frozen-input sidecar path for a unit seat (runtime-owned scratch, not the seat). */
export function salvageInputPathFor(outputPath: string): string {
  return `${outputPath}.salvage-input.json`;
}

/** Frozen input the executor persists next to the seat on structured failure. */
export interface SalvageInput {
  unit_id: string;
  unit_kind: string;
  output_format: string;
  /** The failing attempt's full claude stream stdout (frozen evidence). */
  stdout: string;
  /** The structured extract/validation error that failed the attempt. */
  error: string;
}

export type SalvageMode =
  | { mode: "delta_rows"; missingIssueIds: string[] }
  | { mode: "transcription" }
  | { mode: "unsalvageable"; reason: string };

const MISSING_STANCE_ROWS_PATTERN =
  /submit_issue_stance_response is missing issue_id\(s\): (.+)$/m;

/**
 * Classify the recovery path from the frozen failure.
 *
 * - S2 (partial submit, measured case): the payload exists and the validator
 *   named the missing stance rows -> bounded delta completion by a fresh
 *   same-tier instance (`delta_rows`). v1 covers issue-stance-response only —
 *   the other formats are single-object submissions without a row dimension.
 * - S1-prose / S3 (no payload, or field-level violations) -> transcription by
 *   the cheap model (`transcription`), guarded by the incompleteness sentinel.
 * - No payload AND no usable text -> unsalvageable (the regular failure
 *   stands; salvage never invents content).
 */
export function classifySalvageMode(args: {
  outputFormat: string;
  payload: Record<string, unknown> | null;
  resultText: string | null;
  error: string;
}): SalvageMode {
  if (args.payload !== null) {
    const missing = MISSING_STANCE_ROWS_PATTERN.exec(args.error);
    if (missing?.[1] && args.outputFormat === "issue-stance-response") {
      const missingIssueIds = missing[1]
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0);
      if (missingIssueIds.length > 0) return { mode: "delta_rows", missingIssueIds };
    }
    return { mode: "transcription" };
  }
  if (args.resultText !== null && args.resultText.trim().length > 0) {
    return { mode: "transcription" };
  }
  return {
    mode: "unsalvageable",
    reason: "frozen attempt has neither a structured payload nor result text",
  };
}

/**
 * Merge delta stance rows into the partial payload. The partial payload's
 * rows win on duplicate issue_id (first-wins — the original model's accepted
 * semantics stay authoritative; the delta only fills the named gaps).
 */
export function mergeMissingStanceRows(
  partial: Record<string, unknown>,
  delta: Record<string, unknown>,
): Record<string, unknown> {
  const partialRows = Array.isArray(partial.stances) ? partial.stances : [];
  const deltaRows = Array.isArray(delta.stances) ? delta.stances : [];
  const seen = new Set(
    partialRows
      .map((row) =>
        typeof (row as Record<string, unknown>)?.issue_id === "string"
          ? ((row as Record<string, unknown>).issue_id as string)
          : null,
      )
      .filter((id): id is string => id !== null),
  );
  const merged = [
    ...partialRows,
    ...deltaRows.filter((row) => {
      const issueId = (row as Record<string, unknown>)?.issue_id;
      return typeof issueId === "string" && !seen.has(issueId);
    }),
  ];
  return { ...partial, stances: merged };
}

/**
 * Path A prompt — transcription only. The salvage model gets the frozen text
 * (and the validator error when one exists) and must transcribe, never
 * author: missing required content aborts via the sentinel.
 */
export function buildTranscriptionSalvagePrompt(args: {
  resultText: string;
  error: string;
}): string {
  return [
    "You are a transcription-only recovery worker. A previous worker produced",
    "the review content below but failed the structured submission contract.",
    "Transcribe that content into the required submission EXACTLY as written —",
    "do NOT add, infer, or repair any semantic content that is not present in",
    "the text. If any REQUIRED field's content is absent from the text, reply",
    `with exactly ${SALVAGE_INCOMPLETE_SENTINEL} and nothing else.`,
    "",
    `Original submission error: ${args.error}`,
    "",
    "--- FROZEN WORKER OUTPUT (transcribe from this only) ---",
    args.resultText,
    "--- END FROZEN WORKER OUTPUT ---",
  ].join("\n");
}

/**
 * Path B prompt — bounded delta completion. A fresh same-tier instance gets
 * the original unit packet (full semantic grounding) and must produce ONLY
 * the named missing rows; the runtime merges and re-validates.
 */
export function buildDeltaRowsSalvagePrompt(args: {
  boundedPrompt: string;
  missingIssueIds: string[];
}): string {
  return [
    args.boundedPrompt,
    "",
    "--- SALVAGE ADDENDUM (bounded delta completion) ---",
    "A previous submission for this unit was accepted except that it is",
    `missing the row(s) for: ${args.missingIssueIds.join(", ")}.`,
    "Submit a payload whose `stances` contains ONLY the missing row(s) listed",
    "above — do not restate rows for any other issue. Every other contract in",
    "the packet (schema, evidence boundaries, lens identity) applies unchanged.",
  ].join("\n");
}
