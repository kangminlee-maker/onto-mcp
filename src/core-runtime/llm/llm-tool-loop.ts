/**
 * LLM tool-calling loop — Phase 3-2 of host runtime decoupling.
 *
 * # What this module is
 *
 * A multi-turn driver that lets an LLM iteratively call onto-defined tools
 * (`read_file`, `list_directory`, `search_content`) before producing its
 * final answer. The driver speaks both Anthropic Messages API and OpenAI
 * Chat Completions API tool-calling protocols, normalizing them under a
 * single TS interface.
 *
 * # Why it exists
 *
 * The single-turn `callLlm()` in llm-caller.ts forces all context into the
 * initial prompt (Tier 2 inline-content mode). For function-calling-capable
 * models, it's far more token-efficient to expose a small read-only API and
 * let the model fetch what it needs (Tier 1 tool-native mode). This driver
 * implements that loop while keeping the tool definitions, boundary
 * enforcement, and provider transport in three separate seats.
 *
 * # How it relates
 *
 * - `onto-tools.ts` owns the tool definitions and boundary-checked execution.
 * - This module owns provider-format adaptation and the tool-result feedback
 *   loop. It does NOT enforce boundaries — those live in the tool itself, so
 *   any future executor that calls a tool gets the same guarantees.
 * - `inline-http-review-unit-executor.ts` is the caller: it picks tool_mode
 *   (native | inline | auto) and either invokes this driver (native/auto) or
 *   calls single-turn `callLlm()` for inline mode.
 *
 * # Provider-format differences (the part that matters)
 *
 * Anthropic Messages API:
 *   request.tools = [{ name, description, input_schema }]
 *   response.content = [{ type: "tool_use", id, name, input }, ...]
 *   tool result is fed back as a user message:
 *     { role: "user", content: [{ type: "tool_result", tool_use_id, content }] }
 *
 * OpenAI Chat Completions:
 *   request.tools = [{ type: "function", function: { name, description, parameters } }]
 *   response.message.tool_calls = [{ id, type: "function", function: { name, arguments } }]
 *   tool result is fed back as a tool message:
 *     { role: "tool", tool_call_id, content }
 *   arguments are stringified JSON; we parse before dispatching.
 *
 * Both providers signal "no more tool calls, here is the final answer" by
 * returning normal text content / message.content with no tool_calls. The
 * loop terminates when that happens (or when MAX_ITERATIONS is reached as
 * a runaway-safety brake).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  type OntoTool,
  type ToolBoundarySkipSummary,
  type ToolExecutionContext,
  BoundaryViolationError,
  findToolByName,
  getToolBoundarySkipSummary,
} from "../cli/onto-tools.js";
import {
  DEFAULT_GROK_BASE_URL,
  DEFAULT_LMSTUDIO_BASE_URL,
} from "./model-switcher.js";
import {
  appendRuntimeModelCallLogFromCurrentContext,
} from "../observability/runtime-stream-observation.js";
import {
  callReviewMockLlmWithTools,
  isReviewMockLlmRealizationEnabled,
} from "./mock-llm-realization.js";
import type { ReviewArtifactGenerationRealization } from "../review/artifact-types.js";

const MAX_ITERATIONS = 12;
const MAX_TOKENS_PER_TURN = 4096;

/**
 * Model-call observability — mirrors `emitModelCallLog` in llm-caller.ts.
 * Duplicated here to avoid a cyclic import (llm-caller imports nothing from
 * this loop module, and this loop module is the companion seat for the
 * `callLlmWithTools` entry point). Review Recovery PR-1 (R5) extends the
 * `[model-call]` prefix coverage to both tool-native and inline paths.
 */
function emitModelCallLog(line: string): void {
  process.stderr.write(`[model-call] ${line}\n`);
  appendRuntimeModelCallLogFromCurrentContext(line);
}

export type ToolLoopProvider = "anthropic" | "openai" | "grok" | "lmstudio";

export interface ToolLoopConfig {
  provider: ToolLoopProvider;
  model_id: string;
  max_tokens?: number;
  /** OpenAI-compatible reasoning effort. Unsupported providers fail loudly. */
  reasoning_effort?: string;
  /** Optional provider API-key environment variable override. */
  api_key_env?: string;
  /** For OpenAI-style endpoints. */
  base_url?: string;
  /** Override iteration cap (default 12). */
  max_iterations?: number;
  artifact_generation_realization?: ReviewArtifactGenerationRealization;
}

function readEnvApiKey(names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

function readCodexOpenAiApiKey(): string | null {
  const codexAuthPath = path.join(os.homedir(), ".codex", "auth.json");
  if (!fs.existsSync(codexAuthPath)) return null;
  try {
    const auth = JSON.parse(fs.readFileSync(codexAuthPath, "utf8")) as unknown;
    if (!auth || typeof auth !== "object" || Array.isArray(auth)) return null;
    const value = (auth as Record<string, unknown>).OPENAI_API_KEY;
    return typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : null;
  } catch {
    return null;
  }
}

function missingToolLoopCredentialError(
  provider: ToolLoopProvider,
  configuredEnv?: string,
): string {
  if (provider === "openai") {
    return configuredEnv
      ? `callLlmWithTools(openai) requires ${configuredEnv}`
      : "callLlmWithTools(openai) requires OPENAI_API_KEY or ~/.codex/auth.json OPENAI_API_KEY";
  }
  if (configuredEnv) {
    return `callLlmWithTools(${provider}) requires ${configuredEnv}`;
  }
  if (provider === "grok") {
    return "callLlmWithTools(grok) requires XAI_API_KEY or GROK_API_KEY";
  }
  if (provider === "lmstudio") {
    return "callLlmWithTools(lmstudio) requires configured local auth or api_key_env";
  }
  return `callLlmWithTools(${provider}) requires ${provider.toUpperCase()}_API_KEY`;
}

function unsupportedToolLoopEffortError(provider: ToolLoopProvider): Error {
  return new Error(
    `callLlmWithTools(${provider}) cannot honor reasoning_effort; remove effort from this actor or switch to provider=openai.`,
  );
}

export interface ToolLoopResult {
  /** The final assistant text after the model declined to call more tools. */
  text: string;
  /** Number of tool-calling rounds that actually executed. */
  iterations: number;
  /** Total tool invocations across all rounds. */
  tool_calls: number;
  input_tokens: number;
  output_tokens: number;
  model_id: string;
  artifact_generation_realization?: ReviewArtifactGenerationRealization;
  /** True if the loop hit MAX_ITERATIONS without the model producing a final answer. */
  truncated_by_iteration_cap: boolean;
  /** Aggregated boundary skip telemetry from tool execution, when non-zero. */
  tool_boundary_skips?: ToolBoundarySkipSummary;
}

function withToolDiagnostics(
  result: Omit<ToolLoopResult, "tool_boundary_skips">,
  toolCtx: ToolExecutionContext,
): ToolLoopResult {
  const toolBoundarySkips = getToolBoundarySkipSummary(toolCtx);
  return toolBoundarySkips
    ? { ...result, tool_boundary_skips: toolBoundarySkips }
    : result;
}

/**
 * Run a tool-calling conversation until the model produces a final text
 * answer or the iteration cap is reached.
 */
export async function callLlmWithTools(
  systemPrompt: string,
  userPrompt: string,
  tools: OntoTool[],
  config: ToolLoopConfig,
  toolCtx: ToolExecutionContext,
): Promise<ToolLoopResult> {
  if (
    isReviewMockLlmRealizationEnabled() &&
    config.artifact_generation_realization !== "semantic_mock"
  ) {
    throw new Error(
      "ONTO_LLM_MOCK requires review.execution.artifact_generation_realization=semantic_mock.",
    );
  }
  if (
    isReviewMockLlmRealizationEnabled() ||
    config.artifact_generation_realization === "semantic_mock"
  ) {
    return callReviewMockLlmWithTools(systemPrompt, userPrompt, tools, config, toolCtx);
  }

  if (config.provider === "anthropic") {
    return runAnthropicToolLoop(systemPrompt, userPrompt, tools, config, toolCtx);
  }
  return runOpenAIToolLoop(systemPrompt, userPrompt, tools, config, toolCtx);
}

// ---------------------------------------------------------------------------
// Anthropic loop
// ---------------------------------------------------------------------------

interface AnthropicMessage {
  role: "user" | "assistant";
  content: AnthropicContentBlock[] | string;
}

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | {
      type: "tool_result";
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    };

async function runAnthropicToolLoop(
  systemPrompt: string,
  userPrompt: string,
  tools: OntoTool[],
  config: ToolLoopConfig,
  toolCtx: ToolExecutionContext,
): Promise<ToolLoopResult> {
  if (config.reasoning_effort) {
    throw unsupportedToolLoopEffortError("anthropic");
  }
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const apiKey = readEnvApiKey(
    config.api_key_env ? [config.api_key_env] : ["ANTHROPIC_API_KEY"],
  );
  if (!apiKey) {
    throw new Error(missingToolLoopCredentialError("anthropic", config.api_key_env));
  }
  const client = new Anthropic({ apiKey });

  const anthropicTools = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));

  const messages: AnthropicMessage[] = [
    { role: "user", content: userPrompt },
  ];

  let totalIn = 0;
  let totalOut = 0;
  let toolCallCount = 0;
  const cap = config.max_iterations ?? MAX_ITERATIONS;
  let truncated = false;
  let finalText = "";

  for (let iteration = 0; iteration < cap; iteration++) {
    emitModelCallLog(
      `anthropic tool-loop call: model="${config.model_id}" iteration=${iteration + 1}/${cap} max_tokens=${config.max_tokens ?? MAX_TOKENS_PER_TURN} tool_count=${anthropicTools.length}`,
    );
    let response;
    try {
      response = await client.messages.create({
        model: config.model_id,
        max_tokens: config.max_tokens ?? MAX_TOKENS_PER_TURN,
        system: systemPrompt,
        tools: anthropicTools,
        messages: messages as never,
      });
    } catch (err) {
      const e = err as {
        status?: number;
        name?: string;
        message?: string;
        error?: { type?: string; message?: string };
        request_id?: string;
      };
      emitModelCallLog(
        `anthropic tool-loop call FAILED: model="${config.model_id}" iteration=${iteration + 1} status=${e.status ?? "?"} type=${e.error?.type ?? e.name ?? "?"} message="${e.error?.message ?? e.message ?? String(err)}" request_id=${e.request_id ?? "?"}`,
      );
      throw err;
    }
    totalIn += response.usage.input_tokens;
    totalOut += response.usage.output_tokens;
    emitModelCallLog(
      `anthropic tool-loop response: model_id=${response.model ?? config.model_id} iteration=${iteration + 1} stop_reason=${response.stop_reason ?? "?"} input_tokens=${response.usage.input_tokens} output_tokens=${response.usage.output_tokens}`,
    );

    const blocks = response.content as AnthropicContentBlock[];
    const assistantBlocks: AnthropicContentBlock[] = [];
    const toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
    for (const block of blocks) {
      assistantBlocks.push(block);
      if (block.type === "tool_use") {
        toolUses.push({ id: block.id, name: block.name, input: block.input });
      }
    }
    messages.push({ role: "assistant", content: assistantBlocks });

    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      finalText = blocks
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      return withToolDiagnostics({
        text: finalText.trim(),
        iterations: iteration + 1,
        tool_calls: toolCallCount,
        input_tokens: totalIn,
        output_tokens: totalOut,
        model_id: config.model_id,
        truncated_by_iteration_cap: false,
      }, toolCtx);
    }

    const resultBlocks: AnthropicContentBlock[] = [];
    for (const use of toolUses) {
      toolCallCount++;
      const result = await executeOneTool(tools, use.name, use.input, toolCtx);
      resultBlocks.push({
        type: "tool_result",
        tool_use_id: use.id,
        content: result.text,
        ...(result.isError ? { is_error: true } : {}),
      });
    }
    messages.push({ role: "user", content: resultBlocks });
  }

  truncated = true;
  return withToolDiagnostics({
    text: finalText.trim(),
    iterations: cap,
    tool_calls: toolCallCount,
    input_tokens: totalIn,
    output_tokens: totalOut,
    model_id: config.model_id,
    truncated_by_iteration_cap: truncated,
  }, toolCtx);
}

// ---------------------------------------------------------------------------
// OpenAI-style loop
// ---------------------------------------------------------------------------

interface OpenAIChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

async function runOpenAIToolLoop(
  systemPrompt: string,
  userPrompt: string,
  tools: OntoTool[],
  config: ToolLoopConfig,
  toolCtx: ToolExecutionContext,
): Promise<ToolLoopResult> {
  if (
    config.reasoning_effort &&
    (config.provider === "grok" || config.provider === "lmstudio")
  ) {
    throw unsupportedToolLoopEffortError(config.provider);
  }
  const { default: OpenAI } = await import("openai");
  const baseURL =
    config.base_url ??
    (config.provider === "grok"
      ? DEFAULT_GROK_BASE_URL
      : config.provider === "lmstudio"
        ? process.env.LMSTUDIO_BASE_URL ?? DEFAULT_LMSTUDIO_BASE_URL
        : undefined);
  const apiKey =
    config.provider === "openai"
      ? config.api_key_env
        ? readEnvApiKey([config.api_key_env])
        : readEnvApiKey(["OPENAI_API_KEY"]) ?? readCodexOpenAiApiKey()
      : config.provider === "grok"
        ? readEnvApiKey(
            config.api_key_env ? [config.api_key_env] : ["XAI_API_KEY", "GROK_API_KEY"],
          )
        : config.provider === "lmstudio"
          ? "lmstudio-local"
          : readEnvApiKey(["OPENAI_API_KEY"]);
  if (!apiKey) {
    throw new Error(missingToolLoopCredentialError(config.provider, config.api_key_env));
  }
  const client = new OpenAI({ apiKey, baseURL });

  const openaiTools = tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));

  const messages: OpenAIChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  let totalIn = 0;
  let totalOut = 0;
  let toolCallCount = 0;
  const cap = config.max_iterations ?? MAX_ITERATIONS;
  let finalText = "";

  for (let iteration = 0; iteration < cap; iteration++) {
    emitModelCallLog(
      `${config.provider} tool-loop call: model="${config.model_id}" iteration=${iteration + 1}/${cap} max_tokens=${config.max_tokens ?? MAX_TOKENS_PER_TURN} effort=${config.reasoning_effort ?? "(unset)"} tool_count=${openaiTools.length}${baseURL ? ` base_url=${baseURL}` : ""}`,
    );
    let response;
    try {
      response = await client.chat.completions.create({
        model: config.model_id,
        max_tokens: config.max_tokens ?? MAX_TOKENS_PER_TURN,
        ...(config.reasoning_effort
          ? { reasoning_effort: config.reasoning_effort }
          : {}),
        messages: messages as never,
        tools: openaiTools,
      } as never);
    } catch (err) {
      const e = err as {
        status?: number;
        name?: string;
        message?: string;
        error?: { type?: string; message?: string };
        request_id?: string;
      };
      emitModelCallLog(
        `${config.provider} tool-loop call FAILED: model="${config.model_id}" iteration=${iteration + 1} status=${e.status ?? "?"} type=${e.error?.type ?? e.name ?? "?"} message="${e.error?.message ?? e.message ?? String(err)}" request_id=${e.request_id ?? "?"}`,
      );
      throw err;
    }
    totalIn += response.usage?.prompt_tokens ?? 0;
    totalOut += response.usage?.completion_tokens ?? 0;
    emitModelCallLog(
      `${config.provider} tool-loop response: model_id=${response.model ?? config.model_id} iteration=${iteration + 1} finish_reason=${response.choices[0]?.finish_reason ?? "?"} input_tokens=${response.usage?.prompt_tokens ?? 0} output_tokens=${response.usage?.completion_tokens ?? 0}`,
    );

    const choice = response.choices[0];
    if (!choice) {
      throw new Error("OpenAI tool loop: response had no choices");
    }
    const message = choice.message;
    // OpenAI SDK types tool_calls as a union of function calls and custom
    // calls (tool-use API). onto only emits function tools, so we narrow
    // here and silently skip any custom calls the LLM might invent — they
    // would have nowhere to dispatch.
    const rawCalls = message.tool_calls ?? [];
    const toolCalls = rawCalls.filter(
      (c): c is Extract<typeof c, { type: "function"; function: { name: string; arguments: string } }> =>
        c.type === "function",
    );

    // Push assistant turn (with or without tool_calls).
    const assistantMsg: OpenAIChatMessage = {
      role: "assistant",
      content: message.content ?? null,
    };
    if (toolCalls.length > 0) {
      assistantMsg.tool_calls = toolCalls.map((c) => ({
        id: c.id,
        type: "function",
        function: { name: c.function.name, arguments: c.function.arguments },
      }));
    }
    messages.push(assistantMsg);

    if (toolCalls.length === 0 || choice.finish_reason !== "tool_calls") {
      finalText = message.content ?? "";
      return withToolDiagnostics({
        text: finalText.trim(),
        iterations: iteration + 1,
        tool_calls: toolCallCount,
        input_tokens: totalIn,
        output_tokens: totalOut,
        model_id: config.model_id,
        truncated_by_iteration_cap: false,
      }, toolCtx);
    }

    for (const call of toolCalls) {
      toolCallCount++;
      let parsedArgs: Record<string, unknown>;
      try {
        parsedArgs = JSON.parse(call.function.arguments) as Record<string, unknown>;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: `error: arguments JSON parse failed — ${msg}`,
        });
        continue;
      }
      const result = await executeOneTool(tools, call.function.name, parsedArgs, toolCtx);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: result.text,
      });
    }
  }

  return withToolDiagnostics({
    text: finalText.trim(),
    iterations: cap,
    tool_calls: toolCallCount,
    input_tokens: totalIn,
    output_tokens: totalOut,
    model_id: config.model_id,
    truncated_by_iteration_cap: true,
  }, toolCtx);
}

// ---------------------------------------------------------------------------
// Shared tool dispatch
// ---------------------------------------------------------------------------

async function executeOneTool(
  tools: OntoTool[],
  name: string,
  input: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<{ text: string; isError: boolean }> {
  const tool = tools.find((t) => t.name === name) ?? findToolByName(name);
  if (!tool) {
    return {
      text: `error: tool "${name}" is not registered. Available: ${tools.map((t) => t.name).join(", ")}`,
      isError: true,
    };
  }
  try {
    const text = await tool.execute(input, ctx);
    return { text, isError: false };
  } catch (err) {
    if (err instanceof BoundaryViolationError) {
      return { text: `boundary_violation: ${err.message}`, isError: true };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { text: `tool_error: ${msg}`, isError: true };
  }
}
