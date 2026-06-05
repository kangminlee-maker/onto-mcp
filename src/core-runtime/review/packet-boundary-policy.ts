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

export interface PacketAllowedReadAuthority {
  declared: boolean;
  malformed: boolean;
  refs: string[];
  unit_id?: string;
  output_path?: string;
  allowed_output_refs?: string[];
  section_count?: number;
  duplicate_sections?: boolean;
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
  const section = extractBoundaryPolicySection(
    stripEmbeddedMaterializedInputSections(packetBody),
  );
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

export function parsePacketAllowedReadAuthority(
  packetBody: string,
): PacketAllowedReadAuthority {
  const searchablePacketBody = stripEmbeddedMaterializedInputSections(packetBody);
  const refs: string[] = [];
  let declared = false;
  let malformed = false;
  let sectionCount = 0;
  let unitId: string | undefined;
  let outputPath: string | undefined;
  const allowedOutputRefs: string[] = [];
  const headingRe =
    /^\s*#{1,6}\s*(?:Runtime\s+Unit\s+|Unit\s+)?Boundary\s+Details\s*$/gim;
  let match: RegExpExecArray | null;
  while ((match = headingRe.exec(searchablePacketBody)) !== null) {
    sectionCount++;
    declared = true;
    const startIdx = (match.index ?? 0) + match[0].length;
    const rest = searchablePacketBody.slice(startIdx);
    const nextHeadingMatch = /\n\s*#{1,6}\s+\S/.exec(rest);
    const section = rest.slice(0, nextHeadingMatch ? nextHeadingMatch.index : rest.length);
    const jsonFence = /```json\s*([\s\S]*?)```/i.exec(section);
    if (!jsonFence || typeof jsonFence[1] !== "string") {
      malformed = true;
      continue;
    }
    try {
      const payload = JSON.parse(jsonFence[1].trim()) as unknown;
      const details = extractUnitBoundaryDetails(payload);
      if (details === null) {
        malformed = true;
        continue;
      }
      refs.push(...details.allowed_read_refs);
      if (details.unit_id !== undefined) unitId = details.unit_id;
      if (details.output_path !== undefined) outputPath = details.output_path;
      if (details.allowed_output_refs !== undefined) {
        allowedOutputRefs.push(...details.allowed_output_refs);
      }
    } catch {
      malformed = true;
      continue;
    }
  }
  const duplicateSections = sectionCount > 1;
  if (duplicateSections) {
    malformed = true;
  }
  return {
    declared,
    malformed,
    refs: malformed ? [] : [...new Set(refs)].sort(),
    ...(!malformed && unitId !== undefined ? { unit_id: unitId } : {}),
    ...(!malformed && outputPath !== undefined ? { output_path: outputPath } : {}),
    ...(!malformed && allowedOutputRefs.length > 0
      ? { allowed_output_refs: [...new Set(allowedOutputRefs)].sort() }
      : {}),
    ...(duplicateSections
      ? { section_count: sectionCount, duplicate_sections: true }
      : {}),
  };
}

export function parsePacketAllowedReadRefs(packetBody: string): string[] {
  return parsePacketAllowedReadAuthority(packetBody).refs;
}

function extractStringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const normalized: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.trim().length === 0) {
      return null;
    }
    normalized.push(item);
  }
  return normalized;
}

function extractUnitBoundaryDetails(payload: unknown): {
  allowed_read_refs: string[];
  unit_id?: string;
  output_path?: string;
  allowed_output_refs?: string[];
} | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const unitBoundary = root["unit_boundary"];
  if (!unitBoundary || typeof unitBoundary !== "object") return null;
  const unitBoundaryRecord = unitBoundary as Record<string, unknown>;
  const readAuthority = unitBoundaryRecord["read_authority"];
  if (!readAuthority || typeof readAuthority !== "object") return null;
  const refs = (readAuthority as Record<string, unknown>)["allowed_read_refs"];
  const allowedReadRefs = extractStringList(refs);
  if (allowedReadRefs === null) return null;
  const outputSeat = unitBoundaryRecord["output_seat"];
  let outputPath: string | undefined;
  let allowedOutputRefs: string[] | undefined;
  if (outputSeat && typeof outputSeat === "object") {
    const outputSeatRecord = outputSeat as Record<string, unknown>;
    if (typeof outputSeatRecord.output_path === "string") {
      outputPath = outputSeatRecord.output_path;
    }
    const parsedAllowedOutputRefs = extractStringList(
      outputSeatRecord.allowed_output_refs,
    );
    if (parsedAllowedOutputRefs !== null) {
      allowedOutputRefs = parsedAllowedOutputRefs;
    }
  }
  return {
    allowed_read_refs: allowedReadRefs,
    ...(typeof unitBoundaryRecord.unit_id === "string"
      ? { unit_id: unitBoundaryRecord.unit_id }
      : {}),
    ...(outputPath !== undefined ? { output_path: outputPath } : {}),
    ...(allowedOutputRefs !== undefined
      ? { allowed_output_refs: allowedOutputRefs }
      : {}),
  };
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

const EMBEDDED_MATERIAL_START_RE =
  /^\s*<!--\s*onto:embedded-materialized-input:start(?:\s+lines=(\d+))?\s*-->\s*$/i;
const EMBEDDED_MATERIAL_END_RE =
  /^\s*<!--\s*onto:embedded-materialized-input:end\s*-->\s*$/i;

function packetHeadingLabel(line: string): string | undefined {
  const match = /^\s*#{1,6}\s+(.+?)\s*$/.exec(line);
  if (!match || typeof match[1] !== "string") {
    return undefined;
  }
  return match[1].trim().toLowerCase();
}

export function stripEmbeddedMaterializedInputSections(packetBody: string): string {
  const lines = packetBody.split(/\r?\n/);
  const output: string[] = [];
  let skippingEmbeddedMaterial = false;
  let skipMode:
    | "unknown"
    | "line-count-marker"
    | "end-marker"
    | "fenced" = "unknown";
  let markerLinesRemaining = 0;
  let insideFence = false;
  for (const line of lines) {
    const isEmbeddedMaterialHeading =
      /^\s*#{1,6}\s*(?:Embedded\s+)?Materialized\s+Input\s*$/i.test(line);
    const isFence = /^\s*```/.test(line);
    if (!skippingEmbeddedMaterial && isEmbeddedMaterialHeading) {
      skippingEmbeddedMaterial = true;
      skipMode = "unknown";
      markerLinesRemaining = 0;
      insideFence = false;
      continue;
    }
    if (skippingEmbeddedMaterial) {
      const markerStart = EMBEDDED_MATERIAL_START_RE.exec(line);
      if (skipMode === "unknown" && markerStart) {
        const declaredLineCount =
          typeof markerStart[1] === "string"
            ? Number.parseInt(markerStart[1], 10)
            : null;
        if (declaredLineCount !== null && Number.isFinite(declaredLineCount)) {
          skipMode = "line-count-marker";
          markerLinesRemaining = Math.max(0, declaredLineCount);
        } else {
          skipMode = "end-marker";
        }
        continue;
      }
      if (skipMode === "line-count-marker") {
        if (markerLinesRemaining > 0) {
          markerLinesRemaining--;
          continue;
        }
        skippingEmbeddedMaterial = false;
        skipMode = "unknown";
        if (EMBEDDED_MATERIAL_END_RE.test(line)) {
          continue;
        }
      } else if (skipMode === "end-marker") {
        if (EMBEDDED_MATERIAL_END_RE.test(line)) {
          skippingEmbeddedMaterial = false;
          skipMode = "unknown";
        }
        continue;
      } else if (skipMode === "unknown" && /^\s*$/.test(line)) {
        continue;
      } else if (skipMode === "unknown" && isFence) {
        skipMode = "fenced";
        insideFence = true;
        continue;
      } else if (skipMode === "fenced") {
        if (isFence) {
          insideFence = !insideFence;
        }
        if (insideFence || !packetHeadingLabel(line)) {
          continue;
        }
        skippingEmbeddedMaterial = false;
        skipMode = "unknown";
      } else {
        throw new Error(
          "Embedded Materialized Input must use onto line-count markers or a fenced block.",
        );
      }
    }
    if (!skippingEmbeddedMaterial) {
      output.push(line);
    }
  }
  return output.join("\n");
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
