/**
 * `.mcpb` Desktop Extension entry point.
 *
 * Claude Desktop's built-in Node host **imports this module by path** (it does
 * not spawn `mcp_config.command`/`args`). So the manifest `entry_point` must be
 * an importable `.js` ES module that starts the MCP stdio server on load — NOT
 * the extensionless `bin/onto` CLI dispatcher (ESM cannot resolve an
 * extensionless path, and `bin/onto` needs an `mcp` argv the import path never
 * provides).
 *
 * Self-configures the two bundle-fixed values so the server starts even if the
 * host does not apply `mcp_config.env` under the built-in-node path: `ONTO_HOME`
 * (the bundle root, which anchors `.onto/` resource resolution) and the simple
 * tool profile. Provider config still flows from the install env via the
 * first-run bootstrap inside `startMcpServer` when present; otherwise the
 * runtime resolves provider from the existing `settings.json` chain.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startMcpServer } from "./mcp/server.js";

// dist/mcpb-entry.js → the bundle root is one level up from dist/.
const bundleRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
process.env.ONTO_HOME ??= bundleRoot;
process.env.ONTO_MCP_PROFILE ??= "simple";

void startMcpServer().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(
      `[onto mcpb-entry] failed to start: ${
        error instanceof Error ? error.stack ?? error.message : String(error)
      }\n`,
    );
    process.exit(1);
  },
);
