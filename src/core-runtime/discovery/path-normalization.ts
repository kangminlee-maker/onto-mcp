/**
 * Path-segment utilities.
 *
 * Originally introduced to centralize path aliases during the repo-layout
 * migration. The alias list is now empty and the
 * rewrite helper is effectively identity. What remains load-bearing is the
 * segment-bound prefix check — still consumed by drift-engine and
 * promote-principle validation to prevent near-miss prefix collisions
 * (e.g., `.onto/principlesABC/` must not match `.onto/principles`).
 */

/**
 * Segment-bound prefix check for directory paths.
 *
 * `dir` is the directory prefix; trailing slash is optional (normalized
 * internally). A path is considered inside `dir` only when it starts
 * with `dir + "/"` followed by at least one character — never when the
 * prefix ends mid-segment, and never when the path is the bare directory.
 *
 *   startsWithDirPrefix("a/b/c.md", "a")      → true
 *   startsWithDirPrefix("a/b/c.md", "a/")     → true
 *   startsWithDirPrefix("ab/c.md",  "a")      → false  (segment boundary)
 *   startsWithDirPrefix("a",        "a")      → false  (not a path under a)
 *   startsWithDirPrefix(".onto/principlesABC/x.md", ".onto/principles") → false
 */
export function startsWithDirPrefix(relPath: string, dir: string): boolean {
  const normalized = dir.endsWith("/") ? dir : dir + "/";
  return relPath.length > normalized.length && relPath.startsWith(normalized);
}
