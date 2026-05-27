import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type {
  ReconstructDirectiveValidationViolation,
  ReconstructSourceObservationDirectiveArtifact,
  ReconstructSourceObservationDirectiveSelection,
  ReconstructSourceObservationDirectiveValidationArtifact,
  ReconstructSourceObservationsArtifact,
} from "./artifact-types.js";
import type { ReconstructSourceObservation } from "./source-observations.js";

export interface ValidateSourceObservationDirectiveParams {
  directive: ReconstructSourceObservationDirectiveArtifact;
  sourceObservations: ReconstructSourceObservationsArtifact;
  directiveRef?: string | null;
  sourceObservationsRef?: string | null;
}

function isoNow(): string {
  return new Date().toISOString();
}

function normalizeRef(ref: string): string {
  return path.resolve(ref);
}

function violation(args: {
  code: ReconstructDirectiveValidationViolation["code"];
  message: string;
  observationId?: string | null;
}): ReconstructDirectiveValidationViolation {
  return {
    code: args.code,
    message: args.message,
    observation_id: args.observationId ?? null,
  };
}

function validateSelectionAgainstObservation(args: {
  selection: ReconstructSourceObservationDirectiveSelection;
  observation: ReconstructSourceObservation | undefined;
}): ReconstructDirectiveValidationViolation[] {
  const violations: ReconstructDirectiveValidationViolation[] = [];
  const { selection, observation } = args;
  if (!observation) {
    violations.push(violation({
      code: "unknown_observation_ref",
      message: `selected observation does not exist: ${selection.observation_id}`,
      observationId: selection.observation_id,
    }));
    return violations;
  }

  if (selection.target_material_kind !== observation.target_material_kind) {
    violations.push(violation({
      code: "material_kind_mismatch",
      message:
        `selected material kind ${selection.target_material_kind} does not match observation material kind ${observation.target_material_kind}`,
      observationId: selection.observation_id,
    }));
  }
  if (normalizeRef(selection.source_ref) !== normalizeRef(observation.source_ref)) {
    violations.push(violation({
      code: "source_ref_mismatch",
      message: "selected source_ref does not match observation source_ref",
      observationId: selection.observation_id,
    }));
  }
  if (selection.location !== observation.location) {
    violations.push(violation({
      code: "location_mismatch",
      message: "selected location does not match observation location",
      observationId: selection.observation_id,
    }));
  }
  if (selection.selection_rationale.trim().length === 0) {
    violations.push(violation({
      code: "selection_rationale_missing",
      message: "selection_rationale is required for every selected observation",
      observationId: selection.observation_id,
    }));
  }
  return violations;
}

export function validateSourceObservationDirective(
  params: ValidateSourceObservationDirectiveParams,
): ReconstructSourceObservationDirectiveValidationArtifact {
  const violations: ReconstructDirectiveValidationViolation[] = [];
  const { directive, sourceObservations } = params;

  if (directive.session_id !== sourceObservations.session_id) {
    violations.push(violation({
      code: "session_id_mismatch",
      message:
        `directive session_id ${directive.session_id} does not match source observations session_id ${sourceObservations.session_id}`,
    }));
  }

  if (directive.selected_observations.length === 0) {
    violations.push(violation({
      code: "empty_selection",
      message: "selected_observations must not be empty",
    }));
  }

  const observationsById = new Map(
    sourceObservations.observations.map((observation) => [
      observation.observation_id,
      observation,
    ]),
  );
  const selectedIds = new Set<string>();
  for (const selection of directive.selected_observations) {
    if (selectedIds.has(selection.observation_id)) {
      violations.push(violation({
        code: "duplicate_observation_ref",
        message: `selected observation is duplicated: ${selection.observation_id}`,
        observationId: selection.observation_id,
      }));
      continue;
    }
    selectedIds.add(selection.observation_id);
    violations.push(
      ...validateSelectionAgainstObservation({
        selection,
        observation: observationsById.get(selection.observation_id),
      }),
    );
  }

  return {
    schema_version: "1",
    session_id: directive.session_id,
    created_at: isoNow(),
    directive_ref: params.directiveRef ?? null,
    source_observations_ref: params.sourceObservationsRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    selected_observation_count: directive.selected_observations.length,
    validation_results: violations.length === 0
      ? ["source_observation_directive_valid"]
      : ["source_observation_directive_invalid"],
    violations,
  };
}

export async function writeSourceObservationDirectiveValidationArtifact(args: {
  directivePath: string;
  sourceObservationsPath: string;
  outputPath: string;
}): Promise<ReconstructSourceObservationDirectiveValidationArtifact> {
  const [directiveText, sourceObservationsText] = await Promise.all([
    fs.readFile(args.directivePath, "utf8"),
    fs.readFile(args.sourceObservationsPath, "utf8"),
  ]);
  const directive = parseYaml(directiveText) as ReconstructSourceObservationDirectiveArtifact;
  const sourceObservations = parseYaml(sourceObservationsText) as ReconstructSourceObservationsArtifact;
  const validation = validateSourceObservationDirective({
    directive,
    sourceObservations,
    directiveRef: path.resolve(args.directivePath),
    sourceObservationsRef: path.resolve(args.sourceObservationsPath),
  });
  await fs.mkdir(path.dirname(args.outputPath), { recursive: true });
  await fs.writeFile(args.outputPath, stringifyYaml(validation), "utf8");
  return validation;
}
