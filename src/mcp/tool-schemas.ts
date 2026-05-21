import { z } from "zod";

const ReviewModeSchema = z.enum(["core-axis", "full"]);
const DeliberationModeSchema = z.enum([
  "cross_process",
  "cross_context_reinvoke",
  "synthesizer_only",
]);

export const OntoReviewToolInputSchema = z.object({
  target: z.string().min(1),
  intent: z.string().min(1),
  projectRoot: z.string().min(1).optional(),
  domain: z.string().min(1).optional(),
  reviewMode: ReviewModeSchema.optional(),
  deliberation: DeliberationModeSchema.optional(),
  prepareOnly: z.boolean().optional(),
});

export const OntoPrepareReviewToolInputSchema =
  OntoReviewToolInputSchema.extend({
    prepareOnly: z.literal(true).default(true),
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
