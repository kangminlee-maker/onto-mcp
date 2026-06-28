import { createHash } from "node:crypto";

// ─────────────────────────────────────────────────────────────────────────────
// llm_touch_fingerprint (§4.1/§4.4) — the staged, NON-CIRCULAR gating digest for the first
// LLM-touch (the low-confidence leaf-read, P1-C2-A). It keys the SEPARATE Layer-2 leaf-read
// artifact's reuse so a model/prompt change rotates it and a stale label fails the resume check.
//
// Staging (Cut-4a reference impl → real wiring; §11 R6):
//  - ⓐ Layer-1 deterministic pre-image: content_sha256 + adapter_version + value-tile/data-layer
//    config — all LLM-free (reused from the existing Layer-1 reuse inputs).
//  - ⓑ pre-execution LLM-touch pre-image: everything known BEFORE the first LLM call —
//    leaf-reader model identity PRE-IMAGE projection (provider/model_id; route residue like
//    effective_base_url is post-call and lives OUTSIDE the gating key, §11 R6b), declared adapter/
//    billing, reasoning_effort, the leaf prompt hash (system + repair, via the authoring catalog),
//    schema/tool version, and the comprehension-version manual-invalidation knob.
//  - ⓒ in-epoch LLM output (the produced labels/confidence/witness) is NEVER an input — it has no
//    slot in this function's parameter types, so it cannot reach the key (non-circular BY
//    CONSTRUCTION; the gate's T1/T3 concern). The seed gating digests are additionally guarded at
//    runtime by `assertGatingKeyExcludesInEpochOutput` (§11 R3).
//
// Honesty (§11 R6a): this fingerprint gates a DECLARED dependency closure. It does NOT auto-discover
// LLM-touch dependencies — that mechanism is deferred (dependency-discovery, design §11 / build-spec).
// The result is labelled `declared_closure_only` so a consumer never reads "fingerprint passed" as
// "all dependencies provably covered" (the vacuous {observed}⊆{folded} pattern the sibling design
// failed its gate on, DET-DISC-1).
// ─────────────────────────────────────────────────────────────────────────────

/** ⓐ — Layer-1 deterministic pre-image (LLM-free). Mirrors the existing source-observations reuse
 *  inputs; carried here so the fingerprint rotates when the deterministic substrate rotates. */
export interface LlmTouchLayer1PreImage {
  content_sha256: string;
  adapter_version: number;
  value_tile_config: unknown;
  data_layer_caps: unknown;
}

/** ⓑ — pre-execution LLM-touch pre-image. Every field is known BEFORE the first leaf-read call. */
export interface LlmTouchPreExecutionPreImage {
  /** "<provider>/<model_id>" of the leaf-reader, or "unspecified" — the PRE-IMAGE projection only
   *  (mirror reconstructAuthoringModelIdentity). Post-call route residue is excluded (§11 R6b). */
  leaf_reader_model_identity: string;
  execution_adapter: string | null;
  declared_billing_mode: string | null;
  reasoning_effort: string | null;
  /** sha256 over the leaf-read prompt templates — system prompt AND the JSON-repair prompt — read
   *  from the single authoring-prompt catalog (CG-1 pattern: editing the prompt rotates the key). */
  leaf_prompt_sha256: string;
  schema_tool_version: string;
  /** Non-authoritative manual-invalidation knob (does NOT carry model/prompt identity). */
  comprehension_version: string;
  /** P1-C2-B′ §4: the DETERMINISTIC structure-incompleteness trigger config (e.g. max_columns) that
   *  shaped the read-set. The read-set is a pure function of the inventory AND this config, so folding
   *  it here rotates the reuse key when the trigger is re-tuned (mirror value_tile_config). LLM-free;
   *  it lives in ⓑ because it is a reconstruct-stage pre-execution selection config, not an
   *  observation-derived input (which is ⓐ). */
  structure_leaf_trigger_config: unknown;
}

/** Honest scope labels (§11 R6a) — structurally encode that this covers a DECLARED closure only. */
export interface LlmTouchFingerprint {
  fingerprint_sha256: string;
  declared_llm_touch_dependency_closure: string[];
  fingerprint_covers_declared_closure: true;
  dependency_discovery_realization: "declared_closure_only";
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Compute the staged non-circular fingerprint. The parameter types admit ONLY ⓐ + ⓑ — the in-epoch
 * LLM output (ⓒ) has no slot, so it cannot reach the key by construction (§4.4 non-circular-key).
 */
export function llmTouchFingerprint(
  layer1: LlmTouchLayer1PreImage,
  preExecution: LlmTouchPreExecutionPreImage,
): LlmTouchFingerprint {
  const declaredClosure = [
    // ⓐ
    "content_sha256",
    "adapter_version",
    "value_tile_config",
    "data_layer_caps",
    // ⓑ
    "leaf_reader_model_identity",
    "execution_adapter",
    "declared_billing_mode",
    "reasoning_effort",
    "leaf_prompt_sha256",
    "schema_tool_version",
    "comprehension_version",
    "structure_leaf_trigger_config",
  ];
  const fingerprint_sha256 = sha256Text(
    stableJson({ layer1_pre_image: layer1, pre_execution_pre_image: preExecution }),
  );
  return {
    fingerprint_sha256,
    declared_llm_touch_dependency_closure: declaredClosure,
    fingerprint_covers_declared_closure: true,
    dependency_discovery_realization: "declared_closure_only",
  };
}

/**
 * In-epoch LLM OUTPUT (ⓒ) field names that must NEVER appear inside a gating reuse key (§11 R3).
 * If any of these is serialized into a seed digest, an LLM output would gate its own reuse (the
 * self-gating circularity). The fingerprint VALUE (`epoch_fingerprint_contribution`) is allowed —
 * it is the ⓐ+ⓑ digest, not ⓒ.
 */
export const LLM_TOUCH_IN_EPOCH_OUTPUT_FIELDS = [
  "spine_claims",
  "confidence_by_claim",
  "limiting_witness",
  "leaf_read_attempt",
  "tentative_label",
  // P1-C2-B′ §3: the captured role/note are LLM output too — guard them out of any gating key.
  "semantic_role",
  "captured_note",
] as const;

const IN_EPOCH_OUTPUT_SET = new Set<string>(LLM_TOUCH_IN_EPOCH_OUTPUT_FIELDS);

/**
 * Runtime non-circular validator (§11 R3): assert that a gating-key input (the object a seed reuse
 * digest serializes — e.g. the source-observations reuse projection or the authored-artifact reuse
 * match) contains NO in-epoch LLM output field. Scoped to the REAL seed digests, not just the
 * fingerprint function (the gate's T3 finding: the type guard only protects llmTouchFingerprint).
 * Throws on the first ⓒ key found so the leak fails closed at construction time.
 */
export function assertGatingKeyExcludesInEpochOutput(label: string, gatingKeyInput: unknown): void {
  const visit = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => visit(item, `${path}[${i}]`));
      return;
    }
    if (node && typeof node === "object") {
      for (const key of Object.keys(node as Record<string, unknown>)) {
        if (IN_EPOCH_OUTPUT_SET.has(key)) {
          throw new Error(
            `${label}: gating reuse key must not contain in-epoch LLM output field '${key}' at ${path}.${key} (§11 R3 non-circular-key: an LLM output would gate its own reuse). Fold the llm_touch_fingerprint VALUE instead of the comprehension-artifact instance.`,
          );
        }
        visit((node as Record<string, unknown>)[key], `${path}.${key}`);
      }
    }
  };
  visit(gatingKeyInput, label);
}
