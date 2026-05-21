import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutionTopology } from "../review/execution-topology-resolver.js";
import {
  tryResolveTopologyForHandoff,
  tryTopologyDerivedExecutor,
} from "./review-invoke.js";

// ---------------------------------------------------------------------------
// P9.3-m1 Resolver caching invariants (2026-04-21):
//
// `runReviewInvokeCli` resolves `resolveExecutionTopology` exactly once
// per invocation and threads the result as `cached` to 3 downstream
// consumers. This file protects the cache plumbing from future
// regressions — a caller that accidentally drops the `cached` argument
// (reverting to the 3x resolver-call pattern) would re-emit the full
// `[topology]` STDERR trace, which these tests assert does NOT happen.
//
// The `[topology] signals:` line is the most stable counter because
// `resolveExecutionTopology` emits it exactly once at the very start of
// each invocation (see execution-topology-resolver.ts:413). When the
// helpers honour `cached`, they skip the resolver entirely and this
// line MUST NOT appear.
// ---------------------------------------------------------------------------

const FAKE_HOME = "/tmp/fake-onto-home";

const CACHED_CODEX_TOPOLOGY: ExecutionTopology = {
  id: "cc-main-codex-subprocess",
  teamlead_location: "onto-main",
  lens_spawn_mechanism: "codex-subprocess",
  max_concurrent_lenses: 3,
  transport_rank: "S0",
  deliberation_channel: "controlled-lens-deliberation",
  plan_trace: ["cached-by-runReviewInvokeCli"],
};

const CACHED_CC_MAIN_TOPOLOGY: ExecutionTopology = {
  id: "cc-main-agent-subagent",
  teamlead_location: "onto-main",
  lens_spawn_mechanism: "claude-agent-tool",
  max_concurrent_lenses: 3,
  transport_rank: "S0",
  deliberation_channel: "controlled-lens-deliberation",
  plan_trace: ["cached-by-runReviewInvokeCli"],
};

describe("tryResolveTopologyForHandoff — cached topology bypass", () => {
  const originalEnv = { ...process.env };
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    delete process.env.CLAUDECODE;
    delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });
  afterEach(() => {
    stderrSpy.mockRestore();
    for (const k of Object.keys(process.env)) {
      if (!(k in originalEnv)) delete process.env[k];
    }
    for (const [k, v] of Object.entries(originalEnv)) {
      process.env[k] = v;
    }
  });

  function signalsTraceLines(): string[] {
    return stderrSpy.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .filter((l: string) => l.startsWith("[topology] signals:"));
  }

  it("cached=ExecutionTopology → descriptor returned without re-running resolver", () => {
    const descriptor = tryResolveTopologyForHandoff({}, CACHED_CODEX_TOPOLOGY);
    expect(descriptor).not.toBeNull();
    expect(descriptor!.id).toBe("cc-main-codex-subprocess");
    expect(descriptor!.teamlead_location).toBe("onto-main");
    expect(signalsTraceLines()).toHaveLength(0);
  });

  it("cached=null → returns null without re-running resolver", () => {
    const descriptor = tryResolveTopologyForHandoff({}, null);
    expect(descriptor).toBeNull();
    expect(signalsTraceLines()).toHaveLength(0);
  });

  it("cached=undefined → resolver runs and emits signals", () => {
    // Two-argument call path preserved for test-harness compatibility;
    // this branch is what existing tests exercise.
    tryResolveTopologyForHandoff({});
    expect(signalsTraceLines()).toHaveLength(1);
  });
});

describe("tryTopologyDerivedExecutor — cached topology bypass", () => {
  const originalEnv = { ...process.env };
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    delete process.env.CLAUDECODE;
    delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });
  afterEach(() => {
    stderrSpy.mockRestore();
    for (const k of Object.keys(process.env)) {
      if (!(k in originalEnv)) delete process.env[k];
    }
    for (const [k, v] of Object.entries(originalEnv)) {
      process.env[k] = v;
    }
  });

  function signalsTraceLines(): string[] {
    return stderrSpy.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .filter((l: string) => l.startsWith("[topology] signals:"));
  }

  it("cached=ExecutionTopology (binary-backed) → executor returned without re-running resolver", () => {
    const result = tryTopologyDerivedExecutor(
      { llm_base_url: "http://localhost:4000" },
      FAKE_HOME,
      CACHED_CODEX_TOPOLOGY,
    );
    expect(result).not.toBeNull();
    expect(result!.bin).toBe("node");
    expect(result!.args[0]).toContain("codex-review-unit-executor.js");
    expect(signalsTraceLines()).toHaveLength(0);
  });

  it("cached=ExecutionTopology (no standalone binary) → null without re-running resolver", () => {
    const result = tryTopologyDerivedExecutor(
      {},
      FAKE_HOME,
      CACHED_CC_MAIN_TOPOLOGY,
    );
    expect(result).toBeNull();
    expect(signalsTraceLines()).toHaveLength(0);
  });

  it("cached=null → null without re-running resolver", () => {
    const result = tryTopologyDerivedExecutor({}, FAKE_HOME, null);
    expect(result).toBeNull();
    expect(signalsTraceLines()).toHaveLength(0);
  });

  it("cached=undefined → resolver runs and emits signals", () => {
    process.env.CLAUDECODE = "1";
    tryTopologyDerivedExecutor({}, FAKE_HOME);
    expect(signalsTraceLines()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Integration-layer invariant: exercise the 3-consumer contract that
// `runReviewInvokeCli` depends on. The stderr-based tests above prove
// the helper-level contract; these tests prove the full-dispatch
// consumer sequence (tryResolveTopologyForHandoff + tryTopologyDerivedExecutor
// twice — the shape invoked by resolveExecutorConfig for default +
// synthesize) adds up to ZERO resolver invocations when the cache is
// threaded. If a future refactor drops the `cached` argument from any
// consumer, the signals-line count will jump from 0 to 1-or-more and
// this test will fail — catching the very regression class MINOR-1 of
// the P9.3-m1 review flagged.
// ---------------------------------------------------------------------------

describe("runReviewInvokeCli full-dispatch consumer sequence — invariant", () => {
  const originalEnv = { ...process.env };
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    delete process.env.CLAUDECODE;
    delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });
  afterEach(() => {
    stderrSpy.mockRestore();
    for (const k of Object.keys(process.env)) {
      if (!(k in originalEnv)) delete process.env[k];
    }
    for (const [k, v] of Object.entries(originalEnv)) {
      process.env[k] = v;
    }
  });

  function signalsTraceCount(): number {
    return stderrSpy.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .filter((l: string) => l.startsWith("[topology] signals:")).length;
  }

  it("3 consumers with shared cachedTopology → resolver runs 0 times", () => {
    // Simulate the runReviewInvokeCli full-dispatch sequence:
    // 1. runReviewInvokeCli resolves once at the top (we fabricate the
    //    result here as `cachedTopology` — NOT included in the spy count).
    // 2. tryResolveTopologyForHandoff(config, cachedTopology) — coordinator_start
    //    path would have called this but it returns earlier; included here
    //    for completeness of the 3-consumer contract.
    // 3. tryTopologyDerivedExecutor ×2 (default + synthesize via
    //    resolveExecutorConfig).
    const cachedTopology = CACHED_CODEX_TOPOLOGY;
    const config = { llm: { auth: "oauth", provider: "openai", model: "gpt-5.4" } } as const;

    tryResolveTopologyForHandoff(config, cachedTopology);
    tryTopologyDerivedExecutor(config, FAKE_HOME, cachedTopology);
    tryTopologyDerivedExecutor(config, FAKE_HOME, cachedTopology);

    // ZERO resolver calls: cache bypassed all 3 consumers.
    expect(signalsTraceCount()).toBe(0);
  });

  it("regression probe: 3 consumers with cached=undefined → resolver runs 3 times", () => {
    // This is the PRE-fix behaviour. If someone accidentally reverts the
    // caching (drops the `cached` argument from all 3 consumers), the
    // count would be 3 — proving the test catches the exact regression.
    process.env.CLAUDECODE = "1";
    const config = { llm_base_url: "http://localhost:4000" };

    tryResolveTopologyForHandoff(config);
    tryTopologyDerivedExecutor(config, FAKE_HOME);
    tryTopologyDerivedExecutor(config, FAKE_HOME);

    expect(signalsTraceCount()).toBe(3);
  });

  it("3 consumers with cachedTopology=null → resolver runs 0 times, all return null", () => {
    // `null` propagation: all 3 consumers see cached=null and short-circuit
    // without invoking the resolver.
    const config = { llm_base_url: "http://localhost:4000" };

    const descriptor = tryResolveTopologyForHandoff(config, null);
    const exec1 = tryTopologyDerivedExecutor(config, FAKE_HOME, null);
    const exec2 = tryTopologyDerivedExecutor(config, FAKE_HOME, null);

    expect(descriptor).toBeNull();
    expect(exec1).toBeNull();
    expect(exec2).toBeNull();
    expect(signalsTraceCount()).toBe(0);
  });
});
