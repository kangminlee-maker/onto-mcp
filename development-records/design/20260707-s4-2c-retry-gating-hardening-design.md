# §4 2-C: retry-gating 하드닝 (poison-substring) 설계

> 상태: 설계 (구현 전, 교차검증 대기)
> 성격: **공유 retry-gating 경로** 변경 — stance/deliberation 회귀 반경. §4-6a급 주의.
> 선행: §4-6a(deliberation resubmit, main `4ce1708`) 머지 완료.
> 후행 인에이블러: 2-A synthesis resubmit(이 설계가 synthesis flat-dead의 선행 unblock).
> 근거 재검증: 2026-07-07, main `4ce1708`.
> 설계 SSOT(상위): `20260704-review-unit-resubmit-and-limit-breaker-design.md`(설계 A),
> `20260707-s4-6a-deliberation-resubmit-design.md`(§6 residual = 본 설계 문제 정의).

## 1. 문제 (실코드 근거, main 4ce1708)

resubmit 재시도 발동이 **메시지 substring 분류기**를 경유해, 화이트리스트-거부(교정 가능)가
substring 우연 일치로 `output_contract`(비-재시도)로 오분류되면 재시도가 억제된다.

- `failureKindFromMessage`(`run-review-prompt-execution.ts:1609`)는 envelope 필드명 substring
  (`source_refs_used`·`issue_id`·`schema_version`·`work_item_id`·`boundary_notes`·
  `source_work_item_ref` 등)을 포함하면 `output_contract` 반환(`:1633` 외).
- `shouldRetryUnitFailure`(`:1649`)는 `output_contract` → **false**(비-재시도, `:1656-1661`).
- in-loop resubmit 주입 `applyResubmitErrorSpec`(`:3931`)은 `if (shouldRetryUnitFailure(...))`
  (`:3917`) **안**에 있어, 게이트가 false면 절대 발동 안 함. nested 경로(`:6987/7009`)도 동형.
- 화이트리스트 거부는 raw `Error`(`structured-output-tools.ts:564` `assertAllowedRefs`)라 타입
  분류(`ReviewUnitOutputContractError`, `failureKindFromError:1590`)를 안 타고 **substring 경로로
  빠진다**.

영향(비대칭, 2026-07-07 재확인):
- **synthesis**: 거부 메시지가 **상시** `source_refs_used` 포함
  (`structured-output-tools.ts:1001/1004/1010/1014`, label `submit_issue_synthesis_response.source_refs_used`)
  → 항상 `output_contract` → flat resubmit **완전 dead**. (2-A의 선행 블로커.)
- **stance/deliberation**: 환각 ref가 poison substring 포함할 때만 억제 → **선재·저확률**.
  정상 경로(`...contains unsupported ref: REF`)는 poison 미포함 → `executor_exit`(재시도) → 동작 중.

## 2. 목표

resubmit 재시도 게이트를 substring 분류에서 **구조적(정밀 regex) 교정가능-클래스 분류기**로 전환:
"이 실패가 resubmit-교정 가능한 화이트리스트 거부면, 메시지가 substring상 `output_contract`여도
재시도 허용." 정밀 regex라 **교정 가능(unsupported ref)** 과 **교정 불가(누락 필드 등)** 를
같은 poison substring을 공유해도 판별한다.

## 3. 재료 (이미 존재 — 신규 분류기 불요)

- `classifyUnsupportedEvidenceRefFailure(message)`(`unit-resubmit.ts:71`, stance; submit+on-disk regex).
- `isUnsupportedEvidenceRefFailureMessage(message)`(`:92`, boolean).
- `classifyDeliberationUnsupportedEvidenceRefFailure(message)`(`:126`, deliberation; submit-only regex).
- **선례 소비자**: correlated-escalation(`run-review-prompt-execution.ts:5089-5097`)이 이미
  `isUnsupportedEvidenceRefFailureMessage(msg) ∨ readFrozenUnsupportedRefViolation(output_path)`를
  "resubmit-교정 가능 validation 실패" 구조적 술어로 사용 중. 게이트는 **같은 술어 패턴을 재사용**.
- 디스패처 라우팅(`applyResubmitErrorSpec:1856-1862`): `issue-stance-response`→stance,
  `issue-deliberation-response`→deliberation, else false. 게이트의 output_format 라우팅과 일치.

## 4. 설계

### 4.1 게이트 변경 (sync 유지)

`shouldRetryUnitFailure`에 `dispatch`(→`output_format`)와 `reviewExecutionProfile`을 전달
(두 호출부 `:3917`·`:6987` 모두 스코프에 있음). 규칙:

```
failureKind === output_contract 이고
[2-C 게이트 ON] 이고
resubmitCorrectable(output_format, message) === true
  → return true (재시도 허용)
그 외 output_contract → return false (현행 보존)
```

`resubmitCorrectable(output_format, message)` =
- `issue-stance-response` → `classifyUnsupportedEvidenceRefFailure(message) !== null`
- `issue-deliberation-response` → `classifyDeliberationUnsupportedEvidenceRefFailure(message) !== null`
- (2-A 후) `issue-synthesis-response` → `classifySynthesisUnsupportedSourceRefFailure(message) !== null`
- else → false

**freeze 폴백 불요(게이트는 sync 유지)**: 게이트가 막는 경우는 "메시지 온전 + poison 포함"뿐이다.
메시지가 온전하면 message 분류기가 매칭한다. 메시지가 mangle되면 poison도 없어져
`failureKindFromMessage`가 이미 `executor_exit`(재시도)로 분류 → 게이트가 막지 않음. freeze는
**전략**(`applyResubmitErrorSpec`)이 이미 처리하므로 게이트에 파일 읽기(async) 추가 불요.

### 4.2 default-off (공유 경로 반경 격리)

**권장(옵션 B): 전용 하위 플래그** `retry.resubmit.structural_retry_gate`(default `false`).
- `ReviewUnitResubmitSettings`(`settings-chain.ts:713`)에 `structural_retry_gate: boolean` 추가,
  default `false`(`:243` `{enabled:false}` → `{enabled:false, structural_retry_gate:false}`).
- OFF면 `shouldRetryUnitFailure`는 **byte-identical**(output_contract→false). on/off 차이가 새 분기
  하나로 격리(diff 증명 가능). 이미 배포된 `resubmit.enabled=true` 경로의 stance 동작을 **불변**으로
  보존 — poison 하드닝이 별도 opt-in에만 활성.

**대안(옵션 A): `resubmit.enabled` 재사용.** 개념 경제적(신규 키 0)이나, 배포된
`resubmit.enabled=true`의 rare-poison stance 동작을 커플링해 바꾼다(개선이나 공유-경로 동작 변경).

→ 공유 경로 회귀 반경 + 핸드오프 "§4-6a급 default-off" 규율 감안, **옵션 B 권장**(검증 후 default
승격/폴드 가능). 최종 결정은 §7.

### 4.3 개념 경제

- 재사용: `classify*`/`isUnsupported*`/`readFrozen*`(신규 분류기 0; synthesis 분류기는 2-A 소관).
- 신규 개념: 설정 키 1개(`structural_retry_gate`) — 옵션 B 채택 시. 신규 failure kind·authority 0.
- 정정: `ReviewUnitResubmitSettings` 주석 "Current wiring: issue-stance ... only"(`:706-707`)는
  §4-6a 후 stale → "issue-stance + deliberation evidence_refs"로 정정(문서 위생).

## 5. 왜 substring보다 구조적인가 (핵심 불변식)

- 정밀 regex(`...contains unsupported ref: REF`)는 **교정 가능 클래스만** 매칭. "누락된
  source_refs_used 필드" 같은 진짜 output_contract(poison 포함하나 패턴 불일치)는 비-재시도 유지 →
  **교정 불가 실패의 blind 재시도 없음**.
- **재시도 허용 ⟺ resubmit 전략 발동**(게이트와 전략이 같은 분류기 공유) → 발산 불가.

## 6. 스테이징

1. **2-C 단독**: stance/deliberation rare-poison 억제 해소 + 구조적 게이트 메커니즘 확립. synthesis는
   분류기·전략·라우팅 부재라 여전히 dead(무변).
2. **2-A 후속**: `classifySynthesisUnsupportedSourceRefFailure` + synthesis 전략 +
   `issue-synthesis-response` 라우팅 추가 → 이미 구조적인 게이트를 통과 → synthesis resubmit 완전 활성.

## 7. 미결정 (owner)

- **F1 default-off 방식**: 옵션 B(전용 플래그, 권장) vs 옵션 A(`resubmit.enabled` 재사용).
- **F2 correlated-escalation 상호작용**: 게이트가 stance output_contract-poison을 재시도로 돌리면,
  cap 소진 후 correlated 집계(`:5089-5105`)에 도달하는 유닛 수/타이밍이 바뀌나? — 검증 대상(§8).

## 8. 검증 계획

- **default-off byte-identical**: OFF 경로 diff 증명 + off-path 회귀 테스트(output_contract→false 불변).
- **음성대조**:
  (a) 교정 불가 output_contract(누락 필드, poison 포함) → 플래그 ON에도 **비-재시도** 유지;
  (b) 교정 가능 거부 → 플래그 OFF면 **비-재시도**(byte-identical);
  (c) 교정 가능 거부 → 플래그 ON이면 **재시도 + resubmit spec 주입** 발동.
- **비-vacuous**: 분류기가 **실제** synthesis/stance/deliberation 거부 메시지에 매칭함을 단언(cardinality>0).
- **공유-경로 회귀**: 플래그 OFF로 stance/deliberation 전체 스위트 green.
- **correlated 상호작용**(F2): 게이트 ON에서 correlated-escalation halt 경로가 여전히 발동함을 픽스처로 확인.
- **적대 교차검증**: 설계-먼저(본 노트) + 구현 후, §4-6a급 다-KIND(correctness/regression·concept-economy·
  capability-boundary, + 공유 stance 경로 회귀 렌즈).

## 9. Gotchas

- 게이트는 **공유 경로** — stance 회귀 1순위 리스크. OFF byte-identical + 음성대조 필수.
- on-disk 거부는 resubmit 대상 아님(post-pool degrade) — 게이트도 submit-시점 클래스만 재시도 허용
  (stance classifier는 on-disk regex도 포함하나, on-disk 실패는 애초에 retry 루프 밖 → 게이트 무영향).
- 라인 앵커는 재검증(grep) 필수 — 구현 시 이동 가능.

---

## 10. 교차검증 반영 + 개정 설계 v2 (3-KIND 적대 검증, 2026-07-07)

§1-9는 **초안(v1)**. 구현 전 독립 3-KIND 적대 교차검증(correctness / shared-path regression /
concept-boundary)에서 아래를 발견해 **v2로 개정**한다. v1 §4-5의 규칙/근거 일부는 v2가 대체한다.

### 10.1 발견 요약

- **F-1 (수렴, 3렌즈 일치) — must-fix**: v1 §4.1 게이트 규칙이 `resubmit.enabled` 전제를 누락.
  전략 `applyResubmitErrorSpec`/`apply{Stance,Deliberation}...`은 `enabled !== true`면 no-op
  (`run-review-prompt-execution.ts:1776/1853/1893`). 서브플래그 단독 활성은 **spec 없는 blind 재시도** →
  §5 "재시도 ⟺ 전략 발동" 위반. **게이트 활성 술어는 전략 활성 술어의 부분집합**이어야 함.
- **F-2 (렌즈2 고유, ON-path) — design-changing**: correlated/demote 기계는 **stance 전용**
  (`unit-resubmit.ts:16-18`)이고 유닛의 **최종 시도** 메시지 클래스를 읽음(`:3961`). 게이트가
  poison-stance를 재시도로 돌리면 최종 클래스가 비결정적이 되어, `demotable = validationFailures.length
  === failedOutcomes.length`(`:5114`) 등식이 깨져 **단일-렌즈 강등이 whole-run halt로 전환**될 수 있음.
  default-promotion 시 실회귀. v1 §8은 "halt 여전히 발동"만 봐 못 잡음.
- **M-1 (렌즈3 고유)**: 게이트의 `resubmitCorrectable`와 디스패처 `applyResubmitErrorSpec`
  (`:1856-1862`)가 **두 개의 병렬 output_format 스위치**. 2-A 때 한쪽만 갱신하면 blind synthesis 재시도.
  §5의 "발산 불가"는 분류기 공유일 뿐 라우팅 중복은 미보장.
- **worker-path (렌즈1 심층 추적, 크럭스 해소)**: 화이트리스트 거부는 워커가 freeze 후 re-throw →
  비정상 종료 → 오케스트레이터는 (a) 온전 stderr(분류기 매칭) 또는 (b) `"Executor exited with code N"`
  (`executor_exit`, 이미 재시도 가능). **output_contract-without-classifier-match 경로는 부재** →
  message-only 게이트로 **충분**. v1 §4.1의 "freeze는 전략이 처리하니 게이트 불요" 근거는 오류였으나
  (전략은 게이트 안쪽) 결론(게이트에 freeze 불요)은 유효. 절단은 로그 전용(`:3928`), 게이트는 full message.
- **비-material**: `shouldRetryUnitFailure` 호출은 4곳(`:3917/3951` flat, `:6987/7009` nested).
  nested는 `runLensWorker`(lens 전용, output_format=markdown/lens-sidecar)라 오버라이드 **no-op**.
  stance/delib/synth는 flat 경로만 탐. 새 param은 **required**로 4곳을 TS가 강제.

### 10.2 개정 설계 (v2)

**핵심 전환: 오버라이드를 stance에서 제외하고 deliberation+synthesis로 한정** → F-2를 통째 설계-아웃.
근거: stance 정상 resubmit은 이미 `executor_exit` 경로라 오버라이드와 무관하게 동작. 오버라이드가
바꾸는 건 stance의 **rare-poison output_contract** 케이스뿐인데, 그게 정확히 correlated/demote 최종-클래스
비결정성의 진입점. 제외 시 stance는 **오늘과 byte-identical**(rare-poison은 오늘처럼 degrade). 잃는 것은
"rare-poison-stance 하드닝"(저확률·선재·비회귀). deliberation은 correlated 기계 없음 + 비-halt degrade →
오버라이드 안전.

1. **단일 레지스트리(M-1 해소)**: `format → { classify, strategy, gateEligible }` 단일 소스
   (전략이 사는 `run-review-prompt-execution.ts`에서 조립, 분류기는 `unit-resubmit.ts` import):
   - `issue-stance-response`: { classifyUnsupportedEvidenceRefFailure, applyStance..., **gateEligible: false** }
   - `issue-deliberation-response`: { classifyDeliberation..., applyDeliberation..., **gateEligible: true** }
   - `issue-synthesis-response`(2-A): { **classifySynthesisUnsupportedSourceRefFailure(신규)**,
     **applySynthesisResubmit...(신규)**, **gateEligible: true** }
   디스패처는 `registry[fmt]?.strategy`, 게이트는 `registry[fmt]?.gateEligible &&
   registry[fmt].classify(msg) !== null`을 읽어 **한 소스**를 공유. lockstep 테스트로 "gateEligible:true면
   strategy 배선 필수" 단언.

2. **게이트 규칙(F-1 해소)**: flat 경로 `shouldRetryUnitFailure`에서
   ```
   failureKind === output_contract
     && reviewExecutionProfile?.retry?.resubmit?.enabled === true   // F-1: 전략 활성과 동일 전제
     && registry[dispatch.output_format]?.gateEligible === true      // F-2: stance 제외
     && registry[dispatch.output_format].classify(message) !== null  // 정밀 클래스
     → return true
   ```
   nested 호출부는 갱신하되 lens output_format이라 no-op(문서화).

3. **F1(default-off/플래그) 재판정**: stance 제외로 **F-2가 사라져** 별도 격리 플래그의 주 근거가 소멸.
   → **`resubmit.enabled` 재사용(옵션 A) 권장**(신규 키 0, 렌즈3 M2의 "2-flag wart"·synthesis-silently-dead
   회피). OFF(enabled=false)면 게이트 short-circuit → byte-identical(diff 증명). deliberation은 enabled=true에서
   rare-poison이 degrade→correction으로 바뀌나 correlated 기계 없어 halt-flip 무위험(안전한 개선).
   `structural_retry_gate` 신규 필드 **불요**. §4.2 옵션 B 폐기.

4. **2-A 결합 권장**: stance 제외 시 **2-C 단독은 deliberation rare-poison만** 바꿔 standalone 가치 희박하고
   검증도 어려움(rare 픽스처 필요). synthesis는 **상시 poison**이라 게이트를 common-path로 실증 → 검증 용이.
   레지스트리가 2-C/2-A를 한 변경으로 자연 통합. → **2-C+2-A를 한 cut으로** 권장(스테이징 유지도 가능하나
   2-C 단독은 "메커니즘+deliberation"만).

5. **synthesis 분류기 주의(2-A)**: 거부 메시지 2종 — `...source_refs_used contains unsupported ref: REF`
   **와** `...source_refs_used must include at least one allowed source ref.`(`structured-output-tools.ts:1014`).
   둘 다 poison→output_contract·둘 다 교정 가능(허용집합 재프롬프트). 분류기가 **양쪽 패턴** 커버해야 dead 잔존 없음.

### 10.3 개정 검증 계획 (v2, §8 대체분)

- **default-off byte-identical**: enabled=false에서 flat/nested 게이트 diff 증명 + 회귀(output_contract→false).
- **음성대조(falsifiable)**:
  (a) **F-2 가드**: poison **stance** 유닛 → enabled=true에도 게이트 재시도 **안 함**(gateEligible:false),
      단일-렌즈 demote가 whole-run halt로 전환되지 **않음**(오늘과 동일);
  (b) 교정 가능 **deliberation/synthesis** 거부 → enabled=true면 재시도 + spec 주입 발동, enabled=false면 비-재시도;
  (c) 교정 불가 output_contract(누락 필드, poison 포함) → enabled=true에도 비-재시도.
- **레지스트리 lockstep**: gateEligible:true인 모든 format이 배선된 strategy를 가짐을 단언(M-1 회귀 가드).
- **비-vacuous**: 분류기가 **실제** synthesis(양 패턴)·deliberation 거부 메시지에 매칭(cardinality>0).
- **공유-경로 회귀**: enabled=false로 stance/deliberation/synthesis 전체 스위트 green;
  enabled=true에서 stance correlated-escalation halt·demote 경로가 **오늘과 동일**함을 픽스처로 확인.
- **적대 교차검증**: 본 v2 개정에 대해 구현 후 재검(§4-6a급 다-KIND).

---

## 11. 구현 기록 (2026-07-08, 옵션 1 = stance 제외 + 2-C·2-A 결합)

owner 확정: **stance 제외 + synthesis 결합 + `resubmit.enabled` 재사용(신규 플래그 0)**.

변경(모두 `resubmit.enabled` OFF면 byte-identical):
- `unit-resubmit.ts`: `classifySynthesisUnsupportedSourceRefFailure`(2 패턴: contains-unsupported-ref +
  must-include-at-least-one; empty-allowed-set는 비-매칭), `SynthesisUnsupportedSourceRefViolation`,
  `ResubmitUnitDescriptor`에 `{kind:"synthesis"; issueId}`, `buildResubmitErrorSpec` 필드명 파라미터화
  (source_refs_used/source ref) + null-ref(case 3) 라인. stance/deliberation 출력은 byte-identical.
- `run-review-prompt-execution.ts`: `applySynthesisResubmitErrorSpec` +
  `readFrozenSynthesisUnsupportedRefViolation` + `synthesisIssueIdFromUnitId`; **단일 레지스트리
  `RESUBMIT_UNIT_ROUTING`**(format→{classify, apply, gateEligible})로 디스패처·게이트 단일소스화(M-1);
  `shouldRetryUnitFailure`가 `dispatch`+`profile`을 받아 output_contract를 `isResubmitCorrectableRetry`
  (enabled AND gateEligible AND classify)로 라우팅(F-1·F-2); 4개 호출부 갱신(nested는 lens no-op).
  gateEligible: stance=false, deliberation=true, synthesis=true.
- `settings-chain.ts`·`unit-resubmit.ts` 헤더: wired-units 주석 정정(문서 위생).

검증(실경로): typecheck; **전체 vitest 2537 pass**; import-boundary·invariant-change·mcp:review·
invocation-runner·review:route 가드 pass. 신규 테스트:
- `structural-retry-gate.test.ts`(10): OFF byte-identical(4 유닛), ON synthesis(양 패턴)·deliberation-poison
  재시도, **F-2 가드**(ON stance poison 비-재시도), 음성대조(교정불가 output_contract 비-재시도),
  executor_exit/empty_output 불변, attempt budget, 레지스트리 gateEligible·lockstep·non-vacuous classify.
- `synthesis-resubmit-wiring.test.ts`(4): 실 synthesis 패킷으로 spec 주입(양 패턴)·allowed_source_refs
  회수·OFF no-op·empty-allowed-set 비-교정.
- `deliberation-resubmit-wiring.test.ts`: "synthesis stays blind" 음성대조를 미배선 포맷(issue-artifact)으로
  재조준(synthesis는 이제 배선됨).

잔여(정직 라벨): worker 경로에서 stderr가 온전하면 message 분류기로 in-loop 다-shot, 소실되면
executor_exit라 이미 재시도 가능(freeze 폴백은 전략이 사용) — output_contract-without-classifier-match
경로는 부재(렌즈1 확인). 게이트에 freeze 읽기(async) 불요.

### 11.1 구현-후 교차검증 = CONFIRMED (2026-07-08, 2 독립 리뷰어 수렴)

구현 후 독립 적대 검증 2회(리뷰어 KIND 다름):
- **Sonnet 좁은-특정**(미완 4렌즈: F-1 blind-retry subset / classifier 완전성·정밀성 / byte-identical OFF /
  test falsifiability): **NO MATERIAL FINDINGS**. 핵심: 전략 false-후-blind는 도달불가(unit_id 항상
  `synthesis:<id>`, inline-http executor hard-throw) 또는 wasteful-but-safe(§4-6a 선재 구조);
  empty-allowed-set 비-매칭 확인; stance/deliberation 출력 byte-identical; OFF=1/ON=3 실경로 discriminating.
- **Opus 넓은-심층**(합성 경로 / nested 트랩 / F-2 완전성 / 레지스트리 / seam / 엣지): **NO MATERIAL
  FINDINGS**(스위트 직접 재실행 pass). 최강 확인: **correlated/demote는 stance-pool-local — deliberation/
  synthesis는 별도 풀·별도 outcome 배열이라 stance 계산에 영향 불가**(F-2 이중 안전: 게이트 제외 + 풀 격리).
- cosmetic 2건 반영: 게이트 음성대조를 실 empty-allowed-set 메시지로 교체, `RESUBMIT_UNIT_ROUTING`
  `Object.freeze`.
- 규율(rate-limit 붕괴 시 PROPOSED)은 한도 복구 후 2 독립 KIND-다양 리뷰어 clean 수렴으로 해소 →
  **CONFIRMED**. (설계-전 3-KIND + 구현-후 2-KIND = 총 5 독립 렌즈.)
