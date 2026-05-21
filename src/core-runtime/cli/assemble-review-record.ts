#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import type {
  CoordinatorStateFile,
  InvocationBindingArtifact,
  ReviewExecutionResultArtifact,
  ReviewRecord,
  ReviewRecordStatus,
} from "../review/artifact-types.js";
import {
  fileExists,
  isoFromTimestamp,
  parseMarkdownFrontmatter,
  readYamlDocument,
  toRelativePath,
  writeYamlDocument,
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

/**
 * Read `orchestrator_reported_realization` from coordinator-state.yaml if
 * the orchestrator self-reported via `coordinator next --orchestrator-reported-realization`
 * (see contract §18). Returns a spreadable partial so callers can conditionally
 * include the field in the ReviewRecord object literal without introducing
 * `undefined` values in the emitted YAML.
 */
async function readOrchestratorReportedRealization(
  sessionRoot: string,
): Promise<{ orchestrator_reported_realization?: string }> {
  const coordinatorStatePath = path.join(sessionRoot, "coordinator-state.yaml");
  if (!(await fileExists(coordinatorStatePath))) {
    return {};
  }
  const stateFile = await readYamlDocument<CoordinatorStateFile>(
    coordinatorStatePath,
  );
  const value = stateFile.orchestrator_reported_realization;
  return value ? { orchestrator_reported_realization: value } : {};
}

async function detectDeliberationStatus(
  executionResult: ReviewExecutionResultArtifact,
): Promise<ReviewRecord["deliberation_status"]> {
  if (executionResult.deliberation_status === "performed") {
    return "performed";
  }
  throw new Error(
    `Review execution result must declare deliberation_status=performed for session ${executionResult.session_id}.`,
  );
}

interface ErrorLogSummary {
  degradedLensIds: string[];
  hasExecutionFailure: boolean;
  hasRunnerHalt: boolean;
}

async function summarizeErrorLog(errorLogPath: string): Promise<ErrorLogSummary> {
  if (!(await fileExists(errorLogPath))) {
    return {
      degradedLensIds: [],
      hasExecutionFailure: false,
      hasRunnerHalt: false,
    };
  }

  const errorLogText = await fs.readFile(errorLogPath, "utf8");
  const lensFailureMatches = Array.from(
    errorLogText.matchAll(/\|\s+lens failure:\s+(?:onto_)?([a-z_]+)/g),
  );
  const uniqueLensIds: string[] = [];
  for (const match of lensFailureMatches) {
    const lensId = match[1];
    if (typeof lensId !== "string") {
      continue;
    }
    if (!uniqueLensIds.includes(lensId)) {
      uniqueLensIds.push(lensId);
    }
  }

  return {
    degradedLensIds: uniqueLensIds,
    hasExecutionFailure:
      /\|\s+(?:lens|deliberation|synthesize) failure:\s+/m.test(errorLogText),
    hasRunnerHalt: /\|\s+runner halted before synthesize/m.test(errorLogText),
  };
}

async function deriveRecordStatus(
  executionResult: ReviewExecutionResultArtifact | null,
  errorLogSummary: ErrorLogSummary,
  finalOutputPath: string,
): Promise<ReviewRecordStatus> {
  if (executionResult) {
    return executionResult.execution_status;
  }

  const finalOutputExists = await fileExists(finalOutputPath);
  if (!errorLogSummary.hasExecutionFailure && !errorLogSummary.hasRunnerHalt) {
    return finalOutputExists ? "completed" : "halted_partial";
  }
  if (finalOutputExists) {
    return "completed_with_degradation";
  }
  return "halted_partial";
}

export async function runAssembleReviewRecordCli(
  argv: string[],
): Promise<number> {
  const { values } = parseArgs({
    options: {
      "session-root": { type: "string" },
      "project-root": { type: "string", default: "." },
      "request-text": { type: "string" },
    },
    strict: true,
    allowPositionals: false,
    args: argv,
  });

  const sessionRoot = path.resolve(requireString(values["session-root"], "session-root"));
  const projectRoot = path.resolve(requireString(values["project-root"], "project-root"));
  const requestText = requireString(values["request-text"], "request-text");
  const sessionId = path.basename(sessionRoot);

  const interpretationPath = path.join(sessionRoot, "interpretation.yaml");
  const bindingPath = path.join(sessionRoot, "binding.yaml");
  const sessionMetadataPath = path.join(sessionRoot, "session-metadata.yaml");
  const executionPreparationRoot = path.join(sessionRoot, "execution-preparation");
  const targetSnapshotPath = path.join(executionPreparationRoot, "target-snapshot.md");
  const materializedInputPath = path.join(executionPreparationRoot, "materialized-input.md");
  const contextCandidateAssemblyPath = path.join(
    executionPreparationRoot,
    "context-candidate-assembly.yaml",
  );
  const synthesisPath = path.join(sessionRoot, "synthesis.md");
  const deliberationPath = path.join(sessionRoot, "deliberation.md");
  const finalOutputPath = path.join(sessionRoot, "final-output.md");
  const executionResultPath = path.join(sessionRoot, "execution-result.yaml");
  const errorLogPath = path.join(sessionRoot, "error-log.md");
  const reviewRecordPath = path.join(sessionRoot, "review-record.yaml");
  const round1Root = path.join(sessionRoot, "round1");

  const requiredArtifacts = [
    ["interpretation", interpretationPath],
    ["binding", bindingPath],
    ["session metadata", sessionMetadataPath],
    ["target snapshot", targetSnapshotPath],
    ["materialized input", materializedInputPath],
    ["context candidate assembly", contextCandidateAssemblyPath],
    ["controlled deliberation", deliberationPath],
    ["synthesis", synthesisPath],
    ["final output", finalOutputPath],
    ["execution result", executionResultPath],
  ] as const;
  for (const [label, artifactPath] of requiredArtifacts) {
    if (!(await fileExists(artifactPath))) {
      throw new Error(`Missing ${label} artifact: ${artifactPath}`);
    }
  }

  const invocationBindingArtifact =
    await readYamlDocument<InvocationBindingArtifact>(bindingPath);
  const executionResult = await readYamlDocument<ReviewExecutionResultArtifact>(
    executionResultPath,
  );
  const sessionMetadata = await readYamlDocument<{ created_at?: string }>(
    sessionMetadataPath,
  );

  const lensResultRefs: Record<string, string> = {};
  const participatingLensIds: string[] = executionResult?.participating_lens_ids
    ? [...executionResult.participating_lens_ids]
    : [];
  if (executionResult) {
    for (const unitResult of executionResult.lens_execution_results) {
      if (unitResult.status !== "completed") {
        continue;
      }
      lensResultRefs[unitResult.unit_id] = toRelativePath(
        unitResult.output_path,
        projectRoot,
      );
    }
  } else if (await fileExists(round1Root)) {
    const round1FilePaths = await fs.readdir(round1Root);
    for (const entryName of round1FilePaths.sort()) {
      if (!entryName.endsWith(".md")) {
        continue;
      }
      const lensId = entryName.replace(/\.md$/u, "");
      const lensResultPath = path.join(round1Root, entryName);
      lensResultRefs[lensId] = toRelativePath(lensResultPath, projectRoot);
      participatingLensIds.push(lensId);
    }
  }

  const errorLogSummary = await summarizeErrorLog(errorLogPath);
  const degradedLensIds =
    executionResult?.degraded_lens_ids ?? errorLogSummary.degradedLensIds;
  const excludedLensIds =
    executionResult?.excluded_lens_ids ??
    invocationBindingArtifact.resolved_lens_set.filter(
      (lensId) =>
        !participatingLensIds.includes(lensId) && !degradedLensIds.includes(lensId),
    );
  const updatedAtSource = executionResult
    ? Date.parse(executionResult.execution_completed_at)
    : (await fs.stat(sessionRoot)).mtimeMs;

  const reviewRecord: ReviewRecord = {
    review_record_id: sessionId,
    session_id: sessionId,
    entrypoint: "review",
    record_status: await deriveRecordStatus(
      executionResult,
      errorLogSummary,
      finalOutputPath,
    ),
    created_at:
      sessionMetadata.created_at ?? isoFromTimestamp((await fs.stat(sessionRoot)).mtimeMs),
    updated_at: isoFromTimestamp(updatedAtSource),
    request_text: requestText,
    review_target_scope_ref: toRelativePath(bindingPath, projectRoot),
    interpretation_ref: toRelativePath(interpretationPath, projectRoot),
    binding_ref: toRelativePath(bindingPath, projectRoot),
    domain_final_selection_ref: toRelativePath(bindingPath, projectRoot),
    resolved_review_mode: invocationBindingArtifact.resolved_review_mode,
    resolved_execution_realization:
      invocationBindingArtifact.resolved_execution_realization,
    resolved_host_runtime: invocationBindingArtifact.resolved_host_runtime,
    ...(await readOrchestratorReportedRealization(sessionRoot)),
    resolved_lens_ids: invocationBindingArtifact.resolved_lens_set,
    execution_result_ref: toRelativePath(executionResultPath, projectRoot),
    session_metadata_ref: toRelativePath(sessionMetadataPath, projectRoot),
    target_snapshot_ref: toRelativePath(targetSnapshotPath, projectRoot),
    materialized_input_ref: toRelativePath(materializedInputPath, projectRoot),
    context_candidate_assembly_ref: toRelativePath(
      contextCandidateAssemblyPath,
      projectRoot,
    ),
    lens_result_refs: lensResultRefs,
    participating_lens_ids: participatingLensIds,
    excluded_lens_ids: excludedLensIds,
    degraded_lens_ids: degradedLensIds,
    degradation_notes_ref:
      ((executionResult?.execution_status !== "completed") ||
        errorLogSummary.hasExecutionFailure ||
        errorLogSummary.hasRunnerHalt) &&
      (await fileExists(errorLogPath))
      ? toRelativePath(errorLogPath, projectRoot)
      : null,
    synthesis_result_ref: toRelativePath(synthesisPath, projectRoot),
    deliberation_status: await detectDeliberationStatus(executionResult),
    deliberation_result_ref: toRelativePath(deliberationPath, projectRoot),
    final_output_ref: toRelativePath(finalOutputPath, projectRoot),
  };

  await writeYamlDocument(reviewRecordPath, reviewRecord);
  console.log(reviewRecordPath);
  return 0;
}

async function main(): Promise<number> {
  await printOntoReleaseChannelNotice();
  return runAssembleReviewRecordCli(process.argv.slice(2));
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
