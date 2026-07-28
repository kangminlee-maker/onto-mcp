/**
 * Build the codex rollout fixtures from the real sessions on this machine.
 *
 * WHY A GENERATOR RATHER THAN A HAND-WRITTEN FIXTURE. The delivery-reconciliation reader parses an
 * artifact codex does not document, so a fixture written from a description would prove the reader
 * matches the description rather than the artifact. These are the REAL rollout files, copied line for
 * line, with only the instruction/environment scaffolding replaced — see `STRIPPED_FIELDS` and
 * `STRIPPED_MESSAGE_PREFIXES` below for the exact list and the reason for each.
 *
 * NONE of it is read by the reader. Every record the reader touches — `session_meta`,
 * `event_msg`/`mcp_tool_call_end`, `response_item`/`custom_tool_call_output` — is byte-preserved, so
 * these fixtures also carry stage 2's verbatim-containment checks.
 *
 * Usage:  npx tsx scripts/build-codex-rollout-fixture.mts [--codex-home <dir>] [--check]
 *   --check  re-derives the fixtures and fails if they differ from what is committed (drift gate).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(REPO_ROOT, "scripts/fixtures/codex-rollout");

/**
 * The sessions, pinned by id and by the PHASE each one contributes. The phase is the reason the
 * session is here; a replacement must reproduce it (design 20-measurement §2).
 */
const PINNED_SESSIONS: readonly { id: string; phase: string }[] = [
  {
    id: "019fa332-ae9e-75b1-ba34-3cd43e25952e",
    phase: "four MCP calls in ONE exec, all four results rendered into one output, truncated",
  },
  {
    id: "019fa334-7926-78d0-8082-67624edfdeb1",
    phase: "four MCP calls in ONE exec whose output is `done` — the payloads never entered context",
  },
  {
    id: "019fa33f-3382-7b00-8d5a-ce8e9e7be00d",
    phase: "one MCP call in one exec, plus an exec that calls no tool at all",
  },
];

const STRIPPED_FIELDS: readonly { type: string; key: string }[] = [
  { type: "session_meta", key: "base_instructions" },
  { type: "world_state", key: "state" },
];

/**
 * Instruction/scaffolding envelopes codex injects as `message` records. None is read by the reader,
 * and each carries something that should not be republished from this machine:
 *
 *   `# AGENTS.md instructions for` — the RENDERED AGENTS.md, which here includes a private global
 *                                    instruction bundle the repository's committed `AGENTS.md` does
 *                                    not contain (checked: no `agent-bios:central` marker in it)
 *   `<skills_instructions>`        — the list of skills installed on this machine
 *   `<plugins_instructions>`       — likewise for plugins
 *   `<permissions instructions>`   — vendor sandbox text
 *   `<environment_context>`        — cwd, shell, timezone
 */
const STRIPPED_MESSAGE_PREFIXES: readonly string[] = [
  "# AGENTS.md instructions for",
  "<skills_instructions>",
  "<plugins_instructions>",
  "<permissions instructions>",
  "<environment_context>",
];

function findRollout(codexHome: string, sessionId: string): string {
  const stack = [codexHome];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.includes(sessionId) && entry.name.endsWith(".jsonl")) {
        return full;
      }
    }
  }
  throw new Error(
    `no rollout for session ${sessionId} under ${codexHome}. These fixtures can only be rebuilt on a ` +
      "machine that still holds the original sessions; the committed copies are the durable record.",
  );
}

function reduce(sourceText: string): { text: string; strippedChars: number; lines: number } {
  let strippedChars = 0;
  const out: string[] = [];
  for (const line of sourceText.split("\n")) {
    if (line.trim() === "") continue;
    const record = JSON.parse(line) as { type?: string; payload?: Record<string, unknown> };
    const strip = STRIPPED_FIELDS.find((candidate) => candidate.type === record.type);
    if (strip && record.payload && strip.key in record.payload) {
      strippedChars += JSON.stringify(record.payload[strip.key]).length;
      record.payload[strip.key] = `<<stripped by build-codex-rollout-fixture: ${strip.key}>>`;
    }
    const content = (record.payload as { content?: unknown } | undefined)?.content;
    if (Array.isArray(content)) {
      for (const item of content as { text?: unknown }[]) {
        const prefix = typeof item?.text === "string"
          ? STRIPPED_MESSAGE_PREFIXES.find((candidate) => (item.text as string).startsWith(candidate))
          : undefined;
        if (prefix !== undefined) {
          strippedChars += (item.text as string).length;
          item.text = `<<stripped by build-codex-rollout-fixture: ${prefix}>>`;
        }
      }
    }
    out.push(JSON.stringify(record));
  }
  return { text: `${out.join("\n")}\n`, strippedChars, lines: out.length };
}

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const homeFlag = args.indexOf("--codex-home");
const codexHome = homeFlag >= 0 ? args[homeFlag + 1]! : path.join(os.homedir(), ".codex");

mkdirSync(OUT_DIR, { recursive: true });
let drift = 0;
for (const session of PINNED_SESSIONS) {
  const outPath = path.join(OUT_DIR, `${session.id}.jsonl`);
  if (checkOnly && !existsSync(outPath)) {
    console.error(`MISSING ${path.relative(REPO_ROOT, outPath)}`);
    drift += 1;
    continue;
  }
  const sourcePath = findRollout(codexHome, session.id);
  const sourceText = readFileSync(sourcePath, "utf8");
  const reduced = reduce(sourceText);
  const digest = createHash("sha256").update(reduced.text).digest("hex");
  if (checkOnly) {
    const committed = readFileSync(outPath, "utf8");
    const same = committed === reduced.text;
    if (!same) drift += 1;
    console.log(`${same ? "ok  " : "DRIFT"} ${session.id} ${digest.slice(0, 12)}`);
    continue;
  }
  writeFileSync(outPath, reduced.text);
  console.log(
    `${session.id}  lines=${reduced.lines}  bytes=${reduced.text.length}  ` +
      `stripped=${reduced.strippedChars}  sha256=${digest.slice(0, 16)}  source=${
        path.basename(sourcePath)
      }  mtime=${statSync(sourcePath).mtime.toISOString()}`,
  );
}
if (checkOnly && drift > 0) {
  console.error(`${drift} fixture(s) differ from the committed copies.`);
  process.exit(1);
}
