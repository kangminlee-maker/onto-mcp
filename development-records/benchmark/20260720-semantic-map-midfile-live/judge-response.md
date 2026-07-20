SpawnGate: specifiability FRONTIER inline — 근거가 전부 프롬프트 내 세 자료이고, 조건별 가용 근거를 가르는 판단 자체가 이 컨텍스트를 요구하므로 위임 이득이 없습니다.

### Q1

**조건①**: 자료 X에는 `ReviewPromptExecutionResult` 인터페이스와 `pathToFileURL` import 등 "최상위 실행 함수가 뒤에 존재한다"는 간접 신호만 있고, 오케스트레이터 함수 정의 자체와 CLI 진입부는 잘린 범위 밖입니다. 함수 이름·라인·진입점 모두 X만으로는 확정할 수 없습니다. (answerable: no)

**조건②**: 자료 Y에서 `executeReviewPromptExecution`(6845–8495, export), `runReviewPromptExecution`(8496–8532, export), 그리고 8546–8556의 직접 실행 가드(`if (process.argv[1] && import.meta.url === pathToFileURL(...).href)`)가 확인됩니다. 파일 최대 함수이자 모든 단계 헬퍼 뒤에 오는 6845–8495가 오케스트레이터, 8496–8532가 CLI 진입 함수라는 배정은 이름·크기·위치에서 오는 강한 추론이지만, 내부에서 실제로 "계획 로드→lens→단계들→아티팩트 기록"을 수행하는지와 호출 연쇄(가드→run→execute)는 Y로 확인되지 않습니다. (answerable: partial)

**조건③**: 자료 Z가 역할을 보강합니다 — 최상위 노드 요약이 "렌즈 실행부터 … synthesis·continuation·재시도·검증·artifact 기록·CLI 종료까지 오케스트레이션한다"고 하고, 6517–8540 요약이 "strict-argument CLI entry points that delegate execution and print the JSON result", 8546 경계가 "asynchronous CLI launcher … direct invocation handling"을 서술합니다. 종합하면: 오케스트레이터는 `executeReviewPromptExecution`(6845–8495), CLI 직접 실행 시 8546–8556 가드가 `runReviewPromptExecution`(8496–8532)을 거쳐 위임합니다(단, Z는 non_authoritative 표기이므로 그 한도 내의 결론입니다). (answerable: yes)

### Q2

**조건①**: 성격 구분은 부분적으로 가능합니다 — (a) markdown/frontmatter/sidecar 검증 유틸(`validateMarkdownOutputContract`, `validateUnitOutputFile` 등), (b) 재시도·브레이커·리서밋 정책(`shouldRetryUnitFailure`, `RESUBMIT_UNIT_ROUTING`, breaker 헬퍼), (c)의 일부(`runIssueStanceMatrixCollectionDispatch`, `runIssueArtifactDispatch` 초반)가 X에 보입니다. 그러나 X에는 라인 번호가 없고 deliberation/synthesize 디스패치 함수와 (d) 오케스트레이터는 잘려 있어 라인 구간 지목이 불가능합니다. (answerable: partial)

**조건②**: Y로 라인 지목이 가능합니다. (a) 대략 1002–1596(마크다운/frontmatter/출력 검증) + 2221–2449(실행 메타데이터 파싱), (b) 대략 1607–2220(실패 분류·재시도 게이트·breaker 1738–1821·리서밋 라우팅 1925–1982 포함) + 재시도 실행 루프 4047–4338. **(c)** 유닛 종류별 디스패치: `runIssueStanceMatrixCollectionDispatch` 5067–5447, `runIssueArtifactDispatch` 5448–5740, `runControlledLensDeliberation` 5741–6298, `runSynthesisMapReduceDispatch` 6517–6844 → 약 **5067–6844**(중간 6299–6516은 synthesis 검증/메타데이터 집계 보조). **(d)** `executeReviewPromptExecution` **6845–8495**(+CLI 진입 8496–8556). (answerable: yes)

**조건③**: Z의 영역 요약들이 ②의 배정을 그대로 확인해 줍니다(1604–2022 "실패 처리·재제출 경로", 5039–5740 issue-stance 디스패치, 5741–6298 통제 숙의, 6517–8540 synthesis map-reduce와 CLI 진입, 490–1603 검증 보조). 답은 ②와 동일하며 신뢰도만 올라갑니다. (answerable: yes)

### Q3

**조건①**: 메커니즘의 정체는 X에서 상당 부분 보입니다 — `computeReviewFrontier`(review-execution-steps에서 import), "4f F3 — frontier plumbing for the A loop" 주석, `seedLensResultsForFrontier`(lens 결과를 frontier ledger에 시드), `mergeOutcomeIntoFrontierLedger`(각 outcome을 온디스크 execution-result에 병합해 frontier가 전진), 그리고 `pickPostLensFrontierRoute`(ready 유닛 집합에서 PRE_DELIBERATION issue-artifact ids → deliberation → problem-framing → synthesize 순으로 경로 선택, 해당 없으면 null). 즉 "온디스크 ledger 기반 frontier 루프"입니다. 다만 루프 본체와 종료 조건은 X 범위 밖이라 확인 불가입니다(route가 null이거나 ready 유닛이 소진되면 멈춘다는 것은 추론일 뿐). (answerable: partial)

**조건②**: Y가 `pickPostLensFrontierRoute` 5011–5038, frontier 병합 헬퍼 4938–4997을 확정하고, X 주석("frontier loop (F3) becomes their second caller")과 결합하면 루프는 `executeReviewPromptExecution`(6845–8495) 내부에 있어야 합니다. 그러나 수렴(종료) 조건은 여전히 자료에 없습니다. (answerable: partial)

**조건③**: Z(4981–6516 요약: "frontier 및 후속 디스패치 흐름 … 경로를 선택")가 메커니즘 서술을 보강하지만, 반복 종료 조건은 Z에도 없습니다. 결론: 메커니즘 = frontier ledger + `computeReviewFrontier` + `pickPostLensFrontierRoute` 라우팅 루프(오케스트레이터 내부), 종료 조건은 "ready 집합에 라우팅 가능한 유닛이 없어질 때(null route)"로 추정만 가능하고 근거 부재를 명시해야 합니다. (answerable: partial)

### Q4

**조건①**: 사용처 하나는 X에 직접 보입니다 — `runIssueStanceMatrixCollectionDispatch` 내부에서 `reviewDispatchBreakerFromProfile`로 stance 풀 breaker를 생성하고, 워커 루프에서 `recordNestedUnitOutcomeToBreaker`, 종료 시 `persistReviewDispatchIncompleteArtifact(batchLabel: "issue-stance")`를 호출합니다. 두 번째 풀(lens)은 `batchLabel: "lens" | "issue-stance"` 타입과 "리뷰 fan-out 풀(lens/stance)", "lens 풀과 동일 규약" 주석으로 존재만 증명되고, 호출 지점은 X에 없습니다. 라인 번호도 없습니다. (answerable: partial)

**조건②**: stance 풀 사용처는 5067–5447(`runIssueStanceMatrixCollectionDispatch`) 내부로 확정됩니다(생성은 nested 배치 직후, persist·트립 처리는 워커 Promise.all 이후 집계 구간). lens 풀 사용처는 Y에 별도 lens 디스패치 함수가 없고 X 주석이 lens phase를 "still inline"이라 하므로 `executeReviewPromptExecution`(6845–8495) 내부로 **추정**되지만 직접 근거는 없습니다. (answerable: partial)

**조건③**: Z도 5039–5740 요약에서 "동시성 워커·재시도·breaker"를 stance 영역에 귀속시켜 첫 사용처를 확인해 주지만, 오케스트레이터 영역 요약에는 breaker 언급이 없어 lens 풀 인스턴스화 지점은 여전히 추정(6845–8495 내 lens phase)에 머뭅니다. (answerable: partial)

### Q5

**조건①**: 하류 3단계(issue-stance/deliberation/synthesis)가 공유하는 진입점은 X에 정의가 보입니다 — `runNestedStageFirstAttempt`(스테이지 전체를 하나의 외부 nesting 배치 워커에 위임, "Downstream wide-stage nested first attempt")와 이를 유닛별로 결합하는 `unitOutcomeWithNestedFirstAttempt`이며, `executeIssueStanceUnit`·`executeDeliberationResponseUnit`·`executeSynthesisResponseUnit`이 모두 `nestedBatch` 인자로 이를 받습니다. lens 풀 쪽은 X의 import 목록에 있는 `executeReviewViaNestedBatch`(./nested-batch-dispatch.js)가 X 가시 범위에서 미사용이라는 점에서 lens 전용 진입점으로 **추정**될 뿐, 호출 지점은 보이지 않습니다. 라인 번호 없음. (answerable: partial)

**조건②**: Y로 공유 진입점의 정의 위치가 확정됩니다 — `runNestedStageFirstAttempt` 4372–4473, `unitOutcomeWithNestedFirstAttempt` 4489–4571 (이 파일 내). lens 풀의 `executeReviewViaNestedBatch` 사용은 여전히 import 기반 추론이고, 정의는 외부 모듈 `./nested-batch-dispatch.ts`라는 것까지만 말할 수 있습니다(정의 라인은 자료 밖). (answerable: partial)

**조건③**: Z는 stance("nested 최초 시도"), deliberation("runs nested or concurrent deliberation workers"), synthesis("nested-stage fallback")의 공유 패턴은 확인해 주지만 lens 풀의 진입 함수명은 어디에도 없습니다. 결론(하류 3단계 = `runNestedStageFirstAttempt`+`unitOutcomeWithNestedFirstAttempt`, lens = `executeReviewViaNestedBatch` 추정)은 유지하되 lens 측은 미확증입니다. (answerable: partial)

### Q6

**조건①**: X에는 리터럴 step 번호가 하나도 없습니다 — 가시 범위의 `emitReviewProgress` 호출은 모두 `issueArtifactProgress(...).step`처럼 `issueArtifactSpec`에서 파생된 값이고, step 9/10/12와 1/2/3의 발행 지점(함수/라인)을 특정할 근거가 없습니다. (answerable: no)

**조건②**: 정확한 발행 지점은 여전히 어떤 자료에도 없지만(자료 Y는 시그니처만 담음), 구조적 설명은 가능합니다: 후반 단계 step(9/10/12 등)을 발행할 후보는 단계 헬퍼인 `runControlledLensDeliberation`(5741–6298)·`runSynthesisMapReduceDispatch`(6517–6844)이고, 초기 step(1/2/3)은 오케스트레이터 `executeReviewPromptExecution`(6845–8495) 서두일 수밖에 없습니다. 물리적 선후가 실행 순서와 어긋나는 이유는 명확합니다 — 단계별 디스패치 헬퍼(후반 step 발행자)가 파일에서 오케스트레이터보다 **앞에** 정의되고, 실행은 뒤에 정의된 오케스트레이터가 초기 step을 먼저 찍은 뒤 앞쪽 헬퍼들을 호출하는 순서이기 때문입니다. 단, "step 9/10/12가 정확히 그 함수·그 라인"이라는 특정은 자료로 검증 불가입니다. (answerable: partial)

**조건③**: Z에도 step 리터럴 정보는 없습니다("진행 기록" 수준의 언급뿐). ②의 구조적 설명까지가 한계입니다. (answerable: partial)

### Q7

**조건①**: 위임 대상은 X에서 직접 확인됩니다 — `runIssueArtifactDispatch` 첫 분기가 `artifactId === "issue-stance-matrix"`일 때 `runIssueStanceMatrixCollectionDispatch`로 반환-위임하며, 그 전담 함수 정의도 X에 (바로 위에) 전체가 보입니다. 그러나 정의 라인 번호와 오케스트레이터 측 호출 지점은 X 범위 밖입니다. (answerable: partial)

**조건②**: 정의 위치 확정 — `runIssueStanceMatrixCollectionDispatch` **5067–5447**, 위임 원점 `runIssueArtifactDispatch` **5448–5740**. 오케스트레이터에서의 두 호출 시점(사전 deliberation 아티팩트 vs problem-framing)은 `executeReviewPromptExecution`(6845–8495) 내부라는 것까지만 말할 수 있고, 구체 호출 라인은 Y가 호출 지점을 색인하지 않아 알 수 없습니다(라우팅 구조상 `pickPostLensFrontierRoute`의 `issue_artifact`/`problem_framing` 두 route가 이 함수로 이어진다는 정합적 추론까지). (answerable: partial)

**조건③**: Z는 5067 경계를 "adversarial_confirmed"로 표시해 5039–5066(진행 상태·출력 경로 결정)과 5067 이후(stance 디스패치)의 분리를 확증하지만, 호출 라인은 Z에도 없습니다. (answerable: partial)

### Q8

**조건①**: 두 함수 모두 X 범위 밖이라 시그니처·전달 인자 비교가 전혀 불가능합니다. (answerable: no)

**조건②**: Y는 각 함수의 첫 줄 시그니처(`export async function …(`)와 스팬(8496–8532가 소형 래퍼라는 점)만 제공하고 파라미터 목록은 담지 않으므로, "무엇을 채워 넘기고 무엇을 누락하는가"를 판정할 근거가 없습니다. (answerable: no)

**조건③**: Z도 "strict-argument CLI entry points that delegate execution and print the JSON result"라는 역할 서술뿐 파라미터 열거가 없습니다. 질문이 예시한 `teamleadExecutorConfig`·`continuationPlan` 등은 자료에서 타입 import(`ReviewContinuationPlan`, `ReviewExecutionProfile`)로 존재만 확인될 뿐 시그니처 소속을 증명할 수 없습니다. 누락 여부는 세 자료 어느 조합으로도 판정 불가 — 실제 파일 확인이 필요합니다. (answerable: no)

## 요약 표

| 질문 | 조건① (X) | 조건② (X+Y) | 조건③ (X+Y+Z) |
|---|---|---|---|
| Q1 오케스트레이터·진입점 | no | partial | yes |
| Q2 영역 구분·라인 | partial | yes | yes |
| Q3 frontier 라우팅 루프 | partial | partial | partial |
| Q4 breaker 두 사용처 | partial | partial | partial |
| Q5 nested-workers 진입점 | partial | partial | partial |
| Q6 progress step 순서 역전 | no | partial | partial |
| Q7 stance 위임·호출 지점 | partial | partial | partial |
| Q8 CLI→오케스트레이터 파라미터 | no | no | no |

전반적 패턴을 한 줄로 요약하면: X는 정책·검증 계층의 "왜"를, Y는 전체 골격의 "어디"를 주지만, 오케스트레이터 내부의 호출 지점·루프 종료 조건·시그니처처럼 **본문이 필요한 사실**은 X+Y+Z를 다 합쳐도 닿지 않으며(Q3·Q6·Q8), Z는 역할 서술로 배정 신뢰도를 올려줄 뿐 새 지점 사실을 추가하지는 못합니다.