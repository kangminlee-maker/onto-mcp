# MCP

`src/mcp/` owns the tool-call surface that Codex, Claude, and other MCP-capable
hosts should see.

This layer should stay thin:

- validate tool inputs;
- call the TS core API;
- return structured status, result, and artifact refs;
- emit `notifications/progress` during `onto.review` when the caller supplies
  `_meta.progressToken`;
- avoid redefining lens, domain, review, or synthesis semantics.

Progress notifications are a host transport convenience. The canonical progress
read model remains `onto.review_status` plus artifact-backed
`llmPresentation.progress`. The MCP layer forwards Core API progress events and
does not define its own progress step taxonomy.
