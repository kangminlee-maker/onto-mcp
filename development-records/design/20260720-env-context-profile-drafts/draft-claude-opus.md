# 환경 컨텍스트 프로파일 — 독립 설계안 (FRONTIER / claude opus-4-8, 2026-07-20)

> blind packet 1개만 열람. 상대 설계자 초안 미참조.

## 1. 설계 요약
환경 프로파일을 set-tier와 같은 계층의 독립 순수 함수(`environment-context-profile.ts`)로 짓고,
산출을 set-tier result의 필드로 배달. 신호는 새 스캐너 없이 세 증거원(target-material-kind
dirent walk 확장 census, set-tier topology·relation, observer imports census)에서 조달. 판정은
정적 rule table을 결정론 엔진이 적용, LLM은 차원별 detection 0(침묵) 또는 상호배타 certain 충돌
(모호) 시에만 신뢰도-캡(≤likely) 유계 1패스(초기 배포는 LLM 없이 순수 규칙+정직 unknown 바닥).
출력은 단일 라벨이 아닌 차원×값×confidence×method detection 집합(폴리글랏 보존). 두 주입 기능은
각각 별도 default-off 플래그로 단계 분리 — 주의 타깃팅은 profile→per-source
`environment_attention_rank`를 candidate 단계(12484/10153) 정렬 키로 소비(라이브·즉시 검증가능),
검증·보강은 seed 이후 결정론 cross-join이 구조적 지지 disclosure만 방출(seed 불변, 소비자=발표층).

## 2. 루브릭 8답 (요지)
1. **분업선**: 규칙이 판정, LLM은 침묵/모호 잔여만. rule table 행 = {match 술어 → emit{dimension,
   value(닫힌 어휘), confidence(certain|likely|weak), method, evidence}}. LLM 트리거: detections=0
   (침묵) or certain distinct value≥2(모호). LLM은 감지된 값 집합 안에서만, confidence≤likely 캡,
   새 값 발명 금지. 유계 payload validate.
2. **추출**: 신호를 존재/경로(target-material-kind walk 확장 census)·토폴로지/관계(set-tier)·import
   (observer census)로 분해, 새 스캔 0. 각 raw→EnvironmentContextDetection, dimension별 group,
   confidence 집합 유지(단일 라벨 붕괴 금지). 충돌은 둘 다 보존+conflict 플래그.
3. **검증·보강**: seed 이후 결정론 cross-join(LLM-free). seed 개념→evidence_refs→관찰→경로→
   architecture_layer + set-tier fan-in. 근거가 생성/설정/테스트 레이어에 몰리고 fan-in 낮으면
   구조적 지지 약함 → `structural_support` disclosure. **seed 불변**(경계 유지 이유). F(b)/F(d)는
   의미 아티팩트 변이 → 기각.
4. **주의 타깃팅**: per-source 랭킹만(per-span=의미=경계위반). framework→layer_priority 정적 맵
   ("도메인 코드가 관례상 어디 앉는가"=구조 사실). `environment_attention_rank: Map<obsId,number>`,
   directive 집합 재정렬만(추가/삭제 금지). seat=selectedObservationIds(12484)→
   projectObservationsForPrompt(11640)→observationPromptPayload(10153). includeStructuralData:false
   존중(candidate 12512에 착지). ⚠️ 라이브 효과는 예산 절단 조건부 — 절단 유발 fixture 필수.
5. **set-tier 합성·격리**: profile은 별도 순수 모듈(set-tier 불변, 새 의존 0). 산출은 set-tier
   result 필드(`environment_context_profile`). 같은 granularity·성격·계층이라 필드가 개념경제 최적.
   단일 파일 경로엔 환경 없음(비목표).
6. **개념 경제**: 새 5+재사용 3. confidence는 salience/disposition과 다른 축이라 3-값 신설 정당.
   attention은 기존 order-then-slice 게이트의 정렬 키. verification은 기존 disclosure 재사용.
7. **최소 경로**: Stage0 스켈레톤(순수 규칙 계산+표출) → Stage1 attention(지금 라이브 검증가능) →
   Stage2 verification(이웃 트랙 의존) → Stage3 content_parse+LLM assist. 권장 최소=Stage0→1.
8. **검증**: rule 행/census malformed→crash, imports 부재→정직 gap(날조 금지). 골든 fixture
   (Next.js·Django·폴리글랏·unknown). 폴리글랏→language≥2, unknown→certain framework=0(공허 차단).
   off→byte-identical. attention off↔on diff(절단 유발 크기 필수). 경계 불변 테스트(최중요): 모든
   value·disclosure가 닫힌 어휘만.

## 3. §9 선택
A=(c) set-tier 필드 · B=(c) 혼합 · C=(b) 침묵 시 1패스(순수 규칙 바닥) · D=(a) per-source ·
E=(a) selectedObservationIds(12484) · F=(c) disclosure-only.

## 4. 개념 경제 표
새: EnvironmentContextProfile(필드)·EnvironmentContextDetection+confidence(certain|likely|weak)·
signal_file_census(walk 확장)·environment_attention_rank·config 키 패밀리·structural_support
disclosure kind. traceability: environment-context-profile.ts→EnvironmentContextProfile→
environment_context_profile.

## 5. 최소 실행 경로
Stage0 `environment_context_profile`(off=미호출·byte-identical) → Stage1
`_attention`(12484 rank→10153 소비) → Stage2 `_verification`(12655 이후 cross-join→disclosure) →
Stage3 `_content_parse`. 단계별 되돌리기=키 제거.

## 6. 위험·미해결
1. **(최대 약점) 주의 타깃팅 라이브 효과가 예산 압박 조건부** — 절단 없으면 no-op(공허 PASS 위험).
   실 워크로드가 candidate 예산을 절단하는지 먼저 측정. 미절단이면 배포 보류.
2. Stage2 검증은 이웃 의미 트랙 의존(독립 라이브 검증 불가) — seed 산출 착지 후 시퀀싱.
3. content_parse 6000자 excerpt truncation — 큰 manifest 잘림. (a)정직 수용 vs (b)capture 예산 상향
   (materialize-preparation 변경, 경계 리스크). 기본 (a).
4. 경계 누출 유일 방벽=닫힌 어휘 강제. free text 허용 순간 경계 붕괴. hard-block 여부 owner 확인.
미해결: 단일 파일 profile 홈; imports census on인데 observer off 시 정책(정직 gap 채택).
