import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredRuntimeFiles = [
  "dist/core-runtime/llm/dispatch-fallback-adapter-capabilities.js",
  "dist/core-runtime/llm/sealed-dispatch-capability.js",
  "dist/core-runtime/llm/structured-dispatch-error.js",
  "dist/core-runtime/reconstruct/dispatch-fallback-artifacts.js",
] as const;
const requiredSourceFiles = [
  "src/core-runtime/discovery/settings-chain.ts",
  "src/core-runtime/llm/dispatch-fallback-adapter-capabilities.ts",
  "src/core-runtime/llm/sealed-dispatch-capability.ts",
  "src/core-runtime/llm/structured-dispatch-error.ts",
  "src/core-runtime/reconstruct/dispatch-fallback-artifacts.ts",
] as const;
const requiredPackagedFiles = [
  ...requiredRuntimeFiles,
  "settings.example.json",
  ".onto/processes/reconstruct/reconstruct-contract-registry.yaml",
] as const;
const sdkDependencies = ["openai", "@anthropic-ai/sdk"] as const;

function run(command: string, args: string[], cwd = root): string {
  return execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

function assertRequiredFiles(
  base: string,
  label: string,
  requiredFiles: readonly string[],
): void {
  if (requiredFiles.length === 0) {
    throw new Error(`${label} parity subject set is empty.`);
  }
  for (const relative of requiredFiles) {
    const candidate = path.join(base, relative);
    const stat = fs.existsSync(candidate) ? fs.statSync(candidate) : null;
    if (!stat?.isFile() || stat.size === 0) {
      throw new Error(`${label} is missing dispatch fallback runtime file: ${relative}`);
    }
  }
}

function assertPathSet(
  paths: ReadonlySet<string>,
  label: string,
  requiredFiles: readonly string[],
): void {
  for (const relative of requiredFiles) {
    if (!paths.has(relative)) {
      throw new Error(`${label} is missing dispatch fallback file: ${relative}`);
    }
  }
}

assertRequiredFiles(root, "source tree", requiredSourceFiles);
const settingsExample = JSON.parse(
  fs.readFileSync(path.join(root, "settings.example.json"), "utf8")
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n"),
) as { reconstruct?: { execution?: { dispatch_fallback?: { enabled?: unknown } } } };
if (settingsExample.reconstruct?.execution?.dispatch_fallback?.enabled !== false) {
  throw new Error("settings.example.json must parse with dispatch_fallback explicitly disabled.");
}
const registry = parseYaml(
  fs.readFileSync(
    path.join(root, ".onto/processes/reconstruct/reconstruct-contract-registry.yaml"),
    "utf8",
  ),
) as { artifact_authorities?: Record<string, { authority_ref?: string }> };
for (const [key, authorityRef] of [
  ["dispatch_fallback_activation", "dispatch-fallback-activation.yaml"],
  ["dispatch_fallback_outcome", "dispatch-fallback-outcome.yaml"],
] as const) {
  if (registry.artifact_authorities?.[key]?.authority_ref !== authorityRef) {
    throw new Error(`reconstruct registry is missing ${key}=${authorityRef}.`);
  }
}

run("npm", ["run", "build:ts-core"]);
run("node", ["scripts/build-mcpb.mjs", "--stage-only"]);

for (const relative of requiredSourceFiles.filter((file) =>
  file.includes("dispatch-fallback") || file.includes("sealed-dispatch") || file.includes("structured-dispatch")
)) {
  const distRelative = relative
    .replace(/^src\//, "dist/")
    .replace(/\.ts$/, ".js");
  if (
    fs.statSync(path.join(root, distRelative)).mtimeMs <
    fs.statSync(path.join(root, relative)).mtimeMs
  ) {
    throw new Error(`fresh dist file predates its source: ${distRelative}`);
  }
}

const mcpbStage = path.join(root, "build", "mcpb", "onto");
const rootPackage = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as {
  dependencies: Record<string, string>;
};
const rootLock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8")) as {
  packages: Record<string, { version?: string }>;
};
const stagedPackage = JSON.parse(fs.readFileSync(path.join(mcpbStage, "package.json"), "utf8")) as {
  dependencies: Record<string, string>;
};
for (const dependency of sdkDependencies) {
  const declared = rootPackage.dependencies[dependency];
  const locked = rootLock.packages[`node_modules/${dependency}`]?.version;
  if (!declared || declared !== locked || !/^\d+\.\d+\.\d+$/.test(declared)) {
    throw new Error(
      `dispatch fallback SDK dependency must be exact and lock-matched: ${dependency} declared=${declared ?? "missing"} locked=${locked ?? "missing"}`,
    );
  }
  if (stagedPackage.dependencies[dependency] !== declared) {
    throw new Error(`MCPB stage dependency drift for ${dependency}.`);
  }
}
assertRequiredFiles(mcpbStage, "MCPB stage", requiredPackagedFiles);
const mcpbMutationTarget = path.join(mcpbStage, requiredPackagedFiles[0]);
const mcpbMutationBackup = `${mcpbMutationTarget}.deleted-mutation`;
fs.renameSync(mcpbMutationTarget, mcpbMutationBackup);
let mcpbMutationRejected = false;
try {
  assertRequiredFiles(mcpbStage, "MCPB stage mutation", requiredPackagedFiles);
} catch {
  mcpbMutationRejected = true;
} finally {
  fs.renameSync(mcpbMutationBackup, mcpbMutationTarget);
}
if (!mcpbMutationRejected) {
  throw new Error("dispatch fallback MCPB deletion mutation passed vacuously.");
}

const pack = JSON.parse(run("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"])) as Array<{
  files: Array<{ path: string }>;
}>;
const packedPaths = new Set(pack[0]?.files.map((entry) => entry.path) ?? []);
assertPathSet(packedPaths, "npm package manifest", requiredPackagedFiles);
const packedMutationPaths = new Set(packedPaths);
packedMutationPaths.delete(requiredPackagedFiles[0]);
let manifestMutationRejected = false;
try {
  assertPathSet(packedMutationPaths, "npm package manifest mutation", requiredPackagedFiles);
} catch {
  manifestMutationRejected = true;
}
if (!manifestMutationRejected) {
  throw new Error("dispatch fallback npm manifest deletion mutation passed vacuously.");
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "onto-dispatch-fallback-parity-"));
try {
  const npmPackJson = JSON.parse(run("npm", ["pack", "--json", "--ignore-scripts"], root)) as Array<{
    filename: string;
  }>;
  const filename = npmPackJson[0]?.filename;
  if (!filename) throw new Error("npm pack did not report an archive filename.");
  const archive = path.join(root, filename);
  run("tar", ["-xzf", archive, "-C", tempRoot]);
  fs.rmSync(archive, { force: true });
  const extractedPackage = path.join(tempRoot, "package");
  assertRequiredFiles(extractedPackage, "fresh npm archive", requiredPackagedFiles);
  const mutationTarget = path.join(extractedPackage, requiredPackagedFiles[0]);
  const mutationBackup = `${mutationTarget}.deleted-mutation`;
  fs.renameSync(mutationTarget, mutationBackup);
  let mutationRejected = false;
  try {
    assertRequiredFiles(extractedPackage, "fresh npm archive mutation", requiredPackagedFiles);
  } catch {
    mutationRejected = true;
  } finally {
    fs.renameSync(mutationBackup, mutationTarget);
  }
  if (!mutationRejected) {
    throw new Error("dispatch fallback package parity deletion mutation passed vacuously.");
  }
  const packedPackage = JSON.parse(
    fs.readFileSync(path.join(extractedPackage, "package.json"), "utf8"),
  ) as { dependencies: Record<string, string> };
  for (const dependency of sdkDependencies) {
    if (
      packedPackage.dependencies[dependency] !==
      rootPackage.dependencies[dependency]
    ) {
      throw new Error(`fresh npm archive dependency drift for ${dependency}.`);
    }
  }
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

process.stdout.write("dispatch fallback package parity: ok\n");
