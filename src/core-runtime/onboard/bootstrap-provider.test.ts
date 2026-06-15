import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BOOTSTRAP_ENV,
  PROVIDER_API_KEY_ENV,
  bootstrapProviderFromEnv,
} from "./bootstrap-provider.js";
import { writeProviderSettings } from "./configure-provider.js";
import { userSettingsPath } from "../discovery/settings-chain.js";

// First-run `.mcpb` bootstrap: consumes the install-time provider env ONCE to
// materialize ~/.onto/settings.json via the configure-provider write-path.
// INV-CFG-1 (no code-side provider/auth/model default — values come from env),
// INV-AUTH-1 (blank auth -> loader-consistent derivation, never inferred from
// key presence), and secret-safety (only the api_key_env NAME is persisted; the
// key VALUE never lands in the file or on the failure path).
//
// The seat is isolated by pointing HOME at a temp dir (os.homedir() honors
// $HOME), so `userSettingsPath()` — used for both the idempotency read and the
// write — resolves under the scratch tree, never the real ~/.onto/settings.json.

let scratchRoot = "";
let originalHome: string | undefined;

function ontoDir(): string {
  return path.dirname(userSettingsPath());
}

function settingsExists(): boolean {
  return fs.existsSync(userSettingsPath());
}

function readSettings(): Record<string, any> {
  return JSON.parse(fs.readFileSync(userSettingsPath(), "utf8"));
}

/** Capture process.stderr.write output for the duration of `fn`. */
async function captureStderr(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const original = process.stderr.write;
  process.stderr.write = ((chunk: unknown) => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  try {
    await fn();
  } finally {
    process.stderr.write = original;
  }
  return chunks.join("");
}

describe("bootstrapProviderFromEnv", () => {
  beforeEach(() => {
    scratchRoot = fs.mkdtempSync(path.join(os.tmpdir(), "onto-bootstrap-"));
    originalHome = process.env.HOME;
    process.env.HOME = path.join(scratchRoot, "home");
    fs.mkdirSync(process.env.HOME, { recursive: true });
  });

  afterEach(() => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  });

  it("(a) skips and writes nothing when no bootstrap env is present", async () => {
    const result = await bootstrapProviderFromEnv({} as NodeJS.ProcessEnv);
    expect(result.status).toBe("skipped");
    expect(settingsExists()).toBe(false);
  });

  it("(b) blank auth -> writes review AND reconstruct actors with loader-consistent auth; key value never in file", async () => {
    const SENTINEL = "sk-CASE-B-RAW-KEY-NEVER-PERSISTED";
    const result = await bootstrapProviderFromEnv({
      [BOOTSTRAP_ENV.provider]: "openai",
      [BOOTSTRAP_ENV.model]: "gpt-5.5",
      // auth deliberately omitted (blank) -> loader-consistent derivation.
      [PROVIDER_API_KEY_ENV]: SENTINEL,
    } as NodeJS.ProcessEnv);
    expect(result.status).toBe("written");
    expect(settingsExists()).toBe(true);

    const settings = readSettings();
    const reviewActors = settings.review.execution.actors;
    // openai's loader-consistent default auth is oauth (model-switcher).
    expect(reviewActors.teamlead.llm.auth).toBe("oauth");
    expect(reviewActors.teamlead.seat).toBe("main");
    expect(reviewActors.lens.seat).toBe("worker");
    expect(reviewActors.synthesize.seat).toBe("worker");
    // Reconstruct actors materialize because auth is present.
    const reconstructActors = settings.reconstruct.execution.actors;
    expect(reconstructActors.semantic_author.llm.provider).toBe("openai");
    expect(reconstructActors.confirmation_provider.llm.auth).toBe("oauth");

    // Only the env-var NAME is persisted; the raw key VALUE never appears.
    const raw = fs.readFileSync(userSettingsPath(), "utf8");
    expect(raw).toContain(PROVIDER_API_KEY_ENV);
    expect(raw).not.toContain(SENTINEL);
    expect(reviewActors.teamlead.llm.api_key_env).toBe(PROVIDER_API_KEY_ENV);
  });

  it("(c) literal ${user_config.*} placeholders are treated as absent (no junk auth, no api_key_env)", async () => {
    const result = await bootstrapProviderFromEnv({
      [BOOTSTRAP_ENV.provider]: "openai",
      [BOOTSTRAP_ENV.model]: "gpt-5.5",
      [BOOTSTRAP_ENV.auth]: "${user_config.auth}",
      [PROVIDER_API_KEY_ENV]: "${user_config.api_key}",
    } as NodeJS.ProcessEnv);
    expect(result.status).toBe("written");

    const settings = readSettings();
    // Placeholder auth ignored -> loader-consistent derivation (oauth), not the
    // literal token.
    expect(settings.review.execution.actors.teamlead.llm.auth).toBe("oauth");
    // Placeholder api key ignored -> NO api_key_env anywhere in the file.
    expect(fs.readFileSync(userSettingsPath(), "utf8")).not.toContain(
      "api_key_env",
    );
  });

  it("(c-variant) blank-string auth and api_key are treated as absent", async () => {
    const result = await bootstrapProviderFromEnv({
      [BOOTSTRAP_ENV.provider]: "openai",
      [BOOTSTRAP_ENV.model]: "gpt-5.5",
      [BOOTSTRAP_ENV.auth]: "",
      [PROVIDER_API_KEY_ENV]: "",
    } as NodeJS.ProcessEnv);
    expect(result.status).toBe("written");

    const settings = readSettings();
    expect(settings.review.execution.actors.teamlead.llm.auth).toBe("oauth");
    expect(fs.readFileSync(userSettingsPath(), "utf8")).not.toContain(
      "api_key_env",
    );
  });

  it("(d1) routable provider with a bad auth combo (grok+oauth) fails with no file written", async () => {
    const result = await bootstrapProviderFromEnv({
      [BOOTSTRAP_ENV.provider]: "grok",
      [BOOTSTRAP_ENV.model]: "grok-x",
      [BOOTSTRAP_ENV.auth]: "oauth",
    } as NodeJS.ProcessEnv);
    expect(result.status).toBe("failed");
    // Pre-write route guard (assertActorRoutes) rejects -> nothing on disk.
    expect(settingsExists()).toBe(false);
  });

  it("(d2) invalid free-text provider (claude) is rejected by the loader enum; no file, stderr has no key", async () => {
    const SENTINEL = "sk-CASE-D2-RAW-KEY";
    const stderr = await captureStderr(async () => {
      const result = await bootstrapProviderFromEnv({
        [BOOTSTRAP_ENV.provider]: "claude",
        [BOOTSTRAP_ENV.model]: "claude-x",
        [PROVIDER_API_KEY_ENV]: SENTINEL,
      } as NodeJS.ProcessEnv);
      expect(result.status).toBe("failed");
    });
    expect(settingsExists()).toBe(false);
    // The fail-loud stderr line must never carry the key value.
    expect(stderr).not.toContain(SENTINEL);
  });

  it("(e) a complete, valid seat is left untouched (skip, no clobber)", async () => {
    // Seed a complete, valid seat (review + reconstruct) via the real
    // write-path so it is guaranteed loader-valid.
    await writeProviderSettings(
      {
        provider: "anthropic",
        model: "claude-x",
        auth: "api_key",
        apiKeyEnv: "ANTHROPIC_API_KEY",
      },
      { target: "user" },
    );
    const before = fs.readFileSync(userSettingsPath(), "utf8");

    // Bootstrap with a DIFFERENT provider must not clobber the existing seat.
    const result = await bootstrapProviderFromEnv({
      [BOOTSTRAP_ENV.provider]: "openai",
      [BOOTSTRAP_ENV.model]: "gpt-5.5",
      [BOOTSTRAP_ENV.auth]: "oauth",
    } as NodeJS.ProcessEnv);
    expect(result.status).toBe("skipped");

    const after = fs.readFileSync(userSettingsPath(), "utf8");
    expect(after).toBe(before);
    expect(readSettings().review.execution.actors.teamlead.llm.provider).toBe(
      "anthropic",
    );
  });

  it("(f) a forced fs write failure never leaks the sentinel api key to stderr", async () => {
    const SENTINEL = "sk-CASE-F-SENTINEL-MUST-NOT-LEAK";
    // Force the write to fail: place a FILE where the .onto directory must be.
    fs.writeFileSync(ontoDir(), "not a directory");

    const stderr = await captureStderr(async () => {
      const result = await bootstrapProviderFromEnv({
        [BOOTSTRAP_ENV.provider]: "openai",
        [BOOTSTRAP_ENV.model]: "gpt-5.5",
        [BOOTSTRAP_ENV.auth]: "oauth",
        [PROVIDER_API_KEY_ENV]: SENTINEL,
      } as NodeJS.ProcessEnv);
      expect(result.status).toBe("failed");
    });

    // The secret-safe failure path emits a fixed prefix + error.message only.
    expect(stderr).not.toContain(SENTINEL);
    expect(stderr.length).toBeGreaterThan(0);
  });
});
