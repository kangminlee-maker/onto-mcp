# semantic-map(재귀llm) multi-artifact 확장 설계 SSOT (2026-07-15)

> 상태: **Design SSOT — 프레임·결정 확정. Phase 1 상세 설계 =
> [20260718-semantic-map-multi-artifact-phase1-detailed-design.md](20260718-semantic-map-multi-artifact-phase1-detailed-design.md)
> (Phase 0 재확증 결과 포함)**
> 정정 (2026-07-18 재확증): §1 표의 `comprehension-reduce.ts` "~1098 L"은 오기 — 실제 498 L
> (1098 L은 `comprehension-semantic-map.ts`). §6 "관찰은 이미 멀티-artifact"는 scout/profile
> 층 한정 — code/document 관찰의 structural_data는 generic raw-text 통계뿐이라 per-position
> 신호는 관찰 측 신규 생산이 필요하다(상세 설계 §0·§3.1).
> 소유: reconstruct comprehension 확장 (백로그 B "symmetric artifact accessibility"의 구체 실현)
> 성격: 이번 세션에서 owner와 수렴한 **설계 결정·아키텍처·현 상태·미결 항목**을 고정한다.
> 상세 구현 설계와 N=1 de-risk는 다음 세션이 이 문서에서 착수한다.

## 0. 목표 / 비목표

**목표**: reconstruct의 **comprehension 재귀 semantic-map**(=owner가 부르는 "재귀llm")을
현재의 **스프레드시트 전용**에서 **코드·문서** 소스로도 작동하게 확장한다. 그래야 onto가
코드/문서 소스로부터도 같은 재귀적 의미 이해로 온톨로지를 reconstruct 할 수 있다.

**비목표**: (이번 확장에서) 작동-버그 탐색을 흡수하는 것; review 파이프라인 변경(이건
reconstruct comprehension 트랙); 검증된 스프레드시트 결정론 경로의 파괴적 재작성.

## 1. "재귀llm"의 정체 (현 상태 — 실코드, 착수 시 재확증)

reconstruct comprehension은 **2-레이어 accumulated-semantic-channel**이다:

| 레이어 | 파일 | 역할 |
|---|---|---|
| **L1 reduce (결정론 지반)** | `src/core-runtime/reconstruct/comprehension-reduce.ts` (~1098 L) | 코드-소유·byte-stable·resumable. 컬럼 value-signature leaf를 트리로 fold. monoid 법칙(`assertContiguousChildren`)·honesty fold(`assertHonestyFold`) 강제. LLM 관여 0 |
| **L2 semantic map (재귀 LLM)** | `src/core-runtime/reconstruct/comprehension-semantic-map.ts` (~1098 L) | L1 노드마다 병렬 semantic 노드. LLM이 자식→부모로 재귀 accumulate(`accumulateSemanticMap`, S2 caller-injected callLlm). provisional·resume key 제외. honesty 불변식 N1~N6 |

**스프레드시트 결합의 위치 — 노드 모델 층(깊음)**:
- `ComprehensionReduceNode` 정체 = "단일 컬럼의 연속 행 범위"(`column_index`, `row_start`, `row_end`) — `comprehension-reduce.ts:33-39`
- leaf = 컬럼 value-tile 블록; 신호 = `value-shape`(dominant_shape); seam = value-shape 전이
- 입력 = `spreadsheet-structure-observer.ts`의 `ColumnValueTiles`
- ⇒ **재귀 로직만 스프레드시트인 게 아니라, 재귀가 딛는 결정론 지반 자체가 "컬럼×행-윈도우×값-형태"**. "observer만 교체" 가설은 **기각**됨.

**이미 유예된 것 (핵심 재사용점)**:
- `comprehension-reduce.ts` 헤더: **"cross-column / cross-sheet 집계는 별개 concern (§5.6 relational seam)"** — 멀티-컨테이너 티어는 스프레드시트엔 드물어 유예.
- 동 헤더: **"display-format은 유예된 병렬 시각 채널"** — 시각 신호를 유예.

**관찰(observe) 단계는 이미 멀티-artifact**: source-profiles 4종
(`.onto/processes/reconstruct/source-profiles/{code,document,spreadsheet,database}.md`) +
scout(`source-scout-pack-validation.ts`의 CODE_PATTERNS/DOCUMENT_PATTERNS). 갭은 **comprehension**뿐.

## 2. 핵심 설계 원리 (이번 세션 수렴)

### 원리 1 — 통합: "per-position 구조 신호를 연속-span 계층으로 클러스터"
세 artifact 모두 동형: **위치별 구조 신호를 연속 span 트리로 클러스터링**한다.

| artifact | per-position 신호 | 저작 레벨 | 권위 신호 | 시각 확인 |
|---|---|---|---|---|
| 스프레드시트 | value-shape (셀) | **시각** | **렌더된 시각 레이아웃** | **필수** |
| 코드 | AST 노드 (토큰) | 코드 | **AST** | 불요 |
| 문서 | 레이아웃/폰트 (span): 헤딩·들여쓰기·간격·표·컬럼 | **시각** | **렌더된 시각 레이아웃** | **필수** |

### 원리 2 — 저작 레벨이 authority를 정한다 (가장 결정적)
저자가 일관성/계층을 **어느 레벨에서 추구했는가**가 진실의 위치를 정한다.
- **코드**: 코드 레벨 저작(AST가 곧 실행) → **AST가 authoritative**, 시각 reconcile 불요.
- **문서·스프레드시트**: **시각 레벨 저작** → **렌더된 시각 레이아웃이 authoritative**. 마크업/셀-메타데이터
  (markdown `#`, HTML `<h1>`, DOCX style, 셀 구조)는 "결정론적"이나 **시각 의도의 lossy 인코딩**이라
  단독으로 믿으면 **틀린다**(볼드로 헤딩 흉내·레벨 오지정·수동 서식이 시각적으론 계층인데 마크업엔 부재).
  ⇒ **마크업은 가설, 시각 렌더가 authority. reconcile이 fallback이 아니라 필수 경로.**

### 원리 3 — 문서 신호 계층화 (순수-의미는 잔여 fallback으로 축소)
문서는 순수-의미 별종이 아니다. 신호를 계층으로 시도한다:
1. 포맷 메타데이터 레이아웃(markdown/HTML/DOCX 헤딩·리스트 레벨) — 결정론 *가설*
2. PDF 폰트/좌표 **클러스터링**(value-shape 클러스터링의 일반화) — 결정론 *가설*
3. **비전 인지**(렌더→시각 모델; 이미지-only·마크업 부재) — 인지 authority
4. 순수 의미(최후 fallback; provisional+versioned)
   ⇒ 1·2는 3(시각)과 **reconcile**되어야 신뢰. honesty/resume 난제는 3·4 잔여에만 국한.

### 원리 4 — 멀티파일 = cross-container 티어 (§5.6 relational seam 활성화)
코드레포·문서집합은 단일 파일이 거의 없다(owner). 유예됐던 relational seam을 **파일-집합 → 파일 →
파일-내 노드** 상위 티어로 **구현**한다. 코드·문서 공통. (관찰은 이미 멀티파일; comprehension이 소비 + cross-file seam 필요.)

### 원리 5 — reconcile 패턴은 이미 있음 (승격 재사용)
`comprehension-semantic-map.ts`의 **N1/N2 양측 reconciliation**(reduce value-shape seam ⟷ LLM 경계;
`anchored`=`structural_location_only`, `missed_by_llm` 공시)을 **마크업 ⟷ 시각**으로 승격.
시각이 authority, 발산은 flag(감사가능·자동 거짓판정 금지).

## 3. 확정된 결정 (owner, 2026-07-15)

- **D1 시퀀싱**: **코드 먼저**(AST authoritative·시각 不要·가장 깨끗) → **문서·스프레드시트-시각 2단계**(공통 시각 채널).
- **D2 멀티파일**: 유예된 **relational seam을 파일-집합 티어로 구현**(코드/문서 공통).
- **D3 멀티모달 시각 채널 in-scope**: render(markdown/HTML/DOCX/PDF→이미지) + **비전 모델 시각 계층 인지** 도입.
  **cross-artifact 공통**(문서+스프레드시트, 코드 opt-out)으로 설계하고 **스프레드시트 시각 채널을 소급 완성**.
- **D4 honesty**: 마크업(결정론 가설) ⟷ 시각(인지 authority) **reconcile, 발산 flag** — N1/N2 패턴 승격 재사용.

## 4. 아키텍처 (목표 형상)

```
관찰(observe, 기존 멀티-artifact)
   → [artifact별 전처리: per-position 구조 신호 추출]
        · 코드      = AST 심볼 추출기 (결정론, authoritative)
        · 스프레드시트 = value-shape (기존) + 시각 채널(소급)
        · 문서      = 레이아웃/폰트 클러스터(가설) ⟷ 시각 인지(authority) reconcile
   → [제네릭 reduce: 신호를 연속-span 계층 트리로 클러스터, monoid·honesty 보존]
        · 멀티파일 = 파일-집합/relational-seam 상위 티어
   → [공유 L2 semantic-map 재귀: 자식→부모 accumulate]  ← 대체로 재사용
   → 온톨로지 seed 생산 (20260702-layer2-seed-production-wiring)
```

접근 = **Option C(하이브리드)**: 제네릭 트리/monoid/재귀 machinery 추출 + **신호·seam·observer는 per-artifact 플러그**.
검증된 스프레드시트 경로는 **default-off/병렬 + diff 불변 증명**으로 보존(reversible).

## 5. 단계 / 착수 순서 (다음 세션 start-here)

**Phase 1 — 코드 (시각無, 저위험, 패턴 확립)**
1. **N=1 de-risk 프로브 먼저**: 코드 AST 심볼 트리로 **byte-stable reduce가 성립**하는지 소형 실증
   (스프레드시트 reduce-proof-harness 6/6 대응물). 성립 안 하면 재설계.
2. 제네릭 reduce 추출: `ComprehensionReduceNode`를 신호-불가지 추상 노드로, value-shape는 한 구현체로.
   monoid(`assertContiguousChildren`)·honesty fold 불변식 보존 증명.
3. **AST 신호 추출기**(코드 structure observer) + **멀티파일/relational-seam 티어**.
4. L2 semantic-map을 추상 노드로 태우기(현재 스프레드시트-typed 노드 소비 — 결합도 확인 필요).
5. 스프레드시트 경로 diff-불변 + 코드 경로 live 검증.

**Phase 2 — 문서·스프레드시트 시각 채널 (D3)**
1. render 파이프라인(포맷→이미지) + 비전 dispatch 경로(reconstruct에 멀티모달 추가).
2. 마크업/폰트-클러스터(가설) ⟷ 시각 인지(authority) **reconcile**(N1/N2 승격).
3. 문서 신호 계층(§2 원리 3) 1·2순위 우선, 3·4 잔여 honesty 별도.
4. 스프레드시트 display-format 시각 채널 소급 완성.

## 6. 현 상태 파일 지도 (재확증 대상)

- 재귀 코어: `comprehension-reduce.ts`(L1 결정론), `comprehension-semantic-map.ts`(L2 재귀), `comprehension-reduce`가 참조하는 `comprehension-artifact.ts`
- 스프레드시트 관찰: `spreadsheet-structure-observer.ts`(`ColumnValueTiles`)
- 스테이지: `semantic-map-stage.ts`는 **비존재** — 스테이지는 조립됨(오케스트레이션은 `reconstruct/run.ts` 계열 추정, 착수 시 확인). 테스트: `semantic-map-stage.test.ts`(전부 `target_material_kind:"spreadsheet"`)
- 관찰(멀티-artifact): source-profiles 4종, `source-scout-pack-validation.ts`(CODE/DOCUMENT_PATTERNS)
- seed 생산: 설계 `development-records/design/20260702-layer2-seed-production-wiring-design.md`

## 7. 리스크 / 미결 (다음 세션이 결정)

- **문서 3·4순위 honesty/resume 모델**: 시각 인지/순수 의미가 ground에 들어가면 "resume key 제외" 불변식이 흔들림
  → seeded 재현가능 처리 vs provisional+versioned. Phase 2에서 확정.
- **비전 dispatch 역량**: 멀티모달 provider 경로(현재 reconstruct는 텍스트 direct-call 중심) — 신규.
- **제네릭 추상화가 검증된 스프레드시트 불변식을 깨지 않는가**: Phase 1의 하드 게이트(diff 불변 + monoid/honesty 증명).
- **멀티파일 스케일**: 파일 집합이 크면 재귀 fan-out↑ — 동시성/토큰 예산(max_concurrent_lenses·output-budget)과 상호작용.
- **prompt 캐싱 (#8을 여기 접음, 2026-07-16 실코드 검증)**: sealed semantic_map dispatch의 anthropic arm(`sealed-dispatch-capability.ts:417` `messages.create`, dispatch_fallback ON + Sonnet 5 등 anthropic arm일 때 실재)은 `cache_control`을 넣을 수 있는 유일한 수동-캐싱 사이트다. **그러나 현 스프레드시트 경로에선 no-op**: 유일한 안정 prefix인 system(`SEMANTIC_MAP_SYNTHESIZE_SYSTEM_PROMPT`≈478토큰 / `SEMANTIC_MAP_VERIFY_SYSTEM_PROMPT`≈201토큰, run.ts:2082/2091 — 순수 상수, per-node 변동은 전부 `userPayload`로 격리되어 안정성은 완벽)이 Anthropic 최소 캐시 문턱(1,024~2,048토큰)에 한참 미달이고, 큰 것(per-node payload)은 노드마다 변해 재사용 불가. **캐싱이 값어치를 갖는 조건 = "큰 안정 prefix"인데, 그건 이 확장이 노드마다 동일하게 앞에 붙는 큰 공유 컨텍스트**(파일 전체 소스·domain 명세·공유 reduce 스켈레톤)**를 도입할 때 비로소 생긴다.** ⇒ 그 공유 블록을 설계에 넣는 순간, 같은 sealed:417 사이트에 `cache_control`(system 상수가 아니라 그 공유 블록에)을 부여하는 것이 자연스러운 항목. **#8을 단독으로 지금 하지 말 것**(죽은 코드). openai arm(`responses.create`)은 자동 prefix 캐싱이라 별도 opt-in 불필요, 마찬가지로 sub-threshold면 이득 0.

## 8. 관련 문서 / SSOT

- 상위 배경: `development-records/design/20260701-layer2-accumulated-semantic-channel-design.md`,
  `20260701-reduce-merge-layer-boundary-design.md`, `20260702-layer2-seed-production-wiring-design.md`
- 백로그 상위: `development-records/design/20260715-review-ontological-primacy-runtime-alignment-backlog.md`
  (이 확장은 그 §"백로그 B — symmetric artifact accessibility"의 실현)
- onto 정체성(문서/코드/스프레드시트/DB = 온톨로지 담체 레이어; domain = reconstruct 전제): README·llms.txt(2026-07-15 정정)
