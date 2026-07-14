export type SemanticQualityGateStatus = "passed" | "failed" | "not_applicable";
export type SemanticQualityGateFixtureId =
  | "review-pipeline-target-v1"
  | "retry-policy-target-v1"
  | "clean-target-v1";

/** The complete check-id universe this gate can emit — the value-level single
 * source (the check_id type derives from it). The review-cert/v2 evidence
 * contract pins its per-run check universe against THIS list, so a harness
 * that omits issue artifacts (the gate then emits a subset — see
 * runSemanticQualityGate) cannot silently shrink the certified comparison. */
export const SEMANTIC_QUALITY_GATE_CHECK_IDS = [
  "material_issue_recall",
  "final_result_material_issue_recall",
  "false_materiality_guard",
  "boundary_uncertainty_preservation",
  "non_material_finding_preservation",
  "artifact_material_issue_recall",
  "causal_materiality_shape",
  "causal_relation_correctness",
  "issue_dependency_preservation",
  "actionability",
  "count_list_consistency",
  "grounding",
] as const;

export interface SemanticQualityGateCheck {
  check_id: (typeof SEMANTIC_QUALITY_GATE_CHECK_IDS)[number];
  status: "passed" | "failed";
  evidence: string[];
}

export interface SemanticQualityGateResult {
  status: SemanticQualityGateStatus;
  fixture_id: string;
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

/**
 * Target-specific expectation data the gate evaluates against. The checks
 * themselves are target-agnostic; everything target-specific (which material
 * truths must be recalled, which boundary decoys must stay non-material,
 * which anchor grounds the issues) is carried here as data. Built-in code
 * fixtures are presets of this shape; non-code targets (e.g. ontology
 * fixtures) inject their own expectations derived from ground-truth manifests.
 * Empty boundary term lists mean "no boundary decoy declared": the
 * boundary-sensitive checks then pass vacuously instead of failing.
 */
export interface SemanticQualityExpectations {
  fixtureId: string;
  /**
   * Required material vocabulary. Each entry must match (ALL semantics);
   * an entry given as a string array is an alternates group — any one
   * alternate satisfies the entry (e.g. translations of the same
   * ground-truth anchor concept, robust to output-language variance).
   */
  materialTerms: Array<string | string[]>;
  expectedMaterialTruth: string;
  boundaryUncertaintyTerms: string[];
  boundaryContextTerms: string[];
  actionMaterialTerms: string[];
  actionRemediationTerms: string[];
  targetAnchor: string;
  targetAnchorTerms: string[];
  /**
   * Clean-target control (v3 G1). The target has ZERO material defects, so the
   * recall floor cannot catch silence — a boundary decoy carries the load
   * instead. When set, the gate (a) accepts an empty materialTerms list (there
   * is nothing to recall), (b) OMITS the recall/grounding/actionability checks
   * from its emission — they are N/A here, matching the fixture's declared
   * applicable_check_ids — and (c) turns false_materiality_guard into "ANY
   * admitted material issue is a false positive" (not just a boundary-decoy
   * promotion). Yes-man behavior then fails the guard.
   */
  expectsNoMaterialDefects?: boolean;
  /**
   * Clean-target control (v3 G1). The declared boundary decoy MUST be preserved
   * as a non-material, boundary-contextualized finding. Turns
   * boundary_uncertainty_preservation from "!observed || preserved" (which lets
   * an empty, lazy review pass vacuously) into MUST-preserve, so empty silence
   * fails. Meaningless without a declared boundary decoy.
   */
  requiresBoundaryPreservation?: boolean;
  /**
   * Shared-root control (v3 G2). Each pair declares two anchor term-groups whose
   * findings MUST be connected by a valid shared_cause_candidate relation. Turns
   * causal_relation_correctness's shared-cause branch from a vacuous `.every`
   * pass (true when no such relation exists) into a positive existence
   * requirement. Empty/absent = no positive requirement (existing behavior). A
   * finding matches a group when its text contains every term in the group.
   */
  expectedSharedCauseAnchorPairs?: Array<[string[], string[]]>;
}

/**
 * Checks the gate OMITS for a clean-target fixture (expectsNoMaterialDefects):
 * recall has nothing to recall, and grounding/actionability structurally fail
 * on an empty material set (they require a material issue to ground / act on).
 * These are declared N/A via the fixture's applicable_check_ids; the gate emits
 * exactly the complementary applicable set. Kept as a module constant so the
 * record-layer emission check (A-1b) can pin the same set.
 */
export const CLEAN_TARGET_EXCLUDED_CHECK_IDS: ReadonlySet<
  SemanticQualityGateCheck["check_id"]
> = new Set([
  "material_issue_recall",
  "final_result_material_issue_recall",
  "artifact_material_issue_recall",
  "grounding",
  "actionability",
]);

const DEFAULT_FIXTURE_ID: SemanticQualityGateFixtureId = "review-pipeline-target-v1";

const FIXTURES: Record<SemanticQualityGateFixtureId, SemanticQualityExpectations> = {
  "review-pipeline-target-v1": {
    fixtureId: "review-pipeline-target-v1",
    materialTerms: ["unstableformat", "json.stringify", "undefined"],
    expectedMaterialTruth: "unstableFormat + JSON.stringify + undefined",
    boundaryUncertaintyTerms: ["lensid", "lens id", "lens ids", "lens identity"],
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
    boundaryUncertaintyTerms: ["telemetry label", "debug export"],
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
  // v3 G1 clean-target (design §D1/§D3): ZERO material defects + one boundary
  // decoy (an accepted-but-unread field whose defect status cannot be decided
  // without caller/public-API evidence). materialTerms is empty (nothing to
  // recall — accepted only because expectsNoMaterialDefects); recall/grounding/
  // actionability are excluded from emission (CLEAN_TARGET_EXCLUDED). The control
  // is the boundary decoy: yes-man → false_materiality_guard fails; empty silence
  // → boundary_uncertainty_preservation MUST-preserve fails; correct silence
  // (decoy preserved as non-material boundary context) passes.
  "clean-target-v1": {
    fixtureId: "clean-target-v1",
    materialTerms: [],
    expectedMaterialTruth: "no material defect (clean target)",
    boundaryUncertaintyTerms: ["telemetry label", "debug export"],
    boundaryContextTerms: [
      "evidence gap",
      "needs evidence",
      "insufficient evidence",
      "without caller",
      "without public api",
    ],
    actionMaterialTerms: [],
    actionRemediationTerms: [],
    targetAnchor: "src/clean-target.ts",
    targetAnchorTerms: ["src/clean-target.ts", "clean-target.ts"],
    expectsNoMaterialDefects: true,
    requiresBoundaryPreservation: true,
  },
};

function semanticFixture(
  fixtureId: SemanticQualityGateFixtureId | undefined,
): SemanticQualityExpectations {
  const resolved = fixtureId ?? DEFAULT_FIXTURE_ID;
  if (!Object.prototype.hasOwnProperty.call(FIXTURES, resolved)) {
    throw new Error(`Unknown semantic quality fixture: ${resolved}`);
  }
  return FIXTURES[resolved];
}

/** SSOT accessor for a built-in fixture's pinned expectation preset (design §D3 —
 * Phase A fixtures are code-presets). Returns a deep copy so callers cannot mutate
 * the shared preset; tests and the cert manifest read the SAME source, so an
 * injected copy can never drift from what the gate actually evaluates. */
export function semanticQualityFixturePreset(
  fixtureId: SemanticQualityGateFixtureId,
): SemanticQualityExpectations {
  return structuredClone(semanticFixture(fixtureId));
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
  const raw = JSON.stringify(value ?? "");
  const searchFriendly = raw
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/[-_/]+/gu, " ");
  return `${raw}\n${searchFriendly}`.toLowerCase();
}

function textContainsAll(
  text: string,
  terms: Array<string | string[]>,
): boolean {
  return terms.every((term) =>
    Array.isArray(term)
      ? term.some((alternate) => text.includes(alternate))
      : text.includes(term),
  );
}

function textContainsAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function containsBoundarySensitiveUncertainty(
  text: string,
  fixture: SemanticQualityExpectations,
): boolean {
  return textContainsAny(text, fixture.boundaryUncertaintyTerms) &&
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

/**
 * A shared_cause_candidate relation is internally consistent: it carries a
 * shared_cause block whose from/to cause refs are owned by the relation's own
 * endpoint findings. The single authority for shared-cause validity — consumed
 * both by causal_relation_correctness's negative sweep (every relation must be
 * valid) and by its positive anchor-pair existence requirement (v3 G2).
 */
function validSharedCauseRelation(
  relation: Record<string, unknown>,
  causeOwnerById: Map<string, string>,
): boolean {
  const sharedCause = record(relation.shared_cause);
  const fromFindingId =
    typeof relation.from_finding_id === "string" ? relation.from_finding_id : "";
  const toFindingId =
    typeof relation.to_finding_id === "string" ? relation.to_finding_id : "";
  return (
    sharedCause !== null &&
    nonEmptyString(sharedCause.cause_claim) &&
    nonEmptyString(sharedCause.from_cause_ref) &&
    nonEmptyString(sharedCause.to_cause_ref) &&
    causeOwnerById.get(sharedCause.from_cause_ref as string) === fromFindingId &&
    causeOwnerById.get(sharedCause.to_cause_ref as string) === toFindingId
  );
}

/**
 * Whether two findings inside one issue are connected through
 * same_root_candidate relations cited in that issue's relation_refs — the
 * only merge evidence the review contract accepts. Shared-cause-only merges
 * have no such path and must keep failing dependency preservation.
 */
function sameRootConnectedWithinIssue(
  issue: Record<string, unknown> | undefined,
  relationById: Map<string, Record<string, unknown>>,
  fromFindingId: string,
  toFindingId: string,
): boolean {
  if (!issue) return false;
  const adjacency = new Map<string, string[]>();
  for (const relationId of strings(issue.relation_refs)) {
    const relation = relationById.get(relationId);
    if (!relation || relation.relation !== "same_root_candidate") continue;
    const from = typeof relation.from_finding_id === "string" ? relation.from_finding_id : "";
    const to = typeof relation.to_finding_id === "string" ? relation.to_finding_id : "";
    if (!from || !to) continue;
    adjacency.set(from, [...(adjacency.get(from) ?? []), to]);
    adjacency.set(to, [...(adjacency.get(to) ?? []), from]);
  }
  const queue = [fromFindingId];
  const visited = new Set(queue);
  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (current === toFindingId) return true;
    for (const next of adjacency.get(current) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
    }
  }
  return false;
}

function issueArtifactChecks(
  artifacts: ReviewPipelineIssueArtifactsLike | undefined,
  declaredNonMaterialFindingCount: number,
  nonMaterialProjections: Record<string, unknown>[],
  fixture: SemanticQualityExpectations,
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
  const issuesById = new Map<string, Record<string, unknown>>();
  for (const issue of issueRows) {
    if (typeof issue.issue_id !== "string") continue;
    issuesById.set(issue.issue_id, issue);
    for (const findingId of strings(issue.surface_finding_ids)) {
      findingIssueIds.set(findingId, issue.issue_id);
    }
  }
  const relationById = new Map<string, Record<string, unknown>>();
  for (const relation of relationRows) {
    if (typeof relation.relation_id === "string") {
      relationById.set(relation.relation_id, relation);
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
        containsBoundarySensitiveUncertainty(normalizedText(finding), fixture)
      ) ||
      containsBoundarySensitiveUncertainty(nonMaterialFindingText, fixture)
    ) ||
      (
        nonMaterialPreservationIds.length > 0 &&
        nonMaterialPreservationIds.length >= declaredNonMaterialFindingCount &&
        textContainsAny(nonMaterialFindingText, fixture.boundaryUncertaintyTerms) &&
        textContainsAny(nonMaterialFindingText, fixture.boundaryContextTerms) &&
        nonMaterialFindingIds.every((findingId) => !relationCoveredIds.has(findingId))
      ),
    [
      `declared_non_material_finding_count=${declaredNonMaterialFindingCount}`,
      `preserved_non_material_ids=${nonMaterialPreservationIds.join(",") || "none"}`,
      "non-material findings must preserve target-specific boundary uncertainty and remain outside relation coverage",
    ],
  );

  // v3 G2: when the fixture declares anchor pairs, each pair MUST be connected
  // by a valid shared_cause_candidate relation between findings anchored to the
  // two term-groups — closing the `.every`-vacuous pass that lets a missing
  // relation through. A finding is anchored to a group when its text contains
  // every term in the group (terms are lowercased to match normalizedText).
  const anchorPairs = fixture.expectedSharedCauseAnchorPairs ?? [];
  const findingById = new Map<string, Record<string, unknown>>();
  for (const finding of findings) {
    if (typeof finding.finding_id === "string") {
      findingById.set(finding.finding_id, finding);
    }
  }
  const findingMatchesAnchorGroup = (
    finding: Record<string, unknown> | undefined,
    group: string[],
  ): boolean => {
    if (!finding) return false;
    const text = normalizedText(finding);
    return group.every((term) => text.includes(term.toLowerCase()));
  };
  const anchorPairsSatisfied = anchorPairs.every(([groupA, groupB]) =>
    relationRows.some((relation) => {
      if (relation.relation !== "shared_cause_candidate") return false;
      // G2 requires TWO DISTINCT surface defects sharing a root — a self-relation
      // (from === to) on one finding that happens to match both groups is a
      // degenerate loop, not a genuine cross-defect link.
      if (relation.from_finding_id === relation.to_finding_id) return false;
      if (!validSharedCauseRelation(relation, causeOwnerById)) return false;
      const fromFinding =
        typeof relation.from_finding_id === "string"
          ? findingById.get(relation.from_finding_id)
          : undefined;
      const toFinding =
        typeof relation.to_finding_id === "string"
          ? findingById.get(relation.to_finding_id)
          : undefined;
      return (
        (findingMatchesAnchorGroup(fromFinding, groupA) &&
          findingMatchesAnchorGroup(toFinding, groupB)) ||
        (findingMatchesAnchorGroup(fromFinding, groupB) &&
          findingMatchesAnchorGroup(toFinding, groupA))
      );
    }),
  );

  const causalRelationCorrectness = check(
    "causal_relation_correctness",
    materialFindingIds.every((findingId) => relationCoveredIds.has(findingId)) &&
      relationRows.every(
        (relation) =>
          relation.relation !== "shared_cause_candidate" ||
          validSharedCauseRelation(relation, causeOwnerById),
      ) &&
      anchorPairsSatisfied,
    [
      `material_finding_ids=${materialFindingIds.join(",") || "none"}`,
      `relation_covered_ids=${[...relationCoveredIds].join(",") || "none"}`,
      `shared_cause_relation_ids=${sharedCauseRelationIds.join(",") || "none"}`,
      `expected_shared_cause_anchor_pairs=${anchorPairs.length} satisfied=${anchorPairsSatisfied}`,
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
      if (!fromIssueId || !toIssueId) return false;
      // Endpoints co-located in one issue by independent merge evidence:
      // the shared-cause context lives inside that issue, so a cross-issue
      // dependency is impossible by construction and co-location counts as
      // preserved. The gate verifies the same_root_candidate connectivity
      // itself (not only the runtime validator) so hand-persisted artifacts
      // cannot smuggle a shared-cause-only merge past this check.
      if (fromIssueId === toIssueId) {
        return sameRootConnectedWithinIssue(
          issuesById.get(fromIssueId),
          relationById,
          relation.from_finding_id as string,
          relation.to_finding_id as string,
        );
      }
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
  /**
   * Injected expectation data for targets outside the built-in code-fixture
   * presets (e.g. ontology fixtures). Takes precedence over fixtureId.
   */
  expectations?: SemanticQualityExpectations;
  reviewRecord: ReviewRecordLike;
  finalOutputText: string;
  issueArtifacts?: ReviewPipelineIssueArtifactsLike;
}): SemanticQualityGateResult {
  const fixture = args.expectations ?? semanticFixture(args.fixtureId);
  if (fixture.materialTerms.length === 0) {
    // textContainsAll over an empty list is vacuously true, so the material
    // recall checks would prove nothing — fail loud UNLESS this is a
    // clean-target fixture, where there is genuinely nothing to recall and the
    // recall checks are excluded from emission (see CLEAN_TARGET_EXCLUDED).
    if (!fixture.expectsNoMaterialDefects) {
      throw new Error(
        "SemanticQualityExpectations.materialTerms must not be empty",
      );
    }
  } else {
    // 빈 문자열 term/alternate는 text.includes("")가 항상 참이라 해당 entry를
    // 공허 충족시킨다 — 게이트 진입에서 fail loud.
    for (const term of fixture.materialTerms) {
      const alternates = Array.isArray(term) ? term : [term];
      if (
        alternates.length === 0 ||
        alternates.some((alternate) => alternate.trim().length === 0)
      ) {
        throw new Error(
          "SemanticQualityExpectations.materialTerms entries must be non-empty strings or non-empty groups of non-empty strings",
        );
      }
    }
  }
  // A clean-target's whole control is the boundary decoy: with no material
  // defect the recall floor cannot catch silence, so distinguishing correct
  // silence from lazy empty silence REQUIRES MUST-preserve. A clean-target that
  // forgets requiresBoundaryPreservation would let empty silence pass vacuously
  // — fail loud on the misconfiguration rather than certify a broken control.
  if (fixture.expectsNoMaterialDefects && !fixture.requiresBoundaryPreservation) {
    throw new Error(
      "SemanticQualityExpectations.expectsNoMaterialDefects requires requiresBoundaryPreservation — without the boundary decoy control, empty silence passes vacuously",
    );
  }
  const summary = args.reviewRecord.result_classification_summary ?? null;
  const materialIssues = records(summary?.material_issues);
  // Clean-target (v3 G1): material promotion must be caught on BOTH surfaces —
  // the summary AND the finding-ledger authority. false_materiality_guard reads
  // the summary; this counts artifact-ledger material findings so a fabricated
  // material finding injected only into the ledger cannot slip past the guard.
  const artifactMaterialFindingCount = fixture.expectsNoMaterialDefects
    ? recordArray(record(args.issueArtifacts?.findingLedger)?.findings).filter(
        (finding) =>
          ["blocker", "high", "medium"].includes(String(finding.severity)),
      ).length
    : 0;
  const nonMaterialFindings = records(summary?.non_material_findings);
  const actionCandidates = records(summary?.action_candidates);
  const materialText = normalizedText(materialIssues);
  const nonMaterialText = normalizedText(nonMaterialFindings);
  const finalReviewResult = markdownSectionBody(args.finalOutputText, "Final Review Result");
  const finalReviewResultText = normalizedText(finalReviewResult ?? "");
  const boundaryNotes = markdownSectionBody(args.finalOutputText, "Boundary Notes");
  const boundaryNotesText = normalizedText(boundaryNotes ?? "");
  const preservedBoundaryText = `${nonMaterialText}\n${boundaryNotesText}`;
  const materialBoundarySensitiveFalsePositive = materialIssues.some((issue) =>
    containsBoundarySensitiveUncertainty(normalizedText(issue), fixture)
  );
  const falseMaterialityCandidateObserved =
    materialBoundarySensitiveFalsePositive ||
    containsBoundarySensitiveUncertainty(preservedBoundaryText, fixture);
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
    // Clean-target (v3 G1): the target has zero material defects, so ANY
    // admitted material issue is a false positive — on EITHER surface. A yes-man
    // that promotes a fabricated issue fails here whether it lands in the summary
    // (materialIssues) or only in the finding-ledger authority
    // (artifactMaterialFindingCount), not just the boundary case the base branch
    // catches.
    (!fixture.expectsNoMaterialDefects ||
      (materialIssues.length === 0 && artifactMaterialFindingCount === 0)) &&
      !materialBoundarySensitiveFalsePositive &&
      (
        !falseMaterialityCandidateObserved ||
        (
          textContainsAny(preservedBoundaryText, fixture.boundaryUncertaintyTerms) &&
          textContainsAny(preservedBoundaryText, fixture.boundaryContextTerms)
        )
      ),
    [
      `boundary-sensitive uncertainty terms must be disclosed with boundary context when they are not admitted material issues: ${fixture.boundaryUncertaintyTerms.join(", ")}`,
      `non_material_finding_count=${nonMaterialFindings.length}`,
      `boundary_notes_chars=${boundaryNotes?.length ?? 0}`,
      ...(fixture.expectsNoMaterialDefects
        ? [
            `clean-target: admitted material_issue_count=${materialIssues.length}, artifact_material_finding_count=${artifactMaterialFindingCount} (both must be 0)`,
          ]
        : []),
    ],
  );

  // Boundary uncertainty's preservation AUTHORITY is the finding-ledger
  // (non-material findings), not the final Boundary Notes projection. A model
  // preserves the decoy's uncertainty by recording it as a non-material,
  // boundary-contextualized finding; whether it also echoes that into the final
  // summary is a projection-style choice, not a quality signal — one model may
  // prioritize the MATERIAL issue's own confidence boundaries in the final note
  // and keep the non-material decoy in the ledger for audit, which is at least as
  // sound. So this reads nonMaterialText (the authority) and stays independent of
  // false_materiality_guard, which checks the ORTHOGONAL axis: the decoy was not
  // mis-promoted to a material issue. (A decoy surfaced only in the final note but
  // absent from the authority still fails here — authority is where it must live.)
  const boundaryUncertainty = check(
    "boundary_uncertainty_preservation",
    // Clean-target (v3 G1): the boundary decoy MUST be preserved — an empty,
    // lazy review that observes nothing no longer passes the vacuous first
    // clause. Otherwise the base rule stands: preserve only what was observed.
    fixture.requiresBoundaryPreservation
      ? containsBoundarySensitiveUncertainty(nonMaterialText, fixture)
      : !falseMaterialityCandidateObserved ||
        containsBoundarySensitiveUncertainty(nonMaterialText, fixture),
    [
      `non_material_boundary_chars=${nonMaterialText.length}`,
      `expected boundary uncertainty (${fixture.boundaryUncertaintyTerms.join(", ")}) preserved in the finding-ledger authority (non-material findings)`,
      ...(fixture.requiresBoundaryPreservation
        ? ["clean-target: boundary decoy MUST be preserved (empty silence fails)"]
        : []),
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
      `material issue must preserve target anchor ${fixture.targetAnchor}`,
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
  // Clean-target (v3 G1): emit only the applicable set — the recall/grounding/
  // actionability checks are N/A with no material defect and would structurally
  // fail on an empty material set. The record layer's per-fixture emission pin
  // (A-1b) expects exactly this reduced set for such a fixture.
  const emittedChecks = fixture.expectsNoMaterialDefects
    ? checks.filter((item) => !CLEAN_TARGET_EXCLUDED_CHECK_IDS.has(item.check_id))
    : checks;
  return {
    status: emittedChecks.every((item) => item.status === "passed")
      ? "passed"
      : "failed",
    fixture_id: fixture.fixtureId,
    scope: "fixture_specific",
    fixture_target_anchor: fixture.targetAnchor,
    applicability: "real_model_only",
    checks: emittedChecks,
  };
}
