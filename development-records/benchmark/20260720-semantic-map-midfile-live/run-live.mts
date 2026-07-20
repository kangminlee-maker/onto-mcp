/**
 * 실험2 live 드라이버 (PROTOCOL.md) — 초과 regime 중간 파일, DD6′/DD10 v2 live reconstruct.
 * 실험1 드라이버와 동일 규율: 워킹트리 코드 로드(MCP 비경유), sha·옵트인 fail-loud 게이트.
 *
 *   npx tsx development-records/benchmark/20260720-semantic-map-midfile-live/run-live.mts
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createOntoReconstructCoreApi } from "../../../src/core-api/reconstruct-api.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const TARGET_REL = "src/core-runtime/cli/run-review-prompt-execution.ts";
const TARGET_SHA_PREFIX = "d9253eebca3318ec";
const SESSION_REL = ".onto/reconstruct/20260720-dd6-live-exp2";
/** 실험1 PROTOCOL의 핀 intent 자구 그대로 (PROTOCOL.md 재사용 조항). */
const INTENT =
  "Reconstruct the structural ontology of this code file: its major functional regions and " +
  "their boundaries, the deterministic guarantees it provides, and the structures external " +
  "consumers rely on — the exported entry points and the internal composition they depend on.";

const log = (m: string) => console.log(`[exp2-live ${new Date().toISOString()}] ${m}`);

const targetText = await fs.readFile(path.join(REPO, TARGET_REL), "utf8");
const sha = crypto.createHash("sha256").update(targetText).digest("hex");
if (!sha.startsWith(TARGET_SHA_PREFIX)) {
  throw new Error(`exp2 target sha drift: ${sha.slice(0, 16)} !== ${TARGET_SHA_PREFIX} — 질문 앵커 재검증 필요, run 중단.`);
}
const settings = JSON.parse(
  await fs.readFile(path.join(REPO, ".onto", "settings.json"), "utf8"),
) as { reconstruct?: { execution?: { semantic_map_code?: unknown } } };
if (settings.reconstruct?.execution?.semantic_map_code !== true) {
  throw new Error("opt-in reconstruct.execution.semantic_map_code !== true — 활성화 후 재실행.");
}

log(`target sha ok (${sha.slice(0, 16)}), opt-in ok — starting live reconstruct (expected ~2.3h+)`);
const api = createOntoReconstructCoreApi();
const startedAt = Date.now();
const response = await api.runReconstruct({
  projectRoot: REPO,
  targetRefs: [TARGET_REL],
  intent: INTENT,
  sessionRoot: SESSION_REL,
  semanticAuthorRealization: "direct_call",
  confirmationProviderRealization: "direct_call",
});
const durationS = Math.round((Date.now() - startedAt) / 1000);
const summary = {
  durationS,
  sessionRoot: SESSION_REL,
  status: (response as { status?: unknown }).status ?? null,
  keys: Object.keys(response as object),
};
log(JSON.stringify(summary, null, 2));
await fs.writeFile(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "run-summary.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
  "utf8",
);
