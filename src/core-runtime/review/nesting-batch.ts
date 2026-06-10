/**
 * NestingBatchWorker contract (roadmap S2) — brand-neutral nesting batch
 * fan-out.
 *
 * # What this module is
 *
 * The pure core of the `nested-workers` topology: given a batch of ready
 * units, build (1) the literal bash script an outer nesting worker executes
 * to fan the batch out as parallel **unit-executor subprocesses**, and
 * (2) the parser/reconciler for the `UNIT_DISPATCH_SUMMARY:{...}` sentinel
 * the script emits. Brand realizations (codex `exec` outer, claude `-p`
 * outer, a host-fabric subagent) wrap these functions; none of them changes
 * the script or summary contract.
 *
 * # Why inner = unit executor (not raw provider CLI)
 *
 * The retired nested path piped packets straight into `codex exec -o`, which
 * bypassed structured output (sidecar/submit validation) and was therefore
 * fail-closed after the live-pipeline hardening (PR #17). Here every inner
 * invocation is the same unit-executor CLI the flat (main-workers) path
 * spawns — structured output, validation, and retry semantics are equal by
 * code sharing, not by re-implementation.
 *
 * # Authority
 *
 * The batch summary is observational. Seat truth stays with onto
 * (`validateUnitSeatToResult`); ledger/execution-result/barrier/record are
 * runtime-owned regardless of topology.
 *
 * Pure module: no cli/ imports, no process spawning — realizations live in
 * cli/ (outer spawn) and consume these builders.
 */

import path from "node:path";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface NestingBatchUnit {
  /** Stable unit identifier (e.g. "logic", "finding-ledger", "synthesis:ISS-1"). */
  unit_id: string;
  /** Unit kind as dispatched by the runtime (lens, issue_artifact, …). */
  unit_kind: string;
  /** Path on disk where the unit's prompt packet is stored. */
  packet_path: string;
  /** Canonical seat path the unit executor must write. */
  output_path: string;
  /**
   * Per-unit executor args appended after the canonical six
   * (e.g. ["--output-format", "lens-sidecar", "--human-output-ref", …]).
   */
  extra_args?: string[];
}

export interface NestingBatchDescriptor {
  /** Units to fan out, in dispatch order. Must be non-empty. */
  units: NestingBatchUnit[];
  /**
   * Argv prefix invoking the unit executor
   * (e.g. ["node", "<dist>/codex-review-unit-executor.js"]). Brand selection
   * happens in the caller; this module never inspects the brand.
   */
  inner_executor_argv: string[];
  /**
   * Args shared by every unit invocation, placed before the per-unit args
   * (e.g. ["--project-root", root, "--session-root", sessionRoot,
   * "--model", …]).
   */
  common_args?: string[];
  /**
   * Maximum units launched concurrently. The script groups units into
   * waves of this size with a `wait` barrier between waves, mirroring the
   * flat path's worker-pool concurrency cap (operational parity — rate
   * limits hold under nesting too). Absent or >= unit count → one wave
   * (all parallel). Must be a positive integer when set.
   */
  dispatch_width?: number;
}

export interface NestingBatchUnitOutcome {
  unit_id: string;
  status: "ok" | "fail";
  /** Populated when status === "fail". */
  error?: string;
}

export interface NestingBatchSummary {
  unit_results: Array<{
    unit_id: string;
    status: "ok" | "fail";
    error?: string;
  }>;
}

/**
 * Sentinel prefix for the batch summary line. Load-bearing: outer worker
 * stdout mixes model commentary with script output, so the parser anchors
 * on this prefix instead of "the last line".
 */
export const UNIT_DISPATCH_SUMMARY_PREFIX = "UNIT_DISPATCH_SUMMARY:";

// ---------------------------------------------------------------------------
// Quoting / escaping helpers
// ---------------------------------------------------------------------------

/** POSIX-ish shell quoting for interpolated values. */
function shellQuote(value: string): string {
  if (/^[A-Za-z0-9._:/@+\-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function jsonEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Filename-safe projection of a unit id for per-unit log paths. */
function sanitizeUnitIdForFilename(unitId: string): string {
  return unitId.replace(/[^A-Za-z0-9._-]/g, "_");
}

// ---------------------------------------------------------------------------
// Script builder
// ---------------------------------------------------------------------------

/**
 * Build the literal bash script the outer nesting worker pipes to `bash -s`.
 * Every value is interpolated and shell-quoted at build time — the outer
 * model performs no substitution. This deterministic construction is the
 * contract that keeps outer behaviour faithful to the requested action.
 *
 * Structure (per-unit blocks are unrolled — no runtime array parsing):
 *   1. one background subshell per unit running the **unit executor** with
 *      the canonical arg surface (--unit-id/--unit-kind/--packet-path/
 *      --output-path), inner stdout+stderr captured in a per-unit running
 *      log under the seat directory (watcher `tail -f`-able)
 *   2. `wait` barriers between waves of `dispatch_width` units (one wave
 *      = all parallel when unset), then for the final wave
 *   3. replay ENV-BEFORE/AFTER diagnostic lines to stdout; remove the
 *      running log on success, rename it to `.<unit>.nested-stderr.log`
 *      on failure (post-hoc audit survives the dispatch exit)
 *   4. emit `UNIT_DISPATCH_SUMMARY:{"unit_results":[…]}` in input order;
 *      a unit whose subshell never reported gets a build-time fail entry
 *      (silent drop is impossible by construction)
 */
export function buildNestingBatchScript(
  descriptor: NestingBatchDescriptor,
): string {
  if (descriptor.units.length === 0) {
    throw new Error("nesting batch requires at least one unit");
  }
  if (descriptor.inner_executor_argv.length === 0) {
    throw new Error(
      "nesting batch requires inner_executor_argv (unit executor invocation)",
    );
  }
  if (
    descriptor.dispatch_width !== undefined &&
    (!Number.isInteger(descriptor.dispatch_width) || descriptor.dispatch_width < 1)
  ) {
    throw new Error("nesting batch dispatch_width must be a positive integer");
  }
  const waveWidth = descriptor.dispatch_width ?? descriptor.units.length;

  const innerPrefix = [
    ...descriptor.inner_executor_argv,
    ...(descriptor.common_args ?? []),
  ]
    .map(shellQuote)
    .join(" ");

  const dispatchBlocks: string[] = [];
  const replayBlocks: string[] = [];
  const summaryBlocks: string[] = [];

  descriptor.units.forEach((unit, index) => {
    const outputDir = path.dirname(unit.output_path);
    const safeId = sanitizeUnitIdForFilename(unit.unit_id);
    const logPath = path.join(outputDir, `.${safeId}.running.log`);
    const auditPath = path.join(outputDir, `.${safeId}.nested-stderr.log`);
    const statRef = `"$TMPDIR/u${index}.status"`;
    const okJson = `{"unit_id":"${jsonEscape(unit.unit_id)}","status":"ok"}`;
    const failFmt = `{"unit_id":"${jsonEscape(unit.unit_id)}","status":"fail","error":"exit=%s size=%s"}`;
    const fallbackJson = `{"unit_id":"${jsonEscape(unit.unit_id)}","status":"fail","error":"no status reported"}`;
    const unitArgs = [
      "--unit-id",
      unit.unit_id,
      "--unit-kind",
      unit.unit_kind,
      "--packet-path",
      unit.packet_path,
      "--output-path",
      unit.output_path,
      ...(unit.extra_args ?? []),
    ]
      .map(shellQuote)
      .join(" ");

    dispatchBlocks.push(
      [
        `# --- unit u${index}: ${unit.unit_id} (${unit.unit_kind}) ---`,
        "(",
        `  mkdir -p ${shellQuote(outputDir)}`,
        `  LOG=${shellQuote(logPath)}`,
        `  printf 'ENV-BEFORE unit=%s kind=%s packet=%s output=%s\\n' ${shellQuote(unit.unit_id)} ${shellQuote(unit.unit_kind)} ${shellQuote(unit.packet_path)} ${shellQuote(unit.output_path)} >> "$LOG"`,
        `  ${innerPrefix} ${unitArgs} >> "$LOG" 2>&1`,
        "  EC=$?",
        `  if [ -f ${shellQuote(unit.output_path)} ]; then`,
        `    SIZE=$(wc -c < ${shellQuote(unit.output_path)} | tr -d ' ')`,
        "  else",
        "    SIZE=0",
        "  fi",
        `  printf 'ENV-AFTER unit=%s exit=%s output_bytes=%s\\n' ${shellQuote(unit.unit_id)} "$EC" "$SIZE" >> "$LOG"`,
        '  if [ "$EC" = "0" ] && [ "$SIZE" -gt 0 ]; then',
        `    printf '%s' ${shellQuote(okJson)} > ${statRef}`,
        "  else",
        `    printf ${shellQuote(failFmt)} "$EC" "$SIZE" > ${statRef}`,
        "  fi",
        ") &",
      ].join("\n"),
    );

    replayBlocks.push(
      [
        `LOG=${shellQuote(logPath)}`,
        'if [ -f "$LOG" ]; then',
        "  grep -E '^ENV-' \"$LOG\" || true",
        "fi",
        `if [ -f ${statRef} ] && grep -q '"status":"ok"' ${statRef}; then`,
        '  rm -f "$LOG"',
        'elif [ -f "$LOG" ]; then',
        `  mv "$LOG" ${shellQuote(auditPath)} 2>/dev/null || true`,
        "fi",
      ].join("\n"),
    );

    summaryBlocks.push(
      [
        `if [ -f ${statRef} ]; then`,
        `  SUMMARY_PARTS+=("$(cat ${statRef})")`,
        "else",
        `  SUMMARY_PARTS+=(${shellQuote(fallbackJson)})`,
        "fi",
      ].join("\n"),
    );
  });

  // Group dispatch blocks into waves of `waveWidth` with a wait barrier
  // between waves — the nested counterpart of the flat worker-pool cap.
  const waveSections: string[] = [];
  for (let start = 0; start < dispatchBlocks.length; start += waveWidth) {
    if (dispatchBlocks.length > waveWidth) {
      waveSections.push(
        `# --- wave ${Math.floor(start / waveWidth) + 1} (width ${waveWidth}) ---`,
      );
    }
    waveSections.push(...dispatchBlocks.slice(start, start + waveWidth), "wait", "");
  }

  return [
    "#!/usr/bin/env bash",
    "# Literal nesting batch dispatch script. Generated by onto TS",
    "# (review/nesting-batch.ts). All values are interpolated; do not edit",
    "# or re-interpret.",
    "set +e",
    "",
    'TMPDIR="$(mktemp -d -t onto-nesting-batch-XXXXXX)"',
    "trap 'rm -rf \"$TMPDIR\"' EXIT",
    "",
    "# Launch units in parallel waves. Each subshell runs the unit executor",
    "# (structured output / validation / retry equal to the flat path by",
    "# code sharing) and records a single-line status JSON in its .status",
    "# file. Per-unit running logs live under the seat directory so a",
    "# watcher pane can `tail -f` them.",
    ...waveSections,
    "# Replay per-unit diagnostics to stdout, then settle log lifecycle:",
    "# success → remove running log; failure → persist as audit log.",
    ...replayBlocks,
    "",
    "# Emit the summary sentinel in input order. A unit without a status",
    "# file is reported as fail — absence is noncompliance, never silent",
    "# success.",
    "SUMMARY_PARTS=()",
    ...summaryBlocks,
    'OLDIFS="$IFS"; IFS=","; JOINED="${SUMMARY_PARTS[*]}"; IFS="$OLDIFS"',
    `echo "${UNIT_DISPATCH_SUMMARY_PREFIX}{\\"unit_results\\":[$JOINED]}"`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Outer worker prompt
// ---------------------------------------------------------------------------

/**
 * Build the brand-neutral prompt an outer LLM worker receives. The outer's
 * single role is to execute the literal script — descriptive dispatch
 * instructions are deliberately absent (they caused the retired outer to
 * substitute its own file tools for nested spawning).
 */
export function buildNestingBatchWorkerPrompt(
  descriptor: NestingBatchDescriptor,
  diagnostics?: Record<string, string>,
): string {
  const script = buildNestingBatchScript(descriptor);
  const diagSuffix = diagnostics
    ? ` (${Object.entries(diagnostics)
        .map(([key, value]) => `${key}=${value}`)
        .join(", ")})`
    : "";
  return [
    `Nesting batch dispatch for ${descriptor.units.length} units${diagSuffix}.`,
    "",
    "Action: Execute the bash script below by piping it to `bash -s`.",
    "Do not modify it, do not substitute variables, do not use file-edit",
    "tools. After the script finishes, surface its stdout verbatim — the",
    `final line (starting with "${UNIT_DISPATCH_SUMMARY_PREFIX}") is consumed`,
    "by the parent process and must not be elided or reformatted.",
    "",
    "```bash",
    script,
    "```",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Summary parser / reconciliation
// ---------------------------------------------------------------------------

/**
 * Scan outer worker stdout for the `UNIT_DISPATCH_SUMMARY:{...}` line.
 * Tolerates leading/trailing whitespace and multiple summary lines
 * (last-one-wins — the final reported state is what matters).
 */
export function parseNestingBatchSummary(
  stdout: string,
): NestingBatchSummary | null {
  const lines = stdout.split("\n");
  let lastSummary: NestingBatchSummary | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(UNIT_DISPATCH_SUMMARY_PREFIX)) continue;
    const jsonPart = trimmed.slice(UNIT_DISPATCH_SUMMARY_PREFIX.length).trim();
    try {
      const parsed = JSON.parse(jsonPart) as unknown;
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "unit_results" in parsed &&
        Array.isArray((parsed as NestingBatchSummary).unit_results)
      ) {
        lastSummary = parsed as NestingBatchSummary;
      }
    } catch {
      // Ignore malformed summary lines; continue searching for a later one.
    }
  }
  return lastSummary;
}

/**
 * Produce ordered outcomes from a parsed summary. Unit ids missing from the
 * summary are reported as `fail` — the outer worker is contractually
 * required to report every unit, so absence is treated as noncompliance,
 * not silent success.
 */
export function reconcileNestingBatchOutcomes(
  units: NestingBatchUnit[],
  summary: NestingBatchSummary | null,
): NestingBatchUnitOutcome[] {
  if (!summary) {
    return units.map((unit) => ({
      unit_id: unit.unit_id,
      status: "fail" as const,
      error: "outer worker did not emit a UNIT_DISPATCH_SUMMARY line",
    }));
  }
  const byId = new Map(summary.unit_results.map((r) => [r.unit_id, r]));
  return units.map((unit) => {
    const reported = byId.get(unit.unit_id);
    if (!reported) {
      return {
        unit_id: unit.unit_id,
        status: "fail" as const,
        error: `outer worker summary missing unit_id="${unit.unit_id}"`,
      };
    }
    if (reported.status === "ok") {
      return { unit_id: unit.unit_id, status: "ok" as const };
    }
    return {
      unit_id: unit.unit_id,
      status: "fail" as const,
      error: reported.error ?? "no error message reported",
    };
  });
}
