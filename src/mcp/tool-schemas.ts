import { z } from "zod";
import {
  RECONSTRUCT_DOMAIN_ID_GRAMMAR_DESCRIPTION,
  RECONSTRUCT_DOMAIN_ID_PATTERN,
} from "../core-runtime/reconstruct/domain-id.js";

const ReviewModeSchema = z.enum(["core-axis", "full"]);
const ReviewTargetScopeKindSchema = z.enum(["file", "directory", "bundle"]);
const ReviewExecutionRouteSchema = z.enum([
  "external_oauth_worker",
  "direct_model_call",
]);
const ReviewResultProjectionLevelSchema = z.enum(["compact", "standard", "full"]);
const DeliberationModeSchema = z.enum([
  "controlled_lens_deliberation",
]);
const ReconstructDomainIdSchema = z.string().regex(
  RECONSTRUCT_DOMAIN_ID_PATTERN,
  `domain must use ${RECONSTRUCT_DOMAIN_ID_GRAMMAR_DESCRIPTION}`,
);

const OntoReviewToolInputBaseSchema = z.object({
  target: z.string().min(1),
  intent: z.string().min(1),
  targetScopeKind: ReviewTargetScopeKindSchema.optional(),
  primaryRef: z.string().min(1).optional(),
  memberRefs: z.array(z.string().min(1)).optional(),
  bundleKind: z.string().min(1).optional(),
  diffRange: z.string().min(1).optional(),
  projectRoot: z.string().min(1).optional(),
  domain: z.string().min(1).optional(),
  noDomain: z.boolean().optional(),
  reviewMode: ReviewModeSchema.optional(),
  lensIds: z.array(z.string().min(1)).optional(),
  deliberation: DeliberationModeSchema.optional(),
  executionRoute: ReviewExecutionRouteSchema.optional(),
  confirmValueAlignment: z.boolean().optional(),
  prepareOnly: z.boolean().optional(),
  returnRunningAfterMs: z.number().int().min(0).optional(),
}).strict();

export const OntoReviewToolInputSchema = OntoReviewToolInputBaseSchema.refine((input) => !(input.domain && input.noDomain), {
  message: "Use either domain or noDomain, not both.",
});

export const OntoPrepareReviewToolInputSchema =
  OntoReviewToolInputBaseSchema.extend({
    prepareOnly: z.literal(true).default(true),
  }).refine((input) => !(input.domain && input.noDomain), {
    message: "Use either domain or noDomain, not both.",
  });

export const OntoReviewSessionInputSchema = z.object({
  sessionRoot: z.string().min(1),
  projectRoot: z.string().min(1).optional(),
});

export const OntoReviewStatusInputSchema = z.object({
  sessionRoot: z.string().min(1).optional(),
  projectRoot: z.string().min(1).optional(),
  latest: z.boolean().optional(),
  target: z.string().min(1).optional(),
  domain: z.string().min(1).optional(),
  requestHash: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(20).optional(),
  projectionLevel: z.enum(["compact", "standard", "full"]).optional(),
}).strict().refine((input) => (
  typeof input.sessionRoot === "string" || input.latest === true
), {
  message: "Pass sessionRoot, or latest=true with optional target/domain/requestHash filters.",
});

export const OntoReviewResultInputSchema = OntoReviewSessionInputSchema.extend({
  projectionLevel: ReviewResultProjectionLevelSchema.optional(),
}).strict();

export const OntoReviewCancelToolInputSchema =
  OntoReviewSessionInputSchema.extend({
    reason: z.string().min(1).optional(),
  }).strict();

export const OntoReviewContinueToolInputSchema =
  OntoReviewSessionInputSchema.extend({
    targetUnits: z.array(z.string().min(1)).optional(),
    requestText: z.string().min(1).optional(),
    executionRoute: ReviewExecutionRouteSchema.optional(),
  }).strict();

export const OntoListDomainsToolInputSchema = z.object({
  projectRoot: z.string().min(1).optional(),
});

export const OntoListSourceProfilesToolInputSchema = z.object({
  projectRoot: z.string().min(1).optional(),
});

export const OntoObserveSourceToolInputSchema = z.object({
  targetRefs: z.array(z.string().min(1)).min(1),
  projectRoot: z.string().min(1).optional(),
  sessionRoot: z.string().min(1).optional(),
  profilesRoot: z.string().min(1).optional(),
  filesystemAllowedRoots: z.array(z.string().min(1)).optional(),
}).strict();

export const OntoReconstructToolInputSchema = OntoObserveSourceToolInputSchema.extend({
  intent: z.string().min(1),
  domain: ReconstructDomainIdSchema.optional(),
  resumeMode: z.enum(["fresh", "reuse_existing_authored_artifacts"]).optional(),
  semanticAuthorRealization: z.enum(["direct_call"]).default("direct_call"),
  confirmationProviderRealization: z.enum(["direct_call"]).default("direct_call"),
}).strict();

export const OntoReconstructSessionInputSchema = z.object({
  sessionRoot: z.string().min(1),
  projectRoot: z.string().min(1).optional(),
}).strict();

const OntoValidateSourceObservationDirectiveToolInputSchema = z.object({
  directiveKind: z.literal("source_observation"),
  directivePath: z.string().min(1),
  sourceObservationsPath: z.string().min(1),
  outputPath: z.string().min(1).optional(),
  projectRoot: z.string().min(1).optional(),
}).strict();

const OntoValidateCandidateDispositionToolInputSchema = z.object({
  directiveKind: z.literal("candidate_disposition"),
  candidateInventoryPath: z.string().min(1),
  candidateDispositionPath: z.string().min(1),
  sourceObservationsPath: z.string().min(1),
  registryPath: z.string().min(1).optional(),
  outputPath: z.string().min(1).optional(),
  projectRoot: z.string().min(1).optional(),
}).strict();

const OntoValidateOntologySeedToolInputSchema = z.object({
  directiveKind: z.literal("ontology_seed"),
  ontologySeedPath: z.string().min(1),
  candidateDispositionPath: z.string().min(1),
  sourceObservationsPath: z.string().min(1),
  registryPath: z.string().min(1).optional(),
  outputPath: z.string().min(1).optional(),
  projectRoot: z.string().min(1).optional(),
}).strict();

export const OntoValidateReconstructDirectiveToolInputSchema = z.discriminatedUnion(
  "directiveKind",
  [
    OntoValidateSourceObservationDirectiveToolInputSchema,
    OntoValidateCandidateDispositionToolInputSchema,
    OntoValidateOntologySeedToolInputSchema,
  ],
);

export const OntoToolNames = [
  "onto_review",
  "onto_prepare_review",
  "onto_review_continue",
  "onto_review_cancel",
  "onto_review_status",
  "onto_review_result",
  "onto_list_lenses",
  "onto_list_domains",
  "onto_list_source_profiles",
  "onto_observe_source",
  "onto_validate_reconstruct_directive",
  "onto_reconstruct",
  "onto_reconstruct_status",
  "onto_reconstruct_result",
] as const;

export type OntoToolName = (typeof OntoToolNames)[number];
export type OntoReviewToolInput = z.infer<typeof OntoReviewToolInputSchema>;
export type OntoPrepareReviewToolInput = z.infer<
  typeof OntoPrepareReviewToolInputSchema
>;
export type OntoReviewSessionInput = z.infer<typeof OntoReviewSessionInputSchema>;
export type OntoReviewStatusInput = z.infer<typeof OntoReviewStatusInputSchema>;
export type OntoReviewResultInput = z.infer<typeof OntoReviewResultInputSchema>;
export type OntoReviewCancelToolInput = z.infer<
  typeof OntoReviewCancelToolInputSchema
>;
export type OntoReviewContinueToolInput = z.infer<
  typeof OntoReviewContinueToolInputSchema
>;
export type OntoListDomainsToolInput = z.infer<
  typeof OntoListDomainsToolInputSchema
>;
export type OntoListSourceProfilesToolInput = z.infer<
  typeof OntoListSourceProfilesToolInputSchema
>;
export type OntoObserveSourceToolInput = z.infer<
  typeof OntoObserveSourceToolInputSchema
>;
export type OntoReconstructToolInput = z.infer<
  typeof OntoReconstructToolInputSchema
>;
export type OntoReconstructSessionInput = z.infer<
  typeof OntoReconstructSessionInputSchema
>;
export type OntoValidateReconstructDirectiveToolInput = z.infer<
  typeof OntoValidateReconstructDirectiveToolInputSchema
>;
