/**
 * Graceful terminal — the vocabulary for stopping a reconstruct run on a "normal but unmet"
 * condition instead of crashing (design §16).
 *
 * Three things belong together here and nowhere else: the signal the throwing site raises, the
 * narrow guard every defensive catch uses so the signal is never swallowed into a failure counter,
 * and the two deterministic judges that decide whether a given halt is normal-unmet at all
 * (zero-observation eligibility; seed-readiness routing). Assembly of the resulting blocked/limited
 * output stays in the run orchestrator, which owns the artifacts on disk.
 */
import path from "node:path";
import type {
  ReconstructSeedAuthoringReadinessClassification,
  ReconstructSourceInventoryArtifact,
  ReconstructSourceObservationsArtifact,
  ReconstructStageId,
} from "./artifact-types.js";
import type {
  ReconstructRecordArtifactRefs,
  ReconstructTargetMaterialProfileArtifact,
} from "./artifact-types.js";
import type { ReconstructContractRegistry } from "./contract-registry.js";

/**
 * Graceful-terminal control signal (Slice 3, design §16.1). NOT an Error subclass — the run-level
 * catch distinguishes it from a genuine crash by `instanceof`, converting an expected
 * "normal-but-unmet" stop (e.g. zero observations from an unsupported/empty target) into an honest
 * blocked/limited assembled output instead of a thrown failure. The throwing site (design §16.2)
 * carries the deterministic disposition, the terminal stage id, and a diagnostic reason; the
 * catch-side assembleGracefulTerminal reads the reached artifacts from disk (design §16.5).
 */
export class GracefulTerminalSignal {
  readonly disposition: "blocked" | "limited";
  readonly terminalStepId: ReconstructStageId;
  readonly reason: string;
  constructor(args: {
    disposition: "blocked" | "limited";
    terminalStepId: ReconstructStageId;
    reason: string;
  }) {
    this.disposition = args.disposition;
    this.terminalStepId = args.terminalStepId;
    this.reason = args.reason;
  }
}

/**
 * Narrow guard used by every defensive catch that does not unconditionally rethrow, so a graceful
 * terminal signal is never swallowed into a failure counter or degraded result (design §16.4, N5').
 * The structure guard check-graceful-signal-rethrow enforces its presence.
 */
export function isGracefulTerminalSignal(
  value: unknown,
): value is GracefulTerminalSignal {
  return value instanceof GracefulTerminalSignal;
}

/**
 * Site 6 routing (sites356 design §4.2): which VALID seed-readiness classifications are a
 * normal-unmet graceful terminal vs a bug class that must keep crashing. Exhaustive over the
 * classification type so a new enum value is a compile error — an explicit decision, never an
 * implicit graceful conversion (positive-precondition principle).
 *
 * crash_bug_class rationale (masking-lens HIGH, re-verified against code): blocked_validation_gap
 * means one of six upstream validations — each asserted valid on the live path BEFORE the
 * readiness builder re-reads it — is missing/invalid seconds later (corruption / path bug / resume
 * anomaly). blocked_no_authority means the selected-purpose lookup that confirmPurpose already
 * resolved (or threw on) failed in the builder. purpose_confirmation_required needs a VALID
 * confirmation validation carrying must_project_blocked, which the validator never emits without a
 * violation (→ invalid → earlier crash), and site 5 pre-empts the cannot-confirm case. All three
 * fall through to assertSeedAuthoringReadinessAllowsSeed, which stays their live fail-loud gate.
 */
export const SEED_READINESS_TERMINAL_ROUTE: Record<
  ReconstructSeedAuthoringReadinessClassification,
  "allows_seed" | "graceful_blocked" | "crash_bug_class"
> = {
  seed_ready: "allows_seed",
  limited_seed_possible: "allows_seed",
  frontier_required: "graceful_blocked",
  purpose_confirmation_required: "crash_bug_class",
  blocked_no_authority: "crash_bug_class",
  blocked_validation_gap: "crash_bug_class",
};

/**
 * Classifies whether a zero-observation run is a graceful blocked terminal (design §16.2) rather
 * than a crash. Eligible only when there are no observations AND no inventory unit remains that the
 * run *intended* to observe but did not — §16.2's "planned인데 미관측 unit 0". Without admission that
 * is exactly "every unit was skipped" (unsupported format / vanished ref).
 *
 * `source_admission_selection` adds a state §16.2 predates: a unit stays `admitted` (promotion never
 * rewrites scan_status) but was deliberately NOT attempted this run — deferred with its outline
 * retained. A deferred unit was never intended for observation, so it must not pin an all-vanished
 * run into the crash branch. Pass `attemptedSourceRefs` — the resolved refs the admission stage
 * actually tried to deep-observe (accepted ∩ file-limit cap) — and only those admitted units count
 * against eligibility. Omit it and the predicate is identical to the pre-admission rule.
 *
 * A supported target that simply yields no rows keeps ≥1 planned unit and stays ineligible, so the
 * zero-observation evidence gate still crashes on genuinely empty evidence (N-elig control). An
 * *attempted* unit that produced neither an observation nor a `skipped` demotion is a producer
 * desync and likewise stays a crash. Domain-agnostic (scan_status enum only — no skip_reason string
 * matching).
 */
export function isZeroObservationGracefulTerminalEligible(args: {
  sourceObservations: Pick<ReconstructSourceObservationsArtifact, "observations">;
  sourceInventory: Pick<ReconstructSourceInventoryArtifact, "inventory_units">;
  attemptedSourceRefs?: ReadonlySet<string>;
}): boolean {
  if (args.sourceObservations.observations.length > 0) return false;
  const units = args.sourceInventory.inventory_units;
  const attempted = args.attemptedSourceRefs;
  return units.length > 0 && units.every((unit) =>
    unit.scan_status === "skipped" ||
    (attempted !== undefined && unit.scan_status === "admitted" &&
      !attempted.has(path.resolve(unit.ref)))
  );
}

/**
 * The inside-`try` context a graceful terminal needs that is NOT visible at the run-level catch
 * (design §16.4/§16.5). The throwing site populates a hoisted binding before it throws; the catch
 * hands it to assembleGracefulTerminal. `reachedArtifactRefs` are the artifacts written before the
 * halt (existence-checked before use); contractRegistry + targetMaterialProfile let the assembly
 * rebuild the governing snapshot the manifest validator re-derives.
 */
export interface GracefulTerminalAssemblyContext {
  reachedArtifactRefs: Partial<ReconstructRecordArtifactRefs>;
  contractRegistry: ReconstructContractRegistry;
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact;
}

/**
 * The deterministic, runtime-authored final output for a graceful terminal (design §16.5-2). It
 * restates only runtime diagnostics (disposition, terminal stage, the reason the throwing site
 * built) — never out-of-authority source values — so it is an honest "why this stopped" statement,
 * not a fabricated reconstruction.
 */
export function buildGracefulTerminalFinalOutput(signal: GracefulTerminalSignal): string {
  const dispositionLabel = signal.disposition === "blocked" ? "Blocked" : "Limited";
  // No level-2 subheadings: the graceful terminal is a standalone deterministic statement, not a
  // normal final-output section (those headings are registry-owned; see check-final-output-sections-parity).
  return [
    `# Reconstruct ${dispositionLabel} Terminal`,
    "",
    `This reconstruct run stopped early with a **${signal.disposition}** disposition at the \`${signal.terminalStepId}\` stage.`,
    "",
    "The run did not reach semantic authoring, so no ontology seed, claims, or competency questions were produced.",
    "",
    `**Reason:** ${signal.reason}`,
    "",
  ].join("\n");
}
