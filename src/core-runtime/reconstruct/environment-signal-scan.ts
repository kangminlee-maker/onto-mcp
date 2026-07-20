import fs from "node:fs/promises";
import path from "node:path";
import {
  KNOWN_SIGNAL_BASENAMES,
  KNOWN_SIGNAL_DOTDIRS,
  KNOWN_SIGNAL_PATH_PATTERNS,
} from "./environment-context-profile.js";

// ─────────────────────────────────────────────────────────────────────────────
// environment-signal-scan — profile-specific known-signal file scan (design 20260720 env-context-
// profile §0 coverage revision, Stage 0.5). The reconstruct target census (target-material-kind
// walk) is bounded at 200 entries / depth 3 and DFS-orders arbitrary directories, so in a large
// repo a big non-manifest directory can exhaust the cap before the walk reaches the root
// package.json (empirically observed on onto-mcp itself). This scan closes that gap: an allowlist-
// driven, BREADTH-FIRST (shallow signals collected before descending into a huge subtree that could
// truncate), path-safe walk that collects ONLY known-signal files — the manifests/configs the
// profile rule catalog can act on, plus `.github/workflows` CI files behind a dotdir allowlist.
//
// SAFETY (design-verify B-3 — new fs-read authority): existence-only (never reads file CONTENT),
// symlinks are NEVER followed (loop/root-escape safety), paths are built by join from a resolved
// root (no `..` escape), and both traversal breadth (dirents) and depth are hard-capped. Collected
// paths are absolute; the caller relativizes + folds them into the census (never emitted raw).
// ─────────────────────────────────────────────────────────────────────────────

/** Deep enough for nested monorepo package roots; still hard-bounded. Internal constant (not user
 *  config, per design — the scan bounds are structural, disclosed via the profile coverage). */
export const ENVIRONMENT_SIGNAL_SCAN_MAX_DEPTH = 8;
/** Total dirents examined across all roots before the scan stops (pathological-tree backstop). */
export const ENVIRONMENT_SIGNAL_SCAN_MAX_DIRENTS = 20_000;

/** Directories never entered (vendored / build output / VCS) — no environment signal lives here. */
const SKIP_DIR_NAMES: ReadonlySet<string> = new Set<string>([
  "node_modules", "vendor", "build", "dist", "out", "coverage", "target", ".git",
]);

export interface EnvironmentSignalScanResult {
  /** Absolute paths of matched known-signal files (sorted, deduped). */
  signals: string[];
  /** Total dirents examined. */
  dirents_visited: number;
  /** True iff the dirent cap was hit — some subtree went unscanned (honest truncation). */
  truncated: boolean;
  /** The structural bounds enforced (echoed to the profile coverage so files below `max_depth` or
   *  beyond `max_dirents` are honestly disclosed as outside-bounds, never a completeness claim). */
  max_depth: number;
  max_dirents: number;
}

function isKnownSignal(absPath: string, relFromRoot: string): boolean {
  if (KNOWN_SIGNAL_BASENAMES.has(path.basename(absPath).toLowerCase())) return true;
  // Normalize separators so path-shape patterns (which use `/`) match on Windows too.
  const rel = relFromRoot.replace(/\\/g, "/");
  for (const pattern of KNOWN_SIGNAL_PATH_PATTERNS) if (pattern.test(rel)) return true;
  return false;
}

/** Scan the given roots for known environment-signal files. Pure fs existence walk — no content
 *  read, no symlink following. Deterministic output; deterministic even under truncation (dirents
 *  are name-sorted before the cap applies, so a cap-limited scan examines the same set every run). */
export async function scanEnvironmentSignalFiles(args: {
  scanRoots: readonly string[];
  maxDepth?: number;
  maxDirents?: number;
}): Promise<EnvironmentSignalScanResult> {
  const maxDepth = args.maxDepth ?? ENVIRONMENT_SIGNAL_SCAN_MAX_DEPTH;
  const maxDirents = args.maxDirents ?? ENVIRONMENT_SIGNAL_SCAN_MAX_DIRENTS;
  const signals = new Set<string>();
  let direntsVisited = 0;
  let truncated = false;

  // ONE interleaved breadth-first queue seeded with EVERY root at depth 0 (deduped, descendants
  // dropped by the caller): the shared dirent cap is then spent level-by-level across all roots, so
  // every root's SHALLOW manifests are collected before any root's deep subtree — a huge first root
  // can never starve a later root out of the budget (the per-root-queue bug this replaces). Each
  // entry carries its own root for path-relative matching.
  const queue: Array<{ dir: string; depth: number; root: string }> = [];
  const seenRoots = new Set<string>();
  for (const root of [...args.scanRoots].sort()) {
    const resolved = path.resolve(root);
    if (seenRoots.has(resolved)) continue;
    seenRoots.add(resolved);
    queue.push({ dir: resolved, depth: 0, root: resolved });
  }
  let head = 0;
  while (head < queue.length && !truncated) {
    const { dir, depth, root } = queue[head++]!;
    let dirents: import("node:fs").Dirent[];
    try {
      dirents = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue; // unreadable dir — skip, never fail the whole scan
    }
    // Sort by name so which dirents fall inside the cap is filesystem-order-independent (a truncated
    // scan is then still deterministic across processes/machines).
    dirents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const dirent of dirents) {
      if (direntsVisited >= maxDirents) {
        truncated = true;
        break;
      }
      direntsVisited += 1;
      if (dirent.isSymbolicLink()) continue; // never follow symlinks (loop / root-escape safety)
      const child = path.join(dir, dirent.name);
      if (dirent.isDirectory()) {
        if (depth + 1 > maxDepth) continue;
        const lower = dirent.name.toLowerCase();
        if (SKIP_DIR_NAMES.has(lower)) continue;
        // dotdirs are skipped unless explicitly allowlisted (e.g. `.github` for CI workflows)
        if (dirent.name.startsWith(".") && !KNOWN_SIGNAL_DOTDIRS.has(lower)) continue;
        queue.push({ dir: child, depth: depth + 1, root });
      } else if (dirent.isFile()) {
        if (isKnownSignal(child, path.relative(root, child))) signals.add(child);
      }
    }
  }
  return {
    signals: [...signals].sort(),
    dirents_visited: direntsVisited,
    truncated,
    max_depth: maxDepth,
    max_dirents: maxDirents,
  };
}
