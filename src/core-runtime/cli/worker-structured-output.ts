import fs from "node:fs/promises";
import path from "node:path";
import {
  createLensSidecarSubmissionTools,
  type LensSidecarSubmissionState,
} from "./lens-sidecar-tools.js";
import {
  createRuntimeSubmitTools,
  isRuntimeSubmitOutputFormat,
  type RuntimeSubmitOutputFormat,
  type RuntimeSubmitState,
} from "./structured-output-tools.js";
import { parseRuntimeSubmitContextForOutputFormat } from "./runtime-submit-context.js";
import { writeYamlDocument } from "../review/review-artifact-utils.js";
import { writeValidatedLensSidecarArtifact } from "../review/lens-sidecar-artifact.js";

/**
 * Shared structured-output plumbing for external OAuth worker executors
 * (Codex CLI and Claude Code). The worker brand owns process spawning and its
 * own CLI flags; everything in this module is brand-neutral: prompt shaping,
 * JSON-Schema derivation from the submit tool, payload coercion, and bridging a
 * validated payload through the canonical submit contract into a YAML artifact.
 */

export type StructuredOutputFormat = "lens-sidecar" | RuntimeSubmitOutputFormat;
export type OutputFormat = "markdown" | StructuredOutputFormat;

export type WorkerStructuredOutputState =
  | {
      outputFormat: "lens-sidecar";
      submitToolName: "submit_lens_findings";
      lensSidecarState: LensSidecarSubmissionState;
    }
  | {
      outputFormat: RuntimeSubmitOutputFormat;
      submitToolName: string;
      runtimeSubmitState: RuntimeSubmitState;
    };

export function requireString(
  value: string | boolean | undefined,
  optionName: string,
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required option --${optionName}`);
  }
  return value;
}

export function parseOutputFormat(raw: unknown): OutputFormat {
  if (raw === undefined || raw === "" || raw === "markdown") return "markdown";
  if (typeof raw === "string" && isRuntimeSubmitOutputFormat(raw)) return raw;
  if (raw === "lens-sidecar") return raw;
  throw new Error(
    `Invalid --output-format value for review worker: ${String(raw)} (expected markdown | lens-sidecar | issue-artifact | issue-stance-response | issue-deliberation-response | deliberation-resolution | issue-synthesis-response)`,
  );
}

export function submitToolNameForOutputFormat(
  outputFormat: StructuredOutputFormat,
): string {
  if (outputFormat === "lens-sidecar") return "submit_lens_findings";
  switch (outputFormat) {
    case "issue-artifact":
      return "submit_issue_artifact";
    case "issue-stance-response":
      return "submit_issue_stance_response";
    case "issue-deliberation-response":
      return "submit_issue_deliberation_response";
    case "deliberation-resolution":
      return "submit_deliberation_resolution";
    case "issue-synthesis-response":
      return "submit_issue_synthesis_response";
  }
}

export function buildStructuredOutputPrompt(args: {
  packetPath: string;
  packetText: string;
  outputPath: string;
  unitId: string;
  unitKind: string;
  outputFormat: StructuredOutputFormat;
}): string {
  const submitToolName = submitToolNameForOutputFormat(args.outputFormat);
  return `You are executing one bounded review structured-output unit as a ContextIsolatedReasoningUnit.

Unit id: ${args.unitId}
Unit kind: ${args.unitKind}
Output format: ${args.outputFormat}
Authoritative prompt packet path: ${args.packetPath}
Canonical YAML output path: ${args.outputPath}

Rules:
- Treat the prompt packet below as the authoritative contract.
- Treat the Boundary Policy and Effective Boundary State in the packet as hard constraints.
- Read the files referenced by the prompt packet when needed.
- Stay within the smallest sufficient file set implied by the packet.
- Do not recursively follow reference chains beyond the files explicitly listed in the packet unless the packet requires it.
- Do not use web research when the packet says web research is denied.
- Do not read outside the allowed filesystem scope described in the packet.
- Do not modify repository files yourself.
- Produce only one JSON object matching the provided output schema.
- The JSON object is the argument payload for ${submitToolName}.
- Do not wrap the JSON object in markdown or code fences.
- Do not include runtime-owned envelope fields such as schema_version, session_id, lens_id, issue_id, or validation unless the output schema explicitly requires them.
- The runtime will validate the JSON object through the submit contract and write the canonical YAML artifact.
- If the packet asks you to preserve disagreement or uncertainty, preserve it explicitly in the structured fields.
- If you cannot complete the task within the declared boundary, encode the limitation as insufficient access or insufficient evidence within boundary instead of broadening the search.

Authoritative prompt packet follows:

${args.packetText}
`;
}

export function buildBoundedPrompt(
  packetPath: string,
  packetText: string,
  outputPath: string,
  unitId: string,
  unitKind: string,
  outputFormat: OutputFormat,
): string {
  if (outputFormat !== "markdown") {
    return buildStructuredOutputPrompt({
      packetPath,
      packetText,
      outputPath,
      unitId,
      unitKind,
      outputFormat,
    });
  }
  return `You are executing a single bounded review unit as a ContextIsolatedReasoningUnit.

Unit id: ${unitId}
Unit kind: ${unitKind}
Authoritative prompt packet path: ${packetPath}
Canonical output path: ${outputPath}

Rules:
- Treat the prompt packet below as the authoritative contract.
- Treat the Boundary Policy and Effective Boundary State in the packet as hard constraints.
- Read the files referenced by the prompt packet when needed.
- Stay within the smallest sufficient file set implied by the packet.
- Do not recursively follow reference chains beyond the files explicitly listed in the packet unless the packet requires it.
- Do not use web research when the packet says web research is denied.
- Do not read outside the allowed filesystem scope described in the packet.
- Produce only the final markdown content for the canonical output path.
- Do not wrap the answer in code fences.
- Do not add commentary before or after the markdown.
- Do not modify repository files yourself.
- Do not change the required output structure from the packet.
- If the packet asks you to preserve disagreement or uncertainty, preserve it explicitly.
- If you cannot complete the task within the declared boundary, preserve that limitation explicitly as insufficient access or insufficient evidence within boundary instead of broadening the search.

Authoritative prompt packet follows:

${packetText}
`;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

/**
 * Normalize a JSON Schema into the strict shape external workers require: every
 * object's properties become `required`, and homogeneous `anyOf` object rows are
 * collapsed to a single provider-compatible object. Runtime submit validation
 * remains the authority for issue-specific allowed sets.
 */
export function toWorkerStructuredOutputSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map((item) => toWorkerStructuredOutputSchema(item));
  }
  if (!schema || typeof schema !== "object") {
    return schema;
  }
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    normalized[key] = toWorkerStructuredOutputSchema(value);
  }
  const collapsedAnyOf = collapseHomogeneousAnyOf(normalized);
  if (collapsedAnyOf) return collapsedAnyOf;
  const properties = normalized.properties;
  if (properties && typeof properties === "object" && !Array.isArray(properties)) {
    normalized.required = Object.keys(properties);
  }
  return normalized;
}

function collapseHomogeneousAnyOf(
  schema: Record<string, unknown>,
): Record<string, unknown> | null {
  const variants = schema.anyOf;
  if (!Array.isArray(variants) || variants.length === 0) return null;
  const records = variants.filter(
    (variant): variant is Record<string, unknown> =>
      !!variant && typeof variant === "object" && !Array.isArray(variant),
  );
  if (records.length !== variants.length) return null;
  if (!records.every((record) => record.type === "object")) return null;
  const propertySets = records.map((record) =>
    record.properties &&
    typeof record.properties === "object" &&
    !Array.isArray(record.properties)
      ? Object.keys(record.properties).sort()
      : null,
  );
  const firstSet = propertySets[0];
  if (!firstSet) return null;
  if (
    !propertySets.every(
      (set) =>
        !!set &&
        set.length === firstSet.length &&
        set.every((key, index) => key === firstSet[index]),
    )
  ) {
    return null;
  }
  const mergedProperties: Record<string, unknown> = {};
  for (const key of firstSet) {
    const merged = mergeHomogeneousProperty(
      records.map((record) => (record.properties as Record<string, unknown>)[key]),
    );
    if (merged === null) return null;
    mergedProperties[key] = merged;
  }
  const collapsed: Record<string, unknown> = {
    type: "object",
    additionalProperties: records.every(
      (record) => record.additionalProperties === false,
    )
      ? false
      : schema.additionalProperties,
    properties: mergedProperties,
    required: Object.keys(mergedProperties),
  };
  if (typeof schema.description === "string") {
    collapsed.description = schema.description;
  }
  return collapsed;
}

function mergeHomogeneousProperty(values: unknown[]): unknown | null {
  const records = values.filter(
    (value): value is Record<string, unknown> =>
      !!value && typeof value === "object" && !Array.isArray(value),
  );
  if (records.length !== values.length) return sameJson(values) ? values[0] : null;
  const first = records[0];
  if (!first) return null;
  const comparable = records.map(
    ({ enum: _enum, description: _description, ...rest }) => rest,
  );
  if (sameJson(comparable)) {
    const enumValues = records.flatMap((record) =>
      Array.isArray(record.enum) ? record.enum : [],
    );
    const base = {
      ...comparable[0],
      ...(typeof first.description === "string"
        ? { description: first.description }
        : {}),
    };
    if (enumValues.length > 0) {
      return {
        ...base,
        enum: Array.from(
          new Set(enumValues.map((value) => JSON.stringify(value))),
        ).map((value) => JSON.parse(value)),
      };
    }
    return base;
  }
  return sameJson(records) ? first : null;
}

function sameJson(values: unknown[]): boolean {
  if (values.length === 0) return true;
  const first = JSON.stringify(values[0]);
  return values.every((value) => JSON.stringify(value) === first);
}

/**
 * Build the submit-tool JSON Schema and the submission state for an output
 * format, without writing any file. Codex writes this to disk for its
 * `--output-schema` flag; Claude Code embeds it in the prompt instead.
 */
export function buildWorkerSubmitSchema(args: {
  outputFormat: StructuredOutputFormat;
  unitId: string;
  sessionId: string;
  rawPacketText: string;
  humanOutputRef?: string | null;
}): { schema: unknown; state: WorkerStructuredOutputState } {
  return args.outputFormat === "lens-sidecar"
      ? (() => {
          const lensSidecarState: LensSidecarSubmissionState = {
            sessionId: args.sessionId,
            lensId: args.unitId,
            humanOutputRef: args.humanOutputRef ?? null,
          };
          const [submitTool] = createLensSidecarSubmissionTools(lensSidecarState);
          if (!submitTool) {
            throw new Error("No lens sidecar submit tool for worker structured output.");
          }
          return {
            state: {
              outputFormat: "lens-sidecar" as const,
              submitToolName: "submit_lens_findings" as const,
              lensSidecarState,
            },
            schema: toWorkerStructuredOutputSchema(submitTool.input_schema),
          };
        })()
      : (() => {
          const runtimeSubmitState: RuntimeSubmitState = {
            sessionId: args.sessionId,
            unitId: args.unitId,
            outputFormat: args.outputFormat,
            ...parseRuntimeSubmitContextForOutputFormat({
              rawPacketText: args.rawPacketText,
              unitId: args.unitId,
              outputFormat: args.outputFormat,
            }),
          };
          const [submitTool] = createRuntimeSubmitTools(runtimeSubmitState);
          if (!submitTool) {
            throw new Error(
              `No runtime submit tool for output format ${args.outputFormat}.`,
            );
          }
          return {
            state: {
              outputFormat: args.outputFormat,
              submitToolName: submitTool.name,
              runtimeSubmitState,
            },
            schema: toWorkerStructuredOutputSchema(submitTool.input_schema),
          };
        })();
}

/**
 * Build the submit schema and write it to `<rawOutputPath>.schema.json` for
 * workers that consume a schema file on disk (Codex `--output-schema`).
 */
export async function writeOutputSchemaFile(args: {
  rawOutputPath: string;
  outputFormat: StructuredOutputFormat;
  unitId: string;
  sessionId: string;
  rawPacketText: string;
  humanOutputRef?: string | null;
}): Promise<{
  schemaPath: string;
  state: WorkerStructuredOutputState;
}> {
  const { schema, state } = buildWorkerSubmitSchema({
    outputFormat: args.outputFormat,
    unitId: args.unitId,
    sessionId: args.sessionId,
    rawPacketText: args.rawPacketText,
    humanOutputRef: args.humanOutputRef ?? null,
  });
  const schemaPath = `${args.rawOutputPath}.schema.json`;
  await fs.mkdir(path.dirname(args.rawOutputPath), { recursive: true });
  await fs.writeFile(
    schemaPath,
    `${JSON.stringify(schema, null, 2)}\n`,
    "utf8",
  );
  return { schemaPath, state };
}

export function stripWrappingCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/);
  return match ? match[1]!.trim() : trimmed;
}

/**
 * Parse and validate a worker's raw structured output text into a submit-tool
 * payload object. Rejects the legacy `payload_json` wrapper. The raw text may be
 * fenced; it is unwrapped first.
 */
export function coerceStructuredPayload(
  rawText: string,
  label: string,
): Record<string, unknown> {
  const raw = stripWrappingCodeFence(rawText);
  try {
    const payload = requireRecord(JSON.parse(raw), label);
    if (Object.prototype.hasOwnProperty.call(payload, "payload_json")) {
      throw new Error(
        "payload_json wrapper is no longer accepted; structured output must be the submit payload object.",
      );
    }
    return payload;
  } catch (error) {
    throw new Error(
      `Failed to parse worker structured output JSON: ${label}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

export async function writeRuntimeSubmitArtifactFromPayload(args: {
  payload: Record<string, unknown>;
  outputPath: string;
  state: RuntimeSubmitState;
}): Promise<number> {
  const [submitTool] = createRuntimeSubmitTools(args.state);
  if (!submitTool) {
    throw new Error(`No runtime submit tool for output format ${args.state.outputFormat}.`);
  }
  await submitTool.execute(args.payload, {
    projectRoot: "",
    ontoHome: "",
  });
  if (args.state.artifact === undefined) {
    throw new Error(
      `${args.state.outputFormat} mode completed without ${submitTool.name} for unit ${args.state.unitId}.`,
    );
  }
  await writeYamlDocument(args.outputPath, args.state.artifact);
  return Object.keys(args.payload).length;
}

export async function writeLensSidecarArtifactFromPayload(args: {
  payload: Record<string, unknown>;
  outputPath: string;
  state: LensSidecarSubmissionState;
}): Promise<number> {
  const [submitTool] = createLensSidecarSubmissionTools(args.state);
  if (!submitTool) {
    throw new Error("No lens sidecar submit tool for worker structured output.");
  }
  await submitTool.execute(args.payload, {
    projectRoot: "",
    ontoHome: "",
  });
  if (args.state.artifact === undefined) {
    throw new Error(
      `lens-sidecar mode completed without ${submitTool.name} for unit ${args.state.lensId}.`,
    );
  }
  await writeValidatedLensSidecarArtifact({
    sidecarPath: args.outputPath,
    artifact: args.state.artifact,
    sessionId: args.state.sessionId,
    lensId: args.state.lensId,
    ...(args.state.humanOutputRef !== undefined
      ? { expectedHumanOutputRef: args.state.humanOutputRef }
      : {}),
  });
  return Object.keys(args.payload).length;
}
