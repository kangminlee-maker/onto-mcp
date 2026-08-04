# 현행 학습 채굴: 개념 SSOT와 개발 규범 (core-lexicon + .onto/principles)

> 2026-07-31, 재설계 워크플로 연구노트. 대상: `.onto/authority/core-lexicon.yaml` 1,476줄 전문 + `.onto/principles/` 7문서 전문 + 코드 결속 실측.
> 방법: 파일 전문 독해 후, 모든 결속 주장을 `rg`로 소비자 전수 검색해 확인. 설계 문서의 주장은 가설로 취급하고 코드/기록으로 확인된 것만 확인 표기.

---

## 0. 결론 요약

이 repo의 "논리 체계"는 **하나의 형식이 아니라 결속 강도가 다른 4개 층**으로 존재한다:

| 층 | 형식 | 런타임 결속 | 증거 |
|---|---|---|---|
| 개념 층 | core-lexicon.yaml (entities/terms) | **0 — 코드 소비자 없음** | 아래 §2.4 전수 검색 |
| 규범 층 | .onto/principles/ 7 prose | 0 — 사람/LLM 독해 전용 | 소비자 검색 + 문서 자체 성격 |
| 계약 층 | .onto/processes/ prose 계약 + **reconstruct만 기계 registry** | 부분 — registry는 hash-pin·parity gate, prose는 role 문서 경유 프롬프트 주입 | §4.2 |
| 실행 층 | 좁은 registry YAML 4종 + TS 타입 + G1~G11 게이트 | 완전 — 실 소비·CI 강제 | §4.1 |

핵심 발견: **rank 1 "개념 SSOT"는 owner 자신의 inert 원칙("산출물은 소비되기 전까지 무효")에 비추면 런타임 권위가 없다.** 개념이 런타임 권위를 얻은 곳은 전부, lexicon이 아니라 **별도의 좁은 기계 파일로 투영된 곳**뿐이다(core-lens-registry, supported-models, contract-registry). 이 간극이 이 영역의 가장 비싼 학습이다.

---

## 1. core-lexicon.yaml의 실제 구조

### 1.1 파일 구성 (core-lexicon.yaml:7)

`authoring_rules → shared_attributes → provisional_lifecycle → provisional_terms → entities → terms`. lexicon_version 0.45.2 / schema_version 2 (core-lexicon.yaml:1-2).

### 1.2 term/entity의 프레임

- **term** (core-lexicon.yaml:16-18): 필수 슬롯 `[term_id, canonical_label, korean_label, definition, term_status]`, 선택 `[axis, allowed_values, notes, contract_ref, translation_mode]`. 평평한 사전 항목이다. 관계 표현이 없다 — 관계는 notes의 prose("관련 term: …")로만 존재한다.
- **entity** (core-lexicon.yaml:89-92): 필수 `[canonical_label, korean_label, definition, core_value]`, 선택 `[attributes, relations, instances, execution_rules_ref, notes]`. term보다 부유하다: 속성(shared/local), typed relation, 인스턴스, 실행규칙 포인터를 가진다.
- 승격 경로: term → entity (review_record W-A-63 — core-lexicon.yaml:1017, principal W-A-70 — core-lexicon.yaml:1371). **"execution_rules 보유 여부"가 principle vs term의 1차 구분 단서**로 명문화 (core-lexicon.yaml:568).

### 1.3 관계는 표현되는가 — 예, 그러나 검증되지 않는다

관계 어휘는 닫힌 vocabulary 12종+로 정의된다 (core-lexicon.yaml:56-73): `creates/consumes/references/produces/dispatches/implemented_with/belongs_to/promoted_to/promoted_from/generalized_to/canonicalized_to/canonicalized_from/describes`. 각 관계에 cardinality·semantics·note가 붙는다. 정교한 소유권 규칙이 있다:

- **inverse는 derived, authored 금지** (core-lexicon.yaml:41): source entity만 outbound를 소유. v0.18.0에서 `medium.realizes`, `domain.contains`, `product.described_by`를 실제로 제거해 dual-authority를 해소한 이력이 노트로 남아 있다 (core-lexicon.yaml:884-889, 921-925, 852).
- **self-outbound provenance 예외** (core-lexicon.yaml:42-50): `learning.promoted_from`처럼 snapshot 시점 포인터는 inverse 위반이 아니다 — "시점 정보(source_commit_sha) 동반이 징표".
- relation target resolution 규칙 (core-lexicon.yaml:51), relation note는 비규범 (core-lexicon.yaml:74-76), Operation은 독립 category 아님 (core-lexicon.yaml:77-78).

**그러나 이 전부를 기계 검증하는 코드가 없다.** relation target이 실제 entities/terms에 resolve되는지, inverse authoring 위반이 없는지, 필수 슬롯이 채워졌는지 검사하는 validator·테스트·게이트는 repo 어디에도 없다 (§2.4 전수 검색). 일관성 유지 메커니즘은 (a) authoring_rules라는 **사람이 읽는 편집 규칙**과 (b) **9-lens review를 lexicon 자신에게 돌리는 자기적용**뿐이었다. (b)는 실제로 작동했다: v0.19.0 노트 3건이 re-review 20260420-b74e947f의 unique finding(UF-C1 중복 attribute, UF-semantics 내부모순 enum, UF-evolution 전이 좌표 부재)을 해소한 기록이다 (core-lexicon.yaml:495, 853, 913). — **자기 리뷰가 개념 모순을 잡은 실증이지만, LLM 리뷰가 유일한 검증이라 비싸고 비주기적이며, 결정론적으로 잡을 수 있는 것(참조 해소, 중복)까지 LLM에 맡겼다.**

### 1.4 무엇을 강제하는가 / 못 하는가

lexicon이 실제로 강제하는 것: **없다** (런타임 경로 기준). 강제 비슷한 것 전부가 사람/LLM의 독해 규율이다. lexicon 스스로 이를 안다:

- "not wired in the current onto-mcp runtime" 계열 마커 **11곳** (core-lexicon.yaml:121, 215, 217, 240, 243, 397, 459, 491, 560, 1462, 1474), definition-only 계열 포함 21줄.
- lifecycle transition 실행 미배선 (core-lexicon.yaml:121), citation check 미배선 (core-lexicon.yaml:215), refresh protocol 미배선 (core-lexicon.yaml:217), govern process contract 미배선 (core-lexicon.yaml:459).

거꾸로, 런타임 개념에 대해서는 lexicon이 **명시적으로 TS에 타입 권위를 양도한다**: `review_execution_settings` — "Type source: `src/core-runtime/discovery/settings-chain.ts`" (core-lexicon.yaml:1188), `review_execution_profile` — "Type source: `src/core-runtime/review/review-execution-profile.ts`" (core-lexicon.yaml:1161). 선언된 위계(rank 1 > rank 6)와 반대로, **실질 권위는 코드로 흘렀고 lexicon은 코드의 서술적 색인이 됐다.**

### 1.5 execution_rules_ref — 유일한 코드 결속 장치, 단방향·미검증

entity마다 `execution_rules_ref`가 계약 문서나 코드 좌표를 문자열로 가리킨다 (예: `review-invoke.ts:resolveExecutionProfile` — core-lexicon.yaml:716). 스팟 체크 5건(resolveExecutionProfile, resolveExecutionRealizationHandoff, inline-http-review-unit-executor.ts, worker-structured-output.ts, review-record-validation.ts)은 **모두 실존 확인** — 수동 유지인데도 신선하다. 다만 이 포인터는 (1) 문자열이라 리팩토링 시 침묵 부패하고, (2) 단방향이라 코드 쪽에서 lexicon 항목의 존재를 모르며, (3) 어떤 게이트도 검사하지 않는다. run.ts 21,576줄 분해(PR #264) 같은 대규모 이동에서 살아남은 것은 규율 덕이지 구조 덕이 아니다.

### 1.6 provisional_lifecycle — 설계된 개념 성숙 파이프라인, 정지 상태

seed → candidate → provisional → promoted 4상태 전이 모델 (core-lexicon.yaml:167-217). 전이 트리거: 실사용 1건 → 9-lens review PASS → **주체자 명시 승인**. 실측: entries 5건 전부 lifecycle_status=seed, registered_date 2026-04-14~17 (core-lexicon.yaml:254-346) — **3.5개월간 승격 0건**. 승격 게이트를 주체자 수동 승인에 뒀고, 인용 금지 강제(citation check)는 미배선이어서, 파이프라인은 존재하되 흐르지 않는다. R2의 "부트스트랩 고정점 = 주체자"라는 답의 실패 모드: **주체자가 병목이 되면 lifecycle 전체가 동결된다.**

### 1.7 잔해의 해부학 — translation policy와 framework v1.0

- **translation policy** (core-lexicon.yaml:19-40): 3-mode(v0.20.0) → bilingual 제거 2-mode(v0.21.0, "policy complexity 대비 실익 미미") → runtime translation registry 자체 제거(v0.22.0). 부차 기능이 rank-1 파일에 30줄의 정책 고고학을 남겼다. 수축은 했지만 잔해 정리는 안 됐다.
- **framework v1.0 동기화** (2026-04-20, v0.15~0.19): tier 3축(§3), scope 4값, 전이 9종(transition_kind, core-lexicon.yaml:134-148), entity 7종 격상(product/experience/medium/medium_reference/domain/methodology/ontology)이 **한꺼번에 개념으로 선등재**됐다. 그 중 런타임에 배선된 것은 사실상 0 — promote/generalize/canonicalize/norm_update 전부 "definition only" 또는 "not wired". 야심찬 외부 framework를 개념 공간에 통째로 sync한 것이 "not wired" 마커 21줄의 직접 원인이다. **개념 선행-실행 후행 모델링은 lexicon을 미래 계획서와 현행 색인의 혼합물로 만들었고**, 이후 모든 독자가 active/future를 노트로 구별해야 하는 세금을 낸다.

### 1.8 잘 작동한 것 — 이름 규율의 실전 사례

- **"promoted" 3분리** (W-D-05): 한 단어가 lexicon term promotion / learning-to-principle promotion / lifecycle_status=promoted 3의미로 drift → 별도 term 2건 신설로 분리 (core-lexicon.yaml:1452-1476). 이름 하나의 의미 drift가 작업 아이템을 만들 만큼 비싸다는 실증.
- **동음이의 axis 규칙**: 같은 토큰이 서로소 namespace에서 허용 — `synthesize` term vs lens-registry role ID (core-lexicon.yaml:1254), `activity`의 homonym caution (core-lexicon.yaml:1389).
- **직교축 방어 노트**: `target_material_kind`는 domain·medium·target_input_kind·source_kind와의 경계를 4개 노트로 명문화 (core-lexicon.yaml:1047-1052) — 유사 개념 혼입을 막는 문서적 방어가 실제로 촘촘하다.
- **cost_order_rank 제거 결정** (core-lexicon.yaml:655-659): "ranking은 사용자 상황 의존적이므로 authority rank-1에 고정하지 않는다" — **무엇이 rank-1에 들어올 자격이 없는지**를 판단한 드문 사례. 상황 의존 값은 개념이 아니라 정책 층 소유.

---

## 2. 결속 실측 — 누가 무엇을 읽는가

### 2.1 .onto/authority/ 5파일의 소비자 전수

| 파일 | 줄수 | 런타임/게이트 소비자 | 판정 |
|---|---|---|---|
| core-lexicon.yaml | 1,476 | **없음** — citation-audit.test.ts:134 (테스트 픽스처 내 문자열), check-onto-allowlist.sh:153 (self-test 경로 픽스처) 2건이 전부 | **inert** |
| core-lens-registry.yaml | 125 | lens-registry.ts, review-invoke.ts, materialize-review-prompt-packets.ts, complexity-assessment.ts, supported-models.ts + lens-registry.test.ts(정확 집합 assertion) | **live** |
| supported-models.yaml | 198 | scripts/check-supported-models.ts (G7) + reconstruct-api.ts의 런타임 게이트 `assertSettingsModelsSupported` | **live** |
| model-reasoning-efforts.yaml | 258 | sealed-dispatch-capability.ts, claude-code/codex-review-unit-executor.ts, reconstruct-api.ts | **live** |
| diagnostic-codes.yaml | 94 | 소비자 검색 0건 — CLI-command 시대 잔재로 추정. 파일 스스로 "authority-adjacent data seat. concept SSOT 아님" (diagnostic-codes.yaml:13) | **inert(잔재)** |

**패턴이 선명하다: 런타임 권위를 가진 것은 전부 (a) 좁고 (b) 닫힌 값 집합이며 (c) 정확-집합 테스트나 게이트가 붙어 있다.** 1,476줄 개념 서술은 그 어느 것도 아니다.

### 2.2 lens-registry의 이중 소유 모델 — 성공한 결속의 해부

core-lens-registry.yaml:7-8이 스스로 선언한다: "Concept ownership is in core-lexicon.yaml; this file owns the runtime-facing ID labels." 즉 **개념(왜 이 lens인가)은 lexicon, 실행 ID(무엇이 dispatch되나)는 registry**로 분리했고, registry만 코드가 읽는다. 세대 관리 절차 6단계(array 갱신 → schema_version bump → 이력 1줄 → 테스트 갱신 → rationale 격리 → notes 갱신, core-lens-registry.yaml:90-96)가 주석으로 명문화되어 있고, lens-registry.test.ts가 정확 집합을 잠근다. **이것이 이 repo에서 "개념이 런타임 권위를 얻는" 검증된 유일한 패턴이다: 개념층 → 좁은 기계 투영 + 정확-집합 테스트.**

### 2.3 role 문서 — 실질적 프롬프트 권위

lens의 실제 실행 의미론은 rank 7 `.onto/roles/*.md`가 소유하며, materialize-review-prompt-packets.ts:1016-1035가 이를 resolve해 프롬프트에 주입한다 (core role은 project override 금지 — core-lens-registry.yaml:105-107). logic.md를 보면 verdict schema, logic-specific 출력 필드(conflict_pair, satisfiability_note, modality_note, boundary_handoff_note), prose 대상 claim unitization 규칙, lens 간 boundary routing까지 정의한다 — **rank 7이지만 실행 시점에는 lexicon보다 훨씬 강한 권위**다. 위계 순위와 실행 권위가 역전되어 있다.

### 2.4 검색 방법 명기

`rg -l "core-lexicon" src/ scripts/ .github/` → 2건(위 표), `rg -ln "lexicon" src/` → code-layout-observer.ts(무관 — 내부 함수명 lexiconOf), citation-audit.test.ts. 부재 주장이므로 프로덕션+테스트+스크립트 3면 전수 검색, 자르지 않음 (MEMORY.md의 absence-claims 교훈 적용).

---

## 3. 7개 principles 문서 — 무엇을 소유하고 어떻게 결속되나

### 3.1 문서별 소유권 (설계된 분업은 깨끗하다)

| 문서 | 소유 | 성격 |
|---|---|---|
| ontology-as-code-guideline.md | OaC 사슬 정의: concept→contract→artifact seat→type→field→변수→경로→MCP surface (§1), 권위 순서 (§8), 체크리스트 (§10) | 메타 원칙 |
| ontology-as-code-naming-charter.md | naming + concept economy: reuse/extend/rename/split 4경로 (§2), concept 후보 표면 15종 (§3), split 기준 11축 (§6), fix 3분류 reducing/preserving/increasing (§8) | 편집 규율 |
| llm-native-development-guideline.md | LLM/runtime 소유권 표 (§2), field별 enforcement mechanism 표 (§3), anti-pattern 9종 (§7) | 경계 규칙 |
| llm-runtime-interface-principles.md | interface unit 4요소, boundary 4-seat(Policy/Presentation/EnforcementProfile/EffectiveState), embed vs ref, accepted output channel, review/reconstruct interface template (§7-8) | 인터페이스 명세 |
| productization-charter.md | 제품 방향·비목표·우선순위·성공 기준 | 방향 |
| product-locality-principle.md | 설치 3형태 우선순위 + 데이터 축적 경로. **유일하게 §4에 구현 지점 표를 가진다** (bin/onto, onto-home.ts, project-root.ts) | 배치 규칙 |
| non-specialist-communication-guideline.md | 사용자-facing 출력 규칙 (전문용어+즉시 설명, 비유 금지, 단계 구분 보존) | 출력 규범 |

상호 참조·소유권 명기가 일관되고("이 문서는 X의 canonical source가 아니다. 그것은 Y가 소유한다" 패턴이 4개 문서에 반복), 중복이 거의 없다. **prose 규범 문서 집합으로서는 높은 완성도** — 문제는 완성도가 아니라 강제 수단이다.

### 3.2 규범의 코드 결속 실태 — 원칙별로 갈린다

- **결속됨 (코드가 원칙을 구현)**: product-locality §4가 명시한 3구현 지점, LLM-native §3의 submit tool/unknown-field-fail/runtime-owned-field-reject는 worker-structured-output.ts·각 validator에 실재. G1~G11 게이트가 INVARIANTS.md에서 불변식↔실행 명령으로 표를 이룬다. G8/G9는 registry 선언과 runtime 모듈 표면의 **패리티를 기계 강제** — "schema, validator, submit tool, prompt contract가 같은 constraint를 공유하면 단일 source에서 파생하거나 drift-catching test를 둔다"(charter §4)의 실현.
- **결속 안 됨 (서술로만 존재)**: OaC §4의 canonical mapping("이 연결 중 하나가 끊어지면 drift") — 사슬 정합을 검사하는 게이트 없음. naming charter의 reuse/extend/rename/split — 어떤 도구도 신개념 추가를 감지·질문하지 않음. lexicon과 코드 이름의 정합 — 검사 없음. **즉 OaC의 핵심 주장(개념-코드 정합)이 정작 기계 검증이 없고, 검증되는 것은 그 주장의 좁은 특례들(enum 패리티, import 경계)뿐이다.**

### 3.3 규범 문서의 결함 2건 (실측)

1. **기계-로컬 절대 경로가 rank-2 canonical pointer**: `/Users/kangmin/.codex/guides/llm-capability-boundary.md`가 4개 문서 8곳에서 상위 기준으로 지목된다 (llm-native:6,8,18 / llm-runtime-interface:6,17 / oac-guideline:168,174 / charter:111). 이 principles는 npm files list에 포함되어 배포된다 (package.json:47) — **배포물의 최상위 원칙 포인터가 owner 개인 머신 경로**다. 다른 머신·다른 사용자에게 이 권위 사슬은 dangling이다.
2. **권위 위계가 두 벌이고 서로 충돌**: CLAUDE.md 위계표는 principles=rank 2, processes 계약=rank 5. 그러나 OaC guideline §8과 charter §4는 둘 다 `lexicon > processes contracts > principles > TS > MCP > artifacts > historical` — **processes가 principles보다 위**다. "이 위계표가 SSOT다"(CLAUDE.md)와 rank-2 문서 2개가 서로 다른 순서를 주장한다. 위계의 SSOT조차 이중화에서 drift했다 — prose 위계 선언은 그 자체가 drift 대상이라는 자기증명.

### 3.4 charter의 stale 표면 (경미)

charter §6.1의 host-facing tool 목록(`onto_review_status`, `onto_list_lenses`, `onto_list_domains` 등)은 현행 MCP 표면(`onto_review_read`, `onto_list`, `onto_review_round/advance` 등)과 불일치 — 도구 이름 세대가 갈렸다. §7 execution profile 서술("worker executor codex", "nested-workers must fail-loud")도 lexicon의 최신 NestingBatchWorker/ReviewOrchestrationOwner entity가 이미 추월했다. **방향 문서는 실행 표면 목록을 담는 순간부터 부패한다.**

---

## 4. 계약 층의 진화 — reconstruct가 한 세대 앞선다

### 4.1 review: prose 계약 21개 + 부분 패리티

review 계약은 `.onto/processes/review/` prose 21파일. 코드 결속은 (a) role 문서의 프롬프트 주입, (b) execution_rules_ref 문자열, (c) G9 final-output-sections 패리티, (d) 사람 규율. 계약 문서 자체의 hash-pin이나 wiring 상태 선언은 없다.

### 4.2 reconstruct: 기계 registry (3,357줄)

`reconstruct-contract-registry.yaml`은 질적으로 다르다:

- `authority_scope.meaning`: "Runtime validator dispatch, … must use this registry as the active authority graph" — **registry가 실행 권위 그래프임을 자기 선언** (registry:6-9).
- `prose_contract_role`: "Active prose contracts define semantics and rationale; this registry names the executable authority seats" — **prose=의미론, registry=실행 좌석**의 명시적 분리 (registry:9).
- contract별 `definition_sha256` 핀 + `runtime_implementation_status: partially_wired` 같은 **wiring 상태의 기계 필드** (registry:55-57) — lexicon이 prose 노트("not wired")로 하던 것을 데이터로 승격.
- `run_snapshot_rule`: 매 실행 manifest에 registry hash·contract hash·profile id를 스냅숏 (registry:10) — **판정의 재현 가능성**을 실행 단위로 고정.
- G8 패리티 게이트가 registry 선언과 runtime 모듈 표면을 강제.

**이것이 이 repo가 R2(권위 고정)·R5(증분/캐시 무효화)에 도달한 가장 진화한 답이다**: prose는 의미, YAML registry는 실행 권위 그래프, hash가 무효화 단위, 게이트가 패리티. review·lexicon 층은 아직 이 세대에 못 갔다.

---

## 5. 비싸게 얻은 학습 (재설계자를 위한 정리)

**L1. 개념 SSOT를 소비자 없이 만들면 색인으로 퇴화한다.** 1,476줄 rank-1 파일의 코드 소비자 0. 런타임 개념은 권위가 TS로 역류했고 lexicon은 "Type source: src/…"라고 코드를 가리키는 색인이 됐다. → 새 아키텍처의 개념 표현은 **정의 시점부터 최소 1개의 기계 소비자**(validator, prompt projector, parity gate)를 가져야 등재 자격이 있다. lens-registry 패턴(개념→좁은 기계 투영+정확-집합 테스트)이 검증된 주형.

**L2. 개념 선행-실행 후행 일괄 모델링은 영구 세금이다.** framework v1.0을 통째로 sync한 결과가 "not wired" 마커 11곳·definition-only 다수. 이후 모든 독자가 active/future를 노트로 판별해야 한다. 다만 이 repo는 **정직하게 마킹**했다는 점이 자산이다 — 마커 덕에 본 실측이 가능했다. → wiring 상태를 prose 노트가 아니라 reconstruct registry처럼 **기계 필드**(runtime_implementation_status)로 소유하고, unwired 개념은 별도 공간(백로그/design)에 격리.

**L3. 관계 어휘·소유권 규칙은 정교했으나 검증이 전무해, 일관성 유지가 전량 LLM 리뷰에 실렸다.** inverse-derived 규칙, self-outbound provenance 예외, 관계 12종 — 설계는 훌륭하고 v0.18 dual-authority 제거 같은 belief revision도 해냈다. 그러나 target 해소·중복·inverse 위반 같은 **결정론적으로 판정 가능한 것까지** 9-lens review가 잡았다(20260420-b74e947f UF 3건). → owner 원칙 그대로: 결정론 판정 가능한 구조 위반은 게이트로, LLM 리뷰는 의미 층에만. 관계 그래프 validator는 재설계 1순위 결정론 컴포넌트.

**L4. 강제에 성공한 표면의 공통 형질: 좁다, 닫혀 있다, 정확-집합 테스트가 있다.** live인 authority 파일 3종과 G1~G11 전부가 이 형질. 넓고 열린 서술(OaC 사슬 정합, naming 경로 선택)은 하나도 기계화되지 못했다. → 재설계는 "넓은 원칙을 좁은 판정 가능 특례들로 분해"하는 컴파일 단계를 논리 체계 자체의 기능으로 가져야 한다 (R3의 경계: 분해는 LLM, 특례 판정은 코드).

**L5. 사람 승인을 lifecycle 게이트로 두면 파이프라인이 동결된다.** provisional_terms 5건이 3.5개월째 seed. 주체자 승인은 R2의 고정점으로는 옳지만 **전이 트리거**로는 병목. → 승인 없는 항목의 자동 강등/시효, 또는 승인을 배치화하는 설계 필요. "사람 관여 최소" 미션과 직접 충돌하는 지점.

**L6. prose 위계 선언은 자기 자신부터 drift한다.** CLAUDE.md(principles>processes)와 OaC §8·charter §4(processes>principles)의 순위 충돌, charter §6.1의 stale 도구 목록. → 위계·표면 목록 같은 열거형 사실은 prose에 두 벌 쓰지 말고 기계 registry 한 벌 + 파생 렌더링.

**L7. 배포되는 권위 사슬은 닫힌 참조계여야 한다.** rank-2 문서 8곳이 `/Users/kangmin/.codex/guides/…`를 canonical owner로 지목한 채 npm으로 배포된다. → 권위 그래프의 모든 edge는 repo/배포물 내부로 resolve되거나, 외부 의존을 명시적 스냅숏(canonicalize의 snapshot copy 패턴이 이미 lexicon에 설계돼 있다)으로 내재화.

**L8. reconstruct contract registry가 이 repo의 도달점이다 — prose=의미, registry=실행 권위, hash=무효화 단위, parity gate=drift 방지, run manifest=판정 재현성.** 이 패턴을 lexicon·review 층까지 일반화하는 것이 "현행 학습의 계승"의 실체다. R5(증분성)의 캐시 무효화 단위 후보가 이미 여기 있다: contract/definition sha256.

**L9. 이름 규율의 비용과 수익이 모두 실증됐다.** "promoted" 3분리(비용: 별도 작업), 직교축 방어 노트(수익: target_material_kind가 4개 인접 개념과 혼입 없이 유지), axis-scoped 동음이의 허용(실용 타협). → 재설계의 개념 등재 절차에 "가장 가까운 기존 개념 + 4경로 선택"을 기계 질문으로 내장할 근거.

**L10. rank-1 입장 자격의 판례가 하나 있다.** cost_order_rank 제거 — "사용자 상황 의존 값은 authority에 고정하지 않는다". → 개념 vs 정책 vs 설정의 3분리 기준으로 계승할 것.

---

## 6. 버릴 수 없는 제약 (재설계 후에도)

1. **inverse-derived / single-owner 관계 규칙** — 버리면 v0.18 이전의 dual-authority drift(같은 edge를 두 entity가 각자 서술)가 재발한다.
2. **prose 의미론과 기계 실행 권위의 분리** (reconstruct registry의 prose_contract_role 원칙) — 버리면 prose 파싱이 런타임 경로에 들어와 LLM-native §7 anti-pattern 1(free prose 사후 파싱)로 회귀한다.
3. **닫힌 값 집합 + 정확-집합 테스트** 형질 — 이것 없는 authority 파일은 이 repo 역사에서 전부 inert가 됐다.
4. **wiring 정직성** (active/future/not-wired의 명시 구별) — 버리면 개념 공간에서 계획과 현행이 구별 불가능해지고, 본 노트 같은 실측 자체가 불가능해진다.
5. **role 문서의 project-override 금지 (core role)** — lens 의미론의 무결성이 설치 경계에서 지켜지는 유일한 장치.

## 7. 확인 못 한 것 (UNVERIFIED)

- lexicon을 런타임이 직접 소비하려는 시도가 과거에 있었고 실패했는지, 아니면 애초에 시도되지 않았는지 — development-records 미탐색, 확인 필요.
- diagnostic-codes.yaml의 소비자가 정말 0인지는 rg 1회 검색 기준 — 동적 경로 로딩 가능성 미배제 (다만 파일 스스로 "현재 소비자는 없으나"라고 시인, diagnostic-codes.yaml:11).
- provisional_terms 5건의 승격이 멈춘 것이 주체자 병목 때문인지, 의도적 보류인지 — 기록에서 사유 미발견.
- charter §6.1 도구 목록의 stale 정도 — 현행 MCP 도구 전수와의 diff는 tool 목록(시스템 표면)과의 대조로 추정했고, src/mcp/server.ts 전문 대조는 안 함.
