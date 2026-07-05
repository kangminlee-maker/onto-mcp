import { createHash } from "node:crypto";
import fs from "node:fs/promises";

export const PIPELINE_EXECUTION_LEDGER_SCHEMA_VERSION = "1" as const;

export type PipelineId = "review" | "reconstruct" | "evolve" | (string & {});
export type PipelineExecutionOwner =
  | "runtime"
  | "host_llm"
  | "user_or_host_mediated";
export type PipelineExecutionUnitStatus =
  | "planned"
  | "completed"
  | "failed"
  | "missing"
  | "skipped"
  | "not_reached";
export type PipelineExecutionTrustStatus =
  | "trusted"
  | "untrusted"
  | "blocked_by_upstream";

// Producers emit only these known members — the closed sets a producer API
// (e.g. recordLlmAttempt) should accept, so a typo is a type error.
export type PipelineExecutionAttemptKindKnown =
  | "initial"
  | "parse_repair"
  | "semantic_repair"
  | "timeout_recovery"
  | "validation_gate";

export type PipelineExecutionFailureClassKnown =
  | "malformed_json"
  | "parse_repair_failure"
  | "schema_validation_failure"
  | "timeout"
  | "provider_error";

// Additively-extensible, forward-compatible open sets for the STORED/CONSUMED
// field (see pipeline-execution-ledger-contract.md): handling LLM input/output
// is a cross-pipeline concern and LLM failure/recovery shapes are not under our
// control, so the set grows over time. The known members carry meaning and
// autocomplete; `(string & {})` keeps the read shape open so a consumer reading
// a newer producer's value type-checks (tolerate, don't reject) without a
// schemaVersion bump. Producers still emit only the *Known members above.
export type PipelineExecutionAttemptKind =
  | PipelineExecutionAttemptKindKnown
  | (string & {});

export type PipelineExecutionFailureClass =
  | PipelineExecutionFailureClassKnown
  | (string & {});

export interface PipelineExecutionAttempt {
  attempt: number;
  kind: PipelineExecutionAttemptKind;
  status: "succeeded" | "failed";
  failure_class: PipelineExecutionFailureClass | null;
  failure_message: string | null;
  duration_ms: number;
}

/**
 * Runtime-owned per-unit execution telemetry recorded at the LLM call
 * boundary. `prompt_chars`/`output_chars` are the canonical size measure
 * (always available across providers and mock); provider token usage is a
 * supplemental fact only.
 */
export interface PipelineUnitExecutionTelemetry {
  unit_id: string;
  llm_call_count: number;
  duration_ms: number;
  prompt_chars: number;
  output_chars: number;
  provider_tokens_in: number | null;
  provider_tokens_out: number | null;
  provider_route: string | null;
  model_id: string | null;
  effort: string | null;
  /** Source-layer identity: hash of the unit's first initial system prompt. */
  prompt_policy_sha256: string | null;
  /**
   * Runtime-owned source-layer identity refs for metric attribution. Each ref
   * is a `<kind>:<value>` string, currently `prompt_policy_sha256:<hash>` and
   * one `authored_artifact:<name>` per distinct authored-artifact variant the
   * unit executed (initial / repair / recovery artifact names carry the
   * payload-contract seat). Run-level identities (registry, contract, source
   * profile, validator snapshots) remain owned by the run manifest's
   * governing snapshot.
   */
  source_identity_refs: string[];
  attempt_count: number;
  attempts: PipelineExecutionAttempt[];
  batch_count: number | null;
}

export interface PipelineExecutionLedger {
  schemaVersion: typeof PIPELINE_EXECUTION_LEDGER_SCHEMA_VERSION;
  pipeline: PipelineId;
  sessionId: string;
  sourceRefs: string[];
  units: PipelineExecutionLedgerUnitEntry[];
}

export interface PipelineExecutionLedgerUnitEntry {
  unitId: string;
  unitKind: string;
  owner: PipelineExecutionOwner;
  producedArtifactRefs: string[];
  consumedArtifactRefs: string[];
  packetRef?: string | null;
  packetSha256?: string | null;
  outputRefs: string[];
  outputHashes: Record<string, string | null>;
  status: PipelineExecutionUnitStatus;
  trustStatus: PipelineExecutionTrustStatus;
  trustReason: string;
  attemptCount: number;
  lastFailureMessage: string | null;
  upstreamUnitIds: string[];
  downstreamUnitIds: string[];
  /**
   * Terminal resolution outside the trusted-output path. `"demoted"`: the
   * unit exhausted its bounded resubmit budget and the downstream stage
   * product consumed and disclosed the gap (complete-with-failure, 설계 A —
   * review: issue-stance-matrix `validation.missing_stances`). A resolved
   * unit owes no further dispatch: it must not reappear on the frontier,
   * block convergence, or block downstream upstream-trust — while `status`
   * and `lastFailureMessage` keep the audit truth.
   */
  resolution?: "demoted";
  resolutionReason?: string;
  /**
   * Per-unit execution telemetry projected from the producing pipeline's
   * run records when available. Currently populated by the reconstruct
   * pipeline only.
   */
  executionTelemetry?: PipelineUnitExecutionTelemetry | null;
}

export async function fileSha256IfPresent(
  filePath: string | null | undefined,
): Promise<string | null> {
  if (!filePath) return null;
  try {
    const content = await fs.readFile(filePath);
    return createHash("sha256").update(content).digest("hex");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    throw error;
  }
}

export async function fileExists(
  filePath: string | null | undefined,
): Promise<boolean> {
  if (!filePath) return false;
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function buildOutputHashes(
  outputRefs: readonly string[],
): Promise<Record<string, string | null>> {
  const entries = await Promise.all(
    outputRefs.map(async (outputRef) => [
      outputRef,
      await fileSha256IfPresent(outputRef),
    ] as const),
  );
  return Object.fromEntries(entries);
}

export function hasAllRequiredOutputHashes(
  unit: Pick<PipelineExecutionLedgerUnitEntry, "outputRefs" | "outputHashes">,
): boolean {
  return unit.outputRefs.every((outputRef) => unit.outputHashes[outputRef] !== null);
}

export function isTrustedLedgerUnit(
  unit: Pick<
    PipelineExecutionLedgerUnitEntry,
    "status" | "trustStatus" | "outputRefs" | "outputHashes"
  >,
): boolean {
  return (
    unit.status === "completed" &&
    unit.trustStatus === "trusted" &&
    hasAllRequiredOutputHashes(unit)
  );
}

/**
 * Trusted output OR terminally resolved (demoted complete-with-failure):
 * either way the unit owes no further dispatch. Frontier and convergence
 * consumers use this predicate; artifact-preservation consumers keep using
 * {@link isTrustedLedgerUnit} — a resolved unit has no trusted output to
 * preserve or to consume downstream.
 */
export function isResolvedLedgerUnit(
  unit: Pick<
    PipelineExecutionLedgerUnitEntry,
    "status" | "trustStatus" | "outputRefs" | "outputHashes" | "resolution"
  >,
): boolean {
  return unit.resolution === "demoted" || isTrustedLedgerUnit(unit);
}

export function firstUntrustedRequiredUnit(
  ledger: Pick<PipelineExecutionLedger, "units">,
): PipelineExecutionLedgerUnitEntry | null {
  return ledger.units.find((unit) => !isTrustedLedgerUnit(unit)) ?? null;
}

export function normalizeLedgerRefs(refs: readonly (string | null | undefined)[]): string[] {
  return [...new Set(refs.filter((ref): ref is string => typeof ref === "string" && ref.length > 0))]
    .sort();
}

export function buildLedgerTrust(args: {
  status: PipelineExecutionUnitStatus;
  outputRefs: readonly string[];
  outputHashes: Record<string, string | null>;
  expectedOutputHashes?: Record<string, string>;
  upstreamTrusted: boolean;
  lastFailureMessage?: string | null;
}): Pick<PipelineExecutionLedgerUnitEntry, "trustStatus" | "trustReason"> {
  if (!args.upstreamTrusted) {
    return {
      trustStatus: "blocked_by_upstream",
      trustReason: "A required upstream unit is not trusted.",
    };
  }
  if (args.status === "completed") {
    const missingOutputRefs = args.outputRefs.filter(
      (outputRef) => args.outputHashes[outputRef] === null,
    );
    if (missingOutputRefs.length > 0) {
      return {
        trustStatus: "untrusted",
        trustReason: `Completed unit is missing required output refs: ${missingOutputRefs.join(", ")}.`,
      };
    }
    const mismatchedOutputRefs = Object.entries(args.expectedOutputHashes ?? {})
      .filter(([outputRef, expectedHash]) =>
        expectedHash.length > 0 && args.outputHashes[outputRef] !== expectedHash
      )
      .map(([outputRef]) => outputRef);
    if (mismatchedOutputRefs.length > 0) {
      return {
        trustStatus: "untrusted",
        trustReason: `Completed unit output hash does not match review-run-manifest: ${mismatchedOutputRefs.join(", ")}.`,
      };
    }
    return {
      trustStatus: "trusted",
      trustReason: "Unit completed and required output refs are present.",
    };
  }
  if (args.status === "failed") {
    return {
      trustStatus: "untrusted",
      trustReason:
        args.lastFailureMessage?.trim() ||
        "Unit failed before producing a trusted output.",
    };
  }
  if (args.status === "skipped") {
    return {
      trustStatus: "untrusted",
      trustReason: "Unit was skipped and did not produce a trusted output.",
    };
  }
  if (args.status === "missing") {
    return {
      trustStatus: "untrusted",
      trustReason: "Required unit output is missing.",
    };
  }
  if (args.status === "not_reached") {
    return {
      trustStatus: "blocked_by_upstream",
      trustReason: "Unit was not reached because upstream execution did not complete.",
    };
  }
  return {
    trustStatus: "untrusted",
    trustReason: "Unit is planned but has not completed.",
  };
}
