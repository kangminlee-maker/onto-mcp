/**
 * Integration-level tests for `onto install`.
 *
 * These drive `handleInstallCliWithOverrides()` with real argv,
 * scoped to a tmp HOME + tmp project root, and exercise the full
 * non-interactive orchestration end-to-end (flag parsing → preflight
 * → decision resolution → write → validate → completion). Network
 * calls go through a stub `fetch` passed via the overrides struct.
 *
 * The goal is to cover PR 4's promised scenario matrix:
 *   - global-anthropic happy path
 *   - project-main-native (with a learn provider required by design)
 *   - reconfigure guard + --reconfigure bypass
 *   - dry-run
 *   - validation failure
 *   - env-file loading
 *   - ONTO_INSTALL_* env fallback
 *
 * Interactive path unit coverage lives in `prompts.test.ts`; this
 * file intentionally skips re-covering prompts.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "yaml";
import { handleInstallCliWithOverrides } from "./cli.js";

const MANAGED_ENV = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "LITELLM_BASE_URL",
  "LITELLM_API_KEY",
  "ONTO_INSTALL_NON_INTERACTIVE",
  "ONTO_INSTALL_PROFILE_SCOPE",
  "ONTO_INSTALL_REVIEW_PROVIDER",
  "ONTO_INSTALL_LEARN_PROVIDER",
  "ONTO_INSTALL_OUTPUT_LANGUAGE",
  "ONTO_INSTALL_LITELLM_BASE_URL",
  "ONTO_INSTALL_ENV_FILE",
  "ONTO_INSTALL_RECONFIGURE",
  "ONTO_INSTALL_SKIP_VALIDATION",
  "ONTO_INSTALL_DRY_RUN",
  "CLAUDECODE",
  "CLAUDE_PROJECT_DIR",
  "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS",
];

let savedEnv: Record<string, string | undefined>;

function saveAndClearEnv(): void {
  savedEnv = {};
  for (const key of MANAGED_ENV) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  savedEnv.PATH = process.env.PATH;
  process.env.PATH = "";
  savedEnv.HOME = process.env.HOME;
}

function restoreEnv(): void {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function stubFetchReturning(status: number): typeof fetch {
  return (async () =>
    new Response("{}", { status })) as unknown as typeof fetch;
}

describe("handleInstallCliWithOverrides — non-interactive E2E", () => {
  let tmpHome: string;
  let tmpProject: string;
  let stdout: string[];
  let stderr: string[];

  beforeEach(() => {
    saveAndClearEnv();
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "onto-install-e2e-home-"));
    tmpProject = fs.mkdtempSync(
      path.join(os.tmpdir(), "onto-install-e2e-proj-"),
    );
    process.env.HOME = tmpHome;
    stdout = [];
    stderr = [];
  });

  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(tmpProject, { recursive: true, force: true });
    restoreEnv();
  });

  function runInstall(
    argv: string[],
    extras: {
      fetch?: typeof fetch;
      envOverrides?: Record<string, string>;
    } = {},
  ): Promise<number> {
    for (const [k, v] of Object.entries(extras.envOverrides ?? {})) {
      process.env[k] = v;
    }
    return handleInstallCliWithOverrides("/unused", argv, {
      homeDir: tmpHome,
      projectRoot: tmpProject,
      ...(extras.fetch ? { fetch: extras.fetch } : {}),
      write: (t) => stdout.push(t),
      writeErr: (t) => stderr.push(t),
    });
  }

  // -------------------------------------------------------------------
  // Happy paths
  // -------------------------------------------------------------------

  it("global-anthropic writes config.yml + .env at ~/.onto/ and passes validation", async () => {
    const exit = await runInstall(
      [
        "--non-interactive",
        "--profile-scope",
        "global",
        "--review-provider",
        "anthropic",
        "--learn-provider",
        "same",
      ],
      {
        fetch: stubFetchReturning(200),
        envOverrides: { ANTHROPIC_API_KEY: "sk-ant-xyz" },
      },
    );
    expect(exit).toBe(0);

    const configYmlPath = path.join(tmpHome, ".onto", "config.yml");
    expect(fs.existsSync(configYmlPath)).toBe(true);
    const config = yaml.parse(
      fs.readFileSync(configYmlPath, "utf8").replace(/^#[^\n]*\n/g, ""),
    );
    expect(config.output_language).toBe("ko");
    expect(config.review.subagent.provider).toBe("anthropic");
    expect(config.subagent_llm.provider).toBe("anthropic");
    expect(config.external_http_provider).toBe("anthropic");

    const envPath = path.join(tmpHome, ".onto", ".env");
    const envText = fs.readFileSync(envPath, "utf8");
    expect(envText).toContain("ANTHROPIC_API_KEY=sk-ant-xyz");

    const mode = fs.statSync(envPath).mode & 0o777;
    if (process.platform !== "win32") expect(mode).toBe(0o600);
  });

  it("project scope adds .onto/.env to .gitignore", async () => {
    await runInstall(
      [
        "--non-interactive",
        "--profile-scope",
        "project",
        "--review-provider",
        "anthropic",
        "--learn-provider",
        "same",
        "--skip-validation",
      ],
      { envOverrides: { ANTHROPIC_API_KEY: "sk-ant-xyz" } },
    );

    const giPath = path.join(tmpProject, ".gitignore");
    expect(fs.existsSync(giPath)).toBe(true);
    expect(fs.readFileSync(giPath, "utf8")).toContain(".onto/.env");
  });

  it("main-native review + separate learn provider succeeds with Claude Code host", async () => {
    const exit = await runInstall(
      [
        "--non-interactive",
        "--profile-scope",
        "global",
        "--review-provider",
        "main-native",
        "--learn-provider",
        "anthropic",
      ],
      {
        fetch: stubFetchReturning(200),
        envOverrides: { ANTHROPIC_API_KEY: "sk-ant-xyz", CLAUDECODE: "1" },
      },
    );
    expect(exit).toBe(0);

    const config = yaml.parse(
      fs
        .readFileSync(path.join(tmpHome, ".onto", "config.yml"), "utf8")
        .replace(/^#[^\n]*\n/g, ""),
    );
    expect(config.review.subagent.provider).toBe("main-native");
    expect(config.subagent_llm.provider).toBe("anthropic");
  });

  // -------------------------------------------------------------------
  // Flag validation
  // -------------------------------------------------------------------

  it("errors when required flags are missing in non-interactive mode", async () => {
    const exit = await runInstall([
      "--non-interactive",
      "--review-provider",
      "anthropic",
      // missing --profile-scope
    ]);
    expect(exit).toBe(1);
    expect(stderr.join("")).toContain("--profile-scope");
  });

  it("errors when review=main-native but no explicit --learn-provider", async () => {
    const exit = await runInstall([
      "--non-interactive",
      "--profile-scope",
      "global",
      "--review-provider",
      "main-native",
      // learn-provider defaults to 'same' which can't be main-native
    ]);
    expect(exit).toBe(1);
    expect(stderr.join("")).toContain("main-native");
  });

  it("errors when credentials are missing", async () => {
    const exit = await runInstall([
      "--non-interactive",
      "--profile-scope",
      "global",
      "--review-provider",
      "anthropic",
      "--learn-provider",
      "same",
      "--skip-validation",
    ]);
    expect(exit).toBe(1);
    expect(stderr.join("")).toContain("ANTHROPIC_API_KEY");
  });

  // -------------------------------------------------------------------
  // Reconfigure guard
  // -------------------------------------------------------------------

  it("halts when existing config present and --reconfigure absent", async () => {
    fs.mkdirSync(path.join(tmpHome, ".onto"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpHome, ".onto", "config.yml"),
      "output_language: en\n",
    );

    const exit = await runInstall([
      "--non-interactive",
      "--profile-scope",
      "global",
      "--review-provider",
      "anthropic",
      "--learn-provider",
      "same",
    ]);
    expect(exit).toBe(1);
    expect(stderr.join("")).toContain("기존 config");
  });

  it("proceeds when --reconfigure is set", async () => {
    fs.mkdirSync(path.join(tmpHome, ".onto"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpHome, ".onto", "config.yml"),
      "output_language: en\n",
    );

    const exit = await runInstall(
      [
        "--non-interactive",
        "--profile-scope",
        "global",
        "--review-provider",
        "anthropic",
        "--learn-provider",
        "same",
        "--reconfigure",
        "--skip-validation",
      ],
      { envOverrides: { ANTHROPIC_API_KEY: "sk-ant-xyz" } },
    );
    expect(exit).toBe(0);
    const content = fs.readFileSync(
      path.join(tmpHome, ".onto", "config.yml"),
      "utf8",
    );
    expect(content).toContain("output_language: ko");
  });

  // -------------------------------------------------------------------
  // Dry-run
  // -------------------------------------------------------------------

  it("--dry-run leaves no files on disk", async () => {
    const exit = await runInstall(
      [
        "--non-interactive",
        "--profile-scope",
        "global",
        "--review-provider",
        "anthropic",
        "--learn-provider",
        "same",
        "--dry-run",
      ],
      { envOverrides: { ANTHROPIC_API_KEY: "sk-ant-xyz" } },
    );
    expect(exit).toBe(0);
    expect(fs.existsSync(path.join(tmpHome, ".onto", "config.yml"))).toBe(
      false,
    );
    expect(stdout.join("")).toContain("미리보기");
  });

  // -------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------

  it("exits 1 when live validation fails", async () => {
    const exit = await runInstall(
      [
        "--non-interactive",
        "--profile-scope",
        "global",
        "--review-provider",
        "anthropic",
        "--learn-provider",
        "same",
      ],
      {
        fetch: stubFetchReturning(401),
        envOverrides: { ANTHROPIC_API_KEY: "sk-bad" },
      },
    );
    expect(exit).toBe(1);
    expect(stderr.join("")).toContain("provider 검증 실패");
  });

  it("--skip-validation bypasses the ping", async () => {
    const exit = await runInstall(
      [
        "--non-interactive",
        "--profile-scope",
        "global",
        "--review-provider",
        "anthropic",
        "--learn-provider",
        "same",
        "--skip-validation",
      ],
      { envOverrides: { ANTHROPIC_API_KEY: "sk-bad" } },
    );
    expect(exit).toBe(0);
  });

  // -------------------------------------------------------------------
  // env-file loading
  // -------------------------------------------------------------------

  it("--env-file loads credentials from the specified file", async () => {
    const envFilePath = path.join(tmpProject, "custom.env");
    fs.writeFileSync(envFilePath, "ANTHROPIC_API_KEY=sk-from-file\n");

    const exit = await runInstall(
      [
        "--non-interactive",
        "--profile-scope",
        "global",
        "--review-provider",
        "anthropic",
        "--learn-provider",
        "same",
        "--env-file",
        envFilePath,
        "--skip-validation",
      ],
    );
    expect(exit).toBe(0);
    const envText = fs.readFileSync(
      path.join(tmpHome, ".onto", ".env"),
      "utf8",
    );
    expect(envText).toContain("ANTHROPIC_API_KEY=sk-from-file");
  });

  it("--env-file errors when path does not exist", async () => {
    const exit = await runInstall([
      "--non-interactive",
      "--env-file",
      "/no/such/file",
    ]);
    expect(exit).toBe(1);
    expect(stderr.join("")).toContain("--env-file");
  });

  // -------------------------------------------------------------------
  // ONTO_INSTALL_* env fallback
  // -------------------------------------------------------------------

  it("reads ONTO_INSTALL_* env vars as flag defaults", async () => {
    const exit = await runInstall(
      ["--skip-validation"],
      {
        envOverrides: {
          ONTO_INSTALL_NON_INTERACTIVE: "1",
          ONTO_INSTALL_PROFILE_SCOPE: "global",
          ONTO_INSTALL_REVIEW_PROVIDER: "anthropic",
          ONTO_INSTALL_LEARN_PROVIDER: "same",
          ONTO_INSTALL_OUTPUT_LANGUAGE: "en",
          ANTHROPIC_API_KEY: "sk-ant-xyz",
        },
      },
    );
    expect(exit).toBe(0);
    const config = yaml.parse(
      fs
        .readFileSync(path.join(tmpHome, ".onto", "config.yml"), "utf8")
        .replace(/^#[^\n]*\n/g, ""),
    );
    expect(config.output_language).toBe("en");
  });

  it("argv flag wins over ONTO_INSTALL_* env", async () => {
    await runInstall(
      [
        "--non-interactive",
        "--profile-scope",
        "global",
        "--review-provider",
        "anthropic",
        "--learn-provider",
        "same",
        "--output-language",
        "ko",
        "--skip-validation",
      ],
      {
        envOverrides: {
          ONTO_INSTALL_OUTPUT_LANGUAGE: "en",
          ANTHROPIC_API_KEY: "sk-ant-xyz",
        },
      },
    );
    const config = yaml.parse(
      fs
        .readFileSync(path.join(tmpHome, ".onto", "config.yml"), "utf8")
        .replace(/^#[^\n]*\n/g, ""),
    );
    expect(config.output_language).toBe("ko");
  });

  // -------------------------------------------------------------------
  // --help
  // -------------------------------------------------------------------

  it("--help prints usage and returns 0 without touching disk", async () => {
    const exit = await runInstall(["--help"]);
    expect(exit).toBe(0);
    expect(stdout.join("")).toContain("Usage: onto install");
    expect(fs.existsSync(path.join(tmpHome, ".onto"))).toBe(false);
  });
});
