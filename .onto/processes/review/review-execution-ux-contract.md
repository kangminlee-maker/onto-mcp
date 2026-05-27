# Review Execution UX Contract

> 상태: Active contract
> 목적: `검토 (review)` 실행 전체에서 주체자가 판단 가능한 상태와 결과를 받도록 하는 진행 UX contract를 정의한다.
> 기준 문서:
> - `.onto/processes/review/productized-live-path.md`
> - `.onto/processes/review/review-target-profile-contract.md`
> - `.onto/processes/review/pre-dispatch-contracts.md`
> - `.onto/processes/review/issue-stance-deliberation-contract.md`
> - `.onto/processes/review/record-contract.md`
> - `.onto/processes/review/record-field-mapping.md`
> - `.onto/authority/core-lexicon.yaml`

---

## 1. Position

Review execution UX is the user-facing presentation contract for the whole
review run, not only the final rendered output.

The product goal is a **decision-ready review result**:

> A review result presents findings in a decision-ready form by classifying
> their severity, evidence, affected purpose, failure condition, and actionable
> disposition candidates.

This contract does not replace artifact truth. It defines how existing runtime
facts and review artifacts are presented across setup, progress, halt, and final
result surfaces.

Canonical artifact authority remains:

- runtime state and halt truth: `execution-result.yaml` and
  `review-run-manifest.yaml`
- issue/finding truth: issue-stage artifacts defined by
  `.onto/processes/review/issue-stance-deliberation-contract.md`
- primary aggregate: `review-record.yaml`
- human-readable rendering: `final-output.md`

Derived presentation surfaces include MCP `llmPresentation` prompt/input pairs.
They are not artifact authority; they are host-facing views constructed from the
artifact-backed facts above.

This contract does not require a dedicated HTML UI or a new visual app. Progress
presentation should be plain text or Markdown rendered by the current host,
using bounded runtime facts as input.

---

## 2. UX Principle

The review UX must make the run **progressively decision-ready**.

At every visible stage, the user should be able to tell:

1. what the review is trying to judge,
2. what scope and evidence boundary it is using,
3. what has completed,
4. what is blocked or degraded,
5. which artifacts contain the source truth,
6. what action candidates are now available.

The UX must not depend on CLI stdout as an authority. CLI, MCP, and final output
surfaces may render differently, but they must present the same bounded facts.

Long-running review UX must not only report process metadata such as "step X is
running." It should continuously summarize newly available review information:
which evidence has been gathered, which lenses have completed, which issue
patterns are emerging, what remains unknown, and whether any action-relevant
risk has appeared.

---

## 3. Concept Economy

This contract reuses existing concepts:

| Existing concept | Reuse in this contract |
|---|---|
| `review_process` | 전체 진행 UX가 따르는 execution flow |
| `ReviewRecord` | final primary artifact |
| `review_target_profile` | 목적, 대상, closure obligation 표시 source |
| `finding` | evidence-backed observation or issue claim |
| `issue` | finding relation review로 도출된 root-cause cluster |
| `problem_framing` | issue의 timing/closure/domain classification source |
| `execution-result.yaml` | runtime status and halt source |
| `review-run-manifest.yaml` | progress, step, and run audit source |

This contract does not introduce a separate `materiality` field. Material issue
status is derived from `severity`.

```text
material_issue = severity in [blocker, high, medium]
non_material_finding = severity in [low, info]
```

---

## 4. Severity Scale

Severity classifies how strongly a finding affects trust in the reviewed result
for its declared purpose.

| Severity | Material? | Definition | Action implication |
|---|---:|---|---|
| `blocker` | yes | The declared primary happy path cannot be achieved by any intended user, or the result appears trustworthy while breaking a core contract. | Present first; usually `fix_now` or explicit scope change before relying on the result. |
| `high` | yes | A supported user group, environment, data condition, or execution path cannot achieve the declared purpose. | Present before release/use; requires fix, scope exclusion, or accepted risk. |
| `medium` | yes | The primary happy path remains possible, but trust, auditability, reproducibility, completeness, or decision quality is meaningfully weakened. | Requires owner, follow-up, evidence, or accepted risk before closure claims. |
| `low` | no | Improvement opportunity that does not make the reviewed result unsafe to trust for its declared purpose. | Can move to backlog or follow-up. |
| `info` | no | Observation, question, or evidence gap that is not yet an issue. | Ask for evidence, watch, or ignore. |

Rules:

1. `severity` is finding-level or issue-level depending on the artifact layer.
2. `blocker`, `high`, and `medium` are material issues.
3. `low` and `info` are not material issues.
4. A severity claim must cite evidence. Without evidence, use `info` or a
   domain-specific `needs_evidence` classification in problem framing.
5. A `blocker` finding does not automatically become `current_blocker` in
   problem framing. Timing still depends on the review target role, declared
   purpose, and development phase.

---

## 5. Required Finding Presentation Fields

Every displayed finding should preserve enough structure for action.

| Field | Purpose |
|---|---|
| `finding_id` or `issue_id` | Stable handle for discussion and follow-up |
| `severity` | One of `blocker`, `high`, `medium`, `low`, `info` |
| `affected_purpose` | Which declared purpose, requirement, contract, or decision is affected |
| `failure_condition` | User group, environment, data condition, execution path, or boundary where it fails |
| `impact` | Why this changes trust in the reviewed result |
| `evidence_refs` | Artifact, file, line, table, test, or review source refs |
| `source_lens_ids` | Lenses that raised or constrained the finding |
| `confidence` | Optional confidence when evidence is partial |
| `action_candidates` | Derived presentation candidates added after issue/runtime classification; not emitted as lens or finding-source truth |
| `rationale` | Short explanation of the severity and action candidates |
| `domain_threshold_used` | Optional domain threshold, such as accounting materiality or ontology authority rule |

`action_candidates` are a presentation projection. They must be derived from
existing authority fields instead of becoming a second next-action enum.
Lens and finding-source artifacts should provide the inputs needed for
derivation: severity, affected purpose, failure condition, impact, evidence,
source lens ids, confidence, rationale, and any domain threshold used.

Derivation sources:

- issue timing and disposition: `problem-framing.yaml` `timing_class`,
  `closure_class`, and `closure_obligation`
- runtime halt and retry state: `execution-result.yaml` and
  `review-run-manifest.yaml`
- target role, material kind, and boundary: `review-target-profile.yaml`

Recommended presentation labels:

| Candidate | Meaning |
|---|---|
| `fix_now` | Treat as in-scope immediate work |
| `fix_before_release` | Do not rely on/release the target before fixing |
| `accept_risk` | Candidate option to proceed with explicit residual-risk acceptance; it never means the risk is already accepted |
| `follow_up` | Track as future work outside the current run |
| `out_of_scope` | Exclude from current purpose or boundary |
| `needs_evidence` | Collect evidence before choosing a fix/disposition |
| `continue_review` | Expand review because the current evidence boundary is insufficient |
| `retry_execution` | Retry a failed runtime step or provider route |

Mapping rules:

| Candidate | Primary derivation |
|---|---|
| `fix_now` | `closure_class: fix_now` |
| `fix_before_release` | `closure_obligation: must_close_before_next_stage` or equivalent target obligation |
| `accept_risk` | bounded residual risk plus a target/disposition state that allows explicit risk acceptance; the accepted disposition is recorded only after a later user or maintainer decision |
| `follow_up` | `closure_class: carry_forward`, `document_only`, or `watch` |
| `out_of_scope` | `closure_obligation: out_of_scope` |
| `needs_evidence` | `closure_class: needs_evidence` or evidence-gap judgment |
| `continue_review` | `judgment_state: insufficient_evidence` / `outside_boundary` or boundary insufficiency |
| `retry_execution` | runtime halt/failure state in `execution-result.yaml` or `review-run-manifest.yaml` |

If no derivation source supports a candidate, the candidate must not be shown.
If a user later chooses `accept_risk`, that accepted disposition belongs in a
separate decision/closure record or future workflow surface. Review presentation
may show the candidate; it must not present the candidate as already accepted.

---

## 6. Start And Progress Output

Review execution must produce visible user-facing output at the start and during
long-running stages.

These outputs are presentation views over existing artifacts and runtime state.
They are not separate authority artifacts.

### 6.1 Opening Brief

The opening brief appears before worker dispatch when enough setup facts are
known.

Minimum content:

- environment: host/runtime route, project root, session root
- method: execution realization, worker/direct-call/mock route, selected lens ids
- model: non-secret teamlead, lens, and synthesize model/profile summary
- domain: selected domain and domain profile status
- target: what content will be reviewed
- review direction: what the review is trying to judge, including purpose,
  value criteria, and boundary
- expected stages: setup, lens execution, issue construction, deliberation,
  synthesize, final record
- artifact root and how the user can inspect it

Model/profile summary must include visible non-secret facts such as provider,
model id, effort/profile id, executor mode, and auth mode. It must never expose
credential values. If model/profile facts are not resolved yet, the brief must
say what is unresolved and why instead of omitting the field.

The brief should be short. It should help the user decide whether the run is
looking at the right target with the right intent before a long wait begins.

### 6.2 Progress Visualization

Progress must be shown continuously as a stepwise view or progress bar.

Minimum shape:

```text
[2/7] Lens execution
done: interpretation, binding
active: logic, structure, semantics, axiology
waiting: issue construction, deliberation, synthesize, record
latest: provisional lens-local signal: logic reported 2 medium contract-risk findings; structure still running
```

Allowed renderings:

- plain-text stepper
- Markdown checklist
- percentage/progress bar derived from manifest step counts
- compact stage table

Not required:

- dedicated HTML implementation
- custom frontend state store
- separate visualization artifact

### 6.3 Continuous Information Updates

Progress updates should include the most recent user-relevant information, not
only lifecycle metadata.

Examples of useful updates:

- a lens completed and what kind of finding it produced
- a severity count changed
- a possible root-cause issue cluster appeared
- a material conflict requires deliberation
- a domain threshold or evidence boundary affected classification
- a provider/runtime delay occurred and which unit is still pending
- a halt risk appeared or a halt occurred

Examples of insufficient updates:

- "still running"
- "waiting for worker"
- "step 3 in progress"

Those messages can appear as status details, but they are not enough by
themselves for long-running review UX.

### 6.4 Update Triggers And Cadence

Progress output should be emitted when any action-relevant state changes:

- opening brief becomes available
- a stage starts or completes
- a lens unit starts, completes, fails, degrades, or times out
- issue artifact construction completes
- severity counts, highest severity, or material issue count changes
- an issue enters deliberation or receives a deliberation status
- synthesize or record assembly starts or completes
- halt, degradation, provider delay, or retry-relevant failure appears

If no action-relevant state changes for a long-running step, the presentation
channel should still emit a bounded liveness update. The default target is every
60 to 120 seconds in interactive hosts, with host-level throttling allowed when
the UI cannot display that cadence. A liveness update may be mostly process
metadata, but it must name the pending units, elapsed wait, and next expected
event.

### 6.5 Interim Signal Status

Progress updates before final output are not final review conclusions.

Every finding-like progress update must label its status:

| Status | Meaning |
|---|---|
| `lens_local` | A single lens has reported it; no cross-lens grouping yet |
| `issue_candidate` | Relation review suggests a possible root-cause issue |
| `deliberation_pending` | The issue may change after controlled deliberation |
| `deliberated` | Deliberation produced a status, but synthesize has not rendered final output |
| `finalized` | Reflected in final output and `ReviewRecord` |

Intermediate updates may mention severity, but they must preserve the interim
status so users do not confuse early lens-local signals with finalized review
results.
Process-only liveness updates that contain no finding-like signal should use
`interim_signal_status: null`.

### 6.6 Rendering Channel

Runtime owns bounded facts. The visible wording may be produced through one of
two existing channels:

1. visible CLI output when the user can see the terminal,
2. host-rendered LLM presentation when CLI output is hidden by MCP or another
   runtime host.

In MCP contexts, the runtime should expose enough structured presentation input
for the host LLM to render:

- opening brief
- current progress stepper
- latest evidence/finding update
- halt brief when applicable
- final result summary

The host LLM may rephrase for the user, but it must not invent runtime facts or
hide halt/artifact truth.

When CLI output is hidden, the canonical user-facing MCP delivery path is
`onto.review_status` polling over a prepared or active session. Other paths are
allowed only as compatibility or later optimization layers.

Priority:

1. `onto.review_status` polling using the active session root or run identifier.
2. Native MCP progress notifications when the host supplies a
   `_meta.progressToken` on `onto.review`.
3. A split execution flow where preparation returns the opening brief and
   session identity before long worker dispatch continues.

A long blocking MCP tool call with no visible opening brief, progress update, or
status polling path is not conformant with this UX contract.

Native MCP progress notifications are a transport projection only. The runtime
sends `notifications/progress` during `onto.review` when the caller supplies
`_meta.progressToken`; each notification carries a versioned
`ontoReviewProgress` metadata payload. These notifications must remain
reconstructable from runtime progress lines and artifacts. They are not a new
artifact authority and do not replace `onto.review_status`.

Progress step ids, labels, and total step count are owned by the runtime review
progress contract and projected into `review-run-manifest.yaml`. MCP progress
updates and `onto.review_status` must read from that shared contract/manifest
rather than maintain separate step taxonomies.

### 6.7 Status Presentation Shapes

`onto.review_status` is the canonical MCP surface for hidden-CLI progress
presentation.

All host-facing status presentation inputs share this compatibility envelope:

```yaml
presentation_contract_version: "1"
presentation_kind: "opening_brief | progress | halt | final_result"
session_id: "{session_id}"
session_root: "{session_root}"
status: "prepared | running | halted_partial | completed | completed_with_degradation | failed | unknown"
generated_from_artifact_refs:
  execution_plan: "{path or null}"
  review_run_manifest: "{path or null}"
  execution_result: "{path or null}"
  review_record: "{path or null}"
```

Opening brief shape:

```yaml
llmPresentation:
  openingBrief:
    prompt: "Render a concise review opening brief from the bounded facts."
    input:
      presentation_contract_version: "1"
      presentation_kind: opening_brief
      session_id: "{session_id}"
      session_root: "{session_root}"
      status: prepared
      opening_brief:
        environment: {}
        method: {}
        model_profile: {}
        domain: {}
        target: {}
        review_direction: {}
        artifact_root: "{session_root}"
```

Progress shape:

```yaml
llmPresentation:
  progress:
    prompt: "Render a concise review progress update from the bounded facts."
    input:
      presentation_contract_version: "1"
      presentation_kind: progress
      session_id: "{session_id}"
      session_root: "{session_root}"
      status: "prepared | running | halted_partial | completed | completed_with_degradation | failed | unknown"
      generated_from_artifact_refs: {}
      progress:
        current_step: 2
        total_steps: 12
        current_label: "lens execution"
        completed_steps: ["interpretation", "binding"]
        active_units: ["logic", "structure"]
        pending_units: ["issue construction", "deliberation", "synthesize"]
        elapsed_seconds: 180
        next_expected_event: "next lens completion or unit timeout"
      liveness:
        generated_at: "2026-05-26T17:30:00+09:00"
        poll_after_seconds: 30
        state: running_waiting
        last_observed_artifact_key: review_run_manifest
        last_observed_artifact_ref: "{session_root}/review-run-manifest.yaml"
        last_observed_artifact_mtime: "2026-05-26T17:29:31+09:00"
        seconds_since_last_observed_artifact: 29
        summary: "Review is still active at lens execution; no new final signal is available yet."
      latest_update:
        interim_signal_status: lens_local
        summary: "logic reported 2 medium contract-risk findings"
        evidence_refs: ["round1/logic.md"]
      halt: null
```

Halt shape:

```yaml
llmPresentation:
  halt:
    prompt: "Render a concise halted-partial review update from the bounded facts."
    input:
      presentation_contract_version: "1"
      presentation_kind: halt
      session_id: "{session_id}"
      session_root: "{session_root}"
      status: halted_partial
      generated_from_artifact_refs: {}
      halt:
        phase: "controlled_lens_deliberation"
        unit_id: "deliberation-logic"
        unit_kind: "deliberation"
        lens_id: "logic"
        reason: "bounded reason from execution-result.yaml"
        produced_artifact_refs: {}
        absent_artifact_refs: {}
        action_candidates: ["retry_execution", "continue_review"]
```

Rules:

1. `llmPresentation.progress` is a presentation input, not a new artifact
   authority.
2. `llmPresentation.openingBrief`, `progress`, `halt`, and `finalResult` must use
   the shared versioned envelope when surfaced through MCP.
3. Values must be derived from `execution-plan.yaml`, `review-run-manifest.yaml`,
   `execution-result.yaml`, available artifact refs, and issue-stage artifacts.
4. Missing facts must be represented as `null`, empty arrays, or explicit
   `unknown` status, not invented.
5. Final result rendering remains owned by `llmPresentation.finalResult` and
   `final-output.md`.

---

## 7. Progress UX Stages

### 7.1 Setup / Target Confirmation

Purpose:

- show the declared review purpose and target
- show domain, lens set, execution route, and target profile
- expose any user-controlled choices before dispatch

Minimum presentation facts:

- request text
- resolved target scope and target profile summary
- session domain and domain profile status
- selected lens ids and review mode
- route visibility summary
- boundary policy and value-alignment status
- artifact root

Primary artifact refs:

- `interpretation.yaml`
- `binding.yaml`
- `execution-preparation/review-target-profile.yaml`
- `execution-preparation/review-value-alignment-criteria.yaml`

### 7.2 Pre-Dispatch Readiness

Purpose:

- show that runtime-owned gates are closed before worker execution
- fail loudly when setup cannot produce a trustworthy dispatch basis

Minimum presentation facts:

- manifest lifecycle state
- packet materialization status
- context eligibility status
- provider/actor preflight status
- any structured failure record

Primary artifact refs:

- `execution-plan.yaml`
- `execution-preparation/review-context-manifest.yaml`
- `execution-preparation/actor-invocation-profiles.yaml`
- `execution-preparation/actor-consumer-bindings.yaml`
- structured failure record when present

### 7.3 Lens Execution

Purpose:

- show progress without collapsing lens reasoning into the main context
- preserve independent lens status and degradation truth

Minimum presentation facts:

- participating, excluded, completed, failed, and degraded lens ids
- observed dispatch width
- per-lens output refs when available
- timeout or malformed-output identity when a unit fails

Primary artifact refs:

- `round1/{lens_id}.md`
- `lens-completion-barrier.yaml`
- `execution-result.yaml`
- `review-run-manifest.yaml`

### 7.4 Issue Construction

Purpose:

- turn surface findings into traceable root-cause issue clusters
- separate evidence-backed issues from observations and evidence gaps

Minimum presentation facts:

- finding count by severity
- root-cause issue count by severity
- material issue count derived from severity
- evidence gaps
- relation/root hypothesis summary

Primary artifact refs:

- `finding-ledger.yaml`
- `finding-relation-graph.yaml`
- `issue-ledger.yaml`
- `issue-stance-matrix.yaml`
- `problem-framing.yaml`

### 7.5 Controlled Deliberation

Purpose:

- show contested issue resolution state before synthesize
- preserve unresolved or narrowed stance truth without silent smoothing

Minimum presentation facts:

- deliberation status
- issues requiring deliberation
- per-issue status: `no-deliberation-needed`, `resolved`, `narrowed`, or
  `unresolved-with-reason`
- remaining disagreement lens ids when applicable
- halt phase/unit/lens if deliberation fails

Primary artifact refs:

- `deliberation-plan.yaml`
- `deliberation/round1/{lens_id}.md`
- `deliberation.md`
- `execution-result.yaml`
- `review-run-manifest.yaml`

### 7.6 Synthesize / Final Result

Purpose:

- provide a decision-ready summary over the completed artifact truth
- order material issues before non-material findings

Minimum presentation facts:

- declared purpose and scope
- highest severity
- severity counts
- material issues: `blocker`, then `high`, then `medium`
- non-material findings: `low`, then `info`
- action candidates
- evidence and limits
- artifact refs

Primary artifact refs:

- `synthesis.md`
- `final-output.md`
- `review-record.yaml`

### 7.7 Halted Partial Result

Purpose:

- preserve work completed before the halt
- show why the result is partial
- show which next actions are available without inventing a completed review

Minimum presentation facts:

- `execution_status: halted_partial`
- halt phase
- halt unit id/kind
- halt lens id when applicable
- halt reason
- produced artifact refs
- absent artifact refs as `null` or omitted by contract
- available action candidates, usually `retry_execution`, `needs_evidence`, or
  `continue_review`

Primary artifact refs:

- `execution-result.yaml`
- `review-run-manifest.yaml`
- `review-record.yaml` when assembled
- `final-output.md` when rendered

---

## 8. Final Output Layout

Human-readable final output should use this order:

1. **Review Basis**: declared purpose, target, domain, boundary, route summary.
2. **Classification Summary**: highest severity and severity counts.
3. **Material Issues**: `blocker`, `high`, `medium` findings or issues.
4. **Non-Material Findings**: `low`, `info`, and evidence observations.
5. **Action Candidates**: next options grouped by finding/issue.
6. **Evidence and Limits**: what was reviewed, what was not verified, and why.
7. **Artifact Refs**: primary refs needed for audit or follow-up.

If the run halted before synthesize, the output must lead with halt identity and
available artifact truth before presenting partial findings.

---

## 9. Domain Adaptation

Severity stays common, but domain profiles may define domain-specific thresholds
that explain the severity.

Examples:

| Domain | Domain threshold examples |
|---|---|
| Ontology review | canonical concept conflict, authority seat ambiguity, runtime/artifact contract mismatch |
| Accounting sheet review | reconciliation failure, formula error, missing transaction, threshold-exceeding variance, control failure |
| Code review | user-visible contract breach, data loss risk, security risk, unsupported environment failure |
| Document review | reader may execute the wrong policy, responsibility boundary is ambiguous, required procedure is missing |

Domain thresholds belong in domain contracts or domain problem-framing profiles.
They explain severity; they do not create a second severity axis.

---

## 10. MCP / CLI / Artifact Alignment

MCP, CLI, and final-output rendering must align on the same facts:

| Fact | Authority |
|---|---|
| runtime status | `execution-result.yaml` |
| progress and step identity | `review-run-manifest.yaml` |
| target/profile/boundary | execution-preparation artifacts |
| issue/finding truth | issue-stage artifacts |
| deliberation truth | `deliberation.md` and deliberation artifacts |
| primary aggregate | `review-record.yaml` |
| human explanation | `final-output.md` and host-rendered `llmPresentation` |

For hidden-CLI runs, `onto.review_status` is the default progress presentation
read surface. It should return or enable construction of
`llmPresentation.progress` from the same artifact-backed facts.

Host-facing `llmPresentation` may choose wording for opening, progress, halt,
and final messages, but it must preserve:

- opening brief environment/method/model/domain/target/direction facts
- progress step, pending units, elapsed wait, and next expected event
- interim signal status for non-final finding-like updates
- highest severity
- material issue grouping
- halt identity
- generated vs absent artifact truth
- evidence limits
- action candidates

When CLI output is hidden from the user, MCP callers should prefer
host-rendered presentation over silent waiting. If a host can expose live CLI
output directly, it may do so, but the displayed lines must still be derived
from the same runtime facts.

---

## 11. Implementation Target

Recommended implementation order:

1. Add opening brief and progress presentation inputs derived from existing
   preparation artifacts, `review-run-manifest.yaml`, and `execution-result.yaml`.
2. Render a text/Markdown stepper in CLI-visible environments without adding a
   separate HTML UI.
3. Add `llmPresentation.progress` or equivalent progress presentation input to
   `onto.review_status`.
4. Label in-progress finding-like updates as `lens_local`, `issue_candidate`,
   `deliberation_pending`, `deliberated`, or `finalized`.
5. Update prompt contracts to require severity, affected purpose, failure
   condition, evidence refs, and action-candidate derivation inputs in finding
   output; derive `action_candidates` later from problem-framing/runtime state.
6. Extend issue-stage artifacts to normalize severity counts and highest
   severity.
7. Extend `ReviewRecord` with result-classification summary refs or fields only
   after issue-stage artifacts are stable.
8. Update `render-review-final-output` to follow the final output layout.
9. Update MCP `llmPresentation` input so hosts can render opening, progress,
   halt, and final result messages from the same bounded facts.
10. Add deterministic fixtures for blocker/high/medium/low/info classification.
11. Add domain-specific fixtures, starting with ontology/software-engineering and
   spreadsheet/accounting-style thresholds when those domains are active.

Current runtime coverage:

- MCP/core API exposes `llmPresentation.openingBrief`, `progress`, `halt`, and
  `finalResult` prompt/input pairs.
- Issue artifact prompts and validators require the active severity contract and
  the fields needed to distinguish material issues from non-material findings.
- `result_classification_summary` is written into `review-record.yaml`, exposed
  by MCP/core API as `resultClassificationSummary`, and rendered in
  `final-output.md`.
- Progress presentation includes newly gathered issue-stage classification
  signals when finding/issue artifacts exist.
- Progress presentation includes a polling liveness state with generated time,
  recommended polling interval, last observed artifact, seconds since last
  observed artifact, and a process-only waiting/stale summary when no new
  review signal is available.
- MCP `onto.review` emits native `notifications/progress` when the caller
  supplies `_meta.progressToken`; the notification payload carries versioned
  `ontoReviewProgress` metadata and is covered by MCP conformance.
- Degraded or halted execution writes `degradation-summary.yaml` as the
  structured source for halt/degradation presentation.
- Deterministic classification fixtures cover ontology, software-engineering,
  and spreadsheet/accounting-style `domain_threshold_used` values as severity
  explanations, not as a second materiality axis.

---

## 12. Acceptance Criteria

This UX contract is implemented when:

1. every long-running review emits an opening brief before dispatch,
2. the opening brief states environment, method, model/profile, domain, target,
   and review direction with non-secret model/profile facts or explicit
   unresolved reasons,
3. CLI-hidden review execution has an MCP-visible progress delivery path through
   `onto.review_status` polling by default,
4. progress is visible as a stepwise view or progress bar derived from runtime
   state,
5. progress updates include newly gathered review information, not only process
   metadata,
6. long-running steps emit bounded liveness updates when no new review signal is
   available,
7. intermediate finding-like updates are labeled with interim signal status,
8. every completed review exposes highest severity and severity counts,
9. material issues are derived from severity and rendered before non-material
   findings,
10. every material issue has affected purpose, failure condition, impact, and
   evidence refs,
11. halted partial reviews expose halt identity and produced/absent artifact
   truth before any partial findings,
12. CLI, MCP, `llmPresentation.progress`, `final-output.md`, and
   `review-record.yaml` do not contradict each
   other,
13. domain-specific thresholds explain severity without creating a second
   materiality axis,
14. tests cover at least one `blocker`, `high`, `medium`, `low`, `info`, and
   halted-partial presentation path.
