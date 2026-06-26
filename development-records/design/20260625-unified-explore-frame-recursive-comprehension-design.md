# design (DRAFT) — 통합 이해 엔진: 결정론 explorer × 프레임 LLM × 재귀 reduce

> 상태: ⚠️ **REDESIGN (2026-06-25 교차검증).** §9 RESOLVED 표기들은 *내부적으론 일관*했으나 **세 load-bearing 가정이 깨짐**(아래 §12) → SUPERSEDED. 두 독립 리뷰어 수렴: ultracode `wf_e39056a8-4b3` **REDESIGN**(31/41 confirmed·블로커7) + onto `20260625-9707b6bd`(high×5; issue-001/002/006). **§12 교차검증 결과가 진실의 현 위치.** 살릴 코어 있음(공유 raw-read + 결정론 투영 + leaf-comprehension용 same-schema reduce); review 판정·reconstruct 구성은 *분리 유지*, explorer-V는 vision-assist로 강등. 날짜: 2026-06-25. main baseline `c2b9c41`.
> 이 문서는 review·reconstruct를 하나의 원시 동작("읽고 의미를 부여한다")으로 통합하는 아키텍처 북극성이다.
> 산출 경위: spreadsheet 잔차(range-ref) 검토 → 누수 분석 → "잔차를 어떻게 *이해*하나"로 재구성(owner) →
> 결정론 explorer × LLM lens의 1:n vs 1:1 토론 → 본 통합 설계.
> 상위/연관: [[large-input-observation-track]](RLM 차용) · [[onto-review-multiagent-redesign-track]](reduce 트리·렌즈·shardability·능력경계) ·
> [[20260623-design-c-residual-cardinality]](#141 cardinality=잔차 신호) · [[contract-runtime-gap-ledger]](P0.5 HELD #144) · [[design-validation-ultracode-onto]].
> ⚠️ 이건 잔차 슬라이스가 아니라 **아키텍처급 방향**. 전면 구현 전 §9 축 정련 + §10 최소증명 + 교차검증.

## 0. 한 줄

review("남이 못 본 오류 찾기")든 reconstruct("온톨로지 짓기")든 결국 **읽고(explore) 의미를 부여(mean)**하는 동일 동작이다.
이를 하나의 엔진으로 통합한다: **`(공유 raw-read) → 프레임별 결정론 투영(explorer 사이드카) → 프레임 LLM(lens) → 재귀 reduce`**.
대용량 raw 데이터("y=f(x)+b"의 b)를 **샘플링으로 일부만 보는 대신, map-reduce 트리로 빠짐없이 이해**한다.

## 1. 출발점 — 전제 교정 (owner)

- review가 요약하는 이유는 **원칙이 아니라 기술적 타협**(시간·컨텍스트). 다 읽고 판단할 수 있으면 그게 최선 — review의 본질(숨은 오류 발견)에 부합.
- 기술 한계는 **둘**: (A) 컨텍스트(한 LLM이 다 못 담음) → map-reduce 팬아웃이 푼다. (B) 비용/지연/결정성 → map-reduce가 *옮긴다*(컨텍스트→컴퓨트+비결정). 따라서 "다 읽기"는 공짜가 아니라 **환전**이며, 의식적 게이트가 필요하다(§7).

## 2. 핵심 프리미티브 (엔진)

개념 + 한 동작. **explorer는 둘(상보적·둘 다 1차, 폴백 아님)** — 엑셀의 정보 일부는 *시각적 배치 자체*에 인코딩되므로(그룹핑·병합·색·빈행 구분; "시각이 안 중요했으면 SQL/Access 썼을 것" — owner) 순수 데이터 추출은 lossy. 비정형 테이블이 규칙 없이 흩어진 실파일에선 결정론 라벨 탐지의 신뢰도가 구조적으로 낮다(=P0.5가 어려웠던 이유). 따라서:
- **explorer-D (결정론 XML 관측)**: 바이트에서 *정확한 사실* — 값·수식·타입·개수·해시. LLM 아님. **resume/캐시 substrate를 소유**(정밀·재현). 예: 시트/차원, per-column distinct/non_empty(잔차 신호, #141), 수식 패턴, 데이터검증, 피벗, 시트간 키 중첩.
- **explorer-V (비전 관측, 1차)**: 렌더 이미지에서 *시각 구조* — 레이아웃·라벨·섹션 경계·시각 의미(병합/색/그룹). 이미지가 결정론적(파일→고정 바이트→이미지 해시)이라 **해석은 이미지 해시로 캐시**(재현). 비전은 19만 정확값은 못 읽고 구조를 읽음 → explorer-D와 **융합**(비전이 영역·라벨 위치를 잡고, XML이 그 영역의 정확 셀을 채움).
- **frame (의미 프레임)**: "무엇을 보고 무엇을 도출할지"의 렌즈. review-프레임=평가적(structure/logic/semantics/coverage/…), reconstruct-프레임=구성적(entity-identity/relation/constraint/lifecycle/…).
- **lens (프레임 LLM)**: frame을 써서 두 explorer 출력 + 필요한 raw(이미지 타일 + 정확-값 타일)를 읽고 **구조화된 의미**를 출력(LLM).
- **reduce (재귀 집계)**: leaf 이해들을 작은 단위로 묶어 상위 lens가 재도출 → 재귀. 수렴/예산서 정지(§9-b).

엔진 = 이 프리미티브의 트리. review·reconstruct는 **프레임팩만 다른 같은 엔진**(§6). f(수식)→코드처럼 텍스트, 구조·라벨→explorer-V 1차, b(데이터)→비전 타일+정확값 타일.

## 3. 3층 분해 (1:1 vs 공유의 정밀화 — 비용 함정 회피)

"explorer"를 한 덩어리로 보면 1:1이 가장 비싼 비용을 n배로 만든다. 분해하면:

| 층 | 공유/1:1 | 근거 |
|---|---|---|
| (a) **raw 읽기** (압축해제·스트리밍·바이트 I/O) | **1회 공유** | 렌즈마다 파일을 n번 풀 이유 없음 |
| (b) **결정론 투영** (프레임이 쓸 증거 형태) | **프레임별 1:1 (사이드카)** | logic=수식 의존그래프·semantics=값 어휘·structure=레이아웃 영역 = *진짜 다른 관측*(중복 아님) |
| (c) **LLM 의미부여** (lens) | **프레임별 1:1** | 프레임마다 해석 다름 |

→ 순수 1:1("각 렌즈가 독립적으로 raw 전체를 LLM으로 다 읽음")은 (c)를 n배 폭증. 대신 **눈(raw 스캔)은 하나, 각 렌즈는 자기 안경(결정론 투영)+머리(LLM)**. 안경·머리는 1:1, 눈은 공유. lens는 *압축된 투영* + 고잔차 영역 **타깃 deep-read**만 LLM으로 본다(전체-raw n중 스윕 아님).

## 4. 결정성 분리 — P0.5 벽의 해답 (★핵심)

P0.5 헤더 에스컬레이션이 HELD된 이유(#144): LLM·stateful 이해가 **결정론 관측 파이프라인 *안에* 섞여** 재도출·고정캐시·resume 해시와 충돌. 본 설계의 explorer/lens 분리가 이를 해소한다:
- **explorer = 결정론 substrate** → resume 해시·캐시·재현 계약을 **소유**(안정). reconstruct 재개는 explorer 출력 기준.
- **lens = 의미 레이어** → explorer 뒤에 얹고 **콘텐츠 해시로 캐시**. 재실행 시 같은 explorer 출력 → 같은 캐시 키 → 재사용.

결론: 답은 "관측층에 LLM 금지"가 아니라 **"LLM을 결정론 explorer 뒤에 깔끔히 레이어링 + 콘텐츠-해시 캐시"**. (P0.5 재개 시 이 분리를 전제로 재설계 가능.)

## 5. 재귀 reduce 트리

- **map (leaf)**: raw를 청크로 나눠 각 청크를 프레임 lens가 읽어 구조화 출력. 소형·빠른 모델 대량 병렬 + 작업 끝난 슬롯에 queue 추가(work-stealing). **빠짐없이** 커버.
- **reduce**: leaf 출력을 작은 단위로 묶어 상위 lens가 구조/범위/logic/semantic 재도출 → 다시 묶어 재귀.
- **정지**: 1개까지 안 가도 됨. **수렴**(상위 재도출이 더 안 바뀜) 또는 **목표 예산 도달**서 정지(§9-b 정련).
- **검증**: 노드별 적대적 검증(ultracode/리뷰 deliberation 패턴)으로 reduce 오류 누적 차단(§9-f).

## 6. 프레임은 다르고, 기계는 같다 (통합)

- **review 프레임팩** = 평가적: 오류·갭·일관성 (현 core-axis 렌즈).
- **reconstruct 프레임팩** = 구성적: entity/relation/constraint/lifecycle (현 seed required-element·competency facet).
- **하나의 엔진**: `(공유 raw-read) → 프레임별 결정론 투영 → 프레임 lens → 재귀 reduce`. 프레임 레지스트리만 교체. (§9-c: 두 팩을 한 레지스트리로 둘지 정련.)

## 7. 비용 거버넌스

- **게이트**: 전체-raw deep-read는 **고잔차 영역 한정**(cardinality #141로 식별) + **opt-in deep 모드**. 저잔차/categorical/수식은 이미 압축됨 → deep-read 불요.
- **공유 deep-read 캐시**: 렌즈-간 같은 셀 재독 방지(콘텐츠 해시).
- **예산**: 윈도/토큰 예산은 **기존 reconstruct 상수 재사용**(신규 결정수치 금지, INV-BENCH-1).

## 8. 기존 트랙과의 관계

- **large-input-observation-track**: RLM 재귀 reduce를 *직접* 채택하는 형태. 본 설계가 그 Stage 1+(섹션분해·reduce)를 흡수.
- **onto-review 재설계**: Stage 3(런타임 reduce 트리)·렌즈·shardability·seam·능력경계(read capability)가 본 엔진의 review 인스턴스. 본 설계는 그 reduce 트리를 "raw 잔차 이해"까지 확장.
- **#141 cardinality**: 잔차 신호 = deep-read 트리거 + 청크 우선순위(`columnResidualKey` 재사용).
- **range-ref/sampling**: 본 엔진 하에선 "샘플 일부"가 아니라 "트리로 전부 이해" → range-ref 라벨도 자연 흡수(누수 우려는 §4 결정성 분리 + §7 게이트로 다룸; 단 review 카드 원시값 정책은 §9-g).
- **P0.5**: §4가 해답 — 재개 시 explorer/lens 분리 전제.

## 9. ★다듬을 축 (refinement agenda — 하나씩 정련)

- **(a) 사이드카 합성 ✅ RESOLVED (2026-06-25)**: n개 explorer 아님 = **1개 공유 rich base + n개 얇은 순수 투영**. 비싼 explore(I/O·렌더)는 1회: explorer-D 인벤토리(셀·타입·distinct·**수식+참조**·vocab·피벗·시트간 링크·차원) + explorer-V 구조(레이아웃·라벨·섹션). **프레임 사이드카 = base 위 순수함수(재스캔 0)**: logic=수식+ref→의존그래프 *도출*·semantics=vocab *선택*·structure=영역 *선택*. 작은 공유 프리미티브 라이브러리(cellStream·columnProfile·formulaGraph·regionMap·vocab·crossSheetLinks)를 투영이 합성. 표면=n개 얇은 순수투영(앞서 걱정한 n× I/O 비용도 해소). = 기존 observer→projection(review render vs reconstruct projectInventoryForPrompt) 패턴 형식화. 조건: base가 충분히 rich(모든 프레임이 거기서 파생). **Q1(어떤 프레임이 base서 파생 불가=별도 스캔 필요인지)=§10 최소증명서 실 artifact로 판정(owner: "다뤄보며 판단").**
- **(b) reduce 정지 기준 ✅ RESOLVED (2026-06-25)**: 정지 = **수렴(가치 증가 멈춤) + 프레임별 과잉-reduce 가드(가치 파괴 직전)**, 그리고 **per-node 비동기(배리어 없음)**.
  - **review 가드 = 디테일 뭉개기 금지**: 가치=원인지목+검증가능 구체성. reduce는 추상화(replace) 아닌 **상관(additive-correlate)** — fine finding 보존 + 교차영역 관계/모순만 추가. 해상도 바닥 = leaf 입도((d)). 새 교차영역 finding 없으면 정지, **모든 fine finding 보존**.
  - **reconstruct 가드 = 골디락스 대역**: reduce는 인스턴스→타입 추상화하되 — 하한(계속): held-out 인스턴스 subsume 못 함=국소→더 reduce / 상한(정지): 다음 병합이 구별되는 개념을 붕괴시킴=공허→직전 정지. 테스트(정련필요): subsumption(범용)·discrimination(비공허·뭔가 배제)·concept-collapse(구별 시그니처 병합 금지).
  - **per-node 비동기·배리어 없음**: 쉬운 타일 1~2패스 수렴, 어려운 타일 혼자 계속 재귀(적응 깊이). **수렴 노드=동결·trusted·재확인만**(재도출 X, 상위 맥락 일관성만 싸게 확인) — onto-review `trustStatus:trusted`+`onto_review_continue` 재사용. **미수렴 노드=단독 재귀**, 형제/부모의 수렴부 안 막음. 부모는 자식 집합 변할 때만 재도출(정착 전 provisional). **per-leaf 반복 budget 상한** 초과→정직 `capped`. (pipeline 의미론=배리어 없음; review 재설계 Stage-3 배리어 우려 강화.)
- **(c) 프레임 레지스트리 ✅ RESOLVED (2026-06-25, 사고실험 근거)**: 단일 스키마 frame=`{id, kind, projection(사이드카), directive, output_slots, merge_policy}`. **코어 4(structure/range/logic/semantics) 강하게 공유** — 사고실험(Sales 시트, 4프레임×2kind): 네 프레임 모두 *공유 관측 동일*, 다른 건 질문뿐. **같은 '암묵 모델'을 두 방향으로**: reconstruct='무엇인가'(타입·도메인·규칙·개념 *추출*=define) · review='맞는가'(그 norm에 *대조해 어긋남*=check). '범위 밖'은 범위를·'규칙 위반'은 규칙을·'오라벨'은 옳은 라벨을 전제 → **review 판정은 reconstruct norm에 논리적 후행**. `kind`=방향(추출/검사). **★공짜 배당: 코어 스파인서 `review ≈ reconstruct(norm 추출) + diff(데이터, norm)`** — 데이터-내적 review는 reconstruct 추출 모델을 norm으로 재사용, 마지막 한 스텝만 다름(정의 vs 정의+대조). **비공유**: review-전용(axiology/coverage/evolution)=*외부 기준(리뷰 목적)*에 대조라 스파인 밖(원래 review-팩). reconstruct-전용(entity/relation/lifecycle)=코어(structure+semantics)서 *창발*하는 팩 파생(별도 base read 아님). 물리 파일 분리=배포 디테일(현 `core-lens-registry.yaml`=review팩; reconstruct 프레임은 같은 스키마로 승격). 엔진=팩-불가지론.
- **(d) 청킹 단위 ✅ RESOLVED (2026-06-25)**: leaf = **라벨-완전 슬라이스**. 원칙: 모든 leaf는 *홀로 해석 가능* = 자기 컬럼 헤더 + 행 라벨을 반드시 동반(라벨 없는 셀 타일은 무의미). 메커니즘: **explorer-V(비전)가 렌더 이미지를 큰 chunk로 쪼개 라벨 구조 탐지**((column-label)/(row-label)/(둘 다)) → 모든 라벨 포함하도록 슬라이스; matrix(양축)면 **더 적은 라벨 축으로 슬라이스**(조각 최소·반대축 라벨 맥락 보유). 긴 컬럼은 행-윈도 분할. leaf = **(이미지 타일 + 정확-값 타일)** 쌍. **고잔차 영역만**(cardinality #141) 타일링, 이미 압축된 f/categorical은 skip → "빠짐없이 읽기"를 비용효율로. [근거: 비정형 테이블 규칙없이 흩어짐 + 엑셀=시각-by-design → 비전 1차 필수, §2.]
- **(e) leaf 출력 스키마 ✅ RESOLVED (2026-06-25)**: **모든 트리 레벨 동일 스키마(monoid 유사 → reduce가 자식 k개를 같은 모양 부모로 병합)**. 공통 spine: `structure`/`range`/`logic`/`semantics` + `confidence`/`is_lower_bound`(정직). 프레임별 슬롯: review=`findings` · reconstruct=`ontology_fragments`. **각 slot = `{claim, example, confidence}`** — slot마다 뒷받침 예시 1개(merge 시 추상 주장만으론 못 가림; 구체 예시로 충돌을 *보고* 판정). merge = `{재조정 claim, *선별* example(대표 1개 또는 충돌 하위주장별 1개로 bound), 화해 confidence + 충돌플래그}`. ★**reduce-시점 자식 간 모순 표면화 = 샘플링이 못 잡는 숨은 오류 탐지**(자식 A "날짜" vs B "자유텍스트" → 부모가 충돌 플래그). 보너스: "주장당 예시 1개"가 **(g) 원시 노출의 답**(덤프 아닌 *주장의 최소 증명*, bounded). **노드 메타 `convergence_state ∈ {converging, converged, capped}`**((b) per-node 비동기용 — converged는 carry/재확인, converging만 재귀, capped는 정직 표기).
- **(f) 노드별 검증 배치 ✅ RESOLVED (2026-06-25)**: **2부 구조**. ① **내재(공짜)**: (e) merge의 자식-간 모순 표면화 = 트리가 스스로 불일치 검출. ② **외재(적대적)**: **material 주장만**(finding이 되거나 온톨로지 결정을 끄는) — (e)의 slot당 예시에 **앵커**해서 "예시가 주장을 뒷받침하나?"를 싸게 확인(타일 재독 불요), 자명 일관 주장은 skip. = onto-review(lens→finding→deliberation/stance→synthesis) + ultracode(find→적대검증→synthesize)의 일반화(통합점). 소형모델 얕음은 (d) 라벨-완전+이중모달이 이미 완화.
- **(g) 원시값 노출 정책 ✅ RESOLVED (2026-06-25)**: 노출 단위 = **주장당 예시 1개(+소수), 덤프 아님**((e)서 파생). 내보내는 모든 원시값은 *그 구조화 주장을 뒷받침하는 셀*로 정당화 — review finding은 본질상 증거 셀 가리킴(노출 필수·정당), reconstruct fragment는 인스턴스 예시 1개(bounded). **마스킹 없음(레포 정책)** → 경계=①개수 캡 +②"반드시 주장의 증거" 규칙. reconstruct 채널은 기존 **source-safety 원장**이 계속 거버넌스. owner: review의 "원시 안 읽음"은 과해석 → review 카드도 finding 증거 셀 담음(원시 노출을 "주장의 증거"로 한정, bounded). 샘플-덤프/range-ref-데이터컬럼보다 훨씬 작은 노출.
- **(h) 결정성/캐시 키 ✅ RESOLVED (2026-06-25)**: §4 분리를 **층별 캐시 키**로 — explorer-D 출력=파일 콘텐츠 해시(**resume substrate**, 안정) · explorer-V 해석=이미지 해시(렌더=결정론) · lens 이해=입력(투영+raw 타일) 콘텐츠 해시 · reduce 노드=자식 이해 콘텐츠 해시(수렴=trusted=carry). **comprehension-version을 adapter-version과 분리**: 모델/프롬프트 변경은 lens 캐시만 무효화, **결정론 substrate(resume)는 안 회전**(P0.5 벽 해소). 전부 기존 머신 재사용(resume·trusted-unit·reuseMatchArtifactHash·adapter_version).
- **(i) 비용 모델/게이트 ✅ RESOLVED (2026-06-25)**: **게이트**=deep-read는 고잔차 영역만(cardinality #141) + opt-in deep 모드(기본은 싸게: 구조 인벤토리+tier-1 모양). **예산**=기존 reconstruct 윈도/토큰 상수 재사용(신규 결정수치 0, INV-BENCH-1), leaf 예산을 잔차 우선순위(`columnResidualKey` #141)로 분배. **캡**=워크북당 leaf 캡 + per-leaf 반복 캡((b) backstop)→`capped` 정직표기. 비용은 leaf층 집중(reduce는 쌈; 수렴/trusted-carry가 추가 bound). 총 ≈ 고잔차 타일 수 × leaf 비용 × 평균반복(1~2).

## 10. 최소 증명 (smallest viable validation)

전면 구현 전, 프리미티브가 실제로 "구조만으론 못 본 의미"를 끌어내는지 입증:
- 프레임 1개(예: semantics) + 사이드카 explorer + 실제 **고잔차 워크북 1개** + 재귀 reduce 1~2 레벨.
- **(a)-Q1 검증(여기서 판정)**: 그 프레임의 사이드카가 공유 base서 *순수 파생 가능*한지(별도 스캔 불요) 실측. 불가 프레임 발견 시 base 확장 or 별도-스캔 예외 기록.
- 성공 기준: 구조-only 인벤토리가 놓친 의미(예: 자유텍스트 컬럼의 실제 주제·이상치·숨은 규칙)를 트리가 정직·바운드하게 도출. 비용/지연 실측.
- 통과 시 → §9 축 확정 → 통합 확장. 실패 시 → 프리미티브 재검토.

## 11. 위험 / 비-목표

- 위험: 비용 폭증(§7 게이트)·reduce 오류 누적(§9-f)·사이드카 표면(§9-a)·결정성 누수(§4/§9-h)·소형모델 얕은 추출(§9-f 검증).
- 비-목표(현 단계): 마스킹/redaction 재도입(레포 금지) · 외부-워크북 ref 해결 · 전면 production 전환(최소증명 전).

## 12. 교차검증 결과 (2026-06-25) — REDESIGN

두 독립 리뷰어 강수렴. **ultracode** `wf_e39056a8-4b3`(48 agent, 6차원→적대검증→종합): **REDESIGN, 31/41 confirmed, 블로커 7(R1-R7)**. **onto** `20260625-9707b6bd`(6렌즈·deliberation): high×5+medium×7, 같은 문제 1순위 수렴.

**세 load-bearing 가정이 *깨짐*(미명세 아님)**:
1. **§4 "P0.5 해결"이 역전됨** (ultracode R1/R2 blocker = onto issue-006/001 high): P0.5 B1 fix는 LLM-도출 구조를 resume 해시에 *접어넣어야*(heuristic→llm flip이 digest 회전) 함. 그런데 §9-h는 "모델/프롬프트 변경은 substrate 미회전"이라 정반대 — explorer-V 비전(=LLM-도출 관측 *구조*, seed authoring에 피드)을 non-rotate 쪽에 둬 **B1 silent-stale-seed를 그대로 재현**. + 비전-청크 geometry와 deep-mode가 reuse digest(run.ts content_sha256+adapter_version)에 없어 **재현불가 seed의 silent 재사용**.
2. **"한 엔진/한 레지스트리" 통합이 load-bearing 층에서 거짓** (R5/R12 = onto): review의 전역 *비-monoid* 판정(finding→issue→stance→deliberation→synthesis)·reconstruct의 계약-게이트 구성(gate/obligation/provenance)·스파인 밖 cost-optimal 코어 축. **공유분은 더 작다**(raw-read + 결정론 투영 + **leaf-comprehension 한정** same-schema reduce). review 판정·reconstruct 구성은 *분리 비-통합 스테이지*로.
3. **explorer-V PRIMARY가 미구축 3대 표면에 의존** (R3): 결정론-충실도 xlsx→이미지 렌더러·멀티모달 callLlm·vision-model INV-MODEL-1 등록(레지스트리에 modality 개념 없음, 텍스트 2모델뿐) — 전부 부재. + 순환(190K행은 한 이미지 불가→타일링이 렌더 선행인데 §9-d는 타일링을 비전에 맡김).

**추가 블로커/하이**: R4 수렴=decoration·종료는 cap-bound·`converged=trusted=carry`가 모순-기반 reopen을 억제(=엔진 시그니처 가치 손상; = onto issue-003) · R6 review additive reduce는 O(N) 연결이지 reduce 아님(bounded-node/"reduce는 쌈" 거짓) · R7 goldilocks 대역 미정의·empty 가능 · R8 canonical child-partition 부재→LLM merge+async로 reduce-노드 해시 byte-불안정(trusted/carry 오염)+모순탐지를 prose에 routing(B-5 anti-laundering 역행) · onto issue-002 "exhaustive vs capped" 정직성 overclaim.

**살릴 코어(양 리뷰어 함의)**: *공유 raw-read + 결정론 투영 + leaf/raw-comprehension용 same-schema 재귀 reduce*. 단 — review 판정·reconstruct 구성은 **분리(비통합)**, explorer-D가 **청킹/결정성 소유**(비전은 header_confidence:low에서만 non-authoritative 제안+chokepoint 재적용, P0.5 §2b 패턴), 종료는 cap이 정직한 상한·수렴은 early-exit·convergence_state reversible, "exhaustive"→"bounded/capped" 정직화, canonical 결정론 partition+exact-value-tile 모순탐지(B-5 정합).

**최소증명 재절단 (R15, ordered cuts)**: §10 단일 run은 ≥4 독립 미증명 프리미티브를 묶어 실패 국소화 불가 + 최고위험 explorer-V에 전체를 결박. → **Cut 1 = monoid reduce + 자식간 모순 표면화를, *비전·신규프레임 없이* 얇은 segmented explorer-D value-tile 투영으로**(mixed-type 컬럼 positive control; 현 observer는 컬럼당 majority type 1개+원시값 0이라 작은 segmented value-tile 투영 필요) = 헤드라인 §9-e 주장만 최소 greenfield로 검증. Cut 2=사이드카 파생성(a)-Q1 · Cut 3=explorer-V 렌더+라벨탐지 단독 vs explorer-D ground truth · Cut 4=full. + 각 cut에 resume-across-re-render·comprehension-only-rotation 테스트.

**현 판단**: 이 북극성은 *near-term 트랙 아님*(P0.5 HELD 벽 직결 + 3 깨진 가정 + 대형 미구축 표면). 살릴 코어는 실재. 진행은 owner 결정.

## 13. Cut-1 / Cut-1b 실험 결과 (2026-06-25) — 헤드라인 가치 실증

§12 REDESIGN 후, owner 결정으로 **가장 싼 sub-claim만** 검증(Cut-1, ultracode R15): "재귀 monoid reduce(타일 segment→특성화→merge+모순탐지)가 샘플링이 못 잡는 *클러스터 영역 불일치*를 표면화하나(clean 환각 없이)". throwaway 하니스(`/tmp/cut1*-fixture.json`, 워크플로 `wf_5028ed14`·`wf_be56e925`), 비전·신규프레임·production 배선 0.

- **Cut-1** (타일-정렬 break, COL subtle ISO→US 포맷 @5001): **CLAIM_VALIDATED**. tree가 rows 5001-6000 *정확* 국소화(2/2); flat/sample은 strided라 경계 흐림. clean 대조군 false-positive 0. ⚠️ 단 break가 타일경계와 정렬된 교란.
- **Cut-1b** (off-grid break @5501 = 타일 t6 중앙, 타일값 행라벨화): **SURVIVES**(교란 닫힘). tree가 `intra_tile_note`로 last-ISO=5496(~5행) 핀 — 타일 입도로 퇴화 안 함. 엄격 순위 tree(~5)<flat(~11)<<sample(~100, 1회는 자신있게 오국소화). clean false-positive 0.

**결론**: 
- **국소화/진단 가치는 실재·견고**(두 교란 조건·재현). load-bearing 메커니즘 = **intra-tile 경계 증거**(서브타일 관측). 
- ★**정직한 정정**: 가치는 *탐지*가 아니라 **국소화**(원시 탐지는 세 arm 무승부) → 엔진을 "행동 가능한 행범위 진단"으로 포지셔닝, "원시 이상탐지"로 과대선전 금지.
- **일반화 미검증(전면커밋 전 추가 cut 필요)**: 다중 break/컬럼·타일경계 인접 spillover·비-date 컬럼/타 불일치종·극소/극대 타일수. 현 입증은 단일컬럼 date-직렬화 break 1곳뿐.
- **하드닝 노트**: intra_tile_note를 1급 필수 타일 산출(경계 witness=직전포맷 마지막행+신포맷 첫행)·bracketed window 2차 refine로 upper bound 조이기·segment-extent 관측윈도 캡 수정·ordering vs type/format 구분 인코딩(과대플래그 방지).

**현 위치**: 북극성은 여전히 §12 REDESIGN(3 깨진 가정·대형 미구축 표면) — 하지만 **코어 가치는 싸게 de-risk됨**. → 재절단 엔진(살릴 코어: 공유 raw-read+결정론 투영+leaf-comprehension reduce·분리 스테이지·explorer-D 청킹·vision-assist 게이트)은 **그 아키텍처 푸시 의욕이 있을 때 추진할 정당성 확보**. 그 전까진 박제.
