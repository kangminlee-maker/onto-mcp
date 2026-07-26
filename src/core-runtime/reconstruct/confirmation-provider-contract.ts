/**
 * The confirmation-provider contract — the two points where a reconstruct run asks its caller to
 * confirm, rather than deciding for them.
 *
 * Sibling of directive-author-contract.ts: same boundary shape (one interface plus its per-call
 * argument types), different authority. The directive author WRITES; the confirmation provider
 * only ACCEPTS OR REJECTS — the chosen source purpose, and the authored ontology seed. Declaring it
 * apart from any realization is what lets the run and the manifest depend on the contract without
 * depending on how confirmation is actually obtained.
 */
import type {
  ReconstructOntologySeedArtifact,
  ReconstructOntologySeedValidationArtifact,
  ReconstructPurposeConfirmationArtifact,
  ReconstructSeedConfirmationArtifact,
  ReconstructSourcePurposeCandidatesArtifact,
  ReconstructSourcePurposeCandidatesValidationArtifact,
} from "./artifact-types.js";
import type { ReconstructExecutionTelemetryCollector } from "./execution-telemetry.js";

export interface ReconstructConfirmationProvider {
  readonly providerId: string;
  readonly owner: "host_or_user";
  /** Runtime-owned execution telemetry recorded by this provider's LLM calls. */
  readonly executionTelemetry?: ReconstructExecutionTelemetryCollector;
  /** Canonical confirmation-model identity ("<provider>/<model_id>") folded into the
   * resume reuse key (DET-1/CG-2; see ReconstructDirectiveAuthor.reuseModelIdentity). */
  readonly reuseModelIdentity?: string;
  confirmPurpose(
    input: ReconstructPurposeConfirmationInput,
  ): Promise<ReconstructPurposeConfirmationArtifact>;
  confirmOntologySeed(
    input: ReconstructSeedConfirmationInput,
  ): Promise<ReconstructSeedConfirmationArtifact>;
}

export interface ReconstructPurposeConfirmationInput {
  sessionId: string;
  sourcePurposeCandidates: ReconstructSourcePurposeCandidatesArtifact;
  sourcePurposeCandidatesRef: string;
  sourcePurposeCandidatesValidation:
    ReconstructSourcePurposeCandidatesValidationArtifact;
  sourcePurposeCandidatesValidationRef: string;
}

export interface ReconstructSeedConfirmationInput {
  sessionId: string;
  ontologySeed: ReconstructOntologySeedArtifact;
  ontologySeedRef: string;
  ontologySeedValidation: ReconstructOntologySeedValidationArtifact;
  ontologySeedValidationRef: string;
}
