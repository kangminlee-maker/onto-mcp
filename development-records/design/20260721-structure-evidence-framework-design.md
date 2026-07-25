# 구조 증거 프레임워크 설계 (v5.1, 2026-07-21 아키텍처 재편)

> **상위 SSOT.** "언어-무관 구조파싱"을 "구조화 문법 존재 = 자격"으로 통일하려던 방향이 양 렌즈 비판으로 재편됨(synthesis §4f, owner 승인 2026-07-21). 계보·판정: `20260721-language-agnostic-structure-parsing-crossverify-synthesis.md`. 문제 A(코드 layout) 구현 상세: `20260721-language-agnostic-structure-parsing-design.md`(v4, superseded 헤더 참조). 기준 HEAD `4576ac1`. 상태: **재편 설계 v5 → gpt 재검증(수정 조건부) 반영 v5.1 → owner 승인 → 단계적 구현**.
>
> v5.1 (gpt design-verify R1~R5 반영): 역할=syntax kind 대체 아닌 additive(§2 R1)·parser별 acceptance 기준(§1.2 R2)·env-profile 필터 문제 A 계승 복원(§6 R3)·layout 대상을 사후자격 기반으로 확대해 GraphQL/Proto/Prisma 커버(§3.1 R4)·generic config 억제 검증은 문제 B 게이트(§8·§12 R5).

## §0. 재편 결정 요약

reconstruct의 결정론 구조 증거 공급을 **단일 layout 파서**가 아니라 **구조 observer 프레임워크**로 설계한다. 핵심 재편 4가지(비판 수렴):

1. **kind는 유지, observer 자격은 직교 축**. `TargetMaterialKind`(code/document/spreadsheet/database)는 읽기 전략·capture 정책·source profile의 권위이므로 폐기하지 않는다. "이 파일에 어떤 구조 observer가 붙는가"는 kind와 **직교하는 별도 축**.
2. **자격은 사후 판정**. "구조화 문법으로 작성됐는가"(사전 추측·판정식 불가)가 아니라 **`readable ∧ 권위-파서 parse 성공 ∧ 지원 증거 shape 산출`**(사후 사실). Linguist/확장자는 자격이 아니라 **adapter 후보 탐색 근거**로만.
3. **포맷별 권위 파서**. "들여쓰기+괄호 단일 파서로 통일"을 기각. 각 포맷은 그 포맷의 권위 파서로: JSON→`JSON.parse`, YAML→YAML parser, CSV→기존 spreadsheet observer, Markdown→heading-aware, tree-sitter 없는 코드→layout fallback.
4. **추출은 구조 역할까지, entity 승격은 LLM**. "키=entity·중첩=도메인 관계"를 기각 — onto seed contract(`operational-ontology-seed-contract.md`: object type은 file/table/key 이름 복사 금지) 위반. 추출 산출은 구조 역할 vocabulary로만 표기, 도메인 의미는 의미 트랙(LLM)이 판단.

**두 문제의 분리**: 이 재편은 원래 하나로 뭉쳐 보이던 것이 실은 둘임을 드러낸다.
- **문제 A** (원 핸드오프): tree-sitter 문법이 없는 **프로그래밍 언어**의 구조 → **layout observer**가 정당(코드는 들여쓰기/괄호가 실제 구조). 이 재편에서도 유지. **1차 스코프.**
- **문제 B** (owner 확장): **구조화 데이터/문서**(YAML/JSON/Markdown 등) → layout이 아니라 **포맷별 권위 파서**. 프레임워크 확장점으로 설계, 구현은 후속.
공통은 "구조 증거를 seed에 결정론으로 공급"이라는 *목적*뿐, *수단*(파서)은 갈린다.

## §1. 아키텍처: 구조 observer 프레임워크

### 1.1 두 축의 직교

| 축 | 소유 | 값 |
|---|---|---|
| **material kind** (기존, 불변) | 읽기 전략·whole/bounded capture·source profile | code / document / spreadsheet / database / unknown |
| **structure observer** (신규 프레임워크 축) | 결정론 구조 증거 산출 | tree-sitter(code 강) / layout(code 약·fallback) / serialization(JSON·YAML) / document(markdown) / tabular(→spreadsheet observer) / none |

한 파일은 kind 하나 + observer 후보 0~1개. observer 축 추가가 kind 계약(capture·profile)을 건드리지 않는다(비판 축1-kind: kind 폐기 시 whole-capture 붕괴 회피).

### 1.2 사후 자격 (비판 축1-결정론)

```
observer_applicable(file, observer) =
  readable(file)
  ∧ observer.parse(file) satisfied observer's acceptance criterion
  ∧ observer emitted a supported evidence shape (§2)
```

- "grammar/구조화 문법 존재"·Linguist `type`은 자격이 **아니라** observer **후보 탐색 근거**(어떤 파서를 시도할지). 최종 자격은 실제 parse.
- **acceptance 기준은 parser별로 명시된다(R2 — "malformed 무조건 not_applicable"은 tree-sitter 현실과 불일치: tree-sitter는 malformed에도 `hasError=true`인 비-null tree를 반환하고 현재 observer는 `tree!==null`만 검사)**:
  - **serialization**(JSON.parse/YAML): parse throw 없음 = 성공. malformed→throw→`not_applicable`(fail-loud, 추측 복구 없음).
  - **tree-sitter**: 기존 동작 보존(비-null tree = 성공; error-recovery tree의 부분 구조는 유효 admission) — G-SEM 불변, 이 재편이 acceptance를 바꾸지 않는다.
  - **layout**: never-throw로 항상 파티션 산출 = 성공. 단 `layout_binaryish`/`layout_minified`/`layout_internal_invariant`(v4 §4.1)는 `unsupported`.
- minified 등 "문법 유효하나 layout 주소지정 불가"(한줄 JSON 전 키가 같은 line span)는 권위 파서(JSON.parse)면 정확 tree, layout이면 `unsupported` — 후보 우선순위가 이를 라우팅(§3.2).

### 1.3 포맷별 권위 파서 원칙 (비판 축4)

layout(들여쓰기+괄호)은 **코드에만** 권위. 데이터/문서는 각 포맷의 정확 파서가 이미 결정론적이고 우월(JSON.parse·YAML parser·기존 spreadsheet observer). "공통 layout 규칙을 늘리면 결국 포맷별 규칙 집합인데 실제 파서보다 정확성만 낮은 dispatcher"가 됨 — 회피.

## §2. 공통 구조-증거 계약 (2층 산출 — 비판 축3, R1)

observer 산출은 **두 층**이다(R1 — 역할이 syntax kind를 대체하면 gapless partition이 깨지거나 의미를 날조한다):

**① syntax kind (기존, gapless line-ownership partition 소유)**: v4/tree-sitter의 `class_decl`·`function_decl`·`comment_block`·`other`·`decl_header`·`decl_footer` 등 전 leaf를 커버 — 삭제하면 파티션 붕괴, 4역할로 강제하면 comment/expression을 declaration으로 날조. **보존한다.**

**② 역할 annotation (additive — entity 억제·소비 라우팅용)**: syntax kind 위에 얹는 닫힌 역할. 파티션을 바꾸지 않고 각 span/노드에 선택적으로 부착:

| 역할 | 의미 | 예 |
|---|---|---|
| `declaration_candidate` | **알려진 schema/키워드**의 선언 위치 | GraphQL `type X`, Proto `message X`, 코드 정의 키워드 뒤 식별자 |
| `relation_candidate` | 명시적 `from`/`to`/`ref`/`target`/import 구조 | 코드 import, GraphQL 필드 참조 |
| `structural_key_path` | 구조적 키 위치 (generic — entity 승격 금지) | YAML/JSON 키, TOML 테이블 |
| `containment_path` | 부모-자식 컨테이너 경로 (도메인 관계 **아님**) | YAML `logging.level`, 코드 class>method |

- **entity 승격은 runtime이 하지 않는다.** runtime은 syntax kind + 구조 역할까지 결정하고, "이 `declaration_candidate`가 도메인 개념인가"는 LLM(의미 트랙)이 판단. seed contract 정합.
- **generic config 억제(비판 축3)**: `settings.json`·workflow YAML 키는 `structural_key_path`/`containment_path`로 보존(navigation·환경 맥락엔 유용)하되 **`declaration_candidate`로 승격 안 함** — entity 후보 풀 자동 투입 금지. `declaration_candidate`는 **알려진 basename·schema profile**(GraphQL/Proto/Prisma, 코드 정의 키워드)일 때만. 단 이 억제의 **비공허 검증은 실 producer가 있는 문제 B에서**(문제 A=코드엔 generic config producer 없음 — §8·§12 R5).

## §3. observer 레지스트리

### 3.1 observer 목록

| observer | 대상 (후보 탐색 근거) | 파서 | 산출 역할 | 상태 |
|---|---|---|---|---|
| **tree-sitter** (기존) | 문법 번들 있는 코드(TS/JS/Py) | tree-sitter WASM | declaration/relation/containment | 기존, 불변(G-SEM) |
| **layout** (문제 A) | tree-sitter 미지원 ∧ serialization/tabular 권위 파서 대상 아님 ∧ 블록/들여쓰기 구조(R4: 프로그래밍 언어 + **GraphQL/Proto/Prisma 같은 블록 선언 언어** — type=data여도 사후 자격이면 applicable, "type=programming"으로 좁히지 않음) | 들여쓰기/괄호 layout | declaration(키워드)/relation(import·필드참조)/containment | 신규 1차 — §6 |
| **serialization** (문제 B) | **순수 데이터** JSON/YAML/TOML (선언 언어 제외 — 그건 layout seat) | `JSON.parse`/YAML parser/(TOML 전까진 unsupported) | structural_key_path/containment | 신규 후속 — §7 |
| **document** (문제 B) | Markdown/AsciiDoc | heading/fence/list-aware | containment(heading 계층), fenced 코드 제외 | 신규 후속 — §7 |
| **tabular** (재사용) | CSV/TSV | **기존 spreadsheet-structure-observer** | header/columns | 기존 재사용 — 라우팅만 |

### 3.2 후보 우선순위·라우팅

- 한 확장자에 여러 후보 가능(예: `.ts`=tree-sitter, tree-sitter 실패 시 layout 아님 — 코드 parse 실패는 fallback 금지, v4 grammar-first 유지). 우선순위: **정확 파서 > fallback**. JSON은 serialization(JSON.parse) 우선, layout 아님(minified false-positive 회피).
- CSV는 **layout에 넣지 않는다** — 기존 spreadsheet observer가 tabular 의미(header/columns) 소유. 중복 금지.
- 후보 0 또는 전 후보 parse 실패 → 구조 증거 없음(기존 raw/bounded 경로 불변).

## §4. Linguist 역할 재정의

**Vendor pin (owner 확정 2026-07-22)**: 태그 `v9.6.0` · 커밋 SHA `1d7ac7ed569bd6edef5d0cfc73feea2573cb0e03` · 라이선스 **MIT**(확증) · `lib/linguist/languages.yml` sha256 `8e9590cb293ec547030df9843c5046f2ba283ceddf2831c899d288d67f01ab12`(814 언어, 9,438줄). moving branch 금지 — 태그+SHA로 고정. 이 버전에서 핵심 자격 라우팅(layout: `.lua`/`.hs`/`.ex`… programming, `.graphql`/`.proto`/`.prisma` data→layout seat; serialization 배제: `.yaml`/`.json`/`.xml`/`.env` data; markup: `.vue`/`.svelte`/`.html`) 재확인 완료. 다의 interpreter(`bun`/`deno`/`lua`/`perl`)는 §3.2 rung2 처리로 흡수. 회귀 웹조사: 릴리스 노트 breaking 없음, 발행후 이슈는 신규언어·GitHub 통계캐시(#8065, 데이터 vendor와 무관).

Linguist(빌드타임 생성 카탈로그, v4 §3 방식 유지)는 **자격이 아니라 observer 후보 탐색·언어 식별**에만:
- 확장자→언어 사다리(filename→shebang→유일→type필터→unknown+candidates, group은 표기 아닌 **비교 보조**만 — v4 N4)로 **언어 토큰**(purpose 근거·표기) 산출.
- 언어의 Linguist `type`으로 **observer 후보 선택**(programming+tree-sitter미지원→layout 후보, data→serialization 후보 등). 이건 "어떤 파서를 시도"이지 자격이 아님 — 자격은 §1.2 parse 성공.
- 언어 테이블 3중 존재(observer/env-profile/whole-capture) 단일-소스화는 v4 §3.3 판정(신규 소비처만 Linguist, 기존 불변) 유지.

## §5. entity 승격 경계 (seed contract 정합)

- runtime 산출 = §2 구조 역할. 어떤 observer도 파일명·키·테이블명을 도메인 object type으로 승격하지 않는다(`operational-ontology-seed-contract.md` 정합).
- 최소 contrast gate(구현 검증, 비판 보강 §5):
  - `credit-risk-ontology.yaml`: `Borrower`/`Exposure`는 known-schema면 declaration_candidate, `definition`/`type`/`note`/`values`는 structural_key_path(entity 아님).
  - `.onto/settings.json`·workflow YAML: entity candidate **0** (structural_key_path만).
  - CSV → spreadsheet observer만.
  - README: heading 추출·fenced JSON 제외.
  - minified JSON: 정확 파서 tree(불가 시 unsupported), malformed → fail-loud.

## §6. 문제 A — 코드 layout observer (1차 스코프)

**대상**: Linguist type=programming ∧ tree-sitter 미지원 확장자(예 .lua/.hs/.ex/.zig/.scala/.clj/.dart). markup(Vue/Svelte는 코드-유사)은 이 observer가 아니라 문제 B(document/serialization) 또는 별도 판단 — v4 "모든 markup 포함"은 §7로 재편.

**구현 상세**: `20260721-language-agnostic-structure-parsing-design.md`(v4) §4(dual layout 알고리즘·마스킹·lexicon 키워드·import), §5(inventory shape + tier), **§6(소비 배선 1~5 — env-profile import 필터 #5 포함, R3)**, §7(dispatch grammar-first·게이팅·threading), §9(fingerprint·reuse), §10(PR-B1/B2)를 계승. 재편 반영 델타:
- **자격**: v4 "Linguist type 배제"(§4.1) → **§1.2 사후 자격**으로 대체. layout은 tree-sitter 미지원 + serialization/tabular 대상 아닌 파일(프로그래밍 언어 + GraphQL/Proto/Prisma 블록 선언 — R4)에 시도, parse 성공(파티션 산출) 시 applicable.
- **kind 승격**(v4 §3.3): 유지하되 layout 대상 언어를 code 승격(markup 최종 배치는 §7·§12-5). generic config 승격 없음.
- **산출(R1 2층)**: v4 syntax kind(class_decl 등, gapless partition)를 **보존**하고, 그 위에 §2 역할 annotation을 additive로 부착 — 정의 키워드 뒤 식별자=declaration_candidate, import=relation_candidate, 중첩=containment_path.
- **env-profile 필터(R3, high)**: v4 §6-5 = layout-tier import를 env-profile projection(`run.ts:2315`)에서 제외. **문제 A 1차에 반드시 복원** — 누락 시 Lua 러프 `require "react"`가 `framework:react` strong으로 오승격(`environment-context-profile.ts:703`). contrast test 포함.
- v4 배선 findings(finding5 directive note·N6 note/fingerprint 술어·reuse authority)는 **structure observer 일반**으로 유효(§8).

**1차인 이유**: 원 핸드오프 목표, entity 승격 논란 없음(코드 정의 키워드=강 신호), v4에서 이미 상세 설계·2라운드 검증됨.

## §7. 문제 B — serialization/document observer (프레임워크 확장, 후속)

**원칙**: 포맷별 권위 파서(§1.3) + 구조 역할 산출(§2) + entity 억제(§5). 구현은 가치·리스크 평가 후 단계적.

- **serialization** (순수 데이터 JSON/YAML/TOML): 권위 파서로 map/list tree → containment_path/structural_key_path. 알려진 basename schema면 declaration_candidate 상향. 대형 serialization의 container index가 주 가치(대형 파일이 bounded excerpt로 잘릴 때 골격). TOML은 parser 도입 전 명시 unsupported. (GraphQL/Proto/Prisma는 serialization이 아니라 **layout seat** — §3.1 R4.)
- **document** (Markdown/AsciiDoc): heading 계층=containment_path, fenced 코드 블록 **제외**(예시 코드 오인 방지), 리스트/인용 들여쓰기를 개념 포함으로 오인 금지. **한계**: 문서는 이미 whole-capture로 LLM 도달(중복) — 가치는 "대형 문서 잘릴 때 heading 골격 + attention 타깃팅"으로 한정.
- **미채택 유지**: `.env` flat(hierarchy 0), 로그(schema 없으면 not_applicable), CSV(spreadsheet observer로).

**후속 게이트**: 문제 B는 문제 A 착지 + 실 파이프라인 검증 후 착수. 각 observer는 자체 opt-in + contrast gate(§5). 의미 품질 개선 주장은 실 semantic path에서 fixture 2+·조건당 3회+ 비교 전까지 가설(비판 결론).

## §8. 소비 배선 (structure observer 공통)

v4 §6 배선을 **observer-일반**으로 승격(layout 국한 아님):
- tier/observer-kind 신호를 산출에 명시(tree-sitter=정밀, layout=러프, serialization=정확-but-generic). 소비 프롬프트(directive selection·lens/purpose/candidate)에 해석 note — v4 finding5(directive가 selection authority) 유효.
- reuse authority(v4 §9): observer 산출 정체성을 `sourceObservationsReuseSha256`에 존재-조건부 편입(로직/카탈로그 갱신 회전).
- set-tier note/fingerprint 동일 술어(v4 N6).
- **entity 억제 배선(R5, 문제 B 게이트)**: structural_key_path/containment_path는 seed candidate 풀에 자동 투입 안 함(§2·§5). 단 실제 selection→candidate는 **observation 단위**이고(`run.ts:12101`) 선택된 모든 observation에 candidate coverage가 강제되며(`run.ts:12663`) 누락 시 repair가 후보를 다시 만든다(`run.ts:12723`) — candidate shape엔 구조-역할 provenance가 없다(`artifact-types.ts:1326`). 따라서 "declaration만 후보 경로" 억제는 **observation 단위 억제 또는 role provenance 배선**이 필요하며, 그 실 producer(generic config observation)는 **문제 B에서만** 존재한다. 문제 A(코드)는 generic config producer가 없어 이 억제 검증이 vacuous → **role-aware candidate routing은 문제 B 선행 계약**(§9·§12 R5). 예산 경합(저가치 계층이 고가치 관찰을 selection 64·projection 40K에서 밀어냄)도 문제 B 게이트.

## §9. 단계적 구현

| 단계 | 범위 | 게이트 |
|---|---|---|
| **PR-0** | `.cjs`/`.mts`/`.cts` CODE_EXTENSIONS 결함 수정(v4 §10 PR-0) — 재편 무관, 독립 | 단일 파일 관찰 도달 |
| **1차 = 문제 A** | 코드+블록선언 layout observer(§6, v4 상세 계승 + 재편 델타 R1~R4) + 2층 산출(§2) + parser별 사후 자격(§1.2) + Linguist 후보-탐색(§4) | v4 PR-B1/B2 검증 + **R1 2층 파티션 보존** + **R2 acceptance** + **R3 env-profile 필터 복원+contrast** + GraphQL/Proto/Prisma layout parse fixture |
| **후속 = 문제 B** | serialization → document 순(§7), 각 자체 opt-in·contrast + **R4 잔여(전용 정밀 파서 upgrade)** + **R5 role-aware candidate routing·generic 억제 비공허 검증** | §5 gate 전수 + 실 파이프라인 |

프레임워크(§1·§2·§8)는 1차에서 확립하되 observer는 layout만 등록, 나머지는 확장점. **R4·R5는 문제 B 명시 선행 계약**(단계 분리 유지 — gpt 판정: 문제 B는 A의 숨은 전제 아님).

## §10. 개념 경제

- **재사용**: material kind(불변)·spreadsheet observer(CSV 라우팅)·JSON.parse(environment-content-parse 전례)·YAML parser(런타임 의존)·tree-sitter observer·v4 layout 알고리즘/배선/fingerprint.
- **신규**: structure observer 프레임워크 축(applicability, kind 직교)·사후 자격 술어·역할 vocabulary 4종(containment_path/structural_key_path/declaration_candidate/relation_candidate)·observer 레지스트리·Linguist 후보-탐색 역할.
- **기각(도입 금지)**: kind 폐기·"구조화 문법=자격"·키=entity·단일 layout 통일 파서·framework 카탈로그·LLM assist·TOML(문제 B 전까지).

## §11. 검증

- 사후 자격 falsifiable: parse 실패 fixture→not_applicable·raw 경로 불변; parse 성공→증거 shape.
- §5 contrast gate 전수(entity 억제 증명 — settings/workflow entity 0, credit-risk 메타키 제외).
- 문제 A: v4 §11 검증(파티션 property·grammar-first negative·off-path 골든·reuse 회전) 코드 한정 계승.
- observer 후보 라우팅: JSON→serialization(layout 아님)·CSV→spreadsheet·minified→정확파서/unsupported.
- 예산 경합: 저가치 config 계층 추가가 고가치 관찰을 selection/projection에서 밀어내지 않음(declaration 우선 assert).

## §12. 위험·한계·owner 결정

1. **문제 B 가치 미입증**: serialization/document 구조 증거의 seed 개선은 가설 — 실 semantic path 비교 전까지 확정 금지. 문제 A 우선의 근거.
2. **[owner 결정] 문제 B 착수 시점·순서**: 문제 A 착지 후 재론. serialization vs document 우선순위.
3. **[owner 결정] known-schema 목록**: declaration_candidate 상향 대상(GraphQL/Proto/Prisma + 알려진 basename)의 초기 집합.
4. **Linguist 태그 pin**: **확정 v9.6.0**(§4). **reuse 1회 회전**(v4 §13-4)은 문제 A 구현(B2)에서 capture-on 사용자에게 발생 — 착수 시 재확인.
5. markup(Vue/Svelte/HTML) 최종 배치: 코드-유사(Vue `<script>`)는 layout·문서-유사(HTML/MD)는 document observer — 문제 B에서 확정.

## §13. 계보

- 원 방향: `handoff/20260721-language-agnostic-structure-parsing-start-here.md` → 초안/교차검증/design-verify → v4(`20260721-language-agnostic-structure-parsing-design.md`, superseded).
- 재편 판정: synthesis `20260721-language-agnostic-structure-parsing-crossverify-synthesis.md` §4f(비판)·§4d(markup owner 결정, §7로 재편) · 비판 disclosure `drafts/critique-gpt-structured-grammar.md`.
- MEMORY: `[[onto-mcp-semantic-map-multiartifact-start-20260718]]`(task #10) · `[[design-parallel-frontier-crossverify]]` · `[[onto-mcp-fable-spend-limit-20260721]]`.
