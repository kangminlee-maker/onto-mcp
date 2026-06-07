import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ReviewExecutionPlan } from "../review/artifact-types.js";
import { writeYamlDocument } from "../review/review-artifact-utils.js";
import {
  executeReviewViaCodexNested,
  type OutputFileInspector,
} from "./codex-nested-dispatch.js";
import type {
  CodexNestedTeamleadInput,
  CodexNestedTeamleadResult,
  NestedLensDispatchOutcome,
} from "./codex-nested-teamlead-executor.js";

// ---------------------------------------------------------------------------
// These tests assert codex-nested bridge invariants:
//
// (1) The bridge reads execution-plan.yaml from sessionRoot and forwards
//     lens packet triples (lens_id, packet_path, output_path) to the
//     orchestrator in order.
// (2) Teamlead and lens model + reasoning_effort are resolved separately from
//     review axes first, then the canonical llm switcher when it resolves to
//     Codex OAuth.
// (3) Per-lens classification requires BOTH orchestrator-ok AND file
//     exists with size > 0. One of the two missing → degraded.
// (4) synthesis_executed is always `false` for this bridge.
// (5) synthesis_output_path is pulled from execution-plan for
//     downstream consumption by a subsequent synthesize wire-in.
// (6) halt_reason surfaces teamlead-level failure (non-zero exit +
//     missing summary) but NOT per-lens degradation alone.
// ---------------------------------------------------------------------------

interface Fixture {
  sessionRoot: string;
  cleanup: () => Promise<void>;
}

async function mkSession(plan: ReviewExecutionPlan): Promise<Fixture> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "onto-pr-h-"));
  const sessionRoot = path.join(root, "session");
  await fs.mkdir(sessionRoot, { recursive: true });
  await writeYamlDocument(path.join(sessionRoot, "execution-plan.yaml"), plan);
  return {
    sessionRoot,
    cleanup: async () => {
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}

function buildPlan(
  lenses: Array<{ lens_id: string; packet_path: string; output_path: string }>,
  sessionRoot: string,
): ReviewExecutionPlan {
  return {
    session_id: "pr-h-test",
    session_root: sessionRoot,
    execution_realization: "worker",
    host_runtime: "codex",
    review_mode: "core-axis",
    interpretation_artifact_path: path.join(sessionRoot, "interpretation.yaml"),
    binding_output_path: path.join(sessionRoot, "binding.yaml"),
    session_metadata_path: path.join(sessionRoot, "session-metadata.yaml"),
    execution_preparation_root: path.join(sessionRoot, "prep"),
    round1_root: path.join(sessionRoot, "round1"),
    lens_execution_seats: lenses.map((l) => ({
      lens_id: l.lens_id,
      output_path: l.output_path,
    })),
    prompt_packets_root: path.join(sessionRoot, "prompt-packets"),
    lens_prompt_packet_seats: lenses,
    synthesis_output_path: path.join(sessionRoot, "synthesis.md"),
    deliberation_output_path: path.join(sessionRoot, "deliberation.md"),
    execution_result_path: path.join(sessionRoot, "execution-result.yaml"),
    error_log_path: path.join(sessionRoot, "error-log.md"),
    final_output_path: path.join(sessionRoot, "final.md"),
    review_record_path: path.join(sessionRoot, "review-record.yaml"),
    boundary_policy: {
      web_research_policy: "allowed",
      repo_exploration_policy: "allowed",
      recursive_reference_expansion_policy: "allowed",
      filesystem_scope: { allowed_roots: [], source_mutation_policy: "denied" },
    },
    boundary_presentation: {
      web_research: { requested_policy: "allowed" },
      repo_exploration: { requested_policy: "allowed" },
      recursive_reference_expansion: { requested_policy: "allowed" },
      source_mutation: { requested_policy: "denied" },
      filesystem_scope: { requested_allowed_roots: [] },
    },
    boundary_enforcement_profile: {
      web_research: "prompt_declared_only",
      repo_exploration: "prompt_declared_only",
      recursive_reference_expansion: "prompt_declared_only",
      source_mutation: "prompt_declared_only",
      filesystem_scope: "prompt_declared_only",
    },
    effective_boundary_state: {
      web_research: {
        requested_policy: "allowed",
        effective_policy: "allowed",
        guarantee_level: "prompt_declared_only",
      },
      repo_exploration: {
        requested_policy: "allowed",
        effective_policy: "allowed",
        guarantee_level: "prompt_declared_only",
      },
      recursive_reference_expansion: {
        requested_policy: "allowed",
        effective_policy: "allowed",
        guarantee_level: "prompt_declared_only",
      },
      source_mutation: {
        requested_policy: "denied",
        effective_policy: "denied",
        guarantee_level: "prompt_declared_only",
      },
      filesystem_scope: {
        requested_allowed_roots: [],
        effective_allowed_roots: [],
        guarantee_level: "prompt_declared_only",
      },
    },
  } as unknown as ReviewExecutionPlan;
}

function buildOrchestrator(
  outcomes: NestedLensDispatchOutcome[],
  opts: Partial<CodexNestedTeamleadResult> = {},
): { impl: typeof import("./codex-nested-teamlead-executor.js").runCodexNestedTeamlead; calls: CodexNestedTeamleadInput[] } {
  const calls: CodexNestedTeamleadInput[] = [];
  const impl = async (input: CodexNestedTeamleadInput) => {
    calls.push(input);
    return {
      outcomes,
      outer_stdout: opts.outer_stdout ?? "",
      outer_stderr: opts.outer_stderr ?? "",
      outer_exit_code: opts.outer_exit_code ?? 0,
      summary_parsed: opts.summary_parsed ?? true,
    } satisfies CodexNestedTeamleadResult;
  };
  return { impl, calls };
}

function staticInspector(
  present: Set<string>,
  sizes: Record<string, number> = {},
): OutputFileInspector {
  return async (p: string) => ({
    exists: present.has(p),
    size: sizes[p] ?? (present.has(p) ? 1 : 0),
  });
}

// ---------------------------------------------------------------------------
// Forwarding: execution-plan lenses → orchestrator input
// ---------------------------------------------------------------------------

describe("executeReviewViaCodexNested — forwarding", () => {
  let fixture: Fixture;
  afterEach(async () => {
    if (fixture) await fixture.cleanup();
  });

  it("forwards lens packet triples in execution-plan order", async () => {
    const plan = buildPlan(
      [
        { lens_id: "logic", packet_path: "/pkts/logic.md", output_path: "/out/logic.md" },
        { lens_id: "pragmatics", packet_path: "/pkts/pr.md", output_path: "/out/pr.md" },
        { lens_id: "axiology", packet_path: "/pkts/ax.md", output_path: "/out/ax.md" },
      ],
      "",
    );
    fixture = await mkSession(plan);
    const { impl, calls } = buildOrchestrator([
      { lens_id: "logic", status: "ok" },
      { lens_id: "pragmatics", status: "ok" },
      { lens_id: "axiology", status: "ok" },
    ]);
    await executeReviewViaCodexNested(
      { sessionRoot: fixture.sessionRoot, ontoConfig: {} },
      impl,
      staticInspector(new Set(["/out/logic.md", "/out/pr.md", "/out/ax.md"])),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]!.lenses.map((l) => l.lens_id)).toEqual([
      "logic",
      "pragmatics",
      "axiology",
    ]);
    expect(calls[0]!.lenses[0]!.packet_path).toBe("/pkts/logic.md");
    expect(calls[0]!.lenses[0]!.output_path).toBe("/out/logic.md");
  });

  it("passes actor-owned OpenAI OAuth selection to both teamlead and lens", async () => {
    const plan = buildPlan([{ lens_id: "l", packet_path: "/p", output_path: "/o" }], "");
    fixture = await mkSession(plan);
    const { impl, calls } = buildOrchestrator([{ lens_id: "l", status: "ok" }]);
    await executeReviewViaCodexNested(
      {
        sessionRoot: fixture.sessionRoot,
        ontoConfig: {
          review: {
            execution: {
              mode: "nested-workers",
              teamlead: {
                seat: "worker",
                llm: {
                  auth: "oauth",
                  provider: "openai",
                  model: "gpt-5.5",
                  effort: "medium",
                  service_tier: "fast",
                },
              },
              lens: {
                seat: "worker",
                llm: {
                  auth: "oauth",
                  provider: "openai",
                  model: "gpt-5.5",
                  effort: "medium",
                  service_tier: "fast",
                },
              },
              synthesize: { seat: "worker" },
              deliberation: "controlled-lens-deliberation",
            },
          },
        },
      },
      impl,
      staticInspector(new Set(["/o"])),
    );
    expect(calls[0]!.teamlead_model).toBe("gpt-5.5");
    expect(calls[0]!.teamlead_reasoning_effort).toBe("medium");
    expect(calls[0]!.teamlead_service_tier).toBe("fast");
    expect(calls[0]!.lens_model).toBe("gpt-5.5");
    expect(calls[0]!.lens_reasoning_effort).toBe("medium");
    expect(calls[0]!.lens_service_tier).toBe("fast");
  });

  it("does not use llm selection when it resolves to API provider", async () => {
    const plan = buildPlan([{ lens_id: "l", packet_path: "/p", output_path: "/o" }], "");
    fixture = await mkSession(plan);
    const { impl, calls } = buildOrchestrator([{ lens_id: "l", status: "ok" }]);
    await executeReviewViaCodexNested(
      {
        sessionRoot: fixture.sessionRoot,
        ontoConfig: {
          review: {
            execution: {
              mode: "nested-workers",
              teamlead: {
                seat: "worker",
                llm: {
                  auth: "api_key",
                  provider: "openai",
                  model: "gpt-api",
                  effort: "low",
                },
              },
              lens: {
                seat: "worker",
                llm: {
                  auth: "api_key",
                  provider: "openai",
                  model: "gpt-api",
                  effort: "low",
                },
              },
              synthesize: { seat: "worker" },
              deliberation: "controlled-lens-deliberation",
            },
          },
        },
      },
      impl,
      staticInspector(new Set(["/o"])),
    );
    expect(calls[0]!.teamlead_model).toBeUndefined();
    expect(calls[0]!.teamlead_reasoning_effort).toBeUndefined();
    expect(calls[0]!.lens_model).toBeUndefined();
    expect(calls[0]!.lens_reasoning_effort).toBeUndefined();
  });

  it("reads model/effort from lens llm settings", async () => {
    const plan = buildPlan([{ lens_id: "l", packet_path: "/p", output_path: "/o" }], "");
    fixture = await mkSession(plan);
    const { impl, calls } = buildOrchestrator([{ lens_id: "l", status: "ok" }]);
    await executeReviewViaCodexNested(
      {
        sessionRoot: fixture.sessionRoot,
        ontoConfig: {
          review: {
            execution: {
              mode: "nested-workers",
              teamlead: { seat: "worker" },
              lens: {
                seat: "worker",
                llm: {
                  auth: "oauth",
                  provider: "openai",
                  model: "gpt-sub",
                  effort: "medium",
                },
              },
              synthesize: { seat: "worker" },
              deliberation: "controlled-lens-deliberation",
            },
          },
        },
      },
      impl,
      staticInspector(new Set(["/o"])),
    );
    expect(calls[0]!.teamlead_model).toBeUndefined();
    expect(calls[0]!.teamlead_reasoning_effort).toBeUndefined();
    expect(calls[0]!.lens_model).toBe("gpt-sub");
    expect(calls[0]!.lens_reasoning_effort).toBe("medium");
  });

  it("reads model/effort from teamlead llm settings", async () => {
    const plan = buildPlan([{ lens_id: "l", packet_path: "/p", output_path: "/o" }], "");
    fixture = await mkSession(plan);
    const { impl, calls } = buildOrchestrator([{ lens_id: "l", status: "ok" }]);
    await executeReviewViaCodexNested(
      {
        sessionRoot: fixture.sessionRoot,
        ontoConfig: {
          review: {
            execution: {
              mode: "nested-workers",
              teamlead: {
                seat: "worker",
                llm: {
                  auth: "oauth",
                  provider: "openai",
                  model: "gpt-tl",
                  effort: "high",
                },
              },
              lens: { seat: "worker" },
              synthesize: { seat: "worker" },
              deliberation: "controlled-lens-deliberation",
            },
          },
        },
      },
      impl,
      staticInspector(new Set(["/o"])),
    );
    expect(calls[0]!.teamlead_model).toBe("gpt-tl");
    expect(calls[0]!.teamlead_reasoning_effort).toBe("high");
    expect(calls[0]!.lens_model).toBeUndefined();
    expect(calls[0]!.lens_reasoning_effort).toBeUndefined();
  });

  it("missing teamlead llm leaves teamlead unset while lens uses actor llm", async () => {
    const plan = buildPlan([{ lens_id: "l", packet_path: "/p", output_path: "/o" }], "");
    fixture = await mkSession(plan);
    const { impl, calls } = buildOrchestrator([{ lens_id: "l", status: "ok" }]);
    await executeReviewViaCodexNested(
      {
        sessionRoot: fixture.sessionRoot,
        ontoConfig: {
          review: {
            execution: {
              mode: "nested-workers",
              teamlead: { seat: "worker" },
              lens: {
                seat: "worker",
                llm: {
                  auth: "oauth",
                  provider: "openai",
                  model: "gpt-sub",
                  effort: "medium",
                },
              },
              synthesize: { seat: "worker" },
              deliberation: "controlled-lens-deliberation",
            },
          },
        },
      },
      impl,
      staticInspector(new Set(["/o"])),
    );
    expect(calls[0]!.teamlead_model).toBeUndefined();
    expect(calls[0]!.teamlead_reasoning_effort).toBeUndefined();
    expect(calls[0]!.lens_model).toBe("gpt-sub");
    expect(calls[0]!.lens_reasoning_effort).toBe("medium");
  });

  it("missing actor llm leaves both Codex spawn configs unset", async () => {
    const plan = buildPlan([{ lens_id: "l", packet_path: "/p", output_path: "/o" }], "");
    fixture = await mkSession(plan);
    const { impl, calls } = buildOrchestrator([{ lens_id: "l", status: "ok" }]);
    await executeReviewViaCodexNested(
      {
        sessionRoot: fixture.sessionRoot,
        ontoConfig: {
          review: {
            execution: {
              mode: "nested-workers",
              teamlead: { seat: "worker" },
              lens: { seat: "worker" },
              synthesize: { seat: "worker" },
              deliberation: "controlled-lens-deliberation",
            },
          },
        },
      },
      impl,
      staticInspector(new Set(["/o"])),
    );
    expect(calls[0]!.teamlead_model).toBeUndefined();
    expect(calls[0]!.teamlead_reasoning_effort).toBeUndefined();
    expect(calls[0]!.lens_model).toBeUndefined();
    expect(calls[0]!.lens_reasoning_effort).toBeUndefined();
  });

  it("allows distinct teamlead and lens effort settings in nested-workers", async () => {
    const plan = buildPlan([{ lens_id: "l", packet_path: "/p", output_path: "/o" }], "");
    fixture = await mkSession(plan);
    const { impl, calls } = buildOrchestrator([{ lens_id: "l", status: "ok" }]);
    await executeReviewViaCodexNested(
      {
        sessionRoot: fixture.sessionRoot,
        ontoConfig: {
          review: {
            execution: {
              mode: "nested-workers",
              teamlead: {
                seat: "worker",
                llm: {
                  auth: "oauth",
                  provider: "openai",
                  model: "gpt-5.5",
                  effort: "xhigh",
                  service_tier: "fast",
                },
              },
              lens: {
                seat: "worker",
                llm: {
                  auth: "oauth",
                  provider: "openai",
                  model: "gpt-5.5",
                  effort: "medium",
                  service_tier: "fast",
                },
              },
              synthesize: { seat: "worker" },
              deliberation: "controlled-lens-deliberation",
            },
          },
        },
      },
      impl,
      staticInspector(new Set(["/o"])),
    );
    expect(calls[0]!.teamlead_model).toBe("gpt-5.5");
    expect(calls[0]!.teamlead_reasoning_effort).toBe("xhigh");
    expect(calls[0]!.teamlead_service_tier).toBe("fast");
    expect(calls[0]!.lens_model).toBe("gpt-5.5");
    expect(calls[0]!.lens_reasoning_effort).toBe("medium");
    expect(calls[0]!.lens_service_tier).toBe("fast");
  });

  it("passes sessionRoot-based stream_stdout_path/stream_stderr_path to orchestrator (live watcher)", async () => {
    // The watcher pane's tail -f target is sessionRoot/nested-outer-*.log.
    // The orchestrator must receive those absolute paths so spawn-watcher
    // can tee outer codex stdout/stderr there as codex emits chunks.
    const plan = buildPlan([{ lens_id: "l", packet_path: "/p", output_path: "/o" }], "");
    fixture = await mkSession(plan);
    const { impl, calls } = buildOrchestrator([{ lens_id: "l", status: "ok" }]);
    await executeReviewViaCodexNested(
      {
        sessionRoot: fixture.sessionRoot,
        ontoConfig: {},
      },
      impl,
      staticInspector(new Set(["/o"])),
    );
    expect(calls[0]!.stream_stdout_path).toBe(
      path.join(fixture.sessionRoot, "nested-outer-stdout.log"),
    );
    expect(calls[0]!.stream_stderr_path).toBe(
      path.join(fixture.sessionRoot, "nested-outer-stderr.log"),
    );
  });

  it("archives outer stdout/stderr to nested-outer-*.log under sessionRoot", async () => {
    // Regression guard: outer codex diagnostics (ENV-BEFORE / ENV-AFTER /
    // LENS_DISPATCH_SUMMARY) and raw stderr are otherwise unreachable
    // after dispatch completes, because review-invoke's final JSON drops
    // `nested_raw`. The archive step is what makes post-hoc auditing
    // possible for the principal.
    const plan = buildPlan([{ lens_id: "l", packet_path: "/p", output_path: "/o" }], "");
    fixture = await mkSession(plan);
    const { impl } = buildOrchestrator([{ lens_id: "l", status: "ok" }], {
      outer_stdout:
        "ENV-BEFORE lens=l packet=/p output=/o\n" +
        "ENV-AFTER lens=l exit=0 output_bytes=42\n" +
        'LENS_DISPATCH_SUMMARY:{"lens_results":[{"lens_id":"l","status":"ok"}]}\n',
      outer_stderr: "some-warning from outer codex\n",
    });
    await executeReviewViaCodexNested(
      {
        sessionRoot: fixture.sessionRoot,
        ontoConfig: {},
      },
      impl,
      staticInspector(new Set(["/o"])),
    );
    const stdoutArchive = await fs.readFile(
      path.join(fixture.sessionRoot, "nested-outer-stdout.log"),
      "utf8",
    );
    const stderrArchive = await fs.readFile(
      path.join(fixture.sessionRoot, "nested-outer-stderr.log"),
      "utf8",
    );
    expect(stdoutArchive).toContain("ENV-BEFORE lens=l");
    expect(stdoutArchive).toContain("ENV-AFTER lens=l");
    expect(stdoutArchive).toContain("LENS_DISPATCH_SUMMARY:");
    expect(stderrArchive).toContain("some-warning from outer codex");
  });
});

// ---------------------------------------------------------------------------
// Classification: orchestrator-ok AND file-exists → participating
// ---------------------------------------------------------------------------

describe("executeReviewViaCodexNested — per-lens classification", () => {
  let fixture: Fixture;
  afterEach(async () => {
    if (fixture) await fixture.cleanup();
  });

  it("all ok + all files present → all participating", async () => {
    const plan = buildPlan(
      [
        { lens_id: "a", packet_path: "/p/a", output_path: "/o/a" },
        { lens_id: "b", packet_path: "/p/b", output_path: "/o/b" },
      ],
      "",
    );
    fixture = await mkSession(plan);
    const { impl } = buildOrchestrator([
      { lens_id: "a", status: "ok" },
      { lens_id: "b", status: "ok" },
    ]);
    const result = await executeReviewViaCodexNested(
      { sessionRoot: fixture.sessionRoot, ontoConfig: {} },
      impl,
      staticInspector(new Set(["/o/a", "/o/b"])),
    );
    expect(result.participating_lens_ids).toEqual(["a", "b"]);
    expect(result.degraded_lens_ids).toEqual([]);
    expect(result.executed_lens_count).toBe(2);
  });

  it("orchestrator fail → degraded (no file probe needed)", async () => {
    const plan = buildPlan(
      [
        { lens_id: "a", packet_path: "/p/a", output_path: "/o/a" },
        { lens_id: "b", packet_path: "/p/b", output_path: "/o/b" },
      ],
      "",
    );
    fixture = await mkSession(plan);
    const { impl } = buildOrchestrator([
      { lens_id: "a", status: "ok" },
      { lens_id: "b", status: "fail", error: "inner exit 1" },
    ]);
    const result = await executeReviewViaCodexNested(
      { sessionRoot: fixture.sessionRoot, ontoConfig: {} },
      impl,
      staticInspector(new Set(["/o/a", "/o/b"])), // both "present" but b still degraded
    );
    expect(result.participating_lens_ids).toEqual(["a"]);
    expect(result.degraded_lens_ids).toEqual(["b"]);
  });

  it("orchestrator ok but output file missing → degraded", async () => {
    const plan = buildPlan(
      [
        { lens_id: "a", packet_path: "/p/a", output_path: "/o/a" },
        { lens_id: "b", packet_path: "/p/b", output_path: "/o/b" },
      ],
      "",
    );
    fixture = await mkSession(plan);
    const { impl } = buildOrchestrator([
      { lens_id: "a", status: "ok" },
      { lens_id: "b", status: "ok" },
    ]);
    const result = await executeReviewViaCodexNested(
      { sessionRoot: fixture.sessionRoot, ontoConfig: {} },
      impl,
      staticInspector(new Set(["/o/a"])), // b's file missing
    );
    expect(result.participating_lens_ids).toEqual(["a"]);
    expect(result.degraded_lens_ids).toEqual(["b"]);
  });

  it("orchestrator ok but output file size=0 → degraded", async () => {
    const plan = buildPlan(
      [{ lens_id: "a", packet_path: "/p/a", output_path: "/o/a" }],
      "",
    );
    fixture = await mkSession(plan);
    const { impl } = buildOrchestrator([{ lens_id: "a", status: "ok" }]);
    const result = await executeReviewViaCodexNested(
      { sessionRoot: fixture.sessionRoot, ontoConfig: {} },
      impl,
      staticInspector(new Set(["/o/a"]), { "/o/a": 0 }),
    );
    expect(result.participating_lens_ids).toEqual([]);
    expect(result.degraded_lens_ids).toEqual(["a"]);
  });
});

// ---------------------------------------------------------------------------
// Result shape
// ---------------------------------------------------------------------------

describe("executeReviewViaCodexNested — result shape", () => {
  let fixture: Fixture;
  afterEach(async () => {
    if (fixture) await fixture.cleanup();
  });

  it("synthesis_executed is always false for the nested dispatch bridge", async () => {
    const plan = buildPlan(
      [{ lens_id: "a", packet_path: "/p/a", output_path: "/o/a" }],
      "",
    );
    fixture = await mkSession(plan);
    const { impl } = buildOrchestrator([{ lens_id: "a", status: "ok" }]);
    const result = await executeReviewViaCodexNested(
      { sessionRoot: fixture.sessionRoot, ontoConfig: {} },
      impl,
      staticInspector(new Set(["/o/a"])),
    );
    expect(result.synthesis_executed).toBe(false);
  });

  it("synthesis_output_path is sourced from execution-plan for downstream synthesize wire-in", async () => {
    const plan = buildPlan(
      [{ lens_id: "a", packet_path: "/p/a", output_path: "/o/a" }],
      "",
    );
    plan.synthesis_output_path = "/tmp/synth-target.md";
    fixture = await mkSession(plan);
    const { impl } = buildOrchestrator([{ lens_id: "a", status: "ok" }]);
    const result = await executeReviewViaCodexNested(
      { sessionRoot: fixture.sessionRoot, ontoConfig: {} },
      impl,
      staticInspector(new Set(["/o/a"])),
    );
    expect(result.synthesis_output_path).toBe("/tmp/synth-target.md");
  });

  it("nested_raw exposes orchestrator result verbatim for debugging", async () => {
    const plan = buildPlan(
      [{ lens_id: "a", packet_path: "/p/a", output_path: "/o/a" }],
      "",
    );
    fixture = await mkSession(plan);
    const { impl } = buildOrchestrator(
      [{ lens_id: "a", status: "ok" }],
      { outer_stdout: "outer stdout content", outer_stderr: "outer stderr content" },
    );
    const result = await executeReviewViaCodexNested(
      { sessionRoot: fixture.sessionRoot, ontoConfig: {} },
      impl,
      staticInspector(new Set(["/o/a"])),
    );
    expect(result.nested_raw.outer_stdout).toBe("outer stdout content");
    expect(result.nested_raw.outer_stderr).toBe("outer stderr content");
  });

  it("halt_reason populated when outer exit non-zero AND summary not parsed", async () => {
    const plan = buildPlan(
      [{ lens_id: "a", packet_path: "/p/a", output_path: "/o/a" }],
      "",
    );
    fixture = await mkSession(plan);
    const { impl } = buildOrchestrator(
      [{ lens_id: "a", status: "fail", error: "no summary" }],
      { outer_exit_code: 137, summary_parsed: false },
    );
    const result = await executeReviewViaCodexNested(
      { sessionRoot: fixture.sessionRoot, ontoConfig: {} },
      impl,
      staticInspector(new Set()),
    );
    expect(result.halt_reason).toBeDefined();
    expect(result.halt_reason).toContain("137");
  });

  it("halt_reason absent when per-lens degraded but teamlead ok", async () => {
    const plan = buildPlan(
      [{ lens_id: "a", packet_path: "/p/a", output_path: "/o/a" }],
      "",
    );
    fixture = await mkSession(plan);
    const { impl } = buildOrchestrator(
      [{ lens_id: "a", status: "fail", error: "inner 1" }],
      { outer_exit_code: 0, summary_parsed: true },
    );
    const result = await executeReviewViaCodexNested(
      { sessionRoot: fixture.sessionRoot, ontoConfig: {} },
      impl,
      staticInspector(new Set()),
    );
    expect(result.halt_reason).toBeUndefined();
    expect(result.degraded_lens_ids).toEqual(["a"]);
  });
});

// ---------------------------------------------------------------------------
// Execution-plan missing — bridge surfaces the error
// ---------------------------------------------------------------------------

describe("executeReviewViaCodexNested — missing execution-plan", () => {
  it("propagates readYamlDocument error when execution-plan.yaml absent", async () => {
    const { impl } = buildOrchestrator([]);
    await expect(
      executeReviewViaCodexNested(
        { sessionRoot: "/nonexistent/session/path", ontoConfig: {} },
        impl,
        staticInspector(new Set()),
      ),
    ).rejects.toThrow(/Failed to read artifact/);
  });
});
