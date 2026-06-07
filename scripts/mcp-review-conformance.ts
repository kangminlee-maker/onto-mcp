import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSettingsChain } from "../src/core-runtime/discovery/settings-chain.js";
import { resolveReviewExecutionProfile } from "../src/core-runtime/review/review-execution-profile.js";
import { buildReviewExecutionRoute } from "../src/core-runtime/review/review-execution-route.js";
import { OntoReviewToolInputSchema } from "../src/mcp/tool-schemas.js";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const settings = await resolveSettingsChain(PROJECT_ROOT, PROJECT_ROOT);
  const resolution = resolveReviewExecutionProfile({
    explicitCodex: false,
    settings,
    codexAvailable: true,
    env: {},
  });
  assert(resolution.type === "resolved", "review profile must resolve.");
  const route = buildReviewExecutionRoute(resolution.profile);
  assert(
    route.execution_route === "external_oauth_worker",
    "default MCP review route must use external_oauth_worker.",
  );
  assert(
    route.execution_adapter === "codex_cli",
    "default MCP review route must use codex_cli adapter.",
  );
  assert(route.model_provider === "openai", "default MCP review route must use OpenAI.");
  assert(route.auth_mode === "oauth", "default MCP review route must use OAuth.");

  const parsed = OntoReviewToolInputSchema.safeParse({
    target: "README.md",
    intent: "Check MCP review schema.",
    noDomain: true,
    reviewMode: "core-axis",
    executionRoute: "external_oauth_worker",
  });
  assert(parsed.success, "review MCP tool schema must accept canonical route input.");
  const legacyParsed = OntoReviewToolInputSchema.safeParse({
    target: "README.md",
    intent: "Check MCP review schema.",
    noDomain: true,
    reviewMode: "core-axis",
    executorRealization: "codex",
  });
  assert(
    !legacyParsed.success,
    "review MCP tool schema must reject legacy executorRealization input.",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        checks: [
          {
            name: "review tool schema",
            status: "passed",
            evidence: {
              accepted_canonical_route_input: parsed.success,
              rejected_legacy_executor_realization: !legacyParsed.success,
            },
          },
          {
            name: "default MCP review route",
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
