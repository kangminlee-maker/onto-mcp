# RESUME — NEXT 대형 cut = maturation 타깃 값-읽기 (설계-먼저)

> **START-HERE.** `/clear` 후 fresh 세션이 **이 문서 하나로** 이어받는다. 날짜 2026-06-30. baseline = main `c7ce481`(Defect-3 #156 + CQ-budget #157 머지 후). 이 cut = **설계-먼저** (grounding→설계 SSOT→ultracode+onto 교차검증→owner 승인→빌드). 아직 **설계 0줄**.

## 0. 한 줄
reconstruct의 **maturation 단계가 원천 값을 못 읽어** 값-의존 CQ를 해소 못 하고 first-pass에서 멈춘다(실-LLM 101MB 입증). NEXT = **maturation 타깃·LLM-판단 값-읽기 능력**을 설계·구축해, seed를 증거로 검증·성숙·교정한다.

## 1. 왜 (실-LLM ground truth)
유료 실-LLM A/B(Defect-3 검증 목적)서 발현. 증거 런 `.onto/reconstruct/defect3-ab-fix-rerun2/`(gitignored·101MB accounting-kr·`status: completed`):
- CQ-assessment **answerable 0** (partially 31·unsupported 17·not_applicable 13).
- seed-confirmation **partial** — 한계 `limitation_structural_only_observation`·`formula_coverage_incomplete`·`refund_liability_semantics_unresolved`·`order_key_mapping_unresolved`·`source_authority_unresolved`.
- maturation-baseline frontier-required **0** → maturation-question-frontier 질문 0 → answer-support 클러스터 **0** → 완주하나 **first-pass·not_ready·deep maturation deferred**.

**★교정(CLAUDE.md §33)**: 이전에 이 defer를 "정직한 종료/의도된 동작"으로 봤으나 **owner가 반증** — defer는 **maturation 값-읽기 부재의 *증상***. (대조: phase2-a2는 LLM 변동으로 클러스터 4개 작성→Defect-3에 걸림; rerun2는 0개.)

## 2. 근본 (코드 접지)
- spreadsheet 관측자 = **구조-only/aggregate**(설계상 raw 셀 값 제외; `spreadsheet-structure-observer.ts:244` "inventory is aggregate-only"). 시드는 이 구조 지도로 만든 *가설*.
- maturation에 **값-읽기 경로 없음**: maturation-closure-frontier는 **새 source 요청(`source_requests`)만**(`run.ts:3958+`)·기존 원천 값 재독 없음. leaf-read는 **seed-time 좁은 라벨 읽기**(저신뢰 컬럼 provisional label·`run.ts:305-321`). maturation 프롬프트도 같은 구조-only 관측 받음.

## 3. owner 확정 설계 원칙 (★ 설계 SSOT의 골격)
1. **역할 분리**: seeding = 구조-only로 **빠른 코어**(지도 + 온톨로지 시드). maturation = **질문에 답하려 원천 값을 읽음**(seeding의 구조-only 제약 안 받음).
2. **읽기 = LLM 판단**: *무엇을 읽을지*는 LLM 의미권한. 타깃·구조-유도(시드+인벤토리 = **어디를 먼저 볼지 강한 prior**)이되 **그 prior에 갇히지 않음**.
3. **시드 밖도 읽어야**: 시드는 **fallible 가설·틀릴 수 있음** → maturation이 **검증·반증**해야 하므로 시드가 안 가리킨 곳/다른 허용 자료도 LLM 판단으로 읽을 수 있어야. 어긋나면 **M4 ontology-expansion(이미 refine/reject 지원)**으로 시드 교정. = "gap-fill"이 아니라 "증거-접지 검증+성숙+교정".
4. **capability-boundary**: LLM = *무엇을 읽을지*(시드 시험 포함). capability 표면 = **허용 자료집합의 경계** = **source-safety 소비권한(Defect-3 모델·prompt_context/evidence_support)** + **읽기/프롬프트 예산**. LLM은 권한 밖 자료 못 읽음.
5. **인식론 1원칙**: **권위는 더 명백한 증거에서** 나온다. **모든 것은 falsifiable**(시드·이전 읽기·구조관측 포함). **근거·확률로 가중**(매번 수치계산은 아니되 정성적으로). 강한 증거 > 약한 사전결론.

## 4. 접지 (실현 가능·기존 인프라 위)
- **인벤토리가 위치 정밀 캡처**: `used_range`·`columns`(index)·`named_ranges`(refers_to)·`tables`(sheet/range)·`merged_ranges`·pivot source range·formula `applied_ranges` → "답이 어느 시트/컬럼/범위에" 타깃팅 충분.
- **타깃 영역-읽기 씨앗**: leaf-read `LeafReadRegionEvidence`/`readLeafLabels`(`run.ts:305-321`·`leaf-reader.ts`) — seed-time 라벨용이나 **maturation 값-읽기로 일반화/재사용 후보**.
- 어댑터 전행 스트리밍 가능(fflate+saxes·190K행). → 갭 = read 능력 아니라 **maturation 배선 + 값→프롬프트 투영 + LLM 위치-선택 권한**.

## 5. 연결 (방금 끝난 작업이 선결)
- **CQ-budget #157(머지)**: 값을 프롬프트에 넣으면 커짐 → 배치/예산이 *더* 중요. claim_realization_map scope·v6·budget이 이 cut의 선결 토대.
- **Defect-3 #156(머지)**: 값 소비 거버넌스 = source-safety 4-근거 권한 모델(A 출처/B 선언/C 사용자/D authority-response). maturation 값-읽기가 이 권한을 적용.

## 6. 남은 설계 결정 (cross-val 표적)
- 트리거/단계: closure-frontier 확장 vs **신규 maturation-value-read stage**(미답 CQ→위치 선택→값 읽기→answer-support 입력).
- 위치-선택 산물: LLM 선택의 결정론 경계(허용 범위·예산)·감사.
- 값→프롬프트 흐름: bounded 값 증거가 answer-support/CQ-(re)assessment에 도달(예산은 #157 위에).
- 시드 교정 경로: M4 ontology-expansion이 값-증거 기반 refine/reject를 충분히 받는가.
- 거버넌스: 값-읽기 = source-safety 소비권한 적용(권한 없는 자료 차단).

## 7. 상태/포인터
- **Defect-3 ✅ #156**(`development-records/design/20260629-defect3-answer-support-single-source-unblock-design.md`)·**CQ-budget ✅ #157**(`...20260629-cq-assessment-batch-budget-fix-design.md`). baseline main `c7ce481`.
- 실런 아티팩트(gitignored, A/B/gap 참조): `.onto/reconstruct/{phase2-a2-with-domain, defect3-ab-with-fix, defect3-ab-fix-rerun2}`.
- 메모리: [[unified-comprehension-engine-track]](전체 이력·이 cut 방향)·[[design-validation-ultracode-onto]]·[[contract-runtime-gap-ledger]]·[[domain-agnostic-no-static-enums]].
- **메타교훈**: 실-LLM A/B 1회가 (a)Defect-3 LIVE 검증 (b)CQ-budget 결함 (c)transient codex timeout (d)**maturation 값-읽기 부재**까지 연쇄 노출. mock이 가린 결함을 실런이 단계별로 드러냄 = [[contract-runtime-gap-ledger]]. 그리고 owner 교정이 내 "defer=정직" 과신을 반증 = 모든 결론은 가설.
