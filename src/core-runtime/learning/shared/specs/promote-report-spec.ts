/**
 * PromoteReport spec — DD-20 + SYN-U1.
 *
 * Phase A output, persisted as JSON. Snapshot of all collection/audit/panel
 * data needed for Phase B to apply user decisions.
 *
 * SYN-U1: schema_version bumped from "1" → "2" when CrossAgentDedupCluster
 * gained the required `primary_member_index` field. Reports produced before
 * the bump (no primary_member_index OR a schema_version="1" header) are
 * refused at load time with a clear regenerate-via-Phase-A message.
 *
 * The nested validation also traverses cross_agent_dedup_clusters to verify
 * primary_member_index is present and structurally sound, so a schema v2
 * report with a malformed cluster entry fails loudly rather than silently
 * falling through to the apply-time structural guard.
 */

import {
  IncompatibleVersionError,
  type ArtifactSpec,
  type ValidationResult,
} from "../artifact-registry.js";
import type { PromoteReport } from "../../promote/types.js";
import {
  parseRaw,
  serializeRaw,
  rejectPreV7,
  checkSchemaVersion,
  checkString,
  checkArray,
} from "./spec-helpers.js";

const KIND = "promote_report";
const CURRENT_VERSION = "2";
const SUPPORTED: readonly string[] = ["2"];

export const PromoteReportSpec: ArtifactSpec<PromoteReport> = {
  kind: KIND,
  current_schema_version: CURRENT_VERSION,
  supported_schema_versions: SUPPORTED,
  supported_formats: ["json"],

  parse(content, format) {
    const raw = parseRaw(content, format);
    // 4-C1 fix: schema_version="1" reports from before the index-based
    // primary_member bump get a dedicated migration message naming the
    // specific action operator needs to take. rejectPreV7 handles the
    // no-schema_version and wrong-version cases with a generic message;
    // this explicit branch runs FIRST so the v1→v2 path is operator-legible.
    if (
      typeof raw === "object" &&
      raw !== null &&
      (raw as { schema_version?: unknown }).schema_version === "1"
    ) {
      throw new IncompatibleVersionError(
        `${KIND}: legacy schema_version="1" detected. ` +
          `This report was generated before the index-based primary_member identity ` +
          `bump (v1→v2). The new Phase B apply path requires ` +
          `cross_agent_dedup_clusters[].primary_member_index which the legacy format ` +
          `does not carry. ` +
          `Action: discard the legacy report, regenerate a new report, then re-run apply on the fresh session.`,
      );
    }
    return rejectPreV7<PromoteReport>(raw, KIND, SUPPORTED);
  },

  serialize(data, format) {
    return serializeRaw(data, format);
  },

  validate(data): ValidationResult {
    const errors: string[] = [];
    if (typeof data !== "object" || data === null) {
      return { valid: false, errors: ["data is not an object"] };
    }
    const obj = data as Record<string, unknown>;
    checkSchemaVersion(obj, CURRENT_VERSION, errors);
    checkString(obj, "session_id", errors);
    checkString(obj, "generated_at", errors);
    checkString(obj, "mode", errors);
    if (obj.collection === undefined || obj.collection === null) {
      errors.push("collection must be present");
    }
    checkArray(obj, "pre_analysis", errors);
    checkArray(obj, "panel_verdicts", errors);
    checkArray(obj, "cross_agent_dedup_clusters", errors);
    if (obj.audit_summary === undefined || obj.audit_summary === null) {
      errors.push("audit_summary must be present");
    }
    checkArray(obj, "retirement_candidates", errors);
    checkArray(obj, "conflict_proposals", errors);
    checkArray(obj, "domain_doc_candidates", errors);
    if (obj.health_snapshot === undefined || obj.health_snapshot === null) {
      errors.push("health_snapshot must be present");
    }
    checkArray(obj, "degraded_states", errors);
    checkArray(obj, "warnings", errors);

    // SYN-U1: nested validation for cross_agent_dedup_clusters. Each cluster
    // MUST carry primary_member_index as an integer within member_items
    // bounds. Reports from the schema-v1 era (or mid-migration reports that
    // forgot to populate the field) are rejected here instead of at apply
    // time where the failure is harder to triage.
    if (Array.isArray(obj.cross_agent_dedup_clusters)) {
      obj.cross_agent_dedup_clusters.forEach((raw, i) => {
        if (typeof raw !== "object" || raw === null) {
          errors.push(`cross_agent_dedup_clusters[${i}] is not an object`);
          return;
        }
        const c = raw as Record<string, unknown>;
        if (typeof c.cluster_id !== "string") {
          errors.push(`cross_agent_dedup_clusters[${i}].cluster_id must be a string`);
        }
        if (typeof c.primary_owner_agent !== "string") {
          errors.push(
            `cross_agent_dedup_clusters[${i}].primary_owner_agent must be a string`,
          );
        }
        if (
          typeof c.primary_member_index !== "number" ||
          !Number.isInteger(c.primary_member_index) ||
          c.primary_member_index < 0
        ) {
          errors.push(
            `cross_agent_dedup_clusters[${i}].primary_member_index must be a non-negative integer ` +
              `(schema v2 required; regenerate Phase A if the report predates the bump)`,
          );
        }
        if (!Array.isArray(c.member_items)) {
          errors.push(
            `cross_agent_dedup_clusters[${i}].member_items must be an array`,
          );
          return;
        }
        if (
          typeof c.primary_member_index === "number" &&
          c.primary_member_index >= c.member_items.length
        ) {
          errors.push(
            `cross_agent_dedup_clusters[${i}].primary_member_index (${c.primary_member_index}) ` +
              `out of member_items bounds (length=${c.member_items.length})`,
          );
        }
      });
    }
    return { valid: errors.length === 0, errors };
  },
};
