/**
 * 실험2 judge 패킷 조립 (PROTOCOL.md 중첩 3-조건). 자료 X = 소스 head 200,000자(런타임 투영
 * 규칙과 동일 slice), 자료 Y = bounded 인벤토리 projection(pretty JSON), 자료 Z = v2 맵 렌더.
 * 질문은 커밋된 블라인드 저작본(questions-blind-authored.md)에서 [근거: …] 검증 힌트를 제거해
 * 그대로 싣는다. judge는 도구 0.
 *
 *   npx tsx development-records/benchmark/20260720-semantic-map-midfile-live/build-judge-packet.mts
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { observeCodeStructure } from "../../../src/core-runtime/code-structure-observer.js";
import { projectCodeInventoryForPrompt } from "../../../src/core-runtime/code-structure-inventory-projection.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");
const TARGET = path.join(REPO, "src/core-runtime/cli/run-review-prompt-execution.ts");
const TARGET_SHA_PREFIX = "d9253eebca3318ec";
const HEAD_BUDGET = 200_000; // deriveDocumentExcerptProjectionBudget 실측 (PROTOCOL 핀)
const OUT = path.join(HERE, "judge-packet.md");

const targetText = await fs.readFile(TARGET, "utf8");
const sha = crypto.createHash("sha256").update(targetText).digest("hex");
if (!sha.startsWith(TARGET_SHA_PREFIX)) throw new Error(`target sha drift: ${sha.slice(0, 16)}`);
if (targetText.includes("`````")) throw new Error("target contains 5-backtick run — fence escape 필요");

const headSlice = targetText.slice(0, HEAD_BUDGET);
const observed = await observeCodeStructure({ ref: TARGET, text: targetText });
if (observed.status !== "ok") throw new Error("observe failed");
const projection = projectCodeInventoryForPrompt(observed.inventory);
const inventoryJson = JSON.stringify(projection.inventory, null, 2);
const treatment = (await fs.readFile(path.join(HERE, "treatment-render.json"), "utf8")).trimEnd();

const questionsRaw = await fs.readFile(path.join(HERE, "questions-blind-authored.md"), "utf8");
const questionLines = questionsRaw
  .split("\n")
  .filter((line) => /^\d+\./.test(line))
  .map((line) => line.replace(/\s*\[근거:[^\]]*\]\s*$/u, ""));
if (questionLines.length !== 8) throw new Error(`expected 8 questions, got ${questionLines.length}`);

const packet = `# 자료 기반 코드 이해 평가 (누적 조건)

같은 TypeScript 파일에 대한 세 자료가 있습니다. 자료 X는 파일의 앞부분(일부만 포함될 수
있음), 자료 Y는 구조 인벤토리, 자료 Z는 요약 산출물입니다. 각 질문에 대해 다음 세 조건으로
독립 답변을 작성하십시오:

- **조건①**: 자료 X만 사용.
- **조건②**: 자료 X와 자료 Y만 사용.
- **조건③**: 자료 X, Y, Z 모두 사용.

각 답변에 "해당 조건의 자료만으로 충분히 답할 수 있는가"를 answerable: yes/partial/no로
자가 표기하십시오. 자료에 없는 내용을 추측으로 채우지 마십시오 — 근거가 없으면 no로 표기하는
것이 정답입니다.

## 자료 X

\`\`\`\`ts
${headSlice}
\`\`\`\`

## 자료 Y

\`\`\`json
${inventoryJson}
\`\`\`

## 자료 Z

\`\`\`json
${treatment}
\`\`\`

## 질문 (1차 기준 — 5문)

${questionLines.slice(0, 5).join("\n")}

## 질문 (2차 신호 — 3문)

${questionLines.slice(5).join("\n")}

## 출력 형식

질문별로: \`### Q<n>\` / \`**조건①**: … (answerable: …)\` / \`**조건②**: … (answerable: …)\` / \`**조건③**: … (answerable: …)\`
마지막에 요약 표(질문×조건×answerable)를 제시하십시오.
`;

await fs.writeFile(OUT, packet, "utf8");
console.log(`wrote ${OUT} (${packet.length} chars)`);
console.log("  X head chars:", headSlice.length, "| Y inventory chars:", inventoryJson.length, "| Z render chars:", treatment.length);
