# START-HERE: graceful batch 종결 후 다음 트랙 (2026-07-05 clear 경계)

> 핀 상태: main = `5d47088` (PR #168 review-breaker 배선 · #169 graceful sites 3·5·6 · #170 review-breaker 관찰 ON 전부 머지).
> 이 워크트리(`onto-mcp-claude`)는 main 체크아웃 불가(spreadsheet 워크트리 점유) — 작업은 항상 `git checkout -b <branch> origin/main`.
> 세션 시작 시 재확인: `git fetch origin && git log --oneline -3 origin/main` (main ≥ 5d47088).

## 1. 종결된 것 (CONFIRMED)

- **graceful-terminal 승인 batch 5개(1·2·3·5·6) 전부 main 머지.** sites 3·5·6 = PR #169(`427d511`).
  설계 SSOT = `development-records/design/20260705-graceful-terminal-sites356-wiring-design.md`
  (v1.2·3-lens 교차검증·dated correction 포함). 검증 = full vitest 2442·게이트 10종·G4.
- 메모리 = `graceful-terminal-track.md` (배선 패턴·백스톱 성격·교정 2건 기록).

## 2. 다음 트랙 선택지 (owner 결정)

### A. graceful-terminal site 7·4 별도 cut (설계-먼저 · LLM 비용 0)
- 상위 SSOT = `development-records/design/20260701-shared-graceful-terminal-step1-design.md` §11.
- **site 7 (judge-불일치·구 핀 14123 — 재핀 필수)**: downgrade는 **구조 불가**(continuation까지 4
  INVARIANT 게이트가 `prior_validation_invalid` 재-throw). 택1 결정이 cut의 본체 —
  (a) short-circuit(유효 아티팩트 ~10개 폐기 감수) vs (b) source-level valid-degraded 완화
  (maturation-answer-claims fail-closed 완화 → continuation=blocked 자연 종결).
- **site 4 (구 핀 12688 — 재핀 필수)**: semi-semantic 코드(`insufficient_inferred_evidence`·
  `contradiction_unresolved`) 배제를 positive classifier로 입증해야 편입 가능.
- 프로세스 = sites356 선례 그대로: 라인 재핀 → bounded 설계 노트 → 3-lens 적대 교차검증
  (conformance/control-flow/masking) → 발견 실코드 재검증 → 빌드(발화/대조/음성대조 쌍).
- 첫 커맨드: `git checkout -b feat/graceful-terminal-site7 origin/main`

### B. INV-MODEL-1 B4~B7 (라이브 비용 — owner 지출 승인 필요)
- SSOT = `development-records/design/20260704-inv-model-1-role-aware-design.md` §11 ·
  메모리 `inv-model-1-role-aware-track.md`.
- **B4** = 두 번째 실 워크북 라이브 캡처(연쇄 실-LLM leaf authoring 비용). **B5 선결 =
  §6.4 record 검증기**(roles 엔트리↔synthesize-cert/v1 결속·결정론이라 라이브 없이 선행 가능 —
  비용 승인 전 B5-검증기부터 짓는 순서도 유효).
- 첫 커맨드: `git checkout -b feat/inv-model-1-b4 origin/main`

### C. (배경) 관찰 모드 수확 — 라이브 런 비용
- 4개 opt-in 관찰 ON 상태: resubmit(#163)·reconstruct breaker+semantic_map_authoring(#167)·
  review breaker(#170). owner 결정(타 세션 2026-07-05): **실 실행 3회 무결 → DEFAULT 승격**
  (INV-CFG-1 마커·별도 PR). 라이브 런이 생기면 관찰 체크리스트 수확 겸용.

## 3. 주의 (PROPOSED — 세션 시작 시 재확인)

- untracked 잔재 다수(구 핸드오프 4건·WIP 스크립트 6건·fixtures) — 박제/삭제 분류 미결.
- site 7·4의 라인 핀은 census(2026-07-01) 기준이라 #159·#166·#169를 지나며 크게 drift —
  **핀 재도출부터** (sites356 때 12527→14368 급 drift 전례).
- review-breaker 트랙(타 세션·~/Documents/onto-mcp)은 #168·#170으로 배선 완료 — 겹침 소멸.
