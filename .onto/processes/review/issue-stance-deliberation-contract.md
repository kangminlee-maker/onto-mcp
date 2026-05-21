# Issue-Stance Deliberation Contract

> 상태: Design target
> 목적: review에서 제기된 모든 issue에 대해 모든 lens의 입장을 수집하고, material conflict가 있는 issue만 통제된 숙의로 수렴시키는 계약을 정의한다.
> 구현 상태: TS runtime 반영 전. 이 문서는 다음 구현 target의 normative design이다.
> 기준 문서:
> - `.onto/processes/review/productized-live-path.md`
> - `.onto/processes/review/shared-phenomenon-contract.md`
> - `.onto/processes/review/lens-prompt-contract.md`
> - `.onto/processes/review/synthesize-prompt-contract.md`
> - `.onto/processes/review/record-contract.md`

---

## 1. Position

Review completeness의 단위는 lens가 아니라 `raised issue`다.

완료된 review는 아래 조건을 만족해야 한다.

1. Round 1에서 제기된 모든 issue가 `issue-ledger.yaml`에 등록된다.
2. 모든 participating lens는 모든 issue에 대해 입장을 남긴다.
3. 입장 차이가 material conflict를 만들면 해당 issue만 deliberation에 진입한다.
4. deliberation은 서로 다른 입장의 이유를 확인하고, 각 lens가 자기 입장을 유지/변경/축소할지 명시하게 한다.
5. teamlead는 issue별 결론을 네 상태 중 하나로 기록한다.
6. synthesize는 이 결론을 보존적으로 렌더링하며 새 resolution을 만들지 않는다.

이 계약은 다수결 규칙이 아니다. 합의는 반대 입장이 명시적으로 철회, 수정, 조건화, 또는 근거 부족을 인정할 때만 성립한다.

---

## 2. Relation To Shared Phenomenon

`shared-phenomenon-contract.md`는 co-location과 claim relation의 유일한 normative seat다.
본 계약은 그 규칙을 대체하지 않고, review 결과를 issue 단위로 닫는 상위 절차를 정의한다.

| Concept | Owner | 역할 |
|---|---|---|
| shared phenomenon | `shared-phenomenon-contract.md` | 같은 target + evidence locus에 놓인 claim 관계 분류 |
| raised issue | 본 계약 | review에서 해결하거나 보존해야 하는 문제 단위 |
| lens stance | 본 계약 | issue에 대한 각 lens의 입장 |
| issue resolution | 본 계약 | deliberation 후 issue가 어떤 상태로 닫혔는지 |

`raised issue`는 하나 이상의 lens-qualified claim에서 유래한다. 같은 shared phenomenon에 속한 claim들은 하나의 issue로 병합될 수 있지만, claim 방향이나 action이 materially 다르면 별도 issue로 보존할 수 있다.

---

## 3. Artifact Seats

issue-stance deliberation target path의 canonical seats:

```text
.onto/review/{session_id}/
  issue-ledger.yaml
  issue-stance-matrix.yaml
  deliberation-plan.yaml
  deliberation.md
```

역할:

| Artifact | Owner | 목적 |
|---|---|---|
| `issue-ledger.yaml` | teamlead/runtime-assisted LLM | Round 1 lens outputs에서 raised issue를 dedup/정규화 |
| `issue-stance-matrix.yaml` | lens stance actors | 모든 issue × 모든 lens 입장과 이유 기록 |
| `deliberation-plan.yaml` | teamlead/runtime-assisted LLM | material conflict가 있는 issue와 참여 lens, 처리 순서 고정 |
| `deliberation.md` | teamlead | issue별 최종 status와 이유 기록 |

runtime은 file seat, schema validation, missing-field fail-loud를 소유한다.
LLM은 issue 추출, stance 판단, conflict 해석, resolution 설명을 소유한다.

---

## 4. Issue Ledger

`issue-ledger.yaml`은 Round 1 lens outputs 이후 생성된다.

최소 shape:

```yaml
schema_version: 1
session_id: "{session_id}"
issues:
  - issue_id: issue-001
    raised_by_lens_ids: [logic, dependency]
    source_claim_refs:
      - round1/logic.md#finding-1
      - round1/dependency.md#finding-2
    target: "package.json"
    evidence_anchors:
      - "package.json:scripts.mcp:server"
    issue_statement: "mcp:server script uses a source-only path while package distribution is dist-centered."
    proposed_action: "Align packaged MCP server entrypoint with the built artifact boundary."
    severity: "medium"
    shared_phenomenon_ref:
      target: "package.json"
      evidence_anchor: "package.json:scripts.mcp:server"
```

Rules:

1. Every issue must cite at least one Round 1 source claim.
2. Teamlead must not invent an issue that no lens raised.
3. Duplicate issue candidates are merged only when target, evidence, claim direction, and action are compatible.
4. If merge safety is uncertain, keep separate issues and let stance/deliberation resolve relation later.
5. Issue IDs are session-local stable identifiers (`issue-001`, `issue-002`, ...).

---

## 5. Stance Matrix

Every participating lens must write a stance for every issue.

Allowed stance values:

| Stance | 의미 |
|---|---|
| `support` | issue statement/action에 동의 |
| `oppose` | issue statement/action에 반대 |
| `narrow` | 조건, 범위, severity, action을 축소해야 동의 |
| `not_applicable` | 해당 lens 관점에서 판단 대상이 아님 |
| `insufficient_evidence` | 판단에 필요한 evidence가 현재 boundary 안에 없음 |

Minimum shape:

```yaml
schema_version: 1
session_id: "{session_id}"
lens_ids: [logic, structure, dependency, semantics, pragmatics, evolution, coverage, conciseness, axiology]
issue_ids: [issue-001, issue-002]
stances:
  issue-001:
    logic:
      stance: support
      explanation: "The script/package boundary is inconsistent with the declared built-artifact surface."
      basis_ref: "round1/logic.md#finding-1"
    structure:
      stance: narrow
      explanation: "This is a distribution-boundary issue only if package install is in scope."
      basis_ref: "round1/structure.md#finding-2"
    axiology:
      stance: support
      explanation: "A misleading package entrypoint undermines the MCP-native product goal."
      basis_ref: "round1/axiology.md#finding-1"
```

Rules:

1. Missing stance is invalid.
2. `not_applicable` is still an opinion and must explain why the lens does not apply.
3. `insufficient_evidence` must name the missing evidence or boundary limitation.
4. A lens may disagree with its own Round 1 silence; it must explain the new stance from its lens perspective.
5. Stance collection happens before deliberation and does not consume other lenses' stance rationales unless the stance actor is explicitly in deliberation.

---

## 6. Material Conflict Detection

An issue enters deliberation only when the completed stance matrix contains material conflict.

Material conflict exists when at least one condition holds:

1. `support` and `oppose` both appear among applicable lenses.
2. A `narrow` stance changes the issue's action, severity, or scope in a way other applicable stances do not accept.
3. Two or more `narrow` stances impose incompatible conditions.
4. Lenses disagree on whether a cited domain constraint applies.
5. Axiology limits or reverses another lens's proposed action on purpose/value grounds.
6. `insufficient_evidence` contests the actionability of the issue, not merely the confidence wording.
7. Severity disagreement would change whether the issue is immediate action or recommendation.

Not material conflict:

1. Different explanations that support the same claim/action/severity.
2. `not_applicable` by itself.
3. Duplicate support from multiple lenses.
4. Minor wording differences that do not change target, action, severity, or condition.

---

## 7. Deliberation Plan

`deliberation-plan.yaml` is generated after material conflict detection.

Minimum shape:

```yaml
schema_version: 1
session_id: "{session_id}"
planned_issues:
  - issue_id: issue-001
    priority: 10
    conflict_type: action_boundary
    resolution_question: "Should the package MCP entrypoint be treated as an active defect or only a distribution watchpoint?"
    participating_lens_ids: [logic, structure, axiology]
    source_stance_refs:
      - issue-stance-matrix.yaml#stances.issue-001.logic
      - issue-stance-matrix.yaml#stances.issue-001.structure
      - issue-stance-matrix.yaml#stances.issue-001.axiology
```

Priority order:

1. correctness or blocking execution conflict
2. domain constraint conflict
3. purpose/value conflict
4. action/severity conflict
5. partial-overlap clarification

Participant rule:

- Include lenses whose stance creates or constrains the material conflict.
- Include the issue raiser when its original claim is contested.
- Exclude `not_applicable` lenses unless their non-applicability is itself contested.
- Deliberation is issue-scoped. A lens that has no material role in the issue is not invited to that issue's deliberation.

---

## 8. Deliberation Process

For each planned issue, participating lens actors receive bounded context:

1. the issue ledger entry,
2. the relevant stance matrix entries,
3. the source claim refs,
4. the materialized target/evidence refs needed to understand the issue.

They must answer:

```yaml
issue_id: issue-001
lens_id: structure
difference_explanation: "The disagreement is about distribution scope, not about the raw script value."
response_to_other_positions: "Logic is correct if packaged execution is in scope; otherwise severity should be reduced."
updated_stance: narrow
changed: false
change_reason: null
remaining_blocker: "Need package install execution evidence to call it an active defect."
```

Rules:

1. Deliberation confirms why opinions differ.
2. Each participant must declare whether it maintains or changes its stance.
3. A changed stance must state which other position or evidence caused the change.
4. No participant performs final synthesis.
5. Teamlead decides only from issue entry, stance matrix, and deliberation responses.

---

## 9. Issue Resolution Status

Every issue must end in exactly one status.

| Status | Condition |
|---|---|
| `no-deliberation-needed` | Stance matrix is complete and no material conflict exists. Applicable stances are compatible without changing action, severity, scope, or domain applicability. |
| `resolved` | After deliberation, all material-conflict participants explicitly converge on one claim/action/severity. Prior opposition is withdrawn, accepted, or declared non-blocking with rationale. |
| `narrowed` | After deliberation, participants converge only under explicit conditions, reduced scope, changed severity, or modified action. The narrowed form must be accepted by all material-conflict participants. |
| `unresolved-with-reason` | At least one material-conflict participant maintains an incompatible stance, required evidence is outside boundary, or a participant fails to provide a required updated stance. |

Global invariant:

- No issue can receive any status until every participating lens has a stance for that issue.
- `resolved` and `narrowed` require explicit stance movement or acceptance from the conflicting lenses.
- `unresolved-with-reason` is a valid completed outcome, not a degraded execution state.

Teamlead `deliberation.md` must record for each issue:

```yaml
issue_id: issue-001
status: narrowed
final_claim: "The MCP entrypoint is a distribution-boundary risk when packaged execution is in scope."
accepted_by_lens_ids: [logic, structure, axiology]
remaining_disagreement_lens_ids: []
reason: "Structure narrowed severity to package-install scope; logic and axiology accepted the scoped claim."
required_follow_up_evidence: ["package install smoke"]
```

---

## 10. Synthesize Boundary

Synthesize consumes:

1. `issue-ledger.yaml`
2. `issue-stance-matrix.yaml`
3. `deliberation-plan.yaml`
4. `deliberation.md`
5. Round 1 lens outputs

Synthesize must not:

1. create new issue resolutions,
2. change an issue status,
3. treat unresolved issues as consensus,
4. drop `not_applicable` or `insufficient_evidence` stances when they matter to the final explanation.

Synthesize may group issues for readability, but issue IDs and resolution statuses remain traceable.

---

## 11. ReviewRecord Direction

When implemented, `ReviewRecord` should add refs rather than duplicate full issue content:

```yaml
issue_ledger_ref: .onto/review/{session_id}/issue-ledger.yaml
issue_stance_matrix_ref: .onto/review/{session_id}/issue-stance-matrix.yaml
deliberation_plan_ref: .onto/review/{session_id}/deliberation-plan.yaml
issue_resolution_summary:
  - issue_id: issue-001
    status: narrowed
    accepted_by_lens_ids: [logic, structure, axiology]
    remaining_disagreement_lens_ids: []
```

The detailed human-readable reasoning remains in the source artifacts.

---

## 12. Implementation Order

Recommended TS implementation sequence:

1. Add artifact seats to `ReviewExecutionPlan`.
2. Build issue ledger from Round 1 lens outputs.
3. Dispatch stance actors so every lens covers every issue.
4. Validate stance matrix completeness.
5. Generate deliberation plan from material conflicts.
6. Dispatch issue-scoped deliberation only for planned issues.
7. Write teamlead `deliberation.md` with issue statuses.
8. Update synthesize prompt to consume issue artifacts.
9. Extend `ReviewRecord` refs and conformance tests.
