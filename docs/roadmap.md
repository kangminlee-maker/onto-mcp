# Onto MCP Roadmap

## Current State

- Existing TS `onto` runtime is preserved.
- `.onto` YAML/MD assets remain the language-neutral contract.
- New repo direction is TS core + MCP-native tool surface.
- External adapter experiments are evidence and conformance input, not the main
  product path.

## Stage 1 — Core API Facade

Done when:

- `src/core-api/` exposes prepare/run/status/result functions over the existing
  runtime behavior.
- Repository-local npm harnesses call the same runtime behavior.
- Core API calls return structured artifact references instead of only terminal
  output.

## Stage 2 — MCP Tool Server

Done when:

- `src/mcp/` exposes stable tool schemas.
- A local MCP server can list tools and route calls into the core API.
- `onto.review`, `onto.review_status`, and `onto.review_result` work with a
  mock/local provider.

## Stage 3 — Provider Contract

Done when:

- `src/providers/` defines capability reporting and execution methods.
- Local/mock provider has conformance tests.
- Codex and Claude provider strategies are documented before implementation.

## Stage 4 — Controlled Deliberation

Done when:

- Providers can report whether isolated workers are available.
- Controlled lens deliberation is selected from runtime settings and recorded
  in review artifacts.
- Lens-to-lens deliberation evidence is preserved separately from synthesis.

## Stage 5 — Migration And Cleanup

Done when:

- External parity prototype code is either archived, converted into
  conformance fixtures, or replaced by provider tests.
- User-facing docs describe MCP tool usage as the primary integration path.
- Any new remote repository is configured intentionally; old local repos remain
  as references until migration is complete.
