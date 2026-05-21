---
as_of: 2026-04-14
status: active
functional_area: review-execution-log
purpose: |
  review 실행 로그 수집 계약. 세션별 타이밍 데이터를 구조적으로 읽어
  점진성(progressiveness) metric 을 산출하는 reader 의 입출력 계약을 정의한다.
authority_stance: non-authoritative-design-surface
canonicality: supporting
source_refs:
  w_id: "W-A-71 (DL-017 점진성 seat)"
  onto_direction: "development-records/evolve/20260413-onto-direction.md §1.4 측면 1"
  execution_result_contract: ".onto/processes/review/record-contract.md §5 execution_result_ref"
  artifact_types: "src/core-runtime/review/artifact-types.ts (ReviewExecutionResultArtifact)"
  reader_impl: "src/core-runtime/readers/review-log.ts"
---

# Review Execution Log Collection Contract

## 1. 목적

반복 review 작업의 비용·시간 변화를 측정하여 onto 시스템의 점진성(progressiveness)을 계량한다.

- **점진성**: 동일 대상을 반복 review 할 때, ontology 축적·learning 승격 등에 의해 소요 시간이 감소하는 현상
- **없으면**: 시스템이 실제로 시간·비용을 절감하는지 판단할 근거가 없다

## 2. 데이터 원천

| 원천 파일 | 위치 | 역할 |
|---|---|---|
| `execution-result.yaml` | `.onto/review/{session_id}/` | 세션 전체 + per-lens 타이밍, lens 참여·탈락 정보 |
| `review-record.yaml` | `.onto/review/{session_id}/` | request_text, created_at, record_status |
| `binding.yaml` | `.onto/review/{session_id}/` | review 대상 파일 경로 (resolved_target_scope.resolved_refs) |

## 3. Reader 계약

### 3.1 진입점

```typescript
collectReviewLogs(reviewRoot: string, projectRoot: string): ReviewLogSummary
```

- `reviewRoot`: `.onto/review` 디렉터리 절대 경로
- `projectRoot`: 프로젝트 루트 절대 경로 (대상 파일 경로 정규화용)

### 3.2 세션 선택 기준

- 디렉터리 이름이 `YYYYMMDD-hexid` 패턴인 것
- `execution-result.yaml` 이 존재하는 세션만 수집 (미완료 세션 제외)

### 3.3 출력: ReviewLogEntry

세션 1건 당 1개. 주요 필드:

| 필드 | 설명 |
|---|---|
| `session_id` | 세션 식별자 |
| `created_at` | 세션 생성 시각 |
| `review_target_refs` | 대상 파일 경로 (프로젝트 상대 경로) |
| `total_duration_ms` | 세션 전체 소요 시간 |
| `per_lens_duration` | 개별 lens 소요 시간 + timestamp provenance |
| `provenance_summary` | provenance 분류별 lens 수 |

### 3.4 출력: ProgressivenessMetric

동일 대상 반복 review 그룹별 1개. 2회 미만 그룹은 제외.

| 필드 | 설명 |
|---|---|
| `target_group_key` | 대상 파일 경로 정렬 후 join 한 그룹 키 |
| `session_count` | 해당 대상 총 review 횟수 |
| `first_duration_ms` | 첫 review 소요 시간 |
| `latest_duration_ms` | 최근 review 소요 시간 |
| `duration_delta_ms` | 시간 변화량 (음수 = 개선) |
| `duration_delta_ratio` | 변화 비율 (-0.3 = 30% 단축) |

## 4. 그룹화 규칙

동일 대상 판정: `review_target_refs` 를 알파벳순 정렬 후 join 한 문자열이 일치하면 동일 그룹.

- 파일 순서만 다른 경우 → 동일 그룹
- 대상 파일이 1개라도 다르면 → 별도 그룹
- target_refs 가 빈 세션 → 그룹에서 제외

## 5. Provenance 제약

per-lens 타이밍 비교 시 `timestamp_provenance` 를 반드시 참조해야 한다:

- `runner_wallclock` / `coordinator_derived`: per-unit 비교 가능
- `batch_window` / 부재: per-unit 비교 불가. 세션 수준 `total_duration_ms` 만 사용

이 제약은 `artifact-types.ts` 의 `isPerUnitComparableProvenance()` 과 일치한다.

## 6. 소비자

| 소비자 | W-ID | 사용 방식 |
|---|---|---|
| review-r+ (ontology-present) | W-A-75 | ontology 있을 때 점진성 향상 정도 측정 |
| review-r− (ontology-absent) | W-A-76 | ontology 없을 때 기준선 비용 측정 |
| onto:health | W-A-59 | 학습 건강도 대시보드에 점진성 지표 노출 |
| refresh protocol | — | §4 진행률 모니터링 참조 데이터 |
