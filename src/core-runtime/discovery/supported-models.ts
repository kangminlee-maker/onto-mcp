/**
 * Supported-model registry: the authority SSOT (.onto/authority/supported-models.yaml)
 * lists only models whose support a benchmark has verified (a benchmark record
 * shows the model completing a pipeline run). settings.json model selection is
 * validated against it by the supported-model GATE (assertSettingsModelsSupported
 * in settings-chain) — invoked at the reconstruct live execution boundary (real
 * provider calls) and by the G7 committed-config guard (which covers every
 * committed seat). Review-side runtime enforcement is a noted follow-up, so the
 * runtime gate today is wired on the reconstruct live path only. An unlisted
 * (provider, model) is rejected fail-loud at those gate points. The only
 * runtime-owned exception is the B7 bench-candidate option passed explicitly by
 * a benchmark harness: it can rescue an UNREGISTERED pair only at an exact
 * allowlisted route path, and it never rescues registered role mismatches.
 * Settings resolution itself stays a PURE projection and does NOT apply this
 * gate (see settings-chain). The
 * authority ships with the onto install (it is located from the install root,
 * like core-lens-registry.yaml), so it is always present. The registry is data
 * (human-curated, evidence-cited); this module loads it and provides the
 * membership check the gate calls. The LLM has no authority over which models
 * are selectable.
 *
 * Membership is checked against runtime-EFFECTIVE (provider, model) routes —
 * routes the caller resolves after settings inheritance (see settings-chain's
 * collectEffectiveModelRoutes), not raw syntactic objects — so a partial unit
 * override is validated under its merged (provider, model): a model-only
 * override under its inherited actor provider, a provider-only override under
 * its inherited actor model — not leniently under any.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { resolveInstallationPath } from "./installation-paths.js";
import { REVIEW_EXECUTION_UNIT_IDS } from "./review-execution-units.js";

export const SUPPORTED_MODELS_AUTHORITY_PATH =
  ".onto/authority/supported-models.yaml";

/**
 * Role vocabulary — the sealed 6-role set, each grounded in an existing code
 * seat (INV-MODEL-1 role-aware design §2.1; `review` added by the 2026-07-11
 * review-role registration design): `author` (semantic_author actor, certified
 * by golden full-pipeline completion), `semantic_map_synthesize` /
 * `semantic_map_verify` (the semantic-map capability pair), `answer_support_judge`
 * (the judge adoption dispatch), `confirmation_provider` (confirmation actor),
 * `review` (the review execution seats — actors teamlead/lens/synthesize and
 * their unit overrides). The vocabulary is sealed here; which roles are
 * LISTABLE in a registry entry is governed separately by {@link CONTRACTED_ROLES}.
 */
export const SUPPORTED_MODEL_ROLES = [
  "author",
  "semantic_map_synthesize",
  "semantic_map_verify",
  "answer_support_judge",
  "confirmation_provider",
  "review",
] as const;

export type SupportedModelRole = (typeof SUPPORTED_MODEL_ROLES)[number];

/**
 * Roles with a DEFINED evidence contract — the only roles an entry may list in
 * `roles`. Listing a vocabulary role without a contract fails registry load
 * (fail-closed): certification must never outrun its evidence definition.
 * Growing this set means defining that role's evidence contract and carries an
 * INVARIANT-CHANGE: INV-MODEL-1 marker (role authority change).
 */
export const CONTRACTED_ROLES: readonly SupportedModelRole[] = [
  "author",
  "semantic_map_synthesize",
  // Evidence contract: review-cert/v2 (2026-07-11 review-role registration
  // design §4) — per-check pass-rate vs a contemporaneous baseline arm,
  // absolute core-check floors, pinned check universe, R7 human curation.
  "review",
];

const SupportedModelEntrySchema = z
  .object({
    provider: z.string().min(1),
    model: z.string().min(1),
    verified_at: z.string().min(1),
    benchmark_evidence_refs: z.array(z.string().min(1)).min(1),
    // Role-restricted certification (INV-MODEL-1 role-aware design §2.2).
    // ABSENT = grandfathered full-route allowance: the entry predates the role
    // dimension and keeps its flat-registry permissions (an owner
    // backward-compatibility decision, NOT a stage-traversal evidence claim).
    // PRESENT = evidence-contracted certification: the model is valid ONLY at
    // dispatches whose required role is listed. Values are further restricted
    // to CONTRACTED_ROLES at load (see assertContractedRoles).
    roles: z.array(z.enum(SUPPORTED_MODEL_ROLES)).min(1).optional(),
    notes: z.string().optional(),
    // Active (provider, model) context window in tokens — the SSOT the
    // reconstruct projection-budget helper (deriveDocumentExcerptProjectionBudget)
    // reads to scale a single text document's seed-stage excerpt to the model.
    // Optional: an entry without it falls back to the static projection FLOOR
    // (model-agnostic, no regression). INV-MODEL-1; the window field is
    // G4-protected (a change requires an INVARIANT-CHANGE: INV-MODEL-1 marker).
    context_window_tokens: z.number().int().positive().optional(),
    // Citation for context_window_tokens, kept SEPARATE from
    // benchmark_evidence_refs: a context window is a published model spec, not a
    // benchmark result. Required whenever context_window_tokens is present so a
    // window value is never unsourced (C7).
    context_window_provenance: z.string().min(1).optional(),
    // Provider-published maximum output ceiling. Reconstruct direct-API
    // headroom preflight consumes this value before any provider call.
    // INV-MODEL-1 / G4 protected, independently provenance-backed.
    max_output_tokens: z.number().int().positive().safe().optional(),
    max_output_tokens_provenance: z.string().min(1).optional(),
  })
  .strict()
  .refine(
    (entry) =>
      entry.context_window_tokens === undefined ||
      entry.context_window_provenance !== undefined,
    {
      message:
        "context_window_tokens requires context_window_provenance (a window value must cite its source)",
      path: ["context_window_provenance"],
    },
  )
  .refine(
    (entry) =>
      entry.max_output_tokens === undefined ||
      entry.max_output_tokens_provenance !== undefined,
    {
      message:
        "max_output_tokens requires max_output_tokens_provenance (an output limit must cite its source)",
      path: ["max_output_tokens_provenance"],
    },
  );

const SupportedModelRegistrySchema = z
  .object({
    schema_version: z.string().min(1),
    supported_models: z.array(SupportedModelEntrySchema),
  })
  .strict()
  .superRefine((registry, ctx) => {
    const seen = new Set<string>();
    registry.supported_models.forEach((entry, index) => {
      const key = `${entry.provider}\u0000${entry.model}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["supported_models", index],
          message: `duplicate supported model pair: ${entry.provider}/${entry.model}`,
        });
      }
      seen.add(key);
    });
  });

export type SupportedModelRegistry = z.infer<typeof SupportedModelRegistrySchema>;

export interface BenchCandidateModelAllowance {
  provider: string;
  model: string;
  allowedRoutePaths: readonly string[];
}

export interface SupportedModelGateOptions {
  benchCandidates?: readonly BenchCandidateModelAllowance[];
}

export const RECONSTRUCT_SEMANTIC_MAP_SYNTHESIZE_LLM_ROUTE_PATH =
  "reconstruct.execution.actors.semantic_map_synthesize.llm";
export const RECONSTRUCT_DISPATCH_FALLBACK_LLM_ROUTE_PATH =
  "reconstruct.execution.dispatch_fallback.llm";

/**
 * A model dispatch whose route must be gate-validated. The single runtime-owned
 * input vocabulary for role derivation (design §2.3): every place a
 * (provider, model) reaches a real LLM dispatch is either a settings path
 * (walked by collectEffectiveModelRoutes) or a NAMED non-settings dispatch.
 * A future non-settings dispatch MUST add its kind here to obtain gate
 * coverage — call-site role literals are not accepted.
 */
export type SupportedModelDispatch =
  | { kind: "settings_path"; path: string }
  | { kind: "request_judge" }
  | { kind: "semantic_map_synthesize" }
  | { kind: "semantic_map_verify" };

/**
 * Single owner of dispatch → required-role derivation (design §2.3).
 * Settings seats without a finer mapping require `author` — the strongest
 * certification (golden full-pipeline completion) — so a role-restricted entry
 * can never occupy an unmapped seat (fail-closed default).
 */
/** Bounded matcher for the review execution seats (review-role design §3):
 * the three actor seats (nested and legacy settings forms — the same fixed
 * actor names the settings schema accepts) and unit overrides restricted to
 * the KNOWN unit-id vocabulary. The bound is load-bearing: G7 walks raw
 * parsed YAML without the strict zod layer, so an unknown actor or unit key
 * DOES reach the resolver — it must fall through to the fail-closed `author`
 * default, never be adopted as a review seat. Salvage transcription
 * (`...retry.salvage.transcription_llm`) deliberately does not match. */
const REVIEW_ACTOR_SEAT_PATH =
  /^review\.execution\.(?:actors\.)?(?:teamlead|lens|synthesize)\.llm$/;
const REVIEW_UNIT_SEAT_PATH = /^review\.execution\.units\.([^.[]+)\.llm$/;

function isReviewSeatPath(path: string): boolean {
  if (REVIEW_ACTOR_SEAT_PATH.test(path)) return true;
  const unit = REVIEW_UNIT_SEAT_PATH.exec(path);
  return unit !== null &&
    (REVIEW_EXECUTION_UNIT_IDS as readonly string[]).includes(unit[1]!);
}

export function requiredSupportedModelRoleForDispatch(
  dispatch: SupportedModelDispatch,
): SupportedModelRole {
  if (dispatch.kind === "request_judge") return "answer_support_judge";
  if (dispatch.kind === "semantic_map_synthesize") return "semantic_map_synthesize";
  if (dispatch.kind === "semantic_map_verify") return "semantic_map_verify";
  switch (dispatch.path) {
    case "reconstruct.execution.actors.semantic_author.llm":
      return "author";
    case "reconstruct.execution.actors.confirmation_provider.llm":
      return "confirmation_provider";
    case RECONSTRUCT_SEMANTIC_MAP_SYNTHESIZE_LLM_ROUTE_PATH:
      return "semantic_map_synthesize";
    default:
      if (isReviewSeatPath(dispatch.path)) return "review";
      // Salvage transcription, top-level llm, unknown review actor/unit keys,
      // and any future unmapped path: require the strongest certification
      // (fail-closed).
      return "author";
  }
}

/** A resolved model route to validate: the effective provider and model (each
 * own or inherited), with the settings path for error reporting. Either may be
 * undefined when it could not be resolved (e.g. a provider-only override whose
 * actor has no model) — an unresolved provider OR model is rejected fail-loud,
 * since the runtime would dispatch a route the gate cannot verify.
 * `requiredRole` is the {@link requiredSupportedModelRoleForDispatch} projection
 * of the route's dispatch — REQUIRED so no constructor can skip role coverage. */
export interface EffectiveModelRoute {
  provider: string | undefined;
  model: string | undefined;
  path: string;
  requiredRole: SupportedModelRole;
}

/** Locates the authority registry shipped with the install by walking up from
 * this module to the install root's `.onto/authority/` — the same resolver
 * core-lens-registry.yaml uses. The authority is an install resource, not a
 * per-project file. */
function findSupportedModelsAuthorityPath(): string {
  let current = path.dirname(fileURLToPath(import.meta.url));
  const root = path.parse(current).root;
  while (current !== root) {
    try {
      const candidate = path.join(
        resolveInstallationPath("authority", current),
        "supported-models.yaml",
      );
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // Not an install root — keep walking.
    }
    current = path.dirname(current);
  }
  throw new Error(
    `Cannot find ${SUPPORTED_MODELS_AUTHORITY_PATH} from the install root. ` +
      "This authority file is the source of truth for selectable models and " +
      "must ship with the onto installation.",
  );
}

/** Shape-validates raw (already-parsed) registry data. The one validation path
 * both {@link loadSupportedModelRegistry} (disk) and tests use, so the schema
 * contract — strict shape, positive-int `context_window_tokens`, a window value
 * only with its provenance — is exercised without touching the install file. */
export function parseSupportedModelRegistry(raw: unknown): SupportedModelRegistry {
  const parsed = SupportedModelRegistrySchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Malformed supported-model registry at ${SUPPORTED_MODELS_AUTHORITY_PATH}: ` +
        parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
          .join("; "),
    );
  }
  assertRepoRelativeEvidenceRefs(parsed.data);
  assertContractedRoles(parsed.data);
  return parsed.data;
}

/** Fail-closed listable-role check: every role an entry LISTS must have a
 * defined evidence contract ({@link CONTRACTED_ROLES}). The zod enum admits the
 * full sealed vocabulary so role names never drift, but a certification without
 * an evidence contract must not exist — reject at load, not at gate time. */
export function assertContractedRoles(registry: SupportedModelRegistry): void {
  const bad: string[] = [];
  for (const entry of registry.supported_models) {
    for (const role of entry.roles ?? []) {
      if (!CONTRACTED_ROLES.includes(role)) {
        bad.push(`${entry.provider}/${entry.model}: ${role}`);
      }
    }
  }
  if (bad.length > 0) {
    throw new Error(
      `Malformed supported-model registry at ${SUPPORTED_MODELS_AUTHORITY_PATH}: ` +
        "roles lists role(s) without a defined evidence contract (listable roles: " +
        `${CONTRACTED_ROLES.join(", ")}):\n${bad.map((b) => `  - ${b}`).join("\n")}`,
    );
  }
}

/** Loads and shape-validates the supported-model registry from the install root.
 * Strict: the authority always ships, so a missing or malformed file is an
 * installation error, not a skip. */
export function loadSupportedModelRegistry(): SupportedModelRegistry {
  const filePath = findSupportedModelsAuthorityPath();
  return parseSupportedModelRegistry(parseYaml(fs.readFileSync(filePath, "utf8")));
}

/** Validates that every `benchmark_evidence_refs` entry is a repo-relative path
 * (not absolute, no `..` escape), so the cited evidence is an in-repo auditable
 * artifact rather than an out-of-tree file. Pure string check — safe at runtime
 * load; the G7 guard additionally verifies the referenced file exists (repo
 * context). Keeps the provenance contract: a registry entry must cite a record
 * that lives in the repo. */
export function assertRepoRelativeEvidenceRefs(
  registry: SupportedModelRegistry,
): void {
  const bad: string[] = [];
  for (const entry of registry.supported_models) {
    for (const ref of entry.benchmark_evidence_refs) {
      const normalized = path.normalize(ref);
      if (
        ref === "" ||
        ref.startsWith(":") || // git pathspec magic (:(glob), :!exclude, …)
        path.isAbsolute(ref) ||
        normalized === ".." ||
        normalized.startsWith(`..${path.sep}`)
      ) {
        bad.push(`${entry.provider}/${entry.model}: ${ref}`);
      }
    }
  }
  if (bad.length > 0) {
    throw new Error(
      `Malformed supported-model registry at ${SUPPORTED_MODELS_AUTHORITY_PATH}: ` +
        "benchmark_evidence_refs must be plain repo-relative paths (no absolute, " +
        `escaping, or git pathspec-magic paths):\n${
          bad.map((b) => `  - ${b}`).join("\n")
        }`,
    );
  }
}

/** Parses `git ls-files -s -z -- <ref>` output and returns the git index mode of
 * the entry whose path EXACTLY equals `ref` (exact-identity), or null. A
 * directory, glob, or pathspec-magic citation yields child or unrelated paths —
 * none equal to `ref` — so it returns null rather than the first match's mode.
 * This closes the audit-precision gap where an imprecise pathspec could resolve
 * to some tracked regular file other than the cited record. Pure (no I/O) so the
 * matching contract is unit-testable; the guard performs the git call with
 * literal pathspecs and passes the output here. */
export function exactTrackedMode(
  lsFilesZStdout: string,
  ref: string,
): string | null {
  for (const entry of lsFilesZStdout.split("\0")) {
    if (entry.length === 0) continue;
    const tab = entry.indexOf("\t");
    if (tab === -1) continue;
    if (entry.slice(tab + 1) === ref) {
      return entry.slice(0, tab).split(/\s+/)[0] ?? null;
    }
  }
  return null;
}

/** Recursively collects every LLM seat in a settings object, with its path. A
 * seat is any object carrying a string `model` and/or `provider` (in onto
 * settings these fields appear only in llm configs) — so a PROVIDER-ONLY seat
 * (an actor or unit override with provider but no model) is surfaced too, since
 * the runtime still dispatches it with the worker's default model. Each is
 * emitted with whichever of provider/model is present; the effective-route
 * resolver fills inheritance and the gate fails loud on any half left
 * unresolved. Structure-agnostic: callers resolve inheritance per seat. */
export function collectModelSelections(settings: unknown): EffectiveModelRoute[] {
  const out: EffectiveModelRoute[] = [];
  const visit = (value: unknown, trail: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${trail}[${index}]`));
      return;
    }
    if (value === null || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (trail === RECONSTRUCT_DISPATCH_FALLBACK_LLM_ROUTE_PATH) {
      const provider = typeof record.provider === "string" ? record.provider : undefined;
      const model = typeof record.model === "string" ? record.model : undefined;
      for (const kind of ["semantic_map_synthesize", "semantic_map_verify"] as const) {
        out.push({
          provider,
          model,
          path: `${trail}#${kind}`,
          requiredRole: requiredSupportedModelRoleForDispatch({ kind }),
        });
      }
      return;
    }
    if (typeof record.model === "string" || typeof record.provider === "string") {
      const path = trail || "(root)";
      out.push({
        provider: typeof record.provider === "string"
          ? record.provider
          : undefined,
        model: typeof record.model === "string" ? record.model : undefined,
        path,
        requiredRole: requiredSupportedModelRoleForDispatch({
          kind: "settings_path",
          path,
        }),
      });
    }
    for (const [key, child] of Object.entries(record)) {
      visit(child, trail ? `${trail}.${key}` : key);
    }
  };
  visit(settings, "");
  return out;
}

/** Canonical settings-to-dispatch collector consumed by runtime and G7. */
export const collectSupportedModelDispatches = collectModelSelections;

/** Does `entry` cover `role`? Absent `roles` = grandfathered full-route
 * allowance (covers every role — flat-registry backward compatibility);
 * present = covers exactly the listed roles. */
function entryCoversRole(
  entry: SupportedModelRegistry["supported_models"][number],
  role: SupportedModelRole,
): boolean {
  return entry.roles === undefined || entry.roles.includes(role);
}

function supportedModelEntryFor(
  registry: SupportedModelRegistry,
  provider: string,
  model: string,
): SupportedModelRegistry["supported_models"][number] | undefined {
  return registry.supported_models.find(
    (entry) => entry.provider === provider && entry.model === model,
  );
}

export function supportedModelMaxOutputTokens(
  registry: SupportedModelRegistry,
  provider: string,
  model: string,
): number | undefined {
  return supportedModelEntryFor(registry, provider, model)?.max_output_tokens;
}

function isAllowedUnregisteredBenchCandidate(
  route: EffectiveModelRoute,
  registry: SupportedModelRegistry,
  options: SupportedModelGateOptions | undefined,
): boolean {
  if (route.provider === undefined || route.model === undefined) return false;
  if (supportedModelEntryFor(registry, route.provider, route.model) !== undefined) {
    return false;
  }
  return (options?.benchCandidates ?? []).some(
    (candidate) =>
      candidate.provider === route.provider &&
      candidate.model === route.model &&
      candidate.allowedRoutePaths.includes(route.path),
  );
}

/** Non-throwing membership check: is (provider, model) a benchmark-verified
 * supported route FOR THIS DISPATCH? Reuses the same registry as
 * {@link assertSupportedModelRoutes}, but returns a boolean so opt-in callers
 * (e.g. the answer-support judge per-stage model override) can DEGRADE to the
 * inherited config when an override is unsupported, instead of failing the run.
 * The dispatch parameter is REQUIRED (no default) so every caller names its
 * dispatch and a role-restricted entry can never be adopted at a dispatch it
 * is not certified for (F6-b leak closure). An unresolved provider or model is
 * not verified. */
export function isSupportedModelRoute(
  provider: string | undefined,
  model: string | undefined,
  registry: SupportedModelRegistry,
  dispatch: SupportedModelDispatch,
): boolean {
  if (provider === undefined || model === undefined) return false;
  const role = requiredSupportedModelRoleForDispatch(dispatch);
  const entry = supportedModelEntryFor(registry, provider, model);
  return entry !== undefined && entryCoversRole(entry, role);
}

/** Throws if any effective route is not a benchmark-verified (provider, model)
 * pair CERTIFIED for the route's required role. A route whose effective
 * provider OR model could not be resolved is rejected (fail-loud) rather than
 * leniently accepted — the route must resolve to a verified pair, otherwise
 * the runtime would dispatch a route the gate cannot verify. A pair that is
 * registered but role-restricted (entry.roles present) is rejected at any
 * route whose requiredRole it does not list. */
export function assertSupportedModelRoutes(
  routes: ReadonlyArray<EffectiveModelRoute>,
  registry: SupportedModelRegistry,
  options?: SupportedModelGateOptions,
): void {
  const violations = routes.filter((route) => {
    if (route.provider === undefined || route.model === undefined) return true;
    const entry = supportedModelEntryFor(registry, route.provider, route.model);
    if (entry !== undefined) return !entryCoversRole(entry, route.requiredRole);
    return !isAllowedUnregisteredBenchCandidate(route, registry, options);
  });
  if (violations.length === 0) return;
  const detail = violations
    .map((route) => {
      const pair = `${
        route.provider ? `${route.provider}/` : "(unresolved provider)/"
      }${route.model ?? "(unresolved model)"}`;
      const entry = route.provider !== undefined && route.model !== undefined
        ? supportedModelEntryFor(registry, route.provider, route.model)
        : undefined;
      const reason = entry?.roles
        ? ` — certified for [${entry.roles.join(", ")}], seat requires ${route.requiredRole}`
        : "";
      return `- ${route.path}: ${pair}${reason}`;
    })
    .join("\n");
  const allowed = registry.supported_models
    .map((entry) =>
      `${entry.provider}/${entry.model}${
        entry.roles ? ` (roles: ${entry.roles.join(", ")})` : ""
      }`
    )
    .join(", ");
  throw new Error(
    "settings.json selects model route(s) not verified as supported by benchmark " +
      `(see ${SUPPORTED_MODELS_AUTHORITY_PATH}):\n${detail}\n` +
      `Benchmark-verified selectable models: ${allowed}. Add a model (or role) ` +
      "only with the evidence its contract requires (see the registry header).",
  );
}

export function assertB4BenchCandidateDispatchAllowed(args: {
  provider: string;
  model: string;
  registry?: SupportedModelRegistry;
}): { allowance: "registered_supported" | "bench_candidate"; route: EffectiveModelRoute } {
  const registry = args.registry ?? loadSupportedModelRegistry();
  const route: EffectiveModelRoute = {
    provider: args.provider,
    model: args.model,
    path: RECONSTRUCT_SEMANTIC_MAP_SYNTHESIZE_LLM_ROUTE_PATH,
    requiredRole: requiredSupportedModelRoleForDispatch({
      kind: "settings_path",
      path: RECONSTRUCT_SEMANTIC_MAP_SYNTHESIZE_LLM_ROUTE_PATH,
    }),
  };
  try {
    assertSupportedModelRoutes([route], registry);
    return { allowance: "registered_supported", route };
  } catch (error) {
    if (supportedModelEntryFor(registry, args.provider, args.model) !== undefined) {
      throw error;
    }
  }
  assertSupportedModelRoutes([route], registry, {
    benchCandidates: [{
      provider: args.provider,
      model: args.model,
      allowedRoutePaths: [RECONSTRUCT_SEMANTIC_MAP_SYNTHESIZE_LLM_ROUTE_PATH],
    }],
  });
  return { allowance: "bench_candidate", route };
}
