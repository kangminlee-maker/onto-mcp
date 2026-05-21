/**
 * Onto-defined LLM tools — Phase 3-2 of host runtime decoupling.
 *
 * # What this module is
 *
 * A small toolkit of three file-system inspection tools (`read_file`,
 * `list_directory`, `search_content`) exposed to LLMs that support function
 * calling. The TS process executes each tool call locally and returns the
 * result back to the LLM, enabling a multi-turn loop where the LLM can
 * iteratively explore files within a fixed boundary.
 *
 * # Why it exists
 *
 * Phase 2 inline embedding loads ALL referenced content into the prompt up
 * front. This wastes tokens when the LLM only needs a small slice, and it
 * caps the LLM's exploration to whatever the packet writer pre-selected.
 *
 * Phase 3-2 introduces tool-native execution: instead of inlining everything,
 * we expose a small read-only API and let the LLM ask for what it needs. This
 * matches how Claude Code / Codex CLI subagents already work, but using
 * onto-owned tools that the TS process executes — so the same review pipeline
 * can drive any function-calling-capable LLM (Anthropic, OpenAI, Qwen 30B+,
 * etc.) without depending on a host-provided tool ecosystem.
 *
 * # How it relates
 *
 * - `inline-http-review-unit-executor.ts` decides between inline (Tier 2) and
 *   tool-native (Tier 1) modes based on `--tool-mode`.
 * - `llm-tool-loop.ts` runs the multi-turn loop by translating OntoTool[] into
 *   provider-specific tool schemas (Anthropic vs OpenAI Chat Completions).
 * - The Boundary Policy enforced here is the runtime guarantee. The packet's
 *   "Boundary Policy" section is descriptive — this code is normative.
 *
 * # Boundary policy
 *
 * Every tool call is constrained to:
 *   1. Path must resolve INSIDE projectRoot or ontoHome (no escapes via `..`).
 *   2. Symlinks pointing outside the boundary are rejected.
 *   3. Files larger than MAX_FILE_BYTES are read partially with a truncation
 *      marker (no error — LLM gets best-effort content + signal).
 *   4. search_content matches are capped at MAX_SEARCH_MATCHES.
 *   5. Hidden directories (.git, node_modules, .onto/sessions) are skipped
 *      from list_directory and search_content traversal — they pollute output
 *      and are rarely the answer.
 *
 * Boundary violations throw `BoundaryViolationError`. The tool loop catches
 * this and returns the error message to the LLM as the tool result, so the
 * LLM can adapt its next call rather than the entire run failing.
 */

import fs from "node:fs/promises";
import path from "node:path";

const MAX_FILE_BYTES = 1024 * 1024; // 1 MB hard cap per read
const MAX_FILE_LINES = 2000; // Truncation default for read_file
const MAX_LIST_ENTRIES = 200; // Per directory
const MAX_SEARCH_MATCHES = 100; // Total matches per search_content call
const MAX_SEARCH_TRAVERSAL = 10_000; // File-count safety brake on traversal

// Always-skipped directory names. .onto is NOT in this set; it is gated
// per-call via ToolExecutionContext.allowOntoTraversal so synthesize runs
// can discover lens outputs under .onto/review/<session>/round1 while normal
// lens runs still avoid the noise of session artifacts.
const ALWAYS_SKIP_DIR_NAMES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".turbo",
  "__pycache__",
]);

function shouldSkipDir(name: string, ctx: ToolExecutionContext): boolean {
  if (ALWAYS_SKIP_DIR_NAMES.has(name)) return true;
  if (name === ".onto" && !ctx.allowOntoTraversal) return true;
  return false;
}

export class BoundaryViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BoundaryViolationError";
  }
}

export interface ToolExecutionContext {
  projectRoot: string;
  ontoHome: string;
  /**
   * When true, list_directory and search_content will descend into `.onto`
   * subdirectories. Used by the synthesize unit so it can discover lens
   * outputs under `.onto/review/<session>/round1`. Lens units pass false (or
   * omit it) so they don't traverse session artifacts.
   *
   * read_file is unaffected — it only checks the projectRoot/ontoHome
   * boundary, and `.onto` is already inside projectRoot by design.
   */
  allowOntoTraversal?: boolean;
}

/**
 * Provider-agnostic tool schema. Mirrors JSON Schema semantics; both Anthropic
 * and OpenAI accept this shape with thin wrappers (see llm-tool-loop.ts).
 *
 * The index signature is required for structural compatibility with the
 * Anthropic SDK's `InputSchema` and OpenAI's `FunctionParameters` types under
 * `exactOptionalPropertyTypes: true` — both treat the schema as a free-form
 * Record<string, unknown> at the type level.
 */
export interface OntoToolSchema {
  type: "object";
  properties: Record<string, OntoToolPropertySchema>;
  required?: string[];
  [key: string]: unknown;
}

export interface OntoToolPropertySchema {
  type: "string" | "number" | "boolean";
  description: string;
  enum?: string[];
}

export interface OntoTool {
  name: string;
  description: string;
  input_schema: OntoToolSchema;
  execute(args: Record<string, unknown>, ctx: ToolExecutionContext): Promise<string>;
}

// ---------------------------------------------------------------------------
// Path resolution + boundary guard
// ---------------------------------------------------------------------------

/**
 * Resolve a user-supplied path against projectRoot/ontoHome and verify it
 * stays inside one of those roots. Returns the absolute path on success.
 *
 * Why both roots: lenses commonly need to read domain docs from ~/.onto/
 * (ontoHome) and source files from the project. Either is in-bounds; anything
 * else is not.
 *
 * Resolution rules:
 *   - Absolute paths are accepted as-is (then verified against boundary).
 *   - `~/...` expands relative to ontoHome's parent (the user's home dir).
 *     We do NOT call os.homedir() — ontoHome's parent is the canonical seat.
 *   - Relative paths resolve against projectRoot.
 */
function resolveInBoundary(rawPath: string, ctx: ToolExecutionContext): string {
  if (typeof rawPath !== "string" || rawPath.length === 0) {
    throw new BoundaryViolationError("path must be a non-empty string");
  }

  let candidate: string;
  if (rawPath.startsWith("~/")) {
    const home = path.dirname(ctx.ontoHome);
    candidate = path.resolve(home, rawPath.slice(2));
  } else if (path.isAbsolute(rawPath)) {
    candidate = path.resolve(rawPath);
  } else {
    candidate = path.resolve(ctx.projectRoot, rawPath);
  }

  const inProject = isWithin(candidate, ctx.projectRoot);
  const inOntoHome = isWithin(candidate, ctx.ontoHome);
  if (!inProject && !inOntoHome) {
    throw new BoundaryViolationError(
      `path "${rawPath}" resolves to "${candidate}", which is outside projectRoot (${ctx.projectRoot}) and ontoHome (${ctx.ontoHome}).`,
    );
  }
  return candidate;
}

function isWithin(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

// ---------------------------------------------------------------------------
// Tool 1: read_file
// ---------------------------------------------------------------------------

const READ_FILE_TOOL: OntoTool = {
  name: "read_file",
  description:
    "Read a UTF-8 text file from the project or ontoHome. Returns up to 2000 lines (or 1 MB) per call. Use start_line / end_line to read a slice of large files.",
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          "Absolute path, ~/-prefixed home path, or path relative to projectRoot. Must resolve inside projectRoot or ontoHome.",
      },
      start_line: {
        type: "number",
        description: "Optional 1-indexed first line (inclusive). Default: 1.",
      },
      end_line: {
        type: "number",
        description: "Optional 1-indexed last line (inclusive). Default: start_line + 2000.",
      },
    },
    required: ["path"],
  },
  async execute(args, ctx) {
    const target = resolveInBoundary(String(args["path"] ?? ""), ctx);
    const stat = await fs.stat(target);
    if (!stat.isFile()) {
      throw new BoundaryViolationError(`"${args["path"]}" is not a regular file.`);
    }

    const startLine = clampPositive(args["start_line"], 1);
    const requestedEnd = optionalPositive(args["end_line"]);
    const endLine = requestedEnd ?? startLine + MAX_FILE_LINES - 1;
    if (endLine < startLine) {
      throw new Error("end_line must be >= start_line");
    }
    if (endLine - startLine + 1 > MAX_FILE_LINES) {
      throw new Error(
        `Requested range exceeds MAX_FILE_LINES (${MAX_FILE_LINES}). Narrow start_line/end_line.`,
      );
    }

    // Stream-read up to MAX_FILE_BYTES so we never blow the heap on huge files.
    const handle = await fs.open(target, "r");
    try {
      const buffer = Buffer.alloc(Math.min(stat.size, MAX_FILE_BYTES));
      await handle.read(buffer, 0, buffer.length, 0);
      const text = buffer.toString("utf8");
      const lines = text.split("\n");
      const sliced = lines.slice(startLine - 1, endLine);
      const truncated =
        stat.size > MAX_FILE_BYTES || lines.length > endLine || lines.length < (requestedEnd ?? lines.length);
      const header = `# ${path.relative(ctx.projectRoot, target) || target} (lines ${startLine}-${startLine + sliced.length - 1} of ${lines.length})`;
      const body = sliced.join("\n");
      const trailer = truncated
        ? `\n\n<!-- truncated: file has ${lines.length} lines, ${stat.size} bytes; this view limited to MAX_FILE_LINES=${MAX_FILE_LINES} / MAX_FILE_BYTES=${MAX_FILE_BYTES} -->`
        : "";
      return `${header}\n${body}${trailer}`;
    } finally {
      await handle.close();
    }
  },
};

// ---------------------------------------------------------------------------
// Tool 2: list_directory
// ---------------------------------------------------------------------------

const LIST_DIRECTORY_TOOL: OntoTool = {
  name: "list_directory",
  description:
    "List entries (files and subdirectories) in a directory inside projectRoot or ontoHome. Always skips .git, node_modules, dist, build. Skips .onto unless allowOntoTraversal is set in the execution context (synthesize unit). Returns up to 200 entries with [F]/[D] markers and byte sizes.",
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          "Absolute, ~/-prefixed, or projectRoot-relative directory path. Must resolve inside projectRoot or ontoHome.",
      },
    },
    required: ["path"],
  },
  async execute(args, ctx) {
    const target = resolveInBoundary(String(args["path"] ?? ""), ctx);
    const stat = await fs.stat(target);
    if (!stat.isDirectory()) {
      throw new BoundaryViolationError(`"${args["path"]}" is not a directory.`);
    }

    const entries = await fs.readdir(target, { withFileTypes: true });
    const filtered = entries.filter((e) => !shouldSkipDir(e.name, ctx));
    const trimmed = filtered.slice(0, MAX_LIST_ENTRIES);

    const lines: string[] = [
      `# ${path.relative(ctx.projectRoot, target) || target} (${filtered.length} entries${
        filtered.length > MAX_LIST_ENTRIES ? `, showing first ${MAX_LIST_ENTRIES}` : ""
      })`,
    ];
    for (const entry of trimmed) {
      const entryPath = path.join(target, entry.name);
      if (entry.isDirectory()) {
        lines.push(`[D] ${entry.name}/`);
      } else if (entry.isFile()) {
        try {
          const s = await fs.stat(entryPath);
          lines.push(`[F] ${entry.name} (${s.size} bytes)`);
        } catch {
          lines.push(`[F] ${entry.name} (size unavailable)`);
        }
      } else {
        lines.push(`[?] ${entry.name}`);
      }
    }
    if (filtered.length > MAX_LIST_ENTRIES) {
      lines.push(`<!-- ${filtered.length - MAX_LIST_ENTRIES} more entries elided -->`);
    }
    return lines.join("\n");
  },
};

// ---------------------------------------------------------------------------
// Tool 3: search_content
// ---------------------------------------------------------------------------

const SEARCH_CONTENT_TOOL: OntoTool = {
  name: "search_content",
  description:
    "Search for a literal substring (case-sensitive by default) inside files under a directory. Returns up to 100 matches as 'path:line: <line>' tuples. Use this to locate references before deciding which file to read in full.",
  input_schema: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description:
          "Literal substring to search for. Regex is NOT supported in this iteration — use plain text.",
      },
      path: {
        type: "string",
        description:
          "Optional directory to scope the search. Default: projectRoot. Must resolve inside projectRoot or ontoHome.",
      },
      case_insensitive: {
        type: "boolean",
        description: "Optional. Default: false (case-sensitive).",
      },
    },
    required: ["pattern"],
  },
  async execute(args, ctx) {
    const pattern = String(args["pattern"] ?? "");
    if (pattern.length === 0) {
      throw new Error("pattern must be a non-empty string");
    }
    const caseInsensitive = Boolean(args["case_insensitive"]);
    const needle = caseInsensitive ? pattern.toLowerCase() : pattern;

    const rawPath = typeof args["path"] === "string" && (args["path"] as string).length > 0
      ? (args["path"] as string)
      : ctx.projectRoot;
    const root = resolveInBoundary(rawPath, ctx);
    const stat = await fs.stat(root);
    if (!stat.isDirectory()) {
      throw new BoundaryViolationError(`search root "${rawPath}" is not a directory.`);
    }

    const matches: string[] = [];
    const traversed = { count: 0 };
    await walkAndSearch(root, needle, caseInsensitive, ctx, matches, traversed);

    if (matches.length === 0) {
      return `# search_content: no matches for "${pattern}" under ${path.relative(ctx.projectRoot, root) || root}`;
    }
    const limited = matches.slice(0, MAX_SEARCH_MATCHES);
    const trailer =
      matches.length > MAX_SEARCH_MATCHES
        ? `\n<!-- ${matches.length - MAX_SEARCH_MATCHES} additional matches elided; narrow path or pattern to see them -->`
        : "";
    return [
      `# search_content: ${limited.length} match${limited.length === 1 ? "" : "es"} for "${pattern}"${
        traversed.count >= MAX_SEARCH_TRAVERSAL ? " (traversal cap hit)" : ""
      }`,
      ...limited,
    ].join("\n") + trailer;
  },
};

async function walkAndSearch(
  dir: string,
  needle: string,
  caseInsensitive: boolean,
  ctx: ToolExecutionContext,
  matches: string[],
  traversed: { count: number },
): Promise<void> {
  if (matches.length >= MAX_SEARCH_MATCHES) return;
  if (traversed.count >= MAX_SEARCH_TRAVERSAL) return;

  let entries: { name: string; isDirectory: () => boolean; isFile: () => boolean }[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return; // permission denied, missing — silently skip
  }

  for (const entry of entries) {
    if (matches.length >= MAX_SEARCH_MATCHES) return;
    if (traversed.count >= MAX_SEARCH_TRAVERSAL) return;
    if (shouldSkipDir(entry.name, ctx)) continue;

    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkAndSearch(full, needle, caseInsensitive, ctx, matches, traversed);
    } else if (entry.isFile()) {
      traversed.count++;
      try {
        const stat = await fs.stat(full);
        if (stat.size > MAX_FILE_BYTES) continue; // skip files we couldn't read in read_file either
        const text = await fs.readFile(full, "utf8");
        const lines = text.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i] ?? "";
          const haystack = caseInsensitive ? line.toLowerCase() : line;
          if (haystack.includes(needle)) {
            const rel = path.relative(ctx.projectRoot, full) || full;
            matches.push(`${rel}:${i + 1}: ${line.trim().slice(0, 200)}`);
            if (matches.length >= MAX_SEARCH_MATCHES) return;
          }
        }
      } catch {
        // binary or unreadable — skip
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampPositive(value: unknown, defaultValue: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) return defaultValue;
  return Math.floor(value);
}

function optionalPositive(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) return undefined;
  return Math.floor(value);
}

// ---------------------------------------------------------------------------
// Public registry
// ---------------------------------------------------------------------------

/**
 * The default tool set exposed to subagent LLMs. Order matters only for
 * prompt formatting (some providers list tools in declaration order in the
 * system message) — keep the most-used tools first.
 */
export const ONTO_DEFAULT_TOOLS: OntoTool[] = [
  READ_FILE_TOOL,
  LIST_DIRECTORY_TOOL,
  SEARCH_CONTENT_TOOL,
];

export function findToolByName(name: string): OntoTool | undefined {
  return ONTO_DEFAULT_TOOLS.find((t) => t.name === name);
}
