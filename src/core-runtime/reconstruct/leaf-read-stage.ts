/**
 * The spreadsheet leaf-read stage — a targeted second look at the cells a structural inventory
 * could not settle.
 *
 * The structure observer profiles a workbook without reading every value; where that leaves a leaf
 * ambiguous (low-confidence label, structurally incomplete region), this stage asks the directive
 * author to label just those leaves and writes the answer as a comprehension artifact. It owns its
 * own resume epoch (`LEAF_READ_COMPREHENSION_VERSION` plus the folded trigger config, prompt, and
 * inventory reuse inputs), so a seed authored under an older read-set is never silently reused.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { atomicWriteYamlDocument as writeYamlDocument } from "../artifact-io.js";
import type { WorkbookStructuralInventory } from "../spreadsheet-structure-observer.js";
import type { ReconstructSourceObservationsArtifact } from "./artifact-types.js";
import {
  COMPREHENSION_ARTIFACT_CONTRACT_VERSION,
  buildLlmComprehensionArtifact,
  validateComprehensionArtifact,
} from "./comprehension-artifact.js";
import type {
  ComprehensionArtifact,
  LeafReadLabel,
  LeafReadProducedResult,
} from "./comprehension-artifact.js";
import type { ReconstructDirectiveAuthor } from "./directive-author-contract.js";
import { isGracefulTerminalSignal } from "./graceful-terminal.js";
import {
  DEFAULT_STRUCTURE_LEAF_TRIGGER_OPTS,
  extractStructureLeafEvidence,
  leafReadPromptSha256,
  structureLeafTriggerLogicSha256,
} from "./leaf-reader.js";
import type { LeafReadOutcome, StructureLeafTriggerOpts } from "./leaf-reader.js";
import { readReconstructLlmDispatchFailureError } from "./llm-dispatch-failure.js";
import { llmTouchFingerprint } from "./llm-touch-fingerprint.js";
import type { LlmTouchPreExecutionPreImage } from "./llm-touch-fingerprint.js";
import { sha256Text, stableJson } from "./run-primitives.js";
import {
  workbookInventoryAdapterVersion,
  workbookInventoryDataLayerCaps,
  workbookInventoryValueTileConfig,
} from "./workbook-inventory-reuse-inputs.js";

/** Non-authoritative manual-invalidation knob for the leaf-read epoch (ⓑ); bump to force a rotation
 *  independent of model/prompt identity. ⚠️ The read-set-shaping LOGIC (the isStructureIncomplete
 *  predicate + the residual ordering in leaf-reader.ts) is NOT auto-folded — only the trigger CONFIG
 *  (structure_leaf_trigger_config) and the prompt hash are. A change to that predicate/ordering code
 *  MUST bump this knob (until a predicate-fingerprint fold lands; gate follow-up). Bumped from
 *  "p1-c2-a:1" because P1-C2-B′ changed the read-set logic (low-confidence-only → +structure-incomplete). */
// Bumped p1-c2-b-prime:1 → :2 with the leaf-read production-wiring fix (telemetry-unit mapping +
// leaf_read stage id). The fix flips leaf-read from total-failure to functional WITHOUT touching the
// trigger logic or prompt, so none of the other fingerprint inputs rotate; bumping this rotates the
// resume key so a seed authored during the broken window (zero labels) is NOT silently reused after
// the fix (R9-03 / DET-1 class — the silent-stale this track exists to prevent).
const LEAF_READ_COMPREHENSION_VERSION = "p1-c2-b-prime:2";

interface LeafReadStageResult {
  /** llm-edition ComprehensionArtifacts produced for structure-incomplete regions, by observation_id. */
  artifactsByObservation: Map<string, ComprehensionArtifact>;
  /** Order-independent aggregate (R8) of the per-observation leaf-read fingerprints; null when no
   *  region triggered a leaf-read. Folded into the seed reuse key (R2). */
  aggregateFingerprint: string | null;
  /** P1-C2-B′ §2.2 honest "not examined (capped)" census, by observation_id — read-candidates the
   *  fan-out cap left UNREAD (formatted "colN (name)"); surfaced to the consumer in Step E so it
   *  never assumes they were understood (gate RB6). Empty when nothing was capped. */
  cappedColumnsByObservation: Map<string, string[]>;
  /** R9 honest-signal (leaf-read production-wiring fix): path to the always-written leaf-read census
   *  artifact — the durable evidence surface that distinguishes "attempted but produced nothing"
   *  (e.g. every region failed) from "never ran". Doubles as the leaf_read manifest step's artifact
   *  ref. Null only when the stage no-ops (author has no readLeafLabels). */
  censusPath: string | null;
}

/** R9 honest-signal census for the leaf-read stage. Always written when the stage runs (even with
 *  zero regions/labels) so a total leaf-read failure is recorded, not silently absent. NOT folded
 *  into any reuse key — it is a runtime evidence record (like runtime-events), not authored. */
interface LeafReadCensus {
  schema_version: "1";
  comprehension_version: string;
  /** Spreadsheet observations the stage examined. */
  spreadsheet_observations: number;
  regions_attempted: number;
  /** Regions that yielded ≥1 provisional label. */
  regions_produced: number;
  /** Regions the LLM read but returned no usable label (honest non-defect). */
  regions_unread: number;
  /** Regions whose read hard-failed (the silent-defect class this census surfaces). */
  regions_failed: number;
  produced_label_count: number;
  /** True when the stage attempted ≥1 region but produced ZERO labels — the "leaf-read is broken /
   *  systematically failing" signal that used to be indistinguishable from "no regions to read". */
  all_attempts_failed: boolean;
  by_observation: {
    observation_id: string;
    regions_attempted: number;
    regions_produced: number;
    regions_unread: number;
    regions_failed: number;
    produced_labels: number;
    capped_columns: number;
  }[];
}

/**
 * P1-C2-A post-observation leaf-read stage (§11 Step D). For each spreadsheet observation with a
 * low-confidence (unstructured) region, run the FIRST LLM-touch (the leaf-reader) and build a
 * SEPARATE Layer-2 ComprehensionArtifact (the embedded deterministic companion is untouched, R1).
 * Returns the produced artifacts (joined by observation_id) and the order-independent aggregate of
 * the per-observation llm_touch_fingerprints — the VALUE the seed reuse key folds (R2/R8), never the
 * leaf-read output. A failed/empty read leaves the region to the deterministic companion (degrade);
 * the fingerprint is still computed (pre-execution ⓐ+ⓑ) so a model swap rotates the seed key even
 * when the read produced nothing.
 */
export async function runSpreadsheetLeafReadStage(args: {
  sourceObservations: ReconstructSourceObservationsArtifact;
  directiveAuthor: ReconstructDirectiveAuthor;
  sessionRoot: string;
  /** P1-C2-B′ §2.2 deterministic structure-incompleteness trigger config (bounded fan-out). Folded
   *  into the fingerprint ⓑ so re-tuning rotates the reuse key. Defaults to the PRELIMINARY constant. */
  triggerOpts?: StructureLeafTriggerOpts;
}): Promise<LeafReadStageResult> {
  const triggerOpts = args.triggerOpts ?? DEFAULT_STRUCTURE_LEAF_TRIGGER_OPTS;
  const artifactsByObservation = new Map<string, ComprehensionArtifact>();
  const cappedColumnsByObservation = new Map<string, string[]>();
  const perObservationFingerprints: { observation_id: string; fingerprint: string }[] = [];
  const readLeaf = args.directiveAuthor.readLeafLabels?.bind(args.directiveAuthor);
  // No-op when the author cannot leaf-read (e.g. baseline A/B harness). No census — the leaf_read
  // manifest step is then `skipped`, honestly distinct from "ran and produced nothing".
  if (!readLeaf) {
    return {
      artifactsByObservation,
      aggregateFingerprint: null,
      cappedColumnsByObservation,
      censusPath: null,
    };
  }
  const census: LeafReadCensus = {
    schema_version: "1",
    comprehension_version: LEAF_READ_COMPREHENSION_VERSION,
    spreadsheet_observations: 0,
    regions_attempted: 0,
    regions_produced: 0,
    regions_unread: 0,
    regions_failed: 0,
    produced_label_count: 0,
    all_attempts_failed: false,
    by_observation: [],
  };

  // ⓑ pre-execution LLM-touch pre-image — known before any leaf-read call (model/prompt identity +
  // the deterministic trigger config that shaped the read-set). The route residue (adapter/billing/
  // effort) is not threaded yet; the model identity + prompt hash + version + trigger config are the
  // load-bearing rotation triggers (DET-1).
  const preExecution: LlmTouchPreExecutionPreImage = {
    leaf_reader_model_identity: args.directiveAuthor.reuseModelIdentity ?? "unspecified",
    execution_adapter: null,
    declared_billing_mode: null,
    reasoning_effort: null,
    leaf_prompt_sha256: leafReadPromptSha256(),
    schema_tool_version: `leaf-read:v${COMPREHENSION_ARTIFACT_CONTRACT_VERSION}`,
    comprehension_version: LEAF_READ_COMPREHENSION_VERSION,
    structure_leaf_trigger_config: triggerOpts,
    read_set_logic_sha256: structureLeafTriggerLogicSha256(),
  };

  const comprehensionDir = path.join(args.sessionRoot, "comprehension");
  for (const observation of args.sourceObservations.observations) {
    if (observation.target_material_kind !== "spreadsheet") continue;
    const inventory = observation.structural_data.workbook_inventory as
      | WorkbookStructuralInventory
      | undefined;
    if (!inventory) continue;
    census.spreadsheet_observations += 1;
    // Deterministic structure-incompleteness trigger (P1-C2-B′): low-confidence sheets are still
    // ALWAYS read (no regression) PLUS structure-incomplete high-confidence columns up to the cap.
    const { regions, capped_columns } = extractStructureLeafEvidence(inventory, triggerOpts);
    // Record the honest capped census regardless of whether any region was read (Step E marking).
    if (capped_columns.length > 0) {
      cappedColumnsByObservation.set(
        observation.observation_id,
        capped_columns.map((c) => `col${c.column_index}${c.column_name ? ` (${c.column_name})` : ""}`),
      );
    }

    // Per-observation leaf-read outcome tally (R9 honest-signal census). Recorded for every
    // spreadsheet observation, including those with zero regions or zero produced labels.
    let regionsProduced = 0;
    let regionsUnread = 0;
    let regionsFailed = 0;
    let producedLabels = 0;

    if (regions.length > 0) {
      // The fingerprint is per-observation (ⓐ from this observation's inventory + run-global ⓑ) and is
      // recorded regardless of read outcome — the decision to leaf-read is what the seed key tracks.
      const fingerprint = llmTouchFingerprint(
        {
          content_sha256:
            typeof observation.structural_data.content_sha256 === "string"
              ? observation.structural_data.content_sha256
              : "",
          adapter_version: workbookInventoryAdapterVersion(inventory) ?? 0,
          value_tile_config: workbookInventoryValueTileConfig(inventory),
          data_layer_caps: workbookInventoryDataLayerCaps(inventory),
        },
        preExecution,
      ).fingerprint_sha256;
      perObservationFingerprints.push({
        observation_id: observation.observation_id,
        fingerprint,
      });

      const labels: LeafReadLabel[] = [];
      for (const region of regions) {
        let outcome: LeafReadOutcome;
        try {
          outcome = await readLeaf(region);
        } catch (error) {
          if (isGracefulTerminalSignal(error)) throw error;
          if (readReconstructLlmDispatchFailureError(error)) throw error;
          // The author's readLeafLabels already degrades hard failures to {kind:'failed'}; a throw
          // here is unexpected — degrade defensively (never abort the run for a leaf-read, §11 R9).
          outcome = { kind: "failed", reason: `leaf-read threw: ${(error as Error).message}` };
        }
        if (outcome.kind === "produced") {
          labels.push(...outcome.result.labels);
          regionsProduced += 1;
        } else if (outcome.kind === "unread") {
          regionsUnread += 1;
        } else {
          regionsFailed += 1;
        }
      }
      producedLabels = labels.length;

      if (labels.length > 0) {
        const leafRead: LeafReadProducedResult = {
          labels,
          limiting_region_ref: `${observation.observation_id}:structure_incomplete`,
          limiting_reason:
            "low header_confidence and/or structure-incomplete region(s); columns captured provisionally from value-tile signatures",
        };
        const artifact = buildLlmComprehensionArtifact({
          observationId: observation.observation_id,
          inventory,
          leafRead,
          fingerprint,
        });
        const violations: string[] = [];
        validateComprehensionArtifact(artifact, violations);
        if (violations.length > 0) {
          throw new Error(
            `leaf-read comprehension artifact failed validation for ${observation.observation_id}: ${violations.join("; ")}`,
          );
        }
        artifactsByObservation.set(observation.observation_id, artifact);

        // Persist as a sidecar joined by observation_id (consumed by the prompt projection in Step E;
        // audit trail meanwhile). The seed reuse key folds the fingerprint VALUE, not this file.
        await fs.mkdir(comprehensionDir, { recursive: true });
        await writeYamlDocument(
          path.join(comprehensionDir, `${observation.observation_id}.leaf-read.yaml`),
          artifact,
        );
      }
    }

    census.regions_attempted += regions.length;
    census.regions_produced += regionsProduced;
    census.regions_unread += regionsUnread;
    census.regions_failed += regionsFailed;
    census.produced_label_count += producedLabels;
    census.by_observation.push({
      observation_id: observation.observation_id,
      regions_attempted: regions.length,
      regions_produced: regionsProduced,
      regions_unread: regionsUnread,
      regions_failed: regionsFailed,
      produced_labels: producedLabels,
      capped_columns: capped_columns.length,
    });
  }

  // R9 honest-signal: ALWAYS persist the census when the stage ran (even zero regions/labels), so a
  // total leaf-read failure is recorded as a durable artifact, not silently absent. Doubles as the
  // leaf_read manifest step's artifact ref.
  census.all_attempts_failed =
    census.regions_attempted > 0 && census.produced_label_count === 0;
  await fs.mkdir(comprehensionDir, { recursive: true });
  const censusPath = path.join(comprehensionDir, "leaf-read-census.yaml");
  await writeYamlDocument(censusPath, census);

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
  return { artifactsByObservation, aggregateFingerprint, cappedColumnsByObservation, censusPath };
}
