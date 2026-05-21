/**
 * Archived 2026-05-21.
 *
 * This file was removed from runtime so current review execution does not
 * normalize retired review mode values. Current runtime now fails when a
 * persisted artifact contains an unsupported review_mode.
 */

import type { ReviewMode } from "../../../src/core-runtime/review/artifact-types.js";

export const LEGACY_REVIEW_MODE_MAP: Readonly<Record<string, ReviewMode>> = {
  light: "core-axis",
};

export function isLegacyReviewMode(value: string): boolean {
  return Object.prototype.hasOwnProperty.call(LEGACY_REVIEW_MODE_MAP, value);
}

export function getLegacyReplacement(value: string): ReviewMode | null {
  return LEGACY_REVIEW_MODE_MAP[value] ?? null;
}

export function formatLegacyMigrationError(flag: string, legacyValue: string): string {
  const replacement = getLegacyReplacement(legacyValue);
  if (replacement === null) {
    return `Invalid ${flag}: ${legacyValue}`;
  }
  return (
    `\`${flag} ${legacyValue}\` was renamed to ` +
    `\`${flag} ${replacement}\` in v0.2.0 (PR #127). ` +
    `See CHANGELOG.md for migration.`
  );
}

export function normalizeLegacyReviewMode(value: string): string {
  return LEGACY_REVIEW_MODE_MAP[value] ?? value;
}
