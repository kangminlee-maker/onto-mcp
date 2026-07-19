/**
 * v2 ablation judge 패킷 조립 (사전 등록 PROTOCOL.md 준수).
 *
 * 봉인 규칙(대상 sha 선두 `8`=짝수 → A=처치군, B=대조군; v1과 동일). 대조군(자료 B)은
 * v1 judge-packet.md에서 **그대로 추출**(같은 content sha·결정론 → 바이트 동일; 재-sanitize
 * 리스크 회피). 처치군(자료 A)만 v2 렌더(treatment-render-v2.json)로 교체. 질문 = 1차 5문
 * (v1 동일) + held-out 3문(문맥-무 세션 작성, PROTOCOL에 선핀). judge는 도구 0·arm 봉인.
 *
 *   npx tsx development-records/benchmark/20260719-semantic-map-v2-ablation/build-judge-packet.mts
 */
import fs from "node:fs/promises";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const V1_PACKET = path.join(HERE, "..", "20260719-semantic-map-gsem-n1", "judge-packet.md");
const TREATMENT = path.join(HERE, "treatment-render-v2.json");
const OUT = path.join(HERE, "judge-packet.md");

/** v1 패킷의 "## 자료 B" 코드펜스 블록만 추출 (대조군 — 바이트 동일 재사용). */
function extractControlBlock(v1: string): string {
  const start = v1.indexOf("## 자료 B");
  if (start < 0) throw new Error("v1 packet: '## 자료 B' 없음");
  const fenceOpen = v1.indexOf("```", start);
  const fenceClose = v1.indexOf("```", fenceOpen + 3);
  if (fenceOpen < 0 || fenceClose < 0) throw new Error("v1 packet: 자료 B 코드펜스 없음");
  return v1.slice(fenceOpen, fenceClose + 3).trimEnd();
}

const INSTRUCTIONS = `# 자료 기반 코드 이해 평가

아래 두 자료(자료 A, 자료 B)는 같은 TypeScript 파일에 대한 서로 다른 요약 산출물입니다.
각 질문에 대해 (1) 자료 A만 사용한 답변, (2) 자료 B만 사용한 답변을 독립적으로 작성하고,
각 답변에 "이 자료만으로 충분히 답할 수 있는가"를 answerable: yes/partial/no로 자가 표기하십시오.
자료에 없는 내용을 추측으로 채우지 마십시오 — 자료에 근거가 없으면 no로 표기하는 것이 정답입니다.`;

const QUESTIONS = `## 질문 (1차 기준 — 5문)

1. 이 파일의 전체 목적은 무엇이며, 최상위에서 어떤 주요 기능 영역(블록)으로 나뉘는가? 각 영역의 라인 범위를 근거와 함께 제시하라.
2. 언어별 처리(문법/파서 로딩, 언어→구성 매핑)와 관련된 코드는 어느 영역들에 있고, 서로 어떤 관계로 연결되는가?
3. 이 파일에서 산출물의 결정론(재실행 동일성)을 보장하기 위한 장치는 어디에 위치하며 무엇을 하는가?
4. 파일 내에서 코드의 목적이 전환되는 경계(예: 정의/등록부 → 실행/추출부)는 어디이며, 그 전후 코드는 각각 어떤 성격인가?
5. 외부 소비자가 이 파일에서 호출하는 진입점은 무엇이고, 그 진입점이 내부적으로 의존하는 하위 구조는 어떤 순서로 구성되는가?

## 질문 (2차 신호 — held-out 3문)

6. 이 파일은 크게 "정적 선언 영역"(확장자→언어 매핑, 문법 wasm 경로, tree-sitter 노드타입→kind 매핑 테이블, 컨테이너 kind 집합)과 "알고리즘 영역"(라인 소유권 분할·트리 추출)으로 나뉩니다. 이 두 축이 각각 대략 어느 라인 구간에 놓여 있는지 짚고, 새 언어를 하나 추가하려는 개발자가 왜 알고리즘이 아니라 선언 영역의 몇몇 "행 추가"만으로 끝나도록 설계됐는지, 두 영역의 역할 분리 관점에서 설명하세요.
7. 이 파일에서 외부로 노출된 단일 관찰 진입점부터 시작해, 하나의 코드 파일이 최종 inventory(spans·hierarchy·root_key)로 변환되기까지의 제어·데이터 흐름을 주요 함수 호출 순서대로 서술하세요. 특히 "file → 최상위 선언 → 컨테이너 멤버"의 depth-2 계층과 decl_header/decl_footer 리프가 어느 함수의 어느 구간에서 만들어지는지, 그리고 그 변환이 언제 재귀가 아니라 고정 깊이로 처리되는지를 라인 구간 근거와 함께 밝히세요.
8. 이 파일이 내세우는 "같은 바이트 입력 ⇒ 같은 결과" 결정성 보장과, 추출 로직/매핑 테이블/문법 wasm 중 무엇 하나라도 바뀌면 다운스트림 재사용 키가 자동으로 회전한다는 성질은, 코드상 어느 두 지점이 협력해서 구현합니까? 각 지점이 sha256에 접어 넣는 재료가 서로 어떻게 다른지, 그리고 이 관심사가 왜 파서 초기화·리소스 해제(teardown) 로직과는 다른 영역에 배치되어 있는지를 라인 구간과 함께 설명하세요.`;

const OUTPUT_FORMAT = `## 출력 형식

질문별로: \`### Q<n>\` / \`**A-답변**: … (answerable: …)\` / \`**B-답변**: … (answerable: …)\`
마지막에 요약 표(질문×자료×answerable)를 제시하십시오.`;

const v1 = await fs.readFile(V1_PACKET, "utf8");
const controlBlock = extractControlBlock(v1);
const treatment = await fs.readFile(TREATMENT, "utf8");

const packet = `${INSTRUCTIONS}

## 자료 A

\`\`\`json
${treatment.trimEnd()}
\`\`\`

## 자료 B

${controlBlock}

${QUESTIONS}

${OUTPUT_FORMAT}
`;

await fs.writeFile(OUT, packet, "utf8");
console.log(`wrote ${OUT} (${packet.length} chars)`);
console.log(`  자료 A (treatment) nodes:`, JSON.parse(treatment).nodes.length);
console.log(`  자료 B (control) lines:`, controlBlock.split("\n").length);
