import crypto from "node:crypto";
import path from "node:path";
import type {
  ReviewFailureArtifactTrust,
  ReviewFailureDetailsKind,
  ReviewFailureDispatchState,
  ReviewFailureRetrySafety,
  ReviewStructuredFailureRecord,
} from "./artifact-types.js";
import { isoNow, writeYamlDocument } from "./review-artifact-utils.js";

function safeReasonCode(reasonCode: string): string {
  const normalized = reasonCode
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : "failure";
}

export interface StructuredFailureParams {
  phase: string;
  reasonCode: string;
  humanMessage: string;
  requiredUserAction: string;
  retrySafety: ReviewFailureRetrySafety;
  artifactTrust: ReviewFailureArtifactTrust;
  dispatchState: ReviewFailureDispatchState;
  artifactRefs?: Record<string, string>;
  mcpErrorCode: string;
  detailsKind: ReviewFailureDetailsKind;
  details: Record<string, unknown>;
}

export class ReviewStructuredFailureError extends Error {
  readonly failureRecord: ReviewStructuredFailureRecord;
  readonly failureRecordPath: string | null;

  constructor(args: {
    failureRecord: ReviewStructuredFailureRecord;
    failureRecordPath?: string | null;
  }) {
    super(args.failureRecord.human_message);
    this.name = "ReviewStructuredFailureError";
    this.failureRecord = args.failureRecord;
    this.failureRecordPath = args.failureRecordPath ?? null;
  }
}

export function createStructuredFailureRecord(
  params: StructuredFailureParams,
): ReviewStructuredFailureRecord {
  const failureId = `${safeReasonCode(params.reasonCode)}-${crypto
    .randomBytes(4)
    .toString("hex")}`;
  return {
    schema_version: "1",
    failure_id: failureId,
    created_at: isoNow(),
    phase: params.phase,
    reason_code: params.reasonCode,
    human_message: params.humanMessage,
    required_user_action: params.requiredUserAction,
    retry_safety: params.retrySafety,
    artifact_trust: params.artifactTrust,
    dispatch_state: params.dispatchState,
    artifact_refs: params.artifactRefs ?? {},
    mcp_error_code: params.mcpErrorCode,
    details_kind: params.detailsKind,
    details: params.details,
  };
}

export async function writeStructuredFailureRecord(
  params: StructuredFailureParams & { sessionRoot: string },
): Promise<string> {
  const failureRecord = createStructuredFailureRecord(params);
  const failureRecordPath = path.join(
    params.sessionRoot,
    "failures",
    `${failureRecord.failure_id}.yaml`,
  );
  await writeYamlDocument(failureRecordPath, failureRecord);
  return failureRecordPath;
}

export async function writeAndThrowStructuredFailureRecord(
  params: StructuredFailureParams & { sessionRoot: string },
): Promise<never> {
  const failureRecord = createStructuredFailureRecord(params);
  const failureRecordPath = path.join(
    params.sessionRoot,
    "failures",
    `${failureRecord.failure_id}.yaml`,
  );
  await writeYamlDocument(failureRecordPath, failureRecord);
  throw new ReviewStructuredFailureError({
    failureRecord,
    failureRecordPath,
  });
}
