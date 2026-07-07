# §4-6a — bounded-resubmit 확대: deliberation_response 설계 (2026-07-07)

Authority: 설계 SSOT `20260704-review-unit-resubmit-and-limit-breaker-design.md` §3·line 96-97
("resubmit 정책을 공유 함수로 추출하되 이번 cut의 배선은 issue-stance 경로에 한정"의 이연분 실현).
레인 A(INV-MODEL-1 무관). default-off 보존.

## 0. 판정 (구현 전 결정) — deliberation는 resubmit 적용 **가능**

deliberation_response 유닛은 stance와 **구조적으로 동일한 `evidence_refs` 화이트리스트 거부**를
submit-시점·on-disk 양쪽에서 던진다 → 결정적 분류·오류명세 교정 가능 → resubmit 전제 충족
(SSOT §2: 런타임 no-reason, 거부+명세 재요청만).

실코드 근거(main 35a4b24 재검증):

| 지점 | stance | deliberation |
|---|---|---|
| submit-시점 거부 | `submit_issue_stance_response.stances[N].evidence_refs contains unsupported ref for ISSUE: REF` (`structured-output-tools.ts` `normalizeIssueStanceResponseSubmitArgs` :865) | `submit_issue_deliberation_response.evidence_refs contains unsupported ref: REF` (동 파일 `assertAllowedRefs` :562, `normalizeIssueDeliberationResponseSubmitArgs` :901 경유) |
| on-disk 거부 | `issue-stance response for issue ISSUE and lens LENS references unsupported evidence: REF` (`issue-artifact-runtime.ts`) | `issue deliberation response.evidence_refs contains unsupported ref: REF` (`controlled-lens-deliberation.ts` `validateIssueDeliberationResponseObject` :566) |
| 허용집합 | keyed `issue_evidence_refs[issueId]` | **flat** `parseRuntimeIssueDeliberationSchemaContext(packet).allowed_evidence_refs` |
| 메시지의 issue/lens | 메시지에 포함 | **메시지에 없음** → `dispatch.unit_id`(`deliberation:<issueId>:<lensId>`)에서 회수 |
| 유닛당 스코프 | issue×lens 매트릭스 | 단일 (issue,lens) |

## 1. 핸드오프 §3 가정 1건 정정 (실코드 근거)

핸드오프는 "강등 slice·correlated-halt까지 output_format-불문 일반화"를 예상했으나, 실코드상
**deliberation에는 강등/halt 기계가 불필요**하다:

- stance: 검증-거부 실패 → 배치 강등 블록(`run-review-prompt-execution.ts` `runIssueStanceMatrixCollectionDispatch`
  내부, main 기준 ~4951-5001; 이 cut의 추가로 라인 하향 이동) + correlated 과반 시 whole-run halt.
  `outcome.dispatch.unit_id.slice("issue-stance:".length)`로 강등.
- deliberation: 실패(dispatch/submit/on-disk) → **이미 비-halt degrade**
  (`executeDeliberationResponseUnit` :4379 → `completeUnavailableDeliberationResponseUnit` :4283).
  whole-run halt은 그 unavailable-completion마저 실패(null)할 때만.

즉 deliberation의 "cap 소진 → fallback"은 *신설 없이* 기존 unavailable-completion이 담당한다.
→ **stance 배치 강등 블록(4951-5001)·correlated-escalation은 손대지 않는다.** §4-6a 실 스코프는
"주입 함수 + 분류기의 유닛-불문 일반화"로 축소된다(정직한 재프레이밍).

## 2. resubmit 주입 배선 (검증된 경로)

- per-issue deliberation 유닛은 범용 `runSingleDispatchWithRetries`(:3666)를 통과한다
  (`executeDeliberationResponseUnit` → `unitOutcomeWithNestedFirstAttempt` → runFlat). unit_kind
  `"deliberation"`, output_format `"issue-deliberation-response"`.
- 그 루프 안 주입 호출부는 **이미** attempt-0(:3739)·pre-retry(:3799)에 있고, 게이트
  `applyStanceResubmitErrorSpec` 내부 `:1778 output_format !== "issue-stance-response"` 에서만 no-op.
- in-dispatch(재시도 대상) 검증 신호 = **submit-시점 거부**뿐이다: `validateUnitOutputFile`(:1508)은
  `issue-deliberation-response`에 대해 content 검증 없이 early-return(:1558) → executor의 submit
  throw만이 dispatch를 실패시킨다.
- salvage freeze(`claude-code-review-unit-executor.ts` :741-752, `codex-*` 동형)는 **output_format
  무관** → deliberation submit 실패도 `frozen.error`에 submit-시점 메시지를 담아 freeze. 따라서
  attempt-0 경로(:3739 → `readFrozenUnsupportedRefViolation`)도 분류기 일반화만으로 적용된다.
- on-disk 거부(`validateIssueDeliberationResponseObject` :5601)는 **post-pool**이라 retry 밖 →
  degrade(unavailable). 허용집합이 submit-시점과 동일 출처(packet)이므로 submit-시점이 1차로 잡고,
  on-disk는 belt-and-suspenders. → resubmit 스코프는 submit-시점 경로(=retry 루프)로 한정한다.

## 3. 공유화 설계 (surgical, default-off byte-identical)

### 3-A. `stance-resubmit.ts` → 유닛-불문 분류기/빌더

- **신설** `classifyDeliberationUnsupportedEvidenceRefFailure(message)`: 두 deliberation 패턴
  (submit-시점·on-disk)에 앵커, `evidenceRef`만 캡처(issue/lens는 dispatch에서). 다른 실패 클래스는
  null 반환(인프라 실패 의미 보존).
- **일반화** `buildResubmitErrorSpec`: 현재 stance 전용 label("rejected stance…")을 유닛-적합 label로
  파라미터화. deliberation label = `deliberation for issue_id: X, lens_id: Y`. 허용집합 블록·마커·
  본문 지시는 재사용(리팩터 최소화 — stance 호출은 동일 label 산출로 byte-identical 유지).
- **재사용(무변경)**: 마커 `RESUBMIT_ERROR_SPEC_BEGIN/END`, `applyResubmitErrorSpecToPacket`,
  `stripResubmitErrorSpec`, `packetHasResubmitErrorSpec` — 이미 generic.
- 강등 관련(`correlatedValidationExceeded` 등)은 **무변경**(deliberation 미사용).

### 3-B. `run-review-prompt-execution.ts` — 주입 함수 유닛-불문화

- `applyStanceResubmitErrorSpec` → `applyResubmitErrorSpec` (또는 명칭 유지 + 내부 분기):
  - 게이트1 `resubmit.enabled !== true → false` (무변경).
  - 게이트2 `dispatch.output_format` 분기:
    - `issue-stance-response` → 기존 전략(분류기 + `parseRuntimeIssueStanceSchemaContext` +
      `issue_evidence_refs[issueId]`). **byte-identical.**
    - `issue-deliberation-response` → 신규 전략(deliberation 분류기 +
      `parseRuntimeIssueDeliberationSchemaContext.allowed_evidence_refs` + issue/lens from unit_id).
    - 그 외 → false (synthesis 등 no-op 보존).
  - `readFrozenUnsupportedRefViolation`도 output_format에 맞는 분류기를 태우도록 일반화.
- 호출부(:3739/:3799) 시그니처 무변경 — 함수 내부에서 output_format으로 자기-분기.
- **강등 블록(4951-5001)·correlated-halt: 무변경**(stance 전용).

### 3-C. default-off 보존 (diff-provable)

`resubmit.enabled` 게이트 무변경 → OFF면 stance·deliberation 모두 즉시 false 반환 → 현행 맹목 재시도
byte-identical. 신설 오프토글 키 없음(기존 `review.execution.retry.resubmit.enabled` 재사용).

## 4. 가치 / 완료 기준 (falsifiable)

- 가치: deliberation submit-시점 evidence_refs 거부 시 현행=맹목 재시도(budget 낭비)→degrade(unavailable).
  resubmit ON=교정 재시도(거부 ref+허용집합 통지)→성공률↑, unavailable degrade↓(참여 렌즈 보존 →
  resolution 품질↑). stance와 동일 가치 명제.
- 완료 기준(모두 충족 — negative/contrast control 포함):
  1. **OFF byte-identical**: `deliberation-resubmit-dispatch.test.ts` "OFF contrast" — 동일 실패 stub·동일
     cap에서 packet이 `DELIBERATION_PACKET`와 정확히 일치(주입 0)·resubmit 로그 부재. + builder
     byte-identical 회귀 가드(`unit-resubmit.test.ts`).
  2. **ON heal**: "ON heal" — 허용-외 ref 거부 → error-spec 주입(허용집합 packet 회수 확인) → 교정
     재시도로 유닛 완료(2회 호출, degrade child 없음, healed 출력).
  3. **ON cap 소진 degrade**: "ON exhausted" — 매 재시도 스펙 주입 후 whole-run halt 없이
     `completeUnavailableDeliberationResponseUnit` degrade(3회 호출, outcome.success=degrade, child 실패).
  4. **contrast control**: ON-exhausted vs OFF는 동일 degrade 결과지만 ON만 스펙 주입(packet 변경+로그)
     → 토글이 deliberation resubmit을 실제로 게이팅함을 증명(mechanism이 맞을 때만 통과).
  5. **분류기 negative**: 인프라 실패·on-disk 메시지는 null → resubmit 미발동(`unit-resubmit.test.ts`,
     `deliberation-resubmit-wiring.test.ts`).
  6. **stance 회귀 없음**: 기존 unit-resubmit 스위트 + stance E2E green + byte-identical 가드.

  검증 레벨 근거: 전체-파이프라인 run은 상류(findings→issues→stances→plan) non-empty일 때만 per-issue
  deliberation을 디스패치하는데 이를 만드는 기존 하니스가 없어 상류 6개 검증기 역설계가 필요하다(무관
  스테이지 테스트). 대신 §4-6a가 실제로 건드리는 **유닛-디스패치 경계**에서 실 stub 서브프로세스로
  `executeDeliberationResponseUnit`→실 retry 루프→`applyResubmitErrorSpec`→주입→heal/degrade를 전부
  관통(`deliberation-resubmit-dispatch.test.ts`). retry-loop 호출부는 stance와 공유 —
  full-pipeline 커버는 `core-api/runtime-pipeline-resubmit.test.ts`(stance)가 담당.

## 5. 스코프 결정 (사용자 확인 완료 — deliberation만)

- **deliberation만 이번 cut** (확정): 핸드오프 우선순위("deliberation_response 우선")·최소 surgical·
  일반화를 1개 유닛으로 증명. synthesis는 fast-follow.
- synthesis도 `assertAllowedRefs`(`source_refs_used`/`allowed_source_refs`)로 동형 거부 존재 →
  구조적으로 적용 가능하나 **필드명이 달라 별도 전략**(`evidence_refs` 아님). 일반화 기계를 재사용하면
  추가 비용은 분류기 패턴 1 + 허용집합 회수 1.

## 6. 검증 결과 (독립 적대 교차검증 3-KIND 완료)

green 스위트만으론 부족 → 서로 다른 KIND의 적대 리뷰어 3명(correctness·contract-preservation·
concept/scope)으로 각 load-bearing 주장 반증 시도. 결과·조치:

- **contract-preservation: SURVIVED.** stance 출력 byte-identical(경험적 3-케이스 확인), default-off
  전 output_format 보존, synthesis/`deliberation-resolution` 등 no-op 유지. 조치 불요.
- **scope(강등 불요): HOLDS.** deliberation은 검증-거부 전 경로가 `completeUnavailableDeliberationResponseUnit`
  비-halt degrade(cap 소진 유닛 `success:true` unavailable-완료). demotion 미확장이 정직.
- **[조치] on-disk 분류기 dead code 제거.** deliberation on-disk 거부는 post-pool에서 catch→degrade,
  frozen salvage는 submit-시점 오류만 담고, deliberation엔 stance와 달리 demotion 소비자가 없어
  on-disk 패턴이 wired-path 도달 불가였음 → `ON_DISK_DELIBERATION_UNSUPPORTED_REF_PATTERN` 제거,
  분류기를 submit-시점 전용으로 명시, 테스트를 "on-disk는 분류 안 함(→degrade)"로 정정.
- **[조치] 모듈 리네임 `stance-resubmit.ts` → `unit-resubmit.ts`** + docstring 갱신(유닛-불문 범위 반영).
  파일명이 deliberation 로직을 호스팅하는데도 stance-명이라 concept 이름 추적성 위배였음.

**Residual risk (선재·스코프 밖, 정직 기록):** resubmit 재시도 발동은 `failureKindFromMessage`(공유
retry-gating)를 거친다. 환각 evidence_ref 문자열이 `issue_id`/`schema_version`/`work_item_id`/
`boundary_notes`/`source_refs_used` 등 envelope 필드명 substring을 포함하면 거부 메시지가
`output_contract`로 오분류되어 재시도 자체가 억제 → 교정 resubmit 스킵, degrade(=OFF와 동일 결과).
이는 stance와 **공유된 선재 취약성**이며 §4-6a가 도입한 것이 아니다(최악도 "교정 못 하고 degrade",
correctness 회귀·halt 아님). robust fix는 재시도 게이트를 구조적 분류기(freeze 존재/분류기 매치)로
전환하는 것이나, 이는 공유 stance 경로까지 바꾸므로 §4-6a 스코프 밖 → 별도 항목으로 이연.
메모리: `onto-mcp-s4-backlog-validity-20260706`, `onto-mcp-post-impl-cross-verify-expectation`.
