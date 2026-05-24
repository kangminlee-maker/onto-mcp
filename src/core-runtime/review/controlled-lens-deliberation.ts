export interface LensOutputForDeliberation {
  lens_id: string;
  output_path: string;
  content: string;
}

export interface LensDeliberationResponseForTeamlead {
  lens_id: string;
  response_path: string;
  content: string;
}

function fencedBlock(label: string, content: string): string {
  return [`### ${label}`, "", content.trim() || "(empty)"].join("\n");
}

export function buildLensControlledDeliberationPrompt(args: {
  session_id: string;
  lens_id: string;
  output_path: string;
  own_output: LensOutputForDeliberation;
  other_outputs: LensOutputForDeliberation[];
  issue_artifact_context?: string;
}): string {
  const otherBlocks = args.other_outputs
    .map((other) =>
      fencedBlock(`${other.lens_id} primary output (${other.output_path})`, other.content),
    )
    .join("\n\n---\n\n");

  return `# Controlled Lens Deliberation Prompt

session_id: ${args.session_id}
unit_id: deliberation-${args.lens_id}
unit_kind: deliberation
lens_id: ${args.lens_id}
output_path: ${args.output_path}

## Canonical Role
You are the ${args.lens_id} lens participating in controlled lens deliberation.
This is a fresh bounded context. You receive only your primary lens output and
the other participating lens outputs. The teamlead controls this context; do not
perform final synthesis and do not inspect extra repository files.

## Own Primary Lens Output
${fencedBlock(`${args.lens_id} primary output (${args.own_output.output_path})`, args.own_output.content)}

## Other Participating Lens Outputs
${otherBlocks || "(none)"}

## Issue Artifact Context
${args.issue_artifact_context?.trim() || "(none)"}

## Task
Re-evaluate your lens position against the other lens outputs.

- Identify where another lens changes, strengthens, or weakens your conclusion.
- If no other lens output is provided, state that no cross-lens contest is
  available and preserve your bounded primary position.
- Use the issue artifact context to focus on root-cause issue clusters and planned contested points.
- Identify direct disagreements and state whether your lens concedes, narrows,
  or maintains its position.
- Preserve evidence limitations explicitly.
- Do not decide the final review outcome. The teamlead deliberation result will
  resolve or preserve contested points after reading every lens response.

## Required Output Sections
Use exactly these heading names:

\`\`\`
## Re-evaluation Summary
## Accepted From Other Lenses
## Contested Points
## Position Changes
## Final Lens Position
\`\`\`

Write only the markdown body for your deliberation response.`;
}

export function buildTeamleadControlledDeliberationPrompt(args: {
  session_id: string;
  output_path: string;
  lens_outputs: LensOutputForDeliberation[];
  lens_deliberation_responses: LensDeliberationResponseForTeamlead[];
  issue_artifact_context?: string;
}): string {
  const primaryBlocks = args.lens_outputs
    .map((lens) => fencedBlock(`${lens.lens_id} primary output (${lens.output_path})`, lens.content))
    .join("\n\n---\n\n");
  const responseBlocks = args.lens_deliberation_responses
    .map((response) =>
      fencedBlock(
        `${response.lens_id} deliberation response (${response.response_path})`,
        response.content,
      ),
    )
    .join("\n\n---\n\n");

  return `# Teamlead Controlled Deliberation Prompt

session_id: ${args.session_id}
unit_id: controlled-deliberation
unit_kind: deliberation
output_path: ${args.output_path}

## Canonical Role
You are the teamlead-controlled deliberation resolver. Your job is to derive the
controlled deliberation result from lens primary outputs and lens deliberation
responses. You are not the final synthesize actor.

## Inputs In Scope
Only the material below is in scope.

## Primary Lens Outputs
${primaryBlocks}

## Lens Deliberation Responses
${responseBlocks}

## Issue Artifact Context
${args.issue_artifact_context?.trim() || "(none)"}

## Task
Resolve contested points when the lens deliberation responses provide enough
reason to converge. Preserve unresolved disagreement when the responses do not
justify convergence. Do not invent a new lens perspective.
If only one lens participates, record that cross-lens disagreement is not
applicable for this run and preserve the single lens position as bounded
evidence, not as multi-lens consensus.
Use the issue artifact context as the root-cause issue frame; preserve issue IDs
and planned contested points when they are present.

## Required Frontmatter
Start the output with:

\`\`\`
---
deliberation_status: performed
---
\`\`\`

## Required Output Sections
Use exactly these heading names. The final synthesize stage consumes this file
as the authoritative deliberation result.

\`\`\`
## Consensus
## Conditional Consensus
## Disagreement
## Deliberation Decision
## Axiology-Proposed Additional Perspectives
## Purpose Alignment Verification
## Immediate Actions Required
## Recommendations
## Unique Finding Tagging
\`\`\`

The Deliberation Decision section must map every contested point to one of:
resolved, narrowed, or unresolved-with-reason.`;
}
