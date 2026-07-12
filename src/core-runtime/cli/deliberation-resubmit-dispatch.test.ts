import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ReviewExecutionPlan } from "../review/artifact-types.js";
import type { ReviewExecutionProfile } from "../review/review-execution-profile.js";
import type { IssueScopedDeliberationWorkItem } from "../review/controlled-lens-deliberation.js";
import {
  executeDeliberationResponseUnit,
  toUnitExecutionResult,
  type ExecutionDispatchResult,
  type RuntimeUnitExecutionContext,
} from "./run-review-prompt-execution.js";
import { RESUBMIT_ERROR_SPEC_BEGIN } from "./unit-resubmit.js";

/**
 * §4-6a end-to-end at the deliberation-unit dispatch level: drives the REAL
 * `executeDeliberationResponseUnit` → `runSingleDispatchWithRetries` retry loop
 * over a REAL stub subprocess executor, proving the resubmit wire fires for
 * deliberation and heals — and that cap exhaustion falls back to the existing
 * non-halting degrade (`completeUnavailableDeliberationResponseUnit`), never a
 * whole-run halt.
 *
 * Why unit-level and not full-pipeline: a full run only dispatches per-issue
 * deliberation units when the upstream findings→issues→stances→plan chain is
 * non-empty, which no existing harness produces; reverse-engineering ~6
 * upstream validators would test unrelated stages. This enters at the unit
 * boundary the §4-6a change actually touches, exercising every runtime
 * component of it (retry loop, applyResubmitErrorSpec routing, packet
 * projection, deliberation schema-context recovery, degrade fallback) with the
 * real dispatch. The retry-loop call site is shared with issue-stance, whose
 * full-pipeline E2E lives in core-api/runtime-pipeline-resubmit.test.ts.
 */

// The rejected ref must NOT contain an envelope field-name substring
// (issue_id/schema_version/…) or failureKindFromMessage would misclassify the
// message as output_contract and suppress the retry (see design note §6).
const UNSUPPORTED_REF = "mock-unsupported-ref";
const DELIBERATION_MESSAGE = `submit_issue_deliberation_response.evidence_refs contains unsupported ref: ${UNSUPPORTED_REF}`;

const DELIBERATION_PACKET = `# Prompt

## Runtime Projection
\`\`\`yaml
issue:
  issue_id: issue-001
  surface_finding_ids: [finding-001]
  relation_refs: []
  evidence_refs:
    - round1/logic.findings.yaml#finding-001
own_stance:
  lens_id: logic
  evidence_refs:
    - issue-stance-matrix.yaml#stances.issue-001.logic
peer_stances:
  - lens_id: structure
    evidence_refs:
      - issue-stance-matrix.yaml#stances.issue-001.structure
plan_entry:
  source_stance_refs:
    - issue-stance-matrix.yaml#stances.issue-001.logic
\`\`\`
`;

/** Stub executor: fails the submit like a worker adapter (freeze salvage input,
 * print the validation message, exit 1). In `correct_on_resubmit` mode an
 * attempt whose packet carries the injected error spec succeeds — the
 * deterministic analogue of the model fixing its refs after reading the spec.
 * A success writes a distinctive response so heal is distinguishable from the
 * degrade artifact. Every invocation is logged. */
const STUB_SOURCE = [
  'import fs from "node:fs";',
  'import path from "node:path";',
  "const a = process.argv.slice(2);",
  "const get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };",
  'const unitId = get("--unit-id");',
  'const unitKind = get("--unit-kind");',
  'const out = get("--output-path");',
  'const packetPath = get("--packet-path");',
  'const sessionId = path.basename(get("--session-root") ?? "");',
  "if (process.env.ONTO_DELIB_INVOCATION_LOG) {",
  "  fs.appendFileSync(process.env.ONTO_DELIB_INVOCATION_LOG, `${unitId}\\n`);",
  "}",
  'const packetText = packetPath && fs.existsSync(packetPath) ? fs.readFileSync(packetPath, "utf8") : "";',
  `const healed = process.env.ONTO_DELIB_STUB_MODE === "correct_on_resubmit" && packetText.includes(${JSON.stringify(RESUBMIT_ERROR_SPEC_BEGIN)});`,
  'if (process.env.ONTO_DELIB_FAIL === "1" && !healed) {',
  "  fs.mkdirSync(path.dirname(out), { recursive: true });",
  "  fs.writeFileSync(",
  "    `${out}.salvage-input.json`,",
  "    JSON.stringify({",
  "      unit_id: unitId,",
  "      unit_kind: unitKind,",
  '      output_format: get("--output-format") ?? "issue-deliberation-response",',
  '      stdout: "",',
  `      error: ${JSON.stringify(DELIBERATION_MESSAGE)},`,
  "    }),",
  "  );",
  `  console.error(${JSON.stringify(DELIBERATION_MESSAGE)});`,
  "  process.exit(1);",
  "}",
  'const [, issueId, lensId] = unitId.split(":");',
  "fs.mkdirSync(path.dirname(out), { recursive: true });",
  "fs.writeFileSync(",
  "  out,",
  "  `schema_version: 1\\nsession_id: ${sessionId}\\nissue_id: ${issueId}\\nlens_id: ${lensId}\\ndifference_explanation: healed by resubmit\\nchanged: false\\n`,",
  ");",
  "",
].join("\n");

let tmp: string;
let stubPath: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), "onto-delib-e2e-"));
  stubPath = path.join(tmp, "delib-stub-executor.mjs");
  await fs.writeFile(stubPath, STUB_SOURCE, "utf8");
});

afterEach(async () => {
  delete process.env.ONTO_DELIB_FAIL;
  delete process.env.ONTO_DELIB_STUB_MODE;
  delete process.env.ONTO_DELIB_INVOCATION_LOG;
  await fs.rm(tmp, { recursive: true, force: true });
});

function ctx(enabled: boolean): RuntimeUnitExecutionContext {
  return {
    projectRoot: tmp,
    sessionRoot: tmp,
    executionPlan: {
      session_id: "delib-e2e",
      session_root: tmp,
      artifact_generation_realization: "live",
      error_log_path: path.join(tmp, "error-log.md"),
    } as unknown as ReviewExecutionPlan,
    executorConfig: { bin: process.execPath, args: [stubPath] },
    retryPolicy: {
      lensMaxRetries: 0,
      issueArtifactMaxRetries: 0,
      // 3 total attempts (1 original + 2 resubmits), reusing the design's
      // existing retry budget vocabulary.
      deliberationMaxRetries: 2,
      synthesisMaxRetries: 0,
      retryInitialDelayMs: 1,
    },
    reviewExecutionProfile: {
      retry: { resubmit: { enabled } },
    } as unknown as ReviewExecutionProfile,
  };
}

async function scratchUnit(): Promise<{
  dispatch: ExecutionDispatchResult;
  workItem: IssueScopedDeliberationWorkItem;
}> {
  const packetPath = path.join(tmp, "packet.md");
  const outputPath = path.join(tmp, "responses", "issue-001", "logic.yaml");
  await fs.writeFile(packetPath, DELIBERATION_PACKET, "utf8");
  const dispatch: ExecutionDispatchResult = {
    unit_id: "deliberation:issue-001:logic",
    unit_kind: "deliberation",
    packet_path: packetPath,
    output_path: outputPath,
    output_format: "issue-deliberation-response",
  };
  const workItem: IssueScopedDeliberationWorkItem = {
    issue_id: "issue-001",
    lens_id: "logic",
    packet_path: packetPath,
    output_path: outputPath,
    issue: {},
    related_issue_context: [],
    // own_stance.stance seeds the degrade artifact's updated_stance (a required
    // enum) — the unavailable-completion preserves the source stance verbatim.
    own_stance: { stance: "support" },
    peer_stances: [],
    plan_entry: {},
  };
  return { dispatch, workItem };
}

async function readLog(): Promise<string> {
  try {
    return await fs.readFile(path.join(tmp, "error-log.md"), "utf8");
  } catch {
    return "";
  }
}

async function invocationLogPath(): Promise<string> {
  const p = path.join(tmp, "invocations.log");
  process.env.ONTO_DELIB_INVOCATION_LOG = p;
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

describe("deliberation resubmit dispatch E2E (§4-6a)", () => {
  it("ON heal: the injected error spec turns a rejected submit into a completed unit", async () => {
    process.env.ONTO_DELIB_FAIL = "1";
    process.env.ONTO_DELIB_STUB_MODE = "correct_on_resubmit";
    const logPath = await invocationLogPath();
    const { dispatch, workItem } = await scratchUnit();

    const outcome = await executeDeliberationResponseUnit({
      ctx: ctx(true),
      dispatch,
      workItem,
    });

    // Healed to a real completion — not degraded.
    expect(outcome.success).toBe(true);
    expect(outcome.childOutcomes ?? []).toEqual([]); // no failed child = no degrade
    // review-cert/v2 falsifiability gate (§5.3): the healed SUCCESS outcome
    // must carry the loop-accumulated resubmit marker — the spec fires on the
    // failed iteration, so per-attempt capture would miss exactly this case.
    expect(outcome.resubmitApplied).toBe(true);
    expect(toUnitExecutionResult(outcome).resubmit_applied).toBe(true);
    const output = await fs.readFile(dispatch.output_path, "utf8");
    expect(output).toContain("healed by resubmit");

    // Exactly one failing attempt + one healed resubmit reached the executor.
    expect(await countInvocations(logPath)).toBe(2);

    // The resubmit request carried the deliberation error spec with a
    // packet-recovered allowed set.
    const packetText = await fs.readFile(dispatch.packet_path, "utf8");
    expect(packetText).toContain(RESUBMIT_ERROR_SPEC_BEGIN);
    expect(packetText).toContain("submit_issue_deliberation_response");
    expect(packetText).toContain("lens_id: logic");
    expect(packetText).toContain("- issue-ledger.yaml#issue-001");

    const log = await readLog();
    expect(log).toContain(
      "runner deliberation resubmit: deliberation:issue-001:logic",
    );
    expect(log).not.toContain("runner issue deliberation runtime completion");
  });

  it("ON exhausted: spec is injected every retry, then degrades (no whole-run halt)", async () => {
    process.env.ONTO_DELIB_FAIL = "1"; // never heals (no correct_on_resubmit)
    const logPath = await invocationLogPath();
    const { dispatch, workItem } = await scratchUnit();

    const outcome = await executeDeliberationResponseUnit({
      ctx: ctx(true),
      dispatch,
      workItem,
    });

    // Non-halting degrade: unavailable-completion returns a success outcome
    // carrying the failed attempt as a child.
    expect(outcome.success).toBe(true);
    expect(outcome.childOutcomes?.[0]?.success).toBe(false);
    const output = await fs.readFile(dispatch.output_path, "utf8");
    expect(output).not.toContain("healed by resubmit"); // it's the degrade artifact

    // 1 original + 2 resubmit retries all reached the executor.
    expect(await countInvocations(logPath)).toBe(3);

    const packetText = await fs.readFile(dispatch.packet_path, "utf8");
    expect(packetText).toContain(RESUBMIT_ERROR_SPEC_BEGIN);
    const log = await readLog();
    expect(log).toContain(
      "runner deliberation resubmit: deliberation:issue-001:logic",
    );
    expect(log).toContain("runner issue deliberation runtime completion");
  });

  it("OFF contrast: identical failure degrades with NO spec injection (blind retry preserved)", async () => {
    process.env.ONTO_DELIB_FAIL = "1";
    const logPath = await invocationLogPath();
    const { dispatch, workItem } = await scratchUnit();

    const outcome = await executeDeliberationResponseUnit({
      ctx: ctx(false),
      dispatch,
      workItem,
    });

    // Same degrade outcome as the ON-exhausted case...
    expect(outcome.success).toBe(true);
    expect(outcome.childOutcomes?.[0]?.success).toBe(false);
    expect(await countInvocations(logPath)).toBe(3);

    // ...but the packet was NEVER touched and no resubmit ran — this is the
    // toggle's default-off blind-retry behavior, byte-preserved.
    expect(await fs.readFile(dispatch.packet_path, "utf8")).toBe(
      DELIBERATION_PACKET,
    );
    const log = await readLog();
    expect(log).not.toContain("runner deliberation resubmit");
    expect(log).toContain("runner issue deliberation runtime completion");
  });
});
