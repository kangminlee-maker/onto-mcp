import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { loadCoreLensRegistry } from "../discovery/lens-registry.js";
import { loadReconstructContractRegistry } from "./contract-registry.js";
import {
  buildReconstructRunGoverningSnapshot,
  validateReconstructRunGoverningSnapshot,
} from "./governing-snapshot.js";

function sha256Text(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

async function writeDomainCompetencyQuestions(args: {
  domainRoot: string;
  prefix: string;
}): Promise<void> {
  await fs.mkdir(args.domainRoot, { recursive: true });
  await fs.writeFile(
    path.join(args.domainRoot, "competency_qs.md"),
    [
      `# ${args.prefix} Domain Competency Questions`,
      "",
      "## 1. Runtime Checks",
      "",
      `- **CQ-${args.prefix}-01** [P1] Can ${args.prefix} required behavior be verified?`,
      `  - Inference path: ${args.prefix} profile -> required behavior`,
      `  - Verification criteria: PASS if ${args.prefix} required behavior is dispositioned.`,
      "",
      `- **CQ-${args.prefix}-02** [P2] Can ${args.prefix} supporting behavior be diagnosed?`,
      `  - Inference path: ${args.prefix} profile -> supporting behavior`,
      `  - Verification criteria: PASS if ${args.prefix} supporting behavior is retained as metadata.`,
      "",
    ].join("\n"),
    "utf8",
  );
}

describe("reconstruct governing snapshot", () => {
  it("rejects registry migration status values outside declared policies", async () => {
    const registryPath = path.resolve(
      ".onto/processes/reconstruct/reconstruct-contract-registry.yaml",
    );
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "onto-registry-"));
    const invalidRegistryPath = path.join(root, "reconstruct-contract-registry.yaml");
    const registryText = await fs.readFile(registryPath, "utf8");
    await fs.writeFile(
      invalidRegistryPath,
      registryText.replace("migration_status: current", "migration_status: typo"),
      "utf8",
    );

    await expect(loadReconstructContractRegistry({
      registryPath: invalidRegistryPath,
    })).rejects.toThrow(/unsupported migration_status/);
  });

  it("allows source profile versions to coexist with exactly one default per material kind", async () => {
    const registryPath = path.resolve(
      ".onto/processes/reconstruct/reconstruct-contract-registry.yaml",
    );
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "onto-registry-"));
    const compatibleRegistryPath = path.join(root, "compatible-registry.yaml");
    const conflictingRegistryPath = path.join(root, "conflicting-registry.yaml");
    const registryText = await fs.readFile(registryPath, "utf8");
    const versionedCodeProfile = `
  - profile_id: code-source-profile-v2
    target_material_kind: code
    is_default_for_kind: false
    definition_ref: .onto/processes/reconstruct/source-profiles/code.md
    definition_sha256: ac1968b4eb2035c514bf16350e8508f35a260761512e3a9b7f3a8c0026812221
    contract_status: active
    runtime_implementation_status: planned
    schema_version: 1
    profile_version: 2
    migration_status: supported_previous
    supersedes: [code-source-profile]
    replaced_by: []
    split_from: []
    split_into: []
    merged_from: []
    merged_into: []
`;
    await fs.writeFile(
      compatibleRegistryPath,
      registryText.replace(
        "\nsource_profile_migration_policy:",
        `${versionedCodeProfile}\nsource_profile_migration_policy:`,
      ),
      "utf8",
    );
    await fs.writeFile(
      conflictingRegistryPath,
      registryText.replace(
        "\nsource_profile_migration_policy:",
        `${versionedCodeProfile.replace("is_default_for_kind: false", "is_default_for_kind: true")}\nsource_profile_migration_policy:`,
      ),
      "utf8",
    );

    const registry = await loadReconstructContractRegistry({
      registryPath: compatibleRegistryPath,
    });

    expect(registry.source_profile_records.filter((profile) =>
      profile.target_material_kind === "code"
    )).toHaveLength(2);
    expect(registry.source_profile_records.filter((profile) =>
      profile.target_material_kind === "code" && profile.is_default_for_kind
    )).toHaveLength(1);
    await expect(loadReconstructContractRegistry({
      registryPath: conflictingRegistryPath,
    })).rejects.toThrow(/Multiple default source profiles/);
  });

  it("keeps candidate disposition validation closed over runtime source observations", async () => {
    const registry = await loadReconstructContractRegistry({
      registryPath: path.resolve(
        ".onto/processes/reconstruct/reconstruct-contract-registry.yaml",
      ),
    });
    const validator = registry.validator_records.find((record) =>
      record.validator_id === "candidate-disposition-validator"
    );

    expect(validator?.input_authority_refs).toContain("source-observations.yaml");
  });

  it("admits domain competency ids and lifecycle metadata from explicit domain input", async () => {
    const projectRoot = process.cwd();
    const registryPath = path.resolve(
      ".onto/processes/reconstruct/reconstruct-contract-registry.yaml",
    );
    const contractRegistry = await loadReconstructContractRegistry({ registryPath });
    const lensIds = loadCoreLensRegistry().full_review_lens_ids;
    const snapshot = await buildReconstructRunGoverningSnapshot({
      projectRoot,
      registryPath,
      contractRegistry,
      selectedSourceProfiles: [],
      lensIds,
      admittedDomainIds: ["ontology"],
    });
    const violations = await validateReconstructRunGoverningSnapshot({
      projectRoot,
      registryPath,
      contractRegistry,
      selectedSourceProfiles: [],
      lensIds,
      admittedDomainIds: ["ontology"],
      snapshot,
    });

    expect(snapshot.requested_domain_ids).toEqual(["ontology"]);
    expect(snapshot.admitted_domain_competency_refs).toEqual(["domain:ontology"]);
    expect(snapshot.admitted_domain_competency_source_refs)
      .toContain(".onto/domains/ontology/competency_qs.md");
    expect(snapshot.required_admitted_competency_ids).toContain("domain:ontology#CQ-E01");
    expect(snapshot.admitted_domain_competency_snapshots[0]?.source_seat)
      .toBe("project");
    expect(snapshot.admitted_domain_competency_snapshots[0]?.source_ref)
      .toBe(".onto/domains/ontology/competency_qs.md");
    expect(snapshot.admitted_domain_competency_snapshots[0]?.admission_policy)
      .toBe("required_p1_with_all_priorities_metadata");
    expect(snapshot.admitted_domain_competency_snapshots[0]?.authority_resolution_order)
      .toEqual(expect.arrayContaining([
        `project:${path.join(projectRoot, ".onto", "domains", "ontology", "competency_qs.md")}`,
      ]));
    expect(snapshot.admitted_competency_priorities.CQ_E01).toBeUndefined();
    expect(snapshot.admitted_competency_priorities["domain:ontology#CQ-E01"]).toBe("P1");
    expect(snapshot.selected_reference_standard_ids).toContain("owl_2");
    expect(snapshot.selected_reference_standard_version_or_snapshot_ids.owl_2)
      .toMatch(/^registry-row-sha256:/);
    expect(snapshot.selected_pattern_catalog_ids).toContain("ontology_design_pattern_catalog");
    expect(snapshot.selected_pattern_catalog_version_or_snapshot_ids.ontology_design_pattern_catalog)
      .toMatch(/^registry-row-sha256:/);
    expect(snapshot.selected_pattern_catalog_canonical_uris.ontology_design_pattern_catalog)
      .toBe("urn:onto-mcp:reconstruct:pattern-catalog:ontology_design_pattern_catalog");
    expect(snapshot.competency_id_migration_mappings.some((mapping) =>
      mapping.competency_id === "domain:ontology#CQ-E01" &&
      mapping.migration_status === "current"
    )).toBe(true);
    expect(violations).toEqual([]);
  });

  it("keeps domain competency source identity stable across launch working directories", async () => {
    const projectRoot = process.cwd();
    const registryPath = path.resolve(
      ".onto/processes/reconstruct/reconstruct-contract-registry.yaml",
    );
    const contractRegistry = await loadReconstructContractRegistry({ registryPath });
    const lensIds = loadCoreLensRegistry().full_review_lens_ids;
    const baseline = await buildReconstructRunGoverningSnapshot({
      projectRoot,
      registryPath,
      contractRegistry,
      selectedSourceProfiles: [],
      lensIds,
      admittedDomainIds: ["ontology"],
    });
    const originalCwd = process.cwd();
    const alternateCwd = await fs.mkdtemp(path.join(os.tmpdir(), "onto-cwd-"));
    let fromAlternateCwd = baseline;
    try {
      process.chdir(alternateCwd);
      fromAlternateCwd = await buildReconstructRunGoverningSnapshot({
        projectRoot,
        registryPath,
        contractRegistry,
        selectedSourceProfiles: [],
        lensIds,
        admittedDomainIds: ["ontology"],
      });
    } finally {
      process.chdir(originalCwd);
    }

    expect(fromAlternateCwd.admitted_domain_competency_refs)
      .toEqual(baseline.admitted_domain_competency_refs);
    expect(fromAlternateCwd.admitted_domain_competency_source_refs)
      .toEqual(baseline.admitted_domain_competency_source_refs);
    expect(fromAlternateCwd.admitted_domain_competency_snapshots)
      .toEqual(baseline.admitted_domain_competency_snapshots);
    expect(fromAlternateCwd.admitted_domain_competency_snapshots[0]?.source_ref)
      .toBe(".onto/domains/ontology/competency_qs.md");
    expect(path.isAbsolute(
      fromAlternateCwd.admitted_domain_competency_snapshots[0]?.source_ref ?? "",
    )).toBe(false);
  });

  it("admits hyphenated multi-segment domain competency ids", async () => {
    const projectRoot = process.cwd();
    const registryPath = path.resolve(
      ".onto/processes/reconstruct/reconstruct-contract-registry.yaml",
    );
    const contractRegistry = await loadReconstructContractRegistry({ registryPath });
    const lensIds = loadCoreLensRegistry().full_review_lens_ids;
    const snapshot = await buildReconstructRunGoverningSnapshot({
      projectRoot,
      registryPath,
      contractRegistry,
      selectedSourceProfiles: [],
      lensIds,
      admittedDomainIds: ["software-engineering"],
    });

    expect(snapshot.required_admitted_competency_ids).toContain("domain:software-engineering#CQ-S-01");
    expect(snapshot.admitted_competency_priorities["domain:software-engineering#CQ-S-01"])
      .toBe("P1");
    expect(snapshot.required_admitted_competency_ids).not.toContain("domain:software-engineering#CQ-S-04");
    expect(snapshot.admitted_competency_priorities["domain:software-engineering#CQ-S-04"])
      .toBe("P2");
    expect(snapshot.admitted_domain_competency_snapshots[0]?.required_admitted_competency_ids)
      .not.toContain("domain:software-engineering#CQ-S-09");
    expect(snapshot.admitted_competency_priorities["domain:software-engineering#CQ-S-09"])
      .toBe("P3");
    expect(snapshot.admitted_domain_competency_snapshots[0]?.admitted_competencies.some(
      (competency) => competency.qualified_competency_id === "domain:software-engineering#CQ-S-09",
    )).toBe(true);
  });

  it("rejects admitted domain ids that would change path or ref grammar", async () => {
    const projectRoot = process.cwd();
    const registryPath = path.resolve(
      ".onto/processes/reconstruct/reconstruct-contract-registry.yaml",
    );
    const contractRegistry = await loadReconstructContractRegistry({ registryPath });
    const lensIds = loadCoreLensRegistry().full_review_lens_ids;
    const invalidDomainIds = [
      "../ontology",
      "software/engineering",
      "Software-Engineering",
      "software_engineering",
      "software:engineering",
      "software engineering",
      "-software",
      "software-",
      "software--engineering",
    ];

    for (const domainId of invalidDomainIds) {
      await expect(buildReconstructRunGoverningSnapshot({
        projectRoot,
        registryPath,
        contractRegistry,
        selectedSourceProfiles: [],
        lensIds,
        admittedDomainIds: [domainId],
      })).rejects.toThrow(/admitted domain id must use/);
    }
  });

  it("fails loud when a project domain competency source realpath escapes its authority root", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "onto-domain-escape-"));
    const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), "onto-domain-outside-"));
    const domainRoot = path.join(projectRoot, ".onto", "domains", "escape");
    await writeDomainCompetencyQuestions({
      domainRoot: outsideRoot,
      prefix: "ESC",
    });
    await fs.mkdir(domainRoot, { recursive: true });
    await fs.symlink(
      path.join(outsideRoot, "competency_qs.md"),
      path.join(domainRoot, "competency_qs.md"),
    );

    const registryPath = path.resolve(
      ".onto/processes/reconstruct/reconstruct-contract-registry.yaml",
    );
    const contractRegistry = await loadReconstructContractRegistry({ registryPath });
    const lensIds = loadCoreLensRegistry().full_review_lens_ids;
    const statSpy = vi.spyOn(fs, "stat");

    try {
      await expect(buildReconstructRunGoverningSnapshot({
        projectRoot,
        registryPath,
        contractRegistry,
        selectedSourceProfiles: [],
        lensIds,
        admittedDomainIds: ["escape"],
      })).rejects.toThrow(/realpath escapes allowed root/);
      expect(statSpy).not.toHaveBeenCalled();
    } finally {
      statSpy.mockRestore();
    }
  });

  it("fails loud when a user domain competency source realpath escapes its authority root", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "onto-project-"));
    const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "onto-user-home-"));
    const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), "onto-user-outside-"));
    const domainRoot = path.join(userHome, ".onto", "domains", "user-escape");
    await writeDomainCompetencyQuestions({
      domainRoot: outsideRoot,
      prefix: "UESC",
    });
    await fs.mkdir(domainRoot, { recursive: true });
    await fs.symlink(
      path.join(outsideRoot, "competency_qs.md"),
      path.join(domainRoot, "competency_qs.md"),
    );
    vi.stubEnv("HOME", userHome);
    try {
      const registryPath = path.resolve(
        ".onto/processes/reconstruct/reconstruct-contract-registry.yaml",
      );
      const contractRegistry = await loadReconstructContractRegistry({ registryPath });
      const lensIds = loadCoreLensRegistry().full_review_lens_ids;

      await expect(buildReconstructRunGoverningSnapshot({
        projectRoot,
        registryPath,
        contractRegistry,
        selectedSourceProfiles: [],
        lensIds,
        admittedDomainIds: ["user-escape"],
      })).rejects.toThrow(/realpath escapes allowed root/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("fails loud when an installation domain competency source realpath escapes its authority root", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "onto-project-"));
    const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "onto-empty-home-"));
    const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), "onto-install-outside-"));
    const installDomainRoot = path.resolve(".onto/domains/install-escape");
    await writeDomainCompetencyQuestions({
      domainRoot: outsideRoot,
      prefix: "IESC",
    });
    await fs.rm(installDomainRoot, { recursive: true, force: true });
    await fs.mkdir(installDomainRoot, { recursive: true });
    await fs.symlink(
      path.join(outsideRoot, "competency_qs.md"),
      path.join(installDomainRoot, "competency_qs.md"),
    );
    vi.stubEnv("HOME", userHome);
    try {
      const registryPath = path.resolve(
        ".onto/processes/reconstruct/reconstruct-contract-registry.yaml",
      );
      const contractRegistry = await loadReconstructContractRegistry({ registryPath });
      const lensIds = loadCoreLensRegistry().full_review_lens_ids;

      await expect(buildReconstructRunGoverningSnapshot({
        projectRoot,
        registryPath,
        contractRegistry,
        selectedSourceProfiles: [],
        lensIds,
        admittedDomainIds: ["install-escape"],
      })).rejects.toThrow(/realpath escapes allowed root/);
    } finally {
      vi.unstubAllEnvs();
      await fs.rm(installDomainRoot, { recursive: true, force: true });
    }
  });

  it("reads and hashes the admitted project domain competency realpath identity", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "onto-project-"));
    const realDomainRoot = path.join(projectRoot, ".onto", "domains", "linked-target");
    const linkedDomainRoot = path.join(projectRoot, ".onto", "domains", "linked");
    await writeDomainCompetencyQuestions({
      domainRoot: realDomainRoot,
      prefix: "LINK",
    });
    await fs.mkdir(linkedDomainRoot, { recursive: true });
    const lexicalSourcePath = path.join(linkedDomainRoot, "competency_qs.md");
    const realSourcePath = path.join(realDomainRoot, "competency_qs.md");
    await fs.symlink(realSourcePath, lexicalSourcePath);
    const admittedRealSourcePath = await fs.realpath(realSourcePath);

    const registryPath = path.resolve(
      ".onto/processes/reconstruct/reconstruct-contract-registry.yaml",
    );
    const contractRegistry = await loadReconstructContractRegistry({ registryPath });
    const lensIds = loadCoreLensRegistry().full_review_lens_ids;
    const readFileSpy = vi.spyOn(fs, "readFile");
    const statSpy = vi.spyOn(fs, "stat");
    try {
      const snapshot = await buildReconstructRunGoverningSnapshot({
        projectRoot,
        registryPath,
        contractRegistry,
        selectedSourceProfiles: [],
        lensIds,
        admittedDomainIds: ["linked"],
      });
      const readPaths = readFileSpy.mock.calls.map((call) => String(call[0]));
      const statPaths = statSpy.mock.calls.map((call) => String(call[0]));
      const realSourceText = await fs.readFile(admittedRealSourcePath, "utf8");

      expect(snapshot.admitted_domain_competency_source_refs)
        .toEqual([".onto/domains/linked/competency_qs.md"]);
      expect(snapshot.admitted_domain_competency_snapshots[0]?.source_ref)
        .toBe(".onto/domains/linked/competency_qs.md");
      expect(path.isAbsolute(
        snapshot.admitted_domain_competency_snapshots[0]?.source_ref ?? "",
      )).toBe(false);
      expect(statPaths).toContain(admittedRealSourcePath);
      expect(statPaths).not.toContain(lexicalSourcePath);
      expect(readPaths).toContain(admittedRealSourcePath);
      expect(readPaths).not.toContain(lexicalSourcePath);
      expect(snapshot.admitted_domain_competency_snapshots[0]?.source_sha256)
        .toBe(sha256Text(realSourceText));
    } finally {
      statSpy.mockRestore();
      readFileSpy.mockRestore();
    }
  });

  it("records user domain authority-seat resolution without touching the real user home", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "onto-project-"));
    const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "onto-user-home-"));
    await writeDomainCompetencyQuestions({
      domainRoot: path.join(userHome, ".onto", "domains", "user-only"),
      prefix: "U",
    });
    vi.stubEnv("HOME", userHome);
    try {
      const registryPath = path.resolve(
        ".onto/processes/reconstruct/reconstruct-contract-registry.yaml",
      );
      const contractRegistry = await loadReconstructContractRegistry({ registryPath });
      const lensIds = loadCoreLensRegistry().full_review_lens_ids;
      const snapshot = await buildReconstructRunGoverningSnapshot({
        projectRoot,
        registryPath,
        contractRegistry,
        selectedSourceProfiles: [],
        lensIds,
        admittedDomainIds: ["user-only"],
      });

      expect(snapshot.admitted_domain_competency_refs).toEqual(["domain:user-only"]);
      expect(snapshot.admitted_domain_competency_source_refs)
        .toEqual(["user:domain:user-only/competency_qs.md"]);
      expect(snapshot.required_admitted_competency_ids)
        .toEqual(["domain:user-only#CQ-U-01"]);
      expect(snapshot.admitted_domain_competency_snapshots[0]?.source_seat)
        .toBe("user");
      expect(snapshot.admitted_domain_competency_snapshots[0]?.authority_resolution_order)
        .toEqual(expect.arrayContaining([
          `user:${path.join(userHome, ".onto", "domains", "user-only", "competency_qs.md")}`,
        ]));
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("records installation domain authority-seat resolution when project and user seats miss", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "onto-project-"));
    const userHome = await fs.mkdtemp(path.join(os.tmpdir(), "onto-empty-home-"));
    vi.stubEnv("HOME", userHome);
    try {
      const registryPath = path.resolve(
        ".onto/processes/reconstruct/reconstruct-contract-registry.yaml",
      );
      const contractRegistry = await loadReconstructContractRegistry({ registryPath });
      const lensIds = loadCoreLensRegistry().full_review_lens_ids;
      const snapshot = await buildReconstructRunGoverningSnapshot({
        projectRoot,
        registryPath,
        contractRegistry,
        selectedSourceProfiles: [],
        lensIds,
        admittedDomainIds: ["ontology"],
      });

      expect(snapshot.admitted_domain_competency_refs).toEqual(["domain:ontology"]);
      expect(snapshot.admitted_domain_competency_source_refs)
        .toEqual(["installation:domain:ontology/competency_qs.md"]);
      expect(snapshot.required_admitted_competency_ids)
        .toContain("domain:ontology#CQ-E01");
      expect(snapshot.admitted_domain_competency_snapshots[0]?.source_seat)
        .toBe("installation");
      expect(snapshot.admitted_domain_competency_snapshots[0]?.authority_resolution_order)
        .toEqual(expect.arrayContaining([
          `installation:${path.resolve(".onto/domains/ontology/competency_qs.md")}`,
        ]));
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("fails loud when the registry selects an unsupported domain competency admission policy", async () => {
    const registryPath = path.resolve(
      ".onto/processes/reconstruct/reconstruct-contract-registry.yaml",
    );
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "onto-registry-"));
    const invalidRegistryPath = path.join(root, "reconstruct-contract-registry.yaml");
    const registryText = await fs.readFile(registryPath, "utf8");
    await fs.writeFile(
      invalidRegistryPath,
      registryText
        .replace(
          "admission_policy_id: required_p1_with_all_priorities_metadata",
          "admission_policy_id: unsupported_domain_policy",
        )
        .replace(
          "supported_runtime_admission_policy_ids: [required_p1_with_all_priorities_metadata]",
          "supported_runtime_admission_policy_ids: [unsupported_domain_policy]",
        ),
      "utf8",
    );
    const contractRegistry = await loadReconstructContractRegistry({
      registryPath: invalidRegistryPath,
    });
    const lensIds = loadCoreLensRegistry().full_review_lens_ids;

    await expect(buildReconstructRunGoverningSnapshot({
      projectRoot: process.cwd(),
      registryPath: invalidRegistryPath,
      contractRegistry,
      selectedSourceProfiles: [],
      lensIds,
      admittedDomainIds: [],
    })).rejects.toThrow(/unsupported admitted domain competency admission policy/);
  });

  it("rejects snapshots that omit independently requested domain admission", async () => {
    const projectRoot = process.cwd();
    const registryPath = path.resolve(
      ".onto/processes/reconstruct/reconstruct-contract-registry.yaml",
    );
    const contractRegistry = await loadReconstructContractRegistry({ registryPath });
    const lensIds = loadCoreLensRegistry().full_review_lens_ids;
    const snapshot = await buildReconstructRunGoverningSnapshot({
      projectRoot,
      registryPath,
      contractRegistry,
      selectedSourceProfiles: [],
      lensIds,
      admittedDomainIds: [],
    });
    const violations = await validateReconstructRunGoverningSnapshot({
      projectRoot,
      registryPath,
      contractRegistry,
      selectedSourceProfiles: [],
      lensIds,
      admittedDomainIds: ["ontology"],
      snapshot,
    });

    expect(violations.some((violation) =>
      violation.subject_id === "governing_snapshot.requested_domain_ids" ||
      violation.subject_id === "governing_snapshot.required_admitted_competency_ids"
    )).toBe(true);
  });

  it("rejects snapshots that omit selected reference authority bindings", async () => {
    const projectRoot = process.cwd();
    const registryPath = path.resolve(
      ".onto/processes/reconstruct/reconstruct-contract-registry.yaml",
    );
    const contractRegistry = await loadReconstructContractRegistry({ registryPath });
    const lensIds = loadCoreLensRegistry().full_review_lens_ids;
    const snapshot = await buildReconstructRunGoverningSnapshot({
      projectRoot,
      registryPath,
      contractRegistry,
      selectedSourceProfiles: [],
      lensIds,
      admittedDomainIds: [],
    });
    const incompleteSnapshot = {
      ...snapshot,
      selected_pattern_catalog_canonical_uris: {},
    };
    const violations = await validateReconstructRunGoverningSnapshot({
      projectRoot,
      registryPath,
      contractRegistry,
      selectedSourceProfiles: [],
      lensIds,
      admittedDomainIds: [],
      snapshot: incompleteSnapshot,
    });

    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "manifest_snapshot_mismatch",
          subject_id: "governing_snapshot.selected_pattern_catalog_canonical_uris",
        }),
      ]),
    );
  });

  it("validates historical governing snapshots by recorded shape when the current registry changed", async () => {
    const projectRoot = process.cwd();
    const registryPath = path.resolve(
      ".onto/processes/reconstruct/reconstruct-contract-registry.yaml",
    );
    const contractRegistry = await loadReconstructContractRegistry({ registryPath });
    const lensIds = loadCoreLensRegistry().full_review_lens_ids;
    const snapshot = await buildReconstructRunGoverningSnapshot({
      projectRoot,
      registryPath,
      contractRegistry,
      selectedSourceProfiles: [],
      lensIds,
      admittedDomainIds: [],
    });
    const historicalSnapshot = {
      ...snapshot,
      registry: {
        ...snapshot.registry,
        registry_sha256: "recorded-previous-registry-hash",
      },
    };
    const violations = await validateReconstructRunGoverningSnapshot({
      projectRoot,
      registryPath,
      contractRegistry,
      selectedSourceProfiles: [],
      lensIds,
      admittedDomainIds: [],
      snapshot: historicalSnapshot,
      validationMode: "historical_replay",
    });

    expect(violations).toEqual([]);
  });

  it("fails live terminal governing snapshot validation on active registry hash mismatch", async () => {
    const projectRoot = process.cwd();
    const registryPath = path.resolve(
      ".onto/processes/reconstruct/reconstruct-contract-registry.yaml",
    );
    const contractRegistry = await loadReconstructContractRegistry({ registryPath });
    const lensIds = loadCoreLensRegistry().full_review_lens_ids;
    const snapshot = await buildReconstructRunGoverningSnapshot({
      projectRoot,
      registryPath,
      contractRegistry,
      selectedSourceProfiles: [],
      lensIds,
      admittedDomainIds: [],
    });
    const staleSnapshot = {
      ...snapshot,
      registry: {
        ...snapshot.registry,
        registry_sha256: "recorded-previous-registry-hash",
      },
    };

    const violations = await validateReconstructRunGoverningSnapshot({
      projectRoot,
      registryPath,
      contractRegistry,
      selectedSourceProfiles: [],
      lensIds,
      admittedDomainIds: [],
      snapshot: staleSnapshot,
    });

    expect(violations).toEqual([
      expect.objectContaining({
        code: "manifest_snapshot_mismatch",
        subject_id: "governing_snapshot.registry.registry_sha256",
      }),
    ]);
  });
});
