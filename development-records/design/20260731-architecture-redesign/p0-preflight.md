# P0 착수 선행 조건 실측 기록 (2026-08-01)

§11.2 개정(2026-08-01)이 등록한 P0 하드 선행 조건 2건의 실행 결과. D3 승인의 파생 조건이며, 이 기록이 Arm 2 프로토콜의 입력이다.

## ① 이종 2계열 가용 확인 — PASS

- codex-cli **0.145.0**, `codex login status` = "Logged in using ChatGPT" (OAuth, 구독 경로).
- **실 디스패치 카나리 PASS**: `echo 'Reply with exactly: OK' | ~/.codex/bin/codex-run --profile hermetic --model gpt-5.6-sol --effort low --sandbox read-only` → stdout `OK`, rc=0. Arm 2가 실제로 쓸 경로(hermetic·fresh CODEX_HOME·auth만 복사) 그대로 통과 — 로그인 상태 표시가 아니라 실 경로 왕복이 증거다(과거 "codex 401" 실패는 로그인 표시와 디스패치 성공이 다를 수 있음을 실증).
- 주의: 래퍼 주석은 "Verified against codex-cli 0.144.1", 설치본은 0.145.0 — 카나리 통과로 이 드리프트는 실질 무해 확인.
- 결론: **1계열 폴백(PRELIMINARY 강등) 불발동. Arm 2 독립 격발 판정 가능.**

## ② SE 도메인 팩 ∩ 마스킹 대상 오염 감사

대상: `~/.onto/domains/software-engineering/{logic_rules,structure_spec,dependency_rules}.md` (Arm 2 domain-on 주입 예정 3파일, 832줄) vs 마스킹 대상(INVARIANTS 13종 + G1~G11 + principles).

### 1차 결정론(토큰) 스캔 — 직접 출현 0
`INV-` id·`G\d` 게이트명·"불변식" 등 정답지 고유 토큰 출현 없음. "invariant" 히트는 전부 타입 이론(variance·base-class invariant)으로 무관.

### 2차 의역(쌍둥이) 스캔 — 겹침 발견

| 정답지 항목 | 팩 근거 | 강도 |
|---|---|---|
| INV-CFG-1 / G2 (하드코딩 스캐너) | structure_spec.md:57 "Config-Code separation: No hardcoded values … Verification: search for literal strings" — 검증 방법까지 동형 | **강** |
| G1 (import 경계) | dependency_rules.md:72 "No inner layer may import…" + structure_spec.md:55 public-API-only import 검증 | **강** |
| INV-SCHEMA-1 (단일 source) | dependency_rules.md:243 §Source of Truth Management + SSOT 상호참조 다수 | 중~강 |
| fail-loud·LLM 권위 경계 (principles 유래) | dependency_rules.md:264 "LLM dependency unavailable → default is fail-loud", :277 "prompt text must not become the runtime authority", :233/:269 provenance 의무 | **강** |
| INV-MOCK-1 | logic_rules.md:187-189 test doubles 경계 — 라벨링 규율이지 운영 import 금지는 아님 | 부분 |

깨끗한 항목(쌍둥이 미발견): INV-BENCH-1(표본≥3)·INV-EXP-1(단일 변수)·INV-AUTH-1(OAuth 기본)·INV-MODEL-1(등록제)·INV-LOOP-1(루프 상한)·INV-TEST-1(명세 검증)·INV-MATERIAL/SHARD/OBLIGATION-COVERAGE·G3~G11 특이 기계.

### 질적 발견 — 계보 공유

dependency_rules.md:264·277·233·269는 owner corpus의 LLM-native 원칙(fail-loud·prompt≠runtime authority·provenance 의무)과 문장 수준으로 겹친다. **SE 팩은 마스킹 대상과 저작 계보를 공유한다** — 개별 규범 쌍둥이를 넘어, domain-on이 principles 층을 부분적으로 "un-mask"하는 효과. 토큰 스캔으로는 잡히지 않았고 의역 스캔이 잡았다 — 이 감사를 사전 등록한 이유가 실증된 셈.

### 처분 (등록 프로토콜 적용)

겹침은 **국소적**(강 4 + 부분 1 / 23항목 ≈ 20%대) — "광범위 이관" 조건 미달, 단 계보 공유가 질적 가중.

1. **Arm 2 domain-on/off 대조는 유지하되 채점 제외 목록 적용**: INV-CFG-1·G1·INV-SCHEMA-1·principles-유래 계열(fail-loud/LLM 권위)·INV-MOCK-1(부분). 제외 후 잔여 ~18항목이 대조 유효 집합.
2. **도메인 lift의 주 측정 사이트는 Arm 4(스프레드시트 × accounting 팩)로 권고** — 계보 공유가 구조적으로 불가능한 유일 조합. Arm 2 대조는 보조 신호로 강등.
3. 이 기록이 Arm 2 blind packet 구성 시 제외 목록의 SSOT다.

## ③ Arm 1 핀 커밋 도출 — PASS

- **방법**: 보존 seed 아티팩트에 git 커밋 기록이 없음(소스별 `content_sha256`만 존재) → source-observations의 (경로, content_sha256) 전 쌍이 **동시에 일치하는 커밋**을 run 시각 이전 최신부터 결정론 탐색 (동거 스크립트 `derive-pin-commit.py`).
- **결과**: `6c364a0a5bca31fe4227cdfc4fa2d595d68d8a0f` (2026-07-20T09:40:49+09:00), 2/2 쌍 전부 일치.
- **교차 확증**: 이 커밋의 제목이 "docs(benchmark): 실험2 고정 질문 블라인드 저작 보존 — arm 산출물 생성 전 핀" — 당시에 의도적으로 만든 핀 커밋 그 자체다. 해시 도출과 이력 의도가 독립적으로 같은 커밋을 가리킨다.
- exp1·exp2 관측 해시 완전 일치 → 두 seed가 같은 핀을 공유한다.
- **정직 공시**: 관측 쌍이 2개뿐이다(DD6 실험이 소스 2파일 한정: `code-structure-observer.ts` 414줄판, `run-review-prompt-execution.ts`). Arm 1의 seed 코퍼스가 작으므로 승격 후보 모수도 작다 — 결과는 등록대로 PRELIMINARY(INV-BENCH-1)이며, "승격 ≥1"의 분모가 작다는 것을 판정 시 감안한다.
- worktree는 evaluator 착수 시 생성: `git worktree add ../onto-mcp-p0-pin 6c364a0a`.
