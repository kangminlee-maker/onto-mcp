export const PROBLEM_FRAMING_ISSUE_ROLE_VALUES = [
  "root_cause",
  "symptom",
  "enabler",
  "conflicting_interpretation",
  "evidence_gap",
  "independent_issue",
] as const;

export const PROBLEM_FRAMING_JUDGMENT_STATE_VALUES = [
  "observed",
  "inferred",
  "contested",
  "insufficient_evidence",
  "outside_boundary",
] as const;

export const PROBLEM_FRAMING_IMPACT_KIND_VALUES = [
  "correctness",
  "consistency",
  "completeness",
  "safety_risk",
  "usability",
  "governance_value",
  "maintainability_evolvability",
] as const;

export const PROBLEM_FRAMING_TIMING_CLASS_VALUES = [
  "current_blocker",
  "next_step_blocker",
  "planned_follow_up",
  "defer_watch",
] as const;

export const PROBLEM_FRAMING_CLOSURE_CLASS_VALUES = [
  "fix_now",
  "carry_forward",
  "document_only",
  "needs_decision",
  "needs_evidence",
  "watch",
] as const;

export const PROBLEM_FRAMING_CLOSURE_OBLIGATION_VALUES = [
  "must_close_in_target",
  "must_close_before_next_stage",
  "may_close_during_next_stage",
  "planned_later",
  "out_of_scope",
] as const;

export const PROBLEM_FRAMING_CLASSIFICATION_SUBMIT_KEYS = [
  "issue_id",
  "problem_definition",
  "issue_role",
  "judgment_state",
  "impact_kind",
  "timing_class",
  "closure_class",
  "closure_obligation",
  "domain_axes",
  "rationale",
] as const;

export const PROBLEM_FRAMING_CLASSIFICATION_ARTIFACT_KEYS = [
  ...PROBLEM_FRAMING_CLASSIFICATION_SUBMIT_KEYS,
  "related_surface_finding_ids",
] as const;

export const PROBLEM_FRAMING_ISSUE_ROLE_SET = new Set(
  PROBLEM_FRAMING_ISSUE_ROLE_VALUES,
);
export const PROBLEM_FRAMING_JUDGMENT_STATE_SET = new Set(
  PROBLEM_FRAMING_JUDGMENT_STATE_VALUES,
);
export const PROBLEM_FRAMING_IMPACT_KIND_SET = new Set(
  PROBLEM_FRAMING_IMPACT_KIND_VALUES,
);
export const PROBLEM_FRAMING_TIMING_CLASS_SET = new Set(
  PROBLEM_FRAMING_TIMING_CLASS_VALUES,
);
export const PROBLEM_FRAMING_CLOSURE_CLASS_SET = new Set(
  PROBLEM_FRAMING_CLOSURE_CLASS_VALUES,
);
export const PROBLEM_FRAMING_CLOSURE_OBLIGATION_SET = new Set(
  PROBLEM_FRAMING_CLOSURE_OBLIGATION_VALUES,
);
