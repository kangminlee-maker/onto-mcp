#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import YAML from "yaml";
import type {
  CoordinatorStateFile,
  InvocationBindingArtifact,
  ReviewLensDomainConstraint,
  ReviewLensProvenance,
  ReviewExecutionResultArtifact,
  ReviewRecord,
  ReviewRecordStatus,
  SharedPhenomenonClaimRelation,
  SharedPhenomenonSummaryEntry,
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

const LENS_OUTPUT_SCHEMA_VERSION = 2;

const SHARED_PHENOMENON_RELATIONS = new Set<SharedPhenomenonClaimRelation>([
  "corroboration",
  "disagreement",
  "partial overlap",
  "dedup",
]);

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
  if (executionResult.execution_status === "halted_partial") {
    return "not_performed";
  }
  throw new Error(
    `Review execution result must declare deliberation_status=performed for session ${executionResult.session_id}.`,
  );
}

async function assertSynthesisDeliberationPerformed(
  synthesisPath: string,
): Promise<void> {
  const synthesisText = await fs.readFile(synthesisPath, "utf8");
  const parsed = parseMarkdownFrontmatter<{ deliberation_status?: string }>(
    synthesisText,
  );
  if (parsed.metadata?.deliberation_status !== "performed") {
    throw new Error(
      `synthesis.md must declare frontmatter deliberation_status: performed: ${synthesisPath}`,
    );
  }
}

function normalizeHeadingTitle(title: string): string {
  return title
    .replace(/[`*_]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function extractMarkdownSection(
  markdownText: string,
  acceptedTitles: string[],
): string | null {
  const accepted = new Set(acceptedTitles.map(normalizeHeadingTitle));
  const body = parseMarkdownFrontmatter<unknown>(markdownText).body;
  const lines = body.split(/\r?\n/u);
  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/u.exec(lines[index] ?? "");
    if (!match?.[2]) continue;
    if (accepted.has(normalizeHeadingTitle(match[2]))) {
      start = index + 1;
      break;
    }
  }
  if (start < 0) return null;
  let end = lines.length;
  for (let index = start; index < lines.length; index += 1) {
    if (/^#{1,6}\s+/u.test(lines[index] ?? "")) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n").trim();
}

function extractYamlFence(sectionText: string): string {
  const trimmed = sectionText.trim();
  const match = /```(?:ya?ml)?\s*\n([\s\S]*?)\n```/iu.exec(trimmed);
  return (match?.[1] ?? trimmed).trim();
}

function parseYamlList(sectionText: string, label: string): unknown[] {
  const source = extractYamlFence(sectionText);
  let parsed: unknown;
  try {
    parsed = YAML.parse(source);
  } catch (error: unknown) {
    throw new Error(
      `Invalid YAML list in ${label}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected YAML list in ${label}.`);
  }
  return parsed;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected object item in ${label}.`);
  }
  return value as Record<string, unknown>;
}

function requireNonEmptyString(
  value: unknown,
  label: string,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Expected non-empty string for ${label}.`);
  }
  return value.trim();
}

function parseDomainConstraints(
  sectionText: string,
  lensId: string,
): ReviewLensDomainConstraint[] {
  return parseYamlList(sectionText, `${lensId} Domain Constraints Used`).map(
    (item, index) => {
      const record = requireRecord(
        item,
        `${lensId} Domain Constraints Used[${index}]`,
      );
      return {
        source_doc: requireNonEmptyString(
          record.source_doc,
          `${lensId}.domain_constraints_used[${index}].source_doc`,
        ),
        source_version_or_snapshot_id: requireNonEmptyString(
          record.source_version_or_snapshot_id,
          `${lensId}.domain_constraints_used[${index}].source_version_or_snapshot_id`,
        ),
        anchor: requireNonEmptyString(
          record.anchor,
          `${lensId}.domain_constraints_used[${index}].anchor`,
        ),
      };
    },
  );
}

function parseStringList(
  sectionText: string,
  label: string,
): string[] {
  return parseYamlList(sectionText, label).map((item, index) =>
    requireNonEmptyString(item, `${label}[${index}]`),
  );
}

async function deriveLensProvenance(
  lensResultPathsById: Record<string, string>,
  participatingLensIds: string[],
): Promise<Record<string, ReviewLensProvenance>> {
  const perLensProvenance: Record<string, ReviewLensProvenance> = {};
  for (const lensId of participatingLensIds) {
    const lensResultPath = lensResultPathsById[lensId];
    if (!lensResultPath) {
      throw new Error(`Missing lens result path for participating lens: ${lensId}`);
    }
    const lensText = await fs.readFile(lensResultPath, "utf8");
    const constraintsSection = extractMarkdownSection(lensText, [
      "Domain Constraints Used",
    ]);
    const assumptionsSection = extractMarkdownSection(lensText, [
      "Domain Context Assumptions",
    ]);
    if (constraintsSection === null) {
      throw new Error(
        `Lens output schema v${LENS_OUTPUT_SCHEMA_VERSION} requires "Domain Constraints Used": ${lensResultPath}`,
      );
    }
    if (assumptionsSection === null) {
      throw new Error(
        `Lens output schema v${LENS_OUTPUT_SCHEMA_VERSION} requires "Domain Context Assumptions": ${lensResultPath}`,
      );
    }
    perLensProvenance[lensId] = {
      domain_constraints_used: parseDomainConstraints(constraintsSection, lensId),
      domain_context_assumptions: parseStringList(
        assumptionsSection,
        `${lensId} Domain Context Assumptions`,
      ),
    };
  }
  return perLensProvenance;
}

function parseSharedPhenomenonSummaryItem(
  item: unknown,
  index: number,
): SharedPhenomenonSummaryEntry {
  const record = requireRecord(item, `shared_phenomenon_summary[${index}]`);
  const claimRelation = requireNonEmptyString(
    record.claim_relation,
    `shared_phenomenon_summary[${index}].claim_relation`,
  );
  if (!SHARED_PHENOMENON_RELATIONS.has(claimRelation as SharedPhenomenonClaimRelation)) {
    throw new Error(
      `Invalid shared_phenomenon_summary[${index}].claim_relation: ${claimRelation}`,
    );
  }
  const participatingLensIds = record.participating_lens_ids;
  if (
    !Array.isArray(participatingLensIds) ||
    participatingLensIds.length < 2
  ) {
    throw new Error(
      `shared_phenomenon_summary[${index}].participating_lens_ids must list at least two lenses.`,
    );
  }
  return {
    target: requireNonEmptyString(
      record.target,
      `shared_phenomenon_summary[${index}].target`,
    ),
    evidence_anchor: requireNonEmptyString(
      record.evidence_anchor,
      `shared_phenomenon_summary[${index}].evidence_anchor`,
    ),
    participating_lens_ids: participatingLensIds.map((lensId, lensIndex) =>
      requireNonEmptyString(
        lensId,
        `shared_phenomenon_summary[${index}].participating_lens_ids[${lensIndex}]`,
      ),
    ),
    claim_relation: claimRelation as SharedPhenomenonClaimRelation,
  };
}

async function deriveSharedPhenomenonSummary(
  synthesisPath: string,
): Promise<SharedPhenomenonSummaryEntry[]> {
  const synthesisText = await fs.readFile(synthesisPath, "utf8");
  const section = extractMarkdownSection(synthesisText, [
    "Shared Phenomenon Summary",
    "Shared Phenomenon Classification",
    "Shared Phenomena",
  ]);
  if (section === null) return [];
  return parseYamlList(section, "synthesis Shared Phenomenon Summary").map(
    parseSharedPhenomenonSummaryItem,
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
  const reviewTargetProfilePath = path.join(
    executionPreparationRoot,
    "review-target-profile.yaml",
  );
  const contextCandidateAssemblyPath = path.join(
    executionPreparationRoot,
    "context-candidate-assembly.yaml",
  );
  const synthesisPath = path.join(sessionRoot, "synthesis.md");
  const findingLedgerPath = path.join(sessionRoot, "finding-ledger.yaml");
  const findingRelationGraphPath = path.join(sessionRoot, "finding-relation-graph.yaml");
  const issueLedgerPath = path.join(sessionRoot, "issue-ledger.yaml");
  const issueStanceMatrixPath = path.join(sessionRoot, "issue-stance-matrix.yaml");
  const deliberationPlanPath = path.join(sessionRoot, "deliberation-plan.yaml");
  const problemFramingPath = path.join(sessionRoot, "problem-framing.yaml");
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
    ["review target profile", reviewTargetProfilePath],
    ["context candidate assembly", contextCandidateAssemblyPath],
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
  const synthesisExecuted = executionResult.synthesis_executed === true;
  if (synthesisExecuted) {
    const requiredCompletedArtifacts = [
      ["finding ledger", findingLedgerPath],
      ["finding relation graph", findingRelationGraphPath],
      ["issue ledger", issueLedgerPath],
      ["issue stance matrix", issueStanceMatrixPath],
      ["deliberation plan", deliberationPlanPath],
      ["problem framing", problemFramingPath],
      ["controlled deliberation", deliberationPath],
      ["synthesis", synthesisPath],
    ] as const;
    for (const [label, artifactPath] of requiredCompletedArtifacts) {
      if (!(await fileExists(artifactPath))) {
        throw new Error(`Missing ${label} artifact: ${artifactPath}`);
      }
    }
  }
  const sessionMetadata = await readYamlDocument<{ created_at?: string }>(
    sessionMetadataPath,
  );

  const lensResultRefs: Record<string, string> = {};
  const lensResultPathsById: Record<string, string> = {};
  const participatingLensIds: string[] = executionResult?.participating_lens_ids
    ? [...executionResult.participating_lens_ids]
    : [];
  if (executionResult) {
    for (const unitResult of executionResult.lens_execution_results) {
      if (unitResult.status !== "completed") {
        continue;
      }
      const lensResultPath = path.isAbsolute(unitResult.output_path)
        ? unitResult.output_path
        : path.join(projectRoot, unitResult.output_path);
      lensResultRefs[unitResult.unit_id] = toRelativePath(
        lensResultPath,
        projectRoot,
      );
      lensResultPathsById[unitResult.unit_id] = lensResultPath;
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
      lensResultPathsById[lensId] = lensResultPath;
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
  if (synthesisExecuted) {
    await assertSynthesisDeliberationPerformed(synthesisPath);
  }
  const perLensProvenance = await deriveLensProvenance(
    lensResultPathsById,
    participatingLensIds,
  );
  const sharedPhenomenonSummary = synthesisExecuted
    ? await deriveSharedPhenomenonSummary(synthesisPath)
    : [];
  const problemFraming = synthesisExecuted
    ? await readYamlDocument<Record<string, unknown>>(problemFramingPath)
    : null;
  if (
    synthesisExecuted &&
    !Array.isArray(problemFraming?.classifications)
  ) {
    throw new Error(
      `problem-framing.yaml must contain classifications list: ${problemFramingPath}`,
    );
  }

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
    review_target_profile_ref: toRelativePath(
      reviewTargetProfilePath,
      projectRoot,
    ),
    context_candidate_assembly_ref: toRelativePath(
      contextCandidateAssemblyPath,
      projectRoot,
    ),
    lens_result_refs: lensResultRefs,
    lens_output_schema_version: LENS_OUTPUT_SCHEMA_VERSION,
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
    per_lens_provenance: perLensProvenance,
    ...(synthesisExecuted
      ? {
          finding_ledger_ref: toRelativePath(findingLedgerPath, projectRoot),
          finding_relation_graph_ref: toRelativePath(
            findingRelationGraphPath,
            projectRoot,
          ),
          issue_ledger_ref: toRelativePath(issueLedgerPath, projectRoot),
          issue_stance_matrix_ref: toRelativePath(issueStanceMatrixPath, projectRoot),
          deliberation_plan_ref: toRelativePath(deliberationPlanPath, projectRoot),
          problem_framing_ref: toRelativePath(problemFramingPath, projectRoot),
          issue_resolution_summary: problemFraming?.classifications as unknown[],
        }
      : {}),
    synthesis_result_ref: toRelativePath(synthesisPath, projectRoot),
    deliberation_status: await detectDeliberationStatus(executionResult),
    deliberation_result_ref: toRelativePath(deliberationPath, projectRoot),
    final_output_ref: toRelativePath(finalOutputPath, projectRoot),
    shared_phenomenon_summary: sharedPhenomenonSummary,
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
