import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildLlmBlock,
  buildProviderActorBlocks,
  parseConfigureProviderArgs,
  runConfigureProvider,
  writeProviderSettings,
  type ProviderSettingsInput,
} from "./configure-provider.js";
import { readSettingsAt } from "../discovery/settings-chain.js";

const tmpDirs: string[] = [];

async function makeTmpSettingsPath(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "onto-configure-provider-"));
  tmpDirs.push(dir);
  return path.join(dir, "settings.json");
}

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop()!;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

const OPENAI_OAUTH: ProviderSettingsInput = {
  provider: "openai",
  model: "gpt-5.5",
  auth: "oauth",
  effort: "medium",
  serviceTier: "fast",
};

describe("buildLlmBlock", () => {
  it("emits only the keys the caller supplied (no defaults)", () => {
    const block = buildLlmBlock({ provider: "openai", model: "gpt-5.5" });
    expect(block).toEqual({ provider: "openai", model: "gpt-5.5" });
  });

  it("includes optional keys when present", () => {
    const block = buildLlmBlock(OPENAI_OAUTH);
    expect(block).toEqual({
      provider: "openai",
      model: "gpt-5.5",
      auth: "oauth",
      effort: "medium",
      service_tier: "fast",
    });
  });

  it("writes api_key_env (a NAME), never an api key value", () => {
    const block = buildLlmBlock({
      provider: "anthropic",
      model: "claude-x",
      auth: "api_key",
      apiKeyEnv: "ANTHROPIC_API_KEY",
    });
    expect(block.api_key_env).toBe("ANTHROPIC_API_KEY");
    expect(JSON.stringify(block)).not.toMatch(/api_key"\s*:/);
  });
});

describe("buildProviderActorBlocks", () => {
  it("uses the seats the v3 schema requires for review actors", () => {
    const blocks = buildProviderActorBlocks(OPENAI_OAUTH);
    expect(blocks.review.teamlead.seat).toBe("main");
    expect(blocks.review.lens.seat).toBe("worker");
    expect(blocks.review.synthesize.seat).toBe("worker");
  });

  it("emits reconstruct actors only when auth is supplied", () => {
    expect(buildProviderActorBlocks(OPENAI_OAUTH).reconstruct).toBeDefined();
    const noAuth = buildProviderActorBlocks({
      provider: "openai",
      model: "gpt-5.5",
    });
    expect(noAuth.reconstruct).toBeUndefined();
  });
});

describe("writeProviderSettings", () => {
  it("writes a file that passes the real loader (review + reconstruct)", async () => {
    const settingsPath = await makeTmpSettingsPath();
    const result = await writeProviderSettings(OPENAI_OAUTH, {
      target: "user",
      settingsPath,
    });
    expect(result.path).toBe(settingsPath);

    // The real loader validates and normalizes it without throwing.
    const loaded = await readSettingsAt(settingsPath);
    expect(loaded.schema_version).toBe("settings.json/v3");
    expect(loaded.review?.execution?.teamlead?.llm?.provider).toBe("openai");
    expect(loaded.review?.execution?.teamlead?.seat).toBe("main");
    expect(
      loaded.reconstruct?.execution?.actors?.semantic_author?.llm.model,
    ).toBe("gpt-5.5");
    expect(
      loaded.reconstruct?.execution?.actors?.confirmation_provider?.llm.auth,
    ).toBe("oauth");
  });

  it("merges, preserving pre-existing unrelated settings", async () => {
    const settingsPath = await makeTmpSettingsPath();
    const existing = {
      schema_version: "settings.json/v3",
      review: {
        mode: "full",
        domains: ["security"],
        execution: {
          topology: "main-workers",
          max_concurrent_lenses: 3,
          units: {
            lens: { timeout_ms: 600000, max_output_bytes: 524288 },
          },
        },
      },
    };
    await fs.writeFile(settingsPath, `${JSON.stringify(existing, null, 2)}\n`, "utf8");

    await writeProviderSettings(OPENAI_OAUTH, { target: "user", settingsPath });

    const raw = JSON.parse(await fs.readFile(settingsPath, "utf8")) as Record<
      string,
      unknown
    >;
    const review = raw.review as Record<string, unknown>;
    const execution = review.execution as Record<string, unknown>;
    // Unrelated settings preserved.
    expect(review.mode).toBe("full");
    expect(review.domains).toEqual(["security"]);
    expect(execution.topology).toBe("main-workers");
    expect(execution.max_concurrent_lenses).toBe(3);
    expect(execution.units).toEqual({
      lens: { timeout_ms: 600000, max_output_bytes: 524288 },
    });
    // Actor blocks set.
    expect((execution.actors as Record<string, unknown>).teamlead).toBeDefined();

    // And it still passes the real loader.
    const loaded = await readSettingsAt(settingsPath);
    expect(loaded.review?.mode).toBe("full");
  });

  it("reads an existing settings file that contains # comments (comment-aware parse, not JSON.parse)", async () => {
    const settingsPath = await makeTmpSettingsPath();
    const existing = {
      schema_version: "settings.json/v3",
      review: { mode: "full", domains: ["security"] },
    };
    // A documented seat: `#` comments are valid for the real loader (YAML) but
    // would break a JSON.parse merge.
    await fs.writeFile(
      settingsPath,
      `# onto provider settings\n${JSON.stringify(existing, null, 2)}\n`,
      "utf8",
    );

    await expect(
      writeProviderSettings(OPENAI_OAUTH, { target: "user", settingsPath }),
    ).resolves.toBeDefined();

    const raw = JSON.parse(await fs.readFile(settingsPath, "utf8")) as Record<
      string,
      unknown
    >;
    const review = raw.review as Record<string, unknown>;
    expect(review.mode).toBe("full");
    expect(review.domains).toEqual(["security"]);
    expect(
      ((review.execution as Record<string, unknown>).actors as Record<
        string,
        unknown
      >).teamlead,
    ).toBeDefined();
  });

  it("rejects an api_key_env that is not a valid env-var name, without echoing the value", async () => {
    const settingsPath = await makeTmpSettingsPath();
    const secretLike = "sk-ant-REALKEY-do-not-echo";
    let caught: Error | undefined;
    try {
      await writeProviderSettings(
        {
          provider: "anthropic",
          model: "claude-x",
          auth: "api_key",
          apiKeyEnv: secretLike,
        },
        { target: "user", settingsPath },
      );
    } catch (error) {
      caught = error as Error;
    }
    expect(caught).toBeDefined();
    expect(caught!.message).toMatch(/environment variable NAME/);
    // The command's "never the key" guarantee: the supplied value is not echoed.
    expect(caught!.message).not.toContain(secretLike);
    // Nothing was written.
    await expect(fs.readFile(settingsPath, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("does not write an `auth` field when auth is omitted", async () => {
    const settingsPath = await makeTmpSettingsPath();
    await writeProviderSettings(
      { provider: "openai", model: "gpt-5.5" },
      { target: "user", settingsPath },
    );
    const raw = JSON.parse(await fs.readFile(settingsPath, "utf8")) as Record<
      string,
      unknown
    >;
    const teamleadLlm = (
      (
        (raw.review as Record<string, unknown>).execution as Record<
          string,
          unknown
        >
      ).actors as Record<string, { llm: Record<string, unknown> }>
    ).teamlead.llm;
    expect(teamleadLlm.auth).toBeUndefined();
    // No reconstruct block (it requires auth).
    expect(raw.reconstruct).toBeUndefined();
    // Still loader-valid (loader derives review auth).
    await expect(readSettingsAt(settingsPath)).resolves.toBeDefined();
  });

  it("never writes an api key value, only api_key_env", async () => {
    const settingsPath = await makeTmpSettingsPath();
    await writeProviderSettings(
      {
        provider: "anthropic",
        model: "claude-x",
        auth: "api_key",
        apiKeyEnv: "ANTHROPIC_API_KEY",
      },
      { target: "user", settingsPath },
    );
    const contents = await fs.readFile(settingsPath, "utf8");
    expect(contents).toContain("ANTHROPIC_API_KEY");
    expect(contents).not.toMatch(/"api_key"\s*:/);
  });

  it("does not write a file when validation fails", async () => {
    const settingsPath = await makeTmpSettingsPath();
    // grok requires auth=api_key; oauth is unroutable -> route check fails.
    await expect(
      writeProviderSettings(
        { provider: "grok", model: "grok-x", auth: "oauth" },
        { target: "user", settingsPath },
      ),
    ).rejects.toThrow();
    await expect(fs.access(settingsPath)).rejects.toThrow();
  });
});

describe("parseConfigureProviderArgs", () => {
  it("parses flags and defaults to the user seat", () => {
    const parsed = parseConfigureProviderArgs([
      "--provider",
      "openai",
      "--model",
      "gpt-5.5",
      "--auth",
      "oauth",
      "--api-key-env",
      "OPENAI_API_KEY",
      "--effort",
      "medium",
      "--service-tier",
      "fast",
      "--base-url",
      "https://example/v1",
    ]);
    expect(parsed.provider).toBe("openai");
    expect(parsed.model).toBe("gpt-5.5");
    expect(parsed.auth).toBe("oauth");
    expect(parsed.apiKeyEnv).toBe("OPENAI_API_KEY");
    expect(parsed.effort).toBe("medium");
    expect(parsed.serviceTier).toBe("fast");
    expect(parsed.baseUrl).toBe("https://example/v1");
    expect(parsed.target).toBe("user");
  });

  it("selects the project seat with --project", () => {
    const parsed = parseConfigureProviderArgs(["--project"]);
    expect(parsed.target).toBe("project");
  });
});

describe("runConfigureProvider", () => {
  it("fails loud (exit 1) when --provider is missing", async () => {
    const settingsPath = await makeTmpSettingsPath();
    const code = await runConfigureProvider([
      "--model",
      "gpt-5.5",
      "--settings-path",
      settingsPath,
    ]);
    expect(code).toBe(1);
    await expect(fs.access(settingsPath)).rejects.toThrow();
  });

  it("fails loud (exit 1) when --model is missing", async () => {
    const settingsPath = await makeTmpSettingsPath();
    const code = await runConfigureProvider([
      "--provider",
      "openai",
      "--settings-path",
      settingsPath,
    ]);
    expect(code).toBe(1);
    await expect(fs.access(settingsPath)).rejects.toThrow();
  });

  it("writes successfully (exit 0) with required flags", async () => {
    const settingsPath = await makeTmpSettingsPath();
    const code = await runConfigureProvider([
      "--provider",
      "openai",
      "--model",
      "gpt-5.5",
      "--auth",
      "oauth",
      "--service-tier",
      "fast",
      "--settings-path",
      settingsPath,
    ]);
    expect(code).toBe(0);
    await expect(readSettingsAt(settingsPath)).resolves.toBeDefined();
  });
});

// ─── INV-MODEL-1 role-aware B3 §5.1-9 (N13): user-owned actor seats survive ───
describe("applyActorBlocks preserves user-owned reconstruct actor seats", () => {
  it("a provider re-run keeps the semantic_map_synthesize seat and the opt-in scalar", async () => {
    const settingsPath = await makeTmpSettingsPath();
    const existing = {
      schema_version: "settings.json/v3",
      reconstruct: {
        execution: {
          actors: {
            semantic_author: {
              llm: { auth: "api_key", provider: "openai", model: "old-model" },
            },
            semantic_map_synthesize: {
              llm: {
                auth: "oauth",
                provider: "anthropic",
                model: "claude-haiku-4-5-20251001",
                effort: "low",
              },
            },
          },
          semantic_map_authoring: true,
        },
      },
    };
    await fs.writeFile(
      settingsPath,
      `${JSON.stringify(existing, null, 2)}\n`,
      "utf8",
    );

    await writeProviderSettings(OPENAI_OAUTH, { target: "user", settingsPath });

    const loaded = await readSettingsAt(settingsPath);
    // Provider-managed seats overwritten…
    expect(loaded.reconstruct?.execution?.actors?.semantic_author?.llm.model)
      .toBe("gpt-5.5");
    expect(
      loaded.reconstruct?.execution?.actors?.confirmation_provider?.llm.model,
    ).toBe("gpt-5.5");
    // …user-owned seat and execution-level scalar PRESERVED (N13 — the old
    // wholesale replacement deleted the synthesize seat silently).
    expect(
      loaded.reconstruct?.execution?.actors?.semantic_map_synthesize?.llm.model,
    ).toBe("claude-haiku-4-5-20251001");
    expect(loaded.reconstruct?.execution?.semantic_map_authoring).toBe(true);
  });
});
