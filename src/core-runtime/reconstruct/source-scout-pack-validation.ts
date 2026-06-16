import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { assertArrayField, atomicWriteYamlDocument as writeYamlDocument } from "../artifact-io.js";
import type {
  ReconstructSourceObservationsArtifact,
  ReconstructSourceSafetyLedgerArtifact,
  ReconstructSourceSafetyLedgerValidationArtifact,
  ReconstructSourceSafetyRow,
  ReconstructSourceSafetyVisibilityTier,
  ReconstructSourceScoutCoverageAxis,
  ReconstructSourceScoutCoverageSlot,
  ReconstructSourceScoutCoverageStatus,
  ReconstructSourceScoutPromptVisibilityState,
  ReconstructSourceScoutSignalAxis,
  ReconstructSourceScoutSignalBasis,
  ReconstructSourceScoutSignalRow,
  ReconstructSourceScoutPackArtifact,
  ReconstructSourceScoutPackValidationArtifact,
  ReconstructSourceScoutPackValidationViolation,
  ReconstructSourceScoutScopeState,
  ReconstructTargetMaterialProfileArtifact,
  ReconstructTargetMaterialProfileValidationArtifact,
} from "./artifact-types.js";
import type { ReconstructSourceObservation } from "./source-observations.js";
import { sourceSafetyRowIdForObservation } from "./source-safety-validation.js";

const SIGNAL_AXES = [
  "actor",
  "action",
  "state",
  "guard",
  "object",
  "declared_purpose",
  "source_claim",
  "instruction_cue",
  "provenance_cue",
  "limitation",
] as const satisfies readonly ReconstructSourceScoutSignalAxis[];

const SIGNAL_BASES = [
  "path",
  "basename",
  "heading",
  "symbol",
  "excerpt",
  "schema",
  "test",
  "api",
  "config",
] as const satisfies readonly ReconstructSourceScoutSignalBasis[];

const PROMPT_VISIBILITY_STATES = [
  "prompt_visible",
  "redacted",
  "blocked",
] as const satisfies readonly ReconstructSourceScoutPromptVisibilityState[];

const COVERAGE_AXES = [
  "profile_local",
  ...SIGNAL_AXES,
] as const satisfies readonly ReconstructSourceScoutCoverageAxis[];

const CODE_PATTERNS: Record<ReconstructSourceScoutSignalAxis, RegExp[]> = {
  actor: [
    /\b(?:user|admin|member|team|org|organization|role|principal|account|client|provider|worker|scheduler)\b/i,
  ],
  action: [
    /\b(?:create|update|delete|approve|reject|ingest|sync|classify|render|route|command|query|mutation|publish|submit)\b/i,
  ],
  state: [
    /\b(?:status|state|phase|retry|queue|event|lifecycle|failed|complete|completed|pending|blocked)\b/i,
  ],
  guard: [
    /\b(?:auth|permission|validate|validation|policy|allowlist|rate|visibility|error|guard|check)\b/i,
  ],
  object: [
    /\b(?:schema|model|dto|payload|binding|entity|record|table|artifact|resource)\b/i,
  ],
  declared_purpose: [
    /\b(?:purpose|goal|mission|feature|workflow|use case|entrypoint|quickstart)\b/i,
  ],
  source_claim: [
    /\b(?:must|should|shall|requirement|requires|supports|guarantee|contract)\b/i,
  ],
  instruction_cue: [
    /\b(?:todo|fixme|step|guide|usage|run|command|invoke|configure)\b/i,
  ],
  provenance_cue: [
    /\b(?:created|updated|version|author|owner|source|reference|migration|deprecated)\b/i,
  ],
  limitation: [
    /\b(?:limitation|risk|unknown|deferred|unsupported|blocked|not supported|future)\b/i,
  ],
};

const DOCUMENT_PATTERNS: Record<ReconstructSourceScoutSignalAxis, RegExp[]> = {
  actor: [
    /\b(?:audience|owner|approver|team|stakeholder|customer|operator|participant|user|reader)\b/i,
  ],
  action: [
    /\b(?:procedure|decision|approval|report|request|obligation|action item|acceptance criterion|review)\b/i,
  ],
  state: [
    /\b(?:status|phase|risk|lifecycle|timeline|unresolved|open|resolved|pending|complete)\b/i,
  ],
  guard: [
    /\b(?:policy|condition|exception|rule|prohibition|review criterion|escalation|constraint)\b/i,
  ],
  object: [
    /\b(?:subject|resource|deliverable|report|system|data asset|artifact|document)\b/i,
  ],
  declared_purpose: [
    /\b(?:purpose|goal|objective|scope|summary|abstract|introduction|decision)\b/i,
  ],
  source_claim: [
    /\b(?:must|should|shall|claims?|states?|requires|evidence|rationale)\b/i,
  ],
  instruction_cue: [
    /\b(?:step|guide|instruction|action item|next action|follow-up|todo)\b/i,
  ],
  provenance_cue: [
    /\b(?:effective date|version|author|owner|source|reference|citation|created|updated)\b/i,
  ],
  limitation: [
    /\b(?:limitation|risk|unknown|deferred|unsupported|blocked|unresolved|open question)\b/i,
  ],
};

function isoNow(): string {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function inList<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

async function readYamlDocument<T>(filePath: string): Promise<T> {
  return parseYaml(await fs.readFile(filePath, "utf8")) as T;
}

async function sha256File(filePath: string | null | undefined): Promise<string | null> {
  if (!filePath) return null;
  try {
    return crypto.createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
  } catch {
    return null;
  }
}

function sha256Text(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function shortDigest(text: string): string {
  return sha256Text(text).slice(0, 16);
}

function violation(args: {
  code: ReconstructSourceScoutPackValidationViolation["code"];
  message: string;
  subjectId?: string | null;
}): ReconstructSourceScoutPackValidationViolation {
  return {
    code: args.code,
    message: args.message,
    subject_id: args.subjectId ?? null,
  };
}

function safetyRowById(
  sourceSafetyLedger: ReconstructSourceSafetyLedgerArtifact,
): Map<string, ReconstructSourceSafetyRow> {
  assertArrayField(sourceSafetyLedger.safety_rows, "source-safety-ledger", "safety_rows");
  return new Map(
    sourceSafetyLedger.safety_rows.map((row) => [row.safety_row_id, row]),
  );
}

function selectedProfileRefForObservation(args: {
  observation: ReconstructSourceObservation;
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact;
}): string | null {
  assertArrayField(args.targetMaterialProfile.selected_source_profiles, "target-material-profile", "selected_source_profiles");
  return args.targetMaterialProfile.selected_source_profiles.find((profile) =>
    profile.target_material_kind === args.observation.target_material_kind
  )?.profile_ref ?? null;
}

function scoutScopeState(args: {
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact;
  targetMaterialProfileValidation: ReconstructTargetMaterialProfileValidationArtifact;
}): ReconstructSourceScoutScopeState {
  assertArrayField(args.targetMaterialProfile.target_material_kind_candidates, "target-material-profile", "target_material_kind_candidates");
  if (
    args.targetMaterialProfile.target_material_kind === "mixed" &&
    args.targetMaterialProfile.target_material_kind_candidates.some((kind) =>
      kind === "code" || kind === "document"
    )
  ) {
    return "member_scoped_composite";
  }
  if (
    args.targetMaterialProfileValidation.validation_status === "valid" &&
    args.targetMaterialProfile.target_refs.length === 1 &&
    (
      args.targetMaterialProfile.target_material_kind === "code" ||
      args.targetMaterialProfile.target_material_kind === "document"
    )
  ) {
    return "supported_single_member_code_or_document";
  }
  return "unsupported_material_scope";
}

function scopeLimitationRefs(scopeState: ReconstructSourceScoutScopeState): string[] {
  if (scopeState === "supported_single_member_code_or_document") return [];
  if (scopeState === "member_scoped_composite") {
    return ["source_scout_phase1_composite_member_scope_not_prompt_claimed"];
  }
  return ["source_scout_phase1_supports_only_single_code_or_document_target"];
}

function visibilityStateForSafetyRow(
  row: ReconstructSourceSafetyRow | null,
): ReconstructSourceScoutPromptVisibilityState {
  if (!row) return "blocked";
  switch (row.visibility_tier) {
    case "consumption_allowed":
      return "prompt_visible";
    case "internal_only":
    case "redacted_output_only":
      return "redacted";
    case "no_prompt_use":
    case "no_replay_use":
      return "blocked";
  }
}

function textFields(observation: ReconstructSourceObservation): Array<{
  basis: ReconstructSourceScoutSignalBasis;
  text: string;
}> {
  const structuralData = observation.structural_data;
  const basename = typeof structuralData.basename === "string"
    ? structuralData.basename
    : path.basename(observation.source_ref);
  const excerpt = typeof structuralData.content_excerpt === "string"
    ? structuralData.content_excerpt
    : "";
  const extension = typeof structuralData.extension === "string"
    ? structuralData.extension
    : path.extname(observation.source_ref);
  const basisByExtension: ReconstructSourceScoutSignalBasis =
    [".json", ".yaml", ".yml"].includes(extension.toLowerCase())
      ? "schema"
      : observation.source_ref.match(/(?:^|[/\\])(?:test|tests|__tests__|spec)(?:[/\\]|$)|\.(?:test|spec)\./i)
        ? "test"
        : observation.source_ref.match(/(?:api|route|controller|openapi|swagger)/i)
          ? "api"
          : observation.source_ref.match(/(?:config|package\.json|tsconfig|dockerfile|makefile)/i)
            ? "config"
            : "excerpt";
  const fields: Array<{
    basis: ReconstructSourceScoutSignalBasis;
    text: string;
  }> = [
    { basis: "basename", text: basename },
    { basis: "path", text: observation.source_ref },
    { basis: basisByExtension, text: excerpt },
  ];
  return fields.filter((field) => field.text.trim().length > 0);
}

function lineLocator(args: {
  observation: ReconstructSourceObservation;
  basis: ReconstructSourceScoutSignalBasis;
  text: string;
  matchIndex: number;
}): string {
  if (args.basis !== "excerpt") return args.observation.location;
  const prefix = args.text.slice(0, Math.max(0, args.matchIndex));
  const line = prefix.length === 0 ? 1 : prefix.split(/\r?\n/).length;
  return `${args.observation.location}:excerpt-line-${line}`;
}

function patternRecord(
  targetMaterialKind: "code" | "document",
): Record<ReconstructSourceScoutSignalAxis, RegExp[]> {
  return targetMaterialKind === "code" ? CODE_PATTERNS : DOCUMENT_PATTERNS;
}

function buildSignalRowsForObservation(args: {
  observation: ReconstructSourceObservation;
  sourceSafetyRow: ReconstructSourceSafetyRow | null;
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact;
  sourceObservationsRef?: string | null;
  sourceSafetyLedgerRef?: string | null;
  sourceSafetyLedgerValidationRef?: string | null;
}): ReconstructSourceScoutSignalRow[] {
  if (
    args.observation.target_material_kind !== "code" &&
    args.observation.target_material_kind !== "document"
  ) {
    return [];
  }
  const visibilityState = visibilityStateForSafetyRow(args.sourceSafetyRow);
  const rows: ReconstructSourceScoutSignalRow[] = [];
  const seen = new Set<string>();
  const contentSha = typeof args.observation.structural_data.content_sha256 === "string"
    ? args.observation.structural_data.content_sha256
    : null;
  for (const axis of SIGNAL_AXES) {
    const patterns = patternRecord(args.observation.target_material_kind)[axis];
    for (const field of textFields(args.observation)) {
      for (const pattern of patterns) {
        const match = pattern.exec(field.text);
        if (!match?.[0]) continue;
        const matchedText = match[0].slice(0, 120);
        const key = `${axis}\n${field.basis}\n${matchedText.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const matchedTextSha = sha256Text(matchedText);
        rows.push({
          signal_row_id:
            `source_scout:${args.observation.observation_id}:${axis}:${shortDigest(key)}`,
          observation_id: args.observation.observation_id,
          source_ref: args.observation.source_ref,
          target_material_kind: args.observation.target_material_kind,
          signal_axis: axis,
          signal_basis: field.basis,
          matched_text: visibilityState === "prompt_visible" ? matchedText : null,
          matched_text_sha256: matchedTextSha,
          evidence_locator: lineLocator({
            observation: args.observation,
            basis: field.basis,
            text: field.text,
            matchIndex: match.index,
          }),
          profile_ref: selectedProfileRefForObservation({
            observation: args.observation,
            targetMaterialProfile: args.targetMaterialProfile,
          }),
          source_observation_ref: args.sourceObservationsRef ?? null,
          source_observation_content_sha256: contentSha,
          source_safety_row_id: args.sourceSafetyRow?.safety_row_id ?? null,
          source_safety_ledger_ref: args.sourceSafetyLedgerRef ?? null,
          source_safety_ledger_validation_ref:
            args.sourceSafetyLedgerValidationRef ?? null,
          prompt_visibility_state: visibilityState,
          intended_consumption: "scout_prompt_input",
          redaction_summary: visibilityState === "prompt_visible"
            ? null
            : `Signal text withheld because prompt-context source safety visibility is ${args.sourceSafetyRow?.visibility_tier ?? "missing"}.`,
          limitation_refs: visibilityState === "prompt_visible"
            ? []
            : ["source_scout_signal_text_not_prompt_visible"],
        });
      }
    }
  }
  return rows;
}

function coverageStatusForAxis(args: {
  axis: ReconstructSourceScoutCoverageAxis;
  rows: ReconstructSourceScoutSignalRow[];
  scopeState: ReconstructSourceScoutScopeState;
}): ReconstructSourceScoutCoverageStatus {
  if (args.scopeState !== "supported_single_member_code_or_document") {
    return args.axis === "profile_local" ? "limitation_cue" : "missing";
  }
  if (args.axis === "profile_local") return "present";
  const axisRows = args.rows.filter((row) => row.signal_axis === args.axis);
  if (axisRows.length === 0) return "missing";
  if (axisRows.every((row) => row.prompt_visibility_state === "blocked")) {
    return "blocked_by_safety";
  }
  return args.axis === "limitation" ? "limitation_cue" : "present";
}

function buildCoverageSlots(args: {
  rows: ReconstructSourceScoutSignalRow[];
  scopeState: ReconstructSourceScoutScopeState;
  targetMaterialKind: ReconstructTargetMaterialProfileArtifact["target_material_kind"];
}): ReconstructSourceScoutCoverageSlot[] {
  return COVERAGE_AXES.map((axis) => {
    const signalRows = args.rows.filter((row) =>
      axis === "profile_local" ? true : row.signal_axis === axis
    );
    const status = coverageStatusForAxis({
      axis,
      rows: args.rows,
      scopeState: args.scopeState,
    });
    return {
      coverage_slot_id: `source_scout_coverage:${axis}`,
      coverage_axis: axis,
      target_material_kind: args.targetMaterialKind,
      status,
      signal_row_refs: signalRows.map((row) => row.signal_row_id),
      limitation_refs: status === "missing"
        ? [`source_scout_${axis}_signal_missing`]
        : status === "blocked_by_safety"
          ? [`source_scout_${axis}_signal_blocked_by_safety`]
          : [],
    };
  });
}

export function buildSourceScoutPackFromArtifacts(args: {
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact;
  targetMaterialProfileRef?: string | null;
  targetMaterialProfileValidation: ReconstructTargetMaterialProfileValidationArtifact;
  targetMaterialProfileValidationRef?: string | null;
  sourceObservations: ReconstructSourceObservationsArtifact;
  sourceObservationsRef?: string | null;
  sourceSafetyLedger: ReconstructSourceSafetyLedgerArtifact;
  sourceSafetyLedgerRef?: string | null;
  sourceSafetyLedgerValidation: ReconstructSourceSafetyLedgerValidationArtifact;
  sourceSafetyLedgerValidationRef?: string | null;
  sourceObservationsSha256?: string | null;
  sourceSafetyLedgerSha256?: string | null;
  sourceSafetyLedgerValidationSha256?: string | null;
  sourceObservationLineageIndexValidationRef?: string | null;
  sourceObservationLineageIndexValidationSha256?: string | null;
  targetMaterialProfileValidationSha256?: string | null;
}): ReconstructSourceScoutPackArtifact {
  assertArrayField(args.sourceSafetyLedger.safety_rows, "source-safety-ledger", "safety_rows");
  assertArrayField(args.sourceObservations.observations, "source-observations", "observations");
  assertArrayField(args.targetMaterialProfile.selected_source_profiles, "target-material-profile", "selected_source_profiles");
  assertArrayField(args.targetMaterialProfile.target_refs, "target-material-profile", "target_refs");
  const scopeState = scoutScopeState({
    targetMaterialProfile: args.targetMaterialProfile,
    targetMaterialProfileValidation: args.targetMaterialProfileValidation,
  });
  const safetyRows = safetyRowById(args.sourceSafetyLedger);
  const rows = scopeState === "supported_single_member_code_or_document"
    ? args.sourceObservations.observations.flatMap((observation) =>
      buildSignalRowsForObservation({
        observation,
        sourceSafetyRow:
          safetyRows.get(sourceSafetyRowIdForObservation(observation, "prompt_context")) ??
          null,
        targetMaterialProfile: args.targetMaterialProfile,
        sourceObservationsRef: args.sourceObservationsRef ?? null,
        sourceSafetyLedgerRef: args.sourceSafetyLedgerRef ?? null,
        sourceSafetyLedgerValidationRef: args.sourceSafetyLedgerValidationRef ?? null,
      })
    )
    : [];
  const coverageSlots = buildCoverageSlots({
    rows,
    scopeState,
    targetMaterialKind: args.targetMaterialProfile.target_material_kind,
  });
  return {
    schema_version: "1",
    session_id: args.sourceObservations.session_id,
    created_at: isoNow(),
    scout_focus: "actor_action_state",
    scout_scope: {
      scope_state: scopeState,
      target_material_kind: args.targetMaterialProfile.target_material_kind,
      target_ref_count: args.targetMaterialProfile.target_refs.length,
      selected_source_profile_refs: args.targetMaterialProfile.selected_source_profiles
        .map((profile) => profile.profile_ref),
      limitation_refs: scopeLimitationRefs(scopeState),
    },
    source_observations_ref: args.sourceObservationsRef ?? null,
    source_safety_ledger_ref: args.sourceSafetyLedgerRef ?? null,
    source_safety_ledger_validation_ref:
      args.sourceSafetyLedgerValidationRef ?? null,
    target_material_profile_ref: args.targetMaterialProfileRef ?? null,
    target_material_profile_validation_ref:
      args.targetMaterialProfileValidationRef ?? null,
    source_observation_lineage_index_validation_ref:
      args.sourceObservationLineageIndexValidationRef ?? null,
    input_snapshot_hashes: {
      source_observations_sha256: args.sourceObservationsSha256 ?? null,
      source_safety_ledger_sha256: args.sourceSafetyLedgerSha256 ?? null,
      source_safety_ledger_validation_sha256:
        args.sourceSafetyLedgerValidationSha256 ?? null,
      target_material_profile_validation_sha256:
        args.targetMaterialProfileValidationSha256 ?? null,
      source_observation_lineage_index_validation_sha256:
        args.sourceObservationLineageIndexValidationSha256 ?? null,
    },
    signal_rows: rows,
    profile_scout_coverage_slots: coverageSlots,
    omitted_signal_summary: args.sourceObservations.observations.flatMap((observation) => {
      const row = safetyRows.get(sourceSafetyRowIdForObservation(observation, "prompt_context"));
      const visibilityState = visibilityStateForSafetyRow(row ?? null);
      const hasSignals = rows.some((signal) =>
        signal.observation_id === observation.observation_id
      );
      if (hasSignals) return [];
      return [{
        observation_id: observation.observation_id,
        source_ref: observation.source_ref,
        reason: visibilityState === "blocked"
          ? "blocked_by_source_safety" as const
          : "no_profile_local_signal" as const,
        source_safety_row_id: row?.safety_row_id ?? null,
        visibility_tier: row?.visibility_tier ?? null,
      }];
    }),
    boundary_notes: [
      "SourceScoutPack is a deterministic profile-local scout index; it is not a semantic ontology authority.",
      "No selected-purpose required element refs are admitted before source-purpose selection and SeedAuthoringReadiness.",
    ],
  };
}

function validateNoSelectedPurposeLeak(
  sourceScoutPack: ReconstructSourceScoutPackArtifact,
  violations: ReconstructSourceScoutPackValidationViolation[],
): void {
  const serialized = JSON.stringify(sourceScoutPack);
  if (
    serialized.includes("purpose_required_element_ref") ||
    serialized.includes("PurposeAdequacyFrame.required_elements")
  ) {
    violations.push(violation({
      code: "selected_purpose_authority_leak",
      message:
        "SourceScoutPack must not carry selected-purpose required element refs before SeedAuthoringReadiness",
      subjectId: "source-scout-pack.yaml",
    }));
  }
}

export async function validateSourceScoutPack(args: {
  sourceScoutPack: ReconstructSourceScoutPackArtifact;
  sourceScoutPackRef?: string | null;
  sourceObservations: ReconstructSourceObservationsArtifact;
  sourceObservationsRef?: string | null;
  sourceObservationsSha256?: string | null;
  sourceSafetyLedger: ReconstructSourceSafetyLedgerArtifact;
  sourceSafetyLedgerRef?: string | null;
  sourceSafetyLedgerSha256?: string | null;
  sourceSafetyLedgerValidation: ReconstructSourceSafetyLedgerValidationArtifact;
  sourceSafetyLedgerValidationRef?: string | null;
  sourceSafetyLedgerValidationSha256?: string | null;
  targetMaterialProfileValidation: ReconstructTargetMaterialProfileValidationArtifact;
  targetMaterialProfileValidationRef?: string | null;
  targetMaterialProfileValidationSha256?: string | null;
  sourceObservationLineageIndexValidationRef?: string | null;
  sourceObservationLineageIndexValidationSha256?: string | null;
}): Promise<ReconstructSourceScoutPackValidationArtifact> {
  assertArrayField(args.sourceObservations.observations, "source-observations", "observations");
  const violations: ReconstructSourceScoutPackValidationViolation[] = [];
  // signal_rows is this validator's primary subject and is already shape-checked
  // gracefully below (→ schema_shape_invalid violation), so it is NOT asserted.
  const rawPack = args.sourceScoutPack as unknown;
  if (!isRecord(rawPack) || !Array.isArray(rawPack.signal_rows)) {
    violations.push(violation({
      code: "schema_shape_invalid",
      message: "source-scout-pack.yaml must be an object with signal_rows array",
      subjectId: "source-scout-pack.yaml",
    }));
  }
  if (args.sourceScoutPack.session_id !== args.sourceObservations.session_id) {
    violations.push(violation({
      code: "session_id_mismatch",
      message: "source scout pack session_id must match source observations",
      subjectId: args.sourceScoutPack.session_id,
    }));
  }
  if (args.sourceSafetyLedgerValidation.validation_status !== "valid") {
    violations.push(violation({
      code: "source_safety_validation_invalid",
      message: "source scout pack requires valid source-safety-ledger-validation.yaml",
      subjectId: args.sourceSafetyLedgerValidationRef ?? "source-safety-ledger-validation.yaml",
    }));
  }
  if (args.targetMaterialProfileValidation.validation_status !== "valid") {
    violations.push(violation({
      code: "target_material_profile_validation_invalid",
      message:
        "source scout pack requires valid target-material-profile-validation.yaml",
      subjectId:
        args.targetMaterialProfileValidationRef ??
        "target-material-profile-validation.yaml",
    }));
  }
  validateNoSelectedPurposeLeak(args.sourceScoutPack, violations);
  const sourceObservationsSha =
    args.sourceObservationsSha256 ?? await sha256File(args.sourceObservationsRef);
  const sourceSafetyLedgerSha =
    args.sourceSafetyLedgerSha256 ?? await sha256File(args.sourceSafetyLedgerRef);
  const sourceSafetyLedgerValidationSha =
    args.sourceSafetyLedgerValidationSha256 ??
    await sha256File(args.sourceSafetyLedgerValidationRef);
  const targetMaterialProfileValidationSha =
    args.targetMaterialProfileValidationSha256 ??
    await sha256File(args.targetMaterialProfileValidationRef);
  const sourceObservationLineageIndexValidationRef =
    args.sourceObservationLineageIndexValidationRef ?? null;
  const sourceObservationLineageIndexValidationSha =
    args.sourceObservationLineageIndexValidationSha256 ??
    await sha256File(sourceObservationLineageIndexValidationRef);
  if (
    args.sourceScoutPack.input_snapshot_hashes?.source_observations_sha256 !==
      sourceObservationsSha
  ) {
    violations.push(violation({
      code: "source_observations_hash_mismatch",
      message:
        "source scout pack source_observations snapshot hash must match the current source-observations.yaml",
      subjectId: args.sourceScoutPackRef ?? "source-scout-pack.yaml",
    }));
  }
  if (
    args.sourceScoutPack.input_snapshot_hashes?.source_safety_ledger_sha256 !==
      sourceSafetyLedgerSha ||
    args.sourceScoutPack.input_snapshot_hashes?.source_safety_ledger_validation_sha256 !==
      sourceSafetyLedgerValidationSha
  ) {
    violations.push(violation({
      code: "source_safety_hash_mismatch",
      message:
        "source scout pack source-safety snapshot hashes must match the current source-safety artifacts",
      subjectId: args.sourceScoutPackRef ?? "source-scout-pack.yaml",
    }));
  }
  if (
    args.sourceScoutPack.input_snapshot_hashes
      ?.target_material_profile_validation_sha256 !==
      targetMaterialProfileValidationSha
  ) {
    violations.push(violation({
      code: "target_material_profile_validation_hash_mismatch",
      message:
        "source scout pack target-material-profile validation hash must match the current target-material-profile-validation.yaml",
      subjectId: args.sourceScoutPackRef ?? "source-scout-pack.yaml",
    }));
  }
  if (
    args.sourceScoutPack.source_observation_lineage_index_validation_ref !==
      sourceObservationLineageIndexValidationRef
  ) {
    violations.push(violation({
      code: "source_observation_lineage_index_validation_ref_mismatch",
      message:
        "source scout pack lineage validation ref must match the expected source-observation-lineage-index-validation.yaml ref",
      subjectId: args.sourceScoutPackRef ?? "source-scout-pack.yaml",
    }));
  }
  if (
    args.sourceScoutPack.input_snapshot_hashes
      ?.source_observation_lineage_index_validation_sha256 !==
      sourceObservationLineageIndexValidationSha
  ) {
    violations.push(violation({
      code: "source_observation_lineage_index_validation_hash_mismatch",
      message:
        "source scout pack lineage validation hash must match the current source-observation-lineage-index-validation.yaml",
      subjectId: args.sourceScoutPackRef ?? "source-scout-pack.yaml",
    }));
  }

  const observationById = new Map(
    args.sourceObservations.observations.map((observation) => [
      observation.observation_id,
      observation,
    ]),
  );
  const safetyRows = safetyRowById(args.sourceSafetyLedger);
  const expectedSupportedScope =
    args.sourceScoutPack.scout_scope.target_ref_count === 1 &&
    (
      args.sourceScoutPack.scout_scope.target_material_kind === "code" ||
      args.sourceScoutPack.scout_scope.target_material_kind === "document"
    );
  if (
    args.sourceScoutPack.scout_scope.scope_state ===
      "supported_single_member_code_or_document" &&
    !expectedSupportedScope
  ) {
    violations.push(violation({
      code: "unsupported_scope_overclaimed",
      message:
        "source scout pack can claim supported scope only for single code or document targets",
      subjectId: args.sourceScoutPack.scout_scope.scope_state,
    }));
  }
  if (
    args.sourceScoutPack.scout_scope.scope_state !==
      "supported_single_member_code_or_document" &&
    args.sourceScoutPack.signal_rows.length > 0
  ) {
    violations.push(violation({
      code: "unsupported_scope_overclaimed",
      message:
        "unsupported or composite scout scopes must not project signal rows in the phase-1 pack",
      subjectId: args.sourceScoutPack.scout_scope.scope_state,
    }));
  }

  const signalRowIds = new Set<string>();
  for (const [index, row] of args.sourceScoutPack.signal_rows.entries()) {
    if (!row.signal_row_id?.trim()) {
      violations.push(violation({
        code: "schema_shape_invalid",
        message: `signal_rows[${index}].signal_row_id is required`,
        subjectId: `signal_rows[${index}]`,
      }));
    } else if (signalRowIds.has(row.signal_row_id)) {
      violations.push(violation({
        code: "duplicate_id",
        message: `duplicate source scout signal row id: ${row.signal_row_id}`,
        subjectId: row.signal_row_id,
      }));
    }
    signalRowIds.add(row.signal_row_id);
    if (!inList(row.signal_axis, SIGNAL_AXES)) {
      violations.push(violation({
        code: "invalid_signal_axis",
        message: `invalid source scout signal axis: ${String(row.signal_axis)}`,
        subjectId: row.signal_row_id,
      }));
    }
    if (!inList(row.signal_basis, SIGNAL_BASES)) {
      violations.push(violation({
        code: "invalid_signal_basis",
        message: `invalid source scout signal basis: ${String(row.signal_basis)}`,
        subjectId: row.signal_row_id,
      }));
    }
    if (!inList(row.prompt_visibility_state, PROMPT_VISIBILITY_STATES)) {
      violations.push(violation({
        code: "invalid_prompt_visibility_state",
        message:
          `invalid source scout prompt visibility state: ${String(row.prompt_visibility_state)}`,
        subjectId: row.signal_row_id,
      }));
    }
    const observation = observationById.get(row.observation_id);
    if (!observation) {
      violations.push(violation({
        code: "signal_observation_missing",
        message:
          `source scout signal row references unknown observation: ${row.observation_id}`,
        subjectId: row.signal_row_id,
      }));
      continue;
    }
    const observationContentSha = typeof observation.structural_data.content_sha256 === "string"
      ? observation.structural_data.content_sha256
      : null;
    if (row.source_observation_content_sha256 !== observationContentSha) {
      violations.push(violation({
        code: "source_observations_hash_mismatch",
        message:
          "source scout signal row content hash must match the current source observation",
        subjectId: row.signal_row_id,
      }));
    }
    const safetyRow = row.source_safety_row_id
      ? safetyRows.get(row.source_safety_row_id)
      : undefined;
    if (!safetyRow) {
      violations.push(violation({
        code: "signal_safety_row_missing",
        message:
          `source scout signal row references missing prompt-context source safety row: ${row.source_safety_row_id ?? "null"}`,
        subjectId: row.signal_row_id,
      }));
      continue;
    }
    const expectedSafetyRowId = sourceSafetyRowIdForObservation(
      observation,
      "prompt_context",
    );
    if (safetyRow.safety_row_id !== expectedSafetyRowId) {
      violations.push(violation({
        code: "signal_safety_row_missing",
        message:
          `source scout signal row must bind to prompt-context source safety row ${expectedSafetyRowId}`,
        subjectId: row.signal_row_id,
      }));
    }
    if (row.prompt_visibility_state === "prompt_visible") {
      if (args.sourceSafetyLedgerValidation.validation_status !== "valid") {
        violations.push(violation({
          code: "prompt_visible_signal_without_valid_safety",
          message:
            "prompt-visible source scout signal requires valid source safety validation",
          subjectId: row.signal_row_id,
        }));
      }
      if (safetyRow.visibility_tier !== "consumption_allowed") {
        violations.push(violation({
          code: "prompt_visible_signal_without_consumption_allowed_tier",
          message:
            `prompt-visible source scout signal requires consumption_allowed prompt-context tier, got ${safetyRow.visibility_tier}`,
          subjectId: row.signal_row_id,
        }));
      }
    }
  }

  const coverageSlotIds = new Set<string>();
  for (const slot of args.sourceScoutPack.profile_scout_coverage_slots) {
    if (coverageSlotIds.has(slot.coverage_slot_id)) {
      violations.push(violation({
        code: "duplicate_id",
        message:
          `duplicate source scout coverage slot id: ${slot.coverage_slot_id}`,
        subjectId: slot.coverage_slot_id,
      }));
    }
    coverageSlotIds.add(slot.coverage_slot_id);
    for (const signalRowRef of slot.signal_row_refs) {
      if (!signalRowIds.has(signalRowRef)) {
        violations.push(violation({
          code: "coverage_slot_signal_missing",
          message:
            `source scout coverage slot references missing signal row: ${signalRowRef}`,
          subjectId: slot.coverage_slot_id,
        }));
      }
    }
  }

  return {
    schema_version: "1",
    session_id: args.sourceScoutPack.session_id,
    created_at: isoNow(),
    source_scout_pack_ref: args.sourceScoutPackRef ?? null,
    source_observations_ref: args.sourceObservationsRef ?? null,
    source_observations_sha256: sourceObservationsSha,
    source_safety_ledger_ref: args.sourceSafetyLedgerRef ?? null,
    source_safety_ledger_sha256: sourceSafetyLedgerSha,
    source_safety_ledger_validation_ref:
      args.sourceSafetyLedgerValidationRef ?? null,
    source_safety_ledger_validation_sha256: sourceSafetyLedgerValidationSha,
    target_material_profile_validation_ref:
      args.targetMaterialProfileValidationRef ?? null,
    target_material_profile_validation_sha256: targetMaterialProfileValidationSha,
    source_observation_lineage_index_validation_ref:
      sourceObservationLineageIndexValidationRef,
    source_observation_lineage_index_validation_sha256:
      sourceObservationLineageIndexValidationSha,
    scout_scope: args.sourceScoutPack.scout_scope,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    signal_row_count: args.sourceScoutPack.signal_rows.length,
    prompt_visible_signal_count: args.sourceScoutPack.signal_rows.filter((row) =>
      row.prompt_visibility_state === "prompt_visible"
    ).length,
    coverage_slot_count: args.sourceScoutPack.profile_scout_coverage_slots.length,
    validation_results: violations.length === 0
      ? ["source_scout_pack_valid"]
      : ["source_scout_pack_invalid"],
    violations,
  };
}

export async function writeSourceScoutPackArtifact(args: {
  targetMaterialProfilePath: string;
  targetMaterialProfileValidationPath: string;
  sourceObservationsPath: string;
  sourceSafetyLedgerPath: string;
  sourceSafetyLedgerValidationPath: string;
  sourceObservationLineageIndexValidationPath?: string | null;
  outputPath: string;
}): Promise<ReconstructSourceScoutPackArtifact> {
  const [
    targetMaterialProfile,
    targetMaterialProfileValidation,
    sourceObservations,
    sourceSafetyLedger,
    sourceSafetyLedgerValidation,
  ] = await Promise.all([
    readYamlDocument<ReconstructTargetMaterialProfileArtifact>(
      args.targetMaterialProfilePath,
    ),
    readYamlDocument<ReconstructTargetMaterialProfileValidationArtifact>(
      args.targetMaterialProfileValidationPath,
    ),
    readYamlDocument<ReconstructSourceObservationsArtifact>(
      args.sourceObservationsPath,
    ),
    readYamlDocument<ReconstructSourceSafetyLedgerArtifact>(
      args.sourceSafetyLedgerPath,
    ),
    readYamlDocument<ReconstructSourceSafetyLedgerValidationArtifact>(
      args.sourceSafetyLedgerValidationPath,
    ),
  ]);
  const pack = buildSourceScoutPackFromArtifacts({
    targetMaterialProfile,
    targetMaterialProfileRef: path.resolve(args.targetMaterialProfilePath),
    targetMaterialProfileValidation,
    targetMaterialProfileValidationRef:
      path.resolve(args.targetMaterialProfileValidationPath),
    sourceObservations,
    sourceObservationsRef: path.resolve(args.sourceObservationsPath),
    sourceSafetyLedger,
    sourceSafetyLedgerRef: path.resolve(args.sourceSafetyLedgerPath),
    sourceSafetyLedgerValidation,
    sourceSafetyLedgerValidationRef:
      path.resolve(args.sourceSafetyLedgerValidationPath),
    sourceObservationsSha256: await sha256File(args.sourceObservationsPath),
    sourceSafetyLedgerSha256: await sha256File(args.sourceSafetyLedgerPath),
    sourceSafetyLedgerValidationSha256:
      await sha256File(args.sourceSafetyLedgerValidationPath),
    targetMaterialProfileValidationSha256:
      await sha256File(args.targetMaterialProfileValidationPath),
    sourceObservationLineageIndexValidationSha256:
      await sha256File(args.sourceObservationLineageIndexValidationPath),
    sourceObservationLineageIndexValidationRef:
      args.sourceObservationLineageIndexValidationPath
        ? path.resolve(args.sourceObservationLineageIndexValidationPath)
        : null,
  });
  await writeYamlDocument(args.outputPath, pack);
  return pack;
}

export async function writeSourceScoutPackValidationArtifact(args: {
  sourceScoutPackPath: string;
  sourceObservationsPath: string;
  sourceSafetyLedgerPath: string;
  sourceSafetyLedgerValidationPath: string;
  targetMaterialProfileValidationPath: string;
  sourceObservationLineageIndexValidationPath?: string | null;
  outputPath: string;
}): Promise<ReconstructSourceScoutPackValidationArtifact> {
  const [
    sourceScoutPack,
    sourceObservations,
    sourceSafetyLedger,
    sourceSafetyLedgerValidation,
    targetMaterialProfileValidation,
  ] = await Promise.all([
    readYamlDocument<ReconstructSourceScoutPackArtifact>(
      args.sourceScoutPackPath,
    ),
    readYamlDocument<ReconstructSourceObservationsArtifact>(
      args.sourceObservationsPath,
    ),
    readYamlDocument<ReconstructSourceSafetyLedgerArtifact>(
      args.sourceSafetyLedgerPath,
    ),
    readYamlDocument<ReconstructSourceSafetyLedgerValidationArtifact>(
      args.sourceSafetyLedgerValidationPath,
    ),
    readYamlDocument<ReconstructTargetMaterialProfileValidationArtifact>(
      args.targetMaterialProfileValidationPath,
    ),
  ]);
  const validation = await validateSourceScoutPack({
    sourceScoutPack,
    sourceScoutPackRef: path.resolve(args.sourceScoutPackPath),
    sourceObservations,
    sourceObservationsRef: path.resolve(args.sourceObservationsPath),
    sourceSafetyLedger,
    sourceSafetyLedgerRef: path.resolve(args.sourceSafetyLedgerPath),
    sourceSafetyLedgerValidation,
    sourceSafetyLedgerValidationRef:
      path.resolve(args.sourceSafetyLedgerValidationPath),
    targetMaterialProfileValidation,
    targetMaterialProfileValidationRef:
      path.resolve(args.targetMaterialProfileValidationPath),
    sourceObservationLineageIndexValidationRef:
      args.sourceObservationLineageIndexValidationPath
        ? path.resolve(args.sourceObservationLineageIndexValidationPath)
        : null,
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}
