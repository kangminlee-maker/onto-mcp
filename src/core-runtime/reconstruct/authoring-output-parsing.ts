/**
 * Turning an author's raw JSON answer into the typed rows the runtime stores.
 *
 * The `*FromLlm` functions each parse one artifact kind, and the small readers below them
 * (`stringValue`, `optionalString`, `stringArray`, `recordValue`, `enumString`, `records`) are the
 * only way those parsers touch untyped input — so a missing or wrong-typed field fails at the
 * boundary rather than becoming an undefined deep inside an artifact. Evidence-ref derivation lives
 * here too because it is part of building those rows, not a separate step.
 */
import { TARGET_MATERIAL_KINDS } from "../target-material-kind.js";
import type { TargetMaterialKind } from "../target-material-kind.js";
import type {
  ReconstructCandidateDispositionArtifact,
  ReconstructCandidateInventoryArtifact,
  ReconstructEvidenceRef,
  ReconstructOntologySeedArtifact,
  ReconstructSourceObservationsArtifact,
  ReconstructSourcePurposeCandidatesArtifact,
  ReconstructTargetMaterialProfileArtifact,
} from "./artifact-types.js";
import type { ReconstructSourceObservation } from "./source-observations.js";

// M4a — one predicate set for revision-proposal disposition, used identically at the stop
// gate and the final-output disclosure. A proposal BLOCKS the run from claiming it is
// resolved when it drops or postpones scope (reject|defer); every non-`reuse` proposal is
// DISCLOSED as a next-round directive (extend|rename|split disclosed but non-blocking).
export function evidenceRefFromObservation(
  observation: ReconstructSourceObservation,
): ReconstructEvidenceRef {
  return {
    observation_id: observation.observation_id,
    target_material_kind: observation.target_material_kind,
    source_ref: observation.source_ref,
    location: observation.location,
  };
}

export function records(value: unknown, fieldName: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array.`);
  }
  return value.map((item, index) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`${fieldName}[${index}] must be an object.`);
    }
    return item as Record<string, unknown>;
  });
}

export function stringValue(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
  return value.trim();
}

export function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export function stringArray(value: unknown, fieldName: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${fieldName} must be an array.`);
  return value.map((item, index) => stringValue(item, `${fieldName}[${index}]`));
}

export function recordValue(value: unknown, fieldName: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${fieldName} must be an object.`);
  }
  return value as Record<string, unknown>;
}

export function normalizeOntologySeedRuntimeMetadata(
  value: unknown,
  authorId: string,
): ReconstructOntologySeedArtifact {
  const seed = recordValue(value, "ontology_seed");
  const seedIdentity = seed.seed_identity;
  if (
    seedIdentity === null ||
    typeof seedIdentity !== "object" ||
    Array.isArray(seedIdentity)
  ) {
    return seed as unknown as ReconstructOntologySeedArtifact;
  }
  return {
    ...seed,
    seed_identity: {
      ...seedIdentity,
      authoring_profile: authorId,
    },
  } as unknown as ReconstructOntologySeedArtifact;
}

export function enumString<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fieldName: string,
): T {
  const raw = stringValue(value, fieldName);
  if (!allowed.includes(raw as T)) {
    throw new Error(`${fieldName} must be one of: ${allowed.join(", ")}.`);
  }
  return raw as T;
}

function evidenceRefByObservationId(
  sourceObservations: ReconstructSourceObservationsArtifact,
): Map<string, ReconstructEvidenceRef> {
  return new Map(
    sourceObservations.observations.map((observation) => [
      observation.observation_id,
      evidenceRefFromObservation(observation),
    ]),
  );
}

export function evidenceRefsFromIds(args: {
  observationIds: string[];
  sourceObservations: ReconstructSourceObservationsArtifact;
  fieldName: string;
}): ReconstructEvidenceRef[] {
  const byId = evidenceRefByObservationId(args.sourceObservations);
  const refs: ReconstructEvidenceRef[] = [];
  const unknownObservationIds: string[] = [];
  for (const observationId of args.observationIds) {
    const ref = byId.get(observationId);
    if (!ref) {
      unknownObservationIds.push(observationId);
      continue;
    }
    refs.push(ref);
  }
  if (refs.length === 0) {
    if (unknownObservationIds.length > 0) {
      throw new Error(
        `${args.fieldName} references no known observation ids; unknown ids: ${
          unknownObservationIds.slice(0, 8).join(", ")
        }${unknownObservationIds.length > 8 ? ", ..." : ""}`,
      );
    }
    throw new Error(`${args.fieldName} must reference at least one observation id.`);
  }
  return refs;
}

export function sourcePurposeCandidateFromLlm(args: {
  raw: Record<string, unknown>;
  index: number;
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
}): ReconstructSourcePurposeCandidatesArtifact["purpose_candidates"][number] {
  const raw = args.raw;
  const candidatePath = `purpose_candidates[${args.index}]`;
  const evidenceObservationIds = stringArray(
    raw.supporting_evidence_observation_ids,
    `${candidatePath}.supporting_evidence_observation_ids`,
  );
  const supportingEvidenceRefs = evidenceRefsFromIds({
    observationIds: evidenceObservationIds,
    sourceObservations: args.sourceObservations,
    fieldName: `${candidatePath}.supporting_evidence_observation_ids`,
  });
  const adequacyFrame = recordValue(
    raw.adequacy_frame,
    `${candidatePath}.adequacy_frame`,
  );
  const materialKindRequirements = recordValue(
    adequacyFrame.material_kind_requirements,
    `${candidatePath}.adequacy_frame.material_kind_requirements`,
  );
  const targetMaterialKind = enumString(
    materialKindRequirements.target_material_kind,
    TARGET_MATERIAL_KINDS,
    `${candidatePath}.adequacy_frame.material_kind_requirements.target_material_kind`,
  );
  return {
    purpose_candidate_id: optionalString(raw.purpose_candidate_id) ??
      `purpose_candidate_${args.index + 1}`,
    statement: stringValue(raw.statement, `${candidatePath}.statement`),
    rank: enumString(
      raw.rank,
      ["primary", "secondary", "candidate", "rejected"] as const,
      `${candidatePath}.rank`,
    ),
    purpose_source_status: enumString(
      raw.purpose_source_status,
      [
        "explicit_source_declared",
        "convergent_inferred",
        "limitation_backed",
        "unresolved",
      ] as const,
      `${candidatePath}.purpose_source_status`,
    ),
    evidence_kind_refs: stringArray(
      raw.evidence_kind_refs,
      `${candidatePath}.evidence_kind_refs`,
    ).map((kind) =>
      enumString(
        kind,
        ["P1", "P2", "P3", "P4", "P5"] as const,
        `${candidatePath}.evidence_kind_refs[]`,
      )
    ),
    supporting_evidence_refs: supportingEvidenceRefs,
    contradicting_source_refs: stringArray(
      raw.contradicting_source_refs ?? [],
      `${candidatePath}.contradicting_source_refs`,
    ),
    adequacy_frame: {
      frame_id: stringValue(
        adequacyFrame.frame_id,
        `${candidatePath}.adequacy_frame.frame_id`,
      ),
      frame_kind: stringValue(
        adequacyFrame.frame_kind,
        `${candidatePath}.adequacy_frame.frame_kind`,
      ),
      frame_status: enumString(
        adequacyFrame.frame_status,
        [
          "source_declared",
          "evidence_inferred",
          "limitation_backed",
          "unresolved",
        ] as const,
        `${candidatePath}.adequacy_frame.frame_status`,
      ),
      adequacy_claim: stringValue(
        adequacyFrame.adequacy_claim,
        `${candidatePath}.adequacy_frame.adequacy_claim`,
      ),
      material_kind_requirements: {
        target_material_kind: targetMaterialKind,
        required_facets: stringArray(
          materialKindRequirements.required_facets,
          `${candidatePath}.adequacy_frame.material_kind_requirements.required_facets`,
        ),
        optional_facets: stringArray(
          materialKindRequirements.optional_facets ?? [],
          `${candidatePath}.adequacy_frame.material_kind_requirements.optional_facets`,
        ),
        rationale: stringValue(
          materialKindRequirements.rationale,
          `${candidatePath}.adequacy_frame.material_kind_requirements.rationale`,
        ),
      },
      required_elements: records(
        adequacyFrame.required_elements,
        `${candidatePath}.adequacy_frame.required_elements`,
      ).map((element, elementIndex) => {
        const elementPath =
          `${candidatePath}.adequacy_frame.required_elements[${elementIndex}]`;
        const elementEvidenceIds = stringArray(
          element.supporting_evidence_observation_ids ?? evidenceObservationIds,
          `${elementPath}.supporting_evidence_observation_ids`,
        );
        const supportingEvidenceRefs = evidenceRefsFromIds({
          observationIds: elementEvidenceIds,
          sourceObservations: args.sourceObservations,
          fieldName: `${elementPath}.supporting_evidence_observation_ids`,
        });
        const memberTargetMaterialKindRaw = optionalString(
          element.member_target_material_kind,
        );
        const authoredMemberScopeRefs = stringArray(
          element.member_scope_refs ?? [],
          `${elementPath}.member_scope_refs`,
        );
        const authoredMemberSourceRefs = stringArray(
          element.member_source_refs ?? [],
          `${elementPath}.member_source_refs`,
        );
        const authoredCrossMaterialRefRefs = stringArray(
          element.cross_material_ref_refs ?? [],
          `${elementPath}.cross_material_ref_refs`,
        );
        const derivedMemberTargetMaterialKind =
          derivedTargetMaterialKindFromEvidence(supportingEvidenceRefs);
        return {
          element_id: stringValue(element.element_id, `${elementPath}.element_id`),
          element_kind: stringValue(element.element_kind, `${elementPath}.element_kind`),
          material_facet_kind: stringValue(
            element.material_facet_kind,
            `${elementPath}.material_facet_kind`,
          ),
          description: stringValue(element.description, `${elementPath}.description`),
          actionability_surface_refs: stringArray(
            element.actionability_surface_refs,
            `${elementPath}.actionability_surface_refs`,
          ),
          maturity_dimension_refs: stringArray(
            element.maturity_dimension_refs,
            `${elementPath}.maturity_dimension_refs`,
          ),
          member_scope_refs: authoredMemberScopeRefs.length > 0
            ? authoredMemberScopeRefs
            : derivedMemberScopeRefsFromEvidence(supportingEvidenceRefs),
          member_target_material_kind: memberTargetMaterialKindRaw
            ? enumString(
              memberTargetMaterialKindRaw,
              TARGET_MATERIAL_KINDS,
              `${elementPath}.member_target_material_kind`,
            )
            : derivedMemberTargetMaterialKind,
          member_source_refs: authoredMemberSourceRefs.length > 0
            ? authoredMemberSourceRefs
            : uniqueEvidenceSourceRefs(supportingEvidenceRefs),
          cross_material_ref_refs: authoredCrossMaterialRefRefs.length > 0
            ? authoredCrossMaterialRefRefs
            : uniqueEvidenceSourceRefs(supportingEvidenceRefs),
          supporting_evidence_refs: supportingEvidenceRefs,
          expected_seed_ref_families: stringArray(
            element.expected_seed_ref_families,
            `${elementPath}.expected_seed_ref_families`,
          ),
          closure_expectation: enumString(
            element.closure_expectation,
            ["model_or_limit", "frontier_required"] as const,
            `${elementPath}.closure_expectation`,
          ),
        };
      }),
    },
    ranking_rationale: stringValue(
      raw.ranking_rationale,
      `${candidatePath}.ranking_rationale`,
    ),
    limitation_refs: stringArray(
      raw.limitation_refs ?? [],
      `${candidatePath}.limitation_refs`,
    ),
  };
}

function uniqueEvidenceSourceRefs(
  evidenceRefs: ReconstructEvidenceRef[],
): string[] {
  return [...new Set(evidenceRefs.map((ref) => ref.source_ref))];
}

function derivedMemberScopeRefsFromEvidence(
  evidenceRefs: ReconstructEvidenceRef[],
): string[] {
  return [
    ...new Set(evidenceRefs.map((ref) => `observation:${ref.observation_id}`)),
  ];
}

function derivedTargetMaterialKindFromEvidence(
  evidenceRefs: ReconstructEvidenceRef[],
): TargetMaterialKind | null {
  const kinds = [...new Set(evidenceRefs.map((ref) => ref.target_material_kind))];
  if (kinds.length === 0) return null;
  return kinds.length === 1 ? kinds[0]! : "mixed";
}

export function candidateInventoryItemFromLlm(args: {
  raw: Record<string, unknown>;
  index: number;
  sourceObservations: ReconstructSourceObservationsArtifact;
}): ReconstructCandidateInventoryArtifact["candidates"][number] {
  const fieldName = `candidates[${args.index}]`;
  const candidateId = stringValue(args.raw.candidate_id, `${fieldName}.candidate_id`);
  return {
    candidate_id: candidateId,
    candidate_kind: stringValue(args.raw.candidate_kind, `${fieldName}.candidate_kind`),
    name: stringValue(args.raw.name, `${fieldName}.name`),
    description: stringValue(args.raw.description, `${fieldName}.description`),
    salience: enumString(args.raw.salience, ["high", "medium", "low"], `${fieldName}.salience`),
    evidence_refs: evidenceRefsFromIds({
      observationIds: stringArray(
        args.raw.evidence_observation_ids,
        `${fieldName}.evidence_observation_ids`,
      ),
      sourceObservations: args.sourceObservations,
      fieldName: `${fieldName}.evidence_observation_ids`,
    }),
  };
}

export function candidateDispositionItemFromLlm(args: {
  raw: Record<string, unknown>;
  index: number;
  sourceObservations: ReconstructSourceObservationsArtifact;
}): ReconstructCandidateDispositionArtifact["dispositions"][number] {
  const fieldName = `dispositions[${args.index}]`;
  return {
    candidate_id: stringValue(args.raw.candidate_id, `${fieldName}.candidate_id`),
    disposition_id: stringValue(args.raw.disposition_id, `${fieldName}.disposition_id`),
    target_seed_refs: stringArray(args.raw.target_seed_refs, `${fieldName}.target_seed_refs`),
    rationale: stringValue(args.raw.rationale, `${fieldName}.rationale`),
    evidence_refs: evidenceRefsFromIds({
      observationIds: stringArray(
        args.raw.evidence_observation_ids,
        `${fieldName}.evidence_observation_ids`,
      ),
      sourceObservations: args.sourceObservations,
      fieldName: `${fieldName}.evidence_observation_ids`,
    }),
  };
}
