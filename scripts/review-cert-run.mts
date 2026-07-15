/**
 * review-cert/v1 run orchestrator (review-role registration design 2026-07-11
 * §4, §5 stage 4 — the thin I/O shell around the deterministic core modules
 * review-cert-record.ts / review-cert-assemble.ts; B4 precedent:
 * scripts/b4-cert-run.mts).
 *
 * Runs the review pipeline benchmark (scripts/review-pipeline-benchmark.ts)
 * as a subprocess ONCE PER arm × fixture × attempt (`--runs 1`, `--case
 * all-<arm effort>`, `--output <per-run json>`): the benchmark already owns
 * temp-project setup, the review CLI invocation, execution/salvage
 * accounting, and the 12-check semantic-quality-gate emission with
 * issueArtifacts — per-attempt invocation is the least code that yields
 * per-run completion + checks AND gives the retry loop (top up until
 * `--reps` ok rows per arm × fixture, capped by --max-attempts) its natural
 * granularity.
 *
 * run_controls pinning (design §4 M-1) — mechanism:
 *  - the cert measures the raw product path with resubmit ON and salvage OFF.
 *    Since the 2026-07-15 promotion made both product DEFAULTS, the harness pins
 *    them EXPLICITLY rather than relying on the default: every benchmark
 *    invocation passes `--retry-resubmit` and `--no-salvage`, and settingsForCase
 *    overlays `resubmit.enabled=true` + `salvage.enabled=false` into the temp
 *    project's .onto/settings.json;
 *  - mergeReviewRetrySettings spreads project OVER user, so the temp project's
 *    EXPLICIT values win even against a user-level ~/.onto/settings.json;
 *  - a startup MECHANICAL probe asserts settingsForCase actually yields resubmit
 *    ON + salvage OFF (fail loud if the knob regresses), and every ok row
 *    additionally requires salvaged_unit_ids=[] (row-level evidence the pin held).
 *
 * Dispatch witness (design §4 H-1): the arms dispatch spawned worker CLIs,
 * and each route gets a shim that appends one JSON line {"argv": [...]} to
 * the per-arm capture file named by ONTO_REVIEW_CERT_CAPTURE_FILE, then execs
 * the REAL binary (absolute path resolved BEFORE interposition).
 *  - codex route (codex-review-unit-executor.ts spawn("codex", ...), env
 *    inherited): a shim dir is prepended to PATH.
 *  - claude route (claude-code-review-unit-executor.ts spawns
 *    resolveClaudeBin(), which reads ONTO_CLAUDE_BIN FIRST): the shim is
 *    injected as ONTO_CLAUDE_BIN=<shim> — no PATH reliance. The bulk values
 *    after -p / --json-schema are logged as `<label:N bytes>` (the witness
 *    needs the knobs, not tens-of-KB prompt content), and the shim unsets
 *    ONTO_CLAUDE_BIN before exec (env analog of the codex PATH strip).
 * The pure projection/guard/assembly lives in
 * src/core-runtime/discovery/review-cert-assemble.ts. Both shim mechanisms
 * are self-tested at startup against /usr/bin/true (no spend).
 *
 * Modes:
 *  - default: CERT run (LIVE spend — baseline arm + candidate arm, each
 *    >= reps × 2 fixtures full review pipeline runs). Refuses ONTO_LLM_MOCK.
 *  - --rehearsal: zero-spend mock rehearsal — NOT cert-grade. Forces the
 *    ts_inline_http executor + artifact_generation_realization=semantic_mock
 *    + ONTO_LLM_MOCK=1 (the in-process mock realization; the codex shim
 *    captures nothing because no worker is spawned — witness_missing is
 *    printed and a SYNTHETIC declaration-derived capture line is injected so
 *    assembly/validation/persist are exercised end-to-end). Requires an
 *    explicit --out and writes review-cert-record.rehearsal.json (never the
 *    canonical record filename) so a rehearsal can never be cited as evidence.
 *
 * Persistence under --out (default development-records/benchmark/review-cert/<stamp>/):
 *  - review-cert-record.json            (cert) / review-cert-record.rehearsal.json
 *  - review-cert-record.rejected.json   (only when witness/guard fails — rows +
 *                                        violations, NOT a contract record)
 *  - capture/<arm>.jsonl                per-arm shim capture (the witness)
 *  - runs/<arm>-<fixture>-r<n>.json     per-attempt benchmark report
 *  - runs/<arm>-<fixture>-r<n>.log      per-attempt benchmark stdout/stderr
 *  - runs/rows.progress.jsonl           one line per completed attempt row
 *
 * Usage:
 *   npx tsx scripts/review-cert-run.mts \
 *     --candidate-model <id> --candidate-effort <effort> \
 *     [--candidate-provider openai] [--candidate-auth oauth] \
 *     [--baseline-model gpt-5.5] [--baseline-provider openai] \
 *     [--baseline-auth oauth] [--baseline-effort medium] \
 *     [--reps 3] [--max-attempts <reps+2>] [--timeout-ms <per-review>] \
 *     [--out <dir>] [--rehearsal] [--resume <prior-out-dir>]
 *
 * --resume continues an interrupted cert run (e.g. a provider usage-limit
 * cutoff) INTO the prior out dir: completed ok rows, honest not_run rows, and
 * witness captures are reused verbatim; new attempts continue each key's rep
 * numbering. The attempt budget is CUMULATIVE across sessions, so a resume
 * usually needs a raised --max-attempts; arms/efforts must match the original
 * invocation (a divergence shows up as witness-capture inconsistency).
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assembleReviewCertRecord,
  isWitnessableWorkerDispatchLine,
  type ReviewCertArmDeclaration,
} from "../src/core-runtime/discovery/review-cert-assemble.ts";
import {
  fixtureApplicableCheckIds,
  parseReviewCertRecord,
  REVIEW_CERT_ARMS,
  reviewCertQualityDisclosures,
  reviewCertResubmitDisclosure,
  validateReviewCertRecord,
  type ReviewCertArm,
  type ReviewCertRun,
} from "../src/core-runtime/discovery/review-cert-record.ts";
import { resolveClaudeBin } from "../src/core-runtime/llm/claude-bin.ts";
import { benchmarkFixture, settingsForCase } from "./review-pipeline-benchmark.ts";
import { rowFromAttempt, type BenchmarkRunLike } from "./review-cert-row.ts";

const ts = () => new Date().toISOString();
const log = (m: string) => console.log(`[review-cert-run ${ts()}] ${m}`);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TSX = path.join(
  REPO_ROOT,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsx.cmd" : "tsx",
);
const BENCHMARK_SCRIPT = path.join(REPO_ROOT, "scripts", "review-pipeline-benchmark.ts");
const CAPTURE_ENV = "ONTO_REVIEW_CERT_CAPTURE_FILE";
const CLAUDE_BIN_ENV = "ONTO_CLAUDE_BIN"; // claude-bin.ts resolution order, priority 1
/** The contract's semantic fixtures (design §4; v3 §D1 — pinned, not a knob):
 * the two material fixtures + the v3 clean-target (G1) and shared-root (G2)
 * controls. clean-target declares a reduced applicable_check_ids (below). */
const FIXTURE_IDS = [
  "review-pipeline-target-v1",
  "retry-policy-target-v1",
  "clean-target-v1",
  "shared-root-target-v1",
] as const;
const DEFAULT_REVIEW_TIMEOUT_MS = 240000; // the benchmark's own per-review default

// ── args (b4-cert-run style) ──────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opts: Record<string, string> = {};
let rehearsal = false;
const VALUE_ARGS = new Set([
  "--candidate-model", "--candidate-provider", "--candidate-auth", "--candidate-effort",
  "--baseline-model", "--baseline-provider", "--baseline-auth", "--baseline-effort",
  "--reps", "--out", "--max-attempts", "--timeout-ms", "--resume",
]);
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i]!;
  if (arg === "--rehearsal") rehearsal = true;
  else if (VALUE_ARGS.has(arg)) {
    const value = argv[++i];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`review-cert-run: ${arg} requires a value`);
    }
    opts[arg.slice(2)] = value;
  } else throw new Error(`review-cert-run: unknown arg '${arg}'`);
}

function requiredOpt(name: string): string {
  const value = opts[name];
  if (value === undefined) {
    throw new Error(
      `review-cert-run: --${name} is required (the cert certifies model@effort — no implicit candidate)`,
    );
  }
  return value;
}
function positiveIntOpt(name: string, fallback: number): number {
  const raw = opts[name];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`review-cert-run: --${name} requires a positive integer, got '${raw}'`);
  }
  return parsed;
}

interface ArmSpec {
  arm: ReviewCertArm;
  model: string;
  provider: string;
  auth: string;
  effort: string;
}
const candidate: ArmSpec = {
  arm: "candidate",
  model: requiredOpt("candidate-model"),
  provider: opts["candidate-provider"] ?? "openai",
  auth: opts["candidate-auth"] ?? "oauth",
  effort: requiredOpt("candidate-effort"),
};
const baseline: ArmSpec = {
  arm: "baseline",
  model: opts["baseline-model"] ?? "gpt-5.5",
  provider: opts["baseline-provider"] ?? "openai",
  auth: opts["baseline-auth"] ?? "oauth",
  effort: opts["baseline-effort"] ?? "medium",
};
const reps = positiveIntOpt("reps", 3);
const maxAttempts = positiveIntOpt("max-attempts", reps + 2);
const timeoutMs = positiveIntOpt("timeout-ms", DEFAULT_REVIEW_TIMEOUT_MS);
if (maxAttempts < reps) {
  throw new Error(
    `review-cert-run: --max-attempts ${maxAttempts} < --reps ${reps} — the rep floor could never be met`,
  );
}

// ── mode guards ───────────────────────────────────────────────────────────────
if (!rehearsal && process.env.ONTO_LLM_MOCK !== undefined) {
  // reconstruct-dispatch-fallback-live-e2e precedent: cert evidence must never
  // be produced while a mock switch is armed in the environment.
  throw new Error("review-cert-run: cert mode refuses to run while ONTO_LLM_MOCK is present. Unset it, or pass --rehearsal.");
}
if (rehearsal && opts["out"] === undefined) {
  throw new Error(
    "review-cert-run: --rehearsal requires an explicit --out — a NOT-cert-grade rehearsal must never land in the default evidence directory.",
  );
}

// ── run_controls pin assertion (design §4 M-1; see module doc for mechanism) ──
// The cert measures the raw product path with resubmit ON and salvage OFF
// (RUN_CONTROLS). Since the 2026-07-15 promotion made BOTH resubmit and salvage
// product defaults, the harness no longer relies on the default — it passes
// --retry-resubmit and --no-salvage explicitly, and this MECHANICAL probe
// verifies the benchmark's settings builder actually turns those into
// retry.resubmit.enabled=true AND retry.salvage.enabled=false. A silent knob
// regression must fail HERE, not surface as a polluted/all-zero disclosure.
{
  const probeSettings = settingsForCase(
    {
      runs: 1, caseSelectors: ["all-medium"], model: "probe", provider: "openai",
      auth: "oauth", baseEffort: "medium", baselineEffort: "low", candidateEffort: "xhigh",
      sweepEfforts: [], sweepUnits: [], sweepAllUnits: false,
      fixtureIds: ["review-pipeline-target-v1"], lensIds: [], keepTmp: false,
      timeoutMs: 1000, unitSweepCandidateOnly: false, maxConcurrentLenses: 1,
      retryResubmit: true, disableSalvage: true,
    } as never,
    { case_id: "all-medium", label: "probe", profile_role: "candidate",
      comparison_axis: "run-effort", base_effort: "medium", unit_efforts: {} } as never,
  ) as {
    review?: {
      execution?: {
        retry?: {
          resubmit?: { enabled?: boolean };
          salvage?: { enabled?: boolean };
        };
      };
    };
  };
  const probeRetry = probeSettings.review?.execution?.retry;
  if (probeRetry?.resubmit?.enabled !== true) {
    throw new Error(
      "review-cert-run: settingsForCase({retryResubmit:true}) did not yield retry.resubmit.enabled=true — the v2 contract cannot be dispatched. Fix the benchmark knob before certifying.",
    );
  }
  if (probeRetry?.salvage?.enabled !== false) {
    throw new Error(
      `review-cert-run: settingsForCase({disableSalvage:true}) did not yield retry.salvage.enabled=false (got ${probeRetry?.salvage?.enabled}) — a salvaged unit would pollute the cert measurement. Fix the benchmark knob before certifying.`,
    );
  }
  log("run_controls mechanical pin: settingsForCase yields resubmit ON + salvage OFF for the cert temp-project.");
}

// ── out dir (--resume: continue INTO a prior run's dir — completed rows and
// witness captures are reused verbatim; new attempts continue the per-key rep
// numbering so coordinates never collide) ─────────────────────────────────────
if (opts["resume"] !== undefined && (opts["out"] !== undefined || rehearsal)) {
  throw new Error(
    "review-cert-run: --resume takes the prior run's dir as the out dir — do not combine with --out or --rehearsal",
  );
}
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
const outDir = path.resolve(
  opts["resume"] ?? opts["out"] ??
    path.join("development-records", "benchmark", "review-cert", stamp),
);
const runsDir = path.join(outDir, "runs");
const captureDir = path.join(outDir, "capture");
const shimDir = path.join(outDir, "shim");
await fs.mkdir(runsDir, { recursive: true });
await fs.mkdir(captureDir, { recursive: true });
await fs.mkdir(shimDir, { recursive: true });
log(`out dir: ${outDir}${rehearsal ? " (REHEARSAL — NOT cert-grade)" : ""}`);

// ── worker shims (design §4 H-1): codex via PATH, claude via ONTO_CLAUDE_BIN ─
function shimScript(
  realBinaryPath: string,
  ownShimDir: string,
  opts: {
    /** flag → capture label: the argument FOLLOWING each flag is logged as
     * `<label:N bytes>` instead of its content. claude route: the bounded
     * prompt rides after `-p` and the submit schema after `--json-schema` —
     * tens of KB per dispatch; the witness needs the knobs, not the content. */
    redactValueOfFlag?: Record<string, string>;
    /** env vars unset before exec. claude route: the child env still carries
     * ONTO_CLAUDE_BIN=<this shim>, so a descendant resolveClaudeBin would
     * loop back here — unsetting closes the env recursion channel the way
     * the PATH strip closes the PATH channel. */
    unsetEnv?: readonly string[];
  } = {},
): string {
  // The JSON encoding runs through node (this process's own binary — no PATH
  // lookup) because argv-safe JSON escaping in bash is not worth hand-rolling.
  // `--` ends node's option parsing so worker flags like -m are never eaten.
  // A failed append FAILS the dispatch (exit 97): an unwitnessed cert unit is
  // worse than a failed one (the run degrades to an honest not_run row).
  //
  // The shim removes ITS OWN directory from PATH before exec: the "real"
  // codex may itself be a wrapper that re-invokes `codex` via PATH (observed
  // live: a ~/.superset/bin/codex wrapper), and with the shim still first on
  // PATH that re-invocation loops back here forever (verified: runaway
  // recursion until the strip was added). Stripping also means the wrapper's
  // internal re-dispatch is not double-captured — the witness line is the
  // executor's ORIGINAL argv, exactly the knobs the cert declares.
  //
  // The capture JS is single-quoted in bash, so it must contain no single
  // quotes; the redact map is embedded as a JSON literal (double quotes only).
  const captureJs =
    'const fs=require("node:fs");' +
    `const redact=${JSON.stringify(opts.redactValueOfFlag ?? {})};` +
    "const argv=process.argv.slice(1);" +
    "for(let i=0;i<argv.length-1;i+=1){" +
    "const label=redact[argv[i]];" +
    'if(label!==undefined){argv[i+1]="<"+label+":"+Buffer.byteLength(argv[i+1],"utf8")+" bytes>";i+=1;}' +
    "}" +
    `fs.appendFileSync(process.env.${CAPTURE_ENV},JSON.stringify({argv})+"\\n");`;
  return [
    "#!/bin/bash",
    "# review-cert dispatch witness shim — appends this invocation's argv as one",
    "# JSON line to the per-arm capture file, then execs the real binary resolved",
    "# BEFORE interposition. Generated by scripts/review-cert-run.mts.",
    "set -u",
    `if [ -z "\${${CAPTURE_ENV}:-}" ]; then`,
    `  echo "review-cert worker shim: ${CAPTURE_ENV} is not set — refusing an unwitnessed dispatch" >&2`,
    "  exit 97",
    "fi",
    `${JSON.stringify(process.execPath)} -e '${captureJs}' -- "$@" || {`,
    `  echo "review-cert worker shim: capture append failed — refusing an unwitnessed dispatch" >&2`,
    "  exit 97",
    "}",
    ...(opts.unsetEnv ?? []).map((name) => `unset ${name}`),
    "# drop this shim's dir from PATH (component-exact) so a wrapper real binary",
    "# re-invoking its own name via PATH cannot recurse into the shim",
    `_shim_dir=${JSON.stringify(ownShimDir)}`,
    '_new_path=""',
    'IFS=":" read -r -a _parts <<< "$PATH"',
    'for _part in "${_parts[@]}"; do',
    '  [ "$_part" = "$_shim_dir" ] && continue',
    '  _new_path="${_new_path:+$_new_path:}$_part"',
    "done",
    'export PATH="$_new_path"',
    `exec ${JSON.stringify(realBinaryPath)} "$@"`,
    "",
  ].join("\n");
}

/** claude-route shim knobs (see shimScript opts docs). */
const CLAUDE_SHIM_OPTS = {
  redactValueOfFlag: { "-p": "prompt", "--json-schema": "json-schema" },
  unsetEnv: [CLAUDE_BIN_ENV],
} as const;

function resolveRealClaude(): string | null {
  // The SAME resolver the claude executor module-loads (claude-bin.ts) — the
  // shim's exec target is exactly what the worker would have dispatched
  // un-shimmed (including an operator's own ONTO_CLAUDE_BIN override, which
  // this harness reads BEFORE injecting its shim into the subprocess env).
  // The bare-name "claude" fallback means not-found.
  const resolved = resolveClaudeBin(process.env);
  if (!path.isAbsolute(resolved)) return null;
  try {
    fsSync.accessSync(resolved, fsSync.constants.X_OK);
    return resolved;
  } catch {
    return null;
  }
}

async function resolveRealCodex(): Promise<string | null> {
  return await new Promise((resolve) => {
    const child = spawn("/bin/bash", ["-c", "command -v codex"], {
      env: process.env, // the UNMODIFIED PATH — resolution happens before any prepend
      stdio: ["ignore", "pipe", "ignore"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.on("close", (code) => {
      const resolved = stdout.trim();
      resolve(code === 0 && resolved.length > 0 ? resolved : null);
    });
    child.on("error", () => resolve(null));
  });
}

/** Deterministic, zero-spend proof the shim mechanism works: a throwaway shim
 * whose "real binary" is a wrapper that RE-RESOLVES `codex` via PATH (the
 * observed superset-wrapper behavior that caused a runaway recursion before
 * the PATH strip) is invoked with representative worker args. Passing means:
 * exactly one capture line with the exact argv, exit 0, and the wrapper's
 * re-resolution did NOT land back on the shim. */
async function shimSelfTest(): Promise<void> {
  const selfTestDir = path.join(shimDir, "selftest");
  await fs.mkdir(selfTestDir, { recursive: true });
  const shimPath = path.join(selfTestDir, "codex");
  const wrapperPath = path.join(selfTestDir, "wrapper.sh");
  const capturePath = path.join(selfTestDir, "capture.jsonl");
  await fs.writeFile(
    wrapperPath,
    [
      "#!/bin/bash",
      "# self-test stand-in for a wrapper-style real codex: it re-resolves",
      "# `codex` from PATH the way the observed ~/.superset wrapper does.",
      'resolved="$(command -v codex || true)"',
      `if [ "$resolved" = ${JSON.stringify(shimPath)} ]; then`,
      '  echo "shim self-test wrapper: codex still resolves to the shim — recursion hazard" >&2',
      "  exit 96",
      "fi",
      'exec /usr/bin/true "$@"',
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  await fs.writeFile(shimPath, shimScript(wrapperPath, selfTestDir), { mode: 0o755 });
  await fs.writeFile(capturePath, ""); // fresh — the shim appends
  const sampleArgs = ["exec", "-m", "shim-selftest-model", "-c", 'model_reasoning_effort="low"', "-"];
  const exitCode: number | null = await new Promise((resolve, reject) => {
    const child = spawn(shimPath, sampleArgs, {
      env: {
        ...process.env,
        PATH: `${selfTestDir}${path.delimiter}${process.env.PATH ?? ""}`,
        [CAPTURE_ENV]: capturePath,
      },
      stdio: ["ignore", "ignore", "inherit"],
    });
    child.on("close", (code) => resolve(code));
    child.on("error", reject);
  });
  if (exitCode !== 0) throw new Error(`shim self-test: shim exited ${exitCode}`);
  const lines = (await fs.readFile(capturePath, "utf8")).split("\n").filter((l) => l.trim());
  if (lines.length !== 1) throw new Error(`shim self-test: expected 1 capture line, got ${lines.length}`);
  const parsed = JSON.parse(lines[0]!) as { argv?: unknown };
  if (JSON.stringify(parsed.argv) !== JSON.stringify(sampleArgs)) {
    throw new Error(`shim self-test: captured argv ${JSON.stringify(parsed.argv)} != dispatched ${JSON.stringify(sampleArgs)}`);
  }
  log("shim self-test: append + PATH-strip + exec verified against a re-resolving wrapper (1 line, argv exact, no recursion)");
}

/** claude-route counterpart of shimSelfTest: same zero-spend mechanism proof,
 * plus the two claude-specific behaviors — bulk-value redaction (-p /
 * --json-schema logged as sizes) and the ONTO_CLAUDE_BIN unset (the wrapper
 * stand-in fails if either recursion channel is still open at exec time; the
 * spawn env deliberately arms ONTO_CLAUDE_BIN=<shim> so the unset is what the
 * wrapper observes, not this env's absence). */
async function claudeShimSelfTest(): Promise<void> {
  const selfTestDir = path.join(shimDir, "selftest-claude");
  await fs.mkdir(selfTestDir, { recursive: true });
  const shimPath = path.join(selfTestDir, "claude");
  const wrapperPath = path.join(selfTestDir, "wrapper.sh");
  const capturePath = path.join(selfTestDir, "capture.jsonl");
  await fs.writeFile(
    wrapperPath,
    [
      "#!/bin/bash",
      "# self-test stand-in for the real claude: asserts BOTH recursion channels",
      "# are closed before dispatch — env (ONTO_CLAUDE_BIN) and PATH.",
      `if [ -n "\${${CLAUDE_BIN_ENV}:-}" ]; then`,
      `  echo "claude shim self-test wrapper: ${CLAUDE_BIN_ENV} still set — env recursion hazard" >&2`,
      "  exit 96",
      "fi",
      'resolved="$(command -v claude || true)"',
      `if [ "$resolved" = ${JSON.stringify(shimPath)} ]; then`,
      '  echo "claude shim self-test wrapper: claude still resolves to the shim — PATH recursion hazard" >&2',
      "  exit 96",
      "fi",
      'exec /usr/bin/true "$@"',
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  await fs.writeFile(shimPath, shimScript(wrapperPath, selfTestDir, CLAUDE_SHIM_OPTS), { mode: 0o755 });
  await fs.writeFile(capturePath, ""); // fresh — the shim appends
  const prompt = "p".repeat(4096);
  const schema = '{"type":"object"}';
  const sampleArgs = [
    "-p", prompt,
    "--output-format", "json",
    "--model", "claude-shim-selftest",
    "--effort", "low",
    "--json-schema", schema,
  ];
  const expectedArgv = [
    "-p", `<prompt:${Buffer.byteLength(prompt, "utf8")} bytes>`,
    "--output-format", "json",
    "--model", "claude-shim-selftest",
    "--effort", "low",
    "--json-schema", `<json-schema:${Buffer.byteLength(schema, "utf8")} bytes>`,
  ];
  const exitCode: number | null = await new Promise((resolve, reject) => {
    const child = spawn(shimPath, sampleArgs, {
      env: {
        ...process.env,
        PATH: `${selfTestDir}${path.delimiter}${process.env.PATH ?? ""}`,
        [CAPTURE_ENV]: capturePath,
        [CLAUDE_BIN_ENV]: shimPath,
      },
      stdio: ["ignore", "ignore", "inherit"],
    });
    child.on("close", (code) => resolve(code));
    child.on("error", reject);
  });
  if (exitCode !== 0) throw new Error(`claude shim self-test: shim exited ${exitCode}`);
  const lines = (await fs.readFile(capturePath, "utf8")).split("\n").filter((l) => l.trim());
  if (lines.length !== 1) throw new Error(`claude shim self-test: expected 1 capture line, got ${lines.length}`);
  const parsed = JSON.parse(lines[0]!) as { argv?: unknown };
  if (JSON.stringify(parsed.argv) !== JSON.stringify(expectedArgv)) {
    throw new Error(`claude shim self-test: captured argv ${JSON.stringify(parsed.argv)} != expected redacted ${JSON.stringify(expectedArgv)}`);
  }
  log("claude shim self-test: append + redaction + env-unset + PATH-strip + exec verified (1 line, knobs exact, prompt/schema logged as sizes)");
}

await shimSelfTest();
await claudeShimSelfTest();

const realCodex = await resolveRealCodex();
if (realCodex === null && !rehearsal) {
  throw new Error("review-cert-run: no `codex` on PATH — the cert arms dispatch through the codex worker CLI.");
}
if (realCodex !== null) {
  await fs.writeFile(path.join(shimDir, "codex"), shimScript(realCodex, shimDir), { mode: 0o755 });
  log(`codex shim: ${path.join(shimDir, "codex")} → ${realCodex}`);
} else {
  log("codex not on PATH — rehearsal continues without a shim (mock path spawns no worker)");
}

const claudeShimPath = path.join(shimDir, "claude");
const realClaude = resolveRealClaude();
if (realClaude === null && !rehearsal && [baseline, candidate].some((arm) => arm.provider === "anthropic")) {
  throw new Error(
    "review-cert-run: no claude binary resolvable (claude-bin.ts resolution order) — an anthropic arm dispatches through the claude worker CLI. Install claude or set ONTO_CLAUDE_BIN to the real binary.",
  );
}
if (realClaude !== null) {
  await fs.writeFile(claudeShimPath, shimScript(realClaude, shimDir, CLAUDE_SHIM_OPTS), { mode: 0o755 });
  log(`claude shim: ${claudeShimPath} → ${realClaude} (injected as ${CLAUDE_BIN_ENV}; -p/--json-schema values logged as sizes)`);
} else {
  log("claude not resolvable — continuing without a claude shim (no anthropic arm dispatch expected)");
}

const captureFileFor = (arm: ReviewCertArm): string => path.join(captureDir, `${arm}.jsonl`);
for (const arm of REVIEW_CERT_ARMS) {
  if (opts["resume"] !== undefined) {
    // Resume PRESERVES the prior sessions' witness lines — truncating here
    // would destroy the only dispatch evidence for already-completed rows.
    await fs.appendFile(captureFileFor(arm), "");
  } else {
    await fs.writeFile(captureFileFor(arm), ""); // fresh, append-ready
  }
}

// ── fixture manifest (single-sourced from the benchmark's fixture specs) ─────
const fixtureManifest = FIXTURE_IDS.map((fixtureId) => {
  const spec = benchmarkFixture(fixtureId);
  const content = spec.files[spec.target_path];
  if (content === undefined) {
    throw new Error(`review-cert-run: fixture ${fixtureId} has no content at its target_path ${spec.target_path}`);
  }
  // clean-target declares its reduced applicable_check_ids; every other fixture
  // omits the field (absent = full universe). Derived from the record layer's
  // single authority (fixtureApplicableCheckIds) so producer and validator can
  // never disagree — hardcoding the set here would reopen that drift.
  const applicable = fixtureApplicableCheckIds(fixtureId);
  return {
    fixture_id: fixtureId as string,
    // Same value the gate reports as fixture_target_anchor for these fixtures.
    target_anchor: spec.target_path,
    content_sha256: crypto.createHash("sha256").update(content).digest("hex"),
    ...(applicable ? { applicable_check_ids: [...applicable] } : {}),
  };
});

// ── per-attempt benchmark invocation ─────────────────────────────────────────
async function tailOf(filePath: string, lineCount: number): Promise<string> {
  try {
    const text = await fs.readFile(filePath, "utf8");
    return text.split("\n").slice(-lineCount).join("\n");
  } catch {
    return "(no log)";
  }
}

async function runBenchmarkOnce(args: {
  arm: ArmSpec;
  fixtureId: string;
  rep: number;
}): Promise<{ exitCode: number | null; summary: BenchmarkRunLike | null; logPath: string }> {
  const runTag = `${args.arm.arm}-${args.fixtureId}-r${args.rep}`;
  const outputPath = path.join(runsDir, `${runTag}.json`);
  const logPath = path.join(runsDir, `${runTag}.log`);
  const benchArgs = [
    BENCHMARK_SCRIPT,
    "--runs", "1",
    "--case", `all-${args.arm.effort}`,
    "--fixture", args.fixtureId,
    "--model", args.arm.model,
    "--provider", args.arm.provider,
    // Rehearsal pins the inline executor, whose benchmark contract requires
    // explicit api_key/local auth (never oauth); the mock short-circuits
    // before any credential is used.
    "--auth", rehearsal ? "api_key" : args.arm.auth,
    "--output", outputPath,
    "--timeout-ms", String(timeoutMs),
    // review-cert/v2: resubmit ON is the CONTRACT (both arms, always) — the
    // cert measures the product path; salvage stays OFF via the defaults pin.
    "--retry-resubmit",
    // salvage product default is ON since the 2026-07-15 promotion; the cert
    // pins it OFF for raw, reproducible measurement (RUN_CONTROLS.salvage_enabled).
    "--no-salvage",
    ...(rehearsal
      ? ["--executor-realization", "ts_inline_http", "--artifact-generation-realization", "semantic_mock"]
      : []),
  ];
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${shimDir}${path.delimiter}${process.env.PATH ?? ""}`,
    [CAPTURE_ENV]: captureFileFor(args.arm.arm),
    // claude-route witness: resolveClaudeBin reads this FIRST in every
    // descendant, so any claude worker dispatch lands on the shim. Injected
    // for both arms — an unexpected claude dispatch in a codex arm shows up
    // in that arm's capture (and fails within-arm consistency) instead of
    // escaping the witness.
    ...(realClaude !== null ? { [CLAUDE_BIN_ENV]: claudeShimPath } : {}),
    // Rehearsal: the direct-call route checks the provider credential env
    // PRESENCE (openai → OPENAI_API_KEY, anthropic → ANTHROPIC_API_KEY)
    // before the mock short-circuits. A labeled dummy passes the presence
    // check and doubles as a negative control — if mock wiring ever leaked to
    // a real HTTP call it would 401 instead of spending. (Deliberately
    // overrides any real key in the parent env.)
    ...(rehearsal
      ? {
          ONTO_LLM_MOCK: "1",
          OPENAI_API_KEY: "onto-review-cert-rehearsal-dummy-not-a-key",
          ANTHROPIC_API_KEY: "onto-review-cert-rehearsal-dummy-not-a-key",
        }
      : {}),
  };
  // Outer last-resort guard only — the benchmark owns the real per-review
  // timeout and its own temp/process cleanup.
  const outerTimeoutMs = timeoutMs * 2 + 300000;
  const exitCode: number | null = await new Promise((resolve, reject) => {
    const logStream = fsSync.createWriteStream(logPath, { flags: "w" });
    const child = spawn(TSX, benchArgs, {
      cwd: REPO_ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.pipe(logStream);
    child.stderr.pipe(logStream, { end: false });
    const killTimer = setTimeout(() => {
      log(`${runTag}: outer timeout ${outerTimeoutMs}ms — SIGTERM to benchmark`);
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 30000).unref();
    }, outerTimeoutMs);
    killTimer.unref();
    child.on("error", (error) => {
      clearTimeout(killTimer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(killTimer);
      logStream.end();
      resolve(code);
    });
  });
  let summary: BenchmarkRunLike | null = null;
  try {
    const report = JSON.parse(await fs.readFile(outputPath, "utf8")) as {
      runs?: BenchmarkRunLike[];
    };
    summary = report.runs?.[0] ?? null;
  } catch {
    summary = null; // command died before the report — honest not_run below
  }
  return { exitCode, summary, logPath };
}

// ── arm × fixture rep loop ───────────────────────────────────────────────────
const progressPath = path.join(runsDir, "rows.progress.jsonl");
/** v2 run_controls — single source for the record declaration, the per-row
 * provenance stamp, and the resume mixing guard (design §5.4). */
const RUN_CONTROLS = { salvage_enabled: false, resubmit_enabled: true } as const;
const rows: ReviewCertRun[] = [];
const okCounts = new Map<string, number>();
// --resume seeding: prior rows (ok AND honest not_run) enter the record
// verbatim; new attempts continue each key's rep numbering past the prior max.
const priorOk = new Map<string, number>();
const priorMaxRep = new Map<string, number>();
if (opts["resume"] !== undefined) {
  const priorText = await fs
    .readFile(progressPath, "utf8")
    .catch(() => {
      throw new Error(
        `review-cert-run: --resume dir has no ${progressPath} — nothing to resume`,
      );
    });
  for (const [index, line] of priorText.split("\n").entries()) {
    if (line.trim().length === 0) continue;
    const parsedLine = JSON.parse(line) as ReviewCertRun & {
      run_controls?: { salvage_enabled: boolean; resubmit_enabled: boolean };
    };
    // Provenance guard (design §5.4): a seeded row must have been generated
    // under the SAME run_controls regime — a missing stamp (v1-era row) or a
    // divergent one would mix generation mechanisms into one record.
    if (
      parsedLine.run_controls?.salvage_enabled !== RUN_CONTROLS.salvage_enabled ||
      parsedLine.run_controls?.resubmit_enabled !== RUN_CONTROLS.resubmit_enabled
    ) {
      throw new Error(
        `review-cert-run: resume row ${index + 1} carries run_controls=${JSON.stringify(parsedLine.run_controls ?? null)} but this run pins ${JSON.stringify(RUN_CONTROLS)} — refusing to mix rows from different contract regimes. Start a fresh --out instead.`,
      );
    }
    const { run_controls: _stamp, ...row } = parsedLine;
    rows.push(row);
    const key = `${row.arm}/${row.fixture_id}`;
    if (row.completion === "ok") priorOk.set(key, (priorOk.get(key) ?? 0) + 1);
    priorMaxRep.set(key, Math.max(priorMaxRep.get(key) ?? 0, row.rep));
  }
  log(
    `resume: seeded ${rows.length} prior rows — ok per key: ${
      [...priorOk.entries()].map(([key, count]) => `${key}=${count}`).join(", ") || "(none)"
    }`,
  );
}
for (const arm of [baseline, candidate]) {
  for (const fixtureId of FIXTURE_IDS) {
    const key = `${arm.arm}/${fixtureId}`;
    let ok = priorOk.get(key) ?? 0;
    let attempt = priorMaxRep.get(key) ?? 0;
    while (ok < reps && attempt < maxAttempts) {
      attempt += 1;
      log(`${key}: attempt ${attempt}/${maxAttempts} (ok ${ok}/${reps}) — ${arm.model}@${arm.effort}`);
      const outcome = await runBenchmarkOnce({ arm, fixtureId, rep: attempt });
      const { row, notOkReason } = rowFromAttempt({
        arm: arm.arm,
        fixtureId,
        rep: attempt,
        exitCode: outcome.exitCode,
        summary: outcome.summary,
      });
      rows.push(row);
      await fs.appendFile(progressPath, `${JSON.stringify({ ...row, run_controls: RUN_CONTROLS })}\n`);
      if (row.completion === "ok") {
        ok += 1;
        log(`${key}: attempt ${attempt} ok (${row.units_total} units, ${row.checks.length} checks)`);
      } else {
        log(`${key}: attempt ${attempt} → not_run: ${notOkReason}`);
        log(`${key}: log tail:\n${await tailOf(outcome.logPath, 12)}`);
      }
    }
    okCounts.set(key, ok);
    if (ok < reps) {
      log(`${key}: REP FLOOR MISSED — ${ok}/${reps} ok after ${attempt} attempts (validator will report rep_floor; partial record still written)`);
    }
  }
}

// ── witness capture → assembly (review-cert-assemble owns projection+guard) ──
async function readCaptureLines(arm: ReviewCertArm): Promise<unknown[]> {
  const filePath = captureFileFor(arm);
  const text = await fs.readFile(filePath, "utf8");
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line) as unknown;
      } catch (error) {
        throw new Error(
          `review-cert-run: corrupt capture line ${index + 1} in ${filePath} (harness bug — fail-closed): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
}

const declared: Record<ReviewCertArm, ReviewCertArmDeclaration> = {
  baseline: { provider: baseline.provider, model: baseline.model, reasoning_effort: baseline.effort },
  candidate: { provider: candidate.provider, model: candidate.model, reasoning_effort: candidate.effort },
};

const captureLinesByArm = {
  baseline: await readCaptureLines("baseline"),
  candidate: await readCaptureLines("candidate"),
};
for (const arm of REVIEW_CERT_ARMS) {
  // Probe invocations (claude `auth status` availability checks route through
  // the same shim) are captured but are NOT dispatch — the gate here and the
  // projection both classify them via the assemble module's rules.
  const dispatchCount = captureLinesByArm[arm].filter(isWitnessableWorkerDispatchLine).length;
  if (dispatchCount > 0) {
    log(`witness: arm ${arm} captured ${dispatchCount} worker dispatch(es) (${captureLinesByArm[arm].length} capture line(s) incl. probes)`);
    continue;
  }
  if (rehearsal) {
    // The mock path spawns no worker — witness_missing is EXPECTED here. A
    // synthetic declaration-derived line lets assembly/validation/persist run
    // end-to-end; the distinct .rehearsal.json filename plus the --rehearsal
    // reproduction command keep this from ever reading as witness evidence.
    // Probe lines (if any) stay in place — the projection skips them.
    log(`witness: arm ${arm} witness_missing (expected under mock rehearsal) — injecting SYNTHETIC declaration-derived capture line (NOT witness evidence)`);
    const armDecl = declared[arm];
    captureLinesByArm[arm] = [...captureLinesByArm[arm], {
      // Arm-shaped argv (claude vs codex flag family) so the rehearsal
      // exercises the same projection branch the live capture would.
      argv: armDecl.provider === "anthropic"
        ? [
            "-p", "<prompt:0 bytes>", "--output-format", "json",
            "--model", armDecl.model,
            ...(armDecl.reasoning_effort !== undefined ? ["--effort", armDecl.reasoning_effort] : []),
          ]
        : ["exec", "-m", armDecl.model, "-c", `model_reasoning_effort="${armDecl.reasoning_effort}"`],
      rehearsal_synthetic: true,
    }];
  }
  // cert mode: no injection — the assemble projection fails loud below.
}

const reproductionCommand = [
  "npx tsx scripts/review-cert-run.mts",
  `--candidate-model ${candidate.model}`,
  `--candidate-provider ${candidate.provider}`,
  `--candidate-auth ${candidate.auth}`,
  `--candidate-effort ${candidate.effort}`,
  `--baseline-model ${baseline.model}`,
  `--baseline-provider ${baseline.provider}`,
  `--baseline-auth ${baseline.auth}`,
  `--baseline-effort ${baseline.effort}`,
  `--reps ${reps}`,
  `--max-attempts ${maxAttempts}`,
  ...(rehearsal ? ["--rehearsal"] : []),
].join(" ");

const assembly = assembleReviewCertRecord({
  createdAt: ts(),
  declared,
  captureLinesByArm,
  declaredReps: reps,
  fixtures: fixtureManifest,
  runs: rows,
  runControls: RUN_CONTROLS,
  issueArtifactsProvided: true, // the benchmark always feeds issueArtifacts into the gate
  reproductionCommand,
});

if (assembly.record === null) {
  console.error("[review-cert-run] DISPATCH WITNESS GUARD FAILED — no record (a record must never certify a dispatch the capture cannot witness):");
  for (const violation of assembly.violations) console.error(`  ${violation}`);
  await fs.writeFile(
    path.join(outDir, "review-cert-record.rejected.json"),
    `${JSON.stringify({ rejected_at: ts(), reason: "witness_guard", violations: assembly.violations, declared, runs: rows }, null, 2)}\n`,
  );
  log(`rejected rows + violations → ${path.join(outDir, "review-cert-record.rejected.json")}`);
  process.exit(1);
}
log("dispatch witness: declared == witnessed for both arms");

// ── validate + persist ───────────────────────────────────────────────────────
// Round-trip through JSON so the validation sees exactly what a G7 reader
// will parse from disk, then run the full recompute.
const roundTripped = JSON.parse(JSON.stringify(assembly.record)) as unknown;
const parsed = parseReviewCertRecord(roundTripped);
const violations = parsed.record !== null
  ? validateReviewCertRecord(parsed.record)
  : parsed.violations;
const qualityDisclosures = parsed.record !== null
  ? [...reviewCertQualityDisclosures(parsed.record), ...reviewCertResubmitDisclosure(parsed.record)]
  : [];

const recordFileName = rehearsal ? "review-cert-record.rehearsal.json" : "review-cert-record.json";
const recordPath = path.join(outDir, recordFileName);
await fs.writeFile(recordPath, `${JSON.stringify(assembly.record, null, 2)}\n`);

for (const [key, ok] of okCounts) {
  log(`support: ${key} → ${ok}/${reps} completed reps`);
}
log(`aggregates: recall_first_quality_pass=${assembly.record.declared_aggregates.quality_pass} over ${assembly.record.declared_aggregates.per_fixture_check.length} fixture×check rates`);
for (const disclosure of qualityDisclosures) {
  console.warn(
    `[review-cert-run] QUALITY DISCLOSURE (non-blocking)${disclosure.subject_id ? ` [${disclosure.subject_id}]` : ""}: ${disclosure.message}`,
  );
}
if (violations.length > 0) {
  console.error(`[review-cert-run] RECORD RECOMPUTE: ${violations.length} violation(s):`);
  for (const violation of violations) {
    console.error(`  ${violation.code}${violation.subject_id ? ` [${violation.subject_id}]` : ""}: ${violation.message}`);
  }
} else {
  log("record: validateReviewCertRecord → 0 violations");
}
log(`record → ${recordPath}${rehearsal ? " (REHEARSAL — NOT cert-grade evidence; do not cite in benchmark_evidence_refs)" : ""}`);
log(`capture → ${captureDir}; per-run reports/logs → ${runsDir}`);
process.exit(violations.length > 0 ? 1 : 0);
