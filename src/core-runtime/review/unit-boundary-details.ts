import type {
  BoundaryEnforcementProfile,
  BoundaryPolicy,
  BoundaryAccessPolicy,
  EffectiveBoundaryState,
} from "./artifact-types.js";
import { toRelativePath } from "./review-artifact-utils.js";

type RefProjection = "project_relative" | "raw";

function normalizeRefs(
  refs: string[],
  projectRoot: string,
  projection: RefProjection,
): string[] {
  return [
    ...new Set(
      refs
        .filter((ref) => ref.trim().length > 0)
        .map((ref) =>
          projection === "project_relative"
            ? toRelativePath(ref, projectRoot)
            : ref,
        ),
    ),
  ].sort();
}

function normalizeRef(
  ref: string,
  projectRoot: string,
  projection: RefProjection,
): string {
  return projection === "project_relative" ? toRelativePath(ref, projectRoot) : ref;
}

export interface ReviewUnitBoundaryDetailsInput {
  projectRoot: string;
  unitId: string;
  outputPath: string;
  allowedReadRefs: string[];
  repoExplorationPolicy: BoundaryAccessPolicy;
  boundaryPolicy: BoundaryPolicy;
  effectiveBoundaryState: EffectiveBoundaryState;
  boundaryEnforcementProfile: BoundaryEnforcementProfile;
  refProjection?: RefProjection;
}

export function renderReviewUnitBoundaryDetailsSection(
  args: ReviewUnitBoundaryDetailsInput,
): string {
  const refProjection = args.refProjection ?? "raw";
  const allowedReadRefs = normalizeRefs(
    args.allowedReadRefs,
    args.projectRoot,
    refProjection,
  );
  const outputRef = normalizeRef(args.outputPath, args.projectRoot, refProjection);
  const allowedRoots = normalizeRefs(
    args.effectiveBoundaryState.filesystem_scope.effective_allowed_roots,
    args.projectRoot,
    refProjection,
  );

  return [
    "## Unit Boundary Details",
    "`unit_boundary` is the authoritative boundary for this review unit.",
    "`parent_boundary_context` is diagnostic traceability only and must not broaden this unit boundary.",
    "",
    "```json",
    JSON.stringify(
      {
        unit_boundary: {
          authority: "authoritative_unit_boundary",
          unit_id: args.unitId,
          web_research_policy:
            args.effectiveBoundaryState.web_research.effective_policy,
          repo_exploration_policy: args.repoExplorationPolicy,
          recursive_reference_expansion_policy:
            args.effectiveBoundaryState.recursive_reference_expansion
              .effective_policy,
          read_authority: {
            repo_exploration_policy: args.repoExplorationPolicy,
            allowed_read_refs: allowedReadRefs,
          },
          filesystem_scope: {
            allowed_roots: allowedRoots,
          },
          source_mutation_policy:
            args.effectiveBoundaryState.source_mutation.effective_policy,
          boundary_enforcement_profile: args.boundaryEnforcementProfile,
          output_seat: {
            output_path: outputRef,
            allowed_output_refs: [outputRef],
          },
        },
        parent_boundary_context: {
          authority: "diagnostic_parent_context",
          boundary_policy: args.boundaryPolicy,
          effective_boundary_state: args.effectiveBoundaryState,
          boundary_enforcement_profile: args.boundaryEnforcementProfile,
        },
      },
      null,
      2,
    ),
    "```",
  ].join("\n");
}
