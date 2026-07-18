#!/usr/bin/env node

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { awaitChildExit } from "../child-process-exit.js";
import {
  appendRuntimeStreamChunkSync,
  appendRuntimeStreamEventSync,
} from "../observability/runtime-stream-observation.js";
import { semanticQualityEvidenceForArtifactGeneration } from "../review/artifact-generation-realization.js";
import {
  buildBoundedPrompt,
  coerceStructuredPayload,
  parseOutputFormat,
  requireString,
  writeLensSidecarArtifactFromPayload,
  writeOutputSchemaFile,
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

async function removeFileIfPresent(filePath: string): Promise<void> {
  await fs.rm(filePath, { force: true });
}

/**
 * Salvage mode (opt-in, parent-invoked after retry exhaustion): codex
 * counterpart of the claude executor's salvage — recover the frozen
 * attempt's semantics without re-engaging the violating model. Schema
 * enforcement rides the normal `--output-schema` file; the salvaged payload
 * goes through the SAME validator/writer as a self-submitted payload.
 */
async function runCodexSubmitSalvageMode(args: {
  salvageFrom: string;
  outputFormat: string;
  structuredOutput: { schemaPath: string; state: WorkerStructuredOutputState };
  boundedPrompt: string;
  outputPath: string;
  unitId: string;
  unitKind: string;
  projectRoot: string;
  sessionRoot: string;
  sandboxMode: string | boolean | undefined;
  model: string | boolean | undefined;
  reasoningEffort: string | boolean | undefined;
  transcriptionModel: string | undefined;
  configOverrides: string[];
  timeoutMs: number | undefined;
}): Promise<number> {
  const frozen = JSON.parse(
    await fs.readFile(args.salvageFrom, "utf8"),
  ) as SalvageInput;
  let payload: Record<string, unknown> | null = null;
  try {
    payload = coerceStructuredPayload(
      frozen.stdout,
      `salvage frozen payload ${args.unitId}`,
    );
  } catch {
    payload = null;
  }
  const resultText =
    payload === null && frozen.stdout.trim().length > 0 ? frozen.stdout : null;
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
    `[plan:executor] kind=codex unit_id=${args.unitId} salvage=${mode.mode}\n`,
  );

  const salvageRawPath = `${args.outputPath}.codex-salvage-output.json`;
  const prompt =
    mode.mode === "delta_rows"
      ? buildDeltaRowsSalvagePrompt({
          boundedPrompt: args.boundedPrompt,
          missingIssueIds: mode.missingIssueIds,
        })
      : buildTranscriptionSalvagePrompt({
          resultText: resultText ?? JSON.stringify(payload, null, 2),
          error: frozen.error,
        });
  await runCodexWorker(
    args.projectRoot,
    prompt,
    salvageRawPath,
    // delta completion is fresh semantic judgment — same-tier instance;
    // transcription may use the configured cheap model.
    mode.mode === "delta_rows" ? args.model : args.transcriptionModel ?? args.model,
    args.sandboxMode,
    // delta completion is same-tier incl. the unit's reasoning effort; a
    // configured transcription model runs at its own default effort.
    mode.mode === "delta_rows" || args.transcriptionModel === undefined
      ? args.reasoningEffort
      : undefined,
    args.configOverrides,
    args.unitId,
    args.unitKind,
    args.sessionRoot,
    args.structuredOutput.schemaPath,
    args.timeoutMs,
  );
  const rawText = await fs.readFile(salvageRawPath, "utf8");
  if (rawText.includes(SALVAGE_INCOMPLETE_SENTINEL)) {
    throw new Error(
      `submit salvage aborted for ${args.unitId}: ${SALVAGE_INCOMPLETE_SENTINEL} (frozen output lacks required content; refusing to invent).`,
    );
  }
  const salvageOutput = coerceStructuredPayload(
    rawText,
    `salvage output ${args.unitId}`,
  );
  const salvagedPayload =
    mode.mode === "delta_rows"
      ? mergeMissingStanceRows(payload as Record<string, unknown>, salvageOutput)
      : salvageOutput;
  const fields =
    args.structuredOutput.state.outputFormat === "lens-sidecar"
      ? await writeLensSidecarArtifactFromPayload({
          payload: salvagedPayload,
          outputPath: args.outputPath,
          state: args.structuredOutput.state.lensSidecarState,
        })
      : await writeRuntimeSubmitArtifactFromPayload({
          payload: salvagedPayload,
          outputPath: args.outputPath,
          state: args.structuredOutput.state.runtimeSubmitState,
        });
  await removeFileIfPresent(salvageRawPath);
  await removeFileIfPresent(args.structuredOutput.schemaPath);
  return fields;
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
  timeoutMs?: number | undefined,
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

  // Self-enforced unit timeout (`--timeout-ms`): in the flat path the parent
  // runner kills timed-out workers, but a nesting batch script has no
  // per-unit kill switch — a hung inner would otherwise hold its wave's
  // `wait` barrier and burn the outer worker's whole multi-wave budget. The
  // executor bounding itself keeps a hang local to one unit in every
  // topology.
  let timedOut = false;
  let timeoutTimer: NodeJS.Timeout | null = null;
  let forceKillTimer: NodeJS.Timeout | null = null;
  if (typeof timeoutMs === "number" && timeoutMs > 0) {
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
    }, timeoutMs);
  }

  const exitCode = await awaitChildExit(child, {
    onSettled: () => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
    },
    mapError: (err) =>
      err.code === "ENOENT"
        ? new Error("codex CLI not found. Install codex or use a different executor.")
        : err,
  });

  if (timedOut) {
    try {
      fsSync.rmSync(outputPath, { force: true });
    } catch {
      // ignore
    }
    if (runningLogStream) {
      try {
        runningLogStream.write(`ENV-AFTER unit=${unitId} exit=timeout\n`);
        runningLogStream.end();
      } catch {
        // ignore
      }
    }
    throw new Error(
      `Codex worker executor timed out after ${timeoutMs} ms for ${unitId}.`,
    );
  }
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
    if (!structuredOutput) {
      throw new Error(`Missing structured output state for ${outputFormat}.`);
    }
    structuredPayloadFields = await runCodexSubmitSalvageMode({
      salvageFrom,
      outputFormat,
      structuredOutput,
      boundedPrompt,
      outputPath,
      unitId,
      unitKind,
      projectRoot,
      sessionRoot,
      sandboxMode,
      model: values.model,
      reasoningEffort: values["reasoning-effort"],
      transcriptionModel,
      configOverrides: values["config-override"],
      timeoutMs,
    });
  } else {
    // Stale-freeze hygiene: freeze presence is the parent's structural
    // salvage trigger and must reflect the LAST attempt only.
    if (outputFormat !== "markdown") {
      await fs.rm(salvageInputPathFor(outputPath), { force: true });
    }
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
      timeoutMs,
    );

    if (outputFormat !== "markdown") {
      if (!structuredOutput) {
        throw new Error(`Missing structured output state for ${outputFormat}.`);
      }
      const rawText = await fs.readFile(rawOutputPath, "utf8");
      try {
        const payload = coerceStructuredPayload(
          rawText,
          `Codex structured output ${rawOutputPath}`,
        );
        structuredPayloadFields =
          structuredOutput.state.outputFormat === "lens-sidecar"
            ? await writeLensSidecarArtifactFromPayload({
                payload,
                outputPath,
                state: structuredOutput.state.lensSidecarState,
              })
            : await writeRuntimeSubmitArtifactFromPayload({
                payload,
                outputPath,
                state: structuredOutput.state.runtimeSubmitState,
              });
      } catch (error: unknown) {
        // Freeze the failing attempt's evidence for the opt-in salvage path.
        const frozen: SalvageInput = {
          unit_id: unitId,
          unit_kind: unitKind,
          output_format: outputFormat,
          stdout: rawText,
          error: error instanceof Error ? error.message : String(error),
        };
        await fs.writeFile(
          salvageInputPathFor(outputPath),
          JSON.stringify(frozen),
          "utf8",
        );
        throw error;
      }
      await removeFileIfPresent(rawOutputPath);
      await removeFileIfPresent(structuredOutput.schemaPath);
    } else {
      const outputText = await fs.readFile(outputPath, "utf8");
      if (outputText.trim().length === 0) {
        throw new Error(`Codex executor produced empty output: ${outputPath}`);
      }
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
