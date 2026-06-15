import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BOOTSTRAP_ENV,
  PROVIDER_API_KEY_ENV,
} from "../core-runtime/onboard/bootstrap-provider.js";
import { OntoSimpleProfileToolNames } from "./tool-schemas.js";

// Drift/binding guard for the `.mcpb` Desktop Extension manifest. The manifest
// is the install-time contract: its env keys MUST equal the bootstrap env
// constants (not re-typed literals) and its advertised tools MUST equal the
// simple profile. INV-CFG-1: no `default` lives in user_config (every provider
// value is supplied at install time, never baked into the manifest).

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.resolve(
  thisDir,
  "../../packaging/mcpb/manifest.json",
);

function loadManifest(): Record<string, any> {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
}

describe("mcpb manifest (Phase 1 item 4 — Desktop Extension binding)", () => {
  it("declares manifest_version 0.3 and the simple profile + hermetic launch env", () => {
    const manifest = loadManifest();
    expect(manifest.manifest_version).toBe("0.3");
    const env = manifest.server.mcp_config.env;
    expect(env.ONTO_MCP_PROFILE).toBe("simple");
    expect(env.ONTO_HOME).toBe("${__dirname}");
  });

  it("maps each BOOTSTRAP_ENV / PROVIDER_API_KEY_ENV key to the matching ${user_config.*} token", () => {
    const env = loadManifest().server.mcp_config.env as Record<string, string>;

    // The provider env keys the manifest injects must be EXACTLY the bootstrap
    // constants plus the api-key env — compared against the imported consts,
    // never re-typed string literals.
    const expectedProviderKeys = [
      BOOTSTRAP_ENV.provider,
      BOOTSTRAP_ENV.model,
      BOOTSTRAP_ENV.auth,
      PROVIDER_API_KEY_ENV,
    ].sort();
    const fixedKeys = new Set(["ONTO_HOME", "ONTO_MCP_PROFILE"]);
    const actualProviderKeys = Object.keys(env)
      .filter((key) => !fixedKeys.has(key))
      .sort();
    expect(actualProviderKeys).toEqual(expectedProviderKeys);

    // Each bootstrap env key is wired to its matching user_config token.
    expect(env[BOOTSTRAP_ENV.provider]).toBe("${user_config.provider}");
    expect(env[BOOTSTRAP_ENV.model]).toBe("${user_config.model}");
    expect(env[BOOTSTRAP_ENV.auth]).toBe("${user_config.auth}");
    expect(env[PROVIDER_API_KEY_ENV]).toBe("${user_config.api_key}");
  });

  it("advertises exactly the simple-profile tool names (same membership)", () => {
    const manifest = loadManifest();
    const manifestToolNames = (manifest.tools as Array<{ name: string }>).map(
      (tool) => tool.name,
    );
    expect(manifestToolNames).toEqual([...OntoSimpleProfileToolNames]);
    // Same membership (no duplicates, no extras), independent of order.
    expect(new Set(manifestToolNames)).toEqual(
      new Set(OntoSimpleProfileToolNames),
    );
  });

  it("declares well-formed user_config fields with no INV-CFG-1 defaults", () => {
    const userConfig = loadManifest().user_config as Record<
      string,
      Record<string, unknown>
    >;
    // The provider env tokens must reference fields that actually exist.
    for (const field of ["provider", "model", "auth", "api_key"]) {
      expect(userConfig[field]).toBeDefined();
    }
    for (const [name, field] of Object.entries(userConfig)) {
      // Validator-required descriptors.
      expect(typeof field.type, `${name}.type`).toBe("string");
      expect(typeof field.title, `${name}.title`).toBe("string");
      expect(typeof field.description, `${name}.description`).toBe("string");
      // INV-CFG-1: no default may live in the manifest.
      expect(field, `${name} must not declare a default`).not.toHaveProperty(
        "default",
      );
    }
    // The secret is flagged sensitive; the runtime persists only its env-var
    // NAME, never the value.
    expect(userConfig.api_key.sensitive).toBe(true);
    // provider and model are required; auth/api_key are optional.
    expect(userConfig.provider.required).toBe(true);
    expect(userConfig.model.required).toBe(true);
  });

  it("restricts platforms to those whose launcher works and declares privacy policies", () => {
    const manifest = loadManifest();
    // Windows is excluded: the production launcher imports by native FS path,
    // which a Windows host treats as a drive-letter specifier, not a file URL.
    expect(manifest.compatibility.platforms).toEqual(["darwin", "linux"]);
    expect(manifest.compatibility.runtimes.node).toBe(">=18.0.0");
    // Provider calls leave the machine, so the manifest declares a privacy URL.
    expect(Array.isArray(manifest.privacy_policies)).toBe(true);
    expect(manifest.privacy_policies.length).toBeGreaterThan(0);
  });
});
