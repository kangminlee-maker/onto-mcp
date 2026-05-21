---
as_of: 2026-04-21
status: active
functional_area: topology-migration-legacy-to-review-axes
purpose: |
  Review UX Redesign (PR #152~#157, 2026-04-20~21) 은 `execution_topology_priority`
  를 대체하는 user-facing axis block (`review:`) 을 도입했다. 이 문서는
  두 migration 계층을 다룬다:
    (a) Legacy provider-profile (host_runtime, api_provider 등)
        → sketch v3 (execution_topology_priority) — §1~§6
    (b) sketch v3 execution_topology_priority → Review UX Redesign review: axes — §7
  신규 프로젝트는 (b) 경로만 필요. 구 프로젝트는 (a) → (b) 두 단계.
source_refs:
  sketch_v3: "development-records/evolve/20260418-execution-topology-priority-sketch.md"
  review_ux_redesign: "development-records/evolve/20260420-review-execution-ux-redesign.md"
  p8_audit: "development-records/audit/20260421-shape-pipeline-audit.md"
  pr_99: "d3b7819 → (TBD squash) — PR-A foundation"
  pr_100: "(TBD squash) — PR-B executor mapping"
  pr_101: "(TBD squash) — PR-C codex-nested orchestrator"
  pr_102: "(TBD squash) — PR-D deliberation protocol"
  pr_103: "(이 PR 포함, TBD) — PR-E legacy deprecation"
  pr_152_157: "Review UX Redesign P1~P8 (config / derivation / fallback / onboard / CLI / audit)"
---

# Topology Migration Guide — Legacy → Review UX Redesign (2026-04-21 갱신)

> **⚠️ P9.2 Field Removal 공지 (2026-04-21)**
>
> `execution_topology_priority` 와 `execution_topology_overrides` 두 필드는
> **P9.2 에서 `OntoConfig` 타입에서 완전히 제거** 되었습니다. TypeScript
> 프로젝트에서 이 필드에 값을 할당하면 **compile error** 가 발생합니다.
> `execution_topology_overrides.<id>.max_concurrent_lenses` 를 통한 concurrency
> override 는 `review.max_concurrent_lenses` (Axis C) 로 canonical 전환되었습니다.
>
> YAML 파일에 남아있는 legacy 필드는 config loader 가 그대로 읽어들이지만
> (타입 cast 이전 단계), 어떤 runtime 경로에서도 참조되지 않습니다 — disk-based
> legacy migration 경로 (`review-config-legacy-translate.ts`) 만이 이 필드를
> 읽어 `review:` axis block 으로 변환합니다.
>
> **신규 / 마이그레이션 프로젝트는 반드시 §7 의 `review:` axis block 을 사용**
> 하십시오. `onto onboard --re-detect` 는 legacy YAML 을 자동 변환하여 review
> block 을 생성할 수 있습니다.
>
> **히스토리**: P9.1 (2026-04-21) 은 resolver 의 priority ladder walk 를 먼저
> 제거 (field 는 유지) 했고, P9.2 는 field 자체를 제거했습니다.

## 1. 왜 마이그레이션 하는가

Sketch v3 이전의 `.onto/config.yml` 에는 review 실행 경로를 결정하는 필드가
여러 개 섞여 있었다:

- `host_runtime` — LLM 도달 경로 (codex / claude / anthropic / …)
- `execution_realization` / `execution_mode` — subagent vs agent-teams
- `executor_realization` — codex / mock / ts_inline_http
- `api_provider` — Anthropic / OpenAI / LiteLLM / codex

이 필드들은 서로 독립적으로 해석되어 silent divergence 를 만들었다. PR #96
(Review Recovery PR-1, 2026-04-18) 이 해소한 주된 원인. Sketch v3 는 하나의
**topology 축** 으로 수렴:

```yaml
execution_topology_priority:
  - cc-main-agent-subagent      # Claude Code + Agent tool (가장 단순)
  - cc-main-codex-subprocess    # Claude Code + codex lens
  - codex-main-subprocess        # Codex CLI session + codex lens
```

10 개의 canonical topology 중 priority 순서대로 첫 번째 성립하는 옵션이
채택된다.

## 2. 자주 쓰이는 매핑

### 2.1 Codex CLI 구독 사용자 (주체자 환경의 다수)

**Before**:
```yaml
host_runtime: codex
codex:
  model: gpt-5.4
  effort: high
```

**After**:
```yaml
execution_topology_priority:
  - cc-main-codex-subprocess       # Claude Code 세션 안에서 실행할 때
  - codex-main-subprocess          # Codex CLI 세션 안에서 실행할 때
  - codex-nested-subprocess        # Plain terminal 에서 실행할 때
codex:
  model: gpt-5.4
  effort: high
```

`codex` 블록은 그대로 유지 — topology 는 "어떤 경로로 spawn 할지" 만
결정하고 model / effort 는 별도 config.

### 2.2 Claude Code Agent tool 사용자

**Before**:
```yaml
host_runtime: claude
execution_realization: subagent
```

**After**:
```yaml
execution_topology_priority:
  - cc-main-agent-subagent
```

### 2.3 Claude Code TeamCreate teamlead (experimental)

**Before**:
```yaml
host_runtime: claude
execution_realization: agent-teams
```

**After**:
```yaml
execution_topology_priority:
  - cc-teams-agent-subagent
# 전제: ~/.claude*/settings.json 에
#   "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" }
```

### 2.4 LiteLLM 프록시 (로컬 MLX 등)

**Before**:
```yaml
host_runtime: standalone
external_http_provider: litellm
llm_base_url: http://localhost:4000
litellm:
  model: llama-8b
```

**After (Claude Code 세션 안)**:
```yaml
execution_topology_priority:
  - cc-teams-litellm-sessions
llm_base_url: http://localhost:4000
litellm:
  model: llama-8b
```

**After (세션 밖, legacy HTTP 경로 유지)**:

```yaml
# 이 경우 sketch v3 에 대응 topology 없음 — legacy 설정 유지.
# Deprecation warning 은 계속 나오지만 동작은 유지된다.
host_runtime: standalone
external_http_provider: litellm
llm_base_url: http://localhost:4000
litellm:
  model: llama-8b
```

### 2.5 Deliberation (lens 간 SendMessage A2A) — 특수

**Before**: 표현 불가 (기존 스키마에는 없음)

**After**:
```yaml
execution_topology_priority:
  - cc-teams-lens-agent-deliberation
lens_agent_teams_mode: true  # 3중 opt-in 의 프로젝트 단 신설 필드
# 전제: ~/.claude*/settings.json 에
#   "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" }
#   + Claude Code 세션 (CLAUDECODE=1 자동)
```

## 3. 단계별 마이그레이션 절차

1. **현재 config 확인**: `.onto/config.yml` 과 `~/.onto/config.yml` (global)
   에서 legacy 필드 식별 — `grep -nE 'host_runtime|execution_realization|
   execution_mode|executor_realization|api_provider' .onto/config.yml`.

2. **위 §2 매핑표 적용**: 사용 중인 조합에 대응하는 topology priority 를
   선택. 한 번에 여러 topology 를 priority 순서로 나열 가능 — 환경이
   변하면 첫 번째 성립하는 옵션이 자동 선택됨.

3. **Legacy 필드 제거 또는 유지 (선택)**:
   - 제거: 가장 깨끗함. `execution_topology_priority` 만 남기고 legacy
     필드 삭제.
   - 유지: 잠정 호환 — 주체자가 아직 확신 없으면 legacy 필드를 남기고
     `execution_topology_priority` 를 동시에 추가. 이 경우 topology 가
     우선하고 legacy 는 무시된다 (deprecation warning 은 `topology_priority_set`
     감지 시 억제).

4. **Review 실행**: 평소와 동일. `[topology]` STDERR 로그가 출력되어
   어떤 옵션이 채택되었는지 확인 가능.

5. **Deprecation warning 대응**: `[onto:deprecation]` 으로 시작하는 STDERR
   메시지가 남아있으면 §2 매핑을 다시 검토.

## 4. Deprecation 단계

**현재 P9.5 (2026-04-21): graceful-ignore stage** (legacy retirement 전수 종결).
Legacy 5 필드가 OntoConfig 타입에서 제거 + runtime detection module 도 제거 됨.

| Stage | When | 동작 |
|---|---|---|
| Warning | PR-E (#103, 2026-04-18) | Legacy 필드 사용 시 `[onto:deprecation]` STDERR. 동작 유지. |
| Error | PR-J (#110, 2026-04-18) | Legacy 필드 + `execution_topology_priority` 없음 → `LegacyFieldRemovedError` throw. Config 로드 실패 → review 중단. |
| Type removal | PR-K (2026-04-18) | OntoConfig 타입에서 5 legacy 필드 제거. TypeScript 코드에서 `config.host_runtime` 같은 접근은 컴파일 에러. YAML 에서는 여전히 감지 가능 (Record cast 경로) — PR-J 의 throw 동작 유지. |
| **Graceful ignore (현재)** | **P9.5 (#166, 2026-04-21)** | **`legacy-field-deprecation.ts` 모듈 전면 제거. YAML 의 legacy 필드는 OntoConfig 타입에 **존재하지 않아** typed 코드가 읽을 수 없음 (compile error). 런타임 Record 에는 값이 남아있지만 production consumer 가 전무 — 사실상 inert. Config 로드는 throw 없이 성공. viable host 미감지 시 resolver 의 `buildNoHostReason` 이 6-option setup guide (migration 옵션 포함) 제공.** |

### Graceful ignore 단계 이해

`.onto/config.yml` 에 legacy 필드가 있어도 **더 이상 fail-fast 되지 않습니다**. 5 필드 모두 OntoConfig 타입에서 제거되었고, 런타임 Record 에 값이 남아있어도 production consumer 가 없어 inert 상태:

- `host_runtime: <값>` — typed 코드에서 접근 불가 (compile error), runtime 무시
- `execution_realization: <값>` — 동일
- `execution_mode: <값>` — 동일
- `executor_realization: <값>` — 동일
- `api_provider: <값>` — 동일

Legacy 필드만 설정된 YAML 로 review 를 실행하면 두 시나리오:

1. **코덱스 바이너리 + `~/.codex/auth.json` 이 실제로 reachable**: P3 resolver 가
   코덱스 자동 감지 → `codex-main-subprocess` 로 라우팅 → review 정상 실행.
   Legacy 필드는 무시되었지만 기능적으로 equivalent 한 경로가 자동 선택됨.
2. **No viable host**: resolver 가 `no_host` 로 fail-fast — STDERR 에
   `buildNoHostReason` 의 6-option setup guide 출력 (Claude Code 세션,
   codex CLI 설치, `--codex` flag, `review:` axis block 추가 [option 4],
   external_http_provider 설정, `ONTO_HOST_RUNTIME=standalone` env).

### Drift 주의

Legacy 필드는 silently drop 되므로, **user 는 자신의 설정이 무시되고 있다는
사실을 알지 못할 수 있습니다**. `onto config show` 또는 `onto onboard --re-detect`
로 실제 로드된 config 를 확인하여 drift 를 방지하세요. 신규 migration 은
§7 의 `review:` axis block 을 바로 사용.

## 5. FAQ

**Q1**: `execution_topology_priority` 와 legacy `host_runtime` 을 동시에
설정하면?

A (P9.5 이후): 둘 다 runtime 에 영향을 주지 않는 조합입니다.
`execution_topology_priority` 는 P9.1 에서 ladder walk 가 제거되었고 P9.2 에서
OntoConfig 타입에서도 제거되었습니다. Legacy provider profile 필드 5 개는
PR-K 에서 타입 제거, P9.5 에서 runtime detection module 까지 제거되어 이제
YAML narrow 시 silently dropped 됩니다 (throw 없음). 실제로 topology 를
결정하려면 §7 의 `review:` axis block 을 사용하세요.

**Q2**: topology 중 어느 것도 성립하지 않으면?

A: resolver 가 `no_host` 로 fail-fast — STDERR 에 환경 시그널 덤프 +
해결 경로 (CLAUDECODE 환경 실행, codex 설치, `review:` axis block 재구성 등)
안내.

**Q3**: Legacy 필드를 모두 제거하면 어떤 파일이 영향받는가?

A: 세션 artifact (session-metadata.yaml) 에 기록된 `host_runtime` /
`execution_realization` 필드는 read-only 로 유지. Topology 로 마이그레이션
되면 동일 위치에 `topology_id` 필드도 함께 기록 예정 (후속 PR).

**Q4**: 주체자의 global config `~/.onto/config.yml` 만 수정해도 되나?

A: 네. Atomic profile adoption (PR-1, 2026-04-18; P9.4 에서 단순화 #165)
가 project profile 이 없으면 home profile 을 사용하도록 보장합니다. Review
block 이나 profile field (codex / anthropic / openai / litellm / model /
reasoning_effort 등) 중 하나라도 project 에 선언되어 있으면 project 가
소유권을 주장하고, 그렇지 않으면 home 이 채택됩니다. 여러 프로젝트에서 공통
provider 설정을 공유하고 싶다면 home config 에만 두면 됩니다.

해당 동작의 테스트 스냅샷:
`src/core-runtime/discovery/config-profile.test.ts` §"adoptProfile —
decision branches" (7 decision case), 및
`src/core-runtime/discovery/config-chain.test.ts` §"resolveConfigChain —
P9.5 legacy field graceful ignore" (legacy-only home + absent project 를
포함한 4 regression case).

## 6. Reference

- Sketch v3: `development-records/evolve/20260418-execution-topology-priority-sketch.md`
- Codex nested sandbox: `docs/codex-nested-topology-sandbox.md`
- Resolver: `src/core-runtime/review/execution-topology-resolver.ts`
- Executor mapping: `src/core-runtime/cli/topology-executor-mapping.ts`
- Codex nested orchestrator: `src/core-runtime/cli/codex-nested-teamlead-executor.ts`
- Deliberation protocol: `src/core-runtime/cli/teamcreate-lens-deliberation-executor.ts`
- Deprecation detection: ~`src/core-runtime/discovery/legacy-field-deprecation.ts`~ (retired in P9.5, #166 — legacy fields silently dropped via type narrowing)

---

## 7. Review UX Redesign migration (execution_topology_priority → `review:` axes)

**Added 2026-04-21.** Review UX Redesign (P1~P8, PRs #152~#157) replaces
`execution_topology_priority` with a user-facing **6-axis block**. Runtime
derives one of 6 internal `TopologyShape` s from the axes and dispatches
to the same canonical TopologyIds §2 covers.

### 7.1 왜 두 번째 migration 이 필요한가

Sketch v3 는 10 topology id 를 user-facing 배열로 노출했다. 주체자가 이 id 들의
naming convention (`cc-teams-*` / `cc-main-*` / `codex-*` / `generic-*`) 과 각
id 의 teamlead location / lens spawn mechanism / deliberation channel 을 모두
해석해야 했다. Review UX Redesign 이 관찰한 결함:

- Topology id 는 **derivation artifact** 이지 user-facing decision 축이 아님
- User 의 실제 결정 변수는 6 axis (teamlead / subagent / concurrency / deliberation + per-model effort)
- Topology id 를 지우고 axis 로 승계 — runtime 이 매핑을 내부화

### 7.2 매핑표 — sketch v3 topology id → review axes

| Legacy topology id | 유도된 axis 조합 | 비고 |
|---|---|---|
| `cc-main-agent-subagent` | `teamlead=main, subagent=main-native` | 단순. Claude Code Agent tool |
| `cc-main-codex-subprocess` | `teamlead=main, subagent.provider=codex` | codex.model → subagent.model_id |
| `cc-teams-agent-subagent` | `teamlead=main, subagent=main-native` (D=true 필요) | CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 |
| `cc-teams-codex-subprocess` | `teamlead=main, subagent.provider=codex` (D=true 필요) | |
| `cc-teams-litellm-sessions` | `teamlead=main, subagent.provider=litellm` (D=true 필요) | litellm.model → subagent.model_id |
| `cc-teams-lens-agent-deliberation` | `teamlead=main, subagent=main-native, lens_deliberation=sendmessage-a2a` | D=true + `lens_agent_teams_mode: true` 이중 opt-in |
| `codex-main-subprocess` | `teamlead=main, subagent=main-native` (host=codex 자동 해석) | |
| `codex-nested-subprocess` | `teamlead={provider=codex, model_id=..., effort=...}, subagent.provider=codex` | host=plain terminal |
| `generic-*` | **삭제** (사용 불가, 설계 상 deferred) | |

Translator 구현: `src/core-runtime/review/review-config-legacy-translate.ts` (pure, 테스트 커버).

### 7.3 Migration 수단

**자동 변환 (권장)**:
```bash
# Onboard 의 detect + write 헬퍼를 이용해 대화형 migration
onto onboard --re-detect           # 감지 단계만 재실행
# 또는 script 경로:
npm run onboard:write-review-block -- .onto/config.yml '<OntoReviewConfig JSON>' --strip-legacy-priority
```

**대화형 CLI (P5)**:
```bash
onto config show                   # 현재 상태 + 예상 TopologyId preview
onto config edit                   # stepwise prompt
onto config set subagent.provider codex
onto config set subagent.model_id gpt-5.4
onto config set subagent.effort high
onto config validate               # 쓰기 전 검증 + preview
```

**수동 편집**: `.onto/config.yml` 에 `review:` block 을 작성 후
`execution_topology_priority` 제거. P9.1 (2026-04-21) 이후 legacy priority
필드는 `review:` block 의 존재 여부와 무관하게 resolver 가 **항상 무시**합니다
(`[topology] legacy ... ignored` 로그만 남김). 필드 자체의 YAML 제거는 P9.2
에서 진행됩니다.

### 7.4 Universal fallback (P3) 의 보장

User 가 reachable 하지 않은 shape 을 config 에 적어도 (예: codex 미설치 환경에
`subagent.provider=codex`) review 는 중단되지 않는다. Resolver 는 `main_native`
shape 으로 강등하고 `[topology] degraded: requested=... → actual=main_native` 를
STDERR 에 기록. 이 한 층의 안전망이 legacy migration 의 시행 착오를 허용한다.

### 7.5 현재 spawn-ready 상태 (P8 audit 결과)

| Axis 조합 | 유도 shape | Spawn ready? |
|---|---|---|
| teamlead=main, subagent=main-native | main_native / main-teams_native | ✅ |
| teamlead=main, subagent.provider=codex | main_foreign / main-teams_foreign | ✅ |
| teamlead=main, subagent.provider=litellm (teams=true) | main-teams_foreign | ✅ |
| teamlead=main, lens_deliberation=sendmessage-a2a | main-teams_a2a | ❌ (PR-D 대기) |
| teamlead={provider=codex,...} | ext-teamlead_native | ❌ (PR-C 대기) |

Deferred shape 을 선택한 경우 P3 fallback 이 활성. 세부: `development-records/audit/20260421-shape-pipeline-audit.md`.

### 7.6 Troubleshooting

**Q5**: `review:` block 만 있고 legacy 가 없는데 `onto info` 가 "legacy profile 필요" 로 fail

A: `resolveConfigChain` 의 atomic profile adoption 이 legacy profile 을 여전히 요구하는 현재 상태 (P7 에서 해소). 임시 조치: legacy `execution_topology_priority: [cc-main-agent-subagent]` 를 함께 유지하거나, `onto config show` 는 `resolveOrthogonalConfigChain` 으로 우회되어 정상 작동.

**Q6**: `onto config validate` 가 degraded 를 표시

A: P3 universal fallback 활성. 구체 이유는 degrade trace `(reason: ...)` 에 기록. Config 수정으로 해소 가능.
