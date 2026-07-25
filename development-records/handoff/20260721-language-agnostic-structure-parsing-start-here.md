# 언어-무관 구조파싱 — start-here (2026-07-21, /clear 후 재개용)

> 이 문서는 **방향 전환 핸드오프**다. 환경 컨텍스트 프로파일 Stage 3a(content_parse)까지 머지 완료된
> 뒤, owner가 다음 방향을 **"언어-무관 구조파싱"**으로 재정의했다(§1). 재개 시 pwd/branch/HEAD 재검증
> 필수. 코드 인용은 심볼명으로 재확인(라인번호는 힌트). 설계 과제이므로 CLAUDE.md "설계" 지침 준수:
> 상세 설계 + 구현 전 독립 검증 먼저, 구현은 owner 승인 후.

## 0. 상태 핀 (재개 전 확인)

```
cd /Users/kangmin/Documents/onto-mcp && git fetch origin main && git log --oneline -5 origin/main
npx vitest run   # 3,419 green + 1 todo 기준
gh pr list --state open   # #246·#247 상태
npm view onto-mcp version # 0.4.15(미발행) vs 0.4.16(발행됨)
```

- **main = `4576ac1`** (Stage 3a content_parse PR #245 머지 포함).
- **오픈 PR (Stage 3a 마무리 — owner 액션 대기)**:
  - **#246** `chore/release-v0.4.16` — 버전 bump. **owner 머지 + `npm publish`(OAuth)**.
  - **#247** `chore/env-profile-content-promotion` — **draft·⚠️게이트**: content 키 ON은 **v0.4.16 발행 +
    `npm i -g onto-mcp@latest` 이후에만** 머지(0.4.15 strict 스키마가 신규 키 모르면 fail-loud).
- 워킹트리: 내 미커밋 변경 없음(main clean). 선행 untracked(벤치/longform)는 무관.

## 1. 방향 전환 (owner 재정의 2026-07-21) — 이 핸드오프의 핵심 결정

owner의 프레이밍(축약, 원문 정신 보존):

> **구조신호는 "의미의 근거를 확보하기 위한 보조도구" 중 하나일 뿐이다.**
> - **프레임워크/스택은 100% 식별할 필요 없고, 그래봐야 의미 없다.** 프레임워크가 갖는 의미는
>   frontend/backend/security 등 "어떤 목적인가" 정도인데, **이건 language만으로 충분**하다.
> - **구조파싱은 의미가 있다** — lexicon hierarchy 및 relation을 파악하는 데 도움이 되므로.
> - **언어와 상관없이 구조파싱이 가능한 방식을 찾아야 한다.**

**함의 (이 방향의 SSOT):**
- **프레임워크 track = 접는다.** 프레임워크 카탈로그 확장·**Stage 3b LLM assist·TOML fast-follow 전부
  폐기**(값어치 없음 확정). 기존 env-profile framework detection(Stage 0/3a)은 **제거하지 않고 그대로
  둔다**(default-off·무해) — 추가 투자만 중단.
- **언어 식별 = 값어치 있음**(purpose 근거). **GitHub Linguist 데이터**로 결정론 완결(~500 언어). 현재
  손으로 짠 ~13 확장자 테이블(`EXTENSION_LANGUAGE`)을 대체/확장.
- **구조파싱 = 진짜 타깃.** lexicon hierarchy + relation을 **언어-무관**하게 뽑아 **의미 track(LLM)의
  근거**로 제공. 이게 이번 설계 과제.
- 대전제: **구조=결정론(보조 증거), 의미(비즈니스 로직/도메인)=LLM.** 구조는 골격, LLM이 그 위에 의미를
  붙인다. 구조 정밀도는 최우선이 아니고 **보편성(임의 언어)이 최우선**(보조 증거이므로).

## 2. 설계 방향: 언어-무관 구조파싱 (초안 — 새 세션이 상세화)

**왜 가능한가**: hierarchy는 거의 모든 언어가 **들여쓰기**(Python/YAML/Haskell…) 또는 **괄호/블록**
({}, begin/end)로 표현한다 — 문법이 달라도 인간이 코드 계층을 읽는 보편 규칙. 문법 없이 **layout**만으로
계층 복원 가능(Semgrep generic mode가 이 원리).

**스펙트럼 (정밀 ↔ 커버리지):**
| 방식 | 커버리지 | 정밀도 | 의존성 |
|---|---|---|---|
| ① grammar-free **layout 파서**(들여쓰기/괄호 + 토크나이저 + 관계 패턴) | 모든 언어 | 러프 | 없음(순수) |
| ② 광역 추출기(universal-ctags ~150 / tree-sitter 문법 집합 ~100) | 광역 | 중~높음 | 바이너리/WASM 다수 |
| ③ LLM 구조 패스 | 모든 언어 | 높음 | 비결정·spend·의미track과 합쳐짐(권장 X) |

**권고 아키텍처: 2-tier.**
- **Tier 1 = grammar-free layout 파서(주력·보편 baseline)**: 임의 언어에서 러프한 구조를 **항상** 확보.
  순수·결정론·무의존.
- **Tier 2 = tree-sitter(정밀 upgrade)**: 문법 있는 언어(현재 TS/JS/Python)는 정밀 구조로 대체.
- 현재 tree-sitter만 있어 미지원 언어에 침묵 → Tier 1을 깔면 **어떤 언어든 구조는 항상 나온다.**

**lexicon / hierarchy / relation을 언어-무관하게 뽑는 법 (구체):**
- **hierarchy**: 들여쓰기 깊이 + 괄호 균형 → 중첩 트리. 블록 헤더 줄 첫 식별자로 노드 라벨(module→
  class→fn 근사).
- **lexicon(용어 후보)**: 토크나이저로 식별자 추출 + **정의-지점 휴리스틱**(def/function/class/fn/func/
  fun/type/struct… 키워드 뒤, 또는 `(`/`=`/`:` 앞) + 케이싱·빈도 필터로 노이즈 감축. 정의 식별자 =
  온톨로지 용어 seed.
- **relation**:
  - **import/uses**(모듈→모듈): 범언어 import 패턴 테이블(import·from·require·use·using·include·
    #include·load…) → **언어-무관하게 강함**. relation 주력.
  - **containment/defines**: 중첩 트리에서 파생 → 강함.
  - **call/reference**(심볼→심볼): 문법 없이는 러프(식별자+`(` 휴리스틱) → 저신뢰 표기 or 보류(정직한 한계).

**관련 서브-증분 (같은 방향, 독립 가능):**
- **A. Linguist 언어-테이블**: 확장자/파일명/shebang → 언어(~500, 버전드·MIT). 데이터 파일 vendor +
  fingerprint fold. 결정론·닫힌 어휘 유지(Linguist 목록이 닫힌 어휘). 비교적 단순·값어치 명확.
- **B. Tier 1 layout 파서**: 위 핵심. 비-자명.
- A·B는 독립 착수 가능하나 둘 다 "언어-무관 구조 track"에 속함.

## 3. 관련 SSOT / 실코드 (읽어야 할 것)

- **기존 구조 track(Tier 2가 될 부분)**:
  - `src/core-runtime/code-structure-observer.ts` — tree-sitter 관찰자(**G-SEM 동결 sha 주의** —
    수정 시 벤치 대조군 깨짐; 확장은 별 모듈 권장).
  - `src/core-runtime/code-structure-inventory-projection.ts` — 인벤토리 projection(40k 예산).
  - `src/core-runtime/reconstruct/comprehension-set-tier.ts` — set-tier(topology + **import relations** +
    overview). Tier 1의 relation이 여기에 연결될 후보.
  - tree-sitter deps: `web-tree-sitter@0.26.11`·`@vscode/tree-sitter-wasm@0.3.1`. 문법=TS/JS+Python.
  - 설계 v3의 **tree-sitter 플러그 구조**(WASM+문법 plug)가 Tier 2 확장을 이미 상정.
- **언어 detection 현재 위치**: `src/core-runtime/reconstruct/environment-context-profile.ts`의
  `EXTENSION_LANGUAGE`(~13 언어) — Linguist로 대체/확장 대상. (env-profile은 disclosure-only track;
  구조 인벤토리와는 소비처 다름 — 언어 신호는 양쪽에서 쓰일 수 있음, 단일-소스화 검토.)
- **의미 track(LLM, 이 방향의 소비자)**: reconstruct source observation → seed authoring. 구조 증거가
  seed userPayload에 들어가는 경로(`code_set_tier`·`code_structure_inventory` projection). env-profile은
  M2로 seed 미접촉(대조).
- **배경 설계**: task #10 semantic-map 설계군(20260719-semantic-map-v2·20260720-semantic-map-1b-
  deterministic-impl-plan). env-profile: `design/20260721-env-context-profile-stage3a-content-parse-design.md`.

## 4. Stage 3a 마무리 상태 (느슨한 끝단 — 방향과 별개)

- **PR #246/#247**: §0 참조. owner가 발행·머지하면 Stage 3a 실사용화 종결. **이 방향(구조파싱)과 독립** —
  발행/승격을 기다리지 말고 설계 착수 가능.
- **후속 3종 처분(§1 함의)**: TOML·3b = **폐기**. live LLM run = owner 미결(값어치 낮음 — 동일 훅
  블록이 Stage 0.5에서 이미 live 검증·3-렌즈 byte-compare·real-fs e2e → **skip 권장**). 새 세션에서
  재론 불필요.

## 5. 착수 순서 (새 세션)

1. **재확증**: §0 상태 핀 + §3 실코드 재-grep(심볼명). Tier 2(tree-sitter)의 현재 산출 shape 확인
   (무엇을 lexicon/hierarchy/relation으로 이미 내는가 — Tier 1이 그 shape에 맞춰야 소비처 재사용).
2. **상세 설계 (설계 과제 — 구현 전)**: 언어-무관 구조파싱.
   - 스코프 확정: A(Linguist 언어) 먼저 vs B(Tier 1 layout 파서) 먼저 vs 함께. **owner 결정.**
   - Tier 1 layout 파서 명세: hierarchy(들여쓰기/괄호 dual-mode), lexicon(정의-지점 휴리스틱),
     relation(import 패턴 테이블 + containment). 정직한 한계(call 약함) 명기.
   - 소비 배선: 산출을 기존 인벤토리/set-tier shape에 맞출지, 신규 아티팩트로 낼지. **G-SEM 동결
     observer 미접촉**(별 모듈).
   - 결정론·닫힌 방식·off=byte-identical·fingerprint fold 규율 유지(env-profile 전례).
3. **병렬 frontier 설계** (표준 준수 [[design-parallel-frontier-crossverify]]): 비-자명 설계이므로 이종 2벌
   frontier(OAuth 우선·blind packet)로 초안→교차검증→종합. 코퍼스 원칙(개념경제·LLM/역량경계·staged)
   주입. **구현 전 독립 적대 design-verify** → owner 승인 → 구현 + 구현 후 3-렌즈 교차검증.
4. **모델**: 설계=FRONTIER, 구현=WORKHORSE + 검증 강화.

## 6. 개념 경제 / 이름

- **재사용**: tree-sitter 플러그 구조(Tier 2)·set-tier import-relation 소비처·인벤토리 projection 예산 패턴·
  fingerprint fold·env-profile 닫힌 어휘/off-게이트 전례.
- **신규**: Tier 1 layout 파서 모듈(순수, layout 계층 + 토크나이저 + 관계 패턴 테이블)·Linguist 데이터 파일
  + 로더·언어 detection 단일-소스(env-profile `EXTENSION_LANGUAGE` ↔ 인벤토리). traceability 유지.
- **폐기 어휘**: framework 카탈로그 확장·`environment_context_profile_assist`(3b)·TOML 파서 — 도입 금지.

## 7. 참조

- task #10 · MEMORY.md `[[onto-mcp-semantic-map-multiartifact-start-20260718]]`(env-profile/구조 track
  전 이력) · `[[design-parallel-frontier-crossverify]]` · `[[onto-mcp-post-impl-cross-verify-expectation]]`.
