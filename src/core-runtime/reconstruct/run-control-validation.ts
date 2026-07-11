import crypto from "node:crypto";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import lockfile from "proper-lockfile";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";
import {
  assertArrayField,
  atomicWriteYamlDocument as writeYamlDocument,
  durableAtomicWriteYamlDocument as writeRunControlDocument,
} from "../artifact-io.js";
import { assertObligation } from "./obligation-assertion.js";
import type {
  ReconstructRecordArtifactRefs,
  ReconstructRunBootstrapDiagnosticArtifact,
  ReconstructRunControlArtifact,
  ReconstructRunControlValidationArtifact,
  ReconstructRunControlValidationViolation,
} from "./artifact-types.js";
import {
  assertDispatchFallbackRunControlHasNoLiveOwner,
  assertDispatchFallbackSessionAdmission,
} from "./dispatch-fallback-artifacts.js";
import {
  RECONSTRUCT_LLM_DISPATCH_FAILURE_DIR,
  ReconstructLlmDispatchFailureArtifactSchema,
  assertReconstructLlmDispatchFailureDirectory,
  createReconstructLlmDispatchFailureArtifact,
  isReconstructLlmDispatchFailureRef,
  isReconstructLlmDispatchFailureTempRef,
  planReconstructLlmDispatchFailureWrite,
  publishReconstructLlmDispatchFailureTemp,
  readReconstructLlmDispatchFailureArtifact,
  readReconstructLlmDispatchFailureArtifactWithHash,
  reconstructLlmDispatchFailurePath,
  sha256ReconstructLlmDispatchFailureArtifact,
  writeReconstructLlmDispatchFailureTemp,
  type ReconstructLlmDispatchFailureArtifact,
  type ReconstructLlmDispatchFailureError,
} from "./llm-dispatch-failure.js";

function isoNow(): string {
  return new Date().toISOString();
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

const runControlMutationQueues = new Map<string, Promise<void>>();

async function withRunControlMutationLock<T>(
  runControlPath: string,
  task: () => Promise<T>,
): Promise<T> {
  const key = path.resolve(runControlPath);
  const previous = runControlMutationQueues.get(key) ?? Promise.resolve();
  let releaseQueue: () => void = () => {};
  const current = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });
  const queued = previous.then(() => current);
  runControlMutationQueues.set(key, queued);
  await previous;

  const lockPath = `${key}.write-lock`;
  let releaseFileLock: (() => Promise<void>) | null = null;
  try {
    await fs.mkdir(path.dirname(key), { recursive: true });
    releaseFileLock = await lockfile.lock(key, {
      lockfilePath: lockPath,
      realpath: false,
      stale: 5_000,
      update: 1_000,
      retries: {
        retries: 600,
        factor: 1,
        minTimeout: 50,
        maxTimeout: 50,
        randomize: false,
      },
    });
    return await task();
  } finally {
    try {
      if (releaseFileLock) await releaseFileLock();
    } finally {
      releaseQueue();
      if (runControlMutationQueues.get(key) === queued) {
        runControlMutationQueues.delete(key);
      }
    }
  }
}

async function sha256File(filePath: string): Promise<string | null> {
  try {
    return crypto
      .createHash("sha256")
      .update(await fs.readFile(filePath))
      .digest("hex");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeYamlDocumentAtomicCreate(
  filePath: string,
  value: unknown,
): Promise<boolean> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  const handle = await fs.open(
    tempPath,
    fsConstants.O_CREAT |
      fsConstants.O_EXCL |
      fsConstants.O_WRONLY |
      fsConstants.O_NOFOLLOW,
    0o600,
  );
  try {
    await handle.writeFile(stringifyYaml(value), "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await fs.link(tempPath, filePath);
    const directoryHandle = await fs.open(path.dirname(filePath), fsConstants.O_RDONLY);
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  } finally {
    await fs.rm(tempPath, { force: true });
  }
}

async function readYamlDocument<T>(filePath: string): Promise<T> {
  return parseYaml(await fs.readFile(filePath, "utf8")) as T;
}

async function readYamlDocumentIfPresent<T>(filePath: string): Promise<T | null> {
  try {
    return await readYamlDocument<T>(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

const RESUME_PROVENANCE_MATCH_FILENAMES = new Set([
  "reconstruct-run-control-validation.yaml",
  "target-material-profile-validation.yaml",
  "source-safety-ledger-validation.yaml",
  "source-scout-pack-validation.yaml",
  "source-observation-lineage-index-validation.yaml",
  "seed-authoring-readiness-validation.yaml",
]);

const TERMINAL_VALIDATION_FILENAME =
  "reconstruct-run-manifest.post-publication-validation.yaml";

async function readValidationStatusIfPresent(
  filePath: string | null | undefined,
): Promise<string | null> {
  if (!filePath) return null;
  const artifact = await readYamlDocumentIfPresent<Record<string, unknown>>(filePath);
  const status = artifact?.validation_status;
  return typeof status === "string" ? status : null;
}

async function collectResumeProvenanceMatchRefs(sessionRoot: string): Promise<string[]> {
  const refs: string[] = [];
  async function visit(dirPath: string): Promise<void> {
    let entries: Array<import("node:fs").Dirent>;
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
        continue;
      }
      if (
        RESUME_PROVENANCE_MATCH_FILENAMES.has(entry.name) ||
        entry.name.endsWith(".reuse-provenance.yaml")
      ) {
        refs.push(entryPath);
      }
    }
  }
  await visit(sessionRoot);
  return [...new Set(refs.map((ref) => path.resolve(ref)))].sort();
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(record[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function reconstructRequestFingerprint(args: {
  projectRoot: string;
  sessionRoot: string;
  targetRefs: string[];
  intent: string;
  domain?: string | null;
  profilesRoot: string;
  filesystemAllowedRoots: string[];
  semanticAuthorRealization: string;
  confirmationProviderRealization: string;
}): string {
  return sha256(stableJson({
    projectRoot: path.resolve(args.projectRoot),
    sessionRoot: path.resolve(args.sessionRoot),
    targetRefs: args.targetRefs.map((targetRef) => path.resolve(targetRef)),
    intent: args.intent,
    domain: args.domain ?? null,
    profilesRoot: path.resolve(args.profilesRoot),
    filesystemAllowedRoots: args.filesystemAllowedRoots
      .map((root) => path.resolve(root))
      .sort(),
    semanticAuthorRealization: args.semanticAuthorRealization,
    confirmationProviderRealization: args.confirmationProviderRealization,
  }));
}

function idFor(prefix: string, seed: string): string {
  return `${prefix}:${sha256(seed).slice(0, 16)}`;
}

function targetSignatureRef(targetRefs: string[]): string {
  return `target-signature:${sha256(stableJson(targetRefs.map((targetRef) =>
    path.resolve(targetRef)
  ))).slice(0, 16)}`;
}

function violation(args: {
  code: ReconstructRunControlValidationViolation["code"];
  message: string;
  subjectId?: string | null;
}): ReconstructRunControlValidationViolation {
  return {
    code: args.code,
    message: args.message,
    subject_id: args.subjectId ?? null,
  };
}

function requiresTerminalValidationTrust(
  runControl: ReconstructRunControlArtifact,
): boolean {
  assertArrayField(runControl.attempt_rows, "run-control", "attempt_rows");
  assertArrayField(runControl.resume_rows, "run-control", "resume_rows");
  // A graceful-terminal `halted` attempt (design §16.6) is a terminal outcome that produced its
  // own terminal manifest validation, so it demands the same terminal-validation trust as a
  // completed attempt — it must not slip past the fail-closed authority check.
  return runControl.attempt_rows.some((row) =>
    row.attempt_status === "completed" || row.attempt_status === "halted"
  ) || runControl.resume_rows.some((row) =>
    row.resume_decision === "resume_allowed"
  );
}

function inferTerminalValidationRef(args: {
  runControl: ReconstructRunControlArtifact;
  runControlPath: string | null;
  explicitRef?: string | null;
}): string | null {
  assertArrayField(args.runControl.write_transactions, "run-control", "write_transactions");
  if (args.explicitRef !== undefined) {
    return args.explicitRef ? path.resolve(args.explicitRef) : null;
  }
  const committedTerminalRef = [...args.runControl.write_transactions]
    .reverse()
    .find((row) =>
      row.transaction_status === "committed" &&
      path.basename(row.artifact_ref) === TERMINAL_VALIDATION_FILENAME
    )?.artifact_ref;
  if (committedTerminalRef) return path.resolve(committedTerminalRef);
  if (!requiresTerminalValidationTrust(args.runControl) || !args.runControlPath) {
    return null;
  }
  return path.resolve(path.dirname(args.runControlPath), TERMINAL_VALIDATION_FILENAME);
}

export function validateReconstructRunControl(args: {
  runControl: ReconstructRunControlArtifact;
  runControlRef?: string | null;
  expectedSessionId?: string | null;
  expectedSessionRoot?: string | null;
  expectedCommittedArtifactRefs?: string[];
  terminalValidationRef?: string | null;
  terminalValidationStatus?: string | null;
  failedTerminalArtifactRef?: string | null;
  failedTerminalArtifact?: unknown;
  failedTerminalArtifactSha256?: string | null;
}): ReconstructRunControlValidationArtifact {
  assertArrayField(args.runControl.request_rows, "run-control", "request_rows");
  assertArrayField(args.runControl.attempt_rows, "run-control", "attempt_rows");
  assertArrayField(args.runControl.lock_rows, "run-control", "lock_rows");
  assertArrayField(args.runControl.write_transactions, "run-control", "write_transactions");
  assertArrayField(args.runControl.resume_rows, "run-control", "resume_rows");
  const violations: ReconstructRunControlValidationViolation[] = [];
  // G(a) slice 10: record the one obligation whose enforcement matches the authoritative contract
  // (ontology-seeding-and-maturation-design.md §"reconstruct-run-control-validation.yaml must prove")
  // — committed write transactions carry artifact_refs and hashes — stamped before the per-transaction
  // loop so it fires on a zero-transaction artifact. The block below trips invalid_transaction (missing
  // artifact_ref/owner_attempt_id) and transaction_hash_missing (committed without committed_hash).
  // PARKED (not recorded), each name broader than this validator's actual check — these are honest
  // declared≠wired surfacings, NOT laundered (see obligation-coverage-ledger.yaml notes):
  //   - preserve_post_write_hash_observation_without_claiming_atomic_commit_when_writer_did_not_prove_atomic_rename:
  //     the validator never reads commit_method; the atomic_rename-vs-observed_file_hash truthfulness
  //     is the writer's responsibility, not validated here.
  //   - reject_conflicting_request_fingerprints_before_semantic_artifacts_are_consumed: the validator
  //     rejects rows already marked duplicate_conflict/rejected_conflict (conflicting_request) but never
  //     compares request_fingerprint values — fingerprint conflict detection is in the writer.
  //   - validate_current_attempt_and_session_root_lock_ownership: presence of an active attempt
  //     (active_attempt_missing) + a session_root lock (session_lock_missing) + rejection of recorded
  //     conflicting locks (conflicting_lock) are checked, but the lock's owner_attempt_id is never
  //     cross-checked against the current attempt — the named ownership linkage is unverified.
  //   - validate_session_root_request_fingerprint_target_signature_runtime_version_and_idempotency_are_replayable:
  //     of the five named replayable quantities only session_root is validated; request_fingerprint,
  //     target signature, runtime version, and idempotency key are never inspected.
  const assertedObligationIds: string[] = [];
  assertObligation(
    assertedObligationIds,
    "validate_committed_write_transactions_have_artifact_refs_and_hashes",
  );
  if (args.runControl.schema_version !== "1") {
    violations.push(violation({
      code: "schema_shape_invalid",
      message: "run-control schema_version must be 1",
    }));
  }
  if (
    args.expectedSessionId &&
    args.runControl.session_id !== args.expectedSessionId
  ) {
    violations.push(violation({
      code: "session_id_mismatch",
      message: "run-control session_id does not match the current session",
      subjectId: args.runControl.session_id,
    }));
  }
  if (!args.runControl.session_root) {
    violations.push(violation({
      code: "session_root_missing",
      message: "run-control session_root is required",
    }));
  }
  if (
    args.expectedSessionRoot &&
    path.resolve(args.runControl.session_root) !== path.resolve(args.expectedSessionRoot)
  ) {
    violations.push(violation({
      code: "session_root_missing",
      message: "run-control session_root does not match the current session root",
      subjectId: args.runControl.session_root,
    }));
  }
  if (args.runControl.request_rows.length === 0) {
    violations.push(violation({
      code: "request_row_missing",
      message: "run-control must record at least one request row",
    }));
  }
  if (args.runControl.request_rows.some((row) =>
    row.request_status === "duplicate_conflict" ||
    row.request_status === "rejected_conflict"
  )) {
    violations.push(violation({
      code: "conflicting_request",
      message: "run-control contains a conflicting request row",
    }));
  }
  if (args.runControl.attempt_rows.length === 0) {
    violations.push(violation({
      code: "attempt_row_missing",
      message: "run-control must record at least one attempt row",
    }));
  }
  const duplicateIds = (
    rows: readonly Record<string, unknown>[],
    field: string,
  ): string[] => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const row of rows) {
      const value = row[field];
      if (typeof value !== "string") continue;
      if (seen.has(value)) duplicates.add(value);
      seen.add(value);
    }
    return [...duplicates];
  };
  for (const [label, rows, field] of [
    ["request", args.runControl.request_rows, "request_id"],
    ["attempt", args.runControl.attempt_rows, "attempt_id"],
    ["lock", args.runControl.lock_rows, "lock_id"],
    ["transaction", args.runControl.write_transactions, "transaction_id"],
    ["resume", args.runControl.resume_rows, "resume_id"],
  ] as const) {
    for (const duplicateId of duplicateIds(
      rows as unknown as readonly Record<string, unknown>[],
      field,
    )) {
      violations.push(violation({
        code: "schema_shape_invalid",
        message: `run-control ${label} ids must be unique`,
        subjectId: duplicateId,
      }));
    }
  }
  const latestAttempt = args.runControl.attempt_rows.at(-1) ?? null;
  let trustedFailedAttempt = false;
  if (latestAttempt?.attempt_status === "failed") {
    const failureTransactions = args.runControl.write_transactions.filter((row) =>
      row.owner_attempt_id === latestAttempt.attempt_id &&
      isReconstructLlmDispatchFailureRef(args.runControl.session_root, row.artifact_ref)
    );
    const transaction = failureTransactions.length === 1
      ? failureTransactions[0]
      : undefined;
    const parsedArtifact = ReconstructLlmDispatchFailureArtifactSchema.safeParse(
      args.failedTerminalArtifact,
    );
    const ownerSessionLocks = args.runControl.lock_rows.filter((row) =>
      row.lock_scope === "session_root" &&
      row.owner_attempt_id === latestAttempt.attempt_id
    );
    if (!transaction || args.failedTerminalArtifactRef === undefined) {
      violations.push(violation({
        code: "failed_terminal_missing",
        message:
          "latest failed attempt requires an owner-linked LLM dispatch failure transaction",
        subjectId: latestAttempt.attempt_id,
      }));
    } else if (
      transaction.transaction_status !== "committed" ||
      !transaction.committed_hash ||
      transaction.prepared_content_hash !== transaction.committed_hash ||
      path.resolve(transaction.artifact_ref) !==
        path.resolve(args.failedTerminalArtifactRef ?? "") ||
      transaction.committed_hash !== args.failedTerminalArtifactSha256 ||
      !parsedArtifact.success ||
      parsedArtifact.data.session_id !== args.runControl.session_id ||
      (args.expectedSessionId !== undefined &&
        parsedArtifact.data.session_id !== args.expectedSessionId) ||
      parsedArtifact.data.owner_attempt_id !== latestAttempt.attempt_id ||
      path.resolve(transaction.artifact_ref) !== path.resolve(
        reconstructLlmDispatchFailurePath(
          args.runControl.session_root,
          parsedArtifact.data.failure_id,
        ),
      ) ||
      ownerSessionLocks.length !== 1 ||
      ownerSessionLocks[0]?.lock_status !== "released" ||
      args.runControl.lock_rows.some((row) =>
        row.lock_scope === "session_root" && row.lock_status === "held"
      )
    ) {
      violations.push(violation({
        code: "failed_terminal_invalid",
        message:
          "latest failed attempt failure artifact must match owner, ref, schema, prepared hash, and committed hash",
        subjectId: transaction.transaction_id,
      }));
    } else {
      trustedFailedAttempt = true;
    }
  }
  const currentAttempt = trustedFailedAttempt
    ? latestAttempt
    : [...args.runControl.attempt_rows]
        .reverse()
        .find((row) =>
          row.attempt_status === "running" ||
          row.attempt_status === "completed" ||
          row.attempt_status === "recovered" ||
          row.attempt_status === "halted"
        ) ?? null;
  if (!currentAttempt) {
    violations.push(violation({
      code: "active_attempt_missing",
      message:
        "run-control must have a running, completed, recovered, halted, or trusted failed attempt",
    }));
  }
  const activeLocks = args.runControl.lock_rows.filter((row) =>
    row.lock_scope === "session_root" &&
    (row.lock_status === "held" || row.lock_status === "released")
  );
  if (activeLocks.length === 0) {
    violations.push(violation({
      code: "session_lock_missing",
      message: "run-control must record a session_root lock",
    }));
  }
  if (currentAttempt?.attempt_status === "running") {
    const heldSessionLocks = args.runControl.lock_rows.filter((row) =>
      row.lock_scope === "session_root" && row.lock_status === "held"
    );
    if (
      heldSessionLocks.length !== 1 ||
      heldSessionLocks[0]?.owner_attempt_id !== currentAttempt.attempt_id
    ) {
      violations.push(violation({
        code: "conflicting_lock",
        message:
          "the current running attempt must be the unique held session_root lock owner",
        subjectId: currentAttempt.attempt_id,
      }));
    }
  }
  if (args.runControl.lock_rows.some((row) =>
    row.lock_status === "conflict_blocked" ||
    row.lock_status === "stolen_invalid"
  )) {
    violations.push(violation({
      code: "conflicting_lock",
      message: "run-control contains a conflicting lock row",
    }));
  }
  for (const row of args.runControl.write_transactions) {
    if (!row.artifact_ref || !row.owner_attempt_id) {
      violations.push(violation({
        code: "invalid_transaction",
        message: "write transaction must record artifact_ref and owner_attempt_id",
        subjectId: row.transaction_id,
      }));
    }
    if (row.transaction_status === "committed" && !row.committed_hash) {
      violations.push(violation({
        code: "transaction_hash_missing",
        message: "committed transaction must record committed_hash",
        subjectId: row.transaction_id,
      }));
    }
    if (isReconstructLlmDispatchFailureRef(args.runControl.session_root, row.artifact_ref)) {
      if (
        !row.prepared_content_hash ||
        (row.transaction_status === "prepared" && !row.temp_ref) ||
        (row.transaction_status === "committed" &&
          row.prepared_content_hash !== row.committed_hash)
      ) {
        violations.push(violation({
          code: "invalid_transaction",
          message:
            "LLM dispatch failure transaction must preserve prepared content hash and temp/commit state",
          subjectId: row.transaction_id,
        }));
      }
    }
  }
  const attemptIds = new Set(
    args.runControl.attempt_rows.map((row) => row.attempt_id),
  );
  for (const row of args.runControl.resume_rows) {
    if (!attemptIds.has(row.source_attempt_id)) {
      violations.push(violation({
        code: "invalid_resume",
        message: "resume row source_attempt_id must resolve to an attempt row",
        subjectId: row.resume_id,
      }));
    }
    if (
      (row.resume_decision === "resume_allowed" ||
        row.resume_decision === "resume_pending_provenance") &&
      row.checkpoint_refs.length === 0
    ) {
      violations.push(violation({
        code: "invalid_resume",
        message: "resume rows must record checkpoint refs before reuse is allowed",
        subjectId: row.resume_id,
      }));
    }
    if (
      row.resume_decision === "resume_allowed" ||
      row.resume_decision === "resume_pending_provenance"
    ) {
      const rowRecord = row as unknown as Record<string, unknown>;
      if (
        "compatibility_policy" in rowRecord ||
        "compatibility_check_refs" in rowRecord
      ) {
        violations.push(violation({
          code: "invalid_resume",
          message:
            "resume rows use retired compatibility_* fields; run npm run migrate:reconstruct-artifact-fields before reuse",
          subjectId: row.resume_id,
        }));
      }
      if (row.provenance_match_policy !== "authored_artifact_reuse_match:v1") {
        violations.push(violation({
          code: "invalid_resume",
          message: "resume rows must record the authored artifact provenance match policy",
          subjectId: row.resume_id,
        }));
      }
      if ((row.provenance_match_check_refs ?? []).length === 0) {
        violations.push(violation({
          code: "invalid_resume",
          message: "resume rows must record provenance match refs",
          subjectId: row.resume_id,
        }));
      }
      const checkpointRefs = new Set(row.checkpoint_refs.map((ref) =>
        path.resolve(ref)
      ));
      for (const checkRef of row.provenance_match_check_refs ?? []) {
        if (!checkpointRefs.has(path.resolve(checkRef))) {
          violations.push(violation({
            code: "invalid_resume",
            message:
              "resume provenance match refs must be included in checkpoint refs",
            subjectId: checkRef,
          }));
        }
      }
    }
  }
  const committedRefs = new Set(
    args.runControl.write_transactions
      .filter((row) =>
        row.transaction_status === "committed" &&
        typeof row.committed_hash === "string" &&
        row.committed_hash.length > 0
      )
      .map((row) => path.resolve(row.artifact_ref)),
  );
  if (requiresTerminalValidationTrust(args.runControl)) {
    const terminalValidationRef = args.terminalValidationRef ?? null;
    if (!terminalValidationRef) {
      violations.push(violation({
        code: "terminal_validation_missing",
        message:
          "completed/halted attempts and resume_allowed rows require terminal run-manifest validation authority",
      }));
    } else {
      if (args.terminalValidationStatus !== "valid") {
        violations.push(violation({
          code: args.terminalValidationStatus === null
            ? "terminal_validation_missing"
            : "terminal_validation_invalid",
          message:
            "terminal run-manifest validation must exist and have validation_status=valid before completion, halt, or resume_allowed",
          subjectId: terminalValidationRef,
        }));
      }
      if (!committedRefs.has(path.resolve(terminalValidationRef))) {
        violations.push(violation({
          code: "expected_transaction_missing",
          message:
            "run-control validation is missing a committed hash transaction for the terminal run-manifest validation artifact",
          subjectId: terminalValidationRef,
        }));
      }
    }
  }
  for (const expectedRef of args.expectedCommittedArtifactRefs ?? []) {
    if (!committedRefs.has(path.resolve(expectedRef))) {
      violations.push(violation({
        code: "expected_transaction_missing",
        message:
          "run-control validation is missing a committed hash transaction for an expected consumed artifact",
        subjectId: expectedRef,
      }));
    }
  }
  return {
    schema_version: "1",
    session_id: args.runControl.session_id,
    created_at: isoNow(),
    reconstruct_run_control_ref: args.runControlRef ?? null,
    validation_status: violations.length === 0 ? "valid" : "invalid",
    request_count: args.runControl.request_rows.length,
    attempt_count: args.runControl.attempt_rows.length,
    active_lock_count: activeLocks.length,
    transaction_count: args.runControl.write_transactions.length,
    current_attempt_id: currentAttempt?.attempt_id ?? null,
    validation_results: violations.length === 0
      ? ["reconstruct_run_control_valid"]
      : ["reconstruct_run_control_invalid"],
    asserted_obligation_ids: assertedObligationIds,
    violations,
  };
}

async function buildReconstructRunControlValidationArtifactFromRunControl(args: {
  runControl: ReconstructRunControlArtifact;
  runControlPath: string;
  expectedSessionId?: string | null;
  expectedSessionRoot?: string | null;
  expectedCommittedArtifactRefs?: string[];
  terminalValidationRef?: string | null;
}): Promise<ReconstructRunControlValidationArtifact> {
  const terminalValidationRef = inferTerminalValidationRef({
    runControl: args.runControl,
    runControlPath: args.runControlPath,
    ...(args.terminalValidationRef !== undefined
      ? { explicitRef: args.terminalValidationRef }
      : {}),
  });
  const terminalValidationStatus =
    await readValidationStatusIfPresent(terminalValidationRef);
  const latestAttempt = args.runControl.attempt_rows.at(-1) ?? null;
  const failedTransaction = latestAttempt?.attempt_status === "failed"
    ? args.runControl.write_transactions.find((row) =>
        row.owner_attempt_id === latestAttempt.attempt_id &&
        isReconstructLlmDispatchFailureRef(
          args.runControl.session_root,
          row.artifact_ref,
        )
      )
    : undefined;
  let failedTerminalArtifact: ReconstructLlmDispatchFailureArtifact | null = null;
  let failedTerminalArtifactSha256: string | null = null;
  if (failedTransaction) {
    try {
      const failedRead =
        await readReconstructLlmDispatchFailureArtifactWithHash({
          sessionRoot: args.runControl.session_root,
          artifactRef: failedTransaction.artifact_ref,
        });
      failedTerminalArtifact = failedRead.artifact;
      failedTerminalArtifactSha256 = failedRead.sha256;
    } catch {
      failedTerminalArtifact = null;
      failedTerminalArtifactSha256 = null;
    }
  }
  return validateReconstructRunControl({
    runControl: args.runControl,
    runControlRef: args.runControlPath,
    ...(args.expectedSessionId !== undefined
      ? { expectedSessionId: args.expectedSessionId }
      : {}),
    ...(args.expectedSessionRoot !== undefined
      ? { expectedSessionRoot: args.expectedSessionRoot }
      : {}),
    ...(args.expectedCommittedArtifactRefs !== undefined
      ? { expectedCommittedArtifactRefs: args.expectedCommittedArtifactRefs }
      : {}),
    terminalValidationRef,
    terminalValidationStatus,
    ...(failedTransaction
      ? {
          failedTerminalArtifactRef: failedTransaction.artifact_ref,
          failedTerminalArtifact,
          failedTerminalArtifactSha256,
        }
      : {}),
  });
}

async function buildReconstructRunControlValidationArtifact(args: {
  runControlPath: string;
  expectedSessionId?: string | null;
  expectedSessionRoot?: string | null;
  expectedCommittedArtifactRefs?: string[];
  terminalValidationRef?: string | null;
}): Promise<ReconstructRunControlValidationArtifact> {
  const runControl = await readYamlDocument<ReconstructRunControlArtifact>(
    args.runControlPath,
  );
  return buildReconstructRunControlValidationArtifactFromRunControl({
    ...args,
    runControl,
  });
}

export async function writeReconstructRunControlValidationArtifact(args: {
  runControlPath: string;
  outputPath: string;
  expectedSessionId?: string | null;
  expectedSessionRoot?: string | null;
  expectedCommittedArtifactRefs?: string[];
  terminalValidationRef?: string | null;
}): Promise<ReconstructRunControlValidationArtifact> {
  const validation = await buildReconstructRunControlValidationArtifact(args);
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}

function comparableRunControlValidation(
  validation: unknown,
  options: { stripInMemoryFields: boolean },
): string | null {
  if (validation === null || typeof validation !== "object" || Array.isArray(validation)) {
    return null;
  }
  const persisted = { ...(validation as Record<string, unknown>) };
  if (options.stripInMemoryFields) {
    delete persisted.asserted_obligation_ids;
  }
  const parsed = PersistedRunControlValidationSchema.safeParse(persisted);
  if (!parsed.success) return null;
  try {
    return JSON.stringify({ ...parsed.data, created_at: null });
  } catch {
    return null;
  }
}

const PersistedRunControlValidationSchema = z.object({
  schema_version: z.literal("1"),
  session_id: z.string().min(1),
  created_at: z.string().datetime({ offset: true }),
  reconstruct_run_control_ref: z.string().min(1).nullable(),
  validation_status: z.enum(["valid", "invalid"]),
  request_count: z.number().int().nonnegative(),
  attempt_count: z.number().int().nonnegative(),
  active_lock_count: z.number().int().nonnegative(),
  transaction_count: z.number().int().nonnegative(),
  current_attempt_id: z.string().min(1).nullable(),
  validation_results: z.array(z.string()),
  violations: z.array(z.object({
    code: z.enum([
      "schema_shape_invalid",
      "session_id_mismatch",
      "session_root_missing",
      "request_row_missing",
      "attempt_row_missing",
      "active_attempt_missing",
      "session_lock_missing",
      "conflicting_request",
      "conflicting_lock",
      "invalid_transaction",
      "transaction_hash_missing",
      "terminal_validation_missing",
      "terminal_validation_invalid",
      "expected_transaction_missing",
      "failed_terminal_missing",
      "failed_terminal_invalid",
      "invalid_resume",
    ]),
    message: z.string(),
    subject_id: z.string().nullable(),
  }).strict()),
}).strict();

export async function writeReconstructRunBootstrapDiagnostic(args: {
  outputPath: string;
  attemptedSessionRoot: string;
  requestFingerprint: string;
  idempotencyKeyHash: string;
  failureKind: ReconstructRunBootstrapDiagnosticArtifact["failure_kind"];
  conflictingRefs?: string[];
  partialRefs?: string[];
  safeRecoveryAction: ReconstructRunBootstrapDiagnosticArtifact["safe_recovery_action"];
}): Promise<ReconstructRunBootstrapDiagnosticArtifact> {
  const artifact: ReconstructRunBootstrapDiagnosticArtifact = {
    schema_version: "1",
    emitted_at: isoNow(),
    attempted_session_root: args.attemptedSessionRoot,
    request_fingerprint: args.requestFingerprint,
    idempotency_key_hash: args.idempotencyKeyHash,
    failure_kind: args.failureKind,
    conflicting_refs: args.conflictingRefs ?? [],
    partial_refs: args.partialRefs ?? [],
    safe_recovery_action: args.safeRecoveryAction,
    diagnostic_source: "runtime_control_bootstrap",
  };
  await writeYamlDocument(args.outputPath, artifact);
  return artifact;
}

async function initializeReconstructRunControlUnlocked(args: {
  sessionId: string;
  sessionRoot: string;
  projectRoot: string;
  targetRefs: string[];
  intent: string;
  domain?: string | null;
  profilesRoot: string;
  filesystemAllowedRoots: string[];
  semanticAuthorRealization: string;
  confirmationProviderRealization: string;
  runtimeVersion: string;
  resumeMode?: "fresh" | "reuse_existing_authored_artifacts";
  outputPath: string;
  validationOutputPath: string;
  bootstrapDiagnosticPath: string;
  dispatchFallbackEnabled?: boolean;
}): Promise<{
  runControl: ReconstructRunControlArtifact;
  validation: ReconstructRunControlValidationArtifact;
  requestFingerprint: string;
  attemptId: string;
}> {
  await assertDispatchFallbackSessionAdmission({
    sessionRoot: args.sessionRoot,
    enabled: args.dispatchFallbackEnabled === true,
  });
  const requestFingerprint = reconstructRequestFingerprint({
    projectRoot: args.projectRoot,
    sessionRoot: args.sessionRoot,
    targetRefs: args.targetRefs,
    intent: args.intent,
    domain: args.domain ?? null,
    profilesRoot: args.profilesRoot,
    filesystemAllowedRoots: args.filesystemAllowedRoots,
    semanticAuthorRealization: args.semanticAuthorRealization,
    confirmationProviderRealization: args.confirmationProviderRealization,
  });
  const idempotencyKeyHash = sha256(`reconstruct:${requestFingerprint}`);
  const existing =
    await readYamlDocumentIfPresent<ReconstructRunControlArtifact>(args.outputPath);
  if (existing) {
    assertDispatchFallbackRunControlHasNoLiveOwner({
      runControl: existing,
      enabled: args.dispatchFallbackEnabled === true,
    });
    const conflict = existing.request_rows.some((row) =>
      row.request_fingerprint !== requestFingerprint
    );
    if (conflict) {
      await writeReconstructRunBootstrapDiagnostic({
        outputPath: args.bootstrapDiagnosticPath,
        attemptedSessionRoot: args.sessionRoot,
        requestFingerprint,
        idempotencyKeyHash,
        failureKind: "duplicate_conflict",
        conflictingRefs: [args.outputPath],
        safeRecoveryAction: "retry_with_new_session",
      });
      throw new Error(
        `reconstruct run-control conflict at ${args.outputPath}; retry with a new session root or explicit recovery`,
      );
    }
    if (args.resumeMode === "reuse_existing_authored_artifacts") {
      const completedAttempt = existing.attempt_rows.find((row) =>
        row.attempt_status === "completed"
      );
      if (!completedAttempt) {
        const now = isoNow();
        const sourceAttempt = [...existing.attempt_rows].reverse()[0] ?? null;
        const heldSessionLock = existing.lock_rows.find((row) =>
          row.lock_scope === "session_root" && row.lock_status === "held"
        );
        if (
          sourceAttempt?.attempt_status === "running" ||
          heldSessionLock !== undefined
        ) {
          throw new Error(
            "cannot resume a live reconstruct attempt; lease expiry is not takeover authority",
          );
        }
        if (existing.resume_rows.some((row) =>
          row.source_attempt_id === sourceAttempt?.attempt_id &&
          row.resume_decision === "blocked_partial_write"
        )) {
          throw new Error(
            "cannot resume reconstruct session with blocked_partial_write authority",
          );
        }
        let failureProvenanceRefs: string[] = [];
        const sourceFailureTransactions = sourceAttempt?.attempt_status === "failed"
          ? existing.write_transactions.filter((row) =>
              row.owner_attempt_id === sourceAttempt.attempt_id &&
              isReconstructLlmDispatchFailureRef(
                args.sessionRoot,
                row.artifact_ref,
              )
            )
          : [];
        if (sourceFailureTransactions.length > 0) {
          const failedValidation =
            await writeReconstructRunControlValidationArtifact({
              runControlPath: args.outputPath,
              outputPath: args.validationOutputPath,
              expectedSessionId: args.sessionId,
              expectedSessionRoot: args.sessionRoot,
            });
          if (failedValidation.validation_status !== "valid") {
            throw new Error(
              `cannot resume from an untrusted failed terminal: ${failedValidation.violations.map((item) => item.code).join(",")}`,
            );
          }
          failureProvenanceRefs = sourceFailureTransactions
            .filter((row) =>
              row.transaction_status === "committed"
            )
            .map((row) => row.artifact_ref);
          if (failureProvenanceRefs.length !== 1) {
            throw new Error(
              "cannot resume without exactly one trusted failure provenance ref",
            );
          }
        }
        const resumeId = idFor(
          "resume",
          `${requestFingerprint}:${now}:${crypto.randomUUID()}`,
        );
        const attemptId = idFor("attempt", `${resumeId}:attempt`);
        const trustedArtifactRefs = existing.write_transactions
          .filter((row) =>
            row.transaction_status === "committed" &&
            row.committed_hash !== null &&
            !isReconstructLlmDispatchFailureRef(
              args.sessionRoot,
              row.artifact_ref,
            )
          )
          .map((row) => row.artifact_ref)
          .sort();
        const provenanceMatchRefs =
          await collectResumeProvenanceMatchRefs(args.sessionRoot);
        const checkpointRefs = [
          args.outputPath,
          args.validationOutputPath,
          ...provenanceMatchRefs,
          ...trustedArtifactRefs,
          ...failureProvenanceRefs,
        ];
        existing.updated_at = now;
        existing.resume_rows.push({
          resume_id: resumeId,
          resume_token_hash: sha256(`resume:${resumeId}:${requestFingerprint}`),
          source_attempt_id: sourceAttempt?.attempt_id ?? attemptId,
          provenance_match_policy: "authored_artifact_reuse_match:v1",
          provenance_match_check_refs: provenanceMatchRefs,
          checkpoint_refs: [...new Set(checkpointRefs)].sort(),
          trusted_artifact_refs: trustedArtifactRefs,
          stale_artifact_refs: [],
          required_revalidation_refs: [
            args.validationOutputPath,
            ...provenanceMatchRefs,
            ...trustedArtifactRefs,
            ...failureProvenanceRefs,
          ].sort(),
          resume_decision: "resume_pending_provenance",
        });
        existing.attempt_rows = existing.attempt_rows.map((row) =>
          row.attempt_status === "running"
            ? {
              ...row,
              completed_at: row.completed_at ?? now,
              attempt_status: "recovered",
              recovery_from_refs: [
                ...new Set([...row.recovery_from_refs, resumeId]),
              ],
            }
            : row
        );
        existing.attempt_rows.push({
          attempt_id: attemptId,
          parent_attempt_id: sourceAttempt?.attempt_id ?? null,
          attempt_kind: "resume",
          trigger_ref: resumeId,
          started_at: now,
          completed_at: null,
          attempt_status: "running",
          recovery_from_refs: [
            args.outputPath,
            args.validationOutputPath,
            ...trustedArtifactRefs,
            ...failureProvenanceRefs,
          ],
        });
        existing.lock_rows = existing.lock_rows.map((row) =>
          row.lock_scope === "session_root" && row.lock_status === "held"
            ? { ...row, lock_status: "released" }
            : row
        );
        existing.lock_rows.push({
          lock_id: idFor("lock", `${args.sessionRoot}:session_root:${attemptId}`),
          lock_scope: "session_root",
          owner_attempt_id: attemptId,
          lease_started_at: now,
          lease_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          lock_token_hash: sha256(`${attemptId}:${args.sessionRoot}`),
          conflict_policy: "recover_expired_lease",
          lock_status: "held",
        });
        await writeRunControlDocument(args.outputPath, existing);
        const validation = await writeReconstructRunControlValidationArtifact({
          runControlPath: args.outputPath,
          outputPath: args.validationOutputPath,
          expectedSessionId: args.sessionId,
          expectedSessionRoot: args.sessionRoot,
        });
        return {
          runControl: existing,
          validation,
          requestFingerprint,
          attemptId,
        };
      }
    }
    await writeReconstructRunBootstrapDiagnostic({
      outputPath: args.bootstrapDiagnosticPath,
      attemptedSessionRoot: args.sessionRoot,
      requestFingerprint,
      idempotencyKeyHash,
      failureKind: "duplicate_same_request",
      conflictingRefs: [args.outputPath],
      safeRecoveryAction: "return_existing",
    });
    throw new Error(
      `reconstruct run-control already exists for the same request at ${args.outputPath}; read the existing result/status or retry with a new session root`,
    );
  }

  const now = isoNow();
  const attemptId = idFor("attempt", `${requestFingerprint}:${now}`);
  const runControl: ReconstructRunControlArtifact = {
    schema_version: "1",
    session_id: args.sessionId,
    session_root: path.resolve(args.sessionRoot),
    created_at: now,
    updated_at: now,
    runtime_version: args.runtimeVersion,
    request_rows: [
      {
        request_id: idFor("request", requestFingerprint),
        idempotency_key_hash: idempotencyKeyHash,
        request_fingerprint: requestFingerprint,
        target_signature_ref: targetSignatureRef(args.targetRefs),
        requested_stage: "seeding",
        duplicate_policy: "reject_conflict",
        request_status: "accepted",
      },
    ],
    attempt_rows: [
      {
        attempt_id: attemptId,
        parent_attempt_id: null,
        attempt_kind: "initial",
        trigger_ref: null,
        started_at: now,
        completed_at: null,
        attempt_status: "running",
        recovery_from_refs: [],
      },
    ],
    lock_rows: [
      {
        lock_id: idFor("lock", `${args.sessionRoot}:session_root`),
        lock_scope: "session_root",
        owner_attempt_id: attemptId,
        lease_started_at: now,
        lease_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        lock_token_hash: sha256(`${attemptId}:${args.sessionRoot}`),
        conflict_policy: "fail_loud",
        lock_status: "held",
      },
    ],
    write_transactions: [],
    resume_rows: [],
  };
  const created = await writeYamlDocumentAtomicCreate(args.outputPath, runControl);
  if (!created) {
    return initializeReconstructRunControlUnlocked(args);
  }
  const validation = await writeReconstructRunControlValidationArtifact({
    runControlPath: args.outputPath,
    outputPath: args.validationOutputPath,
    expectedSessionId: args.sessionId,
    expectedSessionRoot: args.sessionRoot,
  });
  return { runControl, validation, requestFingerprint, attemptId };
}

export async function initializeReconstructRunControl(
  args: Parameters<typeof initializeReconstructRunControlUnlocked>[0],
) {
  return withRunControlMutationLock(
    args.outputPath,
    () => initializeReconstructRunControlUnlocked(args),
  );
}

async function markReconstructRunControlAttemptFailedUnlocked(args: {
  runControlPath: string;
  validationOutputPath: string;
  attemptId: string;
  expectedSessionId: string;
  expectedSessionRoot: string;
}): Promise<{
  runControl: ReconstructRunControlArtifact;
  validation: ReconstructRunControlValidationArtifact;
}> {
  const runControl = await readYamlDocument<ReconstructRunControlArtifact>(
    args.runControlPath,
  );
  const failedAt = isoNow();
  let changed = false;
  runControl.updated_at = failedAt;
  runControl.attempt_rows = runControl.attempt_rows.map((row) => {
    if (row.attempt_id !== args.attemptId || row.attempt_status !== "running") {
      return row;
    }
    changed = true;
    return {
      ...row,
      completed_at: failedAt,
      attempt_status: "failed",
    };
  });
  if (changed) {
    runControl.lock_rows = runControl.lock_rows.map((row) =>
      row.owner_attempt_id === args.attemptId && row.lock_status === "held"
        ? { ...row, lock_status: "released" }
        : row
    );
    await writeRunControlDocument(args.runControlPath, runControl);
  }
  const validation = await writeReconstructRunControlValidationArtifact({
    runControlPath: args.runControlPath,
    outputPath: args.validationOutputPath,
    expectedSessionId: args.expectedSessionId,
    expectedSessionRoot: args.expectedSessionRoot,
  });
  return { runControl, validation };
}

export async function markReconstructRunControlAttemptFailed(
  args: Parameters<typeof markReconstructRunControlAttemptFailedUnlocked>[0],
) {
  return withRunControlMutationLock(
    args.runControlPath,
    () => markReconstructRunControlAttemptFailedUnlocked(args),
  );
}

export type ReconstructLlmFailurePersistenceFaultPoint =
  | "after_temp_write"
  | "after_prepare"
  | "after_publish"
  | "after_commit";

async function persistReconstructLlmDispatchFailureUnlocked(args: {
  runControlPath: string;
  validationOutputPath: string;
  sessionId: string;
  sessionRoot: string;
  attemptId: string;
  error: ReconstructLlmDispatchFailureError;
  faultInjector?: (
    point: ReconstructLlmFailurePersistenceFaultPoint,
  ) => void | Promise<void>;
}): Promise<{
  artifact: ReconstructLlmDispatchFailureArtifact;
  artifactRef: string;
  runControl: ReconstructRunControlArtifact;
  validation: ReconstructRunControlValidationArtifact;
}> {
  let runControl = await readYamlDocument<ReconstructRunControlArtifact>(
    args.runControlPath,
  );
  const latestAttempt = runControl.attempt_rows.at(-1) ?? null;
  const ownerLocks = runControl.lock_rows.filter((row) =>
    row.owner_attempt_id === args.attemptId &&
    row.lock_scope === "session_root" &&
    row.lock_status === "held"
  );
  if (
    latestAttempt?.attempt_id !== args.attemptId ||
    latestAttempt.attempt_status !== "running" ||
    ownerLocks.length !== 1
  ) {
    throw new Error(
      `cannot persist LLM dispatch failure for non-owning attempt ${args.attemptId}`,
    );
  }
  const artifact = createReconstructLlmDispatchFailureArtifact({
    sessionId: args.sessionId,
    attemptId: args.attemptId,
    error: args.error,
  });
  const plan = await planReconstructLlmDispatchFailureWrite({
    sessionRoot: args.sessionRoot,
    artifact,
  });
  const temp = await writeReconstructLlmDispatchFailureTemp({
    sessionRoot: args.sessionRoot,
    artifact,
    plan,
  });
  await args.faultInjector?.("after_temp_write");

  const transactionId = idFor(
    "write",
    `${args.attemptId}:${plan.finalRef}`,
  );
  const existingTransaction = runControl.write_transactions.find((row) =>
    row.transaction_id === transactionId
  );
  const attempt = runControl.attempt_rows.find((row) =>
    row.attempt_id === args.attemptId
  );
  const heldLock = runControl.lock_rows.some((row) =>
    row.owner_attempt_id === args.attemptId &&
    row.lock_scope === "session_root" &&
    row.lock_status === "held"
  );
  if (
    (!attempt || attempt.attempt_status !== "running" || !heldLock) &&
    existingTransaction?.transaction_status !== "committed"
  ) {
    throw new Error(
      `cannot prepare LLM dispatch failure for non-owning attempt ${args.attemptId}`,
    );
  }
  if (existingTransaction) {
    if (
      existingTransaction.owner_attempt_id !== args.attemptId ||
      path.resolve(existingTransaction.artifact_ref) !== path.resolve(plan.finalRef) ||
      existingTransaction.prepared_content_hash !== plan.contentSha256 ||
      (existingTransaction.transaction_status !== "prepared" &&
        existingTransaction.transaction_status !== "committed")
    ) {
      throw new Error(`LLM dispatch failure transaction conflicts: ${transactionId}`);
    }
  } else {
    runControl.updated_at = isoNow();
    runControl.write_transactions.push({
      transaction_id: transactionId,
      owner_attempt_id: args.attemptId,
      artifact_ref: plan.finalRef,
      temp_ref: plan.tempRef,
      expected_prior_hash: null,
      prepared_content_hash: plan.contentSha256,
      committed_hash: null,
      commit_method: "append_only",
      transaction_status: "prepared",
      recovery_ref: null,
    });
    await writeRunControlDocument(args.runControlPath, runControl);
  }
  await args.faultInjector?.("after_prepare");

  await publishReconstructLlmDispatchFailureTemp({
    sessionRoot: args.sessionRoot,
    tempRef: temp.tempRef,
    finalRef: temp.finalRef,
  });
  await args.faultInjector?.("after_publish");
  const publishedRead = await readReconstructLlmDispatchFailureArtifactWithHash({
    sessionRoot: args.sessionRoot,
    artifactRef: temp.finalRef,
  });
  const published = publishedRead.artifact;
  const publishedHash = publishedRead.sha256;
  if (
    published.failure_id !== artifact.failure_id ||
    published.owner_attempt_id !== args.attemptId ||
    publishedHash !== temp.contentSha256
  ) {
    throw new Error("published LLM dispatch failure artifact failed integrity verification");
  }

  runControl = await readYamlDocument<ReconstructRunControlArtifact>(
    args.runControlPath,
  );
  const alreadyCommitted = runControl.write_transactions.find((row) =>
    row.transaction_id === transactionId &&
    row.transaction_status === "committed" &&
    row.owner_attempt_id === args.attemptId &&
    row.committed_hash === publishedHash
  );
  if (alreadyCommitted) {
    const validation = await writeReconstructRunControlValidationArtifact({
      runControlPath: args.runControlPath,
      outputPath: args.validationOutputPath,
      expectedSessionId: args.sessionId,
      expectedSessionRoot: args.sessionRoot,
    });
    if (validation.validation_status !== "valid") {
      throw new Error(
        `reconciled LLM dispatch failure did not produce a valid failed terminal: ${validation.violations.map((item) => item.code).join(",")}`,
      );
    }
    return {
      artifact: published,
      artifactRef: temp.finalRef,
      runControl,
      validation,
    };
  }
  const preparedTransaction = runControl.write_transactions.find((row) =>
    row.transaction_id === transactionId &&
    row.transaction_status === "prepared" &&
    row.owner_attempt_id === args.attemptId &&
    row.prepared_content_hash === publishedHash
  );
  const runningAttempt = runControl.attempt_rows.some((row) =>
    row.attempt_id === args.attemptId && row.attempt_status === "running"
  );
  const owningLock = runControl.lock_rows.some((row) =>
    row.owner_attempt_id === args.attemptId &&
    row.lock_scope === "session_root" &&
    row.lock_status === "held"
  );
  if (!preparedTransaction || !runningAttempt || !owningLock) {
    throw new Error(
      `cannot commit LLM dispatch failure without prepared transaction ownership for ${args.attemptId}`,
    );
  }
  const committedAt = isoNow();
  runControl.updated_at = committedAt;
  runControl.write_transactions = runControl.write_transactions.map((row) =>
    row.transaction_id === transactionId && row.transaction_status === "prepared"
      ? {
          ...row,
          temp_ref: null,
          committed_hash: publishedHash,
          transaction_status: "committed" as const,
        }
      : row
  );
  runControl.attempt_rows = runControl.attempt_rows.map((row) =>
    row.attempt_id === args.attemptId && row.attempt_status === "running"
      ? { ...row, completed_at: committedAt, attempt_status: "failed" as const }
      : row
  );
  runControl.lock_rows = runControl.lock_rows.map((row) =>
    row.owner_attempt_id === args.attemptId && row.lock_status === "held"
      ? { ...row, lock_status: "released" as const }
      : row
  );
  await writeRunControlDocument(args.runControlPath, runControl);
  await args.faultInjector?.("after_commit");
  const validation = await writeReconstructRunControlValidationArtifact({
    runControlPath: args.runControlPath,
    outputPath: args.validationOutputPath,
    expectedSessionId: args.sessionId,
    expectedSessionRoot: args.sessionRoot,
  });
  if (validation.validation_status !== "valid") {
    throw new Error(
      `persisted LLM dispatch failure did not produce a valid failed terminal: ${validation.violations.map((item) => item.code).join(",")}`,
    );
  }
  return { artifact, artifactRef: temp.finalRef, runControl, validation };
}

export async function persistReconstructLlmDispatchFailure(
  args: Parameters<typeof persistReconstructLlmDispatchFailureUnlocked>[0],
) {
  return withRunControlMutationLock(
    args.runControlPath,
    () => persistReconstructLlmDispatchFailureUnlocked(args),
  );
}

function blockedPartialWriteResumeRow(args: {
  runControlPath: string;
  attemptId: string;
  staleRefs: string[];
}): ReconstructRunControlArtifact["resume_rows"][number] {
  const resumeId = idFor(
    "resume",
    `${args.attemptId}:blocked_partial_write:${args.staleRefs.join(":")}`,
  );
  return {
    resume_id: resumeId,
    resume_token_hash: sha256(resumeId),
    source_attempt_id: args.attemptId,
    checkpoint_refs: [args.runControlPath],
    trusted_artifact_refs: [],
    stale_artifact_refs: args.staleRefs,
    required_revalidation_refs: [args.runControlPath],
    resume_decision: "blocked_partial_write",
  };
}

function abandonCurrentAttemptForPartialWrite(args: {
  runControl: ReconstructRunControlArtifact;
  runControlPath: string;
  staleRefs: string[];
}): boolean {
  const current = args.runControl.attempt_rows.at(-1) ?? null;
  if (current?.attempt_status !== "running") return false;
  const abandonedAt = isoNow();
  args.runControl.attempt_rows = args.runControl.attempt_rows.map((row) =>
    row.attempt_id === current.attempt_id && row.attempt_status === "running"
      ? { ...row, completed_at: abandonedAt, attempt_status: "abandoned" as const }
      : row
  );
  args.runControl.lock_rows = args.runControl.lock_rows.map((row) =>
    row.owner_attempt_id === current.attempt_id && row.lock_status === "held"
      ? { ...row, lock_status: "released" as const }
      : row
  );
  if (!args.runControl.resume_rows.some((row) =>
    row.source_attempt_id === current.attempt_id &&
    row.resume_decision === "blocked_partial_write"
  )) {
    args.runControl.resume_rows.push(blockedPartialWriteResumeRow({
      runControlPath: args.runControlPath,
      attemptId: current.attempt_id,
      staleRefs: args.staleRefs,
    }));
  }
  return true;
}

async function pathExists(filePath: string | null): Promise<boolean> {
  if (!filePath) return false;
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function removeFailureTempFile(
  sessionRoot: string,
  tempRef: string,
): Promise<void> {
  const directoryPath = await assertReconstructLlmDispatchFailureDirectory(
    sessionRoot,
  );
  if (
    !isReconstructLlmDispatchFailureTempRef(sessionRoot, tempRef) ||
    path.dirname(path.resolve(tempRef)) !== directoryPath
  ) {
    throw new Error(`cannot remove failure temp outside session: ${tempRef}`);
  }
  const stat = await fs.lstat(tempRef).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!stat) return;
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`cannot remove non-regular failure temp: ${tempRef}`);
  }
  await fs.rm(tempRef);
}

async function validatePreparedFailureArtifact(args: {
  sessionRoot: string;
  artifactRef: string;
  sessionId: string;
  ownerAttemptId: string;
  preparedContentHash: string | null | undefined;
}): Promise<{ artifact: ReconstructLlmDispatchFailureArtifact; hash: string }> {
  const read = await readReconstructLlmDispatchFailureArtifactWithHash({
    sessionRoot: args.sessionRoot,
    artifactRef: args.artifactRef,
    allowTemp: isReconstructLlmDispatchFailureTempRef(
      args.sessionRoot,
      args.artifactRef,
    ),
  });
  const artifact = read.artifact;
  const hash = read.sha256;
  if (
    artifact.session_id !== args.sessionId ||
    artifact.owner_attempt_id !== args.ownerAttemptId ||
    !args.preparedContentHash ||
    hash !== args.preparedContentHash
  ) {
    throw new Error("prepared failure transaction artifact does not match owner/hash");
  }
  if (
    !isReconstructLlmDispatchFailureTempRef(args.sessionRoot, args.artifactRef) &&
    path.resolve(args.artifactRef) !== path.resolve(
      reconstructLlmDispatchFailurePath(args.sessionRoot, artifact.failure_id),
    )
  ) {
    throw new Error("prepared failure transaction artifact path does not match failure id");
  }
  return { artifact, hash };
}

async function reconcileReconstructLlmDispatchFailuresUnlocked(args: {
  sessionRoot: string;
  runControlPath?: string;
  validationOutputPath?: string;
}): Promise<{
  runControl: ReconstructRunControlArtifact;
  validation: ReconstructRunControlValidationArtifact | null;
} | null> {
  const sessionRoot = path.resolve(args.sessionRoot);
  const runControlPath = path.resolve(
    args.runControlPath ?? path.join(sessionRoot, "reconstruct-run-control.yaml"),
  );
  const validationOutputPath = path.resolve(
    args.validationOutputPath ??
      path.join(sessionRoot, "reconstruct-run-control-validation.yaml"),
  );
  let runControl: ReconstructRunControlArtifact;
  try {
    runControl = await readYamlDocument<ReconstructRunControlArtifact>(
      runControlPath,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  if (
    path.resolve(runControl.session_root) !== sessionRoot ||
    runControl.session_id !== path.basename(sessionRoot) ||
    runControlPath !== path.join(sessionRoot, "reconstruct-run-control.yaml") ||
    validationOutputPath !==
      path.join(sessionRoot, "reconstruct-run-control-validation.yaml")
  ) {
    throw new Error("reconstruct failure reconciliation session identity mismatch");
  }

  let changed = false;
  const failureDirectory = await assertReconstructLlmDispatchFailureDirectory(
    sessionRoot,
  );
  let failureEntries: Array<import("node:fs").Dirent> = [];
  try {
    failureEntries = await fs.readdir(failureDirectory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const trackedTempRefs = new Set(
    runControl.write_transactions
      .map((row) => row.temp_ref)
      .filter((ref): ref is string => Boolean(ref))
      .map((ref) => path.resolve(ref)),
  );
  const trackedFinalRefs = new Set(
    runControl.write_transactions
      .filter((row) =>
        isReconstructLlmDispatchFailureRef(sessionRoot, row.artifact_ref)
      )
      .map((row) => path.resolve(row.artifact_ref)),
  );
  const untrackedPartialRefs = failureEntries
    .filter((entry) => {
      const entryRef = path.join(failureDirectory, entry.name);
      return entry.name.startsWith(".scratch-") ||
        (entry.name.startsWith(".pending-") && !trackedTempRefs.has(entryRef));
    })
    .map((entry) => path.join(failureDirectory, entry.name));
  const ambiguousPartialWrite = untrackedPartialRefs.length > 1;
  if (ambiguousPartialWrite) {
    changed = abandonCurrentAttemptForPartialWrite({
      runControl,
      runControlPath,
      staleRefs: untrackedPartialRefs,
    }) || changed;
  }
  for (const entry of failureEntries) {
    const entryRef = path.join(failureDirectory, entry.name);
    if (entry.name.startsWith(".scratch-")) {
      if (!ambiguousPartialWrite) {
        changed = abandonCurrentAttemptForPartialWrite({
          runControl,
          runControlPath,
          staleRefs: [entryRef],
        }) || changed;
      }
      continue;
    }
    if (entry.name.startsWith(".pending-") && !trackedTempRefs.has(entryRef)) {
      if (ambiguousPartialWrite) continue;
      try {
        const read = await readReconstructLlmDispatchFailureArtifactWithHash({
          sessionRoot,
          artifactRef: entryRef,
          allowTemp: true,
        });
        const latestAttempt = runControl.attempt_rows.at(-1) ?? null;
        const ownerLocks = runControl.lock_rows.filter((row) =>
          row.lock_scope === "session_root" &&
          row.owner_attempt_id === read.artifact.owner_attempt_id
        );
        if (
          entry.name.startsWith(`.pending-${read.sha256.slice(0, 16)}-`) &&
          read.artifact.session_id === runControl.session_id &&
          latestAttempt?.attempt_id === read.artifact.owner_attempt_id &&
          latestAttempt.attempt_status === "running" &&
          ownerLocks.length === 1 &&
          ownerLocks[0]?.lock_status === "held"
        ) {
          const finalRef = reconstructLlmDispatchFailurePath(
            sessionRoot,
            read.artifact.failure_id,
          );
          const transactionId = idFor(
            "write",
            `${read.artifact.owner_attempt_id}:${finalRef}`,
          );
          if (!runControl.write_transactions.some((row) =>
            row.transaction_id === transactionId
          )) {
            runControl.write_transactions.push({
              transaction_id: transactionId,
              owner_attempt_id: read.artifact.owner_attempt_id,
              artifact_ref: finalRef,
              temp_ref: entryRef,
              expected_prior_hash: null,
              prepared_content_hash: read.sha256,
              committed_hash: null,
              commit_method: "append_only",
              transaction_status: "prepared",
              recovery_ref: null,
            });
            trackedFinalRefs.add(path.resolve(finalRef));
            changed = true;
            runControl.updated_at = isoNow();
            await writeRunControlDocument(runControlPath, runControl);
          }
        } else {
          changed = abandonCurrentAttemptForPartialWrite({
            runControl,
            runControlPath,
            staleRefs: [entryRef],
          }) || changed;
        }
      } catch {
        changed = abandonCurrentAttemptForPartialWrite({
          runControl,
          runControlPath,
          staleRefs: [entryRef],
        }) || changed;
      }
      continue;
    }
    if (
      !entry.name.startsWith("failure-") ||
      path.extname(entry.name) !== ".yaml" ||
      trackedFinalRefs.has(entryRef)
    ) {
      continue;
    }
    let artifact: ReconstructLlmDispatchFailureArtifact | null = null;
    let artifactHash: string | null = null;
    try {
      const stat = await fs.lstat(entryRef);
      if (stat.isFile() && !stat.isSymbolicLink()) {
        artifactHash = await sha256ReconstructLlmDispatchFailureArtifact(entryRef);
      }
    } catch {
      artifactHash = null;
    }
    try {
      artifact = await readReconstructLlmDispatchFailureArtifact(entryRef);
    } catch {
      artifact = null;
    }
    const ownerAttemptId = artifact &&
        artifact.session_id === runControl.session_id &&
        runControl.attempt_rows.some((row) =>
          row.attempt_id === artifact.owner_attempt_id
        )
      ? artifact.owner_attempt_id
      : [...runControl.attempt_rows].reverse().find((row) =>
          row.attempt_status === "running"
        )?.attempt_id ?? null;
    if (!ownerAttemptId || !artifactHash) continue;
    const transactionId = idFor("write", `${ownerAttemptId}:${entryRef}:orphan`);
    if (!runControl.write_transactions.some((row) =>
      row.transaction_id === transactionId
    )) {
      runControl.write_transactions.push({
        transaction_id: transactionId,
        owner_attempt_id: ownerAttemptId,
        artifact_ref: entryRef,
        temp_ref: null,
        expected_prior_hash: null,
        prepared_content_hash: artifactHash,
        committed_hash: null,
        commit_method: "append_only",
        transaction_status: "quarantined",
        recovery_ref: "blocked_partial_write",
      });
    }
    const abandonedAt = isoNow();
    runControl.attempt_rows = runControl.attempt_rows.map((row) =>
      row.attempt_id === ownerAttemptId && row.attempt_status === "running"
        ? { ...row, completed_at: abandonedAt, attempt_status: "abandoned" as const }
        : row
    );
    runControl.lock_rows = runControl.lock_rows.map((row) =>
      row.owner_attempt_id === ownerAttemptId && row.lock_status === "held"
        ? { ...row, lock_status: "released" as const }
        : row
    );
    if (!runControl.resume_rows.some((row) =>
      row.source_attempt_id === ownerAttemptId &&
      row.resume_decision === "blocked_partial_write"
    )) {
      runControl.resume_rows.push(blockedPartialWriteResumeRow({
        runControlPath,
        attemptId: ownerAttemptId,
        staleRefs: [entryRef],
      }));
    }
    changed = true;
  }
  for (const transaction of runControl.write_transactions) {
    if (
      transaction.transaction_status !== "prepared" ||
      !isReconstructLlmDispatchFailureRef(sessionRoot, transaction.artifact_ref)
    ) {
      continue;
    }
    try {
      const latestAttempt = runControl.attempt_rows.at(-1) ?? null;
      const ownerAttempt = runControl.attempt_rows.find((row) =>
        row.attempt_id === transaction.owner_attempt_id
      );
      const ownerLocks = runControl.lock_rows.filter((row) =>
        row.lock_scope === "session_root" &&
        row.owner_attempt_id === transaction.owner_attempt_id
      );
      if (
        latestAttempt?.attempt_id !== transaction.owner_attempt_id ||
        ownerAttempt?.attempt_status !== "running" ||
        ownerLocks.length !== 1 ||
        ownerLocks[0]?.lock_status !== "held"
      ) {
        throw new Error(
          "prepared failure transaction is not owned by the latest running attempt and its unique held lock",
        );
      }
      if (
        transaction.temp_ref &&
        !isReconstructLlmDispatchFailureTempRef(
          sessionRoot,
          transaction.temp_ref,
        )
      ) {
        throw new Error("prepared failure transaction temp ref escapes failure directory");
      }
      const finalExists = await pathExists(transaction.artifact_ref);
      const tempExists = await pathExists(transaction.temp_ref);
      if (!finalExists) {
        if (!tempExists) {
          if (Date.parse(ownerLocks[0].lease_expires_at) > Date.now()) {
            continue;
          }
          throw new Error("prepared failure transaction has neither temp nor final artifact");
        }
        await validatePreparedFailureArtifact({
          sessionRoot,
          artifactRef: transaction.temp_ref!,
          sessionId: runControl.session_id,
          ownerAttemptId: transaction.owner_attempt_id,
          preparedContentHash: transaction.prepared_content_hash,
        });
        await publishReconstructLlmDispatchFailureTemp({
          sessionRoot,
          tempRef: transaction.temp_ref!,
          finalRef: transaction.artifact_ref,
        });
      }
      const validated = await validatePreparedFailureArtifact({
        sessionRoot,
        artifactRef: transaction.artifact_ref,
        sessionId: runControl.session_id,
        ownerAttemptId: transaction.owner_attempt_id,
        preparedContentHash: transaction.prepared_content_hash,
      });
      if (await pathExists(transaction.temp_ref)) {
        await removeFailureTempFile(sessionRoot, transaction.temp_ref!);
      }
      transaction.temp_ref = null;
      transaction.committed_hash = validated.hash;
      transaction.transaction_status = "committed";
      const completedAt = isoNow();
      runControl.attempt_rows = runControl.attempt_rows.map((row) =>
        row.attempt_id === transaction.owner_attempt_id &&
            row.attempt_status === "running"
          ? { ...row, completed_at: completedAt, attempt_status: "failed" as const }
          : row
      );
      runControl.lock_rows = runControl.lock_rows.map((row) =>
        row.owner_attempt_id === transaction.owner_attempt_id &&
            row.lock_status === "held"
          ? { ...row, lock_status: "released" as const }
          : row
      );
      changed = true;
    } catch {
      const staleRefs = [transaction.artifact_ref, transaction.temp_ref]
        .filter((ref): ref is string => Boolean(ref));
      transaction.transaction_status = "quarantined";
      transaction.recovery_ref = "blocked_partial_write";
      const abandonedAt = isoNow();
      runControl.attempt_rows = runControl.attempt_rows.map((row) =>
        row.attempt_id === transaction.owner_attempt_id &&
            row.attempt_status === "running"
          ? { ...row, completed_at: abandonedAt, attempt_status: "abandoned" as const }
          : row
      );
      runControl.lock_rows = runControl.lock_rows.map((row) =>
        row.owner_attempt_id === transaction.owner_attempt_id &&
            row.lock_status === "held"
          ? { ...row, lock_status: "released" as const }
          : row
      );
      if (!runControl.resume_rows.some((row) =>
        row.source_attempt_id === transaction.owner_attempt_id &&
        row.resume_decision === "blocked_partial_write"
      )) {
        runControl.resume_rows.push(blockedPartialWriteResumeRow({
          runControlPath,
          attemptId: transaction.owner_attempt_id,
          staleRefs,
        }));
      }
      changed = true;
    }
  }

  if (changed) {
    runControl.updated_at = isoNow();
    await writeRunControlDocument(runControlPath, runControl);
  }
  const latestAttempt = runControl.attempt_rows.at(-1) ?? null;
  const validation = changed || latestAttempt?.attempt_status === "failed"
    ? await writeReconstructRunControlValidationArtifact({
        runControlPath,
        outputPath: validationOutputPath,
        expectedSessionId: runControl.session_id,
        expectedSessionRoot: sessionRoot,
      })
    : null;
  return { runControl, validation };
}

export async function reconcileReconstructLlmDispatchFailures(
  args: Parameters<typeof reconcileReconstructLlmDispatchFailuresUnlocked>[0],
) {
  const sessionRoot = path.resolve(args.sessionRoot);
  const runControlPath = path.resolve(
    args.runControlPath ?? path.join(sessionRoot, "reconstruct-run-control.yaml"),
  );
  const validationOutputPath = path.resolve(
    args.validationOutputPath ??
      path.join(sessionRoot, "reconstruct-run-control-validation.yaml"),
  );
  let snapshot: ReconstructRunControlArtifact;
  try {
    snapshot = await readYamlDocument<ReconstructRunControlArtifact>(runControlPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  if (
    path.resolve(snapshot.session_root) !== sessionRoot ||
    snapshot.session_id !== path.basename(sessionRoot) ||
    runControlPath !== path.join(sessionRoot, "reconstruct-run-control.yaml") ||
    validationOutputPath !==
      path.join(sessionRoot, "reconstruct-run-control-validation.yaml")
  ) {
    throw new Error("reconstruct failure reconciliation session identity mismatch");
  }
  const failureDirectory = path.join(
    sessionRoot,
    RECONSTRUCT_LLM_DISPATCH_FAILURE_DIR,
  );
  const failureDirectoryStat = await fs.lstat(failureDirectory)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
  if (
    failureDirectoryStat &&
    (!failureDirectoryStat.isDirectory() || failureDirectoryStat.isSymbolicLink())
  ) {
    throw new Error(
      `LLM dispatch failure directory is not a real directory: ${failureDirectory}`,
    );
  }
  if (failureDirectoryStat) {
    const [realSessionRoot, realFailureDirectory] = await Promise.all([
      fs.realpath(sessionRoot),
      fs.realpath(failureDirectory),
    ]);
    if (path.dirname(realFailureDirectory) !== realSessionRoot) {
      throw new Error(
        `LLM dispatch failure directory escapes session root: ${realFailureDirectory}`,
      );
    }
  }
  const failureEntries = failureDirectoryStat
    ? await fs.readdir(failureDirectory, { withFileTypes: true })
    : [];
  const trackedFinalRefs = new Set(
    snapshot.write_transactions
      .filter((row) =>
        isReconstructLlmDispatchFailureRef(sessionRoot, row.artifact_ref)
      )
      .map((row) => path.resolve(row.artifact_ref)),
  );
  const needsMutation = snapshot.write_transactions.some((row) =>
    row.transaction_status === "prepared" &&
    isReconstructLlmDispatchFailureRef(sessionRoot, row.artifact_ref)
  ) || failureEntries.some((entry) => {
    const entryRef = path.join(failureDirectory, entry.name);
    return entry.name.startsWith(".scratch-") ||
      entry.name.startsWith(".pending-") ||
      (entry.name.startsWith("failure-") &&
        path.extname(entry.name) === ".yaml" &&
        !trackedFinalRefs.has(path.resolve(entryRef)));
  });
  const latestAttempt = snapshot.attempt_rows.at(-1) ?? null;
  let persistedValidation: ReconstructRunControlValidationArtifact | null = null;
  if (latestAttempt?.attempt_status === "failed") {
    try {
      const raw = await readYamlDocumentIfPresent<unknown>(validationOutputPath);
      if (
        raw !== null &&
        comparableRunControlValidation(raw, { stripInMemoryFields: false }) !== null
      ) {
        persistedValidation = raw as ReconstructRunControlValidationArtifact;
      }
    } catch {
      persistedValidation = null;
    }
  }
  const expectedValidation = latestAttempt?.attempt_status === "failed"
    ? await buildReconstructRunControlValidationArtifactFromRunControl({
        runControl: snapshot,
        runControlPath,
        expectedSessionId: snapshot.session_id,
        expectedSessionRoot: sessionRoot,
      })
    : null;
  const persistedComparable = comparableRunControlValidation(
    persistedValidation,
    { stripInMemoryFields: false },
  );
  const expectedComparable = comparableRunControlValidation(
    expectedValidation,
    { stripInMemoryFields: true },
  );
  const validationIsCurrent = persistedComparable !== null &&
    expectedComparable !== null &&
    persistedComparable === expectedComparable;
  if (!needsMutation && latestAttempt?.attempt_status !== "failed") {
    return { runControl: snapshot, validation: null };
  }
  if (!needsMutation && validationIsCurrent) {
    return { runControl: snapshot, validation: persistedValidation };
  }
  return withRunControlMutationLock(
    runControlPath,
    () => reconcileReconstructLlmDispatchFailuresUnlocked(args),
  );
}

function artifactRefsForTransactions(
  artifactRefs: ReconstructRecordArtifactRefs,
  extraRefs: Array<string | null | undefined>,
): string[] {
  return [...new Set([
    ...Object.values(artifactRefs),
    ...extraRefs,
  ].filter((ref): ref is string => typeof ref === "string" && ref.length > 0))]
    .sort();
}

async function appendWriteTransactions(args: {
  runControl: ReconstructRunControlArtifact;
  attemptId: string;
  refs: string[];
}): Promise<void> {
  const existingTransactionIds = new Set(
    args.runControl.write_transactions.map((row) => row.transaction_id),
  );
  for (const artifactRef of args.refs) {
    const hash = await sha256File(artifactRef);
    if (hash === null) continue;
    const transactionId = idFor("write", `${args.attemptId}:${artifactRef}`);
    if (existingTransactionIds.has(transactionId)) continue;
    args.runControl.write_transactions.push({
      transaction_id: transactionId,
      owner_attempt_id: args.attemptId,
      artifact_ref: artifactRef,
      temp_ref: null,
      expected_prior_hash: null,
      committed_hash: hash,
      commit_method: "observed_file_hash",
      transaction_status: "committed",
      recovery_ref: null,
    });
    existingTransactionIds.add(transactionId);
  }
}

async function recordReconstructRunControlTransactionsUnlocked(args: {
  runControlPath: string;
  validationOutputPath: string;
  attemptId: string;
  artifactRefs: string[];
  expectedSessionId: string;
  expectedSessionRoot: string;
  expectedCommittedArtifactRefs?: string[];
}): Promise<{
  runControl: ReconstructRunControlArtifact;
  validation: ReconstructRunControlValidationArtifact;
}> {
  const runControl = await readYamlDocument<ReconstructRunControlArtifact>(
    args.runControlPath,
  );
  const attempt = runControl.attempt_rows.find((row) =>
    row.attempt_id === args.attemptId
  );
  if (!attempt || attempt.attempt_status !== "running") {
    throw new Error(
      `reconstruct run-control attempt ${args.attemptId} is not running; cannot record pre-publication transactions`,
    );
  }
  const heldLock = runControl.lock_rows.some((row) =>
    row.owner_attempt_id === args.attemptId &&
    row.lock_scope === "session_root" &&
    row.lock_status === "held"
  );
  if (!heldLock) {
    throw new Error(
      `reconstruct run-control attempt ${args.attemptId} does not hold the session_root lock`,
    );
  }
  runControl.updated_at = isoNow();
  await appendWriteTransactions({
    runControl,
    attemptId: args.attemptId,
    refs: [...new Set(args.artifactRefs)].sort(),
  });
  await writeRunControlDocument(args.runControlPath, runControl);
  const validation = await writeReconstructRunControlValidationArtifact({
    runControlPath: args.runControlPath,
    outputPath: args.validationOutputPath,
    expectedSessionId: args.expectedSessionId,
    expectedSessionRoot: args.expectedSessionRoot,
    ...(args.expectedCommittedArtifactRefs !== undefined
      ? { expectedCommittedArtifactRefs: args.expectedCommittedArtifactRefs }
      : {}),
  });
  return { runControl, validation };
}

export async function recordReconstructRunControlTransactions(
  args: Parameters<typeof recordReconstructRunControlTransactionsUnlocked>[0],
) {
  return withRunControlMutationLock(
    args.runControlPath,
    () => recordReconstructRunControlTransactionsUnlocked(args),
  );
}

async function finalizeReconstructRunControlUnlocked(args: {
  runControlPath: string;
  validationOutputPath: string;
  attemptId: string;
  artifactRefs: ReconstructRecordArtifactRefs;
  /**
   * The terminal run-manifest validation authority (design §16.6). Required for BOTH a normal
   * completion (post-publication manifest validation) and a graceful-terminal halt (the
   * assembled-terminal manifest validation, §16.5-(5)) — both are the run's terminal validation,
   * hence the shared name.
   */
  terminalRunManifestValidationPath: string;
  /**
   * How the attempt reached its terminal state. `"completed"` (default) = normal end of pipeline —
   * byte-identical to before. `"halted"` = a graceful terminal (design §16.6): the run stopped
   * early but still produced a valid terminal manifest validation.
   */
  attemptStatus?: "completed" | "halted";
  extraArtifactRefs?: Array<string | null | undefined>;
  expectedSessionId: string;
  expectedSessionRoot: string;
}): Promise<{
  runControl: ReconstructRunControlArtifact;
  validation: ReconstructRunControlValidationArtifact;
}> {
  const attemptStatus = args.attemptStatus ?? "completed";
  const terminalValidationStatus = await readValidationStatusIfPresent(
    args.terminalRunManifestValidationPath,
  );
  if (terminalValidationStatus !== "valid") {
    throw new Error(
      [
        "reconstruct run-control cannot finalize without valid terminal run-manifest validation.",
        `terminal_validation_ref=${args.terminalRunManifestValidationPath}`,
        `attempt_status=${attemptStatus}`,
        `validation_status=${terminalValidationStatus ?? "missing"}`,
      ].join(" "),
    );
  }
  const runControl = await readYamlDocument<ReconstructRunControlArtifact>(
    args.runControlPath,
  );
  if (runControl.resume_rows.some((row) =>
    row.source_attempt_id === args.attemptId &&
    row.resume_decision === "blocked_partial_write"
  )) {
    throw new Error(
      "reconstruct run-control cannot finalize a blocked_partial_write attempt",
    );
  }
  const activeAttempt = runControl.attempt_rows.find((row) =>
    row.attempt_id === args.attemptId
  );
  const activeOwnerLocks = runControl.lock_rows.filter((row) =>
    row.lock_scope === "session_root" &&
    row.owner_attempt_id === args.attemptId &&
    row.lock_status === "held"
  );
  if (activeAttempt?.attempt_status !== "running" || activeOwnerLocks.length !== 1) {
    throw new Error(
      `reconstruct run-control finalize requires the exact running owner: ${args.attemptId}`,
    );
  }
  if (activeAttempt.attempt_kind === "resume" && activeAttempt.trigger_ref) {
    const resume = runControl.resume_rows.find((row) =>
      row.resume_id === activeAttempt.trigger_ref
    );
    if (!resume || resume.resume_decision !== "resume_pending_provenance") {
      throw new Error("reconstruct resume is not pending trusted provenance");
    }
    for (const failureRef of resume.required_revalidation_refs.filter((ref) =>
      isReconstructLlmDispatchFailureRef(runControl.session_root, ref)
    )) {
      const sourceTransaction = runControl.write_transactions.find((row) =>
        row.owner_attempt_id === resume.source_attempt_id &&
        path.resolve(row.artifact_ref) === path.resolve(failureRef) &&
        row.transaction_status === "committed" &&
        row.committed_hash !== null
      );
      const failureRead = sourceTransaction
        ? await readReconstructLlmDispatchFailureArtifactWithHash({
            sessionRoot: runControl.session_root,
            artifactRef: failureRef,
          })
        : null;
      if (!sourceTransaction || failureRead?.sha256 !== sourceTransaction.committed_hash) {
        throw new Error(
          `reconstruct resume failure provenance changed before finalize: ${failureRef}`,
        );
      }
    }
  }
  const completedAt = isoNow();
  runControl.updated_at = completedAt;
  runControl.attempt_rows = runControl.attempt_rows.map((row) =>
    row.attempt_id === args.attemptId
      ? { ...row, completed_at: completedAt, attempt_status: attemptStatus }
      : row
  );
  const completedAttempt = runControl.attempt_rows.find((row) =>
    row.attempt_id === args.attemptId
  );
  if (completedAttempt?.attempt_kind === "resume" && completedAttempt.trigger_ref) {
    runControl.resume_rows = runControl.resume_rows.map((row) =>
      row.resume_id === completedAttempt.trigger_ref &&
          row.resume_decision === "resume_pending_provenance"
        ? { ...row, resume_decision: "resume_allowed" }
        : row
    );
  }
  runControl.lock_rows = runControl.lock_rows.map((row) =>
    row.owner_attempt_id === args.attemptId && row.lock_status === "held"
      ? { ...row, lock_status: "released" }
      : row
  );
  const refs = artifactRefsForTransactions(
    args.artifactRefs,
    [
      ...(args.extraArtifactRefs ?? []),
      args.terminalRunManifestValidationPath,
    ],
  );
  await appendWriteTransactions({
    runControl,
    attemptId: args.attemptId,
    refs,
  });
  await writeRunControlDocument(args.runControlPath, runControl);
  const validation = await writeReconstructRunControlValidationArtifact({
    runControlPath: args.runControlPath,
    outputPath: args.validationOutputPath,
    expectedSessionId: args.expectedSessionId,
    expectedSessionRoot: args.expectedSessionRoot,
    terminalValidationRef: args.terminalRunManifestValidationPath,
  });
  return { runControl, validation };
}

export async function finalizeReconstructRunControl(
  args: Parameters<typeof finalizeReconstructRunControlUnlocked>[0],
) {
  return withRunControlMutationLock(
    args.runControlPath,
    () => finalizeReconstructRunControlUnlocked(args),
  );
}
