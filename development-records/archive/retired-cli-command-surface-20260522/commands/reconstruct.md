# Onto Reconstruct

`reconstruct` activity 의 CLI entry. 소스 (codebase / spreadsheet / database / document) 를 분석하여 domain ontology 초안을 산출한다.

Slash command 진입점 (`/onto:reconstruct $ARGUMENTS`): `$ARGUMENTS` 는 분석 대상 경로. **Canonical**: `--domain {name}` 또는 `--no-domain` 으로 도메인 지정. **Legacy** (backward compat): `@{domain}` / `@-` 도 인식 — Claude Code의 `@filename` mention 과 충돌하므로 새 flag 권장.

Plugin install resolves via `${ONTO_PLUGIN_DIR:-~/.claude/plugins/onto}`. Set `ONTO_PLUGIN_DIR` env var when installed in a custom location.

Read `${ONTO_PLUGIN_DIR:-~/.claude/plugins/onto}/process.md` (common definitions) and
`${ONTO_PLUGIN_DIR:-~/.claude/plugins/onto}/.onto/processes/reconstruct.md`, then execute.

## Repo-local canonical bounded path

Preferred entrypoint:

- `onto reconstruct <subcommand>` — global CLI (from any directory)

Internal bounded path (review 의 3-step 에 대응, W-A-74 DL-020 해소):

1. `onto reconstruct start <source> <intent>` — session 초기화 + `gathering_context` 상태 진입
2. `onto reconstruct explore --session-id <id>` — 탐색 loop 1회 bounded invocation (여러 번 호출 가능)
3. `onto reconstruct complete --session-id <id>` — ontology 초안 산출 + Principal 검증 요청 (`converted` 상태)

| 인자 | 의미 | 필수 |
|---|---|---|
| `<source>` | 분석 대상 경로 (디렉터리·파일·connection string) | start 필수 |
| `<intent>` | 재구성 의도 (자연어) | start 필수 |
| `--session-id <id>` | 기존 session 지정 | explore/complete 필수, start 선택 |
| `--project-root <path>` | 프로젝트 루트 | 선택 (기본: cwd) |
| `--sessions-dir <path>` | session 저장 디렉터리 | 선택 (기본: `<project-root>/.onto/reconstruct`) |

## 각 step 의 bounded 계약

### Step 1 — `start`

- **입력**: `<source>`, `<intent>`, 옵션 `--session-id`
- **산출**: `{sessions_dir}/{session_id}/reconstruct-state.json` (current_state=`gathering_context`)
- **완료 조건**: session 디렉터리 생성 + 초기 state 기록
- **§1.4 reconstruct 완료 기준 연계**: 1 축 (ontology 초안 산출) 의 준비 단계

### Step 2 — `explore`

- **입력**: `--session-id <id>`
- **산출**: state 파일이 `exploring` 으로 전이 + `explore_invocations` 증가
- **완료 조건**: 1회 invocation 당 state 갱신. 완결이 아니므로 여러 번 반복 호출 가능
- **§1.4 연계**: 2 축 (domain knowledge 기반 "왜" 추정) — 실제 Explorer loop 은 후속 W-ID 에서 reconstruct runtime 과 연결

### Step 3 — `complete`

- **입력**: `--session-id <id>`
- **산출**: `{session_root}/ontology-draft.md` + state 가 `converted` + `principal_review_status = requested`
- **완료 조건**: ontology 초안 파일 존재 + Principal 검증 대기 상태 진입
- **§1.4 연계**: 3 축 (Principal 검증 경로) — complete 가 검증 요청을 명시적으로 표시

### Step 4 — `confirm` (W-B-07)

- **입력**: `--session-id <id> --verdict passed|rejected`
- **산출**: `principal_review_status` 가 `passed` 또는 `rejected` 로 갱신
- **전제 조건**: session 이 `converted` 상태이고 `principal_review_status = requested`
- **§1.4 연계**: 3 축 (Principal 검증 경로) 완결 — Principal 이 ontology-draft.md 를 검토한 결과 기록

## Authority

- **Process contract**: `.onto/processes/reconstruct.md` (activity=reconstruct, 파일명 2026-04-14 W-A-77 rename 완료)
- **Handler**: `src/core-runtime/evolve/commands/reconstruct.ts` (`handleReconstructCli`)
- **State**: `{session_root}/reconstruct-state.json` 단일 파일 (bounded minimum surface)

## Non-goals (현재 W-A-74 범위)

- reconstruct runtime 의 Explorer/lens/Synthesize loop 실제 구현 — `.onto/processes/reconstruct.md` 1636줄 방법론을 건드리지 않는다
- 다수 source type (DB, spreadsheet 등) 의 profile 확장 — `explorers/` 소관
- 인증·권한·Principal UI 표면 — 별도 W-C 시리즈

## Examples

```bash
# 시작
onto reconstruct start ./src "recover domain ontology from payment service"
# → { session_id: "20260414-abcd1234", current_state: "gathering_context" }

# 탐색 (여러 번 호출)
onto reconstruct explore --session-id 20260414-abcd1234

# 종료 + Principal 검증 요청
onto reconstruct complete --session-id 20260414-abcd1234
# → ontology-draft.md 생성, principal_review_status=requested

# Principal 검증 결과 기록
onto reconstruct confirm --session-id 20260414-abcd1234 --verdict passed
# → principal_review_status=passed
```

## 참조

- Design principle: `development-records/evolve/20260413-onto-direction.md §1.4 reconstruct 완료 기준`
- DL 해소: `.onto/authority/delegated-decisions-ledger.md DL-020` (reconstruct-cli bounded path)
- 쌍 CLI: `.onto/commands/review.md`, `.onto/commands/evolve.md`
