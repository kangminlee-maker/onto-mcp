#!/usr/bin/env node

import path from "node:path";
import { parseArgs } from "node:util";
import type {
  ReviewMode,
  ReviewTargetScopeKind,
} from "../review/artifact-types.js";
import {
  parseBooleanFlag,
} from "../review/review-artifact-utils.js";
import { writeInvocationInterpretationArtifact } from "../review/materializers.js";
import { printOntoReleaseChannelNotice } from "../release-channel/release-channel.js";

function requireString(
  value: string | boolean | undefined,
  optionName: string,
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required option --${optionName}`);
  }
  return value;
}

function optionalString(value: string | boolean | undefined): string {
  return typeof value === "string" ? value : "";
}

function requireReviewTargetScopeKind(value: string): ReviewTargetScopeKind {
  if (value === "file" || value === "directory" || value === "bundle") {
    return value;
  }
  throw new Error(`Invalid --target-scope-kind: ${value}`);
}

function requireReviewMode(value: string): ReviewMode {
  if (value === "core-axis" || value === "full") {
    return value;
  }
  throw new Error(`Invalid --review-mode-recommendation: ${value}`);
}

async function main(): Promise<number> {
  await printOntoReleaseChannelNotice();
  const { values } = parseArgs({
    options: {
      "session-root": { type: "string" },
      entrypoint: { type: "string", default: "review" },
      "target-scope-kind": { type: "string" },
      "primary-ref": { type: "string" },
      "member-ref": { type: "string", multiple: true, default: [] },
      "bundle-kind": { type: "string" },
      "intent-summary": { type: "string" },
      "domain-recommendation": { type: "string", default: "" },
      "domain-selection-required": { type: "string", default: "true" },
      "review-mode-recommendation": { type: "string" },
      "always-include-lens-id": { type: "string", multiple: true, default: [] },
      "recommended-lens-id": { type: "string", multiple: true, default: [] },
      rationale: { type: "string", multiple: true, default: [] },
      "ambiguity-note": { type: "string", multiple: true, default: [] },
    },
    strict: true,
    allowPositionals: false,
  });

  const sessionRoot = path.resolve(requireString(values["session-root"], "session-root"));
  const targetScopeKind = requireReviewTargetScopeKind(
    requireString(values["target-scope-kind"], "target-scope-kind"),
  );
  const primaryRef = requireString(values["primary-ref"], "primary-ref");
  const reviewModeRecommendation = requireReviewMode(
    requireString(values["review-mode-recommendation"], "review-mode-recommendation"),
  );

  const interpretationParams = {
    sessionRoot,
    entrypoint: requireString(values.entrypoint, "entrypoint") as "review",
    targetScopeKind,
    primaryRef,
    memberRefs: values["member-ref"],
    intentSummary: requireString(values["intent-summary"], "intent-summary"),
    domainRecommendation: optionalString(values["domain-recommendation"]),
    domainSelectionRequired: parseBooleanFlag(
      values["domain-selection-required"],
      "domain-selection-required",
    ),
    reviewModeRecommendation,
    alwaysIncludeLensIds: values["always-include-lens-id"],
    recommendedLensIds: values["recommended-lens-id"],
    rationale: values.rationale,
    ambiguityNotes: values["ambiguity-note"],
    ...(typeof values["bundle-kind"] === "string" && values["bundle-kind"].length > 0
      ? { bundleKind: values["bundle-kind"] }
      : {}),
  };

  const interpretationArtifactPath = await writeInvocationInterpretationArtifact(
    interpretationParams,
  );
  console.log(interpretationArtifactPath);
  return 0;
}

main().then(
  (exitCode) => process.exit(exitCode),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
