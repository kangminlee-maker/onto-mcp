# Reconstruct Execution UX Contract

> Status: design contract.
> Purpose: define the user-visible reconstruct run experience without adding a
> separate UI implementation.

## 1. Position

`reconstruct` can take a long time because the host LLM must read source
observations, choose evidence, propose Seed meaning, assess competency questions,
and explain unresolved gaps. The user-facing experience must therefore expose
new information as it is discovered, not only meta status such as "still
running".

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
- model/provider: provider family or realization label without secrets
- domain: selected domain, no-domain mode, or pending domain-context selection
- material: `target_material_kind`, target input kind, and unsupported-material
  status if known
- reconstruction direction: what the reconstruct run will try to explain, and
  what it will treat as out of scope
- ownership boundary: runtime observes and validates; the host LLM proposes
  meaning; the user or host confirmation controls Seed acceptance

The opening brief should be declarative. It should not ask the user to approve
internal implementation details unless the target boundary, domain, or write
policy is ambiguous.

## 3. Progress Presentation

Progress is stepwise. Each update should include the current
`ReconstructStageId`, a short label, a liveness state, and one or two newly
learned facts.

Recommended update shape:

```text
[stage 6/26] source_observation
Status: running
Learned: 38 source observations across routes, components, and API helpers.
Next: select evidence-bearing observations for the Seed candidate.
```

Progress updates should prefer facts such as:

- material kind and profile confidence
- scanned roots and skipped boundaries
- source inventory counts by material-specific unit
- selected observation count and evidence-candidate rationale
- domain context refs and snapshot id
- Seed claim count by entity, relation, action, property, and rule
- claim realization stance counts
- confirmation state counts
- competency question count and assessment status counts
- failure classification counts
- revision proposal action counts
- unresolved, deferred, and out-of-scope counts
- current halt reason and reusable artifact refs when halted

Progress updates should avoid pretending that intermediate semantic claims are
final. Before Seed confirmation, claims are candidates. Before competency
question assessment, quality statements are preliminary.

## 4. Decision Points

User-facing prompts are needed only when a decision changes the product result
or the allowed boundary.

Decision points:

- target boundary is ambiguous or would require reading outside the bound root
- material kind is unsupported or mixed in a way that changes adapter behavior
- domain context selection changes the interpretation standard
- Seed claim confirmation requires accepted, rejected, partial, or deferred
  state
- unresolved material questions require a final direction: continue, defer, or
  accept with disclosed limits

The host should phrase choices by outcome, not internal jargon.

## 5. Final Output

`final-output.md` must be decision-ready and artifact-tethered. It should
separate:

- confirmed Seed content
- claim realization summary
- competency question assessment summary
- material failures and unsafe-to-trust gaps
- revision proposals and action candidates
- unresolved, deferred, unsupported, or out-of-scope items
- artifact provenance: the owning ids and artifact refs behind the statements

The final output is not the authority for truth. It is a user-facing projection
of `reconstruct-record.yaml`, `reconstruct-run-manifest.yaml`, and the
stage-owned artifacts.

## 6. Halted Or Partial Runs

If a run halts, the output should still be useful:

- show the last completed stage id
- show which artifact refs are reusable
- show which stage failed and why
- show the strongest safe statement supported by completed artifacts
- avoid summarizing missing stages as if they ran

A halted run may provide candidate Seed content only if the corresponding
artifact and validation refs exist. It may not imply Seed confirmation, CQ
assessment, failure classification, revision proposal, stop decision, or final
ontology direction unless those artifacts exist.

## 7. Runtime Payload Expectations

Future status/result payloads should expose enough facts for the host LLM to
render this contract without scraping prose:

- current stage id and total planned stage count
- stage state: pending, running, completed, skipped, or halted
- stage artifact refs and owner
- liveness state and recommended polling interval
- deterministic count summaries from the latest completed artifacts
- unresolved/deferred/out-of-scope summaries
- opening, progress, halt, and final presentation prompts or facts

The payload may be compact. It should expose bounded facts and artifact refs,
not duplicate semantic authority.
