import { z } from "zod";

const ReviewModeSchema = z.enum(["core-axis", "full"]);
const ReviewTargetScopeKindSchema = z.enum(["file", "directory", "bundle"]);
const ExecutorRealizationSchema = z.enum(["codex", "mock", "ts_inline_http"]);
const DeliberationModeSchema = z.enum([
  "controlled_lens_deliberation",
]);

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
  executorRealization: ExecutorRealizationSchema.optional(),
  confirmValueAlignment: z.boolean().optional(),
  prepareOnly: z.boolean().optional(),
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

export const OntoListDomainsToolInputSchema = z.object({
  projectRoot: z.string().min(1).optional(),
});

export const OntoToolNames = [
  "onto.review",
  "onto.prepare_review",
  "onto.review_status",
  "onto.review_result",
  "onto.list_lenses",
  "onto.list_domains",
] as const;

export type OntoToolName = (typeof OntoToolNames)[number];
export type OntoReviewToolInput = z.infer<typeof OntoReviewToolInputSchema>;
export type OntoPrepareReviewToolInput = z.infer<
  typeof OntoPrepareReviewToolInputSchema
>;
export type OntoReviewSessionInput = z.infer<typeof OntoReviewSessionInputSchema>;
export type OntoListDomainsToolInput = z.infer<
  typeof OntoListDomainsToolInputSchema
>;
