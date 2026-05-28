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
): string {
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
  const boundedPrompt = buildBoundedPrompt(
    packetPath,
    packetText,
    outputPath,
    unitId,
    unitKind,
  );

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  await runCodexWorker(
    projectRoot,
    boundedPrompt,
    outputPath,
    values.model,
    values["sandbox-mode"],
    values["reasoning-effort"],
    values["config-override"],
    unitId,
    unitKind,
    sessionRoot,
  );

  const outputText = await fs.readFile(outputPath, "utf8");
  if (outputText.trim().length === 0) {
    throw new Error(`Codex executor produced empty output: ${outputPath}`);
  }

  console.log(
    JSON.stringify(
      {
        unit_id: unitId,
        unit_kind: unitKind,
        packet_path: packetPath,
        output_path: outputPath,
        realization: "worker",
        host_runtime: "codex",
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
