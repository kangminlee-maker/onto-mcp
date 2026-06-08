import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ReviewActorInvocationProfilesArtifact,
  ReviewExecutionPlan,
} from "../core-runtime/review/artifact-types.js";
import {
  assertReviewExecutionPlanSessionBoundary,
} from "../core-runtime/review/execution-plan-boundary.js";
import {
  appendMarkdownLogEntry,
  readYamlDocument,
  writeYamlDocument,
} from "../core-runtime/review/review-artifact-utils.js";
import {
  executeReviewPromptExecution,
} from "../core-runtime/cli/run-review-prompt-execution.js";
import { driveHostOrchestration } from "../core-runtime/cli/host-orchestration-reference-driver.js";
import {
  disableReviewMockRealizationEnv,
  REVIEW_MOCK_REALIZATION_ENV,
  setTemporaryEnv,
} from "../core-runtime/review/test-fixtures/mock-realization.js";
import {
  createOntoReviewCoreApi,
  type OntoReviewCoreApi,
  type ReviewStatus,
} from "./review-api.js";
import { fileSha256IfPresent } from "../core-runtime/pipeline-execution-ledger.js";

const tempRoots: string[] = [];
let originalHome: string | undefined;
let restoreReviewApiEnv: (() => void) | undefined;

beforeEach(async () => {
  restoreReviewApiEnv = setTemporaryEnv({
    [REVIEW_MOCK_REALIZATION_ENV]: "1",
    OPENAI_API_KEY: "test-openai-key",
  });
  originalHome = process.env.HOME;
  const homeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "onto-core-api-home-"));
  tempRoots.push(homeRoot);
  process.env.HOME = homeRoot;
});

async function tempProjectRoot(): Promise<string> {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "onto-core-api-review-"),
  );
  tempRoots.push(projectRoot);
  await fs.writeFile(
    path.join(projectRoot, "target.txt"),
    "progress observer isolation target\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(projectRoot, "target.ts"),
    "export const reviewTarget = 1;\n",
    "utf8",
  );
  await writeDirectCallReviewSettings(projectRoot);
  return projectRoot;
}

async function writeProjectSettings(
  projectRoot: string,
  value: unknown,
): Promise<void> {
  const settingsPath = path.join(projectRoot, ".onto", "settings.json");
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function directCallReviewSettings(args?: {
  artifacts?: Record<string, unknown>;
}): unknown {
  const llm = {
    auth: "api_key",
    provider: "openai",
    model: "mock-model",
  };
  return {
    schema_version: "settings.json/v3",
    review: {
      ...(args?.artifacts ? { artifacts: args.artifacts } : {}),
      execution: {
        topology: "main-workers",
        executor: "direct_call",
        deliberation: "controlled-lens-deliberation",
        artifact_generation_realization: "semantic_mock",
        actors: {
          teamlead: { seat: "main", llm },
          lens: { seat: "worker", llm },
          synthesize: { seat: "worker", llm },
        },
      },
    },
  };
}

async function writeDirectCallReviewSettings(
  projectRoot: string,
  args?: { artifacts?: Record<string, unknown> },
): Promise<void> {
  await writeProjectSettings(projectRoot, directCallReviewSettings(args));
}

afterEach(async () => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  restoreReviewApiEnv?.();
  restoreReviewApiEnv = undefined;
  await Promise.all(
    tempRoots.splice(0).map((root) =>
      fs.rm(root, { recursive: true, force: true }),
    ),
  );
});

async function waitForReviewStatus(
  api: OntoReviewCoreApi,
  sessionRoot: string,
  terminalStatus: ReviewStatus["status"],
): Promise<ReviewStatus> {
  const deadline = Date.now() + 15_000;
  let latest = await api.getReviewStatus(sessionRoot);
  while (Date.now() < deadline) {
    if (latest.status === terminalStatus) return latest;
    await new Promise((resolve) => setTimeout(resolve, 100));
    latest = await api.getReviewStatus(sessionRoot);
  }
  throw new Error(
    `Timed out waiting for review status ${terminalStatus}; latest=${latest.status}`,
  );
}

type ExecutionPlanPathSegment = string | number;

interface ExecutionPlanPathRef {
  label: string;
  segments: ExecutionPlanPathSegment[];
  original: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isExecutionPlanPathKey(key: string): boolean {
  return key === "session_root" || key.endsWith("_path") || key.endsWith("_root");
}

function collectExecutionPlanPathRefs(
  value: unknown,
  segments: ExecutionPlanPathSegment[] = [],
): ExecutionPlanPathRef[] {
  const refs: ExecutionPlanPathRef[] = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      refs.push(...collectExecutionPlanPathRefs(item, [...segments, index]));
    });
    return refs;
  }
  if (!isRecord(value)) return refs;

  for (const [key, nestedValue] of Object.entries(value)) {
    const nestedSegments = [...segments, key];
    if (typeof nestedValue === "string" && isExecutionPlanPathKey(key)) {
      refs.push({
        label: nestedSegments.map(String).join("."),
        segments: nestedSegments,
        original: nestedValue,
      });
    }
    refs.push(...collectExecutionPlanPathRefs(nestedValue, nestedSegments));
  }
  return refs;
}

function setNestedExecutionPlanRef(
  value: unknown,
  segments: ExecutionPlanPathSegment[],
  replacement: string,
): void {
  if (segments.length === 0) {
    throw new Error("Cannot set an empty execution-plan path ref");
  }

  let cursor = value;
  for (const segment of segments.slice(0, -1)) {
    if (Array.isArray(cursor)) {
      cursor = cursor[Number(segment)];
    } else if (isRecord(cursor)) {
      cursor = cursor[String(segment)];
    } else {
      throw new Error(`Cannot traverse execution-plan path ref ${segments.join(".")}`);
    }
  }

  const finalSegment = segments[segments.length - 1];
  if (Array.isArray(cursor)) {
    cursor[Number(finalSegment)] = replacement;
    return;
  }
  if (isRecord(cursor)) {
    cursor[String(finalSegment)] = replacement;
    return;
  }
  throw new Error(`Cannot set execution-plan path ref ${segments.join(".")}`);
}

function cloneReviewExecutionPlan(plan: ReviewExecutionPlan): ReviewExecutionPlan {
  return JSON.parse(JSON.stringify(plan)) as ReviewExecutionPlan;
}

describe("createOntoReviewCoreApi", () => {
  it("lists software-engineering as the canonical AI-era engineering domain", async () => {
    const projectRoot = await tempProjectRoot();
    await fs.mkdir(path.join(projectRoot, ".onto", "domains", "software-engineering"), {
      recursive: true,
    });
    await fs.mkdir(path.join(projectRoot, ".onto", "domains", "llm-native-development"), {
      recursive: true,
    });

    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });

    const domains = await api.listDomains(projectRoot);
    expect(domains).toContain("software-engineering");
    expect(domains).not.toContain("llm-native-development");
  });

  it("prepares sidecar lens output contract as a deterministic contract check", async () => {
    const projectRoot = await tempProjectRoot();
    await writeDirectCallReviewSettings(projectRoot, {
      artifacts: {
        lens_output_format: "sidecar",
        write_lens_markdown: true,
      },
    });
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });

    const prepared = await api.prepareReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API sidecar contract review",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic", "coverage"],
    });

    const executionPlan = await readYamlDocument<ReviewExecutionPlan>(
      path.join(prepared.sessionRoot, "execution-plan.yaml"),
    );
    expect(executionPlan.lens_output_format).toBe("sidecar");
    expect(executionPlan.write_lens_markdown).toBe(true);
    expect(
      executionPlan.lens_prompt_packet_seats[0]?.sidecar_output_path,
    ).toContain("logic.findings.yaml");
    expect(
      executionPlan.lens_prompt_packet_seats[1]?.sidecar_output_path,
    ).toContain("coverage.findings.yaml");
  });

  it("drives a host-orchestrated session through reviewRound/reviewAdvance", async () => {
    const projectRoot = await tempProjectRoot();
    // Host-orchestrated session with markdown lenses (simple mock seats).
    await writeProjectSettings(projectRoot, {
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
            teamlead: { seat: "main", llm: { auth: "api_key", provider: "openai", model: "mock-model" } },
            lens: { seat: "worker", llm: { auth: "api_key", provider: "openai", model: "mock-model" } },
            synthesize: { seat: "worker", llm: { auth: "api_key", provider: "openai", model: "mock-model" } },
          },
        },
      },
    });
    const api = createOntoReviewCoreApi({ ontoHome: path.resolve(".") });
    const prepared = await api.prepareReview({
      projectRoot,
      target: "target.txt",
      intent: "Host orchestration round contract",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic", "coverage"],
    });
    const plan = await readYamlDocument<ReviewExecutionPlan>(
      path.join(prepared.sessionRoot, "execution-plan.yaml"),
    );
    expect(plan.orchestration).toBe("host");

    // Round 1: onto reports the lens units ready for the host to execute.
    const round = await api.reviewRound({ sessionRoot: prepared.sessionRoot });
    expect(round.status).toBe("in_progress");
    if (round.status !== "in_progress") return;
    expect(round.readyUnits.map((u) => u.unit_id).sort()).toEqual([
      "coverage",
      "logic",
    ]);
    expect(round.readyUnits.every((u) => u.unit_kind === "lens")).toBe(true);

    // The host executes the lenses -> writes their seats.
    for (const seat of plan.lens_execution_seats) {
      await fs.writeFile(seat.output_path, `# ${seat.lens_id} findings\n`, "utf8");
    }

    // Advance: onto validates the seats and returns the next round.
    const advance = await api.reviewAdvance({
      sessionRoot: prepared.sessionRoot,
      executed: ["logic", "coverage"],
    });
    expect(advance.status).toBe("in_progress");
    if (advance.status !== "in_progress") return;
    expect(advance.readyUnits.map((u) => u.unit_id)).toEqual(["finding-ledger"]);
    expect(advance.readyUnits[0]?.unit_kind).toBe("issue_artifact");
  });

  it("reference host driver advances a host session deterministically (mock)", async () => {
    const projectRoot = await tempProjectRoot();
    await writeProjectSettings(projectRoot, {
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
            teamlead: { seat: "main", llm: { auth: "api_key", provider: "openai", model: "mock-model" } },
            lens: { seat: "worker", llm: { auth: "api_key", provider: "openai", model: "mock-model" } },
            synthesize: { seat: "worker", llm: { auth: "api_key", provider: "openai", model: "mock-model" } },
          },
        },
      },
    });
    const api = createOntoReviewCoreApi({ ontoHome: path.resolve(".") });
    const prepared = await api.prepareReview({
      projectRoot,
      target: "target.txt",
      intent: "Reference host driver mock run",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic", "coverage"],
    });
    const plan = await readYamlDocument<ReviewExecutionPlan>(
      path.join(prepared.sessionRoot, "execution-plan.yaml"),
    );

    // Mock executor: write a deterministic seat at each unit's output path.
    const mockExecutor = async (unit: { unit_id: string; output_path: string | null }) => {
      if (!unit.output_path) throw new Error(`unit ${unit.unit_id} has no output path`);
      if (unit.unit_id === "finding-ledger") {
        await writeYamlDocument(unit.output_path, {
          session_id: plan.session_id,
          findings: [],
        });
        return;
      }
      await fs.writeFile(unit.output_path, `# ${unit.unit_id}\n`, "utf8");
    };

    // Two rounds: lens stage -> finding-ledger stage. Bounded so the mock never
    // has to satisfy the deeper issue-artifact schemas.
    const run = await driveHostOrchestration({
      sessionRoot: prepared.sessionRoot,
      executeUnit: mockExecutor,
      maxRounds: 2,
    });

    expect(run.finalStatus).toBe("max_rounds");
    expect(run.roundCount).toBe(2);
    expect(run.executedUnitIds).toContain("logic");
    expect(run.executedUnitIds).toContain("coverage");
    expect(run.executedUnitIds).toContain("finding-ledger");
    expect(run.executedUnitIds[run.executedUnitIds.length - 1]).toBe(
      "finding-ledger",
    );
  });

  it("fails loudly when a present review-record is malformed", async () => {
    const projectRoot = await tempProjectRoot();
    await writeDirectCallReviewSettings(projectRoot);
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });

    const prepared = await api.prepareReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API malformed ReviewRecord fail-loud test",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
    });
    await fs.writeFile(
      path.join(prepared.sessionRoot, "review-record.yaml"),
      "schema_version: [unterminated\n",
      "utf8",
    );

    await expect(api.getReviewStatus(prepared.sessionRoot)).rejects.toThrow(
      /review-record.yaml/,
    );
  });

  it("fails loudly when completed terminal synthesis output is untrusted", async () => {
    const projectRoot = await tempProjectRoot();
    await writeDirectCallReviewSettings(projectRoot);
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });

    const result = await api.runReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API terminal ledger trust fail-loud test",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
    });
    await fs.appendFile(
      path.join(result.sessionRoot, "synthesis.md"),
      "\nTampered after completion.\n",
      "utf8",
    );

    await expect(api.getReviewStatus(result.sessionRoot)).rejects.toThrow(
      /ReviewRecord\.synthesis_output_sha256 mismatch/,
    );
    await expect(api.getReviewResult(result.sessionRoot)).rejects.toThrow(
      /ReviewRecord\.synthesis_output_sha256 mismatch/,
    );
  });

  it("fails loudly when immediate runReview completion observes tampered terminal artifacts", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });

    await expect(
      api.runReview({
        projectRoot,
        target: "target.txt",
        intent: "Core API immediate completion trust fail-loud test",
        noDomain: true,
        reviewMode: "core-axis",
        lensIds: ["logic"],
        progressObserver: (event) => {
          if (
            event.progress.label === "complete" &&
            event.progress.current === 95 &&
            event.session_root
          ) {
            fsSync.appendFileSync(
              path.join(event.session_root, "final-output.md"),
              "\nTampered before immediate result projection.\n",
              "utf8",
            );
          }
        },
      }),
    ).rejects.toThrow(/final_output_sha256 mismatch/);
  });

  it("returns canonical artifact paths from immediate runReview completion", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const externalOutput = path.join(projectRoot, "external-final-output.md");
    await fs.writeFile(externalOutput, "# external output\n", "utf8");

    const result = await api.runReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API immediate completion canonical path test",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
      progressObserver: (event) => {
        if (
          event.progress.label === "complete" &&
          event.progress.current === 95 &&
          event.session_root
        ) {
          const bindingPath = path.join(event.session_root, "binding.yaml");
          const bindingText = fsSync.readFileSync(bindingPath, "utf8");
          fsSync.writeFileSync(
            bindingPath,
            bindingText.replace(
              /^final_output_path: .+$/m,
              `final_output_path: ${externalOutput}`,
            ),
            "utf8",
          );
        }
      },
    });

    expect(result.status).toBe("completed");
    expect(result.finalOutputPath).toBe(
      path.join(result.sessionRoot, "final-output.md"),
    );
    expect(result.reviewRecordPath).toBe(
      path.join(result.sessionRoot, "review-record.yaml"),
    );
    expect(result.executionResultPath).toBe(
      path.join(result.sessionRoot, "execution-result.yaml"),
    );
    const finalResultInput = result.llmPresentation?.finalResult?.input as
      | {
          review_result_summary?: {
            final_output_path?: string;
            review_record_path?: string;
            execution_result_path?: string;
          };
        }
      | undefined;
    expect(finalResultInput?.review_result_summary?.final_output_path).toBe(
      path.join(result.sessionRoot, "final-output.md"),
    );
  });

  it("fails loudly when completed terminal ledger is blocked by untrusted upstream artifacts", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });

    const result = await api.runReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API terminal upstream trust fail-loud test",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
    });
    await fs.appendFile(
      path.join(result.sessionRoot, "deliberation-resolution.yaml"),
      "\ntampered: true\n",
      "utf8",
    );

    await expect(api.getReviewStatus(result.sessionRoot)).rejects.toThrow(
      /ReviewRecord\.deliberation_result_sha256 mismatch/,
    );
    await expect(api.getReviewResult(result.sessionRoot)).rejects.toThrow(
      /ReviewRecord\.deliberation_result_sha256 mismatch/,
    );
  });

  it("fails loudly when synthesis provenance redirects away from canonical terminal artifacts", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });

    const result = await api.runReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API terminal synthesis provenance redirect fail-loud test",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
    });
    const alternateRoot = path.join(result.sessionRoot, "alt-provenance");
    await fs.mkdir(alternateRoot);
    const alternateSynthesisLedger = path.join(alternateRoot, "synthesis-ledger.yaml");
    const alternateSynthesisOutput = path.join(alternateRoot, "synthesis.md");
    await fs.copyFile(
      path.join(result.sessionRoot, "synthesis-ledger.yaml"),
      alternateSynthesisLedger,
    );
    await fs.copyFile(
      path.join(result.sessionRoot, "synthesis.md"),
      alternateSynthesisOutput,
    );
    const manifestPath = path.join(result.sessionRoot, "review-run-manifest.yaml");
    const manifest = await readYamlDocument<Record<string, unknown>>(manifestPath);
    manifest.synthesis_provenance = {
      synthesis_executed: true,
      synthesis_ledger_path: alternateSynthesisLedger,
      synthesis_ledger_sha256: await fileSha256IfPresent(alternateSynthesisLedger),
      synthesis_output_path: alternateSynthesisOutput,
      synthesis_output_sha256: await fileSha256IfPresent(alternateSynthesisOutput),
    };
    await writeYamlDocument(manifestPath, manifest);

    await expect(api.getReviewStatus(result.sessionRoot)).rejects.toThrow(
      /synthesis_ledger_path mismatch/,
    );
    await expect(api.getReviewResult(result.sessionRoot)).rejects.toThrow(
      /synthesis_ledger_path mismatch/,
    );
  });

  it("fails loudly when terminal synthesis artifacts and mutable manifest hashes are co-tampered", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });

    const result = await api.runReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API terminal synthesis co-tamper fail-loud test",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
    });
    const synthesisLedgerPath = path.join(result.sessionRoot, "synthesis-ledger.yaml");
    const synthesisOutputPath = path.join(result.sessionRoot, "synthesis.md");
    await fs.writeFile(
      synthesisLedgerPath,
      "schema_version: '1'\nshared_phenomenon_summary: []\nco_tampered: true\n",
      "utf8",
    );
    await fs.writeFile(
      synthesisOutputPath,
      "---\ndeliberation_status: performed\n---\n# Co-tampered synthesis\n",
      "utf8",
    );

    const tamperedLedgerHash = await fileSha256IfPresent(synthesisLedgerPath);
    const tamperedOutputHash = await fileSha256IfPresent(synthesisOutputPath);
    const manifestPath = path.join(result.sessionRoot, "review-run-manifest.yaml");
    const manifest = await readYamlDocument<Record<string, unknown>>(manifestPath);
    manifest.synthesis_provenance = {
      synthesis_executed: true,
      synthesis_ledger_path: synthesisLedgerPath,
      synthesis_ledger_sha256: tamperedLedgerHash,
      synthesis_output_path: synthesisOutputPath,
      synthesis_output_sha256: tamperedOutputHash,
    };
    if (Array.isArray(manifest.worker_units)) {
      manifest.worker_units = manifest.worker_units.map((item) => {
        if (item === null || typeof item !== "object" || Array.isArray(item)) {
          return item;
        }
        const unit = item as Record<string, unknown>;
        if (unit.unit_id !== "synthesize") return unit;
        if (unit.output_path === synthesisLedgerPath) {
          return { ...unit, output_sha256: tamperedLedgerHash };
        }
        if (unit.output_path === synthesisOutputPath) {
          return { ...unit, output_sha256: tamperedOutputHash };
        }
        return unit;
      });
    }
    await writeYamlDocument(manifestPath, manifest);

    await expect(api.getReviewStatus(result.sessionRoot)).rejects.toThrow(
      /ReviewRecord\.synthesis_result_sha256 mismatch/,
    );
    await expect(api.getReviewResult(result.sessionRoot)).rejects.toThrow(
      /ReviewRecord\.synthesis_result_sha256 mismatch/,
    );
  });

  it("fails loudly when completed ReviewRecord final output is missing", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });

    const result = await api.runReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API final output required artifact fail-loud test",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
    });
    await fs.rm(path.join(result.sessionRoot, "final-output.md"));

    await expect(api.getReviewStatus(result.sessionRoot)).rejects.toThrow(
      /final_output_ref points to a missing file/,
    );
    await expect(
      api.getReviewResult(result.sessionRoot, { projectionLevel: "full" }),
    ).rejects.toThrow(/final_output_ref points to a missing file/);
  });

  it("fails loudly when completed ReviewRecord final output hash mismatches", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });

    const result = await api.runReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API final output hash fail-loud test",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
    });
    await fs.appendFile(
      path.join(result.sessionRoot, "final-output.md"),
      "\nTampered final output.\n",
      "utf8",
    );

    await expect(api.getReviewStatus(result.sessionRoot)).rejects.toThrow(
      /final_output_sha256 mismatch/,
    );
    await expect(
      api.getReviewResult(result.sessionRoot, { projectionLevel: "full" }),
    ).rejects.toThrow(/final_output_sha256 mismatch/);
  });

  it("fails loudly when ReviewRecord final_output_ref redirects away from canonical final-output.md", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });

    const result = await api.runReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API final output canonical path fail-loud test",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
    });
    const alternateOutput = path.join(result.sessionRoot, "alt-output.md");
    await fs.copyFile(path.join(result.sessionRoot, "final-output.md"), alternateOutput);
    await fs.writeFile(
      path.join(result.sessionRoot, "final-output.md"),
      "# Corrupted canonical final output\n",
      "utf8",
    );
    const reviewRecordPath = path.join(result.sessionRoot, "review-record.yaml");
    const reviewRecord = await readYamlDocument<Record<string, unknown>>(
      reviewRecordPath,
    );
    reviewRecord.final_output_ref = "alt-output.md";
    await writeYamlDocument(reviewRecordPath, reviewRecord);

    await expect(api.getReviewStatus(result.sessionRoot)).rejects.toThrow(
      /ReviewRecord\.final_output_ref mismatch/,
    );
    await expect(
      api.getReviewResult(result.sessionRoot, { projectionLevel: "full" }),
    ).rejects.toThrow(/ReviewRecord\.final_output_ref mismatch/);
  });

  it("fails loudly when ReviewRecord terminal refs escape the session", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });

    const result = await api.runReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API ReviewRecord terminal refs canonical path test",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
    });
    const reviewRecordPath = path.join(result.sessionRoot, "review-record.yaml");
    const reviewRecord = await readYamlDocument<Record<string, unknown>>(
      reviewRecordPath,
    );
    reviewRecord.synthesis_result_ref = "/tmp/fake-synthesis-ledger.yaml";
    reviewRecord.deliberation_result_ref = "alt-resolution.yaml";
    await writeYamlDocument(reviewRecordPath, reviewRecord);

    await expect(api.getReviewStatus(result.sessionRoot)).rejects.toThrow(
      /ReviewRecord\.synthesis_result_ref.*escapes allowed root/,
    );
    await expect(
      api.getReviewResult(result.sessionRoot, { projectionLevel: "full" }),
    ).rejects.toThrow(/ReviewRecord\.synthesis_result_ref.*escapes allowed root/);
  });

  it("fails loudly when ReviewRecord terminal refs redirect inside the session", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });

    const result = await api.runReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API ReviewRecord terminal refs internal redirect test",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
    });
    const alternateSynthesisLedger = path.join(result.sessionRoot, "alt-ledger.yaml");
    const alternateResolution = path.join(result.sessionRoot, "alt-resolution.yaml");
    await fs.copyFile(
      path.join(result.sessionRoot, "synthesis-ledger.yaml"),
      alternateSynthesisLedger,
    );
    await fs.copyFile(
      path.join(result.sessionRoot, "deliberation-resolution.yaml"),
      alternateResolution,
    );
    const reviewRecordPath = path.join(result.sessionRoot, "review-record.yaml");
    const reviewRecord = await readYamlDocument<Record<string, unknown>>(
      reviewRecordPath,
    );
    reviewRecord.synthesis_result_ref = "alt-ledger.yaml";
    reviewRecord.deliberation_result_ref = "alt-resolution.yaml";
    await writeYamlDocument(reviewRecordPath, reviewRecord);

    await expect(api.getReviewStatus(result.sessionRoot)).rejects.toThrow(
      /ReviewRecord\.synthesis_result_ref mismatch/,
    );
    await expect(
      api.getReviewResult(result.sessionRoot, { projectionLevel: "full" }),
    ).rejects.toThrow(/ReviewRecord\.synthesis_result_ref mismatch/);
  });

  it("uses ReviewRecord classification summary instead of recomputing completed results from mutable ledgers", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });

    const result = await api.runReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API ReviewRecord classification authority test",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
    });
    const reviewRecordPath = path.join(result.sessionRoot, "review-record.yaml");
    const reviewRecord = await readYamlDocument<Record<string, unknown>>(
      reviewRecordPath,
    );
    const storedSummary = {
      highest_severity: "medium",
      finding_count: 0,
      issue_count: 1,
      finding_severity_counts: {
        blocker: 0,
        high: 0,
        medium: 0,
        low: 0,
        info: 0,
      },
      issue_severity_counts: {
        blocker: 0,
        high: 0,
        medium: 1,
        low: 0,
        info: 0,
      },
      severity_counts: {
        blocker: 0,
        high: 0,
        medium: 1,
        low: 0,
        info: 0,
      },
      material_issue_count: 1,
      non_material_finding_count: 0,
      material_issues: [
        {
          issue_id: "record-authority-medium",
          severity: "medium",
          material: true,
          affected_purpose: "ReviewRecord authority",
          failure_condition: "completed result projection",
          impact: "stored summary must be used",
          evidence_refs: ["review-record.yaml#result_classification_summary"],
          source_lens_ids: ["logic"],
          action_candidates: ["follow_up"],
          rationale: "fixture summary stored in ReviewRecord",
        },
      ],
      non_material_findings: [],
      action_candidates: [
        {
          issue_id: "record-authority-medium",
          candidates: ["follow_up"],
          derivation_refs: ["review-record.yaml"],
          rationale: "fixture summary stored in ReviewRecord",
        },
      ],
    };
    reviewRecord.result_classification_summary = storedSummary;
    await writeYamlDocument(reviewRecordPath, reviewRecord);

    const fullResult = await api.getReviewResult(result.sessionRoot, {
      projectionLevel: "full",
    });
    const fullStatus = await api.getReviewStatus(result.sessionRoot, {
      projectionLevel: "full",
    });
    const progressInput = fullStatus.llmPresentation?.progress?.input as
      | { result_classification_summary?: unknown }
      | undefined;
    expect(fullResult.resultClassificationSummary).toEqual(storedSummary);
    expect(progressInput?.result_classification_summary).toEqual(storedSummary);
  });

  it("keeps native progress observer failures isolated from review execution", async () => {
    const projectRoot = await tempProjectRoot();
    let observedProgressEvents = 0;
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });

    const result = await api.runReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API progress observer isolation test",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
      progressObserver: () => {
        observedProgressEvents += 1;
        throw new Error("observer transport failure");
      },
    });

    expect(observedProgressEvents).toBeGreaterThan(0);
    expect(result.status).toBe("completed");
    expect(result.participatingLensIds).toEqual(["logic"]);
    expect(result.resultOverview).toBeUndefined();
    expect(
      (result.startPreview?.entrypointPlan as { request_text?: string } | undefined)
        ?.request_text?.length,
    ).toBeLessThanOrEqual(360);
    expect(
      result.startPreview?.boundedInvokeSteps?.every((step) => step.length <= 360),
    ).toBe(true);
    expect(result.pipelineExecutionLedger?.pipeline).toBe("review");
    expect(
      result.pipelineExecutionLedger?.units.find((unit) => unit.unitId === "logic")
        ?.trustStatus,
    ).toBe("trusted");
    expect(
      result.pipelineExecutionLedger?.units.find((unit) => unit.unitId === "logic"),
    ).not.toHaveProperty("trustReason");
    expect(
      (result.resultClassificationSummary as { material_issues?: unknown } | undefined)
        ?.material_issues,
    ).toBeUndefined();
    expect(
      (
        result.llmPresentation?.finalResult?.input as
          | {
              result_classification_summary?: {
                material_issues?: unknown;
                material_issue_signals?: unknown;
              };
              review_result?: unknown;
              review_result_summary?: unknown;
            }
          | undefined
      )?.result_classification_summary?.material_issues,
    ).toBeUndefined();
    expect(
      (
        result.llmPresentation?.finalResult?.input as
          | {
              result_classification_summary?: {
                material_issue_signals?: unknown;
              };
              review_result?: unknown;
              review_result_summary?: unknown;
            }
          | undefined
      )?.result_classification_summary?.material_issue_signals,
    ).toEqual(expect.any(Array));
    expect(
      (result.llmPresentation?.finalResult?.input as { review_result?: unknown })
        ?.review_result,
    ).toBeUndefined();
    expect(
      (
        result.llmPresentation?.finalResult?.input as {
          review_result_summary?: unknown;
        }
      )?.review_result_summary,
    ).toEqual(expect.any(Object));
    expect(
      (
        result.llmPresentation?.openingBrief?.input as
          | {
              execution_plan?: {
                lens_ids?: { items?: unknown[]; total_count?: number };
              };
            }
          | undefined
      )?.execution_plan?.lens_ids,
    ).toMatchObject({
      items: ["logic"],
      total_count: 1,
    });

    const status = await api.getReviewStatus(result.sessionRoot);
    expect(status.pipelineExecutionLedger?.sessionId).toBe(result.sessionId);
    expect(
      status.pipelineExecutionLedger?.units.find((unit) => unit.unitId === "synthesize")
        ?.status,
    ).toBe("completed");
    expect(status.continuationPlan?.eligible).toBe(false);
    expect(status.continuationPlan?.ineligibleReason).toBe(
      "No untrusted continuation frontier remains.",
    );
  });

  it("rejects retired domain aliases before dispatch", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });

    await expect(
      api.prepareReview({
        projectRoot,
        target: "target.txt",
        intent: "Core API domain alias test",
        domain: "software-development",
        reviewMode: "core-axis",
        lensIds: ["logic"],
      }),
    ).rejects.toMatchObject({
      name: "ReviewDomainResolutionError",
    });
  });

  it("rejects unknown domains with suggestion or unknown runtime resolution", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });

    await expect(
      api.prepareReview({
        projectRoot,
        target: "target.txt",
        intent: "Core API domain suggestion test",
        domain: "software",
        reviewMode: "core-axis",
        lensIds: ["logic"],
      }),
    ).rejects.toMatchObject({
      domainResolution: {
        requestedToken: "software",
        resolution: "suggestion",
        suggestionIds: expect.arrayContaining(["software-engineering"]),
      },
    });

    await expect(
      api.prepareReview({
        projectRoot,
        target: "target.txt",
        intent: "Core API unknown domain test",
        domain: "zzzzzz",
        reviewMode: "core-axis",
        lensIds: ["logic"],
      }),
    ).rejects.toMatchObject({
      domainResolution: {
        requestedToken: "zzzzzz",
        resolution: "unknown",
        suggestionIds: [],
      },
    });
  });

  it("returns a running handle, supports latest-session recovery, and blocks duplicate continuation while active", async () => {
    const projectRoot = await tempProjectRoot();
    const previousDelay = process.env.ONTO_REVIEW_MOCK_UNIT_DELAY_MS;
    process.env.ONTO_REVIEW_MOCK_UNIT_DELAY_MS = "120";
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    try {
      const running = await api.runReview({
        projectRoot,
        target: "target.txt",
        intent: "Core API early running handle test",
        noDomain: true,
        reviewMode: "core-axis",
        lensIds: ["logic"],
        returnRunningAfterMs: 0,
      });

      expect(running.status).toBe("running");
      expect(running.runHandle?.sessionRoot).toBe(running.sessionRoot);
      expect(running.runHandle?.requestHash).toEqual(expect.any(String));
      expect(running.runControl?.lifecycleState).toBe("active");
      expect(running.runControl?.alreadyRunning).toBe(true);
      const requestHash = running.runHandle?.requestHash;
      if (!requestHash) {
        throw new Error("running handle requestHash missing");
      }
      const runningProgressInput = running.llmPresentation?.progress?.input as
        | {
            result_classification_summary?: {
              material_issues?: unknown;
              material_issue_signals?: unknown;
            };
          }
        | undefined;
      expect(
        runningProgressInput?.result_classification_summary?.material_issues,
      ).toBeUndefined();
      expect(
        runningProgressInput?.result_classification_summary?.material_issue_signals,
      ).toEqual(expect.any(Array));

      const activeStatus = await api.getReviewStatus(running.sessionRoot);
      expect(activeStatus.status).toBe("running");
      expect(activeStatus.runControl?.alreadyRunning).toBe(true);
      expect(activeStatus.runControl?.activeAttempt?.attemptKind).toBe(
        "initial_review",
      );

      const latestMatches = await api.findLatestReviewSessions({
        projectRoot,
        target: "target.txt",
        domain: "none",
        requestHash,
      });
      expect(latestMatches[0]?.sessionRoot).toBe(running.sessionRoot);

      const duplicateContinue = await api.continueReview({
        projectRoot,
        sessionRoot: running.sessionRoot,
      });
      expect(duplicateContinue.decision).toBe("already_running");
      expect(duplicateContinue.activeAttempt?.attemptId).toBe(
        running.runControl?.activeAttempt?.attemptId,
      );
      expect(
        (
          duplicateContinue.resultClassificationSummary as
            | { material_issues?: unknown; material_issue_signals?: unknown }
            | undefined
        )?.material_issues,
      ).toBeUndefined();
      expect(
        (
          duplicateContinue.resultClassificationSummary as
            | { material_issues?: unknown; material_issue_signals?: unknown }
            | undefined
        )?.material_issue_signals,
      ).toEqual(expect.any(Array));
      expect(
        (
          duplicateContinue.llmPresentation?.progress?.input as
            | {
                result_classification_summary?: {
                  material_issues?: unknown;
                  material_issue_signals?: unknown;
                };
              }
            | undefined
        )?.result_classification_summary?.material_issues,
      ).toBeUndefined();

      const completedStatus = await waitForReviewStatus(
        api,
        running.sessionRoot,
        "completed",
      );
      expect(completedStatus.runControl?.alreadyRunning).toBe(false);
      expect(completedStatus.runControl?.activeAttempt?.status).toBe("completed");
    } finally {
      if (previousDelay === undefined) {
        delete process.env.ONTO_REVIEW_MOCK_UNIT_DELAY_MS;
      } else {
        process.env.ONTO_REVIEW_MOCK_UNIT_DELAY_MS = previousDelay;
      }
    }
  });

  it("records cancellation requests and closes the running review as halted_partial", async () => {
    const projectRoot = await tempProjectRoot();
    const previousDelay = process.env.ONTO_REVIEW_MOCK_UNIT_DELAY_MS;
    process.env.ONTO_REVIEW_MOCK_UNIT_DELAY_MS = "500";
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    try {
      const running = await api.runReview({
        projectRoot,
        target: "target.txt",
        intent: "Core API cancellation request test",
        noDomain: true,
        reviewMode: "core-axis",
        lensIds: ["logic"],
        returnRunningAfterMs: 0,
      });
      expect(running.status).toBe("running");

      const cancelled = await api.cancelReview({
        projectRoot,
        sessionRoot: running.sessionRoot,
        reason: `core api cancellation fixture ${"detail ".repeat(120)}`.trim(),
      });
      expect(cancelled.decision).toBe("requested");
      expect(cancelled.cancelRequestPath).toEqual(expect.any(String));
      await expect(fs.stat(cancelled.cancelRequestPath)).resolves.toMatchObject({
        size: expect.any(Number),
      });

      const haltedStatus = await waitForReviewStatus(
        api,
        running.sessionRoot,
        "halted_partial",
      );
      expect(haltedStatus.runControl?.alreadyRunning).toBe(false);
      const haltedProgressInput = haltedStatus.llmPresentation?.progress?.input as
        | { latest_update?: { summary?: string }; halt?: { reason?: string } }
        | undefined;
      expect(
        haltedProgressInput?.latest_update?.summary?.length,
      ).toBeLessThanOrEqual(360);
      expect(haltedProgressInput?.halt?.reason?.length).toBeLessThanOrEqual(360);
      const fullHaltedStatus = await api.getReviewStatus(running.sessionRoot, {
        projectionLevel: "full",
      });
      const fullHaltedProgressInput = fullHaltedStatus.llmPresentation?.progress?.input as
        | { latest_update?: { summary?: string }; halt?: { reason?: string } }
        | undefined;
      const executionResult = await readYamlDocument<{
        execution_status?: string;
        halt_phase?: string;
        halt_reason?: string;
      }>(path.join(running.sessionRoot, "execution-result.yaml"));
      expect(executionResult.execution_status).toBe("halted_partial");
      expect(executionResult.halt_phase).toBe("cancellation");
      expect(executionResult.halt_reason).toContain("core api cancellation fixture");
      expect(fullHaltedProgressInput?.halt?.reason).toBe(
        executionResult.halt_reason,
      );
    } finally {
      if (previousDelay === undefined) {
        delete process.env.ONTO_REVIEW_MOCK_UNIT_DELAY_MS;
      } else {
        process.env.ONTO_REVIEW_MOCK_UNIT_DELAY_MS = previousDelay;
      }
    }
  });

  it("does not write cancellation requests for prepared sessions", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const prepared = await api.prepareReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API prepared cancellation guard",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
    });

    const cancelled = await api.cancelReview({
      projectRoot,
      sessionRoot: prepared.sessionRoot,
      reason: "should not write",
    });

    expect(cancelled.decision).toBe("not_cancellable");
    expect(cancelled.status).toBe("prepared");
    await expect(fs.stat(cancelled.cancelRequestPath)).rejects.toThrow();
  });

  it("surfaces failed active attempts when no stronger terminal artifact exists", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const prepared = await api.prepareReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API failed active attempt status",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
    });
    const now = new Date().toISOString();
    await writeYamlDocument(path.join(prepared.sessionRoot, "active-review-attempt.yaml"), {
      schema_version: "1",
      attempt_id: "failed-fixture",
      attempt_kind: "initial_review",
      session_id: prepared.sessionId,
      session_root: prepared.sessionRoot,
      project_root: projectRoot,
      created_at: now,
      updated_at: now,
      status: "failed",
      active_units: ["lens:logic"],
      requested_frontier_units: [],
      run_control: {
        stale_after_seconds: 1200,
        source_tool: "onto_review",
        request_hash: null,
      },
      latest_observed_artifact_ref: null,
      error_message: "background fixture failure",
    });

    const status = await api.getReviewStatus(prepared.sessionRoot);
    expect(status.status).toBe("failed");
    expect(status.runControl?.lifecycleState).toBe("failed_attempt");
    expect(status.runControl?.retryAvailable).toBe(true);
  });

  it("derives live lens unit progress from runtime logs and output files", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const prepared = await api.prepareReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API runtime unit progress projection test",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic", "structure", "dependency", "semantics"],
    });
    const executionPlan =
      await readYamlDocument<ReviewExecutionPlan>(
        path.join(prepared.sessionRoot, "execution-plan.yaml"),
      );
    const logicSeat = executionPlan.lens_execution_seats.find(
      (seat) => seat.lens_id === "logic",
    );
    const structureSeat = executionPlan.lens_execution_seats.find(
      (seat) => seat.lens_id === "structure",
    );
    const semanticsSeat = executionPlan.lens_execution_seats.find(
      (seat) => seat.lens_id === "semantics",
    );
    const logicPacket = executionPlan.lens_prompt_packet_seats.find(
      (seat) => seat.lens_id === "logic",
    );
    const structurePacket = executionPlan.lens_prompt_packet_seats.find(
      (seat) => seat.lens_id === "structure",
    );
    const semanticsPacket = executionPlan.lens_prompt_packet_seats.find(
      (seat) => seat.lens_id === "semantics",
    );
    if (
      !logicSeat ||
      !structureSeat ||
      !semanticsSeat ||
      !logicPacket ||
      !structurePacket ||
      !semanticsPacket
    ) {
      throw new Error("expected fixture lens seats");
    }
    const now = new Date().toISOString();
    await writeYamlDocument(
      path.join(prepared.sessionRoot, "active-review-attempt.yaml"),
      {
        schema_version: "1",
        attempt_id: "fixture-active-attempt",
        attempt_kind: "initial_review",
        session_id: path.basename(prepared.sessionRoot),
        session_root: prepared.sessionRoot,
        project_root: projectRoot,
        created_at: now,
        updated_at: now,
        status: "started",
        active_units: [
          "lens:logic",
          "lens:structure",
          "lens:dependency",
          "lens:semantics",
        ],
        requested_frontier_units: [],
        run_control: {
          stale_after_seconds: 1200,
          source_tool: "onto_review",
          request_hash: null,
        },
        latest_observed_artifact_ref: null,
      },
    );
    await appendMarkdownLogEntry(
      executionPlan.error_log_path,
      "runner dispatch started: logic",
      [
        "unit_id: logic",
        "unit_kind: lens",
        `packet_path: ${logicPacket.packet_path}`,
        `output_path: ${logicSeat.output_path}`,
      ].join("\n"),
    );
    await appendMarkdownLogEntry(
      executionPlan.error_log_path,
      "runner dispatch retry: logic",
      [
        "attempt: 1/2",
        "retry_delay_ms: 10",
        "error: fixture retry",
      ].join("\n"),
    );
    await fs.writeFile(
      path.join(path.dirname(logicSeat.output_path), ".logic.running.log"),
      "logic still running\n",
      "utf8",
    );
    await appendMarkdownLogEntry(
      executionPlan.error_log_path,
      "runner dispatch started: structure",
      [
        "unit_id: structure",
        "unit_kind: lens",
        `packet_path: ${structurePacket.packet_path}`,
        `output_path: ${structureSeat.output_path}`,
      ].join("\n"),
    );
    await appendMarkdownLogEntry(
      executionPlan.error_log_path,
      "runner dispatch completed: structure",
      [
        "unit_id: structure",
        "unit_kind: lens",
        `output_path: ${structureSeat.output_path}`,
      ].join("\n"),
    );
    await fs.writeFile(
      structureSeat.output_path,
      "# structure result\n",
      "utf8",
    );
    const longFailureMessage = `fixture failure ${"detail ".repeat(120)}`.trim();
    await appendMarkdownLogEntry(
      executionPlan.error_log_path,
      "lens failure: semantics",
      [
        "unit_id: semantics",
        "unit_kind: lens",
        `packet_path: ${semanticsPacket.packet_path}`,
        `output_path: ${semanticsSeat.output_path}`,
        `message: ${longFailureMessage}`,
      ].join("\n"),
    );

    const status = await api.getReviewStatus(prepared.sessionRoot);
    const logic = status.unitProgress?.find((unit) => unit.unitId === "logic");
    const structure = status.unitProgress?.find(
      (unit) => unit.unitId === "structure",
    );
    const dependency = status.unitProgress?.find(
      (unit) => unit.unitId === "dependency",
    );
    const semantics = status.unitProgress?.find(
      (unit) => unit.unitId === "semantics",
    );
    expect(status.status).toBe("running");
    expect(status.runControl?.activeAttempt?.activeUnits).toEqual(["lens:logic"]);
    expect(logic).toMatchObject({
      publicAlias: "lens:logic",
      status: "retrying",
      attemptCount: 2,
      runningLogRef: path.join(
        path.dirname(logicSeat.output_path),
        ".logic.running.log",
      ),
    });
    expect(structure).toMatchObject({
      publicAlias: "lens:structure",
      status: "completed",
    });
    expect(dependency).toMatchObject({
      publicAlias: "lens:dependency",
      status: "pending",
    });
    expect(semantics).toMatchObject({
      publicAlias: "lens:semantics",
      status: "failed",
      failureMessage: expect.any(String),
    });
    expect(semantics?.failureMessage?.length).toBeLessThanOrEqual(360);
    const progressInput = status.llmPresentation?.progress?.input as
      | {
          progress?: {
            active_units?: string[];
            unit_progress?: Array<{
              unitId: string;
              status: string;
              failureMessage?: string | null;
            }>;
          };
        }
      | undefined;
    const semanticsProgressInput = progressInput?.progress?.unit_progress?.find(
      (unit) => unit.unitId === "semantics",
    );
    expect(progressInput?.progress?.active_units).toEqual(["lens:logic"]);
    expect(
      progressInput?.progress?.unit_progress?.find((unit) => unit.unitId === "logic")
        ?.status,
    ).toBe("retrying");
    expect(semanticsProgressInput?.failureMessage?.length).toBeLessThanOrEqual(
      360,
    );
    const fullStatus = await api.getReviewStatus(prepared.sessionRoot, {
      projectionLevel: "full",
    });
    const fullSemantics = fullStatus.unitProgress?.find(
      (unit) => unit.unitId === "semantics",
    );
    expect(fullSemantics?.failureMessage).toBe(longFailureMessage);
  });

  it("exposes bounded result projections, material support, and isolated environment warnings", async () => {
    const projectRoot = await tempProjectRoot();
    const previousWarning = process.env.ONTO_REVIEW_MOCK_ENV_WARNING;
    const previousDelay = process.env.ONTO_REVIEW_MOCK_UNIT_DELAY_MS;
    process.env.ONTO_REVIEW_MOCK_ENV_WARNING =
      "mock non-fatal worker environment warning";
    process.env.ONTO_REVIEW_MOCK_UNIT_DELAY_MS = "120";
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    try {
      const result = await api.runReview({
        projectRoot,
        target: "target.txt",
        intent: "Core API bounded result projection test",
        noDomain: true,
        reviewMode: "core-axis",
        lensIds: ["logic"],
        returnRunningAfterMs: 0,
      });
      console.warn("unrelated process warning outside review runner prefix");
      const status = await waitForReviewStatus(api, result.sessionRoot, "completed");
      expect(status.targetMaterialSupport).toMatchObject({
        targetMaterialKind: "document",
        supportStatus: "partial",
      });
      expect(status.projectionLevel).toBe("standard");
      expect(
        (status.continuationPlan as { unitLedger?: unknown } | undefined)?.unitLedger,
      ).toBeUndefined();
      expect(status.pipelineExecutionLedger?.units[0]).not.toHaveProperty(
        "trustReason",
      );
      const statusProgressInput = status.llmPresentation?.progress?.input as
        | {
            result_classification_summary?: {
              material_issues?: unknown;
              material_issue_signals?: unknown;
            };
          }
        | undefined;
      expect(
        statusProgressInput?.result_classification_summary?.material_issues,
      ).toBeUndefined();
      expect(
        statusProgressInput?.result_classification_summary?.material_issue_signals,
      ).toEqual(expect.any(Array));
      expect(status.environmentWarnings?.[0]).toMatchObject({
        fatality: "non_fatal",
        affectedCapability: "review_execution_observability",
      });
      expect(status.environmentWarnings?.map((warning) => warning.message))
        .not.toContain("unrelated process warning outside review runner prefix");

      const longIssueText = `long-signal ${"detail ".repeat(120)}`.trim();
      const longIssueId = `issue-${"id".repeat(100)}`;
      const longClassificationSummary = {
        highest_severity: "high",
        finding_count: 0,
        issue_count: 1,
        finding_severity_counts: {
          blocker: 0,
          high: 0,
          medium: 0,
          low: 0,
          info: 0,
        },
        issue_severity_counts: {
          blocker: 0,
          high: 1,
          medium: 0,
          low: 0,
          info: 0,
        },
        severity_counts: {
          blocker: 0,
          high: 1,
          medium: 0,
          low: 0,
          info: 0,
        },
        material_issue_count: 1,
        non_material_finding_count: 0,
        material_issues: [
          {
            issue_id: longIssueId,
            severity: "high",
            material: true,
            affected_purpose: "bounded projection regression test",
            failure_condition: longIssueText,
            impact: longIssueText,
            evidence_refs: ["round1/logic.md#finding-1"],
            source_lens_ids: ["logic"],
            action_candidates: ["fix_before_release"],
            rationale: longIssueText,
            problem_definition: longIssueText,
            issue_statement: longIssueText,
          },
        ],
        non_material_findings: [],
        action_candidates: [
          {
            issue_id: longIssueId,
            candidates: ["fix_before_release"],
            derivation_refs: ["issue-ledger.yaml", "problem-framing.yaml"],
            rationale: longIssueText,
          },
        ],
      };
      const reviewRecordPath = path.join(result.sessionRoot, "review-record.yaml");
      const reviewRecord = await readYamlDocument<Record<string, unknown>>(
        reviewRecordPath,
      );
      reviewRecord.result_classification_summary = longClassificationSummary;
      await writeYamlDocument(reviewRecordPath, reviewRecord);
      const oversizedWarning = `oversized-warning ${"detail ".repeat(120)}`.trim();
      await writeYamlDocument(
        path.join(result.sessionRoot, "environment-warnings.yaml"),
        {
          schema_version: "1",
          session_id: result.sessionId,
          created_at: new Date().toISOString(),
          warnings: Array.from({ length: 6 }, (_, index) => ({
            warningId: `warning-${index}`,
            source: "review_runner_warning",
            message: `${index}: ${oversizedWarning}`,
            fatality: "non_fatal",
            affectedCapability: "review_execution_observability",
            outputTrustImpact: "unknown",
            observedAt: new Date().toISOString(),
          })),
        },
      );
      const defaultStatus = await api.getReviewStatus(result.sessionRoot);
      expect(defaultStatus.projectionLevel).toBe("standard");
      expect(defaultStatus.environmentWarnings).toHaveLength(6);
      expect(
        defaultStatus.environmentWarnings?.every(
          (warning) => warning.message.length <= 360,
        ),
      ).toBe(true);
      expect(defaultStatus.environmentWarnings?.[5]).toMatchObject({
        source: "review_runner_warning_summary",
      });
      const fullStatus = await api.getReviewStatus(result.sessionRoot, {
        projectionLevel: "full",
      });
      expect(fullStatus.projectionLevel).toBe("full");
      expect(
        (fullStatus.continuationPlan as { unitLedger?: unknown } | undefined)
          ?.unitLedger,
      ).toBeDefined();
      expect(fullStatus.environmentWarnings).toHaveLength(6);
      expect(
        fullStatus.environmentWarnings?.[0]?.message.length,
      ).toBeGreaterThan(360);

      const readFileSpy = vi.spyOn(fs, "readFile");
      let compact: Awaited<ReturnType<typeof api.getReviewResult>> | null = null;
      let finalOutputRead = false;
      try {
        const defaultResult = await api.getReviewResult(result.sessionRoot);
        expect(defaultResult.projectionLevel).toBe("standard");
        expect(defaultResult.reviewRecord).toBeUndefined();
        expect(defaultResult.finalOutputText).toBeUndefined();
        expect(
          (
            defaultResult.resultClassificationSummary as
              | { material_issues?: unknown; material_issue_signals?: unknown }
              | undefined
          )?.material_issues,
        ).toBeUndefined();
        expect(
          (
            defaultResult.resultClassificationSummary as
              | { material_issues?: unknown; material_issue_signals?: unknown }
              | undefined
          )?.material_issue_signals,
        ).toEqual(expect.any(Array));
        expect(defaultResult.environmentWarnings).toHaveLength(6);
        expect(
          defaultResult.environmentWarnings?.every(
            (warning) => warning.message.length <= 360,
          ),
        ).toBe(true);
        compact = await api.getReviewResult(result.sessionRoot, {
          projectionLevel: "compact",
        });
        finalOutputRead = readFileSpy.mock.calls.some(([file]) => {
          if (typeof file !== "string") return false;
          return path.resolve(file) === path.resolve(result.finalOutputPath);
        });
      } finally {
        readFileSpy.mockRestore();
      }
      expect(compact).not.toBeNull();
      if (compact === null) throw new Error("compact review result missing");
      expect(compact.projectionLevel).toBe("compact");
      expect(compact.reviewRecord).toBeUndefined();
      expect(compact.finalOutputText).toBeUndefined();
      expect(compact.pipelineExecutionLedger).toBeUndefined();
      expect(finalOutputRead).toBe(false);
      const finalResultInput = compact.llmPresentation?.finalResult?.input as
        | {
            result_classification_summary?: {
              material_issues?: unknown;
              material_issue_signals?: unknown;
            };
          }
        | undefined;
      expect(
        finalResultInput?.result_classification_summary?.material_issues,
      ).toBeUndefined();
      expect(
        finalResultInput?.result_classification_summary?.material_issue_signals,
      ).toEqual(expect.any(Array));
      const progressInput = compact.llmPresentation?.progress?.input as
        | {
            result_classification_summary?: {
              non_material_findings?: unknown;
              non_material_finding_signals?: unknown;
            };
          }
        | undefined;
      expect(
        progressInput?.result_classification_summary?.non_material_findings,
      ).toBeUndefined();
      expect(
        progressInput?.result_classification_summary?.non_material_finding_signals,
      ).toEqual(expect.any(Array));
      const compactSummary = compact.resultClassificationSummary as
        | {
            material_issues?: unknown;
            material_issue_signals?: unknown;
          }
        | undefined;
      expect(compactSummary?.material_issues).toBeUndefined();
      expect(compactSummary?.material_issue_signals).toEqual(expect.any(Array));
      expect(compact.targetMaterialSupport?.supportStatus).toBe("partial");

      const standardReadSpy = vi.spyOn(fs, "readFile");
      let standardFinalOutputRead = false;
      let standard: Awaited<ReturnType<typeof api.getReviewResult>> | null = null;
      try {
        standard = await api.getReviewResult(result.sessionRoot, {
          projectionLevel: "standard",
        });
        standardFinalOutputRead = standardReadSpy.mock.calls.some(([file]) => {
          if (typeof file !== "string") return false;
          return path.resolve(file) === path.resolve(result.finalOutputPath);
        });
      } finally {
        standardReadSpy.mockRestore();
      }
      expect(standard).not.toBeNull();
      if (standard === null) throw new Error("standard review result missing");
      expect(standard.projectionLevel).toBe("standard");
      expect(standard.reviewRecord).toBeUndefined();
      expect(standard.finalOutputText).toBeUndefined();
      expect(standard.reviewRecordSummary.requestText.length).toBeLessThanOrEqual(
        360,
      );
      expect(standard.pipelineExecutionLedger?.units[0]).not.toHaveProperty(
        "trustReason",
      );
      expect(standardFinalOutputRead).toBe(false);
      const standardSummary = standard.resultClassificationSummary as
        | {
            material_issues?: unknown;
            material_issue_signals?: unknown;
          }
        | undefined;
      expect(standardSummary?.material_issues).toBeUndefined();
      expect(standardSummary?.material_issue_signals).toEqual(expect.any(Array));
      const [standardMaterialSignal] =
        (standardSummary?.material_issue_signals as
          | Array<{ issue_id?: string; signal?: string }>
          | undefined) ??
        [];
      expect(standardMaterialSignal?.issue_id?.length).toBeLessThanOrEqual(120);
      expect(standardMaterialSignal?.signal?.length).toBeLessThanOrEqual(360);
      const standardFinalResultInput = standard.llmPresentation?.finalResult?.input as
        | {
            explanation?: {
              final_review_result?: string;
            };
            result_classification_summary?: {
              material_issues?: unknown;
              material_issue_signals?: unknown;
            };
          }
        | undefined;
      expect(
        standardFinalResultInput?.result_classification_summary?.material_issues,
      ).toBeUndefined();
      expect(
        standardFinalResultInput?.result_classification_summary
          ?.material_issue_signals,
      ).toEqual(expect.any(Array));
      expect(
        standardFinalResultInput?.explanation?.final_review_result?.length,
      ).toBeLessThanOrEqual(360);
      const standardProgressInput = standard.llmPresentation?.progress?.input as
        | {
            result_classification_summary?: {
              material_issues?: unknown;
              material_issue_signals?: unknown;
            };
          }
        | undefined;
      expect(
        standardProgressInput?.result_classification_summary?.material_issues,
      ).toBeUndefined();
      expect(
        standardProgressInput?.result_classification_summary
          ?.material_issue_signals,
      ).toEqual(expect.any(Array));

      const full = await api.getReviewResult(result.sessionRoot, {
        projectionLevel: "full",
      });
      expect(full.reviewRecord?.session_id).toBe(result.sessionId);
      expect(full.finalOutputText).toEqual(expect.any(String));
      expect(full.resultClassificationSummary?.material_issues).toEqual(
        expect.any(Array),
      );
      expect(
        full.resultClassificationSummary?.material_issues[0]?.problem_definition,
      ).toBe(longIssueText);
      expect(full.environmentWarnings).toHaveLength(6);
      expect(full.environmentWarnings?.[0]?.message.length).toBeGreaterThan(360);
      const fullFinalResultInput = full.llmPresentation?.finalResult?.input as
        | {
            review_record?: unknown;
            result_classification_summary?: {
              material_issues?: unknown;
            };
          }
        | undefined;
      expect(fullFinalResultInput?.review_record).toEqual(
        expect.objectContaining({ session_id: result.sessionId }),
      );
      expect(
        fullFinalResultInput?.result_classification_summary?.material_issues,
      ).toEqual(expect.any(Array));
    } finally {
      if (previousWarning === undefined) {
        delete process.env.ONTO_REVIEW_MOCK_ENV_WARNING;
      } else {
        process.env.ONTO_REVIEW_MOCK_ENV_WARNING = previousWarning;
      }
      if (previousDelay === undefined) {
        delete process.env.ONTO_REVIEW_MOCK_UNIT_DELAY_MS;
      } else {
        process.env.ONTO_REVIEW_MOCK_UNIT_DELAY_MS = previousDelay;
      }
    }
  });

  it("blocks review result final_output_ref disclosure outside the session", async () => {
    const projectRoot = await tempProjectRoot();
    const externalRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "onto-core-api-review-result-escape-"),
    );
    tempRoots.push(externalRoot);
    const externalOutput = path.join(externalRoot, "secret-output.md");
    await fs.writeFile(externalOutput, "must not be disclosed\n", "utf8");
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const result = await api.runReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API final output boundary test",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
    });
    const reviewRecordPath = path.join(result.sessionRoot, "review-record.yaml");
    const reviewRecord = await readYamlDocument<Record<string, unknown>>(
      reviewRecordPath,
    );
    reviewRecord.final_output_ref = externalOutput;
    await writeYamlDocument(reviewRecordPath, reviewRecord);

    await expect(
      api.getReviewResult(result.sessionRoot, { projectionLevel: "full" }),
    ).rejects.toThrow(/final_output_ref.*escapes allowed root/);
  });

  it("uses full request identity for latest-session requestHash recovery", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const shared = {
      projectRoot,
      target: "target.txt",
      intent: "Core API request identity test",
      noDomain: true,
      reviewMode: "core-axis" as const,
    };
    const logic = await api.runReview({ ...shared, lensIds: ["logic"] });
    const structure = await api.runReview({ ...shared, lensIds: ["structure"] });

    expect(logic.runHandle?.requestHash).toEqual(expect.any(String));
    expect(structure.runHandle?.requestHash).toEqual(expect.any(String));
    expect(logic.runHandle?.requestHash).not.toBe(structure.runHandle?.requestHash);

    const logicMatches = await api.findLatestReviewSessions({
      projectRoot,
      target: "target.txt",
      domain: "none",
      requestHash: logic.runHandle?.requestHash,
    });
    expect(logicMatches[0]?.sessionRoot).toBe(logic.sessionRoot);
    expect(logicMatches.map((match) => match.sessionRoot)).not.toContain(
      structure.sessionRoot,
    );
  });

  it("fails loudly instead of falling back when the newest latest-session match is corrupted", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const shared = {
      projectRoot,
      target: "target.txt",
      intent: "Core API latest-session integrity test",
      noDomain: true,
      reviewMode: "core-axis" as const,
      lensIds: ["logic"],
    };
    const older = await api.runReview(shared);
    const newer = await api.runReview(shared);
    const newerMetadataPath = path.join(newer.sessionRoot, "session-metadata.yaml");
    const newerMetadata = await readYamlDocument<Record<string, unknown>>(
      newerMetadataPath,
    );
    newerMetadata.created_at = "2999-01-01T00:00:00.000Z";
    await writeYamlDocument(newerMetadataPath, newerMetadata);
    await fs.appendFile(
      path.join(newer.sessionRoot, "final-output.md"),
      "\nTampered latest final output.\n",
      "utf8",
    );

    await expect(
      api.findLatestReviewSessions({
        projectRoot,
        target: "target.txt",
        domain: "none",
      }),
    ).rejects.toThrow(/final_output_sha256 mismatch/);
    expect((await api.getReviewStatus(older.sessionRoot)).status).toBe("completed");
  });

  it("fails loudly instead of falling back when the newest latest-session metadata timestamp is malformed", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const shared = {
      projectRoot,
      target: "target.txt",
      intent: "Core API latest-session malformed timestamp test",
      noDomain: true,
      reviewMode: "core-axis" as const,
      lensIds: ["logic"],
    };
    const older = await api.runReview(shared);
    const newer = await api.runReview(shared);
    const newerMetadataPath = path.join(newer.sessionRoot, "session-metadata.yaml");
    const newerMetadata = await readYamlDocument<Record<string, unknown>>(
      newerMetadataPath,
    );
    newerMetadata.created_at = "not-a-date";
    await writeYamlDocument(newerMetadataPath, newerMetadata);

    await expect(
      api.findLatestReviewSessions({
        projectRoot,
        target: "target.txt",
        domain: "none",
      }),
    ).rejects.toThrow(/ReviewSessionMetadata\.created_at.*valid timestamp/);
    expect((await api.getReviewStatus(older.sessionRoot)).status).toBe("completed");
  });

  it("prefers an active continuation attempt over a stale terminal ReviewRecord for status and cancellation", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const result = await api.runReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API active continuation precedence test",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
    });
    const now = new Date().toISOString();
    await writeYamlDocument(path.join(result.sessionRoot, "active-review-attempt.yaml"), {
      schema_version: "1",
      attempt_id: "fixture-active-continuation",
      attempt_kind: "continuation",
      session_id: result.sessionId,
      session_root: result.sessionRoot,
      project_root: projectRoot,
      created_at: now,
      updated_at: now,
      status: "started",
      active_units: ["synthesize"],
      requested_frontier_units: ["synthesize"],
      run_control: {
        stale_after_seconds: 1200,
        source_tool: "onto_review_continue",
        request_hash: null,
      },
      latest_observed_artifact_ref: null,
    });

    const status = await api.getReviewStatus(result.sessionRoot);
    expect(status.status).toBe("running");
    expect(status.runControl?.alreadyRunning).toBe(true);
    expect(status.runControl?.cancellationAvailable).toBe(true);
    const cancellation = await api.cancelReview({
      projectRoot,
      sessionRoot: result.sessionRoot,
      reason: "active continuation cancellation fixture",
    });
    expect(cancellation.decision).toBe("requested");
    expect(cancellation.status).toBe("running");
  });

  it("prefers an active attempt over malformed stale ReviewRecord artifacts", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const result = await api.runReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API malformed stale ReviewRecord active attempt test",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
    });
    const now = new Date().toISOString();
    await writeYamlDocument(path.join(result.sessionRoot, "active-review-attempt.yaml"), {
      schema_version: "1",
      attempt_id: "fixture-active-malformed-record",
      attempt_kind: "continuation",
      session_id: result.sessionId,
      session_root: result.sessionRoot,
      project_root: projectRoot,
      created_at: now,
      updated_at: now,
      status: "started",
      active_units: ["synthesize"],
      requested_frontier_units: ["synthesize"],
      run_control: {
        stale_after_seconds: 1200,
        source_tool: "onto_review_continue",
        request_hash: null,
      },
      latest_observed_artifact_ref: null,
    });
    await fs.writeFile(
      path.join(result.sessionRoot, "review-record.yaml"),
      "schema_version: [unterminated\n",
      "utf8",
    );

    const status = await api.getReviewStatus(result.sessionRoot);
    expect(status.status).toBe("running");
    expect(status.runControl?.alreadyRunning).toBe(true);
    expect(status.runControl?.cancellationAvailable).toBe(true);
    await expect(api.getReviewResult(result.sessionRoot)).rejects.toThrow(
      /fixture-active-malformed-record is started/,
    );
    const cancellation = await api.cancelReview({
      projectRoot,
      sessionRoot: result.sessionRoot,
      reason: "active malformed record cancellation fixture",
    });
    expect(cancellation.decision).toBe("requested");
    expect(cancellation.status).toBe("running");
  });

  it("surfaces stale active continuation attempts instead of reporting stale terminal completion", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const result = await api.runReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API stale active continuation recovery test",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
    });
    const old = new Date(Date.now() - 10_000).toISOString();
    const executionResultPath = path.join(result.sessionRoot, "execution-result.yaml");
    const executionResult = await readYamlDocument<Record<string, unknown>>(
      executionResultPath,
    );
    executionResult.execution_status = "halted_partial";
    executionResult.halt_phase = "cancellation";
    executionResult.halt_reason = "old halted execution result fixture";
    await writeYamlDocument(executionResultPath, executionResult);
    await writeYamlDocument(path.join(result.sessionRoot, "active-review-attempt.yaml"), {
      schema_version: "1",
      attempt_id: "fixture-stale-active-continuation",
      attempt_kind: "continuation",
      session_id: result.sessionId,
      session_root: result.sessionRoot,
      project_root: projectRoot,
      created_at: old,
      updated_at: old,
      status: "started",
      active_units: ["synthesize"],
      requested_frontier_units: ["synthesize"],
      run_control: {
        stale_after_seconds: 1,
        source_tool: "onto_review_continue",
        request_hash: null,
      },
      latest_observed_artifact_ref: null,
    });

    const status = await api.getReviewStatus(result.sessionRoot);
    expect(status.status).toBe("running");
    expect(status.runControl?.activeAttempt?.isStale).toBe(true);
    expect(status.runControl?.lifecycleState).toBe("stale_active");
    expect(status.runControl?.continuationAvailable).toBe(true);
    expect(status.runControl?.cancellationAvailable).toBe(false);
    await expect(api.getReviewResult(result.sessionRoot)).rejects.toThrow(
      /Cannot read completed ReviewRecord result while review attempt fixture-stale-active-continuation is started/,
    );
    const cancellation = await api.cancelReview({
      projectRoot,
      sessionRoot: result.sessionRoot,
      reason: "stale active continuation cancellation fixture",
    });
    expect(cancellation.decision).toBe("not_cancellable");
    expect(cancellation.status).toBe("running");
  });

  it("surfaces failed active attempts over restored old halted execution results", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const result = await api.runReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API failed active attempt precedence test",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
    });
    const executionResultPath = path.join(result.sessionRoot, "execution-result.yaml");
    const executionResult = await readYamlDocument<Record<string, unknown>>(
      executionResultPath,
    );
    executionResult.execution_status = "halted_partial";
    executionResult.halt_phase = "cancellation";
    executionResult.halt_reason = "restored old halted execution result fixture";
    await writeYamlDocument(executionResultPath, executionResult);
    const now = new Date().toISOString();
    await writeYamlDocument(path.join(result.sessionRoot, "active-review-attempt.yaml"), {
      schema_version: "1",
      attempt_id: "fixture-failed-active-continuation",
      attempt_kind: "continuation",
      session_id: result.sessionId,
      session_root: result.sessionRoot,
      project_root: projectRoot,
      created_at: now,
      updated_at: now,
      status: "failed",
      active_units: ["synthesize"],
      requested_frontier_units: ["synthesize"],
      run_control: {
        stale_after_seconds: 1200,
        source_tool: "onto_review_continue",
        request_hash: null,
      },
      latest_observed_artifact_ref: null,
      error_message: "failed continuation fixture",
    });

    const status = await api.getReviewStatus(result.sessionRoot);
    expect(status.status).toBe("failed");
    expect(status.runControl?.lifecycleState).toBe("failed_attempt");
    expect(status.runControl?.continuationAvailable).toBe(true);
    await expect(api.getReviewResult(result.sessionRoot)).rejects.toThrow(
      /fixture-failed-active-continuation is failed/,
    );
  });

  it("keeps initial-review halted execution results stronger than failed active-attempt projection", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const result = await api.runReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API initial active failed halted result precedence test",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
    });
    const executionResultPath = path.join(result.sessionRoot, "execution-result.yaml");
    const executionResult = await readYamlDocument<Record<string, unknown>>(
      executionResultPath,
    );
    executionResult.execution_status = "halted_partial";
    executionResult.halt_phase = "malformed_output";
    executionResult.halt_reason = "initial malformed output fixture";
    await writeYamlDocument(executionResultPath, executionResult);
    const now = new Date().toISOString();
    await writeYamlDocument(path.join(result.sessionRoot, "active-review-attempt.yaml"), {
      schema_version: "1",
      attempt_id: "fixture-failed-initial-review",
      attempt_kind: "initial_review",
      session_id: result.sessionId,
      session_root: result.sessionRoot,
      project_root: projectRoot,
      created_at: now,
      updated_at: now,
      status: "failed",
      active_units: ["finding-relation-graph"],
      requested_frontier_units: [],
      run_control: {
        stale_after_seconds: 1200,
        source_tool: "onto_review",
        request_hash: null,
      },
      latest_observed_artifact_ref: null,
      error_message: "initial active attempt failed after halted execution fixture",
    });

    const status = await api.getReviewStatus(result.sessionRoot);
    expect(status.status).toBe("halted_partial");
    expect(status.runControl?.activeAttempt?.attemptId).toBe(
      "fixture-failed-initial-review",
    );
  });

  it("applies latest-session createdAfter before reading stale malformed binding artifacts", async () => {
    const projectRoot = await tempProjectRoot();
    const staleSessionRoot = path.join(projectRoot, ".onto", "review", "19990101-stale");
    await fs.mkdir(staleSessionRoot, { recursive: true });
    await writeYamlDocument(path.join(staleSessionRoot, "session-metadata.yaml"), {
      schema_version: "1",
      session_id: "19990101-stale",
      project_root: projectRoot,
      requested_target: "target.txt",
      requested_domain_token: "none",
      created_at: "1999-01-01T00:00:00.000Z",
    });
    await fs.writeFile(
      path.join(staleSessionRoot, "binding.yaml"),
      "resolved_session_domain: [unterminated\n",
      "utf8",
    );
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const createdAfter = new Date(Date.now() - 5_000).toISOString();
    const current = await api.runReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API latest createdAfter stale malformed skip test",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
    });

    const matches = await api.findLatestReviewSessions({
      projectRoot,
      target: "target.txt",
      domain: "none",
      createdAfter,
    });

    expect(matches[0]?.sessionRoot).toBe(current.sessionRoot);
    expect(matches.map((match) => match.sessionRoot)).not.toContain(staleSessionRoot);
  });

  it("exposes supported material status for code targets", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const result = await api.runReview({
      projectRoot,
      target: "target.ts",
      intent: "Core API supported code material fixture",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
    });
    const status = await api.getReviewStatus(result.sessionRoot);
    expect(status.targetMaterialSupport).toMatchObject({
      targetMaterialKind: "code",
      supportStatus: "supported",
      unsupportedReason: null,
    });
  });

  it("continues a prepared review session from the ledger frontier", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const prepared = await api.prepareReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API continuation from prepared session",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
    });

    const preparedStatus = await api.getReviewStatus(prepared.sessionRoot);
    expect(preparedStatus.status).toBe("prepared");
    expect(preparedStatus.continuationPlan?.eligible).toBe(true);
    expect(
      preparedStatus.continuationPlan?.frontierUnits.map((unit) => unit.unitId),
    ).toEqual(["logic"]);

    const continued = await api.continueReview({
      projectRoot,
      sessionRoot: prepared.sessionRoot,
      executionRoute: "direct_model_call",
    });

    expect(continued.status).toBe("completed");
    expect(continued.promptExecutionResult.synthesis_executed).toBe(true);
    expect(continued.continuationPlan.frontierUnits.map((unit) => unit.unitId))
      .toEqual(["logic"]);
    expect(
      (continued.continuationPlan as { unitLedger?: unknown }).unitLedger,
    ).toBeUndefined();
    expect(continued.pipelineExecutionLedger?.units.find(
      (unit) => unit.unitId === "synthesize",
    )?.trustStatus).toBe("trusted");
    expect(
      continued.pipelineExecutionLedger?.units.find(
        (unit) => unit.unitId === "synthesize",
      ),
    ).not.toHaveProperty("trustReason");
    const continuedSummary = continued.resultClassificationSummary as
      | {
          material_issues?: unknown;
          non_material_findings?: unknown;
          action_candidates?: unknown;
          material_issue_signals?: Array<{ issue_id?: string; signal?: string }>;
        }
      | undefined;
    expect(continuedSummary?.material_issues).toBeUndefined();
    expect(continuedSummary?.non_material_findings).toBeUndefined();
    expect(continuedSummary?.action_candidates).toBeUndefined();
    expect(continuedSummary?.material_issue_signals).toEqual(expect.any(Array));
    expect(
      continuedSummary?.material_issue_signals?.every(
        (signal) =>
          (signal.issue_id?.length ?? 0) <= 120 &&
          (signal.signal?.length ?? 0) <= 360,
      ),
    ).toBe(true);
    const continuedProgressInput = continued.llmPresentation?.progress?.input as
      | {
          result_classification_summary?: {
            material_issues?: unknown;
            material_issue_signals?: unknown;
          };
        }
      | undefined;
    expect(
      continuedProgressInput?.result_classification_summary?.material_issues,
    ).toBeUndefined();
    expect(
      continuedProgressInput?.result_classification_summary?.material_issue_signals,
    ).toEqual(expect.any(Array));
    await expect(
      fs.stat(continued.continuationAttempt.continuationPlanPath),
    ).resolves.toMatchObject({ size: expect.any(Number) });
    await expect(
      fs.stat(continued.continuationAttempt.attemptManifestPath),
    ).resolves.toMatchObject({ size: expect.any(Number) });
  });

  it("bounds halted prompt execution results in continuation responses", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const completed = await api.runReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API stale ReviewRecord continuation fixture",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
    });
    const staleReviewRecord = await readYamlDocument<Record<string, unknown>>(
      path.join(completed.sessionRoot, "review-record.yaml"),
    );
    if (isRecord(staleReviewRecord.result_classification_summary)) {
      staleReviewRecord.result_classification_summary.action_candidates = [];
    }
    const prepared = await api.prepareReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API continuation halted prompt result projection",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
    });
    await writeYamlDocument(
      path.join(prepared.sessionRoot, "review-record.yaml"),
      staleReviewRecord,
    );
    const longReason = `continuation cancellation fixture ${"detail ".repeat(120)}`.trim();
    await writeYamlDocument(path.join(prepared.sessionRoot, "review-cancel-request.yaml"), {
      schema_version: "1",
      session_id: prepared.sessionId,
      requested_at: new Date().toISOString(),
      requested_by: "mcp",
      reason: longReason,
    });

    const continued = await api.continueReview({
      projectRoot,
      sessionRoot: prepared.sessionRoot,
      executionRoute: "direct_model_call",
    });

    expect(continued.status).toBe("halted_partial");
    expect(continued.promptExecutionResult?.synthesis_executed).toBe(false);
    expect(
      continued.promptExecutionResult?.halt_reason?.length,
    ).toBeLessThanOrEqual(360);
    expect(
      (
        continued.resultClassificationSummary as
          | { action_candidate_count?: number }
          | undefined
      )?.action_candidate_count,
    ).toBe(1);
    const executionResult = await readYamlDocument<{ halt_reason?: string }>(
      path.join(prepared.sessionRoot, "execution-result.yaml"),
    );
    expect(executionResult.halt_reason).toContain(longReason);
    expect(executionResult.halt_reason?.length).toBeGreaterThan(360);
  });

  it("rejects continuation when manifest reconstructs unsupported direct-call OAuth", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const prepared = await api.prepareReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API invalid continuation route test",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
    });
    await writeYamlDocument(path.join(prepared.sessionRoot, "review-run-manifest.yaml"), {
      session_id: prepared.sessionId,
      review_execution_profile: {
        mode: "main-workers",
        teamlead: { seat: "main" },
        lens: { seat: "worker" },
        synthesize: { seat: "worker" },
        deliberation: "controlled-lens-deliberation",
        runtime_route: {
          execution_realization: "direct-call",
          host_runtime: "openai",
          artifact_generation_realization: "semantic_mock",
          worker_executor: "direct_call",
          runtime_provider: "openai",
          auth_mode: "oauth",
        },
        trace: [],
      },
      worker_units: [],
    });

    await expect(
      api.continueReview({
        projectRoot,
        sessionRoot: prepared.sessionRoot,
      }),
    ).rejects.toThrow("Review direct-call route requires API-key/local auth");
  });

  it("rejects manifest-derived mock continuation as non-product execution route", async () => {
    const projectRoot = await tempProjectRoot();
    await writeDirectCallReviewSettings(projectRoot);
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const prepared = await api.prepareReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API mock continuation route rejection test",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
    });
    await writeYamlDocument(path.join(prepared.sessionRoot, "review-run-manifest.yaml"), {
      session_id: prepared.sessionId,
      review_execution_profile: {
        mode: "main-workers",
        teamlead: { seat: "main" },
        lens: { seat: "worker" },
        synthesize: { seat: "worker" },
        deliberation: "controlled-lens-deliberation",
        runtime_route: {
          execution_realization: "mock",
          host_runtime: "standalone",
          worker_executor: "mock",
          runtime_provider: "mock",
          auth_mode: "none",
        },
        trace: [],
      },
      worker_units: [],
    });

    const restoreMockEnv = disableReviewMockRealizationEnv();
    try {
      await expect(
        api.continueReview({
          projectRoot,
          sessionRoot: prepared.sessionRoot,
        }),
      ).rejects.toThrow(
        "Review continuation requires executionRoute when the prior review-run-manifest does not expose a canonical execution route.",
      );
    } finally {
      restoreMockEnv();
    }
  });

  it("rejects continuation when actor-specific direct-call route resolves to OAuth", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const prepared = await api.prepareReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API invalid continuation actor route test",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
    });
    const oauthActor = {
      seat: "worker",
      llm: {
        auth: "oauth",
        provider: "openai",
        model: "gpt-5.5",
      },
    };
    await writeYamlDocument(path.join(prepared.sessionRoot, "review-run-manifest.yaml"), {
      session_id: prepared.sessionId,
      review_execution_profile: {
        mode: "main-workers",
        teamlead: { ...oauthActor, seat: "main" },
        lens: oauthActor,
        synthesize: oauthActor,
        deliberation: "controlled-lens-deliberation",
        runtime_route: {
          execution_realization: "direct-call",
          host_runtime: "openai",
          artifact_generation_realization: "semantic_mock",
          worker_executor: "direct_call",
          runtime_provider: "openai",
          auth_mode: "api_key",
        },
        trace: [],
      },
      worker_units: [],
    });

    await expect(
      api.continueReview({
        projectRoot,
        sessionRoot: prepared.sessionRoot,
      }),
    ).rejects.toThrow("Review direct-call route cannot dispatch");
  });

  it("blocks continuation route conflict before reconstructing an invalid manifest route", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const prepared = await api.prepareReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API continuation route visibility conflict test",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
    });
    await writeYamlDocument(path.join(prepared.sessionRoot, "review-run-manifest.yaml"), {
      session_id: prepared.sessionId,
      artifact_refs: {
        execution_plan: path.join(prepared.sessionRoot, "execution-plan.yaml"),
        actor_invocation_profiles: path.join(
          prepared.sessionRoot,
          "execution-preparation",
          "actor-invocation-profiles.yaml",
        ),
      },
      review_execution_profile: {
        mode: "main-workers",
        teamlead: {
          seat: "main",
          llm: {
            auth: "api_key",
            provider: "openai",
            model: "gpt-5.5",
          },
        },
        lens: {
          seat: "worker",
          llm: {
            auth: "api_key",
            provider: "openai",
            model: "gpt-5.5",
          },
        },
        synthesize: {
          seat: "worker",
          llm: {
            auth: "api_key",
            provider: "openai",
            model: "gpt-5.5",
          },
        },
        deliberation: "controlled-lens-deliberation",
        runtime_route: {
          execution_realization: "direct-call",
          host_runtime: "openai",
          artifact_generation_realization: "semantic_mock",
          worker_executor: "direct_call",
          runtime_provider: "openai",
          auth_mode: "oauth",
        },
        trace: [],
      },
      worker_units: [
        {
          unit_id: "logic",
          executor_host_runtime: "anthropic",
        },
      ],
    });

    await expect(
      api.continueReview({
        projectRoot,
        sessionRoot: prepared.sessionRoot,
      }),
    ).rejects.toThrow(
      "Review continuation cannot dispatch because the prior review run route conflicts with actual worker runtime evidence.",
    );
    const failureFiles = await fs.readdir(
      path.join(prepared.sessionRoot, "failures"),
    );
    const failure = await readYamlDocument<Record<string, unknown>>(
      path.join(prepared.sessionRoot, "failures", failureFiles[0]!),
    );
    expect(failure).toMatchObject({
      reason_code: "continuation_route_visibility_conflict",
      mcp_error_code: "ONTO_REVIEW_ACTOR_ROUTE_UNAVAILABLE",
      details_kind: "actor_route",
      dispatch_state: "dispatch_blocked",
    });
    expect(failure.details).toMatchObject({
      route_consistency: "profile_actual_conflict",
      actual_host_runtimes: ["anthropic"],
    });
    const defaultStatus = await api.getReviewStatus(prepared.sessionRoot);
    expect(defaultStatus.structuredFailures[0]).toMatchObject({
      reason_code: "continuation_route_visibility_conflict",
      details_kind: "actor_route",
      details_signal: expect.any(String),
    });
    expect(defaultStatus.structuredFailures[0]).not.toHaveProperty("details");
    const fullStatus = await api.getReviewStatus(prepared.sessionRoot, {
      projectionLevel: "full",
    });
    expect(fullStatus.structuredFailures[0]).toMatchObject({
      reason_code: "continuation_route_visibility_conflict",
      details: {
        route_consistency: "profile_actual_conflict",
      },
    });
  });

  it("preserves actor credential_ref custom env during continuation reconstruction", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const restoreEnv = setTemporaryEnv({
      [REVIEW_MOCK_REALIZATION_ENV]: "1",
      OPENAI_API_KEY: undefined,
      CUSTOM_OPENAI_API_KEY: "custom-test-key",
    });
    try {
      const prepared = await api.prepareReview({
        projectRoot,
        target: "target.txt",
        intent: "Core API custom credential continuation route test",
        noDomain: true,
        reviewMode: "core-axis",
        lensIds: ["logic"],
      });
      const actorProfilesPath = path.join(
        prepared.sessionRoot,
        "execution-preparation",
        "actor-invocation-profiles.yaml",
      );
      const actorProfile = (
        actorKind: "teamlead" | "lens" | "synthesize",
        seat: "main" | "worker",
      ) => ({
        actor_profile_id: `actor:${actorKind}`,
        actor_kind: actorKind,
        seat,
        execution_realization: "direct-call",
        host_runtime: "openai",
        artifact_generation_realization: "semantic_mock",
        runtime_provider: "openai",
        auth_mode: "api_key",
        model: "mock-model",
        effort: null,
        service_tier: null,
        base_url: null,
        effective_worker_executor: "direct_call",
        credential_ref: "env:CUSTOM_OPENAI_API_KEY",
        credential_serialization_policy: "ref_only_no_secret",
        route_unavailable_policy: "fail_before_dispatch",
        capability_requirements: ["review_unit_execution", "artifact_write"],
        source_settings_refs: [],
      });
      await writeYamlDocument(actorProfilesPath, {
        schema_version: "1",
        session_id: prepared.sessionId,
        created_at: new Date().toISOString(),
        profiles: [
          actorProfile("teamlead", "main"),
          actorProfile("lens", "worker"),
          actorProfile("synthesize", "worker"),
        ],
      } satisfies ReviewActorInvocationProfilesArtifact);

      let errorMessage = "";
      try {
        await api.continueReview({
          projectRoot,
          sessionRoot: prepared.sessionRoot,
          executionRoute: "direct_model_call",
        });
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error);
      }
      expect(errorMessage).not.toContain("credential environment variable is missing");
      expect(errorMessage).not.toContain("direct_call_actor_credential_missing");
    } finally {
      restoreEnv();
    }
  });

  it("rejects targetUnits that try to continue after the current frontier", async () => {
    const projectRoot = await tempProjectRoot();
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const prepared = await api.prepareReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API continuation target unit guard",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
    });

    await expect(
      api.continueReview({
        projectRoot,
        sessionRoot: prepared.sessionRoot,
        targetUnits: ["synthesize"],
      }),
    ).rejects.toThrow(/current continuation frontier|not eligible/);
  });

  it("blocks execution-plan paths that escape the session boundary", async () => {
    const projectRoot = await tempProjectRoot();
    const externalRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "onto-core-api-review-external-"),
    );
    tempRoots.push(externalRoot);
    const externalOutput = path.join(externalRoot, "external-lens.md");
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const prepared = await api.prepareReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API continuation path boundary guard",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
    });
    const executionPlanPath = path.join(prepared.sessionRoot, "execution-plan.yaml");
    const executionPlan =
      await readYamlDocument<ReviewExecutionPlan>(executionPlanPath);
    executionPlan.lens_execution_seats[0] = {
      ...executionPlan.lens_execution_seats[0],
      output_path: externalOutput,
    };
    executionPlan.lens_prompt_packet_seats[0] = {
      ...executionPlan.lens_prompt_packet_seats[0],
      output_path: externalOutput,
    };
    await writeYamlDocument(executionPlanPath, executionPlan);

    await expect(
      api.continueReview({
        projectRoot,
        sessionRoot: prepared.sessionRoot,
      }),
    ).rejects.toThrow(/escapes the session root/);
    await expect(fs.stat(externalOutput)).rejects.toThrow();
  });

  it("keeps centralized execution-plan boundary coverage aligned with current path refs", async () => {
    const projectRoot = await tempProjectRoot();
    const externalRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "onto-core-api-review-plan-refs-"),
    );
    tempRoots.push(externalRoot);
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const prepared = await api.prepareReview({
      projectRoot,
      target: "target.txt",
      intent: "Core API execution-plan path-ref coverage guard",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
    });
    const executionPlan =
      await readYamlDocument<ReviewExecutionPlan>(
        path.join(prepared.sessionRoot, "execution-plan.yaml"),
      );
    const pathRefs = collectExecutionPlanPathRefs(executionPlan);
    const labels = pathRefs.map((ref) => ref.label);

    expect(pathRefs.length).toBeGreaterThanOrEqual(35);
    expect(labels).toContain("session_root");
    expect(labels).toContain("final_output_path");
    expect(labels).toContain("lens_prompt_packet_seats.0.output_path");

    for (const [index, ref] of pathRefs.entries()) {
      const mutatedPlan = cloneReviewExecutionPlan(executionPlan);
      const externalRef = path.join(
        externalRoot,
        `${index}-${ref.label.replace(/[^A-Za-z0-9_.-]/g, "_")}`,
      );
      setNestedExecutionPlanRef(mutatedPlan, ref.segments, externalRef);

      await expect(
        assertReviewExecutionPlanSessionBoundary({
          sessionRoot: prepared.sessionRoot,
          executionPlan: mutatedPlan,
        }),
        ref.label,
      ).rejects.toThrow(/session root|mismatch/);
    }
  });

  it("blocks direct prompt runner execution-plan paths before clearing outputs", async () => {
    const projectRoot = await tempProjectRoot();
    const externalRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "onto-core-api-review-direct-runner-external-"),
    );
    tempRoots.push(externalRoot);
    const externalOutput = path.join(externalRoot, "must-stay.txt");
    await fs.writeFile(externalOutput, "preserve me\n", "utf8");
    const api = createOntoReviewCoreApi({
      ontoHome: path.resolve("."),
    });
    const prepared = await api.prepareReview({
      projectRoot,
      target: "target.txt",
      intent: "Direct runner path boundary guard",
      noDomain: true,
      reviewMode: "core-axis",
      lensIds: ["logic"],
    });
    const executionPlanPath = path.join(prepared.sessionRoot, "execution-plan.yaml");
    const executionPlan =
      await readYamlDocument<ReviewExecutionPlan>(executionPlanPath);
    executionPlan.final_output_path = externalOutput;
    await writeYamlDocument(executionPlanPath, executionPlan);

    await expect(
      executeReviewPromptExecution({
        projectRoot,
        sessionRoot: prepared.sessionRoot,
        defaultExecutorConfig: { bin: "node", args: ["-e", ""] },
      }),
    ).rejects.toThrow(/escapes the session root/);
    await expect(fs.readFile(externalOutput, "utf8")).resolves.toBe("preserve me\n");
  });
});
