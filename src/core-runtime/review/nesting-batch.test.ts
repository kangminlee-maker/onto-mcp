/**
 * NestingBatchWorker contract tests (roadmap S2 Step 1).
 *
 * Two layers:
 *   1. Pure builders/parsers — script structure, prompt protocol, summary
 *      parse/reconcile invariants (salvaged semantics from the retired
 *      codex nested teamlead executor, generalized to units).
 *   2. Executed-script behaviour — the generated bash script actually runs
 *      with a stub unit executor: seats written, failure isolated, audit
 *      log persisted, summary sentinel emitted in input order.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildNestingBatchScript,
  buildNestingBatchWorkerPrompt,
  parseNestingBatchSummary,
  reconcileNestingBatchOutcomes,
  UNIT_DISPATCH_SUMMARY_PREFIX,
  type NestingBatchDescriptor,
  type NestingBatchUnit,
} from "./nesting-batch.js";

function descriptor(
  units: NestingBatchUnit[],
  overrides?: Partial<NestingBatchDescriptor>,
): NestingBatchDescriptor {
  return {
    units,
    inner_executor_argv: ["node", "/dist/unit-executor.js"],
    common_args: ["--project-root", "/proj", "--session-root", "/sess"],
    ...overrides,
  };
}

function unit(id: string, overrides?: Partial<NestingBatchUnit>): NestingBatchUnit {
  return {
    unit_id: id,
    unit_kind: "lens",
    packet_path: `/packets/${id}.prompt.md`,
    output_path: `/round1/${id}.md`,
    ...overrides,
  };
}

describe("buildNestingBatchScript", () => {
  it("invokes the unit executor with the canonical arg surface per unit", () => {
    const script = buildNestingBatchScript(
      descriptor([
        unit("logic"),
        unit("coverage", { extra_args: ["--output-format", "lens-sidecar"] }),
      ]),
    );

    expect(script).toContain(
      "node /dist/unit-executor.js --project-root /proj --session-root /sess " +
        "--unit-id logic --unit-kind lens --packet-path /packets/logic.prompt.md " +
        "--output-path /round1/logic.md",
    );
    // Per-unit extra args attach only to their unit.
    expect(script).toContain(
      "--output-path /round1/coverage.md --output-format lens-sidecar",
    );
    expect(script).not.toContain(
      "--output-path /round1/logic.md --output-format",
    );
    // No raw provider invocation — inner is always the unit executor.
    expect(script).not.toContain("codex exec");
  });

  it("declares the summary sentinel and a fallback fail entry per unit", () => {
    const script = buildNestingBatchScript(descriptor([unit("logic")]));
    expect(script).toContain(UNIT_DISPATCH_SUMMARY_PREFIX);
    expect(script).toContain('"status":"fail","error":"no status reported"');
  });

  it("shell-quotes values with spaces", () => {
    const script = buildNestingBatchScript(
      descriptor([
        unit("logic", { packet_path: "/pa ck/logic.prompt.md" }),
      ]),
    );
    expect(script).toContain("'/pa ck/logic.prompt.md'");
  });

  it("fails closed on an empty batch or missing inner executor", () => {
    expect(() => buildNestingBatchScript(descriptor([]))).toThrow(
      /at least one unit/,
    );
    expect(() =>
      buildNestingBatchScript(
        descriptor([unit("logic")], { inner_executor_argv: [] }),
      ),
    ).toThrow(/inner_executor_argv/);
  });

  it("groups units into waves of dispatch_width with a wait barrier per wave", () => {
    const units = [unit("a"), unit("b"), unit("c")];
    const countWaits = (script: string) =>
      script.split("\n").filter((line) => line === "wait").length;

    // Default: one wave, one wait.
    expect(countWaits(buildNestingBatchScript(descriptor(units)))).toBe(1);
    // Width 1: every unit is its own wave.
    const serial = buildNestingBatchScript(
      descriptor(units, { dispatch_width: 1 }),
    );
    expect(countWaits(serial)).toBe(3);
    expect(serial).toContain("# --- wave 3 (width 1) ---");
    // Width 2: ceil(3/2) = 2 waves.
    expect(
      countWaits(buildNestingBatchScript(descriptor(units, { dispatch_width: 2 }))),
    ).toBe(2);
    // Width >= count collapses to a single unlabeled wave.
    const wide = buildNestingBatchScript(
      descriptor(units, { dispatch_width: 8 }),
    );
    expect(countWaits(wide)).toBe(1);
    expect(wide).not.toContain("--- wave");
  });

  it("rejects a non-positive or fractional dispatch_width", () => {
    expect(() =>
      buildNestingBatchScript(descriptor([unit("a")], { dispatch_width: 0 })),
    ).toThrow(/positive integer/);
    expect(() =>
      buildNestingBatchScript(descriptor([unit("a")], { dispatch_width: 1.5 })),
    ).toThrow(/positive integer/);
  });
});

describe("buildNestingBatchWorkerPrompt", () => {
  it("instructs execute-only via bash -s and verbatim sentinel pass-through", () => {
    const prompt = buildNestingBatchWorkerPrompt(
      descriptor([unit("logic"), unit("coverage")]),
      { brand: "codex", lens_model: "gpt-5.5" },
    );
    expect(prompt).toContain("Nesting batch dispatch for 2 units");
    expect(prompt).toContain("(brand=codex, lens_model=gpt-5.5)");
    expect(prompt).toContain("piping it to `bash -s`");
    expect(prompt).toContain("Do not modify it, do not substitute variables");
    expect(prompt).toContain(UNIT_DISPATCH_SUMMARY_PREFIX);
    expect(prompt).toContain("```bash");
  });
});

describe("parseNestingBatchSummary", () => {
  it("parses the sentinel line amid noise, last-one-wins", () => {
    const stdout = [
      "model commentary…",
      `${UNIT_DISPATCH_SUMMARY_PREFIX}{"unit_results":[{"unit_id":"a","status":"fail","error":"early"}]}`,
      "ENV-AFTER unit=a exit=0 output_bytes=12",
      `  ${UNIT_DISPATCH_SUMMARY_PREFIX}{"unit_results":[{"unit_id":"a","status":"ok"}]}  `,
    ].join("\n");
    const summary = parseNestingBatchSummary(stdout);
    expect(summary).toEqual({ unit_results: [{ unit_id: "a", status: "ok" }] });
  });

  it("ignores malformed summary lines and returns null when none parse", () => {
    expect(
      parseNestingBatchSummary(`${UNIT_DISPATCH_SUMMARY_PREFIX}{not json}`),
    ).toBeNull();
    expect(parseNestingBatchSummary("no sentinel at all")).toBeNull();
  });
});

describe("reconcileNestingBatchOutcomes", () => {
  const units = [unit("a"), unit("b")];

  it("maps ok/fail and treats missing unit ids as noncompliance failures", () => {
    const outcomes = reconcileNestingBatchOutcomes(units, {
      unit_results: [{ unit_id: "a", status: "ok" }],
    });
    expect(outcomes).toEqual([
      { unit_id: "a", status: "ok" },
      {
        unit_id: "b",
        status: "fail",
        error: 'outer worker summary missing unit_id="b"',
      },
    ]);
  });

  it("fails every unit when no summary was parsed", () => {
    const outcomes = reconcileNestingBatchOutcomes(units, null);
    expect(outcomes).toHaveLength(2);
    expect(outcomes.every((o) => o.status === "fail")).toBe(true);
    expect(outcomes[0]?.error).toMatch(/did not emit/);
  });
});

describe("executed batch script (stub unit executor)", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "onto-nesting-batch-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  /** Stub unit executor: writes a seat unless unit-id is "boom". */
  async function writeStubExecutor(): Promise<string> {
    const stubPath = path.join(tmp, "stub-executor.mjs");
    await fs.writeFile(
      stubPath,
      [
        'import fs from "node:fs";',
        "const a = process.argv.slice(2);",
        "const get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };",
        'const unitId = get("--unit-id");',
        'const out = get("--output-path");',
        "console.log(`stub unit=${unitId}`);",
        'if (unitId === "boom") { console.error(\'stub failure "quoted" path=C:\\\\tmp\\\\x \\\\x1b[31mRED\\\\x1b[0m \\\\bBS\'); process.exit(1); }',
        "fs.writeFileSync(out, `seat for ${unitId}\\n`);",
        "",
      ].join("\n"),
      "utf8",
    );
    return stubPath;
  }

  it("fans out, isolates failure, persists audit log, and reports in order", async () => {
    const stubPath = await writeStubExecutor();
    const round1 = path.join(tmp, "round 1"); // space: quoting is exercised
    const units = [
      unit("logic", {
        packet_path: path.join(tmp, "logic.prompt.md"),
        output_path: path.join(round1, "logic.md"),
      }),
      unit("boom", {
        packet_path: path.join(tmp, "boom.prompt.md"),
        output_path: path.join(round1, "boom.md"),
      }),
      unit("issue-stance:coverage", {
        unit_kind: "deliberation",
        packet_path: path.join(tmp, "stance.prompt.md"),
        output_path: path.join(round1, "stance.yaml"),
      }),
    ];
    const script = buildNestingBatchScript(
      descriptor(units, {
        inner_executor_argv: [process.execPath, stubPath],
        common_args: [],
      }),
    );

    const run = spawnSync("bash", ["-s"], { input: script, encoding: "utf8" });
    expect(run.status).toBe(0);

    // Seats: ok units wrote theirs; the failed unit did not.
    await expect(
      fs.readFile(path.join(round1, "logic.md"), "utf8"),
    ).resolves.toBe("seat for logic\n");
    await expect(
      fs.readFile(path.join(round1, "stance.yaml"), "utf8"),
    ).resolves.toBe("seat for issue-stance:coverage\n");
    await expect(fs.access(path.join(round1, "boom.md"))).rejects.toThrow();

    // Diagnostics replayed to stdout; summary reconciles in input order.
    expect(run.stdout).toContain("ENV-BEFORE unit=logic");
    expect(run.stdout).toContain("ENV-AFTER unit=boom");
    const summary = parseNestingBatchSummary(run.stdout);
    const outcomes = reconcileNestingBatchOutcomes(units, summary);
    expect(outcomes.map((o) => `${o.unit_id}=${o.status}`)).toEqual([
      "logic=ok",
      "boom=fail",
      "issue-stance:coverage=ok",
    ]);
    expect(outcomes[1]?.error).toMatch(/exit=1/);
    expect(outcomes[1]?.error).toContain("stub failure");
    expect(outcomes[1]?.error).toContain('stub failure "quoted"');
    expect(outcomes[1]?.error).toContain("path=C:\\tmp\\x");
    expect(outcomes[1]?.error).toContain("RED");
    expect(outcomes[1]?.error).toContain("BS");
    expect(outcomes[1]?.error).not.toContain("\u001b");
    expect(outcomes[1]?.error).not.toContain("\b");

    // Log lifecycle: success logs removed, failure log persisted for audit.
    const listing = await fs.readdir(round1);
    expect(listing).not.toContain(".logic.running.log");
    expect(listing).toContain(".boom.nested-stderr.log");
    const audit = await fs.readFile(
      path.join(round1, ".boom.nested-stderr.log"),
      "utf8",
    );
    expect(audit).toContain("stub failure");
  });

  it("wave-chunked execution (dispatch_width=1) yields the same seats and summary", async () => {
    const stubPath = await writeStubExecutor();
    const round1 = path.join(tmp, "round1");
    const units = [unit("a"), unit("b"), unit("c")].map((u) => ({
      ...u,
      packet_path: path.join(tmp, `${u.unit_id}.prompt.md`),
      output_path: path.join(round1, `${u.unit_id}.md`),
    }));
    const script = buildNestingBatchScript(
      descriptor(units, {
        inner_executor_argv: [process.execPath, stubPath],
        common_args: [],
        dispatch_width: 1,
      }),
    );

    const run = spawnSync("bash", ["-s"], { input: script, encoding: "utf8" });
    expect(run.status).toBe(0);
    for (const u of units) {
      await expect(fs.readFile(u.output_path, "utf8")).resolves.toBe(
        `seat for ${u.unit_id}\n`,
      );
    }
    const outcomes = reconcileNestingBatchOutcomes(
      units,
      parseNestingBatchSummary(run.stdout),
    );
    expect(outcomes.map((o) => o.status)).toEqual(["ok", "ok", "ok"]);
  });
});
