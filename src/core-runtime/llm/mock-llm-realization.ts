import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import {
  parseRuntimeIssueDeliberationSchemaContext,
  parseRuntimeIssueStanceSchemaContext,
  parseRuntimeIssueSynthesisSchemaContext,
  parseRuntimeProblemFramingContext,
} from "../cli/runtime-submit-context.js";
import { packetHasResubmitErrorSpec } from "../cli/stance-resubmit.js";
import type {
  OntoTool,
  ToolBoundarySkipSummary,
  ToolExecutionContext,
} from "../cli/onto-tools.js";
import { parseParticipatingLensPaths } from "../review/participating-lens-paths.js";
import type { LlmCallConfig, LlmCallResult } from "./llm-caller.js";
import type { ToolLoopConfig, ToolLoopResult } from "./llm-tool-loop.js";

export const REVIEW_MOCK_REALIZATION_ENV = "ONTO_LLM_MOCK";

export function isReviewMockLlmRealizationEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env[REVIEW_MOCK_REALIZATION_ENV] === "1";
}

function parseSystemPromptField(systemPrompt: string, field: string): string | null {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = systemPrompt.match(new RegExp(`^${escaped}:\\s*(.+?)\\s*$`, "m"));
  return match?.[1] ?? null;
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function modelIdFromConfig(
  config?: Partial<LlmCallConfig> | ToolLoopConfig,
): string {
  if (!config) return "mock-model";
  if ("model_id" in config && config.model_id) return config.model_id;
  if ("plan" in config && config.plan?.model_id) return config.plan.model_id;
  if ("models_per_provider" in config) {
    return (
      config.models_per_provider?.openai ??
      config.models_per_provider?.anthropic ??
      config.models_per_provider?.grok ??
      config.models_per_provider?.lmstudio ??
      config.models_per_provider?.codex ??
      "mock-model"
    );
  }
  return "mock-model";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function applyMockRuntimeHooks(): Promise<void> {
  const delayMs = Number.parseInt(process.env.ONTO_REVIEW_MOCK_UNIT_DELAY_MS ?? "", 10);
  if (Number.isFinite(delayMs) && delayMs > 0) {
    await delay(delayMs);
  }
  const warning = process.env.ONTO_REVIEW_MOCK_ENV_WARNING?.trim();
  if (warning) {
    process.stderr.write(`${warning}\n`);
  }
}

function renderYamlStringList(values: string[]): string {
  if (values.length === 0) return "[]";
  return `\n${values.map((value) => `  - ${JSON.stringify(value)}`).join("\n")}`;
}

function renderMissingOrFailedLensList(values: string[]): string {
  if (values.length === 0) return "[]";
  return `\n${values
    .map(
      (value) =>
        `  - lens_id: ${JSON.stringify(value)}\n    reason: "missing"`,
    )
    .join("\n")}`;
}

function synthesizeRunStatus(args: {
  expectedLensIds: string[];
  receivedLensIds: string[];
}): "full" | "degraded" | "insufficient" {
  if (
    args.expectedLensIds.length > 0 &&
    args.receivedLensIds.length === args.expectedLensIds.length
  ) {
    return "full";
  }
  if (
    args.receivedLensIds.length === 0 ||
    (args.receivedLensIds.length === 1 && args.receivedLensIds[0] === "axiology")
  ) {
    return "insufficient";
  }
  return "degraded";
}

function expectedLensIdsFromPrompt(packetText: string): string[] {
  const ids = new Set<string>();
  const lensListMatch = packetText.match(/expected_lenses:\s*\n((?:\s+-\s+\S+.*\n?)+)/);
  if (lensListMatch?.[1]) {
    for (const line of lensListMatch[1].split("\n")) {
      const match = line.match(/^\s+-\s+["']?([A-Za-z][A-Za-z0-9_-]*)["']?/);
      if (match?.[1]) ids.add(match[1]);
    }
  }
  for (const entry of parseParticipatingLensPaths(packetText)) {
    ids.add(entry.lensId);
  }
  const degradedSection = packetText.match(
    /^## Degraded Lens Failures\s*\n([\s\S]*?)(?:\n## |\n# |\s*$)/m,
  );
  if (degradedSection?.[1]) {
    for (const line of degradedSection[1].split("\n")) {
      const match = line.match(/^\s*[-*]\s*([A-Za-z][A-Za-z0-9_-]*)\s*:/);
      if (match?.[1]) ids.add(match[1]);
    }
  }
  return [...ids];
}

function renderLensOutput(unitId: string): string {
  return `# ${unitId} Review Result

### Structural Inspection
- Mock realization inspected the bounded prompt packet.

### Finding
- \`${unitId}\` lens completed through the explicit test realization path.

### Why
- The prompt packet was delivered through the bounded execution path.

### How To Fix
- none

### Domain Constraints Used
[]

### Domain Context Assumptions
[]
`;
}

function renderDeliberationOutput(unitId: string): string {
  if (unitId === "controlled-deliberation") {
    return `---
deliberation_status: performed
---

# Controlled Lens Deliberation Result

## Consensus
- Mock realization found no contested points requiring resolution.

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
- mock-realization-controlled-deliberation
`;
  }

  return `# ${unitId} Response

## Re-evaluation Summary
- Mock realization executed the lens deliberation response.

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

function renderSynthesizeOutput(packetText: string): string {
  const receivedLensIds = parseParticipatingLensPaths(packetText).map(
    (entry) => entry.lensId,
  );
  const expectedLensIds = expectedLensIdsFromPrompt(packetText);
  const missingLensIds = expectedLensIds.filter(
    (lensId) => !receivedLensIds.includes(lensId),
  );
  const runStatus = synthesizeRunStatus({ expectedLensIds, receivedLensIds });
  const fabricated =
    process.env.ONTO_LLM_MOCK_SYNTHESIZE_FABRICATE === "1"
      ? '\n- According to logic: "A fabricated quote that is definitely nowhere in the lens pool for this mock test run"\n'
      : "";

  return `---
deliberation_status: performed
participation:
  expected_lenses: ${renderYamlStringList(expectedLensIds)}
  received_lenses: ${renderYamlStringList(receivedLensIds)}
  missing_or_failed_lenses: ${renderMissingOrFailedLensList(missingLensIds)}
  run_status: ${runStatus}
---

# synthesize Result

### Consensus
- The bounded runner dispatched lens prompt packets and controlled lens deliberation before synthesize.
${fabricated}
### Conditional Consensus
- A real semantic executor is still required for product-quality evidence.

### Disagreement
- none

### Deliberation Decision
- Controlled lens deliberation completed before synthesize.

### Axiology-Proposed Additional Perspectives
- Preserve repo-local canonical execution truth over host-specific drift.

### Purpose Alignment Verification
- The session followed the productized bounded path.

### Final Review Result
- The review completed the bounded path with isolated lens outputs, controlled deliberation, and issue framing preserved. The mock realization indicates no unresolved disagreement and one low-severity issue that can be handled as watch/defer work rather than a current blocker.

### Boundary Notes
- No non-material evidence gaps were produced by the mock realization.

### Immediate Actions Required
- Replace this mock-backed check with live LLM execution for product completion evidence.

### Recommendations
- Keep MCP review connected to the start-session -> prompt-execution -> completion runtime.

### Unique Finding Tagging
- mock-realization-generated
`;
}

export async function callReviewMockLlm(
  systemPrompt: string,
  userPrompt: string,
  config?: Partial<LlmCallConfig>,
): Promise<LlmCallResult> {
  await applyMockRuntimeHooks();
  const unitId = parseSystemPromptField(systemPrompt, "Unit id") ?? "mock-unit";
  const unitKind = parseSystemPromptField(systemPrompt, "Unit kind") ?? "lens";
  let text =
    unitKind === "synthesize"
      ? renderSynthesizeOutput(userPrompt)
      : unitKind === "deliberation"
        ? renderDeliberationOutput(unitId)
        : renderLensOutput(unitId);
  if (process.env.ONTO_LLM_MOCK_SYNTHESIZE_WRAP_FENCE === "1") {
    text = `\`\`\`yaml\n${text.trimEnd()}\n\`\`\``;
  }
  return {
    text,
    input_tokens: estimateTokens(`${systemPrompt}\n${userPrompt}`),
    output_tokens: estimateTokens(text),
    model_id: modelIdFromConfig(config),
    artifact_generation_realization: "semantic_mock" as const,
    declared_billing_mode: "local",
  };
}

function recordMockBoundarySkip(toolCtx: ToolExecutionContext): ToolBoundarySkipSummary | undefined {
  if (process.env.ONTO_LLM_MOCK_TOOL_LOOP_BOUNDARY_SKIP !== "1") {
    return undefined;
  }
  const skips = toolCtx.toolDiagnostics?.search_skips;
  if (!skips) return undefined;
  skips.boundary_skips += 1;
  return {
    boundary_skips: skips.boundary_skips,
    unreadable_skips: skips.unreadable_skips,
    oversized_skips: skips.oversized_skips,
  };
}

function primaryLensIdFromPrompt(packetText: string): string {
  const sidecarRef = packetText.match(/round1\/([A-Za-z][A-Za-z0-9_-]*)\.findings\.yaml/);
  if (sidecarRef?.[1]) return sidecarRef[1];
  const markdownRef = packetText.match(/round1\/([A-Za-z][A-Za-z0-9_-]*)\.md/);
  return markdownRef?.[1] ?? "logic";
}

function priorArtifactRef(packetText: string, artifactId: string): string | null {
  const escaped = artifactId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = packetText.match(new RegExp(`^- ${escaped}:\\s*(.+?)\\s*$`, "m"));
  return match?.[1]?.trim() ?? null;
}

function readPriorArtifact(args: {
  packetText: string;
  artifactId: string;
  toolCtx: ToolExecutionContext;
}): Record<string, unknown> | null {
  const ref = priorArtifactRef(args.packetText, args.artifactId);
  if (!ref) return null;
  const artifactPath = path.isAbsolute(ref)
    ? ref
    : path.resolve(args.toolCtx.projectRoot, ref);
  try {
    const parsed = YAML.parse(fs.readFileSync(artifactPath, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function stringArrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function firstFindingFact(args: {
  packetText: string;
  toolCtx: ToolExecutionContext;
}): {
  findingId: string;
  lensId: string;
  evidenceRefs: string[];
} {
  const ledger = readPriorArtifact({
    packetText: args.packetText,
    artifactId: "finding-ledger",
    toolCtx: args.toolCtx,
  });
  const firstFinding = Array.isArray(ledger?.findings)
    ? ledger.findings[0]
    : null;
  if (firstFinding && typeof firstFinding === "object" && !Array.isArray(firstFinding)) {
    const record = firstFinding as Record<string, unknown>;
    return {
      findingId:
        typeof record.finding_id === "string" && record.finding_id.length > 0
          ? record.finding_id
          : "finding-001",
      lensId:
        typeof record.lens_id === "string" && record.lens_id.length > 0
          ? record.lens_id
          : primaryLensIdFromPrompt(args.packetText),
      evidenceRefs: stringArrayValue(record.evidence_refs),
    };
  }
  return {
    findingId: "finding-001",
    lensId: primaryLensIdFromPrompt(args.packetText),
    evidenceRefs: ["round1/logic.findings.yaml#logic-candidate-001"],
  };
}

function lensSidecarArgs(unitId: string): Record<string, unknown> {
  return {
    findings: [
      {
        target: "mock-target",
        evidence_anchor: "mock-anchor",
        claim: "mock finding",
        what: "Mock realization observed the bounded review path.",
        why: "This verifies wiring and artifact contracts without claiming semantic quality.",
        how_to_fix: "none",
        upstream_evidence_required: false,
        severity_hint: "low",
        materiality_basis: null,
        causal_path: null,
      },
    ],
    domain_constraints_used: [],
    domain_context_assumptions: [`${unitId} used mock realization for contract verification.`],
    no_findings_rationale: "",
  };
}

function findingLedgerArgs(packetText: string): Record<string, unknown> {
  const lensId = primaryLensIdFromPrompt(packetText);
  return {
    findings: [
      {
        finding_id: "finding-001",
        lens_id: lensId,
        source_ref: `round1/${lensId}.findings.yaml#findings.0`,
        target: "mock-target",
        evidence_anchor: "mock-anchor",
        claim: "mock finding",
        lens_rationale_summary:
          "Mock realization preserves a low-severity surface finding for contract verification.",
        proposed_action: "none",
        affected_purpose: "declared review purpose",
        failure_condition: "mock supported path",
        impact: "mock finding does not make the declared purpose unsafe",
        evidence_refs: [`round1/${lensId}.findings.yaml#findings.0`],
        severity: "low",
        domain_threshold_used: null,
        materiality_basis: null,
        causal_path: null,
      },
    ],
    validation: { unaddressable_findings: [] },
  };
}

function issueArtifactArgs(
  unitId: string,
  packetText: string,
  toolCtx: ToolExecutionContext,
): Record<string, unknown> {
  const findingFact = firstFindingFact({ packetText, toolCtx });
  const lensId = findingFact.lensId;
  const findingId = findingFact.findingId;
  const evidenceRefs =
    findingFact.evidenceRefs.length > 0
      ? findingFact.evidenceRefs
      : [`finding-ledger.yaml#${findingId}`];
  switch (unitId) {
    case "finding-ledger":
      return findingLedgerArgs(packetText);
    case "finding-relation-graph":
      return {
        relations: [],
      };
    case "issue-ledger":
      return {
        issues: [
          {
            issue_id: "issue-001",
            root_cause_hypothesis: "mock root",
            root_confidence: "low",
            surface_finding_ids: [findingId],
            relation_refs: [],
            raised_by_lens_ids: [lensId],
            issue_statement: "mock issue",
            proposed_action: "none",
            affected_purpose: "declared review purpose",
            failure_condition: "mock supported path",
            impact: "mock issue does not make the declared purpose unsafe",
            evidence_refs: evidenceRefs,
            severity: "low",
            domain_threshold_used: null,
            singleton_reason: "mock singleton",
          },
        ],
        validation: { unclustered_finding_ids: [] },
      };
    case "deliberation-plan":
      return {
        planned_issues: [],
        skipped_issues: [
          {
            issue_id: "issue-001",
            reason_code: "consistent_stances",
            reason: "Mock realization has no material stance conflict.",
          },
        ],
      };
    case "problem-framing": {
      const context = parseRuntimeProblemFramingContext(packetText);
      return {
        classifications: Object.keys(context.issue_surface_finding_ids).map((issueId) => ({
          issue_id: issueId,
          problem_definition: "mock problem",
          issue_role: "independent_issue",
          judgment_state: "observed",
          impact_kind: "maintainability_evolvability",
          timing_class: "defer_watch",
          closure_class: "watch",
          closure_obligation: "out_of_scope",
          domain_axes: {},
          rationale: "Mock realization classification for contract verification.",
        })),
      };
    }
    default:
      throw new Error(`Unsupported mock issue artifact unit: ${unitId}`);
  }
}

/**
 * 설계 A 픽스처 스위치 (F-A1/F-A2): 지정 렌즈의 stance 유닛이 허용 집합 밖
 * evidence_ref를 제출해 실제 `issue_evidence_refs` 화이트리스트 검증을
 * 거부당하게 한다.
 * - `ONTO_LLM_MOCK_STANCE_UNSUPPORTED_REF_LENSES`: csv 렌즈 id 또는 `*`.
 * - `ONTO_LLM_MOCK_STANCE_UNSUPPORTED_REF_MODE`: `persist`(기본, cap 소진
 *   경로) | `correct_on_resubmit`(packet에 resubmit 오류 명세가 주입되면
 *   유효 ref로 치유 — 오류 명세 전달의 E2E 증거).
 */
function stanceUnsupportedRefTargets(
  env: NodeJS.ProcessEnv = process.env,
): Set<string> | "*" | null {
  const raw = env.ONTO_LLM_MOCK_STANCE_UNSUPPORTED_REF_LENSES;
  if (!raw) return null;
  if (raw.trim() === "*") return "*";
  const lenses = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return lenses.length > 0 ? new Set(lenses) : null;
}

function issueStanceArgs(
  unitId: string,
  packetText: string,
): Record<string, unknown> {
  const context = parseRuntimeIssueStanceSchemaContext(packetText);
  const lensId = unitId.startsWith("issue-stance:")
    ? unitId.slice("issue-stance:".length)
    : unitId;
  const targets = stanceUnsupportedRefTargets();
  const healed =
    process.env.ONTO_LLM_MOCK_STANCE_UNSUPPORTED_REF_MODE ===
      "correct_on_resubmit" && packetHasResubmitErrorSpec(packetText);
  const emitUnsupportedRef =
    targets !== null && (targets === "*" || targets.has(lensId)) && !healed;
  return {
    stances: Object.entries(context.issue_evidence_refs).map(
      ([issueId, refs], index) => ({
        issue_id: issueId,
        stance: "support",
        rationale: "Mock realization supports the low-severity issue framing.",
        root_hypothesis_position: "accepts",
        severity_position: "keeps",
        evidence_refs:
          emitUnsupportedRef && index === 0
            ? [`mock-unsupported-ref:${lensId}`]
            : refs.slice(0, 1),
      }),
    ),
  };
}

function issueDeliberationArgs(packetText: string): Record<string, unknown> {
  const context = parseRuntimeIssueDeliberationSchemaContext(packetText);
  return {
    difference_explanation: "Mock realization found no substantive difference.",
    response_to_other_positions: "Peer positions are accepted for contract verification.",
    updated_stance: "support",
    changed: false,
    change_reason: null,
    accepted_root_hypothesis: "mock root",
    remaining_blocker: null,
    evidence_refs: context.allowed_evidence_refs.slice(0, 1),
  };
}

function deliberationResolutionArgs(): Record<string, unknown> {
  return {
    issues: [
      {
        issue_id: "issue-001",
        status: "no-deliberation-needed",
        final_root_cause: "mock root",
        final_claim: "mock issue",
        surface_finding_ids: ["finding-001"],
        accepted_by_lens_ids: ["logic"],
        remaining_disagreement_lens_ids: [],
        reason: "Mock realization had no material disagreement to resolve.",
        required_follow_up_evidence: [],
      },
    ],
  };
}

function issueSynthesisArgs(packetText: string): Record<string, unknown> {
  const context = parseRuntimeIssueSynthesisSchemaContext(packetText);
  const fabricated =
    process.env.ONTO_LLM_MOCK_SYNTHESIZE_FABRICATE === "1"
      ? ' According to logic: "A fabricated quote that is definitely nowhere in the lens pool for this mock test run"'
      : "";
  return {
    conclusion: `Mock realization conclusion for issue contract verification.${fabricated}`,
    materiality_explanation:
      "The mock issue is low severity and does not establish material purpose harm.",
    root_cause_explanation:
      "The mock root is a deterministic placeholder for artifact wiring checks.",
    causal_path_explanation:
      "The mock causal path is intentionally shallow and non-semantic.",
    action_explanation: "No product action is required from mock-backed evidence alone.",
    unresolved_disagreement_note: null,
    boundary_notes: ["mock-backed contract verification"],
    source_refs_used: [context.allowed_source_refs[0]],
  };
}

async function executeSubmitTool(args: {
  tool: OntoTool;
  toolCtx: ToolExecutionContext;
  systemPrompt: string;
  userPrompt: string;
}): Promise<void> {
  const unitId = parseSystemPromptField(args.systemPrompt, "Unit id") ?? "mock-unit";
  const outputFormat = parseSystemPromptField(args.systemPrompt, "Output format");
  switch (args.tool.name) {
    case "submit_lens_findings":
      await args.tool.execute(lensSidecarArgs(unitId), args.toolCtx);
      return;
    case "submit_issue_artifact":
      await args.tool.execute(
        issueArtifactArgs(unitId, args.userPrompt, args.toolCtx),
        args.toolCtx,
      );
      return;
    case "submit_issue_stance_response":
      await args.tool.execute(issueStanceArgs(unitId, args.userPrompt), args.toolCtx);
      return;
    case "submit_issue_deliberation_response":
      await args.tool.execute(issueDeliberationArgs(args.userPrompt), args.toolCtx);
      return;
    case "submit_deliberation_resolution":
      await args.tool.execute(deliberationResolutionArgs(), args.toolCtx);
      return;
    case "submit_issue_synthesis_response":
      await args.tool.execute(issueSynthesisArgs(args.userPrompt), args.toolCtx);
      return;
    default:
      throw new Error(
        `Unsupported mock submit tool for ${outputFormat ?? "unknown output"}: ${args.tool.name}`,
      );
  }
}

export async function callReviewMockLlmWithTools(
  systemPrompt: string,
  userPrompt: string,
  tools: OntoTool[],
  config: ToolLoopConfig,
  toolCtx: ToolExecutionContext,
): Promise<ToolLoopResult> {
  await applyMockRuntimeHooks();
  const toolBoundarySkips = recordMockBoundarySkip(toolCtx);
  const baseResult = {
    iterations: 1,
    input_tokens: estimateTokens(`${systemPrompt}\n${userPrompt}`),
    model_id: modelIdFromConfig(config),
    artifact_generation_realization: "semantic_mock" as const,
    truncated_by_iteration_cap: false,
    ...(toolBoundarySkips ? { tool_boundary_skips: toolBoundarySkips } : {}),
  };

  if (process.env.ONTO_LLM_MOCK_TOOL_LOOP_THROW === "1") {
    throw new Error("mock tool-loop failure");
  }
  if (process.env.ONTO_LLM_MOCK_TOOL_LOOP_ECHO_CONFIG === "1") {
    const text = `api_key_env: ${config.api_key_env ?? ""}`;
    return {
      ...baseResult,
      text,
      tool_calls: 0,
      output_tokens: estimateTokens(text),
    };
  }
  if (process.env.ONTO_LLM_MOCK_TOOL_LOOP_EMPTY === "1") {
    return {
      ...baseResult,
      text: "",
      tool_calls: 0,
      output_tokens: 0,
    };
  }

  const submitTool = tools.find((tool) => tool.name.startsWith("submit_"));
  if (submitTool) {
    await executeSubmitTool({
      tool: submitTool,
      toolCtx,
      systemPrompt,
      userPrompt,
    });
    return {
      ...baseResult,
      text: "",
      tool_calls: 1,
      output_tokens: 0,
    };
  }

  const fallback = await callReviewMockLlm(systemPrompt, userPrompt, config);
  return {
    ...baseResult,
    text: fallback.text,
    tool_calls: 0,
    output_tokens: fallback.output_tokens,
  };
}
