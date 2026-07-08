import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ReviewExecutionProfile } from "../review/review-execution-profile.js";
import {
  applyResubmitErrorSpec,
  type ExecutionDispatchResult,
} from "./run-review-prompt-execution.js";
import { packetHasResubmitErrorSpec } from "./unit-resubmit.js";

/**
 * §4-2c/2-A synthesis wiring: the synthesis half of applyResubmitErrorSpec —
 * issue-synthesis-response routing, synthesis unit_id parse (synthesis:<issue>),
 * allowed_source_refs recovery from the packet's Runtime Work Item, and the
 * source_refs_used error-spec injection for both correctable rejection shapes.
 * Exercised against a real packet on disk through the real function.
 */

// A real synthesis packet whose Runtime Work Item yields a known allowed set.
const SYNTHESIS_PACKET = `# Prompt

## Runtime Work Item
\`\`\`yaml
work_item_id: "synthesis:issue-001"
allowed_source_refs:
  - issue-ledger.yaml#issue-001
  - synthesis-work-items.yaml#synthesis:issue-001
\`\`\`
`;

const UNSUPPORTED_REF_MESSAGE =
  "submit_issue_synthesis_response.source_refs_used contains unsupported ref: bad-ref";
const MISSING_ALLOWED_MESSAGE =
  "submit_issue_synthesis_response.source_refs_used must include at least one allowed source ref.";

const tempRoots: string[] = [];

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

async function scratch(): Promise<{
  packetPath: string;
  outputPath: string;
  errorLogPath: string;
}> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "synth-resubmit-"));
  tempRoots.push(dir);
  const packetPath = path.join(dir, "packet.md");
  const outputPath = path.join(dir, "output.yaml");
  const errorLogPath = path.join(dir, "error.log");
  await fs.writeFile(packetPath, SYNTHESIS_PACKET, "utf8");
  return { packetPath, outputPath, errorLogPath };
}

function synthesisDispatch(
  packetPath: string,
  outputPath: string,
): ExecutionDispatchResult {
  return {
    unit_id: "synthesis:issue-001",
    unit_kind: "synthesize",
    packet_path: packetPath,
    output_path: outputPath,
    output_format: "issue-synthesis-response",
  };
}

function profile(enabled: boolean): ReviewExecutionProfile {
  return {
    retry: { resubmit: { enabled } },
  } as unknown as ReviewExecutionProfile;
}

describe("applyResubmitErrorSpec — synthesis wiring (§4-2c/2-A)", () => {
  it("injects the synthesis spec with a packet-recovered allowed set (contains unsupported ref)", async () => {
    const s = await scratch();

    const applied = await applyResubmitErrorSpec({
      dispatch: synthesisDispatch(s.packetPath, s.outputPath),
      error: new Error(UNSUPPORTED_REF_MESSAGE),
      attempt: 0,
      reviewExecutionProfile: profile(true),
      errorLogPath: s.errorLogPath,
    });

    expect(applied).toBe(true);
    const packetText = await fs.readFile(s.packetPath, "utf8");
    expect(packetHasResubmitErrorSpec(packetText)).toBe(true);
    // synthesis-flavored spec: source_refs_used wording, not evidence_refs.
    expect(packetText).toContain("submit_issue_synthesis_response");
    expect(packetText).toContain("source_refs_used validation rejected");
    expect(packetText).toContain(
      "- rejected: synthesis response for issue_id: issue-001",
    );
    expect(packetText).toContain("- unsupported source ref: bad-ref");
    expect(packetText).not.toContain("evidence_ref");
    // allowed set really came from parsing the Runtime Work Item, not a stub.
    expect(packetText).toContain("- issue-ledger.yaml#issue-001");
    expect(packetText).toContain(
      "- synthesis-work-items.yaml#synthesis:issue-001",
    );
  });

  it("must-include-at-least-one rejection → spec instructs citing from the allowed set (no specific ref)", async () => {
    const s = await scratch();

    const applied = await applyResubmitErrorSpec({
      dispatch: synthesisDispatch(s.packetPath, s.outputPath),
      error: new Error(MISSING_ALLOWED_MESSAGE),
      attempt: 0,
      reviewExecutionProfile: profile(true),
      errorLogPath: s.errorLogPath,
    });

    expect(applied).toBe(true);
    const packetText = await fs.readFile(s.packetPath, "utf8");
    expect(packetText).toContain(
      "- you cited no allowed source ref; include at least one from the allowed set below",
    );
    expect(packetText).not.toContain("- unsupported source ref:");
    expect(packetText).toContain("- issue-ledger.yaml#issue-001");
  });

  it("OFF (resubmit disabled): synthesis resubmit is a no-op, packet untouched", async () => {
    const s = await scratch();
    const before = await fs.readFile(s.packetPath, "utf8");

    const applied = await applyResubmitErrorSpec({
      dispatch: synthesisDispatch(s.packetPath, s.outputPath),
      error: new Error(UNSUPPORTED_REF_MESSAGE),
      attempt: 0,
      reviewExecutionProfile: profile(false),
      errorLogPath: s.errorLogPath,
    });

    expect(applied).toBe(false);
    expect(await fs.readFile(s.packetPath, "utf8")).toBe(before);
  });

  it("the non-correctable empty-allowed-set rejection is not treated as resubmit-correctable", async () => {
    const s = await scratch();

    const applied = await applyResubmitErrorSpec({
      dispatch: synthesisDispatch(s.packetPath, s.outputPath),
      error: new Error(
        "submit_issue_synthesis_response cannot validate source_refs_used because allowed_source_refs is empty.",
      ),
      attempt: 0,
      reviewExecutionProfile: profile(true),
      errorLogPath: s.errorLogPath,
    });

    expect(applied).toBe(false);
  });
});
