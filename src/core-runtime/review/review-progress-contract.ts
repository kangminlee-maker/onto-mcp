import type {
  ReviewIssueArtifactId,
  ReviewUnitKind,
} from "./artifact-types.js";

export type ReviewProgressStepId =
  | "manifest_validation"
  | "lens_dispatch"
  | "lens_completion_barrier"
  | "finding_ledger"
  | "finding_relation_graph"
  | "issue_ledger"
  | "issue_stance_matrix"
  | "deliberation_plan"
  | "lens_deliberation_responses"
  | "controlled_deliberation"
  | "problem_framing"
  | "synthesize";

export interface ReviewProgressStepSpec {
  id: ReviewProgressStepId;
  step: number;
  label: string;
  issue_artifact_id?: ReviewIssueArtifactId;
  halt_phase?: string;
  halt_unit_kind?: ReviewUnitKind;
}

export const REVIEW_PROGRESS_STEPS: readonly ReviewProgressStepSpec[] = [
  {
    id: "manifest_validation",
    step: 1,
    label: "load execution plan",
  },
  {
    id: "lens_dispatch",
    step: 2,
    label: "isolated lens execution",
    halt_unit_kind: "lens",
  },
  {
    id: "lens_completion_barrier",
    step: 3,
    label: "lens completion barrier",
    halt_phase: "lens_completion_barrier",
  },
  {
    id: "finding_ledger",
    step: 4,
    label: "finding ledger",
    issue_artifact_id: "finding-ledger",
    halt_phase: "issue_artifact",
    halt_unit_kind: "issue_artifact",
  },
  {
    id: "finding_relation_graph",
    step: 5,
    label: "finding relation graph",
    issue_artifact_id: "finding-relation-graph",
    halt_phase: "issue_artifact",
    halt_unit_kind: "issue_artifact",
  },
  {
    id: "issue_ledger",
    step: 6,
    label: "issue ledger",
    issue_artifact_id: "issue-ledger",
    halt_phase: "issue_artifact",
    halt_unit_kind: "issue_artifact",
  },
  {
    id: "issue_stance_matrix",
    step: 7,
    label: "issue stance matrix",
    issue_artifact_id: "issue-stance-matrix",
    halt_phase: "issue_artifact",
    halt_unit_kind: "issue_artifact",
  },
  {
    id: "deliberation_plan",
    step: 8,
    label: "deliberation plan",
    issue_artifact_id: "deliberation-plan",
    halt_phase: "issue_artifact",
    halt_unit_kind: "issue_artifact",
  },
  {
    id: "lens_deliberation_responses",
    step: 9,
    label: "lens deliberation responses",
    halt_phase: "controlled_lens_deliberation",
    halt_unit_kind: "deliberation",
  },
  {
    id: "controlled_deliberation",
    step: 10,
    label: "teamlead controlled deliberation",
    halt_phase: "controlled_lens_deliberation",
    halt_unit_kind: "deliberation",
  },
  {
    id: "problem_framing",
    step: 11,
    label: "problem framing",
    issue_artifact_id: "problem-framing",
    halt_phase: "issue_artifact",
    halt_unit_kind: "issue_artifact",
  },
  {
    id: "synthesize",
    step: 12,
    label: "synthesize and write execution result",
    halt_phase: "synthesize",
    halt_unit_kind: "synthesize",
  },
];

export const REVIEW_PROGRESS_TOTAL_STEPS = REVIEW_PROGRESS_STEPS.length;

export const REVIEW_EXECUTION_STEP_IDS = REVIEW_PROGRESS_STEPS.map(
  (step) => step.id,
);

export function reviewProgressStepById(
  stepId: ReviewProgressStepId,
): ReviewProgressStepSpec {
  const step = REVIEW_PROGRESS_STEPS.find((candidate) => candidate.id === stepId);
  if (!step) throw new Error(`Unknown review progress step id: ${stepId}`);
  return step;
}

export function reviewProgressStepByIssueArtifact(
  artifactId: ReviewIssueArtifactId,
): ReviewProgressStepSpec {
  const step = REVIEW_PROGRESS_STEPS.find(
    (candidate) => candidate.issue_artifact_id === artifactId,
  );
  if (!step) {
    throw new Error(`No review progress step for issue artifact: ${artifactId}`);
  }
  return step;
}

export function reviewProgressStepIdFromHalt(args: {
  haltPhase?: string | null;
  haltUnitId?: string | null;
  haltUnitKind?: ReviewUnitKind | null;
}): ReviewProgressStepId | null {
  if (args.haltPhase === "lens_completion_barrier") {
    return "lens_completion_barrier";
  }
  if (args.haltPhase === "synthesize") return "synthesize";
  if (args.haltPhase === "controlled_lens_deliberation") {
    return args.haltUnitId === "controlled-deliberation"
      ? "controlled_deliberation"
      : "lens_deliberation_responses";
  }
  if (args.haltPhase === "issue_artifact") {
    const unitId = args.haltUnitId;
    const step = REVIEW_PROGRESS_STEPS.find(
      (candidate) => candidate.issue_artifact_id === unitId,
    );
    return step?.id ?? "finding_ledger";
  }
  if (args.haltUnitKind === "lens") return "lens_dispatch";
  return null;
}
