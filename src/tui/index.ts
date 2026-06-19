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
  /** Where to discover `.onto/{review,reconstruct}` sessions (defaults to cwd). */
  projectRoot: string;
  /** Explicit onto-mcp install root for the read APIs; auto-resolved when unset. */
  ontoHome?: string;
}

function parseArgs(argv: string[]): WatchArgs {
  let session: string | undefined;
  let projectRoot = process.cwd();
  let ontoHome: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--project-root") {
      const value = argv[++index];
      if (value) projectRoot = path.resolve(value);
    } else if (arg === "--onto-home") {
      const value = argv[++index];
      if (value) ontoHome = path.resolve(value);
    } else if (!arg.startsWith("-") && session === undefined) {
      session = arg;
    }
  }
  return {
    ...(session !== undefined ? { session } : {}),
    projectRoot,
    ...(ontoHome !== undefined ? { ontoHome } : {}),
  };
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

interface ResolvedWatch {
  sessions: SessionRef[];
  initialSession?: SessionRef;
  error?: string;
}

async function resolveWatch(args: WatchArgs): Promise<ResolvedWatch> {
  const sessions = await discoverSessions(args.projectRoot);
  if (!args.session) {
    // No arg → open the SessionSelector (error only when there is nothing to show).
    if (sessions.length === 0) {
      return { sessions, error: `no review/reconstruct sessions under ${args.projectRoot}/.onto` };
    }
    return { sessions };
  }
  const byPath = refFromPath(args.session);
  if (byPath) {
    return { sessions: sessions.length ? sessions : [byPath], initialSession: byPath };
  }
  const match = sessions.find((s) => s.sessionId.includes(args.session!));
  if (!match) {
    return { sessions, error: `no session matching "${args.session}"` };
  }
  return { sessions, initialSession: match };
}

export async function runWatch(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const { sessions, initialSession, error } = await resolveWatch(args);
  if (error) {
    process.stderr.write(`[onto watch] ${error}\n`);
    return 1;
  }
  const instance = render(
    createElement(WatchApp, {
      sessions,
      ...(initialSession ? { initialSession } : {}),
      // projectRoot is for session discovery only; the read APIs resolve the
      // onto-mcp install root themselves (or from an explicit --onto-home), so
      // running `onto watch` from a non-install project does not break.
      ...(args.ontoHome ? { ontoHome: args.ontoHome } : {}),
    }),
  );
  await instance.waitUntilExit();
  return 0;
}
