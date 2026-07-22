/**
 * Build-time generator for the deterministic GitHub Linguist language catalog.
 *
 * Reads the vendored, tag-pinned `vendor/linguist/languages.yml` (+ VERSION), projects ONLY the
 * fields the runtime language-identification ladder needs (type, group, language_id, and the
 * extension/filename/interpreter reverse indexes), and emits a committed TS constant module
 * `src/core-runtime/linguist-language-catalog.generated.ts`. No runtime YAML IO.
 *
 * The output is byte-deterministic (sorted keys, sorted+deduped index values, canonical digest),
 * so `npm run check:linguist-drift` can regenerate in memory and byte-compare against the committed
 * file — a mismatch means the catalog was hand-edited or the vendored data changed without
 * regeneration.
 *
 * npm: `generate:linguist` (write), `check:linguist-drift` (verify).
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const YML_PATH = path.join(PROJECT_ROOT, "vendor/linguist/languages.yml");
const VERSION_PATH = path.join(PROJECT_ROOT, "vendor/linguist/VERSION");
export const CATALOG_OUT_PATH = path.join(
  PROJECT_ROOT,
  "src/core-runtime/linguist-language-catalog.generated.ts",
);

/** Language names whose lowercased form is not a usable token — mapped to the existing project
 *  vocabulary (parity with env-profile / the tree-sitter observer). */
const TOKEN_OVERRIDE: Record<string, string> = {
  "C#": "csharp",
  "C++": "cpp",
};

const LINGUIST_TYPES = ["data", "markup", "programming", "prose"] as const;
type LinguistType = (typeof LINGUIST_TYPES)[number];

interface RawLanguage {
  type?: string;
  group?: string;
  language_id?: number;
  extensions?: string[];
  filenames?: string[];
  interpreters?: string[];
}

function tokenOf(name: string): string {
  return TOKEN_OVERRIDE[name] ?? name.toLowerCase();
}

interface CatalogData {
  meta: Record<string, { type: LinguistType; group: string | null; language_id: number }>;
  extensionIndex: Record<string, string[]>;
  filenameIndex: Record<string, string[]>;
  interpreterIndex: Record<string, string[]>;
}

/** Parse + project the Linguist YAML into the canonical, sorted catalog data structures. Throws on
 *  a token collision or a missing required field (fail-loud — the catalog must be total). */
export function buildCatalogData(ymlText: string): CatalogData {
  const doc = YAML.parse(ymlText) as Record<string, RawLanguage>;
  const names = Object.keys(doc);

  // token uniqueness (after overrides)
  const tokenToName = new Map<string, string>();
  for (const name of names) {
    const token = tokenOf(name);
    const existing = tokenToName.get(token);
    if (existing) {
      throw new Error(`linguist token collision: "${token}" from "${name}" and "${existing}"`);
    }
    tokenToName.set(token, name);
  }

  const meta: CatalogData["meta"] = {};
  const extensionIndex: Record<string, Set<string>> = {};
  const filenameIndex: Record<string, Set<string>> = {};
  const interpreterIndex: Record<string, Set<string>> = {};

  for (const name of names) {
    const raw = doc[name]!;
    const token = tokenOf(name);
    const type = raw.type;
    if (!type || !LINGUIST_TYPES.includes(type as LinguistType)) {
      throw new Error(`linguist language "${name}" has invalid type: ${String(type)}`);
    }
    if (typeof raw.language_id !== "number") {
      throw new Error(`linguist language "${name}" has no numeric language_id`);
    }
    meta[token] = {
      type: type as LinguistType,
      group: raw.group ? tokenOf(raw.group) : null,
      language_id: raw.language_id,
    };
    for (const ext of raw.extensions ?? []) (extensionIndex[ext.toLowerCase()] ??= new Set()).add(token);
    for (const fn of raw.filenames ?? []) (filenameIndex[fn.toLowerCase()] ??= new Set()).add(token);
    for (const ip of raw.interpreters ?? []) (interpreterIndex[ip.toLowerCase()] ??= new Set()).add(token);
  }

  // every group must resolve to a known token (no dangling parent)
  for (const [token, m] of Object.entries(meta)) {
    if (m.group !== null && !(m.group in meta)) {
      throw new Error(`linguist group "${m.group}" (parent of "${token}") is not a known language`);
    }
  }

  const sortedIndex = (index: Record<string, Set<string>>): Record<string, string[]> => {
    const out: Record<string, string[]> = {};
    for (const key of Object.keys(index).sort()) out[key] = [...index[key]!].sort();
    return out;
  };
  const sortedMeta: CatalogData["meta"] = {};
  for (const token of Object.keys(meta).sort()) sortedMeta[token] = meta[token]!;

  return {
    meta: sortedMeta,
    extensionIndex: sortedIndex(extensionIndex),
    filenameIndex: sortedIndex(filenameIndex),
    interpreterIndex: sortedIndex(interpreterIndex),
  };
}

/** Canonical JSON (sorted keys, arrays already sorted) — the pre-image for LINGUIST_CATALOG_SHA256. */
function canonicalJson(data: CatalogData): string {
  return JSON.stringify({
    meta: data.meta,
    extensionIndex: data.extensionIndex,
    filenameIndex: data.filenameIndex,
    interpreterIndex: data.interpreterIndex,
  });
}

function parseVersion(versionText: string): { version: string } {
  const tag = versionText.match(/^tag:\s*(\S+)/m)?.[1] ?? "unknown";
  const commit = versionText.match(/^commit:\s*(\S+)/m)?.[1] ?? "unknown";
  return { version: `${tag} (${commit})` };
}

function q(s: string): string {
  return JSON.stringify(s);
}

function emitIndex(name: string, index: Record<string, string[]>): string {
  const lines = Object.entries(index).map(
    ([key, tokens]) => `  ${q(key)}: [${tokens.map(q).join(", ")}],`,
  );
  return `export const ${name}: Readonly<Record<string, readonly LinguistLanguageToken[]>> = {\n${lines.join("\n")}\n};\n`;
}

/** Render the full generated TS module source (deterministic). */
export function buildCatalogSource(ymlText: string, dataSha256: string, version: string): string {
  const data = buildCatalogData(ymlText);
  const catalogSha256 = createHash("sha256").update(canonicalJson(data)).digest("hex");
  const tokens = Object.keys(data.meta);

  const unionLines = tokens.map((t) => `  | ${q(t)}`).join("\n");
  const metaLines = tokens
    .map((t) => {
      const m = data.meta[t]!;
      return `  ${q(t)}: { type: ${q(m.type)}, group: ${m.group === null ? "null" : q(m.group)}, language_id: ${m.language_id} },`;
    })
    .join("\n");

  return (
    `// AUTO-GENERATED by scripts/generate-linguist-tables.ts — DO NOT EDIT.\n` +
    `// Source: GitHub Linguist ${version}. Regenerate: \`npm run generate:linguist\`.\n` +
    `// The drift guard (\`npm run check:linguist-drift\`) byte-compares this file against a fresh\n` +
    `// regeneration; hand edits fail CI.\n` +
    `\n` +
    `export type LinguistLanguageType = "data" | "markup" | "programming" | "prose";\n` +
    `\n` +
    `export type LinguistLanguageToken =\n${unionLines};\n` +
    `\n` +
    `export interface LinguistLanguageMeta {\n` +
    `  type: LinguistLanguageType;\n` +
    `  /** Parent language token (usage-stats aggregation, NOT syntax equivalence) or null. */\n` +
    `  group: LinguistLanguageToken | null;\n` +
    `  language_id: number;\n` +
    `}\n` +
    `\n` +
    `export const LINGUIST_VERSION = ${q(version)};\n` +
    `export const LINGUIST_DATA_SHA256 = ${q(dataSha256)};\n` +
    `export const LINGUIST_CATALOG_SHA256 = ${q(catalogSha256)};\n` +
    `\n` +
    `export const LINGUIST_LANGUAGE_META: Readonly<Record<LinguistLanguageToken, LinguistLanguageMeta>> = {\n${metaLines}\n};\n` +
    `\n` +
    emitIndex("LINGUIST_EXTENSION_INDEX", data.extensionIndex) +
    `\n` +
    emitIndex("LINGUIST_FILENAME_INDEX", data.filenameIndex) +
    `\n` +
    emitIndex("LINGUIST_INTERPRETER_INDEX", data.interpreterIndex)
  );
}

/** Read vendored inputs and return the generated source (shared by the writer and the drift check). */
export function generateFromVendor(): { source: string; outPath: string } {
  const ymlText = readFileSync(YML_PATH, "utf8");
  const dataSha256 = createHash("sha256").update(ymlText).digest("hex");
  const { version } = parseVersion(readFileSync(VERSION_PATH, "utf8"));
  return { source: buildCatalogSource(ymlText, dataSha256, version), outPath: CATALOG_OUT_PATH };
}

// CLI: write the catalog.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { source, outPath } = generateFromVendor();
  writeFileSync(outPath, source, "utf8");
  console.log(`wrote ${path.relative(PROJECT_ROOT, outPath)} (${source.length} bytes)`);
}
