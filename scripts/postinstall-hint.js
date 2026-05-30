// Post-install hint (dependency-free, ESM).
//
// Intentionally does NOT register anything or prompt: npm postinstall runs in
// many non-interactive contexts (CI, --ignore-scripts, package managers) where
// a prompt would hang or fail. It only prints a short next-step hint. Wrapped in
// try/catch so a hint failure can never break the install.

try {
  const lines = [
    "",
    "onto-mcp installed.",
    "Next: register the onto MCP server with your hosts:",
    "  onto register            (interactive: pick hosts in a terminal)",
    "  onto register --all --yes (non-interactive: all detected hosts)",
    "Hosts: Claude Code, Codex, Claude Desktop, Cursor.",
    "",
  ];
  // eslint-disable-next-line no-console
  console.log(lines.join("\n"));
} catch {
  // never fail the install over a hint
}
