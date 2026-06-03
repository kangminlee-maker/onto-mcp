import type { TargetMaterialKind } from "../target-material-kind.js";

export interface ReconstructSourceObservation {
  observation_id: string;
  round_id?: string | null;
  observation_batch_id?: string | null;
  triggering_frontier_validation_ref?: string | null;
  target_material_kind: Exclude<TargetMaterialKind, "mixed" | "unknown">;
  adapter_id: string;
  source_ref: string;
  location: string;
  summary: string;
  structural_data: Record<string, unknown>;
}

export interface ReconstructSourceObservationValidation {
  valid: boolean;
  violations: string[];
}

const PROHIBITED_STRUCTURAL_KEYS = new Set([
  "aggregate_root",
  "business_entity",
  "business_rule",
  "domain_service",
  "entity",
  "fact_type",
  "ontology_claim",
  "policy_meaning",
  "relation",
]);

const PROHIBITED_SUMMARY_PATTERNS: Array<[RegExp, string]> = [
  [/\baggregate root\b/i, "aggregate root"],
  [/\bdomain service\b/i, "domain service"],
  [/\bbusiness rule\b/i, "business rule"],
  [/\bbusiness entity\b/i, "business entity"],
  [/\bontology (entity|relation|claim)\b/i, "ontology claim"],
  [/\bfact_type\b/i, "fact_type"],
];

function collectObjectKeys(value: unknown, keys: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectObjectKeys(item, keys);
    return keys;
  }
  if (!value || typeof value !== "object") return keys;
  for (const [key, child] of Object.entries(value)) {
    keys.push(key);
    collectObjectKeys(child, keys);
  }
  return keys;
}

export function validateSourceObservationBoundary(
  observation: ReconstructSourceObservation,
): ReconstructSourceObservationValidation {
  const violations: string[] = [];

  if (!observation.observation_id.trim()) {
    violations.push("observation_id is required");
  }
  if (
    "round_id" in observation &&
    typeof observation.round_id === "string" &&
    !observation.round_id.trim()
  ) {
    violations.push("round_id must not be blank when present");
  }
  if (
    "observation_batch_id" in observation &&
    typeof observation.observation_batch_id === "string" &&
    !observation.observation_batch_id.trim()
  ) {
    violations.push("observation_batch_id must not be blank when present");
  }
  if (!observation.adapter_id.trim()) {
    violations.push("adapter_id is required");
  }
  if (!observation.source_ref.trim()) {
    violations.push("source_ref is required");
  }
  if (!observation.location.trim()) {
    violations.push("location is required");
  }

  for (const key of collectObjectKeys(observation.structural_data)) {
    if (PROHIBITED_STRUCTURAL_KEYS.has(key.toLowerCase())) {
      violations.push(`structural_data contains semantic key: ${key}`);
    }
  }

  for (const [pattern, label] of PROHIBITED_SUMMARY_PATTERNS) {
    if (pattern.test(observation.summary)) {
      violations.push(`summary contains prohibited ontology interpretation: ${label}`);
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
