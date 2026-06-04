/**
 * Claude Code CLI worker adapter for the shared CLI worker runner.
 *
 * Unlike `callClaudeCli` (the single-turn LLM-caller path, no tools), the review
 * unit worker is an agentic `claude -p` run that READS the packet-referenced
 * files. We restrict the tool set to read-only (Read/Glob/Grep) so the worker
 * cannot modify the repository, and run non-interactively. Output authority is
 * stdout JSON (`result` element); the runner writes it to the canonical path.
 */

import type {
  CliWorkerAdapter,
  WorkerRunContext,
  WorkerRunState,
} from "../cli-worker-runner.js";
import { parseClaudeResultEvent } from "../../llm/llm-caller.js";

export interface ClaudeWorkerAdapterOptions {
  model?: string;
  /** Tool set the worker may use. Default read-only: "Read,Glob,Grep". */
  tools?: string;
  /** Permission mode for non-interactive runs. Default "bypassPermissions". */
  permissionMode?: string;
  /** Extra directories to grant read access beyond cwd (= projectRoot). */
  addDirs?: string[];
}

export function createClaudeWorkerAdapter(
  opts: ClaudeWorkerAdapterOptions = {},
): CliWorkerAdapter {
  return {
    label: "claude",
    binary: "claude",
    notFoundMessage:
      "claude CLI not found on PATH. Install Claude Code to use executor=claude: https://docs.claude.com/claude-code",
    buildArgv(_ctx: WorkerRunContext): string[] {
      const args: string[] = ["-p", "--output-format", "json"];
      args.push("--tools", opts.tools ?? "Read,Glob,Grep");
      args.push("--permission-mode", opts.permissionMode ?? "bypassPermissions");
      for (const dir of opts.addDirs ?? []) {
        args.push("--add-dir", dir);
      }
      if (opts.model && opts.model.length > 0) {
        args.push("--model", opts.model);
      }
      return args;
    },
    async extractOutput(
      _ctx: WorkerRunContext,
      state: WorkerRunState,
    ): Promise<string> {
      // `--output-format json` emits a top-level stream-event array (or, in
      // some environments, a single object); parseClaudeResultEvent locates the
      // result element. A zero exit with is_error / no usable result is a
      // failure the runner preserves the trace for.
      const evt = parseClaudeResultEvent(state.stdout);
      if (evt.is_error) {
        throw new Error(
          `claude worker reported an error result: ${evt.result ?? "(no message)"}`,
        );
      }
      return evt.result ?? "";
    },
    classifyExitError(
      _ctx: WorkerRunContext,
      state: WorkerRunState,
    ): string | undefined {
      const haystack = `${state.stderr}\n${state.stdout}`.toLowerCase();
      if (
        haystack.includes("not logged in") ||
        haystack.includes("authentication") ||
        haystack.includes("please run") ||
        haystack.includes("/login")
      ) {
        return "claude CLI authentication failed. Run `claude auth login` (claude.ai subscription) or set ANTHROPIC_API_KEY.";
      }
      return undefined;
    },
  };
}
