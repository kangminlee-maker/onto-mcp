import { describe, expect, it, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  ReconstructTargetMaterialProfileArtifact,
  ReconstructSelectedSourceProfileRef,
} from "./artifact-types.js";
import { materializeReconstructPreparationArtifacts } from "./materialize-preparation.js";
import {
  loadReconstructContractRegistry,
  type ReconstructContractRegistry,
} from "./contract-registry.js";
import { validateTargetMaterialProfile } from "./material-profile-validation.js";

const profilesRoot = path.resolve(".onto/processes/reconstruct/source-profiles");
const registryPath = path.resolve(
  ".onto/processes/reconstruct/reconstruct-contract-registry.yaml",
);
const tmpRoots: string[] = [];

async function makeTmpProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "onto-material-profile-validation-"));
  tmpRoots.push(root);
  return root;
}

async function readYaml<T>(filePath: string): Promise<T> {
  return parseYaml(await fs.readFile(filePath, "utf8")) as T;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

/**
 * Produces a real, valid target-material-profile artifact (and the real contract
 * registry) by running the actual preparation materializer on a tiny tmp project.
 * A single `.ts` target yields a `code`/`partial` profile whose selected source
 * profile snapshot matches the registry row exactly.
 */
async function makeValidBase(): Promise<{
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact;
  contractRegistry: ReconstructContractRegistry;
  registryRef: string;
}> {
  const root = await makeTmpProject();
  const sessionRoot = path.join(root, ".onto", "reconstruct", "session-validate");
  const target = path.join(root, "feature.ts");
  await fs.writeFile(target, "export const feature = true;\n", "utf8");

  const refs = await materializeReconstructPreparationArtifacts({
    sessionRoot,
    targetRefs: [target],
    profilesRoot,
    filesystemAllowedRoots: [root],
  });

  const targetMaterialProfile =
    await readYaml<ReconstructTargetMaterialProfileArtifact>(
      refs.target_material_profile,
    );
  const contractRegistry = await loadReconstructContractRegistry({ registryPath });

  return { targetMaterialProfile, contractRegistry, registryRef: registryPath };
}

afterEach(async () => {
  await Promise.all(
    tmpRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

function expectRejection(
  validation: ReturnType<typeof validateTargetMaterialProfile>,
  code: string,
): void {
  expect(validation.validation_status).toBe("invalid");
  expect(validation.violations.some((violation) => violation.code === code)).toBe(true);
}

describe("validateTargetMaterialProfile base", () => {
  it("validates a real materialized code profile against the registry", async () => {
    const base = await makeValidBase();
    const validation = validateTargetMaterialProfile(base);
    expect(validation.validation_status).toBe("valid");
    expect(validation.violations).toEqual([]);
  });
});

describe("validateTargetMaterialProfile rejection branches", () => {
  it("rejects an out-of-set target_material_kind (schema_shape_invalid)", async () => {
    const base = clone(await makeValidBase());
    (base.targetMaterialProfile as { target_material_kind: string }).target_material_kind =
      "telepathy";
    expectRejection(validateTargetMaterialProfile(base), "schema_shape_invalid");
  });

  it("rejects a target_material_kind with no registry row (target_kind_registry_record_missing)", async () => {
    const base = clone(await makeValidBase());
    // Every valid TargetMaterialKind has a source_profile_records row in the
    // registry, so the only way to reach the missing-row branch is a kind
    // string with no matching row. Such a string is also not a valid enum, so
    // this code necessarily co-occurs with schema_shape_invalid; we assert only
    // that the missing-row branch fired.
    (base.targetMaterialProfile as { target_material_kind: string }).target_material_kind =
      "no-such-kind";
    expectRejection(
      validateTargetMaterialProfile(base),
      "target_kind_registry_record_missing",
    );
  });

  it("rejects an empty target_refs list (target_refs_empty)", async () => {
    const base = clone(await makeValidBase());
    base.targetMaterialProfile.target_refs = [];
    expectRejection(validateTargetMaterialProfile(base), "target_refs_empty");
  });

  it("rejects a target ref with no matching detection row (detection_ref_mismatch)", async () => {
    const base = clone(await makeValidBase());
    base.targetMaterialProfile.target_refs = [
      ...base.targetMaterialProfile.target_refs,
      "/nowhere/unobserved-target.ts",
    ];
    expectRejection(validateTargetMaterialProfile(base), "detection_ref_mismatch");
  });

  it("rejects a supported profile with no selected source profiles (selected_profile_missing)", async () => {
    const base = clone(await makeValidBase());
    // `partial` support_status requires at least one selected source profile.
    expect(base.targetMaterialProfile.support_status).toBe("partial");
    base.targetMaterialProfile.selected_source_profiles = [];
    expectRejection(validateTargetMaterialProfile(base), "selected_profile_missing");
  });

  it("rejects an unsupported profile without an unsupported_reason (unsupported_reason_missing)", async () => {
    const base = clone(await makeValidBase());
    // Move to a status that demands a reason, then clear the reason. The
    // selected profiles still describe `code`, so selected_profile_missing
    // does not co-fire.
    base.targetMaterialProfile.support_status = "unsupported";
    base.targetMaterialProfile.unsupported_reason = null;
    expectRejection(validateTargetMaterialProfile(base), "unsupported_reason_missing");
  });

  it("rejects a selected profile missing a required snapshot field (selected_profile_required_field_missing)", async () => {
    const base = clone(await makeValidBase());
    const selected = base.targetMaterialProfile
      .selected_source_profiles[0] as ReconstructSelectedSourceProfileRef;
    // Drop a required snapshot field so the field-presence check fails. Removing
    // the key (not nulling an array) keeps every entry-guard array intact.
    delete (selected as unknown as Record<string, unknown>).contract_status;
    expectRejection(
      validateTargetMaterialProfile(base),
      "selected_profile_required_field_missing",
    );
  });

  it("rejects a selected profile absent from the registry (selected_profile_registry_mismatch)", async () => {
    const base = clone(await makeValidBase());
    const selected = base.targetMaterialProfile
      .selected_source_profiles[0] as ReconstructSelectedSourceProfileRef;
    // Same target_material_kind so the registry-row lookup for the kind still
    // succeeds, but no source_profile_records row carries this profile_id, so
    // the snapshot has no registry counterpart.
    selected.profile_id = "ghost-source-profile";
    expectRejection(
      validateTargetMaterialProfile(base),
      "selected_profile_registry_mismatch",
    );
  });

  it("rejects a selected profile whose snapshot field disagrees with the registry (selected_profile_registry_mismatch)", async () => {
    const base = clone(await makeValidBase());
    const selected = base.targetMaterialProfile
      .selected_source_profiles[0] as ReconstructSelectedSourceProfileRef;
    // The registry lookup matches by profile_id + kind, but a copied field now
    // disagrees with the registry row.
    selected.contract_status = "retired";
    expectRejection(
      validateTargetMaterialProfile(base),
      "selected_profile_registry_mismatch",
    );
  });

  it("rejects a mixed profile missing a per-member selected source profile (mixed_candidate_profile_missing)", async () => {
    // Build a real mixed base from a directory containing code + a spreadsheet.
    const root = await makeTmpProject();
    const sessionRoot = path.join(root, ".onto", "reconstruct", "session-mixed");
    const code = path.join(root, "src", "feature.ts");
    const sheet = path.join(root, "data", "schedule.csv");
    await fs.mkdir(path.dirname(code), { recursive: true });
    await fs.mkdir(path.dirname(sheet), { recursive: true });
    await fs.writeFile(code, "export const feature = true;\n", "utf8");
    await fs.writeFile(sheet, "month,revenue\n2026-01,100\n", "utf8");

    const refs = await materializeReconstructPreparationArtifacts({
      sessionRoot,
      targetRefs: [root],
      profilesRoot,
      filesystemAllowedRoots: [root],
    });
    const targetMaterialProfile =
      await readYaml<ReconstructTargetMaterialProfileArtifact>(
        refs.target_material_profile,
      );
    const contractRegistry = await loadReconstructContractRegistry({ registryPath });
    expect(targetMaterialProfile.target_material_kind).toBe("mixed");

    const base = clone({ targetMaterialProfile, contractRegistry, registryRef: registryPath });
    // Drop the per-member selected profile for one candidate kind while leaving
    // the `mixed` composite authority row in place, so only the per-member
    // branch fires.
    const candidate = base.targetMaterialProfile.target_material_kind_candidates[0]!;
    base.targetMaterialProfile.selected_source_profiles =
      base.targetMaterialProfile.selected_source_profiles.filter(
        (selected) => selected.target_material_kind !== candidate,
      );
    expectRejection(
      validateTargetMaterialProfile(base),
      "mixed_candidate_profile_missing",
    );
  });
});
