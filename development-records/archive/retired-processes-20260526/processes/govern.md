# Govern Process (v0, bounded minimum surface)

> product 규범의 변경 제안 + 문서-코드 drift 감지 항목을 큐로 관리하고,
> 주체자(principal)의 판정을 이벤트 로그로 기록하는 프로세스.
> v0 는 기록 인터페이스만 제공. 승인 강제 차단과 drift 자동 감지는 W-C-02.

## 0. Position in `onto`

| 축 | 설명 |
|---|---|
| 활동 분류 | 다섯 활동 (review / reconstruct / evolve / learn / **govern**) 중 하나. `.onto/authority/core-lexicon.yaml#activity_enum` 등재. |
| onto-direction §1.4 | govern 완료 기준 = 규범 등재·갱신·폐기 추적 + drift 정책 + Principal 승인 강제. 본 v0 는 "기록 추적" 부분만 충족. |
| Authority seat | 본 파일 (contract). Future MCP govern tool이 entrypoint surface. `src/core-runtime/govern/` 은 구현 실험 surface. |

## 1. Purpose

| 질문 | 답 |
|---|---|
| 무엇인가 | product 규범 변경·drift 를 큐로 축적하고, 주체자 판정을 기록하는 프로세스 |
| 왜 존재하는가 | 규범 변경·drift 가 흩어지면 언제 무슨 판단이 있었는지 추적 불가 → 반복 재논의 비용 증가. 이력 존재가 드러나야 시간·비용 최소화 (이용자 관점 가치) 가능 |
| 다른 활동과의 관계 | review 는 산출물 검증, reconstruct 는 지식 재구조화, evolve 는 새 설계, learn 은 학습 축적. govern 은 **규범 자체의 변경을 관리**하며 위 4개 활동의 메타 레이어 |

## 2. Inputs

| 입력 | 출처 | 필수 |
|---|---|---|
| origin | 주체자 또는 drift engine | 필수 (`human` 또는 `system`) |
| target | 변경 대상 파일 경로 | 필수 |
| payload | JSON 객체 (자유 구조) | 필수 |
| prompted_by_drift_id | 사람이 drift 를 보고 올린 경우 drift 항목 id | 선택 |

## 3. Outputs (v0)

- `.onto/govern/queue.ndjson` 에 `submit` / `decide` 이벤트 append.
- CLI 출력: `{status, id, ...}` JSON. automation 용 가독.
- **v0 는 authority 파일을 자동 수정하지 않는다**. approve 후 파일 반영은 주체자 수동 편집 또는 W-C-02 책임.

## 4. State Machine

큐 단위(queue pattern) 이며 per-entry 생애주기는 단순:

```
(없음) ─submit→ pending ─decide(approve|reject)→ decided
```

v0 는 재판정 불가. `decide` 는 pending 상태에서만 허용.

**큐 전체의 생애주기는 없다** (evolve/reconstruct 의 scope 생애주기 패턴과 구별). 각 항목은 독립적이며, 여러 항목이 동시에 pending 상태로 공존한다.

## 5. Interface (bounded subcommand)

| 서브커맨드 | CLI 책임 | Agent 책임 |
|---|---|---|
| `onto govern submit` | 이벤트 append, id 생성, origin→tag 매핑 | payload JSON 구성 (대화 맥락에서 agent 가 수렴) |
| `onto govern list` | 이벤트 projection, 필터링, 렌더링 | (결정적, agent 관여 없음) |
| `onto govern decide` | 판정 이벤트 append, 재판정 guard | 판정 근거 text (`--reason`) 구성 |

**CLI 는 LLM 호출 없음** (evolve propose-align 원칙 동형). 비결정적 작업 (payload 작성, 판정 근거 정리) 은 agent 가 수행 후 결과를 CLI 에 제출.

## 6. Origin → Tag (deterministic)

| `origin` | `tag` | 의미 |
|---|---|---|
| `human` | `norm_change` | 주체자·기여자가 규범 변경 제안 |
| `system` | `drift` | 자동 감지 엔진이 문서-코드 불일치 보고 |

**편향 방지 설계**: 사람이 drift 감지 결과를 보고 제안을 올리는 경우, tag 는 `norm_change` (사람이 올렸으므로) 이되 `prompted_by_drift_id` 로 원본 drift 항목과 연결. 분류 기준이 "누가" 인지 "왜" 인지 모호해지는 것을 원천 차단.

## 7. Storage (event-sourced)

- 파일: `.onto/govern/queue.ndjson` (product-local, **product-locality-principle 준수**)
- 포맷: JSON Lines (append-only)
- 이벤트 타입:
  - `submit`: base entry. id 생성, 필수 필드 기록.
  - `decide`: verdict + reason 기록. id 는 기존 entry 참조.

projection: 모든 이벤트를 id 별로 그룹핑. `submit` 이 base, `decide` 가 있으면 status=decided + verdict 부착.

**drift engine 통합 계약 (W-C-02)**: drift engine 은 본 ndjson 에 `origin=system, tag=drift` 이벤트를 직접 append. CLI 를 거치지 않음 (scope-runtime event-pipeline 패턴과 동형). W-C-01 은 타입 정의 (`GovernSubmitEvent`) 만 계약으로 고정.

## 8. Scope Boundary (v0 vs 후속)

### v0 = 현 레포 한정

본 v0 는 **현 product 내부 규범** (.onto/authority/, .onto/processes/, .onto/principles/, .onto/roles/ 등) 의 변경 관리에만 적용한다. 다음은 범위 밖:

| 범위 밖 | 이유 | 처리 경로 |
|---|---|---|
| 글로벌 메타 규범 (onto 자체의 cross-product 원칙) | 전역 저장소 (~/.onto/govern/) 설계 필요 | **W-C-03** |
| 다른 product 레포의 규범 변경 | product 간 의존 관계 모델링 필요 | **W-C-03** |
| 승인 후 자동 파일 수정 | diff 정확도 + rollback + 동시성 설계 필요 | **W-C-02** |
| drift 자동 감지 | 문서-코드 비교 엔진 필요 | **W-C-02** |
| pre-commit / CI / merge gate 차단 | 차단 지점 실측 기반 선정 필요 | **W-C-02** |

### dead-letter 방지

v0 는 기록만 하므로 decide 이후 consumer 가 없다. 이로 인한 dead-letter risk 를 방어하기 위해:

- decided 상태 조회를 명시적으로 지원. 판정 이력이 언제든 감사 가능.
- `decide` 출력의 `note` 필드에 후속 반영 경로 (주체자 수동 편집 / W-C-02) 를 명시.

### GC 정책

v0 는 GC 없음. queue.ndjson 이 커지면 (>1000 건) 수동 archive 로 대응. 자동 rotation·purge 는 W-C-02 이후 검토.

## 9. Validation

- **unit test**: `src/core-runtime/govern/cli.test.ts` — submit / list / decide 3 서브커맨드 + 경계 guard (invalid origin, non-object payload, unknown id, re-decide 거부).
- **E2E 검증 (v1 후속)**: 전체 시나리오 (drift 감지 → 큐 append → Principal 판정 → 반영) 는 W-C-02 완료 후 통합 E2E.

## 10. Related Work

- **선행 (reconstruct bounded minimum surface)**: `src/core-runtime/evolve/commands/reconstruct.ts` 3-step bounded path. W-A-74 (DL-020 해소) 에서 확립한 "v0 는 기록·CLI 만, 의사결정·차단은 v1" 패턴을 govern 에 동형 적용.
- **선행 (evolve propose-align CLI-agent 분리)**: `src/core-runtime/evolve/commands/propose-align.ts` 가 "CLI=상태기계, agent=대화 UX" 분리를 확립. govern 은 queue pattern 으로 session 생애주기 없이 적용.
- **후속 (W-C-02)**: drift engine + 승인 강제 차단. 본 v0 의 `GovernSubmitEvent` 타입을 계약으로 소비.
- **후속 (W-C-03)**: knowledge → principle 승격 + cross-project 규범. 본 v0 의 queue 개념 확장.

---

## 11. Drift Engine (W-C-02)

§1.3 "자기 적용과 자율성" 의 drift 정책을 구현하는 classifier + router. 변경 제안(change proposal) 을 3 분기로 분류하고, 필요 시 §7 큐에 append 한다.

### 11.1 3 분기 (§1.3 canonical)

| 분기 | 조건 | 처리 |
|---|---|---|
| `self_apply` | drift 양의 피드백 없는 local contained 변경 | 자체 실행 + 보고. 큐 append 없음. |
| `queue` | drift 증폭 가능성 있는 변경 | §7 큐에 `origin=system, tag=drift` 로 append. payload.route=queue. Principal 승인 대기. |
| `principal_direct` | govern 자체 변경, 핵심 가치(§1.0) 변경 | §7 큐에 append하되 payload.route=principal_direct marker. 자체 실행 불가, 반드시 Principal 직접 판정. |

### 11.2 v0 분류 규칙 (deterministic)

다음 우선순위로 순차 평가:

1. **governance_core → principal_direct**: target_files 중 어느 하나라도 다음 prefix 로 시작:
   - `.onto/authority/` (개념 SSOT + authority-adjacent data)
   - `.onto/principles/` (rank 2~4 개발 규범)
   - `.onto/processes/govern.md` (본 계약 자체 — self-modification 차단)
2. **local_docs_single → self_apply**: 규칙 1 미적용 AND `change_kind=docs_only` AND target_files 길이 1
3. **drift_default → queue**: 그 외 전부 (drift 가능성 default)

실제 diff 분석·authority 규칙 충돌 검출 등 **drift probe** 는 v0 범위 밖. classifier 는 target prefix + change_kind 만으로 결정적으로 판정. 구체 drift 감지 로직은 v1 이후 추가.

### 11.3 ChangeProposal 입력 schema

```typescript
interface ChangeProposal {
  summary: string;            // 필수, 비어있지 않은 문자열
  target_files: string[];     // 필수, 길이 ≥ 1
  change_kind:                // 필수 enum
    | "docs_only"
    | "code"
    | "config"
    | "mixed";
  rationale?: string;         // 선택
}
```

### 11.4 CLI surface

```
onto govern route --json <ChangeProposal-json> [--project-root <path>]
```

출력 (JSON):
- `status: "routed"`
- `route: "self_apply" | "queue" | "principal_direct"`
- `matched_rule: "governance_core" | "local_docs_single" | "drift_default"`
- `reason: string` — 규칙 근거
- `queue_event_id: string` (queue/principal_direct 일 때만)

### 11.5 queue 와의 계약

drift engine 이 큐에 append 할 때:
- `origin=system`, `tag=drift` 고정 (§6 매핑 준수).
- `submitted_by=drift-engine`.
- `payload` 에 원본 proposal + `route`, `matched_rule`, `reason` 기록.
- `principal_direct` 도 동일한 event schema 사용 — tag enum 을 v0 에서 확장하지 않는다 (schema stability). `payload.route` marker 로 구분.

### 11.6 수준 0→1 gate

§1.3 의 자율성 수준:
- **수준 0**: 모든 변경 Principal 승인 → drift engine 없을 때 또는 모든 분기 결과가 `queue`/`principal_direct` 로 강제될 때.
- **수준 1**: drift 없는 변경 자체 실행 + 나머지 큐 → `self_apply` 분기가 활성화된 상태 (본 v0 가 이 gate 를 연다).

v0 구현은 **수준 1 도달 조건** 을 충족한다:
- 3 분기 분류가 결정적으로 수행됨.
- `self_apply` 는 큐를 거치지 않고 caller 가 즉시 실행 가능.
- `queue`·`principal_direct` 는 §7 event-sourced 큐로 회귀.

### 11.7 v1 이후 (W-C-02 범위 밖)

- 실제 diff 분석 + authority 규칙 충돌 검출 (drift probe 본체).
- pre-commit / CI / merge gate 차단 강제 (decide approve 가 실제 merge 를 gating).
- 수준 2 (일부 drift 감수 변경 자체 실행) 로의 전이 기준 — 수준 1 운영 데이터 축적 후 재평가.

---

## 12. Learning · Term · Principle Lifecycle 의존 그래프 (W-D-05)

세션 13 drift 리서치 결과 확정된 3 lifecycle 간 의존 관계 시각화. 관계 **정의** 는 `.onto/authority/core-lexicon.yaml` 의 각 entity relations 가 canonical. 본 §12 는 **시각화 + 경로 요약** 만 담는다 (개념 SSOT drift 방지).

### 12.1 세 lifecycle 의 canonical 이름 (W-D-05 S1)

| canonical term | 대상 | 출발 | 도착 | 기준 문서 |
|---|---|---|---|---|
| `lexicon_term_promotion` | lexicon term | `provisional_terms` 섹션 | `terms` 섹션 | `.onto/authority/core-lexicon.yaml#provisional_lifecycle` |
| `learning_scope_promotion` (deprecated v0.15.0) | learning artifact | `{product}/.onto/learnings/{agent}.md` | `~/.onto/learnings/{agent}.md` | `.onto/processes/learn/promote.md` |
| `learning_to_principle_promotion` | promoted learning → principle | `~/.onto/learnings/{agent}.md` 의 항목 | `.onto/principles/*.md` 또는 `.onto/processes/*.md` 의 본문 | W-C-03 (미구현, §1.1/§1.2 "보류 중") |

### 12.2 의존 그래프

```mermaid
flowchart LR
  subgraph lexicon["lexicon (.onto/authority/core-lexicon.yaml)"]
    prov_term["provisional_terms"]
    term["terms"]
    prov_term -->|lexicon_term_promotion| term
  end

  subgraph learning["learning artifact"]
    proj_learn["project scope<br/>(project/.onto/learnings/)"]
    user_learn["user scope<br/>(~/.onto/learnings/)"]
    proj_learn -->|learning_scope_promotion| user_learn
  end

  subgraph principle["principle 본문"]
    dp_file[".onto/principles/*.md"]
    proc_file[".onto/processes/*.md"]
  end

  user_learn -.->|learning_to_principle_promotion<br/>W-C-03 경로| dp_file
  user_learn -.->|learning_to_principle_promotion<br/>W-C-03 경로| proc_file

  term -.->|참조 (개념 resolve)| dp_file
  term -.->|참조 (개념 resolve)| proc_file

  classDef pending fill:#fef3c7,stroke:#d97706,color:#92400e
  class dp_file,proc_file pending
```

### 12.3 lifecycle_status 전이 canonical owner (W-D-05 S2)

| 전이 | canonical owner | 하위 경로 |
|---|---|---|
| `seed → candidate → provisional → promoted` | 각 entity 의 execution_rules_ref 가 지정 (예: learning → `.onto/processes/learn/promote.md`, term → `provisional_lifecycle`) | — |
| `promoted → deprecated → retired` | **M-08 refresh protocol** (`development-records/plan/20260413-refresh-protocol.md`) | promote Step 4a event marker review (learning 대상) + judgment audit (judgment-type learning 대상) 은 M-08 의 하위 경로로 재분류됨 |

### 12.4 authoring path 성문화 (W-D-05 S3)

| 계층 | rank (CLAUDE.md) | authoring path | execution_rules_ref 위치 |
|---|---|---|---|
| `.onto/authority/` | 1 (개념 SSOT) | W-ID 기반 authoring. schema/structure 변경 시 Principal 승인 | 각 entity 내부 `authoring_rules` (top-level) + entity 별 `execution_rules_ref` |
| `.onto/principles/` | 2-4 (개발 원칙 / 제품 방향 / 인터페이스 명세 / 이름 규칙) | Principal 수동 작성 OR W-ID 기반 authoring OR `learning_to_principle_promotion` 경로 (W-C-03 미구현) | `principle.execution_rules_ref.authoring_path` |
| `.onto/processes/` | 5 (기능별 계약) | Principal 수동 작성 OR W-ID 기반 authoring OR `learning_to_principle_promotion` 경로 (W-C-03 미구현) | `principle.execution_rules_ref.authoring_path` (동일 — principle 의 한 유형) |

### 12.5 principle vs promoted term 구별 (W-D-05 S4, Q2 Fix)

| 축 | principle | promoted term |
|---|---|---|
| 답하는 질문 | 무엇을 해야 하는가 (obligation) | 무엇인가 (identity) |
| 형식 | Markdown prose (서술·근거·반례) | YAML schema (structured definition) |
| `execution_rules_ref` | **필수 보유** — 규범 본문·lifecycle·소비 규칙 가리킴 | 선택 보유 — 단순 enum 은 없음 |
| 본문 배치 | `.onto/principles/*.md` + `.onto/processes/*.md` | `.onto/authority/core-lexicon.yaml` 내부 |
| .onto/authority/core-lexicon.yaml 에 등재 | entity **정의** 만 (본문 X) | entity/term **정의 + 값** (본문 그 자체) |

**1차 구분 단서**: `execution_rules_ref` 보유 여부.

### 12.6 scope 경계 (MINOR 처리)

본 §12 는 principle **entity 정의** 와 **구별 규칙** 만 명시한다. 기존 `.onto/authority/core-lexicon.yaml` 에 등재된 promoted term (`activity_enum`, `axis_enum`, `fact_type`, `learning`, `review_process` 등) 의 principle-tier 재분류는 **별도 W-ID** 로 분리 (scope creep 방지, 세션 13 9-lens 리뷰 Lens 6 MINOR 반영).

---

## 13. Knowledge → Principle Promotion (W-C-03)

§1.2 "보류 중" 해소. promoted learning (knowledge) 이 principle 본문 (`.onto/principles/` 또는 `.onto/processes/`) 으로 승격되는 경로. canonical term: `learning_to_principle_promotion`. W-D-05 가 확정한 도착지 (principle entity) 를 소비한다.

### 13.1 승격 기준 3축 + 1 보조 (v0)

| 축 | 판정 방식 | 검증 시점 |
|---|---|---|
| **Quality gate** | workload-evidence: source session 의 `state_transitions`, `constraint_count`, `retry_count` 중 하나 이상 threshold 초과 (OR mode). threshold 는 `.onto/govern/thresholds.yaml` config | `promote-principle` submit 시 CLI validator |
| **Frequency gate** (Quality 면제) | `similar_to` 가 기존 pending 의 유효 id 참조 시 workload evidence 면제. 첫 1건은 Quality 필수, 2번째부터 frequency 가능 | `promote-principle` submit 시 CLI validator |
| **Completeness gate** | proposal schema 필수 필드 전수 (learning_ref, target, rationale, conflict_check, workload_evidence.evidence_summary) | `promote-principle` submit 시 CLI validator |
| **Principal gate** | 기존 `onto govern decide <id> --verdict approve` | 별도 호출 시 (주체자 최종 판정) |

### 13.2 Threshold Config

`.onto/govern/thresholds.yaml` (product-local). 파일 편집으로 즉시 조정. 부재 시 hardcoded default:

```yaml
mode: any
state_transitions_min: 8
constraint_count_min: 3
retry_count_min: 2
repeat_observation_min: 1
```

### 13.3 similar_to Grouping

CLI 밖에서 agent 의 자연어 reasoning 으로 유사도 판정. 결과를 proposal `similar_to` 필드에 기입. CLI 는 id 존재 검증만 (LLM 호출 없음). `list --group` 시 similar_to 기반 그룹 렌더링.

흐름: agent 가 `govern list --status pending --format json` → 기존 pending 비교 → similar_to 채움 → `promote-principle --json <proposal>` 제출.

LLM inflate 방지: v0 는 `origin=human` 만 (agent auto-propose 없음). 큐에 쌓여도 Principal decide 없으면 소비 안 됨 (structural 안전).

### 13.4 v0 범위

- **기록만** (W-C-01 동형): decide approve 후 실제 파일 편집은 주체자 수동.
- **Out**: 자동 파일 반영, 자동 conflict 분석, agent auto-propose, consumption-based exposure (W-C-05).

### 13.5 §1.2 "보류 중" 해소 경로

---

## 14. Dogfood Protocol (§1.3 자기 적용 실행 규약)

onto 자체 개발에 onto 도구 (review, reconstruct, evolve, govern) 를 사용하고, 사용 중 발견된 오류·요구사항을 다음 과제로 전환하는 루프.

### 14.1 3단계 루프

| 단계 | 시점 | 수행 | 산출물 |
|---|---|---|---|
| **도구 적용** | W-ID 구현 전·후 | review/evolve/reconstruct 도구 적용 | review record + learning |
| **마찰 수집** | 도구 사용 중 오류·friction | govern queue entry 기록 | govern queue pending 누적 |
| **과제 전환** | 세션 종료 시 | pending 항목 Principal 리뷰 → 유의미 항목 W-ID 도출 | 신규 W-ID |

### 14.2 도구 적용 매핑

| onto 도구 | 적용 시점 | 기대 효과 |
|---|---|---|
| MCP review | 구현 완료 후 변경 파일에 lens review | 자체 코드 품질 검증 + learning 축적 |
| future MCP evolve | 설계 세션 | scope lifecycle 로 설계 관리 |
| future MCP reconstruct | 기존 코드 이해 필요 시 | 역설계 ontology → 이해 가속 |
| future MCP govern route | 코드 변경 시 | drift 분류 실증 |
| future MCP govern promote-principle | 반복 발견 learning 승격 시 | knowledge → principle 경로 실증 |

### 14.3 마찰 수집 schema

```json
{
  "kind": "dogfood",
  "tool": "review | evolve | reconstruct | govern",
  "symptom": "도구 사용 중 구체 오류·friction 설명",
  "expected": "기대 동작",
  "severity": "blocking | degraded | cosmetic",
  "session_context": "어떤 W-ID 작업 중 발생했는가"
}
```

### 14.4 blocking 시 프로토콜

도구 사용 중 blocking 오류 발생 시:
1. `onto govern submit` 으로 즉시 기록
2. 도구 우회하여 수동으로 해당 작업 계속 진행 (도구 blocking ≠ 작업 blocking)
3. 세션 종료 시 blocking 항목 우선 W-ID 도출

### 14.5 §1.3 수준 정합

| 자율성 수준 | dogfood 에서의 의미 |
|---|---|
| 수준 0 | 도구 적용 안 함 (현재까지) |
| 수준 1 (W-C-02 gate 도달) | 도구 적용 + 마찰 수집 + Principal 판정. **본 §14 가 수준 1 실행 규약** |
| 수준 2 (향후) | 도구가 스스로 개선 제안 + 일부 자체 실행 |

- **W-D-05**: 도착지 구조 확정 (principle entity + canonical term + 3 계층 authoring path)
- **W-C-03 (본 §13)**: 승격 기준 (3축) + runtime CLI (`onto govern promote-principle`) 확정
- **잔존**: 실제 파일 자동 반영 (v1). "보류 중" 의 "경로 미구현" 부분은 W-C-03 으로 해소. "자동 반영 미구현" 부분은 v1 으로 명시 잔존.
