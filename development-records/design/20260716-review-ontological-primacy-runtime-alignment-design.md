# review 온톨로지-우선성 런타임 정렬 — high-level 설계 (2026-07-16)

> 상태: **Approved** (2026-07-17 owner 승인 — 구현 착수·(b) 옵션 1 재서열·라이브 A/B
> code+spreadsheet 실측 확정. INV-CFG-1 간접승인 요건 충족: 이 SSOT 명시 + owner 승인)
> 백로그 SSOT: `development-records/design/20260715-review-ontological-primacy-runtime-alignment-backlog.md`
> handoff: `development-records/handoff/20260716-review-runtime-alignment-start-here.md`
> 성격: 설계 문서. 구현은 owner 승인 후. INV 접촉(프롬프트 계약·설정 키 추가) →
> default-off + 사용자 확인 게이트 필수.

## 0. 목표 / 완료 조건

`onto_review`의 owner 확정 정체성 — artifact의 **온톨로지적 무결성**(개념·권위·목적의 논리
일관성) 검토 — 에 런타임 집행 층(프롬프트 패킷·severity 지침·deliberation precedence)을
정렬한다. artifact 형식은 온톨로지를 읽어내는 담체 레이어이며, 작동 버그 탐색은 별도 도구
스코프다(비목표 유지).

완료 조건(falsifiable, §7): flag-off byte-identical 증명 + flag-on에서 4개 정렬 지점의
텍스트-검증 가능한 변형 + 기존 스위트/drift 테스트 green.

## 1. 설계 입력 — 재확증된 현재 상태 (2026-07-16 실코드)

> 라인 앵커 기준: main `2694882` (파일 blob 9358c28). 동시 세션의 adaptive-effort 편집
> (embed-budget witness, 미커밋)이 `materialize-review-prompt-packets.ts:691` 이후를 +39줄
> 밀고 있음 — 정렬 앵커 내용(의무 prose·sidecar 계약·profile summary)은 비접촉 확인.
> 구현 착수 시 앵커 재-grep 필요.

handoff 앵커 표에 더해, 이 설계 세션에서 새로 확인한 load-bearing 사실:

| # | 사실 | 위치 | 설계 함의 |
|---|---|---|---|
| F1 | **lens 패킷에는 severity ladder가 없다.** lens는 ladder 정의 없이 `severity_hint`를 낸다. sidecar contract는 필드 형태만 지정 | `materialize-review-prompt-packets.ts:283-320` | (c)의 1차 앵커 지점은 lens sidecar contract — severity 판단 지침이 **비어 있어** 추가는 순수 additive |
| F2 | severity ladder는 issue-artifact 공통 프롬프트에만 렌더. 문구는 happy-path/사용자-달성 프레이밍 | `issue-artifact-runtime.ts:2761-2777` | (c)의 2차 앵커 지점. ladder 문구는 ux-contract §4·deliberation-contract §2와 **3중 미러** (drift 주의) |
| F3 | **precedence ladder는 런타임 강제가 아니다.** 계약 §"Priority order"에만 있고, deliberation-plan 프롬프트에는 enum 나열 순서(correctness 첫째)만 노출. 런타임 검증은 `priority`=양의 정수 + enum 멤버십뿐 | 계약 `issue-stance-deliberation-contract.md:491-498`; 프롬프트 `issue-artifact-runtime.ts:3071-3079`; 검증 `:3814-3815` | (b)는 계약 텍스트 + 프롬프트 텍스트(ladder 블록)만으로 성립. enum 토큰·스키마·검증 불변 — 단 허용-값 열거는 절단 금지 (E-3, §3-(b)) |
| F4 | deterministic conflict hint는 `root_hypothesis`/`action_or_severity`/`evidence_gap`/`stance_conflict`/`partial_overlap`만 생성. correctness·purpose_value 배정은 순수 LLM 판단 | `issue-artifact-runtime.ts:1718-1730` | (b)에서 hint 로직은 접촉 불필요 |
| F5 | purpose 권위 아티팩트 `review-value-alignment-criteria.yaml` 존재 — 단 **현행 producer는 항상 단일 criterion(user-request-intent) = `interpretation.intent_summary` 축어 재서술**이고, ambiguity 없으면 자동 confirmed(사용자 재가 없음). 같은 문장이 lens 패킷에 이미 `request_summary:`로 존재. issue-artifact 단계에는 이 신호가 **부재** | producer `materialize-review-prompt-packets.ts:606-647`(단일 criterion :627, 자동 confirm :611-638); lens 패킷 `:1237`·request_summary `:1208`; 실예 `.onto/review/20260714-147a9121/...criteria.yaml` | (c)의 앵커는 개념 신설 0이되, lens 쪽 순수 권위 추가분 ≈ 0 (지시문 변화가 실질). **실질 레버리지는 issue-artifact/problem-framing 임베드**(신호가 없던 곳에 공급). 앵커는 정의적("declared purpose = criteria")이 아니라 **가산적**이어야 함 (E-2) |
| F6 | code 의무 절 2가 논리-무결성(type/contract mismatch)과 순수-작동(edge-case/null/failure-mode)을 한 문장에 혼재; 절 3은 goal-scoped. 전 렌즈(axiology 포함) 무조건 도달 | `materialize-review-prompt-packets.ts:123-128` (blob 9358c28 기준; 워킹트리 현재 +1), 주입 lens 템플릿 무조건 호출(워킹트리 :1269)→`:206` | (a) 대상. spreadsheet(129-174)는 goal-projected 구조-무결성 = 이미 정렬, **불변** |
| F7 | settings 관례: opt-in은 `{ "enabled": bool }` 중첩 객체 (`resubmit`, `dispatch_breaker`) | `.onto/settings.json` | 플래그 형태 선례 있음 |
| F8 | **issue-artifact 액터는 value-alignment criteria를 읽을 수 없다**: `issueArtifactAllowedReadRefs`는 review_target_profile + 선행 issue 아티팩트 + lens 출력(+problem-framing의 deliberation 출력)만 허용. criteria·interpretation은 경계 밖 | `issue-artifact-runtime.ts:2647-2675` | (c) c-2/c-3의 앵커는 읽기 지시가 아니라 **런타임의 결정론 프로젝션 임베드**여야 함 (§3-(c)) |
| F9 | 전체-패킷 골든/스냅샷 테스트는 부재. 존재하는 것은 렌더러 함수 단위 유닛 테스트(spreadsheet 의무 honesty R3 포함) | `materialize-review-prompt-packets.test.ts:15-241` | §7-1의 byte-identical 증명은 변경 렌더러 함수 단위 동등성 테스트로 수행 (렌더러=순수 함수라 충분) |

❌ **불변 경계(재확인)**: 결정론 severity-predicate + semantic=disclosure 경계
(`material-issue-contract.md` §1 :21-26, §4)는 의도된 llm-capability-boundary. predicate·
machine block·admission disqualifier는 이 설계에서 **일절 접촉하지 않는다**.

## 2. 설계 원칙 (전 항목 공통)

1. **prose-only 정렬**: 스키마·enum 토큰·필드·predicate·검증 로직 불변. 변경 대상은
   LLM에게 전달되는 지침 텍스트(패킷 prose·프롬프트 블록·계약 ladder 문구)와 그 나열
   순서뿐이다. → 출력 계약 INV 비접촉.
2. **default-off, blast-radius 기준 2-플래그 (E-4 반영)**: 하나의 네임스페이스
   `review.execution.ontological_anchoring` 아래 두 sub-플래그, 모두 default false(이름은
   구현 시 naming charter 대조):
   - `obligations.enabled` — (a)+(B): `materialKindReviewObligations`의 per-kind prose.
     blast radius = 해당 kind(code·database)뿐.
   - `judgment_anchor.enabled` — (c)+(b): kind-공용 판단 프레이밍(sidecar 계약·Severity
     Contract·problem-framing·deliberation ladder). blast radius = 전 kind.
   근거: 원래의 반-분할 논거(검증 매트릭스 폭발)는 4-분할에 대한 것이고, per-kind 변경과
   cross-kind 변경을 한 스위치에 묶으면 owner가 code에서 검증한 뒤 켠 플래그가 검증 안 된
   spreadsheet/database 리뷰에 (c)를 실어 보낸다(E-4). 2-분할은 매트릭스(2×2)를 유지하면서
   가장 검증이 필요한 표면을 격리한다. off = 현행 byte-identical(diff로 증명)은 두 플래그
   모두에 적용.
3. **기존 개념 재사용**: purpose 앵커 = 기존 `review-value-alignment-criteria.yaml` +
   `interpretation.yaml`. 새 아티팩트·새 필드·새 enum 없음. (유일 후보였던
   `affected_purpose_ref` optional 필드는 **이번 스코프 제외** — §5 tradeoff.)
4. **계약 문서는 병기 후 승격 단일화**: 계약 md는 플래그로 게이트할 수 없으므로, 구현 시
   해당 절에 "flag-on 정렬 의미"를 명시 병기하고, 플래그 default-on 승격 시 단일화한다.

## 3. 설계안 — 4개 정렬 지점

### (c) severity 부여·problem-framing을 declared purpose에 앵커 — P1

§1이 지정한 "온톨로지 판단의 자리"(severity 부여·problem-framing 구조화)에 권위 소스를
공급한다. predicate는 불변; 바뀌는 것은 **severity 판단이 무엇을 기준으로 이뤄지는가**다.

⚠ **kind-공용 주의 (E-1)**: c-1(sidecar 계약)·c-2(Severity Contract 블록)는
`target_material_kind` 분기가 없는 **전 kind 공용** 블록이다. 따라서 (c)의 문구는
kind-중립이어야 하며, code-도메인 전제(예: "별도 도구 스코프" carve-out)를 공용 블록에
넣지 않는다. "spreadsheet 불변"은 의무 prose에 한정된 주장이고, severity 앵커링은 전
kind에 닿는다는 것을 명시 인지 — 검증도 per-kind로 한다(§7-3c).

⚠ **가산적 앵커 (E-2)**: 현행 ladder의 전체론적 purpose 모델("happy path"·"supported
user group/environment/data condition/execution path"·"trust/auditability/…")을 **유지**하고,
criteria 앵커는 "declared purpose의 **명시 소스로 함께 가중**하라"는 가산 지침으로 넣는다.
"declared purpose := criteria 한 줄"로 **정의하지 않는다** — 정의화는 purpose 개념을 한 줄
intent로 좁혀 "목적-무관" 집합을 부풀리는 역효과(E-1과 결합 시 비-code kind의 구조 결함
강등)를 낳는다. criteria producer의 다기준화(진짜 multi-criterion)는 별도 후속 트랙.

- **c-1 (lens 원점 앵커, F1)**: `renderLensSidecarOutputContract`에 severity 판단 지침
  추가: `severity_hint`는 현행 ladder 의미(선언된 목적 대비 신뢰 훼손) 아래에서 판단하되,
  confirmed value-alignment criteria와 interpretation을 declared purpose의 명시 소스로 함께
  가중하고, `materiality_basis.affected_purpose`는 그 선언된 purpose 소스에 앵커하라
  (자유텍스트 유지, criterion 인용 권장). 동시에 value-alignment criteria를 "Optional"에서
  severity 판단의 참조 입력으로 승격 명시(읽기 refs에는 이미 포함, F5).
- **c-2 (issue-artifact ladder 재앵커, F2·F8)**: `## Severity Contract` 블록의 blocker/high/
  medium 정의(전체론적 목적-달성 프레이밍)를 **유지**하며 두 가지를 추가: (i) confirmed
  value-alignment criteria/interpretation을 declared purpose의 명시 소스로 **함께 가중**
  (가산적 — 정의 대체 아님, E-2), (ii) severity는 **선언된 목적 대비 신뢰 훼손 정도**를
  측정한다(현행 ladder 의미의 명시화). **스코프 배제는 severity 축이 아니라 admission
  축으로**: 선언된 목적과 무관한 작동 결함을 low/info로 강등하라는 지시는
  두지 않는다 — 그런 결함은 정직한 severity를 유지한 채 problem-framing의 admission-context
  필드(`judgment_state: outside_boundary`/`closure_obligation: out_of_scope`)로 실격시켜
  disclosed 보존한다(계약 §3·§5의 보존 경로; 설계 리뷰 Finding B-1 반영). **앵커 메커니즘
  (F8)**: issue-artifact 액터는 criteria 파일을 읽을 수 없으므로, 읽기 지시가 아니라
  **런타임이 확인된(confirmed) criteria의 criterion_id+statement를 Severity Contract 블록에
  결정론 프로젝션으로 임베드**한다(읽기 경계 불변·capability-surface 원칙 정합: 결정론 값
  주입은 tools/code 소유). criteria가 비어있거나 미확인이면 임베드 절을 생략하고 현행 문구
  유지(앵커가 허공을 가리키는 상태 금지).
- **c-3 (problem-framing)**: problem-framing 프롬프트 케이스에 동일 앵커 문구 1절 추가
  (closure 분류가 declared purpose 기준으로 이뤄지도록). 앵커 메커니즘은 c-2와 동일
  (프로젝션 임베드, F8). 추가로 c-2의 admission 라우팅을 이 지점에서 완성: 선언된 목적과
  무관하지만 실재하는 결함은 severity를 보존한 채 admission-context 필드로 스코프-실격
  분류하라는 지침을 명시(계약 §3 표의 의미 그대로).
- 계약 미러(ux-contract §4·deliberation-contract §2)는 §2-4 규칙대로 병기.

### (a) code 패킷의 순수-작동 절 분리·종속화 — P0

`materialKindReviewObligations` code 케이스(F6)를 3절 구조로 재작성 (flag-on 시):

1. *(유지)* 담체 절: declared types/API/contracts/observable behavior를 review evidence로.
2. *(주절 — 논리-무결성)*: 구현이 선언된 계약을 충족하는가(satisfiability) — type/contract
   mismatch는 여기 소속.
3. *(종속절 — 작동 경로는 증거 채널)*: edge-case/null·undefined/failure-mode 경로는
   독립 버그-헌트 의무가 아니라 **선언된 계약이 성립하는지의 증거 채널**로 점검.
4. *(materiality 절 리프레이밍)*: "visible correctness or runtime-contract failure" →
   "선언된 review goal/purpose를 위반하는 계약 불충족" (goal-scoping은 이미 있음 — 유지).

database(180-184)도 동형 처리: unsafe query/migration/integrity를 "스키마·제약이 선언하는
데이터 계약의 충족 증거"로 종속화. spreadsheet **불변**(이미 정렬, handoff ❌ 준수).

대안 비교 — 렌즈-인지 주입(작동 절을 logic/structure 렌즈에만): 정밀하나 per-lens 조건 분기
신설 = 표면 증가, 그리고 패킷이 이미 "Use only your lens-specific perspective"로 렌즈-중립
prose를 각 렌즈가 자기 관점으로 소비하게 설계됨. **prose 종속화 채택, 렌즈-인지 기각.**

### (B) material-kind 의무의 대칭 스파인 — P0 ((a)와 동일 편집)

모든 kind의 의무를 공통 3-스파인의 인스턴스로 정렬: (1) 이 형식에서 무엇이 evidence인가
(담체), (2) 이 형식에서 개념·권위·목적이 어떻게 표면화되는가, (3) 형식-특수 무결성 점검은
(2)에 종속. 실제 텍스트 변경은 code·database뿐이고(document/mixed/unknown은 이미 개념형,
spreadsheet 불변), 스파인은 코드 추상화(공통 템플릿 함수) 없이 **prose 의미 정렬**로만
구현한다 — 함수 구조 리팩터는 비목표(surgical).

### (b) deliberation precedence 재서열 — P2, owner 옵션 결정 필요

F3에 의해 계약 ladder 텍스트 개정 + 프롬프트에 precedence ladder 블록 추가만으로 성립.
enum 토큰·스키마·검증 불변; 허용-값 열거는 그대로 둔다(하단 E-3).

- **옵션 1 (권장)**: ladder 재서열 —
  `1 root_hypothesis / 2 purpose_value / 3 domain_constraint / 4 correctness_or_blocking_execution(정의를 "선언된 목적 달성을 차단하는 실행·계약 충돌"로 rescope) / 5 action_or_severity / 6 partial_overlap_or_cluster_scope`.
  근거: 계약 §1의 완료 단위가 root-cause issue이므로 root 해석 충돌이 최우선이라는 것이
  계약 자체와 정합; purpose가 correctness 위 = 정체성 정렬. 다중 충돌 시 목적 프레이밍이
  correctness에 종속되는 현재 효과가 역전된다.
- **옵션 2 (완화)**: 순서 유지, #1 정의만 "선언된 목적을 차단하는" 으로 rescope.
  correctness-#1의 실용 근거(작동 차단 이슈의 숙의 가치)를 보존하면서 목적-앵커만 주입.
- **두 블록의 분리 (E-3)**: "Allowed conflict_type values" 나열(:3071-3079)은 **허용-값
  열거**라 8개 토큰 전부를 유지해야 한다(ladder 밖 `evidence_gap`/`stance_conflict`는
  런타임 hint가 결정론 생성해 LLM에 건네는 값 — 절단 시 hint와 프롬프트가 모순).
  precedence ladder(6항, 순서 있음)는 flag-on 시 **별도 블록으로 명시 렌더**한다(현재는
  계약에만 있어 LLM이 못 본다 — F3의 부수 발견). §7-4의 assert는 precedence 블록에
  스코프하고, 허용-값 열거에 8개 토큰 전부 잔존을 부정 통제로 assert한다. 정확히 하면
  (b)는 "ladder 블록 추가(+계약 ladder 텍스트 개정)"이지 허용-값 열거의 재배열이 아니다.

## 4. INV 접촉점과 게이트

| 접촉 | 내용 | 게이트 |
|---|---|---|
| INV-CFG-1 | 새 설정 키 `ontological_anchoring.obligations.enabled`·`ontological_anchoring.judgment_anchor.enabled` (모두 default false) | 이 설계 SSOT 명시 + owner 승인/cut 지시 (간접승인 규약) |
| 프롬프트 계약 문서 | ux-contract §4·deliberation-contract §2/§Priority·(a)(B) 관련 서술 병기 | 구현 PR에서 diff로 노출, 승격 시 단일화 |
| materiality predicate / 출력 스키마 / enum | **비접촉** (설계 원칙 §2-1, §2-3) | — |
| flag-off 경로 | byte-identical | 변경 렌더러 단위 동등성 테스트로 증명 (§7-1, F9) |

배선 주의: `materialKindReviewObligations`·`renderLensSidecarOutputContract`는 순수 함수,
issue-artifact 프롬프트 빌더도 settings 직접 접근이 없다. 플래그는 settings → execution
plan/binding → 렌더러 인자로 스레딩해야 하며, 이 배선이 구현의 실질 작업량이다(P0에서 확립).

## 5. Tradeoffs / 기각안

- **`affected_purpose_ref` 구조 필드 신설 (기각, 후속 후보)**: criterion_id 참조를 구조화하면
  결정론 검증(존재하는 criterion인가)이 가능해지나, 출력 계약 additive 변경 + lens 부담 증가.
  concept economy상 기존 free-text 지침 강화가 먼저다. flag-on 실측에서 앵커 문구만으로
  불충분이 확인되면 그때 승격.
- **predicate에 온톨로지 절 추가 (기각 확정)**: llm-capability-boundary 위반. owner
  경계-이동 결정 없이는 재제안 금지 (백로그 ❌ 항목).
- **렌즈-인지 의무 주입 (기각)**: §3-(a) 대안 비교 참조.
- **단일 플래그 (기각, E-4로 개정)**: 초안은 단일 플래그였으나 per-kind/cross-kind blast
  radius 불일치로 2-플래그로 개정(§2-2). 4-분할은 여전히 기각(매트릭스 폭발). (b)는 owner
  옵션 결정이 남아 P2로 순서만 분리하되 `judgment_anchor` 플래그에 속한다.
- **severity ladder 3중 미러 해소 (스코프 외 기록)**: ux-contract §4·deliberation-contract
  §2·런타임 블록이 같은 ladder를 3곳에 서술. 이번 변경으로 4곳이 되지는 않으나(런타임 블록이
  프롬프트 유일 렌더), 미러 자체의 단일화는 별도 documentation-hygiene 과제로 남긴다.

## 6. 구현 프로세스 설계 (stage 2 초안)

| 단계 | 내용 | 검증 |
|---|---|---|
| P0 | 2-플래그 배선(settings→plan→렌더러; 렌더러 시그니처는 optional-default-off 인자로 — 기존 호출부·R3 테스트 무파손) + (a)+(B) prose 변형 (`obligations`) | 렌더러 단위 off-동등성; flag-on 유닛(kind별 obligations 텍스트 assert, 절 종속화 assert) |
| P1 | (c) c-1/c-2/c-3 앵커 문구 + criteria 프로젝션 임베드 (`judgment_anchor`) | flag-on 유닛(§7-3·3b·3c); drift 테스트 green |
| P2 | (b) — owner 옵션 결정 후 계약 ladder + precedence 블록 렌더 (`judgment_anchor`) | §7-4 (ladder 블록 + 8-토큰 부정 통제) |
| P3 | 계약 문서 병기 업데이트 + IMPLEMENTATION_MAP 갱신 | 문서-런타임 정합 육안 + 링크 체크 |

- 전 단계 공통: 기존 스위트 green. flag-on 스모크는 fixture/mock 경로로 패킷 생성 후 신규
  prose 존재를 assert(공허 통과 방지: 대상 패킷 수 > 0 확인).
- 라이브 A/B(동일 target, flag on/off 각 1회, severity 분포·framing 변화 관찰)는 owner
  spend라 **선택** — M3 벤치 인프라 재사용 가능, 승격 결정 입력으로 권장. 단
  `judgment_anchor`의 default-on 승격 근거에는 **code 외 kind(spreadsheet 최소 1회) 포함**을
  요구한다(E-1/E-4 — cross-kind 표면을 code 검증만으로 승격하지 않음).
- 구현 전 게이트: 이 설계에 대한 독립 적대적 다관점 리뷰(handoff 단계 3) → material 0 →
  owner 승인.

## 7. 완료 기준 (falsifiable)

1. flag-off: 변경된 렌더러 함수 각각에 대해 flag-off 출력 === 현행 출력의 동등성 유닛
   테스트 (F9 — 전체-패킷 골든 하니스는 부재하므로 순수-함수 단위로 증명; 신규 하니스
   구축은 비목표).
2. flag-on: code 의무에서 edge-case/null/failure-mode가 독립 의무 문장으로 존재하지 않고
   종속절로만 존재 (텍스트 assert — 부정 통제: 현행 문구가 있으면 FAIL).
3. flag-on: lens sidecar contract에 declared-purpose 앵커 문구 존재; issue-artifact Severity
   Contract·problem-framing 프롬프트에 **임베드된 confirmed criteria(criterion_id+statement)**
   존재, criteria 부재 세션에서는 임베드 절 부재 (assert — 양방향).
3b. flag-on: 어떤 변형 프롬프트에도 "목적과 무관한 결함 → low/info 강등" 류의 severity-축
   스코프 지시가 없고, problem-framing 프롬프트에 admission-축 라우팅(severity 보존 +
   `outside_boundary`/`out_of_scope` 실격) 지침 존재 (assert — Finding B-1의 부정 통제).
3c. flag-on(judgment_anchor): kind-공용 블록(sidecar 계약·Severity Contract)에 code-도메인
   전제 문구("별도 도구"·edge-case 등 code 전용 어휘)가 없고, 전체론적 ladder 정의
   (happy path/supported user group/trust·auditability 티어)가 원문 유지 (assert — E-1/E-2의
   부정 통제).
4. flag-on: deliberation-plan 프롬프트에 precedence ladder 블록 존재·순서 = 채택 ladder
   (assert), **그리고** "Allowed conflict_type values" 열거에 8개 토큰 전부 잔존 (부정 통제,
   E-3).
5. 기존 스위트 + 계약 drift 테스트 green; predicate machine block 무변경 (git diff assert).

## 8. owner 결정 사항 — 2026-07-17 확정

1. (b) **옵션 1(재서열) 채택** — §3-(b) ladder를
   root_hypothesis→purpose_value→domain_constraint→correctness(rescope)→action_or_severity→
   partial_overlap_or_cluster_scope로.
2. 라이브 A/B **실측 확정** (code+spreadsheet 각 on/off — `judgment_anchor` 승격 근거).
3. 플래그 이름: `ontological_anchoring.{obligations,judgment_anchor}` — 구현 시 naming
   charter 대조 후 확정 (구현 재량).
4. criteria producer 다기준화: 이번 스코프 밖 유지, 별도 백로그로 (미착수).

## 9. 설계 리뷰 반영 기록 (2026-07-16, 구현 전 적대적 다관점 리뷰)

독립 3-렌즈(원칙-경계·실코드 근거 반증·flag-on 효과/회귀), medium+ 플로어, failure-path
요구. 리뷰 대상은 초안이며 findings는 실코드 재검증 후 반영:

| ID | 렌즈 | severity | 요지 | 처분 |
|---|---|---|---|---|
| B-1 | boundary | medium | c-2(ii) "목적 무관 작동결함→low/info"가 severity/admission 축 분리를 붕괴(계약 §5:125 위반, §3·§5 보존 경로 우회) | **수용** — 강등 지시 삭제, admission-축 라우팅으로 교체(§3-(c) c-2/c-3, §7-3b) |
| G-1 | grounding | high | c-2/c-3이 issue-artifact 읽기 경계 밖 파일(criteria·interpretation) 앵커 지시 → inert 또는 fabrication 유도 | **수용(자체 선발견 F8과 동일)** — 결정론 프로젝션 임베드로 해소(경계 확장 없이). 리뷰어 제시 2경로 대신 제3경로 |
| E-1 | effect | high | (c) 편집 블록은 kind-공용 → "spreadsheet 불변"은 의무 prose에만 참; 정의적 앵커+강등 지시 결합 시 비-code 구조 결함 강등 | **수용(잔여형)** — B-1로 강등 지시는 기삭제; kind-중립 문구 원칙·§7-3c 부정 통제·비-code 승격 근거 요구 추가 |
| E-2 | effect | medium | criteria = intent_summary 한 줄 자동-confirmed 재서술(F5 과대서술); 정의적 앵커는 purpose를 좁혀 역효과 | **수용** — F5 정정, 앵커를 가산적으로 재규정, 전체론적 ladder 유지 명시, producer 다기준화는 §8-4 |
| E-3 | effect | medium | "나열 순서=ladder" 지시가 8-토큰 허용 enum을 6-항 ladder로 절단 위험(런타임 hint와 모순) | **수용** — 허용-값 열거(8) 불변 + precedence 별도 블록으로 분리(§3-(b), §7-4) |
| E-4 | effect | medium | 단일 플래그가 per-kind와 cross-kind 변경을 결합 — 반-분할 논거 역전 | **수용** — blast-radius 기준 2-플래그로 개정(§2-2, §4) |

리뷰어 무-발견 공개(양측 증거 인용 확인): 변경 대상 문자열을 고정하는 기존 테스트 없음
(flag-off 동등성 달성 가능); code happy-path 실결함은 flag-on에서도 material 유지; (b)는
framing-only지만 conflict_type이 synthesis projection(`:2332`)까지 전파되어 inert 아님;
predicate 비접촉 주장 성립. 설계의 자체 선발견 2건(F8 읽기경계, F9 골든 부재)은 G-1·§7-1과
수렴.
