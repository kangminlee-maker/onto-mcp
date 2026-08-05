import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ReviewExecutionResultArtifact } from "./artifact-types.js";
import {
  REVIEW_EXECUTION_STATUS_VALUES,
  requireTerminalExecutionResult,
} from "./artifact-types.js";

const SRC_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

/**
 * Every module that derives a terminal artifact from `execution-result.yaml`.
 * `mcp-native-tool-surface.md` tells readers these go through the shared gate,
 * and a mutation showed that claim had no enforcement: deleting the gate call
 * from the renderer type-checked and left the whole suite green. Documentation
 * is not a guarantee — this list is.
 *
 * A new terminal consumer belongs here. If one legitimately stops being a
 * terminal consumer, remove it here in the same change.
 */
const TERMINAL_CONSUMERS = [
  "core-runtime/cli/assemble-review-record.ts",
  "core-runtime/cli/render-review-final-output.ts",
  "core-runtime/cli/run-review-prompt-execution.ts",
] as const;

function terminalArtifact(
  overrides: Partial<ReviewExecutionResultArtifact> = {},
): ReviewExecutionResultArtifact {
  return {
    session_id: "s",
    session_root: "/tmp/s",
    execution_realization: "worker",
    host_runtime: "codex",
    artifact_generation_realization: "live",
    semantic_quality_evidence: {
      status: "not_evaluated",
      applicability: "real_semantic_path_only",
      reason: "fixture",
    },
    review_mode: "full",
    execution_status: "completed",
    execution_started_at: "2026-08-05T00:00:00+09:00",
    execution_completed_at: "2026-08-05T00:00:10+09:00",
    total_duration_ms: 10_000,
    max_concurrent_lenses: 1,
    retry_policy: {
      lens_max_retries: 1,
      issue_artifact_max_retries: 1,
      deliberation_max_retries: 1,
      synthesis_max_retries: 1,
      retry_initial_delay_ms: 1,
    },
    planned_lens_ids: [],
    participating_lens_ids: [],
    degraded_lens_ids: [],
    excluded_lens_ids: [],
    executed_lens_count: 0,
    synthesis_executed: true,
    error_log_path: "/tmp/s/error-log.md",
    lens_execution_results: [],
    ...overrides,
  };
}

describe("terminal execution-result gate — wiring", () => {
  it("every declared terminal consumer calls the gate", () => {
    // An empty subject set would satisfy "all consumers call it" vacuously.
    expect(TERMINAL_CONSUMERS.length).toBeGreaterThan(0);
    const missing = TERMINAL_CONSUMERS.filter((relativePath) => {
      const source = fs.readFileSync(path.join(SRC_ROOT, relativePath), "utf8");
      return !source.includes("requireTerminalExecutionResult(");
    });
    expect(missing).toEqual([]);
  });

  it("the declared list covers every module that imports the gate", () => {
    // Catches a fourth consumer added without joining the list above — the list
    // is only a guarantee while it is complete.
    const importers: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) continue;
        const source = fs.readFileSync(full, "utf8");
        if (!source.includes("requireTerminalExecutionResult")) continue;
        const relative = path.relative(SRC_ROOT, full);
        // The gate's own module declares it rather than consuming it.
        if (relative === "core-runtime/review/artifact-types.ts") continue;
        importers.push(relative);
      }
    };
    walk(SRC_ROOT);
    expect(importers.length).toBeGreaterThan(0);
    expect(importers.sort()).toEqual([...TERMINAL_CONSUMERS].sort());
  });
});

describe("terminal execution-result gate — admission", () => {
  it("admits a complete terminal artifact", () => {
    const admitted = requireTerminalExecutionResult(terminalArtifact(), "test");
    expect(admitted.execution_completed_at).toBe("2026-08-05T00:00:10+09:00");
    expect(admitted.total_duration_ms).toBe(10_000);
  });

  it("refuses a completion record whose fields are absent, not null", () => {
    // Parsed YAML with a dropped key arrives as `undefined`, which `=== null`
    // does not catch. It used to sail through as a `string` that `Date.parse`
    // turned into NaN, and a record was written from it.
    const absent = terminalArtifact();
    delete (absent as Partial<ReviewExecutionResultArtifact>).execution_completed_at;
    delete (absent as Partial<ReviewExecutionResultArtifact>).total_duration_ms;
    expect(() => requireTerminalExecutionResult(absent, "test")).toThrow(
      /completion record is unusable/,
    );
  });

  it("refuses a status outside the vocabulary instead of trusting the type", () => {
    const bogus = terminalArtifact({
      execution_status: "finished" as ReviewExecutionResultArtifact["execution_status"],
    });
    expect(() => requireTerminalExecutionResult(bogus, "test")).toThrow(
      /unusable execution_status/,
    );
  });

  it("refuses a negative or non-finite duration", () => {
    expect(() =>
      requireTerminalExecutionResult(terminalArtifact({ total_duration_ms: -1 }), "test"),
    ).toThrow(/completion record is unusable/);
    expect(() =>
      requireTerminalExecutionResult(
        terminalArtifact({ total_duration_ms: Number.NaN }),
        "test",
      ),
    ).toThrow(/completion record is unusable/);
  });

  it("enumerates the whole status vocabulary, terminal and not", () => {
    expect([...REVIEW_EXECUTION_STATUS_VALUES].sort()).toEqual([
      "completed",
      "completed_with_degradation",
      "halted_partial",
      "running",
    ]);
  });
});
