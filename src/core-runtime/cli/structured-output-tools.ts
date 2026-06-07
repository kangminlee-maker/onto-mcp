import type { OntoTool, OntoToolPropertySchema } from "./onto-tools.js";
import { REVIEW_SEVERITY_ORDER } from "../review/review-result-classification.js";
import {
  PROBLEM_FRAMING_CLASSIFICATION_SUBMIT_KEYS,
  PROBLEM_FRAMING_CLOSURE_CLASS_VALUES,
  PROBLEM_FRAMING_CLOSURE_OBLIGATION_VALUES,
  PROBLEM_FRAMING_IMPACT_KIND_VALUES,
  PROBLEM_FRAMING_ISSUE_ROLE_VALUES,
  PROBLEM_FRAMING_JUDGMENT_STATE_VALUES,
  PROBLEM_FRAMING_TIMING_CLASS_VALUES,
} from "../review/problem-framing-spine.js";

export type RuntimeSubmitOutputFormat =
  | "issue-artifact"
  | "issue-stance-response"
  | "issue-deliberation-response"
  | "deliberation-resolution"
  | "issue-synthesis-response";

export interface RuntimeSubmitState {
  sessionId: string;
  unitId: string;
  outputFormat: RuntimeSubmitOutputFormat;
  problemFramingContext?: RuntimeSubmitProblemFramingContext;
  issueLedgerDependencyContext?: RuntimeSubmitIssueLedgerDependencyContext;
  issueStanceSchemaContext?: RuntimeSubmitIssueStanceSchemaContext;
  issueDeliberationSchemaContext?: RuntimeSubmitIssueDeliberationSchemaContext;
  issueSynthesisSchemaContext?: RuntimeSubmitIssueSynthesisSchemaContext;
  artifact?: Record<string, unknown>;
}

export interface RuntimeSubmitProblemFramingContext {
  classification_context: Record<string, unknown>;
  issue_surface_finding_ids: Record<string, string[]>;
}

export interface RuntimeSubmitIssueLedgerDependencyContext {
  shared_cause_relations: RuntimeSubmitSharedCauseRelation[];
}

export interface RuntimeSubmitIssueStanceSchemaContext {
  issue_evidence_refs: Record<string, string[]>;
}

export interface RuntimeSubmitIssueDeliberationSchemaContext {
  allowed_evidence_refs: string[];
}

export interface RuntimeSubmitIssueSynthesisSchemaContext {
  allowed_source_refs: string[];
  source_work_item_ref: string;
}

export interface RuntimeSubmitSharedCauseRelation {
  relation_id: string;
  from_finding_id: string;
  to_finding_id: string;
  cause_claim?: string | null;
}

const ISSUE_ARTIFACT_IDS = new Set([
  "finding-ledger",
  "finding-relation-graph",
  "issue-ledger",
  "deliberation-plan",
  "problem-framing",
]);

const RELATION_VALUES = [
  "same_root_candidate",
  "shared_cause_candidate",
  "causes",
  "symptom_of",
  "enables",
  "duplicates",
  "conflicts_with",
] as const;

const CONFIDENCE_VALUES = ["low", "medium", "high"] as const;

const STANCE_VALUES = [
  "support",
  "oppose",
  "narrow",
  "alternative_root",
  "surface_only",
  "not_applicable",
  "insufficient_evidence",
] as const;

const ROOT_HYPOTHESIS_POSITION_VALUES = [
  "accepts",
  "narrows",
  "replaces",
  "rejects",
  "not_applicable",
  "insufficient_evidence",
] as const;

const SEVERITY_POSITION_VALUES = [
  "keeps",
  "raises",
  "lowers",
  "not_applicable",
  "insufficient_evidence",
] as const;

const DELIBERATION_CONFLICT_TYPE_VALUES = [
  "correctness_or_blocking_execution",
  "root_hypothesis",
  "domain_constraint",
  "purpose_value",
  "action_or_severity",
  "partial_overlap_or_cluster_scope",
  "evidence_gap",
  "stance_conflict",
] as const;

const DELIBERATION_SKIP_REASON_CODE_VALUES = [
  "non_material_issue",
  "consistent_stances",
  "no_material_conflict",
  "outside_deliberation_scope",
  "insufficient_participation",
] as const;

const DELIBERATION_RESOLUTION_STATUS_VALUES = [
  "no-deliberation-needed",
  "resolved",
  "narrowed",
  "unresolved-with-reason",
] as const;

const MAX_SYNTHESIS_BOUNDARY_NOTES = 3;

export function isRuntimeSubmitOutputFormat(
  value: string,
): value is RuntimeSubmitOutputFormat {
  return (
    value === "issue-artifact" ||
    value === "issue-stance-response" ||
    value === "issue-deliberation-response" ||
    value === "deliberation-resolution" ||
    value === "issue-synthesis-response"
  );
}

function arrayField(
  description: string,
  items: OntoToolPropertySchema,
): OntoToolPropertySchema {
  return {
    type: "array",
    description,
    items,
  };
}

function problemFramingClassificationsField(): OntoToolPropertySchema {
  return {
    type: "array",
    description:
      "Problem-framing classification rows. Runtime-owned fields are not accepted here.",
    items: {
      type: "object",
      description: "One problem-framing classification row.",
      additionalProperties: false,
      required: [...PROBLEM_FRAMING_CLASSIFICATION_SUBMIT_KEYS],
      properties: {
        issue_id: stringField("Issue id from issue-ledger.yaml."),
        problem_definition: stringField("Concise problem definition."),
        issue_role: enumField(
          "Common-spine issue role.",
          PROBLEM_FRAMING_ISSUE_ROLE_VALUES,
        ),
        judgment_state: enumField(
          "Common-spine judgment state.",
          PROBLEM_FRAMING_JUDGMENT_STATE_VALUES,
        ),
        impact_kind: enumField(
          "Common-spine impact kind.",
          PROBLEM_FRAMING_IMPACT_KIND_VALUES,
        ),
        timing_class: enumField(
          "Common-spine timing class.",
          PROBLEM_FRAMING_TIMING_CLASS_VALUES,
        ),
        closure_class: enumField(
          "Common-spine closure class.",
          PROBLEM_FRAMING_CLOSURE_CLASS_VALUES,
        ),
        closure_obligation: enumField(
          "Common-spine closure obligation.",
          PROBLEM_FRAMING_CLOSURE_OBLIGATION_VALUES,
        ),
        domain_axes: objectField(
          "Domain-specific axes from the selected profile. Use an empty object when no domain profile is applied.",
          {},
        ),
        rationale: stringField("Classification rationale."),
      },
    },
  };
}

function objectField(
  description: string,
  properties: Record<string, OntoToolPropertySchema>,
): OntoToolPropertySchema {
  return {
    type: "object",
    description,
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  };
}

function stringField(description: string): OntoToolPropertySchema {
  return { type: "string", description };
}

function enumField(
  description: string,
  values: readonly string[],
): OntoToolPropertySchema {
  return { type: "string", description, enum: [...values] };
}

function nullableStringField(description: string): OntoToolPropertySchema {
  return { type: ["string", "null"], description };
}

function booleanField(description: string): OntoToolPropertySchema {
  return { type: "boolean", description };
}

function stringArrayField(description: string): OntoToolPropertySchema {
  return {
    type: "array",
    description,
    items: {
      type: "string",
      description: "One reference or identifier.",
    },
  };
}

function nullableObjectField(
  description: string,
  properties: Record<string, OntoToolPropertySchema>,
): OntoToolPropertySchema {
  return {
    type: ["object", "null"],
    description,
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  };
}

function validationField(
  description: string,
  properties: Record<string, OntoToolPropertySchema>,
): OntoToolPropertySchema {
  return objectField(description, properties);
}

function findingMaterialityBasisField(): OntoToolPropertySchema {
  return nullableObjectField("Materiality basis, or null for low/info findings.", {
    affected_purpose: stringField("Declared purpose or contract affected."),
    failure_condition: stringField("Bounded condition where trust fails."),
    impact: stringField("Why this changes review trust."),
    evidence_refs: stringArrayField("Concrete materiality evidence refs."),
  });
}

function findingCausalPathField(): OntoToolPropertySchema {
  return nullableObjectField("Causal path, or null for low/info findings.", {
    root_cause_candidate: stringField("Evidence-backed starting cause candidate."),
    root_cause_step_id: nullableStringField("Cause id for the root cause step, or null."),
    steps: arrayField(
      "Causal path steps.",
      objectField("One causal path step.", {
        cause_id: stringField("Stable cause id."),
        claim: stringField("Evidence-backed causal claim."),
        relation_to_previous: {
          type: ["string", "null"],
          description: "null for the first step; otherwise relation to previous step.",
          enum: ["causes", "symptom_of", "enables", null],
        },
        evidence_refs: stringArrayField("Evidence refs supporting this step."),
      }),
    ),
    unresolved_beyond_evidence: nullableStringField(
      "Boundary-limited uncertainty beyond the evidence, or null.",
    ),
  });
}

function findingLedgerFindingField(): OntoToolPropertySchema {
  return objectField("One finding-ledger finding row.", {
    finding_id: stringField("Stable finding id."),
    lens_id: stringField("Source lens id."),
    source_ref: stringField("Source sidecar or Round 1 finding ref."),
    target: stringField("Artifact, file, section, or behavior criticized."),
    evidence_anchor: stringField("Concrete evidence location."),
    claim: stringField("Surface finding claim."),
    lens_rationale_summary: stringField(
      "Why the source lens considered the finding relevant.",
    ),
    proposed_action: stringField("Action stated or inferred from the finding."),
    affected_purpose: stringField("Declared purpose or contract affected."),
    failure_condition: stringField("Bounded condition where trust fails."),
    impact: stringField("Why this changes trust."),
    evidence_refs: stringArrayField("Concrete evidence refs."),
    severity: enumField("Review severity.", REVIEW_SEVERITY_ORDER),
    domain_threshold_used: nullableStringField("Domain threshold used, or null."),
    materiality_basis: findingMaterialityBasisField(),
    causal_path: findingCausalPathField(),
  });
}

function findingRelationSharedCauseField(): OntoToolPropertySchema {
  return nullableObjectField(
    "Shared cause details for shared_cause_candidate; null otherwise.",
    {
      cause_claim: stringField("Shared cause claim."),
      from_cause_ref: stringField("Cause id from the from_finding causal path."),
      to_cause_ref: stringField("Cause id from the to_finding causal path."),
    },
  );
}

function findingRelationRowField(): OntoToolPropertySchema {
  return objectField("One accepted finding relation row.", {
    relation_id: stringField("Stable relation id."),
    from_finding_id: stringField("First finding id."),
    to_finding_id: stringField("Second finding id."),
    relation: enumField("Relation kind.", RELATION_VALUES),
    root_hypothesis: stringField("Falsifiable common-root or relation hypothesis."),
    shared_cause: findingRelationSharedCauseField(),
    rationale: stringField("Why this relation is supported."),
    confidence: enumField("Relation confidence.", CONFIDENCE_VALUES),
  });
}

function findingRelationSingletonField(): OntoToolPropertySchema {
  return objectField("One finding intentionally left as a singleton.", {
    finding_id: stringField("Finding id not covered by an accepted relation."),
    reason: stringField("Why no relation was accepted."),
  });
}

function issueLedgerIssueField(): OntoToolPropertySchema {
  return objectField("One root-cause issue cluster row.", {
    issue_id: stringField("Stable issue id."),
    root_cause_hypothesis: stringField("Falsifiable root-cause hypothesis."),
    root_confidence: enumField("Root hypothesis confidence.", CONFIDENCE_VALUES),
    surface_finding_ids: stringArrayField("Finding ids assigned to this issue."),
    relation_refs: stringArrayField("same_root_candidate relation refs for merged findings."),
    raised_by_lens_ids: stringArrayField("Lens ids that raised assigned findings."),
    issue_statement: stringField("Root-level issue statement."),
    proposed_action: stringField("Action framing for this issue."),
    affected_purpose: stringField("Declared purpose or contract affected."),
    failure_condition: stringField("Bounded condition where trust fails."),
    impact: stringField("Why this changes trust."),
    evidence_refs: stringArrayField("Evidence refs projected from assigned findings."),
    severity: enumField("Issue severity.", REVIEW_SEVERITY_ORDER),
    domain_threshold_used: nullableStringField("Domain threshold used, or null."),
    singleton_reason: nullableStringField("Why this issue remains singleton, or null."),
  });
}

function deliberationPlanPlannedIssueField(): OntoToolPropertySchema {
  return objectField("One issue planned for controlled deliberation.", {
    issue_id: stringField("Issue id."),
    priority: { type: "number", description: "Positive deliberation priority." },
    conflict_type: enumField("Conflict type.", DELIBERATION_CONFLICT_TYPE_VALUES),
    participating_lens_ids: stringArrayField("Lens ids participating in deliberation."),
    source_stance_refs: stringArrayField("Issue stance refs for participants."),
    conflict_summary: stringField("Concise conflict summary."),
    resolution_question: stringField("Question the deliberation must resolve."),
  });
}

function deliberationPlanSkippedIssueField(): OntoToolPropertySchema {
  return objectField("One issue skipped from controlled deliberation.", {
    issue_id: stringField("Issue id."),
    reason_code: enumField("Skip reason code.", DELIBERATION_SKIP_REASON_CODE_VALUES),
    reason: stringField("Why no controlled deliberation is needed."),
  });
}

function issueStanceResponseRowField(): OntoToolPropertySchema {
  return objectField("One issue stance row for this lens.", {
    issue_id: stringField("Issue id."),
    stance: enumField("Lens stance.", STANCE_VALUES),
    rationale: stringField("Why this lens takes this stance."),
    root_hypothesis_position: enumField(
      "Position on the issue root hypothesis.",
      ROOT_HYPOTHESIS_POSITION_VALUES,
    ),
    severity_position: enumField(
      "Position on the issue severity.",
      SEVERITY_POSITION_VALUES,
    ),
    evidence_refs: stringArrayField("Evidence refs supporting this stance."),
  });
}

function issueStanceResponseRowsField(
  context: RuntimeSubmitIssueStanceSchemaContext | undefined,
): OntoToolPropertySchema {
  const entries = Object.entries(context?.issue_evidence_refs ?? {});
  if (entries.length === 0) {
    return arrayField(
      "One stance per known issue for this lens.",
      issueStanceResponseRowField(),
    );
  }
  const itemVariants = entries.map(([issueId, refs]) =>
    objectField(`Stance row for ${issueId}.`, {
      issue_id: enumField("Issue id.", [issueId]),
      stance: enumField("Lens stance.", STANCE_VALUES),
      rationale: stringField("Why this lens takes this stance."),
      root_hypothesis_position: enumField(
        "Position on the issue root hypothesis.",
        ROOT_HYPOTHESIS_POSITION_VALUES,
      ),
      severity_position: enumField(
        "Position on the issue severity.",
        SEVERITY_POSITION_VALUES,
      ),
      evidence_refs: stringArrayField(
        `Evidence refs supporting this stance. Use only refs allowed for this issue and lens. Allowed ref count: ${refs.length}.`,
      ),
    }),
  );
  return {
    type: "array",
    description: "One stance per known issue for this lens.",
    items: {
      anyOf: itemVariants,
    } as unknown as OntoToolPropertySchema,
  };
}

function deliberationResolutionIssueField(): OntoToolPropertySchema {
  return objectField("One deliberation resolution issue row.", {
    issue_id: stringField("Issue id."),
    status: enumField("Resolution status.", DELIBERATION_RESOLUTION_STATUS_VALUES),
    final_root_cause: stringField("Accepted or narrowed root cause."),
    final_claim: stringField("Final issue claim."),
    surface_finding_ids: stringArrayField("Surface finding ids for this issue."),
    accepted_by_lens_ids: stringArrayField("Lens ids accepting the resolution."),
    remaining_disagreement_lens_ids: stringArrayField(
      "Lens ids with remaining disagreement.",
    ),
    reason: stringField("Why this status follows from the artifacts."),
    required_follow_up_evidence: stringArrayField("Required follow-up evidence refs."),
  });
}

function rejectRuntimeOwnedFields(
  args: Record<string, unknown>,
  label: string,
  fields: string[],
): void {
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(args, field)) {
      throw new Error(
        `${label} must not submit runtime-owned field ${field}; the runtime fills it.`,
      );
    }
  }
}

function rejectUnknownFields(
  args: Record<string, unknown>,
  label: string,
  allowedFields: readonly string[],
): void {
  const allowed = new Set(allowedFields);
  for (const field of Object.keys(args)) {
    if (!allowed.has(field)) {
      throw new Error(`${label} has unsupported field ${field}.`);
    }
  }
}

function submitOnce(
  state: RuntimeSubmitState,
  artifact: Record<string, unknown>,
): string {
  if (state.artifact !== undefined) {
    throw new Error(`${state.outputFormat} submission may be called only once.`);
  }
  state.artifact = artifact;
  return JSON.stringify({
    accepted: true,
    output_format: state.outputFormat,
    unit_id: state.unitId,
  });
}

function arrayValue(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value;
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function enumStringValue(
  value: unknown,
  values: readonly string[],
  label: string,
): string {
  const text = stringValue(value, label);
  if (!values.includes(text)) {
    throw new Error(`${label} must be one of: ${values.join(", ")}.`);
  }
  return text;
}

function stringArrayValue(value: unknown, label: string): string[] {
  return arrayValue(value, label).map((item, index) =>
    stringValue(item, `${label}[${index}]`),
  );
}

function nullableStringValue(value: unknown, label: string): string | null {
  if (value === null) return null;
  return stringValue(value, label);
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }
  return value;
}

function assertAllowedRefs(args: {
  refs: string[];
  allowedRefs: readonly string[] | undefined;
  label: string;
}): void {
  if (!args.allowedRefs) return;
  const allowed = new Set(args.allowedRefs);
  for (const ref of args.refs) {
    if (!allowed.has(ref)) {
      throw new Error(`${args.label} contains unsupported ref: ${ref}`);
    }
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonMaterialSeverity(value: unknown): boolean {
  return value === "low" || value === "info";
}

function withNonMaterialSurfaceDefaults(
  record: Record<string, unknown>,
): Record<string, unknown> {
  if (!isNonMaterialSeverity(record.severity)) return record;
  return {
    ...record,
    affected_purpose: isNonEmptyString(record.affected_purpose)
      ? record.affected_purpose
      : "No affected purpose was established by this non-material surface observation within the bounded lens output.",
    failure_condition: isNonEmptyString(record.failure_condition)
      ? record.failure_condition
      : "No concrete failure condition was established within the bounded lens output.",
    impact: isNonEmptyString(record.impact)
      ? record.impact
      : "No material impact was established; preserve as a non-material surface observation.",
  };
}

function normalizeFindingLedgerSubmitArgs(
  args: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...args,
    findings: arrayValue(args.findings, "submit_issue_artifact.findings").map(
      (item, index) =>
        withNonMaterialSurfaceDefaults(
          objectValue(item, `submit_issue_artifact.findings[${index}]`),
        ),
    ),
  };
}

function issueIdsByFindingIdFromIssueRows(
  issues: Record<string, unknown>[],
): Map<string, string> {
  const issueIdsByFindingId = new Map<string, string>();
  for (const [issueIndex, issue] of issues.entries()) {
    const issueId = stringValue(
      issue.issue_id,
      `submit_issue_artifact.issues[${issueIndex}].issue_id`,
    );
    for (const findingId of arrayValue(
      issue.surface_finding_ids,
      `submit_issue_artifact.issues[${issueIndex}].surface_finding_ids`,
    )) {
      const findingIdString = stringValue(
        findingId,
        `submit_issue_artifact.issues[${issueIndex}].surface_finding_ids[]`,
      );
      const previousIssueId = issueIdsByFindingId.get(findingIdString);
      if (previousIssueId && previousIssueId !== issueId) {
        throw new Error(
          `submit_issue_artifact assigns finding ${findingIdString} to both ${previousIssueId} and ${issueId}.`,
        );
      }
      issueIdsByFindingId.set(findingIdString, issueId);
    }
  }
  return issueIdsByFindingId;
}

function buildRuntimeIssueDependencies(args: {
  issues: Record<string, unknown>[];
  context: RuntimeSubmitIssueLedgerDependencyContext;
}): Record<string, unknown>[] {
  const issueIdsByFindingId = issueIdsByFindingIdFromIssueRows(args.issues);
  const grouped = new Map<
    string,
    {
      issue_ids: string[];
      relation_refs: string[];
      cause_claims: string[];
    }
  >();
  for (const relation of args.context.shared_cause_relations) {
    const fromIssueId = issueIdsByFindingId.get(relation.from_finding_id);
    const toIssueId = issueIdsByFindingId.get(relation.to_finding_id);
    if (!fromIssueId || !toIssueId || fromIssueId === toIssueId) continue;
    const issueIds = [fromIssueId, toIssueId].sort();
    const key = issueIds.join("\u0000");
    const group =
      grouped.get(key) ??
      {
        issue_ids: issueIds,
        relation_refs: [],
        cause_claims: [],
      };
    group.relation_refs.push(relation.relation_id);
    if (relation.cause_claim && relation.cause_claim.trim().length > 0) {
      group.cause_claims.push(relation.cause_claim);
    }
    grouped.set(key, group);
  }
  return Array.from(grouped.values()).map((group, index) => {
    const dependencyId = `dep-${String(index + 1).padStart(3, "0")}`;
    const causeSummary =
      group.cause_claims.length > 0
        ? group.cause_claims.join(" / ")
        : `shared_cause_candidate relation(s): ${group.relation_refs.join(", ")}`;
    return {
      dependency_id: dependencyId,
      dependency_kind: "shared_cause_candidate",
      issue_ids: group.issue_ids,
      relation_refs: group.relation_refs,
      rationale: `Runtime projection: these distinct issues share preserved relation graph cause context (${causeSummary}).`,
    };
  });
}

function normalizeIssueLedgerSubmitArgs(
  args: Record<string, unknown>,
  context: RuntimeSubmitIssueLedgerDependencyContext | undefined,
): Record<string, unknown> {
  if (!context) {
    throw new Error(
      "submit_issue_artifact for issue-ledger is missing runtime issue dependency context.",
    );
  }
  rejectUnknownFields(args, "submit_issue_artifact", ["issues", "validation"]);
  const issues = arrayValue(args.issues, "submit_issue_artifact.issues").map(
    (item, index) =>
      withNonMaterialSurfaceDefaults(
        objectValue(item, `submit_issue_artifact.issues[${index}]`),
      ),
  );
  return {
    issues,
    issue_dependencies: buildRuntimeIssueDependencies({ issues, context }),
    validation: objectValue(args.validation, "submit_issue_artifact.validation"),
  };
}

function parseIssueStanceLensId(unitId: string): string {
  const prefix = "issue-stance:";
  if (!unitId.startsWith(prefix) || unitId.length <= prefix.length) {
    throw new Error(`issue-stance-response unit_id must be issue-stance:{lens_id}: ${unitId}`);
  }
  return unitId.slice(prefix.length);
}

function normalizeIssueStanceResponseSubmitArgs(
  args: Record<string, unknown>,
  context: RuntimeSubmitIssueStanceSchemaContext | undefined,
): Record<string, unknown> {
  rejectUnknownFields(args, "submit_issue_stance_response", ["stances"]);
  const expectedIssueIds = new Set(Object.keys(context?.issue_evidence_refs ?? {}));
  const observedIssueIds = new Set<string>();
  const stances = arrayValue(
    args.stances,
    "submit_issue_stance_response.stances",
  ).map((item, index) => {
    const label = `submit_issue_stance_response.stances[${index}]`;
    const stance = objectValue(item, label);
    rejectUnknownFields(stance, label, [
      "issue_id",
      "stance",
      "rationale",
      "root_hypothesis_position",
      "severity_position",
      "evidence_refs",
    ]);
    const issueId = stringValue(stance.issue_id, `${label}.issue_id`);
    if (expectedIssueIds.size > 0 && !expectedIssueIds.has(issueId)) {
      throw new Error(`${label}.issue_id is not in the runtime issue projection: ${issueId}`);
    }
    if (observedIssueIds.has(issueId)) {
      throw new Error(`submit_issue_stance_response duplicates issue_id: ${issueId}`);
    }
    observedIssueIds.add(issueId);
    const evidenceRefs = stringArrayValue(
      stance.evidence_refs,
      `${label}.evidence_refs`,
    );
    const allowedRefs = context?.issue_evidence_refs[issueId];
    if (allowedRefs) {
      const allowed = new Set(allowedRefs);
      for (const evidenceRef of evidenceRefs) {
        if (!allowed.has(evidenceRef)) {
          throw new Error(
            `${label}.evidence_refs contains unsupported ref for ${issueId}: ${evidenceRef}`,
          );
        }
      }
    }
    return {
      issue_id: issueId,
      stance: enumStringValue(stance.stance, STANCE_VALUES, `${label}.stance`),
      rationale: stringValue(stance.rationale, `${label}.rationale`),
      root_hypothesis_position: enumStringValue(
        stance.root_hypothesis_position,
        ROOT_HYPOTHESIS_POSITION_VALUES,
        `${label}.root_hypothesis_position`,
      ),
      severity_position: enumStringValue(
        stance.severity_position,
        SEVERITY_POSITION_VALUES,
        `${label}.severity_position`,
      ),
      evidence_refs: evidenceRefs,
    };
  });
  if (expectedIssueIds.size > 0) {
    const missingIssueIds = [...expectedIssueIds].filter(
      (issueId) => !observedIssueIds.has(issueId),
    );
    if (missingIssueIds.length > 0) {
      throw new Error(
        `submit_issue_stance_response is missing issue_id(s): ${missingIssueIds.join(", ")}`,
      );
    }
  }
  return { stances };
}

function normalizeIssueDeliberationResponseSubmitArgs(
  args: Record<string, unknown>,
  context: RuntimeSubmitIssueDeliberationSchemaContext | undefined,
): Record<string, unknown> {
  rejectUnknownFields(args, "submit_issue_deliberation_response", [
    "difference_explanation",
    "response_to_other_positions",
    "updated_stance",
    "changed",
    "change_reason",
    "accepted_root_hypothesis",
    "remaining_blocker",
    "evidence_refs",
  ]);
  const changed = booleanValue(args.changed, "submit_issue_deliberation_response.changed");
  const changeReason = nullableStringValue(
    args.change_reason,
    "submit_issue_deliberation_response.change_reason",
  );
  if (changed && changeReason === null) {
    throw new Error(
      "submit_issue_deliberation_response.change_reason must be non-null when changed=true.",
    );
  }
  if (!changed && changeReason !== null) {
    throw new Error(
      "submit_issue_deliberation_response.change_reason must be null when changed=false.",
    );
  }
  const evidenceRefs = stringArrayValue(
    args.evidence_refs,
    "submit_issue_deliberation_response.evidence_refs",
  );
  assertAllowedRefs({
    refs: evidenceRefs,
    allowedRefs: context?.allowed_evidence_refs,
    label: "submit_issue_deliberation_response.evidence_refs",
  });
  return {
    difference_explanation: stringValue(
      args.difference_explanation,
      "submit_issue_deliberation_response.difference_explanation",
    ),
    response_to_other_positions: stringValue(
      args.response_to_other_positions,
      "submit_issue_deliberation_response.response_to_other_positions",
    ),
    updated_stance: enumStringValue(
      args.updated_stance,
      STANCE_VALUES,
      "submit_issue_deliberation_response.updated_stance",
    ),
    changed,
    change_reason: changeReason,
    accepted_root_hypothesis: nullableStringValue(
      args.accepted_root_hypothesis,
      "submit_issue_deliberation_response.accepted_root_hypothesis",
    ),
    remaining_blocker: nullableStringValue(
      args.remaining_blocker,
      "submit_issue_deliberation_response.remaining_blocker",
    ),
    evidence_refs: evidenceRefs,
  };
}

function normalizeIssueSynthesisResponseSubmitArgs(
  args: Record<string, unknown>,
  context: RuntimeSubmitIssueSynthesisSchemaContext | undefined,
): Record<string, unknown> {
  if (!context) {
    throw new Error(
      "submit_issue_synthesis_response is missing runtime synthesis schema context.",
    );
  }
  rejectUnknownFields(args, "submit_issue_synthesis_response", [
    "conclusion",
    "materiality_explanation",
    "root_cause_explanation",
    "causal_path_explanation",
    "action_explanation",
    "unresolved_disagreement_note",
    "boundary_notes",
    "source_refs_used",
  ]);
  const boundaryNotes = stringArrayValue(
    args.boundary_notes,
    "submit_issue_synthesis_response.boundary_notes",
  );
  if (boundaryNotes.length > MAX_SYNTHESIS_BOUNDARY_NOTES) {
    throw new Error(
      `submit_issue_synthesis_response.boundary_notes must contain at most ${MAX_SYNTHESIS_BOUNDARY_NOTES} notes.`,
    );
  }
  const sourceRefsUsed = stringArrayValue(
    args.source_refs_used,
    "submit_issue_synthesis_response.source_refs_used",
  );
  if (context.allowed_source_refs.length === 0) {
    throw new Error(
      "submit_issue_synthesis_response cannot validate source_refs_used because allowed_source_refs is empty.",
    );
  }
  assertAllowedRefs({
    refs: sourceRefsUsed,
    allowedRefs: [
      ...context.allowed_source_refs,
      context.source_work_item_ref,
    ],
    label: "submit_issue_synthesis_response.source_refs_used",
  });
  if (!sourceRefsUsed.some((ref) => context.allowed_source_refs.includes(ref))) {
    throw new Error(
      "submit_issue_synthesis_response.source_refs_used must include at least one allowed source ref.",
    );
  }
  return {
    conclusion: stringValue(args.conclusion, "submit_issue_synthesis_response.conclusion"),
    materiality_explanation: stringValue(
      args.materiality_explanation,
      "submit_issue_synthesis_response.materiality_explanation",
    ),
    root_cause_explanation: stringValue(
      args.root_cause_explanation,
      "submit_issue_synthesis_response.root_cause_explanation",
    ),
    causal_path_explanation: stringValue(
      args.causal_path_explanation,
      "submit_issue_synthesis_response.causal_path_explanation",
    ),
    action_explanation: stringValue(
      args.action_explanation,
      "submit_issue_synthesis_response.action_explanation",
    ),
    unresolved_disagreement_note: nullableStringValue(
      args.unresolved_disagreement_note,
      "submit_issue_synthesis_response.unresolved_disagreement_note",
    ),
    boundary_notes: boundaryNotes,
    source_refs_used: sourceRefsUsed,
  };
}

function parseIssueDeliberationUnit(unitId: string): {
  issueId: string;
  lensId: string;
} {
  const [prefix, issueId, lensId, ...extra] = unitId.split(":");
  if (
    prefix !== "deliberation" ||
    !issueId ||
    !lensId ||
    extra.length > 0 ||
    unitId === "controlled-deliberation"
  ) {
    throw new Error(
      `issue-deliberation-response unit_id must be deliberation:{issue_id}:{lens_id}: ${unitId}`,
    );
  }
  return { issueId, lensId };
}

function parseIssueSynthesisUnit(unitId: string): string {
  const prefix = "synthesis:";
  if (!unitId.startsWith(prefix) || unitId.length <= prefix.length) {
    throw new Error(
      `issue-synthesis-response unit_id must be synthesis:{issue_id}: ${unitId}`,
    );
  }
  return unitId.slice(prefix.length);
}

function issueArtifactToolSchema(unitId: string): OntoTool["input_schema"] {
  switch (unitId) {
    case "finding-ledger":
      return {
        type: "object",
        additionalProperties: false,
        required: ["findings", "validation"],
        properties: {
          findings: arrayField("All finding-ledger rows.", findingLedgerFindingField()),
          validation: validationField("Finding-ledger validation.", {
            unaddressable_findings: stringArrayField("Unaddressable finding ids."),
          }),
        },
      };
    case "finding-relation-graph":
      return {
        type: "object",
        additionalProperties: false,
        required: ["relations", "singleton_findings"],
        properties: {
          relations: arrayField(
            "Accepted finding relation rows.",
            findingRelationRowField(),
          ),
          singleton_findings: arrayField(
            "Findings intentionally left as singleton rows.",
            findingRelationSingletonField(),
          ),
        },
      };
    case "issue-ledger":
      return {
        type: "object",
        additionalProperties: false,
        required: ["issues", "validation"],
        properties: {
          issues: arrayField("Root-cause issue cluster rows.", issueLedgerIssueField()),
          validation: validationField("Issue-ledger validation.", {
            unclustered_finding_ids: stringArrayField("Unclustered finding ids."),
          }),
        },
      };
    case "deliberation-plan":
      return {
        type: "object",
        additionalProperties: false,
        required: ["planned_issues", "skipped_issues"],
        properties: {
          planned_issues: arrayField(
            "Material conflict issues that require deliberation.",
            deliberationPlanPlannedIssueField(),
          ),
          skipped_issues: arrayField(
            "Issues that do not require controlled deliberation.",
            deliberationPlanSkippedIssueField(),
          ),
        },
      };
    case "problem-framing":
      return {
        type: "object",
        additionalProperties: false,
        required: ["classifications"],
        properties: {
          classifications: problemFramingClassificationsField(),
        },
      };
    default:
      throw new Error(`Unsupported issue artifact submit unit: ${unitId}`);
  }
}

function createIssueArtifactSubmitTool(state: RuntimeSubmitState): OntoTool {
  if (!ISSUE_ARTIFACT_IDS.has(state.unitId)) {
    throw new Error(`Unsupported issue artifact submit unit: ${state.unitId}`);
  }
  return {
    name: "submit_issue_artifact",
    description:
      "Submit the complete semantic body for one review issue artifact. The runtime writes schema_version, session_id, and the YAML file.",
    input_schema: issueArtifactToolSchema(state.unitId),
    execute: async (args) => {
      const runtimeOwnedFields = [
        "schema_version",
        "session_id",
        "artifact_id",
        "lens_id",
        "issue_id",
      ];
      if (state.unitId === "problem-framing") {
        runtimeOwnedFields.push("classification_context");
      }
      rejectRuntimeOwnedFields(args, "submit_issue_artifact", runtimeOwnedFields);
      if (state.unitId === "problem-framing") {
        const context = state.problemFramingContext;
        if (!context) {
          throw new Error("submit_issue_artifact for problem-framing is missing runtime problem framing context.");
        }
        const classifications = arrayValue(
          args.classifications,
          "submit_issue_artifact.classifications",
        ).map((item, index) => {
          const classification = objectValue(
            item,
            `submit_issue_artifact.classifications[${index}]`,
          );
          rejectUnknownFields(
            classification,
            `submit_issue_artifact.classifications[${index}]`,
            PROBLEM_FRAMING_CLASSIFICATION_SUBMIT_KEYS,
          );
          if (Object.prototype.hasOwnProperty.call(classification, "related_surface_finding_ids")) {
            throw new Error(
              `submit_issue_artifact.classifications[${index}].related_surface_finding_ids is runtime-owned for problem-framing.`,
            );
          }
          const issueId = stringValue(
            classification.issue_id,
            `submit_issue_artifact.classifications[${index}].issue_id`,
          );
          const surfaceFindingIds = context.issue_surface_finding_ids[issueId];
          if (!surfaceFindingIds) {
            throw new Error(
              `submit_issue_artifact.classifications[${index}].issue_id has no runtime issue surface finding map: ${issueId}`,
            );
          }
          return {
            issue_id: issueId,
            problem_definition: stringValue(
              classification.problem_definition,
              `submit_issue_artifact.classifications[${index}].problem_definition`,
            ),
            issue_role: enumStringValue(
              classification.issue_role,
              PROBLEM_FRAMING_ISSUE_ROLE_VALUES,
              `submit_issue_artifact.classifications[${index}].issue_role`,
            ),
            judgment_state: enumStringValue(
              classification.judgment_state,
              PROBLEM_FRAMING_JUDGMENT_STATE_VALUES,
              `submit_issue_artifact.classifications[${index}].judgment_state`,
            ),
            impact_kind: enumStringValue(
              classification.impact_kind,
              PROBLEM_FRAMING_IMPACT_KIND_VALUES,
              `submit_issue_artifact.classifications[${index}].impact_kind`,
            ),
            timing_class: enumStringValue(
              classification.timing_class,
              PROBLEM_FRAMING_TIMING_CLASS_VALUES,
              `submit_issue_artifact.classifications[${index}].timing_class`,
            ),
            closure_class: enumStringValue(
              classification.closure_class,
              PROBLEM_FRAMING_CLOSURE_CLASS_VALUES,
              `submit_issue_artifact.classifications[${index}].closure_class`,
            ),
            closure_obligation: enumStringValue(
              classification.closure_obligation,
              PROBLEM_FRAMING_CLOSURE_OBLIGATION_VALUES,
              `submit_issue_artifact.classifications[${index}].closure_obligation`,
            ),
            domain_axes: objectValue(
              classification.domain_axes,
              `submit_issue_artifact.classifications[${index}].domain_axes`,
            ),
            rationale: stringValue(
              classification.rationale,
              `submit_issue_artifact.classifications[${index}].rationale`,
            ),
            related_surface_finding_ids: surfaceFindingIds,
          };
        });
        return submitOnce(state, {
          schema_version: 1,
          session_id: state.sessionId,
          classification_context: context.classification_context,
          classifications,
        });
      }
      if (state.unitId === "finding-ledger") {
        return submitOnce(state, {
          schema_version: 1,
          session_id: state.sessionId,
          ...normalizeFindingLedgerSubmitArgs(args),
        });
      }
      if (state.unitId === "issue-ledger") {
        return submitOnce(state, {
          schema_version: 1,
          session_id: state.sessionId,
          ...normalizeIssueLedgerSubmitArgs(
            args,
            state.issueLedgerDependencyContext,
          ),
        });
      }
      return submitOnce(state, {
        schema_version: 1,
        session_id: state.sessionId,
        ...args,
      });
    },
  };
}

function createIssueStanceResponseSubmitTool(state: RuntimeSubmitState): OntoTool {
  const lensId = parseIssueStanceLensId(state.unitId);
  return {
    name: "submit_issue_stance_response",
    description:
      "Submit all issue stances for one lens. The runtime writes the response envelope and validation scaffold.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["stances"],
      properties: {
        stances: issueStanceResponseRowsField(state.issueStanceSchemaContext),
      },
    },
    execute: async (args) => {
      rejectRuntimeOwnedFields(args, "submit_issue_stance_response", [
        "schema_version",
        "session_id",
        "lens_id",
        "validation",
      ]);
      const normalized = normalizeIssueStanceResponseSubmitArgs(
        args,
        state.issueStanceSchemaContext,
      );
      return submitOnce(state, {
        schema_version: 1,
        session_id: state.sessionId,
        lens_id: lensId,
        ...normalized,
        validation: {
          missing_issues: [],
        },
      });
    },
  };
}

function createIssueDeliberationResponseSubmitTool(state: RuntimeSubmitState): OntoTool {
  const { issueId, lensId } = parseIssueDeliberationUnit(state.unitId);
  const evidenceRefsDescription = state.issueDeliberationSchemaContext
    ? `Evidence refs supporting this response. Use only refs from the runtime projection. Allowed ref count: ${state.issueDeliberationSchemaContext.allowed_evidence_refs.length}.`
    : "Evidence refs supporting this response.";
  return {
    name: "submit_issue_deliberation_response",
    description:
      "Submit one issue-scoped deliberation response. The runtime writes the YAML envelope and source stance ref.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "difference_explanation",
        "response_to_other_positions",
        "updated_stance",
        "changed",
        "change_reason",
        "accepted_root_hypothesis",
        "remaining_blocker",
        "evidence_refs",
      ],
      properties: {
        difference_explanation: stringField("Exact disagreement or convergence point."),
        response_to_other_positions: stringField("How this lens responds to peer positions."),
        updated_stance: {
          type: "string",
          description: "Updated stance after seeing peer positions.",
          enum: [
            "support",
            "oppose",
            "narrow",
            "alternative_root",
            "surface_only",
            "not_applicable",
            "insufficient_evidence",
          ],
        },
        changed: booleanField("Whether this stance changed from the source stance."),
        change_reason: nullableStringField("Required when changed=true; null when unchanged."),
        accepted_root_hypothesis: nullableStringField("Accepted or revised root hypothesis."),
        remaining_blocker: nullableStringField("Remaining blocker, or null."),
        evidence_refs: stringArrayField(evidenceRefsDescription),
      },
    },
    execute: async (args) => {
      rejectRuntimeOwnedFields(args, "submit_issue_deliberation_response", [
        "schema_version",
        "session_id",
        "lens_id",
        "issue_id",
        "validation",
      ]);
      const normalized = normalizeIssueDeliberationResponseSubmitArgs(
        args,
        state.issueDeliberationSchemaContext,
      );
      return submitOnce(state, {
        schema_version: 1,
        session_id: state.sessionId,
        issue_id: issueId,
        lens_id: lensId,
        ...normalized,
        validation: {
          source_stance_ref: `issue-stance-matrix.yaml#stances.${issueId}.${lensId}`,
        },
      });
    },
  };
}

function createDeliberationResolutionSubmitTool(state: RuntimeSubmitState): OntoTool {
  if (state.unitId !== "controlled-deliberation") {
    throw new Error(
      `deliberation-resolution output is only supported for controlled-deliberation, got ${state.unitId}`,
    );
  }
  return {
    name: "submit_deliberation_resolution",
    description:
      "Submit final controlled deliberation resolution rows. The runtime writes the YAML envelope and validation scaffold.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["issues"],
      properties: {
        issues: arrayField(
          "One final resolution row per issue-ledger issue.",
          deliberationResolutionIssueField(),
        ),
      },
    },
    execute: async (args) => {
      rejectRuntimeOwnedFields(args, "submit_deliberation_resolution", [
        "schema_version",
        "session_id",
        "lens_id",
        "issue_id",
        "validation",
      ]);
      return submitOnce(state, {
        schema_version: 1,
        session_id: state.sessionId,
        issues: args.issues,
        validation: {
          missing_issue_ids: [],
        },
      });
    },
  };
}

function createIssueSynthesisResponseSubmitTool(state: RuntimeSubmitState): OntoTool {
  const issueId = parseIssueSynthesisUnit(state.unitId);
  const sourceRefsDescription = state.issueSynthesisSchemaContext
    ? `Refs used from the work item's allowed source refs. Allowed source ref count: ${state.issueSynthesisSchemaContext.allowed_source_refs.length}.`
    : "Refs used from the work item's allowed source refs.";
  return {
    name: "submit_issue_synthesis_response",
    description:
      "Submit one issue-scoped synthesis response. The runtime writes the YAML envelope and source work-item ref.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "conclusion",
        "materiality_explanation",
        "root_cause_explanation",
        "causal_path_explanation",
        "action_explanation",
        "unresolved_disagreement_note",
        "boundary_notes",
        "source_refs_used",
      ],
      properties: {
        conclusion: stringField("Plain conclusion for this issue."),
        materiality_explanation: stringField("Why this issue weakens the declared purpose."),
        root_cause_explanation: stringField("Why the root cause is the starting point."),
        causal_path_explanation: stringField("How the causal path leads to the issue."),
        action_explanation: stringField("What action is needed and why."),
        unresolved_disagreement_note: nullableStringField(
          "Remaining unresolved disagreement, or null.",
        ),
        boundary_notes: stringArrayField("At most three compact boundary notes."),
        source_refs_used: stringArrayField(sourceRefsDescription),
      },
    },
    execute: async (args) => {
      rejectRuntimeOwnedFields(args, "submit_issue_synthesis_response", [
        "schema_version",
        "session_id",
        "work_item_id",
        "issue_id",
        "source_work_item_ref",
        "validation",
      ]);
      const normalized = normalizeIssueSynthesisResponseSubmitArgs(
        args,
        state.issueSynthesisSchemaContext,
      );
      return submitOnce(state, {
        schema_version: 1,
        session_id: state.sessionId,
        work_item_id: state.unitId,
        issue_id: issueId,
        source_work_item_ref: `synthesis-work-items.yaml#${state.unitId}`,
        ...normalized,
      });
    },
  };
}

export function createRuntimeSubmitTools(state: RuntimeSubmitState): OntoTool[] {
  switch (state.outputFormat) {
    case "issue-artifact":
      return [createIssueArtifactSubmitTool(state)];
    case "issue-stance-response":
      return [createIssueStanceResponseSubmitTool(state)];
    case "issue-deliberation-response":
      return [createIssueDeliberationResponseSubmitTool(state)];
    case "deliberation-resolution":
      return [createDeliberationResolutionSubmitTool(state)];
    case "issue-synthesis-response":
      return [createIssueSynthesisResponseSubmitTool(state)];
  }
}
