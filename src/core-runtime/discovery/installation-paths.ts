import fs from "node:fs";
import path from "node:path";

/**
 * Installation resource path resolver — canonical `.onto/` layout only.
 *
 * Phase 0-6 (2026-04-20 / 2026-04-21) migrated every top-level structural
 * directory (commands / domains / roles / processes / principles / authority)
 * into the `.onto/` namespace. The resolver accepts only the current
 * branch — projects must be on the `.onto/` layout to be recognized as
 * an onto installation root. There is no more dual-path dispatch.
 *
 * If a project has not yet migrated, the intended escalation path is to
 * run `scripts/repo-layout-migration-replace.py` (retained for future
 * similar migrations) and move the directories under `.onto/`.
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
      `Installation may be corrupted, or the project may still be on a ` +
      `pre-migration layout — run scripts/repo-layout-migration-replace.py ` +
      `to migrate to the .onto/ layout.`,
  );
}

/** Test helper — clears the cache so tests can swap fixture installations. */
export function __resetInstallationPathCacheForTesting(): void {
  cache.clear();
}
