# Onto Evolve

온톨로지를 기반으로 기존 설계 대상에 새 영역을 설계하는 evolve 활동.

```
evolve <goal> [--domain <name> | --no-domain] [--ontology <path>] [--source <path>] [--prior-design <path>]
```

| 인자 | 의미 | 필수 |
|---|---|---|
| `<goal>` | 설계 목표 (자연어) | 필수 |
| `--domain <name>` | 도메인 지정 (canonical). Legacy: `@{domain}` | 선택 (생략 시 Domain Selection Flow) |
| `--no-domain` | 도메인 없음 (canonical). Legacy: `@-` | 선택 |
| `--source <path>` | 설계 대상(design_target) 경로. 생략 시 프로젝트 루트 | 선택 |
| `--ontology <path>` | 주체자 지정 ontology 파일 | 선택 |
| `--prior-design <path>` | 반복 설계용 이전 버전 설계 문서 | 선택 |

> **Legacy `@` 표기 보존**: `@{domain}` / `@-` 도 backward compat 으로 인식됨. Claude Code의 `@filename` mention 과 충돌하므로 새 flag (`--domain` / `--no-domain`) 권장.
> **Methodology terms 보존**: `design_target` 등 lexicon 용어는 활동 rename 과 무관하게 유지.

**Authority seat**: `.onto/processes/evolve.md` (프로세스 계약). scope-runtime 이벤트 모델은 `src/core-runtime/scope-runtime/types.ts`.

**design_target binding**: `--source`가 가리키는 경로가 설계 대상(design_target)이다. 생략 시 프로젝트 루트. 이 경로의 파일이 Phase 2~5의 탐색 범위이며, Phase 1 outcome의 대상이다.

## Bounded 하위 subcommand + 책임 분리

CLI 는 상태 기계 + 이벤트 로그 + 패킷 렌더링만 소유한다. 비결정적 대화 UX (질문 생성·통합·수렴 판정) 는 대화 agent (Claude Code 세션 내 LLM / 인간) 가 소유한다.

| subcommand | 상태 전이 | CLI 책임 | Agent 책임 |
|---|---|---|---|
| `evolve start <desc>` | null → draft → grounded | 소스 스캔, brief 처리, 스캔 해시 기록 | 선택지 없음 (결정적) |
| `evolve propose-align --scope-id <id> --json <dialog-output>` | grounded → align_proposed | constraint.discovered 이벤트 N개 + align-packet.md 렌더 + align.proposed 이벤트 | **선행 대화 전수**: 선택지 기반 질문 (sprint-kit align-packet 스타일, 자연어 fallback), 답변 통합, 수렴 판정 |
| `evolve align --scope-id <id> --json <verdict>` | align_proposed → align_locked / revise / rejected / redirected | verdict 기록 + 다음 상태 결정 | 검토·판단 |
| `evolve draft --scope-id <id> --json <action>` | align_locked → drafting → drafted | surface 생성·제약 결정 기록 | 설계안 작성 |
| `evolve apply --scope-id <id> --json <action>` | drafted → applying → applied | apply 이벤트 + gap 기록 | 실구현 |
| `evolve close --scope-id <id>` | applied → closed | 종료 이벤트 | 검증 |
| `evolve defer --scope-id <id>` | non-terminal → deferred | 보류 이벤트 | 재개 조건 명시 |

### propose-align UX 계약

Agent 는 다음 원칙으로 대화를 수행한 뒤 결과를 JSON 으로 통합하여 CLI 에 전달:

1. **선택지 기반 질문**: open question 최소화. 매 라운드 concrete option 메뉴 + 자연어 fallback 제공 (결정 UI 패턴, sprint-kit align-packet 참조).
2. **답변 통합 (inquiry consolidation)**: 답변 직후 다음 질문을 즉시 던지지 않는다. 통합·동의 후 다음 라운드.
3. **Progressive scope narrowing**: 각 라운드가 direction, scope_in, scope_out, constraints 중 하나 이상을 구체화.
4. **수렴 판정**: 주요 제약과 방향이 결정 가능 수준에 도달했을 때 propose-align 호출. 불충분하면 추가 라운드.
5. **최종 산출물 JSON 스키마** (src/core-runtime/evolve/commands/propose-align.ts 참조):
   - `interpreted_direction` (string, 필수)
   - `proposed_scope: { in: [...], out: [...] }` (in 1개 이상)
   - `scenarios: [...]` (선택)
   - `as_is: { experience, policy, code }`
   - `constraints: [...]` — 각 원소는 `summary`, `perspective`, `severity`, `decision_owner`, `impact_if_ignored`, `why_conflict`, `scale` 필수 + optional `options`, `recommendation`
   - `decision_questions: [...]` (선택, Principal 이 verdict 단계에서 답할 열린 항목)

CLI 가 검증·거절 시 agent 는 누락·오류 항목을 Principal 에게 재질의하여 보완 후 재제출.

> Plugin install resolves via `${ONTO_PLUGIN_DIR:-~/.claude/plugins/onto}`. Set `ONTO_PLUGIN_DIR` env var when installed in a custom location.

Read `${ONTO_PLUGIN_DIR:-~/.claude/plugins/onto}/process.md` (common definitions — overview surface),
`${ONTO_PLUGIN_DIR:-~/.claude/plugins/onto}/.onto/processes/evolve.md` (process contract — process surface), and
`${ONTO_PLUGIN_DIR:-~/.claude/plugins/onto}/learning-rules.md` (learning storage rules — *not* an entrypoint surface), then execute.

Three entrypoint reference surfaces for the prompt-backed path are defined in `.onto/processes/evolve.md` §8 — command (this file) / process / overview. `learning-rules.md` is a storage-rule pointer, not one of the three surfaces.

**Install-surface alignment**: the `${ONTO_PLUGIN_DIR:-~/.claude/plugins/onto}/` paths above resolve to the *install surface* (a deterministic snapshot of the authority seat `.onto/processes/evolve.md`). Repo-path and install-path citations must not be mixed within the Read block; drift is boundary-managed per `.onto/processes/evolve.md` §9 and is resolved by re-installing the plugin, not by editing the install tree directly.
