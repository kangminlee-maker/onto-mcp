import fs from "node:fs/promises";
import path from "node:path";
import {
  isTargetMaterialKind,
  type TargetMaterialKind,
} from "../target-material-kind.js";

export interface ReconstructSourceProfile {
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
  return sectionBody(markdown, heading)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(" ");
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
}): ReconstructSourceProfile {
  const match = TARGET_MATERIAL_KIND_PATTERN.exec(args.markdown);
  const rawKind = match?.[1]?.trim() ?? "";
  if (!isTargetMaterialKind(rawKind)) {
    throw new Error(
      `Invalid or missing target material kind in source profile: ${args.profilePath}`,
    );
  }

  return {
    target_material_kind: rawKind,
    profile_path: path.resolve(args.profilePath),
    title: firstMarkdownHeading(args.markdown),
    support_summary: compactSectionText(args.markdown, "Support Status"),
    scan_targets: parseScanTargets(args.markdown),
  };
}

export async function loadReconstructSourceProfiles(
  profilesRoot: string,
): Promise<ReconstructSourceProfile[]> {
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
  return (
    profiles.find(
      (profile) => profile.target_material_kind === args.targetMaterialKind,
    ) ?? null
  );
}
