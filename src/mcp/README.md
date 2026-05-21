# MCP

`src/mcp/` owns the tool-call surface that Codex, Claude, and other MCP-capable
hosts should see.

This layer should stay thin:

- validate tool inputs;
- call the TS core API;
- return structured status, result, and artifact refs;
- avoid redefining lens, domain, review, or synthesis semantics.
