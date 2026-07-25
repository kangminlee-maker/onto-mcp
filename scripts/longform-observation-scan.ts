/**
 * Long-form embed observation collector — the R2-5 follow-up's observational
 * track (owner decision 2026-07-18: instead of a dedicated long-form bench,
 * collect real-usage truncation cases replay-ready and review the ledger
 * later; design 20260718-longform-fixture-bench-design.md §9).
 *
 * Scans review session dirs (`.onto/review/<id>/`) for sessions whose
 * persisted `execution-preparation/materialized-input.md` — the TRIMMED render
 * the packet stage actually cuts (`truncateForEmbedding(text.trim(), …)`,
 * see the line-arithmetic note in effort-bench-coverage-map.ts) — exceeds the
 * session's effective embed budget. The budget comes from the persisted
 * `embed_budget` witness in review-context-manifest.yaml (R2-4); pre-witness
 * sessions fall back to DEFAULT_MAX_EMBED_LINES and are flagged
 * `assumed_default` in the ledger.
 *
 * Each hit is preserved REPLAY-READY under a git-tracked observation dir
 * (sessions in `.onto/review/` are untracked working artifacts and may be
 * cleaned; target files drift — snapshot early):
 *   <out>/<session_id>/execution-preparation/…   (materialized-input,
 *       context manifest, target profile — request params + full uncut render)
 *   <out>/<session_id>/refs/<n>-<basename>       raw target snapshots
 *   <out>/<session_id>/observation.yaml          detection + provenance
 * plus one row in <out>/ledger.yaml. Idempotent by session_id.
 *
 * Uncut replay procedure: <out>/README.md.
 *
 * CLI:
 *   npx tsx scripts/longform-observation-scan.ts \
 *     [--review-dir .onto/review] \
 *     [--out development-records/benchmark/effort-bench/longform-observations]
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { DEFAULT_MAX_EMBED_LINES } from "../src/core-runtime/review/review-prompt-budget.js";

export interface LongformDetection {
  session_id: string;
  session_dir: string;
  /** Treated line count: `trim().split("\n").length` of the persisted render. */
  rendered_lines: number;
  max_embed_lines_effective: number;
  effective_source: "cli" | "plan" | "default" | "assumed_default";
  over_by: number;
  target_refs: string[];
  requested_target: string | null;
  target_material_kind: string | null;
}

interface RefSnapshot {
  ref: string;
  snapshot: string | null;
  sha256: string | null;
  status: "snapshotted" | "missing_at_scan";
}

interface LedgerRow extends Omit<LongformDetection, "session_dir" | "target_refs"> {
  collected_at: string;
  refs: RefSnapshot[];
}

const PREP_DIR = "execution-preparation";
const MATERIALIZED = "materialized-input.md";
const CONTEXT_MANIFEST = "review-context-manifest.yaml";
const TARGET_PROFILE = "review-target-profile.yaml";

async function readIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

/**
 * Detect whether one session's persisted render exceeded its embed budget.
 * Returns null when the session is not long-form (rendered <= effective — the
 * cut only fires strictly beyond the knob) or lacks a persisted render.
 */
export async function scanSession(
  sessionDir: string,
  defaultMaxEmbedLines: number = DEFAULT_MAX_EMBED_LINES,
): Promise<LongformDetection | null> {
  const prep = path.join(sessionDir, PREP_DIR);
  const materialized = await readIfExists(path.join(prep, MATERIALIZED));
  if (materialized === null) return null;
  const renderedLines = materialized.trim().split("\n").length;

  let effective = defaultMaxEmbedLines;
  let source: LongformDetection["effective_source"] = "assumed_default";
  let targetRefs: string[] = [];
  const manifestRaw = await readIfExists(path.join(prep, CONTEXT_MANIFEST));
  if (manifestRaw !== null) {
    const manifest = YAML.parse(manifestRaw) as {
      embed_budget?: { max_embed_lines_effective?: number; max_embed_lines_source?: string };
      target_refs?: string[];
    };
    const witness = manifest?.embed_budget;
    if (witness && typeof witness.max_embed_lines_effective === "number") {
      effective = witness.max_embed_lines_effective;
      source = (witness.max_embed_lines_source ?? "default") as LongformDetection["effective_source"];
    }
    if (Array.isArray(manifest?.target_refs)) targetRefs = manifest.target_refs.filter((r) => typeof r === "string");
  }
  if (targetRefs.length === 0) {
    // Fallback for manifests without target_refs: the render's own per-ref headers.
    targetRefs = [...materialized.matchAll(/^ref: (.+)$/gm)].map((m) => m[1]!.trim());
  }

  if (renderedLines <= effective) return null;

  let requestedTarget: string | null = null;
  let targetMaterialKind: string | null = null;
  const profileRaw = await readIfExists(path.join(prep, TARGET_PROFILE));
  if (profileRaw !== null) {
    const profile = YAML.parse(profileRaw) as { requested_target?: string; target_material_kind?: string };
    requestedTarget = profile?.requested_target ?? null;
    targetMaterialKind = profile?.target_material_kind ?? null;
  }

  return {
    session_id: path.basename(sessionDir),
    session_dir: sessionDir,
    rendered_lines: renderedLines,
    max_embed_lines_effective: effective,
    effective_source: source,
    over_by: renderedLines - effective,
    target_refs: targetRefs,
    requested_target: requestedTarget,
    target_material_kind: targetMaterialKind,
  };
}

/**
 * Preserve one detected session replay-ready under outDir and return its
 * ledger row. Copies the execution-preparation trio verbatim and snapshots
 * every target ref that still exists at scan time (raw bytes + sha256 —
 * fidelity vs review time is NOT guaranteed, which is why the scan should run
 * promptly; the copied materialized-input.md remains the authoritative
 * review-time content either way).
 */
export async function collectSession(
  detection: LongformDetection,
  outDir: string,
  now: () => string = () => new Date().toISOString(),
): Promise<LedgerRow> {
  const dest = path.join(outDir, detection.session_id);
  const destPrep = path.join(dest, PREP_DIR);
  await fs.mkdir(destPrep, { recursive: true });
  for (const name of [MATERIALIZED, CONTEXT_MANIFEST, TARGET_PROFILE]) {
    const content = await readIfExists(path.join(detection.session_dir, PREP_DIR, name));
    if (content !== null) await fs.writeFile(path.join(destPrep, name), content, "utf8");
  }

  const refs: RefSnapshot[] = [];
  const refsDir = path.join(dest, "refs");
  for (const [i, ref] of detection.target_refs.entries()) {
    const raw = await readIfExists(ref);
    if (raw === null) {
      refs.push({ ref, snapshot: null, sha256: null, status: "missing_at_scan" });
      continue;
    }
    await fs.mkdir(refsDir, { recursive: true });
    const snapshotName = `${i}-${path.basename(ref)}`;
    await fs.writeFile(path.join(refsDir, snapshotName), raw, "utf8");
    refs.push({
      ref,
      snapshot: path.join("refs", snapshotName),
      sha256: crypto.createHash("sha256").update(raw).digest("hex"),
      status: "snapshotted",
    });
  }

  const { session_dir: _sessionDir, target_refs: _targetRefs, ...rest } = detection;
  const row: LedgerRow = { ...rest, collected_at: now(), refs };
  await fs.writeFile(path.join(dest, "observation.yaml"), YAML.stringify(row), "utf8");
  return row;
}

/** Append rows to <out>/ledger.yaml, skipping session_ids already present. */
export async function updateLedger(outDir: string, rows: LedgerRow[]): Promise<{ appended: number; skipped: number }> {
  const ledgerPath = path.join(outDir, "ledger.yaml");
  const existingRaw = await readIfExists(ledgerPath);
  const existing: LedgerRow[] = existingRaw ? ((YAML.parse(existingRaw) as { observations?: LedgerRow[] })?.observations ?? []) : [];
  const known = new Set(existing.map((r) => r.session_id));
  const fresh = rows.filter((r) => !known.has(r.session_id));
  if (fresh.length > 0 || existingRaw === null) {
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(ledgerPath, YAML.stringify({ observations: [...existing, ...fresh] }), "utf8");
  }
  return { appended: fresh.length, skipped: rows.length - fresh.length };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const opt = (name: string, fallback: string): string => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
  };
  const reviewDir = opt("review-dir", ".onto/review");
  const outDir = opt(
    "out",
    "development-records/benchmark/effort-bench/longform-observations",
  );

  let sessionDirs: string[] = [];
  try {
    sessionDirs = (await fs.readdir(reviewDir, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => path.join(reviewDir, e.name));
  } catch {
    console.log(`[longform-scan] review dir not found: ${reviewDir} — scanned 0 sessions.`);
    return;
  }

  const detections: LongformDetection[] = [];
  let skippedNoRender = 0;
  for (const dir of sessionDirs) {
    const detection = await scanSession(dir);
    if (detection === null) {
      const hasRender = (await readIfExists(path.join(dir, PREP_DIR, MATERIALIZED))) !== null;
      if (!hasRender) skippedNoRender += 1;
      continue;
    }
    detections.push(detection);
  }

  const ledgerPath = path.join(outDir, "ledger.yaml");
  const existingRaw = await readIfExists(ledgerPath);
  const known = new Set(
    existingRaw ? (((YAML.parse(existingRaw) as { observations?: LedgerRow[] })?.observations ?? []).map((r) => r.session_id)) : [],
  );
  const fresh = detections.filter((d) => !known.has(d.session_id));
  const rows: LedgerRow[] = [];
  for (const d of fresh) rows.push(await collectSession(d, outDir));
  const { appended, skipped } = await updateLedger(outDir, rows);

  console.log(
    `[longform-scan] scanned ${sessionDirs.length} session(s) ` +
      `(${skippedNoRender} without a persisted render), ` +
      `long-form hits ${detections.length}, newly collected ${appended}, already-ledgered ${detections.length - fresh.length + skipped}.`,
  );
  if (detections.length === 0) {
    console.log(
      `[longform-scan] zero long-form sessions — no rendered input exceeded its embed budget ` +
        `(default ${DEFAULT_MAX_EMBED_LINES}). An empty ledger is itself the signal: the 300-line ` +
        `default has not yet been exercised by real long-form usage.`,
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
