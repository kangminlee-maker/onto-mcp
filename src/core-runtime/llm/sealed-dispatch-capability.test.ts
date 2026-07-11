import { afterEach, describe, expect, it, vi } from "vitest";
import { inspect } from "node:util";
import {
  createSealedDispatchCapability,
  SemanticMapDispatchAccounting,
} from "./sealed-dispatch-capability.js";
import {
  readStructuredDispatchFailureEvidence,
  StructuredDispatchError,
} from "./structured-dispatch-error.js";
import {
  classifyDispatchError,
  DispatchBreakerTrippedError,
} from "./dispatch-breaker.js";

const originalFetch = globalThis.fetch;
const envSnapshot = { ...process.env };

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of Object.keys(process.env)) {
    if (!(key in envSnapshot)) delete process.env[key];
  }
  Object.assign(process.env, envSnapshot);
  vi.restoreAllMocks();
});

describe("sealed dispatch capability", () => {
  it("turns an SDK 429 into counted structured evidence without leaking raw cause", async () => {
    process.env.TEST_OPENAI_KEY = "test-only";
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: {
            message: "secret provider diagnostic",
            type: "rate_limit_error",
            code: "rate_limit_exceeded",
          },
        }),
        { status: 429, headers: { "content-type": "application/json" } },
      )
    ) as typeof fetch;
    const capability = await createSealedDispatchCapability({
      llm: {
        provider: "openai",
        auth: "api_key",
        model: "test-model",
        effort: "medium",
        api_key_env: "TEST_OPENAI_KEY",
      },
      operation: "semantic_map_synthesize",
    });

    const error = await capability.invokeOnce({
      system_prompt: "system",
      user_prompt: "user",
      max_tokens: 100,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(StructuredDispatchError);
    const evidence = readStructuredDispatchFailureEvidence(error);
    expect(evidence).toMatchObject({
      failure_class: "rate_limit",
      failure_code: "http_429",
      source: "sdk_http_status",
      actual_adapter_request_count: 1,
      descriptor_id: capability.public_descriptor.descriptor_id,
      capability_instance_id: capability.capability_instance_id,
    });
    expect(classifyDispatchError(error)).toBe("rate_limit");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(error)).not.toContain("secret provider diagnostic");
    expect(Object.keys(error as object)).not.toContain("cause");
    expect(inspect(error)).not.toContain("secret provider diagnostic");
    expect((error as Error & { cause?: unknown }).cause).toBeUndefined();
  });

  it("keeps descriptor identity stable while capability instances remain run-local", async () => {
    process.env.TEST_OPENAI_KEY = "test-only";
    const args = {
      llm: {
        provider: "openai" as const,
        auth: "api_key" as const,
        model: "test-model",
        effort: "medium",
        api_key_env: "TEST_OPENAI_KEY",
      },
      operation: "semantic_map_verify" as const,
    };
    const first = await createSealedDispatchCapability(args);
    const second = await createSealedDispatchCapability(args);
    expect(first.public_descriptor.descriptor_id).toBe(
      second.public_descriptor.descriptor_id,
    );
    expect(first.capability_instance_id).not.toBe(second.capability_instance_id);
  });

  it("classifies an SDK-wrapped fetch failure as counted transport evidence", async () => {
    process.env.TEST_OPENAI_KEY = "test-only";
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError("private network diagnostic");
    }) as typeof fetch;
    const capability = await createSealedDispatchCapability({
      llm: {
        provider: "openai",
        auth: "api_key",
        model: "test-model",
        effort: "medium",
        api_key_env: "TEST_OPENAI_KEY",
      },
      operation: "semantic_map_verify",
    });
    const error = await capability.invokeOnce({
      system_prompt: "system",
      user_prompt: "user",
      max_tokens: 100,
    }).catch((caught: unknown) => caught);
    expect(readStructuredDispatchFailureEvidence(error)).toMatchObject({
      failure_class: "transport",
      failure_code: "connection_failure",
      source: "sdk_exception_type",
      actual_adapter_request_count: 1,
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(error)).not.toContain("private network diagnostic");
  });

  it.each([
    {
      provider: "openai" as const,
      keyEnv: "TEST_OPENAI_KEY",
      response: {
        object: "response",
        status: "completed",
        model: "test-model",
        output: [{
          type: "message",
          content: [{ type: "output_text", text: '{"ok":true}' }],
        }],
        usage: { input_tokens: 3, output_tokens: 2 },
      },
    },
    {
      provider: "anthropic" as const,
      keyEnv: "TEST_ANTHROPIC_KEY",
      response: {
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "test-model",
        content: [{ type: "text", text: '{"ok":true}' }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 3, output_tokens: 2 },
      },
    },
  ])("returns one counted successful $provider SDK response", async ({
    provider,
    keyEnv,
    response,
  }) => {
    process.env[keyEnv] = "test-only";
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    ) as typeof fetch;
    const capability = await createSealedDispatchCapability({
      llm: {
        provider,
        auth: "api_key",
        model: "test-model",
        effort: "medium",
        api_key_env: keyEnv,
      },
      operation: "semantic_map_synthesize",
    });
    const counted = await capability.invokeOnce({
      system_prompt: "system",
      user_prompt: "user",
      max_tokens: 100,
    });
    expect(counted.result.text).toBe('{"ok":true}');
    expect(counted.actual_adapter_request_count).toBe(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects route-affecting ambient SDK configuration before any request", async () => {
    process.env.TEST_OPENAI_KEY = "test-only";
    process.env.OPENAI_BASE_URL = "https://example.invalid";
    globalThis.fetch = vi.fn() as typeof fetch;
    await expect(
      createSealedDispatchCapability({
        llm: {
          provider: "openai",
          auth: "api_key",
          model: "test-model",
          effort: "medium",
          api_key_env: "TEST_OPENAI_KEY",
        },
        operation: "semantic_map_synthesize",
      }),
    ).rejects.toThrow("OPENAI_BASE_URL");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("keeps the fetch implementation sealed after capability creation", async () => {
    process.env.TEST_OPENAI_KEY = "test-only";
    const sealedFetch = vi.fn(async () =>
      new Response(JSON.stringify({
        object: "response",
        status: "completed",
        model: "test-model",
        output: [{
          type: "message",
          content: [{ type: "output_text", text: '{"ok":true}' }],
        }],
        usage: { input_tokens: 3, output_tokens: 2 },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    ) as typeof fetch;
    globalThis.fetch = sealedFetch;
    const capability = await createSealedDispatchCapability({
      llm: {
        provider: "openai",
        auth: "api_key",
        model: "test-model",
        effort: "medium",
        api_key_env: "TEST_OPENAI_KEY",
      },
      operation: "semantic_map_synthesize",
    });
    const replacementFetch = vi.fn(async () => {
      throw new Error("replacement fetch must remain unreachable");
    }) as typeof fetch;
    globalThis.fetch = replacementFetch;

    const counted = await capability.invokeOnce({
      system_prompt: "system",
      user_prompt: "user",
      max_tokens: 100,
    });

    expect(counted.result.text).toBe('{"ok":true}');
    expect(sealedFetch).toHaveBeenCalledTimes(1);
    expect(replacementFetch).not.toHaveBeenCalled();
  });

  it("keeps post-preflight ambient headers and public selection mutation out of the request", async () => {
    process.env.TEST_OPENAI_KEY = "test-only";
    let requestHeaders = new Headers();
    let requestBody: Record<string, unknown> = {};
    globalThis.fetch = vi.fn(async (_input, init) => {
      requestHeaders = new Headers(init?.headers);
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        object: "response",
        status: "completed",
        model: "test-model",
        output: [{
          type: "message",
          content: [{ type: "output_text", text: '{"ok":true}' }],
        }],
        usage: { input_tokens: 3, output_tokens: 2 },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const capability = await createSealedDispatchCapability({
      llm: {
        provider: "openai",
        auth: "api_key",
        model: "test-model",
        effort: "medium",
        api_key_env: "TEST_OPENAI_KEY",
      },
      operation: "semantic_map_synthesize",
    });
    process.env.OPENAI_CUSTOM_HEADERS =
      "x-ambient-route: leaked\nauthorization: Bearer ambient";
    expect(() => {
      (capability.selection as { model_id?: string }).model_id = "mutated-model";
    }).toThrow();
    expect(() => {
      (capability.public_descriptor as { model_id: string }).model_id = "mutated-descriptor";
    }).toThrow();

    await capability.invokeOnce({
      system_prompt: "system",
      user_prompt: "user",
      max_tokens: 100,
    });

    expect(requestHeaders.get("x-ambient-route")).toBeNull();
    expect(requestHeaders.get("authorization")).toBe("Bearer test-only");
    expect(requestBody.model).toBe("test-model");
    expect(capability.public_descriptor.model_id).toBe("test-model");
  });

  it("keeps post-preflight Anthropic custom headers out of the request", async () => {
    process.env.TEST_ANTHROPIC_KEY = "test-only";
    let requestHeaders = new Headers();
    globalThis.fetch = vi.fn(async (_input, init) => {
      requestHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "test-model",
        content: [{ type: "text", text: '{"ok":true}' }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 3, output_tokens: 2 },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const capability = await createSealedDispatchCapability({
      llm: {
        provider: "anthropic",
        auth: "api_key",
        model: "test-model",
        effort: "medium",
        api_key_env: "TEST_ANTHROPIC_KEY",
      },
      operation: "semantic_map_verify",
    });
    process.env.ANTHROPIC_CUSTOM_HEADERS =
      "x-ambient-route: leaked\nx-api-key: ambient";

    await capability.invokeOnce({
      system_prompt: "system",
      user_prompt: "user",
      max_tokens: 100,
    });

    expect(requestHeaders.get("x-ambient-route")).toBeNull();
    expect(requestHeaders.get("x-api-key")).toBe("test-only");
  });
});

describe("semantic-map dispatch accounting", () => {
  it("aggregates physical attempts under one logical dispatch and rejects identity drift", () => {
    const accounting = new SemanticMapDispatchAccounting();
    const entry = {
      observation_id: "obs-1",
      execution_source: "primary" as const,
      operation: "semantic_map_synthesize" as const,
      disposition: "succeeded" as const,
      descriptor_id: "descriptor",
      capability_instance_id: "instance",
      logical_dispatch_id: "logical",
      actual_adapter_request_count: 1,
      failure_class: null,
    };
    accounting.record(entry);
    accounting.record({ ...entry, disposition: "succeeded", failure_class: null });
    expect(accounting.entries()).toEqual([{
      ...entry,
      disposition: "succeeded",
      actual_adapter_request_count: 2,
      failure_class: null,
    }]);
    expect(() => accounting.record({ ...entry, descriptor_id: "changed" }))
      .toThrow("changed identity");
  });
});

it("keeps the ordinary breaker error object free of fallback-only fields", () => {
  const error = new DispatchBreakerTrippedError({
    failure_class: "rate_limit",
    consecutive_item_count: 2,
    threshold: 2,
  });
  expect(Object.hasOwn(error, "structuredContributors")).toBe(false);
  expect(Object.hasOwn(error, "fallbackOutcomePath")).toBe(false);
});
