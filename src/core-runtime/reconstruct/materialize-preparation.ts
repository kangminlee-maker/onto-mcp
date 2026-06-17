import crypto from "node:crypto";
import fs from "node:fs/promises";
import type { Stats } from "node:fs";
import path from "node:path";
import { atomicWriteYamlDocument as writeYamlDocument } from "../artifact-io.js";
import {
  aggregateTargetMaterialDetections,
  detectTargetMaterialRefs,
  type TargetMaterialKind,
  type TargetMaterialRefDetection,
} from "../target-material-kind.js";
import {
  observeSpreadsheetSource,
  SPREADSHEET_OBSERVER_ADAPTER_ID,
} from "../spreadsheet-structure-observer.js";
import type { SupportedModelRegistry } from "../discovery/supported-models.js";
import {
  validateSourceObservationBoundary,
  type ReconstructSourceObservation,
} from "./source-observations.js";
import {
  loadReconstructSourceProfiles,
  type ReconstructSourceProfile,
} from "./source-profiles.js";
import type {
  ReconstructPreparationArtifactRefs,
  ReconstructInitialSourceFrontierArtifact,
  ReconstructSelectedSourceProfileRef,
  ReconstructSourceInventoryArtifact,
  ReconstructSourceInventoryUnit,
  ReconstructSourceObservationsArtifact,
  ReconstructTargetMaterialProfileArtifact,
} from "./artifact-types.js";

export interface MaterializeReconstructPreparationArtifactsParams {
  sessionRoot: string;
  targetRefs: string[];
  profilesRoot: string;
  filesystemAllowedRoots?: string[];
}

const CONCRETE_TARGET_MATERIAL_KINDS = new Set<TargetMaterialKind>([
  "code",
  "spreadsheet",
  "document",
  "database",
]);

function isConcreteTargetMaterialKind(
  kind: TargetMaterialKind,
): kind is Exclude<TargetMaterialKind, "mixed" | "unknown"> {
  return CONCRETE_TARGET_MATERIAL_KINDS.has(kind);
}

function isoNow(): string {
  return new Date().toISOString();
}

function stableObservationId(args: {
  sourceRef: string;
  location: string;
}): string {
  const digest = crypto
    .createHash("sha256")
    .update(`${path.resolve(args.sourceRef)}\n${args.location}`)
    .digest("hex")
    .slice(0, 16);
  return `obs_${digest}`;
}

function supportForMaterial(args: {
  targetMaterialKind: TargetMaterialKind;
  selectedProfiles: ReconstructSelectedSourceProfileRef[];
}): {
  support_status: ReconstructTargetMaterialProfileArtifact["support_status"];
  unsupported_reason: string | null;
} {
  if (args.targetMaterialKind === "unknown") {
    return {
      support_status: "unknown",
      unsupported_reason: "runtime could not classify target material kind safely",
    };
  }
  if (args.targetMaterialKind === "mixed") {
    return {
      support_status: "partial_composite",
      unsupported_reason:
        "mixed target material kind is observed through per-ref source profiles; unsupported members are skipped with authority impact",
    };
  }
  if (args.selectedProfiles.length === 0) {
    return {
      support_status: "unsupported",
      unsupported_reason:
        "no reconstruct source profile exists for the detected target material kind",
    };
  }
  const runnableProfiles = args.selectedProfiles.filter((profile) =>
    isRunnableProfileRuntimeStatus(profile.runtime_implementation_status)
  );
  if (runnableProfiles.length === 0) {
    return {
      support_status: "unsupported",
      unsupported_reason:
        `selected source profile runtime status is ${args.selectedProfiles.map((profile) => profile.runtime_implementation_status).join(", ")}`,
    };
  }
  return {
    support_status: "partial",
    unsupported_reason:
      "source profile exists, but only minimal structural observation is implemented",
  };
}

function isRunnableProfileRuntimeStatus(status: string): boolean {
  return status === "partially_wired" || status === "wired" || status === "supported";
}

function inventoryUnitForMaterial(kind: TargetMaterialKind): string {
  switch (kind) {
    case "code":
      return "file_or_package_unit";
    case "spreadsheet":
      return "workbook_sheet_or_table_unit";
    case "document":
      return "section_heading_or_document_unit";
    case "database":
      return "schema_table_or_query_unit";
    case "mixed":
      return "per_member_material_unit";
    case "unknown":
      return "unknown_material_unit";
  }
}

function selectedProfileRefs(
  profiles: ReconstructSourceProfile[],
  candidates: TargetMaterialKind[],
): ReconstructSelectedSourceProfileRef[] {
  const selected: ReconstructSelectedSourceProfileRef[] = [];
  for (const kind of candidates) {
    const profile = defaultProfileForKind(profiles, kind);
    if (!profile) continue;
    selected.push({
      profile_id: profile.profile_id,
      target_material_kind: profile.target_material_kind,
      is_default_for_kind: profile.is_default_for_kind,
      definition_ref: profile.definition_ref,
      definition_sha256: profile.definition_sha256,
      profile_ref: profile.profile_path,
      contract_status: profile.contract_status,
      runtime_implementation_status: profile.runtime_implementation_status,
      schema_version: profile.schema_version,
      profile_version: profile.profile_version,
      migration_status: profile.migration_status,
      supersedes: profile.supersedes,
      replaced_by: profile.replaced_by,
      split_from: profile.split_from,
      split_into: profile.split_into,
      merged_from: profile.merged_from,
      merged_into: profile.merged_into,
      support_summary: profile.support_summary,
      scan_targets: profile.scan_targets,
    });
  }
  return selected;
}

function defaultProfileForKind(
  profiles: ReconstructSourceProfile[],
  kind: TargetMaterialKind,
): ReconstructSourceProfile | undefined {
  const matchingProfiles = profiles.filter((candidate) =>
    candidate.target_material_kind === kind
  );
  return matchingProfiles.find((candidate) => candidate.is_default_for_kind) ??
    matchingProfiles[0];
}

/**
 * Structural `content_excerpt` capture budgets (chars). Code and other kinds keep
 * a small leading-sample budget — the observation is a structural sample, not the
 * whole file. Text-readable document prose is captured whole so the document tail
 * (goals, milestones, decisions) reaches seed authoring instead of being lost to a
 * leading slice: a typical business/policy document is well within any modern model
 * window (e.g. ~12.5K chars ≈ ~3K tokens).
 *
 * Capture is MODEL-AGNOSTIC: it runs before the seed-stage (provider, model) is
 * resolved, so it captures up to a fixed `DOCUMENT_CAPTURE_CEILING_CHARS` ceiling
 * (a disk/pathological-input safety bound, NOT a window bound). The seed-stage
 * prompt PROJECTION then slices that captured prose to a dynamic, model-aware
 * budget (see deriveDocumentExcerptProjectionBudget + run.ts). The ceiling is set
 * comfortably above any projection budget so projection only ever narrows, never
 * needs more than was captured. A document longer than the ceiling is captured-
 * truncated (`excerpt_truncated`); one longer than the projection budget is
 * projection-truncated at the seed stage (recorded durably there). True
 * window-overflow recovery (selecting the relevant tail) is a later stage (see
 * development-records/design/20260616-large-input-observation).
 *
 * Material kind is detected by extension (target-material-kind.ts `DOCUMENT_EXTENSIONS`),
 * and `document` includes binary formats (.pdf/.docx/.ppt/.rtf) that `textStats` still
 * reads as UTF-8. Only text-readable document formats earn the whole-document budget —
 * a binary document keeps the small sample so we never capture the ceiling in decoded
 * binary bytes and spend the prompt on garbage; binary documents need an extraction step
 * before reconstruct. This set must be the text-prose subset of `DOCUMENT_EXTENSIONS`: an
 * extension that the classifier does not map to `document` (e.g. `.html`) would never
 * reach this budget, so listing it here would be dead and misleading.
 */
const DEFAULT_STRUCTURAL_EXCERPT_CHAR_LIMIT = 6000;
/**
 * Capture ceiling (chars) for whole-document prose. Static and model-agnostic —
 * the upper bound for both capture AND the dynamic projection clamp, so the
 * captured excerpt is always a superset of any projection. Set well above the
 * largest projection budget (opus/gpt-5.5 ~1M-token windows derive ~0.5M-char
 * budgets) to leave headroom; the absolute bound is disk, not a model window.
 */
export const DOCUMENT_CAPTURE_CEILING_CHARS = 5_000_000;
/**
 * Floor (chars) for the seed-stage document projection budget. The static value
 * used when the model window is unknown (mock realization, provider-only seat, an
 * unregistered model, or a registry entry without context_window_tokens). Equal to
 * the prior fixed document excerpt budget, so a model-unaware run is unchanged.
 */
export const DOCUMENT_EXCERPT_PROJECTION_FLOOR = 200_000;
/**
 * Fraction of the model context window the projection budget may consume, leaving
 * margin for prompt instructions, non-excerpt payload, output tokens, and
 * tokenization variance. Window-proportional (not a fixed char margin) so the
 * margin scales with the window (C1).
 */
const WINDOW_BUDGET_FRACTION = 0.5;
/**
 * Conservative LOWER bound on chars-per-token used to convert a token window into
 * a char budget. NOT the average (~4 for English): CJK-dense prose tokenizes to
 * far fewer chars per token (≈1 or below), so a low bound keeps the char budget
 * from implying more tokens than the window holds (C1). This is an approximation
 * pending a real tokenizer; the CJK-dense live fixture (P6) validates/calibrates
 * it, and the re-design trigger lowers it if even this conservative budget
 * overflows.
 */
const CHARS_PER_TOKEN_LB = 1;
/**
 * Chars reserved from the derived budget for the prompt's instructions, the
 * non-excerpt structural payload, and the model's output allowance — all of which
 * also consume the window alongside the document excerpt (C1).
 */
const PROMPT_OVERHEAD_RESERVE_CHARS = 50_000;

// Clamp integrity: the capture ceiling must be >= the projection floor so the
// derived budget's clamp(raw, FLOOR, CEILING) range is well-formed and the
// captured excerpt is always a superset of any projection (C4). A module-load
// assert fails fast on a future mis-edit of these constants.
if (DOCUMENT_EXCERPT_PROJECTION_FLOOR > DOCUMENT_CAPTURE_CEILING_CHARS) {
  throw new Error(
    "Invalid document excerpt budgets: DOCUMENT_EXCERPT_PROJECTION_FLOOR " +
      `(${DOCUMENT_EXCERPT_PROJECTION_FLOOR}) must be <= ` +
      `DOCUMENT_CAPTURE_CEILING_CHARS (${DOCUMENT_CAPTURE_CEILING_CHARS}).`,
  );
}

const TEXT_READABLE_DOCUMENT_EXTENSIONS = new Set([".md", ".txt", ".adoc"]);

/**
 * Derives the seed-stage document projection budget (chars) for the active
 * (provider, model) seat from its registered context window. Pure and total
 * (never throws): an unresolved provider/model, an unregistered pair, or an entry
 * without a window all fall back to the static FLOOR, so mock realization and
 * provider-only seats are unchanged.
 *
 * The route key is the MODEL provider (the registry key, e.g. "openai"), not the
 * runtime adapter provider (openai OAuth dispatches as "codex"; anthropic OAuth
 * stays "anthropic"). The caller passes the model provider so the default
 * gpt-5.5 OAuth seat resolves against `openai/gpt-5.5` (see reconstruct-api).
 *
 * This is the SINGLE model→budget conversion point: model literals never reach
 * the char-budget tuning constants, so G2/INV-CFG-1 stay satisfied.
 */
export function deriveDocumentExcerptProjectionBudget(
  route: { provider?: string; modelId?: string },
  registry: SupportedModelRegistry,
): number {
  if (!route.provider || !route.modelId) {
    return DOCUMENT_EXCERPT_PROJECTION_FLOOR;
  }
  const window = registry.supported_models.find(
    (entry) => entry.provider === route.provider && entry.model === route.modelId,
  )?.context_window_tokens;
  if (!window) return DOCUMENT_EXCERPT_PROJECTION_FLOOR;
  const raw =
    Math.floor(window * WINDOW_BUDGET_FRACTION * CHARS_PER_TOKEN_LB) -
    PROMPT_OVERHEAD_RESERVE_CHARS;
  return Math.min(
    Math.max(raw, DOCUMENT_EXCERPT_PROJECTION_FLOOR),
    DOCUMENT_CAPTURE_CEILING_CHARS,
  );
}

/**
 * A text-readable document earns the whole-document excerpt budget. Both the capture
 * (here) and the seed-stage prompt projection (run.ts) consult this single predicate so
 * a binary document (.pdf/.docx/.ppt/.rtf) is never expanded — neither the captured
 * artifact nor the prompt carries decoded binary bytes.
 */
export function isTextReadableDocumentExtension(
  extension: string | null | undefined,
): boolean {
  return (
    typeof extension === "string" &&
    TEXT_READABLE_DOCUMENT_EXTENSIONS.has(extension.toLowerCase())
  );
}

function structuralExcerptCharLimit(kind: TargetMaterialKind, ref: string): number {
  if (kind === "document" && isTextReadableDocumentExtension(path.extname(ref))) {
    return DOCUMENT_CAPTURE_CEILING_CHARS;
  }
  return DEFAULT_STRUCTURAL_EXCERPT_CHAR_LIMIT;
}

async function textStats(ref: string, excerptLimit: number): Promise<{
  line_count: number | null;
  char_count: number | null;
  content_sha256: string | null;
  content_excerpt: string | null;
  excerpt_truncated: boolean;
}> {
  try {
    const text = await fs.readFile(ref, "utf8");
    return {
      line_count: text.length === 0 ? 0 : text.split(/\r?\n/).length,
      char_count: text.length,
      content_sha256: crypto.createHash("sha256").update(text).digest("hex"),
      content_excerpt: text.slice(0, excerptLimit),
      excerpt_truncated: text.length > excerptLimit,
    };
  } catch {
    return {
      line_count: null,
      char_count: null,
      content_sha256: null,
      content_excerpt: null,
      excerpt_truncated: false,
    };
  }
}

export async function buildReconstructSourceObservation(
  detection: TargetMaterialRefDetection,
  lineage?: {
    roundId?: string | null;
    observationBatchId?: string | null;
    triggeringFrontierValidationRef?: string | null;
  },
): Promise<ReconstructSourceObservation | null> {
  if (!detection.exists || !isConcreteTargetMaterialKind(detection.kind)) {
    return null;
  }
  const extension = path.extname(detection.ref).toLowerCase();
  const location = detection.ref;
  // Re-observation runs after an earlier detection: the ref may have vanished
  // in between (TOCTOU). Treat a missing ref as nothing-to-observe (degrade to
  // null, like the !detection.exists guard above) instead of crashing the run
  // with an uncontextualized ENOENT. Other stat failures still propagate.
  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(detection.ref);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // ENOENT: the ref was deleted; ENOTDIR: a parent path component became a
    // file. Both mean the ref is no longer an observable source (TOCTOU), so
    // degrade to null. Other stat failures still propagate.
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    throw error;
  }
  // Spreadsheet sources route through the shared deterministic structure
  // observer instead of the generic raw-text path (design S1 §2.2 / §11).
  if (detection.kind === "spreadsheet") {
    return buildSpreadsheetSourceObservation({ detection, stat, location, lineage });
  }
  const stats = stat.isFile()
    ? await textStats(detection.ref, structuralExcerptCharLimit(detection.kind, detection.ref))
    : {
    line_count: null,
    char_count: null,
    content_sha256: null,
    content_excerpt: null,
    excerpt_truncated: false,
  };
  const observation: ReconstructSourceObservation = {
    observation_id: stableObservationId({
      sourceRef: detection.ref,
      location,
    }),
    round_id: lineage?.roundId ?? "initial_source_frontier",
    observation_batch_id:
      lineage?.observationBatchId ?? "source-observation-batch:initial",
    triggering_frontier_validation_ref:
      lineage?.triggeringFrontierValidationRef ?? null,
    target_material_kind: detection.kind,
    adapter_id: `minimal-${detection.kind}-structure-observer`,
    source_ref: detection.ref,
    location,
    summary: `${detection.kind} material observed at ${path.basename(detection.ref)}`,
    structural_data: {
      basename: path.basename(detection.ref),
      extension: extension || null,
      path_kind: stat.isDirectory() ? "directory" : "file",
      size_bytes: stat.isFile() ? stat.size : null,
      line_count: stats.line_count,
      char_count: stats.char_count,
      content_sha256: stats.content_sha256,
      content_excerpt: stats.content_excerpt,
      excerpt_truncated: stats.excerpt_truncated,
    },
  };

  const validation = validateSourceObservationBoundary(observation);
  if (!validation.valid) {
    throw new Error(
      `Invalid source observation boundary for ${detection.ref}: ${validation.violations.join("; ")}`,
    );
  }
  return observation;
}

/**
 * Observe a spreadsheet source through the shared structure observer (design S1
 * §2.2) — a deterministic, LLM-free structural inventory. Per channel
 * governance (§11 CHAN-1) the observation carries NO raw cell values: it never
 * emits the generic path's `content_excerpt` (which for a workbook would be raw
 * data values) and the inventory's aggregate-only vocab leaves `top_values`
 * absent. `content_sha256` is the RAW-byte hash (§11 HASH-1) surfaced at the
 * structural_data top level because downstream source-scout-pack admission reads
 * it there; the full inventory is nested under `workbook_inventory` as the
 * structural substrate the seed-authoring prompt observes. xlsx-family kinds are
 * not yet extractable (P4) and arrive here carrying an `unsupported_reason`.
 */
async function buildSpreadsheetSourceObservation(args: {
  detection: TargetMaterialRefDetection;
  stat: Stats;
  location: string;
  lineage?:
    | {
        roundId?: string | null;
        observationBatchId?: string | null;
        triggeringFrontierValidationRef?: string | null;
      }
    | undefined;
}): Promise<ReconstructSourceObservation> {
  const { detection, stat, location, lineage } = args;
  const basename = path.basename(detection.ref);
  const extension = path.extname(detection.ref).toLowerCase();
  const inventory = await observeSpreadsheetSource(detection.ref);
  const summary = inventory.unsupported_reason
    ? `spreadsheet workbook observed at ${basename} — extraction unsupported (${inventory.unsupported_reason}), structure_inspected_only`
    : `spreadsheet workbook observed at ${basename} — ${inventory.sheets.length} sheet(s), structure_inspected_only`;
  const observation: ReconstructSourceObservation = {
    observation_id: stableObservationId({ sourceRef: detection.ref, location }),
    round_id: lineage?.roundId ?? "initial_source_frontier",
    observation_batch_id:
      lineage?.observationBatchId ?? "source-observation-batch:initial",
    triggering_frontier_validation_ref:
      lineage?.triggeringFrontierValidationRef ?? null,
    target_material_kind: "spreadsheet",
    adapter_id: SPREADSHEET_OBSERVER_ADAPTER_ID,
    source_ref: detection.ref,
    location,
    summary,
    structural_data: {
      basename,
      extension: extension || null,
      path_kind: stat.isDirectory() ? "directory" : "file",
      size_bytes: stat.isFile() ? stat.size : null,
      // Raw-byte hash (§11 HASH-1) surfaced top-level for source-scout-pack
      // admission, which reads structural_data.content_sha256.
      content_sha256: inventory.content_sha256,
      workbook_inventory: inventory,
    },
  };

  const validation = validateSourceObservationBoundary(observation);
  if (!validation.valid) {
    throw new Error(
      `Invalid source observation boundary for ${detection.ref}: ${validation.violations.join("; ")}`,
    );
  }
  return observation;
}

function stableFrontierRefId(unit: ReconstructSourceInventoryUnit): string {
  const digest = crypto
    .createHash("sha256")
    .update(`${unit.target_material_kind}\n${path.resolve(unit.ref)}\n${unit.inventory_unit}`)
    .digest("hex")
    .slice(0, 16);
  return `frontier_initial_${digest}`;
}

function buildInitialSourceFrontier(args: {
  sessionId: string;
  inventory: ReconstructSourceInventoryArtifact;
}): ReconstructInitialSourceFrontierArtifact {
  return {
    schema_version: "1",
    session_id: args.sessionId,
    created_at: isoNow(),
    frontier_id: "initial",
    source_refs: args.inventory.inventory_units
      .filter((unit) => unit.scan_status === "planned")
      .map((unit) => ({
        frontier_ref_id: stableFrontierRefId(unit),
        source_ref: unit.ref,
        target_material_kind: unit.target_material_kind,
        inventory_unit: unit.inventory_unit,
        profile_ref: unit.profile_ref,
        rationale:
          "Initial source frontier derived from runtime material inventory and selected source profile.",
      })),
    skipped_refs: args.inventory.inventory_units
      .filter((unit) => unit.scan_status === "skipped")
      .map((unit) => ({
        source_ref: unit.ref,
        target_material_kind: unit.target_material_kind,
        reason: unit.skip_reason ?? "skipped",
        authority_impact:
          "Semantic artifacts cannot use this ref as trusted evidence until a supported material profile and observation exist.",
      })),
  };
}

function buildInventoryUnits(args: {
  detections: TargetMaterialRefDetection[];
  profiles: ReconstructSourceProfile[];
}): ReconstructSourceInventoryUnit[] {
  return args.detections.map((detection) => {
    const profile = defaultProfileForKind(args.profiles, detection.kind);
    const profileRef = profile?.profile_path ?? null;
    const runnable = profile
      ? isRunnableProfileRuntimeStatus(profile.runtime_implementation_status)
      : false;
    const planned = detection.exists &&
      isConcreteTargetMaterialKind(detection.kind) &&
      profileRef !== null &&
      runnable;
    return {
      ref: detection.ref,
      exists: detection.exists,
      target_material_kind: detection.kind,
      inventory_unit: inventoryUnitForMaterial(detection.kind),
      profile_ref: profileRef,
      scan_status: planned ? "planned" : "skipped",
      skip_reason: planned
        ? null
        : detection.exists
          ? profile
            ? `source profile ${profile.profile_id} runtime_implementation_status=${profile.runtime_implementation_status}`
            : `no reconstruct source profile for target_material_kind=${detection.kind}`
          : "target ref does not exist",
    };
  });
}

export async function materializeReconstructPreparationArtifacts(
  params: MaterializeReconstructPreparationArtifactsParams,
): Promise<ReconstructPreparationArtifactRefs> {
  if (params.targetRefs.length === 0) {
    throw new Error("targetRefs must not be empty.");
  }

  const sessionRoot = path.resolve(params.sessionRoot);
  const sessionId = path.basename(sessionRoot);
  const targetRefs = params.targetRefs.map((ref) => path.resolve(ref));
  const profiles = await loadReconstructSourceProfiles(params.profilesRoot);
  const perRefDetections = await detectTargetMaterialRefs(targetRefs);
  const detection = aggregateTargetMaterialDetections(perRefDetections);
  const profileCandidateKinds: TargetMaterialKind[] =
    detection.target_material_kind === "mixed"
      ? ["mixed", ...detection.target_material_kind_candidates]
      : [detection.target_material_kind];
  const selectedProfiles = selectedProfileRefs(
    profiles,
    profileCandidateKinds,
  );
  const support = supportForMaterial({
    targetMaterialKind: detection.target_material_kind,
    selectedProfiles,
  });

  const targetMaterialProfile: ReconstructTargetMaterialProfileArtifact = {
    schema_version: "1",
    session_id: sessionId,
    created_at: isoNow(),
    target_refs: targetRefs,
    target_material_kind: detection.target_material_kind,
    target_material_kind_candidates: detection.target_material_kind_candidates,
    support_status: support.support_status,
    unsupported_reason: support.unsupported_reason,
    selected_source_profiles: selectedProfiles,
    detection: {
      owner: "runtime_heuristic",
      confidence: detection.confidence,
      confidence_basis: detection.confidence_basis,
      per_ref: detection.per_ref,
    },
  };

  const inventory: ReconstructSourceInventoryArtifact = {
    schema_version: "1",
    session_id: sessionId,
    created_at: isoNow(),
    inventory_units: buildInventoryUnits({
      detections: detection.per_ref,
      profiles,
    }),
    scan_boundary: {
      filesystem_allowed_roots:
        params.filesystemAllowedRoots?.map((root) => path.resolve(root)) ?? [],
      source: "binding",
    },
  };
  const observations: ReconstructSourceObservation[] = [];
  const skippedRefs: ReconstructSourceObservationsArtifact["skipped_refs"] = [];
  for (const unit of inventory.inventory_units) {
    if (unit.scan_status === "skipped") {
      skippedRefs.push({
        ref: unit.ref,
        target_material_kind: unit.target_material_kind,
        reason: unit.skip_reason ?? "skipped",
      });
      continue;
    }
    const refDetection = detection.per_ref.find((candidate) => candidate.ref === unit.ref);
    if (!refDetection) continue;
    const observation = await buildReconstructSourceObservation(refDetection);
    if (observation) {
      observations.push(observation);
    } else {
      // buildReconstructSourceObservation returns null when the ref is no longer
      // a concrete, existing source at observation time (e.g. deleted between
      // detection and re-observation). Mark the inventory unit skipped — the
      // single source of truth that the initial frontier (built below), the
      // zero-observation halt, and later frontier admission all derive from — so
      // the vanished ref is excluded everywhere instead of being silently dropped
      // or re-queued by the deterministic first-frontier scout.
      unit.scan_status = "skipped";
      unit.skip_reason = "source ref unavailable at observation time";
      skippedRefs.push({
        ref: unit.ref,
        target_material_kind: unit.target_material_kind,
        reason: unit.skip_reason,
      });
    }
  }

  // Built after observation so refs marked skipped above (vanished mid-run) are
  // excluded from frontier source_refs rather than re-admitted later.
  const initialSourceFrontier = buildInitialSourceFrontier({
    sessionId,
    inventory,
  });

  const sourceObservations: ReconstructSourceObservationsArtifact = {
    schema_version: "1",
    session_id: sessionId,
    created_at: isoNow(),
    observations,
    skipped_refs: skippedRefs,
    validation_results: [
      "target_material_kind_valid",
      "source_profiles_resolved",
      "source_observation_boundary_valid",
    ],
  };

  const refs: ReconstructPreparationArtifactRefs = {
    target_material_profile: path.join(sessionRoot, "target-material-profile.yaml"),
    source_inventory: path.join(sessionRoot, "source-inventory.yaml"),
    initial_source_frontier: path.join(sessionRoot, "initial-source-frontier.yaml"),
    source_observations: path.join(sessionRoot, "source-observations.yaml"),
  };

  await Promise.all([
    writeYamlDocument(refs.target_material_profile, targetMaterialProfile),
    writeYamlDocument(refs.source_inventory, inventory),
    writeYamlDocument(refs.initial_source_frontier, initialSourceFrontier),
    writeYamlDocument(refs.source_observations, sourceObservations),
  ]);

  return refs;
}
