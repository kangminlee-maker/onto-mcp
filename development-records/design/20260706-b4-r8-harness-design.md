# INV-MODEL-1 B4 — R8 라이브 캡처 하니스 설계 (v3 · 2라운드 교차검증 반영)

> 상태: **설계-먼저 (빌드 전) · v3**. owner 승인 = "1(b)+2(a) · fixture=6255aef7 · **round-2 후 옵션 A(durable source-safe capsule)**"(2026-07-07).
> v1→v2 = round-1(ultracode wf_22791f61-685 · onto 20260707-ea339d5b · 독립) HIGH 5·MED 4.
> **v2→v3 = round-2(ultracode wf_2ed0b4ad-817 · onto 20260707-6bb4d130 · 독립)**: onto convergent HIGH 3(증거 durability/binding, fix-유발) → loopback-2 stop-and-ask → owner 옵션 A. 변경 요지 = §17·§18·§19.
> 상위 계약 = `20260704-inv-model-1-role-aware-design.md` §6·§13.3. 검증기(스키마-먼저 고정·불변) = `src/core-runtime/discovery/synthesize-cert-record.ts`.

## 0. 목표 · 범위 · done-when

- **목표**: `semantic_map_synthesize` role의 실 증거 record(`synthesize-cert/v1`) 1개를 라이브 벤치로
  생성·박제 → Haiku 레지스트리 엔트리(B5-완성) 가능케 함.
- **★ 인증 주장 범위 (결정 1(b))**: cert = **per-node raw synthesize 능력**(`synthesizeSemanticMapNode`
  이 고정 bounded 입력에 대해 내는 summary+boundaries)만 인증. production 전체경로(accumulate→
  reconcile→verify→taint→projection)와의 **gap은 구조화된 evidence capsule(§18)에 machine-readable로 공개**
  (자유텍스트 아님)하고, B5 등록 전 별도 **production-contrast run**을 필수 obligation으로 둔다(§13). full-production 인증 아님.
- **★ 증거 durability (round-2 옵션 A · §18)**: cert 증거는 **durable source-safe evidence capsule**(tracked
  companion 아티팩트)로 영속 — hash·추상 구조 facts·verdict·mutation provenance·obligation flag 포함, **민감한
  child_summary 프로세만 로컬(gitignore·R7 grounding 감사)**. B5/gate가 capsule↔record binding과 obligation을
  소비(fail-closed). "박제된 record 뒤에 증거가 local-only여서 재현 불가"(round-2 HIGH) 해소.
- **범위(이 세션)**: 무지출 R8 하니스 **설계 v3 + 빌드 + mock E2E**. 라이브(`--go`)는 owner 예산 후.
- **done-when (하니스)**: mock/fixture LLM로 산출한 record가 `validateSynthesizeCertRecord` **0-violation**
  + `computeSynthesizeCertAggregates` 재계산 일치 + 실패-보존(R8) + **durable capsule 영속·binding gate 통과**
  (record.input_sha256 ↔ capsule digest 검증·obligation 소비·fail-closed) + 음성대조(결함 record/capsule 비-0).
  라이브 done-when = 상위 §1 + R7(§13) + production-contrast.
- **비-목표(§13.3 경계)**: negative 변별 실효·candidate 품질·baseline 진위·선택배제 정직·grounding 프로세 의미 = R7.

## 1. 확정 그라운딩 (실측·코드 인용 — v1 유지)

### 1.1 예산 프리플라이트 (`scripts/b4-forecast.mts`, LLM 0)

| 워크북 (sha8) | 컬럼 | dispatch | merge | leaf | seam×merge | seam×leaf | noseam×merge | noseam×leaf |
|---|---|---|---|---|---|---|---|---|
| **3392b185** 결제·수익인식(105MB) — **fixture #1(앵커)** | 461 | 1699 | 619 | 1080 | 105 | 92 | 514 | 988 |
| **6255aef7** Day1 1.0(52MB) — **fixture #2** | 1845 | 1845 | 0 | 1845 | 0 | 587 | 0 | 1258 |

- fixture #1 = 4 stratum 전부(§6.4a global floor 충족). fixture #2 = leaf 2개(per-fixture floor·anti-gerrymander OK).
- merge stratum = fixture #1 단일 증거 → R7 caveat(§13).

### 1.2 파이프라인 메커니즘 (실코드)

- 노드 synthesize = `synthesizeSemanticMapNode(input: SemanticSynthesisInput): Promise<SemanticSynthesisOutput>`
  (run.ts:429). 프롬프트 = `SEMANTIC_MAP_SYNTHESIZE_SYSTEM_PROMPT`(run.ts:2018) — 전 arm 동일.
- 입력 조립 단일출처 = `buildSynthesisInputForNode(trace, nodesByKey, modes, key, childSummaryByKey)`
  (comprehension-semantic-map.ts:741) + `assertSynthesisInputBounded`(:663, source-safe: raw 셀 전무).
- `SemanticSynthesisInput` = {node_ref, format_clusters:string[], value_shape_seams:[{row,prev_shape,new_shape}],
  child_summaries:[{key,summary}]}. **format_clusters는 조립 시 sort됨**(:765) → 순열 sha-inert.
- 서브트리 저작 = `accumulateSemanticMap`(:783)이 bottom-up walk(synthesize→reconcile→verify). B4는
  reference child_summaries 저작(§5)에만 이 walk를 1회 사용.

### 1.3 검증기 계약 (§13.3 경계판 · 코드 재확인)

| violation (line) | 하니스 대응 (v2) |
|---|---|
| negative_targets_incomplete (600) | targeted_metrics ⊇ {grounding, boundary}; 복합 변이 per-metric 레버(§6) |
| negative_lineage (617) | negative row source_input_id === input_id |
| negative_mutation_not_applied (659) | 변이가 frozen packet sha 변경 — **relabel 확정**(§6) |
| input_sha_mismatch (666) | baseline/candidate = frozen input sha 그대로 |
| prompt_sha_mismatch (628) | 전 arm 프로덕션 프롬프트 |
| arm_model_mismatch (638)·baseline_is_candidate (1031) | candidate=Haiku·baseline=gpt-5.5 |
| metric_regression (698) | candidate mean ≥ baseline (실측·진위 R7) |
| metric_not_judged_on_decisive (676) | decisive 행 두 지표 verdict |
| aggregate_mismatch (715) | `computeSynthesizeCertAggregates` |
| floors·outer-join | 샘플러 over-provision(§3)·실패-보존(§8) |

## 2. 아키텍처 v3 (입력 동결 → 단일 호출 → durable capsule)

```
[관찰·결정론]        [샘플러·결정론]              [입력 동결·1회]                [arm·LLM]           [judge·LLM]      [조립]
observe(2 fixture) ─▶ 층화 샘플+provenance ─▶ frozen SemanticSynthesisInput 저장(packet)
                       → manifest 고정         merge: reference realization로 child_summaries 1회 저작
                                               leaf: 결정론 facts만
                                                     │
                                                     ▼ per (input × rep × arm) = 단일 호출
                              baseline gpt-5.5 : frozen packet ─┐
                              candidate Haiku  : frozen packet ─┼─▶ synthesizeSemanticMapNode(packet)
                              negative Haiku   : 변이 packet ────┘        (subtree walk 없음)
                                                     │
                                                     ▼ output(summary+boundaries)
                              grounding/boundary judge(원본 packet 참조·독립 lens) ─▶ metrics
                                                     │
                                                     ▼
                              실패-보존 row(R8) → judgement_rows → computeAggregates
                                                     │
                          durable capsule(§18·tracked·source-safe) + prose 사이드카(gitignore·local)
                                                     ▼
                              record → validate 0-violation + capsule binding gate → 박제
```

**핵심**: per-arm subtree walk 폐기(child 1회 동결→전 arm 동일 입력→same-input·A). arm=frozen packet 단일
호출. **증거=durable source-safe capsule(§18)+프로세만 로컬**(round-2 옵션 A).

## 3. 결정론 층화 샘플러 → 고정 manifest (+ provenance)

**입력 우주**: fixture별 non-subsumed 노드, stratum 태깅(merge=accumulating, seam=reduceNode value_shape 존재).

**over-provisioning (D 해소)**: (fixture × 보유 stratum)별 K입력. decisive n≥5는 K×rep(3) × 실 decisive율
필요. 9행 중 >4 비-decisive면 floor 위반(유료런 후 발각) → **비관 decisive율 0.4 가정 K=5**(5×3=15행 →
0.4서 6 decisive ≥5). fixture#1 4 stratum×5=20 · fixture#2 2×5=10 = 30입력.

**★ 시퀀싱 (R2-IND-1 해소)**: floor 사전 체크는 **결정론 facts 스코프**(node identity+stratum·§4의
`deterministic_facts_sha256`)로 **reference child 저작(§5, LLM 지출) *전에*** 실행 —
`synthesizeCertManifestFloorViolations`로 가용 부족 시 즉시 실패(reference 지출 낭비·라이브 전 차단).
그 후에만 reference 저작 → full `input_sha256`(§4) 계산 → manifest 동결. 즉 "pre-spend floor 체크"는
reference 저작보다 앞선다.

**결정론·정직 선정** (cherry-pick 금지 = R7):
1. stratum 후보를 안정 키(reduceNodeKey) 정렬. seed=sha256(`fixture_sha|stratum|sampler_version`).
2. **merge 비용 바운드**: merge stratum 내 subtree leaf count 오름차순(작은 서브트리 우선) — 결정론·
   내용-블라인드 비용 편향. seed로 동수 tie-break.
3. **input_id = 공백-free (E 해소)**: `<fixture8>-s<sheetIndex>-c<colIndex>-r<rowStart>_<rowEnd>` (raw 시트명
   미포함·전역 유일). 샘플러가 freeze 전 **모든 input_id `/^\S+$/` 단언**.

**provenance (H 해소)**: stratum별 rejected pool 크기·후보 rank·seed·stride·**selected vs
nearest-unselected** 를 **durable capsule(§18)에** 영속(source-safe: 노드 identity·구조 지표만) → R7 대표성 감사.

**출력 = 고정 manifest**: `input_manifest[] = {fixture_id, input_id, input_sha256, stratum}` (§4). pre-spend
동결 + **manifest identity sha 기록**(post-hoc shrink 불가 증명·D). manifest·provenance·binding = durable capsule(§18).

## 4. 입력 identity — 2-단 분리 (A 해소 · 결정 2(a) · round-2 R2-IND-1)

- **frozen packet** = 완전한 `SemanticSynthesisInput`(node_ref + sorted format_clusters + canonical
  value_shape_seams + **child_summaries 포함**). merge는 child_summaries를 reference realization로 1회
  저작(§5)해 동결; leaf는 child_summaries=[].
- **2-단 identity (R2-IND-1)**:
  - `deterministic_facts_sha256` = sha256(node_ref + sorted format_clusters + canonical value_shape_seams,
    **child_summaries 제외**) — LLM-무관·결정론. **샘플/scope/floor 사전체크용**(reference 저작 전 계산 가능·§3 시퀀싱).
  - `input_sha256` = sha256(canonical(frozen packet **전체**·child_summaries 포함)) — **비교/same-input용**.
    전 arm 동일 packet → baseline/candidate 동일 `input_sha256` → input_sha_mismatch 통과 → **진짜 same-input
    비교**(candidate≥baseline 무오염). manifest는 둘 다 보유.
- negative row: 변이 packet → 다른 `input_sha256`(§6) → negative_mutation_not_applied 통과. source_input_id=input_id.
- **★ 증거 durability (round-2 옵션 A · §18)**: 두 층으로 분리 —
  - **durable capsule(tracked·§18)**: `input_sha256`·`deterministic_facts_sha256`·**child_summaries의 sha만**
    (프로세 아님)·구조 facts(format_clusters·value_shape_seams=추상·비민감)·output_sha·verdict·mutation
    provenance·sampling provenance·obligation flag. **전부 source-safe → 커밋**. B5/gate가 binding·obligation 소비.
  - **local prose 사이드카(gitignore)**: 원본·변이 packet의 **child_summary 프로세 전문**(실 워크북 요약=민감).
    R7 grounding 감사·judge replay 로컬. capsule의 child sha와 대조 가능(로컬).
  - → "record 박제됐지만 증거 local-only=재현 불가"(round-2 HIGH issue-002) 해소: **구조·binding·verdict·
    obligation은 durable+gate-검증**, 민감 프로세만 로컬(그 의미 재감사=R7·§13.3). record 스키마 strict/불변이라
    capsule은 companion 아티팩트(스키마 무변).

## 5. arm 실행 v2 (frozen packet · 단일 호출)

| arm | 모델 | 입력 packet | judge 기준 |
|---|---|---|---|
| baseline | openai/gpt-5.5 | frozen(원본) | frozen 원본 |
| candidate | anthropic/claude-haiku-4-5-20251001 | frozen(원본) | frozen 원본 |
| negative_control | anthropic/claude-haiku-4-5-20251001 | **변이** | frozen 원본 |

- **reference realization**: merge 입력의 child_summaries를 **고정 참조**(프로덕션 gpt-5.5, 1회)로
  `accumulateSemanticMap` bottom-up 저작 → 동결. 전 arm 공유이므로 **참조 모델 선택은 candidate≥baseline
  비교를 편향하지 않음**(양 arm 동일 children). reference 모델·config는 reproduction에 공개.
- arm 실행 = `createDirectCallReconstructDirectiveAuthor({llmConfig:<arm>}).synthesizeSemanticMapNode(packet)`
  **단일 호출**(merge/leaf 무관·per-arm walk 없음). 전 arm 프로덕션 프롬프트.
- negative 모델=candidate(변이 입력서 candidate 지표 하락을 봄). 검증기는 baseline≠candidate만 강제.
- **인증 표면 명시(B/결정 1b)**: 인증 대상 = 이 단일 synthesize output(raw summary+boundaries). production의
  후속 reconcile/verify/taint/projection은 **인증 밖**(§9 limitation·§13 contrast).

## 6. Negative-control 복합 변이 (relabel 확정 · per-metric provenance)

**mutation_kind = `input_corruption/v1`**, `targeted_metrics=[grounding, boundary]`. frozen packet에 적용,
boundedness=transform 구현+테스트. **레버는 content-changing relabel로 확정**(순열은 sort로 inert=F):

- **grounding 레버**: format_clusters·child_summaries 문자열을 **결정론 relabel**(seed 기반 내용 치환) →
  sorted list/child 텍스트 내용 변경 → sha 변경 + arm이 잘못된 facts로 저작 → judge(원본) 적발.
- **boundary 레버**: value_shape_seams row **결정론 offset** → seam 존재 시 sha 변경 + output boundary가
  원본 구조와 어긋남 → judge 적발.

**레버 보장 (F 해소)**: 샘플러가 각 negative 입력에 **≥1 sha-변경 레버** 보유 확인(무레버 no-seam×leaf
[format_clusters 공집합]는 negative 샘플서 배제). S2 빌드 단언 = **입력별 sha 실제 변경**(per-stratum, no-seam 포함).

**per-metric provenance (G·I 해소)**: `mutation_params`에 `{grounding_lever, boundary_lever, seed}` +
**행별 적용 레버 기록**(사이드카). no-seam 행은 boundary 레버 inert → **grounding만 실제 표적**임을 명시
(boundary는 "spurious boundary 없음" 판정·negative 미표적). boundary 실 degrade는 **seam strata**서
입증(negative 샘플에 seam×* 포함 필수). targeted_metrics 두 지표=구조 요건 충족·실효 분간=R7.

## 7. Grounding/Boundary judge (원본 packet 참조 · 답변가능 packet C 해소)

- **독립 lens**: synthesize와 다른 모델(gpt-5.5 또는 opus)+전용 프롬프트. 전 arm 동일 judge.
- **judge 입력 = 영속된 원본 frozen packet(§4) + arm output**. negative도 원본 packet 기준(arm이 본 변이
  아님) → 변별. **verdict·output_sha·구조 facts·packet child sha = durable capsule(§18)**·**child 프로세 전문 =
  local 사이드카**. R7이 "이 verdict가 이 packet서 도출가능한가" 감사: 구조·binding은 capsule(durable),
  프로세 의미 재감사는 local(§13.3)(issue-005 답변가능성 = capsule로 durable 감사가능화).
- **판정 대상 정의**:
  - grounding = summary가 packet facts(format_clusters·seams·**child_summaries**)에 충실(할루시네이션 없음).
    merge는 child_summaries가 packet에 있어 판정 정보 충분(IND-1 leaf 취약 완화: leaf는 packet의 구조
    facts 대비 할루시네이션 판정).
  - boundary = output boundaries가 packet value_shape_seams와 일치. **seam strata서 변별**; no-seam은
    "spurious boundary 없음" 판정(§6). 결정론 reconcile와의 관계 = §9 note.
- judge 실패 계측(judge_error/timeout/not_run) → R8.

## 8. 실패-보존 (R8 · v1 유지)

- expected 우주 = manifest × declared_reps × arm. 모든 좌표 정확히 1 row(실패도 row:
  candidate_output_status/judge_status 평면 분리·실패 시 metrics=not_judged). declared_reps=3.
- 재실행은 좌표 덮어씀(attempts 계측)·재개는 frozen manifest에 결속(scope-shrink 불가). judge 절단은
  실패 귀속·재실행. `l2-real-llm-run.mts` 연속-실패 soft-abort + terminal-class 즉시 중단 재사용.

## 9. Record 조립 + 0-violation (+ gap 공개)

1. judgement_rows → `computeSynthesizeCertAggregates`로 declared_aggregates(재계산 일치).
2. arm_prompt_sha256(전 arm=프롬프트 sha)·arm_model·negative_arm(kind/params/targeted_metrics)·
   reproduction(command·source_paths[**durable capsule §18**·local prose 사이드카]·limitations[산문 요약]).
3. **★ gap 공개 = durable capsule의 구조화 obligation flag(§18·round-2 issue-003)**: `certification_scope`
   (per_node_synthesize_capability)·`production_contrast_required/completed`·per-row/stratum negative targeting
   ·limitation ids. **자유텍스트 아닌 gate-parse 가능 구조** → "machine-readable"이 이제 실제 참(round-2 LOW 해소).
   record.reproduction.limitations는 산문 병기(사람용). 인증 밖 = production reconcile/verify/taint/projection·
   end-to-end 저작(reference 고정)·merge 단일-fixture·샘플러 비용 편향·no-seam boundary 미표적.
4. `validateSynthesizeCertRecord(record) === []` **AND** capsule binding gate(§18) 통과 후에만 박제.
   `realization: "gate_outside_replay"`.
- **note(boundary↔reconcile·IND-2)**: production `reconcileBoundaries`가 output boundary↔seam 매칭을 결정론
  계산. judge의 boundary 지표는 raw output의 **의미 특성화**(character_before/after 적절성) 포함으로 결정론
  초과 판정을 명시 대상으로 함(단순 row 매칭은 reconcile 몫). §7 프롬프트가 이를 한정.

## 10. 재사용 맵

| 재사용 | 출처 | 용도 |
|---|---|---|
| observe·buildColumnLeaves·reduce·classifyFrontier | observer·comprehension-* | 우주·stratum |
| `buildSynthesisInputForNode`·`assertSynthesisInputBounded` | comprehension-semantic-map.ts | packet 조립(단일출처) |
| `accumulateSemanticMap` | comprehension-semantic-map.ts | reference child_summaries 1회 저작 |
| `synthesizeSemanticMapNode` | run.ts:429 | arm별 단일 synthesize |
| `SEMANTIC_MAP_SYNTHESIZE_SYSTEM_PROMPT` | run.ts:2018 | 공유 프롬프트·sha |
| quota preflight·capture·soft-abort | l2-real-llm-run.mts | 비용 가드 |
| `synthesizeCertManifestFloorViolations`·`computeSynthesizeCertAggregates`·`validateSynthesizeCertRecord` | synthesize-cert-record.ts | pre-flight·집계·검증 |

**신규**: 층화 샘플러(+provenance) · packet 동결/영속 · `input_corruption/v1` relabel transform ·
grounding/boundary judge · 좌표 루프 · record 조립기.

## 11. 비용 모델 v2 (실측 그라운딩)

- reference 저작(1회): merge 입력 subtree 저작 ≈ 작은 서브트리 ~3콜 × merge 입력(~10) = ~30콜.
- arm 실행: 30입력 × 3rep × 3arm = 270 **단일** synthesize + judge 270 = ~540. (per-arm walk 폐기로 v1보다 단순.)
- **총 대략 500~700 라이브 콜** (전체 트리 61K의 ~1%). 예산 승인 단위.

## 12. Mock E2E (0-violation 무지출 실증)

- mock synthesize/judge = 결정론 fixture. reference 저작도 mock. 소형 합성 2-fixture(각 stratum ≥ floor)
  → 전 경로 → record → `validateSynthesizeCertRecord === []` 단언 + **packet/provenance 사이드카 영속 단언**.
- **음성대조**: 결함 record(rep 부족·stratum 결손·negative sha 불변·lineage 불일치·집계 조작·input_id 공백)
  가 비-0 violation. transform sha-변경 단언 음성대조(무레버 입력 거부).
- mock→real = realization 스위치 + `--go`. 프로덕션 semantic 경로는 실 LLM만.

## 13. R7 사람 큐레이션 + B5 obligation (§13.3 위임)

durable capsule(§18) + local prose 사이드카 근거로 사람 검토:
① negative가 실제 두 지표 degrade(seam strata boundary 포함) ② candidate 품질 실사용 가능 ③ baseline 진짜
gpt-5.5 성능 ④ not_run/judge_error 정직 ⑤ arm_model↔실행 일치 ⑥ 샘플러 공정(capsule provenance로 rejected/
nearest 대조) ⑦ judge verdict가 packet서 도출가능(구조=capsule·프로세 의미=local) ⑧ merge 단일-fixture 수용.
**★ B5 등록 전 obligation (round-2 ultracode MED 강화)**: **production-contrast run** — sampled merge 노드
≥1개를 production accumulate→reconcile→verify 경로로 실행하되 **child 저작을 candidate(Haiku)로 실행**(2a가
도려낸 능력을 정확히 측정)하고, gap 축 = **boundary 의미·taint + child-authoring/cross-level compounding 품질**
을 명시 측정·공개. capsule의 `production_contrast_required=true`; `completed`가 false면 **B5 binding gate
fail-closed**(§18 — presence는 구조 게이트·§13.3 OK; 대조 adequacy 판정은 R7). 이 대조 없이 등록 불가.

## 14. 설계 긴장 해소표 (round-1 v2 + round-2 v3)

| 긴장 | 해소 |
|---|---|
| T1 judge 정보충분성 | §7 원본 packet 참조 + child_summaries 포함(merge) + **capsule durable 감사**(C/issue-005) |
| T2 scoped walk 충실도 | **소멸** — 입력 동결로 arm=단일 호출·walk 없음. production gap=구조화 공개(§18) |
| T3 input_sha merge | **해소** — full packet sha·전 arm 동일 same-input(A) + 2-단 identity(§4·R2-IND-1) |
| T4 복합 단일 변이 | §6 per-metric 레버 provenance·seam strata서 boundary 실효(G/I) |
| T5 샘플러 정직 | §3 provenance→**capsule**·over-provision(H/D) |
| T6 merge 단일-fixture | §13 R7 ⑧ + 공개 (수용·미해소는 3번째 긴-컬럼 워크북 필요) |
| E input_id 공백 | §3 공백-free id + `/^\S+$/` 단언 |
| **R2-A 증거 durability**(round-2 onto issue-002) | **§18 durable source-safe capsule**·프로세만 로컬 |
| **R2-B binding 미강제**(issue-001) | **§18 capsule binding gate**(input_sha256↔capsule·fail-closed) |
| **R2-C obligation 비-gate-consumable**(issue-003) | **§18 구조화 obligation flag**·B5 게이트 소비 |
| **R2-D contrast 미명세**(ultracode MED) | §13 Haiku child 저작 + compounding 축 |
| **R2-E "machine-readable" 과대**(ultracode LOW) | §9 capsule이 실제 구조화→참 |
| **R2-F identity 분리/시퀀싱**(IND-1) | §4 2-단 sha·§3 floor 사전체크 선행 |

## 15. 빌드 계약 (staged · 무지출)

1. **S1 샘플러** — stratum 태깅·over-provision K=5·2-단 identity(§4)·`deterministic_facts_sha256` floor
   사전체크(reference 저작 전)·결정론 픽·input_id 공백-free. 테스트: 결정론·floor pre-check·`/^\S+$/`·selected-vs-nearest.
2. **S2 packet 동결** — buildSynthesisInputForNode frozen packet + reference child 저작(1회) + 프로세 local
   사이드카(gitignore) 영속. 테스트: 전 arm 동일 `input_sha256`·source-safe·재현성.
3. **S3 transform** — `input_corruption/v1` relabel(두 레버) + **입력별 sha-변경 단언**(no-seam 포함) + per-metric provenance. 음성대조: 무레버 입력 거부.
4. **S4 judge** — 원본 packet 참조 grounding/boundary + mock 실현.
5. **S5 좌표 루프** — arm별 단일 synthesize + 실패-보존 + 캡처/soft-abort.
6. **S6 durable capsule(§18)** — source-safe capsule 조립(hash·구조facts·verdict·provenance·obligation flag)·
   프로세는 sha만·**tracked**. 테스트: source-safe 단언(프로세 부재)·capsule↔row 정합.
7. **S7 record + binding gate** — computeAggregates·validate 0-violation·**capsule binding gate**(input_sha256↔
   capsule digest·obligation·fail-closed). 테스트: 음성대조(capsule 누락/불일치/obligation 미충족→gate 비-0).
8. **S8 mock E2E** — 전 경로 0-violation + capsule 커밋가능 + 음성대조(§12).
- 게이트: ts-core clean · full vitest 회귀0 · 정적 게이트 · mock E2E 0-violation + capsule binding + 음성대조 비-0.
- **B5 게이트 확장(구조·§13.3 OK)**: 기존 `synthesizeCertBindingViolations`(shipped)에 capsule presence/digest/
  obligation 검증 추가 = INVARIANT-CHANGE 후보(닿는 INV id 마커). semantic adequacy는 R7(무변).
- default-off: 라이브 = realization 스위치 + `--go`(off=mock·프로덕션 무영향).

## 16. 교차검증 (2라운드 완료)

- **round-1(§17)**: v1 → HIGH 5·MED 4 → v2(1b+2a).
- **round-2(§19)**: v2 → ultracode 0 HIGH·onto convergent HIGH 3(증거 durability, fix-유발) → **loopback-2
  stop-and-ask** → owner **옵션 A** → v3(§18 durable capsule). v3는 round-2 findings를 전부 반영.
- **v3 재검증 판단**: 옵션 A는 round-2가 명시 제안한 방향(onto action + 내 추천 수렴)이라 새 근본 결정 아님.
  단 §18 capsule/gate는 신규 개념 + shipped B5 게이트 확장 → **빌드 시 S6/S7 음성대조 + 구조가드로 자기검증**,
  필요 시 빌드 후 targeted round-3(capsule 계약·B5 게이트 확장만). **loopback-2 규율 준수**: v3가 또 새 HIGH를
  내면 stop-and-ask(패치 금지).

## 17. 교차검증 기록 (2026-07-07 · v1 → v2)

**3-패밀리**: ultracode(wf_22791f61-685·21 raw→refute후 1 confirmed·단 refute-by-default 과도) · onto
(20260707-ea339d5b·9-lens·material 8[HIGH 5]) · 독립(IND-1/2/3). 수렴/발산:
- **A 입력 identity(merge child)** = 3-패밀리 강수렴(onto issue-001·003 HIGH 8/9·7/9 lens + ultracode
  F5/F8 + IND-1). **C judge packet** = 강수렴(onto issue-005 + ultracode F8/F10 + IND-1).
- **B production 등가**(onto issue-002/007 HIGH) · **D floor 여유**(onto issue-009 HIGH) = ultracode가
  refute-by-default로 강등 → **다른-KIND 발산 → union 채택**(conformance 렌즈는 dependency/graph 의미
  못 봄). **E input_id 공백**(ultracode V18 confirmed) = onto 미포착 → union(line-lens 고유).
- MED: F negative 레버(sort inert 메커니즘 확인) · G per-metric provenance(issue-008) · H 샘플러
  provenance(issue-006) · I boundary no-seam(issue-004).

**owner 결정 = 1(b) per-node capability cert + 2(a) child_summaries 동결.** 이 결정이 A·B·C·F를 클러스터로
해소(입력 동결 → arm 단일 호출 → walk 소멸·same-input·judge packet·child 변이 sha 가시). 잔여(D·E·G·H·I)는
기계적 하드닝. 상세 종합 = `scratchpad/b4-xval-synthesis.md`(세션 산물).

## 18. Durable evidence capsule + binding gate (round-2 옵션 A · 신규 개념)

**개념**: cert record(박제·opaque)의 증거를 durable하게 만드는 **tracked companion 아티팩트**
(`synthesize-cert-capsule/v1`). record 스키마(strict/불변)를 안 건드리는 별도 파일.

**capsule 내용 (전부 source-safe → 커밋 가능)**:
```
{ capsule_contract: "synthesize-cert-capsule/v1",
  record_ref, record_input_manifest_sha,           // record와 결속
  certification_scope: "per_node_synthesize_capability",   // 주장 범위(구조화·issue-003)
  production_contrast: { required: true, completed: bool, evidence_ref? },  // obligation flag(issue-003·§13)
  limitation_ids: [...],                            // 인증 밖 항목(구조화)
  per_input: [ { input_id, deterministic_facts_sha256, input_sha256,   // 2-단 identity(§4)
    child_summary_sha256,                           // 프로세 sha만(프로세 본문 아님)
    format_clusters, value_shape_seams,             // 추상 구조 facts(비민감)
    stratum, sampling_rank, nearest_unselected_id } ],   // provenance(§3·H)
  per_row: [ { row_id, input_id, arm, rep, output_sha256, metrics,      // verdict binding
    negative_lever_applied? } ] }                   // per-metric provenance(§6·G)
```
**민감 제외**: child_summary **프로세 본문**은 capsule에 없음(sha만) → local prose 사이드카(gitignore).

**binding gate (구조·결정론·§13.3 OK)** — `synthesizeCertBindingViolations`(shipped B5) 확장 or 신규
capsule-validator:
- capsule presence(누락→fail-closed) · `record_input_manifest_sha` ↔ record 실제 manifest 일치
- per_input.input_sha256 ↔ record.input_manifest 일치 · per_row output/metrics ↔ record.judgement_rows 일치
- `production_contrast.completed===true`(false→fail-closed·B5 등록 차단)
- source-safe 단언: capsule에 프로세 필드 부재(구조가드)
- **semantic adequacy(대조 충분·grounding 프로세 의미·negative 실효)는 판정 안 함 = R7**(§13.3).

**거버넌스**: capsule=tracked(source-safe). prose 사이드카=gitignore. capsule의 child sha ↔ local prose sha
대조로 로컬 무결성 확인. **round-2 issue-001/002/003 동시 해소**: durable(002)·gate-consumed binding(001)·
구조화 obligation(003).

## 19. 교차검증 round-2 기록 (2026-07-07 · v2 → v3)

**3-패밀리(v2 델타 표적)**: ultracode(wf_2ed0b4ad-817·7 raw→2 confirmed·**HIGH 0**·`loopback2:false`·MED §13
contrast 미명세·LOW machine-readable 과대) · onto(20260707-6bb4d130·9-lens·**convergent HIGH 3**) · 독립(R2-IND-1/2).
- **발산(convergence-by-KIND)**: ultracode 4렌즈(synthesis 건전성)=durability 못 봄. onto dependency/structure/
  pragmatics/axiology/evolution=**증거 durability/binding/replay 축** HIGH 포착. **union 채택**. onto가
  ultracode+나의 공통 blind spot(내 packet-gitignore가 durability를 깸) 포착.
- **onto HIGH 뿌리 하나**(fix-유발): v2 증거-영속(gitignore packet + opaque record + un-gated obligation)이
  durable audit/binding/gate-consumability를 깸 → 박제 record가 hollow shell. issue-001(binding)·002(durability)·
  003(obligation coarse).
- **loopback-2 판정**: round-1 HIGH → v2 fix → round-2 새 HIGH(fix-유발) = 2라운드 연속 → **stop-and-ask**
  (CLAUDE.md·B5 선례). ROOT=governance 트레이드오프(durability vs source-safety vs frozen-schema)=owner.
- **owner 결정 = 옵션 A**(durable source-safe capsule + companion·프로세만 로컬). §18 반영. ultracode MED(§13
  강화)·LOW(machine-readable 참)·R2-IND-1(2-단 identity)·R2-IND-2(contrast presence 게이트) 병행 반영.
- 상세 = `scratchpad/b4-r2-synthesis.md`·`b4-r2-independent.md`(세션 산물).
