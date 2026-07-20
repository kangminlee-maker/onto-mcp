import { createHash } from "node:crypto";
import type {
  CodeStructureInventory,
  ObservedCodeImport,
} from "../code-structure-observer.js";

// ─────────────────────────────────────────────────────────────────────────────
// comprehension-set-tier — Phase 1b multi-file code set assembly, DETERMINISTIC realization
// (design 20260720 v3 FD1~FD8·FD11~FD14; impl plan 20260720-semantic-map-1b-deterministic).
// LLM-free and pure: persisted code observations (inventory + opt-in imports) in →
// topology + conservative import relations + bounded overview render + fingerprint out.
// The LLM realization (FD9/FD10 prompt contracts, G11) is deferred; realization identity is
// folded into the fingerprint so the two modes can never silently reuse each other (FD11).
// Failure direction is always fail-closed: structural violation → failed_structure (no set),
// cap exceeded → skipped_capacity (no partial set), <2 candidates → not_applicable.
// ─────────────────────────────────────────────────────────────────────────────

export const CODE_SET_TIER_SCHEMA_VERSION = "1" as const;
export const CODE_SET_TIER_RESOLVER_VERSION = "conservative:v1" as const;
export const CODE_SET_TIER_REALIZATION = "deterministic" as const;

// Structural caps (OD-4 conservative initial values — all folded into the set fingerprint;
// LLM call/prompt/output caps are inapplicable in the deterministic realization).
export const CODE_SET_TIER_MAX_MEMBERS = 256;
export const CODE_SET_TIER_MAX_NODES = 128;
export const CODE_SET_TIER_MAX_DIRECT_CHILDREN = 64;
export const CODE_SET_TIER_MAX_IMPORT_RECORDS = 2_048;
export const CODE_SET_TIER_MAX_RELATIONS_TOTAL = 1_024;
/** Global overview-render relation exposure cap (deterministic flat render — the per-node
 *  ×32 prompt cap of the LLM realization does not apply to a single flat overview). */
export const CODE_SET_TIER_RELATIONS_RENDER_CAP = 128;
export const CODE_SET_TIER_OVERVIEW_CHAR_BUDGET = 20_000;
/** Per-file symbol-name exposure cap in the overview render. */
export const CODE_SET_TIER_FILE_SYMBOLS_RENDER_CAP = 8;

/** Seed-prompt note for the deterministic set overview (W4 R2-02: the seed system prompt must
 *  declare every userPayload field it can see). Registered in the SET contract dict below —
 *  NOT in CG-1 and NOT in CODE_RECONSTRUCT_AUTHORING_PROMPT_CONTRACT (FD9: a whole-dict sha
 *  fold there would rotate unrelated reuse keys; this digest folds into the SET fingerprint
 *  only). */
export const CODE_SET_TIER_SEED_PROMPT_NOTE =
  "code_set_tier: a DETERMINISTIC multi-file structure overview of the observed code set — " +
  "directory topology, per-file line/symbol facts, and conservatively resolved import " +
  "relations (unresolved imports carry an explicit reason, never a guessed target). It is " +
  "extracted mechanically from the observed files: treat it as structural ground truth for " +
  "what files/directories/relations EXIST, and treat any meaning you infer from names as " +
  "your own hypothesis, not a source claim.";

export const CODE_SET_AUTHORING_PROMPT_CONTRACT_VERSION =
  "reconstruct_code_set_authoring_prompt_contract:v1";

/** The SET-tier prompt contract dict (FD9 surface part — the deferred LLM synthesis contracts
 *  will join this dict, never CG-1/CODE dicts, so editing them rotates SET reuse keys only). */
export const CODE_SET_RECONSTRUCT_AUTHORING_PROMPT_CONTRACT: Record<string, string> = {
  code_set_tier_seed_note: CODE_SET_TIER_SEED_PROMPT_NOTE,
};

export function codeSetAuthoringPromptContractSha256(
  contract: Record<string, string> = CODE_SET_RECONSTRUCT_AUTHORING_PROMPT_CONTRACT,
): string {
  return sha256Text(stableJson({
    contract_version: CODE_SET_AUTHORING_PROMPT_CONTRACT_VERSION,
    templates: contract,
  }));
}

export type CodeSetTierStatus =
  | "complete"
  | "not_applicable"
  | "skipped_capacity"
  | "failed_structure";

export type SetImportResolutionReason =
  | "resolved_unique"
  | "external_or_bare"
  | "unsupported_form"
  | "no_member_match"
  | "ambiguous_member_match"
  | "inventory_truncated"
  | "parse_unavailable"
  | "specifier_truncated";

export interface SetImportRelation {
  relation_id: string;
  /** Canonical set-relative member path of the importing file. */
  from: string;
  to_specifier: string;
  resolved_in_set: string | null;
}

export interface SetRelationResolutionCensusRow {
  relation_id: string;
  reason: SetImportResolutionReason;
}

export interface SetRelationCensus {
  total: number;
  resolved: number;
  unresolved: number;
  reasons: Partial<Record<SetImportResolutionReason, number>>;
  /** FD4 honesty: members whose persisted inventory carries NO import list (e.g. captured
   *  before the set opt-in) — their imports are unknowable here, never silently zero. */
  members_without_import_inventory: string[];
}

export interface SetTopologyFileMember {
  observation_id: string;
  member_path: string;
}

export interface SetTopologyNode {
  /** Canonical set-relative directory path; "" is the set root. */
  set_path: string;
  parent_path: string | null;
  child_set_paths: string[];
  file_members: SetTopologyFileMember[];
  descendant_file_count: number;
}

export interface CodeSetTierCapacityViolation {
  violated:
    | "max_members"
    | "max_nodes"
    | "max_direct_children"
    | "max_import_records"
    | "max_relations_total";
  actual: number;
  limit: number;
}

export interface CodeSetTierStructureFailure {
  reason: string;
  detail: string;
}

export interface CodeSetTierOverviewFile {
  path: string;
  language: string;
  lines: number;
  symbols: string[];
}

export interface CodeSetTierOverviewDirectory {
  set_path: string;
  direct_files: number;
  descendant_files: number;
  files: CodeSetTierOverviewFile[];
}

export interface CodeSetTierOverviewRender {
  realization: typeof CODE_SET_TIER_REALIZATION;
  member_count: number;
  directories: CodeSetTierOverviewDirectory[];
  relations: {
    total: number;
    exposed: number;
    omitted: number;
    rows: Array<{ from: string; to: string } | { from: string; specifier: string; reason: string }>;
  };
  /** Sections the char budget actually demoted (projection-module `sections` precedent). */
  truncated_sections: { section: string; kept: number; total: number }[];
}

export interface CodeSetTierExcludedRef {
  observation_id: string;
  reason: string;
}

/** One candidate code observation as the assembler sees it (the caller projects the persisted
 *  source-observations artifact down to this — the module never reads files or artifacts). */
export interface CodeSetTierMemberInput {
  observation_id: string;
  /** Absolute (or run-root-relative, but consistent) source path of the observed file. */
  source_ref: string;
  inventory: CodeStructureInventory;
}

export interface CodeSetTierAssemblyInput {
  members: CodeSetTierMemberInput[];
  excluded: CodeSetTierExcludedRef[];
}

export interface CodeSetTierResult {
  schema_version: typeof CODE_SET_TIER_SCHEMA_VERSION;
  realization: typeof CODE_SET_TIER_REALIZATION;
  resolver_version: typeof CODE_SET_TIER_RESOLVER_VERSION;
  status: CodeSetTierStatus;
  /** FD13: null unless status is `complete` or an exact `not_applicable` — the authored-artifact
   *  reuse gate refuses set-tier reuse on null, so an incomplete set can never be reused. */
  set_tier_aggregate_fingerprint: string | null;
  member_observation_ids: string[];
  excluded_refs: CodeSetTierExcludedRef[];
  topology: SetTopologyNode[] | null;
  relations: SetImportRelation[] | null;
  relation_resolution_census: SetRelationResolutionCensusRow[] | null;
  relation_census: SetRelationCensus | null;
  capacity_violation: CodeSetTierCapacityViolation | null;
  structure_failure: CodeSetTierStructureFailure | null;
  overview_render: CodeSetTierOverviewRender | null;
  caps: Record<string, number>;
}

// ── local util twins (repo idiom: module-local stableJson/sha256) ─────────────────────────────
function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

const capsInForce = (): Record<string, number> => ({
  max_members: CODE_SET_TIER_MAX_MEMBERS,
  max_nodes: CODE_SET_TIER_MAX_NODES,
  max_direct_children: CODE_SET_TIER_MAX_DIRECT_CHILDREN,
  max_import_records: CODE_SET_TIER_MAX_IMPORT_RECORDS,
  max_relations_total: CODE_SET_TIER_MAX_RELATIONS_TOTAL,
  relations_render_cap: CODE_SET_TIER_RELATIONS_RENDER_CAP,
  overview_char_budget: CODE_SET_TIER_OVERVIEW_CHAR_BUDGET,
  file_symbols_render_cap: CODE_SET_TIER_FILE_SYMBOLS_RENDER_CAP,
});

// ── path canonicalization (FD2 — component-array comparison, never string prefixes) ───────────
/** Split a source path into normalized components. Windows separators are normalized; a
 *  trailing/leading separator yields no empty components. Returns null on `.`/`..`/empty
 *  components (the 11-rule validator rejects them — real observed refs are already resolved). */
export function pathComponentsOf(sourcePath: string): string[] | null {
  const parts = sourcePath.split(/[\\/]+/).filter((part) => part.length > 0);
  for (const part of parts) {
    if (part === "." || part === "..") return null;
  }
  return parts;
}

function commonPrefixLength(a: string[], b: string[]): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
}

// ── partition validation (FD2 — sol DD03 11 rules over the constructed topology) ──────────────
/** Validate the canonical member paths BEFORE topology construction (rules 1/2/3/8/11 of the
 *  DD03 list; the remaining rules are enforced by construction and re-checked after). Returns a
 *  structure-failure description or null. Exported for the negative-control gate (G3). */
export function validateMemberPaths(
  memberPaths: readonly { observation_id: string; components: string[] }[],
): CodeSetTierStructureFailure | null {
  const seen = new Map<string, string>();
  const dirPaths = new Set<string>();
  for (const member of memberPaths) {
    if (member.components.length === 0) {
      return {
        reason: "invalid_member_path",
        detail: `observation ${member.observation_id} canonicalizes to an empty path`,
      };
    }
    const joined = member.components.join("/");
    const prior = seen.get(joined);
    if (prior !== undefined) {
      return {
        reason: "duplicate_canonical_path",
        detail: `observations ${prior} and ${member.observation_id} both canonicalize to ${joined}`,
      };
    }
    seen.set(joined, member.observation_id);
    for (let i = 1; i < member.components.length; i += 1) {
      dirPaths.add(member.components.slice(0, i).join("/"));
    }
  }
  for (const [filePath, observationId] of seen) {
    if (dirPaths.has(filePath)) {
      return {
        reason: "file_directory_collision",
        detail: `${filePath} is both a file (observation ${observationId}) and a directory prefix`,
      };
    }
  }
  return null;
}

// ── conservative import resolver (FD5 — observed-set-only, unique-match, fail-to-null) ────────
interface ResolvedImportRow {
  from: string;
  to_specifier: string;
  resolved_in_set: string | null;
  reason: SetImportResolutionReason;
}

const TS_LANGS = new Set(["typescript", "javascript"]);

/** Strip ONE final extension component ("a/b.ts" → "a/b"); no extension → unchanged. */
function stemOf(memberPath: string): string {
  const lastSlash = memberPath.lastIndexOf("/");
  const dot = memberPath.lastIndexOf(".");
  return dot > lastSlash + 1 ? memberPath.slice(0, dot) : memberPath;
}

function resolveOneImport(args: {
  language: string;
  fromComponents: string[];
  record: ObservedCodeImport;
  byExact: Map<string, string>;
  byStem: Map<string, string[]>;
}): { resolved: string | null; reason: SetImportResolutionReason } {
  const { record } = args;
  if (record.specifier_truncated === true) {
    return { resolved: null, reason: "specifier_truncated" };
  }
  const specifier = record.to_specifier;
  const fromDir = args.fromComponents.slice(0, -1);
  let candidateComponents: string[] | null = null;
  if (TS_LANGS.has(args.language)) {
    if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
      return { resolved: null, reason: "external_or_bare" };
    }
    const raw = [...fromDir];
    let escaped = false;
    for (const part of specifier.split("/")) {
      if (part === "" || part === ".") continue;
      if (part === "..") {
        if (raw.length === 0) {
          escaped = true;
          break;
        }
        raw.pop();
        continue;
      }
      raw.push(part);
    }
    candidateComponents = escaped ? null : raw;
    if (candidateComponents === null) {
      return { resolved: null, reason: "no_member_match" };
    }
  } else if (args.language === "python") {
    const dots = specifier.match(/^\.+/)?.[0]?.length ?? 0;
    if (dots === 0) {
      // Absolute python import — resolving it needs sys.path authority we do not have.
      return { resolved: null, reason: "external_or_bare" };
    }
    const rest = specifier.slice(dots);
    if (rest.includes("/") || /[^A-Za-z0-9_.]/.test(rest)) {
      return { resolved: null, reason: "unsupported_form" };
    }
    const raw = [...fromDir];
    let escaped = false;
    for (let i = 1; i < dots; i += 1) {
      if (raw.length === 0) {
        escaped = true;
        break;
      }
      raw.pop();
    }
    if (escaped) return { resolved: null, reason: "no_member_match" };
    for (const part of rest.split(".").filter((p) => p.length > 0)) {
      raw.push(part);
    }
    candidateComponents = raw;
  } else {
    return { resolved: null, reason: "unsupported_form" };
  }
  const candidate = candidateComponents.join("/");
  const exact = args.byExact.get(candidate);
  if (exact !== undefined) return { resolved: exact, reason: "resolved_unique" };
  // Stem comparison ("마지막 suffix 제거" — sol DD06): an extensionless candidate matches the
  // member's stem directly; a SCRIPT-extension candidate (the TS NodeNext idiom imports "./a.js"
  // for source "a.ts") is stemmed first. Non-script extensions (.css, .json, …) never
  // stem-match a script member — that would be a false link, the exact failure direction FD5
  // forbids.
  const candidateStem = stemOf(candidate);
  const stemLookupKey = candidate === candidateStem
    ? candidate
    : SCRIPT_EXTENSION.test(candidate)
      ? candidateStem
      : null;
  if (stemLookupKey === null) return { resolved: null, reason: "no_member_match" };
  const stems = args.byStem.get(stemLookupKey) ?? [];
  if (stems.length === 1) return { resolved: stems[0]!, reason: "resolved_unique" };
  if (stems.length > 1) return { resolved: null, reason: "ambiguous_member_match" };
  return { resolved: null, reason: "no_member_match" };
}

const SCRIPT_EXTENSION = /\.(js|mjs|cjs|jsx|ts|tsx|mts|cts|py)$/;

// ── overview render (FD11 deterministic realization; bounded like the projection module) ──────
function renderOverview(args: {
  topology: SetTopologyNode[];
  membersByPath: Map<string, CodeSetTierMemberInput>;
  relations: SetImportRelation[];
  resolutionByRelationId: Map<string, SetImportResolutionReason>;
  charBudget: number;
}): CodeSetTierOverviewRender {
  const pretty = (value: unknown): number => JSON.stringify(value, null, 2).length;
  const truncated: CodeSetTierOverviewRender["truncated_sections"] = [];
  const record = (section: string, kept: number, total: number): void => {
    if (kept < total) truncated.push({ section, kept, total });
  };
  const fileRow = (member: CodeSetTierMemberInput, memberPath: string, symbolCap: number): CodeSetTierOverviewFile => {
    const names = new Set<string>();
    for (const span of member.inventory.symbol_tiles.spans) {
      if (span.depth !== 1) continue;
      for (const name of span.symbol_names) {
        names.add(name);
        if (names.size >= symbolCap) break;
      }
      if (names.size >= symbolCap) break;
    }
    return {
      path: memberPath,
      language: member.inventory.language,
      lines: member.inventory.line_count,
      symbols: [...names],
    };
  };
  const exposedRelations = args.relations.slice(0, CODE_SET_TIER_RELATIONS_RENDER_CAP);
  record("relations", exposedRelations.length, args.relations.length);
  const relationRows = exposedRelations.map((relation) =>
    relation.resolved_in_set !== null
      ? { from: relation.from, to: relation.resolved_in_set }
      : {
        from: relation.from,
        specifier: relation.to_specifier,
        reason: args.resolutionByRelationId.get(relation.relation_id) ?? "unresolved",
      }
  );
  const directories = (symbolCap: number, includeFiles: boolean): CodeSetTierOverviewDirectory[] =>
    args.topology.map((node) => ({
      set_path: node.set_path,
      direct_files: node.file_members.length,
      descendant_files: node.descendant_file_count,
      files: includeFiles
        ? node.file_members.map((file) =>
          fileRow(args.membersByPath.get(file.member_path)!, file.member_path, symbolCap)
        )
        : [],
    }));
  const memberCount = args.membersByPath.size;
  const candidate = (symbolCap: number, includeFiles: boolean): CodeSetTierOverviewRender => ({
    realization: CODE_SET_TIER_REALIZATION,
    member_count: memberCount,
    directories: directories(symbolCap, includeFiles),
    relations: {
      total: args.relations.length,
      exposed: exposedRelations.length,
      omitted: args.relations.length - exposedRelations.length,
      rows: relationRows,
    },
    truncated_sections: truncated,
  });
  let render = candidate(CODE_SET_TIER_FILE_SYMBOLS_RENDER_CAP, true);
  if (pretty(render) <= args.charBudget) return render;
  record("file_symbols", 0, memberCount);
  render = candidate(0, true);
  if (pretty(render) <= args.charBudget) return render;
  record("files", 0, memberCount);
  render = candidate(0, false);
  return render;
}

// ── assembly (FD2/FD3/FD5/FD6/FD12/FD13/FD14 — the single deterministic entry point) ──────────
export function assembleCodeSetTier(input: CodeSetTierAssemblyInput): CodeSetTierResult {
  const caps = capsInForce();
  const base = {
    schema_version: CODE_SET_TIER_SCHEMA_VERSION,
    realization: CODE_SET_TIER_REALIZATION,
    resolver_version: CODE_SET_TIER_RESOLVER_VERSION,
    member_observation_ids: input.members
      .map((member) => member.observation_id)
      .sort(),
    excluded_refs: [...input.excluded].sort((a, b) =>
      a.observation_id < b.observation_id ? -1 : a.observation_id > b.observation_id ? 1 : 0
    ),
    caps,
  } as const;
  const failure = (
    status: Exclude<CodeSetTierStatus, "complete" | "not_applicable">,
    detail: {
      capacity_violation?: CodeSetTierCapacityViolation;
      structure_failure?: CodeSetTierStructureFailure;
    },
  ): CodeSetTierResult => ({
    ...base,
    status,
    set_tier_aggregate_fingerprint: null,
    topology: null,
    relations: null,
    relation_resolution_census: null,
    relation_census: null,
    capacity_violation: detail.capacity_violation ?? null,
    structure_failure: detail.structure_failure ?? null,
    overview_render: null,
  });

  // FD14/FD7: fewer than 2 candidates is the ONLY not_applicable (capacity/provider failures
  // must never demote to it).
  if (input.members.length < 2) {
    return {
      ...base,
      status: "not_applicable",
      set_tier_aggregate_fingerprint: fingerprintOf({
        members: input.members,
        topology: [],
        relations: [],
        caps,
      }),
      topology: null,
      relations: null,
      relation_resolution_census: null,
      relation_census: null,
      capacity_violation: null,
      structure_failure: null,
      overview_render: null,
    };
  }
  if (input.members.length > CODE_SET_TIER_MAX_MEMBERS) {
    return failure("skipped_capacity", {
      capacity_violation: {
        violated: "max_members",
        actual: input.members.length,
        limit: CODE_SET_TIER_MAX_MEMBERS,
      },
    });
  }

  // Canonicalization: set root = deepest common directory of all member paths, member paths
  // relative to it (component-array math throughout — FD2 / sol→fable M-08).
  const rawComponents: { observation_id: string; components: string[] }[] = [];
  for (const member of input.members) {
    const components = pathComponentsOf(member.source_ref);
    if (components === null || components.length === 0) {
      return failure("failed_structure", {
        structure_failure: {
          reason: "invalid_member_path",
          detail: `observation ${member.observation_id} has a non-canonical source path: ${member.source_ref}`,
        },
      });
    }
    rawComponents.push({ observation_id: member.observation_id, components });
  }
  let rootLength = rawComponents[0]!.components.length - 1;
  for (const member of rawComponents) {
    const dir = member.components.slice(0, -1);
    rootLength = Math.min(rootLength, commonPrefixLength(rawComponents[0]!.components.slice(0, rootLength), dir));
  }
  const memberPaths = rawComponents.map((member) => ({
    observation_id: member.observation_id,
    components: member.components.slice(rootLength),
  }));
  const pathFailure = validateMemberPaths(memberPaths);
  if (pathFailure) {
    return failure("failed_structure", { structure_failure: pathFailure });
  }

  // Topology (FD2): one node per directory on the path from the set root to each member file;
  // empty (unobserved) directories are never materialized.
  const membersById = new Map(input.members.map((member) => [member.observation_id, member]));
  const nodesByPath = new Map<string, SetTopologyNode>();
  const ensureNode = (setPath: string, parentPath: string | null): SetTopologyNode => {
    const existing = nodesByPath.get(setPath);
    if (existing) return existing;
    const node: SetTopologyNode = {
      set_path: setPath,
      parent_path: parentPath,
      child_set_paths: [],
      file_members: [],
      descendant_file_count: 0,
    };
    nodesByPath.set(setPath, node);
    return node;
  };
  ensureNode("", null);
  const membersByPath = new Map<string, CodeSetTierMemberInput>();
  for (const member of memberPaths) {
    const memberPath = member.components.join("/");
    membersByPath.set(memberPath, membersById.get(member.observation_id)!);
    let parent = ensureNode("", null);
    for (let i = 1; i < member.components.length; i += 1) {
      const dirPath = member.components.slice(0, i).join("/");
      const node = ensureNode(dirPath, parent.set_path === "" && i === 1 ? "" : member.components.slice(0, i - 1).join("/"));
      if (!parent.child_set_paths.includes(dirPath)) parent.child_set_paths.push(dirPath);
      parent = node;
    }
    parent.file_members.push({ observation_id: member.observation_id, member_path: memberPath });
  }
  const topology = [...nodesByPath.values()].sort((a, b) =>
    a.set_path < b.set_path ? -1 : a.set_path > b.set_path ? 1 : 0
  );
  for (const node of topology) {
    node.child_set_paths.sort();
    node.file_members.sort((a, b) => (a.member_path < b.member_path ? -1 : 1));
  }
  const descendantCount = (node: SetTopologyNode): number => {
    let count = node.file_members.length;
    for (const childPath of node.child_set_paths) {
      count += descendantCount(nodesByPath.get(childPath)!);
    }
    node.descendant_file_count = count;
    return count;
  };
  descendantCount(nodesByPath.get("")!);

  // Post-construction partition re-check (DD03 rules enforced by construction stay asserted —
  // checker code must fail loud, never absorb a wrong assumption).
  const grafted = topology.flatMap((node) => node.file_members.map((f) => f.observation_id)).sort();
  if (stableJson(grafted) !== stableJson(base.member_observation_ids)) {
    return failure("failed_structure", {
      structure_failure: {
        reason: "membership_bijection_violated",
        detail: `grafted file roots ${grafted.length} != candidate members ${base.member_observation_ids.length}`,
      },
    });
  }
  if (topology.length > CODE_SET_TIER_MAX_NODES) {
    return failure("skipped_capacity", {
      capacity_violation: {
        violated: "max_nodes",
        actual: topology.length,
        limit: CODE_SET_TIER_MAX_NODES,
      },
    });
  }
  const maxDirectChildren = Math.max(
    ...topology.map((node) => node.child_set_paths.length + node.file_members.length),
  );
  if (maxDirectChildren > CODE_SET_TIER_MAX_DIRECT_CHILDREN) {
    return failure("skipped_capacity", {
      capacity_violation: {
        violated: "max_direct_children",
        actual: maxDirectChildren,
        limit: CODE_SET_TIER_MAX_DIRECT_CHILDREN,
      },
    });
  }

  // Import relations (FD5): conservative resolver over the opt-in observed imports.
  const byExact = new Map<string, string>();
  const byStem = new Map<string, string[]>();
  for (const memberPath of membersByPath.keys()) {
    byExact.set(memberPath, memberPath);
    const stem = stemOf(memberPath);
    byStem.set(stem, [...(byStem.get(stem) ?? []), memberPath]);
  }
  const memberPathById = new Map(
    memberPaths.map((member) => [member.observation_id, member.components.join("/")]),
  );
  const membersWithoutImports: string[] = [];
  let importRecordCount = 0;
  const rows: ResolvedImportRow[] = [];
  for (const member of input.members) {
    const memberPath = memberPathById.get(member.observation_id)!;
    const imports = member.inventory.symbol_tiles.imports;
    if (imports === undefined) {
      membersWithoutImports.push(memberPath);
      continue;
    }
    importRecordCount += imports.length;
    const fromComponents = memberPath.split("/");
    for (const record of imports) {
      const { resolved, reason } = resolveOneImport({
        language: member.inventory.language,
        fromComponents,
        record,
        byExact,
        byStem,
      });
      rows.push({
        from: memberPath,
        to_specifier: record.to_specifier,
        resolved_in_set: resolved,
        reason,
      });
    }
  }
  if (importRecordCount > CODE_SET_TIER_MAX_IMPORT_RECORDS) {
    return failure("skipped_capacity", {
      capacity_violation: {
        violated: "max_import_records",
        actual: importRecordCount,
        limit: CODE_SET_TIER_MAX_IMPORT_RECORDS,
      },
    });
  }
  // Dedupe on (from, to_specifier, resolved_in_set), canonical sort, deterministic relation ids.
  const dedupe = new Map<string, ResolvedImportRow>();
  for (const row of rows) {
    const key = stableJson([row.from, row.to_specifier, row.resolved_in_set]);
    if (!dedupe.has(key)) dedupe.set(key, row);
  }
  const uniqueRows = [...dedupe.values()].sort((a, b) => {
    const ka = `${a.from} ${a.to_specifier} ${a.resolved_in_set ?? ""}`;
    const kb = `${b.from} ${b.to_specifier} ${b.resolved_in_set ?? ""}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  if (uniqueRows.length > CODE_SET_TIER_MAX_RELATIONS_TOTAL) {
    return failure("skipped_capacity", {
      capacity_violation: {
        violated: "max_relations_total",
        actual: uniqueRows.length,
        limit: CODE_SET_TIER_MAX_RELATIONS_TOTAL,
      },
    });
  }
  const relations: SetImportRelation[] = uniqueRows.map((row) => ({
    relation_id: `rel:${sha256Text(stableJson([row.from, row.to_specifier, row.resolved_in_set])).slice(0, 16)}`,
    from: row.from,
    to_specifier: row.to_specifier,
    resolved_in_set: row.resolved_in_set,
  }));
  const resolutionCensus: SetRelationResolutionCensusRow[] = relations.map((relation, index) => ({
    relation_id: relation.relation_id,
    reason: uniqueRows[index]!.reason,
  }));
  const reasons: Partial<Record<SetImportResolutionReason, number>> = {};
  for (const row of resolutionCensus) {
    reasons[row.reason] = (reasons[row.reason] ?? 0) + 1;
  }
  const relationCensus: SetRelationCensus = {
    total: relations.length,
    resolved: relations.filter((relation) => relation.resolved_in_set !== null).length,
    unresolved: relations.filter((relation) => relation.resolved_in_set === null).length,
    reasons,
    members_without_import_inventory: membersWithoutImports.sort(),
  };

  const resolutionByRelationId = new Map(
    resolutionCensus.map((row) => [row.relation_id, row.reason]),
  );
  const overview = renderOverview({
    topology,
    membersByPath,
    relations,
    resolutionByRelationId,
    charBudget: CODE_SET_TIER_OVERVIEW_CHAR_BUDGET,
  });

  return {
    ...base,
    status: "complete",
    set_tier_aggregate_fingerprint: fingerprintOf({
      members: input.members,
      topology,
      relations,
      caps,
    }),
    topology,
    relations,
    relation_resolution_census: resolutionCensus,
    relation_census: relationCensus,
    capacity_violation: null,
    structure_failure: null,
    overview_render: overview,
  };
}

/** LCA owner of a relation (FD6) — exported for the G5 gate. Resolved: lowest common set node
 *  of both endpoints' directories; unresolved: the from-file's own directory node. */
export function relationOwnerSetPath(relation: SetImportRelation): string {
  const fromDir = relation.from.split("/").slice(0, -1);
  if (relation.resolved_in_set === null) return fromDir.join("/");
  const toDir = relation.resolved_in_set.split("/").slice(0, -1);
  return fromDir.slice(0, commonPrefixLength(fromDir, toDir)).join("/");
}

// ── fingerprint (FD13 — deterministic-realization pre-image; ON-only, separate field) ─────────
function fingerprintOf(args: {
  members: readonly CodeSetTierMemberInput[];
  topology: readonly SetTopologyNode[];
  relations: readonly SetImportRelation[];
  caps: Record<string, number>;
}): string {
  return sha256Text(stableJson({
    schema_version: CODE_SET_TIER_SCHEMA_VERSION,
    realization: CODE_SET_TIER_REALIZATION,
    resolver_version: CODE_SET_TIER_RESOLVER_VERSION,
    member_observation_fingerprints: args.members
      .map((member) => ({
        observation_id: member.observation_id,
        content_sha256: member.inventory.content_sha256,
        extractor_logic_sha256: member.inventory.extractor_logic_sha256,
      }))
      .sort((a, b) => (a.observation_id < b.observation_id ? -1 : 1)),
    observed_imports: args.members
      .map((member) => ({
        observation_id: member.observation_id,
        imports: (member.inventory.symbol_tiles.imports ?? []).map((record) => record.to_specifier),
      }))
      .sort((a, b) => (a.observation_id < b.observation_id ? -1 : 1)),
    topology: args.topology.map((node) => ({
      set_path: node.set_path,
      parent_path: node.parent_path,
      files: node.file_members.map((file) => file.member_path),
    })),
    relations: args.relations.map((relation) => ({
      from: relation.from,
      to_specifier: relation.to_specifier,
      resolved_in_set: relation.resolved_in_set,
    })),
    caps: args.caps,
    prompt_contract_digest: codeSetAuthoringPromptContractSha256(),
    opt_in: { semantic_map_code_set_tier: true },
  }));
}
