# semantic-map multi-artifact 확장 — start-here (2026-07-18, /clear 후 재개용)

task #10: reconstruct **comprehension 재귀 semantic-map**("재귀llm")을 스프레드시트 전용에서
**코드·문서**로 확장 — 상세 설계 + N=1 de-risk (code-first). **프레임·owner 결정은 확정,
상세 설계 미착수.**

## 권위 / SSOT (먼저 읽는다 — 규범 전부 SSOT 소유)

- **설계 SSOT**: `development-records/design/20260715-semantic-map-multi-artifact-extension-design.md`
  — §2 원리(저작-레벨=authority 등 5원리)·§3 owner 확정 결정·§4 목표 형상·**§5 착수 순서
  (Phase 0 재확증 → Phase 1 코드(AST) → Phase 2 문서/시각)**·§6 파일 지도·§7 리스크/미결.
- 성격: **설계 과제** — CLAUDE.md "설계" 지침대로 high-level/상세 설계 먼저(coding-staged-workflow),
  구현은 owner 승인 후. §1 앵커는 "착수 시 재확증" 명시 — Phase 0이 그 재확증이다.
- #8 prompt caching은 §7에 접혀 있음(단독 착수 금지 — 큰 공유 prefix가 생기는 이 확장에서만 값어치).

## 세션 상태 핀 (2026-07-18 작성 시점)

- main = `0cb2332` (M3 P2 R=3 종결 머지까지 포함). 오픈 PR: **#223**(adaptive-effort P2 파일럿,
  honest null — **별도 트랙**, 이 트랙과 무관, owner 머지 결정 대기).
- 주 워킹트리(/Users/kangmin/Documents/onto-mcp)는 타 세션이 `feat/adaptive-effort-p2-pilot`
  브랜치로 점유 중일 수 있음 — **재개 시 pwd/branch/HEAD 재검증 필수**, 충돌 시 worktree 격리
  (기존 `.claude/worktrees/review-ontological-anchoring`은 전 브랜치 머지 완료라 삭제/재사용 가능).
- **2026-07-17 이후 변경 중 이 트랙 관련**: `ontological_anchoring` 양 플래그가 repo settings에서
  **ON**(#222) — **review-side 전용**이라 reconstruct/semantic-map 경로 비접촉(간섭 없음). M3 P2는
  종결(#224)이라 벤치 인프라 점유 없음.

## 착수 순서 (SSOT §5 요약 — 규범은 SSOT)

1. **Phase 0 — 재확증**: §6 파일 지도 실코드 재확증(특히 `semantic-map-stage.ts` 비존재/오케스트레이션
   위치, `ComprehensionReduceNode` 결합 §1). 라인 앵커는 2026-07-15 기준이라 재-grep.
2. **상세 설계**: Phase 1(코드/AST 지반 — 제네릭화가 스프레드시트 불변식을 깨지 않는 하드 게이트:
   diff 불변 + monoid/honesty 증명) 중심, §7 미결(문서 honesty/resume 모델·비전 dispatch·멀티파일
   스케일) 결정 포함. INV 접촉 시 default-off + owner 확인.
3. 비-자명 설계이므로 **구현 전 독립 적대적 다관점 리뷰** → owner 승인 → 구현+N=1 de-risk.

## 참조
- task #10 · MEMORY.md의 [[onto-mcp-prompt-caching-semantic-map-noop-20260716]]
- 상위 배경: SSOT §8 (layer2 설계 3종 + 백로그 B)
