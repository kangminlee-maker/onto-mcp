# Repository Layout

This repository is the TS-first home for the MCP-native `onto-mcp` direction.
The active runtime lives here and must run without reaching into another `onto`
checkout.

```text
.onto/
  authority/      language-neutral IDs and concept contracts
  domains/        selectable domain documents
  processes/      review process contracts
  roles/          lens and synthesize role definitions

src/core-runtime/
  executable review runtime

src/core-api/
  library-facing facade over the core runtime

src/mcp/
  MCP tool schemas and server entrypoint

docs/decisions/
  accepted direction and architecture decisions

docs/architecture/
  current architecture and migration notes
```

## Local Workspace Roles

```text
/Users/kangmin/cowork/onto-mcp
  New product direction: TS core + MCP-native tool surface.

/Users/kangmin/cowork/onto-mcp
  Primary workspace for MCP-native product work.
```

## Rule Of Thumb

- Product semantics go in `.onto/` contracts and `src/core-runtime/`.
- Tool-call UX goes in `src/mcp/`.
- Provider-specific execution stays in bounded runtime adapters under
  `src/core-runtime/cli` and `src/core-runtime/llm` until a separate provider
  layer is justified by distinct ownership.
- External host integration should be treated as provider evidence, not the
  canonical `onto` implementation.
