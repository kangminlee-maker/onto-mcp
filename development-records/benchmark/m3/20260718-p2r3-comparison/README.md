# M3 P2 — R=3 확정 재현 (gpt-5.6-sol vs gpt-5.5, 2026-07-18)

> **확정 결론: 이 fixture set·계기에서 두 모델의 precision/recall 랭킹은 성립하지
> 않는다.** R=3(셀당 24 pooled judge runs)에서도 §3-3 intra-model-stability 게이트가
> **전 셀을 제외**한다 — R=2의 "무판정"이 더 높은 검정력에서 **재현**됐고, 이제
> 불안정성 자체가 반복 실증된 소견이다. R=1의 "5.5 precision 우세"는 최종적으로
> 기각된다(단일-draw 인공물, R=2·R=3 연속 비재현). owner 지시(2026-07-18 "R≥3
> 재현해서 확정하자")에 따른 종결 기록이며, 등록/권위 변경 없음.

## 실행 (owner-spend)

- 신규 rep-3: arm당 4 fixture × full `onto review` 1회 = **라이브 리뷰 8회**
  (`run-ontology-review.mts`, arm별 `p2-eval-settings/*.json`, core-axis·no-domain,
  intent는 스크립트 고정 — R=1/2와 동일 계기). 전 run `completed`, salvaged 0.
- **계기 불변성**: eval settings에 `ontological_anchoring` 키 없음 = flag OFF —
  2026-07-17 default-on 승격(#222)은 repo settings에만 적용되고 arm 실행은 격리
  temp 프로젝트라 R=1/2와 동일 프롬프트(flag-off byte-identity는 렌더러 동등성
  테스트+A/B로 증명). 코드는 main(#218/#219 포함)이나 프롬프트-영향 변경 없음.
- judge: rep-3 세션만 신규 채점(Opus 4.8, oauth, effort=low, K=8) —
  `20260718-p2r3-{sol,gpt55}-rep3only/`. rep-1/2는 기존 capture 재사용(재-judge 없음).
- R=3 풀링: `20260718-p2r3-{sol,gpt55}-arm/capture/` = R=2 capture + rep-3 capture →
  `m3-run.ts --replay` (source-digest 검증 통과) → report.json.
- 비교: `m3-compare.ts` → `../20260718-p2r3-comparison.json`.

## rep-3 세션 (fixture evidence 커밋)

| fixture | sol rep-3 (wall) | gpt-5.5 rep-3 (wall) |
|---|---|---|
| clinical | 20260718-f461553b (990s) | 20260718-0c3a8973 (528s) |
| credit | 20260718-41224df0 (717s) | 20260718-1bb88da9 (**1232s**) |
| manufacturing | 20260718-e047c9c7 (863s) | 20260718-8d90017a (467s) |
| logistics | 20260718-3c9b2434 (898s) | 20260718-4065ab62 (673s) |

## Per-cell intra-model stability (R=3)

| fixture | sol (3-rep bands) | gpt-5.5 (3-rep bands) | comparable? |
|---|---|---|---|
| clinical | UNSTABLE | **STABLE (below³)** | no — sol unstable |
| credit | UNSTABLE (meets/ind/ind) | UNSTABLE (ind/exceeds/below) | no — both |
| logistics | UNSTABLE (exceeds/ind/below) | UNSTABLE (below/below/ind) | no — both |
| manufacturing | UNSTABLE (meets/meets/ind) | UNSTABLE (exceeds/ind/below) | no — both |

**비교 가능 셀 0/4** — `m3-compare` 전 지표 `insufficient (<2 trustworthy arms)`.
R=2 대비 오히려 악화(sol은 R=2의 manufacturing STABLE도 상실): rep가 늘수록
review-생성 분산이 밴드 컷을 더 넓게 가로지른다. 즉 **불안정성은 검정력 부족이
아니라 이 계기 해상도에서의 리뷰-분산 그 자체**다.

## 확정되는 것 (안정성 게이트와 무관한 소견)

- **recall 동등(재확인, 3회 연속)**: 양 arm 전 fixture material recall 평균
  0.83–1.00, 격차 무. 모델 선택이 시딩 결함 검출력을 바꾸지 않는다.
- **wall-time 신호 격하**: R=2의 "전 리뷰 비중첩(5.5 빠름)"은 R=3에서 깨짐 —
  5.5 credit rep-3 1232s > sol credit rep-3 717s. 종합: 5.5가 대체로 빠르나
  (11/12 리뷰) 보편 성질 아님.
- canary 게이트 전 24 리뷰 유지(계기 작동 확인).

## 실무 함의 (owner 결정 근거)

두 모델은 이 온톨로지-리뷰 워크로드에서 **품질로 구별되지 않는다**. seat 선택은
품질 외 축(비용·속도 경향·quota)으로 정하면 되고, 추가 R을 사서 랭킹을 강행할
근거는 없다(분산 구조상 R을 늘려도 셀 안정화 전망이 없음 — R=2→R=3에서 악화).
M3 P2는 이 기록으로 **종결**.

## Provenance
- arm 디렉터리: `../20260718-p2r3-sol-arm/` · `../20260718-p2r3-gpt55-arm/`
  (rep3only capture 원본: `../20260718-p2r3-{sol,gpt55}-rep3only/`)
- 재현(무지출): `npx tsx scripts/m3-run.ts --replay <arm-dir>` →
  `npx tsx scripts/m3-compare.ts --arm gpt-5.6-sol:<sol>/report.json --arm gpt-5.5:<g55>/report.json`
- 선행: R=1 `../20260716-p2-comparison/` · R=2 `../20260716-p2r2-comparison/`
