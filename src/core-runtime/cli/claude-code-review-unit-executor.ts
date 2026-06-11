#!/usr/bin/env node

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import {
  appendRuntimeStreamChunkSync,
  appendRuntimeStreamEventSync,
} from "../observability/runtime-stream-observation.js";
import { semanticQualityEvidenceForArtifactGeneration } from "../review/artifact-generation-realization.js";
import {
  buildBoundedPrompt,
  buildWorkerSubmitSchema,
  coerceStructuredPayload,
  parseOutputFormat,
  requireString,
  writeLensSidecarArtifactFromPayload,
  writeRuntimeSubmitArtifactFromPayload,
  type WorkerStructuredOutputState,
} from "./worker-structured-output.js";
import {
  SALVAGE_INCOMPLETE_SENTINEL,
  buildDeltaRowsSalvagePrompt,
  buildTranscriptionSalvagePrompt,
  classifySalvageMode,
  mergeMissingStanceRows,
  salvageInputPathFor,
  type SalvageInput,
} from "./submit-salvage.js";

/**
 * Claude Code review unit executor — the `claude_code` adapter on the external
 * OAuth worker route. Mirrors codex-review-unit-executor.ts: same argv contract,
 * same structured-output submit reuse, same stdout summary shape (only
 * host_runtime differs — "anthropic" vs "codex"). The worker brand differs:
 * this spawns `claude -p --output-format json [--json-schema <schema>]` and
 * pipes the bounded prompt to its stdin.
 */

/**
 * Read-only worker tool allowlist. With --permission-mode bypassPermissions,
 * every tool NOT in this list is unavailable — a structural boundary (the
 * equivalent of the codex `-s read-only` sandbox) rather than a soft denylist.
 * Write/Edit/MultiEdit/NotebookEdit/Bash/WebFetch/WebSearch/Task/MCP tools are
 * all excluded, so the bounded unit cannot mutate the repository or reach the
 * network; the canonical artifact write happens in-process through the submit
 * path, never by the worker.
 */
const CLAUDE_READONLY_ALLOWED_TOOLS = ["Read", "Grep", "Glob"] as const;

const CLAUDE_BIN = process.env.ONTO_CLAUDE_BIN?.trim() || "claude";

/**
 * Embed the submit-tool JSON Schema into the bounded prompt. Claude Code's
 * `--json-schema` flag silently rejects the runtime's complex submit schemas,
 * so the schema travels in-prompt and the submit tool validates the result.
 */
function appendSchemaToPrompt(
  boundedPrompt: string,
  schema: unknown | undefined,
): string {
  if (schema === undefined) return boundedPrompt;
  return `${boundedPrompt}

The single JSON object you output MUST conform exactly to this JSON Schema. Output only the JSON object — no prose, no code fences:

${JSON.stringify(schema, null, 2)}
`;
}

function parseClaudeResultEvent(
  stdout: string,
  label: string,
): Record<string, unknown> {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) {
    throw new Error(`${label}: claude worker produced no stdout.`);
  }
  // `claude -p --output-format json` emits a JSON array of stream events (the
  // final one is the result). Tolerate JSONL and the older single-object form.
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const events: unknown[] = [];
    for (const line of trimmed.split("\n")) {
      const lineText = line.trim();
      if (lineText.length === 0) continue;
      try {
        events.push(JSON.parse(lineText));
      } catch {
        // ignore non-JSON log lines
      }
    }
    if (events.length === 0) {
      throw new Error(`${label}: failed to parse claude output as JSON.`);
    }
    parsed = events;
  }
  const events = Array.isArray(parsed) ? parsed : [parsed];
  const records = events.filter(
    (event): event is Record<string, unknown> =>
      !!event && typeof event === "object" && !Array.isArray(event),
  );
  const result =
    records.find((event) => event.type === "result") ??
    (records.length === 1 ? records[0] : undefined);
  if (!result) {
    throw new Error(`${label}: claude output contained no result event.`);
  }
  if (
    result.is_error === true ||
    (typeof result.subtype === "string" && result.subtype !== "success")
  ) {
    const message =
      typeof result.result === "string"
        ? result.result
        : JSON.stringify(result).slice(0, 500);
    throw new Error(`${label}: claude worker reported failure: ${message}`);
  }
  return result;
}

/**
 * Extract the first balanced top-level JSON object from text that may be wrapped
 * in prose. Without `--json-schema` enforcement, claude (especially faster
 * models at low effort) can prepend or append explanation despite the prompt;
 * the submit tool still validates the extracted object. Returns the original
 * text when no `{` is present so coercion fails with a clear message.
 */
export function extractJsonObjectText(text: string): string {
  const start = text.indexOf("{");
  if (start === -1) return text;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const ch = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return text.slice(start);
}

/**
 * Extract the submit-tool payload from a claude `--output-format json` result.
 * Defensive across the two shapes the CLI can return: an explicit
 * `structured_output` object, or the JSON object carried as the `result` text
 * (possibly wrapped in prose). Either way it converges on a validated record.
 */
function extractClaudeStructuredPayload(
  stdout: string,
  label: string,
): Record<string, unknown> {
  const record = parseClaudeResultEvent(stdout, label);
  const structured = record.structured_output;
  if (structured && typeof structured === "object" && !Array.isArray(structured)) {
    return coerceStructuredPayload(JSON.stringify(structured), label);
  }
  const result = record.result;
  if (typeof result === "string" && result.trim().length > 0) {
    return coerceStructuredPayload(extractJsonObjectText(result), label);
  }
  if (result && typeof result === "object" && !Array.isArray(result)) {
    return coerceStructuredPayload(JSON.stringify(result), label);
  }
  throw new Error(
    `${label}: claude result contained no structured payload (neither structured_output nor result).`,
  );
}

function extractClaudeMarkdown(stdout: string, label: string): string {
  const record = parseClaudeResultEvent(stdout, label);
  const result = record.result;
  if (typeof result === "string" && result.trim().length > 0) {
    return result;
  }
  throw new Error(`${label}: claude result contained no markdown text.`);
}

/**
 * Salvage mode (opt-in, parent-invoked after retry exhaustion on
 * output_contract): recover the frozen attempt's semantics without
 * re-engaging the violating model. Path A transcribes the frozen content
 * with the (cheap) transcription model under the invention guard; path B
 * asks a fresh same-tier instance for ONLY the validator-named missing
 * stance rows and merges in code. Either way the payload goes through the
 * SAME validator/writer as a self-submitted payload.
 */
async function runSubmitSalvageMode(args: {
  salvageFrom: string;
  outputFormat: string;
  submitSchema: { schema: unknown; state: WorkerStructuredOutputState };
  boundedPrompt: string;
  outputPath: string;
  unitId: string;
  unitKind: string;
  projectRoot: string;
  sessionRoot: string;
  sandboxMode: string;
  model: string | undefined;
  transcriptionModel: string | undefined;
  timeoutMs: number | undefined;
}): Promise<number> {
  const frozen = JSON.parse(
    await fs.readFile(args.salvageFrom, "utf8"),
  ) as SalvageInput;
  let payload: Record<string, unknown> | null = null;
  try {
    payload = extractClaudeStructuredPayload(
      frozen.stdout,
      `salvage frozen payload ${args.unitId}`,
    );
  } catch {
    payload = null;
  }
  let resultText: string | null = null;
  try {
    resultText = extractClaudeMarkdown(
      frozen.stdout,
      `salvage frozen text ${args.unitId}`,
    );
  } catch {
    resultText = null;
  }
  const mode = classifySalvageMode({
    outputFormat: args.outputFormat,
    payload,
    resultText,
    error: frozen.error,
  });
  if (mode.mode === "unsalvageable") {
    throw new Error(`submit salvage unsalvageable for ${args.unitId}: ${mode.reason}`);
  }
  process.stderr.write(
    `[plan:executor] kind=claude_code unit_id=${args.unitId} salvage=${mode.mode}\n`,
  );

  const workerBase = {
    projectRoot: args.projectRoot,
    reasoningEffort: undefined,
    sandboxMode: args.sandboxMode,
    unitId: args.unitId,
    unitKind: args.unitKind,
    sessionRoot: args.sessionRoot,
    outputDir: path.dirname(args.outputPath),
    timeoutMs: args.timeoutMs,
  };

  let salvagedPayload: Record<string, unknown>;
  if (mode.mode === "delta_rows") {
    const stdout = await runClaudeWorker({
      ...workerBase,
      boundedPrompt: appendSchemaToPrompt(
        buildDeltaRowsSalvagePrompt({
          boundedPrompt: args.boundedPrompt,
          missingIssueIds: mode.missingIssueIds,
        }),
        args.submitSchema.schema,
      ),
      // delta completion is fresh semantic judgment — same-tier instance.
      model: args.model,
    });
    const delta = extractClaudeStructuredPayload(
      stdout,
      `salvage delta ${args.unitId}`,
    );
    salvagedPayload = mergeMissingStanceRows(
      payload as Record<string, unknown>,
      delta,
    );
  } else {
    const source = resultText ?? JSON.stringify(payload, null, 2);
    const stdout = await runClaudeWorker({
      ...workerBase,
      boundedPrompt: appendSchemaToPrompt(
        buildTranscriptionSalvagePrompt({ resultText: source, error: frozen.error }),
        args.submitSchema.schema,
      ),
      // transcription is not semantic work — cheap tier when configured.
      model: args.transcriptionModel ?? args.model,
    });
    let salvageText: string | null = null;
    try {
      salvageText = extractClaudeMarkdown(stdout, `salvage guard ${args.unitId}`);
    } catch {
      salvageText = null;
    }
    if (salvageText && salvageText.includes(SALVAGE_INCOMPLETE_SENTINEL)) {
      throw new Error(
        `submit salvage aborted for ${args.unitId}: ${SALVAGE_INCOMPLETE_SENTINEL} (frozen output lacks required content; refusing to invent).`,
      );
    }
    salvagedPayload = extractClaudeStructuredPayload(
      stdout,
      `salvage transcription ${args.unitId}`,
    );
  }

  return args.submitSchema.state.outputFormat === "lens-sidecar"
    ? writeLensSidecarArtifactFromPayload({
        payload: salvagedPayload,
        outputPath: args.outputPath,
        state: args.submitSchema.state.lensSidecarState,
      })
    : writeRuntimeSubmitArtifactFromPayload({
        payload: salvagedPayload,
        outputPath: args.outputPath,
        state: args.submitSchema.state.runtimeSubmitState,
      });
}

async function runClaudeWorker(args: {
  projectRoot: string;
  boundedPrompt: string;
  model: string | undefined;
  reasoningEffort: string | undefined;
  sandboxMode: string;
  unitId: string;
  unitKind: string;
  sessionRoot: string;
  outputDir: string;
  timeoutMs?: number | undefined;
}): Promise<string> {
  // The prompt is passed as the positional argument (not stdin): `claude -p`
  // with piped text stdin does not treat it as the prompt, so it would exit
  // doing nothing. stdin is ignored so the worker does not block on it.
  const claudeArgs: string[] = [
    "-p",
    args.boundedPrompt,
    "--output-format",
    "json",
    "--add-dir",
    args.projectRoot,
    "--permission-mode",
    "bypassPermissions",
  ];
  if (args.model && args.model.length > 0) {
    claudeArgs.push("--model", args.model);
  }
  if (args.reasoningEffort && args.reasoningEffort.length > 0) {
    claudeArgs.push("--effort", args.reasoningEffort);
  }
  // The schema is embedded in the prompt rather than passed via --json-schema:
  // claude's --json-schema validator silently rejects the runtime's complex
  // submit schemas (additionalProperties:false + deep required) and exits with
  // no output. The submit tool remains the authoritative validator.
  //
  // Never load project/user MCP servers in the bounded worker (no side effects,
  // no mcp__* tools to auto-approve).
  claudeArgs.push("--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}');
  // Keep the variadic --allowedTools last so its tool list does not swallow a
  // following flag. The prompt is the positional arg, so nothing trails it.
  if (args.sandboxMode === "read-only") {
    claudeArgs.push("--allowedTools", ...CLAUDE_READONLY_ALLOWED_TOOLS);
  }

  const child = spawn(CLAUDE_BIN, claudeArgs, {
    cwd: args.projectRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const runtimeSourceBase = {
    kind: "process" as const,
    label: `claude:${args.unitId}`,
    unitId: args.unitId,
    stageId: args.unitKind,
  };
  const runtimeSource =
    child.pid !== undefined
      ? { ...runtimeSourceBase, processId: child.pid }
      : runtimeSourceBase;
  appendRuntimeStreamEventSync({
    pipeline: "review",
    sessionRoot: args.sessionRoot,
    source: runtimeSource,
    stream: "status",
    message: `claude worker started: ${args.unitKind} ${args.unitId}`,
  });

  // Real-time tee to disk, mirroring the codex worker, so a watcher pane can
  // tail the running log live. Lifecycle (rename on failure / rm on success)
  // happens after the child exits.
  const runningLogPath = path.join(args.outputDir, `.${args.unitId}.running.log`);
  let runningLogStream: fsSync.WriteStream | null = null;
  try {
    fsSync.mkdirSync(args.outputDir, { recursive: true });
    runningLogStream = fsSync.createWriteStream(runningLogPath, { flags: "w" });
    runningLogStream.write(`ENV-BEFORE unit=${args.unitId}\n`);
  } catch {
    runningLogStream = null;
  }

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk: Buffer | string) => {
    stdout += String(chunk);
    if (runningLogStream) runningLogStream.write(chunk);
    appendRuntimeStreamChunkSync(
      {
        pipeline: "review",
        sessionRoot: args.sessionRoot,
        source: runtimeSource,
        stream: "stdout",
      },
      chunk,
    );
  });
  child.stderr.on("data", (chunk: Buffer | string) => {
    stderr += String(chunk);
    if (runningLogStream) runningLogStream.write(chunk);
    appendRuntimeStreamChunkSync(
      {
        pipeline: "review",
        sessionRoot: args.sessionRoot,
        source: runtimeSource,
        stream: "stderr",
      },
      chunk,
    );
  });

  // Self-enforced unit timeout (`--timeout-ms`): in the flat path the parent
  // runner kills timed-out workers, but a nesting batch script has no
  // per-unit kill switch — the executor bounding itself keeps a hang local
  // to one unit in every topology. Mirrors the codex unit executor.
  let timedOut = false;
  let timeoutTimer: NodeJS.Timeout | null = null;
  let forceKillTimer: NodeJS.Timeout | null = null;
  if (typeof args.timeoutMs === "number" && args.timeoutMs > 0) {
    timeoutTimer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }
      forceKillTimer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
      }, 2_000);
    }, args.timeoutMs);
  }

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on("error", (err: NodeJS.ErrnoException) => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      if (err.code === "ENOENT") {
        reject(
          new Error(
            `Claude Code CLI not found (${CLAUDE_BIN}). Install/login claude or set ONTO_CLAUDE_BIN.`,
          ),
        );
      } else {
        reject(err);
      }
    });
    child.on("close", (code) => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      resolve(code ?? 1);
    });
  });

  if (timedOut) {
    if (runningLogStream) {
      try {
        runningLogStream.write(`ENV-AFTER unit=${args.unitId} exit=timeout\n`);
        runningLogStream.end();
      } catch {
        // ignore
      }
    }
    throw new Error(
      `Claude worker executor timed out after ${args.timeoutMs} ms for ${args.unitId}.`,
    );
  }
  appendRuntimeStreamEventSync({
    pipeline: "review",
    sessionRoot: args.sessionRoot,
    source: runtimeSource,
    stream: "status",
    message: `claude worker exited: ${args.unitKind} ${args.unitId} code=${exitCode}`,
  });

  if (runningLogStream) {
    try {
      runningLogStream.write(`ENV-AFTER unit=${args.unitId} exit=${exitCode}\n`);
    } catch {
      // ignore
    }
    try {
      runningLogStream.end();
    } catch {
      // ignore
    }
  }

  if (exitCode !== 0) {
    try {
      const nestedErrPath = path.join(
        args.outputDir,
        `.${args.unitId}.nested-stderr.log`,
      );
      fsSync.renameSync(runningLogPath, nestedErrPath);
    } catch {
      // best effort
    }
    const combinedMessage = [stderr.trim(), stdout.trim()]
      .filter((message) => message.length > 0)
      .join("\n");
    throw new Error(
      combinedMessage.length > 0
        ? combinedMessage
        : `Claude worker executor exited with code ${exitCode}`,
    );
  }

  try {
    fsSync.rmSync(runningLogPath, { force: true });
  } catch {
    // ignore
  }

  if (stdout.trim().length === 0) {
    // A clean exit with no stdout is still a failure for --output-format json
    // (which must emit a result envelope). Surface stderr so the cause is
    // visible instead of a bare "no stdout" downstream.
    const detail = stderr.trim();
    throw new Error(
      `Claude worker produced no stdout (exit ${exitCode}).${
        detail.length > 0 ? ` stderr: ${detail.slice(0, 1000)}` : ""
      }`,
    );
  }

  return stdout;
}

export async function runClaudeCodeReviewUnitExecutorCli(
  argv: string[],
): Promise<number> {
  const { values } = parseArgs({
    options: {
      "project-root": { type: "string", default: "." },
      "session-root": { type: "string" },
      "unit-id": { type: "string" },
      "unit-kind": { type: "string" },
      "packet-path": { type: "string" },
      "output-path": { type: "string" },
      model: { type: "string" },
      "sandbox-mode": { type: "string", default: "read-only" },
      "reasoning-effort": { type: "string" },
      "config-override": { type: "string", multiple: true, default: [] },
      "output-format": { type: "string", default: "markdown" },
      "human-output-ref": { type: "string" },
      "timeout-ms": { type: "string" },
      "salvage-from": { type: "string" },
      "salvage-transcription-model": { type: "string" },
    },
    strict: true,
    allowPositionals: false,
    args: argv,
  });

  const projectRoot = path.resolve(
    requireString(values["project-root"], "project-root"),
  );
  const unitId = requireString(values["unit-id"], "unit-id");
  const unitKind = requireString(values["unit-kind"], "unit-kind");
  const sessionRoot = path.resolve(
    requireString(values["session-root"], "session-root"),
  );
  const packetPath = path.resolve(requireString(values["packet-path"], "packet-path"));
  const outputPath = path.resolve(requireString(values["output-path"], "output-path"));
  const outputFormat = parseOutputFormat(values["output-format"]);
  const sandboxMode = requireString(values["sandbox-mode"], "sandbox-mode");
  if (outputFormat !== "markdown" && sandboxMode !== "read-only") {
    throw new Error(
      `--output-format=${outputFormat} requires --sandbox-mode=read-only so structured artifact writes can only happen through the runtime submit path.`,
    );
  }
  const model =
    typeof values.model === "string" && values.model.length > 0
      ? values.model
      : undefined;
  const reasoningEffort =
    typeof values["reasoning-effort"] === "string" &&
    values["reasoning-effort"].length > 0
      ? values["reasoning-effort"]
      : undefined;

  // Observability symmetry with the codex executor: one [plan:executor] line
  // per unit. The claude worker is spawned directly (not via callLlm).
  process.stderr.write(
    `[plan:executor] kind=claude_code unit_id=${unitId} model=${
      model ?? "(claude default)"
    } sandbox=${sandboxMode} effort=${reasoningEffort ?? "(claude default)"}\n`,
  );

  const packetText = await fs.readFile(packetPath, "utf8");
  const submitSchema =
    outputFormat !== "markdown"
      ? buildWorkerSubmitSchema({
          outputFormat,
          unitId,
          sessionId: path.basename(sessionRoot),
          rawPacketText: packetText,
          humanOutputRef:
            typeof values["human-output-ref"] === "string"
              ? values["human-output-ref"]
              : null,
        })
      : undefined;
  const boundedPrompt = appendSchemaToPrompt(
    buildBoundedPrompt(
      packetPath,
      packetText,
      outputPath,
      unitId,
      unitKind,
      outputFormat,
    ),
    submitSchema?.schema,
  );

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const timeoutMsRaw = values["timeout-ms"];
  const timeoutMs =
    typeof timeoutMsRaw === "string" && timeoutMsRaw.length > 0
      ? Number.parseInt(timeoutMsRaw, 10)
      : undefined;
  if (timeoutMs !== undefined && (!Number.isInteger(timeoutMs) || timeoutMs <= 0)) {
    throw new Error(`--timeout-ms must be a positive integer, got "${timeoutMsRaw}".`);
  }

  const salvageFromRaw = values["salvage-from"];
  const salvageFrom =
    typeof salvageFromRaw === "string" && salvageFromRaw.length > 0
      ? path.resolve(salvageFromRaw)
      : undefined;
  if (salvageFrom && outputFormat === "markdown") {
    throw new Error("--salvage-from requires a structured --output-format.");
  }
  const transcriptionModel =
    typeof values["salvage-transcription-model"] === "string" &&
    values["salvage-transcription-model"].length > 0
      ? values["salvage-transcription-model"]
      : undefined;

  let structuredPayloadFields: number | undefined;
  if (salvageFrom) {
    if (!submitSchema) {
      throw new Error(`Missing structured output state for ${outputFormat}.`);
    }
    structuredPayloadFields = await runSubmitSalvageMode({
      salvageFrom,
      outputFormat,
      submitSchema,
      boundedPrompt,
      outputPath,
      unitId,
      unitKind,
      projectRoot,
      sessionRoot,
      sandboxMode,
      model,
      transcriptionModel,
      timeoutMs,
    });
  } else {
    const stdout = await runClaudeWorker({
      projectRoot,
      boundedPrompt,
      model,
      reasoningEffort,
      sandboxMode,
      unitId,
      unitKind,
      sessionRoot,
      outputDir: path.dirname(outputPath),
      timeoutMs,
    });

    if (outputFormat !== "markdown") {
      if (!submitSchema) {
        throw new Error(`Missing structured output state for ${outputFormat}.`);
      }
      try {
        const payload = extractClaudeStructuredPayload(
          stdout,
          `Claude structured output ${unitId}`,
        );
        structuredPayloadFields =
          submitSchema.state.outputFormat === "lens-sidecar"
            ? await writeLensSidecarArtifactFromPayload({
                payload,
                outputPath,
                state: submitSchema.state.lensSidecarState,
              })
            : await writeRuntimeSubmitArtifactFromPayload({
                payload,
                outputPath,
                state: submitSchema.state.runtimeSubmitState,
              });
      } catch (error: unknown) {
        // Freeze the failing attempt's evidence for the opt-in salvage path
        // (parent re-invokes with --salvage-from after the retry budget is
        // exhausted). The frozen stream is scratch, never the seat.
        const frozen: SalvageInput = {
          unit_id: unitId,
          unit_kind: unitKind,
          output_format: outputFormat,
          stdout,
          error: error instanceof Error ? error.message : String(error),
        };
        await fs.writeFile(
          salvageInputPathFor(outputPath),
          JSON.stringify(frozen),
          "utf8",
        );
        throw error;
      }
    } else {
      const markdown = extractClaudeMarkdown(stdout, `Claude markdown ${unitId}`);
      await fs.writeFile(outputPath, `${markdown.trimEnd()}\n`, "utf8");
    }
  }

  console.log(
    JSON.stringify(
      {
        unit_id: unitId,
        unit_kind: unitKind,
        packet_path: packetPath,
        output_path: outputPath,
        output_format: outputFormat,
        realization: "worker",
        host_runtime: "anthropic",
        artifact_generation_realization: "live",
        semantic_quality_evidence:
          semanticQualityEvidenceForArtifactGeneration("live"),
        ...(structuredPayloadFields !== undefined
          ? { structured_payload_fields: structuredPayloadFields }
          : {}),
      },
      null,
      2,
    ),
  );
  return 0;
}

async function main(): Promise<number> {
  return runClaudeCodeReviewUnitExecutorCli(process.argv.slice(2));
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
