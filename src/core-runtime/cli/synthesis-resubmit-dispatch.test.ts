import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ReviewExecutionPlan } from "../review/artifact-types.js";
import type { ReviewExecutionProfile } from "../review/review-execution-profile.js";
import type { ReviewSynthesisWorkItem } from "../review/synthesis-map-reduce.js";
import {
  executeSynthesisResponseUnit,
  type ExecutionDispatchResult,
  type RuntimeUnitExecutionContext,
} from "./run-review-prompt-execution.js";
import { RESUBMIT_ERROR_SPEC_BEGIN } from "./unit-resubmit.js";

/**
 * §4-2c/2-A end-to-end at the synthesis-unit dispatch level: drives the REAL
 * `executeSynthesisResponseUnit` → shared `runSingleDispatchWithRetries` retry
 * loop over a REAL stub subprocess executor. Unlike deliberation, the synthesis
 * rejection message ALWAYS carries `source_refs_used`, so failureKindFromMessage
 * classifies it output_contract — which is terminal WITHOUT the §4-2c structural
 * retry gate. This makes the ON(retries) vs OFF(no retry) invocation-count
 * contrast a discriminating proof that the gate is load-bearing on the real
 * dispatch path (and that the poison message actually survives to the gate).
 */

const SYNTHESIS_MESSAGE =
  "submit_issue_synthesis_response.source_refs_used contains unsupported ref: bad-ref";

const SYNTHESIS_PACKET = `# Prompt

## Runtime Work Item
\`\`\`yaml
work_item_id: "synthesis:issue-001"
allowed_source_refs:
  - issue-ledger.yaml#issue-001
  - synthesis-work-items.yaml#synthesis:issue-001
\`\`\`
`;

/** Stub executor: always fails the submit like a worker adapter (freeze salvage
 * input, print the validation message to stderr, exit 1). It never heals, so
 * both ON and OFF end in the synthesis unavailable-completion degrade; the
 * discriminating signal is HOW MANY times the executor was invoked. */
const STUB_SOURCE = [
  'import fs from "node:fs";',
  'import path from "node:path";',
  "const a = process.argv.slice(2);",
  "const get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };",
  'const unitId = get("--unit-id");',
  'const unitKind = get("--unit-kind");',
  'const out = get("--output-path");',
  "if (process.env.ONTO_SYNTH_INVOCATION_LOG) {",
  "  fs.appendFileSync(process.env.ONTO_SYNTH_INVOCATION_LOG, `${unitId}\\n`);",
  "}",
  "fs.mkdirSync(path.dirname(out), { recursive: true });",
  "fs.writeFileSync(",
  "  `${out}.salvage-input.json`,",
  "  JSON.stringify({",
  "    unit_id: unitId,",
  "    unit_kind: unitKind,",
  '    output_format: get("--output-format") ?? "issue-synthesis-response",',
  '    stdout: "",',
  `    error: ${JSON.stringify(SYNTHESIS_MESSAGE)},`,
  "  }),",
  ");",
  `console.error(${JSON.stringify(SYNTHESIS_MESSAGE)});`,
  "process.exit(1);",
  "",
].join("\n");

let tmp: string;
let stubPath: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "onto-synth-e2e-"));
  stubPath = path.join(tmp, "synth-stub-executor.mjs");
  await fs.writeFile(stubPath, STUB_SOURCE, "utf8");
});

afterEach(async () => {
  delete process.env.ONTO_SYNTH_INVOCATION_LOG;
  await fs.rm(tmp, { recursive: true, force: true });
});

function ctx(enabled: boolean): RuntimeUnitExecutionContext {
  return {
    projectRoot: tmp,
    sessionRoot: tmp,
    executionPlan: {
      session_id: "synth-e2e",
      session_root: tmp,
      artifact_generation_realization: "live",
      error_log_path: path.join(tmp, "error-log.md"),
    } as unknown as ReviewExecutionPlan,
    executorConfig: { bin: process.execPath, args: [stubPath] },
    retryPolicy: {
      lensMaxRetries: 0,
      issueArtifactMaxRetries: 0,
      deliberationMaxRetries: 0,
      // 3 total attempts (1 original + 2 resubmits) when the gate allows retry.
      synthesisMaxRetries: 2,
      retryInitialDelayMs: 1,
    },
    reviewExecutionProfile: {
      retry: { resubmit: { enabled } },
    } as unknown as ReviewExecutionProfile,
  };
}

async function scratchUnit(): Promise<{
  dispatch: ExecutionDispatchResult;
  workItem: ReviewSynthesisWorkItem;
}> {
  const packetPath = path.join(tmp, "packet.md");
  const outputPath = path.join(tmp, "responses", "issue-001", "synthesis.yaml");
  await fs.writeFile(packetPath, SYNTHESIS_PACKET, "utf8");
  const dispatch: ExecutionDispatchResult = {
    unit_id: "synthesis:issue-001",
    unit_kind: "synthesize",
    packet_path: packetPath,
    output_path: outputPath,
    output_format: "issue-synthesis-response",
  };
  // Minimal work item: the retry loop reads only `dispatch`; the work item is
  // consumed solely by the post-loop unavailable-completion, whose success is
  // not asserted here (the discriminating signals are loop-level).
  const workItem = {
    work_item_id: "synthesis:issue-001",
    issue_id: "issue-001",
    response_path: outputPath,
    packet_path: packetPath,
    allowed_source_refs: ["issue-ledger.yaml#issue-001"],
  } as unknown as ReviewSynthesisWorkItem;
  return { dispatch, workItem };
}

async function invocationLogPath(): Promise<string> {
  const p = path.join(tmp, "invocations.log");
  process.env.ONTO_SYNTH_INVOCATION_LOG = p;
  return p;
}

async function countInvocations(logPath: string): Promise<number> {
  try {
    return (await fs.readFile(logPath, "utf8"))
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean).length;
  } catch {
    return 0;
  }
}

async function readLog(): Promise<string> {
  try {
    return await fs.readFile(path.join(tmp, "error-log.md"), "utf8");
  } catch {
    return "";
  }
}

describe("synthesis resubmit dispatch E2E (§4-2c/2-A)", () => {
  it("ON: the structural gate routes the output_contract poison message back to retry + spec injection", async () => {
    const logPath = await invocationLogPath();
    const { dispatch, workItem } = await scratchUnit();

    await executeSynthesisResponseUnit({
      ctx: ctx(true),
      dispatch,
      workItem,
      sourceWorkItemsRef: "synthesis-work-items.yaml#synthesis:issue-001",
    });

    // 1 original + 2 gate-allowed resubmit retries all reached the executor.
    expect(await countInvocations(logPath)).toBe(3);

    const packetText = await fs.readFile(dispatch.packet_path, "utf8");
    expect(packetText).toContain(RESUBMIT_ERROR_SPEC_BEGIN);
    expect(packetText).toContain("submit_issue_synthesis_response");
    expect(packetText).toContain("- unsupported source ref: bad-ref");
    expect(packetText).toContain("- issue-ledger.yaml#issue-001");

    const log = await readLog();
    expect(log).toContain("runner synthesis resubmit: synthesis:issue-001");
  });

  it("OFF contrast: the same output_contract poison is terminal — exactly ONE invocation, packet untouched", async () => {
    const logPath = await invocationLogPath();
    const { dispatch, workItem } = await scratchUnit();

    await executeSynthesisResponseUnit({
      ctx: ctx(false),
      dispatch,
      workItem,
      sourceWorkItemsRef: "synthesis-work-items.yaml#synthesis:issue-001",
    });

    // No structural gate → output_contract stays terminal → NO retry. This is
    // the synthesis-specific contrast (deliberation's non-poison message would
    // blind-retry to 3 even OFF); 1 here proves the poison message reached the
    // gate as output_contract and OFF suppressed the retry (byte-identical).
    expect(await countInvocations(logPath)).toBe(1);

    // Packet never touched, no resubmit ran.
    expect(await fs.readFile(dispatch.packet_path, "utf8")).toBe(SYNTHESIS_PACKET);
    const log = await readLog();
    expect(log).not.toContain("runner synthesis resubmit");
  });
});
