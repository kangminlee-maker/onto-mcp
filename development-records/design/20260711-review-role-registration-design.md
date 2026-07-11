# review role 등록 구조 설계 — author-role 순환 해소 (INV-MODEL-1 확장)

- 상태: **설계 v2 owner 승인 완료 (2026-07-12)**. O1~O7 권고안 채택. 구조 단계 1~4는 현재
  구현을 승인된 설계의 실현으로 채택하고, 진행 중인 Sol cert run은 기존 `max-attempts=12` 경계 안에서
  완료까지 허용한다. Fable cert spend는 Sol 결과와 R7 판단 뒤 별도 결정한다. v1 → v2: 독립 적대
  리뷰 2렌즈(코드접지·설계공격)의 material 9건 반영 — 핵심은 quality 축 재설계(이진 parity 폐기),
  witness 신규 기계 인정, R7 큐레이션 복원.
- 날짜: 2026-07-11
- 선행: `20260704-inv-model-1-role-aware-design.md` (role-aware v4), B4/B5 synthesize-cert 선례
- 관련 커밋: 5afae90(luna 인증), d7eb9f9(synthesize seat 승격)

## 0. 목표와 완료 조건

**목표**: review 파이프라인에서 완주 증거를 가진 모델(gpt-5.6-sol, claude-fable-5 등)을
review seat에 **등록 가능**하게 만든다. 현재 review seat은 dispatch-role 해석에서
fail-closed 기본값인 `author`(golden 전체 파이프라인 인증)를 요구하는데, review 용도
모델에 author 증거를 요구하는 것은 증거-사용 불일치이며, review에 걸맞은 role/계약이
없어 등록 경로 자체가 부재하다.

**완료 조건(설계 단계)**: 옵션 비교 + 권고안의 개념 설계·증거 계약·게이트 진화·구현
순서가 확정되고 owner가 승인한다. 2026-07-12 충족. 구조 구현과 현재 Sol cert run은 승인됐으며,
Fable cert run은 별도 spend trigger다.

## 1. 코드 근거 재확인 (2026-07-11, HEAD d7eb9f9; v2에서 F5 정정·F9 보강·F10~F16 추가)

| # | 사실 | 근거 |
|---|---|---|
| F1 | role 어휘는 5종으로 봉인: author / semantic_map_synthesize / semantic_map_verify / answer_support_judge / confirmation_provider — **review 계열 role 부재** | `supported-models.ts:48-54` |
| F2 | review seat(actors·units)은 dispatch 해석의 **default 분기**로 `author` 요구(fail-closed): "Review seats, salvage transcription, top-level llm, and any future unmapped path: require the strongest certification" | `supported-models.ts:196-199` |
| F3 | `CONTRACTED_ROLES = {author, semantic_map_synthesize}` — 성장은 "evidence contract 정의 + INVARIANT-CHANGE: INV-MODEL-1 마커" 명시 | `supported-models.ts:58-68` |
| F4 | review 등록의 실제 차단 지점은 **G7(커밋된 settings)뿐**: review runtime은 gate를 호출하지 않음(`assertSettingsModelsSupported` 호출처 전수 = reconstruct live 경계 `reconstruct-api.ts:1104` + G7 `check-supported-models.ts`). 미등록 모델의 review **벤치 실행**은 uncommitted settings로 이미 가능 — 차단되는 것은 seat의 **커밋(등록)** | 호출처 전수 재확인 · 설계 v4 §2.3 N3 |
| F5 | **(v2 정정)** B5 binding은 **존재형(passing record 1개 이상)** — v4 §3의 "정확히 1개" 문구는 §13 빌드 레코드("1개 이상 필수")가 대체했고 shipped 코드가 §13을 따름. 실패한 co-cited record는 위반이 아니라 **WARN**(laxness-lens S2 정직 표면화) | `synthesize-cert-record.ts:992-997,1086-1095` · `check-supported-models.ts:191-203` |
| F6 | review 품질 판정기 존재: review semantic-quality-gate — 12 check_id × fixture 2종(`review-pipeline-target-v1`, `retry-policy-target-v1`), `applicability: real_model_only`, `scope: fixture_specific` | `review/semantic-quality-gate.ts:1-40,766` |
| F7 | review dispatch 표면(gate walk): `review.execution.actors.{teamlead,lens,synthesize}.llm`(+legacy `review.execution.{actor}.llm`), `review.execution.units.<unitId>.llm`(actor llm 위 merge), salvage transcription(salvage.enabled 조건부), top-level `llm` | `settings-chain.ts:1666-1740` |
| F8 | grandfathered 엔트리(roles 부재: gpt-5.5, opus-4-8)는 전 route 허용; **grandfather 집합 밖 신규 엔트리는 roles 선언 필수** | `check-supported-models.ts:128-148` |
| F9 | sol 25/25·fable5 41/41(2026-07-10)은 runs=1·fixtures=1 PRELIMINARY, 커밋 record 없음. **(v2 보강)** fable5는 `20260611-fable-model-benchmark-record.md`(review 완주, 3 온톨로지 fixture) 커밋 record가 있으나 1 run/fixture PRELIMINARY이고 cert-record 형태 아님 → 등록엔 신규 cert run 필요(INV-BENCH-1) | 세션 메모리 · `development-records/benchmark/` |
| F10 | **(v2)** semantic-quality-gate 12 check는 **전부 결정론**(모듈 내 LLM/judge 참조 0) → "LLM-판정 check rejudge" 대상 0개. `b4-rejudge.mts`는 judgement-row 구조 전용 | `semantic-quality-gate.ts` 전수 grep |
| F11 | **(v2)** gate 방출 check 수는 caller의 `issueArtifacts` 유무로 7/11/12개 변동(부재 시 실패가 아닌 **부재**), 커밋 record엔 현행 gate에 없는 check id도 존재(드리프트 실증) → check universe 핀 없으면 parity 정의 불능·게임 가능 | `semantic-quality-gate.ts:295-314` · 20260609 record들 |
| F12 | **(v2)** baseline(gpt-5.5)은 커밋 record에서 핵심 check를 **확률적으로 실패**(예: retry fixture record에서 `material_issue_recall` 2 run 연속 실패; false_materiality_guard·boundary_uncertainty_preservation 반복 실패) → run당 이진 parity는 노이즈 지배·공허 방향 실증 | `review-semantic-quality-regression-retry-20260608.json` runs/0·1 직접 확인 |
| F13 | **(v2)** B4 witness(capture)는 **in-process callLlm 래퍼**(`createB4LiveCallHarness`) — b4 스크립트 전용. review는 **spawn worker CLI** 경로(codex/claude executor)로 dispatch하고 capture sidecar·model_id echo가 없음(inline-http executor만 model_id 방출) → B4 witness "재사용" 불가, 신규 기계 필요 | `b4-live-realization.mts:248-304` · `codex-review-unit-executor.ts` · `inline-http-review-unit-executor.ts:1417` |
| F14 | **(v2)** nested-workers topology는 main-workers에 없는 **outer teamlead LLM dispatch**를 추가 — main-workers cert만으로는 후보가 outer worker로 한 번도 실행되지 않음 | `run-review-prompt-execution.ts:4293,4371` |
| F15 | **(v2)** salvage transcription(타 모델 전사)·resubmit/delta-completion이 unit 완주에 기여 가능 — cert run에서 핀하지 않으면 후보 아닌 모델이 support 증거를 오염 | `claude-code-review-unit-executor.ts:199-300` · 커밋 settings `retry.resubmit.enabled=true` |
| F16 | **(v2)** 동시대 baseline-arm 기계 부재: 기존 review 벤치의 baseline/candidate는 effort 축·단일 `--model` — quality 비교엔 baseline 전체 파이프라인 재실행이 필요(≈2× spend) | `review-pipeline-benchmark.ts:453,491-547` |

**메모리 주장 정정**: "미인증 모델을 파이프라인에 태울 경로 없음"은 부정확 — F4에 따라
runtime gate가 없어 uncommitted settings로 벤치 실행은 가능하다. 순환의 정확한 형태는
"**등록**(커밋된 seat)이 author 증거를 요구 ↔ review 용도에 author 증거는 불일치·과잉"이다.

## 2. 옵션 비교

| 옵션 | 내용 | 평가 |
|---|---|---|
| **A (권고)** | `review` role 신설 + `review-cert/v1` 증거 계약 + G7 binding 확장 | 목표 직결. B4/B5 선례 구조 준용. INV-MODEL-1 마커 1회. 단 v2 기준 비용 정직화: witness 신규 기계 + baseline 재실행 ≈2× spend + R7 큐레이션 단계 |
| B | bench-candidate allowance를 review route로 확장 | 벤치만 허용, **등록 불가** — 목표 미충족. F4상 벤치는 이미 가능해 실익 없음 |
| C | author cert(golden 전체 파이프라인)로 우회 등록 | 증거-사용 불일치, 비용 과잉, review 품질축(F6) 우회의 역방향 laxness |
| D | unit별 role 세분화(review_lens, …) | 완주 증거가 파이프라인 단위(F9)라 unit별 계약 비현실적, 어휘 비용 과잉 |

## 3. 개념 설계 (옵션 A)

- **어휘**: `SUPPORTED_MODEL_ROLES` += `"review"` (5→6종). 근거 seat: review 실행 계열
  전체(F7의 actors+units). 이름은 feature명과 동일한 광의 개념(`review`) — seat 경로
  접두(`review.execution.*`)와 일치해 grep-추적 가능.
- **dispatch 매핑**: `requiredSupportedModelRoleForDispatch`에 review 경로 매핑 추가 →
  `"review"`. **(v2, M-5)** 매핑 경계를 핀한다: unit 경로는 동적이므로 리터럴 switch가
  아니라 **`REVIEW_EXECUTION_UNIT_IDS` membership으로 바운드된 패턴**(모범:
  `settings-chain.ts:1683-1688` reviewUnitOf 재사용)이어야 하며, legacy
  `review.execution.{teamlead|lens|synthesize}.llm` 폼도 명시 포함. **미지 unit/경로는
  현행 default `author` fail-closed 유지**(약화 금지). salvage transcription·top-level
  `llm`도 `author` 유지(스코프 밖).
- **CONTRACTED_ROLES** += `"review"` — F3 규칙대로 `INVARIANT-CHANGE: INV-MODEL-1` 마커
  (어휘+매핑+계약이 한 커밋).
- **registry**: 신규 모델은 `roles: [review]`로 등록 → review seat에서만 유효.
- **(v2, L-1 정직화)** 이 매핑 변경은 opt-in 없는 **상시 적용** 변경이다. 현행 registry
  기준으로는 G7 no-op임이 확인됨(review seat 전부 grandfathered gpt-5.5; sonnet-5/luna는
  synthesize role만이라 무영향; `roles:[author]` 엔트리는 0개) — 단 이는 registry-상태
  의존 사실이므로 1단계에서 **diff/테스트로 증명**하고, 미래 `roles:[author]` 엔트리는
  review seat에서 valid→invalid로 플립됨을 계약 주석에 명기한다.

## 4. review-cert/v1 증거 계약 (v2 재설계)

B4 선례의 **최종 확정 경계**(v4 §13.3: 결정론 게이트 = 구조·일관성·집계만, candidate
품질·변별 실효·정직성 = **R7 사람 큐레이션**)를 그대로 준수한다. v1의 "run당 이진
parity"는 F12로 공허가 실증되어 폐기.

- **support 축**: 후보가 review 파이프라인 전 유닛 완주. ≥3 reps × ≥2 fixtures
  (INV-BENCH-1; fixture는 F6의 2종 기본). **(M-1)** cert run 설정에서
  `retry.salvage.enabled=false`·`retry.resubmit.enabled=false`를 **핀**하고 record가
  설정 핀을 증명(rescue 채널로 타 모델이 완주에 기여하는 오염 차단). transport 손실의
  정직 not_run 처리는 B4 89/90 선례 준용.
- **quality 축 (재설계)**: 동시대 **baseline arm**(현행 shipping 모델, registry 등록
  모델만; 동일 reps×fixtures — F16 비용 ≈2× 명시) 대비, **check별 pass-rate 집계 비교**:
  fixture×check마다 후보 pass-rate ≥ baseline pass-rate (B4의 decisive-rows mean 준용).
  추가로 **core check 절대 floor** — `material_issue_recall`,
  `final_result_material_issue_recall`, `grounding`은 baseline 성적과 무관하게 후보
  pass-rate 절대 하한을 요구(F12의 "baseline 실패로 핵심 check 면제" 봉쇄; floor 값은
  O5). rep 집계 semantics는 이 rate 정의로 확정(any/all 이진 비교 아님).
- **check universe 핀 (M-2)**: record가 gate 모듈 버전(sha)·check_id 전집합·
  `issueArtifacts` 제공 여부를 핀. **12종 전부 방출된 run만 유효 rep**(7/11-check run은
  rep으로 불인정). G7 재계산 = record에 임베드된 per-rep check rows에서 rate·floor
  **집계 재계산**(B5의 judgement-rows 재계산 준용) + universe 핀 검증.
- **R7 큐레이션 (H-2)**: 결정론 게이트 통과 후, candidate 품질·변별 실효·정직성의 최종
  판정은 **R7 사람 큐레이션 단계**가 담당(B4와 동일 경계). rejudge 조항은 v2에서
  **삭제** — F10상 12 check 전부 결정론이라 대상이 없다.
- **witness (H-1, 재설계)**: B4 capture는 재사용 불가(F13). 신규 기계 최소안 —
  **cert 하니스가 executor spawn 인자(-m model, model_reasoning_effort 등)를 capture
  line으로 기록**하고 record `arm_dispatch`는 그 projection(하니스 소유, 제품 경로
  무변경). worker stdout 메타 확장(model/effort echo)은 선택 확장으로 분리(O7).
  `synthesize-cert-assemble.ts` projection은 unit별 effort 혼합(커밋 settings의
  deliberation_resolution=low)에 false-throw하므로 **review 전용 projection**이 필요
  (call-kind/unit 축 포함) — 재사용 아님을 명시.
- **record**: `record_contract: "review-cert/v1"` 자기식별, `arm_model` declared brand,
  binding은 **존재형(1개 이상, F5 정정 반영)** + 실패 co-cited record는 WARN —
  `assertReviewCertBinding`은 B5 예의 semantics를 그대로 복제.
- **topology 핀 (M-3)**: cert run은 `main-workers`로 핀. nested-workers의 outer
  teamlead dispatch(F14)는 **미커버 한계**를 record·registry notes에 명기 — nested
  teamlead seat에 role-제한 모델을 두는 것은 이 cert가 승인하지 않음(O6에서 범위 결정).
- **fixture 한계 (L-2)**: gate 자기선언 scope가 `fixture_specific`이고 fixture 2종이
  소형 합성 타깃이므로, 실 repo 규모로의 외삽 한계를 record 산문에 명기.

## 5. 승인된 구현 프로세스

| 단계 | 내용 | 검증 |
|---|---|---|
| 1 | 어휘 `review` + 매핑(§3 경계 핀) + CONTRACTED_ROLES + zod (INVARIANT-CHANGE: INV-MODEL-1 커밋) | **구현 완료** · typecheck · 매핑 단위테스트(양성/음성 + 미지 unit 경로가 author 유지되는 fail-closed 테스트) · **현행 registry G7 no-op 증명**(L-1) · G4 |
| 2 | review-cert record 모듈(파서·validate·rate/floor 재계산·universe 핀) — core-runtime 공유 | **구현 완료** · 단위테스트 + 고의 위반 fixture(음성대조: floor 미달·universe 불일치·rescue 오염) |
| 3 | G7 `assertReviewCertBinding`(존재형) 확장 | **구현 완료** · G7 실행 + 고의 실패 record 음성대조 |
| 4 | cert 하니스: baseline+candidate 2-arm 러너(F16 신규) + spawn-인자 witness capture(H-1 신규) + review 전용 projection | **구현 완료** · mock 리허설(B4 [D] 선례) + witness 음성대조(선언≠capture 시 fail-loud) |
| 5 | cert run(Sol 우선) + **R7 큐레이션** + registry 등록 커밋 | **Sol run 진행 승인** · rate/floor 게이트 + witness guard + G7 + R7 기록. Fable은 별도 spend 결정 |
| — | 각 단계 종료마다 해당 게이트 + 다중렌즈 교차리뷰(material 0까지) | 가이드 Review Loop |

**redesign trigger (v2 교체)**: ① baseline 플레이크가 커서(rep 증가로도 rate 비교가
판별력 상실) quality 축이 노이즈 지배로 남으면 §4 재설계(reps 증액 또는 check 가중 재검토).
② topology별 유닛 구성 분기로 "완주" 정의가 갈라지면 support 축 재정의. ③ 구현 중 review
seat 경로가 F7 목록 밖에서 발견되면 매핑 재검토(경계 확장 → stop-and-ask).

## 6. Owner 결정 (2026-07-12 승인)

| # | 결정 | 기본값(권고) |
|---|---|---|
| O1 | role 이름: `review` vs `review_unit` | **`review` 승인** |
| O2 | review runtime enforcement(라이브 경계 gate) 포함 여부 | **제외 승인**(N3 유지 — 포함 시 review용 bench allowance 결합 필요) |
| O3 | cert run spend 범위 — **(v2) baseline 동시대 재실행 포함 ≈2×**(후보 arm + baseline arm, 각 ≥3 reps × 2 fixtures) | **구조 1~4 + 현재 Sol run 승인**. 현재 run은 기존 `max-attempts=12` 상한을 유지하고 partial evidence를 resume한다. 새 모델 run은 별도 spend 결정 |
| O4 | fable5(anthropic) 동시 cert run 여부 | **Sol 우선 순차 원칙 승인**. Fable 실행 자체는 Sol R7 뒤 별도 결정 |
| O5 | **(v2)** core check 절대 floor 값(material_issue_recall 등 3종) | **후보 pass-rate ≥ 2/3 승인**(reps=3 기준 2회 이상) |
| O6 | **(v2)** nested-workers 커버리지: main-workers 핀 cert의 한계 수용 vs nested arm 추가 | **한계 수용 승인** — nested teamlead는 grandfathered 모델 유지 |
| O7 | **(v2)** worker stdout 메타(model/effort echo) 확장 여부 | **제외 승인** — 하니스 spawn-인자 capture를 witness authority로 사용 |

### 6.1 승인 경계와 프로세스 정정

- 이 승인은 `INV-MODEL-1`의 `review` role과 `review-cert/v1` 증거 계약, G7 binding, main-workers
  cert 하니스에 한정된다. review runtime gate, nested arm, worker stdout 계약은 승인하지 않는다.
- registry 등록은 cert record의 결정론 gate 통과만으로 자동 수행하지 않는다. Sol 결과를 R7 사람이
  큐레이션한 뒤 별도 등록 커밋으로 진행한다.
- 구조 단계 1~4와 cert resume 구현 커밋이 정식 owner 승인보다 먼저 생성된 사실을 확인했다. 2026-07-12
  owner가 실코드 상태와 O1~O7 결과를 확인하고 현재 구현을 채택했다. 이 순서 역전은 향후 보호 변경의
  선례가 아니며, 다음 `INV-MODEL-1` 확장은 구현 전에 owner 결정을 기록한다.

## 7. 스코프 제외

- salvage transcription·top-level llm의 role 세분화(author 유지)
- semantic_map_verify / answer_support_judge / confirmation_provider의 계약 정의(현상 유지)
- review 품질 게이트 자체의 check 구성 변경(F6 재사용, 무수정 — 단 §4의 universe 핀은
  record 측 계약이지 gate 수정이 아님)
- worker stdout 메타데이터 확장(O7 기본 제외)

## 8. 리뷰 이력

- v1 → v2 (2026-07-11): 독립 2렌즈 리뷰(코드접지 lens: material 1 — F5 존재형 정정 /
  적대 lens: material 8 — B-1 이진 parity 공허(F12), H-1 witness 재사용 불가(F13),
  H-2 rejudge 무대상·R7 누락(F10), M-1 rescue 오염(F15), M-2 universe 드리프트(F11),
  M-3 topology(F14), M-4 baseline 비용(F16), M-5 매핑 경계). 전 건 실코드·실데이터
  재검증 후 반영. 잔여 material 0 (v2 기준 자체 평가 — 승인 전 재리뷰 권장).
