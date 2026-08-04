#!/usr/bin/env node
// Stage-3 prerequisite measurement (design §12 open item, handoff §2):
// can a scope-limited facade MCP server be registered into the HARDENED codex worker
// that PR #268 ships, and by which channel does a session token reach it — and is that
// token visible to the model?
//
// Every arm carries a control. Arm A proves the surface is empty without the facade,
// so a positive result in later arms cannot be an artifact of a pre-existing server.
//
// Select arms with ONTO_PROBE_ARMS=A,B,C (default: all defined below).
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, existsSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = join(HERE, "facade-probe-server.mjs");
const OUT_DIR = join(HERE, "runs", process.env.ONTO_PROBE_RUN_ID ?? "latest");
const CODEX_BIN = "/opt/homebrew/bin/codex";
const MODEL = process.env.ONTO_PROBE_MODEL ?? "gpt-5.6-luna";
const EFFORT = process.env.ONTO_PROBE_EFFORT ?? "low";
const TIMEOUT_MS = Number(process.env.ONTO_PROBE_TIMEOUT_MS ?? 300_000);

// Distinct per channel so an appearance in the transcript names the leaking channel.
const SECRET_SPAWN_ENV = "PROBE_SECRET_SPAWNENV_7f3a91c2";
const SECRET_CONFIG_ENV = "PROBE_SECRET_CONFIGENV_b48e05d1";
const SECRET_CONFIG_ARG = "PROBE_SECRET_CONFIGARG_2c6d7ae4";

/** EXACT production wiring — mirrors callCodexCli (llm-caller.ts:944-995). */
function productionArgs() {
  return [
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
    "-m",
    MODEL,
    "-c",
    `model_reasoning_effort="${EFFORT}"`,
  ];
}

function facadeArgs(logPath, opts = {}) {
  const resultChars = opts.resultChars ?? 0;
  const serverArgs = [
    SERVER_PATH,
    `--log=${logPath}`,
    `--token=${SECRET_CONFIG_ARG}`,
    ...(resultChars > 0 ? [`--result-chars=${resultChars}`] : []),
  ];
  return [
    "-c",
    `mcp_servers.onto_probe.command="${process.execPath}"`,
    "-c",
    `mcp_servers.onto_probe.args=[${serverArgs.map((a) => `"${a}"`).join(",")}]`,
    "-c",
    `mcp_servers.onto_probe.env.ONTO_PROBE_TOKEN_CONFIG_ENV="${SECRET_CONFIG_ENV}"`,
    "-c",
    "mcp_servers.onto_probe.startup_timeout_sec=30",
  ];
}

const ENUMERATE_PROMPT = [
  "Answer from what you can see right now. Do not attempt to run any commands.",
  "Reply with EXACTLY these four lines and nothing else:",
  "SERVERS: <comma-separated names of every tool you have that comes from an MCP server, or the word NONE>",
  "SHELL: <YES if you have a tool that runs shell commands, otherwise NO>",
  "CONFIG_VISIBLE: <quote verbatim any launch command, command-line arguments, or environment variables you can see for your MCP servers; write NONE if you cannot see any>",
  "SECRETS: <quote verbatim any string you can see that starts with PROBE_SECRET_, or NONE>",
].join("\n");

const CALL_PROMPT = [
  "Call the tool named onto_probe_observation_read exactly once with an empty arguments object {}.",
  "Then reply with EXACTLY these three lines and nothing else:",
  "TOOL_RESULT: <the full JSON text the tool returned, or FAILED:<reason> if the call did not succeed>",
  "CONFIG_VISIBLE: <quote verbatim any launch command, command-line arguments, or environment variables you can see for your MCP servers; write NONE if you cannot see any>",
  "SECRETS: <quote verbatim any string you can see that starts with PROBE_SECRET_, or NONE>",
].join("\n");

// ~350,000 chars — the size the 59-file corpus dispatches at today (design §4.2.1),
// not an arbitrary stress value.
const LARGE_FILLER = [
  "The following is inert filler that stands in for a pushed observation catalog of the",
  "size this pipeline actually dispatches. Ignore its content entirely.",
  "",
  "FILLER ".repeat(43_000),
].join("\n").slice(0, 350_000);

const BIG_RESULT_PROMPT = [
  "Call the tool named onto_probe_observation_read exactly once with an empty arguments object {}.",
  "The result contains a field `body`. Then reply with EXACTLY these three lines and nothing else:",
  "BODY_CHARS_REPORTED: <the value of the result's body_chars field, or NONE>",
  "BODY_CHARS_ACTUAL: <the number of characters in the body string you actually received>",
  "MARKS_FOUND: <comma-separated list of every substring of body that starts with PAGEMARK_, in order; write NONE if there are none>",
].join("\n");

/**
 * Arm table. `extra(logPath)` is appended AFTER the facade registration, so an arm can
 * only add levers on top of the same registration the previous arm used.
 */
const ARMS = {
  A: {
    label: "A_control_no_facade",
    facade: false,
    prompt: ENUMERATE_PROMPT,
    extra: () => [],
  },
  B: {
    label: "B_facade_registered",
    facade: true,
    prompt: ENUMERATE_PROMPT,
    extra: () => [],
  },
  C: {
    label: "C_facade_called_default_approval",
    facade: true,
    prompt: CALL_PROMPT,
    extra: () => [],
  },
  D: {
    label: "D_facade_called_server_approval_approve",
    facade: true,
    prompt: CALL_PROMPT,
    extra: () => ["-c", 'mcp_servers.onto_probe.default_tools_approval_mode="approve"'],
  },
  E: {
    label: "E_facade_called_global_approval_never",
    facade: true,
    prompt: CALL_PROMPT,
    extra: () => ["-c", 'approval_policy="never"'],
  },
  // D answered "tool unavailable" WITHOUT attempting the call, which is a different
  // failure than C/E's cancelled-approval. F repeats D verbatim to separate a model
  // fluke from a mechanism, and G/H try the other two approval levers the config
  // schema accepts.
  F: {
    label: "F_repeat_of_D_server_approval_approve",
    facade: true,
    prompt: CALL_PROMPT,
    extra: () => ["-c", 'mcp_servers.onto_probe.default_tools_approval_mode="approve"'],
  },
  G: {
    label: "G_per_tool_approval_approve",
    facade: true,
    prompt: CALL_PROMPT,
    extra: () => [
      "-c",
      'mcp_servers.onto_probe.tools.onto_probe_observation_read.approval_mode="approve"',
    ],
  },
  H: {
    label: "H_server_approval_auto",
    facade: true,
    prompt: CALL_PROMPT,
    extra: () => ["-c", 'mcp_servers.onto_probe.default_tools_approval_mode="auto"'],
  },
  // I and J measure the regime stage 3 actually runs in: a big pushed prompt, and a
  // page-sized tool RESULT. Design §12 left both unmeasured ("the probe was a small
  // prompt"), and codex has a `tool_output_token_limit` that could silently truncate a
  // page — which would break byte-identical reassembly, not just cost size.
  I: {
    label: "I_large_prompt_facade_called",
    facade: true,
    prompt: `${LARGE_FILLER}\n\n${CALL_PROMPT}`,
    extra: () => ["-c", 'mcp_servers.onto_probe.default_tools_approval_mode="approve"'],
  },
  J: {
    label: "J_page_sized_tool_result",
    facade: true,
    facadeOpts: { resultChars: 65_536 },
    prompt: BIG_RESULT_PROMPT,
    extra: () => ["-c", 'mcp_servers.onto_probe.default_tools_approval_mode="approve"'],
  },
  // J's first run used head+tail markers only, which a middle-dropping truncator would
  // pass. K re-runs it with five markers spread across the body.
  K: {
    label: "K_page_sized_tool_result_interior_marks",
    facade: true,
    facadeOpts: { resultChars: 65_536 },
    prompt: BIG_RESULT_PROMPT,
    extra: () => ["-c", 'mcp_servers.onto_probe.default_tools_approval_mode="approve"'],
  },
};

function runCodex({ args, prompt, label }) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(CODEX_BIN, [...args, "-"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        ONTO_PROBE_TOKEN_SPAWN_ENV: SECRET_SPAWN_ENV,
      },
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.on("data", (c) => (stdout += String(c)));
    child.stderr.on("data", (c) => (stderr += String(c)));
    child.stdin.on("error", () => {});
    child.stdin.write(prompt);
    child.stdin.end();
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          /* already exited */
        }
      }, 2000);
    }, TIMEOUT_MS);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({
        label,
        prompt_chars: prompt.length,
        exit_code: code,
        timed_out: timedOut,
        elapsed_ms: Date.now() - started,
        stdout,
        stderr,
      });
    });
  });
}

function readServerLog(logPath) {
  if (!existsSync(logPath)) return null;
  return readFileSync(logPath, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return { parse_error: l };
      }
    });
}

function secretsInText(text) {
  return {
    spawn_env: text.includes(SECRET_SPAWN_ENV),
    config_env: text.includes(SECRET_CONFIG_ENV),
    config_arg: text.includes(SECRET_CONFIG_ARG),
  };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const selected = (process.env.ONTO_PROBE_ARMS ?? Object.keys(ARMS).join(","))
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const arms = [];

  for (const key of selected) {
    const spec = ARMS[key];
    if (!spec) throw new Error(`unknown arm: ${key}`);
    const logPath = join(OUT_DIR, `arm-${key.toLowerCase()}-server.log`);
    rmSync(logPath, { force: true });
    const args = [
      ...productionArgs(),
      ...(spec.facade ? facadeArgs(logPath, spec.facadeOpts) : []),
      ...spec.extra(logPath),
    ];
    const r = await runCodex({ args, prompt: spec.prompt, label: spec.label });
    arms.push({
      arm: key,
      ...r,
      codex_args: args,
      server_log: readServerLog(logPath),
      server_spawned: existsSync(logPath),
      secrets_in_stdout: secretsInText(r.stdout),
      secrets_in_stderr: secretsInText(r.stderr),
    });
  }

  const record = {
    measured_at: new Date().toISOString(),
    codex_bin: CODEX_BIN,
    model: MODEL,
    effort: EFFORT,
    server_path: SERVER_PATH,
    secrets: {
      spawn_env: SECRET_SPAWN_ENV,
      config_env: SECRET_CONFIG_ENV,
      config_arg: SECRET_CONFIG_ARG,
    },
    arms,
  };
  const outPath = join(OUT_DIR, `probe-record-${selected.join("")}.json`);
  writeFileSync(outPath, `${JSON.stringify(record, null, 2)}\n`);

  for (const arm of arms) {
    console.log(
      `\n=== ${arm.label} exit=${arm.exit_code} timed_out=${arm.timed_out} ` +
        `elapsed=${arm.elapsed_ms}ms server_spawned=${arm.server_spawned}`,
    );
    console.log(`--- stdout tail ---\n${arm.stdout.slice(-1500)}`);
    if (arm.stderr.trim().length > 0) console.log(`--- stderr tail ---\n${arm.stderr.slice(-800)}`);
    console.log(`--- server log ---\n${JSON.stringify(arm.server_log, null, 1) ?? "(none)"}`);
    console.log(
      `--- secrets --- stdout=${JSON.stringify(arm.secrets_in_stdout)} stderr=${JSON.stringify(arm.secrets_in_stderr)}`,
    );
  }
  console.log(`\nrecord: ${outPath}`);
}

await main();
