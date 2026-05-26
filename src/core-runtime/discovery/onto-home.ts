import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { walkUpFor } from "./walk-up.js";

/**
 * Validates whether a directory is an onto installation root.
 *
 * Marker: package.json with name "onto-mcp" AND `.onto/roles/` AND
 * `.onto/authority/`. An install must be on the canonical `.onto/`
 * layout to be recognized.
 */
export function isOntoRoot(dir: string): boolean {
  try {
    const pkgPath = path.join(dir, "package.json");
    if (!fs.existsSync(pkgPath)) return false;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    if (pkg.name !== "onto-mcp") return false;
    if (!fs.existsSync(path.join(dir, ".onto", "roles"))) return false;
    if (!fs.existsSync(path.join(dir, ".onto", "authority"))) return false;
    return true;
  } catch {
    return false;
  }
}

function buildInvalidHomeError(label: string, resolved: string): string {
  return (
    `Invalid ${label}: ${resolved}. ` +
    `Expected package.json with name "onto-mcp", .onto/roles/ and .onto/authority/ directories.`
  );
}

/**
 * Resolves the onto installation directory.
 *
 * Precedence (CLI flag > env > auto-detection):
 * 1. --onto-home CLI flag
 * 2. ONTO_HOME environment variable
 * 3. Walk up from executing script location
 * 4. Walk up from CWD
 */
export function resolveOntoHome(
  ontoHomeFlag: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string {
  // 1. CLI flag (highest precedence)
  if (typeof ontoHomeFlag === "string" && ontoHomeFlag.length > 0) {
    const resolved = path.resolve(ontoHomeFlag);
    if (!isOntoRoot(resolved)) {
      throw new Error(buildInvalidHomeError("onto home", resolved));
    }
    return resolved;
  }

  // 2. ONTO_HOME env
  const envHome = env.ONTO_HOME;
  if (typeof envHome === "string" && envHome.length > 0) {
    const resolved = path.resolve(envHome);
    if (!isOntoRoot(resolved)) {
      throw new Error(buildInvalidHomeError("ONTO_HOME", resolved));
    }
    return resolved;
  }

  // 3. Walk up from executing script location
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const fromScript = walkUpFor(scriptDir, isOntoRoot);
  if (fromScript) return fromScript;

  // 4. Walk up from CWD
  const fromCwd = walkUpFor(process.cwd(), isOntoRoot);
  if (fromCwd) return fromCwd;

  throw new Error(
    "Cannot locate onto-mcp installation. Set ONTO_HOME, pass --onto-home, or run from the onto-mcp repository.",
  );
}
