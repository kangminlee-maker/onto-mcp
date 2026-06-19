import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { atomicWriteFile } from "../artifact-io.js";
import { isSpreadsheetRef } from "../target-material-kind.js";
import {
  observeSpreadsheetSource,
  projectInventoryForAdmission,
  projectInventoryForPrompt,
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
 * Render the workbook inventory as a compact text view for the review prompt
 * (design §3.2 — the "inventory projection (text view)"). Honesty
 * (review-target-profile §6): structure is inspected only, cell values and formula
 * results are not evaluated.
 *
 * The view carries bounded DETAIL — not just counts — for every section that backs a
 * kind-derived review obligation (`reviewMaterialGoals`): formula TEXT + cross-sheet
 * refs, named-range refers_to, data-validation rule_summary, error-cell tokens, and
 * external-link targets. Without the detail those obligations would be unverifiable
 * (the reviewer would be told to audit content that is only an integer in the prompt).
 * Two projections compose: `projectInventoryForAdmission` drops raw cell values, then
 * `projectInventoryForPrompt` bounds array SIZE so a large workbook cannot overflow the
 * prompt. Anything trimmed is surfaced honestly (the "structural sample bounded" line);
 * the full detail stays in the persisted inventory.
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

  const { inventory: inv, sections } = projectInventoryForPrompt(
    projectInventoryForAdmission(inventory),
  );

  // The honesty note lists only the sections this view renders as a bounded ITEM sample,
  // relabeled to the headings the reviewer actually sees — so it never contradicts a
  // count-only section (tables/merged_ranges, printed in full) that is not sampled (RC-2).
  const NOTE_SECTION_LABELS: Record<string, string> = {
    per_sheet_data: "sheet bodies",
    "per_sheet_data.columns": "columns",
    distinct_value_vocab: "distinct-value columns",
    formula_cells: "formula samples",
    named_ranges: "named_ranges",
    data_validations: "data_validations",
    external_links: "external_links",
    error_cells: "error_cells",
    pivot_tables: "pivot_tables",
    cross_sheet_key_overlap: "cross_sheet_key_overlap",
    risk_signals: "risk_signals",
  };
  const renderedTrims = sections.filter((s) => s.section in NOTE_SECTION_LABELS);

  // Total sheet count comes from the FULL inventory; the loop below renders only the
  // sheets whose (capped) per_sheet_data body survived projection.
  lines.push(
    `sheets: ${inventory.sheets.length}${inv.capture_truncated ? " (capture truncated)" : ""}`,
  );
  if (renderedTrims.length > 0) {
    lines.push(
      `structural sample bounded (full detail persisted in the inventory): ${renderedTrims
        .map((s) => `${NOTE_SECTION_LABELS[s.section]} ${s.kept}/${s.total}`)
        .join(", ")}`,
    );
  }

  // Render only sheets that retain a (capped) per_sheet_data body, so a high-sheet-count
  // workbook never emits unbounded '## sheet:' headers without their backing detail
  // (the per_sheet_data cap bounds this; the "sheet bodies" trim above discloses the drop).
  const renderedSheetNames = new Set(inv.per_sheet_data.map((d) => d.sheet));
  for (const sheet of inv.sheets.filter((s) => renderedSheetNames.has(s.name))) {
    const flags = `${sheet.hidden ? " (hidden)" : ""}${sheet.protected ? " (protected)" : ""}`;
    lines.push(
      "",
      `## sheet: ${sheet.name}`,
      `dimensions: ${sheet.dimensions.rows} rows × ${sheet.dimensions.cols} cols${flags}`,
    );
    const data = inv.per_sheet_data.find((d) => d.sheet === sheet.name);
    if (data) {
      const lowConfidence =
        data.header_confidence === "low" ? "; header_confidence: low (layout uncertain)" : "";
      lines.push(
        `layout_kind: ${data.layout_kind}; header_rows: ${data.header_rows ? data.header_rows.join(",") : "none"}${lowConfidence}`,
      );
      if (data.columns.length > 0) {
        lines.push("columns:");
        for (const col of data.columns) {
          const vocab = inv.distinct_value_vocab.find(
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
    // formula_integrity / cross_sheet_reference_integrity: per-sheet formula sample with
    // the formula TEXT and its cross-sheet references, so the reviewer can audit the
    // actual calculation logic instead of only seeing a count.
    const sheetFormulas = inv.formula_cells.filter((c) => c.sheet === sheet.name);
    if (sheetFormulas.length > 0) {
      lines.push(`formulas (sample of ${sheetFormulas.length}):`);
      for (const cell of sheetFormulas) {
        const xref =
          cell.cross_sheet_refs.length > 0
            ? `  [cross-sheet → ${cell.cross_sheet_refs.join(", ")}]`
            : "";
        lines.push(`  - ${cell.cell}: ${cell.formula}${xref}`);
      }
    }
  }

  // Workbook-level obligation-backing detail. Totals come from the full inventory; the
  // rendered items are the bounded sample (any trim is declared above).
  if (inventory.named_ranges.length) {
    lines.push("", `named_ranges: ${inventory.named_ranges.length}`);
    for (const nr of inv.named_ranges) {
      lines.push(`  - ${nr.name} (${nr.scope}) → ${nr.refers_to}`);
    }
  }
  if (inventory.data_validations.length) {
    lines.push("", `data_validations: ${inventory.data_validations.length}`);
    for (const dv of inv.data_validations) {
      lines.push(`  - ${dv.sheet}!${dv.range}: ${dv.rule_summary}`);
    }
  }
  if (inventory.error_cells.length) {
    lines.push("", `error_cells: ${inventory.error_cells.length}`);
    for (const ec of inv.error_cells) {
      lines.push(`  - ${ec.sheet}!${ec.cell}: ${ec.token}`);
    }
  }
  if (inventory.external_links.length) {
    lines.push("", `external_links: ${inventory.external_links.length}`);
    for (const el of inv.external_links) {
      lines.push(`  - ${el.kind}: ${el.target}`);
    }
  }
  // Remaining structural facts that are obligation context but not per-item audit detail.
  const counts: string[] = [];
  if (inventory.tables.length) counts.push(`tables: ${inventory.tables.length}`);
  if (inventory.merged_ranges.length) counts.push(`merged_ranges: ${inventory.merged_ranges.length}`);
  if (inventory.macro_present) counts.push("macro_present: true");
  if (counts.length) lines.push("", counts.join("; "));

  if (inventory.pivot_tables.length) {
    lines.push("", `pivot_tables: ${inventory.pivot_tables.length}`);
    for (const p of inv.pivot_tables) {
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
    for (const o of inv.cross_sheet_key_overlap) {
      const pairs = o.pairwise_overlap.map((p) => `${p.a}∩${p.b}=${p.count}`).join(", ");
      lines.push(`  - ${o.key_name} across [${o.sheets.join(", ")}]: ${pairs}`);
    }
  }
  if (inventory.risk_signals.length) {
    lines.push("", "risk_signals:");
    for (const signal of inv.risk_signals) {
      lines.push(`  - ${signal.kind} @ ${signal.location}: ${signal.literal}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export async function readTextOrDirectoryListing(
  targetPath: string,
  options?: DirectoryListingOptions,
  inventory?: WorkbookStructuralInventory,
): Promise<string> {
  const stats = await fs.stat(targetPath);
  if (!stats.isDirectory()) {
    // Spreadsheet targets are rendered as a structural/aggregate inventory view,
    // not raw bytes (design §3.2). review routes through the SAME shared projection
    // as reconstruct — raw cell values never enter the prompt, and a binary
    // workbook is never dumped as garbage utf8. When the orchestrator already
    // observed this ref (single-observation, design §3.2), reuse that inventory;
    // otherwise observe here. The render applies the admission + prompt projections.
    if (isSpreadsheetRef(targetPath)) {
      return renderSpreadsheetStructuralView(
        inventory ?? (await observeSpreadsheetSource(targetPath)),
      );
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
  inventoryByRef?: Map<string, WorkbookStructuralInventory>,
): Promise<string> {
  const sections: string[] = [];
  for (const resolvedTargetRef of resolvedTargetRefs) {
    sections.push(
      `## ${resolvedTargetRef}`,
      "",
      await readTextOrDirectoryListing(
        resolvedTargetRef,
        options,
        inventoryByRef?.get(path.resolve(resolvedTargetRef)),
      ),
      "",
    );
  }
  return `${sections.join("\n").trimEnd()}\n`;
}

export async function renderReviewTargetMaterializedInput(
  materializedKind: string,
  materializedRefs: string[],
  options?: DirectoryListingOptions,
  inventoryByRef?: Map<string, WorkbookStructuralInventory>,
): Promise<string> {
  const sections: string[] = [`kind: ${materializedKind}`, ""];
  for (const materializedRef of materializedRefs) {
    sections.push(`## ${path.basename(materializedRef)}`);
    sections.push(`ref: ${materializedRef}`);
    sections.push("");
    sections.push(
      await readTextOrDirectoryListing(
        materializedRef,
        options,
        inventoryByRef?.get(path.resolve(materializedRef)),
      ),
    );
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
