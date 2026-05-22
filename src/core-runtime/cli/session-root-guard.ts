/**
 * Session Root Guard — DD-8 (Step 11a).
 *
 * Design authority:
 *   - learn-phase3-design-v9.md DD-8 (.layout-version.yaml + runtime gate)
 *   - learn-phase3-design-v5.md DD-8 (UF-SYN-05/06 — marker rename + version gate)
 *   - learn-phase3-design-v4.md DD-8 (case taxonomy: new user / legacy / mixed)
 *
 * Responsibility:
 *   - Inspect `<projectRoot>/.onto/.layout-version.yaml` and decide whether
 *     the session layout is ready for Phase 3 commands (promote /
 *     reclassify-insights / migrate-session-roots).
 *   - Detect legacy session directories that match the pre-v3 pattern
 *     (`.onto/sessions/{id}/` directly, no `review/` subdir).
 *   - Surface 4 cases with deterministic actions:
 *       1. New user (no marker, no legacy)        → write marker, allow
 *       2. Legacy + no marker                     → MigrationRequiredError
 *       3. Marker present + legacy still exists   → warn but allow (operator
 *                                                    should re-run migration)
 *       4. Marker present + no legacy             → allow
 *   - Reject the marker when its layout_version doesn't match SUPPORTED.
 *
 * Modes:
 *   - "enforce" (default): write marker on first run, throw on legacy.
 *   - "inspect": pure read, no I/O writes, no throw. Used by diagnostics
 *     that should not trigger migration as a side effect.
 *
 * Why a separate module:
 *   - Phase 3 commands (promote, reclassify-insights) call this from src/cli.ts
 *     before doing anything else, so the gate is the first thing they hit.
 *   - The migrate-session-roots command also uses inspectMigrationStatus()
 *     to compute what would be migrated.
 */

import fs from "node:fs";
import path from "node:path";

import { REGISTRY } from "../learning/shared/artifact-registry.js";
import type { LayoutVersion } from "../learning/promote/types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SUPPORTED_LAYOUT_VERSION = "v3";
export const LAYOUT_MARKER_FILENAME = ".layout-version.yaml";

const KNOWN_SESSION_SUBDIRS = ["review", "promote", "reclassify-insights"];
/** Legacy session id pattern: YYYYMMDD-{6+ hex}. */
const LEGACY_SESSION_PATTERN = /^\d{8}-[a-f0-9]{6,}$/;

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

export function getLayoutMarkerPath(projectRoot: string): string {
  return path.join(projectRoot, ".onto", LAYOUT_MARKER_FILENAME);
}

export function getSessionsDir(projectRoot: string): string {
  return path.join(projectRoot, ".onto", "sessions");
}

// ---------------------------------------------------------------------------
// Inspection
// ---------------------------------------------------------------------------

export interface MigrationStatus {
  marker_present: boolean;
  marker_path: string;
  marker_compatible: boolean;
  marker_layout_version: string | null;
  legacy_session_count: number;
  legacy_session_ids: string[];
}

/**
 * Pure read of layout marker + legacy directory enumeration.
 *
 * Performs no I/O writes and never throws on missing files. The caller
 * decides what to do with the resulting status.
 */
export function inspectMigrationStatus(projectRoot: string): MigrationStatus {
  const markerPath = getLayoutMarkerPath(projectRoot);
  const status: MigrationStatus = {
    marker_present: false,
    marker_path: markerPath,
    marker_compatible: false,
    marker_layout_version: null,
    legacy_session_count: 0,
    legacy_session_ids: [],
  };

  if (fs.existsSync(markerPath)) {
    status.marker_present = true;
    try {
      const marker = REGISTRY.loadFromFile<LayoutVersion>(
        "layout_version",
        markerPath,
      );
      status.marker_layout_version = marker.layout_version;
      status.marker_compatible = marker.layout_version === SUPPORTED_LAYOUT_VERSION;
    } catch {
      // Marker file exists but is malformed. Treat as incompatible.
      status.marker_compatible = false;
    }
  }

  const sessionsDir = getSessionsDir(projectRoot);
  if (fs.existsSync(sessionsDir)) {
    const entries = fs.readdirSync(sessionsDir, { withFileTypes: true });
    const legacy = entries.filter(
      (e) =>
        e.isDirectory() &&
        !KNOWN_SESSION_SUBDIRS.includes(e.name) &&
        LEGACY_SESSION_PATTERN.test(e.name),
    );
    status.legacy_session_count = legacy.length;
    status.legacy_session_ids = legacy.map((e) => e.name).sort();
  }

  return status;
}

// ---------------------------------------------------------------------------
// Marker writer
// ---------------------------------------------------------------------------

export function writeLayoutMarker(projectRoot: string): void {
  const markerPath = getLayoutMarkerPath(projectRoot);
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  const marker: LayoutVersion = {
    schema_version: "1",
    layout_version: SUPPORTED_LAYOUT_VERSION,
    written_at: new Date().toISOString(),
  };
  REGISTRY.saveToFile("layout_version", markerPath, marker);
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class MigrationRequiredError extends Error {
  constructor(
    message: string,
    public readonly status: MigrationStatus,
  ) {
    super(message);
    this.name = "MigrationRequiredError";
  }
}

export class IncompatibleLayoutError extends Error {
  constructor(
    message: string,
    public readonly status: MigrationStatus,
  ) {
    super(message);
    this.name = "IncompatibleLayoutError";
  }
}

// ---------------------------------------------------------------------------
// Guard entry point
// ---------------------------------------------------------------------------

export type SessionRootGuardMode = "enforce" | "inspect";

/**
 * Phase 3 command entry guard. Call from src/cli.ts BEFORE any promote /
 * reclassify-insights / promote --apply / migrate-session-roots subcommand.
 *
 * Returns the inspected status so callers can log or branch on it.
 *
 * Throws:
 *   - `MigrationRequiredError` when legacy sessions exist without a marker
 *     (case 2). The operator must run `onto migrate-session-roots`.
 *   - `IncompatibleLayoutError` when the marker exists but its
 *     layout_version is not the supported one (forward-compat guard).
 */
export function ensureSessionRootsMigrated(
  projectRoot: string,
  mode: SessionRootGuardMode = "enforce",
): MigrationStatus {
  const status = inspectMigrationStatus(projectRoot);

  if (mode === "inspect") return status;

  // Case 1: new user — write marker and allow.
  if (!status.marker_present && status.legacy_session_count === 0) {
    writeLayoutMarker(projectRoot);
    return inspectMigrationStatus(projectRoot);
  }

  // Case 2: legacy + no marker — hard fail.
  if (!status.marker_present && status.legacy_session_count > 0) {
    const sample = status.legacy_session_ids.slice(0, 5).join(", ");
    const more =
      status.legacy_session_count > 5
        ? ` ... and ${status.legacy_session_count - 5} more`
        : "";
    throw new MigrationRequiredError(
      `Legacy session roots detected (${status.legacy_session_count} session(s)). ` +
        `Run 'onto migrate-session-roots' before continuing.\n` +
        `Affected: ${sample}${more}`,
      status,
    );
  }

  // Case 3: marker present + legacy still exists — warn (re-run migration).
  if (status.marker_present && status.legacy_session_count > 0) {
    process.stderr.write(
      `[onto] warning: ${status.legacy_session_count} legacy session(s) found ` +
        `despite layout marker. Re-run 'onto migrate-session-roots' to clean up.\n`,
    );
  }

  // Case 4: marker present + no legacy → check version compat.
  if (status.marker_present && !status.marker_compatible) {
    throw new IncompatibleLayoutError(
      `Layout marker version "${status.marker_layout_version}" is not ` +
        `supported (expected "${SUPPORTED_LAYOUT_VERSION}"). ` +
        `Upgrade Phase 3 tooling or restore a compatible marker.`,
      status,
    );
  }

  return status;
}
