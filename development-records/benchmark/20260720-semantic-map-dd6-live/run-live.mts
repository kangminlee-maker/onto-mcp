/**
 * 실험1 live 드라이버 (PROTOCOL.md) — DD6′/DD10 v2 live reconstruct, 소형 파일 N=1.
 *
 * 워킹트리 코드를 tsx 호출 시점에 로드한다 (createOntoReconstructCoreApi 직접 호출,
 * 세션 MCP 서버 비경유 — 구코드 오염 차단). run 전 fail-loud 게이트:
 *   (1) 대상 파일 content sha 선두 = 8f055465204ffb4e (G-SEM 동결, 재평정 게이트 1항)
 *   (2) .onto/settings.json 워킹트리 옵트인 semantic_map_code === true
 *
 *   npx tsx development-records/benchmark/20260720-semantic-map-dd6-live/run-live.mts
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createOntoReconstructCoreApi } from "../../../src/core-api/reconstruct-api.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const TARGET_REL = "src/core-runtime/code-structure-observer.ts";
const TARGET_SHA_PREFIX = "8f055465204ffb4e";
const SESSION_REL = ".onto/reconstruct/20260720-dd6-live-exp1";
/** PROTOCOL.md에 핀된 intent — 여기서만 정의하고 프로토콜과 자구 일치해야 한다. */
const INTENT =
  "Reconstruct the structural ontology of this code file: its major functional regions and " +
  "their boundaries, the deterministic guarantees it provides, and the structures external " +
  "consumers rely on — the exported entry points and the internal composition they depend on.";

const log = (m: string) => console.log(`[dd6-live ${new Date().toISOString()}] ${m}`);

const targetText = await fs.readFile(path.join(REPO, TARGET_REL), "utf8");
const sha = crypto.createHash("sha256").update(targetText).digest("hex");
if (!sha.startsWith(TARGET_SHA_PREFIX)) {
  throw new Error(`G-SEM target sha drift: ${sha.slice(0, 16)} !== ${TARGET_SHA_PREFIX} — run 무효.`);
}
const settings = JSON.parse(
  await fs.readFile(path.join(REPO, ".onto", "settings.json"), "utf8"),
) as { reconstruct?: { execution?: { semantic_map_code?: unknown } } };
if (settings.reconstruct?.execution?.semantic_map_code !== true) {
  throw new Error("opt-in reconstruct.execution.semantic_map_code !== true — 활성화 후 재실행.");
}

log(`target sha ok (${sha.slice(0, 16)}), opt-in ok — starting live reconstruct`);
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
