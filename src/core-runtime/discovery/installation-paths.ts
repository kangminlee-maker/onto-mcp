import fs from "node:fs";
import path from "node:path";

/**
 * Installation resource path resolver — canonical `.onto/` layout only.
 *
 * The resolver accepts only the current branch: install resources live under
 * `.onto/`. Missing resources are treated as corrupted installation state.
 */

export type InstallationResourceKind =
  | "authority"
  | "principles"
  | "processes"
  | "roles"
  | "commands"
  | "domains";

const NEW_LAYOUT_ROOT = ".onto";

const cache = new Map<string, string>();

export function resolveInstallationPath(
  kind: InstallationResourceKind,
  installRoot: string,
): string {
  const cacheKey = `${installRoot}::${kind}`;
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;

  const canonicalPath = path.join(installRoot, NEW_LAYOUT_ROOT, kind);
  if (fs.existsSync(canonicalPath)) {
    cache.set(cacheKey, canonicalPath);
    return canonicalPath;
  }

  throw new Error(
    `[installation-paths] .onto/${kind}/ not found under ${installRoot}. ` +
      `Installation resources must live under the .onto/ layout.`,
  );
}

/** Test helper — clears the cache so tests can swap fixture installations. */
export function __resetInstallationPathCacheForTesting(): void {
  cache.clear();
}
