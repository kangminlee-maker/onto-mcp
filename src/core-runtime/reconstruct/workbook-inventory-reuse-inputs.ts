/**
 * The workbook-inventory fields that must rotate a source-observation reuse digest.
 *
 * A spreadsheet observation's `content_sha256` covers the raw bytes and nothing else, so the same
 * file re-observed under a bumped adapter schema, re-calibrated value-tile opts, or different
 * data-layer caps produces DIFFERENT inventory content under an IDENTICAL byte hash. Each reader
 * here pulls one such field out of `structural_data.workbook_inventory` so
 * `sourceObservationsReuseSha256` folds it in and a stale seed cannot be silently reused
 * (P1-C1 §12 T1). Every one of them tolerates a missing/malformed payload by returning null —
 * non-spreadsheet observations carry no inventory at all.
 */

/** The spreadsheet observer's `adapter_version` nested under `structural_data.workbook_inventory`,
 *  or null when the observation carries no inventory (a non-spreadsheet observation, or an array/
 *  malformed payload). Folded into the reuse digest so a schema bump invalidates stale reuse. */
export function workbookInventoryAdapterVersion(inventory: unknown): number | null {
  if (inventory === null || typeof inventory !== "object" || Array.isArray(inventory)) {
    return null;
  }
  const version = (inventory as { adapter_version?: unknown }).adapter_version;
  return typeof version === "number" ? version : null;
}

/** The value-tile opts (window + caps) nested under `structural_data.workbook_inventory`, or null.
 *  Folded into the reuse digest so re-calibrating opts (e.g. window 1024→512) — which changes segment
 *  boundaries in the inventory CONTENT but not content_sha256 (raw bytes) or adapter_version (schema
 *  shape) — still rotates the reuse hash (P1-C1 §12 T1; tautological: edit opts → digest changes). */
export function workbookInventoryValueTileConfig(inventory: unknown): unknown {
  if (inventory === null || typeof inventory !== "object" || Array.isArray(inventory)) {
    return null;
  }
  return (inventory as { value_tile_config?: unknown }).value_tile_config ?? null;
}

/** The data-layer caps nested under `structural_data.workbook_inventory`, or null. Folded into the
 *  reuse digest because the caps shape the inventory content (profiled columns, scanned rows, segment
 *  count) yet are invisible to content_sha256/adapter_version, so observing the SAME file under
 *  different caps must not silently reuse a seed authored under the old caps (P1-C1 §12 T1). */
export function workbookInventoryDataLayerCaps(inventory: unknown): unknown {
  if (inventory === null || typeof inventory !== "object" || Array.isArray(inventory)) {
    return null;
  }
  return (inventory as { data_layer_caps?: unknown }).data_layer_caps ?? null;
}
