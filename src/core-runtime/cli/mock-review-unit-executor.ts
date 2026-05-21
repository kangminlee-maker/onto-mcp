#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

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

### Immediate Actions Required
- Replace the mock executor with a real ContextIsolatedReasoningUnit realization.

### Recommendations
- Connect \`/onto:review\` directly to \`review:start-session -> review:run-prompt-execution -> review:complete-session\`.

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
  const outputPath = path.resolve(requireString(values["output-path"], "output-path"));

  const outputText =
    unitKind === "synthesize"
      ? renderSynthesizeOutput(packetPath)
      : unitKind === "deliberation"
        ? renderDeliberationOutput(unitId, packetPath)
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
