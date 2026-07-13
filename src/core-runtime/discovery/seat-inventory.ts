/**
 * Read-only LLM seat inventory — a human-facing projection of every model seat
 * the runtime can dispatch, with its resolved (provider, model, effort), the
 * required role, and where the value comes from (own block vs inherited actor
 * vs an unset named dispatch).
 *
 * This is a PROJECTION, not an authority: it changes no schema, gate, or
 * dispatch behaviour. It reuses the gate's own resolver
 * ({@link collectEffectiveModelRoutes}) as the spine so the provider/model/role
 * it reports match exactly what G7 validates and the runtime dispatches — the
 * inventory can never claim a seat the gate does not see. It then enriches each
 * route with the effort knob (which the gate resolver drops) and a provenance
 * label, and appends the named non-settings dispatches that have no settings
 * path so an operator sees the full seat surface, including the ones that are
 * currently unset and fall back to the runtime default.
 *
 * Scope: the inventory lists every seat the gate resolver sees — the configured
 * model routes plus the named non-settings dispatches. A review unit with NO
 * llm block of its own is not a distinct route; it runs as its default actor,
 * so it appears via that actor's row rather than a separate line. A partial
 * (provider-only) unit override does produce its own row, labelled `inherited`.
 */
import {
  collectEffectiveModelRoutes,
  type OntoSettings,
  type ReviewExecutionUnitId,
} from "./settings-chain.js";
import {
  RECONSTRUCT_DISPATCH_FALLBACK_LLM_ROUTE_PATH,
  requiredSupportedModelRoleForDispatch,
  type SupportedModelRole,
} from "./supported-models.js";
import { REVIEW_EXECUTION_UNIT_IDS } from "./review-execution-units.js";
import { reviewExecutionUnitActor } from "../review/review-execution-profile.js";

/** How a seat's resolved value was obtained. */
export type SeatProvenance =
  /** The seat's own llm block sets the model. */
  | "explicit"
  /** A review unit with no own model, inheriting its default actor's llm. */
  | "inherited"
  /** No settings block resolves the model — the runtime falls back to its
   * default at dispatch (or the seat is dormant / a named dispatch with no
   * settings path). */
  | "unset";

export interface SeatInventoryRow {
  /** Settings path (e.g. `review.execution.units.lens.llm`) or a
   * `(dispatch) <kind>` label for a named non-settings dispatch. */
  path: string;
  /** Certification role the seat's dispatch requires (gate authority). */
  role: SupportedModelRole;
  provider: string | undefined;
  model: string | undefined;
  effort: string | undefined;
  provenance: SeatProvenance;
  /** When provenance is `inherited`, the actor path the value came from. */
  inheritedFrom?: string;
}

interface RawLlmFields {
  provider?: string;
  model?: string;
  effort?: string;
}

/** Walk settings once, recording the raw (provider, model, effort) of every
 * llm block by its path — the same path shape {@link collectModelSelections}
 * emits, so a route path indexes straight into this map (dispatch-fallback
 * split paths are handled by the caller stripping the `#kind` suffix). */
function collectRawLlmByPath(settings: unknown): Map<string, RawLlmFields> {
  const out = new Map<string, RawLlmFields>();
  const visit = (value: unknown, trail: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${trail}[${index}]`));
      return;
    }
    if (value === null || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const hasLlmField =
      typeof record.model === "string" ||
      typeof record.provider === "string" ||
      typeof record.effort === "string";
    if (hasLlmField) {
      out.set(trail || "(root)", {
        ...(typeof record.provider === "string" ? { provider: record.provider } : {}),
        ...(typeof record.model === "string" ? { model: record.model } : {}),
        ...(typeof record.effort === "string" ? { effort: record.effort } : {}),
      });
    }
    for (const [key, child] of Object.entries(record)) {
      visit(child, trail ? `${trail}.${key}` : key);
    }
  };
  visit(settings, "");
  return out;
}

const REVIEW_UNIT_LLM_PATH = /^review\.execution\.units\.([^.[]+)\.llm$/;

/** The two actor path forms {@link collectEffectiveModelRoutes} accepts, in the
 * same precedence (nested `actors.<a>` first, then legacy `<a>`). Returns the
 * one present in the raw map, else the nested form. */
function actorLlmPath(
  actor: string,
  rawByPath: ReadonlyMap<string, RawLlmFields>,
): string {
  const nested = `review.execution.actors.${actor}.llm`;
  const legacy = `review.execution.${actor}.llm`;
  return rawByPath.has(nested) || !rawByPath.has(legacy) ? nested : legacy;
}

function reviewUnitIdOf(path: string): ReviewExecutionUnitId | undefined {
  const match = REVIEW_UNIT_LLM_PATH.exec(path);
  if (!match) return undefined;
  const id = match[1] as ReviewExecutionUnitId;
  return REVIEW_EXECUTION_UNIT_IDS.includes(id) ? id : undefined;
}

/** Build the seat inventory from resolved settings. Pure — no I/O. */
export function collectSeatInventory(settings: OntoSettings): SeatInventoryRow[] {
  const routes = collectEffectiveModelRoutes(settings);
  const rawByPath = collectRawLlmByPath(settings);

  const rows: SeatInventoryRow[] = routes.map((route) => {
    const unitId = reviewUnitIdOf(route.path);
    if (unitId) {
      const own = rawByPath.get(route.path);
      const actor = reviewExecutionUnitActor(unitId);
      const actorPath = actorLlmPath(actor, rawByPath);
      const actorRaw = rawByPath.get(actorPath);
      const effort = own?.effort ?? actorRaw?.effort;
      const ownModel = own?.model !== undefined;
      const provenance: SeatProvenance = ownModel
        ? "explicit"
        : route.model !== undefined
          ? "inherited"
          : "unset";
      return {
        path: route.path,
        role: route.requiredRole,
        provider: route.provider,
        model: route.model,
        effort,
        provenance,
        ...(provenance === "inherited" ? { inheritedFrom: actorPath } : {}),
      };
    }
    // Base seat (actors, reconstruct actors) or a dispatch-fallback split path.
    const rawPath = route.path.includes("#")
      ? route.path.slice(0, route.path.indexOf("#"))
      : route.path;
    const raw = rawByPath.get(rawPath);
    return {
      path: route.path,
      role: route.requiredRole,
      provider: route.provider,
      model: route.model,
      effort: raw?.effort,
      provenance: route.model !== undefined ? "explicit" : "unset",
    };
  });

  // Named non-settings dispatches with no settings path: surface them so the
  // full seat surface is visible even when unset (they fall back to the runtime
  // default at dispatch). The dispatch-fallback pair already appears above when
  // its llm block is present; only append what the settings walk cannot reach.
  const seenPaths = new Set(rows.map((row) => row.path));
  const fallbackSet =
    rawByPath.has(RECONSTRUCT_DISPATCH_FALLBACK_LLM_ROUTE_PATH);
  const namedDispatches: Array<{ path: string; role: SupportedModelRole }> = [
    {
      path: "(dispatch) request_judge",
      role: requiredSupportedModelRoleForDispatch({ kind: "request_judge" }),
    },
    ...(fallbackSet
      ? []
      : [
          {
            path: "(dispatch) semantic_map_verify",
            role: requiredSupportedModelRoleForDispatch({
              kind: "semantic_map_verify",
            }),
          },
        ]),
  ];
  for (const dispatch of namedDispatches) {
    if (seenPaths.has(dispatch.path)) continue;
    rows.push({
      path: dispatch.path,
      role: dispatch.role,
      provider: undefined,
      model: undefined,
      effort: undefined,
      provenance: "unset",
    });
  }

  return rows;
}

/** Render the inventory as an aligned text table for the CLI. */
export function renderSeatInventoryTable(rows: readonly SeatInventoryRow[]): string {
  const header = ["ROLE", "PROVIDER/MODEL", "EFFORT", "SOURCE", "SEAT"];
  const body = rows.map((row) => [
    row.role,
    row.model ? `${row.provider ?? "?"}/${row.model}` : "(unset → runtime default)",
    row.effort ?? "-",
    row.provenance === "inherited" && row.inheritedFrom
      ? `inherited (${row.inheritedFrom})`
      : row.provenance,
    row.path,
  ]);
  const widths = header.map((_, col) =>
    Math.max(header[col]!.length, ...body.map((cells) => cells[col]!.length)),
  );
  const line = (cells: string[]): string =>
    cells.map((cell, col) => cell.padEnd(widths[col]!)).join("  ").trimEnd();
  return [line(header), ...body.map(line)].join("\n");
}
