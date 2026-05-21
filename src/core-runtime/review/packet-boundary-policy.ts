/**
 * Packet Boundary Policy parser — Phase 3-4 (A1 + A4).
 *
 * # What this module is
 *
 * Parses the `## Boundary Policy` section of a prompt packet and returns a
 * structured view of the declared filesystem / network / tools access
 * constraints. The executor consults this BEFORE deciding whether to activate
 * tool-native or inline mode, because packet-declared policies must take
 * precedence over caller-supplied tool capabilities.
 *
 * # Why it exists
 *
 * A1 — Phase 3-2 (function-calling tool loop, PR #67) exposed `read_file` /
 * `list_directory` / `search_content` to any model the executor routes to,
 * regardless of what the packet itself declared. Real-LLM testing (2026-04-17)
 * found that lens packets declare `Boundary Policy: Filesystem: denied` but
 * tool-native mode still handed the LLM filesystem tools — the LLM then
 * called tools for a task that was supposed to be self-contained, producing
 * an unusable lens output.
 *
 * A4 — Phase 3-4 A3 benchmark (2026-04-17) showed the mirror failure: when a
 * packet's lens outputs live on disk and are NOT inlined (path-only variant),
 * running inline mode produced **fabricated citations** rather than honestly
 * reporting insufficient content — the model hallucinated quotes that did
 * not exist in any lens output. The packet needs a way to declare "tools are
 * required to complete this task" so the executor can reject inline mode
 * upfront instead of letting the LLM silently fabricate.
 *
 * The correct precedence is:
 *   packet Boundary Policy > CLI --tool-mode flag > default
 * because the packet is the authoritative contract for each unit; if it
 * says no filesystem, no filesystem — and if it says tools required, no
 * toolless mode — even if the caller explicitly requests otherwise.
 *
 * # How it relates
 *
 * - `inline-http-review-unit-executor.ts` imports `parsePacketBoundaryPolicy`
 *   and calls it on the already-loaded packet text before choosing between
 *   Tier 1 (tool-native) and Tier 2 (inline).
 * - The findings document that motivated both A1 and A4 is
 *   `development-records/benchmark/20260417-phase-3-2-3-3-lens-runtime-findings.md`
 *   (Finding 1 + A3 path-only section).
 *
 * # Grammar
 *
 * The parser is deliberately lenient — packet authors write in prose, not
 * structured yaml. We match the `## Boundary Policy` heading case-insensitively
 * and then scan subsequent bullet lines for `- Filesystem: <value>`,
 * `- Network: <value>`, and `- Tools: <value>`. Values are normalized to a
 * small vocabulary so the executor can reason about them without string
 * juggling.
 */

const FILESYSTEM_DENIED_VALUES = new Set([
  "denied",
  "deny",
  "disallowed",
  "disallow",
  "none",
  "no",
  "forbidden",
  "blocked",
]);

const FILESYSTEM_ALLOWED_VALUES = new Set([
  "allowed",
  "allow",
  "yes",
  "permitted",
  "read-only",
  "readonly",
  "ro",
]);

const NETWORK_DENIED_VALUES = new Set([
  "denied",
  "deny",
  "disallowed",
  "disallow",
  "none",
  "no",
  "forbidden",
  "blocked",
]);

const NETWORK_ALLOWED_VALUES = new Set([
  "allowed",
  "allow",
  "yes",
  "permitted",
]);

const TOOLS_REQUIRED_VALUES = new Set([
  "required",
  "mandatory",
  "needed",
  "must",
]);

const TOOLS_OPTIONAL_VALUES = new Set([
  "optional",
  "permitted",
  "allowed",
  "available",
]);

const TOOLS_DENIED_VALUES = new Set([
  "denied",
  "deny",
  "disallowed",
  "none",
  "no",
  "forbidden",
  "blocked",
]);

export type BoundaryFilesystemPolicy = "denied" | "allowed" | "unknown";
export type BoundaryNetworkPolicy = "denied" | "allowed" | "unknown";
/**
 * Tools declaration:
 *   - `required` — packet explicitly needs tools (e.g. path-only lens outputs).
 *     Inline mode must fail-fast.
 *   - `optional` — tools may be used but are not necessary. Either tier works.
 *   - `denied` — tools explicitly disallowed. Native mode must fail-fast.
 *     (Effectively the same contract as `Filesystem: denied` for toolsets that
 *     are all filesystem-scoped; we keep both readable so packet authors can
 *     express either framing.)
 *   - `unknown` — no declaration. Executor falls back to CLI flag / default.
 */
export type BoundaryToolsPolicy = "required" | "optional" | "denied" | "unknown";

export interface PacketBoundaryPolicy {
  /** Raw text of the Boundary Policy section body, or undefined if section absent. */
  sectionBody?: string;
  /** Normalized filesystem declaration; `unknown` when section absent or value unrecognised. */
  filesystem: BoundaryFilesystemPolicy;
  /** Normalized network declaration. */
  network: BoundaryNetworkPolicy;
  /** Normalized tools declaration (A4). `unknown` when packet is silent. */
  tools: BoundaryToolsPolicy;
  /** Raw filesystem value as written in the packet (trimmed); useful for telemetry / notices. */
  filesystemRaw?: string;
  /** Raw network value as written in the packet (trimmed). */
  networkRaw?: string;
  /** Raw tools value as written in the packet (trimmed). */
  toolsRaw?: string;
}

/**
 * Parse the `## Boundary Policy` section from a packet body. Returns a
 * normalized view; both fields default to `"unknown"` when the section is
 * absent or the values are not in the recognized vocabulary. Callers should
 * treat `"unknown"` as "no packet-level constraint" — i.e. fall back to CLI
 * flags / host defaults.
 *
 * Case-insensitive on the heading. Accepts any number of `#` (## or ###) so
 * downgraded heading nesting still matches.
 */
export function parsePacketBoundaryPolicy(packetBody: string): PacketBoundaryPolicy {
  const section = extractBoundaryPolicySection(packetBody);
  if (section === undefined) {
    return { filesystem: "unknown", network: "unknown", tools: "unknown" };
  }

  const filesystemRaw = pickBulletValue(section, "filesystem");
  const networkRaw = pickBulletValue(section, "network");
  const toolsRaw = pickBulletValue(section, "tools");

  const result: PacketBoundaryPolicy = {
    sectionBody: section,
    filesystem: classifyFilesystem(filesystemRaw),
    network: classifyNetwork(networkRaw),
    tools: classifyTools(toolsRaw),
  };
  if (filesystemRaw !== undefined) result.filesystemRaw = filesystemRaw;
  if (networkRaw !== undefined) result.networkRaw = networkRaw;
  if (toolsRaw !== undefined) result.toolsRaw = toolsRaw;
  return result;
}

function extractBoundaryPolicySection(packetBody: string): string | undefined {
  // Match `## Boundary Policy` (case-insensitive) up to the next `## ` or EOF.
  // Allow optional leading spaces and trailing whitespace.
  const headingRe = /^\s*#{1,6}\s*Boundary\s+Policy\s*$/im;
  const m = headingRe.exec(packetBody);
  if (!m) return undefined;

  const startIdx = (m.index ?? 0) + m[0].length;
  // Find the next `## ` (or higher-level heading) or EOF.
  const rest = packetBody.slice(startIdx);
  const nextHeadingRe = /\n\s*#{1,6}\s+\S/;
  const nextMatch = nextHeadingRe.exec(rest);
  const end = nextMatch ? nextMatch.index : rest.length;
  return rest.slice(0, end).trim();
}

function pickBulletValue(
  section: string,
  key: "filesystem" | "network" | "tools",
): string | undefined {
  // Match lines like "- Filesystem: denied" (case-insensitive on the key).
  const lineRe = new RegExp(
    `(?:^|\\n)\\s*[-*]\\s*${key}\\s*:\\s*([^\\n]+?)\\s*(?=\\n|$)`,
    "i",
  );
  const m = lineRe.exec(section);
  if (!m || typeof m[1] !== "string") return undefined;
  return m[1].trim();
}

function classifyFilesystem(raw: string | undefined): BoundaryFilesystemPolicy {
  if (raw === undefined) return "unknown";
  const normalized = raw.toLowerCase().trim();
  if (FILESYSTEM_DENIED_VALUES.has(normalized)) return "denied";
  if (FILESYSTEM_ALLOWED_VALUES.has(normalized)) return "allowed";
  // Handle compound declarations like "read-only inside packet" by checking
  // the first token — these are treated as "allowed" (read is permitted).
  const firstToken = normalized.split(/\s+/)[0] ?? "";
  if (FILESYSTEM_ALLOWED_VALUES.has(firstToken)) return "allowed";
  if (FILESYSTEM_DENIED_VALUES.has(firstToken)) return "denied";
  return "unknown";
}

function classifyNetwork(raw: string | undefined): BoundaryNetworkPolicy {
  if (raw === undefined) return "unknown";
  const normalized = raw.toLowerCase().trim();
  if (NETWORK_DENIED_VALUES.has(normalized)) return "denied";
  if (NETWORK_ALLOWED_VALUES.has(normalized)) return "allowed";
  const firstToken = normalized.split(/\s+/)[0] ?? "";
  if (NETWORK_ALLOWED_VALUES.has(firstToken)) return "allowed";
  if (NETWORK_DENIED_VALUES.has(firstToken)) return "denied";
  return "unknown";
}

function classifyTools(raw: string | undefined): BoundaryToolsPolicy {
  if (raw === undefined) return "unknown";
  const normalized = raw.toLowerCase().trim();
  if (TOOLS_REQUIRED_VALUES.has(normalized)) return "required";
  if (TOOLS_DENIED_VALUES.has(normalized)) return "denied";
  if (TOOLS_OPTIONAL_VALUES.has(normalized)) return "optional";
  const firstToken = normalized.split(/\s+/)[0] ?? "";
  if (TOOLS_REQUIRED_VALUES.has(firstToken)) return "required";
  if (TOOLS_DENIED_VALUES.has(firstToken)) return "denied";
  if (TOOLS_OPTIONAL_VALUES.has(firstToken)) return "optional";
  return "unknown";
}
