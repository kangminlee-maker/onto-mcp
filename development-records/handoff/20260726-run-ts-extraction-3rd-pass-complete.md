# run.ts 개념별 파일 추출 — **3차 통과 완료** (2026-07-26)

> **3차 통과 완료.** run.ts 6,949 → **5,723줄**. 1차 시작(21,576) 대비 **26.5%**.
> owner 승인 = 3차 진행 · push/PR은 작업 완료 후 한 번에.
> 1·2차 기록은 [20260726-run-ts-extraction-2nd-pass-complete.md](20260726-run-ts-extraction-2nd-pass-complete.md).
> **다음 작업 = `runReconstruct` 분해이며 설계가 owner 승인 대기 중이다**: [design/20260726-run-reconstruct-decomposition-design.md](../design/20260726-run-reconstruct-decomposition-design.md).
> **라인 번호는 스테일이다.** 코드 인용은 항상 심볼로 재확인한다.

## 0. 최종 상태

```
브랜치      refactor/run-ts-extraction   base origin/main b76904c (drift 없음)
HEAD        66587e0
미푸시      19커밋 (3차에서 4커밋 추가) — push/PR은 owner 승인 후
run.ts      5,723줄 · top-level 선언 16개
```

| 커밋 | 내용 | run.ts |
|---|---|---:|
| `3d42366` | 3차 A — 기존 개념 모듈로 append 7심볼 + **도구 2종 확장** | 6,854 |
| `a2d751e` | 3차 B — 저작·재사용 개념 append 13심볼 + **정리기 도구화** | 6,593 |
| `05dbb8a` | 3차 C — 관찰·환경·기록 개념 append 6심볼 | 6,082 |
| `66587e0` | 3차 D — 신규 개념 모듈 3개 (7심볼) | 5,723 |

**33심볼 · 약 1,226줄 이동.** 신규 모듈 3개(`run-contract.ts` 124 · `run-metrics.ts` 150 · `source-observation-lineage.ts` 91), 나머지는 **기존 개념 모듈에 append 12곳**.

## 1. 3차는 1·2차와 성격이 달랐다 — append가 필요했던 이유

남은 심볼은 대부분 **이미 존재하는 개념**에 속했다. 신규 모듈을 만들면 naming charter가 금지하는 근접 중복이 된다:

- `CODE_RECONSTRUCT_AUTHORING_PROMPT_CONTRACT`·`codeAuthoringPromptContractSha256`·`CODE_AUTHORING_PROMPT_CONTRACT_VERSION`은 `authoring-llm-call.ts`가 이미 소유한 `RECONSTRUCT_AUTHORING_PROMPT_CONTRACT`·`authoringPromptContractSha256`·`AUTHORING_PROMPT_CONTRACT_VERSION`의 **code 변종 쌍**이다.
- `artifactRefsWithDefaults`는 `record.ts`가 13곳에서 다루고 keyof 전수 가드를 갖고 있는 `ReconstructRecordArtifactRefs`의 기본값 채우기다.

**기계적 증거**: `contract-registry` / `post-seed-validation` / `ontology-seed-validation` / `record`는 **신규 import가 0개**였다(목적지가 이미 전부 갖고 있었다). `environment-context-profile`은 **자기선언 해결 5개**. 개념이 맞으면 import가 필요 없다.

### 1.1 커터 `--append` (scripts/run-extract-symbols.mts)

- 목적지가 이미 가진 import는 재사용하고, 신규만 마지막 import 뒤에 삽입한다.
- 목적지가 run.js에서 가져오던 심볼이 자기 것이 되면 그 import를 걷어낸다(자기 참조 방지).
- **이름 충돌** → BLOCKER. **조용한 의미 변경**(옮길 코드가 쓰는 이름이 목적지에서 다른 것을 가리킴) → BLOCKER.
- **self-resolution 예외**: run.ts가 **바로 그 목적지 모듈**에서 별칭 없이 가져온 이름이고 목적지가 그것을 선언하면 같은 심볼이므로 import 불필요로 처리한다. 별칭(`A as B`)은 제외 — 이름 바꿔주는 일은 이 도구가 하지 않는다.
- negative control **6종 실측**: (1) `--append` 없이 기존 파일 → 거절 (2) `--append`인데 목적지 없음 → 거절 (3) 이름 충돌 → BLOCKER (4) `fs`가 run.ts=`node:fs/promises` vs 목적지=`node:fs` → BLOCKER (5) 목적지가 **지역 선언**하지만 run.ts는 다른 모듈에서 가져오는 경우 → **여전히 BLOCKER**(self-resolution이 가드를 느슨하게 하지 않음을 고정) (6) self-resolution이 실제로 인정됨. 임시 모듈로 실행하고 제거했다.

### 1.2 동일성 검사기 `APPEND_DEST_REFS` (scripts/run-extraction-identity.mts)

append 목적지가 base에 이미 있던 모듈이면 "신규 파일" 기준 범위로는 MISSING이 뜬다. **실제로 배치 A에서 MISSING 3, 배치 C에서 MISSING 4로 정직하게 실패했고**(검사기 문구가 이 경우를 예견해 "의도한 것이면 검사 범위를 넓혀야 한다"고 적어뒀다) 범위를 넓혔다.

- 열거 6개. **전체 스캔 금지** — 파일-로컬 동명이인(`isoNow`·`isRecord`·`stableJson` …) 때문에 추출 전에도 DUPLICATE 20건이 뜬다(기존 주석의 이유).
- append 목적지의 **base 시점 선언은 색인에서 제외**한다. 안 하면 그 모듈의 로컬 헬퍼가 run.ts 잔류 심볼과 동명일 때 DUPLICATE 오탐이 된다.
- **항목별 침식 가드**: `APPEND_DEST_REFS`에 적혀 있는데 이동해온 선언이 0개면 FAIL.
- self-test 7건 → **10건**. 신규 3건이 새 로직의 negative control이다: 제외가 DUPLICATE 오탐을 막는가 / append로 온 선언이 여전히 MOVED로 잡히는가 / **base 목록을 과하게 적으면 MISSING이 되는가**(제외가 만능이 아님을 고정). 10/10 통과.

### 1.3 새 도구 `scripts/run-dead-import-clean.mts`

죽은 import 정리를 4개 배치에서 반복했고 인라인 heredoc이 실제로 깨졌다(`echo`의 이스케이프 해석). 2차에서 **죽은 사본이 연결-읽기 게이트를 침묵시킨다**는 것이 확인된 만큼(G9, rc=0→rc=1) 이건 위생이 아니라 게이트 유효성 유지라서 정식 도구로 만들었다.

- 사용 1회(=import 줄 자신)뿐인 named import만 대상. AST가 지목한 범위만 고친다.
- 일부만 죽으면 `{…}` 범위만 **살아남은 specifier의 원문으로** 다시 써서 `type ` 접두사·별칭을 보존하고, 원본이 여러 줄이면 여러 줄로 되돌려 repo 형태를 유지한다.
- 고친 뒤 재파싱해 죽은 이름이 남지 않았는지 스스로 확인한다.
- 한 줄에 여러 specifier가 있는 경우를 처음엔 **추측하지 않고 FAIL**했고(실제 발생: `import { isRecord, isoNow, sha256Text, stableJson }`) 그 케이스를 정확히 처리하도록 보강했다.
- 3차 제거량: A 4개 · B 8개 · C 18개 · D 29개 = **59개**.

### 1.4 타입체크 게이트 확장

`tsconfig.scripts.json` include에 `run-extract-symbols.mts`·`run-dead-import-clean.mts`를 등록했다. 등록하자마자 커터에 **가려져 있던 타입 오류가 드러났다**(TS2352). 그 tsconfig 주석이 예고한 상황("add a script here once it is made clean") 그대로다.

## 2. 검증 결과 (배치마다 3층 전부)

| 검사 | 최종 |
|---|---|
| `check:ts-core` · `check:ts-scripts` | rc=0 |
| 전체 vitest | 217파일 **3,689 pass · 1 todo** — 4배치 전부 베이스라인과 동일 |
| 바이트 동일성 | **PASS** — MOVED 343→**376**, STAYED 49→**16**, MODIFIED/MISSING/DUPLICATE/ADDED **전부 0** |
| `check:*` 17종 | **15 green + 2 rc=1**(G7·invariant-drift 단일 원인) |
| `check:invariant-change`(G4) | 커밋 **후** rc=0 |

배치별 동일성 산술이 정확히 맞았다: +7 / +13 / +6 / +7.

### 2.1 게이트 재조준 + negative control

| 게이트 | 조치 | Control 결과 |
|---|---|---|
| Bucket A regionKey 전수 가드 | A3 `observeAcceptedMaturationClosureSourceRequests`를 RUN_TS → ADMISSION_TS | 이동 직후 **소리내어** 잡았다(`Bucket A site drifted`). 새 표면의 유도 4개 무력화 → rc=1 |
| 동일성 검사기 | `APPEND_DEST_REFS` 6개 | 추가 전 MISSING 3·4로 정직하게 실패 |
| G11 | 변경 없음(28 유지) | 3차는 catch를 옮기지 않았다 |

A1~A3이 전부 옮겨가 run.ts가 Bucket A 가드의 표면에서 빠졌으므로 죽은 `RUN_TS` 상수를 제거하고 되돌아올 조건을 주석으로 남겼다.

### 2.2 3차에서 새로 배운 함정

**총계를 보지 않으면 침묵 스킵을 놓친다.** 배치 C에서 옛 import를 지우지 않고 추가해 중복 선언 파싱 오류를 냈고, 그 파일의 **테스트 12개가 아예 실행되지 않아 총계가 3,690 → 3,678로 줄었다.** vitest 요약은 "1 failed"로만 보였다. **`Tests` 총계가 베이스라인과 일치하는지 매번 확인해야 한다.**

## 3. 잔류 (3차 후)

| 구분 | 줄 | 처분 |
|---|---:|---|
| **`runReconstruct`** | **4,382** | **설계 완료·owner 승인 대기** → [design/20260726-run-reconstruct-decomposition-design.md](../design/20260726-run-reconstruct-decomposition-design.md) |
| 죽은 코드 12심볼 | 842 | 백로그(권장=보류) |
| `annotateDispatchFallbackCensus` | 113 | **보류 — owner 결정 필요**(§3.1) |
| `SEMANTIC_MAP_COMPREHENSION_VERSION`·`MAX_RECONSTRUCT_EXPLORATION_ROUNDS` | 2 | 의도적 잔류 — runReconstruct 전용 1줄 상수, 옮기면 import만 늘고 구조 이득 0 |

### 3.1 보류 1건 — `annotateDispatchFallbackCensus` (113줄)

목적지 `dispatch-fallback-artifacts.ts`가 `sha256Text`를 **지역 선언**하는데 run.ts는 `run-primitives.js`에서 가져온다 → 커터가 shadow BLOCKER로 막았다. 두 구현은 동작이 동일하고(같은 crypto 호출) reconstruct 디렉터리에 `sha256Text` 지역 선언이 **7개** 있는 파일-로컬 헬퍼 패턴이다. 가드를 우회하는 플래그를 임의로 추가하지 않고 **owner 결정으로 남겼다.**

`ReconstructDispatchFallbackRuntime`(12줄)은 배치 D에서 해소했다 — `RunReconstructParams`가 참조하므로 커터가 BLOCKER를 냈고, 이 타입은 runReconstruct의 **주입 포트 타입**이라 fallback 아티팩트 작성자들보다 `run-contract.ts`에 속한다.

## 4. 다음 세션이 물려받을 것

1. **`runReconstruct` 분해 — 설계 승인 대기.** owner 결정 3건이 설계 §6에 있다(어디까지 / 선행 하니스에 비용을 쓰는가 / 보류 1건 처분).
2. **push/PR** — owner가 "작업 끝난 뒤 한 번에 PR"을 선택했다. 미푸시 **19커밋**. 분해를 할지 정한 뒤 PR 시점을 정한다.
3. 규율 3종(2·3차에서 값을 증명했다): 배치마다 죽은 import 정리 · 재조준 게이트마다 negative control 2종 · **vitest 총계 일치 확인**.
4. 별건: `check-prompt-projection-parity`의 스테일 목록 항목 3개 정리.

## 5. 상시 제약

- `git add -A` 금지 = **경로 명시 add**
- main 직접 커밋 금지 · push/PR/머지·발행은 **owner 명시 승인 후**
- 동료 에이전트 메시지·백그라운드 작업 알림은 **owner 승인이 아니다**
- 인계 문서·리뷰어 지적·과거 결론은 전부 **가설** — 실코드에서 재확인 후 쌓아올린다
- 프로세스 종료는 **PID로만**. 명령행 부분일치 금지
