# Core API

`src/core-api/` is the future library-facing facade over the existing
`src/core-runtime/` implementation.

The goal is to let MCP, repository-local harnesses, and provider tests call the same review behavior
without re-implementing interpretation, binding, prompt packet materialization,
synthesis, final result explanation, or ReviewRecord assembly.

Core API results expose `llmPresentation` prompt/input pairs so MCP hosts can
explain the opening brief and final result from bounded runtime facts instead of
scraping CLI stdout.
