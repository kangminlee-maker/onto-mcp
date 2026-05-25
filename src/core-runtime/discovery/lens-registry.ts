import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveInstallationPath } from "./installation-paths.js";

interface CoreLensRegistry {
  full_review_lens_ids: string[];
  core_axis_lens_ids: string[];
  core_role_ids: string[];
  always_include_lens_ids: string[];
}

export function canonicalizeLensId(id: string): string {
  return id;
}

let cached: CoreLensRegistry | null = null;

function findRegistryPath(): string {
  // Walk up from this file to find {installRoot}/.onto/authority/core-lens-registry.yaml.
  // resolveInstallationPath is the single installation-resource resolver.
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  let current = __dirname;
  const root = path.parse(current).root;
  while (current !== root) {
    try {
      const authorityDir = resolveInstallationPath("authority", current);
      const candidate = path.join(authorityDir, "core-lens-registry.yaml");
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // This ancestor is not an install root — keep walking.
    }
    current = path.dirname(current);
  }
  throw new Error("Cannot find .onto/authority/core-lens-registry.yaml");
}

function parseYamlSimple(text: string): Record<string, string[]> {
  // Minimal YAML parser for flat string arrays only
  const result: Record<string, string[]> = {};
  let currentKey: string | null = null;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || trimmed.length === 0) continue;
    if (!trimmed.startsWith("-") && trimmed.endsWith(":")) {
      currentKey = trimmed.slice(0, -1);
      result[currentKey] = [];
    } else if (trimmed.startsWith("- ") && currentKey) {
      result[currentKey]!.push(trimmed.slice(2).trim());
    }
  }
  return result;
}

export function loadCoreLensRegistry(): CoreLensRegistry {
  if (cached) return cached;
  const registryPath = findRegistryPath();
  const text = fs.readFileSync(registryPath, "utf8");
  const raw = parseYamlSimple(text);
  cached = {
    full_review_lens_ids: (raw.full_review_lens_ids ?? []).map(canonicalizeLensId),
    core_axis_lens_ids: (raw.core_axis_lens_ids ?? []).map(canonicalizeLensId),
    core_role_ids: (raw.core_role_ids ?? []).map(canonicalizeLensId),
    always_include_lens_ids: (raw.always_include_lens_ids ?? []).map(canonicalizeLensId),
  };
  return cached;
}
