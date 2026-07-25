/**
 * The author-facing half of the semantic map — rendering a projection into prompt text, and
 * projecting an author's answer back into a typed projection.
 *
 * Distinct from semantic-map-projection.ts (the shared vocabulary) and semantic-map-stage.ts (the
 * stage that orchestrates the run): this module owns the caps that bound what a rendered map may
 * contain (summary chars, boundaries per node, verify-response bytes) and the retry classification
 * that separates a transport failure worth retrying from a fail-fast contract violation.
 */
import path from "node:path";
import type { LlmCallConfig } from "../llm/llm-caller.js";
import { callJsonAuthor, isLlmTimeoutError } from "./authoring-llm-call.js";
import type { ReconstructLlmCall } from "./authoring-llm-call.js";
import {
  CODE_SEMANTIC_MAP_PROMPT_NOTE,
  SEMANTIC_MAP_PROMPT_NOTE,
} from "./authoring-system-prompts.js";
import type {
  CodeSemanticSeedBoundary,
  CodeSemanticSeedProjection,
  CodeSemanticSeedRefutedDisclosure,
  CodeSemanticSynthesisOutput,
} from "./comprehension-semantic-map-code.js";
import { ADVERSARIAL_RESULTS } from "./comprehension-semantic-map.js";
import type {
  SemanticBoundaryVerification,
  SemanticSeedBoundary,
  SemanticSeedProjection,
  SemanticSeedRefutedDisclosure,
  SemanticSynthesisOutput,
} from "./comprehension-semantic-map.js";
import type { ReconstructExecutionTelemetryCollector } from "./execution-telemetry.js";
import { isGracefulTerminalSignal } from "./graceful-terminal.js";
import { readReconstructLlmDispatchFailureError } from "./llm-dispatch-failure.js";
import {
  CODE_SEMANTIC_MAP_PROMPT_RENDER_CHAR_BUDGET,
  SEMANTIC_MAP_PROMPT_RENDER_CHAR_BUDGET,
} from "./semantic-map-projection.js";
import type {
  SemanticMapAnyProjection,
  SemanticMapArtifactKind,
} from "./semantic-map-projection.js";

/** §10.F5: maxTokens is a provider HINT, not a runtime cap — these deterministic caps are the
 *  enforced bound. Exceeding any = fail-closed throw (X5 column failure), never truncation. */
const SEMANTIC_MAP_SUMMARY_CHAR_CAP = 600;

const SEMANTIC_MAP_BOUNDARIES_PER_NODE_CAP = 16;

const SEMANTIC_MAP_BOUNDARY_CHAR_FIELD_CAP = 120;

const SEMANTIC_MAP_VERIFY_RESPONSE_BYTE_CAP = 2048;

/** §10.F3 conservative-syntactic retry predicate: ONLY timeout/spawn/network-class transport
 *  failures retry. Quota/auth/4xx-class provider errors FAIL FAST — retrying quota exhaustion
 *  makes a multi-hour run worse; uncertainty resolves to fail-fast. */
const SEMANTIC_MAP_TRANSPORT_RETRYABLE_ERROR =
  /(timed out|timeout_ms|reason=timeout|spawn|ENOENT|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|socket hang up|network error|fetch failed)/i;

const SEMANTIC_MAP_FAIL_FAST_ERROR =
  /(usage limit|quota|rate limit|401|403|unauthorized|forbidden|invalid_request|not supported|billing|invalid JSON and repair failed|\bauth\b|auth refresh|unauthenticated|\blogin\b|credential)/i;

/** §4 dispatch state machine: 1 logical dispatch → ≤3 process attempts (initial + 2 transport
 *  retries, exponential backoff) → each attempt may include callJsonAuthor's ≤1 parse-repair.
 *  Census counts logical dispatches; telemetry attempt rows record every real call. */
export async function callSemanticMapJsonAuthorWithRetry(args: {
  llmCall: ReconstructLlmCall;
  llmConfig: Partial<LlmCallConfig>;
  telemetry: ReconstructExecutionTelemetryCollector;
  artifactName: string;
  systemPrompt: string;
  userPayload: unknown;
  maxTokens: number;
  maxTransportAttempts?: 1 | 3;
  allowParseRepair?: boolean;
}): Promise<Record<string, unknown>> {
  let lastError: unknown;
  const maxAttempts = args.maxTransportAttempts ?? 3;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, attempt === 1 ? 1_000 : 3_000));
    }
    try {
      return await callJsonAuthor(args);
    } catch (error) {
      if (isGracefulTerminalSignal(error)) throw error;
      if (readReconstructLlmDispatchFailureError(error)) throw error;
      const message = error instanceof Error ? error.message : String(error);
      const retryable = !SEMANTIC_MAP_FAIL_FAST_ERROR.test(message) &&
        (isLlmTimeoutError(error) || SEMANTIC_MAP_TRANSPORT_RETRYABLE_ERROR.test(message));
      if (!retryable) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

/** §10.F2 declared-field DETERMINISTIC projection: extract exactly the contract fields from the
 *  LLM JSON (benign extra keys are stripped — contract-field extraction, not semantic patching);
 *  missing/mistyped/over-cap values fail closed. The module's exact-key validator still guards
 *  the bridge boundary downstream. */
export function projectSemanticMapSynthesisOutput(raw: Record<string, unknown>): SemanticSynthesisOutput {
  const summary = raw.semantic_summary;
  if (typeof summary !== "string" || summary.trim().length === 0) {
    throw new Error("semantic-map synthesize author: semantic_summary must be a non-empty string (fail-closed).");
  }
  if (summary.length > SEMANTIC_MAP_SUMMARY_CHAR_CAP) {
    throw new Error(`semantic-map synthesize author: semantic_summary exceeds the ${SEMANTIC_MAP_SUMMARY_CHAR_CAP}-char runtime cap (§10.F5 fail-closed, got ${summary.length}).`);
  }
  const rawBoundaries = raw.boundaries;
  if (!Array.isArray(rawBoundaries)) {
    throw new Error("semantic-map synthesize author: boundaries must be an array (fail-closed).");
  }
  if (rawBoundaries.length > SEMANTIC_MAP_BOUNDARIES_PER_NODE_CAP) {
    throw new Error(`semantic-map synthesize author: ${rawBoundaries.length} boundaries exceed the per-node cap ${SEMANTIC_MAP_BOUNDARIES_PER_NODE_CAP} (§10.F5 fail-closed).`);
  }
  const boundaries = rawBoundaries.map((entry, index) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(`semantic-map synthesize author: boundaries[${index}] must be an object (fail-closed).`);
    }
    const candidate = entry as Record<string, unknown>;
    const row = candidate.row;
    const before = candidate.character_before;
    const after = candidate.character_after;
    if (!Number.isSafeInteger(row)) {
      throw new Error(`semantic-map synthesize author: boundaries[${index}].row must be a safe integer (fail-closed).`);
    }
    if (typeof before !== "string" || typeof after !== "string") {
      throw new Error(`semantic-map synthesize author: boundaries[${index}] character fields must be strings (fail-closed).`);
    }
    if (before.length > SEMANTIC_MAP_BOUNDARY_CHAR_FIELD_CAP || after.length > SEMANTIC_MAP_BOUNDARY_CHAR_FIELD_CAP) {
      throw new Error(`semantic-map synthesize author: boundaries[${index}] character field exceeds the ${SEMANTIC_MAP_BOUNDARY_CHAR_FIELD_CAP}-char cap (§10.F5 fail-closed).`);
    }
    return { row: row as number, character_before: before, character_after: after };
  });
  return { semantic_summary: summary, boundaries };
}

export function projectSemanticMapVerifyVerdict(raw: Record<string, unknown>): SemanticBoundaryVerification {
  const serialized = JSON.stringify(raw);
  // BYTE cap (codex R1 review F5): UTF-16 .length under-counts multibyte payloads.
  if (Buffer.byteLength(serialized, "utf8") > SEMANTIC_MAP_VERIFY_RESPONSE_BYTE_CAP) {
    throw new Error(`semantic-map verify author: response exceeds the ${SEMANTIC_MAP_VERIFY_RESPONSE_BYTE_CAP}-byte runtime cap (§10.F5 fail-closed).`);
  }
  const verdict = raw.verdict;
  if (typeof verdict !== "string" || !(ADVERSARIAL_RESULTS as readonly string[]).includes(verdict)) {
    throw new Error(`semantic-map verify author: verdict must be EXACTLY one of ${ADVERSARIAL_RESULTS.join("|")} — got '${String(verdict)}' (no synonym mapping, fail-closed).`);
  }
  return verdict as SemanticBoundaryVerification;
}

/** §10.F2 declared-field projection, CODE variant (step 6 DD6): line-based boundary vocabulary,
 *  same runtime caps and fail-closed discipline as the spreadsheet projection. */
export function projectCodeSemanticMapSynthesisOutput(raw: Record<string, unknown>): CodeSemanticSynthesisOutput {
  const summary = raw.semantic_summary;
  if (typeof summary !== "string" || summary.trim().length === 0) {
    throw new Error("code-semantic-map synthesize author: semantic_summary must be a non-empty string (fail-closed).");
  }
  if (summary.length > SEMANTIC_MAP_SUMMARY_CHAR_CAP) {
    throw new Error(`code-semantic-map synthesize author: semantic_summary exceeds the ${SEMANTIC_MAP_SUMMARY_CHAR_CAP}-char runtime cap (§10.F5 fail-closed, got ${summary.length}).`);
  }
  const rawBoundaries = raw.boundaries;
  if (!Array.isArray(rawBoundaries)) {
    throw new Error("code-semantic-map synthesize author: boundaries must be an array (fail-closed).");
  }
  if (rawBoundaries.length > SEMANTIC_MAP_BOUNDARIES_PER_NODE_CAP) {
    throw new Error(`code-semantic-map synthesize author: ${rawBoundaries.length} boundaries exceed the per-node cap ${SEMANTIC_MAP_BOUNDARIES_PER_NODE_CAP} (§10.F5 fail-closed).`);
  }
  const boundaries = rawBoundaries.map((entry, index) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(`code-semantic-map synthesize author: boundaries[${index}] must be an object (fail-closed).`);
    }
    const candidate = entry as Record<string, unknown>;
    const line = candidate.line;
    const before = candidate.character_before;
    const after = candidate.character_after;
    if (!Number.isSafeInteger(line)) {
      throw new Error(`code-semantic-map synthesize author: boundaries[${index}].line must be a safe integer (fail-closed).`);
    }
    if (typeof before !== "string" || typeof after !== "string") {
      throw new Error(`code-semantic-map synthesize author: boundaries[${index}] character fields must be strings (fail-closed).`);
    }
    if (before.length > SEMANTIC_MAP_BOUNDARY_CHAR_FIELD_CAP || after.length > SEMANTIC_MAP_BOUNDARY_CHAR_FIELD_CAP) {
      throw new Error(`code-semantic-map synthesize author: boundaries[${index}] character field exceeds the ${SEMANTIC_MAP_BOUNDARY_CHAR_FIELD_CAP}-char cap (§10.F5 fail-closed).`);
    }
    return { line: line as number, character_before: before, character_after: after };
  });
  return { semantic_summary: summary, boundaries };
}

/** DD10 per-kind render budget selector — the single point where a render surface picks its
 *  budget (every renderSemanticMapProjection caller routes through this, never the raw consts). */
export function semanticMapRenderCharBudget(kind: SemanticMapArtifactKind): number {
  return kind === "code"
    ? CODE_SEMANTIC_MAP_PROMPT_RENDER_CHAR_BUDGET
    : SEMANTIC_MAP_PROMPT_RENDER_CHAR_BUDGET;
}

/** DD10: render-surface file label — artifact 권위는 절대경로 유지, 라벨만 root-상대화
 *  (실측 절대경로 ~81자/노드가 budget을 잠식한 7b 기아 요인 ②). Non-absolute fixture paths pass
 *  through unchanged; a file outside root renders as `../…` (허용 — 리뷰 inv MN2 확인). */
function semanticMapFileLabel(labelRoot: string | null, file: string): string {
  // typeof guard (not !== null): tests are outside the tsc project, so an arity-loose JS caller
  // can leak `undefined` here — that must degrade to v1 passthrough, never path.relative(undefined).
  return typeof labelRoot === "string" && path.isAbsolute(file) ? path.relative(labelRoot, file) : file;
}

/** W4 §4 shared renderer — BOTH prompt surfaces ((A) seed payload field, (B) observation-prompt
 *  replace) derive from this one projection-to-prompt shape (single truth). Deterministic; bounded
 *  by a REQUIRED char budget with AUTHORITATIVE totals + an explicit truncation flag (onto-R2
 *  issue-012: never a silent drop). */
export function renderSemanticMapProjection(
  projection: SemanticSeedProjection | CodeSemanticSeedProjection,
  charBudget: number,
  /** (B) inline renders carry the caveat note; seed payload renders omit it (hoisted ONCE into the
   *  seed system prompt — onto W4 issue-001/002/005 note-duplication). */
  includeNote: boolean,
  /** Step 6 (DD9): which artifact's caveat NOTE to render when includeNote — row vocabulary is
   *  derived from each node's node_ref shape (discriminated union), but an EMPTY projection has no
   *  node to sniff, so the note kind is caller-declared. */
  noteKind: SemanticMapArtifactKind,
  /** DD10 (리뷰 inv MN2): REQUIRED so the compiler forces every render surface — resume 검증
   *  사이트 포함 — to decide its label root. null = v1 absolute-passthrough (spreadsheet-only
   *  surfaces / legacy script callers without a project root). */
  labelRoot: string | null,
): Record<string, unknown> {
  if (!Number.isSafeInteger(charBudget) || charBudget <= 0) {
    throw new Error(`semantic-map render: charBudget must be a positive safe integer, got ${charBudget} (issue-012 fail-loud).`);
  }
  // W4 code cross-validation (codex W4-002 ≡ onto issue-001/002/004/005 — two-family convergence):
  // the budget bounds the ACTUAL prompt serialization (callJsonAuthor uses
  // JSON.stringify(payload, null, 2)) of the WHOLE returned envelope, measured EXACTLY per
  // admission (candidate-envelope test — an incremental per-node estimate under-counted nesting
  // indentation; the original compact-JSON node-only model under-counted ~2x: budget 4000 → 7753
  // real chars). Post-condition: pretty(returned) ≤ charBudget, or fail-loud below. The per-surface
  // wrapper around this render ({observation_id} on the seed field / the provisional_labels key +
  // preserved not_examined_capped on (B)) is O(1)-bounded per observation and NOT charged here.
  const nodes: Record<string, unknown>[] = [];
  const refutedRows: Record<string, unknown>[] = [];
  const envelope: Record<string, unknown> = {
    authority: "non_authoritative",
    provisional: true,
    ...(includeNote
      ? { note: noteKind === "code" ? CODE_SEMANTIC_MAP_PROMPT_NOTE : SEMANTIC_MAP_PROMPT_NOTE }
      : {}),
    nodes,
    nodes_total: projection.nodes_total,
    // W4 review W4-004 (design §4 honesty): the refuted DISCLOSURE rows are prompt-visible, not
    // only their total — bounded rows first, budget-counted like nodes.
    refuted_disclosure: refutedRows,
    refuted_disclosure_total: projection.refuted_disclosure_total,
    unanchored_unverified_total: projection.unanchored_unverified_total,
    render_truncated: false,
  };
  const measure = (): number => JSON.stringify(envelope, null, 2).length;
  if (measure() > charBudget) {
    // Deterministic misconfiguration (fixed envelope+note vs the budget const), not a data
    // condition — silently returning an over-budget "bounded" render would void the contract.
    throw new Error(
      `semantic-map render: charBudget ${charBudget} cannot fit the empty render envelope (${measure()} chars) — raise the budget (fail-loud, no silent overshoot).`,
    );
  }
  let truncated = false;
  // Nodes admit FIRST (the map's primary content); disclosure rows take the remaining budget —
  // the reverse order would let max_disclosure-many rows starve the summaries the seed consumes.
  // Step 6 (DD9): row vocabulary branches on the node_ref DISCRIMINATED union ("sheet" narrows to
  // the spreadsheet region, else code) — a loose union rendered through one shape would emit
  // "undefined#undefined:…" region labels and silently pollute the seed prompt (리뷰 ct-F3).
  for (const node of projection.nodes) {
    nodes.push(
      "sheet" in node.node_ref
        ? {
            region: `${node.node_ref.sheet}#${node.node_ref.column_index}:${node.node_ref.row_start}-${node.node_ref.row_end}`,
            summary: node.semantic_summary,
            boundaries: (node.boundaries as SemanticSeedBoundary[]).map((b) => ({
              row: b.row,
              before: b.character_before,
              after: b.character_after,
              disposition: b.disposition,
            })),
          }
        : {
            region: `${semanticMapFileLabel(labelRoot, node.node_ref.file)}:${node.node_ref.line_start}-${node.node_ref.line_end}`,
            summary: node.semantic_summary,
            boundaries: (node.boundaries as CodeSemanticSeedBoundary[]).map((b) => ({
              line: b.line,
              before: b.character_before,
              after: b.character_after,
              disposition: b.disposition,
            })),
          },
    );
    if (measure() > charBudget) {
      nodes.pop();
      truncated = true;
      break; // canonical order — the drop is the deterministic TAIL, and totals stay authoritative.
    }
  }
  for (const refuted of projection.refuted_disclosure) {
    refutedRows.push(
      "sheet" in refuted.node_ref
        ? {
            region: `${refuted.node_ref.sheet}#${refuted.node_ref.column_index}:${refuted.node_ref.row_start}-${refuted.node_ref.row_end}`,
            row: (refuted as SemanticSeedRefutedDisclosure).row,
            before: refuted.character_before,
            after: refuted.character_after,
          }
        : {
            region: `${semanticMapFileLabel(labelRoot, refuted.node_ref.file)}:${refuted.node_ref.line_start}-${refuted.node_ref.line_end}`,
            line: (refuted as CodeSemanticSeedRefutedDisclosure).line,
            before: refuted.character_before,
            after: refuted.character_after,
          },
    );
    if (measure() > charBudget) {
      refutedRows.pop();
      truncated = true;
      break;
    }
  }
  // Flipping false→true SHRINKS the serialization by 1 char, so the measured bound still holds.
  envelope.render_truncated = truncated;
  return envelope;
}

/** Step 6 (DD9)/DD10 discriminator over a PROJECTION: code ⇔ a node/disclosure node_ref carries
 *  `file` (the same sniff appendSemanticMapSeedNotes uses); an empty projection defaults to
 *  spreadsheet (note-kind caller-declared 규약과 동일 — X5상 map_present projection은 비지 않음). */
export function semanticMapProjectionKind(projection: SemanticMapAnyProjection): SemanticMapArtifactKind {
  const ref = projection.nodes[0]?.node_ref ?? projection.refuted_disclosure[0]?.node_ref;
  return ref && "file" in ref ? "code" : "spreadsheet";
}
