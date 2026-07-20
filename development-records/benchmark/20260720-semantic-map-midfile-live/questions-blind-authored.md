# 실험2 고정 질문 (블라인드 저작 보존본, 2026-07-20)

> 저자: 문맥-무 서브에이전트 `exp2-question-author` — 대상 파일만 열람(다른 파일·문서·git
> 이력 무접촉), 실험 설계·arm 산출물·operator 컨텍스트 무접촉 상태에서 저작.
> 저작 지시: "앞부분(첫 ~4,500줄)만 읽어서는 답할 수 없는, 전-파일/후반부 지식 요구 질문 8문
> (1~5 = 1차 기준 후보, 6~8 = 심화)". [근거] 라인 구간은 저작 시점 검증용이며 judge 패킷에는
> 포함하지 않는다.
> 대상: `src/core-runtime/cli/run-review-prompt-execution.ts`, 저작 시점 content sha 선두
> `d9253eebca3318ec` — **본시험 사전등록 시 sha 재확인 필수**(드리프트 시 [근거] 라인 앵커
> 재검증 후 재등록).
> 지위: 사전등록 전 보존본. 본시험 PROTOCOL이 이 파일을 참조-핀하면 그 시점부터 고정 질문이
> 되며 사후 추가·선택 금지가 적용된다.

1. 이 파일은 리뷰 실행 파이프라인에서 정확히 무엇을 하는 최상위 함수(오케스트레이터)를 통해 전체 생애주기(계획 로드 → lens 디스패치 → 이슈 아티팩트/deliberation/synthesize 단계 → 최종 실행결과 아티팩트 기록)를 구성하는가? 그 오케스트레이터 함수의 이름과 시작~종료 라인을 밝히고, 이 파일이 CLI로 직접 실행될 때 그 함수에 도달하기까지의 진입점 함수 이름도 함께 답하라. [근거: 6846-8495(오케스트레이터 본문), 8497-8555(CLI 진입점 체인)]

2. 파일 전체를 훑었을 때 코드가 대략 어떤 성격의 영역들로 나뉘는지 말하라 — (a) 출력 계약 검증/파싱 유틸, (b) 재시도·브레이커·리서밋(resubmit) 정책, (c) 유닛 종류별(issue-stance-matrix, issue-artifact, deliberation, synthesize) 개별 디스패치 함수, (d) 이들을 순서대로 묶는 최상위 오케스트레이터. (c)와 (d)가 각각 대략 어느 라인 구간에 위치하는지 지목하라. [근거: 5068-5449, 5449-5742, 5742-6305, 6518-6846 (개별 디스패처), 6846-8495 (오케스트레이터)]

3. lens phase가 끝난 뒤 이슈 아티팩트(finding-ledger 등)·deliberation·problem-framing·synthesize 단계가 실행되는 순서는 고정된 순차 코드가 아니라 반복문 기반의 라우팅 메커니즘으로 결정된다. 이 메커니즘의 이름(또는 핵심 함수)과 동작 방식, 그리고 반복이 멈추는(convergence) 조건을 설명하라. [근거: 5011-5038 pickPostLensFrontierRoute, 7836-8259 frontier 루프 본문]

4. 파일 앞부분(1738~1821줄)에 정의된 dispatch breaker 헬퍼(reviewDispatchBreakerFromProfile / recordNestedUnitOutcomeToBreaker / persistReviewDispatchIncompleteArtifact)는 파일 뒷부분에서 서로 다른 두 개의 유닛 풀(pool)에 대해 각각 독립적으로 인스턴스화되어 쓰인다. 두 사용처가 각각 어느 함수/라인 대역에 있고 어떤 유닛 종류를 감시하는지 밝혀라. [근거: 1738-1821(정의), 5068-5449 특히 5274(issue-stance pool), 7058-7660(lens pool)]

5. lens 유닛 풀과 issue-stance/deliberation/synthesize 유닛 풀은 각각 nested-workers 모드(외부 워커에 유닛들을 배치 위임하는 모드)를 서로 다른 진입점으로 통합한다. lens 풀이 쓰는 함수와 나머지 세 단계가 공통으로 쓰는 함수(및 그 정의 위치)를 구분해서 답하라. [근거: 7360-7610(lens, executeReviewViaNestedBatch) vs 5186-5280 / 5913-5970 / 6710-6770(stance/deliberation/synthesize, runNestedStageFirstAttempt) — 공유 헬퍼 정의는 4372-4598]

6. 리뷰 진행률 로그(`[review progress] N/M ...`)의 step 번호 리터럴은 파일을 위에서 아래로 읽을 때 실행 순서와 다르게 등장한다. step 9, 10, 12가 발행되는 함수/라인과 step 1, 2, 3이 발행되는 함수/라인을 각각 밝히고, 두 그룹의 파일 내 물리적 위치 선후 관계가 실제 실행 순서와 왜 어긋나는지 설명하라. [근거: 5819-5823(step9), 6213-6217(step10), 6772-6785(step12) — 모두 6846줄에서 시작하는 오케스트레이터보다 앞선 물리적 위치의 헬퍼 함수 내부; 6915-6976(step1~3, 오케스트레이터 본문)]

7. `runIssueArtifactDispatch` 함수는 오케스트레이터에서 서로 다른 두 시점(사전 deliberation 단계용 아티팩트들과 problem-framing 단계)에 반복 호출된다. 이 함수는 artifactId가 "issue-stance-matrix"일 때 내부적으로 별도의 전담 함수로 위임한다. 그 위임 대상 함수 이름과 정의 위치, 그리고 오케스트레이터에서 이 두 함수가 호출되는 지점(라인)을 밝혀라. [근거: 5068-5083 및 5466-5478(위임 정의/호출), 5449-5742(runIssueArtifactDispatch), 오케스트레이터 호출부 7890, 8057]

8. `runReviewPromptExecution`(CLI argv 파싱 경로)이 오케스트레이터(`executeReviewPromptExecution`)를 호출할 때 실제로 채워 넘기는 파라미터와, 오케스트레이터 시그니처가 받을 수 있는 전체 파라미터 목록(teamleadExecutorConfig, reviewExecutionProfile, continuationPlan 등)을 비교하라. CLI 경로가 누락하는 파라미터가 있는가? [근거: 6846-6858(오케스트레이터 파라미터 시그니처), 8497-8532(CLI 경로의 실제 호출 인자)]
