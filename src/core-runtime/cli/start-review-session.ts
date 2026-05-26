#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runPrepareReviewSessionCli } from "./prepare-review-session.js";
import { runMaterializeReviewPromptPacketsCli } from "./materialize-review-prompt-packets.js";
import { readSingleOptionValueFromArgv } from "../review/review-artifact-utils.js";
import { printOntoReleaseChannelNotice } from "../release-channel/release-channel.js";

function requireString(
  value: string | boolean | undefined,
  optionName: string,
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required option --${optionName}`);
  }
  return value;
}

async function main(): Promise<number> {
  await printOntoReleaseChannelNotice();
  return runStartReviewSessionCli(process.argv.slice(2));
}

export interface StartReviewSessionResult {
  session_root: string;
  bounded_start_steps: string[];
}

export async function startReviewSession(
  argv: string[],
): Promise<StartReviewSessionResult> {
  await runPrepareReviewSessionCli(argv);

  const projectRoot = path.resolve(
    readSingleOptionValueFromArgv(argv, "project-root") ?? ".",
  );
  const sessionId = requireString(
    readSingleOptionValueFromArgv(argv, "session-id"),
    "session-id",
  );
  const sessionRoot = path.join(projectRoot, ".onto", "review", sessionId);

  const maxEmbedLines = readSingleOptionValueFromArgv(argv, "max-embed-lines");
  const ontoHomePassthrough = readSingleOptionValueFromArgv(argv, "onto-home");
  const promptPacketsArgs = [
    "--project-root",
    projectRoot,
    "--session-root",
    sessionRoot,
  ];
  if (typeof ontoHomePassthrough === "string" && ontoHomePassthrough.length > 0) {
    promptPacketsArgs.push("--onto-home", ontoHomePassthrough);
  }
  if (typeof maxEmbedLines === "string" && maxEmbedLines.length > 0) {
    promptPacketsArgs.push("--max-embed-lines", maxEmbedLines);
  }

  await runMaterializeReviewPromptPacketsCli(promptPacketsArgs);

  // Write `.latest-session` pointer so the watcher script and other tools can
  // auto-discover the current session without parsing buffered npm stdout.
  // This is a deterministic side-effect: a single line containing the absolute
  // session-root path. Best-effort — failure here must not block session start.
  try {
    const latestSessionPath = path.join(
      projectRoot,
      ".onto",
      "review",
      ".latest-session",
    );
    await fs.writeFile(latestSessionPath, sessionRoot, "utf8");
  } catch {
    // best-effort, ignore
  }

  return {
    session_root: sessionRoot,
    bounded_start_steps: [
      "review:prepare-session",
      "review:materialize-prompt-packets",
    ],
  };
}

export async function runStartReviewSessionCli(
  argv: string[],
): Promise<number> {
  const result = await startReviewSession(argv);
  console.log(
    JSON.stringify(result, null, 2),
  );
  return 0;
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
