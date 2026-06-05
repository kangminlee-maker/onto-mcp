# Core Lexicon Retired Legacy Notes

Status: archived
Archived at: 2026-06-05

This folder preserves legacy-alias and deprecated-term notes removed from
`.onto/authority/core-lexicon.yaml` so the active lexicon remains focused on
current canonical concepts.

This archive is not runtime authority. Runtime and active docs should not
depend on this folder.

## Retired Alias Governance

Former active lexicon notes treated legacy aliases as documentation-only
bridges. Canonical labels always won, and runtime consumers were expected to
read canonical values only.

Scope migration notes formerly recorded:

- `user` split toward `methodology` by default, with instance-level routing to
  product, medium, or domain when content was narrower.
- `project` renamed to `product`.
- `domain` kept its identifier while changing from storage-boundary label to
  domain frame.

Deprecated vocabulary notes formerly recorded:

- `learning_applicability` was replaced by `primary_scope` and
  `secondary_scopes`.
- Inline scope tags such as `[methodology]`, `[domain/X]`, and `[medium/X]`
  were replaced by frontmatter scope fields.

## Retired Entity And Term Aliases

Former alias payloads removed from the active lexicon:

- `review_lens`: `agent`, `onto_{id}`
- `ReviewRecord`: `review_record_term`
- `principal`: `designer`
- `ContextIsolatedReasoningUnit`: `worker`
- `activity`: `build`, `design`, `ask`, and single-letter shortcodes
- `axis`: empty legacy alias slot

## Deprecated Terms Removed From Active Lexicon

Removed deprecated term payloads:

- `fact_type`: retired Explorer-path classifier. Current reconstruct uses
  `TargetMaterialKind`, `SourceObservation`, and LLM-authored semantic
  directives instead.
- `learning_scope_promotion`: former project-to-user learning promotion term.
  Current scope movement is represented by `transition_kind: generalize` and
  `primary_scope` / `secondary_scopes`.
- `drift_queue_entry`: old govern queue item. Current review runtime has no
  wired govern path.

## Deprecated Provisional Term Entries Removed

Removed from `provisional_terms.entries`:

- `learning_usage_hitrate`
- `domain_validation_accuracy`
- `review_ontology_present_path`
- `review_path_label`
- `review_ontology_absent_path`
- `reconstruct_bounded_path`

These entries described non-current measurement or handler paths and should not
be treated as active runtime authority.
