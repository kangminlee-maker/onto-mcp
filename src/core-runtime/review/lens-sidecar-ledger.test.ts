import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ReviewLensSidecarArtifact } from "./artifact-types.js";
import {
  allLensOutputsAreSidecars,
  buildFindingLedgerFromLensSidecars,
  renderRuntimeFindingLedgerPacket,
  writeFindingLedgerFromLensSidecars,
} from "./lens-sidecar-ledger.js";
import { lensSidecarArtifactPath } from "./lens-sidecar-artifact.js";
import { writeYamlDocument } from "./review-artifact-utils.js";

let scratchRoot = "";

function sidecar(lensId: string): ReviewLensSidecarArtifact {
  return {
    schema_version: 1,
    session_id: "session-001",
    lens_id: lensId,
    human_output_ref: `.onto/review/session-001/round1/${lensId}.md`,
    findings: [
      {
        candidate_id: `${lensId}-candidate-001`,
        target: "execution-preparation/materialized-input.md",
        evidence_anchor: "execution-preparation/materialized-input.md:10",
        claim: `${lensId} claim`,
        what: `${lensId} what`,
        why: `${lensId} impact`,
        how_to_fix: `${lensId} fix`,
        upstream_evidence_required: false,
        severity_hint: "medium",
        materiality_basis: {
          affected_purpose: `${lensId} declared purpose`,
          failure_condition: `${lensId} material failure condition`,
          impact: `${lensId} material impact`,
          evidence_refs: [
            `execution-preparation/materialized-input.md:${lensId.length}`,
          ],
        },
        causal_path: {
          root_cause_candidate: `${lensId} root cause candidate`,
          root_cause_step_id: `${lensId}-candidate-001.cause-002`,
          steps: [
            {
              cause_id: `${lensId}-candidate-001.cause-001`,
              claim: `${lensId} surface cause`,
              relation_to_previous: null,
              evidence_refs: [`round1/${lensId}.findings.yaml#surface`],
            },
            {
              cause_id: `${lensId}-candidate-001.cause-002`,
              claim: `${lensId} root cause`,
              relation_to_previous: "causes",
              evidence_refs: [`round1/${lensId}.findings.yaml#root`],
            },
          ],
          unresolved_beyond_evidence: null,
        },
      },
    ],
    domain_constraints_used: [],
    domain_context_assumptions: [],
    validation: {
      unaddressable_candidates: [],
    },
  };
}

describe("lens sidecar finding-ledger projection", () => {
  beforeEach(async () => {
    scratchRoot = await fs.mkdtemp(path.join(os.tmpdir(), "onto-sidecar-ledger-"));
  });

  afterEach(async () => {
    await fs.rm(scratchRoot, { recursive: true, force: true });
  });

  it("maps sidecar candidates into a validated finding-ledger artifact", async () => {
    const round1Root = path.join(
      scratchRoot,
      ".onto",
      "review",
      "session-001",
      "round1",
    );
    const logicPath = lensSidecarArtifactPath({ round1Root, lensId: "logic" });
    const coveragePath = lensSidecarArtifactPath({ round1Root, lensId: "coverage" });
    await writeYamlDocument(logicPath, sidecar("logic"));
    await writeYamlDocument(coveragePath, sidecar("coverage"));

    const ledger = await buildFindingLedgerFromLensSidecars({
      projectRoot: scratchRoot,
      sessionId: "session-001",
      sidecarPaths: [logicPath, coveragePath],
    });

    expect(allLensOutputsAreSidecars([logicPath, coveragePath])).toBe(true);
    expect(ledger.findings).toHaveLength(2);
    expect(ledger.findings[0]).toMatchObject({
      finding_id: "finding-001",
      lens_id: "logic",
      source_ref: ".onto/review/session-001/round1/logic.findings.yaml#logic-candidate-001",
      severity: "medium",
      affected_purpose: "logic declared purpose",
      failure_condition: "logic material failure condition",
      impact: "logic material impact",
      lens_rationale_summary: "logic impact",
    });
    expect(ledger.findings[0]?.causal_path?.root_cause_step_id).toBe(
      "finding-001.cause-002",
    );
    expect(ledger.findings[0]?.causal_path?.steps[0]?.cause_id).toBe(
      "finding-001.cause-001",
    );

    const outputPath = path.join(scratchRoot, ".onto", "review", "session-001", "finding-ledger.yaml");
    await writeFindingLedgerFromLensSidecars({
      projectRoot: scratchRoot,
      sessionId: "session-001",
      sidecarPaths: [logicPath, coveragePath],
      outputPath,
    });
    await expect(fs.stat(outputPath)).resolves.toBeTruthy();
  });

  it("renders an audit packet that names the sidecar inputs", () => {
    const packet = renderRuntimeFindingLedgerPacket({
      projectRoot: scratchRoot,
      sessionId: "session-001",
      outputPath: path.join(scratchRoot, ".onto", "review", "session-001", "finding-ledger.yaml"),
      sidecarPaths: [
        path.join(
          scratchRoot,
          ".onto",
          "review",
          "session-001",
          "round1",
          "logic.findings.yaml",
        ),
      ],
    });

    expect(packet).toContain("Runtime Source Sidecars");
    expect(packet).toContain("logic.findings.yaml");
  });
});
