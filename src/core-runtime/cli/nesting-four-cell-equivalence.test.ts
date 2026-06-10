/**
 * Roadmap S2 four-cell equivalence gate — {A,B} × {codex,claude}.
 *
 * Claim being proven (deterministically): the nesting layer changes WHO
 * fans out, never WHAT executes. For the same unit batch:
 *
 *   - brand equivalence: the codex and claude outer prompts embed the
 *     byte-identical batch script (brands differ only in spawn flags and
 *     the diagnostics header);
 *   - locus equivalence: A (bridge `executeReviewViaNestedBatch`) and B
 *     (host driver `executeBatch` running the script) drive the same
 *     inner unit-executor invocations and yield the same seats/outcomes.
 *
 * Each cell runs the REAL literal batch script through a compliant outer
 * (a stub LLM that does exactly what the prompt demands: pipe the embedded
 * script to `bash -s` and surface stdout verbatim) over the SAME stub
 * inner unit executor, which stamps its received argv into the seat.
 * Byte-identical seats across all four cells therefore prove the inner
 * invocations were identical — the unit-executor contract holds in every
 * cell.
 *
 * Full-pipeline `completed` for B×nested is proven in review-api.test.ts;
 * A's downstream after the lens phase is the unchanged flat runner.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildNestingBatchWorkerPrompt,
  parseNestingBatchSummary,
  reconcileNestingBatchOutcomes,
  type NestingBatchDescriptor,
  type NestingBatchUnit,
  type NestingBatchUnitOutcome,
} from "../review/nesting-batch.js";
import { writeYamlDocument } from "../review/review-artifact-utils.js";
import type { ReviewExecutionPlan } from "../review/artifact-types.js";
import {
  runCodexNestingBatchWorker,
  type spawnOuterCodex,
} from "./codex-nesting-batch-worker.js";
import {
  runClaudeNestingBatchWorker,
  type spawnOuterClaude,
} from "./claude-nesting-batch-worker.js";
import {
  executeReviewViaNestedBatch,
  type NestedBatchWorkers,
} from "./nested-batch-dispatch.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const STUB_SOURCE = [
  'import fs from "node:fs";',
  'import path from "node:path";',
  "const a = process.argv.slice(2);",
  "const get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };",
  'const unitId = get("--unit-id");',
  // The seat stamps the semantically-relevant argv the executor received,
  // so byte-equal seats across cells prove invocation equivalence.
  "const seat = [",
  '  `unit=${unitId}`,',
  '  `kind=${get("--unit-kind")}`,',
  '  `fmt=${get("--output-format") ?? "none"}`,',
  '  `model=${get("--model") ?? "none"}`,',
  '].join("\\n") + "\\n";',
  'const out = get("--output-path");',
  "fs.mkdirSync(path.dirname(out), { recursive: true });",
  "fs.writeFileSync(out, seat);",
  "",
].join("\n");

function extractBashFence(prompt: string): string {
  const match = prompt.match(/```bash\n([\s\S]*?)\n```/);
  if (!match) throw new Error("prompt has no bash fence");
  return match[1]!;
}

/**
 * A compliant outer: does exactly what the prompt instructs an LLM outer
 * to do — pipe the embedded literal script to `bash -s` and surface its
 * stdout verbatim. Shared by both brand spawn shapes.
 */
async function compliantOuterExec(prompt: string): Promise<{
  stdout: string;
  stderr: string;
  exit_code: number;
  timed_out: boolean;
}> {
  const script = extractBashFence(prompt);
  const run = spawnSync("bash", ["-s"], { input: script, encoding: "utf8" });
  return {
    stdout: run.stdout ?? "",
    stderr: run.stderr ?? "",
    exit_code: run.status ?? 1,
    timed_out: false,
  };
}

const compliantCodexSpawn: typeof spawnOuterCodex = async (prompt) =>
  compliantOuterExec(prompt);
const compliantClaudeSpawn: typeof spawnOuterClaude = async (prompt) =>
  compliantOuterExec(prompt);

interface CellFixture {
  root: string;
  sessionRoot: string;
  stubPath: string;
  units: NestingBatchUnit[];
  descriptor: NestingBatchDescriptor;
}

const UNIT_IDS = ["logic", "coverage"] as const;

async function mkCell(label: string): Promise<CellFixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `onto-4cell-${label}-`));
  const sessionRoot = path.join(root, "session");
  await fs.mkdir(path.join(sessionRoot, "round1"), { recursive: true });
  const stubPath = path.join(root, "stub-unit-executor.mjs");
  await fs.writeFile(stubPath, STUB_SOURCE, "utf8");
  const units: NestingBatchUnit[] = UNIT_IDS.map((id) => ({
    unit_id: id,
    unit_kind: "lens",
    packet_path: path.join(sessionRoot, "prompt-packets", `${id}.prompt.md`),
    output_path: path.join(sessionRoot, "round1", `${id}.findings.yaml`),
    extra_args: ["--output-format", "lens-sidecar"],
  }));
  const descriptor: NestingBatchDescriptor = {
    units,
    inner_executor_argv: [process.execPath, stubPath, "--model", "shared-model"],
    common_args: ["--project-root", root, "--session-root", sessionRoot],
  };
  // Minimal plan for the A bridge (synthesis/error paths only).
  await writeYamlDocument(path.join(sessionRoot, "execution-plan.yaml"), {
    session_id: "four-cell",
    session_root: sessionRoot,
    synthesis_output_path: path.join(sessionRoot, "synthesis.md"),
    error_log_path: path.join(sessionRoot, "error-log.md"),
  } as unknown as ReviewExecutionPlan);
  return { root, sessionRoot, stubPath, units, descriptor };
}

async function readSeats(cell: CellFixture): Promise<string[]> {
  return Promise.all(
    cell.units.map((unit) => fs.readFile(unit.output_path, "utf8")),
  );
}

describe("S2 four-cell equivalence ({A,B} × {codex,claude})", () => {
  const cleanups: string[] = [];

  afterEach(async () => {
    await Promise.all(
      cleanups.splice(0).map((p) => fs.rm(p, { recursive: true, force: true })),
    );
  });

  it("codex and claude outers embed the byte-identical batch script", async () => {
    const cell = await mkCell("prompt");
    cleanups.push(cell.root);
    const codexPrompt = buildNestingBatchWorkerPrompt(cell.descriptor, {
      brand: "codex",
    });
    const claudePrompt = buildNestingBatchWorkerPrompt(cell.descriptor, {
      brand: "claude",
    });
    expect(extractBashFence(codexPrompt)).toBe(extractBashFence(claudePrompt));
    // Brands differ only in the diagnostics header line.
    expect(codexPrompt).toContain("brand=codex");
    expect(claudePrompt).toContain("brand=claude");
  });

  it("all four cells produce byte-identical seats and all-ok outcomes for the same batch", async () => {
    // --- B cells: the host delegates the batch to the brand outer worker.
    const bCodex = await mkCell("b-codex");
    const bClaude = await mkCell("b-claude");
    cleanups.push(bCodex.root, bClaude.root);
    const bCodexResult = await runCodexNestingBatchWorker(
      { batch: bCodex.descriptor },
      compliantCodexSpawn,
    );
    const bClaudeResult = await runClaudeNestingBatchWorker(
      { batch: bClaude.descriptor },
      compliantClaudeSpawn,
    );

    // --- A cells: the runner bridge delegates the same units per brand.
    const aCodex = await mkCell("a-codex");
    const aClaude = await mkCell("a-claude");
    cleanups.push(aCodex.root, aClaude.root);
    const workers: NestedBatchWorkers = {
      codex: (input) => runCodexNestingBatchWorker(input, compliantCodexSpawn),
      claude: (input) => runClaudeNestingBatchWorker(input, compliantClaudeSpawn),
    };
    const aCodexResult = await executeReviewViaNestedBatch(
      {
        brand: "codex",
        sessionRoot: aCodex.sessionRoot,
        projectRoot: aCodex.root,
        ontoConfig: {},
        units: aCodex.units,
        inner_executor: {
          bin: process.execPath,
          args: [aCodex.stubPath, "--model", "shared-model"],
        },
      },
      workers,
    );
    const aClaudeResult = await executeReviewViaNestedBatch(
      {
        brand: "claude",
        sessionRoot: aClaude.sessionRoot,
        projectRoot: aClaude.root,
        ontoConfig: {},
        units: aClaude.units,
        inner_executor: {
          bin: process.execPath,
          args: [aClaude.stubPath, "--model", "shared-model"],
        },
      },
      workers,
    );

    // Outcomes: every cell reports every unit ok, in input order.
    const expectOutcomesOk = (outcomes: NestingBatchUnitOutcome[]) => {
      expect(outcomes.map((o) => `${o.unit_id}=${o.status}`)).toEqual([
        "logic=ok",
        "coverage=ok",
      ]);
    };
    expectOutcomesOk(bCodexResult.outcomes);
    expectOutcomesOk(bClaudeResult.outcomes);
    expectOutcomesOk(aCodexResult.nested_raw.outcomes);
    expectOutcomesOk(aClaudeResult.nested_raw.outcomes);
    expect(aCodexResult.participating_lens_ids).toEqual(["logic", "coverage"]);
    expect(aClaudeResult.participating_lens_ids).toEqual(["logic", "coverage"]);
    expect(aCodexResult.degraded_lens_ids).toEqual([]);
    expect(aClaudeResult.degraded_lens_ids).toEqual([]);

    // Seats: byte-identical across all four cells — the argv stamped by the
    // stub proves each cell drove the SAME inner unit-executor invocation
    // (unit id/kind, output format, LLM override), differing only in paths.
    const [bCodexSeats, bClaudeSeats, aCodexSeats, aClaudeSeats] =
      await Promise.all([
        readSeats(bCodex),
        readSeats(bClaude),
        readSeats(aCodex),
        readSeats(aClaude),
      ]);
    expect(bCodexSeats).toEqual(bClaudeSeats);
    expect(bCodexSeats).toEqual(aCodexSeats);
    expect(bCodexSeats).toEqual(aClaudeSeats);
    expect(bCodexSeats[0]).toBe(
      "unit=logic\nkind=lens\nfmt=lens-sidecar\nmodel=shared-model\n",
    );

    // The same parse/reconcile path holds for raw outer stdout in B cells.
    const reparsed = reconcileNestingBatchOutcomes(
      bCodex.units,
      parseNestingBatchSummary(bCodexResult.outer_stdout),
    );
    expectOutcomesOk(reparsed);
  });

  it("a failing unit degrades identically in every cell", async () => {
    // Stub variant: boom unit exits non-zero in all cells.
    const mkFailingCell = async (label: string) => {
      const cell = await mkCell(label);
      cleanups.push(cell.root);
      const failingStub = STUB_SOURCE.replace(
        'const out = get("--output-path");',
        'if (unitId === "coverage") { console.error("boom"); process.exit(1); }\nconst out = get("--output-path");',
      );
      await fs.writeFile(cell.stubPath, failingStub, "utf8");
      return cell;
    };
    const codexCell = await mkFailingCell("fail-codex");
    const claudeCell = await mkFailingCell("fail-claude");

    const codexResult = await runCodexNestingBatchWorker(
      { batch: codexCell.descriptor },
      compliantCodexSpawn,
    );
    const claudeResult = await runClaudeNestingBatchWorker(
      { batch: claudeCell.descriptor },
      compliantClaudeSpawn,
    );

    for (const result of [codexResult, claudeResult]) {
      expect(result.outcomes[0]?.status).toBe("ok");
      expect(result.outcomes[1]?.status).toBe("fail");
      expect(result.outcomes[1]?.error).toMatch(/exit=1/);
    }
    // Failure audit log persisted under the seat directory in both brands.
    for (const cell of [codexCell, claudeCell]) {
      const listing = await fs.readdir(path.join(cell.sessionRoot, "round1"));
      expect(listing).toContain(".coverage.nested-stderr.log");
    }
  });
});

