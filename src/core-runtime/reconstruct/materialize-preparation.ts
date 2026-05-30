import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import {
  aggregateTargetMaterialDetections,
  detectTargetMaterialRefs,
  type TargetMaterialKind,
  type TargetMaterialRefDetection,
} from "../target-material-kind.js";
import {
  validateSourceObservationBoundary,
  type ReconstructSourceObservation,
} from "./source-observations.js";
import {
  loadReconstructSourceProfiles,
  type ReconstructSourceProfile,
} from "./source-profiles.js";
import type {
  ReconstructPreparationArtifactRefs,
  ReconstructInitialSourceFrontierArtifact,
  ReconstructSelectedSourceProfileRef,
  ReconstructSourceInventoryArtifact,
  ReconstructSourceInventoryUnit,
  ReconstructSourceObservationsArtifact,
  ReconstructTargetMaterialProfileArtifact,
} from "./artifact-types.js";

export interface MaterializeReconstructPreparationArtifactsParams {
  sessionRoot: string;
  targetRefs: string[];
  profilesRoot: string;
  filesystemAllowedRoots?: string[];
}

const CONCRETE_TARGET_MATERIAL_KINDS = new Set<TargetMaterialKind>([
  "code",
  "spreadsheet",
  "document",
  "database",
]);

function isConcreteTargetMaterialKind(
  kind: TargetMaterialKind,
): kind is Exclude<TargetMaterialKind, "mixed" | "unknown"> {
  return CONCRETE_TARGET_MATERIAL_KINDS.has(kind);
}

function isoNow(): string {
  return new Date().toISOString();
}

async function writeYamlDocument(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, stringifyYaml(value), "utf8");
}

function stableObservationId(args: {
  targetMaterialKind: TargetMaterialKind;
  sourceRef: string;
  location: string;
}): string {
  const digest = crypto
    .createHash("sha256")
    .update(`${args.targetMaterialKind}\n${path.resolve(args.sourceRef)}\n${args.location}`)
    .digest("hex")
    .slice(0, 16);
  return `obs_${args.targetMaterialKind}_${digest}`;
}

function supportForMaterial(args: {
  targetMaterialKind: TargetMaterialKind;
  selectedProfiles: ReconstructSelectedSourceProfileRef[];
}): {
  support_status: ReconstructTargetMaterialProfileArtifact["support_status"];
  unsupported_reason: string | null;
} {
  if (args.targetMaterialKind === "unknown") {
    return {
      support_status: "unknown",
      unsupported_reason: "runtime could not classify target material kind safely",
    };
  }
  if (args.targetMaterialKind === "mixed") {
    return {
      support_status: "partial_composite",
      unsupported_reason:
        "mixed target material kind is observed through per-ref source profiles; unsupported members are skipped with authority impact",
    };
  }
  if (args.selectedProfiles.length === 0) {
    return {
      support_status: "unsupported",
      unsupported_reason:
        "no reconstruct source profile exists for the detected target material kind",
    };
  }
  const runnableProfiles = args.selectedProfiles.filter((profile) =>
    isRunnableProfileRuntimeStatus(profile.runtime_implementation_status)
  );
  if (runnableProfiles.length === 0) {
    return {
      support_status: "unsupported",
      unsupported_reason:
        `selected source profile runtime status is ${args.selectedProfiles.map((profile) => profile.runtime_implementation_status).join(", ")}`,
    };
  }
  return {
    support_status: "partial",
    unsupported_reason:
      "source profile exists, but only minimal structural observation is implemented",
  };
}

function isRunnableProfileRuntimeStatus(status: string): boolean {
  return status === "partially_wired" || status === "wired" || status === "supported";
}

function inventoryUnitForMaterial(kind: TargetMaterialKind): string {
  switch (kind) {
    case "code":
      return "file_or_package_unit";
    case "spreadsheet":
      return "workbook_sheet_or_table_unit";
    case "document":
      return "section_heading_or_document_unit";
    case "database":
      return "schema_table_or_query_unit";
    case "mixed":
      return "per_member_material_unit";
    case "unknown":
      return "unknown_material_unit";
  }
}

function selectedProfileRefs(
  profiles: ReconstructSourceProfile[],
  candidates: TargetMaterialKind[],
): ReconstructSelectedSourceProfileRef[] {
  const selected: ReconstructSelectedSourceProfileRef[] = [];
  for (const kind of candidates) {
    const profile = defaultProfileForKind(profiles, kind);
    if (!profile) continue;
    selected.push({
      profile_id: profile.profile_id,
      target_material_kind: profile.target_material_kind,
      is_default_for_kind: profile.is_default_for_kind,
      definition_ref: profile.definition_ref,
      definition_sha256: profile.definition_sha256,
      profile_ref: profile.profile_path,
      contract_status: profile.contract_status,
      runtime_implementation_status: profile.runtime_implementation_status,
      schema_version: profile.schema_version,
      profile_version: profile.profile_version,
      migration_status: profile.migration_status,
      supersedes: profile.supersedes,
      replaced_by: profile.replaced_by,
      split_from: profile.split_from,
      split_into: profile.split_into,
      merged_from: profile.merged_from,
      merged_into: profile.merged_into,
      support_summary: profile.support_summary,
      scan_targets: profile.scan_targets,
    });
  }
  return selected;
}

function defaultProfileForKind(
  profiles: ReconstructSourceProfile[],
  kind: TargetMaterialKind,
): ReconstructSourceProfile | undefined {
  const matchingProfiles = profiles.filter((candidate) =>
    candidate.target_material_kind === kind
  );
  return matchingProfiles.find((candidate) => candidate.is_default_for_kind) ??
    matchingProfiles[0];
}

async function textStats(ref: string): Promise<{
  line_count: number | null;
  char_count: number | null;
  content_sha256: string | null;
  content_excerpt: string | null;
  excerpt_truncated: boolean;
}> {
  try {
    const text = await fs.readFile(ref, "utf8");
    const excerptLimit = 6000;
    return {
      line_count: text.length === 0 ? 0 : text.split(/\r?\n/).length,
      char_count: text.length,
      content_sha256: crypto.createHash("sha256").update(text).digest("hex"),
      content_excerpt: text.slice(0, excerptLimit),
      excerpt_truncated: text.length > excerptLimit,
    };
  } catch {
    return {
      line_count: null,
      char_count: null,
      content_sha256: null,
      content_excerpt: null,
      excerpt_truncated: false,
    };
  }
}

async function buildObservation(
  detection: TargetMaterialRefDetection,
): Promise<ReconstructSourceObservation | null> {
  if (!detection.exists || !isConcreteTargetMaterialKind(detection.kind)) {
    return null;
  }
  const extension = path.extname(detection.ref).toLowerCase();
  const location = detection.ref;
  const stat = await fs.stat(detection.ref);
  const stats = stat.isFile() ? await textStats(detection.ref) : {
    line_count: null,
    char_count: null,
    content_sha256: null,
    content_excerpt: null,
    excerpt_truncated: false,
  };
  const observation: ReconstructSourceObservation = {
    observation_id: stableObservationId({
      targetMaterialKind: detection.kind,
      sourceRef: detection.ref,
      location,
    }),
    target_material_kind: detection.kind,
    adapter_id: `minimal-${detection.kind}-structure-observer`,
    source_ref: detection.ref,
    location,
    summary: `${detection.kind} material observed at ${path.basename(detection.ref)}`,
    structural_data: {
      basename: path.basename(detection.ref),
      extension: extension || null,
      path_kind: stat.isDirectory() ? "directory" : "file",
      size_bytes: stat.isFile() ? stat.size : null,
      line_count: stats.line_count,
      char_count: stats.char_count,
      content_sha256: stats.content_sha256,
      content_excerpt: stats.content_excerpt,
      excerpt_truncated: stats.excerpt_truncated,
    },
  };

  const validation = validateSourceObservationBoundary(observation);
  if (!validation.valid) {
    throw new Error(
      `Invalid source observation boundary for ${detection.ref}: ${validation.violations.join("; ")}`,
    );
  }
  return observation;
}

function stableFrontierRefId(unit: ReconstructSourceInventoryUnit): string {
  const digest = crypto
    .createHash("sha256")
    .update(`${unit.target_material_kind}\n${path.resolve(unit.ref)}\n${unit.inventory_unit}`)
    .digest("hex")
    .slice(0, 16);
  return `frontier_initial_${digest}`;
}

function buildInitialSourceFrontier(args: {
  sessionId: string;
  inventory: ReconstructSourceInventoryArtifact;
}): ReconstructInitialSourceFrontierArtifact {
  return {
    schema_version: "1",
    session_id: args.sessionId,
    created_at: isoNow(),
    frontier_id: "initial",
    source_refs: args.inventory.inventory_units
      .filter((unit) => unit.scan_status === "planned")
      .map((unit) => ({
        frontier_ref_id: stableFrontierRefId(unit),
        source_ref: unit.ref,
        target_material_kind: unit.target_material_kind,
        inventory_unit: unit.inventory_unit,
        profile_ref: unit.profile_ref,
        rationale:
          "Initial source frontier derived from runtime material inventory and selected source profile.",
      })),
    skipped_refs: args.inventory.inventory_units
      .filter((unit) => unit.scan_status === "skipped")
      .map((unit) => ({
        source_ref: unit.ref,
        target_material_kind: unit.target_material_kind,
        reason: unit.skip_reason ?? "skipped",
        authority_impact:
          "Semantic artifacts cannot use this ref as trusted evidence until a supported material profile and observation exist.",
      })),
  };
}

function buildInventoryUnits(args: {
  detections: TargetMaterialRefDetection[];
  profiles: ReconstructSourceProfile[];
}): ReconstructSourceInventoryUnit[] {
  return args.detections.map((detection) => {
    const profile = defaultProfileForKind(args.profiles, detection.kind);
    const profileRef = profile?.profile_path ?? null;
    const runnable = profile
      ? isRunnableProfileRuntimeStatus(profile.runtime_implementation_status)
      : false;
    const planned = detection.exists &&
      isConcreteTargetMaterialKind(detection.kind) &&
      profileRef !== null &&
      runnable;
    return {
      ref: detection.ref,
      exists: detection.exists,
      target_material_kind: detection.kind,
      inventory_unit: inventoryUnitForMaterial(detection.kind),
      profile_ref: profileRef,
      scan_status: planned ? "planned" : "skipped",
      skip_reason: planned
        ? null
        : detection.exists
          ? profile
            ? `source profile ${profile.profile_id} runtime_implementation_status=${profile.runtime_implementation_status}`
            : `no reconstruct source profile for target_material_kind=${detection.kind}`
          : "target ref does not exist",
    };
  });
}

export async function materializeReconstructPreparationArtifacts(
  params: MaterializeReconstructPreparationArtifactsParams,
): Promise<ReconstructPreparationArtifactRefs> {
  if (params.targetRefs.length === 0) {
    throw new Error("targetRefs must not be empty.");
  }

  const sessionRoot = path.resolve(params.sessionRoot);
  const sessionId = path.basename(sessionRoot);
  const targetRefs = params.targetRefs.map((ref) => path.resolve(ref));
  const profiles = await loadReconstructSourceProfiles(params.profilesRoot);
  const perRefDetections = await detectTargetMaterialRefs(targetRefs);
  const detection = aggregateTargetMaterialDetections(perRefDetections);
  const profileCandidateKinds: TargetMaterialKind[] =
    detection.target_material_kind === "mixed"
      ? ["mixed", ...detection.target_material_kind_candidates]
      : [detection.target_material_kind];
  const selectedProfiles = selectedProfileRefs(
    profiles,
    profileCandidateKinds,
  );
  const support = supportForMaterial({
    targetMaterialKind: detection.target_material_kind,
    selectedProfiles,
  });

  const targetMaterialProfile: ReconstructTargetMaterialProfileArtifact = {
    schema_version: "1",
    session_id: sessionId,
    created_at: isoNow(),
    target_refs: targetRefs,
    target_material_kind: detection.target_material_kind,
    target_material_kind_candidates: detection.target_material_kind_candidates,
    support_status: support.support_status,
    unsupported_reason: support.unsupported_reason,
    selected_source_profiles: selectedProfiles,
    detection: {
      owner: "runtime_heuristic",
      confidence: detection.confidence,
      confidence_basis: detection.confidence_basis,
      per_ref: detection.per_ref,
    },
  };

  const inventory: ReconstructSourceInventoryArtifact = {
    schema_version: "1",
    session_id: sessionId,
    created_at: isoNow(),
    inventory_units: buildInventoryUnits({
      detections: detection.per_ref,
      profiles,
    }),
    scan_boundary: {
      filesystem_allowed_roots:
        params.filesystemAllowedRoots?.map((root) => path.resolve(root)) ?? [],
      source: "binding",
    },
  };
  const initialSourceFrontier = buildInitialSourceFrontier({
    sessionId,
    inventory,
  });

  const observations: ReconstructSourceObservation[] = [];
  const skippedRefs: ReconstructSourceObservationsArtifact["skipped_refs"] = [];
  for (const unit of inventory.inventory_units) {
    if (unit.scan_status === "skipped") {
      skippedRefs.push({
        ref: unit.ref,
        target_material_kind: unit.target_material_kind,
        reason: unit.skip_reason ?? "skipped",
      });
      continue;
    }
    const refDetection = detection.per_ref.find((candidate) => candidate.ref === unit.ref);
    if (!refDetection) continue;
    const observation = await buildObservation(refDetection);
    if (observation) observations.push(observation);
  }

  const sourceObservations: ReconstructSourceObservationsArtifact = {
    schema_version: "1",
    session_id: sessionId,
    created_at: isoNow(),
    observations,
    skipped_refs: skippedRefs,
    validation_results: [
      "target_material_kind_valid",
      "source_profiles_resolved",
      "source_observation_boundary_valid",
    ],
  };

  const refs: ReconstructPreparationArtifactRefs = {
    target_material_profile: path.join(sessionRoot, "target-material-profile.yaml"),
    source_inventory: path.join(sessionRoot, "source-inventory.yaml"),
    initial_source_frontier: path.join(sessionRoot, "initial-source-frontier.yaml"),
    source_observations: path.join(sessionRoot, "source-observations.yaml"),
  };

  await Promise.all([
    writeYamlDocument(refs.target_material_profile, targetMaterialProfile),
    writeYamlDocument(refs.source_inventory, inventory),
    writeYamlDocument(refs.initial_source_frontier, initialSourceFrontier),
    writeYamlDocument(refs.source_observations, sourceObservations),
  ]);

  return refs;
}
