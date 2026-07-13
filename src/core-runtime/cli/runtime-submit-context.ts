import path from "node:path";
import YAML from "yaml";
import type {
  RuntimeSubmitFindingRelationGraphContext,
  RuntimeSubmitIssueDeliberationSchemaContext,
  RuntimeSubmitIssueLedgerDependencyContext,
  RuntimeSubmitIssueStanceSchemaContext,
  RuntimeSubmitIssueSynthesisSchemaContext,
  RuntimeSubmitOutputFormat,
  RuntimeSubmitProblemFramingContext,
  RuntimeSubmitState,
} from "./structured-output-tools.js";

type RuntimeSubmitContextFields = Pick<
  RuntimeSubmitState,
  | "findingRelationGraphContext"
  | "problemFramingContext"
  | "issueLedgerDependencyContext"
  | "issueStanceSchemaContext"
  | "issueDeliberationSchemaContext"
  | "issueSynthesisSchemaContext"
>;

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a YAML mapping.`);
  }
  return value as Record<string, unknown>;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be a YAML list.`);
  }
  return value.map((item, index) => {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new Error(`${label}[${index}] must be a non-empty string.`);
    }
    return item;
  });
}

function arrayValue(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be a YAML list.`);
  }
  return value;
}

function requireStringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function parseYamlSection(args: {
  rawPacketText: string;
  heading: string;
  label: string;
}): Record<string, unknown> {
  const escapedHeading = args.heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = args.rawPacketText.match(
    new RegExp(`${escapedHeading}[\\s\\S]*?\`\`\`yaml\\n([\\s\\S]*?)\\n\`\`\``),
  );
  if (!match) {
    throw new Error(`${args.label} packet section is missing.`);
  }
  return requireRecord(YAML.parse(match[1] ?? ""), args.label);
}

export function parseRuntimeProblemFramingContext(
  rawPacketText: string,
): RuntimeSubmitProblemFramingContext {
  const parsed = parseYamlSection({
    rawPacketText,
    heading: "## Runtime Problem Framing Submit Context",
    label: "Runtime Problem Framing Submit Context",
  });
  const classificationContext = requireRecord(
    parsed.classification_context,
    "Runtime Problem Framing Submit Context.classification_context",
  );
  const surfaceMapRaw = requireRecord(
    parsed.issue_surface_finding_ids,
    "Runtime Problem Framing Submit Context.issue_surface_finding_ids",
  );
  const issueSurfaceFindingIds: Record<string, string[]> = {};
  for (const [issueId, findingIds] of Object.entries(surfaceMapRaw)) {
    issueSurfaceFindingIds[issueId] = stringArray(
      findingIds,
      `Runtime Problem Framing Submit Context.issue_surface_finding_ids.${issueId}`,
    );
  }
  return {
    classification_context: classificationContext,
    issue_surface_finding_ids: issueSurfaceFindingIds,
  };
}

export function parseRuntimeIssueLedgerDependencyContext(
  rawPacketText: string,
): RuntimeSubmitIssueLedgerDependencyContext {
  const parsed = parseYamlSection({
    rawPacketText,
    heading: "## Runtime Issue Ledger Submit Context",
    label: "Runtime Issue Ledger Submit Context",
  });
  const relations = arrayValue(
    parsed.shared_cause_relations,
    "Runtime Issue Ledger Submit Context.shared_cause_relations",
  ).map((item, index) => {
    const relation = requireRecord(
      item,
      `Runtime Issue Ledger Submit Context.shared_cause_relations[${index}]`,
    );
    return {
      relation_id: requireStringValue(
        relation.relation_id,
        `Runtime Issue Ledger Submit Context.shared_cause_relations[${index}].relation_id`,
      ),
      from_finding_id: requireStringValue(
        relation.from_finding_id,
        `Runtime Issue Ledger Submit Context.shared_cause_relations[${index}].from_finding_id`,
      ),
      to_finding_id: requireStringValue(
        relation.to_finding_id,
        `Runtime Issue Ledger Submit Context.shared_cause_relations[${index}].to_finding_id`,
      ),
      cause_claim:
        typeof relation.cause_claim === "string" &&
        relation.cause_claim.trim().length > 0
          ? relation.cause_claim
          : null,
    };
  });
  return { shared_cause_relations: relations };
}

export function parseRuntimeFindingRelationGraphContext(
  rawPacketText: string,
): RuntimeSubmitFindingRelationGraphContext {
  const parsed = parseYamlSection({
    rawPacketText,
    heading: "## Runtime Finding Relation Input Projection",
    label: "Runtime Finding Relation Input Projection",
  });
  return {
    causal_analysis_finding_ids: stringArray(
      parsed.causal_analysis_finding_ids,
      "Runtime Finding Relation Input Projection.causal_analysis_finding_ids",
    ),
  };
}

function addPromptRefVariants(args: {
  refs: Set<string>;
  artifactRef: string;
  anchor?: string;
}): void {
  args.refs.add(args.artifactRef);
  args.refs.add(path.basename(args.artifactRef));
  if (!args.anchor) return;
  args.refs.add(`${args.artifactRef}#${args.anchor}`);
  args.refs.add(`${path.basename(args.artifactRef)}#${args.anchor}`);
}

function addArtifactAnchorVariants(args: {
  refs: Set<string>;
  artifactRef: string;
  anchor: string;
  includeRawAnchor?: boolean;
}): void {
  args.refs.add(args.artifactRef);
  args.refs.add(`${args.artifactRef}#${args.anchor}`);
  if (args.includeRawAnchor) args.refs.add(args.anchor);
}

function parseRequestedIssueStanceLensId(rawPacketText: string): string {
  const match = rawPacketText.match(/^requested_lens_id:\s*(\S+)\s*$/m);
  if (!match?.[1]) {
    throw new Error("issue-stance packet is missing requested_lens_id.");
  }
  return match[1];
}

export function parseRuntimeIssueStanceSchemaContext(
  rawPacketText: string,
): RuntimeSubmitIssueStanceSchemaContext {
  const projection = parseYamlSection({
    rawPacketText,
    heading: "## Runtime Issue Stance Input Projection",
    label: "Runtime Issue Stance Input Projection",
  });
  const sourceRefs = requireRecord(
    projection.source_artifact_refs,
    "Runtime Issue Stance Input Projection.source_artifact_refs",
  );
  const findingLedgerRef = requireStringValue(
    sourceRefs.finding_ledger,
    "Runtime Issue Stance Input Projection.source_artifact_refs.finding_ledger",
  );
  const relationGraphRef = requireStringValue(
    sourceRefs.finding_relation_graph,
    "Runtime Issue Stance Input Projection.source_artifact_refs.finding_relation_graph",
  );
  const issueLedgerRef = requireStringValue(
    sourceRefs.issue_ledger,
    "Runtime Issue Stance Input Projection.source_artifact_refs.issue_ledger",
  );
  const requestedLensId = parseRequestedIssueStanceLensId(rawPacketText);
  const requestedLensRefs = new Set<string>();
  for (const line of rawPacketText.split("\n")) {
    const lensRef = line.match(/^- (.+\/round1\/([^/]+)\.findings\.yaml)\s*$/);
    if (lensRef?.[1] && lensRef[2] === requestedLensId) {
      addPromptRefVariants({ refs: requestedLensRefs, artifactRef: lensRef[1] });
    }
  }
  const requestedLensFindingRefs = new Set<string>();
  for (const [index, item] of arrayValue(
    projection.finding_summaries,
    "Runtime Issue Stance Input Projection.finding_summaries",
  ).entries()) {
    const finding = requireRecord(
      item,
      `Runtime Issue Stance Input Projection.finding_summaries[${index}]`,
    );
    const lensId = requireStringValue(
      finding.lens_id,
      `Runtime Issue Stance Input Projection.finding_summaries[${index}].lens_id`,
    );
    if (lensId !== requestedLensId) continue;
    // Issue-strict parity with the on-disk validator (issue-artifact-runtime
    // buildStanceEvidenceRefs): the lens's RAW finding evidence refs are a
    // per-lens union, but finding-ledger#findingId anchors are registered ONLY
    // per issue (surface_finding_ids loop below) — a cross-issue anchor that
    // passed submit here used to be rejected at the on-disk re-validation.
    for (const evidenceRef of stringArray(
      finding.evidence_refs,
      `Runtime Issue Stance Input Projection.finding_summaries[${index}].evidence_refs`,
    )) {
      requestedLensFindingRefs.add(evidenceRef);
    }
  }
  const relationRefsByFindingId = new Map<string, Set<string>>();
  for (const [index, item] of arrayValue(
    projection.relation_summaries,
    "Runtime Issue Stance Input Projection.relation_summaries",
  ).entries()) {
    const relation = requireRecord(
      item,
      `Runtime Issue Stance Input Projection.relation_summaries[${index}]`,
    );
    const relationId = requireStringValue(
      relation.relation_id,
      `Runtime Issue Stance Input Projection.relation_summaries[${index}].relation_id`,
    );
    const fromFindingId = requireStringValue(
      relation.from_finding_id,
      `Runtime Issue Stance Input Projection.relation_summaries[${index}].from_finding_id`,
    );
    const toFindingId = requireStringValue(
      relation.to_finding_id,
      `Runtime Issue Stance Input Projection.relation_summaries[${index}].to_finding_id`,
    );
    for (const findingId of [fromFindingId, toFindingId]) {
      const refs = relationRefsByFindingId.get(findingId) ?? new Set<string>();
      refs.add(relationId);
      relationRefsByFindingId.set(findingId, refs);
    }
  }
  const dependencyRelationRefsByIssueId = new Map<string, Set<string>>();
  for (const [index, item] of arrayValue(
    projection.issue_dependencies,
    "Runtime Issue Stance Input Projection.issue_dependencies",
  ).entries()) {
    const dependency = requireRecord(
      item,
      `Runtime Issue Stance Input Projection.issue_dependencies[${index}]`,
    );
    const relationRefs = stringArray(
      dependency.relation_refs,
      `Runtime Issue Stance Input Projection.issue_dependencies[${index}].relation_refs`,
    );
    for (const issueId of stringArray(
      dependency.issue_ids,
      `Runtime Issue Stance Input Projection.issue_dependencies[${index}].issue_ids`,
    )) {
      const refs = dependencyRelationRefsByIssueId.get(issueId) ?? new Set<string>();
      for (const relationRef of relationRefs) refs.add(relationRef);
      dependencyRelationRefsByIssueId.set(issueId, refs);
    }
  }
  const issueEvidenceRefs: Record<string, string[]> = {};
  for (const [index, item] of arrayValue(
    projection.issues,
    "Runtime Issue Stance Input Projection.issues",
  ).entries()) {
    const issue = requireRecord(
      item,
      `Runtime Issue Stance Input Projection.issues[${index}]`,
    );
    const issueId = requireStringValue(
      issue.issue_id,
      `Runtime Issue Stance Input Projection.issues[${index}].issue_id`,
    );
    const refs = new Set<string>(requestedLensRefs);
    for (const lensFindingRef of requestedLensFindingRefs) {
      refs.add(lensFindingRef);
    }
    addPromptRefVariants({ refs, artifactRef: issueLedgerRef, anchor: issueId });
    for (const evidenceRef of stringArray(
      issue.evidence_refs,
      `Runtime Issue Stance Input Projection.issues[${index}].evidence_refs`,
    )) {
      refs.add(evidenceRef);
    }
    for (const findingId of stringArray(
      issue.surface_finding_ids,
      `Runtime Issue Stance Input Projection.issues[${index}].surface_finding_ids`,
    )) {
      addPromptRefVariants({ refs, artifactRef: findingLedgerRef, anchor: findingId });
      for (const relationId of relationRefsByFindingId.get(findingId) ?? []) {
        // Bare relation id parity with the on-disk validator, which registers
        // the raw id for graph-endpoint relations — a bare `rel-N` submit used
        // to be rejected here but accepted on disk (live-observed class).
        refs.add(relationId);
        addPromptRefVariants({
          refs,
          artifactRef: relationGraphRef,
          anchor: relationId,
        });
      }
    }
    for (const relationId of stringArray(
      issue.relation_refs,
      `Runtime Issue Stance Input Projection.issues[${index}].relation_refs`,
    )) {
      refs.add(relationId);
      addPromptRefVariants({
        refs,
        artifactRef: relationGraphRef,
        anchor: relationId,
      });
    }
    for (const relationId of dependencyRelationRefsByIssueId.get(issueId) ?? []) {
      refs.add(relationId); // bare-id parity with the on-disk dependency loop
      addPromptRefVariants({
        refs,
        artifactRef: relationGraphRef,
        anchor: relationId,
      });
    }
    issueEvidenceRefs[issueId] = [...refs].sort();
  }
  return { issue_evidence_refs: issueEvidenceRefs };
}

function addStringRefs(refs: Set<string>, value: unknown): void {
  if (typeof value !== "string" || value.trim().length === 0) return;
  refs.add(value);
}

function collectDeliberationAllowedRefs(value: unknown, refs: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectDeliberationAllowedRefs(item, refs);
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(record)) {
    if (key === "evidence_refs" || key === "source_stance_refs") {
      for (const ref of stringArray(child, `Runtime Projection.${key}`)) {
        refs.add(ref);
      }
      continue;
    }
    if (key === "issue_id" && typeof child === "string") {
      addArtifactAnchorVariants({
        refs,
        artifactRef: "issue-ledger.yaml",
        anchor: child,
      });
      continue;
    }
    if (key === "surface_finding_ids") {
      for (const findingId of stringArray(child, "Runtime Projection.surface_finding_ids")) {
        addArtifactAnchorVariants({
          refs,
          artifactRef: "finding-ledger.yaml",
          anchor: findingId,
        });
      }
      continue;
    }
    if (key === "relation_refs") {
      for (const relationRef of stringArray(child, "Runtime Projection.relation_refs")) {
        refs.add(relationRef);
        if (!relationRef.includes("#")) {
          addArtifactAnchorVariants({
            refs,
            artifactRef: "finding-relation-graph.yaml",
            anchor: relationRef,
          });
        }
      }
      continue;
    }
    collectDeliberationAllowedRefs(child, refs);
  }
}

export function parseRuntimeIssueDeliberationSchemaContext(
  rawPacketText: string,
): RuntimeSubmitIssueDeliberationSchemaContext {
  const projection = parseYamlSection({
    rawPacketText,
    heading: "## Runtime Projection",
    label: "Runtime Projection",
  });
  const refs = new Set<string>();
  collectDeliberationAllowedRefs(projection, refs);
  const issue = requireRecord(projection.issue, "Runtime Projection.issue");
  const issueId = requireStringValue(
    issue.issue_id,
    "Runtime Projection.issue.issue_id",
  );
  addArtifactAnchorVariants({
    refs,
    artifactRef: "issue-ledger.yaml",
    anchor: issueId,
  });
  const ownStance = requireRecord(
    projection.own_stance,
    "Runtime Projection.own_stance",
  );
  const ownLensId = requireStringValue(
    ownStance.lens_id,
    "Runtime Projection.own_stance.lens_id",
  );
  addArtifactAnchorVariants({
    refs,
    artifactRef: "issue-stance-matrix.yaml",
    anchor: `stances.${issueId}.${ownLensId}`,
  });
  for (const [index, item] of arrayValue(
    projection.peer_stances,
    "Runtime Projection.peer_stances",
  ).entries()) {
    const peerStance = requireRecord(item, `Runtime Projection.peer_stances[${index}]`);
    const peerLensId = requireStringValue(
      peerStance.lens_id,
      `Runtime Projection.peer_stances[${index}].lens_id`,
    );
    addArtifactAnchorVariants({
      refs,
      artifactRef: "issue-stance-matrix.yaml",
      anchor: `stances.${issueId}.${peerLensId}`,
    });
  }
  return { allowed_evidence_refs: [...refs].sort() };
}

export function parseRuntimeIssueSynthesisSchemaContext(
  rawPacketText: string,
): RuntimeSubmitIssueSynthesisSchemaContext {
  const workItem = parseYamlSection({
    rawPacketText,
    heading: "## Runtime Work Item",
    label: "Runtime Work Item",
  });
  const workItemId = requireStringValue(
    workItem.work_item_id,
    "Runtime Work Item.work_item_id",
  );
  return {
    allowed_source_refs: stringArray(
      workItem.allowed_source_refs,
      "Runtime Work Item.allowed_source_refs",
    ),
    source_work_item_ref: `synthesis-work-items.yaml#${workItemId}`,
  };
}

export function parseRuntimeSubmitContextForOutputFormat(args: {
  rawPacketText: string;
  unitId: string;
  outputFormat: RuntimeSubmitOutputFormat;
}): Partial<RuntimeSubmitContextFields> {
  if (args.outputFormat === "issue-artifact") {
    if (args.unitId === "finding-relation-graph") {
      return {
        findingRelationGraphContext: parseRuntimeFindingRelationGraphContext(
          args.rawPacketText,
        ),
      };
    }
    if (args.unitId === "problem-framing") {
      return {
        problemFramingContext: parseRuntimeProblemFramingContext(args.rawPacketText),
      };
    }
    if (args.unitId === "issue-ledger") {
      return {
        issueLedgerDependencyContext: parseRuntimeIssueLedgerDependencyContext(
          args.rawPacketText,
        ),
      };
    }
    return {};
  }
  if (args.outputFormat === "issue-stance-response") {
    return {
      issueStanceSchemaContext: parseRuntimeIssueStanceSchemaContext(
        args.rawPacketText,
      ),
    };
  }
  if (args.outputFormat === "issue-deliberation-response") {
    return {
      issueDeliberationSchemaContext: parseRuntimeIssueDeliberationSchemaContext(
        args.rawPacketText,
      ),
    };
  }
  if (args.outputFormat === "issue-synthesis-response") {
    return {
      issueSynthesisSchemaContext: parseRuntimeIssueSynthesisSchemaContext(
        args.rawPacketText,
      ),
    };
  }
  return {};
}
