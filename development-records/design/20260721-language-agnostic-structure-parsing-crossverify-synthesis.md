# 언어-무관 구조파싱 — 교차검증 종합 (2026-07-21)

> 계보: blind packet → 이종 frontier 독립 설계 2벌(`drafts/draft-gpt-sol.md` gpt-5.6-sol@xhigh codex hermetic, `drafts/draft-claude-fable.md` fable-5 격리 agent) → 상호 적대 교차검증(`drafts/verify-fable-on-gpt.md`, `drafts/verify-gpt-on-fable.md`) → 주 세션 실코드 재확증 → owner 결정 3건 → 종합 설계 `20260721-language-agnostic-structure-parsing-design.md`(SSOT).
> 이 문서는 판정 기록이다. 설계 내용의 SSOT가 아니다.

## 1. 수렴 (독립 수렴 = 고신뢰 채택)

| 항목 | 수렴 내용 |
|---|---|
| V (vendor) | 빌드타임 생성 TS 상수, 원본 vendor+태그 pin+digest fold+드리프트 CI, 필요-필드 축약 — 세부까지 일치 |
| S (shape) | 기존 `CodeStructureInventory`/`code_structure_inventory` 슬롯 재사용 + additive tier 표시 (필드명만 상이했음) |
| R (relation) | specifier+census만 산출, call/reference 스코프 아웃, resolver 로직 무확장 |
| G (게이팅) | 신규 키 + capture requires fail-loud — **키 이름(`code_structure_layout`)·requires 술어까지 독립 동일** |
| U (단일-소스화) | 신규 소비처만 Linguist authority, 기존 3(+1) 테이블 불변, env-profile 교체는 후속 분리 |
| 기타 | depth-2 캡(소비자 `foldCodeStructureInventory`가 구조적으로 요구 — `comprehension-reduce-code.ts:213` 재귀 봉인 확증), whole-capture 불확장, 140/40K 예산 재사용, Linguist 태그 pin owner 확정 필요 |
| **4번째 테이블** | `target-material-kind.ts` `CODE_EXTENSIONS`(33)+`CODE_BASENAMES`(9)가 도달성 관문 — **packet에 없던 사실을 두 초안이 독립 발견**(packet §3 "3중" 서술 정정: 실제 4중) |

## 2. 발산 판정 (union 처리)

| 축 | 판정 | 근거 |
|---|---|---|
| C (충돌 해소) | **혼합**: filename→shebang→유일 확장자→**type=programming 필터**→잔여 복수/0이면 `language:"unknown"`+후보 전체 기록. gpt의 사전순/pin rung **폐기**(결정론 외피의 추측 — fable 리뷰), fable의 "전 충돌 unknown" **완화**(type 필터는 결정론 데이터 — fable 리뷰 자기수정) | 양 리뷰 권고 일치점 |
| H (hierarchy) | **dual(들여쓰기+괄호) + 수정 3종** — tab8→prefix-관계 비교(F7), validator throw→per-file unsupported 강등(F8), heredoc 마스킹 문맥·charset 제한(F2). **owner 결정 2026-07-21** | zero-indent brace/생성 코드에서 계층 획득(gpt 리뷰 medium), 날조 위험은 수정 3종으로 봉인 |
| dispatch | **grammar-availability-first** (gpt) — parse 실패는 unsupported 보존, layout fallback 금지 | fable 자기정정 + gpt 리뷰 high 수렴 |
| map 경계 | **명시 tier skip** (gpt) + 전용 닫힌 사유 신설(F10) | fable의 "가드 자동 skip" 주장은 whole-capture 언어(.go 등, 크기 무관)와 ≤6K 소형 파일에서 거짓 — gpt 리뷰·주 세션 독립 적발 수렴 |
| resolver | **tier-aware 게이트 신설** — layout member의 전 import를 휴면 토큰 `parse_unavailable`(emit 0 확인)로 보류 | gpt 리뷰 high: language-total이라 Tier 1 "javascript" 토큰이 TS/JS 분기 진입→가짜 `resolved_unique` (프로브 재현) — 양 초안 공통 결함 |
| kind 어휘 | **기존 어휘 전량 재사용** (fable) — gpt의 `*_candidate` 4종 기각 | tier가 전 소비자에 전파되는 조건 하에 gpt 리뷰도 수용("조건부 tradeoff") — 종합안이 그 조건을 §6 배선으로 충족 |
| doc_first_line | fable 닫힌 마커 휴리스틱 채택 (140 bound) | 저위험, 증거 효용 우세 — Tier 2 `docFirstLineOf`도 동종 휴리스틱 |
| dispatch 소유 | 전용 헬퍼 함수(layout 모듈 내) (gpt 반보 우세) | 비-fallback 규칙의 단위 테스트 가능성 |
| 언어 토큰 표기 | 소문자 정규화 (fable) | 기존 어휘(env-profile·Tier 2)와 케이싱 일치 |
| PR 경계 | 4-PR (fable) + PR-0 추가 | B2 비대 회피, 단계별 falsifiable 게이트 |
| shebang 도달성 | **분류 단계 bounded 첫줄(128B) 판정 포함. owner 결정 2026-07-21** | 양 리뷰가 대칭 적발(이름-만 분류로 양 초안 모두 도달 불능) — 보편성 목표의 실모집단 |

## 3. 교차검증 findings 처분 (전부 주 세션 실코드 재확증 완료)

| finding | severity | 처분 |
|---|---|---|
| F8 validator throw→run 사망 (fable→gpt) | high | 설계 반영: layout observer never-throw 계약, invariant 위반→`layout_internal_invariant` unsupported 강등. 훅 무-catch(`materialize-preparation.ts:830` 루프) 확증 |
| parse-실패 은폐 (gpt→fable) | high | 설계 반영: grammar-first dispatch |
| map 유입 — whole-capture 언어·소형 파일 (gpt→fable + 주 세션) | high | 설계 반영: 명시 tier skip + 신규 사유 `code_layout_tier_not_applicable` |
| 가짜 relation `resolved_unique` (gpt→fable) | high | 설계 반영: resolver tier 게이트 + `parse_unavailable` 재사용 |
| shebang 도달 불능 (상호 대칭) | high/medium | 설계 반영: 분류 단계 첫줄 rung (owner 승인) |
| F1 도달 불가 fixture 공허 (fable→gpt) | medium | 검증 계획 정정: shebang rung 도달 경로가 생겼으므로 fixture 유효화 |
| F2 heredoc 오발화 (fable→gpt) | medium | 설계 반영: 행-선두/대입 문맥 + delimiter charset 제한 + 닫힘 미확인 시 마스킹 포기·census |
| F7 tab8 거짓 계층 (fable→gpt) | medium | 설계 반영: prefix-관계 비교, 비교불능 쌍 동일 깊이 강등+census |
| F10 skip 사유 모순 (fable→gpt) | medium | 설계 반영: 전용 닫힌 사유 신설 (`run.ts:3054` 1:1 매핑 확증) |
| F16 재진입 threading 누락 (fable→gpt, 양 초안 공통) | medium | 설계 반영: 6개 사이트 전수 열거(전부 실재 확증) + 재진입 통합 테스트 |
| zero-indent flat 강등 (gpt→fable) | medium | H축 dual 채택으로 해소 |
| 들여쓰기 없는 brace 코드 빈도 미실측 | — | dual 채택으로 무관화 |
| `.cjs/.mts/.cts` 분류기 누락 (fable 발견) | 기존 잠재 결함 | **PR-0 즉시 수정 (owner 결정 2026-07-21)** |
| seed 소비 계약 정정 (gpt 발견) | 사실 정정 | packet §1·fable §3-4 부정확 — 최종 seed 호출 `includeStructuralData:false`(`run.ts:12955` 확증), 구조 증거는 lens/purpose/candidate 경유 간접 전달. 설계 §6에 정확 서술 |

## 4. 리뷰어 판정 대비 종합 결과

- fable 리뷰: gpt 초안 "수정 조건부 채택"(조건 6) — 전 조건 설계 반영.
- gpt 리뷰: fable 초안 "결함 재설계"(조건 6) — 전 조건 설계 반영. 골격(V·S·G·U)은 유지 판정과 일치.
- 종합안은 양 리뷰의 수정 조건 12건 전부를 충족하는 union.

## 4b. design-verify 라운드 1 (2026-07-21, 종합안 v1 → v2)

독립 신선-컨텍스트 2렌즈(gpt-5.6-sol codex `drafts/design-verify-gpt.md`, fable-5 agent — 판정: gpt "재설계" / claude "수정 조건부 승인"). findings union 11개 영역 전부 v2 반영, 하중 주장은 주 세션이 실코드 재확증:

| # | finding (렌즈) | v2 반영 |
|---|---|---|
| 1 | [blocker/medium 수렴] 활성화 체인 누락 — canonical opt-in 함수·prepare/run 스프레드 미열거 → silent-off | §7 체인 ①~⑥ 전수 + 라이브 settings 통합 테스트 |
| 2 | [high] 디렉터리 자식이 분류기 확장 우회(walker가 직접 classifyFileName) | §3.3 walker 관통 명세 |
| 3 | [high 수렴] map skip 지점 오지정 — :3054는 resume 전용, 라이브는 인라인 사다리(:4134); resume allowlist 미등록 시 map resume 항상 실패 | §6-2 소비 사이트 3곳 + 술어 단일화 권장 + resume 테스트 |
| 4 | [high] env-profile 미열거 소비자 — .yaml(kind=code) layout import가 framework detection 오염(프로브 재현) | §4.1 Tier 1 자격 규칙(비-programming 배제) + §6-5 env-profile tier 필터 |
| 5 | [high] 프롬프트 tier "운반≠소비" — 해석 규칙 없이는 qualification이 candidate 단계에서 소실 | §6-1 조건부 layout 해석 note + layout 계약 dict |
| 6 | [high] reuse authority에 inventory 부재 — 로직만 갱신 시 authored 재사용 오염(프로브 재현, Tier 2 기존 갭 클래스) | §9 inventory 정체성 편입 + 1회 회전 owner 고지 |
| 7 | [high/medium 수렴] 전역 seed note 수정이 layout-off byte/fingerprint 회전 | §6-4 전역 불변 + 조건부 신규 note·조건부 fold |
| 8 | [high] parity가 Linguist 실데이터와 모순(.rs 양쪽 programming 등, 설계 내부 모순 포함) | §3.2 group 정규화 + §3.4 candidate-aware parity 재정의 |
| 9 | [medium] parse_unavailable 게이트가 specifier_truncated 정직성 선점 | §6-3 게이트 순서(truncation 우선) |
| 10 | [medium] "양 tier 모두 불가" 의미 거짓(parse-실패는 정책 미실행) | §7 의미 정정 |
| 11 | [medium] PR-0이 review 분류 경로 공유 미고지 | §10 blast radius + review 테스트 |

검증된 성립 항목(claude 렌즈 반증 실패 확인): 프롬프트 spread 생존·resolver 게이트 삽입점·threading 6사이트 실재·sha 회전-부재·excerpt 가드 구멍 실재·파티션/fold 정합·boundary validator additive 통과·PR-0 진단.

## 4c. design-verify 라운드 2 (v2 → v3)

claude 렌즈(동일 agent, 폐쇄 판정 + 역결함 사냥): **수정 조건부 승인, blocker/high 0** — 11건 중 8 닫힘, 3 불충분이 신규 medium으로 정밀화되어 N1~N6 6건. 전부 Linguist 실데이터/실코드 앵커 기반, v3 문안 핀으로 반영:

| # | 신규 finding | v3 핀 |
|---|---|---|
| N1 | map tier 검사 위치 미핀 → 라이브/resume 사유 발산 시 resume violation | 위치 핀(inventory-확인 직후·excerpt guard 이전, 양 사이트 동일) + 술어 통합 필수 격상 + 대형 `.lua` resume fixture |
| N2 | candidates-0 구멍 — `.conf`/`.lock`(Linguist 무후보)에 layout 실행 | CODE_EXTENSIONS config/data 부분집합 명시 배제, 미지 신언어는 실행 유지 |
| N3 | 관찰-측 layout note의 done-when 부재(inert 재발 위험) | PR-B2에 관찰-측 note 실렌더 assert + off byte 불변 contrast |
| N4 | reuse 편입을 always-key 전례로 구현하면 회전 반경이 전 사용자로 확대 | 존재-조건부 스프레드 핀 + no-capture 불변 assert |
| N5 | group 정규화-후-type 판정 시 data 파일 8건(RBS 등)이 code 오편입 | type 판정=원 언어 기준, group은 표기 전용 — 1문장 핀 |
| N6 | 다의 interpreters 7종(`lua`→{Lua,Terra} 등)에서 rung 2 "확정" 미정의 | rung 2를 rung 4~5와 동형화(유일→확정, type 필터, 실패→unknown+candidates) |

gpt 렌즈 라운드 2 (판정 "재설계" — v2 문안만 대상, v3 미반영): 라운드1 11건 중 9 닫힘·2 불충분 재확인 + 신규 6건. 겹침 처리 후 v4 반영:

| # | gpt 신규 finding | 처분 |
|---|---|---|
| finding5 재판정 (high) | note가 lens에만 붙는데 `writeSourceObservationDirective`(run.ts:12101) selection이 앞 — 러프 layout이 정밀 오인 우선선택·정밀 관찰 탈락(복구 불가). **주 세션 실코드 확증**(directive→selectedObservationIds→lens) | v4 §6-1: directive 프롬프트에도 layout note |
| N1 (high) | type=programming 자격이 Vue/Svelte/Astro(전부 Linguist markup) 배제 → 관찰 미도달. **주 세션 실데이터 확증**(.vue/.svelte/.astro=markup) | **owner 결정 → v4 markup 포함**(§3.3·§4.1) |
| N2 (medium) | `.cls` programming 필터 거짓 유일화 — 실측 정정: `.cls`는 programming 5개+TeX(markup)라 unknown이 됨(gpt 세부 부정확), 단 markup 파일에 layout 도는 취지는 유효 | owner markup 결정이 흡수(TeX도 code 관찰·tier 표시) |
| N3 (medium) | `.conf`/`.lock` 후보0 layout 실행 = **claude N2와 동일** | v3에서 이미 봉인 |
| N4 (medium) | group을 canonical language에 fold = Cython→python 정체성 오염. **claude N5보다 강한 지적**(표기 자체 오용) | v4 §3.2: group fold 폐기, 원 언어명 보존, parity만 group-aware |
| N5 (medium) | 다의 shebang 비결정 = **claude N6과 동일** | v3에서 이미 봉인 |
| N6 (medium) | note append와 fingerprint fold 술어 불일치 — 단일-member `not_applicable` non-null fingerprint(comprehension-set-tier.ts:502)가 note 미소비인데 회전. **주 세션 확증** | v4 §6-4: 동일 술어 `overview complete ∧ layout member ≥1` |

**두 렌즈 발산 판정(claude 조건부 vs gpt 재설계)**: gpt가 판 두 high(finding5·N1)를 claude가 놓침 — 이종 발산이 합집합으로 처리(표준). N1은 자격/분류 모델 재고를 요해 owner 결정으로 승격, 나머지는 배선 핀. gpt N2 세부 1건은 실측으로 정정(거짓 유일화 아님).

## 4d. owner 결정 (2026-07-21)

- **markup 포함**: 모든 markup을 layout 대상에. 근거(owner): markup도 개념 hierarchy·관계를 담는다. 잔여 오염(문서-markup의 표현요소 lexicon 혼입)은 tier 배선이 관리, 수용.
- 파급: kind 승격 "programming≥1"→"data/prose 전용 아니면 code", 자격 "비-programming 배제"→"data/prose 전용 배제". `.html`/`.vue`/`.svelte`/`.astro`/`.cls`(TeX 포함) 등이 code로 관찰 도달.

## 4e. design-verify 라운드 3 (v4, markup 파급 한정)

- **design-verify-claude 렌즈: spend limit 실패** — 산출 0(crash, verdict 무효). review-request "참여 확인" 원칙상 공백 처리. 주 세션(Opus)이 직접 실코드/실데이터 재검증으로 대체.
- **gpt 신선 렌즈(codex)**: 실행 중 (도착 시 이 절에 추가).

### 주 세션 직접 재검증 (Opus, claude 렌즈 공백 대체)

**성립 확인**:
- v4 배선 3건 실코드 성립: finding5(`writeSourceObservationDirective` run.ts:12101 — selection이 lens 앞·note 추가 가능), N4(group fold 폐기·parity group-aware), N6(`assembleCodeSetTier` not_applicable도 non-null fingerprint `comprehension-set-tier.ts:508-521`·overview null이라 note 미소비 — 술어 일치 필요 확증).
- 자격 규칙 Linguist 실데이터 검증(스크래치패드 languages.yml): Vue/Svelte/Astro/HTML/CSS/SCSS **실행**(markup), .yaml/.yml/.json/.toml/.xml/.env/.cfg **배제**(data 전용), .conf/.lock candidates-0(§4.1 명시배제 대상) — 의도대로.

**새 발견 (high 후보 — owner 결정 인접)**: **스키마 정의 언어가 배제된다.** `.graphql`(GraphQL)·`.proto`(Protocol Buffer)·`.prisma`(Prisma)는 Linguist `type=data`라 v4 자격("data/prose 전용 배제")이 layout을 **막는다**. 그러나 이들은 스키마 언어로 **lexicon(엔티티 `type`/`message`/`model` 정의)·relation(필드 참조)의 보고** — owner 의도("구조파싱으로 개념·관계 확보")의 최고 가치 대상. 실코드 확인: 세 확장자는 이미 `CODE_EXTENSIONS`·`CODE_WHOLE_CAPTURE_EXTENSIONS`에 있으나 observer 문법 없음 → **현재 raw text만 seed 도달(구조 없음)**, v4가 배제하면 그대로 방치. **함의**: `type=data` ≠ "구조 가치 없음". 자격 판정을 type 기반이 아니라 **배제-목록 기반**(순수 직렬화 포맷 yaml/json/toml/xml/ini/env/cfg/lock/conf만 배제, 스키마·markup은 실행)으로 재고 필요 — owner 결정 사안. (gpt 렌즈 대조 대기.)

## 4f. "구조화 문법 존재 = 자격" 프레이밍 비판 (owner 제안 2026-07-21, 다각도 반증)

owner 재프레이밍: code/문서 구분 폐기, 자격 = "구조화된 문법으로 작성되었는가"(YAML/JSON 포함, 키=entity·중첩=관계, 순수 산문만 배제). owner 지시 = 비판적 검토·보강. 주 세션(Opus) + gpt 렌즈(codex) 독립 비판, 실코드 확증.

**독립 수렴 (양 렌즈):**
- **약-구조 신호대잡음이 핵심 약점**: "키=entity"가 축② (구조-의미 정렬)에서 붕괴. **결정적 근거(gpt, 확증)**: `operational-ontology-seed-contract.md`가 "object type은 file/table/sheet/component 이름을 그대로 복사하지 말라"고 명시 → 키=entity는 **seed contract 위반**. 실 도메인 ontology `credit-risk-ontology.yaml` 반례(확증): `Borrower`/`Exposure`=entity, `definition`/`attributes`/`type`/`note`/`values`=메타키(entity 아님) — 전역 줄선두-키 규칙이면 메타키가 핵심 entity보다 다량 생성. `.onto/settings.json`(execution/enabled/model)·workflow YAML(jobs/steps/uses)는 entity 0이어야 하는데 전부 노이즈.
- **hierarchy "단일 파서 통일"은 과장**: 마커(MD `#`)·표(CSV)·JSON 괄호-키는 layout 규칙과 불일치. gpt: "통일 파서가 아니라 부정확한 dispatcher". 포맷별 권위 파서(JSON.parse·YAML parser·spreadsheet observer)가 이미 존재하고 더 정확.
- **중복/한계가치**: 문서=whole-capture로 이미 LLM 도달, `package.json`=`environment-content-parse.ts`가 JSON.parse로 정밀 추출(확증). generic key tree는 정보량 많고 의미 정밀도 낮음.

**gpt가 주 세션 검토를 넘어선 지점(주 세션 놓침):**
- **kind 폐기가 과하다**: `TargetMaterialKind`는 observer 선택 enum이 아니라 **읽기 전략·inventory 단위·source profile·excerpt(whole/bounded) 정책의 권위**(materialize-preparation.ts:193/334, source-profile-contract.md). 폐기하면 whole-capture 계약이 깨져 전체 material contract 재설계로 번짐. → kind 유지 + observer applicability **직교 축**.
- **자격 판정의 결정론성**: "구조화 문법 존재"는 실행 가능한 판정식이 아님(확장자/Linguist=언어식별일 뿐, parse 성공 요구하면 grammar-free 모순). 대안 = **사후 자격** `readable ∧ exact_adapter_resolved ∧ parse_succeeded ∧ supported_evidence_shape_emitted`. "grammar 존재"·Linguist type은 자격이 아니라 adapter 후보 탐색 근거로만.
- **minified false positive**: 한줄 JSON은 모든 키가 같은 line span → same-line coalesce로 노드 소실(자격 통과, 추출 실패).
- **역할 분리**: 추출 결과를 도메인 entity로 승격 말고 구조 역할로만 — `structural_key_path`·`declaration_candidate`(known schema)·`relation_candidate`(명시 from/to/ref)·`containment_path`(도메인 관계 아님). runtime은 구조 역할까지, 도메인 의미는 LLM.

**판정 (양 렌즈 수렴)**: serialization/schema 포맷까지 **observer 후보 확장은 정당**(현 `kind==="code"` gate가 너무 좁음 — GraphQL/Proto/Prisma·대형 serialization index 유용). 그러나 **(1) kind 폐기, (2) "구조화 문법 존재=자격", (3) 키=entity, (4) 단일 layout 파서는 기각.**

**보강 방향(합의 대상)**: kind 유지 + 직교 observer applicability 축 · 사후 자격(파싱 성공+증거 shape) · 포맷별 권위 파서(JSON→parse, YAML→parser, CSV→기존 spreadsheet observer, MD→heading-aware, code→tree-sitter/layout fallback) · 추출은 구조 역할까지·entity 승격은 LLM · generic config는 보존하되 entity pool 자동투입 금지(known schema/basename일 때만 상위 tier).

**원 목표와의 관계(문제 분리)**: 문제 A(tree-sitter 없는 프로그래밍 언어의 구조 → layout 파서)는 여전히 정당 — layout은 **코드 fallback**으로 유지. 문제 B(구조화 데이터/문서 → 포맷별 권위 파서)는 layout 아님. owner의 "구조 있으면 파싱"은 목적 수준에서 옳으나, 수단은 단일 파서가 아니라 "포맷별 권위 파서 + 공통 구조-증거 계약". v4의 "markup 포함" 결정도 이 렌즈에서 재편(markup=Vue/Svelte는 코드-유사라 layout, HTML/MD는 heading-aware 별도).

disclosure: `drafts/critique-gpt-structured-grammar.md`.

## 4g. v5 재편 설계 design-verify (gpt, 수정 조건부 → v5.1)

gpt 렌즈(codex, `drafts/design-verify-gpt-v5.md`): **수정 조건부** — 아키텍처 재편 타당(재설계 불요), 문제 B가 A의 숨은 전제 아님(단계 분리 유효). 4대 비판 폐쇄: kind 폐기·단일 layout=**닫힘**, 구조화문법=자격·키=entity=**불충분→R2/R5로 정밀화**. 신규 high 4 + medium 1, 전부 실코드 확증·v5.1 반영:

| ID | sev | finding | v5.1 |
|---|---|---|---|
| R1 | high | 4-role vocab이 gapless partition(comment_block/other/decl_header/footer, code-structure-observer.ts:37/124) 표현 불가 — 삭제=파티션붕괴·강제=의미날조 | §2: **2층 산출** — syntax kind(파티션) 보존 + 역할 additive annotation |
| R2 | high | tree-sitter는 malformed도 hasError=true 비-null tree(observer는 tree!==null만, :522/534) → "malformed=not_applicable"과 불일치 | §1.2: **parser별 acceptance**(serialization throw=fail, tree-sitter 기존동작, layout 파티션=성공) |
| R3 | high | v4 소비처 #5 env-profile 필터가 §6 계승("1~4")에서 탈락 → Lua 러프 `require react`가 framework:react 오승격(run.ts:2315→env-profile:703) | §6: **1~5 계승**, env-profile 필터 문제A 1차 복원+contrast |
| R4 | high | GraphQL/Proto/Prisma가 어느 seat도 없음(code분류·tree-sitter없음·layout=programming-only·serialization=JSON/YAML만) | §3.1: layout 대상을 사후자격 기반으로 확대(블록 선언 언어 포함, type=data 무관) |
| R5 | med | entity 억제가 observation-단위 candidate coverage 강제(run.ts:12663/12723)와 충돌·candidate에 role provenance 없음(artifact-types:1326) | §8·§12: role-aware candidate routing·generic 억제 비공허 검증을 **문제 B 게이트**로(문제A=코드는 producer 없어 vacuous) |

**단계 분리 판정(gpt)**: 문제 A는 code 승격+기존 profile/capture/materialize hook만으로 독립 착지. R1·R2·R3은 문제 A 전 반영(완료), R4는 §3.1 layout 확대로 문제 A 커버, R5는 문제 B 선행 계약. 아키텍처 유지.

## 5. 프로세스 기록

- packet 갭 2건이 실코드 재검증으로 정정됨(4중 테이블·env-profile 22/13) — blind packet의 "앵커 재검증 의무" 조항이 작동한 사례. 직전(env-profile) 병렬 설계의 "두 draft 공유 맹점=packet grounding" 교훈 대비 개선.
- 상호 교차검증이 각자의 자기 초안 결함(대칭 공개 2건)과 상대 결함을 모두 적발 — 이종 발산이 기대대로 신호를 생산.
- SpawnGate: Independence FRONTIER spawn ×4 (설계 2 + 교차검증 2), 전부 OAuth(무과금 동의 게이트 해당 없음).
