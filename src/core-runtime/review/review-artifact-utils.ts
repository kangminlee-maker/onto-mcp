import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { atomicWriteFile } from "../artifact-io.js";
import { isSpreadsheetRef } from "../target-material-kind.js";
import {
  observeSpreadsheetSource,
  projectInventoryForAdmission,
  type WorkbookStructuralInventory,
} from "../spreadsheet-structure-observer.js";
import type { DirectoryListingOptions } from "./artifact-types.js";

export const DEFAULT_EXCLUDED_NAMES: readonly string[] = [
  ".git",
  "node_modules",
  ".onto",
  "dist",
  "build",
  ".next",
  "out",
  "__pycache__",
  ".venv",
  "venv",
  "coverage",
  ".cache",
  ".turbo",
  ".nuxt",
  ".output",
  ".svelte-kit",
  ".parcel-cache",
];

export const DEFAULT_DIRECTORY_LISTING_OPTIONS: DirectoryListingOptions = {
  excluded_names: [...DEFAULT_EXCLUDED_NAMES],
  max_depth: 10,
  max_entries: 5000,
};

export function dumpYamlDocument(data: unknown): string {
  return YAML.stringify(data).trimEnd();
}

export async function writeYamlDocument(
  filePath: string,
  data: unknown,
): Promise<void> {
  await atomicWriteFile(filePath, `${dumpYamlDocument(data)}\n`);
}

export async function readYamlDocument<T>(filePath: string): Promise<T> {
  let text: string;
  try {
    text = await fs.readFile(filePath, "utf8");
  } catch (error: unknown) {
    throw new Error(
      `Failed to read artifact: ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    return YAML.parse(text) as T;
  } catch (error: unknown) {
    throw new Error(
      `Failed to parse YAML: ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function parseMarkdownFrontmatter<T>(
  markdownText: string,
): {
  metadata: T | null;
  body: string;
} {
  if (!markdownText.startsWith("---\n")) {
    return {
      metadata: null,
      body: markdownText,
    };
  }

  const closingIndex = markdownText.indexOf("\n---\n", 4);
  if (closingIndex === -1) {
    return {
      metadata: null,
      body: markdownText,
    };
  }

  const frontmatterText = markdownText.slice(4, closingIndex);
  const bodyStart = closingIndex + "\n---\n".length;
  const body = markdownText.slice(bodyStart);
  // Treat malformed YAML as "frontmatter unavailable" rather than throwing.
  // Callers (e.g. assembler / runner deliberation-status detection) decide
  // how to fall back when metadata is null; surfacing a parse exception here
  // would short-circuit those decisions.
  let metadata: T | null;
  try {
    metadata = YAML.parse(frontmatterText) as T;
  } catch {
    metadata = null;
  }
  return {
    metadata,
    body,
  };
}

export async function ensureDirectory(directoryPath: string): Promise<void> {
  await fs.mkdir(directoryPath, { recursive: true });
}

function formatOffset(minutesEastOfUtc: number): string {
  const sign = minutesEastOfUtc >= 0 ? "+" : "-";
  const absoluteMinutes = Math.abs(minutesEastOfUtc);
  const hours = String(Math.floor(absoluteMinutes / 60)).padStart(2, "0");
  const minutes = String(absoluteMinutes % 60).padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}

function formatLocalIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const offsetMinutes = -date.getTimezoneOffset();
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${formatOffset(
    offsetMinutes,
  )}`;
}

export function requireString(
  value: string | boolean | undefined,
  optionName: string,
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required option --${optionName}`);
  }
  return value;
}

export function isoNow(): string {
  return formatLocalIso(new Date());
}

export function isoFromTimestamp(timestampMs: number): string {
  return formatLocalIso(new Date(timestampMs));
}

export function toRelativePath(targetPath: string, projectRoot: string): string {
  const relativePath = path.relative(projectRoot, targetPath);
  const normalized = relativePath === "" ? "." : relativePath;
  return normalized.split(path.sep).join(path.posix.sep);
}

const DEPRECATED_DOMAIN_ALIASES = new Set([
  "llm-native-development",
  "software-development",
]);

function stripDomainSigil(domainValue: string): string {
  const trimmed = domainValue.trim();
  return trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
}

export function normalizeDomainValue(domainValue: string): string {
  const stripped = stripDomainSigil(domainValue);
  if (["", "-", "none"].includes(stripped)) {
    return "none";
  }
  return stripped;
}

export function isDeprecatedDomainAlias(domainValue: string): boolean {
  const stripped = stripDomainSigil(domainValue);
  return DEPRECATED_DOMAIN_ALIASES.has(stripped);
}

export function parseBooleanFlag(
  optionValue: string | boolean | undefined,
  optionName: string,
): boolean {
  if (typeof optionValue === "boolean") {
    return optionValue;
  }
  if (optionValue === undefined) {
    throw new Error(`Missing required option --${optionName}`);
  }
  if (optionValue === "true") {
    return true;
  }
  if (optionValue === "false") {
    return false;
  }
  throw new Error(`Invalid boolean value for --${optionName}: ${optionValue}`);
}

export async function collectFilePathsRecursively(
  rootPath: string,
  options?: DirectoryListingOptions,
  currentDepth?: number,
): Promise<string[]> {
  const opts = options ?? DEFAULT_DIRECTORY_LISTING_OPTIONS;
  const depth = currentDepth ?? 0;

  if (depth >= opts.max_depth) {
    return [];
  }

  const directoryEntries = await fs.readdir(rootPath, { withFileTypes: true });
  const collected: string[] = [];

  for (const entry of directoryEntries) {
    if (opts.excluded_names.includes(entry.name)) {
      continue;
    }
    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      collected.push(
        ...(await collectFilePathsRecursively(entryPath, opts, depth + 1)),
      );
      continue;
    }
    if (entry.isFile()) {
      collected.push(entryPath);
    }
  }

  return collected.sort();
}

/**
 * Render the admission-safe workbook inventory as a compact text view for the
 * review prompt (design §3.2 — the "inventory projection (text view)"). Honesty
 * (review-target-profile §6): structure is inspected only, cell values and
 * formula results are not evaluated. Carries schema/aggregate facts (column
 * types, distinct counts, formula/validation/structure counts, risk signals)
 * and NO raw cell values — the projection already excluded them.
 */
function renderSpreadsheetStructuralView(
  inventory: WorkbookStructuralInventory,
): string {
  const lines: string[] = [
    "[Spreadsheet Structural Inventory — structure inspected only; cell values and formula results are not evaluated]",
    `workbook_kind: ${inventory.workbook_kind}`,
    `content_sha256: ${inventory.content_sha256}`,
  ];
  if (inventory.unsupported_reason) {
    lines.push(`unsupported: ${inventory.unsupported_reason}`);
    return `${lines.join("\n")}\n`;
  }
  lines.push(
    `sheets: ${inventory.sheets.length}${inventory.capture_truncated ? " (capture truncated)" : ""}`,
  );
  for (const sheet of inventory.sheets) {
    const flags = `${sheet.hidden ? " (hidden)" : ""}${sheet.protected ? " (protected)" : ""}`;
    lines.push(
      "",
      `## sheet: ${sheet.name}`,
      `dimensions: ${sheet.dimensions.rows} rows × ${sheet.dimensions.cols} cols${flags}`,
    );
    const data = inventory.per_sheet_data.find((d) => d.sheet === sheet.name);
    if (data) {
      const lowConfidence =
        data.header_confidence === "low" ? "; header_confidence: low (layout uncertain)" : "";
      lines.push(
        `layout_kind: ${data.layout_kind}; header_rows: ${data.header_rows ? data.header_rows.join(",") : "none"}${lowConfidence}`,
      );
      if (data.columns.length > 0) {
        lines.push("columns:");
        for (const col of data.columns) {
          const vocab = inventory.distinct_value_vocab.find(
            (v) => v.sheet === sheet.name && v.column === col.name,
          );
          const distinct = vocab
            ? `; distinct≈${vocab.distinct_count}${vocab.distinct_count_is_estimate ? "+" : ""}`
            : "";
          lines.push(
            `  - ${col.name} (${col.inferred_type}; non_empty=${col.non_empty_ratio.toFixed(2)}${distinct})`,
          );
        }
      }
    }
  }
  const structural: string[] = [];
  if (inventory.named_ranges.length) structural.push(`named_ranges: ${inventory.named_ranges.length}`);
  if (inventory.tables.length) structural.push(`tables: ${inventory.tables.length}`);
  if (inventory.formula_cells.length) structural.push(`formula_cells: ${inventory.formula_cells.length}`);
  if (inventory.merged_ranges.length) structural.push(`merged_ranges: ${inventory.merged_ranges.length}`);
  if (inventory.data_validations.length) structural.push(`data_validations: ${inventory.data_validations.length}`);
  if (inventory.external_links.length) structural.push(`external_links: ${inventory.external_links.length}`);
  if (inventory.error_cells.length) structural.push(`error_cells: ${inventory.error_cells.length}`);
  if (inventory.macro_present) structural.push("macro_present: true");
  if (structural.length) lines.push("", structural.join("; "));
  if (inventory.pivot_tables.length) {
    lines.push("", `pivot_tables: ${inventory.pivot_tables.length}`);
    for (const p of inventory.pivot_tables) {
      const src = p.source_sheet ? ` source=${p.source_sheet}!${p.source_ref ?? ""}` : "";
      lines.push(`  - ${p.name} @ ${p.sheet}!${p.location}${src}`);
      lines.push(
        `    rows=[${p.row_fields.join(", ")}] cols=[${p.column_fields.join(", ")}]` +
          ` data=[${p.data_fields.join(", ")}] filters=[${p.page_fields.join(", ")}]`,
      );
    }
  }
  if (inventory.cross_sheet_key_overlap.length) {
    lines.push("", "cross_sheet_key_overlap (shared-column value overlap, counts only):");
    for (const o of inventory.cross_sheet_key_overlap) {
      const pairs = o.pairwise_overlap.map((p) => `${p.a}∩${p.b}=${p.count}`).join(", ");
      lines.push(`  - ${o.key_name} across [${o.sheets.join(", ")}]: ${pairs}`);
    }
  }
  if (inventory.risk_signals.length) {
    lines.push("", "risk_signals:");
    for (const signal of inventory.risk_signals) {
      lines.push(`  - ${signal.kind} @ ${signal.location}: ${signal.literal}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export async function readTextOrDirectoryListing(
  targetPath: string,
  options?: DirectoryListingOptions,
): Promise<string> {
  const stats = await fs.stat(targetPath);
  if (!stats.isDirectory()) {
    // Spreadsheet targets are rendered as a structural/aggregate inventory view,
    // not raw bytes (design §3.2). review routes through the SAME shared projection
    // as reconstruct — raw cell values never enter the prompt, and a binary
    // workbook is never dumped as garbage utf8.
    if (isSpreadsheetRef(targetPath)) {
      const inventory = projectInventoryForAdmission(
        await observeSpreadsheetSource(targetPath),
      );
      return renderSpreadsheetStructuralView(inventory);
    }
    try {
      return await fs.readFile(targetPath, "utf8");
    } catch (error: unknown) {
      throw new Error(
        `Failed to read target file: ${targetPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const opts = options ?? DEFAULT_DIRECTORY_LISTING_OPTIONS;
  if (opts.max_depth < 1) {
    console.warn(
      `[onto] Warning: max_depth is ${opts.max_depth}. No files will be listed.`,
    );
  }
  const allPaths = await collectFilePathsRecursively(targetPath, opts);
  const truncated = allPaths.length > opts.max_entries;
  const filePaths = truncated ? allPaths.slice(0, opts.max_entries) : allPaths;

  let listing: string;
  if (filePaths.length > 0) {
    listing = filePaths
      .map((filePath) => `- ${path.relative(targetPath, filePath).split(path.sep).join(path.posix.sep)}`)
      .join("\n");
  } else {
    const rawEntries = await fs.readdir(targetPath);
    listing = rawEntries.length > 0
      ? `(empty after filtering — ${rawEntries.length} entries excluded by listing options)`
      : "(empty directory)";
  }

  const truncationNote = truncated
    ? `\n(listing truncated at ${opts.max_entries} entries; ${allPaths.length} total files found)\n`
    : "";
  return `[Directory Listing]\n${listing}\n${truncationNote}`;
}

export async function renderTargetSnapshot(
  resolvedTargetRefs: string[],
  options?: DirectoryListingOptions,
): Promise<string> {
  const sections: string[] = [];
  for (const resolvedTargetRef of resolvedTargetRefs) {
    sections.push(`## ${resolvedTargetRef}`, "", await readTextOrDirectoryListing(resolvedTargetRef, options), "");
  }
  return `${sections.join("\n").trimEnd()}\n`;
}

export async function renderReviewTargetMaterializedInput(
  materializedKind: string,
  materializedRefs: string[],
  options?: DirectoryListingOptions,
): Promise<string> {
  const sections: string[] = [`kind: ${materializedKind}`, ""];
  for (const materializedRef of materializedRefs) {
    sections.push(`## ${path.basename(materializedRef)}`);
    sections.push(`ref: ${materializedRef}`);
    sections.push("");
    sections.push(await readTextOrDirectoryListing(materializedRef, options));
    sections.push("");
  }
  return `${sections.join("\n").trimEnd()}\n`;
}

export function truncateForEmbedding(
  text: string,
  maxLines: number,
  fullRefPath: string,
): string {
  const lines = text.split("\n");
  if (lines.length <= maxLines) {
    return text;
  }
  const truncatedText = lines.slice(0, maxLines).join("\n");
  return `${truncatedText}\n\n(truncated at ${maxLines} lines — full materialized input: ${fullRefPath})\n`;
}

export async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function removeFileIfExists(targetPath: string): Promise<void> {
  try {
    await fs.unlink(targetPath);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return;
    }
    throw error;
  }
}

export async function appendMarkdownLogEntry(
  logPath: string,
  title: string,
  body: string,
): Promise<void> {
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  const trimmedBody = body.trim().length > 0 ? body.trim() : "(no details)";
  const entryText = `## ${isoNow()} | ${title}\n${trimmedBody}\n\n`;
  await fs.appendFile(logPath, entryText, "utf8");
}

export function readSingleOptionValueFromArgv(
  argv: string[],
  optionName: string,
): string | undefined {
  const optionToken = `--${optionName}`;
  const equalsPrefix = `${optionToken}=`;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (typeof token === "string" && token.startsWith(equalsPrefix)) {
      return token.slice(equalsPrefix.length);
    }
    if (token !== optionToken) {
      continue;
    }
    const nextToken = argv[index + 1];
    if (typeof nextToken !== "string" || nextToken.startsWith("--")) {
      return undefined;
    }
    return nextToken;
  }
  return undefined;
}

export function readMultiOptionValuesFromArgv(
  argv: string[],
  optionName: string,
): string[] {
  const optionToken = `--${optionName}`;
  const collected: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== optionToken) {
      continue;
    }
    const nextToken = argv[index + 1];
    if (typeof nextToken !== "string" || nextToken.startsWith("--")) {
      continue;
    }
    collected.push(nextToken);
  }
  return collected;
}

export function hasOptionFlag(argv: string[], optionName: string): boolean {
  const optionToken = `--${optionName}`;
  return argv.includes(optionToken);
}
