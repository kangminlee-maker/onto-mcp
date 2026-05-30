# Reconstruct Semantic Legacy Retirement Audit

Status: Implemented for active runtime surface
Date: 2026-05-29

## Goal

Remove semantic legacy from the active reconstruct runtime without introducing compatibility projection.

The current reconstruct authority is `ActionableOntologySeed` in `ontology-seed.yaml`. Any concept-centered or transitional `seed_candidate` surface must be handled through one of three dispositions only:

- `retire`: remove from active runtime, public API, MCP surface, record, manifest, and output.
- `migrate`: move still-valid behavior to the current `ontology_seed` contract.
- `isolate`: keep only as historical/test reference outside product authority.

`compat_projection` is not an allowed disposition.

## Disposition Table

| Legacy surface | Current problem | Disposition | Target state |
|---|---|---|---|
| `seed-candidate.yaml` artifact | Competes with `ontology-seed.yaml` as a second semantic seed authority. | retire | Reconstruct runs do not generate or require it. |
| `seed-candidate-validation.yaml` artifact | Makes a retired projection look like a runtime gate. | retire | Handoff and manifest validation do not read it. |
| `seed_candidate` run stage | Inserts old concept-centered seed into active execution. | retire | Pipeline goes `ontology_seed_validation -> claim_realization`. |
| `seed_candidate` ledger unit | Keeps the old stage in replay/trust topology. | retire | Ledger excludes seed candidate units. |
| `validateSeedCandidate` core API | Publicly exposes retired contract as product validation. | retire | API exposes current reconstruct validation kinds only. |
| `directiveKind=seed_candidate` MCP input | Lets hosts invoke retired contract as current surface. | retire | MCP schema excludes it. |
| Transitional seed candidate prompt/parser | Generates `top_level_concepts` and migration records after seed recomposition. | isolate | Move/remove from active author path; preserve only historical tests if needed. |
| `seed_authority_kind=seed_candidate` downstream validators | Allows post-seed gates to validate against retired authority. | migrate | Validators use `ontology_seed` authority only in product path. |
| `top_level_concepts`, `converged_for_seed`, old projection status terms | Old ontology strategy conflicts with Foundry-style actionable seed. | migrate/isolate | Current authority uses objects, actions, links, metrics, rules, permissions, and data bindings. |
| Final output compatibility warning | Frames retired artifact as relevant to user action. | retire | Final output reports only primary seed, current gates, readiness, and next actions. |

## Implementation Order

1. Remove seed candidate generation and validation from `runReconstruct`.
2. Rewire metrics, run manifest, handoff validation, ledger, record, and final output to `ontology_seed` only.
3. Remove seed candidate from public core API and MCP validation schema.
4. Update tests so the active happy path proves `ontology-seed.yaml` is the only seed authority.
5. Keep any old seed candidate validators only if isolated from active exports and active docs.

## Done When

- New reconstruct runs do not create `seed-candidate.yaml` or `seed-candidate-validation.yaml`.
- `reconstruct-run-manifest.yaml`, `reconstruct-record.yaml`, ledger, final output, API, and MCP surfaces do not present `seed_candidate` as a current artifact or validation kind.
- `npm run check:ts-core`, targeted reconstruct tests, and full `npx vitest run` pass.

## Implementation Result

- Active reconstruct execution now goes from `ontology_seed_validation` directly to `claim_realization`.
- The public core API and MCP validation schema no longer expose `seed_candidate`.
- Record, manifest, metrics, terminal handoff validation, final output, and pipeline ledger no longer present seed candidate as current authority.
- Historical seed candidate validator code is isolated under `development-records/archive/20260529-reconstruct-seed-candidate-legacy/` as legacy test/reference material outside the product TypeScript source tree; it is not imported by the active reconstruct runtime, core API, or MCP surface.
