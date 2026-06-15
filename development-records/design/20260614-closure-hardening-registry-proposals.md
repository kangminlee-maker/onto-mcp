# 제안 — Closure 하드닝 registry 변경 (최소 변경면)

> **Type**: registry 변경 *제안* (rank-5 권위 계약). **자동수정 금지** — 본 문서로 확인받고
> 확정 후에만 `.onto`에 적용한다(핸드오프 §8).
> **Input**: [boundary 인지 절차](./20260614-boundary-recognition-procedure.md) §6 검증 결과
> (갭-타이핑=철회 / ODKE+=좁게 진행).
> **Grounding**: `reconstruct-contract-registry.yaml`, `ontology-seeding-and-maturation-design.md` (직접 확인).
> **Date**: 2026-06-14.

## 0. 선행 검증 (두 open 항목 해소)

| 항목 | 결과 |
|---|---|
| **갭-타이핑 라우팅 완전성**이 기존 의무로 커버되나 | **예 — 완전히 커버.** convergence-ledger-validation: "every consumed source-observation delta row appears in exactly one `source_observation_closure_rows[]` with a disposition"(divergence 완전성) + "every blocker/high question closed/carried/blocked with refs" + M2 "every blocker/high L0-L2 row has a frontier question or limitation"(absence 완전성). |
| **provenance granularity** (span vs char-offset) | **이미 span 단위.** `evidence_ref` → `source-observations.yaml`의 관측 레코드(`observation_id`)로 resolve(maturation-design L391). char-offset 미사용·불필요. |
| **author≠judge 재사용 필드** | **없음.** support cluster/claim/manifest에 authorship·role 필드 부재. → 자기선언 필드는 spoofable. capability surface로 *구조적* 강제 필요(아래 §2 결정점). |

## 1. 제안 1 — 갭-타이핑: **변경 없음 (NO CHANGE)**

§6.1 검증대로 ActionabilityMatrix에 divergence/absence 방향 필드는 **추가하지 않는다**(중복·lossy·
표면증가). 추가로, 내가 유일한 후속 후보로 띄웠던 *라우팅 완전성 검증 의무*도 **불필요** — 위 §0이
보이듯 기존 convergence-ledger-validation + M2가 양방향 완전성을 이미 강제한다.

**→ 신규 registry 표면 = 0. 적용할 변경 없음.**

> **재신고 금지** (감사 원장 §3 스타일): ① `gap_direction`/divergence·absence 필드 신설 금지
> ② "라우팅 완전성" 신규 의무 신설 금지(기존이 커버) ③ 방향은 `closure_disposition`(8값)의
> 파생 투영이며 라우팅 권위는 convergence-ledger다.

## 2. 제안 2 — ODKE+ binary 지지 게이트: **좁게 진행**

목표(§6.2): `convergent_source_evidence`의 "imply(증거→답 함의)"를 *저자 자기인증*에서
**독립 judge의 bounded per-evidence 판정 + runtime 집계**로 전환. 결정론 envelope(개수·독립·
모순·binary 게이트)는 *이미 게이트됨* — 건드리지 않는다.

### 2.1 검증 결과 — author≠judge 강제 방식 확정 = **Option B**

런타임 레포 읽기 전용 확인: 파이프라인은 **아티팩트 단위 귀속**이다 —
`UNIT_ID_BY_AUTHORED_ARTIFACT_NAME`이 `AnswerSupportLedger → answer_support_ledger` 단계를
fail-loud 1:1로 매핑한다. **한 아티팩트는 한 단계에 귀속**되므로 *아티팩트 안의 필드*를 다른
단계(judge)에 귀속시킬 수 없다.

- **Option A(인라인 `support_verdicts` 필드) 기각** — 같은 아티팩트 안 필드는 저자 단계에 귀속되어
  구조적 author≠judge 강제 불가(선언적·spoofable뿐). LLM-capability-boundary 원칙("실행경로가
  계약을 강제 못 하면 강제 가능한 경로로 전환")에 따라 전환.
- **Option B 확정** — judge 판정을 *별도 authored 아티팩트*로 분리하면 같은 아티팩트-단위 귀속이
  author≠judge를 *구조적으로* 강제. 런타임엔 이미 `ReconstructLensJudgment → lens_judgment`라는
  별도-judgment 아티팩트 패턴이 있어 B는 신규 구조가 아니라 기존 패턴 재사용이다.

### 2.2 Option B 구체 블록 (apply-ready · 확인 후 .onto 적용)

**B-1. 신규 아티팩트** `answer-support-judgment.yaml` shape (rank-5: maturation-design 추가).
judge 역할 작성, validated `answer-support-ledger.yaml`의 downstream. 기존 support 어휘 재사용:

```yaml
schema_version: "1"
session_id:
created_at:
round_id:
judgments:
  - judgment_id:
    evidence_cluster_ref:          # → answer-support-ledger.yaml evidence_cluster
    evidence_ref:                  # 그 cluster의 evidence_refs 중 하나
    supports: supported | not_supported
    rationale_ref:                 # judge의 bounded 근거
```

**B-2. registry `artifact_authorities`** (2 엔트리):
```yaml
  answer_support_judgment:
    authority_ref: answer-support-judgment.yaml
    validation_ref: answer-support-judgment-validation.yaml
  answer_support_judgment_validation:
    authority_ref: answer-support-judgment-validation.yaml
```

**B-3. registry `validation_gate_catalog`** (1 게이트):
```yaml
  - gate_id: answer_support_judgment_gate
    validation_artifact_ref: answer-support-judgment-validation.yaml
    required_when: answer_support_judgment_required
```

**B-4. registry `required_when` predicate** (1):
```yaml
  - predicate_id: answer_support_judgment_required
    input_authority_refs: [answer-support-ledger.yaml, answer-support-ledger-validation.yaml]
    truth_expression: "answer_support_ledger_has_convergent_source_evidence_cluster"
    explanation_template: "A judge confirmation is required when answer support uses convergent source evidence."
```

**B-5. registry 신규 validator** `answer-support-judgment-validator` (gate `answer_support_judgment_gate`):
```
validation_obligations:
  - validate_judgment_refs_resolve_to_answer_support_ledger_clusters_and_evidence
  - require_supports_enum_for_each_judgment
  - require_rationale_ref_for_each_judgment
```

**B-6. 기존 validator 의무 확장** — `maturation-answer-claims-validator`(claim 게이트, support·judgment
downstream)에 의무 1개 + conditional input `answer-support-judgment-validation.yaml` 추가:
```
- require_convergent_source_evidence_claims_to_have_two_independent_judge_confirmed_supports
  # convergent_source_evidence claim에 대해: 서로 다른 source location/kind의 evidence_ref ≥2개가
  #   각각 answer-support-judgment의 supports: supported 판정을 가질 것.
```

**규약 고정**: "sufficiency ≡ ≥2 독립 evidence + 각 judge-confirmed supported + 모순 bounded".
**불변식 정합**: judge=LLM은 per-evidence yes/no만, "충분" 판정은 B-6(runtime 집계)이 결정.
author≠judge는 아티팩트-단위 귀속으로 구조 강제. 적용 범위 = `convergent_source_evidence` 한정.

### 2.3 변경면 요약 (확정 B · tier 반영)

| 블록 | 파일·섹션 | tier | 추가 |
|---|---|---|---|
| B-1 | maturation-design | target-design | `answer-support-judgment.yaml` shape + 검증의무 문단 |
| B-2 | registry `planned_artifact_authorities` | planned | 2 엔트리 (+activation_condition) |
| B-3 | registry `planned_validation_gate_catalog` | planned | 1 게이트 (+activation_condition/prereq) |
| B-4 | registry `required_when_predicate_catalog` | — | predicate `answer_support_judgment_required` |
| R-1 | registry `required_when_predicate_catalog` | — | family 인스턴스 `answer_support_judgment_uses_frontier_observation` (ripple) |
| B-5 | registry `validators` (평탄) | 게이트가 planned | 신규 validator 1 |
| B-6 | registry `maturation-answer-claims-validator` | conditional | conditional input + conditional 의무 1 |

**신규 top-level 개념 = 1** (`AnswerSupportJudgment`; `lens_judgment` 패턴 + AnswerSupport 어휘
재사용으로 저비용). 결정론 envelope(개수·독립·모순·binary)·갭-타이핑은 무접촉.

## 2.4 산정 — 착지 tier · ripple · apply 가드

**Tier 결론**: 런타임에 judge 단계가 아직 없으므로 **B 전체가 planned/target tier에 착지**한다
(maturation M1–M4·기존 planned 게이트와 동일 패턴). active 런에는 무영향이고,
`promoted_planned_gate_policy`대로 *activation_condition 구현 + required_when 참*이면 활성화 →
**apply는 저위험 가산**.

> ⚠️ **정정 (2026-06-15)**: 위에서 "planned-게이트의 validator를 active validator 리스트에 두는 게
> 규약"이라 했으나 **틀렸다**. 런타임 loader는 active `validator_records`만 파싱하고 거기 validator의
> gate_id를 active gate에서만 해소하므로, planned 게이트를 가리키는 validator가 active 리스트에 있으면
> **load-throw**한다. PR #55가 그 상태로 적용돼 closure registry가 로드 실패했다(실 loader 재현).
> 선례 `maturation-promotion-*` validator는 평탄 리스트가 아니라 **`planned_validator_records`** 섹션에
> 있다(loader 미파싱). → gate-0 수정으로 judge validator를 `planned_validator_records`로 이동(§6). 상세
> 설계·검증은 [R0 설계 문서](./20260615-runtime-judge-stage-r0-design.md).

**신규 토큰 2개**
- activation_condition `answer_support_judge_runtime_is_implemented` (서술 토큰; 별도 레지스트리 없음)
- evaluator 토큰 `answer_support_ledger_has_convergent_source_evidence_cluster`
  (predicate evaluator 자체가 planned이라 평가 시점도 planned과 정합)

**Ripple 점검 (3건)**
1. **추가 필요** — family 인스턴스 `answer_support_judgment_uses_frontier_observation`
   (`frontier_observation_use_by_downstream_artifact`, 명명규칙 `<key>_uses_frontier_observation`,
   모델 = L1509 `answer_support_uses_frontier_observation`). 근거: judgment가 evidence_ref(=관측 id)
   인용 + 선례 `maturation_answer_claims_use_frontier_observation` 실존. (planning metadata)
2. **거의 무위험** — 터미널 집계 `required_gate_failed_or_runtime_halted_or_unresolved_work_exists`의
   L1782 hand-list는 `dynamic_input_authority_rule`상 *비권위 캐시 힌트*. 게이트를 planned 카탈로그에
   넣으면 `answer-support-judgment-validation.yaml`이 **자동 소비**됨 → hand-list 추가는 *권장(선택)*.
3. **무변경** — `promoted_planned_gate_policy`(L1951)에 judgment 게이트 추가 안 함. "아티팩트 없으면
   admit" 대상 아님(convergent evidence 있는데 judgment 없으면 *차단*해야 함). 검토 후 제외.

**apply-time 가드**: 카탈로그 가산이 구조 가드(invariant-drift/spec-defaults)에 잡히면
INVARIANT-CHANGE 마커(닿은 INV id) 필요. `check:invariant-drift`는 `npm i` 후 실행 —
planned 가산이라 active-behavior 무변경 → no_drift 기대.

## 3. 적용 절차 (확정 후에만)

1. 확정 B 블록(§2.2 B-1~B-6) + ripple R-1을 §2.3/§2.4 tier대로 `.onto`(rank-5)에 적용:
   maturation-design shape(B-1) + `planned_artifact_authorities`(B-2) + `planned_validation_gate_catalog`(B-3)
   + `required_when_predicate_catalog`(B-4·R-1) + 평탄 `validators`(B-5) + answer-claims validator 확장(B-6).
3. 검증: 인용 식별자 문자 일치, 참조 resolve, `npm run -s check:invariant-drift` = `no_drift`
   (node_modules 설치 필요), registry 이름 일치.
4. INVARIANT 보호키 변경 시 INVARIANT-CHANGE 마커(닿은 INV id) — 본 변경은 보호키 무접촉 예상.

## 4. 미적용 / 보류 (open)

- direct_authority "직접 진술"의 semantic 잔여 → judge 적용 확대는 convergent 착지 *후* 재검토.
- categorical→graded(FActScore류 per-evidence 지지율) → judge 착지 후(핸드오프 §7 carry-over).
- span granularity는 충족(§0). char-offset은 채택 제외 유지.

## 5. 참조

- 절차·검증: `./20260614-boundary-recognition-procedure.md` (§6 두 worked example)
- 스파이크: `./20260614-reconstruct-maturation-closure-spike.md` (§5.2, §6 judge 경계)
- 계약: `.onto/processes/reconstruct/reconstruct-contract-registry.yaml`,
  `.onto/processes/reconstruct/ontology-seeding-and-maturation-design.md`

## 6. 적용 완료 (2026-06-15)

제안 1(갭-타이핑) = 변경 없음. 제안 2(ODKE+) B + ripple R-1을 `.onto`에 적용:

| 블록 | 적용 위치 |
|---|---|
| B-1 | maturation-design: `answer-support-judgment.yaml` shape + judge 분리/집계 문단 |
| B-2 | registry `planned_artifact_authorities`: `answer_support_judgment`(+_validation) |
| B-3 | registry `planned_validation_gate_catalog`: `answer_support_judgment_gate` (+prereq) |
| B-4 | registry `required_when_predicate_catalog`: `answer_support_judgment_required` |
| R-1 | registry `required_when_predicate_catalog`: `answer_support_judgment_uses_frontier_observation` |
| B-5 | registry `validators`→**`planned_validator_records`**: `answer-support-judgment-validator` (gate-0 정정) |
| B-6 | registry `maturation-answer-claims-validator`: conditional input + conditional 의무 |

**검증(초기, 불충분했음)**: YAML 파싱 OK · grep 참조 체인 OK · `check:invariant-drift` = `no_drift`(G1~G5).
→ **이 검증은 런타임 *loader* 무결성을 보지 못했다**(중대 갭).

**gate-0 정정 (2026-06-15, ODKE+ R0 설계 중 발견·수정)**: 실 loader(`loadReconstructContractRegistry`)로
돌려보니 closure registry가 **로드 실패**했다 — B-5를 active `validator_records`에 두었는데 그 gate는
planned 카탈로그에만 있어 `references unknown gate answer_support_judgment_gate` throw. **수정**: judge
validator를 active에서 **`planned_validator_records`**로 이동(planned-게이트 validator의 실제 선례).
재검증: 실 loader **LOADED 39/39**(exit 0) · YAML OK · `check:invariant-drift` no_drift · judge tier=planned
유지(행위 불변). **교훈: 이후 계약 변경 검증 루틴에 *실 loader 적재 체크*를 포함**.

**후속(런타임)**: activation_condition `answer_support_judge_runtime_is_implemented` 구현 시 활성화 —
별도 judge 파이프라인 단계(`AnswerSupportJudgment → answer_support_judgment` 귀속) + evaluator 토큰
`answer_support_ledger_has_convergent_source_evidence_cluster` 구현. 소스 런타임 레포 작업(격리).
