import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  isTargetMaterialKind,
  type TargetMaterialKind,
} from "../target-material-kind.js";
import type {
  ReconstructEvidenceRef,
  ReconstructSeedCandidateArtifact,
  ReconstructSeedCandidateValidationArtifact,
  ReconstructSeedCandidateValidationViolation,
  ReconstructSeedClaim,
  ReconstructSourceObservationDirectiveArtifact,
  ReconstructSourceObservationDirectiveValidationArtifact,
  ReconstructSourceObservationsArtifact,
} from "./artifact-types.js";
import type { ReconstructSourceObservation } from "./source-observations.js";

export interface ValidateSeedCandidateParams {
  seedCandidate: ReconstructSeedCandidateArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
  sourceObservationDirective?: ReconstructSourceObservationDirectiveArtifact | null;
  sourceObservationDirectiveValidation?: ReconstructSourceObservationDirectiveValidationArtifact | null;
  seedCandidateRef?: string | null;
  sourceObservationsRef?: string | null;
  sourceObservationDirectiveRef?: string | null;
  sourceObservationDirectiveValidationRef?: string | null;
}

function isoNow(): string {
  return new Date().toISOString();
}

function normalizeRef(ref: string): string {
  return path.resolve(ref);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function violation(args: {
  code: ReconstructSeedCandidateValidationViolation["code"];
  message: string;
  claimId?: string | null;
  observationId?: string | null;
}): ReconstructSeedCandidateValidationViolation {
  return {
    code: args.code,
    message: args.message,
    claim_id: args.claimId ?? null,
    observation_id: args.observationId ?? null,
  };
}

function malformedShape(message: string): ReconstructSeedCandidateValidationViolation {
  return violation({
    code: "schema_shape_invalid",
    message,
  });
}

function readEvidenceRef(
  value: unknown,
  claimId: string | null,
): {
  evidenceRef: ReconstructEvidenceRef | null;
  violations: ReconstructSeedCandidateValidationViolation[];
} {
  const violations: ReconstructSeedCandidateValidationViolation[] = [];
  if (!isRecord(value)) {
    return {
      evidenceRef: null,
      violations: [
        violation({
          code: "evidence_ref_shape_invalid",
          message: "evidence_ref must be an object",
          claimId,
        }),
      ],
    };
  }

  const observationId = value.observation_id;
  const targetMaterialKind = value.target_material_kind;
  const sourceRef = value.source_ref;
  const location = value.location;
  if (typeof observationId !== "string" || observationId.trim().length === 0) {
    violations.push(violation({
      code: "evidence_ref_shape_invalid",
      message: "evidence_ref.observation_id is required",
      claimId,
    }));
  }
  if (
    typeof targetMaterialKind !== "string" ||
    !isTargetMaterialKind(targetMaterialKind)
  ) {
    violations.push(violation({
      code: "evidence_ref_shape_invalid",
      message: "evidence_ref.target_material_kind must be a known target_material_kind",
      claimId,
      observationId: typeof observationId === "string" ? observationId : null,
    }));
  }
  if (typeof sourceRef !== "string" || sourceRef.trim().length === 0) {
    violations.push(violation({
      code: "evidence_ref_shape_invalid",
      message: "evidence_ref.source_ref is required",
      claimId,
      observationId: typeof observationId === "string" ? observationId : null,
    }));
  }
  if (typeof location !== "string" || location.trim().length === 0) {
    violations.push(violation({
      code: "evidence_ref_shape_invalid",
      message: "evidence_ref.location is required",
      claimId,
      observationId: typeof observationId === "string" ? observationId : null,
    }));
  }

  if (violations.length > 0) {
    return {
      evidenceRef: null,
      violations,
    };
  }

  return {
    evidenceRef: {
      observation_id: observationId as string,
      target_material_kind: targetMaterialKind as TargetMaterialKind,
      source_ref: sourceRef as string,
      location: location as string,
    },
    violations,
  };
}

function isGenericClaimName(name: string, groupName: string): boolean {
  const normalized = name.trim().toLowerCase().replace(/[_\s-]+/g, "_");
  const singularGroup = groupName.endsWith("ies")
    ? groupName.slice(0, -3) + "y"
    : groupName.endsWith("s")
      ? groupName.slice(0, -1)
      : groupName;
  const normalizedGroup = singularGroup.toLowerCase().replace(/[_\s-]+/g, "_");
  return new RegExp(`^${normalizedGroup}_?\\d+$`).test(normalized);
}

function readClaim(
  value: unknown,
  groupName: string,
): {
  claim: ReconstructSeedClaim | null;
  violations: ReconstructSeedCandidateValidationViolation[];
} {
  const violations: ReconstructSeedCandidateValidationViolation[] = [];
  if (!isRecord(value)) {
    return {
      claim: null,
      violations: [malformedShape(`${groupName} claim must be an object`)],
    };
  }

  const rawClaimId = value.claim_id;
  const claimId =
    typeof rawClaimId === "string" && rawClaimId.trim().length > 0
      ? rawClaimId
      : null;
  if (!claimId) {
    violations.push(violation({
      code: "claim_id_missing",
      message: `${groupName} claim_id is required`,
    }));
  }

  const rawName = value.name;
  const name = typeof rawName === "string" && rawName.trim().length > 0
    ? rawName.trim()
    : null;
  if (!name) {
    violations.push(violation({
      code: "claim_name_missing",
      message: `${groupName} name is required`,
      claimId,
    }));
  } else if (isGenericClaimName(name, groupName)) {
    violations.push(violation({
      code: "claim_name_generic",
      message: `${groupName} name must be a meaningful user-facing label, not a numbered placeholder`,
      claimId,
    }));
  }

  const rawStatement = value.statement;
  const statement = typeof rawStatement === "string" ? rawStatement : "";
  const rawEvidenceRefs = value.evidence_refs;
  const evidenceRefs: ReconstructEvidenceRef[] = [];
  if (Array.isArray(rawEvidenceRefs)) {
    for (const evidenceRefValue of rawEvidenceRefs) {
      const parsed = readEvidenceRef(evidenceRefValue, claimId);
      violations.push(...parsed.violations);
      if (parsed.evidenceRef) {
        evidenceRefs.push(parsed.evidenceRef);
      }
    }
  }

  return {
    claim: {
      claim_id: claimId ?? `${groupName}:missing-claim-id`,
      name: name ?? "",
      statement,
      evidence_refs: evidenceRefs,
    },
    violations,
  };
}

function collectClaims(seedCandidate: ReconstructSeedCandidateArtifact): {
  claims: ReconstructSeedClaim[];
  violations: ReconstructSeedCandidateValidationViolation[];
} {
  const claims: ReconstructSeedClaim[] = [];
  const violations: ReconstructSeedCandidateValidationViolation[] = [];
  const raw = seedCandidate as unknown;
  if (!isRecord(raw)) {
    return {
      claims,
      violations: [malformedShape("SeedCandidateDirective must be an object")],
    };
  }

  const purpose = readClaim(raw.purpose, "purpose");
  violations.push(...purpose.violations);
  if (purpose.claim) claims.push(purpose.claim);

  const arrayGroups = [
    "non_goals",
    "entities",
    "relations",
    "actions",
    "properties",
    "rules",
  ];
  for (const groupName of arrayGroups) {
    const value = raw[groupName];
    if (!Array.isArray(value)) {
      violations.push(malformedShape(`${groupName} must be an array`));
      continue;
    }
    for (const claimValue of value) {
      const parsed = readClaim(claimValue, groupName);
      violations.push(...parsed.violations);
      if (parsed.claim) claims.push(parsed.claim);
    }
  }

  return { claims, violations };
}

function validateEvidenceRef(args: {
  claim: ReconstructSeedClaim;
  evidenceRef: ReconstructEvidenceRef;
  observation: ReconstructSourceObservation | undefined;
  selectedObservationIds: Set<string> | null;
}): ReconstructSeedCandidateValidationViolation[] {
  const violations: ReconstructSeedCandidateValidationViolation[] = [];
  const { claim, evidenceRef, observation, selectedObservationIds } = args;
  if (!observation) {
    violations.push(violation({
      code: "unknown_observation_ref",
      message: `evidence observation does not exist: ${evidenceRef.observation_id}`,
      claimId: claim.claim_id,
      observationId: evidenceRef.observation_id,
    }));
    return violations;
  }

  if (
    selectedObservationIds &&
    !selectedObservationIds.has(evidenceRef.observation_id)
  ) {
    violations.push(violation({
      code: "unselected_observation_ref",
      message:
        `evidence observation was not selected by SourceObservationDirective: ${evidenceRef.observation_id}`,
      claimId: claim.claim_id,
      observationId: evidenceRef.observation_id,
    }));
  }
  if (evidenceRef.target_material_kind !== observation.target_material_kind) {
    violations.push(violation({
      code: "material_kind_mismatch",
      message:
        `evidence material kind ${evidenceRef.target_material_kind} does not match observation material kind ${observation.target_material_kind}`,
      claimId: claim.claim_id,
      observationId: evidenceRef.observation_id,
    }));
  }
  if (normalizeRef(evidenceRef.source_ref) !== normalizeRef(observation.source_ref)) {
    violations.push(violation({
      code: "source_ref_mismatch",
      message: "evidence source_ref does not match observation source_ref",
      claimId: claim.claim_id,
      observationId: evidenceRef.observation_id,
    }));
  }
  if (evidenceRef.location !== observation.location) {
    violations.push(violation({
      code: "location_mismatch",
      message: "evidence location does not match observation location",
      claimId: claim.claim_id,
      observationId: evidenceRef.observation_id,
    }));
  }
  return violations;
}

export function validateSeedCandidate(
  params: ValidateSeedCandidateParams,
): ReconstructSeedCandidateValidationArtifact {
  const violations: ReconstructSeedCandidateValidationViolation[] = [];
  const {
    seedCandidate,
    sourceObservations,
    sourceObservationDirective,
    sourceObservationDirectiveValidation,
  } = params;
  const seedCandidateSessionId =
    typeof (seedCandidate as { session_id?: unknown }).session_id === "string"
      ? seedCandidate.session_id
      : "";
  if (seedCandidateSessionId.length === 0) {
    violations.push(malformedShape("SeedCandidateDirective.session_id is required"));
  }

  if (seedCandidateSessionId !== sourceObservations.session_id) {
    violations.push(violation({
      code: "session_id_mismatch",
      message:
        `seed candidate session_id ${seedCandidateSessionId} does not match source observations session_id ${sourceObservations.session_id}`,
    }));
  }
  if (
    sourceObservationDirective &&
    seedCandidateSessionId !== sourceObservationDirective.session_id
  ) {
    violations.push(violation({
      code: "session_id_mismatch",
      message:
        `seed candidate session_id ${seedCandidateSessionId} does not match source observation directive session_id ${sourceObservationDirective.session_id}`,
    }));
  }
  if (
    sourceObservationDirectiveValidation &&
    seedCandidateSessionId !== sourceObservationDirectiveValidation.session_id
  ) {
    violations.push(violation({
      code: "session_id_mismatch",
      message:
        `seed candidate session_id ${seedCandidateSessionId} does not match source observation directive validation session_id ${sourceObservationDirectiveValidation.session_id}`,
    }));
  }
  if (
    sourceObservationDirectiveValidation &&
    sourceObservationDirectiveValidation.validation_status !== "valid"
  ) {
    violations.push(violation({
      code: "prior_observation_directive_invalid",
      message: "SourceObservationDirective validation must be valid before SeedCandidate validation",
    }));
  }

  const observationsById = new Map(
    sourceObservations.observations.map((observation) => [
      observation.observation_id,
      observation,
    ]),
  );
  let selectedObservationIds: Set<string> | null = null;
  if (sourceObservationDirective) {
    const selectedObservations =
      (sourceObservationDirective as { selected_observations?: unknown }).selected_observations;
    if (!Array.isArray(selectedObservations)) {
      violations.push(malformedShape(
        "SourceObservationDirective.selected_observations must be an array when supplied",
      ));
    } else {
      selectedObservationIds = new Set(
        selectedObservations
          .filter((selection): selection is { observation_id: string } =>
            isRecord(selection) && typeof selection.observation_id === "string",
          )
          .map((selection) => selection.observation_id),
      );
    }
  }
  const seenClaimIds = new Set<string>();
  const collectedClaims = collectClaims(seedCandidate);
  violations.push(...collectedClaims.violations);
  const claims = collectedClaims.claims;
  let evidenceRefCount = 0;

  for (const claim of claims) {
    if (seenClaimIds.has(claim.claim_id)) {
      violations.push(violation({
        code: "duplicate_claim_id",
        message: `duplicate semantic claim id: ${claim.claim_id}`,
        claimId: claim.claim_id,
      }));
    }
    seenClaimIds.add(claim.claim_id);

    if (claim.statement.trim().length === 0) {
      violations.push(violation({
        code: "claim_statement_missing",
        message: "claim statement is required",
        claimId: claim.claim_id,
      }));
    }
    if (claim.evidence_refs.length === 0) {
      violations.push(violation({
        code: "claim_evidence_missing",
        message: "every semantic claim must cite at least one evidence ref",
        claimId: claim.claim_id,
      }));
      continue;
    }

    for (const evidenceRef of claim.evidence_refs) {
      evidenceRefCount += 1;
      violations.push(
        ...validateEvidenceRef({
          claim,
          evidenceRef,
          observation: observationsById.get(evidenceRef.observation_id),
          selectedObservationIds,
        }),
      );
    }
  }

  return {
    schema_version: "1",
    session_id: seedCandidateSessionId,
    created_at: isoNow(),
    seed_candidate_ref: params.seedCandidateRef ?? null,
    source_observations_ref: params.sourceObservationsRef ?? null,
    source_observation_directive_ref:
      params.sourceObservationDirectiveRef ?? null,
    source_observation_directive_validation_ref:
      params.sourceObservationDirectiveValidationRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    semantic_claim_count: claims.length,
    evidence_ref_count: evidenceRefCount,
    validation_results: violations.length === 0
      ? ["seed_candidate_evidence_valid"]
      : ["seed_candidate_evidence_invalid"],
    violations,
  };
}

export async function writeSeedCandidateValidationArtifact(args: {
  seedCandidatePath: string;
  sourceObservationsPath: string;
  outputPath: string;
  sourceObservationDirectivePath?: string;
  sourceObservationDirectiveValidationPath?: string;
}): Promise<ReconstructSeedCandidateValidationArtifact> {
  const [seedCandidateText, sourceObservationsText] = await Promise.all([
    fs.readFile(args.seedCandidatePath, "utf8"),
    fs.readFile(args.sourceObservationsPath, "utf8"),
  ]);
  const seedCandidate = parseYaml(seedCandidateText) as ReconstructSeedCandidateArtifact;
  const sourceObservations = parseYaml(sourceObservationsText) as ReconstructSourceObservationsArtifact;
  const sourceObservationDirective = args.sourceObservationDirectivePath
    ? parseYaml(
        await fs.readFile(args.sourceObservationDirectivePath, "utf8"),
      ) as ReconstructSourceObservationDirectiveArtifact
    : null;
  const sourceObservationDirectiveValidation =
    args.sourceObservationDirectiveValidationPath
      ? parseYaml(
          await fs.readFile(args.sourceObservationDirectiveValidationPath, "utf8"),
        ) as ReconstructSourceObservationDirectiveValidationArtifact
      : null;

  const validation = validateSeedCandidate({
    seedCandidate,
    sourceObservations,
    sourceObservationDirective,
    sourceObservationDirectiveValidation,
    seedCandidateRef: path.resolve(args.seedCandidatePath),
    sourceObservationsRef: path.resolve(args.sourceObservationsPath),
    sourceObservationDirectiveRef: args.sourceObservationDirectivePath
      ? path.resolve(args.sourceObservationDirectivePath)
      : null,
    sourceObservationDirectiveValidationRef:
      args.sourceObservationDirectiveValidationPath
        ? path.resolve(args.sourceObservationDirectiveValidationPath)
        : null,
  });
  await fs.mkdir(path.dirname(args.outputPath), { recursive: true });
  await fs.writeFile(args.outputPath, stringifyYaml(validation), "utf8");
  return validation;
}
