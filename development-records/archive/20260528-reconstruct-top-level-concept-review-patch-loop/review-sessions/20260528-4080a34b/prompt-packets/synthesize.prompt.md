# Review Synthesize Prompt Packet

session_id: 20260528-4080a34b
execution_realization: worker
host_runtime: codex
review_mode: full
session_domain: software-engineering
output_path: .onto/review/20260528-4080a34b/synthesis.md
request_summary: Fresh verification review for the current reconstruct top-level concept discovery design patch after closing material issues from sessions 20260528-391bbc3f, 20260528-da9e31db, 20260528-3d59d774, 20260528-29cea5a1, 20260528-e8c8b240, 20260528-e6edefdf, 20260528-6dffeec8, 20260528-03960a26, and 20260528-d4633121. Confirm whether material documentation/design-contract issues remain in the current working tree diff, especially concept_identity_events and relation_identity_events as the sole lifecycle transition authority, absence of prior_concept_mappings/prior_relation_mappings from Seed lifecycle authority, absence of undefined current_detail_ids or any alternate demotion bridge field, absence of generic concept_ids/relation_ids inside identity event schemas, concept_identity_events[].target_detail_ids as the sole demotion bridge from prior concept IDs to lower_level_detail_placements[].detail_id, detail_placement_events not carrying prior concept lineage, answerability question ID uniqueness by declared inventory and status buckets, supported_actions[].supported_by_question_ids[] as the sole canonical question-to-action support edge, lifecycle.source_snapshot_refs as current source snapshot authority with source_snapshot_transition containing prior refs only, relation_participation_exceptions.status collapsed to isolated, external migration artifact refs, simplified README and IMPLEMENTATION_MAP authority-reference summaries, source_authority_scope_changed state traceability, lifecycle split/merge continuity through identity event arrays, pressure transitions using a single pressure_id authority without pressure_ids/current_pressure_id overlap, relation axis derived only from relation_kind table without stored relation_axis, and answerability references.

## Canonical Role
You are synthesize.
You are not an independent review lens.
You must preserve lens evidence and must not invent new independent perspectives.

## Required Artifact Inputs
- materialized input: .onto/review/20260528-4080a34b/execution-preparation/materialized-input.md
- interpretation: .onto/review/20260528-4080a34b/interpretation.yaml
- binding: .onto/review/20260528-4080a34b/binding.yaml
- review target profile: .onto/review/20260528-4080a34b/execution-preparation/review-target-profile.yaml
- review context manifest: .onto/review/20260528-4080a34b/execution-preparation/review-context-manifest.yaml
- finding ledger: .onto/review/20260528-4080a34b/finding-ledger.yaml
- finding relation graph: .onto/review/20260528-4080a34b/finding-relation-graph.yaml
- issue ledger: .onto/review/20260528-4080a34b/issue-ledger.yaml
- issue stance matrix: .onto/review/20260528-4080a34b/issue-stance-matrix.yaml
- deliberation plan: .onto/review/20260528-4080a34b/deliberation-plan.yaml
- controlled lens deliberation result: .onto/review/20260528-4080a34b/deliberation.md
- problem framing: .onto/review/20260528-4080a34b/problem-framing.yaml

## Optional Context Inputs
- session metadata: .onto/review/20260528-4080a34b/session-metadata.yaml
- target snapshot: .onto/review/20260528-4080a34b/execution-preparation/target-snapshot.md
- context candidate assembly: .onto/review/20260528-4080a34b/execution-preparation/context-candidate-assembly.yaml
- domain binding: .onto/review/20260528-4080a34b/execution-preparation/domain-binding.yaml
- review value-alignment criteria: .onto/review/20260528-4080a34b/execution-preparation/review-value-alignment-criteria.yaml
- consumer id: synthesize
- allowed context source ids: context-candidate-assembly, materialized-input, review-target-profile, review-value-alignment-criteria, target-snapshot

## Boundary Policy
- web research: denied
- repo exploration: allowed
- recursive reference expansion: denied
- filesystem allowed roots:
  - .
- source mutation: denied
- allowed output refs:
  - .onto/review/20260528-4080a34b/round1/logic.md
  - .onto/review/20260528-4080a34b/round1/structure.md
  - .onto/review/20260528-4080a34b/round1/dependency.md
  - .onto/review/20260528-4080a34b/round1/semantics.md
  - .onto/review/20260528-4080a34b/round1/pragmatics.md
  - .onto/review/20260528-4080a34b/round1/evolution.md
  - .onto/review/20260528-4080a34b/round1/coverage.md
  - .onto/review/20260528-4080a34b/round1/conciseness.md
  - .onto/review/20260528-4080a34b/round1/axiology.md
  - .onto/review/20260528-4080a34b/deliberation/round1/logic-deliberation.md
  - .onto/review/20260528-4080a34b/deliberation/round1/structure-deliberation.md
  - .onto/review/20260528-4080a34b/deliberation/round1/dependency-deliberation.md
  - .onto/review/20260528-4080a34b/deliberation/round1/semantics-deliberation.md
  - .onto/review/20260528-4080a34b/deliberation/round1/pragmatics-deliberation.md
  - .onto/review/20260528-4080a34b/deliberation/round1/evolution-deliberation.md
  - .onto/review/20260528-4080a34b/deliberation/round1/coverage-deliberation.md
  - .onto/review/20260528-4080a34b/deliberation/round1/conciseness-deliberation.md
  - .onto/review/20260528-4080a34b/deliberation/round1/axiology-deliberation.md
  - .onto/review/20260528-4080a34b/finding-ledger.yaml
  - .onto/review/20260528-4080a34b/finding-relation-graph.yaml
  - .onto/review/20260528-4080a34b/issue-ledger.yaml
  - .onto/review/20260528-4080a34b/issue-stance-matrix.yaml
  - .onto/review/20260528-4080a34b/deliberation-plan.yaml
  - .onto/review/20260528-4080a34b/problem-framing.yaml
  - .onto/review/20260528-4080a34b/lens-completion-barrier.yaml
  - .onto/review/20260528-4080a34b/synthesis.md
  - .onto/review/20260528-4080a34b/deliberation.md
- extra exploration citation required: true
- web source citation required: true
- tools: required

## Boundary Enforcement Profile
- prompt: prompt_declared_only
- filesystem: prompt_declared_only
- network: prompt_declared_only
- write: prompt_declared_only

## Effective Boundary State
- web research: requested=denied, effective=denied, guarantee=prompt_declared_only
- repo exploration: requested=allowed, effective=allowed, guarantee=prompt_declared_only
- recursive reference expansion: requested=denied, effective=denied, guarantee=prompt_declared_only
- source mutation: requested=denied, effective=denied, guarantee=prompt_declared_only
- filesystem effective allowed roots:
  - .
- filesystem guarantee: prompt_declared_only

## Participating Lens Outputs
- logic: .onto/review/20260528-4080a34b/round1/logic.md
- structure: .onto/review/20260528-4080a34b/round1/structure.md
- dependency: .onto/review/20260528-4080a34b/round1/dependency.md
- semantics: .onto/review/20260528-4080a34b/round1/semantics.md
- pragmatics: .onto/review/20260528-4080a34b/round1/pragmatics.md
- evolution: .onto/review/20260528-4080a34b/round1/evolution.md
- coverage: .onto/review/20260528-4080a34b/round1/coverage.md
- conciseness: .onto/review/20260528-4080a34b/round1/conciseness.md
- axiology: .onto/review/20260528-4080a34b/round1/axiology.md

## Execution Directives
- Read the materialized input first, then all participating lens outputs.
- Read all issue-stance closure artifacts before writing final classification.
- Read the controlled lens deliberation result before classifying or rendering disagreements.
- Preserve issue IDs, root hypotheses, common spine values, and domain axes from the issue-stance closure artifacts.
- Prefer the smallest sufficient set of files.
- Only read optional context inputs if the materialized input and lens outputs are not enough.
- Do not recursively chase additional document links or reference chains found inside the target text or lens outputs.
- Preserve consensus, axiology-proposed additional perspectives, and overlooked premises.
- Do not invent New Perspectives yourself.
- You are not the deliberation actor. Controlled lens deliberation already ran before this step and wrote the authoritative deliberation result.
- You are not the problem-framing actor. problem-framing.yaml already classified issue role, judgment state, impact kind, timing, closure, and domain axes.
- Do not resolve disagreements that the controlled deliberation result preserved as unresolved.
- Do not override a controlled deliberation decision unless the result contradicts an explicit cited artifact; in that case preserve the contradiction in Disagreement instead of silently choosing a new answer.
- In Final Review Result, comprehensively explain what the principal should conclude from the full bounded artifact set: review target and boundary, issue/root-cause clusters, lens agreement and disagreement, controlled deliberation outcome, problem framing classification, closure/timing, and the practical next step. Ground this explanation in existing lens outputs and issue artifacts; do not introduce new independent findings.
- Start the output with YAML frontmatter using this exact field:
  - `deliberation_status: performed`
  - Use `performed` because controlled lens deliberation is a required pre-synthesize stage.
- Write your result to: .onto/review/20260528-4080a34b/synthesis.md

## Required Output Sections
Use exactly these heading names in your output. The downstream renderer extracts sections by exact heading match. Do not add numbering prefixes, suffixes, or rename these headings.

```
## Consensus
## Conditional Consensus
## Disagreement
## Deliberation Decision
## Axiology-Proposed Additional Perspectives
## Purpose Alignment Verification
## Final Review Result
## Immediate Actions Required
## Recommendations
## Unique Finding Tagging
```

The Deliberation Decision section records, per contested point, the resolution produced by the controlled lens deliberation result. If that result preserved an unresolved disagreement, preserve it here with the reason.

## Tagging Completeness Rule
Every finding from the participating lens outputs must be accounted for in exactly one of these four classification sections: Consensus, Conditional Consensus, Disagreement, or Unique Finding Tagging. A finding may additionally appear in other sections (Recommendations, Immediate Actions, etc.), but it must have a primary classification in one of the four. If a finding is part of a cross-lens consensus, classify it under Consensus or Conditional Consensus. If it is unique to a single lens, classify it under Unique Finding Tagging.
