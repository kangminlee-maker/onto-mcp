#!/usr/bin/env node
// Compute the next onto-mcp version under the two-digit carry policy.
//
// Policy: the patch (last) and minor (second) positions each hold 0–99. A bump
// carries to the next position only when a position would exceed 99 — so the
// version does not climb to a new minor/major prematurely:
//   0.4.6 -> 0.4.7 -> ... -> 0.4.99 -> 0.5.0 -> ... -> 0.99.99 -> 1.0.0
//
// Read-only: prints the next version to stdout. The release flow then runs
//   npm version "$(node scripts/next-version.mjs [patch|minor|major])" -m "..."
// which performs the package.json bump, commit, and tag.
//
// Usage: node scripts/next-version.mjs [patch|minor|major]   (default: patch)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MAX = 99; // two-digit cap for patch and minor

const bump = (process.argv[2] ?? "patch").trim();
if (!["patch", "minor", "major"].includes(bump)) {
  process.stderr.write(`Unknown bump type: ${bump} (use patch|minor|major)\n`);
  process.exit(1);
}

const pkgPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "package.json",
);
const version = JSON.parse(fs.readFileSync(pkgPath, "utf8")).version;
const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(String(version));
if (!match) {
  process.stderr.write(`Cannot parse version: ${version}\n`);
  process.exit(1);
}

let [major, minor, patch] = [Number(match[1]), Number(match[2]), Number(match[3])];

if (bump === "major") {
  major += 1;
  minor = 0;
  patch = 0;
} else if (bump === "minor") {
  patch = 0;
  minor += 1;
  if (minor > MAX) {
    minor = 0;
    major += 1;
  }
} else {
  patch += 1;
  if (patch > MAX) {
    patch = 0;
    minor += 1;
    if (minor > MAX) {
      minor = 0;
      major += 1;
    }
  }
}

process.stdout.write(`${major}.${minor}.${patch}\n`);
