/**
 * Interactive prompts for `onto install`.
 *
 * # Module layout
 *
 * The `PromptIO` interface is the seam between interactive behavior
 * and stdin/stdout. Every prompt function takes a `PromptIO` so tests
 * can inject a scripted mock that returns predetermined answers —
 * no real terminal, no stdin mocking gymnastics.
 *
 * `createReadlineIo()` is the default production implementation,
 * backed by `node:readline/promises`.
 *
 * # Secret input
 *
 * `askSecret()` masks input with asterisks on TTY. It closes the
 * active readline interface, takes over stdin in raw mode, reads
 * character by character echoing `*`, and reopens readline
 * afterwards. Non-TTY environments fall back to plain readline
 * (masking isn't possible without raw-mode support). See
 * `readMaskedFromStdin` below for the recognized key bindings
 * (Enter, Ctrl-C, Ctrl-D, Backspace).
 *
 * # Step functions
 *
 * One function per interactive step, each accepting `(io, flags,
 * detection, priorDecisions)` as needed and returning the resolved
 * value. They respect `InstallFlags` first: if the flag is set the
 * prompt is skipped; otherwise the user is asked with a sensible
 * default derived from `PreflightDetection`.
 *
 * # Orchestrator
 *
 * `runInteractivePrompts()` runs all six steps in order and returns
 * the fully-resolved `{ decisions, secrets }` pair that writer.ts
 * consumes. The non-interactive orchestration path (`install/cli.ts
 * #runNonInteractive`) reuses the step functions' flag-respect logic
 * — when every flag is pre-populated, the prompts are skipped and
 * the mode difference collapses to the flag resolution logic.
 */

import readline from "node:readline/promises";
import type {
  EnvSecrets,
  InstallDecisions,
  InstallFlags,
  LearnProvider,
  PreflightDetection,
  ProfileScope,
  ReviewProvider,
} from "./types.js";

// ---------------------------------------------------------------------------
// PromptIO interface + default readline implementation
// ---------------------------------------------------------------------------

export interface PromptIO {
  /** Ask a free-form question. Empty answer → default (if provided). */
  ask(prompt: string, options?: { default?: string }): Promise<string>;

  /** Ask a multiple-choice question. Returns one of `choices`. */
  askChoice<T extends string>(
    prompt: string,
    choices: readonly T[],
    options?: { default?: T },
  ): Promise<T>;

  /** Ask yes/no. Accepts y/yes/n/no case-insensitively. */
  askConfirm(prompt: string, defaultValue: boolean): Promise<boolean>;

  /** Secret input (keys, URLs). Masked on TTY, plain on non-TTY — see module header. */
  askSecret(prompt: string): Promise<string>;

  /** Print a line to the user (e.g. a section header). */
  print(text: string): void;

  /** Release any resources (e.g. readline interface). */
  close(): void;
}

/**
 * Read a line from stdin with echo masking (asterisks per keypress).
 *
 * Takes full control of stdin via raw mode, consuming data events
 * directly rather than through readline. The caller must have any
 * active readline interface closed before entering this function —
 * otherwise readline's own data listener would race with ours and
 * eat characters before the mask loop sees them.
 *
 * Recognized inputs:
 *   - Enter / newline       → resolve with buffered string
 *   - Ctrl-C (0x03)          → reject with cancellation error
 *   - Ctrl-D (0x04)          → resolve with buffered string (EOF)
 *   - Backspace (0x7f, 0x08) → remove last char + visual backspace
 *   - Printable chars        → append to buffer, echo "*"
 *   - Other control chars    → ignored
 */
async function readMaskedFromStdin(prompt: string): Promise<string> {
  process.stdout.write(`${prompt}: `);
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let buffer = "";
    const cleanup = (): void => {
      stdin.off("data", onData);
      stdin.setRawMode?.(false);
      stdin.pause();
    };

    const onData = (chunk: string): void => {
      for (const ch of chunk) {
        const code = ch.charCodeAt(0);
        if (ch === "\n" || ch === "\r") {
          cleanup();
          process.stdout.write("\n");
          resolve(buffer);
          return;
        }
        if (code === 3) {
          cleanup();
          process.stdout.write("\n");
          reject(new Error("Install canceled (Ctrl-C)"));
          return;
        }
        if (code === 4) {
          cleanup();
          process.stdout.write("\n");
          resolve(buffer);
          return;
        }
        if (code === 127 || code === 8) {
          if (buffer.length > 0) {
            buffer = buffer.slice(0, -1);
            // Visually erase the last asterisk.
            process.stdout.write("\b \b");
          }
          continue;
        }
        if (code < 32) continue;
        buffer += ch;
        process.stdout.write("*");
      }
    };

    stdin.on("data", onData);
  });
}

/** Default PromptIO backed by `node:readline/promises`. */
export function createReadlineIo(): PromptIO {
  let rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask: PromptIO["ask"] = async (prompt, options) => {
    const suffix =
      options?.default !== undefined ? ` [${options.default}]: ` : ": ";
    const answer = (await rl.question(`${prompt}${suffix}`)).trim();
    if (!answer && options?.default !== undefined) return options.default;
    return answer;
  };

  const askChoice: PromptIO["askChoice"] = async (prompt, choices, options) => {
    while (true) {
      const hint = choices.join(" | ");
      const answer = (
        await rl.question(
          `${prompt}\n  (${hint})${options?.default ? ` [${options.default}]` : ""}: `,
        )
      ).trim();
      const picked = !answer && options?.default ? options.default : answer;
      if (choices.includes(picked as (typeof choices)[number])) {
        return picked as (typeof choices)[number];
      }
      process.stdout.write(
        `  '${picked}' 는 유효한 선택이 아닙니다. 다시 입력해 주세요.\n`,
      );
    }
  };

  const askConfirm: PromptIO["askConfirm"] = async (prompt, defaultValue) => {
    const defaultHint = defaultValue ? "Y/n" : "y/N";
    const raw = (await rl.question(`${prompt} [${defaultHint}]: `))
      .trim()
      .toLowerCase();
    if (!raw) return defaultValue;
    if (raw === "y" || raw === "yes") return true;
    if (raw === "n" || raw === "no") return false;
    return defaultValue;
  };

  /**
   * TTY → masked input (asterisks). Non-TTY → fall back to plain
   * readline (no masking possible without raw mode).
   *
   * The TTY path must close + reopen the readline interface because
   * both readline and our raw-mode listener bind to `process.stdin`;
   * leaving readline open during the masked read makes it race us
   * for input bytes. Close before, recreate after — any in-flight
   * state (cursor line, completion state) is irrelevant across a
   * secret prompt boundary.
   */
  const askSecret: PromptIO["askSecret"] = async (prompt) => {
    const stdin = process.stdin;
    const canRawMode =
      Boolean(stdin.isTTY) && typeof stdin.setRawMode === "function";
    if (!canRawMode) {
      return (await rl.question(`${prompt}: `)).trim();
    }
    rl.close();
    try {
      const answer = await readMaskedFromStdin(prompt);
      return answer.trim();
    } finally {
      rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
    }
  };

  const print: PromptIO["print"] = (text) => {
    process.stdout.write(`${text}\n`);
  };

  const close: PromptIO["close"] = () => {
    rl.close();
  };

  return { ask, askChoice, askConfirm, askSecret, print, close };
}

// ---------------------------------------------------------------------------
// Step 1: profile scope
// ---------------------------------------------------------------------------

export async function stepProfileScope(
  io: PromptIO,
  flags: InstallFlags,
): Promise<ProfileScope> {
  if (flags.profileScope) return flags.profileScope;
  return io.askChoice(
    "이 프로파일을 어디에 저장하시겠어요?",
    ["global", "project"] as const,
    { default: "project" },
  );
}

// ---------------------------------------------------------------------------
// Step 2: review provider
// ---------------------------------------------------------------------------

const REVIEW_PROVIDERS = [
  "main-native",
  "codex",
  "anthropic",
  "openai",
  "litellm",
] as const;

/**
 * Derive the suggested default review provider from the pre-flight
 * snapshot. Priority favors "least friction" — if the user is
 * currently in a Claude Code session with no external keys, main-native
 * costs nothing. Otherwise the highest-priority detected credential
 * wins.
 */
function suggestReviewDefault(detection: PreflightDetection): ReviewProvider {
  if (detection.hostIsClaudeCode) return "main-native";
  if (detection.hasCodexBinary && detection.hasCodexAuth) return "codex";
  if (detection.hasAnthropicKey) return "anthropic";
  if (detection.hasOpenAiKey) return "openai";
  if (detection.hasLitellmBaseUrl) return "litellm";
  return "main-native";
}

export async function stepReviewProvider(
  io: PromptIO,
  flags: InstallFlags,
  detection: PreflightDetection,
): Promise<ReviewProvider> {
  if (flags.reviewProvider) {
    if (flags.reviewProvider === "main-native" && !detection.hostIsClaudeCode) {
      io.print(
        "[warning] main-native는 Claude Code 세션 내에서만 동작합니다. " +
          "현재는 Claude Code가 감지되지 않았습니다.",
      );
    }
    return flags.reviewProvider;
  }

  const suggested = suggestReviewDefault(detection);
  while (true) {
    const picked = await io.askChoice(
      "Review (9-lens) 실행에 사용할 provider를 선택하세요.",
      REVIEW_PROVIDERS,
      { default: suggested },
    );
    if (picked === "main-native" && !detection.hostIsClaudeCode) {
      io.print(
        "  [warning] main-native는 Claude Code 세션이 아닐 때 동작하지 " +
          "않습니다. 그래도 이 값으로 기록할까요? (npm CLI 사용 시 review가 " +
          "실패할 수 있습니다.)",
      );
      const proceed = await io.askConfirm("계속", false);
      if (!proceed) continue;
    }
    return picked;
  }
}

// ---------------------------------------------------------------------------
// Step 3: review provider auth
// ---------------------------------------------------------------------------

export async function stepReviewAuth(
  io: PromptIO,
  provider: ReviewProvider,
  detection: PreflightDetection,
): Promise<EnvSecrets> {
  switch (provider) {
    case "main-native":
      return {};

    case "codex":
      return stepCodexAuth(io, detection);

    case "anthropic":
      return stepAnthropicAuth(io, detection);

    case "openai":
      return stepOpenaiAuth(io, detection);

    case "litellm":
      return stepLitellmAuth(io, detection);
  }
}

async function stepCodexAuth(
  io: PromptIO,
  detection: PreflightDetection,
): Promise<EnvSecrets> {
  if (detection.hasCodexBinary && detection.hasCodexAuth) {
    io.print("  [ok] codex binary와 ~/.codex/auth.json이 확인됐습니다.");
    return {};
  }
  if (!detection.hasCodexBinary) {
    io.print(
      "  [error] codex CLI가 설치돼 있지 않습니다. https://github.com/openai/codex " +
        "에서 먼저 설치해 주세요.",
    );
    return {};
  }
  io.print(
    [
      "  [action] codex 로그인이 필요합니다.",
      "  다른 터미널에서 다음을 실행한 뒤 Enter를 눌러 주세요:",
      "",
      "      codex login",
      "",
    ].join("\n"),
  );
  await io.ask("완료되면 Enter", { default: "" });
  return {};
}

async function stepAnthropicAuth(
  io: PromptIO,
  detection: PreflightDetection,
): Promise<EnvSecrets> {
  if (detection.hasAnthropicKey) {
    const reuse = await io.askConfirm(
      "  ANTHROPIC_API_KEY가 이미 환경에 있습니다. 그대로 사용할까요?",
      true,
    );
    if (reuse) return {};
  }
  const key = await io.askSecret("  ANTHROPIC_API_KEY 입력");
  return key.trim() ? { anthropicApiKey: key.trim() } : {};
}

async function stepOpenaiAuth(
  io: PromptIO,
  detection: PreflightDetection,
): Promise<EnvSecrets> {
  if (detection.hasOpenAiKey) {
    const reuse = await io.askConfirm(
      "  OPENAI_API_KEY가 이미 환경에 있습니다. 그대로 사용할까요?",
      true,
    );
    if (reuse) return {};
  }
  const key = await io.askSecret("  OPENAI_API_KEY 입력");
  return key.trim() ? { openaiApiKey: key.trim() } : {};
}

async function stepLitellmAuth(
  io: PromptIO,
  detection: PreflightDetection,
): Promise<EnvSecrets> {
  io.print(
    [
      "  LiteLLM / OpenAI-compatible 엔드포인트를 사용합니다.",
      "  로컬에서 띄운 경우 포트를 포함한 전체 URL을 입력하세요.",
      "  예) LiteLLM proxy: http://localhost:4000/v1",
      "      Ollama:        http://localhost:11434/v1",
    ].join("\n"),
  );
  const baseUrl = await io.ask("  Base URL", {
    default: detection.litellmBaseUrlValue ?? "http://localhost:4000/v1",
  });
  const needsAuth = await io.askConfirm(
    "  엔드포인트에 API key 인증이 필요한가요?",
    false,
  );
  const out: EnvSecrets = { litellmBaseUrl: baseUrl.trim() };
  if (needsAuth) {
    const apiKey = await io.askSecret("  LITELLM_API_KEY 입력");
    if (apiKey.trim()) out.litellmApiKey = apiKey.trim();
  }
  return out;
}

// ---------------------------------------------------------------------------
// Step 4: learn provider
// ---------------------------------------------------------------------------

const LEARN_PROVIDERS = [
  "codex",
  "anthropic",
  "openai",
  "litellm",
] as const satisfies readonly LearnProvider[];

export async function stepLearnProvider(
  io: PromptIO,
  flags: InstallFlags,
  reviewProvider: ReviewProvider,
): Promise<LearnProvider> {
  if (flags.learnProvider === "same") {
    if (reviewProvider === "main-native") {
      io.print(
        "  [warning] learn은 main-native를 지원하지 않습니다. " +
          "별도 provider를 선택해야 합니다.",
      );
    } else {
      return reviewProvider;
    }
  } else if (flags.learnProvider) {
    return flags.learnProvider;
  }

  if (reviewProvider !== "main-native") {
    const reuse = await io.askConfirm(
      `Learn (background 작업)도 review와 동일하게 ${reviewProvider}를 사용할까요?`,
      true,
    );
    if (reuse) return reviewProvider;
  }

  return io.askChoice(
    "Learn / govern / promote용 provider를 선택하세요 (main-native는 지원되지 않습니다).",
    LEARN_PROVIDERS,
    { default: "anthropic" },
  );
}

// ---------------------------------------------------------------------------
// Step 5: learn provider auth (only if distinct from review)
// ---------------------------------------------------------------------------

export async function stepLearnAuth(
  io: PromptIO,
  learnProvider: LearnProvider,
  reviewProvider: ReviewProvider,
  detection: PreflightDetection,
  priorSecrets: EnvSecrets,
): Promise<EnvSecrets> {
  if (learnProvider === reviewProvider) return priorSecrets;
  const learnSecrets = await stepReviewAuth(
    io,
    learnProvider as ReviewProvider,
    detection,
  );
  return { ...priorSecrets, ...learnSecrets };
}

// ---------------------------------------------------------------------------
// Step 6: output language
// ---------------------------------------------------------------------------

export async function stepOutputLanguage(
  io: PromptIO,
  flags: InstallFlags,
): Promise<"ko" | "en"> {
  if (flags.outputLanguage) return flags.outputLanguage;
  return io.askChoice("출력 언어 (principal-facing)", ["ko", "en"] as const, {
    default: "ko",
  });
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export interface InteractivePromptResult {
  decisions: InstallDecisions;
  secrets: EnvSecrets;
}

/**
 * Run all six steps in sequence and return the fully-resolved
 * decisions + secrets. Skips any step whose value is already fixed
 * via flags.
 */
export async function runInteractivePrompts(args: {
  io: PromptIO;
  flags: InstallFlags;
  detection: PreflightDetection;
}): Promise<InteractivePromptResult> {
  const { io, flags, detection } = args;

  const profileScope = await stepProfileScope(io, flags);
  const reviewProvider = await stepReviewProvider(io, flags, detection);
  const reviewSecrets = await stepReviewAuth(io, reviewProvider, detection);
  const learnProvider = await stepLearnProvider(io, flags, reviewProvider);
  const secrets = await stepLearnAuth(
    io,
    learnProvider,
    reviewProvider,
    detection,
    reviewSecrets,
  );
  const outputLanguage = await stepOutputLanguage(io, flags);

  const decisions: InstallDecisions = {
    profileScope,
    reviewProvider,
    learnProvider,
    outputLanguage,
  };
  if (secrets.litellmBaseUrl) {
    decisions.litellmBaseUrl = secrets.litellmBaseUrl;
  }
  return { decisions, secrets };
}
