# Learning Health Dashboard

> 학습 풀의 현재 상태를 집계하여 보고한다.
> 에이전트 스폰 불필요 — 팀 리드가 직접 파일을 읽고 집계한다.

### 1. Target Determination

- `$ARGUMENTS` 없음 → 글로벌 학습 (`~/.onto/learnings/*.md`)
- `$ARGUMENTS` = "product" → product 학습 (`{product}/.onto/learnings/*.md`). legacy alias `"project"` 도 수용 (framework v1.0 §8.5 retire, legacy_alias_governance.scope_migration 참조)

### 2. Data Collection

각 학습 파일에서 다음을 집계한다:
- 총 항목 수 (grep `^\- \[`)
- 축 태그 분포: methodology-only / domain-only / dual-tag
- 목적 유형 분포: guardrail / foundation / convention / insight
- 타입 분포: fact / judgment
- 파일 행 수
- Event marker 수 (grep `applied-then-found-invalid`)
- Tag-incomplete marker 수 (grep `tag-incomplete`)
- Consolidated marker 수 (grep `consolidated into`)
- Retention-confirmed marker 수 (grep `retention-confirmed`)
- 도메인 목록 (grep `\[domain/` → 고유값 추출)

### 3. Output

## Learning Health Dashboard

### {Global/Project} Learnings ({path})

| Metric | Value |
|--------|-------|
| Total entries | N |
| Files | N |
| Largest file | {agent} ({N} lines) |

### Axis Distribution
| Tag | Count | % |
|-----|-------|---|
| methodology-only | N | N% |
| domain-only | N | N% |
| dual-tag | N | N% |

### Purpose Distribution
| Tag | Count |
|-----|-------|
| guardrail | N |
| foundation | N |
| convention | N |
| insight | N |

### Type Distribution
| Tag | Count | % |
|-----|-------|---|
| fact | N | N% |
| judgment | N | N% |

### Health Indicators
| Indicator | Status | Note | 권장 조치 |
|-----------|--------|------|----------|
| File size | {OK/NOTICE/WARNING} | 최대 {N}행 (100행 = 주의, 200행 = 조치 권고) | learn promotion design에서 consolidation 검토 |
| Event markers | {N} pending | {퇴역 후보 수} | learn promotion design에서 후보로 표면화 |
| Tag-incomplete | {N} | Creation gate 실패 수 | 해당 학습 항목의 태그 수동 보완 |
| Consolidated | {N} | Cross-agent dedup 수행 수 | 정보만 — 조치 불필요 |

### Domains Referenced
{domain1} ({N}), {domain2} ({N}), ...

### 4. No learning storage

이 프로세스는 읽기 전용이다. 학습을 생성하거나 수정하지 않는다.
