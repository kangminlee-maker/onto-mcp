# RESUME — P1-C2-B′ (결정론 "구조-불완전" 트리거 + LLM capture): Steps 2-4

> **START-HERE.** `/clear` 후 fresh 세션이 **이 문서 하나로** P1-C2-B′ Steps 2-4를 이어받는다. 날짜 2026-06-28. 브랜치 `feat/comprehension-cut2-de-risk`. HEAD=`819e867`.
> P1-C2-B′ = owner 재절단판(원안 P1-C2-B "LLM 의미 triage"는 교차검증 2회 redesign_narrow → owner가 결합 자체를 제거). **Step 1(결정론 트리거) 완료·커밋. Steps 2-4 잔여 = mock-first 빌드.**

## 현 상태 (한 줄)
**✅ P1-C2-A 완결**(커밋 `24404fc` A-C·`01841b8` D·`27b2220` E) = leaf-read가 저신뢰 영역서 라이브 발화·resume-sound·잠정 라벨이 authoring 도달. **✅ P1-C2-B′ Step 1 완결**(커밋 `819e867`) = 결정론 "구조-불완전" 트리거. **다음 = Steps 2-4**(capture 일반화·stage 배선·Step E·커밋).

## ★ 왜 P1-C2-B′인가 (이 피벗을 *반드시* 이해하고 시작)
원안 P1-C2-B = "LLM이 의미 깊이를 *배분*해 어디를 읽을지 결정". **게이트 2회 모두 redesign_narrow**(설계 `development-records/design/20260628-p1-cut2b-semantic-triage-design.md` §11/§11.1): 근본 = **LLM 판단(비결정 allocation)이 read-set을 좌우 → DET-1 silent-stale resume P0 재생성**(이 프로젝트가 계속 싸운 부류; 내가 fix를 2번 시도해 2번 실패).

**owner 교정(핵심·절대 되돌리지 말 것)**:
1. **중요도는 "더 읽을 기준"이 아니다.** 중요도 = *관계*에서 나옴(참조→결과 영향) = 온톨로지 내 *추상화* 기반 **downstream(작성·maturation)** 판단. 칸 하나의 *general 의미*로 "중요" 판단 = 이 온톨로지선 안 중요한 걸 오판.
2. **더 읽는 진짜 이유 = "구조·수식이 *못 잡는* 정보 누락 방지"**(완전성). 목적=ontology seed → *파악 못 한 raw 사실*이 없어야. 예=평범한 숫자칸 *숨은 패턴*(잡으면 성과·놓치면 수식 하나 놓친 것).
3. **★효과**: 트리거를 "**구조가 완전한가**"(결정론 구조 사실)로 바꾸면 → read-set이 inventory 순수함수(P1-C2-A를 sound하게 한 그 성질) → **DET-1 부류·2-tier 에포크·triage_attempt 축·allocation census *전부 증발*·3번째 게이트 불요**. **LLM = *분배자* 아닌 *독해자***(골라진 칸서 구조 못잡은 것 capture). = owner "더 읽자·놓치지말자" ∧ 게이트 "결정론 read-set" *수렴*.

⚠️ **절대 금지**: LLM이 *무엇을 읽을지 판단*하게 만들기(read-set을 LLM 출력에 의존). 그게 DET-1 함정이고 게이트가 2회 거부한 것. 트리거는 *결정론*만.

## SSOT
- **이 cut 설계**: `development-records/design/20260628-p1-cut2b-prime-deterministic-capture-design.md`(§6 빌드 순서·§2 트리거·§3 capture·§4 resume·§5 분기점). ← canonical.
- 피벗 *왜*(게이트 2회): `20260628-p1-cut2b-semantic-triage-design.md` §11/§11.1(원안·박제·되살리지 말 것).
- 엔진 SSOT: `20260625-rescoped-comprehension-engine-design.md`(§3.4 triage·§4 resume).
- P1-C2-A 토대: `20260627-p1-cut2-leaf-reader-epoch-design.md`(§11 R1~R11).

## ✅ Step 1 완료 (커밋 `819e867`)
`src/core-runtime/reconstruct/leaf-reader.ts`:
- **`extractStructureLeafEvidence(inventory, opts)`**(leaf-reader.ts:156) = 결정론 트리거. 저신뢰 시트 **무회귀**(P1-C2-A `extractLowConfidenceLeafEvidence` 그대로 포함) + 고신뢰 tabular 시트의 **구조-불완전 InventoryColumn**(`isStructureIncomplete`: 단일상수·empty = trivially-complete skip) 선정·`compareColumnResidualDesc` 우선순위·`max_columns` cap·**정직 `capped_columns` census**(silent drop 0). LLM 0.
- `LeafReadRegionEvidence.trigger`(`low_confidence_header`|`structure_incomplete` = RB8 false-provenance 닫음) + optional 결정론 컬럼신호(name/type/distinct·**raw값 0**). `StructureLeafTriggerOpts`·`DEFAULT_STRUCTURE_LEAF_TRIGGER_OPTS{max_columns:64}`(PRELIMINARY).
- 테스트=`leaf-reader.test.ts`("extractStructureLeafEvidence" describe 3건: 무회귀+skip·residual 우선순위+capped·결정론).

## ▶ Steps 2-4 (mock-first·설계 §6)

### Step 2 — capture 일반화 (label→capture) + mock
`readLowConfidenceLeaf`(leaf-reader.ts:253) → **`readStructureLeaf`** 일반화(또는 확장): LLM이 *구조 못잡은 것* 포착 = 컬럼별 `{tentative_label, semantic_role?(category|measure|identifier|free_text|reference), captured_note?}`. **저신뢰 강제 태깅 유지**(confidence='low'·is_lower_bound=true·non-authoritative). 프롬프트=`LEAF_READ_SYSTEM_PROMPT` 일반화(첫 줄=mock 디스패치 키 안정 유지) + CG-1 카탈로그(`RECONSTRUCT_AUTHORING_PROMPT_CONTRACT.leaf_read`, run.ts) 갱신. **mock 분기**(`mock-llm-realization.ts` `callReconstructMockLlm` "Read provisional column labels..." 분기) capture 반환으로 일반화. **source-safe**(raw값 0). `LeafReadLabel`/`LeafReadProducedResult`(comprehension-artifact.ts) 확장 시 ProvisionalLabelClaim에 role/note 추가(기존 producer/attempt 모델 무변경).

### Step 3 — stage 배선 + resume 회귀 (★resume 모델 P1-C2-A 그대로)
`run.ts` `runSpreadsheetLeafReadStage`(@1421): `extractLowConfidenceLeafEvidence` → **`extractStructureLeafEvidence`**로 교체. **무회귀**(저신뢰 여전히 포함). `capped_columns`는 stage 결과에 운반(Step E 정직 마킹용).
- **resume = P1-C2-A sound 모델 *그대로*** (read-set 결정론이라): 기존 `llm_touch_fingerprint`(llm-touch-fingerprint.ts)가 이미 read-set 포착. **단 트리거 config(`DEFAULT_STRUCTURE_LEAF_TRIGGER_OPTS`)를 fingerprint ⓐ(또는 별도 config digest)에 fold** → max_columns 재튜닝 시 회전(편집→자동회전·value_tile_config 패턴 미러). **2-tier 에포크·allocation census = 절대 도입 금지**(불요·DET-1 근원). resume 회귀 테스트: 트리거 config 변경→fingerprint 회전.
- ⚠️ run.ts는 12k줄·resume 키에 P0 fix 3개 들어감 — surgical·full vitest로 회귀0 확인.

### Step 4 — Step E capture 투영 + 정직 capped 마킹 + 커밋
`run.ts` `observationPromptPayload`(@~6203) `provisionalLabelsByObservation` 채널(P1-C2-A Step E) 일반화: capture(role/note) 투영 + **`capped_columns`를 "not examined (capped)" 정직 마킹**(소비자 over-trust 차단·RB6/RB3 정신). full vitest(baseline **2028**)·정적 게이트 6종(import-boundary·invariant-drift/change·spec-defaults·projection-parity·ts-core) → 커밋.

### 그 다음 = ★분기점 (이 cut 밖·별도)
**101MB 수익인식 워크북(레포 밖·세션 산출물)의 ontology seed가 *제대로* 나오는가** = "추가 읽기가 *정말* 필요한가"의 심판. **실-LLM 필요 → 월 한도/owner 승인 시점**(지금 mock-first). 실제로 불요일 수도(maturation이 충분). owner: "우선 여기까지 구현하고 테스트해보고 싶다."

## 코드 앵커 (HEAD `819e867`)
- 트리거(Step 1·완료): `leaf-reader.ts` `extractStructureLeafEvidence`·`isStructureIncomplete`·`StructureLeafTriggerOpts`.
- capture(Step 2): `leaf-reader.ts` `readLowConfidenceLeaf`·`LEAF_READ_SYSTEM_PROMPT`·`comprehension-artifact.ts` `ProvisionalLabelClaim`/`LeafReadLabel`·`mock-llm-realization.ts` 분기·run.ts `RECONSTRUCT_AUTHORING_PROMPT_CONTRACT`.
- stage/resume(Step 3): `run.ts` `runSpreadsheetLeafReadStage`·`llm-touch-fingerprint.ts` `LlmTouchLayer1PreImage`(ⓐ)·`authoredArtifactReuseMatch.leaf_read_aggregate_fingerprint_sha256`.
- Step E(Step 4): `run.ts` `observationPromptPayload`·`provisionalLabelsByObservation`·`ReconstructDirectiveAuthor.setLeafReadProvisionalLabels`.
- observer 신호(트리거 기반): `spreadsheet-structure-observer.ts` `InventoryColumn`·`columnResidualKey`·`compareColumnResidualDesc`·`PerSheetData`(고신뢰만 columns 채워짐·저신뢰는 value-tile).

## Gotchas
- **결정론 트리거 유지**(LLM이 read-set 결정 금지 = DET-1 함정). resume 모델은 P1-C2-A로 *환원*(2-tier 에포크 불요·3번째 게이트 불요).
- **source-safety**: capture 증거는 aggregate-only(value-tile signature·type·distinct count·name)·**raw 셀값 0**. raw-value 패턴(순차·체크섬)은 *이 cut 밖*(경계 명시).
- **InventoryColumn은 고신뢰 tabular 시트만** 채워짐(`PerSheetData.columns`); 저신뢰는 `columns=[]`라 value-tile 경로(P1-C2-A).
- **mock-first**(월 한도): mock는 capture 무시→실 capture 품질 미측정(분기점=101MB 실검증).
- **trivially-complete의 formula skip 미구현**(Step 1 §2.1 note): 균일수식 컬럼도 현재 읽힘(harmless over-read·cost 무관)·refinement는 후속.
- 검증 baseline: **full vitest 2028 pass**·정적 게이트 6종.

## 포인터
- 빌드 작업: TaskList(B′ Step 2/3/4 = task #15/#16/#17).
- 전체이력: `20260627-p1-c2-resume.md`(P1-C2 START)·`20260626-cut2-resume.md`(de-risk 전체).
- 메모리: [[unified-comprehension-engine-track]](P1-C2-A 완결·P1-C2-B 게이트 2회·P1-C2-B′ 피벗+Step 1 전부 기록)·[[domain-agnostic-no-static-enums]]·[[design-validation-ultracode-onto]]·[[explain-decisions-plainly]](owner=plain outcome).
- ⚠️ **월 한도**=실-LLM sweep/onto review 비용 주의([[effort-calibration-track]]); 빌드는 mock/fixture 우선.
