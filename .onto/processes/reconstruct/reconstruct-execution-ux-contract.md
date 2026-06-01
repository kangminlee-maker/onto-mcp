# Reconstruct Execution UX Contract

> Status: design contract.
> Purpose: define the user-visible reconstruct run experience without adding a
> separate UI implementation.

## 1. Position

`reconstruct` can take a long time because the host LLM must read source
observations, run reconstruct lens judgments, choose the next unjudged
source frontier, propose seed meaning, assess competency questions, and explain
unresolved gaps. The user-facing experience must therefore expose new
information as it is discovered, not only meta status such as "still running".

The runtime owns structured facts, stage ids, artifact refs, liveness hints, and
deterministic counts. The host LLM owns the short explanation shown to the user.

No standalone HTML, web UI, or dashboard is required for this contract. MCP and
CLI hosts should render the same information from runtime status/result payloads
and reconstruct artifacts.

## 2. Opening Brief

At run start, the host should show a compact opening brief before expensive
work begins.

The brief must include:

- environment: project root or declared source boundary, session root, and
  write policy
- method: MCP/runtime path, source profile, semantic author realization, and
  confirmation provider realization
- execution profile: observer/gate slice, full integral exploration, or a
  test/fixture-only profile if a non-product harness is running, with the
  completion claim allowed for that profile
- model/provider: provider family or realization label without secrets
- domain: selected domain, no-domain mode, or pending domain competency admission
- material: `target_material_kind`, target input kind, and unsupported-material
  status if known
- exploration loop: initial source frontier, round budget if any, and frontier
  validation policy
- reconstruction direction: what the reconstruct run will try to explain, and
  what it will treat as out of scope
- ownership boundary: runtime observes and validates; reconstruct lens judgments judge
  meaning and source gaps; the user or host confirmation controls seed
  acceptance
- skipped or deferred stages that already narrow downstream authority, such as
  live lens judgment, source-frontier exploration, domain competency admission,
  user confirmation, or competency-question assessment

The opening brief should be declarative. It should not ask the user to approve
internal implementation details unless the target boundary, domain, or write
policy is ambiguous.

## 3. Progress Presentation

Progress is stepwise and round-aware. Each update should include the current
`ReconstructStageId`, exploration round id when applicable, a short label, a
liveness state, and one or two newly learned facts.

Recommended update shape:

```text
[round 2 | stage source_frontier_validation] source_frontier
Status: running
Learned: coverage requested billing service tests and rejected one already-seen helper.
Next: observe 3 accepted source refs inside the declared project boundary.
```

Progress updates should prefer facts such as:

- material kind and profile confidence
- scanned roots and skipped boundaries
- initial source frontier artifact ref and first-observation source refs
- source inventory counts by material-specific unit
- exploration round count and new observation count by round
- selected observation count and evidence-candidate rationale
- per-lens judgment status and newly named semantic gaps
- source frontier refs requested, accepted, rejected, already observed,
  unsupported, or out of bounds
- domain competency admission refs and governing snapshot id
- seed layer count by object, actor, action, workflow, permission, and data
  binding
- candidate disposition count by disposition
- ontology-facing seed iteration readiness, canonical readiness projection, or
  limitation count
- confirmation state counts
- competency question count and assessment status counts
- failure classification counts
- revision proposal action counts
- unresolved, deferred, and out-of-scope counts
- current halt reason and reusable artifact refs when halted
- skipped/deferred stage reason and downstream authority impact

Progress updates should avoid pretending that intermediate semantic content is
final. Before seed confirmation, seed content is candidate content. Before
competency-question assessment and handoff validation, quality statements are
preliminary.

## 4. Decision Points

User-facing prompts are needed only when a decision changes the product result
or the allowed boundary.

Decision points:

- target boundary is ambiguous or would require reading outside the bound root
- material kind is unsupported or mixed in a way that changes adapter behavior
- source frontier expansion would exceed the declared boundary, adapter support,
  or round/cost budget
- domain competency admission changes the interpretation standard
- seed confirmation requires accepted, rejected, partial, or deferred state
- unresolved material questions require a final direction: continue, defer, or
  accept with disclosed limits

The host should phrase choices by outcome, not internal jargon.

## 5. Final Output

`final-output.md` must be decision-ready and artifact-tethered. It should
separate:

- confirmed Seed content
- candidate disposition summary
- competency question assessment summary
- material failures and unsafe-to-trust gaps
- revision proposals and action candidates
- unresolved, deferred, unsupported, or out-of-scope items
- artifact provenance: the owning ids and artifact refs behind the statements
- execution profile and completion scope: what actually ran, what was skipped,
  and which downstream authority claims are therefore narrowed

The final output is not the authority for truth. It is a user-facing projection
of `reconstruct-record.yaml`, `reconstruct-run-manifest.yaml`, and the
stage-owned artifacts.

Full integral exploration wording is allowed only when the run manifest records
the full profile and the required exploration, domain competency admission, Seed,
confirmation, competency-question, assessment, failure, revision, metrics,
handoff-validation, and final-output stages are trusted or explicitly skipped
with trusted reasons.

## 6. Halted Or Partial Runs

If a run halts, the output should still be useful:

- show the last completed stage id
- show which artifact refs are reusable
- show which stage failed and why
- show the strongest safe statement supported by completed artifacts
- show the latest accepted/rejected source frontier refs if the halt happened
  inside exploration
- avoid summarizing missing stages as if they ran
- show the execution profile and the exact completion claim still supported by
  trusted artifacts

A halted run may provide candidate Seed content only if the corresponding
artifact and validation refs exist. It may not imply seed confirmation, CQ
  assessment, failure classification, revision proposal, terminal seed iteration readiness, or
final ontology direction unless those artifacts exist.

## 7. Runtime Payload Expectations

Future status/result payloads should expose enough facts for the host LLM to
render this contract without scraping prose:

- execution profile and allowed completion claim
- current stage id and total planned stage count
- current exploration round id, round state, and round budget if any
- stage state: pending, running, completed, skipped, or halted
- skipped/deferred stage reason and `authority_impact`
- stage artifact refs and owner
- liveness state and recommended polling interval
- deterministic count summaries from the latest completed artifacts
- latest source frontier summary and reusable trusted observation refs
- initial source frontier artifact ref
- unresolved/deferred/out-of-scope summaries
- opening, progress, halt, and final presentation prompts or facts

The payload may be compact. It should expose bounded facts and artifact refs,
not duplicate semantic authority.
