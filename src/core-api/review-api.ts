import type {
  ReviewExecutionPlan,
  ReviewMode,
  ReviewRecord,
} from "../core-runtime/review/artifact-types.js";

export interface PrepareReviewRequest {
  projectRoot: string;
  target: string;
  intent: string;
  domain?: string;
  reviewMode?: ReviewMode;
}

export interface PreparedReview {
  sessionId: string;
  sessionRoot: string;
  executionPlan: ReviewExecutionPlan;
}

export interface RunReviewRequest extends PrepareReviewRequest {
  providerId?: string;
}

export interface ReviewRunResult {
  sessionId: string;
  sessionRoot: string;
  status: "completed" | "completed_with_degradation" | "halted_partial";
  finalOutputPath: string;
  reviewRecordPath: string;
}

export interface ReviewStatus {
  sessionId: string;
  sessionRoot: string;
  status: "prepared" | "running" | "completed" | "failed" | "unknown";
  artifactRefs: Record<string, string>;
}

export interface ReviewResult {
  sessionId: string;
  sessionRoot: string;
  reviewRecord: ReviewRecord;
  finalOutputPath: string;
}

export interface OntoReviewCoreApi {
  prepareReview(request: PrepareReviewRequest): Promise<PreparedReview>;
  runReview(request: RunReviewRequest): Promise<ReviewRunResult>;
  getReviewStatus(sessionRoot: string): Promise<ReviewStatus>;
  getReviewResult(sessionRoot: string): Promise<ReviewResult>;
  listLenses(): Promise<{ full: string[]; coreAxis: string[] }>;
  listDomains(projectRoot?: string): Promise<string[]>;
}
