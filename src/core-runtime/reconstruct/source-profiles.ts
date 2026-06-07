import fs from "node:fs/promises";
import path from "node:path";
import {
  isTargetMaterialKind,
  type TargetMaterialKind,
} from "../target-material-kind.js";
import {
  loadReconstructContractRegistry,
  projectRootFromProfilesRoot,
  resolveRegistryRef,
  validateSourceProfileDefinitionHashes,
  type ReconstructSourceProfileRecord,
} from "./contract-registry.js";

export interface ReconstructSourceProfile extends ReconstructSourceProfileRecord {
  target_material_kind: TargetMaterialKind;
  profile_path: string;
  title: string;
  support_summary: string;
  scan_targets: string[];
}

const TARGET_MATERIAL_KIND_PATTERN =
  /^>\s*Target material kind:\s*`([^`]+)`\s*$/m;

function firstMarkdownHeading(markdown: string): string {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() ?? "Untitled Source Profile";
}

function sectionBody(markdown: string, heading: string): string {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start < 0) return "";
  const bodyLines: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("## ")) break;
    bodyLines.push(line);
  }
  return bodyLines.join("\n").trim();
}

function compactSectionText(markdown: string, heading: string): string {
  const compacted = sectionBody(markdown, heading)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(" ");
  return compacted.length > 0
    ? compacted
    : "Source profile definition only; support and migration status are registry-owned.";
}

function parseScanTargets(markdown: string): string[] {
  return sectionBody(markdown, "Scan Targets")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter((line) => line.length > 0);
}

export function parseReconstructSourceProfile(args: {
  profilePath: string;
  markdown: string;
  record?: ReconstructSourceProfileRecord;
}): ReconstructSourceProfile {
  const match = TARGET_MATERIAL_KIND_PATTERN.exec(args.markdown);
  const rawKind = match?.[1]?.trim() ?? "";
  if (!isTargetMaterialKind(rawKind)) {
    throw new Error(
      `Invalid or missing target material kind in source profile: ${args.profilePath}`,
    );
  }
  if (args.record && args.record.target_material_kind !== rawKind) {
    throw new Error(
      `Source profile ${args.profilePath} target_material_kind=${rawKind} does not match registry target_material_kind=${args.record.target_material_kind}`,
    );
  }

  const profileFileRecord: ReconstructSourceProfileRecord = args.record ?? {
    profile_id: `${rawKind}-source-profile`,
    target_material_kind: rawKind,
    is_default_for_kind: true,
    definition_ref: args.profilePath,
    definition_sha256: "unknown",
    contract_status: "profile_file_only",
    runtime_implementation_status: "unknown",
    schema_version: 1,
    profile_version: 1,
    migration_status: "unknown",
    supersedes: [],
    replaced_by: [],
    split_from: [],
    split_into: [],
    merged_from: [],
    merged_into: [],
  };

  return {
    ...profileFileRecord,
    profile_path: path.resolve(args.profilePath),
    title: firstMarkdownHeading(args.markdown),
    support_summary: args.record
      ? [
          `contract_status=${args.record.contract_status}`,
          `runtime_implementation_status=${args.record.runtime_implementation_status}`,
          `schema_version=${args.record.schema_version}`,
          `profile_version=${args.record.profile_version}`,
          `migration_status=${args.record.migration_status}`,
        ].join("; ")
      : compactSectionText(args.markdown, "Support Status"),
    scan_targets: parseScanTargets(args.markdown),
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function loadProfilesFromRegistry(args: {
  profilesRoot: string;
  registryPath: string;
}): Promise<ReconstructSourceProfile[] | null> {
  if (!(await fileExists(args.registryPath))) return null;

  const registry = await loadReconstructContractRegistry({
    registryPath: args.registryPath,
  });
  const projectRoot = projectRootFromProfilesRoot(args.profilesRoot);
  await validateSourceProfileDefinitionHashes({ projectRoot, registry });

  const records = registry.source_profile_records
    .sort((left, right) => left.profile_id.localeCompare(right.profile_id));

  return Promise.all(
    records.map(async (record) => {
      if (record.definition_ref === null) {
        return {
          ...record,
          profile_path: `registry:${record.profile_id}`,
          title: `Source Profile Registry Record: ${record.profile_id}`,
          support_summary: [
            `contract_status=${record.contract_status}`,
            `runtime_implementation_status=${record.runtime_implementation_status}`,
            `schema_version=${record.schema_version}`,
            `profile_version=${record.profile_version}`,
            `migration_status=${record.migration_status}`,
            "definition_ref=null",
          ].join("; "),
          scan_targets: [],
        };
      }
      const profilePath = resolveRegistryRef({
        projectRoot,
        ref: record.definition_ref,
      });
      return parseReconstructSourceProfile({
        profilePath,
        markdown: await fs.readFile(profilePath, "utf8"),
        record,
      });
    }),
  );
}

export async function loadReconstructSourceProfiles(
  profilesRoot: string,
): Promise<ReconstructSourceProfile[]> {
  const registryProfiles = await loadProfilesFromRegistry({
    profilesRoot,
    registryPath: path.join(path.dirname(path.resolve(profilesRoot)), "reconstruct-contract-registry.yaml"),
  });
  if (registryProfiles) return registryProfiles;

  const entries = await fs.readdir(profilesRoot, { withFileTypes: true });
  const profilePaths = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(profilesRoot, entry.name))
    .sort();

  const profiles = await Promise.all(
    profilePaths.map(async (profilePath) =>
      parseReconstructSourceProfile({
        profilePath,
        markdown: await fs.readFile(profilePath, "utf8"),
      }),
    ),
  );

  const seenKinds = new Set<TargetMaterialKind>();
  for (const profile of profiles) {
    if (seenKinds.has(profile.target_material_kind)) {
      throw new Error(
        `Duplicate reconstruct source profile for target material kind: ${profile.target_material_kind}`,
      );
    }
    seenKinds.add(profile.target_material_kind);
  }

  return profiles;
}

export async function resolveReconstructSourceProfile(args: {
  profilesRoot: string;
  targetMaterialKind: TargetMaterialKind;
}): Promise<ReconstructSourceProfile | null> {
  const profiles = await loadReconstructSourceProfiles(args.profilesRoot);
  const matchingProfiles = profiles.filter(
    (profile) => profile.target_material_kind === args.targetMaterialKind,
  );
  return matchingProfiles.find((profile) => profile.is_default_for_kind) ??
    matchingProfiles[0] ??
    null;
}
