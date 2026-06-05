export type SemanticQualityGateStatus = "passed" | "failed" | "not_applicable";

export interface SemanticQualityGateCheck {
  check_id:
    | "material_issue_recall"
    | "final_result_material_issue_recall"
    | "false_materiality_guard"
    | "boundary_uncertainty_preservation"
    | "actionability"
    | "count_list_consistency"
    | "grounding";
  status: "passed" | "failed";
  evidence: string[];
}

export interface SemanticQualityGateResult {
  status: SemanticQualityGateStatus;
  fixture_id: "review-pipeline-target-v1";
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

const MATERIAL_TERMS = ["unstableformat", "json.stringify", "undefined"];
const BOUNDARY_TERMS = [
  "lensid",
  "caller",
  "callers",
  "public api",
  "external",
  "orphan",
  "evidence gap",
  "bounded",
];

function records(value: unknown): ReviewResultIssueLike[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is ReviewResultIssueLike =>
          typeof item === "object" && item !== null,
      )
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
  executorRealization: string;
  reviewRecord: ReviewRecordLike;
  finalOutputText: string;
}): SemanticQualityGateResult {
  if (args.executorRealization === "mock") {
    return {
      status: "not_applicable",
      fixture_id: "review-pipeline-target-v1",
      applicability: "real_model_only",
      reason: "mock executor does not evaluate the benchmark target semantics",
      checks: [],
    };
  }

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
    materialIssues.length >= 1 && textContainsAll(materialText, MATERIAL_TERMS),
    [
      `material_issue_count=${String(summary?.material_issue_count ?? materialIssues.length)}`,
      "expected target truth: unstableFormat + JSON.stringify + undefined",
    ],
  );

  const finalResultMaterialIssueRecall = check(
    "final_result_material_issue_recall",
    finalReviewResult !== null &&
      textContainsAll(finalReviewResultText, MATERIAL_TERMS),
    [
      finalReviewResult === null
        ? "Final Review Result section missing"
        : `Final Review Result chars=${finalReviewResult.length}`,
      "expected final explanation to preserve unstableFormat + JSON.stringify + undefined",
    ],
  );

  const falseMaterialityGuard = check(
    "false_materiality_guard",
    materialIssues.every((issue) => {
      const text = normalizedText(issue);
      return !text.includes("lensid") && !text.includes("orphan");
    }) &&
      textContainsAny(preservedBoundaryText, ["lensid", "orphan"]) &&
      textContainsAny(preservedBoundaryText, ["evidence gap", "caller", "public api"]),
    [
      "lensId/orphan-export observations must remain non-material evidence gaps",
      `non_material_finding_count=${nonMaterialFindings.length}`,
      `boundary_notes_chars=${boundaryNotes?.length ?? 0}`,
    ],
  );

  const boundaryUncertainty = check(
    "boundary_uncertainty_preservation",
    boundaryNotes !== null &&
      textContainsAny(boundaryNotesText, BOUNDARY_TERMS) &&
      textContainsAny(boundaryNotesText, ["lensid", "orphan"]) &&
      textContainsAny(boundaryNotesText, ["caller", "public api", "evidence gap"]),
    [
      boundaryNotes === null
        ? "Boundary Notes section missing"
        : `Boundary Notes chars=${boundaryNotes.length}`,
      "expected: compact note preserving caller/API/lensId/orphan uncertainty",
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
      textContainsAny(actionSectionText, [
        "unstableformat",
        "json.stringify",
        "undefined",
      ]) &&
      textContainsAny(actionSectionText, [
        "return type",
        "fallback",
        "widen",
        "guard",
        "focused test",
        "verify",
      ]),
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
        text.includes("src/target.ts")
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
    actionability,
    grounding,
  ];
  return {
    status: checks.every((item) => item.status === "passed") ? "passed" : "failed",
    fixture_id: "review-pipeline-target-v1",
    applicability: "real_model_only",
    checks,
  };
}
