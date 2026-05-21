/**
 * Atomic profile adoption for review config chain.
 *
 * # What this module is
 *
 * A policy module that enforces **atomic profile ownership** when merging
 * project `.onto/config.yml` over global `~/.onto/config.yml`:
 *
 *   - Provider-coupled fields (`llm`, `main_llm`, `lens_agent_teams_mode`)
 *     belong to ONE
 *     source only. Either the project owns the whole profile, or the global
 *     does — never a frankenstein merge.
 *   - Orthogonal fields (output_language, domains, review_mode, etc.) remain
 *     free to merge field-by-field because they carry no cross-provider
 *     semantics.
 *
 * # How it relates
 *
 * `adoptProfile()` is called from `resolveConfigChain()`. It returns the
 * adopted profile fields (one source, or empty when neither side declared
 * any). `resolveConfigChain()` is the single integration seat for review
 * callers.
 *
 * The atomic-ownership principle is preserved: `extractProfileFields`
 * still transfers PROFILE_FIELDS as a group, so frankenstein merges
 * remain impossible.
 */

import type { OntoConfig } from "./config-chain.js";

// ---------------------------------------------------------------------------
// Profile vs orthogonal field partitioning
// ---------------------------------------------------------------------------

/**
 * Top-level OntoConfig keys whose semantics are coupled to the provider choice.
 * A single source owns the entire set per adoption cycle.
 */
export const PROFILE_FIELDS = new Set<keyof OntoConfig>([
  "llm",
  "main_llm",
  "lens_agent_teams_mode",
]);

/**
 * Orthogonal fields (output language, domain scope, listing limits, etc.)
 * continue to merge last-wins across home → project. These do not encode
 * provider-coupled semantics.
 */
function isOrthogonalField(key: string): boolean {
  return !PROFILE_FIELDS.has(key as keyof OntoConfig);
}

/**
 * SSOT predicate for "does this config declare a non-empty `review:` axis
 * block?". This is consumed only by `claimsProfileOwnership`
 * below (the atomic-adoption ownership signal).
 *
 * A block counts as declared when it is a non-null object with at least
 * one key. An empty `review: {}` does not count.
 *
 * Accepts either a typed `OntoConfig` or a raw `Record<string, unknown>`
 * for compatibility with callers that read YAML before typing.
 */
export function hasReviewBlock(
  config: OntoConfig | Record<string, unknown> | undefined,
): boolean {
  if (config === undefined || config === null) return false;
  const review = (config as { review?: unknown }).review;
  if (typeof review !== "object" || review === null) return false;
  return Object.keys(review as Record<string, unknown>).length > 0;
}

// ---------------------------------------------------------------------------
// Profile field presence
// ---------------------------------------------------------------------------

/**
 * Does this config declare ANY PROFILE_FIELDS value? Used by `adoptProfile`
 * to decide which side owns the profile slice. Returns true when at least
 * one profile field is set to a non-empty value.
 */
export function hasAnyProfileField(config: OntoConfig): boolean {
  for (const field of PROFILE_FIELDS) {
    const value = (config as Record<string, unknown>)[field as string];
    if (value === undefined || value === null) continue;
    if (typeof value === "object" && !Array.isArray(value)) {
      if (Object.keys(value as object).length === 0) continue;
    }
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Profile extraction
// ---------------------------------------------------------------------------

/**
 * Extract only profile-scoped fields from a config. Orthogonal fields are
 * dropped — this is the "profile slice" that adoption transfers atomically.
 */
export function extractProfileFields(
  config: OntoConfig,
): Partial<OntoConfig> {
  const out: Record<string, unknown> = {};
  for (const field of PROFILE_FIELDS) {
    const value = (config as Record<string, unknown>)[field as string];
    if (value !== undefined && value !== null) {
      out[field as string] = value;
    }
  }
  return out as Partial<OntoConfig>;
}

// ---------------------------------------------------------------------------
// Adoption
// ---------------------------------------------------------------------------

export interface ProfileAdoptionInputs {
  home: OntoConfig;
  project: OntoConfig;
  /** Path where home config is expected (displayed for traceability). */
  homePath: string;
  /** Path where project config is expected (displayed for traceability). */
  projectPath: string;
  /** Whether home === project (e.g., running against the onto repo itself). */
  sameRoot: boolean;
}

/**
 * Result of an adoption cycle.
 *
 * Typed as a discriminated union on `source` so callers receive
 * type-level guarantees:
 *   - `source: "project" | "global"` → `source_path` is a concrete string
 *     and `profile` may contain any Partial<OntoConfig> shape.
 *   - `source: "none"` → `source_path` is null and `profile` is {}.
 *
 * Narrowing on `source` in consumer code lets the compiler reject
 * impossible states (e.g. reading `source_path.toString()` when source
 * is "none" fails to typecheck).
 */
export type ProfileAdoption =
  | {
      source: "project" | "global";
      profile: Partial<OntoConfig>;
      source_path: string;
    }
  | {
      source: "none";
      profile: Record<string, never>;
      source_path: null;
    };

/**
 * Does this config claim profile ownership? A side claims ownership when it
 * declares either any PROFILE_FIELDS value OR a non-empty `review:` axis
 * block. The axis block is orthogonal-merged (not part of the profile slice
 * itself), but its presence signals "I opted in to declaring this review
 * setup" — which is strong enough to commit that side to owning whatever
 * profile fields accompany it.
 */
function claimsProfileOwnership(config: OntoConfig): boolean {
  return hasAnyProfileField(config) || hasReviewBlock(config);
}

/**
 * Adopt exactly one profile atomically.
 *
 * # Decision table
 *
 *   sameRoot                              → home/project are the same file, treat as global
 *   project claims ownership              → adopt project
 *   project does not, home claims         → adopt home
 *   neither claims                        → empty profile, source="none"
 *
 * # What "claims ownership" means
 *
 * Either a non-empty `review:` axis block OR any PROFILE_FIELDS value.
 * See `claimsProfileOwnership` above.
 *
 * # Atomic ownership invariant
 *
 * When `source === "project"`, home's profile fields never appear in
 * `profile`. When `source === "global"`, project's profile fields never
 * appear. `extractProfileFields` is the enforcement point — it takes
 * from one source only. Frankenstein merges remain impossible.
 */
export function adoptProfile(args: ProfileAdoptionInputs): ProfileAdoption {
  if (args.sameRoot) {
    // Single-root case: home === project, so home's profile IS project's.
    // Report as "global" for traceability (the home path is the canonical
    // path for same-root runs).
    if (claimsProfileOwnership(args.home)) {
      return {
        profile: extractProfileFields(args.home),
        source: "global",
        source_path: args.homePath,
      };
    }
    return { profile: {}, source: "none", source_path: null };
  }

  if (claimsProfileOwnership(args.project)) {
    return {
      profile: extractProfileFields(args.project),
      source: "project",
      source_path: args.projectPath,
    };
  }

  if (claimsProfileOwnership(args.home)) {
    return {
      profile: extractProfileFields(args.home),
      source: "global",
      source_path: args.homePath,
    };
  }

  return { profile: {}, source: "none", source_path: null };
}

// ---------------------------------------------------------------------------
// Orthogonal merge utility (used by resolveConfigChain)
// ---------------------------------------------------------------------------

/**
 * Merge orthogonal (non-profile) fields from home and project with last-wins
 * semantics. `excluded_names` uses union merge.
 */
export function mergeOrthogonalFields(
  home: OntoConfig,
  project: OntoConfig,
): Partial<OntoConfig> {
  const merged: Partial<OntoConfig> = {};
  for (const [key, value] of Object.entries(home)) {
    if (!isOrthogonalField(key) || value === undefined || value === null)
      continue;
    (merged as Record<string, unknown>)[key] = value;
  }
  for (const [key, value] of Object.entries(project)) {
    if (!isOrthogonalField(key) || value === undefined || value === null)
      continue;
    if (key === "excluded_names") {
      const homeNames = Array.isArray(home.excluded_names)
        ? home.excluded_names
        : [];
      const projectNames = Array.isArray(value) ? (value as string[]) : [];
      (merged as Record<string, unknown>)[key] = [
        ...new Set([...homeNames, ...projectNames]),
      ];
    } else {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}
