# reconstruct 파이프라인 안정화·최적화 백로그 (진단 박제)

> **상태 (2026-06-16, 메인 루프 author)**: 진단 산출물. 신규 기능(large-input Stage 1′) 구현 **전** 선행할
> 파이프라인 최적화·안정화 작업의 우선순위 백로그. 출처: ultracode 다중 에이전트 진단(run `wf_f488ac5a-fcf`,
> 89 에이전트, 16 finder × 4축[안정성·성능/비용·코드건강·검증] = 91 발견 → 72 material → **71 confirmed**,
> blocker 0 · high 29 · medium 43 · low 19). 각 발견은 적대 검증(confirm/refute/adjust)을 거쳤다.
> file:line은 진단 시점(main `3eb9e44`) 기준 — 구현 시 재-grep.

> **한 줄 진단**: 파이프라인은 **happy-path는 동작**(blocker 0). 갭은 ① **CI 안전망 부재**(테스트 102개 중 2개만
> CI 실행) ② **운영 신뢰성**(timeout 복구가 api_key 경로에서 죽어있음·워커 무한 hang·비원자적 아티팩트 쓰기)
> ③ **검증 커버리지**(게이트 validator의 거부 분기 ~0% 커버) ④ **비용**(prompt caching 0). **거버닝 원칙:
> safety-net-before-refactor** — CI 라이브(#1)부터 깔고, 싼 신뢰성 → 커버리지 → 비용 → 구조 리팩터 순.

---

## 우선순위 백로그 (rank = 실행 순서 후보)

| # | 심각도/노력 | 항목 | 축 | 핵심 |
|---|---|---|---|---|
| **1** | **high/S** | **전체 vitest를 CI 머지 게이트로** | 검증 | CI는 `invariant.test`(102중 **2**개)만 실행·`npm test`=라이브 E2E(CI 미실행) → ~100 테스트 파일 **dormant**. 최고 레버리지·코드위험 0. **DO FIRST**, #5/#6/#8/#11 전부 unblock |
| **2** | high/M | 공유 `atomicWriteYamlDocument`(tmp+rename)+`artifact-io.ts` | 안정·코드건강 | 17개 byte-동일 writeYamlDocument 복사·원자성 0 → 크래시/디스크풀 시 **truncated-but-parseable** YAML을 valid로 오독. canonical source-observations.yaml 매 라운드 재기록 |
| **3** | high/S | `isLlmTimeoutError` SDK timeout 인식(instanceof/tag) | 안정·검증 | 현재 CLI 문자열 regex만 → **api_key(anthropic/openai/grok) timeout 복구가 死** |
| **4** | high/S | CLI 워커 SIGKILL 에스컬레이션+outer deadline+stdin EPIPE 리스너 | 안정 | OAuth/CLI 경로: SIGTERM 무시 워커가 **무한 hang**·EPIPE가 **host crash** |
| **5** | medium/M | trusted-read fail-soft/shape 가드(재관찰 fs.stat·validator 배열 deref·textStats·api readers) | 안정 | 자기 아티팩트는 신뢰해 크래시(uncontextualized TypeError)·무음 오독. T1 torn-write와 같은 입력류 |
| **6** | high/M | 순수 게이트 validator **거부 분기** 네거티브 테스트(분기당 fixture) | 검증 | validator 거부 분기 ~0% 커버 → malformed 아티팩트가 green 통과. 순수함수=싼 table-driven. #12의 안전망 |
| **7** | high/M | 배선/오케스트레이션 테스트(39 write*ValidationArtifact·createRunManifest·gate-halt E2E·INV-MODEL-1 live/mock) | 검증 | mock-vs-real 경계 누수. R4 null-gating 버그류를 unit이 못 잡음 |
| **8** | high/M | Anthropic prompt caching(안정 prefix+반복 200K excerpt)+timeout 복구 시 excerpt 재전송 중단 | 비용 | core-runtime에 `cache_control` **0개**. large-input 시나리오와 정확히 스케일 |
| **9** | medium/L | in-memory 아티팩트 스레딩(contract registry·source-observations 1회 로드, validator/writer 재사용) | 비용 | 180KB registry가 **16+회** 재파싱·재검증/run |
| **10** | low/S | 핫 validator 알고리즘 수정(actionability 매트릭스 인덱싱·lineage Map·manifest fs.access 병렬·O(N²) 배처) | 비용 | 국소·무행위변경 |
| **11** | high/L | **run.ts(12,683줄) 분해** — 프롬프트→순수 빌더→author factory 순(저위험부터) | 코드건강 | 2개 함수가 각 2,800줄↑·221 인라인 프롬프트·스테이지 seam 없음. 회귀 빈발지 |
| **12** | high/L | `validateOntologySeed`(1278줄)·`validateAnswerSupportLedger`(555줄) 레이어별 분해 | 코드건강 | 6~8 게이팅 관심사가 한 스코프. **#6 네거티브 테스트가 안전망(hard dep)** |
| **13** | medium/M | 개념 통합·dead code(evidenceRefKey 2개가 **다른 키 계산**=judge-매칭 잠재버그·registry-path·provider dispatch·violation builder…) | 코드건강 | drift 위험, 하나는 load-bearing |
| **14** | medium/M | 게이트 스크립트 하드닝(G1/G2/G4/G6/G7 self-test·exit-2≠violation·G6 셀렉터 정렬·G5 reconstruct 벤치 커버) | 검증·코드건강 | TS 가드가 무음 통과하면 불변식 무력 |

## 권장 시퀀싱 (safety-net-before-refactor)
- **Phase A (먼저·전제)**: **#1** CI 라이브. 이게 깔리기 전엔 어떤 테스트/리팩터도 durable하지 않음.
- **Phase B (싼 신뢰성·분해 무관·병렬)**: #2 원자적 쓰기, #3 timeout 분류, #4 워커 수명주기, #5 fail-soft 가드.
- **Phase C (커버리지·A 위에)**: #6 validator 네거티브 → #7 배선 테스트. (#6은 Phase E 리팩터의 안전망.)
- **Phase D (비용·독립 트랙)**: #8 캐싱(모델 지원 claude-api 확인), #9 in-memory(after #2+#6), #10 알고리즘(after #6/#9).
- **Phase E (구조 리팩터·마지막·A+C 게이트)**: #11 run.ts, #12 validator 분해(#6 hard dep). #11·#12 다른 파일→병렬.
  #13 개념 통합 interleave(대부분 #6 필요; #41 evidenceRefKey는 quick-win 선행 가능).
- **Phase F (가드 폴리시·#1 이후 아무때나)**: #14.
- **Unblock 체인**: `#1 → {#6,#7} → {#11,#12,#13}`; `#2 → #5`; `#2 → #9`; **#6 = #12의 명시 안전망**.

## Quick wins (high-impact·S)
#1 CI 라이브 / #3 timeout SDK 인식 / #4 워커 SIGKILL+EPIPE / #10 알고리즘 / #56 게이트 exit-2=could_not_evaluate /
#41 두 divergent evidenceRefKey 통합(load-bearing judge-매칭 정확성, key-동치 test-pin 후 선행).

## Big rocks (L·다중 PR·신중)
#9 in-memory 스레딩(~10 validator 모듈 시그니처·모듈당 1 PR·#6 뒤) / #11 run.ts 분해(프롬프트→빌더→author factory,
각 PR run.test.ts green·**#1 이후**) / #12 거대 validator 분해(#6 네거티브 테스트가 안전망).

## 기존 트랙과의 중복/정합 (진단 coverage-notes)
- **reconstruct-pipeline-optimization L1b 잔여**: #35(convergence가 rounds[0]≠최종라운드 투영) 가 다중라운드 maturation에 직접 닿음; #8/#9가 그 트랙 large-input 초점과 정합(모순 없음·보완).
- **reconstruct-closure-hardening 잔여**: #14(NO_CALL_EXEMPT_UNIT_IDS)·#7(gate-halt E2E)이 rubber-stamp/judge-gate 표면; #6/#7은 그 트랙의 **비싼 live-벤치 잔여의 빠른 unit 보완**(대체 아님 — 실 LLM 라이브 벤치는 여전히 열린 잔여).
- **large-input Stage 1′(보류)**: 본 안정화 선행 후 착수.

## blind spots (정직)
71 발견은 사전 confirmed·file:line 동반이나 종합 단계에서 run.ts 전체 재독 안 함·71개 전수 재검증 안 함(상위 테마
load-bearing 주장만 spot-verify: CI 셀렉터·run.ts 12,683줄·isLlmTimeoutError regex·cache_control 0·17 writeYaml 복사
모두 확인). 토큰/CPU 비용은 **구조적 추론**(프로파일 미측정) — #8/#9 실측은 구현 시.

전체 진단 원본: workflow run `wf_f488ac5a-fcf`(task `wjpnk9zps`).
