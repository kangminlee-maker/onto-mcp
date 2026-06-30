# RESUME — maturation 값-읽기 cut: Stage 2 (real raw-value cell-read + direct-call executor)

> **START-HERE.** `/clear` 후 fresh 세션이 **이 문서 + 설계 SSOT 하나로** 이어받는다. 날짜 2026-06-30.
> **baseline = `feat/maturation-value-read` HEAD `71dacc8`** (mock-first cut 커밋·full vitest 2097 pass·9 게이트 PASS). 이 브랜치서 계속(새 브랜치 불요·미머지).
> **설계 SSOT(정본)** = `development-records/design/20260630-maturation-value-read-cut-design.md` (§13 v3 정본·§4.4 타깃 값-읽기 런타임·§13.5 F4 read-set basis-A).
> CLAUDE.md: 아래 load-bearing 주장은 **가설 → 빌드 전 실코드 재확인**.

## 0. 한 줄
mock-first cut(메커니즘+거버넌스+stage runner+배선)은 **완성·커밋**됐다. 남은 **Stage 2 = cut의 이름값**: maturation이 **인가된 runtime-target 원천의 raw 셀 값을 실제로 읽어** discharge를 산출하는 **직접-호출 executor**. 이게 없으면 프로덕션선 value-read stage가 **정직하게 skip**(no-op)된다 = 막힘이 실제로 안 풀린다.

## 1. 이미 된 것 (커밋 `71dacc8`·재빌드 금지)
- **Stage 1 메커니즘**: `value_resolved` enum·1급 `ReconstructMaturationValueDischarge[Entry|Census|Artifact|ValidationArtifact]`·공유 `deriveMemberReadiness`/`buildValidatedDischargeIndex`·builder residual subtract·validator derive-and-assert·F1 사다리 8분기·claim_scope 삼중쌍. (`maturation-validation.ts`)
- **Stage 4 거버넌스**: `validateMaturationValueDischarge`(F4 runtime-target basis-A·F5 source-safety 전제+consumption_allowed·구조 phantom-limitation reject). (`maturation-validation.ts`)
- **Stage 3 stage runner+배선**: `runMaturationValueReadStage`(`run.ts:~1774`·보수적 트리거·census·governance-validate·write) + run.ts 배선(baseline matrix 후 호출·discharge를 *current* matrix build/validate에 thread·manifest step·record refs·path 스캐폴딩).
- **capability 인터페이스 已存**: `ReconstructDirectiveAuthor.readValueDischarge?(input)` (`run.ts:354`) + 타입 `ReconstructValueReadCandidate`/`ReconstructValueReadStageInput`/`ReconstructValueReadStageOutput` (`run.ts:~270`).
- **telemetry 等録 已存**: `MaturationValueReadLocation`·`MaturationValueReadJudgment`→`maturation_value_read` (`execution-telemetry.ts:139-140`·Defect-1 silent-degrade 차단). **stage id `maturation_value_read` 已存**(artifact-types.ts·leaf_read 선례).
- **검증 인프라 已存**: `value-read-stage.test.ts`(default-off×2 + H1 mock E2E=fixture executor→실 stage runner→value_resolved→actionable_limited).
- ★ **stage runner는 `directiveAuthor.readValueDischarge?.(...)`를 호출만 한다**(`run.ts:1798`). **direct-call author가 이 메서드 미구현 → 프로덕션 stage no-op**(default-off·byte-parity). **Stage 2 = 이 메서드를 direct-call author에 구현 + 실 cell-read.**

## 2. Stage 2 = 3 하위부 (전부 net-new)
**①real raw-value cell-read (런타임·★최초)**: 인가 영역 셀의 **raw 값**을 bounded 보유 읽기.
  - ⚠️ **레포 최초**: observer(`spreadsheet-structure-observer.ts`)는 `rows[][]`를 materialize하나 **집계 후 버린다**(`:1941` "zero source re-scan"·내부 `streamWorksheets:1051`/`createWorksheetParser:1543`=非export). **leaf-reader는 의도적 value-blind**(`leaf-reader.ts:28-32` "NO raw DATA cell values"·source 파일 안 읽음=인벤토리만 사용). → 값-보유 targeted 읽기 경로가 **없다**.
  - **할 일**: observer에 targeted 값-보유 읽기 함수 추가(export) **또는** 별도 reader. 입력=원천 파일(observation.source_ref/location=원본 경로·run이 보유) + 선택 위치(sheet/col/row-range/named-range). 출력=선택 셀의 raw 값(bounded: max regions·max cells·char cap·#157 budget helpers 재사용). fflate+saxes(xlsx)·csv parser 재사용.
  - **거버넌스(F4·이미 트리거서 강제)**: read-set은 `is_runtime_target_source===true`+consumption_allowed 원천만(비-target 값 누수 0). cell-read는 그 인가 원천만 연다.
**②direct-call author `readValueDischarge` 구현**(`run.ts` `createDirectCallReconstructDirectiveAuthor:7813` 내·`readLeafLabels:7886` 선례로 callJsonAuthor 래핑):
  - (a) `callJsonAuthor({artifactName:"MaturationValueReadLocation", systemPrompt:VALUE_READ_LOCATION_PROMPT, userPayload:{candidates}})` → LLM이 allowed_locations 내 위치 선택.
  - (b) 런타임 검증(선택∈allowed-set) + **①cell-read**(선택 위치 셀 값).
  - (c) `callJsonAuthor({artifactName:"MaturationValueReadJudgment", ..., userPayload:{candidates, read_cells}})` → LLM이 satisfied/refuted/inconclusive + rationale 판단 → discharge entries 파싱.
  - **2 prompt const 신설 + catalog 등록**(`RECONSTRUCT_AUTHORING_PROMPT_CONTRACT:7711`·LEAF_READ 선례 `:7789`; `authoringPromptContractSha256` 자동 fold→편집 시 resume 키 회전). prompt opening line은 **mock dispatcher 안정 키**.
**③spreadsheet fixture E2E (실-경로)**: 작은 .xlsx fixture + mock LLM 2 prompt 분기(`mock-llm-realization.ts:192` `callReconstructMockLlm`=systemPrompt.includes로 dispatch→2 분기 추가) → **full reconstruct mock 런이 트리거 발화→discharge 산출→matrix value_resolved→완주**(또는 direct-call author readValueDischarge를 stub llmCall+실 fixture로 단위검증). ★**by-construction 금지·실 경로 E2E 필수**(Defect-1 교훈: leaf-read가 "통과인데 프로덕션 死"였던 이유=telemetry/배선 실경로 미검증).

## 3. 검증 = done-when (Stage 2)
- **H1-prod**: 실 direct-call executor(또는 stub-llm+실 fixture)가 **실제 셀 값을 읽어** discharge 산출 → governance-valid → matrix value_resolved → continuation actionable_limited. ▸ **빈/미인가 읽기 → discharge 0 → 여전히 blocked**(H1-neg).
- **read-set 누수 0(F4)**: 비-target 원천은 **읽기 자체 차단**(트리거+governance 이중)·셀 값 프롬프트 누수 0.
- **bounded**: max regions/cells/char·초과 시 graceful 축소+census 공시(throw 아님·A2).
- **call-graph coverage 가드**: 2 callJsonAuthor 名이 등록(已)→가드 통과. **direct-call readValueDischarge 실경로 회귀테스트**(stub llmCall, mock 우회 금지).
- **byte-parity 유지**: 비-spreadsheet/비-target 런은 트리거 no-op→불변(full vitest 회귀0 유지).
- **유료 실-LLM 품질**(올바른 칸 선택·환각 해소 아님)=월예산 회복 후 별도(§7·design §13.7).

## 4. 다음 행동 (권장 순서)
1. **설계 확인**: design §4.4(타깃 값-읽기 런타임 단계 1~6)·§13.5(F4)·§7(per-cell granularity 리스크) 재독. **owner 결정**: 설계-먼저 교차검증(net-new 원체 읽기=first-of-kind·[[design-validation-ultracode-onto]]) vs 직접 빌드(§4.4가 이미 high-level spec).
2. **빌드 위험 오름차순**: ①cell-read(런타임·결정론·단위테스트 우선) → ②2 prompt+catalog+direct-call readValueDischarge → ③mock LLM 분기+spreadsheet fixture E2E.
3. **검증 = §3**. ★cell-read는 실 xlsx fixture로 단위검증(observer 확장이면 spreadsheet-processing skill+실 Excel 엔진 정합).
4. baseline=`71dacc8`. 회귀0·9 게이트 유지.

## 5. 메타교훈 (★Stage 2 직결)
- **이 cut의 메커니즘/거버넌스/배선은 mock-first로 완전 검증됐으나, raw 값 읽기=product 미완**(정직 §7). mock-realization-boundary: fixture executor=verification, real executor=product. **Stage 2가 product 완결의 선결**.
- **Defect-1 재현 주의**: leaf-read가 "by-construction 10/10 통과"인데 프로덕션 死(telemetry 미등록)였다. Stage 2의 direct-call readValueDischarge는 **반드시 실 경로(stub llmCall+실 fixture)로 exercise**·callJsonAuthor 우회 테스트 금지.
- **F1 사다리 교훈(이 cut)**: "한 줄 사다리 과신" 2회 깨짐→빌드 전 전 분기 직접 재독. cell-read도 같은 규율(observer 내부 가정 직접 재확인).

## 6. 포인터
- 설계 SSOT: `development-records/design/20260630-maturation-value-read-cut-design.md`(§13 v3·§4.4·§13.5·§7).
- 이전 핸드오프: `development-records/handoff/20260630-maturation-value-read-v3-build-resume.md`(§1 BUILD 결과=mock-first 완결 상세).
- 메모리: [[unified-comprehension-engine-track]](전체 이력·이 cut)·[[contract-runtime-gap-ledger]](declared≠wired·Defect-1)·[[domain-agnostic-no-static-enums]]·[[design-validation-ultracode-onto]]·[[spreadsheet-material-handling-track]](xlsx 추출 어댑터·S1).
