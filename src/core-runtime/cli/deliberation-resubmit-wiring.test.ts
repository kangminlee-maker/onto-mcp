import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ReviewExecutionProfile } from "../review/review-execution-profile.js";
import {
  applyResubmitErrorSpec,
  type ExecutionDispatchResult,
} from "./run-review-prompt-execution.js";
import {
  RESUBMIT_ERROR_SPEC_BEGIN,
  packetHasResubmitErrorSpec,
} from "./unit-resubmit.js";

/**
 * §4-6a runtime wiring: the deliberation-specific half of applyResubmitErrorSpec
 * that the pure unit-resubmit tests cannot reach — output_format routing,
 * deliberation unit_id parse (deliberation:<issue>:<lens>), allowed-set recovery
 * from the packet's Runtime Projection (flat, single-(issue,lens)), and the
 * message/frozen-salvage classification. Exercised against a real packet on disk
 * through the real function; the retry-loop call site is the same
 * runSingleDispatchWithRetries entry the stance E2E already covers.
 */

// A real deliberation packet whose Runtime Projection yields a known allowed
// set (mirrors structured-output-tools.test.ts's deliberation fixture).
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

const DELIBERATION_MESSAGE =
  "submit_issue_deliberation_response.evidence_refs contains unsupported ref: bad-ref";

const tempRoots: string[] = [];

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

async function scratch(): Promise<{
  dir: string;
  packetPath: string;
  outputPath: string;
  errorLogPath: string;
}> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "delib-resubmit-"));
  tempRoots.push(dir);
  const packetPath = path.join(dir, "packet.md");
  const outputPath = path.join(dir, "output.yaml");
  const errorLogPath = path.join(dir, "error.log");
  await fs.writeFile(packetPath, DELIBERATION_PACKET, "utf8");
  return { dir, packetPath, outputPath, errorLogPath };
}

function deliberationDispatch(
  packetPath: string,
  outputPath: string,
): ExecutionDispatchResult {
  return {
    unit_id: "deliberation:issue-001:logic",
    unit_kind: "deliberation",
    packet_path: packetPath,
    output_path: outputPath,
    output_format: "issue-deliberation-response",
  };
}

function profile(enabled: boolean): ReviewExecutionProfile {
  return {
    retry: { resubmit: { enabled } },
  } as unknown as ReviewExecutionProfile;
}

describe("applyResubmitErrorSpec — deliberation wiring (§4-6a)", () => {
  it("injects the deliberation spec with a packet-recovered allowed set", async () => {
    const s = await scratch();

    const applied = await applyResubmitErrorSpec({
      dispatch: deliberationDispatch(s.packetPath, s.outputPath),
      error: new Error(DELIBERATION_MESSAGE),
      attempt: 0,
      reviewExecutionProfile: profile(true),
      errorLogPath: s.errorLogPath,
    });

    expect(applied).toBe(true);
    const packetText = await fs.readFile(s.packetPath, "utf8");
    expect(packetHasResubmitErrorSpec(packetText)).toBe(true);
    // deliberation-flavored spec (not the stance wording)
    expect(packetText).toContain("submit_issue_deliberation_response");
    expect(packetText).toContain(
      "- rejected: deliberation for issue_id: issue-001, lens_id: logic",
    );
    expect(packetText).toContain("- unsupported evidence_ref: bad-ref");
    // allowed set really came from parsing the Runtime Projection, not a stub
    expect(packetText).toContain("- issue-ledger.yaml#issue-001");
    expect(packetText).toContain(
      "- issue-stance-matrix.yaml#stances.issue-001.structure",
    );
    expect(packetText).toContain("Resubmit the full deliberation response");
    // the original packet body is preserved
    expect(packetText).toContain("## Runtime Projection");

    const errorLog = await fs.readFile(s.errorLogPath, "utf8");
    expect(errorLog).toContain(
      "runner deliberation resubmit: deliberation:issue-001:logic",
    );
    expect(errorLog).toContain("lens_id: logic");
    expect(errorLog).toContain("unsupported_ref: bad-ref");
  });

  it("recovers the violation from the frozen salvage input when error is null", async () => {
    const s = await scratch();
    // Worker-adapter path: the failing attempt froze the submit error next to
    // the output file; the pre-attempt injection (attempt 0, error=null) reads
    // it structurally.
    await fs.writeFile(
      `${s.outputPath}.salvage-input.json`,
      JSON.stringify({
        unit_id: "deliberation:issue-001:logic",
        unit_kind: "deliberation",
        output_format: "issue-deliberation-response",
        stdout: "",
        error: DELIBERATION_MESSAGE,
      }),
      "utf8",
    );

    const applied = await applyResubmitErrorSpec({
      dispatch: deliberationDispatch(s.packetPath, s.outputPath),
      error: null,
      attempt: 0,
      reviewExecutionProfile: profile(true),
      errorLogPath: s.errorLogPath,
    });

    expect(applied).toBe(true);
    expect(packetHasResubmitErrorSpec(await fs.readFile(s.packetPath, "utf8"))).toBe(
      true,
    );
  });

  it("OFF: the disabled gate is a no-op (packet untouched, no log)", async () => {
    const s = await scratch();

    const applied = await applyResubmitErrorSpec({
      dispatch: deliberationDispatch(s.packetPath, s.outputPath),
      error: new Error(DELIBERATION_MESSAGE),
      attempt: 0,
      reviewExecutionProfile: profile(false),
      errorLogPath: s.errorLogPath,
    });

    expect(applied).toBe(false);
    expect(await fs.readFile(s.packetPath, "utf8")).toBe(DELIBERATION_PACKET);
    await expect(fs.access(s.errorLogPath)).rejects.toThrow();
  });

  it("no-op for an unclassifiable failure (infra error keeps blind retry)", async () => {
    const s = await scratch();

    const applied = await applyResubmitErrorSpec({
      dispatch: deliberationDispatch(s.packetPath, s.outputPath),
      error: new Error("Executor exited with code 1 for deliberation:issue-001:logic"),
      attempt: 0,
      reviewExecutionProfile: profile(true),
      errorLogPath: s.errorLogPath,
    });

    expect(applied).toBe(false);
    expect(await fs.readFile(s.packetPath, "utf8")).toBe(DELIBERATION_PACKET);
  });

  it("no-op for a non-resubmit output_format (synthesis stays blind)", async () => {
    const s = await scratch();

    const applied = await applyResubmitErrorSpec({
      dispatch: {
        unit_id: "synthesis:issue-001",
        unit_kind: "synthesize",
        packet_path: s.packetPath,
        output_path: s.outputPath,
        output_format: "issue-synthesis-response",
      },
      error: new Error(
        "submit_issue_synthesis_response.source_refs_used contains unsupported ref: bad-ref",
      ),
      attempt: 0,
      reviewExecutionProfile: profile(true),
      errorLogPath: s.errorLogPath,
    });

    expect(applied).toBe(false);
    expect(await fs.readFile(s.packetPath, "utf8")).toBe(DELIBERATION_PACKET);
  });

  it("idempotent across resubmit rounds: the packet carries at most one spec", async () => {
    const s = await scratch();
    const dispatch = deliberationDispatch(s.packetPath, s.outputPath);

    await applyResubmitErrorSpec({
      dispatch,
      error: new Error(DELIBERATION_MESSAGE),
      attempt: 0,
      reviewExecutionProfile: profile(true),
      errorLogPath: s.errorLogPath,
    });
    await applyResubmitErrorSpec({
      dispatch,
      error: new Error(
        "submit_issue_deliberation_response.evidence_refs contains unsupported ref: other-bad-ref",
      ),
      attempt: 1,
      reviewExecutionProfile: profile(true),
      errorLogPath: s.errorLogPath,
    });

    const packetText = await fs.readFile(s.packetPath, "utf8");
    expect(packetText.split(RESUBMIT_ERROR_SPEC_BEGIN).length - 1).toBe(1);
    expect(packetText).toContain("other-bad-ref");
    expect(packetText).not.toContain("unsupported evidence_ref: bad-ref");
  });
});
