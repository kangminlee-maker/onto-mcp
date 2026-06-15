# claude-opus-4-8 reconstruct live completion — evidence

Supporting artifacts for the `anthropic/claude-opus-4-8` entry in
`.onto/authority/supported-models.yaml` (INV-MODEL-1). Produced by one live full
reconstruct run over the Anthropic OAuth Claude Code CLI worker
(`execution_adapter=claude_code`) on fixture `reconstruct-golden-target-v1`,
`effort=medium`, `ONTO_LLM_TIMEOUT_MS=600000`. Reproducer:
`scripts/reconstruct-claude-live-e2e.mts`.

All paths in these files are relativized to `<run-root>/` (the run used an
isolated tmp project; absolute machine paths were stripped for portability).

## Files
- **`../reconstruct-pipeline-live-claude-20260615.json`** — the cited
  `benchmark_evidence_ref` (G7 gates on this file being git-tracked). A
  human-curated completion summary derived from the record below.
- **`reconstruct-record-claude-20260615.yaml`** — the run's authoritative
  `reconstruct-record.yaml`. **This is the source of truth for what ran.**
- **`final-output-claude-20260615.md`** — the verbatim model (claude) output.
  ⚠️ Its own "Completion Scope" prose is **internally inconsistent** (one
  paragraph says the maturation track "were not run", while later sections of the
  same file enumerate the maturation artifacts that did run). Trust the record
  YAML, not this file's prose, for completion facts.
- **`ontology-seed-claude-20260615.yaml`** — the reconstructed ontology seed.

## Authoritative completion facts (from the record YAML)
- `record_stage: completed` — granted by `deriveRecordStage`
  (`src/core-runtime/reconstruct/record.ts`) **only** when `final_output` is
  present, `final_output_provenance_status: valid`, and ~14 other validations are
  `valid`. So this value is unreachable if `final_output` had been skipped.
- The **maturation track ran** (validations `valid`) to a **`blocked`**
  `maturation_continuation_decision`; no actionable ontology was emitted
  (`actionable_ontology: null`).
- This clears the **same `final_output` + provenance completion bar** as the
  existing `openai/gpt-5.5` entry's winning run — it is **not** a stop-at-handoff
  partial.
- All 15 model-call steps ran via `provider_route: anthropic`,
  `model_id: claude-opus-4-8` (the `claude_code` worker), with no openai leak.

PRELIMINARY for any performance claim (single run; INV-BENCH-1 needs ≥3 reps, ≥2
fixtures). Support — that the model completes the pipeline — is verified.
