#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { runCliWorkerUnit } from "./cli-worker-runner.js";
import { createClaudeWorkerAdapter } from "./worker-adapters/claude.js";
import { buildBoundedReviewUnitPrompt } from "./bounded-review-unit-prompt.js";

function requireString(
  value: string | boolean | undefined,
  optionName: string,
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required option --${optionName}`);
  }
  return value;
}

export async function runClaudeReviewUnitExecutorCli(
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
      tools: { type: "string" },
      "permission-mode": { type: "string" },
      "add-dir": { type: "string", multiple: true, default: [] },
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

  // Observability symmetry with the codex executor: one [plan:executor]
  // breadcrumb per lens. The claude worker spawns `claude -p` directly (not
  // through callLlm).
  process.stderr.write(
    `[plan:executor] kind=claude unit_id=${unitId} model=${
      typeof values.model === "string" && values.model.length > 0
        ? values.model
        : "(claude default)"
    } tools=${typeof values.tools === "string" && values.tools.length > 0 ? values.tools : "Read,Glob,Grep"}\n`,
  );

  const packetText = await fs.readFile(packetPath, "utf8");
  const boundedPrompt = buildBoundedReviewUnitPrompt(
    packetPath,
    packetText,
    outputPath,
    unitId,
    unitKind,
  );

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const adapter = createClaudeWorkerAdapter({
    ...(typeof values.model === "string" && values.model.length > 0
      ? { model: values.model }
      : {}),
    ...(typeof values.tools === "string" && values.tools.length > 0
      ? { tools: values.tools }
      : {}),
    ...(typeof values["permission-mode"] === "string" && values["permission-mode"].length > 0
      ? { permissionMode: values["permission-mode"] }
      : {}),
    addDirs: values["add-dir"] ?? [],
  });

  await runCliWorkerUnit(adapter, {
    projectRoot,
    sessionRoot,
    unitId,
    unitKind,
    outputPath,
    boundedPrompt,
  });

  const outputText = await fs.readFile(outputPath, "utf8");
  if (outputText.trim().length === 0) {
    throw new Error(`Claude executor produced empty output: ${outputPath}`);
  }

  console.log(
    JSON.stringify(
      {
        unit_id: unitId,
        unit_kind: unitKind,
        packet_path: packetPath,
        output_path: outputPath,
        realization: "worker",
        host_runtime: "claude",
      },
      null,
      2,
    ),
  );
  return 0;
}

async function main(): Promise<number> {
  return runClaudeReviewUnitExecutorCli(process.argv.slice(2));
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
