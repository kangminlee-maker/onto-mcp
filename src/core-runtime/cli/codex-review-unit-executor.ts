#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { runCliWorkerUnit } from "./cli-worker-runner.js";
import { createCodexWorkerAdapter } from "./worker-adapters/codex.js";
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
  const sandboxMode = requireString(values["sandbox-mode"], "sandbox-mode");

  // Review Recovery PR-1 (R1 observability symmetry). The codex executor does
  // NOT go through callLlm — it spawns `codex exec` directly — so this single
  // startup emit gives parent-process log correlators a breadcrumb for the
  // lens-execution Codex worker (one [plan:executor] line per lens).
  process.stderr.write(
    `[plan:executor] kind=codex unit_id=${unitId} model=${
      typeof values.model === "string" && values.model.length > 0
        ? values.model
        : "(codex default)"
    } sandbox=${sandboxMode} effort=${
      typeof values["reasoning-effort"] === "string" && values["reasoning-effort"].length > 0
        ? values["reasoning-effort"]
        : "(codex default)"
    }\n`,
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

  const adapter = createCodexWorkerAdapter({
    sandboxMode,
    ...(typeof values.model === "string" && values.model.length > 0
      ? { model: values.model }
      : {}),
    ...(typeof values["reasoning-effort"] === "string" && values["reasoning-effort"].length > 0
      ? { reasoningEffort: values["reasoning-effort"] }
      : {}),
    configOverrides: values["config-override"] ?? [],
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
