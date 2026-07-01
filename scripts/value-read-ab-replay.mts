/**
 * Maturation value-read cut — paid live A/B replay (design §16.6 NEXT / §7 semantic-quality gate).
 *
 * Replays ONLY the value-read stage on the stalled real evidence run (defect3-ab-fix-rerun2, 101MB
 * accounting-kr, status: blocked) with a REAL LLM author — no full re-run (so no seed-readiness
 * deadlock, no whole-pipeline spend). It loads that run's REAL baseline / actionability-matrix /
 * source-observations / source-safety ledger, builds the direct-call author on the configured
 * reconstruct route (resolveSettingsChain → semantic_author → resolveLlmProviderConfig), and runs
 * runMaturationValueReadStage. The 101MB source xlsx is re-read from disk by readTargetedCellValues.
 *
 * It MEASURES the semantic-quality gap §7/§16.5 leaves open: does the LLM pick sensible cells, are the
 * read values real (not hallucinated), is `satisfied` defensible, and does the discharge move blocked
 * rows to value_resolved → continuation actionable_limited? Strategy A's honest limitation (head-sample,
 * not whole-column) is in scope to observe.
 *
 * Cost control (verification discipline: probe at N before full): VALUE_READ_AB_PROBE_ROWS caps the
 * limitation-backed rows fed to the stage (default 6 = one per limitation kind). Set 0 for all 60.
 *
 *   npx tsx scripts/value-read-ab-replay.mts
 *   VALUE_READ_AB_PROBE_ROWS=0 npx tsx scripts/value-read-ab-replay.mts   # full 60-row run
 */
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import {
  createDirectCallReconstructDirectiveAuthor,
  runMaturationValueReadStage,
} from "../src/core-runtime/reconstruct/run.ts";
import {
  buildActionabilityMatrixArtifact,
  buildMaturationContinuationDecisionArtifact,
  validateMaturationValueDischarge,
} from "../src/core-runtime/reconstruct/maturation-validation.ts";
import {
  resolveReconstructActorLlmSettings,
  resolveSettingsChain,
} from "../src/core-runtime/discovery/settings-chain.ts";
import { resolveLlmProviderConfig } from "../src/core-runtime/llm/llm-caller.ts";

const REPO = "/Users/kangmin/cowork/onto-mcp-claude";
const RUN_DIR = path.join(REPO, ".onto/reconstruct/defect3-ab-fix-rerun2");
const PROBE_ROWS = Number(process.env.VALUE_READ_AB_PROBE_ROWS ?? "6");
// REUSE=1: skip the live LLM stage and re-validate the LAST run's discharge artifact (LLM-free,
// deterministic) — used to prove the unblock end-to-end after fixing the harness's replay assembly.
const REUSE = process.env.VALUE_READ_AB_REUSE === "1";
// Absolute refs matching the rerun2 artifacts' own ref fields (validators check ref-equality, §13.5 F5).
const OBS_REF = path.join(RUN_DIR, "source-observations.yaml");
const SAFETY_REF = path.join(RUN_DIR, "source-safety-ledger.yaml");
const SAFETY_VAL_REF = path.join(RUN_DIR, "source-safety-ledger-validation.yaml");
const BASELINE_VAL_REF = path.join(RUN_DIR, "maturation-baseline-validation.yaml");

const log = (m: string) => console.log(m);
const loadYaml = async <T,>(rel: string): Promise<T> =>
  parseYaml(await fs.readFile(path.join(RUN_DIR, rel), "utf8")) as T;

async function main() {
  log(`[ab] loading rerun2 artifacts from ${RUN_DIR}`);
  const maturationBaseline = await loadYaml<any>("maturation-baseline.yaml");
  const maturationBaselineValidation = await loadYaml<any>("maturation-baseline-validation.yaml");
  const baselineMatrixFull = await loadYaml<any>("baseline-actionability-matrix.yaml");
  const sourceObservations = await loadYaml<any>("source-observations.yaml");
  const sourceSafetyLedger = await loadYaml<any>("source-safety-ledger.yaml");
  const sourceSafetyLedgerValidation = await loadYaml<any>("source-safety-ledger-validation.yaml");

  // Probe cap: keep N limitation-backed blocker|high rows (one per limitation kind for a representative
  // probe), so a first live run costs ~2N LLM calls instead of ~120. PROBE_ROWS=0 → all rows.
  const allRows: any[] = baselineMatrixFull.rows ?? [];
  const lbRows = allRows.filter(
    (r) => r.member_readiness === "limitation_backed" &&
      (r.materiality === "blocker" || r.materiality === "high"),
  );
  let keptRows = allRows;
  if (PROBE_ROWS > 0) {
    const seenKind = new Set<string>();
    const probe: any[] = [];
    for (const r of lbRows) {
      const kind = (r.limitation_refs ?? [])[0] ?? "(none)";
      if (!seenKind.has(kind)) {
        seenKind.add(kind);
        probe.push(r);
      }
      if (probe.length >= PROBE_ROWS) break;
    }
    keptRows = probe;
    log(`[ab] PROBE mode: ${probe.length} limitation-backed rows (of ${lbRows.length}); set VALUE_READ_AB_PROBE_ROWS=0 for all`);
  } else {
    keptRows = lbRows;
    log(`[ab] FULL mode: ${lbRows.length} limitation-backed rows`);
  }
  const baselineMatrix = { ...baselineMatrixFull, rows: keptRows };

  // Session id MUST match the rerun2 baseline (the validator checks session_id equality).
  const sessionId = String(maturationBaseline.session_id ?? "value-read-ab");
  const sessionRoot = path.join(REPO, ".onto/reconstruct/value-read-ab");
  await fs.mkdir(sessionRoot, { recursive: true });
  const dischargePath = path.join(sessionRoot, "maturation-value-discharge.yaml");

  let discharge: any;
  let dischargeValidation: any;

  if (REUSE) {
    // LLM-free re-validation of the prior run's discharge (deterministic unblock proof). Align its
    // session_id to the baseline, then re-validate + recompute the matrix with the correct refs.
    log(`[ab] REUSE mode: re-validating existing discharge (no LLM) at ${dischargePath}`);
    discharge = parseYaml(await fs.readFile(dischargePath, "utf8")) as any;
    discharge.session_id = sessionId;
    dischargeValidation = validateMaturationValueDischarge({
      maturationValueDischarge: discharge,
      maturationValueDischargeRef: dischargePath,
      maturationBaseline,
      maturationBaselineValidation,
      maturationBaselineValidationRef: BASELINE_VAL_REF,
      sourceObservations,
      sourceObservationsRef: OBS_REF,
      sourceSafetyLedger,
      sourceSafetyLedgerRef: SAFETY_REF,
      sourceSafetyLedgerValidation,
      sourceSafetyLedgerValidationRef: SAFETY_VAL_REF,
    });
  } else {
    // Build the direct-call author on the configured reconstruct route (mirrors reconstruct-api).
    const settings = await resolveSettingsChain(REPO, REPO);
    const actorLlm = resolveReconstructActorLlmSettings(settings, "semantic_author");
    const llmConfig = resolveLlmProviderConfig({ config: { llm: actorLlm } });
    log(`[ab] route: provider=${llmConfig.provider} model=${llmConfig.model_id ?? (llmConfig as any).model ?? "?"} adapter=${(llmConfig as any).execution_adapter ?? "?"}`);
    const directiveAuthor = createDirectCallReconstructDirectiveAuthor({ llmConfig });

    log(`[ab] running value-read stage (LIVE) over ${keptRows.length} rows…`);
    const t0 = Date.now();
    const result = await runMaturationValueReadStage({
      sessionId,
      baselineMatrix,
      maturationBaseline,
      maturationBaselineValidation,
      maturationBaselineValidationRef: BASELINE_VAL_REF,
      sourceObservations,
      sourceObservationsRef: OBS_REF,
      sourceSafetyLedger,
      sourceSafetyLedgerRef: SAFETY_REF,
      sourceSafetyLedgerValidation,
      sourceSafetyLedgerValidationRef: SAFETY_VAL_REF,
      directiveAuthor,
      sessionRoot,
    });
    const durS = ((Date.now() - t0) / 1000).toFixed(1);
    log(`[ab] stage done in ${durS}s`);
    log(`[ab] dischargePath=${result.dischargePath}`);
    log(`[ab] censusPath=${result.censusPath}`);
    if (!result.dischargePath) {
      log("[ab] NO-OP (no candidate / no author capability) — nothing to measure.");
      return;
    }
    discharge = parseYaml(await fs.readFile(result.dischargePath, "utf8")) as any;
    dischargeValidation = result.dischargeValidationPath
      ? (parseYaml(await fs.readFile(result.dischargeValidationPath, "utf8")) as any)
      : null;
  }

  log(`\n[ab] ===== CENSUS =====`);
  log(JSON.stringify(discharge.census, null, 2));
  log(`[ab] discharge validation: ${dischargeValidation?.validation_status}`);

  log(`\n[ab] ===== DISCHARGES (semantic quality) =====`);
  for (const d of discharge.discharges ?? []) {
    const ev = d.value_evidence_ref ?? {};
    log(`- ${d.discharge_id}`);
    log(`    target_limitations: ${JSON.stringify(d.target_limitation_refs)}`);
    log(`    read_scope: ${JSON.stringify(ev.read_scope)} cells_read=${ev.cells_read} truncated=${ev.read_truncated}`);
    log(`    status: ${d.satisfaction_status}`);
    log(`    rationale: ${d.rationale}`);
  }

  // Recompute the matrix WITH the discharge → did blocked rows move to value_resolved?
  if (dischargeValidation) {
    log(`[ab] discharge validation (recomputed): ${dischargeValidation.validation_status}`);
    for (const v of dischargeValidation.violations ?? []) {
      log(`    violation: ${v.code} | ${(v.message ?? "").slice(0, 120)}`);
    }
    const matrix = buildActionabilityMatrixArtifact({
      sessionId,
      maturationBaseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      maturationBaselineValidationRef: BASELINE_VAL_REF,
      maturationValueDischarge: discharge,
      maturationValueDischargeValidation: dischargeValidation,
    });
    const counts: Record<string, number> = {};
    for (const r of matrix.rows ?? []) counts[r.member_readiness] = (counts[r.member_readiness] ?? 0) + 1;
    log(`\n[ab] ===== MATRIX READINESS (full baseline, with discharge) =====`);
    log(JSON.stringify(counts, null, 2));
  }
  log(`\n[ab] artifacts under ${sessionRoot} (gitignored). Review the discharges above for: sensible cell pick, real (non-hallucinated) read values, defensible satisfied, and §16.5 head-sample limitation.`);
}

main().catch((e) => {
  console.error("[ab] FAILED:", e instanceof Error ? e.stack ?? e.message : String(e));
  process.exit(1);
});
