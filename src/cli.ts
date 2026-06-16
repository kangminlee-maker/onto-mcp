#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readOntoVersion } from "./core-runtime/release-channel/release-channel.js";

/**
 * Public binary surface for the MCP-native product.
 *
 * Product tools are exposed through MCP (`onto mcp`). Review and other
 * runtime flows are no longer public `onto <activity>` CLI commands.
 */

function loadOntoEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  let contents: string;
  try {
    contents = fs.readFileSync(filePath, "utf8");
  } catch {
    return;
  }
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = line.slice(eq + 1);
  }
}

function printHelp(): void {
  console.log(
    [
      "Usage: onto <command>",
      "",
      "Active interface:",
      "  mcp            Start the MCP stdio tool server",
      "  register       Register the onto MCP server into supported hosts",
      "  configure-provider  Write LLM provider settings into the settings.json chain",
      "",
      "Available MCP tools:",
      "  onto_review",
      "  onto_prepare_review",
      "  onto_review_status",
      "  onto_review_result",
      "  onto_list_lenses",
      "  onto_list_domains",
      "  onto_list_source_profiles",
      "  onto_observe_source",
      "  onto_validate_reconstruct_directive",
      "  onto_reconstruct",
      "  onto_reconstruct_status",
      "  onto_reconstruct_result",
      "",
      "Options:",
      "  --version, -v  Show version",
      "  --help, -h     Show this help",
    ].join("\n"),
  );
}

function unsupportedCommandMessage(subcommand: string): string {
  return [
    `[onto] Unsupported public CLI subcommand: ${subcommand}`,
    "Active public commands: onto mcp, onto register, onto configure-provider",
  ].join("\n");
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const subcommand = argv[0];

  loadOntoEnvFile(path.join(os.homedir(), ".onto", ".env"));
  loadOntoEnvFile(path.join(process.cwd(), ".onto", ".env"));

  switch (subcommand) {
    case "mcp": {
      const { startMcpServer } = await import("./mcp/server.js");
      return startMcpServer();
    }

    case "register": {
      const { runRegister } = await import("./core-runtime/onboard/register.js");
      return runRegister(argv.slice(1));
    }

    case "watch": {
      const { runWatch } = await import("./tui/index.js");
      return runWatch(argv.slice(1));
    }

    case "configure-provider": {
      const { runConfigureProvider } = await import(
        "./core-runtime/onboard/configure-provider.js"
      );
      return runConfigureProvider(argv.slice(1));
    }

    case "--version":
    case "-v": {
      const version = await readOntoVersion();
      console.log(`onto-mcp ${version}`);
      return 0;
    }

    case "--help":
    case "-h":
    case undefined:
      printHelp();
      return 0;

    default:
      console.error(unsupportedCommandMessage(subcommand));
      return 1;
  }
}

main().then(
  (exitCode) => process.exit(exitCode),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
