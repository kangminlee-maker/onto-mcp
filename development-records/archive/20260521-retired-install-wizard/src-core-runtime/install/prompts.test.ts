import { describe, it, expect } from "vitest";
import {
  runInteractivePrompts,
  stepLearnProvider,
  stepOutputLanguage,
  stepProfileScope,
  stepReviewAuth,
  stepReviewProvider,
} from "./prompts.js";
import type {
  InstallFlags,
  LearnProvider,
  PreflightDetection,
  ProfileScope,
  ReviewProvider,
} from "./types.js";
import type { PromptIO } from "./prompts.js";

// ---------------------------------------------------------------------------
// ScriptedIo — a PromptIO test double
// ---------------------------------------------------------------------------

type Script = Array<
  | { kind: "ask"; answer: string }
  | { kind: "askChoice"; answer: string }
  | { kind: "askConfirm"; answer: boolean }
  | { kind: "askSecret"; answer: string }
>;

class ScriptedIo implements PromptIO {
  public log: string[] = [];
  private i = 0;

  constructor(private script: Script) {}

  private next<T extends Script[number]>(kind: T["kind"]): T {
    if (this.i >= this.script.length) {
      throw new Error(
        `ScriptedIo: no more scripted answers (requested ${kind}; log=${this.log.join(" | ")})`,
      );
    }
    const entry = this.script[this.i++];
    if (!entry || entry.kind !== kind) {
      throw new Error(
        `ScriptedIo: expected ${kind}, got ${entry?.kind ?? "end-of-script"} at step ${this.i}`,
      );
    }
    return entry as T;
  }

  async ask(prompt: string): Promise<string> {
    this.log.push(`ask:${prompt}`);
    return this.next<{ kind: "ask"; answer: string }>("ask").answer;
  }

  async askChoice<T extends string>(prompt: string): Promise<T> {
    this.log.push(`askChoice:${prompt}`);
    return this.next<{ kind: "askChoice"; answer: string }>("askChoice")
      .answer as T;
  }

  async askConfirm(prompt: string): Promise<boolean> {
    this.log.push(`askConfirm:${prompt}`);
    return this.next<{ kind: "askConfirm"; answer: boolean }>("askConfirm")
      .answer;
  }

  async askSecret(prompt: string): Promise<string> {
    this.log.push(`askSecret:${prompt}`);
    return this.next<{ kind: "askSecret"; answer: string }>("askSecret").answer;
  }

  print(text: string): void {
    this.log.push(`print:${text}`);
  }

  close(): void {
    this.log.push("close");
  }
}

const BLANK_DETECTION: PreflightDetection = {
  existingGlobalConfig: false,
  existingProjectConfig: false,
  hasAnthropicKey: false,
  hasOpenAiKey: false,
  hasLitellmBaseUrl: false,
  hasCodexBinary: false,
  hasCodexAuth: false,
  hostIsClaudeCode: false,
};

const EMPTY_FLAGS: InstallFlags = {
  nonInteractive: false,
  reconfigure: false,
  skipValidation: false,
  dryRun: false,
};

// ---------------------------------------------------------------------------
// Step 1: profile scope
// ---------------------------------------------------------------------------

describe("stepProfileScope", () => {
  it("prompts when flag is unset", async () => {
    const io = new ScriptedIo([{ kind: "askChoice", answer: "global" }]);
    const scope = await stepProfileScope(io, EMPTY_FLAGS);
    expect(scope).toBe<ProfileScope>("global");
  });

  it("skips prompt when flag is preset", async () => {
    const io = new ScriptedIo([]);
    const scope = await stepProfileScope(io, {
      ...EMPTY_FLAGS,
      profileScope: "project",
    });
    expect(scope).toBe<ProfileScope>("project");
    expect(io.log).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Step 2: review provider
// ---------------------------------------------------------------------------

describe("stepReviewProvider", () => {
  it("accepts flag verbatim", async () => {
    const io = new ScriptedIo([]);
    const provider = await stepReviewProvider(
      io,
      { ...EMPTY_FLAGS, reviewProvider: "codex" },
      BLANK_DETECTION,
    );
    expect(provider).toBe<ReviewProvider>("codex");
  });

  it("warns when flag=main-native but host is not Claude Code", async () => {
    const io = new ScriptedIo([]);
    await stepReviewProvider(
      io,
      { ...EMPTY_FLAGS, reviewProvider: "main-native" },
      BLANK_DETECTION,
    );
    expect(io.log.some((l) => l.includes("main-native"))).toBe(true);
  });

  it("prompts and requires confirmation for main-native without Claude Code", async () => {
    const io = new ScriptedIo([
      { kind: "askChoice", answer: "main-native" },
      { kind: "askConfirm", answer: false },
      { kind: "askChoice", answer: "anthropic" },
    ]);
    const provider = await stepReviewProvider(io, EMPTY_FLAGS, BLANK_DETECTION);
    expect(provider).toBe("anthropic");
  });

  it("accepts main-native without reprompt when Claude Code is detected", async () => {
    const io = new ScriptedIo([{ kind: "askChoice", answer: "main-native" }]);
    const provider = await stepReviewProvider(io, EMPTY_FLAGS, {
      ...BLANK_DETECTION,
      hostIsClaudeCode: true,
    });
    expect(provider).toBe("main-native");
  });
});

// ---------------------------------------------------------------------------
// Step 3: review auth (anthropic / openai / litellm / codex / main-native)
// ---------------------------------------------------------------------------

describe("stepReviewAuth", () => {
  it("main-native returns empty secrets with no prompts", async () => {
    const io = new ScriptedIo([]);
    const secrets = await stepReviewAuth(io, "main-native", BLANK_DETECTION);
    expect(secrets).toEqual({});
  });

  it("anthropic: reuse existing env key when user confirms", async () => {
    const io = new ScriptedIo([{ kind: "askConfirm", answer: true }]);
    const secrets = await stepReviewAuth(io, "anthropic", {
      ...BLANK_DETECTION,
      hasAnthropicKey: true,
    });
    expect(secrets).toEqual({});
  });

  it("anthropic: prompts for key when none present", async () => {
    const io = new ScriptedIo([
      { kind: "askSecret", answer: "sk-ant-xyz" },
    ]);
    const secrets = await stepReviewAuth(io, "anthropic", BLANK_DETECTION);
    expect(secrets).toEqual({ anthropicApiKey: "sk-ant-xyz" });
  });

  it("litellm: captures base_url and optional auth key", async () => {
    const io = new ScriptedIo([
      { kind: "ask", answer: "http://localhost:11434/v1" },
      { kind: "askConfirm", answer: true },
      { kind: "askSecret", answer: "sk-proxy-xxx" },
    ]);
    const secrets = await stepReviewAuth(io, "litellm", BLANK_DETECTION);
    expect(secrets).toEqual({
      litellmBaseUrl: "http://localhost:11434/v1",
      litellmApiKey: "sk-proxy-xxx",
    });
  });

  it("codex: reports ready when binary and auth both present", async () => {
    const io = new ScriptedIo([]);
    const secrets = await stepReviewAuth(io, "codex", {
      ...BLANK_DETECTION,
      hasCodexBinary: true,
      hasCodexAuth: true,
    });
    expect(secrets).toEqual({});
    expect(io.log.some((l) => l.includes("[ok]"))).toBe(true);
  });

  it("codex: surfaces install instructions when binary missing", async () => {
    const io = new ScriptedIo([]);
    await stepReviewAuth(io, "codex", BLANK_DETECTION);
    expect(io.log.some((l) => l.includes("codex CLI가 설치"))).toBe(true);
  });

  it("codex: guides user through `codex login` when auth missing", async () => {
    const io = new ScriptedIo([{ kind: "ask", answer: "" }]);
    await stepReviewAuth(io, "codex", {
      ...BLANK_DETECTION,
      hasCodexBinary: true,
    });
    expect(io.log.some((l) => l.includes("codex login"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Step 4: learn provider
// ---------------------------------------------------------------------------

describe("stepLearnProvider", () => {
  it("respects learn=same when review is not main-native", async () => {
    const io = new ScriptedIo([]);
    const learn = await stepLearnProvider(
      io,
      { ...EMPTY_FLAGS, learnProvider: "same" },
      "anthropic",
    );
    expect(learn).toBe<LearnProvider>("anthropic");
  });

  it("warns when learn=same but review=main-native (not supported)", async () => {
    const io = new ScriptedIo([
      { kind: "askChoice", answer: "anthropic" },
    ]);
    const learn = await stepLearnProvider(
      io,
      { ...EMPTY_FLAGS, learnProvider: "same" },
      "main-native",
    );
    expect(learn).toBe<LearnProvider>("anthropic");
    expect(io.log.some((l) => l.includes("main-native"))).toBe(true);
  });

  it("offers review provider as reuse default when compatible", async () => {
    const io = new ScriptedIo([{ kind: "askConfirm", answer: true }]);
    const learn = await stepLearnProvider(io, EMPTY_FLAGS, "anthropic");
    expect(learn).toBe("anthropic");
  });

  it("prompts for separate learn provider when user declines reuse", async () => {
    const io = new ScriptedIo([
      { kind: "askConfirm", answer: false },
      { kind: "askChoice", answer: "codex" },
    ]);
    const learn = await stepLearnProvider(io, EMPTY_FLAGS, "anthropic");
    expect(learn).toBe("codex");
  });
});

// ---------------------------------------------------------------------------
// Step 6: output language
// ---------------------------------------------------------------------------

describe("stepOutputLanguage", () => {
  it("returns flag value without prompting", async () => {
    const io = new ScriptedIo([]);
    const lang = await stepOutputLanguage(io, {
      ...EMPTY_FLAGS,
      outputLanguage: "en",
    });
    expect(lang).toBe("en");
  });

  it("prompts when flag absent", async () => {
    const io = new ScriptedIo([{ kind: "askChoice", answer: "ko" }]);
    const lang = await stepOutputLanguage(io, EMPTY_FLAGS);
    expect(lang).toBe("ko");
  });
});

// ---------------------------------------------------------------------------
// Full orchestrator
// ---------------------------------------------------------------------------

describe("runInteractivePrompts — end-to-end", () => {
  it("main-native review + anthropic learn path", async () => {
    const io = new ScriptedIo([
      // Step 1: profile scope
      { kind: "askChoice", answer: "project" },
      // Step 2: review provider
      { kind: "askChoice", answer: "main-native" },
      // Step 3: no auth for main-native (no prompts)
      // Step 4: learn provider (reuse review? → main-native can't, so pick)
      { kind: "askChoice", answer: "anthropic" },
      // Step 5: learn auth (anthropic, not in env, needs key)
      { kind: "askSecret", answer: "sk-ant-xyz" },
      // Step 6: output language
      { kind: "askChoice", answer: "ko" },
    ]);
    const result = await runInteractivePrompts({
      io,
      flags: EMPTY_FLAGS,
      detection: { ...BLANK_DETECTION, hostIsClaudeCode: true },
    });
    expect(result.decisions).toEqual({
      profileScope: "project",
      reviewProvider: "main-native",
      learnProvider: "anthropic",
      outputLanguage: "ko",
    });
    expect(result.secrets).toEqual({ anthropicApiKey: "sk-ant-xyz" });
  });

  it("anthropic review + same learn provider → single auth prompt", async () => {
    const io = new ScriptedIo([
      { kind: "askChoice", answer: "project" },
      { kind: "askChoice", answer: "anthropic" },
      { kind: "askSecret", answer: "sk-ant-1" },
      { kind: "askConfirm", answer: true },
      { kind: "askChoice", answer: "ko" },
    ]);
    const result = await runInteractivePrompts({
      io,
      flags: EMPTY_FLAGS,
      detection: BLANK_DETECTION,
    });
    expect(result.decisions.reviewProvider).toBe("anthropic");
    expect(result.decisions.learnProvider).toBe("anthropic");
    expect(result.secrets.anthropicApiKey).toBe("sk-ant-1");
  });

  it("flag-only path skips all prompts (hypothetical non-interactive)", async () => {
    const io = new ScriptedIo([]);
    const result = await runInteractivePrompts({
      io,
      flags: {
        ...EMPTY_FLAGS,
        profileScope: "global",
        reviewProvider: "codex",
        learnProvider: "codex",
        outputLanguage: "en",
      },
      detection: {
        ...BLANK_DETECTION,
        hasCodexBinary: true,
        hasCodexAuth: true,
      },
    });
    expect(result.decisions).toEqual({
      profileScope: "global",
      reviewProvider: "codex",
      learnProvider: "codex",
      outputLanguage: "en",
    });
  });
});
