# Runtime Judge Stage — `answer_support_judgment` 구현 설계 (R0 확정)

> Path = **A** (지원되는 presence token으로 judge gate를 좁게 활성화; evaluator 확장 B는 별도 트랙으로 연기). 본 절은 R0 설계를 단일 구현 가능 문서로 확정한다. 모든 file:line 인용은 isolated source runtime(`/Users/kangmin/cowork/onto-mcp-claude`)과 closure registry(`/Users/kangmin/cowork/onto-mcp-closure/.onto/...`)에 대해 이번 세션에 실제로 검증한 값이다. 검증 불가 항목은 그 자리에 명시한다.

> **상태 (2026-06-15, 메인 루프 author)**: 이 문서는 ultracode 멀티에이전트 설계 워크플로(run
> `wf_025091f3`, 19 에이전트)의 종합이며, 주(主) 검증 주장(특히 registry load-break)은 **메인 루프가
> 실 loader(`loadReconstructContractRegistry`)로 독립 재현**했다(FAILED → LOADED 39/39).
> **EDIT SET 1(gate-0 load-break 수정)은 이 세션에 *적용·검증 완료***: judge validator를 active
> `validator_records` → `planned_validator_records`로 이동, loader LOADED 39/39 · `check:invariant-drift`
> no_drift · judge tier=planned 유지(행위 불변). **EDIT SET 2/3 및 모든 코드 구현은 미적용** — 구현
> 단계(R4)에서 사용자 확인 후. file:line은 세션 스냅샷이며 gate-0 수정·PR #55 이후 shift되니 구현 시 재확인.

- **실 loader probe** (`loadReconstructContractRegistry`, `contract-registry.ts:742`, `npx tsx` 직접 실행): SOURCE registry는 **LOADED**, CLOSURE registry는 `Validator answer-support-judgment-validator references unknown gate answer_support_judgment_gate`로 **FAILED**. 즉 PR #55가 적용된 closure registry는 **오늘 로드 자체가 실패**한다 → 모든 benchmark/E2E/run.test가 judge 로직 진입 전 registry load에서 크래시한다. 이것이 **MUST-FIX-FIRST(gate-0)**의 근거다.
- 근본 원인: judge validator 블록이 **active `validator_records`**(closure `2709-2720`)에 `gate_ids:[answer_support_judgment_gate]`로 들어있는데, 그 gate는 **`planned_validation_gate_catalog`**(closure `1361` 섹션, gate row `1399-1404`)에만 존재. loader는 gateIds를 active `validation_gate_catalog`에서만 만들고(`contract-registry.ts:1124`), 미해소 gate_id에서 throw한다(`contract-registry.ts:1173-1176`, "references unknown gate").
- PR #55가 근거로 든 "planned gate를 가리키는 flat-active validator가 기존 컨벤션"(proposals.md:132-133)은 **as-applied로 FALSE**: source의 `maturation-promotion-request-validator`는 **`planned_validator_records`**(source `2909`)에 있어 loader가 referential-check를 하지 않는다(loader는 `validator_records`만 파싱). closure에도 `planned_validator_records` 섹션이 이미 존재한다(closure `2957`).
- evaluator allow-list 확인(`terminal-validation.ts:767-797`): 지원 형태는 `true`, generic regex `/^artifact_exists\([^)]+\)$/`(line 780), `/^artifact_file_exists\(...\)$/`, 그리고 ~9개 verbatim compound 문자열뿐. and/or/==/> 일반 파서는 없다. closure judge predicate `answer_support_judgment_required`의 `truth_expression`(closure `1543`: `artifact_exists(answer-support-ledger.yaml) and answer_support_ledger_has_convergent_source_evidence_cluster`)은 **미지원**. 반면 `artifact_exists(answer-support-judgment.yaml)`는 line 780 regex에 매칭됨을 `node -e`로 확인.
- fail-closed 의미 확인(`terminal-validation.ts:1240-1268`): 미지원 expression → applicability=`unknown` → **매 run마다** `handoff_required_validation_missing` (dormant 아님). 따라서 현재 predicate로 gate를 active화하면 매 run이 fail-closed된다.
- active 강제 거처 확인: `answer_support_gate`(closure `1339`)와 `maturation_answer_claim_gate`(closure `1342`)는 active `validation_gate_catalog`(섹션 `1241`, planned 섹션은 `1361`부터)에 이미 존재. `maturation_answer_claim_gate` → `maturation-answer-claims-validator`(closure `2686`)가 B-6 강제의 live home.
- 핵심 helper/키 확인: `evidenceRefKey`(`maturation-validation.ts:1173-1180`) = `observation_id|target_material_kind|normalizedPathRef(source_ref)|normalizedPathRef(location)` (4-tuple **IDENTITY** 키); ledger convergent **INDEPENDENCE** envelope(`maturation-validation.ts:2097-2109`)는 `${normalizedPathRef(source_ref)}:${normalizedPathRef(location)}` (target_material_kind 없는 coarser **2-tuple**), size<2 → `insufficient_independent_evidence`(line 2103). 두 키는 의도적으로 다르며 B-6은 INDEPENDENCE 키를 byte-identical로 재사용해야 한다.
- 위계/문서 정정 (검증):
  - **plan:107의 `llm/` authoring 경로는 존재하지 않는다** — `src/core-runtime/reconstruct/llm/`는 없음(`ls` 실패). authoring은 `run.ts`의 `createDirectCallReconstructDirectiveAuthor`에 있고, caller는 `src/core-runtime/llm/llm-caller.js`. 구현 시 정확 라인 재확인 필요.
  - artifact-schema verdict의 "boundary-recognition-procedure.md가 두 repo 어디에도 없다"는 **FALSE** — 파일은 `/Users/kangmin/cowork/onto-mcp-closure/development-records/design/20260614-boundary-recognition-procedure.md`(17KB)에 실재하며 `supports: yes/no`를 colloquial로 쓰고(line 162) author≠judge/Option B 분리를 확립한다(line 160, 171-172). 따라서 `supported|not_supported` enum은 boundary 문서가 아니라 **B-1 YAML 2개 소스**(proposals.md:64 `supports: supported | not_supported`; ontology-seeding-and-maturation-design.md)에만 byte-grounded이며, 그 결론은 유효하다(인용만 정정).
  - `supported|not_supported`는 src/core-runtime/reconstruct/*.ts에 기존 쌍이 **없는 net-new 2-value enum**이다(인접 문자열 `readiness_effect: supported|limited|blocked`, `support_claim: unsupported|...`는 의미가 다른 별개 개념). 작고 contract-grounded이지만 "reuse"가 아닌 **+1 enum**으로 정직하게 회계한다.

## 1. Path 결정 + 근거 + contract token 후속

**결정: Path A.** judge gate를 지원되는 presence token으로 좁게 활성화하고, evaluator 확장(Path B)은 별도 후속 트랙으로 연기한다.

**근거(검증 기반):**
1. B는 contract를 문자 그대로 이행하려면 planned-gate 파서 + activation/capability 엔진 + `dynamic_input_authority_rule` union + ledger 내용을 읽는 신규 evaluator 분기 + `isSupportedPredicateTruthExpression` 엔트리 + `run.ts`로부터의 `PredicateRuntimeFacts` 주입이 모두 필요하다. 이 동일 기계는 다른 dormant planned gate들(`maturation_promotion_*`, `required_when_evaluation_gate`, downstream proof gates)을 **동시에** active화하는 광범위·미통제 blast radius를 가진다(현재 medium 완주 ~17% 파이프라인 대상). plan:34/78이 B를 별도 트랙으로 지정한 것과 일치.
2. A는 gate를 **약화하지 않는다**: 의미 있는 강제(convergent claim은 2개 distinct-source judge-confirmed supports 없으면 invalid)는 **이미 active**한 `maturation_answer_claim_gate`(closure `1342`) 위 `maturation-answer-claims-validator`의 **B-6** 안에 안착한다. judge-presence gate는 단순 presence token만 있으면 된다. 따라서 "necessity+sufficiency를 validator에, presence token을 gate에"라는 소위 'hybrid'는 plan:33이 정의한 **Path A 그 자체**다 — 별도 제3안이 아니다(dissent로 기록).
3. reversibility도 A가 우월: A는 registry 편집 + judge stage 범위의 validator 코드로 scoped, B는 공유 evaluator/loader를 변형해 모든 gate/run에 영향.

**contract token 후속(rank-5, plan의 no-auto-edit 규칙상 사용자 확인 필수). 대상 파일: `/Users/kangmin/cowork/onto-mcp-closure/.onto/processes/reconstruct/reconstruct-contract-registry.yaml`.**

- **EDIT SET 1 — MUST-FIX-FIRST / gate-0 (선행, 행위 불변, tier=planned 유지):** judge validator 블록(closure `2709-2720`, `validator_id: answer-support-judgment-validator`부터 `output_ref: answer-support-judgment-validation.yaml`까지)을 active `validator_records`(섹션 `1995`)에서 빼서 기존 `planned_validator_records`(헤더 `2957`)로 **그대로 이동**. source의 `maturation-promotion-request-validator`(source `2909`) 컨벤션을 맞춘다. 이번 세션 temp-copy 실험으로 **clean load 복원 확인**(judge dormant, 행위 불변). 이 편집은 활성화 여부와 무관하게 **즉시** 적용 권고 — 적용 전까지 closure 대상 모든 실행이 load에서 크래시한다.
- **EDIT SET 2 — PATH-A 활성화 (런타임 judge stage 구현·승인과 **같은 변경**에서만 함께 적용; 넷이 한꺼번에 landing되지 않으면 loader throw):**
  - **E2 (required_when token):** `required_when_predicate_catalog`에 전용 신규 predicate 추가 권고(`answer_support_ledger_exists`(closure `1736`) 인접):
    ```yaml
    - predicate_id: answer_support_judgment_required_minimal
      input_authority_refs: [answer-support-judgment.yaml]
      truth_expression: "artifact_exists(answer-support-judgment.yaml)"
      unknown_projection: not_applicable
      explanation_template: "An answer support judgment exists and requires judgment validation."
    ```
    `terminal-validation.ts:780` regex에 매칭(검증). `answer_support_ledger_exists` 재사용 대신 전용 predicate를 두어 judge gate applicability를 ledger gate에서 decouple(concept economy: +1 predicate, top-level concept 아님). evaluator 메타필드(`predicate_evaluator_id`/`version`)는 loader가 기본 주입하므로 supported evaluator를 상속.
  - **E3 (gate→active):** `answer_support_judgment_gate` row를 `planned_validation_gate_catalog`(closure `1399-1404`)에서 active `validation_gate_catalog`로 이동(예: `answer_support_gate`/`maturation_answer_claim_gate` 인접 `1339-1344`), `required_when: answer_support_judgment_required_minimal`로 설정. `activation_condition`/`activation_prerequisites` 라인은 promotion 시 제거(loader가 파싱 안 함).
  - **E4 (artifact authorities→active):** `answer_support_judgment`(closure `1233-1234`)와 `answer_support_judgment_validation`(closure `1236-1237`)을 `planned_artifact_authorities`(헤더 `1171`)에서 active `artifact_authorities`(헤더 `868`)로 이동. loader가 gate.validation_artifact_ref(`contract-registry.ts:1159-1163`)와 validator.output_ref(`:1179-1183`)를 active artifact_authorities로만 referential-check하므로 누락 시 "unknown validation artifact" throw.
  - **E5 (validator→active):** E1이 옮겨둔 judge validator 블록을 다시 active `validator_records`(원래 위치, `maturation-answer-claims-validator`(`2686`) 다음)로 이동. E3로 gate_id, E4로 output_ref가 해소된다. PR #55의 B-5 `validation_obligations` 3개는 verbatim 유지.
- **EDIT SET 3 — input authority 정정 (rank-5, B-5/B-6의 실제 데이터 의존성과 registry 선언 불일치 해소; critique high-severity 2건):**
  - **B-5:** `answer-support-judgment-validator`의 `input_authority_refs`(closure `2713-2714`)는 `answer-support-judgment.yaml` + `answer-support-ledger-validation.yaml`만 있고 **authored `answer-support-ledger.yaml`이 없다**. B-5 obligation A(evidence_cluster_ref/evidence_ref를 ledger의 clusters/evidence_refs로 해소)는 ledger **validation** 아티팩트만으로는 계산 불가 → `answer-support-ledger.yaml`을 추가.
  - **B-6:** `maturation-answer-claims-validator`의 `conditional_input_authority_refs`(closure `2695`)와 `conditional_validation_obligations.input_authority_refs`(closure `2707`)는 `answer-support-judgment-validation.yaml`만 있다. B-6 sufficiency는 **per-evidence supports**(authored judgment에만 존재)를 읽어야 하므로 `answer-support-judgment.yaml`(authored)을 validation과 **함께** 추가. (loader는 conditional_* 키를 drop하므로 load는 안 깨지지만 contract record가 부정확해지고 향후 dynamic_input_authority_rule 소비자가 under-provision됨.)
- **B-1 shape tightening (rank-5, B-6 feasibility-shaping — cosmetic 아님):** `judgment.evidence_ref`를 **full `ReconstructEvidenceRef` 객체**로 타입(bare string 아님). B-6 independence는 `normalizedPathRef(source_ref):normalizedPathRef(location)` 키를 judgment만으로 계산해야 하는데 string 토큰은 source_ref+location을 공급할 수 없다. owner가 bare token을 고집하면 B-6은 ledger cluster로 `observation_id` re-join이 강제됨(대체 join을 명시해야 함). → **B-6의 precondition**으로 격상.
- **guard 후속(이번 세션 미실행, flagged):** E1 후 `check:invariant-drift`(no_drift 기대), EDIT SET 2(planned→active promotion) 후 재실행하여 protected-key guard(spec-defaults/invariant-drift, G1-G6 + invariants.yml CI) trip 여부 확인. trip 시 닿은 INV id를 명시한 INVARIANT-CHANGE 마커 필수. **open-question이 아니라 pre-merge 필수 gate로 취급.**

## 2. Judgment artifact schema

대상 파일: `/Users/kangmin/cowork/onto-mcp-claude/src/core-runtime/reconstruct/artifact-types.ts`. 신규 **top-level concept = 1**(`AnswerSupportJudgment`); validation 아티팩트는 maturation 계열 모든 `*ValidationArtifact`와 동일하게 그 concept의 derived projection이다. **+1 enum**(`supported|not_supported`, B-1 YAML grounded)을 정직하게 회계.

**(1) Authored artifact (신규)** — `ReconstructAnswerSupportLedgerArtifact`(`:2257-2267`) 직후, validation 아티팩트 앞에 배치(AnswerSupport 계열 contiguous):

```ts
interface ReconstructAnswerSupportJudgment {
  judgment_id: string;
  evidence_cluster_ref: string;          // VALIDATED ledger의 ReconstructAnswerSupportEvidenceCluster.evidence_cluster_id(:2244)로 해소
  evidence_ref: ReconstructEvidenceRef;  // 해당 cluster의 evidence_refs[] 중 하나 (full 객체, bare string 아님 — B-6 precondition)
  supports: "supported" | "not_supported"; // boundary verdict 어휘; "yes/no" 아님(plan/spike의 yes/no는 colloquial gloss)
  rationale_ref: string;                 // bounded judge rationale ref (required, non-empty)
}

interface ReconstructAnswerSupportJudgmentArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  round_id: string;                                      // AnswerSupportLedger:2261 / MaturationAnswerClaims:2306 미러
  answer_support_ledger_ref: string | null;              // provenance (runtime 추가, YAML엔 없음)
  answer_support_ledger_validation_ref: string | null;   // provenance (이 judge를 gate한 ledger validation)
  judgments: ReconstructAnswerSupportJudgment[];
  directive_author: { owner: "host_llm"; author_id: string }; // REQUIRED — 구조적 author!=judge 귀속(YAML 생략, runtime 추가)
}
```

각 judgment = (cluster, evidence) 한 쌍. 식별 해소는 기존 `evidenceRefKey(ref)`(`:1173`) 재사용: judgment 유효 = `evidence_cluster_ref ∈ clusters Map` AND `evidenceKeys.has(evidenceRefKey(judgment.evidence_ref))`.

**(2) Validation artifact (신규)** — authored 직후, `ReconstructAnswerSupportLedgerValidationArtifact`(`:2269-2286`) 미러:

```ts
interface ReconstructAnswerSupportJudgmentValidationArtifact {
  schema_version: "1";
  session_id: string;
  created_at: string;
  answer_support_judgment_ref: string | null;
  answer_support_ledger_validation_ref: string | null;   // upstream prior-validation gate (prior_validation_invalid)
  validation_status: "valid" | "invalid";
  judgment_count: number;            // raw 투영
  supported_judgment_count: number;  // raw 투영 — sufficiency verdict 아님 (B-6에서만 sufficiency 계산)
  validation_results: string[];      // ['answer_support_judgment_valid'] | ['answer_support_judgment_invalid']
  violations: ReconstructMaturationValidationViolation[]; // 기존 union 재사용(:1962-1982), 신규 code 0
}
```

> `supported_judgment_count`는 raw count 투영이며 sufficiency 신호가 아님(인라인 주석 권장). enum 위반이 있어도 카운트가 증가할 수 있으나 violation 존재 시 status는 invalid가 되므로 카운트는 절대 행위를 gate하지 않는다.

**(3) 기존 타입에 1개 필드 추가** — `ReconstructMaturationAnswerClaimsValidationArtifact`(`:2314-2326`)의 기존 두 `*_validation_ref` 사이에:
```ts
answer_support_judgment_validation_ref: string | null;  // judge stage 미실행 시 null
```

**B-1 YAML(proposals.md:55-66 / maturation-design:1484-1495, byte-identical)과의 정합:** per-judgment {judgment_id, evidence_cluster_ref, evidence_ref, supports, rationale_ref}와 top-level {schema_version, session_id, created_at, round_id, judgments[]}는 1:1. runtime 추가 3개(`directive_author` 구조적 귀속; `answer_support_ledger_ref`/`answer_support_ledger_validation_ref` provenance — lens_judgment의 `source_observation_directive_ref` 선례 따름)는 contract 충돌 아님.

## 3. author!=judge authoring + context isolation

대상 파일: `run.ts`(author), `mock-llm-realization.ts`(mock), `execution-telemetry.ts`(귀속 — 하드 의존), `artifact-types.ts`(타입).

**구조적 author!=judge (검증):** `AnswerSupportJudgment`는 ledger의 inline 필드가 아닌 **별도 authored 아티팩트**로, `UNIT_ID_BY_AUTHORED_ARTIFACT_NAME`(`execution-telemetry.ts:79-109`, 현재 `103-104`에 ledger/claims)에 `["AnswerSupportJudgment","answer_support_judgment"]`를 추가해 1:1 매핑한다. 미매핑 시 `unitIdForAuthoredArtifactName`이 fail-loud throw(`:123-127`). validator는 `directive_author.author_id` 문자열 비교를 **하지 않는다**(spoofable). 분리는 구조로만 강제.

**author 메서드(`writeAnswerSupportJudgment`):**
- `ReconstructDirectiveAuthor` 인터페이스(`run.ts:267`, ledger 메서드 인접)에 시그니처 추가, `createDirectCallReconstructDirectiveAuthor` 반환 객체에서 `writeAnswerSupportLedger`(`run.ts:8227`) 다음·`writeMaturationAnswerClaims`(`run.ts:8366`) 앞에 메서드 추가. (R0 패키지의 `8364` 등은 PR #55 이후 shift됨 — 실제 ledger 메서드 `8227`, claims `8366`. 구현 시 재확인.)
- AuthorInput 신규(`ReconstructAnswerSupportLedgerAuthorInput` 인접): `{sessionId, roundId, answerSupportLedger, answerSupportLedgerRef, answerSupportLedgerValidation, answerSupportLedgerValidationRef, sourceObservations}`. 신규 loader 없음 — `sourceObservations`에서 evidence 내용을 re-project.
- bounded 출력: `callJsonAuthor({artifactName:"AnswerSupportJudgment", maxTokens:~3200, systemPrompt, userPayload})`. per-judgment 필드는 B-1 YAML shape 그대로:
  - `judgment_id`: `optionalString(j.judgment_id) ?? answer-support-judgment-${i+1}`
  - `evidence_ref`: LLM은 opaque `observation_id`만 emit, **runtime이** `evidenceRefsFromIds({observationIds:[obsId], sourceObservations, fieldName})`(`run.ts` 헬퍼)로 full `ReconstructEvidenceRef`를 결정적으로 lift(deterministic 값을 LLM authority 밖으로). B-6 independence가 ledger envelope와 동일 키로 계산 가능해짐.
  - `supports`: `enumString(j.supports, ["supported","not_supported"] as const)` — 다른 토큰은 throw.
  - `rationale_ref`: `stringValue(...)`, required, **author가 default하지 않음**(누락은 B-5 `missing_required_ref`로 표면화).
  - author는 count/independence/sufficiency를 **계산하지 않는다**.
- **빈-ledger early-exit:** `evidence_clusters.length === 0`이면 LLM 호출 없이 `judgments:[]`로 반환(`writeMaturationAnswerClaims` early-exit 미러). 단, **§5 정책상 파일은 반드시 작성**한다(아래 unconditional-write 참조).

**context isolation (genuine-independence 레버, R2 — 구조가 아닌 prompt 설계):** judge userPayload는 per-cluster로 구성하며 ledger author의 self-justification을 **의도적으로 배제**:
- **EXCLUDE:** `independence_basis`(author 자기인증)와 모든 author rationale/narrative.
- **INCLUDE per cluster:** `evidence_cluster_id`, `support_mode`, `proposed_answer_summary`, 그리고 re-projected evidence 내용 — `observationPromptPayload(sourceObservations, {observationIds: cluster.evidence_refs.map(r=>r.observation_id), contentExcerptCharLimit: POST_SEED_PROMPT_OBSERVATION_EXCERPT_LIMIT})`. **excerpt limit은 maturation-phase ledger author와 동일한 `POST_SEED_PROMPT_OBSERVATION_EXCERPT_LIMIT`(=500)** 사용 — seed-phase `PROMPT_OBSERVATION_EXCERPT_LIMIT`(=1200) 아님(prompt overflow 위험 축소).
- 판정 질문: "이 특정 evidence가 그 자체로 proposed answer를 imply하는가". system prompt를 adversarial-verifier로 frame하고 불확실 시 `not_supported` 기본(rubber-stamp의 실패 양식은 false "supported"이므로 보수 bias가 레버).

**rubber-stamp 잔여 위험(명시·수용):** 구조적 author≠judge는 verdict가 ledger author에 귀속되는 것은 막지만 동일 모델/컨텍스트의 semantic rubber-stamp는 막지 못한다. `llmConfig`는 directiveAuthor 인스턴스당 단일(`run.ts`에서 1회 capture)이라 **per-stage model/effort 차별화는 현재 표현 불가** — 구조적 독립을 semantic 독립으로 전환하는 유일한 레버이며 명시적 **tracked follow-up**으로 격상(out-of-scope로 묻지 않음). 테스트로 비-rubber-stamp를 증명할 수 없음(알려진 한계).

**mock handler (`mock-llm-realization.ts`):** `callReconstructMockLlm`의 if/else-if 체인 final-else throw(`:871-873`) 앞, ledger 분기(`:853`) 인접에 분기 추가, 고유 system-prompt substring `"Author answer-support-judgment.yaml"`(ledger의 `"Author answer-support-ledger.yaml"`과 비중첩) keying. 결정적 fixture로 제시된 각 evidence를 `supports:"supported"`로 반환(supported 경로 E2E 행사). INV-MOCK-1 deletion boundary 내 유지. **mock은 author가 실제로 보내는 payload shape에 byte-consistent해야 함** — author/mock 모두 per-cluster `{evidence_cluster_id, support_mode, proposed_answer_summary, evidence_observation_ids}`로 keying하도록 author payload를 먼저 pin하고 그 위에 mock을 맞춘다.

**orchestration 삽입(`run.ts:11565-11627` 검증된 시퀀스):** ledger authored(`11565`) → ledger validated(`11580`) → assert(`~11600`) **다음**, claims authored(`11606`) **앞**에 judge author+validate 삽입. 흐름: (1) `writeAuthoredYamlDocument(judgmentPath, "answer-support-judgment.yaml", () => directiveAuthor.writeAnswerSupportJudgment({...}))`; (2) `writeAnswerSupportJudgmentValidationArtifact({...paths, outputPath})` (R3 소유); (3) `assertRuntimeValidationValid({artifactName:"answer-support-judgment", artifactRef: judgmentValidationPath, validation})`. 이후 `writeMaturationAnswerClaimsValidationArtifact`(`run.ts:11618`)에 **judgment + judgment-validation의 PATH**(in-memory 아티팩트 아님)를 신규 optional 인자로 전달 — claims **author**에는 절대 전달하지 않는다(B-6은 runtime validator 의무). 검증: `writeMaturationAnswerClaimsValidationArtifact`(`maturation-validation.ts:4807-4851)는 path(string)만 받아 자체 YAML 로드 후 파싱 아티팩트를 validator에 넘긴다 → optional path 인자 `answerSupportJudgmentPath?`/`answerSupportJudgmentValidationPath?` 추가가 정확한 형태.

## 4. validator obligations (B-5 + B-6, decidable 로직)

대상 파일: `maturation-validation.ts`. 둘 다 pure-synchronous, 기존 고정 validator shape(`violation({code,message,subjectId})` `:221-231`; session_id+prior-validation gate 선행; per-row `seen` dup guard; frozen 반환) 재사용. **신규 violation code = 0.**

**B-5 — `validateAnswerSupportJudgment` (신규 함수, `validateAnswerSupportLedger`(`:1583`) 미러):**
- 시그니처: `{answerSupportJudgment, answerSupportJudgmentRef?, answerSupportLedger, answerSupportLedgerValidation, answerSupportLedgerValidationRef?}` → `ReconstructAnswerSupportJudgmentValidationArtifact`. **authored ledger와 ledger validation을 모두** 받아야 함(EDIT SET 3로 registry input도 정렬).
- preamble: `clusters` Map + per-cluster `evidenceKeysByCluster`(`Set(evidence_refs.map(evidenceRefKey))`); `SUPPORTS_VALUES = ['supported','not_supported'] as const`(`SUPPORT_MODES`(`:95`) 인접); session_id 불일치 → `session_id_mismatch`; `answerSupportLedgerValidation.validation_status !== 'valid'` → `prior_validation_invalid`.
- per-judgment loop, 3개 obligation을 기존 code로 1:1 매핑:
  - **A (refs resolve):** `clusters.get(evidence_cluster_ref)` 없으면 `unknown_id`; 있으면 `evidenceKeysByCluster.get(ref).has(evidenceRefKey(j.evidence_ref))` 아니면 `unknown_id`.
  - **B (supports enum):** `SUPPORTS_VALUES.includes(j.supports)` 아니면 `invalid_enum`; `=== 'supported'`면 `supported_judgment_count++` (raw 투영).
  - **C (rationale present):** `!j.rationale_ref || j.rationale_ref.trim().length===0` 이면 `missing_required_ref` (내용은 읽지 않음, 존재만).
  - dup `judgment_id` → `duplicate_id`(seen Set).
- 반환은 ledger-validation shape 미러. **`directive_author.author_id` 비교 금지**(spoofable; 분리는 구조).

**B-6 — `validateMaturationAnswerClaims`(`:2139`) 내부 conditional 의무 확장:**
- 신규 optional 입력: `answerSupportJudgment?`, `answerSupportJudgmentRef?`, `answerSupportJudgmentValidation?`, `answerSupportJudgmentValidationRef?`. validation 아티팩트만으로는 per-evidence supports를 못 읽으므로 **authored judgment이 필수 입력**.
- preamble에서 1회 `judgeSupported` Set 구성, `judgeActive = Boolean(answerSupportJudgment) && answerSupportJudgmentValidation?.validation_status === 'valid'` gate(이것이 registry activation_condition의 런타임 실현 — registry evaluator 없음, "activated" = orchestrator가 non-null·valid judgment 공급). 키 = `${evidence_cluster_ref}#${evidenceRefKey(evidence_ref)}` (IDENTITY join 키), 값 = supports==='supported'.
- 기존 per-claim loop의 cluster 해소 + contradiction-bounded 체크(`:2246-2256`, `contradiction_refs.length>0 && limitation_refs.length===0 → conflicting_state`) **다음**에 guarded 분기 1개 추가:
  - **necessity scope = `convergent_source_evidence` 한정**(분기 guard `judgeActive && claim.support_mode === 'convergent_source_evidence'`). 타 support mode는 judge 요구 미발동.
  - **sufficiency:** claim이 인용한 **모든 cluster의 union**에 걸쳐, judge-confirmed(`judgeSupported`에 있는) evidence_ref들의 **INDEPENDENCE 키** `${normalizedPathRef(source_ref)}:${normalizedPathRef(location)}`(ledger envelope `:2098-2099`와 byte-identical, target_material_kind **없음**)를 단일 Set에 모은다. size<2 → `insufficient_independent_evidence`(claim.answer_claim_id). 두 cluster가 같은 source:location을 공유하면 1로 collapse(같은 source는 독립 아님). **IDENTITY 키는 judge lookup join에만, INDEPENDENCE 키는 count에만** 사용 — 혼동 금지.
  - contradiction-bounded 체크는 **불변**으로 독립 발동하며 합성된다: convergent claim은 contradiction gate와 신규 ≥2-judge-confirmed-independent gate를 **둘 다** 통과해야 함.
- validation 아티팩트에 `answer_support_judgment_validation_ref` echo 추가(다른 upstream `*_validation_ref` 방식과 동일). count 필드 추가 없음.
- **backward compat:** optional 입력 부재/null 또는 validation invalid면 `judgeActive===false` → 분기 skip → 현재 거동과 동일(planned-tier judge stage가 wired되기 전까지 안전).

**concept economy 원장:** top-level concept +1(AnswerSupportJudgment); violation code +0(B-5: `unknown_id`/`invalid_enum`/`missing_required_ref`/`prior_validation_invalid`/`session_id_mismatch`/`duplicate_id`; B-6: `insufficient_independent_evidence` — 모두 `:1962-1982` 기존 union); enum +1(`supported|not_supported`); required_when predicate +1(`answer_support_judgment_required_minimal`); stage id +2 / `ReconstructRecordArtifactRefs` 필드 +2(§6 R1 surface). helper는 모두 재사용(`evidenceRefKey`, `normalizedPathRef`, clusters Map, `violation()`, `isoNow()`, `observationPromptPayload`, `evidenceRefsFromIds`, `enumString`/`stringValue`/`optionalString`).

## 5. Path-A semantics 확정 — judge author는 **unconditional-write**

Path A는 gate predicate를 convergent-conditional에서 순수 presence(`artifact_exists(answer-support-judgment.yaml)`)로 교체한다. gate 의미(`terminal-validation.ts:927-933, 986-1007, 1240-1268`) 검증: judgment 아티팩트 **부재** → result=false → applicability=`not_applicable` → gate skip(정상); **존재** → applicable → validation 부재 시 `not_available` → `handoff_required_validation_missing` → **handoff 차단**. 따라서 Path A가 'convergent-only'를 보존하려면:

> **확정 정책:** judge author stage는 매 maturation round에서 **무조건 실행**되어 `answer-support-judgment.yaml`(convergent cluster 없으면 `judgments:[]`)과 그 validation(valid, `judgment_count=0`)을 **항상 작성**한다. convergent 필요성의 실질 강제는 **B-6**(이미 active한 `maturation_answer_claim_gate`)가 단독으로 진다. 이로써 gate는 항상 cheap-pass, sufficiency만 conditional. (대안 — gate를 convergent-conditional로 유지 — 은 Path B를 강제하므로 연기.)

빈-cluster early-exit는 LLM 호출만 생략할 뿐 **두 파일은 반드시 작성**(`writeAuthoredYamlDocument` + validation)해야 한다. 그렇지 않으면 non-convergent run에서 gate가 `not_available`로 fire되어 over-blocking된다. 이 정책으로 contract-alignment(presence token)와 authoring 두 facet의 긴장이 해소된다.

## 6. test/verification 계획

**gate-0(전제, 모든 것보다 선행):** EDIT SET 1 적용 후 실 loader probe(`loadReconstructContractRegistry`) 재실행 → CLOSURE LOADED 확인(judge dormant). **이번 세션 PR #55 as-applied는 FAILED 확인됨.** benchmark baseline은 반드시 gate-0 **이후** 재측정(PR #47 baseline은 PR #55 load-break 이전이라 무효 anchor).

**R1 stage-wiring acceptance (가장 큰 surface — 패키지가 과소평가; 검증된 5개 편집점 + 4개 기존 테스트 drift):**
- `RECONSTRUCT_STAGE_IDS`(`artifact-types.ts:1638-1641`)에 `answer_support_judgment`, `answer_support_judgment_validation` **2개** 추가(`answer_support_ledger_validation`과 `maturation_answer_claims` 사이). 계열은 아티팩트당 2 id(authored+validation)임에 유의.
- `ReconstructRecordArtifactRefs`(`artifact-types.ts:3330-3333`)에 동일 2 키 추가(`artifactKey`가 `keyof ReconstructRecordArtifactRefs`로 타입됨, `pipeline-execution-ledger.ts:23`).
- `RECONSTRUCT_LEDGER_STAGE_SPECS`(`pipeline-execution-ledger.ts:590-626`)에 2 spec 추가 + `maturation_answer_claims.upstreamUnitIds`(현재 `['answer_support_ledger_validation']`, `:618`)를 judge로 re-point(ordering 결정).
- `VALIDATION_GATE_BY_AUTHORED_UNIT`(`:26-27`)와 `PRESENCE_INPUTS_BY_RUNTIME_VALIDATION`(`:100-101`)에 신규 쌍 추가.
- `record.ts` ordered 배열(`:116-119`, `satisfies readonly (keyof ReconstructRecordArtifactRefs)[]`)에 2 키; run-manifest provenance 분류(`:762 llm_owned_directives`에 judgment authored, `:736/runtime_owned_artifacts`에 judgment validation) 추가. **이 분류 리스트는 컴파일 강제가 아니므로 두 키 분류를 검증하는 명시 테스트 추가.**
- **기존 테스트 drift(반드시 갱신; "full suite green"을 R1/R5 gate로):** `run.test.ts:2713-2716`(ordered stage sequence에 2 id 정위치 삽입); `pipeline-execution-ledger.test.ts:103-106`(ref fixture에 2 키); `execution-telemetry.test.ts`에 `unitIdForAuthoredArtifactName("AnswerSupportJudgment") === "answer_support_judgment"` assertion 추가. **typecheck를 R1 acceptance 신호로**(record.ts 분류 리스트 제외 — 그건 hardcoded라 전용 테스트).

**R2/R3 unit (maturation-validation.test.ts, 기존 `describe('maturation validation')` 컨벤션 재사용):**
- B-5: unknown cluster ref / unknown evidence ref → `unknown_id`; bad supports → `invalid_enum`; missing rationale → `missing_required_ref`; session 불일치 → `session_id_mismatch`; ledger validation invalid → `prior_validation_invalid`; dup id → `duplicate_id`.
- B-6: convergent claim + <2 distinct judge-confirmed supports → invalid; ≥2 distinct → valid; judgment 입력 부재 → judge 체크 미발동(현재 거동); **두 cluster가 동일 source:location 공유 + 둘 다 supported → size 1 → insufficient**(collapse 케이스); contradiction-bounded + judge gate 합성(둘 다 통과해야 valid).
- enum coercion: `enumString` allow-list 외 토큰 throw(yes/no 누출 없음).

**integration/E2E:**
- mock judge authoring → validation roundtrip green. mock 분기가 final-else throw를 안 침 + per-evidence `supports==="supported"` emit.
- **author payload ↔ mock fixture shape snapshot 체크**: 실제 `writeAnswerSupportJudgment` userPayload가 `evidence_clusters[].{evidence_cluster_id, support_mode, proposed_answer_summary, evidence_observation_ids}`를 담는지 snapshot, mock이 동일 구조로 keying하는지 assert.
- judge userPayload가 `independence_basis`/rationale를 **배제**하고 위 4개 + re-projected observation 내용을 포함하는지 검사.
- judgment.evidence_ref가 full `ReconstructEvidenceRef`(observation_id/target_material_kind/source_ref/location)임을 assert(B-6 키 계산 가능 증명).
- 빈-ledger early-exit: `evidence_clusters=[]` → `judgments:[]` + LLM 0회 + **두 파일은 작성**됨(§5).
- **§5 정책 E2E:** non-convergent run도 두 아티팩트를 쓰고 gate가 applicable+valid로 투영(차단 안 함).
- gate-enforce E2E: judge-confirmed supports 없는 convergent claim이 terminal handoff에서 차단됨.

**pre-merge static/unit gate:** typecheck/lint; `check:invariant-drift`(E1 후 no_drift; EDIT SET 2 후 재실행, protected-key trip 시 INVARIANT-CHANGE 마커 — 이번 세션 미실행, flagged); 실 loader가 편집된 registry를 clean load.

## 7. residual open items + benchmark guard

**benchmark guard (plan §4 stop trigger):** 트랙 done 선언 전 medium tier completion-rate 회귀 측정. judge stage는 round당 **LLM authoring 1회 추가 + hard active gate 1개**를 ~17% completion 파이프라인에 더하므로 신규 실패면(judge LLM timeout, JSON-repair 실패, judge-validation-invalid)이 round를 차단한다. **GUARD: 동일 결정적 fixture set에 대해 pre(=gate-0 직후 fresh baseline) vs post를 비교**; medium completion이 baseline 대비 material하게 떨어지면 STOP하고 사용자에 materiality 결정 surface(gate 강도 재범위화: author bounded 유지·B-6 convergent 한정 유지·broad presence gate로 매 ledger run에 judge authoring 강제 금지). **선결: benchmark harness가 medium tier/fixture set을 어떻게 선택하고 completion을 어떻게 계산하는지 확정**(이번 세션 `scripts/reconstruct-pipeline-benchmark.ts`에서 tier selector를 못 찾음 — under-specified), **수치 임계값을 R5 전에 pin**(plan §4는 정성적).

**residual open items:**
1. **(미해결 material — semantic 독립)** 동일 모델/컨텍스트 judge의 rubber-stamp는 구조적으로 증명 불가. per-stage model/effort 차별화가 유일 레버이나 단일 `llmConfig` plumbing이 막고 있음 → 구조적→semantic 독립 전환의 **tracked follow-up**. 수용된 잔여(plan §2/§5)이나 "해결된 속성"으로 오인 금지.
2. **(미실행 — flagged)** `check:invariant-drift`/`check:spec-defaults`를 이번 세션 미실행(npm i/guard 미가동). EDIT SET 2의 planned→active promotion이 protected-key guard를 trip할 수 있음 → INVARIANT-CHANGE 마커 필요 여부 미확인. pre-merge 필수 gate.
3. **(rank-5 확인)** `judgment.evidence_ref` 객체화는 B-6 precondition(거부 시 ledger re-join 대체 join 명시 필요). owner 확인 필수.
4. **(R1 시 확정)** `answer-support-judgment.yaml` serialized path(session-root vs `rounds/<round-id>/`). `pipeline-execution-ledger.ts` path map이 소유(이번 세션 path map 미독). E2/E4의 input_authority_refs/authority_ref가 그 결정과 byte-match해야 함(round-scoped면 `rounds/<round-id>/` prefix 필요).
5. **(rank-5 call)** EDIT SET 2 후 잔존 미사용 predicate(`answer_support_judgment_required`(closure `1541-1545`), `answer_support_judgment_uses_frontier_observation`(`1532-1540`)) 처리: leave-dormant는 silent fail-closed trap을 만들 수 있으므로(loader는 `usage_status: reserved`만 active gate 연결 거부), 남길 경우 `usage_status: reserved` + reserved_for 노트로 마킹해 load-time 거부로 전환 권고. 미지원 토큰 `answer_support_ledger_has_convergent_source_evidence_cluster`/`answer_support_judgment_refs_delta_observation_ids`는 어떤 active gate의 required_when도 backing하지 않음(검증) — Path B 트랙 소속, 혼동 방지 위해 drop 가능.
6. **(prompt 설계 call)** judge userPayload에 `support_mode` 포함 여부(default 포함 권고, eval에서 rubber-stamp 보이면 재검토). 다수 cluster×evidence 시 prompt-catalog overflow bound/chunking 필요 여부(우선 전체 1회 invocation @ maxTokens~3200, overflow 시 bound 추가).

**dissent/정정 기록:** ① 'hybrid'는 별도 제3안이 아니라 plan:33이 정의한 Path A 자체이므로 A의 conditions로 흡수(over-naming 회피). ② artifact-schema verdict의 boundary-recognition-procedure.md "부재" 주장은 FALSE(파일 실재, `yes/no` colloquial, Option B 확립) — enum 결론은 B-1 YAML 2소스로 여전히 유효하나 인용을 정정. ③ `supported|not_supported`는 "reuse"가 아닌 net-new 2-value enum(+1로 정직 회계).
