<!-- 교차검증: sol(gpt-5.6-sol@xhigh) → fable v2 설계 리뷰, 2026-07-20T02:53:16.334Z, 377s -->

# 1. 결정 지점별 판정표

| 결정 ID | 판정 | 근거 |
|---|---|---|
| SD1 | 조건부 지지 | span 코어와 set 파티션을 분리하는 방향은 정찰 [2]의 좌표계 차이와 부합한다. 다만 “경로-prefix”의 정규화·경로 성분 단위 판정이 정의되지 않아 문자열 prefix 구현이면 `src`가 `src2/a.ts`를 포함하는 것으로 오판할 수 있다. |
| SD2 | 지지 | persisted inventory 재계산은 정찰 [8]이 제시한 두 대안 중 하나이며, 기존 관찰 루프를 건드리지 않아 G-OFF 위험이 낮다. 단, 최초 파일-root와 재계산 파일-root의 동등성 검증은 설계에 없다. |
| SD3 | 반대 | 구조화된 specifier 신설은 정찰 [6]상 필요하다. 그러나 `external \| excluded_observation` 이분법은 관찰 집합만으로 판별할 수 없는 내부 누락·별칭·모호성·미지원 해석을 거짓 분류하게 한다. 140자 bound의 절단/거부 의미도 없다. |
| SD4 | 조건부 지지 | 신규 최상위 `set_nodes`는 정찰 [5]가 요구한 기존 observations 불변식 격리에 부합한다. 그러나 resume 검증이 “유무·fingerprint 일치”뿐이며, set 노드 중복·고아 child·잘못된 relation target·census와의 불일치를 어떻게 거부하는지 정의되지 않았다. |
| SD5 | 반대 | 신규 prompt surface는 정찰 [7]상 필요하고 계약 회전 격리도 타당하다. 하지만 char budget 초과 시 어떤 set/edge가 생략되는지, 그 생략을 어디에 기록하는지가 없다. underlying edge가 완전해도 LLM이 보는 관계가 조용히 잘릴 수 있다. |
| SD5b | 조건부 | 결정론 overview는 안전한 축소 경로다. 그러나 실험2 C2는 단일 파일에서의 맵 한계 기여를 측정한다. 패킷은 C2 FAIL 시 set-tier LLM 가치를 “재검토”하라고 했지 자동 보류의 인과 근거를 제공하지 않는다. |
| SD6 | 반대 | opt-in일 때만 합성 엔트리를 추가하고 별도 prompt SHA를 접는 것은 회전 격리에 부합한다. 하지만 `llm set-tier`와 `SD5b deterministic` 모드 구분값 및 set renderer/projection 계약 버전이 preimage에 없다. 모드 전환 시 이전 artifact가 재사용될 수 있다. |
| SD7 | 반대 | `by_observation` 밖의 census 분리는 정찰 [5]와 일치한다. 반면 set-tier를 최하위 우선순위로 두어 핵심 1b 산출물이 예산에 의해 체계적으로 사라질 수 있고, node cap과 synthesize/verify/output budget 사이의 계산 계약도 없다. `excluded_refs: string[]` 역시 제외 이유를 보존하지 못한다. |
| SD8 | 조건부 지지 | 별도 boolean·부재=off·기존 code gate와의 conjunction은 G-OFF와 리스크 격리에 가장 잘 맞는다. 다만 O-7 승인 전에는 확정 결정으로 볼 수 없다. ON→OFF resume에서 기존 `set_nodes`를 무시하거나 폐기하는 규칙도 필요하다. |

# 2. MATERIAL 발견 목록

`blocker`: 없음. 구현 전 설계 단계이므로 아래 결함은 계약 보강으로 교정 가능하다.

## M-01 — HIGH: import 미해석 사유 이분법이 거짓 사실을 만든다

- 관련 결정: SD3, G-EDGE
- 근거: 정찰 [6]은 관찰 단계가 다른 파일의 존재를 모르며 `resolved_in_set`은 set 조립 시 계산해야 한다고만 확정한다. 설계에는 workspace/module resolver 권위가 없다.
- 실패 시나리오: `a.ts`가 `./missing`을 import하지만 대응 observation이 없다. 이는 레포 외부도, 알려진 excluded observation도 아니다. 현재 enum은 둘 중 하나를 거짓으로 기록해야 한다. bare specifier가 외부 패키지인지 로컬 별칭인지 판정할 근거도 없다.
- 최소 수정: `external_confirmed`, `excluded_observation`, `absent_in_observed_set`, `unsupported_resolution`, `ambiguous`처럼 증거 수준을 분리한다. `external`은 결정론적 외부 판정 근거가 있을 때만 허용하고 언어별 resolver 범위를 계약화한다.

## M-02 — HIGH: bounded set overview에서 silent drop이 가능하다

- 관련 결정: SD5, SD7
- 근거: 전용 char budget과 “유계 relations”를 선언했지만 절단 알고리즘·총량/포함량·생략 사유가 없다. 이는 census 정직 공시 규범에 직접 닿는다.
- 실패 시나리오: import edge가 char budget을 초과한다. 렌더러는 초과, 전체 실패, 일부 edge 삭제 중 하나를 택해야 하지만 계약이 없다. 일부 삭제 시 G-EDGE는 원본 edge 집합만 검사하므로 LLM-visible seam 소실을 잡지 못한다.
- 최소 수정: set overview projection에 결정론적 강등 순서와 `total/emitted/dropped` 수, drop reason, limiting witness를 둔다. 이 projection 자체에 대한 골든·절단 주입 테스트를 추가한다.

## M-03 — HIGH: set-tier가 공유 예산의 잔여분에만 의존해 중심 기능이 사라진다

- 관련 결정: SD7
- 근거: 실측 한 파일이 419 synthesize call을 소비했고 stage 한도는 2,400이다. 설계도 set-tier의 체계적 생략 가능성을 인정한다.
- 실패 시나리오: 유사 비용 파일 5개가 2,095콜을 소비하면 305콜만 남는다. set 수요가 306 이상이면 opt-in이 켜져도 1b 산출물 전체가 생략된다. 2파일 live 게이트는 이 경로를 검출하지 못한다.
- 최소 수정: 관찰 실행 전에 set-tier 최소 예산을 예약하거나, 전체 수요를 먼저 산정해 per-file/set 예산을 함께 배분한다. 적어도 “지원한다고 주장할 최대 파일/노드 규모”에서 set-tier가 실제 생성됨을 완료 게이트로 고정한다.

## M-04 — HIGH: G-SEM-SET은 무의미한 복사를 통과시킨다

- 관련 결정: G-SEM-SET, SD5
- 근거: 판정 조건은 결정론 대조군 대비 “열위가 아님”이다. 실험 증거는 구조 green이 의미 품질을 보장하지 않았음을 보여준다.
- 실패 시나리오: LLM 출력이 자식 요약 concat과 import 목록을 그대로 재서술한다. 대조군과 동률이면 게이트를 통과하지만, 방지하려던 “outline 재발명”이 그대로 승인된다.
- 최소 수정: 비열위는 안전성 게이트로만 사용하고, LLM 층 활성화에는 사전 봉인된 cross-file 질문에서 최소 1개 이상의 실질 승리 또는 양의 집계 개선을 별도로 요구한다. 비교 arm의 입력·출력 budget과 비공집합 질문 수, judge 참여 성공도 고정한다.

## M-05 — HIGH: SD5와 SD5b 전환이 fingerprint에 표현되지 않는다

- 관련 결정: SD5b, SD6
- 근거: SD6 preimage에는 자식 fingerprint·위상·edge·상수·prompt SHA가 있지만 생성 모드가 없다.
- 실패 시나리오: 동일 입력으로 LLM set artifact가 생성된 뒤 C2 결정에 따라 deterministic 모드로 전환한다. 입력값과 계약 SHA가 같으면 aggregate reuse key가 유지되어 LLM artifact가 축소모드에서 재사용될 수 있다. 반대 전환도 동일하다.
- 최소 수정: `set_tier_realization: "llm" | "deterministic"`과 renderer/projection 계약 버전을 `__set_tier__` preimage에 접고, 양방향 모드 전환 reuse 거부 테스트를 추가한다.

## M-06 — HIGH: census가 제외 원인을 보존하지 못한다

- 관련 결정: G-SET, SD7
- 근거: G-SET은 unsupported와 no-inventory를 모두 제외한다고 하지만 스키마는 `excluded_refs?: string[]`뿐이다. 규범은 생략·절단·미지원을 결정론적으로 구별하라고 요구한다.
- 실패 시나리오: `.go` 미지원 관찰과 지원 파일의 inventory 추출 실패가 모두 동일 문자열 배열에 기록된다. 사용자는 정상 미지원과 결함성 누락을 구별할 수 없다.
- 최소 수정: `excluded_refs: [{observation_id, reason}]`으로 바꾸고 최소한 `unsupported_kind`, `missing_inventory`, `projection_capped`, `invalid_inventory`를 분리한다.

## M-07 — MEDIUM: 신규 resume 파티션의 fail-closed 검증 계약이 부족하다

- 관련 결정: SD4, SD7
- 근거: 정찰 [5]는 기존 validator를 재사용할 수 없으므로 병렬 resume 파티션이 필요하다고 한다. 설계는 존재·fingerprint 판정만 명시한다.
- 실패 시나리오: persisted `set_nodes`에 중복 path, 현재 observation에 없는 child ref 또는 잘못된 relation target이 들어 있지만 저장된 fingerprint 필드는 유지된다. 구조 재검증이 없다면 malformed set이 재사용된다.
- 최소 수정: set resume validator가 duplicate/unknown/missing child, partition 위반, relation target, sidecar–census fingerprint 일치를 재계산해 검증하도록 한다. 각 위반 주입 테스트를 완료 게이트에 넣는다.

## M-08 — MEDIUM: 경로-prefix 의미가 모호하다

- 관련 결정: SD1
- 근거: 설계는 prefix만 말하고 canonical relative path와 성분 경계를 정의하지 않는다.
- 실패 시나리오: set `src`와 파일 `src2/a.ts`에 문자열 `startsWith`를 적용하면 잘못된 포함 관계가 성립한다.
- 최소 수정: 경로를 정규화된 상대 경로 성분 배열로 표현하고, ancestor 판정을 성분 단위로 정의한다. `src/src2`, `src2`, `.` 및 중복 separator 사례를 음성 테스트에 넣는다.

## M-09 — MEDIUM: C2 FAIL에서 set LLM 보류로 가는 인과가 성립하지 않는다

- 관련 결정: SD5b
- 근거: C2는 단일 대형 파일에서 map 대 deterministic inventory의 차이를 측정한다. set-tier는 cross-file relation을 입력으로 하는 다른 문제다.
- 실패 시나리오: 단일 파일 map은 가치가 없지만 여러 파일의 import 관계 종합은 가치가 있는 경우에도 SD5b가 LLM 층을 자동 제거한다.
- 최소 수정: C2 FAIL은 자동 분기가 아니라 owner 재결정 트리거로 제한한다. 이후 소형 set-specific 비교를 거쳐 SD5/SD5b를 선택한다.

## M-10 — MEDIUM: 140자 specifier bound의 의미가 없다

- 관련 결정: SD3
- 근거: 설계는 bound만 선언하고 절단·거부·원문 보존 여부를 정하지 않는다.
- 실패 시나리오: 처음 140자가 같은 두 specifier를 절단 저장하면 중복제거 또는 resolution 결과가 합쳐질 수 있다. 반대로 drop하면 census 없는 침묵 소실이 된다.
- 최소 수정: specifier는 절단해 resolve하지 말고 `unresolved_kind:"specifier_truncated"`로 남기며 원문 길이와 안정 해시를 기록한다.

# 3. 설계가 다루지 않은 갭

- set node의 정확한 machine schema가 없다. node identity, child ref, ground, relation, fingerprint, 생성 realization 중 무엇이 source truth인지 확정되지 않았다.
- `semantic_map_set_overview`의 source layer와 projection layer 간 패리티 강제자가 없다. 설계가 이를 백로그로 명시했으므로 신규 필드가 소비자에서 빠져도 정적 게이트가 잡지 못한다.
- set node cap이 synthesize/verify call 수 및 output budget으로 변환되는 공식이 없다. Phase 1b 완료 조건의 “동시성·output-budget 상호작용 검토”는 충족되지 않았다. 기존 L2 내부 동시성 동작은 패킷 근거 없음.
- resolver의 기준 루트, 언어별 확장자·index·별칭 처리 범위, 대소문자 및 경로 정규화 권위가 없다.
- ON→OFF, SD5→SD5b, inventory schema 구버전→신버전의 resume 전이 행렬이 없다.
- live 대상으로 제시한 두 파일 사이에 실제 import 관계가 있다는 독립 증거는 패킷에 없다. 실행 전에 edge 비공집합을 precondition으로 단언해야 한다.
- G-SEM-SET의 질문 수, 반복 수, 동률 처리, 집계식, judge 실패 판정이 없다. 해당 하니스의 신뢰도를 판단할 추가 실측은 패킷 근거 없음.
- §6의 “MATERIAL 전건 반영” 및 CLEAN 주장은 원 리뷰 산출물과 실행 증거가 패킷에 없어 독립 검증할 수 없다. 특히 observation ID 충돌 불가와 sidecar 관대 가드 통과는 패킷 근거 없음.
