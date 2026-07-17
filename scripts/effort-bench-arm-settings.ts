/**
 * Effort-bench arm eval-settings generator (adaptive-effort design §4-4, §8
 * P1-②; development-records/design/20260716-effort-benchmark-and-setting-logic-design.md).
 *
 * Produces one clean settings.json/v3 document per (coverage-zone, effort)
 * arm cell, reusing the p2-eval-settings pattern
 * (development-records/benchmark/m3/p2-eval-settings/). An arm manipulates
 * EXACTLY two axes off a base settings document: the inline embed budget
 * knob (`review.context.max_embed_lines`, settings-chain.ts:404 — the
 * bench's coverage lever) and the whole-pipeline effort bundle (owner
 * decision F2: effort applies to EVERY review LLM seat as one bundle — no
 * per-stage claims). Everything else must stay byte-identical to the base or
 * the arm comparison is confounded (INV-EXP-1: one variable at a time).
 *
 * `verifyConfoundDiff` is the machine proof: it flattens the base and each
 * generated arm to (path -> primitive) maps and asserts every differing path
 * is accounted for by the two axes above, and that each intended path
 * actually carries the intended value. `buildArmFiles` runs it over the
 * whole batch before returning, so a confounded arm can never reach disk.
 *
 * Pure — no I/O in the generator/verifier; only the CLI touches the
 * filesystem. Fail-loud throughout: this module never repairs a malformed
 * base or a tampered arm, it rejects it.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface ArmSpec {
  zone: string;
  maxEmbedLines: number;
  effort: string;
}

export interface ArmFile {
  filename: string;
  settings: Record<string, unknown>;
}

/** A coverage zone's identity + the embed-lines value that realizes it (design §4-4). */
export interface ZoneSpec {
  name: string;
  maxEmbedLines: number;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function fail(msg: string): never {
  throw new Error(`effort-bench-arm-settings: ${msg}`);
}

function requireNonEmptyString(v: unknown, label: string): string {
  if (typeof v !== "string" || v.length === 0) {
    fail(`${label} must be a non-empty string, got ${JSON.stringify(v)}`);
  }
  return v as string;
}

function requirePositiveInt(v: unknown, label: string): number {
  if (!Number.isInteger(v) || (v as number) <= 0) {
    fail(`${label} must be a positive integer, got ${JSON.stringify(v)}`);
  }
  return v as number;
}

function validateArmSpec(spec: ArmSpec): ArmSpec {
  return {
    zone: requireNonEmptyString(spec.zone, "spec.zone"),
    maxEmbedLines: requirePositiveInt(spec.maxEmbedLines, "spec.maxEmbedLines"),
    effort: requireNonEmptyString(spec.effort, "spec.effort"),
  };
}

/** JSON-safe deep clone. Settings documents are pure JSON (no Date/Map/undefined). */
function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

interface LlmSite {
  /** JSON-pointer-ish path to the `effort` field, e.g. review/execution/units/lens/llm/effort. */
  path: string;
  llm: Record<string, unknown>;
}

/**
 * Walk review.execution.{units,actors}.*.llm — the whole-pipeline effort
 * bundle's seat set (owner F2). A unit/actor entry without an `llm` key
 * (e.g. `issue_stance_matrix`, which is deterministic) is skipped, not an
 * error; only a TOTAL absence of llm sites is fail-loud (callers decide).
 */
function findLlmSites(review: Record<string, unknown>): LlmSite[] {
  const execution = review.execution;
  if (!isRecord(execution)) fail("review.execution must be an object");
  const sites: LlmSite[] = [];
  for (const group of ["units", "actors"] as const) {
    const groupObj = execution[group];
    if (groupObj === undefined) continue;
    if (!isRecord(groupObj)) fail(`review.execution.${group} must be an object`);
    for (const [name, entryRaw] of Object.entries(groupObj)) {
      if (!isRecord(entryRaw)) continue;
      const llm = entryRaw.llm;
      if (llm === undefined) continue; // deterministic unit (e.g. issue_stance_matrix) — not an error
      if (!isRecord(llm)) fail(`review.execution.${group}.${name}.llm must be an object`);
      sites.push({ path: `review/execution/${group}/${name}/llm/effort`, llm });
    }
  }
  return sites;
}

/** Read-only variant of findLlmSites for verification (no mutation). */
function collectLlmEffortPaths(settings: Record<string, unknown>): string[] {
  const review = settings.review;
  if (!isRecord(review)) fail("settings.review must be an object");
  return findLlmSites(review).map((s) => s.path);
}

/** Set `effort` on every review LLM seat. Fail-loud if none exist to host the bundle. */
function applyEffortBundle(review: Record<string, unknown>, effort: string): string[] {
  const sites = findLlmSites(review);
  if (sites.length === 0) {
    fail(
      "no review LLM seats found under review.execution.units.*.llm or review.execution.actors.*.llm " +
        "— a base with no review LLM seats cannot host the effort bundle",
    );
  }
  for (const site of sites) site.llm.effort = effort;
  return sites.map((s) => s.path);
}

/**
 * Deep-clone `base` and apply exactly the two-axis arm manipulation: the
 * inline embed budget knob and the whole-pipeline effort bundle. Never
 * touches anything outside `review` (e.g. `reconstruct` stays untouched),
 * and never creates structure the base doesn't already have.
 */
export function generateArmSettings(base: unknown, spec: ArmSpec): Record<string, unknown> {
  const validSpec = validateArmSpec(spec);
  if (!isRecord(base)) fail("base settings must be an object");
  const clone = deepClone(base);
  const review = clone.review;
  if (!isRecord(review)) fail("base.review must be an object");
  const context = review.context;
  if (!isRecord(context)) {
    fail("base.review.context must be an object (never create missing structure)");
  }
  context.max_embed_lines = validSpec.maxEmbedLines;
  applyEffortBundle(review, validSpec.effort);
  return clone;
}

type FlatValue = string | number | boolean | null;

/**
 * Flatten a JSON value to a map of JSON-pointer-ish path -> primitive.
 * Arrays are indexed (`.../0`, `.../1`, ...); an empty object/array is
 * recorded at its own path as a `{}`/`[]` marker so its presence still
 * participates in the diff.
 */
function flatten(value: unknown, prefix = "", out: Map<string, FlatValue> = new Map()): Map<string, FlatValue> {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      out.set(prefix, "[]");
    } else {
      value.forEach((item, i) => flatten(item, prefix ? `${prefix}/${i}` : String(i), out));
    }
    return out;
  }
  if (isRecord(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      out.set(prefix, "{}");
    } else {
      for (const k of keys) flatten(value[k], prefix ? `${prefix}/${k}` : k, out);
    }
    return out;
  }
  out.set(prefix, (value === undefined ? null : (value as FlatValue)));
  return out;
}

/** Paths that are added, removed, or hold a different value between two flattened maps. */
function diffFlat(baseFlat: Map<string, FlatValue>, armFlat: Map<string, FlatValue>): Set<string> {
  const diff = new Set<string>();
  for (const p of new Set([...baseFlat.keys(), ...armFlat.keys()])) {
    const bothPresent = baseFlat.has(p) && armFlat.has(p);
    if (!bothPresent || baseFlat.get(p) !== armFlat.get(p)) diff.add(p);
  }
  return diff;
}

/**
 * The confound-diff machine proof (design §4-4): for every generated arm,
 * assert that the set of paths differing from `base` is exactly a subset of
 * { review/context/max_embed_lines } ∪ { review/execution/{units,actors}/*
 * /llm/effort }, AND that each of those intended paths actually carries the
 * spec's intended value. Throws listing every offending path otherwise.
 *
 * Only arm-vs-base is checked (not pairwise between arms): since every arm's
 * off-axis surface is proven identical to the same base, transitivity means
 * any two arms' off-axis surfaces are identical to each other too — a
 * separate pairwise pass would prove nothing new.
 */
export function verifyConfoundDiff(
  base: unknown,
  arms: Array<{ spec: ArmSpec; settings: Record<string, unknown> }>,
): void {
  if (!isRecord(base)) fail("base settings must be an object");
  const baseFlat = flatten(base);
  for (const { spec, settings } of arms) {
    const validSpec = validateArmSpec(spec);
    const armLabel = `${validSpec.zone}/${validSpec.effort}`;
    if (!isRecord(settings)) fail(`arm ${armLabel}: settings must be an object`);
    const armFlat = flatten(settings);
    const diffPaths = diffFlat(baseFlat, armFlat);
    const effortPaths = new Set(collectLlmEffortPaths(base));

    const offending = [...diffPaths].filter(
      (p) => p !== "review/context/max_embed_lines" && !effortPaths.has(p),
    );
    if (offending.length > 0) {
      fail(
        `arm ${armLabel}: off-axis diff at path(s) not accounted for by the embed-lines knob or the ` +
          `effort bundle: ${offending.sort().join(", ")}`,
      );
    }

    const valueMismatches: string[] = [];
    const embedVal = armFlat.get("review/context/max_embed_lines");
    if (embedVal !== validSpec.maxEmbedLines) {
      valueMismatches.push(
        `review/context/max_embed_lines expected ${validSpec.maxEmbedLines}, got ${JSON.stringify(embedVal)}`,
      );
    }
    for (const p of effortPaths) {
      const v = armFlat.get(p);
      if (v !== validSpec.effort) {
        valueMismatches.push(`${p} expected ${JSON.stringify(validSpec.effort)}, got ${JSON.stringify(v)}`);
      }
    }
    if (valueMismatches.length > 0) {
      fail(`arm ${armLabel}: intended path(s) do not carry the intended value: ${valueMismatches.join("; ")}`);
    }
  }
}

/**
 * Compose the cross product of zones × efforts into arm settings files,
 * running `verifyConfoundDiff` over the whole batch before returning (a
 * confounded arm can never reach disk). Zone names and (zone, effort) pairs
 * must be unique.
 */
export function buildArmFiles(base: unknown, zones: ZoneSpec[], efforts: string[]): ArmFile[] {
  if (!Array.isArray(zones) || zones.length === 0) fail("zones must be a non-empty list");
  if (!Array.isArray(efforts) || efforts.length === 0) fail("efforts must be a non-empty list");

  const zoneNames = new Set<string>();
  for (const z of zones) {
    const name = requireNonEmptyString(z.name, "zone.name");
    if (zoneNames.has(name)) fail(`duplicate zone name: ${name}`);
    zoneNames.add(name);
  }

  const pairKeys = new Set<string>();
  const specs: ArmSpec[] = [];
  for (const zone of zones) {
    for (const effort of efforts) {
      const spec: ArmSpec = { zone: zone.name, maxEmbedLines: zone.maxEmbedLines, effort };
      const key = `${spec.zone}::${spec.effort}`;
      if (pairKeys.has(key)) fail(`duplicate (zone, effort) pair: ${key}`);
      pairKeys.add(key);
      specs.push(spec);
    }
  }

  const generated = specs.map((spec) => ({ spec, settings: generateArmSettings(base, spec) }));
  verifyConfoundDiff(base, generated);

  return generated.map(({ spec, settings }) => ({
    filename: `settings-${spec.zone}-${spec.effort}.json`,
    settings,
  }));
}

// ── CLI ──

function readOption(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

function readMulti(argv: string[], name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i += 1) if (argv[i] === `--${name}` && argv[i + 1]) out.push(argv[i + 1]!);
  return out;
}

function parseZoneArg(raw: string): ZoneSpec {
  const eq = raw.indexOf("=");
  if (eq <= 0) fail(`--zone must be name=lines, got ${JSON.stringify(raw)}`);
  const name = raw.slice(0, eq);
  const linesRaw = raw.slice(eq + 1);
  const lines = Number(linesRaw);
  if (!Number.isInteger(lines) || lines <= 0) {
    fail(`--zone ${name}: lines must be a positive integer, got ${JSON.stringify(linesRaw)}`);
  }
  return { name, maxEmbedLines: lines };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const basePath = readOption(argv, "base");
  const outDir = readOption(argv, "out");
  if (!basePath) fail("--base <path> is required");
  if (!outDir) fail("--out <dir> is required");

  const zones = readMulti(argv, "zone").map(parseZoneArg);
  const efforts = readMulti(argv, "effort");

  const base = JSON.parse(await fs.readFile(basePath, "utf8"));
  const files = buildArmFiles(base, zones, efforts);

  await fs.mkdir(outDir, { recursive: true });
  for (const file of files) {
    const outPath = path.join(outDir, file.filename);
    await fs.writeFile(outPath, `${JSON.stringify(file.settings, null, 2)}\n`, "utf8");
    console.log(`✔ ${file.filename} → ${outPath}`);
  }
  console.log(`\n${files.length} arm settings file(s) written to ${outDir}`);
}

// Run only when invoked directly (so generateArmSettings/verifyConfoundDiff/buildArmFiles stay unit-testable).
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    process.exit(1);
  });
}
