/**
 * Shared types for `onto install` — the interactive + non-interactive
 * first-run setup command.
 *
 * Design reference: spec v3 laid out in the install command design
 * discussion (2026-04-21 session). Key decisions codified here:
 *
 *   1. Two provider channels: review (for 9-lens execution) and learn
 *      (for background tasks — learn/govern/promote). They may share
 *      a provider or be configured separately.
 *
 *   2. `main-native` is a valid ReviewProvider but NOT a valid
 *      LearnProvider. The background ladder in llm-caller.ts does not
 *      support host main-model delegation (fail-fast on missing
 *      credentials). The type-level exclusion prevents accidentally
 *      writing a learn config that would always fail at runtime.
 *
 *   3. API keys are never captured into typed decision shape — they
 *      flow via environment (env var or `.env` file) only. This keeps
 *      secrets out of logs, serialized state, and command history.
 *
 *   4. Profile scope is atomic (per config-profile.ts adoption rule) —
 *      either global owns the full profile set or project does. The
 *      scope choice is what determines where every file writes.
 */

/** Review (lens + synthesize) execution provider. */
export type ReviewProvider =
  | "main-native"
  | "codex"
  | "anthropic"
  | "openai"
  | "litellm";

/**
 * Background task (learn/govern/promote) provider.
 *
 * `main-native` excluded — the cost-order ladder in llm-caller.ts
 * requires at least one external credential; host delegation is an
 * execution realization concept not part of that ladder.
 */
export type LearnProvider = Exclude<ReviewProvider, "main-native">;

/** Per-file profile location. */
export type ProfileScope = "global" | "project";

/**
 * Fully resolved install decisions — the SSOT used by the writer.
 *
 * Every path through install (interactive flow, flag-driven
 * non-interactive flow, environment defaults) must produce this
 * shape before any file is written. Keeping writers pure w.r.t.
 * this type makes both modes share the same serialization logic.
 */
export interface InstallDecisions {
  profileScope: ProfileScope;
  reviewProvider: ReviewProvider;
  learnProvider: LearnProvider;
  outputLanguage: "ko" | "en";
  /** Required when review or learn provider === "litellm". */
  litellmBaseUrl?: string;
}

/**
 * Parsed CLI flags / env vars — pre-resolution shape.
 *
 * Undefined fields represent "not yet decided" — they will be
 * resolved via interactive prompt (default mode) or trigger an
 * error in non-interactive mode when required.
 *
 * `learnProvider === "same"` is a convenience meaning "use whatever
 * the review provider is (assuming compatible)". It's resolved to
 * a concrete LearnProvider during orchestration, or errors if the
 * review provider is main-native.
 */
export interface InstallFlags {
  nonInteractive: boolean;
  reconfigure: boolean;
  skipValidation: boolean;
  dryRun: boolean;
  profileScope?: ProfileScope;
  reviewProvider?: ReviewProvider;
  learnProvider?: LearnProvider | "same";
  outputLanguage?: "ko" | "en";
  litellmBaseUrl?: string;
  envFile?: string;
}

/**
 * Snapshot of the pre-install environment — what already exists,
 * what the host is, what credentials are reachable.
 *
 * Captured up-front so the interactive flow can show sensible
 * defaults without re-scanning at each prompt, and the
 * non-interactive flow can report clearly what it's assuming.
 */
export interface PreflightDetection {
  existingGlobalConfig: boolean;
  existingProjectConfig: boolean;
  hasAnthropicKey: boolean;
  hasOpenAiKey: boolean;
  hasLitellmBaseUrl: boolean;
  litellmBaseUrlValue?: string;
  hasCodexBinary: boolean;
  hasCodexAuth: boolean;
  /** Whether the current process is running inside a Claude Code session. */
  hostIsClaudeCode: boolean;
}

/**
 * Secrets captured during interactive auth steps.
 *
 * Kept distinct from `InstallDecisions` for three reasons:
 *
 *   1. Values are sensitive — separating them makes it obvious which
 *      fields must never be logged or persisted in state files.
 *   2. Non-interactive mode skips this struct entirely; keys flow via
 *      the process env / `--env-file` path instead.
 *   3. The writer merges these into the existing `.env` rather than
 *      overwriting, so the install flow contributes only the keys it
 *      actually captured this session.
 *
 * All fields optional. Presence implies "user provided this in the
 * current install session and writer should persist it".
 */
export interface EnvSecrets {
  anthropicApiKey?: string;
  openaiApiKey?: string;
  /** `LITELLM_BASE_URL` env var — required for litellm provider. */
  litellmBaseUrl?: string;
  /** Optional — only when the litellm endpoint enforces auth. */
  litellmApiKey?: string;
}

/** Destination paths derived from the chosen ProfileScope. */
export interface InstallPaths {
  /** The scope's `.onto/config.yml` target. */
  configYmlPath: string;
  /** Secrets file — `KEY=VALUE` per line, mode 0600. */
  envPath: string;
  /** Tracked template file listing env vars needed by current config. */
  envExamplePath: string;
  /** Only set for project scope — project's root `.gitignore`. */
  gitignorePath?: string;
  /** The `.onto/` directory to ensure exists. */
  ontoDir: string;
}
