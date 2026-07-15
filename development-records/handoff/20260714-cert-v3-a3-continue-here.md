> **SUPERSEDED (2026-07-15)**: A-3는 PR #198로 머지 완료(main `a4d7cba`) — shared-root
> fixture·V1 구조증명·4-fixture applicable-set 배선 전부 착지. 이 문서의 "이어가기" 작업은
> 종결됐다. 현재 상태·남은 백로그는 `IMPLEMENTATION_MAP.html` M4 카드와 메모리
> `onto-mcp-cert-v3-a3-progress-20260713` 참조. 이력 참고용으로만 보존.

# cert v3 A-3 이어가기 — 다음 세션 시작점 (2026-07-14)

선행 완료: A-1(PR #194 머지) · A-2(PR #196, `feat/cert-v3-a2-validator-harden`, 오픈) ·
**A-3 clean-target-v1 게이트 슬라이스**(이 브랜치 `feat/cert-v3-a3-fixtures`).
설계 SSOT: `development-records/design/20260712-review-cert-v3-fixture-mece-design.md`.
A-3 원 시작점 `20260713-cert-v3-a3-start-here.md`(A-2 브랜치에 존재)를 이 문서가 이어받음.

## 재개 시 상태 검증 (먼저 실행)

```
pwd                                   # /Users/kangmin/Documents/onto-mcp
git branch --show-current             # feat/cert-v3-a3-fixtures 여야 함
git log --oneline -3                  # 아래 landed 커밋 확인
git fetch origin main && git rev-parse --short origin/main   # b746512 기준
npx vitest run src/core-runtime/review/semantic-quality-gate.test.ts   # 40 pass 여야
```

이 브랜치는 **origin/main(b746512)에서 분기** — A-2와 독립(둘 다 머지된 A-1 위). A-2/A-3는
서로 다른 파일이라 머지 순서 무관.

## 선행조건 해소 (재조사 불필요)

"candidate/retry 사전-unit 10분 hang×3"의 정체 = review 실행 **첫 유닛 `lens`(prep/scout)의
라이브 LLM 콜이 per-review 데드라인(~10분)에 걸려 킬**된 것. 코드 hang 아니라 **I/O-wait
시그니처**. `--rehearsal`은 더미 키 + mock realization + 워커 미스폰(`review-cert-run.mts:508`)
→ **라이브 콜 0회**라 구조적으로 이 hang 도달 불가 → **무-spend 산출물(fixture+배선+V1/V2+
rehearsal)의 블로커 아님**. 라이브 probe/A-4에서만 유효(이미 timeout + `--resume` 복구 존재).
`REVIEW_EXECUTION_UNIT_IDS`(review-execution-units.ts:10) 첫 항목이 `lens`.

## 핵심 발견 (A-3 실작업 재정의)

**A-1a가 이미 게이트 브랜치 + 게이트레벨 V2 테스트를 주입형 expectations로 완비**했다
(`cleanTargetExpectations()` semantic-quality-gate.test.ts:1071, `sharedRootExpectations()`
:1141). 테스트 주석(:1053-1055)이 "**the FIXTURES presets + real target blobs land in A-3**"
명시. 즉 A-3 = 주입형 스탠드인을 **실 FIXTURES 프리셋으로 승격 + blob 저작 + SSOT 수렴(드리프트
제거) + V1 구조증명 + manifest 배선**. 게이트 브랜치 로직 자체는 이미 있음(추가 저작 불요).

## landed (이 브랜치 — clean-target-v1 게이트 슬라이스)

- `SemanticQualityGateFixtureId`에 `"clean-target-v1"` 추가(semantic-quality-gate.ts:2-5).
- FIXTURES 프리셋 `clean-target-v1` 추가 — 기존 주입형 `cleanTargetExpectations()`와 **값
  정확 일치**(telemetry-label/debug-export decoy, materialTerms=[], expectsNoMaterialDefects
  +requiresBoundaryPreservation).
- `benchmarkFixture` blob 추가(review-pipeline-benchmark.ts, `if (fixtureId === "clean-target-v1")`):
  무결함 `summarizeChannel` + `telemetryLabel` + `debugChannelState`(경계 decoy). SSOT 불변식
  준수(TS-구문 문자열 blob, 실 모듈 아님).
- `export semanticQualityFixturePreset(id)` **SSOT 접근자** 추가(structuredClone 반환) →
  `cleanTargetExpectations()`가 실 프리셋 resolve. 주입형 사본 드리프트 불가.
- fixtureId-resolve 테스트 추가(프리셋이 실제 FIXTURES 등록됐음 증명).
- 검증: 게이트 40 pass · full 2895 pass · typecheck clean · 무-regression.

## 남은 A-3 (우선순위 순)

### 1. shared-root-target-v1 게이트 슬라이스 (clean-target 패턴 미러)

기존 `sharedRootExpectations()`(:1141)는 anchor `src/target.ts`로 **review-pipeline의
`passingReviewRecord()`/`passingIssueArtifacts()` 재사용** 중(피기백). 실 fixture는 자체
blob+anchor+전용 아티팩트가 필요(honest fixture, 라이브 probe에서 실 모델이 blob을 읽어야 함).

- **타입**: `"shared-root-target-v1"` 추가.
- **blob** `src/shared-root.ts`(benchmarkFixture 브랜치): `rawFormat`(JSON.stringify undefined
  = 공통근원) ← `unstableFormat`·`alternateFormat` 둘 다 delegate(두 표면결함 공유) + `truncate`
  off-by-one(독립결함) + `lensId` 경계 decoy. **두 표면결함이 rawFormat 공통 코드경로를 공유**해야
  V1 구조증명이 성립(단일 assert 아님).
- **FIXTURES 프리셋** `shared-root-target-v1`: materialTerms ["unstableformat","json.stringify",
  "undefined"], boundaryUncertaintyTerms(lensId 계열), `expectedSharedCauseAnchorPairs:
  [[["unstableformat"],["alternate"]]]`, targetAnchor `src/shared-root.ts`.
- **전용 full-12 아티팩트 빌더**(≈100줄): `sharedRootReviewRecord`/`sharedRootArtifacts`/
  `SHARED_ROOT_FINAL_OUTPUT` — `passing*`를 anchor `src/shared-root.ts`로 각색 + 두 material
  finding(unstableFormat/alternate) shared_cause 관계 + lensId 비물질 decoy. **12 check 전부
  pass**해야(shared-root은 clean-target과 달리 축소 안 함, 풀 12 emit). grounding은 material
  issue text에 `src/shared-root.ts` 앵커+evidence_refs+lens 필요.
- `sharedRootExpectations()` → `semanticQualityFixturePreset("shared-root-target-v1")` 수렴.
  기존 shared-root 게이트 테스트(:1264~1308, passing* 재사용)를 새 shared-root 아티팩트로 **재작성**
  (anchor 이동으로 grounding 깨지므로 불가피). preset-resolve 테스트 추가.

### 2. V1 구조증명 (scripts/fixture-defect-probe.ts 확장)

기존 V1 transpile-eval 유틸(A-1c)은 결함을 실행-증명. fixture별 재정의(설계 §D5/MF-5):
- **clean-target**: 실행증명 **면제**(결함 0). 대신 **구조검사** — blob에 물질결함 부재(summarizeChannel
  이 total·string 반환) + decoy 존재(telemetryLabel/debugChannelState 심볼 존재) 확인.
- **shared-root**: 두 표면결함이 **공통근원(rawFormat) 코드경로 공유**를 **구조적으로** 증명(단일
  assert 아님 — 두 함수가 같은 rawFormat 호출을 공유함을 AST/구조로 확인). + 기존 2 fixture
  결함 실재는 이미 A-1c가 커버.

### 3. manifest 배선

- `SEMANTIC_FIXTURE_IDS`(review-pipeline-benchmark.ts:33, bench CLI 검증)에 2개 추가 +
  help 문자열(:312) 갱신.
- `FIXTURE_IDS`(review-cert-run.mts:120)에 2개 추가.
- cert record fixture manifest에 `applicable_check_ids` 기입 — **clean-target만 축소7**.
  ⚠️ **커플링 계약(A-1 fix)**: `fixture_id="clean-target-v1"`가 record의
  `REDUCED_APPLICABLE_FIXTURE_IDS`(review-cert-record.ts:84)와 정확히 일치 + 그 record의
  `applicable_check_ids`는 `CLEAN_TARGET_APPLICABLE_CHECK_IDS`(=gate `CLEAN_TARGET_EXCLUDED_CHECK_IDS`
  여집합 7종)와 일치. **하드코딩 말고 상수 파생**. assemble 경로(review-cert-assemble.ts)에서
  fixture별 applicable_check_ids를 매니페스트에 넣는 지점 확인.

### 4. mock rehearsal (zero-spend)

`npx tsx scripts/review-cert-run.mts --baseline-* --candidate-* --rehearsal --out <tmp>` 완주.
`review-cert-record.rehearsal.json` 생성 확인(canonical 파일명 아님 — 인용 불가). 4 fixture
전부 완주 + validateReviewCertRecord 통과(A-2 validator가 clean-target 축소7 + full12 혼재
record를 정확 검증하는지 실증).

### 5. 라이브 probe N=1/fixture → **owner spend 별도**

각 fixture 실 모델 1콜로 achievability 실증(D4 승격 트리거 입력). A-4 fresh cert run과 묶어
owner spend 승인 후. 무-spend 슬라이스와 분리.

## 검증 게이트 (A-3 done 기준)

- 게이트 테스트: clean/shared-root 프리셋 resolve로 3-way + 앵커페어 + emission-set green.
- full vitest green + typecheck clean.
- mock rehearsal record가 A-2 validator 통과(축소7/full12 혼재).
- 독립 multi-lens 교차검증(post-impl 규약) — material 0 확인 후 done.

## open questions (설계 §4 — 기본값 유지)

- Q1 Phase B(온톨로지 fixture) 분리 — 기본값 **분리**
- Q2 v3 run 기존 2 fixture baseline 재실행 — 기본값 **전면 재실행**
- Q3 신규 부하 core floor 승격 — 기본값 **D4 승격 트리거**(첫 run disclosure)

## 관련 메모리

- [[onto-mcp-cert-v3-a3-progress-20260713]] — A-3 진행·선행조건 해소·clean-target 완료
- [[onto-mcp-cert-v3-a2-validator-harden-20260713]] — A-2(validator 하드닝, PR #196)
- [[onto-mcp-cert-v3-a1-complete-20260713]] — A-1(validator 신뢰모델: gate 미재실행→checks 신뢰)
- [[onto-mcp-post-impl-cross-verify-expectation]] — 완료 전 독립 multi-lens 교차검증 규약
