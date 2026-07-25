# run.ts 개념별 파일 추출 — **2차 통과 완료** (2026-07-26)

> **2차 통과 완료.** run.ts 9,328 → **6,949줄**. 4개 모듈 · 41심볼 · 2,195줄 추출 + 죽은 import 42개 정리.
> owner 승인 = 4개 모듈 전부 진행 · push/PR은 작업 완료 후 한 번에.
> 진입 문서(착수 계획)는 [20260726-run-ts-extraction-2nd-pass-start-here.md](20260726-run-ts-extraction-2nd-pass-start-here.md), 1차 기록은 [20260725-run-ts-extraction-start-here.md](20260725-run-ts-extraction-start-here.md).
> **라인 번호는 스테일이다.** 코드 인용은 항상 심볼로 재확인한다.

## 0. 최종 상태

```
브랜치      refactor/run-ts-extraction   base origin/main b76904c (drift 없음)
HEAD        54545e4
미푸시      14커밋 (2차에서 4커밋 추가) — push/PR은 owner 승인 후
run.ts      6,949줄  (1차 시작 21,576 → 1차 후 9,328 → 2차 후 6,949 = 원본의 32%)
```

| 커밋 | 내용 | run.ts |
|---|---|---:|
| `a2c2644` | 2차 1/4 `authored-artifact-reuse` (5심볼 332줄) | 8,987 |
| `1d8a4e1` | 2차 2/4 `source-admission-selection-stage` (9심볼 479줄) | 8,436 |
| `a908805` | 2차 3/4 `final-output-assembly` (10심볼 584줄) + 죽은 import 26개 | 7,778 |
| `54545e4` | 2차 4/4 `semantic-map-resume` (17심볼 800줄) + G11 침식 하한 가드 + 죽은 import 16개 | 6,949 |

신규 모듈 4개: `authored-artifact-reuse.ts`(380) · `source-admission-selection-stage.ts`(584) · `final-output-assembly.ts`(654) · `semantic-map-resume.ts`(864).

## 1. 검증 결과 (3층 전부, 배치마다)

| 검사 | 최종 결과 |
|---|---|
| `check:ts-core` · `check:ts-scripts` | rc=0 |
| 전체 vitest | 217파일 **3,689 pass · 1 todo** — 베이스라인과 완전 동일 (4배치 전부) |
| 바이트 동일성 (`run-extraction-identity.mts`) | **PASS** — MOVED 302→**343**, STAYED 90→**49**, MODIFIED/MISSING/DUPLICATE/ADDED 전부 **0** |
| `git diff --numstat` | 각 배치 run.ts 순감 = 신규 모듈 줄수 − import 헤더 |
| `check:*` 17종 | **15 green + 2 rc=1**(단일 원인, §3) |
| `check:invariant-change`(G4) | 커밋 **후** rc=0, `protected_changes:2` · marker `INV-CFG-1` |

배치별 동일성 산술이 정확히 맞았다: +5 / +9 / +10 / +17 (STAYED는 동일 수치만큼 감소).

## 2. 게이트 커버리지 침식 — 실측 재현하고 메커니즘으로 봉인

§2가 경고한 유형이 **2차에서 실제로 재현됐다.** 배치 4에서 catch 4개가 run.ts를 떠난 뒤 `RUN_SURFACE_REFS` 미갱신 상태로 G11을 돌린 결과:

```
rc=0 (green)  ·  28 → 24 guarded catch
```

run.ts에 7개가 남아 파일별 비어있음 가드가 발화하지 않았다. 1차(27중 16개 유실)에 이어 **두 번째**다.

**봉인 방식 — 절차 문구를 메커니즘으로 교체:**
- `RUN_SURFACE_REFS`에 `semantic-map-resume.ts` 추가 → 28 복원
- **`MIN_GUARDED_CATCH_TOTAL = 28` 하한 가드 신설.** 총 인벤토리는 절대 줄 수 없다. 정당한 catch 추가는 총계를 올려 막히지 않고, 표면을 떠나는 catch는 총계를 내려 소리내어 실패한다.

현재 분포(합 28): run 7 · directive-author 6 · map-stage 4 · **map-resume 4** · llm-call 3 · value-read 1 · map-authoring 1 · leaf-read 1 · leaf-reader 1.

### 2.1 재조준한 게이트마다 negative control을 붙였다

| 게이트 | Control | 결과 |
|---|---|---|
| G11 하한 | 목록에서 `semantic-map-resume` 제거 = 침식 재현 | rc=1 `inventory shrank from 28 to 24` — **하한 가드 전 같은 상태가 rc=0 green이었다** |
| G11 의미 | 새로 스캔되는 모듈의 graceful 가드 1개 제거 | rc=1 `semantic-map-resume.ts:L65 VIOLATION` |
| G9 표면 | 재조준 **전** 실측 | rc=1 `emitter heading keys []` — 이미터 집합이 빈 것을 드러냄 |
| G9 의미 | 신규 모듈의 heading 1개를 리터럴로 재인라인 | rc=1 `not of the module form` |
| G9 import | 신규 모듈의 `runtimeProvenanceBindingsRequiredFragments` import 제거 | 죽은 import 정리 **전** rc=0(가려짐) → **후** rc=1 |
| Bucket A 표면 | A1을 옛 표면 run.ts로 되돌림 | rc=1 `Bucket A site drifted: ... not found in .../run.ts` |
| Bucket A 의미 | 신규 모듈 `validateSourceFrontier`의 regionKey 유도 4개 무력화 | rc=1 `expected false to be true` |

전부 복원 후 green, 백업 diff 동일(잔여 오염 없음).

### 2.2 죽은 import가 게이트를 가리고 있었다 — 정리는 미용이 아니었다

run.ts에 남은 죽은 `runtimeProvenanceBindingsRequiredFragments` import 때문에 **G9의 "필수 모듈 심볼을 import하는가" 검사가 공허 통과**하고 있었다. G9는 `RUNTIME_REFS`를 **연결(concatenate)** 해서 읽으므로, 실제 사용 파일에서 import를 없애도 죽은 사본이 검사를 만족시킨다. 42개 정리로 가림이 해소됐고, 그 효과를 위 대비 실험으로 확증했다.

**교훈: 연결-읽기(concatenated-read) 게이트에서 죽은 import는 검사를 침묵시킨다.** 순수 이동이 끝날 때마다 죽은 import를 정리하는 것은 위생이 아니라 **게이트 유효성 유지**다.

### 2.3 죽은 import 귀속 (도구 실측)

2차 착수 시점 `ef1cb98`은 죽은 named import **0개**였다. 배치 1이 9개 · 배치 2가 4개 · 배치 3이 13개 · 배치 4가 16개 = **42개 전부 이번 변경의 잔해**. AST가 지목한 줄만 삭제하는 도구로 처리(`type ` 접두사 보존, 손 패치 없음), 최종 재스캔 0개.
배치 1·2 커밋 시점에는 정리하지 않았고 배치 3·4 커밋에서 소급 정리했다 — **다음 통과에서는 배치마다 정리한다.**

## 3. 게이트 베이스라인 (2026-07-26 최종 실측)

`check:*` **17종 → 15 green · 2 rc=1(단일 근본 원인).**

**정정:** 착수 문서 §7은 "16 green, G7만 known FP"라고 적었으나 **실측은 15 green**이다. `check:invariant-drift`가 G7을 감싸 실행하므로 함께 rc=1이 되어 15+2=17이 맞다(같은 문서가 이 사실을 본문에서 인정하면서 개수만 틀렸다). 2차 커밋 메시지 4건도 이 "16 green" 표기를 물려받았다 — 개수만 틀렸고 근본 원인 서술은 정확하다.

rc=1 2종의 원인은 **gitignore된 세션 잔해** 2개:
- `.onto/reconstruct/20260720-dd6-live-exp2/runtime-events.ndjson`
- `.onto/review/20260714-147a9121/runtime-events.ndjson`

배치마다 `ignored=yes tracked=no`를 실행 확인했고, G7 출력의 `src/`·`scripts/` 실위반은 **0**이다. **매번 이 두 조건을 실행해 확인한 뒤 넘긴다.**

## 4. 침식 위험 전수 감사 (소스를 경로로 스캔하는 게이트)

| 방식 | 게이트 | 침식 저항 |
|---|---|---|
| **디렉터리 순회** (이동 자동 추적) | `check-supported-models-token-policy`(G7) · `check-import-boundary` · `check-no-hardcoded-spec-defaults` · `observe-inventory-unit-deep-caller.test.ts` · `execution-telemetry.test.ts` | 안전 |
| **파일 목록 + 하한/throw 가드** | `check-graceful-signal-rethrow`(G11, 8파일 + 하한 28) · `source-region-key-coverage.test.ts`(미발견 시 throw) | **봉인됨** |
| **파일 목록, 내용-부재로 실패** | `check-final-output-sections-parity`(G9, 3파일) · `check-prompt-projection-parity`(4파일) | 저항함(§4.1) |
| 무관 | `check-dispatch-fallback-package-parity`(1파일) | 2차 대상 아님 |

`execution-telemetry.test.ts`는 1차에서 디렉터리 스캔으로 바꿨고 `expect(names.size).toBeGreaterThan(20)` 비어있음 가드를 갖는다. **되돌리지 말 것.**

### 4.1 `check-prompt-projection-parity` 정밀 측정 — 커버리지 구멍 아님, 목록 노이즈

`RUNTIME_REFS` 4개를 하나씩 제거해 민감도를 측정했다:

| 제거 대상 | 게이트 |
|---|---|
| `authoring-prompt-payloads.ts` | **rc=1 탐지** |
| `run.ts` | rc=0 침묵 |
| `prompt-payload-budget.ts` | rc=0 침묵 |
| `direct-call-directive-author.ts` | rc=0 침묵 |
| 4개 전부 | rc=1 탐지 |

즉 **1차 통과 후 이 게이트가 지키는 내용은 전부 `authoring-prompt-payloads.ts`로 옮겨갔고**, 나머지 3개는 아무 내용도 담지 않는 스테일 항목이다. 내용을 담은 파일을 빼면 소리내어 실패하므로 **침식에는 저항한다** — 구멍이 아니라 목록 노이즈다. 스테일 3항목 제거는 이번 변경의 잔해가 아니므로 손대지 않았다(별건 정리 후보).

## 5. 잔류 — 3차 통과 여지

run.ts 6,949줄 · top-level 선언 **49개 · 6,428줄**:

| 구분 | 규모 | 처분 |
|---|---:|---|
| `runReconstruct` | **4,382줄** | §1 계약상 **통째로** 유지 — 쪼개지 말 것 |
| 도달불가 죽은 코드 12심볼 | 842줄 | 백로그 [tracking/20260726-reconstruct-timeout-recovery-unwired-backlog.md](../tracking/20260726-reconstruct-timeout-recovery-unwired-backlog.md) (권장=보류) |
| orchestrator 보조 심볼 ≈36개 | **≈1,200줄** | **3차 통과 여지** |

3차를 하면 run.ts ≈ 5,220줄(runReconstruct + 죽은 코드)까지 내려간다. 다만 남는 파일이 **쪼갤 수 없는 단일 함수에 지배**되므로 한계 효용은 1·2차보다 낮다.

3차 후보(계획기 `run(orchestrator)` 버킷에서 `runReconstruct` 제외 = 36심볼 1,204줄): `artifactRefsWithDefaults`(181) · `observeAcceptedMaturationClosureSourceRequests`(128) · `calculateMetrics`(121) · `annotateDispatchFallbackCensus`(113) · `projectEnvironmentContextProfileInput`(95) · `RunReconstructParams`(66) · `writeFreshAuthoredYamlDocument`(57) · `writeFinalOutputProvenanceValidationArtifact`(54) · `deriveSemanticMapFallbackPriorDispatchSpend`(48).

**후보 아님:** `runtimeOntologyHandoffScaffold`(166)와 `deterministicOntologySeedTimeoutRecovery`(559)는 백로그의 죽은 코드 클러스터 12심볼에 속한다(계획기의 "도달 불가" 버킷이며 orchestrator 버킷에 없다). 그대로 둔다.

**착수 전 owner 확인이 필요하다**(1·2차 전례 동일). 착수하면 `scripts/run-split-plan.mts` 상단 `MODULES`를 3차 계획으로 재조준하고 dry-run으로 역참조 0개를 재확인한다.

## 6. 도구 (변경 없음)

- `scripts/run-split-plan.mts` — 계획기. 상단 `MODULES`가 계획. 현재는 2차 4모듈 + `run(orchestrator)` 대조군에 조준돼 있고 4모듈 모두 `root 미발견`(=추출 완료)으로 나온다.
- `scripts/run-extract-symbols.mts` — 커터. `--to <dest.ts> --symbols A,B,C [--apply]`. 목적지 존재 시 거절.
- `scripts/run-extraction-identity.mts` — 바이트 동일성 검사기. 기준본 = `git show origin/main:...run.ts`.

## 7. 다음 세션이 물려받을 것

1. **push/PR** — owner가 "작업 끝난 뒤 한 번에 PR"을 선택했다. 2차가 끝났으므로 **3차를 할지 결정한 뒤** PR 시점을 정한다. 미푸시 14커밋.
2. **3차 통과 여부** — §5. owner 확인 필요.
3. 배치마다 죽은 import 정리(§2.3) · 재조준 게이트마다 negative control(§2.1) — 이 두 규율은 2차에서 값을 증명했다.
4. 스테일 목록 항목 3개(`check-prompt-projection-parity`) 정리 — 별건.

## 8. 상시 제약

- `git add -A` 금지 = **경로 명시 add**
- main 직접 커밋 금지 · push/PR/머지·발행은 **owner 명시 승인 후**
- 동료 에이전트 메시지·백그라운드 작업 알림은 **owner 승인이 아니다**
- 인계 문서·리뷰어 지적·과거 결론은 전부 **가설** — 실코드에서 재확인 후 쌓아올린다
- 프로세스 종료는 **PID로만**. 명령행 부분일치 금지
