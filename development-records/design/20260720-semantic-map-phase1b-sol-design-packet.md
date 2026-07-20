# Phase 1b set-tier 독립 설계 의뢰 패킷 (gpt-5.6-sol 전용, 2026-07-20)

> 성격: **격리 병렬 설계**(owner 표준: isolated frontier ≥2 병렬 설계 후 교차검증)의 sol arm
> 입력 패킷. 이 패킷이 입력의 전부다 — 다른 Phase 1b 설계안의 존재를 가정하거나 참조하지
> 말 것. 산출물은 이후 상호 교차검증·종합의 한 축이 된다.

## 과업

onto-mcp reconstruct의 semantic-map(재귀 LLM 의미 지도)을 단일 파일(1a, 구현 완료)에서
**멀티파일 set-tier + relational seam**(Phase 1b)으로 확장하는 **상세 설계**를 독립 저작하라.
구현 계획 수준까지: 설계 결정(ID 부여·결정·근거·기각 대안), falsifiable 완료 게이트,
검증 계획, owner 결정 항목, 리스크/미결. 한국어. 코드 앵커는 아래 정찰 보고를 인용하라.

## 규범 (상위 설계 SSOT 발췌)

**[20260715 확장 설계 SSOT — 원리 4]** 멀티파일 = cross-container 티어: 코드레포·문서집합은
단일 파일이 거의 없다(owner). 유예됐던 relational seam을 "파일-집합 → 파일 → 파일-내 노드"
상위 티어로 구현한다. 관찰은 이미 멀티파일; comprehension이 소비 + cross-file seam 필요.

**[20260718 Phase 1 상세 설계 §4 — Phase 1b 프레임 전문]**
- set-tier 노드: region 판별 합집합 `{kind:"span",...} | {kind:"set", path}`. 자식 = 하위
  디렉터리 set 노드 또는 파일 root 노드(관찰 경계 횡단). partition 검증기는 span 연속성 대신
  경로-prefix 포함 + 중복 없음을 강제 (fail-closed 대칭물).
- relational seam = import 에지: AST import를 관찰-시 인벤토리에 기록(`imports: [{from,
  to_specifier, resolved_in_set|null}]`), set 노드 ground에 정렬·중복제거로 접고, synthesis
  입력에 유계 `relations`로 노출.
- 조립: per-observation 파일 트리들을 경로 계층으로 graft한 combined trace 위에 동일 L2 walk.
  aggregate fingerprint = per-observation fingerprint들 + set 위상 + import 에지 + config.
- 예산: per-observation X7 preflight는 combined tree의 fan-out을 못 막는다 — 1b는 set-tier
  preflight 캡을 정의해야 하며, 동시성·output-budget 상호작용 검토와 live 2-파일 수용 기준이
  1b 완료 조건에 포함된다 (O-3).
- 1a와 분리 이유: cross-observation 조립·sidecar 신설은 리스크 축이 다르다 (INV-SCOPE-1).

**[레포 규율 — 위반 시 material]**
- G-SS: 스프레드시트 경로 산출물·골든 바이트 불변. 기존 1a code 경로도 옵트인 OFF에서 바이트
  불변(G-OFF).
- 옵트인: settings boolean, 부재=off, 코드 내 기본값 인라인 금지.
- 회전 격리(DD10·ct-F2 전례): 공유 회전 노브(계약 버전·budget 상수) bump 금지 — 신규 상수는
  per-kind 신설·해당 kind fingerprint pre-image에만 값으로 fold. LLM-가시 내용을 형성하는
  캡·상수는 fold 누락 시 silent-stale(재사용 키 미회전) 클래스.
- census 정직 공시: 생략·절단·미지원은 결정론적으로 구별 가능한 사유로 기록(silent drop 금지).
- 1a 선례: 프롬프트 계약은 CG-1 전역 카탈로그 등록 금지(전역 sha가 무관 fingerprint 회전) —
  code 전용 계약 분리가 선례.

## 실코드 정찰 보고 (문맥-무 정찰자, 2026-07-20, HEAD 8c1fcef — 검증된 앵커)

[1] per-observation 오케스트레이션: runSemanticMapStage run.ts:3688, 루프 run.ts:4205
`for (const observation of eligibleObservations)` — 관찰 간 완전 독립(공유는 X7 러닝예산·
breaker·perObservationFingerprints 배열뿐). code 분기 processCodeObservation(run.ts:3924).
결과는 projectionByObservation: Map<observation_id, projection>에 관찰별 독립 저장 —
cross-observation 병합 지점 없음.

[2] 코어 어댑터의 span 전제: ReduceCoordAdapter(comprehension-reduce-core.ts:37-89)는 1-D
연속 span 공간 하드코딩(spanStart/End 정렬·overlap 검사 :143/:150/:158, 시임 인접성
`spanEnd(a)+1===spanStart(b)` :211). 코드 어댑터 containerEquals=(a,b)=>a.file===b.file
(comprehension-reduce-code.ts:108)이 cross-file 병합 원천 차단(에러 문구가 1b 예고).
set의 "경로-prefix 포함+중복 없음"은 span 인접성과 근본이 다른 관계(트리 포함 vs 구간 인접)
— 기존 어댑터 재사용은 (a) path의 합성 정수 인코딩 억지 또는 (b) 병렬 코어 함수 신설 중
택일. HierarchyFoldNode의 leaf/children 재귀(container-first build :389-400)는 파일 root를
set 트리 leaf로 끼우는 조립에 자연스러움.

[3] aggregate fingerprint: run.ts:4618-4629 —
sha256(stableJson(sorted {observation_id,fingerprint}[])), kind-agnostic. 소비부
run.ts:16929→16965(authoredArtifactReuseMatch)는 해시 문자열만 봄. 개별 code fingerprint =
semanticMapCodeObservationFingerprint(run.ts:2774-2808, values-only preimage).

[4] X7 preflight: SemanticMapStageConfig(run.ts:2522-2537) — 이미 stage 전체 공유 러닝예산
(관찰 순차 누적). code 체크 run.ts:3986-3996: priorSpend+census누적+수요 > max_synthesize_calls.
set-tier를 post-loop "가상 관찰"로 동일 패턴 1회 추가 적용 가능.

[5] sidecar/resume: ReconstructSemanticMapSidecarObservation(artifact-types.ts:2673-2680) —
1 row = 1 실재 observation_id. resume 진입 prepareSemanticMapResumeContext(run.ts:3488),
검증 buildSemanticMapResumeValidationArtifact(run.ts:2950, sidecar 블록 :3244-3335) —
unknown_id/duplicate_id/missing_required_ref 전부 observation_id 매칭 기반. set-tier 노드는
실재 observation_id가 없어 기존 observations 배열에 끼우면 resume 검증기가 거부하거나
"1 row=1 실재 관찰" 불변식이 깨짐 — 신규 최상위 필드 + 병렬 resume 파티션이 필요.

[6] import 에지 소스: TS_KIND/PY_KIND에 import_statement→"import" 매핑은 존재하나
CodeSymbolSpan에 specifier 필드 없음(signature_line 140자 유계 원문뿐 — 비구조화).
symbolNameOf는 name 필드만 봐서 import 노드에서 빈 값 가능성 높음. **판정: 관찰 스키마 확장
필요**(specifier 추출 필드). resolved_in_set은 관찰이 아니라 set 조립 시점 계산(관찰은 파일
단위라 다른 파일 존재를 모름).

[7] seed projection: mergeSemanticSeedProjections(run.ts:2655-2675)는 관찰 간이 아니라 한
스프레드시트 관찰 내부의 컬럼 간 병합. seed 프롬프트 주입 경로 전체가 "실재 observation_id
1개 = payload 슬롯 1개" 구조(run.ts:10201-10217 등) — 여러 관찰에 걸치는 set 노드를 넣을
기존 슬롯이 없음. set-tier는 기존 표면 파라미터화가 아니라 신규 프롬프트 표면 필요.

[8] G-OFF/G-SS 접촉면: codeEligible 게이트(run.ts:3720-3728)가 code 분기 전체를 감쌈 — 동일
패턴의 신규 게이트로 미접촉 보장 가능. per-kind 상수는 공유 config에 넣지 않고 별도 top-level
const(+code fingerprint fold)가 확립된 선례. **실물 위험**: processCodeObservation의
trace/nodesByKey는 로컬 변수로 폐기(run.ts:3982) — set-tier 조립 시점에 파일별 트리가 없음 →
(a) persisted inventory에서 재계산(결정론·LLM-free) 또는 (b) 메인 루프에 보관 Map 추가 중
택일. 미결: set-tier 옵트인 키(기존 semantic_map_code 재사용 vs 별도 키) — 기존 결정(O-1)은
code kind boolean만 다룸.

## 실험 증거 (live 실측 — 설계 트레이드오프 입력)

- 1a 의미 게이트(G-SEM) 역사: "구조 게이트 전부 green이어도 의미 없는 산출이 통과한다"는
  리뷰 지적(gf-F1)으로 블라인드 judge 의미 게이트를 신설했고, 실측에서 v1 0/5 FAIL(결정론
  flat outline 완승) → DD6′(frontier 소스 본문 봉투)+DD10(렌더 기아 해소) 후 재실험 1/5
  FAIL — 단 answerable 집합에서 outline 포괄-상회·지는 문항 0(실질 개선), 원시 소스 전문
  arm에는 8문 전패(fit 파일에서 맵은 원시 소스 cover 불가).
- 실험2(진행 중): 원시 소스가 doc 예산(200,000자)에 잘리는 8,556줄 파일에서 중첩 3-조건
  ①OFF(head 200K) ②+bounded 결정론 인벤토리(40K) ③+맵(40K)으로 C1(③vs① ON 가치)·
  C2(③vs② 맵 한계 기여) 측정 예정. C2 FAIL이면 set-tier의 LLM 층 가치도 재검토 대상.
- 비용 실측: 단일 8,556줄 파일 synthesize 419콜(스테이지 공유 예산 2,400의 17%) — 수백~수천
  파일 레포에서의 예산 함의를 설계가 다뤄야 함.

## 산출 계약

마크다운 단일 문서. 필수 절: ①설계 결정(ID·결정·근거·기각 대안 — 특히 [2][5][7]의 갈림길
각각에 명시적 결정) ②falsifiable 완료 게이트(공허 통과 차단 명시) ③검증 계획(단위/골든/
E2E/live) ④owner 결정 항목 ⑤리스크·미결. 위 정찰 앵커 인용 필수. 다른 설계안 참조·존재
가정 금지.
