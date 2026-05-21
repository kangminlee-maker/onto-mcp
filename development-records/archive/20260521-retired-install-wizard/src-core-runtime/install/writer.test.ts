import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import {
  parseEnv,
  renderConfigYml,
  renderEnv,
  renderEnvExample,
  resolveInstallPaths,
  writeInstallFiles,
} from "./writer.js";
import type { InstallDecisions } from "./types.js";

const SAMPLE: InstallDecisions = {
  profileScope: "project",
  reviewProvider: "anthropic",
  learnProvider: "anthropic",
  outputLanguage: "ko",
};

describe("resolveInstallPaths", () => {
  it("global scope points at ~/.onto/ and omits gitignorePath", () => {
    const paths = resolveInstallPaths("global", "/unused", "/home/tester");
    expect(paths.ontoDir).toBe("/home/tester/.onto");
    expect(paths.configYmlPath).toBe("/home/tester/.onto/config.yml");
    expect(paths.envPath).toBe("/home/tester/.onto/.env");
    expect(paths.envExamplePath).toBe("/home/tester/.onto/.env.example");
    expect(paths.gitignorePath).toBeUndefined();
  });

  it("project scope points at <projectRoot>/.onto/ and sets gitignorePath", () => {
    const paths = resolveInstallPaths("project", "/tmp/proj", "/home/tester");
    expect(paths.ontoDir).toBe("/tmp/proj/.onto");
    expect(paths.configYmlPath).toBe("/tmp/proj/.onto/config.yml");
    expect(paths.envPath).toBe("/tmp/proj/.onto/.env");
    expect(paths.envExamplePath).toBe("/tmp/proj/.onto/.env.example");
    expect(paths.gitignorePath).toBe("/tmp/proj/.gitignore");
  });
});

describe("renderConfigYml", () => {
  it("sets review.subagent.provider and subagent_llm.provider", () => {
    const out = renderConfigYml(SAMPLE);
    const parsed = yaml.parse(stripHeader(out)) as Record<string, unknown>;
    expect(parsed.output_language).toBe("ko");
    expect(parsed.review).toEqual({ subagent: { provider: "anthropic" } });
    expect(parsed.subagent_llm).toEqual({ provider: "anthropic" });
    expect(parsed.external_http_provider).toBe("anthropic");
  });

  it("omits external_http_provider for codex learn (codex not a valid value)", () => {
    const decisions: InstallDecisions = {
      ...SAMPLE,
      reviewProvider: "codex",
      learnProvider: "codex",
    };
    const parsed = yaml.parse(stripHeader(renderConfigYml(decisions))) as Record<
      string,
      unknown
    >;
    expect(parsed.external_http_provider).toBeUndefined();
    expect(parsed.subagent_llm).toEqual({ provider: "codex" });
  });

  it("records main-native review provider without external fields", () => {
    const decisions: InstallDecisions = {
      ...SAMPLE,
      reviewProvider: "main-native",
      learnProvider: "anthropic",
    };
    const parsed = yaml.parse(stripHeader(renderConfigYml(decisions))) as Record<
      string,
      unknown
    >;
    expect(parsed.review).toEqual({
      subagent: { provider: "main-native" },
    });
    expect(parsed.external_http_provider).toBe("anthropic");
  });

  it("emits a human-readable header comment at the top", () => {
    const out = renderConfigYml(SAMPLE);
    expect(out.startsWith("# Written by `onto install`")).toBe(true);
    expect(out).toContain("onto config edit");
  });
});

describe("parseEnv / renderEnv", () => {
  it("parses KEY=VALUE lines and skips comments/blank lines", () => {
    const input = [
      "# comment",
      "",
      "FOO=bar",
      "  # indented comment",
      "BAZ=quux=extra",
      "malformed-line-no-equals",
    ].join("\n");
    const kv = parseEnv(input);
    expect(kv.get("FOO")).toBe("bar");
    expect(kv.get("BAZ")).toBe("quux=extra");
    expect(kv.has("malformed-line-no-equals")).toBe(false);
  });

  it("renderEnv emits keys sorted alphabetically", () => {
    const kv = new Map([
      ["ZZZ", "last"],
      ["AAA", "first"],
      ["MMM", "middle"],
    ]);
    const out = renderEnv(kv);
    const keyOrder = out
      .split("\n")
      .filter((line) => !line.startsWith("#") && line.includes("="))
      .map((line) => line.split("=")[0]);
    expect(keyOrder).toEqual(["AAA", "MMM", "ZZZ"]);
  });

  it("roundtrips through parse → render", () => {
    const original = new Map([
      ["ANTHROPIC_API_KEY", "sk-ant-xyz"],
      ["LITELLM_BASE_URL", "http://localhost:4000/v1"],
    ]);
    const rendered = renderEnv(original);
    const reparsed = parseEnv(rendered);
    expect(reparsed).toEqual(original);
  });
});

describe("renderEnvExample", () => {
  it("includes sections only for selected providers", () => {
    const anthOnly = renderEnvExample({
      ...SAMPLE,
      reviewProvider: "anthropic",
      learnProvider: "anthropic",
    });
    expect(anthOnly).toContain("ANTHROPIC_API_KEY");
    expect(anthOnly).not.toContain("OPENAI_API_KEY");
    expect(anthOnly).not.toContain("LITELLM_BASE_URL");
  });

  it("includes LiteLLM guidance block with local runtime examples", () => {
    const out = renderEnvExample({
      ...SAMPLE,
      reviewProvider: "litellm",
      learnProvider: "litellm",
    });
    expect(out).toContain("LITELLM_BASE_URL");
    expect(out).toContain("Ollama");
    expect(out).toContain("http://localhost:11434/v1");
    expect(out).toContain("# LITELLM_API_KEY=");
  });

  it("merges sections when review and learn providers differ", () => {
    const out = renderEnvExample({
      ...SAMPLE,
      reviewProvider: "openai",
      learnProvider: "anthropic",
    });
    expect(out).toContain("OPENAI_API_KEY");
    expect(out).toContain("ANTHROPIC_API_KEY");
  });

  it("produces no provider sections for codex-only setup", () => {
    const out = renderEnvExample({
      ...SAMPLE,
      reviewProvider: "codex",
      learnProvider: "codex",
    });
    expect(out).not.toContain("ANTHROPIC_API_KEY");
    expect(out).not.toContain("OPENAI_API_KEY");
    expect(out).not.toContain("LITELLM_BASE_URL");
  });
});

describe("writeInstallFiles", () => {
  let tmpHome: string;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "onto-install-writer-"));
  });

  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("creates .onto/ and writes all three files with correct modes", () => {
    const paths = resolveInstallPaths("global", "/unused", tmpHome);
    const result = writeInstallFiles({
      paths,
      decisions: SAMPLE,
      secrets: { anthropicApiKey: "sk-ant-test" },
    });

    expect(fs.existsSync(paths.ontoDir)).toBe(true);
    expect(fs.existsSync(paths.configYmlPath)).toBe(true);
    expect(fs.existsSync(paths.envPath)).toBe(true);
    expect(fs.existsSync(paths.envExamplePath)).toBe(true);

    expect(fs.readFileSync(paths.configYmlPath, "utf8")).toBe(result.configYml);
    expect(fs.readFileSync(paths.envPath, "utf8")).toBe(result.env);

    // .env mode should be 0600 on POSIX.
    if (process.platform !== "win32") {
      const mode = fs.statSync(paths.envPath).mode & 0o777;
      expect(mode).toBe(0o600);
    }
  });

  it("preserves unrelated keys during .env merge", () => {
    const paths = resolveInstallPaths("global", "/unused", tmpHome);
    fs.mkdirSync(paths.ontoDir, { recursive: true });
    fs.writeFileSync(
      paths.envPath,
      "# user\nCUSTOM_TOOL_KEY=preserve-me\nANTHROPIC_API_KEY=old-value\n",
    );

    writeInstallFiles({
      paths,
      decisions: SAMPLE,
      secrets: { anthropicApiKey: "new-value" },
    });

    const merged = parseEnv(fs.readFileSync(paths.envPath, "utf8"));
    expect(merged.get("CUSTOM_TOOL_KEY")).toBe("preserve-me");
    expect(merged.get("ANTHROPIC_API_KEY")).toBe("new-value");
  });

  it("dry-run returns content without touching the filesystem", () => {
    const paths = resolveInstallPaths("global", "/unused", tmpHome);
    const result = writeInstallFiles({
      paths,
      decisions: SAMPLE,
      secrets: { anthropicApiKey: "sk-ant-test" },
      dryRun: true,
    });

    expect(fs.existsSync(paths.ontoDir)).toBe(false);
    expect(result.configYml).toContain("output_language: ko");
    expect(result.env).toContain("ANTHROPIC_API_KEY=sk-ant-test");
  });

  it("atomic write: no partial temp file left behind on success", () => {
    const paths = resolveInstallPaths("global", "/unused", tmpHome);
    writeInstallFiles({
      paths,
      decisions: SAMPLE,
      secrets: { anthropicApiKey: "sk" },
    });
    const files = fs.readdirSync(paths.ontoDir);
    const tmpFiles = files.filter((f) => f.startsWith(".") && f.includes(".tmp-"));
    expect(tmpFiles).toEqual([]);
  });
});

/** Strip the leading comment header block so `yaml.parse` sees clean YAML. */
function stripHeader(text: string): string {
  return text
    .split("\n")
    .filter((line) => !line.startsWith("#"))
    .join("\n");
}
