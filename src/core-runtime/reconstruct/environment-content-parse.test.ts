import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  parseEnvironmentManifests,
  ENVIRONMENT_CONTENT_PARSE_MAX_BYTES,
} from "./environment-content-parse.js";
import { sanitizeVersionConstraint } from "./environment-context-profile.js";

// Spec basis: env-context-profile Stage 3a design 20260721 §2 (a NEW fs-read authority, static-only).
// These tests prove: package.json content extraction, the honest failure taxonomy (parse_error /
// truncated / unsupported), static-only safety (a code-config is never a candidate; an unsupported
// manifest is never read), path-safety (a symlink is refused, an out-of-root ref is refused), and the
// closed-vocabulary barrier on the version channel (a path/url version spec is dropped).

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "env-content-parse-"));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const write = async (rel: string, body: string): Promise<void> => {
  const abs = path.join(root, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, body);
};
const abs = (rel: string): string => path.join(root, rel);

describe("parseEnvironmentManifests — package.json extraction", () => {
  it("extracts declared dependencies (all four fields), engines.node, and type", async () => {
    await write("package.json", JSON.stringify({
      dependencies: { react: "^18", "@corp/x": "1.0.0" },
      devDependencies: { vite: "^5" },
      peerDependencies: { "react-dom": "^18" },
      optionalDependencies: { fsevents: "*" },
      engines: { node: ">=18" },
      type: "module",
    }));
    const [m] = await parseEnvironmentManifests({ candidatePaths: [abs("package.json")], allowedRoots: [root] });
    expect(m.status).toBe("parsed");
    expect(m.declared_packages.sort()).toEqual(
      ["@corp/x", "fsevents", "react", "react-dom", "vite"].sort(),
    );
    expect(m.runtime_version_constraint).toBe(">=18");
    expect(m.module_type).toBe("module");
    expect(m.content_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("marks malformed JSON as parse_error (honest — never fabricated), still hashing what it read", async () => {
    await write("package.json", "{ not valid json ,,, ");
    const [m] = await parseEnvironmentManifests({ candidatePaths: [abs("package.json")], allowedRoots: [root] });
    expect(m.status).toBe("parse_error");
    expect(m.declared_packages).toEqual([]);
    expect(m.content_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("marks a non-object JSON (array/number) as parse_error", async () => {
    await write("package.json", "[1,2,3]");
    const [m] = await parseEnvironmentManifests({ candidatePaths: [abs("package.json")], allowedRoots: [root] });
    expect(m.status).toBe("parse_error");
  });

  it("parses package.json as DATA — scripts are never executed (static-only)", async () => {
    // A malicious script value must be inert data, never run.
    await write("package.json", JSON.stringify({
      scripts: { postinstall: "throw new Error('EXECUTED')" },
      dependencies: { express: "^4" },
    }));
    const [m] = await parseEnvironmentManifests({ candidatePaths: [abs("package.json")], allowedRoots: [root] });
    expect(m.status).toBe("parsed");
    expect(m.declared_packages).toEqual(["express"]);
  });

  it("drops a non-version-shaped engines.node value (closed-vocabulary barrier on the version channel)", async () => {
    await write("package.json", JSON.stringify({ engines: { node: "file:../secret/path" } }));
    const [m] = await parseEnvironmentManifests({ candidatePaths: [abs("package.json")], allowedRoots: [root] });
    expect(m.runtime_version_constraint).toBeNull();
  });
});

describe("parseEnvironmentManifests — failure taxonomy & static-only scope", () => {
  it("marks an unsupported dep manifest (Cargo.toml) without reading its content (sha null)", async () => {
    // Content is deliberately code-shaped; it must NEVER be read for an unsupported format.
    await write("Cargo.toml", "[dependencies]\nserde = \"1\" # never read");
    const [m] = await parseEnvironmentManifests({ candidatePaths: [abs("Cargo.toml")], allowedRoots: [root] });
    expect(m.status).toBe("unsupported");
    expect(m.content_sha256).toBeNull();
    expect(m.declared_packages).toEqual([]);
  });

  it("never treats a JS code-config as a candidate (never read, never eval'd)", async () => {
    // If this were require()'d it would throw; it must simply not be a dependency manifest.
    await write("next.config.js", "module.exports = (() => { throw new Error('EXECUTED') })()");
    const results = await parseEnvironmentManifests({ candidatePaths: [abs("next.config.js")], allowedRoots: [root] });
    expect(results).toEqual([]);
  });

  it("marks a file over the byte cap as truncated (content not trusted / not parsed)", async () => {
    // A valid-JSON prefix followed by padding beyond the cap — must be truncated, not parsed.
    const big = "{" + " ".repeat(ENVIRONMENT_CONTENT_PARSE_MAX_BYTES + 10) + "}";
    await write("package.json", big);
    const [m] = await parseEnvironmentManifests({ candidatePaths: [abs("package.json")], allowedRoots: [root] });
    expect(m.status).toBe("truncated");
    expect(m.declared_packages).toEqual([]);
    expect(m.content_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ignores a non-manifest candidate entirely", async () => {
    await write("README.md", "# hi");
    const results = await parseEnvironmentManifests({ candidatePaths: [abs("README.md")], allowedRoots: [root] });
    expect(results).toEqual([]);
  });
});

describe("parseEnvironmentManifests — path-safety (new fs-read authority)", () => {
  it("refuses a symlinked manifest (never follows a symlink to escape the vetted root)", async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "outside-"));
    try {
      await fs.writeFile(path.join(outside, "real.json"), JSON.stringify({ dependencies: { react: "^18" } }));
      // a symlink INSIDE root whose basename is package.json but target is out-of-root
      await fs.symlink(path.join(outside, "real.json"), abs("package.json"));
      const results = await parseEnvironmentManifests({ candidatePaths: [abs("package.json")], allowedRoots: [root] });
      expect(results).toEqual([]); // lstat sees a symlink, not a regular file → refused
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });

  it("refuses a candidate outside the allowed roots (containment)", async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "outside-"));
    try {
      await fs.writeFile(path.join(outside, "package.json"), JSON.stringify({ dependencies: { react: "^18" } }));
      const results = await parseEnvironmentManifests({
        candidatePaths: [path.join(outside, "package.json")],
        allowedRoots: [root], // the out-of-root manifest is not under an allowed root
      });
      expect(results).toEqual([]);
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });

  it("skips an unreadable / missing candidate without failing the whole parse", async () => {
    await write("package.json", JSON.stringify({ dependencies: { react: "^18" } }));
    const results = await parseEnvironmentManifests({
      candidatePaths: [abs("does-not-exist/package.json"), abs("package.json")],
      allowedRoots: [root],
    });
    expect(results.map((m) => m.status)).toEqual(["parsed"]); // the missing one is silently skipped
  });
});

describe("parseEnvironmentManifests — determinism", () => {
  it("produces sorted, deduped output", async () => {
    await write("package.json", JSON.stringify({ dependencies: { react: "^18" } }));
    await write("packages/api/package.json", JSON.stringify({ dependencies: { express: "^4" } }));
    const once = await parseEnvironmentManifests({
      candidatePaths: [abs("packages/api/package.json"), abs("package.json"), abs("package.json")],
      allowedRoots: [root],
    });
    expect(once.map((m) => path.relative(root, m.abs_path))).toEqual(
      ["package.json", "packages/api/package.json"],
    );
  });
});

describe("sanitizeVersionConstraint", () => {
  it("keeps version-shaped constraints", () => {
    for (const v of [">=18", "^18.0.0", "18.x", ">=16 <21", "~1.2.3", "v20", "18 || 20"]) {
      expect(sanitizeVersionConstraint(v)).toBe(v);
    }
  });
  it("drops path/url/word specs and over-long values", () => {
    for (const v of ["file:../x", "github:org/repo#main", "link:../local", "latest", "workspace:*", "x".repeat(40)]) {
      expect(sanitizeVersionConstraint(v)).toBeNull();
    }
  });
});
