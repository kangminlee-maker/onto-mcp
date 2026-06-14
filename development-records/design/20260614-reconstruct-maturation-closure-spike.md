# Spike — Reconstruct Maturation Closure / Stopping Criterion

> **Type**: design spike (exploratory, non-authority). 구현 승인 아님.
> **Question**: 원칙적 maturation 종료(closure/stopping) 기준을 어디에 두고 어느 형식으로
> 굳힐 것인가. (review/research open_q #1)
> **Inputs**: [review+research 종합](../audit/20260613-reconstruct-operating-model-review-research.md) ·
> [개념 문서](../reference/20260613-reconstruct-operating-model-concept.md)
> **Grounding**: `ontology-seeding-and-maturation-design.md`,
> `reconstruct-contract-registry.yaml` (직접 확인).
> **Date**: 2026-06-14.

## 1. 스파이크 질문

리서치 종합의 최대 결론은 "repeat-until-source-feels-closed를 대체할 **원칙적 정지 기준**의
부재"였고, open_q #1은 "Reflexion / Grüninger-Fox / HypoAgents 중 canonical은 무엇이며,
`MaturationClosureFrontier`에 둘지 `MaturationConvergenceLedger`에 둘지"였다.

## 2. Grounding 결과 — 정지 기준은 **이미 존재**하고 잘 발달돼 있다

스파이크의 가장 중요한 발견: maturation 종료 기준은 신설 대상이 아니다. 계약이 이미 보유한다.

### 2.1 이미 존재하는 개념 (신설 불필요)

| 개념 | 역할 | 출처 |
|---|---|---|
| `MaturationContinuationDecision` | **validated matrix와 frontier/support 권위에서 파생된 continuation/terminal 상태** — 즉 정지/계속 판정 권위 | maturation-design L116 (runtime) |
| `MaturationConvergenceLedger` | material 질문·source-delta·trace/audit·**remaining frontier**의 append-only closure 원장 | L115 (runtime) |
| `MaturationClosureFrontier` | maturity-question 기반 next-authority frontier(소스+비소스 권위 요청) | L137 |
| `ActionabilityMatrix` | static/kinetic/dynamic × 7차원 성숙도(L0–L4) runtime 투영 | L112 |
| `AnswerSupportLedger` | 어느 질문이 positive answer를 낼 수 있는지 증명하는 per-round 지지 클러스터 | L108 |

### 2.2 이미 존재하는 정지 술어 — **두 정지 신호 + 13 수렴 조건**

maturation-design L2424-2429은 **두 분리된 stop signal**을 명시한다:

| Stop signal | 의미 |
|---|---|
| **Matrix closure** | 모든 material static/kinetic/dynamic × 7차원 행이 **L4** 또는 claim 밖 limitation-backed |
| **Re-question closure** | 현재 아티팩트에서 재생성한 frontier가 actionability claim을 바꿀 **신규 material 질문을 내지 않음** (fixpoint) |

둘 다 `actionable_ready`의 필요조건(L2431). 이 위에 13개 수렴 조건(L2392-2406)이 있고 —
source-purpose coverage, **competency answerability**, material gap closure, **evidence
convergence**, runtime/query proof, policy·data·external·source-delta closure, closure
disposition coverage, **frontier exhaustion by materiality**, **re-question convergence**,
static/kinetic/dynamic actionability — **materiality 게이팅**(L2408: "frontier 질문이 material
purpose 요소를 바꿀 수 있는 한에서만 계속")이 종료를 규율한다.

### 2.3 상태

maturation 게이트는 **active 카탈로그**에 있다(required_when-gated):
`maturation_question_frontier_gate`, `maturation_closure_frontier_gate`,
`actionability_matrix_gate`, `competency_question_assessment_gate`,
`baseline_actionability_matrix_gate`. seed→maturation 진입은 `seed_valid_for_maturation`
(L1110). 구현은 슬라이스(M1–M4)로 단계화돼 일부 미완(L1099).

## 3. 재구성된 실제 공백

"정지 기준 부재"는 거의 사실이 아니었다. 진짜 공백은 둘로 좁혀진다:

- **(G1) 개념 문서의 maturation 압축 서술** — 개념 문서 §2/§3은 종료를 "소스가 닫힐 때까지
  반복"으로만 적어, *seeding의 source-closure*와 *maturation의 matrix/re-question closure*를
  뭉갰다. 리서치가 "정지 게이트 없음"으로 본 원인. → 개념 문서 정정으로 해소(아래 5.3).
- **(G2) 두 개의 좁은 경화 여지** — 기존 술어를 *판정(judged)*에서 *결정(decidable)*으로
  굳히는 narrow 기회. 신규 시스템이 아니라 기존 행(condition)의 강화.

## 4. 리서치 메커니즘 → 기존 기계 매핑

| 메커니즘 | 매핑되는 기존 요소 | 이미 있나 | 진짜 delta | 판정 |
|---|---|---|---|---|
| **Reflexion** convergence/divergence/absence | ActionabilityMatrix 갭(L0–L4) + "material gap closure" | 갭 *레벨*은 있으나 **갭 방향 타입 없음** | 갭을 *divergence*(소스>씨앗) vs *absence*(씨앗>소스)로 타이핑 → 갭→{limitation, 새 frontier} 라우팅을 결정론화 | **adapt (narrow)** |
| **ODKE+ binary support gate** | "evidence convergence" 조건 + AnswerSupportLedger | 수렴은 *요구*되나 per-answer 충분성은 *저자 판정* | 별도 judge의 **binary per-answer 지지 게이트**로 "sufficient convergent evidence"를 결정론화. FActScore/SAFE atomic 지지율이 정량 변형 | **adapt (narrow)** |
| **Grüninger-Fox** CQ=형식 entailment | "competency answerability" 조건 + `competency_question_assessment_gate` | answerability가 이미 필수 수렴 조건·active 게이트 | 형식 entailment는 무겁고 기존 대비 한계이득 | **defer** (decidedness 프레이밍 이미 존재) |
| **HypoAgents** entropy-stabilization stop | "re-question closure" fixpoint 신호 | re-question closure가 이미 stabilization 정지 | entropy 정량화는 belief-분포 모델링 비용↑, 한계이득 | **defer** |

## 5. 권고

### 5.1 Canonical 배치 — open_q #1 직답: **신규 개념 없음**

"`MaturationClosureFrontier` vs `MaturationConvergenceLedger`"는 거짓 양자택일이다. 셋은 서로
다른 기존 역할이다:

- **정지/계속 판정의 canonical 권위 = `MaturationContinuationDecision`** (terminal /
  `continue` / `ask_user`), `ActionabilityMatrix` 위의 두 정지 신호로 파생.
- **`MaturationConvergenceLedger`** = 각 frontier 질문·source-delta 행의 closure disposition 원장.
- **`MaturationClosureFrontier`** = 남은 next-authority 요청(무엇을 더 물을지).

→ 정지 술어를 새로 만들지 말고, `MaturationContinuationDecision`의 입력(두 정지 신호 +
materiality)을 **명시적·결정론적 술어로 굳히는 데** 집중한다.

### 5.2 좁게 채택할 두 경화 (다음 설계 단위)

1. **Reflexion 갭 타이핑** → `ActionabilityMatrix` 행에 divergence/absence 방향을 부여,
   갭→limitation vs 새 frontier 라우팅을 결정론화. (LLM이 R/타입 태깅 = 의미, runtime이
   라우팅 = 결정론 — 두 권위 분리에 정합)
2. **ODKE+ binary per-answer 지지 게이트** → "evidence convergence" 조건을 별도 judge의
   Yes/No 지지 판정 + 교차소스 corroboration으로 결정론화, `AnswerSupportLedger`에 기입.
   (span-level provenance만; char-offset 주장은 채택 제외)

둘 다 closed-world(사용자 소스) 의미 유지, 신규 top-level 개념 0, 기존 active 게이트 강화.

### 5.3 개념 문서 정정 (G1)

§2 maturation 항목에 두 정지 신호(matrix closure + re-question closure)를 1줄로 명시해
seeding source-closure와 구분한다. (본 스파이크에서 적용)

### 5.4 보류

Grüninger-Fox 형식 entailment·HypoAgents entropy는 한계이득 대비 비용이 커 watch.
per-claim 정량화(FActScore)는 ODKE+ 게이트 착지 후 "evidence convergence"를 점수화할 때 재검토.

## 6. 열린 리스크 / 다음 단계

- **결정론 경계 리스크**: binary 지지 게이트의 judge는 LLM이다 — "runtime이 의미를 만들지
  않는다" 불변식을 지키려면 judge 출력을 *증거 존재/일치의 결정론적 체크*로 한정하고, 의미
  판단은 author 측에 남겨야 한다. 게이트 설계 시 이 경계가 핵심.
- **materiality 정의 의존**: 두 정지 신호 모두 "material"에 의존한다. material 판정 자체가
  LLM-authored이므로, 경화는 정지 *기준*을 굳히되 material *판정*은 굳히지 못한다. 한계 명시 필요.
- **다음 단계 후보**: (a) Reflexion 갭-타이핑 마이크로 설계 + registry 영향, (b) binary 지지
  게이트 계약 초안(judge 결정론 경계 포함), (c) 개념 문서 §2 정정(즉시).
