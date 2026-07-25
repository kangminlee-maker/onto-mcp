import fs from "node:fs/promises";
import path from "node:path";
import { atomicWriteYamlDocument as writeYamlDocument } from "../artifact-io.js";
import type {
  ReconstructSourceObservationsArtifact,
  ReconstructTargetMaterialProfileArtifact,
} from "./artifact-types.js";
import { parseEnvironmentManifests, type ParsedManifest } from "./environment-content-parse.js";
import {
  assembleEnvironmentContextProfile,
  projectEnvironmentContextProfileInput,
} from "./environment-context-profile.js";
import { scanEnvironmentSignalFiles } from "./environment-signal-scan.js";
import { isGracefulTerminalSignal } from "./graceful-terminal.js";
import { readReconstructLlmDispatchFailureError } from "./llm-dispatch-failure.js";

// ─────────────────────────────────────────────────────────────────────────────
// environment-context-profile-stage — 환경 컨텍스트 프로파일을 **발화**하는 스테이지.
//
// 왜 `environment-context-profile.ts`가 아닌가: 그 모듈은 헤더에 "NEVER reads the filesystem or
// an artifact"를 불변식으로 선언한 **순수 투영기**(set-tier sibling)다. 이 스테이지는 그 반대편
// 역할이다 — 파일시스템을 스캔하고(known-signal scan) 아티팩트를 쓴다. 한 모듈에 합치면 그
// 선언된 capability 경계가 깨진다. 그래서 `semantic-map-stage` · `leaf-read-stage` ·
// `value-read-stage` · `source-admission-selection-stage`와 같은 `*-stage` 개념으로 분리했다.
//
// 본문은 runReconstruct에서 **원문 그대로** 옮겨온 블록이다(분해 설계 20260726 Tier 1).
// 기준본과 바이트 동일함을 `scripts/run-block-identity.mts`가 검사한다 — 파라미터를 원래 지역
// 변수 이름으로 맨 앞에서 구조분해하고, 원래 바깥 `let`이었던 반환값을 같은 이름의 지역 `let`으로
// 두는 것도 그 동일성을 지키기 위해서다. 그 두 줄과 마지막 return 줄은 검사기에 prefix/suffix로
// **선언**돼 있고, 선언하지 않은 코드가 끼면 FAIL한다.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DISCLOSURE-ONLY 프로파일 아티팩트를 쓰고 그 ref를 돌려준다. OFF면 아무것도 쓰지 않고 null이다
 * (호출부의 `environmentContextProfileRef`는 null로 초기화돼 이 값으로만 채워진다 — 등가).
 */
export async function emitEnvironmentContextProfile(args: {
  params: {
    environmentContextProfile?: boolean | undefined;
    environmentContextProfileContent?: boolean | undefined;
  };
  sessionId: string;
  sessionRoot: string;
  sourceObservations: ReconstructSourceObservationsArtifact;
  targetMaterialProfile: ReconstructTargetMaterialProfileArtifact;
}): Promise<string | null> {
  const { params, sessionId, sessionRoot, sourceObservations, targetMaterialProfile } = args;
  let environmentContextProfileRef: string | null = null;
  if (params.environmentContextProfile === true) {
    // Known-signal scan (Stage 0.5): the bounded target census (200/depth-3, dotdir-excluded) can
    // bury root manifests under a large non-manifest directory (live-verified on this repo). Scan
    // the target directories for known-signal files (allowlist-driven, BFS shallow-first, path-safe)
    // and merge them into the census. Scan roots = the target refs resolved to directories.
    const scanRootSet = new Set<string>();
    for (const ref of targetMaterialProfile.target_refs) {
      const resolved = path.resolve(ref);
      try {
        const stat = await fs.stat(resolved);
        scanRootSet.add(stat.isDirectory() ? resolved : path.dirname(resolved));
      } catch (error) {
        // INV-SCHEMA-1 (G11): never swallow a terminal signal, even in a best-effort fs catch.
        if (isGracefulTerminalSignal(error)) throw error;
        if (readReconstructLlmDispatchFailureError(error)) throw error;
        // Unresolvable ref — skip; the scan is best-effort augmentation, never a hard dependency.
      }
    }
    // Drop any scan root that is a DESCENDANT of another (nested target refs) so its subtree is not
    // walked twice — double-charging the shared dirent budget would hasten truncation.
    const sortedRoots = [...scanRootSet].sort();
    const scanRoots = sortedRoots.filter((r) =>
      !sortedRoots.some((other) => other !== r && (r === other || r.startsWith(other + path.sep))));
    const scan = await scanEnvironmentSignalFiles({ scanRoots });
    // Content parse (Stage 3a) — nested inside the base profile gate, so it is inert unless the base
    // profile is also on. OFF ⇒ contentManifests stays undefined ⇒ no manifest content is read and the
    // profile is byte-identical to Stage 0.5 (side-effect 0). Candidates = the scan's known-signal
    // paths ∪ the census refs (a target file passed directly), filtered to dep manifests + within the
    // vetted scan roots by the content-parse module itself (path-safety).
    let contentManifests: ParsedManifest[] | undefined;
    if (params.environmentContextProfileContent === true) {
      const censusRefs = targetMaterialProfile.detection.per_ref
        .filter((r) => r.exists)
        .map((r) => r.ref);
      contentManifests = await parseEnvironmentManifests({
        candidatePaths: [...scan.signals, ...censusRefs],
        allowedRoots: scanRoots,
      });
    }
    const profile = assembleEnvironmentContextProfile(
      projectEnvironmentContextProfileInput({
        targetMaterialProfile,
        sourceObservations,
        scannedSignals: {
          refs: scan.signals,
          truncated: scan.truncated,
          maxDepth: scan.max_depth,
          maxDirents: scan.max_dirents,
        },
        ...(contentManifests !== undefined ? { contentManifests } : {}),
      }),
    );
    const profilePath = path.join(
      sessionRoot,
      "comprehension",
      "environment-context-profile.yaml",
    );
    await writeYamlDocument(profilePath, { session_id: sessionId, ...profile });
    environmentContextProfileRef = profilePath;
  }
  return environmentContextProfileRef;
}
