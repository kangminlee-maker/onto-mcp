#!/usr/bin/env node
// Minimal stdio MCP server used ONLY as a measurement instrument for the
// observation-catalog tool's stage-3 prerequisite: can a scope-limited facade be
// registered into the hardened codex worker (`--ignore-user-config --disable apps
// --disable shell_tool -s read-only`), and by what channel does a session token
// reach it?
//
// It writes a side log so "did codex spawn this at all" is decided by the process
// itself rather than by the model's narration. Nothing here is product code.
import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";

// The log path arrives on argv, not env: env inheritance is one of the things under
// measurement, so the instrument must not depend on the answer.
const LOG_PATH =
  process.argv.slice(2).find((a) => a.startsWith("--log="))?.slice("--log=".length) ??
  process.env.ONTO_PROBE_LOG_PATH ??
  "/dev/null";
const TOOL_NAME = "onto_probe_observation_read";
const RESULT_CHARS = Number(
  process.argv.slice(2).find((a) => a.startsWith("--result-chars="))?.slice(
    "--result-chars=".length,
  ) ?? 0,
);

function log(event, data) {
  try {
    appendFileSync(
      LOG_PATH,
      `${JSON.stringify({ ts: new Date().toISOString(), event, ...data })}\n`,
    );
  } catch {
    /* the log is evidence, not a dependency */
  }
}

// Which channel delivered a token, recorded at process start so a later mutation
// cannot rewrite the measurement.
const tokenChannels = {
  spawn_env_inherited: process.env.ONTO_PROBE_TOKEN_SPAWN_ENV ?? null,
  config_env: process.env.ONTO_PROBE_TOKEN_CONFIG_ENV ?? null,
  config_arg: process.argv.slice(2).find((a) => a.startsWith("--token=")) ?? null,
};

log("server_start", {
  pid: process.pid,
  argv: process.argv.slice(1),
  token_channels: {
    spawn_env_inherited: tokenChannels.spawn_env_inherited !== null,
    config_env: tokenChannels.config_env !== null,
    config_arg: tokenChannels.config_arg !== null,
  },
  env_var_count: Object.keys(process.env).length,
  env_keys_sample: Object.keys(process.env).sort().slice(0, 40),
});

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function respond(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function respondError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

const rl = createInterface({ input: process.stdin });

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (trimmed.length === 0) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    log("parse_error", { line: trimmed.slice(0, 200) });
    return;
  }
  const { id, method, params } = msg;
  log("request", { id: id ?? null, method: method ?? null });

  if (method === "initialize") {
    const requested =
      typeof params?.protocolVersion === "string" ? params.protocolVersion : "2025-06-18";
    respond(id, {
      protocolVersion: requested,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "onto-facade-probe", version: "0.0.1" },
    });
    return;
  }
  if (method === "notifications/initialized" || method === "notifications/cancelled") {
    return;
  }
  if (method === "ping") {
    respond(id, {});
    return;
  }
  if (method === "tools/list") {
    respond(id, {
      tools: [
        {
          name: TOOL_NAME,
          description:
            "Probe tool. Returns a fixed marker plus which token-delivery channels the server " +
            "process observed. Takes no arguments that select content.",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
        },
      ],
    });
    return;
  }
  if (method === "tools/call") {
    const requestedTool = params?.name;
    if (requestedTool !== TOOL_NAME) {
      respondError(id, -32602, `unknown tool: ${String(requestedTool)}`);
      return;
    }
    // Deliberately reports only PRESENCE per channel — never the secret itself, so
    // any appearance of a secret in the worker transcript is attributable to codex,
    // not to this tool.
    const payload = {
      marker: "ONTO_PROBE_TOOL_RESULT_OK",
      token_channels_present: {
        spawn_env_inherited: tokenChannels.spawn_env_inherited !== null,
        config_env: tokenChannels.config_env !== null,
        config_arg: tokenChannels.config_arg !== null,
      },
    };
    // Optional bulk body: measures whether codex delivers a page-sized tool result
    // intact or truncates it (config has a `tool_output_token_limit`). Head and tail
    // markers make truncation visible from either end.
    if (RESULT_CHARS > 0) {
      // Markers at five fixed fractions, not just the two ends: a truncator that keeps
      // head+tail and drops the middle would pass a head/tail-only check.
      const marks = ["PAGEMARK_00", "PAGEMARK_25", "PAGEMARK_50", "PAGEMARK_75", "PAGEMARK_99"];
      const markChars = marks.reduce((sum, m) => sum + m.length, 0);
      const segmentFill = Math.max(0, Math.floor((RESULT_CHARS - markChars) / (marks.length - 1)));
      const body =
        marks.slice(0, -1).map((m) => `${m}${"x".repeat(segmentFill)}`).join("") +
        marks[marks.length - 1];
      payload.body = body;
      payload.body_chars = body.length;
    }
    log("tool_call", payload);
    respond(id, {
      content: [{ type: "text", text: JSON.stringify(payload) }],
      isError: false,
    });
    return;
  }
  if (typeof id !== "undefined") {
    respondError(id, -32601, `method not found: ${String(method)}`);
  }
});

rl.on("close", () => {
  log("server_stdin_closed", {});
  process.exit(0);
});
