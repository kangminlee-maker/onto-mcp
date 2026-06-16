# Handoff — large-input 관찰 Stage 1 설계 시작점

> 목적: fresh context(`/clear` 직후)에서 **large-input 관찰 Stage 1 설계**를 바로 시작하기 위한 출발점.
> 이 문서는 설계 시작 안내일 뿐, authority가 아니다. authority/상세는 아래 설계 문서가 소유한다.
> `file:line`은 2026-06-16 머지 후(main `eb6d485`) 확인값 — Stage 0 편집으로 자주 shift하니 **구현/설계 시 재-grep**.
>
> ⚠️ **SUPERSEDED (2026-06-16)**: 이 핸드오프의 §2~§5(섹션 분해·dedup 키 변경 중심 framing)는 **폐기**됐다.
> 설계는 ultracode+onto 교차검증으로 **분해를 기각**하고 **천장 상향(모델 윈도 인지 동적 투영 예산)**으로 재절단됐다
> (분해는 선택 소비자 없이 blast radius만 키움; 진짜 갭은 "200K 천장 < 모델 윈도"). 분해+선택은 Stage 2로 이관.
> **현재 authority = `development-records/design/20260616-large-input-stage1-design.md` (v5, 구현 보류)**. 이 핸드오프는
> 역사적 출발점 기록으로만 보존한다.

## 0. 가장 먼저 할 일
1. **설계 문서 정독**: `development-records/design/20260616-large-input-observation-design.md`
   (§5 두 스케일 축 · §6 Stage 0~2 로드맵 · §7 개념 경제 매핑 · §8 리스크). Stage 1은 §6.1·§5 축 A.
2. 메모리 `large-input-observation-track.md` 확인(트랙 전체 맥락·RLM 리서치 결론).
3. CLAUDE.md **"설계" 모드**: 고수준 설계 + 구현-프로세스 설계 → 계획 승인 후 구현. 지금은 설계만.

## 1. 현재 상태 (어디까지 왔나)
- **Stage 0(절단 제거) MERGED**: PR #65 → main `98743aa`, 맵 갱신 PR #66 → main `eb6d485`. vitest 102 files/1130 passed, G1/G2/G6 green.
- Stage 0가 한 일: 관찰 `content_excerpt` 예산 kind-aware — text-readable document(.md/.txt/.adoc) 전체 캡처(200K ceiling), seed-authoring 프롬프트+**단일** document 관찰일 때만 전체 투영. **단일 문서, 윈도 내**가 대상이었다.
- **Stage 1 = 다음**. 축 A(intra-document 깊이): 윈도 초과 단일 문서를 섹션 단위로 분해.

## 2. Stage 1 범위 (설계 문서 §6.1)
**구조 우선 결정적 분해**(heading/markdown/빈줄 문단)로 document를 **다중 inventory_unit + 다중 observation**으로,
각 관찰에 **섹션 앵커**(`observation.location`). 구조가 부재/모호한 곳에만 LM 경계 결정(RLM 최소 차용).
provenance: 각 관찰을 `file#section` 앵커로 고정 → cq-13(진술→섹션 provenance) 동반 해소.

## 3. 핵심 구조 편집 지점 (현재 main 기준, 재-grep 필수)
- **observation.location**: `materialize-preparation.ts:264` `const location = detection.ref;` — 현재 location=파일경로.
  Stage 1: location에 섹션 앵커. `stableObservationId({sourceRef, location})`(`:58`/`:276`)가 **이미 location을 해시 키로 사용** → 앵커만 구분되면 observation_id가 자동으로 섹션별로 갈린다. (관찰 정체성 모델은 이미 준비됨.)
- **inventory 단위**: `inventoryUnitForMaterial("document")`는 **이미 `"section_heading_or_document_unit"`**(`:125`) — 개념상 섹션 단위로 명명돼 있으나, 현재 inventory는 **파일당 1 unit**(`:371`). Stage 1: 섹션-granular emit.
- **★ dedup 키 변경(메인 invariant-touching 편집)**: frontier coverage가 **파일 단위**다 — `observedSourceRefs`를 `path.resolve(source_ref)`로만 dedup해 같은 파일 재관찰을 거부.
  - 현재 사이트(재-grep `observedSourceRefs`): `run.ts:9208`(`if (observedSourceRefs.has(resolvedSourceRef)) continue;`), maturation-closure observe의 "already observed before re-entry" throw(9208 인근 함수 다음 블록), `:4355`/`:4361`, helper `observedSourceRefsForObservationIds(:3399)`.
  - Stage 1: 키를 `source_ref + location(앵커)`로 → 같은 파일의 다른 섹션을 별개로 관찰 허용.
  - 이건 **coverage-tracking 불변식의 의미 확장** → `INVARIANTS.md` 확인 + **G4 INVARIANT-CHANGE 마커** 필요 여부 판단(닿는 INV id 포함).
- **Stage 0 헬퍼 재사용**: `isTextReadableDocumentExtension`(`:209`)·`structuralExcerptCharLimit`(`:218`)·`DOCUMENT_EXCERPT_CHAR_LIMIT`(`:200`). 섹션 분해는 **text-readable document에만** 적용(바이너리는 Stage 0대로 small/추출).

## 4. 개념 경제 (설계 문서 §7)
신개념 최소화: `source_observation`(location 앵커 확장)·`source_inventory`(섹션 단위)·`source_frontier`(선택)·provider cascade 재사용.
신설 후보가 생기면(예: 섹션 앵커 필드 스키마, coverage ledger) 정당화·INVARIANT 영향 점검.

## 5. done-when / 검증 (설계 문서 §6.1)
- 윈도 초과(또는 Stage 0 단일관찰로 부족한) 문서가 **N개 섹션 관찰로 분해**되고, frontier가 섹션 커버리지를 구동,
  seed-readiness가 안정적으로 actor/object_data 도달. **Stage 0 baseline을 이겨야** 정당화.
- 라이브 A/B: Stage 0가 200K cap/단일관찰로 다룬 큰 문서를 섹션 분해로 더 완전히 관찰(완주·뒷부분 유입·provenance).
  재현기 참고: `scripts/reconstruct-claude-live-document-e2e.mts`(opus+medium, ~50분, 실 provider 비용).
- post-seed 집계 프롬프트는 64관찰 bound가 있다(Stage 0) — N개 섹션 관찰이 그 bound에 카운트됨을 설계에서 고려.

## 6. 리뷰 프로세스
dedup 키(불변식) 변경이 있는 **민감/큰 슬라이스** → 설계를 **ultracode + onto 교차검증** 후 구현
(메모리 `design-validation-ultracode-onto`). 구현 PR엔 Codex 리뷰.

## 7. 설계에서 결정할 열린 질문
- 구조 우선만 vs + RLM 의미 경계(구조 부재 구간)? 비용/결정성 트레이드오프(리서치: 손수 sentence edge-stitching은 미검증).
- 섹션 앵커 형식: `file#heading-path` vs line-range vs char-range? (replay 결정성 = content-hash 안정 앵커.)
- frontier가 섹션을 어떻게 우선순위화(전부 vs purpose-결정 선택 — Stage 2와 겹침. Stage 1은 보수적으로 전부 커버 가능).
- 섹션 분해의 결정성: 구조 우선=결정적. LM 경계 도입 시 안정 id 필요.

## 참고 파일
- 설계: `development-records/design/20260616-large-input-observation-design.md`
- Stage 0 코드: `src/core-runtime/reconstruct/materialize-preparation.ts`(관찰·캡처), `run.ts`(투영·frontier·dedup)
- 라이브 재현기: `scripts/reconstruct-claude-live-document-e2e.mts`
- 메모리: `large-input-observation-track.md`, `design-validation-ultracode-onto`, `onto-mcp-repo-guardrails`
