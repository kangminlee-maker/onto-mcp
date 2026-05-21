import path from "node:path";
import { fileExists, readYamlDocument } from "../review/review-artifact-utils.js";
import {
  adoptProfile,
  mergeOrthogonalFields,
} from "./config-profile.js";
import type { LlmModelSwitcherConfig } from "../llm/model-switcher.js";

export interface OntoConfig {
  /**
   * Canonical model switcher.
   *
   * Two axes only:
   *   - auth: api_key | oauth | local
   *   - provider: openai | anthropic | grok | lmstudio
   *
   * Runtime mapping:
   *   - openai + oauth   → codex CLI subprocess
   *   - openai + api_key → OpenAI API
   *   - anthropic + api_key → Anthropic API
   *   - grok + api_key → xAI/Grok OpenAI-style API
   *   - lmstudio + local → local OpenAI-style endpoint
   */
  llm?: LlmModelSwitcherConfig;
  /** Review mode: core-axis | full */
  review_mode?: string;
  max_concurrent_lenses?: number | string;
  domain?: string;
  secondary_domains?: string[] | string;
  domains?: string[];
  excluded_names?: string[];
  max_listing_depth?: number | string;
  max_listing_entries?: number | string;
  max_embed_lines?: number | string;
  output_language?: string;
  /**
   * Learning extraction mode for review sessions.
   * Valid values: disabled | shadow | active
   * Resolution priority: env var ONTO_LEARNING_EXTRACT_MODE > this field > default (disabled).
   * - disabled: extractor is skipped (Newly Learned sections are written to round1 files but not processed)
   * - shadow: extractor runs and writes manifest but does NOT update live project learnings
   * - active: extractor runs and updates {project}/.onto/learnings/{agent-id}.md
   */
  learning_extract_mode?: string;
  /** Main LLM configuration for TS-owned orchestration steps. */
  main_llm?: {
    provider?: string;
    model?: string;
    base_url?: string;
    max_tokens?: number;
  };

  /**
   * Double opt-in for topology `cc-teams-lens-agent-deliberation` (sketch v3 §3).
   *
   * Even when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is set in the
   * Claude Code environment, the deliberation-enabled topology activates
   * only if this field is `true` — because keeping lens agents alive for
   * SendMessage A2A deliberation rounds materially changes memory and
   * latency characteristics, so we require explicit per-project consent.
   *
   * Profile-coupled: adopts atomically with the rest of the provider
   * profile (see `config-profile.ts` PROFILE_FIELDS).
   */
  lens_agent_teams_mode?: boolean;

  /**
   * Review execution axis block. Runtime derives topology from these fields.
   */
  review?: OntoReviewConfig;
}

// ---------------------------------------------------------------------------
// Review UX Redesign P1 — user-facing axis schema (2026-04-20)
// ---------------------------------------------------------------------------

/** Axis E — lens-to-lens deliberation channel. */
export type LensDeliberation = "synthesizer-only" | "sendmessage-a2a";

/** Foreign (non-host) provider identifiers. */
export type ForeignProvider = "codex";

/** Subagent provider domain — host-native or foreign. */
export type SubagentProvider = "main-native" | ForeignProvider;

/**
 * Explicit foreign-model spec — used by teamlead override or foreign subagent.
 * `main-native` cannot carry model_id / effort (enforced by the discriminated
 * union on SubagentSpec and by the "main" | ExplicitModelSpec union on
 * TeamleadSpec.model).
 */
export interface ExplicitModelSpec {
  provider: ForeignProvider;
  model_id: string;
  /** Provider-specific reasoning-effort domain (see design doc §2.2 F). */
  effort?: string;
}

/** Axis A — teamlead model. */
export interface TeamleadSpec {
  /** `"main"` = host main context (Claude Code / Codex CLI session). */
  model: "main" | ExplicitModelSpec;
}

/**
 * Axis B — subagent model. Discriminated union: `main-native` branch has no
 * model fields; foreign branches require model_id.
 */
export type SubagentSpec =
  | { provider: "main-native" }
  | {
      provider: ForeignProvider;
      model_id: string;
      effort?: string;
    };

/**
 * User-facing review execution config.
 */
export interface OntoReviewConfig {
  teamlead?: TeamleadSpec;
  subagent?: SubagentSpec;
  /** Axis C — user override of provider-default concurrency. */
  max_concurrent_lenses?: number;
  /** Axis E. */
  lens_deliberation?: LensDeliberation;
}

async function readConfigAt(dir: string): Promise<OntoConfig> {
  const configPath = path.join(dir, ".onto", "config.yml");
  if (!(await fileExists(configPath))) {
    return {};
  }
  const raw = await readYamlDocument<Record<string, unknown>>(configPath);
  if (raw === null || typeof raw !== "object") {
    return {};
  }
  assertKnownConfigKeys(raw, configPath);
  return raw as OntoConfig;
}

const TOP_LEVEL_CONFIG_KEYS = [
  "llm",
  "review",
  "review_mode",
  "max_concurrent_lenses",
  "domain",
  "secondary_domains",
  "domains",
  "excluded_names",
  "max_listing_depth",
  "max_listing_entries",
  "max_embed_lines",
  "output_language",
  "learning_extract_mode",
  "main_llm",
  "lens_agent_teams_mode",
] as const;

function assertKnownConfigKeys(
  raw: Record<string, unknown>,
  configPath: string,
): void {
  const allowed = new Set<string>(TOP_LEVEL_CONFIG_KEYS);
  const unknown = Object.keys(raw).filter((key) => !allowed.has(key));
  if (unknown.length === 0) return;
  throw new Error(
    [
      `Unsupported .onto config key(s) in ${configPath}: ${unknown.join(", ")}`,
      "Supported top-level keys:",
      `  ${TOP_LEVEL_CONFIG_KEYS.join(", ")}`,
      "LLM selection belongs under:",
      "  llm:",
      "    auth: oauth | api_key | local",
      "    provider: openai | anthropic | grok | lmstudio",
      "    model: <model-id>",
      "    effort: high",
      "    base_url: <optional>",
    ].join("\n"),
  );
}

/**
 * Orthogonal-only config chain resolver.
 *
 * # What this is
 *
 * Reads home + project `.onto/config.yml`, merges ONLY the orthogonal
 * fields (output_language, domains, review_mode, learning_extract_mode,
 * etc. — see `config-profile.ts:PROFILE_FIELDS` for the complement set),
 * and returns the merged partial config without running `adoptProfile`.
 *
 * # Why this exists
 *
 * Callers that only need a single orthogonal field (e.g.,
 * `resolveReviewSessionExtractMode` reading `learning_extract_mode`) do
 * NOT need provider-profile validation. Routing them through
 * `resolveConfigChain` caused false fail-fast throws once PR #96's atomic
 * profile adoption started rejecting "no provider profile declared"
 * configs — a test/tooling fixture that cares only about orthogonal
 * settings would be blocked by an unrelated profile gate.
 *
 * # How it relates
 *
 * Same underlying `readConfigAt` + `mergeOrthogonalFields` that
 * `resolveConfigChain` uses, sequenced without profile adoption.
 * Callers that need a full config continue to use `resolveConfigChain`.
 */
export async function resolveOrthogonalConfigChain(
  ontoHome: string,
  projectRoot: string,
): Promise<Partial<OntoConfig>> {
  const homeConfig = await readConfigAt(ontoHome);
  const sameRoot = ontoHome === projectRoot;
  const projectConfig = sameRoot ? homeConfig : await readConfigAt(projectRoot);
  return mergeOrthogonalFields(homeConfig, projectConfig);
}

/**
 * Config chain resolver (home + project) with atomic profile adoption.
 *
 * # Behavior
 *
 *   - Project declares any profile fields  → project owns the profile atomically.
 *   - Project declares none, home declares some → global profile adopted silently.
 *   - Neither side declares any profile fields → empty profile returned.
 *
 * Orthogonal fields (output_language, domains, review_mode, listing limits,
 * learning_extract_mode, etc.) continue to merge last-wins — they do not
 * carry cross-provider semantics.
 *
 * # Why atomic adoption still runs
 *
 * Atomic ownership prevents mixed provider state from different config files.
 * `extractProfileFields` + `adoptProfile` transfer PROFILE_FIELDS as a group
 * from exactly one source.
 */
export async function resolveConfigChain(
  ontoHome: string,
  projectRoot: string,
): Promise<OntoConfig> {
  const homeConfig = await readConfigAt(ontoHome);
  const sameRoot = ontoHome === projectRoot;
  const projectConfig = sameRoot ? homeConfig : await readConfigAt(projectRoot);

  const homePath = path.join(ontoHome, ".onto", "config.yml");
  const projectPath = path.join(projectRoot, ".onto", "config.yml");

  const adoption = adoptProfile({
    home: homeConfig,
    project: projectConfig,
    homePath,
    projectPath,
    sameRoot,
  });

  const orthogonal = mergeOrthogonalFields(homeConfig, projectConfig);
  const merged = { ...orthogonal, ...adoption.profile } as OntoConfig;

  return merged;
}
