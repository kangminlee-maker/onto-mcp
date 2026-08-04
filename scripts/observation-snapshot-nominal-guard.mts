/**
 * COMPILE-TIME guard: an `ObservationSnapshot` must be unforgeable by a hand-written object literal.
 *
 * Why this is a script and not a test. The observation-read gate lives in the snapshot CONSTRUCTOR
 * (`fixObservationSnapshot(text, ledger)`, design §3.1), which only constrains anything if the constructor
 * is the sole source of the type — cross-family review passed
 * `{ entries: [], lookup: () => withheldEntry }` straight to `readObservationPage` and got a withheld
 * observation's body back, with no cast and no constructor. The fix is a module-private brand, and a brand
 * is a TYPE-LEVEL property: vitest transpiles without typechecking, so a test can never detect its removal.
 * Worse, `tsconfig.json` excludes `src/**\/*.test.ts`, so a `@ts-expect-error` written in a test file is not
 * checked by anything at all — measured: deleting the brand left `check:ts-core` green with exactly that
 * test in place.
 *
 * `tsconfig.scripts.json` typechecks the files it lists (its own header explains the same class of gap), so
 * this file — listed there — makes `npm run check:ts-scripts` the gate. Verified in both directions: with
 * the brand the gate is clean; delete `readonly [OBSERVATION_SNAPSHOT_BRAND]` from the interface and the
 * directive below has nothing to suppress, which is itself an error (TS2578) and fails the gate.
 *
 * Nothing here executes. It exists to be typechecked.
 */
import type { ObservationSnapshot } from "../src/core-runtime/reconstruct/observation-read.ts";

const forgedSnapshotShape = {
  session_id: "session",
  snapshot_digest: "f".repeat(64),
  entries: [],
  withheld_observation_count: 0,
  lookup: (): undefined => undefined,
};

// @ts-expect-error — an ObservationSnapshot is nominal; only fixObservationSnapshot can mint one.
export const forgedSnapshot: ObservationSnapshot = forgedSnapshotShape;
