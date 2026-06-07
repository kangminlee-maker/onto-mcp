import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSettingsChain } from "../src/core-runtime/discovery/settings-chain.js";
import { resolveReviewExecutionProfile } from "../src/core-runtime/review/review-execution-profile.js";
import { buildReviewExecutionRoute } from "../src/core-runtime/review/review-execution-route.js";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

interface CheckResult {
  name: string;
  status: "passed";
  evidence: Record<string, unknown>;
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function checkDefaultRoute(): Promise<CheckResult> {
  const settings = await resolveSettingsChain(PROJECT_ROOT, PROJECT_ROOT);
  const resolution = resolveReviewExecutionProfile({
    explicitCodex: false,
    settings,
    codexAvailable: true,
    env: {},
  });
  assert(resolution.type === "resolved", "default review execution profile must resolve.");
  const route = buildReviewExecutionRoute(resolution.profile);
  assert(
    route.execution_route === "external_oauth_worker",
    "default review route must use external_oauth_worker.",
  );
  assert(
    route.execution_adapter === "codex_cli",
    "default review route must use codex_cli adapter.",
  );
  assert(
    route.model_provider === "openai",
    "default review route model provider must be OpenAI.",
  );
  assert(route.auth_mode === "oauth", "default review route auth must be OAuth.");
  return {
    name: "default review route",
    status: "passed",
    evidence: {
      execution_route: route.execution_route,
      execution_adapter: route.execution_adapter,
      model_provider: route.model_provider,
      auth_mode: route.auth_mode,
    },
  };
}

async function main(): Promise<void> {
  const checks = [
    await checkDefaultRoute(),
  ];
  console.log(JSON.stringify({ ok: true, checks }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
