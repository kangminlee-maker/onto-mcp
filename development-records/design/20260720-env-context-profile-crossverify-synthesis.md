# 환경 컨텍스트 프로파일 — 교차검증·종합 (2026-07-20)

> blind packet(`20260720-env-context-profile-blind-packet.md`)을 이종 2벌 frontier에 dispatch한
> 결과의 교차검증과 종합. draft 원본: `20260720-env-context-profile-drafts/draft-gpt-sol.md`
> (gpt-5.6-sol, codex hermetic, max)·`.../draft-claude-opus.md`(claude opus-4-8, frontier). 둘 다 packet만 열람,
> 상대 초안·repo 미접근. **A/F는 owner 확정 완료 — §0 참조.**

## 0. 최종 확정 + design-verify 개정 (owner, 2026-07-20)

design-verify(구현 전 적대 2렌즈) 반영한 **최종 스코프**. findings:
`20260720-env-context-profile-design-verify-findings.md`.

- **A = 신규 독립 아티팩트** 확정 (grounding CONFIRMED — 훅 지점 runReconstruct ~17001 실재).
- **attention 제외** (D/E 철회): 채택 seat(candidate 12484)에서 재정렬이 excerpt 생존을 못 바꿈
  (M1, 주 세션 실코드 확증) → 무효 메커니즘. 역할(도메인-밀도로 읽기 표적화)은 예산-압박에서만
  값이 있고, 제대로 하려면 파일별 excerpt 예산이라는 신규 손잡이 필요 → 이번 스코프 초과.
  **owner: attention 없이 결과 확인 후 추가여부 결정.**
- **검증·보강 제외** (F): 후속 워크스트림(flags-first, onto review 재사용).
- **∴ 이번 스코프 = 환경 컨텍스트 프로파일 아티팩트(결정론 추출) + seed-safe disclosure만.**

**적용할 verify 개정 (MATERIAL — 개정 설계):**
- **M2 경계 역량-표면화**: 프로파일을 runReconstruct 스코프에서 계산·**seed userPayload에 setter
  배선 금지**·seed 키 닫힌집합 assert(프로파일 배제 회귀가드).
- **M3 종합드롭 복원**: detection에 `scope_path`(monorepo)·confidence 어휘 단일화·상관증거 dedup
  (manifest+lockfile+import 동일선언 = 1 신호, 3 중복계산 금지).
- **M4 done-when**: A–G **계열별 positive 단언**(hollow-impl PASS 차단)·off = **부작용 0**
  (스캔·읽기·LLM·write 없음, 출력 byte-identical만 아님).
- **M5 fingerprint**: 매니페스트 내용·ruleset_version·scan cap·parser hash 전부 fold.
- **닫힌 어휘 방벽 채널 한정**: `evidence_refs`·경로·패키지명·`.env.example` 키를 프로파일 출력/
  disclosure에서 구조적으로 배제/정제(도메인 의미 누출 차단).
- **disclosure 채널 교정**: `structuredContent.disclosures` 아님 → `final-output-sections`
  (post-seed, seed-safe) + `artifactRefs`.
- **커버리지**: 프로파일 전용 known-signal allowlist(dotdir `.github` 포함) — 재사용 walk의
  dotdir-skip/depth 한계 보완.
- **content_parse·유계 LLM assist는 Stage 3(후속)**: 정적-only(config 실행 금지)·실패 taxonomy·
  새 fs-read authority는 그때 명세.

**최소 실행 경로**: Stage0 = 순수 규칙 프로파일(기존 관찰의 census+topology+imports에서 결정론
추출) + seed-safe disclosure. off = 부작용 0·byte-identical. Stage3(content_parse+LLM assist) 후속.

## 1. 수렴/발산 맵 (§9 A–F)

| 축 | claude(opus) | gpt(sol) | 판정 |
|---|---|---|---|
| A. 출력 형태 | (c) set-tier result 필드 | (a) 신규 독립 아티팩트 | **발산 → owner** |
| B. 수집 범위 | (c) 혼합 | (c) 혼합 | **수렴** |
| C. LLM 보조 | (b) 침묵 1패스+순수규칙 바닥 | (b′) 침묵/명시충돌 1패스 | **수렴** |
| D. attention 입도 | (a) per-source | (a) per-source | **수렴** |
| E. attention seat | (a) selectedObservationIds(12484) | (a) selectedObservationIds | **수렴** |
| F. 검증·보강 | (c) disclosure-only, seed 불변 | (b) disposition fold | **발산 → 종합** |

cross-family 2벌이 6축 중 4축(B/C/D/E) 완전 수렴 = 고신뢰 채택. 발산은 정확히 A·F 두 축 —
설계 공간의 실제 경합점. same-kind가 아닌 cross-kind 발산이라 union으로 판정.

두 draft가 **독립적으로 같은 최대 위험을 지목**: 주의 타깃팅의 라이브 효과는 **candidate 예산
절단이 실제 발생할 때만** 유효(절단 없으면 재정렬 no-op = 공허 PASS). 이 수렴은 강한 신호 —
검증은 반드시 절단을 유발하는 크기의 fixture를 써야 한다.

## 2. 수렴 채택 (B·C·D·E — 고신뢰)

- **B=(c) 혼합**: 새 스캔 0. target-material-kind dirent walk(maxDepth3·maxEntries200·dotdir/
  node_modules skip)에 known-signal census만 확장, 토폴로지·relation은 set-tier, import는 observer
  census 재사용. **단, A/B/C 내용 신호는 6000자 excerpt로 신뢰성 파싱 불가**(gpt 지적) → 내용 파싱은
  allowlist 재읽기 full/streaming(Stage 3).
- **C=(b) 침묵/충돌 시만 유계 1패스, 순수 규칙 바닥**: 초기 배포는 LLM 없이 순수 규칙+정직 unknown
  (claude 배포 규율). 침묵(detection=0)/모호(상호배타 certain≥2) 시에만 저장소당 1회. LLM payload
  유계(gpt 계약: ≤96 signal·≤32 candidate·≤12K자·원문/env값/도메인명 금지, 반환은 candidate_key·
  weak|strong·signal_ref만·confirmed 발명 금지), confidence≤likely 캡, 닫힌 어휘 validate.
- **D=(a) per-source 랭킹만**: per-span은 "파일 내 어디가 도메인인가"=의미=경계 위반이라 양쪽 기각.
  per-span은 실 mid-file 벤치 증거가 나온 뒤에만 별도 승격(gpt).
- **E=(a) selectedObservationIds(12484) candidate 단계**: 원문을 실제 읽는 최고 레버리지 seat,
  includeStructuralData:false 제약 회피(candidate 12512는 structural data ON). 7579 slice(160)은
  동일 rank companion(원문-읽기 무관, 최소 경로 외).

## 3. 발산 판정

> **superseded by §0 (2026-07-20):** 이 절은 종합 당시 분석 기록이다. design-verify 결과 최종
> 결정이 바뀌었다 — **attention 제외·F(검증·보강) 후속·fold 미채택**(§0 참조). 아래 fold 종합
> 서술은 이력으로만 읽어라(§4 결함 #18 정정).

### 축 A — 출력 형태: **gpt(신규 독립 아티팩트) 권고**

- claude(필드): profile은 set-tier와 granularity·성격·계층 동일 → 필드가 개념경제 최적.
- gpt(신규 아티팩트): profile은 set-tier와 **권한·실패모드·수명이 다르다** — set-tier는 관찰 코드의
  순수 LLM-free 조립, profile은 **설정 내용 파싱 + 조건부 LLM assist + ruleset_version**.

**판정 근거(개념경제 split 기준):** split을 정당화하는 것은 런타임 행동·실패모드·authority·
lifecycle 변화다. profile은 (i) content_parse의 새 실패모드(파싱 실패·truncation), (ii) LLM
assist의 새 authority(`assist.status`), (iii) `ruleset_version`의 새 lifecycle을 도입한다 —
set-tier엔 전무. 필드로 접으면 set-tier의 **결정론 불변**(재현성=set-tier의 존재 가치)이 오염되고,
Stage3에서 LLM assist가 붙는 순간 "이 아티팩트는 결정론적인가?"가 모호해져 **나중에 split 마이그레
이션 강제**. 특히 fingerprint: profile은 ruleset_version을 fold해야 하는데, 필드면 set-tier
fingerprint 의미가 변질(코드 불변인데 ruleset 갱신으로 set-tier reuse 무효화). gpt의 별도
아티팩트(`fingerprint` 자체 + `source_set_fingerprint`로 set-tier 참조)가 두 캐시 수명을 깨끗이 분리.

**단, claude 이식:** 단일 파일 경로엔 환경 없음 → 별도 아티팩트면 단순히 미생성(필드의 빈 값 문제
없음). set-tier fingerprint를 캐시 키로 재사용(claude·gpt 공통). traceability 이름 규칙(모듈→타입→
필드) 유지.

→ **owner 확정 필요**: 둘 다 개념경제를 근거로 대립. 권고는 gpt(결정론 불변 보호·미래 마이그레이션
회피). 반대 근거(claude): 지금 최소 경로는 순수 규칙이라 필드도 깨끗함.

### 축 F — 검증·보강: **종합 (측정 projection + disclosure 기본 + disposition-fold opt-in)**

- claude(disclosure-only): post-seed 결정론 cross-join, seed 불변, 소비자=발표층. seed 변이형 기각
  (경계 위험).
- gpt(disposition-fold): candidate 직후 `projectCandidateStructuralSupport`가 id·salience·
  evidence_refs만 읽어(이름·설명 미열람 → 도메인 재판정 불가) `structural_alignment` 측정 방출,
  disposition 입력에 의무 삽입.

**두 함수 분리로 종합:** owner의 두 기능이 실은 F의 두 소비 형태와 일치한다.
- **"검증"(claude)** = 구조 측정을 **사용자에게 disclosure** → 항상 안전(생성 경로 미접촉). 코퍼스
  원칙(품질·커버리지 우려는 비차단 disclosure로 사용자 결정)에 정합. 기본값.
- **"보강"(gpt)** = 구조 측정을 **disposition LLM 입력에 fold** → 구조가 seed placement를 실증
  보강. 이것이 owner가 요청한 "보강". 단 구조 신호가 생성 경로에 들어가는 **경계-민감 단계**라 별도
  opt-in.

**핵심: gpt의 measurement projection이 경계-clean**하다 — id/salience/evidence_refs만 읽고 이름·
설명 미열람, **측정치(fan-in 백분위·layer hit)만** 방출(verdict 아님), LLM이 판단. 이게 올바른 분업
(결정론=증거, LLM=판단)이다. claude의 seed-불변은 안전하나 owner가 요청한 "보강"을 과소전달(구조가
seed를 절대 못 건드리면 실증 보강이 아니라 주석에 그침).

→ 종합: **`projectCandidateStructuralSupport`(gpt, 경계-clean 측정)** → **disclosure 기본
(claude, 검증·transparency)** → **disposition-fold는 별도 opt-in(gpt, 보강)**. 구조→생성 영향은
owner가 의식적으로 켜는 단계로. claude 이식: 잘-지지 seed→disclosure 0 음성 대조, 닫힌 어휘 방벽.

**독립 검증가능성:** gpt fold는 기존 candidate 캐스케이드 안(candidates는 이웃 트랙 무관하게 존재)
→ 지금 검증가능. claude post-seed cross-join은 full seed 의존. 종합의 disclosure는 candidate 단계
측정을 쓰므로 이웃 트랙 성숙 전에도 단위 검증 가능.

## 4. 각 draft에서 이식할 우수부

**gpt→**: EnvironmentRule 행 shape(strength decisive|strong|corroborating|weak·conflict_group·
attention_delta), 확신도 합성 규칙(decisive→confirmed 등, D/G 단독 framework 금지), 구체 attention
점수표(+40 framework 경로·+30 layer·+20/+10 fan-in·-100 generated/vendor·LLM-tentative≤+5), LLM
payload 정밀 유계, **secret 처리(.env.example 키만·값 즉시 폐기·artifact/LLM payload에 secret 유입=
검증 실패)**, symlink/root-escape hard-fail, CandidateStructuralSupportProjection 측정 shape.

**claude→**: 라이브-검증가능성 기준 단계 정렬(Stage1 지금·Stage2 이웃 트랙 의존), 순수-규칙 배포
바닥 규율, disclosure 경계 논증, 이름 traceability(모듈→타입→필드), 음성 대조 규율(빈 profile→
재정렬 0·잘-지지 seed→disclosure 0), **닫힌 어휘 경계 테스트=최중요**.

## 5. 종합 설계 스켈레톤 (권고)

- **아티팩트**: `ReconstructEnvironmentContextProfileArtifact`(신규 독립, A=gpt). set-tier 불변,
  profile이 topology·relation·inventory language·imports·fingerprint를 **입력으로 읽음**. 자체
  `fingerprint`(ruleset_version fold) + `source_set_fingerprint`(set-tier 참조·불일치 시 중단).
- **detection**: 차원×값(닫힌 어휘)×confidence(certain|likely|weak)×method 집합, 폴리글랏 보존,
  충돌 둘 다 보존+플래그. 버전·module mode는 detection.properties.
- **분업**: 정적 rule table(데이터) 판정, LLM은 침묵/충돌 잔여만 유계 1패스(순수 규칙 바닥).
- **주의 타깃팅**: per-source `environment_attention_rank`, selectedObservationIds(12484) 직후
  stable sort(집합 재정렬만)→10153 소비. 절단 유발 fixture로만 검증.
- **검증·보강**: **후속 워크스트림으로 분리(현재 설계 밖)**. 방향=flags-first(onto review 재사용).
  현재 설계는 프로파일 자체만 disclosure(seed 미접촉). `projectCandidateStructuralSupport`·fold는
  후속에서 재검토(**fold 미채택** 기록).
- **단계(default-off, 키 패밀리)**: Stage0 스켈레톤(순수 규칙 프로파일 + 프로파일 disclosure) →
  Stage1 attention(지금 라이브 검증가능) → Stage3 content_parse+LLM assist(정밀 신호 확장). 완성
  seed 검증·보강 단계는 **후속 워크스트림**. 각 off=byte-identical, 되돌리기=키 제거.
- **검증 규율**: off byte-identical diff, A–G parser fixture(순서 섞어도 fingerprint 동일), 폴리글랏
  →language≥2, unknown→certain framework=0, attention은 절단 유발 fixture, 닫힌 어휘 hard-block,
  secret 유입=실패, 릴리스 전 실 파일시스템+실 callJsonAuthor on/off 양측.

## 6. owner 결정 항목

1. **[A] 출력 형태** — ✅ **확정: 신규 독립 아티팩트**(결정론 불변 보호).
2. **[F] 구조→생성 영향** — ✅ **확정: 검증·보강 후속 분리, fold 미채택**. 후속 방향=flags-first
   (onto review 재사용).
3. **[content_parse truncation]** — 6000자 초과 manifest: 정직 gap 수용(기본) vs capture 예산 상향
   (materialize-preparation 변경, 경계 리스크).
4. **[닫힌 어휘 hard-block]** — detection.value·disclosure를 닫힌 어휘로 강제하는 게 hard-block인지,
   어휘 확장이 명시 리뷰를 거치는지(경계의 유일 방벽).
5. **[스캔 상한]** — 대형 monorepo entry·depth·byte 기본값, 상한 도달 시 fail-loud 정책 확정.

## 7. FRONTIER disposition

수렴 4축(B/C/D/E) 채택. 발산 A → **신규 독립 아티팩트 확정**(개념경제 split: content_parse·LLM
assist·ruleset_version이 set-tier 결정론 불변 오염 회피). 발산 F → **검증·보강을 후속 워크스트림으로
분리 확정**(생성 중엔 프로파일 disclosure만, seed 미접촉; 후속 방향 flags-first=onto review 재사용,
revision은 근거 후). **fold 미채택** — 프롬프트-held 경계(②: LLM이 구조를 과대평가 않기)를 회피하고
생성/검증을 시간·아키텍처로 분리해 경계를 구조적으로 확보. 양 draft 공통 최대 위험(attention 예산
절단 조건부)을 검증 규율에 고정.
