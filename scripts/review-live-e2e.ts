import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import YAML from "yaml";

const execFileAsync = promisify(execFile);

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const TSX = path.join(
  PROJECT_ROOT,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsx.cmd" : "tsx",
);
const TIMEOUT_MS = Number.parseInt(
  process.env.ONTO_REVIEW_LIVE_E2E_TIMEOUT_MS ?? "900000",
  10,
);
const REVIEW_MODE = process.env.ONTO_REVIEW_LIVE_E2E_REVIEW_MODE ?? "full";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readYaml<T>(filePath: string): Promise<T> {
  return YAML.parse(await fs.readFile(filePath, "utf8")) as T;
}

async function latestSessionRoot(projectRoot: string): Promise<string> {
  const reviewRoot = path.join(projectRoot, ".onto", "review");
  const entries = await fs.readdir(reviewRoot, { withFileTypes: true });
  const dirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(reviewRoot, entry.name))
    .sort();
  const latest = dirs.at(-1);
  assert(latest !== undefined, "live review did not create a review session.");
  return latest;
}

async function assertNoForbiddenRound1Files(sessionRoot: string): Promise<void> {
  const round1Root = path.join(sessionRoot, "round1");
  const entries = await fs.readdir(round1Root);
  const forbidden = entries.filter((entry) =>
    entry.endsWith(".md") ||
    entry.endsWith(".codex-output.json") ||
    entry.endsWith(".schema.json") ||
    entry.includes("mock")
  );
  assert(
    forbidden.length === 0,
    `round1 contains forbidden live-test artifacts: ${forbidden.join(", ")}`,
  );
}

async function main(): Promise<void> {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "onto-review-live-e2e-"));
  await fs.mkdir(path.join(projectRoot, ".onto"), { recursive: true });
  await fs.copyFile(
    path.join(PROJECT_ROOT, ".onto", "settings.json"),
    path.join(projectRoot, ".onto", "settings.json"),
  );
  const targetPath = path.join(projectRoot, "review-target.md");
  await fs.writeFile(
    targetPath,
    [
      "# Onto Live E2E Review Target",
      "",
      "Purpose: verify the default review workflow through the real runtime path.",
      "",
      "Contract: the run must call the configured live LLM/provider route, produce canonical artifacts, and fail loudly instead of using mock or replayed outputs.",
      "",
      "Expected result: no material issue is required; artifact completeness and route truth are the test focus.",
      "",
    ].join("\n"),
    "utf8",
  );

  const args = [
    path.join(PROJECT_ROOT, "src", "core-runtime", "cli", "review-invocation-runner.ts"),
    targetPath,
    "Run the live E2E review path without mock, fake, replay, or prepare-only bypass.",
    "--project-root",
    projectRoot,
    "--onto-home",
    PROJECT_ROOT,
    "--no-domain",
    "--review-mode",
    REVIEW_MODE,
    "--no-watch",
  ];

  const { ONTO_LLM_MOCK: _ignoredMockEnv, ...liveEnv } = process.env;
  const result = await execFileAsync(TSX, args, {
    cwd: PROJECT_ROOT,
    timeout: Number.isFinite(TIMEOUT_MS) ? TIMEOUT_MS : 900000,
    maxBuffer: 16 * 1024 * 1024,
    env: liveEnv,
  });

  const sessionRoot = await latestSessionRoot(projectRoot);
  const executionResultPath = path.join(sessionRoot, "execution-result.yaml");
  const reviewRecordPath = path.join(sessionRoot, "review-record.yaml");
  const finalOutputPath = path.join(sessionRoot, "final-output.md");
  const manifestPath = path.join(sessionRoot, "review-run-manifest.yaml");

  assert(await pathExists(executionResultPath), "execution-result.yaml is missing.");
  assert(await pathExists(reviewRecordPath), "review-record.yaml is missing.");
  assert(await pathExists(finalOutputPath), "final-output.md is missing.");
  assert(await pathExists(manifestPath), "review-run-manifest.yaml is missing.");

  const execution = await readYaml<{
    execution_status?: string;
    planned_lens_ids?: string[];
    participating_lens_ids?: string[];
    degraded_lens_ids?: string[];
  }>(executionResultPath);
  assert(
    execution.execution_status === "completed",
    `live review did not complete: ${execution.execution_status}`,
  );
  assert(
    (execution.degraded_lens_ids ?? []).length === 0,
    `live review degraded lenses: ${(execution.degraded_lens_ids ?? []).join(", ")}`,
  );
  assert(
    (execution.participating_lens_ids ?? []).length ===
      (execution.planned_lens_ids ?? []).length,
    "not every planned lens participated in the live review.",
  );

  const manifest = await readYaml<{
    review_execution_profile?: {
      runtime_route?: {
        execution_route?: string;
        execution_adapter?: string;
        model_provider?: string;
        worker_executor?: string;
        runtime_provider?: string;
        auth_mode?: string;
      };
    };
  }>(manifestPath);
  const route = manifest.review_execution_profile?.runtime_route;
  assert(
    route?.execution_route === "external_oauth_worker",
    "live E2E must use external_oauth_worker route.",
  );
  assert(
    route?.execution_adapter === "codex_cli",
    "live E2E must use codex_cli adapter.",
  );
  assert(route?.model_provider === "openai", "live E2E must use OpenAI model provider.");
  assert(route?.auth_mode === "oauth", "live E2E must use OAuth auth.");

  await assertNoForbiddenRound1Files(sessionRoot);

  console.log(JSON.stringify({
    ok: true,
    session_root: sessionRoot,
    stdout_bytes: result.stdout.length,
    stderr_bytes: result.stderr.length,
    review_mode: REVIEW_MODE,
    participating_lens_count: execution.participating_lens_ids?.length ?? 0,
    degraded_lens_count: execution.degraded_lens_ids?.length ?? 0,
    route,
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
