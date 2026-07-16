/**
 * M3 attribution judge — the injected `DefectAttributionJudge` backed by a real
 * LLM (Opus 4.8, owner decision 2026-07-16: strongest model, independent of the
 * benchmarked review models, version-pinned for replay determinism).
 *
 * It maps each surfaced material ISSUE to the seeded defect(s) it genuinely
 * names, refute-by-default. Attribution is a SEMANTIC judgment — the whole point
 * of using a judge instead of lexical token matching (design §3-1, review F1):
 * shared schema vocabulary is NOT attribution; the issue must actually describe
 * the seeded defect's problem at its location.
 *
 * The LLM dispatch is injected (`AttributionDispatch`) so the parse/coverage
 * logic is unit-testable with a stub and no spend. In production
 * `anthropicJudgeDispatch` calls Opus 4.8; the judge output is captured so a
 * score replays deterministically (design §5 P0).
 */
import type {
  DefectAttributionJudge,
  IssueAttribution,
  SeededDefect,
  SurfacedIssue,
} from "./m3-defect-spectrum.ts";

/** Pinned for replay / provenance — the judge is a measurement instrument. */
export const JUDGE_MODEL_ID = "claude-opus-4-8";

/** Judge output-token budget. Single-sourced so the api_key cap and any route
 *  that honors max_tokens never silently diverge. */
export const JUDGE_MAX_TOKENS = 8192;

/**
 * Extract the first balanced top-level JSON object from text that may be wrapped
 * in prose or code fences (a low-effort model can prepend/append explanation).
 * Inlined — self-contained benchmark util, deliberately NOT importing the
 * review-runtime executor (that would pull the whole review-execution stack into
 * the M3 load graph). Returns the original text when no `{` is present so the
 * JSON parse fails with a clear message.
 */
export function extractJsonObjectText(text: string): string {
  const start = text.indexOf("{");
  if (start === -1) return text;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const ch = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return text.slice(start);
}

export const ATTRIBUTION_JUDGE_SYSTEM_PROMPT = [
  "You are an INDEPENDENT attribution judge for an ontology-review benchmark. You are given:",
  "  - seeded_defects: the ground-truth conceptual defects deliberately planted in a target artifact, each with an id, kind, where (the schema location), and description.",
  "  - surfaced_issues: the material issues a review produced, each with an issue_id, issue_statement, severity, where (the schema location(s) the issue targets), and evidence_refs (supporting locations).",
  "For EACH surfaced issue, decide which seeded defect(s) — if any — the issue GENUINELY identifies.",
  "",
  "RULES:",
  "  1. Refute by default. Attribute an issue to a seeded defect ONLY if the issue_statement actually describes THAT defect's problem at THAT location — compare the issue's `where`/`evidence_refs` against the defect's `where`. When in doubt, do not attribute.",
  "  2. Conceptual match, never vocabulary match. Sharing a schema identifier or keyword with a defect's description is NOT attribution — the issue must describe the same underlying problem. (An issue that merely quotes the schema while making a different point attributes to nothing.)",
  "  3. An issue may identify MULTIPLE seeded defects (list every id it genuinely names) or NONE (empty list — this is an out-of-scope or fabricated issue).",
  "  4. Only use seeded defect ids from the provided list. Never invent an id.",
  "  5. Answer EVERY surfaced issue exactly once.",
  "",
  'OUTPUT: reply with ONLY a JSON object, no prose, no code fences: {"attributions":[{"issue_id":"<id>","attributed_defect_ids":["<defect-id>",...]}]}',
].join("\n");

/** Compact, judge-facing projection of the scoring inputs. */
export function buildAttributionUserPrompt(
  issues: readonly SurfacedIssue[],
  seededDefects: readonly SeededDefect[],
): string {
  return JSON.stringify({
    seeded_defects: seededDefects.map((d) => ({
      id: d.id,
      kind: d.kind,
      where: d.where,
      description: d.description,
    })),
    surfaced_issues: issues.map((i) => ({
      issue_id: i.issue_id,
      issue_statement: i.issue_statement,
      severity: i.severity,
      where: i.where,
      evidence_refs: i.evidence_refs,
    })),
  });
}

/**
 * Validate a judge response into attributions, one per surfaced issue in input
 * order. Enforces JSON shape and exact issue coverage (no omitted / unknown /
 * duplicate issue) — a judge that silently drops an issue is a judge failure,
 * caught here with a judge-specific message. Seeded-defect-id validity is left
 * to the scorer (its own guard), so the two layers don't duplicate it.
 */
export function parseAttributionResponse(
  text: string,
  issues: readonly SurfacedIssue[],
): IssueAttribution[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonObjectText(text));
  } catch (e) {
    throw new Error(`attribution judge: response is not valid JSON — ${(e as Error).message}`);
  }
  const rows = (parsed as Record<string, unknown> | null)?.attributions;
  if (!Array.isArray(rows)) {
    throw new Error("attribution judge: response.attributions must be an array");
  }
  const byIssue = new Map<string, string[]>();
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const issueId = r?.issue_id;
    if (typeof issueId !== "string") {
      throw new Error("attribution judge: each attribution needs a string issue_id");
    }
    if (byIssue.has(issueId)) {
      throw new Error(`attribution judge: duplicate issue_id ${issueId} in response`);
    }
    const ids = r?.attributed_defect_ids;
    if (!Array.isArray(ids) || ids.some((x) => typeof x !== "string")) {
      throw new Error(`attribution judge: attributed_defect_ids for ${issueId} must be a string array`);
    }
    byIssue.set(issueId, [...new Set(ids as string[])]);
  }
  const inputIds = new Set(issues.map((i) => i.issue_id));
  for (const id of byIssue.keys()) {
    if (!inputIds.has(id)) {
      throw new Error(`attribution judge: response names unknown issue ${id}`);
    }
  }
  return issues.map((issue) => {
    const ids = byIssue.get(issue.issue_id);
    if (!ids) {
      throw new Error(`attribution judge: response omitted issue ${issue.issue_id}`);
    }
    return { issue_id: issue.issue_id, attributed_defect_ids: ids };
  });
}

/** Injected LLM dispatch — production binds Opus 4.8; tests pass a stub. */
export type AttributionDispatch = (
  systemPrompt: string,
  userPrompt: string,
) => Promise<{ text: string }>;

/** Anthropic auth route for the judge. The two routes are NON-equivalent
 *  instruments (different token ceilings / thinking mechanics), so the chosen
 *  route is recorded in the capture for provenance. */
export type AttributionAuth = "api_key" | "oauth";

/**
 * The one production dispatch: Opus 4.8 via the runtime's `callLlm`. This is the
 * single site that owns the callLlm config (route, model, token budget, effort),
 * so no two copies can silently diverge.
 *
 * - `api_key` → anthropic SDK (needs ANTHROPIC_API_KEY); honors max_tokens.
 * - `oauth`   → claude CLI via the claude_code execution adapter.
 * `effort` is PINNED by the caller (an effort-unset judge showed a ~40× thinking
 * swing that flipped bands — design §3-3); passed through only when set.
 */
export function anthropicJudgeDispatch(opts: {
  auth: AttributionAuth;
  effort?: string;
  maxTokens?: number;
}): AttributionDispatch {
  const maxTokens = opts.maxTokens ?? JUDGE_MAX_TOKENS;
  return async (systemPrompt, userPrompt) => {
    const { callLlm } = await import("../src/core-runtime/llm/llm-caller.ts");
    const base =
      opts.auth === "oauth"
        ? { provider: "anthropic" as const, execution_adapter: "claude_code" as const, model_id: JUDGE_MODEL_ID }
        : { provider: "anthropic" as const, model_id: JUDGE_MODEL_ID };
    const result = await callLlm(systemPrompt, userPrompt, {
      ...base,
      max_tokens: maxTokens,
      ...(opts.effort ? { reasoning_effort: opts.effort } : {}),
    });
    return { text: result.text };
  };
}

/**
 * Build a `DefectAttributionJudge` over an injected `dispatch` (production passes
 * `anthropicJudgeDispatch(...)`; tests pass a stub). Empty issue lists never
 * dispatch (no spend, no dead LLM call).
 */
export function createAttributionJudge(opts: { dispatch: AttributionDispatch }): DefectAttributionJudge {
  const { dispatch } = opts;
  return async ({ issues, seededDefects }) => {
    if (issues.length === 0) return [];
    const { text } = await dispatch(
      ATTRIBUTION_JUDGE_SYSTEM_PROMPT,
      buildAttributionUserPrompt(issues, seededDefects),
    );
    return parseAttributionResponse(text, issues);
  };
}
