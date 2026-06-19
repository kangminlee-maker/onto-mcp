/**
 * Tails a session's append-only `runtime-events.ndjson` for the `onto watch`
 * TUI. Read-only: it never writes the stream. Reads existing lines, then polls
 * for appended lines (offset-tracked) and yields parsed events until aborted.
 */
import fs from "node:fs/promises";
import {
  runtimeStreamEventLogPath,
  type RuntimeStreamEvent,
} from "../../core-api/runtime-observation.js";

function parseEventLine(line: string): RuntimeStreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as RuntimeStreamEvent;
    // Defensive: only accept well-formed runtime_stream events.
    if (parsed && parsed.event_kind === "runtime_stream") return parsed;
    return null;
  } catch {
    return null;
  }
}

/** One-shot read of all events currently in the session's stream. */
export async function readRuntimeEvents(
  sessionRoot: string,
): Promise<RuntimeStreamEvent[]> {
  const logPath = runtimeStreamEventLogPath(sessionRoot);
  let raw: string;
  try {
    raw = await fs.readFile(logPath, "utf8");
  } catch {
    return [];
  }
  return raw.split("\n").map(parseEventLine).filter(
    (event): event is RuntimeStreamEvent => event !== null,
  );
}

export interface FollowRuntimeEventsOptions {
  /** Poll interval for appended lines (ms). Default 500. */
  pollMs?: number;
  /** Stops the follower when aborted. */
  signal?: AbortSignal;
  /** When true, yields the existing backlog before following. Default true. */
  emitBacklog?: boolean;
}

/**
 * Async iterator over a session's runtime events: emits the existing backlog
 * (unless disabled), then appended events as they land, until `signal` aborts
 * or `pollMs` cannot be honored. Tracks a byte offset and only re-parses the
 * trailing partial line on each tick.
 */
export async function* followRuntimeEvents(
  sessionRoot: string,
  options: FollowRuntimeEventsOptions = {},
): AsyncGenerator<RuntimeStreamEvent> {
  const { pollMs = 500, signal, emitBacklog = true } = options;
  const logPath = runtimeStreamEventLogPath(sessionRoot);
  let offset = 0;
  let pending = "";
  let firstRead = true;

  while (!signal?.aborted) {
    let chunk = "";
    try {
      const handle = await fs.open(logPath, "r");
      try {
        const stat = await handle.stat();
        if (stat.size < offset) {
          // File shrank/rotated — restart from the top.
          offset = 0;
          pending = "";
        }
        if (stat.size > offset) {
          const length = stat.size - offset;
          const buffer = Buffer.alloc(length);
          await handle.read(buffer, 0, length, offset);
          chunk = buffer.toString("utf8");
          offset = stat.size;
        }
      } finally {
        await handle.close();
      }
    } catch {
      // Stream not created yet — wait and retry.
    }

    // Abort may have landed during the fs read; bail before yielding so a late
    // event from an aborted follower never reaches the consumer.
    if (signal?.aborted) return;

    if (chunk) {
      pending += chunk;
      const lines = pending.split("\n");
      // Keep the trailing (possibly partial) line for the next tick.
      pending = lines.pop() ?? "";
      const emit = firstRead && !emitBacklog ? [] : lines;
      for (const line of emit) {
        const event = parseEventLine(line);
        if (event) yield event;
      }
    }
    firstRead = false;

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}
