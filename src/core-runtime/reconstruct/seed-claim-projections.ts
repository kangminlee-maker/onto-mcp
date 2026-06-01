import type {
  ReconstructOntologySeedArtifact,
  ReconstructEvidenceRef,
  ReconstructSeedClaim,
} from "./artifact-types.js";

function uniqueEvidenceRefs(refs: ReconstructEvidenceRef[]): ReconstructEvidenceRef[] {
  const byKey = new Map<string, ReconstructEvidenceRef>();
  for (const ref of refs) {
    byKey.set(
      `${ref.observation_id}\u0000${ref.target_material_kind}\u0000${ref.source_ref}\u0000${ref.location}`,
      ref,
    );
  }
  return [...byKey.values()];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function recordArray(owner: Record<string, unknown> | null, key: string): Record<string, unknown>[] {
  const value = owner?.[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function evidenceRefs(value: unknown): ReconstructEvidenceRef[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ReconstructEvidenceRef =>
    isRecord(item) &&
    typeof item.observation_id === "string" &&
    typeof item.target_material_kind === "string" &&
    typeof item.source_ref === "string" &&
    typeof item.location === "string"
  );
}

function directEvidence(record: Record<string, unknown> | null): ReconstructEvidenceRef[] {
  return record ? uniqueEvidenceRefs(evidenceRefs(record.evidence_refs)) : [];
}

function nestedRecordEvidence(
  record: Record<string, unknown> | null,
  nestedKeys: string[],
): ReconstructEvidenceRef[] {
  if (!record) return [];
  return uniqueEvidenceRefs([
    ...directEvidence(record),
    ...nestedKeys.flatMap((key) =>
      recordArray(record, key).flatMap((nestedRecord) => directEvidence(nestedRecord))
    ),
  ]);
}

function purposeClaimId(seedId: string | null): string {
  return seedId ? `${seedId}#purpose` : "ontology-seed-purpose";
}

function claim(args: {
  id: string | null;
  seed_ref_path: string;
  name: string | null;
  statement: string | null;
  evidence_refs: ReconstructEvidenceRef[];
  fallbackName: string;
}): ReconstructSeedClaim | null {
  if (!args.id) return null;
  return {
    claim_id: args.id,
    seed_ref_path: args.seed_ref_path,
    projection_source: "actionable_ontology_seed",
    evidence_policy: "direct_evidence_only",
    name: args.name ?? args.fallbackName,
    statement: args.statement ?? args.name ?? args.fallbackName,
    evidence_refs: args.evidence_refs,
  };
}

function collectRecordClaims(args: {
  records: Record<string, unknown>[];
  idKey: string;
  nameKeys: string[];
  statementKeys: string[];
  fallbackPrefix: string;
  pathPrefix: string;
  evidence?: (record: Record<string, unknown>) => ReconstructEvidenceRef[];
}): ReconstructSeedClaim[] {
  return args.records
    .map((record, index) => claim({
      id: stringValue(record[args.idKey]),
      seed_ref_path: `${args.pathPrefix}[${index}].${args.idKey}`,
      name: args.nameKeys.map((key) => stringValue(record[key])).find(Boolean) ?? null,
      statement:
        args.statementKeys.map((key) => stringValue(record[key])).find(Boolean) ?? null,
      evidence_refs: args.evidence ? args.evidence(record) : directEvidence(record),
      fallbackName: `${args.fallbackPrefix} ${index + 1}`,
    }))
    .filter((item): item is ReconstructSeedClaim => item !== null);
}

export function ontologySeedClaimProjections(
  ontologySeed: ReconstructOntologySeedArtifact,
): ReconstructSeedClaim[] {
  const seed = recordValue(ontologySeed) ?? {};
  const seedIdentity = recordValue(seed.seed_identity);
  const purpose = recordValue(seed.purpose);
  const conceptualFrame = recordValue(seed.conceptual_frame);
  const semanticLayer = recordValue(seed.semantic_layer);
  const kineticLayer = recordValue(seed.kinetic_layer);
  const dynamicLayer = recordValue(seed.dynamic_layer);
  const dataBindingLayer = recordValue(seed.data_binding_layer);

  const purposeClaim = claim({
    id: purposeClaimId(stringValue(seedIdentity?.seed_id)),
    seed_ref_path: "purpose.declared_purpose",
    name: stringValue(seedIdentity?.title) ?? "Ontology Seed Purpose",
    statement: stringValue(purpose?.declared_purpose),
    evidence_refs: directEvidence(purpose),
    fallbackName: "Ontology Seed Purpose",
  });

  return [
    ...(purposeClaim ? [purposeClaim] : []),
    ...collectRecordClaims({
      records: recordArray(conceptualFrame, "concepts"),
      idKey: "concept_id",
      nameKeys: ["name"],
      statementKeys: ["definition", "purpose_role"],
      fallbackPrefix: "Concept",
      pathPrefix: "conceptual_frame.concepts",
    }),
    ...collectRecordClaims({
      records: recordArray(conceptualFrame, "associations"),
      idKey: "association_id",
      nameKeys: ["association_kind"],
      statementKeys: ["statement"],
      fallbackPrefix: "Association",
      pathPrefix: "conceptual_frame.associations",
    }),
    ...collectRecordClaims({
      records: recordArray(semanticLayer, "object_types"),
      idKey: "object_type_id",
      nameKeys: ["name"],
      statementKeys: ["description"],
      fallbackPrefix: "Object Type",
      pathPrefix: "semantic_layer.object_types",
    }),
    ...collectRecordClaims({
      records: recordArray(semanticLayer, "link_types"),
      idKey: "link_type_id",
      nameKeys: ["business_meaning"],
      statementKeys: ["business_meaning"],
      fallbackPrefix: "Link Type",
      pathPrefix: "semantic_layer.link_types",
    }),
    ...collectRecordClaims({
      records: recordArray(semanticLayer, "value_types"),
      idKey: "value_type_id",
      nameKeys: ["name"],
      statementKeys: ["representation"],
      fallbackPrefix: "Value Type",
      pathPrefix: "semantic_layer.value_types",
    }),
    ...collectRecordClaims({
      records: recordArray(semanticLayer, "constraints"),
      idKey: "constraint_id",
      nameKeys: ["constraint_kind"],
      statementKeys: ["statement"],
      fallbackPrefix: "Constraint",
      pathPrefix: "semantic_layer.constraints",
    }),
    ...collectRecordClaims({
      records: recordArray(dynamicLayer, "actor_types"),
      idKey: "actor_type_id",
      nameKeys: ["name"],
      statementKeys: ["description"],
      fallbackPrefix: "Actor Type",
      pathPrefix: "dynamic_layer.actor_types",
    }),
    ...collectRecordClaims({
      records: recordArray(dynamicLayer, "actor_roles"),
      idKey: "role_id",
      nameKeys: ["name"],
      statementKeys: ["description"],
      fallbackPrefix: "Actor Role",
      pathPrefix: "dynamic_layer.actor_roles",
    }),
    ...collectRecordClaims({
      records: recordArray(dynamicLayer, "permission_policies"),
      idKey: "policy_id",
      nameKeys: ["permission_kind"],
      statementKeys: ["condition", "permission_kind"],
      fallbackPrefix: "Permission Policy",
      pathPrefix: "dynamic_layer.permission_policies",
    }),
    ...collectRecordClaims({
      records: recordArray(dynamicLayer, "state_models"),
      idKey: "state_model_id",
      nameKeys: ["name"],
      statementKeys: ["description"],
      fallbackPrefix: "State Model",
      pathPrefix: "dynamic_layer.state_models",
      evidence: (record) => nestedRecordEvidence(record, ["transitions"]),
    }),
    ...collectRecordClaims({
      records: recordArray(dynamicLayer, "lifecycle_rules"),
      idKey: "rule_id",
      nameKeys: ["name", "rule_kind"],
      statementKeys: ["statement", "description"],
      fallbackPrefix: "Lifecycle Rule",
      pathPrefix: "dynamic_layer.lifecycle_rules",
    }),
    ...collectRecordClaims({
      records: recordArray(kineticLayer, "action_types"),
      idKey: "action_type_id",
      nameKeys: ["name"],
      statementKeys: ["description"],
      fallbackPrefix: "Action Type",
      pathPrefix: "kinetic_layer.action_types",
    }),
    ...collectRecordClaims({
      records: recordArray(kineticLayer, "functions"),
      idKey: "function_id",
      nameKeys: ["name"],
      statementKeys: ["description"],
      fallbackPrefix: "Function",
      pathPrefix: "kinetic_layer.functions",
    }),
    ...collectRecordClaims({
      records: recordArray(kineticLayer, "workflows"),
      idKey: "workflow_id",
      nameKeys: ["name"],
      statementKeys: ["description"],
      fallbackPrefix: "Workflow",
      pathPrefix: "kinetic_layer.workflows",
    }),
    ...collectRecordClaims({
      records: recordArray(dataBindingLayer, "source_bindings"),
      idKey: "binding_id",
      nameKeys: ["binding_kind"],
      statementKeys: ["statement"],
      fallbackPrefix: "Source Binding",
      pathPrefix: "data_binding_layer.source_bindings",
    }),
    ...collectRecordClaims({
      records: recordArray(dataBindingLayer, "read_models"),
      idKey: "read_model_id",
      nameKeys: ["name"],
      statementKeys: ["transformation_summary"],
      fallbackPrefix: "Read Model",
      pathPrefix: "data_binding_layer.read_models",
    }),
    ...collectRecordClaims({
      records: recordArray(dataBindingLayer, "writebacks"),
      idKey: "writeback_id",
      nameKeys: ["name"],
      statementKeys: ["writeback_summary", "description"],
      fallbackPrefix: "Writeback",
      pathPrefix: "data_binding_layer.writebacks",
    }),
    ...collectRecordClaims({
      records: recordArray(dataBindingLayer, "provenance_bindings"),
      idKey: "provenance_id",
      nameKeys: ["author_or_system"],
      statementKeys: ["timestamp_ref", "statement"],
      fallbackPrefix: "Provenance Binding",
      pathPrefix: "data_binding_layer.provenance_bindings",
    }),
    ...collectRecordClaims({
      records: recordArray(seed, "handoff_limitations"),
      idKey: "limitation_id",
      nameKeys: ["limitation_kind"],
      statementKeys: ["description", "mitigation_or_next_action"],
      fallbackPrefix: "Handoff Limitation",
      pathPrefix: "handoff_limitations",
    }),
  ];
}

export function ontologySeedExcludedClaimIds(
  ontologySeed: ReconstructOntologySeedArtifact,
): Set<string> {
  const seed = recordValue(ontologySeed) ?? {};
  return new Set(
    recordArray(seed, "handoff_limitations")
      .map((limitation) => stringValue(limitation.limitation_id))
      .filter((id): id is string => id !== null),
  );
}

export function ontologySeedAnswerabilitySummary(
  ontologySeed: ReconstructOntologySeedArtifact,
): {
  declared_question_count: number;
  supported_question_count: number;
  deferred_question_count: number;
  unsupported_question_count: number;
  supported_action_count: number;
  unsupported_action_count: number;
} {
  const seed = recordValue(ontologySeed) ?? {};
  const validationLayer = recordValue(seed.validation_layer);
  const kineticLayer = recordValue(seed.kinetic_layer);
  const handoffLimitations = recordArray(seed, "handoff_limitations");
  const coverageAxes = stringArray(validationLayer?.coverage_axes);
  const unsupportedQuestionCandidates = recordArray(
    validationLayer,
    "unsupported_question_candidates",
  );
  const actionTypes = recordArray(kineticLayer, "action_types");
  const actionIds = new Set(
    actionTypes
      .map((action) => stringValue(action.action_type_id))
      .filter((id): id is string => id !== null),
  );
  const limitedActionIds = new Set(
    handoffLimitations.flatMap((limitation) => stringArray(limitation.affected_refs))
      .filter((ref) => actionIds.has(ref)),
  );
  return {
    declared_question_count: coverageAxes.length,
    supported_question_count: Math.max(0, coverageAxes.length - unsupportedQuestionCandidates.length),
    deferred_question_count: handoffLimitations.length,
    unsupported_question_count: unsupportedQuestionCandidates.length,
    supported_action_count: Math.max(0, actionTypes.length - limitedActionIds.size),
    unsupported_action_count: limitedActionIds.size,
  };
}
