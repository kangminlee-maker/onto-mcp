# Review Pre-Dispatch Contracts

> Status: Active
> Purpose: Close the five contracts that must be fixed before review dispatch can be treated as canonical runtime truth.
> Scope: `review` only.
> Related:
> - `.onto/processes/review/productized-live-path.md`
> - `.onto/processes/review/execution-preparation-artifacts.md`
> - `.onto/processes/review/review-context-manifest-contract.md`
> - `.onto/processes/review/prompt-execution-runner-contract.md`
> - `.onto/processes/review/record-contract.md`

---

## 1. Position

These contracts are runtime contracts, not prompt guidance.

They close five decisions before implementation work may add more behavior:

1. pre-manifest failure versus post-manifest lifecycle boundary
2. review value-alignment dispatch gate
3. manifest input versus generated packet phase boundary
4. parallel lens completion barrier
5. retired entry policy

The runtime may change TypeScript names, helper boundaries, fixture shapes, and
MCP field spelling while implementing these contracts. It may not change the
state transitions, gate decisions, artifact authority, or failure semantics
without updating this document first.

---

## 2. Artifact Authority

Canonical seats:

```text
{session_root}/
  interpretation.yaml
  binding.yaml
  execution-plan.yaml
  execution-result.yaml
  error-log.md
  lens-completion-barrier.yaml
  failures/*.yaml
  execution-preparation/
    actor-invocation-profiles.yaml
    actor-consumer-bindings.yaml
    domain-binding.yaml
    review-target-profile.yaml
    review-value-alignment-criteria.yaml
    review-context-manifest.yaml
    target-snapshot.md
    target-snapshot-manifest.yaml
    materialized-input.md
    context-candidate-assembly.yaml
```

Ownership:

| Artifact | Owner | Authority |
|---|---|---|
| `interpretation.yaml` | LLM interpretation stage | request meaning and ambiguity notes |
| `binding.yaml` | runtime | selected domain, lens set, seats, boundaries |
| `actor-invocation-profiles.yaml` | runtime | resolved actor LLM invocation profiles |
| `actor-consumer-bindings.yaml` | runtime | actor profile to context consumer binding |
| `domain-binding.yaml` | runtime | selected domain docs, required status, hashes |
| `review-target-profile.yaml` | runtime | artifact role, target input kind, target material kind, closure level, target refs, and hashes |
| `review-value-alignment-criteria.yaml` | runtime with user authority | purpose/value dispatch gate |
| `review-context-manifest.yaml` | runtime | context source eligibility and packet provenance |
| `lens-completion-barrier.yaml` | runtime | lens completion gate for downstream stages |
| `execution-result.yaml` | runtime | execution result truth after dispatch begins |
| `failures/*.yaml` | runtime | structured failure truth before execution result exists |

---

## 3. Contract 1: Pre-Manifest Failure And Post-Manifest Lifecycle

### 3.1 Phases

| Phase | Required entry artifacts | Allowed exit |
|---|---|---|
| `invocation_bound` | `interpretation.yaml`, `binding.yaml`, `execution-plan.yaml` | continue to pre-manifest checks |
| `pre_manifest` | actor profiles, consumer bindings, domain binding, value criteria | create manifest or write failure record |
| `manifest_validated` | `review-context-manifest.yaml` with `lifecycle_state=validated` | generate packets |
| `packets_materialized` | packet files and packet hashes | set manifest `lifecycle_state=dispatched` |
| `lens_execution` | dispatched packet refs | write lens outputs and barrier |
| `post_manifest` | barrier output | issue artifacts, deliberation, synthesize, final output, review record |

### 3.2 Failure Seats

Pre-manifest failures write one structured record under:

```text
{session_root}/failures/{failure_id}.yaml
```

Pre-manifest failure records do not require a valid context manifest and do not
require `execution-result.yaml`.

Post-manifest failures use:

- `execution-result.yaml`
- `lens-completion-barrier.yaml`
- `error-log.md`
- a structured failure record only when the phase-specific failure is outside
  the execution-result contract or must be returned through MCP before a result
  artifact exists.

### 3.3 Failure Envelope

Every structured failure record uses:

```yaml
schema_version: "1"
failure_id: "..."
created_at: "..."
phase: "..."
reason_code: "..."
human_message: "..."
required_user_action: "..."
retry_safety: "safe_after_input_change | safe_after_environment_change | unsafe_without_operator_review"
artifact_trust: "no_artifacts_trusted | pre_manifest_artifacts_trusted | manifest_artifacts_trusted | execution_artifacts_partial | execution_artifacts_trusted"
dispatch_state: "not_dispatched | dispatch_blocked | partially_dispatched | dispatched"
artifact_refs: {}
mcp_error_code: "..."
details_kind: "settings_validation | retired_config | domain_binding | value_alignment_gate | actor_route | manifest_lifecycle | context_eligibility | provider_api | malformed_output | schema_validation | artifact_write | security_disclosure"
details: {}
```

---

## 4. Contract 2: Review Value-Alignment Dispatch Gate

`review-value-alignment-criteria.yaml` is the authority for purpose, values,
non-goals, and judgment criteria used by `axiology` and final synthesis.

### 4.1 Criterion Fields

Each criterion has:

- `criterion_id`
- `statement`
- `source_kind`
- `source_ref`
- `authority_rank`
- `inference_owner`
- `confidence`
- `confidence_basis`
- `confirmation_status`
- `ambiguity_status`
- `conflict_status`
- `lifecycle_state`
- `lineage_ref`
- `dispatch_decision`

### 4.2 Criterion-Level Decision Table

| State | Required condition | `dispatch_decision` |
|---|---|---|
| ready | `lifecycle_state=confirmed`, `confirmation_status=confirmed`, `ambiguity_status=clear`, `conflict_status=none`, `confidence >= 0.8` | `allow_dispatch` |
| user confirmation needed | `confirmation_status=pending_confirmation` or `0.5 <= confidence < 0.8` | `block_for_confirmation` |
| authority conflict | `conflict_status=contested` or `lifecycle_state=contested` | `block_for_revision` |
| insufficient basis | `lifecycle_state=insufficient` or `confidence < 0.5` | `block_for_more_context` |
| blocked | `lifecycle_state=blocked` | `halt` |
| invalidated | `lifecycle_state=invalidated` | `regenerate_or_cancel` |

### 4.3 Session-Level Gate

The session gate is derived from all criterion decisions:

| Criterion decisions | Session dispatch state |
|---|---|
| all criteria are `allow_dispatch` | `allow_dispatch` |
| any `block_for_confirmation` | `blocked` with `value_alignment_gate` failure |
| any `block_for_revision` | `blocked` with `value_alignment_gate` failure |
| any `block_for_more_context` | `blocked` with `value_alignment_gate` failure |
| any `halt` | `blocked` with `value_alignment_gate` failure |
| any `regenerate_or_cancel` | `blocked` with `value_alignment_gate` failure |

### 4.4 Initial Runtime Rule

The explicit user request may be written as a confirmed criterion with
`confidence=1`.

Criteria inferred from conversation memory, project principles, domain docs, or
prior sessions require confidence scoring. If they could materially change the
review conclusion and are not confirmed, the runtime stops before manifest
creation.

`axiology` receives the value criteria as primary grounding. `synthesize`
receives axiology output and value-criteria provenance; it does not create new
criteria.

---

## 5. Contract 3: Manifest Input And Packet Phase Boundary

### 5.1 Manifest Creation

`review-context-manifest.yaml` is created only after these artifacts validate:

- `actor-invocation-profiles.yaml`
- `actor-consumer-bindings.yaml`
- `domain-binding.yaml`
- `review-value-alignment-criteria.yaml`
- target snapshot, materialized input, and review target profile

At creation, lifecycle is:

```yaml
lifecycle_state: validated
packet_refs: []
```

The manifest authority for context eligibility is:

```yaml
context_sources[].allowed_consumers
```

`derived_context_access_matrix` is a derived view and must match the canonical
relation exactly.

### 5.2 Packet Materialization

Prompt packets are generated from the validated manifest and fixed artifacts.
Preparation-time lens and base synthesize packets are registered before lens
dispatch. Runtime-generated packets are registered immediately after materialize
and before their unit dispatch:

- issue artifact packets
- per-lens deliberation packets
- teamlead controlled-deliberation packet
- synthesize runtime packet

For each packet, the runtime records:

- `consumer_id`
- `packet_ref`
- `packet_sha256`
- `consumed_context_refs`
- `forbidden_context_refs`

After preparation-time packet refs and hashes are written, lifecycle becomes:

```yaml
lifecycle_state: dispatched
```

Runtime-generated packet registration preserves `lifecycle_state: dispatched`
and appends/upserts the generated packet ref before invoking the unit.

### 5.3 Freshness And Continuation

Current MCP review/status/result can read halted session artifacts. The planned
explicit continuation surface is `onto_review_continue`; its design lives in
`docs/architecture/review-continuation-surface.md`.

The public concept is review continuation, not subagent management. A
continuation may re-dispatch failed or missing review execution units while
reusing completed units from the same session.

Continuation planning should use the shared `PipelineExecutionLedger`
projection defined in
`.onto/processes/shared/pipeline-execution-ledger-contract.md`. For
`review`, the projection derives from the execution plan, run manifest,
execution result, lens barrier, semantic ledgers, and output seats. The ledger's
primary purpose is to verify artifact trust boundaries: which outputs were
produced by completed units, which outputs are untrusted because the producing
unit failed or upstream work is incomplete, and where execution should continue.
`finding-ledger.yaml` and `issue-ledger.yaml` remain semantic ledgers; they are
continuation inputs after they exist, not the full pipeline execution ledger.

`review-run-manifest.yaml` records a `resume_token` for audit and idempotency
only. The token is not a dispatch capability and must not be accepted as
authorization to restart, skip, continue, or reuse worker stages.

Any continued or reused session must validate:

- manifest schema version
- source hash for every required `context_source`
- packet hash for every packet ref
- consumer id admission
- consumed context eligibility
- generated packet refs before invoking issue-artifact, deliberation, or
  synthesize runtime units
- route consistency against the existing execution plan and actor invocation
  profiles

Any mismatch stops before continuation dispatch and writes a
`manifest_lifecycle`, `context_eligibility`, or route-specific failure record.

Continuation must not change inputs, settings, target scope, provider route,
domain, review mode, selected lens set, or manifest-governed artifacts. If any
of those must change, the caller must start a new review session.

Until `onto_review_continue` is implemented, MCP callers must still start a new
review session when they need execution to proceed. Runtime status/result tools
may read existing session artifacts, but they do not resume execution.

### 5.4 Synthesize Context

By default, `synthesize` consumes:

- lens outputs
- issue artifacts
- controlled deliberation result
- problem framing
- value-criteria provenance

Raw domain documents are not first-source synthesize input unless the manifest
explicitly admits `synthesize` for those context sources.

---

## 6. Contract 4: Parallel Lens Completion Barrier

### 6.1 Dispatch Width

`observed_dispatch_width` is runtime-derived:

```text
observed_dispatch_width = selected_lens_ids.length
```

It is not user-configurable.

### 6.2 Barrier Inputs

The barrier reads:

- planned lens ids from `execution-plan.yaml`
- `minimum_participating_lenses`, which must equal `planned_lens_ids.length`
- per-lens execution outcomes
- output file existence
- output file non-empty check
- failure messages, including executor timeout or provider failure

### 6.3 Barrier Status

| Condition | `status` | `downstream_allowed` |
|---|---|---|
| all planned lenses complete and planned count is at least 1 | `passed` | `true` |
| one or more planned lenses fail, time out, produce no file, or produce an empty file | `failed` | `false` |
| planned lens count is less than 1 | `failed` | `false` |

`passed_with_degradation` is a diagnostic status for non-canonical inspection
or historical artifacts. The canonical review path does not use it to proceed
into issue artifacts, deliberation, or synthesize.

Single-lens review is a valid explicit lens selection. It still passes through
issue artifact creation, bounded deliberation artifact creation, synthesize,
and ReviewRecord assembly. Cross-lens disagreement fields are empty unless
another lens participates.

### 6.4 Timeout Semantics

A lens timeout is a lens failure.

Timeout must be recorded as:

- per-unit `status=failed`
- `failure_message` containing timeout reason
- `failed_lens_ids` entry in `lens-completion-barrier.yaml`
- `execution_status=halted_partial` in `execution-result.yaml`

The runtime does not synthesize a final review from a partial lens set.

Controlled deliberation timeout follows the same fail-loud closure shape:

- synthesize is not executed
- `execution_status=halted_partial`
- `deliberation_status=not_performed`
- `halt_phase=controlled_lens_deliberation`
- `halt_unit_id`, `halt_unit_kind`, and lens-bound `halt_lens_id` identify the
  failed deliberation unit
- `deliberation_execution_results` preserve completed and failed deliberation
  unit results, including timeout `failure_message`
- `ReviewRecord` preserves refs for issue-stage artifacts already produced in
  the same run and uses `null` for output artifacts that were not produced

---

## 7. Contract 5: Retired Entry Policy

Runtime authority enters through:

- `.onto/settings.json`
- MCP tool arguments
- session-local runtime artifacts
- session artifacts written by the runtime

Retired entry points and retired user inputs do not become runtime authority.

### 7.1 Retired User Inputs

The runtime rejects:

- `.onto/config.yml`
- `.onto/config.yaml`
- `--max-concurrent-lenses`
- `--host-runtime` from retired argv entrypoints
- `--execution-realization` from retired argv entrypoints
- `--execution-mode` from retired argv entrypoints
- host-specific shortcuts that bypass resolved execution profile authority

### 7.2 Runtime-Derived Coordination

The runtime still records coordination facts:

- `observed_dispatch_width`
- selected lens ids
- participating lens ids
- failed lens ids
- packet refs and hashes

These fields are derived from session artifacts. They are not read from retired
user input.

### 7.3 Failure Behavior

Retired input failure uses:

```yaml
details_kind: retired_config
dispatch_state: not_dispatched
artifact_trust: no_artifacts_trusted
```

When a session root already exists and the retired input is detected after
session allocation, the failure record is written under that session. Otherwise
the CLI/MCP error returns the same envelope shape without a session artifact.

---

## 8. Acceptance Criteria

The five contracts are closed when:

- invalid pre-manifest state writes a structured failure record without
  requiring a context manifest
- value criteria produce one deterministic session dispatch state
- packet refs and hashes are recorded only after manifest validation
- a missing, failed, timed-out, or empty lens output blocks downstream stages
- retired user inputs are rejected before they influence binding, manifest, or
  dispatch
- MCP, CLI, and ReviewRecord surfaces cite the same artifact refs
