/**
 * Review UX Redesign P5 — pure helper for `onto config set <key> <value>`.
 *
 * # What this module is
 *
 * A small set of pure functions that translate the user-facing key-path
 * vocabulary (`subagent.provider`, `max_concurrent_lenses`,
 * `teamlead.model`, etc.) into mutations on an `OntoReviewConfig` object.
 * Callers pass the current config + key + raw string value; the helper
 * returns the mutated config OR a structured error explaining why the
 * assignment is invalid.
 *
 * # Why it exists
 *
 * `onto config set subagent.provider codex` must (1) type-coerce the value,
 * (2) respect the discriminated-union semantics of `SubagentSpec`, and
 * (3) refuse paths that would produce an invalid config even before calling
 * the main validator. Putting this in a pure module lets both the `set`
 * subcommand and the `edit` subcommand share the exact same write semantics
 * without duplicating coercion logic.
 *
 * # How it relates
 *
 * - Input : current `OntoReviewConfig` + dotted key path + raw string value.
 * - Output: `{ ok: true, config }` or `{ ok: false, error }`.
 * - Next stage: caller feeds the returned config into `validateReviewConfig`
 *   then `writeReviewBlock`. This helper performs SHAPE coercion only;
 *   semantic constraints are the validator's job.
 */

import type {
  LensDeliberation,
  OntoReviewConfig,
  SubagentProvider,
  SubagentSpec,
} from "../discovery/config-chain.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SetSuccess {
  ok: true;
  config: OntoReviewConfig;
}

export interface SetFailure {
  ok: false;
  error: string;
}

export type SetResult = SetSuccess | SetFailure;

/**
 * Supported user-facing key paths. `set` rejects anything else with a hint
 * pointing to the `edit` subcommand for fields that need richer input
 * (notably external-teamlead spec objects).
 */
export const SUPPORTED_SET_PATHS = [
  "teamlead.model",
  "subagent.provider",
  "subagent.model_id",
  "subagent.effort",
  "max_concurrent_lenses",
  "lens_deliberation",
] as const;

export type SupportedSetPath = (typeof SUPPORTED_SET_PATHS)[number];

const SUBAGENT_PROVIDER_VALUES: readonly SubagentProvider[] = [
  "main-native",
  "codex",
];

const LENS_DELIBERATION_VALUES: readonly LensDeliberation[] = [
  "controlled-lens-deliberation",
];

/**
 * Apply a `set key value` mutation and return the resulting config.
 *
 * Does NOT invoke `validateReviewConfig` — the caller is responsible for
 * running the full validator against the returned object before writing.
 * This separation lets `edit` (which performs multiple sets in a session)
 * validate once at the end, and `set` (single-shot) validate immediately.
 */
export function applySet(
  current: OntoReviewConfig,
  path: string,
  rawValue: string,
): SetResult {
  if (!isSupportedPath(path)) {
    return {
      ok: false,
      error:
        `Unknown key path "${path}". Supported paths: ${SUPPORTED_SET_PATHS.join(
          ", ",
        )}. ` +
        "For external teamlead specs or multi-field changes, use `onto config edit`.",
    };
  }

  // Deep-clone the current config so the mutation is pure.
  const next: OntoReviewConfig = structuredClone(current);

  switch (path) {
    case "teamlead.model":
      return setTeamleadModel(next, rawValue);
    case "subagent.provider":
      return setSubagentProvider(next, rawValue);
    case "subagent.model_id":
      return setSubagentModelId(next, rawValue);
    case "subagent.effort":
      return setSubagentEffort(next, rawValue);
    case "max_concurrent_lenses":
      return setMaxConcurrentLenses(next, rawValue);
    case "lens_deliberation":
      return setLensDeliberation(next, rawValue);
  }
}

// ---------------------------------------------------------------------------
// Per-path handlers
// ---------------------------------------------------------------------------

function setTeamleadModel(
  config: OntoReviewConfig,
  rawValue: string,
): SetResult {
  if (rawValue === "main") {
    config.teamlead = { model: "main" };
    return { ok: true, config };
  }
  return {
    ok: false,
    error:
      `teamlead.model via \`set\` only accepts "main" (the host main session). ` +
      "Use `onto config edit` to configure an external teamlead provider " +
      "(requires provider + model_id + optional effort).",
  };
}

function setSubagentProvider(
  config: OntoReviewConfig,
  rawValue: string,
): SetResult {
  if (!(SUBAGENT_PROVIDER_VALUES as readonly string[]).includes(rawValue)) {
    return {
      ok: false,
      error:
        `subagent.provider must be one of: ${SUBAGENT_PROVIDER_VALUES.join(", ")} (got "${rawValue}").`,
    };
  }

  const provider = rawValue as SubagentProvider;
  const prev = config.subagent;

  if (provider === "main-native") {
    // Switching to main-native drops any model_id / effort from the
    // foreign branch — they are not allowed under the main-native branch
    // per the discriminated union.
    config.subagent = { provider: "main-native" };
    return { ok: true, config };
  }

  // Foreign provider — carry over model_id/effort if previously set (same
  // provider or different foreign provider). Missing model_id is caught
  // later by `validateReviewConfig`, not here, because the user may be
  // composing the change in multiple `set` calls.
  const prevModelId =
    prev && prev.provider !== "main-native" ? prev.model_id : "";
  const prevEffort =
    prev && prev.provider !== "main-native" ? prev.effort : undefined;
  const nextSpec: SubagentSpec = {
    provider,
    model_id: prevModelId,
    ...(prevEffort !== undefined ? { effort: prevEffort } : {}),
  };
  config.subagent = nextSpec;
  return { ok: true, config };
}

function setSubagentModelId(
  config: OntoReviewConfig,
  rawValue: string,
): SetResult {
  if (rawValue.length === 0) {
    return {
      ok: false,
      error: "subagent.model_id cannot be empty.",
    };
  }
  const prev = config.subagent;
  if (!prev || prev.provider === "main-native") {
    return {
      ok: false,
      error:
        "subagent.model_id can only be set when subagent.provider is codex. " +
        "Set subagent.provider first, or use `onto config edit`.",
    };
  }
  // Type narrowing: prev.provider is ForeignProvider here, so model_id is required.
  config.subagent = {
    provider: prev.provider,
    model_id: rawValue,
    ...(prev.effort !== undefined ? { effort: prev.effort } : {}),
  };
  return { ok: true, config };
}

function setSubagentEffort(
  config: OntoReviewConfig,
  rawValue: string,
): SetResult {
  if (rawValue.length === 0) {
    return {
      ok: false,
      error: "subagent.effort cannot be empty (omit the field to clear it).",
    };
  }
  const prev = config.subagent;
  if (!prev || prev.provider === "main-native") {
    return {
      ok: false,
      error:
        "subagent.effort can only be set when subagent.provider is a foreign provider. " +
        "For main-native, effort is host-managed (not expressible in OntoReviewConfig).",
    };
  }
  config.subagent = {
    provider: prev.provider,
    model_id: prev.model_id,
    effort: rawValue,
  };
  return { ok: true, config };
}

function setMaxConcurrentLenses(
  config: OntoReviewConfig,
  rawValue: string,
): SetResult {
  // Accept decimal integers only. Reject floats, hex, negative, zero.
  if (!/^\d+$/.test(rawValue)) {
    return {
      ok: false,
      error:
        `max_concurrent_lenses must be a positive decimal integer (got "${rawValue}").`,
    };
  }
  const n = Number.parseInt(rawValue, 10);
  if (n < 1) {
    return {
      ok: false,
      error: "max_concurrent_lenses must be >= 1.",
    };
  }
  config.max_concurrent_lenses = n;
  return { ok: true, config };
}

function setLensDeliberation(
  config: OntoReviewConfig,
  rawValue: string,
): SetResult {
  if (!(LENS_DELIBERATION_VALUES as readonly string[]).includes(rawValue)) {
    return {
      ok: false,
      error:
        `lens_deliberation must be one of: ${LENS_DELIBERATION_VALUES.join(", ")} (got "${rawValue}").`,
    };
  }
  config.lens_deliberation = rawValue as LensDeliberation;
  return { ok: true, config };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isSupportedPath(path: string): path is SupportedSetPath {
  return (SUPPORTED_SET_PATHS as readonly string[]).includes(path);
}
