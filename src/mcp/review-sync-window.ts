export type ReviewSyncProfile = "full" | "simple";

// Bounded synchronous wait budgets (ms) for onto_review before it returns a
// running handle. These are MCP host-interaction transport timeouts, not LLM
// spec-boundary values (auth/model/effort/retry), so code defaults are allowed.
// The simple (.mcpb desktop) profile gets a modestly larger window so the
// fastest reviews can finish in-call; most core-axis reviews still exceed any
// host-safe window and return a handle — the host then recovers via
// onto_review_read(latest=true). Host responsiveness takes priority over in-call
// completion once the bound is reached.
export const REVIEW_RETURN_RUNNING_AFTER_MS_FULL = 25_000;
export const REVIEW_RETURN_RUNNING_AFTER_MS_SIMPLE = 45_000;

function parseMs(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  // Only a plain non-negative integer string is valid. Anything else — empty,
  // negative, decimals, trailing units ("10s"), or underscores ("30_000") —
  // falls back to the profile default rather than silently truncating via
  // parseInt (e.g. "30_000" would otherwise become 30ms).
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number.parseInt(trimmed, 10);
}

/**
 * Single-source resolution of the onto_review synchronous window by profile.
 * Named config: `full` ← `ONTO_MCP_REVIEW_RETURN_RUNNING_AFTER_MS`, `simple` ←
 * `ONTO_MCP_REVIEW_RETURN_RUNNING_AFTER_MS_SIMPLE`. Each falls back to its profile
 * default; invalid/negative/empty values fall back too (never throws). The two
 * envs are independent — there is no cross-profile application.
 */
export function resolveReviewReturnRunningAfterMs(
  profile: ReviewSyncProfile,
  env: { full?: string | undefined; simple?: string | undefined } = {},
): number {
  if (profile === "simple") {
    return parseMs(env.simple) ?? REVIEW_RETURN_RUNNING_AFTER_MS_SIMPLE;
  }
  return parseMs(env.full) ?? REVIEW_RETURN_RUNNING_AFTER_MS_FULL;
}
