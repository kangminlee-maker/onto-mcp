/**
 * Codex multi-agent fixes — E2E test suite.
 *
 * Run: `npx vitest run src/core-runtime/cli/e2e-codex-multi-agent-fixes.test.ts`
 *
 * Covers:
 *   B. OntoSettings llm model switcher (settings-chain.ts)
 *   C. appendExecutorModelArgs llm precedence (review-invoke.ts)
 *   D. Synthesize retry (run-review-prompt-execution.ts)
 *
 * Isolation strategy:
 *   Each test builds minimal tmpdir fixtures. Tests that exercise the
 *   prompt execution runner build a full session directory with a mock
 *   execution-plan.yaml and mock prompt packets.
 *
 * Fixture strategy:
 *   Settings fixtures declare the current `review.execution` shape so profile
 *   ownership is explicit and parser behavior stays deterministic.
 */

import { describe, it, afterAll } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import fsAsync from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  projectSettingsPath,
  resolveSettingsChain,
  userSettingsPath,
} from "../discovery/settings-chain.js";
import type { ReviewContinuationPlan } from "../review/continuation-plan.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `${message} — expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`,
    );
  }
}

function assertIncludes(text: string, needle: string, message: string): void {
  if (!text.includes(needle)) {
    throw new Error(`${message} — text does not include ${JSON.stringify(needle)}`);
  }
}

function assertNotIncludes(text: string, needle: string, message: string): void {
  if (text.includes(needle)) {
    throw new Error(`${message} — text unexpectedly includes ${JSON.stringify(needle)}`);
  }
}

async function assertRejects(
  fn: () => Promise<unknown>,
  expectedMessage: string,
  message: string,
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (!errorMessage.includes(expectedMessage)) {
      throw new Error(
        `${message} — expected ${JSON.stringify(expectedMessage)} in ${JSON.stringify(errorMessage)}`,
      );
    }
    return;
  }
  throw new Error(`${message} — expected rejection`);
}

function sha256File(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `onto-e2e-cmaf-${prefix}-`));
}

function writeYaml(filePath: string, data: Record<string, unknown>): void {
  // Minimal YAML serializer sufficient for test fixtures
  const lines: string[] = [];
  function renderValue(value: unknown, indent: number): void {
    const pad = " ".repeat(indent);
    if (value === null || value === undefined) {
      lines.push("null");
      return;
    }
    if (typeof value === "string") {
      // Use quoted form for safety
      lines.push(`"${value.replace(/"/g, '\\"')}"`);
      return;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      lines.push(String(value));
      return;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push("[]");
        return;
      }
      lines.push("");
      for (const item of value) {
        const lineStart = `${pad}- `;
        if (typeof item === "object" && item !== null && !Array.isArray(item)) {
          const entries = Object.entries(item as Record<string, unknown>);
          let first = true;
          for (const [k, v] of entries) {
            if (first) {
              lines.push(`${lineStart}${k}: `);
              first = false;
            } else {
              lines.push(`${pad}  ${k}: `);
            }
            renderValue(v, indent + 4);
          }
        } else {
          lines.push(lineStart);
          renderValue(item, indent + 2);
        }
      }
      return;
    }
    if (typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0) {
        lines.push("{}");
        return;
      }
      lines.push("");
      for (const [k, v] of entries) {
        lines.push(`${pad}${k}: `);
        renderValue(v, indent + 2);
      }
      return;
    }
    lines.push(String(value));
  }

  for (const [key, value] of Object.entries(data)) {
    lines.push(`${key}: `);
    renderValue(value, 2);
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, lines.join("").replace(/: \n/g, ":\n").replace(/: (\S)/g, ": $1") + "\n", "utf8");
}

function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function withHomeDir<T>(homeDir: string, fn: () => Promise<T>): Promise<T> {
  const originalHome = process.env.HOME;
  process.env.HOME = homeDir;
  try {
    return await fn();
  } finally {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
  }
}

/** Cleanup directory, ignoring errors. */
function rmDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch { /* ignore */ }
}

const cleanupDirs: string[] = [];
function trackCleanup(dir: string): string {
  cleanupDirs.push(dir);
  return dir;
}

// ---------------------------------------------------------------------------
// B. OntoSettings actor-owned llm settings (settings-chain.ts)
// ---------------------------------------------------------------------------

type ActorLlmFixture = {
  auth: "api_key" | "oauth" | "local";
  provider: "openai" | "anthropic" | "grok" | "lmstudio";
  model: string;
  effort?: string;
  service_tier?: string;
};

function openAiOauthFixture(model: string, effort: string): ActorLlmFixture {
  return {
    auth: "oauth",
    provider: "openai",
    model,
    effort,
    service_tier: "fast",
  };
}

function actorOwnedSettingsFixture(llm: ActorLlmFixture) {
  return {
    schema_version: "settings.json/v3",
    review: {
      execution: {
        topology: "main-workers",
        deliberation: "controlled-lens-deliberation",
        actors: {
          teamlead: { seat: "main", llm },
          lens: { seat: "worker", llm },
          synthesize: { seat: "worker", llm },
        },
      },
    },
  };
}

describe("B. settings-chain actor-owned llm settings", () => {
  it("B-1: actor llm settings parsed from project settings", async () => {
    const homeDir = trackCleanup(makeTmpDir("b1h"));
    const projDir = trackCleanup(makeTmpDir("b1p"));
    writeJson(
      projectSettingsPath(projDir),
      actorOwnedSettingsFixture(openAiOauthFixture("gpt-5.4", "xhigh")),
    );
    const config = await withHomeDir(homeDir, () => resolveSettingsChain(homeDir, projDir));
    assertEqual(config.llm, undefined, "root llm remains absent");
    assertEqual(config.review?.execution?.teamlead?.llm?.auth, "oauth", "actor auth parsed");
    assertEqual(config.review?.execution?.teamlead?.llm?.provider, "openai", "actor provider parsed");
    assertEqual(config.review?.execution?.teamlead?.llm?.model, "gpt-5.4", "actor model parsed");
    assertEqual(config.review?.execution?.teamlead?.llm?.effort, "xhigh", "actor effort parsed");
  });

  it("B-2: project actor settings replace home actor settings", async () => {
    const homeDir = trackCleanup(makeTmpDir("b2h"));
    const projDir = trackCleanup(makeTmpDir("b2p"));
    await withHomeDir(homeDir, async () => {
      writeJson(userSettingsPath(), actorOwnedSettingsFixture(openAiOauthFixture("gpt-5.3", "high")));
      writeJson(
        projectSettingsPath(projDir),
        actorOwnedSettingsFixture(openAiOauthFixture("gpt-5.4", "xhigh")),
      );
    });
    const config = await withHomeDir(homeDir, () => resolveSettingsChain(homeDir, projDir));
    assertEqual(config.review?.execution?.teamlead?.llm?.model, "gpt-5.4", "project actor model wins");
    assertEqual(config.review?.execution?.teamlead?.llm?.effort, "xhigh", "project actor effort wins");
  });

  it("B-3: review block coexists with non-OpenAI actor provider", async () => {
    const homeDir = trackCleanup(makeTmpDir("b3h"));
    const projDir = trackCleanup(makeTmpDir("b3p"));
    const anthropicLlm: ActorLlmFixture = {
      auth: "api_key",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      effort: "medium",
    };
    writeJson(projectSettingsPath(projDir), actorOwnedSettingsFixture(anthropicLlm));
    const config = await withHomeDir(homeDir, () => resolveSettingsChain(homeDir, projDir));
    assertEqual(config.review?.execution?.mode, "main-workers", "review execution parsed");
    assertEqual(config.review?.execution?.lens?.llm?.provider, "anthropic", "actor provider parsed");
    assertEqual(config.review?.execution?.lens?.llm?.model, "claude-sonnet-4-6", "actor model parsed");
  });

  it("B-4: missing actor llm settings stay undefined", async () => {
    const homeDir = trackCleanup(makeTmpDir("b4h"));
    const projDir = trackCleanup(makeTmpDir("b4p"));
    writeJson(projectSettingsPath(projDir), {
      schema_version: "settings.json/v3",
      review: {
        execution: {
          topology: "main-workers",
          deliberation: "controlled-lens-deliberation",
          actors: {},
        },
      },
    });
    const config = await withHomeDir(homeDir, () => resolveSettingsChain(homeDir, projDir));
    assertEqual(config.llm, undefined, "llm absent -> undefined");
    assertEqual(config.review?.execution?.teamlead?.llm, undefined, "teamlead llm absent");
  });

  it("B-5: partial actor llm fails loudly", async () => {
    const homeDir = trackCleanup(makeTmpDir("b5h"));
    const projDir = trackCleanup(makeTmpDir("b5p"));
    writeJson(projectSettingsPath(projDir), {
      schema_version: "settings.json/v3",
      review: {
        execution: {
          topology: "main-workers",
          deliberation: "controlled-lens-deliberation",
          actors: {
            synthesize: { seat: "worker", llm: { effort: "xhigh" } },
          },
        },
      },
    });
    let thrown = false;
    try {
      await withHomeDir(homeDir, () => resolveSettingsChain(homeDir, projDir));
    } catch (error) {
      thrown = true;
      assertIncludes(String(error), "Invalid onto settings", "partial actor llm rejected");
    }
    assert(thrown, "partial actor llm throws");
  });

  it("B-6: home actor settings used when project has no config", async () => {
    const homeDir = trackCleanup(makeTmpDir("b6h"));
    const projDir = trackCleanup(makeTmpDir("b6p"));
    const config = await withHomeDir(homeDir, async () => {
      writeJson(userSettingsPath(), actorOwnedSettingsFixture(openAiOauthFixture("gpt-5.3", "high")));
      return resolveSettingsChain(homeDir, projDir);
    });
    assertEqual(config.review?.execution?.teamlead?.llm?.model, "gpt-5.3", "home actor model used");
    assertEqual(config.review?.execution?.teamlead?.llm?.effort, "high", "home actor effort used");
  });
});

// ---------------------------------------------------------------------------
// C. appendExecutorModelArgs actor llm precedence (review-invoke.ts)
//
// We can't import the private function directly, so we test it indirectly
// through the CLI argv interface by checking the resolved executor config.
// Strategy: duplicate the private resolution logic against the canonical
// actor-owned `llm` settings and CLI flags.
//
// For isolated unit testing, we duplicate the function's logic and verify.
// ---------------------------------------------------------------------------

import { readSingleOptionValueFromArgv } from "../review/review-artifact-utils.js";
import { normalizeLlmModelSwitcher } from "../llm/model-switcher.js";
import { resolveExecutorConfig } from "./review-invoke.js";
import type { ReviewExecutionProfile } from "../review/review-execution-profile.js";

describe("C. actor llm config precedence", () => {
  // Reproduce appendExecutorModelArgs logic to test the resolution chain
  type OntoConfig = {
    actorLlm?: {
      auth?: "api_key" | "oauth" | "local";
      provider?: "openai" | "anthropic" | "grok" | "lmstudio";
      model?: string;
      effort?: string;
    };
  };

  function resolveModel(
    argv: string[],
    config: OntoConfig | undefined,
  ): string | undefined {
    const fromArgv = readSingleOptionValueFromArgv(argv, "model");
    const llmSelection = normalizeLlmModelSwitcher(config?.actorLlm);
    return (
      (typeof fromArgv === "string" && fromArgv.length > 0 ? fromArgv : undefined) ??
      llmSelection?.model_id
    );
  }

  function resolveEffort(
    argv: string[],
    config: OntoConfig | undefined,
  ): string | undefined {
    const fromArgv = readSingleOptionValueFromArgv(argv, "reasoning-effort");
    const llmSelection = normalizeLlmModelSwitcher(config?.actorLlm);
    return (
      (typeof fromArgv === "string" && fromArgv.length > 0 ? fromArgv : undefined) ??
      llmSelection?.reasoning_effort
    );
  }

  it("C-1: CLI flag wins over everything (model)", () => {
    const config: OntoConfig = {
      actorLlm: { auth: "oauth", provider: "openai", model: "gpt-5.3" },
    };
    const result = resolveModel(["--model", "gpt-5.4"], config);
    assertEqual(result, "gpt-5.4", "CLI flag wins");
  });

  it("C-2: actor llm model is used when CLI flag is absent", () => {
    const config: OntoConfig = {
      actorLlm: { auth: "api_key", provider: "anthropic", model: "claude-sonnet-4-6" },
    };
    const result = resolveModel([], config);
    assertEqual(result, "claude-sonnet-4-6", "actor llm.model selected");
  });

  it("C-3: OpenAI OAuth maps to codex runtime while preserving model", () => {
    const config: OntoConfig = {
      actorLlm: { auth: "oauth", provider: "openai", model: "gpt-5.4" },
    };
    const selection = normalizeLlmModelSwitcher(config.actorLlm);
    const result = resolveModel([], config);
    assertEqual(selection?.provider, "codex", "runtime provider");
    assertEqual(result, "gpt-5.4", "actor llm.model selected");
  });

  it("C-4: actor llm effort used when CLI reasoning-effort is absent", () => {
    const config: OntoConfig = {
      actorLlm: { auth: "oauth", provider: "openai", effort: "xhigh" },
    };
    const result = resolveEffort([], config);
    assertEqual(result, "xhigh", "actor llm.effort selected");
  });

  it("C-5: CLI reasoning-effort wins over actor llm effort", () => {
    const config: OntoConfig = {
      actorLlm: { auth: "oauth", provider: "openai", effort: "xhigh" },
    };
    const result = resolveEffort(["--reasoning-effort", "medium"], config);
    assertEqual(result, "medium", "CLI effort wins");
  });

  it("C-6: invalid actor llm combination fails loudly", () => {
    const config: OntoConfig = {
      actorLlm: { auth: "oauth", provider: "anthropic", model: "claude-sonnet-4-6" },
    };
    let thrown = false;
    try {
      resolveModel([], config);
    } catch (error) {
      thrown = true;
      assertIncludes(String(error), "oauth", "error names auth");
      assertIncludes(String(error), "openai", "error names supported provider");
    }
    assert(thrown, "invalid auth/provider combination throws");
  });

  it("C-7: all absent → undefined", () => {
    const config: OntoConfig = {};
    assertEqual(resolveModel([], config), undefined, "model undefined");
    assertEqual(resolveEffort([], config), undefined, "effort undefined");
  });

  it("C-8: undefined config → undefined", () => {
    assertEqual(resolveModel([], undefined), undefined, "model no config");
    assertEqual(resolveEffort([], undefined), undefined, "effort no config");
  });

  it("C-9: executor-realization override still preserves actor effort settings", () => {
    const llm = {
      auth: "oauth" as const,
      provider: "openai" as const,
      model: "gpt-5.4",
      effort: "xhigh",
      service_tier: "fast",
    };
    const profile: ReviewExecutionProfile = {
      mode: "main-workers",
      teamlead: { seat: "main", llm },
      lens: { seat: "worker", llm },
      synthesize: { seat: "worker", llm },
      deliberation: "controlled-lens-deliberation",
      worker_executor: "codex",
      host: "codex",
      provider: "codex",
      auth: "oauth",
      model: "gpt-5.4",
      effort: "xhigh",
      service_tier: "fast",
      trace: [],
    };

    const config = resolveExecutorConfig(
      ["--executor-realization", "codex"],
      "",
      undefined,
      process.cwd(),
      profile,
      "lens",
    );
    const renderedArgs = config.args.join(" ");

    assertIncludes(renderedArgs, "--model gpt-5.4", "model arg preserved");
    assertIncludes(
      renderedArgs,
      "--reasoning-effort xhigh",
      "reasoning effort arg preserved",
    );
  });
});

// ---------------------------------------------------------------------------
// D. Synthesize retry (run-review-prompt-execution.ts)
//
// Strategy: build a minimal session, use always-succeed executor for lenses,
// and flaky/always-fail executor for synthesize to test the new retry logic.
// D-4/D-5 pre-write lens outputs to bypass the lens retry loop (10 retries
// with 8s backoff = too slow for E2E tests).
// ---------------------------------------------------------------------------

import { executeReviewPromptExecution } from "./run-review-prompt-execution.js";
import { completeReviewSession } from "./complete-review-session.js";
import {
  readYamlDocument,
  toRelativePath,
  writeYamlDocument,
} from "../review/review-artifact-utils.js";

describe("D. Synthesize retry", () => {
  const projectRoot = process.cwd();

  const BOUNDARY_DECISION = {
    requested_policy: "denied",
    effective_policy: "denied",
    guarantee_level: "prompt_declared_only",
    notes: [],
  };
  const REPO_ALLOWED_BOUNDARY_DECISION = {
    requested_policy: "allowed",
    effective_policy: "allowed",
    guarantee_level: "prompt_declared_only",
    notes: [],
  };

  const CONTROLLED_DELIBERATION_OUTPUT = [
    "---",
    "deliberation_status: performed",
    "---",
    "# Controlled Deliberation",
    "",
    "## Consensus",
    "Mock consensus.",
    "",
    "## Conditional Consensus",
    "None.",
    "",
    "## Disagreement",
    "None.",
    "",
    "## Deliberation Decision",
    "No contested points.",
    "",
    "## Axiology-Proposed Additional Perspectives",
    "None.",
    "",
    "## Purpose Alignment Verification",
    "Aligned.",
    "",
    "## Immediate Actions Required",
    "None.",
    "",
    "## Recommendations",
    "Continue.",
    "",
    "## Unique Finding Tagging",
    "No unique tags.",
    "",
  ].join("\n");

  const LENS_DELIBERATION_OUTPUT = [
    "# Lens Deliberation Response",
    "",
    "## Re-evaluation Summary",
    "No changes.",
    "",
    "## Accepted From Other Lenses",
    "None.",
    "",
    "## Contested Points",
    "None.",
    "",
    "## Position Changes",
    "None.",
    "",
    "## Final Lens Position",
    "Original position preserved.",
    "",
  ].join("\n");

  const SYNTHESIZE_OUTPUT = [
    "---",
    "deliberation_status: performed",
    "participation:",
    "  expected_lenses:",
    "    - logic",
    "    - pragmatics",
    "  received_lenses:",
    "    - logic",
    "    - pragmatics",
    "  missing_or_failed_lenses: []",
    "  run_status: full",
    "---",
    "# Synthesize",
    "",
    "## Consensus",
    "Mock consensus.",
    "",
    "## Conditional Consensus",
    "None.",
    "",
    "## Disagreement",
    "None.",
    "",
    "## Deliberation Decision",
    "No contested points.",
    "",
    "## Axiology-Proposed Additional Perspectives",
    "None.",
    "",
    "## Purpose Alignment Verification",
    "Aligned.",
    "",
    "## Final Review Result",
    "Mock final result.",
    "",
    "## Boundary Notes",
    "None.",
    "",
    "## Immediate Actions Required",
    "None.",
    "",
    "## Recommendations",
    "Continue.",
    "",
    "## Unique Finding Tagging",
    "No unique tags.",
    "",
  ].join("\n");

  async function buildMinimalSession(
    prefix: string,
    options?: { parentRepoExplorationPolicy?: "allowed" | "denied" },
  ): Promise<{ sessionRoot: string; synthesizeOutputPath: string }> {
    const parentRepoExplorationPolicy =
      options?.parentRepoExplorationPolicy ?? "denied";
    const parentRepoExplorationDecision =
      parentRepoExplorationPolicy === "allowed"
        ? REPO_ALLOWED_BOUNDARY_DECISION
        : BOUNDARY_DECISION;
    const sessionRoot = trackCleanup(makeTmpDir(prefix));
    const packetRoot = path.join(sessionRoot, "prompt-packets");
    const round1Root = path.join(sessionRoot, "round1");
    const deliberationRoot = path.join(sessionRoot, "deliberation");
    const deliberationRound1Root = path.join(deliberationRoot, "round1");
    const findingLedgerPath = path.join(sessionRoot, "finding-ledger.yaml");
    const findingRelationGraphPath = path.join(sessionRoot, "finding-relation-graph.yaml");
    const issueLedgerPath = path.join(sessionRoot, "issue-ledger.yaml");
    const issueStanceMatrixPath = path.join(sessionRoot, "issue-stance-matrix.yaml");
    const deliberationPlanPath = path.join(sessionRoot, "deliberation-plan.yaml");
    const problemFramingPath = path.join(sessionRoot, "problem-framing.yaml");
    const interpretationPath = path.join(sessionRoot, "interpretation.yaml");
    const bindingPath = path.join(sessionRoot, "binding.yaml");
    const sessionMetadataPath = path.join(sessionRoot, "session-metadata.yaml");
    const executionPreparationRoot = path.join(sessionRoot, "execution-preparation");
    const targetSnapshotPath = path.join(executionPreparationRoot, "target-snapshot.md");
    const targetSnapshotManifestPath = path.join(
      executionPreparationRoot,
      "target-snapshot-manifest.yaml",
    );
    const reviewContextManifestPath = path.join(
      executionPreparationRoot,
      "review-context-manifest.yaml",
    );
    const materializedInputPath = path.join(
      executionPreparationRoot,
      "materialized-input.md",
    );
    const reviewTargetProfilePath = path.join(
      executionPreparationRoot,
      "review-target-profile.yaml",
    );
    const contextCandidateAssemblyPath = path.join(
      executionPreparationRoot,
      "context-candidate-assembly.yaml",
    );
    fs.mkdirSync(packetRoot, { recursive: true });
    fs.mkdirSync(executionPreparationRoot, { recursive: true });
    fs.mkdirSync(round1Root, { recursive: true });
    fs.mkdirSync(deliberationRound1Root, { recursive: true });

    for (const lensId of ["logic", "pragmatics"]) {
      fs.writeFileSync(
        path.join(packetRoot, `${lensId}.prompt.md`),
        `# ${lensId} prompt packet\nTest.\n`,
        "utf8",
      );
    }
    fs.writeFileSync(materializedInputPath, "# Target\nMinimal fixture.\n", "utf8");
    fs.writeFileSync(targetSnapshotPath, "# Target Snapshot\nMinimal fixture.\n", "utf8");
    fs.writeFileSync(
      reviewTargetProfilePath,
      "schema_version: 1\nprofile_id: test\n",
      "utf8",
    );
    await writeYamlDocument(targetSnapshotManifestPath, {
      schema_version: "1",
      session_id: path.basename(sessionRoot),
      target_refs: [materializedInputPath],
    });
    await writeYamlDocument(contextCandidateAssemblyPath, {
      schema_version: "1",
      session_id: path.basename(sessionRoot),
      selected_context_refs: [materializedInputPath],
    });
    await writeYamlDocument(interpretationPath, {
      entrypoint: "review",
      intent_summary: "test",
      ambiguity_notes: [],
    });
    await writeYamlDocument(sessionMetadataPath, {
      session_id: path.basename(sessionRoot),
      created_at: "2026-05-26T00:00:00.000Z",
    });
    fs.writeFileSync(
      path.join(packetRoot, "synthesize.prompt.md"),
      [
        "# Synthesize",
        "Combine.",
        "",
        "## Unit Boundary Details",
        "```json",
        JSON.stringify(
          {
            unit_boundary: {
              read_authority: {
                allowed_read_refs: [
                  materializedInputPath,
                  bindingPath,
                  reviewTargetProfilePath,
                ],
              },
            },
          },
          null,
          2,
        ),
        "```",
        "",
      ].join("\n"),
      "utf8",
    );

    const staticPacketRefs = [
      { consumer_id: "lens:logic", packet_ref: path.join(packetRoot, "logic.prompt.md") },
      { consumer_id: "lens:pragmatics", packet_ref: path.join(packetRoot, "pragmatics.prompt.md") },
      { consumer_id: "synthesize", packet_ref: path.join(packetRoot, "synthesize.prompt.md") },
    ];
    const allowedConsumers = [
      "lens:logic",
      "lens:pragmatics",
      "deliberation:logic",
      "deliberation:pragmatics",
      "controlled-deliberation",
      "issue-artifact:finding-ledger",
      "issue-artifact:finding-relation-graph",
      "issue-artifact:issue-ledger",
      "issue-artifact:issue-stance-matrix",
      "issue-artifact:deliberation-plan",
      "issue-artifact:problem-framing",
      "synthesize",
    ];
    await writeYamlDocument(reviewContextManifestPath, {
      schema_version: "1",
      producer: "onto-review-runtime",
      producer_version: "test",
      settings_schema_version: "1",
      domain_registry_version: "test",
      alignment_contract_version: "test",
      lifecycle_state: "dispatched",
      session_id: path.basename(sessionRoot),
      target_refs: [materializedInputPath],
      domain_binding_ref: "",
      review_value_alignment_criteria_ref: "",
      actor_consumer_bindings_ref: "",
      context_sources: [
        {
          context_source_id: "target",
          source_kind: "materialized_input",
          source_ref: materializedInputPath,
          source_sha256: sha256File(materializedInputPath),
          required: true,
          sensitivity: "internal",
          allowed_consumers: allowedConsumers,
        },
      ],
      derived_context_access_matrix: Object.fromEntries(
        allowedConsumers.map((consumerId) => [consumerId, ["target"]]),
      ),
      packet_refs: staticPacketRefs.map((ref) => ({
        ...ref,
        packet_sha256: sha256File(ref.packet_ref),
        consumed_context_refs: ["target"],
        forbidden_context_refs: [],
      })),
      validation_results: ["fixture_manifest_ready"],
      failure_record_refs: [],
    });

    const synthesizeOutputPath = path.join(sessionRoot, "synthesis-output.md");
    await writeYamlDocument(bindingPath, {
      resolved_target_scope: {
        kind: "file",
        resolved_refs: [materializedInputPath],
      },
      domain_final_selection: {
        recommendation: "none",
        final_value: "none",
        selection_mode: "not_requested",
      },
      resolved_session_domain: "none",
      resolved_execution_realization: "worker",
      resolved_host_runtime: "codex",
      resolved_review_mode: "core-axis",
      resolved_lens_set: ["logic", "pragmatics"],
      session_id: path.basename(sessionRoot),
      session_root: sessionRoot,
      round1_root: round1Root,
      execution_preparation_root: executionPreparationRoot,
      execution_plan_path: path.join(sessionRoot, "execution-plan.yaml"),
      session_metadata_path: sessionMetadataPath,
      interpretation_artifact_path: interpretationPath,
      binding_output_path: bindingPath,
      target_snapshot_path: targetSnapshotPath,
      target_snapshot_manifest_path: targetSnapshotManifestPath,
      review_target_profile_path: reviewTargetProfilePath,
      materialized_input_path: materializedInputPath,
      context_candidate_assembly_path: contextCandidateAssemblyPath,
      review_context_manifest_path: reviewContextManifestPath,
      synthesis_output_path: synthesizeOutputPath,
      finding_ledger_path: findingLedgerPath,
      finding_relation_graph_path: findingRelationGraphPath,
      issue_ledger_path: issueLedgerPath,
      issue_stance_matrix_path: issueStanceMatrixPath,
      deliberation_plan_path: deliberationPlanPath,
      problem_framing_path: problemFramingPath,
      deliberation_mode: "controlled-lens-deliberation",
      deliberation_root_path: deliberationRoot,
      deliberation_output_path: path.join(sessionRoot, "deliberation.md"),
      execution_result_path: path.join(sessionRoot, "execution-result.yaml"),
      error_log_path: path.join(sessionRoot, "error-log.md"),
      review_record_path: path.join(sessionRoot, "review-record.yaml"),
      final_output_path: path.join(sessionRoot, "final-output.md"),
      boundary_policy: {
        web_research_policy: "denied",
        repo_exploration_policy: parentRepoExplorationPolicy,
        recursive_reference_expansion_policy: "denied",
        filesystem_scope: { allowed_roots: [projectRoot] },
        write_policy: {
          source_mutation_policy: "denied",
          allowed_output_refs: [sessionRoot],
        },
        provenance_policy: {
          extra_exploration_citation_required: false,
          web_source_citation_required: false,
        },
      },
      boundary_presentation: {
        role_definition_presentation: "embedded_and_ref",
        primary_target_presentation: "embedded_and_ref",
        required_context_presentation: "ref_only",
        output_seat_presentation: "declared",
        control_policy_presentation: "declared",
      },
      boundary_enforcement_profile: {
        prompt_boundary_enforcement: "prompt_declared_only",
        filesystem_boundary_enforcement: "prompt_declared_only",
        network_boundary_enforcement: "prompt_declared_only",
        write_boundary_enforcement: "prompt_declared_only",
      },
      effective_boundary_state: {
        web_research: BOUNDARY_DECISION,
        repo_exploration: parentRepoExplorationDecision,
        recursive_reference_expansion: BOUNDARY_DECISION,
        source_mutation: BOUNDARY_DECISION,
        filesystem_scope: {
          requested_allowed_roots: [projectRoot],
          effective_allowed_roots: [projectRoot],
          guarantee_level: "prompt_declared_only",
          notes: [],
        },
      },
      binding_notes: [],
    });
    await writeYamlDocument(
      path.join(sessionRoot, "execution-plan.yaml"),
      {
        session_id: path.basename(sessionRoot),
        session_root: sessionRoot,
        execution_realization: "worker",
        host_runtime: "codex",
        review_mode: "core-axis",
        interpretation_artifact_path: interpretationPath,
        binding_output_path: bindingPath,
        session_metadata_path: sessionMetadataPath,
        execution_preparation_root: executionPreparationRoot,
        review_context_manifest_path: reviewContextManifestPath,
        review_target_profile_path: reviewTargetProfilePath,
        round1_root: round1Root,
        lens_execution_seats: [
          {
            lens_id: "logic",
            output_path: path.join(round1Root, "logic.md"),
          },
          {
            lens_id: "pragmatics",
            output_path: path.join(round1Root, "pragmatics.md"),
          },
        ],
        prompt_packets_root: packetRoot,
        lens_prompt_packet_seats: [
          {
            lens_id: "logic",
            packet_path: path.join(packetRoot, "logic.prompt.md"),
            output_path: path.join(round1Root, "logic.md"),
          },
          {
            lens_id: "pragmatics",
            packet_path: path.join(packetRoot, "pragmatics.prompt.md"),
            output_path: path.join(round1Root, "pragmatics.md"),
          },
        ],
        issue_artifact_prompt_packet_seats: [
          {
            artifact_id: "finding-ledger",
            packet_path: path.join(packetRoot, "finding-ledger.prompt.md"),
            output_path: findingLedgerPath,
          },
          {
            artifact_id: "finding-relation-graph",
            packet_path: path.join(packetRoot, "finding-relation-graph.prompt.md"),
            output_path: findingRelationGraphPath,
          },
          {
            artifact_id: "issue-ledger",
            packet_path: path.join(packetRoot, "issue-ledger.prompt.md"),
            output_path: issueLedgerPath,
          },
          {
            artifact_id: "issue-stance-matrix",
            packet_path: path.join(packetRoot, "issue-stance-matrix.prompt.md"),
            output_path: issueStanceMatrixPath,
          },
          {
            artifact_id: "deliberation-plan",
            packet_path: path.join(packetRoot, "deliberation-plan.prompt.md"),
            output_path: deliberationPlanPath,
          },
          {
            artifact_id: "problem-framing",
            packet_path: path.join(packetRoot, "problem-framing.prompt.md"),
            output_path: problemFramingPath,
          },
        ],
        lens_deliberation_prompt_packet_seats: [
          {
            lens_id: "logic",
            packet_path: path.join(packetRoot, "logic.deliberation.prompt.md"),
            output_path: path.join(deliberationRound1Root, "logic-deliberation.md"),
          },
          {
            lens_id: "pragmatics",
            packet_path: path.join(packetRoot, "pragmatics.deliberation.prompt.md"),
            output_path: path.join(deliberationRound1Root, "pragmatics-deliberation.md"),
          },
        ],
        teamlead_deliberation_prompt_packet_path: path.join(
          packetRoot,
          "controlled-deliberation.prompt.md",
        ),
        synthesize_prompt_packet_path: path.join(packetRoot, "synthesize.prompt.md"),
        synthesis_output_path: synthesizeOutputPath,
        finding_ledger_path: findingLedgerPath,
        finding_relation_graph_path: findingRelationGraphPath,
        issue_ledger_path: issueLedgerPath,
        issue_stance_matrix_path: issueStanceMatrixPath,
        deliberation_plan_path: deliberationPlanPath,
        problem_framing_path: problemFramingPath,
        deliberation_mode: "controlled-lens-deliberation",
        deliberation_root_path: deliberationRoot,
        deliberation_output_path: path.join(sessionRoot, "deliberation.md"),
        execution_result_path: path.join(sessionRoot, "execution-result.yaml"),
        error_log_path: path.join(sessionRoot, "error-log.md"),
        final_output_path: path.join(sessionRoot, "final-output.md"),
        review_record_path: path.join(sessionRoot, "review-record.yaml"),
        boundary_policy: {
          web_research_policy: "denied",
          repo_exploration_policy: parentRepoExplorationPolicy,
          recursive_reference_expansion_policy: "denied",
          filesystem_scope: { allowed_roots: [projectRoot] },
          write_policy: {
            source_mutation_policy: "denied",
            allowed_output_refs: [sessionRoot],
          },
          provenance_policy: {
            extra_exploration_citation_required: false,
            web_source_citation_required: false,
          },
        },
        boundary_presentation: { web_research: "denied", repo_exploration: "denied", recursive_reference_expansion: "denied", source_mutation: "denied" },
        boundary_enforcement_profile: {
          prompt_boundary_enforcement: "prompt_declared_only",
          filesystem_boundary_enforcement: "prompt_declared_only",
          network_boundary_enforcement: "prompt_declared_only",
          write_boundary_enforcement: "prompt_declared_only",
        },
        effective_boundary_state: {
          web_research: BOUNDARY_DECISION,
          repo_exploration: parentRepoExplorationDecision,
          recursive_reference_expansion: BOUNDARY_DECISION,
          source_mutation: BOUNDARY_DECISION,
          filesystem_scope: { requested_allowed_roots: [projectRoot], effective_allowed_roots: [projectRoot], guarantee_level: "prompt_declared_only", notes: [] },
        },
      },
    );

    return { sessionRoot, synthesizeOutputPath };
  }

  /** Always-succeed executor script (for lenses). */
  function createSucceedScript(
    dir: string,
    options?: {
      hangUnitId?: string;
      failUnitId?: string;
      malformedLensIds?: string[];
      malformedYamlLensIds?: string[];
      malformedDeliberationIds?: string[];
      controlledDeliberationMode?: "missing-status" | "missing-heading";
      stdoutMetadata?: Record<string, unknown>;
    },
  ): string {
    const scriptPath = path.join(dir, "succeed-executor.mjs");
    fs.writeFileSync(scriptPath, `
import fs from "node:fs";
import path from "node:path";
const args = process.argv.slice(2);
const unitId = args[args.indexOf("--unit-id") + 1];
const unitKind = args[args.indexOf("--unit-kind") + 1];
const sessionRoot = args[args.indexOf("--session-root") + 1];
const sessionId = path.basename(sessionRoot);
const outputPath = args[args.indexOf("--output-path") + 1];
const synthesizeOutput = ${JSON.stringify(SYNTHESIZE_OUTPUT)};
const controlledDeliberationOutput = ${JSON.stringify(CONTROLLED_DELIBERATION_OUTPUT)};
const lensDeliberationOutput = ${JSON.stringify(LENS_DELIBERATION_OUTPUT)};
const hangUnitId = ${JSON.stringify(options?.hangUnitId ?? null)};
const failUnitId = ${JSON.stringify(options?.failUnitId ?? null)};
const malformedLensIds = ${JSON.stringify(options?.malformedLensIds ?? [])};
const malformedYamlLensIds = ${JSON.stringify(options?.malformedYamlLensIds ?? [])};
const malformedDeliberationIds = ${JSON.stringify(options?.malformedDeliberationIds ?? [])};
const controlledDeliberationMode = ${JSON.stringify(options?.controlledDeliberationMode ?? null)};
const stdoutMetadata = ${JSON.stringify(options?.stdoutMetadata ?? null)};
if (hangUnitId && unitId === hangUnitId) {
  setInterval(() => {}, 1000);
}
if (failUnitId && unitId === failUnitId) {
  process.stderr.write("Simulated failure for " + unitId + "\\n");
  process.exit(1);
}
function issueArtifactOutput(artifactId) {
  if (artifactId === "finding-ledger") {
    return "schema_version: 1\\nsession_id: " + sessionId + "\\nfindings:\\n  - finding_id: finding-001\\n    lens_id: logic\\n    source_ref: round1/logic.md#finding-1\\n    target: mock-target\\n    evidence_anchor: mock-anchor\\n    claim: mock finding\\n    proposed_action: none\\n    affected_purpose: declared review purpose\\n    failure_condition: mock supported path\\n    impact: mock finding does not make the declared purpose unsafe\\n    evidence_refs: [round1/logic.md#finding-1]\\n    severity: low\\n    domain_threshold_used: null\\nvalidation:\\n  unaddressable_findings: []\\n";
  }
  if (artifactId === "finding-relation-graph") {
    return "schema_version: 1\\nsession_id: " + sessionId + "\\nrelations: []\\nsingleton_findings:\\n  - finding_id: finding-001\\n    reason: mock singleton\\n";
  }
  if (artifactId === "issue-ledger") {
    return "schema_version: 1\\nsession_id: " + sessionId + "\\nissues:\\n  - issue_id: issue-001\\n    root_cause_hypothesis: mock root\\n    root_confidence: low\\n    surface_finding_ids: [finding-001]\\n    relation_refs: []\\n    raised_by_lens_ids: [logic]\\n    issue_statement: mock issue\\n    proposed_action: none\\n    affected_purpose: declared review purpose\\n    failure_condition: mock supported path\\n    impact: mock issue does not make the declared purpose unsafe\\n    evidence_refs: [round1/logic.md#finding-1]\\n    severity: low\\n    domain_threshold_used: null\\n    singleton_reason: mock singleton\\nvalidation:\\n  unclustered_finding_ids: []\\n";
  }
  if (artifactId === "issue-stance-matrix") {
    return "schema_version: 1\\nsession_id: " + sessionId + "\\nissues:\\n  - issue_id: issue-001\\n    stances:\\n      - lens_id: logic\\n        stance: support\\n        rationale: mock stance\\n        root_hypothesis_position: accepts\\n        severity_position: keeps\\n        evidence_refs: [round1/logic.md]\\n      - lens_id: pragmatics\\n        stance: support\\n        rationale: mock stance\\n        root_hypothesis_position: accepts\\n        severity_position: keeps\\n        evidence_refs: [round1/pragmatics.md]\\nvalidation:\\n  missing_stances: []\\n";
  }
  if (artifactId === "deliberation-plan") {
    return "schema_version: 1\\nsession_id: " + sessionId + "\\nplanned_issues: []\\nskipped_issues:\\n  - issue_id: issue-001\\n    reason: no material conflict\\n";
  }
  if (artifactId === "problem-framing") {
    return "schema_version: 1\\nsession_id: " + sessionId + "\\nclassification_context:\\n  common_spine_version: 1\\n  session_domain: none\\n  domain_profile_ref: \\"\\"\\n  domain_profile_doc_type: custom:problem_framing_profile\\n  domain_profile_status: not_requested\\nclassifications:\\n  - issue_id: issue-001\\n    problem_definition: mock problem\\n    issue_role: independent_issue\\n    judgment_state: observed\\n    impact_kind: maintainability_evolvability\\n    timing_class: defer_watch\\n    closure_class: watch\\n    closure_obligation: out_of_scope\\n    domain_axes: {}\\n    rationale: mock rationale\\n    related_surface_finding_ids: [finding-001]\\n";
  }
  throw new Error("unsupported issue artifact: " + artifactId);
}
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const output = unitKind === "issue_artifact"
  ? issueArtifactOutput(unitId)
  : unitKind === "synthesize"
  ? synthesizeOutput
  : unitKind === "deliberation" && unitId === "controlled-deliberation" && controlledDeliberationMode === "missing-status"
    ? "---\\ndeliberation_status: not_performed\\n---\\n# Controlled Deliberation\\n\\n## Consensus\\nMock.\\n\\n## Conditional Consensus\\nNone.\\n\\n## Disagreement\\nNone.\\n\\n## Deliberation Decision\\nNone.\\n\\n## Axiology-Proposed Additional Perspectives\\nNone.\\n\\n## Purpose Alignment Verification\\nAligned.\\n\\n## Immediate Actions Required\\nNone.\\n\\n## Recommendations\\nNone.\\n\\n## Unique Finding Tagging\\nNone.\\n"
  : unitKind === "deliberation" && unitId === "controlled-deliberation" && controlledDeliberationMode === "missing-heading"
    ? "---\\ndeliberation_status: performed\\n---\\n# Controlled Deliberation\\n\\n## Consensus\\nMock.\\n\\n## Conditional Consensus\\nNone.\\n\\n## Disagreement\\nNone.\\n\\n## Deliberation Decision\\nNone.\\n\\n## Axiology-Proposed Additional Perspectives\\nNone.\\n\\n## Purpose Alignment Verification\\nAligned.\\n\\n## Immediate Actions Required\\nNone.\\n\\n## Recommendations\\nNone.\\n"
  : unitKind === "deliberation" && unitId === "controlled-deliberation"
    ? controlledDeliberationOutput
  : unitKind === "deliberation" && malformedDeliberationIds.includes(unitId)
    ? "# Lens Deliberation Response\\n\\n## Re-evaluation Summary\\nBroken.\\n"
  : unitKind === "deliberation"
    ? lensDeliberationOutput
  : unitKind === "lens" && malformedLensIds.includes(unitId)
    ? "# " + unitId + "\\nMalformed lens output.\\n"
  : unitKind === "lens" && malformedYamlLensIds.includes(unitId)
    ? "# " + unitId + "\\nLens result.\\n\\n### Domain Constraints Used\\nsource_doc: fixture\\nsource_version_or_snapshot_id: test\\nanchor: none\\n\\n### Domain Context Assumptions\\n- none\\n"
  : "# " + unitId + "\\nLens result.\\n\\n### Domain Constraints Used\\n- source_doc: fixture\\n  source_version_or_snapshot_id: test\\n  anchor: none\\n\\n### Domain Context Assumptions\\n- none\\n";
fs.writeFileSync(outputPath, output, "utf8");
if (stdoutMetadata) {
  console.log(JSON.stringify(stdoutMetadata));
}
`, "utf8");
    return scriptPath;
  }

  function createFakeNestedCodexBin(
    dir: string,
    options?: {
      malformedYamlLensIds?: string[];
    },
  ): string {
    const binDir = path.join(dir, "bin");
    fs.mkdirSync(binDir, { recursive: true });
    const scriptPath = path.join(binDir, "codex");
    fs.writeFileSync(scriptPath, `#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const prompt = fs.readFileSync(0, "utf8");
const malformedYamlLensIds = new Set(${JSON.stringify(options?.malformedYamlLensIds ?? [])});
const entries = [];
for (const match of prompt.matchAll(/^  '([^']+)'$/gm)) {
  entries.push(match[1]);
}
const lensResults = [];
for (const entry of entries) {
  const [lensId, packetPath, outputPath] = entry.split("|");
  if (!lensId || !packetPath || !outputPath) continue;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const output = malformedYamlLensIds.has(lensId)
    ? "# " + lensId + "\\nLens result.\\n\\n### Domain Constraints Used\\nsource_doc: fixture\\nsource_version_or_snapshot_id: test\\nanchor: none\\n\\n### Domain Context Assumptions\\n- none\\n"
    : "# " + lensId + "\\nLens result.\\n\\n### Domain Constraints Used\\n- source_doc: fixture\\n  source_version_or_snapshot_id: test\\n  anchor: none\\n\\n### Domain Context Assumptions\\n- none\\n";
  fs.writeFileSync(outputPath, output, "utf8");
  lensResults.push({ lens_id: lensId, status: "ok" });
}
console.log("LENS_DISPATCH_SUMMARY:" + JSON.stringify({ lens_results: lensResults }));
`, "utf8");
    fs.chmodSync(scriptPath, 0o755);
    return binDir;
  }

  function nestedWorkersProfile() {
    return {
      mode: "nested-workers",
      teamlead: { seat: "worker" },
      lens: { seat: "worker" },
      synthesize: { seat: "worker" },
      deliberation: "controlled-lens-deliberation",
      worker_executor: "codex",
      host: "codex",
      trace: [],
    } as const;
  }

  type BoundaryDetailsPayload = {
    unit_boundary?: {
      authority?: string;
      web_research_policy?: string;
      repo_exploration_policy?: string;
      recursive_reference_expansion_policy?: string;
      filesystem_scope?: { allowed_roots?: string[] };
      source_mutation_policy?: string;
      read_authority?: {
        repo_exploration_policy?: string;
        allowed_read_refs?: string[];
      };
      boundary_enforcement_profile?: BoundaryEnforcementProfilePayload;
      output_seat?: {
        output_path?: string;
        allowed_output_refs?: string[];
      };
    };
    parent_boundary_context?: {
      authority?: string;
      boundary_policy?: {
        web_research_policy?: string;
        repo_exploration_policy?: string;
        recursive_reference_expansion_policy?: string;
        filesystem_scope?: { allowed_roots?: string[] };
        write_policy?: {
          source_mutation_policy?: string;
          allowed_output_refs?: string[];
        };
      };
      effective_boundary_state?: {
        web_research?: { requested_policy?: string; effective_policy?: string };
        repo_exploration?: { requested_policy?: string; effective_policy?: string };
        recursive_reference_expansion?: {
          requested_policy?: string;
          effective_policy?: string;
        };
        source_mutation?: { requested_policy?: string; effective_policy?: string };
        filesystem_scope?: {
          requested_allowed_roots?: string[];
          effective_allowed_roots?: string[];
        };
      };
      boundary_enforcement_profile?: BoundaryEnforcementProfilePayload;
    };
  };

  type BoundaryEnforcementProfilePayload = {
    prompt_boundary_enforcement?: string;
    filesystem_boundary_enforcement?: string;
    network_boundary_enforcement?: string;
    write_boundary_enforcement?: string;
  };

  type ParentBoundaryContextPayload = NonNullable<
    BoundaryDetailsPayload["parent_boundary_context"]
  > & {
    boundary_policy: NonNullable<
      BoundaryDetailsPayload["parent_boundary_context"]
    >["boundary_policy"];
    effective_boundary_state: NonNullable<
      BoundaryDetailsPayload["parent_boundary_context"]
    >["effective_boundary_state"];
  };

  function assertBoundaryEnforcementProfile(
    profile: BoundaryEnforcementProfilePayload | undefined,
    label: string,
  ): void {
    assertEqual(
      profile?.prompt_boundary_enforcement,
      "prompt_declared_only",
      `${label} prompt boundary enforcement preserved`,
    );
    assertEqual(
      profile?.filesystem_boundary_enforcement,
      "prompt_declared_only",
      `${label} filesystem boundary enforcement preserved`,
    );
    assertEqual(
      profile?.network_boundary_enforcement,
      "prompt_declared_only",
      `${label} network boundary enforcement preserved`,
    );
    assertEqual(
      profile?.write_boundary_enforcement,
      "prompt_declared_only",
      `${label} write boundary enforcement preserved`,
    );
  }

  function assertParentBoundaryContext(args: {
    context: ParentBoundaryContextPayload | undefined;
    sessionRoot: string;
    expectedRepoExplorationPolicy?: "allowed" | "denied";
  }): void {
    const context = args.context;
    const expectedRepoExplorationPolicy =
      args.expectedRepoExplorationPolicy ?? "denied";
    assertEqual(
      context?.authority,
      "diagnostic_parent_context",
      "parent boundary context is diagnostic",
    );
    assertEqual(
      context?.boundary_policy?.web_research_policy,
      "denied",
      "parent boundary policy web research denied",
    );
    assertEqual(
      context?.boundary_policy?.repo_exploration_policy,
      expectedRepoExplorationPolicy,
      "parent boundary policy repo exploration preserved",
    );
    assertEqual(
      context?.boundary_policy?.recursive_reference_expansion_policy,
      "denied",
      "parent boundary policy recursive expansion denied",
    );
    assert(
      context?.boundary_policy?.filesystem_scope?.allowed_roots?.includes(projectRoot) === true,
      "parent boundary policy filesystem allowed roots preserved",
    );
    assertEqual(
      context?.boundary_policy?.write_policy?.source_mutation_policy,
      "denied",
      "parent boundary policy source mutation denied",
    );
    assert(
      context?.boundary_policy?.write_policy?.allowed_output_refs?.includes(args.sessionRoot) ===
        true,
      "parent boundary policy write refs preserved",
    );

    assertEqual(
      context?.effective_boundary_state?.web_research?.requested_policy,
      "denied",
      "parent effective web research requested policy preserved",
    );
    assertEqual(
      context?.effective_boundary_state?.web_research?.effective_policy,
      "denied",
      "parent effective web research policy preserved",
    );
    assertEqual(
      context?.effective_boundary_state?.repo_exploration?.requested_policy,
      expectedRepoExplorationPolicy,
      "parent effective repo exploration requested policy preserved",
    );
    assertEqual(
      context?.effective_boundary_state?.repo_exploration?.effective_policy,
      expectedRepoExplorationPolicy,
      "parent effective repo exploration policy preserved",
    );
    assertEqual(
      context?.effective_boundary_state?.recursive_reference_expansion?.requested_policy,
      "denied",
      "parent effective recursive expansion requested policy preserved",
    );
    assertEqual(
      context?.effective_boundary_state?.recursive_reference_expansion?.effective_policy,
      "denied",
      "parent effective recursive expansion policy preserved",
    );
    assertEqual(
      context?.effective_boundary_state?.source_mutation?.requested_policy,
      "denied",
      "parent effective source mutation requested policy preserved",
    );
    assertEqual(
      context?.effective_boundary_state?.source_mutation?.effective_policy,
      "denied",
      "parent effective source mutation policy preserved",
    );
    assert(
      context?.effective_boundary_state?.filesystem_scope?.requested_allowed_roots?.includes(
        projectRoot,
      ) === true,
      "parent effective filesystem requested roots preserved",
    );
    assert(
      context?.effective_boundary_state?.filesystem_scope?.effective_allowed_roots?.includes(
        projectRoot,
      ) === true,
      "parent effective filesystem allowed roots preserved",
    );
    assertBoundaryEnforcementProfile(
      context?.boundary_enforcement_profile,
      "parent boundary context",
    );
  }

  type UnitBoundaryPayload = NonNullable<BoundaryDetailsPayload["unit_boundary"]>;

  function assertUnitBoundary(args: {
    unitBoundary: UnitBoundaryPayload | undefined;
    expectedOutputPath: string;
    expectedReadRefs?: string[];
  }): void {
    const unitBoundary = args.unitBoundary;
    assertEqual(
      unitBoundary?.authority,
      "authoritative_unit_boundary",
      "unit boundary is authoritative",
    );
    assertEqual(
      unitBoundary?.web_research_policy,
      "denied",
      "unit boundary web research denied",
    );
    assertEqual(
      unitBoundary?.repo_exploration_policy,
      "denied",
      "unit boundary repo exploration denied",
    );
    assertEqual(
      unitBoundary?.read_authority?.repo_exploration_policy,
      "denied",
      "unit boundary read authority repo exploration denied",
    );
    if (args.expectedReadRefs !== undefined) {
      for (const expectedReadRef of args.expectedReadRefs) {
        const expectedReadRefCandidates = [
          expectedReadRef,
          toRelativePath(expectedReadRef, projectRoot),
        ];
        assert(
          expectedReadRefCandidates.some(
            (candidate) =>
              unitBoundary?.read_authority?.allowed_read_refs?.includes(candidate) ===
              true,
          ),
          `unit boundary includes allowed read ref ${expectedReadRef}`,
        );
      }
    }
    assertEqual(
      unitBoundary?.recursive_reference_expansion_policy,
      "denied",
      "unit boundary recursive expansion denied",
    );
    const expectedAllowedRootCandidates = [projectRoot, toRelativePath(projectRoot, projectRoot)];
    assert(
      expectedAllowedRootCandidates.some(
        (candidate) =>
          unitBoundary?.filesystem_scope?.allowed_roots?.includes(candidate) === true,
      ),
      "unit boundary filesystem allowed roots preserved",
    );
    assertEqual(
      unitBoundary?.source_mutation_policy,
      "denied",
      "unit boundary source mutation denied",
    );
    assertBoundaryEnforcementProfile(
      unitBoundary?.boundary_enforcement_profile,
      "unit boundary",
    );
    const expectedOutputPathCandidates = [
      args.expectedOutputPath,
      toRelativePath(args.expectedOutputPath, projectRoot),
    ];
    assertEqual(
      expectedOutputPathCandidates.includes(
        unitBoundary?.output_seat?.output_path ?? "",
      ),
      true,
      "output seat path is specific",
    );
    assertEqual(
      unitBoundary?.output_seat?.allowed_output_refs?.length,
      1,
      "output seat has one allowed output ref",
    );
    assert(
      expectedOutputPathCandidates.includes(
        unitBoundary?.output_seat?.allowed_output_refs?.[0] ?? "",
      ),
      "output seat allows only current output ref",
    );
  }

  function parseBoundaryDetailsPayload(
    promptText: string,
    heading = "Unit Boundary Details",
  ): BoundaryDetailsPayload {
    const headingStart = promptText.indexOf(`## ${heading}`);
    assert(headingStart >= 0, `${heading} heading present`);
    const fenceStart = promptText.indexOf("```json", headingStart);
    assert(fenceStart >= 0, `${heading} JSON fence present`);
    const jsonStart = promptText.indexOf("\n", fenceStart);
    assert(jsonStart >= 0, `${heading} JSON body present`);
    const fenceEnd = promptText.indexOf("```", jsonStart + 1);
    assert(fenceEnd >= 0, `${heading} JSON fence closed`);
    return JSON.parse(promptText.slice(jsonStart + 1, fenceEnd).trim());
  }

  function assertBoundaryDetailsPayload(args: {
    promptText: string;
    expectedOutputPath: string;
    sessionRoot: string;
    expectedParentRepoExplorationPolicy?: "allowed" | "denied";
    expectedReadRefs?: string[];
    heading?: string;
  }): void {
    const payload = parseBoundaryDetailsPayload(args.promptText, args.heading);
    assertUnitBoundary({
      unitBoundary: payload.unit_boundary,
      expectedOutputPath: args.expectedOutputPath,
      expectedReadRefs: args.expectedReadRefs,
    });
    assertParentBoundaryContext({
      context: payload.parent_boundary_context as ParentBoundaryContextPayload | undefined,
      sessionRoot: args.sessionRoot,
      expectedRepoExplorationPolicy: args.expectedParentRepoExplorationPolicy,
    });
  }

  /** Flaky synthesize executor: tracks attempts via counter file. */
  function createSynthFlakyScript(
    dir: string,
    mode:
      | "fail-then-succeed"
      | "always-fail"
      | "contract-break"
      | "wrong-participation"
      | "fenced-headings-only"
      | "empty-boundary-notes"
      | "missing-boundary-notes"
      | "missing-output"
      | "missing-status"
      | "inline-empty-error",
  ): { scriptPath: string; counterPath: string } {
    const scriptPath = path.join(dir, "synth-flaky.mjs");
    const counterPath = path.join(dir, "synth-counter.txt");
    fs.writeFileSync(scriptPath, `
import fs from "node:fs";
import path from "node:path";
const args = process.argv.slice(2);
const unitKind = args[args.indexOf("--unit-kind") + 1];
const unitId = args[args.indexOf("--unit-id") + 1];
const sessionRoot = args[args.indexOf("--session-root") + 1];
const sessionId = path.basename(sessionRoot);
const outputPath = args[args.indexOf("--output-path") + 1];
const counterPath = ${JSON.stringify(counterPath)};
const mode = ${JSON.stringify(mode)};
const synthesizeOutput = ${JSON.stringify(SYNTHESIZE_OUTPUT)};
const controlledDeliberationOutput = ${JSON.stringify(CONTROLLED_DELIBERATION_OUTPUT)};
const lensDeliberationOutput = ${JSON.stringify(LENS_DELIBERATION_OUTPUT)};
function issueArtifactOutput(artifactId) {
  if (artifactId === "finding-ledger") {
    return "schema_version: 1\\nsession_id: " + sessionId + "\\nfindings:\\n  - finding_id: finding-001\\n    lens_id: logic\\n    source_ref: round1/logic.md#finding-1\\n    target: mock-target\\n    evidence_anchor: mock-anchor\\n    claim: mock finding\\n    proposed_action: none\\n    affected_purpose: declared review purpose\\n    failure_condition: mock supported path\\n    impact: mock finding does not make the declared purpose unsafe\\n    evidence_refs: [round1/logic.md#finding-1]\\n    severity: low\\n    domain_threshold_used: null\\nvalidation:\\n  unaddressable_findings: []\\n";
  }
  if (artifactId === "finding-relation-graph") {
    return "schema_version: 1\\nsession_id: " + sessionId + "\\nrelations: []\\nsingleton_findings:\\n  - finding_id: finding-001\\n    reason: mock singleton\\n";
  }
  if (artifactId === "issue-ledger") {
    return "schema_version: 1\\nsession_id: " + sessionId + "\\nissues:\\n  - issue_id: issue-001\\n    root_cause_hypothesis: mock root\\n    root_confidence: low\\n    surface_finding_ids: [finding-001]\\n    relation_refs: []\\n    raised_by_lens_ids: [logic]\\n    issue_statement: mock issue\\n    proposed_action: none\\n    affected_purpose: declared review purpose\\n    failure_condition: mock supported path\\n    impact: mock issue does not make the declared purpose unsafe\\n    evidence_refs: [round1/logic.md#finding-1]\\n    severity: low\\n    domain_threshold_used: null\\n    singleton_reason: mock singleton\\nvalidation:\\n  unclustered_finding_ids: []\\n";
  }
  if (artifactId === "issue-stance-matrix") {
    return "schema_version: 1\\nsession_id: " + sessionId + "\\nissues:\\n  - issue_id: issue-001\\n    stances:\\n      - lens_id: logic\\n        stance: support\\n        rationale: mock stance\\n        root_hypothesis_position: accepts\\n        severity_position: keeps\\n        evidence_refs: [round1/logic.md]\\n      - lens_id: pragmatics\\n        stance: support\\n        rationale: mock stance\\n        root_hypothesis_position: accepts\\n        severity_position: keeps\\n        evidence_refs: [round1/pragmatics.md]\\nvalidation:\\n  missing_stances: []\\n";
  }
  if (artifactId === "deliberation-plan") {
    return "schema_version: 1\\nsession_id: " + sessionId + "\\nplanned_issues: []\\nskipped_issues:\\n  - issue_id: issue-001\\n    reason: no material conflict\\n";
  }
  if (artifactId === "problem-framing") {
    return "schema_version: 1\\nsession_id: " + sessionId + "\\nclassification_context:\\n  common_spine_version: 1\\n  session_domain: none\\n  domain_profile_ref: \\"\\"\\n  domain_profile_doc_type: custom:problem_framing_profile\\n  domain_profile_status: not_requested\\nclassifications:\\n  - issue_id: issue-001\\n    problem_definition: mock problem\\n    issue_role: independent_issue\\n    judgment_state: observed\\n    impact_kind: maintainability_evolvability\\n    timing_class: defer_watch\\n    closure_class: watch\\n    closure_obligation: out_of_scope\\n    domain_axes: {}\\n    rationale: mock rationale\\n    related_surface_finding_ids: [finding-001]\\n";
  }
  throw new Error("unsupported issue artifact: " + artifactId);
}
if (unitKind === "synthesize") {
  let count = 0;
  try { count = parseInt(fs.readFileSync(counterPath, "utf8").trim(), 10); } catch {}
  count++;
  fs.writeFileSync(counterPath, String(count), "utf8");
  if (mode === "contract-break") {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, "---\\ndeliberation_status: performed\\nparticipation:\\n  expected_lenses: []\\n  received_lenses: []\\n  missing_or_failed_lenses: []\\n  run_status: full\\n---\\n# Synthesize\\nMissing required sections.\\n", "utf8");
    process.exit(0);
  }
  if (mode === "wrong-participation") {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, "---\\ndeliberation_status: performed\\nparticipation:\\n  expected_lenses:\\n    - logic\\n  received_lenses:\\n    - logic\\n    - pragmatics\\n  missing_or_failed_lenses: []\\n  run_status: full\\n---\\n# Synthesize\\n\\n## Consensus\\nNone.\\n\\n## Conditional Consensus\\nNone.\\n\\n## Disagreement\\nNone.\\n\\n## Deliberation Decision\\nNone.\\n\\n## Axiology-Proposed Additional Perspectives\\nNone.\\n\\n## Purpose Alignment Verification\\nAligned.\\n\\n## Final Review Result\\nMock final result.\\n\\n## Boundary Notes\\nNone.\\n\\n## Immediate Actions Required\\nNone.\\n\\n## Recommendations\\nNone.\\n\\n## Unique Finding Tagging\\nNone.\\n", "utf8");
    process.exit(0);
  }
  if (mode === "missing-status") {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, "---\\ndeliberation_status: not_performed\\nparticipation:\\n  expected_lenses: []\\n  received_lenses: []\\n  missing_or_failed_lenses: []\\n  run_status: full\\n---\\n# Synthesize\\n\\n## Consensus\\nNone.\\n\\n## Conditional Consensus\\nNone.\\n\\n## Disagreement\\nNone.\\n\\n## Deliberation Decision\\nNone.\\n\\n## Axiology-Proposed Additional Perspectives\\nNone.\\n\\n## Purpose Alignment Verification\\nAligned.\\n\\n## Final Review Result\\nMock final result.\\n\\n## Immediate Actions Required\\nNone.\\n\\n## Recommendations\\nNone.\\n\\n## Unique Finding Tagging\\nNone.\\n", "utf8");
    process.exit(0);
  }
  if (mode === "missing-boundary-notes") {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, "---\\ndeliberation_status: performed\\nparticipation:\\n  expected_lenses: []\\n  received_lenses: []\\n  missing_or_failed_lenses: []\\n  run_status: full\\n---\\n# Synthesize\\n\\n## Consensus\\nNone.\\n\\n## Conditional Consensus\\nNone.\\n\\n## Disagreement\\nNone.\\n\\n## Deliberation Decision\\nNone.\\n\\n## Axiology-Proposed Additional Perspectives\\nNone.\\n\\n## Purpose Alignment Verification\\nAligned.\\n\\n## Final Review Result\\nMock final result.\\n\\n## Immediate Actions Required\\nNone.\\n\\n## Recommendations\\nNone.\\n\\n## Unique Finding Tagging\\nNone.\\n", "utf8");
    process.exit(0);
  }
  if (mode === "fenced-headings-only") {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, "---\\ndeliberation_status: performed\\nparticipation:\\n  expected_lenses: []\\n  received_lenses: []\\n  missing_or_failed_lenses: []\\n  run_status: full\\n---\\n# Synthesize\\n\\n\`\`\`md\\n## Consensus\\nNone.\\n\\n## Conditional Consensus\\nNone.\\n\\n## Disagreement\\nNone.\\n\\n## Deliberation Decision\\nNone.\\n\\n## Axiology-Proposed Additional Perspectives\\nNone.\\n\\n## Purpose Alignment Verification\\nAligned.\\n\\n## Final Review Result\\nMock final result.\\n\\n## Boundary Notes\\nNone.\\n\\n## Immediate Actions Required\\nNone.\\n\\n## Recommendations\\nNone.\\n\\n## Unique Finding Tagging\\nNone.\\n\`\`\`\\n", "utf8");
    process.exit(0);
  }
  if (mode === "empty-boundary-notes") {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, "---\\ndeliberation_status: performed\\nparticipation:\\n  expected_lenses: []\\n  received_lenses: []\\n  missing_or_failed_lenses: []\\n  run_status: full\\n---\\n# Synthesize\\n\\n## Consensus\\nNone.\\n\\n## Conditional Consensus\\nNone.\\n\\n## Disagreement\\nNone.\\n\\n## Deliberation Decision\\nNone.\\n\\n## Axiology-Proposed Additional Perspectives\\nNone.\\n\\n## Purpose Alignment Verification\\nAligned.\\n\\n## Final Review Result\\nMock final result.\\n\\n## Boundary Notes\\n\\n## Immediate Actions Required\\nNone.\\n\\n## Recommendations\\nNone.\\n\\n## Unique Finding Tagging\\nNone.\\n", "utf8");
    process.exit(0);
  }
  if (mode === "missing-output") {
    process.exit(0);
  }
  if (mode === "inline-empty-error") {
    process.stderr.write("Inline-HTTP executor produced empty output for unit synthesize (provider: openai, tool_mode: native).\\n");
    process.exit(1);
  }
  if (mode === "always-fail" || (mode === "fail-then-succeed" && count === 1)) {
    process.stderr.write("Simulated synthesize failure (attempt " + count + ")\\n");
    process.exit(1);
  }
}
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const output = unitKind === "issue_artifact"
  ? issueArtifactOutput(unitId)
  : unitKind === "synthesize"
  ? synthesizeOutput
  : unitKind === "deliberation" && unitId === "controlled-deliberation"
    ? controlledDeliberationOutput
  : unitKind === "deliberation"
    ? lensDeliberationOutput
  : "# " + unitId + "\\nLens.\\n\\n### Domain Constraints Used\\n- source_doc: fixture\\n  source_version_or_snapshot_id: test\\n  anchor: none\\n\\n### Domain Context Assumptions\\n- none\\n";
fs.writeFileSync(outputPath, output, "utf8");
`, "utf8");
    return { scriptPath, counterPath };
  }

  // ── D-1: synthesize succeeds on first attempt ──
  it("D-1: synthesize succeeds on first attempt", async () => {
    const { sessionRoot } = await buildMinimalSession("d1");
    const execDir = trackCleanup(makeTmpDir("d1-exec"));
    const succeedScript = createSucceedScript(execDir);

    const result = await executeReviewPromptExecution({
      projectRoot,
      sessionRoot,
      defaultExecutorConfig: { bin: "node", args: [succeedScript] },
    });

    assertEqual(result.synthesis_executed, true, "synthesis executed");
    assert(!result.halt_reason, "no halt");
    assertEqual(result.executed_lens_count, 2, "2 lenses");
  });

  // ── D-2: synthesize fails first, succeeds on retry ──
  it("D-2: synthesize fails then succeeds on retry", async () => {
    const { sessionRoot } = await buildMinimalSession("d2");
    const execDir = trackCleanup(makeTmpDir("d2-exec"));
    const succeedScript = createSucceedScript(execDir);
    const synthDir = path.join(execDir, "synth");
    fs.mkdirSync(synthDir, { recursive: true });
    const { scriptPath: synthScript, counterPath } =
      createSynthFlakyScript(synthDir, "fail-then-succeed");

    const result = await executeReviewPromptExecution({
      projectRoot,
      sessionRoot,
      defaultExecutorConfig: { bin: "node", args: [succeedScript] },
      synthesizeExecutorConfig: { bin: "node", args: [synthScript] },
    });

    assertEqual(result.synthesis_executed, true, "synthesis after retry");
    assert(!result.halt_reason, "no halt");
    const attempts = parseInt(fs.readFileSync(counterPath, "utf8").trim(), 10);
    assertEqual(attempts, 2, "2 attempts (1 fail + 1 success)");

    const errorLog = fs.readFileSync(path.join(sessionRoot, "error-log.md"), "utf8");
    assertIncludes(errorLog, "synthesize retry", "retry logged");
  });

  // ── D-3: synthesize fails both attempts → halt ──
  it("D-3: synthesize fails both attempts → halted", async () => {
    const { sessionRoot } = await buildMinimalSession("d3");
    const execDir = trackCleanup(makeTmpDir("d3-exec"));
    const succeedScript = createSucceedScript(execDir);
    const synthDir = path.join(execDir, "synth");
    fs.mkdirSync(synthDir, { recursive: true });
    const { scriptPath: synthScript, counterPath } =
      createSynthFlakyScript(synthDir, "always-fail");

    const result = await executeReviewPromptExecution({
      projectRoot,
      sessionRoot,
      defaultExecutorConfig: { bin: "node", args: [succeedScript] },
      synthesizeExecutorConfig: { bin: "node", args: [synthScript] },
    });

    assertEqual(result.synthesis_executed, false, "synthesis failed");
    assert(typeof result.halt_reason === "string" && result.halt_reason.length > 0, "halt_reason present");
    assertIncludes(result.halt_reason!, "Synthesize execution failed", "halt reason");
    const attempts = parseInt(fs.readFileSync(counterPath, "utf8").trim(), 10);
    assertEqual(attempts, 2, "2 attempts before halt");
  });

  // ── D-4: execution-result artifact written on synthesize halt ──
  it("D-4: execution-result artifact written on synth halt", async () => {
    const { sessionRoot } = await buildMinimalSession("d4");
    const execDir = trackCleanup(makeTmpDir("d4-exec"));
    const succeedScript = createSucceedScript(execDir);
    const synthDir = path.join(execDir, "synth");
    fs.mkdirSync(synthDir, { recursive: true });
    const { scriptPath: synthScript } = createSynthFlakyScript(synthDir, "always-fail");

    await executeReviewPromptExecution({
      projectRoot,
      sessionRoot,
      defaultExecutorConfig: { bin: "node", args: [succeedScript] },
      synthesizeExecutorConfig: { bin: "node", args: [synthScript] },
    });

    const resultPath = path.join(sessionRoot, "execution-result.yaml");
    assert(fs.existsSync(resultPath), "execution-result.yaml created");
    const resultText = fs.readFileSync(resultPath, "utf8");
    assertIncludes(resultText, "halted_partial", "status is halted_partial");
    assertIncludes(resultText, "Synthesize execution failed", "halt_reason in artifact");
    const degradationSummaryPath = path.join(sessionRoot, "degradation-summary.yaml");
    assert(fs.existsSync(degradationSummaryPath), "degradation-summary.yaml created");
    const degradationSummary = await readYamlDocument<{
      execution_status?: string;
      degradation_kinds?: string[];
      halt_phase?: string | null;
      failed_units?: Array<{ unit_id?: string; unit_kind?: string }>;
    }>(degradationSummaryPath);
    assertEqual(
      degradationSummary.execution_status,
      "halted_partial",
      "degradation summary status",
    );
    assert(
      degradationSummary.degradation_kinds?.includes("halted_partial") === true,
      "halt degradation kind recorded",
    );
    assert(
      degradationSummary.degradation_kinds?.includes("unit_failure") === true,
      "unit failure degradation kind recorded",
    );
    assertEqual(degradationSummary.halt_phase, "synthesize", "summary halt phase");
    assert(
      degradationSummary.failed_units?.some((unit) => unit.unit_id === "synthesize") === true,
      "summary failed unit recorded",
    );
  });

  // ── D-5: successful retry still produces correct execution-result ──
  it("D-5: successful retry produces correct execution-result", async () => {
    const { sessionRoot } = await buildMinimalSession("d5");
    const execDir = trackCleanup(makeTmpDir("d5-exec"));
    const succeedScript = createSucceedScript(execDir);
    const synthDir = path.join(execDir, "synth");
    fs.mkdirSync(synthDir, { recursive: true });
    const { scriptPath: synthScript } = createSynthFlakyScript(synthDir, "fail-then-succeed");

    const result = await executeReviewPromptExecution({
      projectRoot,
      sessionRoot,
      defaultExecutorConfig: { bin: "node", args: [succeedScript] },
      synthesizeExecutorConfig: { bin: "node", args: [synthScript] },
    });

    assertEqual(result.synthesis_executed, true, "synthesis executed");
    const resultPath = path.join(sessionRoot, "execution-result.yaml");
    assert(fs.existsSync(resultPath), "execution-result.yaml created");
    const resultText = fs.readFileSync(resultPath, "utf8");
    assertIncludes(resultText, "completed", "status is completed");
    assertNotIncludes(resultText, "halted_partial", "not halted");
    assert(
      !fs.existsSync(path.join(sessionRoot, "degradation-summary.yaml")),
      "no degradation summary for completed run",
    );
  });

  it("D-5a: preserved synthesize output is revalidated during continuation", async () => {
    const { sessionRoot, synthesizeOutputPath } = await buildMinimalSession("d5a");
    const execDir = trackCleanup(makeTmpDir("d5a-exec"));
    const succeedScript = createSucceedScript(execDir);

    const firstRun = await executeReviewPromptExecution({
      projectRoot,
      sessionRoot,
      defaultExecutorConfig: { bin: "node", args: [succeedScript] },
    });
    assertEqual(firstRun.synthesis_executed, true, "initial synthesis executed");

    fs.writeFileSync(
      synthesizeOutputPath,
      [
        "---",
        "deliberation_status: performed",
        "participation:",
        "  expected_lenses:",
        "    - logic",
        "  received_lenses:",
        "    - logic",
        "    - pragmatics",
        "  missing_or_failed_lenses: []",
        "  run_status: full",
        "---",
        "# Synthesize",
        "",
        "## Consensus",
        "None.",
        "",
        "## Conditional Consensus",
        "None.",
        "",
        "## Disagreement",
        "None.",
        "",
        "## Deliberation Decision",
        "None.",
        "",
        "## Axiology-Proposed Additional Perspectives",
        "None.",
        "",
        "## Purpose Alignment Verification",
        "Aligned.",
        "",
        "## Final Review Result",
        "Mock final result.",
        "",
        "## Boundary Notes",
        "None.",
        "",
        "## Immediate Actions Required",
        "None.",
        "",
        "## Recommendations",
        "None.",
        "",
        "## Unique Finding Tagging",
        "None.",
        "",
      ].join("\n"),
      "utf8",
    );

    const continuationPlan: ReviewContinuationPlan = {
      schemaVersion: "1",
      sessionId: path.basename(sessionRoot),
      eligible: true,
      ineligibleReason: null,
      sourceRefs: [],
      validationRefs: [],
      unitLedger: {} as ReviewContinuationPlan["unitLedger"],
      frontierUnits: [],
      downstreamUnits: [],
      preservedArtifactRefs: [synthesizeOutputPath],
      supersededArtifactRefs: [],
    };

    await assertRejects(
      () =>
        executeReviewPromptExecution({
          projectRoot,
          sessionRoot,
          defaultExecutorConfig: { bin: "node", args: [succeedScript] },
          continuationPlan,
        }),
      "participation.expected_lenses",
      "preserved synthesize participation mismatch rejected",
    );
  });

  it("D-6: deliberation unit timeout writes halted execution result", async () => {
    const { sessionRoot } = await buildMinimalSession("d6");
    const execDir = trackCleanup(makeTmpDir("d6-exec"));
    const hangScript = createSucceedScript(execDir, {
      hangUnitId: "deliberation-logic",
    });

    const result = await executeReviewPromptExecution({
      projectRoot,
      sessionRoot,
      defaultExecutorConfig: { bin: "node", args: [hangScript] },
      unitTimeoutMs: 500,
    });

    assertEqual(result.synthesis_executed, false, "synthesis skipped after timeout");
    assert(
      result.halt_reason?.includes("Controlled lens deliberation failed") === true,
      "controlled deliberation halt reason",
    );
    assertIncludes(result.halt_reason!, "timed out", "timeout included in halt reason");

    const errorLog = fs.readFileSync(path.join(sessionRoot, "error-log.md"), "utf8");
    assertIncludes(errorLog, "deliberation failure: deliberation-logic", "timeout failure logged");
    assertIncludes(errorLog, "timed out", "timeout message logged");

    const resultPath = path.join(sessionRoot, "execution-result.yaml");
    assert(fs.existsSync(resultPath), "execution-result.yaml created");
    const resultText = fs.readFileSync(resultPath, "utf8");
    assertIncludes(resultText, "halted_partial", "timeout result is halted");
    assertIncludes(resultText, "synthesis_executed: false", "synthesis not executed");
    assertIncludes(resultText, "deliberation_status: not_performed", "deliberation not performed");
    assertIncludes(resultText, "halt_phase: controlled_lens_deliberation", "halt phase recorded");
    assertIncludes(resultText, "halt_unit_id: deliberation-logic", "halt unit recorded");
    assertIncludes(resultText, "halt_lens_id: logic", "halt lens recorded");

    const execution = await readYamlDocument<{
      deliberation_execution_results?: Array<{
        unit_id?: string;
        unit_kind?: string;
        status?: string;
        failure_message?: string | null;
      }>;
    }>(resultPath);
    const failedDeliberation = execution.deliberation_execution_results?.find(
      (unit) => unit.unit_id === "deliberation-logic",
    );
    assert(failedDeliberation !== undefined, "failed deliberation result preserved");
    assertEqual(failedDeliberation.unit_kind, "deliberation", "failed unit kind");
    assertEqual(failedDeliberation.status, "failed", "failed deliberation status");
    assertIncludes(
      failedDeliberation.failure_message ?? "",
      "timed out",
      "failed deliberation timeout message",
    );

    const manifestText = fs.readFileSync(
      path.join(sessionRoot, "review-run-manifest.yaml"),
      "utf8",
    );
    assertIncludes(manifestText, "phase: controlled_lens_deliberation", "manifest halt phase");
    assertIncludes(manifestText, "unit_id: deliberation-logic", "manifest halt unit");

    await completeReviewSession([
      "--project-root",
      projectRoot,
      "--session-root",
      sessionRoot,
      "--request-text",
      "test controlled deliberation timeout",
    ]);
    const reviewRecord = await readYamlDocument<{
      record_status?: string;
      deliberation_status?: string;
      finding_ledger_ref?: string | null;
      finding_relation_graph_ref?: string | null;
      issue_ledger_ref?: string | null;
      issue_stance_matrix_ref?: string | null;
      deliberation_plan_ref?: string | null;
      problem_framing_ref?: string | null;
      degradation_notes_ref?: string | null;
      synthesis_result_ref?: string | null;
      deliberation_result_ref?: string | null;
    }>(path.join(sessionRoot, "review-record.yaml"));
    assertEqual(reviewRecord.record_status, "halted_partial", "record status is halted");
    assertEqual(
      reviewRecord.deliberation_status,
      "not_performed",
      "record deliberation not performed",
    );
    assertEqual(reviewRecord.synthesis_result_ref, null, "missing synthesis ref stays null");
    assertEqual(
      reviewRecord.deliberation_result_ref,
      null,
      "missing deliberation ref stays null",
    );
    assert(typeof reviewRecord.finding_ledger_ref === "string", "finding ledger ref preserved");
    assert(
      typeof reviewRecord.finding_relation_graph_ref === "string",
      "finding relation graph ref preserved",
    );
    assert(typeof reviewRecord.issue_ledger_ref === "string", "issue ledger ref preserved");
    assert(
      typeof reviewRecord.issue_stance_matrix_ref === "string",
      "issue stance matrix ref preserved",
    );
    assert(
      typeof reviewRecord.deliberation_plan_ref === "string",
      "deliberation plan ref preserved",
    );
    assertEqual(reviewRecord.problem_framing_ref, null, "missing problem framing ref stays null");
    assert(
      reviewRecord.degradation_notes_ref?.endsWith("degradation-summary.yaml") === true,
      "record points to structured degradation summary",
    );
    const degradationSummary = await readYamlDocument<{
      halt_unit_id?: string | null;
      halt_lens_id?: string | null;
      failed_units?: Array<{
        unit_id?: string;
        lens_id?: string | null;
        failure_message?: string | null;
      }>;
    }>(path.join(sessionRoot, "degradation-summary.yaml"));
    assertEqual(
      degradationSummary.halt_unit_id,
      "deliberation-logic",
      "summary halt unit",
    );
    assertEqual(degradationSummary.halt_lens_id, "logic", "summary halt lens");
    assert(
      degradationSummary.failed_units?.some(
        (unit) =>
          unit.unit_id === "deliberation-logic" &&
          unit.lens_id === "logic" &&
          unit.failure_message?.includes("timed out") === true,
      ) === true,
      "summary failed deliberation unit",
    );
    const finalOutputText = fs.readFileSync(
      path.join(sessionRoot, "final-output.md"),
      "utf8",
    );
    assertIncludes(finalOutputText, "halt phase: controlled_lens_deliberation", "final output halt phase");
    assertIncludes(finalOutputText, "halt unit: deliberation-logic", "final output halt unit");
    assertIncludes(finalOutputText, "halt lens: logic", "final output halt lens");
  });

  it("D-7: issue artifact failure writes halted execution result", async () => {
    const { sessionRoot } = await buildMinimalSession("d7");
    const execDir = trackCleanup(makeTmpDir("d7-exec"));
    const failScript = createSucceedScript(execDir, {
      failUnitId: "issue-ledger",
    });

    const result = await executeReviewPromptExecution({
      projectRoot,
      sessionRoot,
      defaultExecutorConfig: { bin: "node", args: [failScript] },
    });

    assertEqual(result.synthesis_executed, false, "synthesis skipped after issue artifact failure");
    assertIncludes(result.halt_reason!, "Issue artifact generation failed", "issue artifact halt reason");
    assertIncludes(result.halt_reason!, "issue-ledger", "failed artifact named");

    const resultPath = path.join(sessionRoot, "execution-result.yaml");
    assert(fs.existsSync(resultPath), "execution-result.yaml created");
    const resultText = fs.readFileSync(resultPath, "utf8");
    assertIncludes(resultText, "halted_partial", "issue artifact failure result is halted");
    assertIncludes(resultText, "synthesis_executed: false", "synthesis not executed");
    assertIncludes(resultText, "unit_id: issue-ledger", "failed artifact result recorded");
    assertIncludes(resultText, "status: failed", "failed unit status recorded");
  });

  it("D-8: teamlead deliberation timeout records controlled unit identity", async () => {
    const { sessionRoot } = await buildMinimalSession("d8");
    const execDir = trackCleanup(makeTmpDir("d8-exec"));
    const hangScript = createSucceedScript(execDir, {
      hangUnitId: "controlled-deliberation",
    });

    const result = await executeReviewPromptExecution({
      projectRoot,
      sessionRoot,
      defaultExecutorConfig: { bin: "node", args: [hangScript] },
      unitTimeoutMs: 500,
    });

    assertEqual(result.synthesis_executed, false, "synthesis skipped after teamlead timeout");
    assertEqual(result.halt_phase, "controlled_lens_deliberation", "teamlead halt phase");
    assertEqual(result.halt_unit_id, "controlled-deliberation", "teamlead halt unit");
    assertEqual(result.halt_unit_kind, "deliberation", "teamlead halt kind");
    assertEqual(result.halt_lens_id, null, "teamlead halt has no lens id");

    const execution = await readYamlDocument<{
      halt_phase?: string | null;
      halt_unit_id?: string | null;
      halt_lens_id?: string | null;
      deliberation_execution_results?: Array<{
        unit_id?: string;
        status?: string;
        failure_message?: string | null;
      }>;
    }>(path.join(sessionRoot, "execution-result.yaml"));
    assertEqual(execution.halt_phase, "controlled_lens_deliberation", "artifact halt phase");
    assertEqual(execution.halt_unit_id, "controlled-deliberation", "artifact halt unit");
    assertEqual(execution.halt_lens_id, null, "artifact halt lens");
    const teamlead = execution.deliberation_execution_results?.find(
      (unit) => unit.unit_id === "controlled-deliberation",
    );
    assert(teamlead !== undefined, "teamlead execution result preserved");
    assertEqual(teamlead.status, "failed", "teamlead result failed");
    assertIncludes(teamlead.failure_message ?? "", "timed out", "teamlead timeout message");
  });

  it("D-8a: malformed synthesize base Unit Boundary Details fail closed before runtime merge", async () => {
    const { sessionRoot } = await buildMinimalSession("d8a");
    const synthesizePacketPath = path.join(
      sessionRoot,
      "prompt-packets",
      "synthesize.prompt.md",
    );
    fs.writeFileSync(
      synthesizePacketPath,
      [
        "# Synthesize",
        "Combine.",
        "",
        "## Unit Boundary Details",
        "```json",
        "{nope",
        "```",
        "",
      ].join("\n"),
      "utf8",
    );
    const reviewContextManifestPath = path.join(
      sessionRoot,
      "execution-preparation",
      "review-context-manifest.yaml",
    );
    const manifest = await readYamlDocument<{
      packet_refs: Array<{ consumer_id: string; packet_sha256: string }>;
    }>(reviewContextManifestPath);
    const synthesizeRef = manifest.packet_refs.find(
      (ref) => ref.consumer_id === "synthesize",
    );
    assert(synthesizeRef !== undefined, "synthesize packet ref exists");
    synthesizeRef.packet_sha256 = sha256File(synthesizePacketPath);
    await writeYamlDocument(reviewContextManifestPath, manifest);
    const execDir = trackCleanup(makeTmpDir("d8a-exec"));
    const succeedScript = createSucceedScript(execDir);

    await assertRejects(
      () =>
        executeReviewPromptExecution({
          projectRoot,
          sessionRoot,
          defaultExecutorConfig: { bin: "node", args: [succeedScript] },
        }),
      "Synthesize base prompt packet has invalid Unit Boundary Details read authority",
      "malformed base synthesize packet rejected",
    );
    assert(
      !fs.existsSync(path.join(sessionRoot, "prompt-packets", "synthesize.runtime.prompt.md")),
      "runtime synthesize packet was not generated from malformed base packet",
    );
  });

  it("D-9: synthesize output contract failure is not retried", async () => {
    const { sessionRoot } = await buildMinimalSession("d9");
    const execDir = trackCleanup(makeTmpDir("d9-exec"));
    const succeedScript = createSucceedScript(execDir);
    const synthDir = path.join(execDir, "synth");
    fs.mkdirSync(synthDir, { recursive: true });
    const { scriptPath: synthScript, counterPath } =
      createSynthFlakyScript(synthDir, "contract-break");

    const result = await executeReviewPromptExecution({
      projectRoot,
      sessionRoot,
      defaultExecutorConfig: { bin: "node", args: [succeedScript] },
      synthesizeExecutorConfig: { bin: "node", args: [synthScript] },
    });

    assertEqual(result.synthesis_executed, false, "synthesis halted on contract failure");
    assertIncludes(result.halt_reason!, "missing required section heading", "contract failure named");
    const attempts = parseInt(fs.readFileSync(counterPath, "utf8").trim(), 10);
    assertEqual(attempts, 1, "contract failure not retried");

    const execution = await readYamlDocument<{
      synthesize_execution_result?: {
        unit_id?: string;
        status?: string;
        failure_kind?: string | null;
        attempt_count?: number | null;
      };
    }>(path.join(sessionRoot, "execution-result.yaml"));
    assertEqual(
      execution.synthesize_execution_result?.failure_kind,
      "output_contract",
      "failure kind recorded",
    );
    assertEqual(
      execution.synthesize_execution_result?.attempt_count,
      1,
      "attempt count recorded",
    );
  });

  it("D-9a: synthesize participation truth mismatch is an output contract failure", async () => {
    const { sessionRoot } = await buildMinimalSession("d9a");
    const execDir = trackCleanup(makeTmpDir("d9a-exec"));
    const succeedScript = createSucceedScript(execDir);
    const synthDir = path.join(execDir, "synth");
    fs.mkdirSync(synthDir, { recursive: true });
    const { scriptPath: synthScript, counterPath } =
      createSynthFlakyScript(synthDir, "wrong-participation");

    const result = await executeReviewPromptExecution({
      projectRoot,
      sessionRoot,
      defaultExecutorConfig: { bin: "node", args: [succeedScript] },
      synthesizeExecutorConfig: { bin: "node", args: [synthScript] },
    });

    assertEqual(result.synthesis_executed, false, "synthesis halted on participation mismatch");
    assertIncludes(
      result.halt_reason!,
      "participation.expected_lenses",
      "participation truth failure named",
    );
    const attempts = parseInt(fs.readFileSync(counterPath, "utf8").trim(), 10);
    assertEqual(attempts, 1, "participation contract failure not retried");

    const execution = await readYamlDocument<{
      synthesize_execution_result?: {
        failure_kind?: string | null;
        failure_message?: string | null;
        attempt_count?: number | null;
      };
    }>(path.join(sessionRoot, "execution-result.yaml"));
    assertEqual(
      execution.synthesize_execution_result?.failure_kind,
      "output_contract",
      "failure kind recorded",
    );
    assertIncludes(
      execution.synthesize_execution_result?.failure_message ?? "",
      "runtime lens truth",
      "truth mismatch message recorded",
    );
    assertEqual(
      execution.synthesize_execution_result?.attempt_count,
      1,
      "attempt count recorded",
    );
  });

  it("D-9b: synthesize missing Boundary Notes is an output contract failure", async () => {
    const { sessionRoot } = await buildMinimalSession("d9b");
    const execDir = trackCleanup(makeTmpDir("d9b-exec"));
    const succeedScript = createSucceedScript(execDir);
    const synthDir = path.join(execDir, "synth");
    fs.mkdirSync(synthDir, { recursive: true });
    const { scriptPath: synthScript, counterPath } =
      createSynthFlakyScript(synthDir, "missing-boundary-notes");

    const result = await executeReviewPromptExecution({
      projectRoot,
      sessionRoot,
      defaultExecutorConfig: { bin: "node", args: [succeedScript] },
      synthesizeExecutorConfig: { bin: "node", args: [synthScript] },
    });

    assertEqual(result.synthesis_executed, false, "synthesis halted on contract failure");
    assertIncludes(result.halt_reason!, "Boundary Notes", "missing heading named");
    const attempts = parseInt(fs.readFileSync(counterPath, "utf8").trim(), 10);
    assertEqual(attempts, 1, "contract failure not retried");

    const execution = await readYamlDocument<{
      synthesize_execution_result?: {
        failure_kind?: string | null;
        attempt_count?: number | null;
      };
    }>(path.join(sessionRoot, "execution-result.yaml"));
    assertEqual(
      execution.synthesize_execution_result?.failure_kind,
      "output_contract",
      "failure kind recorded",
    );
    assertEqual(
      execution.synthesize_execution_result?.attempt_count,
      1,
      "attempt count recorded",
    );
  });

  it("D-9c: synthesize headings inside fenced code are not accepted", async () => {
    const { sessionRoot } = await buildMinimalSession("d9c");
    const execDir = trackCleanup(makeTmpDir("d9c-exec"));
    const succeedScript = createSucceedScript(execDir);
    const synthDir = path.join(execDir, "synth");
    fs.mkdirSync(synthDir, { recursive: true });
    const { scriptPath: synthScript, counterPath } =
      createSynthFlakyScript(synthDir, "fenced-headings-only");

    const result = await executeReviewPromptExecution({
      projectRoot,
      sessionRoot,
      defaultExecutorConfig: { bin: "node", args: [succeedScript] },
      synthesizeExecutorConfig: { bin: "node", args: [synthScript] },
    });

    assertEqual(result.synthesis_executed, false, "synthesis halted on fenced headings");
    assertIncludes(result.halt_reason!, "Consensus", "missing real heading named");
    const attempts = parseInt(fs.readFileSync(counterPath, "utf8").trim(), 10);
    assertEqual(attempts, 1, "contract failure not retried");
  });

  it("D-9d: synthesize empty required sections are output contract failures", async () => {
    const { sessionRoot } = await buildMinimalSession("d9d");
    const execDir = trackCleanup(makeTmpDir("d9d-exec"));
    const succeedScript = createSucceedScript(execDir);
    const synthDir = path.join(execDir, "synth");
    fs.mkdirSync(synthDir, { recursive: true });
    const { scriptPath: synthScript, counterPath } =
      createSynthFlakyScript(synthDir, "empty-boundary-notes");

    const result = await executeReviewPromptExecution({
      projectRoot,
      sessionRoot,
      defaultExecutorConfig: { bin: "node", args: [succeedScript] },
      synthesizeExecutorConfig: { bin: "node", args: [synthScript] },
    });

    assertEqual(result.synthesis_executed, false, "synthesis halted on empty section");
    assertIncludes(result.halt_reason!, "Boundary Notes", "empty heading named");
    const attempts = parseInt(fs.readFileSync(counterPath, "utf8").trim(), 10);
    assertEqual(attempts, 1, "contract failure not retried");
  });

  it("D-10: missing synthesize output is an output contract failure and is not retried", async () => {
    const { sessionRoot } = await buildMinimalSession("d10");
    const execDir = trackCleanup(makeTmpDir("d10-exec"));
    const succeedScript = createSucceedScript(execDir);
    const synthDir = path.join(execDir, "synth");
    fs.mkdirSync(synthDir, { recursive: true });
    const { scriptPath: synthScript, counterPath } =
      createSynthFlakyScript(synthDir, "missing-output");

    const result = await executeReviewPromptExecution({
      projectRoot,
      sessionRoot,
      defaultExecutorConfig: { bin: "node", args: [succeedScript] },
      synthesizeExecutorConfig: { bin: "node", args: [synthScript] },
    });

    assertEqual(result.synthesis_executed, false, "synthesis halted on missing output");
    assertIncludes(result.halt_reason!, "did not create output file", "missing output named");
    const attempts = parseInt(fs.readFileSync(counterPath, "utf8").trim(), 10);
    assertEqual(attempts, 1, "missing output not retried");

    const execution = await readYamlDocument<{
      synthesize_execution_result?: {
        failure_kind?: string | null;
        attempt_count?: number | null;
        output_bytes?: number | null;
      };
    }>(path.join(sessionRoot, "execution-result.yaml"));
    assertEqual(
      execution.synthesize_execution_result?.failure_kind,
      "output_contract",
      "failure kind recorded",
    );
    assertEqual(
      execution.synthesize_execution_result?.attempt_count,
      1,
      "attempt count recorded",
    );
    assertEqual(
      execution.synthesize_execution_result?.output_bytes,
      null,
      "missing output has null output byte count",
    );
  });

  it("D-11: child empty-output executor errors are classified and not retried", async () => {
    const { sessionRoot } = await buildMinimalSession("d11");
    const execDir = trackCleanup(makeTmpDir("d11-exec"));
    const succeedScript = createSucceedScript(execDir);
    const synthDir = path.join(execDir, "synth");
    fs.mkdirSync(synthDir, { recursive: true });
    const { scriptPath: synthScript, counterPath } =
      createSynthFlakyScript(synthDir, "inline-empty-error");

    const result = await executeReviewPromptExecution({
      projectRoot,
      sessionRoot,
      defaultExecutorConfig: { bin: "node", args: [succeedScript] },
      synthesizeExecutorConfig: { bin: "node", args: [synthScript] },
    });

    assertEqual(result.synthesis_executed, false, "synthesis halted on child empty output");
    const attempts = parseInt(fs.readFileSync(counterPath, "utf8").trim(), 10);
    assertEqual(attempts, 1, "child empty output not retried");

    const execution = await readYamlDocument<{
      synthesize_execution_result?: {
        failure_kind?: string | null;
        attempt_count?: number | null;
      };
    }>(path.join(sessionRoot, "execution-result.yaml"));
    assertEqual(
      execution.synthesize_execution_result?.failure_kind,
      "empty_output",
      "child empty-output failure kind recorded",
    );
    assertEqual(
      execution.synthesize_execution_result?.attempt_count,
      1,
      "attempt count recorded",
    );
  });

  it("D-12: synthesize deliberation_status contract failure is recorded before completion", async () => {
    const { sessionRoot } = await buildMinimalSession("d12");
    const execDir = trackCleanup(makeTmpDir("d12-exec"));
    const succeedScript = createSucceedScript(execDir);
    const synthDir = path.join(execDir, "synth");
    fs.mkdirSync(synthDir, { recursive: true });
    const { scriptPath: synthScript, counterPath } =
      createSynthFlakyScript(synthDir, "missing-status");

    const result = await executeReviewPromptExecution({
      projectRoot,
      sessionRoot,
      defaultExecutorConfig: { bin: "node", args: [succeedScript] },
      synthesizeExecutorConfig: { bin: "node", args: [synthScript] },
    });

    assertEqual(result.synthesis_executed, false, "synthesis halted on status contract");
    const attempts = parseInt(fs.readFileSync(counterPath, "utf8").trim(), 10);
    assertEqual(attempts, 1, "status contract failure not retried");

    const execution = await readYamlDocument<{
      synthesize_execution_result?: {
        failure_kind?: string | null;
        failure_message?: string | null;
      };
    }>(path.join(sessionRoot, "execution-result.yaml"));
    assertEqual(
      execution.synthesize_execution_result?.failure_kind,
      "output_contract",
      "failure kind recorded",
    );
    assertIncludes(
      execution.synthesize_execution_result?.failure_message ?? "",
      "deliberation_status: performed",
      "status failure message recorded",
    );
  });

  it("D-13: malformed lens output fails the lens output contract", async () => {
    const { sessionRoot } = await buildMinimalSession("d12");
    const execDir = trackCleanup(makeTmpDir("d12-exec"));
    const malformedScript = createSucceedScript(execDir, {
      malformedLensIds: ["logic", "pragmatics"],
    });

    const result = await executeReviewPromptExecution({
      projectRoot,
      sessionRoot,
      defaultExecutorConfig: { bin: "node", args: [malformedScript] },
    });

    assertEqual(result.synthesis_executed, false, "synthesis halted before downstream use");
    assertIncludes(
      result.halt_reason!,
      "No participating lens outputs were produced",
      "barrier halt named",
    );

    const execution = await readYamlDocument<{
      lens_execution_results?: Array<{
        unit_id?: string;
        status?: string;
        failure_kind?: string | null;
        failure_message?: string | null;
      }>;
    }>(path.join(sessionRoot, "execution-result.yaml"));
    const failedKinds = new Map(
      (execution.lens_execution_results ?? []).map((unit) => [
        unit.unit_id,
        unit.failure_kind,
      ]),
    );
    assertEqual(failedKinds.get("logic"), "output_contract", "logic failure kind");
    assertEqual(failedKinds.get("pragmatics"), "output_contract", "pragmatics failure kind");
  });

  it("D-14: lens output with malformed YAML provenance body fails the output contract", async () => {
    const { sessionRoot } = await buildMinimalSession("d14");
    const execDir = trackCleanup(makeTmpDir("d14-exec"));
    const malformedScript = createSucceedScript(execDir, {
      malformedYamlLensIds: ["logic", "pragmatics"],
    });

    const result = await executeReviewPromptExecution({
      projectRoot,
      sessionRoot,
      defaultExecutorConfig: { bin: "node", args: [malformedScript] },
    });

    assertEqual(result.synthesis_executed, false, "synthesis halted before downstream use");
    const execution = await readYamlDocument<{
      lens_execution_results?: Array<{
        unit_id?: string;
        failure_kind?: string | null;
        failure_message?: string | null;
      }>;
    }>(path.join(sessionRoot, "execution-result.yaml"));
    const failed = new Map(
      (execution.lens_execution_results ?? []).map((unit) => [
        unit.unit_id,
        unit,
      ]),
    );
    assertEqual(failed.get("logic")?.failure_kind, "output_contract", "logic failure kind");
    assertIncludes(
      failed.get("logic")?.failure_message ?? "",
      "must be a YAML list",
      "logic YAML body failure message",
    );
    assertEqual(
      failed.get("pragmatics")?.failure_kind,
      "output_contract",
      "pragmatics failure kind",
    );
  });

  it("D-15: controlled deliberation missing status is recorded as output_contract", async () => {
    const { sessionRoot } = await buildMinimalSession("d15");
    const execDir = trackCleanup(makeTmpDir("d15-exec"));
    const malformedScript = createSucceedScript(execDir, {
      controlledDeliberationMode: "missing-status",
    });

    const result = await executeReviewPromptExecution({
      projectRoot,
      sessionRoot,
      defaultExecutorConfig: { bin: "node", args: [malformedScript] },
    });

    assertEqual(result.synthesis_executed, false, "synthesis skipped after teamlead contract failure");
    assertEqual(result.halt_phase, "controlled_lens_deliberation", "teamlead halt phase");
    assertEqual(result.halt_unit_id, "controlled-deliberation", "teamlead halt unit");

    const execution = await readYamlDocument<{
      deliberation_execution_results?: Array<{
        unit_id?: string;
        status?: string;
        failure_kind?: string | null;
        failure_message?: string | null;
      }>;
    }>(path.join(sessionRoot, "execution-result.yaml"));
    const teamlead = execution.deliberation_execution_results?.find(
      (unit) => unit.unit_id === "controlled-deliberation",
    );
    assert(teamlead !== undefined, "teamlead execution result preserved");
    assertEqual(teamlead.status, "failed", "teamlead result failed");
    assertEqual(teamlead.failure_kind, "output_contract", "teamlead failure kind");
    assertIncludes(
      teamlead.failure_message ?? "",
      "deliberation_status: performed",
      "status contract message recorded",
    );
  });

  it("D-16: controlled deliberation missing required heading is recorded as output_contract", async () => {
    const { sessionRoot } = await buildMinimalSession("d16");
    const execDir = trackCleanup(makeTmpDir("d16-exec"));
    const malformedScript = createSucceedScript(execDir, {
      controlledDeliberationMode: "missing-heading",
    });

    const result = await executeReviewPromptExecution({
      projectRoot,
      sessionRoot,
      defaultExecutorConfig: { bin: "node", args: [malformedScript] },
    });

    assertEqual(result.synthesis_executed, false, "synthesis skipped after teamlead heading failure");
    assertEqual(result.halt_phase, "controlled_lens_deliberation", "teamlead halt phase");

    const execution = await readYamlDocument<{
      deliberation_execution_results?: Array<{
        unit_id?: string;
        failure_kind?: string | null;
        failure_message?: string | null;
      }>;
    }>(path.join(sessionRoot, "execution-result.yaml"));
    const teamlead = execution.deliberation_execution_results?.find(
      (unit) => unit.unit_id === "controlled-deliberation",
    );
    assert(teamlead !== undefined, "teamlead execution result preserved");
    assertEqual(teamlead.failure_kind, "output_contract", "teamlead failure kind");
    assertIncludes(
      teamlead.failure_message ?? "",
      "missing required section heading",
      "heading contract message recorded",
    );
  });

  it("D-17: nested-workers lens candidates pass the local output contract gate", async () => {
    const { sessionRoot } = await buildMinimalSession("d17");
    const execDir = trackCleanup(makeTmpDir("d17-exec"));
    const succeedScript = createSucceedScript(execDir);
    const fakeCodexBin = createFakeNestedCodexBin(execDir, {
      malformedYamlLensIds: ["logic"],
    });
    const originalPath = process.env.PATH;
    process.env.PATH = `${fakeCodexBin}${path.delimiter}${originalPath ?? ""}`;

    try {
      const result = await executeReviewPromptExecution({
        projectRoot,
        sessionRoot,
        defaultExecutorConfig: { bin: "node", args: [succeedScript] },
        reviewExecutionProfile: nestedWorkersProfile(),
      });

      assertEqual(result.synthesis_executed, false, "synthesis halted at lens barrier");
      assert(result.participating_lens_ids.includes("pragmatics"), "valid nested lens participated");
      assert(!result.participating_lens_ids.includes("logic"), "malformed nested lens excluded");
      assert(result.degraded_lens_ids.includes("logic"), "malformed nested lens degraded");

      const execution = await readYamlDocument<{
        lens_execution_results?: Array<{
          unit_id?: string;
          status?: string;
          failure_kind?: string | null;
          failure_message?: string | null;
        }>;
      }>(path.join(sessionRoot, "execution-result.yaml"));
      const logic = execution.lens_execution_results?.find(
        (unit) => unit.unit_id === "logic",
      );
      assert(logic !== undefined, "logic execution result preserved");
      assertEqual(logic.status, "failed", "logic marked failed");
      assertEqual(logic.failure_kind, "output_contract", "logic failure kind");
      assertIncludes(
        logic.failure_message ?? "",
        "must be a YAML list",
        "nested output contract message recorded",
      );
    } finally {
      if (originalPath === undefined) delete process.env.PATH;
      else process.env.PATH = originalPath;
    }
  });

  it("D-18: per-lens deliberation malformed output halts before synthesis", async () => {
    const { sessionRoot } = await buildMinimalSession("d18");
    const execDir = trackCleanup(makeTmpDir("d18-exec"));
    const malformedScript = createSucceedScript(execDir, {
      malformedDeliberationIds: ["deliberation-logic"],
    });

    const result = await executeReviewPromptExecution({
      projectRoot,
      sessionRoot,
      defaultExecutorConfig: { bin: "node", args: [malformedScript] },
    });

    assertEqual(result.synthesis_executed, false, "synthesis skipped after lens response failure");
    assertEqual(result.halt_phase, "controlled_lens_deliberation", "lens response halt phase");
    assertEqual(result.halt_unit_id, "deliberation-logic", "lens response halt unit");
    assertEqual(result.halt_lens_id, "logic", "lens response halt lens");

    const execution = await readYamlDocument<{
      deliberation_execution_results?: Array<{
        unit_id?: string;
        status?: string;
        failure_kind?: string | null;
        failure_message?: string | null;
      }>;
    }>(path.join(sessionRoot, "execution-result.yaml"));
    const failedDeliberation = execution.deliberation_execution_results?.find(
      (unit) => unit.unit_id === "deliberation-logic",
    );
    assert(failedDeliberation !== undefined, "lens deliberation execution result preserved");
    assertEqual(failedDeliberation.status, "failed", "lens deliberation result failed");
    assertEqual(
      failedDeliberation.failure_kind,
      "output_contract",
      "lens deliberation failure kind",
    );
    assertIncludes(
      failedDeliberation.failure_message ?? "",
      "missing required section heading",
      "lens deliberation heading contract message recorded",
    );
  });

  it("D-19: generated controlled-deliberation prompt packets preserve boundary details", async () => {
    const { sessionRoot, synthesizeOutputPath } = await buildMinimalSession("d19", {
      parentRepoExplorationPolicy: "allowed",
    });
    const execDir = trackCleanup(makeTmpDir("d19-exec"));
    const succeedScript = createSucceedScript(execDir, {
      stdoutMetadata: {
        tool_mode: "inline",
        native_admission: {
          requested_tool_mode: "auto",
          effective_tool_mode: "inline",
          decision: "read_authority_forced_inline",
          reason: "missing Unit Boundary Details",
          allowed_read_refs_count: 0,
          read_authority_declared: false,
          read_authority_malformed: false,
          read_authority_failure: "missing Unit Boundary Details",
          attempted_native_tool_boundary_skips: {
            boundary_skips: 4,
            unreadable_skips: 5,
            oversized_skips: 6,
          },
        },
        tool_boundary_skips: {
          boundary_skips: 1,
          unreadable_skips: 2,
          oversized_skips: 3,
        },
        citation_audit: {
          status: "skipped",
          coverage_status: "none",
          quotes_checked: 0,
          quotes_unmatched: [],
          quotes_unmatched_meta: [],
          attribution_count: 0,
          min_quote_length: 20,
          skip_reason: "no lens outputs readable",
          failed_refs: ["logic (/tmp/missing.md)"],
        },
      },
    });

    const result = await executeReviewPromptExecution({
      projectRoot,
      sessionRoot,
      defaultExecutorConfig: { bin: "node", args: [succeedScript] },
    });

    assertEqual(result.synthesis_executed, true, "synthesis executed after boundary prompt generation");

    const logicDeliberationOutputPath = path.join(
      sessionRoot,
      "deliberation",
      "round1",
      "logic-deliberation.md",
    );
    const pragmaticsDeliberationOutputPath = path.join(
      sessionRoot,
      "deliberation",
      "round1",
      "pragmatics-deliberation.md",
    );
    const logicLensOutputPath = path.join(sessionRoot, "round1", "logic.md");
    const pragmaticsLensOutputPath = path.join(
      sessionRoot,
      "round1",
      "pragmatics.md",
    );
    const teamleadDeliberationOutputPath = path.join(sessionRoot, "deliberation.md");
    const logicPromptText = fs.readFileSync(
      path.join(sessionRoot, "prompt-packets", "logic.deliberation.prompt.md"),
      "utf8",
    );
    const teamleadPromptText = fs.readFileSync(
      path.join(sessionRoot, "prompt-packets", "controlled-deliberation.prompt.md"),
      "utf8",
    );
    const synthesizeRuntimePromptText = fs.readFileSync(
      path.join(sessionRoot, "prompt-packets", "synthesize.runtime.prompt.md"),
      "utf8",
    );
    const execution = await readYamlDocument<{
      synthesize_execution_result?: {
        native_admission?: {
          requested_tool_mode?: string;
          effective_tool_mode?: string;
          decision?: string;
          reason?: string;
          allowed_read_refs_count?: number;
          read_authority_declared?: boolean;
          read_authority_malformed?: boolean;
          read_authority_failure?: string;
          attempted_native_tool_boundary_skips?: {
            boundary_skips?: number;
            unreadable_skips?: number;
            oversized_skips?: number;
          };
        } | null;
        tool_boundary_skips?: {
          boundary_skips?: number;
          unreadable_skips?: number;
          oversized_skips?: number;
        } | null;
        citation_audit?: {
          status?: string;
          coverage_status?: string;
          quotes_checked?: number;
          quotes_unmatched?: string[];
          quotes_unmatched_meta?: string[];
          attribution_count?: number;
          min_quote_length?: number;
          skip_reason?: string;
          failed_refs?: string[];
        } | null;
      } | null;
    }>(path.join(sessionRoot, "execution-result.yaml"));
    const runManifest = await readYamlDocument<{
      worker_units?: Array<{
        unit_id?: string;
        citation_audit?: {
          status?: string;
          coverage_status?: string;
          quotes_checked?: number;
          quotes_unmatched?: string[];
          skip_reason?: string;
          failed_refs?: string[];
        } | null;
      }>;
    }>(path.join(sessionRoot, "review-run-manifest.yaml"));

    assertEqual(
      execution.synthesize_execution_result?.native_admission?.decision,
      "read_authority_forced_inline",
      "native admission metadata preserved in parent execution result",
    );
    assertEqual(
      execution.synthesize_execution_result?.native_admission?.read_authority_declared,
      false,
      "native admission read authority declared flag preserved",
    );
    assertEqual(
      execution.synthesize_execution_result?.native_admission
        ?.attempted_native_tool_boundary_skips?.boundary_skips,
      4,
      "attempted-native boundary skip metadata preserved in native admission",
    );
    assertEqual(
      execution.synthesize_execution_result?.tool_boundary_skips?.boundary_skips,
      1,
      "tool boundary skip metadata preserved in parent execution result",
    );
    assertEqual(
      execution.synthesize_execution_result?.citation_audit?.quotes_checked,
      0,
      "citation audit metadata preserved in parent execution result",
    );
    assertEqual(
      execution.synthesize_execution_result?.citation_audit?.status,
      "skipped",
      "citation audit skip status preserved in parent execution result",
    );
    assertEqual(
      execution.synthesize_execution_result?.citation_audit?.skip_reason,
      "no lens outputs readable",
      "citation audit skip reason preserved in parent execution result",
    );
    const synthesizeManifestUnit = runManifest.worker_units?.find(
      (unit) => unit.unit_id === "synthesize",
    );
    assertEqual(
      synthesizeManifestUnit?.citation_audit?.status,
      "skipped",
      "citation audit skip status preserved in review run manifest",
    );
    assertEqual(
      synthesizeManifestUnit?.citation_audit?.failed_refs?.[0],
      "logic (/tmp/missing.md)",
      "citation audit failed refs preserved in review run manifest",
    );
    assertEqual(
      (synthesizeRuntimePromptText.match(/^## Unit Boundary Details$/gm) ?? [])
        .length,
      1,
      "synthesize runtime prompt has one canonical Unit Boundary Details section",
    );

    assertBoundaryDetailsPayload({
      promptText: logicPromptText,
      expectedOutputPath: logicDeliberationOutputPath,
      sessionRoot,
      expectedParentRepoExplorationPolicy: "allowed",
      expectedReadRefs: [
        logicLensOutputPath,
        pragmaticsLensOutputPath,
        path.join(sessionRoot, "finding-ledger.yaml"),
        path.join(sessionRoot, "finding-relation-graph.yaml"),
        path.join(sessionRoot, "issue-ledger.yaml"),
        path.join(sessionRoot, "issue-stance-matrix.yaml"),
        path.join(sessionRoot, "deliberation-plan.yaml"),
      ],
    });
    assertBoundaryDetailsPayload({
      promptText: teamleadPromptText,
      expectedOutputPath: teamleadDeliberationOutputPath,
      sessionRoot,
      expectedParentRepoExplorationPolicy: "allowed",
      expectedReadRefs: [
        logicLensOutputPath,
        pragmaticsLensOutputPath,
        logicDeliberationOutputPath,
        pragmaticsDeliberationOutputPath,
        path.join(sessionRoot, "issue-stance-matrix.yaml"),
      ],
    });
    assertBoundaryDetailsPayload({
      promptText: synthesizeRuntimePromptText,
      expectedOutputPath: synthesizeOutputPath,
      sessionRoot,
      expectedParentRepoExplorationPolicy: "allowed",
      expectedReadRefs: [
        logicLensOutputPath,
        pragmaticsLensOutputPath,
        logicDeliberationOutputPath,
        pragmaticsDeliberationOutputPath,
        teamleadDeliberationOutputPath,
        path.join(sessionRoot, "problem-framing.yaml"),
      ],
    });
  });

  it("D-20: partial citation audit metadata is preserved in parent artifacts", async () => {
    const { sessionRoot } = await buildMinimalSession("d20", {
      parentRepoExplorationPolicy: "allowed",
    });
    const execDir = trackCleanup(makeTmpDir("d20-exec"));
    const succeedScript = createSucceedScript(execDir, {
      stdoutMetadata: {
        citation_audit: {
          status: "completed",
          coverage_status: "partial",
          quotes_checked: 1,
          quotes_unmatched: [],
          quotes_unmatched_meta: [],
          attribution_count: 0,
          min_quote_length: 20,
          failed_refs: ["logic (/tmp/missing.md: unreadable or missing)"],
        },
      },
    });

    await executeReviewPromptExecution({
      projectRoot,
      sessionRoot,
      defaultExecutorConfig: { bin: "node", args: [succeedScript] },
    });

    const execution = await readYamlDocument<{
      synthesize_execution_result?: {
        citation_audit?: {
          status?: string;
          coverage_status?: string;
          failed_refs?: string[];
        } | null;
      } | null;
    }>(path.join(sessionRoot, "execution-result.yaml"));
    const runManifest = await readYamlDocument<{
      worker_units?: Array<{
        unit_id?: string;
        citation_audit?: {
          status?: string;
          coverage_status?: string;
          failed_refs?: string[];
        } | null;
      }>;
    }>(path.join(sessionRoot, "review-run-manifest.yaml"));
    const synthesizeManifestUnit = runManifest.worker_units?.find(
      (unit) => unit.unit_id === "synthesize",
    );

    assertEqual(
      execution.synthesize_execution_result?.citation_audit?.coverage_status,
      "partial",
      "partial citation audit coverage preserved in execution result",
    );
    assertEqual(
      synthesizeManifestUnit?.citation_audit?.coverage_status,
      "partial",
      "partial citation audit coverage preserved in run manifest",
    );
    assertEqual(
      synthesizeManifestUnit?.citation_audit?.failed_refs?.[0],
      "logic (/tmp/missing.md: unreadable or missing)",
      "partial citation audit failed refs preserved in run manifest",
    );
  });

  it("D-21: contradictory citation audit metadata is not artifactized", async () => {
    const { sessionRoot } = await buildMinimalSession("d21", {
      parentRepoExplorationPolicy: "allowed",
    });
    const execDir = trackCleanup(makeTmpDir("d21-exec"));
    const succeedScript = createSucceedScript(execDir, {
      stdoutMetadata: {
        citation_audit: {
          status: "skipped",
          coverage_status: "complete",
          quotes_checked: 0,
          quotes_unmatched: [],
          quotes_unmatched_meta: [],
          attribution_count: 0,
          min_quote_length: 20,
          skip_reason: "contradictory fixture",
        },
      },
    });

    await executeReviewPromptExecution({
      projectRoot,
      sessionRoot,
      defaultExecutorConfig: { bin: "node", args: [succeedScript] },
    });

    const execution = await readYamlDocument<{
      synthesize_execution_result?: {
        citation_audit?: unknown;
        citation_audit_rejection?: {
          reason?: string;
          status?: string;
          coverage_status?: string;
        };
      } | null;
    }>(path.join(sessionRoot, "execution-result.yaml"));
    const runManifest = await readYamlDocument<{
      worker_units?: Array<{
        unit_id?: string;
        citation_audit?: unknown;
        citation_audit_rejection?: {
          reason?: string;
          status?: string;
          coverage_status?: string;
        };
      }>;
    }>(path.join(sessionRoot, "review-run-manifest.yaml"));
    const synthesizeManifestUnit = runManifest.worker_units?.find(
      (unit) => unit.unit_id === "synthesize",
    );

    assertEqual(
      execution.synthesize_execution_result?.citation_audit,
      undefined,
      "contradictory citation audit metadata omitted from execution result",
    );
    assertEqual(
      execution.synthesize_execution_result?.citation_audit_rejection?.reason,
      "contradictory_status_coverage",
      "contradictory citation audit rejection is preserved in execution result",
    );
    assertEqual(
      synthesizeManifestUnit?.citation_audit,
      null,
      "contradictory citation audit metadata normalized to null in run manifest unit",
    );
    assertEqual(
      synthesizeManifestUnit?.citation_audit_rejection?.reason,
      "contradictory_status_coverage",
      "contradictory citation audit rejection is preserved in run manifest unit",
    );
  });

  it("D-21a: completed citation audit with failed refs is not artifactized as complete", async () => {
    const { sessionRoot } = await buildMinimalSession("d21a", {
      parentRepoExplorationPolicy: "allowed",
    });
    const execDir = trackCleanup(makeTmpDir("d21a-exec"));
    const succeedScript = createSucceedScript(execDir, {
      stdoutMetadata: {
        citation_audit: {
          status: "completed",
          coverage_status: "complete",
          quotes_checked: 1,
          quotes_unmatched: [],
          quotes_unmatched_meta: [],
          attribution_count: 1,
          min_quote_length: 20,
          failed_refs: ["logic (/tmp/missing.md: unreadable or missing)"],
        },
      },
    });

    await executeReviewPromptExecution({
      projectRoot,
      sessionRoot,
      defaultExecutorConfig: { bin: "node", args: [succeedScript] },
    });

    const execution = await readYamlDocument<{
      synthesize_execution_result?: {
        citation_audit?: unknown;
        citation_audit_rejection?: { reason?: string; coverage_status?: string };
      } | null;
    }>(path.join(sessionRoot, "execution-result.yaml"));
    const runManifest = await readYamlDocument<{
      worker_units?: Array<{
        unit_id?: string;
        citation_audit?: unknown;
        citation_audit_rejection?: { reason?: string; coverage_status?: string };
      }>;
    }>(path.join(sessionRoot, "review-run-manifest.yaml"));
    const synthesizeManifestUnit = runManifest.worker_units?.find(
      (unit) => unit.unit_id === "synthesize",
    );

    assertEqual(
      execution.synthesize_execution_result?.citation_audit,
      undefined,
      "complete citation audit with failed refs omitted from execution result",
    );
    assertEqual(
      execution.synthesize_execution_result?.citation_audit_rejection?.reason,
      "contradictory_status_coverage",
      "complete citation audit with failed refs stores rejection in execution result",
    );
    assertEqual(
      synthesizeManifestUnit?.citation_audit,
      null,
      "complete citation audit with failed refs normalized to null in manifest",
    );
    assertEqual(
      synthesizeManifestUnit?.citation_audit_rejection?.reason,
      "contradictory_status_coverage",
      "complete citation audit with failed refs stores rejection in manifest",
    );
  });

  it("D-21b: preserved contradictory citation audit is normalized during continuation", async () => {
    const { sessionRoot } = await buildMinimalSession("d21b", {
      parentRepoExplorationPolicy: "allowed",
    });
    const execDir = trackCleanup(makeTmpDir("d21b-exec"));
    const succeedScript = createSucceedScript(execDir);

    await executeReviewPromptExecution({
      projectRoot,
      sessionRoot,
      defaultExecutorConfig: { bin: "node", args: [succeedScript] },
    });

    const executionResultPath = path.join(sessionRoot, "execution-result.yaml");
    const execution = await readYamlDocument<Record<string, unknown>>(
      executionResultPath,
    );
    const synthesizeResult = execution.synthesize_execution_result as
      | Record<string, unknown>
      | undefined;
    if (!synthesizeResult) {
      throw new Error("synthesize execution result missing before continuation");
    }
    synthesizeResult.citation_audit = {
      status: "skipped",
      coverage_status: "complete",
      quotes_checked: 0,
      quotes_unmatched: [],
      quotes_unmatched_meta: [],
      attribution_count: 0,
      min_quote_length: 20,
      skip_reason: "legacy contradictory fixture",
    };
    delete synthesizeResult.citation_audit_rejection;
    await writeYamlDocument(executionResultPath, execution);

    const continuationPlan: ReviewContinuationPlan = {
      schemaVersion: "1",
      sessionId: path.basename(sessionRoot),
      eligible: true,
      ineligibleReason: null,
      sourceRefs: [],
      validationRefs: [],
      unitLedger: {} as ReviewContinuationPlan["unitLedger"],
      frontierUnits: [],
      downstreamUnits: [],
      preservedArtifactRefs: [],
      supersededArtifactRefs: [],
    };

    await executeReviewPromptExecution({
      projectRoot,
      sessionRoot,
      defaultExecutorConfig: { bin: "node", args: [succeedScript] },
      continuationPlan,
    });

    const normalizedExecution = await readYamlDocument<{
      synthesize_execution_result?: {
        citation_audit?: unknown;
        citation_audit_rejection?: { reason?: string };
      } | null;
    }>(executionResultPath);
    const runManifest = await readYamlDocument<{
      worker_units?: Array<{
        unit_id?: string;
        citation_audit?: unknown;
        citation_audit_rejection?: { reason?: string };
      }>;
    }>(path.join(sessionRoot, "review-run-manifest.yaml"));
    const synthesizeManifestUnit = runManifest.worker_units?.find(
      (unit) => unit.unit_id === "synthesize",
    );

    assertEqual(
      normalizedExecution.synthesize_execution_result?.citation_audit,
      undefined,
      "preserved contradictory citation audit omitted from execution result",
    );
    assertEqual(
      normalizedExecution.synthesize_execution_result?.citation_audit_rejection?.reason,
      "contradictory_status_coverage",
      "preserved contradictory citation audit rejection stored in execution result",
    );
    assertEqual(
      synthesizeManifestUnit?.citation_audit,
      null,
      "preserved contradictory citation audit normalized to null in manifest",
    );
    assertEqual(
      synthesizeManifestUnit?.citation_audit_rejection?.reason,
      "contradictory_status_coverage",
      "preserved contradictory citation audit rejection stored in manifest",
    );
  });

  it("D-21d: preserved complete citation audit with failed refs is normalized during continuation", async () => {
    const { sessionRoot } = await buildMinimalSession("d21d", {
      parentRepoExplorationPolicy: "allowed",
    });
    const execDir = trackCleanup(makeTmpDir("d21d-exec"));
    const succeedScript = createSucceedScript(execDir);

    await executeReviewPromptExecution({
      projectRoot,
      sessionRoot,
      defaultExecutorConfig: { bin: "node", args: [succeedScript] },
    });

    const executionResultPath = path.join(sessionRoot, "execution-result.yaml");
    const execution = await readYamlDocument<Record<string, unknown>>(
      executionResultPath,
    );
    const synthesizeResult = execution.synthesize_execution_result as
      | Record<string, unknown>
      | undefined;
    if (!synthesizeResult) {
      throw new Error("synthesize execution result missing before continuation");
    }
    synthesizeResult.citation_audit = {
      status: "completed",
      coverage_status: "complete",
      quotes_checked: 1,
      quotes_unmatched: [],
      quotes_unmatched_meta: [],
      attribution_count: 1,
      min_quote_length: 20,
      failed_refs: ["logic (/tmp/missing.md: unreadable or missing)"],
    };
    delete synthesizeResult.citation_audit_rejection;
    await writeYamlDocument(executionResultPath, execution);

    const continuationPlan: ReviewContinuationPlan = {
      schemaVersion: "1",
      sessionId: path.basename(sessionRoot),
      eligible: true,
      ineligibleReason: null,
      sourceRefs: [],
      validationRefs: [],
      unitLedger: {} as ReviewContinuationPlan["unitLedger"],
      frontierUnits: [],
      downstreamUnits: [],
      preservedArtifactRefs: [],
      supersededArtifactRefs: [],
    };

    await executeReviewPromptExecution({
      projectRoot,
      sessionRoot,
      defaultExecutorConfig: { bin: "node", args: [succeedScript] },
      continuationPlan,
    });

    const normalizedExecution = await readYamlDocument<{
      synthesize_execution_result?: {
        citation_audit?: unknown;
        citation_audit_rejection?: { reason?: string };
      } | null;
    }>(executionResultPath);
    const runManifest = await readYamlDocument<{
      worker_units?: Array<{
        unit_id?: string;
        citation_audit?: unknown;
        citation_audit_rejection?: { reason?: string };
      }>;
    }>(path.join(sessionRoot, "review-run-manifest.yaml"));
    const synthesizeManifestUnit = runManifest.worker_units?.find(
      (unit) => unit.unit_id === "synthesize",
    );

    assertEqual(
      normalizedExecution.synthesize_execution_result?.citation_audit,
      undefined,
      "preserved complete citation audit with failed refs omitted from execution result",
    );
    assertEqual(
      normalizedExecution.synthesize_execution_result?.citation_audit_rejection?.reason,
      "contradictory_status_coverage",
      "preserved complete citation audit with failed refs stores rejection",
    );
    assertEqual(
      synthesizeManifestUnit?.citation_audit,
      null,
      "preserved complete citation audit with failed refs normalized to null in manifest",
    );
    assertEqual(
      synthesizeManifestUnit?.citation_audit_rejection?.reason,
      "contradictory_status_coverage",
      "preserved complete citation audit with failed refs stores manifest rejection",
    );
  });

  it("D-21c: preserved valid citation audit clears stale rejection metadata", async () => {
    const { sessionRoot } = await buildMinimalSession("d21c", {
      parentRepoExplorationPolicy: "allowed",
    });
    const execDir = trackCleanup(makeTmpDir("d21c-exec"));
    const succeedScript = createSucceedScript(execDir);

    await executeReviewPromptExecution({
      projectRoot,
      sessionRoot,
      defaultExecutorConfig: { bin: "node", args: [succeedScript] },
    });

    const executionResultPath = path.join(sessionRoot, "execution-result.yaml");
    const execution = await readYamlDocument<Record<string, unknown>>(
      executionResultPath,
    );
    const synthesizeResult = execution.synthesize_execution_result as
      | Record<string, unknown>
      | undefined;
    if (!synthesizeResult) {
      throw new Error("synthesize execution result missing before continuation");
    }
    synthesizeResult.citation_audit = {
      status: "completed",
      coverage_status: "complete",
      quotes_checked: 0,
      quotes_unmatched: [],
      quotes_unmatched_meta: [],
      attribution_count: 0,
      min_quote_length: 20,
    };
    synthesizeResult.citation_audit_rejection = {
      reason: "contradictory_status_coverage",
      status: "skipped",
      coverage_status: "complete",
    };
    await writeYamlDocument(executionResultPath, execution);

    const continuationPlan: ReviewContinuationPlan = {
      schemaVersion: "1",
      sessionId: path.basename(sessionRoot),
      eligible: true,
      ineligibleReason: null,
      sourceRefs: [],
      validationRefs: [],
      unitLedger: {} as ReviewContinuationPlan["unitLedger"],
      frontierUnits: [],
      downstreamUnits: [],
      preservedArtifactRefs: [],
      supersededArtifactRefs: [],
    };

    await executeReviewPromptExecution({
      projectRoot,
      sessionRoot,
      defaultExecutorConfig: { bin: "node", args: [succeedScript] },
      continuationPlan,
    });

    const normalizedExecution = await readYamlDocument<{
      synthesize_execution_result?: {
        citation_audit?: { status?: string; coverage_status?: string };
        citation_audit_rejection?: unknown;
      } | null;
    }>(executionResultPath);
    const runManifest = await readYamlDocument<{
      worker_units?: Array<{
        unit_id?: string;
        citation_audit?: { status?: string; coverage_status?: string } | null;
        citation_audit_rejection?: unknown;
      }>;
    }>(path.join(sessionRoot, "review-run-manifest.yaml"));
    const synthesizeManifestUnit = runManifest.worker_units?.find(
      (unit) => unit.unit_id === "synthesize",
    );

    assertEqual(
      normalizedExecution.synthesize_execution_result?.citation_audit?.status,
      "completed",
      "preserved valid citation audit remains in execution result",
    );
    assertEqual(
      normalizedExecution.synthesize_execution_result?.citation_audit_rejection,
      undefined,
      "stale citation audit rejection removed from execution result",
    );
    assertEqual(
      synthesizeManifestUnit?.citation_audit?.status,
      "completed",
      "preserved valid citation audit remains in run manifest",
    );
    assertEqual(
      synthesizeManifestUnit?.citation_audit_rejection,
      null,
      "stale citation audit rejection normalized to null in run manifest",
    );
  });

  it("D-22: executor-reported host runtime is preserved in unit artifacts", async () => {
    const { sessionRoot } = await buildMinimalSession("d22", {
      parentRepoExplorationPolicy: "allowed",
    });
    const execDir = trackCleanup(makeTmpDir("d22-exec"));
    const succeedScript = createSucceedScript(execDir, {
      stdoutMetadata: {
        host_runtime: "anthropic",
      },
    });

    await executeReviewPromptExecution({
      projectRoot,
      sessionRoot,
      defaultExecutorConfig: { bin: "node", args: [succeedScript] },
    });

    const execution = await readYamlDocument<{
      synthesize_execution_result?: {
        executor_host_runtime?: string | null;
      } | null;
    }>(path.join(sessionRoot, "execution-result.yaml"));
    const runManifest = await readYamlDocument<{
      worker_units?: Array<{
        unit_id?: string;
        executor_host_runtime?: string | null;
      }>;
    }>(path.join(sessionRoot, "review-run-manifest.yaml"));
    const synthesizeManifestUnit = runManifest.worker_units?.find(
      (unit) => unit.unit_id === "synthesize",
    );

    assertEqual(
      execution.synthesize_execution_result?.executor_host_runtime,
      "anthropic",
      "executor host runtime preserved in execution result",
    );
    assertEqual(
      synthesizeManifestUnit?.executor_host_runtime,
      "anthropic",
      "executor host runtime preserved in run manifest unit",
    );
  });
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterAll(() => {
  for (const dir of cleanupDirs) {
    rmDir(dir);
  }
});
