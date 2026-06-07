---
as_of: 2026-06-05
status: active
purpose: review artifact pipeline efficiency work from finding-ledger through synthesize
owner: review runtime tuning
current_work_order: development-records/plans/20260607-review-pipeline-remaining-work-order.md
source_visualization: development-records/visualizations/current-review-pipeline.svg
source_benchmark: development-records/benchmark/20260605-review-e2e-speed-stability-comparison.md
current_reference_session: /var/folders/3h/5ml_qx851hsgcn3h6j6y2l5r0000gn/T/onto-real-e2e-vhEKDs/.onto/review/20260605-f44ff3b7
lens_shape_reference_sessions:
  - .onto/review/20260605-f127267d
  - .onto/review/20260522-19c419a7
---

# Review Artifact Pipeline Efficiency Work

## Goal

Reduce latency and instability in the review artifact pipeline without reducing
semantic quality, material issue recall, boundary uncertainty preservation, or
artifact truth.

The work starts at `finding-ledger` and ends at `synthesize`. The lens round is
not the first target because the real full E2E already shows that lens execution
is parallel and comparatively fast.

## Optimization Principles

1. Reduce input to the minimum needed by each unit.
2. Reduce output to the smallest contract-complete artifact.
3. Keep semantic decisions in LLM-owned units only where semantic judgment is
   required.
4. Move deterministic extraction, validation, projection, and merging to
   runtime where possible.
5. Preserve downstream artifact contracts before changing execution topology.
6. Benchmark runtime, LLM latency, output bytes, and semantic quality after
   every material tuning step.

## In-Scope Stages

| Order | Stage | Current owner | Current topology | Primary output |
|---:|---|---|---|---|
| 1 | `finding-ledger` | LLM issue-artifact builder | serial | `finding-ledger.yaml` |
| 2 | `finding-relation-graph` | LLM issue-artifact builder | serial | `finding-relation-graph.yaml` |
| 3 | `issue-ledger` | LLM issue-artifact builder | serial | `issue-ledger.yaml` |
| 4 | `issue-stance-matrix` | LLM issue-artifact builder | serial | `issue-stance-matrix.yaml` |
| 5 | `deliberation-plan` | LLM issue-artifact builder | serial | `deliberation-plan.yaml` |
| 6 | controlled deliberation | LLM issue-scoped lens workers + controlled resolver + runtime projection | parallel planned issue responses, then serial resolution validation | `deliberation/responses/{issue_id}/{lens_id}.yaml`, `deliberation-resolution.yaml`, `deliberation.md` |
| 7 | `problem-framing` | LLM issue-artifact builder | serial | `problem-framing.yaml` |
| 8 | `synthesize` | LLM synthesize worker | serial | `synthesis.md` |

## Review Frame Per Stage

For each stage, record:

| Field | Meaning |
|---|---|
| Input | Exact runtime-provided files, prompt packet sections, and prior artifacts |
| Output | Required artifact shape and downstream consumers |
| Work performed | Semantic or deterministic operation actually required |
| Current cost signal | Wall time, packet bytes, output bytes from reference E2E |
| Likely cost driver | Input size, output size, reasoning complexity, or serial dependency |
| Optimization hypothesis | Candidate change that may reduce latency/instability |
| Quality guard | What must not regress |
| Verification | Targeted tests or E2E evidence required before accepting change |

## Stage 1: `finding-ledger`

### Current Runtime Seat

`finding-ledger` is the first issue-artifact unit after all Round 1 lens
outputs have passed the lens completion barrier.

- Registry: `src/core-runtime/review/issue-artifact-runtime.ts`
- Prompt packet: `prompt-packets/finding-ledger.prompt.md`
- Output: `finding-ledger.yaml`
- Progress step: `finding_ledger`
- Execution owner: teamlead/runtime-assisted LLM issue-artifact builder
- Topology: serial; downstream issue artifacts wait for it

### Precondition: Lens Output Schema Alignment

Before optimizing `finding-ledger`, the upstream lens output schema must be
treated as a current risk, not a solved precondition.

Normative contract:

- `lens-prompt-contract.md` applies one common output obligation to all 9 lens.
- Every lens finding should include the 4-field claim
  `{target, evidence_anchor, claim, lens_id}`.
- Every lens output should include `Domain Constraints Used` and
  `Domain Context Assumptions` provenance sections.
- `logic` and `axiology` add lens-specific fields.
- `conciseness` must include `upstream_evidence_required` on each finding.

Runtime prompt reality:

- `materialize-review-prompt-packets.ts` generates the same prompt scaffold for
  each selected lens: role definition, materialized input, context refs,
  boundary policy, generic execution directives, and output path.
- The machine-parsed gate currently enforces only the two provenance sections:
  `Domain Constraints Used` and `Domain Context Assumptions`.
- The full 4-field finding schema is not injected as a concrete required output
  block in each runtime lens prompt.
- Runtime ReviewRecord assembly validates provenance sections, not per-finding
  4-field claim presence.

Observed 9-lens output shape:

| Sample | Observation |
|---|---|
| `.onto/review/20260605-f127267d` | all 9 lens outputs exist, but they are short deterministic placeholders and none emits the 4-field claim shape |
| `.onto/review/20260522-19c419a7` | all 9 lens outputs exist and are rich; all 9 include provenance sections, but only some lens outputs explicitly emit 4-field claim fields |

In the rich 9-lens sample:

| Lens | Explicit 4-field claim shape | Notes |
|---|---|---|
| `logic` | yes | uses explicit `target`, `evidence_anchor`, `claim`, `lens_id`, plus logic-specific fields |
| `axiology` | yes | uses `4-Field Claim` plus axiology-specific fields |
| `conciseness` | partial | includes severity, but not the common 4-field claim fields consistently |
| `structure` | no | prose sections with evidence and fix, but not the common field shape |
| `dependency` | no | heading-delimited prose findings |
| `semantics` | no | What/Why/Fix prose findings |
| `pragmatics` | no | prose findings; repeated visible `P1` headings create source-ref ambiguity |
| `evolution` | no | prose findings |
| `coverage` | no | prose findings |

Conclusion:

The input scaffold is broadly uniform across lens prompts, but the output
schema is not yet uniformly required, validated, or observed. `finding-ledger`
currently absorbs this mismatch by semantically reading heterogeneous markdown
and normalizing it into a structured ledger. This is a major reason the stage is
slow and unstable.

Optimization implication:

The safest first fix is not to make `finding-ledger` smarter in isolation. The
pipeline should first add a common structured lens finding-output contract.
The preferred live path is native tool submission that writes the sidecar
directly. Markdown extraction is not part of the optimized path.

#### Structural Enforcement Options

Prompt-only enforcement should be the last resort. The preferred direction is
to make the valid path structurally easier than the invalid path.

Ranked options:

| Rank | Option | How it enforces structure | Coverage | Tradeoff |
|---:|---|---|---|---|
| 1 | Runtime-owned sidecar artifact | runtime writes `round1/{lens}.findings.yaml`; LLM only supplies semantic field values through a controlled surface | strongest for downstream contracts | requires a new lens finding artifact and validator |
| 2 | Native tool submission | add a tool such as `submit_lens_finding` with a JSON schema; runtime validates arguments and serializes findings | strong for function-calling direct-call providers | not available to Codex CLI worker unless a bridge is added |
| 3 | Provider structured output | direct-call provider requests JSON-schema output for a lens finding artifact | strong where provider supports it | current `callLlm` path does not use this yet and support differs by provider |
| 4 | Post-output validation/defaulting gate | after each lens output, parse/validate required fields; fill only deterministic defaults such as `session_id`, `lens_id`, and `Domain Constraints Used: []` for `session_domain=none` | works across all executors | invalid first output still consumes a call |
| 5 | Deterministic extraction from markdown | rejected for current path | can recover some old outputs only if implemented separately | cannot safely infer semantic fields or materiality; not part of this optimization |
| 6 | Prompt-only required block | stronger wording in prompt asks for exact markdown/YAML block | easiest | weakest; model may still drift |

The first implementation should combine ranks 1, 2, and 4:

1. Add a `round1/{lens}.findings.yaml` sidecar as the machine-consumed
   structured lens finding artifact.
2. Add native tool submission for tool-capable executors.
3. Runtime fills all deterministic fields and validates the sidecar before the
   lens completion barrier.
4. If the sidecar is absent or invalid under a text-only executor, fail or mark
   the unit degraded. Do not introduce a small-LLM repair layer.

This keeps `round1/{lens}.md` as human/audit prose and moves machine contracts
out of fragile markdown prose.

#### Direct YAML Through Runtime Tools

The preferred no-markdown path is a runtime-owned submission surface. The LLM
does not write YAML text. It calls bounded tools, and runtime serializes the
validated calls into `round1/{lens}.findings.yaml`.

Candidate tools:

```text
submit_lens_finding({
  target,
  evidence_anchor,
  claim,
  what,
  why,
  how_to_fix,
  upstream_evidence_required,
  severity_hint
})

finish_lens({
  domain_constraints_used,
  domain_context_assumptions,
  no_findings_rationale
})
```

Runtime-owned values are intentionally absent from `submit_lens_finding`.
Runtime derives or overwrites them:

- `session_id`
- `lens_id`
- `candidate_id`
- `source_ref`
- `human_output_ref` when markdown projection is enabled

This makes the output contract structural: the only durable artifact is the
runtime-written YAML. The LLM can choose semantic arguments, but it cannot
rename fields, add extra sections, wrap output in fences, or omit runtime-owned
metadata.

Executor coverage:

- Direct-call/tool-native providers can use this path.
- Codex CLI/text-only workers cannot be structurally forced through this tool
  surface without an additional bridge. For those, either keep markdown/YAML
  text output with validation or route lens sidecar generation through a
  tool-capable executor.

Optional markdown should be rendered deterministically from the sidecar when
`review.artifacts.write_lens_markdown=true`; it should not be a separate
LLM-authored output in the optimized path.

Current implementation gaps to close:

1. `inline-http-review-unit-executor` already supports tool-native execution,
   but currently always writes the final assistant text to `output_path`.
   Sidecar mode needs a tool-state-to-artifact writer that serializes submitted
   findings instead of trusting final text.
2. `ONTO_DEFAULT_TOOLS` is read-only (`read_file`, `list_directory`,
   `search_content`). Sidecar mode needs a unit-scoped toolset such as
   `ONTO_LENS_SIDECAR_TOOLS`, not a global write-capable tool exposed to every
   unit.
3. `OntoToolPropertySchema` currently models flat scalar properties. A clean
   `finish_lens({ domain_constraints_used: [...] })` tool needs nested
   JSON-schema support, or the first version must split provenance submission
   into scalar calls.
4. Lens prompt packets currently declare `Tools: denied`. Sidecar mode must
   generate a different lens packet boundary policy with tools admitted but
   bounded to the review target/context refs and the sidecar submission tools.
5. `ReviewExecutionPlan` currently has only the markdown lens `output_path`.
   The optimized path needs an explicit sidecar path, for example
   `round1/{lens}.findings.yaml`, and downstream units must consume that path
   before `write_lens_markdown=false` is safe.

Minimal implementation slice:

1. Add a lens sidecar artifact type and validator.
2. Add a unit-scoped `submit_lens_finding` tool that records submissions in
   runtime memory.
3. After the tool loop completes, have runtime write
   `round1/{lens}.findings.yaml` from the recorded submissions.
4. Keep `round1/{lens}.md` only as an optional deterministic human projection;
   machine consumers must use `round1/{lens}.findings.yaml`.

Implemented first slice:

- `ReviewLensSidecarArtifact` and candidate/provenance types exist in the
  review artifact type surface.
- `lens-sidecar-artifact.ts` validates sidecar envelope, candidate fields,
  duplicate `candidate_id`, provenance lists, and empty-finding rationale.
- `submit_lens_findings` is implemented as a batched unit-scoped tool for
  direct-call/tool-native execution.
- `inline-http-review-unit-executor` supports
  `--output-format lens-sidecar`; in this mode it requires native tool
  execution and writes runtime YAML instead of assistant markdown text.
- text/inline sidecar emulation is intentionally disabled for sidecar mode.

Implemented continuation through task 5:

1. Execution-plan sidecar seats now exist for every lens when
   `review.artifacts.lens_output_format=sidecar`.
   - `lens_execution_seats[*].sidecar_output_path`
   - `lens_prompt_packet_seats[*].sidecar_output_path`
   - session-boundary validation covers both sidecar seat fields.
2. Lens prompt-packet materialization now emits a sidecar-mode contract.
   - `output_path` points to `round1/{lens}.findings.yaml`.
   - `human_output_path` points to `round1/{lens}.md` only when markdown
     projection is enabled.
   - boundary policy marks tools as required and admits only the sidecar plus
     optional markdown projection as output refs.
3. `finding-ledger` now has a deterministic sidecar path.
   - When every successful lens output is a sidecar, runtime writes
     `finding-ledger.yaml` directly from sidecar candidates.
   - The generated `finding-ledger.prompt.md` becomes a runtime audit packet,
     not an LLM instruction packet.
   - No clustering, relation inference, or new severity judgment is performed
     in this deterministic projection.
4. Optional `round1/{lens}.md` is now rendered from the sidecar.
   - `review.artifacts.write_lens_markdown=true` keeps the human/audit
     projection.
   - `write_lens_markdown=false` is valid only with
     `lens_output_format=sidecar`.
5. Downstream consumers now receive successful lens dispatch output refs.
   - In sidecar mode, issue-artifact prompts, controlled deliberation, and
     synthesize runtime packets list `.findings.yaml` refs instead of markdown
     refs.
   - Citation audit remains extension-agnostic: it parses participating lens
     refs from the synthesize packet and reads the allowed files as text, so
     `.findings.yaml` sidecars are valid audit pool members.

Activation note:

- Sidecar mode is the current default. Settings may still override it
  explicitly when a run must use the markdown output contract.
- Sidecar live execution requires a tool-capable direct-call executor or the
  mock executor. The runner rejects `lens_output_format=sidecar` when the
  resolved route is a Codex worker, because the current Codex worker bridge
  cannot structurally force `submit_lens_findings`.

#### Causality And Materiality Design Update

The sidecar contract should separate three axes that are currently easy to
collapse:

| Axis | Question | Owner |
|---|---|---|
| Surface finding | What did the lens observe and why is the claim evidence-backed? | lens LLM; runtime validates shape |
| Materiality | Does this weaken the declared review purpose enough to be `blocker`, `high`, or `medium`? | lens hint + ledger/issue-stage LLM; runtime derives materiality from severity |
| Causality | Why did the finding arise, and which cause nodes are shared with other findings? | lens LLM proposes causal path for material candidates; relation graph LLM compares paths |

Design rule:

> Record broadly; trace causality selectively.

Every lens finding should be recorded in `round1/{lens}.findings.yaml` and then
`finding-ledger.yaml`, including clear `low` and `info` observations. However,
only findings that are material candidates, or that plausibly hide a material
failure after a short causal check, should carry a causal path. A clear
non-material finding can remain a compact surface row without root-cause tracing.

Root cause definition:

> A root cause is the evidence-backed starting cause of the finding's causal
> path inside the current review boundary. It is not material because it is a
> root cause; it becomes relevant to material issue handling only when the
> finding or issue materially weakens the declared review purpose.

Relation graph implication:

- `same_root_candidate` means two causal paths share the same starting cause.
- `shared_cause_candidate` should be introduced for paths with different roots
  but a shared intermediate cause.
- Non-material surface findings without a causal path remain recorded in the
  ledger but should not force relation graph root-cause coverage.
- The relation graph should validate coverage over the causal-analysis set, not
  over every recorded finding.

Pipeline consequence:

```text
lens sidecar
  -> all surface findings recorded
  -> material candidates include materiality_basis + causal_path
finding-ledger
  -> assigns stable finding_id to all findings
  -> preserves causal_path only where lens supplied it
relation input projection
  -> projects all findings for audit/context
  -> projects causal_path nodes only for causal-analysis candidates
finding-relation-graph
  -> finds same-root, shared-cause, dependency, duplicate, or conflict relations
issue-ledger
  -> clusters same-root material findings as root-cause issues
  -> preserves shared-cause dependencies between otherwise distinct issues
```

#### Dependency-Aware Implementation Design

Implementation should proceed in dependency order so downstream artifact truth
does not temporarily depend on fields that producers cannot yet emit.

Primary design constraints:

1. `round1/{lens}.findings.yaml` is the first durable place where materiality and
   causal trace can be captured structurally.
2. `finding-ledger.yaml` must remain a registry of all findings, not a root-cause
   clustering step.
3. `finding-relation-graph.yaml` should compare causal paths and shared cause
   refs; it should not decide materiality.
4. Runtime owns stable identifiers: `candidate_id`, `finding_id`, and final
   ledger `cause_id` refs. LLM supplies semantic cause claims and evidence refs,
   not globally stable ids.
5. Backward compatibility is not part of this optimization. Current sidecar
   rows must use the causal finding shape; older or partial rows fail loudly and
   should be regenerated.

Schema version strategy:

- Lens sidecar has one current contract. `materiality_basis` and `causal_path`
  are mandatory fields for every row; material rows require objects and
  non-material rows require explicit `null`.
- `finding-ledger.yaml` also treats the causal fields as current artifact truth:
  material rows require `materiality_basis` and `causal_path`; low/info rows
  require both fields to be `null`.

Ordered implementation plan:

| Order | Slice | Depends on | Output | Verification gate |
|---:|---|---|---|---|
| 0 | Admit bounded relation source reads | none | projection-first prompt, with bounded lens/sidecar refs readable only when the compact projection lacks needed rationale context | existing relation graph tests updated to expect supplemental source refs |
| 1 | Shared causal/materiality types | none | TS types for `materiality_basis`, `causal_path`, causal step refs, and `shared_cause_candidate` | typecheck plus focused type fixtures |
| 2 | Lens sidecar schema/validator extension | slice 1 | sidecar validator accepts all findings and requires materiality/causal fields for material candidates | sidecar validator tests for material pass/fail and non-material null fields |
| 3 | Tool submission schema extension | slice 2 | `submit_lens_findings` accepts nullable materiality/causal fields while runtime assigns ids | tool-native executor tests and mock tool-loop fixture |
| 4 | Producer fixture updates | slices 2-3 | mock executor, `ONTO_LLM_MOCK`, and inline fixtures emit valid material/non-material examples | current mock sidecar E2E keeps passing |
| 5 | Deterministic finding-ledger projection | slices 2-4 | all sidecar findings receive stable `finding_id`; causal step ids become `finding-xxx.cause-yyy`; evidence refs preserved | ledger tests for all findings, material causal refs, and non-material surface rows |
| 6 | Relation input projection redesign | slice 5 | projection includes full nodes only for `causal_analysis_finding_ids` and lists surface-only ids separately | projection tests for material-only causal set and supplemental source refs |
| 7 | Relation graph schema/validator extension | slice 6 | `shared_cause_candidate` and cause-node refs are validated; coverage applies only to causal-analysis ids | validator tests for same-root, shared-cause, non-causal exclusion |
| 8 | Issue-ledger dependency handling | slice 7 | same-root relations cluster issues; shared-cause relations preserve dependency/context without forced merge | issue-ledger tests with distinct roots sharing a cause |
| 9 | Semantic quality and benchmark update | slices 5-8 | quality gate tracks material recall, false materiality, non-material preservation, and causal relation correctness | sidecar mock E2E, targeted semantic fixtures, benchmark record |

Implementation slices 1-7 are tightly coupled; each slice should land with
focused tests before moving to the next. Slice 8 can follow once relation graph
truth is stable. Slice 9 should be the acceptance gate before treating the new
flow as the default tuning baseline.

Implemented slice 8:

- `issue-ledger.yaml` now requires top-level `issue_dependencies`.
- `shared_cause_candidate` relations must be preserved as issue dependencies
  when their findings remain in distinct issues.
- `shared_cause_candidate` relation refs are rejected inside issue
  `relation_refs`, so shared intermediate causes cannot masquerade as
  same-root merge evidence.
- Runtime validation rejects findings connected only by
  `shared_cause_candidate` when they are merged into the same issue.

Implemented slice 9:

- `semantic-quality-gate.ts` keeps the existing ReviewRecord/final-output checks
  and adds optional issue-artifact-backed checks when the benchmark runner
  supplies `finding-ledger.yaml`, `finding-relation-graph.yaml`, and
  `issue-ledger.yaml`.
- Added checks for current causal/materiality shape, non-material surface
  preservation, material causal relation coverage, endpoint-owned shared-cause
  cause refs, and `issue_dependencies` preservation.
- `scripts/review-pipeline-benchmark.ts` now passes issue artifacts into the
  semantic quality gate. Mock runs remain `not_applicable` for model semantic
  quality but still verify harness/artifact collection stability.
- Refreshed `development-records/benchmark/20260605-review-pipeline-current-mock.json`
  with a current controlled-high-effort mock run.

Planned artifact flow by result:

| Result | Built by | Process |
|---|---|---|
| `round1/{lens}.findings.yaml` | lens worker + runtime sidecar tool | LLM submits surface finding fields; for material candidates it also submits `materiality_basis` and causal step claims/evidence; runtime assigns candidate-local ids and writes YAML |
| `finding-ledger.yaml` | runtime deterministic projection | runtime copies all findings, assigns stable `finding_id`, rewrites causal step refs to ledger-stable `finding-xxx.cause-yyy`, mirrors current top-level materiality fields, and preserves all evidence refs |
| relation input projection | runtime deterministic projection | runtime includes full nodes only for material findings with causal paths and lists surface-only ids separately |
| `finding-relation-graph.yaml` | LLM semantic relation unit + runtime validation | LLM compares causal paths for same-root/shared-cause/dependency/conflict; runtime validates ids, cause refs, enums, and causal-analysis coverage |
| `issue-ledger.yaml` | LLM issue clustering unit + runtime validation | LLM merges same-root material findings into issues and records shared-cause dependencies without forcing unrelated root causes into one issue |

Redesign triggers:

- If material issue recall drops in the semantic fixture, stop before slice 8 and
  inspect sidecar/ledger projection loss.
- If non-material findings disappear from ledger, fix slice 5 before continuing.
- If relation graph needs full lens prose for most material findings, widen the
  causal path fields before trying more prompt wording.
- If `shared_cause_candidate` begins to force issue merges, keep it as dependency
  context and adjust issue-ledger prompt/validator before E2E.

#### Human Markdown Output Option

`round1/{lens}.md` is now an optional human-readable projection, not the
machine-consumed authority in sidecar mode.

Setting:

```json
{
  "review": {
    "artifacts": {
      "lens_output_format": "sidecar",
      "write_lens_markdown": false
    }
  }
}
```

`write_lens_markdown: false` is the speed-oriented default. Set it to `true`
only when a human/audit markdown projection is needed for inspection.

Current consumption status:

- Sidecar mode consumes `round1/{lens}.findings.yaml` for downstream machine
  refs.
- Deterministic markdown projection can remain on for human inspection.
- With `write_lens_markdown=false`, no downstream issue-artifact, controlled
  deliberation, synthesize, or citation-audit path should require the markdown
  projection.

#### Field Ownership Split

The split below distinguishes what runtime can fill **today** from what becomes
runtime-owned only after the sidecar/extractor change. This matters: in the
current path, `finding-ledger.yaml` is still LLM-authored YAML and runtime mostly
validates it.

| Field | Current runtime status | Safe owner after sidecar | Enforcement strategy |
|---|---|---|---|
| `session_id` | available in `ReviewExecutionPlan.session_id` | runtime | copy from execution plan; reject mismatches |
| `lens_id` | available in lens execution/prompt seats | runtime | derive from seat; ignore or overwrite LLM-authored value in sidecar |
| `output_path` | available in lens execution/prompt seats | runtime | derive from execution plan |
| `source_output_ref` / `human_output_ref` | available only if markdown output is written | runtime | derive from `round1/{lens}.md`; make nullable/optional when markdown is disabled |
| `candidate_id` | not present today | runtime after sidecar | assign from sidecar item order, tool-submission order, or extractor block order |
| `finding_id` | LLM-authored today; runtime only validates uniqueness | runtime only if `finding-ledger` becomes deterministic aggregation over sidecars | assign after accepted candidates are ordered globally; otherwise keep as ledger output |
| `source_ref` | LLM-authored today in `finding-ledger` | runtime after sidecar | derive from sidecar path + `candidate_id`; fail if a current sidecar source cannot be resolved |
| `cause_id` / `cause_ref` | not present today | runtime after sidecar/ledger projection | assign candidate-local cause ids in sidecar if stored, then rewrite to `finding-xxx.cause-yyy` refs in `finding-ledger` |
| `source_path` / `line_start` / `line_end` | not present today | runtime only when extractor records markdown spans or a tool bridge reports source spans | do not claim runtime ownership without span instrumentation |
| `Domain Constraints Used` for `session_domain=none` | expected by prompt and validated from markdown, but not currently inserted by runtime | runtime after sidecar or defaulting gate | write `[]` automatically before barrier |
| `Domain Constraints Used` with domain docs | LLM-authored today, parsed strictly for ReviewRecord | LLM selects, runtime validates | restrict `source_doc` to allowed domain refs and require non-empty anchor |
| `Domain Context Assumptions` | LLM-authored today, parsed/normalized from markdown | LLM selects, runtime validates | require string list; parser accepts YAML or markdown bullets |
| `target` | LLM-authored today | LLM proposes, runtime validates | restrict to review target refs, allowed read refs, or explicit artifact refs |
| `evidence_anchor` | LLM-authored today | LLM proposes, runtime validates | require file/section/line anchor shape and verify path is within allowed refs when path-like |
| `claim` | LLM-authored today | LLM | semantic compression; runtime only validates non-empty bounded string |
| `what` / `why` / `how_to_fix` | LLM-authored prose today | LLM | semantic prose fields; runtime validates presence and size |
| `upstream_evidence_required` | not uniformly emitted today | LLM, enum-validated | required for `conciseness` and boundary-expansion cases |
| `severity_hint` | not authoritative today | LLM, enum-validated | optional lens hint; authoritative severity remains `finding-ledger` unless contract changes |
| `materiality_basis` | not present today | LLM, runtime validates shape | required when `severity_hint` is `blocker`, `high`, or `medium`; optional/null for `low` and `info` |
| `causal_path` | not present today | LLM, runtime validates shape | required for material candidates and optional for non-material candidates that plausibly hide a material issue |

Important distinction: `finding-ledger.yaml` remains the authority for final
severity/materiality in the current issue-stance path. A lens sidecar may carry
`severity_hint`, but it should not silently replace ledger severity.

Verified current code facts:

- `ReviewExecutionPlan` contains `session_id`, `round1_root`, and lens seats
  with `lens_id` and `output_path`.
- materialization currently sets each lens output path to
  `round1/{lens}.md`.
- `finding-ledger.yaml` validation requires `finding_id`, `lens_id`,
  `source_ref`, `claim`, evidence refs, and severity, but it does not generate
  those fields.
- ReviewRecord assembly parses `Domain Constraints Used` and
  `Domain Context Assumptions` from lens markdown; it does not insert missing
  sections.
- The prompt packet already knows when `session_domain=none` should imply
  `Domain Constraints Used: []`, so runtime can enforce or repair this, but the
  current path still asks the LLM to write it.

#### Field Meanings And Examples

`lens_id`
: Which lens produced the candidate.
Example: `coverage`.
This should be runtime-owned because the runtime already knows which lens seat
is executing.

`candidate_id`
: A temporary ID inside one lens sidecar before the global `finding-ledger`
assigns `finding_id`.
Example: `coverage-candidate-001`.
This lets runtime refer to a candidate deterministically even before final
ledger normalization.

`finding_id`
: The stable session-wide finding ID after `finding-ledger` accepts the
candidate.
Example: `finding-003`.
Downstream relation/issue artifacts should use this, not the temporary
candidate ID. In the current implementation this is produced by the
LLM-authored `finding-ledger.yaml`; runtime ownership requires changing
`finding-ledger` into a deterministic aggregation step.

`source_ref`
: Where the candidate came from as a review artifact reference.
Example: `round1/coverage.findings.yaml#coverage-candidate-001` or
`round1/coverage.md#finding-1`.
This is provenance for the review pipeline itself.

`target`
: The artifact, file, section, or behavior being criticized.
Example: `execution-preparation/materialized-input.md`.
This answers "what is the finding about?"

`evidence_anchor`
: The concrete location that supports the claim.
Example: `execution-preparation/materialized-input.md:12-24`.
This answers "where can a human or runtime check the evidence?"

`claim`
: The compact surface-finding statement.
Example: `The review target omits the public-output boundary that the final
review is expected to verify.`
This is the semantic assertion the LLM must make.

`what`
: A plain description of the observed problem.
Example: `The materialized input includes implementation notes but not the
expected user-visible output contract.`

`why`
: Why the evidence supports the claim and why it matters.
Example: `Without that contract, later review stages cannot distinguish a real
missing requirement from an intentional scope exclusion.`

`how_to_fix`
: The smallest useful correction or mitigation.
Example: `Add the public-output boundary to the materialized input or mark it
as explicitly out of scope before lens review.`

`upstream_evidence_required`
: Whether this candidate depends on evidence that is outside the current
allowed read boundary.
Example: `true` when a conciseness lens says "this may be redundant, but I
would need the original product spec to confirm."

`severity_hint`
: A non-authoritative lens estimate of seriousness.
Example: `medium`.
`finding-ledger.yaml` still decides authoritative `severity`.

`materiality_basis`
: Why the finding is more than a surface mention for the declared review
purpose. It carries `affected_purpose`, `failure_condition`, `impact`, and
`evidence_refs`. It is required for material candidates and normally `null` for
clear `low` or `info` findings.
Example:

```yaml
materiality_basis:
  affected_purpose: "The final review can make a trustworthy release-readiness decision."
  failure_condition: "The target is used as the basis for release or handoff without the missing contract."
  impact: "The result can appear complete while omitting the boundary needed to verify the decision."
  evidence_refs:
    - "execution-preparation/materialized-input.md:12-24"
```

`causal_path`
: A compact public causal trace for material candidates. It is not private
chain-of-thought. It records only evidence-backed cause nodes that downstream
relation graph can compare.
Example:

```yaml
causal_path:
  root_cause_candidate: "The reviewed target does not declare the public-output boundary that review completion depends on."
  steps:
    - cause_id: cause-001
      claim: "The target omits the expected public-output contract."
      relation_to_previous: null
      evidence_refs: ["execution-preparation/materialized-input.md:12-24"]
    - cause_id: cause-002
      claim: "Without that boundary, later review stages cannot separate missing requirements from intentional exclusions."
      relation_to_previous: symptom_of
      evidence_refs: ["execution-preparation/materialized-input.md:12-24"]
  unresolved_beyond_evidence: null
```

`domain_constraints_used`
: Domain-specific review rules actually used by the lens.
Example:

```yaml
domain_constraints_used:
  - source_doc: ".onto/domains/api-design/problem_framing_profile.md"
    source_version_or_snapshot_id: "2026-06-05"
    anchor: "## Public Contract Stability"
```

For `session_domain: none`, runtime can force this to `[]`.
In the current markdown path this is only enforced by validation; automatic
insertion requires a sidecar writer or deterministic defaulting gate.

`domain_context_assumptions`
: Assumptions the lens made because the domain context was incomplete.
Example:

```yaml
domain_context_assumptions:
  - "Assumed the review target is a public CLI/API path because binding.review_mode says productized live path."
```

#### Proposed Sidecar Shape

```yaml
schema_version: 1
session_id: "{session_id}"
lens_id: "coverage"
human_output_ref: "round1/coverage.md"
findings:
  - candidate_id: "coverage-candidate-001"
    target: "execution-preparation/materialized-input.md"
    evidence_anchor: "execution-preparation/materialized-input.md:12-24"
    claim: "The target omits the bounded public-output contract details required for verification."
    what: "What the lens observed."
    why: "Why the evidence supports the claim."
    how_to_fix: "How to fix or reduce the issue."
    upstream_evidence_required: false
    severity_hint: "medium"
    materiality_basis:
      affected_purpose: "Declared purpose affected by this finding."
      failure_condition: "Boundary or condition where the finding becomes a real failure."
      impact: "Why trust, completeness, auditability, reproducibility, or decision quality is weakened."
      evidence_refs:
        - "execution-preparation/materialized-input.md:12-24"
    causal_path:
      root_cause_candidate: "Evidence-backed starting cause inside the current review boundary."
      steps:
        - cause_id: "cause-001"
          claim: "Observed surface issue."
          relation_to_previous: null
          evidence_refs:
            - "execution-preparation/materialized-input.md:12-24"
        - cause_id: "cause-002"
          claim: "Immediate or root cause candidate."
          relation_to_previous: "symptom_of"
          evidence_refs:
            - "execution-preparation/materialized-input.md:12-24"
      unresolved_beyond_evidence: null
  - candidate_id: "coverage-candidate-002"
    target: "execution-preparation/materialized-input.md"
    evidence_anchor: "execution-preparation/materialized-input.md:31"
    claim: "The wording could be clearer but does not weaken the declared review purpose."
    what: "A clear non-material surface observation."
    why: "The evidence supports the wording observation, but no material failure condition is shown."
    how_to_fix: "Clarify the sentence when convenient."
    upstream_evidence_required: false
    severity_hint: "low"
    materiality_basis: null
    causal_path: null
domain_constraints_used: []
domain_context_assumptions: []
validation:
  unaddressable_candidates: []
```

Runtime should be allowed to add or overwrite:

- `lens_id`
- `session_id`
- `human_output_ref`
- `candidate_id`
- deterministic `source_ref` projection used by `finding-ledger`

The LLM should supply only the semantic field values that cannot be derived.

#### Normal Path vs Compatibility Path

Normal path:

```text
lens LLM semantic judgment
  -> submit_lens_finding / finish_lens tool calls
  -> runtime validation
  -> runtime writes round1/{lens}.findings.yaml
  -> optional deterministic human markdown render
  -> finding-ledger consumes compact sidecars
```

Rejected historical text-only option:

```text
lens markdown
  -> runtime conservative candidate extraction
  -> deterministic defaults only
  -> validated sidecar or degraded/failed unit
  -> finding-ledger consumes compact sidecars
```

Markdown-derived sidecar extraction is not part of the current contract.

### Input

The runtime-generated prompt packet gives `finding-ledger` only bounded artifact
refs. In the current full E2E reference session, the effective inputs are:

1. Hard output contract
   - YAML only
   - `schema_version: 1`
   - exact `session_id`
   - quoted scalar strings or YAML block scalars
   - stable IDs preserved consistently
   - insufficient evidence must be encoded, not invented
2. Severity contract
   - allowed values: `blocker`, `high`, `medium`, `low`, `info`
   - materiality is derived from severity
   - material severities require affected purpose, failure condition, impact,
     and concrete evidence refs
3. Round 1 lens output refs in the current real full E2E timing reference
   - `round1/axiology.md`
   - `round1/coverage.md`
   - `round1/evolution.md`
   - `round1/logic.md`
   - `round1/semantics.md`
   - `round1/structure.md`
4. Review target profile
   - `execution-preparation/review-target-profile.yaml`
5. Boundary policy and unit boundary details
   - filesystem read-only
   - network denied
   - repo exploration denied
   - tools required
   - allowed output ref: `finding-ledger.yaml`

Important current property: the prompt lists lens output file refs, but it does
not provide a pre-extracted compact finding table. The LLM must read the lens
markdown files and decide which statements are final-output-affecting surface
findings.

The timing reference session used a selected 6-lens plan
(`axiology`, `coverage`, `evolution`, `logic`, `semantics`, `structure`). It is
valid for current-path latency, but not sufficient as the only lens-shape
sample. For extractor design, two 9-lens repo-local samples were also inspected:

- `.onto/review/20260605-f127267d`: all 9 lens outputs present, but each output
  is a short deterministic placeholder with the same `### Finding` shape.
- `.onto/review/20260522-19c419a7`: all 9 lens outputs present and rich enough
  to show heterogeneous real lens markdown shapes.

The rich 9-lens sample is the better source for extractor risk analysis, but it
is not a current output-contract authority. It uses older artifact conventions
in places, including retired severity values such as `critical` and a smaller
historical `finding-ledger.yaml` row shape. Current contract authority remains
`issue-stance-deliberation-contract.md` and the active TS validation in
`issue-artifact-runtime.ts`.

### Output

`finding-ledger.yaml` is a session-local stable registry of surface findings.
It does not cluster, relate, or promote findings into root-cause issues.

Required shape:

```yaml
schema_version: 1
session_id: "{session_id}"
findings:
  - finding_id: finding-001
    lens_id: logic
    source_ref: round1/logic.md#finding-1
    target: "file or artifact"
    evidence_anchor: "stable evidence anchor"
    claim: "surface finding claim"
    proposed_action: "stated or inferred action"
    affected_purpose: "declared purpose or contract affected by this finding"
    failure_condition: "user group, environment, data condition, execution path, or boundary where trust fails"
    impact: "why this changes trust for the declared review purpose"
    evidence_refs: [round1/logic.md#finding-1]
    severity: medium
    domain_threshold_used: null
validation:
  unaddressable_findings: []
```

Planned causal/materiality extension:

```yaml
findings:
  - finding_id: finding-001
    lens_id: coverage
    source_ref: round1/coverage.findings.yaml#coverage-candidate-001
    target: "execution-preparation/materialized-input.md"
    evidence_anchor: "execution-preparation/materialized-input.md:12-24"
    claim: "Material candidate surface finding."
    proposed_action: "Smallest useful correction."
    affected_purpose: "Declared purpose affected by this finding."
    failure_condition: "Condition where trust fails."
    impact: "Why the finding weakens trust, completeness, auditability, reproducibility, or decision quality."
    evidence_refs:
      - "execution-preparation/materialized-input.md:12-24"
    severity: medium
    domain_threshold_used: null
    materiality_basis:
      affected_purpose: "Same authority as affected_purpose, preserved from sidecar when present."
      failure_condition: "Same authority as failure_condition, preserved from sidecar when present."
      impact: "Same authority as impact, preserved from sidecar when present."
      evidence_refs:
        - "execution-preparation/materialized-input.md:12-24"
    causal_path:
      root_cause_candidate: "Evidence-backed starting cause."
      steps:
        - cause_id: "finding-001.cause-001"
          claim: "Observed surface issue."
          relation_to_previous: null
          evidence_refs:
            - "execution-preparation/materialized-input.md:12-24"
        - cause_id: "finding-001.cause-002"
          claim: "Evidence-backed cause candidate."
          relation_to_previous: "symptom_of"
          evidence_refs:
            - "execution-preparation/materialized-input.md:12-24"
      unresolved_beyond_evidence: null
  - finding_id: finding-002
    lens_id: coverage
    source_ref: round1/coverage.findings.yaml#coverage-candidate-002
    target: "execution-preparation/materialized-input.md"
    evidence_anchor: "execution-preparation/materialized-input.md:31"
    claim: "Non-material surface finding."
    proposed_action: "Optional improvement."
    affected_purpose: "Declared review purpose"
    failure_condition: "No material failure condition shown by current evidence."
    impact: "Useful observation, but not enough to make the result unsafe for its declared purpose."
    evidence_refs:
      - "execution-preparation/materialized-input.md:31"
    severity: low
    domain_threshold_used: null
    materiality_basis: null
    causal_path: null
```

The duplicated top-level `affected_purpose`, `failure_condition`, `impact`, and
`evidence_refs` are current ledger fields used by downstream classifiers.
`materiality_basis` is the sidecar-preserved semantic source for material
candidates. Runtime mirrors those values into the top-level fields but must not
invent materiality.

Runtime validation currently requires:

- `schema_version: 1`
- exact `session_id`
- `findings` list
- unique `finding_id`
- each finding has `finding_id`, `lens_id`, `source_ref`, `claim`,
  `affected_purpose`, `failure_condition`, `impact`, `evidence_refs`,
  `severity`, and optional/null `domain_threshold_used`
- material severities cannot have empty `evidence_refs`
- `validation.unaddressable_findings` exists

Downstream consumers:

- `finding-relation-graph.yaml` uses stable `finding_id` values.
- `finding-relation-graph.yaml` should use `causal_path` where present to compare
  same-root and shared-cause candidates; findings without `causal_path` remain
  recorded but do not require root-cause relation coverage.
- `issue-ledger.yaml` uses the ledger plus relation graph to form root-cause
  issue clusters for material causal findings and to preserve dependencies
  between issues with shared intermediate causes.
- `issue-stance-matrix.yaml`, `deliberation-plan.yaml`,
  `problem-framing.yaml`, `review-record.yaml`, and final projections depend on
  the ledger's stable finding identity and severity/evidence fields.

### Work Performed

The actual work is a surface-finding extraction and normalization pass:

1. Read each participating Round 1 lens output.
2. Identify every recorded finding, including material candidates and compact
   non-material surface observations.
3. Ignore lens prose that is only explanation, completion check, role boilerplate,
   or non-finding commentary.
4. Assign stable session-local `finding_id` values.
5. Preserve the originating `lens_id` and a source anchor.
6. Normalize the claim into a concise artifact row.
7. Preserve or infer `proposed_action`, `affected_purpose`,
   `failure_condition`, and `impact`.
8. Assign severity under the review severity contract.
9. Downgrade insufficient evidence to `info` instead of inventing materiality.
10. Preserve `materiality_basis` and `causal_path` when the lens sidecar supplied
    them; do not derive root causes in `finding-ledger`.
11. Keep clear `low`/`info` findings as compact surface rows with
    `materiality_basis: null` and `causal_path: null`.
12. Record unaddressable findings when a lens claim lacks a usable anchor.

This is partly deterministic extraction and partly semantic judgment. The LLM
is needed today because lens outputs are markdown prose with heterogeneous
finding styles, and deciding whether a statement is final-output-affecting
requires semantic interpretation.

### Current Cost Signal

Reference real full E2E session:

| Metric | Value |
|---|---:|
| Wall time | 100.979s |
| Prompt packet bytes | 11184 bytes |
| Output bytes | 8459 bytes |
| Input source count | 6 lens outputs + review target profile |
| Downstream dependency | blocks all later issue artifacts |

This stage is slower than the lens round even though its prompt packet is
smaller than most lens packets. That suggests the main cost driver is not raw
input size alone.

### Likely Cost Driver

Primary driver: semantic extraction and normalization complexity.

Contributing factors:

- The LLM must inspect multiple lens markdown outputs.
- It must distinguish actual findings from explanatory text.
- It must preserve enough detail for downstream relation/root-cause work.
- It must create a complete YAML object for every finding.
- The output is relatively large for a first-stage artifact.

Input size matters, but it is not the dominant explanation. In the same full
E2E, lens packets were often larger yet completed much faster because each lens
did one perspective-specific judgment. `finding-ledger` performs cross-output
extraction and schema normalization.

### Optimization Hypotheses

Candidate paths to review next:

1. Runtime pre-extraction
   - Parse lens markdown into candidate sections before the LLM call.
   - Provide only candidate finding blocks, source refs, and lens IDs.
   - Keep LLM responsibility to classify/normalize ambiguous candidates.
2. Lens output schema tightening
   - Require Round 1 lenses to emit a compact machine-readable finding block.
   - Let `finding-ledger` become mostly deterministic merge plus validation.
   - Require `materiality_basis` and `causal_path` only for material candidates
     or non-material candidates that plausibly hide a material issue after a
     short causal check.
3. Split extraction from severity normalization
   - Runtime extracts candidate finding rows.
   - LLM assigns severity and fills missing semantic fields only where needed.
4. Output compression
   - Keep long rationale in source lens output.
   - Ledger rows should contain compact claim/action/purpose/failure/impact and
     evidence refs, not full prose.
   - Ledger should preserve compact causal path nodes for material candidates
     instead of forcing relation graph to re-read full lens prose.

### Deterministic vs Semantic Split

The first safe split is not "runtime builds the complete ledger." Current lens
markdown is still heterogeneous. Across the inspected 9-lens rich sample:

- `logic` uses top-level `## Finding 1` blocks with explicit bullet fields.
- `structure`, `coverage`, `semantics`, and `axiology` use `## Findings` plus
  `### S1` / `### COV-1` / `### Finding A1` style child headings.
- `dependency` uses `### Findings` plus `#### D1` child headings.
- `conciseness` uses `## Finding C1` blocks without a surrounding
  `## Findings` section.
- `pragmatics` repeats `### P1` for several different findings, so the visible
  code prefix is not unique.
- No-issue outputs may use prose such as `No logic findings`, `No structural
  issue found`, an empty list, or a short deterministic placeholder.

If runtime blindly converts headings into findings, it can create false
positives, duplicate source refs, or unstable IDs.

The lower-risk split is:

1. Runtime extracts bounded finding candidates and provenance.
2. LLM receives only those candidates plus compact target profile context.
3. LLM accepts/rejects/normalizes each candidate into the contract-complete
   ledger.
4. Runtime validates coverage, IDs, refs, severity fields, and output shape.

#### Runtime-Owned Work

Runtime can own these operations because they are mechanical and auditable:

| Operation | Runtime output | Reason it is deterministic enough |
|---|---|---|
| Lens file inventory | ordered list of participating lens outputs | known from execution plan and lens completion barrier |
| Lens ID derivation | `lens_id` per file | path and registry already identify lens identity |
| Findings section detection | candidate regions near `Findings` headings and standalone `Finding*` headings | heading scan can find candidate regions without judging content |
| Candidate block segmentation | heading-delimited blocks such as `## Finding 1`, `### COV-1`, `#### D1`, or `## Finding C1` | markdown headings and list blocks are mechanically separable |
| No-finding signal capture | `candidate_kind: no_finding_signal` | common phrases and empty list markers can be captured as signals, not ledger rows |
| Source ref creation | `round1/{lens}.md#candidate-{n}` plus heading text and line range | deterministic from file path and block order; avoids duplicate heading prefixes like repeated `P1` |
| Raw evidence excerpt bounding | compact excerpt for each candidate block | runtime can pass only the candidate block, not the full lens file |
| ID allocation | provisional `candidate_id` order | stable order can be file order + block order; final `finding_id` remains tied to accepted findings |
| Field presence scan | detected labels: `What`, `Why`, `How to fix`, `target`, `claim`, etc. | label extraction is syntactic |
| Output validation | YAML schema, enum values, evidence refs, material evidence rules | already mostly implemented in validation |

Runtime should not decide that a candidate is material or final-output-affecting
from syntax alone. It should preserve uncertain candidates and let the LLM make
the semantic decision.

#### LLM-Owned Work

LLM should keep these decisions because they require meaning, purpose fit, or
severity judgment:

| Operation | LLM output | Why it remains semantic |
|---|---|---|
| Candidate acceptance | ledger row or rejection reason | a heading may be a note, limitation, no-issue rationale, or actual finding |
| Claim normalization | concise `claim` | requires compressing prose without changing meaning |
| Proposed action normalization | `proposed_action` | action may be implicit or distributed across prose |
| Affected purpose selection | `affected_purpose` | requires linking the finding to declared review purpose |
| Failure condition | `failure_condition` | requires user/environment/path/boundary interpretation |
| Impact statement | `impact` | requires trust/quality consequence reasoning |
| Severity assignment | `severity` | materiality is purpose-relative, not syntactic |
| Evidence sufficiency judgment | `info` downgrade or material severity | requires deciding whether cited text supports the claim |
| Unaddressable finding decision | validation entry | lack of stable anchor may be syntactic, but usability of evidence is semantic |
| Final source slug | `source_ref` slug such as `#p1-route-summary` | a stable semantic slug can be better than a repeated heading prefix, but it requires understanding the claim |

#### Candidate Artifact Shape

A future runtime pre-extraction artifact can be compact and internal:

```yaml
schema_version: 1
session_id: "{session_id}"
candidates:
  - candidate_id: "candidate-001"
    lens_id: "coverage"
    source_ref: "round1/coverage.md#candidate-001"
    source_path: "round1/coverage.md"
    line_start: 11
    line_end: 30
    candidate_kind: "finding_block"
    heading: "COV-1: Public output contract의 구체 범주가 누락됨"
    heading_level: 3
    heading_path: ["coverage", "Findings", "COV-1: Public output contract의 구체 범주가 누락됨"]
    detected_labels: ["What", "Why", "How to fix"]
    excerpt: |
      - What: ...
      - Why: ...
      - How to fix: ...
  - candidate_id: "candidate-002"
    lens_id: "logic"
    source_ref: "round1/logic.md#candidate-001"
    source_path: "round1/logic.md"
    line_start: 7
    line_end: 9
    candidate_kind: "no_finding_signal"
    heading: "Findings"
    heading_level: 2
    heading_path: ["Logic Review", "Findings"]
    detected_labels: []
    excerpt: "No logic findings."
validation:
  extraction_warnings: []
```

This markdown-extraction direction is rejected for the current path. The
current contract requires native sidecar rows; ambiguous or older markdown
outputs should fail loudly instead of being repaired by an extraction bridge.

#### First Implementation Candidate

Default next implementation candidate after the causal/materiality design update:

- Extend the sidecar-first path rather than investing first in markdown
  extraction.
- Add `materiality_basis` and `causal_path` to the sidecar schema and tool
  surface.
- Keep all findings recorded, but require causal path only for material
  candidates or explicit causal-analysis candidates.
- Change deterministic `finding-ledger` projection to preserve those fields and
  assign ledger-stable cause refs.
- Then redesign relation graph projection around causal-analysis ids.

Expected benefit: lower LLM input and output burden without losing non-material
surface findings, because the expensive causal work is requested only where it
can affect actionable material issue handling.

Markdown extraction is intentionally excluded from the optimized current path.
Text-only executors must use the markdown output contract instead of pretending
to satisfy the structured sidecar contract.

### Quality Guards

Any optimization must preserve:

- no loss of material findings
- no loss of recorded non-material surface findings
- stable `finding_id` values for downstream artifacts
- exact source lens provenance
- concrete evidence refs for material severities
- `info` classification for evidence gaps
- no root-cause clustering inside `finding-ledger`
- no forced root-cause tracing for clear non-material findings
- causal relation coverage only over findings with `causal_path` or explicit
  causal-analysis requirement
- no invented facts from outside Round 1 lens outputs and allowed context

### First Review Questions

1. Which parts of `finding-ledger` are deterministic enough to move into
   runtime?
2. Do current lens outputs already contain enough structure to parse candidate
   findings reliably?
3. Should the next tuning target be prompt/input compaction, lens schema
   tightening, or deterministic ledger assembly?
4. What semantic quality gate will prove that material issue recall did not
   regress?

## Stage 2: `finding-relation-graph`

### Current Seat

`finding-relation-graph` runs after `finding-ledger.yaml` exists and before
`issue-ledger.yaml`.

- Registry: `src/core-runtime/review/issue-artifact-runtime.ts`
- Prompt packet: `prompt-packets/finding-relation-graph.prompt.md`
- Output: `finding-relation-graph.yaml`
- Progress step: `finding_relation_graph`
- Execution owner: teamlead/runtime-assisted LLM issue-artifact builder
- Topology: serial; downstream issue ledger waits for it

### Input / Output Split

The durable source of surface-finding truth is now `finding-ledger.yaml`, not
Round 1 lens prose. This makes the first safe tuning step different from
`finding-ledger`:

- runtime should provide a compact relation projection from `finding-ledger.yaml`;
- the projection should include full nodes only for material findings that have
  `causal_path`; surface-only findings stay in `surface_only_finding_ids`;
- Round 1 lens outputs or sidecar source refs should remain bounded
  supplemental reads during the first tuning iteration, because relation
  rationale may need source details when the compact projection is insufficient;
- LLM should decide only semantic relationships between causal paths;
- runtime should validate relation coverage for the causal-analysis set, not for
  every recorded `low`/`info` surface finding.

Design target relation categories:

| Relation | Meaning |
|---|---|
| `same_root_candidate` | two causal paths share the same evidence-backed starting cause |
| `shared_cause_candidate` | two causal paths have different roots but share an intermediate cause |
| `causes` / `symptom_of` / `enables` | direct causal dependency between findings or cause nodes |
| `duplicates` / `conflicts_with` | same claim/action or conflicting claim/action/severity |

Unrelated causal-analysis findings are represented only through
`singleton_findings`, not through an `independent` relation row. This keeps the
relation list to accepted semantic links only and prevents N² "no relation"
output growth.

`shared_cause_candidate` is a deliberate concept split from
`same_root_candidate`: it preserves solution dependency without claiming that
two issues have the same root cause.

### Current Implementation Note

Implemented on 2026-06-05:

1. Added a runtime relation input projection:
   - `buildFindingRelationInputProjection`
   - `renderFindingRelationInputProjectionSection`
   - projection includes only ledger-derived finding node fields needed for
     relation judgment: finding id, lens id, source ref, target/evidence anchor
     when present, claim, proposed action, purpose/failure/impact, evidence
     refs, severity, and domain threshold.
2. Changed `finding-relation-graph` prompt materialization:
   - embeds the runtime projection in the prompt packet;
   - tells the LLM to read Round 1 source refs only when the compact projection
     lacks enough local context for a relation rationale;
   - asks for accepted semantic relations only, not every possible pair.
3. Reduced `finding-relation-graph` read authority:
   - keeps `review-target-profile.yaml` and `finding-ledger.yaml`;
   - admits bounded Round 1 sidecar/lens refs as supplemental reads instead of
     primary input.
4. Strengthened output validation:
   - rejects self-relations;
   - rejects singleton rows for findings already covered by accepted relations;
   - rejects missing coverage for any known finding id.
5. Updated the mock executor:
   - relation graph singleton rows are generated from the actual
     `finding-ledger.yaml` finding ids, so sidecar runs with multiple findings
     remain valid.

Implemented on 2026-06-06:

- removed `independent` from the active relation enum and prompt contract;
- validator now rejects `relation: independent` and requires unrelated
  causal-analysis findings to be represented through `singleton_findings`.
- `issue-ledger` validation now requires every relation-graph-covered finding
  to be assigned to exactly one issue, and multi-finding issue clusters must be
  connected by `same_root_candidate` relation refs. `singleton_findings` cannot
  be silently merged into a shared issue.
- `issue-ledger` prompt packets now exclude Round 1 lens output refs from read
  authority. The unit consumes only `review-target-profile.yaml`,
  `finding-ledger.yaml`, and `finding-relation-graph.yaml`.
- because `issue-ledger` no longer reads Round 1 directly, runtime validation
  now requires each issue's `evidence_refs` and `raised_by_lens_ids` to be
  projected from its assigned `finding-ledger.yaml` findings.

### Meaning Preservation

This slice does not ask runtime to decide relations. It only changes the input
surface and output completeness guarantees:

- relation semantics remain LLM-owned;
- root hypotheses, shared-cause hypotheses, and rationales remain LLM-owned;
- relation ids, known causal-analysis finding ids, singleton coverage for that
  causal set, and schema validity are runtime-validated;
- downstream `issue-ledger` now preserves cross-issue shared-cause dependencies
  and rejects same-issue merges that lack same-root relation evidence;
  issue evidence and lens provenance remain bound to the assigned
  `finding-ledger.yaml` rows;
  through `issue_dependencies` while leaving relation semantics LLM-owned.

### Next Tuning Questions

1. Should relation graph output move to a tool-submitted sidecar shape so
   relation ids and singleton coverage can be runtime-written rather than
   LLM-authored YAML?
2. Should runtime propose deterministic candidate pair hints from matching
   causal path node text/anchors, or would that risk suppressing cross-lens
   shared-cause relations?
3. Done for `issue-ledger`: it now consumes only relation graph + finding
   ledger artifacts and stops reading lens outputs. The next equivalent target
   is `issue-stance-matrix`.

Implemented for `issue-stance-matrix`:

- added a runtime issue-stance input projection derived from
  `finding-ledger.yaml`, `finding-relation-graph.yaml`, and
  `issue-ledger.yaml`;
- prompt packets embed the compact projection and tell the LLM to use it first;
- Round 1 lens refs remain bounded supplemental reads because lens-specific
  stance rationale can still require raw lens context;
- runtime validation rejects stances from non-participating lenses;
- stance `evidence_refs` are string-only and, on the real on-disk path, must
  stay within the issue/lens provenance set derived from issue refs, assigned
  finding refs, relation/dependency refs, and the stance lens's bounded Round 1
  ref.

Implemented for `deliberation-plan`:

- added a runtime deliberation-plan input projection derived from
  `issue-ledger.yaml`, `issue-stance-matrix.yaml`, and
  `finding-relation-graph.yaml`;
- projection records materiality, stance conflict signals, conflict type hints,
  suggested participant lens ids, and deterministic source stance refs;
- prompt packets use the compact projection first and no longer reopen Round 1
  lens outputs for this unit;
- canonical output shape now uses `priority`, `conflict_type`,
  `participating_lens_ids`, `source_stance_refs`, `conflict_summary`,
  `resolution_question`, and skipped `reason_code`;
- runtime validation rejects non-material planned issues, non-participating
  participants, source stance refs that do not exactly match participants,
  missing `reason_code`, duplicate issue coverage, and incomplete issue
  coverage.

Implemented for controlled deliberation:

1. Converted controlled deliberation from broad lens-round deliberation into
   issue-scoped response artifacts under `deliberation/responses/{issue_id}/{lens_id}.yaml`.
2. Dispatch now uses only the lens ids selected by `deliberation-plan.yaml`.
3. Runtime validates issue response artifacts, validates `deliberation-resolution.yaml`,
   renders `deliberation.md` as a projection, and records the resolution YAML as
   ReviewRecord `deliberation_result_ref`.

Implemented for `problem-framing`:

- added a compact runtime projection from `issue-ledger.yaml`,
  `issue-stance-matrix.yaml`, `deliberation-plan.yaml`,
  `deliberation-resolution.yaml`, `review-target-profile.yaml`, the
  domain-axis catalog, and bounded domain profile rules;
- raw Round 1 outputs, issue-scoped deliberation responses, and raw domain
  profile docs are excluded from default read authority;
- the LLM submits only semantic `classifications`;
- runtime fills `classification_context` and issue-ledger-derived
  `related_surface_finding_ids`;
- validation rejects exact surface-finding coverage drift, classification
  context drift, undeclared domain-axis names/values, and enum drift.

Implemented for `synthesize` / final output:

- replaced the broad final synthesize unit with issue-scoped
  `synthesis-work-items.yaml`, `synthesis/responses/{issue_id}.yaml`, and
  runtime-merged `synthesis-ledger.yaml`;
- `synthesis.md` and `final-output.md` are runtime-rendered projections from
  validated synthesis truth;
- `ReviewRecord.synthesis_result_ref` now points to `synthesis-ledger.yaml`;
- completed ReviewRecords carry independent terminal artifact digests for
  `synthesis-ledger.yaml`, `synthesis.md`, `deliberation-resolution.yaml`, and
  `final-output.md`, so mutable manifest co-tamper fails loud.

Current remaining work order:

1. Align active docs and implementation map.
2. Re-run latest benchmark and semantic quality gate. Completed for the
   post-map-reduce mock stability/I/O harness on 2026-06-07.
3. Expand semantic quality fixtures. Completed with `retry-policy-target-v1`
   fixture coverage on 2026-06-07.
4. Add `halted_partial` digest/null contract tests.
5. Run live provider smoke when credentials are intentionally available.
6. Decide optional downstream tuning items.

Canonical remaining-work tracker:

- `development-records/plans/20260607-review-pipeline-remaining-work-order.md`
