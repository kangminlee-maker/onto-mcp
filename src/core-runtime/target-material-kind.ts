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

export type TargetMaterialSupportStatus =
  | "supported"
  | "partial"
  | "unsupported"
  | "unknown";

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
  ".conf",
  ".cpp",
  ".cs",
  ".css",
  ".dockerfile",
  ".env",
  ".go",
  ".graphql",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".kt",
  ".lock",
  ".mjs",
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
        maxEntries: 200,
        maxDepth: 3,
      });
      const aggregated = aggregateDetections(childDetections);
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

function aggregateDetections(
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
  return aggregateDetections(detections);
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
  if (kind === "unknown") {
    return {
      status: "unknown",
      reason: "runtime could not classify target material kind safely",
    };
  }
  if (kind === "mixed") {
    return {
      status: "partial",
      reason:
        "review records mixed material kind, but per-member material-specific validation is not implemented yet",
    };
  }
  return {
    status: "partial",
    reason:
      "review records target material kind, but material-specific validation is not implemented yet",
  };
}
