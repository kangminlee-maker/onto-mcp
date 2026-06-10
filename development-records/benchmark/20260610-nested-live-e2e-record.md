# Nested-workers live E2E 기록 (2026-06-10)

> roadmap S2 + A downstream nesting의 **live-LLM 실증** 기록. 결정론 mock이 증명 못 하는 유일한 가설 — "실제 LLM outer가 literal batch script를 verbatim 실행하는가" — 를 실 codex로 검증.

## 실행

- 경로: `npm run test:e2e` (review-mcp-live-e2e, MCP 경로), review_mode=full(9 lens), timeout 40m
- settings: 저장소 settings에서 `topology=nested-workers` + `teamlead.seat=worker`만 전환(백업·복원), executor auto→codex(OAuth gpt-5.5), `max_concurrent_lenses=3`
- 세션: `20260610-623ea287` (fixture project `onto-review-mcp-live-e2e-Dq2A7n`)

## 결과 — 전부 통과

| 항목 | 결과 |
|---|---|
| execution_status / record | `completed`, semantic quality gate **전 체크 passed**, E2E exit 0 |
| lens nested batch | **9/9 ok** — outer codex가 script verbatim 실행, `UNIT_DISPATCH_SUMMARY` 정확, ENV 진단 9줄 replay, sidecar seat 9개. 3-wave(width=3, flat cap 동일), 전 lens `attempt_count=1`(배치 1차에서 전부 성공) |
| downstream: issue-stance nested | 9 per-lens unit 전부 ok (`nested-outer-issue-stance-*.log`) |
| downstream: synthesis nested | 3 per-issue unit 전부 ok (`nested-outer-synthesis-*.log`) |
| downstream: deliberation | planned_issues=0 → 유닛 0개 → 배치 게이트 불충족, 정상 flat/skip 경로 (설계 의도) |
| degraded / retry fallback 발동 | 0건 — flat fallback 경로는 이번 run에서 미발동(별도 단위테스트로 검증됨) |
| observed_dispatch_width | 3 = flat cap (wave parity 작동) |

## 검증된 가설

1. **outer LLM 순응성**: 실 codex outer가 "execute-only" 프롬프트 계약을 지킴 — 치환·재해석 없이 bash -s 실행 + stdout verbatim 표면화 (과거 일탈 사례가 재발하지 않음).
2. **inner=unit-executor 불변식의 live 성립**: 구조적 출력(sidecar)·검증이 nested에서 flat과 동일하게 작동.
3. **DS3 downstream 경로의 live 성립**: wide 2단계(stance·synthesis)가 실제로 nested 배치로 실행되고 단계 스트림 로그가 분리 기록됨.
4. **wave/timeout parity 수정(553e702)의 유효성**: 9 lens가 width 3으로 3 wave 실행, outer timeout 내 완료.

## 잔여

- **claude brand live nested**: 미실행 — E2E 스크립트가 codex_cli/openai route를 단언하므로 그대로 적용 불가. claude outer는 spawn-surface 실검증(fake bin) + mock 4셀 동등성까지 증명된 상태. 필요 시 route 단언을 brand-파라미터화한 별도 실행으로 후속.
- B(host-driven) live nested: reference driver mock으로 계약 증명됨; 실 host(claude 세션) 구동은 S3 트랙과 함께.
