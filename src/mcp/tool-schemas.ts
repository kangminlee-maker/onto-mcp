import { z } from "zod";

const ReviewModeSchema = z.enum(["core-axis", "full"]);
const ExecutorRealizationSchema = z.enum(["codex", "mock", "ts_inline_http"]);
const DeliberationModeSchema = z.enum([
  "cross_process",
  "cross_context_reinvoke",
  "synthesizer_only",
]);

const OntoReviewToolInputBaseSchema = z.object({
  target: z.string().min(1),
  intent: z.string().min(1),
  projectRoot: z.string().min(1).optional(),
  domain: z.string().min(1).optional(),
  noDomain: z.boolean().optional(),
  reviewMode: ReviewModeSchema.optional(),
  lensIds: z.array(z.string().min(1)).optional(),
  maxConcurrentLenses: z.number().int().positive().optional(),
  deliberation: DeliberationModeSchema.optional(),
  executorRealization: ExecutorRealizationSchema.optional(),
  prepareOnly: z.boolean().optional(),
});

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
