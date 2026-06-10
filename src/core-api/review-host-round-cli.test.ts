import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewExecutionPlan } from "../core-runtime/review/artifact-types.js";
import { readYamlDocument } from "../core-runtime/review/review-artifact-utils.js";
import {
  REVIEW_MOCK_REALIZATION_ENV,
  setTemporaryEnv,
} from "../core-runtime/review/test-fixtures/mock-realization.js";
import { runHostRoundCli } from "../../scripts/review-host-round-cli.js";

const tempRoots: string[] = [];
let originalHome: string | undefined;
let restoreEnv: (() => void) | undefined;

beforeEach(async () => {
  restoreEnv = setTemporaryEnv({
    [REVIEW_MOCK_REALIZATION_ENV]: "1",
    OPENAI_API_KEY: "test-openai-key",
  });
  originalHome = process.env.HOME;
  const homeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "onto-host-cli-home-"));
  tempRoots.push(homeRoot);
  process.env.HOME = homeRoot;
});

afterEach(async () => {
  restoreEnv?.();
  if (originalHome !== undefined) process.env.HOME = originalHome;
  for (const root of tempRoots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

async function tempProjectRoot(): Promise<string> {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "onto-host-cli-review-"),
  );
  tempRoots.push(projectRoot);
  await fs.writeFile(
    path.join(projectRoot, "target.txt"),
    "host round cli determinism target\n",
    "utf8",
  );
  const settingsPath = path.join(projectRoot, ".onto", "settings.json");
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  const llm = { auth: "api_key", provider: "openai", model: "mock-model" };
  await fs.writeFile(
    settingsPath,
    `${JSON.stringify(
      {
        schema_version: "settings.json/v3",
        review: {
          artifacts: { lens_output_format: "markdown" },
          execution: {
            topology: "main-workers",
            executor: "direct_call",
            orchestration: "host",
            deliberation: "controlled-lens-deliberation",
            artifact_generation_realization: "semantic_mock",
            actors: {
              teamlead: { seat: "main", llm },
              lens: { seat: "worker", llm },
              synthesize: { seat: "worker", llm },
            },
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return projectRoot;
}

/** CLI 한 번 호출의 stdout JSON 라인을 파싱해 반환한다. */
async function cli(argv: string[]): Promise<Record<string, unknown>> {
  const lines: string[] = [];
  const spy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation(((chunk: string | Uint8Array) => {
      lines.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
  try {
    const code = await runHostRoundCli(argv);
    expect(code).toBe(0);
  } finally {
    spy.mockRestore();
  }
  const last = lines.join("").trim().split("\n").at(-1);
  return JSON.parse(last ?? "{}") as Record<string, unknown>;
}

describe("review-host-round-cli (L2 bridge determinism)", () => {
  it("drives prepare -> round -> seats -> advance through the CLI surface only", async () => {
    const projectRoot = await tempProjectRoot();

    const prepared = await cli([
      "prepare",
      "--project-root",
      projectRoot,
      "--target",
      "target.txt",
      "--intent",
      "Host round CLI determinism contract",
      "--no-domain",
      "--review-mode",
      "core-axis",
      "--lens-ids",
      "logic,coverage",
    ]);
    expect(prepared.status).toBe("prepared");
    const sessionRoot = String(prepared.sessionRoot);
    const plan = await readYamlDocument<ReviewExecutionPlan>(
      path.join(sessionRoot, "execution-plan.yaml"),
    );
    expect(plan.orchestration).toBe("host");

    const round = await cli(["round", "--session-root", sessionRoot]);
    expect(round.status).toBe("in_progress");
    const readyUnits = round.readyUnits as Array<Record<string, unknown>>;
    expect(readyUnits.map((unit) => unit.unit_id).sort()).toEqual([
      "coverage",
      "logic",
    ]);

    for (const seat of plan.lens_execution_seats) {
      await fs.writeFile(seat.output_path, `# ${seat.lens_id} findings\n`, "utf8");
    }

    const advance = await cli([
      "advance",
      "--session-root",
      sessionRoot,
      "--executed",
      "logic,coverage",
    ]);
    expect(advance.status).toBe("in_progress");
    const nextUnits = advance.readyUnits as Array<Record<string, unknown>>;
    expect(nextUnits.map((unit) => unit.unit_id)).toEqual(["finding-ledger"]);
  });

  it("fails loud on a missing required flag and an unknown command", async () => {
    await expect(runHostRoundCli(["round"])).rejects.toThrow(/--session-root/);
    await expect(runHostRoundCli(["nope"])).rejects.toThrow(/unknown command/);
  });
});
