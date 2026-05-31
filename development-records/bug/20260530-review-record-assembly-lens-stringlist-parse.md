# Review ReviewRecord assembly fails on natural LLM markdown bullets

> 상태: Fixed. Shipped in onto-mcp v0.4.4.

## Discovery context

Goal-driven verification of all `review` MCP tools in Claude Code (2026-05-30).
Tools verified working via the Claude Code MCP path: `list_lenses`, `list_domains`,
`prepare_review`, `review_status`, `review_continue` (mock), `review_result`,
`review_cancel`. A real `onto.review` (Codex/gpt-5.5 worker, `core-axis`, target
`src/core-runtime/onboard/path-scan.ts`) ran the full 12-step execution pipeline
and wrote `final-output.md` + `synthesis.md` + `execution-result.yaml`
(`execution_status: completed`), but the attempt ended `status: failed` and **no
`review-record.yaml` was produced**.

## Root cause

`active-review-attempt.yaml` error:
```
Invalid YAML list in coverage Domain Context Assumptions:
Unexpected scalar at node end at line 1, column 21
```

`assemble-review-record.ts` parsed each lens output's `Domain Context Assumptions`
section as **strict YAML** (`parseStringList` → `parseYamlList` → `YAML.parse`).
The coverage lens (LLM-authored) wrote a natural markdown bullet list:
```
- "PATH resolution" means resolving a bare command name from PATH entries, ...
```
`- "PATH resolution" means ...` is valid markdown but invalid YAML: a double-quoted
scalar (`"PATH resolution"`) followed by more text on the same line → "Unexpected
scalar at node end" at column 21 (just after the closing quote). ReviewRecord
assembly is the canonical primary-artifact step, so this broke real reviews even
though execution and `final-output.md` succeeded.

This is an LLM-native robustness gap: lens output is LLM-authored prose, but the
runtime demanded strict YAML for a free-text string section.

## Fix

`src/core-runtime/cli/assemble-review-record.ts` — `parseStringList` only (used
solely for `domain_context_assumptions`). Now: try a valid YAML string list first
(preserves `[]`, `- none`, clean YAML lists), then **fall back to parsing markdown
bullet lines as literal strings**. Structured object sections (`Domain Constraints
Used` via `parseDomainConstraints`/`parseYamlList`) stay strict — unchanged.
`parseStringList` is exported and covered by `assemble-review-record.test.ts`.

## Verification

- `npm run check:ts-core` — pass.
- Unit: `assemble-review-record.test.ts` covers `[]`, `- none`, fenced YAML,
  quoted-bullet regression, colon bullets, and the fail-loud error path.
- `npx vitest run src/core-runtime/cli` — pass.
- `npm run test:mcp:review` — pass (full mock E2E assembles ReviewRecord).
- Reproduced the original failure on the real failed session, then re-assembled
  `review-record.yaml` successfully after the fix.
- End-to-end: a fresh real Codex review on the fixed build completed the full
  pipeline and produced `review-record.yaml` (lens provenance parsed across
  English/Korean free-text bullets and empty `[]`).

## Rollback

Standard: `git revert <commit>` on `main`, then release a patch.

## Related, not fixed here

`onto.review_status` returns a very large payload (~85 KB) with no projection
control, exceeding strict MCP-client token caps (saved-to-file fallback). Unlike
`onto.review_result` (compact/standard/full), `review_status` has no `projectionLevel`.
Functional but impractical in Claude Code; candidate for a follow-up projection option.
