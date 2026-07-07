# INV-MODEL-1 B4 — R8 라이브 캡처 하니스 설계 (design-first)

> 상태: **설계-먼저 (빌드 전)**. owner 승인 = "설계-먼저 진행 · 두 번째 fixture = 6255aef7 확정" (2026-07-06).
> 다음 = 교차검증(ultracode+onto) → 빌드. SSOT = 이 문서.
> 상위 계약 = `20260704-inv-model-1-role-aware-design.md` §6(증거 계약 v4)·§13.3(경계 재확정).
> 검증기(스키마-먼저 고정) = `src/core-runtime/discovery/synthesize-cert-record.ts`.

## 0. 목표 · 범위 · done-when

- **목표**: `semantic_map_synthesize` role의 실 증거 record(`synthesize-cert/v1`) 1개를 라이브 벤치로
  생성·박제 → Haiku 레지스트리 엔트리(B5-완성) 가능케 함.
- **범위(이 세션)**: 무지출 R8 하니스 **설계 + 빌드 + mock E2E**. 라이브 캡처(`--go`)는 owner 예산
  승인 후 별도.
- **done-when (하니스)**: mock/fixture LLM로 하니스가 산출한 record가
  `validateSynthesizeCertRecord` **0-violation** + `computeSynthesizeCertAggregates` 재계산 일치 +
  실패-보존(R8) 구조 정직. (라이브 done-when = 상위 §1: 실 Haiku·gpt-5.5·R7 큐레이션 통과.)
- **비-목표**: negative 변이의 실효(변별)·candidate 품질·baseline 진위 판정 = **R7**(§13.3 경계).
  하니스는 구조·identity·일관성만 결정론 보증.

## 1. 확정 그라운딩 (실측·코드 인용)

### 1.1 예산 프리플라이트 실측 (`scripts/b4-forecast.mts`, LLM 0 · 결정론)

| 워크북 (sha8) | 컬럼 | dispatch | merge | leaf | seam×merge | seam×leaf | noseam×merge | noseam×leaf |
|---|---|---|---|---|---|---|---|---|
| **3392b185** 결제·수익인식(105MB) — **fixture #1(앵커)** | 461 | 1699 | 619 | 1080 | 105 | 92 | 514 | 988 |
| **6255aef7** Day1 1.0(52MB) — **fixture #2(확정)** | 1845 | 1845 | 0 | 1845 | 0 | 587 | 0 | 1258 |

- fixture #1 = **4개 stratum 전부** 보유 → §6.4a global floor 이 앵커로 충족.
- fixture #2 = leaf stratum 2개(seam×leaf·no-seam×leaf) 보유 · merge 0(짧은 컬럼) → §6.4a
  per-fixture(보유 stratum floor)·anti-gerrymander(1845 컬럼) 통과.
- **정직 caveat**: merge stratum(seam×merge·no-seam×merge)은 **fixture #1 단일** 증거 → R7 명기.

### 1.2 파이프라인 메커니즘 (실코드)

- 노드별 synthesize = 프로덕션 author의 `synthesizeSemanticMapNode(input: SemanticSynthesisInput):
  Promise<SemanticSynthesisOutput>` (run.ts:429). `verifySemanticMapBoundary`와 PAIR.
- 입력 조립 단일출처 = `buildSynthesisInputForNode(trace, nodesByKey, modes, key, childSummaryByKey)`
  (comprehension-semantic-map.ts:741). frontier면 child_summaries=[]; accumulating이면
  consumed children 요약 필요(bottom-up 선행).
- 프로덕션 프롬프트 = `SEMANTIC_MAP_SYNTHESIZE_SYSTEM_PROMPT` (run.ts:2018, CG-1 카탈로그 엔트리) —
  **전 arm 동일** → arm_prompt_sha256 동률(§6.2-4).
- `SemanticSynthesisInput` = {node_ref, format_clusters[], value_shape_seams[], child_summaries[]}
  (comprehension-semantic-map.ts:451). 앞 3개 = **결정론 facts**; child_summaries = 하위 LLM 산물.

### 1.3 검증기 계약 (코드 재확인 — §13.3 경계 반영판)

| violation | 규칙 (line) | 하니스 대응 |
|---|---|---|
| negative_targets_incomplete | targeted_metrics ⊇ {grounding, boundary} (600) | 단일 negative arm = **복합 변이**(두 지표 표적) |
| negative_lineage | negative row source_input_id === input_id (617) | negative는 **자기 좌표 원본**을 변이 |
| negative_mutation_not_applied | negative input_sha ∉ 전체 manifest sha (659) | 변이가 실제로 facts sha 변경 |
| input_sha_mismatch | baseline/candidate input_sha === manifest sha (666) | 원본 facts 그대로 |
| prompt_sha_mismatch | arm_prompt_sha256 3개 동일 (628) | 프로덕션 프롬프트 공유 |
| arm_model_mismatch | arm_model.candidate === (provider,model) (638) | candidate = Haiku |
| baseline_is_candidate | baseline ≠ candidate (1031) | baseline = gpt-5.5 |
| metric_regression | candidate mean ≥ baseline mean (698) | 실측(위조 아님)·진위=R7 |
| metric_not_judged_on_decisive | decisive row 두 지표 ∈ {pass,fail} (676) | judge가 decisive에 verdict |
| aggregate_mismatch | declared ↔ recompute (715) | `computeSynthesizeCertAggregates`로 채움 |
| stratum/rep/fixture floor | fixture≥2·rep≥3·decisive≥5 per stratum×arm | 샘플러가 floor 보장 |
| outer-join | expected 좌표 정확히 1 row (누락/중복/orphan) | 실패-보존이 좌표 채움 |

**§13.3 REMOVE(하니스 부담 아님)**: negative 변별 임계·decisiveness_ratio 폐기 → R7. 하니스는
negative를 **구조적으로 정직**하게만(두 지표 표적·lineage·변이 실적용) 만들면 됨.

## 2. 아키텍처 개요

```
[관찰·결정론]                    [샘플러·결정론]              [arm 실행·LLM]        [judge·LLM]      [조립·결정론]
observeSpreadsheetSource ─▶ buildColumnLeaves/reduce ─▶ 층화 샘플 → 고정 manifest
   (2 fixture)                classifyFrontier                │
                                                             ▼ (per input × rep × arm)
                              baseline: gpt-5.5, 원본 facts ─┐
                              candidate: Haiku, 원본 facts ──┼─▶ synthesizeSemanticMapNode
                              negative: Haiku, 변이 facts ───┘        (scoped subtree walk)
                                                             │
                                                             ▼ output(summary+boundaries)
                                        grounding/boundary judge (독립 lens, 원본 기준) ─▶ metrics
                                                             │
                                                             ▼
                              실패-보존 row(R8) → judgement_rows → computeAggregates
                                                             │
                                                             ▼
                              SynthesizeCertRecord → validate 0-violation → 박제
```

## 3. 결정론 층화 샘플러 → 고정 manifest (신규 핵심 부품)

**입력 우주**: fixture별 non-subsumed 노드(dispatch), 각 노드에 stratum 태깅:
`merge = (mode==="accumulating")`, `seam = reduceNode.boundaries에 value_shape 존재`.

**샘플 목표**: (fixture × 보유 stratum)별 K입력. K×rep(3) × 예상 decisive율 ≥ 5 여유. **기본 K=3**
(3×3=9 row → 40% 손실에도 decisive ≥5). fixture #1 = 4 stratum × 3 = 12입력; fixture #2 = 2 stratum
× 3 = 6입력. 총 **18입력**.

**결정론·정직 선정** (cherry-pick 금지 = R7 검증):
1. stratum 후보 노드를 **안정 키**(reduceNodeKey = sheet:col:rowspan)로 정렬.
2. seed = sha256(`fixture_sha | stratum | sampler_version`). seed로 stride/해시 추출 → **내용-블라인드**
   (판정 품질 아님, 노드 identity만).
3. **merge 비용 바운드**: merge stratum 내에서는 **작은 서브트리 우선**(subtree leaf count 오름차순 tie-break)
   — 이는 결정론·내용-블라인드 편향(품질 아닌 비용). `reproduction.limitations`에 **명시**(R7이 공정성 판정).
4. `input_id` = **전역 유일** namespace = `<fixture8>:<sheet>:<col>:<rowStart>-<rowEnd>` (§6.3 핀).

**출력 = 고정 manifest**: `input_manifest[] = {fixture_id, input_id, input_sha256, stratum}` (§4의
결정론 facts sha). 열거 시점 동결 → 재실행/재개도 이 우주에 결속(scope-shrink 불가).

## 4. 입력 identity + sha (비자명 결정)

**결정**: `input_sha256` = sha256(canonical(node_ref + sorted format_clusters +
canonical value_shape_seams)) — **child_summaries 제외**.

- 근거: merge 노드의 child_summaries는 arm/rep별 LLM 산물이라 비결정론 → manifest 동결 불가.
  결정론 facts만 입력 identity로 삼으면 baseline/candidate가 동일 sha(원본 facts) 공유 →
  input_sha_mismatch 통과. child 서브트리 저작은 **arm의 작업**(입력이 아님).
- negative row: 변이는 결정론 facts를 교란 → input_sha256(변이) ≠ 어떤 manifest sha →
  negative_mutation_not_applied 통과. source_input_id = input_id(자기 좌표).

## 5. 3-arm 실행

| arm | 모델 | 입력 facts | judge 기준 |
|---|---|---|---|
| baseline | openai/gpt-5.5 (현행 프로덕션) | 원본 | 원본 |
| candidate | anthropic/claude-haiku-4-5-20251001 | 원본 | 원본 |
| negative_control | anthropic/claude-haiku-4-5-20251001 (=candidate) | **변이** | **원본** |

- 전 arm = 프로덕션 프롬프트(`SEMANTIC_MAP_SYNTHESIZE_SYSTEM_PROMPT`) 공유.
- arm별 synthesize = `createDirectCallReconstructDirectiveAuthor({ llmConfig: <arm 모델>,
  enableSemanticMapAuthoring: true }).synthesizeSemanticMapNode`.
- **negative 모델 = candidate**(Haiku): "candidate 모델이 변이 입력에서 지표가 떨어지는가"를
  보이는 게 negative의 목적이므로 candidate 모델로 실행. (검증기는 negative 모델 자유; baseline≠candidate만.)

**Scoped subtree 저작** (비용 바운드 핵심):
- frontier 입력: `buildSynthesisInputForNode`(child_summaries=[]) → 1 synth call.
- accumulating(merge) 입력: 샘플 노드의 **서브트리만** bottom-up으로 arm LLM 저작(각 descendant
  synth → child_summaries 상향) → 샘플 노드 output. **전체 컬럼 트리 실행 금지**(61K 방지).
- 재사용 판단: `accumulateSemanticMap`을 **샘플 노드 rooted sub-trace**에 적용 가능(leaf-count는
  subtree-local이라 분류 보존)하나, 그건 verifyUnanchored까지 강제(추가 LLM 콜). record는 raw
  synthesis output(summary+boundaries)만 judge하므로 **최소 scoped walk**(reconcile/verify 생략,
  `buildSynthesisInputForNode`+`assertSynthesisInputBounded` 재사용)를 기본 채택. (빌드 시 두 경로
  비용/충실도 재비교 — §14-T2.)

## 6. Negative-control 복합 변이 (결정론 named transform)

**단일 mutation_kind = `input_corruption/v1`**, `targeted_metrics = [grounding, boundary]` (두 지표
표적 = 검증기 구조 요건). SemanticSynthesisInput에 적용, boundedness는 transform 구현+테스트 소유:

- **grounding 표적**: format_clusters·child_summaries를 **결정론 순열/재라벨**(seed 기반) →
  arm이 잘못된 facts에서 저작 → judge(원본 기준)가 불일치 적발.
- **boundary 표적**: value_shape_seams row를 **결정론 offset 이동**(params.offset) → arm 출력
  boundary가 원본 구조와 어긋남 → judge(원본 기준) 적발.

`mutation_params` = {seed, offset, ...} 인용. **효과(실제 degrade) = R7**; 하니스는 적용·lineage만
보증. (변이가 실제로 두 지표를 떨어뜨리는지 = R7 §13.3 체크리스트 ①.)

## 7. Grounding/Boundary judge (신규 부품)

- **독립 lens**: synthesize와 **다른 모델**(예: gpt-5.5 또는 opus) + 전용 프롬프트. 전 arm 동일 judge
  (공정 비교).
- **입력**: judge는 **원본** 결정론 facts(+ 필요한 source 앵커) + arm output(summary+boundaries).
  negative arm도 **원본 기준**(arm이 본 변이 입력 아님) → negative가 변별.
- **출력**: `grounding ∈ {pass, fail}`, `boundary ∈ {pass, fail}`. judge 미실행/output 비-ok →
  metrics `not_judged` + judge_status/candidate_output_status로 귀속.
  - grounding = summary가 원본 facts에 충실(할루시네이션 없음)한가.
  - boundary = output boundaries가 원본 value_shape_seams와 일치하는가.
- judge도 캡처·실패 계측(judge_error/timeout/not_run) → R8 실패-보존.

## 8. 실패-보존 (R8)

- expected 우주 = manifest × rep(선언) × arm. **모든 좌표에 정확히 1 row** — 실패도 row:
  `candidate_output_status ∈ {ok, parse_fail, structural_fail, not_run}` (synthesize 평면),
  `judge_status ∈ {ok, judge_error, timeout, not_run}` (judge 평면), 실패 시 metrics=not_judged.
- 기존 judge 스크립트(실패 후보 judging 전 드랍)와 **양립 불가** → 신규 루프가 좌표 우선 열거 후
  각 좌표를 채움(재실행은 좌표 덮어씀·attempts 계측; row 중복 금지).
- judge 절단/transport 실패: `l2-real-llm-run.mts`의 연속-실패 soft-abort + terminal-class(quota/auth)
  즉시 중단 재사용. 재개는 좌표 결속(scope-shrink 불가).

## 9. Record 조립 + 0-violation

1. judgement_rows 완성 → `computeSynthesizeCertAggregates({inputManifest, judgementRows})`로
   declared_aggregates 채움(검증기와 **동일 헬퍼** → aggregate_mismatch 무발생).
2. arm_prompt_sha256(전 arm = 프롬프트 sha), arm_model(baseline gpt-5.5·candidate/negative Haiku),
   negative_arm(kind/params/targeted_metrics), reproduction(command·source_paths·limitations[샘플러
   편향·merge 단일-fixture caveat 명시]) 조립.
3. `validateSynthesizeCertRecord(record)` **=== []** 확인 후에만 박제. 아니면 fail-loud.
4. `realization: "gate_outside_replay"` 명기(게이트 밖 replay).

## 10. 재사용 맵

| 재사용 | 출처 | 용도 |
|---|---|---|
| `observeSpreadsheetSource` | spreadsheet-structure-observer.ts | fixture 관찰 |
| `buildColumnLeaves`·`reduceColumnLeavesWithTrace`·`classifyFrontier` | comprehension-reduce/semantic-map | dispatch 우주·stratum |
| `buildSynthesisInputForNode`·`assertSynthesisInputBounded` | comprehension-semantic-map.ts | 입력 조립(단일출처) |
| `synthesizeSemanticMapNode` (author) | run.ts:429 | arm별 노드 synthesize |
| `SEMANTIC_MAP_SYNTHESIZE_SYSTEM_PROMPT` | run.ts:2018 | 공유 프롬프트·sha |
| quota preflight·capture wrapper·soft-abort | l2-real-llm-run.mts | 비용 가드·캡처 |
| `computeSynthesizeCertAggregates`·`validateSynthesizeCertRecord` | synthesize-cert-record.ts | 집계·검증 |

**신규**: 층화 샘플러 · `input_corruption/v1` transform · grounding/boundary judge · 3-arm×좌표 루프 ·
record 조립기.

## 11. 비용 모델 (실측 그라운딩)

- 샘플 18입력(fixture#1 12 + fixture#2 6). merge 6입력(작은 서브트리 우선 ~3콜/입력) + leaf 12입력(1콜).
- synth/rep/arm ≈ (6×~3)+(12×1) = ~30콜. 단 negative는 candidate만(2 arm이 synth: baseline+candidate;
  negative=candidate 모델 변이) → arm 조합별로 계산. 대략:
  - fixture#1: ~12입력 × 3rep × 3arm 좌표 = 108 row. synth(merge 서브트리 포함) ~200~300 + judge ~108.
  - fixture#2: ~6입력 × 3rep × 3arm = 54 row. synth ~54(all leaf) + judge ~54.
- **총 라이브 콜 대략 500~800회** (전체 트리 61K의 1~2%). 예산 승인 단위.
- 빌드 시 `b4-forecast`에 **서브트리 크기 분포** 추가 → merge 콜 상한 정밀화.

## 12. Mock E2E 계획 (0-violation 무지출 실증)

- mock synthesize = 결정론 fixture output(summary+boundaries) — 실 LLM 대체(realization 스위치).
- mock judge = 결정론 verdict(baseline/candidate pass 다수·negative 일부 fail로 구조 정직).
- 소형 합성 2-fixture(각 stratum ≥ floor) 또는 실 관찰 우주에서 최소 샘플 → 하니스 전 경로 →
  record → `validateSynthesizeCertRecord === []` **단언 테스트**(vitest).
- **음성대조**: 의도적 결함 record(rep 부족·stratum 결손·negative 단일지표·lineage 불일치·집계 조작)가
  비-0 violation을 내는지 = 검증기 falsifiable 재확인(§13.3 KEEP 축 전부).
- mock→real 스위치 = realization 플래그 + `--go`. 프로덕션 semantic 경로는 실 LLM만(§mock-realization
  boundary).

## 13. R7 사람 큐레이션 경계 (§13.3 위임)

하니스가 **결정론 보증 못 하는** 항목 = record.reproduction + 사람 검토:
① negative 변이가 실제로 두 지표를 degrade하는가 ② candidate(Haiku) 품질이 실사용 가능한가
③ baseline이 진짜 프로덕션 gpt-5.5 성능인가 ④ not_run/judge_error 손실이 정직(선택 배제 아님)한가
⑤ arm_model 선언 ↔ 실제 실행 일치 ⑥ **샘플러가 공정**(작은-서브트리/비용 편향이 품질 cherry-pick으로
전이 안 됐는가) ⑦ merge stratum 단일-fixture 한계 수용 가능한가.

## 14. 미해결 설계 긴장 (교차검증 표적)

- **T1 judge 기준 결정**: negative를 원본 기준 judge로 변별 → judge가 원본 facts(+source 앵커)에
  접근해야. judge 입력 설계가 grounding/boundary를 실제로 판정 가능한가? (lens 독립성·source-safety
  envelope 양립?)
- **T2 scoped walk vs accumulateSemanticMap 재사용**: 최소 walk가 프로덕션 입력 조립과 drift 위험 vs
  full accumulate의 verify 비용. 충실도-비용 트레이드.
- **T3 input_sha = 결정론 facts(child 제외)**: merge 노드에서 baseline/candidate 동일 sha가 정직한가
  (child 저작 차이를 입력이 아닌 arm-작업으로 보는 프레이밍).
- **T4 복합 변이 단일-kind**: 두 지표를 한 mutation_kind로 표적(스키마 단일 kind 제약) — 실효
  분리도(어느 축이 어느 지표를 떨어뜨리는가) R7이 분간 가능한가.
- **T5 샘플러 정직**: 작은-서브트리 편향의 비용-목적이 품질-selection으로 오염 안 되는 증거(내용-블라인드
  픽 규칙 + limitations 공개)로 충분한가.
- **T6 merge 단일-fixture**: fixture #2에 merge 없음 → merge 일반화 증거 약함. 수용 vs 3번째 워크북(긴 컬럼).

## 15. 빌드 계약 (staged · 무지출)

1. **S1 샘플러** — stratum 태깅 + 결정론 층화 픽 + manifest 조립. 단위 테스트(결정론·floor 보장·
   내용-블라인드·input_id 유일).
2. **S2 transform** — `input_corruption/v1`(두 지표) + boundedness 테스트 + sha 변경 단언.
3. **S3 judge 인터페이스** — grounding/boundary judge fn(원본 기준) + mock 실현.
4. **S4 3-arm×좌표 루프** — scoped subtree synthesize + 실패-보존 + 캡처/soft-abort 재사용.
5. **S5 record 조립기** — computeAggregates + validate 0-violation + reproduction.
6. **S6 mock E2E** — 전 경로 → 0-violation 단언 + 음성대조(§12).
- 게이트: ts-core clean · full vitest 회귀0 · 정적 게이트 · mock E2E 0-violation + 음성대조 비-0.
- default-off: 라이브 경로는 realization 스위치 + `--go`(off면 mock; 프로덕션 무영향).

## 16. 교차검증 계획

first-of-kind 라이브+하니스 → 빌드 전 **ultracode + onto 병행**([[design-validation-ultracode-onto]]).
표적 = §14 T1~T6. **B5 loopback-2 교훈 준수**: 결정론으로 의미(변별·품질·baseline 진위)를 재강제하지
말 것(§13.3 경계 = 결정론은 구조·identity·일관성만). 수렴 = spine 생존, 발산 = union delta 반영.
```
