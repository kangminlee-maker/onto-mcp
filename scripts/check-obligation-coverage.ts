/**
 * G10 — obligation-coverage ratchet (INV-OBLIGATION-COVERAGE-1).
 *
 * Every ACTIVE reconstruct `validation_obligation` — keyed on `(validator_id, obligation_id)`,
 * flat ∪ conditional per validator_record (planned_validator_records are out of scope: the loader
 * drops them) — must be EITHER dynamically proven WIRED (a checked-in `recorded` pair, freshness-
 * guarded by obligation-coverage-harvest.test.ts) OR explicitly parked in the pending ledger. A new
 * active obligation that is neither recorded nor parked is a build error; the parked (legacy)
 * pending set may only NON-INCREASE vs origin/main.
 *
 * Pure clauses (a-c) are G9-shaped. The ratchet (d) is git-impure (check-invariant-change-marker-
 * shaped): it materializes the base registry + base recorded-set via `git show <mergeBase>:<file>`
 * and re-loads/parses them, so legacy-pending growth, a recorded→pending downgrade, or re-parking a
 * currently-recorded pair fail CI; base-unavailable FAILS LOUD. The ratchet decision is extracted
 * into the pure `evaluateRatchet` so it is unit-testable without real git.
 *
 * 사용: npx tsx scripts/check-obligation-coverage.ts [baseRef]   (baseRef default origin/main)
 * npm: `check:obligation-coverage`.
 */
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parse as parseYaml } from "yaml";

import {
  loadReconstructContractRegistry,
  type ReconstructContractRegistry,
} from "../src/core-runtime/reconstruct/contract-registry.js";

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const REGISTRY_REF =
  ".onto/processes/reconstruct/reconstruct-contract-registry.yaml";
const RECORDED_REF =
  ".onto/processes/reconstruct/obligation-coverage-recorded.yaml";
const LEDGER_REF = ".onto/processes/reconstruct/obligation-coverage-ledger.yaml";

const ALLOWED_TIERS = new Set([
  "flat",
  "activation_gated_dormant",
  "enforced_pending_instrumentation",
]);

export interface ObligationPair {
  validator_id: string;
  obligation_id: string;
}

export interface LedgerRow extends ObligationPair {
  coverage_status: string;
  tier: string;
}

export interface ObligationCoverageInputs {
  /** Every ACTIVE (validator_id, obligation_id) pair, flat ∪ conditional. */
  activePairs: ObligationPair[];
  recorded: ObligationPair[];
  ledger: LedgerRow[];
}

/** A stable string key for a pair (the SSOT keying for the whole gate). */
export function pairKey(p: ObligationPair): string {
  return `${p.validator_id}::${p.obligation_id}`;
}

/** Enumerate the active pairs from a loaded registry: flat ∪ conditional per validator_record. */
export function activePairsFromRegistry(
  registry: ReconstructContractRegistry,
): ObligationPair[] {
  const seen = new Set<string>();
  const pairs: ObligationPair[] = [];
  for (const rec of registry.validator_records) {
    const obligations = [
      ...(rec.validation_obligations ?? []),
      ...(rec.conditional_validation_obligations ?? []).map((c) => c.obligation_id),
    ];
    for (const obligation_id of obligations) {
      const p = { validator_id: rec.validator_id, obligation_id };
      const k = pairKey(p);
      if (!seen.has(k)) {
        seen.add(k);
        pairs.push(p);
      }
    }
  }
  return pairs;
}

/** Pure clauses (a) completeness, (b) ledger honesty, (c) reverse-validation. */
export function evaluateObligationCoverage(
  inputs: ObligationCoverageInputs,
): string[] {
  const errors: string[] = [];
  const activeKeys = new Set(inputs.activePairs.map(pairKey));
  const recordedKeys = new Set(inputs.recorded.map(pairKey));
  const ledgerKeys = new Set(inputs.ledger.map(pairKey));

  // (a) completeness: every active pair is recorded OR parked.
  for (const p of inputs.activePairs) {
    const k = pairKey(p);
    if (!recordedKeys.has(k) && !ledgerKeys.has(k)) {
      errors.push(
        `active obligation neither recorded nor parked: ${k}`,
      );
    }
  }

  // (b) ledger honesty: every ledger row resolves to a CURRENT active obligation, carries a
  // valid tier, and is not also recorded.
  const ledgerSeen = new Set<string>();
  for (const row of inputs.ledger) {
    const k = pairKey(row);
    if (ledgerSeen.has(k)) {
      errors.push(`ledger has a duplicate pending row: ${k}`);
    }
    ledgerSeen.add(k);
    if (!activeKeys.has(k)) {
      errors.push(`registry_claim_mismatch: pending ledger row resolves to no active obligation: ${k}`);
    }
    if (!ALLOWED_TIERS.has(row.tier)) {
      errors.push(`pending ledger row has an invalid tier '${row.tier}': ${k}`);
    }
    if (row.coverage_status !== "pending") {
      errors.push(`pending ledger row coverage_status must be 'pending', got '${row.coverage_status}': ${k}`);
    }
    if (recordedKeys.has(k)) {
      errors.push(`pending ledger row is also recorded (recorded ⊄ parked): ${k}`);
    }
  }

  // (c) reverse-validation: every recorded pair maps to a current active obligation.
  const recordedSeen = new Set<string>();
  for (const p of inputs.recorded) {
    const k = pairKey(p);
    if (recordedSeen.has(k)) {
      errors.push(`recorded set has a duplicate pair: ${k}`);
    }
    recordedSeen.add(k);
    if (!activeKeys.has(k)) {
      errors.push(`recorded pair resolves to no current active obligation: ${k}`);
    }
  }

  return errors;
}

export interface RatchetInputs {
  baseActiveKeys: Set<string>;
  currentActiveKeys: Set<string>;
  basePending: Set<string>;
  currentPending: Set<string>;
  baseRecorded: Set<string>;
  currentRecorded: Set<string>;
  /**
   * Bootstrap: at base the coverage artifacts (recorded-set + ledger) did not exist yet — there is
   * no prior backlog to ratchet against, so the current pending+recorded set IS the initial declared
   * baseline and the legacy-non-increase clause is vacuous. Only meaningful on the slice that
   * introduces the gate; every later PR's base carries the files (coverageBaseMissing=false).
   */
  coverageBaseMissing: boolean;
}

/**
 * Pure ratchet decision (git-free, unit-testable). Allowed new pending = currentActive − baseActive.
 * Rejects: (i) legacy pending growth (a current pending key that is in baseActive but was NOT pending
 * at base), (ii) a baseRecorded pair absent from current recorded (silent downgrade), (iii) re-parking
 * a currently-recorded pair (a pair in BOTH currentRecorded AND currentPending whose recorded status
 * is being undone — caught here as a recorded pair appearing in pending). The (i)/(ii) legacy-vs-base
 * clauses are skipped on the bootstrap slice (no prior backlog); (iii) is always enforced.
 */
export function evaluateRatchet(inputs: RatchetInputs): string[] {
  const errors: string[] = [];

  // (iii) re-parking is always enforced (independent of base state): a currently-recorded pair must
  // not also appear in the current pending ledger.
  for (const k of inputs.currentRecorded) {
    if (inputs.currentPending.has(k)) {
      errors.push(`currently-recorded pair is re-parked into the pending ledger: ${k}`);
    }
  }

  // On the bootstrap slice there is no prior backlog to compare against — the current declaration IS
  // the baseline. Skip the legacy-vs-base clauses; the next PR's base will carry the files.
  if (inputs.coverageBaseMissing) {
    return errors;
  }

  // (i) legacy pending may only shrink: a current pending key that already existed as an active
  // obligation at base, but was NOT in the base pending set, is illegitimate growth of the legacy
  // backlog. (Newly-declared-active pairs — not in baseActive — may legitimately enter pending.)
  for (const k of inputs.currentPending) {
    if (inputs.baseActiveKeys.has(k) && !inputs.basePending.has(k)) {
      errors.push(`legacy pending grew vs base (key was active at base but not pending): ${k}`);
    }
  }

  // (ii) a recorded pair at base must remain recorded (no silent recorded→pending downgrade).
  for (const k of inputs.baseRecorded) {
    if (!inputs.currentRecorded.has(k)) {
      errors.push(`recorded pair was downgraded (present at base, absent in current recorded): ${k}`);
    }
  }

  return errors;
}

function parseRecorded(text: string): ObligationPair[] {
  const doc = parseYaml(text) as { recorded?: unknown } | null;
  const rows = doc?.recorded;
  if (!Array.isArray(rows)) {
    throw new Error(`recorded-set must have a 'recorded' array (${RECORDED_REF})`);
  }
  return rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      validator_id: String(row.validator_id),
      obligation_id: String(row.obligation_id),
    };
  });
}

function parseLedger(text: string): LedgerRow[] {
  const doc = parseYaml(text) as { pending?: unknown } | null;
  const rows = doc?.pending;
  if (!Array.isArray(rows)) {
    throw new Error(`ledger must have a 'pending' array (${LEDGER_REF})`);
  }
  return rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      validator_id: String(row.validator_id),
      obligation_id: String(row.obligation_id),
      coverage_status: String(row.coverage_status),
      tier: String(row.tier),
    };
  });
}

async function git(args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, {
    cwd: PROJECT_ROOT,
    maxBuffer: 64 * 1024 * 1024,
  });
  return result.stdout;
}

/** Read a base-revision file's content, or null if the path did not exist at that revision. */
async function showBaseFile(mergeBase: string, ref: string): Promise<string | null> {
  try {
    return await git(["show", `${mergeBase}:${ref}`]);
  } catch (error) {
    // `git show <rev>:<path>` exits non-zero when the path did not exist at that revision.
    const message = error instanceof Error ? error.message : String(error);
    if (/exists on disk, but not in|does not exist in|fatal: path/.test(message)) {
      return null;
    }
    throw error;
  }
}

/** Materialize content to a temp path so the path-only registry loader can read it. */
async function writeTempFile(content: string, suffix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "obligation-coverage-base-"));
  const file = path.join(dir, `base-${suffix}`);
  await fs.writeFile(file, content, "utf8");
  return file;
}

function fail(errors: string[]): never {
  console.error("[check:obligation-coverage] FAIL");
  for (const message of errors) console.error(`  - ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  // CURRENT active set + checked-in recorded-set + pending ledger.
  let registry: ReconstructContractRegistry;
  try {
    registry = await loadReconstructContractRegistry({
      registryPath: path.join(PROJECT_ROOT, REGISTRY_REF),
    });
  } catch (error) {
    fail([`cannot load registry ${REGISTRY_REF}: ${error instanceof Error ? error.message : String(error)}`]);
  }
  const activePairs = activePairsFromRegistry(registry);

  let recorded: ObligationPair[];
  let ledger: LedgerRow[];
  try {
    recorded = parseRecorded(await fs.readFile(path.join(PROJECT_ROOT, RECORDED_REF), "utf8"));
    ledger = parseLedger(await fs.readFile(path.join(PROJECT_ROOT, LEDGER_REF), "utf8"));
  } catch (error) {
    fail([`cannot read/parse coverage artifacts: ${error instanceof Error ? error.message : String(error)}`]);
  }

  const pureErrors = evaluateObligationCoverage({ activePairs, recorded, ledger });

  // (d) RATCHET — git base-diff. Fail loud if the base data is unavailable in CI.
  const baseRef = process.argv[2] ?? "origin/main";
  let mergeBase: string;
  try {
    mergeBase = (await git(["merge-base", baseRef, "HEAD"])).trim();
  } catch {
    fail([`ratchet base ref not found (cannot prove legacy-pending non-increase): ${baseRef}`]);
  }

  let ratchetErrors: string[];
  try {
    // The base REGISTRY must exist (it is the source of baseActiveKeys) — absent ⇒ fail loud.
    const baseRegistryText = await showBaseFile(mergeBase, REGISTRY_REF);
    if (baseRegistryText === null) {
      fail([`ratchet base registry unavailable at ${mergeBase} (cannot prove legacy-pending non-increase)`]);
    }
    const baseRegistryFile = await writeTempFile(baseRegistryText, "registry.yaml");
    const baseRegistry = await loadReconstructContractRegistry({ registryPath: baseRegistryFile });
    const baseActivePairs = activePairsFromRegistry(baseRegistry);

    // The coverage artifacts may be ABSENT at base — that is the bootstrap slice (this gate did not
    // exist yet). Distinguish that from a corrupt/unreadable base (which throws below ⇒ fail loud).
    const baseRecordedText = await showBaseFile(mergeBase, RECORDED_REF);
    const baseLedgerText = await showBaseFile(mergeBase, LEDGER_REF);
    const coverageBaseMissing = baseRecordedText === null || baseLedgerText === null;
    const baseRecorded = baseRecordedText === null ? [] : parseRecorded(baseRecordedText);
    const basePending = baseLedgerText === null ? [] : parseLedger(baseLedgerText);

    ratchetErrors = evaluateRatchet({
      baseActiveKeys: new Set(baseActivePairs.map(pairKey)),
      currentActiveKeys: new Set(activePairs.map(pairKey)),
      basePending: new Set(basePending.map(pairKey)),
      currentPending: new Set(ledger.map(pairKey)),
      baseRecorded: new Set(baseRecorded.map(pairKey)),
      currentRecorded: new Set(recorded.map(pairKey)),
      coverageBaseMissing,
    });
  } catch (error) {
    fail([
      `ratchet base data unavailable (cannot prove legacy-pending non-increase): ${
        error instanceof Error ? error.message : String(error)
      }`,
    ]);
  }

  const errors = [...pureErrors, ...ratchetErrors];
  if (errors.length > 0) fail(errors);

  console.log(
    JSON.stringify(
      {
        check: "obligation-coverage",
        status: "passed",
        invariant: "INV-OBLIGATION-COVERAGE-1",
        base: baseRef,
        active_pairs: activePairs.length,
        recorded: recorded.length,
        parked: ledger.length,
      },
      null,
      2,
    ),
  );
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  await main();
}
