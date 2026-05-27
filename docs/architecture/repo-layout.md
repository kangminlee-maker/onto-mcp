# Repository Layout

This repository is the TS-first home for the MCP-native `onto-mcp` direction.
The active runtime lives here and must run without reaching into another `onto`
checkout.

```text
.onto/
  authority/      language-neutral IDs and concept contracts
  domains/        selectable domain documents
  processes/      shared process contracts, review contracts, and future-process design contracts
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
- Cross-process process contracts live under `.onto/processes/shared/`.
- Future process contracts should follow the folder shape already used by
  review, for example `.onto/processes/reconstruct/`, rather than reviving
  archived root-level process files.
- Cross-process target handling must classify the target by material form
  (`target_material_kind`: code, spreadsheet, document, database, mixed, or
  unknown) before choosing adapters or validation behavior.
- Tool-call UX goes in `src/mcp/`.
- Provider-specific execution stays in bounded runtime adapters under
  `src/core-runtime/cli` and `src/core-runtime/llm` until a separate provider
  layer is justified by distinct ownership.
- External host integration should be treated as provider evidence, not the
  canonical `onto` implementation.
