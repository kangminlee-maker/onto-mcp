/**
 * Supported-model registry: the authority SSOT (.onto/authority/supported-models.yaml)
 * lists only models whose support a benchmark has verified (a benchmark record
 * shows the model completing a pipeline run). settings.json model selection is
 * validated against it by the supported-model GATE (assertSettingsModelsSupported
 * in settings-chain) — invoked at the reconstruct live execution boundary (real
 * provider calls) and by the G7 committed-config guard (which covers every
 * committed seat). Review-side runtime enforcement is a noted follow-up, so the
 * runtime gate today is wired on the reconstruct live path only. An unlisted
 * (provider, model) is rejected fail-loud at those gate points. Settings
 * resolution itself stays a PURE projection and does NOT apply this gate (see
 * settings-chain). The
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

export const SUPPORTED_MODELS_AUTHORITY_PATH =
  ".onto/authority/supported-models.yaml";

const SupportedModelEntrySchema = z
  .object({
    provider: z.string().min(1),
    model: z.string().min(1),
    verified_at: z.string().min(1),
    benchmark_evidence_refs: z.array(z.string().min(1)).min(1),
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
  );

const SupportedModelRegistrySchema = z
  .object({
    schema_version: z.string().min(1),
    supported_models: z.array(SupportedModelEntrySchema),
  })
  .strict();

export type SupportedModelRegistry = z.infer<typeof SupportedModelRegistrySchema>;

/** A resolved model route to validate: the effective provider and model (each
 * own or inherited), with the settings path for error reporting. Either may be
 * undefined when it could not be resolved (e.g. a provider-only override whose
 * actor has no model) — an unresolved provider OR model is rejected fail-loud,
 * since the runtime would dispatch a route the gate cannot verify. */
export interface EffectiveModelRoute {
  provider: string | undefined;
  model: string | undefined;
  path: string;
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
  return parsed.data;
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
    if (typeof record.model === "string" || typeof record.provider === "string") {
      out.push({
        provider: typeof record.provider === "string"
          ? record.provider
          : undefined,
        model: typeof record.model === "string" ? record.model : undefined,
        path: trail || "(root)",
      });
    }
    for (const [key, child] of Object.entries(record)) {
      visit(child, trail ? `${trail}.${key}` : key);
    }
  };
  visit(settings, "");
  return out;
}

/** Non-throwing membership check: is (provider, model) a benchmark-verified
 * supported route? Reuses the same verified-pair set as
 * {@link assertSupportedModelRoutes}, but returns a boolean so opt-in callers
 * (e.g. the answer-support judge per-stage model override) can DEGRADE to the
 * inherited config when an override is unsupported, instead of failing the run.
 * An unresolved provider or model is not verified. */
export function isSupportedModelRoute(
  provider: string | undefined,
  model: string | undefined,
  registry: SupportedModelRegistry,
): boolean {
  if (provider === undefined || model === undefined) return false;
  return registry.supported_models.some(
    (entry) => entry.provider === provider && entry.model === model,
  );
}

/** Throws if any effective route is not a benchmark-verified (provider, model)
 * pair. A route whose effective provider OR model could not be resolved is
 * rejected (fail-loud) rather than leniently accepted — the route must resolve
 * to a verified pair, otherwise the runtime would dispatch a route the gate
 * cannot verify. */
export function assertSupportedModelRoutes(
  routes: ReadonlyArray<EffectiveModelRoute>,
  registry: SupportedModelRegistry,
): void {
  const verified = new Set(
    registry.supported_models.map((entry) => `${entry.provider} ${entry.model}`),
  );
  const violations = routes.filter((route) =>
    route.provider === undefined ||
    route.model === undefined ||
    !verified.has(`${route.provider} ${route.model}`)
  );
  if (violations.length === 0) return;
  const detail = violations
    .map((route) =>
      `- ${route.path}: ${
        route.provider ? `${route.provider}/` : "(unresolved provider)/"
      }${route.model ?? "(unresolved model)"}`
    )
    .join("\n");
  const allowed = registry.supported_models
    .map((entry) => `${entry.provider}/${entry.model}`)
    .join(", ");
  throw new Error(
    "settings.json selects model route(s) not verified as supported by benchmark " +
      `(see ${SUPPORTED_MODELS_AUTHORITY_PATH}):\n${detail}\n` +
      `Benchmark-verified selectable models: ${allowed}. Add a model only after ` +
      "a benchmark record shows it completing a pipeline run.",
  );
}
