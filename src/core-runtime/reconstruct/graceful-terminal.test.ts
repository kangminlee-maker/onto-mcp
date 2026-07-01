// Graceful-terminal (Slice 3) machinery — narrow unit tests.
//
// S2 covers the two pure judges the rest of the slice is built on, each with a falsifiable
// negative control (the design's N-elig / invariant contrasts):
//   1. isZeroObservationGracefulTerminalEligible — eligible ONLY when zero observations AND every
//      planned runtime-target unit was skipped; a lone still-"planned" unit must stay ineligible
//      (so a supported-but-empty target keeps crashing, N-elig).
//   2. reconstructTerminalStatus — the single terminal-status projection (record_stage, or the
//      graceful terminal_disposition when set).
//   3. assertReconstructTerminalDispositionCoherent — the record invariant: a graceful disposition
//      can never pair with record_stage "completed".
import { describe, expect, it } from "vitest";
import type {
  ReconstructRecordArtifact,
  ReconstructRecordStage,
  ReconstructSourceInventoryUnit,
} from "./artifact-types.js";
import { isZeroObservationGracefulTerminalEligible } from "./run.js";
import {
  assertReconstructTerminalDispositionCoherent,
  reconstructTerminalStatus,
} from "./record.js";

function unit(scanStatus: "planned" | "skipped"): ReconstructSourceInventoryUnit {
  return {
    ref: `/tmp/target.${scanStatus}`,
    exists: true,
    target_material_kind: "spreadsheet_workbook",
    inventory_unit: `unit:${scanStatus}`,
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
