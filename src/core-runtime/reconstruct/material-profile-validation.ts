import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { atomicWriteYamlDocument as writeYamlDocument, assertArrayField } from "../artifact-io.js";
import {
  isTargetMaterialKind,
} from "../target-material-kind.js";
import type {
  ReconstructTargetMaterialProfileArtifact,
  ReconstructTargetMaterialProfileValidationArtifact,
  ReconstructTargetMaterialProfileValidationViolation,
} from "./artifact-types.js";
import {
  loadReconstructContractRegistry,
  resolveRegistryRef,
  type ReconstructContractRegistry,
  type ReconstructSourceProfileRecord,
} from "./contract-registry.js";

function isoNow(): string {
  return new Date().toISOString();
}

function violation(args: {
  code: ReconstructTargetMaterialProfileValidationViolation["code"];
  message: string;
  subjectId?: string | null;
}): ReconstructTargetMaterialProfileValidationViolation {
  return {
    code: args.code,
    message: args.message,
    subject_id: args.subjectId ?? null,
  };
}

async function readYamlDocument<T>(filePath: string): Promise<T> {
  return parseYaml(await fs.readFile(filePath, "utf8")) as T;
}

function sourceProfileKey(args: {
  profile_id: string;
  target_material_kind: string;
}): string {
  return `${args.profile_id}\u0000${args.target_material_kind}`;
}

function sourceProfileRecordsByKey(
  registry: ReconstructContractRegistry,
): Map<string, ReconstructSourceProfileRecord> {
  assertArrayField(registry.source_profile_records, "contract-registry", "source_profile_records");
  return new Map(
    registry.source_profile_records.map((record) => [
      sourceProfileKey(record),
      record,
    ]),
  );
}

function projectRootFromRegistryPath(registryPath: string | null | undefined): string {
  if (!registryPath) return process.cwd();
  return path.resolve(path.dirname(registryPath), "../../..");
}

function requiredSelectedProfileFields(
  registry: ReconstructContractRegistry,
): string[] {
  const fields =
    registry.version_policy?.selected_source_profile_snapshot_required_fields;
  if (!fields || fields.length === 0) {
    throw new Error(
      "registry version_policy.selected_source_profile_snapshot_required_fields is required",
    );
  }
  return fields;
}

function selectedProfileFieldMissing(
  selected: Record<string, unknown>,
  field: string,
): boolean {
  return selected[field] === undefined;
}

function refMatchesTargetOrDescendant(args: {
  targetRef: string;
  detectionRef: string;
}): boolean {
  const targetRef = path.resolve(args.targetRef);
  const detectionRef = path.resolve(args.detectionRef);
  if (detectionRef === targetRef) return true;
  const relative = path.relative(targetRef, detectionRef);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function validateTargetMaterialProfile(args: {
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact;
  contractRegistry: ReconstructContractRegistry;
  targetMaterialProfileRef?: string | null;
  registryRef?: string | null;
}): ReconstructTargetMaterialProfileValidationArtifact {
  assertArrayField(args.contractRegistry.source_profile_records, "contract-registry", "source_profile_records");
  assertArrayField(args.targetMaterialProfile.target_refs, "target-material-profile", "target_refs");
  assertArrayField(args.targetMaterialProfile.selected_source_profiles, "target-material-profile", "selected_source_profiles");
  assertArrayField(args.targetMaterialProfile.target_material_kind_candidates, "target-material-profile", "target_material_kind_candidates");
  assertArrayField(args.targetMaterialProfile.detection.per_ref, "target-material-profile", "detection.per_ref");
  const profile = args.targetMaterialProfile;
  const violations: ReconstructTargetMaterialProfileValidationViolation[] = [];
  const projectRoot = projectRootFromRegistryPath(args.registryRef);

  if (!isTargetMaterialKind(profile.target_material_kind)) {
    violations.push(violation({
      code: "schema_shape_invalid",
      message: `invalid target_material_kind: ${profile.target_material_kind}`,
      subjectId: "target_material_kind",
    }));
  }

  const targetKindRecord = args.contractRegistry.source_profile_records.find(
    (record) => record.target_material_kind === profile.target_material_kind,
  );
  if (!targetKindRecord) {
    violations.push(violation({
      code: "target_kind_registry_record_missing",
      message:
        `target material kind has no registry source_profile_records row: ${profile.target_material_kind}`,
      subjectId: profile.target_material_kind,
    }));
  }

  if (profile.target_refs.length === 0) {
    violations.push(violation({
      code: "target_refs_empty",
      message: "target material profile must include at least one target ref",
      subjectId: "target_refs",
    }));
  }

  for (const targetRef of profile.target_refs) {
    const hasMatchingDetection = profile.detection.per_ref.some((detection) =>
      refMatchesTargetOrDescendant({
        targetRef,
        detectionRef: detection.ref,
      })
    );
    if (!hasMatchingDetection) {
      violations.push(violation({
        code: "detection_ref_mismatch",
        message: `target ref has no matching detection row: ${targetRef}`,
        subjectId: targetRef,
      }));
    }
  }

  if (profile.target_material_kind === "mixed") {
    const selectedKinds = new Set(
      profile.selected_source_profiles.map((selected) =>
        selected.target_material_kind
      ),
    );
    if (!selectedKinds.has("mixed")) {
      violations.push(violation({
        code: "mixed_candidate_profile_missing",
        message:
          "mixed material profiles must include the registry mixed-source-profile row as the composite authority record",
        subjectId: "mixed",
      }));
    }
    for (const candidate of profile.target_material_kind_candidates) {
      if (!selectedKinds.has(candidate)) {
        violations.push(violation({
          code: "mixed_candidate_profile_missing",
          message:
            `mixed material profile is missing per-member selected source profile for ${candidate}`,
          subjectId: candidate,
        }));
      }
    }
  }

  if (
    profile.support_status === "supported" ||
    profile.support_status === "partial" ||
    profile.support_status === "supported_composite" ||
    profile.support_status === "partial_composite"
  ) {
    if (profile.selected_source_profiles.length === 0) {
      violations.push(violation({
        code: "selected_profile_missing",
        message: "supported material profile must select at least one source profile",
        subjectId: "selected_source_profiles",
      }));
    }
  }

  if (
    (profile.support_status === "unsupported" ||
      profile.support_status === "unknown" ||
      profile.support_status === "reserved_future") &&
    !profile.unsupported_reason
  ) {
    violations.push(violation({
      code: "unsupported_reason_missing",
      message: "unsupported, unknown, or future-reserved material profiles must explain unsupported_reason",
      subjectId: "unsupported_reason",
    }));
  }

  const registryProfiles = sourceProfileRecordsByKey(args.contractRegistry);
  const requiredFields = requiredSelectedProfileFields(args.contractRegistry);
  for (const selected of profile.selected_source_profiles) {
    for (const field of requiredFields) {
      if (
        selectedProfileFieldMissing(
          selected as unknown as Record<string, unknown>,
          field,
        )
      ) {
        violations.push(violation({
          code: "selected_profile_required_field_missing",
          message:
            `selected source profile ${selected.profile_id} is missing required snapshot field: ${field}`,
          subjectId: selected.profile_id,
        }));
      }
    }
    const registryRecord = registryProfiles.get(sourceProfileKey(selected));
    if (!registryRecord) {
      violations.push(violation({
        code: "selected_profile_registry_mismatch",
        message: `selected source profile is not present in registry: ${selected.profile_id}`,
        subjectId: selected.profile_id,
      }));
      continue;
    }
    const expectedProfileRef = registryRecord.definition_ref === null
      ? `registry:${registryRecord.profile_id}`
      : resolveRegistryRef({
          projectRoot,
          ref: registryRecord.definition_ref,
        });
    const mismatchedFields = [...requiredFields, "profile_ref"].filter((field) =>
      field === "profile_ref"
        ? selected.profile_ref !== expectedProfileRef
        : JSON.stringify(selected[field as keyof typeof selected]) !==
          JSON.stringify(registryRecord[field as keyof typeof registryRecord])
    );
    if (mismatchedFields.length > 0) {
      violations.push(violation({
        code: "selected_profile_registry_mismatch",
        message:
          `selected source profile ${selected.profile_id} does not match registry fields: ${mismatchedFields.join(", ")}`,
        subjectId: selected.profile_id,
      }));
    }
  }

  return {
    schema_version: "1",
    session_id: profile.session_id,
    created_at: isoNow(),
    target_material_profile_ref: args.targetMaterialProfileRef ?? null,
    registry_ref: args.registryRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    target_ref_count: profile.target_refs.length,
    selected_source_profile_count: profile.selected_source_profiles.length,
    validation_results: violations.length === 0
      ? ["target_material_profile_valid"]
      : ["target_material_profile_invalid"],
    violations,
  };
}

export async function writeTargetMaterialProfileValidationArtifact(args: {
  targetMaterialProfilePath: string;
  registryPath: string;
  outputPath: string;
}): Promise<ReconstructTargetMaterialProfileValidationArtifact> {
  const [targetMaterialProfile, contractRegistry] = await Promise.all([
    readYamlDocument<ReconstructTargetMaterialProfileArtifact>(
      args.targetMaterialProfilePath,
    ),
    loadReconstructContractRegistry({ registryPath: args.registryPath }),
  ]);
  const validation = validateTargetMaterialProfile({
    targetMaterialProfile,
    contractRegistry,
    targetMaterialProfileRef: path.resolve(args.targetMaterialProfilePath),
    registryRef: path.resolve(args.registryPath),
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}
