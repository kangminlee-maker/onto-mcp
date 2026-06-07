import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type {
  ReconstructClaimProjectionActionabilityClaim,
  ReconstructClaimProjectionArtifact,
  ReconstructClaimProjectionDecisionState,
  ReconstructClaimProjectionLevel,
  ReconstructClaimProjectionRow,
  ReconstructClaimProjectionSurface,
  ReconstructClaimProjectionValidationArtifact,
  ReconstructClaimProjectionValidationViolation,
  ReconstructHandoffDecisionValidationArtifact,
  ReconstructMaterialAdmissionLedgerValidationArtifact,
  ReconstructMaturationContinuationDecisionArtifact,
  ReconstructMaturationContinuationDecisionValidationArtifact,
  ReconstructRecordValidationStatusProjection,
  ReconstructRegistryVerificationEvidenceValidationArtifact,
  ReconstructRunControlValidationArtifact,
  ReconstructRunManifestArtifact,
  ReconstructSourceSafetyLedgerValidationArtifact,
  ReconstructTargetMaterialProfileArtifact,
  ReconstructTargetMaterialProfileValidationArtifact,
} from "./artifact-types.js";
import type { TargetMaterialKind } from "../target-material-kind.js";

const PROJECTION_SURFACES: readonly ReconstructClaimProjectionSurface[] = [
  "status",
  "result",
  "final_output",
  "mcp",
  "api",
  "handoff",
  "material_kind_support",
];

const CLAIM_LEVELS: readonly ReconstructClaimProjectionLevel[] = [
  "not_applicable",
  "seed_candidate",
  "seed_valid_for_maturation",
  "maturation_minimum_executable",
  "maturation_in_progress",
  "actionable_limited",
  "actionable_ready",
  "blocked",
];

const DECISION_STATES: readonly ReconstructClaimProjectionDecisionState[] = [
  "continue",
  "ask_user",
  "blocked",
  "actionable_limited",
  "actionable_ready",
  "not_applicable",
];

const ACTIONABILITY_CLAIMS: readonly ReconstructClaimProjectionActionabilityClaim[] = [
  "none",
  "limited",
  "ready",
];

const CLAIM_STRENGTH: Record<ReconstructClaimProjectionLevel, number> = {
  not_applicable: -1,
  blocked: 0,
  seed_candidate: 1,
  seed_valid_for_maturation: 2,
  maturation_minimum_executable: 3,
  maturation_in_progress: 4,
  actionable_limited: 5,
  actionable_ready: 6,
};

function isoNow(): string {
  return new Date().toISOString();
}

async function readYamlDocument<T>(filePath: string): Promise<T> {
  return parseYaml(await fs.readFile(filePath, "utf8")) as T;
}

async function writeYamlDocument(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, stringifyYaml(value), "utf8");
}

function statusOf(
  validation: { validation_status: "valid" | "invalid" } | null | undefined,
): ReconstructRecordValidationStatusProjection {
  return validation?.validation_status ?? "not_available";
}

function claimFromDecision(args: {
  handoffDecisionValidation: ReconstructHandoffDecisionValidationArtifact;
  targetMaterialProfileValidation:
    ReconstructTargetMaterialProfileValidationArtifact;
  maturationContinuationDecision:
    ReconstructMaturationContinuationDecisionArtifact;
  maturationContinuationDecisionValidation:
    ReconstructMaturationContinuationDecisionValidationArtifact;
  sourceSafetyLedgerValidation: ReconstructSourceSafetyLedgerValidationArtifact;
  materialAdmissionLedgerValidation:
    ReconstructMaterialAdmissionLedgerValidationArtifact;
  runControlValidation: ReconstructRunControlValidationArtifact;
  registryVerificationEvidenceValidation:
    ReconstructRegistryVerificationEvidenceValidationArtifact;
}): {
  claimLevel: ReconstructClaimProjectionLevel;
  decisionState: ReconstructClaimProjectionDecisionState;
  actionabilityClaim: ReconstructClaimProjectionActionabilityClaim;
  machineStatus: string;
  displayLabel: string;
} {
  const requiredStatuses = [
    statusOf(args.handoffDecisionValidation),
    statusOf(args.targetMaterialProfileValidation),
    statusOf(args.maturationContinuationDecisionValidation),
    statusOf(args.sourceSafetyLedgerValidation),
    statusOf(args.materialAdmissionLedgerValidation),
    statusOf(args.runControlValidation),
    statusOf(args.registryVerificationEvidenceValidation),
  ];
  if (requiredStatuses.some((status) => status !== "valid")) {
    return {
      claimLevel: "blocked",
      decisionState: "blocked",
      actionabilityClaim: "none",
      machineStatus: "blocked",
      displayLabel: "Blocked",
    };
  }
  switch (args.maturationContinuationDecisionValidation.decision_state) {
    case "actionable_ready":
      return {
        claimLevel: "actionable_ready",
        decisionState: "actionable_ready",
        actionabilityClaim: "ready",
        machineStatus: "actionable_ready",
        displayLabel: "Actionable Ready",
      };
    case "actionable_limited":
      return {
        claimLevel: "actionable_limited",
        decisionState: "actionable_limited",
        actionabilityClaim: "limited",
        machineStatus: "actionable_limited",
        displayLabel: "Actionable Limited",
      };
    case "blocked":
      return {
        claimLevel: "blocked",
        decisionState: "blocked",
        actionabilityClaim: "none",
        machineStatus: "blocked",
        displayLabel: "Blocked",
      };
    case "ask_user":
      return {
        claimLevel: "maturation_in_progress",
        decisionState: "ask_user",
        actionabilityClaim: "none",
        machineStatus: "ask_user",
        displayLabel: "Needs User Authority",
      };
    case "continue":
      return {
        claimLevel: "maturation_in_progress",
        decisionState: "continue",
        actionabilityClaim: "none",
        machineStatus: "continue",
        displayLabel: "Maturation In Progress",
      };
  }
}

function materialKindSupportClaim(
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact,
  targetMaterialProfileValidation:
    ReconstructTargetMaterialProfileValidationArtifact,
  targetMaterialKind: TargetMaterialKind,
): ReconstructClaimProjectionRow["member_capability_rows"][number]["support_claim"] {
  if (targetMaterialProfileValidation.validation_status !== "valid") {
    return "unsupported";
  }
  const hasSelectedProfileForKind =
    targetMaterialProfile.selected_source_profiles.some((profile) =>
      profile.target_material_kind === targetMaterialKind
    );
  if (
    (
      targetMaterialProfile.support_status === "supported" ||
      targetMaterialProfile.support_status === "partial" ||
      targetMaterialProfile.support_status === "supported_composite" ||
      targetMaterialProfile.support_status === "partial_composite"
    ) &&
    hasSelectedProfileForKind
  ) {
    return "profile_supported";
  }
  return "unsupported";
}

function supportLimitationRefs(args: {
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact;
  targetMaterialProfileValidation:
    ReconstructTargetMaterialProfileValidationArtifact;
  targetMaterialKind: TargetMaterialKind;
  supportClaim: ReconstructClaimProjectionRow["member_capability_rows"][number]["support_claim"];
}): string[] {
  if (args.supportClaim !== "unsupported") return [];
  if (args.targetMaterialProfileValidation.validation_status !== "valid") {
    return ["target-material-profile-validation:invalid"];
  }
  if (args.targetMaterialProfile.unsupported_reason) {
    return [args.targetMaterialProfile.unsupported_reason];
  }
  return [`material-kind-support:${args.targetMaterialKind}:source-profile-missing`];
}

function selectedSourceProfileForKind(
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact,
  targetMaterialKind: TargetMaterialKind,
): ReconstructTargetMaterialProfileArtifact["selected_source_profiles"][number] | null {
  return targetMaterialProfile.selected_source_profiles.find((profile) =>
    profile.target_material_kind === targetMaterialKind
  ) ?? null;
}

function materialKindSupportMemberRows(
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact,
  targetMaterialProfileValidation:
    ReconstructTargetMaterialProfileValidationArtifact,
): ReconstructClaimProjectionRow["member_capability_rows"] {
  const perRefKind = new Map(targetMaterialProfile.detection.per_ref.map((detection) => [
    path.resolve(detection.ref),
    detection.kind,
  ]));
  const useDetectedMembers =
    (
      targetMaterialProfile.target_material_kind === "mixed" ||
      targetMaterialProfile.support_status === "supported_composite" ||
      targetMaterialProfile.support_status === "partial_composite"
    ) &&
    targetMaterialProfile.detection.per_ref.length > 0;
  const members = useDetectedMembers
    ? targetMaterialProfile.detection.per_ref.map((detection) => ({
      memberId: detection.ref,
      targetMaterialKind: detection.kind,
    }))
    : targetMaterialProfile.target_refs.map((targetRef) => ({
      memberId: targetRef,
      targetMaterialKind:
        perRefKind.get(path.resolve(targetRef)) ??
          targetMaterialProfile.target_material_kind,
    }));
	  return members.map((member) => {
	    const selectedProfile = selectedSourceProfileForKind(
	      targetMaterialProfile,
	      member.targetMaterialKind,
	    );
	    const supportClaim = materialKindSupportClaim(
	      targetMaterialProfile,
	      targetMaterialProfileValidation,
	      member.targetMaterialKind,
	    );
	    const limitationRefs = supportLimitationRefs({
	      targetMaterialProfile,
	      targetMaterialProfileValidation,
	      targetMaterialKind: member.targetMaterialKind,
	      supportClaim,
	    });
	    return {
	      member_id: member.memberId,
	      target_ref: member.memberId,
	      target_material_kind: member.targetMaterialKind,
	      selected_source_profile_id: selectedProfile?.profile_id ?? null,
	      selected_source_profile_ref: selectedProfile?.profile_ref ?? null,
	      selected_source_profile_definition_sha256:
	        selectedProfile?.definition_sha256 ?? null,
	      member_source_refs: [member.memberId],
	      validation_ref:
	        targetMaterialProfileValidation.target_material_profile_ref ?? null,
	      support_claim: supportClaim,
	      readiness_effect: supportClaim === "profile_supported" ? "supported" : "blocked",
	      next_action: supportClaim === "profile_supported"
	        ? "Preserve the selected source profile lineage for this member."
	        : "Add or implement a selected source profile for this member kind before claiming support.",
	      limitation_refs: limitationRefs,
	    };
	  });
}

function materialKindSupportProjectionStatus(
  memberRows: ReconstructClaimProjectionRow["member_capability_rows"],
): {
  displayLabel: string;
  machineStatus: string;
  limitationRefs: string[];
} {
  const unsupportedRows = memberRows.filter((row) =>
    row.support_claim === "unsupported"
  );
  const limitationRefs = sortedUnique(
    memberRows.flatMap((row) => row.limitation_refs),
  );
  if (memberRows.length > 0 && unsupportedRows.length === 0) {
    return {
      displayLabel: "Material Kind Profile Supported",
      machineStatus: "profile_supported",
      limitationRefs,
    };
  }
  if (unsupportedRows.length > 0 && unsupportedRows.length < memberRows.length) {
    return {
      displayLabel: "Partial Material Kind Profile Support",
      machineStatus: "partial_profile_supported",
      limitationRefs,
    };
  }
  return {
    displayLabel: "Material Kind Unsupported",
    machineStatus: "unsupported",
    limitationRefs,
  };
}

function blockedLimitationRefs(
  decision: ReconstructMaturationContinuationDecisionArtifact,
  invalidValidationRefs: string[],
): string[] {
  const refs = [
    ...decision.limitation_refs,
    ...decision.blocking_row_refs,
    ...invalidValidationRefs,
  ];
  return refs.length > 0
    ? refs
    : ["claim-projection:missing-required-validation"];
}

export function buildClaimProjectionArtifact(args: {
  sessionId: string;
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact;
  targetMaterialProfileRef: string;
  targetMaterialProfileValidation:
    ReconstructTargetMaterialProfileValidationArtifact;
  targetMaterialProfileValidationRef: string;
  handoffDecisionValidation: ReconstructHandoffDecisionValidationArtifact;
  handoffDecisionValidationRef: string;
  sourceSafetyLedgerValidation:
    ReconstructSourceSafetyLedgerValidationArtifact;
  sourceSafetyLedgerValidationRef: string;
  materialAdmissionLedgerValidation:
    ReconstructMaterialAdmissionLedgerValidationArtifact;
  materialAdmissionLedgerValidationRef: string;
  runControlValidation: ReconstructRunControlValidationArtifact;
  runControlValidationRef: string;
  registryVerificationEvidenceValidation:
    ReconstructRegistryVerificationEvidenceValidationArtifact;
  registryVerificationEvidenceValidationRef: string;
  maturationContinuationDecision:
    ReconstructMaturationContinuationDecisionArtifact;
  maturationContinuationDecisionRef: string;
  maturationContinuationDecisionValidation:
    ReconstructMaturationContinuationDecisionValidationArtifact;
  maturationContinuationDecisionValidationRef: string;
  reconstructRunManifestRef: string;
  registryRef: string;
}): ReconstructClaimProjectionArtifact {
  const claim = claimFromDecision({
    handoffDecisionValidation: args.handoffDecisionValidation,
    targetMaterialProfileValidation: args.targetMaterialProfileValidation,
    maturationContinuationDecision: args.maturationContinuationDecision,
    maturationContinuationDecisionValidation:
      args.maturationContinuationDecisionValidation,
    sourceSafetyLedgerValidation: args.sourceSafetyLedgerValidation,
    materialAdmissionLedgerValidation: args.materialAdmissionLedgerValidation,
    runControlValidation: args.runControlValidation,
    registryVerificationEvidenceValidation:
      args.registryVerificationEvidenceValidation,
  });
  const now = isoNow();
  const memberCapabilityRows = materialKindSupportMemberRows(
    args.targetMaterialProfile,
    args.targetMaterialProfileValidation,
  );
  const requiredValidationRefs = [
    args.handoffDecisionValidationRef,
    args.targetMaterialProfileValidationRef,
    args.runControlValidationRef,
    args.registryVerificationEvidenceValidationRef,
    args.sourceSafetyLedgerValidationRef,
    args.materialAdmissionLedgerValidationRef,
    args.maturationContinuationDecisionValidationRef,
  ];
  const requiredValidationStatuses = [
    {
      ref: args.handoffDecisionValidationRef,
      status: statusOf(args.handoffDecisionValidation),
    },
    {
      ref: args.targetMaterialProfileValidationRef,
      status: statusOf(args.targetMaterialProfileValidation),
    },
    {
      ref: args.runControlValidationRef,
      status: statusOf(args.runControlValidation),
    },
    {
      ref: args.registryVerificationEvidenceValidationRef,
      status: statusOf(args.registryVerificationEvidenceValidation),
    },
    {
      ref: args.sourceSafetyLedgerValidationRef,
      status: statusOf(args.sourceSafetyLedgerValidation),
    },
    {
      ref: args.materialAdmissionLedgerValidationRef,
      status: statusOf(args.materialAdmissionLedgerValidation),
    },
    {
      ref: args.maturationContinuationDecisionValidationRef,
      status: statusOf(args.maturationContinuationDecisionValidation),
    },
  ];
  const invalidValidationRefs = requiredValidationStatuses
    .filter((item) => item.status !== "valid")
    .map((item) => item.ref);
  const baseMaterialKindStatus =
    materialKindSupportProjectionStatus(memberCapabilityRows);
  const materialKindStatus = invalidValidationRefs.length > 0
    ? {
      displayLabel: "Material Kind Support Blocked",
      machineStatus: "blocked",
      limitationRefs: sortedUnique([
        ...baseMaterialKindStatus.limitationRefs,
        ...invalidValidationRefs,
      ]),
    }
    : baseMaterialKindStatus;
  const rows: ReconstructClaimProjectionRow[] = PROJECTION_SURFACES.map((surface) => ({
    projection_id: `claim-projection:${surface}`,
    projection_surface: surface,
    claim_level: surface === "material_kind_support"
      ? "not_applicable"
      : claim.claimLevel,
    decision_state: surface === "material_kind_support"
      ? "not_applicable"
      : claim.decisionState,
    actionability_claim: surface === "material_kind_support"
      ? "none"
      : claim.actionabilityClaim,
    material_kind_capability_refs: [args.targetMaterialProfileRef],
    governance_scope: {
      reconstruct_run_level: "included",
      operated_system_release_health: "out_of_scope",
      rollback_quota_incident_governance: "out_of_scope",
    },
    member_capability_rows: memberCapabilityRows,
    included_row_refs:
      surface === "material_kind_support"
        ? []
        : args.maturationContinuationDecision.claim_scope.included_row_refs,
    excluded_row_refs:
      surface === "material_kind_support"
        ? []
        : args.maturationContinuationDecision.claim_scope.excluded_row_refs,
    required_validation_refs: requiredValidationRefs,
    registry_evidence_refs: [args.registryRef],
    display_label: surface === "material_kind_support"
      ? materialKindStatus.displayLabel
      : claim.displayLabel,
    machine_status: surface === "material_kind_support"
      ? materialKindStatus.machineStatus
      : claim.machineStatus,
    timestamp: {
      value: now,
      timezone: "UTC",
      source_ref: "runtime_clock",
    },
    locale_context: {
      locale: "en-US",
      value_format_refs: [],
    },
    limitation_refs: surface === "material_kind_support"
      ? materialKindStatus.limitationRefs
      : claim.claimLevel === "blocked"
      ? blockedLimitationRefs(
        args.maturationContinuationDecision,
        invalidValidationRefs,
      )
      : args.maturationContinuationDecision.limitation_refs,
  }));
  return {
    schema_version: "1",
    session_id: args.sessionId,
    created_at: now,
    source_authority_refs: [
      args.targetMaterialProfileRef,
      args.targetMaterialProfileValidationRef,
      args.handoffDecisionValidationRef,
      args.runControlValidationRef,
      args.registryVerificationEvidenceValidationRef,
      args.sourceSafetyLedgerValidationRef,
      args.materialAdmissionLedgerValidationRef,
      args.maturationContinuationDecisionRef,
      args.maturationContinuationDecisionValidationRef,
      args.reconstructRunManifestRef,
      args.registryRef,
    ],
    projection_rows: rows,
  };
}

function violation(args: {
  code: ReconstructClaimProjectionValidationViolation["code"];
  message: string;
  projectionId?: string | null;
}): ReconstructClaimProjectionValidationViolation {
  return {
    code: args.code,
    message: args.message,
    projection_id: args.projectionId ?? null,
  };
}

function strongestClaimLevel(
  rows: ReconstructClaimProjectionRow[],
): ReconstructClaimProjectionLevel {
  return rows.reduce<ReconstructClaimProjectionLevel>((strongest, row) =>
    CLAIM_STRENGTH[row.claim_level] > CLAIM_STRENGTH[strongest]
      ? row.claim_level
      : strongest, "blocked");
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function duplicateIds(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function sameStringSet(left: string[], right: string[]): boolean {
  return sortedUnique(left).join("\n") === sortedUnique(right).join("\n");
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function validateClaimProjection(args: {
  claimProjection: ReconstructClaimProjectionArtifact;
  claimProjectionRef?: string | null;
  targetMaterialProfile?: ReconstructTargetMaterialProfileArtifact | null;
  targetMaterialProfileValidation?:
    ReconstructTargetMaterialProfileValidationArtifact | null;
  expectedRequiredValidationRefs?: string[];
  requiredValidationStatuses?: Array<{
    ref: string;
    status: ReconstructRecordValidationStatusProjection;
  }>;
  executionProfileTruth?: {
    reconstructRunManifestRef: string;
    semanticAuthorRealization:
      ReconstructRunManifestArtifact["execution_profile"]["semantic_author_realization"];
    confirmationProviderRealization:
      ReconstructRunManifestArtifact["execution_profile"]["confirmation_provider_realization"];
  };
  expectedClaimProjection?: ReconstructClaimProjectionArtifact | null;
}): ReconstructClaimProjectionValidationArtifact {
  const violations: ReconstructClaimProjectionValidationViolation[] = [];
  const seenIds = new Set<string>();
  const surfaces = new Set<ReconstructClaimProjectionSurface>();
  const decisionStateCounts = Object.fromEntries(
    DECISION_STATES.map((state) => [state, 0]),
  ) as Record<ReconstructClaimProjectionDecisionState, number>;
  const expectedRequiredValidationRefs =
    args.expectedRequiredValidationRefs
      ? sortedUnique(args.expectedRequiredValidationRefs)
      : null;
  const invalidRequiredValidationRefs = new Set(
    (args.requiredValidationStatuses ?? [])
      .filter((item) => item.status !== "valid")
      .map((item) => item.ref),
  );
  const expectedRowsBySurface = new Map(
    (args.expectedClaimProjection?.projection_rows ?? []).map((row) => [
      row.projection_surface,
      row,
    ]),
  );
  if (
    args.executionProfileTruth &&
    !args.claimProjection.source_authority_refs.includes(
      args.executionProfileTruth.reconstructRunManifestRef,
    )
  ) {
    violations.push(violation({
      code: "execution_profile_authority_missing",
      message:
        "claim projection must cite reconstruct-run-manifest.yaml as execution-profile authority",
    }));
  }

  if (args.claimProjection.schema_version !== "1") {
    violations.push(violation({
      code: "schema_shape_invalid",
      message: "claim projection schema_version must be 1",
    }));
  }
  for (const row of args.claimProjection.projection_rows) {
    if (seenIds.has(row.projection_id)) {
      violations.push(violation({
        code: "duplicate_id",
        message: `duplicate projection_id ${row.projection_id}`,
        projectionId: row.projection_id,
      }));
    }
    seenIds.add(row.projection_id);
    if (!PROJECTION_SURFACES.includes(row.projection_surface)) {
      violations.push(violation({
        code: "invalid_enum",
        message: "projection_surface is invalid",
        projectionId: row.projection_id,
      }));
    } else {
      surfaces.add(row.projection_surface);
    }
    if (!CLAIM_LEVELS.includes(row.claim_level)) {
      violations.push(violation({
        code: "invalid_enum",
        message: "claim_level is invalid",
        projectionId: row.projection_id,
      }));
    }
    if (!DECISION_STATES.includes(row.decision_state)) {
      violations.push(violation({
        code: "invalid_enum",
        message: "decision_state is invalid",
        projectionId: row.projection_id,
      }));
    } else {
      decisionStateCounts[row.decision_state] += 1;
    }
    if (!ACTIONABILITY_CLAIMS.includes(row.actionability_claim)) {
      violations.push(violation({
        code: "invalid_enum",
        message: "actionability_claim is invalid",
        projectionId: row.projection_id,
      }));
    }
    if (row.projection_surface === "material_kind_support") {
      if (
        row.claim_level !== "not_applicable" ||
        row.decision_state !== "not_applicable" ||
        row.actionability_claim !== "none"
      ) {
        violations.push(violation({
          code: "decision_state_actionability_mismatch",
          message:
            "material_kind_support projection must not carry actionability claim state",
          projectionId: row.projection_id,
        }));
      }
      if (row.included_row_refs.length > 0 || row.excluded_row_refs.length > 0) {
        violations.push(violation({
          code: "decision_state_actionability_mismatch",
          message:
            "material_kind_support projection must not carry actionability row scope",
          projectionId: row.projection_id,
        }));
      }
      if (row.member_capability_rows.length === 0) {
        violations.push(violation({
          code: "member_capability_row_missing",
          message:
            "material_kind_support projection must include member capability support rows",
          projectionId: row.projection_id,
        }));
      }
      for (const member of row.member_capability_rows) {
        if (
          member.support_claim !== "unsupported" &&
          member.support_claim !== "profile_supported"
        ) {
          violations.push(violation({
            code: "member_capability_lineage_mismatch",
            message:
              "material_kind_support projection may only claim profile_supported or unsupported until stronger validation evidence is wired",
            projectionId: row.projection_id,
          }));
        }
      }
      for (const duplicate of duplicateIds(row.member_capability_rows.map((
        member,
      ) => path.resolve(member.member_id)))) {
        violations.push(violation({
          code: "member_capability_lineage_mismatch",
          message: `duplicate material-kind support member id ${duplicate}`,
          projectionId: row.projection_id,
        }));
      }
      if (args.targetMaterialProfile && args.targetMaterialProfileValidation) {
        const expectedRows = materialKindSupportMemberRows(
          args.targetMaterialProfile,
          args.targetMaterialProfileValidation,
        );
        const baseExpectedStatus =
          materialKindSupportProjectionStatus(expectedRows);
        const expectedStatus = invalidRequiredValidationRefs.size > 0
          ? {
            displayLabel: "Material Kind Support Blocked",
            machineStatus: "blocked",
            limitationRefs: sortedUnique([
              ...baseExpectedStatus.limitationRefs,
              ...[...invalidRequiredValidationRefs],
            ]),
          }
          : baseExpectedStatus;
        if (
          row.display_label !== expectedStatus.displayLabel ||
          row.machine_status !== expectedStatus.machineStatus ||
          sortedUnique(row.limitation_refs).join("\n") !==
            expectedStatus.limitationRefs.join("\n")
        ) {
          violations.push(violation({
            code: "member_capability_lineage_mismatch",
            message:
              "material_kind_support projection UX status must derive from member capability support rows",
            projectionId: row.projection_id,
          }));
        }
        const expectedByMemberId = new Map(expectedRows.map((member) => [
          path.resolve(member.member_id),
          member,
        ]));
        const actualByMemberId = new Map(row.member_capability_rows.map((member) => [
          path.resolve(member.member_id),
          member,
        ]));
        for (const expectedRow of expectedRows) {
          const actualRow = actualByMemberId.get(path.resolve(expectedRow.member_id));
          if (!actualRow) {
            violations.push(violation({
              code: "member_capability_row_missing",
              message:
                `material_kind_support is missing member capability row ${expectedRow.member_id}`,
              projectionId: row.projection_id,
            }));
            continue;
          }
	          if (
	            actualRow.target_ref !== expectedRow.target_ref ||
	            actualRow.target_material_kind !== expectedRow.target_material_kind ||
	            actualRow.selected_source_profile_id !==
	              expectedRow.selected_source_profile_id ||
	            actualRow.selected_source_profile_ref !==
	              expectedRow.selected_source_profile_ref ||
	            actualRow.selected_source_profile_definition_sha256 !==
	              expectedRow.selected_source_profile_definition_sha256 ||
	            sortedUnique(actualRow.member_source_refs).join("\n") !==
	              sortedUnique(expectedRow.member_source_refs).join("\n") ||
	            actualRow.validation_ref !== expectedRow.validation_ref ||
	            actualRow.support_claim !== expectedRow.support_claim ||
	            actualRow.readiness_effect !== expectedRow.readiness_effect ||
	            actualRow.next_action !== expectedRow.next_action ||
	            sortedUnique(actualRow.limitation_refs).join("\n") !==
	              sortedUnique(expectedRow.limitation_refs).join("\n")
	          ) {
            violations.push(violation({
              code: "member_capability_lineage_mismatch",
              message:
                `material_kind_support member ${expectedRow.member_id} must match target material profile lineage`,
              projectionId: row.projection_id,
            }));
          }
        }
        for (const actualRow of row.member_capability_rows) {
          if (!expectedByMemberId.has(path.resolve(actualRow.member_id))) {
            violations.push(violation({
              code: "member_capability_lineage_mismatch",
              message:
                `material_kind_support member ${actualRow.member_id} is not present in target material profile lineage`,
              projectionId: row.projection_id,
            }));
          }
        }
      }
    }
    const expectedRow = expectedRowsBySurface.get(row.projection_surface);
    if (expectedRow) {
      const matchesExpected =
        row.projection_id === expectedRow.projection_id &&
        row.claim_level === expectedRow.claim_level &&
        row.decision_state === expectedRow.decision_state &&
        row.actionability_claim === expectedRow.actionability_claim &&
        sameStringSet(
          row.material_kind_capability_refs,
          expectedRow.material_kind_capability_refs,
        ) &&
        sameJson(row.governance_scope, expectedRow.governance_scope) &&
        sameJson(row.member_capability_rows, expectedRow.member_capability_rows) &&
        sameStringSet(row.included_row_refs, expectedRow.included_row_refs) &&
        sameStringSet(row.excluded_row_refs, expectedRow.excluded_row_refs) &&
        sameStringSet(row.required_validation_refs, expectedRow.required_validation_refs) &&
        sameStringSet(row.registry_evidence_refs, expectedRow.registry_evidence_refs) &&
        row.display_label === expectedRow.display_label &&
        row.machine_status === expectedRow.machine_status &&
        row.timestamp.timezone === expectedRow.timestamp.timezone &&
        row.timestamp.source_ref === expectedRow.timestamp.source_ref &&
        row.locale_context.locale === expectedRow.locale_context.locale &&
        sameStringSet(
          row.locale_context.value_format_refs,
          expectedRow.locale_context.value_format_refs,
        ) &&
        sameStringSet(row.limitation_refs, expectedRow.limitation_refs);
      if (!matchesExpected) {
        violations.push(violation({
          code: "derived_claim_mismatch",
          message:
            "projection row must derive from the current upstream runtime authorities",
          projectionId: row.projection_id,
        }));
      }
    }
    if (
      row.decision_state === "actionable_ready" &&
      row.actionability_claim !== "ready"
    ) {
      violations.push(violation({
        code: "decision_state_actionability_mismatch",
        message: "actionable_ready decision_state requires ready actionability_claim",
        projectionId: row.projection_id,
      }));
    }
    if (
      row.decision_state === "actionable_limited" &&
      row.actionability_claim !== "limited"
    ) {
      violations.push(violation({
        code: "decision_state_actionability_mismatch",
        message:
          "actionable_limited decision_state requires limited actionability_claim",
        projectionId: row.projection_id,
      }));
    }
    if (
      row.claim_level === "actionable_ready" &&
      row.decision_state !== "actionable_ready" &&
      row.projection_surface !== "material_kind_support"
    ) {
      violations.push(violation({
        code: "ready_projection_without_ready_decision",
        message: "actionable_ready claim_level requires actionable_ready decision_state",
        projectionId: row.projection_id,
      }));
    }
    if (row.required_validation_refs.length === 0) {
      violations.push(violation({
        code: "required_validation_ref_missing",
        message: "projection row must cite required validation refs",
        projectionId: row.projection_id,
      }));
    }
    if (expectedRequiredValidationRefs) {
      const actualRequiredValidationRefs = sortedUnique(row.required_validation_refs);
      const actualSet = new Set(actualRequiredValidationRefs);
      const expectedSet = new Set(expectedRequiredValidationRefs);
      for (const expectedRef of expectedRequiredValidationRefs) {
        if (!actualSet.has(expectedRef)) {
          violations.push(violation({
            code: "required_validation_ref_missing",
            message:
              `projection row is missing required validation ref ${expectedRef}`,
            projectionId: row.projection_id,
          }));
        }
      }
      for (const actualRef of actualRequiredValidationRefs) {
        if (!expectedSet.has(actualRef)) {
          violations.push(violation({
            code: "required_validation_ref_missing",
            message:
              `projection row cites unexpected required validation ref ${actualRef}`,
            projectionId: row.projection_id,
          }));
        }
      }
    }
    for (const requiredRef of row.required_validation_refs) {
      if (invalidRequiredValidationRefs.has(requiredRef)) {
        const exposesBlockedRecovery =
          row.projection_surface === "material_kind_support"
            ? row.machine_status === "blocked" &&
              row.limitation_refs.includes(requiredRef)
            : row.claim_level === "blocked" &&
              row.decision_state === "blocked" &&
              row.actionability_claim === "none" &&
              row.limitation_refs.includes(requiredRef);
        if (!exposesBlockedRecovery) {
          violations.push(violation({
            code: "required_validation_ref_invalid",
            message:
              `projection row cites invalid required validation ref ${requiredRef} without a blocked recovery/limitation ref`,
            projectionId: row.projection_id,
          }));
        }
      }
    }
    if (
      row.governance_scope.operated_system_release_health !== "out_of_scope" &&
      row.governance_scope.operated_system_release_health !== "planned_later" &&
      row.governance_scope.operated_system_release_health !== "delegated_authority_ref"
    ) {
      violations.push(violation({
        code: "broader_governance_scope_unbounded",
        message: "operated system release-health governance must be bounded",
        projectionId: row.projection_id,
      }));
    }
    if (
      row.claim_level === "blocked" &&
      row.limitation_refs.length === 0 &&
      row.excluded_row_refs.length === 0
    ) {
      violations.push(violation({
        code: "blocked_projection_missing_recovery_ref",
        message: "blocked projection requires limitation or excluded/blocking refs",
        projectionId: row.projection_id,
      }));
    }
    if (
      !row.display_label ||
      !row.machine_status ||
      !row.timestamp.value ||
      !row.timestamp.timezone ||
      !row.locale_context.locale
    ) {
      violations.push(violation({
        code: "missing_required_field",
        message: "projection row is missing bounded UX fields",
        projectionId: row.projection_id,
      }));
    }
  }
  for (const surface of PROJECTION_SURFACES) {
    if (!surfaces.has(surface)) {
      violations.push(violation({
        code: "missing_required_surface",
        message: `claim projection is missing ${surface} row`,
      }));
    }
  }

  return {
    schema_version: "1",
    session_id: args.claimProjection.session_id,
    created_at: isoNow(),
    claim_projection_ref: args.claimProjectionRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    projection_row_count: args.claimProjection.projection_rows.length,
    strongest_claim_level: strongestClaimLevel(args.claimProjection.projection_rows),
    decision_state_counts: decisionStateCounts,
    validation_results: violations.length === 0
      ? ["claim_projection_valid"]
      : ["claim_projection_invalid"],
    violations,
  };
}

export async function writeClaimProjectionArtifact(args: {
  sessionId: string;
  targetMaterialProfilePath: string;
  targetMaterialProfileValidationPath: string;
  handoffDecisionValidationPath: string;
  runControlValidationPath: string;
  registryVerificationEvidenceValidationPath: string;
  sourceSafetyLedgerValidationPath: string;
  materialAdmissionLedgerValidationPath: string;
  maturationContinuationDecisionPath: string;
  maturationContinuationDecisionValidationPath: string;
  reconstructRunManifestPath: string;
  registryPath: string;
  outputPath: string;
}): Promise<ReconstructClaimProjectionArtifact> {
  const [
    targetMaterialProfile,
    targetMaterialProfileValidation,
    handoffDecisionValidation,
    runControlValidation,
    registryVerificationEvidenceValidation,
    sourceSafetyLedgerValidation,
    materialAdmissionLedgerValidation,
    maturationContinuationDecision,
    maturationContinuationDecisionValidation,
  ] = await Promise.all([
    readYamlDocument<ReconstructTargetMaterialProfileArtifact>(
      args.targetMaterialProfilePath,
    ),
    readYamlDocument<ReconstructTargetMaterialProfileValidationArtifact>(
      args.targetMaterialProfileValidationPath,
    ),
    readYamlDocument<ReconstructHandoffDecisionValidationArtifact>(
      args.handoffDecisionValidationPath,
    ),
    readYamlDocument<ReconstructRunControlValidationArtifact>(
      args.runControlValidationPath,
    ),
    readYamlDocument<ReconstructRegistryVerificationEvidenceValidationArtifact>(
      args.registryVerificationEvidenceValidationPath,
    ),
    readYamlDocument<ReconstructSourceSafetyLedgerValidationArtifact>(
      args.sourceSafetyLedgerValidationPath,
    ),
    readYamlDocument<ReconstructMaterialAdmissionLedgerValidationArtifact>(
      args.materialAdmissionLedgerValidationPath,
    ),
    readYamlDocument<ReconstructMaturationContinuationDecisionArtifact>(
      args.maturationContinuationDecisionPath,
    ),
    readYamlDocument<ReconstructMaturationContinuationDecisionValidationArtifact>(
      args.maturationContinuationDecisionValidationPath,
    ),
  ]);
  const artifact = buildClaimProjectionArtifact({
    sessionId: args.sessionId,
    targetMaterialProfile,
    targetMaterialProfileRef: args.targetMaterialProfilePath,
    targetMaterialProfileValidation,
    targetMaterialProfileValidationRef:
      args.targetMaterialProfileValidationPath,
    handoffDecisionValidation,
    handoffDecisionValidationRef: args.handoffDecisionValidationPath,
    runControlValidation,
    runControlValidationRef: args.runControlValidationPath,
    registryVerificationEvidenceValidation,
    registryVerificationEvidenceValidationRef:
      args.registryVerificationEvidenceValidationPath,
    sourceSafetyLedgerValidation,
    sourceSafetyLedgerValidationRef: args.sourceSafetyLedgerValidationPath,
    materialAdmissionLedgerValidation,
    materialAdmissionLedgerValidationRef:
      args.materialAdmissionLedgerValidationPath,
    maturationContinuationDecision,
    maturationContinuationDecisionRef: args.maturationContinuationDecisionPath,
    maturationContinuationDecisionValidation,
    maturationContinuationDecisionValidationRef:
      args.maturationContinuationDecisionValidationPath,
    reconstructRunManifestRef: args.reconstructRunManifestPath,
    registryRef: args.registryPath,
  });
  await writeYamlDocument(args.outputPath, artifact);
  return artifact;
}

export async function writeClaimProjectionValidationArtifact(args: {
  claimProjectionPath: string;
  targetMaterialProfilePath: string;
  targetMaterialProfileValidationPath: string;
  handoffDecisionValidationPath: string;
  runControlValidationPath: string;
  registryVerificationEvidenceValidationPath: string;
  sourceSafetyLedgerValidationPath: string;
  materialAdmissionLedgerValidationPath: string;
  maturationContinuationDecisionPath: string;
  maturationContinuationDecisionValidationPath: string;
  reconstructRunManifestPath: string;
  registryPath: string;
  outputPath: string;
}): Promise<ReconstructClaimProjectionValidationArtifact> {
  const [
    claimProjection,
    targetMaterialProfile,
    targetMaterialProfileValidation,
    handoffDecisionValidation,
    runControlValidation,
    registryVerificationEvidenceValidation,
    sourceSafetyLedgerValidation,
    materialAdmissionLedgerValidation,
    maturationContinuationDecision,
    maturationContinuationDecisionValidation,
    reconstructRunManifest,
  ] = await Promise.all([
    readYamlDocument<ReconstructClaimProjectionArtifact>(
      args.claimProjectionPath,
    ),
    readYamlDocument<ReconstructTargetMaterialProfileArtifact>(
      args.targetMaterialProfilePath,
    ),
    readYamlDocument<ReconstructTargetMaterialProfileValidationArtifact>(
      args.targetMaterialProfileValidationPath,
    ),
    readYamlDocument<ReconstructHandoffDecisionValidationArtifact>(
      args.handoffDecisionValidationPath,
    ),
    readYamlDocument<ReconstructRunControlValidationArtifact>(
      args.runControlValidationPath,
    ),
    readYamlDocument<ReconstructRegistryVerificationEvidenceValidationArtifact>(
      args.registryVerificationEvidenceValidationPath,
    ),
    readYamlDocument<ReconstructSourceSafetyLedgerValidationArtifact>(
      args.sourceSafetyLedgerValidationPath,
    ),
    readYamlDocument<ReconstructMaterialAdmissionLedgerValidationArtifact>(
      args.materialAdmissionLedgerValidationPath,
    ),
    readYamlDocument<ReconstructMaturationContinuationDecisionArtifact>(
      args.maturationContinuationDecisionPath,
    ),
    readYamlDocument<ReconstructMaturationContinuationDecisionValidationArtifact>(
      args.maturationContinuationDecisionValidationPath,
    ),
    readYamlDocument<ReconstructRunManifestArtifact>(
      args.reconstructRunManifestPath,
    ),
  ]);
  const expectedRequiredValidationRefs = [
    args.handoffDecisionValidationPath,
    args.targetMaterialProfileValidationPath,
    args.runControlValidationPath,
    args.registryVerificationEvidenceValidationPath,
    args.sourceSafetyLedgerValidationPath,
    args.materialAdmissionLedgerValidationPath,
    args.maturationContinuationDecisionValidationPath,
  ];
  const validation = validateClaimProjection({
    claimProjection,
    claimProjectionRef: args.claimProjectionPath,
    targetMaterialProfile,
    targetMaterialProfileValidation,
    expectedRequiredValidationRefs,
    requiredValidationStatuses: [
      {
        ref: args.handoffDecisionValidationPath,
        status: handoffDecisionValidation.validation_status,
      },
      {
        ref: args.targetMaterialProfileValidationPath,
        status: targetMaterialProfileValidation.validation_status,
      },
      {
        ref: args.runControlValidationPath,
        status: runControlValidation.validation_status,
      },
      {
        ref: args.registryVerificationEvidenceValidationPath,
        status: registryVerificationEvidenceValidation.validation_status,
      },
      {
        ref: args.sourceSafetyLedgerValidationPath,
        status: sourceSafetyLedgerValidation.validation_status,
      },
      {
        ref: args.materialAdmissionLedgerValidationPath,
        status: materialAdmissionLedgerValidation.validation_status,
      },
      {
        ref: args.maturationContinuationDecisionValidationPath,
        status: maturationContinuationDecisionValidation.validation_status,
      },
    ],
    executionProfileTruth: {
      reconstructRunManifestRef: args.reconstructRunManifestPath,
      semanticAuthorRealization:
        reconstructRunManifest.execution_profile.semantic_author_realization,
      confirmationProviderRealization:
        reconstructRunManifest.execution_profile.confirmation_provider_realization,
    },
    expectedClaimProjection: buildClaimProjectionArtifact({
      sessionId: claimProjection.session_id,
      targetMaterialProfile,
      targetMaterialProfileRef: args.targetMaterialProfilePath,
      targetMaterialProfileValidation,
      targetMaterialProfileValidationRef:
        args.targetMaterialProfileValidationPath,
      handoffDecisionValidation,
      handoffDecisionValidationRef: args.handoffDecisionValidationPath,
      runControlValidation,
      runControlValidationRef: args.runControlValidationPath,
      registryVerificationEvidenceValidation,
      registryVerificationEvidenceValidationRef:
        args.registryVerificationEvidenceValidationPath,
      sourceSafetyLedgerValidation,
      sourceSafetyLedgerValidationRef: args.sourceSafetyLedgerValidationPath,
      materialAdmissionLedgerValidation,
      materialAdmissionLedgerValidationRef:
        args.materialAdmissionLedgerValidationPath,
      maturationContinuationDecision,
      maturationContinuationDecisionRef: args.maturationContinuationDecisionPath,
      maturationContinuationDecisionValidation,
      maturationContinuationDecisionValidationRef:
        args.maturationContinuationDecisionValidationPath,
      reconstructRunManifestRef: args.reconstructRunManifestPath,
      registryRef: args.registryPath,
    }),
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}
