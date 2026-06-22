/**
 * G6 — 드리프트 리포트 (INV-SCOPE-1; 최소 구현).
 *
 * 구조적 가드 전부를 실행해 INVARIANTS.md 대비 현재 상태의 이탈 목록을
 * 한 번에 출력한다. 개별 가드의 권위는 각 check 스크립트에 있고, 이
 * 리포트는 집계 projection이다.
 *
 * 사용: npx tsx scripts/check-invariant-drift.ts [baseRef]
 * npm: `check:invariant-drift`
 */
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

interface GuardRun {
  guard: string;
  invariants: string[];
  command: string[];
}

const baseRef = process.argv[2] ?? "origin/main";

const GUARDS: GuardRun[] = [
  {
    guard: "G1 import-boundary",
    invariants: ["INV-MOCK-1"],
    command: ["npx", "tsx", "scripts/check-import-boundary.ts"],
  },
  {
    guard: "G2 spec-defaults",
    invariants: ["INV-AUTH-1", "INV-CFG-1"],
    command: ["npx", "tsx", "scripts/check-no-hardcoded-spec-defaults.ts"],
  },
  {
    guard: "G3 invariant-tests",
    invariants: ["INV-AUTH-1", "INV-SCHEMA-1", "INV-TEST-1"],
    command: [
      "npx",
      "vitest",
      "run",
      "--reporter=dot",
      "src/core-runtime/llm/model-switcher.invariant.test.ts",
      "src/core-runtime/review/problem-framing-spine.invariant.test.ts",
    ],
  },
  {
    guard: "G4 invariant-change-marker",
    invariants: ["INV-AUTH-1", "INV-CFG-1", "INV-MATERIAL-1", "INV-MODEL-1"],
    command: ["npx", "tsx", "scripts/check-invariant-change-marker.ts", baseRef],
  },
  {
    guard: "G7 supported-models",
    invariants: ["INV-MODEL-1"],
    command: ["npx", "tsx", "scripts/check-supported-models.ts"],
  },
  {
    guard: "G8 prompt-projection-parity",
    invariants: ["INV-SCHEMA-1"],
    command: ["npx", "tsx", "scripts/check-prompt-projection-parity.ts"],
  },
];

async function runGuard(run: GuardRun): Promise<{ run: GuardRun; ok: boolean; detail: string }> {
  try {
    await execFileAsync(run.command[0]!, run.command.slice(1), {
      cwd: PROJECT_ROOT,
      maxBuffer: 16 * 1024 * 1024,
    });
    return { run, ok: true, detail: "passed" };
  } catch (error) {
    const message =
      error instanceof Error && "stderr" in error
        ? String((error as { stderr?: unknown }).stderr ?? error.message)
        : String(error);
    return { run, ok: false, detail: message.trim().split("\n").slice(0, 6).join("\n") };
  }
}

async function main(): Promise<void> {
  const results = [];
  for (const guard of GUARDS) {
    results.push(await runGuard(guard));
  }
  // INV-BENCH-1 (G5)는 벤치마크 하니스 내부 게이트로 강제된다 — 여기서는
  // 게이트 코드의 존재만 정적으로 확인한다(실행은 live 벤치 비용).
  const { readFile } = await import("node:fs/promises");
  const benchSource = await readFile(
    path.join(PROJECT_ROOT, "scripts/review-pipeline-benchmark.ts"),
    "utf8",
  );
  const benchGatePresent =
    benchSource.includes("PRELIMINARY — not decision-grade") &&
    benchSource.includes("comparison_conclusion_allowed");
  results.push({
    run: {
      guard: "G5 benchmark-gate (static presence)",
      invariants: ["INV-BENCH-1", "INV-EXP-1"],
      command: ["(in-harness gate)"],
    },
    ok: benchGatePresent,
    detail: benchGatePresent
      ? "decision gate present in harness"
      : "decision gate tokens missing from review-pipeline-benchmark.ts",
  });

  const drift = results.filter((r) => !r.ok);
  console.log(
    JSON.stringify(
      {
        check: "invariant-drift",
        base: baseRef,
        status: drift.length === 0 ? "no_drift" : "drift_detected",
        guards: results.map((r) => ({
          guard: r.run.guard,
          invariants: r.run.invariants,
          status: r.ok ? "passed" : "FAILED",
        })),
        guideline_only: ["INV-LOOP-1", "INV-SCOPE-1", "INV-EXP-1(설계 규율)"],
      },
      null,
      2,
    ),
  );
  if (drift.length > 0) {
    for (const r of drift) {
      console.error(`\n[drift] ${r.run.guard}\n${r.detail}`);
    }
    process.exit(1);
  }
}

await main();
