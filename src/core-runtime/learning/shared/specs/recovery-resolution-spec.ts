/**
 * RecoveryResolution spec — DD-23 (NEW in v9).
 *
 * Persisted YAML at {projectRoot}/.onto/sessions/promote/{session-id}/recovery-resolution.yaml.
 *
 * Canonical operator-decision seat for cross-attempt manual escalation. When
 * resolveRecoveryTruth() detects multiple attempt_ids, it surfaces a
 * manual_escalation_required result. The operator records their selection in
 * this artifact. Subsequent resume runs read it first.
 */

import type { ArtifactSpec, ValidationResult } from "../artifact-registry.js";
import type { RecoveryResolution } from "../../promote/types.js";
import {
  parseRaw,
  serializeRaw,
  rejectPreV7,
  checkSchemaVersion,
  checkString,
  checkArray,
} from "./spec-helpers.js";

const KIND = "recovery_resolution";
const CURRENT_VERSION = "1";
const SUPPORTED: readonly string[] = ["1"];

export const RecoveryResolutionSpec: ArtifactSpec<RecoveryResolution> = {
  kind: KIND,
  current_schema_version: CURRENT_VERSION,
  supported_schema_versions: SUPPORTED,
  supported_formats: ["yaml"],

  parse(content, format) {
    const raw = parseRaw(content, format);
    return rejectPreV7<RecoveryResolution>(raw, KIND, SUPPORTED);
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
    checkString(obj, "resolved_at", errors);
    checkString(obj, "resolved_by", errors);
    checkString(obj, "resolution_method", errors);
    checkString(obj, "selected_attempt_id", errors);
    checkString(obj, "selected_attempt_reason", errors);
    checkArray(obj, "all_attempts_at_resolution_time", errors);
    // NQ-21: append-only history. Must be non-empty when artifact exists.
    checkArray(obj, "resolution_history", errors);
    if (Array.isArray(obj.resolution_history) && obj.resolution_history.length === 0) {
      errors.push("resolution_history cannot be empty");
    }
    return { valid: errors.length === 0, errors };
  },
};
