# Handoff — Reconstruct Maturation Closure Hardening

> **Date**: 2026-06-15 (갱신; 최초 2026-06-14)
> **Worktree**: `/Users/kangmin/cowork/onto-mcp-closure`
> **Branch**: `feat/reconstruct-closure-hardening`
> **Status**: 설계·검증·**계약 적용(planned tier) 완료**. 남은 것은 런타임 judge 단계 구현(격리된 소스 레포).

## 1. 한 줄 요약

두 narrow closure 하드닝을 **boundary 인지 절차**로 검증했다: **갭-타이핑은 철회**(기존
`closure_disposition` 8값이 방향을 *과결정* → 신규 필드는 redundant·lossy·표면증가), **ODKE+
지지 게이트는 좁게 진행**(빠진 건 "증거→답 imply"의 독립 judge뿐). ODKE+는 `.onto`에 **planned/
target tier로 적용 완료**. 활성화는 런타임 judge 단계 구현이 전제.

## 2. 이 브랜치 커밋

| commit | 내용 |
|---|---|
| `2180bba` | foundation: 개념 표면 토대(운영모델·리뷰/리서치 감사·개념표면 감사·closure 스파이크·계약 감사수정) |
| `e45669e` | DD-010 결정기록 재작성 |
| (이번) | boundary 인지 절차 + 두 하드닝 검증 + ODKE+ B를 planned tier로 적용 |

## 3. 이번 세션에 한 일 (핵심 결론)

1. **boundary 인지 절차 설계** — 온톨로지 없는 상황에서 *구현(capability) 경계로 개념 경계*를
   정하는 재현 절차. 3-disposition(`runtime_decidable`/`capability_reachable`/`semantic_residue`),
   개념 경계 = 앞 둘의 합집합, 캡 = 그와 semantic_residue 사이. 산출물 = boundary ledger.
2. **갭-타이핑 검증 → 철회.** 방향(divergence/absence)은 convergence-ledger `closure_disposition`
   (8값) + `authority_kind`(5값)의 파생 투영이며, 매트릭스 행 ⋈ closure_row 조인으로 결정론.
   라우팅 완전성도 기존 의무가 양방향 강제(미인용 관측·blocker/high 행 모두 커버). **신규 표면 0.**
3. **ODKE+ 검증 → 좁게 진행.** 결정론 envelope(개수·독립·모순·binary 게이트)는 이미 게이트됨.
   유일한 갭 = "imply"의 저자 자기인증. **author≠judge**는 런타임의 *아티팩트-단위 귀속*상
   필드로는 불가 → **별도 authored 아티팩트(Option B)**로 구조 강제(기존 `lens_judgment` 패턴 재사용).
4. **registry 제안 산정 + 적용.** B + ripple(R-1)을 **planned/target tier**로 적용. drift `no_drift`.

## 4. 적용된 계약 변경 (planned tier, active 런 무영향)

- maturation-design: `answer-support-judgment.yaml` shape + judge 분리/집계 문단 (B-1)
- registry `planned_artifact_authorities`: `answer_support_judgment`(+_validation) (B-2)
- registry `planned_validation_gate_catalog`: `answer_support_judgment_gate`(+prereq) (B-3)
- registry `required_when_predicate_catalog`: `answer_support_judgment_required`(B-4) +
  family 인스턴스 `answer_support_judgment_uses_frontier_observation`(R-1)
- registry `validators`: `answer-support-judgment-validator` (B-5)
- registry `maturation-answer-claims-validator`: conditional input + conditional 의무 (B-6)

검증: YAML 파싱 OK · 참조 체인 폐쇄 OK · `check:invariant-drift` = `no_drift`(G1~G5 passed,
G4 통과 → 보호키 무접촉·마커 불필요) · spec-defaults passed.

## 5. 다음 작업 (런타임 트랙 — 소스 레포 `onto-mcp-claude`, 격리)

계약은 planned로 착지했다. 활성화(`promoted_planned_gate_policy`: activation_condition 구현 +
required_when 참)를 위해 런타임에서:

1. activation_condition **`answer_support_judge_runtime_is_implemented`** 구현.
2. 별도 judge 파이프라인 단계 — `AnswerSupportJudgment → answer_support_judgment` 귀속
   (`UNIT_ID_BY_AUTHORED_ARTIFACT_NAME`에 추가; author≠judge 구조 보장의 근거).
3. evaluator 토큰 **`answer_support_ledger_has_convergent_source_evidence_cluster`** 구현.
4. `answer-support-judgment-validator`(B-5 의무 3종) + B-6 conditional 의무
   `require_convergent_source_evidence_claims_to_have_two_independent_judge_confirmed_supports` 런타임.
5. (선택) 터미널 집계 hand-list에 `answer-support-judgment-validation.yaml` 추가 — `dynamic_input_authority_rule`로 이미 자동 소비되나 힌트 정합용.

## 6. 반드시 읽을 것

- `development-records/design/20260614-boundary-recognition-procedure.md` — 절차·3-disposition·
  두 worked example(§6.1 갭-타이핑 철회 / §6.2 ODKE+ 진행 / §6.3 비교).
- `development-records/design/20260614-closure-hardening-registry-proposals.md` — apply-ready B
  블록·산정(tier/ripple)·§6 적용 완료 기록.
- `development-records/design/20260614-gap-typing-boundary-method.svg`(.png) — 경계 개념도.
- `development-records/design/20260614-reconstruct-maturation-closure-spike.md` — 스파이크(§4 매핑, §6 judge 경계).
- 계약: `reconstruct-contract-registry.yaml`, `ontology-seeding-and-maturation-design.md`.

## 7. 불변식 / 경계 (유지)

- **두 권위 분리**: LLM=의미, runtime=결정론. runtime은 빠진 의미를 몰래 채우지 않는다.
- **ODKE+ judge 경계**: judge=LLM은 per-evidence `supports` yes/no만, **sufficiency는 runtime 집계**
  (≥2 독립 + 각 judge-confirmed + 모순 bounded). **author≠judge는 아티팩트-단위 귀속으로 구조 강제.**
- **정지 기준은 신설 아님**: canonical = `MaturationContinuationDecision`.
- **materiality 한계**: 정지 신호·갭 materiality 모두 LLM-authored. 하드닝은 방향·충분성을
  결정론화하되 *중요도*는 못 굳힌다.
- **개념경제**: ODKE+ 신규 top-level 개념 = 1(`AnswerSupportJudgment`, lens_judgment 패턴 재사용 저비용).

## 8. 재신고 금지 (확정 결론)

- **갭-타이핑 divergence/absence 필드 신설 금지** — `closure_disposition`이 과결정(철회 확정).
- **라우팅 완전성 의무 신설 금지** — 기존 convergence-ledger-validation + M2가 양방향 커버.
- spike/감사 기존 no_change_confirmed 목록도 유효(2축 lifecycle·3형제 비병합 등).

## 9. 작업 규칙

- 권위 계약(.onto rank 1–5) **자동수정 금지** — 수정안 제시 → 사용자 확인 → 적용.
- 커밋은 사용자가 요청할 때만. 메시지 끝에 Co-Authored-By.
- 검증: `npm run -s check:invariant-drift`(no_drift), 참조 resolve, registry 이름 일치.
- 이 worktree에서 작업. 소스 레포(`onto-mcp-claude`)·`onto-mcp-l1a`는 격리 — **읽기만**.
