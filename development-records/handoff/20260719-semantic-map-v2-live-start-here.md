# semantic-map v2 LIVE start-here — DD6′ 소스본문 검증 + 대형파일 + 결정론/LLM 경계 (2026-07-19)

> 대상: /clear 후 새 세션. task #10 후속. v2 코드는 **main 착지**(PR #233 → `27bcf03`).
> 규범 SSOT: [20260718-semantic-map-multi-artifact-phase1-detailed-design.md](../design/20260718-semantic-map-multi-artifact-phase1-detailed-design.md)
> §10 v2.1/v2.2. 무-spend ablation 결과: [benchmark/20260719-semantic-map-v2-ablation/RESULT.md](../benchmark/20260719-semantic-map-v2-ablation/RESULT.md).
>
> **owner 지시(2026-07-19)**: v2 코드 기본-OFF 머지(완료) 후, **기존 프로토콜대로 live 진행** +
> **run.ts 같은 대형파일도** + **세만틱 맵이 결정론적 영역까지 cover 가능한지** 확인. 이 문서는
> 그 실행 패킷이다(이번 세션은 준비만; 실제 live spend는 새 세션).

---

## 0. 상태 핀 (시작 시 재확인)

- v2 = **main 착지** `27bcf03`. `git fetch origin && git checkout main && git pull`로 시작.
  (구현 브랜치 `feat/semantic-map-v2-dd10-dd6`는 머지됨; 이 핸드오프는 별도 docs 브랜치.)
- 옵트인 `reconstruct.execution.semantic_map_code`는 repo settings에 **UNSET(OFF)**. live 활성화 =
  이 키 하나(`.onto/settings.json`에 `true`). run 시 워킹트리 한정, main 승격은 별도 owner 결정.
- seat(7b 실측 기준): synthesize = `gpt-5.6-luna@low`(`actors.semantic_map_synthesize`),
  verify = base author `gpt-5.6-sol@medium`. OAuth codex 경로. stage config =
  `DEFAULT_SEMANTIC_MAP_STAGE_CONFIG`(fanin 2·over_context_budget 2·synth 2,400·verify 1,000·
  nodes 512(code)·disclosure 30). 스위트 baseline: `npx vitest run` = 3,283 green 기준.

---

## 1. 먼저 읽을 재구성 (boundary-scout 결정론 실측 — 실험 설계의 전제)

**런타임 OFF-baseline은 "플랫 심볼 outline"이 아니라 "원시 소스 전문"이다.** ablation의 대조군
(플랫 outline)은 벤치 구성물이었고, 실제 런타임이 seed에 넣는 것은 다르다:

- **결정론 구조 인벤토리(spans/hierarchy)는 always-on이 아니다** — 맵과 **같은 옵트인**
  (`semantic_map_code`)에 묶여 있다. materialize-preparation.ts:503-516(인벤토리 캡처 조건),
  reconstruct-api.ts:1045-1046·1580-1581(옵트인=플래그), run.ts:16267-16270(맵 스테이지 게이트).
- **원시 소스 `content_excerpt`는 옵트인 무관하게 전문 캡처**(코드 확장자 → 5,000,000자 ceiling).
  materialize-preparation.ts:399-410·425·492.
- 프롬프트 기여(observationPromptPayload → compactStructuralDataForPrompt, run.ts:10008):
  - **OFF**: `content_excerpt`(원시 소스, doc-excerpt budget로 투영)만.
  - **ON**: 원시 소스(투영) + `code_structure_inventory`(**무한·미투영** — 아래 §2 플래그) +
    `provisional_labels`=렌더된 맵(40,000자 bound, run.ts:10140-10163).

**함의(경계 결정의 핵심)**:
- 파일이 doc budget에 **들어감** → seed 저자가 이미 **소스 전문**을 봄. 맵은 그 위에 요약을 얹는
  잉여. (ablation이 "플랫 outline조차 맵을 이긴다"를 보였는데, 실baseline은 그보다 강한 원시 소스.)
- 파일이 doc budget **초과** → 원시 소스는 head만 투영(잘림). 맵(40K, 전-파일 계층)이 **유일한
  전-파일 뷰**. → **맵의 고유 가치는 결정론/원시 경로가 닿지 못하는 초과 영역에 있다.**

---

## 2. PRE-LIVE 플래그 (대형파일 live 전 처리 필요)

`code_structure_inventory`가 **미투영(무한)**으로 프롬프트에 들어간다 — `compactStructuralDataForPrompt`
가 `{...structuralData}`로 통과시키고(run.ts:10016), `workbook_inventory`만 bound(:10024-10036)하지
code 인벤토리는 안 한다. 실측: run.ts 인벤토리 JSON = **407,822자**, review-invoke.ts = 60,503자.

→ run.ts를 옵트인 ON으로 돌리면 프롬프트 ≈ 원시소스 200K~475K + 인벤토리 407K + 맵 40K ≈ **650K자**
로 폭발하고, 맵 기여가 묻힌다. **대형파일 live 전 결정**: code 인벤토리도 bounded projection
(workbook_inventory 방식 미러) 하거나 프롬프트에서 제외. 이건 실험 유효성의 전제다(안 하면 맵의
효과를 인벤토리 홍수와 분리 불가).

---

## 3. 규모·budget·수요 참조표 (boundary-scout 실측 — 재측정 불필요)

| 파일 | 줄 | 파일자수 | spans | flat-outline 자수 | 인벤토리 JSON 자수 |
|---|---|---|---|---|---|
| markdown-section.ts | 92 | 3,851 | 7 | 1,038 | — |
| discovery/host-detection.ts | 126 | 4,742 | 21 | 2,695 | 6,310 |
| **code-structure-observer.ts** | 414 | 15,910 | 102 | 12,871 | — |
| reconstruct/governing-snapshot.ts | 993 | 37,615 | 47 | 5,222 | — |
| cli/review-invoke.ts | 3,069 | 103,390 | 209 | 20,206 | 60,503 |
| cli/run-review-prompt-execution.ts | 8,556 | 314,559 | 401 | 42,141 | — |
| **reconstruct/run.ts** | 19,858 | 928,220 | 1,269 | 164,816 | 407,822 |

- outline·수요는 **줄 수가 아니라 span 수(심볼 밀도)** 를 따른다(depth 고정 2).
- budget: code 맵 렌더 `CODE_SEMANTIC_MAP_PROMPT_RENDER_CHAR_BUDGET`=40,000(run.ts:2370),
  doc-excerpt 투영 = `deriveDocumentExcerptProjectionBudget`(floor 200,000 / gpt-5.5 475,000 /
  opus-4.8 450,000; window 없는 seat=200,000 floor). materialize-preparation.ts:234·364-382.
- **크로스오버**: (a) 원시 소스가 doc budget 초과 = run.ts(928K)는 전 seat 초과,
  run-review-prompt-execution.ts(314K)는 200K floor seat에서 초과; (b) flat outline이 40K 렌더
  budget 초과 = run-review-prompt-execution.ts(42K)부터, run.ts는 4× 초과.
- **run.ts 맵 수요(결정론 fold, NO LLM)**: 총 trace 2,537노드 → 비-subsumed synthesize **1,317**
  (< 2,400 캡, OK). **verify 수요는 결정론 산출 불가**(LLM이 제안한 unanchored 경계 수에 비례) —
  7b가 run.ts를 이월한 이유가 verify 캡 1,000 초과 리스크다. **미검**.

---

## 4. 세 실험 (owner 지시 3항)

### 실험 1 — 소형 파일 DD6′ live (기존 §10 게이트 4항)

- **대상**: `code-structure-observer.ts`(원시 소스 15.9K < doc budget = **맵의 최악 regime**,
  원시 소스가 이미 fit). **G-SEM 대상 파일이므로 수정 금지**(sha 선두 `8f055465204ffb4e`).
- **질문**: DD6′(frontier 소스 본문)로 요약이 풍부해진 맵이 대조군을 상회하는가? ablation이 미검
  으로 남긴 유일 변수. 5문(1차) + held-out 3문 — ablation PROTOCOL 그대로 재사용 가능.
- **대조군 선택(중요)**: ablation은 플랫 outline을 썼다. **실baseline은 원시 소스**다. 최소한
  대조군을 (B1) 플랫 outline(ablation 비교가능성) **+ (B2) 원시 소스 전문**(실baseline) 둘 다로
  두고 judge를 돌려라 — "맵이 원시 소스를 이기는가"가 진짜 제품 질문이다. (요약 vs 원문은 fit
  파일에서 원문이 이기는 게 사전 예상; 그래도 DD6′ 효과를 측정.)
- **절차**: 신규 사전 등록(재평정 게이트 1항 — 렌더 열람 전 커밋) → 옵트인 ON(워킹트리) → live
  reconstruct(대상 파일 1벌) → 블라인드 judge(문맥-무·도구-0). PASS = 1차 5문 중 처치군 우위 ≥3.
- **비용**: 7b 실측 ≈ synthesize 109 → 2,163s + verify. (같은 파일이라 유사.)

### 실험 2 — 대형 파일 live (맵의 가치 regime)

- **대상 후보**: run.ts(928K, 진짜 초과) — 단 §2 플래그 처리 + verify 캡 리스크 + 비용(아래).
  **먼저 중간 크기 프로브 권장**: run-review-prompt-execution.ts(314K, 200K floor seat 초과,
  ~401 spans → 수요 run.ts의 ~1/3, verify 캡 여유 큼)로 파이프라인·유효성 확인 후 run.ts.
- **질문**: 원시 소스가 **head만 투영**되는 파일에서, 맵(전-파일 계층, 40K)이 **budget-잘린 원시
  소스**를 전-파일 질문에서 상회하는가? → 질문은 **파일 tail·전역 구조**를 요구하도록 설계
  (head만으로 못 푸는 것). 이게 맵의 최선 regime.
- **캡/비용 플래그**:
  - run.ts synthesize 1,317 < 2,400(OK). **verify 미검** — 초과 시 관찰이 flat path로 실패(X5)
    → run 무효. 완화: `max_verify_calls` bump 또는 중간 크기 선행.
  - 비용: run.ts ~1,317 synthesize ≈ **~7시간+**(7b rate ~20s/dispatch) + verify. 중간 크기
    ~400 synthesize ≈ ~2시간. **spend·wall-time 크다 — owner에 재확인 후 집행.**

### 실험 3 — 맵이 결정론 영역까지 cover 가능한가

- **질문(owner)**: 맵이 결정론 경로가 주는 것(구조·시그니처 사실)을 **포괄(superset)** 하는가,
  아니면 요약하며 detail을 **잃는가**? §1 재구성상 답의 뼈대: fit 파일에선 원시 소스가 이미 그
  역할 → 맵은 초과 영역을 cover. 실험 1(B2 원시 소스 대조)이 이걸 직접 측정한다 — 맵이 원시
  소스 대비 detail을 잃으면 "cover 못 함", 동등 이상이면 "cover 함".
- **추가 측정(무-spend 가능)**: 실험 1/2의 맵 렌더에서 결정론 사실(함수 시그니처·구조 경계)이
  얼마나 보존되는지 대조. DD6′ 소스 본문이 시그니처를 요약에 복원하는지 확인.

---

## 5. 경계 결정 (owner 지시 3항 — 실험 후 확정)

실험 1/2 증거로 확정할 설계(제안, 라이브 후 owner 재평정):
- **파일 ≤ doc budget** (원시 소스 fit): 결정론/원시 경로 — 원시 소스 전문이 seed에 이미 있으니
  LLM 맵 **비활성**(잉여·비용·희석). ablation이 이 영역에서 결정론 우세를 실증.
- **파일 > doc budget** (원시 소스 잘림): LLM 맵 — 전-파일을 40K로 압축하는 **유일 전-파일 뷰**.
- **`code_structure_inventory` 주입**: §2 — bounded projection 신설 또는 제외(원시도 맵도 아닌
  무한 JSON은 어느 영역에서도 정당화 안 됨).
- 이 경계는 O-6류 owner 설계 결정. 크로스오버 수치는 §3 표에 핀됨.

---

## 6. 활성화 · 보안 · disclosure

- **활성화**: `.onto/settings.json`의 `reconstruct.execution.semantic_map_code: true`. run 시
  워킹트리 한정. main 승격 = G-SEM/실험 PASS 후 별도 owner 결정(O-1 승격 게이트).
- **보안(O-6)**: v2부터 frontier 소스 **본문이 seat 모델로 전송**(gpt-5.6-luna@low/sol@medium,
  OAuth). 옵트인=repo 단위. disclosure 스캔은 봉투 키가 아니라 **요약 내용까지** + seat CLI
  transcript 저장소(repo 밖) 표면 명시. §10 "보안 결과 명시" 참조.
- **비용**: 실험 1 ~2,163s, 실험 2 중간 ~2h·run.ts ~7h+. 각 집행 전 owner 확인.

---

## 7. 검증 명령 (변경 시 전건 exit 0)

```
npx tsc -p tsconfig.json --noEmit
npx vitest run
npx tsx scripts/semantic-map-golden.mts check
npx tsx scripts/reduce-proof-harness.mts
npx tsx scripts/code-reduce-proof-harness.mts
npx tsx scripts/check-import-boundary.ts
```

---

## 8. 실코드 포인터

- 프롬프트 기여 분기: `compactStructuralDataForPrompt` run.ts:10008-10054(§2 무투영 지점 :10016·
  workbook만 bound :10024-10036), 맵 렌더 대체 :10140-10163.
- 옵트인 배선: reconstruct-api.ts:1045-1046·1580-1581, run.ts:16267-16270.
- 인벤토리 캡처 게이트: materialize-preparation.ts:503-516·544; content_excerpt ceiling :399-410·425.
- doc-excerpt budget: materialize-preparation.ts:234·364-382.
- code 봉투 빌더(DD6′ 소스 슬라이스): comprehension-semantic-map-code.ts:buildCodeSynthesisInputForNode
  (frontier source_lines), 소스 admission 가드 run.ts:semanticMapCodeSourceExcerptGuardFailure.
- code fingerprint pre-image(회전 격리·봉투 캡 fold): run.ts:semanticMapCodeObservationFingerprint.
- 렌더 budget/max_nodes 상수: run.ts:2370(40,000)·CODE_SEMANTIC_MAP_MAX_NODES(512).

---

## 9. 남은 후속 (이 트랙 밖)

- step 8 = Phase 1b set-tier (§4, O-3) — 경계 결정·live 결과 후.
- 완료 보고 전 독립 multi-lens 교차검증으로 material 0 확인(repo 관례).
