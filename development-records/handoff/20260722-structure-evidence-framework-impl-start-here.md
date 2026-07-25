# 구조 증거 프레임워크 — 구현 착수 start-here (2026-07-22, /clear 후 재개)

> 설계 **완료·owner 승인 완료**. 이 문서는 **구현 착수** 핸드오프다. 재개 시 pwd/branch/HEAD 재검증 필수, 코드 인용은 심볼로 재확인(라인=힌트). 설계는 확정이니 재설계 금지 — 구현 + 구현 후 3-렌즈 교차검증.

## 0. 상태 핀 (재개 전 확인)

```
cd /Users/kangmin/Documents/onto-mcp && git fetch origin main && git log --oneline -3 origin/main
npx vitest run   # baseline 3,419 green + 1 todo
gh pr list --state open   # #246·#247 (Stage 3a 마무리, 이 작업과 독립)
node -e "console.log(process.version)"; npm view onto-mcp version
```

- **main = `4576ac1`** 기준 설계. 재개 시 origin/main 갱신 여부 확인(그새 머지 있으면 rebase 고려).
- 워킹트리: 설계 문서만 추가됨(커밋 안 함 — 이 세션에서 development-records/design·handoff에 작성). 구현 전 이 문서들 커밋 여부는 owner 판단.
- **fable-5 spend limit 묶임**([[onto-mcp-fable-spend-limit-20260721]]) — 검증 렌즈는 **gpt(codex OAuth) + 주 세션 직접**. fable subagent 금지.

## 1. 설계 SSOT (읽는 순서)

1. **`development-records/design/20260721-structure-evidence-framework-design.md` (v5.1)** — 상위 SSOT. 아키텍처 재편·문제 A/B 분리·2층 산출·사후 자격·Linguist pin(§4).
2. **`development-records/design/20260721-language-agnostic-structure-parsing-design.md` (v4, SUPERSEDED)** — 문제 A(코드 layout) **구현 상세**(§4 알고리즘·§5 shape·§6 배선·§7 게이팅·§9 fingerprint·§10 PR). v5.1 §6이 이걸 코드 한정 계승 + R1~R4 델타.
3. **`development-records/design/20260721-language-agnostic-structure-parsing-crossverify-synthesis.md`** — 판정 계보(§4b~§4g). 왜 이 설계인지의 근거.

## 2. 이 작업이 무엇인가 (한 문단)

reconstruct의 결정론 구조 증거 공급을 **구조 observer 프레임워크**로. kind(읽기·capture 권위)는 유지하고 observer 자격은 **직교 축·사후 판정**(파싱 성공+증거 shape). **1차 = 문제 A**: tree-sitter 없는 프로그래밍 언어 + GraphQL/Proto/Prisma(블록 선언) → **grammar-free layout observer**로 hierarchy·lexicon·relation(구조 역할)을 뽑아 seed 저작의 결정론 근거로. 추출은 구조 역할까지, entity 승격은 LLM(seed contract 정합). 문제 B(serialization/document 권위 파서)는 후속.

## 3. 구현 순서 (문제 A 1차)

**PR-0 (즉시·독립, 재편 무관)**: `.cjs`/`.mts`/`.cts`를 `target-material-kind.ts` `CODE_EXTENSIONS`에 추가(observer 지원인데 분류 누락→관찰 미도달 결함). review 분류기 공유 파급 고지. done-when: 단일 `foo.mts` 관찰 도달 + review kind 테스트 + 전 스위트.

**문제 A** (v4 PR 경계 계승, R1~R4 델타 반영):
- **PR-A1 Linguist 카탈로그**: `vendor/linguist/`(v9.6.0 pin — 태그·SHA·LICENSE·VERSION, §4) + `scripts/generate-linguist-tables.ts`(필요 필드 projection·생성 TS 상수·closed union·`LINGUIST_DATA_SHA256`/`LINGUIST_CATALOG_SHA256`) + `src/core-runtime/linguist-language.ts`(판정 사다리: filename→shebang[다의=type필터→unknown+candidates, R:N6]→유일→type필터→unknown+candidates; **group fold 폐기**·표기는 원 언어명, group은 parity 비교만 — v4 N4). 런타임 배선 0(inert 명기). done-when: 드리프트 CI(재생성 byte-동일)·candidate-aware parity(v4 §3.4)·다의 interpreter 단위.
- **PR-A2 게이팅·분류**: settings 키 `code_structure_layout`(settings-chain.ts) + `resolveCodeObservationOptIns`(reconstruct-api.ts:582) 4번째 반환값 + prepare/run 스프레드 + `RunReconstructParams` + 분류기 unknown-fallback(Linguist programming/블록선언→code, walker 관통 target-material-kind.ts:166/191) + 확장자-없음 128B shebang rung. **활성화 체인 전수**(v5.1 §6·v4 §7 ①~⑥). done-when: 라이브 settings 통합 테스트(silent-off 검출)·off byte-identical·layout=true∧capture=false fail-loud.
- **PR-B1 layout observer**: `src/core-runtime/code-layout-observer.ts` 순수 모듈. v4 §4 알고리즘(dual 들여쓰기+괄호·마스킹 heredoc 문맥제한·prefix-관계 깊이·never-throw→unsupported·depth-2 파티션). **R1: syntax kind(gapless partition) 보존 + 역할 annotation additive**(declaration/relation/structural_key_path/containment). **R2: layout acceptance=파티션 산출=성공**(binaryish/minified/internal_invariant만 unsupported). done-when: 파티션 property·다언어 fixture(Go/Ruby/Haskell/Lua/C헤더 + **GraphQL/Proto/Prisma 블록 파싱** R4)·negative(산문→심볼0)·never-throw.
- **PR-B2 배선**: dispatch grammar-first(parse실패 fallback금지) + materialize 훅 + **소비 배선 1~5**(directive+lens/purpose/candidate note[finding5]·map skip 3사이트[fresh/resume/allowlist]·resolver truncation우선+tier게이트·overview note[N6 동일술어]·**env-profile 필터[R3 복원]**) + threading 6사이트 + reuse authority(존재-조건부, N4) + observer 타입 확장. done-when: v4 §10 PR-B2 done-when 전수 + R3 env-profile contrast(Lua `require react`→framework 미승격) + grammar-first negative.

**주의(R5·문제 B 게이트)**: generic config entity 억제·role-aware candidate routing은 **문제 A에 producer 없어 vacuous** → 문제 B 선행 계약. 문제 A에선 검증 시도 금지(공허 PASS).

## 4. R1~R5 반영 요지 (구현 시 필수 — v5.1 델타)

- **R1**: 역할은 syntax kind **대체 아님, additive**. v4 kind(class_decl/comment_block/decl_header…)가 gapless partition 소유, 역할은 위에 얹음.
- **R2**: parser별 acceptance — layout=파티션 산출=성공(malformed 무조건 not_applicable 아님), serialization=throw면 fail, tree-sitter=기존 동작 불변.
- **R3**: env-profile import 필터(v4 §6-5)를 문제 A에 **반드시** 포함 — 누락 시 러프 import가 framework 오승격.
- **R4**: layout 대상 = tree-sitter 미지원 ∧ serialization/tabular 아님 ∧ 블록/들여쓰기 구조. GraphQL/Proto/Prisma(type=data여도) 포함. "programming-only"로 좁히지 말 것.
- **R5**: 문제 B 게이트(위 §3 주의).

## 5. 검증 규율

- 각 PR 후 `npx vitest run` + 해당 done-when. off-path 골든 diff(byte-identical 증명).
- **구현 후 3-렌즈 교차검증**([[onto-mcp-post-impl-cross-verify-expectation]]): green 스위트만으론 부족, 독립 렌즈로 material 0 확인. fable 막힘→gpt(codex)+주 세션 직접 재도출.
- falsifiable: subject 집합 cardinality>0 확인(공허 PASS 금지), 새 브랜치 진입 guard 통과 확인.

## 6. owner 결정 남은 것 (문제 A 후 재론)

- 문제 B 착수 시점·순서(serialization vs document).
- `declaration_candidate` 상향 known-schema 초기 집합(GraphQL/Proto/Prisma + basename).
- markup 최종 배치(Vue/Svelte 코드-유사=layout, HTML/MD=document observer — §7·§12-5).

## 7. 참조

- MEMORY: [[onto-mcp-semantic-map-multiartifact-start-20260718]](task #10) · [[design-parallel-frontier-crossverify]] · [[onto-mcp-fable-spend-limit-20260721]] · [[onto-mcp-post-impl-cross-verify-expectation]].
- 초안·리뷰·비판·design-verify 산출: `development-records/design/20260721-language-agnostic-structure-parsing-drafts/`.
