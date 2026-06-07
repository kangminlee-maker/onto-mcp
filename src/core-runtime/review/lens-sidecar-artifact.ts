import path from "node:path";
import fs from "node:fs/promises";
import type {
  ReviewFindingSeverity,
  ReviewFindingCausalStepRelation,
  ReviewLensFindingCausalPath,
  ReviewLensFindingCausalPathStep,
  ReviewLensDomainConstraint,
  ReviewLensFindingMaterialityBasis,
  ReviewLensSidecarArtifact,
  ReviewLensSidecarFindingCandidate,
} from "./artifact-types.js";
import {
  readYamlDocument,
  writeYamlDocument,
} from "./review-artifact-utils.js";

const SEVERITY_VALUES: readonly ReviewFindingSeverity[] = [
  "blocker",
  "high",
  "medium",
  "low",
  "info",
];

const MATERIAL_SEVERITY_VALUES = new Set<ReviewFindingSeverity>([
  "blocker",
  "high",
  "medium",
]);

const CAUSAL_STEP_RELATION_VALUES: readonly ReviewFindingCausalStepRelation[] = [
  "causes",
  "symptom_of",
  "enables",
];

export function lensSidecarArtifactPath(args: {
  round1Root: string;
  lensId: string;
}): string {
  return path.join(args.round1Root, `${args.lensId}.findings.yaml`);
}

export function isLensSidecarArtifactPath(artifactPath: string): boolean {
  return path.basename(artifactPath).endsWith(".findings.yaml");
}

export function lensIdFromRound1ArtifactPath(artifactPath: string): string {
  const baseName = path.basename(artifactPath);
  if (baseName.endsWith(".findings.yaml")) {
    return baseName.slice(0, -".findings.yaml".length);
  }
  if (baseName.endsWith(".md")) {
    return baseName.slice(0, -".md".length);
  }
  return path.basename(artifactPath, path.extname(artifactPath));
}

export async function readValidatedLensSidecarArtifact(args: {
  sidecarPath: string;
  sessionId: string;
  lensId: string;
  expectedHumanOutputRef?: string | null;
}): Promise<ReviewLensSidecarArtifact> {
  const parsed = await readYamlDocument<unknown>(args.sidecarPath);
  return validateLensSidecarArtifactObject({
    parsed,
    sessionId: args.sessionId,
    lensId: args.lensId,
    ...(args.expectedHumanOutputRef !== undefined
      ? { expectedHumanOutputRef: args.expectedHumanOutputRef }
      : {}),
  });
}

export async function writeValidatedLensSidecarArtifact(args: {
  sidecarPath: string;
  artifact: ReviewLensSidecarArtifact;
  sessionId: string;
  lensId: string;
  expectedHumanOutputRef?: string | null;
}): Promise<ReviewLensSidecarArtifact> {
  const validated = validateLensSidecarArtifactObject({
    parsed: args.artifact,
    sessionId: args.sessionId,
    lensId: args.lensId,
    ...(args.expectedHumanOutputRef !== undefined
      ? { expectedHumanOutputRef: args.expectedHumanOutputRef }
      : {}),
  });
  await writeYamlDocument(args.sidecarPath, validated);
  return validated;
}

export function renderLensMarkdownFromSidecar(
  artifact: ReviewLensSidecarArtifact,
): string {
  const findingsText =
    artifact.findings.length === 0
      ? [
          "No contract-affecting finding was submitted by this lens.",
          "",
          artifact.validation.no_findings_rationale ??
            "No findings rationale was not provided.",
        ].join("\n")
      : artifact.findings
          .map((finding, index) =>
            [
              `### Finding ${index + 1}: ${finding.candidate_id}`,
              "",
              `- Target: ${finding.target}`,
              `- Evidence Anchor: ${finding.evidence_anchor}`,
              `- Claim: ${finding.claim}`,
              `- What: ${finding.what}`,
              `- Why: ${finding.why}`,
              `- How To Fix: ${finding.how_to_fix}`,
              `- Upstream Evidence Required: ${String(
                finding.upstream_evidence_required,
              )}`,
              `- Severity Hint: ${finding.severity_hint ?? "null"}`,
              "",
              "#### Materiality Basis",
              renderNullableObject(finding.materiality_basis),
              "",
              "#### Causal Path",
              renderNullableObject(finding.causal_path),
            ].join("\n"),
          )
          .join("\n\n");
  return [
    `# ${artifact.lens_id} Lens Result`,
    "",
    "## Findings",
    findingsText,
    "",
    "## Domain Constraints Used",
    renderYamlList(artifact.domain_constraints_used),
    "",
    "## Domain Context Assumptions",
    renderYamlList(artifact.domain_context_assumptions),
    "",
    "## Runtime Sidecar Provenance",
    `- sidecar_schema_version: ${artifact.schema_version}`,
    `- session_id: ${artifact.session_id}`,
    `- lens_id: ${artifact.lens_id}`,
    `- human_output_ref: ${artifact.human_output_ref ?? "null"}`,
  ].join("\n");
}

export async function writeLensMarkdownProjectionFromSidecar(args: {
  sidecarPath: string;
  humanOutputPath: string;
  sessionId: string;
  lensId: string;
  expectedHumanOutputRef?: string | null;
}): Promise<void> {
  const artifact = await readValidatedLensSidecarArtifact({
    sidecarPath: args.sidecarPath,
    sessionId: args.sessionId,
    lensId: args.lensId,
    ...(args.expectedHumanOutputRef !== undefined
      ? { expectedHumanOutputRef: args.expectedHumanOutputRef }
      : {}),
  });
  await writeTextFile(args.humanOutputPath, renderLensMarkdownFromSidecar(artifact));
}

export function validateLensSidecarArtifactObject(args: {
  parsed: unknown;
  sessionId: string;
  lensId: string;
  expectedHumanOutputRef?: string | null;
}): ReviewLensSidecarArtifact {
  const parsed = requireRecord(args.parsed, "lens sidecar");
  requireExactNumber(parsed.schema_version, 1, "lens sidecar.schema_version");
  requireExactString(parsed.session_id, args.sessionId, "lens sidecar.session_id");
  requireExactString(parsed.lens_id, args.lensId, "lens sidecar.lens_id");

  const humanOutputRef = optionalStringOrNull(
    parsed.human_output_ref,
    "lens sidecar.human_output_ref",
  );
  if (
    args.expectedHumanOutputRef !== undefined &&
    humanOutputRef !== args.expectedHumanOutputRef
  ) {
    throw new Error(
      `lens sidecar.human_output_ref mismatch: expected ${String(
        args.expectedHumanOutputRef,
      )}, got ${String(humanOutputRef)}`,
    );
  }

  const findings = requireArray(parsed.findings, "lens sidecar.findings").map(
    (item, index) => parseFinding(item, index),
  );
  ensureUnique(
    findings.map((finding) => finding.candidate_id),
    "lens sidecar.findings.candidate_id",
  );

  const domainConstraints = requireArray(
    parsed.domain_constraints_used,
    "lens sidecar.domain_constraints_used",
  ).map((item, index) => parseDomainConstraint(item, index));

  const domainContextAssumptions = requireStringArray(
    parsed.domain_context_assumptions,
    "lens sidecar.domain_context_assumptions",
  );

  const validation = requireRecord(parsed.validation, "lens sidecar.validation");
  const unaddressableCandidates = requireStringArray(
    validation.unaddressable_candidates,
    "lens sidecar.validation.unaddressable_candidates",
  );
  const noFindingsRationale = optionalStringOrNull(
    validation.no_findings_rationale,
    "lens sidecar.validation.no_findings_rationale",
  );
  if (findings.length === 0 && !noFindingsRationale) {
    throw new Error(
      "lens sidecar.validation.no_findings_rationale is required when findings is empty",
    );
  }

  const normalizedValidation =
    noFindingsRationale !== undefined
      ? {
          unaddressable_candidates: unaddressableCandidates,
          no_findings_rationale: noFindingsRationale,
        }
      : {
          unaddressable_candidates: unaddressableCandidates,
        };

  return {
    schema_version: 1,
    session_id: args.sessionId,
    lens_id: args.lensId,
    ...(humanOutputRef !== undefined ? { human_output_ref: humanOutputRef } : {}),
    findings,
    domain_constraints_used: domainConstraints,
    domain_context_assumptions: domainContextAssumptions,
    validation: normalizedValidation,
  };
}

function parseFinding(
  item: unknown,
  index: number,
): ReviewLensSidecarFindingCandidate {
  const finding = requireRecord(item, `lens sidecar.findings[${index}]`);
  const severityHint = requireSeverityHint(
    finding.severity_hint,
    `lens sidecar.findings[${index}].severity_hint`,
  );
  const materialityBasis = optionalMaterialityBasis(
    finding.materiality_basis,
    `lens sidecar.findings[${index}].materiality_basis`,
  );
  const causalPath = optionalCausalPath(
    finding.causal_path,
    `lens sidecar.findings[${index}].causal_path`,
  );
  if (MATERIAL_SEVERITY_VALUES.has(severityHint)) {
    if (!materialityBasis) {
      throw new Error(
        `lens sidecar.findings[${index}].materiality_basis is required for severity_hint=${severityHint}.`,
      );
    }
    if (!causalPath) {
      throw new Error(
        `lens sidecar.findings[${index}].causal_path is required for severity_hint=${severityHint}.`,
      );
    }
  } else if (materialityBasis !== null || causalPath !== null) {
    throw new Error(
      `lens sidecar.findings[${index}].materiality_basis and causal_path must be null for severity_hint=${severityHint}.`,
    );
  }
  return {
    candidate_id: requireNonEmptyString(
      finding.candidate_id,
      `lens sidecar.findings[${index}].candidate_id`,
    ),
    target: requireNonEmptyString(
      finding.target,
      `lens sidecar.findings[${index}].target`,
    ),
    evidence_anchor: requireNonEmptyString(
      finding.evidence_anchor,
      `lens sidecar.findings[${index}].evidence_anchor`,
    ),
    claim: requireNonEmptyString(
      finding.claim,
      `lens sidecar.findings[${index}].claim`,
    ),
    what: requireNonEmptyString(
      finding.what,
      `lens sidecar.findings[${index}].what`,
    ),
    why: requireNonEmptyString(
      finding.why,
      `lens sidecar.findings[${index}].why`,
    ),
    how_to_fix: requireNonEmptyString(
      finding.how_to_fix,
      `lens sidecar.findings[${index}].how_to_fix`,
    ),
    upstream_evidence_required: requireBoolean(
      finding.upstream_evidence_required,
      `lens sidecar.findings[${index}].upstream_evidence_required`,
    ),
    severity_hint: severityHint,
    materiality_basis: materialityBasis,
    causal_path: causalPath,
  };
}

function optionalMaterialityBasis(
  value: unknown,
  label: string,
): ReviewLensFindingMaterialityBasis | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const record = requireRecord(value, label);
  const evidenceRefs = requireStringArray(record.evidence_refs, `${label}.evidence_refs`);
  if (evidenceRefs.length === 0) {
    throw new Error(`${label}.evidence_refs must not be empty.`);
  }
  return {
    affected_purpose: requireNonEmptyString(
      record.affected_purpose,
      `${label}.affected_purpose`,
    ),
    failure_condition: requireNonEmptyString(
      record.failure_condition,
      `${label}.failure_condition`,
    ),
    impact: requireNonEmptyString(record.impact, `${label}.impact`),
    evidence_refs: evidenceRefs,
  };
}

function optionalCausalPath(
  value: unknown,
  label: string,
): ReviewLensFindingCausalPath | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const record = requireRecord(value, label);
  const steps = requireArray(record.steps, `${label}.steps`).map((item, index) =>
    parseCausalPathStep(item, `${label}.steps[${index}]`),
  );
  if (steps.length === 0) {
    throw new Error(`${label}.steps must not be empty.`);
  }
  const rootCauseStepId = requireNonEmptyString(
    record.root_cause_step_id,
    `${label}.root_cause_step_id`,
  );
  if (!steps.some((step) => step.cause_id === rootCauseStepId)) {
    throw new Error(`${label}.root_cause_step_id must reference one of steps[].cause_id.`);
  }
  return {
    root_cause_candidate: requireNonEmptyString(
      record.root_cause_candidate,
      `${label}.root_cause_candidate`,
    ),
    root_cause_step_id: rootCauseStepId,
    steps,
    unresolved_beyond_evidence:
      optionalStringOrNull(
        record.unresolved_beyond_evidence,
        `${label}.unresolved_beyond_evidence`,
      ) ?? null,
  };
}

function parseCausalPathStep(
  value: unknown,
  label: string,
): ReviewLensFindingCausalPathStep {
  const record = requireRecord(value, label);
  const evidenceRefs = requireStringArray(record.evidence_refs, `${label}.evidence_refs`);
  if (evidenceRefs.length === 0) {
    throw new Error(`${label}.evidence_refs must not be empty.`);
  }
  const relationToPrevious = optionalCausalStepRelation(
    record.relation_to_previous,
    `${label}.relation_to_previous`,
  );
  return {
    cause_id: requireNonEmptyString(record.cause_id, `${label}.cause_id`),
    claim: requireNonEmptyString(record.claim, `${label}.claim`),
    relation_to_previous: relationToPrevious ?? null,
    evidence_refs: evidenceRefs,
  };
}

function parseDomainConstraint(
  item: unknown,
  index: number,
): ReviewLensDomainConstraint {
  const constraint = requireRecord(
    item,
    `lens sidecar.domain_constraints_used[${index}]`,
  );
  return {
    source_doc: requireNonEmptyString(
      constraint.source_doc,
      `lens sidecar.domain_constraints_used[${index}].source_doc`,
    ),
    source_version_or_snapshot_id: requireNonEmptyString(
      constraint.source_version_or_snapshot_id,
      `lens sidecar.domain_constraints_used[${index}].source_version_or_snapshot_id`,
    ),
    anchor: requireNonEmptyString(
      constraint.anchor,
      `lens sidecar.domain_constraints_used[${index}].anchor`,
    ),
  };
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a YAML mapping.`);
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be a YAML list.`);
  }
  return value;
}

function requireStringArray(value: unknown, label: string): string[] {
  return requireArray(value, label).map((item, index) =>
    requireNonEmptyString(item, `${label}[${index}]`),
  );
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }
  return value;
}

function requireExactNumber(
  value: unknown,
  expected: number,
  label: string,
) {
  if (value !== expected) {
    throw new Error(`${label} must be ${expected}.`);
  }
}

function requireExactString(value: unknown, expected: string, label: string): void {
  if (value !== expected) {
    throw new Error(`${label} must be ${expected}.`);
  }
}

function optionalStringOrNull(
  value: unknown,
  label: string,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return requireNonEmptyString(value, label);
}

function requireSeverityHint(
  value: unknown,
  label: string,
): ReviewFindingSeverity {
  if (typeof value !== "string" || !SEVERITY_VALUES.includes(value as ReviewFindingSeverity)) {
    throw new Error(`${label} must be one of: ${SEVERITY_VALUES.join(", ")}.`);
  }
  return value as ReviewFindingSeverity;
}

function optionalCausalStepRelation(
  value: unknown,
  label: string,
): ReviewFindingCausalStepRelation | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    !CAUSAL_STEP_RELATION_VALUES.includes(value as ReviewFindingCausalStepRelation)
  ) {
    throw new Error(
      `${label} must be one of: ${CAUSAL_STEP_RELATION_VALUES.join(", ")} or null.`,
    );
  }
  return value as ReviewFindingCausalStepRelation;
}

function ensureUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`${label} must be unique: ${value}`);
    }
    seen.add(value);
  }
}

function renderYamlList(value: unknown[]): string {
  if (value.length === 0) return "[]";
  return value
    .map((item) => {
      if (typeof item === "string") {
        return `- ${JSON.stringify(item)}`;
      }
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return `- ${JSON.stringify(item)}`;
      }
      const lines = ["-"];
      for (const [key, fieldValue] of Object.entries(item)) {
        lines.push(`  ${key}: ${JSON.stringify(fieldValue)}`);
      }
      return lines.join("\n");
    })
    .join("\n");
}

function renderNullableObject(value: unknown): string {
  if (value === undefined || value === null) return "null";
  return JSON.stringify(value, null, 2);
}

async function writeTextFile(filePath: string, text: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${text.trimEnd()}\n`, "utf8");
}
