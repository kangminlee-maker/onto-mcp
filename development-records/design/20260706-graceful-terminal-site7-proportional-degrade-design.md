# site 7 비례-종결 설계 — judge-shortfall valid-degraded (graceful-terminal 트랙 별도 cut)

> 상태: **v3 확정 — 빌드 계약** (3-lens + 2-audit 전 반영·§9.5 종결 판정) · owner 결정 2026-07-06: **(b) 비례 종결**.
> 교차검증 기록: §9.
> 상위 SSOT: `20260701-shared-graceful-terminal-step1-design.md` §11 (site 7 = 별도 cut · 택1).
> 선례: `20260705-graceful-terminal-sites356-wiring-design.md` (프로세스만 계승 — 기계는 계승하지 않음, §3.1 참조).
> 핀 기준: main `5d47088` (= branch `feat/graceful-terminal-site7` 분기점).

## 0. 목적 · 범위 · done-when

- **목적**: run.ts:16219 (maturation-answer-claims assert)의 "정직한 judge 거부 → 실행 전체 크래시"를,
  **이미 존재하는 결정론 중요도 저울**(actionability materiality → continuation decision)에 넘기는
  비례 종결로 대체한다. claim 1개의 검증 실패가 중요도와 무관하게 전체를 세우는 과잉 반응 제거.
- **범위**: maturation-answer-claims validator의 fail-closed 분기 재절단(§4) + 강등 소비의 단일
  choke point 배선(§5) + 공개 표면 정직 공개(§6). **site 4는 제외**(§2.2 — 구조적 편입 불가 확정).
- **비-범위**: GracefulTerminalSignal/assembleGracefulTerminal 기계는 **이 cut에서 사용하지 않는다**(§3.1).
  authoring 프롬프트 무변경(카탈로그 sha 무회전). LLM 호출 0.
- **done-when**:
  1. 정직-judge-거부(§4.1 normal-unmet 판정식 참)에서 run이 크래시 없이 완주하고, continuation
     decision이 materiality에 비례한 상태(blocked/ask_user/actionable_limited/actionable_ready)로 종결.
  2. 저자-부실(판정식 거짓: pool ≥ 2인데 미달 인용) · judge 부재/invalid는 **기존 그대로 크래시**(음성대조).
  3. 강등된 claim이 어느 하류 표면에서도 확증(convergent-certified·L3/L4 상승 기여)으로 소비되지 않음
     — 세탁 음성대조 테스트로 입증.
  4. 강등 발생 사실이 기존 limitation 채널로 최종 공개 표면까지 전파(정직 공개).
  5. 강등 조건 미발생 런은 하류 아티팩트 동작 불변(대조).

## 1. 재핀 (main 5d47088 실측 · 2026-07-06)

| 대상 | 구 핀(census 2026-07-01) | 현 핀 | 확인 |
|---|---|---|---|
| site 7 assert `maturation-answer-claims` | run.ts:14123 | **run.ts:16219** | +2096 순수 평행이동(게이트 간 간격 동일) |
| ontology-expansion assert | 14148 | 16244 | |
| actionability-matrix assert | 14187 | 16283 | |
| maturation-source-delta assert | 14211 | 16307 | |
| maturation-convergence-ledger assert | 14254 | 16350 | |
| continuation-decision assert | 14289 | 16385 | `decision_state` 4단계 비례 어휘 실존 |
| claims validator judge 게이트 | — | maturation-validation.ts:3239-3268 (judgeActive/judgeSupported) · 3378-3413 (per-claim 카운트) | |
| cluster-레벨 동일 코드 | — | maturation-validation.ts:3176 (ledger validator — **별도 아티팩트**, 이 cut 무관) | |
| site 4 assert `source-purpose-candidates` | run.ts:12688 | run.ts:14637 | §2.2 |

## 2. owner 결정 기록 (2026-07-06)

### 2.1 site 7 = (b) 비례 종결
- owner 질문(결정 유발): "claim 1개 검증 불가가 전체를 멈출 사유가 되나? 중요도의 객관 판단 필요."
- 코드 재확인 결과 이 질문이 (a) 권장의 전제("어차피 둘 다 blocked")를 반증:
  `buildMaturationContinuationDecisionArtifact`(maturation-validation.ts:4689)는 **순수 결정론**이며
  materiality(blocker/high)만 저울질해 4단계 비례 결론을 냄. (a)는 이 저울 앞에서 전체를 세움
  (크래시가 정중해질 뿐, 비례성 없음). step1 §12.2 Q2(두 패밀리 수렴: short-circuit의 유효
  아티팩트 폐기·terminal 중복)와 owner 기준이 독립 수렴 → (b) 확정.

### 2.2 site 4 = 편입 불가 (이 cut에서 확정 판정)
- 정상-미충족 신호(`insufficient_inferred_evidence`·`contradiction_unresolved` —
  purpose-authority-validation.ts:281·294)가 **검증 대상인 저자 자신의 self-report 필드**
  (evidence_kind_refs P1~P5 분류 = LLM 판단)에서만 도출됨. site 7의 judge처럼 독립된 2차
  아티팩트가 없어 "소스 빈약 vs 저자 부실"을 가를 결정론 pool이 존재하지 않음.
- 편입 경로(별도 계약 cut·이번 범위 밖): "purpose 확정 불가"를 1급 positive outcome 필드로
  승격(site 5 confirmation_status 패턴) 후 소스필드 positive check.

## 3. 핵심 구조 발견 (실코드 · 설계의 토대)

### 3.1 이 cut은 graceful-terminal *기계*를 쓰지 않는다
(b)에서는 강등 시 claims validation_status가 "valid"로 유지되므로 **run.ts:16219 assert가
그 경우 발화하지 않는다**. GracefulTerminalSignal·조립부·manifest graceful 변환·final-output
문구(run.ts:1126의 "did not reach semantic authoring" — site 7에선 거짓이 될 문구) 전부 무관.
종결은 파이프라인 **자연 완주**다. run.ts 변경 최소(assert 자체는 그대로 — 저자-부실·기타
violation에 대한 버그 탐지기로 계속 발화).

### 3.2 중요도 저울은 이미 존재하고 결정론이다
- matrix 빌더(maturation-validation.ts:1015): claims validation invalid → **claims 전량 무시**
  (전량-강등의 선례 의미론이 이미 있음 — 본 설계는 이를 per-claim으로 비례화하는 것).
- positive claim 필터(빌더 1085-1088 · 검증기 1536-1540 **대칭 재계산**):
  `answer_status==="answered" && limitation_refs.length===0`만 L3 상승 기여;
  L4는 positive claim ∧ positive expansion.
- `deriveMemberReadiness`(458): residual limitation > 0 → limitation_backed (공유 도출·빌더/검증기 동일).
- continuation(4689): material(blocker/high) 행만 저울질 → 4단계 비례 + `limitation_refs` 공개 채널.

### 3.3 normal-unmet vs 저자-부실의 결정론 분리 가능 (site 7 고유 이점)
judge 판정(`judgeSupported`: `${cluster_ref}#${evidenceRefKey}` → INDEPENDENCE 재키
`source_ref:location`)이 **저자와 독립된 2차 아티팩트**이므로:
- **pool**: claim이 인용한 clusters 안의 judge-supported ref들의 INDEPENDENCE-키 집합.
- pool < 2 → 어떤 인용을 했어도 확증 불가 = **judge의 정직한 거부** = normal-unmet → 강등.
- pool ≥ 2 ∧ claim 자신의 confirmed < 2 → **저자 부실 인용** = 버그 → violation 유지(크래시).
- judgeActive === false(judgment 부재/invalid) → 인프라/버그 → `prior_validation_invalid` 유지(크래시).

## 4. 설계 — validator 분기 재절단 (maturation-validation.ts:3390-3413)

### 4.1 판정식 (결정론·positive · ★masking-F1 반영: 대조 통제 추가)
convergent_source_evidence claim에 대해 (judgeActive 전제):
```
questionClusters = { c ∈ ledger.evidence_clusters | c.support_mode === "convergent_source_evidence"
                     ∧ claim.question_id ∈ c.question_refs }
  // ★conformance-MED-1 재절단: pool 범위 = 인용 clusters가 아니라 "그 질문의 convergent cluster
  //   전체". 인용-범위 pool은 cluster 미인용 저자-부실(풍부한 타 cluster 누락)을 normal-unmet으로
  //   오분류. 질문-범위 pool이면 "그 질문에 대해 어떤 저작도 확증 불가"가 진짜 소스-레벨 명제가 됨.
poolIndependent = { independenceKey(j.evidence_ref) | j ∈ answerSupportJudgment.judgments,
                    j.supports === "supported", j.evidence_cluster_ref ∈ questionClusters }
  // ★pool 소스 핀(masking hazard·conformance-LOW-4): judgment 아티팩트의 supported 항목을 직접
  //   순회(judgeSupported 문자열 Set에서 독립키 도출 불가). judgeActive 하에서 judgment 비-null 보장.
  //   claim.supporting_evidence_refs 경유 join 금지 — 미래 직렬화 발산 시 false-degrade 방지.
claimConfirmed  = 기존 3390-3405 계산 (claim 자신의 인용 중 judge-confirmed·INDEPENDENCE 키)
judgeFunctioned = judgeSupported.size > 0   // 런-레벨 대조 통제(★F1): judge가 어디선가
                                            // 최소 1건 supported = 기능 실증
```
- 건전성(conformance 렌즈 증명·인용-범위판): claimConfirmed ⊆ pool — evidenceRefKey가
  independenceKey를 강결정하므로 pool<2 ⟹ claimConfirmed<2 (강등 안전), pool≥2 ⟹ 저자 도달
  가능 (크래시 정당). 질문-범위 재절단은 pool을 **확대**만 하므로(인용 clusters ⊆ 질문 clusters가
  아닐 수 있으나, 타-질문 cluster 인용 시에도 강등 판정은 "그 질문의 확증 가능성" 기준이 옳음)
  강등 방향 안전성 보존·저자-부실 탐지력 강화.
| 조건 | 판정 | 처분 |
|---|---|---|
| claimConfirmed ≥ 2 | 확증 | 기존대로 통과 |
| claimConfirmed < 2 ∧ poolIndependent < 2 ∧ **judgeFunctioned** | normal-unmet | **강등** (violation 아님) |
| claimConfirmed < 2 ∧ poolIndependent < 2 ∧ ¬judgeFunctioned | **judge 전면 붕괴 의혹** | violation 유지(크래시) — ★F1 |
| claimConfirmed < 2 ∧ poolIndependent ≥ 2 | 저자 부실 | violation `insufficient_independent_evidence` 유지 |
| judgeActive false | 인프라/버그 | violation `prior_validation_invalid` 유지 |

★F1 근거(실코드 재검증 2026-07-06): judgment validator는 enum·rationale·convergent coverage만
검사(6455-6505)하고 `supported_judgment_count`는 계산·투영만(6476·6516) — **전면 not_supported도
valid**. 대조 통제 없이는 judge 붕괴(모델 열화·rate-limit fallback의 보수 판정 등)가 "조용한 전량
강등"으로 은폐됨. `judgeSupported.size===0 ∧ convergent claim ≥1`은 "희소 증거"와 "붕괴"를 구분할
2차 아티팩트가 없으므로 fail-closed 유지(오늘과 동일한 시끄러운 실패). 강등은 **judge가 기능을
실증한 런에서만**. (빈 judgments는 coverage 위반으로 상류 judge assert서 이미 크래시 — 경계 확인됨.)

### 4.2 강등의 표현 (validation 아티팩트 — LLM 아티팩트 불변 · ★masking-F5 반영: 명명 분리)
- claims 아티팩트(LLM 저작)는 **바이트 불변** — 런타임은 semantic patch 금지(경계 원칙).
- validation 아티팩트에 결정론 필드 추가(항상-방출·빈 배열 허용·정렬):
  `judge_support_shortfall_claim_ids: string[]`
- ★F5 명명 교정(v0의 "violation code 재사용" 폐기): 같은 lexeme이 한 아티팩트 안에서 위반(크래시)
  과 비-위반(정상 강등)이라는 **반대 처분**을 동시에 뜻하게 되어 혼동 표면이 됨. failure mode가
  다르면 개념 분리가 개념경제 원칙(split 조건: 실패 모드 상이)에 부합 — 강등 = 신규 disposition
  개념 1개(`judge_support_shortfall`), violation lexeme은 크래시 경로 전용으로 보존.
- 강등만 있고 다른 violation이 없으면 `validation_status: "valid"` 유지.

### 4.3 레지스트리·불변식 (★conformance-MED-2 반영: "보존" → "재배치" 정직 교정)
- `.onto/processes/reconstruct/reconstruct-contract-registry.yaml`(:2680)의
  maturation-answer-claims-validator `validator_version` 1→2 (의미 변경의 기존 회전 채널 재사용).
  이 obligation은 `answer_support_judge_runtime_is_implemented` 게이트의 **conditional
  obligation**(:2701-2704). 편집 검증은 실 loader(`loadReconstructContractRegistry`)로.
- obligation `require_convergent...two_independent_judge_confirmed_supports`의 강제는 **보존이
  아니라 재배치(relocation)다** (v1의 "그대로 강제" 서술은 conformance 렌즈가 반증):
  - 기존 강제 형태: claims-validator가 pool<2·claimConfirmed<2 전부를 invalid로.
  - 새 강제 형태: **저자-부실(질문-pool≥2)** = invalid 유지 + **소스-레벨 shortfall** = 강등 +
    matrix certification-block(§5)이 "확증으로 통과 못 함"을 담당.
  - 의무의 본질("미확증 convergent claim은 확증으로 흐르지 않는다")은 두 형태의 합으로 유지되나,
    이는 **주장이 아니라 테스트로 입증할 명제**(T5 세탁 음성대조 + T7 양-처분 결속).
- enforced-tier 결속 테스트(obligation-coverage-enforced-tier.test.ts:199-212)는 정확히 pool<2
  fixture로 invalid를 단언 — 본 변경으로 **의미 반전**되므로 단순 갱신이 아니라 재작성:
  (a) 저자-부실 fixture(질문-pool≥2·미달 인용)로 invalid 결속 재증명 + (b) 강등 처분 결속 추가.
- INVARIANT 완화 없음(48 INVARIANT 목록 무접촉).

## 5. 강등 소비 — 단일 choke point (세탁 방지)

원칙: 강등 소비 지점을 **positive-claim 판정 공유 헬퍼 1곳**으로 수렴시켜 감사 표면을 고정한다.

- 신규 공유 헬퍼(빌더·검증기 단일-출처, INV-SCHEMA-1 정신):
  `positiveAnswerClaim(claim, degradedIds)` = 기존 필터 ∧ `!degradedIds.has(claim.answer_claim_id)`.
  빌더(1085-1088)·검증기(1536-1540) 양쪽을 이 헬퍼로 교체 — 대칭이 구조적으로 보존됨.
- **row limitation 전파(정직 공개·기존 채널 재사용)**: 강등 claim이 매치되는 row의 residual에
  결정론 토큰 `judge_support_shortfall:<answer_claim_id>` 주입(빌더·검증기 동일 헬퍼 · ★F5 명명).
  → `deriveMemberReadiness`가 limitation_backed 도출 → continuation이 materiality로 저울질 →
  decision.limitation_refs로 공개 전파. [OQ-2: 주입 vs 순수 제외(frontier_required 귀결)의 택1 —
  기본값 = 주입(공개 채널 확보). 교차검증 렌즈가 반박할 것.]
  - 검증기 충돌 분석(실코드 1607-1637·1655-): baseline-conservation은 단방향(baseline ⊆ stamped∪
    discharged)이라 추가 토큰과 무충돌. expectedReadiness는 stamped refs로 재도출 → 빌더/검증기
    일관. reverse-link 규칙은 memberReadiness 키라 limitation_backed(질문 인용 없음)로 양측 일관.
  - **토큰 conservation 규칙(추가 필요)**: 검증기 주석 명시대로 stamped claim-caveat은 "trusted" —
    stale/편집 매트릭스가 토큰을 **드롭**하면 못 잡는다. 검증기가 (claims+validation에서 재계산한)
    강등 집합에 대해 토큰 존재를 요구하는 대칭 conservation 검사 1개를 추가한다(기존
    baseline-conservation 1607-1622와 동형).
  - **★masking-F3(공개 권위의 분리)**: row 토큰은 **readiness 기계**일 뿐이며 공개의 권위가 아니다.
    강등 claim이 baseline row에 하나도 매치되지 않으면(triple 미대응 — 확증 claim도 동일하게
    무소비되는 기존 케이스) 토큰이 0개라 row-anchored 공개는 공허해진다. 공개의 **권위 = validation
    필드**(claim-anchored·row-match 무관)로 정의하고, §6의 결정론 렌더가 그 필드에서 직접 읽는다.
    conservation 검사는 "row에 매치된 강등 id → 토큰 필수"의 row-anchored 규칙으로 유지(공허 통과
    무해 — 공개는 필드가 담당).
- **expansion 세탁 차단**: `answer_claim_refs`에 강등 id를 인용하는 expansion은 positive-expansion
  필터에서 동일 헬퍼로 제외(L4 승격 기여 차단). expansion validator(validateOntologyExpansion,
  3452-)는 judge-비인지(claims validation status·id 해소·evidence 운반만 검사) — 강등 claim 인용
  expansion도 valid로 통과하는 것이 **의도된 동작**(내용 차단이 아니라 certification 차단;
  아래 소비자 표 참조). [OQ-3 잔여: 이 절단이 충분한지 교차검증 렌즈가 공격할 것]

### 5.0 독립 감사 2건 교차확인 (2026-07-06 · 별도 에이전트 · 본문과 독립 도출)

- **게이트 감사**: 4 게이트(expansion 3501-3507·matrix·source-delta 4437/4447·convergence 3956-3960)와
  continuation 빌더/검증기 **어느 것도 judge 아티팩트를 읽거나 지지수를 재계산하지 않음** — claims
  validation_status="valid"면 전부 통과. judge 소비는 claims validator(6557→3213)가 유일.
  continuation validator의 prior-validation 루프는 answer-claims validation을 **아예 포함하지 않음**.
- **스코프 지시(감사 도출·빌드 계약)**: 변경은 **3405-3412 arm(independentConfirmed<2)만**.
  3383-3388(judgeActive=false fail-closed)·3170-3182(answer-support-ledger의 동명 코드 —
  **다른 아티팩트**·업스트림 assert) 불변.
- **소비자 감사(독립)**: "downstream은 validation_status + answer_status/limitation_refs만 읽고
  support_mode는 아무도 안 읽는다" — 강등 표식을 **limitation_refs 경유 또는 빌더+검증기 lockstep
  신규 배선**으로 넣지 않으면 세탁이 전면적임을 독립 재도출 (= §5 공유 헬퍼+토큰 설계의 필요성
  확인). 세탁 랭킹 1위 = matrix 빌더 1085-1140 + 검증기 1536-1572 lockstep(본 설계 변경 지점 그 자체).
- **신규 사실**: expansion LLM 프롬프트(run.ts:12290-12303)는 claims **전문 + validation 전문**을
  userPayload로 수신 → §4.2 강등 필드가 expansion 저작자에게 **자동 노출**(추가 배선 없이 soft
  신호 제공; 강제는 여전히 matrix choke point).

### 5.1 소비자 전수 표 (1차 자체검증 + 독립 감사 교차확인 완료 · 2026-07-06 실코드)

| 소비자 | 강등 claim의 취급 | 세탁 여부 | 필요 변경 |
|---|---|---|---|
| matrix 빌더/검증기 (1015·1470) | positive 필터 제외 + row 토큰 주입 | 차단(본 설계) | **변경 O** (공유 헬퍼) |
| expansion 저작자 (LLM·run.ts:16224) | claims 전문 수신(강등 무표시) | L4 기여는 matrix서 차단 | 변경 X |
| expansion validator (3452) | id 해소·claims validation status만 | 재계산 없음 | 변경 X |
| convergence ledger 빌더 (3655)·검증기 (3871) | **presence-기반 provenance**: claim 존재만으로 disposition "answered_*" — 단 이는 **기존 의미론**(answer support refs만 있어도 동일) | certification 아님·기존 동작 | 변경 X (§8 OQ-5 주석) |
| continuation decision (4689) | matrix 매개(materiality 저울) | 비례 종결의 본체 | 변경 X |
| claim projection (claim-projection-validation.ts:338) | **decision만 소비** — claims 직접 소비 없음 | decision-매개 | 변경 X |
| actionable-ontology (5242) | claim_scope 분할: 강등 row=excluded + decision limitation_refs 첨부(5306-5312) | 정직 배제 | 변경 X |
| final output·record | claim projection 요약(9203·13089)·claims 건수(6855) | decision-매개·건수 benign | 변경 X |

원칙 확정: **provenance(ref 기록·건수)는 허용, certification(L3/L4 상승·closed 판정·included
scope)만 차단** — 차단 지점은 matrix 공유 헬퍼 1곳 + 토큰 conservation 검사.

## 6. 공개 표면 정직 공개 (실코드 확정)

- claim projection(`buildClaimProjectionArtifact`, claim-projection-validation.ts:338)은 answer
  claims를 **직접 소비하지 않고 continuation decision만** 소비 — 공개 표면은 전부 decision-매개.
  `strongest_claim_level`도 projection rows(=decision 투영)에서 도출(:981).
- `decision.limitation_refs`(maturation-validation.ts:4862-4878)는 **모든 matrix row의
  limitation_refs를 흡수** → §5 토큰이 자동으로 공개 claim까지 전파. **동일 패턴 선례 실존**:
  value-read cut의 합성 토큰 `maturation-value-read-basis:<row_id>`(4874) — 신규 채널 0.
- `claim_scope`: 강등 row(limitation_backed)는 `excluded_row_refs`로 정직 배제(4847-4852),
  continuation validator·actionable-ontology validator가 이 분할을 거울 강제(주석 명시).
- final output의 Claim Projection 섹션(run.ts:9203·13089)이 strongest_claim_level·
  decision_state를 사용자에게 서술.
- **★masking-F2(프로즈 공개 갭 — 실코드 재검증 확정)**: LLM 최종출력 프롬프트의 maturation_summary
  (run.ts:6835-6878)와 claim_projection_summary는 **count와 일반 문구만** 전달(limitation_ref_count
  등) — 토큰 문자열이 사용자 프로즈에 도달할 경로가 없음. 오늘은 크래시가 주의를 강제하나 변경
  후엔 무제목 count 1개로 희석. **조치(결정론 우선·LLM 비의존)**:
  1. 결정론 렌더 섹션(appendFinalOutputClaimProjectionSection, run.ts:13063-13092)에
     `judge_support_shortfall_claim_ids`를 validation 필드에서 직접 읽어 명시 렌더
     (기존 섹션 내부 행 추가 — 신규 heading 금지: check-final-output-sections-parity 가드).
  2. maturation_summary에 결정론 필드 1개 추가(`judge_support_shortfall_claim_ids` 또는 count) —
     LLM 프로즈가 사유를 서술할 수 있게 (강제는 1이 담당).
- **★masking-F4(관측성)**: 위 1·2가 record/final-output 레벨 관측을 겸함. 실행-ledger 이벤트는
  선택적(비-차단) — 빌드서 비용 낮으면 추가.

## 7. 테스트 매트릭스 (falsifiable pair · 선례 §16.8 대칭)

| id | 시나리오 | 기대 |
|---|---|---|
| T1 발화-비례-저위 | claim 2+: 1 강등(pool<2·**judgeFunctioned**·저위 materiality) + 타 row closed | 완주·**decision_state = actionable_ready 불변(대조!)**·decision.limitation_refs에 토큰 by-id·validation 필드에 id (★F6b≡control-flow MEDIUM **두 렌즈 독립 수렴**: 비-material limitation_backed는 continuation 어느 arm도 못 건드림 — 4762-4807 실측) |
| **T1b 발화-비례-limited** | **material** row의 claim 강등 + 타 material row closed | 완주·**actionable_limited**(4775 arm: limitationRows>0 ∧ closedRows>0) — 비례 종결의 본보기 케이스 |
| T2 발화-비례-blocked | 유일 material row의 claim 강등(judgeFunctioned) | **full-pipeline E2E**로 완주 단언: `result.status === "completed"` ∧ `decision_state === "blocked"` (★control-flow 용어 함정: 자연-blocked 완주의 result.status는 "blocked"가 아니라 "completed" — graceful 조기종결과 다른 개념) + manifest의 actionable_ontology skippedStep(run.ts:4955-4967 — 현재 E2E 미실행 분기) 커버 |
| T3 음성-저자부실(ref 미달) | 질문-pool≥2·claim 인용 1개 (= 기존 MV.test.ts:4430 보존·명시 승계) | violation 유지 → 16219 크래시 (T1과 **최소 쌍**: pool만 상이) |
| **T3b 음성-저자부실(cluster 미인용)** | 같은 질문의 타 convergent cluster에 judge-confirmed 2+ 존재·claim은 빈약 cluster만 인용 | violation 유지 → 크래시 (★conformance-MED-1의 falsifiable 쌍: 질문-범위 pool이 아니면 이 테스트가 강등으로 오판) |
| T4 음성-judge부재 | judgment invalid | prior_validation_invalid 크래시 유지 |
| T5 세탁-L3/L4 | 강등 claim(+이를 인용한 expansion)만으로 L3/L4 시도 | maturity 상승 0·matrix 검증기도 거부(forge 대칭) |
| T6 대조-무강등 | 강등 조건 없는 기존 fixture | 하류 아티팩트 동작 불변(신규 필드 빈 배열 외) |
| T7 obligation 결속 | coverage-harvest·enforced-tier 갱신 | obligation이 **양 처분(크래시·강등) 모두**에 결속됨을 non-vacuous 증명 (★F7) |
| **T8 음성-judge붕괴** | convergent claim 존재·judgment valid·**전면 not_supported**(coverage 충족) | ¬judgeFunctioned → violation 유지 → 크래시 (★F1 대조 통제의 falsifiable 쌍: T1과 judgeFunctioned만 상이) |

- 전 시나리오 결정론 fixture(LLM 0). T1~T5·T8은 대상 집합 cardinality > 0 사전 단언(공허 통과 금지).
- **★F6a 기존 테스트 승계 계약**: MV.test.ts:4290(judge 1-of-2)·4312(동일-소스 붕괴)는 본 변경으로
  처분이 invalid→degrade로 **의도 전환**되는 케이스 — assertion 완화가 아니라 **positive degrade
  테스트로 명시 재지정**(강등 필드·valid 단언). 4430은 크래시 음성대조로 보존(T3).

## 8. open questions (교차검증 입력)

- **OQ-1** [masking-F7로 정밀화]: obligation의 enforced-tier 결속 테스트
  (obligation-coverage-enforced-tier.test.ts:199)가 현재 violation 방출에만 결속 — 분리 후 강등
  처분이 결속-무를 남기지 않도록 **양 처분 결속**을 T7로 강제. "보존" 주장은 "미확증 claim은
  확증으로 흐르지 않는다"로 재정식화(certification 차단이 의무의 본질, 처분은 그 수단).
- **OQ-2** [★해소·control-flow 렌즈로 종결]: **토큰 주입 채택, 순수-제외 기각.** 결정 근거:
  - 순수-제외는 material 강등 row를 frontier_required로 귀결시키고, continuation의 frontier arm
    (frontierRows>0 → blocked)이 **타 row가 closed여도 전체 blocked를 강제** — 비례성(owner 기준)
    을 정면으로 훼손. 토큰 주입은 limitation_backed → actionable_limited(4775)로 **계조적** 종결.
  - 충돌 검사: baseline-conservation(단방향)·reverse-link(memberReadiness 키)·expectedReadiness
    (stamped 공유) 전부 무충돌 — control-flow 렌즈 라인-추적 CONFIRMED.
  - **수용된 트레이드오프(control-flow LOW)**: 확증 claim과 강등 claim이 같은 row에 공동-매치되면
    토큰이 그 row를 과잉-배제(L3여도 limitation_backed). 이는 보수 방향의 fail-safe(judge가 row
    지지 일부를 의심 → trusted claim scope에서 제외 + 명명 공개)로 **의도적 수용** — 반대 방향
    (조용한 포함)보다 안전. 설계 주석으로 명문화.
- **OQ-3**: expansion 저작자(LLM)는 강등 정보를 못 본 채 강등 claim 위에 expansion을 지음 —
  차단이 positive 필터만으로 충분한가, expansion validator 쪽 명시 규칙이 필요한가?
- **OQ-4** [해소·재확인만]: claims validation은 라이브 경로 단일 지점(run.ts:16206)에서 매 런
  재계산되고, 재사용 기계(authoredArtifactReuseMatch)는 LLM-저작 아티팩트만 fold — validator
  의미 변경의 stale 소비 표면 없음. authoring 무변경이라 프롬프트 카탈로그 sha 회전도 불요.
  registry validator_version 1→2가 유일한 회전. (교차검증서 반증 시도 대상)
- **OQ-5** [부분 해소]: convergence ledger의 closure disposition(3618)은 claim/support **존재**만
  으로 "answered_*"를 부여하는 기존 presence-의미론 — 강등이 이를 악화시키지 않음(support refs만
  있어도 동일 결과). certification 권위는 matrix/decision에 있음. 잔여 질문: 강등 전용
  disposition 값 추가가 필요한 소비자가 있는가(현재 없음 → 개념경제상 미추가)?

## 9. 교차검증 기록 (5-agent · 2026-07-06)

### 9.1 독립 감사 2건 (탐색·비-적대) — §5.0에 박제
게이트 감사 + 소비자 감사. 본문 1차 자체검증과 **완전 수렴**(4 게이트 무발화·choke point 단일성)
+ 스코프 지시(3405-3412 arm만·3383-3388/3170-3182 불변) + 신규 사실(expansion 프롬프트가 validation
전문 수신).

### 9.2 masking 렌즈 (적대) — 발견 7건 전부 실코드 재검증 후 반영
- **F1 [HIGH·CONFIRMED]** judge 전면 붕괴(전면 not_supported·coverage 충족 = valid)가 조용한
  전량-강등으로 재분류되는 구멍 → §4.1 `judgeFunctioned` 런-레벨 대조 통제 + T8. (재검증:
  supported_judgment_count는 6476·6516서 계산·투영만, 임계 검사 전무. 빈 judgments는 상류
  coverage 위반 크래시로 경계 확인.)
- **F2 [MED·CONFIRMED]** 프로즈 공개 갭(프롬프트에 count만) → §6 결정론 렌더 1 + summary 필드 2.
- **F3 [MED·CONFIRMED]** row-미매치 강등 claim의 공개 소실 → §5 공개 권위 = validation 필드로 분리.
- **F4 [MED]** 관측성 0 → §6 조치가 겸함(ledger 이벤트는 선택).
- **F5 [MED·수용]** violation lexeme 재사용 폐기 → `judge_support_shortfall` 분리 명명(§4.2).
- **F6 [MED·CONFIRMED]** 기존 테스트 4290·4312 처분 전환(의도 재지정 계약)·4430 보존·T1은
  decision_state가 아닌 토큰/필드로 단언 → §7 갱신.
- **F7 [LOW]** obligation 결속이 violation 방출에만 → T7 양-처분 결속.

### 9.3 conformance 렌즈 (적대) — 0 high · 2 med · 4 low, MED 2건 재검증 후 반영
- **생존 증명(가치)**: 인용-범위 판정식의 건전성 증명(claimConfirmed ⊆ pool — evidenceRefKey가
  independenceKey를 강결정) + §4.2 필드 추가 스키마-안전 + §6 토큰 end-to-end 생존(형식 거부
  검증기 부재) + 재핀 표 전 산술 검증.
- **MED-1 [CONFIRMED·반영]** 인용-범위 pool의 사각: cluster 미인용 저자-부실이 normal-unmet으로
  오분류 → §4.1 pool을 **질문-범위**(그 질문의 convergent cluster 전체)로 재절단 + T3b.
- **MED-2 [CONFIRMED·반영]** "obligation 보존" 서술 반증 — enforced-tier 결속 테스트
  (obligation-coverage-enforced-tier.test.ts:199-212)가 정확히 pool<2 fixture로 invalid 단언 =
  의미 반전 → §4.3을 "재배치(relocation)"로 정직 교정 + 결속 테스트 재작성 계약.
- LOW 4건: 핀 교정(1126·1085-1088)·레지스트리 경로/conditional 명시·pseudocode 정밀화 — 전부 반영.

### 9.4 control-flow 렌즈 (적대) — 코어 흐름 전 시나리오 라인-추적 CONFIRMED
- **CONFIRMED**: ①강등 런 16219→17026 완주(중간 assert 전무·토큰의 검증기 무충돌 라인 확인)
  ②전량-강등 → blocked continuation 자연 완주(actionable-ontology skip 분기 16390·proofs 항상
  not_claimed·manifest skippedStep 4955-4967 예정 분기) ③저자-부실 크래시 = 오늘과 byte-동일 경로
  (plain Error 1350 → catch 17047 비-graceful 재던짐) ④judge-부재 크래시 동일 ⑤resume/reuse 무영향
  ⑥순서 무결(frontier·authority가 claims 이전 저작 — 소급 파괴 불가)·재진입 루프 없음.
- **MEDIUM [반영]**: T1 기대값 오류 — 비-material limitation_backed는 continuation 어느 arm도 못
  건드려 actionable_ready 유지(4762-4807). masking-F6b와 **독립 수렴**(두 렌즈가 같은 결함을 다른
  각도로 재도출) → T1 기대값 = actionable_ready 확정 + T1b(material 강등 → actionable_limited) 추가.
- **LOW [반영]**: 자연-blocked 완주 E2E 부재(기존 blocked 테스트는 graceful 조기종결 경로 —
  다른 기계) + result.status 용어 함정 → T2를 full-pipeline E2E로 명세.
- **LOW [수용·OQ-2 종결]**: 토큰 공동-매치 과잉-배제 — 보수 방향 fail-safe로 의도 수용.
- **INFO**: 토큰 conservation 검사 필요성 재확인(stamped-trust 구멍) — §5에 기설계.

### 9.5 종결 판정 (2026-07-06)
5-agent 전 결과 수신·발견 전건 실코드 재검증·반영 완료. **headline(비례 종결 spine) 3-lens 전부
생존** — narrows만 도출(F1 대조통제·질문-범위 pool·obligation 재배치·T1 기대값·명명 분리·공개
경로). 게이트 판정: **build 진행 가능** (gate_pass_with_minor_revisions 상당 — 전 revision 반영됨).

## 10. 빌드 기록 (2026-07-06 · §16-상당 계약 이행)

**변경 (7 파일 · +922/-23 · origin/main 5d47088 대비 전량 이번 cut):**
- `artifact-types.ts`: claims validation에 `judge_support_shortfall_claim_ids: string[]`(항상-방출·정렬).
- `maturation-validation.ts`: ①claims validator 3-분기 판정식(§4.1 — 질문-범위 pool·judgeFunctioned
  대조 통제·저자-부실/judge-붕괴 violation 유지) ②공유 헬퍼(`positiveAnswerClaim`·`positiveExpansion`·
  `judgeSupportShortfallToken`) — 빌더/검증기 lockstep ③row 토큰 주입 + 토큰 conservation 검사.
- `run.ts`(+18): 결정론 최종출력 공개(claim-projection 섹션 내부 행) + maturation_summary ids 필드.
- 레지스트리: maturation-answer-claims-validator `validator_version` 1→2 (실 loader 검증 PASS).
- 테스트: T1/T1b/T2(continuation 저울 unit)·T2 E2E(full-pipeline: completed+blocked+manifest skip+
  공개 라인)·T3(4430 보존)·T3b(cluster 미인용)·T5(세탁+conservation+forge)·T8(judge 붕괴)·
  T7(enforced-tier 양-처분 재작성)·기존 2건 의도 재지정(F6a).

**검증:** tsc clean · 구조 게이트 8종 PASS(graceful-signal-rethrow 18/18·invariant-change 0·
obligation-coverage) · **full vitest 2448 pass**(기준선 2442+신규 6·회귀 0) · T2 E2E가 §9.4의
E2E-미실행 분기(manifest skippedStep 4955-4967) 실경로 커버.

**done-when 대조:** ①비례 완주(T1 ready-불변/T1b limited/T2 blocked) ✓ ②저자-부실·judge-부재·
judge-붕괴 크래시 보존(T3/T3b/T4/T8) ✓ ③세탁 차단(T5+E2E L4-부재 단언) ✓ ④end-to-end 공개
(validation 필드→row 토큰→decision→결정론 최종출력 라인·E2E 실문자열 단언) ✓ ⑤무강등 대조
(기존 2442 전부 green·actionable_ready E2E 불변) ✓.

**미해결/이연:** 실행-ledger 강등 이벤트(F4 선택 항목·비차단) — 관측 필요성 실증 후.
