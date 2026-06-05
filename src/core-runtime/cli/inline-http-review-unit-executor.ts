#!/usr/bin/env node

/**
 * Inline-HTTP review unit executor — Phase 2 of host runtime decoupling.
 *
 * Executes a single bounded review unit (lens or synthesize) by directly
 * calling an LLM HTTP endpoint (Anthropic / OpenAI / Grok / LM Studio)
 * from the TS process.
 *
 * # When to use
 *
 * - **standalone host**: TS process invocation with no Claude Code or Codex
 *   CLI session — direct LLM call is the only option.
 * - **direct provider combinations**: any supported API-key/local provider.
 *
 * # Execution tiers
 *
 * Direct HTTP execution supports two bounded tiers:
 *
 * - Tool-native: read-only `read_file`, `list_directory`, and `search_content`
 *   tools are made available through the TS tool loop when the resolved
 *   provider supports function calling. Packets with `Tools: required` promote
 *   auto mode to this tier and fail fast if no tool-capable provider is
 *   available. Packets with `Tools: denied` forbid this tier.
 * - Inline: the executor inlines the needed context into the prompt and calls
 *   the provider once. Packets with `Filesystem: denied` force this tier.
 *
 * The materialized target is already inline in normal prompt packets. Domain
 * document embedding remains opt-in via `--embed-domain-docs`.
 *
 * The LLM always produces a single markdown output file; the tool-native tier
 * only changes how it reads bounded context before producing that file.
 *
 * # Provider selection
 *
 * Reuses the core LLM caller resolution:
 *   1. --provider flag (caller-explicit)
 *   2. `.onto/settings.json` actor-owned review.execution.*.llm switcher
 *   3. explicit provider validation
 *
 * The `host_runtime` reported in the JSON output reflects the resolved
 * provider (`anthropic` / `openai` / `grok` / `lmstudio`), not the orchestrator host.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import {
  callLlm,
  resolveLlmProviderConfig,
  type LlmCallConfig,
  type LlmProviderConfigInputs,
  type LlmProviderCliOverrides,
} from "../llm/llm-caller.js";
import {
  callLlmWithTools,
  type ToolLoopProvider,
} from "../llm/llm-tool-loop.js";
import {
  createReviewUnitToolExecutionContext,
  getToolBoundarySkipSummary,
  ONTO_DEFAULT_TOOLS,
  type ToolBoundarySkipSummary,
  type ToolExecutionContext,
} from "./onto-tools.js";
import { embedInlineContext } from "../review/inline-context-embedder.js";
import {
  parsePacketAllowedReadAuthority,
  parsePacketBoundaryPolicy,
} from "../review/packet-boundary-policy.js";
import { parseParticipatingLensPaths } from "../review/participating-lens-paths.js";
import {
  DEFAULT_MIN_QUOTE_LENGTH,
  auditCitations,
  type CitationAuditResult,
} from "../review/citation-audit.js";
import {
  resolveSettingsChain,
  type OntoSettings,
} from "../discovery/settings-chain.js";
import { stripWrappingCodeFence } from "./strip-wrapping-code-fence.js";
import { assertPathInsideRoot } from "../path-boundary.js";

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
 * System prompt for inline (Tier 2) mode: no tools, all context inlined.
 *
 * The lens variant focuses on bounded finding production from inlined target +
 * domain content. The synthesize variant emphasises deliberation across already-
 * inlined lens outputs and preservation of the 8 required sections — even when
 * disagreement cannot be resolved from inlined evidence alone.
 */
function buildSystemPromptInline(
  unitId: string,
  unitKind: string,
  packetPath: string,
  outputPath: string,
): string {
  if (unitKind === "synthesize") {
    return buildSynthesizeSystemPromptInline(unitId, packetPath, outputPath);
  }
  return buildLensSystemPromptInline(unitId, unitKind, packetPath, outputPath);
}

function buildLensSystemPromptInline(
  unitId: string,
  unitKind: string,
  packetPath: string,
  outputPath: string,
): string {
  return `You are executing a single bounded review unit as a ContextIsolatedReasoningUnit.

Unit id: ${unitId}
Unit kind: ${unitKind}
Authoritative prompt packet path: ${packetPath}
Canonical output path: ${outputPath}

Rules:
- Treat the prompt packet (in the user message) as the authoritative contract.
- All content needed for this task has been inlined into the prompt packet.
  You do NOT have file system access or any tools — produce your answer from
  the inlined content alone.
- Treat the Boundary Policy and Effective Boundary State in the packet as hard constraints.
- Stay within the smallest sufficient finding set implied by the packet.
- Produce ONLY the final markdown content for the canonical output path.
- Do not wrap the answer in code fences.
- Do not add commentary before or after the markdown.
- Do not modify repository files (you cannot — no tools available).
- Do not change the required output structure from the packet.
- If the packet asks you to preserve disagreement or uncertainty, preserve it explicitly.
- If you cannot complete the task with the inlined content alone, state the
  limitation as "insufficient content within boundary" rather than fabricating.`;
}

function buildSynthesizeSystemPromptInline(
  unitId: string,
  packetPath: string,
  outputPath: string,
): string {
  return `You are the synthesize actor for a bounded review. You are a ContextIsolatedReasoningUnit.

Unit id: ${unitId}
Unit kind: synthesize
Authoritative prompt packet path: ${packetPath}
Canonical output path: ${outputPath}

OUTPUT FORMAT — READ FIRST:
- Your entire response is written verbatim to the canonical output path as-is. No post-processing will change your first or last lines.
- The FIRST character of your response MUST be the YAML frontmatter delimiter "-" (three dashes on line 1). Do NOT begin your response with three backticks, a language tag like "yaml" or "markdown", or any prose preface.
- The LAST character of your response MUST be part of the final markdown section body. Do NOT end your response with three backticks or a closing code fence.
- Do NOT wrap the entire answer in a \`\`\`yaml, \`\`\`markdown, or any code block. The output file must be valid markdown with YAML frontmatter, not a markdown file that contains your answer as a code block.
- Inner code blocks INSIDE the markdown body (e.g. citing a small code snippet in a finding) are allowed. The rule applies only to an outer wrapper around the whole response.

Your job:
- Read every Participating Lens Output that is inlined in the prompt packet.
- Read the Controlled Lens Deliberation Result that is inlined in the prompt packet.
- Classify findings into Consensus, Conditional Consensus, Disagreement, and Unique Finding Tagging.
- Do not perform deliberation yourself. Controlled lens deliberation already produced the authoritative resolution or unresolved-disagreement record.
- Integrate Axiology proposed perspectives without erasing the lens-level evidence.
- Write a comprehensive Final Review Result section grounded in the full inlined artifact set.
- Write a compact Boundary Notes section for non-material evidence gaps and scope limitations; keep it to at most 3 bullets.

Rules:
- Treat the prompt packet (in the user message) as the authoritative contract.
- All content needed for this task has been inlined into the prompt packet.
  You do NOT have file system access or any tools — produce your answer from
  the inlined content alone.
- Treat the Boundary Policy and Effective Boundary State in the packet as hard constraints.
- Every required output section in the packet is MANDATORY. Do not rename, merge, or omit required headings, even if a section is empty (state "(none)" instead).
- Preserve lens-level evidence in your output — never paraphrase a lens away from its citation.
- Set deliberation_status in the YAML frontmatter to "performed".
- Produce ONLY the final markdown content for the canonical output path.
- Do not add commentary before or after the markdown.
- If controlled deliberation preserved an unresolved disagreement, preserve that limitation explicitly under Deliberation Decision.`;
}

/**
 * System prompt for tool-native (Tier 1) mode: read-only tools available,
 * boundary enforced by the TS process at tool-call time.
 *
 * lens vs synthesize variants differ in role framing and which subdirectories
 * the model is encouraged to traverse. For synthesize, .onto traversal is
 * unlocked at the boundary layer (allowOntoTraversal=true) so search/list can
 * discover lens outputs under .onto/review/<session>/round1.
 */
function buildSystemPromptToolNative(
  unitId: string,
  unitKind: string,
  packetPath: string,
  outputPath: string,
): string {
  if (unitKind === "synthesize") {
    return buildSynthesizeSystemPromptToolNative(unitId, packetPath, outputPath);
  }
  return buildLensSystemPromptToolNative(unitId, unitKind, packetPath, outputPath);
}

function buildLensSystemPromptToolNative(
  unitId: string,
  unitKind: string,
  packetPath: string,
  outputPath: string,
): string {
  return `You are executing a single bounded review unit as a ContextIsolatedReasoningUnit.

Unit id: ${unitId}
Unit kind: ${unitKind}
Authoritative prompt packet path: ${packetPath}
Canonical output path: ${outputPath}

You have THREE read-only tools to fetch additional context as needed:
- read_file(path, start_line?, end_line?) — read up to 2000 lines of a file
- list_directory(path) — list entries in a directory (skips .git, node_modules, .onto, dist, build)
- search_content(pattern, path?, case_insensitive?) — find literal substring matches under a directory

Tools are bounded:
- Paths must resolve inside projectRoot or ontoHome. Boundary violations return an error you can recover from by trying a different path.
- If the packet declares unit_boundary.read_authority.allowed_read_refs, tools may read/list/search only those refs or child paths under a directory ref.
- Use search_content to locate references first, then read_file to inspect specific sections.
- Prefer narrow reads (start_line/end_line) over re-reading the same large file.

Rules:
- Treat the prompt packet (in the user message) as the authoritative contract.
- Treat the Boundary Policy and Effective Boundary State in the packet as hard constraints.
- Use tools ONLY when the packet's inlined content is insufficient — do not browse for browsing's sake.
- Stay within the smallest sufficient finding set implied by the packet.
- After your tool exploration, produce ONLY the final markdown content for the canonical output path.
- Do not wrap the answer in code fences.
- Do not add commentary before or after the markdown.
- Do not change the required output structure from the packet.
- If the packet asks you to preserve disagreement or uncertainty, preserve it explicitly.
- If even with tools you cannot complete the task, state the limitation as "insufficient content within boundary" rather than fabricating.`;
}

function buildSynthesizeSystemPromptToolNative(
  unitId: string,
  packetPath: string,
  outputPath: string,
): string {
  return `You are the synthesize actor for a bounded review. You are a ContextIsolatedReasoningUnit.

Unit id: ${unitId}
Unit kind: synthesize
Authoritative prompt packet path: ${packetPath}
Canonical output path: ${outputPath}

OUTPUT FORMAT — READ FIRST:
- Your FINAL message (after any tool calls complete) is written verbatim to the canonical output path.
- The FIRST character of your final message MUST be the YAML frontmatter delimiter "-" (three dashes on line 1). Do NOT begin with three backticks, a language tag like "yaml" or "markdown", or any prose preface.
- The LAST character of your final message MUST be part of the final markdown section body. Do NOT end with three backticks or a closing code fence.
- Do NOT wrap the entire answer in a \`\`\`yaml, \`\`\`markdown, or any code block. The output file must be valid markdown with YAML frontmatter, not a markdown file that contains your answer as a code block.
- Inner code blocks INSIDE the markdown body (e.g. citing a small code snippet in a finding) are allowed. The rule applies only to an outer wrapper around the whole response.

You have THREE read-only tools:
- read_file(path, start_line?, end_line?) — read up to 2000 lines of a file
- list_directory(path) — list entries in a directory
- search_content(pattern, path?, case_insensitive?) — find literal substring matches under a directory

Tool boundary for synthesize:
- Paths must resolve inside projectRoot or ontoHome.
- If the packet declares unit_boundary.read_authority.allowed_read_refs, tools may read/list/search only those refs or child paths under a directory ref.
- Lens outputs live under \`.onto/review/<session>/round1/<lens>.md\`. The packet's "Runtime Participating Lens Outputs" section lists the exact completed paths when present; otherwise fall back to "Participating Lens Outputs". Call read_file on those paths to read each lens's findings.
- The controlled lens deliberation result lives at the packet's "Controlled Lens Deliberation Result" path — call read_file on that path before classifying disagreements.
- The materialized input (the actual review target) is also referenced in the packet — read_file it whenever you need to verify a contested claim against the source.
- For synthesize, .onto traversal IS allowed (unlike lens runs) so list_directory and search_content work under .onto/review.

Your job:
- Read every runtime participating lens output via read_file. Do not skip any successful lens.
- Read the Controlled Lens Deliberation Result via read_file.
- Classify findings: Consensus, Conditional Consensus, Disagreement, Unique Finding Tagging.
- Do not perform deliberation yourself. Controlled lens deliberation already produced the authoritative resolution or unresolved-disagreement record.
- Integrate Axiology proposed perspectives without erasing lens-level evidence.
- Write a comprehensive Final Review Result section grounded in the full artifact set.
- Write a compact Boundary Notes section for non-material evidence gaps and scope limitations; keep it to at most 3 bullets.

Rules:
- Treat the prompt packet (in the user message) as the authoritative contract.
- Treat the Boundary Policy and Effective Boundary State in the packet as hard constraints.
- Every required output section in the packet is MANDATORY. Do not rename, merge, or omit required headings — write "(none)" if a section has no content.
- Preserve lens-level evidence — never paraphrase a lens away from its citation.
- Set deliberation_status in the YAML frontmatter to "performed".
- Produce ONLY the final markdown content for the canonical output path.
- Do not add commentary before or after the markdown.
- If a lens output file is missing or unreadable via read_file, record the scope limitation under Boundary Notes and reflect any material impact in Final Review Result rather than fabricating findings.`;
}

interface ExecutorOptions {
  projectRoot: string;
  sessionRoot: string;
  unitId: string;
  unitKind: string;
  packetPath: string;
  outputPath: string;
  embedDomainDocs: boolean;
  llmConfig: Partial<LlmCallConfig>;
  ontoHome: string;
}

type ToolModeRequest = "native" | "inline" | "auto";
type ToolModeUsed = "native" | "inline";
type NativeAdmissionDecision =
  | "native_admitted"
  | "inline_requested"
  | "packet_forced_inline"
  | "read_authority_forced_inline"
  | "native_downgraded_inline"
  | "auto_inline_provider_without_tools";

interface NativeAdmissionSummary {
  requested_tool_mode: ToolModeRequest;
  effective_tool_mode: ToolModeUsed;
  decision: NativeAdmissionDecision;
  reason?: string;
  allowed_read_refs_count: number;
  read_authority_declared: boolean;
  read_authority_malformed: boolean;
  read_authority_failure?: string;
  attempted_native_tool_boundary_skips?: ToolBoundarySkipSummary;
}

interface ExecutorResult {
  unit_id: string;
  unit_kind: string;
  packet_path: string;
  output_path: string;
  realization: "ts_inline_http";
  host_runtime: "anthropic" | "openai" | "grok" | "lmstudio" | "codex";
  /** Tier picked at execution time. "native" = function-calling loop; "inline" = single-turn with all context inlined. */
  tool_mode: ToolModeUsed;
  /** Resolved LLM model used. */
  model_id?: string;
  /** Token usage for cost tracking. */
  input_tokens?: number;
  output_tokens?: number;
  /** Tool-loop telemetry; absent when tool_mode="inline". */
  tool_iterations?: number;
  tool_calls?: number;
  /**
   * True when the caller requested tool-native (or auto) but the packet's
   * Boundary Policy forced inline by denying filesystem or tools. Surface as
   * audit signal so cost dashboards can correlate packet policy with executor
   * tier.
   */
  packet_policy_downgrade?: boolean;
  /**
   * True when the caller requested auto mode but the packet's Boundary Policy
   * Tools: required forced tool-native promotion. Mirror of
   * `packet_policy_downgrade` for the opposite direction (A4).
   */
  packet_policy_promotion?: boolean;
  /** Structured record of native admission or downgrade decisions. */
  native_admission?: NativeAdmissionSummary;
  /** Aggregated tool boundary skip counters, when non-zero. */
  tool_boundary_skips?: ToolBoundarySkipSummary;
  /**
   * Post-flight citation audit (A5). Present only for synthesize units whose
   * packet declares runtime or planned participating lens outputs that resolve
   * to readable files. `quotes_unmatched` lists suspected fabrications —
   * WARNING ONLY, the executor never fails on audit findings alone.
   */
  citation_audit?: CitationAuditResult;
}

function parseToolMode(raw: unknown): ToolModeRequest {
  if (raw === "native" || raw === "inline" || raw === "auto") return raw;
  if (raw === undefined || raw === "") return "auto";
  throw new Error(`Invalid --tool-mode value: ${String(raw)} (expected native | inline | auto)`);
}

/**
 * Map a resolved provider to the tool-loop driver's provider enum. Returns
 * `null` for `codex` because the Codex worker path has its own
 * agentic scaffold and isn't routed through callLlmWithTools — auto mode
 * should fall back to inline in that case.
 */
function asToolLoopProvider(provider: string | undefined): ToolLoopProvider | null {
  if (
    provider === "anthropic" ||
    provider === "openai" ||
    provider === "grok" ||
    provider === "lmstudio"
  ) {
    return provider;
  }
  return null;
}

async function loadOntoConfig(projectRoot: string): Promise<OntoSettings> {
  return resolveSettingsChain("", projectRoot);
}

function llmProviderConfigForUnit(
  settings: OntoSettings,
  unitKind: string,
  unitId: string,
): LlmProviderConfigInputs {
  let actorLlm = settings.review?.execution?.teamlead?.llm;
  if (unitKind === "lens") {
    actorLlm = settings.review?.execution?.lens?.llm;
  } else if (unitKind === "synthesize") {
    actorLlm = settings.review?.execution?.synthesize?.llm;
  } else if (unitKind === "deliberation" && unitId !== "controlled-deliberation") {
    actorLlm = settings.review?.execution?.lens?.llm;
  }
  const llm = actorLlm ?? settings.llm;
  return llm ? { llm } : {};
}

async function readPacketAndEmbed(
  packetPath: string,
  ontoHome: string,
  projectRoot: string,
  embedDomainDocs: boolean,
): Promise<string> {
  const packetText = await fs.readFile(packetPath, "utf8");
  if (!embedDomainDocs) {
    return packetText;
  }
  return embedInlineContext(packetText, { ontoHome, projectRoot });
}

function deriveHostRuntime(provider: string | undefined): ExecutorResult["host_runtime"] {
  if (provider === "anthropic") return "anthropic";
  if (provider === "openai") return "openai";
  if (provider === "grok") return "grok";
  if (provider === "lmstudio") return "lmstudio";
  if (provider === "codex") return "codex";
  throw new Error("inline-http executor requires an explicit llm provider.");
}

function describeReadAuthorityFailure(
  authority: ReturnType<typeof parsePacketAllowedReadAuthority>,
): string | undefined {
  if (authority.duplicate_sections) {
    return `multiple Unit Boundary Details sections (${authority.section_count})`;
  }
  if (authority.malformed) {
    return "malformed unit_boundary.read_authority.allowed_read_refs";
  }
  if (!authority.declared) {
    return "missing Unit Boundary Details";
  }
  if (authority.refs.length === 0) {
    return "empty unit_boundary.read_authority.allowed_read_refs";
  }
  return undefined;
}

function unitBoundaryIdMatches(boundaryUnitId: string, cliUnitId: string): boolean {
  return (
    boundaryUnitId === cliUnitId ||
    boundaryUnitId === `issue-artifact:${cliUnitId}`
  );
}

function resolveBoundaryRef(projectRoot: string, ref: string): string {
  return path.normalize(path.isAbsolute(ref) ? ref : path.resolve(projectRoot, ref));
}

function isPathUnder(candidate: string, parent: string): boolean {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function describeBoundaryDetailsMismatch(args: {
  authority: ReturnType<typeof parsePacketAllowedReadAuthority>;
  projectRoot: string;
  unitId: string;
  outputPath: string;
}): string | undefined {
  if (args.authority.unit_id === undefined) {
    return "missing unit_boundary.unit_id";
  }
  if (!unitBoundaryIdMatches(args.authority.unit_id, args.unitId)) {
    return `unit_boundary.unit_id mismatch: expected ${args.unitId}, got ${args.authority.unit_id}`;
  }
  if (args.authority.output_path === undefined) {
    return "missing unit_boundary.output_seat.output_path";
  }
  const declaredOutputPath = resolveBoundaryRef(
    args.projectRoot,
    args.authority.output_path,
  );
  const actualOutputPath = path.normalize(args.outputPath);
  if (declaredOutputPath !== actualOutputPath) {
    return `unit_boundary.output_seat.output_path mismatch: expected ${actualOutputPath}, got ${declaredOutputPath}`;
  }
  if (
    args.authority.allowed_output_refs === undefined ||
    args.authority.allowed_output_refs.length === 0
  ) {
    return "missing unit_boundary.output_seat.allowed_output_refs";
  }
  const outputAllowed = args.authority.allowed_output_refs.some(
    (ref) => resolveBoundaryRef(args.projectRoot, ref) === actualOutputPath,
  );
  if (!outputAllowed) {
    return `unit_boundary.output_seat.allowed_output_refs does not include output path: ${actualOutputPath}`;
  }
  return undefined;
}

function resolveCitationAuditRef(args: {
  ref: string;
  projectRoot: string;
  ontoHome: string;
}): string {
  if (args.ref.startsWith("~/")) {
    return path.resolve(path.dirname(args.ontoHome), args.ref.slice(2));
  }
  return path.normalize(
    path.isAbsolute(args.ref)
      ? path.resolve(args.ref)
      : path.resolve(args.projectRoot, args.ref),
  );
}

async function resolveCitationAuditAllowedReadRef(args: {
  ref: string;
  projectRoot: string;
  sessionRoot: string;
  ontoHome: string;
}): Promise<string> {
  const candidate = resolveCitationAuditRef({
    ref: args.ref,
    projectRoot: args.projectRoot,
    ontoHome: args.ontoHome,
  });
  const allowedRoots = [
    path.resolve(args.projectRoot),
    path.resolve(args.sessionRoot),
    path.resolve(args.ontoHome),
  ];
  for (const allowedRoot of allowedRoots) {
    try {
      await assertPathInsideRoot({
        root: allowedRoot,
        candidate,
        label: `citation audit allowed_read_refs entry ${args.ref}`,
      });
      return await fs.realpath(candidate);
    } catch {
      // Try the next audit root before failing this authority ref.
    }
  }
  throw new Error(
    `allowed_read_refs entry "${args.ref}" is not readable within citation audit roots`,
  );
}

export async function runInlineHttpReviewUnitExecutorCli(
  argv: string[],
): Promise<number> {
  const { values } = parseArgs({
    options: {
      "project-root": { type: "string", default: "." },
      "session-root": { type: "string" },
      "onto-home": { type: "string" },
      "unit-id": { type: "string" },
      "unit-kind": { type: "string" },
      "packet-path": { type: "string" },
      "output-path": { type: "string" },
      // LLM provider selection (reuses llm-caller bridge)
      provider: { type: "string" }, // anthropic | openai | grok | lmstudio | codex
      auth: { type: "string" },
      "api-key-env": { type: "string" },
      "llm-base-url": { type: "string" },
      model: { type: "string" },
      "reasoning-effort": { type: "string" },
      "max-tokens": { type: "string" },
      // Inline embedding control
      "embed-domain-docs": { type: "boolean", default: false },
      // Tool mode: native (Tier 1 function-calling loop) | inline (Tier 2,
      // current behavior) | auto (try native, fall back to inline if the
      // provider rejects tools or no tool_calls came back).
      "tool-mode": { type: "string", default: "auto" },
      // Citation audit (A5) configuration. The audit is post-flight and
      // warning-only; this flag tunes how aggressive the extractor is about
      // what counts as a "significant quote". Default 20 skips noise like
      // `"performed"`, `` `x.ts` ``, etc. Lower to audit shorter citations;
      // raise to suppress moderate-length quotes that produce false positives
      // for a given synthesize template.
      "min-quote-length": { type: "string" },
    },
    strict: true,
    allowPositionals: false,
    args: argv,
  });

  const projectRoot = path.resolve(
    requireString(values["project-root"], "project-root"),
  );
  const sessionRoot = path.resolve(
    requireString(values["session-root"], "session-root"),
  );
  const ontoHome = path.resolve(
    typeof values["onto-home"] === "string" && values["onto-home"].length > 0
      ? values["onto-home"]
      : path.join(process.env.HOME ?? "", ".onto"),
  );
  const unitId = requireString(values["unit-id"], "unit-id");
  const unitKind = requireString(values["unit-kind"], "unit-kind");
  const packetPath = path.resolve(requireString(values["packet-path"], "packet-path"));
  const outputPath = path.resolve(requireString(values["output-path"], "output-path"));
  const embedDomainDocs = Boolean(values["embed-domain-docs"]);

  const maxTokensRaw = values["max-tokens"];
  const maxTokens =
    typeof maxTokensRaw === "string" && maxTokensRaw.length > 0
      ? Number.parseInt(maxTokensRaw, 10)
      : 4096;

  // Resolve LLM provider config: CLI flags → OntoConfig.
  const ontoConfig = await loadOntoConfig(projectRoot);
  const cliOverrides: LlmProviderCliOverrides = {};
  const providerValue = values.provider;
  if (
    providerValue === "anthropic" ||
    providerValue === "openai" ||
    providerValue === "grok" ||
    providerValue === "lmstudio" ||
    providerValue === "codex"
  ) {
    cliOverrides.provider = providerValue;
  }
  const authValue = values.auth;
  if (authValue === "api_key" || authValue === "oauth" || authValue === "local") {
    cliOverrides.auth = authValue;
  }
  if (typeof values["llm-base-url"] === "string") {
    cliOverrides.base_url = values["llm-base-url"];
  }
  if (typeof values["api-key-env"] === "string") {
    cliOverrides.api_key_env = values["api-key-env"];
  }
  if (typeof values.model === "string") {
    cliOverrides.model = values.model;
  }
  if (typeof values["reasoning-effort"] === "string") {
    cliOverrides.reasoning_effort = values["reasoning-effort"];
  }

  const llmPartial = resolveLlmProviderConfig({
    config: llmProviderConfigForUnit(ontoConfig, unitKind, unitId),
    cliOverrides,
  });

  // Review Recovery PR-1 (R1 observability symmetry): each executor process
  // emits `[plan:executor]` once at startup so the parent's `[plan]` lines and
  // the executor's LLM-call lines are stitchable into a single stderr trace.
  // Before PR-1, the process boundary was a blind spot: the parent resolved
  // a provider, but the child could silently re-resolve differently and
  // operators had no way to see it.
  process.stderr.write(
    `[plan:executor] kind=inline-http unit_id=${unitId} provider=${
      llmPartial.provider ?? "(unresolved)"
    } model=${llmPartial.model_id ?? "(unresolved)"} base_url=${
      llmPartial.base_url ?? "(default)"
    } tool_mode_request=${values["tool-mode"] ?? "auto"}\n`,
  );

  const requestedToolMode = parseToolMode(values["tool-mode"]);

  // Determine which Tier the auto/native paths should attempt. codex provider
  // bypasses callLlmWithTools entirely — auto
  // collapses to inline there.
  const toolLoopProvider = asToolLoopProvider(llmPartial.provider);
  if (requestedToolMode === "native" && toolLoopProvider === null) {
    throw new Error(
      `--tool-mode=native requires provider in {anthropic, openai, grok, lmstudio}; got "${llmPartial.provider ?? "(auto)"}".`,
    );
  }

  // Read packet (raw) first so we can inspect its declared Boundary Policy
  // BEFORE deciding whether native mode is admissible. Embedding happens
  // after, so boundary policy is taken from the authored packet, not from
  // any embedded material.
  const rawPacketText = await fs.readFile(packetPath, "utf8");
  const packetPolicy = parsePacketBoundaryPolicy(rawPacketText);
  const packetReadAuthority = parsePacketAllowedReadAuthority(rawPacketText);

  // A1 + A4 consistency check: a packet cannot BOTH deny filesystem AND require
  // tools, because today's tools (read_file / list_directory / search_content)
  // are all filesystem-scoped. Reject the packet upfront rather than letting
  // the two blocks below reach contradictory conclusions.
  if (
    packetPolicy.filesystem === "denied" &&
    packetPolicy.tools === "required"
  ) {
    throw new Error(
      `Packet Boundary Policy is internally inconsistent for unit ${unitId}: ` +
        `Filesystem: ${packetPolicy.filesystemRaw ?? "denied"} AND Tools: ${
          packetPolicy.toolsRaw ?? "required"
        }. ` +
        "All current executor tools (read_file / list_directory / search_content) require filesystem access, " +
        "so a packet cannot deny filesystem while also requiring tools. " +
        "Remove one of the two declarations.",
    );
  }

  // A1/A4 precedence rule: packet-declared Filesystem: denied or Tools: denied
  // forbids tool-native mode regardless of CLI flag, because the packet is the
  // authoritative admission contract for this unit. If the caller explicitly
  // asked for native, surface the conflict as a fail-fast precondition error.
  // Otherwise (auto), downgrade to inline and emit a one-time STDERR notice so
  // operators can see why the tier changed.
  let packetForcedInline = false;
  let packetForcedInlineReason = "";
  let nativeAdmissionDecision: NativeAdmissionDecision =
    requestedToolMode === "inline"
      ? "inline_requested"
      : "auto_inline_provider_without_tools";
  let nativeAdmissionReason: string | undefined;
  if (packetPolicy.filesystem === "denied") {
    if (requestedToolMode === "native") {
      throw new Error(
        `--tool-mode=native conflicts with packet's Boundary Policy (Filesystem: ${
          packetPolicy.filesystemRaw ?? "denied"
        }). ` +
          "The packet declares no filesystem access; tool-native mode would hand the LLM file tools in violation. " +
          "Use --tool-mode=inline or remove the packet-level Filesystem: denied declaration.",
      );
    }
    if (requestedToolMode === "auto") {
      packetForcedInline = true;
      packetForcedInlineReason = `Filesystem: ${
        packetPolicy.filesystemRaw ?? "denied"
      }`;
      nativeAdmissionDecision = "packet_forced_inline";
      nativeAdmissionReason = packetForcedInlineReason;
    }
  }
  if (packetPolicy.tools === "denied") {
    if (requestedToolMode === "native") {
      throw new Error(
        `--tool-mode=native conflicts with packet's Boundary Policy (Tools: ${
          packetPolicy.toolsRaw ?? "denied"
        }). ` +
          "The packet declares no tool access; tool-native mode would hand the LLM read-only tools in violation. " +
          "Use --tool-mode=inline or remove the packet-level Tools: denied declaration.",
      );
    }
    if (requestedToolMode === "auto") {
      packetForcedInline = true;
      packetForcedInlineReason = `Tools: ${packetPolicy.toolsRaw ?? "denied"}`;
      nativeAdmissionDecision = "packet_forced_inline";
      nativeAdmissionReason = packetForcedInlineReason;
    }
  }

  // A4 precedence rule (mirror of A1): packet-declared Tools: required forbids
  // inline mode regardless of CLI flag, because a packet with path-only lens
  // outputs CANNOT produce a faithful synthesis without tools — the LLM would
  // fabricate citations (demonstrated in Phase 3-4 A3 benchmark, 2026-04-17,
  // with Qwen3-30B-A3B producing a quote that grep returned 0 matches for).
  //
  // If the caller explicitly asked for inline, fail-fast. Under auto, try to
  // promote to native; if the provider has no tool-loop support, fail-fast
  // rather than silently falling back to fabrication-prone inline.
  let packetForcedNative = false;
  if (packetPolicy.tools === "required") {
    if (requestedToolMode === "inline") {
      throw new Error(
        `--tool-mode=inline conflicts with packet's Boundary Policy (Tools: ${
          packetPolicy.toolsRaw ?? "required"
        }). ` +
          "The packet declares that tools are required to complete this unit (e.g. path-only lens outputs). " +
          "Running inline mode would force the LLM to answer without the cited sources, which has been " +
          "shown to produce fabricated citations. Use --tool-mode=native or --tool-mode=auto (with a " +
          "provider that supports function calling), or remove the packet-level Tools: required declaration.",
      );
    }
    if (requestedToolMode === "auto" && toolLoopProvider === null) {
      throw new Error(
        `--tool-mode=auto + packet Boundary Policy (Tools: ${
          packetPolicy.toolsRaw ?? "required"
        }) cannot be satisfied: ` +
          `the resolved provider (${cliOverrides.provider ?? "default-auto"}) does not support the function-calling tool loop. ` +
          "Select a provider in {anthropic, openai, grok, lmstudio} via --provider, or edit the packet to remove Tools: required.",
      );
    }
    if (requestedToolMode === "auto") {
      packetForcedNative = true;
    }
  }

  const readAuthorityFailure =
    describeReadAuthorityFailure(packetReadAuthority) ??
    describeBoundaryDetailsMismatch({
      authority: packetReadAuthority,
      projectRoot,
      unitId,
      outputPath,
    });
  let packetReadAuthorityDowngrade = false;
  if (readAuthorityFailure) {
    const message =
      `Packet Unit Boundary Details read authority is invalid for unit ${unitId}: ` +
      `${readAuthorityFailure}. ` +
      "Tool-native execution requires a non-empty " +
      "unit_boundary.read_authority.allowed_read_refs list so native " +
      "filesystem tools cannot widen the unit boundary. Regenerate prompt " +
      "packets from the current materializer or use --tool-mode=inline for " +
      "inline-capable packets.";
    if (requestedToolMode === "native" || packetForcedNative) {
      throw new Error(message);
    }
    if (
      requestedToolMode === "auto" &&
      toolLoopProvider !== null &&
      !packetForcedInline
    ) {
      packetReadAuthorityDowngrade = true;
      packetForcedInlineReason = readAuthorityFailure;
      nativeAdmissionDecision = "read_authority_forced_inline";
      nativeAdmissionReason = readAuthorityFailure;
    }
  }

  const tryNative =
    !packetForcedInline &&
    !packetReadAuthorityDowngrade &&
    (requestedToolMode === "native" ||
      packetForcedNative ||
      (requestedToolMode === "auto" && toolLoopProvider !== null));
  if (tryNative) {
    nativeAdmissionDecision = "native_admitted";
    nativeAdmissionReason = undefined;
  }

  // Read packet, optionally embed inline content. Embedding is independent of
  // tool_mode — even tool-native runs benefit from packet pre-population so
  // the LLM doesn't have to re-discover the obvious targets.
  const userPrompt = await readPacketAndEmbed(
    packetPath,
    ontoHome,
    projectRoot,
    embedDomainDocs,
  );

  if (packetForcedInline) {
    process.stderr.write(
      `[onto] tool-native downgraded to inline for unit ${unitId}: packet declares Boundary Policy ${packetForcedInlineReason}. ` +
        "The packet's policy takes precedence over --tool-mode=auto.\n",
    );
  }
  if (packetForcedNative) {
    process.stderr.write(
      `[onto] inline auto-promoted to tool-native for unit ${unitId}: packet declares Boundary Policy Tools: ${
        packetPolicy.toolsRaw ?? "required"
      }. ` +
        "The packet's policy takes precedence over --tool-mode=auto. " +
        "Running inline would risk fabrication when lens outputs are path-only.\n",
    );
  }
  if (packetReadAuthorityDowngrade) {
    process.stderr.write(
      `[onto] tool-native downgraded to inline for unit ${unitId}: packet Unit Boundary Details read authority is invalid (${packetForcedInlineReason}). ` +
        "Native tools are not admitted without non-empty unit_boundary.read_authority.allowed_read_refs.\n",
    );
  }

  let outputText = "";
  let modelIdUsed: string | undefined;
  let inputTokensUsed = 0;
  let outputTokensUsed = 0;
  let toolModeUsed: ToolModeUsed = "inline";
  let toolIterations: number | undefined;
  let toolCallsExecuted: number | undefined;
  let toolBoundarySkips: ToolBoundarySkipSummary | undefined;
  let attemptedNativeToolBoundarySkips: ToolBoundarySkipSummary | undefined;
  let nativeToolContext: ToolExecutionContext | undefined;
  let nativeAttemptError: string | undefined;

  if (tryNative && toolLoopProvider) {
    const systemPrompt = buildSystemPromptToolNative(unitId, unitKind, packetPath, outputPath);
    const modelForLoop = llmPartial.model_id ?? llmPartial.models_per_provider?.[toolLoopProvider];
    if (!modelForLoop) {
      throw new Error(
        `tool-native mode requires a model id (set --model or .onto/settings.json llm.model).`,
      );
    }
    try {
      const toolContext = createReviewUnitToolExecutionContext({
        projectRoot,
        ontoHome,
        // synthesize must traverse .onto/review/<session>/round1 to discover
        // lens outputs; lens runs keep the default skip to avoid session noise.
        allowOntoTraversal: unitKind === "synthesize",
        allowedReadRefs: packetReadAuthority.refs,
      });
      nativeToolContext = toolContext;
      const loopResult = await callLlmWithTools(
        systemPrompt,
        userPrompt,
        ONTO_DEFAULT_TOOLS,
        {
          provider: toolLoopProvider,
          model_id: modelForLoop,
          max_tokens: maxTokens,
          ...(llmPartial.base_url ? { base_url: llmPartial.base_url } : {}),
          ...(llmPartial.api_key_env
            ? { api_key_env: llmPartial.api_key_env }
            : {}),
        },
        toolContext,
      );
      outputText = loopResult.text.trim();
      modelIdUsed = loopResult.model_id;
      inputTokensUsed = loopResult.input_tokens;
      outputTokensUsed = loopResult.output_tokens;
      toolIterations = loopResult.iterations;
      toolCallsExecuted = loopResult.tool_calls;
      toolBoundarySkips = loopResult.tool_boundary_skips;
      attemptedNativeToolBoundarySkips = loopResult.tool_boundary_skips;
      toolModeUsed = "native";
      // Empty final text after a tool loop usually means the model only ever
      // returned tool_use blocks and never produced a final answer (or hit
      // the iteration cap). In ordinary auto mode we downgrade to inline; when
      // the packet declares Tools: required, native execution is the boundary.
      if (outputText.length === 0) {
        if (requestedToolMode === "auto" && !packetForcedNative) {
          nativeAttemptError = `tool-native produced empty final text${
            loopResult.truncated_by_iteration_cap ? " (iteration cap hit)" : ""
          }`;
          toolModeUsed = "inline";
          toolBoundarySkips = undefined;
          nativeAdmissionDecision = "native_downgraded_inline";
          nativeAdmissionReason = nativeAttemptError;
        } else {
          throw new Error(
            `tool-native mode produced empty final text for unit ${unitId} (iterations=${loopResult.iterations}, tool_calls=${loopResult.tool_calls}).`,
          );
        }
      }
    } catch (err) {
      if (requestedToolMode === "auto" && !packetForcedNative) {
        nativeAttemptError = err instanceof Error ? err.message : String(err);
        attemptedNativeToolBoundarySkips =
          nativeToolContext !== undefined
            ? getToolBoundarySkipSummary(nativeToolContext)
            : undefined;
        toolModeUsed = "inline";
        toolIterations = undefined;
        toolCallsExecuted = undefined;
        toolBoundarySkips = undefined;
        nativeAdmissionDecision = "native_downgraded_inline";
        nativeAdmissionReason = nativeAttemptError;
      } else {
        throw err;
      }
    }
  }

  if (toolModeUsed === "inline") {
    if (nativeAttemptError) {
      process.stderr.write(
        `[onto] tool-native attempt failed (${nativeAttemptError}); downgrading to inline mode.\n`,
      );
    }
    const systemPrompt = buildSystemPromptInline(unitId, unitKind, packetPath, outputPath);
    const llmConfig: Partial<LlmCallConfig> = { ...llmPartial, max_tokens: maxTokens };
    const result = await callLlm(systemPrompt, userPrompt, llmConfig);
    outputText = result.text.trim();
    modelIdUsed = result.model_id;
    inputTokensUsed = result.input_tokens;
    outputTokensUsed = result.output_tokens;
  }

  // Defensive post-process: some models (observed on Qwen3-30B-A3B in Phase
  // 3-4 A2 bench) ignore the "Do not wrap in code fences" prompt rule and
  // emit the entire markdown answer inside a ```yaml or ```markdown block.
  // Strip a single outer wrapping fence pair if present; leave inner code
  // blocks and well-formed markdown untouched. See strip-wrapping-code-fence.ts.
  outputText = stripWrappingCodeFence(outputText);

  if (outputText.length === 0) {
    throw new Error(
      `Inline-HTTP executor produced empty output for unit ${unitId} (provider: ${cliOverrides.provider ?? "auto"}, tool_mode: ${toolModeUsed}).`,
    );
  }

  // Write output file.
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${outputText}\n`, "utf8");

  // A5 citation audit — post-flight fabrication detector for synthesize units.
  // Parses the packet's runtime participating lens output section when present,
  // falls back to the planned section, reads each file, and checks whether
  // every significant quoted string in the output exists in at least one lens.
  // Warning-only: never fails the executor. Wrapped in try/catch so parser or
  // filesystem errors never escape the audit layer.
  const minQuoteLengthRaw = values["min-quote-length"];
  let minQuoteLength: number | undefined;
  if (typeof minQuoteLengthRaw === "string" && minQuoteLengthRaw.length > 0) {
    const parsed = Number.parseInt(minQuoteLengthRaw, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      minQuoteLength = parsed;
    } else {
      throw new Error(
        `Invalid --min-quote-length value: ${String(minQuoteLengthRaw)} (expected a positive integer).`,
      );
    }
  }

  let citationAudit: CitationAuditResult | undefined;
  if (unitKind === "synthesize") {
    try {
      citationAudit = await runCitationAudit(
        rawPacketText,
        outputText,
        projectRoot,
        sessionRoot,
        ontoHome,
        unitId,
        outputPath,
        packetReadAuthority,
        minQuoteLength,
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `[onto] citation audit skipped for unit ${unitId}: ${reason}\n`,
      );
      citationAudit = skippedCitationAudit({
        reason,
        minQuoteLength,
      });
    }
  }

  const executorResult: ExecutorResult = {
    unit_id: unitId,
    unit_kind: unitKind,
    packet_path: packetPath,
    output_path: outputPath,
    realization: "ts_inline_http",
    host_runtime: deriveHostRuntime(llmPartial.provider),
    tool_mode: toolModeUsed,
    input_tokens: inputTokensUsed,
    output_tokens: outputTokensUsed,
    ...(modelIdUsed !== undefined ? { model_id: modelIdUsed } : {}),
    ...(toolIterations !== undefined ? { tool_iterations: toolIterations } : {}),
    ...(toolCallsExecuted !== undefined ? { tool_calls: toolCallsExecuted } : {}),
    ...(toolBoundarySkips !== undefined ? { tool_boundary_skips: toolBoundarySkips } : {}),
    ...(packetForcedInline ? { packet_policy_downgrade: true } : {}),
    ...(packetForcedNative ? { packet_policy_promotion: true } : {}),
    native_admission: {
      requested_tool_mode: requestedToolMode,
      effective_tool_mode: toolModeUsed,
      decision: nativeAdmissionDecision,
      ...(nativeAdmissionReason ? { reason: nativeAdmissionReason } : {}),
      allowed_read_refs_count: packetReadAuthority.refs.length,
      read_authority_declared: packetReadAuthority.declared,
      read_authority_malformed: packetReadAuthority.malformed,
      ...(readAuthorityFailure ? { read_authority_failure: readAuthorityFailure } : {}),
      ...(attemptedNativeToolBoundarySkips !== undefined
        ? {
            attempted_native_tool_boundary_skips:
              attemptedNativeToolBoundarySkips,
          }
        : {}),
    },
    ...(citationAudit !== undefined ? { citation_audit: citationAudit } : {}),
  };

  console.log(JSON.stringify(executorResult, null, 2));
  return 0;
}

/**
 * A5 citation audit helper. Reads the lens output files referenced in the
 * packet's runtime or planned participating lens output section, runs the
 * audit against the synthesize output text, and emits a STDERR warning if any
 * quoted strings in the synthesize output don't substring-match any lens.
 *
   * Returns the audit result (undefined only when the packet has no participating
   * paths). When the packet references lens paths but the audit cannot build a
   * trustworthy lens pool or boundary authority, returns `status=skipped`.
   */
async function runCitationAudit(
  rawPacketText: string,
  outputText: string,
  projectRoot: string,
  sessionRoot: string,
  ontoHome: string,
  unitId: string,
  outputPath: string,
  authority: ReturnType<typeof parsePacketAllowedReadAuthority>,
  minQuoteLength?: number,
): Promise<CitationAuditResult | undefined> {
  const participating = parseParticipatingLensPaths(rawPacketText);
  if (participating.length === 0) return undefined;
  const readAuthorityFailure =
    describeReadAuthorityFailure(authority) ??
    describeBoundaryDetailsMismatch({
      authority,
      projectRoot,
      unitId,
      outputPath,
    });
  if (readAuthorityFailure) {
    const reason = `invalid Unit Boundary Details for citation audit: ${readAuthorityFailure}`;
    process.stderr.write(`[onto] citation audit skipped for unit ${unitId}: ${reason}\n`);
    return skippedCitationAudit({
      reason,
      minQuoteLength,
    });
  }

  const lensContents: string[] = [];
  const unreadable: string[] = [];
  const allowedRoots = [
    path.resolve(projectRoot),
    path.resolve(sessionRoot),
    path.resolve(ontoHome),
  ];
  const resolvedAllowedReadRefs: string[] = [];
  for (const ref of authority.refs) {
    try {
      resolvedAllowedReadRefs.push(
        await resolveCitationAuditAllowedReadRef({
          ref,
          projectRoot,
          sessionRoot,
          ontoHome,
        }),
      );
    } catch {
      // Missing refs are attributed per participating lens path below so one
      // stale allowed_read_refs entry cannot downgrade the whole audit.
    }
  }
  for (const { lensId, path: lensPath } of participating) {
    const absPath = path.isAbsolute(lensPath)
      ? lensPath
      : path.resolve(projectRoot, lensPath);
    let realLensPath: string | null = null;
    let pathInsideAllowedRoot = false;
    let realpathFailed = false;
    for (const allowedRoot of allowedRoots) {
      try {
        await assertPathInsideRoot({
          root: allowedRoot,
          candidate: absPath,
          label: `citation audit lens path ${lensId}`,
        });
        pathInsideAllowedRoot = true;
        try {
          realLensPath = await fs.realpath(absPath);
        } catch {
          realpathFailed = true;
          break;
        }
        break;
      } catch {
        // Try the next allowed root before declaring the path unreadable.
        realLensPath = null;
      }
    }
    if (realLensPath === null) {
      const reason =
        pathInsideAllowedRoot && realpathFailed
          ? "unreadable or missing"
          : "outside allowed root";
      unreadable.push(`${lensId} (${lensPath}: ${reason})`);
      continue;
    }
    if (
      !resolvedAllowedReadRefs.some((allowedRef) =>
        isPathUnder(realLensPath, allowedRef),
      )
    ) {
      unreadable.push(`${lensId} (${lensPath}: outside allowed_read_refs)`);
      continue;
    }
    try {
      const content = await fs.readFile(realLensPath, "utf8");
      lensContents.push(content);
    } catch {
      unreadable.push(`${lensId} (${lensPath})`);
    }
  }

  if (lensContents.length === 0) {
    // No lens file readable — don't audit against an empty pool (every quote
    // would trivially be unmatched, producing noise). Surface the state.
    process.stderr.write(
      `[onto] citation audit skipped for unit ${unitId}: no lens outputs readable (${unreadable.length}/${participating.length} failed). ` +
        "Audit requires at least one readable lens for meaningful detection. " +
        `Failed refs: ${unreadable.join(", ")}.\n`,
    );
    return skippedCitationAudit({
      reason: `no lens outputs readable (${unreadable.length}/${participating.length} failed)`,
      failedRefs: unreadable,
      minQuoteLength,
    });
  }

  const auditOptions =
    typeof minQuoteLength === "number" ? { minQuoteLength } : undefined;
  const result = auditCitations(outputText, lensContents, auditOptions);

  if (unreadable.length > 0) {
    process.stderr.write(
      `[onto] citation audit partial for unit ${unitId}: ${unreadable.length}/${participating.length} lens file(s) unreadable (${unreadable.join(", ")}). ` +
        "Remaining lens files used as audit pool.\n",
    );
    result.coverage_status = "partial";
    result.failed_refs = unreadable;
  }
  if (result.quotes_unmatched.length > 0) {
    const sample = result.quotes_unmatched
      .slice(0, 3)
      .map((q) => JSON.stringify(q.length > 80 ? `${q.slice(0, 77)}...` : q))
      .join(", ");
    process.stderr.write(
      `[onto] citation audit WARNING for unit ${unitId}: ${result.quotes_unmatched.length} attribution-style quote(s) in synthesize output not found in any lens. ` +
        `This may indicate fabrication. Sample: ${sample}. ` +
        "See citation_audit.quotes_unmatched in the result JSON for the full list.\n",
    );
  }
  if (result.quotes_unmatched_meta.length > 0) {
    process.stderr.write(
      `[onto] citation audit advisory for unit ${unitId}: ${result.quotes_unmatched_meta.length} non-attribution quote(s) in synthesize output not found in any lens. ` +
        "These may be taxonomy labels or paraphrased references — advisory only, not a fabrication warning. " +
        "See citation_audit.quotes_unmatched_meta in the result JSON.\n",
    );
  }

  return result;
}

function skippedCitationAudit(args: {
  reason: string;
  failedRefs?: string[] | undefined;
  minQuoteLength?: number | undefined;
}): CitationAuditResult {
  return {
    status: "skipped",
    coverage_status: "none",
    quotes_checked: 0,
    quotes_unmatched: [],
    quotes_unmatched_meta: [],
    attribution_count: 0,
    min_quote_length: args.minQuoteLength ?? DEFAULT_MIN_QUOTE_LENGTH,
    skip_reason: args.reason,
    failed_refs: args.failedRefs ?? [],
  };
}

async function main(): Promise<number> {
  return runInlineHttpReviewUnitExecutorCli(process.argv.slice(2));
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
