/**
 * review-log.ts — Review 실행 로그 수집 및 점진성(progressiveness) metric 산출
 *
 * W-A-71: DL-017 점진성 seat.
 * .onto/review/* 세션 디렉터리에서 execution-result.yaml + review-record.yaml 을 읽어
 * 세션별 타이밍 요약과 반복 review 간 비용·시간 변화를 계측한다.
 *
 * 소비자: W-A-75 (review-r+), W-A-76 (review-r−), onto:health (W-A-59)
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as yamlParse } from "yaml";
import { getLogger } from "../logger.js";
import type {
  ReviewExecutionResultArtifact,
  ReviewUnitExecutionResult,
  UnitTimestampProvenance,
  ReviewExecutionStatus,
  ReviewMode,
  ReviewExecutionRealization,
  ReviewHostRuntime,
} from "../review/artifact-types.js";

// ─── Public Types ───

/** 단일 review 세션의 실행 로그 요약 */
export interface ReviewLogEntry {
  session_id: string;
  created_at: string;
  review_target_refs: string[];
  request_text: string;
  review_mode: ReviewMode;
  execution_realization: ReviewExecutionRealization;
  host_runtime: ReviewHostRuntime;
  execution_status: ReviewExecutionStatus;
  total_duration_ms: number;
  lens_count: number;
  participating_lens_ids: string[];
  degraded_lens_ids: string[];
  per_lens_duration: LensDuration[];
  synthesis_duration_ms: number | null;
  provenance_summary: ProvenanceSummary;
}

/** 개별 lens 타이밍 */
export interface LensDuration {
  lens_id: string;
  duration_ms: number;
  provenance: UnitTimestampProvenance | "unknown";
}

/** timestamp provenance 분포 */
export interface ProvenanceSummary {
  runner_wallclock: number;
  coordinator_derived: number;
  batch_window: number;
  unknown: number;
}

/** 동일 대상 반복 review 의 점진성 metric */
export interface ProgressivenessMetric {
  /** 대상 파일 경로(정규화)를 정렬 후 join 한 키 */
  target_group_key: string;
  target_refs: string[];
  sessions: ProgressivenessSession[];
  session_count: number;
  first_duration_ms: number;
  latest_duration_ms: number;
  /** 음수 = 개선 (시간 단축) */
  duration_delta_ms: number;
  /** -0.3 = 30% 단축 */
  duration_delta_ratio: number;
  avg_duration_ms: number;
}

/** 점진성 계산용 세션 슬림 뷰 */
export interface ProgressivenessSession {
  session_id: string;
  created_at: string;
  total_duration_ms: number;
  execution_status: ReviewExecutionStatus;
}

/** collectReviewLogs 의 전체 반환 */
export interface ReviewLogSummary {
  collected_at: string;
  review_root: string;
  total_sessions: number;
  total_duration_ms: number;
  entries: ReviewLogEntry[];
  progressiveness: ProgressivenessMetric[];
}

// ─── Internal helpers ───

interface RawReviewRecord {
  session_id?: string;
  request_text?: string;
  created_at?: string;
  review_target_scope_ref?: string;
  resolved_review_mode?: string;
}

interface RawBinding {
  resolved_target_scope?: {
    kind?: string;
    resolved_refs?: string[];
  };
}

function normalizeRef(ref: string, projectRoot: string): string {
  if (ref.startsWith("/")) {
    // 절대 경로 → 프로젝트 루트 기준 상대 경로로 변환
    const rel = ref.replace(projectRoot + "/", "");
    return rel.startsWith("/") ? ref : rel;
  }
  return ref;
}

function classifyProvenance(
  p: UnitTimestampProvenance | undefined | null,
): UnitTimestampProvenance | "unknown" {
  if (
    p === "runner_wallclock" ||
    p === "coordinator_derived" ||
    p === "batch_window"
  ) {
    return p;
  }
  return "unknown";
}

function emptyProvenanceSummary(): ProvenanceSummary {
  return { runner_wallclock: 0, coordinator_derived: 0, batch_window: 0, unknown: 0 };
}

function parseYamlFile<T>(filePath: string): T | null {
  try {
    const raw = readFileSync(filePath, "utf-8");
    return yamlParse(raw) as T;
  } catch {
    getLogger().debug("review-log: failed to parse YAML", { path: filePath });
    return null;
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// ─── Core API ───

/**
 * .onto/review/ 이하 모든 세션의 실행 로그를 수집한다.
 *
 * @param reviewRoot - .onto/review 디렉터리 경로
 * @param projectRoot - 프로젝트 루트 (절대 경로 정규화용)
 * @returns ReviewLogSummary — 세션별 로그 + 점진성 metric
 */
export function collectReviewLogs(
  reviewRoot: string,
  projectRoot: string,
): ReviewLogSummary {
  const absReviewRoot = resolve(reviewRoot);
  const absProjectRoot = resolve(projectRoot);

  let sessionDirs: string[];
  try {
    sessionDirs = readdirSync(absReviewRoot).filter((name) => {
      // session 디렉터리: YYYYMMDD-hexid 패턴
      return /^\d{8}-[0-9a-f]+$/.test(name) && isDirectory(join(absReviewRoot, name));
    });
  } catch {
    getLogger().warn("review-log: review root not found", { path: absReviewRoot });
    return {
      collected_at: new Date().toISOString(),
      review_root: absReviewRoot,
      total_sessions: 0,
      total_duration_ms: 0,
      entries: [],
      progressiveness: [],
    };
  }

  const entries: ReviewLogEntry[] = [];

  for (const dirName of sessionDirs) {
    const sessionPath = join(absReviewRoot, dirName);
    const entry = parseSession(sessionPath, absProjectRoot);
    if (entry) {
      entries.push(entry);
    }
  }

  // 시간순 정렬 (오래된 것 먼저). undefined-safe comparator.
  entries.sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));

  const totalDuration = entries.reduce((sum, e) => sum + e.total_duration_ms, 0);
  const progressiveness = computeProgressiveness(entries);

  return {
    collected_at: new Date().toISOString(),
    review_root: absReviewRoot,
    total_sessions: entries.length,
    total_duration_ms: totalDuration,
    entries,
    progressiveness,
  };
}

/**
 * 단일 세션 디렉터리에서 ReviewLogEntry 를 추출한다.
 */
function parseSession(
  sessionPath: string,
  projectRoot: string,
): ReviewLogEntry | null {
  const execResultPath = join(sessionPath, "execution-result.yaml");
  const reviewRecordPath = join(sessionPath, "review-record.yaml");
  const bindingPath = join(sessionPath, "binding.yaml");

  const execResult = parseYamlFile<ReviewExecutionResultArtifact>(execResultPath);
  if (!execResult) {
    // execution-result.yaml 없으면 미완료 세션 — skip
    return null;
  }

  const reviewRecord = parseYamlFile<RawReviewRecord>(reviewRecordPath);
  const binding = parseYamlFile<RawBinding>(bindingPath);

  // target refs 수집: binding 우선, record는 보조 자료.
  let targetRefs: string[] = [];
  if (binding?.resolved_target_scope?.resolved_refs) {
    targetRefs = binding.resolved_target_scope.resolved_refs.map((r) =>
      normalizeRef(r, projectRoot),
    );
  }

  // per-lens duration + provenance summary
  const provSummary = emptyProvenanceSummary();
  const perLensDuration: LensDuration[] = [];

  for (const unit of execResult.lens_execution_results ?? []) {
    const prov = classifyProvenance(unit.timestamp_provenance);
    provSummary[prov]++;
    perLensDuration.push({
      lens_id: unit.unit_id,
      duration_ms: unit.duration_ms,
      provenance: prov,
    });
  }

  // synthesis
  let synthesisDuration: number | null = null;
  if (execResult.synthesize_execution_result) {
    synthesisDuration = execResult.synthesize_execution_result.duration_ms;
    const synthProv = classifyProvenance(
      execResult.synthesize_execution_result.timestamp_provenance,
    );
    provSummary[synthProv]++;
  }

  return {
    session_id: execResult.session_id,
    created_at: reviewRecord?.created_at ?? execResult.execution_started_at,
    review_target_refs: targetRefs,
    request_text: reviewRecord?.request_text ?? "",
    review_mode: requireReviewMode(execResult.review_mode as string),
    execution_realization: execResult.execution_realization,
    host_runtime: execResult.host_runtime,
    execution_status: execResult.execution_status,
    total_duration_ms: execResult.total_duration_ms,
    lens_count: execResult.executed_lens_count,
    participating_lens_ids: execResult.participating_lens_ids ?? [],
    degraded_lens_ids: execResult.degraded_lens_ids ?? [],
    per_lens_duration: perLensDuration,
    synthesis_duration_ms: synthesisDuration,
    provenance_summary: provSummary,
  };
}

function requireReviewMode(value: string): ReviewMode {
  if (value === "core-axis" || value === "full") return value;
  throw new Error(`review-log: unsupported review_mode in execution-result.yaml: ${value}`);
}

// ─── Progressiveness ───

/**
 * 동일 대상을 반복 review 한 세션을 그룹화하고 점진성 metric 을 산출한다.
 *
 * 그룹화 기준: review_target_refs 를 정렬 후 join 한 문자열이 일치하면 동일 대상.
 * 세션이 2건 미만인 그룹은 점진성 측정 불가 → 제외.
 */
export function computeProgressiveness(
  entries: ReviewLogEntry[],
): ProgressivenessMetric[] {
  const groups = new Map<string, ReviewLogEntry[]>();

  for (const entry of entries) {
    if (entry.review_target_refs.length === 0) continue;
    const key = [...entry.review_target_refs].sort().join("\n");
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }

  const metrics: ProgressivenessMetric[] = [];

  for (const [key, group] of groups) {
    if (group.length < 2) continue;

    // 시간순 정렬 (이미 정렬됐을 수 있으나 안전)
    group.sort((a, b) => a.created_at.localeCompare(b.created_at));

    const first = group[0]!;
    const latest = group[group.length - 1]!;
    const totalDuration = group.reduce((s, e) => s + e.total_duration_ms, 0);
    const avgDuration = Math.round(totalDuration / group.length);
    const deltaDuration = latest.total_duration_ms - first.total_duration_ms;
    const deltaRatio =
      first.total_duration_ms > 0
        ? deltaDuration / first.total_duration_ms
        : 0;

    metrics.push({
      target_group_key: key,
      target_refs: first.review_target_refs,
      sessions: group.map((e) => ({
        session_id: e.session_id,
        created_at: e.created_at,
        total_duration_ms: e.total_duration_ms,
        execution_status: e.execution_status,
      })),
      session_count: group.length,
      first_duration_ms: first.total_duration_ms,
      latest_duration_ms: latest.total_duration_ms,
      duration_delta_ms: deltaDuration,
      duration_delta_ratio: Math.round(deltaRatio * 1000) / 1000,
      avg_duration_ms: avgDuration,
    });
  }

  // 세션 수 내림차순
  metrics.sort((a, b) => b.session_count - a.session_count);
  return metrics;
}
