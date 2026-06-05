export interface LensOutputForDeliberation {
  lens_id: string;
  output_path: string;
  content?: string;
}

export interface LensDeliberationResponseForTeamlead {
  lens_id: string;
  response_path: string;
  content?: string;
}

function fencedBlock(label: string, content: string): string {
  return [`### ${label}`, "", content.trim() || "(empty)"].join("\n");
}

function lensOutputRefs(outputs: LensOutputForDeliberation[]): string {
  if (outputs.length === 0) return "- (none)";
  return outputs
    .map((output) => `- ${output.lens_id}: ${output.output_path}`)
    .join("\n");
}

function lensResponseRefs(responses: LensDeliberationResponseForTeamlead[]): string {
  if (responses.length === 0) return "- (none)";
  return responses
    .map((response) => `- ${response.lens_id}: ${response.response_path}`)
    .join("\n");
}

function indentRefs(refs: string): string {
  return refs
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}

function optionalEmbeddedLensOutputs(outputs: LensOutputForDeliberation[]): string {
  const embedded = outputs.filter(
    (output): output is LensOutputForDeliberation & { content: string } =>
      typeof output.content === "string" && output.content.trim().length > 0,
  );
  if (embedded.length === 0) return "";
  return [
    "## Embedded Lens Outputs",
    "These embedded bodies are comparison context. Prefer the required refs above as the authoritative artifact seats.",
    "",
    embedded
      .map((output) =>
        fencedBlock(
          `${output.lens_id} primary output (${output.output_path})`,
          output.content,
        ),
      )
      .join("\n\n---\n\n"),
    "",
  ].join("\n");
}

export function buildLensControlledDeliberationPrompt(args: {
  session_id: string;
  lens_id: string;
  output_path: string;
  own_output: LensOutputForDeliberation;
  other_outputs: LensOutputForDeliberation[];
  issue_artifact_context?: string;
  boundary_context?: string;
}): string {
  return `# Controlled Lens Deliberation Prompt

session_id: ${args.session_id}
unit_id: deliberation-${args.lens_id}
unit_kind: deliberation
lens_id: ${args.lens_id}
output_path: ${args.output_path}

## Canonical Role
You are the ${args.lens_id} lens participating in controlled lens deliberation.
This is a fresh bounded context. You must read only the required artifact refs
listed in this packet. The teamlead controls this context; do not perform final
synthesis and do not inspect extra repository files.

## Boundary Policy
- tools: required
- source mutation: denied
- write output only to: ${args.output_path}
${args.boundary_context?.trim() || ""}

## Required Artifact Reads
- own primary lens output: ${args.own_output.output_path}
- other participating lens outputs:
${indentRefs(lensOutputRefs(args.other_outputs))}

${optionalEmbeddedLensOutputs([args.own_output, ...args.other_outputs])}

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
  boundary_context?: string;
}): string {
  return `# Teamlead Controlled Deliberation Prompt

session_id: ${args.session_id}
unit_id: controlled-deliberation
unit_kind: deliberation
output_path: ${args.output_path}

## Canonical Role
You are the teamlead-controlled deliberation resolver. Your job is to derive the
controlled deliberation result from lens primary outputs and lens deliberation
responses. You are not the final synthesize actor.

## Boundary Policy
- tools: required
- source mutation: denied
- write output only to: ${args.output_path}
${args.boundary_context?.trim() || ""}

## Inputs In Scope
Only the required artifact refs below are in scope.

## Required Artifact Reads
- primary lens outputs:
${indentRefs(lensOutputRefs(args.lens_outputs))}
- lens deliberation responses:
${indentRefs(lensResponseRefs(args.lens_deliberation_responses))}

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
