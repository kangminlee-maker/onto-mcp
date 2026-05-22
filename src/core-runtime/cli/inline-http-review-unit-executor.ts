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
 * # Inline content mode (Phase 2 design decision)
 *
 * A direct HTTP LLM call has no host tools available. Therefore the executor
 * must inline all needed context into the prompt:
 *
 * - Materialized input (target content): already inline in the prompt packet
 * - Domain documents: NOT inlined by default — packet only references them
 * - Learning context: already inline in the prompt packet
 *
 * Phase 2 inline embedding is **opt-in** via `--embed-domain-docs` flag.
 * When enabled, domain doc references in the packet are expanded into inline
 * content. When disabled, the executor warns that the LLM may produce
 * "domain doc not accessible" notes — acceptable for first-pass exploration
 * but not for production review.
 *
 * # Tool model
 *
 * No tools are made available to the LLM. The LLM produces a single
 * completion that is the lens output markdown. No iterative tool-calling
 * loop (deferred to Phase 3 if needed).
 *
 * # Provider selection
 *
 * Reuses `learning/shared/llm-caller.ts` resolution:
 *   1. --provider flag (caller-explicit)
 *   2. `.onto/settings.json` `llm` switcher
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
  resolveLearningProviderConfig,
  type LlmCallConfig,
  type LearningProviderConfigInputs,
  type LearningProviderCliOverrides,
} from "../learning/shared/llm-caller.js";
import {
  callLlmWithTools,
  type ToolLoopProvider,
} from "../learning/shared/llm-tool-loop.js";
import { ONTO_DEFAULT_TOOLS } from "./onto-tools.js";
import { embedInlineContext } from "../review/inline-context-embedder.js";
import { parsePacketBoundaryPolicy } from "../review/packet-boundary-policy.js";
import { parseParticipatingLensPaths } from "../review/participating-lens-paths.js";
import { auditCitations, type CitationAuditResult } from "../review/citation-audit.js";
import {
  assertNoUnsupportedConfigFiles,
  projectSettingsPath,
} from "../discovery/settings-chain.js";
import { stripWrappingCodeFence } from "./strip-wrapping-code-fence.js";

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
  return `You are the synthesize actor for a 9-lens review. You are a ContextIsolatedReasoningUnit.

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
  return `You are the synthesize actor for a 9-lens review. You are a ContextIsolatedReasoningUnit.

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
- Lens outputs live under \`.onto/review/<session>/round1/<lens>.md\`. The packet's "Participating Lens Outputs" section lists the exact paths — call read_file on those paths to read each lens's findings.
- The controlled lens deliberation result lives at the packet's "Controlled Lens Deliberation Result" path — call read_file on that path before classifying disagreements.
- The materialized input (the actual review target) is also referenced in the packet — read_file it whenever you need to verify a contested claim against the source.
- For synthesize, .onto traversal IS allowed (unlike lens runs) so list_directory and search_content work under .onto/review.

Your job:
- Read every Participating Lens Output via read_file. Do not skip any successful lens.
- Read the Controlled Lens Deliberation Result via read_file.
- Classify findings: Consensus, Conditional Consensus, Disagreement, Unique Finding Tagging.
- Do not perform deliberation yourself. Controlled lens deliberation already produced the authoritative resolution or unresolved-disagreement record.
- Integrate Axiology proposed perspectives without erasing lens-level evidence.
- Write a comprehensive Final Review Result section grounded in the full artifact set.

Rules:
- Treat the prompt packet (in the user message) as the authoritative contract.
- Treat the Boundary Policy and Effective Boundary State in the packet as hard constraints.
- Every required output section in the packet is MANDATORY. Do not rename, merge, or omit required headings — write "(none)" if a section has no content.
- Preserve lens-level evidence — never paraphrase a lens away from its citation.
- Set deliberation_status in the YAML frontmatter to "performed".
- Produce ONLY the final markdown content for the canonical output path.
- Do not add commentary before or after the markdown.
- If a lens output file is missing or unreadable via read_file, list it under Degraded Lens Failures rather than fabricating its findings.`;
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
   * Boundary Policy Filesystem: denied forced inline. Surface as audit signal
   * so cost dashboards can correlate packet policy with executor tier.
   */
  packet_policy_downgrade?: boolean;
  /**
   * True when the caller requested auto mode but the packet's Boundary Policy
   * Tools: required forced tool-native promotion. Mirror of
   * `packet_policy_downgrade` for the opposite direction (A4).
   */
  packet_policy_promotion?: boolean;
  /**
   * Post-flight citation audit (A5). Present only for synthesize units whose
   * packet declares Participating Lens Outputs that resolve to readable files.
   * `quotes_unmatched` lists suspected fabrications — WARNING ONLY, the
   * executor never fails on audit findings alone.
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

async function loadOntoConfig(projectRoot: string): Promise<LearningProviderConfigInputs> {
  await assertNoUnsupportedConfigFiles(projectRoot);
  const configPath = projectSettingsPath(projectRoot);
  try {
    const parsed = JSON.parse(await fs.readFile(configPath, "utf8"));
    if (parsed && typeof parsed === "object") {
      return parsed as LearningProviderConfigInputs;
    }
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  return {};
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
  const cliOverrides: LearningProviderCliOverrides = {};
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
  if (typeof values.model === "string") {
    cliOverrides.model = values.model;
  }
  if (typeof values["reasoning-effort"] === "string") {
    cliOverrides.reasoning_effort = values["reasoning-effort"];
  }

  const llmPartial = resolveLearningProviderConfig({
    config: ontoConfig,
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

  // A1 precedence rule: packet-declared Filesystem: denied forbids tool-native
  // mode regardless of CLI flag, because the packet is the authoritative
  // contract for this unit. If the caller explicitly asked for native, surface
  // the conflict as a fail-fast precondition error (rather than silently
  // changing the requested mode). Otherwise (auto), downgrade to inline and
  // emit a one-time STDERR notice so operators can see why the tier changed.
  let packetForcedInline = false;
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

  const tryNative =
    !packetForcedInline &&
    (requestedToolMode === "native" ||
      packetForcedNative ||
      (requestedToolMode === "auto" && toolLoopProvider !== null));

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
      `[onto] tool-native downgraded to inline for unit ${unitId}: packet declares Boundary Policy Filesystem: ${
        packetPolicy.filesystemRaw ?? "denied"
      }. ` +
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

  let outputText = "";
  let modelIdUsed: string | undefined;
  let inputTokensUsed = 0;
  let outputTokensUsed = 0;
  let toolModeUsed: ToolModeUsed = "inline";
  let toolIterations: number | undefined;
  let toolCallsExecuted: number | undefined;
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
      const loopResult = await callLlmWithTools(
        systemPrompt,
        userPrompt,
        ONTO_DEFAULT_TOOLS,
        {
          provider: toolLoopProvider,
          model_id: modelForLoop,
          max_tokens: maxTokens,
          ...(llmPartial.base_url ? { base_url: llmPartial.base_url } : {}),
        },
        {
          projectRoot,
          ontoHome,
          // synthesize must traverse .onto/review/<session>/round1 to discover
          // lens outputs; lens runs keep the default skip to avoid session noise.
          allowOntoTraversal: unitKind === "synthesize",
        },
      );
      outputText = loopResult.text.trim();
      modelIdUsed = loopResult.model_id;
      inputTokensUsed = loopResult.input_tokens;
      outputTokensUsed = loopResult.output_tokens;
      toolIterations = loopResult.iterations;
      toolCallsExecuted = loopResult.tool_calls;
      toolModeUsed = "native";
      // Empty final text after a tool loop usually means the model only ever
      // returned tool_use blocks and never produced a final answer (or hit
      // the iteration cap). In auto mode we fall back to inline; in native
      // mode we surface the failure.
      if (outputText.length === 0) {
        if (requestedToolMode === "auto") {
          nativeAttemptError = `tool-native produced empty final text${
            loopResult.truncated_by_iteration_cap ? " (iteration cap hit)" : ""
          }`;
          toolModeUsed = "inline";
        } else {
          throw new Error(
            `tool-native mode produced empty final text for unit ${unitId} (iterations=${loopResult.iterations}, tool_calls=${loopResult.tool_calls}).`,
          );
        }
      }
    } catch (err) {
      if (requestedToolMode === "auto") {
        nativeAttemptError = err instanceof Error ? err.message : String(err);
        toolModeUsed = "inline";
        toolIterations = undefined;
        toolCallsExecuted = undefined;
      } else {
        throw err;
      }
    }
  }

  if (toolModeUsed === "inline") {
    if (nativeAttemptError) {
      process.stderr.write(
        `[onto] tool-native attempt failed (${nativeAttemptError}); falling back to inline mode.\n`,
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
  // Parses the packet's Participating Lens Outputs section, reads each file,
  // and checks whether every significant quoted string in the output exists
  // in at least one lens. Warning-only: never fails the executor. Wrapped in
  // try/catch so parser or filesystem errors never escape the audit layer.
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
        unitId,
        minQuoteLength,
      );
    } catch (err) {
      process.stderr.write(
        `[onto] citation audit skipped for unit ${unitId}: ${
          err instanceof Error ? err.message : String(err)
        }\n`,
      );
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
    ...(packetForcedInline ? { packet_policy_downgrade: true } : {}),
    ...(packetForcedNative ? { packet_policy_promotion: true } : {}),
    ...(citationAudit !== undefined ? { citation_audit: citationAudit } : {}),
  };

  console.log(JSON.stringify(executorResult, null, 2));
  return 0;
}

/**
 * A5 citation audit helper. Reads the lens output files referenced in the
 * packet's Participating Lens Outputs section, runs the audit against the
 * synthesize output text, and emits a STDERR warning if any quoted strings
 * in the synthesize output don't substring-match any lens.
 *
 * Returns the audit result (undefined when the packet has no participating
 * paths, or when no lens file could be read — audit requires at least one
 * readable lens pool to be meaningful).
 */
async function runCitationAudit(
  rawPacketText: string,
  outputText: string,
  projectRoot: string,
  unitId: string,
  minQuoteLength?: number,
): Promise<CitationAuditResult | undefined> {
  const participating = parseParticipatingLensPaths(rawPacketText);
  if (participating.length === 0) return undefined;

  const lensContents: string[] = [];
  const unreadable: string[] = [];
  for (const { lensId, path: lensPath } of participating) {
    const absPath = path.isAbsolute(lensPath)
      ? lensPath
      : path.resolve(projectRoot, lensPath);
    try {
      const content = await fs.readFile(absPath, "utf8");
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
        "Audit requires at least one readable lens for meaningful detection.\n",
    );
    return undefined;
  }

  const auditOptions =
    typeof minQuoteLength === "number" ? { minQuoteLength } : undefined;
  const result = auditCitations(outputText, lensContents, auditOptions);

  if (unreadable.length > 0) {
    process.stderr.write(
      `[onto] citation audit partial for unit ${unitId}: ${unreadable.length}/${participating.length} lens file(s) unreadable (${unreadable.join(", ")}). ` +
        "Remaining lens files used as audit pool.\n",
    );
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
