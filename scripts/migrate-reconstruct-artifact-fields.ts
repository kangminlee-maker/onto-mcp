#!/usr/bin/env tsx
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

type JsonRecord = Record<string, unknown>;

interface CliOptions {
  roots: string[];
  dryRun: boolean;
  includeDevelopmentRecords: boolean;
}

interface MigrationStats {
  scannedFiles: number;
  changedFiles: number;
  renamedFields: number;
  skippedMissingRoots: string[];
  changedPaths: string[];
}

const SKIP_DIRS = new Set([".git", "node_modules", "dist"]);
const OLD_REUSE_POLICY = "authored_artifact_provenance:v1";
const NEW_REUSE_POLICY = "authored_artifact_reuse_match:v1";

function usage(): string {
  return [
    "Usage: npm run migrate:reconstruct-artifact-fields -- [--root <path> ...] [--dry-run] [--include-development-records]",
    "",
    "Default root: .onto/reconstruct",
    "",
    "Migrates current reconstruct artifact field names:",
    "- compatibility_hash -> reuse_match_hash in *.reuse-provenance.yaml",
    "- compatibility -> reuse_match in *.reuse-provenance.yaml",
    "- compatibility_policy -> provenance_match_policy in reconstruct-run-control.yaml resume_rows[]",
    "- compatibility_check_refs -> provenance_match_check_refs in reconstruct-run-control.yaml resume_rows[]",
    "- prompt_visible_fallback_observation_count -> prompt_visible_supplemental_observation_count in YAML/JSON artifacts",
  ].join("\n");
}

function parseArgs(argv: string[]): CliOptions {
  const roots: string[] = [];
  let dryRun = false;
  let includeDevelopmentRecords = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--include-development-records") {
      includeDevelopmentRecords = true;
      continue;
    }
    if (arg === "--root") {
      const value = argv[index + 1];
      if (!value) throw new Error("--root requires a path value");
      roots.push(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }
  return {
    roots: roots.length > 0 ? roots : [".onto/reconstruct"],
    dryRun,
    includeDevelopmentRecords,
  };
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function renameField(
  record: JsonRecord,
  oldKey: string,
  newKey: string,
  stats: MigrationStats,
  mapValue: (value: unknown) => unknown = (value) => value,
): void {
  if (!(oldKey in record)) return;
  const mappedValue = mapValue(record[oldKey]);
  if (newKey in record && stableJson(record[newKey]) !== stableJson(mappedValue)) {
    throw new Error(
      `Cannot migrate both ${oldKey} and ${newKey}; values differ.`,
    );
  }
  record[newKey] = mappedValue;
  delete record[oldKey];
  stats.renamedFields += 1;
}

function mapReusePolicy(value: unknown): unknown {
  if (value === OLD_REUSE_POLICY) return NEW_REUSE_POLICY;
  if (value === NEW_REUSE_POLICY) return value;
  throw new Error(
    `Unknown compatibility_policy value ${JSON.stringify(value)}; expected ${OLD_REUSE_POLICY}.`,
  );
}

function migratePromptMetricFields(value: unknown, stats: MigrationStats): void {
  if (Array.isArray(value)) {
    for (const item of value) migratePromptMetricFields(item, stats);
    return;
  }
  if (!isRecord(value)) return;
  renameField(
    value,
    "prompt_visible_fallback_observation_count",
    "prompt_visible_supplemental_observation_count",
    stats,
  );
  for (const child of Object.values(value)) {
    migratePromptMetricFields(child, stats);
  }
}

function migrateReuseProvenance(value: unknown, stats: MigrationStats): void {
  if (!isRecord(value)) return;
  renameField(value, "compatibility_hash", "reuse_match_hash", stats);
  renameField(value, "compatibility", "reuse_match", stats);
}

function migrateRunControl(value: unknown, stats: MigrationStats): void {
  if (!isRecord(value) || !Array.isArray(value.resume_rows)) return;
  for (const row of value.resume_rows) {
    if (!isRecord(row)) continue;
    renameField(
      row,
      "compatibility_policy",
      "provenance_match_policy",
      stats,
      mapReusePolicy,
    );
    renameField(
      row,
      "compatibility_check_refs",
      "provenance_match_check_refs",
      stats,
    );
  }
}

function shouldHandleFile(filePath: string): boolean {
  return (
    filePath.endsWith(".yaml") ||
    filePath.endsWith(".yml") ||
    filePath.endsWith(".json")
  );
}

function isDevelopmentRecordsPath(filePath: string): boolean {
  return path.resolve(filePath).split(path.sep).includes("development-records");
}

async function listFiles(root: string, options: CliOptions): Promise<string[]> {
  if (!options.includeDevelopmentRecords && isDevelopmentRecordsPath(root)) {
    return [];
  }
  const stat = await fs.stat(root);
  if (stat.isFile()) return shouldHandleFile(root) ? [root] : [];
  if (!stat.isDirectory()) return [];
  const files: string[] = [];
  async function visit(dirPath: string): Promise<void> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (
          !options.includeDevelopmentRecords &&
          isDevelopmentRecordsPath(entryPath)
        ) {
          continue;
        }
        await visit(entryPath);
        continue;
      }
      if (entry.isFile() && shouldHandleFile(entryPath)) {
        files.push(entryPath);
      }
    }
  }
  await visit(root);
  return files;
}

async function migrateFile(filePath: string, options: CliOptions, stats: MigrationStats): Promise<void> {
  const beforeText = await fs.readFile(filePath, "utf8");
  const beforeRenameCount = stats.renamedFields;
  const isJson = filePath.endsWith(".json");
  const parsed = isJson ? JSON.parse(beforeText) : parseYaml(beforeText);
  migratePromptMetricFields(parsed, stats);
  if (path.basename(filePath) === "reconstruct-run-control.yaml") {
    migrateRunControl(parsed, stats);
  }
  if (filePath.endsWith(".reuse-provenance.yaml")) {
    migrateReuseProvenance(parsed, stats);
  }
  if (stats.renamedFields === beforeRenameCount) return;
  stats.changedFiles += 1;
  stats.changedPaths.push(path.resolve(filePath));
  if (options.dryRun) return;
  const afterText = isJson
    ? `${JSON.stringify(parsed, null, 2)}\n`
    : stringifyYaml(parsed);
  await fs.writeFile(filePath, afterText, "utf8");
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const stats: MigrationStats = {
    scannedFiles: 0,
    changedFiles: 0,
    renamedFields: 0,
    skippedMissingRoots: [],
    changedPaths: [],
  };
  for (const rootArg of options.roots) {
    const root = path.resolve(rootArg);
    try {
      const files = await listFiles(root, options);
      for (const filePath of files) {
        stats.scannedFiles += 1;
        await migrateFile(filePath, options, stats);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        stats.skippedMissingRoots.push(root);
        continue;
      }
      throw error;
    }
  }
  console.log(JSON.stringify({
    ok: true,
    dry_run: options.dryRun,
    scanned_files: stats.scannedFiles,
    changed_files: stats.changedFiles,
    renamed_fields: stats.renamedFields,
    skipped_missing_roots: stats.skippedMissingRoots,
    changed_paths: stats.changedPaths,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
