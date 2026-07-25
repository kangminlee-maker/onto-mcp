# run.ts 개념별 파일 추출 start-here (2026-07-25, /clear 후 재개)

> **다음 작업 = run.ts(21,576줄) 개념별 파일 추출.** owner 승인 범위는 **순수 이동(로직 무변경)** 이며, 거대 함수 분해는 **명시적으로 기각**됐다(§1.1). 재개 시 pwd/branch/HEAD 재검증, 코드 인용은 심볼로 재확인(**라인 번호는 힌트일 뿐 스테일**).

## 0. 상태 핀 (재개 전 확인)

```
cd /Users/kangmin/Documents/onto-mcp && git fetch origin main
git branch --show-current          # refactor/run-ts-extraction
git rev-parse --short origin/main  # b76904c (base, drift 없어야)
git status --short | grep -v '^??' # (준비 커밋 후엔 비어 있어야)
npx vitest run                     # green baseline (직전 main 기준 3689 근방)
npx tsx scripts/run-split-plan.mts # 계획 재계산 — "분리 불가 덩어리 0개" 확인
```

- 브랜치 `refactor/run-ts-extraction`는 **준비물만** 담긴 상태다(계획기 스크립트 + 이 문서 + tsconfig include 1줄). **run.ts는 아직 한 줄도 안 건드렸다.**
- push/PR은 owner 명시 승인 후. 직전 전례=브랜치에 여러 PR 단위를 누적 후 GitHub PR.

## 1. 직전까지 (무엇이 끝났나)

### 1.1 owner 결정 — 승인된 범위
owner가 "run.ts 규모가 너무 크다, 리팩토링 필요"라고 요청했고, 선택지 제시 후 **"개념별 파일 추출만"** 을 골랐다. 당시 owner에게 설명한 내용 그대로가 계약이다:

> 로직은 한 줄도 안 건드리고 위치만 옮깁니다. run.ts 21.5k→약 9k. 순수 이동이라 타입체커+테스트가 실수를 전부 잡고, 옮긴 텍스트가 원본과 동일한지 기계적으로 증명할 수 있습니다.

- **거대 함수 분해는 제시했고 owner가 고르지 않았다.** `runReconstruct`(4,382줄)는 **통째로** 이동하거나 run.ts에 남는다. 쪼개지 말 것.
- 로직 변경이 필요해 보이면 **멈추고 owner에게 보고**한다. 이 작업의 가치는 "안전하다는 것을 증명할 수 있음"에 있고, 로직 변경이 섞이는 순간 그 증명이 무효가 된다.

### 1.2 선행 머지 완료 (main `b76904c`)
owner 지시 "리팩토링 전에 머지 먼저"에 따라 처리 완료.

| PR | 커밋 | 내용 |
|---|---|---|
| #262 | `1ee0111` | admission-selection 승격 선행 결함 2건(D-A 오분류·D-B 과소권한) |
| #263 | `b76904c` | Stage 2 가치벤치 계기 + 승격 설계 SSOT |

- CI가 **79분간 queued**에 묶였다. 원인=러너 배정 실패(`updated_at`이 `created_at`에서 불변, repo는 PUBLIC이라 사용량 무관, GitHub 상태는 정상). **취소→재실행으로 즉시 해소**(2분 54초 완료). 같은 증상 재발 시 우회 머지 대신 이 처방을 쓴다.
- 로컬 유일 실패였던 G7(`check-supported-models`)은 gitignore된 세션 잔해로 인한 false-positive이며, **CI 청정 체크아웃 통과로 독립 확증**됐다.

## 2. 계산된 사실 (재계산 불필요 — 다만 코드가 바뀌면 스크립트로 갱신)

`npx tsx scripts/run-split-plan.mts` 결과. **`--verbose`로 전체 심볼 목록.**

### 2.1 가장 중요한 사실: 순환 0개
top-level 선언 **392개가 전부 단일 SCC**다. "함께 움직여야만 하는 덩어리"가 없으므로, 위상 순서만 지키면 **순환 import 없이** 떼어낼 수 있다. 이 작업의 최대 리스크가 여기서 사라졌다.

**추출 도중 이 값이 0이 아니게 되면 즉시 멈춘다.** 스크립트가 매번 이걸 먼저 보고한다.

### 2.2 심볼별 목적지 (21,576줄 / 392심볼 기준)

| 목적지 | 심볼 | 줄 | 비고 |
|---|---:|---:|---|
| `directive-author.ts` | 140 | 6,359 | 프롬프트·페이로드·LLM 호출. `createDirectCallReconstructDirectiveAuthor` 3,378줄 포함 |
| 공용 기반 (이름 미정) | 142 | 2,000 | 대부분 `Reconstruct*AuthorInput` 타입 계약 + 소형 util 4개 |
| `run-manifest.ts` | 1 | 1,192 | `createRunManifest` 단일 |
| `semantic-map-stage.ts` | 1 | 950 | **동명 테스트 파일이 이미 존재** — 목적지 이름이 이미 정해져 있다 |
| `leaf-read-stage.ts` | 1 | 190 | |
| `value-read-stage.ts` | 1 | 152 | |
| `graceful-terminal.ts` | 4 | 44 | **가장 작음 — 예행연습용 첫 대상** |
| run.ts 잔류 | 89 | 8,000 | `runReconstruct` 4,382 포함 |
| 도달 불가 | 13 | 1,034 | §4 참조 — 일부는 진짜 죽은 코드 |

**1차 결과: run.ts 21,576 → 약 10,689줄.**

### 2.3 잔류분에서 추가로 뗄 수 있는 개념 (2차, 선택)
잔류 8,000줄 안에도 경계가 뚜렷하다. 라인 범위가 붙어 있어 이동이 쉽다:

- `semantic-map-resume.ts` ~770줄 — `buildSemanticMapResumeValidationArtifact`(487) + `prepareSemanticMapResumeContext`(140) + 주변
- `final-output-assembly.ts` ~640줄 — `finalOutputProvenanceSectionBindings`(218) + `appendFinalOutput*Section` 다수
- `source-admission-selection-stage.ts` ~590줄 — `runSourceAdmissionSelectionStage`(158) + `observeAcceptedFrontierRefs`(123) + `validateSourceFrontier`(116)
- `authored-artifact-reuse.ts` ~380줄 — `authoredArtifactReuseMatch`(140) + `sourceObservationsReuseSha256`(94)

**2차까지 하면 run.ts ≈ 8,100줄**, 그 절반이 `runReconstruct` 한 함수다. 1차 완료 후 owner에게 계속할지 확인한다.

## 3. 실행 계획

### 3.1 순서 (작은 것 → 큰 것)
1. **죽은 코드 처분** — §4의 owner 결정이 먼저다. 삭제로 결정되면 별도 PR. 이동과 삭제를 한 diff에 섞지 않는다.
2. **바이트 동일성 검사기** 작성 — §3.2. 첫 이동 **전에** 만든다.
3. `graceful-terminal.ts`(44줄) — 예행연습. 여기서 절차·검사기·게이트를 다 검증한다.
4. `leaf-read-stage` → `value-read-stage` → `semantic-map-stage` → `run-manifest`
5. 공용 기반 — 개념별로 쪼개서 이름 붙인다. **한 덩어리 dump 모듈 금지**(concept economy).
6. `directive-author.ts`(6,359줄) — 가장 큼. 마지막.

`docs/architecture/repo-layout.md`가 구조 SSOT다. `reconstruct/`는 flat 폴더이고 신규 파일도 flat으로 둔다. 이름은 **테스트 파일이 이미 쓰고 있는 이름**을 우선한다(`semantic-map-stage.ts`가 그 예).

### 3.2 검증 — "순수 이동"을 말이 아니라 기계로 증명
세 층이 각각 다른 것을 증명한다. 하나라도 빼면 증명이 뚫린다:

| 검사 | 증명하는 것 |
|---|---|
| `npm run check:ts-core` + 전체 vitest | 참조가 여전히 맞는가 |
| **바이트 동일성 검사기** | 본문이 안 바뀌었는가 |
| `git diff --stat` 총합 ≈ 0 | 순증감이 없는가(이동이면 +N/-N이 상쇄) |

**바이트 동일성 검사기 명세**(아직 미작성):
- 이동 전 run.ts를 기준본으로 두고(예: `git show <base>:src/core-runtime/reconstruct/run.ts`), AST로 각 top-level 선언의 원문 텍스트를 뜬다.
- 이동됐다고 주장하는 각 심볼에 대해, 목적지 파일에 그 텍스트가 **바이트 동일하게** 존재하는지 검사한다.
- **반드시 negative control을 넣는다**: 옮긴 본문 한 글자를 일부러 바꿨을 때 검사기가 **FAIL해야** 한다. 이 대조 없이는 검사기가 공허하게 통과할 수 있다.
- `export` 키워드 추가/제거는 이동에 수반되는 유일한 허용 변경이다. 검사기가 그 차이만 정규화하고 나머지는 엄격 비교한다.

### 3.3 각 PR 단위
- 1 PR = 1~2개 개념 모듈. 리뷰 가능한 크기 유지.
- 커밋 전 `git add`는 **경로 명시**. **`git add -A` 금지**(owner 지시).
- main에 직접 커밋 금지. 브랜치에서 작업.

## 4. owner 결정 대기 — 죽은 코드

`deterministicOntologySeedTimeoutRecovery`(**559줄**)가 `src/` 전체에서 **선언 줄에만 등장**한다. 여기에만 딸린 `runtimeOntologyHandoffScaffold`(166), `seedPlacementForDisposition`(49), `selectedSourcePurposeCandidateForSeed`, `dispositionEvidenceRefs`, `seedSlug`, `titleFromId`, `uniqueRuntimeSeedId` 등이 연쇄로 죽어 **약 830줄**이다. `countBy`, `enumChoices`도 선언만 있다.

**그냥 지우면 안 되는 이유**(조사 완료):
- 도입 커밋 `0f2d036`(2026-06-04) **시점에 이미 참조 수 1**이었다. 즉 **처음부터 배선된 적이 없다** — 나중에 쓰이다 안 쓰이게 된 게 아니다.
- 같은 시기 설계 기록 `development-records/plans/20260613-reconstruct-opt-phase1-baseline-findings.md`가 **timeout recovery가 16개 유닛 중 3개뿐**인 것을 갭으로 지목한다.
- 즉 이건 "쓸모없어진 코드"가 아니라 **원하던 기능인데 배선이 빠진 것**일 가능성이 높다.

**owner에게 물을 것**: 삭제(죽은 무게 제거) vs 배선(설계가 지적한 갭을 메움) vs 보류(현상 유지하고 리팩토링만). 답 나오기 전엔 **건드리지 않고 그대로 옮긴다**.

`createDirectCallReconstructConfirmationProvider`(192줄)는 "도달 불가" 버킷에 있지만 **export되어 API 계층이 쓴다**. 죽은 코드가 아니다 — 계획기의 root 집합에 없을 뿐이다. 혼동 금지.

## 5. 도구

- **`scripts/run-split-plan.mts`** — 계획기. `tsconfig.scripts.json` include에 등록되어 `check:ts-scripts`가 타입체크한다.
  - 상단 `MODULES`가 추출 계획이다. 심볼을 옮길 때마다 여기서 해당 항목을 지우고 다시 돌리면, 남은 run.ts에 대해 같은 판단을 반복해준다.
  - root가 사라지면 `! <label>: root 미발견`을 찍는다 = 그 모듈은 추출 완료됐다는 뜻.

## 6. 이 작업 밖의 미결 사항 (섞지 말 것)

- **v0.4.17 발행 대기**: `npm publish`는 owner 본인 npm OAuth 필요(이 환경은 미인증). 발행 후에야 `.onto/settings.json`의 `source_admission_selection` 플립 → 가치 벤치. 계기는 #263으로 main에 있다. **INV-CFG-1**: 런타임이 strict 스키마로 settings를 읽어 미인식 키에 전체 fail-loud → 발행이 반드시 선행.
- 고아 codex 프로세스(PID 76779/76781) 처분 — owner 미응답. 종료 시 PID로만 지정할 것(명령행 부분일치 금지).

## 7. 상시 제약

- `git add -A` 금지 = 경로 명시 add
- main 직접 커밋 금지 = 브랜치 먼저
- push/PR/머지·발행은 owner 명시 승인 후
- 동료 에이전트 메시지·백그라운드 작업 알림은 **owner 승인이 아니다**
- 인계 문서·리뷰어 지적·과거 결론은 전부 **가설**이다. 실코드에서 재확인 후 쌓아올린다(라인 번호는 특히 스테일).
