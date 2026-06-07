import {
  type ReviewFindingSeverity,
  type ReviewLensFindingCausalPath,
  type ReviewLensFindingCausalPathStep,
  type ReviewLensFindingMaterialityBasis,
  type ReviewLensSidecarArtifact,
} from "./artifact-types.js";
import {
  isLensSidecarArtifactPath,
  lensIdFromRound1ArtifactPath,
  readValidatedLensSidecarArtifact,
} from "./lens-sidecar-artifact.js";
import {
  toRelativePath,
  writeYamlDocument,
} from "./review-artifact-utils.js";
import { validateIssueArtifactObject } from "./issue-artifact-runtime.js";

export interface DeterministicFindingLedgerArtifact {
  schema_version: 1;
  session_id: string;
  findings: DeterministicFindingLedgerFinding[];
  validation: {
    unaddressable_findings: string[];
  };
}

export interface DeterministicFindingLedgerFinding {
  finding_id: string;
  lens_id: string;
  source_ref: string;
  target: string;
  evidence_anchor: string;
  claim: string;
  lens_rationale_summary: string;
  proposed_action: string;
  affected_purpose: string;
  failure_condition: string;
  impact: string;
  evidence_refs: string[];
  severity: ReviewFindingSeverity;
  domain_threshold_used: string | null;
  materiality_basis: ReviewLensFindingMaterialityBasis | null;
  causal_path: ReviewLensFindingCausalPath | null;
}

export function allLensOutputsAreSidecars(paths: string[]): boolean {
  return paths.length > 0 && paths.every(isLensSidecarArtifactPath);
}

export async function buildFindingLedgerFromLensSidecars(args: {
  projectRoot: string;
  sessionId: string;
  sidecarPaths: string[];
}): Promise<DeterministicFindingLedgerArtifact> {
  const sidecars: ReviewLensSidecarArtifact[] = [];
  for (const sidecarPath of args.sidecarPaths) {
    const lensId = lensIdFromRound1ArtifactPath(sidecarPath);
    sidecars.push(
      await readValidatedLensSidecarArtifact({
        sidecarPath,
        sessionId: args.sessionId,
        lensId,
      }),
    );
  }

  const findings: DeterministicFindingLedgerFinding[] = [];
  const unaddressableFindings: string[] = [];
  let findingIndex = 1;
  for (const sidecar of sidecars) {
    const sidecarPath = args.sidecarPaths.find(
      (candidatePath) =>
        lensIdFromRound1ArtifactPath(candidatePath) === sidecar.lens_id,
    );
    if (!sidecarPath) continue;
    const sidecarRef = toRelativePath(sidecarPath, args.projectRoot);
    for (const candidate of sidecar.findings) {
      const findingId = `finding-${String(findingIndex).padStart(3, "0")}`;
      const sourceRef = `${sidecarRef}#${candidate.candidate_id}`;
      const materialityBasis = candidate.materiality_basis ?? null;
      const causalPath = candidate.causal_path
        ? rewriteCausalPathForFinding(candidate.causal_path, findingId)
        : null;
      findings.push({
        finding_id: findingId,
        lens_id: sidecar.lens_id,
        source_ref: sourceRef,
        target: candidate.target,
        evidence_anchor: candidate.evidence_anchor,
        claim: candidate.claim,
        lens_rationale_summary: candidate.why,
        proposed_action: candidate.how_to_fix,
        affected_purpose:
          materialityBasis?.affected_purpose ?? "declared review purpose",
        failure_condition:
          materialityBasis?.failure_condition ??
          (candidate.upstream_evidence_required
            ? "upstream evidence outside the bounded lens context is required to close this finding"
            : "no material failure condition is shown by the current bounded lens evidence"),
        impact: materialityBasis?.impact ?? candidate.why,
        evidence_refs: uniqueRefs([
          sourceRef,
          ...(materialityBasis?.evidence_refs ?? []),
        ]),
        severity: candidate.severity_hint ?? "info",
        domain_threshold_used:
          sidecar.domain_constraints_used.length > 0
            ? sidecar.domain_constraints_used
                .map((constraint) =>
                  [
                    constraint.source_doc,
                    constraint.source_version_or_snapshot_id,
                    constraint.anchor,
                  ].join("#"),
                )
                .join("; ")
            : null,
        materiality_basis: materialityBasis,
        causal_path: causalPath,
      });
      findingIndex += 1;
    }
    for (const candidateId of sidecar.validation.unaddressable_candidates) {
      unaddressableFindings.push(`${sidecarRef}#${candidateId}`);
    }
  }

  return {
    schema_version: 1,
    session_id: args.sessionId,
    findings,
    validation: {
      unaddressable_findings: unaddressableFindings,
    },
  };
}

function rewriteCausalPathForFinding(
  causalPath: ReviewLensFindingCausalPath,
  findingId: string,
): ReviewLensFindingCausalPath {
  const causeIdByOriginal = new Map<string, string>();
  const steps: ReviewLensFindingCausalPathStep[] = causalPath.steps.map(
    (step, index) => {
      const rewrittenCauseId = `${findingId}.cause-${String(index + 1).padStart(3, "0")}`;
      if (step.cause_id) {
        causeIdByOriginal.set(step.cause_id, rewrittenCauseId);
      }
      return {
        cause_id: rewrittenCauseId,
        claim: step.claim,
        relation_to_previous: step.relation_to_previous,
        evidence_refs: [...step.evidence_refs],
      };
    },
  );
  return {
    root_cause_candidate: causalPath.root_cause_candidate,
    root_cause_step_id:
      (causalPath.root_cause_step_id
        ? causeIdByOriginal.get(causalPath.root_cause_step_id)
        : undefined) ??
      steps[steps.length - 1]?.cause_id ??
      null,
    steps,
    unresolved_beyond_evidence: causalPath.unresolved_beyond_evidence ?? null,
  };
}

function uniqueRefs(refs: string[]): string[] {
  return [...new Set(refs.filter((ref) => ref.trim().length > 0))];
}

export async function writeFindingLedgerFromLensSidecars(args: {
  projectRoot: string;
  sessionId: string;
  sidecarPaths: string[];
  outputPath: string;
}): Promise<DeterministicFindingLedgerArtifact> {
  const artifact = await buildFindingLedgerFromLensSidecars({
    projectRoot: args.projectRoot,
    sessionId: args.sessionId,
    sidecarPaths: args.sidecarPaths,
  });
  validateIssueArtifactObject({
    artifactId: "finding-ledger",
    parsed: artifact as unknown as Record<string, unknown>,
    sessionId: args.sessionId,
    participatingLensIds: args.sidecarPaths.map(lensIdFromRound1ArtifactPath),
  });
  await writeYamlDocument(args.outputPath, artifact);
  return artifact;
}

export function renderRuntimeFindingLedgerPacket(args: {
  projectRoot: string;
  sessionId: string;
  outputPath: string;
  sidecarPaths: string[];
}): string {
  return [
    "# Runtime Finding Ledger Projection",
    "",
    `session_id: ${args.sessionId}`,
    "unit_id: finding-ledger",
    "unit_kind: issue_artifact",
    "artifact_id: finding-ledger",
    `output_path: ${toRelativePath(args.outputPath, args.projectRoot)}`,
    "",
    "## Runtime Source Sidecars",
    ...args.sidecarPaths.map(
      (sidecarPath) =>
        `- ${lensIdFromRound1ArtifactPath(sidecarPath)}: ${toRelativePath(
          sidecarPath,
          args.projectRoot,
        )}`,
    ),
    "",
    "## Deterministic Rule",
    "The runtime maps each sidecar finding candidate into one finding-ledger row.",
    "No clustering, relation inference, or new severity judgment is performed here.",
  ].join("\n");
}
