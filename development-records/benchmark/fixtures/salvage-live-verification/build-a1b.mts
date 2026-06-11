import path from "node:path";
import { fileURLToPath } from "node:url";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
// 검증 당시의 실측 세션(tmp) — 다른 환경에서 재현 시 SALVAGE_SESSION_ROOT로 지정.
const SESSION_ROOT = process.env.SALVAGE_SESSION_ROOT ??
  "/var/folders/3h/5ml_qx851hsgcn3h6j6y2l5r0000gn/T/onto-ontology-eval-manufacturing-bom-ffqgHx/.onto/review/20260611-ca3c674b";
import fs from "node:fs/promises";
const YAML = (await import(path.join(REPO_ROOT, "node_modules/yaml/dist/index.js"))).default;
const { buildWorkerSubmitSchema, writeRuntimeSubmitArtifactFromPayload } = await import(path.join(REPO_ROOT, "src/core-runtime/cli/worker-structured-output.ts"));
const S = SESSION_ROOT;
const seat = YAML.parse(await fs.readFile("/tmp/salvage-live/logic-attempt1.yaml", "utf8"));
const rows = seat.stances.map((r) => ({
  issue_id: r.issue_id, stance: r.stance, rationale: r.rationale,
  root_hypothesis_position: r.root_hypothesis_position,
  severity_position: r.severity_position, evidence_refs: r.evidence_refs,
}));
// S3': 미지 필드 혼입 — 내용은 전부 원문에 있고 전사는 드랍만 하면 됨
const corrupted = { stances: rows.map((r, i) => i === 0 ? { ...r, confidence_note: "high confidence from causal trace" } : r) };
const rawPacketText = await fs.readFile(`${S}/prompt-packets/issue-stance/logic.prompt.md`, "utf8");
const submit = buildWorkerSubmitSchema({
  outputFormat: "issue-stance-response", unitId: "issue-stance:logic",
  sessionId: "20260611-ca3c674b", rawPacketText, humanOutputRef: null,
});
let err = "";
try {
  await writeRuntimeSubmitArtifactFromPayload({ payload: corrupted, outputPath: "/tmp/salvage-live/nope.yaml", state: submit.state.runtimeSubmitState });
} catch (e) { err = e.message; }
console.log("S3' 실제 거부:", err.slice(0, 110));
await fs.writeFile("/tmp/salvage-live/a1b.salvage-input.json", JSON.stringify({
  unit_id: "issue-stance:logic", unit_kind: "issue_artifact", output_format: "issue-stance-response",
  stdout: JSON.stringify([{ type: "result", subtype: "success", is_error: false, structured_output: corrupted, result: "" }]),
  error: err,
}), "utf8");
console.log("a1b 동결 작성");
