# 다음 작업 start-here (2026-07-22, layout observer 머지 후 /clear)

> **layout observer(문제 A)·tree-sitter 확장이 main에 착지 완료.** 이 문서는 그 다음 작업 착수 핸드오프다. 재개 시 pwd/branch/HEAD 재검증 필수([[cli-multi-model-workflow]] 정신), 코드 인용은 심볼로 재확인(라인=힌트, 스테일 가능). 설계 SSOT는 확정 — 재설계 금지, owner 결정 대기 항목은 아래 §3.

## 0. 상태 핀 (재개 전 확인)

```
cd /Users/kangmin/Documents/onto-mcp && git fetch origin main
git rev-parse --short HEAD        # main = 51dc460 (PR #249 머지) 이후. 뒤처지면 git pull
git log --oneline -3 origin/main  # 51dc460 layout(#249) · 27e9269 tree-sitter(#248)
npx vitest run                    # baseline 3,552 green + 1 todo
```

- **main HEAD `51dc460`**: tree-sitter 정밀 관찰 3→16종(#248) + grammar-free layout observer 롱테일(#249) 둘 다 착지.
- **layout은 opt-in `code_structure_layout` default OFF** — 기존 사용자·발행 스키마 무영향(off=byte-identical, 전 스위트가 off-path).
- **⚠️ git add 주의**: 세션 시작 시점 무관 untracked 파일(development-records 벤치·설계·핸드오프, `scripts/longform-observation-scan.*` 등 ~16개)이 워킹트리에 있다. `git add -A` 금지 — **명시 파일만 add**(지난 세션에 -A로 무관파일이 커밋에 섞여 3커밋 재구성으로 제거한 사고).
- **검증 렌즈 제약**: fable subagent = 월 spend limit([[onto-mcp-fable-spend-limit-20260721]]), codex(gpt) = 비대화형 셸 `_agent_launch_dispatch` 부재로 불가. 교차검증은 **Opus 서브에이전트(general-purpose + model:opus, frontier는 fable로 라우팅되니 금지) + 주 세션 직접**으로 축소 운용. 이종 gpt 필요 시 터미널 `! codex exec`(대화형).

## 1. 지금까지 (무엇이 끝났나)

- **Track T(#248)**: tree-sitter Tier 2 = TS/JS/Py + Go/Rust/Ruby/Java/C#/C++/PHP/Bash/CSS/PowerShell/Kotlin(16종) + Linguist 카탈로그(PR-A1, `linguist-language.ts`·`linguist-language-catalog.generated.ts`, vendor v9.6.0).
- **문제 A layout observer(#249)**: `src/core-runtime/code-layout-observer.ts` — grammar-free 러프 구조(마스킹→들여쓰기+괄호→laminar merge→depth-2·never-throw). opt-in `code_structure_layout`(capture 전제). dispatch grammar-first(`observeCodeStructureWithLayoutTier`). 소비 6곳(map-skip `code_layout_tier_not_applicable`·set-tier `parse_unavailable`·overview tier·env-profile 러프 import 제외·reuse identity fold). **신규 kind 0**(DD5 재사용). additive 필드 `extraction_tier`/`language_identification`/`layout_census`.
- **의도적 보류(owner 승인 2026-07-22)**: ① 역할 annotation(declaration_candidate 등) 미산출 → 문제 B로 이관. ② prose 해석 note(#1·#4) 미추가 → 실사용 후 트리거. 상세 [[onto-mcp-structure-evidence-treesitter-expansion-20260722]].

## 2. 다음 작업 후보 (owner 우선순위 결정)

**후보 A — 문제 B: serialization/document observer** (프레임워크 확장, 설계상 정규 다음 단계):
- **serialization observer**: 순수 데이터 JSON/YAML/TOML. 권위 파서(`JSON.parse`/런타임 YAML)로 map/list tree → `structural_key_path`/`containment_path`. 알려진 basename schema면 `declaration_candidate` 상향. **주 가치 = 대형 파일이 bounded excerpt로 잘릴 때 container index(골격)**. TOML은 parser 도입 전 명시 unsupported. (GraphQL/Proto/Prisma는 이미 layout seat.)
- **document observer**: Markdown/AsciiDoc. heading 계층=`containment_path`, fenced 코드 블록 **제외**(예시코드 오인 방지). **한계**: 문서는 이미 whole-capture로 LLM 도달(중복) → 가치는 "대형 문서 잘릴 때 heading 골격 + attention"으로 한정.
- **미채택 유지**: `.env` flat·로그(schema 없으면 not_applicable)·CSV(기존 spreadsheet observer).
- **선행 계약(R5)**: 아래 §4. **역할 annotation(2층 산출 §2)이 문제 B에서 처음 실제 산출·소비**된다(문제 A는 소비자 없어 보류). 이게 후보 A를 "layout 후속"이 아니라 "프레임워크 완성"으로 만드는 핵심.

**후보 B — layout repo-settings 승격** (작은 운영 작업): `code_structure_layout`을 repo `.onto/settings.json`에 ON. env-profile #246/#247 전례(발행 strict 스키마가 신규 키를 아는 버전 이후 승격). 실사용 시작 = 후보 A의 "실 파이프라인 검증" 전제이기도 함. **주의**: 승격 = capture-on reuse key 1회 회전(§9, owner 승인됨).

**후보 C — prose 해석 note 추가** (실사용 트리거 시): layout 실사용 후 "extraction_tier 도장만으로 LLM이 러프임을 인지하는지" 부족 판단되면 #1(selection-prompt)·#4(set-tier seed) note 추가. N6 fingerprint 동일-술어 규율 준수 필수(설계 §6-1·§6-4).

## 3. owner 결정 남은 것 (문제 B 착수 전)

- **문제 B 착수 시점·순서**: serialization vs document 우선순위 (설계 §12-2). 가치 미입증이라 "실 semantic path 비교 전까지 가설"(§12-1) — 착수는 문제 A 실사용 검증 후 권장.
- **known-schema 초기 집합**(§12-3): `declaration_candidate` 상향 대상 = GraphQL/Proto/Prisma + 알려진 basename(예 `credit-risk-ontology.yaml`류). 초기 목록 확정 필요.
- **각 observer 자체 opt-in 키 이름** + 배포 게이트.

## 4. 문제 B 핵심 계약 (설계 SSOT 발췌 — 착수 시 원문 정독)

**설계 SSOT**: `development-records/design/20260721-structure-evidence-framework-design.md` (v5.1) — §1.2(사후 자격)·§2(2층 산출·역할 vocabulary)·§5(entity 승격 경계+contrast gate)·§7(문제 B)·§8(소비 배선·R5)·§9(단계)·§12(owner 결정).

- **§2 역할 vocabulary(4종, 문제 B에서 실산출)**: `declaration_candidate`(알려진 schema/키워드 선언 위치) · `relation_candidate`(from/to/ref/import 구조) · `structural_key_path`(구조 키 — entity 승격 **금지**) · `containment_path`(부모-자식 컨테이너 — 도메인 관계 아님). **entity 승격은 runtime이 안 함** — LLM(의미 트랙)이 판단.
- **§2 generic config 억제**: settings.json·workflow YAML 키는 `structural_key_path`/`containment_path`로 보존하되 `declaration_candidate` 승격 **안 함**. `declaration_candidate`는 known basename·schema일 때만.
- **§8 R5(문제 B 선행 계약, 비공허 검증 여기서만)**: selection→candidate는 **observation 단위**(`run.ts` `writeSourceObservationDirective` 인근)이고 선택된 모든 observation에 candidate coverage 강제·누락 시 repair가 재생성 — **candidate shape에 구조-역할 provenance 없음**(`artifact-types.ts` candidate 타입). 따라서 "declaration만 후보 경로" 억제 = **observation 단위 억제 또는 role provenance 배선** 필요. 실 producer(generic config observation)가 문제 B에서만 생기므로 문제 A에선 vacuous. **예산 경합**(저가치 config 계층이 고가치 관찰을 selection 64·projection 40K에서 밀어냄)도 문제 B 게이트. → 라인 번호는 스테일 가능, 심볼로 재확인.
- **§5 contrast gate(entity 억제 증명, 착수 시 전수)**: settings/workflow YAML → entity candidate **0**(structural_key_path만); credit-risk 메타키(`definition`/`type`/`note`/`values`) 제외; CSV→spreadsheet observer만; README heading 추출·fenced JSON 제외; minified JSON → 정확 파서 tree(불가 시 unsupported)·malformed→fail-loud.
- **§1.2 사후 자격**: serialization은 parse throw 없음=성공·malformed→not_applicable(fail-loud, 추측 복구 금지). document는 heading/fence-aware.
- **재사용 패턴**: layout observer가 확립한 것들 그대로 — opt-in 게이팅 체인(§7 ①~⑥ threading)·off=byte-identical·extractor sha fold 완전성(**모듈-스코프 regex·미fold 헬퍼도 명시 fold** — 지난 교차검증 교훈)·소비 배선 inert 금지·reuse identity 존재조건부 fold·never-throw.

## 5. 참조

- MEMORY: [[onto-mcp-structure-evidence-treesitter-expansion-20260722]](Track T+layout 머지 완료 이력) · [[onto-mcp-semantic-map-multiartifact-start-20260718]](task #10 계보) · [[design-parallel-frontier-crossverify]] · [[onto-mcp-post-impl-cross-verify-expectation]] · [[onto-mcp-fable-spend-limit-20260721]].
- 설계 계보: `development-records/design/20260721-structure-evidence-framework-design.md`(v5.1 상위) · `20260721-language-agnostic-structure-parsing-design.md`(v4 layout 상세, 문제 A) · `...crossverify-synthesis.md`(판정 계보).
- 직전 핸드오프: `development-records/handoff/20260722-layout-observer-start-here.md`(문제 A 착수, 이제 완료).
