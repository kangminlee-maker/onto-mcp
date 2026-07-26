# Observation catalog fixture — provenance

`source-observations.yaml` and `source-safety-ledger.yaml` are the **real, unedited** artifacts of the
same 59-file value bench run on 2026-07-26 (corpus: `openai-node` `src/`), copied verbatim from that
run's gitignored session directory
`.onto/temp/stage2-value-bench-2026-07-26T00-35-47-767Z/off/.onto/reconstruct/session/`.

Both come from ONE run on purpose: the ledger's rows are keyed by the observation ids in the
observations artifact, so a ledger from a different run would join to nothing and every gate test over
it would pass vacuously.

It is preserved here because that directory is gitignored and the observation catalog tool's
verification (design `20260726-observation-catalog-tool-design.md` §9) depends on the properties a
synthetic fixture does not reproduce.

Measured shape (`observation-read.test.ts` asserts the load-bearing ones before concluding anything):

| | |
|---|---|
| observations | 59 |
| canonical JSON, all observations | 2,710,411 chars |
| largest single observation | 780,114 chars |
| largest single scalar (`structural_data.content_excerpt`) | 222,483 chars |
| smallest observation | 1,866 chars |
| `structural_data` keys | `basename`, `char_count`, `code_structure_inventory`, `content_excerpt`, `content_sha256`, `excerpt_truncated`, `extension`, `line_count`, `path_kind`, `size_bytes` |

The largest scalar is what makes the oversized-scalar negative control real: a reader that split only
on field boundaries could not deliver it, so a passing split test is evidence rather than an artifact
of a convenient fixture.

## `source-safety-ledger.yaml` — and why it cannot prove the gate on its own

295 rows = 59 observations × 5 `intended_consumption` values. Measured tiers:

| | |
|---|---|
| `consumption_allowed` | 177 (= 59 × `prompt_context`, `evidence_support`, `replay`) |
| `internal_only` | 118 (= 59 × `public_output`, `material_claim`) |
| `prompt_context` rows admitted | **59 of 59** |

So over the real corpus the `prompt_context` gate **withholds nothing**. A "the gate works" test that ran
only against this file would pass vacuously. `observation-read-grant.test.ts` therefore derives its
withholding cases from this ledger by a single documented edit (one tier flipped to `no_prompt_use`, one
row deleted, all `prompt_context` tiers demoted) and cross-checks each variant against the production
push gate `sourceObservationsForPrompt`, so a variant is known to withhold for real rather than only
under the code being tested. The real file's job is the other half: proving the gate joins real rows and
admits a non-empty set (`admitted.size === 59` is asserted before anything else is concluded).

Not shipped in the npm package — `scripts/` is outside the `files` allowlist.
