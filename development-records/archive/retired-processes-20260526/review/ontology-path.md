---
as_of: 2026-04-14
status: active
functional_area: review-ontology-present-path
purpose: |
  review 활동이 ontology 를 grounding 으로 사용하는 경로(r+ path) 의 계약.
  ontology 존재 시 review 가 어떻게 비용·품질을 향상시키는지, 그리고 그 효과를
  어떻게 계측하는지를 정의한다.
authority_stance: non-authoritative-design-surface
canonicality: canonical-advancing
source_refs:
  w_id: "W-A-75 (DL-029 review-r+ — ontology-present path)"
  onto_direction: "development-records/evolve/20260413-onto-direction.md §1.4 — review 완료 기준 3: ontology 유무 경로 분기"
  dl_provenance: "DL-029 (DR-M06-04 Option A — r+/r− 2-path split)"
  paired_contract: ".onto/processes/review/ontology-absent-path.md (W-A-76)"
  classifier_impl: "src/core-runtime/review/ontology-path-classifier.ts"
  upstream_metric_seat: "src/core-runtime/readers/review-log.ts (W-A-71 점진성 seat)"
---

# Review — Ontology-Present Path (r+) Contract

## 1. 목적

review 활동의 **ontology 유무 경로 분기** 중 "ontology 가 존재하는 경우" 의 수행 계약.

- **r+ path 정의**: 프로젝트에 ontology seat (`code-mapping.yaml` / `behavior.yaml` / `model.yaml` 혹은 등가 glossary/actions/transitions YAML) 이 존재하여, review lens 가 ontology-resolved code location / action / transition 을 grounding source 로 사용할 수 있는 경로.
- **없으면**: review lens 는 codebase 전체 scan 에 의존해야 하며, 비용 증가 + 잘못된 entity 매칭 위험이 상존한다. ontology 투자의 효과를 계량할 근거도 없다.

## 2. r+ / r− 분기 결정 정책

### 2.1 환경 수준 분기 (현재 구현)

`classifyReviewPaths(entries, projectRoot)` 가 프로젝트 루트의 `ontology/` 및 `.onto/authority/` 하위 (기본 `search_roots`) 에서 ontology seat 파일명을 탐지하여 전체 세션을 일괄 라벨링한다.

| 조건 | 라벨 |
|---|---|
| seat ≥ 1 존재 | 모든 세션 **r+** |
| seat 0 | 모든 세션 **r−** |

### 2.2 Per-session 분기 (향후 확장)

현재는 "프로젝트에 seat 이 있었다" → "세션이 ontology 를 소비했다" 를 1:1 매핑으로 취급한다. 향후 review artifact 에 per-session `ontology_consulted` 필드를 도입하면 classifier 는 세션별 소비 흔적을 우선 참조하고, 부재 시 환경 수준 판정을 사용한다.

## 3. r+ path 수행 계약

### 3.1 입력

| 항목 | 위치 | 역할 |
|---|---|---|
| ontology seat | `{project_root}/{search_root}/{code-mapping,behavior,model}.yaml` | grounding source |
| review 세션 artifact | `.onto/review/{session_id}/` | 실행 로그·타이밍 |
| scan 결과 | `src/core-runtime/readers/scan-local.ts` 산출 | 파일 경로 해석용 |

### 3.2 Reader 파이프라인

```
buildOntologyIndex(glossaryYaml, actionsYaml, transitionsYaml)
  → OntologyIndex { glossary, actions, transitions }
queryOntology(index, keywords)
  → OntologyQueryResult { matched_entities, code_locations, ... }
resolveCodeLocations(code_locations, files)
  → ResolvedLocation[]  // 파일 경로 해결
```

참고: 이 3-stage 파이프라인은 `src/core-runtime/evolve/commands/start.ts` 에서 design 활동이 이미 소비한다. review 측 소비는 향후 review pipeline 확장에서 연결되며 본 계약은 **인터페이스 기대치** 를 고정한다.

### 3.3 r+ 경로에서의 review lens 기대 동작

- lens 는 `OntologyQueryResult.code_locations` 와 `ResolvedLocation[]` 을 grounding 으로 사용하여, entity·action 매칭된 파일만 우선 검토한다 (전역 scan 회피).
- 매칭된 action 의 `preconditions` / `state_transitions` / `guards` 를 review 판단 근거로 인용한다.
- **grounding 기록**: lens output 이 ontology 를 참조하면 그 사실을 해당 lens output artifact 내부에 명시 (향후 W-A-NN 에서 schema 확정).

## 4. 계측 계약

### 4.1 경로별 집계 지표

`classifyReviewPaths` 는 각 cohort (r+ / r−) 에 대해 아래 집계를 산출한다 (`PathCohortMetric`):

| 필드 | 설명 |
|---|---|
| `session_count` | cohort 의 세션 수 |
| `avg_duration_ms` | cohort 평균 session duration |
| `avg_degraded_lens_ratio` | cohort 평균 degraded lens ratio (degraded / lens_count) |

### 4.2 경로 간 delta 지표

`PathDeltaMetric` 은 r+ vs r− 비교를 노출한다:

| 필드 | 해석 |
|---|---|
| `duration_delta_ms` | r+ 평균 − r− 평균. **음수 = r+ 가 더 빠름 (목표)** |
| `duration_ratio` | r+ 평균 / r− 평균. 1 미만이면 비용 개선 |
| `degraded_ratio_delta` | r+ degraded − r− degraded. **음수 = r+ 가 품질 저하 적음 (목표)** |

### 4.3 §1.0 점진성 연계

r+ path 에서 동일 대상 반복 review 시 시간 감소는 `ProgressivenessMetric.duration_delta_ratio` (review-log-contract §3.4) 로 읽는다. r+ 환경이 유지된 상태에서의 점진성은 "ontology 활용으로 인한 1차 효과 위에 learning 축적으로 인한 2차 효과" 를 합한 지표로 해석된다.

## 5. 한계와 미해결 항목

- **환경 수준 분기의 한계**: "프로젝트에 seat 있음" 과 "세션이 실제 ontology 소비함" 은 이론상 동일하지 않다. 현재 계약은 review pipeline 이 ontology seat 존재 시 이를 반드시 소비한다는 보수적 가정에 기댄다.
- **Per-session 소비 기록 미도입**: 이는 별도 W-ID 에서 review artifact schema 확장으로 해결한다. 본 계약은 그 확장이 들어올 때까지의 interim surface.
- **Cross-project 비교**: 현재 delta metric 은 동일 projectRoot 내부 cohort 간 비교만 지원. 프로젝트 간 비교 (예: ontology 투자 전후) 는 classification 산출물을 외부에서 합산해 사용.

## 6. 소비자

| 소비자 | 사용 방식 |
|---|---|
| W-A-75 evidence | 본 계약 + classifier + 15/15 unit test 가 completion_criterion 증빙 |
| W-A-76 | 쌍(ontology-absent-path.md) 계약이 본 계약을 참조 |
| onto:health (W-A-59) | cohort delta 를 건강도 대시보드에 노출 |
| refresh protocol | §4 진행률 모니터링에 path delta 추세 반영 |
