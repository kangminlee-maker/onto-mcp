# 설계 — Boundary 인지 절차 (구현/capability 경계로 개념 경계 정하기)

> **Type**: design (절차 설계, non-authority). 구현·계약수정 승인 아님.
> **Question**: 온톨로지가 없는 상황에서 갭-타이핑 같은 개념의 *결정론 경계*를 어디에
> 긋고, 그 바깥(의미 잔여)을 어떻게 선언할 것인가 — 그 **인지 절차**를 고정한다.
> **Visual**: [`./20260614-gap-typing-boundary-method.svg`](./20260614-gap-typing-boundary-method.svg) (동반 개념도)
> **Grounding**: [closure spike](./20260614-reconstruct-maturation-closure-spike.md),
> `reconstruct-contract-registry.yaml`, `ontology-seeding-and-maturation-design.md` (직접 확인).
> **Scope**: `development-records/design/` (rank 8, 권위 밖). `.onto` 계약은 *제안만* — 적용은 사용자 확인 후.
> **Date**: 2026-06-14.

## 1. 왜 갭-타이핑 *이전*에 이 절차인가

갭을 divergence/absence로 *타이핑*하려면 먼저 "무엇과 무엇 사이의 경계인지"가 서야 한다.
그런데 그 경계를 정의해 줄 도메인 온톨로지가 reconstruct에는 아직 없다 — 그게 *산출물*이기
때문이다(부트스트랩). 따라서 경계의 grounding을 **구현(capability) 표면**에서 가져와야 하고,
이 문서는 그 grounding을 *재현 가능한 절차*로 고정한다. 절차의 산출물은 개념별 **boundary
ledger** 한 장이며, 그 ledger가 곧 갭-타이핑 마이크로 설계의 입력이 된다.

## 2. 원리 — capability surface가 개념의 단단한 모서리를 정한다

(권위분리 재서술 + `CLAUDE.md` 「LLM And Capability Boundary」의 scoped 적용)

- 개념의 hard edge = capability surface가 **결정론적으로 관측·판정·거부**할 수 있는 것.
- 온톨로지 부재가 grounding을 구현 표면 위로 *강제*한다. 비교 대상이 외부 진리가 아니라
  **두 런타임 아티팩트**(관측된 것 observed vs 선언된 것 declared)이기 때문에 온톨로지 없이도
  성립한다.
- 잔여(의미 동치·materiality)는 LLM 권위로 남기고 **명시적 한계로 선언**한다. runtime은 빠진
  의미를 *몰래 채우지 않는다* (비협상 불변식: 두 권위 분리).

## 3. 핵심 구분 — capability 경계 ≠ 현재 코드 경계 (유일한 함정)

각 판정 단위(sub-distinction)는 셋 중 하나로 처분한다:

| disposition | 정의 | 귀속 |
|---|---|---|
| `runtime_decidable` | 관측 아티팩트의 **현존** 필드/링크에 대한 ref-집합/enum 식으로 *지금* 계산 가능 | runtime |
| `capability_reachable` | 관측 아티팩트로부터 **원리적으로** 결정 가능하나 필드/링크가 아직 surface 안 됨 | runtime(구현 backlog) |
| `semantic_residue` | **의미 동치** 또는 **materiality** 판정 필요 | LLM author + validator |

- **개념의 결정론 경계 = `runtime_decidable` ∪ `capability_reachable`.**
- **캡(cap) = 그 합집합과 `semantic_residue` 사이의 선.**
- 함정: 경계를 `runtime_decidable`(=오늘의 코드)로만 그으면, 단지 *아직 안 만든 필드* 때문에
  개념이 잘못 축소된다. `capability_reachable`을 개념 안에 포함시켜야 구현 누락이 개념을
  오염시키지 않는다. (`capability_reachable`은 *구현 할 일* 목록이지 개념 축소가 아니다.)

## 4. 절차 (Step 0–6)

**Step 0 — 개념을 판정 단위로 분해.** 경화 대상 개념은 보통 원자가 아니라 yes/no·범주
판정의 묶음이다. 단위를 열거한다. *(갭-타이핑: "divergence인가", "absence인가", "정말
미커버인가", "material인가".)*

**Step 1 — 관측 아티팩트 식별.** 각 단위를 근거지을 수 있는 런타임 아티팩트를 적는다.
도메인 온톨로지 금지 — **observed 아티팩트와 declared 아티팩트만** 허용.

**Step 2 — 단위를 아티팩트 위의 후보 관계로 표현.** ref-집합 연산 또는 enum 읽기로 써 본다.
아티팩트 필드 위의 truth_expression으로 쓰이면 → 결정론 후보.

**Step 3 — 관계 stress: 의미 동치가 필요한가.** 이 관계를 계산하려면 *다르게 명명된 두 대상이
"같은 의미"인지*를 판정해야 하는가? 그렇다면 → `semantic_residue`. 명시적 링크/enum에만
기대면 → 결정론. **여기서 경계를 고정하는 *규약*을 명시한다** (예: "coverage ≡ 명시적 ref
인용", 의미 동치 아님).

**Step 4 — 결정론 후보의 capability vs current-code triage.** 해당 필드/링크가 *오늘* 있나?
있으면 `runtime_decidable`, 관측 아티팩트로부터 파생 가능하나 surface 안 됐으면
`capability_reachable`.

**Step 5 — 캡을 긋고 잔여를 기록.** 결정론 경계 = 위 두 disposition의 합집합. `semantic_residue`
각 항목은 *소유자(LLM author + validator)* 와 *의존하는 규약*을 함께 명시적 한계로 적는다.

**Step 6 — 매핑 제안 + 검증.** 결정론 관계가 어디에 살지(registry predicate / validation
obligation)를 **제안만** 한다(권위 계약 자동수정 금지). 경계가 옳게 그어졌는지 competency
question으로 검증한다(§7).

> SVG 개념도의 레인이 이 절차에 대응한다: Step 1=두 관측 아티팩트, Step 2–4=런타임 결정론
> 박스, Step 5=캡 경계선 + 앰버 잔여 박스, 함정=각주.

## 5. 산출물 — Boundary Ledger 형식

| sub_distinction | grounding_artifacts | candidate_relation | disposition | depends_on_convention | owner |
|---|---|---|---|---|---|

한 개념의 ledger는 위 행들의 집합이다. `runtime_decidable`·`capability_reachable` 행의 합이
그 개념의 결정론 경계이고, `semantic_residue` 행이 캡 바깥 = 선언해야 할 한계다.

## 6. Worked examples — 절차를 두 하드닝에 적용 (검증 완료)

### 6.1 갭-타이핑 (Reflexion 방향) — 검증 결과: **신규 필드 철회**

확인한 현행 필드: `source-observation-delta.yaml`의 `added_observation_ids`·`frontier_kind`·
lineage; 매트릭스↔관측 인용 predicate `actionability_matrix_uses_frontier_observation`
("matrix cites or derives from observation ids"); seed/element의 `closure_status:
modeled|limitation_backed|frontier_required`, `purpose_source_status:
…|unresolved`, `frame_status: …|unresolved`, `closure_expectation: model_or_limit|frontier_required`.
특히 `frontier_required` = "모델링에 필요한 *다음 소스/권위*를 명시" → **absence 방향을 이미
인코딩**.

| sub_distinction | grounding_artifacts | candidate_relation | disposition | depends_on_convention | owner |
|---|---|---|---|---|---|
| **divergence** (소스>씨앗) | observation-delta `added_observation_ids` × matrix `supporting_refs` | ∃ obs_id ∈ delta s.t. ¬∃ row citing obs_id | `runtime_decidable` | coverage ≡ 명시적 ref 인용 | runtime |
| **absence** (씨앗>소스) | element `closure_status`/`purpose_source_status`/`frame_status`/`closure_expectation` | status ∈ {`frontier_required`, `unresolved`} | `runtime_decidable` | status enum의 의미 (LLM이 authoring 시 부여) | runtime |
| absence — *행 단위 집계* | matrix row maturity + blocker + supporting_refs | 낮은 maturity & blocker 有 & 받쳐주는 관측 ref ∅ | `capability_reachable` | "ref 없음"의 행 단위 surface 필요 | runtime(backlog) |
| **정말 미커버인가** | obs 의미 ↔ row 의미 | 두 대상의 *의미 동치* | `semantic_residue` | coverage를 명시 인용으로 고정함으로써 경계 *밖*으로 밀어냄 | LLM author + validator |
| **material인가** | purpose frame · 영향 판단 | 갭이 actionability claim을 바꾸나 | `semantic_residue` | materiality는 LLM-authored | LLM |

### 검증 결과 — 방향은 *과결정*(over-determined), 신규 필드 철회

"기존 enum이 방향을 완전히 결정하는가"를 검증한 결과: **결정한다. 단지 결정하는 게 아니라 이진
divergence/absence가 표현 못 할 만큼 세밀하게 결정한다.** 라우팅 권위는 convergence-ledger의
`closure_disposition`(8값)이며, `affected_matrix_row_refs`로 매트릭스 행과 결정론적으로 조인된다
(maturation-design L1494-1540).

| `closure_disposition` (기존 8값) | Reflexion 방향 | 이진축 매핑 |
|---|---|---|
| `answered_and_expanded` | divergence (소스>씨앗, 흡수) | ✅ divergence |
| `answered_no_semantic_change` | convergence (소스==씨앗) | ❌ 3번째 |
| `trace_audit_only` | convergence/진단 | ❌ |
| `blocked_unavailable` | absence (소스 부재) | ✅ absence |
| `deferred_user_decision` | 비소스 권위(user) | ❌ 4번째 |
| `deferred_external_authority` | 비소스 권위(external) | ❌ 4번째 |
| `rejected_non_material` | materiality 필터 | ❌ (LLM) |
| `out_of_scope` | 범위 제외 | ❌ (absence와 구별) |

8값 중 이진축에 깔끔히 들어가는 건 3개뿐. `authority_kind`(`none|user|external_system|domain_standard|runtime_capability`)가 비소스 분기를 추가 분해한다.

**판정 — ActionabilityMatrix 행에 divergence/absence 필드 추가는 *철회*한다:**
1. **중복** — `closure_disposition`의 lossy 복제. 방향은 매트릭스 행 ⋈ ledger closure_row
   (`affected_matrix_row_refs`) 조인의 *파생 투영*이다. 신규 필드 불필요.
2. **lossy** — 이진축은 8값 중 5값(convergence·비소스 권위 ×2·비material·out-of-scope)을 표현 못 함.
3. **개념표면 *증가*** — 투영(매트릭스)에 라우팅 권위를 복제 = "파생값은 소스의 투영" 위반.
   라우팅 권위는 ledger지 매트릭스가 아니다.
4. 핸드오프의 "LLM 태깅 / runtime 라우팅" 분담은 `closure_disposition`(LLM-authored bounded enum)
   + 라우팅 투영("Actionability effect")으로 **이미 구현돼 있음**. 스파이크 §4의 "갭 방향 타입
   없음"은 기존 기계를 과소평가한 것 — 방향 타입은 *없는 게 아니라 더 풍부하게 있다*.

**남는 narrow 표면**(있다면): 모든 material L0–L2 행이 적어도 하나의 closure_row에 연결되는지의
*라우팅 완전성* 검증 의무 — 신규 enum 0. **잔여**: pre-closure pending(`unresolved`/미인용
observation/미처리 `frontier_required`)은 관측+closure 루프가 해소, materiality는 LLM 불변.

### 6.2 ODKE+ binary 지지 게이트 — 검증 결과: **좁게 진행**

확인한 현행: `answer-support-ledger.yaml`의 evidence_clusters는 `support_mode`(`direct_authority|
runtime_proof|user_confirmation|authority_response|convergent_source_evidence`)·`evidence_refs`·
`independence_basis`·`contradiction_refs`를 보유(maturation-design L1420-1446). `answer_support_gate`
(registry `answer-support-ledger-validator`)가 이미 다음을 게이트로 강제한다:

| sub_distinction | relation | disposition | 현 상태 (검증 의무) |
|---|---|---|---|
| support_mode별 필수 ref 존재 | count ≥ 필수 | `runtime_decidable` | ✅ `validate_support_mode_required_refs` |
| convergent: ≥2 독립 증거 | distinct source/kind ≥2 | `runtime_decidable` | ✅ `require_two_independent_evidence_refs_for_convergent_source_evidence_unless_direct_authority` |
| 모순 기록·bounded | contradiction → 아니면 차단 | `runtime_decidable` | ✅ `require_contradictions_to_be_recorded_and_bounded` |
| provenance·replay | lineage/safety row 해소 | `runtime_decidable` | ✅ `require_observation_specific_evidence_support_source_safety_row_with_claim_sufficiency_and_replay` (span granularity만 `capability_reachable`) |
| binary "유효 지지 없으면 claim 없음" | claim ⋈ cluster | `runtime_decidable` | ✅ `validate_support_mode_against_valid_evidence_cluster_or_authority` |
| **증거가 답을 *imply*하는가** | span ↔ proposed_answer 의미 함의 | `semantic_residue` | ⚠️ author 자기인증, 독립 judge 없음 |
| material인가 | LLM | `semantic_residue` | 불변 |

**판정 — gap-typing과 정반대로 *진행*하되 좁게:** 결정론 envelope는 이미 완성·게이트됨. L1415의
"two independent evidence records *imply* the same answer"에서 **imply(의미 함의)만이 미검증
(저자 자기인증)**. 따라서 ODKE+의 진짜 delta = count/independence/contradiction 결정론화가
아니라(이미 됨) **author≠judge 역할 분리**.

**경계 설계(spike §6 리스크 해소)**: judge=LLM이므로 출력을 *증거당 bounded `supports: yes/no`
+ rationale ref*로 한정하고, "sufficient" 게이트 판정은 runtime이 집계(judge-confirmed support
≥2 독립 ∧ 모순 bounded). judge는 "충분"을 판정하지 않는다 — 그래야 "runtime이 의미를 안
만든다" 불변식이 유지된다.

**신규 표면 = 둘**: ① judge-verdict(기존 support 어휘의 *2번째 역할 인스턴스*) ② 기존
`require_two_independent_...` 의무를 judge-confirmation으로 확장. 규약: "sufficiency ≡ ≥2 독립 +
각 judge-confirmed + 모순 bounded".

> **후속 확정**: author≠judge를 *구조적으로* 강제하려면 런타임의 아티팩트-단위 귀속상 verdict가
> *별도 아티팩트*여야 한다 → judge-verdict를 별도 `answer-support-judgment.yaml`로 분리(Option B).
> 신규 top-level 개념 = 1(`AnswerSupportJudgment`, 기존 `lens_judgment` 패턴 재사용으로 저비용).
> 최종 변경면·apply-ready 블록은 [registry 제안 문서](./20260614-closure-hardening-registry-proposals.md) §2.

### 6.3 두 하드닝 비교 (확정)

| | 갭-타이핑 (Reflexion) | ODKE+ 지지 게이트 |
|---|---|---|
| 결정론 envelope | 이미 존재 (`closure_disposition`) — *과결정* | 이미 존재·게이트 (`answer_support_gate`) |
| 진짜 갭 | 없음 (기존이 더 풍부) | 단 하나: imply의 독립 judge 부재 |
| 판정 | **철회** — 신규 필드 redundant·lossy·표면증가 | **좁게 진행** — author≠judge 분리 |
| 신규 표면 | 0 (최대: 라우팅 완전성 검증) | 2 (judge 슬롯 + 의무 확장), 신규 개념 0 |
| 공통 | 방향/충분성은 결정론화하되 *materiality는 LLM 불변* | 〃 |

절차의 효용 입증: 하나는 불필요한 작업을 *막고*(+회귀 방지), 다른 하나는 "새 게이트"가 아니라
*역할 분리 + 의무 1개*로 정확히 좁혔다.

## 7. 검증 — 경계가 옳게 그어졌는지 (boundary CQ)

- **CQ-B1**: 모든 `runtime_decidable`·`capability_reachable` 행이 *도메인 온톨로지 참조 없이*
  관측·선언 아티팩트만으로 표현됐는가? (온톨로지 누수 0)
- **CQ-B2**: 모든 `semantic_residue` 행이 *소유자*와 *의존 규약*을 갖는가? (몰래 채움 0)
- **CQ-B3**: `capability_reachable` 행이 "개념 축소"가 아니라 "구현 backlog"로 분류됐는가?
  (현재-코드 함정 회피)
- **CQ-B4** (concept economy): 결정론 행이 기존 enum/predicate를 *추가 없이* 재사용하는가,
  아니면 신규 vocabulary를 들이는가? 들인다면 split 근거가 있는가?
- 정적 체크: 인용한 필드/predicate 명이 registry/maturation-design과 *문자 일치* + 변경 시
  `npm run -s check:invariant-drift` = `no_drift`.

## 8. 한계

- **materiality 의존**: 두 정지 신호·갭 materiality 모두 LLM-authored. 절차는 *방향·coverage*를
  결정론화하지만 *중요도*는 굳히지 못한다(스파이크 한계와 같은 선).
- **enum 의미 의존**: absence를 `frontier_required` 등으로 읽는 건 author가 그 의미를 옳게 부여한
  전제 위에서다. 절차는 *읽기*를 결정론화할 뿐 *부여*를 검증하지 않는다 — 그건 validator/리뷰의 몫.
- **규약 의존**: "coverage ≡ 명시적 인용"이 바뀌면 divergence의 disposition도 바뀐다(규약이 경계를 정의).

## 9. 다음 단계 / open

두 검증 모두 §6에서 완료(갭-타이핑=철회, ODKE+=좁게 진행). 남은 작업:

1. **갭-타이핑**: 신규 필드 철회 확정. 유일한 후속 후보 = 매트릭스 행 ⋈ `closure_disposition`
   *라우팅 완전성* 검증 의무(모든 material L0–L2 행이 closure_row에 연결). registry **제안**으로만,
   사용자 확인 후 적용(권위 계약 자동수정 금지). 신규 enum 0.
2. **ODKE+**: judge-verdict 슬롯 + `require_two_independent_...` 의무의 judge-confirmation 확장의
   최소 변경면을 `answer-support-ledger.yaml`/`answer-support-ledger-validator` 위에 산정 →
   registry **제안**. 재사용 우선: judge를 별도 개념이 아니라 기존 support 어휘의 *2번째 역할
   인스턴스*로(개념경제).
3. open — span-level provenance granularity 확인(`require_observation_specific_..._replay`이 span
   단위인지; char-offset은 채택 제외). categorical→graded(FActScore류 점수화)는 judge 착지 *후*
   재검토(핸드오프 §7 carry-over).

## 10. 참조

- 동반 개념도: `./20260614-gap-typing-boundary-method.svg`
- 스파이크: `./20260614-reconstruct-maturation-closure-spike.md` (§4 메커니즘 매핑, §6 결정론 경계 리스크)
- 핸드오프: `../handoff/20260614-reconstruct-closure-hardening-handoff.md` (§3 다음작업, §5 불변식)
- 계약: `.onto/processes/reconstruct/reconstruct-contract-registry.yaml`,
  `.onto/processes/reconstruct/ontology-seeding-and-maturation-design.md`
