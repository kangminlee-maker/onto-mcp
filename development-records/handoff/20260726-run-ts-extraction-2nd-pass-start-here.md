# run.ts 개념별 파일 추출 — **2차 통과** start-here (2026-07-26, /clear 후 재개)

> **1차 통과 완료.** run.ts 21,576 → **9,328줄**. 이 문서는 **2차 통과**(4개 모듈 · 41심볼 · 2,195줄 추출)의 진입점이다.
> owner 승인 범위는 **순수 이동(로직 무변경)** 이며 거대 함수 분해는 **명시적으로 기각**됐다(§1).
> 1차 통과의 전체 기록·계획 정정은 [20260725-run-ts-extraction-start-here.md](20260725-run-ts-extraction-start-here.md).
> **라인 번호는 힌트일 뿐 스테일이다.** 코드 인용은 항상 심볼로 재확인한다.

## 0. 상태 핀 (재개 전 확인)

```
cd /Users/kangmin/Documents/onto-mcp && git fetch origin main
git branch --show-current                    # refactor/run-ts-extraction
git rev-parse --short origin/main            # b76904c (base, drift 없어야)
git log --oneline -1                         # 2차 준비 커밋 (§0.1)
git status --short | grep -v '^??'           # 비어 있어야
wc -l src/core-runtime/reconstruct/run.ts    # 9328
npx tsx scripts/run-split-plan.mts           # 순환 0개 · 밖으로 41심볼 · 잔류 예상 ≈7,134줄
npx tsx scripts/run-extraction-identity.mts  # PASS (MOVED 302 / STAYED 90 / 나머지 0)
npx vitest run                               # 217파일 3689 pass
# check:* 17종 → 16 green, G7만 알려진 false positive (§7)
```

미푸시 로컬 커밋 6개. **push/PR은 owner 명시 승인 후.** 직전 전례 = 브랜치에 여러 PR 단위를 누적한 뒤 GitHub PR.

### 0.1 완료된 커밋 (미푸시)

| 커밋 | 내용 | run.ts |
|---|---|---:|
| `33cfc57` | 준비(계획기 스크립트 + 1차 문서) | 21,576 |
| `b49ec77` | 1~2차 배치: `graceful-terminal` / `semantic-map-projection` / `projection-truncation` / `directive-author-contract` | 20,297 |
| `bea4797` | 3차 배치: `run-primitives` / `workbook-inventory-reuse-inputs` / `leaf-read-stage` / `value-read-stage` | 19,543 |
| `1666a14` | 4차 배치: `semantic-map-stage` / `run-manifest` / `confirmation-provider-contract` | 17,314 |
| `da65652` | 5차 배치: directive-author 8모듈 분해 + 죽은 import 293개 정리 + 게이트 재조준 4종 | 9,328 |
| `8540d53` | 1차 통과 기록 + 계획 정정 5건 | 9,328 |
| *(이 커밋)* | 2차 준비: 계획기 재조준 + **G11 게이트 커버리지 침식 수정**(§2) + 이 문서 + 죽은 코드 백로그 | 9,328 |

## 1. 승인된 범위 (계약 — 바꾸지 말 것)

owner에게 설명한 문장 그대로가 계약이다:

> 로직은 한 줄도 안 건드리고 위치만 옮깁니다. run.ts 21.5k→약 9k. 순수 이동이라 타입체커+테스트가 실수를 전부 잡고, 옮긴 텍스트가 원본과 동일한지 기계적으로 증명할 수 있습니다.

- **거대 함수 분해는 제시했고 owner가 고르지 않았다.** `runReconstruct`(4,382줄)는 **통째로** 이동하거나 run.ts에 남는다. 쪼개지 말 것.
- 로직 변경이 필요해 보이면 **멈추고 owner에게 보고**한다. 이 작업의 가치는 "안전하다는 것을 증명할 수 있음"이고, 로직 변경이 섞이는 순간 그 증명이 무효가 된다.
- **2차 통과 자체는 owner 확인을 받은 범위가 아니다.** 1차 완료 보고 시 "2차를 할지"를 물어둔 상태다. 착수 전 owner 확인을 받는다.

## 2. 1차에서 발견·수정한 게이트 커버리지 침식 (2차에서 반복될 유형)

`check:graceful-signal-rethrow`(G11)이 **run.ts 한 파일만** 스캔하고 있었다. 1차 추출로 **27개 catch 중 16개가 모듈로 빠져나갔는데 게이트는 계속 green**이었다 — run.ts에 11개가 남아 "0개면 실패" 공허-통과 가드가 발화하지 않았기 때문이다. 코드 자체는 정상(순수 이동이 가드 구조를 그대로 옮겼음이 재조준 후 27/27 guarded로 확증됨)이었지만, **게이트가 지키던 표면이 조용히 줄었다**.

수정(이 커밋에 포함):
- `RUN_TS` 단일 파일 → `RUN_SURFACE_REFS` 목록(run.ts + catch를 가져간 6개 모듈). 결과 28개(=원본 27 + leaf-reader 1) 전부 검사.
- **파일별 비어있음 가드 추가**: 목록에 있는데 catch가 0개면 FAIL한다. 코드가 또 움직이면 목록을 따라가라고 **소리내어** 실패한다.
- negative control 2종 확인: (1) 새로 스캔되는 모듈의 가드를 제거 → `value-read-stage.ts:L219 VIOLATION` rc=1, (2) catch 없는 파일을 목록에 추가 → 침식 가드 발화 rc=1. 둘 다 복원 후 green.

**2차에서도 같은 유형을 먼저 의심한다.** 소스 텍스트를 스캔하는 게이트는 표면 이동을 따라가지 못하고, **실패하지 않는 방식으로** 커버리지를 잃을 수 있다.

## 3. 2차 통과 대상 (실측 — `npx tsx scripts/run-split-plan.mts`)

run.ts 9,328줄 · top-level 선언 90개 기준. **순환 덩어리 0개.**

| 목적지 | 심볼 | 줄 | 대표 심볼 |
|---|---:|---:|---|
| `semantic-map-resume.ts` | 17 | 800 | `buildSemanticMapResumeValidationArtifact`(487) · `prepareSemanticMapResumeContext`(140) |
| `final-output-assembly.ts` | 10 | 584 | `finalOutputProvenanceSectionBindings`(218) · `appendFinalOutput*Section` 9개 |
| `source-admission-selection-stage.ts` | 9 | 479 | `runSourceAdmissionSelectionStage`(158) · `observeAcceptedFrontierRefs`(123) · `validateSourceFrontier`(116) |
| `authored-artifact-reuse.ts` | 5 | 332 | `authoredArtifactReuseMatch`(140) · `sourceObservationsReuseSha256`(94) |
| **합계** | **41** | **2,195** | |

**2차 후 run.ts ≈ 7,000~7,150줄**(1차 문서의 ≈8,100 추정을 하회). 잔류 = orchestrator 37심볼 5,586줄(그중 `runReconstruct` 4,382) + 도달불가 12심볼 842줄(§5).

### 3.1 순서 제약 없음 — 4개 모두 역참조 0개 (dry-run으로 확인함)

1차 통과의 최대 마찰은 순서였다(공용 기반이 run.ts에 남아 있어 커터가 역방향 import를 거절). **2차는 다르다.** 커터를 `--apply` 없이 4개 모듈 전부 돌려본 결과:

```
authored-artifact-reuse            의존 점검 : run.ts 잔류 심볼 참조 0개 — 순환 없음 (안전)
source-admission-selection-stage   의존 점검 : run.ts 잔류 심볼 참조 0개 — 순환 없음 (안전)
final-output-assembly              의존 점검 : run.ts 잔류 심볼 참조 0개 — 순환 없음 (안전)
semantic-map-resume                의존 점검 : run.ts 잔류 심볼 참조 0개 — 순환 없음 (안전)
```

즉 **어떤 순서로도, 독립적으로 뗄 수 있다.** 공용 기반이 이미 1차에서 전부 빠져나갔기 때문이다.
그래도 **작은 것부터** 권장한다(`authored-artifact-reuse` → `source-admission-selection-stage` → `final-output-assembly` → `semantic-map-resume`): 실패 시 되돌릴 표면이 작다.

**착수 시점에 dry-run을 다시 돌려 0개를 재확인한다.** 위 값은 2026-07-26 기준이고, 그 사이 코드가 바뀌면 무효다.

### 3.2 각 모듈의 `--symbols` 인자 (계획기 `--verbose` 출력과 일치)

```
# authored-artifact-reuse
authoredArtifactReuseMatch,sourceObservationsReuseSha256,AuthoredArtifactReuseMatch,stripVolatileArtifactFields,reuseMatchArtifactHash

# source-admission-selection-stage
runSourceAdmissionSelectionStage,observeAcceptedFrontierRefs,validateSourceFrontier,applyAdmissionSelectionFloorPolicy,capAdmissionSelectionAcceptedRefs,assertRuntimeValidationValid,ADMISSION_SELECTION_PRIORITY_RANK,SOURCE_ADMISSION_DEEP_FILE_LIMIT,SOURCE_ADMISSION_SELECTION_FLOOR

# final-output-assembly
finalOutputProvenanceSectionBindings,appendFinalOutputArtifactTruthSection,appendFinalOutputClaimProjectionSection,appendFinalOutputUnresolvedRevisionSection,appendFinalOutputWorkbookInventoryProjectionTruncationSection,appendFinalOutputDocumentProjectionTruncationSection,appendFinalOutputCodeInventoryProjectionTruncationSection,appendFinalOutputProvenanceBindingsSection,appendFinalOutputProvenanceFooter,appendFinalOutputAnswerabilitySection

# semantic-map-resume
buildSemanticMapResumeValidationArtifact,prepareSemanticMapResumeContext,backupSemanticMapRecoveryInputs,projectionIsRenderable,semanticMapSkipReasonForCurrentObservation,exists,resumeValidationViolation,readResumeYamlIfPresent,readYamlDocumentIfPresent,duplicateIds,isSemanticMapCensus,isSemanticMapSidecar,isMissingFile,readYamlDocument,semanticMapCensusPath,semanticMapSidecarPath,semanticMapResumeValidationPath
```

## 4. 절차 (배치 1개 = 모듈 1개)

1. **dry-run** — `npx tsx scripts/run-extract-symbols.mts --to src/core-runtime/reconstruct/<모듈>.ts --symbols <위 목록>`
   역참조가 나오면 그 목록을 `--symbols`에 더해가며 0개로 수렴시킨다(커터의 BLOCKER 출력이 폐포 계산기다).
2. **apply** — 같은 명령에 `--apply`. 목적지가 이미 있으면 거절한다(덮어쓰기 금지).
   심볼 집합을 고쳐야 하면 `git checkout -- run.ts && rm <목적지>` 후 **도구로 다시** 돌린다. 손으로 패치하지 않는다.
3. **타입체크** — `npm run check:ts-core`, `npm run check:ts-scripts`
4. **테스트** — `npx vitest run`. **tsc가 테스트를 안 본다**(tsconfig 제외) → 이동한 심볼을 참조하던 테스트는 tsc green인 채로 vitest에서만 터진다. §6의 영향 테이블 참조.
5. **바이트 동일성** — `npx tsx scripts/run-extraction-identity.mts`
6. **게이트** — `npm run check:*` 전체. §6의 알려진 영향과 §7의 알려진 false positive 확인.
7. **커밋** — 경로 명시 add. `git diff --stat` 총합 ≈ 0(순증감 없음)을 확인.

## 5. 검증 — "순수 이동"을 말이 아니라 기계로 증명

세 층이 각각 다른 것을 증명한다. **하나라도 빼면 증명이 뚫린다**:

| 검사 | 증명하는 것 |
|---|---|
| `check:ts-core` + `check:ts-scripts` + 전체 vitest | 참조가 여전히 맞는가 |
| `scripts/run-extraction-identity.mts` | **본문이 안 바뀌었는가** |
| `git diff --stat` 총합 ≈ 0 | 순증감이 없는가(이동이면 +N/-N이 상쇄) |

바이트 동일성 검사기(`scripts/run-extraction-identity.mts`):
- 기준본 = `git show origin/main:src/core-runtime/reconstruct/run.ts` (21,576줄, sha256 `43ca75023194`, top-level 392선언).
- 이동했다고 주장하는 각 심볼의 원문이 목적지에 **바이트 동일하게** 존재하는지 AST로 검사한다.
- `export` 키워드 추가/제거만 정규화하고 나머지는 엄격 비교. 판정: STAYED/MOVED/MODIFIED/MISSING/DUPLICATE/ADDED.
- negative control 확인 완료(본문 한 글자를 바꾸면 FAIL한다).

**게이트를 일반화·재조준했으면 반드시 negative control을 붙인다**(§2). 재조준한 게이트가 여전히 실제 드리프트에서 FAIL하는지 확인하지 않으면, 그 게이트는 통과해도 아무것도 증명하지 않는다.

## 6. 2차에서 깨질 것으로 **예상되는** 것 (착수 전 알고 있을 것 — 그래도 실측으로 재확인)

### 6.1 게이트

| 게이트 | 예상 영향 | 대응 |
|---|---|---|
| `check:final-output-sections-parity` (G9) | **확실히 깨진다.** `RUNTIME_REFS`가 run.ts + `authoring-prompt-payloads.ts` 2개인데, `appendFinalOutput*` 이미터 9개와 provenance 바인딩 행이 전부 `final-output-assembly.ts`로 나간다. 체크 (5)(6)(7)이 전부 이 표면을 읽는다 | `RUNTIME_REFS`에 `final-output-assembly.ts` 추가. **전체 디렉터리 스캔 금지** — `markdown-section.ts`·`final-output-sections.ts`·`source-profiles.ts`에도 `## ` 리터럴이 있어 false positive가 난다 |
| `check:graceful-signal-rethrow` (G11) | `source-admission-selection-stage`/`semantic-map-resume`이 catch를 가져가면 `RUN_SURFACE_REFS`가 뒤처진다. **이번엔 조용히 지나가지 않는다** — §2에서 파일별 비어있음 가드를 넣었지만, 그건 "목록에 있는데 비었다"만 잡지 "빠져나간 걸 목록에 안 넣었다"는 못 잡는다 | 배치 후 `rg -c '\} catch' <새 모듈>` 로 확인하고 catch가 있으면 `RUN_SURFACE_REFS`에 추가 |
| `check:prompt-projection-parity` | 2차 대상에 프롬프트 투영 심볼이 없어 영향 없을 것으로 본다 | 실행해서 확인 |
| `check:spec-defaults` | waiver는 `direct-call-directive-author.ts`를 가리키고 있고 2차 대상이 아니다 | 실행해서 확인 |
| `check:invariant-change` (G4) | waiver·보호 설정을 건드리면 걸린다. **커밋 후에** 돌려야 보인다(§7.1) | 마커 + owner 확인 |

### 6.2 테스트 (import 소스 재조준 필요 — **단정은 건드리지 않는다**)

| 이동 심볼 | 참조하는 테스트 |
|---|---|
| `prepareSemanticMapResumeContext` | `semantic-map-stage.test.ts` |
| `runSourceAdmissionSelectionStage`, `applyAdmissionSelectionFloorPolicy`, `capAdmissionSelectionAcceptedRefs` | `run-source-admission-selection.test.ts` |
| `observeAcceptedFrontierRefs` | `run-source-admission-selection.test.ts`, `source-safety-admitted-parity.test.ts`, `source-region-key-coverage.test.ts`, `run-source-region-decomposition.test.ts` |
| `validateSourceFrontier` | 위 3종(`run-source-admission-selection` / `run-source-region-decomposition` / `source-region-key-coverage`) |
| `sourceObservationsReuseSha256` | `run.test.ts`, `run-source-region-decomposition.test.ts` |
| `reuseMatchArtifactHash` | `run.test.ts`, `obligation-coverage-harvest.test.ts` |

1차에서 쓴 방법: run.js import 블록을 소유 모듈별로 쪼개되 `import type`과 specifier별 `type ` 접두사를 보존하는 자동 치환. 손으로 하면 놓친다.

### 6.3 텔레메트리 커버리지 가드
`execution-telemetry.test.ts`는 1차에서 **디렉터리 전체 스캔**으로 바꿨다(단일 파일 스캔이었을 때 run.ts의 호출 사이트가 0이 되어 자기 공허-통과 가드가 발화했다). 2차에서 호출 사이트가 또 움직여도 이 테스트는 따라간다. **되돌리지 말 것.**

## 7. 게이트 베이스라인 (2026-07-26 실측 — 2차 착수 전 상태)

`check:*` **17종 중 16 green, 1 known false positive.**

`check:supported-models`(G7)가 **gitignore된 세션 잔해** 때문에 로컬에서만 실패한다:
- `.onto/reconstruct/20260720-dd6-live-exp2/runtime-events.ndjson`
- `.onto/review/20260714-147a9121/runtime-events.ndjson`

둘 다 `ignored=yes tracked=no`이고, G7 출력에서 `src/`·`scripts/` 경로는 npm 배너 한 줄뿐이다(실 위반 0). CI 청정 체크아웃 통과가 1차에서 독립 확증됐다. **매번 위 두 조건(ignored·tracked)을 실행해 확인한 뒤 넘긴다.** `check:invariant-drift`가 G7을 감싸 실행하므로 **drift도 같은 이유로 rc=1이 된다** — 별개 결함이 아니다.

### 7.1 G4(`check:invariant-change`)는 **커밋된 range만** 본다

`origin/main..HEAD`의 커밋 메시지를 스캔한다. 즉 **워킹트리 상태로 게이트를 돌리면 공허 통과한다.** 1차에서 이 함정에 걸렸다 — `check-no-hardcoded-spec-defaults.ts`의 waiver 경로를 `run.ts` → `direct-call-directive-author.ts`로 옮긴 것이 보호 키 변경인데, 커밋 전에 게이트를 돌려 green으로 보였고 커밋 후에야 FAIL했다.

- 해소: `INVARIANT-CHANGE: INV-CFG-1` 마커를 range 내 커밋 메시지에 넣었다(owner 명시 승인 2026-07-26). 마커는 **range 안 아무 커밋에나** 있으면 되므로 과거 커밋을 다시 쓸 필요가 없다.
- **2차에서도 waiver·보호 설정을 건드리면 같은 일이 생긴다.** 커밋 **후에** G4를 다시 돌린다.

## 8. 도구

- **`scripts/run-split-plan.mts`** — 계획기. `tsconfig.scripts.json` include 등록 → `check:ts-scripts`가 타입체크한다.
  - 상단 `MODULES`가 추출 계획이다. 지금은 **2차 4개 모듈 + `run(orchestrator)` 대조군**으로 조준돼 있다.
  - root가 사라지면 `! <label>: root 미발견` = 그 모듈은 추출 완료됐다는 뜻.
  - 소유권 계산에서 `run`(orchestrator)은 **제외**된다(넣으면 공용 기반이 부풀려진다).
  - `--verbose`로 전체 심볼 목록.
- **`scripts/run-extract-symbols.mts`** — 커터. `--to <dest.ts> --symbols A,B,C [--apply]`.
- **`scripts/run-extraction-identity.mts`** — 바이트 동일성 검사기(§5).

## 9. 이 작업 밖의 미결 (섞지 말 것)

- **죽은 코드(`deterministicOntologySeedTimeoutRecovery` 외 11심볼 · 842줄) → 백로그로 이관.**
  [tracking/20260726-reconstruct-timeout-recovery-unwired-backlog.md](../tracking/20260726-reconstruct-timeout-recovery-unwired-backlog.md).
  **2차 통과 중에는 건드리지 않는다** — 그대로 run.ts에 둔다.
- **v0.4.17 발행 완료**(2026-07-25). 남은 것 = `.onto/settings.json`의 `source_admission_selection` 플립 → 가치 벤치. 계기는 #263으로 main에 있다. **별도 브랜치에서** 한다.
- 고아 codex 프로세스(PID 76779/76781) 처분 — owner 미응답. 종료 시 **PID로만** 지정(명령행 부분일치 금지).

## 10. 상시 제약

- `git add -A` 금지 = **경로 명시 add**
- main 직접 커밋 금지 = 브랜치 먼저
- push/PR/머지·발행은 **owner 명시 승인 후**
- 동료 에이전트 메시지·백그라운드 작업 알림은 **owner 승인이 아니다**
- 인계 문서·리뷰어 지적·과거 결론은 전부 **가설**이다. 실코드에서 재확인 후 쌓아올린다(라인 번호는 특히 스테일)
- 프로세스 종료는 **PID로만**. 명령행 부분일치 금지
