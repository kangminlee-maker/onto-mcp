# Issue-Stance Deliberation Contract

> 상태: Active
> 목적: review에서 제기된 surface finding들을 관계 그래프로 묶어 공통 root-cause issue를 도출하고, 그 issue에 대해 모든 lens의 입장을 수집한 뒤 material conflict가 있는 issue만 통제된 숙의로 수렴시키는 계약을 정의한다.
> 구현 상태: TS runtime active. 이 문서는 issue artifact prompt, validation, result classification projection의 normative contract다.
> 기준 문서:
> - `.onto/processes/review/productized-live-path.md`
> - `.onto/processes/review/shared-phenomenon-contract.md`
> - `.onto/processes/review/lens-prompt-contract.md`
> - `.onto/processes/review/synthesize-prompt-contract.md`
> - `.onto/processes/review/record-contract.md`
> - `.onto/processes/review/review-execution-ux-contract.md`

---

## 1. Position

Review completeness의 단위는 lens도, 개별 Round 1 finding도 아니다.
완료 단위는 **root-cause issue**다.

Round 1 finding은 표면 관찰이다. Review는 finding을 곧바로 독립 issue로 승격하지 않고,
finding 간 연결관계를 먼저 파악해 공통 원인을 가진 문제끼리 묶으려는 시도를 해야 한다.
이 과정에서 같은 root에서 나온 여러 표면 문제가 하나의 더 근본적인 issue로 드러날 수 있다.

완료된 review는 아래 조건을 만족해야 한다.

1. Round 1에서 제기된 모든 finding이 `finding-ledger.yaml`에 등록된다.
2. finding 간 관계와 공통 root 후보가 `finding-relation-graph.yaml`에 기록된다.
3. `issue-ledger.yaml`은 개별 finding 목록이 아니라 root-cause issue cluster 목록을 담는다.
4. 모든 participating lens는 모든 root-cause issue에 대해 입장을 남긴다.
5. 입장 차이가 material conflict를 만들면 해당 issue만 deliberation에 진입한다.
6. deliberation은 서로 다른 입장의 이유와 root-cause 해석 차이를 확인하고, 각 lens가 자기 입장을 유지/변경/축소할지 명시하게 한다.
7. teamlead는 issue별 결론을 네 상태 중 하나로 기록한다.
8. review closure는 issue별 problem framing/classification을 수행한다.
9. synthesize는 이 결론과 classification을 보존적으로 렌더링하며 새 resolution을 만들지 않는다.

이 계약은 다수결 규칙이 아니다. 합의는 반대 입장이 명시적으로 철회, 수정, 조건화, 또는 근거 부족을 인정할 때만 성립한다.

---

## 2. Relation To Shared Phenomenon

`shared-phenomenon-contract.md`는 co-location과 claim relation의 유일한 normative seat다.
본 계약은 그 규칙을 대체하지 않고, surface finding에서 root-cause issue로 올라가는 상위 절차를 정의한다.

| Concept | Owner | 역할 |
|---|---|---|
| shared phenomenon | `shared-phenomenon-contract.md` | 같은 target + evidence locus에 놓인 claim 관계 분류 |
| surface finding | 본 계약 | Round 1 lens output에서 제기된 관찰/문제 주장 |
| finding relation graph | 본 계약 | surface finding 사이의 causal, dependency, duplicate, conflict, same-root 관계 |
| root-cause issue | 본 계약 | 공통 root hypothesis 아래 묶인 문제 cluster |
| lens stance | 본 계약 | root-cause issue에 대한 각 lens의 입장 |
| issue resolution | 본 계약 | deliberation 후 root-cause issue가 어떤 상태로 닫혔는지 |
| severity presentation | `review-execution-ux-contract.md` | finding/issue가 review 목적의 신뢰성을 얼마나 훼손하는지 표시하는 scale |

`shared phenomenon`은 같은 위치를 보는 claim을 묶는다.
`root-cause issue`는 서로 다른 위치의 finding이라도 같은 근본 원인에서 비롯되었다면 묶을 수 있다.
`material issue` 여부는 별도 materiality enum이 아니라 severity와 problem-framing admission에서 파생된다.

Severity values are:

| Severity | Meaning |
|---|---|
| `blocker` | Declared primary happy path cannot be achieved by any intended user, or the result appears trustworthy while breaking a core contract. |
| `high` | A supported user group, environment, data condition, or execution path cannot achieve the declared purpose. |
| `medium` | The happy path is possible, but trust, auditability, reproducibility, completeness, or decision quality is meaningfully weakened. |
| `low` | Improvement opportunity that does not make the reviewed result unsafe for its declared purpose. |
| `info` | Observation, question, or evidence gap that is not yet an issue. |

`blocker`, `high`, and `medium` are material-severity candidates. They are admitted as material issues only when problem framing does not mark the issue as an evidence gap, outside the review boundary, or evidence-insufficient. `low` and `info` are non-material findings. Every admitted material issue must include `affected_purpose`, `failure_condition`, `impact`, and concrete `evidence_refs`.

예:

- shared phenomenon: `package.json:scripts.mcp:server`를 여러 lens가 본다.
- root-cause issue: `mcp:server`, package exports, build output, docs가 모두 "source/package boundary 미정의"라는 같은 root에서 나온 증상일 수 있다.

---

## 3. Artifact Seats

issue-stance deliberation target path의 canonical seats:

```text
.onto/review/{session_id}/
  finding-ledger.yaml
  finding-relation-graph.yaml
  issue-ledger.yaml
  stance-responses/
    {lens_id}.yaml
  issue-stance-matrix.yaml
  deliberation-plan.yaml
  deliberation/
    responses/
      {issue_id}/
        {lens_id}.yaml
  deliberation-resolution.yaml
  deliberation.md
  problem-framing.yaml
```

역할:

| Artifact | Owner | 목적 |
|---|---|---|
| `finding-ledger.yaml` | teamlead/runtime-assisted LLM | Round 1 lens outputs에서 surface finding을 안정 식별자로 등록 |
| `finding-relation-graph.yaml` | teamlead semantic judgment + runtime submit/write/validation | finding 간 same-root, causal, duplicate, conflict, dependency 관계 기록 |
| `issue-ledger.yaml` | teamlead semantic judgment + runtime submit/write/validation | finding graph에서 root-cause issue cluster를 도출 |
| `stance-responses/{lens_id}.yaml` | fresh lens stance actor + runtime submit/write/validation | issue-ledger 이후 해당 lens 관점의 모든 issue stance 작성 |
| `issue-stance-matrix.yaml` | lens stance actors + runtime aggregation | 모든 root-cause issue × 모든 lens 입장과 이유 기록 |
| `deliberation-plan.yaml` | LLM decision + runtime projection/submit/write/validation | material conflict가 있는 root-cause issue와 참여 lens, 처리 순서 고정 |
| `deliberation/responses/{issue_id}/{lens_id}.yaml` | participating deliberation lens + runtime submit/write/validation | issue-scoped deliberation 응답 |
| `deliberation-resolution.yaml` | controlled deliberation resolver + runtime submit/write/validation | issue별 최종 status, root-cause claim, remaining disagreement 기록 |
| `deliberation.md` | runtime projection | `deliberation-resolution.yaml`의 human-readable markdown projection |
| `problem-framing.yaml` | review closure actor + runtime submit/write/validation | root-cause issue의 공통 spine 분류와 domain profile 기반 분류 |

runtime은 file seat, schema validation, missing-field fail-loud를 소유한다.
Structured YAML artifact output에 한해 runtime은 submit tool admission과 YAML serialization/write를 함께 소유한다.
Free-form markdown/prose output은 runtime submit tool 전환 대상이 아니며 LLM-authored output으로 남는다.
LLM은 finding relation 해석, root-cause hypothesis 도출, stance 판단, conflict 해석, resolution 설명, review closure classification을 소유한다.
Domain-specific classification axes are owned by domain documents, not by this contract.

---

## 4. Finding Ledger

`finding-ledger.yaml`은 Round 1 lens outputs 이후 생성된다.
이 artifact는 finding을 issue로 해석하지 않고, surface observation으로만 등록한다.

최소 shape:

```yaml
schema_version: 1
session_id: "{session_id}"
findings:
  - finding_id: finding-001
    lens_id: logic
    source_ref: round1/logic.findings.yaml#finding-001
    target: "package.json"
    evidence_anchor: "package.json:scripts.mcp:server"
    claim: "mcp:server points at a source-only path while package execution expects built output."
    lens_rationale_summary: "Why the originating lens considered this finding relevant to the review contract."
    proposed_action: "Align MCP entrypoint with package/build boundary."
    affected_purpose: "MCP server can be invoked from the packaged runtime surface."
    failure_condition: "Package consumers run the declared MCP command after build/package installation."
    impact: "The command can look trustworthy but fail at runtime because the source/package boundary is unresolved."
    evidence_refs: [round1/logic.findings.yaml#finding-001]
    severity: medium
    domain_threshold_used: null
```

Rules:

1. Every Round 1 issue/finding claim that may affect final output must receive a stable `finding_id`.
2. `finding_id` is session-local and stable across downstream artifacts.
3. A finding is not a root-cause issue by itself.
4. `severity` must use `blocker`, `high`, `medium`, `low`, or `info`; retired `critical` is not a valid output value.
5. Every material finding must explain the affected purpose, failure condition, impact, and evidence refs.
6. If a lens output lacks enough evidence for a material severity, use `severity: info` and record the evidence gap instead of inventing a material issue.
7. If a lens output lacks a stable anchor, ledger construction must fail loudly or mark the finding as unaddressable with a reason in a validation section.
8. `lens_rationale_summary` is a compact semantic carrier from the originating lens. It preserves the lens-specific reason without requiring downstream stages to reopen raw lens prose by default.

---

## 5. Finding Relation Graph

`finding-relation-graph.yaml` records the attempt to discover root structure.
This step is mandatory even when every finding later remains singleton.

Allowed relation values:

| Relation | 의미 |
|---|---|
| `same_root_candidate` | 두 finding이 같은 root-cause hypothesis를 공유할 수 있음 |
| `shared_cause_candidate` | 두 finding의 root는 다르지만 인과사슬 중간 cause를 공유할 수 있음 |
| `causes` | 한 finding이 다른 finding을 직접 유발함 |
| `symptom_of` | 한 finding이 다른 root/cause finding의 증상임 |
| `enables` | 한 finding이 다른 finding의 발생 조건을 제공함 |
| `duplicates` | 동일 문제의 중복 보고 |
| `conflicts_with` | 두 finding의 claim/action/severity가 충돌 |

최소 shape:

```yaml
schema_version: 1
session_id: "{session_id}"
relations:
  - relation_id: rel-001
    from_finding_id: finding-001
    to_finding_id: finding-004
    relation: same_root_candidate
    root_hypothesis: "source/package boundary is not canonically assigned."
    rationale: "Both findings point to disagreement between source-time scripts and package/runtime surface."
    confidence: medium
singleton_findings:
  - finding_id: finding-009
    reason: "No accepted semantic relation is supported by available evidence."
```

Rules:

1. The graph must consider cross-lens and cross-artifact relations, not only same-locator relations.
2. Root hypotheses must be stated as falsifiable claims, not vague themes.
3. Low-confidence same-root candidates may still form provisional clusters, but the confidence must be preserved.
4. If a finding remains singleton, the graph must include why no relation was accepted.
5. Unrelated causal-analysis findings must be represented under `singleton_findings`, not as relation rows.
6. The graph must not collapse unrelated findings merely because they share severity or the same lens.

Root-cause grouping signals:

- same missing authority owner,
- same artifact seat gap,
- same runtime/package boundary mismatch,
- same naming or semantic drift source,
- same dependency direction error,
- same domain constraint interpretation gap,
- same policy/value conflict,
- one finding makes another finding likely or unavoidable.

---

## 6. Issue Ledger

`issue-ledger.yaml` is generated from `finding-ledger.yaml` and `finding-relation-graph.yaml`.
It contains root-cause issue clusters, not raw finding rows.
This unit consumes the finding ledger, relation graph, and review target profile;
it must not read Round 1 lens outputs directly.

Minimum shape:

```yaml
schema_version: 1
session_id: "{session_id}"
issues:
  - issue_id: issue-001
    root_cause_hypothesis: "The source/package execution boundary is not canonically assigned."
    root_confidence: medium
    surface_finding_ids: [finding-001, finding-004, finding-006]
    relation_refs: [rel-001, rel-003]
    raised_by_lens_ids: [logic, dependency, axiology]
    issue_statement: "Multiple surface defects stem from an unresolved boundary between source-time implementation paths and packaged MCP runtime paths."
    proposed_action: "Choose the canonical package/runtime seat and align scripts, exports, docs, and tests to it."
    affected_purpose: "MCP-native review runtime can be invoked through its declared package surface."
    failure_condition: "Users or hosts invoke the packaged command instead of a repo-local source path."
    impact: "The system may appear deployable while the declared runtime path cannot be trusted."
    evidence_refs: [round1/logic.findings.yaml#finding-001, round1/dependency.findings.yaml#finding-002]
    severity: high
    domain_threshold_used: null
    singleton_reason: null
```

Singleton issue shape:

```yaml
  - issue_id: issue-002
    root_cause_hypothesis: "The finding remains singleton after relation-graph review."
    root_confidence: low
    surface_finding_ids: [finding-009]
    relation_refs: []
    raised_by_lens_ids: [structure]
    issue_statement: "The finding remains a singleton issue after relation-graph review."
    proposed_action: "Preserve the issue for final classification."
    affected_purpose: "Declared review purpose"
    failure_condition: "Boundary condition from finding-009"
    impact: "Impact carried from finding-009"
    evidence_refs: [round1/structure.findings.yaml#finding-009]
    severity: low
    domain_threshold_used: null
    singleton_reason: "No causal, dependency, ownership, or same-root relation was supported by the available evidence."
```

Rules:

1. Every issue must cite at least one `finding_id`.
2. Teamlead must not invent an issue that no finding supports.
3. Each relation-graph-covered finding must belong to exactly one issue.
4. An issue with multiple `surface_finding_ids` must cite relation refs that connect those findings through `same_root_candidate`.
5. `shared_cause_candidate` must be preserved as cross-issue dependency context, not used as merge evidence.
6. Issue `evidence_refs` and `raised_by_lens_ids` must be projected from the assigned `finding-ledger.yaml` findings.
7. Singleton issues are allowed only after relation-graph review and must include `singleton_reason`.
8. The issue statement should describe the root, not merely restate a surface symptom.
9. If the root hypothesis is uncertain, keep the uncertainty rather than flattening it into a confident issue.
10. Every issue must carry the severity contract fields: `affected_purpose`, `failure_condition`, `impact`, `evidence_refs`, `severity`, and optional `domain_threshold_used`.
11. `material issue` is derived from severity plus problem-framing admission. Do not add a second materiality enum.

---

## 7. Stance Matrix

Every participating lens must submit a structured stance for every root-cause issue.
Stances are collected after `issue-ledger.yaml` exists; Round 1 lens workers do
not stay alive and hidden context is not used. Runtime creates one fresh
`issue-stance:{lens_id}` stance worker per participating lens. Each stance
worker consumes a runtime issue-stance input projection derived from the finding
ledger, relation graph, and issue ledger first. Round 1 lens outputs remain
bounded supplemental refs and should be read only when the projection lacks
lens-specific context needed for a stance rationale.
The projection must preserve issue action judgment context (`issue_statement`,
`proposed_action`, severity fields, `domain_threshold_used`, and
`singleton_reason`) plus compact `shared_cause` relation and `issue_dependencies`
summaries, so stance values can judge both root hypothesis and action without
re-reading raw Round 1 output by default.
The projection must also carry finding-level `lens_rationale_summary` values so
fresh stance workers can reconstruct the originating lens perspective from
artifact truth instead of hidden worker state.
Because stance responses are structured YAML artifact outputs, each stance worker submits semantic stance rows through the runtime submit tool;
runtime writes and validates each `stance-responses/{lens_id}.yaml`, then merges responses
into `issue-stance-matrix.yaml`. Runtime must not infer or rewrite lens stance
semantics during the merge.

Allowed stance values:

| Stance | 의미 |
|---|---|
| `support` | root-cause hypothesis and proposed action에 동의 |
| `oppose` | root-cause hypothesis or proposed action에 반대 |
| `narrow` | 조건, 범위, severity, action을 축소해야 동의 |
| `alternative_root` | surface findings는 인정하지만 다른 root-cause hypothesis를 제안 |
| `surface_only` | 표면 finding은 인정하지만 공통 root로 묶는 데 동의하지 않음 |
| `not_applicable` | 해당 lens 관점에서 판단 대상이 아님 |
| `insufficient_evidence` | 판단에 필요한 evidence가 현재 boundary 안에 없음 |

Enum fields must use exact tokens only. Explanation text belongs in
`rationale`/`explanation`, not in enum-valued fields.

Allowed `root_hypothesis_position` values:

| Value | 의미 |
|---|---|
| `accepts` | issue root hypothesis를 수용 |
| `narrows` | root hypothesis를 조건부/부분 수용 |
| `replaces` | 다른 root hypothesis로 대체 |
| `rejects` | root hypothesis를 거부 |
| `not_applicable` | lens 관점에서 root 판단 대상이 아님 |
| `insufficient_evidence` | root 판단 evidence가 부족 |

Allowed `severity_position` values:

| Value | 의미 |
|---|---|
| `keeps` | issue severity를 유지 |
| `raises` | issue severity를 상향 |
| `lowers` | issue severity를 하향 |
| `not_applicable` | severity 판단 대상이 아님 |
| `insufficient_evidence` | severity 판단 evidence가 부족 |

Minimum shape:

Per-lens response:

```yaml
schema_version: 1
session_id: "{session_id}"
lens_id: logic
stances:
  - issue_id: issue-001
    stance: support
    rationale: "The same unresolved boundary explains the script/runtime mismatch and export ambiguity."
    root_hypothesis_position: accepts
    severity_position: keeps
    evidence_refs: [round1/logic.findings.yaml#finding-001, finding-ledger.yaml#finding-001, finding-relation-graph.yaml#rel-001]
validation:
  missing_issues: []
```

Runtime-merged matrix:

```yaml
schema_version: 1
session_id: "{session_id}"
issues:
  - issue_id: issue-001
    stances:
    - lens_id: logic
      stance: support
      rationale: "The same unresolved boundary explains the script/runtime mismatch and export ambiguity."
      root_hypothesis_position: accepts
      severity_position: keeps
      evidence_refs: [round1/logic.findings.yaml#finding-001, finding-ledger.yaml#finding-001, finding-relation-graph.yaml#rel-001]
    - lens_id: structure
      stance: narrow
      rationale: "The cluster is valid only for package/runtime seats, not for all source references."
      root_hypothesis_position: narrows
      severity_position: keeps
      evidence_refs: [round1/structure.findings.yaml#finding-004, finding-ledger.yaml#finding-004]
    - lens_id: semantics
      stance: alternative_root
      rationale: "The stronger root is not packaging but ambiguous naming of runtime seats."
      root_hypothesis_position: replaces
      severity_position: keeps
      evidence_refs: [round1/semantics.findings.yaml#finding-006, finding-ledger.yaml#finding-006]
validation:
  missing_stances: []
```

Rules:

1. Missing stance is invalid.
2. A stance from a non-participating lens is invalid.
3. Stance `evidence_refs` must be string refs within the issue/lens provenance set: issue refs, assigned finding refs, relation/dependency refs, or the stance lens's bounded Round 1 ref.
4. `not_applicable` is still an opinion and must explain why the lens does not apply.
5. `insufficient_evidence` must name the missing evidence or boundary limitation.
6. `alternative_root` must provide an alternative root hypothesis.
7. A lens may disagree with its own Round 1 silence; it must explain the new stance from its lens perspective.
8. Stance collection happens before deliberation and does not consume other lenses' stance rationales.
9. `issue-stance-matrix.yaml` is a runtime aggregation of validated per-lens response artifacts, not a teamlead-authored stance inference artifact.

---

## 8. Material Conflict Detection

An issue enters deliberation only when the completed stance matrix contains material conflict.

Material conflict exists when at least one condition holds:

1. `support` and `oppose` both appear among applicable lenses.
2. `alternative_root` appears for the issue.
3. `surface_only` contests the cluster's root-cause grouping.
4. A `narrow` stance changes the issue's action, severity, scope, or root hypothesis in a way other applicable stances do not accept.
5. Two or more `narrow` stances impose conflicting conditions.
6. Lenses disagree on whether a cited domain constraint applies.
7. Axiology limits or reverses another lens's proposed action on purpose/value grounds.
8. `insufficient_evidence` contests the actionability of the root-cause issue, not merely confidence wording.
9. Severity disagreement would change whether the issue is immediate action or recommendation.

Not material conflict:

1. Different explanations that support the same root/action/severity.
2. `not_applicable` by itself.
3. Duplicate support from multiple lenses.
4. Minor wording differences that do not change root hypothesis, target, action, severity, or condition.

---

## 9. Deliberation Plan

`deliberation-plan.yaml` is generated after stance collection. Runtime first
builds a compact deliberation-plan input projection from `issue-ledger.yaml`,
`issue-stance-matrix.yaml`, and `finding-relation-graph.yaml`. The projection
marks deterministic conflict signals and suggested participants, but it is not
the final material-conflict decision. The LLM decides whether a candidate is a
real material conflict, chooses the conflict type, submits the resolution
question, and explains skipped issues. Because `deliberation-plan.yaml` is a structured YAML artifact output, runtime writes the YAML artifact and validates coverage,
participant refs, material severity, and stance-ref consistency.

Minimum shape:

```yaml
schema_version: 1
session_id: "{session_id}"
planned_issues:
  - issue_id: issue-001
    priority: 10
    conflict_type: root_hypothesis
    resolution_question: "Is the common root a source/package boundary gap or a runtime-seat naming gap?"
    participating_lens_ids: [logic, structure, semantics, axiology]
    source_stance_refs:
      - issue-stance-matrix.yaml#stances.issue-001.logic
      - issue-stance-matrix.yaml#stances.issue-001.structure
      - issue-stance-matrix.yaml#stances.issue-001.semantics
      - issue-stance-matrix.yaml#stances.issue-001.axiology
    conflict_summary: "The stances disagree on whether the package boundary is the root or a symptom of a deeper runtime-seat naming gap."
skipped_issues:
  - issue_id: issue-002
    reason_code: non_material_issue
    reason: "The issue is recorded for traceability but its severity is low, so it does not require material conflict deliberation."
```

Priority order:

1. correctness or blocking execution conflict
2. root-cause hypothesis conflict
3. domain constraint conflict
4. purpose/value conflict
5. action/severity conflict
6. partial-overlap or singleton-vs-cluster clarification

Participant rule:

- Include lenses whose stance creates or constrains the material conflict.
- Include at least one lens that raised each contested surface finding in the cluster.
- Exclude `not_applicable` lenses unless their non-applicability is itself contested.
- Deliberation is issue-scoped. A lens that has no material role in the issue is not invited to that issue's deliberation.
- `source_stance_refs` must exactly match `participating_lens_ids` using
  `issue-stance-matrix.yaml#stances.{issue_id}.{lens_id}` refs.
- `planned_issues` may contain only `blocker`, `high`, or `medium` material-severity issue candidates.
- Every issue must appear exactly once in either `planned_issues` or
  `skipped_issues`.

Skipped reason codes:

| Code | Meaning |
|---|---|
| `non_material_issue` | Severity is `low` or `info`; record but do not deliberate. |
| `consistent_stances` | Material issue exists but applicable stances do not conflict. |
| `no_material_conflict` | A runtime candidate was reviewed and judged not to require material deliberation. |
| `outside_deliberation_scope` | The issue is valid but the disagreement cannot be resolved inside current review boundary. |
| `insufficient_participation` | A material conflict candidate lacks enough valid participant stances to deliberate. |

---

## 10. Deliberation Process

For each planned issue, participating lens actors receive bounded context:

1. the issue ledger entry,
2. the relevant finding ledger entries,
3. the relevant finding relation graph entries,
4. the relevant stance matrix entries,
5. the source claim refs,
6. the materialized target/evidence refs needed to understand the issue.
7. compact `related_issue_context` for issue dependencies that affect this issue.

Because issue-scoped deliberation responses are structured YAML artifact outputs, participants submit response payloads and runtime writes them to `deliberation/responses/{issue_id}/{lens_id}.yaml`:

```yaml
schema_version: 1
issue_id: issue-001
lens_id: structure
difference_explanation: "The disagreement is about whether packaging is the root or only one symptom."
response_to_other_positions: "Logic is correct that package/runtime evidence is affected; semantics is correct that naming ambiguity may be the deeper root."
updated_stance: narrow
changed: true
change_reason: "Accepted semantics' narrower root framing while preserving package boundary as a symptom."
accepted_root_hypothesis: "Runtime seat naming is ambiguous, producing package/runtime boundary symptoms."
remaining_blocker: null
```

Rules:

1. Deliberation confirms why opinions differ.
2. Each participant must declare whether it maintains or changes its stance.
3. A changed stance must state which other position or evidence caused the change.
4. No participant performs final synthesis.
5. Teamlead decides only from issue entry, finding graph, stance matrix, and deliberation responses.

---

## 11. Issue Resolution Status

Every root-cause issue must end in exactly one status.

| Status | Condition |
|---|---|
| `no-deliberation-needed` | Stance matrix is complete and no material conflict exists. Applicable stances are consistent on root hypothesis, action, severity, scope, and domain applicability. |
| `resolved` | After deliberation, all material-conflict participants explicitly converge on one root hypothesis and one claim/action/severity. Prior opposition or alternative-root claims are withdrawn, accepted, or declared non-blocking with rationale. |
| `narrowed` | After deliberation, participants converge only under explicit conditions, reduced scope, changed severity, modified action, or a narrower root hypothesis. The narrowed form must be accepted by all material-conflict participants. |
| `unresolved-with-reason` | At least one material-conflict participant maintains a conflicting root/action/severity stance, required evidence is outside boundary, or a participant fails to provide a required updated stance. |

Global invariant:

- No issue can receive any status until every participating lens has a stance for that issue.
- `resolved` and `narrowed` require explicit stance movement or acceptance from the conflicting lenses.
- `unresolved-with-reason` is a valid completed outcome, not a degraded execution state.
- Surface findings inside an issue inherit the issue status but remain individually traceable.

Teamlead `deliberation-resolution.yaml` must record for each issue:

```yaml
issue_id: issue-001
status: narrowed
final_root_cause: "Runtime seat naming is ambiguous, producing package/runtime boundary symptoms."
final_claim: "The package MCP entrypoint risk should be fixed by first assigning canonical runtime seat names."
surface_finding_ids: [finding-001, finding-004, finding-006]
accepted_by_lens_ids: [logic, structure, semantics, axiology]
remaining_disagreement_lens_ids: []
reason: "Structure and logic accepted semantics' narrower root framing while preserving their surface findings as symptoms."
required_follow_up_evidence: ["package install smoke"]
```

---

## 12. Review Closure Problem Framing

`problem-framing.yaml` is generated after `deliberation-resolution.yaml`/`deliberation.md` and before synthesize.
This step does not propose fixes. It reframes and classifies the root-cause issues so the final review explains what kind of problem each issue is and when it should matter.

Problem framing has two layers:

1. **Common spine**: domain-independent issue classification owned by this contract.
2. **Domain profile**: domain-specific classification axes owned by `.onto/domains/{domain}/problem_framing_profile.md`.
3. **Target profile**: artifact role and closure obligation from `review-target-profile.yaml`.

The domain profile document is a `domain_document` with `doc_type: custom:problem_framing_profile`.
It may add domain-specific axes, but it must not redefine common spine values.

Runtime builds a compact problem-framing input projection from `issue-ledger.yaml`,
`issue-stance-matrix.yaml`, `deliberation-plan.yaml`,
`deliberation-resolution.yaml`, `review-target-profile.yaml`, and the selected
domain profile's axis catalog and profile Rules. The LLM uses this projection
first and does not read raw Round 1 lens outputs, issue-scoped deliberation
responses, or raw domain profile documents by default. The projection must
preserve issue purpose/condition/impact, stance context, deliberation
plan/resolution context, target-profile closure context, domain-axis values,
and domain profile value-application rules needed for semantic classification.

Because `problem-framing.yaml` is a structured YAML artifact output, the LLM
submits only the semantic `classifications` rows through `submit_issue_artifact`.
Runtime owns `classification_context`, `related_surface_finding_ids`, envelope
fields, YAML serialization/write, and validation. `related_surface_finding_ids`
must exactly match the `surface_finding_ids` for that issue in
`issue-ledger.yaml`. `classification_context` must match `review-target-profile.yaml`
and the selected `problem_framing_profile.md` ref. `domain_axes` may use only
axis names and values declared by the selected profile; when no profile is
applied, `domain_axes` must be empty.

Durable artifact shape:

```yaml
schema_version: 1
session_id: "{session_id}"
classification_context:
  common_spine_version: 1
  session_domain: software-engineering
  domain_profile_ref: ".onto/domains/software-engineering/problem_framing_profile.md"
  domain_profile_doc_type: "custom:problem_framing_profile"
  domain_profile_status: applied
classifications:
  - issue_id: issue-001
    problem_definition: "The contract lacks producer/aggregation seats for issue stance artifacts, so the planned runtime path cannot be implemented deterministically."
    issue_role: root_cause
    judgment_state: inferred
    impact_kind: consistency
    timing_class: next_step_blocker
    closure_class: carry_forward
    closure_obligation: may_close_during_next_stage
    domain_axes:
      implementation_surface: review_runtime
      defect_kind: contract_gap
    rationale: "This does not invalidate the design direction, but it blocks the next TS implementation step."
    related_surface_finding_ids: [finding-001, finding-004]
```

### 12.1 Common Spine

The common spine is required for every root-cause issue, regardless of domain.

Allowed `issue_role` values:

| Value | Meaning |
|---|---|
| `root_cause` | cluster의 근본 원인으로 판단됨 |
| `symptom` | 다른 issue의 표면 증상으로 판단됨 |
| `enabler` | 다른 issue가 발생할 조건을 제공함 |
| `conflicting_interpretation` | 같은 evidence에 대한 해석 충돌이 핵심임 |
| `evidence_gap` | issue를 닫는 데 필요한 evidence가 부족함 |
| `independent_issue` | relation review 후 독립 issue로 남음 |

Allowed `judgment_state` values:

| Value | Meaning |
|---|---|
| `observed` | artifact evidence에서 직접 확인됨 |
| `inferred` | 여러 finding 관계에서 추론됨 |
| `contested` | lens 간 해석 충돌이 남아 있음 |
| `insufficient_evidence` | 현재 boundary 안 evidence로 판정 불가 |
| `outside_boundary` | review target 밖 evidence가 필요함 |

Allowed `impact_kind` values:

| Value | Meaning |
|---|---|
| `correctness` | 결과나 판단의 참/거짓, 유효성에 영향 |
| `consistency` | 항목 간 정합성, authority alignment에 영향 |
| `completeness` | 필요한 coverage나 요소 누락에 영향 |
| `safety_risk` | 손실, 위해, compliance, 운영 리스크에 영향 |
| `usability` | 사용자/운영자/소비자의 사용 가능성에 영향 |
| `governance_value` | 가치 판단, 책임, 승인, 규범 경계에 영향 |
| `maintainability_evolvability` | 유지보수, 확장, 진화 비용에 영향 |

Allowed `timing_class` values:

| Value | Meaning |
|---|---|
| `current_blocker` | 현재 artifact/review completion을 닫기 전에 반드시 처리해야 함 |
| `next_step_blocker` | 현재 review는 닫을 수 있지만 다음 개발 step 전에 처리해야 함 |
| `planned_follow_up` | 명시 후 후속 작업으로 넘길 수 있음 |
| `defer_watch` | 지금은 관찰/기록만 하고 조건 발생 시 재검토 |

Allowed `closure_class` values:

| Value | Meaning |
|---|---|
| `fix_now` | 현재 작업 범위에서 바로 수정해야 함 |
| `carry_forward` | 다음 작업의 input으로 넘김 |
| `document_only` | runtime 수정 없이 authority/docs 정리로 충분 |
| `needs_decision` | 구현 전 사용자/maintainer 결정 필요 |
| `needs_evidence` | 추가 evidence 수집 전 action 금지 |
| `watch` | 추적만 하고 즉시 action 없음 |

Allowed `closure_obligation` values:

| Value | Meaning |
|---|---|
| `must_close_in_target` | 이 target 자체가 현재 boundary 안에서 닫아야 하는 문제 |
| `must_close_before_next_stage` | 현재 target은 완료 가능하지만 다음 단계 진입 전 닫아야 하는 문제 |
| `may_close_during_next_stage` | 다음 구현/작성/운영 단계에서 닫아도 되는 문제 |
| `planned_later` | 현재 계획상 후속 단계로 명시해도 되는 문제 |
| `out_of_scope` | 현재 target obligation 밖의 문제 |

### 12.2 Domain Profile Loading

If `session_domain` is not `none`, problem framing checks for:

```text
.onto/domains/{domain}/problem_framing_profile.md
```

Domain profile resolution follows the same product-locality order as other domain documents.

Profile states:

| State | Meaning |
|---|---|
| `applied` | profile exists, validates, and domain axes are used |
| `absent` | profile does not exist; common spine only |
| `not_requested` | session has no domain |

Invalid profile content must fail loudly.
Missing profile is not an error by itself because not every domain needs specialized closure axes.
When the review intent requires domain-specific classification and the profile is absent, classify the affected issue with `closure_class: needs_decision` or `closure_class: needs_evidence` and explain why.

Domain profile minimum shape:

```markdown
---
doc_type: custom:problem_framing_profile
---

# {Domain} Problem Framing Profile

## Domain Axes

### {axis_name}

| Value | Meaning |
|---|---|
| example_value | Domain-specific meaning |
```

Rules for domain profiles:

1. A profile may add axes under `domain_axes`.
2. A profile must not redefine `issue_role`, `judgment_state`, `impact_kind`, `timing_class`, or `closure_class`.
3. Axis names must be snake_case.
4. Axis values must be stable identifiers.
5. Required domain axes must state when they are required.
6. Optional domain axes must state when omission is valid.

Rules:

1. Classification is issue-level, not finding-level.
2. A `blocker` finding does not automatically become `current_blocker`; timing depends on the current review goal and development phase.
3. Domain-specific axes must be read from the selected domain profile, not invented in synthesize.
4. `next_step_blocker` is a valid closure: the review can complete while explicitly carrying the issue forward.
5. `problem-framing.yaml` must not propose implementation steps beyond the classification/rationale level.
6. If classification depends on user intent or roadmap unknowns, set `closure_class: needs_decision`.
7. If a stale authority expression does not affect runtime behavior, represent that in domain axes or rationale rather than upgrading it to `current_blocker`.
8. The problem-framing actor submits only `classifications`; runtime fills `classification_context` and `related_surface_finding_ids`.
9. `related_surface_finding_ids` is an issue-ledger projection and must not be narrowed, expanded, or reordered by semantic classification.
10. Runtime validation rejects `domain_axes` names or values that are not declared in the selected problem-framing profile.
11. Runtime validation rejects `classification_context` drift from review-target profile domain or selected profile ref/status.

---

## 13. Synthesize Boundary

Synthesize consumes:

1. `finding-ledger.yaml`
2. `finding-relation-graph.yaml`
3. `issue-ledger.yaml`
4. `issue-stance-matrix.yaml`
5. `deliberation-plan.yaml`
6. `deliberation.md`
7. `problem-framing.yaml`
8. Round 1 lens outputs

Synthesize must not:

1. create new root-cause issues,
2. change an issue status,
3. split or merge issue clusters,
4. change common spine or domain profile classification,
5. treat unresolved issues as consensus,
6. drop `alternative_root`, `surface_only`, `not_applicable`, or `insufficient_evidence` stances when they matter to the final explanation.

Synthesize may group issues for readability, but issue IDs, root hypotheses, surface finding IDs, resolution statuses, common spine values, and domain axes remain traceable.

---

## 14. ReviewRecord Direction

When implemented, `ReviewRecord` should add refs rather than duplicate full issue content:

```yaml
finding_ledger_ref: .onto/review/{session_id}/finding-ledger.yaml
finding_relation_graph_ref: .onto/review/{session_id}/finding-relation-graph.yaml
issue_ledger_ref: .onto/review/{session_id}/issue-ledger.yaml
issue_stance_matrix_ref: .onto/review/{session_id}/issue-stance-matrix.yaml
deliberation_plan_ref: .onto/review/{session_id}/deliberation-plan.yaml
deliberation_result_ref: .onto/review/{session_id}/deliberation-resolution.yaml
deliberation_result_sha256: "{sha256(deliberation-resolution.yaml)}"
problem_framing_ref: .onto/review/{session_id}/problem-framing.yaml
synthesis_result_ref: .onto/review/{session_id}/synthesis-ledger.yaml
synthesis_result_sha256: "{sha256(synthesis-ledger.yaml)}"
synthesis_output_sha256: "{sha256(synthesis.md)}"
final_output_ref: .onto/review/{session_id}/final-output.md
final_output_sha256: "{sha256(final-output.md)}"
issue_resolution_summary:
  - issue_id: issue-001
    status: narrowed
    final_root_cause: "Runtime seat naming is ambiguous, producing package/runtime boundary symptoms."
    issue_role: root_cause
    judgment_state: inferred
    impact_kind: consistency
    timing_class: next_step_blocker
    closure_class: carry_forward
    closure_obligation: may_close_during_next_stage
    domain_axes:
      implementation_surface: review_runtime
      defect_kind: contract_gap
    surface_finding_ids: [finding-001, finding-004, finding-006]
    accepted_by_lens_ids: [logic, structure, semantics, axiology]
    remaining_disagreement_lens_ids: []
```

The detailed human-readable reasoning remains in the source artifacts.

---

## 15. Runtime Timeout Policy

Controlled deliberation timeout is a hard halt, not an unresolved-stance
continuation path.

If any per-lens deliberation response or teamlead controlled deliberation unit
times out or fails:

- synthesize MUST NOT run
- `execution-result.yaml.execution_status` MUST be `halted_partial`
- `execution-result.yaml.deliberation_status` MUST be `not_performed`
- `execution-result.yaml.halt_phase` MUST identify `controlled_lens_deliberation`
- `execution-result.yaml.halt_unit_id` and `halt_unit_kind` MUST identify the
  failed deliberation unit
- lens-bound deliberation failures SHOULD expose `halt_lens_id` as the
  lens id derived from `deliberation:{issue_id}:{lens_id}`
- `deliberation_execution_results` MUST preserve completed and failed
  deliberation unit results, including timeout `failure_message`
- `review-run-manifest.yaml` MUST mirror the halt phase, unit, lens, and reason
- `review-record.yaml` MUST NOT expose produced-artifact refs for
  `synthesis.md` or `deliberation-resolution.yaml` when those files were not produced
- `review-record.yaml` MUST preserve refs for issue-stage artifacts that were
  produced before the halt, independent of whether synthesize ran

This preserves the context-isolated lens outputs and failure identity without
letting synthesize infer a final review from incomplete deliberation truth.

## 16. Implementation Order

Recommended TS implementation sequence:

1. Add artifact seats to `ReviewExecutionPlan`.
2. Build finding ledger from Round 1 lens outputs.
3. Build finding relation graph and root-cause issue ledger.
4. Dispatch stance actors so every lens covers every root-cause issue.
5. Validate stance matrix completeness.
6. Project deliberation conflict candidates in runtime, then generate
   `deliberation-plan.yaml` through LLM material-conflict decision and runtime
   validation.
7. Dispatch issue-scoped deliberation only for planned issues.
8. Resolve planned issues through `submit_deliberation_resolution`; because the resolution is a structured YAML artifact output, runtime writes validated `deliberation-resolution.yaml` with issue statuses and final root-cause hypotheses.
9. Render `deliberation.md` as a deterministic human-readable projection.
10. Resolve selected domain `problem_framing_profile.md` when present and validate it fail-loud.
11. Generate `problem-framing.yaml` with common spine plus domain axes.
12. Update synthesize prompt to consume finding/issue/problem-framing artifacts.
13. Extend `ReviewRecord` refs and conformance tests.
