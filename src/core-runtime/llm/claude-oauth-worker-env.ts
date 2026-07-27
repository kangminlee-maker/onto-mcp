/**
 * Environment for a Claude Code OAuth worker spawn (`claude -p …`).
 *
 * The runtime declares this route as `billing_mode: "subscription"`. That label
 * is only true if the child cannot reach a metered credential, and a plain
 * `spawn()` inherits the whole parent environment — so the declaration has to be
 * ENFORCED here rather than asserted in a comment.
 *
 * Claude Code's documented credential precedence puts every one of these ABOVE
 * the logged-in subscription session, and in non-interactive `-p` mode an
 * ambient API key is always used when present (there is no flag that forces the
 * subscription; removing the variables is the only supported control):
 *
 *   cloud provider selectors → ANTHROPIC_AUTH_TOKEN → ANTHROPIC_API_KEY
 *   → apiKeyHelper → CLAUDE_CODE_OAUTH_TOKEN → subscription OAuth
 *
 * `CLAUDE_CODE_OAUTH_TOKEN` is deliberately KEPT: it is itself an OAuth
 * credential, so honoring it does not turn a subscription route into a metered
 * one. Everything above it is removed, plus the seat's own configured
 * credential-env name when it has one — that variable exists to fund the
 * `auth: "api_key"` route, and a seat that asked for the worker route must not
 * spend it.
 */

/** Credential/selector variables that outrank the subscription session. */
const METERED_CREDENTIAL_ENV_NAMES = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
  "CLAUDE_CODE_USE_FOUNDRY",
] as const;

/**
 * The environment a `claude -p` OAuth worker may see: `base` minus every
 * credential that would silently redirect it off the subscription session.
 * Pure — it copies rather than mutating `base`.
 */
export function claudeOauthWorkerEnv(
  base: NodeJS.ProcessEnv,
  options?: { configuredApiKeyEnv?: string | undefined },
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base };
  for (const name of METERED_CREDENTIAL_ENV_NAMES) delete env[name];
  const configured = options?.configuredApiKeyEnv;
  if (configured !== undefined && configured.length > 0) delete env[configured];
  return env;
}

/** The variable names {@link claudeOauthWorkerEnv} removes (tests/diagnostics). */
export function claudeOauthWorkerStrippedEnvNames(): readonly string[] {
  return METERED_CREDENTIAL_ENV_NAMES;
}
