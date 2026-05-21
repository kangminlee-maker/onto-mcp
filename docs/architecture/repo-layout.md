# Repository Layout

This repository is the new TS-first home for the MCP-native `onto` direction.
The existing runtime stays in place; new surfaces are added around it instead
of recreating `onto` semantics in another language.

```text
.onto/
  authority/      language-neutral IDs and concept contracts
  commands/       user-facing command contracts
  domains/        selectable domain documents
  processes/      review / install / govern process contracts
  roles/          lens and synthesize role definitions

src/core-runtime/
  existing executable TS runtime

src/core-api/
  library-facing facade over the core runtime

src/mcp/
  MCP tool schemas and server entrypoint

src/providers/
  capability contracts and provider adapters

docs/decisions/
  accepted direction and architecture decisions

docs/architecture/
  current architecture and migration notes
```

## Local Workspace Roles

```text
/Users/kangmin/cowork/onto-mcp
  New product direction: TS core + MCP-native tool surface.

/Users/kangmin/cowork/onto
  Upstream/local reference clone for the pre-reset TS runtime.

/Users/kangmin/cowork/onto-mcp
  Primary workspace for MCP-native product work.
```

## Rule Of Thumb

- Product semantics go in `.onto/` contracts and `src/core-runtime/`.
- Tool-call UX goes in `src/mcp/`.
- Host-specific execution goes in `src/providers/`.
- External host integration should be treated as provider evidence, not the
  canonical `onto` implementation.
