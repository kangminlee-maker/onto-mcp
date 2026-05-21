# Core API

`src/core-api/` is the future library-facing facade over the existing
`src/core-runtime/` implementation.

The goal is to let CLI, MCP, and provider tests call the same review behavior
without re-implementing interpretation, binding, prompt packet materialization,
synthesis, or ReviewRecord assembly.
