/**
 * Codex worker adapter for the shared CLI worker runner.
 *
 * Provider-specific surface only: `codex exec` argv, the `-o`-file-authoritative
 * output extraction (with stdout fallback), and the not-found message. The
 * lifecycle (spawn / tee / observability / cleanup) lives in cli-worker-runner.
 */

import fs from "node:fs/promises";
import type {
  CliWorkerAdapter,
  WorkerRunContext,
  WorkerRunState,
} from "../cli-worker-runner.js";

export interface CodexWorkerAdapterOptions {
  sandboxMode: string;
  model?: string;
  reasoningEffort?: string;
  configOverrides: string[];
}

export function createCodexWorkerAdapter(
  opts: CodexWorkerAdapterOptions,
): CliWorkerAdapter {
  return {
    label: "codex",
    binary: "codex",
    notFoundMessage:
      "codex CLI not found. Install codex or use a different executor.",
    buildArgv(ctx: WorkerRunContext): string[] {
      const args: string[] = [
        "exec",
        "-C",
        ctx.projectRoot,
        "-s",
        opts.sandboxMode,
        "-o",
        ctx.outputPath,
        "--skip-git-repo-check",
      ];
      if (opts.reasoningEffort && opts.reasoningEffort.length > 0) {
        args.push("-c", `model_reasoning_effort="${opts.reasoningEffort}"`);
      }
      if (opts.model && opts.model.length > 0) {
        args.push("-m", opts.model);
      }
      for (const override of opts.configOverrides) {
        args.push("-c", override);
      }
      args.push("-");
      return args;
    },
    async extractOutput(
      ctx: WorkerRunContext,
      state: WorkerRunState,
    ): Promise<string> {
      // The codex `-o` flag may not reliably write the file; treat it as
      // authoritative when present + non-empty, otherwise fall back to the
      // captured stdout.
      const exists = await fs
        .access(ctx.outputPath)
        .then(() => true, () => false);
      const size = exists ? (await fs.stat(ctx.outputPath)).size : 0;
      if (exists && size > 0) {
        return fs.readFile(ctx.outputPath, "utf8");
      }
      const fallback = state.stdout.trim();
      if (fallback.length === 0) {
        throw new Error(
          "Codex worker executor produced no output (neither -o file nor stdout).",
        );
      }
      return fallback;
    },
  };
}
