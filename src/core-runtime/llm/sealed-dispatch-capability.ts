import crypto from "node:crypto";
import { VERSION as ANTHROPIC_SDK_VERSION } from "@anthropic-ai/sdk/version";
import { VERSION as OPENAI_SDK_VERSION } from "openai/version";
import type { LlmCallResult } from "./llm-caller.js";
import {
  normalizeLlmModelSwitcher,
  type LlmAuthMode,
  type LlmExecutionAdapter,
  type LlmModelSwitcherConfig,
  type LlmProviderName,
  type NormalizedLlmSelection,
} from "./model-switcher.js";
import {
  resolveDispatchFallbackAdapterCapabilities,
  type DispatchAdapterCapabilities,
  type DispatchFallbackProtocolVersion,
} from "./dispatch-fallback-adapter-capabilities.js";
import {
  StructuredDispatchError,
  type StructuredDispatchFailureEvidence,
} from "./structured-dispatch-error.js";
import {
  assertReasoningEffortAccepted,
  loadModelReasoningEffortRegistry,
} from "../discovery/model-reasoning-efforts.js";

export type SemanticMapDispatchOperation =
  | "semantic_map_synthesize"
  | "semantic_map_verify";

export interface DispatchDescriptorPreimage {
  model_provider: LlmProviderName;
  model_id: string;
  execution_adapter: LlmExecutionAdapter;
  protocol_version: DispatchFallbackProtocolVersion;
  adapter_package_version: string;
  auth: LlmAuthMode;
  endpoint_kind: "official_sdk";
  service_tier: string | null;
  reasoning_effort: string | null;
  dispatch_role: SemanticMapDispatchOperation;
}

export interface DispatchDescriptorProjection extends DispatchDescriptorPreimage {
  descriptor_id: string;
}

export interface LlmPayloadInput {
  system_prompt: string;
  user_prompt: string;
  max_tokens: number;
  logical_dispatch_id?: string;
}

export interface CountedLlmCallResult {
  result: LlmCallResult;
  logical_dispatch_id: string;
  actual_adapter_request_count: number;
}

export interface ResolvedLlmDispatchCapability {
  selection: NormalizedLlmSelection;
  public_descriptor: DispatchDescriptorProjection & {
    model_provider: "openai" | "anthropic";
    execution_adapter: "openai_sdk" | "anthropic_sdk";
    auth: Extract<LlmAuthMode, "api_key">;
  };
  capabilities: DispatchAdapterCapabilities;
  capability_instance_id: string;
  invokeOnce(input: LlmPayloadInput): Promise<CountedLlmCallResult>;
}

export interface SemanticMapDispatchAccountingEntry {
  observation_id: string;
  execution_source: "primary" | "fallback";
  operation: SemanticMapDispatchOperation;
  disposition: "succeeded" | "failed";
  descriptor_id: string;
  capability_instance_id: string;
  logical_dispatch_id: string;
  actual_adapter_request_count: number;
  failure_class: "rate_limit" | "auth" | "transport" | null;
}

export class SemanticMapDispatchAccounting {
  readonly #entries: SemanticMapDispatchAccountingEntry[] = [];

  record(entry: SemanticMapDispatchAccountingEntry): void {
    if (
      !Number.isSafeInteger(entry.actual_adapter_request_count) ||
      entry.actual_adapter_request_count < 0
    ) {
      throw new Error("semantic-map dispatch accounting requires a non-negative adapter request count.");
    }
    const existing = this.#entries.find(
      (candidate) => candidate.logical_dispatch_id === entry.logical_dispatch_id,
    );
    if (existing) {
      if (
        existing.observation_id !== entry.observation_id ||
        existing.execution_source !== entry.execution_source ||
        existing.operation !== entry.operation ||
        existing.descriptor_id !== entry.descriptor_id ||
        existing.capability_instance_id !== entry.capability_instance_id
      ) {
        throw new Error(
          `semantic-map dispatch accounting logical_dispatch_id ${entry.logical_dispatch_id} changed identity.`,
        );
      }
      existing.actual_adapter_request_count += entry.actual_adapter_request_count;
      existing.disposition = entry.disposition;
      existing.failure_class = entry.failure_class;
      return;
    }
    this.#entries.push(structuredClone(entry));
  }

  entries(): readonly SemanticMapDispatchAccountingEntry[] {
    return this.#entries.map((entry) => structuredClone(entry));
  }
}

const OFFICIAL_BASE_URLS = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
} as const;

const ROUTE_AFFECTING_ENV = {
  openai: [
    "OPENAI_ADMIN_KEY",
    "OPENAI_API_VERSION",
    "OPENAI_BASE_URL",
    "OPENAI_CUSTOM_HEADERS",
    "OPENAI_ENDPOINT",
    "OPENAI_LOG",
    "OPENAI_ORG_ID",
    "OPENAI_PROJECT_ID",
    "OPENAI_WEBHOOK_SECRET",
  ],
  anthropic: [
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_CONFIG_DIR",
    "ANTHROPIC_CUSTOM_HEADERS",
    "ANTHROPIC_ENVIRONMENT_ID",
    "ANTHROPIC_ENVIRONMENT_KEY",
    "ANTHROPIC_FEDERATION_RULE_ID",
    "ANTHROPIC_IDENTITY_TOKEN",
    "ANTHROPIC_IDENTITY_TOKEN_FILE",
    "ANTHROPIC_LOG",
    "ANTHROPIC_ORGANIZATION_ID",
    "ANTHROPIC_PROFILE",
    "ANTHROPIC_SCOPE",
    "ANTHROPIC_SERVICE_ACCOUNT_ID",
    "ANTHROPIC_SESSION_ID",
    "ANTHROPIC_WEBHOOK_SIGNING_KEY",
    "ANTHROPIC_WORKSPACE_ID",
    "ANTHROPIC_WORK_ID",
  ],
} as const;

// Accepted efforts are NOT a per-provider constant: the same model takes a
// different vocabulary through a CLI worker than through the SDK, because the
// CLI maps its own values onto the API enum before dispatch (measured — see
// .onto/authority/model-reasoning-efforts.yaml). The set this replaced was wrong
// in both directions here: it accepted `minimal`, which the gpt-5.6 deployments
// reject with a 400, and refused `max`, which they accept. The authority is keyed
// on (execution_adapter, provider, model) and each entry cites its source.

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`;
}

export function dispatchDescriptorProjection(
  preimage: DispatchDescriptorPreimage,
): DispatchDescriptorProjection {
  return {
    ...preimage,
    descriptor_id: crypto.createHash("sha256").update(canonicalJson(preimage)).digest("hex"),
  };
}

function assertSealedEnvironment(provider: "openai" | "anthropic"): void {
  const present = ROUTE_AFFECTING_ENV[provider].filter((name) => process.env[name] !== undefined);
  if (present.length > 0) {
    throw new Error(
      `dispatch fallback sealed ${provider} route rejects route-affecting ambient environment: ${present.join(", ")}.`,
    );
  }
}

function readCapturedCredential(envName: string): string {
  const credential = process.env[envName];
  if (typeof credential !== "string" || credential.trim().length === 0) {
    throw new Error(`dispatch fallback credential environment ${envName} is missing or empty.`);
  }
  return credential;
}

function errorMetadata(error: unknown): { status: number | null; code: string | null; name: string } {
  type ErrorMetadataRecord = {
        status?: unknown;
        code?: unknown;
        name?: unknown;
        constructor?: { name?: unknown };
        error?: { code?: unknown; type?: unknown };
      };
  const record: ErrorMetadataRecord =
    error !== null && typeof error === "object"
      ? error as ErrorMetadataRecord
      : {};
  const nestedCode = record.error?.code ?? record.error?.type;
  return {
    status: typeof record.status === "number" ? record.status : null,
    code: typeof record.code === "string"
      ? record.code
      : typeof nestedCode === "string" ? nestedCode : null,
    name:
      typeof record.constructor?.name === "string" &&
        record.constructor.name !== "Error"
        ? record.constructor.name
        : typeof record.name === "string"
          ? record.name
          : "UnknownError",
  };
}

function structuredEvidence(args: {
  error: unknown;
  descriptorId: string;
  capabilityInstanceId: string;
  logicalDispatchId: string;
  adapterRequestCount: number;
}): StructuredDispatchFailureEvidence {
  const common = {
    descriptor_id: args.descriptorId,
    capability_instance_id: args.capabilityInstanceId,
    logical_dispatch_id: args.logicalDispatchId,
    actual_adapter_request_count: args.adapterRequestCount,
  };
  const metadata = errorMetadata(args.error);
  if (metadata.status === 429) {
    return { ...common, failure_class: "rate_limit", failure_code: "http_429", source: "sdk_http_status" };
  }
  if (metadata.code === "rate_limit_error" || metadata.code === "rate_limit_exceeded") {
    return { ...common, failure_class: "rate_limit", failure_code: "provider_rate_limit_code", source: "sdk_error_code" };
  }
  if (metadata.status === 401 || metadata.status === 403) {
    return {
      ...common,
      failure_class: "auth",
      failure_code: metadata.status === 401 ? "http_401" : "http_403",
      source: "sdk_http_status",
    };
  }
  if (metadata.code === "authentication_error" || metadata.code === "invalid_api_key") {
    return { ...common, failure_class: "auth", failure_code: "provider_auth_code", source: "sdk_error_code" };
  }
  if (metadata.status !== null && metadata.status >= 500) {
    return { ...common, failure_class: "transport", failure_code: "http_5xx", source: "sdk_http_status" };
  }
  if (metadata.name.includes("Timeout")) {
    return { ...common, failure_class: "transport", failure_code: "timeout", source: "sdk_exception_type" };
  }
  if (metadata.name.includes("Connection")) {
    return { ...common, failure_class: "transport", failure_code: "connection_failure", source: "sdk_exception_type" };
  }
  if (metadata.status !== null && metadata.status >= 400 && metadata.status < 500) {
    return { ...common, failure_class: null, failure_code: "provider_request_rejected", source: "sdk_http_status" };
  }
  if (metadata.code !== null) {
    return { ...common, failure_class: null, failure_code: "adapter_unknown", source: "sdk_error_code" };
  }
  return { ...common, failure_class: null, failure_code: "adapter_unknown", source: "sdk_exception_type" };
}

function noOpLogger(): Record<string, (...args: unknown[]) => void> {
  const noOp = (): void => undefined;
  return { debug: noOp, info: noOp, warn: noOp, error: noOp };
}

export async function createSealedDispatchCapability(args: {
  llm: LlmModelSwitcherConfig;
  operation: SemanticMapDispatchOperation;
}): Promise<ResolvedLlmDispatchCapability> {
  const selection = normalizeLlmModelSwitcher(args.llm);
  if (!selection || selection.execution_route !== "direct_model_call" || selection.auth !== "api_key") {
    throw new Error("dispatch fallback requires an explicit api_key direct-model selection.");
  }
  if (selection.model_provider !== "openai" && selection.model_provider !== "anthropic") {
    throw new Error(`dispatch fallback has no sealed official SDK route for ${selection.model_provider}.`);
  }
  if (selection.base_url !== undefined) {
    throw new Error("dispatch fallback rejects custom base_url; only the official SDK endpoint is supported.");
  }
  if (!selection.model_id || !selection.api_key_env || !selection.reasoning_effort) {
    throw new Error("dispatch fallback requires model, api_key_env, and effort in settings.");
  }
  assertReasoningEffortAccepted({
    registry: loadModelReasoningEffortRegistry(),
    lookup: {
      executionAdapter: selection.execution_adapter,
      provider: selection.model_provider,
      model: selection.model_id,
    },
    effort: selection.reasoning_effort,
    context: "dispatch fallback",
  });
  assertSealedEnvironment(selection.model_provider);
  const credential = readCapturedCredential(selection.api_key_env);
  const modelId = selection.model_id;
  const reasoningEffort = selection.reasoning_effort;
  const sealedSelection = Object.freeze({ ...selection });
  const isOpenAI = selection.model_provider === "openai";
  const protocolVersion: DispatchFallbackProtocolVersion = isOpenAI
    ? "openai_responses_v1"
    : "anthropic_messages_v1";
  const adapterPackageVersion = isOpenAI ? OPENAI_SDK_VERSION : ANTHROPIC_SDK_VERSION;
  const resolvedCapabilities = resolveDispatchFallbackAdapterCapabilities({
    executionAdapter: selection.execution_adapter,
    adapterPackageVersion,
    protocolVersion,
  });
  if (!resolvedCapabilities) {
    throw new Error(
      `dispatch fallback adapter capability is not registered for ${selection.execution_adapter}@${adapterPackageVersion}/${protocolVersion}.`,
    );
  }
  const capabilities = Object.freeze({ ...resolvedCapabilities });
  const capabilityInstanceId = crypto.randomUUID();
  const descriptor = Object.freeze(dispatchDescriptorProjection({
    model_provider: selection.model_provider,
    model_id: selection.model_id,
    execution_adapter: selection.execution_adapter,
    protocol_version: protocolVersion,
    adapter_package_version: adapterPackageVersion,
    auth: selection.auth,
    endpoint_kind: "official_sdk",
    service_tier: selection.service_tier ?? null,
    reasoning_effort: selection.reasoning_effort,
    dispatch_role: args.operation,
  }) as ResolvedLlmDispatchCapability["public_descriptor"]);
  let totalAdapterRequests = 0;
  const sealedFetch = globalThis.fetch.bind(globalThis);
  const countedFetch: typeof fetch = async (input, init) => {
    totalAdapterRequests += 1;
    return sealedFetch(input, init);
  };
  const openAIClient = isOpenAI
    ? new (await import("openai")).default({
        apiKey: credential,
        adminAPIKey: null,
        organization: null,
        project: null,
        webhookSecret: null,
        baseURL: OFFICIAL_BASE_URLS.openai,
        maxRetries: 0,
        fetch: countedFetch,
        logLevel: "off",
        logger: noOpLogger() as never,
      })
    : null;
  const anthropicClient = !isOpenAI
    ? new (await import("@anthropic-ai/sdk")).default({
        apiKey: credential,
        authToken: null,
        credentials: null,
        config: null,
        profile: null,
        webhookKey: null,
        baseURL: OFFICIAL_BASE_URLS.anthropic,
        maxRetries: 0,
        fetch: countedFetch,
        logLevel: "off",
        logger: noOpLogger() as never,
      })
    : null;

  return {
    selection: sealedSelection,
    public_descriptor: descriptor,
    capabilities,
    capability_instance_id: capabilityInstanceId,
    async invokeOnce(input): Promise<CountedLlmCallResult> {
      if (!Number.isSafeInteger(input.max_tokens) || input.max_tokens < 1) {
        throw new Error("sealed dispatch max_tokens must be a positive safe integer.");
      }
      const logicalDispatchId = input.logical_dispatch_id ?? crypto.randomUUID();
      const requestCountBefore = totalAdapterRequests;
      try {
        let result: LlmCallResult;
        if (openAIClient) {
          const response = await openAIClient.responses.create({
            model: modelId,
            instructions: input.system_prompt,
            input: input.user_prompt,
            max_output_tokens: input.max_tokens,
            store: false,
            reasoning: { effort: reasoningEffort as never },
          });
          if (response.status !== "completed") {
            throw new StructuredDispatchError({
              descriptor_id: descriptor.descriptor_id,
              capability_instance_id: capabilityInstanceId,
              logical_dispatch_id: logicalDispatchId,
              actual_adapter_request_count: totalAdapterRequests - requestCountBefore,
              failure_class: null,
              failure_code: "adapter_contract_violation",
              source: "sdk_exception_type",
            });
          }
          result = {
            text: response.output_text ?? "",
            input_tokens: response.usage?.input_tokens ?? 0,
            output_tokens: response.usage?.output_tokens ?? 0,
            model_id: modelId,
            effective_base_url: OFFICIAL_BASE_URLS.openai,
            declared_billing_mode: "per_token",
          };
        } else {
          const response = await anthropicClient!.messages.create({
            model: modelId,
            max_tokens: input.max_tokens,
            system: input.system_prompt,
            messages: [{ role: "user", content: input.user_prompt }],
            thinking: { type: "adaptive" },
            output_config: { effort: reasoningEffort as never },
          });
          result = {
            text: response.content
              .filter((block) => block.type === "text")
              .map((block) => block.text)
              .join("\n"),
            input_tokens: response.usage.input_tokens,
            output_tokens: response.usage.output_tokens,
            model_id: modelId,
            effective_base_url: OFFICIAL_BASE_URLS.anthropic,
            declared_billing_mode: "per_token",
          };
        }
        const actualAdapterRequestCount = totalAdapterRequests - requestCountBefore;
        if (actualAdapterRequestCount !== 1) {
          throw new StructuredDispatchError({
            descriptor_id: descriptor.descriptor_id,
            capability_instance_id: capabilityInstanceId,
            logical_dispatch_id: logicalDispatchId,
            actual_adapter_request_count: actualAdapterRequestCount,
            failure_class: null,
            failure_code: "adapter_contract_violation",
            source: "sdk_exception_type",
          });
        }
        return {
          result,
          logical_dispatch_id: logicalDispatchId,
          actual_adapter_request_count: actualAdapterRequestCount,
        };
      } catch (error) {
        if (error instanceof StructuredDispatchError) throw error;
        const count = totalAdapterRequests - requestCountBefore;
        if (count !== 1) {
          throw new StructuredDispatchError({
            descriptor_id: descriptor.descriptor_id,
            capability_instance_id: capabilityInstanceId,
            logical_dispatch_id: logicalDispatchId,
            actual_adapter_request_count: count,
            failure_class: null,
            failure_code: "adapter_contract_violation",
            source: "sdk_exception_type",
          });
        }
        throw new StructuredDispatchError(structuredEvidence({
          error,
          descriptorId: descriptor.descriptor_id,
          capabilityInstanceId,
          logicalDispatchId,
          adapterRequestCount: count,
        }));
      }
    },
  };
}
