import fs from "node:fs/promises";
import { buildWorkerSubmitSchema, writeRuntimeSubmitArtifactFromPayload } from "/Users/kangmin/cowork/onto-mcp-claude/src/core-runtime/cli/worker-structured-output.ts";

const S = "/var/folders/3h/5ml_qx851hsgcn3h6j6y2l5r0000gn/T/onto-ontology-eval-manufacturing-bom-ffqgHx/.onto/review/20260611-ca3c674b";
const frozen = JSON.parse(await fs.readFile("/tmp/salvage-live/s2.salvage-input.json", "utf8"));
const stream = JSON.parse(frozen.stdout);
const full = structuredClone(stream[0].structured_output);
// 35행 partial에 issue-021을 빼고 만든 것이므로, A-1은 완전 36행 기준이 필요 — attempt1 seat에서 재구성
import YAML from "/Users/kangmin/cowork/onto-mcp-claude/node_modules/yaml/dist/index.js";
const seat = YAML.parse(await fs.readFile("/tmp/salvage-live/logic-attempt1.yaml", "utf8"));
const rows = seat.stances.map((r) => ({
  issue_id: r.issue_id, stance: r.stance, rationale: r.rationale,
  root_hypothesis_position: r.root_hypothesis_position,
  severity_position: r.severity_position, evidence_refs: r.evidence_refs,
}));
// A-1: enum 위반 변형 (S3) — row0 stance 오타
const corrupted = { stances: rows.map((r, i) => i === 0 ? { ...r, stance: "strongly_support" } : r) };
const rawPacketText = await fs.readFile(`${S}/prompt-packets/issue-stance/logic.prompt.md`, "utf8");
const submit = buildWorkerSubmitSchema({
  outputFormat: "issue-stance-response", unitId: "issue-stance:logic",
  sessionId: "20260611-ca3c674b", rawPacketText, humanOutputRef: null,
});
let err1 = "";
try {
  await writeRuntimeSubmitArtifactFromPayload({ payload: corrupted, outputPath: "/tmp/salvage-live/nope.yaml", state: submit.state.runtimeSubmitState });
} catch (e) { err1 = e.message; }
console.log("A-1 실제 거부:", err1.slice(0, 100));
await fs.writeFile("/tmp/salvage-live/a1.salvage-input.json", JSON.stringify({
  unit_id: "issue-stance:logic", unit_kind: "issue_artifact", output_format: "issue-stance-response",
  stdout: JSON.stringify([{ type: "result", subtype: "success", is_error: false, structured_output: corrupted, result: "" }]),
  error: err1,
}), "utf8");
// A-2: 내용 결손 prose-only (3개 이슈만 서술) — 발명 가드 표적
const prose = rows.slice(0, 3).map((r) => `For ${r.issue_id}, the logic lens ${r.stance}s: ${r.rationale}`).join("\n\n");
await fs.writeFile("/tmp/salvage-live/a2.salvage-input.json", JSON.stringify({
  unit_id: "issue-stance:logic", unit_kind: "issue_artifact", output_format: "issue-stance-response",
  stdout: JSON.stringify([{ type: "result", subtype: "success", is_error: false, result: prose }]),
  error: "Failed to parse worker structured output JSON: prose only",
}), "utf8");
console.log("A-1/A-2 동결 입력 작성 완료");
