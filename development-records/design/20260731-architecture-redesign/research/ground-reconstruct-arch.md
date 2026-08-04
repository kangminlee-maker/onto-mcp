# 현행 학습 채굴: reconstruct 파이프라인 (근본 재설계 연구노트)

> 2026-07-31, 브랜치 feat/observation-grant-stage2 실측.
> 목적: 재설계자가 같은 실수를 반복하지 않도록, "소스 → 온톨로지 seed"가 실제로
> 어떻게 동작하며 무엇이 비싸게 학습됐는지를 코드·기록 인용으로 고정한다.
> 설계 문서의 주장은 가설로 취급했고, 코드/기록으로 확인된 것만 확인 표기했다.

---

## 0. 요약 — 이 파이프라인이 실제로 무엇인가

reconstruct는 "LLM이 소스를 읽고 온톨로지를 쓴다"가 아니다. 실측 구조는:

- **결정론 런타임이 관찰·검증·기록·투영 전부를 소유**하고, LLM은 계약된 저작
  메서드 24개(`ReconstructDirectiveAuthor`, directive-author-contract.ts:174-426)를
  통해서만 의미를 공급한다.
- 스테이지 ID **약 100개**(artifact-types.ts:1628-1748 `RECONSTRUCT_STAGE_IDS`),
  그중 절반이 `*_validation` — 저작 1스테이지당 검증 1스테이지가 짝으로 붙는
  **저작/검증 교대 구조**다.
- 검증 게이트는 코드가 아니라 **registry**(reconstruct-contract-registry.yaml,
  188KB)가 소유한다: gate_id 50개(active 카탈로그 1274행~, planned 1400행~),
  계약 의무 162개(obligation-coverage-ledger.yaml `obligation_id` 162건)가
  테스트로 래칫된다(G10).
- 라이브 실행 비용: golden fixture(소형) 1회당 **LLM 호출 25~26회, prompt
  383K~438K chars, 12~20분** (benchmark/reconstruct-pipeline-live-20260613.md:13-17,
  …-sol-role-expansion-20260717-v2retry.md:13-17).

---

## 1. 실제 단계 (소스 → seed → actionable ontology)

### 1.1 결정론 준비 구간 (사람 0, LLM 0)

1. `invocation_binding` → `run_control`(+validation): 세션 소유권·idempotency·락
   (`ReconstructRunControl`, 설계 §3 concept table, design.md:117).
2. `registry_verification`: registry/계약/프로파일/validator 해시 스냅샷을
   run manifest에 고정 — "Every reconstruct run manifest must record the selected
   registry ref, registry hash, active contract hashes …" (registry.yaml:10).
3. `target_material_profile`: material kind 분류(code/spreadsheet/document/
   database/mixed/unknown, boundary-contract.md §3). **프로파일 선택은 런타임
   소유이고 LLM은 확장 불가** ("it must not choose the profile or expand the
   observation boundary", boundary-contract.md:330-334).
4. `source_inventory` → `source_observation`: materialize-preparation.ts가
   결정론 관찰을 생산. 관찰 단위 =
   `{observation_id, source_ref, location, summary, structural_data}`
   (source-observations.ts:23-40). code kind는 tree-sitter 14언어 + layout
   observer(전부 opt-in 플래그, run-contract.ts:41-58).
5. `source_safety`(+validation): 관찰별 4축 안전 원장 —
   lifecycle/authorization/proof_sufficiency/replay
   (source-safety-validation.ts:26-42) × 소비 용도 5종
   (prompt_context/evidence_support/public_output/replay/material_claim,
   :66-72) → visibility tier 유도. **"무엇이 프롬프트/증거/공개출력에 들어갈
   수 있는가"를 결정론이 먼저 가른다.**

### 1.2 탐색 루프 (LLM 인지, 런타임 검증, 최대 5라운드)

`for roundNumber = 1..MAX_RECONSTRUCT_EXPLORATION_ROUNDS(=5)` (run.ts:1197, 2094):

- `observation_directive`(LLM): 어떤 관찰을 증거로 쓸지 선언 → 런타임 검증.
- `lens_judgment` × 9: **review와 동일한 렌즈 파일** `.onto/roles/<lensId>.md`를
  읽어 프롬프트로 쓴다(authoring-prompt-payloads.ts:2523-2529). 렌즈 9종은
  registry가 등록(logic/structure/dependency/semantics/pragmatics/evolution/
  coverage/conciseness/axiology, registry.yaml:153-222). 라운드당 LLM 9회 —
  라이브에서 최대 비용 단위(lens_judgment mean 347s, 20260613 bench:41).
- `exploration_synthesis`(LLM): 렌즈 판정을 통합, 의미 갭 명명.
- `source_frontier`(LLM 저작) → `source_frontier_validation`(런타임): 다음에 볼
  소스 요청을 런타임이 inventory 경계·중복·안전성으로 수락/거절
  (artifact-types.ts:1605-1626 — accepted/rejected/no_next_frontier).
- 수락되면 `source_observation_delta`(+validation, reentry validation, lineage
  index): **라운드 계보 없는 관찰은 이후 의미 저작에 쓸 수 없다**
  (boundary-contract.md §8: frontier_kind, observation_batch_id, 검증 ref 강제).

### 1.3 의미 저작 구간 (LLM 저작 + 결정론 검증 교대)

`source_purpose_candidates` → `purpose_confirmation` → `candidate_inventory` →
`candidate_disposition` → `seed_authoring_readiness` →
`seed_stage_prompt_source_observations`(프롬프트 투영 스냅샷이 스테이지로 기록됨)
→ `ontology_seed` → `ontology_seed_validation` → `claim_realization` →
`seed_confirmation` → `competency_questions` → `competency_question_assessment` →
`failure_classification` → `revision_proposal` → `metrics` → `stop_decision` →
`pre_handoff_run_manifest_validation` → `handoff_decision_validation`.

seed 필수 13층: seed_identity/purpose/decision_context/conceptual_frame/
semantic/kinetic/dynamic/data_binding/validation layer/
candidate_disposition_authority_ref/ontology_handoff/source_authority/
handoff_limitations (boundary-contract.md:125-139).

### 1.4 Maturation 구간 (같은 run 내 2단계)

baseline(+actionability matrix) → `maturation_value_read`(두 번째 LLM-touch;
값 의존 limitation 방전) → question/closure frontier → **authority_response** →
answer_support ledger/judgment → answer_claims → ontology_expansion →
actionability_matrix → source_delta → convergence_ledger →
continuation_decision → (조건부 proofs) → `actionable_ontology`.

수렴은 L0~L4 커널 완성도 행렬(design.md:2432-2446)과 수렴 조건 13개 표
(design.md:2454-2471)로 정의되고, stop signal 2개(행렬 폐쇄 + 재질문 수렴)가
모두 서야 `actionable_ready`다(design.md:2489-2499).

### 1.5 터미널

`claim_projection`(결정론 최강-정직-주장 투영) → `final_output`(LLM 저작) →
**final-output provenance 검증이 실패하면 run 전체가 throw**
(run.ts:4855-4859) → record/manifest 조립. 실패 시에도 graceful terminal이
"정직한 부분 결과"를 조립한다(run-contract.ts:102-108
completed/limited/blocked).

---

## 2. 결정론 / LLM 소유 경계 — 계약과 실제

**계약** (boundary-contract.md:29-54): LLM = 목적 해석·명명·후보 처분·CQ 저작·
설명. 런타임 = 분류·관찰·evidence-ref closure·스키마 검증·id closure·게이트
리포트·manifest. "Runtime must not silently fill missing ontology meaning."

**실제 확인**:
- LLM 표면은 `ReconstructDirectiveAuthor`의 write* 메서드 24개 + 옵션 capability
  4개(leaf-read/value-discharge/semantic-map synthesize/verify)로 **완전 열거**
  된다(directive-author-contract.ts). LLM이 임의 파일을 쓰는 경로는 없다 —
  모든 산출물 직렬화·경로·id는 런타임 소유.
- 프롬프트 투영도 런타임 소유: 문서 발췌 예산(FLOOR 40,000자 계열),
  demotion(hierarchy→imports→spans), 워크북/코드 인벤토리 캡. **잘린 것은
  전부 runtime-events + final-output 절로 공시**된다(run.ts:4749-4830 — "no
  silent truncation (C2)", resume 시 sink가 비어도 재계산하는 코드까지 있다).
- 재사용(resume) 키에 **모델 identity, judge identity, effort override, 플래그
  값(sourceBreadthFold 등)을 전부 접는다**(directive-author-contract.ts:185-268)
  — "다른 모델/플래그로 resume하면 조용히 재사용하지 말고 재생성"이 반복
  방어된 결함 클래스였음을 보여준다(DET-1/CG-2 주석).

**경계 위반의 화석 (중요)**: `deterministicOntologySeedTimeoutRecovery`
(run.ts:583-~1190, 약 600줄)는 LLM seed 저작이 타임아웃되면 candidate
disposition 배치 + **키워드 정규식**(`/\b(actor|user|principal)\b/` …,
run.ts:565-580)으로 seed를 결정론 조립하고, 비어 있으면
`"object-recovered-source"` 같은 **플레이스홀더 객체를 주입**한다
(run.ts:857-870). 이 함수는 전 repo에서 **호출자 0** — `git log -S`가 단일
커밋(0f2d036, 2026-06-04)만 반환하므로 태어날 때부터 미배선이다. 즉 "런타임이
의미를 채우지 않는다"는 계약을 어기는 코드가 작성됐다가 배선되지 않고
남았다. 계약이 코드를 이겼지만, **삭제가 아니라 방치**로 이겼다.

---

## 3. 사람 관여 실측 — "0"이 어떻게 만들어졌고 무엇이 남았나

1. **realization은 `"direct_call"` 하나뿐이다**
   (run-manifest.ts:25-27: `ReconstructSemanticAuthorRealization = "direct_call"`,
   `ReconstructConfirmationProviderRealization = "direct_call"`). 계약 문서의
   "host LLM"(MCP 호스트가 저작) 서사와 달리, 배선된 유일 경로는 런타임
   in-process LLM 호출이다. `onto_validate_reconstruct_directive` 툴(호스트
   저작 지원용)은 표면에 존재하나 이 경로가 product 경로가 아니다.
2. **purpose/seed confirmation — 계약상 user 결정, 구현상 LLM 대행.**
   설계 non-negotiable 8: "Inferred target purpose requires user confirmation"
   (design.md:91-92). 구현: `direct-call-confirmation-provider.ts`가 owner
   `"host_or_user"` 라벨을 달고 **LLM에게 confirmation JSON을 받아온다**
   (:91-111 purpose, :177-197 seed). 소스가 목적을 직접 선언한 경우만
   `not_required`로 LLM 호출을 생략(:59-86). owner 필드는 라벨일 뿐 강제가
   없다 — **"사람 확인" 개념이 스키마에는 있고 런타임에는 없다.**
3. **maturation authority response — 전량 자동 deferred.**
   closure frontier가 user/external/domain-standard 권위를 요청해도, 런타임은
   `authority_id: "runtime-not-collected"`, `response_status: "deferred"`,
   "continuation must ask for or block on this authority" 스텁을 일괄 생성한다
   (maturation-validation.ts:2313-2342). 사람 권위 수집 경로는 설계됐고
   스키마도 있으나 **수집 메커니즘이 없다** — 대신 부재를 정직하게 기록한다.
4. 남은 실제 사람 관여: (a) 툴 호출 파라미터(targetRefs/intent/domain),
   (b) `.onto/settings.json`의 opt-in 12+개(run-contract.ts:37-83 전부
   default-off), (c) final-output.md 읽기와 후속 결정.

**왜 남았는가**: (2)(3) 모두 "결정 지점은 보존하되 대기하지 않는다"는 선택의
결과다. unattended 실행이 가능해야 벤치·자동화가 돌므로 사람 게이트를 LLM
대행/자동 deferred로 치환했고, 그 치환 사실을 artifact에 기록하는 것으로
정직성을 지켰다. 재설계 시 이 지점이 R2(자기승인)와 직결된다: **현행 구조에서
"확인"은 이미 같은 LLM 계열의 자기승인이다.**

---

## 4. 노이즈를 무엇으로 가르는가 (R1 대응 실측)

현행 파이프라인의 노이즈 판별은 단일 판정이 아니라 **4개 층의 서로 다른
메커니즘**이다:

1. **결정론 사전 게이트 (구조적 배제)** — source safety 4축×소비 5용도
   (§1.1), inventory 경계, frontier 수락/거절. "볼 수 없는 것"을 먼저 고정.
2. **LLM salience + 처분 원장 (의미적 분류, 소실 금지)** —
   "High-salience candidates must not disappear" (boundary-contract.md:157).
   후보마다 처분 10종 중 하나 + rationale + evidence refs 강제:
   promoted_to_seed_layer / represented_as_{property,link,actor_role,
   permission_rule,data_binding,validation_question} / deferred_to_maturation /
   deferred_by_source_gap / **rejected_for_declared_purpose**
   (registry.yaml:260-280). 즉 **노이즈 판정 = "선언된 목적 밖" 판정이며,
   반드시 목적 기준으로만 기각할 수 있고 기각도 증거를 남긴다.**
3. **claim realization stance (의도 로직 vs 잔해의 명시축)** — seed의 각
   주장을 observed_runtime_behavior / declared_design_intent /
   schema_or_contract_presence / deferred_or_non_goal / unknown으로 분류
   (artifact-types.ts:1769-1775). 이것이 owner 난제 R1("의도된 로직 vs 우발적
   잔해")에 대한 현행의 직접 답이다 — **"코드에 있다"와 "런타임이 실제로
   한다"를 주장 단위로 분리**한다. 단, stance 자체가 LLM 판정이고 stance의
   진위를 검증하는 결정론 장치는 확인 못 함 (UNVERIFIED — validation은
   구조 검증 위주로 보임).
4. **반증 장치** — competency questions + assessment(seed가 목적 질문에
   답하는지), 그리고 벤치 한정 semantic-quality-gate(golden fixture의
   기대 개념 recall Q1 / CQ support Q2 / drop Q3,
   semantic-quality-gate.ts:1-33). **런타임 경로에는 의미 품질의 결정론
   판정이 없다** — 의미 품질은 fixture가 있을 때만 판정 가능하다는 것을
   현행 구조 스스로 인정하는 배치다.

**한계 실측**: 이 체계로도 golden fixture에서 품질 게이트를 통과한 라이브
기록이 없다 — 20260613 run: q1=1.0, q2=0.75 "failed"(bench:35);
20260717 run: q1=0.75, q2=0.25 "failed"(v2retry:22). 노이즈 판별의 병목은
게이트 설계가 아니라 **저작 품질과 형식 준수**였다(§6-1).

---

## 5. seed의 형식과 소비 — 루프가 닫히지 않는다

- 형식: `ontology-seed.yaml` 13층(§1.3), evidence ref는 전부
  observation_id로 결속, 처분 원장은 별도 파일로 두고 seed는 ref만
  (boundary-contract.md:166-172 — "must not restate a second independent
  disposition ledger").
- 같은 run 안에서의 소비: maturation 전 구간이 seed를 입력으로 소비 →
  `actionable_ontology` → final-output.md/record.
- **run 밖 소비자: 없음.** `ontology-seed.yaml` 문자열이 reconstruct 모듈
  밖에서 등장하는 곳은 src/mcp/server.ts(전달 표면), core-api 테스트 2,
  tui adapter 테스트 1이 전부다(grep 실측). `actionable-ontology`는
  reconstruct 밖 소비자 0.
- `.onto/domains/`의 도메인 온톨로지 11개(accounting…visual-design)는
  reconstruct 산출물이 아니라 수작업 저작물이며, reconstruct는 이를
  **입력**(domain competency admission, governing-snapshot.ts:195-199의
  project/user/registry 3-seat 탐색)으로만 쓴다.

**함의**: "구현물로부터 논리 체계를 구축하고, 그 체계가 스스로 진화한다"는
미션 기준으로 보면, 현행 reconstruct는 **일방향 증류기**다. seed →
도메인 온톨로지 승격 경로, seed → review 렌즈 강화 경로가 모두 없다.
산출물은 소비되기 전까지 무효라는 corpus 원칙을 이 시스템의 최종 산출물
자신에게 적용하면, **actionable ontology는 아직 inert하다.**

---

## 6. 비싸게 얻은 학습 (기록 증거 순)

### 6-1. 지배 실패는 의미가 아니라 형식·게이트 정합이다
20260613 라이브 6 run 중 5 실패, 실패 클래스: final_output_provenance 3,
ontology_seed_validation 1, competency_questions_validation 1
(bench 20260613:19-29). LLM이 온톨로지를 "못 만들어서"가 아니라 **결정론
게이트가 요구하는 절·섹션·closure를 못 맞춰서** 죽었다. 이후의 역사
(--json-schema 도입, resubmit 활성화, JSON repair 스테이지
authoring-json-repair.ts, seed repair 스테이지 ontology-seed-repair-stage.ts)는
전부 이 클래스의 보수다. **교훈: 필수 구조화 출력에 자유 텍스트+사후 검증을
쓰면 실패율이 지배한다. 결정론 submit 채널이 처음부터 유일 수용 경로였어야
한다** (corpus LLM-경계 원칙과 정확히 일치하는 방향으로 수렴 중이었음).

### 6-2. 침묵 강등은 반드시 재발한다 — 공시·계보·재사용키로 봉인해 왔다
같은 모양의 결함이 독립적으로 반복 발견·봉인된 흔적:
- leaf_read: telemetry unit 부재 → 예외를 R9가 삼킴 → "zero capture,
  forever" (artifact-types.ts:1659-1663 주석에 결함 서사 보존).
- 투영 절단: resume 시 sink가 비면 truncation 공시가 사라지는 결함 →
  재계산 경로 추가(run.ts:4749-4768 M3c 주석).
- resume 재사용: 모델/플래그/effort가 바뀐 resume이 이전 산출물을 조용히
  재사용 → identity를 전부 reuse key에 접음(§2).
- breadth-fold 강등, withheld evidence: 전용 sink + 상태 이벤트로 "얇아진
  결과는 이유를 말해야 한다"(directive-author-contract.ts:216-242).
**교훈: "덜 준다/못 한다"는 상태는 기본이 침묵이다. 신뢰는 금지 문구가
아니라 (a) 공시 이벤트, (b) 계보 강제, (c) 재사용키 회전이라는 3개
결정론 장치로만 유지됐다.**

### 6-3. 크기 제약은 산술로 안 풀리고, 상수 2개는 반드시 충돌한다
- seed-stage 프롬프트 예산과 demotion, 워크북/코드 인벤토리 캡 — 전부
  절단 공시 세트 동반(§2).
- 현행 미해결: **exec 출력 천장 ≈40,150자(외부 제약) vs 페이지 예산
  65,536자** → 큰 관찰은 인용 경로에서 영구 배제
  (handoff/20260730-size-robust-span-delivery-start-here.md:25). 해법으로
  단위를 관찰→구간(span)으로 바꾸는 재설계가 진행 중.
- MEMORY 기록: "오프셋은 산술로 안 나온다 · PROVENANCE를 안 보고 다시 재서
  틀림". **교훈: 전달 크기 계약은 상수 조합이 아니라 단위 설계
  문제다. 재설계는 "인용 가능한 최소 단위"를 1급 개념으로 갖고 시작해야
  한다.**
### 6-4. "보냈다 ≠ 받았다" — 인용은 전달 확인에 결속해야 한다
directive-author-contract.ts:203-207: "the transport clips whole received
records without telling the server, so 'the runtime sent it' and 'the worker
received it' are different facts, and only the second is what a citation
claims." 답변 경계(answer boundary)는 설계에 3번 적히고도 미구현이었고,
구현 후 라이브가 깨졌으며, 최종적으로 수용된 답변 텍스트에 결속됐다
(MEMORY 20260730). **교훈: 증거 인용의 권위는 서버 상태가 아니라 수신
확인이다. 프롬프트에 넣었다는 사실은 인용 근거가 아니다.**

### 6-5. authority graph를 코드 밖 registry로 뺀 것은 성공했지만 비쌌다
- 성공: run마다 registry/계약/프로파일/validator 해시를 manifest에 고정
  (registry.yaml:10) → 어떤 규칙 아래 판정됐는지 재현 가능. `required_when`
  predicate에 evaluator가 없으면 **fail-closed unknown**
  (boundary-contract.md:270-272) — "규칙은 있는데 판정기가 없는" 상태를
  침묵 통과시키지 않는다.
- 비용: registry 188KB + 계약 md 4개(합 ~290KB) + 코드 내 계약 미러
  (contract-registry.ts 45KB). fact 아티팩트와 gate 아티팩트 분리 원칙
  (boundary-contract.md:250-254)까지 지키면 스테이지 수가 저작의 2배로
  불어난다(§0). **교훈: 판정 권위의 외부화·스냅샷·fail-closed는 계승할
  가치가 확실하다. 그러나 아티팩트 단위 분리를 무제한 적용하면 스테이지
  수가 개념 수보다 빨리 자란다 — 재설계는 "권위 좌석"과 "파일"을 1:1로
  묶지 말아야 한다.**

### 6-6. 렌즈 코퍼스는 이미 공유 자산이다
reconstruct의 9렌즈는 review role 파일을 그대로 읽는다
(authoring-prompt-payloads.ts:2523-2529 → `.onto/roles/<lensId>.md`).
두 진입 경로가 "다중 렌즈 → 통합"이라는 같은 인지 패턴을 공유한다는 것이
구조로 증명돼 있다. 재설계에서 reconstruct/review를 별개 파이프라인이 아니라
같은 판정 커널의 두 응용으로 접을 근거.

### 6-7. 비용 프로파일: 렌즈와 seed 저작이 지배한다
lens_judgment 9회(라운드당) + ontology_seed 단일 호출(prompt 61-68K,
output 51-61K)이 상위 비용(두 bench의 unit 표). 탐색 루프 캡 5라운드
(run.ts:1197)는 이 비용 폭주의 하드 캡이다. **교훈: 증분성(R5) 없이는 규모
확장이 불가능하다는 것이 이미 수치로 나와 있다. 현행의 증분 장치는 resume
재사용키와 관찰 reuse key(extractor_logic_sha256 회전)뿐이며, "소스가 조금
바뀌었을 때"의 증분 재구축은 없다(maturation_source_delta가 freshness 비교
개념으로 존재하나 registry 승격 전 "target design only", design.md:113).**

---

## 7. 재설계 함의 (R1~R7 매핑)

- **R1 (노이즈 귀납)**: 계승 — 처분 원장(소실 금지 + 목적 기준 기각) &
  claim realization stance 축. 폐기/보강 — stance의 진위를 검증할 결정론
  대조(예: 관찰된 호출 그래프와 declared claim의 교차)가 없다. 구조 증거에
  상속/호출/타입 엣지가 없는 현행 한계가 stance 검증 불능의 직접 원인.
- **R2 (자기적용)**: 현행 "confirmation"은 이미 LLM 자기승인이다(§3-2).
  다만 **부재를 정직하게 기록하는 absence projection 패턴**(§3-3)은 무한퇴행
  차단의 원형으로 계승할 만하다: 권위가 없으면 "없음"을 1급 상태로 기록하고
  주장 강도를 강등한다(claim projection = 최강-정직-주장).
- **R3 (결론-action 결속)**: 계승 — actionability를 주장 강도 사다리
  (L0~L4 × static/kinetic/dynamic)로 정의하고 stop signal을 그 투영으로만
  삼는 구조(design.md §10). 이것이 "결론"을 프롬프트 서술이 아닌 판정으로
  만든 현행 최고의 발명이다.
- **R4 (믿음 개정)**: 흔적만 있다 — ontology_expansion은 "seed를 다시 쓰지
  않는 overlay"(design.md:111), convergence ledger는 append-only. 그러나
  기존 판정과의 충돌 탐지·철회는 없다. 재설계 필요.
- **R5 (증분성)**: §6-7. 캐시 무효화 단위(관찰 reuse key, resume key)는
  있으나 판정 무효화 단위가 없다.
- **R6 (다형 소스)**: material kind → source profile → 공통 observation
  스키마(summary + structural_data)로 동일 지평화. 실증됐지만
  structural_data가 자유형(Record<string,unknown>)이라 kind 간 비교 가능
  구조는 아니다.
- **R7 (판정의 유용성)**: failure_classification → revision_proposal →
  stop_decision 3단이 "왜·무엇을 고칠지"를 산출물로 강제한다. 계승 후보.
  단 이 산출물의 하류 소비자가 없다(§5) — 유용성이 실증된 적은 없다.

## 8. UNVERIFIED / 확인 필요 목록

- claim realization stance의 정확도·검증 깊이 (validation 코드 정밀 확인 안 함).
- `maturation_value_read`·semantic-map capability의 라이브 사용 빈도.
- planned gate들(query/visualization/graph proofs)의 실제 실행 이력 — 스테이지
  ID는 있으나 라이브 기록에서 확인하지 못했다.
- golden fixture 이후(20260717 이후) 품질 게이트 PASS run 존재 여부 — 벤치
  디렉토리에서 발견하지 못했으나 전수 확인은 아니다.
