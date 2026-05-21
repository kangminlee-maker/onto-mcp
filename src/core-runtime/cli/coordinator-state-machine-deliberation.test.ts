/**
 * Tests for coordinator-state-machine deliberation handling (C-1).
 *
 * Two invariants pinned:
 *   1. awaiting_synthesize_dispatch → completing must fail-fast when the
 *      synthesis output does not declare `deliberation_status: performed`.
 *   2. awaiting_deliberation is an active canonical state that fails loudly
 *      when its required execution plan is absent.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { coordinatorNext } from "./coordinator-state-machine.js";

async function makeSessionRoot(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), `onto-coord-delib-${prefix}-`));
}

async function writeState(sessionRoot: string, state: string): Promise<void> {
  const now = new Date().toISOString();
  await fs.writeFile(
    path.join(sessionRoot, "coordinator-state.yaml"),
    YAML.stringify({
      schema_version: "1",
      current_state: state,
      session_root: sessionRoot,
      request_text: "deliberation guard test",
      started_at: now,
      halt_reason: null,
      error_message: null,
      transitions: [
        { from: "(init)", to: "preparing", at: now },
        { from: "preparing", to: "awaiting_lens_dispatch", at: now },
        {
          from: "awaiting_lens_dispatch",
          to: "validating_lenses",
          at: now,
        },
        {
          from: "validating_lenses",
          to: "awaiting_synthesize_dispatch",
          at: now,
        },
      ],
    }),
    "utf8",
  );
}

async function writeExecutionPlan(
  sessionRoot: string,
  synthesisOutputPath: string,
): Promise<void> {
  await fs.writeFile(
    path.join(sessionRoot, "execution-plan.yaml"),
    YAML.stringify({
      session_id: "test-session",
      synthesis_output_path: synthesisOutputPath,
      max_concurrent_lenses: 5,
    }),
    "utf8",
  );
}

async function writeSynthesisOutput(
  filePath: string,
  deliberationStatus: string,
): Promise<void> {
  const body =
    `---\n` +
    `deliberation_status: ${deliberationStatus}\n` +
    `participation:\n` +
    `  expected_lenses: [logic]\n` +
    `  received_lenses: [logic]\n` +
    `  run_status: full\n` +
    `---\n\n` +
    `## Consensus\n\nnothing contested\n`;
  await fs.writeFile(filePath, body, "utf8");
}

describe("coordinator-state-machine — deliberation-status guard (C-1)", () => {
  const sessionRoots: string[] = [];

  beforeEach(() => {
    sessionRoots.length = 0;
  });

  afterEach(async () => {
    for (const root of sessionRoots) {
      try {
        await fs.rm(root, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it("fails fast when synthesis does not acknowledge controlled deliberation", async () => {
    const sessionRoot = await makeSessionRoot("bad-status");
    sessionRoots.push(sessionRoot);
    const synthesisPath = path.join(sessionRoot, "synthesis.md");
    await writeSynthesisOutput(synthesisPath, "unperformed");
    await writeExecutionPlan(sessionRoot, synthesisPath);
    await writeState(sessionRoot, "awaiting_synthesize_dispatch");

    const result = await coordinatorNext(sessionRoot, sessionRoot);
    expect(result.state).toBe("failed");
    if (result.state === "failed") {
      expect(result.error_message).toMatch(/deliberation_status: performed/);
    }
    const diskRaw = await fs.readFile(
      path.join(sessionRoot, "coordinator-state.yaml"),
      "utf8",
    );
    const disk = YAML.parse(diskRaw) as { current_state: string };
    expect(disk.current_state).not.toBe("completed");
  });

  it("advances normally when synthesis declares performed", async () => {
    const sessionRoot = await makeSessionRoot("performed");
    sessionRoots.push(sessionRoot);
    const synthesisPath = path.join(sessionRoot, "synthesis.md");
    await writeSynthesisOutput(synthesisPath, "performed");
    await writeExecutionPlan(sessionRoot, synthesisPath);
    await writeState(sessionRoot, "awaiting_synthesize_dispatch");

    // The completing auto-state runs multiple downstream steps
    // (writeExecutionResult / completeReviewSession). In the hermetic
    // fixture those will fail before reaching `completed`, but the
    // key invariant for C-1 is: failure must NOT be from the
    // deliberation-status guard. Any error that *does* occur must
    // come from a later step.
    const result = await coordinatorNext(sessionRoot, sessionRoot);
    if (result.state === "failed") {
      expect(result.error_message ?? "").not.toMatch(
        /deliberation_status: performed/,
      );
    }
    // Either the run advanced to completed or failed for an unrelated
    // downstream reason — both outcomes clear the guard.
  });

  it("fails fast when synthesis omits controlled deliberation acknowledgement", async () => {
    const sessionRoot = await makeSessionRoot("missing-status");
    sessionRoots.push(sessionRoot);
    const synthesisPath = path.join(sessionRoot, "synthesis.md");
    await fs.writeFile(synthesisPath, "# Synthesis\n", "utf8");
    await writeExecutionPlan(sessionRoot, synthesisPath);
    await writeState(sessionRoot, "awaiting_synthesize_dispatch");

    const result = await coordinatorNext(sessionRoot, sessionRoot);
    expect(result.state).toBe("failed");
    if (result.state === "failed") {
      expect(result.error_message ?? "").toMatch(/deliberation_status: performed/);
    }
  });
});

describe("coordinator-state-machine — awaiting_deliberation invariant (C-1)", () => {
  const sessionRoots: string[] = [];

  afterEach(async () => {
    for (const root of sessionRoots) {
      try {
        await fs.rm(root, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    sessionRoots.length = 0;
  });

  it("fails loudly when awaiting_deliberation lacks its execution plan", async () => {
    const sessionRoot = await makeSessionRoot("missing-plan");
    sessionRoots.push(sessionRoot);
    const now = new Date().toISOString();
    fsSync.writeFileSync(
      path.join(sessionRoot, "coordinator-state.yaml"),
      YAML.stringify({
        schema_version: "1",
        current_state: "awaiting_deliberation",
        session_root: sessionRoot,
        request_text: "invariant test",
        started_at: now,
        halt_reason: null,
        error_message: null,
        transitions: [{ from: "(init)", to: "preparing", at: now }],
      }),
      "utf8",
    );

    const result = await coordinatorNext(sessionRoot, sessionRoot);
    expect(result.state).toBe("failed");
    if (result.state === "failed") {
      expect(result.error_message ?? "").toMatch(/execution-plan\.yaml/);
    }
  });
});
