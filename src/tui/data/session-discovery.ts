/**
 * Enumerates review/reconstruct session directories under a project's `.onto/`
 * for the `onto watch` SessionSelector. Read-only listing; status enrichment is
 * left to the caller (which polls getReviewStatus / getRunStatus per session).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { runtimeStreamEventLogPath } from "../../core-api/runtime-observation.js";

export type WatchPipeline = "review" | "reconstruct";

export interface SessionRef {
  pipeline: WatchPipeline;
  sessionId: string;
  sessionRoot: string;
  /** Last-modified time of the session directory (ms epoch), for ordering. */
  modifiedMs: number;
}

const PIPELINE_DIRS: Record<WatchPipeline, string> = {
  review: "review",
  reconstruct: "reconstruct",
};

async function listPipelineSessions(
  projectRoot: string,
  pipeline: WatchPipeline,
): Promise<SessionRef[]> {
  const root = path.join(path.resolve(projectRoot), ".onto", PIPELINE_DIRS[pipeline]);
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const sessions: SessionRef[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sessionRoot = path.join(root, entry.name);
    let modifiedMs = 0;
    try {
      modifiedMs = (await fs.stat(sessionRoot)).mtimeMs;
    } catch {
      continue;
    }
    // The root dir mtime misses content appends (a running session keeps
    // appending to runtime-events.ndjson and nested running logs without
    // touching the dir entry), so fold in the event log's mtime as the primary
    // activity signal — otherwise an active session can sort below older ones.
    try {
      const eventMs = (await fs.stat(runtimeStreamEventLogPath(sessionRoot))).mtimeMs;
      if (eventMs > modifiedMs) modifiedMs = eventMs;
    } catch {
      // No event log yet — fall back to the dir mtime.
    }
    sessions.push({
      pipeline,
      sessionId: entry.name,
      sessionRoot,
      modifiedMs,
    });
  }
  return sessions;
}

/**
 * Lists all review + reconstruct sessions under `projectRoot/.onto/`, most
 * recently modified first.
 */
export async function discoverSessions(
  projectRoot: string,
): Promise<SessionRef[]> {
  const [review, reconstruct] = await Promise.all([
    listPipelineSessions(projectRoot, "review"),
    listPipelineSessions(projectRoot, "reconstruct"),
  ]);
  return [...review, ...reconstruct].sort((a, b) => b.modifiedMs - a.modifiedMs);
}
