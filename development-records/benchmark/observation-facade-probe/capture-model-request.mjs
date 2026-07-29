#!/usr/bin/env node
// Model-independent measurement of "can the model see the facade's launch config?".
//
// Asking the model is self-report, and arm B already showed self-report is unreliable
// (it answered SERVERS: NONE while codex had the facade registered and later routed a
// call to it). So instead of asking, this captures the EXACT request body codex sends
// upstream, by pointing codex at a local provider endpoint. Whatever is not in that
// payload cannot be seen by the model.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = join(HERE, "facade-probe-server.mjs");
const OUT_DIR = join(HERE, "runs", process.env.ONTO_PROBE_RUN_ID ?? "latest");
const CODEX_BIN = "/opt/homebrew/bin/codex";
const PORT = Number(process.env.ONTO_PROBE_PORT ?? 8799);

const SECRET_SPAWN_ENV = "PROBE_SECRET_SPAWNENV_7f3a91c2";
const SECRET_CONFIG_ENV = "PROBE_SECRET_CONFIGENV_b48e05d1";
const SECRET_CONFIG_ARG = "PROBE_SECRET_CONFIGARG_2c6d7ae4";

mkdirSync(OUT_DIR, { recursive: true });
const logPath = join(OUT_DIR, "capture-server.log");
rmSync(logPath, { force: true });

const captured = [];
const httpServer = createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    captured.push({
      method: req.method,
      url: req.url,
      headers: Object.fromEntries(
        Object.entries(req.headers).map(([k, v]) => [
          k,
          k.toLowerCase() === "authorization" ? "<redacted>" : v,
        ]),
      ),
      body: Buffer.concat(chunks).toString("utf8"),
    });
    // Enough of a response for codex to fail cleanly; the request is the measurement.
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end("data: [DONE]\n\n");
  });
});

await new Promise((resolve) => httpServer.listen(PORT, "127.0.0.1", resolve));

const args = [
  "exec",
  "--skip-git-repo-check",
  "--ephemeral",
  "-s",
  "read-only",
  "--ignore-user-config",
  "--disable",
  "apps",
  "--disable",
  "shell_tool",
  "-c",
  `mcp_servers.onto_probe.command="${process.execPath}"`,
  "-c",
  `mcp_servers.onto_probe.args=["${SERVER_PATH}","--log=${logPath}","--token=${SECRET_CONFIG_ARG}"]`,
  "-c",
  `mcp_servers.onto_probe.env.ONTO_PROBE_TOKEN_CONFIG_ENV="${SECRET_CONFIG_ENV}"`,
  "-c",
  'mcp_servers.onto_probe.default_tools_approval_mode="approve"',
  "-c",
  'model_providers.probe.name="probe"',
  "-c",
  `model_providers.probe.base_url="http://127.0.0.1:${PORT}/v1"`,
  "-c",
  'model_providers.probe.wire_api="responses"',
  "-c",
  'model_providers.probe.env_key="PROBE_PROVIDER_KEY"',
  "-c",
  'model_providers.probe.requires_openai_auth=false',
  "-c",
  'model_provider="probe"',
  "-m",
  "gpt-5.6-luna",
  "-",
];

const child = spawn(CODEX_BIN, args, {
  stdio: ["pipe", "pipe", "pipe"],
  env: {
    ...process.env,
    PROBE_PROVIDER_KEY: "probe-key-not-a-real-credential",
    ONTO_PROBE_TOKEN_SPAWN_ENV: SECRET_SPAWN_ENV,
  },
});
let stdout = "";
let stderr = "";
child.stdout.on("data", (c) => (stdout += String(c)));
child.stderr.on("data", (c) => (stderr += String(c)));
child.stdin.on("error", () => {});
child.stdin.write("Call the tool onto_probe_observation_read once, then say DONE.");
child.stdin.end();

const exitCode = await new Promise((resolve) => {
  const t = setTimeout(() => {
    child.kill("SIGKILL");
    resolve("timeout");
  }, 90_000);
  child.on("exit", (code) => {
    clearTimeout(t);
    resolve(code);
  });
});
httpServer.close();

const secretsIn = (text) => ({
  spawn_env: text.includes(SECRET_SPAWN_ENV),
  config_env: text.includes(SECRET_CONFIG_ENV),
  config_arg: text.includes(SECRET_CONFIG_ARG),
  server_path: text.includes(SERVER_PATH),
  node_path: text.includes(process.execPath),
});

const allBodies = captured.map((c) => c.body).join("\n");
const record = {
  measured_at: new Date().toISOString(),
  exit_code: exitCode,
  request_count: captured.length,
  secrets_in_request_bodies: secretsIn(allBodies),
  tools_in_first_request: (() => {
    const first = captured[0];
    if (!first) return null;
    try {
      const parsed = JSON.parse(first.body);
      return parsed.tools ?? null;
    } catch {
      return "unparsed";
    }
  })(),
  captured,
  stdout,
  stderr,
  facade_server_log: existsSync(logPath)
    ? readFileSync(logPath, "utf8").split("\n").filter((l) => l.trim())
    : null,
};
const outPath = join(OUT_DIR, "model-request-capture.json");
writeFileSync(outPath, `${JSON.stringify(record, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      exit_code: exitCode,
      request_count: record.request_count,
      secrets_in_request_bodies: record.secrets_in_request_bodies,
      tool_names: Array.isArray(record.tools_in_first_request)
        ? record.tools_in_first_request.map((t) => t?.name ?? t?.function?.name ?? "?")
        : record.tools_in_first_request,
      stderr_tail: stderr.slice(-500),
    },
    null,
    2,
  ),
);
console.log(`record: ${outPath}`);
