import { describe, expect, it, afterAll } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { zipSync, strToU8 } from "fflate";
import { createDirectCallReconstructDirectiveAuthor } from "./run.js";
import type { ReconstructDirectiveAuthor } from "./directive-author-contract.js";
import { runMaturationValueReadStage } from "./value-read-stage.js";
import {
  buildActionabilityMatrixArtifact,
  buildMaturationContinuationDecisionArtifact,
  validateMaturationValueDischarge,
} from "./maturation-validation.js";
import {
  buildSourceSafetyLedgerFromSourceObservations,
  validateSourceSafetyLedger,
} from "./source-safety-validation.js";
import { observeSpreadsheetSource } from "../spreadsheet-structure-observer.js";
import type {
  ReconstructMaturationBaselineArtifact,
  ReconstructMaturationBaselineValidationArtifact,
  ReconstructMaturationValueDischargeArtifact,
  ReconstructMaturationValueDischargeValidationArtifact,
  ReconstructSourceObservationsArtifact,
  ReconstructMaturationClosureFrontierArtifact,
  ReconstructMaturationClosureFrontierValidationArtifact,
  ReconstructMaturationAuthorityResponseArtifact,
  ReconstructMaturationConvergenceLedgerValidationArtifact,
  ReconstructMaturationQuestionFrontierArtifact,
  ReconstructOntologyExpansionValidationArtifact,
  ReconstructRevisionProposalArtifact,
  ReconstructRevisionProposalValidationArtifact,
} from "./artifact-types.js";

// Maturation value-read cut — Stage 2 (design §15.4/§15.6). The non-negotiable gate: a REAL raw-cell
// read drives the discharge. The fixture inventory is built by the REAL observer over a REAL file
// (never hand-fabricated — SR-6), the direct-call author runs its actual readValueDischarge via a stub
// llmCall (NOT the mock dispatcher — the cell-read is exercised on the real path), and the discharge's
// cells_read is the EXACT count the real read produced. A 0-cell / truncated / content-skewed read can
// never reach value_resolved (FRP-1 / issue-008 / GL-1 — the provenance floor).

const SESSION = "session-value-read";

// A maturation baseline with ONE limitation-backed material row whose value-dependent limitation
// (structure_inspected_only) a value-read could clear.
function baselineWithLimitedRow(): ReconstructMaturationBaselineArtifact {
  return {
    schema_version: "1",
    session_id: SESSION,
    created_at: "2026-06-30T00:00:00.000Z",
    source_seed_validation_ref: "ontology-seed-validation.yaml",
    source_reconstruct_record_ref: "reconstruct-record.yaml",
    source_reconstruct_record_sha256: "sha256-record",
    source_purpose_candidates_validation_ref: "source-purpose-candidates-validation.yaml",
    purpose_confirmation_validation_ref: "purpose-confirmation-validation.yaml",
    candidate_limitation_refs: [],
    baseline_rows: [{
      baseline_row_id: "row-1",
      purpose_element_ref: "element-1",
      actionability_surface_ref: "surface-1",
      maturity_dimension_ref: "dimension-1",
      materiality: "high",
      materiality_ref: "materiality-1",
      member_scope_refs: [],
      member_target_material_kind: "spreadsheet",
      member_source_refs: ["ledger.csv"],
      cross_material_ref_refs: [],
      competency_question_refs: [],
      competency_assessment_refs: [],
      domain_competency_trace_refs: [],
      maturity_level: "L2_modeled",
      supporting_seed_refs: [],
      supporting_evidence_refs: [],
      supporting_validation_refs: [],
      limitation_refs: ["structure_inspected_only"],
      blocking_reason: null,
    }],
  } as unknown as ReconstructMaturationBaselineArtifact;
}

function validBaselineValidation(): ReconstructMaturationBaselineValidationArtifact {
  return { validation_status: "valid" } as ReconstructMaturationBaselineValidationArtifact;
}

const tmpRoots: string[] = [];
afterAll(async () => {
  for (const root of tmpRoots) await rm(root, { recursive: true, force: true });
});

// A REAL runtime-target spreadsheet observation, built by the REAL observer over a REAL csv file
// (SR-6: never a hand-fabricated inventory shape). Returns the observations artifact + the file path +
// the observed content hash so tests can assert content binding and read the same file back.
async function realRuntimeTargetSpreadsheet(
  csv = "account,amount\nrevenue,1000\ncogs,400\n",
): Promise<{
  observations: ReconstructSourceObservationsArtifact;
  sourceRef: string;
  contentSha256: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "value-read-stage-"));
  tmpRoots.push(root);
  const sourceRef = path.join(root, "ledger.csv");
  await writeFile(sourceRef, csv);
  const inventory = await observeSpreadsheetSource(sourceRef);
  const observations = {
    schema_version: "1",
    session_id: SESSION,
    created_at: "2026-06-30T00:00:00.000Z",
    observations: [{
      observation_id: "obs-sheet",
      target_material_kind: "spreadsheet",
      adapter_id: "spreadsheet-structure-observer",
      source_ref: sourceRef,
      location: sourceRef,
      summary: "Runtime-target spreadsheet observation.",
      round_id: "initial_source_frontier",
      observation_batch_id: "source-observation-batch:initial",
      triggering_frontier_validation_ref: null,
      is_runtime_target_source: true,
      structural_data: { workbook_inventory: inventory },
    }],
    skipped_refs: [],
    validation_results: ["valid"],
  } as unknown as ReconstructSourceObservationsArtifact;
  return { observations, sourceRef, contentSha256: inventory.content_sha256 };
}

// A REAL runtime-target XLSX observation (§15.6 / issue-009/014: the production target is xlsx, so the
// full-stage gate must traverse a real-observer xlsx fixture, not only CSV). One sheet "Ledger", A1:B3.
const WB_R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const RELS_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const SML_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const wsRelType = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet";
const sstRelType = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings";

async function realRuntimeTargetXlsx(): Promise<{
  observations: ReconstructSourceObservationsArtifact;
  sourceRef: string;
  contentSha256: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "value-read-xlsx-"));
  tmpRoots.push(root);
  const sourceRef = path.join(root, "ledger.xlsx");
  const bytes = zipSync({
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0"?><workbook ${WB_R}><sheets>` +
        `<sheet name="Ledger" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0"?><Relationships xmlns="${RELS_NS}">` +
        `<Relationship Id="rId1" Type="${wsRelType}" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="rId2" Type="${sstRelType}" Target="sharedStrings.xml"/></Relationships>`,
    ),
    "xl/sharedStrings.xml": strToU8(
      `<?xml version="1.0"?><sst xmlns="${SML_NS}">` +
        `<si><t>account</t></si><si><t>amount</t></si>` +
        `<si><t>revenue</t></si><si><t>cogs</t></si></sst>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(
      `<?xml version="1.0"?><worksheet ${WB_R}><dimension ref="A1:B3"/><sheetData>` +
        `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>` +
        `<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>1000</v></c></row>` +
        `<row r="3"><c r="A3" t="s"><v>3</v></c><c r="B3"><v>400</v></c></row>` +
        `</sheetData></worksheet>`,
    ),
  });
  await writeFile(sourceRef, Buffer.from(bytes));
  const inventory = await observeSpreadsheetSource(sourceRef);
  const observations = {
    schema_version: "1",
    session_id: SESSION,
    created_at: "2026-06-30T00:00:00.000Z",
    observations: [{
      observation_id: "obs-sheet",
      target_material_kind: "spreadsheet",
      adapter_id: "spreadsheet-structure-observer",
      source_ref: sourceRef,
      location: sourceRef,
      summary: "Runtime-target xlsx observation.",
      round_id: "initial_source_frontier",
      observation_batch_id: "source-observation-batch:initial",
      triggering_frontier_validation_ref: null,
      is_runtime_target_source: true,
      structural_data: { workbook_inventory: inventory },
    }],
    skipped_refs: [],
    validation_results: ["valid"],
  } as unknown as ReconstructSourceObservationsArtifact;
  return { observations, sourceRef, contentSha256: inventory.content_sha256 };
}

// A stub llmCall that drives the REAL direct-call readValueDischarge: it picks the first allowed grid
// scope (location prompt) and returns the requested judgment (judgment prompt). It does NOT read cells
// — the real readTargetedCellValues does, between the two calls. Any other prompt throws (this author
// is used only for value-read in these tests). opts.narrowRows row-narrows the first allowed pick within
// its column (to prove a narrowed pick is accepted by G2 column-containment, not dropped — §16.1 DC-1).
function stubValueReadLlmCall(
  judgment: "satisfied" | "refuted" | "inconclusive",
  opts: { narrowRows?: [number, number] } = {},
) {
  return async (systemPrompt: string, userPrompt: string) => {
    let text = "{}";
    if (systemPrompt.includes("Select spreadsheet cell locations")) {
      const payload = JSON.parse(userPrompt) as {
        allowed_locations?: Array<Record<string, unknown>>;
      };
      const allowed = payload.allowed_locations ?? [];
      const first = allowed[0];
      let pick = first;
      if (first && opts.narrowRows) {
        pick = {
          sheet: first.sheet,
          grid_column_index: first.grid_column_index,
          grid_row_start: opts.narrowRows[0],
          grid_row_end: opts.narrowRows[1],
        };
      }
      text = JSON.stringify({ picked_locations: pick ? [pick] : [] });
    } else if (systemPrompt.includes("Judge whether read spreadsheet cell values")) {
      text = JSON.stringify({ satisfaction_status: judgment, rationale: "stub judgment" });
    } else {
      throw new Error(`unexpected stub prompt: ${systemPrompt.slice(0, 40)}`);
    }
    return { text, input_tokens: 1, output_tokens: 1, model_id: "stub-value-read-model" };
  };
}

function directCallValueReadAuthor(
  judgment: "satisfied" | "refuted" | "inconclusive",
  opts: { narrowRows?: [number, number] } = {},
): ReconstructDirectiveAuthor {
  return createDirectCallReconstructDirectiveAuthor({
    llmCall: stubValueReadLlmCall(judgment, opts),
  });
}

// An author whose readValueDischarge THROWS — to prove the stage runner contains it (no run abort) and
// records a real failed census (§16.2 TQ-1, A2). Without containment this would abort the run.
function throwingValueReadAuthor(): ReconstructDirectiveAuthor {
  return {
    authorId: "throwing-value-read",
    owner: "host_llm",
    async readValueDischarge() {
      throw new Error("boom: value-read author failed");
    },
  } as unknown as ReconstructDirectiveAuthor;
}

// Author WITHOUT the capability — the stage must no-op (default-off).
function noCapabilityAuthor(): ReconstructDirectiveAuthor {
  return { authorId: "no-cap", owner: "host_llm" } as unknown as ReconstructDirectiveAuthor;
}

function safetyFor(
  observations: ReconstructSourceObservationsArtifact,
  admittedSourceRefs?: ReadonlySet<string>,
) {
  const sourceSafetyLedger = buildSourceSafetyLedgerFromSourceObservations({
    sourceObservations: observations,
    sourceObservationsRef: "source-observations.yaml",
    admittedSourceRefs,
  });
  const sourceSafetyLedgerValidation = validateSourceSafetyLedger({
    sourceSafetyLedger,
    sourceSafetyLedgerRef: "source-safety-ledger.yaml",
    sourceObservations: observations,
    sourceObservationsRef: "source-observations.yaml",
    admittedSourceRefs,
  });
  return { sourceSafetyLedger, sourceSafetyLedgerValidation };
}

async function runStage(
  author: ReconstructDirectiveAuthor,
  observations: ReconstructSourceObservationsArtifact,
  baseline: ReconstructMaturationBaselineArtifact,
  admittedSourceRefs?: ReadonlySet<string>,
) {
  const sessionRoot = await mkdtemp(path.join(tmpdir(), "value-read-stage-out-"));
  tmpRoots.push(sessionRoot);
  const baselineMatrix = buildActionabilityMatrixArtifact({
    sessionId: SESSION,
    maturationBaseline: baseline,
    maturationBaselineRef: "maturation-baseline.yaml",
    maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
  });
  const safety = safetyFor(observations, admittedSourceRefs);
  const result = await runMaturationValueReadStage({
    sessionId: SESSION,
    baselineMatrix,
    maturationBaseline: baseline,
    maturationBaselineValidation: validBaselineValidation(),
    maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
    sourceObservations: observations,
    sourceObservationsRef: "source-observations.yaml",
    sourceSafetyLedger: safety.sourceSafetyLedger,
    sourceSafetyLedgerRef: "source-safety-ledger.yaml",
    sourceSafetyLedgerValidation: safety.sourceSafetyLedgerValidation,
    sourceSafetyLedgerValidationRef: "source-safety-ledger-validation.yaml",
    directiveAuthor: author,
    sessionRoot,
  });
  return { baselineMatrix, result, baseline };
}

function continuationFor(
  matrix: ReturnType<typeof buildActionabilityMatrixArtifact>,
  baseline: ReconstructMaturationBaselineArtifact,
) {
  return buildMaturationContinuationDecisionArtifact({
    sessionId: SESSION,
    actionabilityMatrix: matrix,
    actionabilityMatrixValidationRef: "actionability-matrix-validation.yaml",
    maturationConvergenceLedgerValidation: {
      schema_version: "1",
      session_id: SESSION,
      created_at: "2026-06-30T00:00:00.000Z",
      validation_status: "valid",
      final_requestion_pass_status: "no_new_material_question",
      violations: [],
    } as unknown as ReconstructMaturationConvergenceLedgerValidationArtifact,
    maturationConvergenceLedgerValidationRef: "maturation-convergence-ledger-validation.yaml",
    maturationQuestionFrontier: { questions: [] } as unknown as ReconstructMaturationQuestionFrontierArtifact,
    maturationClosureFrontier: { authority_requests: [] } as unknown as ReconstructMaturationClosureFrontierArtifact,
    maturationClosureFrontierValidation: {} as unknown as ReconstructMaturationClosureFrontierValidationArtifact,
    maturationAuthorityResponse: { responses: [] } as unknown as ReconstructMaturationAuthorityResponseArtifact,
    ontologyExpansionValidation: { violations: [] } as unknown as ReconstructOntologyExpansionValidationArtifact,
    revisionProposal: {
      schema_version: "1",
      session_id: SESSION,
      created_at: "2026-06-30T00:00:00.000Z",
      failure_classification_ref: "failure-classification.yaml",
      proposals: [],
      directive_author: { owner: "host_llm", author_id: "mock" },
    } as unknown as ReconstructRevisionProposalArtifact,
    revisionProposalValidation: {
      schema_version: "1",
      session_id: SESSION,
      created_at: "2026-06-30T00:00:00.000Z",
      revision_proposal_ref: "revision-proposal.yaml",
      failure_classification_ref: "failure-classification.yaml",
      validation_status: "valid",
      proposal_count: 0,
      action_counts: { reuse: 0, extend: 0, rename: 0, split: 0, reject: 0, defer: 0 },
      validation_results: ["revision_proposal_valid"],
      violations: [],
    } as unknown as ReconstructRevisionProposalValidationArtifact,
  });
}

describe("runMaturationValueReadStage (value-read cut §15 — real raw-cell-read direct-call)", () => {
  it("default-off: an author without readValueDischarge no-ops (null paths → skipped step)", async () => {
    const { observations } = await realRuntimeTargetSpreadsheet();
    const { result } = await runStage(noCapabilityAuthor(), observations, baselineWithLimitedRow());
    expect(result.dischargePath).toBeNull();
    expect(result.dischargeValidationPath).toBeNull();
    expect(result.censusPath).toBeNull();
  });

  it("F4: a non-runtime-target source produces no candidate → no-op", async () => {
    const { observations } = await realRuntimeTargetSpreadsheet();
    (observations.observations[0] as unknown as Record<string, unknown>).is_runtime_target_source = false;
    const { result } = await runStage(
      directCallValueReadAuthor("satisfied"),
      observations,
      baselineWithLimitedRow(),
    );
    expect(result.dischargePath).toBeNull();
  });

  // D-B (Stage 2 parity, design 20260723 §9): a source that admission DEFERRED and a later frontier
  // round RECOVERED is forced to keep is_runtime_target_source:false, but its material_claim safety
  // row carries authorization_scope_ref:"runtime_target_ref_read_scope" (proof 2). This reproduces
  // before the fix: with only the flag checked, this admitted-proof source was wrongly no-op'd.
  it("D-B: a deferred-then-admitted source (proof 2, flag false) is still eligible for value-read", async () => {
    const { observations, sourceRef } = await realRuntimeTargetSpreadsheet();
    (observations.observations[0] as unknown as Record<string, unknown>).is_runtime_target_source = false;
    const { result } = await runStage(
      directCallValueReadAuthor("satisfied"),
      observations,
      baselineWithLimitedRow(),
      new Set([path.resolve(sourceRef)]),
    );
    expect(result.dischargePath).not.toBeNull();
  });

  // D-B negative control: an explicitly-authorized (not runtime-target-provenance) non-target source
  // must stay rejected — its authorization_scope_ref is "source_safety_explicit_consumption_authorization",
  // not "runtime_target_ref_read_scope", so proof 2 must not (and does not) match it.
  it("D-B negative control: explicit-authorization on a non-flag source stays rejected (no widening)", async () => {
    const { observations } = await realRuntimeTargetSpreadsheet();
    const obs = observations.observations[0] as unknown as Record<string, unknown>;
    obs.is_runtime_target_source = false;
    (obs.structural_data as Record<string, unknown>).source_safety_consumption_authorizations = [
      "material_claim",
    ];
    const { result } = await runStage(
      directCallValueReadAuthor("satisfied"),
      observations,
      baselineWithLimitedRow(),
    );
    expect(result.dischargePath).toBeNull();
  });

  it("H1-prod: real cell-read → satisfied discharge (real cells_read + content hash) → value_resolved → actionable_limited", async () => {
    const { observations, contentSha256 } = await realRuntimeTargetSpreadsheet();
    const { baselineMatrix, result, baseline } = await runStage(
      directCallValueReadAuthor("satisfied"),
      observations,
      baselineWithLimitedRow(),
    );
    expect(baselineMatrix.rows[0]!.member_readiness).toBe("limitation_backed");
    expect(result.dischargePath).not.toBeNull();

    const discharge = parseYaml(
      await readFile(result.dischargePath!, "utf8"),
    ) as ReconstructMaturationValueDischargeArtifact;
    const dischargeValidation = parseYaml(
      await readFile(result.dischargeValidationPath!, "utf8"),
    ) as ReconstructMaturationValueDischargeValidationArtifact;

    expect(dischargeValidation.validation_status).toBe("valid");
    expect(discharge.discharges).toHaveLength(1);
    const entry = discharge.discharges[0]!;
    expect(entry.satisfaction_status).toBe("satisfied");
    // The discharge rests on a REAL read: the first allowed column is "account" → 3 non-empty cells
    // (header + revenue + cogs). cells_read is the EXACT count the reader produced, not a constant.
    expect(entry.value_evidence_ref.cells_read).toBe(3);
    expect(entry.value_evidence_ref.read_truncated).toBe(false);
    // Content binding: the re-read file's hash equals the observed inventory's content_sha256.
    expect(entry.value_evidence_ref.read_content_sha256).toBe(contentSha256);
    expect(discharge.census.limitations_discharged).toBe(1);
    expect(discharge.census.ran_but_discharged_zero).toBe(false);
    expect(discharge.census.failed).toBe(0);

    // The CURRENT matrix recompute consumes the validated discharge → value_resolved.
    const matrix = buildActionabilityMatrixArtifact({
      sessionId: SESSION,
      maturationBaseline: baseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
      maturationValueDischarge: discharge,
      maturationValueDischargeValidation: dischargeValidation,
    });
    expect(matrix.rows[0]!.member_readiness).toBe("value_resolved");
    expect(matrix.rows[0]!.limitation_refs).toEqual([]);

    // Continuation: value_resolved anchors a bounded actionable claim (no longer blocked).
    const decision = continuationFor(matrix, baseline);
    expect(decision.decision_state).toBe("actionable_limited");
    expect(decision.claim_scope.included_row_refs).toEqual(["matrix-row-1"]);
  });

  it("H1-neg: a refuted judgment discharges nothing → row stays limitation_backed (blocked)", async () => {
    const { observations } = await realRuntimeTargetSpreadsheet();
    const { result, baseline } = await runStage(
      directCallValueReadAuthor("refuted"),
      observations,
      baselineWithLimitedRow(),
    );
    const discharge = parseYaml(
      await readFile(result.dischargePath!, "utf8"),
    ) as ReconstructMaturationValueDischargeArtifact;
    const dischargeValidation = parseYaml(
      await readFile(result.dischargeValidationPath!, "utf8"),
    ) as ReconstructMaturationValueDischargeValidationArtifact;
    expect(discharge.census.limitations_discharged).toBe(0);
    expect(discharge.census.ran_but_discharged_zero).toBe(true);
    const matrix = buildActionabilityMatrixArtifact({
      sessionId: SESSION,
      maturationBaseline: baseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
      maturationValueDischarge: discharge,
      maturationValueDischargeValidation: dischargeValidation,
    });
    expect(matrix.rows[0]!.member_readiness).toBe("limitation_backed");
  });

  it("H1-neg: an inconclusive judgment discharges nothing → row stays limitation_backed", async () => {
    const { observations } = await realRuntimeTargetSpreadsheet();
    const { result, baseline } = await runStage(
      directCallValueReadAuthor("inconclusive"),
      observations,
      baselineWithLimitedRow(),
    );
    const discharge = parseYaml(
      await readFile(result.dischargePath!, "utf8"),
    ) as ReconstructMaturationValueDischargeArtifact;
    const dischargeValidation = parseYaml(
      await readFile(result.dischargeValidationPath!, "utf8"),
    ) as ReconstructMaturationValueDischargeValidationArtifact;
    const matrix = buildActionabilityMatrixArtifact({
      sessionId: SESSION,
      maturationBaseline: baseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
      maturationValueDischarge: discharge,
      maturationValueDischargeValidation: dischargeValidation,
    });
    expect(matrix.rows[0]!.member_readiness).toBe("limitation_backed");
  });
});

// The provenance floor (design §15.4) — makes cells_read / read_truncated / read_content_sha256 REAL
// validator consumers, so a satisfied discharge backed by a dead/partial/skewed read is rejected
// (FRP-1 / issue-008 / GL-1). Without this floor a satisfied stub + dead read would drive value_resolved.
describe("validateMaturationValueDischarge — satisfied-discharge provenance floor (§15.4)", () => {
  function dischargeWith(evidence: {
    cells_read: number;
    read_truncated: boolean;
    read_content_sha256: string;
  }): ReconstructMaturationValueDischargeArtifact {
    return {
      schema_version: "1",
      session_id: SESSION,
      created_at: "2026-06-30T00:00:00.000Z",
      round_id: "maturation-value-read",
      discharges: [{
        discharge_id: "value-discharge:matrix-row-1",
        target_baseline_row_refs: ["row-1"],
        target_limitation_refs: ["structure_inspected_only"],
        value_evidence_ref: {
          observation_id: "obs-sheet",
          read_scope: { sheet: "ledger.csv", grid_column_index: 0, grid_row_start: null, grid_row_end: null },
          cells_read: evidence.cells_read,
          read_truncated: evidence.read_truncated,
          read_content_sha256: evidence.read_content_sha256,
        },
        value_evidence_authorization_ref: "obs-sheet:material_claim",
        satisfaction_status: "satisfied",
        rationale: "test",
      }],
      census: {
        limitations_targeted: 1,
        limitations_discharged: 1,
        discharge_inconclusive: 0,
        discharge_refuted: 0,
        failed: 0,
        ran_but_discharged_zero: false,
      },
      directive_author: { owner: "host_llm", author_id: "test" },
    } as unknown as ReconstructMaturationValueDischargeArtifact;
  }

  async function validate(
    discharge: ReconstructMaturationValueDischargeArtifact,
    observations: ReconstructSourceObservationsArtifact,
  ) {
    const safety = safetyFor(observations);
    return validateMaturationValueDischarge({
      maturationValueDischarge: discharge,
      maturationValueDischargeRef: "maturation-value-discharge.yaml",
      maturationBaseline: baselineWithLimitedRow(),
      maturationBaselineValidation: validBaselineValidation(),
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
      sourceObservations: observations,
      sourceObservationsRef: "source-observations.yaml",
      sourceSafetyLedger: safety.sourceSafetyLedger,
      sourceSafetyLedgerRef: "source-safety-ledger.yaml",
      sourceSafetyLedgerValidation: safety.sourceSafetyLedgerValidation,
      sourceSafetyLedgerValidationRef: "source-safety-ledger-validation.yaml",
    });
  }

  it("accepts a satisfied discharge backed by a non-empty, complete, content-matched read", async () => {
    const { observations, contentSha256 } = await realRuntimeTargetSpreadsheet();
    const v = await validate(
      dischargeWith({ cells_read: 3, read_truncated: false, read_content_sha256: contentSha256 }),
      observations,
    );
    expect(v.validation_status).toBe("valid");
  });

  it("rejects a satisfied discharge backed by a ZERO-cell read (dead read — FRP-1)", async () => {
    const { observations, contentSha256 } = await realRuntimeTargetSpreadsheet();
    const v = await validate(
      dischargeWith({ cells_read: 0, read_truncated: false, read_content_sha256: contentSha256 }),
      observations,
    );
    expect(v.validation_status).toBe("invalid");
    expect(v.violations.some((x) => x.message.includes("non-empty cell read"))).toBe(true);
  });

  it("rejects a satisfied discharge resting on a TRUNCATED read (issue-008)", async () => {
    const { observations, contentSha256 } = await realRuntimeTargetSpreadsheet();
    const v = await validate(
      dischargeWith({ cells_read: 3, read_truncated: true, read_content_sha256: contentSha256 }),
      observations,
    );
    expect(v.validation_status).toBe("invalid");
    expect(v.violations.some((x) => x.message.includes("truncated"))).toBe(true);
  });

  it("rejects a satisfied discharge whose read hash ≠ the observed content hash (content skew — GL-1)", async () => {
    const { observations } = await realRuntimeTargetSpreadsheet();
    const v = await validate(
      dischargeWith({ cells_read: 3, read_truncated: false, read_content_sha256: "f".repeat(64) }),
      observations,
    );
    expect(v.validation_status).toBe("invalid");
    expect(v.violations.some((x) => x.message.includes("content_sha256"))).toBe(true);
  });
});

// §16 re-cut gates — the live-A/B blockers the code cross-validation (ultracode wf_a487da42-825 +
// onto 20260701-658350af) found that the prior CSV/whole-column tests masked: a row-narrowed pick must
// be ACCEPTED (not dropped), a tall column must read a non-truncated SAMPLE (not blow the cap), the full
// path must work on a real XLSX, and an author failure must be contained with a real failed census.
describe("runMaturationValueReadStage (value-read cut §16 re-cut gates)", () => {
  it("DC-1: a row-narrowed pick inside an allowed column is ACCEPTED (not dropped) → discharge produced", async () => {
    const { observations, baseline, result } = await (async () => {
      const obs = await realRuntimeTargetSpreadsheet("account,amount\nrevenue,1000\ncogs,400\nsga,50\n");
      const r = await runStage(
        directCallValueReadAuthor("satisfied", { narrowRows: [2, 3] }), // narrow to grid rows 2..3
        obs.observations,
        baselineWithLimitedRow(),
      );
      return { observations: obs.observations, baseline: r.baseline, result: r.result };
    })();
    expect(result.dischargePath).not.toBeNull();
    const discharge = parseYaml(
      await readFile(result.dischargePath!, "utf8"),
    ) as ReconstructMaturationValueDischargeArtifact;
    // The narrowed pick was NOT dropped: a discharge exists, backed by exactly the 2 narrowed rows.
    expect(discharge.discharges).toHaveLength(1);
    expect(discharge.discharges[0]!.value_evidence_ref.cells_read).toBe(2);
    expect(discharge.discharges[0]!.value_evidence_ref.read_truncated).toBe(false);
    expect(discharge.census.limitations_discharged).toBe(1);
    void observations;
    void baseline;
  });

  it("DC-2: a TALL column (300 rows > 200 cap) reads a non-truncated head SAMPLE → satisfiable", async () => {
    const rows = ["account,amount"];
    for (let i = 0; i < 299; i += 1) rows.push(`acct${i},${i * 10}`);
    const big = await realRuntimeTargetSpreadsheet(`${rows.join("\n")}\n`);
    const { result, baseline } = await runStage(
      directCallValueReadAuthor("satisfied"), // first allowed pick = head-of-column sample scope
      big.observations,
      baselineWithLimitedRow(),
    );
    const discharge = parseYaml(
      await readFile(result.dischargePath!, "utf8"),
    ) as ReconstructMaturationValueDischargeArtifact;
    const dischargeValidation = parseYaml(
      await readFile(result.dischargeValidationPath!, "utf8"),
    ) as ReconstructMaturationValueDischargeValidationArtifact;
    const entry = discharge.discharges[0]!;
    // The whole column is 300 rows, but the sample window caps the read at 200 → NOT truncated → the
    // discharge can be satisfied (the §16.1 DC-2 silent no-op is gone). cells_read is the real sample.
    expect(entry.value_evidence_ref.cells_read).toBe(200);
    expect(entry.value_evidence_ref.read_truncated).toBe(false);
    expect(entry.satisfaction_status).toBe("satisfied");
    expect(dischargeValidation.validation_status).toBe("valid");
    // → the current matrix recompute moves the row to value_resolved.
    const matrix = buildActionabilityMatrixArtifact({
      sessionId: SESSION,
      maturationBaseline: baseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
      maturationValueDischarge: discharge,
      maturationValueDischargeValidation: dischargeValidation,
    });
    expect(matrix.rows[0]!.member_readiness).toBe("value_resolved");
  });

  it("SR-6: full path on a REAL XLSX observer fixture → satisfied discharge → value_resolved", async () => {
    const { observations, contentSha256 } = await realRuntimeTargetXlsx();
    const { result, baseline } = await runStage(
      directCallValueReadAuthor("satisfied"),
      observations,
      baselineWithLimitedRow(),
    );
    expect(result.dischargePath).not.toBeNull();
    const discharge = parseYaml(
      await readFile(result.dischargePath!, "utf8"),
    ) as ReconstructMaturationValueDischargeArtifact;
    const dischargeValidation = parseYaml(
      await readFile(result.dischargeValidationPath!, "utf8"),
    ) as ReconstructMaturationValueDischargeValidationArtifact;
    expect(dischargeValidation.validation_status).toBe("valid");
    const entry = discharge.discharges[0]!;
    expect(entry.satisfaction_status).toBe("satisfied");
    expect(entry.value_evidence_ref.cells_read).toBeGreaterThan(0);
    // content binding holds on the xlsx path too (re-read hash == observed inventory hash).
    expect(entry.value_evidence_ref.read_content_sha256).toBe(contentSha256);
    const matrix = buildActionabilityMatrixArtifact({
      sessionId: SESSION,
      maturationBaseline: baseline,
      maturationBaselineRef: "maturation-baseline.yaml",
      maturationBaselineValidationRef: "maturation-baseline-validation.yaml",
      maturationValueDischarge: discharge,
      maturationValueDischargeValidation: dischargeValidation,
    });
    expect(matrix.rows[0]!.member_readiness).toBe("value_resolved");
  });

  it("§17.3: allowed_locations carry column HEADER LABELS so the LLM can pick by value-meaning (not blind column 0)", async () => {
    const obs = await realRuntimeTargetSpreadsheet("account,amount\nrevenue,1000\ncogs,400\n");
    let capturedLabel: unknown;
    let capturedType: unknown;
    const author = createDirectCallReconstructDirectiveAuthor({
      llmCall: async (systemPrompt: string, userPrompt: string) => {
        if (systemPrompt.includes("Select spreadsheet cell locations")) {
          const allowed = (JSON.parse(userPrompt).allowed_locations ?? []) as Array<
            Record<string, unknown>
          >;
          capturedLabel = allowed[0]?.column_label;
          capturedType = allowed[0]?.column_inferred_type;
          return {
            text: JSON.stringify({ picked_locations: allowed.length > 0 ? [allowed[0]] : [] }),
            input_tokens: 1,
            output_tokens: 1,
            model_id: "stub",
          };
        }
        if (systemPrompt.includes("Judge whether read spreadsheet cell values")) {
          return {
            text: JSON.stringify({ satisfaction_status: "inconclusive", rationale: "x" }),
            input_tokens: 1,
            output_tokens: 1,
            model_id: "stub",
          };
        }
        throw new Error("unexpected");
      },
    });
    await runStage(author, obs.observations, baselineWithLimitedRow());
    // The header label ("account"/"amount") + inferred type reach the location prompt — the §17.2
    // blindness fix. Without it the LLM only saw column numbers and blind-picked column 0.
    expect(typeof capturedLabel).toBe("string");
    expect((capturedLabel as string).length).toBeGreaterThan(0);
    expect(typeof capturedType).toBe("string");
  });

  it("TQ-1/A2: an author whose readValueDischarge THROWS is contained → no abort, census failed > 0", async () => {
    const { observations } = await realRuntimeTargetSpreadsheet();
    // runStage completing at all proves no abort; the census records the failure honestly.
    const { result } = await runStage(throwingValueReadAuthor(), observations, baselineWithLimitedRow());
    expect(result.censusPath).not.toBeNull();
    const discharge = parseYaml(
      await readFile(result.dischargePath!, "utf8"),
    ) as ReconstructMaturationValueDischargeArtifact;
    expect(discharge.census.failed).toBeGreaterThan(0);
    expect(discharge.census.limitations_discharged).toBe(0);
    expect(discharge.census.ran_but_discharged_zero).toBe(true);
  });
});
