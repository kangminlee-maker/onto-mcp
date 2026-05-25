export const REVIEW_STATES = [
  "preparing",
  "awaiting_lens_dispatch",
  "validating_lenses",
  "awaiting_adjudication",
  "awaiting_synthesize_dispatch",
  "awaiting_deliberation",
  "completing",
  "completed",
  "halted_partial",
  "failed",
] as const;

export type ReviewState = (typeof REVIEW_STATES)[number];

export const REVIEW_TERMINAL_STATES: ReadonlySet<ReviewState> = new Set([
  "completed",
  "halted_partial",
  "failed",
]);

export const REVIEW_TRANSITIONS: Record<
  ReviewState | "(init)",
  readonly ReviewState[]
> = {
  "(init)": ["preparing"],
  preparing: ["awaiting_lens_dispatch", "failed"],
  awaiting_lens_dispatch: ["validating_lenses"],
  validating_lenses: [
    "awaiting_adjudication",
    "awaiting_deliberation",
    "halted_partial",
    "failed",
  ],
  awaiting_adjudication: ["awaiting_deliberation", "failed"],
  awaiting_deliberation: ["awaiting_synthesize_dispatch", "failed"],
  awaiting_synthesize_dispatch: ["completing"],
  completing: ["completed", "failed"],
  completed: [],
  halted_partial: [],
  failed: [],
};

export function canReviewTransition(
  from: ReviewState | "(init)",
  to: ReviewState,
): boolean {
  const allowed = REVIEW_TRANSITIONS[from];
  return allowed != null && allowed.includes(to);
}
