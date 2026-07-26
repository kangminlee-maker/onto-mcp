# Observation catalog fixture — provenance

`source-observations.yaml` is the **real, unedited** source-observation artifact of the 59-file
value bench run on 2026-07-26 (corpus: `openai-node` `src/`), copied verbatim from the run's
gitignored session directory
`.onto/temp/stage2-value-bench-2026-07-26T00-35-47-767Z/off/.onto/reconstruct/session/`.

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

Not shipped in the npm package — `scripts/` is outside the `files` allowlist.
