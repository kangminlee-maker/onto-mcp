# Reconstruct 개념 표면 — 정합성·개념경제 감사 원장

> **Type**: audit ledger (reference, non-authority).
> **Method**: ultracode workflow `reconstruct-concept-surface-audit` (run `wf_1833777d-808`).
> 9 소스 병렬 추출 → 통합 맵(373 개념) → 6차원 감사 → 적대적 검증 → 종합.
> **Scale**: 30 subagents · 2.32M tokens · 383 tool calls · ~25분.
> **Unified map**: [`20260614-reconstruct-concept-surface-map.md`](./20260614-reconstruct-concept-surface-map.md)
> **Policy**: 권위 계약 자동수정 없음 — 검증된 수정안만. **Date**: 2026-06-14.

## 0. 판정 (surface_verdict)

**개념 표면은 구조적으로 건전하고 동작을 깨는 논리 오류는 살아남지 않았다.** 런타임
contradiction 0건 — dual-lifecycle 충돌 의혹(XF-2, OL-1)과 dangling ref 의혹(DR-01)은
적대적 검증에서 **반증**됨. 남은 것은 런타임 결함이 아니라 medium-이하 **문서 위생 3주제**:

1. 같은 순위 계약 간 **상호 cross-reference 누락**(같은 개념을 두 스코프로 정당하게 투영하나
   서로 안 가리킴 — UX surface 3회·stop-signal 표 2회 중복 신고).
2. active rank-5 design 계약 안의 **stale 구현현황/일회성 recomposition 서술**(DEAD-1/2) —
   그 파일 자신의 위생 규칙이 금지하는 내용.
3. runtime-input 축 계열의 **lexicon 소유권·스코프 한정자 공백**(target_input_kind·
   artifact_roles 미등록 등).

> 최대 단일 이득: §16 recomposition 완료 서술을 active 계약 밖으로 이전.
> **모든 수정은 저위험 문서 정리이며 redesign 아님.**

## 1. 수정 필요 (errors_to_fix) — 검증 통과분, 전부 surface 보존

| # | sev | type | 위치 | 문제 → 수정 |
|---|---|---|---|---|
| E1 | low | contradiction | source-profile-contract §6 (L189-206) ↔ lexicon `TargetMaterialKind`(L1052) | §6의 전칭("Runtime must choose one of these")이 3값 support_state 위로 적혀 lexicon 4번째 값 `reserved_future`를 가림 → 스코프 명시("3개만 runnable; reserved_future는 non-runnable 어휘")+ lexicon/shared 계약 cross-ref. 런너블 enum엔 추가 안 함 |
| E2 | **medium** | ownership | maturation-design §5.2 표(L814-848) ↔ registry artifact_authorities(L1091-1105) | `baseline-actionability-matrix.yaml`(active 레지스트리 artifact, 고유 lifecycle)가 §5.2 표에서 누락 — 유사명 3형제 혼동 위험 → **병합 금지**, 누락 행 + 각 행 역할 식별자 1줄 추가. registry가 canonical identity |
| E3 | low | naming | shared target-material-kind-contract §3(L62-70) ↔ lexicon(L1034-1051) | `target_input_kind`·`artifact_roles`가 lexicon-anchored 축들과 peer로 나열되나 lexicon term 아님(거짓 peer 대칭; source_kind도 미anchor → 실제 3 anchored vs 3 unanchored) → 어느 축이 lexicon-owned vs review-contract-local인지 주석 + owner(review-target-profile §5) 인용. **[open_q #1에 의존]** |
| E4 | low | lifecycle | shared target-material-kind-contract 헤더(L3)·§8(L160) ↔ registry(L1240) | 헤더/§8이 "design goal/planned"로만 말해, reconstruct 슬라이스에선 target-material-profile.yaml/material_profile_gate가 이미 contract-active임을 signpost 안 함 → "reconstruct 슬라이스는 registry상 active; planned는 runtime_implementation_status·review/evolve 채택에 해당" 1줄. registry 불변 |

## 2. 정리 기회 (cleanup_opportunities) — 사용자 요청(중복·불필요)

| # | action | surface | 대상 | 처리 |
|---|---|---|---|---|
| C1 | **relocate** | reduce | maturation-design §16 "Completion Definition For This Recomposition"(L3467-3555, 18+19 체크리스트) | active dependents 0(.onto review 스냅샷만 제목 참조). §15 stage 출력·§5.1 기준을 재서술하는 일회성 recomposition 대시보드 → IMPLEMENTATION_MAP/development-records로 이전. **최대 중복 제거.** **[open_q #2 관련]** |
| C2 | relocate | reduce | maturation-design §15 구현현황 산문(L3086-3170) | 현재시제 변경 서술(repair-loop·timeout staging·scout policy 등) — stale-prone, dispatch 비소비. registry+IMPLEMENTATION_MAP 포인터 1줄로 대체. "Required test path"·Stage Expected-result(진짜 의미)는 보존 |
| C3 | consolidate | reduce | shared §9 UX(L180-208) ↔ reconstruct-execution-ux-contract §§2-6 | 같은 순위 두 계약에 opening/progress/result 스켈레톤 중복, **상호 cross-ref 0**(양방향 grep 확인). §9는 cross-process material 투영이라 **전체 이전 금지** → §9를 material-kind delta로 한정 + UX 계약 cross-ref, 역방향 포인터 추가 |
| C4 | consolidate | reduce | maturation-design §10 "two stop signals" 표(L2424-2429) ↔ 13조건 표(L2392-2406) | re-question 쌍만 진짜 근접중복(Matrix closure는 합성). 표를 명시적 projection으로 표기, 표현 drift 통일. **삭제 금지**(re-question closure는 L1114·L1571 권위 참조). 최저가치(nit) |

## 3. 무변경 확인 (no_change_confirmed) — 재신고 방지

검증에서 "설계상 옳음"으로 판정 → **다시 오류로 신고하지 말 것**:

1. **XF-2 반증**: target-material-profile 2축 모델(contract_status:active vs runtime_implementation_status:planned)은 권위-정확. §6이 이미 registry에 status 권위 위임. active vs planned gate 카탈로그 분리 정상.
2. **DR-01 반증**: `target_input_kind`는 dangling 아님 — review-target-profile-contract §5(L114-124) owning seat + TS type `ReviewTargetInputKind` + 런타임 emission. (lexicon 미배치 nuance만 E3.)
3. **reserved_future**: 런너블 3값 enum과 registry partial_composite_only는 정합. reserved_future는 정의상 non-runnable → 런너블 enum 추가 금지.
4. **shared §9**: cross-process(review/reconstruct/evolve) material 투영 — 삭제 대상 중복 아님. material delta 보존, 일반 스켈레톤 중복+cross-ref만 C3.
5. **Matrix closure**: L4 매트릭스+7차원 위 합성 — 단일 행 재서술 아님. stop-signal 표는 named 개념(re-question closure)의 정의 거처. dead content 아님.
6. **baseline/matrix 3형제**: maturation-baseline·baseline-actionability-matrix·actionability-matrix는 lifecycle 상이(immutable seed-derived / immutable zero-delta / mutable current) → **병합 금지**. 결함은 §5.2 표 행 누락(E2)뿐.

## 4. 열린 결정 (open_questions) — 인간 판단 필요

1. **runtime-input 축 계열 lexicon 소유권 경계** (E3 해법 결정): `target_input_kind`·`artifact_roles`(·`source_kind`)를 rank-1 lexicon term으로 승격(peer 축 단일 canonical 소유, SSOT 논리) vs review-contract-local 유지+주석(product-locality, review 전용 축을 shared lexicon 밖에). 셋 다 일관 처리 필요.
2. **통합 완료 리스트 vs 단계별 기준** (C1 이전 후): §16 이전 뒤, §5.1식 통합 완료 리스트를 maturation에도 병렬로 둘지(현재 §5.2엔 없음, "Done when" 표로 분산) vs 단계별 §15 기준만 canonical로. §16 이전이 maturation-완료 공백을 남기는지에 영향.
