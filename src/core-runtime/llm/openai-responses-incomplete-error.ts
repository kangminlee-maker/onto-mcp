export const OPENAI_RESPONSES_MAX_OUTPUT_TOKENS_FAILURE_CODE =
  "openai_responses_max_output_tokens" as const;

export interface OpenAIResponsesIncompleteEvidence {
  failure_code: typeof OPENAI_RESPONSES_MAX_OUTPUT_TOKENS_FAILURE_CODE;
  provider_status: "incomplete";
  incomplete_reason: "max_output_tokens";
  base_output_ceiling_tokens: number;
  configured_output_headroom_tokens: number;
  effective_max_output_tokens: number;
  input_tokens: number | null;
  cached_input_tokens: number | null;
  output_tokens: number | null;
  reasoning_tokens: number | null;
  non_reasoning_output_tokens: number | null;
  partial_output_chars: number;
  partial_output_sha256: string;
  provider_model: string;
  provider_response_id: string | null;
  provider_request_id: string | null;
  effective_base_url: string;
  sdk_max_retries: number;
  actual_adapter_request_count: null;
  request_count_observability: "unavailable";
}

export class OpenAIResponsesIncompleteError extends Error {
  readonly evidence: OpenAIResponsesIncompleteEvidence;

  constructor(evidence: OpenAIResponsesIncompleteEvidence) {
    super(
      `openai response not completed (status=${evidence.provider_status}: ` +
        `${evidence.incomplete_reason}) at max_output_tokens=` +
        `${evidence.effective_max_output_tokens}`,
    );
    this.name = "OpenAIResponsesIncompleteError";
    this.evidence = evidence;
  }
}

export function readOpenAIResponsesIncompleteEvidence(
  error: unknown,
): OpenAIResponsesIncompleteEvidence | null {
  return error instanceof OpenAIResponsesIncompleteError
    ? error.evidence
    : null;
}

export function resolveOpenAIResponsesOutputBudget(args: {
  baseOutputTokens: number;
  headroomTokens?: number;
  modelMaxOutputTokens?: number;
}): {
  baseOutputTokens: number;
  headroomTokens: number;
  effectiveMaxOutputTokens: number;
} {
  if (args.headroomTokens === undefined) {
    return {
      baseOutputTokens: args.baseOutputTokens,
      headroomTokens: 0,
      effectiveMaxOutputTokens: args.baseOutputTokens,
    };
  }
  if (!Number.isSafeInteger(args.headroomTokens) || args.headroomTokens <= 0) {
    throw new Error(
      "openai Responses output headroom must be a positive safe integer.",
    );
  }
  if (
    args.modelMaxOutputTokens === undefined ||
    !Number.isSafeInteger(args.modelMaxOutputTokens) ||
    args.modelMaxOutputTokens <= 0
  ) {
    throw new Error(
      "openai Responses output headroom requires a positive model max_output_tokens capability.",
    );
  }
  const effective = args.baseOutputTokens + args.headroomTokens;
  if (!Number.isSafeInteger(effective)) {
    throw new Error("openai Responses effective max_output_tokens is not a safe integer.");
  }
  if (effective > args.modelMaxOutputTokens) {
    throw new Error(
      `openai Responses effective max_output_tokens=${effective} exceeds ` +
        `model max_output_tokens=${args.modelMaxOutputTokens}.`,
    );
  }
  return {
    baseOutputTokens: args.baseOutputTokens,
    headroomTokens: args.headroomTokens,
    effectiveMaxOutputTokens: effective,
  };
}
