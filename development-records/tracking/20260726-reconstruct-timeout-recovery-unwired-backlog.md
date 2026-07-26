# 백로그 — `deterministicOntologySeedTimeoutRecovery` 미배선 클러스터 (842줄)

> 상태: **owner 결정 대기**
> 발견: 2026-07-25, run.ts 개념별 파일 추출 1차 통과 중 (계획기의 "도달 불가" 버킷)
> 처분 전까지: **건드리지 않고 그대로 둔다.** run.ts 추출 작업은 이 심볼들을 다른 코드와 똑같이 **순수 이동**만 한다.
> **2026-07-26 추가**: owner가 "연결되지 않은 코드가 얼마나 되는가"를 물어 **repo 전체를 실측**했다 → §0. 이 클러스터가 전체 죽은 코드의 **63%** 다.

## 0. repo 전체 미배선 실측 (2026-07-26 · `npx tsx scripts/unwired-code-scan.mts`)

제품 진입점(`src/cli.ts` · `src/mcpb-entry.ts` + spawn되는 worker 3개)에서 **심볼 수준**으로 도달성을 계산했다. src 비테스트 227파일 · top-level 선언 5,134개 기준:

| 분류 | 선언 | 줄 | 뜻 |
|---|---:|---:|---|
| 도달 | 4,592 (89.4%) | — | 제품 경로에서 실제로 쓰인다 |
| 테스트만 참조 | 128 | 1,495 | 제품 미도달, 테스트가 씀 |
| scripts 하니스만 참조 | 3 | 13 | 벤치·하니스가 씀 |
| 테스트+하니스 | 332 | 6,673 | cert 레코드·golden fixture·품질 게이트 등 **검증 인프라** |
| **소비자 전무** | **79** | **1,331** | **아무도 안 쓴다 = 진짜 죽은 코드 후보** |

**핵심**: "미배선 후보 9,512줄" 중 **8,181줄은 검증 인프라**(테스트·하니스가 쓴다)로 삭제 대상이 아니다. 아무도 안 쓰는 것은 **1,331줄**이며 전체 코드(155,676줄)의 **0.9%** 다.

그 1,331줄의 63%가 이 문서의 클러스터다:

| 파일 | 선언 | 줄 |
|---|---:|---:|
| **`reconstruct/run.ts`** (이 클러스터) | 12 | **842** |
| `core-api/review-api.ts` | 2 | 64 |
| `reconstruct/post-seed-validation.ts` | 3 | 48 |
| `review/review-state-machine.ts` | 5 | 46 |
| `mcp/tool-schemas.ts` | 19 | 44 |
| `reconstruct/mock-llm-realization.ts` | 1 | 43 |
| `discovery/project-root.ts` | 3 | 31 |
| 그 외 21파일 | 34 | 213 |

표본 검증한 개별 건:
- `mcp/tool-schemas.ts` 19개 = `z.infer` **타입 동반자**(`OntoReviewToolInput` 등 1~3줄) — 소비자 없는 타입 표면.
- `discovery/project-root.ts`의 `resolveProjectRoot`(exp) — `mcp/server.ts`가 **자체 지역 함수**를 쓰고 공용 것을 안 쓴다(개념 중복 중 공용 쪽이 죽음).
- `review/review-state-machine.ts`의 `REVIEW_TRANSITIONS` — `artifact-types.ts`가 `ALLOWED_TRANSITIONS`로 재수출하지만 **그 별칭을 아무도 import하지 않는다**.
- `post-seed-validation.ts`의 `writeCompetencyQuestionsValidationArtifact`(exp) — 참조 1회(선언 자신)뿐.
- `SESSION_INPUT_SCHEMA` @ `mcp/server.ts` — 참조 1회뿐.

### 0.1 스캐너의 신뢰 근거 (조사 중 결함 2건을 고쳤다)

`scripts/unwired-code-scan.mts`는 control 내장이고, **깨지면 FAIL한다**. 실제로 첫 판이 틀렸다:

1. **동적 import 미추적** — `cli.ts`가 `await import()`로 명령을 디스패치하는데 정적 import만 봐서 CLI 하위 트리 전체를 놓쳤다. `runReconstruct`(다른 경로로 도달) 하나만 보던 positive control이 통과해 **거짓 안심**을 줬다 → positive control을 공개 CLI 명령 5개로 확장했고, 추적을 끄면 `runRegister, runWatch, runConfigureProvider, runSeats` 미도달로 **FAIL한다**(실측).
2. **초기자 내부 재귀** — 최상위 `const`의 초기자 안 중첩 함수에 있는 구조분해 폐기 바인딩(`const { descriptor_id: _descriptorId, ... }`)을 최상위 선언으로 오인해 102줄짜리 죽은 코드로 보고했다 → 바인딩 패턴만 보도록 고쳤다.
3. 그 밖에 **서브프로세스 진입점 3개**(worker executor는 파일명 문자열로 spawn된다)와 **테스트/하니스 참조의 전이 폐포**를 넣지 않으면 각각 오탐이 7,348줄·3,000여 줄 늘어난다(control B 실측).

**한계(정직하게)**: 문자열 키 동적 디스패치·설정 주도 호출은 정적으로 보이지 않는다. 결과는 **후보**이며 삭제 전 개별 확인이 필요하다.

## 무엇인가

`src/core-runtime/reconstruct/run.ts`에 `ReconstructOntologySeedAuthorInput` → `ReconstructOntologySeedArtifact`를 **LLM 없이 결정론적으로** 만들어내는 559줄짜리 함수가 있다. 이름이 말하는 그대로 ontology_seed 유닛이 타임아웃했을 때의 **결정론적 복구 경로**다. 그런데 **어디서도 호출되지 않는다.**

여기에 연쇄로 딸린 심볼까지 합해 **12심볼 · 842줄**이 계획기의 "도달 불가" 버킷에 있다:

| 심볼 | 줄 |
|---|---:|
| `deterministicOntologySeedTimeoutRecovery` | 559 |
| `runtimeOntologyHandoffScaffold` | 166 |
| `seedPlacementForDisposition` | 49 |
| `countBy` | 12 |
| `readTextIfPresent` | 10 |
| `uniqueRuntimeSeedId` | 10 |
| `selectedSourcePurposeCandidateForSeed` | 10 |
| `dispositionEvidenceRefs` | 8 |
| `seedSlug` | 7 |
| `titleFromId` | 5 |
| `enumChoices` | 3 |
| `firstEvidenceRef` | 3 |

## 그냥 지우면 안 되는 이유 (조사 완료 — 2026-07-26 실코드 재확인)

1. **처음부터 배선된 적이 없다.** `rg deterministicOntologySeedTimeoutRecovery src scripts .onto` → **1 match**(선언 줄). 도입 커밋은 `0f2d036`(2026-06-04, *"feat: add reconstruct source scout authority gates"*) 로, **제목이 이 기능과 무관하다.** 즉 "쓰이다가 안 쓰이게 된 코드"가 아니라 **다른 작업에 얹혀 들어왔고 배선이 빠진 코드**다.
2. **설계 기록이 바로 그 갭을 지목한다.** [plans/20260613-reconstruct-opt-phase1-baseline-findings.md](../plans/20260613-reconstruct-opt-phase1-baseline-findings.md) §의 timeout recovery 행:
   > 3 of ~16 units: `source_purpose_candidates`, `ontology_seed`, `competency_questions` … Also structurally weak: the minimal-kernel retry is bound by the **same** timeout (no extension) and only downgrades effort high→medium … `lens_judgment`, `final_output`, and ~12 other units have **no** timeout recovery.
3. **성격이 다르다 = 실제로 갭을 메울 수 있다.** 현재 배선된 3개 유닛의 복구는 *"같은 타임아웃 안에서 effort를 낮춰 LLM을 다시 부르는"* minimal-kernel 재시도다. 타임아웃이 원인일 때 같은 시간 예산으로 다시 부르는 건 구조적으로 약하다. 반면 이 미배선 함수는 **LLM을 아예 부르지 않는** 결정론적 산출이므로, 타임아웃 상황에서 실제로 끝까지 가는 최후 경로가 될 수 있다.

**요약: "쓸모없어진 코드"가 아니라 "원하던 기능인데 배선이 빠진 것"일 가능성이 높다.** 조용히 지우면 설계가 지적한 갭을 코드에서 지워버리는 셈이 된다.

## owner 결정 선택지

| 선택 | 결과 | 비용 / 리스크 |
|---|---|---|
| **A. 삭제** | run.ts에서 842줄이 사라진다. 추출 후 잔류가 ≈7,100 → ≈6,300줄 | 싸다. 되돌리려면 git 이력에서 되살려야 한다. 설계가 지목한 갭은 코드에서도 사라진다 |
| **B. 배선** | ontology_seed 유닛 타임아웃 시 결정론적 산출로 완주. 설계 갭 일부가 메워진다 | **로직 변경이다** — 추출 작업과 반드시 분리한다. 산출물이 실제로 유효한지(스키마·검증 게이트 통과) 미검증이라 별도 검증 필요. 1년 가까이 실행된 적 없는 코드다 |
| **C. 보류 (현 기본값)** | 현상 유지. 추출만 진행 | 무료. 죽은 무게 842줄이 계속 남는다 |

**권장 기본값 = C(보류).** 추출 작업의 가치는 "로직을 안 건드렸음을 증명할 수 있다"는 데 있고, A든 B든 그 증명 범위 밖의 별도 변경이다. 추출이 끝난 뒤 A/B를 독립 PR로 판단하는 편이 안전하고 되돌리기 쉽다.

## 참조

- 추출 작업 진입점: [handoff/20260726-run-ts-extraction-2nd-pass-start-here.md](../handoff/20260726-run-ts-extraction-2nd-pass-start-here.md)
- 1차 통과 기록: [handoff/20260725-run-ts-extraction-start-here.md](../handoff/20260725-run-ts-extraction-start-here.md)
- 현황 재계산: `npx tsx scripts/run-split-plan.mts` → "(도달 불가)" 버킷

## 혼동 금지

`createDirectCallReconstructConfirmationProvider`는 계획기의 "도달 불가" 버킷에 나타난 적이 있으나 **죽은 코드가 아니다.** export되어 API 계층이 쓴다 — 계획기의 root 집합에 없었을 뿐이다. 2026-07-26 현재는 `direct-call-confirmation-provider.ts`로 이동했고 버킷에서 빠졌다.
