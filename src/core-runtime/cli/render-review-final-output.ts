#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import type {
  CoordinatorStateFile,
  InvocationBindingArtifact,
  ReviewExecutionPlan,
  ReviewExecutionResultArtifact,
  ReviewSessionMetadata,
} from "../review/artifact-types.js";
import {
  fileExists,
  readYamlDocument,
  toRelativePath,
} from "../review/review-artifact-utils.js";
import { printOntoReleaseChannelNotice } from "../release-channel/release-channel.js";

function requireString(
  value: string | boolean | undefined,
  optionName: string,
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required option --${optionName}`);
  }
  return value;
}

function headingLevel(line: string): number | null {
  const match = /^(#{2,6})\s+/.exec(line.trim());
  if (!match) {
    return null;
  }
  return match[1]?.length ?? null;
}

function extractSection(markdownText: string, heading: string): string | null {
  const lines = markdownText.split("\n");
  const acceptedHeadingLines = [`## ${heading}`, `### ${heading}`];
  const startIndex = lines.findIndex((line) =>
    acceptedHeadingLines.includes(line.trim()),
  );
  if (startIndex === -1) {
    return null;
  }

  const startLine = lines[startIndex];
  const startHeadingLevel = typeof startLine === "string"
    ? headingLevel(startLine)
    : null;

  const collected: string[] = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) {
      break;
    }
    const currentHeadingLevel = headingLevel(line);
    if (
      currentHeadingLevel !== null &&
      startHeadingLevel !== null &&
      currentHeadingLevel <= startHeadingLevel
    ) {
      break;
    }
    collected.push(line);
  }

  return collected.join("\n").trim();
}

function sectionOrDefault(markdownText: string, headings: string[], defaultText = "- none"): string {
  for (const heading of headings) {
    const extracted = extractSection(markdownText, heading);
    if (extracted && extracted.length > 0) {
      return extracted;
    }
  }
  return defaultText;
}

function renderLensFindingsRefs(
  executionPlan: ReviewExecutionPlan | null,
  executionResult: ReviewExecutionResultArtifact | null,
  projectRoot: string,
): string {
  const seats = executionPlan?.lens_execution_seats;
  if (!seats || seats.length === 0) {
    return "- lens output references unavailable";
  }
  const degradedSet = new Set(executionResult?.degraded_lens_ids ?? []);
  return seats
    .map((seat) => {
      const relativePath = toRelativePath(seat.output_path, projectRoot);
      const marker = degradedSet.has(seat.lens_id) ? " (degraded)" : "";
      return `- ${seat.lens_id}: \`${relativePath}\`${marker}`;
    })
    .join("\n");
}

function renderTargetSummary(
  bindingArtifact: InvocationBindingArtifact,
  projectRoot: string,
): string {
  return bindingArtifact.resolved_target_scope.resolved_refs
    .map((resolvedRef) => `- \`${toRelativePath(resolvedRef, projectRoot)}\``)
    .join("\n");
}

function renderConsensusHeading(
  participatingLensCount: number,
  plannedLensCount: number,
  reviewMode: string,
): string {
  if (reviewMode === "full") {
    return `### Consensus (${participatingLensCount}/${plannedLensCount})`;
  }
  if (reviewMode === "core-axis") {
    return `### Consensus (${participatingLensCount}/${plannedLensCount}, core-axis mode)`;
  }
  return `### Consensus (${participatingLensCount}/${plannedLensCount}, ${reviewMode} mode)`;
}

export async function runRenderReviewFinalOutputCli(
  argv: string[],
): Promise<number> {
  const { values } = parseArgs({
    options: {
      "project-root": { type: "string", default: "." },
      "session-root": { type: "string" },
    },
    strict: true,
    allowPositionals: false,
    args: argv,
  });

  const projectRoot = path.resolve(requireString(values["project-root"], "project-root"));
  const sessionRoot = path.resolve(requireString(values["session-root"], "session-root"));

  const bindingPath = path.join(sessionRoot, "binding.yaml");
  const sessionMetadataPath = path.join(sessionRoot, "session-metadata.yaml");
  const synthesisPath = path.join(sessionRoot, "synthesis.md");
  const deliberationPath = path.join(sessionRoot, "deliberation.md");
  const finalOutputPath = path.join(sessionRoot, "final-output.md");

  if (!(await fileExists(bindingPath))) {
    throw new Error(`Missing binding artifact: ${bindingPath}`);
  }
  if (!(await fileExists(sessionMetadataPath))) {
    throw new Error(`Missing session metadata artifact: ${sessionMetadataPath}`);
  }

  const bindingArtifact = await readYamlDocument<InvocationBindingArtifact>(bindingPath);
  const sessionMetadata = await readYamlDocument<ReviewSessionMetadata>(sessionMetadataPath);

  // Optional orchestrator self-report from coordinator-state.yaml (contract §18).
  // Absent when the session used self-path execution or when the orchestrator
  // did not pass `--orchestrator-reported-realization`.
  const coordinatorStatePath = path.join(sessionRoot, "coordinator-state.yaml");
  let orchestratorReportedRealization: string | undefined;
  if (await fileExists(coordinatorStatePath)) {
    try {
      const coordinatorState = await readYamlDocument<CoordinatorStateFile>(
        coordinatorStatePath,
      );
      orchestratorReportedRealization =
        coordinatorState.orchestrator_reported_realization;
    } catch {
      // Ignore — optional field
    }
  }
  const executionResultPath =
    bindingArtifact.execution_result_path ??
    path.join(sessionRoot, "execution-result.yaml");
  const executionResult = (await fileExists(executionResultPath))
    ? await readYamlDocument<ReviewExecutionResultArtifact>(executionResultPath)
    : null;
  const executionPlanPath = path.join(sessionRoot, "execution-plan.yaml");
  const executionPlan = (await fileExists(executionPlanPath))
    ? await readYamlDocument<ReviewExecutionPlan>(executionPlanPath)
    : null;
  const synthesisExecuted = executionResult?.synthesis_executed === true;
  if (synthesisExecuted && !(await fileExists(deliberationPath))) {
    throw new Error(`Missing controlled deliberation artifact: ${deliberationPath}`);
  }
  if (synthesisExecuted && !(await fileExists(synthesisPath))) {
    throw new Error(`Missing synthesize result artifact: ${synthesisPath}`);
  }
  const sourcePath = synthesisPath;
  const sourceText = synthesisExecuted ? await fs.readFile(sourcePath, "utf8") : "";
  const sessionDate = (sessionMetadata.created_at ?? "").slice(0, 10);
  const participatingLensCount =
    executionResult?.participating_lens_ids.length ??
    bindingArtifact.resolved_lens_set.length;
  const plannedLensCount =
    executionResult?.planned_lens_ids.length ?? bindingArtifact.resolved_lens_set.length;
  const degradedLensIds = executionResult?.degraded_lens_ids ?? [];
  const haltReason = executionResult?.halt_reason ?? null;
  const executionStatus = executionResult?.execution_status ?? "completed";

  const consensus = sectionOrDefault(sourceText, [
    "Consensus",
    "Consensus Items",
    "Preserved Cross-Lens Consensus",
  ]);
  const conditionalConsensus = sectionOrDefault(sourceText, [
    "Conditional Consensus",
    "Unresolved Or Conditional Points",
  ]);
  const disagreement = sectionOrDefault(sourceText, [
    "Disagreement",
    "Contradicting Opinions",
  ]);
  const axiologyPerspectives = sectionOrDefault(
    sourceText,
    [
      "Axiology-Proposed Additional Perspectives",
      "Preserved New Perspective",
    ],
  );
  const purposeAlignment = sectionOrDefault(
    sourceText,
    ["Purpose Alignment Verification", "Synthesis Verdict"],
  );
  const immediateActions = sectionOrDefault(sourceText, [
    "Immediate Actions Required",
    "Immediate Actions",
  ]);
  const recommendations = sectionOrDefault(sourceText, [
    "Recommendations",
    "Synthesis Conclusion",
  ]);
  const uniqueFindingTagging = sectionOrDefault(sourceText, [
    "Unique Finding Tagging",
    "Preserved Specific Issues",
  ]);
  const degradationSummary =
    degradedLensIds.length > 0
      ? degradedLensIds.map((lensId) => `- degraded lens: ${lensId}`).join("\n")
      : "- none";
  const defaultConditionalConsensus =
    executionStatus === "completed"
      ? "- none"
      : [
          degradedLensIds.length > 0
            ? `- degraded lens count: ${degradedLensIds.length}`
            : null,
          haltReason ? `- halt reason: ${haltReason}` : null,
        ]
          .filter((line): line is string => line !== null)
          .join("\n") || "- none";
  const defaultPurposeAlignment =
    executionStatus === "completed"
      ? "- bounded review execution completed"
      : `- execution status: ${executionStatus}`;

  const finalOutputText = `---
session_id: ${bindingArtifact.session_id}
process: review
target: "${bindingArtifact.resolved_target_scope.resolved_refs
  .map((resolvedRef) => toRelativePath(resolvedRef, projectRoot))
  .join(" + ")}"
domain: ${bindingArtifact.resolved_session_domain}
date: ${sessionDate || "unknown"}
---

## 9-Lens Review Result

### Review Target
${renderTargetSummary(bindingArtifact, projectRoot)}

### Verification Context
- Domain: ${bindingArtifact.resolved_session_domain}
- Review mode: ${bindingArtifact.resolved_review_mode}
- Execution realization: ${bindingArtifact.resolved_execution_realization}${orchestratorReportedRealization ? ` (orchestrator reported: ${orchestratorReportedRealization})` : ""}
- Host runtime: ${bindingArtifact.resolved_host_runtime}
- Finding ledger: \`${toRelativePath(bindingArtifact.finding_ledger_path, projectRoot)}\`
- Issue ledger: \`${toRelativePath(bindingArtifact.issue_ledger_path, projectRoot)}\`
- Problem framing: \`${toRelativePath(bindingArtifact.problem_framing_path, projectRoot)}\`
- Controlled deliberation: ${synthesisExecuted ? `\`${toRelativePath(deliberationPath, projectRoot)}\`` : "not performed"}
- Source artifact: ${synthesisExecuted ? `\`${toRelativePath(sourcePath, projectRoot)}\`` : "not produced"}
- Execution status: ${executionStatus}

${renderConsensusHeading(
    participatingLensCount,
    plannedLensCount,
    bindingArtifact.resolved_review_mode,
  )}
${sourceText.length > 0 ? consensus : "- synthesize output unavailable"}

### Conditional Consensus
${sourceText.length > 0 ? conditionalConsensus : defaultConditionalConsensus}

### Disagreement
${sourceText.length > 0 ? disagreement : degradationSummary}

### Axiology-Proposed Additional Perspectives
${sourceText.length > 0 ? axiologyPerspectives : "- unavailable"}

### Purpose Alignment Verification
${sourceText.length > 0 ? purposeAlignment : defaultPurposeAlignment}

### Immediate Actions Required
${sourceText.length > 0 ? immediateActions : degradationSummary}

### Recommendations
${sourceText.length > 0 ? recommendations : "- inspect execution-result.yaml and error-log.md"}

### Unique Finding Tagging
${sourceText.length > 0 ? uniqueFindingTagging : degradationSummary}

### Individual Lens Findings
${renderLensFindingsRefs(executionPlan, executionResult, projectRoot)}
`;

  await fs.writeFile(finalOutputPath, finalOutputText.trimEnd() + "\n", "utf8");
  console.log(finalOutputPath);
  return 0;
}

async function main(): Promise<number> {
  await printOntoReleaseChannelNotice();
  return runRenderReviewFinalOutputCli(process.argv.slice(2));
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
