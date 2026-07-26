import fs from "node:fs/promises";
import path from "node:path";
import { atomicWriteYamlDocument as writeYamlDocument } from "../artifact-io.js";
import type {
  ReconstructOntologySeedArtifact,
  ReconstructOntologySeedValidationArtifact,
} from "./artifact-types.js";
import type { AuthoredArtifactReuseMatch } from "./authored-artifact-reuse.js";
import { writeAuthoredArtifactReuseProvenance } from "./authored-artifact-reuse.js";
import { validationDetailSummary } from "./authoring-prompt-payloads.js";
import type { ReconstructContractRegistry } from "./contract-registry.js";
import type {
  ReconstructDirectiveAuthor,
  ReconstructOntologySeedAuthorInput,
} from "./directive-author-contract.js";
import {
  ontologySeedRepairSections,
  writeOntologySeedValidationArtifact,
} from "./ontology-seed-validation.js";

// ─────────────────────────────────────────────────────────────────────────────
// ontology-seed-repair-stage — 온톨로지 시드 검증이 invalid일 때의 **1회 수리 시도** 스테이지.
//
// 왜 `ontology-seed-validation.ts`가 아닌가: 그 모듈은 검증 아티팩트를 읽고 쓰는 **검증기**이며
// directive author(=LLM 디스패치)와 아무 접점이 없다(실측: ReconstructDirectiveAuthor 0회).
// 이 블록은 텔레메트리 기록 → 입력 스냅샷 복사 → **LLM 재저작** → 재검증 → 텔레메트리를
// 오케스트레이션한다. 합치면 검증기가 LLM을 부르는 모듈로 성격이 바뀐다. `*-stage` 전례
// (semantic-map / leaf-read / value-read / source-admission-selection / environment-context-profile)
// 에 맞춰 분리했다.
//
// 본문은 runReconstruct에서 **원문 그대로** 옮겨온 블록이다(분해 설계 20260726 Tier 1).
// 기준본과 바이트 동일함을 `scripts/run-block-identity.mts`가 검사한다 — 파라미터를 원래 지역
// 변수 이름으로 구조분해하고, 원래 바깥 `let`이었던 둘(`ontologySeed`·`ontologySeedValidation`)을
// 같은 이름의 지역 `let`으로 두는 것도 그 동일성을 지키기 위해서다. 그 두 줄과 마지막 return은
// 검사기에 prefix/suffix로 **선언**돼 있고, 선언하지 않은 코드가 끼면 FAIL한다.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * invalid 시드에 대해 수리를 1회 시도하고 (수리된) 시드와 그 검증 결과를 돌려준다.
 * validation_status가 invalid가 아니면 입력을 그대로 돌려준다(호출부의 두 `let` 대입과 등가).
 * 수리 결과가 여전히 invalid면 그 사실을 텔레메트리에 남기고 그대로 돌려준다 — 게이트 판정은
 * 호출부의 `assertRuntimeValidationValid`가 한다(이 스테이지는 판정하지 않는다).
 */
export async function repairInvalidOntologySeed(args: {
  candidateDispositionPath: string;
  contractRegistry: ReconstructContractRegistry;
  contractRegistryPath: string;
  currentAuthoredArtifactReuseMatch: AuthoredArtifactReuseMatch | null;
  directiveAuthor: ReconstructDirectiveAuthor;
  ontologySeed: ReconstructOntologySeedArtifact;
  ontologySeedAuthorInput: ReconstructOntologySeedAuthorInput;
  ontologySeedPath: string;
  ontologySeedValidation: ReconstructOntologySeedValidationArtifact;
  ontologySeedValidationPath: string;
  preparationRefs: { source_observations: string };
  sessionRoot: string;
}): Promise<{
  ontologySeed: ReconstructOntologySeedArtifact;
  ontologySeedValidation: ReconstructOntologySeedValidationArtifact;
}> {
  const { candidateDispositionPath, contractRegistry, contractRegistryPath, currentAuthoredArtifactReuseMatch, directiveAuthor, ontologySeedAuthorInput, ontologySeedPath, ontologySeedValidationPath, preparationRefs, sessionRoot } = args;
  let { ontologySeed, ontologySeedValidation } = args;
  if (ontologySeedValidation.validation_status === "invalid") {
    directiveAuthor.executionTelemetry?.recordValidationGateFailure({
      unitId: "ontology_seed",
      failureMessage: validationDetailSummary(
        ontologySeedValidation as unknown as Record<string, unknown>,
      ),
    });
    const repairAttemptId = "ontology-seed-repair-1";
    const repairInputPath = path.join(sessionRoot, `${repairAttemptId}.input.yaml`);
    const repairInputValidationPath = path.join(
      sessionRoot,
      `${repairAttemptId}.input-validation.yaml`,
    );
    await fs.copyFile(ontologySeedPath, repairInputPath);
    await fs.copyFile(ontologySeedValidationPath, repairInputValidationPath);
    ontologySeed = await directiveAuthor.writeOntologySeed({
      ...ontologySeedAuthorInput,
      repairAttempt: {
        attempt_id: repairAttemptId,
        repair_sections: ontologySeedRepairSections(ontologySeedValidation),
        previous_ontology_seed: ontologySeed,
        previous_ontology_seed_validation: ontologySeedValidation,
        previous_ontology_seed_validation_ref: repairInputValidationPath,
      },
    });
    await writeYamlDocument(ontologySeedPath, ontologySeed);
    if (currentAuthoredArtifactReuseMatch) {
      await writeAuthoredArtifactReuseProvenance({
        filePath: ontologySeedPath,
        artifactName: "ontology-seed.yaml",
        reuseMatch: currentAuthoredArtifactReuseMatch,
      });
    }
    ontologySeedValidation = await writeOntologySeedValidationArtifact({
      ontologySeedPath,
      candidateDispositionPath,
      sourceObservationsPath: preparationRefs.source_observations,
      registryPath: contractRegistryPath,
      contractRegistry,
      outputPath: ontologySeedValidationPath,
    });
    if (ontologySeedValidation.validation_status === "invalid") {
      // The repair output is still invalid: record the terminal validation-gate
      // rejection so the failed unit's lineage ends at the gate that halts it.
      directiveAuthor.executionTelemetry?.recordValidationGateFailure({
        unitId: "ontology_seed",
        failureMessage: validationDetailSummary(
          ontologySeedValidation as unknown as Record<string, unknown>,
        ),
      });
    }
  }
  return { ontologySeed, ontologySeedValidation };
}
