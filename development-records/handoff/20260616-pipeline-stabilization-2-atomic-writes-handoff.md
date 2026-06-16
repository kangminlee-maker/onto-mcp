# Handoff — 파이프라인 안정화 #2: 원자적 YAML 쓰기 + 공유 artifact-io 유틸

> 목적: fresh context(`/clear` 직후)에서 reconstruct 파이프라인 안정화 백로그 **#2 (T1: torn-write 하드닝)**
> 를 바로 시작하기 위한 출발점. authority/상세는 백로그 문서가 소유. `file:line`은 main `5607a56` 확인값 —
> 시작 시 **재-grep**.

## 0. 트랙 상태 (어디까지 왔나)
- 안정화 백로그: `development-records/design/20260616-reconstruct-pipeline-stabilization-backlog.md`
  (ultracode 89-에이전트 진단·71 confirmed·blocker 0·safety-net-before-refactor).
- **#1 CI 안전망 MERGED**(PR #69, main): 전체 vitest(104파일/1134)가 머지 게이트. 이후 모든 PR이 보호됨.
- **#3+#4 LLM 호출 경계 MERGED**(PR #70, main `5607a56`): SDK 타임아웃 분류·워커 SIGKILL/EPIPE.
- **#2 = 지금**. Phase B의 토대(후속 #5 fail-soft·#9 in-memory가 이 위에 쌓임).
- 메모리: `reconstruct-pipeline-stabilization`(트랙 전체 맥락).

## 1. 문제 (진단 theme T1, 백로그 #2)
파이프라인의 모든 YAML/텍스트 아티팩트가 **비원자적**(`mkdir` + `writeFile`, temp+rename 없음)으로 쓰인다.
크래시/디스크풀이 쓰기 중간에 나면 **truncated-but-parseable** 아티팩트가 남고, YAML 파서가 조용히 수용한다
(잘린 `validation_status: valid`가 clean pass로 읽히거나, 빈 파일이 null로). canonical `source-observations.yaml`
은 **매 라운드 재기록·trusted-read ~35곳**이라 가장 위험. 단일 공유 `atomicWriteYamlDocument`로 일괄 해소.

## 2. 현재 코드 사실 (재확인, main `5607a56`)
- **`writeYamlDocument` 복사본 ~19개**(byte-동일, `mkdir`+`writeFile`): reconstruct/* 다수 + review/* + cli/*.
  - reconstruct 정의 위치(예): `materialize-preparation.ts:53`, `run.ts:817`, `maturation-validation.ts:121`,
    `post-seed-validation.ts:2089`, `ontology-seed-validation.ts:2213`, `terminal-validation.ts:74`,
    `claim-projection-validation.ts:82`, `source-observation-delta-validation.ts:49`,
    `seed-authoring-readiness-validation.ts:101`, `material-admission/profile`, `proof/purpose-authority`,
    `registry-verification`, `source-scout-pack`, `source-safety`, `run-control-validation.ts:33`.
  - 사용량 상위: `maturation-validation.ts`(21)·`run.ts`(15)·`run-review-prompt-execution.ts`(11, cli)·
    `materializers.ts`(10, review)·`run-control-validation.ts`(9)·`post-seed-validation.ts`(8).
- **원자적 패턴이 이미 존재(차용·정합 대상)**:
  - `onboard/configure-provider.ts:269-278` — `${filePath}.configure-provider.${pid}.tmp` → `writeFile` →
    `fs.rename(tmp, filePath)` (src 내 유일한 일반 fs.rename). **참조 구현.**
  - `reconstruct/run-control-validation.ts:38` — `writeYamlDocumentAtomicCreate` (이미 원자적 변형 존재 —
    **create-only/no-overwrite 시맨틱인지 확인**하고 공유본과 정합/통합).
  - `review/review-artifact-utils.ts:36` — `export async function writeYamlDocument` (이미 export된 공유본 —
    리뷰 서브시스템 일부가 이미 공유 중일 수 있음; 공유 유틸의 후보 거점).
- `isoNow` 정의 **20개** 중복(같은 `new Date().toISOString()`). #2의 자연스러운 동반 통합 후보(T9와 시너지),
  단 **선택**(스코프 부풀리기 주의).

## 3. 설계 (구현 전 결정 포인트)
- **공유 유틸 `atomicWriteYamlDocument(filePath, value)`**: `mkdir(dirname, {recursive})` → `stringifyYaml` →
  고유 tmp(`${filePath}.<pid>.<counter>.tmp` 등) → `writeFile(tmp)` → `fs.rename(tmp, filePath)`. 같은 파일시스템
  내 rename은 원자적. (configure-provider 패턴 일반화.)
- **유틸 위치 + import 경계(G1 결정 포인트)**: reconstruct·review·cli가 모두 import해야 함. `reconstruct/artifact-io.ts`
  는 review/cli에서 import 시 **import-boundary 위반 가능** → `core-runtime` 공유 위치(예: `core-runtime/io/artifact-io.ts`)
  가 적절할 수 있음. `docs/architecture/repo-layout.md` + `npm run check:import-boundary`로 확정. (백로그는
  reconstruct/artifact-io.ts라 했으나 review/cli 복사본 때문에 위치 재고 필요.)
- **스코프 (권장: reconstruct 먼저)**: T1이 지목한 고위험(canonical source-observations + validation 아티팩트
  = 매 라운드 재기록·trusted-read)부터. review/cli 복사본 통합은 같은 PR에 묶거나 후속(저위험·덜 빈번).
  최소 viable = reconstruct 쓰기를 원자적 공유본으로 라우팅.
- **정합**: `writeYamlDocumentAtomicCreate`(run-control)와 `review-artifact-utils.writeYamlDocument`(export)를
  공유본으로 수렴(개념 경제). create-only vs overwrite 시맨틱 보존 확인.
- **isoNow 통합은 선택** — #2를 비대하게 하면 분리.

## 4. done-when / 검증
- 모든 (최소 reconstruct) YAML 쓰기가 원자적 공유본 경유. **동작 불변**(같은 경로·같은 내용 기록).
- torn-write 저항: tmp+rename으로 부분 파일이 최종 경로에 안 남음. 성공 시 `.tmp` 잔존 0.
- **회귀 테스트**: (a) 공유 유틸 단위 — 정상 쓰기 후 내용 정확·`.tmp` 미잔존·중첩 디렉터리 생성; 가능하면
  "rename 직전 크래시 시 기존 파일 보존" 시뮬레이션. (b) 기존 reconstruct 스위트가 그대로 green(동작 불변 증명).
- **게이트**: typecheck · 전체 vitest(이제 CI 머지 게이트) · **G1 import-boundary(신규 유틸 위치 핵심)** · G2 · G4 clean.
- INVARIANT 무접촉(쓰기 메커니즘 변경, 계약/스키마 불변) — 확인.

## 5. 구현-프로세스
P0 새 브랜치(off main `5607a56`) → P1 공유 `atomicWriteYamlDocument` 유틸(위치 G1 확정) → P2 reconstruct
writeYamlDocument 복사본을 공유본으로 라우팅(+ writeYamlDocumentAtomicCreate/review export 정합) → P3 유틸
단위 테스트 → P4 전체 static(typecheck/vitest/G1·G2·G4) → P5 PR → Codex 리뷰. (review/cli·isoNow는 스코프 결정에 따라.)

## 6. 참고
- 백로그: `development-records/design/20260616-reconstruct-pipeline-stabilization-backlog.md`(#2·theme T1·시퀀싱).
- 참조 구현: `onboard/configure-provider.ts:269-278`.
- 메모리: `reconstruct-pipeline-stabilization`, `onto-mcp-repo-guardrails`(G1~G7), `worktree-isolation-on-parallel-agents`.
- CLAUDE.md: 의미 있는 변경엔 staged workflow + 검증 루프. CI 안전망(#1)이 이미 가동 — 로컬 전체 vitest로 사전 확인.
