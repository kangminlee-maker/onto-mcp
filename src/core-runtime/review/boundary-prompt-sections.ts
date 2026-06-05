import type {
  BoundaryAccessPolicy,
  BoundaryEnforcementProfile,
  BoundaryPolicy,
  EffectiveBoundaryState,
} from "./artifact-types.js";
import { toRelativePath } from "./review-artifact-utils.js";
import { renderReviewUnitBoundaryDetailsSection } from "./unit-boundary-details.js";

export interface BoundaryPromptContext {
  boundary_policy: BoundaryPolicy;
  boundary_enforcement_profile: BoundaryEnforcementProfile;
  effective_boundary_state: EffectiveBoundaryState;
}

export function renderBoundaryPolicySection(
  context: BoundaryPromptContext,
  projectRoot: string,
  options?: {
    tools?: "required" | "optional" | "denied";
    repoExplorationPolicy?: BoundaryAccessPolicy;
    filesystemPolicy?: "read-only" | "denied";
    allowedOutputRefs?: string[];
  },
): string {
  const toolsPolicy = options?.tools ?? "optional";
  const repoExplorationPolicy =
    options?.repoExplorationPolicy ??
    context.boundary_policy.repo_exploration_policy;
  const filesystemPolicy = options?.filesystemPolicy ?? "read-only";
  const networkPolicy =
    context.boundary_policy.web_research_policy === "denied"
      ? "denied"
      : "allowed";
  const allowedOutputRefs =
    options?.allowedOutputRefs ??
    context.boundary_policy.write_policy.allowed_output_refs;
  return `## Boundary Policy
- Filesystem: ${filesystemPolicy}
- Network: ${networkPolicy}
- Tools: ${toolsPolicy}
- web research: ${context.boundary_policy.web_research_policy}
- repo exploration: ${repoExplorationPolicy}
- recursive reference expansion: ${context.boundary_policy.recursive_reference_expansion_policy}
- filesystem allowed roots:
${context.boundary_policy.filesystem_scope.allowed_roots
  .map((rootPath) => `  - ${toRelativePath(rootPath, projectRoot)}`)
  .join("\n")}
- source mutation: ${context.boundary_policy.write_policy.source_mutation_policy}
- allowed output refs:
${allowedOutputRefs
  .map((outputPath) => `  - ${toRelativePath(outputPath, projectRoot)}`)
  .join("\n")}
- extra exploration citation required: ${
    context.boundary_policy.provenance_policy.extra_exploration_citation_required
  }
- web source citation required: ${
    context.boundary_policy.provenance_policy.web_source_citation_required
  }`;
}

export function renderUnitBoundaryDetailsSection(args: {
  context: BoundaryPromptContext;
  projectRoot: string;
  unitId: string;
  outputPath: string;
  repoExplorationPolicy: BoundaryAccessPolicy;
  allowedReadRefs: string[];
}): string {
  return renderReviewUnitBoundaryDetailsSection({
    projectRoot: args.projectRoot,
    unitId: args.unitId,
    outputPath: args.outputPath,
    repoExplorationPolicy: args.repoExplorationPolicy,
    allowedReadRefs: args.allowedReadRefs,
    boundaryPolicy: args.context.boundary_policy,
    effectiveBoundaryState: args.context.effective_boundary_state,
    boundaryEnforcementProfile: args.context.boundary_enforcement_profile,
    refProjection: "project_relative",
  });
}
