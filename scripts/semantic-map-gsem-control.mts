/**
 * G-SEM control-arm generator (multi-artifact design 20260718 §1 G-SEM / handoff 20260719 §2-2).
 *
 * Emits the DETERMINISTIC flat symbol outline for every code observation in a reconstruct
 * session's source-observations.yaml — span line range, kind, symbol_names, doc/signature first
 * line, listed verbatim from `structural_data.code_structure_inventory.symbol_tiles`. No LLM
 * touches this path: the outline is the blind-rating CONTROL against which the recursive seed
 * projection (treatment arm) must answer ≥ k additional structure/purpose questions.
 *
 * Usage:
 *   npx tsx scripts/semantic-map-gsem-control.mts <source-observations.yaml> [--out <file>]
 *
 * Fail-loud: zero code observations with an inventory → exit 1 (an empty control arm would make
 * the G-SEM comparison vacuous — 공허 통과 차단).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";

interface SpanRow {
  line_start: number;
  line_end: number;
  kind: string;
  symbol_names: string[];
  depth: number;
  doc_first_line: string | null;
  signature_line: string | null;
}

interface ObservationRow {
  observation_id: string;
  target_material_kind?: string;
  source_ref?: string;
  structural_data?: {
    code_structure_inventory?: {
      language: string;
      line_count: number;
      content_sha256: string;
      extractor_logic_sha256: string;
      symbol_tiles: { spans: SpanRow[] };
    };
  };
}

function renderOutline(observation: ObservationRow): string {
  const inventory = observation.structural_data!.code_structure_inventory!;
  const lines: string[] = [
    `# G-SEM control — deterministic flat symbol outline (LLM-untouched)`,
    `# observation: ${observation.observation_id}`,
    `# source: ${observation.source_ref ?? "(unknown)"}`,
    `# language: ${inventory.language}  lines: ${inventory.line_count}`,
    `# content_sha256: ${inventory.content_sha256}`,
    `# extractor_logic_sha256: ${inventory.extractor_logic_sha256}`,
  ];
  for (const span of inventory.symbol_tiles.spans) {
    const names = span.symbol_names.length > 0 ? ` ${span.symbol_names.join(",")}` : "";
    const doc = span.doc_first_line ? ` | doc: ${span.doc_first_line}` : "";
    const sig = span.signature_line ? ` | sig: ${span.signature_line}` : "";
    lines.push(`L${span.line_start}-${span.line_end} depth=${span.depth} ${span.kind}${names}${doc}${sig}`);
  }
  return lines.join("\n");
}

const [, , observationsPath, ...rest] = process.argv;
if (!observationsPath) {
  console.error("usage: npx tsx scripts/semantic-map-gsem-control.mts <source-observations.yaml> [--out <file>]");
  process.exit(2);
}
const outFlagIndex = rest.indexOf("--out");
const outPath = outFlagIndex >= 0 ? rest[outFlagIndex + 1] : undefined;
if (outFlagIndex >= 0 && !outPath) {
  console.error("--out requires a file path");
  process.exit(2);
}

const doc = parseYaml(await fs.readFile(path.resolve(observationsPath), "utf8")) as {
  observations?: ObservationRow[];
};
const codeObservations = (doc.observations ?? []).filter(
  (row) =>
    row.target_material_kind === "code" &&
    row.structural_data?.code_structure_inventory !== undefined &&
    row.structural_data.code_structure_inventory.symbol_tiles.spans.length > 0,
);
if (codeObservations.length === 0) {
  console.error(
    "G-SEM control: no code observation with a non-empty code_structure_inventory found — " +
      "an empty control arm is vacuous (fail-loud).",
  );
  process.exit(1);
}
const output = codeObservations.map(renderOutline).join("\n\n");
if (outPath) {
  await fs.writeFile(path.resolve(outPath), `${output}\n`, "utf8");
  console.error(`G-SEM control written: ${path.resolve(outPath)} (${codeObservations.length} observation(s))`);
} else {
  console.log(output);
}
