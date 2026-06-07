import type { OntoTool } from "./onto-tools.js";
import type {
  ReviewFindingCausalStepRelation,
  ReviewFindingSeverity,
  ReviewLensDomainConstraint,
  ReviewLensFindingCausalPath,
  ReviewLensFindingCausalPathStep,
  ReviewLensFindingMaterialityBasis,
  ReviewLensSidecarArtifact,
  ReviewLensSidecarFindingCandidate,
} from "../review/artifact-types.js";
import { validateLensSidecarArtifactObject } from "../review/lens-sidecar-artifact.js";

const SEVERITY_VALUES: readonly ReviewFindingSeverity[] = [
  "blocker",
  "high",
  "medium",
  "low",
  "info",
];

const CAUSAL_STEP_RELATION_VALUES: readonly ReviewFindingCausalStepRelation[] = [
  "causes",
  "symptom_of",
  "enables",
];

export interface LensSidecarSubmissionState {
  sessionId: string;
  lensId: string;
  humanOutputRef?: string | null;
  artifact?: ReviewLensSidecarArtifact;
}

export function createLensSidecarSubmissionTools(
  state: LensSidecarSubmissionState,
): OntoTool[] {
  return [
    {
      name: "submit_lens_findings",
      description:
        "Submit all findings for one review lens in a single batch. The runtime assigns candidate ids and writes the YAML sidecar artifact.",
      input_schema: {
        type: "object",
        properties: {
          findings: {
            type: "array",
            description:
              "Every finding candidate produced by this lens. Use an empty list only when no contract-affecting finding exists.",
            items: {
              type: "object",
              description: "One semantic finding candidate.",
              additionalProperties: false,
              required: [
                "target",
                "evidence_anchor",
                "claim",
                "what",
                "why",
                "how_to_fix",
                "upstream_evidence_required",
                "severity_hint",
                "materiality_basis",
                "causal_path",
              ],
              properties: {
                target: {
                  type: "string",
                  description: "The artifact, file, section, or behavior being criticized.",
                },
                evidence_anchor: {
                  type: "string",
                  description: "The concrete evidence location supporting the claim.",
                },
                claim: {
                  type: "string",
                  description: "Compact surface-finding claim.",
                },
                what: {
                  type: "string",
                  description: "Plain description of the observed problem.",
                },
                why: {
                  type: "string",
                  description: "Why the evidence supports the claim and why it matters.",
                },
                how_to_fix: {
                  type: "string",
                  description: "Smallest useful correction or mitigation.",
                },
                upstream_evidence_required: {
                  type: "boolean",
                  description:
                    "True when the finding needs evidence outside the current allowed boundary.",
                },
                severity_hint: {
                  type: "string",
                  description:
                    "Non-authoritative lens severity hint. Use blocker/high/medium only when materiality_basis and causal_path are evidence-backed.",
                  enum: [...SEVERITY_VALUES],
                },
                materiality_basis: {
                  type: ["object", "null"],
                  description:
                    "Required object for blocker/high/medium candidates; null for clear low/info surface findings.",
                  additionalProperties: false,
                  required: [
                    "affected_purpose",
                    "failure_condition",
                    "impact",
                    "evidence_refs",
                  ],
                  properties: {
                    affected_purpose: {
                      type: "string",
                      description:
                        "The declared purpose or contract weakened by this finding.",
                    },
                    failure_condition: {
                      type: "string",
                      description:
                        "The bounded condition where the declared purpose fails or trust is weakened.",
                    },
                    impact: {
                      type: "string",
                      description:
                        "Why this changes review trust or actionability for the declared purpose.",
                    },
                    evidence_refs: {
                      type: "array",
                      description: "Concrete refs supporting materiality.",
                      items: {
                        type: "string",
                        description: "One evidence ref.",
                      },
                    },
                  },
                },
                causal_path: {
                  type: ["object", "null"],
                  description:
                    "Required object for blocker/high/medium candidates; null for clear low/info surface findings.",
                  additionalProperties: false,
                  required: [
                    "root_cause_candidate",
                    "steps",
                    "unresolved_beyond_evidence",
                  ],
                  properties: {
                    root_cause_candidate: {
                      type: "string",
                      description:
                        "Evidence-backed starting cause candidate, not a severity label.",
                    },
                    steps: {
                      type: "array",
                      description:
                        "Causal chain from observed surface finding toward the starting cause.",
                      items: {
                        type: "object",
                        description: "One causal step.",
                        additionalProperties: false,
                        required: [
                          "claim",
                          "relation_to_previous",
                          "evidence_refs",
                        ],
                        properties: {
                          claim: {
                            type: "string",
                            description: "Evidence-backed cause or symptom claim.",
                          },
                          relation_to_previous: {
                            type: ["string", "null"],
                            description:
                              "null for the first surface step; otherwise how this step relates to the prior step.",
                            enum: [...CAUSAL_STEP_RELATION_VALUES, null],
                          },
                          evidence_refs: {
                            type: "array",
                            description: "Concrete refs supporting this causal step.",
                            items: {
                              type: "string",
                              description: "One evidence ref.",
                            },
                          },
                        },
                      },
                    },
                    unresolved_beyond_evidence: {
                      type: ["string", "null"],
                      description:
                        "Boundary-limited uncertainty beyond the evidence, or null when closed enough.",
                    },
                  },
                },
              },
            },
          },
          domain_constraints_used: {
            type: "array",
            description:
              "Domain rule provenance actually used by this lens. Use [] when session_domain is none or no domain rule was used.",
            items: {
              type: "object",
              description: "One domain constraint provenance entry.",
              additionalProperties: false,
              required: ["source_doc", "source_version_or_snapshot_id", "anchor"],
              properties: {
                source_doc: {
                  type: "string",
                  description: "Domain document path.",
                },
                source_version_or_snapshot_id: {
                  type: "string",
                  description: "Version or snapshot id for the source document.",
                },
                anchor: {
                  type: "string",
                  description: "Stable section anchor within the source document.",
                },
              },
            },
          },
          domain_context_assumptions: {
            type: "array",
            description:
              "Informal domain/context assumptions used by this lens. Use [] when none were used.",
            items: {
              type: "string",
              description: "One assumption.",
            },
          },
          no_findings_rationale: {
            type: "string",
            description:
              "Always submit this field. Use an empty string when findings is non-empty; when findings is empty, explain why this lens produced no finding.",
          },
        },
        required: [
          "findings",
          "domain_constraints_used",
          "domain_context_assumptions",
          "no_findings_rationale",
        ],
        additionalProperties: false,
      },
      execute: async (args) => {
        if (state.artifact !== undefined) {
          throw new Error("submit_lens_findings may be called only once.");
        }
        const artifact = buildSidecarArtifactFromToolArgs(state, args);
        state.artifact = validateLensSidecarArtifactObject({
          parsed: artifact,
          sessionId: state.sessionId,
          lensId: state.lensId,
          ...(state.humanOutputRef !== undefined
            ? { expectedHumanOutputRef: state.humanOutputRef }
            : {}),
        });
        return JSON.stringify({
          accepted: true,
          lens_id: state.lensId,
          finding_count: state.artifact.findings.length,
        });
      },
    },
  ];
}

function buildSidecarArtifactFromToolArgs(
  state: LensSidecarSubmissionState,
  args: Record<string, unknown>,
): ReviewLensSidecarArtifact {
  rejectUnknownFields(args, "submit_lens_findings", [
    "findings",
    "domain_constraints_used",
    "domain_context_assumptions",
    "no_findings_rationale",
  ]);
  const findings = requireArray(args.findings, "findings").map((item, index) =>
    normalizeFinding(item, state.lensId, index),
  );
  const domainConstraints = requireArray(
    args.domain_constraints_used,
    "domain_constraints_used",
  ).map((item, index) => normalizeDomainConstraint(item, index));
  const domainContextAssumptions = requireStringArray(
    args.domain_context_assumptions,
    "domain_context_assumptions",
  );
  const noFindingsRationale = optionalNonEmptyString(
    args.no_findings_rationale,
    "no_findings_rationale",
  );
  if (findings.length === 0 && noFindingsRationale === undefined) {
    throw new Error(
      "no_findings_rationale must be a non-empty string when findings is empty.",
    );
  }

  return {
    schema_version: 1,
    session_id: state.sessionId,
    lens_id: state.lensId,
    ...(state.humanOutputRef !== undefined
      ? { human_output_ref: state.humanOutputRef }
      : {}),
    findings,
    domain_constraints_used: domainConstraints,
    domain_context_assumptions: domainContextAssumptions,
    validation:
      noFindingsRationale !== undefined
        ? {
            unaddressable_candidates: [],
            no_findings_rationale: noFindingsRationale,
          }
        : {
            unaddressable_candidates: [],
          },
  };
}

function normalizeFinding(
  value: unknown,
  lensId: string,
  index: number,
): ReviewLensSidecarFindingCandidate {
  const record = requireRecord(value, `findings[${index}]`);
  rejectUnknownFields(record, `findings[${index}]`, [
    "target",
    "evidence_anchor",
    "claim",
    "what",
    "why",
    "how_to_fix",
    "upstream_evidence_required",
    "severity_hint",
    "materiality_basis",
    "causal_path",
  ]);
  const severityHint = requireSeverity(
    record.severity_hint,
    `findings[${index}].severity_hint`,
  );
  const materialityBasis = requireNullableMaterialityBasis(
    record.materiality_basis,
    `findings[${index}].materiality_basis`,
  );
  const causalPath = requireNullableCausalPath(
    record.causal_path,
    lensId,
    index,
    `findings[${index}].causal_path`,
  );
  return {
    candidate_id: `${lensId}-candidate-${String(index + 1).padStart(3, "0")}`,
    target: requireString(record.target, `findings[${index}].target`),
    evidence_anchor: requireString(
      record.evidence_anchor,
      `findings[${index}].evidence_anchor`,
    ),
    claim: requireString(record.claim, `findings[${index}].claim`),
    what: requireString(record.what, `findings[${index}].what`),
    why: requireString(record.why, `findings[${index}].why`),
    how_to_fix: requireString(record.how_to_fix, `findings[${index}].how_to_fix`),
    upstream_evidence_required: requireBoolean(
      record.upstream_evidence_required,
      `findings[${index}].upstream_evidence_required`,
    ),
    severity_hint: severityHint,
    materiality_basis: materialityBasis,
    causal_path: causalPath,
  };
}

function requireNullableMaterialityBasis(
  value: unknown,
  label: string,
): ReviewLensFindingMaterialityBasis | null {
  if (value === null) return null;
  if (value === undefined) {
    throw new Error(`${label} is required; use null for low/info findings.`);
  }
  const record = requireRecord(value, label);
  rejectUnknownFields(record, label, [
    "affected_purpose",
    "failure_condition",
    "impact",
    "evidence_refs",
  ]);
  const evidenceRefs = requireStringArray(record.evidence_refs, `${label}.evidence_refs`);
  if (evidenceRefs.length === 0) {
    throw new Error(`${label}.evidence_refs must not be empty.`);
  }
  return {
    affected_purpose: requireString(record.affected_purpose, `${label}.affected_purpose`),
    failure_condition: requireString(record.failure_condition, `${label}.failure_condition`),
    impact: requireString(record.impact, `${label}.impact`),
    evidence_refs: evidenceRefs,
  };
}

function requireNullableCausalPath(
  value: unknown,
  lensId: string,
  candidateIndex: number,
  label: string,
): ReviewLensFindingCausalPath | null {
  if (value === null) return null;
  if (value === undefined) {
    throw new Error(`${label} is required; use null for low/info findings.`);
  }
  const record = requireRecord(value, label);
  rejectUnknownFields(record, label, [
    "root_cause_candidate",
    "steps",
    "unresolved_beyond_evidence",
  ]);
  const steps = requireArray(record.steps, `${label}.steps`).map((item, stepIndex) =>
    normalizeCausalPathStep(item, lensId, candidateIndex, stepIndex, `${label}.steps[${stepIndex}]`),
  );
  if (steps.length === 0) {
    throw new Error(`${label}.steps must not be empty.`);
  }
  const unresolvedBeyondEvidence = optionalStringOrNull(
    record.unresolved_beyond_evidence,
    `${label}.unresolved_beyond_evidence`,
  );
  return {
    root_cause_candidate: requireString(
      record.root_cause_candidate,
      `${label}.root_cause_candidate`,
    ),
    root_cause_step_id: steps[steps.length - 1]?.cause_id ?? null,
    steps,
    unresolved_beyond_evidence: unresolvedBeyondEvidence,
  };
}

function normalizeCausalPathStep(
  value: unknown,
  lensId: string,
  candidateIndex: number,
  stepIndex: number,
  label: string,
): ReviewLensFindingCausalPathStep {
  const record = requireRecord(value, label);
  rejectUnknownFields(record, label, [
    "claim",
    "relation_to_previous",
    "evidence_refs",
  ]);
  const evidenceRefs = requireStringArray(record.evidence_refs, `${label}.evidence_refs`);
  if (evidenceRefs.length === 0) {
    throw new Error(`${label}.evidence_refs must not be empty.`);
  }
  return {
    cause_id: `${lensId}-candidate-${String(candidateIndex + 1).padStart(3, "0")}.cause-${String(stepIndex + 1).padStart(3, "0")}`,
    claim: requireString(record.claim, `${label}.claim`),
    relation_to_previous: requireNullableCausalStepRelation(
      record.relation_to_previous,
      `${label}.relation_to_previous`,
    ),
    evidence_refs: evidenceRefs,
  };
}

function normalizeDomainConstraint(
  value: unknown,
  index: number,
): ReviewLensDomainConstraint {
  const record = requireRecord(value, `domain_constraints_used[${index}]`);
  rejectUnknownFields(record, `domain_constraints_used[${index}]`, [
    "source_doc",
    "source_version_or_snapshot_id",
    "anchor",
  ]);
  return {
    source_doc: requireString(
      record.source_doc,
      `domain_constraints_used[${index}].source_doc`,
    ),
    source_version_or_snapshot_id: requireString(
      record.source_version_or_snapshot_id,
      `domain_constraints_used[${index}].source_version_or_snapshot_id`,
    ),
    anchor: requireString(record.anchor, `domain_constraints_used[${index}].anchor`),
  };
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function rejectUnknownFields(
  record: Record<string, unknown>,
  label: string,
  allowedFields: readonly string[],
): void {
  const allowed = new Set(allowedFields);
  for (const field of Object.keys(record)) {
    if (!allowed.has(field)) {
      throw new Error(`${label} has unsupported field ${field}.`);
    }
  }
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value;
}

function requireStringArray(value: unknown, label: string): string[] {
  return requireArray(value, label).map((item, index) =>
    requireString(item, `${label}[${index}]`),
  );
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function optionalStringOrNull(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null;
  return requireString(value, label);
}

function optionalNonEmptyString(value: unknown, label: string): string | undefined {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }
  return value;
}

function requireSeverity(
  value: unknown,
  label: string,
): ReviewFindingSeverity {
  if (typeof value !== "string" || !SEVERITY_VALUES.includes(value as ReviewFindingSeverity)) {
    throw new Error(`${label} must be one of: ${SEVERITY_VALUES.join(", ")}.`);
  }
  return value as ReviewFindingSeverity;
}

function requireNullableCausalStepRelation(
  value: unknown,
  label: string,
): ReviewFindingCausalStepRelation | null {
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
