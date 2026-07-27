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

/**
 * ONE response in flight at a time — the shell's whole concurrency policy, and the reason it is a queue
 * rather than a `line` handler that writes.
 *
 * `session.commit()` publishes the session's CURRENT state, so anything handled between producing a
 * response and that response's write callback is published by the earlier callback — evidence for a
 * call that had not been delivered. `readline` hands over every line in a chunk before any callback
 * runs, so a pipelined client reached exactly that. Serializing removes the window instead of trying to
 * describe it, and it also means no frame is handled after a terminal response has set the latch.
 *
 * Exit happens from the write callback, never from `drain`: a measured Writable emits `drain` BETWEEN
 * pending write callbacks (`write-callback → drain → write-callback-2`), so exiting on `drain` could
 * preempt the commit for a response that had already gone out.
 */
const queue: string[] = [];
let inFlight = false;
let stdinEnded = false;
let closed = false;

function exitNow(code: number): void {
  if (closed) return;
  closed = true;
  queue.length = 0;
  lines.close();
  process.exit(code);
}

function pump(): void {
  if (inFlight || closed) return;
  const line = queue.shift();
  if (line === undefined) {
    if (stdinEnded) exitNow(0);
    return;
  }
  const trimmed = line.trim();
  if (trimmed.length === 0) return pump();
  let message: unknown;
  try {
    message = JSON.parse(trimmed);
  } catch {
    // A frame we cannot parse has no id to answer, so there is nothing to reply to. Dropping it is the
    // only correct move; the worker's own call will time out and report.
    return pump();
  }
  const response = handleFacadeMessage(message, session);
  if (!response) return pump();
  inFlight = true;
  process.stdout.write(`${JSON.stringify(response)}\n`, (error) => {
    // The ERROR ARGUMENT is the delivery verdict, and ignoring it was the same mistake one level down:
    // entering this callback proves the write COMPLETED, not that it succeeded. Node calls it with EPIPE
    // when the reader is gone, and committing there published a page nobody received — the very thing
    // deferring the commit was meant to prevent. On a failed write nothing is published and the process
    // ends, so the runtime sees the previous receipt and fails closed.
    if (error) return exitNow(1);
    // Published only now: until these bytes are out, the worker has received nothing, and a receipt
    // written earlier would claim a page that never arrived.
    session.commit();
    inFlight = false;
    // A session with nothing left can only refuse from here on. Closing ends that surface.
    if (session.isSpent) return exitNow(0);
    pump();
  });
}

const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
  queue.push(line);
  pump();
});

// stdin closing means codex is done with this server. The grant dies with the process — that is the
// design's "종료 시 회수". Anything still in flight commits from its own callback before the exit.
lines.on("close", () => {
  stdinEnded = true;
  pump();
});
