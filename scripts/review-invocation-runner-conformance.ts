import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSettingsChain } from "../src/core-runtime/discovery/settings-chain.js";
import {
  prepareReviewInvocationArgv,
} from "../src/core-runtime/review/review-invocation-runner.js";
import { resolveReviewExecutionProfile } from "../src/core-runtime/review/review-execution-profile.js";
import { buildReviewExecutionRoute } from "../src/core-runtime/review/review-execution-route.js";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "onto-review-invocation-conformance-"));
  await fs.mkdir(path.join(projectRoot, ".onto"), { recursive: true });
  await fs.copyFile(
    path.join(PROJECT_ROOT, ".onto", "settings.json"),
    path.join(projectRoot, ".onto", "settings.json"),
  );
  await fs.writeFile(
    path.join(projectRoot, "README.md"),
    "# Invocation Runner Fixture\n\nPrepare-only conformance target.\n",
    "utf8",
  );
  const target = "README.md";
  const intent = "Check invocation runner conformance without dispatch.";
  const prepared = await prepareReviewInvocationArgv([
    target,
    intent,
    "--project-root",
    projectRoot,
    "--onto-home",
    PROJECT_ROOT,
    "--no-domain",
    "--review-mode",
    "core-axis",
  ]);
  assert(
    prepared.prepare_only === true,
    "prepared invocation must return prepare-only result.",
  );
  assert(
    prepared.host_runtime === "codex",
    "prepared invocation must resolve default Codex host runtime.",
  );

  const settings = await resolveSettingsChain(PROJECT_ROOT, projectRoot);
  const profile = resolveReviewExecutionProfile({
    explicitCodex: false,
    settings,
    codexAvailable: true,
    env: {},
  });
  assert(profile.type === "resolved", "review execution profile must resolve.");
  const route = buildReviewExecutionRoute(profile.profile);
  assert(
    route.execution_route === "external_oauth_worker",
    "default invocation route must use external_oauth_worker.",
  );
  assert(
    route.execution_adapter === "codex_cli",
    "default invocation route must use codex_cli adapter.",
  );
  assert(
    route.model_provider === "openai",
    "default invocation route must use OpenAI model provider.",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        checks: [
          {
            name: "argv preparation",
            status: "passed",
            evidence: {
              prepare_only: prepared.prepare_only,
              host_runtime: prepared.host_runtime,
              review_mode: prepared.review_mode,
            },
          },
          {
            name: "default route",
            status: "passed",
            evidence: {
              execution_route: route.execution_route,
              execution_adapter: route.execution_adapter,
              model_provider: route.model_provider,
              auth_mode: route.auth_mode,
            },
          },
        ],
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
