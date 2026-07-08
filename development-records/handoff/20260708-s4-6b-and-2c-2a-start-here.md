# §4-6b + 2-C/2-A start-here (2026-07-08)

## 0. 현 상태 한 줄

§4-6b(`onto_review_continue` 기본화, UX/안내)와 2-C/2-A(structural retry-gate + synthesis resubmit)
**둘 다 구현+검증 완료, 미커밋**. 2-C/2-A 교차검증 = **CONFIRMED**(설계-전 3-KIND + 구현-후 2 독립
KIND-다양 리뷰어[Sonnet 좁은-특정 + Opus 넓은-심층] 모두 NO MATERIAL FINDINGS, 수렴). 파일 무충돌 →
2개 PR로 분리 가능.

## 1. 미커밋 변경 (파일 분리 = 2 PR)

### PR-A: §4-6b (UX/안내, 저위험)
- `src/core-api/review-api.ts`(halt llmPresentation 프롬프트 +1줄), `src/mcp/server.ts`(continue 도구 설명
  재프레이밍 + USAGE_GUIDE 재개 스텝 + `export const USAGE_GUIDE`).
- 테스트: `src/mcp/tool-surface.test.ts`(+3), `src/core-api/review-api.test.ts`(halt 프롬프트 잠금 +단언).
- 요지: `onto_review_continue`를 halt/timeout 리뷰의 **기본 재개**로 안내 + 의미적 `continue_review`
  action-candidate와 구분(옵션 A: 말로만 구분, action-candidate enum·런타임 불변).

### PR-B: 2-C/2-A (공유 retry-gating, 주의)
- `src/core-runtime/cli/unit-resubmit.ts`(synthesis 분류기 2-패턴, descriptor `{kind:"synthesis"}`,
  `buildResubmitErrorSpec` 필드명 파라미터화 — stance/deliberation byte-identical).
- `src/core-runtime/cli/run-review-prompt-execution.ts`(synthesis 전략+readFrozen+unitId파서, **단일
  레지스트리 `RESUBMIT_UNIT_ROUTING`**로 게이트·디스패처 단일소스, `shouldRetryUnitFailure`가
  output_contract를 `isResubmitCorrectableRetry`로 라우팅, 4 호출부 갱신, `shouldRetryUnitFailure` export).
- `src/core-runtime/discovery/settings-chain.ts`(wired-units 주석 정정).
- 테스트(신규): `structural-retry-gate.test.ts`(10), `synthesis-resubmit-wiring.test.ts`(4),
  `synthesis-resubmit-dispatch.test.ts`(2, OFF=1/ON=3 실경로 대비). 수정: `deliberation-resubmit-wiring.test.ts`
  (synthesis 음성대조 → issue-artifact 재조준).
- 설계 SSOT: `development-records/design/20260707-s4-2c-retry-gating-hardening-design.md`(v1+§10 교차검증
  +§11 구현기록).

## 2. 핵심 설계 결정 (2-C/2-A, 확정)

- **게이트**: output_contract는 통상 terminal이나, `enabled && gateEligible && classify(msg)!==null`이면
  교정 재시도 허용. enabled=false면 byte-identical.
- **stance 제외**(gateEligible:false, **F-2**): correlated/demote 기계가 stance 전용이고 **최종 실패
  클래스**를 읽어, poison-stance를 재시도시키면 단일-렌즈 demote가 whole-run halt로 뒤집힘. 제외로 설계-아웃.
  stance 정상 resubmit은 executor_exit 경로라 무변(rare-poison만 오늘처럼 degrade).
- **enabled 재사용**(신규 플래그 0): stance 제외로 F-2 사라져 `resubmit.enabled` 재사용 안전.
- **단일 레지스트리**(**M-1**): 게이트/디스패처 발산 방지. gateEligible: stance=false, delib/synth=true.
- **F-1**: 게이트 활성 ⊂ 전략 활성(enabled 필수).
- worker-path: 화이트리스트 거부는 온전 메시지(분류기 매칭) 또는 executor_exit(이미 재시도)뿐 —
  output_contract-without-match 부재라 게이트 message-only로 충분(freeze는 전략이 사용).

## 3. 검증 상태

- **로컬 GREEN**: typecheck; **전체 vitest 2539 pass**; 가드(import-boundary·invariant-change·mcp:review·
  invocation-runner·review:route). 신규 discriminating 16 + stance 전체-파이프라인 resubmit/salvage/breaker/
  ledger 35 pass(공유-경로 무회귀). diff상 correlated/demote 코드 **완전 불변**.
- **독립 교차검증 CONFIRMED**: 설계 전 3-KIND(→v2). 구현 후 2 독립 리뷰어(KIND 다름): Sonnet
  좁은-특정(F-1 subset·classifier·byte-identical·falsifiability) + Opus 넓은-심층(합성 경로·nested·F-2
  완전성·레지스트리·seam·엣지, 스위트 직접 재실행) **모두 NO MATERIAL FINDINGS, 수렴**. F-2 최강 근거:
  correlated/demote가 stance-pool-local(delib/synth 별도 풀)이라 이중 안전. cosmetic 2건 반영(음성대조
  실 메시지화, 레지스트리 freeze). 설계노트 §11.1.

## 4. 다음 단계 (권장 순서)

1. **커밋**: PR-A(§4-6b)와 PR-B(2-C/2-A)를 별도 브랜치·PR로(파일 무충돌). main 직커밋 금지.
2. **§4-6c**(티어링 정책값, 별개 레인, B5 머지 후) 등 잔여 §4는 메모리 참조.

## 5. Gotchas
- 2-C/2-A는 **공유 retry-gating** — stance 회귀 1순위. enabled=false byte-identical 유지.
- 라인 앵커 이동 가능 — grep 재검.
- stance는 **의도적으로 게이트 제외**(gateEligible:false). rare-poison-stance 하드닝이 필요해지면
  correlated/demote의 terminal-class 의존을 먼저 해소해야 함(설계 §10 F-2, 별개 과제).

## 6. 참조
- 설계: `development-records/design/20260707-s4-2c-retry-gating-hardening-design.md`.
- 이전 핸드오프: `20260707-s4-6-remaining-start-here.md`(2-A 블로커 원 분석).
- 메모리: `onto-mcp-s4-backlog-validity-20260706`, `onto-mcp-post-impl-cross-verify-expectation`.
