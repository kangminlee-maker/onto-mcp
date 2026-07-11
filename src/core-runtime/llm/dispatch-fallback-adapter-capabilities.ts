import type { LlmExecutionAdapter } from "./model-switcher.js";

export type DispatchFallbackProtocolVersion =
  | "openai_responses_v1"
  | "anthropic_messages_v1";

export interface DispatchAdapterCapabilities {
  structured_failure_evidence: boolean;
  counted_adapter_requests: boolean;
  sdk_retry_zero: boolean;
  invoke_once: boolean;
}

interface DispatchFallbackAdapterCapabilityRow {
  execution_adapter: LlmExecutionAdapter;
  adapter_package_version: string;
  protocol_version: DispatchFallbackProtocolVersion;
  endpoint_kind: "official_sdk";
  capabilities: DispatchAdapterCapabilities;
}

const CAPABILITY_ROWS: readonly DispatchFallbackAdapterCapabilityRow[] = [
  {
    execution_adapter: "openai_sdk",
    adapter_package_version: "6.39.0",
    protocol_version: "openai_responses_v1",
    endpoint_kind: "official_sdk",
    capabilities: {
      structured_failure_evidence: true,
      counted_adapter_requests: true,
      sdk_retry_zero: true,
      invoke_once: true,
    },
  },
  {
    execution_adapter: "anthropic_sdk",
    adapter_package_version: "0.99.0",
    protocol_version: "anthropic_messages_v1",
    endpoint_kind: "official_sdk",
    capabilities: {
      structured_failure_evidence: true,
      counted_adapter_requests: true,
      sdk_retry_zero: true,
      invoke_once: true,
    },
  },
] as const;

export function resolveDispatchFallbackAdapterCapabilities(args: {
  executionAdapter: LlmExecutionAdapter;
  adapterPackageVersion: string;
  protocolVersion: DispatchFallbackProtocolVersion;
}): DispatchAdapterCapabilities | null {
  const row = CAPABILITY_ROWS.find(
    (candidate) =>
      candidate.execution_adapter === args.executionAdapter &&
      candidate.adapter_package_version === args.adapterPackageVersion &&
      candidate.protocol_version === args.protocolVersion &&
      candidate.endpoint_kind === "official_sdk",
  );
  return row ? { ...row.capabilities } : null;
}
