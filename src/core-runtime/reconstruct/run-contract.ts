import type { DispatchFallbackSettings } from "../discovery/settings-chain.js";
import type { DispatchBreakerPolicy } from "../llm/dispatch-breaker.js";
import { SemanticMapDispatchAccounting } from "../llm/sealed-dispatch-capability.js";
import type { ResolvedLlmDispatchCapability } from "../llm/sealed-dispatch-capability.js";
import type {
  ReconstructMetricsArtifact,
  ReconstructRecordArtifact,
  ReconstructRecordArtifactRefs,
  ReconstructRunManifestArtifact,
  ReconstructStopDecisionArtifact,
} from "./artifact-types.js";
import type { ReconstructConfirmationProvider } from "./confirmation-provider-contract.js";
import type { ReconstructDirectiveAuthor } from "./directive-author-contract.js";
import type {
  ReconstructConfirmationProviderRealization,
  ReconstructSemanticAuthorRealization,
} from "./run-manifest.js";

export interface RunReconstructParams {
  projectRoot: string;
  targetRefs: string[];
  intent: string;
  sessionRoot: string;
  profilesRoot: string;
  domain?: string;
  resumeMode?: "fresh" | "reuse_existing_authored_artifacts";
  filesystemAllowedRoots?: string[];
  semanticAuthorRealization: ReconstructSemanticAuthorRealization;
  confirmationProviderRealization: ReconstructConfirmationProviderRealization;
  directiveAuthor: ReconstructDirectiveAuthor;
  confirmationProvider: ReconstructConfirmationProvider;
  /** 설계 B: unattended-batch dispatch circuit breaker (default-off; resolved
   * from reconstruct.execution.dispatch_breaker settings by the caller). */
  dispatchBreaker?: DispatchBreakerPolicy;
  dispatchFallback?: DispatchFallbackSettings;
  dispatchFallbackRuntime?: ReconstructDispatchFallbackRuntime;
  /** Inventory CAPTURE opt-in (design 20260718 DD4 + 경계 결정 2026-07-20): code FILE
   *  observations carry the deterministic structure inventory. Set from
   *  reconstruct.execution.code_structure_inventory OR semantic_map_code (the map stage folds
   *  from the captured inventory, so the map opt-in implies capture). Absent = off. */
  codeStructureObservation?: boolean;
  /** Semantic-map code STAGE opt-in (DD7): set from reconstruct.execution.semantic_map_code
   *  only. Gates code-kind eligibility of the LLM map stage — never capture. Absent = off,
   *  so an inventory-only run (codeStructureObservation without this) keeps the stage
   *  spreadsheet-only. */
  semanticMapCode?: boolean;
  /** Phase 1b set-tier opt-in (FD1, deterministic 모드): set from
   *  reconstruct.execution.semantic_map_code_set_tier. Requires codeStructureObservation
   *  (enforced fail-loud at the api settings projection). Gates observer import capture and
   *  the post-loop deterministic set assembly. Absent = off. */
  codeSetTier?: boolean;
  /** Grammar-free layout observer opt-in (design 20260721 §7): set from
   *  reconstruct.execution.code_structure_layout. Requires codeStructureObservation (enforced
   *  fail-loud at the api settings projection). Extends deterministic code capture to tree-sitter
   *  UNSUPPORTED languages: (a) long-tail classification (Linguist unknown-fallback + extensionless
   *  shebang rung) so .lua/.hs/.vue … reach observation, and (b) the Tier 1 layout observer dispatch.
   *  Absent = off (byte-identical). */
  codeStructureLayout?: boolean;
  /** Environment context profile opt-in (design 20260720 env-context-profile §0, Stage 0): set
   *  from reconstruct.execution.environment_context_profile. Gates a deterministic, disclosure-only
   *  environment/tech-stack profile derived from the EXISTING observation census (no new fs scan,
   *  no seed impact). Independent of the code opt-ins. Absent = off (byte-identical, side-effect 0). */
  environmentContextProfile?: boolean;
  /** Manifest content_parse opt-in (design 20260721 env-context-profile Stage 3a): set from
   *  reconstruct.execution.environment_context_profile_content. AUGMENTS the base profile — statically
   *  reads known dependency manifests (package.json) for declared-dependency framework signals + closed
   *  properties. Inert unless environmentContextProfile is also on (nested inside its hook). Absent =
   *  off: no manifest content is read, the profile is byte-identical to Stage 0.5 (side-effect 0). */
  environmentContextProfileContent?: boolean;
  /** Stage 1 source-region-decomposition opt-in (design 20260722-source-region-decomposition-stage1
   *  §10 PR-1b-2, INVARIANT-CHANGE): set from reconstruct.execution.source_region_decomposition.
   *  When true, an eligible captured file is decomposed at observe time into one observation per
   *  region, and a maturation-closure source request's requested_location becomes a re-observed
   *  observation's anchor (both the identity/dedup keys AND the observe-time fanout change what
   *  "already observed" means for that ref — INVARIANT-CHANGE). Self-contained: independent of the
   *  code opt-ins. Absent = off — every observation stays whole-file, byte-identical. */
  sourceRegionDecomposition?: boolean;
  /** Core Stage 2 inter-document breadth opt-in: set from
   *  reconstruct.execution.source_admission_selection. When true AND the planned-unit count
   *  exceeds SOURCE_ADMISSION_SELECTION_THRESHOLD, materialize enters admission mode — units get
   *  a lightweight outline instead of unconditional deep observation, and a purpose-driven
   *  selection stage promotes the admitted ones. Under the threshold the deep-observe-all loop is
   *  byte-identical either way. Absent = off, byte-identical. */
  sourceAdmissionSelection?: boolean;
}

export interface ReconstructDispatchFallbackRuntime {
  accounting: SemanticMapDispatchAccounting;
  primary: {
    synthesize?: ResolvedLlmDispatchCapability;
    verify?: ResolvedLlmDispatchCapability;
  };
  fallback: {
    synthesize: ResolvedLlmDispatchCapability;
    verify: ResolvedLlmDispatchCapability;
    directiveAuthor: ReconstructDirectiveAuthor;
  };
}

export interface ReconstructRunResult {
  sessionId: string;
  sessionRoot: string;
  /**
   * "completed" = the run reached the terminal pipeline. "blocked"/"limited" = a graceful
   * terminal (Slice 3): the run stopped early with an honest assembled output instead of
   * crashing. This is an immediate-return mirror of the durable authority
   * (ReconstructRecordArtifact.terminal_disposition); re-read/poll consumers read the record.
   */
  status: "completed" | "limited" | "blocked";
  finalOutputPath: string;
  finalOutputText: string;
  reconstructRecordPath: string;
  reconstructRunManifestPath: string;
  artifactRefs: ReconstructRecordArtifactRefs & {
    reconstruct_record: string;
  };
  reconstructRecord: ReconstructRecordArtifact;
  reconstructRunManifest: ReconstructRunManifestArtifact;
  /**
   * Present only on a completed run. Absent on a graceful terminal (blocked/limited) — those
   * stages were never reached. Consumers must narrow on `status` before reading.
   */
  metrics?: ReconstructMetricsArtifact;
  stopDecision?: ReconstructStopDecisionArtifact;
}
