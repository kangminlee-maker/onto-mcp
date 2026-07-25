/**
 * The semantic-map stage — turning a deterministic structural inventory into a named, LLM-authored
 * map of what each region MEANS, per observation.
 *
 * Routes an eligible observation to the spreadsheet or the code bridge (`SemanticMapArtifactKind`),
 * runs synthesize-then-verify through those callbacks, and merges the per-observation projections
 * into the stage result the seed author reads. Two properties carry the weight: the per-observation
 * FINGERPRINT folds every input that can change the map (model identity, prompt contract, render
 * budget, inventory reuse inputs) so a resumed run never reuses a map authored under different
 * conditions; and a dispatch breaker trip persists an incomplete artifact rather than silently
 * yielding a partial map. The projection vocabulary itself lives in semantic-map-projection.ts.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { atomicWriteYamlDocument as writeYamlDocument } from "../artifact-io.js";
import type { CodeStructureInventory } from "../code-structure-observer.js";
import {
  DispatchBreakerState,
  DispatchBreakerTrippedError,
  buildDispatchIncompleteArtifact,
  buildDispatchIncompleteArtifactFromPartition,
  classifySystemicDispatchFailure,
  dispatchIncompleteArtifactPath,
  readDispatchFailureClass,
  runWithDispatchBackoff,
} from "../llm/dispatch-breaker.js";
import type {
  DispatchBreakerPolicy,
  DispatchBreakerTripState,
  DispatchDeadLetterEntry,
  DispatchIncompleteArtifact,
} from "../llm/dispatch-breaker.js";
import { readStructuredDispatchFailureEvidence } from "../llm/structured-dispatch-error.js";
import type { StructuredDispatchFailureEvidence } from "../llm/structured-dispatch-error.js";
import type { WorkbookStructuralInventory } from "../spreadsheet-structure-observer.js";
import type {
  ReconstructSemanticMapCensus,
  ReconstructSemanticMapCensusCodeUnit,
  ReconstructSemanticMapCensusColumn,
  ReconstructSemanticMapCensusObservation,
  ReconstructSemanticMapResumeValidationArtifact,
  ReconstructSemanticMapSidecar,
  ReconstructSemanticMapSidecarObservation,
  ReconstructSourceObservationsArtifact,
} from "./artifact-types.js";
import { codeReduceNodeKey, foldCodeStructureInventory } from "./comprehension-reduce-code.js";
import {
  buildColumnLeaves,
  reduceColumnLeavesWithTrace,
  reduceNodeKey,
} from "./comprehension-reduce.js";
import type {
  ComprehensionReduceNode,
  ReduceTopologyTrace,
  SemanticNodeKey,
} from "./comprehension-reduce.js";
import {
  CODE_SOURCE_LINES_CHAR_CAP,
  CODE_SYMBOL_NAMES_DISPLAY_CAP,
  accumulateCodeSemanticMap,
  assertCodeSynthesisInputBounded,
  assertCodeSynthesisOutputBounded,
  buildCodeSynthesisInputForNode,
  buildCodeSynthesisMeta,
  projectCodeSemanticMapToSeed,
  reconcileCodeBoundaries,
} from "./comprehension-semantic-map-code.js";
import type {
  CodeSemanticBoundaryVerifyInput,
  CodeSemanticSeedProjection,
  CodeSemanticSynthesisInput,
  CodeSemanticSynthesisOutput,
} from "./comprehension-semantic-map-code.js";
import { classifyFrontierCore } from "./comprehension-semantic-map-core.js";
import {
  ADVERSARIAL_RESULTS,
  accumulateSemanticMap,
  assertSynthesisInputBounded,
  assertSynthesisOutputBounded,
  buildSynthesisInputForNode,
  classifyFrontier,
  projectSemanticMapToSeed,
  reconcileBoundaries,
} from "./comprehension-semantic-map.js";
import type {
  FrontierMode,
  SemanticBoundaryVerification,
  SemanticBoundaryVerifyInput,
  SemanticEpochPreImage,
  SemanticSeedProjection,
  SemanticSynthesisInput,
  SemanticSynthesisOutput,
} from "./comprehension-semantic-map.js";
import type { ReconstructDirectiveAuthor } from "./directive-author-contract.js";
import { isGracefulTerminalSignal } from "./graceful-terminal.js";
import { readReconstructLlmDispatchFailureError } from "./llm-dispatch-failure.js";
import { assertGatingKeyExcludesInEpochOutput } from "./llm-touch-fingerprint.js";
import { isoNow, sha256Text, stableJson } from "./run-primitives.js";
import {
  CODE_SEMANTIC_MAP_PROMPT_RENDER_CHAR_BUDGET,
  SEMANTIC_MAP_PROMPT_RENDER_CHAR_BUDGET,
  SEMANTIC_MAP_ROUTABLE_KINDS,
} from "./semantic-map-projection.js";
import type {
  SemanticMapAnyProjection,
  SemanticMapArtifactKind,
} from "./semantic-map-projection.js";
import {
  workbookInventoryAdapterVersion,
  workbookInventoryDataLayerCaps,
  workbookInventoryValueTileConfig,
} from "./workbook-inventory-reuse-inputs.js";

/**
 * W1 (wiring design 20260702 §15.2): the semantic-map author capability is a PAIR — synthesize +
 * verify. Both absent → the stage is skipped (default-off, readLeafLabels precedent). Exactly one
 * present → a fail-loud configuration error: a one-sided author must NOT masquerade as a normal
 * skip (X8 / onto-R2 issue-004 — the skip reason would silently hide a broken wiring). Pure; W1
 * exercises it in tests only — production enforcement starts when the W2 semantic_map stage entry
 * calls it.
 */
export function resolveSemanticMapCapability(
  author: Pick<
    ReconstructDirectiveAuthor,
    "synthesizeSemanticMapNode" | "verifySemanticMapBoundary"
  >,
): "absent" | "present" {
  const hasSynthesize = typeof author.synthesizeSemanticMapNode === "function";
  const hasVerify = typeof author.verifySemanticMapBoundary === "function";
  if (hasSynthesize !== hasVerify) {
    throw new Error(
      "reconstruct: the semantic-map author capability is a PAIR — implement BOTH synthesizeSemanticMapNode AND verifySemanticMapBoundary, or NEITHER (a one-sided author is a fail-loud configuration error, not a skip; wiring design 20260702 §15.2).",
    );
  }
  return hasSynthesize ? "present" : "absent";
}

/**
 * kind 광고 해석 (DD7): capability pair 부재 → [] (stage skip). 광고 부재 = ["spreadsheet"] —
 * 기존 계약의 명시적 해석(광고 없는 구 author가 실제로 지원하는 집합; INV-CFG-1 비접촉).
 * 미지의 kind 광고는 fail-loud 설정 오류 (조용한 라우팅 누락 방지).
 */
export function resolveSemanticMapKinds(
  author: Pick<
    ReconstructDirectiveAuthor,
    "synthesizeSemanticMapNode" | "verifySemanticMapBoundary" | "supportedSemanticMapKinds"
  >,
): readonly SemanticMapArtifactKind[] {
  if (resolveSemanticMapCapability(author) === "absent") return [];
  const advertised = author.supportedSemanticMapKinds;
  if (advertised === undefined) return ["spreadsheet"];
  const kinds = [...new Set(advertised)];
  for (const kind of kinds) {
    if (!(SEMANTIC_MAP_ROUTABLE_KINDS as readonly string[]).includes(kind)) {
      throw new Error(
        `reconstruct: supportedSemanticMapKinds advertises unroutable kind '${kind}' — the semantic-map stage routes only [${SEMANTIC_MAP_ROUTABLE_KINDS.join(", ")}] (fail-loud configuration error; multi-artifact design DD7).`,
      );
    }
  }
  return kinds as SemanticMapArtifactKind[];
}

/** Manual version for the projection/render CONTRACT (design §5 X9 / W3 review W3-003): cap VALUES
 *  are folded via stage_config, but the projection RULES (projectSemanticMapToSeed + the observation
 *  merge) and — from W4 — the prompt RENDERER change what the seed actually sees without any config
 *  change. Bump on any projection/merge/renderer semantics edit that reaches the SPREADSHEET
 *  surface. ⚠️ This knob folds into every spreadsheet fingerprint — CODE-only projection/render
 *  semantics bump CODE_SEMANTIC_MAP_PROJECTION_CONTRACT_VERSION instead (DD10 회전 격리, 리뷰
 *  inv M1: a shared bump would rotate every spreadsheet reuse key as collateral). */
const SEMANTIC_MAP_PROJECTION_CONTRACT_VERSION = "projection-merge:1";

/** DD10: CODE projection display cap (1a single-file headroom; spreadsheet stage-config 60 불변).
 *  Applied at the projection call — the stage config's shared max_nodes never caps code. */
export const CODE_SEMANTIC_MAP_MAX_NODES = 512;

/** DD10 (리뷰 inv M1): CODE-only projection/render contract version — the shared X9 knob above is
 *  spreadsheet-golden-locked, so code projection/render semantics edits bump THIS knob. */
export const CODE_SEMANTIC_MAP_PROJECTION_CONTRACT_VERSION = "code-projection-render:1";

/** Deterministic stage config. ALL fields required and validated fail-loud (R2-04: the module's
 *  projection caps default to UNBOUNDED; the stage never relies on defaults). Every value shapes the
 *  map, so W3 folds this whole object into the reuse fingerprint (§5). */
export interface SemanticMapStageConfig {
  /** buildColumnLeaves leaf grouping (≥1) — reduce-tree topology input (§5 F2). */
  leaf_count: number;
  /** reduceColumnLeavesWithTrace fan-in (≥2) — reduce-tree topology input (§5 F2). */
  fanin: number;
  /** classifyFrontier over-context budget (leaf count, ≥0). */
  over_context_budget: number;
  /** X7: deterministic PREFLIGHT cap on author synthesize calls (per stage run). */
  max_synthesize_calls: number;
  /** X7/R2-01: INCREMENTAL cap on author verify calls (verify count is a function of synthesize
   *  OUTPUT, not pre-LLM computable; exceeding it fails the column closed → observation fallback). */
  max_verify_calls: number;
  /** R2-04: explicit projection display caps (authoritative totals stay uncapped). */
  max_nodes: number;
  max_disclosure: number;
}

function assertSemanticMapStageConfig(config: SemanticMapStageConfig): void {
  const entries: [string, number, number][] = [
    ["leaf_count", config.leaf_count, 1],
    ["fanin", config.fanin, 2],
    ["over_context_budget", config.over_context_budget, 0],
    ["max_synthesize_calls", config.max_synthesize_calls, 0],
    ["max_verify_calls", config.max_verify_calls, 0],
    ["max_nodes", config.max_nodes, 0],
    ["max_disclosure", config.max_disclosure, 0],
  ];
  for (const [name, value, min] of entries) {
    if (!Number.isSafeInteger(value) || value < min) {
      throw new Error(
        `semantic-map stage: config.${name} must be a safe integer ≥ ${min}, got ${value} (R2-04/X7 fail-loud — a NaN/absent cap would silently unbound the stage).`,
      );
    }
  }
}

/** One node's recorded bridge exchange: the EXACT input the LLM saw (stableJson of a deep clone,
 *  captured at call time — R2-06: never a live object reference) + the author's output + every
 *  adversarial verification keyed by its FULL input (X3: row keying collides; no fallback). */
export interface SemanticMapBridgeRecord {
  input_json: string;
  output: SemanticSynthesisOutput;
  /** consumed = replay bookkeeping (audit G): each recorded verification answers exactly ONE module
   *  verify call, so byte-identical duplicate boundaries stay 1:1 instead of aliasing to the first. */
  verifies: { input_json: string; verdict: SemanticBoundaryVerification; consumed?: boolean }[];
}

/** Generic §3(b)/(c) replay closures — one implementation, per-artifact node keying (step 6 DD9).
 *  Message bytes are shared ("semantic-map bridge" names the subsystem, not the artifact). */
function buildBridgeCallbacksWithKey<
  I,
  VI,
  O,
  Rec extends { input_json: string; output: O; verifies: { input_json: string; verdict: SemanticBoundaryVerification; consumed?: boolean }[] },
>(
  synthesizeKeyOf: (input: I) => string,
  verifyKeyOf: (input: VI) => string,
  preByKey: ReadonlyMap<string, Rec>,
): {
  synthesize: (input: I) => O;
  verifyUnanchored: (input: VI) => SemanticBoundaryVerification;
} {
  return {
    synthesize: (input) => {
      const key = synthesizeKeyOf(input);
      const rec = preByKey.get(key);
      if (!rec) {
        throw new Error(`semantic-map bridge: no precomputed synthesis for ${key} (§3 fail-closed).`);
      }
      if (stableJson(input) !== rec.input_json) {
        throw new Error(
          `semantic-map bridge: module synthesis input drifted from the input the LLM saw at ${key} (§3(b) drift detector — silent divergence is the validation-bypass class).`,
        );
      }
      return structuredClone(rec.output);
    },
    verifyUnanchored: (input) => {
      const key = verifyKeyOf(input);
      const rec = preByKey.get(key);
      const inputJson = stableJson(input);
      // MATCH-AND-CONSUME (ultracode audit G): two byte-identical unanchored boundaries on one node
      // produce two recorded verifications; a find-first replay would alias BOTH module calls to the
      // FIRST verdict, silently overwriting the author's second (possibly refuted) answer. Consuming
      // each recorded entry once keeps the replay 1:1 with the live calls.
      const idx = rec ? rec.verifies.findIndex((v) => v.input_json === inputJson && !v.consumed) : -1;
      if (idx < 0 || !rec) {
        throw new Error(
          `semantic-map bridge: no unconsumed recorded adversarial verification matching the module's verifier input at ${key} (§3(c) full-input key — row keying collides; a conservative fallback would silently pollute).`,
        );
      }
      rec.verifies[idx]!.consumed = true;
      return rec.verifies[idx]!.verdict;
    },
  };
}

/** §3(b)/(c) sync closures over the pre-computed records. Exported so the drift detectors are
 *  falsifiable in tests WITHOUT production test-hooks: feed a tampered record → must throw. */
export function buildSemanticMapBridgeCallbacks(preByKey: ReadonlyMap<string, SemanticMapBridgeRecord>): {
  synthesize: (input: SemanticSynthesisInput) => SemanticSynthesisOutput;
  verifyUnanchored: (input: SemanticBoundaryVerifyInput) => SemanticBoundaryVerification;
} {
  return buildBridgeCallbacksWithKey(
    (input: SemanticSynthesisInput) => reduceNodeKey(input.node_ref),
    (input: SemanticBoundaryVerifyInput) => reduceNodeKey(input.node_ref),
    preByKey,
  );
}

/** Step 6 (DD9): the CODE bridge record/callbacks — same replay + drift-detector discipline with
 *  code node keying and the line-vocabulary output type. */
export interface CodeSemanticMapBridgeRecord {
  input_json: string;
  output: CodeSemanticSynthesisOutput;
  verifies: { input_json: string; verdict: SemanticBoundaryVerification; consumed?: boolean }[];
}

export function buildCodeSemanticMapBridgeCallbacks(
  preByKey: ReadonlyMap<string, CodeSemanticMapBridgeRecord>,
): {
  synthesize: (input: CodeSemanticSynthesisInput) => CodeSemanticSynthesisOutput;
  verifyUnanchored: (input: CodeSemanticBoundaryVerifyInput) => SemanticBoundaryVerification;
} {
  return buildBridgeCallbacksWithKey(
    (input: CodeSemanticSynthesisInput) => codeReduceNodeKey(input.node_ref),
    (input: CodeSemanticBoundaryVerifyInput) => codeReduceNodeKey(input.node_ref),
    preByKey,
  );
}

/** Deterministic per-observation merge of per-column projections (LLM-0). Totals are the SUMS of the
 *  per-column AUTHORITATIVE totals (never the rendered lengths); display lists re-capped after the
 *  canonical-order merge — bounded views over honest totals (run.ts:6469 pattern). */
export function mergeSemanticSeedProjections(
  projections: readonly SemanticSeedProjection[],
  caps: { max_nodes: number; max_disclosure: number },
): SemanticSeedProjection {
  const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  const nodes = projections
    .flatMap((p) => p.nodes)
    .sort((a, b) => cmp(reduceNodeKey(a.node_ref), reduceNodeKey(b.node_ref)));
  const refuted = projections
    .flatMap((p) => p.refuted_disclosure)
    .sort((a, b) => cmp(reduceNodeKey(a.node_ref), reduceNodeKey(b.node_ref)) || a.row - b.row);
  return {
    authority: "non_authoritative",
    provisional: true,
    nodes: nodes.slice(0, caps.max_nodes),
    nodes_total: projections.reduce((s, p) => s + p.nodes_total, 0),
    refuted_disclosure: refuted.slice(0, caps.max_disclosure),
    refuted_disclosure_total: projections.reduce((s, p) => s + p.refuted_disclosure_total, 0),
    unanchored_unverified_total: projections.reduce((s, p) => s + p.unanchored_unverified_total, 0),
  };
}

/** Marker error for the X7 incremental verify cap (caught per column → capped, not failed). */
class SemanticMapVerifyCapExceeded extends Error {
  constructor(key: string, cap: number) {
    super(`semantic-map stage: verify-call cap ${cap} exceeded at ${key} (X7 incremental — column fails closed to the flat path).`);
  }
}

export interface SemanticMapStageResult {
  /** Merged per-observation projection — ONLY observations that passed the X5 all-columns gate. */
  projectionByObservation: Map<string, SemanticMapAnyProjection>;
  /** null ⇔ the stage was skipped (author lacks the capability pair; W3 manifest step = skipped). */
  census: ReconstructSemanticMapCensus | null;
  censusPath: string | null;
  sidecarPath: string | null;
  /** W3 §5: order-independent aggregate of the per-observation PRE-EXECUTION fingerprints (model
   *  identities + prompt-contract sha + version knob + whole stage config + inventory identity) —
   *  the VALUE the seed reuse key folds; never the map instance. null when the stage was skipped or
   *  saw no evaluatable observation (leaf-read null pattern). */
  aggregateFingerprint: string | null;
}

export type SemanticMapPreImageBase = Omit<
  SemanticEpochPreImage,
  "layer1_ground_hash" | "child_contributions"
>;

export type SemanticMapObservation =
  ReconstructSourceObservationsArtifact["observations"][number];

/** Step 6 (DD7): the stage's ELIGIBLE observation set — spreadsheet always; code only when the
 *  settings opt-in AND the author kind 광고 both hold (유효 kind = settings ∩ 광고). With code off
 *  this is byte-identical to the pre-extension spreadsheet-only selection (G-OFF). */
export function semanticMapEligibleObservations(
  sourceObservations: ReconstructSourceObservationsArtifact,
  codeEligible: boolean,
): SemanticMapObservation[] {
  return sourceObservations.observations
    .filter(
      (o) =>
        o.target_material_kind === "spreadsheet" ||
        (codeEligible && o.target_material_kind === "code"),
    )
    .slice()
    .sort((a, b) => (a.observation_id < b.observation_id ? -1 : a.observation_id > b.observation_id ? 1 : 0));
}

export function semanticMapObservationFingerprint(args: {
  observation: SemanticMapObservation;
  inventory: WorkbookStructuralInventory;
  preImageBase: SemanticMapPreImageBase;
  verifyModelIdentity: string;
  config: SemanticMapStageConfig;
}): string {
  const fingerprintPreImage = {
    content_sha256:
      typeof args.observation.structural_data.content_sha256 === "string"
        ? args.observation.structural_data.content_sha256
        : "",
    adapter_version: workbookInventoryAdapterVersion(args.inventory) ?? 0,
    value_tile_config: workbookInventoryValueTileConfig(args.inventory),
    data_layer_caps: workbookInventoryDataLayerCaps(args.inventory),
    // The ENTIRE ⓑ' base is folded — a SELECTIVE fold left gate-logic/schema-tool version
    // changes outside the seed key (silent-stale class, self-caught post-W3): everything that
    // shapes a judgment must rotate the key (model identity, prompt-contract sha, version knob,
    // gate config+LOGIC version, schema tool version).
    pre_image_base: args.preImageBase,
    verify_model_identity: args.verifyModelIdentity,
    stage_config: args.config,
    projection_contract_version: SEMANTIC_MAP_PROJECTION_CONTRACT_VERSION, // X9 / W3-003
    // W4 review W4-001 (5th recurrence of the value-shapes-prompt-but-not-key class): the render
    // budget truncates BOTH prompt surfaces — folded by VALUE, never only via the manual knob.
    render_char_budget: SEMANTIC_MAP_PROMPT_RENDER_CHAR_BUDGET,
  };
  assertGatingKeyExcludesInEpochOutput("semanticMapStageFingerprint", fingerprintPreImage);
  return sha256Text(stableJson(fingerprintPreImage));
}

/** Step 6 (DD6): the CODE observation fingerprint — same skeleton as the spreadsheet fingerprint
 *  with code inventory identity (content + extractor-logic sha) and the CODE prompt-contract sha
 *  (inside the code preImageBase — 리뷰 ct-F2 격리). Reaches the seed reuse key through the
 *  aggregate fingerprint alongside spreadsheet fingerprints. */
export function semanticMapCodeObservationFingerprint(args: {
  observation: SemanticMapObservation;
  inventory: CodeStructureInventory;
  preImageBase: SemanticMapPreImageBase;
  verifyModelIdentity: string;
  config: SemanticMapStageConfig;
}): string {
  const fingerprintPreImage = {
    target_material_kind: "code",
    content_sha256: args.inventory.content_sha256,
    extractor_logic_sha256: args.inventory.extractor_logic_sha256,
    language: args.inventory.language,
    inventory_schema_version: args.inventory.schema_version,
    pre_image_base: args.preImageBase,
    verify_model_identity: args.verifyModelIdentity,
    stage_config: args.config,
    // DD10 (리뷰 inv M1): CODE-only projection contract + per-kind VALUES fold HERE only — the
    // shared X9 knob stays out so spreadsheet keys never rotate on code tuning, and v1 code
    // sidecars fail closed on the mismatch (silent-stale 차단).
    projection_contract_version: CODE_SEMANTIC_MAP_PROJECTION_CONTRACT_VERSION,
    render_char_budget: CODE_SEMANTIC_MAP_PROMPT_RENDER_CHAR_BUDGET,
    code_max_nodes: CODE_SEMANTIC_MAP_MAX_NODES,
    // DD6′ envelope content-shaping caps (교차검증 inv M1): these bound what the LLM actually
    // READS in a frontier envelope, so a cap change changes the summary the sidecar caches —
    // the same "value shapes the prompt but not the key" class as render_char_budget above, and
    // reduce_schema_tool_version is contractually the ENVELOPE-SHAPE lever (field set), not a
    // value lever, so a cap-value edit would not bump it. Fold by VALUE. (CODE_ENVELOPE_LINE_
    // FIELD_CAP=200 is omitted deliberately: it is a defensive seal dominated by the observer's
    // 140-char doc/signature bound, so it never actually truncates and cannot shape the prompt.)
    source_lines_char_cap: CODE_SOURCE_LINES_CHAR_CAP,
    symbol_names_display_cap: CODE_SYMBOL_NAMES_DISPLAY_CAP,
  };
  assertGatingKeyExcludesInEpochOutput("semanticMapCodeStageFingerprint", fingerprintPreImage);
  return sha256Text(stableJson(fingerprintPreImage));
}

export function semanticMapCodeStructural(observation: SemanticMapObservation): {
  inventory: CodeStructureInventory | undefined;
  unsupportedReason: string | undefined;
} {
  const structural = observation.structural_data as Record<string, unknown>;
  const unsupported = structural.code_structure_unsupported as { reason?: unknown } | undefined;
  return {
    inventory: structural.code_structure_inventory as CodeStructureInventory | undefined,
    unsupportedReason:
      unsupported && typeof unsupported.reason === "string" ? unsupported.reason : unsupported ? "unsupported" : undefined,
  };
}

/** DD6′ frontier-source admission guard — the ONE predicate the stage AND the resume partition
 *  share (DD7 same-predicate discipline), so the two can never disagree about whether a code
 *  observation's excerpt is sliceable. Returns the failure description, or null when admitted:
 *  the excerpt must exist, be the EXACT text the inventory was extracted from (sha equality), and
 *  be complete (untruncated) — a drifted or partial slice would silently attribute wrong source. */
export function semanticMapCodeSourceExcerptGuardFailure(
  observation: SemanticMapObservation,
  inventory: CodeStructureInventory,
): string | null {
  const structural = observation.structural_data as Record<string, unknown>;
  if (typeof structural.content_excerpt !== "string") {
    return "structural_data.content_excerpt is absent — code whole-capture did not run for this ref";
  }
  if (structural.content_sha256 !== inventory.content_sha256) {
    return "structural_data.content_sha256 does not match the inventory's content_sha256 — the excerpt is not the extracted text";
  }
  if (structural.excerpt_truncated !== false) {
    return "structural_data.excerpt_truncated is not false — the capture is incomplete";
  }
  return null;
}

export interface SemanticMapRecoveryContext {
  validationPath: string;
  dispatchIncompletePath: string;
  backupRefs: ReconstructSemanticMapResumeValidationArtifact["backup_refs"];
  retainedRowsByObservationId: Map<string, ReconstructSemanticMapCensusObservation>;
  retainedSidecarByObservationId: Map<string, ReconstructSemanticMapSidecarObservation>;
  retainedCompletedItemIds: string[];
  retainedDeadLetter: DispatchDeadLetterEntry[];
  incompleteItemIds: string[];
  priorRetryTotals: ReconstructSemanticMapResumeValidationArtifact["prior_retry_totals"];
}

/**
 * W2 semantic_map stage. Default-off: an author without the capability PAIR returns the skip result
 * (no census — "never ran" stays durably distinct from "ran and produced nothing"); a one-sided
 * author throws (resolveSemanticMapCapability — production fail-loud starts HERE, §15.2). Census +
 * sidecar are ALWAYS written when the stage runs (leaf_read f1a3c1b pattern). The census/sidecar
 * carry deterministic data only; the reuse fingerprint is W3's fold.
 *
 * Ledger note: the stage IS registered as a pipeline-execution-ledger unit (descriptive audit row;
 * the live run never consumes the ledger). Reuse remains fingerprint-based for authored seed
 * artifacts, while breaker recovery is stage-local: dispatch-incomplete.yaml supplies the frontier
 * and semantic-map-resume-validation.yaml validates retained census/sidecar rows before use. The
 * ledger's pre-existing `unitKind: "semantic_map"` (claim_realization's KIND) is a different
 * vocabulary — a name collision, not a relationship.
 */
/** 설계 B 규칙 4·5: the batch's end state (completed / dead-letter /
 * incomplete) persists at a fixed session-root path (single-sourced in the
 * dispatch-breaker module) so a recovery run can re-dispatch EXACTLY the
 * incomplete set — the §1.2 34-item loss happened because this list did not
 * exist. Written on breaker trip AND on normal breaker-ON completion (rule 6
 * observability); never written when the breaker is off (OFF = 현행 동작). */
async function persistDispatchIncompleteArtifact(args: {
  sessionRoot: string;
  batchLabel: string;
  plannedItemIds: readonly string[];
  state?: DispatchBreakerState;
  completedItemIds?: readonly string[];
  deadLetter?: readonly DispatchDeadLetterEntry[];
  breaker?: DispatchIncompleteArtifact["breaker"];
}): Promise<string> {
  const artifactPath = dispatchIncompleteArtifactPath(args.sessionRoot);
  const artifact = args.state
    ? buildDispatchIncompleteArtifact({
      pipeline: "reconstruct",
      batchLabel: args.batchLabel,
      createdAt: isoNow(),
      plannedItemIds: args.plannedItemIds,
      state: args.state,
    })
    : buildDispatchIncompleteArtifactFromPartition({
      pipeline: "reconstruct",
      batchLabel: args.batchLabel,
      createdAt: isoNow(),
      plannedItemIds: args.plannedItemIds,
      completedItemIds: args.completedItemIds ?? [],
      deadLetter: args.deadLetter ?? [],
      breaker: args.breaker ?? {
        tripped: false,
        failure_class: null,
        consecutive_item_count: null,
        threshold: 0,
      },
    });
  await writeYamlDocument(
    artifactPath,
    artifact,
  );
  return artifactPath;
}

export async function runSemanticMapStage(args: {
  sourceObservations: ReconstructSourceObservationsArtifact;
  directiveAuthor: ReconstructDirectiveAuthor;
  sessionRoot: string;
  config: SemanticMapStageConfig;
  /** ⓑ' pre-image base passed through to the module's epoch recursion (per-node layer1_ground_hash +
   *  child_contributions are filled by the walk). W3 supplies real identities at the live call site. */
  preImageBase: Omit<SemanticEpochPreImage, "layer1_ground_hash" | "child_contributions">;
  /** F4 (CG-2/judge-fold class): the adversarial verifier may run a DIFFERENT model in production —
   *  its identity folds separately. Defaults to the author identity at the live call site. */
  verifyModelIdentity: string;
  /** 설계 B: batch dispatch circuit breaker. Default-off; NOT part of `config`
   * on purpose — the stage config folds into the reuse fingerprint, and the
   * breaker policy must never rotate reuse keys. */
  dispatchBreaker?: DispatchBreakerPolicy;
  recoveryContext?: SemanticMapRecoveryContext | null;
  executionSource?: "primary" | "fallback";
  priorDispatchSpend?: { synthesize: number; verify: number };
  captureStructuredContributors?: boolean;
  /** Step 6 (DD7): the settings opt-in half of code eligibility (reconstruct.execution.
   *  semantic_map_code). 유효 kind = this ∩ the author's kind 광고 — absent/false keeps the stage
   *  byte-identical to the spreadsheet-only pre-extension behavior (G-OFF). */
  codeKindOptIn?: boolean;
  /** Step 6 (DD6): the CODE ⓑ' base (code prompt-contract sha instead of CG-1). REQUIRED when the
   *  code kind is eligible — a missing base is a fail-loud wiring error, never a silent fallback to
   *  the spreadsheet base (which would collapse the ct-F2 fingerprint isolation). */
  codePreImageBase?: Omit<SemanticEpochPreImage, "layer1_ground_hash" | "child_contributions">;
}): Promise<SemanticMapStageResult> {
  if (resolveSemanticMapCapability(args.directiveAuthor) === "absent") {
    return { projectionByObservation: new Map(), census: null, censusPath: null, sidecarPath: null, aggregateFingerprint: null };
  }
  assertSemanticMapStageConfig(args.config);
  const codeEligible =
    args.codeKindOptIn === true &&
    resolveSemanticMapKinds(args.directiveAuthor).includes("code");
  const codePreImageBase = args.codePreImageBase;
  if (codeEligible && codePreImageBase === undefined) {
    throw new Error(
      "semantic-map stage: code kind is eligible (settings opt-in ∩ author 광고) but codePreImageBase is missing — the code prompt-contract sha cannot fold into code fingerprints (fail-loud wiring error; step 6 DD6).",
    );
  }
  // The author methods take the per-artifact union (DD7); this SPREADSHEET dispatch path narrows to
  // the spreadsheet view — the stage routing is the sole supplier, so a code input can never flow
  // through these bindings (code observations dispatch through their own typed bindings).
  const rawSynthesizeNode = args.directiveAuthor.synthesizeSemanticMapNode!.bind(
    args.directiveAuthor,
  ) as (input: SemanticSynthesisInput) => Promise<SemanticSynthesisOutput>;
  const rawVerifyBoundary = args.directiveAuthor.verifySemanticMapBoundary!.bind(
    args.directiveAuthor,
  ) as (input: SemanticBoundaryVerifyInput) => Promise<SemanticBoundaryVerification>;
  const cfg = args.config;
  const priorDispatchSpend = args.priorDispatchSpend ?? {
    synthesize: 0,
    verify: 0,
  };
  // 설계 B breaker (opt-in): 규칙 1 — systemic-class 실패는 캡된 지수 backoff의
  // per-item 재시도를 소진한 뒤에만 관찰 단위(final outcome)로 카운트된다.
  const breakerState =
    args.dispatchBreaker?.enabled === true
      ? new DispatchBreakerState(args.dispatchBreaker)
      : null;
  const breakerSleep = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));
  // Census honesty (W2-X7-001 spirit): breaker backoff retries SPEND provider
  // calls too — counted separately from the per-column first-attempt totals
  // and folded into the X7 budget checks below.
  const breakerRetryCalls = { synthesize: 0, verify: 0 };
  // Set on any successful provider dispatch inside the CURRENT observation —
  // the only evidence that the provider lane is alive (recordItemSuccess);
  // observations without it record as skipped (no liveness claim).
  let observationDispatchSucceeded = false;
  let breakerTrip: DispatchBreakerTripState | null = null;
  const breakerStructuredContributors = new Map<
    string,
    StructuredDispatchFailureEvidence
  >();
  const guardedDispatch = breakerState
    ? <T>(kind: "synthesize" | "verify", label: string, dispatch: () => Promise<T>): Promise<T> =>
        {
          args.directiveAuthor.setSemanticMapLogicalDispatchId?.(crypto.randomUUID());
          return runWithDispatchBackoff({
          label,
          policy: breakerState.policy,
          dispatch,
          sleep: breakerSleep,
          onRetry: () => {
            breakerRetryCalls[kind] += 1;
          },
        }).then((value) => {
          observationDispatchSucceeded = true;
          return value;
          });
        }
    : null;
  // OFF(기본) 경로는 raw author bind를 그대로 쓴다 — 래핑 비용 0.
  const synthesizeNode: typeof rawSynthesizeNode = guardedDispatch
    ? (input) =>
        guardedDispatch(
          "synthesize",
          `synthesize:${input.node_ref.sheet}#${input.node_ref.column_index}:${input.node_ref.row_start}-${input.node_ref.row_end}`,
          () => rawSynthesizeNode(input),
        )
    : rawSynthesizeNode;
  const verifyBoundary: typeof rawVerifyBoundary = guardedDispatch
    ? (input) =>
        guardedDispatch(
          "verify",
          `verify:${input.node_ref.sheet}#${input.node_ref.column_index}:${input.boundary.row}`,
          () => rawVerifyBoundary(input),
        )
    : rawVerifyBoundary;
  // Step 6 (DD7): the CODE dispatch bindings — the same author pair narrowed to the code view, with
  // file:line breaker labels. Only reached for eligible code observations.
  const rawCodeSynthesizeNode = args.directiveAuthor.synthesizeSemanticMapNode!.bind(
    args.directiveAuthor,
  ) as (input: CodeSemanticSynthesisInput) => Promise<CodeSemanticSynthesisOutput>;
  const rawCodeVerifyBoundary = args.directiveAuthor.verifySemanticMapBoundary!.bind(
    args.directiveAuthor,
  ) as (input: CodeSemanticBoundaryVerifyInput) => Promise<SemanticBoundaryVerification>;
  const codeSynthesizeNode: typeof rawCodeSynthesizeNode = guardedDispatch
    ? (input) =>
        guardedDispatch(
          "synthesize",
          `synthesize:${input.node_ref.file}:${input.node_ref.line_start}-${input.node_ref.line_end}`,
          () => rawCodeSynthesizeNode(input),
        )
    : rawCodeSynthesizeNode;
  const codeVerifyBoundary: typeof rawCodeVerifyBoundary = guardedDispatch
    ? (input) =>
        guardedDispatch(
          "verify",
          `verify:${input.node_ref.file}:${input.boundary.line}`,
          () => rawCodeVerifyBoundary(input),
        )
    : rawCodeVerifyBoundary;

  const projectionByObservation = new Map<string, SemanticMapAnyProjection>();
  const census: ReconstructSemanticMapCensus = {
    schema_version: "1",
    observations_total: 0,
    observations_map_present: 0,
    observations_map_absent: 0,
    synthesize_calls_total: 0,
    verify_calls_total: 0,
    max_synthesize_calls: cfg.max_synthesize_calls,
    max_verify_calls: cfg.max_verify_calls,
    author_id: args.directiveAuthor.authorId,
    synthesize_model_identity: args.preImageBase.reduce_reader_model_identity,
    verify_model_identity: args.verifyModelIdentity,
    by_observation: [],
  };
  const sidecarObservations: ReconstructSemanticMapSidecarObservation[] = [];
  const perObservationFingerprints: { observation_id: string; fingerprint: string }[] = [];
  const processedObservationIds = new Set<string>();

  const appendRetainedObservation = (observationId: string): boolean => {
    const retainedRow = args.recoveryContext?.retainedRowsByObservationId.get(observationId);
    if (!retainedRow) return false;
    const row = structuredClone(retainedRow);
    census.observations_total += 1;
    if (row.map_present) census.observations_map_present += 1;
    else census.observations_map_absent += 1;
    for (const column of row.columns) {
      census.synthesize_calls_total += column.synthesize_calls;
      census.verify_calls_total += column.verify_calls;
    }
    census.by_observation.push(row);
    if (row.fingerprint !== null) {
      perObservationFingerprints.push({
        observation_id: row.observation_id,
        fingerprint: row.fingerprint,
      });
    }
    const sidecarRow =
      args.recoveryContext?.retainedSidecarByObservationId.get(observationId);
    if (sidecarRow) {
      const retainedSidecar = structuredClone(sidecarRow);
      sidecarObservations.push(retainedSidecar);
      projectionByObservation.set(observationId, retainedSidecar.projection);
    }
    processedObservationIds.add(observationId);
    return true;
  };

  // ALWAYS persist census + sidecar when the stage ran (f1a3c1b honest-signal pattern): a total
  // semantic-map failure is a durable artifact, never silently absent. Doubles as the W3 manifest
  // step's artifact refs. Shared by the normal end AND the breaker-trip abort, so a tripped batch
  // still leaves the honest spend census behind.
  const persistCensusAndSidecar = async (): Promise<{
    censusPath: string;
    sidecarPath: string;
  }> => {
    const comprehensionDir = path.join(args.sessionRoot, "comprehension");
    await fs.mkdir(comprehensionDir, { recursive: true });
    const censusPath = path.join(comprehensionDir, "semantic-map-census.yaml");
    await writeYamlDocument(censusPath, census);
    const sidecarPath = path.join(comprehensionDir, "semantic-map.yaml");
    const sidecar: ReconstructSemanticMapSidecar = { schema_version: "1", observations: sidecarObservations };
    await writeYamlDocument(sidecarPath, sidecar);
    return { censusPath, sidecarPath };
  };

  // onto-W2 issue-003/006: a spreadsheet observation the stage cannot evaluate is RECORDED with an
  // explicit reason — by_observation stays a complete partition and the totals reconcile.
  const recordSkippedObservation = (
    observationId: string,
    skipReason: NonNullable<ReconstructSemanticMapCensusObservation["skip_reason"]>,
    skipDetail?: string,
    // 교차검증 xver-ct F1: skipped CODE rows carry the kind discriminator too — absent = spreadsheet
    // (artifact-types 규약), so a code-only skip reason on a discriminator-less row would be an
    // internally contradictory census row. Spreadsheet callers omit it (bytes unchanged).
    targetMaterialKind?: "code",
  ): void => {
    census.observations_total += 1;
    census.observations_map_absent += 1;
    census.by_observation.push({
      observation_id: observationId,
      ...(targetMaterialKind ? { target_material_kind: targetMaterialKind } : {}),
      map_present: false,
      skip_reason: skipReason,
      ...(skipDetail ? { skip_detail: skipDetail } : {}),
      fingerprint: null,
      columns: [],
    });
    processedObservationIds.add(observationId);
    // Breaker bookkeeping: a skipped observation owes no dispatch — completed
    // for recovery-set purposes, but it proves nothing about the provider
    // lane (recordItemSkipped, NOT recordItemSuccess: 성공 취급은 계통 streak을
    // 리셋해 outage 피해 아이템을 poison으로 오분류한다).
    breakerState?.recordItemSkipped(observationId);
  };

  // ── Step 6 (DD6/DD7/DD9): the CODE observation path — one FILE tree per observation, dispatched
  // through the same §3 bridge discipline (single-source envelope builder + drift-detector replay),
  // the same X7 caps, the same 설계 B breaker bookkeeping, and the same observation containment as
  // the spreadsheet column path. A failed/capped unit dooms the observation to the flat path (X5).
  const processCodeObservation = async (observation: SemanticMapObservation): Promise<void> => {
    const { inventory, unsupportedReason } = semanticMapCodeStructural(observation);
    if (unsupportedReason !== undefined) {
      // 리뷰 gf-F5: "v1 limit" (no bundled grammar) stays deterministically distinct from failure.
      recordSkippedObservation(observation.observation_id, "code_extraction_unsupported", unsupportedReason, "code");
      return;
    }
    if (!inventory) {
      recordSkippedObservation(observation.observation_id, "no_code_inventory", undefined, "code");
      return;
    }
    // §6-2: grammar-free ROUGH layout evidence is explicitly NOT fed to the LLM map stage — same
    // predicate/placement as the resume partition (semanticMapSkipReasonForCurrentObservation) so the
    // live and resume skip reasons never diverge (DD7 same-predicate discipline).
    if (inventory.extraction_tier === "layout") {
      recordSkippedObservation(observation.observation_id, "code_layout_tier_not_applicable", undefined, "code");
      return;
    }
    // DD6′ source admission (리뷰 ct M-1, fail-closed): frontier envelopes slice the
    // observation-time whole-capture excerpt — never a stage-time disk re-read (DD4 TOCTOU).
    // Shared predicate with the resume partition (DD7 discipline).
    const excerptGuardFailure = semanticMapCodeSourceExcerptGuardFailure(observation, inventory);
    if (excerptGuardFailure !== null) {
      recordSkippedObservation(observation.observation_id, "code_source_excerpt_unavailable", excerptGuardFailure, "code");
      return;
    }
    const sourceExcerpt = (observation.structural_data as Record<string, unknown>).content_excerpt as string;
    census.observations_total += 1;
    let breakerObservationFailure: {
      failureClass: ReturnType<typeof classifySystemicDispatchFailure>;
      message: string;
    } | null = null;
    observationDispatchSucceeded = false;
    try {
      const observationFingerprint = semanticMapCodeObservationFingerprint({
        observation,
        inventory,
        preImageBase: codePreImageBase!,
        verifyModelIdentity: args.verifyModelIdentity,
        config: cfg,
      });
      perObservationFingerprints.push({
        observation_id: observation.observation_id,
        fingerprint: observationFingerprint,
      });
      const file = observation.source_ref;
      const pushCodeObservationRow = (mapPresent: boolean, unitRow: ReconstructSemanticMapCensusCodeUnit): void => {
        if (mapPresent) census.observations_map_present += 1;
        else census.observations_map_absent += 1;
        census.by_observation.push({
          observation_id: observation.observation_id,
          target_material_kind: "code",
          map_present: mapPresent,
          skip_reason: null,
          fingerprint: observationFingerprint,
          columns: [unitRow],
        });
        processedObservationIds.add(observation.observation_id);
      };
      // An empty file (0 spans) is the spreadsheet empty-column analog: deterministic, not a failure.
      if (inventory.symbol_tiles.spans.length === 0) {
        pushCodeObservationRow(false, emptyCodeUnitRow(file, "empty", null));
        breakerState?.recordItemSkipped(observation.observation_id);
        return;
      }
      const { trace, nodesByKey } = foldCodeStructureInventory(file, inventory, cfg.fanin);
      const modes = classifyFrontierCore(trace, cfg.over_context_budget);
      let observationNeed = 0;
      for (const m of modes.values()) if (m !== "subsumed") observationNeed += 1;
      const preflightCapped =
        priorDispatchSpend.synthesize + census.synthesize_calls_total +
          breakerRetryCalls.synthesize + observationNeed >
        cfg.max_synthesize_calls;
      let synthesizeCalls = 0;
      let verifyCalls = 0;
      let unitRow: ReconstructSemanticMapCensusCodeUnit;
      let projection: CodeSemanticSeedProjection | null = null;
      const nodeEpochs: { key: string; subtree_epoch_contribution: string }[] = [];
      if (preflightCapped) {
        unitRow = emptyCodeUnitRow(file, "capped", `synthesize preflight: observation needs ${observationNeed}, budget remaining ${cfg.max_synthesize_calls - priorDispatchSpend.synthesize - census.synthesize_calls_total - breakerRetryCalls.synthesize} (X7)`);
      } else {
        try {
          // §3 bridge pre-compute — bottom-up, single-source envelope builder, full guards.
          // sourceExcerpt is guard-admitted above (sha-matched, untruncated — DD6′).
          const meta = buildCodeSynthesisMeta(file, inventory, sourceExcerpt);
          const preByKey = new Map<string, CodeSemanticMapBridgeRecord>();
          const summaryByKey = new Map<string, string>();
          const order: string[] = [];
          const seen = new Set<string>();
          const walk = (k: string): void => {
            if (seen.has(k)) return;
            seen.add(k);
            const tnode = trace.nodes.get(k);
            if (!tnode) throw new Error(`semantic-map stage: trace node missing for ${k}.`);
            for (const c of tnode.child_keys) walk(c);
            order.push(k);
          };
          walk(trace.root_key);
          for (const key of order) {
            if (modes.get(key) === "subsumed") continue;
            const input = buildCodeSynthesisInputForNode(meta, trace, nodesByKey, modes, key, summaryByKey);
            assertCodeSynthesisInputBounded(input); // source-safe envelope on the EXACT transmitted input (§3).
            const inputJson = stableJson(structuredClone(input));
            synthesizeCalls += 1; // attempt-counted at dispatch (W2-X7-001).
            const out = await codeSynthesizeNode(input);
            assertCodeSynthesisOutputBounded(out);
            summaryByKey.set(key, out.semantic_summary);
            const record: CodeSemanticMapBridgeRecord = { input_json: inputJson, output: structuredClone(out), verifies: [] };
            const reduceNode = nodesByKey.get(key);
            if (!reduceNode) throw new Error(`semantic-map stage: reduce node missing for ${key}.`);
            const { boundaries: classified } = reconcileCodeBoundaries(out.boundaries, reduceNode);
            const nodeRef = input.node_ref;
            for (const b of classified) {
              if (b.anchor_status !== "unanchored") continue;
              if (
                priorDispatchSpend.verify + census.verify_calls_total +
                  breakerRetryCalls.verify + verifyCalls + 1 >
                cfg.max_verify_calls
              ) {
                throw new SemanticMapVerifyCapExceeded(key, cfg.max_verify_calls);
              }
              const verifyInput: CodeSemanticBoundaryVerifyInput = {
                node_ref: { file: nodeRef.file, line_start: nodeRef.line_start, line_end: nodeRef.line_end },
                boundary: { ...b },
                summary: out.semantic_summary,
              };
              const verifyInputJson = stableJson(structuredClone(verifyInput));
              verifyCalls += 1; // attempt-counted at dispatch (W2-X7-001).
              const verdict = await codeVerifyBoundary(verifyInput);
              if (!(ADVERSARIAL_RESULTS as readonly string[]).includes(verdict)) {
                throw new Error(`semantic-map stage: author verify returned invalid verdict '${verdict}' at ${key} (fail-closed).`);
              }
              record.verifies.push({ input_json: verifyInputJson, verdict });
            }
            preByKey.set(key, record);
          }

          // The REAL module accumulate + projection (all fail-closed validators live in the core).
          const callbacks = buildCodeSemanticMapBridgeCallbacks(preByKey);
          const map = accumulateCodeSemanticMap(meta, trace, nodesByKey, {
            synthesize: callbacks.synthesize,
            verifyUnanchored: callbacks.verifyUnanchored,
            preImageBase: codePreImageBase!,
            overContextBudget: cfg.over_context_budget,
            seedBound: false, // the projection is the sole refuted-exclusion layer (module input contract).
          });
          // DD10: the CODE display cap (512) replaces the shared stage-config 60 — the shared cap
          // was the 109→60 starvation cut; the value folds into the code fingerprint above.
          projection = projectCodeSemanticMapToSeed(map, { maxNodes: CODE_SEMANTIC_MAP_MAX_NODES, maxDisclosure: cfg.max_disclosure });

          let anchored = 0;
          let unanchored = 0;
          let confirmed = 0;
          let refuted = 0;
          let producedNodes = 0;
          for (const node of map.values()) {
            if (node.reduce_read_attempt === "subsumed") continue;
            producedNodes += 1;
            for (const b of node.semantic_boundaries) {
              if (b.anchor_status === "anchored") anchored += 1;
              else {
                unanchored += 1;
                if (b.verification === "adversarial_confirmed") confirmed += 1;
                else if (b.verification === "adversarial_refuted") refuted += 1;
              }
            }
          }
          let fAcc = 0;
          let fFront = 0;
          let fSub = 0;
          for (const m of modes.values()) {
            if (m === "accumulating") fAcc += 1;
            else if (m === "frontier") fFront += 1;
            else fSub += 1;
          }
          census.synthesize_calls_total += synthesizeCalls;
          census.verify_calls_total += verifyCalls;
          unitRow = {
            file,
            status: "produced",
            reason: null,
            produced_nodes: producedNodes,
            frontier_accumulating: fAcc,
            frontier_frontier: fFront,
            frontier_subsumed: fSub,
            anchored,
            unanchored,
            adversarial_confirmed: confirmed,
            adversarial_refuted: refuted,
            synthesize_calls: synthesizeCalls,
            verify_calls: verifyCalls,
          };
          for (const [key, node] of map) {
            nodeEpochs.push({ key, subtree_epoch_contribution: node.subtree_epoch_contribution });
          }
          nodeEpochs.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
        } catch (error) {
          if (isGracefulTerminalSignal(error)) throw error;
          if (readReconstructLlmDispatchFailureError(error)) throw error;
          // Unit-level stage-owned fallback (X5): spent calls still counted (honest cost census).
          census.synthesize_calls_total += synthesizeCalls;
          census.verify_calls_total += verifyCalls;
          const capped = error instanceof SemanticMapVerifyCapExceeded;
          unitRow = {
            ...emptyCodeUnitRow(file, capped ? "capped" : "failed", (error as Error).message),
            synthesize_calls: synthesizeCalls,
            verify_calls: verifyCalls,
          };
          projection = null;
          if (breakerState && !capped) {
            const failureClass = readDispatchFailureClass(error);
            const structuredEvidence = readStructuredDispatchFailureEvidence(error);
            if (structuredEvidence?.failure_class === null) throw error;
            if (structuredEvidence) {
              breakerStructuredContributors.set(
                observation.observation_id,
                structuredClone(structuredEvidence),
              );
            }
            if (breakerObservationFailure === null || failureClass !== null) {
              breakerObservationFailure = {
                failureClass,
                message: (error as Error).message,
              };
            }
          }
        }
      }
      if (breakerState) {
        if (breakerObservationFailure !== null) {
          breakerTrip = breakerState.recordItemFailure({
            item_id: observation.observation_id,
            failure_class: breakerObservationFailure.failureClass,
            failure_message: breakerObservationFailure.message,
            attempt_count:
              breakerObservationFailure.failureClass !== null
                ? breakerState.policy.per_call_max_attempts
                : 1,
          });
        } else if (observationDispatchSucceeded) {
          breakerState.recordItemSuccess(observation.observation_id);
          if (!breakerState.policy.concurrent) {
            breakerStructuredContributors.clear();
          }
        } else {
          breakerState.recordItemSkipped(observation.observation_id);
        }
      }
      const mapPresent = projection !== null;
      if (mapPresent) {
        projectionByObservation.set(observation.observation_id, projection!);
        sidecarObservations.push({
          observation_id: observation.observation_id,
          target_material_kind: "code",
          projection: projection!,
          node_epochs: nodeEpochs,
        });
      }
      pushCodeObservationRow(mapPresent, unitRow);
    } catch (error) {
      if (isGracefulTerminalSignal(error)) throw error;
      if (readReconstructLlmDispatchFailureError(error)) throw error;
      if (readStructuredDispatchFailureEvidence(error)?.failure_class === null) {
        throw error;
      }
      // Deterministic-phase containment (ultracode audit A/B mirror): observations_total was already
      // counted; record the honest skip row directly.
      census.observations_map_absent += 1;
      census.by_observation.push({
        observation_id: observation.observation_id,
        target_material_kind: "code",
        map_present: false,
        skip_reason: "deterministic_phase_failed",
        skip_detail: (error as Error).message,
        fingerprint: null,
        columns: [],
      });
      processedObservationIds.add(observation.observation_id);
    }
  };

  const seenObservationIds = new Set<string>();
  // onto-W3 issue-004(a): cap ALLOCATION consumes a shared budget in processing order — process in
  // CANONICAL observation_id order so WHICH observations get capped is artifact-order-independent
  // (defense in depth: the reuse match separately folds the observations artifact hash, but the
  // stage itself should not be permutation-sensitive). Step 6 (DD7): the set is the ELIGIBLE
  // observations — spreadsheet always, code under 유효 kind (settings ∩ 광고).
  const eligibleObservations = semanticMapEligibleObservations(args.sourceObservations, codeEligible);
  for (const observation of eligibleObservations) {
    // W3 review W3-005: aggregate order-independence and the projection map are keyed by
    // observation_id — a duplicate would make the sort unstable and the map lossy. Fail loud.
    if (seenObservationIds.has(observation.observation_id)) {
      throw new Error(
        `semantic-map stage: duplicate observation_id '${observation.observation_id}' — fingerprint aggregation and the projection map require unique ids (fail-loud; W3-005).`,
      );
    }
    seenObservationIds.add(observation.observation_id);
    args.directiveAuthor.setSemanticMapDispatchContext?.(
      observation.observation_id,
      args.executionSource ?? "primary",
    );
    if (appendRetainedObservation(observation.observation_id)) {
      continue;
    }
    // Step 6 (DD7): kind routing — a code observation runs its own file-tree path; the spreadsheet
    // path below is byte-untouched. The breaker's batch-halt check mirrors the loop tail.
    if (observation.target_material_kind === "code") {
      await processCodeObservation(observation);
      if (breakerTrip) break;
      continue;
    }
    const inventory = observation.structural_data.workbook_inventory as
      | WorkbookStructuralInventory
      | undefined;
    if (!inventory) {
      recordSkippedObservation(observation.observation_id, "no_workbook_inventory");
      continue;
    }
    const tileSheets = inventory.segmented_value_tiles;
    if (!tileSheets || tileSheets.length === 0) {
      recordSkippedObservation(observation.observation_id, "no_value_tiles");
      continue;
    }
    census.observations_total += 1;

    // ── ultracode audit A/B (3-lens convergence, probe-confirmed): the design's §6 containment must
    // cover the DETERMINISTIC phase too — buildColumnLeaves/reduceColumnLeavesWithTrace/
    // classifyFrontier and the fingerprint helpers ran OUTSIDE any containment, so one malformed
    // inventory column (e.g. absent `segments` from an older adapter) crashed the ENTIRE reconstruct
    // run and erased the always-written census. Everything below is observation-contained: a
    // non-graceful throw dooms THIS observation to the flat path (honest skip row) and the run,
    // the sibling observations, and the census survive.
    try {
    // W3 §5 pre-execution fingerprint — computed BEFORE any of this observation's LLM calls and
    // regardless of outcome (leaf-read precedent: the DECISION to run is what the seed key tracks).
    // Folds: inventory identity (ⓐ) + BOTH model identities (F4) + prompt-contract sha (F6, via
    // preImageBase) + version knob + the WHOLE stage config (F2 topology · X7 caps · X9 projection
    // caps). VALUE only — never the map instance (denylist-guarded).
    const observationFingerprint = semanticMapObservationFingerprint({
      observation,
      inventory,
      preImageBase: args.preImageBase,
      verifyModelIdentity: args.verifyModelIdentity,
      config: cfg,
    });
    perObservationFingerprints.push({
      observation_id: observation.observation_id,
      fingerprint: observationFingerprint,
    });

    // Deterministic column tasks (canonical order = sheet-block order, then column order) built from
    // the FULL in-memory tiles (F7) BEFORE any LLM call — the synthesize preflight needs the counts.
    interface ColumnTask {
      sheet: string;
      column_index: number;
      trace: ReduceTopologyTrace | null; // null = empty column (no non-empty leaves)
      nodesByKey: Map<SemanticNodeKey, ComprehensionReduceNode> | null;
      modes: Map<SemanticNodeKey, FrontierMode> | null;
      producedCount: number;
    }
    const tasks: ColumnTask[] = [];
    for (const sheetTiles of tileSheets) {
      for (const column of sheetTiles.columns) {
        const leaves = buildColumnLeaves(sheetTiles.sheet, column, { leafCount: cfg.leaf_count });
        if (leaves.length === 0) {
          tasks.push({ sheet: sheetTiles.sheet, column_index: column.column_index, trace: null, nodesByKey: null, modes: null, producedCount: 0 });
          continue;
        }
        const { trace, nodesByKey } = reduceColumnLeavesWithTrace(leaves, cfg.fanin);
        const modes = classifyFrontier(trace, cfg.over_context_budget);
        let producedCount = 0;
        for (const m of modes.values()) if (m !== "subsumed") producedCount += 1;
        tasks.push({ sheet: sheetTiles.sheet, column_index: column.column_index, trace, nodesByKey, modes, producedCount });
      }
    }

    const columnRows: ReconstructSemanticMapCensusColumn[] = [];
    const columnProjections: SemanticSeedProjection[] = [];
    const nodeEpochs: { key: string; subtree_epoch_contribution: string }[] = [];
    let doomed: boolean = false;
    // 설계 B: the observation's FIRST breaker-relevant failure (systemic class
    // wins over item-local) — reported once at observation end.
    let breakerObservationFailure: {
      failureClass: ReturnType<typeof classifySystemicDispatchFailure>;
      message: string;
    } | null = null;
    observationDispatchSucceeded = false;

    // X7 synthesize PREFLIGHT — observation-granular against the REMAINING global budget, decided
    // before any of this observation's LLM calls (deterministic given canonical order).
    const observationNeed = tasks.reduce((s, t) => s + t.producedCount, 0);
    const preflightCapped =
      priorDispatchSpend.synthesize + census.synthesize_calls_total +
        breakerRetryCalls.synthesize + observationNeed >
      cfg.max_synthesize_calls;

    for (const task of tasks) {
      if (task.trace === null || task.nodesByKey === null || task.modes === null) {
        columnRows.push(emptySemanticMapColumnRow(task.sheet, task.column_index, "empty", null));
        continue;
      }
      if (preflightCapped) {
        columnRows.push(emptySemanticMapColumnRow(task.sheet, task.column_index, "capped", `synthesize preflight: observation needs ${observationNeed}, budget remaining ${cfg.max_synthesize_calls - priorDispatchSpend.synthesize - census.synthesize_calls_total - breakerRetryCalls.synthesize} (X7)`));
        doomed = true;
        continue;
      }
      if (doomed) {
        columnRows.push(emptySemanticMapColumnRow(task.sheet, task.column_index, "skipped_observation_fallback", "a sibling column failed/was capped — observation falls back to flat (X5); remaining LLM work skipped"));
        continue;
      }
      const { trace, nodesByKey, modes } = task;
      let synthesizeCalls = 0;
      let verifyCalls = 0;
      try {
        // ── §3 bridge pre-compute: bottom-up over produced nodes, single-source inputs, full guards.
        const preByKey = new Map<string, SemanticMapBridgeRecord>();
        const summaryByKey = new Map<SemanticNodeKey, string>();
        const order: SemanticNodeKey[] = [];
        const seen = new Set<SemanticNodeKey>();
        const walk = (k: SemanticNodeKey): void => {
          if (seen.has(k)) return;
          seen.add(k);
          const tnode = trace.nodes.get(k);
          if (!tnode) throw new Error(`semantic-map stage: trace node missing for ${k}.`);
          for (const c of tnode.child_keys) walk(c);
          order.push(k);
        };
        walk(trace.root_key);
        for (const key of order) {
          if (modes.get(key) === "subsumed") continue;
          const input = buildSynthesisInputForNode(trace, nodesByKey, modes, key, summaryByKey);
          assertSynthesisInputBounded(input); // source-safe envelope on the EXACT transmitted input (§3).
          const inputJson = stableJson(structuredClone(input));
          // Count the ATTEMPT at dispatch, not the success (W2 code review W2-X7-001: a dispatched
          // call that throws still spent the LLM budget — post-await increment under-reports).
          synthesizeCalls += 1;
          const out = await synthesizeNode(input);
          assertSynthesisOutputBounded(out);
          summaryByKey.set(key, out.semantic_summary);
          const record: SemanticMapBridgeRecord = { input_json: inputJson, output: structuredClone(out), verifies: [] };
          // Pre-verify every unanchored boundary via the SAME deterministic reconciliation the module
          // will run (exported single source) — recorded by FULL verifier input (X3).
          const reduceNode = nodesByKey.get(key);
          if (!reduceNode) throw new Error(`semantic-map stage: reduce node missing for ${key}.`);
          const { boundaries: classified } = reconcileBoundaries(out.boundaries, reduceNode);
          const nodeRef = input.node_ref;
          for (const b of classified) {
            if (b.anchor_status !== "unanchored") continue;
            if (
              priorDispatchSpend.verify + census.verify_calls_total +
                breakerRetryCalls.verify + verifyCalls + 1 >
              cfg.max_verify_calls
            ) {
              throw new SemanticMapVerifyCapExceeded(key, cfg.max_verify_calls);
            }
            const verifyInput: SemanticBoundaryVerifyInput = {
              node_ref: { sheet: nodeRef.sheet, column_index: nodeRef.column_index, row_start: nodeRef.row_start, row_end: nodeRef.row_end },
              boundary: { ...b },
              summary: out.semantic_summary,
            };
            const verifyInputJson = stableJson(structuredClone(verifyInput));
            verifyCalls += 1; // attempt-counted at dispatch (W2-X7-001).
            const verdict = await verifyBoundary(verifyInput);
            if (!(ADVERSARIAL_RESULTS as readonly string[]).includes(verdict)) {
              throw new Error(`semantic-map stage: author verify returned invalid verdict '${verdict}' at ${key} (fail-closed).`);
            }
            record.verifies.push({ input_json: verifyInputJson, verdict });
          }
          preByKey.set(key, record);
        }

        // ── the REAL module accumulate + projection (all fail-closed validators live here).
        const callbacks = buildSemanticMapBridgeCallbacks(preByKey);
        const map = accumulateSemanticMap(trace, nodesByKey, {
          synthesize: callbacks.synthesize,
          verifyUnanchored: callbacks.verifyUnanchored,
          preImageBase: args.preImageBase,
          overContextBudget: cfg.over_context_budget,
          seedBound: false, // the projection is the sole refuted-exclusion layer (module input contract).
        });
        const projection = projectSemanticMapToSeed(map, { maxNodes: cfg.max_nodes, maxDisclosure: cfg.max_disclosure });

        // ── census counts from the REAL accumulated map (not the author's raw output).
        let anchored = 0;
        let unanchored = 0;
        let confirmed = 0;
        let refuted = 0;
        let producedNodes = 0;
        for (const node of map.values()) {
          if (node.reduce_read_attempt === "subsumed") continue;
          producedNodes += 1;
          for (const b of node.semantic_boundaries) {
            if (b.anchor_status === "anchored") anchored += 1;
            else {
              unanchored += 1;
              if (b.verification === "adversarial_confirmed") confirmed += 1;
              else if (b.verification === "adversarial_refuted") refuted += 1;
            }
          }
        }
        let fAcc = 0;
        let fFront = 0;
        let fSub = 0;
        for (const m of modes.values()) {
          if (m === "accumulating") fAcc += 1;
          else if (m === "frontier") fFront += 1;
          else fSub += 1;
        }
        census.synthesize_calls_total += synthesizeCalls;
        census.verify_calls_total += verifyCalls;
        columnRows.push({
          sheet: task.sheet,
          column_index: task.column_index,
          status: "produced",
          reason: null,
          produced_nodes: producedNodes,
          frontier_accumulating: fAcc,
          frontier_frontier: fFront,
          frontier_subsumed: fSub,
          anchored,
          unanchored,
          adversarial_confirmed: confirmed,
          adversarial_refuted: refuted,
          synthesize_calls: synthesizeCalls,
          verify_calls: verifyCalls,
        });
        columnProjections.push(projection);
        for (const [key, node] of map) {
          nodeEpochs.push({ key, subtree_epoch_contribution: node.subtree_epoch_contribution });
        }
      } catch (error) {
        if (isGracefulTerminalSignal(error)) throw error;
        if (readReconstructLlmDispatchFailureError(error)) throw error;
        // Column-level stage-owned fallback (X5 — the strongest round-1 convergence): the module
        // stays fail-closed; a failed/capped column dooms the OBSERVATION to the flat path. Spent
        // calls are still counted (honest cost census).
        census.synthesize_calls_total += synthesizeCalls;
        census.verify_calls_total += verifyCalls;
        const capped = error instanceof SemanticMapVerifyCapExceeded;
        columnRows.push({
          ...emptySemanticMapColumnRow(task.sheet, task.column_index, capped ? "capped" : "failed", (error as Error).message),
          // Row-level spent-call honesty: the failed/capped column still SPENT these calls — the
          // per-column rows must sum to the census totals (no hidden spend).
          synthesize_calls: synthesizeCalls,
          verify_calls: verifyCalls,
        });
        doomed = true;
        if (breakerState && !capped) {
          // 마커 기반 분류: 디스패치를 실제로 거친 오류만 systemic 후보다 —
          // 결정적 stage 오류는 내용 유래 텍스트(시트명·행 범위)를 담아
          // substring 재분류가 오독한다. 남은 컬럼은 기존 doomed 가드가
          // 디스패치 없이 skip 행으로 기록하므로 추가 차단이 불필요하다.
          const failureClass = readDispatchFailureClass(error);
          const structuredEvidence = readStructuredDispatchFailureEvidence(error);
          if (structuredEvidence?.failure_class === null) throw error;
          if (structuredEvidence) {
            breakerStructuredContributors.set(
              observation.observation_id,
              structuredClone(structuredEvidence),
            );
          }
          if (breakerObservationFailure === null || failureClass !== null) {
            breakerObservationFailure = {
              failureClass,
              message: (error as Error).message,
            };
          }
        }
      }
    }
    if (breakerState) {
      if (breakerObservationFailure !== null) {
        // 트립이어도 여기서 throw하지 않는다: 이 관찰의 census 행 부기를
        // 마쳐 파티션·spend 대조 불변식을 지킨 뒤, 루프 밖 epilogue가
        // 영속과 halt를 수행한다.
        breakerTrip = breakerState.recordItemFailure({
          item_id: observation.observation_id,
          failure_class: breakerObservationFailure.failureClass,
          failure_message: breakerObservationFailure.message,
          attempt_count:
            breakerObservationFailure.failureClass !== null
              ? breakerState.policy.per_call_max_attempts
              : 1,
        });
      } else if (observationDispatchSucceeded) {
        breakerState.recordItemSuccess(observation.observation_id);
        if (!breakerState.policy.concurrent) {
          // Sequential success reclassifies the pending systemic streak as
          // item-local poison. Its structured rows are no longer activation
          // contributors for a later independent trip.
          breakerStructuredContributors.clear();
        }
      } else {
        // 디스패치 성공이 0회인 관찰(preflight-capped·빈 컬럼·전부 subsumed)
        // 은 프로바이더 생존을 증명하지 못한다 — 회복 집합 부기만 한다.
        breakerState.recordItemSkipped(observation.observation_id);
      }
    }

    const producedColumns = columnRows.filter((c) => c.status === "produced").length;
    const mapPresent = !doomed && producedColumns >= 1;
    if (mapPresent) {
      const merged = mergeSemanticSeedProjections(columnProjections, { max_nodes: cfg.max_nodes, max_disclosure: cfg.max_disclosure });
      projectionByObservation.set(observation.observation_id, merged);
      nodeEpochs.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
      sidecarObservations.push({ observation_id: observation.observation_id, projection: merged, node_epochs: nodeEpochs });
      census.observations_map_present += 1;
    } else {
      census.observations_map_absent += 1;
    }
    const observationRow: ReconstructSemanticMapCensusObservation = {
      observation_id: observation.observation_id,
      map_present: mapPresent,
      skip_reason: null,
      fingerprint: observationFingerprint,
      columns: columnRows,
    };
    census.by_observation.push(observationRow);
    processedObservationIds.add(observation.observation_id);
    } catch (error) {
      if (isGracefulTerminalSignal(error)) throw error;
      if (readReconstructLlmDispatchFailureError(error)) throw error;
      if (readStructuredDispatchFailureEvidence(error)?.failure_class === null) {
        throw error;
      }
      // Deterministic-phase containment (ultracode audit A/B): observations_total was already
      // counted; record the honest skip row directly (no double count). Spent LLM totals from the
      // column loop were already added inside its own catch before rethrow paths — the only throws
      // reaching here are pre/post-column deterministic failures.
      census.observations_map_absent += 1;
      census.by_observation.push({
        observation_id: observation.observation_id,
        map_present: false,
        skip_reason: "deterministic_phase_failed",
        skip_detail: (error as Error).message,
        fingerprint: null,
        columns: [],
      });
      processedObservationIds.add(observation.observation_id);
    }
    // 설계 B 트립: 이 관찰의 부기까지 마친 상태에서 배치를 멈춘다 — 남은
    // 관찰은 미디스패치로 incomplete 집합에 남는다.
    if (breakerTrip) break;
  }

  if (breakerTrip && args.recoveryContext) {
    for (const observation of eligibleObservations) {
      if (processedObservationIds.has(observation.observation_id)) continue;
      appendRetainedObservation(observation.observation_id);
    }
  }

  let dispatchIncompletePath: string | null = null;
  if (breakerState) {
    // 규칙 6 관측 상시화: breaker-ON 배치는 트립이든 완주든 end-state를
    // 영속해 회복 절차가 항상 정확한 재디스패치 집합을 갖는다. spend
    // 정직성: backoff 재시도 호출 수를 census에 병기한다.
    census.breaker_retry_synthesize_calls = breakerRetryCalls.synthesize;
    census.breaker_retry_verify_calls = breakerRetryCalls.verify;
    const plannedItemIds = eligibleObservations.map((o) => o.observation_id);
    const retainedCompletedItemIds =
      args.recoveryContext?.retainedCompletedItemIds ?? [];
    const retainedDeadLetter = args.recoveryContext?.retainedDeadLetter ?? [];
    const trip = breakerState.tripped();
    dispatchIncompletePath = await persistDispatchIncompleteArtifact({
      sessionRoot: args.sessionRoot,
      batchLabel: "semantic-map",
      plannedItemIds,
      completedItemIds: [
        ...retainedCompletedItemIds,
        ...breakerState.completedItemIds(),
      ],
      deadLetter: [
        ...retainedDeadLetter,
        ...breakerState.deadLetterEntries(),
      ],
      breaker: {
        tripped: trip !== null,
        failure_class: trip?.failure_class ?? null,
        consecutive_item_count: trip?.consecutive_item_count ?? null,
        threshold: breakerState.policy.systemic_threshold,
      },
    });
  }

  const { censusPath, sidecarPath } = await persistCensusAndSidecar();
  if (breakerTrip) {
    // 규칙 4: 배치 halt + 사용자 공지 — 공지에 미완료 목록 경로를 싣는다.
    throw new DispatchBreakerTrippedError(
      breakerTrip,
      dispatchIncompletePath,
      args.captureStructuredContributors
        ? {
            structuredContributors: [
              ...breakerStructuredContributors.values(),
            ],
          }
        : undefined,
    );
  }

  const aggregateFingerprint =
    perObservationFingerprints.length === 0
      ? null
      : sha256Text(
          stableJson(
            perObservationFingerprints
              .slice()
              .sort((a, b) => (a.observation_id < b.observation_id ? -1 : a.observation_id > b.observation_id ? 1 : 0)),
          ),
        );

  return { projectionByObservation, census, censusPath, sidecarPath, aggregateFingerprint };
}

/** Step 6 (DD7): the code sibling of emptySemanticMapColumnRow — one FILE unit per code observation. */
function emptyCodeUnitRow(
  file: string,
  status: ReconstructSemanticMapCensusCodeUnit["status"],
  reason: string | null,
): ReconstructSemanticMapCensusCodeUnit {
  return {
    file,
    status,
    reason,
    produced_nodes: 0,
    frontier_accumulating: 0,
    frontier_frontier: 0,
    frontier_subsumed: 0,
    anchored: 0,
    unanchored: 0,
    adversarial_confirmed: 0,
    adversarial_refuted: 0,
    synthesize_calls: 0,
    verify_calls: 0,
  };
}

function emptySemanticMapColumnRow(
  sheet: string,
  columnIndex: number,
  status: ReconstructSemanticMapCensusColumn["status"],
  reason: string | null,
): ReconstructSemanticMapCensusColumn {
  return {
    sheet,
    column_index: columnIndex,
    status,
    reason,
    produced_nodes: 0,
    frontier_accumulating: 0,
    frontier_frontier: 0,
    frontier_subsumed: 0,
    anchored: 0,
    unanchored: 0,
    adversarial_confirmed: 0,
    adversarial_refuted: 0,
    synthesize_calls: 0,
    verify_calls: 0,
  };
}
