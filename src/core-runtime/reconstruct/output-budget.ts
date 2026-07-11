export const RECONSTRUCT_SEMANTIC_AUTHOR_OUTPUT_CEILINGS = {
  candidate_disposition: 4_000,
  ontology_seed: 9_000,
  json_parse_repair: 16_000,
} as const;

export const RECONSTRUCT_SEMANTIC_AUTHOR_MAX_BASE_OUTPUT_TOKENS = Math.max(
  ...Object.values(RECONSTRUCT_SEMANTIC_AUTHOR_OUTPUT_CEILINGS),
);
