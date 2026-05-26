import type {
  ReviewActionCandidate,
  ReviewFindingSeverity,
  ReviewRecord,
  ReviewRecordStatus,
  SharedPhenomenonClaimRelation,
} from "./artifact-types.js";
import {
  readYamlDocument,
} from "./review-artifact-utils.js";
import {
  REVIEW_SEVERITY_ORDER,
  isReviewFindingSeverity,
  isMaterialSeverity,
} from "./review-result-classification.js";

const REVIEW_RECORD_STATUS_VALUES = new Set<ReviewRecordStatus>([
  "completed",
  "completed_with_degradation",
  "halted_partial",
]);

const SHARED_PHENOMENON_RELATION_VALUES =
  new Set<SharedPhenomenonClaimRelation>([
    "corroboration",
    "disagreement",
    "partial overlap",
    "dedup",
  ]);

const ACTION_CANDIDATE_VALUES = new Set<ReviewActionCandidate>([
  "fix_now",
  "fix_before_release",
  "accept_risk",
  "follow_up",
  "out_of_scope",
  "needs_evidence",
  "continue_review",
  "retry_execution",
]);

type UnknownRecord = Record<string, unknown>;

function requireRecord(value: unknown, label: string): UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a YAML mapping.`);
  }
  return value as UnknownRecord;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function requireNullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return requireString(value, label);
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function requireInteger(value: unknown, label: string): number {
  const number = requireNumber(value, label);
  if (!Number.isInteger(number)) {
    throw new Error(`${label} must be an integer.`);
  }
  return number;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be a YAML list.`);
  }
  return value;
}

function requireStringArray(value: unknown, label: string): string[] {
  return requireArray(value, label).map((item, index) =>
    requireString(item, `${label}[${index}]`),
  );
}

function requireAllowed<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  label: string,
): T {
  const text = requireString(value, label);
  if (!allowed.has(text as T)) {
    throw new Error(
      `${label} has unsupported value: ${text}. Allowed values: ${[
        ...allowed,
      ].join(", ")}`,
    );
  }
  return text as T;
}

function requireStringMap(
  value: unknown,
  label: string,
): Record<string, string> {
  const record = requireRecord(value, label);
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(record)) {
    result[key] = requireString(item, `${label}.${key}`);
  }
  return result;
}

function ensureUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`${label} contains duplicate value: ${value}`);
    }
    seen.add(value);
  }
}

function validateProvenance(
  value: unknown,
  participatingLensIds: string[],
): void {
  const provenance = requireRecord(value, "ReviewRecord.per_lens_provenance");
  for (const lensId of participatingLensIds) {
    const lensProvenance = requireRecord(
      provenance[lensId],
      `ReviewRecord.per_lens_provenance.${lensId}`,
    );
    if (lensProvenance.domain_constraints_used !== null) {
      for (const [index, item] of requireArray(
        lensProvenance.domain_constraints_used,
        `ReviewRecord.per_lens_provenance.${lensId}.domain_constraints_used`,
      ).entries()) {
        const constraint = requireRecord(
          item,
          `ReviewRecord.per_lens_provenance.${lensId}.domain_constraints_used[${index}]`,
        );
        requireString(
          constraint.source_doc,
          `ReviewRecord.per_lens_provenance.${lensId}.domain_constraints_used[${index}].source_doc`,
        );
        requireString(
          constraint.source_version_or_snapshot_id,
          `ReviewRecord.per_lens_provenance.${lensId}.domain_constraints_used[${index}].source_version_or_snapshot_id`,
        );
        requireString(
          constraint.anchor,
          `ReviewRecord.per_lens_provenance.${lensId}.domain_constraints_used[${index}].anchor`,
        );
      }
    }
    if (lensProvenance.domain_context_assumptions !== null) {
      requireStringArray(
        lensProvenance.domain_context_assumptions,
        `ReviewRecord.per_lens_provenance.${lensId}.domain_context_assumptions`,
      );
    }
  }
}

function validateIssueProjection(value: unknown, label: string): void {
  const projection = requireRecord(value, label);
  requireString(projection.issue_id, `${label}.issue_id`);
  const severity = requireAllowed(
    projection.severity,
    new Set(REVIEW_SEVERITY_ORDER),
    `${label}.severity`,
  ) as ReviewFindingSeverity;
  if (projection.material !== isMaterialSeverity(severity)) {
    throw new Error(`${label}.material must match severity-derived materiality.`);
  }
  requireString(projection.affected_purpose, `${label}.affected_purpose`);
  requireString(projection.failure_condition, `${label}.failure_condition`);
  requireString(projection.impact, `${label}.impact`);
  requireStringArray(projection.evidence_refs, `${label}.evidence_refs`);
  requireStringArray(projection.source_lens_ids, `${label}.source_lens_ids`);
  for (const [index, candidate] of requireStringArray(
    projection.action_candidates,
    `${label}.action_candidates`,
  ).entries()) {
    requireAllowed(
      candidate,
      ACTION_CANDIDATE_VALUES,
      `${label}.action_candidates[${index}]`,
    );
  }
  requireString(projection.rationale, `${label}.rationale`);
}

function validateClassificationSummary(value: unknown): void {
  if (value === null || value === undefined) return;
  const summary = requireRecord(value, "ReviewRecord.result_classification_summary");
  if (
    summary.highest_severity !== null &&
    !isReviewFindingSeverity(summary.highest_severity)
  ) {
    throw new Error(
      "ReviewRecord.result_classification_summary.highest_severity must be a known severity or null.",
    );
  }
  requireInteger(summary.finding_count, "ReviewRecord.result_classification_summary.finding_count");
  requireInteger(summary.issue_count, "ReviewRecord.result_classification_summary.issue_count");

  for (const countField of [
    "finding_severity_counts",
    "issue_severity_counts",
    "severity_counts",
  ]) {
    const counts = requireRecord(
      summary[countField],
      `ReviewRecord.result_classification_summary.${countField}`,
    );
    for (const severity of REVIEW_SEVERITY_ORDER) {
      requireInteger(
        counts[severity],
        `ReviewRecord.result_classification_summary.${countField}.${severity}`,
      );
    }
  }

  requireInteger(
    summary.material_issue_count,
    "ReviewRecord.result_classification_summary.material_issue_count",
  );
  requireInteger(
    summary.non_material_finding_count,
    "ReviewRecord.result_classification_summary.non_material_finding_count",
  );
  for (const [index, item] of requireArray(
    summary.material_issues,
    "ReviewRecord.result_classification_summary.material_issues",
  ).entries()) {
    validateIssueProjection(
      item,
      `ReviewRecord.result_classification_summary.material_issues[${index}]`,
    );
  }
  for (const [index, item] of requireArray(
    summary.non_material_findings,
    "ReviewRecord.result_classification_summary.non_material_findings",
  ).entries()) {
    validateIssueProjection(
      item,
      `ReviewRecord.result_classification_summary.non_material_findings[${index}]`,
    );
  }
  for (const [index, item] of requireArray(
    summary.action_candidates,
    "ReviewRecord.result_classification_summary.action_candidates",
  ).entries()) {
    const action = requireRecord(
      item,
      `ReviewRecord.result_classification_summary.action_candidates[${index}]`,
    );
    requireString(
      action.issue_id,
      `ReviewRecord.result_classification_summary.action_candidates[${index}].issue_id`,
    );
    for (const [candidateIndex, candidate] of requireStringArray(
      action.candidates,
      `ReviewRecord.result_classification_summary.action_candidates[${index}].candidates`,
    ).entries()) {
      requireAllowed(
        candidate,
        ACTION_CANDIDATE_VALUES,
        `ReviewRecord.result_classification_summary.action_candidates[${index}].candidates[${candidateIndex}]`,
      );
    }
    requireStringArray(
      action.derivation_refs,
      `ReviewRecord.result_classification_summary.action_candidates[${index}].derivation_refs`,
    );
    requireString(
      action.rationale,
      `ReviewRecord.result_classification_summary.action_candidates[${index}].rationale`,
    );
  }
}

function validateSharedPhenomenonSummary(value: unknown): void {
  for (const [index, item] of requireArray(
    value,
    "ReviewRecord.shared_phenomenon_summary",
  ).entries()) {
    const entry = requireRecord(
      item,
      `ReviewRecord.shared_phenomenon_summary[${index}]`,
    );
    requireString(entry.target, `ReviewRecord.shared_phenomenon_summary[${index}].target`);
    requireString(
      entry.evidence_anchor,
      `ReviewRecord.shared_phenomenon_summary[${index}].evidence_anchor`,
    );
    requireStringArray(
      entry.participating_lens_ids,
      `ReviewRecord.shared_phenomenon_summary[${index}].participating_lens_ids`,
    );
    requireAllowed(
      entry.claim_relation,
      SHARED_PHENOMENON_RELATION_VALUES,
      `ReviewRecord.shared_phenomenon_summary[${index}].claim_relation`,
    );
  }
}

export function validateReviewRecordObject(value: unknown): ReviewRecord {
  const record = requireRecord(value, "ReviewRecord");
  requireString(record.review_record_id, "ReviewRecord.review_record_id");
  requireString(record.session_id, "ReviewRecord.session_id");
  if (record.entrypoint !== "review") {
    throw new Error("ReviewRecord.entrypoint must be review.");
  }
  const recordStatus = requireAllowed(
    record.record_status,
    REVIEW_RECORD_STATUS_VALUES,
    "ReviewRecord.record_status",
  );
  requireString(record.created_at, "ReviewRecord.created_at");
  requireString(record.updated_at, "ReviewRecord.updated_at");
  requireString(record.request_text, "ReviewRecord.request_text");
  requireString(record.review_target_scope_ref, "ReviewRecord.review_target_scope_ref");
  requireString(record.interpretation_ref, "ReviewRecord.interpretation_ref");
  requireString(record.binding_ref, "ReviewRecord.binding_ref");
  requireString(record.domain_final_selection_ref, "ReviewRecord.domain_final_selection_ref");
  const resolvedLensIds = requireStringArray(
    record.resolved_lens_ids,
    "ReviewRecord.resolved_lens_ids",
  );
  ensureUnique(resolvedLensIds, "ReviewRecord.resolved_lens_ids");
  requireString(record.execution_result_ref, "ReviewRecord.execution_result_ref");
  requireString(record.session_metadata_ref, "ReviewRecord.session_metadata_ref");
  requireString(record.target_snapshot_ref, "ReviewRecord.target_snapshot_ref");
  requireString(record.materialized_input_ref, "ReviewRecord.materialized_input_ref");
  requireString(record.review_target_profile_ref, "ReviewRecord.review_target_profile_ref");
  requireString(
    record.context_candidate_assembly_ref,
    "ReviewRecord.context_candidate_assembly_ref",
  );

  const lensResultRefs = requireStringMap(
    record.lens_result_refs,
    "ReviewRecord.lens_result_refs",
  );
  const lensOutputSchemaVersion = requireInteger(
    record.lens_output_schema_version,
    "ReviewRecord.lens_output_schema_version",
  );
  if (lensOutputSchemaVersion < 1) {
    throw new Error("ReviewRecord.lens_output_schema_version must be >= 1.");
  }
  const participatingLensIds = requireStringArray(
    record.participating_lens_ids,
    "ReviewRecord.participating_lens_ids",
  );
  ensureUnique(participatingLensIds, "ReviewRecord.participating_lens_ids");
  requireStringArray(record.excluded_lens_ids, "ReviewRecord.excluded_lens_ids");
  requireStringArray(record.degraded_lens_ids, "ReviewRecord.degraded_lens_ids");
  for (const lensId of participatingLensIds) {
    if (!lensResultRefs[lensId]) {
      throw new Error(`ReviewRecord.lens_result_refs missing participating lens: ${lensId}`);
    }
  }
  validateProvenance(record.per_lens_provenance, participatingLensIds);

  if (record.degradation_notes_ref !== undefined) {
    requireNullableString(record.degradation_notes_ref, "ReviewRecord.degradation_notes_ref");
  }
  for (const fieldName of [
    "finding_ledger_ref",
    "finding_relation_graph_ref",
    "issue_ledger_ref",
    "issue_stance_matrix_ref",
    "deliberation_plan_ref",
    "problem_framing_ref",
  ] as const) {
    if (record[fieldName] !== undefined) {
      requireNullableString(record[fieldName], `ReviewRecord.${fieldName}`);
    }
  }
  if (record.issue_resolution_summary !== undefined) {
    requireArray(record.issue_resolution_summary, "ReviewRecord.issue_resolution_summary");
  }
  validateClassificationSummary(record.result_classification_summary);
  requireNullableString(record.synthesis_result_ref, "ReviewRecord.synthesis_result_ref");
  requireAllowed(
    record.deliberation_status,
    new Set(["performed", "not_performed"]),
    "ReviewRecord.deliberation_status",
  );
  requireNullableString(
    record.deliberation_result_ref,
    "ReviewRecord.deliberation_result_ref",
  );
  requireString(record.final_output_ref, "ReviewRecord.final_output_ref");
  validateSharedPhenomenonSummary(record.shared_phenomenon_summary);

  if (recordStatus === "completed") {
    requireString(
      record.synthesis_result_ref,
      "ReviewRecord.synthesis_result_ref for completed records",
    );
    requireString(
      record.deliberation_result_ref,
      "ReviewRecord.deliberation_result_ref for completed records",
    );
    if (record.deliberation_status !== "performed") {
      throw new Error("Completed ReviewRecord must declare deliberation_status=performed.");
    }
  }
  if (record.deliberation_status === "not_performed") {
    if (record.deliberation_result_ref !== null) {
      throw new Error(
        "ReviewRecord.deliberation_result_ref must be null when deliberation_status=not_performed.",
      );
    }
    if (record.synthesis_result_ref !== null) {
      throw new Error(
        "ReviewRecord.synthesis_result_ref must be null when deliberation_status=not_performed.",
      );
    }
  }

  return record as unknown as ReviewRecord;
}

export async function readValidatedReviewRecord(
  filePath: string,
): Promise<ReviewRecord> {
  return validateReviewRecordObject(
    await readYamlDocument<unknown>(filePath),
  );
}
