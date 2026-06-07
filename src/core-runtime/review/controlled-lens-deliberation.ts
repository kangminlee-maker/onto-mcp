import path from "node:path";
import {
  dumpYamlDocument,
  toRelativePath,
} from "./review-artifact-utils.js";

export type IssueDeliberationUpdatedStance =
  | "support"
  | "oppose"
  | "narrow"
  | "alternative_root"
  | "surface_only"
  | "not_applicable"
  | "insufficient_evidence";

export type DeliberationIssueStatus =
  | "no-deliberation-needed"
  | "resolved"
  | "narrowed"
  | "unresolved-with-reason";

export interface IssueScopedDeliberationWorkItem {
  issue_id: string;
  lens_id: string;
  packet_path: string;
  output_path: string;
  issue: Record<string, unknown>;
  related_issue_context: Array<Record<string, unknown>>;
  own_stance: Record<string, unknown>;
  peer_stances: Array<Record<string, unknown>>;
  plan_entry: Record<string, unknown>;
}

export interface IssueDeliberationResponseArtifact {
  schema_version: 1;
  session_id: string;
  issue_id: string;
  lens_id: string;
  difference_explanation: string;
  response_to_other_positions: string;
  updated_stance: IssueDeliberationUpdatedStance;
  changed: boolean;
  change_reason: string | null;
  accepted_root_hypothesis: string | null;
  remaining_blocker: string | null;
  evidence_refs: string[];
  validation: {
    source_stance_ref: string;
  };
}

export interface DeliberationResolutionIssue {
  issue_id: string;
  status: DeliberationIssueStatus;
  final_root_cause: string;
  final_claim: string;
  surface_finding_ids: string[];
  accepted_by_lens_ids: string[];
  remaining_disagreement_lens_ids: string[];
  reason: string;
  required_follow_up_evidence: string[];
}

export interface DeliberationResolutionArtifact {
  schema_version: 1;
  session_id: string;
  issues: DeliberationResolutionIssue[];
  validation: {
    missing_issue_ids: string[];
  };
}

const UPDATED_STANCE_VALUES = new Set([
  "support",
  "oppose",
  "narrow",
  "alternative_root",
  "surface_only",
  "not_applicable",
  "insufficient_evidence",
]);

const ISSUE_STATUS_VALUES = new Set([
  "no-deliberation-needed",
  "resolved",
  "narrowed",
  "unresolved-with-reason",
]);

const SAFE_ARTIFACT_SEGMENT_RE = /^[A-Za-z0-9._-]+$/;

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a YAML mapping.`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function requireStringOrNull(value: unknown, label: string): string | null {
  if (value === null) return null;
  return requireString(value, label);
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }
  return value;
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
  allowed: ReadonlySet<string>,
  label: string,
): T {
  const text = requireString(value, label);
  if (!allowed.has(text)) {
    throw new Error(
      `${label} has unsupported value: ${text}. Allowed values: ${[
        ...allowed,
      ].join(", ")}`,
    );
  }
  return text as T;
}

function ensureUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`${label} contains duplicate value: ${value}`);
    seen.add(value);
  }
}

function ensureExactStringSet(args: {
  actual: ReadonlySet<string>;
  expected: ReadonlySet<string>;
  label: string;
}): void {
  const missing = [...args.expected].filter((value) => !args.actual.has(value));
  const extra = [...args.actual].filter((value) => !args.expected.has(value));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `${args.label} mismatch. Missing: ${missing.join(", ") || "(none)"}; extra: ${
        extra.join(", ") || "(none)"
      }.`,
    );
  }
}

function requireSafeArtifactSegment(value: string, label: string): string {
  if (!SAFE_ARTIFACT_SEGMENT_RE.test(value)) {
    throw new Error(`${label} must be a safe artifact path segment: ${value}`);
  }
  return value;
}

function stanceAnchorRef(issueId: string, lensId: string): string {
  return `issue-stance-matrix.yaml#stances.${issueId}.${lensId}`;
}

function itemById(
  items: unknown,
  idField: string,
  expectedId: string,
  label: string,
): Record<string, unknown> {
  const match = requireArray(items, label)
    .map((item, index) => requireRecord(item, `${label}[${index}]`))
    .find((item) => item[idField] === expectedId);
  if (!match) {
    throw new Error(`${label} is missing ${idField}: ${expectedId}`);
  }
  return match;
}

function stancesForIssue(
  issueStanceMatrix: Record<string, unknown>,
  issueId: string,
): Array<Record<string, unknown>> {
  const issue = itemById(
    issueStanceMatrix.issues,
    "issue_id",
    issueId,
    "issue-stance-matrix.issues",
  );
  return requireArray(issue.stances, `issue-stance-matrix.${issueId}.stances`).map(
    (item, index) =>
      requireRecord(item, `issue-stance-matrix.${issueId}.stances[${index}]`),
  );
}

function stanceForLens(
  stances: Array<Record<string, unknown>>,
  lensId: string,
  label: string,
): Record<string, unknown> {
  const stance = stances.find((candidate) => candidate.lens_id === lensId);
  if (!stance) throw new Error(`${label} is missing lens stance: ${lensId}`);
  return stance;
}

function relatedIssueContextFor(
  issueId: string,
  issues: Array<Record<string, unknown>>,
  issueDependencies: unknown,
): Array<Record<string, unknown>> {
  const issuesById = new Map(
    issues.map((issue) => [
      requireString(issue.issue_id, "issue-ledger.issues.issue_id"),
      issue,
    ]),
  );
  return requireArray(issueDependencies, "issue-ledger.issue_dependencies").flatMap(
    (item, index) => {
      const dependency = requireRecord(
        item,
        `issue-ledger.issue_dependencies[${index}]`,
      );
      const issueIds = requireStringArray(
        dependency.issue_ids,
        `issue-ledger.issue_dependencies[${index}].issue_ids`,
      );
      if (!issueIds.includes(issueId)) return [];
      return issueIds
        .filter((relatedIssueId) => relatedIssueId !== issueId)
        .map((relatedIssueId) => {
          const relatedIssue = issuesById.get(relatedIssueId);
          if (!relatedIssue) {
            throw new Error(
              `issue-ledger.issue_dependencies[${index}].issue_ids references unknown issue: ${relatedIssueId}`,
            );
          }
          return {
            issue_id: relatedIssueId,
            issue_statement: requireString(
              relatedIssue.issue_statement,
              `issue-ledger.issues.${relatedIssueId}.issue_statement`,
            ),
            root_cause_hypothesis: requireString(
              relatedIssue.root_cause_hypothesis,
              `issue-ledger.issues.${relatedIssueId}.root_cause_hypothesis`,
            ),
            severity: requireString(
              relatedIssue.severity,
              `issue-ledger.issues.${relatedIssueId}.severity`,
            ),
            dependency_id: requireString(
              dependency.dependency_id,
              `issue-ledger.issue_dependencies[${index}].dependency_id`,
            ),
            dependency_kind: requireString(
              dependency.dependency_kind,
              `issue-ledger.issue_dependencies[${index}].dependency_kind`,
            ),
            relation_refs: requireStringArray(
              dependency.relation_refs,
              `issue-ledger.issue_dependencies[${index}].relation_refs`,
            ),
            rationale: requireString(
              dependency.rationale,
              `issue-ledger.issue_dependencies[${index}].rationale`,
            ),
          };
        });
    },
  );
}

function issueLedgerIssues(issueLedger: Record<string, unknown>): Array<Record<string, unknown>> {
  return requireArray(issueLedger.issues, "issue-ledger.issues").map(
    (item, index) => requireRecord(item, `issue-ledger.issues[${index}]`),
  );
}

function plannedIssueEntries(deliberationPlan: Record<string, unknown>): Array<Record<string, unknown>> {
  return requireArray(
    deliberationPlan.planned_issues,
    "deliberation-plan.planned_issues",
  ).map((item, index) =>
    requireRecord(item, `deliberation-plan.planned_issues[${index}]`),
  );
}

function skippedIssueIds(deliberationPlan: Record<string, unknown>): string[] {
  return requireArray(
    deliberationPlan.skipped_issues,
    "deliberation-plan.skipped_issues",
  ).map((item, index) => {
    const record = requireRecord(item, `deliberation-plan.skipped_issues[${index}]`);
    return requireString(
      record.issue_id,
      `deliberation-plan.skipped_issues[${index}].issue_id`,
    );
  });
}

export function deliberationResolutionPath(sessionRoot: string): string {
  return path.join(sessionRoot, "deliberation-resolution.yaml");
}

export function issueDeliberationResponsePath(args: {
  deliberationRootPath: string;
  issueId: string;
  lensId: string;
}): string {
  const issueId = requireSafeArtifactSegment(args.issueId, "issue_id");
  const lensId = requireSafeArtifactSegment(args.lensId, "lens_id");
  return path.join(args.deliberationRootPath, "responses", issueId, `${lensId}.yaml`);
}

export function issueDeliberationPromptPacketPath(args: {
  promptPacketsRoot: string;
  issueId: string;
  lensId: string;
}): string {
  const issueId = requireSafeArtifactSegment(args.issueId, "issue_id");
  const lensId = requireSafeArtifactSegment(args.lensId, "lens_id");
  return path.join(
    args.promptPacketsRoot,
    "deliberation",
    issueId,
    `${lensId}.prompt.md`,
  );
}

export function buildIssueScopedDeliberationWorklist(args: {
  promptPacketsRoot: string;
  deliberationRootPath: string;
  deliberationPlan: Record<string, unknown>;
  issueLedger: Record<string, unknown>;
  issueStanceMatrix: Record<string, unknown>;
}): IssueScopedDeliberationWorkItem[] {
  const issues = issueLedgerIssues(args.issueLedger);
  const workItems: IssueScopedDeliberationWorkItem[] = [];

  for (const [index, planEntry] of plannedIssueEntries(args.deliberationPlan).entries()) {
    const issueId = requireString(
      planEntry.issue_id,
      `deliberation-plan.planned_issues[${index}].issue_id`,
    );
    requireSafeArtifactSegment(issueId, `deliberation-plan.planned_issues[${index}].issue_id`);
    const participatingLensIds = requireStringArray(
      planEntry.participating_lens_ids,
      `deliberation-plan.planned_issues[${index}].participating_lens_ids`,
    );
    if (participatingLensIds.length === 0) {
      throw new Error(
        `deliberation-plan.planned_issues[${index}].participating_lens_ids must not be empty.`,
      );
    }
    ensureUnique(
      participatingLensIds,
      `deliberation-plan.planned_issues[${index}].participating_lens_ids`,
    );
    const sourceStanceRefs = requireStringArray(
      planEntry.source_stance_refs,
      `deliberation-plan.planned_issues[${index}].source_stance_refs`,
    );
    ensureExactStringSet({
      actual: new Set(sourceStanceRefs),
      expected: new Set(participatingLensIds.map((lensId) => stanceAnchorRef(issueId, lensId))),
      label: `deliberation-plan.planned_issues[${index}].source_stance_refs`,
    });

    const issue = itemById(issues, "issue_id", issueId, "issue-ledger.issues");
    const relatedIssueContext = relatedIssueContextFor(
      issueId,
      issues,
      args.issueLedger.issue_dependencies,
    );
    const issueStances = stancesForIssue(args.issueStanceMatrix, issueId);
    for (const lensId of participatingLensIds) {
      requireSafeArtifactSegment(lensId, `deliberation-plan.planned_issues[${index}].participating_lens_ids`);
      const ownStance = stanceForLens(
        issueStances,
        lensId,
        `deliberation-plan.${issueId}`,
      );
      const peerStances = participatingLensIds
        .filter((peerLensId) => peerLensId !== lensId)
        .map((peerLensId) =>
          stanceForLens(issueStances, peerLensId, `deliberation-plan.${issueId}`),
        );
      workItems.push({
        issue_id: issueId,
        lens_id: lensId,
        packet_path: issueDeliberationPromptPacketPath({
          promptPacketsRoot: args.promptPacketsRoot,
          issueId,
          lensId,
        }),
        output_path: issueDeliberationResponsePath({
          deliberationRootPath: args.deliberationRootPath,
          issueId,
          lensId,
        }),
        issue,
        related_issue_context: relatedIssueContext,
        own_stance: ownStance,
        peer_stances: peerStances,
        plan_entry: planEntry,
      });
    }
  }

  return workItems;
}

export function buildIssueScopedLensDeliberationPrompt(args: {
  sessionId: string;
  projectRoot: string;
  workItem: IssueScopedDeliberationWorkItem;
  boundaryContext?: string;
}): string {
  const outputRef = toRelativePath(args.workItem.output_path, args.projectRoot);
  const payload = {
    issue: args.workItem.issue,
    related_issue_context: args.workItem.related_issue_context,
    plan_entry: args.workItem.plan_entry,
    own_stance: args.workItem.own_stance,
    peer_stances: args.workItem.peer_stances,
  };
  return `# Issue-Scoped Lens Deliberation Prompt

session_id: ${args.sessionId}
unit_id: deliberation:${args.workItem.issue_id}:${args.workItem.lens_id}
unit_kind: deliberation
issue_id: ${args.workItem.issue_id}
lens_id: ${args.workItem.lens_id}
output_path: ${outputRef}

## Canonical Role
You are one lens response worker for one planned issue.
You do not summarize all lens outputs.
You respond only to the issue, your recorded stance, and the peer stances in the runtime projection.
Use related_issue_context only to preserve dependency/shared-cause context; do not expand the deliberation beyond the planned issue.

## Hard Output Contract
- Submit the response by calling \`submit_issue_deliberation_response\` exactly once when the executor provides runtime submit tools.
- Do not handwrite YAML, markdown fences, or commentary as the durable output.
- Runtime owns \`schema_version\`, \`session_id\`, \`issue_id\`, \`lens_id\`, \`validation.source_stance_ref\`, and YAML serialization.
- If \`changed: true\`, \`change_reason\` must be a non-empty string.
- If \`changed: false\`, \`change_reason\` must be null.

## Updated Stance Values
- support
- oppose
- narrow
- alternative_root
- surface_only
- not_applicable
- insufficient_evidence

## Runtime Projection
\`\`\`yaml
${dumpYamlDocument(payload)}
\`\`\`

## Task
Decide whether your lens stance should change after seeing only the peer positions above.
Preserve the issue semantics from issue-ledger and the exact conflict scope from deliberation-plan.
Preserve related_issue_context when it changes the dependency or shared-cause interpretation for this issue.
Do not introduce a new issue.

## Runtime-Written YAML Shape
schema_version: 1
session_id: "${args.sessionId}"
issue_id: "${args.workItem.issue_id}"
lens_id: "${args.workItem.lens_id}"
difference_explanation: "the exact disagreement or convergence point"
response_to_other_positions: "how this lens responds to peer positions"
updated_stance: narrow
changed: true
change_reason: "why the stance changed, or null when unchanged"
accepted_root_hypothesis: "accepted or revised root hypothesis, or null"
remaining_blocker: "what still blocks resolution, or null"
evidence_refs:
  - "issue-ledger.yaml#${args.workItem.issue_id}"
validation:
  source_stance_ref: "${stanceAnchorRef(args.workItem.issue_id, args.workItem.lens_id)}"
${args.boundaryContext ? `\n${args.boundaryContext.trim()}\n` : ""}`;
}

export function validateIssueDeliberationResponseObject(args: {
  parsed: unknown;
  sessionId: string;
  issueId: string;
  lensId: string;
  allowedEvidenceRefs?: readonly string[];
}): IssueDeliberationResponseArtifact {
  const artifact = requireRecord(args.parsed, "issue deliberation response");
  const schemaVersion = artifact.schema_version;
  if (schemaVersion !== 1) {
    throw new Error(`issue deliberation response schema_version must be 1.`);
  }
  const sessionId = requireString(artifact.session_id, "issue deliberation response.session_id");
  if (sessionId !== args.sessionId) {
    throw new Error(`issue deliberation response session_id mismatch: ${sessionId}`);
  }
  const issueId = requireString(artifact.issue_id, "issue deliberation response.issue_id");
  if (issueId !== args.issueId) {
    throw new Error(`issue deliberation response issue_id mismatch: ${issueId}`);
  }
  const lensId = requireString(artifact.lens_id, "issue deliberation response.lens_id");
  if (lensId !== args.lensId) {
    throw new Error(`issue deliberation response lens_id mismatch: ${lensId}`);
  }
  const changed = requireBoolean(artifact.changed, "issue deliberation response.changed");
  const changeReason = requireStringOrNull(
    artifact.change_reason,
    "issue deliberation response.change_reason",
  );
  if (changed && changeReason === null) {
    throw new Error(
      "issue deliberation response.change_reason must be non-null when changed=true.",
    );
  }
  if (!changed && changeReason !== null) {
    throw new Error(
      "issue deliberation response.change_reason must be null when changed=false.",
    );
  }
  const validation = requireRecord(
    artifact.validation,
    "issue deliberation response.validation",
  );
  const sourceStanceRef = requireString(
    validation.source_stance_ref,
    "issue deliberation response.validation.source_stance_ref",
  );
  const expectedRef = stanceAnchorRef(args.issueId, args.lensId);
  if (sourceStanceRef !== expectedRef) {
    throw new Error(
      `issue deliberation response.validation.source_stance_ref must be ${expectedRef}, got ${sourceStanceRef}.`,
    );
  }
  const evidenceRefs = requireStringArray(
    artifact.evidence_refs,
    "issue deliberation response.evidence_refs",
  );
  if (args.allowedEvidenceRefs) {
    const allowed = new Set(args.allowedEvidenceRefs);
    for (const evidenceRef of evidenceRefs) {
      if (!allowed.has(evidenceRef)) {
        throw new Error(
          `issue deliberation response.evidence_refs contains unsupported ref: ${evidenceRef}`,
        );
      }
    }
  }
  return {
    schema_version: 1,
    session_id: sessionId,
    issue_id: issueId,
    lens_id: lensId,
    difference_explanation: requireString(
      artifact.difference_explanation,
      "issue deliberation response.difference_explanation",
    ),
    response_to_other_positions: requireString(
      artifact.response_to_other_positions,
      "issue deliberation response.response_to_other_positions",
    ),
    updated_stance: requireAllowed<IssueDeliberationUpdatedStance>(
      artifact.updated_stance,
      UPDATED_STANCE_VALUES,
      "issue deliberation response.updated_stance",
    ),
    changed,
    change_reason: changeReason,
    accepted_root_hypothesis: requireStringOrNull(
      artifact.accepted_root_hypothesis,
      "issue deliberation response.accepted_root_hypothesis",
    ),
    remaining_blocker: requireStringOrNull(
      artifact.remaining_blocker,
      "issue deliberation response.remaining_blocker",
    ),
    evidence_refs: evidenceRefs,
    validation: {
      source_stance_ref: sourceStanceRef,
    },
  };
}

export function buildTeamleadIssueResolutionPrompt(args: {
  sessionId: string;
  projectRoot: string;
  outputPath: string;
  deliberationPlan: Record<string, unknown>;
  issueLedger: Record<string, unknown>;
  responses: IssueDeliberationResponseArtifact[];
  boundaryContext?: string;
}): string {
  const outputRef = toRelativePath(args.outputPath, args.projectRoot);
  const context = {
    deliberation_plan: args.deliberationPlan,
    issue_ledger: args.issueLedger,
    issue_response_artifacts: args.responses,
  };
  return `# Controlled Deliberation Resolution Prompt

session_id: ${args.sessionId}
unit_id: controlled-deliberation
unit_kind: deliberation
output_path: ${outputRef}

## Canonical Role
You are the controlled deliberation resolver.
You resolve planned material conflicts using issue-ledger, deliberation-plan, and validated issue-scoped lens response artifacts.
You must emit the machine truth artifact for deliberation resolution.

## Hard Output Contract
- Submit the resolution by calling \`submit_deliberation_resolution\` exactly once when the executor provides runtime submit tools.
- Do not handwrite YAML, markdown fences, or commentary as the durable output.
- Runtime owns \`schema_version\`, \`session_id\`, \`validation\`, and YAML serialization.
- Include every issue from \`issue-ledger.issues\` exactly once.
- Planned issues must use one of: \`resolved\`, \`narrowed\`, \`unresolved-with-reason\`.
- Skipped issues should use \`no-deliberation-needed\` unless the provided artifacts show a remaining blocker.
- Do not invent issue IDs, lens IDs, or finding IDs.

## Status Values
- no-deliberation-needed
- resolved
- narrowed
- unresolved-with-reason

## Runtime Projection
\`\`\`yaml
${dumpYamlDocument(context)}
\`\`\`

## Runtime-Written YAML Shape
schema_version: 1
session_id: "${args.sessionId}"
issues:
  - issue_id: issue-001
    status: resolved
    final_root_cause: "accepted or narrowed root cause"
    final_claim: "final issue claim"
    surface_finding_ids: [finding-001]
    accepted_by_lens_ids: [logic, structure]
    remaining_disagreement_lens_ids: []
    reason: "why this status follows from the response artifacts"
    required_follow_up_evidence: []
validation:
  missing_issue_ids: []
${args.boundaryContext ? `\n${args.boundaryContext.trim()}\n` : ""}`;
}

function resolutionIssueFromRecord(
  value: unknown,
  label: string,
): DeliberationResolutionIssue {
  const record = requireRecord(value, label);
  return {
    issue_id: requireString(record.issue_id, `${label}.issue_id`),
    status: requireAllowed<DeliberationIssueStatus>(
      record.status,
      ISSUE_STATUS_VALUES,
      `${label}.status`,
    ),
    final_root_cause: requireString(record.final_root_cause, `${label}.final_root_cause`),
    final_claim: requireString(record.final_claim, `${label}.final_claim`),
    surface_finding_ids: requireStringArray(
      record.surface_finding_ids,
      `${label}.surface_finding_ids`,
    ),
    accepted_by_lens_ids: requireStringArray(
      record.accepted_by_lens_ids,
      `${label}.accepted_by_lens_ids`,
    ),
    remaining_disagreement_lens_ids: requireStringArray(
      record.remaining_disagreement_lens_ids,
      `${label}.remaining_disagreement_lens_ids`,
    ),
    reason: requireString(record.reason, `${label}.reason`),
    required_follow_up_evidence: requireStringArray(
      record.required_follow_up_evidence,
      `${label}.required_follow_up_evidence`,
    ),
  };
}

export function validateDeliberationResolutionObject(args: {
  parsed: unknown;
  sessionId: string;
  issueLedger: Record<string, unknown>;
  deliberationPlan: Record<string, unknown>;
}): DeliberationResolutionArtifact {
  const artifact = requireRecord(args.parsed, "deliberation resolution");
  if (artifact.schema_version !== 1) {
    throw new Error("deliberation resolution schema_version must be 1.");
  }
  const sessionId = requireString(artifact.session_id, "deliberation resolution.session_id");
  if (sessionId !== args.sessionId) {
    throw new Error(`deliberation resolution session_id mismatch: ${sessionId}`);
  }

  const issueIds = issueLedgerIssues(args.issueLedger).map((issue, index) =>
    requireString(issue.issue_id, `issue-ledger.issues[${index}].issue_id`),
  );
  ensureUnique(issueIds, "issue-ledger.issues.issue_id");
  const plannedIds = new Set(
    plannedIssueEntries(args.deliberationPlan).map((issue, index) =>
      requireString(
        issue.issue_id,
        `deliberation-plan.planned_issues[${index}].issue_id`,
      ),
    ),
  );
  const skippedIds = new Set(skippedIssueIds(args.deliberationPlan));
  const resolutionIssues = requireArray(
    artifact.issues,
    "deliberation resolution.issues",
  ).map((item, index) => resolutionIssueFromRecord(item, `deliberation resolution.issues[${index}]`));
  const resolutionIssueIds = resolutionIssues.map((issue) => issue.issue_id);
  ensureUnique(resolutionIssueIds, "deliberation resolution.issues.issue_id");
  ensureExactStringSet({
    actual: new Set(resolutionIssueIds),
    expected: new Set(issueIds),
    label: "deliberation resolution.issues.issue_id",
  });

  for (const issue of resolutionIssues) {
    if (plannedIds.has(issue.issue_id) && issue.status === "no-deliberation-needed") {
      throw new Error(
        `deliberation resolution planned issue must not be no-deliberation-needed: ${issue.issue_id}`,
      );
    }
    if (!plannedIds.has(issue.issue_id) && !skippedIds.has(issue.issue_id)) {
      throw new Error(
        `deliberation resolution issue is neither planned nor skipped: ${issue.issue_id}`,
      );
    }
  }

  const validation = requireRecord(
    artifact.validation,
    "deliberation resolution.validation",
  );
  const missingIssueIds = requireStringArray(
    validation.missing_issue_ids,
    "deliberation resolution.validation.missing_issue_ids",
  );
  if (missingIssueIds.length > 0) {
    throw new Error(
      `deliberation resolution.validation.missing_issue_ids must be empty after validation, got ${missingIssueIds.join(", ")}.`,
    );
  }

  return {
    schema_version: 1,
    session_id: sessionId,
    issues: resolutionIssues,
    validation: {
      missing_issue_ids: missingIssueIds,
    },
  };
}

export function buildNoPlannedDeliberationResolution(args: {
  sessionId: string;
  issueLedger: Record<string, unknown>;
}): DeliberationResolutionArtifact {
  return {
    schema_version: 1,
    session_id: args.sessionId,
    issues: issueLedgerIssues(args.issueLedger).map((issue, index) => ({
      issue_id: requireString(issue.issue_id, `issue-ledger.issues[${index}].issue_id`),
      status: "no-deliberation-needed",
      final_root_cause: requireString(
        issue.root_cause_hypothesis,
        `issue-ledger.issues[${index}].root_cause_hypothesis`,
      ),
      final_claim: requireString(
        issue.issue_statement,
        `issue-ledger.issues[${index}].issue_statement`,
      ),
      surface_finding_ids: requireStringArray(
        issue.surface_finding_ids,
        `issue-ledger.issues[${index}].surface_finding_ids`,
      ),
      accepted_by_lens_ids: requireStringArray(
        issue.raised_by_lens_ids,
        `issue-ledger.issues[${index}].raised_by_lens_ids`,
      ),
      remaining_disagreement_lens_ids: [],
      reason: "No material conflict was planned for controlled deliberation.",
      required_follow_up_evidence: [],
    })),
    validation: {
      missing_issue_ids: [],
    },
  };
}

function listOrNone(values: readonly string[]): string {
  return values.length > 0 ? values.join(", ") : "none";
}

export function renderDeliberationMarkdownProjection(args: {
  resolution: DeliberationResolutionArtifact;
}): string {
  const resolved = args.resolution.issues.filter((issue) => issue.status === "resolved");
  const narrowed = args.resolution.issues.filter((issue) => issue.status === "narrowed");
  const unresolved = args.resolution.issues.filter(
    (issue) => issue.status === "unresolved-with-reason",
  );
  const noDeliberation = args.resolution.issues.filter(
    (issue) => issue.status === "no-deliberation-needed",
  );
  const issueLines = (issues: DeliberationResolutionIssue[]): string =>
    issues.length === 0
      ? "- none"
      : issues
          .map(
            (issue) =>
              `- ${issue.issue_id}: ${issue.final_claim} (root: ${issue.final_root_cause}; lenses: ${listOrNone(issue.accepted_by_lens_ids)})`,
          )
          .join("\n");

  return `---
deliberation_status: performed
---

# Controlled Deliberation

## Consensus
${issueLines([...resolved, ...noDeliberation])}

## Conditional Consensus
${issueLines(narrowed)}

## Disagreement
${issueLines(unresolved)}

## Deliberation Decision
- resolution issues: ${args.resolution.issues.length}
- resolved: ${resolved.length}
- narrowed: ${narrowed.length}
- unresolved: ${unresolved.length}
- no-deliberation-needed: ${noDeliberation.length}

## Axiology-Proposed Additional Perspectives
- Preserved from issue-level resolution; no extra perspective is invented by runtime projection.

## Purpose Alignment Verification
- Controlled deliberation used issue-ledger, deliberation-plan, and issue-scoped lens response artifacts.

## Immediate Actions Required
${unresolved.length === 0 ? "- none" : issueLines(unresolved)}

## Recommendations
- Use deliberation-resolution.yaml as the machine truth and this markdown as a human-readable projection.

## Unique Finding Tagging
${args.resolution.issues
  .map(
    (issue) =>
      `- ${issue.issue_id}: ${listOrNone(issue.surface_finding_ids)}`,
  )
  .join("\n")}
`;
}
