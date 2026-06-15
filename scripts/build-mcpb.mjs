#!/usr/bin/env node
// Build the onto `.mcpb` Desktop Extension bundle (Phase 1 item 4).
//
// Produces `build/mcpb/onto.mcpb` — a zip of `manifest.json` plus the runnable
// onto server (compiled `dist/`, `bin/`, `.onto/` resources, and the 4 pure-JS
// prod deps). Claude Desktop launches the staged server with `user_config`
// substituted into its env; a first-run bootstrap inside `onto mcp` consumes
// that env once to seed `~/.onto/settings.json`.
//
// Pipeline:
//   1. `npm run build:ts-core`             — compile dist/ in the repo.
//   2. stage build/mcpb/onto/              — copy runnable tree + a SANITIZED
//                                            package.json (drops prepare/postinstall).
//   3. `npm ci --omit=dev --ignore-scripts --no-audit --no-fund` in the stage.
//   4. post-stage assertion                — isOntoRoot(stage) + dist/cli.js + bin/onto.
//   5. `mcpb validate` then `mcpb pack`    — validate the manifest, zip the bundle.
//
// BLOCKER fix (see plan §"Validation incorporated"): the staged package.json is
// sanitized to DROP `prepare` (= `npm run build:ts-core`, which runs `tsc` and
// first `rm -rf dist`) and `postinstall`. A verbatim package.json would, under
// `npm ci`, delete the staged dist/ and then fail (no tsc in the pruned tree).
//
// Idempotent: the stage dir is removed and rebuilt on every run.
// Node built-ins only (fs, path, child_process).
//
// Usage: node scripts/build-mcpb.mjs   (or: npm run build:mcpb)

import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = path.join(repoRoot, "build", "mcpb");
const stageDir = path.join(buildDir, "onto");
const outputMcpb = path.join(buildDir, "onto.mcpb");
const manifestSrc = path.join(repoRoot, "packaging", "mcpb", "manifest.json");

// Directory entries copied verbatim into the stage.
const STAGE_DIRS = [
  "dist",
  "bin",
  path.join(".onto", "roles"),
  path.join(".onto", "domains"),
  path.join(".onto", "authority"),
  path.join(".onto", "processes"),
  path.join(".onto", "principles"),
];

// File entries copied verbatim into the stage (package.json is sanitized, not
// copied verbatim — see writeSanitizedPackageJson).
const STAGE_FILES = [
  "package-lock.json",
  "CLAUDE.md",
  "AGENTS.md",
  "settings.example.json",
];

function log(msg) {
  process.stdout.write(`[build-mcpb] ${msg}\n`);
}

function fail(msg) {
  process.stderr.write(`[build-mcpb] ERROR: ${msg}\n`);
  process.exit(1);
}

function assertExists(rel, label) {
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) {
    fail(`${label} not found at ${abs}`);
  }
  return abs;
}

// 1. Compile dist/ in the repo before staging.
function buildTsCore() {
  log("npm run build:ts-core");
  execSync("npm run build:ts-core", { cwd: repoRoot, stdio: "inherit" });
}

// Copy a directory verbatim (recursive). Node >=16.7 has fs.cpSync.
function copyDir(rel) {
  const src = assertExists(rel, `stage dir "${rel}"`);
  const dest = path.join(stageDir, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

function copyFile(rel) {
  const src = assertExists(rel, `stage file "${rel}"`);
  const dest = path.join(stageDir, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

// Sanitize package.json: drop `prepare`/`postinstall` (install-time scripts that
// would destroy the staged dist), keep everything the runtime + npm ci need.
function writeSanitizedPackageJson() {
  const srcPkg = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  );
  const scripts = { ...(srcPkg.scripts ?? {}) };
  delete scripts.prepare;
  delete scripts.postinstall;

  const staged = {
    name: srcPkg.name,
    version: srcPkg.version,
    type: srcPkg.type,
    bin: srcPkg.bin,
    scripts,
    dependencies: srcPkg.dependencies,
    engines: srcPkg.engines,
  };

  // Guard the BLOCKER-fix invariants explicitly.
  if (staged.name !== "onto-mcp") fail(`sanitized package.json name must be "onto-mcp", got ${staged.name}`);
  if (staged.type !== "module") fail(`sanitized package.json type must be "module", got ${staged.type}`);
  if (!staged.bin || !staged.bin.onto) fail("sanitized package.json must keep bin.onto");
  if (staged.scripts.prepare || staged.scripts.postinstall) {
    fail("sanitized package.json still has prepare/postinstall");
  }

  const dest = path.join(stageDir, "package.json");
  fs.writeFileSync(dest, `${JSON.stringify(staged, null, 2)}\n`);
}

// 2. Stage the runnable tree into build/mcpb/onto/ (clean first → idempotent).
function stage() {
  log(`clean stage: ${stageDir}`);
  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.mkdirSync(stageDir, { recursive: true });

  log("copy dirs + files");
  for (const dir of STAGE_DIRS) copyDir(dir);
  for (const file of STAGE_FILES) copyFile(file);

  // manifest.json (data-only, authored under packaging/mcpb/). The bundle
  // `version` mirrors package.json (single source of truth), so sync it into the
  // staged manifest rather than copying a possibly-stale authored value.
  if (!fs.existsSync(manifestSrc)) {
    fail(
      `manifest not found at ${manifestSrc}. ` +
        "Author packaging/mcpb/manifest.json first (plan §2).",
    );
  }
  const pkgVersion = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  ).version;
  const manifest = JSON.parse(fs.readFileSync(manifestSrc, "utf8"));
  manifest.version = pkgVersion;
  fs.writeFileSync(
    path.join(stageDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  writeSanitizedPackageJson();
}

// 3. Bundle prod deps inside the stage. --ignore-scripts is what makes the
//    sanitized package.json's absent prepare/postinstall a non-issue anyway, but
//    we drop them too so a manual `npm install` in the stage is also safe.
function installProdDeps() {
  log("npm ci --omit=dev --ignore-scripts --no-audit --no-fund (in stage)");
  execSync("npm ci --omit=dev --ignore-scripts --no-audit --no-fund", {
    cwd: stageDir,
    stdio: "inherit",
  });
}

// 4. Post-stage assertion (fail loud). isOntoRoot is reused from the STAGED
//    compiled output — not reimplemented — so the bundle's own root marker logic
//    is what verifies the stage.
async function assertStage() {
  log("post-stage assertion");
  const cliJs = path.join(stageDir, "dist", "cli.js");
  const binOnto = path.join(stageDir, "bin", "onto");
  if (!fs.existsSync(cliJs)) fail(`stage missing dist/cli.js (${cliJs})`);
  if (!fs.existsSync(binOnto)) fail(`stage missing bin/onto (${binOnto})`);

  const ontoHomeMod = path.join(stageDir, "dist", "core-runtime", "discovery", "onto-home.js");
  if (!fs.existsSync(ontoHomeMod)) fail(`stage missing onto-home.js (${ontoHomeMod})`);
  const { isOntoRoot } = await import(`file://${ontoHomeMod}`);
  if (typeof isOntoRoot !== "function") fail("staged onto-home.js does not export isOntoRoot");
  if (!isOntoRoot(stageDir)) {
    fail(`isOntoRoot(stage) is not satisfied for ${stageDir} (check package.json name + .onto/roles + .onto/authority)`);
  }
  log("stage is a valid onto root (dist/cli.js + bin/onto present)");
}

// 5. validate + pack via the @anthropic-ai/mcpb CLI. Subcommands confirmed from
//    `npx @anthropic-ai/mcpb --help`:
//      validate <manifest>          — validate the manifest file
//      pack [directory] [output]    — zip the staged directory into a .mcpb
//    Wrapped so a network / CLI-missing failure prints a clear "run manually"
//    note and exits non-zero (never a silent pass).
function runMcpb(args, manualHint) {
  try {
    execFileSync("npx", ["--yes", "@anthropic-ai/mcpb", ...args], {
      cwd: repoRoot,
      stdio: "inherit",
    });
  } catch (err) {
    process.stderr.write(
      `[build-mcpb] ERROR: \`mcpb ${args[0]}\` failed (network unreachable or CLI missing?).\n` +
        `[build-mcpb] message: ${err && err.message ? err.message : String(err)}\n` +
        `[build-mcpb] Run manually once @anthropic-ai/mcpb is reachable:\n` +
        `[build-mcpb]   ${manualHint}\n`,
    );
    process.exit(1);
  }
}

function validateManifest() {
  const stagedManifest = path.join(stageDir, "manifest.json");
  log(`mcpb validate ${path.relative(repoRoot, stagedManifest)}`);
  runMcpb(
    ["validate", stagedManifest],
    `npx @anthropic-ai/mcpb validate ${stagedManifest}`,
  );
}

function packBundle() {
  log(`mcpb pack ${path.relative(repoRoot, stageDir)} -> ${path.relative(repoRoot, outputMcpb)}`);
  runMcpb(
    ["pack", stageDir, outputMcpb],
    `npx @anthropic-ai/mcpb pack ${stageDir} ${outputMcpb}`,
  );
}

async function main() {
  fs.mkdirSync(buildDir, { recursive: true });
  buildTsCore();
  stage();
  installProdDeps();
  await assertStage();
  validateManifest();
  packBundle();
  log(`done: ${path.relative(repoRoot, outputMcpb)}`);
}

main().catch((err) => {
  fail(err && err.message ? err.message : String(err));
});
