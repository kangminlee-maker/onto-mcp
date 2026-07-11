import type { SystemicDispatchFailureClass } from "./dispatch-breaker.js";

export type StructuredDispatchFailureEvidence = {
  descriptor_id: string;
  capability_instance_id: string;
  logical_dispatch_id: string;
  actual_adapter_request_count: number;
} & (
  | {
      failure_class: "rate_limit";
      failure_code: "http_429" | "provider_rate_limit_code";
      source: "sdk_http_status" | "sdk_error_code";
    }
  | {
      failure_class: "auth";
      failure_code: "http_401" | "http_403" | "provider_auth_code";
      source: "sdk_http_status" | "sdk_error_code";
    }
  | {
      failure_class: "transport";
      failure_code: "timeout" | "connection_failure" | "http_5xx";
      source: "sdk_exception_type" | "sdk_http_status";
    }
  | {
      failure_class: null;
      failure_code:
        | "provider_request_rejected"
        | "adapter_contract_violation"
        | "adapter_unknown";
      source: "sdk_http_status" | "sdk_error_code" | "sdk_exception_type";
    }
);

export class StructuredDispatchError extends Error {
  readonly evidence: StructuredDispatchFailureEvidence;

  constructor(
    evidence: StructuredDispatchFailureEvidence,
  ) {
    super(
      `sealed dispatch failed: ${evidence.failure_code} ` +
        `(descriptor=${evidence.descriptor_id}, logical_dispatch=${evidence.logical_dispatch_id})`,
    );
    this.name = "StructuredDispatchError";
    this.evidence = evidence;
  }
}

export function readStructuredDispatchFailureEvidence(
  error: unknown,
): StructuredDispatchFailureEvidence | null {
  return error instanceof StructuredDispatchError ? error.evidence : null;
}

export function readStructuredDispatchFailureClass(
  error: unknown,
): SystemicDispatchFailureClass | null {
  return readStructuredDispatchFailureEvidence(error)?.failure_class ?? null;
}
