import { describe, expect, it } from "vitest";
import {
  llmTouchFingerprint,
  assertGatingKeyExcludesInEpochOutput,
  type LlmTouchLayer1PreImage,
  type LlmTouchPreExecutionPreImage,
} from "./llm-touch-fingerprint.js";

const layer1 = (): LlmTouchLayer1PreImage => ({
  content_sha256: "aaa",
  adapter_version: 4,
  value_tile_config: { window: 1024, max_segments: 256 },
  data_layer_caps: { max_columns_profiled: 64 },
});

const preExec = (): LlmTouchPreExecutionPreImage => ({
  leaf_reader_model_identity: "anthropic/claude-opus-4-8",
  execution_adapter: "anthropic_messages",
  declared_billing_mode: "api",
  reasoning_effort: "medium",
  leaf_prompt_sha256: "prompt-hash-1",
  schema_tool_version: "leaf-read:v1",
  comprehension_version: "cv-1",
  structure_leaf_trigger_config: { max_columns: 64 },
  read_set_logic_sha256: "logic-hash-1",
});

const fp = (a = layer1(), b = preExec()) => llmTouchFingerprint(a, b).fingerprint_sha256;

describe("llmTouchFingerprint — staged non-circular gating digest (§4.4)", () => {
  it("is deterministic for identical ⓐ+ⓑ", () => {
    expect(fp()).toBe(fp());
  });

  it("model-identity-rotation (DET-1): rotating ⓑ leaf_reader_model_identity rotates the fingerprint", () => {
    const b2 = { ...preExec(), leaf_reader_model_identity: "anthropic/claude-sonnet-4-6" };
    expect(fp(layer1(), b2)).not.toBe(fp());
  });

  it("leaf-prompt-rotation (CG-1): editing the leaf prompt hash rotates the fingerprint", () => {
    expect(fp(layer1(), { ...preExec(), leaf_prompt_sha256: "prompt-hash-2" })).not.toBe(fp());
  });

  it("reasoning_effort and schema/tool version are part of ⓑ (each rotates the key)", () => {
    expect(fp(layer1(), { ...preExec(), reasoning_effort: "high" })).not.toBe(fp());
    expect(fp(layer1(), { ...preExec(), schema_tool_version: "leaf-read:v2" })).not.toBe(fp());
  });

  it("comprehension-version is a non-authoritative knob that still rotates the key", () => {
    expect(fp(layer1(), { ...preExec(), comprehension_version: "cv-2" })).not.toBe(fp());
  });

  it("trigger-config-rotation (P1-C2-B′ §4): re-tuning the structure trigger rotates the fingerprint", () => {
    expect(fp(layer1(), { ...preExec(), structure_leaf_trigger_config: { max_columns: 32 } })).not.toBe(fp());
  });

  it("read-set-logic-rotation (gate follow-up): editing the read-set-shaping LOGIC source rotates the key", () => {
    // The fold carries a sha of the trigger predicate/ordering SOURCE; a different sha (i.e. an edited
    // predicate) rotates the fingerprint tautologically — no manual comprehension_version bump needed.
    expect(fp(layer1(), { ...preExec(), read_set_logic_sha256: "logic-hash-2" })).not.toBe(fp());
  });

  it("layer1-rotation: changing ⓐ content_sha256 / adapter_version / config rotates the key", () => {
    expect(fp({ ...layer1(), content_sha256: "bbb" })).not.toBe(fp());
    expect(fp({ ...layer1(), adapter_version: 5 })).not.toBe(fp());
    expect(fp({ ...layer1(), value_tile_config: { window: 512 } })).not.toBe(fp());
  });

  it("R6a: labels the closure as declared-only (no auto-discovery claim)", () => {
    const out = llmTouchFingerprint(layer1(), preExec());
    expect(out.dependency_discovery_realization).toBe("declared_closure_only");
    expect(out.fingerprint_covers_declared_closure).toBe(true);
    expect(out.declared_llm_touch_dependency_closure).toContain("leaf_reader_model_identity");
    expect(out.declared_llm_touch_dependency_closure).toContain("leaf_prompt_sha256");
  });
});

describe("assertGatingKeyExcludesInEpochOutput — non-circular-key validator (§11 R3)", () => {
  it("passes for a clean ⓐ+ⓑ+fingerprint-VALUE gating key", () => {
    const cleanSeedKey = {
      content_sha256: "aaa",
      adapter_version: 4,
      comprehension_artifact_contract: { version: 2 },
      // the fingerprint VALUE is allowed in the key (it is the ⓐ+ⓑ digest, not ⓒ):
      leaf_read_fingerprint: "fp-abc",
    };
    expect(() => assertGatingKeyExcludesInEpochOutput("seed", cleanSeedKey)).not.toThrow();
  });

  it("throws when the comprehension-artifact INSTANCE (ⓒ) leaks into the gating key", () => {
    const leakySeedKey = {
      content_sha256: "aaa",
      embedded_artifact: {
        observation_id: "obs-1",
        spine_claims: [{ tentative_label: "transaction date" }], // ⓒ leak
      },
    };
    expect(() => assertGatingKeyExcludesInEpochOutput("seed", leakySeedKey)).toThrow(
      /must not contain in-epoch LLM output field 'spine_claims'/,
    );
  });

  it("catches a nested confidence_by_claim leak (deep scan)", () => {
    const leaky = { a: { b: [{ c: { confidence_by_claim: [] } }] } };
    expect(() => assertGatingKeyExcludesInEpochOutput("seed", leaky)).toThrow(
      /confidence_by_claim/,
    );
  });

  it("catches a tentative_label leak even without the parent field name", () => {
    expect(() => assertGatingKeyExcludesInEpochOutput("seed", { x: { tentative_label: "y" } })).toThrow(
      /tentative_label/,
    );
  });
});
