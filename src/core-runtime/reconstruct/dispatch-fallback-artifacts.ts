import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { constants as fsConstants } from "node:fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";
import {
  dispatchDescriptorProjection,
  type DispatchDescriptorProjection,
} from "../llm/sealed-dispatch-capability.js";
import type { StructuredDispatchFailureEvidence } from "../llm/structured-dispatch-error.js";
import { isDispatchIncompleteArtifact } from "../llm/dispatch-breaker.js";
import { resolveDispatchFallbackAdapterCapabilities } from "../llm/dispatch-fallback-adapter-capabilities.js";
import type {
  ReconstructRecordArtifact,
  ReconstructRunControlArtifact,
  ReconstructSemanticMapCensus,
  ReconstructSemanticMapSidecar,
} from "./artifact-types.js";

const FailureEvidenceCommonShape = {
  descriptor_id: z.string().min(1),
  capability_instance_id: z.string().min(1),
  logical_dispatch_id: z.string().min(1),
  actual_adapter_request_count: z.number().int().nonnegative(),
} as const;
const failureEvidenceVariant = <T extends z.ZodRawShape>(
  failureClass: "rate_limit" | "auth" | "transport" | null,
  failureCode: StructuredDispatchFailureEvidence["failure_code"],
  source: StructuredDispatchFailureEvidence["source"],
  extraShape: T,
) => z.object({
  ...FailureEvidenceCommonShape,
  ...extraShape,
  failure_class: z.literal(failureClass),
  failure_code: z.literal(failureCode),
  source: z.literal(source),
}).strict();
const failureEvidenceSchema = <T extends z.ZodRawShape>(extraShape: T) => z.union([
  failureEvidenceVariant("rate_limit", "http_429", "sdk_http_status", extraShape),
  failureEvidenceVariant("rate_limit", "provider_rate_limit_code", "sdk_error_code", extraShape),
  failureEvidenceVariant("auth", "http_401", "sdk_http_status", extraShape),
  failureEvidenceVariant("auth", "http_403", "sdk_http_status", extraShape),
  failureEvidenceVariant("auth", "provider_auth_code", "sdk_error_code", extraShape),
  failureEvidenceVariant("transport", "timeout", "sdk_exception_type", extraShape),
  failureEvidenceVariant("transport", "connection_failure", "sdk_exception_type", extraShape),
  failureEvidenceVariant("transport", "http_5xx", "sdk_http_status", extraShape),
  failureEvidenceVariant(null, "provider_request_rejected", "sdk_http_status", extraShape),
  failureEvidenceVariant(null, "adapter_contract_violation", "sdk_exception_type", extraShape),
  failureEvidenceVariant(null, "adapter_unknown", "sdk_error_code", extraShape),
  failureEvidenceVariant(null, "adapter_unknown", "sdk_exception_type", extraShape),
]);
const FailureEvidenceSchema = failureEvidenceSchema({});

const DescriptorSchema = z
  .object({
    descriptor_id: z.string().min(1),
    model_provider: z.enum(["openai", "anthropic"]),
    model_id: z.string().min(1),
    execution_adapter: z.enum(["openai_sdk", "anthropic_sdk"]),
    protocol_version: z.enum(["openai_responses_v1", "anthropic_messages_v1"]),
    adapter_package_version: z.string().min(1),
    auth: z.literal("api_key"),
    endpoint_kind: z.literal("official_sdk"),
    service_tier: z.string().nullable(),
    reasoning_effort: z.string().nullable(),
    dispatch_role: z.enum(["semantic_map_synthesize", "semantic_map_verify"]),
  })
  .strict()
  .superRefine((descriptor, ctx) => {
    const openAI = descriptor.model_provider === "openai";
    if (
      descriptor.execution_adapter !== (openAI ? "openai_sdk" : "anthropic_sdk") ||
      descriptor.protocol_version !== (openAI ? "openai_responses_v1" : "anthropic_messages_v1") ||
      !resolveDispatchFallbackAdapterCapabilities({
        executionAdapter: descriptor.execution_adapter,
        adapterPackageVersion: descriptor.adapter_package_version,
        protocolVersion: descriptor.protocol_version,
      })
    ) {
      ctx.addIssue({ code: "custom", message: "descriptor provider/adapter/protocol/version binding is invalid" });
    }
  });

const IdPartitionSchema = z
  .object({
    planned: z.array(z.string().min(1)),
    completed: z.array(z.string().min(1)),
    dead_letter: z.array(z.string().min(1)),
    incomplete: z.array(z.string().min(1)),
  })
  .strict();
const ActivationContributorSchema = failureEvidenceSchema({
  observation_id: z.string().min(1),
  operation: z.enum(["semantic_map_synthesize", "semantic_map_verify"]),
});

export const DispatchFallbackActivationSchema = z
  .object({
    schema_version: z.literal("dispatch-fallback-activation/v1"),
    session_id: z.string().min(1),
    created_at: z.string().datetime(),
    owner_attempt_id: z.string().min(1),
    owner_lock_token_hash: z.string().min(1),
    trigger: z
      .object({
        failure_class: z.literal("rate_limit"),
        systemic_failure_threshold: z.number().int().min(1),
        contributors: z.array(ActivationContributorSchema).min(1),
      })
      .strict(),
    primary_descriptor: DescriptorSchema,
    primary_capability_instance_id: z.string().min(1),
    fallback_descriptors: z
      .object({
        synthesize: DescriptorSchema,
        verify: DescriptorSchema,
      })
      .strict(),
    partition: IdPartitionSchema,
    route_relation: z.literal("cross_provider"),
  })
  .strict()
  .superRefine((artifact, ctx) => {
    const sets = Object.values(artifact.partition);
    for (const values of sets) {
      if (new Set(values).size !== values.length) {
        ctx.addIssue({ code: "custom", message: "partition sets must contain unique ids" });
      }
    }
    const union = new Set([
      ...artifact.partition.completed,
      ...artifact.partition.dead_letter,
      ...artifact.partition.incomplete,
    ]);
    if (
      union.size !==
        artifact.partition.completed.length +
          artifact.partition.dead_letter.length +
          artifact.partition.incomplete.length ||
      union.size !== artifact.partition.planned.length ||
      artifact.partition.planned.some((id) => !union.has(id))
    ) {
      ctx.addIssue({ code: "custom", message: "planned must exactly and disjointly partition into completed/dead_letter/incomplete" });
    }
    for (const contributor of artifact.trigger.contributors) {
      if (
        contributor.failure_class !== "rate_limit" ||
        contributor.actual_adapter_request_count < 1 ||
        contributor.descriptor_id !== artifact.primary_descriptor.descriptor_id ||
        contributor.capability_instance_id !==
          artifact.primary_capability_instance_id ||
        contributor.operation !== artifact.primary_descriptor.dispatch_role ||
        !artifact.partition.incomplete.includes(contributor.observation_id)
      ) {
        ctx.addIssue({ code: "custom", message: "contributors must be counted rate-limit evidence from the expected primary operation and incomplete set" });
      }
    }
    if (
      artifact.trigger.contributors.length <
      artifact.trigger.systemic_failure_threshold
    ) {
      ctx.addIssue({ code: "custom", message: "activation contributors must meet the primary breaker threshold" });
    }
    if (
      new Set(
        artifact.trigger.contributors.map((contributor) =>
          contributor.observation_id
        ),
      ).size !== artifact.trigger.contributors.length
    ) {
      ctx.addIssue({ code: "custom", message: "activation contributors must have distinct observation ids" });
    }
    if (
      artifact.fallback_descriptors.synthesize.dispatch_role !== "semantic_map_synthesize" ||
      artifact.fallback_descriptors.verify.dispatch_role !== "semantic_map_verify" ||
      artifact.fallback_descriptors.synthesize.model_provider !==
        artifact.fallback_descriptors.verify.model_provider ||
      artifact.primary_descriptor.model_provider ===
      artifact.fallback_descriptors.synthesize.model_provider ||
      artifact.primary_descriptor.model_provider ===
      artifact.fallback_descriptors.verify.model_provider
    ) {
      ctx.addIssue({ code: "custom", message: "fallback descriptors must be a complete same-provider pair cross-provider from primary" });
    }
    for (const descriptor of [
      artifact.primary_descriptor,
      artifact.fallback_descriptors.synthesize,
      artifact.fallback_descriptors.verify,
    ]) {
      const { descriptor_id: _descriptorId, ...preimage } = descriptor;
      if (
        dispatchDescriptorProjection(preimage).descriptor_id !==
        descriptor.descriptor_id
      ) {
        ctx.addIssue({ code: "custom", message: `descriptor_id does not match its canonical preimage for ${descriptor.dispatch_role}` });
      }
    }
  });

export type DispatchFallbackActivation = z.infer<
  typeof DispatchFallbackActivationSchema
>;

const ArtifactIntegritySchema = z
  .object({ ref: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();

export const DispatchFallbackOutcomeSchema = z
  .object({
    schema_version: z.literal("dispatch-fallback-outcome/v1"),
    session_id: z.string().min(1),
    created_at: z.string().datetime(),
    owner_attempt_id: z.string().min(1),
    activation: ArtifactIntegritySchema,
    status: z.enum(["completed", "halted"]),
    partition: z
      .object({
        target_count: z.number().int().nonnegative(),
        completed_count: z.number().int().nonnegative(),
        dead_letter_count: z.number().int().nonnegative(),
        incomplete_count: z.number().int().nonnegative(),
      })
      .strict(),
    dispatch_counts: z
      .object({
        synthesize_logical: z.number().int().nonnegative(),
        verify_logical: z.number().int().nonnegative(),
        synthesize_adapter_requests: z.number().int().nonnegative(),
        verify_adapter_requests: z.number().int().nonnegative(),
      })
      .strict(),
    final_artifacts: z
      .object({
        dispatch_incomplete: ArtifactIntegritySchema,
        semantic_map_census: ArtifactIntegritySchema,
        semantic_map: ArtifactIntegritySchema,
      })
      .strict(),
    terminal_failure: FailureEvidenceSchema.nullable(),
  })
  .strict()
  .superRefine((artifact, ctx) => {
    if (
      artifact.partition.target_count !==
      artifact.partition.completed_count +
        artifact.partition.dead_letter_count +
        artifact.partition.incomplete_count
    ) {
      ctx.addIssue({ code: "custom", message: "outcome partition counts must reconcile" });
    }
    if (artifact.status === "completed" && artifact.partition.incomplete_count !== 0) {
      ctx.addIssue({ code: "custom", message: "completed outcome cannot retain incomplete items" });
    }
    if (artifact.status === "halted" && artifact.partition.incomplete_count === 0) {
      ctx.addIssue({ code: "custom", message: "halted outcome requires incomplete items" });
    }
    if (
      artifact.status === "halted" &&
      (artifact.terminal_failure === null ||
        artifact.terminal_failure.failure_class === null ||
        artifact.terminal_failure.actual_adapter_request_count < 1)
    ) {
      ctx.addIssue({ code: "custom", message: "halted outcome requires typed terminal failure evidence" });
    }
    if (artifact.status === "completed" && artifact.terminal_failure !== null) {
      ctx.addIssue({ code: "custom", message: "completed outcome cannot carry terminal failure evidence" });
    }
  });

export type DispatchFallbackOutcome = z.infer<typeof DispatchFallbackOutcomeSchema>;

function nonnegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function assertDispatchFallbackTerminalArtifactContracts(args: {
  partition: unknown;
  census: unknown;
  sidecar: unknown;
}): {
  partition: import("../llm/dispatch-breaker.js").DispatchIncompleteArtifact;
  census: ReconstructSemanticMapCensus;
  sidecar: ReconstructSemanticMapSidecar;
} {
  if (!isDispatchIncompleteArtifact(args.partition)) {
    throw new Error("dispatch fallback terminal dispatch partition is malformed.");
  }
  const census = args.census as ReconstructSemanticMapCensus | null;
  if (
    !census ||
    typeof census !== "object" ||
    census.schema_version !== "1" ||
    !Array.isArray(census.by_observation) ||
    ![
      census.observations_total,
      census.observations_map_present,
      census.observations_map_absent,
      census.synthesize_calls_total,
      census.verify_calls_total,
      census.max_synthesize_calls,
      census.max_verify_calls,
    ].every(nonnegativeSafeInteger) ||
    census.observations_total !== census.by_observation.length ||
    census.observations_total !==
      census.observations_map_present + census.observations_map_absent
  ) {
    throw new Error("dispatch fallback terminal semantic-map census is malformed.");
  }
  const observationIds = new Set<string>();
  let synthesizeCalls = 0;
  let verifyCalls = 0;
  const mapPresentIds = new Set<string>();
  for (const observation of census.by_observation) {
    if (
      !observation ||
      typeof observation.observation_id !== "string" ||
      observationIds.has(observation.observation_id) ||
      typeof observation.map_present !== "boolean" ||
      !Array.isArray(observation.columns)
    ) {
      throw new Error("dispatch fallback terminal semantic-map census observation is malformed.");
    }
    observationIds.add(observation.observation_id);
    if (observation.map_present) mapPresentIds.add(observation.observation_id);
    for (const column of observation.columns) {
      if (
        !column ||
        !nonnegativeSafeInteger(column.synthesize_calls) ||
        !nonnegativeSafeInteger(column.verify_calls)
      ) {
        throw new Error("dispatch fallback terminal semantic-map census column is malformed.");
      }
      synthesizeCalls += column.synthesize_calls;
      verifyCalls += column.verify_calls;
    }
  }
  if (
    synthesizeCalls !== census.synthesize_calls_total ||
    verifyCalls !== census.verify_calls_total ||
    mapPresentIds.size !== census.observations_map_present
  ) {
    throw new Error("dispatch fallback terminal semantic-map census totals do not reconcile.");
  }
  const sidecar = args.sidecar as ReconstructSemanticMapSidecar | null;
  if (!sidecar || sidecar.schema_version !== "1" || !Array.isArray(sidecar.observations)) {
    throw new Error("dispatch fallback terminal semantic-map sidecar is malformed.");
  }
  const sidecarIds = new Set<string>();
  for (const observation of sidecar.observations) {
    const projection = observation?.projection;
    if (
      !observation ||
      typeof observation.observation_id !== "string" ||
      sidecarIds.has(observation.observation_id) ||
      !Array.isArray(observation.node_epochs) ||
      !projection ||
      projection.authority !== "non_authoritative" ||
      projection.provisional !== true ||
      !Array.isArray(projection.nodes) ||
      !Array.isArray(projection.refuted_disclosure) ||
      !nonnegativeSafeInteger(projection.nodes_total) ||
      !nonnegativeSafeInteger(projection.refuted_disclosure_total) ||
      !nonnegativeSafeInteger(projection.unanchored_unverified_total) ||
      projection.nodes.length > projection.nodes_total ||
      projection.refuted_disclosure.length > projection.refuted_disclosure_total
    ) {
      throw new Error("dispatch fallback terminal semantic-map sidecar observation is malformed.");
    }
    sidecarIds.add(observation.observation_id);
  }
  if (
    sidecarIds.size !== mapPresentIds.size ||
    [...sidecarIds].some((id) => !mapPresentIds.has(id))
  ) {
    throw new Error("dispatch fallback terminal semantic-map sidecar does not match map-present census rows.");
  }
  return { partition: args.partition, census, sidecar };
}

export function dispatchFallbackActivationPath(sessionRoot: string): string {
  return path.join(path.resolve(sessionRoot), "dispatch-fallback-activation.yaml");
}

export function dispatchFallbackOutcomePath(sessionRoot: string): string {
  return path.join(path.resolve(sessionRoot), "dispatch-fallback-outcome.yaml");
}

async function readRegularFileIfPresent(filePath: string): Promise<string | null> {
  try {
    const stat = await fs.lstat(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`dispatch fallback artifact must be a regular direct-child file: ${filePath}`);
    }
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function readRunControlIfPresent(
  sessionRoot: string,
): Promise<ReconstructRunControlArtifact | null> {
  const raw = await readRegularFileIfPresent(
    path.join(path.resolve(sessionRoot), "reconstruct-run-control.yaml"),
  );
  return raw === null ? null : parseYaml(raw) as ReconstructRunControlArtifact;
}

function parseArtifact<T>(
  raw: string,
  schema: z.ZodType<T>,
  label: string,
): T {
  const parsed = schema.safeParse(parseYaml(raw));
  if (!parsed.success) {
    throw new Error(
      `dispatch fallback ${label} artifact is malformed: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  return parsed.data;
}

export async function readDispatchFallbackActivation(
  sessionRoot: string,
): Promise<DispatchFallbackActivation | null> {
  const raw = await readRegularFileIfPresent(dispatchFallbackActivationPath(sessionRoot));
  return raw === null
    ? null
    : parseArtifact(raw, DispatchFallbackActivationSchema, "activation");
}

export async function readDispatchFallbackOutcome(
  sessionRoot: string,
): Promise<DispatchFallbackOutcome | null> {
  const raw = await readRegularFileIfPresent(dispatchFallbackOutcomePath(sessionRoot));
  return raw === null
    ? null
    : parseArtifact(raw, DispatchFallbackOutcomeSchema, "outcome");
}

export async function assertDispatchFallbackSessionAdmission(args: {
  sessionRoot: string;
  enabled: boolean;
}): Promise<void> {
  const [activation, outcome, runControl] = await Promise.all([
    readDispatchFallbackActivation(args.sessionRoot),
    readDispatchFallbackOutcome(args.sessionRoot),
    readRunControlIfPresent(args.sessionRoot),
  ]);
  if (outcome && !activation) {
    throw new Error("dispatch fallback structural corruption: outcome exists without activation.");
  }
  if (activation) {
    const resolvedSessionRoot = await fs.realpath(args.sessionRoot);
    if (
      activation.session_id !== path.basename(resolvedSessionRoot) ||
      (outcome &&
        (outcome.session_id !== activation.session_id ||
          outcome.owner_attempt_id !== activation.owner_attempt_id))
    ) {
      throw new Error("dispatch fallback structural corruption: activation/outcome session ownership mismatch.");
    }
    if (outcome) {
      if (
        outcome.status === "halted" &&
        outcome.terminal_failure &&
        ![
          activation.fallback_descriptors.synthesize.descriptor_id,
          activation.fallback_descriptors.verify.descriptor_id,
        ].includes(outcome.terminal_failure.descriptor_id)
      ) {
        throw new Error("dispatch fallback structural corruption: terminal failure is not bound to the fallback pair.");
      }
      const activationPath = dispatchFallbackActivationPath(resolvedSessionRoot);
      const activationHash = (await artifactIntegrity(activationPath)).sha256;
      if (path.resolve(outcome.activation.ref) !== activationPath) {
        throw new Error("dispatch fallback structural corruption: outcome activation ref mismatch.");
      }
      if (outcome.activation.sha256 !== activationHash) {
        throw new Error("dispatch fallback structural corruption: outcome activation hash mismatch.");
      }
      const expectedFinalRefs = {
        dispatch_incomplete: path.join(resolvedSessionRoot, "dispatch-incomplete.yaml"),
        semantic_map_census: path.join(
          resolvedSessionRoot,
          "comprehension",
          "semantic-map-census.yaml",
        ),
        semantic_map: path.join(
          resolvedSessionRoot,
          "comprehension",
          "semantic-map.yaml",
        ),
      } as const;
      for (const key of Object.keys(expectedFinalRefs) as Array<keyof typeof expectedFinalRefs>) {
        const integrity = outcome.final_artifacts[key];
        const expectedRef = expectedFinalRefs[key];
        const actualHash = (await artifactIntegrity(expectedRef)).sha256;
        if (
          path.resolve(integrity.ref) !== expectedRef ||
          integrity.sha256 !== actualHash
        ) {
          throw new Error(`dispatch fallback structural corruption: ${key} ref/hash mismatch.`);
        }
      }
      const finalPartitionRaw = parseYaml(
        (await readRegularFileIfPresent(expectedFinalRefs.dispatch_incomplete))!,
      );
      const terminalArtifacts = assertDispatchFallbackTerminalArtifactContracts({
        partition: finalPartitionRaw,
        census: parseYaml(
          (await readRegularFileIfPresent(expectedFinalRefs.semantic_map_census))!,
        ),
        sidecar: parseYaml(
          (await readRegularFileIfPresent(expectedFinalRefs.semantic_map))!,
        ),
      });
      const finalPartition = terminalArtifacts.partition;
      if (
        finalPartition.pipeline !== "reconstruct" ||
        finalPartition.batch_label !== "semantic-map"
      ) {
        throw new Error("dispatch fallback structural corruption: final dispatch partition is malformed.");
      }
      const targetIds = new Set(activation.partition.incomplete);
      const finalDeadLetterIds = finalPartition.dead_letter.map((entry) => entry.item_id);
      const finalAllIds = [
        ...finalPartition.completed_item_ids,
        ...finalDeadLetterIds,
        ...finalPartition.incomplete_item_ids,
      ];
      const plannedIds = new Set(activation.partition.planned);
      if (
        new Set(finalAllIds).size !== finalAllIds.length ||
        new Set(finalAllIds).size !== plannedIds.size ||
        finalAllIds.some((id) => !plannedIds.has(id)) ||
        activation.partition.completed.some(
          (id) => !finalPartition.completed_item_ids.includes(id),
        ) ||
        activation.partition.dead_letter.some((id) => !finalDeadLetterIds.includes(id))
      ) {
        throw new Error("dispatch fallback structural corruption: final full partition does not preserve activation lineage.");
      }
      const completedIds = finalPartition.completed_item_ids.filter((id) => targetIds.has(id));
      const deadLetterIds = finalDeadLetterIds.filter((id) => targetIds.has(id));
      const incompleteIds = finalPartition.incomplete_item_ids.filter((id) => targetIds.has(id));
      const terminalIds = [...completedIds, ...deadLetterIds, ...incompleteIds];
      if (
        outcome.partition.target_count !== targetIds.size ||
        outcome.partition.completed_count !== completedIds.length ||
        outcome.partition.dead_letter_count !== deadLetterIds.length ||
        outcome.partition.incomplete_count !== incompleteIds.length ||
        new Set(terminalIds).size !== terminalIds.length ||
        new Set(terminalIds).size !== targetIds.size ||
        terminalIds.some((id) => !targetIds.has(id))
      ) {
        throw new Error("dispatch fallback structural corruption: outcome/final target partition mismatch.");
      }
      if (
        (outcome.status === "completed" &&
          (finalPartition.breaker.tripped ||
            finalPartition.breaker.failure_class !== null ||
            finalPartition.breaker.consecutive_item_count !== null ||
            finalPartition.incomplete_item_ids.length !== 0)) ||
        (outcome.status === "halted" &&
          (!finalPartition.breaker.tripped || incompleteIds.length === 0))
      ) {
        throw new Error("dispatch fallback structural corruption: outcome/final breaker state mismatch.");
      }
    }
    throw new Error(
      `dispatch fallback activation already consumed this session lineage; retry_with_new_session (${dispatchFallbackActivationPath(args.sessionRoot)}).`,
    );
  }
  if (!runControl) return;
  assertDispatchFallbackRunControlHasNoLiveOwner({
    runControl,
    enabled: args.enabled,
  });
}

export function assertDispatchFallbackRunControlHasNoLiveOwner(args: {
  runControl: ReconstructRunControlArtifact;
  enabled: boolean;
}): void {
  if (!args.enabled) return;
  const runningAttemptIds = new Set(
    args.runControl.attempt_rows
      .filter((row) => row.attempt_status === "running")
      .map((row) => row.attempt_id),
  );
  const hasLiveOwner = args.runControl.lock_rows.some(
    (row) =>
      row.lock_scope === "session_root" &&
      row.lock_status === "held" &&
      runningAttemptIds.has(row.owner_attempt_id),
  );
  if (hasLiveOwner) {
    throw new Error(
      "dispatch fallback enabled session has a running attempt holding the session lock; lease expiry is not takeover authority, retry_with_new_session.",
    );
  }
}

export function assertDispatchFallbackAttemptOwner(args: {
  runControl: ReconstructRunControlArtifact;
  attemptId: string;
  lockTokenHash: string;
  requireInitial: boolean;
}): void {
  const attempt = args.runControl.attempt_rows.find((row) => row.attempt_id === args.attemptId);
  if (
    !attempt ||
    attempt.attempt_status !== "running" ||
    (args.requireInitial &&
      (attempt.attempt_kind !== "initial" || attempt.parent_attempt_id !== null))
  ) {
    throw new Error(`dispatch fallback attempt ${args.attemptId} is not the eligible running owner.`);
  }
  const lock = args.runControl.lock_rows.find(
    (row) =>
      row.lock_scope === "session_root" &&
      row.owner_attempt_id === args.attemptId &&
      row.lock_status === "held",
  );
  if (!lock || lock.lock_token_hash !== args.lockTokenHash) {
    throw new Error(`dispatch fallback attempt ${args.attemptId} does not own the expected held lock.`);
  }
}

async function assertPinnedSessionRoot(sessionRoot: string): Promise<string> {
  await fs.mkdir(sessionRoot, { recursive: true });
  const stat = await fs.lstat(sessionRoot);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`dispatch fallback session root must be a real directory: ${sessionRoot}`);
  }
  return fs.realpath(sessionRoot);
}

async function fsyncDirectory(directory: string): Promise<void> {
  const handle = await fs.open(directory, fsConstants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writeTempFile(directory: string, finalName: string, contents: string): Promise<string> {
  const tempPath = path.join(directory, `.${finalName}.${process.pid}.${crypto.randomUUID()}.tmp`);
  const handle = await fs.open(
    tempPath,
    fsConstants.O_CREAT |
      fsConstants.O_EXCL |
      fsConstants.O_WRONLY |
      fsConstants.O_NOFOLLOW,
    0o600,
  );
  try {
    await handle.writeFile(contents, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  return tempPath;
}

async function secureCreateOnceYaml<T>(args: {
  sessionRoot: string;
  fileName: string;
  artifact: T;
  schema: z.ZodType<T>;
}): Promise<{ path: string; sha256: string }> {
  const parsed = args.schema.parse(args.artifact);
  const realRoot = await assertPinnedSessionRoot(args.sessionRoot);
  const finalPath = path.join(realRoot, args.fileName);
  const contents = stringifyYaml(parsed);
  const tempPath = await writeTempFile(realRoot, args.fileName, contents);
  try {
    await fs.link(tempPath, finalPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`dispatch fallback create-once artifact already exists: ${finalPath}`);
    }
    throw error;
  } finally {
    await fs.rm(tempPath, { force: true });
  }
  await fsyncDirectory(realRoot);
  return { path: finalPath, sha256: sha256Text(contents) };
}

export async function publishDispatchFallbackActivation(
  sessionRoot: string,
  artifact: DispatchFallbackActivation,
): Promise<{ path: string; sha256: string }> {
  return secureCreateOnceYaml({
    sessionRoot,
    fileName: "dispatch-fallback-activation.yaml",
    artifact,
    schema: DispatchFallbackActivationSchema,
  });
}

export async function publishDispatchFallbackOutcome(
  sessionRoot: string,
  artifact: DispatchFallbackOutcome,
): Promise<{ path: string; sha256: string }> {
  return secureCreateOnceYaml({
    sessionRoot,
    fileName: "dispatch-fallback-outcome.yaml",
    artifact,
    schema: DispatchFallbackOutcomeSchema,
  });
}

export async function securePublishDispatchFallbackYaml(args: {
  sessionRoot: string;
  relativePath: "dispatch-incomplete.yaml" | "comprehension/semantic-map-census.yaml" | "comprehension/semantic-map.yaml";
  value: unknown;
}): Promise<{ path: string; sha256: string }> {
  const realRoot = await assertPinnedSessionRoot(args.sessionRoot);
  const finalPath = path.resolve(realRoot, args.relativePath);
  if (path.relative(realRoot, finalPath).startsWith("..")) {
    throw new Error(`dispatch fallback publication escapes the pinned session root: ${args.relativePath}`);
  }
  const parent = path.dirname(finalPath);
  await fs.mkdir(parent, { recursive: true });
  const parentStat = await fs.lstat(parent);
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) {
    throw new Error(`dispatch fallback publication parent must be a real directory: ${parent}`);
  }
  const realParent = await fs.realpath(parent);
  if (
    path.resolve(realParent) !== path.resolve(parent) ||
    path.relative(realRoot, realParent).startsWith("..")
  ) {
    throw new Error(`dispatch fallback publication parent escapes the pinned session root: ${realParent}`);
  }
  const contents = stringifyYaml(args.value);
  const tempPath = await writeTempFile(realParent, path.basename(finalPath), contents);
  try {
    const existing = await fs.lstat(finalPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (existing && (!existing.isFile() || existing.isSymbolicLink())) {
      throw new Error(`dispatch fallback refuses to replace a non-regular artifact: ${finalPath}`);
    }
    await fs.rename(tempPath, finalPath);
    const [published, parentAfter] = await Promise.all([
      fs.lstat(finalPath),
      fs.lstat(parent),
    ]);
    if (
      !published.isFile() ||
      published.isSymbolicLink() ||
      !parentAfter.isDirectory() ||
      parentAfter.isSymbolicLink() ||
      parentAfter.dev !== parentStat.dev ||
      parentAfter.ino !== parentStat.ino
    ) {
      throw new Error(`dispatch fallback publication identity changed during commit: ${finalPath}`);
    }
    await fsyncDirectory(realParent);
  } catch (error) {
    await fs.rm(tempPath, { force: true });
    throw error;
  }
  return { path: finalPath, sha256: sha256Text(contents) };
}

export function sha256Text(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export async function artifactIntegrity(filePath: string): Promise<{ ref: string; sha256: string }> {
  const realRef = await fs.realpath(filePath);
  const bytes = await fs.readFile(realRef);
  return {
    ref: realRef,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
}

export function projectDispatchFallbackRecordBlock(args: {
  outcome: DispatchFallbackOutcome;
  outcomeIntegrity: { path: string; sha256: string };
}): NonNullable<ReconstructRecordArtifact["dispatch_fallback"]> {
  const outcome = DispatchFallbackOutcomeSchema.parse(args.outcome);
  if (outcome.status !== "completed") {
    throw new Error("only a completed dispatch fallback outcome may enter the reconstruct record.");
  }
  return {
    outcome_ref: path.resolve(args.outcomeIntegrity.path),
    outcome_sha256: args.outcomeIntegrity.sha256,
    activation_sha256: outcome.activation.sha256,
    owner_attempt_id: outcome.owner_attempt_id,
    trigger_code: "rate_limit",
    route_relation: "cross_provider",
    target_count: outcome.partition.target_count,
    completed_count: outcome.partition.completed_count,
    dead_letter_count: outcome.partition.dead_letter_count,
    incomplete_count: outcome.partition.incomplete_count,
    synthesize_logical_dispatch_count:
      outcome.dispatch_counts.synthesize_logical,
    verify_logical_dispatch_count: outcome.dispatch_counts.verify_logical,
    synthesize_adapter_request_count:
      outcome.dispatch_counts.synthesize_adapter_requests,
    verify_adapter_request_count:
      outcome.dispatch_counts.verify_adapter_requests,
    outcome: "completed",
  };
}

export type DispatchFallbackDescriptor = DispatchDescriptorProjection;
export type DispatchFallbackFailureEvidence = StructuredDispatchFailureEvidence;
