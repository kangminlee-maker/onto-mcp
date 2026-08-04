export const RECONSTRUCT_SEMANTIC_AUTHOR_OUTPUT_CEILINGS = {
  candidate_disposition: 4_000,
  ontology_seed: 9_000,
  // No longer sizes a dispatch: JSON repair became deterministic and stopped calling a model
  // (design §13-D2). Kept because it is the MAXIMUM, and the max is what sizes output headroom in
  // reconstruct-api — dropping it would lower that budget, which is a separate decision.
  json_parse_repair: 16_000,
} as const;

export const RECONSTRUCT_SEMANTIC_AUTHOR_MAX_BASE_OUTPUT_TOKENS = Math.max(
  ...Object.values(RECONSTRUCT_SEMANTIC_AUTHOR_OUTPUT_CEILINGS),
);
