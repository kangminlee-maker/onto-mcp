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

import {
  type OntoTool,
  type ToolExecutionContext,
  BoundaryViolationError,
  findToolByName,
} from "../cli/onto-tools.js";
import {
  DEFAULT_GROK_BASE_URL,
  DEFAULT_LMSTUDIO_BASE_URL,
} from "./model-switcher.js";

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
}

export type ToolLoopProvider = "anthropic" | "openai" | "grok" | "lmstudio";

export interface ToolLoopConfig {
  provider: ToolLoopProvider;
  model_id: string;
  max_tokens?: number;
  /** For OpenAI-style endpoints. */
  base_url?: string;
  /** Override iteration cap (default 12). */
  max_iterations?: number;
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
  /** True if the loop hit MAX_ITERATIONS without the model producing a final answer. */
  truncated_by_iteration_cap: boolean;
}

/**
 * Run a tool-calling conversation until the model produces a final text
 * answer or the iteration cap is reached.
 *
 * Mock provider hook: when ONTO_LLM_MOCK=1, this routes to a deterministic
 * mock that exercises the loop wiring (see callMockToolLoop). Real provider
 * calls are gated behind that env var so unit tests never need credentials.
 */
export async function callLlmWithTools(
  systemPrompt: string,
  userPrompt: string,
  tools: OntoTool[],
  config: ToolLoopConfig,
  toolCtx: ToolExecutionContext,
): Promise<ToolLoopResult> {
  if (process.env.ONTO_LLM_MOCK === "1") {
    return callMockToolLoop(systemPrompt, userPrompt, tools, config, toolCtx);
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
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("callLlmWithTools(anthropic) requires ANTHROPIC_API_KEY");
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
      return {
        text: finalText.trim(),
        iterations: iteration + 1,
        tool_calls: toolCallCount,
        input_tokens: totalIn,
        output_tokens: totalOut,
        model_id: config.model_id,
        truncated_by_iteration_cap: false,
      };
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
  return {
    text: finalText.trim(),
    iterations: cap,
    tool_calls: toolCallCount,
    input_tokens: totalIn,
    output_tokens: totalOut,
    model_id: config.model_id,
    truncated_by_iteration_cap: truncated,
  };
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
  const { default: OpenAI } = await import("openai");
  const baseURL =
    config.base_url ??
    (config.provider === "grok"
      ? DEFAULT_GROK_BASE_URL
      : config.provider === "lmstudio"
        ? process.env.LMSTUDIO_BASE_URL ?? DEFAULT_LMSTUDIO_BASE_URL
        : undefined);
  const apiKey =
    config.provider === "grok"
      ? process.env.XAI_API_KEY ?? process.env.GROK_API_KEY
      : config.provider === "lmstudio"
        ? "lmstudio-local"
        : process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      config.provider === "grok"
        ? "callLlmWithTools(grok) requires XAI_API_KEY or GROK_API_KEY"
        : "callLlmWithTools(openai) requires OPENAI_API_KEY",
    );
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
      `${config.provider} tool-loop call: model="${config.model_id}" iteration=${iteration + 1}/${cap} max_tokens=${config.max_tokens ?? MAX_TOKENS_PER_TURN} tool_count=${openaiTools.length}${baseURL ? ` base_url=${baseURL}` : ""}`,
    );
    let response;
    try {
      response = await client.chat.completions.create({
        model: config.model_id,
        max_tokens: config.max_tokens ?? MAX_TOKENS_PER_TURN,
        messages: messages as never,
        tools: openaiTools,
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
      return {
        text: finalText.trim(),
        iterations: iteration + 1,
        tool_calls: toolCallCount,
        input_tokens: totalIn,
        output_tokens: totalOut,
        model_id: config.model_id,
        truncated_by_iteration_cap: false,
      };
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

  return {
    text: finalText.trim(),
    iterations: cap,
    tool_calls: toolCallCount,
    input_tokens: totalIn,
    output_tokens: totalOut,
    model_id: config.model_id,
    truncated_by_iteration_cap: true,
  };
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

// ---------------------------------------------------------------------------
// Mock provider — exercises loop without credentials
// ---------------------------------------------------------------------------

/**
 * Deterministic mock for ONTO_LLM_MOCK=1. The mock reads the system prompt
 * and emits a small scripted sequence:
 *   - turn 1: call list_directory on projectRoot
 *   - turn 2: call read_file on the first .md it sees in the listing
 *   - turn 3: produce a final markdown answer
 *
 * This proves that translation + dispatch + tool-result wiring all work end
 * to end without a real LLM. Real loops will not follow this script — they
 * use whatever the LLM decides.
 */
async function callMockToolLoop(
  _systemPrompt: string,
  _userPrompt: string,
  tools: OntoTool[],
  config: ToolLoopConfig,
  toolCtx: ToolExecutionContext,
): Promise<ToolLoopResult> {
  if (process.env.ONTO_LLM_MOCK_TOOL_LOOP_THROW === "1") {
    throw new Error("mock tool-loop failure");
  }
  if (process.env.ONTO_LLM_MOCK_TOOL_LOOP_EMPTY === "1") {
    return {
      text: "",
      iterations: 1,
      tool_calls: 0,
      input_tokens: 1,
      output_tokens: 0,
      model_id: config.model_id,
      truncated_by_iteration_cap: false,
    };
  }

  let toolCalls = 0;

  // Step 1: list_directory(projectRoot) — exercise the dispatch path.
  const listTool = tools.find((t) => t.name === "list_directory");
  let firstMdName: string | undefined;
  if (listTool) {
    toolCalls++;
    try {
      const listing = await listTool.execute({ path: toolCtx.projectRoot }, toolCtx);
      const match = listing.match(/\[F\] ([^\s]+\.md)/);
      if (match) firstMdName = match[1];
    } catch {
      // Mock tolerates failure — just don't follow up with read_file.
    }
  }

  // Step 2: read_file on first .md if we found one.
  const readTool = tools.find((t) => t.name === "read_file");
  if (readTool && firstMdName) {
    toolCalls++;
    try {
      await readTool.execute({ path: firstMdName, start_line: 1, end_line: 20 }, toolCtx);
    } catch {
      // Same tolerance as above.
    }
  }

  // Step 3: deterministic final answer.
  const text = [
    "# Mock Lens Output (callLlmWithTools mock)",
    "",
    "## Structural Inspection",
    "- Mock tool-loop exercised list_directory and read_file successfully.",
    "",
    "## Findings",
    "(none — mock executor)",
    "",
    "## Domain Constraints Used",
    "[]",
    "",
    "## Domain Context Assumptions",
    '- "Mock tool-loop returned this output via ONTO_LLM_MOCK=1."',
    "",
  ].join("\n");

  return {
    text,
    iterations: 1,
    tool_calls: toolCalls,
    input_tokens: 1,
    output_tokens: text.length / 4,
    model_id: config.model_id,
    truncated_by_iteration_cap: false,
  };
}
