import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  mergeReconstructSettings,
  readSettingsAt,
  type DispatchFallbackSettings,
} from "./settings-chain.js";
import {
  collectSupportedModelDispatches,
} from "./supported-models.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function writeSettings(value: unknown): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "onto-fallback-settings-"));
  roots.push(root);
  const file = path.join(root, "settings.json");
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

const enabled: DispatchFallbackSettings = {
  enabled: true,
  trigger: "rate_limit",
  max_fallback_passes: 1,
  per_dispatch_max_provider_attempts: 1,
  systemic_failure_threshold: 1,
  llm: {
    provider: "anthropic",
    auth: "api_key",
    model: "model-b",
    effort: "medium",
    api_key_env: "ANTHROPIC_API_KEY",
  },
};

describe("dispatch fallback settings", () => {
  it("accepts the complete enabled form and emits named synthesize+verify dispatches", async () => {
    const file = await writeSettings({
      schema_version: "settings.json/v3",
      reconstruct: { execution: { dispatch_fallback: enabled } },
    });
    const settings = await readSettingsAt(file);
    expect(settings.reconstruct?.execution?.dispatch_fallback).toEqual(enabled);
    expect(
      collectSupportedModelDispatches(settings)
        .filter((route) => route.path.includes("dispatch_fallback"))
        .map((route) => route.requiredRole),
    ).toEqual(["semantic_map_synthesize", "semantic_map_verify"]);
  });

  it("rejects partial enabled forms, non-literal limits, and unknown fields", async () => {
    for (const dispatchFallback of [
      { enabled: true },
      { ...enabled, max_fallback_passes: 2 },
      { ...enabled, llm: { ...enabled.llm, base_url: "https://example.invalid" } },
    ]) {
      const file = await writeSettings({
        schema_version: "settings.json/v3",
        reconstruct: { execution: { dispatch_fallback: dispatchFallback } },
      });
      await expect(readSettingsAt(file)).rejects.toThrow("Invalid onto settings");
    }
  });

  it("uses project whole-object replacement instead of credential-field deep merge", () => {
    const merged = mergeReconstructSettings(
      { execution: { dispatch_fallback: enabled } },
      { execution: { dispatch_fallback: { enabled: false } } },
    );
    expect(merged?.execution?.dispatch_fallback).toEqual({ enabled: false });
  });
});
