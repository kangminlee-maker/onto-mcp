/**
 * core-api re-export of the review progress-step contract (the canonical step
 * ids, ordered specs, and label lookup that review-api itself uses), so
 * consumers like the `onto watch` TUI reuse the same label authority through
 * core-api instead of reaching into core-runtime/review or duplicating labels.
 */
export {
  REVIEW_PROGRESS_STEPS,
  reviewProgressStepById,
} from "../core-runtime/review/review-progress-contract.js";
export type {
  ReviewProgressStepId,
  ReviewProgressStepSpec,
} from "../core-runtime/review/review-progress-contract.js";
