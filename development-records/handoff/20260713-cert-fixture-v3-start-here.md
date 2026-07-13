# cert fixture MECE v3 (M4) — 다음 세션 시작점 (2026-07-13)

owner 지시: seat 인벤토리(C) 완료 후 **cert fixture MECE 개선(v3, M4)** 진행.
설계 SSOT: `development-records/design/20260712-review-cert-v3-fixture-mece-design.md`.

> **상태 갱신 (2026-07-13, 단계 0 완료)**: 4-렌즈 adversarial review 완료 → 설계 **material 0**으로
> 개정(설계 문서 "단계 0 개정 로그" 참조, material 5건 해소). owner 결정: clean-target=**옵션1
> (대조군 재설계)**, additive-optional로 계약 bump 폐기, floor 불변 정직 프레이밍. **다음 시작점 =
> A-1 구현**(owner "구현하자" 트리거). 6영역 스코프: v3는 **review 한정 유지**(일반화는 후속).
> 메모리 [[onto-mcp-cert-v3-stage0-complete-20260713]].

## 재개 시 상태 검증 (먼저 실행)

```
pwd                          # /Users/kangmin/Documents/onto-mcp
git fetch origin main && git rev-parse --short origin/main   # 아래 "landed"와 대조
git branch --show-current    # main 권장 (feature 브랜치는 그때그때)
```

## landed (이 세션에서 main에 병합된 것)

- PR #185 review role 구조 + **claude-fable-5 등록**
- PR #186 **gpt-5.6-sol@medium 등록** (roles: [review])
- PR #188 **production review seat → gpt-5.6-sol@medium** (INV-CFG-1 마커 필요·settings-chain 정렬 테스트 갱신)
- PR #187 **v3 설계 문서 + check-fired census** (docs)
- PR #189 **`onto seats` 읽기전용 seat 인벤토리** (option C)

병합 후 main HEAD: `072ad7e` (재개 시 `origin/main`이 이 이상이면 그 사이 추가 작업 있음).

## 시작점: 단계 0 (설계의 4-렌즈 adversarial review)

설계 §3 프로세스 표 기준:
- **0b (V4 census)는 이미 완료** — `development-records/benchmark/review-cert/census-check-fired.mts`(멱등) →
  `check-fired-census.json`. 결과: 전 역사 clean row에서 12 check 중 **발화 3개뿐**
  (material_issue_recall·boundary_uncertainty_preservation·false_materiality_guard),
  causal 3종 공허 실증, **grounding은 core인데 clean 발화 0**. → V2/V3 우선순위·Q3 입력.
- **단계 0 (4-렌즈 리뷰)**: 이제 쿼터 경합 없음(cert run 전부 종료) → **즉시 실행 가능**.
  설계를 4개 독립 렌즈로 adversarial review, material 0까지 개정 후 구현 착수.
  재검증 대상 load-bearing 주장: G1~G3 갭의 실코드 근거(설계 §1 표), per-fixture
  applicable-check 핀이 "full universe exactly once" 검사를 올바로 일반화하는지,
  D5 소급 검증(V1 실행증명·V2 완비 메타테스트·V3 정밀 프로브)의 실현 가능성.

## 구현 순서 (단계 0 통과 후)

A-1 gate 확장(expectations 2필드 + per-fixture applicable set + 기존 fixture 소급 V1~V3)
→ A-2 record v3 스키마·validator·assemble·G7 binding·하니스 not_run 판정
→ A-3 fixture 2종 저작(clean-target-v1·shared-root-target-v1)
→ A-4 v3 fresh cert run(**owner spend 승인 별도**).
Phase B(온톨로지 fixture 편입)는 별도 설계 후 — Q1 기본값이 분리다.

## open questions (owner, 설계 §4 — 기본값 걸려 있음)

- Q1 Phase B를 v3에 묶을지 분리할지 — 기본값 **분리**
- Q2 v3 run에서 기존 fixture 2종 baseline 재실행 여부 — 기본값 **전면 재실행**(동시대성)
- Q3 clean-target guard의 core floor 승격 시점 — 기본값 **첫 run disclosure, 측정 후 R7 결정**

## 검증 규율 (설계 D5 — fixture 추가의 입장 조건)

fixture는 "주장하는 세계가 사실이고(V1 실행 증명), 채점이 거기서 거짓말 못 하게(V2 완비
메타테스트·V3 정밀 프로브·V4 census)"를 만족해야 함. 신규·기존 fixture 대칭 적용.
결정론 채점이라 negative control은 게이트-레벨(synthetic artifact 유닛테스트)로 충분.

## 관련 메모리

- [[onto-mcp-cert-gate-fixture-mece-20260712]] — 분리 결정·CE 갭 3개·주입형 용도 판정·census 결과
- [[onto-mcp-sol-medium-review-cert-20260713]] — sol seat 전환·INV-CFG-1·settings-chain 핀 교훈
- [[onto-mcp-fable5-cert-v2-run-complete-20260713]] — cert/v2 하니스·record 검증 패턴
