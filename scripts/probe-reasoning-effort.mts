#!/usr/bin/env tsx
/**
 * Reasoning-effort acceptance probe.
 *
 * Answers one question per run: does THIS execution surface accept THIS effort
 * value for THIS model? The answer is what `.onto/authority/model-reasoning-efforts.yaml`
 * records, and this harness is how a `documented` entry there becomes `measured`
 * without redoing the research.
 *
 * WHY A HARNESS RATHER THAN AN AD-HOC COMMAND: the two surfaces disagree about
 * what failure looks like, and reading the wrong signal silently inverts the
 * result.
 *   - codex CLI FAILS LOUD: a value the deployment refuses exits non-zero with a
 *     provider 400. Exit status is the verdict.
 *   - Claude Code FAILS OPEN: an unknown value exits ZERO, warns on stderr, and
 *     runs at the DEFAULT effort. Exit status says nothing; the presence of that
 *     warning is the verdict.
 * A probe that read rc on the Claude route would mark every value accepted.
 *
 * --self-test proves the discrimination before any real verdict is reported: it
 * runs a value the surface must accept and one it must refuse, and refuses to
 * emit verdicts unless those two come out DIFFERENT. A probe that cannot tell
 * its own controls apart cannot tell anything apart.
 *
 * Direct-API surfaces (openai_sdk / anthropic_sdk) are refused: they need a
 * metered credential this repo does not carry, and guessing from the CLI result
 * is exactly the conflation the authority exists to prevent.
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";

const PROMPT = "Reply with exactly: ok";
const EVIDENCE_DIR = "development-records/benchmark/reasoning-effort-probe/raw";
/** Emitted by Claude Code when it does not recognise a value and silently falls
 * back to the default effort. Absence of this line is what "accepted" means on
 * that surface. */
const CLAUDE_UNKNOWN_EFFORT_MARKER = "Unknown --effort value";

type Surface = "codex_cli" | "claude_code";

interface ProbeOutcome {
  surface: Surface;
  model: string;
  effort: string;
  accepted: boolean;
  exitCode: number | null;
  /** The line that decided it — quoted so a reader can re-judge the call. */
  decisiveEvidence: string;
  stdout: string;
  stderr: string;
}

function run(
  command: string,
  args: string[],
  stdin: string | null,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    if (stdin !== null) child.stdin.write(stdin);
    child.stdin.end();
  });
}

async function probe(
  surface: Surface,
  model: string,
  effort: string,
): Promise<ProbeOutcome> {
  if (surface === "codex_cli") {
    const wrapper = path.join(os.homedir(), ".codex/bin/codex-run");
    const { code, stdout, stderr } = await run(
      wrapper,
      [
        "--profile",
        "hermetic",
        "--model",
        model,
        "--effort",
        effort,
        "--sandbox",
        "read-only",
      ],
      PROMPT,
    );
    const providerMessage = /"message":\s*"([^"]+)"/.exec(stderr)?.[1];
    return {
      surface,
      model,
      effort,
      accepted: code === 0,
      exitCode: code,
      decisiveEvidence:
        code === 0
          ? `exit 0 (this surface fails loud, so a clean exit is acceptance)`
          : `exit ${code}: ${providerMessage ?? "non-zero exit, no provider message parsed"}`,
      stdout,
      stderr,
    };
  }
  const { code, stdout, stderr } = await run(
    "claude",
    ["-p", PROMPT, "--model", model, "--effort", effort],
    null,
  );
  const warned = stderr.includes(CLAUDE_UNKNOWN_EFFORT_MARKER);
  const warningLine = stderr
    .split("\n")
    .find((line) => line.includes(CLAUDE_UNKNOWN_EFFORT_MARKER));
  return {
    surface,
    model,
    effort,
    accepted: !warned,
    exitCode: code,
    decisiveEvidence: warned
      ? `downgraded to default — ${warningLine?.trim()}`
      : "no unknown-effort warning on stderr (this surface fails open, so exit status is not the signal)",
    stdout,
    stderr,
  };
}

async function writeEvidence(outcome: ProbeOutcome): Promise<string> {
  const stem = `${outcome.surface}-${outcome.model}-${outcome.effort}`.replace(
    /[^a-zA-Z0-9.-]/g,
    "_",
  );
  await fs.mkdir(EVIDENCE_DIR, { recursive: true });
  await fs.writeFile(path.join(EVIDENCE_DIR, `${stem}.out`), outcome.stdout);
  await fs.writeFile(path.join(EVIDENCE_DIR, `${stem}.err`), outcome.stderr);
  return `${EVIDENCE_DIR}/${stem}.{out,err}`;
}

/** Known controls per surface: one value the surface must accept, one it must
 * refuse. Deliberately NOT drawn from the authority file — a control read from
 * the artifact under test cannot contradict it. */
const CONTROLS: Record<Surface, { accept: string; refuse: string }> = {
  // `banana` is refused by the provider with a schema-enum 400.
  codex_cli: { accept: "medium", refuse: "banana" },
  // `banana` triggers the unknown-value warning and a silent default.
  claude_code: { accept: "medium", refuse: "banana" },
};

async function selfTest(surface: Surface, model: string): Promise<void> {
  const control = CONTROLS[surface];
  process.stderr.write(
    `[self-test] ${surface}/${model}: expecting '${control.accept}' accepted and '${control.refuse}' refused\n`,
  );
  const accepted = await probe(surface, model, control.accept);
  const refused = await probe(surface, model, control.refuse);
  process.stderr.write(
    `[self-test] ${control.accept} -> ${accepted.accepted ? "accepted" : "refused"} (${accepted.decisiveEvidence})\n` +
      `[self-test] ${control.refuse} -> ${refused.accepted ? "accepted" : "refused"} (${refused.decisiveEvidence})\n`,
  );
  if (!accepted.accepted || refused.accepted) {
    throw new Error(
      `[self-test] FAILED for ${surface}/${model}: the probe cannot tell its own controls apart, ` +
        "so no verdict it produces is trustworthy. Fix the surface detection before recording anything.",
    );
  }
  process.stderr.write("[self-test] PASS — controls are distinguishable\n");
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      surface: { type: "string" },
      model: { type: "string" },
      effort: { type: "string", multiple: true, default: [] },
      "self-test": { type: "boolean", default: false },
      "skip-self-test": { type: "boolean", default: false },
    },
    strict: true,
    allowPositionals: false,
  });

  const surface = values.surface;
  if (surface !== "codex_cli" && surface !== "claude_code") {
    throw new Error(
      "--surface must be codex_cli or claude_code. The direct-API surfaces " +
        "(openai_sdk, anthropic_sdk) need a metered credential that is not " +
        "configured here; their authority entries stay verification: documented " +
        "until someone probes them with a key.",
    );
  }
  const model = values.model;
  if (!model) throw new Error("--model is required.");

  if (!values["skip-self-test"]) await selfTest(surface, model);
  if (values["self-test"]) return;

  const efforts = values.effort;
  if (efforts.length === 0) {
    throw new Error("--effort is required (repeatable) unless --self-test.");
  }

  const rows: string[] = [];
  for (const effort of efforts) {
    const outcome = await probe(surface, model, effort);
    const evidence = await writeEvidence(outcome);
    rows.push(
      `${outcome.accepted ? "ACCEPTED" : "REFUSED "}  ${surface}/${model}  ${effort}\n` +
        `          ${outcome.decisiveEvidence}\n` +
        `          evidence: ${evidence}`,
    );
  }
  process.stdout.write(`${rows.join("\n")}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
