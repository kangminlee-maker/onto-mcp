# Stage 1′ 설계 v5 — 모델 윈도 인지 단일 문서 투영 예산 (동적·교차검증 2차 수렴·구현 준비완료)

> **상태 (2026-06-16, 메인 루프 author)**: 설계 모드. 코드 미적용. **구현 보류**.
> v1(분해) → ultracode+onto 교차검증 → v2 → 재절단 v3(천장 상향·정적) → 사용자 결정(동적) → ultracode P0 설계 → v4
> → **v4 설계리뷰(ultracode 6차원 18에이전트 + onto 6렌즈 ontology)** 수렴 → **v5**.
>
> **⏸ 구현 보류 (사용자 결정 2026-06-16)**: 설계는 2회 적대 교차검증을 통과해 수렴·구현 준비완료(P0~P6).
> 단, **신규 기능(Stage 1′) 구현 전에 전체 reconstruct 파이프라인 최적화·안정화를 선행**한다. 이 문서는 그 선행
> 작업 후 착수할 **구현 준비완료 설계의 박제**다. 착수 시 §7 P0(브랜치 off 최신 main)부터.
> 트랙 맥락: `development-records/design/20260616-large-input-observation-design.md`. 분기 base: main `77845e7`.
> `file:line`은 그 기준·구현 시 재-grep.

> **결정 한 줄**: 단일 text 문서 seed 투영 예산을 **활성 (provider, model)의 context window에서 보수적으로 파생**한다.
> capture는 모델 무지라 **정적 ceiling**, projection만 동적. overflow는 **2단 신호**(capture 절단 vs 투영 절단)로
> 정직히 표시하고 **투영 절단을 durable 기록**한다. 신규 public observation field 0.

> **v4→v5 수렴(설계리뷰 8클러스터)**: C1 `chars/token≈2`는 비보수적(CJK overflow)→**보수 하한+윈도 분율 마진** /
> C2 overflow 신호 오류(`excerpt_truncated`는 capture 절단만)→**투영 절단=`prompt_content_excerpt_truncated`+durable
> 기록** / C3 예산 lookup을 **(provider, model)** 키로 / C4 **MAX≥FLOOR 불변식+명시값+assert** / C5 G4 엔트리
> 전체경로+`context_window_tokens` linePattern+INV-MODEL-1 / C6 registry는 재사용 핸들 아님→자체 로드+mock→FLOOR /
> C7 윈도값 provenance(인용) / C8 capture ceiling은 재관찰·preview에도 적용·gpt-5.5 기본 seat 동작 변화 명시.

---

## 1. 재절단 근거 — 요약
교차검증(v2)이 드러낸 본질: 선택 없는 분해는 소비자 없는 substrate·cardinality 파급 blast radius(7건). 진짜 갭은
"200K 천장 < 모델 윈도". 분해+선택+maturation 섹션독립성+비용캐스케이드 = Stage 2.

## 2. 목표 · 범위 · overflow 인지
**목표**: 단일 text-readable document를 활성 모델 윈도가 허용하는 한(보수 마진 포함) 절단 없이 관찰·투영해 후반부가
seed 저작에 유입. 예산은 (provider,model)에 따라 자동 스케일.

**범위(포함)**: supported-models.yaml `context_window_tokens`(+provenance·스키마·G4) / 보수적 윈도→char 예산 순수
헬퍼 / `runReconstruct` 1회 계산→투영 하향 / **capture 정적 ceiling vs projection 동적 예산 분리** / **2단 overflow
신호 + 투영절단 durable 기록** / 라이브 A/B(일반 + CJK-밀집 픽스처).

**범위(제외 = 인지하고 진행)**: overflow(len>projection 예산) 회복(=잘린 후반 선택 관찰)은 Stage 2. 분해·섹션
앵커·frontier 섹션선택·maturation 섹션독립성·비용캐스케이드·다문서 breadth = Stage 2.

## 3. 현재 코드 사실 (교차검증 2회 확인)
- **윈도값 부재** → 신설. `SupportedModelEntrySchema`(`supported-models.ts:36-44`, strict)는 provider/model/
  verified_at/`benchmark_evidence_refs`/notes (※ "evidence" 아님). settings `max_tokens`는 출력 cap(`llm-caller.ts:60`).
- **모델은 projection 시점에만**: `runReconstruct`(`reconstruct-api.ts:644-741`)가 `semanticAuthorLlmConfig`
  (provider+model_id) 해소. **capture(`materialize-preparation.ts`)는 모델 무지**(params `:29-34`; `prepareReconstruct`
  `:571-595` settings 미해소).
- **레지스트리는 재사용 핸들 아님**: `:727` `loadSupportedModelRegistry()`는 **live-only(비-mock) 분기의 inline
  인자** — 예산 계산용으로 **별도 로드/hoist 필요**, mock 경로는 미로드 → FLOOR.
- **레지스트리 키 = (provider, model)**: `registry.lookup()` 같은 메서드 없음 → `supported_models.find(e => e.provider
  === p && e.model === m)`(`isSupportedModelRoute`와 동일 페어링).
- `model_id`는 settings 명시 model이면 채워짐(`llm-caller.ts:143/164`; 커밋 semantic_author=gpt-5.5·라이브 opus
  오버라이드). provider-only seat·mock만 미설정 → FLOOR.
- 절단 신호 **2층**: capture `excerpt_truncated = len > excerptLimit`(`materialize-preparation.ts:239`); projection
  `prompt_content_excerpt_truncated`/`_char_limit`(`run.ts:5426-5429`, **prompt payload는 ephemeral**).
- 게이트 `run.ts:5458`(다중문서 bound)·6 opt-in 사이트(`:6079/6345/6397/6606/6661/6739`)·재관찰(`:9223/9317`,
  capture-side)·run.ts:101 `DOCUMENT_EXCERPT_CHAR_LIMIT` import.

## 4. 설계 v5 (동적)

### 4.1 윈도 출처 — supported-models.yaml (rank-1, provenance, G4)
- `SupportedModelEntrySchema`(`supported-models.ts:36-44`)에 optional `context_window_tokens`(양의 정수, 0 거부) +
  **윈도 provenance**(인용; benchmark evidence와 분리 — C7). loader/strict 무변경(optional은 안전, 검증됨).
- `.onto/authority/supported-models.yaml`: gpt-5.5·claude-opus-4-8에 값 + 출처 인용. **윈도+스키마는 같은 PR에 함께**.
- 없는 엔트리/필드 → FLOOR 폴백.
- **G4(C5)**: `check-invariant-change-marker.ts` PROTECTED_TARGETS에
  `{ file: SUPPORTED_MODELS_AUTHORITY_PATH(".onto/authority/supported-models.yaml"), linePattern: /context_window_tokens/, invariants: ["INV-MODEL-1"] }`
  — **window 필드에만** 마커 강제(일반 모델 추가엔 friction 없음). 같은-PR 추가분은 `INVARIANT-CHANGE: INV-MODEL-1 — …`
  마커 동반(chicken-egg 없음, 검증됨). INVARIANT-CHANGE 시 stale 점검: `INVARIANTS.md` G4 표 + `check-invariant-drift.ts`.

### 4.2 예산 파생 — 보수적·(provider,model) 키 (C1·C3·C4·C6)
- `materialize-preparation.ts` 상수(코드 소유, G2 비대상):
  - `DOCUMENT_CAPTURE_CEILING_CHARS`(= 기존 `DOCUMENT_EXCERPT_CHAR_LIMIT` **리네임·상향**; capture 상한 ∧ projection
    clamp 상한). **명시값**(opus 이득 위해 ≫200K, 디스크 bound; 예: 수백만 char).
  - `DOCUMENT_EXCERPT_PROJECTION_FLOOR = 200_000`(회귀 0·fail-soft).
  - `WINDOW_BUDGET_FRACTION`(윈도의 보수 분율, 예 0.6 — **마진을 윈도 비례로**: 고정 char 마진은 비율 오차를 못 막음, C1).
  - `CHARS_PER_TOKEN_LB`(chars/token **하한**, **평균 아님**; CJK-밀집은 chars/token이 낮아 ≈1 또는 그 이하 — 작게 잡아야
    안전. v4 "≈2"는 평균이라 비보수적이었음, C1).
  - `PROMPT_OVERHEAD_RESERVE_CHARS`(지시문+비-excerpt payload+출력 max_tokens 등가 — C1 low).
  - **모듈 로드 assert: `FLOOR <= CAPTURE_CEILING`**(C4; clamp 정합 보장 `capture_ceiling = CEILING >= projection_budget`).
- `export deriveDocumentExcerptProjectionBudget(route: {provider?, modelId?}, registry): number` (순수·단위테스트):
  ```
  if (!route.provider || !route.modelId) return FLOOR;
  const w = registry.supported_models.find(e => e.provider === route.provider && e.model === route.modelId)
              ?.context_window_tokens;
  if (!w) return FLOOR;
  const raw = floor(w * WINDOW_BUDGET_FRACTION * CHARS_PER_TOKEN_LB) - PROMPT_OVERHEAD_RESERVE_CHARS;
  return clamp(raw, FLOOR, DOCUMENT_CAPTURE_CEILING_CHARS);   // FLOOR<=CEILING 보장됨
  ```
  - **(provider, model)** 키(C3). provider/model/window 미상 → FLOOR(mock·provider-only seat 포함, C6).
  - 모델→예산 변환 **단일 지점**(MODEL_LITERAL_RE 회피·G2).

### 4.3 capture vs projection 분리 (C8 정직)
- **capture**: text 문서를 `DOCUMENT_CAPTURE_CEILING_CHARS`까지 캡처(정적). 모델 무지라 ceiling 고정.
  **이 ceiling은 초기 materialize뿐 아니라 재관찰(`:9223/9317`)·`prepareReconstruct` preview capture에도 적용됨**
  (capture-side라 상속; v4 "재관찰 무변경"은 projection 한정으로 정정).
- **projection**: 4.2 동적 예산(`runReconstruct`에서 1회 계산). `effectiveContentExcerptCharLimit`가 expandDocument 시
  하드코딩 ceiling 대신 **threaded 예산** 반환. `capture_ceiling = CEILING >= projection_budget`이라 투영은 캡처분만
  슬라이스(budget>len은 no-op, 무손실; 검증됨).

### 4.4 overflow = 2단 신호 + durable 기록 (C2 — must-fix)
- **capture 절단**: `len > DOCUMENT_CAPTURE_CEILING_CHARS` → `excerpt_truncated=true`(`materialize:239`). 병리적 초대형만.
- **투영 절단**: `projection_budget < len(captured) ` → `prompt_content_excerpt_truncated=true`+`_char_limit=budget`
  (`run.ts:5426-5429`). **흔한 overflow 케이스**(budget<len≤CEILING)는 capture는 완전(`excerpt_truncated=false`)·
  **투영만** 잘림 → done-when은 **투영 신호**를 본다(v4 done-when#2 "excerpt_truncated"는 오류였음).
- **durable 기록(C2/onto issue-002)**: 투영 절단 시 ephemeral prompt payload 외에 **durable 신호**(기존 run-status
  event/record telemetry 패턴 재사용)로 "어느 문서가 몇 char로 예산 초과해 투영 절단됐는지" 기록 + final-output 노출.
  무음 절단 금지·replay 가능. (capture 절단은 기존 final-output footer 경로.)

### 4.5 스레딩 (C6 정정)
1. `runReconstruct`(`reconstruct-api.ts`): **자체 registry 로드(또는 hoist)** → `deriveDocumentExcerptProjectionBudget({provider: semanticAuthorLlmConfig.provider, modelId: semanticAuthorLlmConfig.model_id}, registry)`. mock 분기는 미로드 → FLOOR.
2. → `createDirectCallReconstructDirectiveAuthor`(`run.ts:5926-5940`) optional `documentExcerptProjectionBudget`(기본 FLOOR).
3. → `ObservationPromptPayloadOptions`(`:5340-5352`) `documentExcerptCharBudget` → `observationPromptPayload`(`:5436`)
   → `compactStructuralDataForPrompt`(`:5409`, **시그니처에 예산 추가**) → `effectiveContentExcerptCharLimit`(`:5393`,
   expandDocument 시 예산 반환; 미전달→FLOOR). 기존 무-예산 호출자는 FLOOR 기본으로 무영향(회귀 test `run.test.ts:584`
   FLOOR≥2760 충족).
4. 6 opt-in 사이트에 `documentExcerptCharBudget` 추가. 게이트(`:5458`)·재관찰 projection 무변경.
5. **run.ts:101 `DOCUMENT_EXCERPT_CHAR_LIMIT` import 제거**(예산 threading 후 미사용, low). import 경계(G1) 안전.

## 5. 개념 경제 · INVARIANT
| 항목 | 처리 | 표면 |
|---|---|---|
| 모델 윈도값+provenance | supported-models.yaml(rank-1)+스키마 optional 2필드 | authority 필드 2(승인·G4 보호) |
| char 예산·튜닝 | 코드 상수(CEILING·FLOOR·FRACTION·CPT_LB·OVERHEAD)+순수 헬퍼+load assert | 코드 소유 |
| 투영 예산 전달 | `documentExcerptCharBudget`/`documentExcerptProjectionBudget`(내부 파라미터) | 내부 2(public observation field 0) |
| 투영절단 durable 기록 | 기존 run-status/record telemetry 재사용 | telemetry 1(overflow 정직 필수) |
| capture 절단 | 기존 `excerpt_truncated` | 신개념 0 |

- **G2/INV-CFG-1 무위반**(검증): char 예산·튜닝상수 코드 소유, 모델 리터럴 미하드코딩. **INV-MODEL-1**: window는 모델
  레지스트리 SSOT·provenance 인용. **G4**: supported-models.yaml window 보호(C5). 나머지 INVARIANT 무접촉.

## 6. done-when / 검증
### 6.1 done-when
1. 단일 text 문서 **200K<len≤projection 예산**: 통째 캡처+투영, `excerpt_truncated=false`·`prompt_content_excerpt_truncated=false`, 후반 seed 유입.
2. **예산<len≤CEILING**: capture 완전(`excerpt_truncated=false`), **투영 절단**(`prompt_content_excerpt_truncated=true`+`_char_limit=예산`)+durable 기록+final-output 노출. (v4 오류 정정.)
3. **len>CEILING**: `excerpt_truncated=true`(capture 절단) ∧ 투영 절단. 둘 다 정직 표시.
4. **동적**: 예산이 (provider,model) 윈도 반영(opus → ≫200K, `FLOOR<예산<CEILING`). provider/model/window/mock 미상 → FLOOR.
5. **무변경 보존**: 게이트 다중문서 bound·post-seed bound 불변(예산은 expandDocument에만).
6. **라이브 A/B**: 일반 픽스처(200K<len≤예산) + **CJK-밀집 픽스처**(C1 — 보수 방향 실증·미overflow)로 opus 실행. model_id/provider 채워짐 확인. gpt-5.5 기본 seat 윈도 큐레이션 동작도 확인(C8).
7. static+unit green, G1/G2/G4/G7 clean(G4 마커 동반).

### 6.2 검증 계층
- **unit(헬퍼)**: (provider,model)+window→`clamp(floor(w*FRACTION*CPT_LB)-OVERHEAD, FLOOR, CEILING)`; window<예산→FLOOR clamp; window 큼→CEILING clamp; provider/model/window/route 미상→FLOOR; **load assert FLOOR≤CEILING**; never throw.
- **unit(capture)**: text 문서 CEILING까지·초과 시 `excerpt_truncated`·≤200K 무변경·바이너리 small·재관찰/preview도 CEILING.
- **unit(projection, `observationPromptPayload` 회귀 확장)**: 예산 B 단일문서→B까지·`예산<len`→`prompt_content_excerpt_truncated`+durable 기록·미전달→FLOOR·다중문서/혼합→bound·바이너리 비확장.
- **schema/loader(`supported-models.test.ts`)**: `context_window_tokens`+provenance 있는/없는 로드·0/음수 거부·strict·G7.
- **static**: typecheck·lint·vitest·G1·G2·G4·G7.
- **라이브 A/B(done-when 6)**: 일반 + CJK-밀집 픽스처. `scripts/reconstruct-claude-live-document-e2e.mts` 적응(opus/medium, ~50분, 실 비용). 예산 미초과·후반 유입 확인, 필요시 CPT_LB·FRACTION·OVERHEAD 보정.

## 7. 구현-프로세스
| # | 작업 | 의존 | 검증 |
|---|---|---|---|
| P0 | 새 브랜치(off `77845e7`) | — | — |
| P1 | `supported-models.ts` optional `context_window_tokens`+provenance + `.yaml` 값(인용) + **G4 엔트리(full path·linePattern·INV-MODEL-1)** + INVARIANTS/drift 표 + 마커 | P0 | `supported-models.test.ts`·G4·G7 |
| P2 | `materialize-preparation.ts` 상수(CEILING 리네임·상향·FLOOR·FRACTION·CPT_LB·OVERHEAD)+**load assert**+`deriveDocumentExcerptProjectionBudget((provider,model) 키)`+capture ceiling·doc-comment | P0 | 헬퍼·capture unit |
| P3 | `reconstruct-api.ts` runReconstruct 자체 registry 로드+예산 1회 계산(provider+model_id)·mock→FLOOR·author 전달 | P1·P2 | — |
| P4 | `run.ts` author args·`ObservationPromptPayloadOptions`·compact/effective 시그니처·6 opt-in·**run.ts:101 import 제거**·**투영절단 durable 기록** | P2·P3 | projection 회귀·durable 기록 |
| P5 | 전체 static(typecheck/lint/vitest/G1·G2·G4·G7) | P1-P4 | green |
| P6 | 라이브 A/B(일반+CJK-밀집)·model_id/provider 확인·gpt-5.5 기본 seat·예산 보정 | P5 | done-when 6 |

### 리뷰 게이트
- (완료) v1→v3 교차검증 + P0 ultracode + **v4 설계리뷰 ultracode+onto(8클러스터→v5)**. 잔여 material 0 목표.
- 구현 후 self → 구현 PR **Codex 리뷰**.

### 재설계 트리거
- CJK-밀집 라이브에서 보수 예산조차 overflow → CPT_LB↓/FRACTION↓ 또는 실 토큰 카운트 도입 검토.
- OAuth claude seat이 provider/model_id 미설정(동적 무력) → durable telemetry 노출+정적 보수 상수 폴백 재검토.

## 8. 범위-정직 한계
- **overflow(len>projection 예산) 회복 미해결**: 2단 신호로 정직 표시·durable 기록. 회복(잘린 후반 선택 관찰)=Stage 2. **인지하고 진행.**
- **capture ceiling 디스크**: 단일 문서 capture가 CEILING까지(재관찰·preview 포함) → 대형 text 다수 디렉터리 아티팩트 비대 가능(디스크, 윈도 아님). CEILING이 절대 bound. MVP 수용.
- **gpt-5.5 기본 seat 동작 변화**: 윈도 큐레이션이 기본 경로 투영 예산도 변경(opus만 아님) — A/B에서 함께 확인.
- **토큰 근사**: CPT_LB는 하한 근사. CJK-밀집 픽스처로 검증·보정. 실 토크나이저는 미도입(후속).
- **cq-13 섹션 provenance·진짜 윈도 초과 단일 문서**: 선택 필요 → Stage 2.

## 9. 결정 로그
1. 분해 기각 / 2. 천장 상향 / 3. 동적 윈도 연동(사용자) / 4. capture·projection 분리(capture 모델 무지).
5. 윈도=`context_window_tokens`+provenance(supported-models.yaml)+코드 chars/token(사용자) / 6. G4 보호(사용자, window 필드 scoped).
7. **(provider,model) 키**(C3) — 레지스트리 키 정합. 8. **chars/token 하한+윈도 분율 마진**(C1) — CJK overflow 방지(2는 평균이라 비보수적).
9. **2단 overflow 신호+투영절단 durable 기록**(C2) — `excerpt_truncated`는 capture 절단만; 흔한 overflow는 투영 신호. 무음 금지.
10. **MAX≥FLOOR 불변식+명시값+load assert**(C4) / 11. registry 자체 로드·mock→FLOOR(C6) / 12. capture ceiling은 재관찰·preview에도 적용(C8 정직).
13. 분해+선택+maturation 섹션독립성+비용캐스케이드 → Stage 2.
