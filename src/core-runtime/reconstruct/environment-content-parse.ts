import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  JSON_DEP_MANIFEST_BASENAMES,
  sanitizeVersionConstraint,
  UNSUPPORTED_DEP_MANIFEST_BASENAMES,
  type ManifestParseStatus,
} from "./environment-context-profile.js";

// ─────────────────────────────────────────────────────────────────────────────
// environment-content-parse — Stage 3a static manifest content parsing (design 20260721
// env-context-profile Stage 3a §2). A SIBLING to environment-signal-scan.ts: the impure fs boundary
// that reads the CONTENT of the dependency manifests the profile catalog can act on and returns a
// bounded, closed-form projection (declared dependency NAMES, a sanitized runtime-version constraint,
// module type). The pure assembler (environment-context-profile.ts) matches names against the closed
// catalog and emits ONLY matches — a raw dependency name never reaches the profile output.
//
// SAFETY (design-verify B-3 / gpt #9 — a NEW fs-read authority, static-only):
//  · NO new traversal: content_parse never discovers a path. It re-reads only the absolute paths the
//    path-safe scan (+ census) already vetted, and only those whose basename is a known dep manifest.
//  · static-only: native JSON.parse. NO code execution — a JS/Ruby/TOML config (next.config.js,
//    Gemfile, Cargo.toml) is `unsupported`, never eval'd/require'd/imported.
//  · path-safety per read: re-lstat (regular file only — a symlink is refused, closing the scan→read
//    TOCTOU window) + within-allowed-root containment + a hard byte cap (a truncated read is marked
//    honestly, never silently completed).
//  · closed-vocabulary barrier on the ONE value channel: a version constraint is charset-restricted +
//    shape-validated, so a dependency path/org (`file:../x`, `github:org/repo`) can never leak.
// ─────────────────────────────────────────────────────────────────────────────

/** Max bytes read per manifest — a pathological-file backstop. A package.json is rarely more than a
 *  few KB; a file over the cap is marked `truncated` (its content is not trusted / not parsed), never
 *  silently treated as complete. Not folded into the fingerprint directly: the content_sha256 of the
 *  bytes actually read captures any cap effect (a smaller cap → fewer bytes → different digest). */
export const ENVIRONMENT_CONTENT_PARSE_MAX_BYTES = 512 * 1024;

/** One statically-parsed manifest, keyed by ABSOLUTE path (the caller relativizes to the profile's
 *  rel_path key). `declared_packages` is internal transit data — the assembler emits only catalog
 *  matches. `content_sha256` is the digest of the bytes read (null when nothing was read). */
export interface ParsedManifest {
  abs_path: string;
  status: ManifestParseStatus;
  declared_packages: string[];
  runtime_version_constraint: string | null;
  module_type: string | null;
  content_sha256: string | null;
}

/** package.json dependency fields whose KEYS are declared package names. */
const PACKAGE_JSON_DEP_FIELDS = [
  "dependencies", "devDependencies", "peerDependencies", "optionalDependencies",
] as const;

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Read at most `maxBytes` from a REGULAR file (never a symlink — re-lstat guards the scan→read TOCTOU
 *  window). Returns the (possibly capped) text + whether the cap was exceeded, or null when the path
 *  is not a readable regular file. Never follows a symlink to escape the vetted root. */
async function readCappedRegularFile(
  absPath: string,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean } | null> {
  let stat: import("node:fs").Stats;
  try {
    stat = await fs.lstat(absPath); // lstat: does NOT follow a symlink
  } catch {
    return null;
  }
  if (!stat.isFile()) return null; // a symlink / dir / socket is refused (never read)
  let handle: fs.FileHandle;
  try {
    handle = await fs.open(absPath, "r");
  } catch {
    return null;
  }
  try {
    const buffer = Buffer.alloc(maxBytes + 1);
    const { bytesRead } = await handle.read(buffer, 0, maxBytes + 1, 0);
    const truncated = bytesRead > maxBytes;
    const text = buffer.subarray(0, Math.min(bytesRead, maxBytes)).toString("utf8");
    return { text, truncated };
  } catch {
    // Best-effort: a per-file read error (a race after open, a transient fs fault) skips this file —
    // it never fails the whole parse (content_parse is disclosure-only augmentation, not a hard dep).
    return null;
  } finally {
    await handle.close();
  }
}

/** Extract declared package names + closed properties from package.json text. Returns "parse_error"
 *  on malformed / non-object JSON (honest — never fabricated). Package names are lowercased for
 *  catalog matching; they are internal transit data (the assembler emits only matches). */
function extractPackageJson(text: string):
  | { declared_packages: string[]; runtime_version_constraint: string | null; module_type: string | null }
  | "parse_error" {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return "parse_error";
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return "parse_error";
  const obj = value as Record<string, unknown>;
  const declared = new Set<string>();
  for (const field of PACKAGE_JSON_DEP_FIELDS) {
    const deps = obj[field];
    if (deps !== null && typeof deps === "object" && !Array.isArray(deps)) {
      for (const name of Object.keys(deps as Record<string, unknown>)) declared.add(name.toLowerCase());
    }
  }
  let runtime_version_constraint: string | null = null;
  const engines = obj.engines;
  if (engines !== null && typeof engines === "object" && !Array.isArray(engines)) {
    const node = (engines as Record<string, unknown>).node;
    if (typeof node === "string") runtime_version_constraint = sanitizeVersionConstraint(node);
  }
  const type = obj.type;
  const module_type = type === "module" || type === "commonjs" ? type : null;
  return { declared_packages: [...declared], runtime_version_constraint, module_type };
}

/** Whether `absPath` is inside one of the allowed roots (a root itself or a descendant). Defense-in-
 *  depth: the candidates already come from the path-safe scan/census, but content_parse re-asserts
 *  containment before any read so a stray ref can never widen the read surface. */
function isWithinAllowedRoots(absPath: string, allowedRoots: readonly string[]): boolean {
  return allowedRoots.some((root) => absPath === root || absPath.startsWith(root + path.sep));
}

/** Statically parse the dependency manifests among `candidatePaths` (absolute). Deterministic output
 *  (sorted by abs_path). A per-file fs failure degrades that file to a skip/`unsupported` — it never
 *  fails the whole parse (best-effort augmentation). Only files whose basename is a known dep manifest
 *  are considered; a JSON dep manifest is parsed, every other dep manifest is `unsupported`. */
export async function parseEnvironmentManifests(args: {
  candidatePaths: readonly string[];
  allowedRoots: readonly string[];
  maxBytes?: number;
}): Promise<ParsedManifest[]> {
  const maxBytes = args.maxBytes ?? ENVIRONMENT_CONTENT_PARSE_MAX_BYTES;
  const allowedRoots = args.allowedRoots.map((r) => path.resolve(r));
  // Dedup by resolved absolute path; keep only known dependency manifests within an allowed root.
  const byAbs = new Map<string, string>(); // abs → lowercased basename
  for (const candidate of args.candidatePaths) {
    const abs = path.resolve(candidate);
    if (byAbs.has(abs)) continue;
    const base = path.basename(abs).toLowerCase();
    const isDepManifest =
      JSON_DEP_MANIFEST_BASENAMES.has(base) || UNSUPPORTED_DEP_MANIFEST_BASENAMES.has(base);
    if (!isDepManifest) continue;
    if (!isWithinAllowedRoots(abs, allowedRoots)) continue; // never read outside the vetted roots
    byAbs.set(abs, base);
  }

  const results: ParsedManifest[] = [];
  for (const [abs, base] of byAbs) {
    if (!JSON_DEP_MANIFEST_BASENAMES.has(base)) {
      // A dependency manifest whose deps we do not extract yet (TOML/text/code/php) — honest gap.
      // Existence-only: content is NOT read (no fs-read for unsupported formats).
      results.push({
        abs_path: abs,
        status: "unsupported",
        declared_packages: [],
        runtime_version_constraint: null,
        module_type: null,
        content_sha256: null,
      });
      continue;
    }
    const read = await readCappedRegularFile(abs, maxBytes);
    if (read === null) continue; // not a readable regular file (e.g. a symlink) — skip, never emit
    const content_sha256 = sha256(read.text);
    if (read.truncated) {
      // Over the cap — content not trusted / not parsed. Honest partial, never silently completed.
      results.push({
        abs_path: abs,
        status: "truncated",
        declared_packages: [],
        runtime_version_constraint: null,
        module_type: null,
        content_sha256,
      });
      continue;
    }
    // package.json is the only JSON dep manifest in scope (owner 2026-07-21).
    const extracted = extractPackageJson(read.text);
    if (extracted === "parse_error") {
      results.push({
        abs_path: abs,
        status: "parse_error",
        declared_packages: [],
        runtime_version_constraint: null,
        module_type: null,
        content_sha256,
      });
      continue;
    }
    results.push({
      abs_path: abs,
      status: "parsed",
      declared_packages: extracted.declared_packages,
      runtime_version_constraint: extracted.runtime_version_constraint,
      module_type: extracted.module_type,
      content_sha256,
    });
  }
  return results.sort((a, b) => (a.abs_path < b.abs_path ? -1 : a.abs_path > b.abs_path ? 1 : 0));
}
