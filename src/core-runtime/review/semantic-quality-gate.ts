export type SemanticQualityGateStatus = "passed" | "failed" | "not_applicable";
export type SemanticQualityGateFixtureId =
  | "review-pipeline-target-v1"
  | "retry-policy-target-v1";

export interface SemanticQualityGateCheck {
  check_id:
    | "material_issue_recall"
    | "final_result_material_issue_recall"
    | "false_materiality_guard"
    | "boundary_uncertainty_preservation"
    | "non_material_finding_preservation"
    | "artifact_material_issue_recall"
    | "causal_materiality_shape"
    | "causal_relation_correctness"
    | "issue_dependency_preservation"
    | "actionability"
    | "count_list_consistency"
    | "grounding";
  status: "passed" | "failed";
  evidence: string[];
}

export interface SemanticQualityGateResult {
  status: SemanticQualityGateStatus;
  fixture_id: SemanticQualityGateFixtureId;
  scope: "fixture_specific";
  fixture_target_anchor: string;
  applicability: "real_model_only";
  reason?: string;
  checks: SemanticQualityGateCheck[];
}

interface ReviewResultIssueLike {
  issue_id?: unknown;
  evidence_refs?: unknown;
  source_lens_ids?: unknown;
  action_candidates?: unknown;
  [key: string]: unknown;
}

interface ReviewRecordLike {
  result_classification_summary?: {
    material_issue_count?: unknown;
    non_material_finding_count?: unknown;
    material_issues?: unknown;
    non_material_findings?: unknown;
    action_candidates?: unknown;
  } | null;
}

interface ReviewPipelineIssueArtifactsLike {
  findingLedger?: unknown;
  relationGraph?: unknown;
  issueLedger?: unknown;
}

interface SemanticQualityFixture {
  fixtureId: SemanticQualityGateFixtureId;
  materialTerms: string[];
  expectedMaterialTruth: string;
  falseMaterialityTerms: string[];
  boundaryContextTerms: string[];
  actionMaterialTerms: string[];
  actionRemediationTerms: string[];
  targetAnchor: string;
  targetAnchorTerms: string[];
}

const DEFAULT_FIXTURE_ID: SemanticQualityGateFixtureId = "review-pipeline-target-v1";

const FIXTURES: Record<SemanticQualityGateFixtureId, SemanticQualityFixture> = {
  "review-pipeline-target-v1": {
    fixtureId: "review-pipeline-target-v1",
    materialTerms: ["unstableformat", "json.stringify", "undefined"],
    expectedMaterialTruth: "unstableFormat + JSON.stringify + undefined",
    falseMaterialityTerms: ["lensid", "lens id", "lens ids", "lens identity"],
    boundaryContextTerms: [
      "evidence gap",
      "needs evidence",
      "insufficient evidence",
      "low-confidence",
      "unresolved",
      "without caller",
      "without public api",
      "caller evidence",
      "public api evidence",
    ],
    actionMaterialTerms: ["unstableformat", "json.stringify", "undefined"],
    actionRemediationTerms: [
      "return type",
      "fallback",
      "widen",
      "guard",
      "focused test",
      "verify",
    ],
    targetAnchor: "src/target.ts",
    targetAnchorTerms: ["src/target.ts", "target.ts"],
  },
  "retry-policy-target-v1": {
    fixtureId: "retry-policy-target-v1",
    materialTerms: ["retryrequest", "maxretries", "zero", "falsy"],
    expectedMaterialTruth:
      "retryRequest + maxRetries zero + falsy defaulting behavior",
    falseMaterialityTerms: ["telemetry label", "debug export"],
    boundaryContextTerms: [
      "evidence gap",
      "needs evidence",
      "insufficient evidence",
      "without caller",
      "without public api",
      "caller evidence",
      "public api evidence",
    ],
    actionMaterialTerms: ["retryrequest", "maxretries", "zero"],
    actionRemediationTerms: [
      "??",
      "nullish",
      "fallback",
      "guard",
      "focused test",
      "verify",
    ],
    targetAnchor: "src/retry.ts",
    targetAnchorTerms: ["src/retry.ts", "retry.ts"],
  },
};

function semanticFixture(
  fixtureId: SemanticQualityGateFixtureId | undefined,
): SemanticQualityFixture {
  const resolved = fixtureId ?? DEFAULT_FIXTURE_ID;
  if (!Object.prototype.hasOwnProperty.call(FIXTURES, resolved)) {
    throw new Error(`Unknown semantic quality fixture: ${resolved}`);
  }
  return FIXTURES[resolved];
}

function records(value: unknown): ReviewResultIssueLike[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is ReviewResultIssueLike =>
          typeof item === "object" && item !== null,
      )
    : [];
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => record(item) !== null)
    : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function normalizedText(value: unknown): string {
  return JSON.stringify(value ?? "").toLowerCase();
}

function textContainsAll(text: string, terms: string[]): boolean {
  return terms.every((term) => text.includes(term));
}

function textContainsAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function containsBoundarySensitiveFalseMateriality(
  text: string,
  fixture: SemanticQualityFixture,
): boolean {
  return textContainsAny(text, fixture.falseMaterialityTerms) &&
    textContainsAny(text, fixture.boundaryContextTerms);
}

function nonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function nonEmptyStringArray(value: unknown): boolean {
  return Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => nonEmptyString(item));
}

function validMaterialityBasis(value: unknown): boolean {
  const basis = record(value);
  return basis !== null &&
    nonEmptyString(basis.affected_purpose) &&
    nonEmptyString(basis.failure_condition) &&
    nonEmptyString(basis.impact) &&
    nonEmptyStringArray(basis.evidence_refs);
}

function validCausalPath(value: unknown): boolean {
  const causalPath = record(value);
  if (!causalPath) return false;
  if (
    !nonEmptyString(causalPath.root_cause_candidate) ||
    !nonEmptyString(causalPath.root_cause_step_id)
  ) {
    return false;
  }
  const steps = recordArray(causalPath.steps);
  return steps.length > 0 &&
    steps.some((step) => step.cause_id === causalPath.root_cause_step_id) &&
    steps.every((step) =>
      nonEmptyString(step.cause_id) &&
      nonEmptyString(step.claim) &&
      nonEmptyStringArray(step.evidence_refs),
    );
}

function issueArtifactChecks(
  artifacts: ReviewPipelineIssueArtifactsLike | undefined,
  declaredNonMaterialFindingCount: number,
  nonMaterialProjections: Record<string, unknown>[],
  fixture: SemanticQualityFixture,
): SemanticQualityGateCheck[] {
  if (!artifacts) return [];
  const findingLedger = record(artifacts.findingLedger);
  const relationGraph = record(artifacts.relationGraph);
  const issueLedger = record(artifacts.issueLedger);
  if (!findingLedger || !relationGraph || !issueLedger) {
    return [
      check("causal_materiality_shape", false, [
        "finding-ledger, finding-relation-graph, and issue-ledger artifacts are required for causal quality checks",
      ]),
      check("non_material_finding_preservation", false, [
        "issue artifacts missing; cannot prove non-material finding preservation",
      ]),
      check("causal_relation_correctness", false, [
        "issue artifacts missing; cannot prove causal relation correctness",
      ]),
      check("issue_dependency_preservation", false, [
        "issue artifacts missing; cannot prove shared-cause dependency preservation",
      ]),
    ];
  }

  const findings = recordArray(findingLedger.findings);
  const relationRows = recordArray(relationGraph.relations);
  const singletonRows = recordArray(relationGraph.singleton_findings);
  const issueRows = recordArray(issueLedger.issues);
  const dependencyRows = recordArray(issueLedger.issue_dependencies);
  const nonMaterialFindings = findings.filter((finding) =>
    ["low", "info"].includes(String(finding.severity)),
  );
  const rawNonMaterialFindingText = normalizedText(nonMaterialFindings);
  const nonMaterialProjectionText = normalizedText(nonMaterialProjections);
  const nonMaterialFindingText = `${rawNonMaterialFindingText}\n${nonMaterialProjectionText}`;
  const materialFindingIds = findings
    .filter((finding) =>
      ["blocker", "high", "medium"].includes(String(finding.severity)),
    )
    .map((finding) => String(finding.finding_id ?? ""));
  const materialFindingText = normalizedText(
    findings.filter((finding) =>
      ["blocker", "high", "medium"].includes(String(finding.severity)),
    ),
  );
  const nonMaterialFindingIds = findings
    .filter((finding) => ["low", "info"].includes(String(finding.severity)))
    .map((finding) => String(finding.finding_id ?? ""));
  const nonMaterialProjectionIds = nonMaterialProjections
    .map((projection) => String(projection.issue_id ?? ""))
    .filter((issueId) => issueId.length > 0);
  const nonMaterialPreservationIds = [
    ...nonMaterialFindingIds,
    ...nonMaterialProjectionIds,
  ];
  const causeOwnerById = new Map<string, string>();
  for (const finding of findings) {
    if (!["blocker", "high", "medium"].includes(String(finding.severity))) {
      continue;
    }
    if (typeof finding.finding_id !== "string") continue;
    const causalPath = record(finding.causal_path);
    for (const step of recordArray(causalPath?.steps)) {
      if (typeof step.cause_id === "string") {
        causeOwnerById.set(step.cause_id, finding.finding_id);
      }
    }
  }
  const relationCoveredIds = new Set<string>();
  for (const relation of relationRows) {
    if (typeof relation.from_finding_id === "string") {
      relationCoveredIds.add(relation.from_finding_id);
    }
    if (typeof relation.to_finding_id === "string") {
      relationCoveredIds.add(relation.to_finding_id);
    }
  }
  for (const singleton of singletonRows) {
    if (typeof singleton.finding_id === "string") {
      relationCoveredIds.add(singleton.finding_id);
    }
  }
  const sharedCauseRelationIds = relationRows
    .filter((relation) => relation.relation === "shared_cause_candidate")
    .map((relation) => String(relation.relation_id ?? ""));
  const issueRelationRefs = new Set(
    issueRows.flatMap((issue) => strings(issue.relation_refs)),
  );
  const dependencyRelationRefs = new Set(
    dependencyRows.flatMap((dependency) => strings(dependency.relation_refs)),
  );
  const findingIssueIds = new Map<string, string>();
  for (const issue of issueRows) {
    if (typeof issue.issue_id !== "string") continue;
    for (const findingId of strings(issue.surface_finding_ids)) {
      findingIssueIds.set(findingId, issue.issue_id);
    }
  }

  const causalMaterialityShape = check(
    "causal_materiality_shape",
    findings.every((finding) => {
      const severity = String(finding.severity);
      if (["blocker", "high", "medium"].includes(severity)) {
        return validMaterialityBasis(finding.materiality_basis) &&
          validCausalPath(finding.causal_path);
      }
      if (["low", "info"].includes(severity)) {
        return finding.materiality_basis === null && finding.causal_path === null;
      }
      return false;
    }),
    [
      `finding_count=${findings.length}`,
      `material_finding_ids=${materialFindingIds.join(",") || "none"}`,
      `non_material_finding_ids=${nonMaterialFindingIds.join(",") || "none"}`,
    ],
  );

  const artifactMaterialRecall = check(
    "artifact_material_issue_recall",
    materialFindingIds.length > 0 &&
      textContainsAll(materialFindingText, fixture.materialTerms),
    [
      `ledger_material_finding_ids=${materialFindingIds.join(",") || "none"}`,
      `expected artifact truth: ${fixture.expectedMaterialTruth}`,
    ],
  );

  const nonMaterialPreservation = check(
    "non_material_finding_preservation",
    !(
      findings.some((finding) =>
        ["low", "info"].includes(String(finding.severity)) &&
        containsBoundarySensitiveFalseMateriality(normalizedText(finding), fixture)
      ) ||
      containsBoundarySensitiveFalseMateriality(nonMaterialFindingText, fixture)
    ) ||
      (
        nonMaterialPreservationIds.length > 0 &&
        nonMaterialPreservationIds.length >= declaredNonMaterialFindingCount &&
        textContainsAny(nonMaterialFindingText, fixture.falseMaterialityTerms) &&
        textContainsAny(nonMaterialFindingText, fixture.boundaryContextTerms) &&
        nonMaterialFindingIds.every((findingId) => !relationCoveredIds.has(findingId))
      ),
    [
      `declared_non_material_finding_count=${declaredNonMaterialFindingCount}`,
      `preserved_non_material_ids=${nonMaterialPreservationIds.join(",") || "none"}`,
      "non-material findings must preserve target-specific boundary uncertainty and remain outside relation coverage",
    ],
  );

  const causalRelationCorrectness = check(
    "causal_relation_correctness",
    materialFindingIds.every((findingId) => relationCoveredIds.has(findingId)) &&
      relationRows.every((relation) => {
        if (relation.relation !== "shared_cause_candidate") return true;
        const sharedCause = record(relation.shared_cause);
        const fromFindingId = typeof relation.from_finding_id === "string"
          ? relation.from_finding_id
          : "";
        const toFindingId = typeof relation.to_finding_id === "string"
          ? relation.to_finding_id
          : "";
        return (
          sharedCause !== null &&
          nonEmptyString(sharedCause.cause_claim) &&
          nonEmptyString(sharedCause.from_cause_ref) &&
          nonEmptyString(sharedCause.to_cause_ref) &&
          causeOwnerById.get(sharedCause.from_cause_ref as string) ===
            fromFindingId &&
          causeOwnerById.get(sharedCause.to_cause_ref as string) === toFindingId
        );
      }),
    [
      `material_finding_ids=${materialFindingIds.join(",") || "none"}`,
      `relation_covered_ids=${[...relationCoveredIds].join(",") || "none"}`,
      `shared_cause_relation_ids=${sharedCauseRelationIds.join(",") || "none"}`,
    ],
  );

  const dependencyPreservation = check(
    "issue_dependency_preservation",
    relationRows.every((relation) => {
      if (relation.relation !== "shared_cause_candidate") return true;
      const relationId = String(relation.relation_id ?? "");
      if (!relationId || issueRelationRefs.has(relationId)) return false;
      const fromIssueId =
        typeof relation.from_finding_id === "string"
          ? findingIssueIds.get(relation.from_finding_id)
          : undefined;
      const toIssueId =
        typeof relation.to_finding_id === "string"
          ? findingIssueIds.get(relation.to_finding_id)
          : undefined;
      if (!fromIssueId || !toIssueId || fromIssueId === toIssueId) return false;
      return dependencyRows.some((dependency) => {
        if (dependency.dependency_kind !== "shared_cause_candidate") return false;
        if (!strings(dependency.relation_refs).includes(relationId)) return false;
        const issueIds = strings(dependency.issue_ids);
        return (
          issueIds.length === 2 &&
          new Set(issueIds).size === 2 &&
          issueIds.includes(fromIssueId) &&
          issueIds.includes(toIssueId)
        );
      });
    }),
    [
      `shared_cause_relation_ids=${sharedCauseRelationIds.join(",") || "none"}`,
      `issue_relation_refs=${[...issueRelationRefs].join(",") || "none"}`,
      `dependency_relation_refs=${[...dependencyRelationRefs].join(",") || "none"}`,
    ],
  );

  return [
    causalMaterialityShape,
    artifactMaterialRecall,
    nonMaterialPreservation,
    causalRelationCorrectness,
    dependencyPreservation,
  ];
}

function markdownSectionBody(text: string, heading: string): string | null {
  const lines = text.split(/\r?\n/);
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headingPattern = new RegExp(`^(#{2,4})\\s+${escaped}\\s*$`, "i");
  let startIndex: number | null = null;
  let headingLevel = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const match = headingPattern.exec(lines[index] ?? "");
    if (!match) continue;
    startIndex = index + 1;
    headingLevel = match[1]?.length ?? 0;
    break;
  }
  if (startIndex === null) return null;

  const body: string[] = [];
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const nextHeading = /^(#{2,4})\s+\S/.exec(line);
    if (nextHeading && (nextHeading[1]?.length ?? 0) <= headingLevel) break;
    body.push(line);
  }
  return body.join("\n").trim();
}

function check(
  check_id: SemanticQualityGateCheck["check_id"],
  passed: boolean,
  evidence: string[],
): SemanticQualityGateCheck {
  return {
    check_id,
    status: passed ? "passed" : "failed",
    evidence,
  };
}

export function evaluateReviewPipelineSemanticQualityGate(args: {
  executionRoute?: string;
  /** Legacy debug caller compatibility. Prefer executionRoute. */
  executorRealization?: string;
  fixtureId?: SemanticQualityGateFixtureId;
  reviewRecord: ReviewRecordLike;
  finalOutputText: string;
  issueArtifacts?: ReviewPipelineIssueArtifactsLike;
}): SemanticQualityGateResult {
  const fixture = semanticFixture(args.fixtureId);
  const summary = args.reviewRecord.result_classification_summary ?? null;
  const materialIssues = records(summary?.material_issues);
  const nonMaterialFindings = records(summary?.non_material_findings);
  const actionCandidates = records(summary?.action_candidates);
  const materialText = normalizedText(materialIssues);
  const nonMaterialText = normalizedText(nonMaterialFindings);
  const finalReviewResult = markdownSectionBody(args.finalOutputText, "Final Review Result");
  const finalReviewResultText = normalizedText(finalReviewResult ?? "");
  const boundaryNotes = markdownSectionBody(args.finalOutputText, "Boundary Notes");
  const boundaryNotesText = (boundaryNotes ?? "").toLowerCase();
  const preservedBoundaryText = `${nonMaterialText}\n${boundaryNotesText}`;
  const materialBoundarySensitiveFalsePositive = materialIssues.some((issue) =>
    containsBoundarySensitiveFalseMateriality(normalizedText(issue), fixture)
  );
  const falseMaterialityCandidateObserved =
    materialBoundarySensitiveFalsePositive ||
    containsBoundarySensitiveFalseMateriality(preservedBoundaryText, fixture);
  const declaredMaterialIssueCount =
    typeof summary?.material_issue_count === "number"
      ? summary.material_issue_count
      : materialIssues.length;
  const declaredNonMaterialFindingCount =
    typeof summary?.non_material_finding_count === "number"
      ? summary.non_material_finding_count
      : nonMaterialFindings.length;

  const countListConsistency = check(
    "count_list_consistency",
    declaredMaterialIssueCount === materialIssues.length &&
      declaredNonMaterialFindingCount === nonMaterialFindings.length,
    [
      `material_issue_count=${declaredMaterialIssueCount}, material_issues.length=${materialIssues.length}`,
      `non_material_finding_count=${declaredNonMaterialFindingCount}, non_material_findings.length=${nonMaterialFindings.length}`,
    ],
  );

  const materialIssueRecall = check(
    "material_issue_recall",
    materialIssues.length >= 1 &&
      textContainsAll(materialText, fixture.materialTerms),
    [
      `material_issue_count=${String(summary?.material_issue_count ?? materialIssues.length)}`,
      `expected target truth: ${fixture.expectedMaterialTruth}`,
    ],
  );

  const finalResultMaterialIssueRecall = check(
    "final_result_material_issue_recall",
    finalReviewResult !== null &&
      textContainsAll(finalReviewResultText, fixture.materialTerms),
    [
      finalReviewResult === null
        ? "Final Review Result section missing"
        : `Final Review Result chars=${finalReviewResult.length}`,
      `expected final explanation to preserve ${fixture.expectedMaterialTruth}`,
    ],
  );

  const falseMaterialityGuard = check(
    "false_materiality_guard",
    !materialBoundarySensitiveFalsePositive &&
      (
        !falseMaterialityCandidateObserved ||
        (
          textContainsAny(preservedBoundaryText, fixture.falseMaterialityTerms) &&
          textContainsAny(preservedBoundaryText, fixture.boundaryContextTerms)
        )
      ),
    [
      `false materiality terms must remain non-material: ${fixture.falseMaterialityTerms.join(", ")}`,
      `non_material_finding_count=${nonMaterialFindings.length}`,
      `boundary_notes_chars=${boundaryNotes?.length ?? 0}`,
    ],
  );

  const boundaryUncertainty = check(
    "boundary_uncertainty_preservation",
    !falseMaterialityCandidateObserved ||
      (
        boundaryNotes !== null &&
        textContainsAny(boundaryNotesText, fixture.falseMaterialityTerms) &&
        textContainsAny(boundaryNotesText, fixture.boundaryContextTerms)
      ),
    [
      boundaryNotes === null
        ? "Boundary Notes section missing"
        : `Boundary Notes chars=${boundaryNotes.length}`,
      `expected: compact note preserving ${fixture.falseMaterialityTerms.join(", ")} uncertainty`,
    ],
  );

  const materialActionRefs = new Set(
    materialIssues.flatMap((issue) => strings(issue.action_candidates)),
  );
  for (const item of actionCandidates) {
    if (typeof item.issue_id !== "string") continue;
    if (!materialIssues.some((issue) => issue.issue_id === item.issue_id)) continue;
    for (const candidate of strings(item.candidates)) materialActionRefs.add(candidate);
  }
  const actionSectionText = normalizedText(
    `${markdownSectionBody(args.finalOutputText, "Immediate Actions Required") ?? ""}\n${
      markdownSectionBody(args.finalOutputText, "Recommendations") ?? ""
    }`,
  );
  const actionability = check(
    "actionability",
    materialActionRefs.size > 0 &&
      textContainsAny(actionSectionText, fixture.actionMaterialTerms) &&
      textContainsAny(actionSectionText, fixture.actionRemediationTerms),
    [
      `material_action_candidates=${[...materialActionRefs].join(",") || "none"}`,
      "expected final output to include a concrete remediation path",
    ],
  );

  const grounding = check(
    "grounding",
    materialIssues.some((issue) => {
      const evidenceRefs = strings(issue.evidence_refs);
      const sourceLensIds = strings(issue.source_lens_ids);
      const text = normalizedText(issue);
      return (
        evidenceRefs.length > 0 &&
        sourceLensIds.length > 0 &&
        fixture.targetAnchorTerms.some((term) => text.includes(term))
      );
    }),
    [
      "material issue must preserve lens/artifact refs",
      "material issue must preserve target anchor src/target.ts",
    ],
  );

  const checks = [
    countListConsistency,
    materialIssueRecall,
    finalResultMaterialIssueRecall,
    falseMaterialityGuard,
    boundaryUncertainty,
    ...issueArtifactChecks(
      args.issueArtifacts,
      declaredNonMaterialFindingCount,
      nonMaterialFindings,
      fixture,
    ),
    actionability,
    grounding,
  ];
  return {
    status: checks.every((item) => item.status === "passed") ? "passed" : "failed",
    fixture_id: fixture.fixtureId,
    scope: "fixture_specific",
    fixture_target_anchor: fixture.targetAnchor,
    applicability: "real_model_only",
    checks,
  };
}
