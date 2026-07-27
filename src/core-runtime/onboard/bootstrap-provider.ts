import {
  normalizeLlmModelSwitcher,
  type LlmModelSwitcherConfig,
} from "../llm/model-switcher.js";
import {
  readSettingsAt,
  userSettingsPath,
  resolveReconstructActorLlmSettings,
  type OntoSettings,
} from "../discovery/settings-chain.js";
import { writeProviderSettings, type ProviderSettingsInput } from "./configure-provider.js";

/**
 * First-run provider bootstrap for the `.mcpb` Desktop Extension install path.
 *
 * Claude Desktop launches the onto MCP server with the `user_config` values
 * substituted into the process `env` (the MCPB channel); it does NOT run a
 * setup command. This module consumes that env ONCE at server start to
 * materialize the canonical `~/.onto/settings.json` via the existing
 * `configure-provider` write-path.
 *
 * This is a ONE-TIME materialization of the settings.json authority from
 * install-time env, NOT a runtime authority (INV-CFG-1): no provider/auth/
 * model/effort/retry default lives here; every written value comes from the
 * install env, and a missing/partial seat is materialized while a complete,
 * valid seat is left untouched. The runtime still reads settings.json as the
 * sole settings authority. INV-AUTH-1: when `auth` is absent the value written
 * is the SAME one the loader/model-switcher would derive (read back from
 * `normalizeLlmModelSwitcher`); auth is never inferred from key presence.
 *
 * Secret safety: only the env-var NAME (`api_key_env`) is ever persisted; the
 * API key VALUE stays in env and is never assigned onto any object, logged, or
 * stringified. The failure path emits one stderr line with `error.message`
 * only — never the key, `process.env`, or `error.stack`.
 */

/** Install-time env var NAMES carrying the MCPB `user_config` provider fields. */
export const BOOTSTRAP_ENV = {
  provider: "ONTO_BOOTSTRAP_PROVIDER",
  model: "ONTO_BOOTSTRAP_MODEL",
  auth: "ONTO_BOOTSTRAP_AUTH",
} as const;

/** Env var NAME (not value) under which the API key is supplied and persisted. */
export const PROVIDER_API_KEY_ENV = "ONTO_PROVIDER_API_KEY";

const BOOTSTRAP_FAILURE_PREFIX = "[onto-mcp bootstrap-provider] skipped (write failed):";

/**
 * An unfilled OPTIONAL MCPB `user_config` field substitutes the literal token
 * `"${user_config.<name>}"` into env (not `""`). Treat that literal — and any
 * missing / empty / whitespace value — as ABSENT.
 */
const UNRESOLVED_USER_CONFIG_TOKEN = /^\$\{user_config\..+\}$/;

/**
 * Read a bootstrap env value, treating missing / empty / whitespace / an
 * unresolved `${user_config.*}` placeholder as absent (`undefined`).
 */
function readBootstrapEnv(
  env: NodeJS.ProcessEnv,
  name: string,
): string | undefined {
  const raw = env[name];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  if (UNRESOLVED_USER_CONFIG_TOKEN.test(trimmed)) return undefined;
  return trimmed;
}

export interface BootstrapProviderResult {
  status: "skipped" | "written" | "failed";
  reason?: string;
}

/**
 * Return `true` only when the user seat ALREADY resolves a complete, valid
 * provider route for BOTH the review actors (teamlead/lens/synthesize) and the
 * reconstruct actors (semantic_author/confirmation_provider). A throw / missing
 * / partial / invalid seat resolves `false` so the caller materializes it. We
 * do NOT treat the mere presence of the `review.execution.actors` key as
 * configured (onto issue-007/009).
 */
function userSeatHasCompleteProviderRoute(settings: OntoSettings): boolean {
  const review = settings.review?.execution;
  const reviewActors = [review?.teamlead?.llm, review?.lens?.llm, review?.synthesize?.llm];
  for (const llm of reviewActors) {
    if (!llm) return false;
    // `normalizeLlmModelSwitcher` returns null when provider is absent and
    // throws on an unroutable combination — both mean "not a valid route".
    if (normalizeLlmModelSwitcher(llm) === null) return false;
  }
  // Reconstruct actors require a full llm block (auth+provider+model); the
  // resolver throws when missing/invalid.
  resolveReconstructActorLlmSettings(settings, "semantic_author");
  resolveReconstructActorLlmSettings(settings, "confirmation_provider");
  return true;
}

/**
 * Consume the install-time provider env ONCE to materialize settings.json.
 *
 * Never throws (it runs at server start, off the bundle path). Returns a small
 * result describing whether settings were written, skipped, or failed.
 */
export async function bootstrapProviderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Promise<BootstrapProviderResult> {
  const provider = readBootstrapEnv(env, BOOTSTRAP_ENV.provider);
  const model = readBootstrapEnv(env, BOOTSTRAP_ENV.model);
  if (provider === undefined || model === undefined) {
    return { status: "skipped", reason: "no provider/model bootstrap env" };
  }

  // Sanitize the api-key env BEFORE anything else. A blank optional `api_key`
  // leaves the literal `${user_config.api_key}` (or "") in ONTO_PROVIDER_API_KEY.
  // Runtime credential readers accept any non-empty env value as the key, so an
  // unresolved placeholder would be sent to the provider as a bogus key (401)
  // instead of failing cleanly — including on the idempotency skip path. Clear
  // it from env so readers see it as absent. Only the env-var NAME is ever
  // persisted; the key VALUE is read solely to decide `hasKey` and never stored.
  const rawKey = env[PROVIDER_API_KEY_ENV];
  const trimmedKey = rawKey?.trim();
  const hasKey =
    trimmedKey !== undefined &&
    trimmedKey.length > 0 &&
    !UNRESOLVED_USER_CONFIG_TOKEN.test(trimmedKey);
  if (rawKey !== undefined && !hasKey) {
    delete env[PROVIDER_API_KEY_ENV];
  }

  // Idempotency: skip only when the user seat already resolves a complete,
  // valid provider route. A throw / missing / partial / invalid seat is
  // treated as "not configured" and materialized.
  try {
    const existing = await readSettingsAt(userSettingsPath());
    if (userSeatHasCompleteProviderRoute(existing)) {
      return { status: "skipped", reason: "user seat already configured" };
    }
  } catch {
    // Unreadable / invalid / partial seat -> materialize.
  }

  // INV-AUTH-1-safe: when `auth` is absent, derive the loader-consistent value
  // (the SAME auth the model-switcher would derive) and pass it explicitly so
  // BOTH review and reconstruct actors materialize. This does not infer
  // api_key from key presence.
  //
  // The derivation route deliberately OMITS the `api_key_env` this run may write.
  // The switcher treats a named credential env as the seat declaring the metered
  // route, but here that name would come from this code noticing a key VALUE in
  // the install env — key-presence inference, which is exactly what INV-AUTH-1
  // bars. An installer that wants the paid API route states it as
  // ONTO_BOOTSTRAP_AUTH=api_key.
  let auth = readBootstrapEnv(env, BOOTSTRAP_ENV.auth);
  if (auth === undefined) {
    try {
      const route: LlmModelSwitcherConfig = {
        provider: provider as LlmModelSwitcherConfig["provider"],
        model,
      };
      // An unmatched provider yields no selection; leave `auth` unset and let
      // the write-path loader (zod enum) reject it with fail-no-write.
      const selection = normalizeLlmModelSwitcher(route);
      if (selection) auth = selection.auth;
    } catch (error) {
      process.stderr.write(
        `${BOOTSTRAP_FAILURE_PREFIX} ${
          error instanceof Error ? error.message : String(error)
        }\n`,
      );
      return { status: "failed", reason: "auth derivation failed" };
    }
  }

  const input: ProviderSettingsInput = {
    provider,
    model,
    auth,
    ...(hasKey ? { apiKeyEnv: PROVIDER_API_KEY_ENV } : {}),
  };

  try {
    await writeProviderSettings(input, { target: "user" });
    return { status: "written" };
  } catch (error) {
    // Secret-safe failure path: fixed prefix + error.message ONLY. Never the
    // key, process.env, or error.stack.
    process.stderr.write(
      `${BOOTSTRAP_FAILURE_PREFIX} ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    return { status: "failed", reason: "settings write failed" };
  }
}
