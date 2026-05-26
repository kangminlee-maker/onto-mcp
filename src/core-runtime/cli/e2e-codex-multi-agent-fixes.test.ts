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
// B. OntoSettings llm model switcher (settings-chain.ts)
// ---------------------------------------------------------------------------

describe("B. settings-chain llm model switcher", () => {
  it("B-1: llm switcher parsed from project settings", async () => {
    const homeDir = trackCleanup(makeTmpDir("b1h"));
    const projDir = trackCleanup(makeTmpDir("b1p"));
    writeJson(projectSettingsPath(projDir), {
      review: {
        execution: {
          mode: "main-workers",
          teamlead: { seat: "main", llm: "inherit" },
          lens: { seat: "worker", llm: "inherit" },
          synthesize: { seat: "worker", llm: "inherit" },
          deliberation: "controlled-lens-deliberation",
        },
      },
      llm: { auth: "oauth", provider: "openai", model: "gpt-5.4", effort: "xhigh" },
    });
    const config = await withHomeDir(homeDir, () => resolveSettingsChain(homeDir, projDir));
    assertEqual(config.llm?.auth, "oauth", "llm.auth parsed");
    assertEqual(config.llm?.provider, "openai", "llm.provider parsed");
    assertEqual(config.llm?.model, "gpt-5.4", "llm.model parsed");
    assertEqual(config.llm?.effort, "xhigh", "llm.effort parsed");
  });

  it("B-2: project llm switcher overrides home", async () => {
    const homeDir = trackCleanup(makeTmpDir("b2h"));
    const projDir = trackCleanup(makeTmpDir("b2p"));
    await withHomeDir(homeDir, async () => {
      writeJson(userSettingsPath(), {
        review: {
          execution: {
            mode: "main-workers",
            teamlead: { seat: "main", llm: "inherit" },
            lens: { seat: "worker", llm: "inherit" },
            synthesize: { seat: "worker", llm: "inherit" },
            deliberation: "controlled-lens-deliberation",
          },
        },
        llm: { auth: "oauth", provider: "openai", model: "gpt-5.3", effort: "high" },
      });
      writeJson(projectSettingsPath(projDir), {
        review: {
          execution: {
            mode: "main-workers",
            teamlead: { seat: "main", llm: "inherit" },
            lens: { seat: "worker", llm: "inherit" },
            synthesize: { seat: "worker", llm: "inherit" },
            deliberation: "controlled-lens-deliberation",
          },
        },
        llm: { auth: "oauth", provider: "openai", model: "gpt-5.4", effort: "xhigh" },
      });
    });
    const config = await withHomeDir(homeDir, () => resolveSettingsChain(homeDir, projDir));
    assertEqual(config.llm?.model, "gpt-5.4", "project llm.model wins");
    assertEqual(config.llm?.effort, "xhigh", "project llm.effort wins");
  });

  it("B-3: review block coexists with llm switcher", async () => {
    const homeDir = trackCleanup(makeTmpDir("b3h"));
    const projDir = trackCleanup(makeTmpDir("b3p"));
    writeJson(projectSettingsPath(projDir), {
      review: {
        execution: {
          mode: "main-workers",
          teamlead: { seat: "main", llm: "inherit" },
          lens: { seat: "worker", llm: "inherit" },
          synthesize: { seat: "worker", llm: "inherit" },
          deliberation: "controlled-lens-deliberation",
        },
      },
      llm: {
        auth: "api_key",
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        effort: "medium",
      },
    });
    const config = await withHomeDir(homeDir, () => resolveSettingsChain(homeDir, projDir));
    assertEqual(config.review?.execution.mode, "main-workers", "review execution parsed");
    assertEqual(config.llm?.provider, "anthropic", "llm.provider parsed");
    assertEqual(config.llm?.model, "claude-sonnet-4-6", "llm.model parsed");
  });

  it("B-4: missing llm switcher -> undefined", async () => {
    const homeDir = trackCleanup(makeTmpDir("b4h"));
    const projDir = trackCleanup(makeTmpDir("b4p"));
    writeJson(projectSettingsPath(projDir), {
      review: {
        execution: {
          mode: "main-workers",
          teamlead: { seat: "main", llm: "inherit" },
          lens: { seat: "worker", llm: "inherit" },
          synthesize: { seat: "worker", llm: "inherit" },
          deliberation: "controlled-lens-deliberation",
        },
      },
    });
    const config = await withHomeDir(homeDir, () => resolveSettingsChain(homeDir, projDir));
    assertEqual(config.llm, undefined, "llm absent -> undefined");
  });

  it("B-5: empty llm switcher -> empty object", async () => {
    const homeDir = trackCleanup(makeTmpDir("b5h"));
    const projDir = trackCleanup(makeTmpDir("b5p"));
    writeJson(projectSettingsPath(projDir), {
      review: {
        execution: {
          mode: "main-workers",
          teamlead: { seat: "main", llm: "inherit" },
          lens: { seat: "worker", llm: "inherit" },
          synthesize: { seat: "worker", llm: "inherit" },
          deliberation: "controlled-lens-deliberation",
        },
      },
      llm: {},
    });
    const config = await withHomeDir(homeDir, () => resolveSettingsChain(homeDir, projDir));
    assert(config.llm !== undefined, "llm namespace exists");
    assertEqual(config.llm?.model, undefined, "llm.model undefined");
    assertEqual(config.llm?.effort, undefined, "llm.effort undefined");
  });

  it("B-6: home llm switcher used when project has no config", async () => {
    const homeDir = trackCleanup(makeTmpDir("b6h"));
    const projDir = trackCleanup(makeTmpDir("b6p"));
    const config = await withHomeDir(homeDir, async () => {
      writeJson(userSettingsPath(), {
        review: {
          execution: {
            mode: "main-workers",
            teamlead: { seat: "main", llm: "inherit" },
            lens: { seat: "worker", llm: "inherit" },
            synthesize: { seat: "worker", llm: "inherit" },
            deliberation: "controlled-lens-deliberation",
          },
        },
        llm: { auth: "oauth", provider: "openai", model: "gpt-5.3", effort: "high" },
      });
      return resolveSettingsChain(homeDir, projDir);
    });
    assertEqual(config.llm?.model, "gpt-5.3", "home llm.model used");
    assertEqual(config.llm?.effort, "high", "home llm.effort used");
  });
});

// ---------------------------------------------------------------------------
// C. appendExecutorModelArgs llm precedence (review-invoke.ts)
//
// We can't import the private function directly, so we test it indirectly
// through the CLI argv interface by checking the resolved executor config.
// Strategy: duplicate the private resolution logic against the canonical
// `llm:` switcher and CLI flags.
//
// For isolated unit testing, we duplicate the function's logic and verify.
// ---------------------------------------------------------------------------

import { readSingleOptionValueFromArgv } from "../review/review-artifact-utils.js";
import { normalizeLlmModelSwitcher } from "../llm/model-switcher.js";

describe("C. llm config precedence", () => {
  // Reproduce appendExecutorModelArgs logic to test the resolution chain
  type OntoConfig = {
    llm?: {
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
    const llmSelection = normalizeLlmModelSwitcher(config?.llm);
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
    const llmSelection = normalizeLlmModelSwitcher(config?.llm);
    return (
      (typeof fromArgv === "string" && fromArgv.length > 0 ? fromArgv : undefined) ??
      llmSelection?.reasoning_effort
    );
  }

  it("C-1: CLI flag wins over everything (model)", () => {
    const config: OntoConfig = {
      llm: { auth: "oauth", provider: "openai", model: "gpt-5.3" },
    };
    const result = resolveModel(["--model", "gpt-5.4"], config);
    assertEqual(result, "gpt-5.4", "CLI flag wins");
  });

  it("C-2: llm model is used when CLI flag is absent", () => {
    const config: OntoConfig = {
      llm: { auth: "api_key", provider: "anthropic", model: "claude-sonnet-4-6" },
    };
    const result = resolveModel([], config);
    assertEqual(result, "claude-sonnet-4-6", "llm.model selected");
  });

  it("C-3: OpenAI OAuth maps to codex runtime while preserving model", () => {
    const config: OntoConfig = {
      llm: { auth: "oauth", provider: "openai", model: "gpt-5.4" },
    };
    const selection = normalizeLlmModelSwitcher(config.llm);
    const result = resolveModel([], config);
    assertEqual(selection?.provider, "codex", "runtime provider");
    assertEqual(result, "gpt-5.4", "llm.model selected");
  });

  it("C-4: llm effort used when CLI reasoning-effort is absent", () => {
    const config: OntoConfig = {
      llm: { auth: "oauth", provider: "openai", effort: "xhigh" },
    };
    const result = resolveEffort([], config);
    assertEqual(result, "xhigh", "llm.effort selected");
  });

  it("C-5: CLI reasoning-effort wins over llm effort", () => {
    const config: OntoConfig = {
      llm: { auth: "oauth", provider: "openai", effort: "xhigh" },
    };
    const result = resolveEffort(["--reasoning-effort", "medium"], config);
    assertEqual(result, "medium", "CLI effort wins");
  });

  it("C-6: invalid llm combination fails loudly", () => {
    const config: OntoConfig = {
      llm: { auth: "oauth", provider: "anthropic", model: "claude-sonnet-4-6" },
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

  async function buildMinimalSession(
    prefix: string,
  ): Promise<{ sessionRoot: string; synthesizeOutputPath: string }> {
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
    fs.writeFileSync(
      path.join(packetRoot, "synthesize.prompt.md"),
      "# Synthesize\nCombine.\n",
      "utf8",
    );
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
        repo_exploration_policy: "denied",
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
        repo_exploration: BOUNDARY_DECISION,
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
        boundary_policy: { web_research: "denied", repo_exploration: "denied", recursive_reference_expansion: "denied", source_mutation: "denied" },
        boundary_presentation: { web_research: "denied", repo_exploration: "denied", recursive_reference_expansion: "denied", source_mutation: "denied" },
        boundary_enforcement_profile: { web_research: "prompt_declared_only", repo_exploration: "prompt_declared_only", recursive_reference_expansion: "prompt_declared_only", source_mutation: "prompt_declared_only" },
        effective_boundary_state: {
          web_research: BOUNDARY_DECISION,
          repo_exploration: BOUNDARY_DECISION,
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
    options?: { hangUnitId?: string; failUnitId?: string },
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
const hangUnitId = ${JSON.stringify(options?.hangUnitId ?? null)};
const failUnitId = ${JSON.stringify(options?.failUnitId ?? null)};
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
  ? "---\\ndeliberation_status: performed\\n---\\n# Synthesize\\nResult.\\n"
  : unitKind === "deliberation" && unitId === "controlled-deliberation"
    ? "---\\ndeliberation_status: performed\\n---\\n# Controlled Deliberation\\nResult.\\n"
  : unitKind === "deliberation"
    ? "# " + unitId + "\\nDeliberation response.\\n"
  : "# " + unitId + "\\nLens result.\\n\\n### Domain Constraints Used\\n- source_doc: fixture\\n  source_version_or_snapshot_id: test\\n  anchor: none\\n\\n### Domain Context Assumptions\\n- none\\n";
fs.writeFileSync(outputPath, output, "utf8");
`, "utf8");
    return scriptPath;
  }

  /** Flaky synthesize executor: tracks attempts via counter file. */
  function createSynthFlakyScript(
    dir: string,
    mode: "fail-then-succeed" | "always-fail",
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
  if (mode === "always-fail" || (mode === "fail-then-succeed" && count === 1)) {
    process.stderr.write("Simulated synthesize failure (attempt " + count + ")\\n");
    process.exit(1);
  }
}
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const output = unitKind === "issue_artifact"
  ? issueArtifactOutput(unitId)
  : unitKind === "synthesize"
  ? "---\\ndeliberation_status: performed\\n---\\n# Synthesize\\nResult.\\n"
  : unitKind === "deliberation" && unitId === "controlled-deliberation"
    ? "---\\ndeliberation_status: performed\\n---\\n# Controlled Deliberation\\nResult.\\n"
  : unitKind === "deliberation"
    ? "# " + unitId + "\\nDeliberation response.\\n"
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
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterAll(() => {
  for (const dir of cleanupDirs) {
    rmDir(dir);
  }
});
