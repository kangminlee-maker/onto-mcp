# Pipeline Execution Ledger Contract

> Status: shared design contract.
> Purpose: define the artifact trust and provenance ledger that every onto
> pipeline must expose or derive across `review`, `reconstruct`, and future
> `evolve`.

## 1. Position

`PipelineExecutionLedger` is a shared runtime concept. It records how a
pipeline produced its artifacts at the unit level so a caller can determine:

- which artifacts are trustworthy;
- which artifacts are untrusted because their producing unit failed;
- which artifacts are blocked because upstream units did not complete;
- which unit is the first incomplete or failed boundary;
- where a later continuation or repair action may safely begin.

Continuation is one consumer of the ledger. The primary purpose is execution
audit, trust boundary inspection, and artifact provenance.

This contract applies to:

- `review`;
- `reconstruct`;
- future `evolve`;
- any later onto pipeline that materializes staged artifacts.

## 2. Ownership

Runtime owns the ledger projection because it observes unit dispatch, validation,
file writes, hashes, and terminal status.

Host LLMs may read the ledger to explain trust boundaries or propose the next
action, but they do not author ledger truth.

Semantic ledgers remain separate:

- `review` semantic ledgers include `finding-ledger.yaml` and
  `issue-ledger.yaml`.
- `reconstruct` semantic or decision artifacts include Seed, confirmation,
  question, failure, revision, and stop-decision artifacts.
- future `evolve` may define design-specification or decision ledgers.

Semantic ledgers explain meaning. The pipeline execution ledger explains whether
the process that produced each artifact can be trusted.

## 3. Minimum Model

Shared ledger shape:

```ts
interface PipelineExecutionLedger {
  schemaVersion: "1";
  pipeline: "review" | "reconstruct" | "evolve" | string;
  sessionId: string;
  sourceRefs: string[];
  units: PipelineExecutionLedgerUnitEntry[];
}

interface PipelineExecutionLedgerUnitEntry {
  unitId: string;
  unitKind: string;
  owner: "runtime" | "host_llm" | "user_or_host_mediated";
  producedArtifactRefs: string[];
  consumedArtifactRefs: string[];
  packetRef?: string | null;
  packetSha256?: string | null;
  outputRefs: string[];
  outputHashes: Record<string, string | null>;
  status:
    | "planned"
    | "completed"
    | "failed"
    | "missing"
    | "skipped"
    | "not_reached";
  trustStatus: "trusted" | "untrusted" | "blocked_by_upstream";
  trustReason: string;
  attemptCount: number;
  lastFailureMessage: string | null;
  upstreamUnitIds: string[];
  downstreamUnitIds: string[];
  resolution?: "demoted";
  executionTelemetry?: PipelineUnitExecutionTelemetry | null;
}

interface PipelineUnitExecutionTelemetry {
  unit_id: string;
  llm_call_count: number;
  duration_ms: number;
  prompt_chars: number;
  output_chars: number;
  provider_tokens_in: number | null;
  provider_tokens_out: number | null;
  provider_route: string | null;
  model_id: string | null;
  effort: string | null;
  prompt_policy_sha256: string | null;
  source_identity_refs: string[];
  attempt_count: number;
  attempts: Array<{
    attempt: number;
    // open sets: known members + (string & {}) — see "additively-extensible" rule below
    kind: "initial" | "parse_repair" | "semantic_repair" | "timeout_recovery" | "validation_gate" | (string & {});
    status: "succeeded" | "failed";
    failure_class:
      | "malformed_json"
      | "parse_repair_failure"
      | "schema_validation_failure"
      | "timeout"
      | "provider_error"
      | (string & {})
      | null;
    failure_message: string | null;
    duration_ms: number;
  }>;
  batch_count: number | null;
}
```

Execution telemetry rules:

- Telemetry is runtime-owned. It is recorded at the LLM call boundary by the
  producing pipeline; LLMs have no authority over any telemetry value.
- `prompt_chars`/`output_chars` are the canonical size measure for speed and
  size comparisons: runtime computes them directly, so they are always
  available and comparable across providers and mock realizations. Provider
  token usage (`provider_tokens_in/out`) is a supplemental fact recorded only
  when the provider reports it; comparisons are valid only between runs using
  the same measure and the same provider route.
- One attempt row is recorded per actual LLM call (`initial`, `parse_repair`,
  `semantic_repair`, `timeout_recovery`); these increment `llm_call_count` and
  the size counters. In addition, a `validation_gate` attempt row is recorded
  when a deterministic validation gate rejects an authored artifact before a
  feedback retry: it carries `status: "failed"` and
  `failure_class: "schema_validation_failure"`, increments `attempt_count` so
  the validation miss stays visible in the recovered unit's lineage, but does
  not count as an LLM call (no `llm_call_count`/size contribution). `failure_class`
  separates output-shape failures (`malformed_json`, `parse_repair_failure`),
  validation-gate misses (`schema_validation_failure`), and transport failures
  (`timeout`, `provider_error`).
- `kind` and `failure_class` are **additively-extensible, forward-compatible
  sets**: handling of LLM input/output is a cross-pipeline concern and LLM
  response/failure characteristics are not under our control, so the shared
  ledger evolves to represent them (new kinds/classes are added as new
  failure-handling or recovery shapes are introduced). Such additions are
  backward-compatible and do **not** bump `schemaVersion`; consumers MUST treat
  the sets as open and tolerate an unknown `kind`/`failure_class` (record or
  pass it through) rather than reject the artifact. `validation_gate` /
  `schema_validation_failure` were added under this policy.
- `prompt_policy_sha256` is a source-layer identity fact: the hash of the
  unit's first initial system prompt, so before/after comparisons can
  attribute metric deltas to prompt-policy changes. Run-level source-layer
  identities (registry/contract/profile/validator snapshots) remain owned by
  the run manifest's governing snapshot.
- `source_identity_refs` is the extensible runtime-owned identity list for
  metric attribution. Each ref is a `<kind>:<value>` string. Current kinds:
  `prompt_policy_sha256:<hash>` and `authored_artifact:<name>` (one per
  distinct authored-artifact variant the unit executed; initial, repair, and
  recovery artifact names identify the payload-contract seat). Comparators
  must treat a metric delta as attributable only when the dependent identity
  refs are present on both sides.
- Telemetry unit ownership is fail-loud: an authored artifact without a unit
  mapping is a contract error at call time, not a silent telemetry omission.
- Ledger-level `lastFailureMessage` means terminal unit failure only: it is
  set from telemetry when the unit's final recorded attempt failed. Recovered
  intermediate failures (for example a repaired malformed output) stay
  visible in `attempts` and must not surface as `lastFailureMessage`.
- `batch_count` records deterministic prompt batching (for example
  competency-question assessment) so batching changes stay attributable.
- Units that made no LLM call carry no telemetry field; absence is not a
  failure signal.
- `resolution: "demoted"` marks terminal resolution outside the trusted-output
  path (bounded resubmit exhausted, complete-with-failure): the downstream
  stage product consumed and disclosed the gap (review: issue-stance-matrix
  `validation.missing_stances`), so the unit owes no further dispatch — it
  must not reappear on the frontier, block convergence, or block downstream
  upstream-trust. `status`/`lastFailureMessage` keep the audit truth
  (typically `failed`); a resolved unit contributes no preserved artifacts.
  Frontier/convergence consumers use `isResolvedLedgerUnit`
  (trusted-or-resolved); artifact-preservation consumers keep
  `isTrustedLedgerUnit`.
- Current population status: `reconstruct` populates telemetry from its run
  manifest steps. `review` does not populate it yet.

Rules:

- `trusted` requires the producing unit to complete and all required output
  artifacts to exist and validate.
- `untrusted` means the unit ran but failed, produced invalid output, or wrote
  artifacts that failed validation.
- `blocked_by_upstream` means this unit's trust cannot be established because an
  upstream required unit is missing, failed, or untrusted.
- `skipped` must include a reason and must not be confused with trusted output.
- A missing optional unit may be `skipped`; a missing required unit is
  `missing` or `blocked_by_upstream`.
- The ledger is derived from existing run artifacts unless a pipeline contract
  explicitly promotes it to a durable artifact.

## 4. Source Inputs

Each pipeline maps its own runtime artifacts into the shared ledger.

| Pipeline | Required derivation sources |
|---|---|
| `review` | `execution-plan.yaml`, `review-run-manifest.yaml`, `execution-preparation/review-context-manifest.yaml`, `execution-result.yaml`, `lens-completion-barrier.yaml`, semantic ledgers when present, and output seats |
| `reconstruct` | `reconstruct-run-manifest.yaml`, `reconstruct-record.yaml`, stage registry, validation artifacts, metrics, stop decision, final output, and output seats |
| `evolve` | future evolve run manifest, target profile, adapter selection, observation/projection artifacts, design specification validation, final disposition, and output seats |

The pipeline-specific source artifacts remain authority. The ledger is a
normalized projection over them.

## 5. Pipeline Mapping

### Review

`review` units include:

- lens units;
- issue artifact units;
- per-lens deliberation units;
- controlled deliberation;
- synthesize;
- record/final-output assembly where runtime treats them as separate stages.

`finding-ledger.yaml` and `issue-ledger.yaml` remain semantic ledgers. They are
inputs for downstream trust once they exist, not replacements for the execution
ledger.

### Reconstruct

`reconstruct` units are runtime projections of the active reconstruct registry
and the TypeScript stage contract. The registry owns artifact, gate, predicate,
readiness, and validator authority; the TypeScript stage id list and ledger
specs are implementation projections that must stay aligned with those registry
authorities and must not introduce independent semantic authority. The current
unit families are:

- material profile and material-profile validation;
- source inventory, source observation, source-observation directive, and
  directive validation;
- per-round source frontier, frontier validation, observation delta, delta
  validation, perspective judgments, exploration synthesis, and observation
  re-entry validation;
- candidate inventory, candidate disposition, and candidate-disposition
  validation;
- `ontology-seed.yaml` and `ontology-seed-validation.yaml`;
- competency questions, competency-question validation, assessment, and
  assessment validation;
- seed confirmation and seed-confirmation validation;
- query proofs, visualization proofs, graph-exploration proofs, and their
  runtime validations when the corresponding downstream capability is claimed;
- failure classification, revision proposal, reconstruct metrics, and their
  validations where applicable;
- reconstruct run manifest and run-manifest validation;
- handoff decision and handoff-decision validation before final output and
  reconstruct-record projection.

Runtime validation units are the trust gates for LLM-authored artifacts. A
semantic artifact can exist but remain untrusted until its validation unit
completes.

### Evolve

Future `evolve` units must begin with:

- target profiling;
- adapter selection;
- material-specific observation or projection;
- design inquiry/specification stages;
- validation and final disposition stages.

No future evolve adapter may bypass the ledger by writing design artifacts
without a producing unit and trust status.

## 6. Status And Result Surfaces

Status tools should expose the ledger, or a bounded projection of it, whenever a
pipeline is prepared, running, halted, or completed.

Result tools should expose enough ledger refs or summary fields for callers to
audit why final artifacts are trusted.

Continuation tools, where implemented, must derive their frontier from the
ledger's trust and completion boundary rather than from ad hoc file existence.

## 7. Durable Artifact Policy

First implementation may keep the ledger as a derived status projection.

Promote a durable root artifact such as `pipeline-execution-ledger.yaml`
only when at least one of these is true:

- external audit needs a stable standalone ledger file;
- continuation attempts need replayable pre/post trust snapshots;
- result artifacts need to cite a ledger ref as part of their trust contract.

If promoted, the durable artifact must still be derived from the pipeline's run
manifest, record, validation artifacts, and output seats. It must not become a
second execution truth.
