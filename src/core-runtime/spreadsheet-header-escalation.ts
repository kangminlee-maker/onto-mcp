/**
 * P0.5 header escalation (design §10 C′ / §11 ESC-1) — a SEPARATE named step that
 * runs AFTER the deterministic observer, never inside it. The observer flags a
 * sheet whose header is ambiguous (e.g. a headerless all-text sheet whose first
 * DATA row scored as labels) with `header_confidence: "low"`. For those sheets
 * this step asks an LLM to resolve the header row under a strict bounded-submit
 * contract, with a deterministic replay cache and a fail-soft downgrade to the
 * heuristic when the model is unavailable or answers out of contract.
 *
 * LLM authority is narrow (capability-boundary): the model returns ONLY a
 * header-row index (or null); code owns the trigger gate, the submission
 * validation, the cache key, the downgrade policy, and the recorded provenance.
 * The model is injected so this module stays deterministic under test; production
 * wiring adapts the in-process llm caller to {@link HeaderEscalationLlm}. This
 * module is intentionally unwired — consumers (reconstruct seed-stage / review)
 * call it as a post-observation step.
 */
import crypto from "node:crypto";
import { SPREADSHEET_OBSERVER_ADAPTER_VERSION } from "./spreadsheet-structure-observer.js";

/** Bumped when the escalation prompt/contract changes — folds into the cache key
 *  so a contract change invalidates prior decisions (design §11 CACHE-1). */
export const HEADER_ESCALATION_TRIGGER_VERSION = 1;

/** Rows shown to the model — the leading window the observer also scans. */
export const ESCALATION_ROW_WINDOW = 15;
/** Columns shown to the model — bounds the prompt for very wide sheets. */
export const ESCALATION_COL_WINDOW = 40;
/** Per-cell char cap in the rendered prompt, to keep the payload bounded. */
const ESCALATION_CELL_CHAR_CAP = 40;
/** Default abort budget for a model call — a hung adapter downgrades, not stalls. */
const DEFAULT_ESCALATION_TIMEOUT_MS = 30_000;

export type HeaderSource = "heuristic" | "llm";

export type HeaderDowngradeReason = "llm_unavailable" | "invalid_submission";

export interface HeaderHeuristic {
  headerRowIndex: number | null;
  confidence: "high" | "low";
}

export interface HeaderEscalationCandidate {
  sheetName: string;
  /** The leading rows (cells) of the sheet, already bounded upstream. */
  rows: string[][];
  colCount: number;
  heuristic: HeaderHeuristic;
}

export interface ResolvedHeader {
  sheetName: string;
  headerRowIndex: number | null;
  confidence: "high" | "low";
  source: HeaderSource;
  /** Present only when escalation was attempted but fell back to the heuristic. */
  downgradeReason?: HeaderDowngradeReason;
}

/** The model's bounded submission — the ONLY field code accepts. */
export interface HeaderEscalationSubmission {
  header_row_index: number | null;
}

/** Injected model call. Returns the parsed submission (production wiring parses
 *  the model's JSON before calling); throws when the model is unavailable. */
export type HeaderEscalationLlm = (args: {
  prompt: string;
  promptHash: string;
}) => Promise<unknown>;

export interface HeaderEscalationCache {
  get(key: string): ResolvedHeader | undefined;
  set(key: string, value: ResolvedHeader): void;
}

export interface HeaderEscalationModel {
  id: string;
  effort: string;
}

export interface HeaderEscalationOptions {
  llm: HeaderEscalationLlm;
  model: HeaderEscalationModel;
  /** Source content hash — design §11 CACHE-1 anchor. */
  contentSha256: string;
  /** Hash of the data-layer caps the observer used (a cache key component). */
  dataLayerCapsHash: string;
  cache?: HeaderEscalationCache;
  /** Abort budget for the model call (ms). A hung adapter downgrades to the
   *  heuristic instead of stalling. Default {@link DEFAULT_ESCALATION_TIMEOUT_MS}. */
  timeoutMs?: number;
}

/** Races the injected model call against an abort budget so a never-settling
 *  adapter rejects (→ `llm_unavailable`) instead of hanging the await. The timer
 *  is cleared when the model settles first; a late settle after timeout is
 *  ignored (no unhandled rejection). */
function callLlmWithTimeout(
  llm: HeaderEscalationLlm,
  args: { prompt: string; promptHash: string },
  timeoutMs: number,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("header_escalation_timeout"));
    }, timeoutMs);
    llm(args).then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

function renderRowsTable(rows: string[][], colCount: number): string {
  const cols = Math.min(colCount, ESCALATION_COL_WINDOW);
  const colSuffix = colCount > cols ? ` | … (+${colCount - cols} cols)` : "";
  return rows
    .slice(0, ESCALATION_ROW_WINDOW)
    .map((row, index) => {
      const cells = Array.from({ length: cols }, (_, col) =>
        (row[col] ?? "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, ESCALATION_CELL_CHAR_CAP),
      );
      return `row ${index}: ${cells.map((cell) => cell || "∅").join(" | ")}${colSuffix}`;
    })
    .join("\n");
}

/** Bounded prompt: the leading rows + the exact JSON contract. Deterministic in
 *  the candidate, so its hash anchors the replay cache. */
export function renderHeaderPrompt(candidate: HeaderEscalationCandidate): string {
  const shown = Math.min(candidate.rows.length, ESCALATION_ROW_WINDOW);
  return [
    `Sheet "${candidate.sheetName}" has an ambiguous header. Its first ${shown} rows (0-indexed) are below.`,
    `Identify the single row that is the column HEADER (labels, not data). If the sheet has no header row, answer null.`,
    ``,
    renderRowsTable(candidate.rows, candidate.colCount),
    ``,
    `Reply with ONLY this JSON and no other fields: {"header_row_index": <0-based row index, or null>}.`,
  ].join("\n");
}

function shortHash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export interface HeaderEscalationCacheKeyParts {
  contentSha256: string;
  extractorVersion: number;
  triggerVersion: number;
  promptHash: string;
  modelId: string;
  effort: string;
  dataLayerCapsHash: string;
  sheetName: string;
}

/** Deterministic replay key (design §11 CACHE-1): any drift in content,
 *  extractor/trigger version, prompt, model id/effort, or data-layer caps yields
 *  a fresh key, invalidating a stale decision. */
export function headerEscalationCacheKey(parts: HeaderEscalationCacheKeyParts): string {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify([
        parts.contentSha256,
        parts.extractorVersion,
        parts.triggerVersion,
        parts.promptHash,
        parts.modelId,
        parts.effort,
        parts.dataLayerCapsHash,
        parts.sheetName,
      ]),
    )
    .digest("hex");
}

/** Strict bounded-submit validation: accept ONLY `{ header_row_index }` with an
 *  in-range integer or null; reject extra/unknown fields, wrong types, and
 *  out-of-range indices (the model owns no other field). */
export function parseHeaderSubmission(
  raw: unknown,
  rowCount: number,
): HeaderEscalationSubmission | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const keys = Object.keys(raw);
  if (keys.length !== 1 || keys[0] !== "header_row_index") return null;
  const value = (raw as Record<string, unknown>).header_row_index;
  if (value === null) return { header_row_index: null };
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < 0 || value >= rowCount) return null;
  return { header_row_index: value };
}

/**
 * Resolve a sheet's header row, escalating to the model only when the heuristic
 * was ambiguous. A high-confidence heuristic is trusted as-is. Returns the
 * heuristic (with a `downgradeReason`) whenever the model is unavailable or
 * answers out of contract, so escalation never blocks observation. Only
 * successful LLM resolutions are cached (a transient downgrade re-attempts next
 * run).
 */
export async function escalateHeader(
  candidate: HeaderEscalationCandidate,
  options: HeaderEscalationOptions,
): Promise<ResolvedHeader> {
  const heuristic: ResolvedHeader = {
    sheetName: candidate.sheetName,
    headerRowIndex: candidate.heuristic.headerRowIndex,
    confidence: candidate.heuristic.confidence,
    source: "heuristic",
  };
  if (candidate.heuristic.confidence === "high") return heuristic;

  const prompt = renderHeaderPrompt(candidate);
  const promptHash = shortHash(prompt);
  const cacheKey = headerEscalationCacheKey({
    contentSha256: options.contentSha256,
    extractorVersion: SPREADSHEET_OBSERVER_ADAPTER_VERSION,
    triggerVersion: HEADER_ESCALATION_TRIGGER_VERSION,
    promptHash,
    modelId: options.model.id,
    effort: options.model.effort,
    dataLayerCapsHash: options.dataLayerCapsHash,
    sheetName: candidate.sheetName,
  });

  const cached = options.cache?.get(cacheKey);
  if (cached) return cached;

  let raw: unknown;
  try {
    raw = await callLlmWithTimeout(
      options.llm,
      { prompt, promptHash },
      options.timeoutMs ?? DEFAULT_ESCALATION_TIMEOUT_MS,
    );
  } catch {
    return { ...heuristic, downgradeReason: "llm_unavailable" };
  }

  // Validate against the rendered window, not the full row count: the model can
  // only legitimately pick a row it was shown.
  const windowRowCount = Math.min(candidate.rows.length, ESCALATION_ROW_WINDOW);
  const submission = parseHeaderSubmission(raw, windowRowCount);
  if (!submission) {
    return { ...heuristic, downgradeReason: "invalid_submission" };
  }

  const resolved: ResolvedHeader = {
    sheetName: candidate.sheetName,
    headerRowIndex: submission.header_row_index,
    confidence: "high",
    source: "llm",
  };
  options.cache?.set(cacheKey, resolved);
  return resolved;
}
