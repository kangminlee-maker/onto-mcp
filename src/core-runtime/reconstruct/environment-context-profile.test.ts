import { describe, expect, it } from "vitest";
import {
  assembleEnvironmentContextProfile,
  deepestCommonDirectory,
  ENVIRONMENT_CONTEXT_PROFILE_RULESET_VERSION,
  KNOWN_SIGNAL_BASENAMES,
  type EnvironmentCensusFile,
  type EnvironmentContentManifest,
  type EnvironmentContextProfileInput,
  type EnvironmentObservedFile,
} from "./environment-context-profile.js";

// Spec basis (INV-TEST-1): env-context-profile crossverify-synthesis §0 (Stage 0 minimal path,
// owner-confirmed 2026-07-20 = existing census only, no new fs scan). The module contract is
// projected-observation-in / closed-vocabulary-detection-out (no filesystem, no LLM). Tests assert
// the M4 done-when: per-family POSITIVE detections (never a hollow pass), polyglot≥2 languages,
// unknown ⇒ zero certain framework, order-invariant fingerprint, and the closed-vocabulary barrier.

function census(...paths: Array<[string, boolean?]>): EnvironmentCensusFile[] {
  return paths.map(([rel_path, exists]) => ({ rel_path, exists: exists ?? true }));
}

function observed(
  rel_path: string,
  args: { language?: string | null; imports?: string[]; sha?: string | null } = {},
): EnvironmentObservedFile {
  return {
    rel_path,
    language: args.language ?? null,
    content_sha256: args.sha ?? `sha-${rel_path}`,
    imports: args.imports ?? [],
  };
}

function input(args: Partial<EnvironmentContextProfileInput> & {
  census: EnvironmentCensusFile[];
}): EnvironmentContextProfileInput {
  return {
    census: args.census,
    observations: args.observations ?? [],
    census_walk_bounds: args.census_walk_bounds ?? { max_entries_per_directory_ref: 200, max_depth: 3 },
    imports_available: args.imports_available ?? false,
    signal_scan: args.signal_scan ?? { truncated: false, max_depth: 8, max_dirents: 20000 },
    // Undefined unless a test passes it → the content opt-in is off → byte-identical Stage 0.5.
    content_manifests: args.content_manifests,
  };
}

/** A parsed package.json manifest row (Stage 3a content_parse assembler input). */
function manifest(
  rel_path: string,
  args: {
    status?: EnvironmentContentManifest["status"];
    deps?: string[];
    version?: string | null;
    module?: string | null;
    sha?: string | null;
  } = {},
): EnvironmentContentManifest {
  return {
    rel_path,
    status: args.status ?? "parsed",
    declared_packages: args.deps ?? [],
    runtime_version_constraint: args.version ?? null,
    module_type: args.module ?? null,
    content_sha256: args.sha ?? `sha-${rel_path}`,
  };
}

const find = (
  result: ReturnType<typeof assembleEnvironmentContextProfile>,
  category: string,
  name: string,
  scope = "root",
) => result.detections.find(
  (d) => d.category === category && d.canonical_name === name && d.scope_id === scope,
);

// ── A/C manifest+config basenames (Next.js) ────────────────────────────────────────────────────
describe("basename detection — Next.js + TypeScript project", () => {
  const result = assembleEnvironmentContextProfile(input({
    census: census(
      ["package.json"],
      ["package-lock.json"],
      ["tsconfig.json"],
      ["next.config.js"],
      ["src/index.ts"],
      ["src/app.tsx"],
    ),
  }));

  it("detects Next.js framework from config basename (POSITIVE, likely)", () => {
    const next = find(result, "framework", "nextjs");
    expect(next).toBeDefined();
    expect(next!.confidence).toBe("likely");
    expect(next!.methods).toContain("config_basename");
    expect(next!.signal_refs).toContain("config:next.config.js");
  });

  it("detects TypeScript language (certain — tsconfig is decisive)", () => {
    const ts = find(result, "language", "typescript");
    expect(ts).toBeDefined();
    expect(ts!.confidence).toBe("certain");
  });

  it("detects the node runtime and npm package manager (decisive lockfile)", () => {
    expect(find(result, "runtime", "node")).toBeDefined();
    const npm = find(result, "package_manager", "npm");
    expect(npm).toBeDefined();
    expect(npm!.confidence).toBe("certain");
  });
});

// ── E import specifiers (Django) ────────────────────────────────────────────────────────────────
describe("import detection — Django backend", () => {
  const result = assembleEnvironmentContextProfile(input({
    census: census(["manage.py"], ["requirements.txt"], ["app/models.py"], ["app/views.py"]),
    observations: [
      observed("app/models.py", { language: "python", imports: ["django.db", "django.contrib.auth"] }),
      observed("app/views.py", { language: "python", imports: ["django.shortcuts"] }),
    ],
    imports_available: true,
  }));

  it("detects Django framework from BOTH manage.py and imports (certain — 2 independent methods)", () => {
    const django = find(result, "framework", "django");
    expect(django).toBeDefined();
    expect(django!.confidence).toBe("certain");
    expect(django!.methods).toEqual(["config_basename", "import_specifier"]);
    expect(django!.signal_refs).toContain("import:django");
    expect(django!.signal_refs).toContain("config:manage.py");
  });

  it("detects Python language as likely — correlated manifest+import is ONE fact, not a certain bump (M3)", () => {
    const py = find(result, "language", "python");
    expect(py).toBeDefined();
    // requirements.txt (manifest) and the django import both assert "this is python" — the same
    // fact from correlated angles. M3 dedup keeps it at the single-strong ceiling (likely), never
    // stacking correlated evidence into a false certain.
    expect(py!.confidence).toBe("likely");
  });
});

// ── imports NOT captured ⇒ no import method ─────────────────────────────────────────────────────
describe("imports unavailable — set-tier off", () => {
  it("does not use import signals and marks coverage.imports_available false", () => {
    const result = assembleEnvironmentContextProfile(input({
      census: census(["manage.py"], ["app/models.py"]),
      observations: [observed("app/models.py", { language: "python", imports: ["django.db"] })],
      imports_available: false,
    }));
    expect(result.coverage.imports_available).toBe(false);
    const django = find(result, "framework", "django");
    expect(django).toBeDefined();
    expect(django!.methods).toEqual(["config_basename"]); // manage.py only, no import_specifier
    expect(django!.confidence).toBe("likely");
  });
});

// ── G polyglot preservation ─────────────────────────────────────────────────────────────────────
describe("polyglot — Python backend + TS frontend + Docker (no single primary label)", () => {
  const result = assembleEnvironmentContextProfile(input({
    census: census(
      ["backend/pyproject.toml"],
      ["backend/main.py"],
      ["frontend/package.json"],
      ["frontend/tsconfig.json"],
      ["frontend/src/app.ts"],
      ["Dockerfile"],
    ),
  }));

  it("preserves BOTH languages (≥2, polyglot is not a conflict)", () => {
    const langs = new Set(result.detections.filter((d) => d.category === "language").map((d) => d.canonical_name));
    expect(langs.has("python")).toBe(true);
    expect(langs.has("typescript")).toBe(true);
    expect(langs.size).toBeGreaterThanOrEqual(2);
    expect(result.conflicts).toEqual([]);
  });

  it("detects Docker infrastructure (certain)", () => {
    const docker = find(result, "infrastructure", "docker");
    expect(docker).toBeDefined();
    expect(docker!.confidence).toBe("certain");
  });

  it("scopes backend/frontend as distinct package tokens; root reserved for the true target root", () => {
    // Two DEEPER package roots (backend/, frontend/) + the target root ("") ⇒ scope_count 3. Neither
    // sub-package usurps "root" (rootless-monorepo anchor fix); tokens are path-free.
    expect(result.coverage.scope_count).toBe(3);
    for (const d of result.detections) {
      expect(d.scope_id === "root" || /^package:\d+$/.test(d.scope_id)).toBe(true);
      expect(d.scope_id).not.toContain("backend");
      expect(d.scope_id).not.toContain("frontend");
    }
    // The top-level Dockerfile belongs to the true target root, NOT a sub-package.
    expect(find(result, "infrastructure", "docker", "root")).toBeDefined();
    // The two languages live in distinct package scopes, neither of which is "root".
    const py = result.detections.find((d) => d.canonical_name === "python");
    const ts = result.detections.find((d) => d.canonical_name === "typescript");
    expect(py!.scope_id).toMatch(/^package:\d+$/);
    expect(ts!.scope_id).toMatch(/^package:\d+$/);
    expect(py!.scope_id).not.toBe(ts!.scope_id);
  });
});

// ── rootless monorepo: sub-package must not usurp "root" (anchor fix) ───────────────────────────
describe("rootless monorepo — no target-root manifest", () => {
  const result = assembleEnvironmentContextProfile(input({
    census: census(
      ["packages/api/go.mod"],       // deeper package, NO manifest at target root
      ["packages/api/main.go"],
      ["packages/web/package.json"],
      ["packages/web/app.ts"],
      ["Dockerfile"],                 // a TRUE root-level file
    ),
  }));

  it("does not let the first sub-package become 'root'", () => {
    const go = result.detections.find((d) => d.canonical_name === "go");
    const node = result.detections.find((d) => d.canonical_name === "node");
    expect(go!.scope_id).toMatch(/^package:\d+$/);
    expect(node!.scope_id).toMatch(/^package:\d+$/);
    expect(go!.scope_id).not.toBe(node!.scope_id);
  });

  it("assigns the true root-level Dockerfile to 'root', not a sub-package", () => {
    const docker = find(result, "infrastructure", "docker", "root");
    expect(docker).toBeDefined();
    // scope_count = root + 2 deeper packages.
    expect(result.coverage.scope_count).toBe(3);
  });
});

// ── coverage honesty: structural walk bounds, never a completeness claim ─────────────────────────
describe("coverage bounds disclosure", () => {
  it("discloses the census walk bounds (depth + entry cap + dotdir exclusion) as constants", () => {
    const result = assembleEnvironmentContextProfile(input({
      census: census(["package.json"]),
      census_walk_bounds: { max_entries_per_directory_ref: 200, max_depth: 3 },
    }));
    expect(result.coverage.census_bounds).toEqual({
      max_entries_per_directory_ref: 200,
      max_depth: 3,
      dotdirs_excluded: true,
      vendored_dirs_excluded: true,
    });
    // No unreliable per-run "capped" boolean survives (it could neither see the depth cut nor tell a
    // large tree apart) — the honest signal is the structural bound set.
    expect((result.coverage as Record<string, unknown>).census_capped).toBeUndefined();
    // The known-signal scan status is disclosed (augments the bounded census).
    expect(result.coverage.signal_scan).toEqual({ truncated: false, max_depth: 8, max_dirents: 20000 });
  });

  it("propagates scan truncation into coverage (honest gap when the scan hit its cap)", () => {
    const result = assembleEnvironmentContextProfile(input({
      census: census(["package.json"]),
      signal_scan: { truncated: true, max_depth: 8, max_dirents: 20000 },
    }));
    expect(result.coverage.signal_scan.truncated).toBe(true);
  });
});

// ── unknown ⇒ no certain framework (hollow-pass guard) ──────────────────────────────────────────
describe("unknown project — plain text, no manifests", () => {
  const result = assembleEnvironmentContextProfile(input({
    census: census(["README.md"], ["notes.txt"], ["data.csv"]),
  }));

  it("emits ZERO framework detections (never invents a certain framework)", () => {
    expect(result.detections.filter((d) => d.category === "framework")).toEqual([]);
    expect(result.detections.every((d) => d.category !== "framework")).toBe(true);
  });

  it("is honest-empty, not a failure", () => {
    expect(result.detections).toEqual([]);
    expect(result.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ── extension-only language capped at likely (never certain, never framework) ───────────────────
describe("extension-only signals — bare .py files, no manifest", () => {
  const result = assembleEnvironmentContextProfile(input({
    census: census(["a.py"], ["b.py"], ["c.py"]),
  }));
  it("caps extension-only language at weak/likely and emits no framework", () => {
    const py = find(result, "language", "python");
    expect(py).toBeDefined();
    expect(py!.confidence).not.toBe("certain");
    expect(py!.methods).toEqual(["extension_distribution"]);
    expect(result.detections.filter((d) => d.category === "framework")).toEqual([]);
  });
});

// ── package-manager conflict (both preserved) ───────────────────────────────────────────────────
describe("conflict — competing JS lockfiles in one scope", () => {
  const result = assembleEnvironmentContextProfile(input({
    census: census(["package.json"], ["package-lock.json"], ["yarn.lock"]),
  }));
  it("flags a package_manager conflict but preserves both detections", () => {
    expect(find(result, "package_manager", "npm")).toBeDefined();
    expect(find(result, "package_manager", "yarn")).toBeDefined();
    expect(result.conflicts.length).toBe(1);
    expect(result.conflicts[0].conflict_group).toBe("js_package_manager");
    expect(result.conflicts[0].detection_ids.length).toBe(2);
  });
});

// ── correlated-evidence dedup (M3) ──────────────────────────────────────────────────────────────
describe("correlated evidence — a manifest + a corroborating import is one fact, not a certain bump", () => {
  it("does not stack correlated python signals into a false certain", () => {
    const manifestOnly = assembleEnvironmentContextProfile(input({
      census: census(["pyproject.toml"], ["app.py"]),
    }));
    const manifestPlusImport = assembleEnvironmentContextProfile(input({
      census: census(["pyproject.toml"], ["app.py"]),
      observations: [observed("app.py", { language: "python", imports: ["django.db"] })],
      imports_available: true,
    }));
    // pyproject.toml alone = one strong manifest ⇒ likely.
    expect(find(manifestOnly, "language", "python")!.confidence).toBe("likely");
    // Adding a correlated django import (also ⇒ python) must NOT bump to certain — same fact.
    expect(find(manifestPlusImport, "language", "python")!.confidence).toBe("likely");
  });
});

// ── fingerprint order-invariance + ruleset fold (M5) ────────────────────────────────────────────
describe("fingerprint", () => {
  it("is identical when input file order is shuffled", () => {
    const a = assembleEnvironmentContextProfile(input({
      census: census(["package.json"], ["tsconfig.json"], ["next.config.js"], ["src/a.ts"]),
    }));
    const b = assembleEnvironmentContextProfile(input({
      census: census(["src/a.ts"], ["next.config.js"], ["package.json"], ["tsconfig.json"]),
    }));
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it("changes when the file set changes", () => {
    const a = assembleEnvironmentContextProfile(input({ census: census(["package.json"]) }));
    const b = assembleEnvironmentContextProfile(input({ census: census(["package.json"], ["go.mod"]) }));
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it("changes when an observed file's content_sha256 changes", () => {
    const base = { census: census(["a.py"]), observations: [observed("a.py", { sha: "sha-1" })], imports_available: true };
    const a = assembleEnvironmentContextProfile(input({ ...base }));
    const b = assembleEnvironmentContextProfile(input({
      ...base,
      observations: [observed("a.py", { sha: "sha-2" })],
    }));
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it("is a stable snapshot for a fixed input — falsifies if the pre-image fold changes (M5)", () => {
    // A fixed-input SNAPSHOT (not a hollow cross-call equality): this hash pins the exact fingerprint
    // pre-image. Dropping ANY folded component (ruleset_version, catalog_digest, walk_bounds, census,
    // observations) rotates this value and fails the test — the falsifiable guard the hollow prior
    // test lacked. Update deliberately (with a ruleset_version bump) when the fold intentionally changes.
    const fp = assembleEnvironmentContextProfile(input({ census: census(["package.json"]) })).fingerprint;
    expect(fp).toBe("bfd464044a636b7e9d175496d16ec5d32ab9144abe932f538ca4caddeb05cc28");
    expect(ENVIRONMENT_CONTEXT_PROFILE_RULESET_VERSION).toBe("envprofile:v1");
  });

  it("changes when the census walk bounds change (bound provenance is folded)", () => {
    const a = assembleEnvironmentContextProfile(input({ census: census(["package.json"]) }));
    const b = assembleEnvironmentContextProfile(input({
      census: census(["package.json"]),
      census_walk_bounds: { max_entries_per_directory_ref: 500, max_depth: 5 },
    }));
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });
});

// ── closed-vocabulary barrier (boundary — most important test) ──────────────────────────────────
describe("closed-vocabulary barrier — no domain meaning leaks into the output", () => {
  it("never emits a raw path, a non-catalog import, or an unknown basename", () => {
    const result = assembleEnvironmentContextProfile(input({
      census: census(
        ["src/patient-records/billing.ts"],       // domain-named path
        ["package.json"],
        ["config/PATIENT_RECORD_BUCKET.env"],       // domain-named file
      ),
      observations: [
        observed("src/patient-records/billing.ts", {
          language: "typescript",
          imports: ["react", "@corp/payroll-tax-engine", "./local-domain-module"],
        }),
      ],
      imports_available: true,
    }));
    const CATEGORIES = new Set(["language", "runtime", "framework", "package_manager", "infrastructure"]);
    const CONFIDENCES = new Set(["certain", "likely", "weak"]);
    for (const d of result.detections) {
      expect(CATEGORIES.has(d.category)).toBe(true);
      expect(CONFIDENCES.has(d.confidence)).toBe(true);
      // scope_id is a path-free token.
      expect(d.scope_id === "root" || /^package:\d+$/.test(d.scope_id)).toBe(true);
      // signal_refs carry only closed structural tokens — never a domain path/name.
      for (const ref of d.signal_refs) {
        expect(ref).toMatch(/^(manifest|config|ext|import):/);
        expect(ref).not.toContain("patient");
        expect(ref).not.toContain("payroll");
        expect(ref).not.toContain("PATIENT_RECORD_BUCKET");
        expect(ref).not.toContain("/");
      }
    }
    // The unknown domain import contributed NOTHING (react did; @corp/payroll did not).
    expect(find(result, "framework", "react")).toBeDefined();
    const allNames = result.detections.map((d) => d.canonical_name).join(" ");
    expect(allNames).not.toContain("payroll");
    expect(allNames).not.toContain("corp");
  });
});

// ── CI path-signal rule + known-signal allowlist ────────────────────────────────────────────────
describe("path-signal rules — GitHub Actions CI from .github/workflows", () => {
  it("detects github_actions from a workflow path (scoped root), emitting only a closed token", () => {
    const result = assembleEnvironmentContextProfile(input({
      census: census([".github/workflows/ci.yml"], [".github/workflows/release.yaml"], ["package.json"]),
    }));
    const ci = find(result, "infrastructure", "github_actions", "root");
    expect(ci).toBeDefined();
    expect(ci!.methods).toEqual(["path_signal"]);
    // Only the closed token — never the path.
    expect(ci!.signal_refs).toEqual(["ci:github_actions"]);
    for (const ref of ci!.signal_refs) expect(ref).not.toContain(".github");
  });

  it("does NOT fire on a yml that is not under .github/workflows", () => {
    const result = assembleEnvironmentContextProfile(input({
      census: census(["config/random.yml"], ["docs/.github/notes.yml"]),
    }));
    expect(result.detections.filter((d) => d.canonical_name === "github_actions")).toEqual([]);
  });
});

describe("KNOWN_SIGNAL_BASENAMES allowlist", () => {
  it("covers every basename-rule key and package-root manifest (single source for the scan)", () => {
    expect(KNOWN_SIGNAL_BASENAMES.has("package.json")).toBe(true);
    expect(KNOWN_SIGNAL_BASENAMES.has("dockerfile")).toBe(true);
    expect(KNOWN_SIGNAL_BASENAMES.has("next.config.js")).toBe(true);
    expect(KNOWN_SIGNAL_BASENAMES.has("cargo.toml")).toBe(true);
    expect(KNOWN_SIGNAL_BASENAMES.has("go.mod")).toBe(true);
    // all lowercased (the scan lowercases basenames before membership check)
    for (const b of KNOWN_SIGNAL_BASENAMES) expect(b).toBe(b.toLowerCase());
  });
});

// ── deepestCommonDirectory (path relativization helper) ─────────────────────────────────────────
describe("deepestCommonDirectory", () => {
  it("returns the common ancestor directory of sibling files", () => {
    expect(deepestCommonDirectory(["/repo/src/a.ts", "/repo/src/b.ts"])).toBe("/repo/src");
  });
  it("stops at the divergence point across subtrees", () => {
    expect(deepestCommonDirectory(["/repo/backend/main.py", "/repo/frontend/app.ts"])).toBe("/repo");
  });
  it("handles a single path (returns it whole — caller basename-falls-back)", () => {
    expect(deepestCommonDirectory(["/repo/src/only.ts"])).toBe("/repo/src/only.ts");
  });
  it("returns empty string for empty input", () => {
    expect(deepestCommonDirectory([])).toBe("");
  });
});

// ── determinism ─────────────────────────────────────────────────────────────────────────────────
describe("determinism", () => {
  it("produces byte-identical results across repeated calls", () => {
    const build = () => assembleEnvironmentContextProfile(input({
      census: census(["package.json"], ["next.config.js"], ["backend/go.mod"]),
      observations: [observed("app.ts", { imports: ["react"] })],
      imports_available: true,
    }));
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });
});

// ── Stage 3a content_parse (declared dependencies + closed properties) ───────────────────────────
// Spec basis: env-context-profile Stage 3a design 20260721 §5. The assembler reads projected parsed
// manifests, matches declared dep NAMES against the closed catalog (reused IMPORT_RULES), emits only
// matches, promotes confidence via a distinct method, attaches closed properties, folds content into
// the fingerprint, and surfaces an honest coverage taxonomy — all gated on content_manifests !==
// undefined so an off run is byte-identical to Stage 0.5.
describe("Stage 3a content_parse — declared dependency detection", () => {
  it("detects a framework from a DECLARED dependency without any captured import (POSITIVE)", () => {
    // package.json exists (census) but no import was captured → base profile has no react. content
    // parse of the DECLARED dep surfaces it.
    const result = assembleEnvironmentContextProfile(input({
      census: census(["package.json"]),
      content_manifests: [manifest("package.json", { deps: ["react", "react-dom"] })],
    }));
    const react = find(result, "framework", "react");
    expect(react).toBeDefined();
    expect(react!.methods).toContain("manifest_dependency");
    expect(react!.signal_refs).toContain("dep:react");
    expect(react!.confidence).toBe("likely"); // one strong method (declaration) alone
  });

  it("promotes to CERTAIN when a declared dep and a captured import corroborate (two methods)", () => {
    const result = assembleEnvironmentContextProfile(input({
      census: census(["package.json"]),
      observations: [observed("src/app.ts", { imports: ["react"] })],
      imports_available: true,
      content_manifests: [manifest("package.json", { deps: ["react"] })],
    }));
    const react = find(result, "framework", "react");
    expect(react!.confidence).toBe("certain");
    expect(react!.methods).toEqual(expect.arrayContaining(["import_specifier", "manifest_dependency"]));
  });

  it("NEVER emits a domain dependency that matches no catalog rule (closed-vocabulary barrier)", () => {
    const result = assembleEnvironmentContextProfile(input({
      census: census(["package.json"]),
      content_manifests: [manifest("package.json", {
        deps: ["@corp/payroll-tax-engine", "react", "@corp/patient-records"],
      })],
    }));
    // react matched; the two domain packages contributed nothing and appear nowhere.
    expect(find(result, "framework", "react")).toBeDefined();
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("payroll");
    expect(serialized).not.toContain("patient");
    expect(serialized).not.toContain("@corp");
  });

  it("attaches closed properties (version constraint + module type) to the node runtime detection", () => {
    const result = assembleEnvironmentContextProfile(input({
      census: census(["package.json"]),
      content_manifests: [manifest("package.json", {
        deps: ["express"], version: ">=18", module: "module",
      })],
    }));
    const node = find(result, "runtime", "node");
    expect(node!.properties).toEqual({ module_type: "module", runtime_version_constraint: ">=18" });
  });

  it("RE-SANITIZES the version at the emission point — a rogue unsanitized row is dropped (barrier is structural)", () => {
    // Simulate a future producer that skipped sanitization: a path-shaped 'version'. The assembler
    // must drop it at emission (capability-surface barrier), never emit the path. Falsifiable — an
    // input-trusting assembler would surface "secret".
    const result = assembleEnvironmentContextProfile(input({
      census: census(["package.json"]),
      content_manifests: [manifest("package.json", { deps: ["react"], version: "file:../secret/path" })],
    }));
    const node = find(result, "runtime", "node");
    expect(node?.properties?.runtime_version_constraint).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("scopes declared deps to their package root in a monorepo", () => {
    const result = assembleEnvironmentContextProfile(input({
      census: census(["packages/web/package.json"], ["packages/api/package.json"]),
      content_manifests: [
        manifest("packages/web/package.json", { deps: ["react"] }),
        manifest("packages/api/package.json", { deps: ["express"] }),
      ],
    }));
    // Each dep lands in its own package scope, not "root".
    expect(result.detections.find((d) => d.canonical_name === "react")!.scope_id).toBe("package:2");
    expect(result.detections.find((d) => d.canonical_name === "express")!.scope_id).toBe("package:1");
  });

  it("does not contribute from a parse_error / truncated / unsupported manifest (honest gap)", () => {
    const result = assembleEnvironmentContextProfile(input({
      census: census(["package.json"], ["backend/Cargo.toml"]),
      content_manifests: [
        manifest("package.json", { status: "parse_error", deps: ["react"] }),
        manifest("backend/Cargo.toml", { status: "unsupported" }),
      ],
    }));
    // The deps array on a non-parsed manifest is ignored — no react detection.
    expect(find(result, "framework", "react")).toBeUndefined();
  });
});

describe("Stage 3a content_parse — coverage taxonomy", () => {
  it("reports honest per-status counts and true_silence for a clean-but-empty read", () => {
    const result = assembleEnvironmentContextProfile(input({
      census: census(["package.json"]),
      // parsed cleanly, but the only dep is a domain package (no catalog match) → true silence.
      content_manifests: [manifest("package.json", { deps: ["@corp/thing"] })],
    }));
    expect(result.coverage.content_parse).toEqual({
      files_read: 1, parsed: 1, parse_error: 0, truncated: 0, unsupported: 0, true_silence: true,
    });
  });

  it("true_silence is FALSE when a catalog dep matched", () => {
    const result = assembleEnvironmentContextProfile(input({
      census: census(["package.json"]),
      content_manifests: [manifest("package.json", { deps: ["react"] })],
    }));
    expect(result.coverage.content_parse!.true_silence).toBe(false);
  });

  it("true_silence is FALSE when a dep manifest was unsupported (could-not-read, not empty)", () => {
    const result = assembleEnvironmentContextProfile(input({
      census: census(["package.json"], ["Cargo.toml"]),
      content_manifests: [
        manifest("package.json", { deps: [] }),
        manifest("Cargo.toml", { status: "unsupported" }),
      ],
    }));
    const cov = result.coverage.content_parse!;
    expect(cov.unsupported).toBe(1);
    expect(cov.true_silence).toBe(false);
  });
});

describe("Stage 3a content_parse — off = byte-identical to Stage 0.5", () => {
  it("omits the content_parse coverage block and content fingerprint fold when content_manifests is undefined", () => {
    const base = assembleEnvironmentContextProfile(input({ census: census(["package.json"], ["src/app.ts"]) }));
    expect(base.coverage.content_parse).toBeUndefined();
    expect(base.detections.every((d) => d.properties === undefined)).toBe(true);
  });

  it("an EMPTY content_manifests array (opt-in on, nothing found) still emits the coverage block", () => {
    const on = assembleEnvironmentContextProfile(input({ census: census(["package.json"]), content_manifests: [] }));
    expect(on.coverage.content_parse).toEqual({
      files_read: 0, parsed: 0, parse_error: 0, truncated: 0, unsupported: 0, true_silence: false,
    });
  });

  it("content off vs on produces a DIFFERENT fingerprint (content provenance is folded when on)", () => {
    const off = assembleEnvironmentContextProfile(input({ census: census(["package.json"]) }));
    const on = assembleEnvironmentContextProfile(input({
      census: census(["package.json"]),
      content_manifests: [manifest("package.json", { deps: ["react"] })],
    }));
    expect(on.fingerprint).not.toBe(off.fingerprint);
  });

  it("a manifest content change (content_sha256) rotates the fingerprint even with identical dep names", () => {
    const build = (sha: string) => assembleEnvironmentContextProfile(input({
      census: census(["package.json"]),
      content_manifests: [manifest("package.json", { deps: ["react"], sha })],
    }));
    expect(build("sha-a").fingerprint).not.toBe(build("sha-b").fingerprint);
  });

  it("fingerprint is order-invariant across content_manifests ordering", () => {
    const a = assembleEnvironmentContextProfile(input({
      census: census(["packages/web/package.json"], ["packages/api/package.json"]),
      content_manifests: [
        manifest("packages/web/package.json", { deps: ["react"] }),
        manifest("packages/api/package.json", { deps: ["express"] }),
      ],
    }));
    const b = assembleEnvironmentContextProfile(input({
      census: census(["packages/web/package.json"], ["packages/api/package.json"]),
      content_manifests: [
        manifest("packages/api/package.json", { deps: ["express"] }),
        manifest("packages/web/package.json", { deps: ["react"] }),
      ],
    }));
    expect(a.fingerprint).toBe(b.fingerprint);
  });
});
