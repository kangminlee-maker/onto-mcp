/**
 * `onto watch [session]` entry. Resolves a session (by id substring, by path, or
 * most-recent when omitted) and mounts the Ink app. v1 is observe-only; the
 * SessionSelector screen (no-arg browsing) and the Log screen arrive in Stage C.
 */
import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { render } from "ink";
import { WatchApp } from "./app.js";
import { discoverSessions, type SessionRef } from "./data/session-discovery.js";

interface WatchArgs {
  session?: string;
  projectRoot: string;
}

function parseArgs(argv: string[]): WatchArgs {
  let session: string | undefined;
  let projectRoot = process.cwd();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--project-root") {
      const value = argv[++index];
      if (value) projectRoot = path.resolve(value);
    } else if (!arg.startsWith("-") && session === undefined) {
      session = arg;
    }
  }
  return { ...(session !== undefined ? { session } : {}), projectRoot };
}

/** Derives a SessionRef from an explicit session-root path, when it resolves to
 * a `.onto/{review,reconstruct}/<id>` directory. */
function refFromPath(sessionPath: string): SessionRef | null {
  const resolved = path.resolve(sessionPath);
  if (!fs.existsSync(resolved)) return null;
  const parts = resolved.split(path.sep);
  const idx = parts.lastIndexOf(".onto");
  const pipeline = parts[idx + 1];
  if (pipeline !== "review" && pipeline !== "reconstruct") return null;
  const stat = (() => {
    try {
      return fs.statSync(resolved).mtimeMs;
    } catch {
      return 0;
    }
  })();
  return {
    pipeline,
    sessionId: parts[parts.length - 1] ?? resolved,
    sessionRoot: resolved,
    modifiedMs: stat,
  };
}

async function resolveSession(
  args: WatchArgs,
): Promise<{ ref: SessionRef | null; reason?: string }> {
  if (args.session) {
    const byPath = refFromPath(args.session);
    if (byPath) return { ref: byPath };
  }
  const sessions = await discoverSessions(args.projectRoot);
  if (sessions.length === 0) {
    return { ref: null, reason: `no review/reconstruct sessions under ${args.projectRoot}/.onto` };
  }
  if (!args.session) return { ref: sessions[0]! }; // most recently modified
  const match = sessions.find((s) => s.sessionId.includes(args.session!));
  if (!match) {
    return { ref: null, reason: `no session matching "${args.session}"` };
  }
  return { ref: match };
}

export async function runWatch(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const { ref, reason } = await resolveSession(args);
  if (!ref) {
    process.stderr.write(`[onto watch] ${reason}\n`);
    return 1;
  }
  const instance = render(
    createElement(WatchApp, { session: ref, ontoHome: args.projectRoot }),
  );
  await instance.waitUntilExit();
  return 0;
}
