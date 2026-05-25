---
as_of: 2026-04-14
status: active
functional_area: review-ontology-absent-path
purpose: |
  review 활동이 ontology 부재 시 codebase scan + ad-hoc grounding 으로 수행되는
  경로(r− path) 의 계약. r+ 경로 대비 품질 저하가 어디서 발생하고, 그 저하를
  어떻게 측정하는지 정의한다.
authority_stance: non-authoritative-design-surface
canonicality: canonical-advancing
source_refs:
  w_id: "W-A-76 (DL-029 review-r− — ontology-absent path)"
  onto_direction: "development-records/evolve/20260413-onto-direction.md §1.4 — review 완료 기준 3: ontology 유무 경로 분기"
  dl_provenance: "DL-029 (DR-M06-04 Option A — r+/r− 2-path split)"
  paired_contract: ".onto/processes/review/ontology-path.md (W-A-75, r+ path)"
  classifier_impl: "src/core-runtime/review/ontology-path-classifier.ts"
  domain_absent_reader: "src/core-runtime/readers/scan-local.ts"
  upstream_metric_seat: "src/core-runtime/readers/review-log.ts (W-A-71 점진성 seat)"
---

# Review — Ontology-Absent Path (r−) Contract

## 1. 목적

review 활동의 **ontology 유무 경로 분기** 중 "ontology seat 이 부재한 경우" 의 수행 계약.

- **r− path 정의**: 프로젝트에 ontology seat (`code-mapping.yaml` / `behavior.yaml` / `model.yaml` 혹은 등가 glossary/actions/transitions YAML) 이 존재하지 않아, review lens 가 codebase scan 산출(`ScanResult`) 과 lens 자체의 사전 학습 지식에 의존하여 grounding 하는 경로.
- **없으면**: review 는 ontology 가 없는 프로젝트에서 시작할 수 없게 되고, "ontology 투자의 전(前) 단계" 비용이 정의되지 않아 투자 효과를 가늠할 base line 이 소실된다.

## 2. r− path 수행 계약

### 2.1 입력

| 항목 | 위치 | 역할 |
|---|---|---|
| codebase | `{project_root}` 또는 target scope 지정 경로 | 스캔 대상 |
| scan 결과 | `scanLocal({ type: "add-dir", path })` → `ScanResult` | 유일한 grounding source |
| review 세션 artifact | `.onto/review/{session_id}/` | 실행 로그·타이밍 |

### 2.2 Reader 파이프라인

```
scanLocal(source)
  → ScanResult {
      files: FileEntry[],           // 파일 경로 + category + size_bytes
      content_hashes: { [key]: string },
      dependency_graph, api_patterns, schema_patterns, config_patterns, doc_structure
    }
```

`scanLocal` 은 patterns/ 모듈이 활성화되면 `dependency_graph` / `api_patterns` / `schema_patterns` / `config_patterns` / `doc_structure` 까지 채운다. 현재 프로젝트에서 patterns/ 는 deferred 상태이므로 기본 grounding surface 는 `files` + `content_hashes` 에 국한된다 (scan-local.test.ts §W-A-76 §1, §3 증빙).

### 2.3 r− 경로에서의 review lens 기대 동작

- lens 는 `ScanResult.files` 를 "스캔 가능한 전체 대상" 으로 받아, request_text 와 대상 refs 로부터 관련 파일을 **자체 판단** 하여 읽는다.
- entity / action / transition 같은 구조화된 grounding 은 없으므로 lens 는 **pretrained domain 지식 + 파일 내용 직접 파싱** 으로 판단 근거를 구성한다.
- **ad-hoc prompt 성격**: r+ 에서처럼 `OntologyQueryResult` / `ResolvedLocation` 을 prompt 에 포함하지 못하므로, prompt 는 "대상 파일 list + request_text" 만으로 lens 의 해석을 유도하는 **ad-hoc grounding** 이 된다.

### 2.4 r− 경로의 구조적 한계

- scan-local 은 ontology YAML 파일이 존재하더라도 그 **구조를 해석하지 않는다** — 단순 파일 entry 로 목록화만 한다 (scan-local.test.ts §2 증빙). 이것이 r− 경로의 구조적 경계다.
- lens 는 entity 매칭 실패 / 잘못된 action 인용 / 존재하지 않는 transition 추정 같은 **grounding 오류** 위험에 더 노출된다.

## 3. r+ 대비 품질 저하 측정 계약

### 3.1 지표 정의

r+ 대비 r− 의 품질 저하는 `PathDeltaMetric` (ontology-path.md §4.2) 로 관측한다:

| 지표 | 저하 해석 |
|---|---|
| `duration_delta_ms > 0` | r− 가 r+ 보다 느림 → 경로 변경으로 인한 비용 증가 |
| `duration_ratio > 1` | 비용 비율 증가 |
| `degraded_ratio_delta > 0` | r− cohort 의 degraded lens 비율이 더 높음 → **품질 저하 시그널** |

### 3.2 측정 가능 조건

- 동일 프로젝트 또는 동일 대상 그룹 내에서 r+ 와 r− 세션이 **둘 다 존재** 해야 delta 가 산출된다.
- 현재 구현은 "환경 수준 분기" — project 전체가 r+ 또는 r− 둘 중 하나. 따라서 동일 project 내 delta 는 ontology seat 도입 **이전/이후** 로 시간 축 비교가 된다.
- per-session 혼합 delta 측정은 `session_overrides` 옵션을 통한다 (classifier.test.ts §"혼합 cohort" 증빙). 향후 review artifact 에 per-session `ontology_consulted` 필드가 도입되면 overrides 가 자동 공급된다.

### 3.3 baseline 기준선 확보

r− cohort 가 존재하지 않으면 r+ 의 "투자 효과" 를 정량화할 수 없다. 따라서 다음 운영 원칙이 따른다:

- ontology seat 을 도입하기 **이전 세션 기록은 보존** 한다 (`.onto/review/` 이하 미완료 포함 모든 세션).
- ontology seat 도입 이후에도, seat 미비(누락·형식 오류·empty YAML)로 인한 r− 세션이 발생하면 기록한다 — 이는 r+ 운영 안정성의 경고 지표가 된다.

## 4. 한계와 미해결 항목

- **grounding 오류 식별 수단 부재**: 현재 r− cohort 의 "ontology 오인용" 을 직접 카운트할 수단이 없다. degraded_lens_ratio 가 간접 proxy. 직접 측정은 별도 lens-level metric seat 확장 과제.
- **Scan fidelity 가변**: patterns/ 모듈의 deferred 상태로 인해 r− grounding 의 surface 가 현재는 files/content_hashes 중심으로 좁다. patterns/ 활성화 시 surface 확장과 함께 baseline 이 재조정되어야 한다.
- **cross-project r+/r− 비교**: delta 는 동일 projectRoot 내부 집계. 프로젝트 간 비교는 호출자가 classification 산출물을 합산해 수행.

## 5. 소비자

| 소비자 | 사용 방식 |
|---|---|
| W-A-76 evidence | 본 계약 + scan-local.test.ts §W-A-76 + classifier 혼합 cohort 테스트 가 completion_criterion 증빙 |
| W-A-75 (ontology-path.md) | 쌍 계약이 본 계약의 baseline 정의를 인용 |
| onto:health (W-A-59) | seat 누락 시 r− 경보 + cohort delta 표시 |
| refresh protocol | ontology 도입 전/후 비용·품질 변화 추적 |
