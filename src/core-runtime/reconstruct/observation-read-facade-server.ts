/**
 * Entry point for the observation-read facade — the process codex launches as an MCP server
 * (design 20260726 §4, stage 3b). Everything with judgment in it lives in `observation-read-facade.ts`;
 * this file is the process shell: argv, env, stdio, exit codes.
 *
 * Launched as `node <this file compiled> --descriptor=<path>` with the launch token in
 * `ONTO_OBSERVATION_READ_LAUNCH_TOKEN`. It refuses to serve unless both are present and the token
 * matches the descriptor's — a facade holding one dispatch's descriptor and another's env would
 * otherwise serve the wrong session's snapshot.
 *
 * Exits non-zero BEFORE reading a single request when the launch is malformed: codex then reports a
 * dead server rather than the worker discovering mid-turn that its tool answers nothing.
 */
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import {
  handleFacadeMessage,
  OBSERVATION_READ_LAUNCH_TOKEN_ENV,
  ObservationReadFacadeSession,
  parseObservationReadFacadeDescriptor,
} from "./observation-read-facade.js";

function fail(message: string): never {
  process.stderr.write(`onto observation-read facade: ${message}\n`);
  process.exit(2);
}

const descriptorArgument = process.argv
  .slice(2)
  .find((argument) => argument.startsWith("--descriptor="));
if (!descriptorArgument) fail("missing --descriptor=<path>");
const descriptorPath = descriptorArgument.slice("--descriptor=".length);
if (descriptorPath.length === 0) fail("--descriptor= requires a path");

let descriptorText: string;
try {
  descriptorText = readFileSync(descriptorPath, "utf8");
} catch (error) {
  fail(`cannot read descriptor at ${descriptorPath}: ${(error as Error).message}`);
}

let session: ObservationReadFacadeSession;
try {
  const descriptor = parseObservationReadFacadeDescriptor(descriptorText);
  const launchToken = process.env[OBSERVATION_READ_LAUNCH_TOKEN_ENV];
  if (typeof launchToken !== "string" || launchToken.length === 0) {
    fail(`missing ${OBSERVATION_READ_LAUNCH_TOKEN_ENV}`);
  }
  if (launchToken !== descriptor.launch_token) {
    // Never echo either value: the point of the check is that they disagree, not what they are.
    fail("launch token does not match the descriptor — refusing to serve another dispatch's grant");
  }
  session = new ObservationReadFacadeSession({ descriptor });
} catch (error) {
  fail((error as Error).message);
}

const write = (value: unknown): void => {
  process.stdout.write(`${JSON.stringify(value)}\n`);
};

const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
  const trimmed = line.trim();
  if (trimmed.length === 0) return;
  let message: unknown;
  try {
    message = JSON.parse(trimmed);
  } catch {
    // A frame we cannot parse has no id to answer, so there is nothing to reply to. Dropping it is the
    // only correct move; the worker's own call will time out and report.
    return;
  }
  const response = handleFacadeMessage(message, session);
  if (response) write(response);
});

// stdin closing means codex is done with this server. The grant dies with the process — that is the
// design's "종료 시 회수". The receipt on disk is already current: it is rewritten after every attempt.
lines.on("close", () => process.exit(0));
