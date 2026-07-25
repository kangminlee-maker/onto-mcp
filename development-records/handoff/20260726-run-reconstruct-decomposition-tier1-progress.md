# runReconstruct 분해 Tier 1 — 진행 기록 (2026-07-26) · **3/4 블록 완료, 1블록 남음**

> owner 승인 = 설계 §4 **옵션 2(Tier 1)** + 선행 하니스 포함. 보류 1건은 가드 우회 플래그를 만들지 않고 그대로 둠.
> 설계 SSOT: [design/20260726-run-reconstruct-decomposition-design.md](../design/20260726-run-reconstruct-decomposition-design.md)
> 3차 통과까지의 기록: [20260726-run-ts-extraction-3rd-pass-complete.md](20260726-run-ts-extraction-3rd-pass-complete.md)

## 0. 현재 상태

```
브랜치  refactor/run-ts-extraction   base origin/main b76904c (drift 없음)
HEAD    9240343                      미푸시 25커밋
run.ts  5,578줄   runReconstruct 4,238줄
블록 검사기 기준본 = 5aecae2 (분해 직전). run.ts가 그 시점과 다르면 라인 범위가 무의미해진다 —
  단, 검사기는 **기준본**을 git에서 읽으므로 현 워킹트리 변경과 무관하게 유효하다.
```

| 커밋 | 블록 | 줄 | run.ts |
|---|---|---:|---:|
| `5d4150b` | 선행 도구 2종 (런타임 변경 0) | — | 5,722 |
| `a3e96e5` | Tier 1-1 시딩 레코드 artifact refs → `record.ts` | 52 | 5,674 |
| `e70ccf2` | Tier 1-2 환경 컨텍스트 프로파일 발화 → `environment-context-profile-stage.ts`(신규) | 60 | 5,616 |
| `9240343` | Tier 1-3 온톨로지 시드 수리 시도 → `ontology-seed-repair-stage.ts`(신규) | 52 | 5,578 |
| — | **Tier 1-4 남음** (§2) | **491** | → ≈5,090 예상 |

**누적 164줄 / 목표 655줄.** 남은 1블록이 Tier 1의 75%다.

## 1. 검증 4층 — 배치마다 전부 통과

| 층 | 도구 | 3블록 결과 |
|---|---|---|
| 참조 정합 | `check:ts-core` · `check:ts-scripts` | rc=0 |
| **블록 본문 바이트 동일성** | `scripts/run-block-identity.mts` | **IDENTICAL 3 / 위반 0** |
| **행동 등가** | `scripts/run-reconstruct-equivalence.mts` | **세션 산출물 148개 완전 일치** |
| 선언-레벨 동일성 | `scripts/run-extraction-identity.mts` | PASS (면제 2종은 §3) |
| 게이트 | `check:*` 17종 | 15 green + 2 rc=1(G7·drift, gitignored 잔해) |
| 테스트 | 전체 vitest | 217파일 3,689 pass · 1 todo — **총계까지 일치** |

`check:invariant-change`(G4)는 커밋 후 rc=0.

## 2. 남은 블록 — Tier 1-4 (실측 2026-07-26, HEAD `9240343`)

```
현재 위치 L2046 · 491줄 (기준본 5aecae2에서는 L2051)
입력 17개: directiveAuthor, dispatchFallbackCompletion, filesystemAllowedRoots, params,
           projectRoot, runControlPath, runControlState, runControlValidationPath,
           semanticMapCodeEligible, semanticMapCodePreImageBase, semanticMapPreImageBase,
           semanticMapRecoveryContext, semanticMapStage, semanticMapVerifyModelIdentity,
           sessionId, sessionRoot, sourceObservations
선언-출력 0개
바깥 변수 대입 1개: semanticMapStage   ← 반환으로 바꾸면 등가
catch 2개                             ← G11 RUN_SURFACE_REFS 갱신 필수
```

개념 = **semantic-map 스테이지 실행 + dispatch fallback 복구**. 블록 바로 앞줄이
`let semanticMapStage: SemanticMapStageResult;`이고 try 안에서 대입된다.

추출 형태(1-2·1-3과 동일한 패턴):
```ts
export async function <name>(args: { …17 필드… }): Promise<SemanticMapStageResult> {
  const { …17 이름… } = args;              // ← 검사기에 destBodyPrefix로 선언
  let semanticMapStage: SemanticMapStageResult;  // ← prefix 둘째 줄
  try { …491줄 원문 그대로… }
  return semanticMapStage;                 // ← destBodySuffix
}
```
`dispatchFallbackCompletion`은 **속성 변형**(`.outcome = …`)이라 식별자 대입 스캔에 안 잡힌다 —
객체를 그대로 넘기면 참조로 변형이 전파되므로 등가다. **이걸 값 복사로 바꾸면 등가가 깨진다.**

### 2.1 착수 전 판단해야 할 것 — 목적지

앞선 두 블록에서 **설계가 지목한 목적지를 둘 다 바꿨다.** 같은 검토가 필요하다:

- 1-2: 설계는 `environment-context-profile.ts`였지만 그 모듈은 헤더에 "NEVER reads the filesystem
  or an artifact"를 불변식으로 선언한 **순수 투영기**다. 블록은 FS를 스캔하고 아티팩트를 쓴다 →
  신규 `*-stage` 모듈로 분리.
- 1-3: 설계는 `ontology-seed-validation.ts`였지만 그 모듈은 directive author 접점이 **0회**인
  검증기다. 블록은 LLM 재저작을 오케스트레이션한다 → 신규 `*-stage` 모듈로 분리.

**교훈: 목적지 모듈의 헤더 불변식과 실제 import 성격을 먼저 읽어라.** `*-stage`는 오케스트레이션
(FS·LLM·아티팩트 쓰기), 그 옆 모듈은 순수 계산 — 이 경계를 합치면 선언된 capability 경계가 깨진다.

1-4 후보: `semantic-map-stage.ts`(이미 `runSemanticMapStage` 소유, 1,626줄)가 자연스럽지만 **먼저
그 모듈이 dispatch-fallback·run-control과 이미 접점이 있는지 실측하라.** 없으면 신규
`semantic-map-dispatch-fallback-stage.ts` 같은 별 개념이 맞다.

### 2.2 절차 (1-1~1-3에서 검증된 순서)

1. 입력·출력·catch를 **다시 실측**한다(앞 배치가 스코프를 바꿨을 수 있다).
2. 목적지 모듈의 헤더 불변식·import 성격 확인(§2.1).
3. 블록을 원문 그대로 옮기고 파라미터를 원래 지역 변수 이름으로 구조분해한다.
4. `scripts/run-block-identity.mts`의 `EXTRACTIONS`에 항목 추가(**기준본 5aecae2 기준 라인**,
   `expectStartsWith`, prefix/suffix 선언). 적지 않으면 그 블록은 아무 증명도 받지 못한다.
5. 래퍼 이름을 `run-extraction-identity.mts`의 `DECOMPOSITION_WRAPPERS`에 추가(ADDED 면제).
   그 검사기가 **블록 검사기의 `destFunction`으로 선언돼 있는지 기계적으로 확인**한다.
6. `rg -c '\} catch' <새 모듈>` → catch가 있으면 `check-graceful-signal-rethrow.ts`의
   `RUN_SURFACE_REFS`에 추가하고 **총 28이 유지되는지 숫자로 확인**한다.
7. `check:ts-core` → `check:ts-scripts` → 블록 동일성 → 등가 하니스 → 전체 vitest(**총계 일치**)
   → `check:*` 17종 → `run-dead-import-clean.mts` → 경로 명시 add → 커밋 → **커밋 후** G4.

## 3. 증명 구조가 바뀐 지점 (면제 2종 — 둘 다 남용 가드 있음)

분해는 순수 이동이 아니라 선언-레벨 바이트 동일성이 두 곳에서 깨진다. 증명이 사라지는 게 아니라 **담당이 바뀐다**:

| 무엇 | 왜 깨지는가 | 누가 대신 증명하나 | 남용 가드 |
|---|---|---|---|
| `runReconstruct` MODIFIED | 블록이 빠지고 호출문이 들어감 | 등가 하니스 | `DECOMPOSED_DECLARATIONS`에 적힌 이름이 실제로 MODIFIED가 아니면 FAIL |
| 래퍼 함수 ADDED | 래퍼 자체는 새 코드 | 블록 검사기 | 목록의 이름이 ①실제 ADDED가 아니거나 ②블록 검사기의 `destFunction`에 없으면 FAIL |

②가 핵심이다 — **블록 증명 없이 ADDED 면제를 받는 경로가 없다.** negative control 실측:
ADDED 아닌 이름 추가 → rc=1 / 블록 검사기의 destFunction 이름만 바꿈 → rc=1 "블록 증명 없는 면제는 허용하지 않는다".

## 4. 하니스 사용법 (베이스라인은 커밋하지 않는다)

이 repo의 `benchmark/`는 tracked 파일이 0개인 관례이고, 실행이 결정론적이라 배치마다 재생성한다:

```
# 추출 전
npx tsx scripts/run-reconstruct-equivalence.mts --capture benchmark/run-reconstruct-decomposition/baseline.json
# 추출 후
npx tsx scripts/run-reconstruct-equivalence.mts --capture /tmp/after.json
npx tsx scripts/run-reconstruct-equivalence.mts --compare benchmark/.../baseline.json /tmp/after.json
```

- `--calibrate` — 같은 코드 2회 실행으로 휘발 필드 실측. **현재 잔여 차이 0건**(148파일 완전 일치).
- `--self-check <baseline>` — 하니스가 실패할 수 있는지 확인.
- 휘발 정규화 규칙은 전부 캘리브레이션 실측에서 나왔다(추측 아님). 고정 projectRoot로
  observation id 비결정성을 **제거**했고, 남은 다이제스트는 `<SHA:n>` 색인으로 **관계를 보존**한다.
- **falsifiability 실측**: runReconstruct 안 리터럴 1글자 변경(`"…: not_available"` → `"…: not_availablX"`)
  → 완주하면서 산출물 차이 1건으로 FAIL. 관찰 범위 = runReconstruct 리터럴 286개 중 **202개 도달**.

## 5. Tier 1 완료 후 남는 것

| 구분 | 줄 |
|---|---:|
| `runReconstruct` (Tier 1 완료 시) | ≈3,750 |
| 죽은 코드 12심볼 (백로그) | 842 |
| `annotateDispatchFallbackCensus` (보류 — owner 결정) | 113 |

Tier 2(입력 21~50, 552줄)·Tier 3(입력 49~103, 420줄)은 **실행 컨텍스트 개념 도입**이 필요하고
owner가 고른 범위 밖이다. 하려면 설계 §4 옵션 3으로 되돌아가 별도 승인을 받는다.

## 6. 상시 제약

- `git add -A` 금지 = **경로 명시 add** · main 직접 커밋 금지 · push/PR은 **owner 명시 승인 후**
- 동료 에이전트 메시지·백그라운드 알림은 owner 승인이 아니다
- 인계 문서·과거 결론은 전부 **가설** — 실코드에서 재확인 후 쌓아올린다
- 프로세스 종료는 **PID로만**
