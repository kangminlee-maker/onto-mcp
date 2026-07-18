import { describe, expect, it } from "vitest";
import path from "node:path";
import { buildReconstructSourceObservation } from "./materialize-preparation.js";
import type { TargetMaterialRefDetection } from "../target-material-kind.js";

// Spec basis (INV-TEST-1): multi-artifact design 20260718 DD4 + G-OFF — the semantic_map_code
// opt-in must be byte-inert when off (no new structural_data keys), and when on a code FILE
// observation carries exactly one of code_structure_inventory | code_structure_unsupported.
// Real committed fixtures (scripts/fixtures/code-probe) keep the subject set non-empty.

const FIXTURES = path.resolve(__dirname, "../../../scripts/fixtures/code-probe");

function detectionFor(ref: string): TargetMaterialRefDetection {
  return {
    ref,
    exists: true,
    kind: "code",
    confidence: 0.95,
    confidence_basis: "test fixture",
  };
}

describe("materialize-preparation code-structure opt-in (DD4 / G-OFF)", () => {
  it("keeps the observation byte-inert when the opt-in is absent/off", async () => {
    const ref = path.join(FIXTURES, "inventory_service.py");
    const off = await buildReconstructSourceObservation(detectionFor(ref), undefined, {
      isRuntimeTargetSource: true,
    });
    const offDefault = await buildReconstructSourceObservation(detectionFor(ref), undefined, {
      isRuntimeTargetSource: true,
      codeStructureObservation: false,
    });
    expect(off).not.toBeNull();
    expect(Object.keys(off!.structural_data)).not.toContain("code_structure_inventory");
    expect(Object.keys(off!.structural_data)).not.toContain("code_structure_unsupported");
    // absent ≡ false — 동일 키 집합 (G-OFF 관찰 측 절반).
    expect(JSON.stringify(off)).toBe(JSON.stringify(offDefault));
  });

  it("attaches the deterministic inventory for a supported code file when on", async () => {
    const ref = path.join(FIXTURES, "inventory_service.py");
    const on = await buildReconstructSourceObservation(detectionFor(ref), undefined, {
      isRuntimeTargetSource: true,
      codeStructureObservation: true,
    });
    expect(on).not.toBeNull();
    const inventory = on!.structural_data.code_structure_inventory as {
      language: string;
      symbol_tiles: { spans: unknown[] };
      content_sha256: string;
    };
    expect(inventory).toBeDefined();
    expect(inventory.language).toBe("python");
    expect(inventory.symbol_tiles.spans.length).toBeGreaterThan(0);
    expect(on!.structural_data.code_structure_unsupported).toBeUndefined();
    // 옵트인 외 기존 필드는 불변 (additive-only).
    const off = await buildReconstructSourceObservation(detectionFor(ref), undefined, {
      isRuntimeTargetSource: true,
    });
    const strip = (o: Record<string, unknown>): Record<string, unknown> => {
      const { code_structure_inventory: _a, ...rest } = o;
      return rest;
    };
    expect(JSON.stringify(strip(on!.structural_data))).toBe(JSON.stringify(off!.structural_data));
  });

  it("records an explicit unsupported reason for a code file without a bundled grammar (gf-F5)", async () => {
    // 실존 파일이어야 stat이 성립한다. 관찰기는 확장자만 보므로(kind는 호출자 주장),
    // 문법 미동봉 확장자(.md)의 실존 파일로 unsupported 경로를 검증한다.
    const ref = path.resolve(__dirname, "../../../AGENTS.md");
    const on = await buildReconstructSourceObservation(
      { ref, exists: true, kind: "code", confidence: 0.9, confidence_basis: "test" },
      undefined,
      { isRuntimeTargetSource: true, codeStructureObservation: true },
    );
    expect(on).not.toBeNull();
    const unsupported = on!.structural_data.code_structure_unsupported as { reason: string } | undefined;
    expect(unsupported).toBeDefined();
    expect(unsupported!.reason).toContain("language not supported");
    expect(on!.structural_data.code_structure_inventory).toBeUndefined();
  });
});
