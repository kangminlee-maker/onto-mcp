# Review Target Profile Handoff

> Status: handoff for a future design session
> Scope: general review target profiling, artifact role, domain adjustment, and closure obligation
> Created: 2026-05-23

## 1. Why This Exists

During review-runtime planning, we found that review quality depends on knowing
what kind of target is being reviewed.

The immediate trigger was a design-plan review. The review correctly found
contract gaps, but it also raised a meta-question:

- Which gaps must be closed inside the reviewed artifact?
- Which gaps may be closed during implementation?
- Which gaps should be carried forward or ignored because they are outside the
  current target's obligation?

This is not specific to design documents. `onto review` must support many kinds
of artifacts: spreadsheets, accounting records, domain docs, novels, contracts,
runtime code, MCP tools, review records, dashboards, and partial handoffs.

The future design task is to make review target profiling explicit before lens
execution.

## 2. Key Decision

Review should not evaluate every target as a complete closed system.

Instead, review should first create a target profile:

```yaml
review_target_profile:
  artifact_roles:
    primary: computational_artifact
    secondary:
      - data_artifact
      - record_artifact
  domain: accounting
  maturity: review_candidate
  closure_level: bounded_partial
  review_goal:
    - correctness
    - auditability
    - domain_compliance
  closure_expectations:
    must_be_closed:
      - formula correctness
      - source data lineage
      - required field completeness
      - audit trail
    may_remain_open:
      - optional commentary
      - visual styling
    intentionally_open:
      - management interpretation
  closure_obligation_policy:
    - must_close_in_target
    - must_close_before_next_stage
    - may_close_during_next_stage
    - planned_later
    - out_of_scope
```

Lens review should use this target profile to decide whether a discovered issue
is actually a problem for this review.

## 3. General Artifact Roles

Artifact roles should be role-based, not medium-based. A `.docx` file, a
spreadsheet, or a code repository can each play multiple roles.

Proposed general roles:

| Role | Examples | Primary review question |
|---|---|---|
| `knowledge_artifact` | domain docs, research notes, manuals | Are facts, concepts, and relations accurate and sufficient? |
| `decision_artifact` | decision memo, policy, principle | Are the judgment criteria and choice coherent and actionable? |
| `procedural_artifact` | checklist, SOP, workflow | Can a user follow it and reproduce the intended result? |
| `computational_artifact` | code, spreadsheet model, formula workbook | Is calculation or behavior correct and verifiable? |
| `record_artifact` | meeting minutes, audit record, review result | Does it preserve events, evidence, provenance, and source truth? |
| `contract_artifact` | API schema, legal contract, work agreement | Are authority, obligations, exceptions, and failure conditions clear? |
| `creative_artifact` | novel, screenplay, worldbuilding notes | Does it preserve intended experience, tone, structure, and internal coherence? |
| `presentation_artifact` | slide deck, report, dashboard | Can the intended audience understand and decide correctly? |
| `data_artifact` | CSV, ledger, experiment data | Is the data complete, consistent, and interpretable for purpose? |
| `configuration_artifact` | settings file, rules table, template | Are scope, precedence, defaults, and invalid inputs clear? |

Targets can have a primary role and secondary roles.

Examples:

```yaml
# Spreadsheet-based accounting document
artifact_roles:
  primary: computational_artifact
  secondary:
    - data_artifact
    - record_artifact
    - contract_artifact
domain: accounting
```

```yaml
# Novel written as docs
artifact_roles:
  primary: creative_artifact
  secondary:
    - knowledge_artifact
    - presentation_artifact
domain: fiction
```

## 4. Domain Adjustment

The common artifact role gives the broad review frame. The domain supplies
specific closure expectations and evaluation criteria.

Example: `computational_artifact`

| Domain | Must be closed |
|---|---|
| `accounting` | formula correctness, audit trail, account classification, source lineage |
| `finance` | assumptions, sensitivity, risk, model validation |
| `software-engineering` | runtime behavior, tests, error paths, API contract |
| `market-intelligence` | source quality, freshness, segment definitions, inference basis |

Example: `creative_artifact`

| Domain | Review emphasis |
|---|---|
| `fiction` | plot, character, viewpoint, tone, emotional arc |
| `brand` | brand voice, message consistency, user action |
| `education` | learning goal, level fit, concept clarity |

Decision:

```text
common artifact-role profile + domain-specific closure rules + optional domain lens
```

Domain should usually adjust lens criteria rather than replace the core 8+1 lens
structure. Optional domain-specific lenses may be added later.

## 5. Open Versus Closed Review

Closed-system review:

- The boundary is explicit.
- The target is expected to be internally complete.
- The review looks for incorrect, missing, inconsistent, unsafe, or unverified
  elements inside that boundary.

Open/partial-system review:

- The boundary is partial or intentionally evolving.
- The target is not expected to solve every downstream problem.
- The review checks whether the target has closed what it must close for its
  maturity and next-stage obligation.

General rule:

```text
Review does not ask whether every possible issue is solved.
Review asks whether this target has closed the issues it is obligated to close
for its artifact role, domain, maturity, closure level, and next stage.
```

## 6. Closure Obligation

Future review issue classification should add a closure-obligation axis.

Proposed values:

- `must_close_in_target`
- `must_close_before_next_stage`
- `may_close_during_next_stage`
- `planned_later`
- `out_of_scope`

This is distinct from severity and timing.

For example:

- A design plan may need to close `authority owner` before implementation.
- The same design plan may leave exact TypeScript helper names to
  implementation.
- A spreadsheet workbook must close formula correctness before use.
- A novel may intentionally leave interpretation open, while still needing
  character continuity to be coherent.

## 7. Review Preparation Flow

Future runtime direction:

1. Interpret the target.
2. Infer or ask for artifact roles.
3. Apply domain-specific closure rules.
4. Determine maturity and closure level.
5. Produce `review_target_profile`.
6. Include the profile in the review context manifest or a pre-manifest artifact.
7. Dispatch lenses with the profile.
8. Classify findings using severity, timing, closure class, and closure
   obligation.

Possible artifact:

```yaml
review_target_profile:
  schema_version: 1
  target_refs: []
  artifact_roles:
    primary: creative_artifact
    secondary: [knowledge_artifact]
  domain: fiction
  maturity: draft
  closure_level: open_exploratory
  review_goal: [coherence, narrative_effectiveness]
  closure_expectations:
    must_be_closed: []
    may_remain_open: []
    intentionally_open: []
  domain_adjustments_ref: []
```

## 8. Relation To Current Review Runtime Plan

This topic is important but should not block the current review-runtime
implementation slice.

The current implementation slice should continue with:

- retired input boundary
- pre-manifest contract closure
- actor invocation profile
- actor/consumer binding
- domain binding
- review value-alignment criteria
- context manifest
- MCP execution contract

Future target profiling can be inserted as a pre-manifest contract after the
basic review runtime is stable.

## 9. Next Session Starting Point

Start from these questions:

1. What canonical artifact roles should onto support initially?
2. Should artifact role inference be LLM-owned, runtime-owned, or a hybrid
   interpretation/binding flow?
3. Where should `review_target_profile` live: interpretation, binding,
   execution preparation, or context manifest?
4. How should domain docs define closure expectations per artifact role?
5. Should closure obligation be added to `problem-framing.yaml`, `issue-ledger`,
   or both?
6. What happens when the user disagrees with inferred artifact role or closure
   expectation?

Recommended first implementation later:

- add a small `review_target_profile` schema;
- support explicit user override through MCP;
- infer primary/secondary roles in interpretation;
- bind confirmed roles in runtime;
- add `closure_obligation` to problem framing.
