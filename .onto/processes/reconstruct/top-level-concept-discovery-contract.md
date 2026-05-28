# Reconstruct Top-Level Concept Discovery Contract

> Status: design contract.
> Purpose: define how `reconstruct` discovers purpose-relative top-level
> concepts for an ontology Seed without turning the Seed into a broad claim
> ledger or a full ontology draft.

## 1. Position

`reconstruct` Seed generation is a top-level concept discovery process.

The Seed is not the full ontology. It is not a complete list of entities,
relations, actions, properties, rules, implementation details, or all possible
evidence-backed claims. Its purpose is to identify the smallest stable set of
top-level concepts that explains the declared purpose of the target material,
with explicit boundaries, evidence, open questions, and deferred lower-level
details.

Top-level concepts are purpose-relative. They are not the highest possible
abstractions in a universal hierarchy. A concept is top-level for a reconstruct
run when it is the most useful stable axis for explaining the declared purpose
from the observed source evidence.

Example:

```text
RawIngestEvent
-> Usage Event
-> Usage Activity
-> User Behavior
-> Organizational Knowledge Flow
```

For an AI usage dashboard Seed, `Usage Event` may be a top-level concept while
`Organizational Knowledge Flow` is too abstract and `RawIngestEvent` is usually
a lower-level implementation detail.

## 2. Ownership Boundary

Runtime owns material-aware observation, source inventories, artifact refs,
validation gates, deterministic metrics, and source frontier boundary checks.

The host LLM owns semantic grouping, abstraction-level judgment, top-level
concept naming, boundary explanation, relation interpretation, convergence
interpretation, and final user-facing explanation.

Runtime must not decide that a source symbol, spreadsheet range, document
section, database table, UI component, or service method is a top-level concept.
Runtime may validate that LLM-authored top-level concept artifacts cite known
evidence refs and preserve declared artifact shape.

## 3. Design-Local Terms

These names are design-contract terms until promoted through the concept
registration gate in `reconstruct-boundary-contract.md`.

| Term | Seat | Meaning |
|---|---|---|
| `TopLevelConcept` | reconstruct-local semantic artifact candidate | Purpose-relative concept that explains multiple lower-level observations and remains stable across likely implementation changes. |
| `TopLevelConceptSet` | reconstruct-local semantic artifact candidate | Small selected set of top-level concepts for the declared purpose. |
| `LowerLevelDetail` | design shorthand | Source-specific field, method, component, rule, property, table, sheet, or claim that should support a top-level concept rather than become the Seed center. |
| `TopLevelnessPressure` | design shorthand | Unresolved reason that may change the selected concept set, concept boundary, or core relation. |
| `ConceptConvergence` | design shorthand | State where further source exploration is expected to refine evidence or details rather than materially change the top-level concept set, boundaries, or core relations. |

Do not introduce these names as TypeScript types, MCP fields, public artifact
fields, or enum values before the concept registration gate is explicitly
closed.

## 4. Discovery Strategy

Top-level concept discovery uses bottom-up observation, top-down purpose
constraint, and graph compression.

The process is not "keep climbing the hierarchy." It alternates between lifting
source details into candidate concepts and grounding those candidates back into
the declared purpose and observed evidence.

```text
material-aware source observations
-> local semantic labels and gaps
-> candidate concept clusters
-> abstraction-level tests
-> top-level concept set
-> source frontier aligned to unresolved top-levelness pressure
-> convergence assessment
```

### 4.1 Collect Local Candidates

The first semantic pass may name many local candidates from files, symbols,
tables, fields, formulas, headings, UI components, services, actions, states,
rules, and document claims. This pass should avoid deciding top-level status too
early.

Local candidates are evidence-bearing raw material for clustering. They are not
Seed output by default.

### 4.2 Cluster By Purpose Role

Local candidates should be clustered by the role they play in explaining the
declared purpose:

- shared lifecycle
- shared user-facing meaning
- shared source flow
- shared ownership or authority
- shared change fate
- repeated co-occurrence across material slices
- ability to explain multiple lower-level observations

Example for an AI usage dashboard:

| Local candidates | Candidate top-level concept |
|---|---|
| session row, session metrics, session context, session classification | `Usage Session` |
| raw payload, ingest event, fingerprint, deduplication status | `Usage Event` |
| billing aggregate, cost KPI, token cost, provider cost | `Usage Cost` |
| page, KPI cards, session table, analytics summary | `Dashboard View` |

### 4.3 Test Abstraction Level

Each candidate must pass both upward and downward tests.

Upward test:

- Does this candidate explain multiple lower-level observations?
- Does it survive likely implementation changes?
- Is it necessary to explain the declared purpose?
- Can a user understand it without reading implementation names?

Downward test:

- Is it still grounded in concrete evidence?
- Does it avoid becoming a generic business abstraction?
- Does it preserve enough boundary detail to guide later ontology work?
- Does it avoid hiding materially different concepts that must be split?

The target is the stable middle level that explains the purpose, not the most
abstract reachable parent.

### 4.4 Select A Small Concept Set

The Seed should prefer a compact top-level concept set. The normal target range
is small enough for a user to inspect in one pass, usually 3-7 concepts for a
bounded product slice.

The concept set may be larger when the declared purpose or target bundle is
explicitly broad, but growth must be justified by purpose coverage, not by
implementation surface area.

### 4.5 Demote Lower-Level Detail

Implementation details, fields, service methods, UI widgets, spreadsheet cells,
schema columns, narrow rules, and action-level claims should be demoted unless
they independently satisfy the top-level tests.

Demotion does not discard evidence. The detail should be attached to one of:

- `included_lower_concepts`
- `supporting_evidence`
- `deferred_detail_candidates`
- `open_questions`
- `boundary_notes`

## 5. Top-Levelness Criteria

A top-level concept candidate is strong when it satisfies most of the criteria
below.

| Criterion | Question |
|---|---|
| Purpose criticality | Would the declared purpose become hard to explain without this concept? |
| Explanatory compression | Does it explain multiple lower-level observations without losing important distinctions? |
| Boundary clarity | Can the run state what belongs under this concept and what is excluded or deferred? |
| Relation centrality | Does it participate in core relations with other selected concepts? |
| Material grounding | Is it supported by concrete source observations from the current material boundary? |
| User-facing intelligibility | Can the concept be named in service language, not only implementation language? |
| Evolution stability | Would the concept likely survive refactors, UI rewrites, schema reshaping, or source-format changes? |
| Split pressure | Is there no unresolved material reason to split it now? |
| Merge pressure | Is there no unresolved material reason to merge it with another selected concept now? |

No single criterion is sufficient. Frequent source mentions or central code
location do not by themselves make a concept top-level.

## 6. Source Frontier Alignment

Source frontier selection must align to top-level concept convergence.

The frontier should not ask "what else can be read?" It should ask "what source
could materially change the selected top-level concept set, concept boundaries,
core relations, or convergence confidence?"

Each LLM-authored frontier ref should carry the decision pressure it is meant
to resolve.

Recommended semantic payload:

```yaml
frontier_refs:
  - source_ref: src/services/usage-mart.service.ts
    frontier_question: Is UsageMart a top-level concept or a lower-level read model under Usage Cost or Dashboard View?
    target_concepts:
      - Usage Cost
      - Dashboard View
      - Usage Mart
    pressure_type: split_or_demote
    expected_decision_impact: May demote UsageMart from top-level concept to supporting detail.
    priority: high
```

The exact public artifact field names remain subject to the registration gate.
Until then, runtime may preserve this information inside existing rationale
fields or design-local prompt payloads.

Valid frontier pressure categories:

| Pressure | Use when |
|---|---|
| `missing_axis` | The declared purpose may require a top-level concept not yet represented. |
| `split_or_merge` | Two candidates may be the same concept, or one candidate may hide two materially different concepts. |
| `boundary` | The concept's included and excluded lower-level details are unclear. |
| `core_relation` | The relation between selected concepts may be wrong or incomplete. |
| `abstraction_level` | A candidate may be too implementation-specific or too generic. |
| `evidence_saturation` | The run needs to know whether additional source will introduce new top-level concepts or only reinforce existing ones. |

Frontier requests that only gather lower-level implementation detail are valid
only when that detail can resolve one of these pressures.

## 7. Convergence Conditions

Top-level concept discovery converges when further source exploration is
expected to refine evidence, properties, rules, or lower-level details, but is
not expected to materially change the selected top-level concept set, each
concept's boundary, or the core relations between concepts for the declared
purpose.

Convergence is not the absence of all issues. It is a bounded claim about the
stability of the top-level concept set.

The run may report one of three convergence states:

| State | Meaning | Typical next action |
|---|---|---|
| `not_converged` | Top-level concept candidates, boundaries, or relations are still changing materially. | Continue source frontier exploration. |
| `provisionally_converged` | The main concept set is stable, but some split, merge, boundary, or deferred-detail questions remain. | Present Seed with disclosed limits and revision proposals. |
| `converged_for_seed` | Purpose coverage, concept boundaries, and core relations are stable enough for Seed handoff. | Present Seed as the current top-level concept discovery result. |

Signals for convergence:

- selected concept set is stable across the latest exploration round
- new observations map into existing concepts rather than creating new top-level
  concepts
- remaining issues concern evidence depth, properties, rules, or lower-level
  details
- no lens raises a material objection that a selected concept is too broad, too
  narrow, too generic, too implementation-specific, missing, or duplicated
- next frontier value is expected to improve confidence rather than change the
  concept set

Signals against convergence:

- a new source slice introduces a previously missing purpose axis
- selected concepts repeatedly require split or merge
- relation direction between selected concepts changes
- a selected concept cannot state included and excluded detail
- a concept is only a code artifact, UI widget, schema artifact, spreadsheet
  range, or document section with no purpose-level role
- the concept set explains source structure but not the declared purpose

## 8. Seed Output Shape

The Seed should center top-level concepts. Current artifacts may continue to use
existing Seed claim fields while the contract migrates, but the semantic shape
should project to:

```yaml
purpose:
  claim_id:
  name:
  statement:
  evidence_refs:
top_level_concepts:
  - concept_id:
    name:
    definition:
    why_top_level:
    evidence_refs:
    included_lower_concepts:
    excluded_or_deferred_details:
    core_relations:
    open_questions:
    confidence:
top_level_relations:
  - relation_id:
    source_concept_id:
    target_concept_id:
    relation:
    statement:
    evidence_refs:
deferred_detail_candidates:
  - name:
    belongs_to_concept_id:
    reason_deferred:
    evidence_refs:
convergence:
  state:
  rationale:
  remaining_pressures:
```

If existing `entities`, `relations`, `actions`, `properties`, and `rules`
fields are used before schema migration, they must be interpreted narrowly:

- `entities` should contain only top-level concept candidates or explicitly
  marked provisional top-level entities.
- `relations` should contain only relations between top-level concepts.
- `actions`, `properties`, and `rules` should be sparse and limited to
  purpose-level facts that affect top-level concept boundaries or relations.
- lower-level actions, properties, rules, fields, methods, UI elements, and
  schema details should move to deferred detail or supporting notes.

## 9. Lens Responsibilities

Reconstruct lenses should evaluate top-level concept discovery rather than
merely collecting claim improvements.

| Lens | Discovery question |
|---|---|
| semantics | Are the concept names and definitions meaningfully distinct and grounded? |
| structure | Is the concept set neither over-split nor over-merged? |
| dependency | Do selected concepts have stable dependency and flow relations? |
| pragmatics | Can target users understand and act on this concept set? |
| evolution | Will the concepts survive likely implementation and material changes? |
| coverage | Does the set cover the declared purpose without missing a major axis? |
| logic | Are relations and boundaries coherent and non-contradictory? |
| conciseness | Is the Seed compact enough to serve as a Seed rather than a full ontology? |
| axiology | Does the concept set preserve what matters for trust, value, and declared purpose? |

Lens disagreement should be represented as split, merge, boundary, abstraction,
or missing-axis pressure when it can affect top-level convergence.

## 10. Validation Expectations

Runtime validation should remain deterministic. It can validate:

- artifact shape
- required fields
- known evidence refs
- duplicate ids
- relation endpoints referencing known top-level concepts
- every top-level concept having at least one evidence ref
- every top-level concept having a boundary statement
- convergence state being one of the allowed values once promoted

Runtime should not validate semantic truth such as whether `Usage Session` is
really the right top-level concept. That remains LLM-authored and lens-reviewed.

## 11. Non-Goals

This contract does not require:

- a full ontology graph
- exhaustive entity extraction
- automatic semantic repair by runtime
- a universal hierarchy of concepts
- reading every source file
- turning every source detail into a Seed claim
- declaring lower-level implementation details final

## 12. Implementation Path

Recommended implementation order:

1. Update the Seed author prompt to make top-level concept discovery the primary
   objective.
2. Add compact prompt payloads that pass candidate labels, gaps, evidence ids,
   and unresolved top-levelness pressure rather than full artifacts.
3. Add a design-local top-level concept projection in final output before
   changing public schema.
4. Add Seed validation checks for required `name`, boundary, evidence, compact
   concept set, and relation endpoints.
5. Add frontier rationale fields or prompt requirements that align every
   source frontier request to top-level concept pressure.
6. Add convergence projection to metrics and final output.
7. Promote stable names through `.onto/authority/core-lexicon.yaml` only after
   the artifact shape has stabilized.

