/**
 * 처치군 렌더 + 유효성 지표 (PROTOCOL.md) — live 세션 sidecar의 code 행을 DD9/DD10 렌더러로
 * 렌더하고 유효성 전제(admit ≥30 AND 라인 커버리지 ≥80%)를 기계 산출한다.
 * v2 sidecar는 max_nodes 512라 lex-컷 사본 문제(ablation gh m-1)가 없다 — sidecar가 소스다.
 *
 *   npx tsx development-records/benchmark/20260720-semantic-map-dd6-live/render-treatment.mts \
 *     <session>/comprehension/semantic-map.yaml
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import {
  renderSemanticMapProjection,
  CODE_SEMANTIC_MAP_PROMPT_RENDER_CHAR_BUDGET,
} from "../../../src/core-runtime/reconstruct/run.js";

const OUT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(OUT_DIR, "../../..");
const TARGET = path.join(REPO, "src/core-runtime/code-structure-observer.ts");
const TARGET_SHA_PREFIX = "8f055465204ffb4e";

const sidecarPath = process.argv[2];
if (!sidecarPath) {
  console.error("usage: npx tsx render-treatment.mts <semantic-map.yaml sidecar>");
  process.exit(2);
}

const targetText = await fs.readFile(TARGET, "utf8");
const sha = crypto.createHash("sha256").update(targetText).digest("hex");
if (!sha.startsWith(TARGET_SHA_PREFIX)) {
  throw new Error(`G-SEM target sha drift: ${sha.slice(0, 16)} — 렌더 무효.`);
}
const fileLines = targetText.length === 0 ? 0 : targetText.split(/\r?\n/).length;

const sidecar = parseYaml(await fs.readFile(path.resolve(sidecarPath), "utf8")) as {
  observations: { observation_id: string; target_material_kind?: string; projection: unknown }[];
};
const codeRows = sidecar.observations.filter((row) => row.target_material_kind === "code");
if (codeRows.length !== 1) {
  throw new Error(`expected exactly 1 code sidecar row, got ${codeRows.length} — fail-loud.`);
}
const render = renderSemanticMapProjection(
  codeRows[0]!.projection as Parameters<typeof renderSemanticMapProjection>[0],
  CODE_SEMANTIC_MAP_PROMPT_RENDER_CHAR_BUDGET,
  false,
  "code",
  REPO,
) as { nodes: { region: string }[]; nodes_total: number; render_truncated: boolean };

const covered = new Set<number>();
for (const node of render.nodes) {
  const m = /:(\d+)-(\d+)$/.exec(node.region);
  if (!m) throw new Error(`unparsable region label ${node.region}`);
  for (let ln = Number(m[1]); ln <= Number(m[2]); ln += 1) covered.add(ln);
}
const coverage = covered.size / fileLines;
const metrics = {
  admitted_nodes: render.nodes.length,
  nodes_total: render.nodes_total,
  render_truncated: render.render_truncated,
  file_lines: fileLines,
  covered_lines: covered.size,
  coverage: Number(coverage.toFixed(4)),
  validity_admit_ge_30: render.nodes.length >= 30,
  validity_coverage_ge_080: coverage >= 0.8,
};
await fs.writeFile(
  path.join(OUT_DIR, "treatment-render.json"),
  `${JSON.stringify(render, null, 2)}\n`,
  "utf8",
);
await fs.writeFile(
  path.join(OUT_DIR, "metrics.json"),
  `${JSON.stringify(metrics, null, 2)}\n`,
  "utf8",
);
console.log(JSON.stringify(metrics, null, 2));
