#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import type { ReviewExecutionPlan } from "../review/artifact-types.js";
import { readYamlDocument } from "../review/review-artifact-utils.js";

function requireString(
  value: string | boolean | undefined,
  optionName: string,
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required option --${optionName}`);
  }
  return value;
}

function renderLensOutput(unitId: string, packetPath: string): string {
  return `# ${unitId} Review Result

### Structural Inspection
- Placeholder structural inspection executed from \`${packetPath}\`.

### Finding
- \`${unitId}\` lens executed through deterministic prompt dispatch.

### Why
- The prompt packet was delivered through the bounded execution path.

### How To Fix
- none

### Newly Learned
- none

### Applied Learnings
- prompt packet: \`${packetPath}\`

### Domain Constraints Used
[]

### Domain Context Assumptions
[]
`;
}

function renderSynthesizeOutput(packetPath: string): string {
  return `---
deliberation_status: performed
---

# synthesize Result

### Consensus
- The bounded runner dispatched lens prompt packets and controlled lens deliberation before synthesize.

### Conditional Consensus
- A real host-side executor still needs to replace the mock executor.

### Disagreement
- none

### Deliberation Decision
- Controlled lens deliberation completed before synthesize.

### Axiology-Proposed Additional Perspectives
- Preserve repo-local canonical execution truth over host-specific drift.

### Purpose Alignment Verification
- The session followed the productized bounded path.

### Final Review Result
- The review completed the bounded path with isolated lens outputs, controlled deliberation, and issue framing preserved. The mock result indicates no unresolved disagreement and one low-severity issue that can be handled as watch/defer work rather than a current blocker.

### Immediate Actions Required
- Replace the mock executor with a real ContextIsolatedReasoningUnit realization.

### Recommendations
- Keep MCP review connected to \`review:start-session -> review:run-prompt-execution -> review:complete-session\`.

### Unique Finding Tagging
- mock-runner-generated

### Applied Learnings
- prompt packet: \`${packetPath}\`
`;
}

function renderDeliberationOutput(unitId: string, packetPath: string): string {
  if (unitId === "controlled-deliberation") {
    return `---
deliberation_status: performed
---

# Controlled Lens Deliberation Result

## Consensus
- Mock controlled deliberation completed from \`${packetPath}\`.

## Conditional Consensus
- none

## Disagreement
- none

## Deliberation Decision
- No contested mock points required resolution.

## Axiology-Proposed Additional Perspectives
- none

## Purpose Alignment Verification
- The required deliberation stage ran before synthesize.

## Immediate Actions Required
- none

## Recommendations
- none

## Unique Finding Tagging
- mock-controlled-deliberation
`;
  }

  return `# ${unitId} Response

## Re-evaluation Summary
- Mock lens deliberation response executed from \`${packetPath}\`.

## Accepted From Other Lenses
- none

## Contested Points
- none

## Position Changes
- none

## Final Lens Position
- unchanged
`;
}

function renderIssueArtifactOutput(
  unitId: string,
  sessionId: string,
  participatingLensIds: string[],
): string {
  if (process.env.ONTO_REVIEW_MOCK_MALFORMED_ISSUE_ARTIFACT === unitId) {
    return "schema_version: [\n";
  }
  const primaryLensId = participatingLensIds[0] ?? "logic";
  switch (unitId) {
    case "finding-ledger":
      return `schema_version: 1
session_id: ${sessionId}
findings:
  - finding_id: finding-001
    lens_id: ${primaryLensId}
    source_ref: round1/${primaryLensId}.md#finding-1
    target: mock-target
    evidence_anchor: mock-anchor
    claim: mock finding
    proposed_action: none
    severity: low
validation:
  unaddressable_findings: []
`;
    case "finding-relation-graph":
      return `schema_version: 1
session_id: ${sessionId}
relations: []
singleton_findings:
  - finding_id: finding-001
    reason: mock singleton
`;
    case "issue-ledger":
      return `schema_version: 1
session_id: ${sessionId}
issues:
  - issue_id: issue-001
    root_cause_hypothesis: mock root
    root_confidence: low
    surface_finding_ids: [finding-001]
    relation_refs: []
    raised_by_lens_ids: [${primaryLensId}]
    issue_statement: mock issue
    proposed_action: none
    severity: low
    singleton_reason: mock singleton
validation:
  unclustered_finding_ids: []
`;
    case "issue-stance-matrix":
      return `schema_version: 1
session_id: ${sessionId}
issues:
  - issue_id: issue-001
    stances:
${participatingLensIds
  .map(
    (lensId) => `      - lens_id: ${lensId}
        stance: support
        rationale: mock stance
        root_hypothesis_position: accepts
        severity_position: keeps
        evidence_refs: [round1/${lensId}.md]`,
  )
  .join("\n")}
validation:
  missing_stances: []
`;
    case "deliberation-plan":
      return `schema_version: 1
session_id: ${sessionId}
planned_issues: []
skipped_issues:
  - issue_id: issue-001
    reason: no material conflict
`;
    case "problem-framing":
      return `schema_version: 1
session_id: ${sessionId}
classification_context:
  common_spine_version: 1
  session_domain: none
  domain_profile_ref: ""
  domain_profile_doc_type: custom:problem_framing_profile
  domain_profile_status: not_requested
classifications:
  - issue_id: issue-001
    problem_definition: mock problem
    issue_role: independent_issue
    judgment_state: observed
    impact_kind: maintainability_evolvability
    timing_class: defer_watch
    closure_class: watch
    domain_axes: {}
    rationale: mock rationale
    related_surface_finding_ids: [finding-001]
`;
    default:
      throw new Error(`Unsupported mock issue artifact unit: ${unitId}`);
  }
}

export async function runMockReviewUnitExecutorCli(
  argv: string[],
): Promise<number> {
  const { values } = parseArgs({
    options: {
      "project-root": { type: "string" },
      "session-root": { type: "string" },
      "unit-id": { type: "string" },
      "unit-kind": { type: "string" },
      "packet-path": { type: "string" },
      "output-path": { type: "string" },
    },
    strict: true,
    allowPositionals: false,
    args: argv,
  });

  const unitId = requireString(values["unit-id"], "unit-id");
  const unitKind = requireString(values["unit-kind"], "unit-kind");
  const packetPath = requireString(values["packet-path"], "packet-path");
  const sessionRoot = path.resolve(requireString(values["session-root"], "session-root"));
  const outputPath = path.resolve(requireString(values["output-path"], "output-path"));
  const sessionId = path.basename(sessionRoot);
  const executionPlan =
    unitKind === "issue_artifact"
      ? await readYamlDocument<ReviewExecutionPlan>(
          path.join(sessionRoot, "execution-plan.yaml"),
        )
      : null;
  const participatingLensIds =
    executionPlan?.lens_prompt_packet_seats.map((seat) => seat.lens_id) ?? [];

  const outputText =
    unitKind === "synthesize"
      ? renderSynthesizeOutput(packetPath)
      : unitKind === "deliberation"
        ? renderDeliberationOutput(unitId, packetPath)
      : unitKind === "issue_artifact"
        ? renderIssueArtifactOutput(unitId, sessionId, participatingLensIds)
      : renderLensOutput(unitId, packetPath);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, outputText.trimEnd() + "\n", "utf8");

  console.log(
    JSON.stringify(
      {
        unit_id: unitId,
        unit_kind: unitKind,
        output_path: outputPath,
      },
      null,
      2,
    ),
  );
  return 0;
}

async function main(): Promise<number> {
  return runMockReviewUnitExecutorCli(process.argv.slice(2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (exitCode) => process.exit(exitCode),
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    },
  );
}
