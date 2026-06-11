import fs from "node:fs/promises";
import YAML from "/Users/kangmin/cowork/onto-mcp-claude/node_modules/yaml/dist/index.js";
import { buildWorkerSubmitSchema, writeRuntimeSubmitArtifactFromPayload } from "/Users/kangmin/cowork/onto-mcp-claude/src/core-runtime/cli/worker-structured-output.ts";

const S = "/var/folders/3h/5ml_qx851hsgcn3h6j6y2l5r0000gn/T/onto-ontology-eval-manufacturing-bom-ffqgHx/.onto/review/20260611-ca3c674b";
const seat = YAML.parse(await fs.readFile("/tmp/salvage-live/logic-attempt1.yaml", "utf8"));
const rows = seat.stances.filter((r: any) => r.issue_id !== "issue-021")
  .map((r: any) => ({
    issue_id: r.issue_id, stance: r.stance, rationale: r.rationale,
    root_hypothesis_position: r.root_hypothesis_position,
    severity_position: r.severity_position, evidence_refs: r.evidence_refs,
  }));
const partial = { stances: rows };
console.log(`partial payload rows: ${rows.length} (issue-021 제거)`);

const rawPacketText = await fs.readFile(`${S}/prompt-packets/issue-stance/logic.prompt.md`, "utf8");
const submit = buildWorkerSubmitSchema({
  outputFormat: "issue-stance-response",
  unitId: "issue-stance:logic",
  sessionId: "20260611-ca3c674b",
  rawPacketText,
  humanOutputRef: null,
});
// 실제 validator로 부분 payload 거부 확인 + 실제 오류 텍스트 채집
let realError = "";
try {
  await writeRuntimeSubmitArtifactFromPayload({
    payload: partial,
    outputPath: "/tmp/salvage-live/should-not-exist.yaml",
    state: (submit.state as any).runtimeSubmitState,
  });
  console.log("UNEXPECTED: partial accepted");
} catch (e) {
  realError = (e as Error).message;
  console.log("실제 validator 거부:", realError.slice(0, 120));
}
// claude stream 형태의 동결 입력 구성 (structured_output 경로)
const frozen = {
  unit_id: "issue-stance:logic",
  unit_kind: "issue_artifact",
  output_format: "issue-stance-response",
  stdout: JSON.stringify([{ type: "result", subtype: "success", is_error: false, structured_output: partial, result: "" }]),
  error: realError,
};
await fs.writeFile("/tmp/salvage-live/s2.salvage-input.json", JSON.stringify(frozen), "utf8");
console.log("동결 입력 작성: s2.salvage-input.json");
