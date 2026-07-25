/**
 * Core Stage 2 (inter-document breadth) — live N=1 admission-selection probe.
 *
 * Design SSOT: development-records/design/20260722-inter-document-breadth-stage2-design.md
 *   §13 PR-2b done-when #8 (live N=1): opt-in ON · >THRESHOLD-file corpus · real reconstruct →
 *     (1) the admission-selection LM dispatches on the REAL `semantic_author` seat (INV-MODEL-1:
 *         no separate cheap model/seat — the same author interface, one method);
 *     (2) a NON-EMPTY deep set = only the purpose-selected subset is deep-observed, each stamped
 *         `is_runtime_target_source:true` (the §5 split, NOT the frontier re-entry path);
 *     (3) honest deferred disclosure = admitted-but-un-deep-read files are RETAINED with their
 *         outline (`deferredSourceRefs`), not dropped.
 *
 * This is an N=1 route-compatibility + real-dispatch probe, NOT benchmark evidence for a default,
 * quality, or cost decision (value magnitude is a separate common-basis bench, design §14).
 *
 * The `semantic_author` seat in this repo is `gpt-5.6-sol` over OAuth (`.onto/settings.json`), which
 * dispatches through a codex worker SUBPROCESS — not the OpenAI SDK fetch path — so there is no HTTP
 * request to intercept. The evidence is the persisted artifacts (a real LM-authored
 * `source-admission-selection.yaml`, the promoted `is_runtime_target_source:true` observations, and
 * the derived deferred set) plus the `--go` gate and the ONTO_LLM_MOCK refusal below. OAuth is why
 * the owner runs this interactively (a non-interactive session may not hold the OAuth session).
 *
 * The overlay settings written to the temp projectRoot set ONLY the opt-in
 * `reconstruct.execution.source_admission_selection: true`; the merge is additive (mergeSettings /
 * mergeReconstructSettings), so the real repo `semantic_author` OAuth seat and every other repo
 * opt-in (code_structure_inventory/layout) are inherited unchanged — the live path is the product
 * path, not a re-configured one.
 *
 * Usage (from repo root):
 *   node --import tsx scripts/stage2-admission-live-e2e.mts          # preflight only (0 provider calls)
 *   node --import tsx scripts/stage2-admission-live-e2e.mts --go     # REAL reconstruct on the OAuth seat
 *   (or: npm run test:reconstruct:admission:live -- --go)
 * Optional: --files=N to size the corpus (default 60; must exceed the threshold to admit).
 */
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { createOntoReconstructCoreApi } from "../src/core-api/reconstruct-api.ts";
import {
  assertSettingsModelsSupported,
  resolveSettingsChain,
} from "../src/core-runtime/discovery/settings-chain.ts";
import { normalizeLlmModelSwitcher } from "../src/core-runtime/llm/model-switcher.ts";
import {
  deferredSourceRefs,
  SOURCE_ADMISSION_DEEP_FILE_LIMIT,
} from "../src/core-runtime/reconstruct/run.ts";
import { SOURCE_ADMISSION_SELECTION_THRESHOLD } from "../src/core-runtime/reconstruct/materialize-preparation.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);

// Lineage id the admission-selection stage stamps on every promoted observation
// (run.ts runSourceAdmissionSelectionStage → observeInventoryUnitDeep lineage). Filtering on it
// isolates the admission-stage deep set from any later exploration-round / maturation observations
// (which carry different batch ids and is_runtime_target_source:false).
const ADMISSION_OBSERVATION_BATCH_ID = "source-observation-batch:admission";

const DEFAULT_CORPUS_FILES = 60;
const INTENT =
  "Reconstruct a compact operational ontology seed for the BILLING / INVOICING domain: " +
  "how invoices, line items, tax, payments, and their approval and dunning state relate. " +
  "Ignore authentication, telemetry, and generic utility code unless a billing rule depends on it.";

// Load-bearing sources whose bytes must not change during the live run (changed-path stability).
const STABILITY_SOURCE_REFS = [
  "src/core-runtime/reconstruct/run.ts",
  "src/core-runtime/reconstruct/materialize-preparation.ts",
  "src/core-runtime/reconstruct/source-observations.ts",
  "src/core-api/reconstruct-api.ts",
  "src/core-runtime/discovery/settings-chain.ts",
  ".onto/settings.json",
];

function log(message: string): void {
  process.stdout.write(`[stage2-admission-live] ${message}\n`);
}

function sha256(value: string | Uint8Array): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function parseFilesArg(): number {
  const arg = process.argv.find((a) => a.startsWith("--files="));
  if (!arg) return DEFAULT_CORPUS_FILES;
  const n = Number(arg.slice("--files=".length));
  if (!Number.isSafeInteger(n) || n <= SOURCE_ADMISSION_SELECTION_THRESHOLD) {
    throw new Error(
      `--files must be a safe integer > SOURCE_ADMISSION_SELECTION_THRESHOLD ` +
        `(${SOURCE_ADMISSION_SELECTION_THRESHOLD}) to admit; got ${arg}`,
    );
  }
  return n;
}

// A tiny but structurally real code file per theme. The four themes give the LM a genuine
// purpose-relevance choice (the intent targets `billing`); the outline skeleton (code inventory)
// carries the exported signatures the author sees. Assertions stay STRUCTURAL — selection quality
// is recorded for eyeballing, never asserted (N=1 is route-compat, not a quality bench).
const THEMES = [
  {
    key: "billing",
    file: (i: number) =>
      `export interface Invoice${i} {\n` +
      `  id: string;\n  amountCents: number;\n  taxCents: number;\n  approved: boolean;\n}\n\n` +
      `export function invoiceTotal${i}(inv: Invoice${i}): number {\n` +
      `  return inv.amountCents + inv.taxCents;\n}\n\n` +
      `export function isOverdue${i}(dueEpochMs: number, nowMs: number): boolean {\n` +
      `  return nowMs > dueEpochMs;\n}\n\n` +
      `export function applyLateFee${i}(inv: Invoice${i}, feeCents: number): Invoice${i} {\n` +
      `  return { ...inv, amountCents: inv.amountCents + feeCents };\n}\n`,
  },
  {
    key: "auth",
    file: (i: number) =>
      `export interface Session${i} {\n  userId: string;\n  token: string;\n  expiresAt: number;\n}\n\n` +
      `export function isSessionValid${i}(s: Session${i}, nowMs: number): boolean {\n` +
      `  return s.expiresAt > nowMs;\n}\n\n` +
      `export function refreshToken${i}(s: Session${i}, ttlMs: number, nowMs: number): Session${i} {\n` +
      `  return { ...s, expiresAt: nowMs + ttlMs };\n}\n`,
  },
  {
    key: "telemetry",
    file: (i: number) =>
      `export interface Metric${i} {\n  name: string;\n  value: number;\n  at: number;\n}\n\n` +
      `export function emit${i}(name: string, value: number, at: number): Metric${i} {\n` +
      `  return { name, value, at };\n}\n\n` +
      `export function sum${i}(metrics: Metric${i}[]): number {\n` +
      `  return metrics.reduce((acc, m) => acc + m.value, 0);\n}\n`,
  },
  {
    key: "util",
    file: (i: number) =>
      `export function clamp${i}(x: number, lo: number, hi: number): number {\n` +
      `  return Math.max(lo, Math.min(hi, x));\n}\n\n` +
      `export function chunk${i}<T>(xs: T[], size: number): T[][] {\n` +
      `  const out: T[][] = [];\n  for (let k = 0; k < xs.length; k += size) out.push(xs.slice(k, k + size));\n` +
      `  return out;\n}\n`,
  },
] as const;

async function writeCorpus(
  corpusRoot: string,
  fileCount: number,
): Promise<Array<{ ref: string; theme: string }>> {
  const refs: Array<{ ref: string; theme: string }> = [];
  for (let i = 0; i < fileCount; i += 1) {
    const theme = THEMES[i % THEMES.length]!;
    const dir = path.join(corpusRoot, theme.key);
    await fs.mkdir(dir, { recursive: true });
    const ref = path.join(dir, `${theme.key}-${String(i).padStart(3, "0")}.ts`);
    await fs.writeFile(ref, theme.file(i), "utf8");
    refs.push({ ref, theme: theme.key });
  }
  return refs;
}

type AnyRecord = Record<string, unknown>;

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

async function readYaml<T = AnyRecord>(ref: string): Promise<T> {
  return parseYaml(await fs.readFile(ref, "utf8")) as T;
}

async function pathExists(ref: string): Promise<boolean> {
  try {
    await fs.stat(ref);
    return true;
  } catch {
    return false;
  }
}

async function snapshotStability(): Promise<Record<string, string>> {
  return Object.fromEntries(
    await Promise.all(
      STABILITY_SOURCE_REFS.map(async (ref) => [
        ref,
        sha256(await fs.readFile(path.join(REPO_ROOT, ref))),
      ]),
    ),
  );
}

async function run(): Promise<void> {
  const go = process.argv.includes("--go");
  if (process.env.ONTO_LLM_MOCK !== undefined) {
    throw new Error("live probe refuses to run while ONTO_LLM_MOCK is present");
  }
  const fileCount = parseFilesArg();
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const projectRoot = path.join(REPO_ROOT, ".onto", "temp", `stage2-admission-live-${runId}`);
  const corpusRoot = path.join(projectRoot, "corpus");
  const projectSettingsRef = path.join(projectRoot, ".onto", "settings.json");
  const sessionRoot = path.join(projectRoot, ".onto", "reconstruct", "session");

  await fs.mkdir(path.dirname(projectSettingsRef), { recursive: true });
  // Additive overlay: opt-in ONLY. Everything else (the gpt-5.6-sol OAuth semantic_author seat, the
  // code opt-ins) is inherited from the repo settings via the settings chain.
  const overlaySettings = {
    schema_version: "settings.json/v3",
    reconstruct: { execution: { source_admission_selection: true } },
  };
  await fs.writeFile(projectSettingsRef, `${JSON.stringify(overlaySettings, null, 2)}\n`, "utf8");
  const corpus = await writeCorpus(corpusRoot, fileCount);
  const targetRefs = corpus.map((c) => c.ref);

  // Preflight: resolve the EFFECTIVE settings the run will use and prove the route is the real
  // OAuth author seat (INV-MODEL-1: no separate admission seat) with the opt-in on.
  const settings = await resolveSettingsChain(REPO_ROOT, projectRoot);
  assertSettingsModelsSupported(settings);
  const optInResolved = settings.reconstruct?.execution?.source_admission_selection === true;
  if (!optInResolved) {
    throw new Error("preflight: source_admission_selection did not resolve to true from the overlay");
  }
  const semanticAuthor = settings.reconstruct?.execution?.actors?.semantic_author;
  if (!semanticAuthor?.llm) {
    throw new Error("preflight: no semantic_author seat resolved (repo settings not inherited?)");
  }
  const selection = normalizeLlmModelSwitcher(semanticAuthor.llm);
  if (!selection || selection.model_provider === undefined || selection.model_id === undefined) {
    throw new Error("preflight: semantic_author seat did not resolve to a concrete provider/model");
  }
  const route = {
    provider: selection.model_provider,
    auth: selection.auth ?? null,
    model: selection.model_id,
    effort: selection.reasoning_effort ?? null,
    execution_route: selection.execution_route ?? null,
    execution_adapter: selection.execution_adapter ?? null,
  };
  // INV-MODEL-1 structural fact: there is exactly ONE author seat; admission selection is a method
  // on it (writeSourceAdmissionSelection), never a distinct model/seat key. Record the seat list.
  const actorKeys = Object.keys(settings.reconstruct?.execution?.actors ?? {});

  if (fileCount <= SOURCE_ADMISSION_SELECTION_THRESHOLD) {
    throw new Error(
      `preflight: corpus (${fileCount}) must exceed SOURCE_ADMISSION_SELECTION_THRESHOLD ` +
        `(${SOURCE_ADMISSION_SELECTION_THRESHOLD}) to enter admission mode`,
    );
  }

  const stabilityBefore = await snapshotStability();
  const preflight = {
    schema_version: "stage2-admission-live-preflight/v1",
    evidence_class: "preliminary_n1_route_compatibility",
    created_at: new Date().toISOString(),
    go,
    project_root: projectRoot,
    session_root: sessionRoot,
    corpus: {
      file_count: fileCount,
      threshold: SOURCE_ADMISSION_SELECTION_THRESHOLD,
      deep_file_limit: SOURCE_ADMISSION_DEEP_FILE_LIMIT,
      theme_counts: corpus.reduce<Record<string, number>>((acc, c) => {
        acc[c.theme] = (acc[c.theme] ?? 0) + 1;
        return acc;
      }, {}),
    },
    intent: INTENT,
    opt_in_resolved: optInResolved,
    route,
    actor_seats: actorKeys,
    product_claim_limit:
      "N=1 route compatibility + real-dispatch only; not a default, quality, or cost decision",
  };
  const preflightRef = path.join(projectRoot, "admission-live-preflight.json");
  await fs.writeFile(preflightRef, `${JSON.stringify(preflight, null, 2)}\n`);
  log(`preflight=${preflightRef}`);
  log(
    `route provider=${route.provider} auth=${route.auth} model=${route.model} ` +
      `corpus=${fileCount} (threshold=${SOURCE_ADMISSION_SELECTION_THRESHOLD})`,
  );
  if (!go) {
    log("provider_calls=0 (--go absent). Re-run with --go to dispatch on the OAuth seat.");
    return;
  }

  const api = createOntoReconstructCoreApi({ ontoHome: REPO_ROOT });
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();

  const admissionSelectionRef = path.join(sessionRoot, "source-admission-selection.yaml");
  const admissionSelectionValidationRef = path.join(
    sessionRoot,
    "source-admission-selection-validation.yaml",
  );
  const sourceInventoryRef = path.join(sessionRoot, "source-inventory.yaml");
  const sourceObservationsRef = path.join(sessionRoot, "source-observations.yaml");

  const writeCheckpoint = async (
    terminalStatus: string,
    detail: AnyRecord,
  ): Promise<string> => {
    const checkpointRef = path.join(projectRoot, "admission-live-checkpoint.json");
    const artifactsPresent = {
      source_admission_selection: await pathExists(admissionSelectionRef),
      source_admission_selection_validation: await pathExists(admissionSelectionValidationRef),
      source_inventory: await pathExists(sourceInventoryRef),
      source_observations: await pathExists(sourceObservationsRef),
    };
    await fs.writeFile(
      checkpointRef,
      `${JSON.stringify(
        {
          schema_version: "stage2-admission-live-checkpoint/v1",
          terminal_status: terminalStatus,
          ...detail,
          artifacts_present: artifactsPresent,
          session_root: sessionRoot,
        },
        null,
        2,
      )}\n`,
    );
    return checkpointRef;
  };

  let result: Awaited<ReturnType<typeof api.runReconstruct>>;
  try {
    result = await api.runReconstruct({
      projectRoot,
      targetRefs,
      sessionRoot,
      intent: INTENT,
      semanticAuthorRealization: "direct_call",
      confirmationProviderRealization: "direct_call",
    });
  } catch (error) {
    const ref = await writeCheckpoint("threw", {
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
    });
    log(`FAIL (threw) checkpoint=${ref}`);
    throw error;
  }

  if (result.status !== "completed" || result.reconstructRecord.record_stage !== "completed") {
    const ref = await writeCheckpoint("not_completed", {
      status: result.status,
      record_stage:
        result.status === "completed" ? result.reconstructRecord.record_stage : null,
      failure: result.status === "failed" ? result.failure : null,
    });
    throw new Error(
      `live reconstruct terminal status=${result.status}; expected completed. checkpoint=${ref}`,
    );
  }

  // ---- Read the persisted artifacts ----
  const inventory = await readYaml<{ inventory_units: AnyRecord[] }>(sourceInventoryRef);
  const observationsDoc = await readYaml<{ observations: AnyRecord[] }>(sourceObservationsRef);
  const admissionSelection = await readYaml<AnyRecord>(admissionSelectionRef);
  const admissionValidation = await readYaml<AnyRecord>(admissionSelectionValidationRef);
  const observations = asArray(observationsDoc.observations) as AnyRecord[];
  const inventoryUnits = asArray(inventory.inventory_units) as AnyRecord[];

  const resolveRef = (r: unknown): string => path.resolve(String(r));
  const admittedUnits = inventoryUnits.filter((u) => u.scan_status === "admitted");
  const admittedRefs = new Set(admittedUnits.map((u) => resolveRef(u.ref)));

  // ---- Assertion 1: real semantic_author dispatch (INV-MODEL-1) ----
  const frontierRefs = asArray(admissionSelection.frontier_refs) as AnyRecord[];
  const acceptedIds = asArray(admissionValidation.accepted_frontier_ref_ids) as string[];
  if (admissionValidation.validation_status !== "valid") {
    throw new Error(
      `admission-selection validation_status=${String(admissionValidation.validation_status)}; expected valid`,
    );
  }
  if (acceptedIds.length < 1 || acceptedIds.length > SOURCE_ADMISSION_DEEP_FILE_LIMIT) {
    throw new Error(
      `accepted_frontier_ref_ids=${acceptedIds.length}; expected 1..${SOURCE_ADMISSION_DEEP_FILE_LIMIT} ` +
        `(a bounded selection, not observe-all)`,
    );
  }
  const authoredRationale = frontierRefs.some(
    (fr) => typeof fr.rationale === "string" && fr.rationale.trim().length > 0,
  );
  if (!authoredRationale) {
    throw new Error("no LM-authored rationale on any frontier_ref (dispatch produced no real content)");
  }

  // ---- Assertion 2: non-empty deep set, selected-only, is_runtime_target_source:true ----
  const admissionObs = observations.filter(
    (o) => o.observation_batch_id === ADMISSION_OBSERVATION_BATCH_ID,
  );
  if (admissionObs.length === 0) {
    throw new Error("no admission-batch observations: the selected subset was never deep-observed");
  }
  for (const o of admissionObs) {
    if (o.is_runtime_target_source !== true) {
      throw new Error(
        `admission observation ${String(o.observation_id)} is_runtime_target_source=${String(
          o.is_runtime_target_source,
        )}; expected true (the §5 split)`,
      );
    }
    if (o.triggering_frontier_validation_ref != null) {
      throw new Error(
        `admission observation ${String(o.observation_id)} carries a triggering_frontier_validation_ref ` +
          `(frontier re-entry path, not the initial-admission split)`,
      );
    }
  }
  const admissionDeepRefs = new Set(admissionObs.map((o) => resolveRef(o.source_ref)));
  for (const ref of admissionDeepRefs) {
    if (!admittedRefs.has(ref)) {
      throw new Error(`deep-observed ref outside the admitted set: ${ref}`);
    }
  }
  if (admissionDeepRefs.size > SOURCE_ADMISSION_DEEP_FILE_LIMIT) {
    throw new Error(
      `admission deep file count ${admissionDeepRefs.size} exceeds SOURCE_ADMISSION_DEEP_FILE_LIMIT ` +
        `(${SOURCE_ADMISSION_DEEP_FILE_LIMIT})`,
    );
  }
  if (admissionDeepRefs.size >= admittedRefs.size) {
    throw new Error(
      `deep set (${admissionDeepRefs.size}) is not a strict subset of admitted (${admittedRefs.size}) ` +
        `— admission did not narrow the deep observation set`,
    );
  }

  // ---- Assertion 3: honest deferred disclosure (retained with outline, not dropped) ----
  const deferred = deferredSourceRefs({
    sourceInventory: { inventory_units: inventoryUnits as never },
    sourceObservations: { observations: observations as never },
  });
  if (deferred.length === 0) {
    throw new Error("deferred set is empty: no admitted-but-un-deep-read files were disclosed");
  }
  const deferredWithoutOutline = deferred.filter((d) => d.outline_present !== true);
  if (deferredWithoutOutline.length > 0) {
    throw new Error(
      `${deferredWithoutOutline.length} deferred refs lack a retained outline (dropped, not deferred)`,
    );
  }

  // ---- Provenance: load-bearing sources stable during the run ----
  const stabilityAfter = await snapshotStability();
  if (JSON.stringify(stabilityBefore) !== JSON.stringify(stabilityAfter)) {
    throw new Error("changed-path source bytes changed during the live probe");
  }
  const gitHead = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT })).stdout.trim();

  // Soft selection-quality signal (RECORDED, never asserted): which themes did the LM pick?
  const refThemeByResolved = new Map(corpus.map((c) => [resolveRef(c.ref), c.theme]));
  const selectedThemeCounts = [...admissionDeepRefs].reduce<Record<string, number>>((acc, r) => {
    const theme = refThemeByResolved.get(r) ?? "unknown";
    acc[theme] = (acc[theme] ?? 0) + 1;
    return acc;
  }, {});

  const evidence = {
    schema_version: "stage2-admission-live-evidence/v1",
    evidence_class: "preliminary_n1_route_compatibility",
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    duration_ms: Date.now() - startedMs,
    project_root: projectRoot,
    session_root: sessionRoot,
    route,
    actor_seats: actorKeys,
    corpus: preflight.corpus,
    intent: INTENT,
    terminal: { status: result.status, record_stage: result.reconstructRecord.record_stage },
    done_when: {
      // (1) real semantic_author dispatch (INV-MODEL-1)
      admission_selection: {
        frontier_ref_count: frontierRefs.length,
        accepted_count: acceptedIds.length,
        deep_file_limit: SOURCE_ADMISSION_DEEP_FILE_LIMIT,
        has_authored_rationale: authoredRationale,
        sample_rationales: frontierRefs
          .slice(0, 3)
          .map((fr) => ({ source_ref: String(fr.source_ref), rationale: String(fr.rationale) })),
      },
      // (2) non-empty deep set, selected-only, runtime-target
      deep_set: {
        admission_observation_count: admissionObs.length,
        distinct_deep_file_count: admissionDeepRefs.size,
        admitted_file_count: admittedRefs.size,
        all_runtime_target_source: true,
        strict_subset_of_admitted: true,
        selected_theme_counts: selectedThemeCounts,
      },
      // (3) honest deferred disclosure
      deferred: {
        deferred_count: deferred.length,
        all_outline_present: true,
        sample_refs: deferred.slice(0, 5).map((d) => path.basename(d.ref)),
      },
    },
    provenance: {
      git_head: gitHead,
      load_bearing_sources_stable_during_run: true,
      overlay_settings_sha256: sha256(`${JSON.stringify(overlaySettings, null, 2)}\n`),
    },
    product_claim_limit: preflight.product_claim_limit,
  };
  const evidenceDir = path.join(
    REPO_ROOT,
    "development-records",
    "benchmark",
    "stage2-admission-live",
  );
  await fs.mkdir(evidenceDir, { recursive: true });
  const evidenceRef = path.join(evidenceDir, `${runId}.json`);
  await fs.writeFile(evidenceRef, `${JSON.stringify(evidence, null, 2)}\n`);
  log(`PASS evidence=${evidenceRef}`);
  log(
    `admitted=${admittedRefs.size} deep=${admissionDeepRefs.size} deferred=${deferred.length} ` +
      `accepted=${acceptedIds.length} selected_themes=${JSON.stringify(selectedThemeCounts)}`,
  );
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await run();
}
