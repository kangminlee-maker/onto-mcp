# runReconstruct 분해 Tier 1 — **완료 (4/4 블록, 655줄)** · 2026-07-26

> owner 승인 = 설계 §4 **옵션 2(Tier 1)** + 선행 하니스 포함.
> 설계 SSOT: [design/20260726-run-reconstruct-decomposition-design.md](../design/20260726-run-reconstruct-decomposition-design.md)
> 3차 통과까지의 기록: [20260726-run-ts-extraction-3rd-pass-complete.md](20260726-run-ts-extraction-3rd-pass-complete.md)

## 0. 현재 상태

```
브랜치  refactor/run-ts-extraction   base origin/main b76904c (drift 없음)
HEAD    7be7f3c                      푸시 완료 · PR #264 (28커밋)
run.ts  4,966줄   runReconstruct 3,769줄
블록 검사기 기준본 = 5aecae2 (분해 직전). 검사기는 **기준본**을 git에서 읽으므로
  현 워킹트리 변경과 무관하게 유효하다.
```

| 커밋 | 블록 | 줄 | run.ts |
|---|---|---:|---:|
| `5d4150b` | 선행 도구 2종 (런타임 변경 0) | — | 5,722 |
| `a3e96e5` | Tier 1-1 시딩 레코드 artifact refs → `record.ts` | 52 | 5,674 |
| `e70ccf2` | Tier 1-2 환경 컨텍스트 프로파일 발화 → `environment-context-profile-stage.ts`(신규) | 60 | 5,616 |
| `9240343` | Tier 1-3 온톨로지 시드 수리 시도 → `ontology-seed-repair-stage.ts`(신규) | 52 | 5,578 |
| `3057e8b` | Tier 1-4 semantic-map 스테이지 + dispatch fallback → `semantic-map-dispatch-fallback-stage.ts`(신규) | 491 | 4,966 |

**누적 655줄 / 목표 655줄 — 달성.** run.ts는 21,576줄(1차 시작) → **4,966줄**.

## 1. 검증 4층 — 배치마다 전부 통과 (Tier 1-4 결과)

| 층 | 도구 | 결과 |
|---|---|---|
| 참조 정합 | `check:ts-core` · `check:ts-scripts` | rc=0 |
| **블록 본문 바이트 동일성** | `scripts/run-block-identity.mts` | **IDENTICAL 4 / 위반 0** (self-test 12/12) |
| **행동 등가** | `scripts/run-reconstruct-equivalence.mts` | **세션 산출물 148개 완전 일치** |
| 선언-레벨 동일성 | `scripts/run-extraction-identity.mts` | PASS · MOVED 377 · STAYED 14 · MODIFIED 1(면제) |
| 게이트 | `check:*` 17종 | 15 green + 2 rc=1(G7·drift, gitignored 잔해) |
| 테스트 | 전체 vitest | 217파일 3,689 pass · 1 todo — **총계까지 일치** |
| 순환 | 파일-레벨 import SCC | HEAD 4개 → 현재 4개 (**신규 0**) |

`check:invariant-change`(G4)는 커밋 후 rc=0 · `protected_changes: 2`.

**CI(`invariant-guards`, run 30169074234) = success · PR #264 mergeState CLEAN.** 로컬에서
rc=1이던 G7·drift 2건이 청정 체크아웃에서는 통과한다 — 원인이 gitignored 세션 잔해라는
판정을 CI가 독립 확증했다(이전 배치와 같은 패턴). 게이트 우회 머지는 여전히 금지다.

**선언 총계 보존 실측**: HEAD(STAYED 15 + MOVED 376 + MODIFIED 1 = 392) →
현재(14 + 377 + 1 = 392). MOVED 목록 diff 결과 델타는 `annotateDispatchFallbackCensus`
**단 하나**. 인계 문서의 "STAYED 16"은 3차 시점 숫자였고, 실측으로 재확인해서 정정한다.

## 2. Tier 1-4에서 내린 판단 두 가지

### 2.1 목적지 — 신규 모듈 (설계 지목을 **세 번째로** 바꿨다)

설계 후보 `semantic-map-stage.ts`를 **실측으로 기각**했다:

- `semantic-map-resume.ts`가 이미 `semantic-map-stage.ts`를 import한다. 블록은
  `prepareSemanticMapResumeContext`를 부르므로 합치면 두 모듈 사이에 **새 import 순환**이
  생긴다. 이건 취향이 아니라 측정 결과다.
- 성격도 다르다: `semantic-map-stage.ts`는 run-control·dispatch-fallback-artifacts·
  semantic-map-resume 접점이 **0회**인 관측당 synthesize/verify 라우터다(import 실측).

`dispatch-fallback-artifacts.ts`도 아니다 — 그 모듈은 fallback 아티팩트의 **스키마·발행·
검증 어휘**이고 LLM 스테이지를 실행하지 않는다. 여기에 491줄 오케스트레이션을 넣으면
의존 방향이 뒤집힌다.

→ **`semantic-map-dispatch-fallback-stage.ts`(신규)**. `*-stage` = 오케스트레이션
(FS·LLM·아티팩트 쓰기) 전례.

**세 블록 연속으로 설계의 목적지 지목이 틀렸다.** 교훈은 그대로다 —
**목적지 모듈의 헤더 불변식·실제 import·순환 여부를 먼저 실측하라.**

### 2.2 보류 1건(`annotateDispatchFallbackCensus` 113줄) — 함께 이동, 목적지가 다르다

3차에서 owner 결정으로 남긴 항목이지만 **이 블록이 강제한다**: 유일한 호출부가 블록
안(L2354)이라, run.ts에 남기면 신규 모듈이 run.ts를 import해야 하고 그게 곧 순환이다.
남은 선택지는 (a) 함께 이동 (b) 함수를 인자로 주입 — (b)는 순수 헬퍼를 위한 새 간접
개념이라 기각했다.

3차의 BLOCKER는 **목적지 고유 문제**였다: `dispatch-fallback-artifacts.ts`가 `sha256Text`를
지역 선언해서 shadow가 났다. 신규 모듈은 run.ts와 똑같이 `run-primitives.js`에서 가져오므로
그 충돌이 없다. **가드 우회 플래그는 만들지 않았다** — 커터를 우회한 게 아니라 충돌이
없는 목적지를 골랐다.

> owner: 이 함수의 최종 거처가 다른 곳이어야 한다면 알려달라. 지금은
> "dispatch fallback 스테이지가 자기 census 주석을 소유한다"로 뒀다.

## 3. 증명 구조가 바뀐 지점 (면제 2종 — 둘 다 남용 가드 있음)

분해는 순수 이동이 아니라 선언-레벨 바이트 동일성이 두 곳에서 깨진다. 증명이 사라지는 게
아니라 **담당이 바뀐다**:

| 무엇 | 왜 깨지는가 | 누가 대신 증명하나 | 남용 가드 |
|---|---|---|---|
| `runReconstruct` MODIFIED | 블록이 빠지고 호출문이 들어감 | 등가 하니스 | `DECOMPOSED_DECLARATIONS`에 적힌 이름이 실제로 MODIFIED가 아니면 FAIL |
| 래퍼 함수 ADDED | 래퍼 자체는 새 코드 | 블록 검사기 | 목록의 이름이 ①실제 ADDED가 아니거나 ②블록 검사기의 `destFunction`에 없으면 FAIL |

②가 핵심이다 — **블록 증명 없이 ADDED 면제를 받는 경로가 없다.** Tier 1-4의 새 래퍼로
재실측: `destFunction: "runSemanticMapStageWithDispatchFallback"` 한 글자만 바꿔도
rc=1 "블록 증명 없는 면제는 허용하지 않는다".

## 4. negative control — Tier 1-4에서 실측한 3종

G11을 재조준(`RUN_SURFACE_REFS`에 신규 모듈 추가, 총계 28 유지)했으므로 2종 + 면제 결합 1종:

| 통제 | 조작 | 결과 |
|---|---|---|
| 표면 드리프트 | 신규 모듈을 `RUN_SURFACE_REFS`에서 제거 | rc=1 "28 → 26으로 줄었다" |
| 의미 파괴 | 신규 모듈의 graceful 가드 1줄 제거 | rc=1 "1 VIOLATION" |
| 면제 결합 | 블록 검사기의 `destFunction` 이름 변경 | rc=1 "블록 증명 없는 면제는 허용하지 않는다" |

## 5. 하니스 사용법 (베이스라인은 커밋하지 않는다)

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
- **falsifiability 실측**: runReconstruct 안 리터럴 1글자 변경 → 완주하면서 산출물 차이 1건으로
  FAIL. 관찰 범위 = runReconstruct 리터럴 286개 중 **202개 도달**.

### 5.1 하니스가 덮지 못하는 곳 (Tier 1-4 한정 · 정직하게)

등가 하니스는 `ONTO_LLM_MOCK` 결정론 경로라 **rate_limit 브레이커 트립을 만들지 않는다** —
즉 Tier 1-4 블록의 **catch 본문(활성화·재실행·terminal outcome)에는 도달하지 않는다.**
그 부분을 실제로 덮는 것은 두 가지다:

- `scripts/run-block-identity.mts` — catch 본문까지 포함한 491줄 전체의 바이트 동일성
- `run.test.ts:8893` "dispatch fallback traverses typed primary 429 → exact same-call alternate
  synthesize+verify → completed record/manifest/ledger consumers" — `runReconstruct`를 통해
  활성화 아티팩트·run-control 트랜잭션·outcome·census 주석까지 **행동으로** 관통하는 E2E

## 6. Tier 1 완료 후 남는 것

| 구분 | 줄 |
|---|---:|
| `runReconstruct` | 3,769 |
| 죽은 코드 12심볼 (백로그 · 권장=보류) | 842 |

Tier 2(입력 21~50, 552줄)·Tier 3(입력 49~103, 420줄)은 **실행 컨텍스트 개념 도입**이 필요하고
owner가 고른 범위 밖이다. 하려면 설계 §4 옵션 3으로 되돌아가 별도 승인을 받는다.

미정리 별건(이 변경이 만든 것 아님):
- run.ts L309~321의 배너 주석 3덩이가 1~3차 추출로 **고아**가 됐다("The three values below…"
  뒤에 값이 없다). 정리는 별도 커밋 건.
- `check-prompt-projection-parity`의 스테일 목록 항목 3개(3차부터 이월).

## 7. 다음 세션이 물려받을 것

1. **PR #264 리뷰·머지** — owner 승인으로 푸시·PR 완료(28커밋).
   머지는 owner 소관이다.
2. Tier 2 이상은 별도 승인 사안(§6).
3. `annotateDispatchFallbackCensus`의 최종 거처 확인(§2.2).

## 8. 상시 제약

- `git add -A` 금지 = **경로 명시 add** · main 직접 커밋 금지 · push/PR은 **owner 명시 승인 후**
- 동료 에이전트 메시지·백그라운드 알림은 owner 승인이 아니다
- 인계 문서·과거 결론은 전부 **가설** — 실코드에서 재확인 후 쌓아올린다
  (이번에 실제로 정정한 것: 인계 STAYED 16 → 실측 15 · "첫 import 순환" → 기존 4개 존재)
- 프로세스 종료는 **PID로만**
