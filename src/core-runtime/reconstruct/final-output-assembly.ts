import type {
  ReconstructClaimProjectionArtifact,
  ReconstructClaimProjectionValidationArtifact,
  ReconstructOntologySeedArtifact,
  ReconstructRevisionProposalArtifact,
} from "./artifact-types.js";
import { ontologySeedSummaryLines } from "./authoring-prompt-payloads.js";
import {
  FINAL_OUTPUT_SECTION_HEADINGS,
  FINAL_OUTPUT_SECTION_IDS,
  runtimeProvenanceBindingsRequiredFragments,
} from "./final-output-sections.js";
import { upsertMarkdownSection } from "./markdown-section.js";
import { isRevisionBlocker, isRevisionDisclosed } from "./post-seed-validation.js";
import type {
  ReconstructFinalOutputProvenanceSectionBindingInput,
} from "./post-seed-validation.js";
import type {
  CodeInventoryProjectionTruncation,
  DocumentExcerptProjectionTruncation,
  WorkbookInventoryProjectionTruncation,
} from "./projection-truncation.js";

/**
 * Surfaces unresolved (reject/defer) revision proposals in final output (#2): these
 * are proposed-only — never applied to the seed/maturation in this run — and the stop
 * gate already treats them as deterministically unresolved work carried to the next
 * round. The disclosure must be deterministic, not left to the final-output LLM's prose
 * (which could omit it or imply completion), so the runtime appends this section
 * unconditionally when such proposals remain. Operational wording only (action enum,
 * target type/id, proposal id) — no host-authored prose — so it never trips final-output
 * provenance forbidden fragments. Exported for the disclosure unit test.
 */
export function appendFinalOutputUnresolvedRevisionSection(
  finalOutputText: string,
  revisionProposal: ReconstructRevisionProposalArtifact,
): string {
  // M4a — disclose ALL non-`reuse` proposals (they are next-round directives), splitting the
  // blocking set (reject|defer — the run is not complete while they remain) from the
  // non-blocking set (extend|rename|split). The blocking set is the same isRevisionBlocker
  // predicate the stop gate uses, so the two sites can never drift.
  const disclosed = revisionProposal.proposals.filter(isRevisionDisclosed);
  if (disclosed.length === 0) return finalOutputText;
  const blocking = disclosed.filter(isRevisionBlocker);
  const nonBlocking = disclosed.filter((proposal) => !isRevisionBlocker(proposal));
  const line = (proposal: ReconstructRevisionProposalArtifact["proposals"][number]) =>
    `- ${proposal.action} ${proposal.target_type} ${proposal.target_id} (${proposal.proposal_id})`;
  const content = [
    `## ${FINAL_OUTPUT_SECTION_HEADINGS.unresolvedRevisionProposals}`,
    "",
    "Revision proposals are proposed-only and are NOT applied to the seed or maturation " +
      "in this run; they are carried to the next maturation round as directives.",
    "",
  ];
  if (blocking.length > 0) {
    content.push(
      "Blocking (reject/defer) — the run is not complete while these remain:",
      "",
      ...blocking.map(line),
      "",
    );
  }
  if (nonBlocking.length > 0) {
    content.push(
      "Non-blocking next-round directives (extend/rename/split):",
      "",
      ...nonBlocking.map(line),
      "",
    );
  }
  return upsertMarkdownSection(finalOutputText, content.join("\n"));
}

/**
 * Surfaces seed-stage document projection truncation in final output (C2): a
 * captured document whose tail exceeded the model-window projection budget did
 * not reach seed authoring. No-op when nothing was truncated. The durable
 * machine signal is the runtime-events.ndjson status event emitted at observation
 * load; this is the human-readable counterpart. Uses only operational wording —
 * no claim-value fragments — so it never trips final-output provenance forbidden
 * fragments.
 */
export function appendFinalOutputDocumentProjectionTruncationSection(
  finalOutputText: string,
  truncations: DocumentExcerptProjectionTruncation[],
): string {
  if (truncations.length === 0) return finalOutputText;
  const heading = `## ${FINAL_OUTPUT_SECTION_HEADINGS.sourceProjectionTruncation}`;
  const content = [
    heading,
    "",
    "A captured source file (document or code) exceeded the seed-stage projection " +
      "budget for the active model window, so its tail was not projected into seed " +
      "authoring. The full captured content is retained in source-observations; only " +
      "the seed-stage prompt projection was bounded. Recovering the omitted tail is a " +
      "later stage.",
    "",
    ...truncations.map((truncation) =>
      `- ${truncation.source_ref} (${truncation.observation_id}, ` +
      `${truncation.target_material_kind}): captured ${truncation.captured_chars} ` +
      `chars, projected ${truncation.projection_budget_chars} chars`
    ),
    "",
  ].join("\n");
  return upsertMarkdownSection(finalOutputText, content);
}

/**
 * Surfaces seed-stage workbook inventory projection truncation in final output
 * (P6): a spreadsheet whose inventory exceeded the FIXED seed-stage projection caps
 * (DEFAULT_WORKBOOK_INVENTORY_PROMPT_CAPS — model-agnostic, NOT window-derived, unlike
 * the document excerpt budget) had only a bounded, representative structural sample
 * projected into seed authoring. Sibling of the document projection section; the
 * durable machine signal is the runtime-events.ndjson status event. Operational
 * wording only (section names + counts) — no claim-value fragments — so it never
 * trips final-output provenance forbidden fragments.
 */
export function appendFinalOutputWorkbookInventoryProjectionTruncationSection(
  finalOutputText: string,
  truncations: WorkbookInventoryProjectionTruncation[],
): string {
  if (truncations.length === 0) return finalOutputText;
  const heading = `## ${FINAL_OUTPUT_SECTION_HEADINGS.workbookInventoryProjectionTruncation}`;
  const content = [
    heading,
    "",
    "A spreadsheet inventory exceeded the fixed seed-stage inventory projection caps, " +
      "so only a bounded, representative structural sample was projected into seed " +
      "authoring. The full inventory is retained in source-observations; only the " +
      "seed-stage prompt projection was bounded. Recovering the omitted detail is a " +
      "later stage.",
    "",
    ...truncations.map((truncation) =>
      `- ${truncation.source_ref} (${truncation.observation_id}): ` +
      truncation.sections
        .map((section) => `${section.section} ${section.kept}/${section.total}`)
        .join(", ")
    ),
    "",
  ].join("\n");
  return upsertMarkdownSection(finalOutputText, content);
}

/**
 * Surfaces seed-stage code inventory projection truncation in final output: a code file
 * whose structure inventory exceeded the FIXED seed-stage char budget
 * (CODE_STRUCTURE_INVENTORY_PROMPT_CHAR_BUDGET — model-agnostic, like the workbook caps)
 * had only a bounded structural sample (hierarchy dropped, size-desc span prefix) projected
 * into seed authoring. Sibling of the workbook section above; the durable machine signal is
 * the runtime-events.ndjson status event. Operational wording only (section names + counts)
 * — no claim-value fragments — so it never trips final-output provenance forbidden fragments.
 */
export function appendFinalOutputCodeInventoryProjectionTruncationSection(
  finalOutputText: string,
  truncations: CodeInventoryProjectionTruncation[],
): string {
  if (truncations.length === 0) return finalOutputText;
  const heading = `## ${FINAL_OUTPUT_SECTION_HEADINGS.codeInventoryProjectionTruncation}`;
  const content = [
    heading,
    "",
    "A code structure inventory exceeded the fixed seed-stage inventory projection budget, " +
      "so only a bounded structural sample was projected into seed authoring. The full " +
      "inventory is retained in source-observations; only the seed-stage prompt projection " +
      "was bounded. Recovering the omitted detail is a later stage.",
    "",
    ...truncations.map((truncation) =>
      `- ${truncation.source_ref} (${truncation.observation_id}): ` +
      truncation.sections
        .map((section) => `${section.section} ${section.kept}/${section.total}`)
        .join(", ")
    ),
    "",
  ].join("\n");
  return upsertMarkdownSection(finalOutputText, content);
}

export function appendFinalOutputProvenanceFooter(
  finalOutputText: string,
  requiredFragments: string[],
): string {
  const heading = `## ${FINAL_OUTPUT_SECTION_HEADINGS.runtimeArtifactTruthFooter}`;
  const footer = [
    heading,
    "",
    ...requiredFragments.map((fragment) => `- ${fragment}`),
    "",
  ].join("\n");
  return upsertMarkdownSection(finalOutputText, footer);
}

export function appendFinalOutputProvenanceBindingsSection(
  finalOutputText: string,
  sectionBindings: ReconstructFinalOutputProvenanceSectionBindingInput[],
): string {
  const heading = `## ${FINAL_OUTPUT_SECTION_HEADINGS.runtimeProvenanceBindings}`;
  const content = [
    heading,
    "",
    ...sectionBindings.flatMap((binding) => [
      `- ${binding.section_id}: ${binding.claim_summary}`,
      `  - section: ${binding.heading}`,
      `  - authority_refs: ${binding.authority_refs.join(", ")}`,
      `  - validation_refs: ${binding.validation_refs.join(", ")}`,
    ]),
    "",
  ].join("\n");
  return upsertMarkdownSection(finalOutputText, content);
}

export function appendFinalOutputAnswerabilitySection(
  finalOutputText: string,
  ontologySeed: ReconstructOntologySeedArtifact,
): string {
  const content = [
    `## ${FINAL_OUTPUT_SECTION_HEADINGS.seedAnswerability}`,
    "",
    ...ontologySeedSummaryLines(ontologySeed),
    "",
  ].join("\n");
  return upsertMarkdownSection(finalOutputText, content);
}

export function appendFinalOutputClaimProjectionSection(
  finalOutputText: string,
  args: {
    claimProjectionPath: string;
    claimProjectionValidationPath: string;
    claimProjection: ReconstructClaimProjectionArtifact;
    claimProjectionValidation: ReconstructClaimProjectionValidationArtifact;
    // Site-7 proportional terminal (design 20260706 §6): claim-anchored degrade disclosure.
    // Rendered deterministically here — never dependent on the LLM prose picking it up —
    // because the authoring payload only carries counts, not the shortfall ids.
    judgeSupportShortfallClaimIds: string[];
  },
): string {
  const heading = `## ${FINAL_OUTPUT_SECTION_HEADINGS.claimProjection}`;
  const actionabilityClaimCounts = args.claimProjection.projection_rows.reduce(
    (counts, row) => {
      counts[row.actionability_claim] =
        (counts[row.actionability_claim] ?? 0) + 1;
      return counts;
    },
    {} as Record<string, number>,
  );
  const hasActionableClaim = args.claimProjection.projection_rows.some((row) =>
    row.actionability_claim === "limited" || row.actionability_claim === "ready"
  );
  const content = [
    heading,
    "",
    `- Claim projection: ${args.claimProjectionPath}`,
    `- Claim projection validation: ${args.claimProjectionValidationPath}`,
    `- Strongest claim level: ${args.claimProjectionValidation.strongest_claim_level}`,
    `- Decision states: ${JSON.stringify(args.claimProjectionValidation.decision_state_counts)}`,
    `- Actionability claims: ${JSON.stringify(actionabilityClaimCounts)}`,
    `- Projection rows: ${args.claimProjection.projection_rows.length}`,
    ...(hasActionableClaim
      ? []
      : [
        "- No ActionableOntology artifact is claimed or emitted by this projection.",
      ]),
    ...(args.judgeSupportShortfallClaimIds.length === 0
      ? []
      : [
        `- Judge-support shortfall (degraded, not certified): ${
          args.judgeSupportShortfallClaimIds.join(", ")
        } — the answer-support judge could not confirm two independent supports for these claims; they are excluded from the trusted claim scope.`,
      ]),
    "- Public claim truth is owned by the claim projection artifact, not by this prose section.",
    "- The canonical claim projection is generated from the immutable pre-publication run-control checkpoint.",
    "",
  ].join("\n");
  return upsertMarkdownSection(finalOutputText, content);
}

export function appendFinalOutputArtifactTruthSection(
  finalOutputText: string,
  args: {
    runControlPath: string;
    runControlValidationPath: string;
    registryVerificationEvidencePath: string;
    registryVerificationEvidenceValidationPath: string;
    sourcePurposeCandidatesPath: string;
    sourcePurposeCandidatesValidationPath: string;
    purposeConfirmationValidationPath: string;
    sourceObservationDeltaPath: string | null;
    sourceObservationDeltaValidationPath: string | null;
    sourceObservationReentryValidationPath: string | null;
    seedStagePromptSourceObservationsPath: string;
    sourceObservationLineageIndexPath: string;
    sourceSafetyLedgerPath: string;
    sourceSafetyLedgerValidationPath: string;
    sourceScoutPackPath: string;
    sourceScoutPackValidationPath: string;
    sourceScoutPackPreSeedPath: string;
    sourceScoutPackPreSeedValidationPath: string;
    sourceScoutPackPostMaturationPath: string;
    sourceScoutPackPostMaturationValidationPath: string;
    postMaturationGateProjectionValidationPath: string;
    materialAdmissionLedgerPath: string;
    materialAdmissionLedgerValidationPath: string;
    seedAuthoringReadinessPath: string;
    seedAuthoringReadinessValidationPath: string;
    ontologySeedPath: string;
    ontologySeedValidationPath: string;
    claimRealizationMapPath: string;
    seedConfirmationValidationPath: string;
    competencyQuestionAssessmentPath: string;
    failureClassificationPath: string;
    revisionProposalPath: string;
    preHandoffManifestPath: string;
    preHandoffRunManifestValidationPath: string;
    handoffDecisionValidationPath: string;
    maturationBaselinePath: string;
    maturationBaselineValidationPath: string;
    baselineActionabilityMatrixPath: string;
    baselineActionabilityMatrixValidationPath: string;
    actionabilityMatrixPath: string;
    actionabilityMatrixValidationPath: string;
    maturationQuestionFrontierPath: string;
    maturationQuestionFrontierValidationPath: string;
    maturationClosureFrontierPath: string;
    maturationClosureFrontierValidationPath: string;
    maturationAuthorityResponsePath: string;
    maturationAuthorityResponseValidationPath: string;
    answerSupportLedgerPath: string;
    answerSupportLedgerValidationPath: string;
    answerSupportJudgmentPath: string;
    answerSupportJudgmentValidationPath: string;
    maturationAnswerClaimsPath: string;
    maturationAnswerClaimsValidationPath: string;
    ontologyExpansionPath: string;
    ontologyExpansionValidationPath: string;
    maturationSourceDeltaPath: string;
    maturationSourceDeltaValidationPath: string;
    maturationConvergenceLedgerPath: string;
    maturationConvergenceLedgerValidationPath: string;
    maturationContinuationDecisionPath: string;
    maturationContinuationDecisionValidationPath: string;
    queryProofsPath: string;
    queryProofsValidationPath: string;
    visualizationProofsPath: string;
    visualizationProofsValidationPath: string;
    graphExplorationProofsPath: string;
    graphExplorationProofsValidationPath: string;
    claimProjectionPath: string;
    claimProjectionValidationPath: string;
    recordPath: string;
    manifestPath: string;
  },
): string {
  const heading = `## ${FINAL_OUTPUT_SECTION_HEADINGS.artifactTruth}`;
  const content = [
    heading,
    "",
    `- Reconstruct run control: ${args.runControlPath}`,
    `- Reconstruct run control validation: ${args.runControlValidationPath}`,
    `- Registry verification evidence: ${args.registryVerificationEvidencePath}`,
    `- Registry verification evidence validation: ${args.registryVerificationEvidenceValidationPath}`,
    `- Source purpose candidates: ${args.sourcePurposeCandidatesPath}`,
    `- Source purpose candidates validation: ${args.sourcePurposeCandidatesValidationPath}`,
    `- Purpose confirmation validation: ${args.purposeConfirmationValidationPath}`,
    ...(args.sourceObservationDeltaPath
      ? [
        `- Source observation delta: ${args.sourceObservationDeltaPath}`,
        `- Source observation delta validation: ${args.sourceObservationDeltaValidationPath}`,
        `- Source observation re-entry validation: ${args.sourceObservationReentryValidationPath}`,
      ]
      : []),
    `- Seed-stage prompt source observations: ${args.seedStagePromptSourceObservationsPath}`,
    `- Source observation lineage index: ${args.sourceObservationLineageIndexPath}`,
    `- Source safety ledger: ${args.sourceSafetyLedgerPath}`,
    `- Source safety ledger validation: ${args.sourceSafetyLedgerValidationPath}`,
    `- Source scout pack: ${args.sourceScoutPackPath}`,
    `- Source scout pack validation: ${args.sourceScoutPackValidationPath}`,
    `- Source scout pack pre-seed snapshot: ${args.sourceScoutPackPreSeedPath}`,
    `- Source scout pack pre-seed validation snapshot: ${args.sourceScoutPackPreSeedValidationPath}`,
    `- Source scout pack post-maturation snapshot: ${args.sourceScoutPackPostMaturationPath}`,
    `- Source scout pack post-maturation validation snapshot: ${args.sourceScoutPackPostMaturationValidationPath}`,
    `- Post-maturation gate projection validation: ${args.postMaturationGateProjectionValidationPath}`,
    `- Material admission ledger: ${args.materialAdmissionLedgerPath}`,
    `- Material admission ledger validation: ${args.materialAdmissionLedgerValidationPath}`,
    `- Seed authoring readiness: ${args.seedAuthoringReadinessPath}`,
    `- Seed authoring readiness validation: ${args.seedAuthoringReadinessValidationPath}`,
    `- Ontology seed: ${args.ontologySeedPath}`,
    `- Ontology seed validation: ${args.ontologySeedValidationPath}`,
    `- Claim realization map: ${args.claimRealizationMapPath}`,
    `- Seed confirmation validation: ${args.seedConfirmationValidationPath}`,
    `- Competency question assessment: ${args.competencyQuestionAssessmentPath}`,
    `- Failure classification: ${args.failureClassificationPath}`,
    `- Revision proposal: ${args.revisionProposalPath}`,
    `- Pre-handoff run manifest: ${args.preHandoffManifestPath}`,
    `- Pre-handoff run manifest validation: ${args.preHandoffRunManifestValidationPath}`,
    `- Handoff decision validation: ${args.handoffDecisionValidationPath}`,
    `- Maturation baseline: ${args.maturationBaselinePath}`,
    `- Maturation baseline validation: ${args.maturationBaselineValidationPath}`,
    `- Baseline actionability matrix: ${args.baselineActionabilityMatrixPath}`,
    `- Baseline actionability matrix validation: ${args.baselineActionabilityMatrixValidationPath}`,
    `- Actionability matrix: ${args.actionabilityMatrixPath}`,
    `- Actionability matrix validation: ${args.actionabilityMatrixValidationPath}`,
    `- Maturation question frontier: ${args.maturationQuestionFrontierPath}`,
    `- Maturation question frontier validation: ${args.maturationQuestionFrontierValidationPath}`,
    `- Maturation closure frontier: ${args.maturationClosureFrontierPath}`,
    `- Maturation closure frontier validation: ${args.maturationClosureFrontierValidationPath}`,
    `- Maturation authority response: ${args.maturationAuthorityResponsePath}`,
    `- Maturation authority response validation: ${args.maturationAuthorityResponseValidationPath}`,
    `- Answer support ledger: ${args.answerSupportLedgerPath}`,
    `- Answer support ledger validation: ${args.answerSupportLedgerValidationPath}`,
    `- Answer support judgment: ${args.answerSupportJudgmentPath}`,
    `- Answer support judgment validation: ${args.answerSupportJudgmentValidationPath}`,
    `- Maturation answer claims: ${args.maturationAnswerClaimsPath}`,
    `- Maturation answer claims validation: ${args.maturationAnswerClaimsValidationPath}`,
    `- Ontology expansion: ${args.ontologyExpansionPath}`,
    `- Ontology expansion validation: ${args.ontologyExpansionValidationPath}`,
    `- Maturation source delta: ${args.maturationSourceDeltaPath}`,
    `- Maturation source delta validation: ${args.maturationSourceDeltaValidationPath}`,
    `- Maturation convergence ledger: ${args.maturationConvergenceLedgerPath}`,
    `- Maturation convergence ledger validation: ${args.maturationConvergenceLedgerValidationPath}`,
    `- Maturation continuation decision: ${args.maturationContinuationDecisionPath}`,
    `- Maturation continuation decision validation: ${args.maturationContinuationDecisionValidationPath}`,
    `- Query proofs: ${args.queryProofsPath}`,
    `- Query proofs validation: ${args.queryProofsValidationPath}`,
    `- Visualization proofs: ${args.visualizationProofsPath}`,
    `- Visualization proofs validation: ${args.visualizationProofsValidationPath}`,
    `- Graph exploration proofs: ${args.graphExplorationProofsPath}`,
    `- Graph exploration proofs validation: ${args.graphExplorationProofsValidationPath}`,
    `- Claim projection: ${args.claimProjectionPath}`,
    `- Claim projection validation: ${args.claimProjectionValidationPath}`,
    `- Reconstruct record: ${args.recordPath}`,
    `- Reconstruct run manifest: ${args.manifestPath}`,
    "",
  ].join("\n");
  return upsertMarkdownSection(finalOutputText, content);
}

export function finalOutputProvenanceSectionBindings(args: {
  runControlPath: string;
  runControlValidationPath: string;
  registryVerificationEvidencePath: string;
  registryVerificationEvidenceValidationPath: string;
  ontologySeedPath: string;
  ontologySeedValidationPath: string;
  claimRealizationMapPath: string;
  claimRealizationMapValidationPath: string;
  seedConfirmationValidationPath: string;
  competencyQuestionsPath: string;
  competencyQuestionsValidationPath: string;
  competencyQuestionAssessmentPath: string;
  competencyQuestionAssessmentValidationPath: string;
  sourcePurposeCandidatesPath: string;
  sourcePurposeCandidatesValidationPath: string;
  purposeConfirmationValidationPath: string;
  sourceObservationLineageIndexPath: string;
  sourceSafetyLedgerPath: string;
  sourceSafetyLedgerValidationPath: string;
  sourceScoutPackPath: string;
  sourceScoutPackValidationPath: string;
  sourceScoutPackPreSeedPath: string;
  sourceScoutPackPreSeedValidationPath: string;
  sourceScoutPackPostMaturationPath: string;
  sourceScoutPackPostMaturationValidationPath: string;
  postMaturationGateProjectionValidationPath: string;
  materialAdmissionLedgerPath: string;
  materialAdmissionLedgerValidationPath: string;
  seedAuthoringReadinessPath: string;
  seedAuthoringReadinessValidationPath: string;
  failureClassificationPath: string;
  failureClassificationValidationPath: string;
  revisionProposalPath: string;
  revisionProposalValidationPath: string;
  metricsPath: string;
  stopDecisionPath: string;
  preHandoffManifestPath: string;
  preHandoffRunManifestValidationPath: string;
  handoffDecisionValidationPath: string;
  maturationBaselinePath: string;
  maturationBaselineValidationPath: string;
  baselineActionabilityMatrixPath: string;
  baselineActionabilityMatrixValidationPath: string;
  actionabilityMatrixPath: string;
  actionabilityMatrixValidationPath: string;
  maturationQuestionFrontierPath: string;
  maturationQuestionFrontierValidationPath: string;
  maturationClosureFrontierPath: string;
  maturationClosureFrontierValidationPath: string;
  maturationAuthorityResponsePath: string;
  maturationAuthorityResponseValidationPath: string;
  answerSupportLedgerPath: string;
  answerSupportLedgerValidationPath: string;
  answerSupportJudgmentPath: string;
  answerSupportJudgmentValidationPath: string;
  maturationAnswerClaimsPath: string;
  maturationAnswerClaimsValidationPath: string;
  ontologyExpansionPath: string;
  ontologyExpansionValidationPath: string;
  maturationSourceDeltaPath: string;
  maturationSourceDeltaValidationPath: string;
  maturationContinuationDecisionPath: string;
  maturationContinuationDecisionValidationPath: string;
  queryProofsPath: string;
  queryProofsValidationPath: string;
  visualizationProofsPath: string;
  visualizationProofsValidationPath: string;
  graphExplorationProofsPath: string;
  graphExplorationProofsValidationPath: string;
  claimProjectionPath: string;
  claimProjectionValidationPath: string;
  recordPath: string;
  manifestPath: string;
  finalOutputProvenanceValidationPath: string;
  finalFragments: string[];
}): ReconstructFinalOutputProvenanceSectionBindingInput[] {
  return [
    {
      section_id: FINAL_OUTPUT_SECTION_IDS.seedAnswerability,
      heading: FINAL_OUTPUT_SECTION_HEADINGS.seedAnswerability,
      claim_summary: "Seed answerability is grounded in the seed and competency-question artifacts.",
      authority_refs: [args.ontologySeedPath, args.competencyQuestionsPath],
      validation_refs: [
        args.ontologySeedValidationPath,
        args.competencyQuestionsValidationPath,
      ],
      required_fragments: ["Ontology seed projected claims", "Coverage axes"],
    },
    {
      section_id: FINAL_OUTPUT_SECTION_IDS.artifactTruth,
      heading: FINAL_OUTPUT_SECTION_HEADINGS.artifactTruth,
      claim_summary: "Terminal artifact truth is grounded in run-control, the pre-handoff manifest validation, seed-readiness validation, final output provenance, and planned terminal record paths.",
      authority_refs: [
        args.runControlPath,
        args.registryVerificationEvidencePath,
        args.sourceScoutPackPath,
        args.sourceScoutPackPreSeedPath,
        args.sourceScoutPackPostMaturationPath,
        args.postMaturationGateProjectionValidationPath,
        args.seedAuthoringReadinessPath,
        args.recordPath,
        args.manifestPath,
        args.preHandoffManifestPath,
      ],
      validation_refs: [
        args.runControlValidationPath,
        args.registryVerificationEvidenceValidationPath,
        args.sourceScoutPackValidationPath,
        args.sourceScoutPackPreSeedValidationPath,
        args.sourceScoutPackPostMaturationValidationPath,
        args.postMaturationGateProjectionValidationPath,
        args.seedAuthoringReadinessValidationPath,
        args.preHandoffRunManifestValidationPath,
        args.handoffDecisionValidationPath,
        args.finalOutputProvenanceValidationPath,
      ],
      required_fragments: [
        args.runControlPath,
        args.runControlValidationPath,
        args.registryVerificationEvidencePath,
        args.registryVerificationEvidenceValidationPath,
        args.sourcePurposeCandidatesPath,
        args.sourcePurposeCandidatesValidationPath,
        args.purposeConfirmationValidationPath,
        args.sourceObservationLineageIndexPath,
        args.sourceSafetyLedgerPath,
        args.sourceSafetyLedgerValidationPath,
        args.sourceScoutPackPath,
        args.sourceScoutPackValidationPath,
        args.sourceScoutPackPreSeedPath,
        args.sourceScoutPackPreSeedValidationPath,
        args.sourceScoutPackPostMaturationPath,
        args.sourceScoutPackPostMaturationValidationPath,
        args.postMaturationGateProjectionValidationPath,
        args.materialAdmissionLedgerPath,
        args.materialAdmissionLedgerValidationPath,
        args.seedAuthoringReadinessPath,
        args.seedAuthoringReadinessValidationPath,
        args.ontologySeedPath,
        args.ontologySeedValidationPath,
        args.claimRealizationMapPath,
        args.seedConfirmationValidationPath,
        args.competencyQuestionAssessmentPath,
        args.failureClassificationPath,
        args.revisionProposalPath,
        args.preHandoffManifestPath,
        args.preHandoffRunManifestValidationPath,
        args.handoffDecisionValidationPath,
        args.maturationBaselinePath,
        args.maturationBaselineValidationPath,
        args.baselineActionabilityMatrixPath,
        args.baselineActionabilityMatrixValidationPath,
        args.actionabilityMatrixPath,
        args.actionabilityMatrixValidationPath,
        args.maturationQuestionFrontierPath,
        args.maturationQuestionFrontierValidationPath,
        args.maturationClosureFrontierPath,
        args.maturationClosureFrontierValidationPath,
        args.maturationAuthorityResponsePath,
        args.maturationAuthorityResponseValidationPath,
        args.answerSupportLedgerPath,
        args.answerSupportLedgerValidationPath,
        args.answerSupportJudgmentPath,
        args.answerSupportJudgmentValidationPath,
        args.maturationAnswerClaimsPath,
        args.maturationAnswerClaimsValidationPath,
        args.ontologyExpansionPath,
        args.ontologyExpansionValidationPath,
        args.maturationSourceDeltaPath,
        args.maturationSourceDeltaValidationPath,
        args.maturationContinuationDecisionPath,
        args.maturationContinuationDecisionValidationPath,
        args.queryProofsPath,
        args.queryProofsValidationPath,
        args.visualizationProofsPath,
        args.visualizationProofsValidationPath,
        args.graphExplorationProofsPath,
        args.graphExplorationProofsValidationPath,
        args.claimProjectionPath,
        args.claimProjectionValidationPath,
        args.recordPath,
        args.manifestPath,
      ],
    },
    {
      section_id: FINAL_OUTPUT_SECTION_IDS.claimProjection,
      heading: FINAL_OUTPUT_SECTION_HEADINGS.claimProjection,
      claim_summary: "The public output delegates claim truth to the canonical runtime claim projection artifact.",
      authority_refs: [args.claimProjectionPath],
      validation_refs: [args.claimProjectionValidationPath],
      required_fragments: [
        args.claimProjectionPath,
        args.claimProjectionValidationPath,
        "Public claim truth is owned by the claim projection artifact",
        "generated from the immutable pre-publication run-control checkpoint",
      ],
    },
    {
      section_id: FINAL_OUTPUT_SECTION_IDS.runtimeArtifactTruthFooter,
      heading: FINAL_OUTPUT_SECTION_HEADINGS.runtimeArtifactTruthFooter,
      claim_summary: "The runtime footer enumerates all required provenance fragments for audit.",
      authority_refs: [args.manifestPath, args.recordPath],
      validation_refs: [args.finalOutputProvenanceValidationPath],
      required_fragments: args.finalFragments,
    },
    {
      section_id: FINAL_OUTPUT_SECTION_IDS.runtimeProvenanceBindings,
      heading: FINAL_OUTPUT_SECTION_HEADINGS.runtimeProvenanceBindings,
      claim_summary: "The runtime-emitted provenance binding section lists section-to-authority bindings.",
      authority_refs: [args.finalOutputProvenanceValidationPath],
      validation_refs: [args.finalOutputProvenanceValidationPath],
      // Derived from the module's other-4 bound section_ids (bindings order) so this
      // load-bearing validated-text list cannot drift from the canonical set (G(c)).
      required_fragments: runtimeProvenanceBindingsRequiredFragments(),
    },
  ];
}
