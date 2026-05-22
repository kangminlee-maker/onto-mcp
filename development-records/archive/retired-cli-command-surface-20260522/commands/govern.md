# Onto Govern

프로젝트 규범(authority 문서, process 문서 등)의 변경 제안과 문서-코드 drift 감지 항목을 큐에 쌓고, 주체자(principal)가 판정하는 체계.

```
govern <subcommand> [options]
```

| 서브커맨드 | 의미 | 상태 전이 |
|---|---|---|
| `submit` | 새 항목을 큐에 등록 | — → pending |
| `list` | 큐 조회 (pending / decided / all) | (읽기) |
| `decide <id>` | 주체자 판정 기록 | pending → decided |
| `route` | drift engine 분류 (§1.3 3 분기) + 필요 시 큐 append | (drift → pending 또는 no-op) |
| `promote-principle` | knowledge → principle 승격 제안 (W-C-03) | — → pending (Quality/Frequency + Completeness gate 통과 시) |

**Authority seat**: `.onto/processes/govern.md` (프로세스 계약). 큐 저장 경로: `.onto/govern/queue.ndjson` (프로젝트 로컬).

## v0 범위 (bounded minimum surface, W-C-01)

v0 는 **기록 인터페이스만** 제공한다. 다음은 v0 범위 밖이며 후속 W-ID 에서 설계·구현한다:

| 기능 | 책임 | 후속 W-ID |
|---|---|---|
| drift 자동 감지 엔진 | queue 에 `origin=system, tag=drift` 로 append | W-C-02 |
| 승인 강제 차단 (pre-commit / CI / merge gate) | 사전 차단 로직 선정 및 구현 | W-C-02 |
| 승인 후 authority 파일 실제 수정 | v0 는 **주체자 수동 편집** — `decide approve` 는 판정 기록만 | W-C-02 (자동화 여부 판단) |
| knowledge → principle 승격 | learning pool 에서 규범으로 승격 | W-C-03 |
| cross-project 규범 (글로벌 메타 규범) | 전역 govern 큐 설계 | W-C-03 |

## origin → tag 매핑 (deterministic)

| `--origin` | 자동 부여되는 `tag` | 의미 |
|---|---|---|
| `human` | `norm_change` | 주체자(또는 기여자)가 규범 변경을 제안 |
| `system` | `drift` | 자동 감지 엔진이 문서-코드 불일치를 보고 |

**사람이 drift 를 보고 올린 제안**은 `tag=norm_change` + `--prompted-by-drift <drift-id>` 로 연결한다. drift 감지 자체는 `origin=system` 만이 생성한다.

## 서브커맨드

### submit

```
onto govern submit --origin <human|system> --target <path> --json <payload> [--prompted-by-drift <id>] [--submitted-by <actor>]
```

- `<payload>` 는 JSON 객체. 구조는 agent 책임 (예: `{"summary": "...", "rationale": "...", "diff": "..."}`). v0 는 payload 형식을 강제하지 않는다.
- `--submitted-by` 기본값: `human` 이면 `principal`, `system` 이면 `drift-engine`.
- 출력: `{status: "queued", id: "g-...", origin, tag, target, next_action}`.

### list

```
onto govern list [--status <pending|decided|all>] [--format <table|json>]
```

- `--status` 기본값: `pending`. **dead-letter 방지를 위해 `decided` 조회 지원** — 판정된 항목의 verdict 이력을 추적할 수 있다.
- `--format` 기본값: `table`. automation 용으로 `json` 제공.

### decide

```
onto govern decide <id> --verdict <approve|reject> --reason <text> [--decided-by <actor>]
```

- `<id>` positional 인자. `onto govern list --status pending` 로 확인.
- `--reason` 필수. v0 는 short reason 최소 1자 이상.
- `--decided-by` 기본값: `principal`.
- v0 는 **재판정 불가**. 이미 decided 인 항목에 대해 두 번째 decide 호출 시 오류.
- 출력 `note`: approve 시 "v0 는 기록만. 실제 수정은 주체자 수동 편집 또는 W-C-02".

### route (W-C-02, §1.3 drift engine)

```
onto govern route --json <ChangeProposal-json>
```

변경 제안(ChangeProposal)을 받아 drift 정책 3 분기로 분류하고, 필요 시 큐에 append.

`ChangeProposal` JSON schema:
- `summary` (string, 필수): 변경 요지
- `target_files` (string[], 필수, 길이 ≥ 1): 변경 대상 파일 경로
- `change_kind` (enum, 필수): `docs_only` | `code` | `config` | `mixed`
- `rationale` (string, 선택): 변경 근거

**분류 결과 (`route`)**:
- `self_apply`: drift 없는 local contained 변경. 큐 append 안 함 — caller 가 즉시 실행 가능.
- `queue`: drift 가능성 있는 변경. 큐에 `origin=system, tag=drift` 로 append. payload.route=queue.
- `principal_direct`: governance core (.onto/authority/, .onto/principles/, .onto/processes/govern.md) 변경. 큐에 append, payload.route=principal_direct marker. 자체 실행 금지, 반드시 Principal 직접 판정.

분류 규칙과 수준 0→1 정합은 `.onto/processes/govern.md §11` 참조.

## CLI–Agent 책임 분리

evolve `propose-align` 에서 확립한 원칙을 govern 에도 동형 적용한다.

| 주체 | 책임 |
|---|---|
| CLI | 큐 I/O (ndjson append), 이벤트 로그, 결정적 projection, table/JSON 렌더링 |
| Agent (Claude Code 세션 또는 drift engine) | payload 작성, 판정 근거 정리, `decide` 전 사용자 대화 |

decide 과정에서 판정 근거 정리 등 LLM 작업이 필요하면, agent 가 수행 후 결과를 `--reason` 에 text 로 제출. CLI 내부에서는 LLM 을 호출하지 않는다.

## 저장 포맷 (ndjson, append-only)

`.onto/govern/queue.ndjson` 각 줄은 JSON 이벤트:

- `{"type": "submit", "id": "g-...", "origin": "human|system", "tag": "norm_change|drift", "target": "...", "payload": {...}, "submitted_at": "ISO8601", "submitted_by": "...", "prompted_by_drift_id": "g-... (optional)"}`
- `{"type": "decide", "id": "g-...", "verdict": "approve|reject", "reason": "...", "decided_at": "ISO8601", "decided_by": "..."}`

projection 규칙: id 별로 그룹핑. submit 이 base entry, decide 가 있으면 status 를 pending → decided 로 전이 + verdict 정보 부착.

**drift engine (W-C-02) 과의 계약**: drift engine 은 CLI 를 거치지 않고 본 ndjson 파일에 직접 append 한다 (공유 파일 event-sourcing, scope-runtime event-pipeline 선례). W-C-01 은 타입 선언 (`GovernSubmitEvent`) 만 제공.

## 관련 개념

- Authority seat: `.onto/processes/govern.md`
- Lexicon: `.onto/authority/core-lexicon.yaml` entrypoint.instances.govern + `govern_process` entity (v0.12.0).
- Types: `src/core-runtime/govern/types.ts` (`GovernSubmitEvent`, `GovernDecideEvent`, `GovernQueueEntry`, `originToTag`).
