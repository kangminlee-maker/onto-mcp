# handoff — recursive-reduce: 측정 트랙 종결 + Layer-1 코어 구현 START-HERE

> 날짜: 2026-07-01. 상태: **측정 종결 (consolidate, owner 결정)**. 미커밋(요청 없음). 다음 세션 = Layer-1 코어 구현.
> 트랙: [[unified-comprehension-engine-track]]. 설계 SSOT: `development-records/design/20260701-reduce-merge-layer-boundary-design.md`.
> 상위 SSOT: `20260625-rescoped-comprehension-engine-design.md`(§3.3 monoid·§4 2-tier epoch·§5 reduce 의미론·tenet 2).

## 0. 한 줄

recursive-reduce(P1-C2-C·미착수 cut)의 **위험/정확성 질문을 실 LLM으로 전부 측정 → 전부 긍정**. 경계 설계
(증가=Layer-1 결정론 / 함축=Layer-2 LLM) 확정 + 교차검증(SOUND_WITH_REVISIONS). 남은 "더 나은 seed인가"는
inherently soft(grounded 측정 밖). **다음 = Layer-1 결정론 코어부터 구현.**

## 1. 이번 세션이 확정한 것 (실 gpt-5.5·probe 6회·비용 미미)

| 질문 | 결과 | 하네스 |
|---|---|---|
| R1 Layer-1 결정론 코어 resume-sound? | ✅ live 4/6 실패 vs **hybrid 5/5**(code-ground+LLM narration) | `scripts/reduce-proof-harness.mts` |
| 경계 설계 견고? | ✅ **SOUND_WITH_REVISIONS**(ultracode 6렌즈·24 REFUTED/2 material 반영) | (Family-1 `wf_f59283d3-c3a`) |
| over-context 커버리지 빠짐없나? | ✅ 0.19→**1.00**·환각0 | `scripts/claim-m-coverage.mts` |
| 깊은 트리(3레벨) drop/오류누적(R6)? | ✅ 여전히 1.00·drop 0 | 위 + `CLAIM_M_FANIN=3` |
| case-2 hallucination(의미 fidelity)? | ✅ **0.72≫floor 0.40**·환각0 | `scripts/claim-m-semantic.mts` |
| 관계-recovery(cross-sheet)? | null(**잘못된 영역 in-context**·tenet 2) | `scripts/claim-m-probe.mts` |
| 누적 지도 > flat seed? (의미-품질) | ⬜ **inherently soft**(coverage 교란+name confound) — 재측정 비추천 | — |

**핵심 발견 2개**: ① **hybrid**(코드가 ground 소유·LLM은 narration만·byte-안정) = leaf-read 규율(`leaf-reader.ts:23-34`)을
merge로 확장 → resume-soundness 회복. ② **tenet 2 규명**: 누적/재귀는 **over-context서만** 값함 — in-context 측정은 무효
(flat이 자명 승). 측정 영역이 결론을 뒤집음.

## 2. 재현 (모든 리포트 = `.onto/reconstruct/*`, gitignored; fixture = 영속 실 101MB 관측)

```
# R1 결정성 (mock=반증가능성 / hybrid=회복 / live=R8 실패)
REDUCE_PROOF_MODE=run REDUCE_PROOF_MERGE=mock   npx tsx scripts/reduce-proof-harness.mts   # main PASS+cross diverge
REDUCE_PROOF_MODE=run REDUCE_PROOF_MERGE=hybrid REDUCE_PROOF_REPEATS=5 REDUCE_PROOF_MAX_CALLS=80 npx tsx scripts/reduce-proof-harness.mts  # 5/5 (실LLM)
# 커버리지 (shallow / 깊은 트리)
CLAIM_M_MODE=run npx tsx scripts/claim-m-coverage.mts                                        # shallow 1.00
CLAIM_M_MODE=run CLAIM_M_FANIN=3 CLAIM_M_CHUNK=10 CLAIM_M_REPEATS=2 CLAIM_M_MAX_CALLS=110 npx tsx scripts/claim-m-coverage.mts  # depth-3 1.00
# 의미 fidelity (균형 시트)
CLAIM_M_MODE=run CLAIM_M_SHEET=결제상세 CLAIM_M_CHUNK=15 CLAIM_M_REPEATS=2 npx tsx scripts/claim-m-semantic.mts
```
※ 하네스 = **scratchpad(휘발·production 배선 0)**. `REDUCE_PROOF_MERGE=mock`/`CLAIM_M_ARM=mock` = LLM-0 로직검증.

## 3. Layer-1 결정론 코어 — ✅ 구현 완료 (2026-07-01·미커밋)

`src/core-runtime/reconstruct/comprehension-reduce.ts` (+ `.test.ts` 16 테스트). 스코프 = **컬럼 내 row-window reduce**(R1 검증분).
- ✅ **fail-closed 연속성 검증기** `assertContiguousChildren` — overlap/interleave/mixed-column/empty reject (교차검증 blocker §8 F1 해소·R9와 대칭).
- ✅ **합집합 모노이드** `mergeReduceNodes` — `format_clusters`=union·`boundaries`=union+인접-차이 seam·honesty(distinct/capped/boundaries lb)=OR·`limiting_witness` 국소화. 코드-소유·LLM 0.
- ✅ **honesty 검증기** `assertHonestyFold` — 부모가 자식 lower-bound 낮추면 reject (R9).
- ✅ leaf 빌더 `buildColumnLeaves` (value-tile→leaf) · `reduceColumnLeaves(leaves, fanin)` (flat/deep 트리) · `reduceNodeGround(Hash)` (resume-key subject).
- 검증: **TS clean · 16 테스트 pass** (grouping-invariance byte-동일·연속성 6 fail-closed·seam·honesty·falsifiability) · **full vitest 140파일/2146 pass 회귀0** · import-boundary 통과 · **실 101MB 타일 grouping-invariant 확인** (flat/bin/ter byte-동일).
- **미배선** = standalone·live 파이프라인 무영향 (behavior change 0, 설계 "Layer-2는 그 다음" 규율).

## 3b. NEXT (다음 세션)

- **Layer-2 누적 LLM 의미 채널** — 매 마디 LLM 판단을 뼈대 옆 저장·누적(계층 의미지도)·**resume 키서 제외**(epoch-fingerprint)·seed에 provisional 피드. over-context 커버리지가 실증분(§9). leaf-read 규율 확장.
- **또는 Layer-1 pipeline 배선** — `ComprehensionArtifact`의 engine-not-yet `reduce` 필드(`comprehension-artifact.ts:150`)를 이 코어로 실현 + reuse/resume 키 fold(2-tier epoch §4).
- 커밋 여부 = owner 결정(현재 전부 미커밋: 설계문서·하네스4·`comprehension-reduce.{ts,test.ts}`).

## 4. 정직한 잔여 (재측정 금지 목록)

- **의미-품질 "더 나은 seed"** = inherently soft(coverage 교란·name confound). judge 붙여도 gameable·저정보. **재측정 X.**
- 깊은 트리 = 3레벨만 검증(무한 아님)·identity-보존 과제. 실 semantic-transform 깊은 트리는 미검증.
- 의미 fidelity 통제 부실(type만 섞음·name이 role 누설) → "B가 type 필드 읽음" 미입증(name 읽음은 정당).

## 5. owner 결정 로그 (이 세션)

Family-1로 충분(onto 미실행) → 주장 M 측정(지표①=결정론 관계recall) → over-context 영역교정 → 미측정 2개(깊은트리·의미) 다 확인 → **consolidate**.
