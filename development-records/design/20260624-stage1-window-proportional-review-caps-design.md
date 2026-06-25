# Stage 1 — window-proportional review prompt budget (design spec, v2 교차검증 반영)

> 상위 SSOT: [20260622-onto-review-depth-aware-multiagent-redesign.md](20260622-onto-review-depth-aware-multiagent-redesign.md) §8 Stage 1 + [20260623-spreadsheet-semantic-projection-design.md](20260623-spreadsheet-semantic-projection-design.md) §5.
> Baseline: main `ad99f7e`. 성격: **review 프롬프트 예산을 모델 context window에 비례 — floor=현재값(무회귀)**.
> 교차검증: ultracode `wf_22fd6c4f-64a`(27 agent, 13 confirmed). **결과로 타깃·배선·정직성 대폭 교정**(v1은 item 캡만 봤고 threading source가 틀렸음). 사용자 결정 = **A 교정된 window-비례**(2026-06-24).
> 줄 번호: 작성 시점 기준, 식별자로 재확인.

## 1. 문제 / 가치 (정직)

review가 스프레드시트를 받으면 lens 패킷에 구조 인벤토리 뷰가 임베드된다. 그 뷰는 **두 제약**을 순서대로 통과:
1. **item 캡** `projectInventoryForPrompt`(max_sheets 50·max_columns 64·max_formula_patterns 200…, `spreadsheet-structure-observer.ts:2410-2425`) — 배열 SIZE 한정.
2. **embed 컷** `truncateForEmbedding(text, maxEmbedLines)` (`materialize-review-prompt-packets.ts:1170`), `DEFAULT_MAX_EMBED_LINES = 300`(`:321`) — **패킷 임베드를 300줄로 하드컷**. ★이게 lens가 실제 보는 양을 결정하는 **진짜 binding 제약**이고 **window-비례 아님**.

→ **둘 다 고정값이라 1M-window 모델(gpt-5.5·opus)도 300줄/DEFAULT 캡으로 인위적 제한.** 가치 = 큰 window 모델이 큰 워크북을 더 온전히 봐서 더 완전한 review. floor=현재값이라 model-unaware/소형 window run은 불변(무회귀).

**★레지스트리 현실(교차검증 finding 7/13)**: `supported-models.yaml`에 등록 모델은 gpt-5.5(1.05M)·opus(1.0M) **둘 다 ~1M뿐, 128K 없음**. → "1M vs 128K" 서사는 허구. **즉각 실효 = ~1M seat이 고정 300줄/DEFAULT보다 큰 예산을 받음**; window-비례 기계는 **미래 다른-window 모델 대비**(forward-looking). 따라서 비례 상수(MAX/FRACTION)는 floor 아래가 아니라 **현재 등록 모델 전부가 밟는 live 운영값** — 실 product/cost 무게가 있고 calibration(INV-BENCH-1)은 **실 후속 의무**(floor가 면제 못 함).

## 2. precedent — 미러 대상 (동일 (route, registry) 시그니처)

reconstruct 문서 excerpt 예산: `deriveDocumentExcerptProjectionBudget(route, registry)`(`reconstruct/materialize-preparation.ts:352`), 호출 패턴 `reconstruct-api.ts:703-716`:
```
window = registry.supported_models.find(provider===route.provider && model===route.modelId)?.context_window_tokens
raw    = floor(window × FRACTION × CHARS_PER_TOKEN_LB) − RESERVE
budget = clamp(raw, FLOOR=기존고정, CEILING)
```
- **route = MODEL provider+modelId**(registry 키: openai/anthropic) — 런타임 어댑터 provider(codex_cli/claude_code) 아님. ★v1 오류였음(finding 1).
- model 미해결/미등록/window 없음 → FLOOR(무회귀). "SINGLE model→budget 변환점(G2/INV-CFG-1)".

## 3. 설계

### 3.1 단일 변환점 + 두 소비자 (concept economy, finding 11)

observer/공유 레이어에 **단일 (route, registry)→window→multiplier 변환점**, 두 소비자가 공유:

```ts
// 단일 변환점 (registry lookup + FLOOR fall-through 1곳 소유 — 정밀 precedent와 동형)
function resolveReviewContextWindowTokens(route: {provider?; modelId?}, registry): number | undefined;
function reviewWindowMultiplier(contextWindowTokens: number | undefined): number;
  // = clamp(contextWindowTokens / BASELINE_WINDOW_TOKENS, 1, MAX_WINDOW_MULTIPLIER); undefined→1

// 소비자 1 — embed 예산 (진짜 binding 레버; generic, 전 material kind)
function deriveReviewMaxEmbedLines(multiplier: number): number;
  // = clamp(round(DEFAULT_MAX_EMBED_LINES × multiplier), DEFAULT_MAX_EMBED_LINES, MAX_EMBED_LINES_CEILING)

// 소비자 2 — 스프레드시트 item 캡 (큰 embed 예산을 채울 수 있게 tandem)
function deriveWorkbookInventoryPromptCaps(multiplier: number): WorkbookInventoryPromptCaps;
  // caps[dim] = ceil(DEFAULT[dim] × multiplier); multiplier=1 → DEFAULT (floor, 정수×1=정수)
```
- **multiplier=1**(undefined·window≤BASELINE) → embed=300·caps=DEFAULT = **무회귀**(floor; ceil/round(x×1)=x).
- 모든 dim/embed 동일 multiplier → 상대 비율(projection shape) 보존, 크기만 window 스케일.
- model 리터럴은 변환점 밖(route는 registry-해석된 provider/modelId) → 튜닝 상수에 안 닿음(INV-CFG-1/G2).
- `BASELINE_WINDOW_TOKENS`·`MAX_WINDOW_MULTIPLIER`·`MAX_EMBED_LINES_CEILING` = PRELIMINARY(§1대로 live값) — floor=무회귀이나 calibration은 실 후속(INV-BENCH-1).

### 3.2 threading (교정 — prepare-side 해석, registry-키 provider, min-window)

★v1 오류: `executionRoute`(어댑터 provider, render 호출과 다른 함수)를 가리킴 → 항상 undefined→DEFAULT=영구 no-op(finding 1/4/6).

교정 경로:
1. **prepare-review-session.ts**(ontoConfig·route·registry in scope; `:345` 호출처)에서 **참여 lens-class 유닛들의 모델**을 enumerate(`effectiveExecutionUnitLlm` `review-execution-profile.ts:185-188`, settings `units.<id>.llm` `settings-chain.ts:1342`) → 각 (provider, model_id) → registry window 해석 → **min context_window over lens units**(finding 9: min-window만이 어떤 lens도 overflow 안 함; floor가 worst-case 안전) → `reviewWindowMultiplier`.
2. `MaterializeReviewExecutionPreparationArtifactsParams`(`materializers.ts:123-139`)에 **`reviewPromptBudget?: { maxEmbedLines, inventoryCaps }`**(또는 multiplier) 필드 추가(params 확장 — 현재 materialize 함수엔 모델 미존재, finding 4/6).
3. materialize가 그 예산을 두 렌더 경로로 전달(§3.4). 해석 실패 → undefined → DEFAULT(무회귀).

### 3.3 공유 렌더러 일관성 (finding 3/8/10)

`renderSpreadsheetStructuralView`는 **공유 leaf `readTextOrDirectoryListing`**(`review-artifact-utils.ts:491`)를 통해 두 곳서 도달:
- `renderTargetSnapshot`(`materializers.ts:1547`) → `target-snapshot.md`
- `renderReviewTargetMaterializedInput`(`:1558`) → `materialized-input.md`

오늘 둘은 **byte-동일**(같은 full item-capped 렌더). item 캡을 한쪽만 스케일하면 분기 → **공유 leaf에 캡을 threading해 둘 다 동일 캡**(byte-일관 유지). embed 컷(maxEmbedLines)은 **패킷 임베드**(`materialize-review-prompt-packets.ts:1170`)에만 적용(두 .md 파일은 full 렌더라 무관) → 거기에 window-비례 maxEmbedLines 전달.

### 3.4 범위 = review-only (reconstruct 근거 교정, finding 5)

`projectInventoryForPrompt`는 review + reconstruct(`run.ts:5749,5884`) 공유. 이번 슬라이스는 **review만**. reconstruct는 DEFAULT 유지 — ★근거 교정: resume-hash가 캡을 담아서가 **아니라**(`sourceObservationsReuseSha256`는 **full 영속 인벤토리**를 해시, projection 캡은 거기 없음), **seed 품질 재현성/atomicity** 때문. 그리고 **deferred reconstruct 슬라이스의 추가 의무 기록**: reconstruct가 window-스케일 projection을 채택하면 resume-reuse 해시가 **projection 예산까지 커버**해야(현재 미커버 → window 변경이 stale seed를 무효화 못 함). derive 함수는 공유.

### 3.5 mirror-parity 보존

`projectInventoryForPrompt` **로직 무변경** — cap 값만 derive. truncation 공개(`sections`) 정확 유지. `projectInventoryForAdmission`(누수 차단) 무접촉. 전용 parity G-가드 없음(확인: `check-prompt-projection-parity`는 reconstruct `prompt_projection_contracts`만).

## 4. 검증 (no-op 방지 — finding 1/13)

- **단위**: `reviewWindowMultiplier`(undefined→1·window≤BASELINE→1·큰 window→스케일·거대→MAX clamp) / `deriveReviewMaxEmbedLines`(multiplier=1→300 floor·스케일·CEILING) / `deriveWorkbookInventoryPromptCaps`(multiplier=1→DEFAULT·스케일·shape 비율). **합성 sub-baseline window**로 gradient 입증(레지스트리에 소형 모델 없음, finding 13).
- **POSITIVE E2E(핵심)**: ~1M lens 모델로 prepare→materialize→packet 실행 시 **embed 예산·캡이 DEFAULT보다 큼**을 실 진입점서 입증(no-op 아님 확인, finding 1). + **min-window 다중 lens 모델** 시 최소 window 적용.
- **무회귀**: model-unaware run → embed 300·DEFAULT 캡, materialized-input·target-snapshot byte-동일.
- 전체 vitest + 가드(import-boundary·mcp:review·invariant-drift) + ts-core. blast radius=공유 observer → review·reconstruct 양 스위트 green.
- **INV-BENCH-1**: 품질/예산 수치 주장은 fixtures≥2×runs≥3 시에만 결정-등급; MAX/FRACTION은 live값이라 calibration이 실 후속 의무. floor=무회귀.

## 5. 미결 / 리스크

- **BASELINE·MAX·FRACTION·CEILING**: PRELIMINARY·**live 운영값**(§1; 전 등록 모델이 밟음). floor가 무회귀를 보장하나 "얼마나 키울지"의 적정값은 라이브 벤치 후속(INV-BENCH-1). → 초기값은 보수적으로(예: window 헤드룸의 일부만), 교차검증/벤치가 정밀화.
- **embed 예산 단위(lines)**: 문서 precedent는 char 예산, 여기는 line 예산(`truncateForEmbedding`이 line 단위). multiplier 동형으로 처리, char-정밀 대신 line-비례(단순·일관).
- **reconstruct 비대칭·추가 의무**: §3.4. 후속 reconstruct 슬라이스가 resume-hash 커버리지와 함께 정렬.
- **다중 lens 모델**: min-window 선택(§3.2) — 보수적·안전(어떤 lens도 overflow 안 함).
