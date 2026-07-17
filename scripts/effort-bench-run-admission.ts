/**
 * Effort-bench run admission + cost capture (adaptive-effort design §4-4/§4-6,
 * P1 items ⑤ and ⑦).
 *
 * Admission (finding R2-4): a review run enters a benchmark cell ONLY when the
 * session's context manifest carries the post-precedence embed-budget witness
 * (`embed_budget.max_embed_lines_effective`, persisted by the packet stage —
 * the P0 field this module is the consumer of) and that effective value
 * EXACTLY equals the cell's intended knob. The plan-time `max_embed_lines`
 * field is prepare-time and cannot witness a CLI override; a session without
 * the witness (any pre-witness session) is inadmissible — fail-closed, never
 * "probably fine".
 *
 * Cost capture (§4-6, reporting-only — cost is never a gate): the worker
 * execution path does not persist provider token counts, so the deterministic
 * capture from execution-result.yaml is:
 *   - durationMs   = total_duration_ms (whole-pipeline wall-time),
 *   - promptChars  = Σ packet_bytes over LEAF execution entries,
 *   - outputChars  = Σ output_bytes  over LEAF execution entries,
 * where leaf entries are lens_execution_results + issue_artifact_execution_results
 * + deliberation_execution_results + (synthesize child_results when present,
 * else the synthesize parent). The synthesize parent's own byte fields measure
 * stage artifacts (work-items / ledger), not the per-issue dispatches — summing
 * parent AND children would double-count the stage. Bytes stand in for the
 * char-scale fields (UTF-8 proxy; providerTokens is honestly omitted).
 *
 * `assembleBenchRun` composes both into a schema-valid `m3-bench-run/1` row
 * via the P0 ingest validator (`parseM3BenchRun`) — the only path a run takes
 * into the zone calibration report.
 */

import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import type { EffortCostSummary } from "../src/core-runtime/effort-frontier.js";
import {
  parseM3BenchRun,
  M3_BENCH_RUN_SCHEMA_VERSION,
  type GradedMetrics,
  type M3BenchRun,
} from "../src/core-runtime/effort-calibration-graded.js";
import type { ReviewEmbedBudgetWitness } from "../src/core-runtime/review/artifact-types.js";

function fail(msg: string): never {
  throw new Error(`effort-bench-run-admission: ${msg}`);
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const WITNESS_SOURCES = new Set(["cli", "plan", "default"]);

/**
 * Extract the embed-budget witness from a parsed review-context-manifest
 * document. A manifest without the witness field marks a pre-witness session:
 * inadmissible as a bench run (the treatment cannot be verified after the fact).
 */
export function parseEmbedBudgetWitness(manifestDoc: unknown): ReviewEmbedBudgetWitness {
  if (!isRecord(manifestDoc)) fail("context manifest must be an object");
  const budget = manifestDoc.embed_budget;
  if (budget === undefined) {
    fail(
      "context manifest has no embed_budget witness — pre-witness sessions are inadmissible as bench runs (design §4-4, R2-4)",
    );
  }
  if (!isRecord(budget)) fail("embed_budget must be an object");
  const effective = budget.max_embed_lines_effective;
  if (!Number.isInteger(effective) || (effective as number) < 1) {
    fail(
      `embed_budget.max_embed_lines_effective must be a positive integer, got ${JSON.stringify(effective)}`,
    );
  }
  const source = budget.max_embed_lines_source;
  if (typeof source !== "string" || !WITNESS_SOURCES.has(source)) {
    fail(
      `embed_budget.max_embed_lines_source must be one of cli|plan|default, got ${JSON.stringify(source)}`,
    );
  }
  return {
    max_embed_lines_effective: effective as number,
    max_embed_lines_source: source as ReviewEmbedBudgetWitness["max_embed_lines_source"],
  };
}

/** Read + parse the witness from a session/evidence directory. */
export async function loadEmbedBudgetWitness(sessionDir: string): Promise<ReviewEmbedBudgetWitness> {
  const manifestPath = path.join(sessionDir, "execution-preparation", "review-context-manifest.yaml");
  let raw: string;
  try {
    raw = await fs.readFile(manifestPath, "utf8");
  } catch {
    fail(
      `no review-context-manifest.yaml under ${sessionDir} — cannot witness the embed budget; the run is inadmissible`,
    );
  }
  return parseEmbedBudgetWitness(YAML.parse(raw));
}

/**
 * The bench admission assert (design §9): the witnessed effective embed budget
 * must EXACTLY equal the cell's intended knob. Equality is the whole contract —
 * the source is diagnostic only (an arm whose intended knob coincides with the
 * default receives the identical treatment either way; ITT is about the policy
 * applied, not the channel).
 */
export function assertRunAdmission(
  witness: ReviewEmbedBudgetWitness,
  intendedMaxEmbedLines: number,
): void {
  if (!Number.isInteger(intendedMaxEmbedLines) || intendedMaxEmbedLines < 1) {
    fail(`intended max_embed_lines must be a positive integer, got ${intendedMaxEmbedLines}`);
  }
  if (witness.max_embed_lines_effective !== intendedMaxEmbedLines) {
    fail(
      `run rejected: witnessed max_embed_lines_effective=${witness.max_embed_lines_effective} (source=${witness.max_embed_lines_source}) != intended knob ${intendedMaxEmbedLines}`,
    );
  }
}

interface UnitBytes {
  packet_bytes: number;
  output_bytes: number;
}

const requireUnitBytes = (v: unknown, label: string): UnitBytes => {
  if (!isRecord(v)) fail(`${label} must be an object`);
  const packet = v.packet_bytes;
  const output = v.output_bytes;
  if (!Number.isInteger(packet) || (packet as number) < 0) {
    fail(`${label}.packet_bytes must be a non-negative integer, got ${JSON.stringify(packet)}`);
  }
  if (!Number.isInteger(output) || (output as number) < 0) {
    fail(`${label}.output_bytes must be a non-negative integer, got ${JSON.stringify(output)}`);
  }
  return { packet_bytes: packet as number, output_bytes: output as number };
};

const LEAF_COLLECTIONS = [
  "lens_execution_results",
  "issue_artifact_execution_results",
  "deliberation_execution_results",
] as const;

/** Deterministic whole-pipeline cost projection from execution-result.yaml. */
export function extractExecutionCost(executionResultDoc: unknown): EffortCostSummary {
  if (!isRecord(executionResultDoc)) fail("execution result must be an object");
  const total = executionResultDoc.total_duration_ms;
  if (!Number.isInteger(total) || (total as number) < 0) {
    fail(`total_duration_ms must be a non-negative integer, got ${JSON.stringify(total)}`);
  }
  const leaves: UnitBytes[] = [];
  for (const key of LEAF_COLLECTIONS) {
    const rows = executionResultDoc[key];
    if (rows === undefined || rows === null) continue;
    if (!Array.isArray(rows)) fail(`${key} must be a list when present`);
    rows.forEach((row, i) => leaves.push(requireUnitBytes(row, `${key}[${i}]`)));
  }
  const synthesize = executionResultDoc.synthesize_execution_result;
  if (synthesize !== undefined && synthesize !== null) {
    if (!isRecord(synthesize)) fail("synthesize_execution_result must be an object");
    const children = synthesize.child_results;
    if (Array.isArray(children) && children.length > 0) {
      children.forEach((row, i) =>
        leaves.push(requireUnitBytes(row, `synthesize_execution_result.child_results[${i}]`)),
      );
    } else {
      leaves.push(requireUnitBytes(synthesize, "synthesize_execution_result"));
    }
  }
  if (leaves.length === 0) {
    fail("execution result has no leaf execution entries — nothing to cost");
  }
  return {
    durationMs: total as number,
    promptChars: leaves.reduce((acc, u) => acc + u.packet_bytes, 0),
    outputChars: leaves.reduce((acc, u) => acc + u.output_bytes, 0),
  };
}

export interface AssembleBenchRunArgs {
  zone: string;
  effort: string;
  fixture: string;
  rep: number;
  metrics: GradedMetrics;
  judge_runs?: number;
  /** Parsed review-context-manifest.yaml of the candidate session. */
  contextManifest: unknown;
  /** Parsed execution-result.yaml of the candidate session. */
  executionResult: unknown;
  /** The cell's registered knob value this run was supposed to receive. */
  intendedMaxEmbedLines: number;
}

/**
 * Admit one review session into a bench cell: witness assert → cost capture →
 * schema-validated `m3-bench-run/1` row. Throws (and admits nothing) on any
 * witness mismatch or malformed artifact.
 */
export function assembleBenchRun(args: AssembleBenchRunArgs): M3BenchRun {
  const witness = parseEmbedBudgetWitness(args.contextManifest);
  assertRunAdmission(witness, args.intendedMaxEmbedLines);
  const cost = extractExecutionCost(args.executionResult);
  return parseM3BenchRun({
    schema_version: M3_BENCH_RUN_SCHEMA_VERSION,
    zone: args.zone,
    effort: args.effort,
    fixture: args.fixture,
    rep: args.rep,
    metrics: args.metrics,
    ...(args.judge_runs !== undefined ? { judge_runs: args.judge_runs } : {}),
    cost,
  });
}
