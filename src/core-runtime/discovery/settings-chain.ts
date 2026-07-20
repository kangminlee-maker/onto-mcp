import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import {
  normalizeLlmModelSwitcher,
  type LlmModelSwitcherConfig,
} from "../llm/model-switcher.js";
import type { DispatchBreakerPolicy } from "../llm/dispatch-breaker.js";
import {
  createStructuredFailureRecord,
  type StructuredFailureParams,
} from "../review/failure-records.js";
import { fileExists } from "../review/review-artifact-utils.js";
import type { ReviewStructuredFailureRecord } from "../review/artifact-types.js";
import type { ReviewArtifactGenerationRealization } from "../review/artifact-types.js";
import {
  assertSupportedModelRoutes,
  collectSupportedModelDispatches,
  type EffectiveModelRoute,
  loadSupportedModelRegistry,
  SUPPORTED_MODELS_AUTHORITY_PATH,
  type SupportedModelGateOptions,
} from "./supported-models.js";
import { REVIEW_EXECUTION_UNIT_IDS } from "./review-execution-units.js";

const LlmAuthModeSchema = z.enum(["api_key", "oauth", "local"]);
const LlmProviderSchema = z.enum(["openai", "anthropic", "grok", "lmstudio"]);

const LlmSettingsSchema = z
  .object({
    auth: LlmAuthModeSchema.optional(),
    provider: LlmProviderSchema.optional(),
    model: z.string().min(1).optional(),
    base_url: z.string().min(1).optional(),
    effort: z.string().min(1).optional(),
    service_tier: z.string().min(1).optional(),
    api_key_env: z.string().min(1).optional(),
    // Per-call CLI-worker timeout (ms) for the direct-call route
    // (codex_cli/claude_code); absent → DEFAULT_WORKER_TIMEOUT_MS. Distinct from
    // review `units[].timeout_ms` (worker-process bound). See LlmCallConfig.timeout_ms.
    timeout_ms: z.number().int().min(1).optional(),
  })
  .strict();

const FullLlmSettingsSchema = z
  .object({
    auth: LlmAuthModeSchema,
    provider: LlmProviderSchema,
    model: z.string().min(1),
    base_url: z.string().min(1).optional(),
    effort: z.string().min(1).optional(),
    service_tier: z.string().min(1).optional(),
    api_key_env: z.string().min(1).optional(),
    // Per-call CLI-worker timeout (ms) for the direct-call route
    // (codex_cli/claude_code); absent → DEFAULT_WORKER_TIMEOUT_MS. Distinct from
    // review `units[].timeout_ms` (worker-process bound). See LlmCallConfig.timeout_ms.
    timeout_ms: z.number().int().min(1).optional(),
  })
  .strict();

const ReviewActorLlmSettingsSchema = z
  .object({
    auth: LlmAuthModeSchema.optional(),
    provider: LlmProviderSchema,
    model: z.string().min(1),
    base_url: z.string().min(1).optional(),
    effort: z.string().min(1).optional(),
    service_tier: z.string().min(1).optional(),
    api_key_env: z.string().min(1).optional(),
    // Per-call CLI-worker timeout (ms) for the direct-call route
    // (codex_cli/claude_code); absent → DEFAULT_WORKER_TIMEOUT_MS. Distinct from
    // review `units[].timeout_ms` (worker-process bound). See LlmCallConfig.timeout_ms.
    timeout_ms: z.number().int().min(1).optional(),
  })
  .strict();

// Per-call LLM override (MCP tool surface): an ephemeral settings-`llm` overlay
// applied to the resolved settings for one review/reconstruct invocation, after
// which the existing pipeline runs unchanged. Single-sourced from
// LlmSettingsSchema minus the transport/credential fields (base_url, api_key_env,
// timeout_ms) — those stay settings-owned so a per-call override cannot select an
// arbitrary endpoint or credential env. The chosen provider's transport resolves
// from settings exactly as a settings edit would. .strict() rejects the excluded
// fields. See development-records/design/per-call-llm-override-design-v4.md.
export const PerCallLlmOverrideSchema = LlmSettingsSchema.pick({
  provider: true,
  auth: true,
  model: true,
  effort: true,
  service_tier: true,
}).strict();

export type PerCallLlmOverride = z.infer<typeof PerCallLlmOverrideSchema>;

const LlmRefSchema = LlmSettingsSchema;

const ReviewWorkerSeatSchema = z.enum(["main", "worker"]);
const ReviewExecutionModeSchema = z.enum(["main-workers", "nested-workers"]);
// Who owns the review orchestration loop: onto runtime (A, MCP black-box) vs an
// external host (B, host-orchestration). Distinct from the route-level
// orchestration_locus (where a unit runs). See phase2 host-orchestration design.
const ReviewOrchestrationOwnerSchema = z.enum(["runtime", "host"]);
const ReviewExecutorSelectionSchema = z.enum([
  "auto",
  "codex",
  "direct_call",
]);
const ReviewArtifactGenerationRealizationSchema = z.enum([
  "live",
  "semantic_mock",
  "boundary_stub",
  "fixture",
]);
const ReviewDeliberationSchema = z.enum(["controlled-lens-deliberation"]);
const ReviewLensOutputFormatSchema = z.enum(["markdown", "sidecar"]);
// Unit-id vocabulary lives in a leaf module (review-execution-units.ts) so the
// dispatch-role resolver (supported-models) can bound unit paths without an
// import cycle; re-exported here so existing consumers keep their import site.
export { REVIEW_EXECUTION_UNIT_IDS };
const ReviewExecutionUnitIdSchema = z.enum(REVIEW_EXECUTION_UNIT_IDS);
const ReviewToolModeSchema = z.enum(["auto", "native", "inline"]);
const ReviewSubmitSalvageSettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    transcription_llm: z
      .object({
        provider: z.enum(["anthropic", "openai"]).optional(),
        model: z.string().min(1),
      })
      .strict()
      .optional(),
    delta_completion: z.literal("unit_llm").optional(),
  })
  .strict();
const ReviewUnitResubmitSettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
  })
  .strict();
/** Dispatch limit/transport circuit breaker settings shape (설계 B) — shared
 * by the reconstruct semantic-map loop (`reconstruct.execution.dispatch_breaker`)
 * and the review lens/stance pools (`review.execution.retry.dispatch_breaker`):
 * one concept, one schema, per-pipeline wire keys. */
const DispatchBreakerSettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    systemic_threshold: z.number().int().min(1).optional(),
    per_call_max_attempts: z.number().int().min(1).optional(),
    backoff_initial_ms: z.number().int().min(0).optional(),
    backoff_cap_ms: z.number().int().min(0).optional(),
  })
  .strict();
const DispatchFallbackLlmSettingsSchema = z
  .object({
    provider: z.enum(["openai", "anthropic"]),
    auth: z.literal("api_key"),
    model: z.string().min(1),
    effort: z.string().min(1),
    api_key_env: z.string().min(1),
  })
  .strict();
const DispatchFallbackSettingsSchema = z.discriminatedUnion("enabled", [
  z.object({ enabled: z.literal(false) }).strict(),
  z
    .object({
      enabled: z.literal(true),
      trigger: z.literal("rate_limit"),
      max_fallback_passes: z.literal(1),
      per_dispatch_max_provider_attempts: z.literal(1),
      systemic_failure_threshold: z.literal(1),
      llm: DispatchFallbackLlmSettingsSchema,
    })
    .strict(),
]);
const ReviewRetrySettingsSchema = z
  .object({
    lens_max_retries: z.number().int().min(0).optional(),
    issue_artifact_max_retries: z.number().int().min(0).optional(),
    deliberation_max_retries: z.number().int().min(0).optional(),
    synthesis_max_retries: z.number().int().min(0).optional(),
    retry_initial_delay_ms: z.number().int().min(0).optional(),
    salvage: ReviewSubmitSalvageSettingsSchema.optional(),
    resubmit: ReviewUnitResubmitSettingsSchema.optional(),
    // NOTE: this schema is shared by the V3 INPUT parse and the merged
    // NormalizedSettingsSchema re-validation (via ReviewSettingsSchema), so a
    // key added here survives both — the #167 dual-schema gap class cannot
    // recur for retry keys.
    dispatch_breaker: DispatchBreakerSettingsSchema.optional(),
  })
  .strict();
const ReviewUnitExecutionSettingsSchema = z
  .object({
    llm: LlmSettingsSchema.optional(),
    max_tokens: z.number().int().min(1).optional(),
    tool_mode: ReviewToolModeSchema.optional(),
    timeout_ms: z.number().int().min(1).optional(),
    max_retries: z.number().int().min(0).optional(),
    retry_initial_delay_ms: z.number().int().min(0).optional(),
    max_output_bytes: z.number().int().min(1).optional(),
  })
  .strict();
const ReviewExecutionUnitsSchema = z
  .object({
    lens: ReviewUnitExecutionSettingsSchema.optional(),
    finding_ledger: ReviewUnitExecutionSettingsSchema.optional(),
    finding_relation_graph: ReviewUnitExecutionSettingsSchema.optional(),
    issue_ledger: ReviewUnitExecutionSettingsSchema.optional(),
    issue_stance_matrix: ReviewUnitExecutionSettingsSchema.optional(),
    deliberation_plan: ReviewUnitExecutionSettingsSchema.optional(),
    problem_framing: ReviewUnitExecutionSettingsSchema.optional(),
    issue_stance_response: ReviewUnitExecutionSettingsSchema.optional(),
    deliberation_response: ReviewUnitExecutionSettingsSchema.optional(),
    deliberation_resolution: ReviewUnitExecutionSettingsSchema.optional(),
    synthesis_response: ReviewUnitExecutionSettingsSchema.optional(),
  })
  .strict();

const DEFAULT_REVIEW_EXECUTION = {
  mode: "main-workers",
  orchestration: "runtime",
  executor: "auto",
  artifact_generation_realization: "live",
  teamlead: { seat: "main" },
  lens: { seat: "worker" },
  synthesize: { seat: "worker" },
  deliberation: "controlled-lens-deliberation",
} as const;

/**
 * Dispatch limit/transport circuit breaker for unattended batch dispatch
 * loops (설계 B, 20260704-review-unit-resubmit-and-limit-breaker-design.md
 * §4). Opt-in. Structurally identical to `DispatchBreakerPolicy` in
 * src/core-runtime/llm/dispatch-breaker.ts (the policy consumer). Wired
 * per pipeline: `reconstruct.execution.dispatch_breaker` (semantic-map
 * loop) and `review.execution.retry.dispatch_breaker` (lens/stance pools).
 */
export interface DispatchBreakerSettingsInput {
  enabled?: boolean | undefined;
  systemic_threshold?: number | undefined;
  per_call_max_attempts?: number | undefined;
  backoff_initial_ms?: number | undefined;
  backoff_cap_ms?: number | undefined;
}

/** The completed settings ARE the policy shape the breaker consumes — one
 * concept, one type (the llm module owns it). */
export type DispatchBreakerSettings = DispatchBreakerPolicy;

export const DEFAULT_DISPATCH_BREAKER_SETTINGS = {
  // DEFAULT ON (2026-07-15 owner-directed promotion): the fan-out dispatch
  // breaker (trip/poison/recover) is on unless a setting disables it. Disable
  // with `dispatch_breaker.enabled=false`.
  enabled: true,
  systemic_threshold: 3,
  per_call_max_attempts: 3,
  backoff_initial_ms: 3000,
  backoff_cap_ms: 30000,
} as const satisfies DispatchBreakerSettings;

export function completeDispatchBreakerSettings(
  input: DispatchBreakerSettingsInput | undefined,
): DispatchBreakerSettings {
  return {
    enabled: input?.enabled ?? DEFAULT_DISPATCH_BREAKER_SETTINGS.enabled,
    systemic_threshold:
      input?.systemic_threshold ??
      DEFAULT_DISPATCH_BREAKER_SETTINGS.systemic_threshold,
    per_call_max_attempts:
      input?.per_call_max_attempts ??
      DEFAULT_DISPATCH_BREAKER_SETTINGS.per_call_max_attempts,
    backoff_initial_ms:
      input?.backoff_initial_ms ??
      DEFAULT_DISPATCH_BREAKER_SETTINGS.backoff_initial_ms,
    backoff_cap_ms:
      input?.backoff_cap_ms ?? DEFAULT_DISPATCH_BREAKER_SETTINGS.backoff_cap_ms,
  };
}

const DEFAULT_REVIEW_RETRY_SETTINGS = {
  lens_max_retries: 2,
  issue_artifact_max_retries: 2,
  deliberation_max_retries: 2,
  synthesis_max_retries: 2,
  retry_initial_delay_ms: 3000,
  // DEFAULT ON (2026-07-15 owner-directed promotion): submit-salvage recovery is
  // on in real usage unless disabled with `salvage.enabled=false`. The review-cert
  // harness pins it OFF explicitly (benchmark --no-salvage) for raw, reproducible
  // measurement — that pin is cert-only, not the product default.
  salvage: { enabled: true, delta_completion: "unit_llm" },
  // DEFAULT ON (2026-07-15 owner-directed promotion): bounded unit resubmit on
  // validation rejection is on unless disabled with `resubmit.enabled=false`.
  resubmit: { enabled: true },
  // DEFAULT ON via DEFAULT_DISPATCH_BREAKER_SETTINGS (2026-07-15 promotion).
  dispatch_breaker: DEFAULT_DISPATCH_BREAKER_SETTINGS,
} as const satisfies ReviewRetrySettings;

const DEFAULT_REVIEW_UNIT_TIMEOUT_MS = 240000;
const DEFAULT_REVIEW_SHORT_LLM_UNIT_TIMEOUT_MS = 180000;
const DEFAULT_REVIEW_RUNTIME_UNIT_TIMEOUT_MS = 120000;
const DEFAULT_REVIEW_UNIT_MAX_OUTPUT_BYTES = 524288;

const ReviewActorSettingsSchema = z
  .object({
    seat: ReviewWorkerSeatSchema.optional(),
    llm: LlmRefSchema.optional(),
  })
  .strict();

/**
 * Ontological-anchoring alignment flags (design:
 * 20260716-review-ontological-primacy-runtime-alignment-design.md §2-2).
 * Opt-in, both default OFF (INV-CFG-1). Split by blast radius:
 * - `obligations`: per-kind packet obligation prose (code/database) — design (a)+(B).
 * - `judgment_anchor`: kind-shared judgment framing (lens sidecar severity
 *   anchor, issue-artifact Severity Contract anchor + confirmed-criteria
 *   projection embed, problem-framing admission routing, deliberation
 *   precedence ladder) — design (c)+(b).
 * Prose-only: no schema, enum, predicate, or validation change rides these flags.
 */
const ReviewOntologicalAnchoringFlagSchema = z
  .object({ enabled: z.boolean().optional() })
  .strict();

const ReviewOntologicalAnchoringSettingsSchema = z
  .object({
    obligations: ReviewOntologicalAnchoringFlagSchema.optional(),
    judgment_anchor: ReviewOntologicalAnchoringFlagSchema.optional(),
  })
  .strict();

const ReviewExecutionSettingsSchema = z
  .object({
    mode: ReviewExecutionModeSchema.optional(),
    orchestration: ReviewOrchestrationOwnerSchema.optional(),
    executor: ReviewExecutorSelectionSchema.optional(),
    artifact_generation_realization:
      ReviewArtifactGenerationRealizationSchema.optional(),
    max_concurrent_lenses: z.number().int().min(1).optional(),
    ontological_anchoring: ReviewOntologicalAnchoringSettingsSchema.optional(),
    teamlead: ReviewActorSettingsSchema.optional(),
    lens: ReviewActorSettingsSchema.optional(),
    synthesize: ReviewActorSettingsSchema.optional(),
    deliberation: ReviewDeliberationSchema.optional(),
    retry: ReviewRetrySettingsSchema.optional(),
    units: ReviewExecutionUnitsSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const mode = value.mode ?? "main-workers";
    // orchestration=host composes with both modes (roadmap S2 lifted the
    // Stage 1 host×nested fail-close): the host owns the round loop either
    // way and may execute ready units per-unit (flat) or delegate them to
    // one nesting batch worker (nested). Seat constraints below still
    // apply per mode.
    const teamleadSeat = value.teamlead?.seat ?? "main";
    const lensSeat = value.lens?.seat ?? "worker";
    const synthesizeSeat = value.synthesize?.seat ?? "worker";

    if (mode === "main-workers" && teamleadSeat !== "main") {
      ctx.addIssue({
        code: "custom",
        path: ["teamlead", "seat"],
        message: "main-workers requires review.execution.teamlead.seat=main.",
      });
    }
    if (mode === "main-workers" && lensSeat !== "worker") {
      ctx.addIssue({
        code: "custom",
        path: ["lens", "seat"],
        message: "main-workers requires review.execution.lens.seat=worker.",
      });
    }
    if (mode === "nested-workers" && teamleadSeat !== "worker") {
      ctx.addIssue({
        code: "custom",
        path: ["teamlead", "seat"],
        message: "nested-workers requires review.execution.teamlead.seat=worker.",
      });
    }
    if (mode === "nested-workers" && lensSeat !== "worker") {
      ctx.addIssue({
        code: "custom",
        path: ["lens", "seat"],
        message: "nested-workers requires review.execution.lens.seat=worker.",
      });
    }
    if (synthesizeSeat !== "worker") {
      ctx.addIssue({
        code: "custom",
        path: ["synthesize", "seat"],
        message: "review.execution.synthesize.seat must be worker.",
      });
    }
  });

const ReviewArtifactSettingsSchema = z
  .object({
    lens_output_format: ReviewLensOutputFormatSchema.optional(),
    write_lens_markdown: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.write_lens_markdown === false &&
      (value.lens_output_format ?? "sidecar") !== "sidecar"
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["write_lens_markdown"],
        message:
          "review.artifacts.write_lens_markdown=false requires lens_output_format=sidecar.",
      });
    }
  });

const ReviewSettingsSchema = z
  .object({
    mode: z.enum(["core-axis", "full"]).optional(),
    domains: z.array(z.string().min(1)).optional(),
    context: z
      .object({
        excluded_names: z.array(z.string().min(1)).optional(),
        max_listing_depth: z.union([z.number(), z.string()]).optional(),
        max_listing_entries: z.union([z.number(), z.string()]).optional(),
        max_embed_lines: z.union([z.number(), z.string()]).optional(),
      })
      .strict()
      .optional(),
    execution: ReviewExecutionSettingsSchema.optional(),
    artifacts: ReviewArtifactSettingsSchema.optional(),
  })
  .strict();

const V3ReviewActorSettingsSchema = z
  .object({
    seat: ReviewWorkerSeatSchema.optional(),
    llm: ReviewActorLlmSettingsSchema,
  })
  .strict();

const ReconstructActorLlmRuntimeSettingsSchema = z
  .object({
    openai_responses_output_headroom_tokens: z.number().int().positive().safe(),
  })
  .strict();

const V3ReconstructActorSettingsSchema = z
  .object({
    llm: FullLlmSettingsSchema,
    llm_runtime: ReconstructActorLlmRuntimeSettingsSchema.optional(),
  })
  .strict();

/**
 * Single source of the reconstruct actor-seat key set (INV-MODEL-1 role-aware
 * design §5.1). The V3/Normalized zod shapes and the ReconstructSettings type
 * are DERIVED from this constant, and the normalize/merge copy functions
 * iterate it — so a new actor key added here flows through parse, normalize,
 * merge, and the gate walk without touching a hand-enumerated whitelist (the
 * silent-strip class F19 is closed by construction). `semantic_author` and
 * `confirmation_provider` are REQUIRED seats for live direct_call execution
 * (resolveReconstructActorLlmSettings); `semantic_map_synthesize` is an
 * OPTIONAL per-role override seat (absent = inherit the semantic_author
 * config; resolveOptionalReconstructActorLlmSettings).
 */
export const RECONSTRUCT_ACTOR_KEYS = [
  "semantic_author",
  "confirmation_provider",
  "semantic_map_synthesize",
] as const;
export type ReconstructActorKey = (typeof RECONSTRUCT_ACTOR_KEYS)[number];

/**
 * Declared reconstruct.execution-level scalar settings (design §5.1). Like the
 * actor axis, the zod schemas' scalar entries are DERIVED from this constant
 * (reconstructExecutionScalarsShape) and the type maps over it, so a
 * schema-declared-but-constant-missing key cannot exist (no second key
 * authority in either direction); the normalize/merge copy functions iterate
 * this list, so a declared scalar survives the settings chain even when
 * `actors` is absent. A key NOT declared here is rejected by the strict
 * schemas (fail-loud), never silently dropped. Current scalars are all
 * booleans; a future non-boolean scalar must extend the shape helper.
 */
export const RECONSTRUCT_EXECUTION_SCALAR_KEYS = [
  "semantic_map_authoring",
  // Multi-artifact code path opt-in (design 20260718 DD7 / owner O-1): absent = off — the code
  // structure observer + semantic-map code routing stay dormant, spreadsheet path byte-identical.
  "semantic_map_code",
  // Deterministic code inventory opt-in (실험2 경계 결정, owner 2026-07-20): capture the code
  // structure inventory WITHOUT the LLM semantic-map code stage. Capture runs when EITHER this
  // key or semantic_map_code is true (the map folds from the captured inventory, so the map
  // opt-in implies capture); the map stage itself stays gated by semantic_map_code alone.
  // Absent = off — both keys absent keeps every path byte-identical.
  "code_structure_inventory",
  // Phase 1b set-tier opt-in (design 20260720 FD1, deterministic 모드 — owner 2026-07-20):
  // multi-file code set assembly (topology + import relations + deterministic overview).
  // Deterministic 전제 = code_structure_inventory ∧ this key; set=true ∧ capture=false is a
  // fail-loud structural error (requires_code_structure_inventory), never implicit activation.
  // Absent = off — no set-tier artifact, no observer import capture, byte-identical.
  "semantic_map_code_set_tier",
  // Environment context profile opt-in (design 20260720 env-context-profile §0, Stage 0). A
  // deterministic environment/tech-stack profile derived from the EXISTING observation census
  // (basenames/extensions/imports) — NO new filesystem scan, disclosure-only (never touches the
  // seed). Independent of the code opt-ins: it reads whatever census/imports already exist.
  // Absent = off — no profile artifact, no scan, no read, byte-identical.
  "environment_context_profile",
] as const;
export type ReconstructExecutionScalarKey =
  (typeof RECONSTRUCT_EXECUTION_SCALAR_KEYS)[number];

/** zod actors shape derived from {@link RECONSTRUCT_ACTOR_KEYS} — the schema
 * cannot drift from the constant (no second key authority). */
function reconstructActorsShape<T extends z.ZodTypeAny>(
  actorSchema: T,
): Record<ReconstructActorKey, z.ZodOptional<T>> {
  return Object.fromEntries(
    RECONSTRUCT_ACTOR_KEYS.map((key) => [key, actorSchema.optional()]),
  ) as Record<ReconstructActorKey, z.ZodOptional<T>>;
}

function reconstructActorsSettingsSchema() {
  return z
    .object(reconstructActorsShape(V3ReconstructActorSettingsSchema))
    .strict()
    .superRefine((actors, ctx) => {
      for (const key of RECONSTRUCT_ACTOR_KEYS) {
        if (key !== "semantic_author" && actors[key]?.llm_runtime !== undefined) {
          ctx.addIssue({
            code: "custom",
            path: [key, "llm_runtime"],
            message:
              "reconstruct actor llm_runtime is currently supported only on semantic_author.",
          });
        }
      }
    });
}

/** zod execution-scalar shape derived from
 * {@link RECONSTRUCT_EXECUTION_SCALAR_KEYS} — same single-source rule as the
 * actor axis, so the F19/F24 silent-strip class is closed by construction on
 * BOTH axes. */
function reconstructExecutionScalarsShape(): Record<
  ReconstructExecutionScalarKey,
  z.ZodOptional<z.ZodBoolean>
> {
  return Object.fromEntries(
    RECONSTRUCT_EXECUTION_SCALAR_KEYS.map((key) => [key, z.boolean().optional()]),
  ) as Record<ReconstructExecutionScalarKey, z.ZodOptional<z.ZodBoolean>>;
}

const V3ReviewExecutionSettingsSchema = z
  .object({
    topology: ReviewExecutionModeSchema.optional(),
    orchestration: ReviewOrchestrationOwnerSchema.optional(),
    executor: ReviewExecutorSelectionSchema.optional(),
    artifact_generation_realization:
      ReviewArtifactGenerationRealizationSchema.optional(),
    max_concurrent_lenses: z.number().int().min(1).optional(),
    ontological_anchoring: ReviewOntologicalAnchoringSettingsSchema.optional(),
    actors: z
      .object({
        teamlead: V3ReviewActorSettingsSchema.optional(),
        lens: V3ReviewActorSettingsSchema.optional(),
        synthesize: V3ReviewActorSettingsSchema.optional(),
      })
      .strict()
      .optional(),
    deliberation: ReviewDeliberationSchema.optional(),
    retry: ReviewRetrySettingsSchema.optional(),
    units: ReviewExecutionUnitsSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const topology = value.topology ?? "main-workers";
    // orchestration=host composes with both topologies (roadmap S2 lifted
    // the Stage 1 host×nested fail-close): the host owns the round loop
    // either way and may execute a round's ready units per-unit (flat) or
    // delegate them to one nesting batch worker (nested). Seat constraints
    // below still apply per topology.
    const teamleadSeat = value.actors?.teamlead?.seat ?? "main";
    const lensSeat = value.actors?.lens?.seat ?? "worker";
    const synthesizeSeat = value.actors?.synthesize?.seat ?? "worker";

    if (topology === "main-workers" && teamleadSeat !== "main") {
      ctx.addIssue({
        code: "custom",
        path: ["actors", "teamlead", "seat"],
        message: "main-workers requires review.execution.actors.teamlead.seat=main.",
      });
    }
    if (topology === "main-workers" && lensSeat !== "worker") {
      ctx.addIssue({
        code: "custom",
        path: ["actors", "lens", "seat"],
        message: "main-workers requires review.execution.actors.lens.seat=worker.",
      });
    }
    if (topology === "nested-workers" && teamleadSeat !== "worker") {
      ctx.addIssue({
        code: "custom",
        path: ["actors", "teamlead", "seat"],
        message: "nested-workers requires review.execution.actors.teamlead.seat=worker.",
      });
    }
    if (topology === "nested-workers" && lensSeat !== "worker") {
      ctx.addIssue({
        code: "custom",
        path: ["actors", "lens", "seat"],
        message: "nested-workers requires review.execution.actors.lens.seat=worker.",
      });
    }
    if (synthesizeSeat !== "worker") {
      ctx.addIssue({
        code: "custom",
        path: ["actors", "synthesize", "seat"],
        message: "review.execution.actors.synthesize.seat must be worker.",
      });
    }
  });

const V3ReviewArtifactSettingsSchema = ReviewArtifactSettingsSchema;

const V3ReviewSettingsSchema = z
  .object({
    mode: z.enum(["core-axis", "full"]).optional(),
    domains: z.array(z.string().min(1)).optional(),
    context: z
      .object({
        excluded_names: z.array(z.string().min(1)).optional(),
        max_listing_depth: z.union([z.number(), z.string()]).optional(),
        max_listing_entries: z.union([z.number(), z.string()]).optional(),
        max_embed_lines: z.union([z.number(), z.string()]).optional(),
      })
      .strict()
      .optional(),
    execution: V3ReviewExecutionSettingsSchema.optional(),
    artifacts: V3ReviewArtifactSettingsSchema.optional(),
  })
  .strict();

const V3ReconstructSettingsSchema = z
  .object({
    execution: z
      .object({
        actors: z
          .lazy(reconstructActorsSettingsSchema)
          .optional(),
        // Execution-level scalars (e.g. the semantic-map authoring opt-in,
        // design §5.5) — entries DERIVED from the scalar constant (§5.1).
        ...reconstructExecutionScalarsShape(),
        dispatch_breaker: DispatchBreakerSettingsSchema.optional(),
        dispatch_fallback: DispatchFallbackSettingsSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const V3SettingsSchema = z
  .object({
    schema_version: z.literal("settings.json/v3"),
    review: V3ReviewSettingsSchema.optional(),
    reconstruct: V3ReconstructSettingsSchema.optional(),
  })
  .strict();

const NormalizedSettingsSchema = z
  .object({
    schema_version: z.literal("settings.json/v3").optional(),
    llm: LlmSettingsSchema.optional(),
    review: ReviewSettingsSchema.optional(),
    reconstruct: z
      .object({
        execution: z
          .object({
            actors: z
              .lazy(reconstructActorsSettingsSchema)
              .optional(),
            ...reconstructExecutionScalarsShape(),
            dispatch_breaker: DispatchBreakerSettingsSchema.optional(),
            dispatch_fallback: DispatchFallbackSettingsSchema.optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    review_mode: z.enum(["core-axis", "full"]).optional(),
    domains: z.array(z.string().min(1)).optional(),
    excluded_names: z.array(z.string().min(1)).optional(),
    max_listing_depth: z.union([z.number(), z.string()]).optional(),
    max_listing_entries: z.union([z.number(), z.string()]).optional(),
    max_embed_lines: z.union([z.number(), z.string()]).optional(),
  })
  .strict();
type V3Settings = z.infer<typeof V3SettingsSchema>;
type ParsedSettings = V3Settings;

export type ReviewExecutionMode = z.infer<typeof ReviewExecutionModeSchema>;
export type ReviewOrchestrationOwner = z.infer<typeof ReviewOrchestrationOwnerSchema>;
export type ReviewExecutorSelection = z.infer<typeof ReviewExecutorSelectionSchema>;
export type ReviewWorkerSeat = z.infer<typeof ReviewWorkerSeatSchema>;
export type ReviewDeliberation = z.infer<typeof ReviewDeliberationSchema>;
export type ReviewLensOutputFormat = z.infer<typeof ReviewLensOutputFormatSchema>;
export type ReviewExecutionUnitId = z.infer<typeof ReviewExecutionUnitIdSchema>;
export type ReviewToolMode = z.infer<typeof ReviewToolModeSchema>;

export type ReviewLlmRef = LlmModelSwitcherConfig;

export interface ReviewContextSettings {
  excluded_names?: string[];
  max_listing_depth?: number | string;
  max_listing_entries?: number | string;
  max_embed_lines?: number | string;
}

interface ReviewContextSettingsInput {
  excluded_names?: string[] | undefined;
  max_listing_depth?: number | string | undefined;
  max_listing_entries?: number | string | undefined;
  max_embed_lines?: number | string | undefined;
}

interface ReviewActorSettingsInput {
  seat?: ReviewWorkerSeat | undefined;
  llm?: ReviewLlmRef | undefined;
}

interface ReviewExecutionSettingsInput {
  mode?: ReviewExecutionMode | undefined;
  executor?: ReviewExecutorSelection | undefined;
  artifact_generation_realization?: ReviewArtifactGenerationRealization | undefined;
  max_concurrent_lenses?: number | undefined;
  ontological_anchoring?: ReviewOntologicalAnchoringSettings | undefined;
  teamlead?: ReviewActorSettingsInput | undefined;
  lens?: ReviewActorSettingsInput | undefined;
  synthesize?: ReviewActorSettingsInput | undefined;
  deliberation?: ReviewDeliberation | undefined;
  retry?: ReviewRetrySettingsInput | undefined;
  units?: ReviewExecutionUnitsInput | undefined;
}

/**
 * Ontological-anchoring alignment flags (design
 * 20260716-review-ontological-primacy-runtime-alignment-design.md §2-2).
 * Both sub-flags default OFF; absent object means both off.
 */
export interface ReviewOntologicalAnchoringSettings {
  obligations?: { enabled?: boolean | undefined } | undefined;
  judgment_anchor?: { enabled?: boolean | undefined } | undefined;
}

interface ReviewArtifactSettingsInput {
  lens_output_format?: ReviewLensOutputFormat | undefined;
  write_lens_markdown?: boolean | undefined;
}

export interface ReviewActorSettings {
  seat?: ReviewWorkerSeat;
  llm?: ReviewLlmRef;
}

export interface ResolvedReviewActorSettings {
  seat: ReviewWorkerSeat;
  llm?: ReviewLlmRef;
}

export interface ReviewUnitExecutionSettings {
  llm?: ReviewLlmRef | undefined;
  max_tokens?: number | undefined;
  tool_mode?: ReviewToolMode | undefined;
  timeout_ms?: number | undefined;
  max_retries?: number | undefined;
  retry_initial_delay_ms?: number | undefined;
  max_output_bytes?: number | undefined;
}

export type ReviewExecutionUnits = Partial<
  Record<ReviewExecutionUnitId, ReviewUnitExecutionSettings>
>;

type ReviewExecutionUnitsInput = Partial<
  Record<ReviewExecutionUnitId, ReviewUnitExecutionSettings | undefined>
>;

export interface ReviewExecutionSettings {
  mode?: ReviewExecutionMode;
  orchestration?: ReviewOrchestrationOwner;
  executor?: ReviewExecutorSelection;
  artifact_generation_realization?: ReviewArtifactGenerationRealization;
  max_concurrent_lenses?: number | undefined;
  ontological_anchoring?: ReviewOntologicalAnchoringSettings | undefined;
  teamlead?: ReviewActorSettings;
  lens?: ReviewActorSettings;
  synthesize?: ReviewActorSettings;
  deliberation?: ReviewDeliberation;
  retry?: ReviewRetrySettingsInput;
  units?: ReviewExecutionUnits;
}

/**
 * Submit salvage recovery (opt-in): after a structured-submit unit exhausts
 * its regular retries with `output_contract`, recover the already-produced
 * semantics without re-engaging the violating model. The original failure
 * stays recorded; the salvage attempt carries `recovery: "salvaged_submit"`.
 * Contract: development-records/design/submit-salvage-recovery-design.md.
 */
export interface ReviewSubmitSalvageSettingsInput {
  enabled?: boolean | undefined;
  /** Path A (transcription) model — cheap tier; the unit's OWN adapter runs it
   * (anthropic -> claude CLI, openai -> codex CLI); provider mismatch with the
   * unit adapter falls back to the unit model. */
  transcription_llm?: { provider?: "anthropic" | "openai" | undefined; model: string } | undefined;
  /** Path B (missing-rows delta) executor — fixed: fresh same-tier instance. */
  delta_completion?: "unit_llm" | undefined;
}

export interface ReviewSubmitSalvageSettings {
  enabled: boolean;
  transcription_llm?: { provider?: "anthropic" | "openai" | undefined; model: string };
  delta_completion: "unit_llm";
}

/**
 * Bounded unit resubmit on validation rejection (design:
 * 20260704-review-unit-resubmit-and-limit-breaker-design.md, 설계 A).
 * Opt-in. When enabled, a unit whose structured submit was rejected by
 * deterministic validation is re-requested with an error spec injected into
 * its packet (reusing the unit's existing retry budget), and exhaustion
 * demotes the unit to complete-with-failure instead of halting the run —
 * unless the same validation class fails a majority of units
 * (correlated_validation whole-run halt). Current wiring: issue-stance
 * evidence_refs (§4-6a), issue-deliberation evidence_refs (§4-6a), and
 * issue-synthesis source_refs_used (§4-2c/2-A). The output_contract-poison cases
 * (synthesis, rare-poison deliberation, rare-poison stance) additionally need
 * the §4-2c structural retry gate to reach the retry loop.
 */
export interface ReviewUnitResubmitSettingsInput {
  enabled?: boolean | undefined;
}

export interface ReviewUnitResubmitSettings {
  enabled: boolean;
}

export interface ReviewRetrySettingsInput {
  lens_max_retries?: number | undefined;
  issue_artifact_max_retries?: number | undefined;
  deliberation_max_retries?: number | undefined;
  synthesis_max_retries?: number | undefined;
  retry_initial_delay_ms?: number | undefined;
  salvage?: ReviewSubmitSalvageSettingsInput | undefined;
  resubmit?: ReviewUnitResubmitSettingsInput | undefined;
  /** 설계 B: 리뷰 lens/stance 풀의 dispatch breaker (opt-in). */
  dispatch_breaker?: DispatchBreakerSettingsInput | undefined;
}

export interface ReviewRetrySettings {
  lens_max_retries: number;
  issue_artifact_max_retries: number;
  deliberation_max_retries: number;
  synthesis_max_retries: number;
  retry_initial_delay_ms: number;
  salvage: ReviewSubmitSalvageSettings;
  resubmit: ReviewUnitResubmitSettings;
  dispatch_breaker: DispatchBreakerSettings;
}

export interface ReviewArtifactSettings {
  lens_output_format?: ReviewLensOutputFormat;
  write_lens_markdown?: boolean;
}

export interface ResolvedReviewExecutionSettings {
  mode: ReviewExecutionMode;
  orchestration: ReviewOrchestrationOwner;
  executor: ReviewExecutorSelection;
  artifact_generation_realization: ReviewArtifactGenerationRealization;
  max_concurrent_lenses?: number | undefined;
  ontological_anchoring?: ReviewOntologicalAnchoringSettings | undefined;
  teamlead: ResolvedReviewActorSettings;
  lens: ResolvedReviewActorSettings;
  synthesize: ResolvedReviewActorSettings;
  deliberation: ReviewDeliberation;
  retry: ReviewRetrySettings;
  units: ReviewExecutionUnits;
}

export interface ReviewSettings {
  mode?: "core-axis" | "full";
  domains?: string[];
  context?: ReviewContextSettings;
  execution?: ReviewExecutionSettings;
  artifacts?: ReviewArtifactSettings;
}

export interface ReconstructActorLlmRuntimeSettings {
  openai_responses_output_headroom_tokens: number;
}

export interface ReconstructActorSettings {
  llm: LlmModelSwitcherConfig;
  llm_runtime?: ReconstructActorLlmRuntimeSettings;
}

export type DispatchFallbackSettings = z.infer<
  typeof DispatchFallbackSettingsSchema
>;

export interface ReconstructSettings {
  // Both axes derive from their constants (design §5.1, F19 closure): a new
  // actor key or execution scalar cannot exist in the type without existing
  // in the copy functions' iteration source.
  execution?: {
    actors?: Partial<Record<ReconstructActorKey, ReconstructActorSettings>>;
    // Object-shaped execution block (not a boolean scalar): 설계 B breaker.
    dispatch_breaker?: DispatchBreakerSettingsInput;
    // Whole-object, default-off provider swap capability. Enabled form is a
    // strict contract whose retry/pass limits are all literal 1.
    dispatch_fallback?: DispatchFallbackSettings;
  } & Partial<Record<ReconstructExecutionScalarKey, boolean>>;
}

export interface OntoSettings {
  schema_version?: "settings.json/v3";
  llm?: LlmModelSwitcherConfig;
  review?: ReviewSettings;
  reconstruct?: ReconstructSettings;
  review_mode?: "core-axis" | "full";
  domains?: string[];
  excluded_names?: string[];
  max_listing_depth?: number | string;
  max_listing_entries?: number | string;
  max_embed_lines?: number | string;
}

export type OntoConfig = OntoSettings;
export type ReconstructLlmActorName =
  | "semantic_author"
  | "confirmation_provider";

export function resolveReconstructActorLlmSettings(
  settings: OntoSettings,
  actorName: ReconstructLlmActorName,
): LlmModelSwitcherConfig {
  const actor = settings.reconstruct?.execution?.actors?.[actorName];
  if (!actor) {
    throw new Error(
      `reconstruct.execution.actors.${actorName}.llm is required for reconstruct direct_call execution. settings.json/v3 requires actor-specific llm settings.`,
    );
  }
  normalizeLlmModelSwitcher(actor.llm);
  return actor.llm;
}

export function resolveReconstructSemanticAuthorLlmRuntimeSettings(
  settings: OntoSettings,
): ReconstructActorLlmRuntimeSettings | undefined {
  return settings.reconstruct?.execution?.actors?.semantic_author?.llm_runtime;
}

/**
 * THE single reader of an OPTIONAL reconstruct actor seat for DISPATCH
 * consumers (design §5.4) — live wiring, mock identity projection, and tests
 * all consume this one post-chain projection so no second dispatch-side
 * seat-reading authority can drift. (The supported-model gate walks the same
 * post-chain settings object structurally via collectModelSelections; both
 * therefore see one seat value.) Absent seat → undefined (the stage inherits
 * the semantic_author config). Pure projection: normalizes the switcher shape
 * only — no provider/auth resolution, so it is safe under mock realization.
 */
export function resolveOptionalReconstructActorLlmSettings(
  settings: OntoSettings,
  actorName: ReconstructActorKey,
): LlmModelSwitcherConfig | undefined {
  const actor = settings.reconstruct?.execution?.actors?.[actorName];
  if (!actor) return undefined;
  normalizeLlmModelSwitcher(actor.llm);
  return actor.llm;
}

/** Semantic-map authoring stage (design §5.5). DEFAULT ON (2026-07-15
 * owner-directed promotion): absent = on; only an explicit `false` disables it,
 * which detaches the capability pair AND leaves the synthesize seat dormant
 * (excluded from the gate walk — U6, salvage precedent). */
export function isReconstructSemanticMapAuthoringEnabled(
  settings: OntoSettings,
): boolean {
  return settings.reconstruct?.execution?.semantic_map_authoring !== false;
}

export const SETTINGS_FILENAME = "settings.json";
export const RETIRED_CONFIG_FILENAMES = [
  `config.${"yml"}`,
  `config.${"yaml"}`,
] as const;

export function userSettingsPath(): string {
  return path.join(os.homedir(), ".onto", SETTINGS_FILENAME);
}

export function projectSettingsPath(projectRoot: string): string {
  return path.join(projectRoot, ".onto", SETTINGS_FILENAME);
}

export class UnsupportedOntoConfigFilesError extends Error {
  readonly unsupportedPaths: string[];
  readonly failureRecord: ReviewStructuredFailureRecord;

  constructor(unsupportedPaths: string[]) {
    const message = [
      "Unsupported onto config file detected.",
      ...unsupportedPaths.map((filePath) => `- ${filePath}`),
      "",
      "Use .onto/settings.json for runtime settings. YAML settings are not read.",
    ].join("\n");
    super(message);
    this.name = "UnsupportedOntoConfigFilesError";
    this.unsupportedPaths = unsupportedPaths;
    const failureParams: StructuredFailureParams = {
      phase: "pre_manifest.retired_entry",
      reasonCode: "retired_config_file_detected",
      humanMessage: "Unsupported onto config file detected.",
      requiredUserAction:
        "Remove retired YAML config files and move runtime settings to .onto/settings.json.",
      retrySafety: "safe_after_input_change",
      artifactTrust: "no_artifacts_trusted",
      dispatchState: "not_dispatched",
      artifactRefs: {},
      mcpErrorCode: "ONTO_REVIEW_RETIRED_CONFIG_DETECTED",
      detailsKind: "retired_config",
      details: {
        unsupported_paths: unsupportedPaths,
        active_settings_filename: SETTINGS_FILENAME,
      },
    };
    this.failureRecord = createStructuredFailureRecord(failureParams);
  }
}

export class OntoSettingsValidationError extends Error {
  readonly failureRecord: ReviewStructuredFailureRecord;

  constructor(args: {
    message: string;
    settingsPath?: string;
    reasonCode: string;
    details: Record<string, unknown>;
  }) {
    super(args.message);
    this.name = "OntoSettingsValidationError";
    this.failureRecord = createStructuredFailureRecord({
      phase: "pre_manifest.settings_validation",
      reasonCode: args.reasonCode,
      humanMessage: args.message.split("\n")[0] ?? "Invalid onto settings.",
      requiredUserAction:
        "Move settings to settings.json/v3 with full actor llm blocks, then retry the review.",
      retrySafety: "safe_after_input_change",
      artifactTrust: "no_artifacts_trusted",
      dispatchState: "not_dispatched",
      artifactRefs: args.settingsPath ? { settings: args.settingsPath } : {},
      mcpErrorCode: "ONTO_REVIEW_SETTINGS_VALIDATION_FAILED",
      detailsKind: "settings_validation",
      details: {
        ...(args.settingsPath ? { settings_path: args.settingsPath } : {}),
        ...args.details,
      },
    });
  }
}

export async function assertNoUnsupportedConfigFiles(
  root: string,
): Promise<void> {
  const unsupported = [];
  for (const filename of RETIRED_CONFIG_FILENAMES) {
    const candidate = path.join(root, ".onto", filename);
    if (await fileExists(candidate)) unsupported.push(candidate);
  }
  if (unsupported.length > 0) {
    throw new UnsupportedOntoConfigFilesError(unsupported);
  }
}

function definedReviewContext(
  context: ReviewContextSettingsInput,
): ReviewContextSettings | undefined {
  const out: ReviewContextSettings = {};
  if (context.excluded_names !== undefined) {
    out.excluded_names = context.excluded_names;
  }
  if (context.max_listing_depth !== undefined) {
    out.max_listing_depth = context.max_listing_depth;
  }
  if (context.max_listing_entries !== undefined) {
    out.max_listing_entries = context.max_listing_entries;
  }
  if (context.max_embed_lines !== undefined) {
    out.max_embed_lines = context.max_embed_lines;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function definedReviewArtifacts(
  artifacts: ReviewArtifactSettingsInput | undefined,
): ReviewArtifactSettings | undefined {
  if (!artifacts) return undefined;
  const out: ReviewArtifactSettings = {};
  if (artifacts.lens_output_format !== undefined) {
    out.lens_output_format = artifacts.lens_output_format;
  }
  if (artifacts.write_lens_markdown !== undefined) {
    out.write_lens_markdown = artifacts.write_lens_markdown;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function definedReviewRetry(
  retry: ReviewRetrySettingsInput | undefined,
): ReviewRetrySettingsInput | undefined {
  if (!retry) return undefined;
  const out: ReviewRetrySettingsInput = {};
  if (retry.lens_max_retries !== undefined) out.lens_max_retries = retry.lens_max_retries;
  if (retry.issue_artifact_max_retries !== undefined) {
    out.issue_artifact_max_retries = retry.issue_artifact_max_retries;
  }
  if (retry.deliberation_max_retries !== undefined) {
    out.deliberation_max_retries = retry.deliberation_max_retries;
  }
  if (retry.synthesis_max_retries !== undefined) {
    out.synthesis_max_retries = retry.synthesis_max_retries;
  }
  if (retry.retry_initial_delay_ms !== undefined) {
    out.retry_initial_delay_ms = retry.retry_initial_delay_ms;
  }
  if (retry.salvage !== undefined) {
    const salvage: ReviewSubmitSalvageSettingsInput = {};
    if (retry.salvage.enabled !== undefined) salvage.enabled = retry.salvage.enabled;
    if (retry.salvage.transcription_llm !== undefined) {
      salvage.transcription_llm = retry.salvage.transcription_llm;
    }
    if (retry.salvage.delta_completion !== undefined) {
      salvage.delta_completion = retry.salvage.delta_completion;
    }
    out.salvage = salvage;
  }
  // 정정 2026-07-05: resubmit이 이 복사 함수에서 누락되어 설정 파일의
  // opt-in(true)이 정규화 단계에서 소실됐다(#163 관찰 모드가 불활성이던
  // 원인). strict 파서가 이미 미지 키를 거른 뒤라 통복사가 안전하다.
  if (retry.resubmit !== undefined) {
    out.resubmit = { ...retry.resubmit };
  }
  if (retry.dispatch_breaker !== undefined) {
    out.dispatch_breaker = { ...retry.dispatch_breaker };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function definedReviewUnitExecutionSettings(
  unit: ReviewUnitExecutionSettings | undefined,
): ReviewUnitExecutionSettings | undefined {
  if (!unit) return undefined;
  const out: ReviewUnitExecutionSettings = {};
  if (unit.llm !== undefined && Object.keys(unit.llm).length > 0) {
    out.llm = unit.llm;
  }
  if (unit.max_tokens !== undefined) out.max_tokens = unit.max_tokens;
  if (unit.tool_mode !== undefined) out.tool_mode = unit.tool_mode;
  if (unit.timeout_ms !== undefined) out.timeout_ms = unit.timeout_ms;
  if (unit.max_retries !== undefined) out.max_retries = unit.max_retries;
  if (unit.retry_initial_delay_ms !== undefined) {
    out.retry_initial_delay_ms = unit.retry_initial_delay_ms;
  }
  if (unit.max_output_bytes !== undefined) {
    out.max_output_bytes = unit.max_output_bytes;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function definedReviewUnits(
  units: ReviewExecutionUnitsInput | undefined,
): ReviewExecutionUnits | undefined {
  if (!units) return undefined;
  const out: ReviewExecutionUnits = {};
  for (const unitId of REVIEW_EXECUTION_UNIT_IDS) {
    const unit = definedReviewUnitExecutionSettings(units[unitId]);
    if (unit) out[unitId] = unit;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function completeReviewRetrySettings(
  retry: ReviewRetrySettingsInput | undefined,
): ReviewRetrySettings {
  return {
    lens_max_retries:
      retry?.lens_max_retries ?? DEFAULT_REVIEW_RETRY_SETTINGS.lens_max_retries,
    issue_artifact_max_retries:
      retry?.issue_artifact_max_retries ??
      DEFAULT_REVIEW_RETRY_SETTINGS.issue_artifact_max_retries,
    deliberation_max_retries:
      retry?.deliberation_max_retries ??
      DEFAULT_REVIEW_RETRY_SETTINGS.deliberation_max_retries,
    synthesis_max_retries:
      retry?.synthesis_max_retries ??
      DEFAULT_REVIEW_RETRY_SETTINGS.synthesis_max_retries,
    retry_initial_delay_ms:
      retry?.retry_initial_delay_ms ??
      DEFAULT_REVIEW_RETRY_SETTINGS.retry_initial_delay_ms,
    salvage: {
      enabled: retry?.salvage?.enabled ?? DEFAULT_REVIEW_RETRY_SETTINGS.salvage.enabled,
      ...(retry?.salvage?.transcription_llm !== undefined
        ? { transcription_llm: retry.salvage.transcription_llm }
        : {}),
      delta_completion:
        retry?.salvage?.delta_completion ??
        DEFAULT_REVIEW_RETRY_SETTINGS.salvage.delta_completion,
    },
    resubmit: {
      enabled:
        retry?.resubmit?.enabled ?? DEFAULT_REVIEW_RETRY_SETTINGS.resubmit.enabled,
    },
    dispatch_breaker: completeDispatchBreakerSettings(retry?.dispatch_breaker),
  };
}

function v3ActorSettings(
  actor: z.infer<typeof V3ReviewActorSettingsSchema>,
): ReviewActorSettings {
  return {
    ...(actor.seat !== undefined ? { seat: actor.seat } : {}),
    llm: actor.llm,
  };
}

function v3ReconstructActorSettings(
  actor: z.infer<typeof V3ReconstructActorSettingsSchema>,
): ReconstructActorSettings {
  return {
    llm: actor.llm,
    ...(actor.llm_runtime !== undefined
      ? { llm_runtime: actor.llm_runtime }
      : {}),
  };
}

/**
 * Normalizes the parsed V3 reconstruct block into the runtime shape.
 * STRUCTURE-PRESERVING by construction (design §5.1): actor copies iterate
 * RECONSTRUCT_ACTOR_KEYS and execution-level scalars iterate
 * RECONSTRUCT_EXECUTION_SCALAR_KEYS — no hand-enumerated whitelist, and no
 * actors-absent early return (a scalar-only block survives).
 * Exported for the unit-level drift-guard tests, which call the copy
 * functions directly (bypassing the strict parser) so a missed copy fails.
 */
export function v3ReconstructSettings(
  reconstruct: z.infer<typeof V3ReconstructSettingsSchema> | undefined,
): ReconstructSettings | undefined {
  const execution = reconstruct?.execution;
  if (!execution) return undefined;
  const normalizedActors: NonNullable<
    NonNullable<ReconstructSettings["execution"]>["actors"]
  > = {};
  for (const key of RECONSTRUCT_ACTOR_KEYS) {
    const actor = execution.actors?.[key];
    if (actor) normalizedActors[key] = v3ReconstructActorSettings(actor);
  }
  const out: NonNullable<ReconstructSettings["execution"]> = {};
  if (Object.keys(normalizedActors).length > 0) out.actors = normalizedActors;
  for (const key of RECONSTRUCT_EXECUTION_SCALAR_KEYS) {
    const value = execution[key];
    if (value !== undefined) out[key] = value;
  }
  if (execution.dispatch_breaker !== undefined) {
    out.dispatch_breaker = execution.dispatch_breaker;
  }
  if (execution.dispatch_fallback !== undefined) {
    out.dispatch_fallback = execution.dispatch_fallback;
  }
  return Object.keys(out).length > 0 ? { execution: out } : undefined;
}

function normalizeV3Settings(settings: V3Settings): OntoSettings {
  const execution = settings.review?.execution;
  const mode = settings.review?.mode;
  const domains = settings.review?.domains;
  const context = settings.review?.context
    ? definedReviewContext(settings.review.context)
    : undefined;
  const artifacts = definedReviewArtifacts(settings.review?.artifacts);
  let review: ReviewSettings | undefined;
  if (settings.review) {
    review = {};
    if (execution) {
      const normalizedExecution: ReviewExecutionSettings = {};
      if (execution.actors?.teamlead) {
        normalizedExecution.teamlead = v3ActorSettings(execution.actors.teamlead);
      }
      if (execution.actors?.lens) {
        normalizedExecution.lens = v3ActorSettings(execution.actors.lens);
      }
      if (execution.actors?.synthesize) {
        normalizedExecution.synthesize = v3ActorSettings(
          execution.actors.synthesize,
        );
      }
      if (execution.topology !== undefined) {
        normalizedExecution.mode = execution.topology;
      }
      if (execution.orchestration !== undefined) {
        normalizedExecution.orchestration = execution.orchestration;
      }
      if (execution.executor !== undefined) {
        normalizedExecution.executor = execution.executor;
      }
      if (execution.artifact_generation_realization !== undefined) {
        normalizedExecution.artifact_generation_realization =
          execution.artifact_generation_realization;
      }
      if (execution.max_concurrent_lenses !== undefined) {
        normalizedExecution.max_concurrent_lenses =
          execution.max_concurrent_lenses;
      }
      if (execution.ontological_anchoring !== undefined) {
        normalizedExecution.ontological_anchoring =
          execution.ontological_anchoring;
      }
      if (execution.deliberation !== undefined) {
        normalizedExecution.deliberation = execution.deliberation;
      }
      const retry = definedReviewRetry(execution.retry);
      if (retry) {
        normalizedExecution.retry = retry;
      }
      const units = definedReviewUnits(execution.units);
      if (units) {
        normalizedExecution.units = units;
      }
      review.execution = normalizedExecution;
    }
    if (mode !== undefined) review.mode = mode;
    if (domains !== undefined) review.domains = domains;
    if (context) review.context = context;
    if (artifacts) review.artifacts = artifacts;
  }
  const reconstruct = v3ReconstructSettings(settings.reconstruct);
  return {
    schema_version: "settings.json/v3",
    ...(review ? { review } : {}),
    ...(reconstruct ? { reconstruct } : {}),
    ...(mode !== undefined ? { review_mode: mode } : {}),
    ...(domains !== undefined ? { domains } : {}),
    ...(context?.excluded_names !== undefined
      ? { excluded_names: context.excluded_names }
      : {}),
    ...(context?.max_listing_depth !== undefined
      ? { max_listing_depth: context.max_listing_depth }
      : {}),
    ...(context?.max_listing_entries !== undefined
      ? { max_listing_entries: context.max_listing_entries }
      : {}),
    ...(context?.max_embed_lines !== undefined
      ? { max_embed_lines: context.max_embed_lines }
      : {}),
  };
}

function normalizeParsedSettings(settings: ParsedSettings): OntoSettings {
  return normalizeV3Settings(settings);
}

export async function readSettingsAt(filePath: string): Promise<OntoSettings> {
  if (!(await fileExists(filePath))) return {};
  let parsed: unknown;
  try {
    parsed = parseYaml(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    throw new OntoSettingsValidationError({
      message: `Failed to parse settings at ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      settingsPath: filePath,
      reasonCode: "settings_json_parse_failed",
      details: {
        parse_error: error instanceof Error ? error.message : String(error),
      },
    });
  }
  const schemaVersion =
    parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as { schema_version?: unknown }).schema_version
      : undefined;
  if (schemaVersion !== "settings.json/v3") {
    throw new OntoSettingsValidationError({
      message: [
        `Retired onto settings schema detected at ${filePath}.`,
        `Expected schema_version: settings.json/v3; got ${
          typeof schemaVersion === "string" ? schemaVersion : "(missing)"
        }.`,
      ].join("\n"),
      settingsPath: filePath,
      reasonCode: "retired_settings_schema_version",
      details: {
        expected_schema_version: "settings.json/v3",
        actual_schema_version:
          typeof schemaVersion === "string" ? schemaVersion : null,
      },
    });
  }
  const result = V3SettingsSchema.safeParse(parsed);
  if (!result.success) {
    throw new OntoSettingsValidationError({
      message: [
        `Invalid onto settings at ${filePath}:`,
        ...result.error.issues.map((issue) => {
          const where = issue.path.length > 0 ? issue.path.join(".") : "(root)";
          return `- ${where}: ${issue.message}`;
        }),
      ].join("\n"),
      settingsPath: filePath,
      reasonCode: "settings_schema_validation_failed",
      details: {
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join(".") || "(root)",
          message: issue.message,
        })),
      },
    });
  }
  return normalizeParsedSettings(result.data as ParsedSettings);
}

function mergeReviewActorSettings(
  defaultActor: ResolvedReviewActorSettings,
  userActor: ReviewActorSettings | undefined,
  projectActor: ReviewActorSettings | undefined,
): ResolvedReviewActorSettings {
  const userLlm = userActor?.llm ?? defaultActor.llm;
  const mergedLlm = projectActor?.llm ?? userLlm;
  const merged: ResolvedReviewActorSettings = {
    seat: projectActor?.seat ?? userActor?.seat ?? defaultActor.seat,
  };
  if (mergedLlm !== undefined) merged.llm = mergedLlm;
  return merged;
}

function mergeReviewContextSettings(
  userContext: ReviewContextSettings | undefined,
  projectContext: ReviewContextSettings | undefined,
): ReviewContextSettings | undefined {
  const merged: ReviewContextSettings = {
    ...(userContext ?? {}),
    ...(projectContext ?? {}),
  };
  if (userContext?.excluded_names || projectContext?.excluded_names) {
    merged.excluded_names = [
      ...new Set([
        ...(userContext?.excluded_names ?? []),
        ...(projectContext?.excluded_names ?? []),
      ]),
    ];
  }
  return definedReviewContext(merged);
}

function mergeReviewArtifactSettings(
  userArtifacts: ReviewArtifactSettings | undefined,
  projectArtifacts: ReviewArtifactSettings | undefined,
): ReviewArtifactSettings | undefined {
  const merged = {
    ...(userArtifacts ?? {}),
    ...(projectArtifacts ?? {}),
  };
  return definedReviewArtifacts(merged);
}

function mergeReviewRetrySettings(
  userRetry: ReviewRetrySettingsInput | undefined,
  projectRetry: ReviewRetrySettingsInput | undefined,
): ReviewRetrySettings {
  const merged: ReviewRetrySettingsInput = {
    ...(userRetry ?? {}),
    ...(projectRetry ?? {}),
    // salvage merges deep: a project layer that omits (or partially sets)
    // salvage must not clobber an inherited user-level opt-in.
    ...(userRetry?.salvage !== undefined || projectRetry?.salvage !== undefined
      ? {
          salvage: {
            ...(userRetry?.salvage ?? {}),
            ...(projectRetry?.salvage ?? {}),
          },
        }
      : {}),
    // resubmit merges deep for the same reason as salvage.
    ...(userRetry?.resubmit !== undefined || projectRetry?.resubmit !== undefined
      ? {
          resubmit: {
            ...(userRetry?.resubmit ?? {}),
            ...(projectRetry?.resubmit ?? {}),
          },
        }
      : {}),
    // dispatch_breaker merges deep for the same reason as salvage/resubmit.
    ...(userRetry?.dispatch_breaker !== undefined ||
    projectRetry?.dispatch_breaker !== undefined
      ? {
          dispatch_breaker: {
            ...(userRetry?.dispatch_breaker ?? {}),
            ...(projectRetry?.dispatch_breaker ?? {}),
          },
        }
      : {}),
  };
  return completeReviewRetrySettings(merged);
}

function defaultReviewUnitExecutionSettings(
  unitId: ReviewExecutionUnitId,
): ReviewUnitExecutionSettings {
  if (unitId === "issue_stance_matrix") {
    return {
      timeout_ms: DEFAULT_REVIEW_RUNTIME_UNIT_TIMEOUT_MS,
      max_output_bytes: DEFAULT_REVIEW_UNIT_MAX_OUTPUT_BYTES,
    };
  }
  const timeoutMs =
    unitId === "issue_stance_response" ||
    unitId === "deliberation_response" ||
    unitId === "synthesis_response"
      ? DEFAULT_REVIEW_SHORT_LLM_UNIT_TIMEOUT_MS
      : DEFAULT_REVIEW_UNIT_TIMEOUT_MS;
  return {
    timeout_ms: timeoutMs,
    max_retries: 2,
    retry_initial_delay_ms: DEFAULT_REVIEW_RETRY_SETTINGS.retry_initial_delay_ms,
    max_output_bytes: DEFAULT_REVIEW_UNIT_MAX_OUTPUT_BYTES,
  };
}

export function defaultReviewExecutionUnits(): ReviewExecutionUnits {
  const units: ReviewExecutionUnits = {};
  for (const unitId of REVIEW_EXECUTION_UNIT_IDS) {
    units[unitId] = defaultReviewUnitExecutionSettings(unitId);
  }
  return units;
}

function mergeReviewUnitExecutionSettings(
  defaultUnit: ReviewUnitExecutionSettings | undefined,
  userUnit: ReviewUnitExecutionSettings | undefined,
  projectUnit: ReviewUnitExecutionSettings | undefined,
): ReviewUnitExecutionSettings | undefined {
  if (!defaultUnit && !userUnit && !projectUnit) return undefined;
  const mergedLlm =
    (defaultUnit?.llm || userUnit?.llm || projectUnit?.llm)
      ? {
          ...(defaultUnit?.llm ?? {}),
          ...(userUnit?.llm ?? {}),
          ...(projectUnit?.llm ?? {}),
        }
      : undefined;
  return definedReviewUnitExecutionSettings({
    ...(defaultUnit ?? {}),
    ...(userUnit ?? {}),
    ...(projectUnit ?? {}),
    ...(mergedLlm ? { llm: mergedLlm } : {}),
  });
}

function mergeReviewUnits(
  defaultUnits: ReviewExecutionUnits | undefined,
  userUnits: ReviewExecutionUnits | undefined,
  projectUnits: ReviewExecutionUnits | undefined,
): ReviewExecutionUnits {
  const out: ReviewExecutionUnits = {};
  for (const unitId of REVIEW_EXECUTION_UNIT_IDS) {
    const unit = mergeReviewUnitExecutionSettings(
      defaultUnits?.[unitId],
      userUnits?.[unitId],
      projectUnits?.[unitId],
    );
    if (unit) out[unitId] = unit;
  }
  return out;
}

function mergeReconstructActorSettings(
  userActor: ReconstructActorSettings | undefined,
  projectActor: ReconstructActorSettings | undefined,
): ReconstructActorSettings | undefined {
  return projectActor ?? userActor;
}

/**
 * user+project merge of the reconstruct block. STRUCTURE-PRESERVING by
 * construction (design §5.1): per-actor merge iterates RECONSTRUCT_ACTOR_KEYS
 * (project > user per actor), execution-level scalars iterate
 * RECONSTRUCT_EXECUTION_SCALAR_KEYS (project > user) and survive even when no
 * actors are configured on either side. Exported for the unit-level
 * drift-guard tests (direct calls, strict parser bypassed).
 */
export function mergeReconstructSettings(
  user: ReconstructSettings | undefined,
  project: ReconstructSettings | undefined,
): ReconstructSettings | undefined {
  const actors: NonNullable<
    NonNullable<ReconstructSettings["execution"]>["actors"]
  > = {};
  for (const key of RECONSTRUCT_ACTOR_KEYS) {
    const merged = mergeReconstructActorSettings(
      user?.execution?.actors?.[key],
      project?.execution?.actors?.[key],
    );
    if (merged) actors[key] = merged;
  }
  const out: NonNullable<ReconstructSettings["execution"]> = {};
  if (Object.keys(actors).length > 0) out.actors = actors;
  for (const key of RECONSTRUCT_EXECUTION_SCALAR_KEYS) {
    const value = project?.execution?.[key] ?? user?.execution?.[key];
    if (value !== undefined) out[key] = value;
  }
  // dispatch_breaker merges deep (salvage/resubmit precedent): a project
  // layer that partially sets it must not clobber an inherited user opt-in.
  const dispatchBreaker =
    user?.execution?.dispatch_breaker !== undefined ||
    project?.execution?.dispatch_breaker !== undefined
      ? {
          ...(user?.execution?.dispatch_breaker ?? {}),
          ...(project?.execution?.dispatch_breaker ?? {}),
        }
      : undefined;
  if (dispatchBreaker !== undefined) out.dispatch_breaker = dispatchBreaker;
  const dispatchFallback =
    project?.execution?.dispatch_fallback ?? user?.execution?.dispatch_fallback;
  if (dispatchFallback !== undefined) out.dispatch_fallback = dispatchFallback;
  return Object.keys(out).length > 0 ? { execution: out } : undefined;
}

function contextFromSettings(settings: OntoSettings): ReviewContextSettings | undefined {
  return definedReviewContext({
    excluded_names: settings.review?.context?.excluded_names ?? settings.excluded_names,
    max_listing_depth:
      settings.review?.context?.max_listing_depth ?? settings.max_listing_depth,
    max_listing_entries:
      settings.review?.context?.max_listing_entries ?? settings.max_listing_entries,
    max_embed_lines:
      settings.review?.context?.max_embed_lines ?? settings.max_embed_lines,
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resolveActorLlmForValidation(
  actorName: "teamlead" | "lens" | "synthesize",
  ref: ReviewLlmRef | undefined,
): LlmModelSwitcherConfig | undefined {
  if (!ref) return undefined;
  const resolved = { ...ref };
  const selection = normalizeLlmModelSwitcher(resolved);
  if (!selection) {
    throw new Error(
      `review.execution.actors.${actorName}.llm must provide provider/auth fields.`,
    );
  }
  return resolved;
}

function validateUnitLlmOverride(
  unitId: ReviewExecutionUnitId,
  ref: ReviewLlmRef | undefined,
  baseRef: ReviewLlmRef | undefined,
): void {
  if (!ref) return;
  const effectiveRef = {
    ...(baseRef ?? {}),
    ...ref,
  };
  if (effectiveRef.provider === undefined) return;
  try {
    normalizeLlmModelSwitcher(effectiveRef);
  } catch (error) {
    throw new Error(
      `review.execution.units.${unitId}.llm is invalid: ${errorMessage(error)}`,
    );
  }
}

function unitDefaultActorForSettingsValidation(
  unitId: ReviewExecutionUnitId,
): "teamlead" | "lens" | "synthesize" {
  switch (unitId) {
    case "lens":
    case "issue_stance_response":
    case "deliberation_response":
      return "lens";
    case "synthesis_response":
      return "synthesize";
    case "finding_ledger":
    case "finding_relation_graph":
    case "issue_ledger":
    case "issue_stance_matrix":
    case "deliberation_plan":
    case "problem_framing":
    case "deliberation_resolution":
      return "teamlead";
  }
}

/**
 * Resolves the runtime-EFFECTIVE (provider, model) routes from merged settings
 * for supported-model validation (INV-MODEL-1), mirroring how the runtime
 * resolves each seat before it dispatches a real call. Every llm seat is found
 * by {@link collectModelSelections} (including PROVIDER-ONLY seats, which the
 * runtime still dispatches with the worker's default model):
 * - A base seat (review/reconstruct actor, top-level llm) is validated as its
 *   own (provider, model). If it carries only a provider (or only a model), the
 *   missing half stays undefined so the gate fails loud — otherwise a
 *   provider-only actor would dispatch (provider, worker-default-model) past the
 *   gate, unverified.
 * - A review-unit override (`review.execution.units.<id>.llm`) is merged over
 *   its default actor's llm (`{...actorLlm, ...unitLlm}`, the runtime's own
 *   unit→actor inheritance): the override's own half wins and the missing half
 *   is inherited from the actor (model-only inherits the provider, provider-only
 *   inherits the model), closing the partial-override bypass. If a half is
 *   unresolved after inheritance, it stays undefined so the gate fails loud.
 * - A salvage transcription model (`...retry.salvage.transcription_llm`) is
 *   validated ONLY when `salvage.enabled === true`; when salvage is disabled it
 *   never dispatches, so including it would be a false positive on an unused
 *   setting. When enabled and provider-less it inherits the runtime's default
 *   transcription provider (anthropic) — exact for the only dispatching case
 *   (the claude_code adapter uses `provider ?? "anthropic"`; see
 *   run-review-prompt-execution). Under the codex adapter a provider-less
 *   transcription is NOT dispatched (it requires `provider === "openai"`), so
 *   validating it as anthropic is a deliberate fail-closed over-approximation:
 *   it can only over-restrict (require anthropic/<model> to be supported), never
 *   admit an unverified live call.
 * A seat that still has no resolvable provider OR model keeps it undefined so
 * the membership check fails loud on it.
 */
export function collectEffectiveModelRoutes(
  settings: OntoSettings,
): EffectiveModelRoute[] {
  const nodes = collectSupportedModelDispatches(settings);
  const providerAtPath = new Map<string, string>();
  const modelAtPath = new Map<string, string>();
  for (const node of nodes) {
    if (node.provider !== undefined) providerAtPath.set(node.path, node.provider);
    if (node.model !== undefined) modelAtPath.set(node.path, node.model);
  }
  const actorLlmPathFor = (unitId: ReviewExecutionUnitId): string => {
    const actor = unitDefaultActorForSettingsValidation(unitId);
    const nested = `review.execution.actors.${actor}.llm`;
    return modelAtPath.has(nested) || providerAtPath.has(nested)
      ? nested
      : `review.execution.${actor}.llm`;
  };
  const reviewUnitOf = (nodePath: string): ReviewExecutionUnitId | undefined => {
    const match = /^review\.execution\.units\.([^.[]+)\.llm$/.exec(nodePath);
    if (!match) return undefined;
    const unitId = match[1] as ReviewExecutionUnitId;
    return REVIEW_EXECUTION_UNIT_IDS.includes(unitId) ? unitId : undefined;
  };
  // The runtime default transcription provider when a salvage transcription_llm
  // omits provider (see run-review-prompt-execution: `provider ?? "anthropic"`).
  const DEFAULT_TRANSCRIPTION_PROVIDER = "anthropic";
  const isSalvageTranscription = (nodePath: string): boolean =>
    /(^|\.)retry\.salvage\.transcription_llm$/.test(nodePath);

  // A salvage transcription model is only dispatched when salvage is enabled
  // (the runner enters salvage only on `salvage.enabled === true`). When salvage
  // is disabled the model never runs, so validating it would be a false positive
  // that could block G7 or a live run on an unused setting.
  const salvageEnabled =
    settings.review?.execution?.retry?.salvage?.enabled === true;

  // The synthesize seat dispatches only when semantic-map authoring is opted
  // in (the capability pair is attached solely under the opt-in). A dormant
  // seat (configured, opt-in off) never dispatches, so validating it would
  // block every live run on an unused setting — same dispatch-conditioned
  // exemption as salvage (design §5.1-7, U6 owner decision). Flipping the
  // opt-in on brings the seat into the walk and fails loud then.
  const semanticMapAuthoringEnabled =
    isReconstructSemanticMapAuthoringEnabled(settings);
  const SYNTHESIZE_SEAT_PATH =
    "reconstruct.execution.actors.semantic_map_synthesize.llm";

  return nodes.flatMap((node) => {
    if (isSalvageTranscription(node.path)) {
      if (!salvageEnabled) return []; // disabled salvage transcription never dispatches
      return [{ ...node, provider: node.provider ?? DEFAULT_TRANSCRIPTION_PROVIDER }];
    }
    if (node.path === SYNTHESIZE_SEAT_PATH && !semanticMapAuthoringEnabled) {
      return []; // dormant synthesize seat never dispatches (opt-in off)
    }
    const unitId = reviewUnitOf(node.path);
    if (unitId) {
      // A review-unit override merges over its default actor llm
      // (`{...actorLlm, ...unitLlm}`): the override's own half wins, the missing
      // half is inherited from the actor. Either half left unresolved → fail loud.
      const actorPath = actorLlmPathFor(unitId);
      return [{
        provider: node.provider ?? providerAtPath.get(actorPath),
        model: node.model ?? modelAtPath.get(actorPath),
        path: node.path,
        requiredRole: node.requiredRole,
      }];
    }
    // Actors, reconstruct actors, and the top-level llm are base seats: validated
    // as their own (provider, model). A provider-only base seat keeps model
    // undefined (and vice versa) so the gate fails loud — the runtime would
    // otherwise dispatch it with the worker's default model, an unverifiable route.
    return [node];
  });
}

/**
 * Runtime gate (INV-MODEL-1): throws if any effective model route in `settings`
 * is not benchmark-verified in the authority registry. Deliberately separate
 * from {@link resolveSettingsChain} — resolution is a pure projection, this is a
 * gate. Its current live call site is the reconstruct live execution boundary
 * (where real, paid provider calls begin; review-side runtime enforcement is a
 * noted follow-up); it is also called by the G7 CI guard on the committed
 * config, so the runtime and the guard validate through one function and cannot
 * disagree. Mock/test paths that resolve settings without making real calls
 * never invoke it.
 */
export function assertSettingsModelsSupported(
  settings: OntoSettings,
  options?: SupportedModelGateOptions,
): void {
  try {
    assertSupportedModelRoutes(
      collectEffectiveModelRoutes(settings),
      loadSupportedModelRegistry(),
      options,
    );
  } catch (error) {
    if (error instanceof OntoSettingsValidationError) throw error;
    throw new OntoSettingsValidationError({
      message: error instanceof Error ? error.message : String(error),
      reasonCode: "settings_unsupported_model",
      details: {
        supported_models_authority: SUPPORTED_MODELS_AUTHORITY_PATH,
        validation_error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

/**
 * Sub-flag-level merge (project over user): the two ontological-anchoring
 * flags are independently togglable by blast radius (design §2-2), so a
 * project that sets one flag must not drop the user's other flag — a
 * whole-object override would.
 */
function mergeOntologicalAnchoringSettings(
  user: ReviewOntologicalAnchoringSettings | undefined,
  project: ReviewOntologicalAnchoringSettings | undefined,
): ReviewOntologicalAnchoringSettings {
  const obligations = project?.obligations ?? user?.obligations;
  const judgmentAnchor = project?.judgment_anchor ?? user?.judgment_anchor;
  return {
    ...(obligations !== undefined ? { obligations } : {}),
    ...(judgmentAnchor !== undefined ? { judgment_anchor: judgmentAnchor } : {}),
  };
}

function mergeSettings(
  user: OntoSettings,
  project: OntoSettings,
): OntoSettings {
  const reconstruct = mergeReconstructSettings(
    user.reconstruct,
    project.reconstruct,
  );
  const defaultExecution = defaultReviewExecution();
  const userExecution = user.review?.execution;
  const projectExecution = project.review?.execution;
  const hasExplicitExecution =
    user.review?.execution !== undefined || projectExecution !== undefined;
  const execution: ResolvedReviewExecutionSettings | undefined = hasExplicitExecution
    ? (() => {
        const retry = mergeReviewRetrySettings(
          userExecution?.retry,
          projectExecution?.retry,
        );
        const units = mergeReviewUnits(
          defaultExecution.units,
          userExecution?.units,
          projectExecution?.units,
        );
        return {
          mode:
            projectExecution?.mode ?? userExecution?.mode ?? defaultExecution.mode,
          orchestration:
            projectExecution?.orchestration ??
            userExecution?.orchestration ??
            defaultExecution.orchestration,
          executor:
            projectExecution?.executor ??
            userExecution?.executor ??
            defaultExecution.executor,
          artifact_generation_realization:
            projectExecution?.artifact_generation_realization ??
            userExecution?.artifact_generation_realization ??
            defaultExecution.artifact_generation_realization,
          ...(projectExecution?.max_concurrent_lenses !== undefined ||
          userExecution?.max_concurrent_lenses !== undefined
            ? {
                max_concurrent_lenses:
                  projectExecution?.max_concurrent_lenses ??
                  userExecution?.max_concurrent_lenses,
              }
            : {}),
          ...(projectExecution?.ontological_anchoring !== undefined ||
          userExecution?.ontological_anchoring !== undefined
            ? {
                ontological_anchoring: mergeOntologicalAnchoringSettings(
                  userExecution?.ontological_anchoring,
                  projectExecution?.ontological_anchoring,
                ),
              }
            : {}),
          teamlead: mergeReviewActorSettings(
            defaultExecution.teamlead,
            userExecution?.teamlead,
            projectExecution?.teamlead,
          ),
          lens: mergeReviewActorSettings(
            defaultExecution.lens,
            userExecution?.lens,
            projectExecution?.lens,
          ),
          synthesize: mergeReviewActorSettings(
            defaultExecution.synthesize,
            userExecution?.synthesize,
            projectExecution?.synthesize,
          ),
          deliberation:
            projectExecution?.deliberation ??
            userExecution?.deliberation ??
            defaultExecution.deliberation,
          retry,
          units,
        };
      })()
    : undefined;
  const mode =
    project.review?.mode ??
    project.review_mode ??
    user.review?.mode ??
    user.review_mode;
  const domains =
    project.review?.domains ??
    project.domains ??
    user.review?.domains ??
    user.domains;
  const context = mergeReviewContextSettings(
    contextFromSettings(user),
    contextFromSettings(project),
  );
  const artifacts = mergeReviewArtifactSettings(
    user.review?.artifacts,
    project.review?.artifacts,
  );
  const hasReview =
    user.review !== undefined ||
    project.review !== undefined ||
    mode !== undefined ||
    domains !== undefined ||
    context !== undefined ||
    artifacts !== undefined;
  const review = hasReview
    ? {
        ...(mode !== undefined ? { mode } : {}),
        ...(domains !== undefined ? { domains } : {}),
        ...(context ? { context } : {}),
        ...(execution ? { execution } : {}),
        ...(artifacts ? { artifacts } : {}),
      }
    : undefined;

  const {
    llm: _userLlm,
    review: _userReview,
    reconstruct: _userReconstruct,
    ...userRest
  } = user;
  const {
    llm: _projectLlm,
    review: _projectReview,
    reconstruct: _projectReconstruct,
    ...projectRest
  } = project;
  const merged: OntoSettings = {
    ...userRest,
    ...projectRest,
    ...((project.schema_version ?? user.schema_version) !== undefined
      ? { schema_version: project.schema_version ?? user.schema_version }
      : {}),
    ...(review ? { review } : {}),
    ...(reconstruct ? { reconstruct } : {}),
    ...(mode !== undefined ? { review_mode: mode } : {}),
    ...(domains !== undefined ? { domains } : {}),
    ...(context?.excluded_names !== undefined
      ? { excluded_names: context.excluded_names }
      : {}),
    ...(context?.max_listing_depth !== undefined
      ? { max_listing_depth: context.max_listing_depth }
      : {}),
    ...(context?.max_listing_entries !== undefined
      ? { max_listing_entries: context.max_listing_entries }
      : {}),
    ...(context?.max_embed_lines !== undefined
      ? { max_embed_lines: context.max_embed_lines }
      : {}),
  };
  return merged;
}

export function defaultReviewExecution(): ResolvedReviewExecutionSettings {
  return {
    mode: DEFAULT_REVIEW_EXECUTION.mode,
    orchestration: DEFAULT_REVIEW_EXECUTION.orchestration,
    executor: DEFAULT_REVIEW_EXECUTION.executor,
    artifact_generation_realization:
      DEFAULT_REVIEW_EXECUTION.artifact_generation_realization,
    teamlead: { ...DEFAULT_REVIEW_EXECUTION.teamlead },
    lens: { ...DEFAULT_REVIEW_EXECUTION.lens },
    synthesize: { ...DEFAULT_REVIEW_EXECUTION.synthesize },
    deliberation: DEFAULT_REVIEW_EXECUTION.deliberation,
    retry: defaultReviewRetrySettings(),
    units: defaultReviewExecutionUnits(),
  };
}

export function defaultReviewRetrySettings(): ReviewRetrySettings {
  return {
    ...DEFAULT_REVIEW_RETRY_SETTINGS,
    salvage: { ...DEFAULT_REVIEW_RETRY_SETTINGS.salvage },
    resubmit: { ...DEFAULT_REVIEW_RETRY_SETTINGS.resubmit },
    dispatch_breaker: { ...DEFAULT_REVIEW_RETRY_SETTINGS.dispatch_breaker },
  };
}

function validateActorLlmRefs(settings: OntoSettings): void {
  const execution = settings.review?.execution;
  const refs: Array<["teamlead" | "lens" | "synthesize", ReviewLlmRef | undefined]> = [
    ["teamlead", execution?.teamlead?.llm],
    ["lens", execution?.lens?.llm],
    ["synthesize", execution?.synthesize?.llm],
  ];
  for (const [actorName, ref] of refs) {
    const resolved = resolveActorLlmForValidation(actorName, ref);
    if (resolved) normalizeLlmModelSwitcher(resolved);
  }
  for (const unitId of REVIEW_EXECUTION_UNIT_IDS) {
    const actor = unitDefaultActorForSettingsValidation(unitId);
    validateUnitLlmOverride(
      unitId,
      execution?.units?.[unitId]?.llm,
      execution?.[actor]?.llm,
    );
  }
}

export async function resolveSettingsChain(
  _ontoHome: string,
  projectRoot: string,
): Promise<OntoSettings> {
  await assertNoUnsupportedConfigFiles(os.homedir());
  await assertNoUnsupportedConfigFiles(projectRoot);
  const user = await readSettingsAt(userSettingsPath());
  const project = await readSettingsAt(projectSettingsPath(projectRoot));
  const merged = mergeSettings(user, project);
  const result = NormalizedSettingsSchema.safeParse(merged);
  if (!result.success) {
    throw new OntoSettingsValidationError({
      message: [
        "Invalid merged onto settings:",
        ...result.error.issues.map((issue) => {
          const where = issue.path.length > 0 ? issue.path.join(".") : "(root)";
          return `- ${where}: ${issue.message}`;
        }),
      ].join("\n"),
      reasonCode: "merged_settings_schema_validation_failed",
      details: {
        user_settings_path: userSettingsPath(),
        project_settings_path: projectSettingsPath(projectRoot),
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join(".") || "(root)",
          message: issue.message,
        })),
      },
    });
  }
  try {
    validateActorLlmRefs(merged);
  } catch (error) {
    throw new OntoSettingsValidationError({
      message: error instanceof Error ? error.message : String(error),
      reasonCode: "settings_llm_route_validation_failed",
      details: {
        user_settings_path: userSettingsPath(),
        project_settings_path: projectSettingsPath(projectRoot),
        validation_error: error instanceof Error ? error.message : String(error),
      },
    });
  }
  // Settings resolution is a pure projection (merge → effective settings). The
  // benchmark-verified-model gate (INV-MODEL-1) is NOT applied here: it is a
  // gate, not a projection, and is applied via assertSettingsModelsSupported at
  // the reconstruct live execution boundary (real provider calls) and the G7 CI
  // guard on the committed config. Keeping resolution pure lets mock/test paths
  // resolve settings with arbitrary fixture models without tripping the model gate.
  return merged;
}
