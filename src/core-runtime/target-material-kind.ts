import fs from "node:fs/promises";
import path from "node:path";

export type TargetMaterialKind =
  | "code"
  | "spreadsheet"
  | "document"
  | "database"
  | "mixed"
  | "unknown";

export const TARGET_MATERIAL_KINDS: readonly TargetMaterialKind[] = [
  "code",
  "spreadsheet",
  "document",
  "database",
  "mixed",
  "unknown",
] as const;

export function isTargetMaterialKind(value: string): value is TargetMaterialKind {
  return TARGET_MATERIAL_KINDS.includes(value as TargetMaterialKind);
}

/** Bounded directory-walk limits for target material detection. Single-sourced so downstream
 *  consumers of the resulting file census (e.g. the environment context profile's honest
 *  census-capped disclosure) read the same cap the walk enforced. */
export const TARGET_MATERIAL_WALK_MAX_ENTRIES = 200;
export const TARGET_MATERIAL_WALK_MAX_DEPTH = 3;

export type TargetMaterialSupportStatus =
  | "supported"
  | "partial"
  | "supported_composite"
  | "partial_composite"
  | "unsupported"
  | "unknown"
  | "reserved_future";

export interface TargetMaterialRefDetection {
  ref: string;
  exists: boolean;
  kind: TargetMaterialKind;
  confidence: number;
  confidence_basis: string;
}

export interface TargetMaterialKindDetection {
  target_material_kind: TargetMaterialKind;
  target_material_kind_candidates: TargetMaterialKind[];
  confidence: number;
  confidence_basis: string;
  per_ref: TargetMaterialRefDetection[];
}

const CODE_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cfg",
  ".cjs",
  ".conf",
  ".cpp",
  ".cs",
  ".css",
  ".cts",
  ".cxx",
  ".dockerfile",
  ".env",
  ".go",
  ".graphql",
  ".h",
  ".hh",
  ".hpp",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".kt",
  ".lock",
  ".mjs",
  ".mts",
  ".php",
  ".prisma",
  ".proto",
  ".py",
  ".rb",
  ".rs",
  ".scss",
  ".sh",
  ".swift",
  ".toml",
  ".ts",
  ".tsx",
  ".xml",
  ".yaml",
  ".yml",
]);

const CODE_BASENAMES = new Set([
  "dockerfile",
  "makefile",
  "rakefile",
  "gemfile",
  "package.json",
  "tsconfig.json",
  "cargo.toml",
  "go.mod",
  "pom.xml",
]);

const SPREADSHEET_EXTENSIONS = new Set([
  ".csv",
  ".ods",
  ".tsv",
  ".xls",
  ".xlsb",
  ".xlsm",
  ".xlsx",
]);

/** True when the ref's name denotes spreadsheet/workbook material by extension
 *  (the canonical SPREADSHEET_EXTENSIONS set). Pure — no IO. */
export function isSpreadsheetRef(ref: string): boolean {
  return SPREADSHEET_EXTENSIONS.has(path.extname(ref).toLowerCase());
}

const DOCUMENT_EXTENSIONS = new Set([
  ".adoc",
  ".doc",
  ".docx",
  ".md",
  ".pdf",
  ".ppt",
  ".pptx",
  ".rtf",
  ".txt",
]);

const DATABASE_EXTENSIONS = new Set([
  ".db",
  ".duckdb",
  ".sql",
  ".sqlite",
  ".sqlite3",
]);

function confidenceForRefKind(kind: TargetMaterialKind, exists: boolean): number {
  if (kind === "unknown") return exists ? 0.2 : 0.1;
  return exists ? 0.92 : 0.35;
}

function classifyFileName(ref: string): {
  kind: TargetMaterialKind;
  basis: string;
} {
  const basename = path.basename(ref).toLowerCase();
  const extension = path.extname(ref).toLowerCase();
  if (CODE_BASENAMES.has(basename) || CODE_EXTENSIONS.has(extension)) {
    return { kind: "code", basis: "file name or extension indicates code/config material" };
  }
  if (SPREADSHEET_EXTENSIONS.has(extension)) {
    return { kind: "spreadsheet", basis: "file extension indicates spreadsheet material" };
  }
  if (DOCUMENT_EXTENSIONS.has(extension)) {
    return { kind: "document", basis: "file extension indicates document material" };
  }
  if (DATABASE_EXTENSIONS.has(extension)) {
    return { kind: "database", basis: "file extension indicates database material" };
  }
  return { kind: "unknown", basis: "no known material extension or basename" };
}

async function collectDirectoryMaterialDetections(args: {
  root: string;
  maxEntries: number;
  maxDepth: number;
}): Promise<TargetMaterialRefDetection[]> {
  const entries: TargetMaterialRefDetection[] = [];

  async function visit(current: string, depth: number): Promise<void> {
    if (entries.length >= args.maxEntries || depth > args.maxDepth) return;
    let dirents;
    try {
      dirents = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const dirent of dirents) {
      if (entries.length >= args.maxEntries) break;
      const child = path.join(current, dirent.name);
      if (dirent.isDirectory()) {
        if (!dirent.name.startsWith(".") && dirent.name !== "node_modules") {
          await visit(child, depth + 1);
        }
        continue;
      }
      if (!dirent.isFile()) continue;
      const classified = classifyFileName(child);
      entries.push({
        ref: child,
        exists: true,
        kind: classified.kind,
        confidence: confidenceForRefKind(classified.kind, true),
        confidence_basis: classified.basis,
      });
    }
  }

  await visit(args.root, 1);
  return entries;
}

async function classifyRef(ref: string): Promise<TargetMaterialRefDetection> {
  const resolved = path.resolve(ref);
  try {
    const stat = await fs.stat(resolved);
    if (stat.isDirectory()) {
      const childDetections = await collectDirectoryMaterialDetections({
        root: resolved,
        maxEntries: TARGET_MATERIAL_WALK_MAX_ENTRIES,
        maxDepth: TARGET_MATERIAL_WALK_MAX_DEPTH,
      });
      const aggregated = aggregateTargetMaterialDetections(childDetections);
      return {
        ref: resolved,
        exists: true,
        kind: aggregated.target_material_kind,
        confidence: Math.min(0.8, aggregated.confidence),
        confidence_basis:
          childDetections.length > 0
            ? `directory inventory heuristic from ${childDetections.length} sampled file(s)`
            : "empty or unreadable directory inventory",
      };
    }
    const classified = classifyFileName(resolved);
    return {
      ref: resolved,
      exists: true,
      kind: classified.kind,
      confidence: confidenceForRefKind(classified.kind, true),
      confidence_basis: classified.basis,
    };
  } catch {
    const classified = classifyFileName(resolved);
    return {
      ref: resolved,
      exists: false,
      kind: classified.kind,
      confidence: confidenceForRefKind(classified.kind, false),
      confidence_basis: `${classified.basis}; ref does not exist`,
    };
  }
}

export function aggregateTargetMaterialDetections(
  detections: TargetMaterialRefDetection[],
): TargetMaterialKindDetection {
  if (detections.length === 0) {
    return {
      target_material_kind: "unknown",
      target_material_kind_candidates: ["unknown"],
      confidence: 0.1,
      confidence_basis: "no target refs to classify",
      per_ref: [],
    };
  }

  const knownKinds = [
    ...new Set(
      detections
        .map((detection) => detection.kind)
        .filter((kind): kind is Exclude<TargetMaterialKind, "unknown" | "mixed"> =>
          kind !== "unknown" && kind !== "mixed",
        ),
    ),
  ];

  if (knownKinds.length === 0) {
    return {
      target_material_kind: "unknown",
      target_material_kind_candidates: ["unknown"],
      confidence: Math.max(...detections.map((detection) => detection.confidence)),
      confidence_basis: "no known target material kind among refs",
      per_ref: detections,
    };
  }

  if (knownKinds.length > 1) {
    return {
      target_material_kind: "mixed",
      target_material_kind_candidates: knownKinds,
      confidence: Math.min(
        0.75,
        Math.max(...detections.map((detection) => detection.confidence)),
      ),
      confidence_basis: `multiple target material kinds detected: ${knownKinds.join(", ")}`,
      per_ref: detections,
    };
  }

  const kind = knownKinds[0];
  if (!kind) {
    throw new Error("target material aggregation invariant violated");
  }
  const firstDetection = detections[0];
  return {
    target_material_kind: kind,
    target_material_kind_candidates: [kind],
    confidence: Math.max(...detections.map((detection) => detection.confidence)),
    confidence_basis:
      detections.length === 1 && firstDetection
        ? firstDetection.confidence_basis
        : `all known refs classified as ${kind}`,
    per_ref: detections,
  };
}

export async function detectTargetMaterialKind(
  refs: string[],
): Promise<TargetMaterialKindDetection> {
  const detections = await Promise.all(refs.map(classifyRef));
  return aggregateTargetMaterialDetections(detections);
}

export async function detectTargetMaterialRefs(
  refs: string[],
): Promise<TargetMaterialRefDetection[]> {
  const detections: TargetMaterialRefDetection[] = [];
  for (const ref of refs) {
    const resolved = path.resolve(ref);
    try {
      const stat = await fs.stat(resolved);
      if (stat.isDirectory()) {
        const childDetections = await collectDirectoryMaterialDetections({
          root: resolved,
          maxEntries: TARGET_MATERIAL_WALK_MAX_ENTRIES,
          maxDepth: TARGET_MATERIAL_WALK_MAX_DEPTH,
        });
        detections.push(...childDetections);
        if (childDetections.length === 0) {
          detections.push({
            ref: resolved,
            exists: true,
            kind: "unknown",
            confidence: 0.1,
            confidence_basis: "empty or unreadable directory inventory",
          });
        }
        continue;
      }
    } catch {
      // classifyRef preserves fail-loud existence metadata for missing refs.
    }
    detections.push(await classifyRef(resolved));
  }
  return detections;
}

export function reviewMaterialSupportStatus(kind: TargetMaterialKind): {
  status: TargetMaterialSupportStatus;
  reason: string | null;
} {
  if (kind === "code") {
    return {
      status: "supported",
      reason: null,
    };
  }
  if (kind === "spreadsheet") {
    // KIND-level claim: review has a per-material spreadsheet adapter — kind-derived
    // review obligations (reviewMaterialGoals) backed by a structural inventory that is
    // rendered into materialized-input (structure inspected only; formula results are
    // NOT recalculated). The PER-TARGET-FORMAT gate lives in the review materializer:
    // when a specific ref uses an unsupported workbook format (.xls/.xlsb/.ods) or is
    // unreadable, the materializer downgrades the recorded support_status from this
    // kind-level supported to partial, so a `supported`/`null` profile is never emitted
    // for a workbook the inventory could not actually read.
    return {
      status: "supported",
      reason: null,
    };
  }
  if (kind === "unknown") {
    return {
      status: "unknown",
      reason: "runtime could not classify target material kind safely",
    };
  }
  if (kind === "mixed") {
    return {
      status: "partial_composite",
      reason:
        "review records per-member material kinds for a mixed target, but cross-material validation remains partial",
    };
  }
  return {
    status: "partial",
    reason:
      "review records target material kind, but material-specific validation is not implemented yet",
  };
}

/**
 * Kind-derived review obligations for the review target profile's `review_goal`.
 * These are the persisted, downstream-projected (problem-framing) review dimensions a
 * per-material review adapter adds on top of the artifact-role and domain goals — a
 * distinct surface from the ephemeral prompt-render `material_kind_obligations` prose.
 *
 * Spreadsheet obligations are distilled from the structural-audit checklist (read/observe
 * scope only — no authoring, no recalculation, no business interpretation) and every goal
 * is backed by a `WorkbookStructuralInventory` field that review renders into
 * materialized-input (see review-artifact-utils `renderSpreadsheetStructuralView`):
 *
 * - formula_integrity            ← formula_cells_total (>0) + formula_patterns (formula text) + error_cells
 * - cross_sheet_reference_integrity ← formula_patterns[].cross_sheet_refs + cross_sheet_key_overlap
 * - named_range_hygiene          ← named_ranges (name/scope/refers_to)
 * - data_validation_coverage     ← data_validations (range/rule_summary)
 * - access_and_protection_hygiene ← sheets[].hidden/protected + macro_present
 * - structural_risk_signals      ← risk_signals + external_links + error_cells
 *
 * The structure-inspected-only honesty is carried by the invariant render header and the
 * review-target-profile contract, NOT by a review_goal string (uniqueStrings may dedupe or
 * reorder it, and it would collide with the inventory's `inspection_method` literal).
 *
 * Other kinds return `[]` until their per-material review adapters land. `mixed` returns
 * `[]` (a spreadsheet inside a mixed bundle does not yet receive spreadsheet obligations —
 * a known C-review limitation, consistent with the mixed support state).
 */
export function reviewMaterialGoals(kind: TargetMaterialKind): string[] {
  if (kind === "spreadsheet") {
    return [
      "formula_integrity",
      "cross_sheet_reference_integrity",
      "named_range_hygiene",
      "data_validation_coverage",
      "access_and_protection_hygiene",
      "structural_risk_signals",
    ];
  }
  return [];
}
