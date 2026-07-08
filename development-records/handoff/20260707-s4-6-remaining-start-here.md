# §4-6 잔여 작업 start-here (2026-07-07)

## 0. 현 상태 한 줄 (이번 세션 재확립)

§4-6a(bounded-resubmit deliberation 확대) **머지 완료** — main `4ce1708`(PR #179, 4커밋, CI guards pass,
vitest 2520 PASS). 4라운드 다관점 교차검증 통과(design note §6). 다음 = **남은 §4-6 항목**.

## 1. §4-6a에서 확보된 것 (다음 작업의 재료)

- **유닛-불문 resubmit 기계**가 배선됨(`src/core-runtime/cli/unit-resubmit.ts`,
  `run-review-prompt-execution.ts`):
  - `applyResubmitErrorSpec`(dispatcher, output_format 라우팅 — 현재 stance·deliberation) `:1846`.
  - `buildResubmitErrorSpec`(유닛-불문, `ResubmitUnitDescriptor` `{kind:"stance"|"deliberation"}`).
  - `neutralizeSpecMarkers`(model-controlled 값의 마커 중화 — 모든 신규 전략이 재사용).
  - 유닛별 전략 패턴: 분류기 + 허용집합 회수 + 강등/degrade는 유닛 기존 경로 재사용.
- **default-off 보존 규약**: `review.execution.retry.resubmit.enabled` opt-in, OFF면 byte-identical.
- **핵심 설계 원리(확정)**: resubmit은 "계약-위반 출력을 오류명세로 교정 재요청 가능한" **submit-시점
  화이트리스트 거부**에만 적용. on-disk 거부는 post-pool→degrade라 대상 아님. 강등 기계는 stance 전용
  (deliberation은 기존 비-halt degrade 재사용).

## 2. 남은 §4-6 항목 (실코드 그라운딩 + 정정)

트래커: `development-records/plans/20260706-s4-backlog-work-order-and-d1-authority.md`(W1′/W2 행).

### 2-A. synthesis resubmit — **clean fast-follow 아님(이번 세션 정정, 실코드 근거)**

메모리/이전 판단은 "synthesis도 §4-6a 동형 fast-follow"였으나 **재도출 결과 결속 블로커 발견**:

- synthesis도 구조상 화이트리스트 거부 존재: `assertAllowedRefs`(`structured-output-tools.ts:1004`)
  → throw `submit_issue_synthesis_response.source_refs_used contains unsupported ref: REF`. 필드는
  `source_refs_used`/`allowed_source_refs`(evidence_refs 아님). degrade `completeUnavailableSynthesisResponseUnit`
  (`:4530`)·`executeSynthesisResponseUnit`(`:4603`) 존재 → 강등 기계 불요(deliberation과 동일).
  unit_id `synthesis:<issueId>`, output_format `issue-synthesis-response`, context
  `parseRuntimeIssueSynthesisSchemaContext`(`runtime-submit-context.ts:459`, `{allowed_source_refs}`).
- **블로커**: synthesis 거부 메시지가 `source_refs_used`를 포함 → `failureKindFromMessage`(`:1633`
  `normalized.includes("source_refs_used")`)가 **`output_contract`로 분류** → `shouldRetryUnitFailure`
  (`:1653-1660`) **false(비-재시도)** → in-loop resubmit 주입(`:3931`)이 **절대 발동 안 함**.
  대조: deliberation `evidence_refs` 메시지는 output_contract 패턴에 안 걸려 `executor_exit`(재시도)
  → 그래서 deliberation resubmit이 동작. **synthesis는 substrate 메시지 자체가 항상 poison-substring을
  포함**(rare 환각이 아니라 상시).
- 결과: synthesis resubmit은 flat 경로 **완전 dead**, nested-batch/resume attempt-0 salvage(`:3871`)로만
  **1-shot 부분 동작**. deliberation 같은 완전 교정 재시도 불가. → **synthesis는 2-C(retry-gating)에 결속.**

### 2-B. §4-6b `onto_review_continue` 기본화 — 독립(레인 A), UX/문서

- VALID-OPEN. 트래커 W2: "§4-2 방향 후". 성격은 UX/문서(기본값 정책 + 안내). retry-gating과 무관.
- 착수 전 §4-2 방향 결정 상태 확인 필요(메모리 `onto-mcp-s4-backlog-validity-20260706` §4-2 재스코프 참조).

### 2-C. retry-gating 하드닝(poison-substring) — synthesis의 **선행 인에이블러** + stance/delib 강건화

- 현재 resubmit 발동이 `failureKindFromMessage`(공유 retry-gating) 경유라, 화이트리스트 거부가
  output_contract로 오분류되면 재시도가 억제됨. deliberation/stance는 rare 환각 ref에서만(선재·저확률),
  **synthesis는 상시**.
- robust fix 방향(설계 필요): resubmit 재시도 게이트를 `failureKindFromMessage` 대신 **구조적 분류기**
  (classify\*/freeze 존재)로 전환 — 즉 "이 실패가 resubmit-교정 가능 클래스면 output_contract여도
  재시도 허용". 공유 stance 경로까지 바꾸므로 **설계-먼저 + default-off + 교차검증** 필수(§4-6a와 동급
  주의). 이걸 하면 synthesis resubmit이 자동 unblock + stance/delib도 완전 강건.

## 3. 권장 순서 (근거)

1. **§4-6b(2-B)** 먼저 — 독립·저위험·retry-gating 무관. 단 §4-2 방향 선확인.
2. **2-C(retry-gating) 설계** — synthesis 선행. 공유 경로라 §4-6a식 설계-먼저 + 적대 교차검증.
3. **synthesis resubmit(2-A)** — 2-C 후. 기계(dispatcher/builder/neutralize) 재사용 + synthesis 전략
   1개(분류기 `source_refs_used` 패턴, 허용집합 `allowed_source_refs` 회수, descriptor `{kind:"synthesis"}`).

대안: synthesis를 급히 원하면 2-C 없이 **nested-batch/resume 부분 동작만** 배선 가능하나, flat-dead를
명시 공지해야 함(불완전 기능은 정직하게 라벨). 권장은 2-C 선행.

## 4. Gotchas

- **synthesis "동형 fast-follow" 가정 금지** — 2-A의 output_contract 블로커를 실코드로 재확인부터.
- **retry-gating은 공유 경로** — stance 회귀 위험. default-off/byte-identical + 교차검증 규율 준수.
- **on-disk 클래스는 resubmit 대상 아님**(post-pool degrade) — 새 유닛도 submit-시점 전용.
- 라인번호는 §4-6a 머지로 이동함 — 앵커는 재검증(grep) 필수.

## 5. 참조

- 설계 SSOT: `development-records/design/20260704-review-unit-resubmit-and-limit-breaker-design.md`(설계 A).
- §4-6a 설계·교차검증 4라운드: `development-records/design/20260707-s4-6a-deliberation-resubmit-design.md`
  (§6 residual = 바로 2-C의 근거).
- 트래커/순서표: `development-records/plans/20260706-s4-backlog-work-order-and-d1-authority.md`.
- 메모리: `onto-mcp-s4-backlog-validity-20260706`(§4 전체 백로그·§4-6a 머지 기록·poison-substring),
  `onto-mcp-post-impl-cross-verify-expectation`(교차검증 규율).
- 기타 §4 VALID-OPEN(별개 레인): §4-2(reconstruct 자동재개, B4/B5 조율), §4-4(provider 스왑, B1/B7 종속),
  §4-6c(티어링 정책값, B5 머지 후). 메모리 참조.

## 6. clear 후 첫 커맨드 (모델 명시)

```bash
cd /Users/kangmin/Documents/onto-mcp && git fetch origin && git checkout main && git pull --ff-only && \
  cat development-records/handoff/20260707-s4-6-remaining-start-here.md
```

첫 프롬프트(모델 **Opus 4.8** 권장 — 2-C는 공유 경로 설계+교차검증, 2-A는 계약-반경 구현):
"이 start-here 읽고 §2 앵커를 현재 main에서 재검증하라. 특히 2-A의 synthesis output_contract 블로커
(`failureKindFromMessage:1633` + `shouldRetryUnitFailure`)를 실코드로 재확인해 synthesis가 clean
fast-follow가 **아님**을 확정한 뒤, §3 권장 순서로 진행할지(§4-6b 먼저 vs 2-C 설계 먼저) 판정하라.
설계-먼저, 구현 전 default-off·교차검증 규율 준수."
