import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { atomicWriteYamlDocument as writeYamlDocument } from "../artifact-io.js";
import type {
  ReconstructRecordArtifactRefs,
  ReconstructRunBootstrapDiagnosticArtifact,
  ReconstructRunControlArtifact,
  ReconstructRunControlValidationArtifact,
  ReconstructRunControlValidationViolation,
} from "./artifact-types.js";

function isoNow(): string {
  return new Date().toISOString();
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
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
  await fs.writeFile(tempPath, stringifyYaml(value), "utf8");
  try {
    await fs.link(tempPath, filePath);
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
  return runControl.attempt_rows.some((row) =>
    row.attempt_status === "completed"
  ) || runControl.resume_rows.some((row) =>
    row.resume_decision === "resume_allowed"
  );
}

function inferTerminalValidationRef(args: {
  runControl: ReconstructRunControlArtifact;
  runControlPath: string | null;
  explicitRef?: string | null;
}): string | null {
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
}): ReconstructRunControlValidationArtifact {
  const violations: ReconstructRunControlValidationViolation[] = [];
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
  const currentAttempt = [...args.runControl.attempt_rows]
    .reverse()
    .find((row) =>
      row.attempt_status === "running" ||
      row.attempt_status === "completed" ||
      row.attempt_status === "recovered"
    ) ?? null;
  if (!currentAttempt) {
    violations.push(violation({
      code: "active_attempt_missing",
      message: "run-control must have a running, completed, or recovered attempt",
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
          "completed attempts and resume_allowed rows require post-publication terminal validation authority",
      }));
    } else {
      if (args.terminalValidationStatus !== "valid") {
        violations.push(violation({
          code: args.terminalValidationStatus === null
            ? "terminal_validation_missing"
            : "terminal_validation_invalid",
          message:
            "post-publication terminal validation must exist and have validation_status=valid before completion or resume_allowed",
          subjectId: terminalValidationRef,
        }));
      }
      if (!committedRefs.has(path.resolve(terminalValidationRef))) {
        violations.push(violation({
          code: "expected_transaction_missing",
          message:
            "run-control validation is missing a committed hash transaction for the post-publication terminal validation artifact",
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
    violations,
  };
}

export async function writeReconstructRunControlValidationArtifact(args: {
  runControlPath: string;
  outputPath: string;
  expectedSessionId?: string | null;
  expectedSessionRoot?: string | null;
  expectedCommittedArtifactRefs?: string[];
  terminalValidationRef?: string | null;
}): Promise<ReconstructRunControlValidationArtifact> {
  const runControl = await readYamlDocument<ReconstructRunControlArtifact>(
    args.runControlPath,
  );
  const terminalValidationRef = inferTerminalValidationRef({
    runControl,
    runControlPath: args.runControlPath,
    ...(args.terminalValidationRef !== undefined
      ? { explicitRef: args.terminalValidationRef }
      : {}),
  });
  const terminalValidationStatus =
    await readValidationStatusIfPresent(terminalValidationRef);
  const validation = validateReconstructRunControl({
    runControl,
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
  });
  await writeYamlDocument(args.outputPath, validation);
  return validation;
}

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

export async function initializeReconstructRunControl(args: {
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
}): Promise<{
  runControl: ReconstructRunControlArtifact;
  validation: ReconstructRunControlValidationArtifact;
  requestFingerprint: string;
  attemptId: string;
}> {
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
        const resumeId = idFor("resume", `${requestFingerprint}:${now}`);
        const attemptId = idFor("attempt", `${resumeId}:attempt`);
        const trustedArtifactRefs = existing.write_transactions
          .filter((row) =>
            row.transaction_status === "committed" &&
            row.committed_hash !== null
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
        await writeYamlDocument(args.outputPath, existing);
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
    return initializeReconstructRunControl(args);
  }
  const validation = await writeReconstructRunControlValidationArtifact({
    runControlPath: args.outputPath,
    outputPath: args.validationOutputPath,
    expectedSessionId: args.sessionId,
    expectedSessionRoot: args.sessionRoot,
  });
  return { runControl, validation, requestFingerprint, attemptId };
}

export async function markReconstructRunControlAttemptFailed(args: {
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
    await writeYamlDocument(args.runControlPath, runControl);
  }
  const validation = await writeReconstructRunControlValidationArtifact({
    runControlPath: args.runControlPath,
    outputPath: args.validationOutputPath,
    expectedSessionId: args.expectedSessionId,
    expectedSessionRoot: args.expectedSessionRoot,
  });
  return { runControl, validation };
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

export async function recordReconstructRunControlTransactions(args: {
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
  await writeYamlDocument(args.runControlPath, runControl);
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

export async function finalizeReconstructRunControl(args: {
  runControlPath: string;
  validationOutputPath: string;
  attemptId: string;
  artifactRefs: ReconstructRecordArtifactRefs;
  postPublicationRunManifestValidationPath: string;
  extraArtifactRefs?: Array<string | null | undefined>;
  expectedSessionId: string;
  expectedSessionRoot: string;
}): Promise<{
  runControl: ReconstructRunControlArtifact;
  validation: ReconstructRunControlValidationArtifact;
}> {
  const terminalValidationStatus = await readValidationStatusIfPresent(
    args.postPublicationRunManifestValidationPath,
  );
  if (terminalValidationStatus !== "valid") {
    throw new Error(
      [
        "reconstruct run-control cannot finalize without valid post-publication terminal validation.",
        `terminal_validation_ref=${args.postPublicationRunManifestValidationPath}`,
        `validation_status=${terminalValidationStatus ?? "missing"}`,
      ].join(" "),
    );
  }
  const runControl = await readYamlDocument<ReconstructRunControlArtifact>(
    args.runControlPath,
  );
  const completedAt = isoNow();
  runControl.updated_at = completedAt;
  runControl.attempt_rows = runControl.attempt_rows.map((row) =>
    row.attempt_id === args.attemptId
      ? { ...row, completed_at: completedAt, attempt_status: "completed" }
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
      args.postPublicationRunManifestValidationPath,
    ],
  );
  await appendWriteTransactions({
    runControl,
    attemptId: args.attemptId,
    refs,
  });
  await writeYamlDocument(args.runControlPath, runControl);
  const validation = await writeReconstructRunControlValidationArtifact({
    runControlPath: args.runControlPath,
    outputPath: args.validationOutputPath,
    expectedSessionId: args.expectedSessionId,
    expectedSessionRoot: args.expectedSessionRoot,
    terminalValidationRef: args.postPublicationRunManifestValidationPath,
  });
  return { runControl, validation };
}
