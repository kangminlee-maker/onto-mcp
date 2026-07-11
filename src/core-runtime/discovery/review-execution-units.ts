/**
 * Single source of the review execution unit-id vocabulary. Lives in its own
 * leaf module because TWO discovery authorities consume it without an import
 * cycle between them: settings-chain (the zod unit schema + unit→actor
 * inheritance) and supported-models (the dispatch-role resolver, which must
 * bound `review.execution.units.<id>.llm` paths to KNOWN unit ids so an
 * unknown unit path keeps the fail-closed `author` requirement — G7 walks raw
 * parsed YAML without the strict zod layer, so unknown keys do reach it).
 */
export const REVIEW_EXECUTION_UNIT_IDS = [
  "lens",
  "finding_ledger",
  "finding_relation_graph",
  "issue_ledger",
  "issue_stance_matrix",
  "deliberation_plan",
  "problem_framing",
  "issue_stance_response",
  "deliberation_response",
  "deliberation_resolution",
  "synthesis_response",
] as const;
