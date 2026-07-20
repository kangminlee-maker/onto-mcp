import { describe, expect, it } from "vitest";
import {
  assertSeedUserPayloadBoundary,
  projectEnvironmentContextProfileInput,
  SEED_USER_PAYLOAD_ALLOWED_KEYS,
} from "./run.js";
import { assembleEnvironmentContextProfile } from "./environment-context-profile.js";
import type { ReconstructTargetMaterialProfileArtifact } from "./artifact-types.js";
import type { ReconstructSourceObservationsArtifact } from "./source-observations.js";

// M2 capability-surface boundary (design 20260720 env-context-profile §0, design-verify M2): the
// environment context profile is disclosure-only and must NEVER be folded into the seed-authoring
// userPayload. Enforced structurally by a closed-set assert, not a prompt rule. These tests are the
// regression guard — a future edit that wires the profile into the seed fails loud here.

describe("seed userPayload M2 boundary", () => {
  it("passes a payload whose keys are all in the closed allowed set", () => {
    const payload = { intent: "x", target_material_profile: {}, source_observations: [] };
    expect(assertSeedUserPayloadBoundary(payload)).toBe(payload);
  });

  it("EXCLUDES environment_context_profile from the allowed set (the boundary)", () => {
    expect(SEED_USER_PAYLOAD_ALLOWED_KEYS.has("environment_context_profile")).toBe(false);
  });

  it("fails loud when the profile is folded into the seed userPayload", () => {
    expect(() =>
      assertSeedUserPayloadBoundary({ intent: "x", environment_context_profile: { detections: [] } }),
    ).toThrow(/environment context profile|boundary violation/);
  });

  it("fails loud on any unexpected field, naming it", () => {
    expect(() => assertSeedUserPayloadBoundary({ intent: "x", surprise_field: 1 })).toThrow(
      /surprise_field/,
    );
  });

  it("keeps code_set_tier allowed (the sibling set-tier IS a declared seed field)", () => {
    expect(SEED_USER_PAYLOAD_ALLOWED_KEYS.has("code_set_tier")).toBe(true);
  });

  it("allows timeout_recovery so the wrapped minimal-kernel recovery payload does not throw", () => {
    // The kernel recovery is the second seed dispatch surface, now also wrapped by the guard; its
    // extra provenance field must be in the closed set or every timeout recovery would fail loud.
    expect(SEED_USER_PAYLOAD_ALLOWED_KEYS.has("timeout_recovery")).toBe(true);
    const kernelLikePayload = {
      intent: "x", target_material_profile: {}, source_purpose_projection: {},
      purpose_confirmation_validation: {}, material_admission_rows: [], seed_authoring_readiness: {},
      candidate_inventory: [], candidate_disposition: [], candidate_target_ref_obligations: [],
      source_observations: [], observed_source_refs: [], skipped_source_ref_summary: {},
      timeout_recovery: { previous_artifact_name: "OntologySeed", policy: "x" },
    };
    expect(() => assertSeedUserPayloadBoundary(kernelLikePayload)).not.toThrow();
  });
});

// ── real-path projection (per_ref + structural_data → module input) ─────────────────────────────
// The assembler is unit-tested with clean inputs; these prove the run.ts projection reads the REAL
// artifact shapes correctly (relativization, inventory imports/language/sha extraction, cap flag).

function targetProfile(
  refs: Array<{ ref: string; exists?: boolean }>,
): ReconstructTargetMaterialProfileArtifact {
  return {
    detection: {
      owner: "runtime_heuristic",
      confidence: 1,
      confidence_basis: "test",
      per_ref: refs.map((r) => ({
        ref: r.ref,
        exists: r.exists ?? true,
        kind: "code",
        confidence: 0.9,
        confidence_basis: "test",
      })),
    },
  } as ReconstructTargetMaterialProfileArtifact;
}

function sourceObs(
  items: Array<{ id: string; source_ref: string; structural_data: Record<string, unknown> }>,
): ReconstructSourceObservationsArtifact {
  return {
    observations: items.map((i) => ({
      observation_id: i.id,
      source_ref: i.source_ref,
      structural_data: i.structural_data,
    })),
  } as unknown as ReconstructSourceObservationsArtifact;
}

describe("projectEnvironmentContextProfileInput — real artifact shapes", () => {
  it("relativizes absolute census refs to the deepest common directory", () => {
    const input = projectEnvironmentContextProfileInput({
      targetMaterialProfile: targetProfile([
        { ref: "/home/u/proj/package.json" },
        { ref: "/home/u/proj/src/app.ts" },
      ]),
      sourceObservations: sourceObs([]),
    });
    expect(input.census.map((c) => c.rel_path).sort()).toEqual(["package.json", "src/app.ts"]);
    // Walk bounds are single-sourced from target-material-kind and echoed for honest disclosure.
    expect(input.census_walk_bounds.max_depth).toBe(3);
    expect(input.census_walk_bounds.max_entries_per_directory_ref).toBe(200);
  });

  it("extracts imports, language and content_sha256, and DERIVES imports_available from the data", () => {
    const input = projectEnvironmentContextProfileInput({
      targetMaterialProfile: targetProfile([{ ref: "/p/app/views.py" }]),
      sourceObservations: sourceObs([{
        id: "obs-1",
        source_ref: "/p/app/views.py",
        structural_data: {
          content_sha256: "sha-views",
          code_structure_inventory: {
            language: "python",
            content_sha256: "sha-inv",
            symbol_tiles: { imports: [{ to_specifier: "django.db" }, { to_specifier: "os" }] },
          },
        },
      }]),
    });
    expect(input.observations[0]).toMatchObject({
      language: "python",
      content_sha256: "sha-views",
      imports: ["django.db", "os"],
    });
    // imports field present on the inventory ⇒ capture ran ⇒ imports_available true (data-derived,
    // NOT from a caller flag — robust for direct callers that mis-set codeSetTier).
    expect(input.imports_available).toBe(true);
  });

  it("handles a non-code observation (no inventory) and reports imports_available false", () => {
    const input = projectEnvironmentContextProfileInput({
      targetMaterialProfile: targetProfile([{ ref: "/p/README.md" }]),
      sourceObservations: sourceObs([{
        id: "obs-doc",
        source_ref: "/p/README.md",
        structural_data: { content_sha256: "sha-doc", basename: "README.md", extension: ".md" },
      }]),
    });
    expect(input.observations[0]).toMatchObject({
      language: null,
      content_sha256: "sha-doc",
      imports: [],
    });
    // No inventory carried the imports field ⇒ capture did not run ⇒ imports_available false.
    expect(input.imports_available).toBe(false);
  });

  it("reports imports_available true when the inventory captured an EMPTY imports list", () => {
    // Empty-but-present imports = capture ran, found none. Must be `true` (distinguishes "captured,
    // none" from "never captured") — the flag reflects capture, not import existence.
    const input = projectEnvironmentContextProfileInput({
      targetMaterialProfile: targetProfile([{ ref: "/p/a.ts" }]),
      sourceObservations: sourceObs([{
        id: "obs-empty",
        source_ref: "/p/a.ts",
        structural_data: {
          content_sha256: "sha-a",
          code_structure_inventory: { language: "typescript", content_sha256: "sha-a", symbol_tiles: { imports: [] } },
        },
      }]),
    });
    expect(input.imports_available).toBe(true);
  });

  it("end-to-end: projects a real Next.js target's absolute refs into a Next.js detection", () => {
    const profile = assembleEnvironmentContextProfile(
      projectEnvironmentContextProfileInput({
        targetMaterialProfile: targetProfile([
          { ref: "/home/dev/webapp/package.json" },
          { ref: "/home/dev/webapp/tsconfig.json" },
          { ref: "/home/dev/webapp/next.config.js" },
          { ref: "/home/dev/webapp/src/index.ts" },
        ]),
        sourceObservations: sourceObs([]),
      }),
    );
    const next = profile.detections.find((d) => d.canonical_name === "nextjs");
    expect(next).toBeDefined();
    expect(next!.category).toBe("framework");
    // No absolute path leaked into any signal_ref.
    for (const d of profile.detections) {
      for (const ref of d.signal_refs) expect(ref).not.toContain("/home/dev");
    }
  });
});
