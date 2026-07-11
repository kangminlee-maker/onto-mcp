import crypto from "node:crypto";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";
import {
  RECONSTRUCT_STAGE_IDS,
  type ReconstructStageId,
} from "./artifact-types.js";
import {
  OPENAI_RESPONSES_MAX_OUTPUT_TOKENS_FAILURE_CODE,
  type OpenAIResponsesIncompleteEvidence,
} from "../llm/openai-responses-incomplete-error.js";

export const RECONSTRUCT_LLM_DISPATCH_FAILURE_SCHEMA_VERSION =
  "reconstruct-llm-dispatch-failure/v1" as const;
export const RECONSTRUCT_LLM_DISPATCH_FAILURE_DIR =
  "llm-dispatch-failures" as const;

const ReconstructLlmCallKindSchema = z.enum([
  "initial",
  "parse_repair",
  "semantic_repair",
  "timeout_recovery",
]);

export type ReconstructLlmCallKind = z.infer<typeof ReconstructLlmCallKindSchema>;

const NullableTokenCountSchema = z.number().int().nonnegative().nullable();

export const ReconstructLlmDispatchFailureArtifactSchema = z
  .object({
    schema_version: z.literal(RECONSTRUCT_LLM_DISPATCH_FAILURE_SCHEMA_VERSION),
    failure_id: z.string().regex(/^llm-failure:[a-f0-9]{20}$/),
    session_id: z.string().min(1),
    created_at: z.string().min(1),
    owner_attempt_id: z.string().min(1),
    unit_id: z.enum(RECONSTRUCT_STAGE_IDS),
    artifact_name: z.string().min(1),
    call_kind: ReconstructLlmCallKindSchema,
    failure_code: z.literal(OPENAI_RESPONSES_MAX_OUTPUT_TOKENS_FAILURE_CODE),
    provider_status: z.literal("incomplete"),
    incomplete_reason: z.literal("max_output_tokens"),
    base_output_ceiling_tokens: z.number().int().positive(),
    configured_output_headroom_tokens: z.number().int().nonnegative(),
    effective_max_output_tokens: z.number().int().positive(),
    input_tokens: NullableTokenCountSchema,
    cached_input_tokens: NullableTokenCountSchema,
    output_tokens: NullableTokenCountSchema,
    reasoning_tokens: NullableTokenCountSchema,
    non_reasoning_output_tokens: NullableTokenCountSchema,
    partial_output_chars: z.number().int().nonnegative(),
    partial_output_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    provider_model: z.string().min(1),
    provider_response_id: z.string().min(1).nullable(),
    provider_request_id: z.string().min(1).nullable(),
    effective_base_url: z.string().min(1),
    runtime_logical_call_count: z.literal(1),
    runtime_incomplete_retry_count: z.literal(0),
    sdk_max_retries: z.number().int().nonnegative(),
    actual_adapter_request_count: z.null(),
    request_count_observability: z.literal("unavailable"),
  })
  .strict();

export type ReconstructLlmDispatchFailureArtifact = z.infer<
  typeof ReconstructLlmDispatchFailureArtifactSchema
>;

export interface ReconstructLlmDispatchFailureSummary {
  failure_code: typeof OPENAI_RESPONSES_MAX_OUTPUT_TOKENS_FAILURE_CODE;
  unit_id: ReconstructStageId;
  artifact_name: string;
  provider_status: string;
  incomplete_reason: "max_output_tokens";
  base_output_ceiling_tokens: number;
  configured_output_headroom_tokens: number;
  effective_max_output_tokens: number;
  input_tokens: number | null;
  cached_input_tokens: number | null;
  output_tokens: number | null;
  reasoning_tokens: number | null;
  non_reasoning_output_tokens: number | null;
  actual_adapter_request_count: null;
  request_count_observability: "unavailable";
  failure_artifact_ref: string;
}

export class ReconstructLlmDispatchFailureError extends Error {
  readonly unitId: ReconstructStageId;
  readonly artifactName: string;
  readonly callKind: ReconstructLlmCallKind;
  readonly evidence: OpenAIResponsesIncompleteEvidence;

  constructor(args: {
    unitId: ReconstructStageId;
    artifactName: string;
    callKind: ReconstructLlmCallKind;
    evidence: OpenAIResponsesIncompleteEvidence;
    cause: unknown;
  }) {
    super(
      `reconstruct LLM dispatch failed for ${args.artifactName}: ` +
        args.evidence.failure_code,
      { cause: args.cause },
    );
    this.name = "ReconstructLlmDispatchFailureError";
    this.unitId = args.unitId;
    this.artifactName = args.artifactName;
    this.callKind = args.callKind;
    this.evidence = args.evidence;
  }
}

export function readReconstructLlmDispatchFailureError(
  error: unknown,
): ReconstructLlmDispatchFailureError | null {
  return error instanceof ReconstructLlmDispatchFailureError ? error : null;
}

function sha256(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function createReconstructLlmDispatchFailureArtifact(args: {
  sessionId: string;
  attemptId: string;
  error: ReconstructLlmDispatchFailureError;
  createdAt?: string;
}): ReconstructLlmDispatchFailureArtifact {
  const failureId = `llm-failure:${sha256([
    args.sessionId,
    args.attemptId,
    args.error.unitId,
    args.error.artifactName,
    args.error.callKind,
    args.error.evidence.provider_response_id ?? "no-response-id",
  ].join(":")).slice(0, 20)}`;
  return ReconstructLlmDispatchFailureArtifactSchema.parse({
    schema_version: RECONSTRUCT_LLM_DISPATCH_FAILURE_SCHEMA_VERSION,
    failure_id: failureId,
    session_id: args.sessionId,
    created_at: args.createdAt ?? new Date().toISOString(),
    owner_attempt_id: args.attemptId,
    unit_id: args.error.unitId,
    artifact_name: args.error.artifactName,
    call_kind: args.error.callKind,
    ...args.error.evidence,
    runtime_logical_call_count: 1,
    runtime_incomplete_retry_count: 0,
  });
}

function failureFileName(failureId: string): string {
  if (!/^llm-failure:[a-f0-9]{20}$/.test(failureId)) {
    throw new Error(`invalid reconstruct LLM dispatch failure id: ${failureId}`);
  }
  return `${failureId.replace(/^llm-failure:/, "failure-")}.yaml`;
}

export function reconstructLlmDispatchFailurePath(
  sessionRoot: string,
  failureId: string,
): string {
  return path.join(
    path.resolve(sessionRoot),
    RECONSTRUCT_LLM_DISPATCH_FAILURE_DIR,
    failureFileName(failureId),
  );
}

export function isReconstructLlmDispatchFailureRef(
  sessionRoot: string,
  artifactRef: string,
): boolean {
  const root = path.resolve(sessionRoot, RECONSTRUCT_LLM_DISPATCH_FAILURE_DIR);
  const resolved = path.resolve(artifactRef);
  return path.dirname(resolved) === root &&
    path.basename(resolved).startsWith("failure-") &&
    path.extname(resolved) === ".yaml";
}

export function isReconstructLlmDispatchFailureTempRef(
  sessionRoot: string,
  artifactRef: string,
): boolean {
  const root = path.resolve(sessionRoot, RECONSTRUCT_LLM_DISPATCH_FAILURE_DIR);
  const resolved = path.resolve(artifactRef);
  return path.dirname(resolved) === root &&
    path.basename(resolved).startsWith(".pending-") &&
    path.extname(resolved) === ".yaml";
}

async function fsyncDirectory(dirPath: string): Promise<void> {
  const handle = await fs.open(dirPath, fsConstants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function assertReconstructLlmDispatchFailureDirectory(
  sessionRoot: string,
): Promise<string> {
  const lexicalRoot = path.resolve(sessionRoot);
  const rootStat = await fs.lstat(lexicalRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error(`reconstruct session root is not a real directory: ${lexicalRoot}`);
  }
  const realRoot = await fs.realpath(lexicalRoot);
  const dirPath = path.join(lexicalRoot, RECONSTRUCT_LLM_DISPATCH_FAILURE_DIR);
  let created = false;
  try {
    await fs.mkdir(dirPath);
    created = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const stat = await fs.lstat(dirPath);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`LLM dispatch failure directory is not a real directory: ${dirPath}`);
  }
  const realDir = await fs.realpath(dirPath);
  if (path.dirname(realDir) !== realRoot) {
    throw new Error(`LLM dispatch failure directory escapes session root: ${realDir}`);
  }
  if (created) await fsyncDirectory(lexicalRoot);
  return dirPath;
}

export interface ReconstructLlmDispatchFailureWritePlan {
  tempRef: string;
  finalRef: string;
  contentSha256: string;
}

export async function planReconstructLlmDispatchFailureWrite(args: {
  sessionRoot: string;
  artifact: ReconstructLlmDispatchFailureArtifact;
}): Promise<ReconstructLlmDispatchFailureWritePlan> {
  const artifact = ReconstructLlmDispatchFailureArtifactSchema.parse(args.artifact);
  const dirPath = await assertReconstructLlmDispatchFailureDirectory(
    args.sessionRoot,
  );
  const contents = stringifyYaml(artifact);
  const contentSha256 = sha256(contents);
  return {
    finalRef: path.join(dirPath, failureFileName(artifact.failure_id)),
    tempRef: path.join(
      dirPath,
      `.pending-${contentSha256.slice(0, 16)}-${crypto.randomUUID()}.yaml`,
    ),
    contentSha256,
  };
}

export async function writeReconstructLlmDispatchFailureTemp(args: {
  sessionRoot: string;
  artifact: ReconstructLlmDispatchFailureArtifact;
  plan?: ReconstructLlmDispatchFailureWritePlan;
}): Promise<ReconstructLlmDispatchFailureWritePlan> {
  const artifact = ReconstructLlmDispatchFailureArtifactSchema.parse(args.artifact);
  const dirPath = await assertReconstructLlmDispatchFailureDirectory(
    args.sessionRoot,
  );
  const contents = stringifyYaml(artifact);
  const contentSha256 = sha256(contents);
  const plan = args.plan ?? await planReconstructLlmDispatchFailureWrite(args);
  if (
    plan.contentSha256 !== contentSha256 ||
    plan.finalRef !== path.join(dirPath, failureFileName(artifact.failure_id)) ||
    !isReconstructLlmDispatchFailureTempRef(args.sessionRoot, plan.tempRef)
  ) {
    throw new Error("LLM dispatch failure write plan does not match artifact bytes");
  }
  const scratchRef = path.join(
    dirPath,
    `.scratch-${contentSha256.slice(0, 16)}-${crypto.randomUUID()}.yaml`,
  );
  const handle = await fs.open(
    scratchRef,
    fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW,
    0o600,
  );
  try {
    await handle.writeFile(contents, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(scratchRef, plan.tempRef);
  await fsyncDirectory(dirPath);
  return plan;
}

export async function publishReconstructLlmDispatchFailureTemp(args: {
  sessionRoot: string;
  tempRef: string;
  finalRef: string;
}): Promise<void> {
  const dirPath = await assertReconstructLlmDispatchFailureDirectory(
    args.sessionRoot,
  );
  if (
    !isReconstructLlmDispatchFailureTempRef(args.sessionRoot, args.tempRef) ||
    !isReconstructLlmDispatchFailureRef(args.sessionRoot, args.finalRef) ||
    path.dirname(path.resolve(args.tempRef)) !== dirPath ||
    path.dirname(path.resolve(args.finalRef)) !== dirPath
  ) {
    throw new Error("LLM dispatch failure publish refs must stay inside the failure directory");
  }
  try {
    await fs.link(args.tempRef, args.finalRef);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EEXIST") {
      if (code !== "ENOENT") throw error;
      const finalStat = await fs.lstat(args.finalRef).catch(() => null);
      if (!finalStat?.isFile() || finalStat.isSymbolicLink()) throw error;
    }
  }
  await fs.rm(args.tempRef, { force: true });
  await fsyncDirectory(dirPath);
}

async function readFailureBytesNoFollow(artifactRef: string): Promise<Buffer> {
  const handle = await fs.open(
    artifactRef,
    fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
  );
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) {
      throw new Error(`LLM dispatch failure artifact is not a regular file: ${artifactRef}`);
    }
    return await handle.readFile();
  } finally {
    await handle.close();
  }
}

function parseFailureBytes(bytes: Buffer): ReconstructLlmDispatchFailureArtifact {
  return ReconstructLlmDispatchFailureArtifactSchema.parse(
    parseYaml(bytes.toString("utf8")),
  );
}

export async function readReconstructLlmDispatchFailureArtifactWithHash(args: {
  sessionRoot: string;
  artifactRef: string;
  allowTemp?: boolean;
}): Promise<{ artifact: ReconstructLlmDispatchFailureArtifact; sha256: string }> {
  await assertReconstructLlmDispatchFailureDirectory(args.sessionRoot);
  if (
    !isReconstructLlmDispatchFailureRef(args.sessionRoot, args.artifactRef) &&
    !(args.allowTemp === true &&
      isReconstructLlmDispatchFailureTempRef(args.sessionRoot, args.artifactRef))
  ) {
    throw new Error(
      `LLM dispatch failure artifact ref escapes failure directory: ${args.artifactRef}`,
    );
  }
  const bytes = await readFailureBytesNoFollow(args.artifactRef);
  return {
    artifact: parseFailureBytes(bytes),
    sha256: sha256(bytes),
  };
}

export async function readReconstructLlmDispatchFailureArtifact(
  artifactRef: string,
): Promise<ReconstructLlmDispatchFailureArtifact> {
  return parseFailureBytes(await readFailureBytesNoFollow(artifactRef));
}

export async function sha256ReconstructLlmDispatchFailureArtifact(
  artifactRef: string,
): Promise<string> {
  return sha256(await readFailureBytesNoFollow(artifactRef));
}

export function projectReconstructLlmDispatchFailureSummary(
  artifact: ReconstructLlmDispatchFailureArtifact,
  artifactRef: string,
): ReconstructLlmDispatchFailureSummary {
  return {
    failure_code: artifact.failure_code,
    unit_id: artifact.unit_id,
    artifact_name: artifact.artifact_name,
    provider_status: artifact.provider_status,
    incomplete_reason: artifact.incomplete_reason,
    base_output_ceiling_tokens: artifact.base_output_ceiling_tokens,
    configured_output_headroom_tokens:
      artifact.configured_output_headroom_tokens,
    effective_max_output_tokens: artifact.effective_max_output_tokens,
    input_tokens: artifact.input_tokens,
    cached_input_tokens: artifact.cached_input_tokens,
    output_tokens: artifact.output_tokens,
    reasoning_tokens: artifact.reasoning_tokens,
    non_reasoning_output_tokens: artifact.non_reasoning_output_tokens,
    actual_adapter_request_count: artifact.actual_adapter_request_count,
    request_count_observability: artifact.request_count_observability,
    failure_artifact_ref: artifactRef,
  };
}
