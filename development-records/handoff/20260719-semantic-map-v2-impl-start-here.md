# semantic-map v2 구현 start-here — DD6′/DD10 → mock → ablation → live v2 (2026-07-19)

> 대상: 새 세션. task #10 후속. 규범 SSOT =
> [20260718-semantic-map-multi-artifact-phase1-detailed-design.md](../design/20260718-semantic-map-multi-artifact-phase1-detailed-design.md)
> **§10 addendum v2.1** (O-6 owner 결정 + 3-렌즈 설계 리뷰 MATERIAL 5 반영 — 수치·comparator·
> 유효성 전제 전부 §10에 **선핀**됨. 이 문서는 상태 핀 + 실행 순서 + 실코드 포인터만 담는다).

## 0. 상태 핀 (시작 시 재확인)

- step 1~7a는 main 착지(#225/#227/#228/#230/#231). 7b live N=1 = **G-SEM FAIL 0/5 → O-6로
  재설계 재개**. disclosure = `development-records/benchmark/20260719-semantic-map-gsem-n1/`.
- **PR #232 오픈**(브랜치 `feat/semantic-map-step7b-live-n1`, docs-only: FAIL disclosure +
  §10 v2/v2.1 + map). **시작 절차: PR #232 머지 확인 → `git fetch origin` → 새 브랜치 from
  `origin/main`.** 미머지면 owner에게 머지 요청(§10 v2.1이 구현의 규범이라 base에 있어야 함).
- `reconstruct.execution.semantic_map_code`는 repo settings에 **UNSET**(OFF). live/E2E 활성화는
  이 키 하나(7a 핸드오프 §3 동일). 스위트 3,275 green 기준.
- **G-SEM 대상 파일 수정 금지**: `src/core-runtime/code-structure-observer.ts`
  (content sha 선두 `8f055465204ffb4e` — §10 재평정 1항, 구현이 건드리면 대조군·베이스라인 오염).

## 1. 구현 순서 (커밋 단위 — §10 v2.1이 각 항의 규범)

1. **G-SS-f 렌더 골든 선행 채집** (리팩터 전 커밋): spreadsheet fixture projection의
   `renderSemanticMapProjection` 출력 바이트 골든화 — 기존 `scripts/semantic-map-golden.mts`
   arm 추가. G-SS-e는 봉투만 잠그므로(리뷰 inv M2) 이게 렌더 공유부의 유일 잠금.
2. **DD10**: projection 코어 per-adapter admission comparator(spreadsheet 기본 = 현
   `cmpStr(nodeKey)` 바이트 불변; code = span 크기 desc → line_start asc → nodeKey lex) +
   per-kind 상수(code budget **12,000자**·max_nodes **512**; spreadsheet 4,000/60 불변) +
   **code 전용 projection 계약 버전 신설 → code fingerprint에만 fold**(공유
   `SEMANTIC_MAP_PROJECTION_CONTRACT_VERSION` bump **금지** — 리뷰 inv M1) + 상대경로 라벨
   (root 파라미터를 resume 검증 사이트 포함 전 호출 사이트에 스레딩 — 리뷰 inv MN2).
3. **DD6′**: frontier 봉투(`child_summaries === []`) `source_lines` = 관찰 시
   `structural_data.content_excerpt` span-슬라이스 (가드:
   `inventory.content_sha256 === structural_data.content_sha256` AND
   `excerpt_truncated === false`, 불일치 = 결정론 skip census) + 소스 캡 12,000자
   head-절단·플래그·총줄수 + whole-capture 확장자 집합을 observer 언어 맵과 단일화
   (`.mts/.cts/.cjs` 갭) + 프롬프트 개정(서두 앵커 "You are reading ONE code file region"
   **유지** — mock 키·E2E 스냅샷 무회전; "No source-code bodies" 문구 제거) +
   `reduce_schema_tool_version` `semantic-map-code:v1`→`v2` bump + exact-key 가드/bounded
   assert 갱신. BOUNDARIES seam 제약 **유지**(리뷰 ct m-3 핀). verify 봉투 v1 유지.
4. **게이트**: §4 검증 명령 전건 + G-SS-f + mock E2E(7a 것 그대로 — 스테이지 골든
   input_json 핀은 갱신 예상 범위, E2E 스냅샷은 무회전이어야 함).
5. **무-spend ablation** (§10 재평정 3항): v1 이벤트에서 synthesize 109 응답 복원(아래 §3)
   → 무캡 projection 재구성 + DD10 렌더 → 신규 사전 등록(§10 수치 복사-핀 + **문맥-무
   세션이 작성한 held-out 3문** 동봉) → 블라인드 재평정(judge만; 7b와 동일 규율 — 도구 0·
   라벨 봉인·유효성 전제 admit≥30·커버리지≥80%).
6. **live v2** (owner spend — 실행 전 확인): ablation 결과와 함께 spend 확인 후 재실행.
   비용 참조: v1 실측 2,163s·synthesize 109회 + v2는 파일 1벌(~16.5KB) 입력 증가.

## 2. 실코드 포인터 (이 세션 3-렌즈 리뷰가 실증 — 재검증은 grep 한 번)

- projection 정렬/컷: `comprehension-semantic-map-core.ts:844`(cmpStr 정렬)·`:884`(maxNodes
  slice) — **기아의 실제 사이트** (109→60 lex-컷이 렌더 전 발생).
- 렌더러: `run.ts:2350` `renderSemanticMapProjection`(root 파라미터 없음 — 신설 필요),
  budget 상수 `run.ts:2344`, 공유 X9 버전 `run.ts:2113`(bump 금지). 호출 사이트:
  `run.ts:2815`(projectionIsRenderable — resume 검증)·`:10019`·`:12422`.
- code fingerprint pre-image: `run.ts:2716-2737`(`semanticMapCodeObservationFingerprint` —
  신설 계약 버전 fold 위치), `reduce_schema_tool_version` `run.ts:16097`.
- 봉투 빌더: `comprehension-semantic-map-code.ts:377-455`(`buildCodeSynthesisInputForNode`;
  frontier 판별 `:433,445-453` `isFrontier ? []`), exact-key 가드 `:190-206`·KEYS `:172-183`.
- whole-capture: `materialize-preparation.ts:190-196·392-403`(content_excerpt, ceiling 5MB
  `:227`/비대상 6,000자 캡 `:219`), 확장자 집합 `:279-304`.
- code 프롬프트: `run.ts:2176`(synthesize)·`:2183`(verify), 계약 `run.ts:11236`.
- mock dispatcher code 분기: `mock-llm-realization.ts:1054/:1075`(서두 앵커 키 — DD6′가
  바꾸는 필드는 mock 무접촉, 리뷰 실증).

## 3. ablation 데이터 (실측 확인 완료)

- `benchmark/20260719-semantic-map-gsem-n1/runtime-events.ndjson`에 v1 synthesize **프롬프트
  109건 전부**("You are reading ONE code file region" grep = 109) + 응답 payload 잔존 —
  프롬프트-응답 짝짓기로 109 요약 복원 가능. sidecar 사본은 60/109 캡이라 **ablation
  소스로 쓰지 말 것**(리뷰 gh m-1: lex-컷 탈락분에 Q3/Q5 핵심 영역 포함).
- 대조군은 불변: 같은 content sha면 `scripts/semantic-map-gsem-control.mts` 출력 바이트 동일.

## 4. 검증 명령 (전부 exit 0이어야 시작·종료)

```
npx tsc -p tsconfig.json --noEmit
npx vitest run
npx tsx scripts/semantic-map-golden.mts check     # G-SS (+G-SS-f 추가 후 포함)
npx tsx scripts/reduce-proof-harness.mts
npx tsx scripts/check-import-boundary.ts
```

## 5. 남은 후속 (이 트랙 밖)

- step 8 = Phase 1b set-tier (§4, O-3) — v2 G-SEM 결과 확인까지 보류.
- disclosure 스캔 규율(§10 보안 결과 명시): v2 요약은 소스 축어 인용 가능 — sidecar가
  disclosure로 커밋될 때 **요약 내용까지** 스캔. seat CLI transcript 저장소(repo 밖) 표면은
  보안 노트에 명시됨.
- 완료 보고 전 독립 multi-lens 교차검증으로 material 0 확인 (repo 관례).
