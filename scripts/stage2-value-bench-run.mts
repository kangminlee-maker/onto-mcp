/**
 * Stage 2 value-magnitude bench — RUN harness (Phase 1+2: corpus snapshot + OFF/ON reconstructs).
 * Design SSOT: development-records/design/20260723-stage2-value-bench-design.md §9 (v2 LOCKED).
 *
 * The long pole (~2-3h, real gpt-5.6-sol OAuth). Phases 3-6 (negative control, neutral CQ set,
 * blind Opus judging, report) operate on the persisted seeds and are orchestrated separately
 * (main session, cross-family Opus subagents) — they do NOT run here.
 *
 * Common basis (§9.3): same corpus snapshot (identical bytes), same de-enumerated intent, same
 * seat. The ONLY variable is the opt-in overlay. The harness snapshots each arm's fully-resolved
 * reconstruct.execution config and asserts they are byte-identical except source_admission_selection.
 *
 * Hard guards (§9.6): both runs record_stage==completed; OFF admitted==0 ∧ ON admitted>0; corpus
 * manifest sha drift throws; cost computed by one pure function applied identically to both arms.
 *
 * Usage (from repo root):
 *   node --import tsx scripts/stage2-value-bench-run.mts         # preflight (0 provider calls)
 *   node --import tsx scripts/stage2-value-bench-run.mts --go    # REAL: OFF then ON reconstruct
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { createOntoReconstructCoreApi } from "../src/core-api/reconstruct-api.ts";
import { resolveSettingsChain } from "../src/core-runtime/discovery/settings-chain.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// §9.2 corpus: openai-node SDK (Apache-2.0) src slice — 10 resource domains, authored .ts only.
const OPENAI_RESOURCES = path.join(REPO_ROOT, "node_modules", "openai", "src", "resources");
const CORPUS_DOMAINS: Array<{ domain: string; role: "target" | "distractor" }> = [
  { domain: "chat", role: "target" },
  { domain: "responses", role: "target" },
  { domain: "realtime", role: "target" },
  { domain: "conversations", role: "target" },
  { domain: "audio", role: "distractor" },
  { domain: "fine-tuning", role: "distractor" },
  { domain: "vector-stores", role: "distractor" },
  { domain: "uploads", role: "distractor" },
  { domain: "evals", role: "distractor" },
  { domain: "containers", role: "distractor" },
];
const EXPECTED_FILE_COUNT = 59;
const EXPECTED_TARGET_COUNT = 20;

// §9.2 de-enumerated intent — states the PURPOSE without naming the out-of-scope directories, so the
// selector must INFER irrelevance (the enumerated form rigged selection to trivial string-matching).
const INTENT =
  "Reconstruct the conversational API surface of this SDK: how chat completions, responses, " +
  "realtime sessions, and conversations relate — messages, roles, tool and function calls, " +
  "streaming, and their parameters and result shapes.";

// §9.4 blinding normalization: the substantive ontology layers the judge sees. Everything else
// (seed_identity, purpose framing, source_authority, handoff_limitations, ontology_handoff,
// decision_context) is STRIPPED so the ON seed's deferral/limitation disclosure cannot de-blind it.
const SEED_SUBSTANTIVE_KEYS = [
  "conceptual_frame",
  "semantic_layer",
  "kinetic_layer",
  "dynamic_layer",
  "data_binding_layer",
  "validation_layer",
];

// Both arms enable the DETERMINISTIC code-observation opt-ins (no extra LLM cost) so the admission
// outline carries a real code skeleton — production-faithful and fair to the ON arm. Identical on
// both arms → common-basis holds (only source_admission_selection differs). semantic_map_authoring
// is left OFF (heavy separate LLM feature, orthogonal to the ontology-seed + admission we measure).
// Note: settings resolve from ~/.onto/settings.json (seats) + this per-arm project overlay; the repo
// .onto/settings.json is NOT read here (resolveSettingsChain ignores its first arg), so the code
// opt-ins must be set explicitly rather than inherited from the repo.
const CODE_OPTINS = { code_structure_inventory: true, code_structure_layout: true };
const ARMS = [
  { arm: "off", overlay: { ...CODE_OPTINS } as Record<string, unknown> },
  { arm: "on", overlay: { ...CODE_OPTINS, source_admission_selection: true } },
] as const;

function log(m: string): void {
  process.stdout.write(`[value-bench-run] ${m}\n`);
}
function sha256(v: string | Uint8Array): string {
  return crypto.createHash("sha256").update(v).digest("hex");
}
type AnyRec = Record<string, unknown>;

async function enumerateTs(dir: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (d: string): Promise<void> => {
    for (const ent of await fs.readdir(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) await walk(p);
      else if (ent.isFile() && p.endsWith(".ts") && !p.endsWith(".d.ts")) out.push(p);
    }
  };
  await walk(dir);
  return out.sort();
}

/** §9.6 pure cost function — distinct deep-observed source files, applied IDENTICALLY to both arms. */
function distinctDeepObservedRefs(observations: AnyRec[]): Set<string> {
  return new Set(observations.map((o) => path.resolve(String(o.source_ref))));
}

/** §9.1 total provider tokens — recursive sum over the run manifest (structure-robust). */
function sumProviderTokens(node: unknown): { in: number; out: number } {
  let tin = 0;
  let tout = 0;
  const visit = (n: unknown): void => {
    if (Array.isArray(n)) {
      n.forEach(visit);
      return;
    }
    if (n && typeof n === "object") {
      for (const [k, v] of Object.entries(n)) {
        if (k === "provider_tokens_in" && typeof v === "number") tin += v;
        else if (k === "provider_tokens_out" && typeof v === "number") tout += v;
        else visit(v);
      }
    }
  };
  visit(node);
  return { in: tin, out: tout };
}

function normalizeSeed(seed: AnyRec): AnyRec {
  const out: AnyRec = {};
  for (const k of SEED_SUBSTANTIVE_KEYS) if (k in seed) out[k] = seed[k];
  return out;
}

async function buildCorpusSnapshot(snapshotRoot: string): Promise<{
  manifest: {
    file_count: number;
    target_count: number;
    distractor_count: number;
    files: Array<{ rel: string; domain: string; role: string; sha256: string }>;
  };
  manifestSha: string;
}> {
  const files: Array<{ rel: string; domain: string; role: string; sha256: string; abs: string }> = [];
  for (const { domain, role } of CORPUS_DOMAINS) {
    const domainDir = path.join(OPENAI_RESOURCES, domain);
    for (const abs of await enumerateTs(domainDir)) {
      const rel = path.join(domain, path.relative(domainDir, abs));
      files.push({ rel, domain, role, sha256: sha256(await fs.readFile(abs)), abs });
    }
  }
  if (files.length !== EXPECTED_FILE_COUNT) {
    throw new Error(
      `corpus drift: expected ${EXPECTED_FILE_COUNT} files, found ${files.length} ` +
        `(openai version changed? re-pin the manifest)`,
    );
  }
  const targetCount = files.filter((f) => f.role === "target").length;
  if (targetCount !== EXPECTED_TARGET_COUNT) {
    throw new Error(`corpus drift: expected ${EXPECTED_TARGET_COUNT} target files, found ${targetCount}`);
  }
  // Materialize the snapshot (both arms read these identical bytes).
  for (const f of files) {
    const dest = path.join(snapshotRoot, f.rel);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(f.abs, dest);
  }
  const manifest = {
    file_count: files.length,
    target_count: targetCount,
    distractor_count: files.length - targetCount,
    files: files.map(({ rel, domain, role, sha256 }) => ({ rel, domain, role, sha256 })),
  };
  return { manifest, manifestSha: sha256(JSON.stringify(manifest.files)) };
}

async function runArm(args: {
  arm: string;
  overlay: Record<string, unknown>;
  snapshotRoot: string;
  benchRoot: string;
  go: boolean;
}): Promise<AnyRec> {
  const armRoot = path.join(args.benchRoot, args.arm);
  const projectSettingsRef = path.join(armRoot, ".onto", "settings.json");
  const sessionRoot = path.join(armRoot, ".onto", "reconstruct", "session");
  const corpusRoot = path.join(armRoot, "corpus");
  // Copy the shared snapshot into this arm's project (identical bytes for both arms).
  await fs.cp(args.snapshotRoot, corpusRoot, { recursive: true });
  const overlaySettings = {
    schema_version: "settings.json/v3",
    ...(Object.keys(args.overlay).length > 0
      ? { reconstruct: { execution: args.overlay } }
      : {}),
  };
  await fs.mkdir(path.dirname(projectSettingsRef), { recursive: true });
  await fs.writeFile(projectSettingsRef, `${JSON.stringify(overlaySettings, null, 2)}\n`, "utf8");

  // Fully-resolved config snapshot (§9.3 common-basis proof).
  const settings = await resolveSettingsChain(REPO_ROOT, armRoot);
  const resolvedExecution = settings.reconstruct?.execution ?? {};
  await fs.writeFile(
    path.join(armRoot, "resolved-execution.json"),
    `${JSON.stringify(resolvedExecution, null, 2)}\n`,
  );

  const targetRefs = (await enumerateTs(corpusRoot));
  if (targetRefs.length !== EXPECTED_FILE_COUNT) {
    throw new Error(`${args.arm}: snapshot copy has ${targetRefs.length} files, expected ${EXPECTED_FILE_COUNT}`);
  }

  if (!args.go) {
    return { arm: args.arm, preflight_only: true, resolved_execution: resolvedExecution, target_refs: targetRefs.length };
  }

  const api = createOntoReconstructCoreApi({ ontoHome: REPO_ROOT });
  const startedMs = Date.now();
  const result = await api.runReconstruct({
    projectRoot: armRoot,
    targetRefs,
    sessionRoot,
    intent: INTENT,
    semanticAuthorRealization: "direct_call",
    confirmationProviderRealization: "direct_call",
  });
  const wallMs = Date.now() - startedMs;

  if (result.status !== "completed" || result.reconstructRecord.record_stage !== "completed") {
    const detail = result.status === "failed" ? JSON.stringify(result.failure) : result.reconstructRecord.record_stage;
    throw new Error(`${args.arm} run not completed: status=${result.status} detail=${detail}`);
  }

  const inventory = parseYaml(await fs.readFile(path.join(sessionRoot, "source-inventory.yaml"), "utf8")) as {
    inventory_units: AnyRec[];
  };
  const observationsDoc = parseYaml(await fs.readFile(path.join(sessionRoot, "source-observations.yaml"), "utf8")) as {
    observations: AnyRec[];
  };
  const manifestDoc = parseYaml(
    await fs.readFile(path.join(sessionRoot, "reconstruct-run-manifest.yaml"), "utf8"),
  );
  const seed = parseYaml(await fs.readFile(path.join(sessionRoot, "ontology-seed.yaml"), "utf8")) as AnyRec;

  const admittedCount = inventory.inventory_units.filter((u) => u.scan_status === "admitted").length;
  // §9.6 each arm took its intended path.
  if (args.arm === "off" && admittedCount !== 0) {
    throw new Error(`OFF arm produced ${admittedCount} admitted units; expected 0 (observe-all path)`);
  }
  if (args.arm === "on" && admittedCount === 0) {
    throw new Error(`ON arm produced 0 admitted units; expected >0 (admission path — threshold not crossed?)`);
  }

  const deepRefs = distinctDeepObservedRefs(observationsDoc.observations);
  const tokens = sumProviderTokens(manifestDoc);
  const admissionBatchDeep = new Set(
    observationsDoc.observations
      .filter((o) => o.observation_batch_id === "source-observation-batch:admission")
      .map((o) => path.resolve(String(o.source_ref))),
  );
  const roundIds = new Set(observationsDoc.observations.map((o) => String(o.round_id ?? "")));

  // Persist the seed + normalized (blind) projection for the judging phase.
  await fs.copyFile(path.join(sessionRoot, "ontology-seed.yaml"), path.join(args.benchRoot, `seed-${args.arm}.yaml`));
  await fs.writeFile(
    path.join(args.benchRoot, `seed-${args.arm}.normalized.yaml`),
    stringifyYaml(normalizeSeed(seed)),
  );

  const summary = {
    arm: args.arm,
    status: result.status,
    record_stage: result.reconstructRecord.record_stage,
    wall_ms: wallMs,
    admitted_count: admittedCount,
    final_deep_file_count: deepRefs.size,
    admission_deep_file_count: admissionBatchDeep.size,
    round_ids: [...roundIds].sort(),
    round_count: roundIds.size,
    total_observations: observationsDoc.observations.length,
    provider_tokens_in: tokens.in,
    provider_tokens_out: tokens.out,
    provider_tokens_total: tokens.in + tokens.out,
    session_root: sessionRoot,
    resolved_execution: resolvedExecution,
  };
  await fs.writeFile(path.join(args.benchRoot, `arm-${args.arm}.summary.json`), `${JSON.stringify(summary, null, 2)}\n`);
  log(
    `${args.arm}: deep=${deepRefs.size} admitted=${admittedCount} tokens=${tokens.in + tokens.out} ` +
      `rounds=${roundIds.size} wall=${Math.round(wallMs / 1000)}s`,
  );
  return summary;
}

/** Deep-equal two resolved-execution configs after removing the opt-in under test (§9.3). */
function configsMatchExceptOptIn(off: AnyRec, on: AnyRec): boolean {
  const strip = (c: AnyRec): string => {
    const clone = JSON.parse(JSON.stringify(c)) as AnyRec;
    delete clone.source_admission_selection;
    return JSON.stringify(clone, Object.keys(clone).sort());
  };
  return strip(off) === strip(on);
}

async function run(): Promise<void> {
  const go = process.argv.includes("--go");
  if (process.env.ONTO_LLM_MOCK !== undefined) {
    throw new Error("value bench refuses to run while ONTO_LLM_MOCK is present");
  }
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const benchRoot = path.join(REPO_ROOT, ".onto", "temp", `stage2-value-bench-${runId}`);
  const snapshotRoot = path.join(benchRoot, "corpus-snapshot");
  await fs.mkdir(benchRoot, { recursive: true });

  const { manifest, manifestSha } = await buildCorpusSnapshot(snapshotRoot);
  await fs.writeFile(
    path.join(benchRoot, "corpus-manifest.json"),
    `${JSON.stringify({ ...manifest, manifest_sha256: manifestSha, source: "openai-node src (Apache-2.0)" }, null, 2)}\n`,
  );
  log(
    `corpus: ${manifest.file_count} files (target ${manifest.target_count} / distractor ${manifest.distractor_count}) ` +
      `manifest_sha=${manifestSha.slice(0, 12)}`,
  );
  log(`intent: ${INTENT}`);

  // --only=<arm> runs a single arm (e.g. ON only, after OFF is known to overflow observe-all at this
  // corpus size — the value finding that reframed the bench). Omit to run both arms.
  const onlyArm = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length);
  const armsToRun = onlyArm ? ARMS.filter((a) => a.arm === onlyArm) : ARMS;
  if (onlyArm && armsToRun.length === 0) throw new Error(`--only=${onlyArm} matches no arm`);

  const summaries: AnyRec[] = [];
  for (const { arm, overlay } of armsToRun) {
    summaries.push(await runArm({ arm, overlay: { ...overlay }, snapshotRoot, benchRoot, go }));
  }

  if (!go) {
    log("provider_calls=0 (--go absent). Re-run with --go to execute the reconstruct(s).");
    log(`preflight bench_root=${benchRoot}`);
    return;
  }

  if (onlyArm) {
    const only = summaries[0]!;
    await fs.writeFile(
      path.join(benchRoot, `value-bench-run-report.${onlyArm}-only.json`),
      `${JSON.stringify({ schema_version: "stage2-value-bench-run/v1", only_arm: onlyArm, corpus: { ...manifest, manifest_sha256: manifestSha }, intent: INTENT, arm: only, seed_normalized: path.join(benchRoot, `seed-${onlyArm}.normalized.yaml`) }, null, 2)}\n`,
    );
    log(`PASS (${onlyArm}-only) bench_root=${benchRoot} deep=${only.final_deep_file_count} tokens=${only.provider_tokens_total}`);
    return;
  }

  const off = summaries.find((s) => s.arm === "off")!;
  const on = summaries.find((s) => s.arm === "on")!;
  // §9.3 common-basis proof: configs identical except the opt-in.
  const configOk = configsMatchExceptOptIn(
    off.resolved_execution as AnyRec,
    on.resolved_execution as AnyRec,
  );
  if (!configOk) {
    throw new Error("common-basis violated: resolved reconstruct.execution differs beyond source_admission_selection");
  }

  const report = {
    schema_version: "stage2-value-bench-run/v1",
    created_at: new Date().toISOString(),
    bench_root: benchRoot,
    git_head: null as string | null,
    corpus: { ...manifest, manifest_sha256: manifestSha },
    intent: INTENT,
    intent_sha256: sha256(INTENT),
    common_basis_config_ok: configOk,
    cost: {
      // §9.1 primary axes
      final_deep_file_count: { off: off.final_deep_file_count, on: on.final_deep_file_count },
      provider_tokens_total: { off: off.provider_tokens_total, on: on.provider_tokens_total },
      // informational (round asymmetry may make ON lose here — honest)
      wall_ms: { off: off.wall_ms, on: on.wall_ms },
      round_count: { off: off.round_count, on: on.round_count },
      admission_deep_file_count_on: on.admission_deep_file_count,
    },
    arms: { off, on },
    seeds: {
      off_normalized: path.join(benchRoot, "seed-off.normalized.yaml"),
      on_normalized: path.join(benchRoot, "seed-on.normalized.yaml"),
    },
    product_claim_limit:
      "value-magnitude on THIS corpus/intent only (N=1); size-independence NOT claimed. " +
      "Cost primary axes = tokens + final deep-file count; dispatch/wall-time informational.",
  };
  await fs.writeFile(path.join(benchRoot, "value-bench-run-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  log(
    `PASS run-report=${path.join(benchRoot, "value-bench-run-report.json")}\n` +
      `  deep OFF=${off.final_deep_file_count} ON=${on.final_deep_file_count} | ` +
      `tokens OFF=${off.provider_tokens_total} ON=${on.provider_tokens_total} | ` +
      `wall OFF=${Math.round((off.wall_ms as number) / 1000)}s ON=${Math.round((on.wall_ms as number) / 1000)}s`,
  );
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await run();
}
