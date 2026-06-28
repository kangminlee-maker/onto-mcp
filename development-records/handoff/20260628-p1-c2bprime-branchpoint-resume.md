# RESUME — ★분기점: 101MB 수익인식 워크북 실-LLM seed 품질 테스트 (P1-C2-B′ 이후)

> **START-HERE.** `/clear` 후 fresh 세션이 **이 문서 하나로** 분기점을 이어받는다. 날짜 2026-06-28. 브랜치 `feat/comprehension-cut2-de-risk`. HEAD=`d596d61`.
> 분기점 = P1-C2-B′(leaf-read capture + 결정론 트리거)가 **mock-first로 완성**된 뒤, "추가 읽기가 *실제로* ontology seed를 개선하는가"를 **실 LLM·실 데이터**로 처음 측정하는 단계. **실 LLM 지출이 발생 → owner 승인/월 한도 회복 시점에 실행.** 지금까지는 전부 mock.

## 0. 현 상태 (한 줄)
**✅ P1-C2-B′ 완전 종결**(Steps 2-4 `5259962` + 두 패밀리 게이트 `7cb2e68` + follow-up 4건 `390988e`·`fc43848`). leaf-read capture가 **라이브 reconstruct에 실배선**돼 있고(mock 아닌 실 LLM 경로 준비됨), 검증 = ts-core clean·**full vitest 2041**·정적 게이트 6종. **다음 = 이 분기점만 남음.**

## 1. 무엇을 판정하나 (정직한 가능 결말 3가지)
P1-C2-B′의 전제: "구조·수식이 *못 잡는* raw 사실 누락을 막으려고 더 읽는다"(완전성). 분기점은 그게 **실제로 필요한지**를 실 데이터로 심판한다.
- **(A) 읽기가 가치 있음**: capture(잠정 라벨·semantic_role·captured_note)가 결정론 인벤토리가 *놓친* 숨은 패턴/의미를 실제로 표면화하고, 그게 seed/온톨로지를 개선한다 → cut 정당.
- **(B) 읽기가 불요**: maturation(작성·성숙 단계)이 이미 그걸 보완한다 → 추가 읽기 불필요. **이것도 valuable한 결론**(cut을 유지할지/줄일지 정보). 설계 §5/§7이 명시: "실제로 불요일 수도."
- **(C) 부분**: 일부 시트/컬럼에선 가치, 일부는 noise. → 트리거 튜닝(max_columns·트리거 술어) 근거.
⚠️ "실패"가 아니라 **측정**이다. B로 나와도 정상.

## 2. 전제 (코드 상태 — 전부 준비됨)
- **leaf-read = 라이브 배선됨**(mock 아님): `runReconstruct`가 `runSpreadsheetLeafReadStage` 호출(run.ts:11602). direct-call author의 `readLeafLabels`가 `callJsonAuthor` 경유 **실 LLM** 발화. capture가 sidecar로 영속되고 provisional_labels/not_examined_capped가 authoring 프롬프트 도달.
- **실 LLM 가용**: reconstruct provider = **`gpt-5.5` (openai OAuth)** — `.onto/settings.json` `reconstruct.execution.actors.semantic_author`. 방금 onto review가 같은 provider(codex/gpt-5.5)로 성공했으므로 **인프라 가동 중**.
- **트리거 발화 예상 = YES**: 이 워크북은 저신뢰 시트(`무의미`류·빈컬럼)와 고신뢰 tabular의 구조-불완전 컬럼을 둘 다 가짐 → leaf-read가 발화한다(Cut-4b서 확인된 특성).

## 3. 워크북 (레포 밖·세션 산출물·커밋 금지)
- **canonical**(권장·안정 경로): `/Users/kangmin/cowork/day1_revenue_ontology/input/reference/mbp_2026년 02월_결제 및 수익인식F_260309.xlsx` — **101MB·14시트**. 시트: 매출·결제&수수료·결제상세·수익인식60일·수익인식60일_강사료·당월산식·유하다요_강사료·누적·유하다요·리스픽·포도·얼리버드·현물출고·정가표.
- 대안(Downloads): `mbp_2025년 06월/08월/09월/10월_결제 및 수익인식_F.xlsx`(전부 ~98-101MB·동일 도메인).
- ⚠️ **실 사업 데이터** — 로컬 유지·레포 커밋 금지·PII/마스킹은 owner 결정상 범위 밖이나 capture는 **aggregate-only(raw DATA 셀값 0)**라 구조적으로 안전(P1-C2-B′ source-safety narrow 반영).

## 4. 실행 레시피 (product path — 절대경로 OK·복사 불요)
`reconstruct-api`가 절대 targetRef 허용(`path.isAbsolute` 분기, reconstruct-api.ts:260)이라 101MB를 레포에 안 옮겨도 됨.

**onto MCP**(권장):
```
onto_reconstruct({
  targetRefs: ["/Users/kangmin/cowork/day1_revenue_ontology/input/reference/mbp_2026년 02월_결제 및 수익인식F_260309.xlsx"],
  intent: "결제·수익인식 워크북에서 ontology seed를 재구성한다(매출·결제·수익인식 엔티티/관계). 구조가 못 잡는 raw 사실 누락 여부를 본다.",
  semanticAuthorRealization: "direct_call",
  confirmationProviderRealization: "direct_call",
  filesystemAllowedRoots: ["/Users/kangmin/cowork/day1_revenue_ontology"]
})
```
- 길게 돌면 running 핸들 반환 → `onto_reconstruct_read`로 폴링(없으면 세션 dir의 산출물 폴링).
- **비용 제어**: leaf-read 자체는 bounded(cap `max_columns=64`·시트당 bounded 짧은 JSON 콜). 큰 비용은 seed/maturation authoring. 한도 빠듯하면 **대표 시트 부분집합**으로 먼저(Cut-4b는 14중 4 시트). 전 14시트 full은 한도 여유 시.

## 5. 실험 설계 (싼 것부터·2 단계)
**Phase 1 — 단일 WITH 런 + sidecar 직독(가장 쌈, 1회 실행)**: 실행 후 `<sessionRoot>/comprehension/<obs>.leaf-read.yaml`(capture sidecar)를 읽어 **capture가 무엇을 잡았나** 검사. 판단: 잡은 게 (a) 결정론 인벤토리가 *놓친* 숨은 패턴/역할/free-text gist인가(→가치) vs (b) 구조가 이미 말하는 것의 trivial 재진술인가(→불요). + final-output seed가 그 capture를 반영하나.
**Phase 2 — A/B(Phase 1이 애매할 때만·2× 비용)**: 같은 워크북을 leaf-read **없이** 한 번 더(baseline). 가장 깔끔한 toggle = throwaway 하니스가 `createDirectCallReconstructDirectiveAuthor(...)` 결과에서 `delete author.readLeafLabels` 후 `runReconstruct`(그러면 `runSpreadsheetLeafReadStage`가 `!readLeaf`→no-op=baseline). seed_A(with) vs seed_B(without) 비교: A가 잡은 raw 사실/패턴이 material한가.
**(선택) blind judge**: 두 패밀리 패턴([[design-validation-ultracode-onto]])으로 seed_A/B를 blind 채점(Workflow 적대 judge 또는 onto). Cut-4b 판례 = "VALIDATED/unblock 과신"을 게이트가 잡음 → 결과 과신 경계.

## 6. 결과 위치 (어디를 보나)
- capture sidecar: `<sessionRoot>/comprehension/<observation_id>.leaf-read.yaml`(`spine_claims`=provisional_label_read+role/note·`confidence_by_claim`·`limiting_witness`). run.ts:1546.
- 프롬프트 도달분: authoring 프롬프트의 `provisional_labels{labels, labels_total, not_examined_capped, not_examined_capped_total}`(run.ts observationPromptPayload). honest `*_total`=절단 시 진짜 개수.
- seed/온톨로지: 세션의 `final-output.md`·reconstruct-record refs.

## 7. 평가 기준 (무엇이 "제대로"인가)
- **가치 증거**: capture가 결정론이 못 준 raw 사실(예: 평범한 숫자칸의 숨은 그룹·coordinated append 경계·crosstab 역할)을 표면화 ∧ seed가 그것으로 더 정확/완전.
- **불요 증거**: capture가 전부 구조 재진술 ∨ maturation이 동일 사실을 독립 회수.
- **source-safety 확인**: capture에 raw DATA 셀값 0(헤더 라벨은 허용·이미 authoring 가시). 위반 시 = 회귀.
- **honesty 확인**: not_examined_capped_total이 절단을 정직 노출(게이트 fix 작동).

## 8. 비용·리스크
- ⚠️ **월 한도/owner 승인**: 실 LLM 지출. 실행 전 owner 확인. 한도 빠듯 시 대표 시트로 축소.
- 실 사업 데이터: 로컬·미커밋. capture aggregate-only라 외부 유출 표면 최소.
- 첫 **실 capture 품질 측정**: 지금까지 mock는 capture를 무시(품질 미측정) — 이게 그 갭을 닫는 단계.

## 9. 코드 앵커 (HEAD `d596d61`)
- 스테이지: `run.ts:1438 runSpreadsheetLeafReadStage`·호출 `run.ts:11602`·sidecar `run.ts:1546`.
- capture: `leaf-reader.ts readStructureLeaf`·`LEAF_READ_SYSTEM_PROMPT`·`comprehension-artifact.ts ProvisionalLabelClaim(semantic_role/captured_note)`.
- 트리거(결정론): `leaf-reader.ts extractStructureLeafEvidence`·`isStructureIncomplete`(+ uniform-formula skip)·`structureLeafTriggerLogicSha256`(로직 fold).
- Step E 투영: `run.ts observationPromptPayload`(provisional_labels + *_total)·`setLeafReadProvisionalLabels`/`setLeafReadCappedColumns`.
- resume: `llm-touch-fingerprint.ts`(ⓐ content+adapter v5 / ⓑ model·prompt·trigger_config·read_set_logic_sha256).
- provider: `.onto/settings.json reconstruct.execution.actors.semantic_author`(gpt-5.5 OAuth).

## 10. 포인터
- 이 cut 설계 SSOT: `development-records/design/20260628-p1-cut2b-prime-deterministic-capture-design.md`(§5 mock 경계+분기점·§7 정직 갭).
- 빌드+게이트 이력: `development-records/handoff/20260628-p1-c2b-prime-resume.md`(Steps 1-4·게이트·follow-up 4건).
- Cut-4b 선행 실측(같은 101MB workbook 계열): 메모리 [[unified-comprehension-engine-track]] §7.6(faithful·honest·frame-neutral 확인·단 충분도 SIMULATED).
- 메모리: [[unified-comprehension-engine-track]](전체)·[[design-validation-ultracode-onto]](게이트 규율)·[[explain-decisions-plainly]](owner=plain outcome).
- ⚠️ **월 한도** = 실 LLM 비용 주의([[effort-calibration-track]]).
