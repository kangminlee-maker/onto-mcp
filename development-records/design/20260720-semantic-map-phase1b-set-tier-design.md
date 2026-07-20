# semantic-map Phase 1b — 멀티파일 set-tier + relational seam 최종 설계 (2026-07-20, **v3 최종안**)

> 상위 SSOT: `20260715-semantic-map-multi-artifact-extension-design.md` §2 원리4·§5 /
> `20260718-semantic-map-multi-artifact-phase1-detailed-design.md` §4·§5.4.
> **저작 방법 (owner 표준 1회차)**: isolated frontier 병렬 설계 2벌 —
> fable-5 (본 문서 v2, git `3eafb65`) + gpt-5.6-sol@xhigh
> ([sol 설계](20260720-semantic-map-phase1b-sol-design.md), blind packet
> [패킷](20260720-semantic-map-phase1b-sol-design-packet.md)) — 를 상호 교차검증
> (3-렌즈 리뷰, [sol→fable](20260720-semantic-map-phase1b-crossreview-sol-on-fable.md),
> fable→sol 서브에이전트 리뷰)한 뒤 종합했다. 각 결정의 출처를 [fable SDx]/[sol DDxx]/
> [리뷰-ID]로 표기한다. v2 전문과 리뷰 반영 이력은 git `3eafb65` 참조 (본 v3가 대체).
> 상태: **최종안 — owner 결정(§7) 대기. 구현 착수는 실험2 종결 + OD-1·OD-4·OD-8 확정 후.**
> 구현 시점 제약: 관찰 스키마·런타임 변경은 실험2 사후 처리 완료 전 금지.

## 0. 종합 판독 — 수렴/발산

**수렴(양 설계 독립 일치 — 고신뢰 채택)**: ①별도 boolean 옵트인+기존 code 옵트인과 conjunction
②span 코어 무변경·병렬 set reducer(경로-트리 수학은 구간-인접 수학과 다름) ③persisted
inventory에서 파일 트리 재계산(메인 루프 무접촉) ④import = 전용 정형 관찰 필드(signature_line
파싱 기각) ⑤sidecar/census는 observation 배열 밖 top-level 파티션 + 병렬 resume 검증
⑥seed 주입은 신규 set-scoped 표면(가짜 observation 금지) ⑦전역 프롬프트 카탈로그 등록 금지
⑧의미 게이트 필요(구조 green 불충분).

**발산(해소 결과)**:
- aggregate fingerprint: fable=기존 배열에 `__set_tier__` 합성 엔트리 vs sol=**별도 ON-전용
  set fingerprint 필드** → **sol 채택** (fable→sol 리뷰 HIGH-2가 합성/오염 벡터를 실증:
  `perObservationFingerprints`는 spreadsheet-포함 공유 배열이라 어떤 set 항목도 push 금지).
- C2(실험2) FAIL 처분: fable=자동 축소모드 분기 vs sol·리뷰 M-09=**owner 재결정 트리거**
  → sol 채택 (단일파일 측정으로 cross-file 가치 자동 판정은 인과 비약). 축소모드(FD11)는
  분기 조건이 아니라 owner가 선택 가능한 실현 모드로 유지.
- 의미 게이트 형상: fable=단일 비열위 블라인드 비교 vs sol=**3-arm×5회 paired + hallucination
  trap + 실질 승리 요구(G11)** → sol 채택 (sol→fable 리뷰 M-04가 비열위 기준의 복사-통과
  결함을 적발 — 동률 통과 봉쇄).

## 1. 범위 [sol §1 채택]

- 포함: 복수 code observation의 set 조립, 경로 계층 set 노드 + 파일 root graft, 정형 import
  추출·보수적 해석·LCA 배치, 유계 set synthesis + set seed synthesis, 분리 sidecar/census/
  resume/fingerprint/preflight, set-scoped seed 표면.
- 비포함: span reducer 일반화, 스프레드시트 변경, 기존 옵트인 의미 변경, 공유 계약/budget
  bump, 실환경 module resolution 재현, 동적 import/alias/외부 패키지 추적, multi-root/
  symlink/중첩 repo 의미 결정, **문서집합**(파일별 projection 계약 부재 — 후속).
- **완료 주장 범위 = 멀티파일 code set-tier, 단일 canonical source root** [sol O2·O8 권고].

## 2. 최종 설계 결정 FD1~FD14

- **FD1 옵트인** [fable SD8 ≡ sol DD01]: 별도 boolean `semantic_map_code_set_tier`
  (부재=off; 스칼라 키 authority `RECONSTRUCT_EXECUTION_SCALAR_KEYS` 1줄 — 실코드 확증).
  유효 = `semantic_map_code` ∧ 본 키; set=true ∧ code=false는 암묵 활성화가 아니라
  `requires_semantic_map_code` 구조 오류 [sol]. 키 이름은 OD-1.
- **FD2 병렬 set reducer** [fable SD1 ≡ sol DD02/DD03]: span 코어 문자 그대로 무변경.
  신규 모듈(`comprehension-reduce-set` 책임군: normalize/topology/partition/graft/
  relation-owner/reduce). set-tier walk는 완료된 파일 root projection을 **opaque leaf**로
  보고 set 노드만 post-order 합성 [sol]. 파티션 검증기는 sol DD03의 11항 규격 채택(canonical
  상대경로 단일 표현·`.`/`..`/빈 segment 거부·파일 root 전단사 membership·strict prefix
  descendant·단일 parent·도달성·경로 충돌 거부·위반 시 LLM 호출 전 실패) + **경로 비교는
  정규화된 성분 배열 단위**(문자열 startsWith 금지 — `src` vs `src2` 클래스) [sol→fable M-08].
- **FD3 조립 = persisted inventory 재계산 + 동등성 검증** [fable SD2 ≡ sol DD04]: post-loop에서
  `foldCodeStructureInventory` 재실행(순수·결정론— 리뷰 양측 확증). 재구성 트리는 저장된
  observation fingerprint·root key와 일치해야 하며 **불일치 시 해당 관찰 제외가 아니라 set
  조립 전체 중단**(fail-closed) [sol]. 메인 루프 보관 Map 대안 기각(메모리·resume 비재사용).
- **FD4 import 관찰** [fable SD3 ≡ sol DD05]: `code-structure-observer.ts`에 전용 정형 필드
  `symbol_tiles.imports?: ObservedCodeImport[]`({from, to_specifier, resolved_in_set:null})
  + **추출 정직성 census**(`import_nodes_seen/imports_recorded/duplicates_observed/omitted/
  omission_reasons`) [sol]. specifier는 **절단-해석 금지** — bound 초과는 원문 길이+안정
  해시와 함께 `specifier_truncated` 사유로 미해석 보존 [sol→fable M-10]. 필드 emission은
  set-tier 옵트인 경로 한정(관찰 결과 자체는 additive-optional; extractor_logic_sha256 회전은
  의도된 1회). **동시 수정 필수**: `code-structure-inventory-projection.ts` — 강등 순서
  hierarchy→imports→spans + `symbol_tiles.imports` sections 정직 기록 [fable v2 ct-1].
  구현 시점: 실험2 사후 처리 종료 후.
- **FD5 보수적 resolver** [sol DD06 채택 — sol→fable M-01 해소]: 관찰 집합 한정, 유일
  매칭만 `resolved_in_set`. 사유 enum 7종(`resolved_unique/external_or_bare/unsupported_form/
  no_member_match/ambiguous_member_match/inventory_truncated/parse_unavailable`) + FD4의
  `specifier_truncated`. PY 계열은 **path-segment 정규화 가능한 정적 상대 import만** 해석
  대상 — 절대/상대 구분이 불가한 형은 `unsupported_form`으로 null 유지(**실패 방향 = 거짓
  연결이 아니라 미해석**) [fable→sol 갭-1 명시화]. alias/외부/동적/실환경 resolver 기각.
- **FD6 LCA relation 소유 + 유계 노출** [sol DD07]: resolved relation은 양 끝을 포함하는
  최저 공통 set 노드가 1회 소유; unresolved는 from 최근접 set. 조상 복제 금지. prompt cap
  초과 relation은 `total/exposed/omitted/omission_reason` 정직 공시; **canonical inventory
  cap 초과는 부분 map이 아니라 preflight 중단** [sol — silent drop 봉쇄, sol→fable M-02 해소].
- **FD7 sidecar/census 파티션** [fable SD4·SD7-개정 ≡ sol DD08]: sidecar optional top-level
  `set_tier` 블록 — sol DD08 스키마 채택(status enum `complete/not_applicable/
  skipped_capacity/failed_structure/failed_provider`; synthetic observation_id 발급 금지;
  member는 실재 id만; node identity = canonical set path + node fingerprint;
  `not_applicable`은 후보<2 한정 — capacity/provider 실패의 강등 금지). census에도 top-level
  `set_tier` 요약(+`excluded_refs: [{observation_id, reason}]` — 사유 구조화
  [sol→fable M-06]) — **`by_observation`·complete-partition 불변식·기존 resume 검증기
  무접촉**(inv≡ct 수렴 HIGH의 구조적 해소). spend는 기존 top-level 스칼라에 누적.
  sidecar `set_tier`와 census `set_tier`는 한 커밋으로 착지(결합 쌍).
  breaker/dispatch-incomplete의 item_id 어휘(observation_id)에 set 노드 **불진입** —
  checkpoint는 sidecar 전용 [fable→sol 갭-2 명시화].
- **FD8 set-tier 전용 resume** [fable SD4병렬 ≡ sol DD09]: 이중 파티션. set 검증기는 sol
  DD09의 11항(스키마 버전·전체 input fingerprint·member 집합 정확 일치·topology·relation
  digest·node 중복/unknown/missing·node input fingerprint·child projection fingerprint·
  프롬프트 계약 digest+cap 값·출력 스키마·status 일관성)을 **재계산 검증**(존재+해시만으로
  재사용 금지) [sol→fable M-07 해소]. 노드 단위 재사용 허용; malformed는 해당 set 파티션만
  폐기·재조립(observation resume 무접촉).
- **FD9 프롬프트 계약·표면** [fable SD5 ≡ sol DD10 + ct-4]: 신규 계약 2종
  `code-set-node-synthesis`·`code-set-seed-synthesis`를 **별도 dict
  `CODE_SET_RECONSTRUCT_AUTHORING_PROMPT_CONTRACT`**로 신설(기존 CODE 계약 dict 등록 금지 —
  whole-dict sha가 전 1a fingerprint 회전 [fable v2 ct-4]; CG-1 금지는 양 설계 수렴).
  seed 소비 표면 = `SemanticSeedBundle.set_tier?` 신규 슬롯(기존 observations 배열
  무변경) [sol DD10 — 단 `SemanticSeedBundle`은 신규 wrapper 개념: 기존 flat 배열 반환
  구조(run.ts:10122-10217)에 대한 **추가 top-level payload 필드로 실현**하고 정확한 착지
  지점은 구현 단계 A에서 실 타입 확인 [fable→sol DD10 단서·sol 미결 10]). set overview
  렌더 전용 char budget 상수(per-kind, set fingerprint에만 fold [fable v2 ct-2]).
  출력 타입은 기존 1a projection 타입 재사용 우선, 표현력 부족 시 임의 확장 금지·owner
  회부 [sol DD10/O6].
- **FD10 unary passthrough** [sol DD11]: direct child ≥2 또는 소유 relation ≥1일 때만
  synthesize. unary는 의미 무변형 passthrough — validator가 child payload와 canonical
  digest 동일성을 검사(R9: runtime의 의미 authority 침범 봉쇄).
- **FD11 실현 모드 2종 + fingerprint 표현** [fable SD5b + sol→fable M-05]:
  `set_tier_realization: "llm" | "deterministic"`. deterministic 모드 = 경로 계층 + 파일
  root 결정론 라벨 + relation 나열(LLM 층·G-SEM 계열 게이트 비적용). realization 값과
  렌더러/projection 계약 버전을 set fingerprint pre-image에 fold — **모드 전환 시 상호
  재사용 구조 차단**(양방향 전환 거부 테스트 포함). 모드 선택은 OD-7(실험2 처분)의 owner 결정.
- **FD12 이중 preflight·동시성 1** [sol DD12 ⊃ fable SD7]: 조기 structural preflight(관찰
  루프 전 — 후보 수·경로 중복·set 노드 수·최소 수요) + post-loop execution preflight(완료
  member·실 수요·relation·렌더 문자·output 토큰·X7 누적·set 전용 캡 전부 — sol DD12 조건식
  채택). 초과 시 **호출 0으로 skip**(`skipped_capacity` — 부분 set 금지), 1a 산출물·resume
  유효 유지(FD7 격리가 보장). 동시성 1 고정(값도 fingerprint fold). set 전용 캡 상수군
  [sol §7.1 12종] — 공유 config·X7 값 무접촉. 대규모 레포에서 set-tier가 잔여 예산 의존으로
  체계적 생략될 수 있음을 리스크로 공시 + **"지원 주장 최대 규모에서 set-tier 실제 생성"을
  완료 게이트에 포함** [sol→fable M-03 최소수정; 예산 선예약은 대규모 운용 후속 결정].
  비용 주장 금지 3항(§7.3) 채택.
- **FD13 fingerprint·재사용 완결성** [sol DD13 채택 + fable→sol HIGH 2건 반영]:
  기존 kind-agnostic aggregate는 **어떤 경로에서도 무변경** — set 항목의
  `perObservationFingerprints` push **금지**(스테이지 결과에 별도
  `setTierAggregateFingerprint: string | null` 필드) [fable→sol HIGH-2]. pre-image =
  sol DD13 목록(member fingerprints·topology·imports·relations·resolver/predicate/schema
  버전·프롬프트 digest·전 캡 값·동시성·옵트인) + FD11 realization. **완결성 집행 지점
  명시**: status가 `complete`(또는 정확한 `not_applicable`)가 아니면
  `setTierAggregateFingerprint = null`을 반환하고, authored-artifact 재사용 게이트
  (`writeFreshAuthoredYamlDocument` 호출부)는 null일 때 set-tier 참조 재사용을 명시 분기로
  거부 [fable→sol HIGH-1 — "별도 확인"의 실제 코드 지점]. status를 pre-image에 넣는 대안
  기각(identity와 eligibility 분리) [sol].
- **FD14 partial map 승격 금지** [sol DD14]: 조기 snapshot의 후보 전원이 유효한 1a root
  projection을 가져야 set synthesis 시작. 누락 시 `member_projection_incomplete`로 set-tier
  미생성(1a 결과 보존·subset을 set map으로 표시 금지·omission census 기록). unsupported/
  no-inventory 관찰은 후보 자체에서 제외되며 census `excluded_refs`로 공시 — **G-SET류
  커버 술어의 정의역 = code_structure_inventory 보유 후보** [fable v2 gf-1 ≡ sol §5.1 census].

## 3. 완료 게이트 (falsifiable — sol G1~G12 채택 + 보강)

sol 설계 §8의 G1~G12를 게이트 SSOT로 채택하고 다음을 보강한다:
- **G9 보강** [fable→sol MEDIUM]: 조건 4 앞에 "`code-set-node-synthesis` 실호출 수 ≥1"
  선행 단언(전-unary fixture의 공허 통과 봉쇄 — fixture에 형제 ≥2 디렉터리 강제).
- **G3/G-SET 정의역** [fable v2 gf-1]: 커버 술어는 FD14 정의역 기준 + 혼합(지원+미지원)
  fixture에서 excluded_refs 공시 단언.
- **G6 보강** [fable v2 inv-2]: 합성 capped/lower-bound 자식으로 set ground fold의 honesty
  플래그 true→true 전파 non-vacuous 단위 검증 추가.
- **G8 보강** [fable→sol HIGH-1]: incomplete set block(각 실패 status)에서
  `setTierAggregateFingerprint === null` + authored artifact 재사용 불성립 단언.
- **G11**(의미 게이트) = 3-arm(관계 포함/관계 삭제/1a-only)×5회 paired, cross-file 사실 4·
  file-local 보존 2·hallucination trap 1, blind judge·negative control 무효 시 재설계
  [sol — fable G-SEM-SET 대체]. 원시 소스 전문 대비 우월 주장은 범위 밖.
- **G12 보강** [sol→fable M-03]: 지원 주장 최대 규모(OD-4 캡 값 기준) fixture에서 set-tier가
  실제 생성됨을 단언.

## 4. 검증 계획

sol §9(단위/골든/결정론 E2E/live/회귀 + property-based 불변식 4종) 채택 + fable v2 §4의
보강분(혼합 파일셋·예산압박 경로·bounded projection 강등·honesty 전파) 병합. mock은
wiring/schema/resume/cap 검증 전용 — 제품 의미 완료 증거 불인정 [양 설계 수렴].

## 5. 구현 순서

sol §10 단계 A~G 채택 (A=owner 승인+실 타입 확인 → B=구조/schema → C=import/resolver →
D=topology/reducer → E=fingerprint/preflight/resume → F=프롬프트/downstream → G=live 검증).
각 단계 완료 조건 = 해당 게이트 non-vacuous 통과. 전 단계 공통: 실험2 사후 처리 종료 전
런타임/관찰 코드 변경 금지.

## 6. 리스크

sol §12 R1~R15 채택(+ fable v2의 G8류 parity 비보호 백로그 노트, 대규모 기아 공시). 특기:
R12(persisted inventory가 트리 재구성에 불충분할 가능성)는 단계 A에서 실물 확인 — 부족 시
owner 재결정.

## 7. Owner 결정 항목 (통합)

| ID | 결정 | 권고 (양 설계·리뷰 합치) |
|---|---|---|
| **OD-1** | 옵트인 키 이름·설정 스키마 승인 | `semantic_map_code_set_tier` 별도 boolean |
| **OD-2** | 최초 완료 주장 범위 | code-only·단일 root (문서집합은 별도 설계 후) |
| **OD-3** | resolver 범위 | 관찰집합 한정 보수적 resolver |
| **OD-4** | set 캡 12종 수치 | live 2파일+dry census 후 보수 확정 (수치 미정 시 제품 완료 불가) |
| **OD-5** | provider 실패 시 처분 | per-file 보존 + set-tier degraded 명시 |
| **OD-6** | set 출력 타입 | 기존 1a projection 타입 재사용, 부족 시 회부 |
| **OD-7** | 실험2(C2) 처분 → FD11 모드 | PASS=llm 모드 live 게이트 진행 / FAIL=owner 재결정(deterministic 모드 대안 검토 — 자동 강등 아님) / 불확정=experimental OFF 유지 |
| **OD-8** | live 게이트(G10~G12) 대상·spend 승인 | 소형 2파일(실제 import 관계 실재 — 착수 전 에지 비공집합 단언 [sol 갭]) |

## 8. 종합 기록

- 입력: fable v2(3eafb65, 3-렌즈 리뷰 MATERIAL 7 반영본) · sol 독립 설계(be303f0, blind
  packet) · sol→fable 교차리뷰(M-01~M-10, blocker 0) · fable→sol 교차리뷰(HIGH 2·MEDIUM 1·
  갭 3, DD 전건 실코드 판정).
- 교차리뷰 MATERIAL 처분: sol→fable 10건 전건 반영(M-01→FD5, M-02→FD6, M-03→FD12/G12,
  M-04→G11, M-05→FD11/FD13, M-06→FD7, M-07→FD8, M-08→FD2, M-09→OD-7, M-10→FD4);
  fable→sol 3건 전건 반영(HIGH-1→FD13 집행지점, HIGH-2→FD13 배열 격리, MED→G9 보강);
  갭 3건 반영(FD5 PY 실패방향·FD7 breaker 불진입·단계 B sidecar strict schema 확인).
  기각 0.
- 수렴율: 구조 축 8/8 독립 수렴(§0) — 동종 아닌 이종(claude/gpt) 계열 수렴이라 신뢰 가중.
  발산 3건은 전부 리뷰 증거 기준으로 해소(§0).
