import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveInstallationPath } from "../discovery/installation-paths.js";

/**
 * render-for-user — canonical render seat for `output_language`-translated
 * text (.onto/principles/output-language-boundary.md §4 / §5).
 *
 * Every call site that emits text toward the developer / principal MUST
 * route through this module. The `output_language` config value is allowed
 * to influence rendering ONLY here; all other code paths (agent prompts,
 * wip.yml writes, session-log entries, delta / epsilon / hand-off payloads)
 * stay in English regardless of user config.
 *
 * Phase 1 (this file's current form) performs registry validation + a
 * passthrough render. Phase 2 will layer actual translation (either a
 * per-language template table or an LLM translation call) without changing
 * callers — the render contract is stable from this point on.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Repo root relative to this module. The translate module lives at
 * `src/core-runtime/translate/` so 3 levels up land at the project root.
 * Tests override the final path via `setRegistryPathForTesting`; otherwise
 * the authority directory is resolved call-time via the Phase 0 shared
 * resolver (`resolveInstallationPath("authority", ...)`), which owns the
 * canonical `.onto/` layout knowledge for all consumers.
 */
const REPO_ROOT_FROM_TRANSLATE = path.resolve(__dirname, "..", "..", "..");

let registryPathOverride: string | null = null;
let cachedRegistry: ExternalRenderRegistry | null = null;

export interface ExternalRenderPoint {
  id: string;
  file: string;
  section?: string;
  rationale: string;
  conditional?: string;
}

export interface ExternalRenderRegistry {
  schema_version: string;
  as_of: string;
  points: ExternalRenderPoint[];
}

/**
 * Test helper: override the registry path so a unit test can exercise a
 * controlled YAML fixture without mutating the shared `.onto/authority/` file.
 * Clears the module-level cache as a side effect.
 */
export function setRegistryPathForTesting(filePath: string | null): void {
  registryPathOverride = filePath;
  cachedRegistry = null;
}

function resolveRegistryPath(): string {
  if (registryPathOverride !== null) return registryPathOverride;
  const authorityDir = resolveInstallationPath("authority", REPO_ROOT_FROM_TRANSLATE);
  return path.join(authorityDir, "external-render-points.yaml");
}

export function loadRegistry(): ExternalRenderRegistry {
  if (cachedRegistry !== null) return cachedRegistry;
  const registryPath = resolveRegistryPath();
  const text = fs.readFileSync(registryPath, "utf8");
  const parsed = parseRegistryYaml(text);
  cachedRegistry = parsed;
  return parsed;
}

/**
 * Minimal YAML parser for the external-render-points.yaml shape. The file
 * is authored as a simple list-of-records; to avoid adding a YAML dep
 * purely for this one read we parse it by hand. The parser enforces the
 * three required scalar fields (id, file, rationale) and treats unknown
 * keys as additional point fields without rejection.
 */
function parseRegistryYaml(text: string): ExternalRenderRegistry {
  const lines = text.split(/\r?\n/);
  let schema_version = "";
  let as_of = "";
  const points: ExternalRenderPoint[] = [];

  let inPoints = false;
  let current: Partial<ExternalRenderPoint> | null = null;

  const flush = () => {
    if (current === null) return;
    if (
      typeof current.id !== "string" ||
      typeof current.file !== "string" ||
      typeof current.rationale !== "string"
    ) {
      throw new Error(
        `.onto/authority/external-render-points.yaml: entry missing required field(s) ` +
          `(id/file/rationale). got=${JSON.stringify(current)}`,
      );
    }
    points.push(current as ExternalRenderPoint);
    current = null;
  };

  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "").trimEnd();
    if (line.trim().length === 0) continue;

    if (/^schema_version:/.test(line)) {
      schema_version = extractScalar(line);
      continue;
    }
    if (/^as_of:/.test(line)) {
      as_of = extractScalar(line);
      continue;
    }
    if (/^points:\s*(\[\]\s*)?$/.test(line)) {
      inPoints = true;
      continue;
    }
    if (!inPoints) continue;

    const listMatch = /^\s{2}-\s+(\w+):\s*(.*)$/.exec(line);
    if (listMatch) {
      const key = listMatch[1];
      const rawValue = listMatch[2];
      // Both capture groups are mandatory in the regex; this guard narrows the
      // `string | undefined` inference under noUncheckedIndexedAccess.
      if (key !== undefined && rawValue !== undefined) {
        flush();
        current = {};
        (current as Record<string, string>)[key] = unquote(rawValue);
      }
      continue;
    }
    const fieldMatch = /^\s{4,}(\w+):\s*(.*)$/.exec(line);
    if (fieldMatch && current !== null) {
      const key = fieldMatch[1];
      const rawValue = fieldMatch[2];
      if (key !== undefined && rawValue !== undefined) {
        (current as Record<string, string>)[key] = unquote(rawValue);
      }
      continue;
    }
  }
  flush();

  return { schema_version, as_of, points };
}

function extractScalar(line: string): string {
  const value = line.slice(line.indexOf(":") + 1).trim();
  return unquote(value);
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function isRegisteredRenderPoint(id: string): boolean {
  const registry = loadRegistry();
  return registry.points.some((p) => p.id === id);
}

export interface RenderForUserArgs {
  /** Registry id — must exist in .onto/authority/external-render-points.yaml. */
  renderPointId: string;
  /** Internal English text assembled by the caller (halt body, summary, ...). */
  internalPayload: string;
  /** Resolved output_language (`en` | `ko` | `ja` | ...). */
  userLanguage: string;
}

/**
 * Single entry point for translating internal English text into the
 * principal-facing language specified by `output_language`.
 *
 * Current behaviour (Phase 1): validates the render point is registered,
 * then returns `internalPayload` verbatim. Phase 2 will layer actual
 * translation per the registry entry's `file` / `section` contract —
 * callers do not need to change when that lands.
 *
 * Throws if `renderPointId` is not registered. This is the enforcement
 * hook: if you need to translate user-facing text, the registry must
 * record why. The CI lint gate (follow-up PR) will statically verify
 * that every `{output_language}` usage in the repo resolves to a
 * registered id.
 */
export function renderForUser(args: RenderForUserArgs): string {
  if (!isRegisteredRenderPoint(args.renderPointId)) {
    const registry = loadRegistry();
    const known = registry.points.map((p) => p.id).join(", ") || "(none)";
    throw new Error(
      `renderForUser: unknown renderPointId "${args.renderPointId}". ` +
        `Register it in .onto/authority/external-render-points.yaml first. ` +
        `known ids: ${known}.`,
    );
  }
  return args.internalPayload;
}
