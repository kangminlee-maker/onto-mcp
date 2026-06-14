export type ReviewReadProjection = "compact" | "standard" | "full";
export type ReviewReadMode = "status" | "result";

/**
 * Single-source routing contract for `onto_review_read`.
 *
 * Returns the terminal result projection only when the review has a readable
 * ReviewRecord — `completed` or `completed_with_degradation` — and the caller is
 * not polling at `compact`. Every other state (`prepared`, `running`,
 * `halted_partial`, `failed`, `unknown`) returns the status/recovery projection.
 *
 * This is deliberately narrower than "terminal": `halted_partial` and `failed`
 * are terminal but have no ReviewRecord, and `getReviewResult` throws while no
 * record exists. Routing those to status keeps the single read surface from
 * erroring on a terminal-but-incomplete session.
 */
export function reviewReadMode(
  status: string,
  projection: ReviewReadProjection,
): ReviewReadMode {
  const resultReadable =
    status === "completed" || status === "completed_with_degradation";
  return resultReadable && projection !== "compact" ? "result" : "status";
}
