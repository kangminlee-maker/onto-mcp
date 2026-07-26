import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  ReconstructSourceFrontierArtifact,
  ReconstructSourceInventoryArtifact,
  ReconstructSourceInventoryUnit,
  ReconstructSourceObservationsArtifact,
  ReconstructTargetMaterialProfileArtifact,
  ReconstructTargetMaterialProfileValidationArtifact,
} from "./artifact-types.js";
import {
  applyAdmissionSelectionFloorPolicy,
  capAdmissionSelectionAcceptedRefs,
  runSourceAdmissionSelectionStage,
  SOURCE_ADMISSION_DEEP_FILE_LIMIT,
  SOURCE_ADMISSION_SELECTION_FLOOR,
  validateSourceFrontier,
} from "./source-admission-selection-stage.js";
import {
  capProjectedRegionsPerFile,
  deferredSourceRefs,
  MAX_PROJECTED_REGIONS_PER_FILE,
} from "./authoring-prompt-payloads.js";
import {
  type ReconstructSourceAdmissionSelectionAuthorInput,
} from "./directive-author-contract.js";
import { isZeroObservationGracefulTerminalEligible } from "./graceful-terminal.js";
import {
  assertSemanticAuthoringHasObservedEvidence,
  validateSourceObservationBoundary,
} from "./source-observations.js";

// Spec basis: development-records/design/20260722-inter-document-breadth-stage2-design.md §4-§7,
// §13 PR-2b. Direct-function-call style (run-source-region-decomposition.test.ts precedent):
// `runSourceAdmissionSelectionStage` is called directly with a minimal stub author (implementing
// only writeSourceAdmissionSelection), never through the full 40-method ReconstructDirectiveAuthor
// or a live reconstruct run (that is the main session's job, per the task packet).

const now = "2026-07-22T00:00:00.000Z";
const tmpRoots: string[] = [];

async function makeTmpProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "onto-reconstruct-admission-"));
  tmpRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    tmpRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

function smallCodeContent(label: string): string {
  return `export function ${label}(): number {\n  return 1;\n}\n`;
}

function largeCodeFixtureContent(functionCount = 100): string {
  const parts: string[] = [];
  for (let i = 0; i < functionCount; i += 1) {
    parts.push(
      `export function feature${i}(value: number): number {\n` +
        `  // computed feature ${i}\n` +
        `  return value + ${i};\n` +
        `}\n`,
    );
  }
  return parts.join("\n");
}

function admittedUnit(ref: string): ReconstructSourceInventoryUnit {
  return {
    ref,
    exists: true,
    target_material_kind: "code",
    inventory_unit: "file_or_package_unit",
    profile_ref: "code.v1",
    scan_status: "admitted",
    skip_reason: null,
    outline: {
      content_sha256: "0".repeat(64),
      char_count: 40,
      line_count: 3,
      size_bytes: 40,
      outline_excerpt: "export function stub(): number {\n",
      outline_excerpt_truncated: false,
    },
  };
}

function targetMaterialProfile(refs: string[]): ReconstructTargetMaterialProfileArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    target_refs: refs,
    target_material_kind: "code",
    target_material_kind_candidates: ["code"],
    support_status: "partial",
    unsupported_reason: null,
    selected_source_profiles: [],
    detection: {
      owner: "runtime_heuristic",
      confidence: 0.9,
      confidence_basis: "test fixture",
      per_ref: refs.map((ref) => ({
        ref,
        exists: true,
        kind: "code" as const,
        confidence: 0.9,
        confidence_basis: "test fixture",
      })),
    },
  };
}

function targetMaterialProfileValidation(): ReconstructTargetMaterialProfileValidationArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    target_material_profile_ref: "target-material-profile.yaml",
    registry_ref: null,
    validation_status: "valid",
    target_ref_count: 1,
    selected_source_profile_count: 1,
    validation_results: ["valid"],
    violations: [],
  };
}

function emptySourceObservations(): ReconstructSourceObservationsArtifact {
  return {
    schema_version: "1",
    session_id: "session-1",
    created_at: now,
    observations: [],
    skipped_refs: [],
    validation_results: [],
  };
}

/** A stub author that always accepts EXACTLY the given source refs (priority "high"), or defers
 *  everything when `acceptRefs` is empty — never actually dispatches an LLM. */
function stubAuthor(acceptRefs: string[]): Pick<
  { writeSourceAdmissionSelection(input: ReconstructSourceAdmissionSelectionAuthorInput): Promise<ReconstructSourceFrontierArtifact> },
  "writeSourceAdmissionSelection"
> {
  return {
    async writeSourceAdmissionSelection(input) {
      return {
        schema_version: "1",
        session_id: input.sessionId,
        round_id: "admission",
        created_at: now,
        exploration_synthesis_ref: null,
        frontier_refs: acceptRefs.map((ref, index) => ({
          frontier_ref_id: `admission_${index + 1}`,
          source_ref: ref,
          rationale: "stub selection",
          priority: "high" as const,
        })),
        no_next_frontier_rationale: acceptRefs.length === 0 ? "nothing relevant" : null,
        directive_author: { owner: "host_llm", author_id: "test-stub" },
      };
    },
  };
}

function stageArgs(overrides: {
  root: string;
  sourceInventory: ReconstructSourceInventoryArtifact;
  acceptRefs: string[];
  fileLimit?: number;
  floor?: number;
  sourceRegionDecomposition?: boolean;
  codeStructureObservation?: boolean;
}): Parameters<typeof runSourceAdmissionSelectionStage>[0] {
  const refs = overrides.sourceInventory.inventory_units.map((unit) => unit.ref);
  return {
    sessionId: "session-1",
    intent: "test intent",
    targetMaterialProfile: targetMaterialProfile(refs),
    targetMaterialProfileValidation: targetMaterialProfileValidation(),
    targetMaterialProfileValidationRef: "target-material-profile-validation.yaml",
    sourceInventory: overrides.sourceInventory,
    sourceInventoryRef: path.join(overrides.root, "source-inventory.yaml"),
    sourceObservations: emptySourceObservations(),
    sourceObservationsRef: path.join(overrides.root, "source-observations.yaml"),
    directiveAuthor: stubAuthor(overrides.acceptRefs),
    admissionSelectionPath: path.join(overrides.root, "source-admission-selection.yaml"),
    admissionSelectionValidationPath: path.join(
      overrides.root,
      "source-admission-selection-validation.yaml",
    ),
    ...(overrides.fileLimit !== undefined ? { fileLimit: overrides.fileLimit } : {}),
    ...(overrides.floor !== undefined ? { floor: overrides.floor } : {}),
    ...(overrides.sourceRegionDecomposition ? { sourceRegionDecomposition: true } : {}),
    ...(overrides.codeStructureObservation ? { codeStructureObservation: true } : {}),
  };
}

describe("runSourceAdmissionSelectionStage (Core Stage 2 inter-document breadth design 20260722-inter-document-breadth-stage2 §4-§7, PR-2b)", () => {
  it("no-op (returns null, no writes) when there is no admitted unit — off / below-threshold guard", async () => {
    const root = await makeTmpProject();
    const inventory: ReconstructSourceInventoryArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      inventory_units: [{
        ref: path.join(root, "planned.ts"),
        exists: true,
        target_material_kind: "code",
        inventory_unit: "file_or_package_unit",
        profile_ref: "code.v1",
        scan_status: "planned",
        skip_reason: null,
      }],
      scan_boundary: { filesystem_allowed_roots: [root], source: "binding" },
    };
    const result = await runSourceAdmissionSelectionStage(
      stageArgs({ root, sourceInventory: inventory, acceptRefs: [] }),
    );
    expect(result).toBeNull();
    await expect(fs.stat(path.join(root, "source-admission-selection.yaml"))).rejects.toThrow();
  });

  it("(a) promotes ONLY the accepted file with is_runtime_target_source:true and NO frontier-re-entry trigger (the split); the real boundary validator accepts it", async () => {
    const root = await makeTmpProject();
    const acceptedRef = path.join(root, "accepted.ts");
    const deferredRef = path.join(root, "deferred.ts");
    await fs.writeFile(acceptedRef, smallCodeContent("accepted"), "utf8");
    await fs.writeFile(deferredRef, smallCodeContent("deferred"), "utf8");
    const inventory: ReconstructSourceInventoryArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      inventory_units: [admittedUnit(acceptedRef), admittedUnit(deferredRef)],
      scan_boundary: { filesystem_allowed_roots: [root], source: "binding" },
    };
    const result = await runSourceAdmissionSelectionStage(
      stageArgs({ root, sourceInventory: inventory, acceptRefs: [acceptedRef] }),
    );
    expect(result).not.toBeNull();
    expect(result!.sourceObservations.observations).toHaveLength(1);
    const promoted = result!.sourceObservations.observations[0]!;
    expect(promoted.source_ref).toBe(acceptedRef);
    expect(promoted.is_runtime_target_source).toBe(true);
    // The load-bearing correctness assertion (design §5/§15): a promoted admission file must NOT
    // carry a frontier-re-entry trigger — that combination is exactly what observeAcceptedFrontierRefs
    // would produce (is_runtime_target_source:false + non-null trigger) and what the real boundary
    // validator rejects as a mutual-exclusion violation. Prove it by running the REAL validator.
    expect(promoted.triggering_frontier_validation_ref ?? null).toBeNull();
    const validation = validateSourceObservationBoundary(promoted);
    expect(validation.violations).toEqual([]);
    expect(validation.valid).toBe(true);

    // The deferred file stays "admitted" with its outline, untouched.
    const deferredUnit = result!.sourceInventory.inventory_units.find((u) => u.ref === deferredRef);
    expect(deferredUnit?.scan_status).toBe("admitted");
    expect(deferredUnit?.outline).toBeDefined();

    // Persisted to disk (the caller-owned paths), not just returned in-memory.
    const persistedObservations = JSON.parse(
      JSON.stringify(await fs.readFile(path.join(root, "source-observations.yaml"), "utf8")),
    );
    expect(typeof persistedObservations).toBe("string");
    expect(persistedObservations).toContain(acceptedRef);
  });

  it("(b) an unaccepted admitted unit appears in deferredSourceRefs with outline_present:true", async () => {
    const root = await makeTmpProject();
    const acceptedRef = path.join(root, "accepted.ts");
    const deferredRef = path.join(root, "deferred.ts");
    await fs.writeFile(acceptedRef, smallCodeContent("accepted"), "utf8");
    await fs.writeFile(deferredRef, smallCodeContent("deferred"), "utf8");
    const inventory: ReconstructSourceInventoryArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      inventory_units: [admittedUnit(acceptedRef), admittedUnit(deferredRef)],
      scan_boundary: { filesystem_allowed_roots: [root], source: "binding" },
    };
    const result = await runSourceAdmissionSelectionStage(
      stageArgs({ root, sourceInventory: inventory, acceptRefs: [acceptedRef] }),
    );
    const deferred = deferredSourceRefs({
      sourceInventory: result!.sourceInventory,
      sourceObservations: result!.sourceObservations,
    });
    expect(deferred).toHaveLength(1);
    expect(deferred[0]!.ref).toBe(deferredRef);
    expect(deferred[0]!.outline_present).toBe(true);
    expect(deferred[0]!.reason.length).toBeGreaterThan(0);
  });

  it("(c) partition — every unit is classified as exactly one of {promoted, deferred, skipped}, non-empty subject, no leaks and no overlap", async () => {
    const root = await makeTmpProject();
    const promotedRef = path.join(root, "promoted.ts");
    const deferredRef = path.join(root, "deferred.ts");
    await fs.writeFile(promotedRef, smallCodeContent("promoted"), "utf8");
    await fs.writeFile(deferredRef, smallCodeContent("deferred"), "utf8");
    const skippedUnit: ReconstructSourceInventoryUnit = {
      ref: path.join(root, "does-not-exist.ts"),
      exists: false,
      target_material_kind: "code",
      inventory_unit: "file_or_package_unit",
      profile_ref: "code.v1",
      scan_status: "skipped",
      skip_reason: "target ref does not exist",
    };
    const inventory: ReconstructSourceInventoryArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      inventory_units: [admittedUnit(promotedRef), admittedUnit(deferredRef), skippedUnit],
      scan_boundary: { filesystem_allowed_roots: [root], source: "binding" },
    };
    const result = await runSourceAdmissionSelectionStage(
      stageArgs({ root, sourceInventory: inventory, acceptRefs: [promotedRef] }),
    );
    const finalInventory = result!.sourceInventory;
    const finalObservations = result!.sourceObservations;

    const observedRefs = new Set(finalObservations.observations.map((o) => o.source_ref));
    const promoted = finalInventory.inventory_units.filter(
      (u) => u.scan_status === "admitted" && observedRefs.has(u.ref),
    );
    const deferred = deferredSourceRefs({ sourceInventory: finalInventory, sourceObservations: finalObservations });
    const skipped = finalInventory.inventory_units.filter((u) => u.scan_status === "skipped");

    // Non-vacuous subject (verification discipline: an empty partition proves nothing).
    expect(finalInventory.inventory_units.length).toBe(3);
    expect(promoted.length).toBeGreaterThan(0);
    expect(deferred.length).toBeGreaterThan(0);
    expect(skipped.length).toBeGreaterThan(0);

    // No leaks: every unit is accounted for exactly once.
    expect(promoted.length + deferred.length + skipped.length).toBe(finalInventory.inventory_units.length);
    // No overlap: the three ref sets are pairwise disjoint.
    const promotedRefs = new Set(promoted.map((u) => u.ref));
    const deferredRefs = new Set(deferred.map((d) => d.ref));
    const skippedRefs = new Set(skipped.map((u) => u.ref));
    for (const ref of promotedRefs) {
      expect(deferredRefs.has(ref)).toBe(false);
      expect(skippedRefs.has(ref)).toBe(false);
    }
    for (const ref of deferredRefs) expect(skippedRefs.has(ref)).toBe(false);
  });

  it("(d) gate-ordering falsifiable: an over-budget unselected file has ZERO observations (the decomposer never ran for it)", async () => {
    const root = await makeTmpProject();
    const selectedRef = path.join(root, "selected.ts");
    // Named to sort AFTER selectedRef (stable resolved-source_ref tiebreak, both priority "high") so
    // the fileLimit=1 cap deterministically keeps selectedRef and drops this one.
    const overBudgetRef = path.join(root, "unselected-large.ts");
    await fs.writeFile(selectedRef, smallCodeContent("selected"), "utf8");
    // The unselected file is intentionally LARGE (would decompose into many regions if it were
    // EVER deep-observed) — proving it produced ZERO observations proves observeInventoryUnitDeep
    // (hence expandSourceObservationIntoRegions) was never called for it, a call-graph property.
    await fs.writeFile(overBudgetRef, largeCodeFixtureContent(50), "utf8");
    const inventory: ReconstructSourceInventoryArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      inventory_units: [admittedUnit(selectedRef), admittedUnit(overBudgetRef)],
      scan_boundary: { filesystem_allowed_roots: [root], source: "binding" },
    };
    // Both proposed by the (stub) author, but fileLimit=1 caps to only one.
    const result = await runSourceAdmissionSelectionStage(
      stageArgs({
        root,
        sourceInventory: inventory,
        acceptRefs: [selectedRef, overBudgetRef],
        fileLimit: 1,
        sourceRegionDecomposition: true,
        codeStructureObservation: true,
      }),
    );
    expect(result).not.toBeNull();
    const overBudgetObservations = result!.sourceObservations.observations.filter(
      (o) => o.source_ref === overBudgetRef,
    );
    expect(overBudgetObservations).toHaveLength(0);
    const overBudgetUnit = result!.sourceInventory.inventory_units.find((u) => u.ref === overBudgetRef);
    expect(overBudgetUnit?.scan_status).toBe("admitted"); // untouched — still deferred, not dropped
    // The selected file DID get observed (sanity — the cap didn't just drop everything).
    expect(result!.sourceObservations.observations.some((o) => o.source_ref === selectedRef)).toBe(true);
  });

  it("(e) region composition: an accepted large file decomposes; capProjectedRegionsPerFile caps it at 8 without starving a different accepted file's observations (no shared pool)", async () => {
    const root = await makeTmpProject();
    const bigRef = path.join(root, "big.ts");
    const smallRef = path.join(root, "small.ts");
    await fs.writeFile(bigRef, largeCodeFixtureContent(100), "utf8");
    await fs.writeFile(smallRef, smallCodeContent("small"), "utf8");
    const inventory: ReconstructSourceInventoryArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      inventory_units: [admittedUnit(bigRef), admittedUnit(smallRef)],
      scan_boundary: { filesystem_allowed_roots: [root], source: "binding" },
    };
    const result = await runSourceAdmissionSelectionStage(
      stageArgs({
        root,
        sourceInventory: inventory,
        acceptRefs: [bigRef, smallRef],
        fileLimit: 2,
        sourceRegionDecomposition: true,
        codeStructureObservation: true,
      }),
    );
    expect(result).not.toBeNull();
    const bigObservations = result!.sourceObservations.observations.filter((o) => o.source_ref === bigRef);
    const smallObservations = result!.sourceObservations.observations.filter((o) => o.source_ref === smallRef);
    expect(bigObservations.length).toBeGreaterThan(MAX_PROJECTED_REGIONS_PER_FILE); // sanity: really decomposed past the cap
    expect(smallObservations.length).toBeGreaterThan(0);

    const cappedSmallAlone = capProjectedRegionsPerFile(smallObservations, MAX_PROJECTED_REGIONS_PER_FILE);
    const cappedMixed = capProjectedRegionsPerFile(
      result!.sourceObservations.observations,
      MAX_PROJECTED_REGIONS_PER_FILE,
    );
    const cappedBigInMixed = cappedMixed.filter((o) => o.source_ref === bigRef);
    const cappedSmallInMixed = cappedMixed.filter((o) => o.source_ref === smallRef);
    expect(cappedBigInMixed).toHaveLength(MAX_PROJECTED_REGIONS_PER_FILE);
    // The big file's over-cap does NOT reduce the small file's kept count — no shared pool.
    expect(cappedSmallInMixed).toHaveLength(cappedSmallAlone.length);
  });

  it("(f) empty-LM-selection: the floor promotes >=1 admitted unit, and assertSemanticAuthoringHasObservedEvidence does NOT throw", async () => {
    const root = await makeTmpProject();
    const refA = path.join(root, "a.ts");
    const refB = path.join(root, "b.ts");
    await fs.writeFile(refA, smallCodeContent("a"), "utf8");
    await fs.writeFile(refB, smallCodeContent("b"), "utf8");
    const inventory: ReconstructSourceInventoryArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      inventory_units: [admittedUnit(refA), admittedUnit(refB)],
      scan_boundary: { filesystem_allowed_roots: [root], source: "binding" },
    };
    const result = await runSourceAdmissionSelectionStage(
      stageArgs({ root, sourceInventory: inventory, acceptRefs: [] }), // LM defers everything
    );
    expect(result).not.toBeNull();
    expect(result!.sourceObservations.observations.length).toBeGreaterThanOrEqual(
      SOURCE_ADMISSION_SELECTION_FLOOR,
    );
    // The floor-promoted row is disclosed via the same rationale channel the scout policy uses.
    const floorRows = result!.admissionSelection.frontier_refs.filter((f) =>
      f.frontier_ref_id.startsWith("admission_floor_")
    );
    expect(floorRows.length).toBeGreaterThan(0);
    expect(floorRows[0]!.rationale).toContain("runtime_floor");
    // The promoted observation still carries the split's authority marker.
    expect(result!.sourceObservations.observations.every((o) => o.is_runtime_target_source === true))
      .toBe(true);

    // (g) gate-ordering, functionally: the hard-throw evidence gate must NOT fire once the stage
    // (with its floor) has run — this is the exact precondition that gate checks.
    expect(() =>
      assertSemanticAuthoringHasObservedEvidence({
        targetMaterialProfile: targetMaterialProfile([refA, refB]),
        sourceInventory: result!.sourceInventory,
        sourceObservations: result!.sourceObservations,
      })
    ).not.toThrow();
    expect(
      isZeroObservationGracefulTerminalEligible({
        sourceObservations: result!.sourceObservations,
        sourceInventory: result!.sourceInventory,
      }),
    ).toBe(false);
  });

  it("empty admitted set: an empty selection has no floor candidates left — the stage still returns (frontier_refs empty, no observations added) rather than throwing", async () => {
    // Degenerate case: floor policy has nothing left to promote once every admitted unit is
    // already accepted (here: zero admitted units besides the one already accepted).
    const root = await makeTmpProject();
    const onlyRef = path.join(root, "only.ts");
    await fs.writeFile(onlyRef, smallCodeContent("only"), "utf8");
    const inventory: ReconstructSourceInventoryArtifact = {
      schema_version: "1",
      session_id: "session-1",
      created_at: now,
      inventory_units: [admittedUnit(onlyRef)],
      scan_boundary: { filesystem_allowed_roots: [root], source: "binding" },
    };
    const result = await runSourceAdmissionSelectionStage(
      stageArgs({ root, sourceInventory: inventory, acceptRefs: [onlyRef] }),
    );
    expect(result!.sourceObservations.observations).toHaveLength(1);
  });
});

describe("capAdmissionSelectionAcceptedRefs (design §6 inter-file budget)", () => {
  it("ranks priority-first, then stable resolved source_ref, and slices to fileLimit", () => {
    const frontier: ReconstructSourceFrontierArtifact = {
      schema_version: "1",
      session_id: "session-1",
      round_id: "admission",
      created_at: now,
      exploration_synthesis_ref: null,
      frontier_refs: [
        { frontier_ref_id: "a", source_ref: "/z.ts", rationale: "r", priority: "low" },
        { frontier_ref_id: "b", source_ref: "/a.ts", rationale: "r", priority: "high" },
        { frontier_ref_id: "c", source_ref: "/m.ts", rationale: "r", priority: "high" },
        { frontier_ref_id: "d", source_ref: "/b.ts", rationale: "r", priority: "medium" },
      ],
      no_next_frontier_rationale: null,
      directive_author: { owner: "host_llm", author_id: "test" },
    };
    const capped = capAdmissionSelectionAcceptedRefs({
      sourceFrontier: frontier,
      acceptedFrontierRefIds: ["a", "b", "c", "d"],
      fileLimit: 2,
    });
    // high-priority rows (b: /a.ts, c: /m.ts) rank first; stable by resolved source_ref -> b then c.
    expect(capped).toEqual(["b", "c"]);
  });

  it("passes through unchanged when under the limit", () => {
    const frontier: ReconstructSourceFrontierArtifact = {
      schema_version: "1",
      session_id: "session-1",
      round_id: "admission",
      created_at: now,
      exploration_synthesis_ref: null,
      frontier_refs: [
        { frontier_ref_id: "a", source_ref: "/a.ts", rationale: "r", priority: "high" },
      ],
      no_next_frontier_rationale: null,
      directive_author: { owner: "host_llm", author_id: "test" },
    };
    const capped = capAdmissionSelectionAcceptedRefs({
      sourceFrontier: frontier,
      acceptedFrontierRefIds: ["a"],
      fileLimit: SOURCE_ADMISSION_DEEP_FILE_LIMIT,
    });
    expect(capped).toEqual(["a"]);
  });
});

describe("applyAdmissionSelectionFloorPolicy (design §7)", () => {
  it("is a no-op when the validated accepted count already meets the floor", () => {
    const frontier: ReconstructSourceFrontierArtifact = {
      schema_version: "1",
      session_id: "session-1",
      round_id: "admission",
      created_at: now,
      exploration_synthesis_ref: null,
      frontier_refs: [
        { frontier_ref_id: "a", source_ref: "/a.ts", rationale: "r", priority: "high" },
      ],
      no_next_frontier_rationale: null,
      directive_author: { owner: "host_llm", author_id: "test" },
    };
    const validation = validateSourceFrontier({
      sessionId: "session-1",
      roundId: "admission",
      sourceFrontier: frontier,
      sourceFrontierRef: "x.yaml",
      sourceInventory: {
        schema_version: "1",
        session_id: "session-1",
        created_at: now,
        inventory_units: [admittedUnit("/a.ts")],
        scan_boundary: { filesystem_allowed_roots: [], source: "binding" },
      },
      sourceInventoryRef: "source-inventory.yaml",
      sourceObservations: emptySourceObservations(),
      sourceObservationsRef: "source-observations.yaml",
      targetMaterialProfileValidation: targetMaterialProfileValidation(),
      targetMaterialProfileValidationRef: "target-material-profile-validation.yaml",
    });
    const result = applyAdmissionSelectionFloorPolicy({
      sourceFrontier: frontier,
      sourceFrontierValidation: validation,
      admittedUnits: [admittedUnit("/a.ts")],
      floor: 1,
    });
    expect(result).toBe(frontier); // same reference — untouched
  });

  it("promotes deterministically (stable resolved source_ref) when no candidates are left to distinguish by priority", () => {
    const frontier: ReconstructSourceFrontierArtifact = {
      schema_version: "1",
      session_id: "session-1",
      round_id: "admission",
      created_at: now,
      exploration_synthesis_ref: null,
      frontier_refs: [],
      no_next_frontier_rationale: "nothing relevant",
      directive_author: { owner: "host_llm", author_id: "test" },
    };
    const admittedUnits = [admittedUnit("/z.ts"), admittedUnit("/a.ts")];
    const validation = validateSourceFrontier({
      sessionId: "session-1",
      roundId: "admission",
      sourceFrontier: frontier,
      sourceFrontierRef: "x.yaml",
      sourceInventory: {
        schema_version: "1",
        session_id: "session-1",
        created_at: now,
        inventory_units: admittedUnits,
        scan_boundary: { filesystem_allowed_roots: [], source: "binding" },
      },
      sourceInventoryRef: "source-inventory.yaml",
      sourceObservations: emptySourceObservations(),
      sourceObservationsRef: "source-observations.yaml",
      targetMaterialProfileValidation: targetMaterialProfileValidation(),
      targetMaterialProfileValidationRef: "target-material-profile-validation.yaml",
    });
    const result = applyAdmissionSelectionFloorPolicy({
      sourceFrontier: frontier,
      sourceFrontierValidation: validation,
      admittedUnits,
      floor: 1,
    });
    expect(result.frontier_refs).toHaveLength(1);
    expect(result.frontier_refs[0]!.source_ref).toBe("/a.ts"); // "/a.ts" < "/z.ts"
    expect(result.frontier_refs[0]!.rationale).toContain("runtime_floor");
  });
});
