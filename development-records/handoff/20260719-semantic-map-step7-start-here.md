# semantic-map step 7 start-here — E2E mock → live N=1 (G-SEM) (2026-07-19)

> 대상: 새 세션. task #10 후속. 설계 SSOT =
> [20260718-semantic-map-multi-artifact-phase1-detailed-design.md](../design/20260718-semantic-map-multi-artifact-phase1-detailed-design.md)
> — **§6-4(E2E mock)·§6-5(live)·§1 G-SEM·§7 step 7 행·O-2 결정**이 이 단계의 규범.
> 이 문서는 상태 핀 + 실행 절차 + 이 세션(step 6)에서 확인한 배선 사실만 담는다.

## 0. 상태 핀 (시작 시 재확인)

- main `678c2d8` = PR #230 머지 (step 6: L2 코어 추출 + 코드 kind 라우팅/봉투/계약/DD9 5표면).
  step 1~6 전부 main 착지. 교차검증 3-렌즈 material 잔여 0 (반영 커밋 261c102·ce1564e 포함).
- 시작 절차: `git fetch origin` → 새 브랜치 from `origin/main`. 워크트리 사용 시 pwd/branch 재확인.
- 게이트 상태: G-SS(골든 `scripts/semantic-map-golden.mts check`)·G-L2·G-OFF 전건 green,
  스위트 3,273 green. gate-logic sha 1회 회전은 **이미 착지·격리 완료** — 추가 조치 불요.

## 1. step 7 범위 (설계 §7 row 7 · O-2 확정)

**7a. E2E mock (§6-4)** — reconstruct **전 구간**(스테이지 단위 아님; 그건 step 6에서 완료)을
2-파일 code fixture로: `ONTO_LLM_MOCK=1` api-레벨 하니스
(`src/core-api/reconstruct-api.mock-realization.test.ts` 패턴)에 code 관찰 2개(파일당 관찰 1개
— 멀티파일 조립은 1b, 여기선 독립 2관찰)를 태워:
- seed projection에 **code 노드 > 0 단언** (카디널리티 게이트 — 공허 통과 차단)
- **DD9 렌더러 출력 스냅샷** (`renderSemanticMapProjection(…, "code")` — region `file:ls-le`·
  boundary `line` 어휘)
- census/sidecar kind 판별자·G-OFF(설정 OFF arm 바이트 동일)은 스테이지 테스트가 이미 커버 —
  중복 말고 **api 경로에서만 보이는 것**(설정 체인→관찰→스테이지→seed payload 관통)을 단언.

**7b. live N=1 (§6-5, O-2: mock 통과 직후)** — 소형 실파일 1개, 1a 경로, owner-spend.
- 수용 기준 = **G-SEM** (§2 아래). 실패 시 **재설계 스톱** (O-5로 봉투 fallback 소진 — 추가
  봉투 확장 재제안 금지).
- G-OFF 보증으로 제품 spreadsheet 경로는 어느 경우에도 무손상.

## 2. G-SEM 프로토콜 (설계 §1 — live 수용 기준)

1. **산출물**: live run의 재귀 seed projection (세션 `comprehension/semantic-map.yaml` sidecar의
   code 행 + seed prompt `semantic_map` 필드 렌더).
2. **대조군(결정론)**: 같은 파일의 flat 심볼 outline — 관찰 artifact의
   `structural_data.code_structure_inventory.symbol_tiles`에서 span(라인 범위)·kind·
   symbol_names·doc/signature 첫 줄을 그대로 나열 (LLM 무접촉; 스크립트로 생성해 커밋).
3. **평정**: 코드의 구조·목적에 관한 질문 **≥ 3개**를 재귀 projection이 대조군 대비 **추가로**
   답할 수 있는지 **블라인드** 평정 — owner 또는 독립 judge, **어느 쪽인지 기록**. 질문은
   평정 전에 고정(사후 선택 금지).
4. **기록**: `development-records/benchmark/` disclosure 패턴 (run 로그·양 산출물·질문·평정·
   판정). 이 게이트 없이는 "outline 재발명"이 전 게이트 green으로 통과한다(리뷰 gf-F1) —
   G-SEM이 유일한 의미 게이트다.

## 3. 배선 사실 (이 세션에서 실코드 확인 — 재검증은 grep 한 번이면 됨)

- **설정 스위치 단 1개**: repo `.onto/settings.json`에
  `reconstruct.execution.semantic_map_code: true` 추가가 live/E2E 활성화의 전부.
  - 흐름: `core-api/reconstruct-api.ts:1045`(관찰 측 materialize)·`:1576`(run 측
    `codeStructureObservation`) → run.ts `codeKindOptIn` → 유효 kind = 옵트인 ∩ author 광고.
  - `semantic_map_authoring: true`는 이미 ON (PR #203 승격); direct-call author는
    `enableSemanticMapAuthoring`일 때 양 kind 광고 (step 6).
  - 현 seat: synthesize = `gpt-5.6-luna@low` (repo settings actors.semantic_map_synthesize),
    verify = base author(`gpt-5.6-sol@medium`). live 전 owner에게 대상 파일·seat 확인.
- **mock 갭 (7a의 실작업, 실코드 확증)**: api-레벨 `ONTO_LLM_MOCK` dispatcher
  (`mock-llm-realization.ts` `callReconstructMockLlm`)의 systemPrompt 분기 8종에는 semantic-map
  프롬프트가 **spreadsheet 포함 전무** — 미지 프롬프트는 throw하고 스테이지 X5 격리가 column
  failed→map_absent로 접는다(그래서 기존 P3 테스트는 census 배선만 검증). 7a의 "seed
  projection code 노드 > 0"을 위해 **code synthesize/verify 분기**를 dispatcher에 추가해야
  한다(키 = 프롬프트 서두 "You are reading ONE code file region" / "…re-checker … code file
  region"; 응답은 **line 어휘 JSON** `{"semantic_summary":…,"boundaries":[{"line":…}]}` ·
  `{"verdict":"adversarial_confirmed|refuted"}`). INV-MOCK-1 경계 내.
  `withMockCodeSemanticMapCapability`는 스테이지-단위 mock으로 api dispatcher와 별개.
- **코드 프롬프트 편집 시**: `CODE_RECONSTRUCT_AUTHORING_PROMPT_CONTRACT`(run.ts)만 회전 —
  **CG-1 카탈로그 등록 금지** (spreadsheet fingerprint 회전 → 진행 중 resume 파괴, 리뷰 ct-F2).
- **미지원 언어/인벤토리 부재**는 census `code_extraction_unsupported`/`no_code_inventory`로
  정직 공시 (kind 판별자 포함) — live 파일은 TS/JS/Python이어야 함 (v1 문법).

## 4. 검증 명령 (전부 exit 0이어야 시작·종료)

```
npx tsc -p tsconfig.json --noEmit
npx vitest run
npx tsx scripts/semantic-map-golden.mts check     # G-SS
npx tsx scripts/reduce-proof-harness.mts
npx tsx scripts/check-import-boundary.ts
```

## 5. 남은 후속 (step 7 밖)

- step 8 = Phase 1b set-tier (별도 PR; §4 — set-tier 예산 캡 + live 2-파일 수용 기준, O-3).
- 구조 노트(교차검증 ct, below-floor): fallback author의 kind 광고가 primary와 달라질 수 있는
  잠재 결합 — 현재는 구조상 불가능, **1b 설계 시 재검토**.
- 완료 보고 전 독립 multi-lens 교차검증으로 material 0 확인 (repo 관례).
