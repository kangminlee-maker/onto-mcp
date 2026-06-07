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
