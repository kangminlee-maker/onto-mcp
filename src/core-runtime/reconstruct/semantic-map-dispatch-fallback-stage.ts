import fs from "node:fs/promises";
import path from "node:path";
import {
  DispatchBreakerTrippedError,
  dispatchIncompleteArtifactPath,
  isDispatchIncompleteArtifact,
} from "../llm/dispatch-breaker.js";
import type {
  DispatchBreakerPolicy,
  DispatchIncompleteArtifact,
} from "../llm/dispatch-breaker.js";
import type { ResolvedLlmDispatchCapability } from "../llm/sealed-dispatch-capability.js";
import type { StructuredDispatchFailureEvidence } from "../llm/structured-dispatch-error.js";
import type {
  ReconstructSemanticMapCensus,
  ReconstructSemanticMapSidecar,
  ReconstructSourceObservationsArtifact,
} from "./artifact-types.js";
import type { ReconstructDirectiveAuthor } from "./directive-author-contract.js";
import {
  assertDispatchFallbackAttemptOwner,
  assertDispatchFallbackTerminalArtifactContracts,
  publishDispatchFallbackActivation,
  publishDispatchFallbackOutcome,
  securePublishDispatchFallbackYaml,
} from "./dispatch-fallback-artifacts.js";
import type {
  DispatchFallbackActivation,
  DispatchFallbackOutcome,
} from "./dispatch-fallback-artifacts.js";
import { isGracefulTerminalSignal } from "./graceful-terminal.js";
import { readReconstructLlmDispatchFailureError } from "./llm-dispatch-failure.js";
import type {
  ReconstructDispatchFallbackRuntime,
  RunReconstructParams,
} from "./run-contract.js";
import { recordReconstructRunControlTransactions } from "./run-control-validation.js";
import { isoNow, sha256Text, stableJson } from "./run-primitives.js";
import {
  prepareSemanticMapResumeContext,
  readYamlDocument,
  semanticMapCensusPath,
  semanticMapSidecarPath,
} from "./semantic-map-resume.js";
import {
  DEFAULT_SEMANTIC_MAP_STAGE_CONFIG,
  deriveSemanticMapFallbackPriorDispatchSpend,
  runSemanticMapStage,
  semanticMapEligibleObservations,
} from "./semantic-map-stage.js";
import type {
  SemanticMapPreImageBase,
  SemanticMapRecoveryContext,
  SemanticMapStageResult,
} from "./semantic-map-stage.js";
import { assertRuntimeValidationValid } from "./source-admission-selection-stage.js";

// ─────────────────────────────────────────────────────────────────────────────
// semantic-map-dispatch-fallback-stage — semantic-map 스테이지 실행 + **cross-provider dispatch
// fallback 복구**. 1차 실행이 rate_limit로 브레이커를 트립시키면 세션 락 소유권을 재확인하고
// 활성화 아티팩트를 발행한 뒤, 정확히 같은 미완 파티션을 대체 provider로 재실행한다.
//
// 왜 `semantic-map-stage.ts`가 아닌가: 이 블록은 `prepareSemanticMapResumeContext`를 부르는데
// `semantic-map-resume.ts`가 이미 `semantic-map-stage.ts`를 import한다 → 합치면 두 모듈 사이에
// **새 import 순환**이 생긴다(실측). 성격도 다르다 — `semantic-map-stage.ts`는 관측당 synthesize/verify
// 라우팅이고 run-control·fallback 아티팩트와 접점이 0회다(실측). 왜 `dispatch-fallback-artifacts.ts`
// 도 아닌가: 그 모듈은 fallback 아티팩트의 **스키마·발행·검증 어휘**이고 LLM 스테이지를 실행하지
// 않는다. 오케스트레이션(FS·LLM·아티팩트 쓰기)은 `*-stage` 전례를 따른다.
//
// 본문은 runReconstruct에서 **원문 그대로** 옮겨온 블록이다(분해 설계 20260726 Tier 1-4).
// 기준본과 바이트 동일함을 `scripts/run-block-identity.mts`가 검사한다 — 파라미터를 원래 지역
// 변수 이름으로 구조분해하고, 원래 바깥 `let`이었던 `semanticMapStage`를 같은 이름의 지역 `let`
// 으로 두는 것도 그 동일성을 지키기 위해서다. 그 두 줄과 마지막 return은 검사기에 prefix/suffix로
// **선언**돼 있고, 선언하지 않은 코드가 끼면 FAIL한다.
//
// `annotateDispatchFallbackCensus`가 함께 온 이유: 유일한 호출부가 이 블록 안이다. run.ts에
// 남겨두면 이 모듈이 run.ts를 import해야 하고, 그게 곧 순환이다.
// ─────────────────────────────────────────────────────────────────────────────

function annotateDispatchFallbackCensus(args: {
  census: ReconstructSemanticMapCensus;
  runtime: ReconstructDispatchFallbackRuntime;
  primaryCensus: ReconstructSemanticMapCensus;
}): void {
  const entries = args.runtime.accounting.entries();
  args.census.dispatch_execution_profiles = {
    primary: {
      synthesize_descriptor_id:
        args.runtime.primary.synthesize?.public_descriptor.descriptor_id ?? null,
      verify_descriptor_id:
        args.runtime.primary.verify?.public_descriptor.descriptor_id ?? null,
    },
    fallback: {
      synthesize_descriptor_id:
        args.runtime.fallback.synthesize.public_descriptor.descriptor_id,
      verify_descriptor_id:
        args.runtime.fallback.verify.public_descriptor.descriptor_id,
    },
  };
  const fallbackEntries = entries.filter(
    (entry) => entry.execution_source === "fallback",
  );
  const count = (
    operation: "semantic_map_synthesize" | "semantic_map_verify",
    projection: "logical" | "requests",
  ): number =>
    fallbackEntries
      .filter((entry) => entry.operation === operation)
      .reduce(
        (sum, entry) =>
          sum +
          (projection === "logical"
            ? 1
            : entry.actual_adapter_request_count),
        0,
      );
  args.census.fallback_synthesize_logical_calls = count(
    "semantic_map_synthesize",
    "logical",
  );
  args.census.fallback_verify_logical_calls = count(
    "semantic_map_verify",
    "logical",
  );
  args.census.fallback_synthesize_adapter_requests = count(
    "semantic_map_synthesize",
    "requests",
  );
  args.census.fallback_verify_adapter_requests = count(
    "semantic_map_verify",
    "requests",
  );
  for (const row of args.census.by_observation) {
    const rowEntries = entries.filter(
      (entry) => entry.observation_id === row.observation_id,
    );
    const fallback = rowEntries.filter(
      (entry) => entry.execution_source === "fallback",
    );
    const primary = rowEntries.filter(
      (entry) => entry.execution_source === "primary",
    );
    const primaryCensusRow = args.primaryCensus.by_observation.find(
      (candidate) => candidate.observation_id === row.observation_id,
    );
    const primaryLogicalCalls = (
      operation: "synthesize" | "verify",
    ): number =>
      primaryCensusRow?.columns.reduce(
        (sum, column) =>
          sum +
          (operation === "synthesize"
            ? column.synthesize_calls
            : column.verify_calls),
        0,
      ) ?? 0;
    row.dispatch_execution_source =
      fallback.length > 0 ? "fallback" : primary.length > 0 ? "primary" : null;
    row.discarded_primary_synthesize_logical_calls =
      fallback.length > 0
        ? primaryLogicalCalls("synthesize")
        : 0;
    row.discarded_primary_verify_logical_calls =
      fallback.length > 0
        ? primaryLogicalCalls("verify")
        : 0;
    row.primary_synthesize_adapter_requests = primary
      .filter((entry) => entry.operation === "semantic_map_synthesize")
      .reduce((sum, entry) => sum + entry.actual_adapter_request_count, 0);
    row.primary_verify_adapter_requests = primary
      .filter((entry) => entry.operation === "semantic_map_verify")
      .reduce((sum, entry) => sum + entry.actual_adapter_request_count, 0);
  }
  const mixedIdentity = (
    descriptorIds: readonly string[],
  ): string => {
    const distinct = [...new Set(descriptorIds)].sort();
    return distinct.length === 1
      ? distinct[0]!
      : `mixed:${sha256Text(stableJson(distinct))}`;
  };
  args.census.synthesize_model_identity = mixedIdentity([
    args.runtime.primary.synthesize?.public_descriptor.descriptor_id ??
      args.census.synthesize_model_identity,
    args.runtime.fallback.synthesize.public_descriptor.descriptor_id,
  ]);
  args.census.verify_model_identity = mixedIdentity([
    args.runtime.primary.verify?.public_descriptor.descriptor_id ??
      args.census.verify_model_identity,
    args.runtime.fallback.verify.public_descriptor.descriptor_id,
  ]);
}

/**
 * semantic-map 스테이지를 실행하고, rate_limit 브레이커 트립 시 **정확히 같은 미완 파티션**에
 * 한해 cross-provider fallback으로 재실행한다. fallback 발동 조건(설정 opt-in · 타입 있는
 * rate_limit · 대체 provider가 실제로 다른 provider · 파티션이 계획 집합을 정확히 덮음)이 하나라도
 * 어긋나면 원래 오류를 그대로 다시 던진다 — 이 스테이지는 복구를 **추정하지 않는다**.
 *
 * `dispatchFallbackCompletion`은 호출부가 소유하는 객체를 **참조로** 받아 속성만 채운다(값 복사로
 * 바꾸면 호출부가 outcome을 보지 못해 등가가 깨진다). 반환값은 1차 또는 fallback 실행의 스테이지
 * 결과다.
 */
export async function runSemanticMapStageWithDispatchFallback(args: {
  directiveAuthor: ReconstructDirectiveAuthor;
  dispatchFallbackCompletion: {
    outcome: DispatchFallbackOutcome | null;
    integrity: { path: string; sha256: string } | null;
  };
  filesystemAllowedRoots: readonly string[];
  params: RunReconstructParams;
  projectRoot: string;
  runControlPath: string;
  runControlState: { attemptId: string };
  runControlValidationPath: string;
  semanticMapCodeEligible: boolean;
  semanticMapCodePreImageBase: SemanticMapPreImageBase;
  semanticMapPreImageBase: SemanticMapPreImageBase;
  semanticMapRecoveryContext: SemanticMapRecoveryContext | null;
  semanticMapVerifyModelIdentity: string;
  sessionId: string;
  sessionRoot: string;
  sourceObservations: ReconstructSourceObservationsArtifact;
}): Promise<SemanticMapStageResult> {
  const { directiveAuthor, dispatchFallbackCompletion, filesystemAllowedRoots, params, projectRoot, runControlPath, runControlState, runControlValidationPath, semanticMapCodeEligible, semanticMapCodePreImageBase, semanticMapPreImageBase, semanticMapRecoveryContext, semanticMapVerifyModelIdentity, sessionId, sessionRoot, sourceObservations } = args;
  let semanticMapStage: SemanticMapStageResult;
  try {
    semanticMapStage = await runSemanticMapStage({
      sourceObservations,
      directiveAuthor,
      sessionRoot,
      config: DEFAULT_SEMANTIC_MAP_STAGE_CONFIG,
      ...(params.dispatchBreaker !== undefined
        ? { dispatchBreaker: params.dispatchBreaker }
        : {}),
      preImageBase: semanticMapPreImageBase,
      codeKindOptIn: params.semanticMapCode === true,
      codePreImageBase: semanticMapCodePreImageBase,
      verifyModelIdentity: semanticMapVerifyModelIdentity,
      recoveryContext: semanticMapRecoveryContext,
      executionSource: "primary",
      captureStructuredContributors:
        params.dispatchFallback?.enabled === true &&
        params.dispatchFallbackRuntime !== undefined,
    });
  } catch (error) {
    if (isGracefulTerminalSignal(error)) throw error;
    if (readReconstructLlmDispatchFailureError(error)) throw error;
    const fallbackSettings = params.dispatchFallback;
    const fallbackRuntime = params.dispatchFallbackRuntime;
    if (
      !(error instanceof DispatchBreakerTrippedError) ||
      fallbackSettings?.enabled !== true ||
      !fallbackRuntime ||
      params.resumeMode === "reuse_existing_authored_artifacts" ||
      error.trip.failure_class !== "rate_limit"
    ) {
      throw error;
    }

    const primaryCapabilities = [
      fallbackRuntime.primary.synthesize,
      fallbackRuntime.primary.verify,
    ].filter(
      (capability): capability is ResolvedLlmDispatchCapability =>
        capability !== undefined,
    );
    const structuredContributors = error.structuredContributors ?? [];
    const firstContributor = structuredContributors[0];
    const failingCapability = firstContributor
      ? primaryCapabilities.find(
          (capability) =>
            capability.public_descriptor.descriptor_id ===
              firstContributor.descriptor_id &&
            capability.capability_instance_id ===
              firstContributor.capability_instance_id,
        )
      : undefined;
    if (
      !firstContributor ||
      !failingCapability ||
      structuredContributors.length <
        error.trip.threshold ||
      structuredContributors.some(
        (contributor) =>
          contributor.failure_class !== "rate_limit" ||
          contributor.descriptor_id !== firstContributor.descriptor_id ||
          contributor.capability_instance_id !==
            firstContributor.capability_instance_id ||
          contributor.actual_adapter_request_count < 1,
      )
    ) {
      throw error;
    }
    if (
      failingCapability.public_descriptor.model_provider ===
      fallbackRuntime.fallback.synthesize.public_descriptor.model_provider
    ) {
      throw error;
    }

    const currentRunControl = await readYamlDocument<
      import("./artifact-types.js").ReconstructRunControlArtifact
    >(runControlPath);
    const ownerLock = currentRunControl.lock_rows.find(
      (row) =>
        row.lock_scope === "session_root" &&
        row.owner_attempt_id === runControlState.attemptId &&
        row.lock_status === "held",
    );
    if (!ownerLock) {
      throw new Error("dispatch fallback activation requires the originating held session lock.");
    }
    assertDispatchFallbackAttemptOwner({
      runControl: currentRunControl,
      attemptId: runControlState.attemptId,
      lockTokenHash: ownerLock.lock_token_hash,
      requireInitial: true,
    });
    const realSessionRoot = await fs.realpath(sessionRoot);
    const realAllowedRoots = await Promise.all(
      filesystemAllowedRoots.map((allowedRoot) => fs.realpath(allowedRoot)),
    );
    const sessionContained = realAllowedRoots.some((allowedRoot) => {
      const relative = path.relative(allowedRoot, realSessionRoot);
      return relative === "" ||
        (!relative.startsWith(`..${path.sep}`) && relative !== ".." &&
          !path.isAbsolute(relative));
    });
    if (!sessionContained) {
      throw new Error(
        `dispatch fallback session root is outside filesystem_allowed_roots: ${sessionRoot}`,
      );
    }

    const dispatchPath = dispatchIncompleteArtifactPath(sessionRoot);
    const primaryPartition = await readYamlDocument<DispatchIncompleteArtifact>(
      dispatchPath,
    );
    const primaryCensusSnapshot =
      await readYamlDocument<ReconstructSemanticMapCensus>(
        semanticMapCensusPath(sessionRoot),
      );
    if (
      !isDispatchIncompleteArtifact(primaryPartition) ||
      primaryPartition.pipeline !== "reconstruct" ||
      primaryPartition.batch_label !== "semantic-map" ||
      !primaryPartition.breaker.tripped
    ) {
      throw new Error("dispatch fallback activation requires a valid tripped semantic-map partition.");
    }
    const plannedIds = semanticMapEligibleObservations(sourceObservations, semanticMapCodeEligible).map(
      (observation) => observation.observation_id,
    );
    const deadLetterIds = primaryPartition.dead_letter.map(
      (entry) => entry.item_id,
    );
    const accountingEntries = fallbackRuntime.accounting.entries();
    const priorDispatchSpend = deriveSemanticMapFallbackPriorDispatchSpend({
      primaryCensus: primaryCensusSnapshot,
      incompleteItemIds: primaryPartition.incomplete_item_ids,
      accountingEntries,
      sealedOperations: {
        synthesize: fallbackRuntime.primary.synthesize !== undefined,
        verify: fallbackRuntime.primary.verify !== undefined,
      },
    });
    const partitionUnion = [
      ...primaryPartition.completed_item_ids,
      ...deadLetterIds,
      ...primaryPartition.incomplete_item_ids,
    ];
    if (
      new Set(partitionUnion).size !== partitionUnion.length ||
      new Set(partitionUnion).size !== plannedIds.length ||
      plannedIds.some((id) => !partitionUnion.includes(id))
    ) {
      throw new Error("dispatch fallback activation partition does not exactly cover planned observations.");
    }

    const exactRecoveryContext = await prepareSemanticMapResumeContext({
      sessionId,
      sessionRoot,
      attemptId: runControlState.attemptId,
      sourceObservations,
      resumeMode: "reuse_existing_authored_artifacts",
      ...(params.dispatchBreaker
        ? { dispatchBreaker: params.dispatchBreaker }
        : {}),
      semanticMapCapabilityPresent: true,
      preImageBase: semanticMapPreImageBase,
      // Retained rows were produced by the PRIMARY run — re-derive with the primary bases.
      codeEligible: semanticMapCodeEligible,
      codePreImageBase: semanticMapCodePreImageBase,
      verifyModelIdentity: semanticMapVerifyModelIdentity,
      config: DEFAULT_SEMANTIC_MAP_STAGE_CONFIG,
      labelRoot: projectRoot,
    });
    if (
      !exactRecoveryContext ||
      stableJson(exactRecoveryContext.incompleteItemIds.slice().sort()) !==
        stableJson(primaryPartition.incomplete_item_ids.slice().sort())
    ) {
      throw new Error("dispatch fallback exact recovery context does not match the activation partition.");
    }

    const activationContributors = structuredContributors.map(
      (contributor) => {
        const accounting = accountingEntries.find(
          (entry) =>
            entry.logical_dispatch_id === contributor.logical_dispatch_id,
        );
        if (
          !accounting ||
          accounting.execution_source !== "primary" ||
          accounting.descriptor_id !== contributor.descriptor_id ||
          accounting.capability_instance_id !==
            contributor.capability_instance_id ||
          accounting.failure_class !== "rate_limit"
        ) {
          throw new Error(
            `dispatch fallback contributor ${contributor.logical_dispatch_id} is absent from primary accounting.`,
          );
        }
        return {
          ...structuredClone(contributor),
          actual_adapter_request_count:
            accounting.actual_adapter_request_count,
          observation_id: accounting.observation_id,
          operation: accounting.operation,
        };
      },
    );
    const activation: DispatchFallbackActivation = {
      schema_version: "dispatch-fallback-activation/v1",
      session_id: sessionId,
      created_at: isoNow(),
      owner_attempt_id: runControlState.attemptId,
      owner_lock_token_hash: ownerLock.lock_token_hash,
      trigger: {
        failure_class: "rate_limit",
        systemic_failure_threshold:
          error.trip.threshold,
        contributors: activationContributors,
      },
      primary_descriptor: failingCapability.public_descriptor,
      primary_capability_instance_id:
        failingCapability.capability_instance_id,
      fallback_descriptors: {
        synthesize: fallbackRuntime.fallback.synthesize.public_descriptor,
        verify: fallbackRuntime.fallback.verify.public_descriptor,
      },
      partition: {
        planned: plannedIds,
        completed: [...primaryPartition.completed_item_ids],
        dead_letter: deadLetterIds,
        incomplete: [...primaryPartition.incomplete_item_ids],
      },
      route_relation: "cross_provider",
    };
    const activationIntegrity = await publishDispatchFallbackActivation(
      sessionRoot,
      activation,
    );
    const activationCheckpoint = await recordReconstructRunControlTransactions({
      runControlPath,
      validationOutputPath: runControlValidationPath,
      attemptId: runControlState.attemptId,
      artifactRefs: [activationIntegrity.path],
      expectedSessionId: sessionId,
      expectedSessionRoot: sessionRoot,
      expectedCommittedArtifactRefs: [activationIntegrity.path],
    });
    assertRuntimeValidationValid({
      artifactName: "dispatch-fallback-activation-checkpoint",
      artifactRef: runControlValidationPath,
      validation: activationCheckpoint.validation,
    });
    const assertActivationOwnerCheckpoint = (
      runControl: import("./artifact-types.js").ReconstructRunControlArtifact,
    ): void => {
      assertDispatchFallbackAttemptOwner({
        runControl,
        attemptId: runControlState.attemptId,
        lockTokenHash: ownerLock.lock_token_hash,
        requireInitial: true,
      });
      const transaction = runControl.write_transactions.find(
        (row) =>
          path.resolve(row.artifact_ref) ===
            path.resolve(activationIntegrity.path) &&
          row.owner_attempt_id === runControlState.attemptId &&
          row.transaction_status === "committed",
      );
      if (transaction?.committed_hash !== activationIntegrity.sha256) {
        throw new Error(
          "dispatch fallback activation checkpoint is missing the expected committed ref/hash.",
        );
      }
    };
    assertActivationOwnerCheckpoint(activationCheckpoint.runControl);

    const fallbackPreImageBase: SemanticMapPreImageBase = {
      ...semanticMapPreImageBase,
      reduce_reader_model_identity:
        fallbackRuntime.fallback.synthesize.public_descriptor.descriptor_id,
    };
    // Step 6 (DD6): the fallback CODE base — same identity substitution over the code base.
    const fallbackCodePreImageBase: SemanticMapPreImageBase = {
      ...semanticMapCodePreImageBase,
      reduce_reader_model_identity:
        fallbackRuntime.fallback.synthesize.public_descriptor.descriptor_id,
    };
    const fallbackBreaker: DispatchBreakerPolicy = {
      ...params.dispatchBreaker!,
      enabled: true,
      systemic_threshold: fallbackSettings.systemic_failure_threshold,
      per_call_max_attempts:
        fallbackSettings.per_dispatch_max_provider_attempts,
    };

    const publishTerminalFallback = async (
      status: "completed" | "halted",
      terminalFailure: StructuredDispatchFailureEvidence | null,
    ): Promise<{ path: string; sha256: string }> => {
      const finalPartition = await readYamlDocument<DispatchIncompleteArtifact>(
        dispatchPath,
      );
      const finalCensus = await readYamlDocument<ReconstructSemanticMapCensus>(
        semanticMapCensusPath(sessionRoot),
      );
      const finalSidecar = await readYamlDocument<ReconstructSemanticMapSidecar>(
        semanticMapSidecarPath(sessionRoot),
      );
      annotateDispatchFallbackCensus({
        census: finalCensus,
        runtime: fallbackRuntime,
        primaryCensus: primaryCensusSnapshot,
      });
      assertDispatchFallbackTerminalArtifactContracts({
        partition: finalPartition,
        census: finalCensus,
        sidecar: finalSidecar,
      });
      const [partitionIntegrity, censusIntegrity, sidecarIntegrity] =
        await Promise.all([
          securePublishDispatchFallbackYaml({
            sessionRoot,
            relativePath: "dispatch-incomplete.yaml",
            value: finalPartition,
          }),
          securePublishDispatchFallbackYaml({
            sessionRoot,
            relativePath: "comprehension/semantic-map-census.yaml",
            value: finalCensus,
          }),
          securePublishDispatchFallbackYaml({
            sessionRoot,
            relativePath: "comprehension/semantic-map.yaml",
            value: finalSidecar,
          }),
        ]);
      const targetSet = new Set(activation.partition.incomplete);
      const finalCompleted = finalPartition.completed_item_ids.filter((id) =>
        targetSet.has(id)
      ).length;
      const finalDeadLetter = finalPartition.dead_letter.filter((entry) =>
        targetSet.has(entry.item_id)
      ).length;
      const finalIncomplete = finalPartition.incomplete_item_ids.filter((id) =>
        targetSet.has(id)
      ).length;
      const fallbackEntries = fallbackRuntime.accounting
        .entries()
        .filter((entry) => entry.execution_source === "fallback");
      const countFallback = (
        operation: "semantic_map_synthesize" | "semantic_map_verify",
        requests: boolean,
      ): number =>
        fallbackEntries
          .filter((entry) => entry.operation === operation)
          .reduce(
            (sum, entry) =>
              sum + (requests ? entry.actual_adapter_request_count : 1),
            0,
          );
      const outcome: DispatchFallbackOutcome = {
        schema_version: "dispatch-fallback-outcome/v1",
        session_id: sessionId,
        created_at: isoNow(),
        owner_attempt_id: runControlState.attemptId,
        activation: {
          ref: activationIntegrity.path,
          sha256: activationIntegrity.sha256,
        },
        status,
        partition: {
          target_count: targetSet.size,
          completed_count: finalCompleted,
          dead_letter_count: finalDeadLetter,
          incomplete_count: finalIncomplete,
        },
        dispatch_counts: {
          synthesize_logical: countFallback(
            "semantic_map_synthesize",
            false,
          ),
          verify_logical: countFallback("semantic_map_verify", false),
          synthesize_adapter_requests: countFallback(
            "semantic_map_synthesize",
            true,
          ),
          verify_adapter_requests: countFallback(
            "semantic_map_verify",
            true,
          ),
        },
        final_artifacts: {
          dispatch_incomplete: {
            ref: partitionIntegrity.path,
            sha256: partitionIntegrity.sha256,
          },
          semantic_map_census: {
            ref: censusIntegrity.path,
            sha256: censusIntegrity.sha256,
          },
          semantic_map: {
            ref: sidecarIntegrity.path,
            sha256: sidecarIntegrity.sha256,
          },
        },
        terminal_failure: terminalFailure,
      };
      const outcomeIntegrity = await publishDispatchFallbackOutcome(
        sessionRoot,
        outcome,
      );
      const terminalCheckpoint = await recordReconstructRunControlTransactions({
        runControlPath,
        validationOutputPath: runControlValidationPath,
        attemptId: runControlState.attemptId,
        artifactRefs: [
          activationIntegrity.path,
          partitionIntegrity.path,
          censusIntegrity.path,
          sidecarIntegrity.path,
          outcomeIntegrity.path,
        ],
        expectedSessionId: sessionId,
        expectedSessionRoot: sessionRoot,
        expectedCommittedArtifactRefs: [
          activationIntegrity.path,
          partitionIntegrity.path,
          censusIntegrity.path,
          sidecarIntegrity.path,
          outcomeIntegrity.path,
        ],
      });
      assertRuntimeValidationValid({
        artifactName: "dispatch-fallback-outcome-checkpoint",
        artifactRef: runControlValidationPath,
        validation: terminalCheckpoint.validation,
      });
      dispatchFallbackCompletion.outcome = outcome;
      dispatchFallbackCompletion.integrity = outcomeIntegrity;
      return outcomeIntegrity;
    };

    try {
      assertActivationOwnerCheckpoint(
        await readYamlDocument<
          import("./artifact-types.js").ReconstructRunControlArtifact
        >(runControlPath),
      );
      semanticMapStage = await runSemanticMapStage({
        sourceObservations,
        directiveAuthor: fallbackRuntime.fallback.directiveAuthor,
        sessionRoot,
        config: DEFAULT_SEMANTIC_MAP_STAGE_CONFIG,
        dispatchBreaker: fallbackBreaker,
        preImageBase: fallbackPreImageBase,
        codeKindOptIn: params.semanticMapCode === true,
        codePreImageBase: fallbackCodePreImageBase,
        verifyModelIdentity:
          fallbackRuntime.fallback.verify.public_descriptor.descriptor_id,
        recoveryContext: exactRecoveryContext,
        executionSource: "fallback",
        priorDispatchSpend,
        captureStructuredContributors: true,
      });
      await publishTerminalFallback("completed", null);
    } catch (fallbackError) {
      if (isGracefulTerminalSignal(fallbackError)) throw fallbackError;
      if (readReconstructLlmDispatchFailureError(fallbackError)) throw fallbackError;
      if (!(fallbackError instanceof DispatchBreakerTrippedError)) {
        throw fallbackError;
      }
      const fallbackStructuredContributors =
        fallbackError.structuredContributors ?? [];
      const terminalFailure = fallbackStructuredContributors[0] ?? null;
      if (!terminalFailure || terminalFailure.failure_class === null) {
        throw fallbackError;
      }
      const haltedOutcomeIntegrity = await publishTerminalFallback(
        "halted",
        terminalFailure,
      );
      throw new DispatchBreakerTrippedError(
        fallbackError.trip,
        dispatchPath,
        {
          structuredContributors: fallbackStructuredContributors,
          fallbackOutcomePath: haltedOutcomeIntegrity.path,
        },
      );
    }
  }
  return semanticMapStage;
}
