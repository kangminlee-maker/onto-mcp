# RESUME — P1 (comprehension 엔진 MVP sidecar = 첫 production 배선 cut)

> **START-HERE.** `/clear` 후 fresh 세션이 **이 문서 하나로** P1을 이어받는다. 날짜 2026-06-27. 브랜치 `feat/comprehension-cut2-de-risk`. HEAD=`8d16220`.
> P1은 **de-risk(Cut-1~4b)가 입증한 조각들을 *처음으로 실 파이프라인에 배선*** 하는 단계 — 신규 설계가 아니라 **설계-먼저(첫 production cut 절단) → 교차검증 → 빌드**.

## 현 상태 (한 줄)
재절단 comprehension 엔진 **설계+de-risk Cut-1~4b 전부 종결**(SSOT=`development-records/design/20260625-rescoped-comprehension-engine-design.md` §7.1~§7.6·§10.4~§10.9, 전 cut `gate_pass*`). **P0(shipping DET-1 재사용키 하드닝) 완결** = CG-2(모델 `0f04116`)+CG-1(프롬프트 카탈로그 `e868fa4`)+judge-model(`09de149`). dependency-discovery **메커니즘은 설계-게이트 후 이연**(redesign-narrow; 빌드 스펙=`development-records/design/20260627-llm-touch-dependency-discovery-design.md` §11). **▶ 지금 = P1 착수**(owner go 받음).

## P1 목표 (무엇을 입증)
de-risk는 전부 **throwaway 하니스(production 배선 0)**였다. Cut-4b의 가장 큰 정직 갭(§7.6) = **"양-소비자 충분도는 SIMULATED만"**(LLM projection+judge로 흉내·실 코드패스 미먹임·실 reconstruct는 spreadsheet서 BLOCKED). **P1 = sidecar를 *실 소비자*에 end-to-end로 먹여 그 시뮬을 실측으로 바꾸는 첫 production cut.** 가장 자연스러운 첫 소비자 = **reconstruct의 대용량 spreadsheet 관찰 경로**(오늘 BLOCKED = unblock 후보).

## P1 범위 (설계 SSOT §7 cut 계획 기준 — de-risk된 조각들)
1. **Cut-2 value-tile 배선**: 현재 실험 블록 `buildXlsxInventory({experimentalValueTiles})`(observer "CUT-2 EXPERIMENTAL")을 production 경로로. **선결 = display-only numFmt fold**(§7.1 하위-verdict (ii)·미구현): SAX 셀 핸들러가 패스 내 보유한 `cellStyle=a.s`/numFmt 코드를 fold해 보존 + fixture 1개. value-tile 표면 closure 전 게이트 항목.
2. **ComprehensionArtifact 계약(§5.7)**: 분산 prose → 단일 거버넌스 스키마. 필수 필드(`region_identity`·`observation_id`·`value_signature_tile_witness`·`spine_claims`·`semantic_depth`+라이프사이클·`capped_or_frontier_state`·`confidence_by_claim`·`is_lower_bound_by_claim`·`limiting_witness`·`provenance`·`safety_visibility_tier`·`consumer_handoff_notes`) **mandatory-or-explicit**(조용한 부재=validator fail-closed). **결정론 인벤토리를 *동반*(대체 아님)**, `observation_id` join.
3. **leaf-reader + triage + reduce**: 엔진 코어 3요소(§3.3 spine·§3.4 의미 triage·R8 monoid reduce). Cut-2b가 triage allocation+marking VIABLE 입증(안전경로 B는 이연).
4. **2-tier epoch / `llm_touch_fingerprint` 실배선**: Cut-4a는 **reference impl(미배선)**만 입증. P1 = run.ts 실배선 + **non-circular-key validator**(게이팅 키에 에포크-내 출력ⓒ 누설 시 fail-closed). ⚠️ dependency-discovery 자동발견은 §11로 이연 — P1은 *closure 주어졌을 때* fail-closed까지(Cut-4a 수준)면 충분, 자동 열거는 별도.
5. **실-소비자 E2E sidecar**: 위를 한 소비자로 끝까지 = 4b-2가 시뮬만 한 것의 실측.

## 권장 첫 스텝 (design-first)
P1은 덩어리가 크다. **smallest-viable 첫 production cut을 절단**해 설계 → 교차검증 → 빌드:
- 후보 절단 = **(결정론 value-tile sidecar + 최소 ComprehensionArtifact) → reconstruct 한 경로 E2E**(reduce/triage는 그 다음 cut). "엔진 전체"가 아니라 "한 소비자가 sidecar를 실제로 소비"부터.
- 설계 산출 = `development-records/design/`에 P1 cut 설계 → **ultracode + onto 교차검증**(big/sensitive·resume 계약 변경 = §7 line 257 "빌드 전 교차검증 비협상", [[design-validation-ultracode-onto]]) → 승인 후 빌드.

## 비-목표 / 가드 (P1이 *반드시* 지킬 것)
- ❌ 북극성 "한 엔진 통합"·explorer-V PRIMARY·전면 production(최소증명 전)·synthesis REPLACE(§6 비-목표).
- ❌ 마스킹/redaction 재도입(레포 정책 불변).
- 이연(P1 범위 밖·필요 시 별도): **dependency-discovery 메커니즘**(§11 빌드스펙)·Cut-2b 안전경로 B(sniff 재진입 fixture·교차모델 triage)·Cut-3 vision 잔여(#2 실-xlsx fidelity·cross-model·image-token 예산)·display-only fold는 value-tile *선결*이라 P1 안.
- 규율: throwaway 하니스 우선 → 통과 시 production 배선 → cut마다 교차검증.

## 코드 앵커 (현 HEAD `8d16220`)
- value-tile 실험: `src/core-runtime/reconstruct/run.ts`(또는 observer) "CUT-2 EXPERIMENTAL" 블록·`projectSegmentedValueTiles`·`buildXlsxInventory`(스트리밍 fflate+saxes)·`parsed.rows`/`profileSheetRows`.
- 재사용키(P0 완결): `authoredArtifactReuseMatch`(run.ts) = `semantic_author_model_identity`+`confirmation_provider_model_identity`+`judge_model_identity`+`authoring_prompt_contract_sha256`.
- telemetry(LLM-touch oracle·§11 메커니즘 입력): `execution-telemetry.ts` `recordLlmAttempt`(model_id·route·`prompt_policy_sha256`).
- 프롬프트 카탈로그(CG-1): `RECONSTRUCT_AUTHORING_PROMPT_CONTRACT`·`authoringPromptContractSha256()`(run.ts).

## 포인터
- 설계 SSOT: `development-records/design/20260625-rescoped-comprehension-engine-design.md`(§5.7 ComprehensionArtifact·§4.4 2-tier epoch·§7 cut 계획·§7.1~7.6 de-risk 결과·§10 baked-in 테스트).
- dependency-discovery(이연 메커니즘 빌드스펙): `development-records/design/20260627-llm-touch-dependency-discovery-design.md` §11.
- 전체 이력 handoff: `development-records/handoff/20260626-cut2-resume.md`. 직전(P0 CG-1, 종결): `20260626-phase0-cg1-resume.md`.
- 메모리: [[unified-comprehension-engine-track]]·[[dep-discovery-design-gate]]·[[design-validation-ultracode-onto]]·[[explain-decisions-plainly]](owner=plain outcome-framed 설명 선호).
