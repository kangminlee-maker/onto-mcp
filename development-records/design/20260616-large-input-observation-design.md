# 대용량·다문서 입력 관찰(observation) 계층 설계 — RLM 개념 차용과 절단 제거 단계화

> **상태 (2026-06-16, 메인 루프 author)**: 설계 모드 문서. 코드 미적용. 이번 작업(Stage 0 = 절단 제거)은
> 이 문서 합의 후 진행한다. `file:line` 인용은 이번 세션에 isolated source runtime
> (`/Users/kangmin/cowork/onto-mcp-claude`)에서 실제 확인한 값이며, 구현 시 shift 가능하니 재확인한다.
> 외부 근거는 deep-research 워크플로(run `wf_50b1e9c5`, 109 에이전트, 26소스→25주장 적대 검증,
> 23확증/2반증)의 인용을 사용한다.

> **결정 한 줄**: RLM을 **직접 도입(REPL 실행 환경)하지 않고 그 원리만 차용**한다. 진짜 스케일 축은
> "긴 단일 문서"가 아니라 **다문서(수십~수백) 동시 입력**이며, 우리 파이프라인은 이미 그 inter-file
> 1차 기계(inventory·frontier)를 가지고 있다. 이번 작업은 단일 문서 윈도 내 **절단 버그 제거(Stage 0)**
> 로 한정하고, 그것을 이후 단계가 이겨야 할 baseline으로 삼는다.

---

## 1. 목표 · 범위 · 완료 기준

**목표**: reconstruct 관찰 계층이 (a) 윈도 내 단일 문서를 절단 없이 관찰하고, (b) 장기적으로
다문서·대용량 입력을 비용 통제하에 선택적·재귀적으로 관찰하도록 단계적 아키텍처를 확정한다.

**범위**:
- 포함: 관찰 계층(`materialize-preparation.ts`의 source observation, `run.ts`의 frontier 재관찰·프롬프트
  투영 예산), 두 스케일 축의 분리, RLM 개념 차용/비차용 경계, 단계 로드맵, 개념 경제 매핑.
- 제외(이 문서): seed/maturation/judge 단계 내부 로직 변경, review 파이프라인, spreadsheet/database
  어댑터 신규 배선(별도 트랙).

**완료 기준(이 설계 문서)**: 두 스케일 축이 코드 근거와 함께 분리되고, 차용/비차용이 명시되며,
Stage 0~2가 done-when·검증·리뷰 게이트와 함께 정의되고, 개념 신설이 최소화된 매핑이 제시된다.

---

## 2. 현재 아키텍처 진단 (코드 근거)

### 2.1 관찰은 "파일당 1개, 앞부분 발췌"
- `materialize-preparation.ts:188` — `const excerptLimit = 6000;` → `content_excerpt = text.slice(0, 6000)`,
  `excerpt_truncated = text.length > 6000`. 파일 전체 길이는 `char_count`에 기록되지만 **본문 6000자 이후는
  어떤 아티팩트에도 담기지 않는다.**
- `materialize-preparation.ts:207` `buildReconstructSourceObservation` — ref당 관찰 1개. `observation_id =
  stableObservationId({sourceRef, location})`. `adapter_id = minimal-${kind}-structure-observer` —
  **kind 무관 동일 로직**(sha + line수 + 앞 N자). document 프로파일이 명세한 heading/섹션 관찰과 불일치
  (= `support_status=partial`, "minimal structural observation"의 실체).
- 프롬프트 투영 2차 압축: `run.ts:5336` `PROMPT_OBSERVATION_EXCERPT_LIMIT = 1200`,
  `:5337` directive 300, `:5343` post-seed 500. `compactStructuralDataForPrompt`(`:5356`)가 `content_excerpt`을
  추가로 자른다. → 모델이 실제로 보는 건 문서 앞 ~1200자.

### 2.2 frontier/coverage는 "파일 단위"지 "구간 단위"가 아니다
- `run.ts:9109-9143` `observeAcceptedSourceFrontier…`: `if (observedSourceRefs.has(resolvedSourceRef)) continue;`
  (`:9115`). `observedSourceRefs`는 `path.resolve(source_ref)` (파일 경로)로만 dedup.
- `run.ts:9194-9237` `observeAcceptedMaturationClosureSourceRequests`: 이미 본 파일을 재요청하면 **throw**
  (`:9205-9209`, "already observed before re-entry").
- 함의: frontier/scout/inventory 기계는 **"어느 파일을 볼까"(inter-file 탐색)** 만 하고, **"한 파일 안에서
  더 볼까"(intra-file 확장)** 를 구조적으로 거부한다. inventory_unit도 파일당 1개.

### 2.3 라이브 실측(2026-06-15, claude-opus-4-8/medium, document)
- 같은 문서(12,507자) 3회 시도 중 **1회만 완주**(2/3은 seed-authoring readiness `frontier_required`,
  missing `actor`/`object_data`에서 정지). 완주분도 final-output이 `excerpt_truncated=true`로 **정량 목표·
  3개년 마일스톤·문제·전략(문서 후반)을 미관찰**이라 명시. → 절단이 완주 신뢰도와 관찰 완전성을 동시에 깎음.

**진단 결론**: 단일 문서 결함은 **윈도 한계가 아니라 self-inflicted 절단**이다. intra-file 확장 불가가 진짜
갭이고, inter-file은 frontier가 이미 1차로 모델링하지만 스케일은 미검증이다.

---

## 3. 외부 리서치 요지 (인용)

- **RLM 정의**: Alex L. Zhang·Omar Khattab·Tim Kraska(MIT CSAIL), 블로그 2025-10
  ([alexzhang13.github.io/blog/2025/rlm](https://alexzhang13.github.io/blog/2025/rlm/)) → arXiv **2512.24601**.
  긴 프롬프트를 **REPL 환경 변수**로 두고 root LM엔 **쿼리만** 주며 root가 컨텍스트를 프로그램적으로 분할·
  grep하고 **sub-LM을 스니펫 위에서 재귀 호출**. *"not agents, nor just summarization."* 윈도의 **최대
  ~100배** 입력 처리, lost-in-the-middle 완화. (확증 high)
- **비용/품질**: RLM(GPT-5-mini)가 GPT-5를 132k OOLONG에서 **>33%** 능가(비슷한 비용); cascade(sub=mini,
  root=full)가 sweet spot; 요약 대비 **최대 3배 저렴**. (확증 medium — **단일 비심사 preprint·자가보고**;
  재현 2603.02615는 controller 비용/런타임 비예측성 비판, 메커니즘 비판 2603.15653은 "이득은 재귀가 아니라
  프로그램적 컨텍스트 접근, 지연 40–80% 오버헤드"라 함.)
- **결정적 사실**: 12K자 ≈ **3K 토큰 = 현대 native window 내** → RLM의 간판 효과는 우리 단일 문서엔 불필요.
- **인접 기법**: RAPTOR(ICLR'24, 2401.18059) 재귀 요약 트리지만 **+20%는 대부분 GPT-4 효과, 구조 자체는
  ~1.7pt**(ICLR 메타리뷰가 SOTA 주장 오해소지 판정); SiReRAG(ICLR'25, 2412.06206) 유사도+관계(entity/
  proposition) 이중 트리; OpenAI book summarization(2109.10862) 재귀 요약(윈도 초과용); **late chunking**
  (Jina, 2409.04701) full-doc 인코딩 후 청킹 → **edge-stitching 자체 제거**, +1.5~1.9%(검색 임베딩 기법).
- **반증 2건(우리 설계 직격)**: ① "섹션 요약→요약의 재귀 요약"을 우리 "문단→섹션 묶기"로 직접 매핑 = 0-3
  반증. ② "작은 모델로 청크 요약 대체해도 손실 미미"(RAPTOR Llama2-7B) = 0-3 반증. → 캐스케이드 메커니즘은
  지지되나 "작은 모델로 청크 처리" 일반화는 RAPTOR 증거로 못 끌어옴.
- **provenance/결정성·다국어 갭**: 진술→출처 섹션 provenance 전파와 replay 결정성은 문헌이 사실상 미답
  (RAPTOR ~4% 요약 환각). 한·중·일 확증 0건. **손수 sentence-by-sentence + edge-stitching을 검증한 surveyed
  method 없음.**

---

## 4. RLM 개념 차용 경계 (도입이 아니라 차용)

### 4.1 차용하는 원리 (구현 비종속)
RLM의 load-bearing 아이디어는 REPL이 아니라 **선택 + 재귀 + 비용 계층**이다:
1. **분해/선택은 런타임 LM 결정** — 어떤 문서·어떤 구간을 관찰할지는 purpose/질의에 따른 결정이지,
   "전부 읽기"나 "앞 N자"가 아니다.
2. **root는 코퍼스 전체가 아니라 쿼리 + 선택된 view만** — seed/purpose 저작이 N개 문서를 강제로 다 보지
   않고, 경계 있는 선택 관찰 집합만 본다.
3. **슬라이스 위 재귀 관찰** — 큰 문서/코퍼스를 sub-call로 관찰하고 결과를 경계 있게 위로 올린다. **단,
   provenance 앵커를 보존**(문헌 갭을 우리가 메우는 지점).
4. **비용 계층 캐스케이드** — 폭(breadth) 스크리닝·구간 관찰은 싼 모델, seed/judge 종합은 강한 모델. 우리
   기존 per-stage actor seat(`execution_adapter`/model-switcher)에 자연 매핑.

### 4.2 차용하지 않는 것 (명시)
- **REPL/Python 실행 환경**: artifact-first + validator + provenance 스파인을 우회한다. 우리 권위 모델과 충돌.
- **손수 문장별 경계 판정 + edge-stitching**: 어떤 surveyed method도 미검증·고비용. 구조 우선이 더 싸고 안정.
- **summary-of-summary를 권위로 삼기**: 정보 손실 + provenance 단절. 우리는 **원문 span을 진실로, 요약은
  투영으로** 유지.

### 4.3 우리의 차별점 = provenance·결정성
문헌이 비운 자리(provenance 전파·replay 결정성)가 우리에겐 자산이다. content-hash·validator·anchor 스파인이
있으므로 **RLM식 선택을 하면서도 진술→source anchor provenance와 replay 결정성을 보존**할 수 있다. 어떤
분해도 이 제약을 깨지 않는다.

---

## 5. 두 스케일 축 (이 문서의 핵심 develop)

| 축 | 정의 | 현재 상태 | 차용 원리 |
|---|---|---|---|
| **A. intra-document depth** | 관찰 예산을 초과하는 **단일 문서** | 절단(6000/1200), 분해 없음 | 구조 우선 분해 + (구조 부재 시) LM 경계 결정 |
| **B. inter-document breadth** | **다수 문서**(수십~수백) 동시 | frontier가 파일 선택은 함, 스케일 미검증 | 경량 inventory + purpose-결정 선택 + 비용 캐스케이드 |

핵심 통찰: **frontier가 파일 단위라는 점은 축 B에선 약점이 아니라 정답이다.** 갭은 축 A(파일 내부)이고,
다문서는 기존 inventory/frontier 개념 위에서 스케일 패턴만 더하면 된다. 둘을 분리하면 신개념이 최소화된다.

---

## 6. 단계 로드맵 (implementation-process 설계)

### Stage 0 — 절단 제거 (이번 작업, 단일 문서 윈도 내)
- **변경**: `excerptLimit`(6000)과 프롬프트 예산(1200/500/300)을 **kind-aware로 상향 또는 전체 투입**으로.
  document는 전체 문서가 윈도에 드는 한 절단하지 않는다. (code 등 다른 kind는 회귀 없게 보수적으로.)
- **선행 확인**: 이 상수들이 **G2 spec-defaults 가드** 표면인지 점검(로드맵의 "effort 상수 settings 이관"
  과 같은 처리 필요 여부). 가드면 INVARIANT 처리·waiver 경로 확인.
- **done-when**: 같은 12.5K 문서 라이브 재실행에서 (1) 완주 신뢰도 개선(목표 3/3), (2) 문서 후반(목표·
  마일스톤·문제·전략)이 seed/관찰에 유입, (3) `excerpt_truncated=false`.
- **검증**: 단위(텍스트 stats 경계) + 라이브 A/B(절단본 vs 전체본, 같은 문서) — charter §5.5 라이브 증거.
- **리뷰 게이트**: self → onto(가능 시). 상수/예산 변경이라 경량.

### Stage 1 — intra-document 분해 (축 A, 윈도 초과 단일 문서)
- **변경**: document를 **구조 우선 결정적 분해**(heading/markdown/빈줄 문단)로 다중 inventory_unit +
  다중 observation으로. `observation.location`에 **섹션 앵커**를 실어 파일당 관찰 N개(observation_id가 자연
  구분). 구조가 부재/모호한 곳에만 LM 경계 결정(RLM 최소 차용).
- **구조 편집(핵심)**: coverage dedup 키를 `source_ref` → `source_ref + location(앵커)`로
  (`run.ts:9115`·`9176`·`9205`·`9236` + 초기 구성). "관찰 정체성을 구간으로 키잉"의 실체.
- **provenance**: 각 관찰을 `file#section` 앵커로 고정 → cq-13(진술→섹션 provenance)도 동반 해소.
- **done-when**: 윈도 초과 문서가 N개 섹션 관찰로 분해되고, frontier가 섹션 커버리지를 구동, seed-readiness가
  안정적으로 actor/object_data 도달. **Stage 0 baseline을 이겨야** 정당화.
- **리뷰 게이트**: self → onto → (민감/큰 슬라이스면) ultracode+Codex 교차검증([[design-validation-ultracode-onto]]).

### Stage 2 — inter-document 스케일 (축 B, 다문서)
- **변경**: (a) **경량 inventory** — N개 문서를 메타+outline만으로 admit(전체 관찰 X)해 다문서 진입을 싸게.
  (b) **purpose/질의-결정 frontier 선택** — 어떤 문서·섹션을 깊게 볼지 LM 결정(`accepted_frontier_ref_ids`
  확장). (c) **비용 캐스케이드** — 폭 스크리닝/구간 관찰은 싼 모델, seed/judge는 강한 모델.
- **무음 절단 금지**: 선택/스킵을 coverage telemetry로 기록(어떤 문서가 관찰됐고 무엇이 deferred인지).
- **INV-MODEL-1 제약**: 캐스케이드의 "싼 모델"도 **벤치-검증·supported-models 등재(G7)** 필요 — 임의 저가
  모델 투입 불가. 캐스케이드 설계의 실질 제약.
- **done-when**: 수십 문서 입력이 비용 통제하에 완주, 선택 근거·provenance가 아티팩트로 추적 가능. magnitude는
  우리 데이터로 측정(외부 수치는 단일 preprint).
- **리뷰 게이트**: 설계 박제 + ultracode+onto 교차검증 후 구현.

---

## 7. 개념 경제 매핑 (신설 최소화)

| 필요 | 재사용/확장 | 신설 여부 |
|---|---|---|
| 섹션 단위 관찰 | `source_observation`의 `location`에 앵커 확장; `observation_id`는 기존 식 그대로 구분됨 | 신설 0 (필드 의미 확장) |
| 섹션/경량 단위 | `source_inventory.inventory_units` (현 파일당 1개 → 앵커/메타 단위) | 확장 |
| 관찰 선택 | `source_frontier` + `accepted_frontier_ref_ids` | 확장 |
| 비용 계층 | 기존 `execution_adapter`/model-switcher per-stage actor seat + supported-models | 재사용 |
| coverage 가시성 | 선택/스킵 telemetry (기존 ledger 패턴) | 평가 필요(신설 시 정당화) |

dedup 키를 `source_ref+location`으로 바꾸는 것은 **coverage 추적 불변식의 의미 확장**이므로 INVARIANTS/가드
영향 점검 대상이다(구현 시 INVARIANT-CHANGE 필요 여부 확인).

---

## 8. 리스크 · 미해결

- **비용 magnitude 미검증**: RLM 수치는 단일 비심사 preprint·자가보고. 캐스케이드 채택은 하되 **우리 데이터로
  측정**한 뒤에 결론.
- **provenance·replay 결정성**: 문헌 갭. 우리가 content-hash 앵커로 보장 — 분해가 이를 깨지 않도록 제약.
- **재귀가 정말 load-bearing인가**: 메커니즘 비판(2603.15653)은 "재귀보다 프로그램적 컨텍스트 접근이 핵심"
  이라 함 → 우리는 무거운 재귀 전에 **선택+앵커**부터 확보(축 A/B 1차)하는 게 합리.
- **다국어 갭**: 한·중·일 확증 0건 — 우리 문서가 한국어이므로 별도 표적 조사 후속 가치.
- **edge-stitching 회피**: 손수 문장 경계 설계는 미검증 → 구조 우선, late chunking은 검색 임베딩 도입 시에만.

---

## 9. 결정 로그

1. **RLM 직접 도입 ✗ / 개념 차용 ✓** — REPL 실행 환경은 artifact/provenance 스파인과 충돌. 선택+재귀+비용
   계층 원리만 차용.
2. **스케일 축 분리** — 축 A(intra-file 깊이)와 축 B(inter-file 폭)를 분리. frontier 파일 단위는 축 B에
   정답, 갭은 축 A.
3. **절단 제거(Stage 0) 먼저** — 작은 상수/예산 변경, A/B로 병목 확정, 이후 단계의 baseline.
4. **손수 edge-stitching 보류** — 미검증. 구조 우선 분해로 대체.
5. **provenance/결정성을 1급 제약** — 모든 분해/선택이 진술→앵커 provenance와 replay를 보존.

---

## 10. 구현 트리거 (다음 행동)

이 문서 합의 시 → **Stage 0(절단 제거)** 착수: (1) `excerptLimit`/프롬프트 예산의 G2 가드 여부 확인 →
(2) document-kind 절단 제거 변경 → (3) 같은 문서 라이브 A/B로 done-when 검증 → (4) self/onto 리뷰.
Stage 1·2는 각 단계 진입 전 별도 설계·리뷰 게이트로 승격한다.
