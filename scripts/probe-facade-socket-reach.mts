/**
 * MEASUREMENT, not a feature: can the MCP server process that codex launches open a unix socket back
 * to the runtime that spawned codex?
 *
 * Why it decides an architecture. Today the worker-facing tool is served by a child that holds its own
 * grant and writes its evidence to a FILE the runtime reads afterwards. That file is the source of a
 * whole class of problems — whose dispatch does it belong to, was it written before the response was
 * delivered, does it describe a whole excerpt or a fragment. If the child can instead be a thin wire to
 * the runtime, the runtime serves in its own process and there is no evidence artifact at all.
 *
 * The whole design turns on a capability nobody has measured. Precedent: a wiring assumption about the
 * child's command line passed 26 in-process tests and died on the first real worker run, because "a
 * process we spawn" is not "the process codex spawns". So this probe uses the REAL `codex exec` with
 * the REAL hardening flags, and asks the model to call a tool whose answer can only be produced by the
 * parent.
 *
 * Costs one real dispatch. Run deliberately:
 *   npx tsx scripts/probe-facade-socket-reach.mts
 *
 * PASS means: the child connected to the parent's socket, the parent answered, and the model reported
 * the parent-generated nonce. Anything else is a FAIL with the reason, and a FAIL is a real answer —
 * it removes an architecture from consideration rather than blocking one.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const CODEX_BIN = "/opt/homebrew/bin/codex";
const MODEL = process.env.ONTO_PROBE_MODEL ?? "gpt-5.6-luna";
const EFFORT = process.env.ONTO_PROBE_EFFORT ?? "low";

const fail: (message: string) => never = (message) => {
  console.error(`\n✗ ${message}`);
  process.exit(1);
};
const ok = (message: string): void => console.log(`  ✓ ${message}`);

const workDir = mkdtempSync(path.join(os.tmpdir(), "socket-reach-"));
const socketPath = path.join(workDir, "probe.sock");
// The nonce exists ONLY in this process until the parent answers a call. A model that reports it
// cannot have guessed it, and the child cannot have computed it.
const nonce = randomUUID();

/**
 * The child codex launches: a JSON-RPC-over-stdio MCP server that holds no logic at all. It forwards
 * one tool call to the parent over the socket and writes back whatever the parent says. If this shape
 * works, the runtime can serve in its own process and the child never touches evidence.
 */
const shim = path.join(workDir, "shim.mjs");
writeFileSync(
  shim,
  `import { createInterface } from "node:readline";
import { connect } from "node:net";
const SOCKET = process.env.PROBE_SOCKET;
const reply = (v) => process.stdout.write(JSON.stringify(v) + "\\n");
const askParent = () => new Promise((resolve) => {
  const c = connect(SOCKET, () => c.write("ask\\n"));
  let buf = "";
  c.on("data", (d) => { buf += String(d); });
  c.on("end", () => resolve(buf.trim()));
  c.on("error", (e) => resolve("SOCKET_ERROR:" + e.code));
});
createInterface({ input: process.stdin }).on("line", async (line) => {
  if (!line.trim()) return;
  let m; try { m = JSON.parse(line); } catch { return; }
  if (m.method === "initialize") {
    return reply({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: m.params?.protocolVersion ?? "2025-06-18",
      capabilities: { tools: { listChanged: false } }, serverInfo: { name: "probe", version: "1" } } });
  }
  if (String(m.method || "").startsWith("notifications/")) return;
  if (m.method === "tools/list") {
    return reply({ jsonrpc: "2.0", id: m.id, result: { tools: [{ name: "probe_ask_parent",
      description: "Returns a value only the parent process knows.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false } }] } });
  }
  if (m.method === "tools/call") {
    const answer = await askParent();
    return reply({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: answer }],
      structuredContent: { answer }, isError: false } });
  }
  if (m.id !== undefined) reply({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "no" } });
});
`,
  "utf8",
);

let parentSawConnection = false;
const server = createServer((socket) => {
  parentSawConnection = true;
  socket.on("data", () => {
    socket.end(nonce);
  });
});
await new Promise<void>((resolve) => server.listen(socketPath, resolve));
ok(`parent listening on ${socketPath}`);

const prompt = `Call the tool probe_ask_parent exactly once with {}.
It returns a single opaque string. Then reply with EXACTLY one line and nothing else:
ANSWER: <the returned string, or FAILED:<reason> if the call did not succeed>`;

const args = [
  "exec",
  "--skip-git-repo-check",
  "--sandbox",
  "read-only",
  "--ignore-user-config",
  "--disable",
  "apps",
  "--disable",
  "shell_tool",
  "--model",
  MODEL,
  "--cd",
  REPO_ROOT,
  "-c",
  `model_reasoning_effort="${EFFORT}"`,
  "-c",
  `mcp_servers.probe.command=${JSON.stringify(process.execPath)}`,
  "-c",
  `mcp_servers.probe.args=[${JSON.stringify(shim)}]`,
  "-c",
  `mcp_servers.probe.env.PROBE_SOCKET=${JSON.stringify(socketPath)}`,
  "-c",
  'mcp_servers.probe.default_tools_approval_mode="approve"',
  "-c",
  "mcp_servers.probe.startup_timeout_sec=30",
  "-",
];

console.log(`  … dispatching ${MODEL} (one real call)`);
const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
  const child = spawn(CODEX_BIN, args, { stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += String(chunk)));
  child.stderr.on("data", (chunk) => (stderr += String(chunk)));
  child.stdin.write(prompt);
  child.stdin.end();
  child.on("exit", (code) => resolve({ code, stdout, stderr }));
});

server.close();
console.log(`\n--- codex exit ${result.code} ---\n${result.stdout.trim()}\n`);

if (!parentSawConnection) {
  console.error(result.stderr.slice(-1500));
  rmSync(workDir, { recursive: true, force: true });
  fail(
    "the parent never saw a connection: the process codex launched could not reach the runtime's " +
      "socket. A design that serves from the runtime process is NOT available on this route.",
  );
}
ok("the child connected to the parent's socket");

if (!result.stdout.includes(nonce)) {
  rmSync(workDir, { recursive: true, force: true });
  fail(
    "the child connected but the parent's value did not reach the model. Serving from the runtime is " +
      `reachable but not end-to-end on this route. Worker said:\n${result.stdout.trim()}`,
  );
}
ok("the parent-generated value reached the model through the tool");
rmSync(workDir, { recursive: true, force: true });
console.log(
  "\nPASS — the runtime can serve its own tool calls in-process, with the child holding no state.",
);
