/**
 * The maturation value-read stage — clearing "I only inspected structure" limitations by actually
 * reading authorized cell values (design §13, §16).
 *
 * A maturation limitation is value-readable when reading real values could settle it
 * (`isValueReadableLimitation`); this stage enumerates the cell windows the source-safety ledger
 * authorizes (`enumerateAllowedValueReadLocations`), has the directive author judge each, and
 * writes the outcome as a value-discharge artifact. Two honesty constraints are load-bearing and
 * documented at their declarations: the read is a BOUNDED head-of-column sample
 * (`VALUE_READ_SAMPLE_ROWS`), so a discharge asserts value CHARACTER and never completeness; and
 * the authorized location set is derived from the ledger, never widened here.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { atomicWriteYamlDocument as writeYamlDocument } from "../artifact-io.js";
import type {
  ReconstructActionabilityMatrixArtifact,
  ReconstructMaturationBaselineArtifact,
  ReconstructMaturationBaselineValidationArtifact,
  ReconstructMaturationValueDischargeArtifact,
  ReconstructMaturationValueDischargeCensus,
  ReconstructMaturationValueDischargeEntry,
  ReconstructSourceObservationsArtifact,
  ReconstructSourceSafetyLedgerArtifact,
  ReconstructSourceSafetyLedgerValidationArtifact,
  ReconstructValueReadScope,
} from "./artifact-types.js";
import type {
  ReconstructDirectiveAuthor,
  ReconstructValueReadCandidate,
} from "./directive-author-contract.js";
import { isGracefulTerminalSignal } from "./graceful-terminal.js";
import { readReconstructLlmDispatchFailureError } from "./llm-dispatch-failure.js";
import { validateMaturationValueDischarge } from "./maturation-validation.js";
import { isoNow } from "./run-primitives.js";
import { sourceSafetyRowIdForObservation } from "./source-safety-validation.js";

// Maturation value-read cut (design §13). System (not domain) limitation kinds a value-read can
// clear by reading authorized cell values. Internal vocabulary — these are deterministic system
// identities, not domain naming (semantic naming stays with the runtime LLM).
const VALUE_READABLE_LIMITATION_REFS: ReadonlySet<string> = new Set([
  "structure_inspected_only",
]);

function isValueReadableLimitation(ref: string): boolean {
  return VALUE_READABLE_LIMITATION_REFS.has(ref) ||
    ref.startsWith("coverage.semantic_leaf_read_gap") ||
    ref.startsWith("purpose_handoff_limitation");
}

// Maturation value-read cut (design §16.4, strategy A — bounded representative sample). The number of
// leading grid rows a value-read samples per column. A column on the real target can be thousands–tens
// of thousands of rows; a whole-column read would blow the per-region cell cap → truncated → a satisfied
// discharge force-downgraded to inconclusive (the §16.1 DC-2 silent no-op). So enumeration emits a
// BOUNDED head-of-column window (header + first N rows) that fits inside the read cap, and value-read
// judges the column's VALUE CHARACTER from that sample — NOT a whole-column completeness check.
// ★ LIMITATION (owner-mandated honesty, §16.5): the head sample is unrepresentative when a column's
// character changes below row N (sorted/grouped data, subtotal/footer rows, late regime shifts) — those
// are missed; and a sample can never back a completeness/accuracy claim (an audit-grade assertion). The
// discharge's satisfied means "value character confirmed from a bounded head sample", recorded honestly;
// whether that sample suffices is the semantic-quality question the paid live A/B measures.
const VALUE_READ_SAMPLE_ROWS = 200;

// Allowed-location enumeration from a spreadsheet observation's inventory (design §15.4 / §16.4). Emits
// one GRID-frame bounded-sample scope per profiled column: {sheet, grid_column_index, grid_row_start:1,
// grid_row_end:VALUE_READ_SAMPLE_ROWS}. Columns live under `per_sheet_data[]` (NOT `InventorySheet`,
// which has none — SR-1), and their `index` is already origin-normalized — the SAME frame
// `readTargetedCellValues` slices `parsed.rows` with. No A1/R1C1 string is emitted (SR-2/SR-3): the
// reader never re-parses notation. The LLM picks within this set (may narrow the row range further); the
// runtime read is bounded to it and the reader clamps the row bounds to the materialized grid.
function enumerateAllowedValueReadLocations(
  observation: ReconstructSourceObservationsArtifact["observations"][number],
): ReconstructValueReadScope[] {
  const inventory = (observation.structural_data as Record<string, unknown> | undefined)
    ?.workbook_inventory as Record<string, unknown> | undefined;
  if (!inventory) return [];
  const locations: ReconstructValueReadScope[] = [];
  const perSheet = Array.isArray(inventory.per_sheet_data) ? inventory.per_sheet_data : [];
  for (const sheetRaw of perSheet) {
    const sheet = sheetRaw as Record<string, unknown>;
    const sheetName = typeof sheet.sheet === "string" ? sheet.sheet : null;
    if (!sheetName) continue;
    const columns = Array.isArray(sheet.columns) ? sheet.columns : [];
    for (const columnRaw of columns) {
      const column = columnRaw as Record<string, unknown>;
      if (typeof column.index === "number") {
        locations.push({
          sheet: sheetName,
          grid_column_index: column.index,
          grid_row_start: 1,
          grid_row_end: VALUE_READ_SAMPLE_ROWS,
          // Selection hints (design §17.3): the deterministic header label + inferred type let the LLM
          // pick the column whose VALUES ground the limitation instead of blind-picking column 0.
          column_label: typeof column.name === "string" ? column.name : null,
          column_inferred_type: typeof column.inferred_type === "string"
            ? column.inferred_type
            : null,
        });
      }
    }
  }
  return locations;
}

/**
 * Maturation value-read stage (design §13). Default-off: with no author capability OR no candidate
 * (no limitation-backed material row carrying a value-readable limitation backed by an authorized
 * runtime-target spreadsheet source), it no-ops and returns null paths → the manifest step is
 * `skipped` and the current-matrix recompute sees no discharge (byte-parity X2). Recompute-every-run
 * (design §13.7): the discharge artifact is plain-written each run with no reuse provenance — like
 * final_output, so no llm_touch_fingerprint is needed (stale reuse is impossible).
 *
 * F4 read-set gate: eligible observations must have PROVEN runtime-target provenance AND a
 * consumption_allowed material_claim safety row. Provenance has two admissible proofs, mirroring
 * source-safety-validation.ts basis A (Stage 2 parity, design 20260723 §9): (1) the observation's
 * own `is_runtime_target_source` flag, or (2) its material_claim row's `authorization_scope_ref` is
 * `"runtime_target_ref_read_scope"` — covering a source that admission DEFERRED and a later
 * frontier round RECOVERED, which is forced to keep the flag false. A non-target source's values
 * never reach the value-read prompt. The discharge governance validator re-enforces this
 * independently. Known residual: a source that is BOTH admitted-proof AND explicitly-authorized
 * records the explicit-authorization scope instead (source-safety-validation.ts's ternary prefers
 * it), so proof (2) misses it there too — no worse than before this fix, since the flag alone never
 * picked that case up either.
 */
export async function runMaturationValueReadStage(args: {
  sessionId: string;
  baselineMatrix: ReconstructActionabilityMatrixArtifact;
  maturationBaseline: ReconstructMaturationBaselineArtifact;
  maturationBaselineValidation: ReconstructMaturationBaselineValidationArtifact;
  maturationBaselineValidationRef: string;
  sourceObservations: ReconstructSourceObservationsArtifact;
  sourceObservationsRef: string;
  sourceSafetyLedger: ReconstructSourceSafetyLedgerArtifact | null;
  sourceSafetyLedgerRef: string | null;
  sourceSafetyLedgerValidation: ReconstructSourceSafetyLedgerValidationArtifact | null;
  sourceSafetyLedgerValidationRef: string | null;
  directiveAuthor: ReconstructDirectiveAuthor;
  sessionRoot: string;
}): Promise<{
  dischargePath: string | null;
  dischargeValidationPath: string | null;
  censusPath: string | null;
}> {
  const noOp = {
    dischargePath: null,
    dischargeValidationPath: null,
    censusPath: null,
  };
  const readValueDischarge = args.directiveAuthor.readValueDischarge?.bind(
    args.directiveAuthor,
  );
  if (!readValueDischarge) return noOp;
  const safetyRowsById = new Map(
    (args.sourceSafetyLedger?.safety_rows ?? []).map((r) => [r.safety_row_id, r]),
  );
  const eligibleObservations = args.sourceObservations.observations.filter(
    (observation) => {
      const inventory = (observation.structural_data as Record<string, unknown> | undefined)
        ?.workbook_inventory;
      if (!inventory) return false; // value-read targets spreadsheet sources
      const materialClaimRowId = sourceSafetyRowIdForObservation(
        observation,
        "material_claim",
      );
      const materialClaimRow = safetyRowsById.get(materialClaimRowId);
      const runtimeTargetProven = observation.is_runtime_target_source === true ||
        materialClaimRow?.authorization_scope_ref === "runtime_target_ref_read_scope";
      if (!runtimeTargetProven) return false;
      return Boolean(
        materialClaimRow &&
          materialClaimRow.proof_sufficiency_state === "sufficient_for_claim" &&
          materialClaimRow.visibility_tier === "consumption_allowed",
      );
    },
  );
  const candidates: ReconstructValueReadCandidate[] = [];
  for (const matrixRow of args.baselineMatrix.rows) {
    if (matrixRow.member_readiness !== "limitation_backed") continue;
    if (matrixRow.materiality !== "blocker" && matrixRow.materiality !== "high") {
      continue;
    }
    const valueReadableLimitations = matrixRow.limitation_refs.filter(
      isValueReadableLimitation,
    );
    if (valueReadableLimitations.length === 0) continue;
    for (const observation of eligibleObservations) {
      candidates.push({
        baseline_row_id: matrixRow.baseline_row_refs[0] ?? matrixRow.matrix_row_id,
        matrix_row_id: matrixRow.matrix_row_id,
        limitation_refs: valueReadableLimitations,
        observation_id: observation.observation_id,
        value_evidence_authorization_ref:
          `${observation.observation_id}:material_claim`,
        allowed_locations: enumerateAllowedValueReadLocations(observation),
      });
    }
  }
  if (candidates.length === 0) return noOp;
  // Runtime-only resolver (design §15.4): observation_id → resolved ABSOLUTE source path. The author
  // reads cells through the runtime keyed by observation_id; this never reaches an LLM prompt (F4/F5).
  const sourceRefByObservationId: Record<string, string> = {};
  for (const observation of eligibleObservations) {
    sourceRefByObservationId[observation.observation_id] = path.resolve(observation.source_ref);
  }
  const targetedLimitations = new Set(
    candidates.flatMap((c) =>
      c.limitation_refs.map((limitation) => `${c.baseline_row_id}:${limitation}`)
    ),
  );
  // Containment (design §15.4, A2): the author's read/judgment can throw (LLM error, parser failure).
  // A throw degrades to a blocked-preserving zero-discharge with an honest `failed` census — never
  // aborts the run. A graceful author reports per-candidate failures via output.failed_count instead.
  let discharges: ReconstructMaturationValueDischargeEntry[] = [];
  let failedCount = 0;
  try {
    const output = await readValueDischarge({ candidates, sourceRefByObservationId });
    discharges = output.discharges;
    failedCount = output.failed_count ?? 0;
  } catch (error) {
    if (isGracefulTerminalSignal(error)) throw error;
    if (readReconstructLlmDispatchFailureError(error)) throw error;
    // Total failure: treat every targeted limitation as a failed read/judgment.
    failedCount = targetedLimitations.size;
  }
  const satisfied = discharges.filter((d) => d.satisfaction_status === "satisfied");
  const census: ReconstructMaturationValueDischargeCensus = {
    limitations_targeted: targetedLimitations.size,
    limitations_discharged: satisfied.length,
    discharge_inconclusive: discharges.filter((d) =>
      d.satisfaction_status === "inconclusive"
    ).length,
    discharge_refuted: discharges.filter((d) => d.satisfaction_status === "refuted")
      .length,
    failed: failedCount,
    ran_but_discharged_zero: satisfied.length === 0,
  };
  const discharge: ReconstructMaturationValueDischargeArtifact = {
    schema_version: "1",
    session_id: args.sessionId,
    created_at: isoNow(),
    round_id: "maturation-value-read",
    discharges,
    census,
    directive_author: { owner: "host_llm", author_id: args.directiveAuthor.authorId },
  };
  const dischargePath = path.join(args.sessionRoot, "maturation-value-discharge.yaml");
  await writeYamlDocument(dischargePath, discharge);
  const dischargeValidation = validateMaturationValueDischarge({
    maturationValueDischarge: discharge,
    maturationValueDischargeRef: dischargePath,
    maturationBaseline: args.maturationBaseline,
    maturationBaselineValidation: args.maturationBaselineValidation,
    maturationBaselineValidationRef: args.maturationBaselineValidationRef,
    sourceObservations: args.sourceObservations,
    sourceObservationsRef: args.sourceObservationsRef,
    sourceSafetyLedger: args.sourceSafetyLedger,
    sourceSafetyLedgerRef: args.sourceSafetyLedgerRef,
    sourceSafetyLedgerValidation: args.sourceSafetyLedgerValidation,
    sourceSafetyLedgerValidationRef: args.sourceSafetyLedgerValidationRef,
  });
  const dischargeValidationPath = path.join(
    args.sessionRoot,
    "maturation-value-discharge-validation.yaml",
  );
  await writeYamlDocument(dischargeValidationPath, dischargeValidation);
  // Always-written discharge census (leaf_read precedent): distinguishes "never ran" from "ran
  // but discharged zero". Doubles as the maturation_value_read manifest step's artifact ref.
  const comprehensionDir = path.join(args.sessionRoot, "comprehension");
  await fs.mkdir(comprehensionDir, { recursive: true });
  const censusPath = path.join(
    comprehensionDir,
    "maturation-value-discharge-census.yaml",
  );
  await writeYamlDocument(censusPath, census);
  return { dischargePath, dischargeValidationPath, censusPath };
}
