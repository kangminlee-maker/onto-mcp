# START-HERE: INV-MODEL-1 B4 라이브 캡처 (2026-07-06 clear 경계)

> 핀: main = `18ce27c` (PR #176 B5 검증기 머지). 세션 시작 시 재확인:
> `git fetch origin && git log --oneline -1 origin/main` (main ≥ 18ce27c).
> **첫 커맨드**: `git fetch origin && git checkout -b feat/inv-model-1-b4 origin/main`
> (이 워크트리 `onto-mcp-claude`는 main 체크아웃 불가 — 항상 origin/main에서 신규 브랜치).

## 0. 지금 어디인가 (CONFIRMED)

- **B5 검증기 종결·머지**: `synthesize-cert/v1` record 파서 + §6.4/§6.4a 재계산 + G7 role↔record
  결속이 main에 있음(PR #176). **경계 재확정(`300eb22`) 후 최종 계약** = 설계 §13.3.
- B5가 **record 계약을 스키마-먼저로 고정**했으므로, B4 하니스는 이 모듈을 **0-violation 통과**하는
  record만 산출하면 된다. 검증기 = `src/core-runtime/discovery/synthesize-cert-record.ts`
  (`validateSynthesizeCertRecord`·`computeSynthesizeCertAggregates`·`synthesizeCertBindingViolations`).

## 1. B4 목표 · done-when

- **목표**: `semantic_map_synthesize` role의 실 증거 record(`synthesize-cert/v1`) 1개를 라이브
  벤치로 생성해 박제 → Haiku 엔트리 등록(B5-완성) 가능케 함.
- **done-when**: 생성된 record가 (a) `validateSynthesizeCertRecord` 0-violation, (b)
  arm_model.candidate = anthropic/claude-haiku-4-5-20251001·baseline = openai/gpt-5.5(≠candidate·
  supported), (c) 재현 커맨드+한계 산문(reproduction) 포함, (d) 사람 큐레이션(R7 §13.3 체크리스트)
  통과. 그 후 레지스트리 엔트리(roles: [semantic_map_synthesize] + 이 record 인용) → G7 통과.

## 2. ★ 3대 선행 전제 (전부 owner/비용 결부 — 착수 전 확인)

1. **두 번째 실 워크북** (S6-1·§6.5): 현 기록 코퍼스는 단일 워크북(fingerprint 3392b185)뿐 →
   `fixture ≥ 2`(§6.4 floor)는 **두 번째 실 워크북의 신규 라이브 캡처를 선행 요구**. 워크북 선정이
   B4의 첫 실무. merge-stratum 입력은 연쇄 실-LLM leaf authoring(코퍼스 619/1699이 LLM-authored
   child_summaries)이라 비용 큼.
2. **신규 replay 하니스** (R8): 기존 judge 스크립트는 실패 후보를 judging 전 드랍 → §6.3 원자 row
   (실패도 row 보존)와 **양립 불가**. 신규 하니스가 필요:
   - 3 arm(baseline gpt-5.5 / candidate Haiku / negative-control 결정론 named-transform 입력변이)
     × manifest × reps(≥3)를 run 루프서 구조 생성. `realization: "gate_outside_replay"` 명기.
   - judge 절단 시 실패 귀속·재실행(expected는 원본 열거에 결속 — scope-shrink 불가).
   - **재사용 기반**: `scripts/l2-real-llm-run.mts`(synthesize 라이브 실행·quota 프리플라이트·
     4-class completion·transport-failure soft-abort 골격) + `computeSynthesizeCertAggregates`
     (record 집계 = 하니스가 직접 호출·검증기와 동일 계산).
3. **예산 승인** (예산-캡 트랙): baseline 반복 ≥3 = 라이브 baseline 재실행 + negative arm 전량
   카디널리티(owner 결정 D·+50% 판정 비용). 최소 유니버스 ≈ 90 row × (synth + judge). owner 지출
   승인 필요. 월 한도면 이연 가능(B1~B3와 독립).

## 3. ★ 경계 재확정(§13.3)이 B4 하니스에 주는 것 — 하니스 단순화

`300eb22` 경계 재확정으로 record가 만족할 검사가 **줄었다**. B4 하니스가 만들 record 기준:
- **negative arm**: 변별 임계(상대/절대) 없음 → negative가 실제 degrade 안 해도 검증기는 통과.
  단 **구조는 정직해야**: targeted_metrics 두 지표·lineage identity(source_input_id==input_id·
  input_sha ∉ manifest 전체 = 변이 실적용). 실제 변별력은 **R7 사람 판정**(record가 통과해도 사람이
  "이 변이가 정말 지표를 떨어뜨리나" 확인).
- **decisiveness_ratio 없음**: 절대 floor n≥5만. 하니스는 셀당 decisive ≥5만 확보.
- **baseline identity**: arm_model.baseline = gpt-5.5(≠candidate·supported). self-baseline 금지.
- **candidate≥baseline**: 실제 값 계산(위조 아님). baseline/candidate 숫자 진위 = R7.
- KEEP 검사 전부: 스키마·재계산 일관성·outer-join·rep 바닥·stratum 커버리지·prompt/입력 sha 축·
  parse/structural 0(candidate/baseline)·id 위생·declared_reps 캡.

## 4. 착수 순서 (설계-먼저 권장)

B4는 first-of-kind 라이브+하니스라 **설계-먼저**가 규율(CLAUDE.md). 순서:
1. 두 번째 워크북 선정 + 하니스 설계 노트(§6.5 골격 + §13.3 경계 반영 + R8 실패-보존 + manifest
   구조 생성). 예산 프리플라이트(l2-real-llm-run `--go` 없이 forecast).
2. (owner 지출 승인 후) 라이브 캡처 실행 → record 조립 → `validateSynthesizeCertRecord` 0-violation
   확인 → R7 사람 큐레이션.
3. record 박제(git-tracked) → 레지스트리 Haiku 엔트리 → G7 통과 확인.
4. 큰 변경(하니스·라이브)이므로 필요 시 교차검증(ultracode+onto). **단 B5 loopback-2 교훈**: 결정론
   으로 의미(변별·품질)를 재강제하지 말 것 — 경계 재확정이 그 문을 닫았다.

## 5. 주의 (PROPOSED — 세션 시작 시 재확인)

- untracked 잔재 다수(구 핸드오프·WIP 스크립트 6건·fixtures) — 이 세션 산출 아님(시작부터 존재).
  박제/삭제 분류 미결. B4와 무관하면 방치.
- ⚠️ scratchpad의 `verify-baseline-suppression.mts`·`run-onto-review.mts` = 이 세션 교차검증 산물
  (session scratchpad·비-레포). B4서 record 검증 재사용 시 참고.
- onto MCP는 전역 v0.4.12라 이 레포 최신 settings 미파싱 → 라이브 review는 repo 하니스
  (`createOntoReviewCoreApi().runReview`, target=디렉토리·diffRange)로. review-invoke diffTargetDir
  ENOTDIR 버그(파일-target+diffRange) 주의.
