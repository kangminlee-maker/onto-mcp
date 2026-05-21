import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { collectReviewLogs, computeProgressiveness } from "./review-log.js";
import type { ReviewLogEntry } from "./review-log.js";

// ─── Test fixtures ───

const PROJECT_ROOT = "/mock/project";

function makeExecResult(overrides: Record<string, unknown> = {}) {
  return {
    session_id: "20260413-aaa00001",
    session_root: "/mock/.onto/review/20260413-aaa00001",
    execution_realization: "worker",
    host_runtime: "codex",
    review_mode: "full",
    execution_status: "completed",
    execution_started_at: "2026-04-13T10:00:00+09:00",
    execution_completed_at: "2026-04-13T10:01:48+09:00",
    total_duration_ms: 107745,
    planned_lens_ids: ["logic", "structure", "axiology"],
    participating_lens_ids: ["logic", "structure", "axiology"],
    degraded_lens_ids: [],
    excluded_lens_ids: [],
    executed_lens_count: 3,
    synthesis_executed: true,
    deliberation_status: null,
    halt_reason: null,
    error_log_path: "error-log.md",
    lens_execution_results: [
      {
        unit_id: "logic",
        unit_kind: "lens",
        packet_path: "prompt-packets/logic.prompt.md",
        output_path: "round1/logic.md",
        status: "completed",
        started_at: "2026-04-13T10:00:00+09:00",
        completed_at: "2026-04-13T10:00:32+09:00",
        duration_ms: 32517,
        timestamp_provenance: "runner_wallclock",
        failure_message: null,
      },
      {
        unit_id: "structure",
        unit_kind: "lens",
        packet_path: "prompt-packets/structure.prompt.md",
        output_path: "round1/structure.md",
        status: "completed",
        started_at: "2026-04-13T10:00:00+09:00",
        completed_at: "2026-04-13T10:00:36+09:00",
        duration_ms: 36342,
        timestamp_provenance: "runner_wallclock",
        failure_message: null,
      },
      {
        unit_id: "axiology",
        unit_kind: "lens",
        packet_path: "prompt-packets/axiology.prompt.md",
        output_path: "round1/axiology.md",
        status: "completed",
        started_at: "2026-04-13T10:00:00+09:00",
        completed_at: "2026-04-13T10:00:33+09:00",
        duration_ms: 32791,
        failure_message: null,
      },
    ],
    synthesize_execution_result: {
      unit_id: "synthesize",
      unit_kind: "synthesize",
      packet_path: "prompt-packets/synthesize.runtime.prompt.md",
      output_path: "synthesis.md",
      status: "completed",
      started_at: "2026-04-13T10:01:06+09:00",
      completed_at: "2026-04-13T10:01:48+09:00",
      duration_ms: 42000,
      timestamp_provenance: "runner_wallclock",
      failure_message: null,
    },
    ...overrides,
  };
}

function makeReviewRecord(overrides: Record<string, unknown> = {}) {
  return {
    review_record_id: "20260413-aaa00001",
    session_id: "20260413-aaa00001",
    entrypoint: "review",
    record_status: "completed",
    created_at: "2026-04-13T10:00:00+09:00",
    updated_at: "2026-04-13T10:01:48+09:00",
    request_text: "design doc 검토",
    review_target_scope_ref: "binding.yaml",
    ...overrides,
  };
}

function makeBinding(refs: string[] = ["/mock/project/.onto/processes/evolve.md"]) {
  return {
    resolved_target_scope: {
      kind: "file",
      resolved_refs: refs,
    },
  };
}

function yamlStringify(obj: unknown): string {
  // vitest 환경에서는 yaml 패키지 대신 간단한 변환 사용
  const { stringify } = require("yaml");
  return stringify(obj);
}

// ─── Temp dir setup ───

let testDir: string;

function setupReviewDir(): string {
  testDir = join(tmpdir(), `review-log-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
  return testDir;
}

function createSession(
  reviewRoot: string,
  sessionId: string,
  execOverrides: Record<string, unknown> = {},
  recordOverrides: Record<string, unknown> = {},
  bindingRefs: string[] = ["/mock/project/.onto/processes/evolve.md"],
) {
  const sessionDir = join(reviewRoot, sessionId);
  mkdirSync(sessionDir, { recursive: true });

  writeFileSync(
    join(sessionDir, "execution-result.yaml"),
    yamlStringify(makeExecResult({ session_id: sessionId, ...execOverrides })),
  );
  writeFileSync(
    join(sessionDir, "review-record.yaml"),
    yamlStringify(makeReviewRecord({ session_id: sessionId, review_record_id: sessionId, ...recordOverrides })),
  );
  writeFileSync(
    join(sessionDir, "binding.yaml"),
    yamlStringify(makeBinding(bindingRefs)),
  );
}

// ─── Tests ───

describe("review-log", () => {
  beforeEach(() => {
    setupReviewDir();
  });

  afterEach(() => {
    if (testDir) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("collectReviewLogs", () => {
    it("빈 디렉터리에서 빈 summary 를 반환한다", () => {
      const result = collectReviewLogs(testDir, PROJECT_ROOT);
      expect(result.total_sessions).toBe(0);
      expect(result.entries).toHaveLength(0);
      expect(result.progressiveness).toHaveLength(0);
    });

    it("존재하지 않는 경로에서 빈 summary 를 반환한다", () => {
      const result = collectReviewLogs("/nonexistent/path", PROJECT_ROOT);
      expect(result.total_sessions).toBe(0);
    });

    it("단일 세션을 수집한다", () => {
      createSession(testDir, "20260413-aaa00001");

      const result = collectReviewLogs(testDir, PROJECT_ROOT);

      expect(result.total_sessions).toBe(1);
      expect(result.entries).toHaveLength(1);

      const entry = result.entries[0]!;
      expect(entry.session_id).toBe("20260413-aaa00001");
      expect(entry.review_mode).toBe("full");
      expect(entry.execution_status).toBe("completed");
      expect(entry.total_duration_ms).toBe(107745);
      expect(entry.lens_count).toBe(3);
      expect(entry.participating_lens_ids).toEqual(["logic", "structure", "axiology"]);
      expect(entry.request_text).toBe("design doc 검토");
    });

    it("per-lens duration 을 정확히 수집한다", () => {
      createSession(testDir, "20260413-aaa00001");

      const result = collectReviewLogs(testDir, PROJECT_ROOT);
      const entry = result.entries[0]!;

      expect(entry.per_lens_duration).toHaveLength(3);
      const logic = entry.per_lens_duration.find((d) => d.lens_id === "logic");
      expect(logic).toBeDefined();
      expect(logic!.duration_ms).toBe(32517);
      expect(logic!.provenance).toBe("runner_wallclock");
    });

    it("provenance summary 를 정확히 산출한다", () => {
      createSession(testDir, "20260413-aaa00001");

      const result = collectReviewLogs(testDir, PROJECT_ROOT);
      const prov = result.entries[0]!.provenance_summary;

      // logic + structure = 2 runner_wallclock, axiology = unknown (provenance 없음), synth = 1 runner_wallclock
      expect(prov.runner_wallclock).toBe(3);
      expect(prov.unknown).toBe(1); // axiology 는 provenance 필드 없음
    });

    it("synthesis duration 을 수집한다", () => {
      createSession(testDir, "20260413-aaa00001");

      const result = collectReviewLogs(testDir, PROJECT_ROOT);
      expect(result.entries[0]!.synthesis_duration_ms).toBe(42000);
    });

    it("synthesis 가 없는 세션을 처리한다", () => {
      createSession(testDir, "20260413-aaa00001", {
        synthesis_executed: false,
        synthesize_execution_result: null,
      });

      const result = collectReviewLogs(testDir, PROJECT_ROOT);
      expect(result.entries[0]!.synthesis_duration_ms).toBeNull();
    });

    it("여러 세션을 시간순 정렬한다", () => {
      createSession(testDir, "20260413-bbb00002", {}, {
        created_at: "2026-04-13T12:00:00+09:00",
      });
      createSession(testDir, "20260413-aaa00001", {}, {
        created_at: "2026-04-13T10:00:00+09:00",
      });

      const result = collectReviewLogs(testDir, PROJECT_ROOT);
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0]!.session_id).toBe("20260413-aaa00001");
      expect(result.entries[1]!.session_id).toBe("20260413-bbb00002");
    });

    it("target refs 를 프로젝트 루트 기준으로 정규화한다", () => {
      createSession(
        testDir,
        "20260413-aaa00001",
        {},
        {},
        ["/mock/project/.onto/processes/evolve.md"],
      );

      const result = collectReviewLogs(testDir, "/mock/project");
      expect(result.entries[0]!.review_target_refs).toEqual([".onto/processes/evolve.md"]);
    });

    it("execution-result.yaml 없는 세션은 건너뛴다", () => {
      // execution-result.yaml 없이 디렉터리만 생성
      const sessionDir = join(testDir, "20260413-ccc00003");
      mkdirSync(sessionDir, { recursive: true });
      writeFileSync(join(sessionDir, "review-record.yaml"), yamlStringify(makeReviewRecord()));

      const result = collectReviewLogs(testDir, PROJECT_ROOT);
      expect(result.total_sessions).toBe(0);
    });

    it("total_duration_ms 전체 합산을 반환한다", () => {
      createSession(testDir, "20260413-aaa00001", { total_duration_ms: 50000 }, {
        created_at: "2026-04-13T10:00:00+09:00",
      });
      createSession(testDir, "20260413-bbb00002", { total_duration_ms: 30000 }, {
        created_at: "2026-04-13T11:00:00+09:00",
      });

      const result = collectReviewLogs(testDir, PROJECT_ROOT);
      expect(result.total_duration_ms).toBe(80000);
    });
  });

  describe("computeProgressiveness", () => {
    it("세션 2건 미만 그룹은 제외한다", () => {
      const entries: ReviewLogEntry[] = [
        makeLogEntry("s1", ["fileA.md"], 100000, "2026-04-13T10:00:00+09:00"),
      ];

      const metrics = computeProgressiveness(entries);
      expect(metrics).toHaveLength(0);
    });

    it("동일 대상 2회 review 시 점진성 metric 을 산출한다", () => {
      const entries: ReviewLogEntry[] = [
        makeLogEntry("s1", ["fileA.md"], 100000, "2026-04-13T10:00:00+09:00"),
        makeLogEntry("s2", ["fileA.md"], 70000, "2026-04-13T12:00:00+09:00"),
      ];

      const metrics = computeProgressiveness(entries);
      expect(metrics).toHaveLength(1);

      const m = metrics[0]!;
      expect(m.session_count).toBe(2);
      expect(m.first_duration_ms).toBe(100000);
      expect(m.latest_duration_ms).toBe(70000);
      expect(m.duration_delta_ms).toBe(-30000);
      expect(m.duration_delta_ratio).toBe(-0.3);
      expect(m.avg_duration_ms).toBe(85000);
    });

    it("동일 대상 3회 review 시 첫/마지막 비교 metric 을 산출한다", () => {
      const entries: ReviewLogEntry[] = [
        makeLogEntry("s1", ["fileA.md"], 100000, "2026-04-13T10:00:00+09:00"),
        makeLogEntry("s2", ["fileA.md"], 80000, "2026-04-13T12:00:00+09:00"),
        makeLogEntry("s3", ["fileA.md"], 60000, "2026-04-13T14:00:00+09:00"),
      ];

      const metrics = computeProgressiveness(entries);
      expect(metrics[0]!.session_count).toBe(3);
      expect(metrics[0]!.duration_delta_ms).toBe(-40000);
      expect(metrics[0]!.duration_delta_ratio).toBe(-0.4);
    });

    it("서로 다른 대상은 별도 그룹으로 분리한다", () => {
      const entries: ReviewLogEntry[] = [
        makeLogEntry("s1", ["fileA.md"], 100000, "2026-04-13T10:00:00+09:00"),
        makeLogEntry("s2", ["fileA.md"], 70000, "2026-04-13T12:00:00+09:00"),
        makeLogEntry("s3", ["fileB.md"], 90000, "2026-04-13T11:00:00+09:00"),
        makeLogEntry("s4", ["fileB.md"], 85000, "2026-04-13T13:00:00+09:00"),
      ];

      const metrics = computeProgressiveness(entries);
      expect(metrics).toHaveLength(2);
    });

    it("target refs 순서가 달라도 동일 그룹으로 합친다", () => {
      const entries: ReviewLogEntry[] = [
        makeLogEntry("s1", ["fileB.md", "fileA.md"], 100000, "2026-04-13T10:00:00+09:00"),
        makeLogEntry("s2", ["fileA.md", "fileB.md"], 70000, "2026-04-13T12:00:00+09:00"),
      ];

      const metrics = computeProgressiveness(entries);
      expect(metrics).toHaveLength(1);
      expect(metrics[0]!.session_count).toBe(2);
    });

    it("target refs 가 빈 세션은 그룹에서 제외한다", () => {
      const entries: ReviewLogEntry[] = [
        makeLogEntry("s1", [], 100000, "2026-04-13T10:00:00+09:00"),
        makeLogEntry("s2", [], 70000, "2026-04-13T12:00:00+09:00"),
      ];

      const metrics = computeProgressiveness(entries);
      expect(metrics).toHaveLength(0);
    });

    it("시간이 증가한 경우 양수 delta 를 반환한다", () => {
      const entries: ReviewLogEntry[] = [
        makeLogEntry("s1", ["fileA.md"], 50000, "2026-04-13T10:00:00+09:00"),
        makeLogEntry("s2", ["fileA.md"], 80000, "2026-04-13T12:00:00+09:00"),
      ];

      const metrics = computeProgressiveness(entries);
      expect(metrics[0]!.duration_delta_ms).toBe(30000);
      expect(metrics[0]!.duration_delta_ratio).toBe(0.6);
    });
  });
});

// ─── Test helper ───

function makeLogEntry(
  session_id: string,
  target_refs: string[],
  total_duration_ms: number,
  created_at: string,
): ReviewLogEntry {
  return {
    session_id,
    created_at,
    review_target_refs: target_refs,
    request_text: "test review",
    review_mode: "full",
    execution_realization: "worker",
    host_runtime: "codex",
    execution_status: "completed",
    total_duration_ms,
    lens_count: 9,
    participating_lens_ids: ["logic"],
    degraded_lens_ids: [],
    per_lens_duration: [],
    synthesis_duration_ms: null,
    provenance_summary: { runner_wallclock: 0, coordinator_derived: 0, batch_window: 0, unknown: 0 },
  };
}
