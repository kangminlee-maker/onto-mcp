# Blind Packet — Environment Context Profile 설계 (2026-07-20)

> 이 문서는 **격리 병렬 설계자**에게 전달되는 blind packet이다. 주 세션의 결론·상대
> 설계자의 초안은 담기지 않는다. 증거·제약·루브릭·중립 대안만 제공한다. 당신의 산출물은
> §10 형식을 따른 **독립 설계안**이다. 파일:라인 앵커는 주 세션이 탐색한 것으로, HEAD
> (`e150589` 이상) 실코드에 대해 스스로 재검증하라.

---

## §0. 설계 원칙 주입 (필수 — 외부 모델은 이 corpus를 로드하지 않음)

당신의 설계는 아래 세 원칙을 만족해야 하며, 위반 시 감점된다.

**개념 경제 (Concept Economy).** 개념 그래프를 작게 유지하라. 새 개념(아티팩트·필드·enum·
failure kind·config 키·CLI 플래그·타입)을 추가하기 전에 가장 가까운 기존 개념을 찾아 재사용·
확장·개명·분할 중 하나를 명시적으로 택하라. 파생값은 소스 개념의 property/projection으로
유지하라. 새 이름을 만들 정당화는 런타임 행동·소유권·수명·검증·실패모드·사용자 가시 행동의
변화다. 이번 설계에서 기존 아티팩트(code inventory, set-tier result, target-material-kind)를
재사용/확장하는 경로와 신설 경로를 저울질하고, 택한 이유를 밝혀라.

**LLM/역량 경계 (LLM/Capability Boundary).** 결정론으로 도출 가능한 값을 LLM 권한에 두지
마라. 결정론 작업(파싱·매칭·카운트·직렬화·검증)은 tools/code가, 의미 작업(의도 해석·의미
부여·tradeoff 판단·산문)은 LLM이 한다. 구조적 제약은 역량 표면으로 강제하라(불가능·무효·
비수용으로 만들기). 구조·보안 위반만 hard-block하고, 의미·품질·커버리지 우려는 비차단
disclosure로 사용자에게 넘겨라. **산출된 필드·플래그·신호는 다운스트림 소비자가 그것을 읽고
출력이 바뀌기 전까지 inert다** — 소비자를 같은 변경에서 배선하거나 라이브 경로에서 효과를
확인하라.

**단계적 워크플로 (Staged Workflow).** 정성적 완료 기준을 만족하는 최소 실행 경로를 지어라.
최소는 표면적·설정·추상화를 줄이되 요구 행동·런타임 권한·증거 품질·검증 깊이를 줄이지
않는다. 위험·행동변경 작업은 default-off 경로 뒤에 두어 off일 때 현재 행동을 보존하고(diff로
증명) 명시적 opt-in으로 켜라. 완료는 mock이 아닌 실제 입력·실제 권한·의도된 런타임 경로에
대한 실제 행동으로 판정하라.

---

## §1. 무엇을 설계하는가 (문제 정의 — 중립 프레이밍)

**환경 컨텍스트 프로파일**: 재구성(reconstruct) 대상이 **어떤 성격의 코드베이스인가**(언어·
런타임·프레임워크·인프라·아키텍처 레이어)를 **결정론 신호**로 판별하고, 규칙이 침묵/모호할
때만 **유계 LLM 1패스**로 보조하는 기능을 설계한다.

**결정적 경계 (불변 — 위반 시 설계 무효):** 이 프로파일이 다루는 것은 **구현 구조·기술
성격**이지 **도메인 의미·비즈니스 로직이 아니다.** "이것은 FastAPI + Postgres + k8s 코드다"는
구조 사실이고, "이것은 급여 도메인이며 Employee·Payslip·TaxBracket이 핵심 개념이다"는 도메인
의미다. 프로파일은 **전자만** 산출한다. 도메인 의미는 **LLM이 내용을 읽어야만** 나온다 —
프로파일은 그것을 대신하지 않는다.

**두 트랙 모델:**

| 트랙 | 대상 내용 | 누가 | 온톨로지 기능 |
|---|---|---|---|
| 구조 트랙 (이 설계) | 구현 구조·기술 (환경 프로파일 + 결정론 3단 줌) | 결정론 규칙 (+유계 LLM 보조) | 가설/seed **검증·보강**, **주의 타깃팅** |
| 의미 트랙 (이웃, 이번 설계 밖) | 도메인·비즈니스 로직 | LLM이 내용 읽기 | 가설/seed **생성** |

**이 설계가 답할 두 주입 기능:**

1. **검증·보강 (verification/reinforcement).** 온톨로지 가설/seed가 선 뒤, 구조 신호가 그것을
   실증적으로 대조·보강한다. 예: "가설은 Employee가 중심 개념이라는데, import fan-in·디렉터리
   토폴로지가 실제로 그 파일에 몰리는가?"
2. **주의 타깃팅 (attention targeting).** LLM의 내용-읽기(의미 트랙의 생성 입력)를 **도메인
   내용이 몰린 곳으로 표적화**한다. 예: "Django 프로젝트니 `models/`를 우선 읽고 `migrations/`는
   후순위." 구조 신호는 의미를 **주장하지 않는다** — 단지 LLM이 어디를 읽을지 순위/예산을
   결정론으로 좁힌다. 경계는 유지된다.

의미 트랙의 생성 메커니즘 **본체**는 이번 설계 밖이지만, 주의 타깃팅이 그 입력(reading plan)을
건드리므로 **attention 신호의 소비 계약(인터페이스)은 이 설계가 정의**해야 한다.

---

## §2. 증거 A — 현재 결정론 캡처 (실코드, 재검증 대상)

현재 파이프라인은 **설정 파일 "내용"을 파싱하는 곳이 한 군데도 없다.** 언어는 확장자로만,
매니페스트는 파일명으로만 인식하고 내용은 원시 excerpt로 LLM에 넘긴다.

- **`code-structure-observer.ts`** (tree-sitter AST, LLM-free): 단일 코드 파일의 텍스트를 파싱.
  언어는 **확장자로만** 결정(`LANGUAGE_BY_EXTENSION`, TS/JS/Python 한정). 산출:
  `symbol_tiles.spans[]`(gapless line 파티션, kind·symbol_names·signature_line·doc_first_line),
  `hierarchy[]`, 그리고 **opt-in** `imports[]`(specifier 원시 문자열 + census). 디렉터리·타
  파일·설정 내용은 읽지 않음. 단일 파일 한정.
- **`comprehension-set-tier.ts`** (다중 파일 조립, LLM-free, 순수): 이미 관찰된 파일들의
  inventory를 입력받아 산출: **디렉터리 토폴로지/롤업**(`SetTopologyNode[]`,
  parent/child/descendant_file_count), **import relation**(보수 resolver — set 내부만 해소,
  bare/absolute는 `external_or_bare`, 미해소는 명시 사유·추측 금지), **overview render**(20K
  budget, 파일별 language·lines·symbols), **fingerprint**. **언어/프레임워크/런타임 분류는
  생산하지 않음** — language는 확장자 파생 토큰의 passthrough.
- **`code-structure-inventory-projection.ts`** (40K bounded): observer inventory를 크기
  제한으로 projection. 새 신호 없음 — demotion 순서 `hierarchy → imports → spans`.
- **`target-material-kind.ts`**: 매니페스트 basename이 등장하는 유일한 곳. `CODE_BASENAMES`
  (`package.json`·`tsconfig.json`·`cargo.toml`·`go.mod`·`pom.xml`·`dockerfile`·`makefile`·
  `gemfile`…), `CODE_EXTENSIONS`(`.json/.yaml/.toml/.env/.lock/.proto/.graphql`…). **파일명·
  확장자로만** 매칭해 ref를 `code|spreadsheet|document|database|mixed|unknown`으로 버킷팅.
  내용은 열지 않음. 디렉터리 detection은 dirent만 읽음(maxDepth 3, maxEntries 200,
  dotdir·node_modules skip).
- **설정 파일 내용의 현 처리** (`materialize-preparation.ts`): 설정/데이터 확장자
  (`.json/.yaml/.toml/.env/.lock`)는 whole-capture에서 **의도적으로 제외**되고 **6000자 leading
  원시 slice**(`content_excerpt`)로만 캡처. `dockerfile/makefile/gemfile` basename은 whole
  캡처. 어느 경우든 **파싱 없는 raw text**로 seed 단계에 도달. `JSON.parse`·`yaml.load`·
  의존성/프레임워크 추출은 reconstruct 어디에도 **없음**(grep 0 hit).

---

## §3. 증거 B — 결정론 신호 인벤토리 A–G

각 신호는 결정론으로 추출 가능(파싱·매칭·정규식). 확실성은 "무엇을 판정하나"에 따라 다르다.

| 계열 | 판정 대상 | 확실성 | 현재 가용 |
|---|---|---|---|
| A. 매니페스트 **내용** | 언어·런타임 버전·프레임워크·패키지매니저 | 거의 확정 | 파일명만 인식, 내용 미파싱 → 신규 |
| B. 인프라/배포 파일 | 컨테이너·오케스트레이션·IaC·CI·플랫폼 | 거의 확정 | 원시 excerpt만 → 신규 |
| C. 프레임워크 설정 파일 | 프레임워크 정체 | 거의 확정 | 없음 → 신규 |
| D. 경로/디렉터리 관례 | 아키텍처 레이어 | 중(보강용) | 토폴로지 있음, 레이어 분류 없음 → 부분 신규 |
| E. import 성격 | 외부 프레임워크/lib·stdlib 런타임 | 중~강 | specifier 원시 캡처만, 버킷팅 없음 → 부분 신규 |
| F. 파일 헤더/shebang | 실행 런타임 | 중 | 없음 → 신규 |
| G. VCS/분포 메타 | 생태계·지배 언어 | 약(보조) | 없음 → 신규 |

- **A**: `package.json`(deps/devDeps→프레임워크, engines→node 버전, type→esm/cjs),
  `pyproject.toml`·`requirements.txt`, `Cargo.toml`·`go.mod`·`pom.xml`·`Gemfile`, `tsconfig.json`,
  버전핀(`.nvmrc`·`.tool-versions`), 락파일(패키지매니저 확정 + 정확 의존 그래프).
- **B**: `Dockerfile` FROM, `docker-compose.yml`, k8s manifest(apiVersion/kind), Helm/terraform/
  serverless, `.github/workflows/*`, 플랫폼(`vercel.json`·`fly.toml`·`wrangler.toml`),
  `.env.example` 변수명.
- **C**: `next.config.*`·`vite.config.*`·`angular.json`·`manage.py`·`conftest.py`·
  `application.yml`·`appsettings.json` — 존재만으로 프레임워크 단독 확정 다수.
- **D**: `api/`·`core/`·`ui/`·`controllers/`·`models/`·`services/`·`migrations/`,
  DDD(`domain/`·`application/`·`infrastructure/`), 테스트(`test/`·`__tests__/`·`e2e/`), 빌드
  산출물(`dist/`·`venv/`·`__pycache__/` — 무시 대상), 모노레포(`packages/`·`apps/` +
  `pnpm-workspace.yaml`·`turbo.json`·`nx.json`). **단독 결정 금지 — 강신호 보강만.**
- **E**: 상대경로=내부 / bare 패키지명=외부 의존(→알려진 프레임워크 사전 매칭) / stdlib
  (`os`·`sys`·`fs`)=언어·런타임 확정. fan-in/out은 set-tier relation에서 이미 계산 가능.
- **F**: shebang(`#!/usr/bin/env python3`·`node`·`bash`), `// @ts-check`, `from __future__`,
  Dockerfile `FROM node:20`을 정규식으로(전체 파싱 없이).
- **G**: `.gitattributes` linguist override, `.gitignore` 생태계 힌트, 확장자별 파일 수 분포.

**폴리글랏 주의**: 실제 코드베이스는 다중 판정(Python 백엔드 + TS 프론트 + Terraform 인프라)이
난다. 프로파일은 단일 라벨이 아니라 **확신도 붙은 detection 집합**이어야 한다.

---

## §4. 증거 C — 의미 트랙 소비 경로 & 주입 seat (실코드)

seed 생성은 `run.ts`의 3단 LLM 캐스케이드(모두 `callJsonAuthor` 경유):

1. **`writeCandidateInventory`** (run.ts:12483) — **여기서 실제 source TEXT를 읽음.**
   `projectObservationsForPrompt(..., { observationIds: requiredCoverageObservationIds,
   contentExcerptCharLimit: 1200, includeStructuralData: true })` (12512). 관찰 선택 =
   `selectedObservationIds(directive)` (12484).
2. **`writeCandidateDisposition`** (12606) — 동일하게 excerpt 읽음 (12630).
3. **`writeOntologySeed`** (12655) — 최종 seed. **`includeStructuralData: false`** (12771) —
   여기선 각 관찰의 summary/location만 보고 raw text·structural_data는 못 봄. source text는 이미
   한 단계 위에서 소비됨.

**선택 게이트 (전량 읽지 않음):** `ontologySeedObservationIds` (run.ts:7579) = candidate가
`evidence_refs`로 인용한 관찰만, disposition-evidence 우선, dedup, `slice(0, 160)`
(`ONTOLOGY_SEED_OBSERVATION_LIMIT`). **라이브 경로에 내용 기반 랭킹은 없음** — 입력 id 순서뿐.
예산/절단: `observationPromptPayload` (10153), 단일 문서 확장 게이트 (10174),
`documentExcerptProjectionBudget`, `compactStructuralDataForPrompt` (10186).

**유일한 결정론 내용 랭킹**: opt-in Layer-2 semantic map 내부 — `admissionCompare`(code =
widest-span-first, comprehension-semantic-map-core.ts:136) + `maxNodes` cut (852).

**주의 타깃팅이 물릴 seat (증거로 제시, 처방 아님):**
- **per-source**: `ontologySeedObservationIds`(7579)의 dedup+slice(160) — 여기서 per-source
  attention 랭킹이 순서를 교체/재정렬. 더 이른 `selectedObservationIds(directive)`(12484)은
  source TEXT를 실제 읽는 곳이라 더 이른 seat. 조립: `projectObservationsForPrompt`(11640) →
  `observationPromptPayload`(10153).
- **per-span**: Layer-2 `admissionCompare`+`maxNodes`(core:852), `classifyFrontierCore`(465)
  frontier 예산의 companion.
- **⚠️ 제약**: per-span attention 신호는 excerpt를 실제 읽는 **candidate 단계(12512/12630)** 또는
  Layer-2에 착지해야 함. 최종 seed dispatch(12771, includeStructuralData:false)엔 무의미.

---

## §5. 증거 D — 출력 계약

- **최종 온톨로지 seed**: `ReconstructOntologySeedArtifact = Record<string,unknown>`
  (artifact-types.ts:1444), 실 shape는 프롬프트 상수 `ACTIONABLE_ONTOLOGY_SEED_JSON_SHAPE`
  (run.ts:7219) + `ontology-seed-validation.ts`가 강제.
- **candidate**: `ReconstructCandidateInventoryCandidate` (artifact-types.ts:1316) —
  `{candidate_id, candidate_kind, name, description, salience:"high"|"medium"|"low",
  evidence_refs}`. "confidence"는 `salience`로 표현.
- **disposition**: `ReconstructCandidateDisposition` (1338) — `{candidate_id, disposition_id,
  target_seed_refs, rationale, evidence_refs}`.
- **Layer-2 seed**: `SemanticSeedProjection` (comprehension-semantic-map.ts:537) —
  `{authority:"non_authoritative", provisional:true, nodes[], refuted_disclosure[], ...}`.
  per-boundary confidence = `disposition` enum(`structural_location_only |
  adversarial_confirmed`), "verified" 없음.

---

## §6. 증거 E — 선행 실험 맥락 (전략 근거)

task #10 실험(disclosure: `benchmark/20260720-semantic-map-dd6-live/`·`-midfile-live/`)과
owner 전략:
- **LLM으로 "구조"를 읽는 것**(semantic_map_code)은 값을 못 해 **미승격**. 결정론 줌+프로파일이
  더 잘 함 → 추가 투자 중단.
- **LLM으로 "도메인 내용"을 읽는 것**은 필수 — 결정론이 절대 못 함.
- 두 진술은 **대상이 달라** 정합. 환경 프로파일은 **결정론 구조 트랙의 마지막 조각**이며, LLM이
  구조 재도출에 낭비하지 않고 도메인 내용에만 집중하도록 구조를 완비하는 역할.
- 결정론 3단 줌(이미 착지): 줌3=디렉터리 롤업(set-tier), 줌2=인벤토리 40K projection, 줌1=span
  원문 슬라이스. 프로파일은 이 줌을 **보강**하는 방식으로 붙는다.

---

## §7. 제약 (설계가 지켜야 할 불변)

1. **경계 불변**: 구조 신호는 도메인 의미를 산출·주장하지 않는다. 출력 어디에도 "이것은 X
   도메인이다" 류 의미 라벨이 없어야 한다.
2. **규칙 우선**: 결정론 규칙이 판정하고, 유계 LLM은 규칙이 침묵(인식 신호 없음)/모호(충돌
   detection)할 때만 개입하며 그 역할은 신뢰도 보조에 한정.
3. **확신도 있는 detection 집합**: 단일 라벨 금지. 폴리글랏·다중 프레임워크를 표현.
4. **default-off opt-in**: off일 때 현재 행동 byte-identical(diff 증명), 명시적 opt-in으로 on.
   되돌리기는 키 제거로 충분해야.
5. **결정론 소유**: id·경로·직렬화·fingerprint·검증은 tools/code 소유. LLM 보조 출력은 유계
   payload만.
6. **소비자 배선**: attention 신호·verification 결과는 다운스트림 소비자가 읽어 출력이 바뀌기
   전까지 inert. 소비 계약을 명시하고, 어디서 라이브 효과가 나는지 지정.
7. **개념 경제**: 기존 아티팩트(inventory·set-tier·target-material-kind) 재사용/확장 vs 신설을
   저울질하고 근거 제시.
8. **fail-loud**: 신호 추출 실패·전제 위반 시 조용한 fallback 금지, 명시적 실패.

---

## §8. 루브릭 (설계안이 반드시 답할 것 — 채점 축)

1. **분업선**: 어느 판정이 결정론 규칙이고 어디서부터 유계 LLM인가? 규칙 테이블의 형태와 LLM
   개입 트리거(침묵/모호)를 구체화하라.
2. **추출 아키텍처**: A–G 신호를 어떻게 수집·정규화·합성하는가? 파일 스캔 범위(단일 파일 관찰과
   달리 프로파일은 **저장소 수준** 신호가 필요 — 어떻게 조달하나)?
3. **검증·보강 주입**: seed 가설을 구조 사실에 대조하는 메커니즘은 어디에 어떻게 붙는가(새
   post-seed 패스? disposition에 fold? disclosure-only?)? 소비 계약은?
4. **주의 타깃팅 주입 + 계약**: attention 신호의 **출력 shape**은? per-source 랭킹인가 per-span
   가중인가 둘 다인가? 어느 seat(§4)에 착지하며, 생성 소비자가 그것을 어떻게 읽는가? §4의
   includeStructuralData:false 제약을 어떻게 존중하나?
5. **set-tier와 합성·격리**: 프로파일이 set-tier 토폴로지·relation·fingerprint와 어떻게
   합쳐지고 어떻게 분리되나? 별도 아티팩트인가 set-tier result 확장인가?
6. **개념 경제 결산**: 도입하는 새 개념(아티팩트·필드·config 키·enum)을 나열하고, 각각 기존
   개념 재사용이 왜 불가한지 정당화하라.
7. **최소 실행 경로**: 이 설계의 default-off 스켈레톤은 무엇이며, 최초 opt-in으로 켜지는 최소
   행동은 무엇인가?
8. **실패·검증**: 신호 추출·합성의 falsifiable 완료 기준. 무엇이 틀렸을 때 fail하는가?

---

## §9. 중립 대안 (선택지 — 주 세션의 추천 없음, 당신이 판단)

각 축에서 하나를 택하거나 새 대안을 제시하라. 나열 순서에 선호 없음.

- **A. 프로파일 출력 형태**: (a) 신규 독립 아티팩트, (b) 기존 `structural_data`의 필드,
  (c) set-tier result 확장, (d) target-material-kind detection 확장.
- **B. 신호 수집 범위**: (a) 저장소 스캔을 프로파일이 자체 수행, (b) 기존 관찰
  (`materialize-preparation`)에 신호 캡처를 추가해 재사용, (c) 둘의 혼합.
- **C. 유계 LLM 보조**: (a) LLM 전혀 없음(순수 규칙 + 정직한 "unknown"), (b) 규칙 침묵 시만
  1패스 분류, (c) 항상 1패스지만 규칙 결과에 신뢰도만 부여.
- **D. attention 신호 입도**: (a) per-source 랭킹만, (b) per-span 가중만, (c) 둘 다,
  (d) include/exclude 필터(순위 아님).
- **E. attention 착지 seat**: (a) `selectedObservationIds`(directive, 12484), (b)
  `ontologySeedObservationIds` slice(7579), (c) Layer-2 admission(core:852), (d) 신규 게이트.
- **F. 검증·보강 메커니즘**: (a) 신규 post-seed 검증 패스, (b) disposition 단계에 fold,
  (c) disclosure-only(사용자 판단), (d) candidate salience 조정 입력.

---

## §10. 산출물 형식 (당신이 반환할 것)

1. **설계 요약** (5–8줄): 택한 아키텍처의 한 문단 서술.
2. **§8 루브릭 8개 답** (각 축별 명시적 결정 + 근거).
3. **§9 중립 대안 선택** (A–F 각각 택 + 1줄 이유).
4. **개념 경제 결산 표**: 새 개념 | 기존 대안 | 재사용 불가 이유.
5. **최소 실행 경로**: default-off 스켈레톤 → 최초 opt-in 행동, 파일/함수 수준 착지 지점(§2·§4
   seat 참조).
6. **위험·미해결**: 이 설계의 최대 약점 2–3개와 owner 결정 필요 항목.
7. **명시 금지**: 상대 설계자의 초안을 추측하거나 참조하지 마라. 당신의 독립 판단만.
