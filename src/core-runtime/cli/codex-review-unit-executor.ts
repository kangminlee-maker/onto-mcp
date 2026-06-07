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
import {
  createLensSidecarSubmissionTools,
  type LensSidecarSubmissionState,
} from "./lens-sidecar-tools.js";
import {
  createRuntimeSubmitTools,
  isRuntimeSubmitOutputFormat,
  type RuntimeSubmitOutputFormat,
  type RuntimeSubmitState,
} from "./structured-output-tools.js";
import { parseRuntimeSubmitContextForOutputFormat } from "./runtime-submit-context.js";
import { writeYamlDocument } from "../review/review-artifact-utils.js";
import {
  writeValidatedLensSidecarArtifact,
} from "../review/lens-sidecar-artifact.js";
import { semanticQualityEvidenceForArtifactGeneration } from "../review/artifact-generation-realization.js";

type StructuredOutputFormat = "lens-sidecar" | RuntimeSubmitOutputFormat;
type OutputFormat = "markdown" | StructuredOutputFormat;

type CodexStructuredOutputState =
  | {
      outputFormat: "lens-sidecar";
      submitToolName: "submit_lens_findings";
      lensSidecarState: LensSidecarSubmissionState;
    }
  | {
      outputFormat: RuntimeSubmitOutputFormat;
      submitToolName: string;
      runtimeSubmitState: RuntimeSubmitState;
    };

function requireString(
  value: string | boolean | undefined,
  optionName: string,
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required option --${optionName}`);
  }
  return value;
}

function buildBoundedPrompt(
  packetPath: string,
  packetText: string,
  outputPath: string,
  unitId: string,
  unitKind: string,
  outputFormat: OutputFormat,
): string {
  if (outputFormat !== "markdown") {
    return buildStructuredOutputPrompt({
      packetPath,
      packetText,
      outputPath,
      unitId,
      unitKind,
      outputFormat,
    });
  }
  return `You are executing a single bounded review unit as a ContextIsolatedReasoningUnit.

Unit id: ${unitId}
Unit kind: ${unitKind}
Authoritative prompt packet path: ${packetPath}
Canonical output path: ${outputPath}

Rules:
- Treat the prompt packet below as the authoritative contract.
- Treat the Boundary Policy and Effective Boundary State in the packet as hard constraints.
- Read the files referenced by the prompt packet when needed.
- Stay within the smallest sufficient file set implied by the packet.
- Do not recursively follow reference chains beyond the files explicitly listed in the packet unless the packet requires it.
- Do not use web research when the packet says web research is denied.
- Do not read outside the allowed filesystem scope described in the packet.
- Produce only the final markdown content for the canonical output path.
- Do not wrap the answer in code fences.
- Do not add commentary before or after the markdown.
- Do not modify repository files yourself.
- Do not change the required output structure from the packet.
- If the packet asks you to preserve disagreement or uncertainty, preserve it explicitly.
- If you cannot complete the task within the declared boundary, preserve that limitation explicitly as insufficient access or insufficient evidence within boundary instead of broadening the search.

Authoritative prompt packet follows:

${packetText}
`;
}

function submitToolNameForOutputFormat(outputFormat: StructuredOutputFormat): string {
  if (outputFormat === "lens-sidecar") return "submit_lens_findings";
  switch (outputFormat) {
    case "issue-artifact":
      return "submit_issue_artifact";
    case "issue-stance-response":
      return "submit_issue_stance_response";
    case "issue-deliberation-response":
      return "submit_issue_deliberation_response";
    case "deliberation-resolution":
      return "submit_deliberation_resolution";
    case "issue-synthesis-response":
      return "submit_issue_synthesis_response";
  }
}

function buildStructuredOutputPrompt(args: {
  packetPath: string;
  packetText: string;
  outputPath: string;
  unitId: string;
  unitKind: string;
  outputFormat: StructuredOutputFormat;
}): string {
  const submitToolName = submitToolNameForOutputFormat(args.outputFormat);
  return `You are executing one bounded review structured-output unit as a ContextIsolatedReasoningUnit.

Unit id: ${args.unitId}
Unit kind: ${args.unitKind}
Output format: ${args.outputFormat}
Authoritative prompt packet path: ${args.packetPath}
Canonical YAML output path: ${args.outputPath}

Rules:
- Treat the prompt packet below as the authoritative contract.
- Treat the Boundary Policy and Effective Boundary State in the packet as hard constraints.
- Read the files referenced by the prompt packet when needed.
- Stay within the smallest sufficient file set implied by the packet.
- Do not recursively follow reference chains beyond the files explicitly listed in the packet unless the packet requires it.
- Do not use web research when the packet says web research is denied.
- Do not read outside the allowed filesystem scope described in the packet.
- Do not modify repository files yourself.
- Produce only one JSON object matching the provided output schema.
- The JSON object is the argument payload for ${submitToolName}.
- Do not wrap the JSON object in markdown or code fences.
- Do not include runtime-owned envelope fields such as schema_version, session_id, lens_id, issue_id, or validation unless the output schema explicitly requires them.
- The runtime will validate the JSON object through the submit contract and write the canonical YAML artifact.
- If the packet asks you to preserve disagreement or uncertainty, preserve it explicitly in the structured fields.
- If you cannot complete the task within the declared boundary, encode the limitation as insufficient access or insufficient evidence within boundary instead of broadening the search.

Authoritative prompt packet follows:

${args.packetText}
`;
}

function parseOutputFormat(raw: unknown): OutputFormat {
  if (raw === undefined || raw === "" || raw === "markdown") return "markdown";
  if (typeof raw === "string" && isRuntimeSubmitOutputFormat(raw)) return raw;
  if (raw === "lens-sidecar") return raw;
  throw new Error(
    `Invalid --output-format value for Codex worker: ${String(raw)} (expected markdown | lens-sidecar | issue-artifact | issue-stance-response | issue-deliberation-response | deliberation-resolution | issue-synthesis-response)`,
  );
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function toCodexStructuredOutputSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map((item) => toCodexStructuredOutputSchema(item));
  }
  if (!schema || typeof schema !== "object") {
    return schema;
  }
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    normalized[key] = toCodexStructuredOutputSchema(value);
  }
  const properties = normalized.properties;
  if (properties && typeof properties === "object" && !Array.isArray(properties)) {
    normalized.required = Object.keys(properties);
  }
  return normalized;
}

async function writeOutputSchemaFile(args: {
  rawOutputPath: string;
  outputFormat: StructuredOutputFormat;
  unitId: string;
  sessionId: string;
  rawPacketText: string;
  humanOutputRef?: string | null;
}): Promise<{
  schemaPath: string;
  state: CodexStructuredOutputState;
}> {
  const { state, schema } =
    args.outputFormat === "lens-sidecar"
      ? (() => {
          const lensSidecarState: LensSidecarSubmissionState = {
            sessionId: args.sessionId,
            lensId: args.unitId,
            humanOutputRef: args.humanOutputRef ?? null,
          };
          const [submitTool] = createLensSidecarSubmissionTools(lensSidecarState);
          if (!submitTool) {
            throw new Error("No lens sidecar submit tool for Codex structured output.");
          }
          return {
            state: {
              outputFormat: "lens-sidecar" as const,
              submitToolName: "submit_lens_findings" as const,
              lensSidecarState,
            },
            schema: toCodexStructuredOutputSchema(submitTool.input_schema),
          };
        })()
      : (() => {
          const runtimeSubmitState: RuntimeSubmitState = {
            sessionId: args.sessionId,
            unitId: args.unitId,
            outputFormat: args.outputFormat,
            ...parseRuntimeSubmitContextForOutputFormat({
              rawPacketText: args.rawPacketText,
              unitId: args.unitId,
              outputFormat: args.outputFormat,
            }),
          };
          const [submitTool] = createRuntimeSubmitTools(runtimeSubmitState);
          if (!submitTool) {
            throw new Error(
              `No runtime submit tool for output format ${args.outputFormat}.`,
            );
          }
          return {
            state: {
              outputFormat: args.outputFormat,
              submitToolName: submitTool.name,
              runtimeSubmitState,
            },
            schema: toCodexStructuredOutputSchema(submitTool.input_schema),
          };
        })();
  const schemaPath = `${args.rawOutputPath}.schema.json`;
  await fs.mkdir(path.dirname(args.rawOutputPath), { recursive: true });
  await fs.writeFile(
    schemaPath,
    `${JSON.stringify(schema, null, 2)}\n`,
    "utf8",
  );
  return { schemaPath, state };
}

async function removeFileIfPresent(filePath: string): Promise<void> {
  await fs.rm(filePath, { force: true });
}

function stripWrappingCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/);
  return match ? match[1]!.trim() : trimmed;
}

async function parseStructuredPayload(rawOutputPath: string): Promise<Record<string, unknown>> {
  const raw = stripWrappingCodeFence(await fs.readFile(rawOutputPath, "utf8"));
  try {
    const payload = requireRecord(
      JSON.parse(raw),
      `Codex structured output ${rawOutputPath}`,
    );
    if (Object.prototype.hasOwnProperty.call(payload, "payload_json")) {
      throw new Error(
        "payload_json wrapper is no longer accepted; structured output must be the submit payload object.",
      );
    }
    return payload;
  } catch (error) {
    throw new Error(
      `Failed to parse Codex structured output JSON: ${rawOutputPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

async function writeRuntimeSubmitArtifactFromCodexJson(args: {
  rawOutputPath: string;
  outputPath: string;
  state: RuntimeSubmitState;
}): Promise<number> {
  const payload = await parseStructuredPayload(args.rawOutputPath);
  const [submitTool] = createRuntimeSubmitTools(args.state);
  if (!submitTool) {
    throw new Error(`No runtime submit tool for output format ${args.state.outputFormat}.`);
  }
  await submitTool.execute(payload, {
    projectRoot: "",
    ontoHome: "",
  });
  if (args.state.artifact === undefined) {
    throw new Error(
      `${args.state.outputFormat} mode completed without ${submitTool.name} for unit ${args.state.unitId}.`,
    );
  }
  await writeYamlDocument(args.outputPath, args.state.artifact);
  return Object.keys(payload).length;
}

async function writeLensSidecarArtifactFromCodexJson(args: {
  rawOutputPath: string;
  outputPath: string;
  state: LensSidecarSubmissionState;
}): Promise<number> {
  const payload = await parseStructuredPayload(args.rawOutputPath);
  const [submitTool] = createLensSidecarSubmissionTools(args.state);
  if (!submitTool) {
    throw new Error("No lens sidecar submit tool for Codex structured output.");
  }
  await submitTool.execute(payload, {
    projectRoot: "",
    ontoHome: "",
  });
  if (args.state.artifact === undefined) {
    throw new Error(
      `lens-sidecar mode completed without ${submitTool.name} for unit ${args.state.lensId}.`,
    );
  }
  await writeValidatedLensSidecarArtifact({
    sidecarPath: args.outputPath,
    artifact: args.state.artifact,
    sessionId: args.state.sessionId,
    lensId: args.state.lensId,
    ...(args.state.humanOutputRef !== undefined
      ? { expectedHumanOutputRef: args.state.humanOutputRef }
      : {}),
  });
  return Object.keys(payload).length;
}

async function runCodexWorker(
  projectRoot: string,
  boundedPrompt: string,
  outputPath: string,
  model: string | boolean | undefined,
  sandboxMode: string | boolean | undefined,
  reasoningEffort: string | boolean | undefined,
  configOverrides: string[],
  unitId: string,
  unitKind: string,
  sessionRoot: string,
  outputSchemaPath?: string | undefined,
): Promise<void> {
  const codexArgs: string[] = [
    "exec",
    "-C",
    projectRoot,
    "-s",
    requireString(sandboxMode, "sandbox-mode"),
    "-o",
    outputPath,
    "--skip-git-repo-check",
  ];

  if (typeof reasoningEffort === "string" && reasoningEffort.length > 0) {
    codexArgs.push("-c", `model_reasoning_effort="${reasoningEffort}"`);
  }

  if (typeof model === "string" && model.length > 0) {
    codexArgs.push("-m", model);
  }

  if (outputSchemaPath) {
    codexArgs.push("--output-schema", outputSchemaPath);
  }

  for (const override of configOverrides) {
    codexArgs.push("-c", override);
  }

  codexArgs.push("-");

  const child = spawn("codex", codexArgs, {
    cwd: projectRoot,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const runtimeSourceBase = {
    kind: "process" as const,
    label: `codex:${unitId}`,
    unitId,
    stageId: unitKind,
  };
  const runtimeSource = child.pid !== undefined
    ? { ...runtimeSourceBase, processId: child.pid }
    : runtimeSourceBase;
  appendRuntimeStreamEventSync({
    pipeline: "review",
    sessionRoot,
    source: runtimeSource,
    stream: "status",
    message: `codex worker started: ${unitKind} ${unitId}`,
  });

  // Real-time tee to disk: each codex stdout/stderr chunk is appended to
  // the running log under the lens output directory so a watcher pane
  // can `tail -f` it live. The in-memory buffers remain for final error
  // reporting. Stream path mirrors the nested worker pattern
  // (hidden filename, sessionRoot/round1/.<lens>.running.log). The
  // lifecycle — rename on failure / rm on success — happens after the
  // child exits, below.
  const outputDir = path.dirname(outputPath);
  const runningLogPath = path.join(outputDir, `.${unitId}.running.log`);
  let runningLogStream: fsSync.WriteStream | null = null;
  try {
    fsSync.mkdirSync(outputDir, { recursive: true });
    runningLogStream = fsSync.createWriteStream(runningLogPath, { flags: "w" });
    runningLogStream.write(
      `ENV-BEFORE unit=${unitId} output=${outputPath}\n`,
    );
  } catch {
    // Best-effort; streaming failure must not block the actual codex run.
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
        sessionRoot,
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
        sessionRoot,
        source: runtimeSource,
        stream: "stderr",
      },
      chunk,
    );
  });

  child.stdin.write(boundedPrompt);
  child.stdin.end();

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        reject(new Error("codex CLI not found. Install codex or use a different executor."));
      } else {
        reject(err);
      }
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
  appendRuntimeStreamEventSync({
    pipeline: "review",
    sessionRoot,
    source: runtimeSource,
    stream: "status",
    message: `codex worker exited: ${unitKind} ${unitId} code=${exitCode}`,
  });

  // Flush the stream before deciding cleanup so tail -f readers see final
  // bytes. ENV-AFTER line is written before close for parse parity with
  // the codex-nested running log.
  if (runningLogStream) {
    try {
      runningLogStream.write(`ENV-AFTER unit=${unitId} exit=${exitCode}\n`);
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
    // Failure path — persist running log for post-hoc inspection at a
    // stable path (renaming from .running.log to .nested-stderr.log
    // keeps a single per-lens failure trace filename).
    try {
      const nestedErrPath = path.join(outputDir, `.${unitId}.nested-stderr.log`);
      fsSync.renameSync(runningLogPath, nestedErrPath);
    } catch {
      // running log may not exist (stream setup failed) — best effort
    }
    const combinedMessage = [stderr.trim(), stdout.trim()]
      .filter((message) => message.length > 0)
      .join("\n");
    throw new Error(
      combinedMessage.length > 0
        ? combinedMessage
        : `Codex worker executor exited with code ${exitCode}`,
    );
  }

  // Success — remove the running log to keep round1/ listing principal-
  // facing lens outputs only. The watcher pane saw it live; the final
  // result is in <outputPath>.
  try {
    fsSync.rmSync(runningLogPath, { force: true });
  } catch {
    // ignore
  }

  // Codex CLI -o flag may not reliably write the output file.
  // If the file is missing or empty, fall back to stdout.
  const outputExists = await fs.access(outputPath).then(() => true, () => false);
  const outputSize = outputExists ? (await fs.stat(outputPath)).size : 0;
  if (!outputExists || outputSize === 0) {
    const normalizedOutput = stdout.trim();
    if (normalizedOutput.length === 0) {
      throw new Error("Codex worker executor produced no output (neither -o file nor stdout).");
    }
    await fs.writeFile(outputPath, `${normalizedOutput}\n`, "utf8");
  }
}

export async function runCodexReviewUnitExecutorCli(
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
  const sessionRoot = path.resolve(requireString(values["session-root"], "session-root"));
  const packetPath = path.resolve(requireString(values["packet-path"], "packet-path"));
  const outputPath = path.resolve(requireString(values["output-path"], "output-path"));
  const outputFormat = parseOutputFormat(values["output-format"]);
  const sandboxMode = requireString(values["sandbox-mode"], "sandbox-mode");
  if (outputFormat !== "markdown" && sandboxMode !== "read-only") {
    throw new Error(
      `--output-format=${outputFormat} requires --sandbox-mode=read-only so structured artifact writes can only happen through the runtime submit path.`,
    );
  }
  const rawOutputPath =
    outputFormat === "markdown" ? outputPath : `${outputPath}.codex-output.json`;

  // Review Recovery PR-1 (R1 observability symmetry). The codex executor does
  // NOT go through callLlm — it spawns `codex exec` directly — so the PR-1
  // [model-call] logs in llm-caller.ts cover the background-task path only.
  // This single startup emit gives parent-process log correlators a breadcrumb
  // for the lens-execution Codex worker too, so a 5-lens review produces
  // one [plan:executor] line per lens regardless of provider identity.
  process.stderr.write(
    `[plan:executor] kind=codex unit_id=${unitId} model=${
      typeof values.model === "string" && values.model.length > 0
        ? values.model
        : "(codex default)"
    } sandbox=${values["sandbox-mode"] ?? "read-only"} effort=${
      typeof values["reasoning-effort"] === "string" && values["reasoning-effort"].length > 0
        ? values["reasoning-effort"]
        : "(codex default)"
    }\n`,
  );

  const packetText = await fs.readFile(packetPath, "utf8");
  const structuredOutput =
    outputFormat !== "markdown"
      ? await writeOutputSchemaFile({
          rawOutputPath,
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
  const boundedPrompt = buildBoundedPrompt(
    packetPath,
    packetText,
    outputPath,
    unitId,
    unitKind,
    outputFormat,
  );

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  await runCodexWorker(
    projectRoot,
    boundedPrompt,
    rawOutputPath,
    values.model,
    sandboxMode,
    values["reasoning-effort"],
    values["config-override"],
    unitId,
    unitKind,
    sessionRoot,
    structuredOutput?.schemaPath,
  );

  let structuredPayloadFields: number | undefined;
  if (outputFormat !== "markdown") {
    if (!structuredOutput) {
      throw new Error(`Missing structured output state for ${outputFormat}.`);
    }
    structuredPayloadFields =
      structuredOutput.state.outputFormat === "lens-sidecar"
        ? await writeLensSidecarArtifactFromCodexJson({
            rawOutputPath,
            outputPath,
            state: structuredOutput.state.lensSidecarState,
          })
        : await writeRuntimeSubmitArtifactFromCodexJson({
            rawOutputPath,
            outputPath,
            state: structuredOutput.state.runtimeSubmitState,
          });
    await removeFileIfPresent(rawOutputPath);
    await removeFileIfPresent(structuredOutput.schemaPath);
  } else {
    const outputText = await fs.readFile(outputPath, "utf8");
    if (outputText.trim().length === 0) {
      throw new Error(`Codex executor produced empty output: ${outputPath}`);
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
        host_runtime: "codex",
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
  return runCodexReviewUnitExecutorCli(process.argv.slice(2));
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
