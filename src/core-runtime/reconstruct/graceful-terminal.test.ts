// Graceful-terminal (Slice 3) machinery — narrow unit tests.
//
// S2 covers the two pure judges the rest of the slice is built on, each with a falsifiable
// negative control (the design's N-elig / invariant contrasts):
//   1. isZeroObservationGracefulTerminalEligible — eligible ONLY when zero observations AND no unit
//      the run intended to observe is left unresolved; a lone still-"planned" unit must stay
//      ineligible (so a supported-but-empty target keeps crashing, N-elig). Under admission
//      selection "intended" narrows to the attempted set, with its own N-elig controls plus an
//      OFF-parity control proving the widening is unreachable without an attempted set.
//   2. reconstructTerminalStatus — the single terminal-status projection (record_stage, or the
//      graceful terminal_disposition when set).
//   3. assertReconstructTerminalDispositionCoherent — the record invariant: a graceful disposition
//      can never pair with record_stage "completed".
import path from "node:path";
import { describe, expect, it } from "vitest";
import type {
  ReconstructRecordArtifact,
  ReconstructRecordStage,
  ReconstructSourceInventoryUnit,
} from "./artifact-types.js";
import {
  isZeroObservationGracefulTerminalEligible,
  SEED_READINESS_TERMINAL_ROUTE,
} from "./run.js";
import {
  assertReconstructTerminalDispositionCoherent,
  reconstructTerminalStatus,
} from "./record.js";
import { assertSeedAuthoringReadinessAllowsSeed } from "./seed-authoring-readiness-validation.js";
import type { ReconstructSeedAuthoringReadinessArtifact } from "./artifact-types.js";

function unit(
  scanStatus: "planned" | "skipped" | "admitted",
  id: string = scanStatus,
): ReconstructSourceInventoryUnit {
  return {
    ref: `/tmp/target.${id}`,
    exists: true,
    target_material_kind: "spreadsheet_workbook",
    inventory_unit: `unit:${id}`,
    profile_ref: null,
    scan_status: scanStatus,
    skip_reason: scanStatus === "skipped" ? "spreadsheet extraction unsupported: xls" : null,
  };
}

function record(
  fields: Partial<Pick<ReconstructRecordArtifact, "record_stage" | "terminal_disposition">>,
): Pick<ReconstructRecordArtifact, "record_stage" | "terminal_disposition"> {
  return {
    record_stage: fields.record_stage ?? "incomplete",
    terminal_disposition: fields.terminal_disposition,
  };
}

describe("isZeroObservationGracefulTerminalEligible", () => {
  it("is eligible when zero observations and every planned unit was skipped", () => {
    expect(
      isZeroObservationGracefulTerminalEligible({
        sourceObservations: { observations: [] },
        sourceInventory: { inventory_units: [unit("skipped"), unit("skipped")] },
      }),
    ).toBe(true);
  });

  it("N-elig control: a lone still-planned unit keeps it ineligible (must crash)", () => {
    // Only the scan_status of ONE unit differs from the eligible case above — the falsifiable pivot.
    expect(
      isZeroObservationGracefulTerminalEligible({
        sourceObservations: { observations: [] },
        sourceInventory: { inventory_units: [unit("skipped"), unit("planned")] },
      }),
    ).toBe(false);
  });

  it("is ineligible when any observation was made", () => {
    expect(
      isZeroObservationGracefulTerminalEligible({
        // Only the observation count differs from the eligible case — content is irrelevant here.
        sourceObservations: { observations: [{} as never] },
        sourceInventory: { inventory_units: [unit("skipped")] },
      }),
    ).toBe(false);
  });

  it("is ineligible with an empty inventory (no skipped target to be blocked on)", () => {
    expect(
      isZeroObservationGracefulTerminalEligible({
        sourceObservations: { observations: [] },
        sourceInventory: { inventory_units: [] },
      }),
    ).toBe(false);
  });

  // source_admission_selection: promotion never rewrites scan_status, so units the stage chose NOT
  // to deep-observe stay `admitted`. Only the attempted set (accepted ∩ file-limit cap) counts as
  // "planned"; the rest were deferred by design, with their outlines retained.
  const attempted = new Set([path.resolve("/tmp/target.attempted")]);

  it("admission: every attempted ref vanished while deferred units remain is graceful", () => {
    expect(
      isZeroObservationGracefulTerminalEligible({
        sourceObservations: { observations: [] },
        // The attempted unit was demoted to `skipped` by observeInventoryUnitDeep (vanished
        // mid-run); the other two were never attempted.
        sourceInventory: {
          inventory_units: [
            unit("skipped", "attempted"),
            unit("admitted", "deferred-a"),
            unit("admitted", "deferred-b"),
          ],
        },
        attemptedSourceRefs: attempted,
      }),
    ).toBe(true);
  });

  it("OFF parity control: the same inventory without an attempted set stays ineligible", () => {
    // Only the presence of attemptedSourceRefs differs from the case above — proves the widening is
    // reachable exclusively through admission selection, so non-admission runs keep the old rule.
    expect(
      isZeroObservationGracefulTerminalEligible({
        sourceObservations: { observations: [] },
        sourceInventory: {
          inventory_units: [
            unit("skipped", "attempted"),
            unit("admitted", "deferred-a"),
            unit("admitted", "deferred-b"),
          ],
        },
      }),
    ).toBe(false);
  });

  it("admission N-elig control: an attempted unit that was never resolved must crash", () => {
    // Producer desync — the stage tried this ref but it neither yielded an observation nor got
    // demoted to `skipped`. Only its scan_status differs from the graceful case.
    expect(
      isZeroObservationGracefulTerminalEligible({
        sourceObservations: { observations: [] },
        sourceInventory: {
          inventory_units: [unit("admitted", "attempted"), unit("admitted", "deferred-a")],
        },
        attemptedSourceRefs: attempted,
      }),
    ).toBe(false);
  });

  it("admission N-elig control: a stray planned unit still crashes", () => {
    expect(
      isZeroObservationGracefulTerminalEligible({
        sourceObservations: { observations: [] },
        sourceInventory: {
          inventory_units: [
            unit("skipped", "attempted"),
            unit("admitted", "deferred-a"),
            unit("planned"),
          ],
        },
        attemptedSourceRefs: attempted,
      }),
    ).toBe(false);
  });
});

describe("reconstructTerminalStatus", () => {
  it("projects the raw record_stage when no graceful terminal", () => {
    expect(reconstructTerminalStatus(record({ record_stage: "completed" }))).toBe("completed");
    expect(reconstructTerminalStatus(record({ record_stage: "incomplete" }))).toBe("incomplete");
  });

  it("projects the graceful terminal_disposition when set", () => {
    expect(
      reconstructTerminalStatus(record({ record_stage: "incomplete", terminal_disposition: "blocked" })),
    ).toBe("blocked");
    expect(
      reconstructTerminalStatus(record({ record_stage: "incomplete", terminal_disposition: "limited" })),
    ).toBe("limited");
  });

  it("fail-closed masking guard: a record written BEFORE the validation gate (no terminal_disposition) projects as non-terminal, not a clean blocked terminal", () => {
    // assembleGracefulTerminal writes the record before the fail-closed manifest validation ONLY so
    // the manifest's record_assembly ref exists; it must NOT stamp terminal_disposition there. If the
    // gate then rejects, this persisted record must read as in-progress (record_stage) — otherwise a
    // crashed run would be re-read via getRunStatus as a clean "blocked" terminal, masking the crash.
    const preGate = record({ record_stage: "incomplete" });
    expect(preGate.terminal_disposition).toBeUndefined();
    expect(reconstructTerminalStatus(preGate)).toBe("incomplete");
    expect(["blocked", "limited"]).not.toContain(reconstructTerminalStatus(preGate));
  });
});

describe("assertReconstructTerminalDispositionCoherent", () => {
  it("accepts a graceful disposition on a non-completed stage", () => {
    expect(() =>
      assertReconstructTerminalDispositionCoherent("incomplete", "blocked"),
    ).not.toThrow();
  });

  it("accepts a completed record with no disposition (byte-parity path)", () => {
    expect(() =>
      assertReconstructTerminalDispositionCoherent("completed", undefined),
    ).not.toThrow();
  });

  it("rejects a graceful disposition paired with record_stage 'completed'", () => {
    // Negative control: the only field flipped vs. the accepted case is record_stage.
    for (const disposition of ["blocked", "limited"] as const) {
      expect(() =>
        assertReconstructTerminalDispositionCoherent(
          "completed" as ReconstructRecordStage,
          disposition,
        ),
      ).toThrow(/cannot pair with record_stage="completed"/);
    }
  });
});

// Site 6 routing (sites356 design §4.2 / T6-u): the exhaustive route splits the six VALID
// readiness classifications into allows_seed (2), graceful_blocked (frontier_required only), and
// crash_bug_class (3 — reachable only through corruption/builder bugs, masking-lens HIGH). The
// crash classes must keep failing loud through the retained assert (fall-through control).
describe("SEED_READINESS_TERMINAL_ROUTE (site 6)", () => {
  it("routes exactly frontier_required to graceful_blocked, keeps bug classes crashing", () => {
    expect(SEED_READINESS_TERMINAL_ROUTE).toEqual({
      seed_ready: "allows_seed",
      limited_seed_possible: "allows_seed",
      frontier_required: "graceful_blocked",
      purpose_confirmation_required: "crash_bug_class",
      blocked_no_authority: "crash_bug_class",
      blocked_validation_gap: "crash_bug_class",
    });
  });

  it("crash_bug_class classifications still fail loud through the retained assert", () => {
    const readiness = (
      classification: keyof typeof SEED_READINESS_TERMINAL_ROUTE,
    ): ReconstructSeedAuthoringReadinessArtifact =>
      ({
        readiness_classification: classification,
        missing_requirement_categories: [],
      }) as unknown as ReconstructSeedAuthoringReadinessArtifact;
    const validation = { validation_status: "valid" } as Parameters<
      typeof assertSeedAuthoringReadinessAllowsSeed
    >[0]["validation"];
    for (
      const [classification, route] of Object.entries(SEED_READINESS_TERMINAL_ROUTE)
    ) {
      if (route !== "crash_bug_class") continue;
      expect(() =>
        assertSeedAuthoringReadinessAllowsSeed({
          readiness: readiness(
            classification as keyof typeof SEED_READINESS_TERMINAL_ROUTE,
          ),
          validation,
        })
      ).toThrow(/does not allow ontology-seed authoring/);
    }
  });

  it("invalid readiness validation crashes regardless of classification (T6-b unit form)", () => {
    expect(() =>
      assertSeedAuthoringReadinessAllowsSeed({
        readiness: {
          readiness_classification: "seed_ready",
          missing_requirement_categories: [],
        } as unknown as ReconstructSeedAuthoringReadinessArtifact,
        validation: { validation_status: "invalid" } as Parameters<
          typeof assertSeedAuthoringReadinessAllowsSeed
        >[0]["validation"],
      })
    ).toThrow(/readiness validation is invalid/);
  });
});
