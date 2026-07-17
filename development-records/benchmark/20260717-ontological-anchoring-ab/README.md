# ontological-anchoring 라이브 A/B (2026-07-17) — judgment_anchor 승격 근거 1차

> 성격: disclosure record (N=1/cell — **랭킹·확정 결론 아님**, M3 P2 안정성 규율 준용).
> 설계 SSOT: `development-records/design/20260716-review-ontological-primacy-runtime-alignment-design.md` §6.
> 구현: PR #218 (main `666f954`). owner 지시(2026-07-17): 머지 + A/B 즉시 실행.

## 설계 / 실행

- **4 arm 순차**: {code, spreadsheet} × {off, on(양 플래그 `obligations`+`judgment_anchor`)}.
  arm당 격리 임시 프로젝트, 동일 target·동일 intent, `.onto/settings.json`은 repo 커밋본
  (gpt-5.6-sol@medium, full 모드 9렌즈)에 on-arm만 `ontological_anchoring` 키 추가.
  실행 경로: `review-invocation-runner.ts` (live, external_oauth_worker/codex).
- **targets**:
  - code: cert fixture `review-pipeline-target-v1`의 `src/target.ts` 사본 — 실결함
    `unstableFormat`(material 기대) + 비-material decoy(lensId identity, intent가 명시).
  - spreadsheet: `budget.xlsx` (openpyxl 생성) — 시딩 결함 3: D1 `Summary!B1=SUM(Data!B2:B4)`
    stale range(5행 중 2행 누락, 결정-영향·material 기대) · D2 `='Archive'!B2` 부재 시트
    참조 · D3 named range `GrandTotalRange`가 Amount 아닌 Category 열 지정.
- 4 run 전부 `execution_status: completed`, `degraded_lens_ids: []`, 9/9 렌즈 참여.
- 원시 세션 4개: 세션 산출물 보관(스크래치) — 요약 지표는 아래 표가 재현 소스.

## 조작 확인 (manipulation check) — 전부 통과

| 검사 | off | on |
|---|---|---|
| lens sidecar `Severity judgment anchor` | 0/9 | **9/9** |
| issue-artifact `Declared-purpose anchor` (LLM-판단 패킷) | 0 | **4/4** (relation-graph·issue-ledger·deliberation-plan·problem-framing; finding-ledger는 sidecar-모드 결정론 프로젝션 패킷, issue-stance-matrix는 런타임 집계라 양 arm 공히 비대상) |
| code 의무 prose | 원본(작동 혼재 절) | 정렬본(계약-충족 주절 + 작동=증거채널 종속절) |
| spreadsheet 의무 prose | 원본 | **원본과 동일**(불변 보장 ✓) |
| confirmed criteria 임베드 | — | intent-유래 criterion 축어, 단일 행 붕괴 정상 |

## 결과 비교 (N=1/cell)

| 지표 | code-off | code-on | xlsx-off | xlsx-on |
|---|---|---|---|---|
| findings / issues | 12 / 9 | 13 / 12 | 18 / 15 | 20 / 19 |
| finding severity 분포 | med 12 | med 13 | high 6·med 8·low 4 | high 8·med 7·low 5 |
| 시딩 결함 검출 | unstableFormat material ✓ | material ✓ | D1 high·D2 med·D3 low ✓ | **D1 high·D2 med·D3 low ✓ (강등 없음)** |
| decoy(비-material 기대) | 비-material ✓ | 비-material ✓ | n/a | n/a |
| deliberation planned/전체 | 3/9 (전부 action_or_severity) | 12/12 (root_hypothesis 1·purpose_value 4·partial_overlap 7) | 7/15 (root 3·partial 3·action 1) | 1/19 (root 1) |
| wall time | ~10.4m | ~14.0m | ~12.8m | ~10.6m |

## 판독 (이 draw가 지지하는 것 / 못하는 것)

1. **메커니즘 진실성 (결정론 — 신뢰 가능)**: flag-off는 앵커 0·원본 prose, flag-on은
   의도 지점 전수에 정확히 발현. 라이브 경로에서 배선·게이팅·임베드 전부 설계대로.
2. **회귀 부정 신호 (E-1 라이브 반증, 1 draw)**: spreadsheet 시딩 결함의 severity가
   on에서 강등되지 않음(D1 high 유지 — 설계가 강등 지시를 admission-라우팅으로 교체한
   B-1 정정의 의도 결과). code 실결함 material 유지·decoy 비-material 유지.
3. **프레이밍 전환 (설계 (b)의 의도 효과, 방향 신호)**: `purpose_value` conflict_type은
   on arm에서만 출현(code-on 4회). code-off deliberation은 `action_or_severity` 일색 →
   code-on은 root/purpose 축 중심.
4. **비용/deliberation 양은 무결론**: code에서 on이 12/12 planned로 증가했으나 xlsx에서는
   1/19로 감소 — 방향 불일치 = 단일-draw 분산. 플래그 효과로 귀속 금지.
5. **한계**: cell당 N=1 (M3 규율상 안정성 판정 불가). 승격 확정에는 R≥2 재현 또는
   실사용 축적 필요. 시딩 결함이 단순-구조형이라 개념-충돌형 결함에서의 프레이밍 효과는
   미측정.

## 승격 판단 입력

`judgment_anchor`의 default-on 승격 요구 조건(설계 §6: 비-code kind 포함) 대비:
**메커니즘 ✓·비-code 회귀 부정 ✓(1 draw)·프레이밍 효과 방향 ✓**. 남은 것: owner가
1-draw 근거로 승격할지, R≥2 또는 실사용 관찰을 먼저 쌓을지 결정.
