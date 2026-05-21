import fs from "node:fs";
import path from "node:path";
import { walkUpFor } from "./walk-up.js";

/**
 * Checks for .onto/settings.json existence only as a directory marker.
 * Does NOT read config values (diamond dependency prevention).
 */
function hasOntoConfig(dir: string): boolean {
  return fs.existsSync(path.join(dir, ".onto", "settings.json"));
}

function hasGitOrPackageJson(dir: string): boolean {
  return (
    fs.existsSync(path.join(dir, ".git")) ||
    fs.existsSync(path.join(dir, "package.json"))
  );
}

/**
 * Resolves the target project root directory.
 *
 * Precedence:
 * 1. --project-root CLI flag (already handled upstream — this function
 *    is called only when no explicit flag is provided)
 * 2. Walk up from target path for .onto/settings.json
 * 3. Walk up from CWD for .onto/settings.json
 * 4. Walk up from CWD for .git or package.json
 * 5. CWD default
 */
export function resolveProjectRoot(targetPath?: string): string {
  // 2. Walk up from target
  if (typeof targetPath === "string" && targetPath.length > 0) {
    const resolvedTarget = path.resolve(targetPath);
    const startDir = fs.existsSync(resolvedTarget) && fs.statSync(resolvedTarget).isDirectory()
      ? resolvedTarget
      : path.dirname(resolvedTarget);
    const fromTarget = walkUpFor(startDir, hasOntoConfig);
    if (fromTarget) return fromTarget;
  }

  // 3. Walk up from CWD for .onto/settings.json
  const fromCwdConfig = walkUpFor(process.cwd(), hasOntoConfig);
  if (fromCwdConfig) return fromCwdConfig;

  // 4. Walk up from CWD for .git or package.json
  const fromCwdGit = walkUpFor(process.cwd(), hasGitOrPackageJson);
  if (fromCwdGit) return fromCwdGit;

  // 5. CWD default
  return process.cwd();
}
