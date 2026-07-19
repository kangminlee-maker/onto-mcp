/** 처치군 재현 스크립트 (PROTOCOL.md): live 세션 sidecar의 code 행을 DD9 렌더러로 렌더.
 *  usage: npx tsx development-records/benchmark/20260719-semantic-map-gsem-n1/render-treatment.mts <semantic-map.yaml> */
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import {
  renderSemanticMapProjection,
  SEMANTIC_MAP_PROMPT_RENDER_CHAR_BUDGET,
} from "../../../src/core-runtime/reconstruct/run.js";

const sidecarPath = process.argv[2];
if (!sidecarPath) {
  console.error("usage: npx tsx render-treatment.mts <semantic-map.yaml sidecar>");
  process.exit(2);
}
const sidecar = parseYaml(await fs.readFile(path.resolve(sidecarPath), "utf8")) as {
  observations: { observation_id: string; target_material_kind?: string; projection: unknown }[];
};
const codeRows = sidecar.observations.filter((row) => row.target_material_kind === "code");
if (codeRows.length === 0) {
  console.error("no code sidecar rows — treatment arm is empty (fail-loud)");
  process.exit(1);
}
for (const row of codeRows) {
  console.log(`# treatment — recursive seed projection (observation: ${row.observation_id})`);
  console.log(JSON.stringify(
    renderSemanticMapProjection(
      row.projection as Parameters<typeof renderSemanticMapProjection>[0],
      SEMANTIC_MAP_PROMPT_RENDER_CHAR_BUDGET,
      false,
    ),
    null,
    2,
  ));
}
