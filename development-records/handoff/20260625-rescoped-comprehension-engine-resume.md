# RESUME — 재절단(re-scoped) 이해 엔진 설계 착수 (option C)

> **▶▶ 설계 종결(4× 교차검증·material 0). 다음 단계 = Cut-2. 새 작업은 `development-records/handoff/20260626-cut2-resume.md`에서 시작.** 이 문서는 *설계+교차검증 이력*(PROGRESS-1~3) 보존용.
> 목적: `/clear` 후 fresh 세션이 **이 문서 하나로 재절단 엔진 설계부터 바로 시작**. 날짜: 2026-06-25. main baseline `c2b9c41`.
> ⚠️ 이건 *거부된 북극성을 다시 만드는 게 아님*. 교차검증이 REDESIGN한 **3 깨진 가정을 1행부터 baked-in**하여 *살릴 코어*만 설계한다.
> 상위 SSOT: `development-records/design/20260625-unified-explore-frame-recursive-comprehension-design.md` (§1-11 북극성 draft·§9 a~i=SUPERSEDED·**§12 REDESIGN 교차검증**·**§13 Cut-1/1b 실증**).
> 메모리: [[unified-comprehension-engine-track]] · [[design-validation-ultracode-onto]] · [[contract-runtime-gap-ledger]](P0.5 HELD #144).

## ✅ PROGRESS (2026-06-25) — 설계 DRAFT + owner 적대리뷰 반영
신규 설계 doc **작성·정련 완료**: `development-records/design/20260625-rescoped-comprehension-engine-design.md`. §2에 R1-R12 + onto issue-002 baked-in. **이 세션 5대 진화 + §9 신설**(owner와 적대적 재검토로 수렴):
1. **§4 = 2-tier 이해 에포크**(재시작 단위↑): Layer1=결정론 관측(LLM 0, cross-epoch 재사용=resume substrate) / Layer2=LLM 닿는 전부(comprehension-version·비전 geometry·deep-mode를 한 **coarse digest**로 fold) / 에포크 내부 **진행 저널**(크래시 내성). 경계 = "substrate인가"(판단·누수) → **"LLM 닿나"**(기계적·validator). silent-stale-seed 구조적 불가, sound 재사용만 보존.
2. **§2 tenet: 구조는 깊이를 결정하지 않는다**. 구조=읽기를 싸게·완전하게+비용상한; *깊이(주의)*는 의미적이라 LLM·재귀가 결정(§5.1). 구조는 GATE 아닌 **INFORM**. → **P1(잔차 게이트 blind) 소멸**, §3.2 배제 게이트 제거·완전 coverage.
3. **§0/§1/§3.3 재포지셔닝: 엔진 = 독해(comprehension), *판정자 아님***. "의미있는 읽기"이지 탐지/진단 아님. 오류 가려내기(구조적·"균일-틀림" 포함)=**소비자**(review lens 판단+deliberation / reconstruct 구성). review 안 재귀LLM 역할 **과대평가 금지**(owner). merge 이질성표면화=*서술*이지 detection 아님.
4. **§5 분리: 엔진 reduce(§5.1 종료·§5.4 honesty·§5.6 seam) vs 소비자 reduce(§5.2 review finding-reduce R6·§5.3 reconstruct R7)**. 공유 = comprehension reduce만.
5. **§9 자기-적대 리뷰**(owner와 P1-P12 + 작은것3 심층): **전부 *방향 확정*·본문(§3-§5) 반영**, 남은 건 *잔여 실측*(경험값·SSOT 캘리브)=후속 cut 게이트. 핵심 해소: **P3** 수렴=출력 byte-hash 아닌 *입력 레벨 자식-ground 변화*(§4 캐시가 jitter 차단) · **P2** R11=monoid seam 아닌 *별도 결정론 post-pass*(의미 제안/결정론 검사) · **P4** confidence=*국소화*(스칼라 collapse 금지·limiting witness) · **P9** label=*위치 앵커+잠정 라벨*(국소화는 결정론 ground라 라벨불확실 견딤; =P0.5 unblock) · **P10** 깊이=*압축증거 위 의미 triage*(Cut-2b 실측) · **P5** 렌더=*구조 디스크립터 키*(픽셀 아님) · **P6** window=SSOT+bracketed refine · **P11**⊆P3(monotone+reopen cap) · **P12** bounded 스트리밍 집계 · 작은것3(synthesis=기존스키마+태그·R7 estimate 전파·Cut-4→4a/4b 분리). DISSOLVED=P1(tenet)·CLARIFIED=P7(독해≠판정)·SHARPENED=P8(공유=comprehension reduce만). **패턴**: 거의 모두 세션 테마로 환원(결정론 ground에 키·국소화·의미제안⊥결정론검사·구조≠깊이·독해≠판정).
## ✅ PROGRESS-2 (2026-06-25) — 설계 교차검증 실행·반영 완료 (§10 박제)
**교차검증 실행됨**: ① ultracode `wf_c8f31646-b2c` ② onto `.onto/review/20260625-10a94291`(6 lens+deliberation). **판정 = SOUND_WITH_REVISIONS**(REDESIGN 아님; logic lens 0건 = 설계 자체 모순 없음). **수렴 high = DET-1 ≡ issue-004**(양 리뷰어 독립 포착; self-review+나 둘 다 놓침): Layer 2 에포크 키가 *수동* comprehension-version에 LLM-touch 동일성을 맡겨 모델/route/프롬프트 변경 시 stale 재사용 silent. **전 findings 본문 반영 완료**(§10 disposition 표):
- **TIER 1(004/DET-1 + 003)**: 키 = 자동 파생 **`llm_touch_fingerprint`**(model_id·route_identity·provider·프롬프트해시·equivalence·triage digest·schema/tool ver); comprehension-version 강등(비-권위 override); input-closure provenance manifest. §3.4·§4.1·§4.2·§4.4.
- **007 3부**: (a) R11 모순=§2를 §5.6에 맞춤(seam→post-pass) (b) `exact-value tile`→**`value-signature tile`**(exact 멤버십=별도 `exact-membership post-pass`) (c) monoid=이름유지+**계약 정의**(항등·재그룹불변·법칙보존).
- **mediums**: 001=§5.7 `ComprehensionArtifact` 거버넌스 계약+facet 모델+spine→소비자 매핑 · 002=triage **non-authoritative until Cut-2b**+depth0 audit/escalation/frontier · 008=`lens`→**`comprehension reader`**(엔진 leaf 읽기) · 009=§4.5 B1/F1/D1/M6/M2 acceptance 매트릭스(orphan 0) · 005=범위 **spreadsheet 전용**(owner 결정).
- **신규 §10 테스트**: model-identity-rotation·triage-rotation·grouping-invariance를 §7 baked-in 목록에 추가.

## ✅ PROGRESS-3 (2026-06-26) — 교차검증 2·3·4차 = 수렴 종결 (설계 §10.1/§10.2/§10.3)
설계 doc에 **4회 교차검증 누적**(전부 박제). **distinct material 1차 8 → 2차 2 → 3차 2 → 4차 0 = 수렴 달성**.
- **2차 onto**(`20260626-3568e63d`): fingerprint **staged·non-circular 계약**(policy ⓑ↔allocation ⓒ 분리·non-circular-key 테스트, §4.1/§4.4) + baseline **mandatory-or-explicit**(§5.7/§3.4). 반영.
- **3차 ultracode+onto 병행**(`wf_459fd26f-986` 22agent + `20260626-8e908493`): 둘 다 sound_with_minor_revisions; *상보적* DET-1 갭 1건씩 — onto=단일-패스 캐시(size gate 아래) **ⓐ+ⓑ pre-image** 누락(§2 tenet2·§4 선결 정정), ultracode=§3.4 line115 propagation miss(policy만 fold 정정). 반영·stale 참조 0.
- **4차 ultracode+onto 병행**(`wf_1c39112e-29f` 11agent·4→0 + `20260626-9c3a9f7d`): **둘 다 material 0** — onto finding0·highest severity none·6/6 lens·회귀0; ultracode `converged_material_zero`·fix_C/fix_D clean·"design ready to close". **설계-문서 수준 결함 0.**

**▶ 다음 = Cut-2/Cut-2b**(throwaway 하니스, production 배선 0): Cut-2=segmented value-tile 투영 (a)-Q1 순수-파생성, Cut-2b=의미 triage viability(pruning 비율·숨은영역 충실·오판 정직마킹). 비용 발생 → **owner go 대기**. 통과 시 Cut-3(vision PoC)·Cut-4a(resume 계약)·Cut-4b(comprehension 품질). 구현은 Cut-4a/4b 통과+승인 후. **설계+4회 교차검증 = 종결(self-consistent·material 0 수렴 달성)**; 잔여 위험 전부 §7 cut 실측 귀속.

## ⚡ ON RESUME — DO THIS FIRST (설계+교차검증 종결 상태)
1. **설계 SSOT 읽기**: `development-records/design/20260625-rescoped-comprehension-engine-design.md`. §0-§9 = 설계 본문(교차검증 반영 완료), **§10 = 교차검증 결과·disposition 표**(가장 최신 권위). 이 doc 하나가 현 상태 전부.
2. **다음 작업 = Cut-2/Cut-2b**(§7): throwaway 하니스(production 배선 0)로 segmented value-tile 투영 순수-파생성(Cut-2) + 의미 triage viability(Cut-2b) 실측. **비용 발생 → owner go 대기**. 통과 시에만 Cut-3→4a→4b.
3. 프로세스 규율: 큰 blast radius(P0.5 벽·신규 vision 능력·resume 계약)라 **각 cut = 교차검증 게이트**, 한 번에 production 금지, 구현은 Cut-4a/4b 통과+승인 후.
4. 아래 §"baked-in 제약"(R1-R12)은 *설계에 입력된 REDESIGN 원제약*(이력); 최종 형태는 설계 doc + §10이 권위. R8/R11은 교차검증서 정정됨(위 각주 참조).

## 무엇을 설계하나 (살릴 코어 — 북극성 아님)
교차검증이 살린 코어(§12): **공유 raw-read + 결정론 투영(explorer-D) + leaf/raw-comprehension *한정* same-schema 재귀 reduce**. 이건 **comprehension substrate**이고, 기존 파이프라인을 *대체* 아니라 *피드*한다.
- **CARVE OUT (분리·비통합 스테이지로 유지)**: review의 전역 판정(finding→issue→stance→deliberation→synthesis)·reconstruct의 계약-게이트 구성(gate/obligation/provenance). → "한 엔진 통합"은 거짓이었음(R5/R12). 엔진은 *leaf 이해*만 공유하고 두 상위 파이프라인은 분리.
- **포지셔닝(§13 실증)**: 엔진의 가치 = **국소화/진단**(행동 가능한 행범위), *원시 탐지 아님*(Cut-1/1b서 탐지는 무승부). load-bearing 메커니즘 = **intra-tile 경계 증거**(서브타일 관측) → 1급 필수 산출로.

## ★ baked-in 제약 (REDESIGN R1-R8 + onto; 1행부터 반영)
- **R1/R2 결정성**: §9-h "comprehension-version 미회전"은 **틀림**. *read set을 shaping하는 모든 것*(비전-청크 geometry·deep-mode·LLM-도출 구조)은 **substrate**(resume 회전)다. 둘 중 하나: (a) 청크 geometry를 **explorer-D 결정론 소유** descriptor(header_rows/header_confidence/merged_ranges/columnResidualKey)로, 비전은 non-authoritative 캐시 hint를 chokepoint서 재적용(P0.5 §2b 헤더-에스컬 패턴); 또는 (b) partition descriptor+deep-mode flag+comprehension-version을 **reuse digest에 fold**(run.ts content_excerpt/budget 선례). + §10에 resume-across-re-render·comprehension-only-rotation 테스트.
- **R1 P0.5 acceptance**: 5 HELD 블로커를 명시 통과기준으로 — B1 reuse-hash·F1 cache type-lock(store-key≠lookup-key)·D1 populate↔apply dead-zone·M6 cross-sheet recompute·M2 unzip early-abort. (M6/M2는 layering과 직교, 별도 처리.)
- **R3 vision**: explorer-V를 **1차에서 강등** → gated vision-assist(고잔차 AND header_confidence:'low'에서만). **explorer-D가 청킹/결정성 소유**, 타일링은 explorer-D 결정론 pre-pass(merged_ranges/header_confidence/dimensions/columnResidualKey)라 비전은 *이미 bounded된 타일*에만(순환 제거). 신규 능력 3종(렌더러·멀티모달 callLlm·vision-model INV-MODEL-1+modality+이미지토큰 예산축)을 §11 위험에 명시, **렌더러+멀티모달 PoC spike를 최소증명 전에** 게이트.
- **R4 종료**: 전역 well-founded 측정 `T=Σ remaining_iteration_budget`이 *모든 LLM 액션마다 strictly 감소*(재확인 포함)=정직한 상한. 수렴=pure early-exit. `convergence_state` **content-derived·reversible**(자식 모순 표면화 시 converged→converging). trustStatus는 구조적 resume gate로만(수렴 routing 금지).
- **R6 review reduce**: additive "모든 fine finding 보존"은 O(N)=reduce 아님 → **per-node finding budget**(material/non_material split+sortBySeverityAndId cap; 하위는 flat side-channel) 또는 **bounded-depth fan-in**(leaf→sheet→workbook). §10서 root finding 수·토큰 vs subtree 크기 sub-linearity 측정.
- **R7 reconstruct band**: subsumption/discrimination을 **explorer-D distinct_count/distinct_value_vocab 분모로** 결정론화(LLM은 제안만); empty-band는 기존 `limitation_backed`/`frontier_required` 재사용; §10에 known empty-band 컬럼.
- **R8 merge 결정성**: LLM 전에 **canonical child-partition**(explorer-D 키 정렬: sheet idx·row-window·columnResidualKey), reduce-노드 membership을 async 완료순서서 분리; k-ary merge 단일콜; **모순탐지는 explorer-D value-signature tile**(타입/distinct-vocab 불일치 = bounded 시그니처)에 ground(prose 아님, B-5 anti-laundering 정합). [교차검증 TIER 2b 정정: 이름 `exact-value tile`→`value-signature tile`; exact 멤버십은 별도 `exact-membership post-pass`(§5.6).]
- **R9 honesty fold**: is_lower_bound=absorbing OR; confidence=conservative(min) per-claim-lineage; LLM은 claim prose만; 부모가 자식 is_lower_bound 누락 시 fail-closed validator.
- **R10 cost**: residual 캡 상향 or 2차 신호(is_estimate 동률 방지); **신규 예산 축**(max leaves/workbook·max iter/leaf·max parent re-derive)을 benchmark-backed SSOT(G4)로 source, INV-BENCH-1은 *검증 방식*만 거버넌스(값 공급 아님 — category error 수정).
- **R11 relational**: cross-section 의무(INV-SHARD-1 sealed cross_sheet_reference_integrity)는 local monoid가 구조적으로 못 봄. [교차검증 TIER 2a 정정: merge에 thread하면 순서의존→monoid(R8) 깨짐. **seam 아님** → monoid 밖 **별도 결정론 post-pass**(의미 관계-제안 + exact-membership 무결성 검사). 설계 §2 R11·§5.6.] §10에 2-sheet shared-key 의무.
- **R12 concept economy**: synthesis-map-reduce.ts와 **REPLACE vs COEXIST 명시**(refactor synthesis INTO monoid[INV-MATERIAL-1+승인] 또는 monoid는 raw-leaf만+기존 synthesis로 피드[2층, 명시적 비-통합]).
- **onto issue-002 honesty**: "exhaustive 완료" 언어를 **"bounded/capped 부분완료"**로 정직화(success 언어·아티팩트 주장).

## de-risk됨 vs 아직 열림
- ✅ **de-risk(§13 Cut-1/1b)**: 국소화/진단 코어 가치 실재·견고(타일정렬 + off-grid 둘 다, 재현; intra-tile witness 메커니즘; clean 환각0).
- ⬜ **열림(전면커밋 전 추가 cut)**: 다중 break/컬럼·타일경계 인접 spillover·비-date 컬럼/타 불일치종·극소/극대 타일수. + ordered cuts Cut-2(사이드카 파생성 (a)-Q1)·Cut-3(explorer-V 렌더+라벨 단독 vs explorer-D ground truth)·Cut-4(full).

## 코드 앵커 (재절단이 닿는 곳)
- observer(스트리밍 fflate+saxes, 렌더러 없음): `src/core-runtime/spreadsheet-structure-observer.ts` (cardinality #141·columnResidualKey·header_confidence·merged_ranges·distinct_value_vocab).
- review 파이프라인(렌즈·reduce·trustStatus·continuation·synthesis): `src/core-runtime/review/*`, `.onto/authority/core-lens-registry.yaml`, synthesis-map-reduce.ts.
- reconstruct resume/reuse 해시·adapter_version: `src/core-runtime/reconstruct/run.ts`(sourceObservationsReuseSha256, content_sha256+adapter_version fold), `materialize-preparation.ts`(projectInventoryForPrompt).
- INVARIANTS.md (INV-BENCH-1·INV-MODEL-1·INV-SHARD-1·INV-MATERIAL-1·obligation-coverage·source-safety).
- P0.5 post-mortem: `development-records/tracking/20260623-p05-wiring-crossvalidation-r1-findings.md`.

## 교차검증 산출물 (참조)
- **재절단 설계 교차검증(이번)**: ultracode `wf_c8f31646-b2c` + onto `.onto/review/20260625-10a94291`(SOUND_WITH_REVISIONS; 수렴 high DET-1≡issue-004; issue-001/002/003/005/007/008/009). → **설계 §10에 박제·전 findings 반영 완료**.
- (원안 단계) ultracode 북극성리뷰 `wf_e39056a8-4b3`(REDESIGN 31/41·블로커7) — 설계 §12에 박제.
- (원안 단계) onto 북극성리뷰 `.onto/review/20260625-9707b6bd`(high×5; issue-001/002/006).
- 실험: Cut-1 `wf_5028ed14-cf9`·Cut-1b `wf_be56e925-f5f` (fixture는 /tmp=휘발; 결론은 §13).
- range-ref(보류, 같은 누수 계열 선례): `development-records/design/20260625-spreadsheet-rangeref-enum-resolution-design.md` §11.

## 규모 경고
재절단도 **큰 아키텍처 푸시**(P0.5 벽 직결·신규 vision 능력·resume 계약 변경). 설계 후 **반드시 교차검증**, 그다음 ordered cut 최소증명, 그다음 owner 승인 후 구현. 한 번에 production 금지. 마스킹 재도입 금지(레포 정책).
