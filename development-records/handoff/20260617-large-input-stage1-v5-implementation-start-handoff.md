# Handoff — large-input Stage 1′ v5 구현 착수 (윈도-파생 단일문서 투영 예산)

> 목적: `/clear` 직후 fresh context에서 **Stage 1′ v5 구현(P1~P6)** 을 바로 시작하기 위한 출발점.
> **설계는 이미 박제·구현준비완료** — 이 핸드오프는 "어디서부터·현재 코드 어디" 만 잡는다.
> `file:line`은 main `08a0fc1` 확인값. 시작 시 핵심만 재-grep.

## 0. 권위 문서 (이 순서로 읽기)
1. **설계 SSOT(구현 사양)**: `development-records/design/20260616-large-input-stage1-design.md` = **v5, 구현준비완료**.
   §4 설계·§6 done-when·§7 P0~P6 구현프로세스가 정본. 이 핸드오프와 충돌 시 **설계 doc이 우선**(단 file:line은 아래 정정값).
2. 트랙 맥락: `development-records/design/20260616-large-input-observation-design.md`.
3. 메모리: `large-input-observation-track`(v5 수렴 전체), `reconstruct-pipeline-stabilization`(#8 캐싱 종결 맥락).

## 1. 한 줄 요지
단일 **text-readable** 문서의 seed **투영(projection) 예산**을 활성 **(provider, model)** 의 context window에서
**보수적으로 파생**한다. **capture는 모델 무지 → 정적 ceiling**, projection만 동적. overflow는 **2단 신호**
(capture 절단 vs 투영 절단) + **투영 절단 durable 기록**. **신규 public observation field 0**. 분해·선택·다문서 breadth = Stage 2.

## 2. 트랙 상태
- **P0 완료**: 브랜치 **`feat/large-input-stage1-window-budget`** 생성(off main `08a0fc1`, 빈 브랜치). `/clear` 후 repo는 이 브랜치 위. 바로 P1 착수.
- 선행 안정화(#1~#10)·v0.4.12 릴리스 완료. **#8 prompt caching은 종결(PR #83 CLOSED·미머지)** — callAnthropic-레벨 cache_control은 system·user 둘 다 앞쪽 per-call volatile이라 net-harmful; 캐싱은 프롬프트 재구조화(Stage 2/전용 패스)로 연기. **Stage 1′ v5에 캐싱 미포함**(v5=윈도 예산, 캐싱=블록화, 다른 축).

## 3. 현재 코드 앵커 (main `08a0fc1` 재-grep 확정 — 설계 base `77845e7`에서 이동)
- **상수/투영(materialize-preparation.ts)**: `DOCUMENT_EXCERPT_CHAR_LIMIT = 200_000` **:195**; capture 사용 **:215**;
  `textStats(ref, excerptLimit)` **:220**(content_excerpt **:233**, `excerpt_truncated = text.length > excerptLimit` **:234**);
  엔트리 캡처 **:307-308**. **kind-aware 예산 헬퍼는 :211-215 부근**(document→DOCUMENT_EXCERPT_CHAR_LIMIT 반환).
- **투영(run.ts)**: import **:102**; `ObservationPromptPayloadOptions`(`expandSingleDocumentExcerpt?`) **:5347/5358**;
  `effectiveContentExcerptCharLimit(...)` **:5400**(`return DOCUMENT_EXCERPT_CHAR_LIMIT` **:5411**);
  `compactStructuralDataForPrompt(...)` **:5416**(limit 계산 :5424, `prompt_content_excerpt_truncated=true` **:5435**);
  `observationPromptPayload(...)` **:5443**, 게이트 `options.expandSingleDocumentExcerpt === true && observations.length <= 1` **:5465**;
  **6 opt-in 사이트** `expandSingleDocumentExcerpt: true` = **:6089 / :6355 / :6407 / :6616 / :6671 / :6749**;
  author 정의 `createDirectCallReconstructDirectiveAuthor` **:5936**; `runReconstruct` **:9886**.
- **author 생성 호출부(=P3 budget 계산 위치)**: **`src/core-api/reconstruct-api.ts:732`** `createDirectCallReconstructDirectiveAuthor({...})`.
  이 파일은 이미 **`loadSupportedModelRegistry`(import :54)·`resolveLlmProviderConfig`(:58)·author(:31)** 보유.
  ※ 설계의 "reconstruct-api.ts:644-741"은 이 파일(`src/core-api/`)이 맞음. author는 **runReconstruct 외부(여기)에서 생성·주입** → budget 계산도 여기.
- **레지스트리 스키마(supported-models.ts)**: `SupportedModelEntrySchema` **:36-44**(`.strict()`: provider/model/verified_at/
  `benchmark_evidence_refs`/notes?); `loadSupportedModelRegistry()` **:95**. yaml = `.onto/authority/supported-models.yaml`(gpt-5.5·claude-opus-4-8 2엔트리).
- **G4 가드**: `scripts/check-invariant-change-marker.ts` `PROTECTED_TARGETS` **:34**(배열 `{file, linePattern, invariants}`). 기존 엔트리 패턴은 :36~ 참조.

## 4. 데이터 의존성 — 윈도 provenance (P1 착수 전 해결)
`context_window_tokens`는 **출처 인용 동반**(설계 C7, benchmark evidence와 분리).
- **claude-opus-4-8 = 1,000,000 (1M)** — Anthropic 공식(platform.claude.com models overview; claude-api skill 확인). 인용 가능.
- **gpt-5.5 = 미확정** — 권위 출처 필요. **WebFetch OpenAI 문서**로 확인하거나, 출처 없으면 **윈도 필드 생략 → FLOOR 폴백**(정직).
  gpt-5.5는 기본 seat(semantic_author)라 done-when#6 라이브가 "기본 seat 윈도 큐레이션 동작"을 확인 → 값 있으면 더 좋음.

## 5. P1~P6 (설계 §7; 위 앵커로 정정)
- **P1** `supported-models.ts` 스키마에 optional `context_window_tokens`(`z.number().int().positive().optional()`) +
  provenance(예 `context_window_provenance: z.string().min(1).optional()`) → `.yaml`에 값+인용(claude-opus 1M 확정; gpt-5.5 §4) →
  **G4 엔트리**(`{file: ".onto/authority/supported-models.yaml", linePattern: /context_window_tokens/, invariants:["INV-MODEL-1"]}`)
  + INVARIANTS.md G4 표 + check-invariant-drift 표 + **같은-PR `INVARIANT-CHANGE: INV-MODEL-1 — …` 마커**. 검증: `supported-models.test.ts`(있는/없는·0·음수 거부)·G4·G7.
- **P2** `materialize-preparation.ts`: `DOCUMENT_EXCERPT_CHAR_LIMIT`→**`DOCUMENT_CAPTURE_CEILING_CHARS`(리네임·상향, ≫200K 명시값)** +
  `DOCUMENT_EXCERPT_PROJECTION_FLOOR=200_000`·`WINDOW_BUDGET_FRACTION`(예 0.6)·`CHARS_PER_TOKEN_LB`(하한, CJK≈1)·`PROMPT_OVERHEAD_RESERVE_CHARS` +
  **모듈 로드 assert `FLOOR <= CAPTURE_CEILING`** + `export deriveDocumentExcerptProjectionBudget({provider?, modelId?}, registry): number`
  (설계 §4.2 식; (provider,model) 키 `find(e=>e.provider===p && e.model===m)`; 미상→FLOOR; clamp(raw, FLOOR, CEILING); never throw).
  capture는 CEILING 사용(재관찰·preview 포함, C8).
- **P3** `src/core-api/reconstruct-api.ts:732` author 생성부: registry 로드(이미 import)+`resolveLlmProviderConfig`로 (provider, model_id) 해소 →
  `deriveDocumentExcerptProjectionBudget(...)` **1회 계산**(mock/provider-only→FLOOR) → `createDirectCallReconstructDirectiveAuthor`에 `documentExcerptProjectionBudget` 전달.
- **P4** `run.ts`: author args에 `documentExcerptProjectionBudget`(기본 FLOOR) → `ObservationPromptPayloadOptions.documentExcerptCharBudget` →
  `compactStructuralDataForPrompt`/`effectiveContentExcerptCharLimit` **시그니처에 예산** (미전달→FLOOR; expandDocument 시 예산 반환) →
  **6 opt-in 사이트**에 budget 전달. 게이트(:5465)·재관찰 projection 무변경. **import :102 제거**(threading 후 미사용).
  **투영 절단 durable 기록**(C2): `prompt_content_excerpt_truncated` 시 ephemeral prompt 외 durable 신호(기존 run-status/record telemetry 재사용)+final-output 노출.
- **P5** 전체 static: typecheck·lint·**전체 vitest**·G1·G2·G4·G7 green. 회귀 `run.test.ts`(FLOOR≥기존값 충족 확인).
- **P6** **유료 라이브 A/B**(일반 + **CJK-밀집** 픽스처, opus/medium ~50분, `scripts/reconstruct-claude-live-document-e2e.mts` 적응).
  **착수 전 사용자 확인**(비용). done-when#6: 예산 미초과·후반 seed 유입·model_id/provider 채워짐·gpt-5.5 기본 seat 동작.

## 6. done-when 요약 (설계 §6.1)
① 200K<len≤예산: 통째 투영, 두 신호 false, 후반 유입. ② 예산<len≤CEILING: capture 완전·**투영 절단 신호+durable 기록**.
③ len>CEILING: 두 신호 다 true. ④ 동적(opus≫200K, 미상→FLOOR). ⑤ 게이트 다중문서·post-seed bound 불변. ⑥ 라이브 A/B. ⑦ static+G1/G2/G4/G7.

## 7. 개념경제·INVARIANT (설계 §5)
authority 필드 2(window+provenance, G4 보호) / char 예산·튜닝은 **코드 소유**(G2/INV-CFG-1 비대상 — 모델 리터럴만 금지, MODEL_LITERAL_RE 회피) /
내부 파라미터 2(public observation field 0) / telemetry 1(투영절단 durable). **INV-MODEL-1**: window는 모델 레지스트리 SSOT+provenance. 나머지 INVARIANT 무접촉.

## 8. 리뷰·워크플로
- 구현 후 self-review → 구현 PR **Codex 리뷰**(`@codex review`; 결과 채널 비일관 — issue 코멘트+reviews 양쪽 폴링, `>트리거시각` 필터). clean이면 squash 머지+`--delete-branch`.
- 커밋 끝 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. PR 본문 끝 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- CLAUDE.md "설계" 모드 종료: 설계 승인됨(사용자) → 구현 진행.

## 9. 범위-정직 한계 (설계 §8)
overflow(len>예산) 회복 미해결(2단 신호로 정직 표시·durable 기록; 회복=Stage 2). capture CEILING 디스크 bound(MVP 수용).
gpt-5.5 기본 seat 동작 변화(A/B 확인). CPT_LB 하한 근사(실 토크나이저 후속). cq-13 섹션 provenance·진짜 윈도초과 단일문서=Stage 2.
