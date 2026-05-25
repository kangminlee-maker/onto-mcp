# Learning Promotion Process

> 학습 품질 보증(Learning Quality Assurance) — 다음 3가지 활동을 수행한다:
> 1. **승격(Promotion)**: project-level 학습의 global-level 승격
> 2. **큐레이션(Curation)**: 기존 global 학습의 축 태그 재평가 및 교차 에이전트 중복 제거
> 3. **감사(Audit)**: judgment 학습 재검증 및 event marker 보유 학습 퇴역 검토
>
> 프로세스 이름 "promote"는 활동 1에서 유래하며, 활동 2-3을 포함하는 확장된 범위를 갖는다.
> Related: Learnings accumulated from reviews (`.onto/processes/review.md`) or queries (`.onto/processes/question.md`) are the target.
>
> **W-D-05 용어 정렬 (2026-04-16)**: 본 프로세스의 활동 1 (승격) 은 `learning_scope_promotion`
> canonical term 으로 지칭한다 (.onto/authority/core-lexicon.yaml#learning_scope_promotion). 대상은
> learning artifact 의 저장 경계 이동만 포함 — legacy `project → user` path (framework v1.0 §8.5 에서 retire, lexicon legacy_alias_governance.scope_migration 참조) 는 framework 의 `generalize` 전이에 대응. lexicon term 대상의 이동은
> `lexicon_term_promotion`, knowledge → principle 본문 승격은 `learning_to_principle_promotion`
> (W-C-03 미구현) 로 분리된다. 세 `*_promotion` term 의 의존 그래프는 `.onto/processes/govern.md §12` 참조.

학습 품질 보증(LQA)을 수행한다. product-scope learnings (`{product}/.onto/learnings/`)의 global-level 승격, 기존 global 학습의 축 태그 재평가와 교차 에이전트 중복 제거, judgment 학습 재검증 및 event marker 보유 학습 퇴역 검토를 포함한다.

### Prerequisites

- The `{product}/.onto/learnings/` directory must exist.
- At least one product-scope learning file must exist.
- If prerequisites are not met, inform the user and halt.

**Domain resolution**: Promote does not use session domain selection. Domains are automatically determined from learning tags' `[domain/X]`. Learnings without domain tags are promoted as methodology-only.

**Note**: 활동 1(승격)은 product-scope learnings 존재를 필요로 한다. 활동 2(큐레이션)와
활동 3(감사)은 global learnings를 대상으로 하므로 product-scope learnings 없이도
원칙적으로 실행 가능하나, 현재는 promote 전체가 단일 트리거로 실행되므로
product-scope learnings 존재를 전제로 한다. 이것은 의도적 결합이다.

### 1. Target Collection

**If $ARGUMENTS is provided**: Collects only the specified agent's learning file.
- Example: `/promote-learnings logic` → only `{product}/.onto/learnings/logic.md` is targeted

**If $ARGUMENTS is not provided**: Collects all `*.md` files under `.onto/learnings/`.

For each file:
- Product-scope learning: each entry in `{product}/.onto/learnings/{agent-id}.md`
- Global learning: existing entries in `~/.onto/learnings/{agent-id}.md`

### 2. Pre-Analysis

Compares each product-scope learning entry against global learnings and classifies:

| Classification | Criteria | Action |
|---|---|---|
| **Duplicate** | Identical or near-identical content already exists in global (string-level match). Note: semantic-level deduplication ("same principle, different domain phrasing") is handled in Step 3 criterion 5, not here. | Excluded from promotion targets |
| **Contradiction** | Conflicts with existing global entry | Explicit judgment required during review |
| **New** | New learning not in global | Promotion candidate |

### 3. Generalizability Review

Reviews promotion candidates (new + contradiction) via a 3-agent panel.
Follows the **Agent Teams Execution** in `process.md` (including error handling rules and structure coordinator role).
Creates a team (`onto-promote`) via TeamCreate and creates the 3 reviewers as teammates.
Initial prompt: use the **Teammate Initial Prompt Template** from `process.md` (team_name: `onto-promote`).
The team lead (structure coordinator) delivers review directives to the 3 reviewers via **individual SendMessage**.
If a review agent is non-responsive, exclude that agent and determine consensus with the remaining agents (adjusts the consensus denominator).

**Review agent selection**:
- The lens that originally generated the learning
- `axiology` (purpose/value alignment perspective)
- One other lens most relevant to the learning content (auto-selected)

Content to deliver to each review agent:

```
You are {role}.
Please review whether the project-level learnings below should be promoted to global.

[Domains]
{domains derived from learning tags' [domain/X] — list all unique domains found in candidates}

[Promotion Candidates]
{item list — each item includes new/contradiction tag + axis tags}

[Existing Global Learnings]
{full global learnings for the agent}

[Judgment Criteria]
1. Generalizability: Is this learning valid only in this project, or also valid in other projects?
2. Accuracy: Is the learning content based on facts, or a coincidence from a unique situation?
3. Contradiction handling: If it contradicts an existing global learning, which is more generally correct?
4. **Axis tag appropriateness (승격 후보 + 기존 global 재평가)**:
   - 승격 후보: Apply 2+1 stage test per learning-rules.md.
     For entries with uncertainty flags: resolve using 3-agent panel's domain knowledge.
   - tag-incomplete 마커(`<!-- tag-incomplete: ... -->`) 보유 항목: 우선 검토.
   - 기존 global 재평가: 동일 에이전트 파일 내 dual-tag([methodology] + [domain/X])
     항목에 Stage A를 재적용. 승격 이후 축적된 도메인 경험을 기준으로 판단.
     Stage A 실패(도메인 용어 제거 시 원칙 소멸) → [methodology] 제거를 권고.
     재평가 결과는 Step 5 User Approval에 "Axis Tag Re-evaluation" 섹션으로 표시.
     태그 변경은 User Approval Tier "정보 변경"에 해당 → 일괄 승인/거절.
5. **Deduplication**: Is this candidate a domain variant of an existing
   global learning that expresses the same principle?

   "Same principle" test (2-step):
   (a) Remove domain-specific terms from both candidate and existing entry.
       Do the remaining sentences prescribe the same action?
   (b) Can you identify a situation where one applies but the other does not?
       If yes, they are different principles.

   If same principle: recommend consolidation.
   - Consolidated format (inline, flat-compatible):
     `- [{type}] [{axis tags}] [{purpose type}] General principle statement.
       (Representative cases: domain-A에서 X; domain-B에서 Y; domain-C에서 Z)
       (source: consolidated from [sources])`
   - Retain up to 3 representative cases. Maximize domain diversity.
   - citation_count of consolidated entry = max(original entries).
   - Original entries preserved as `<!-- consolidated into: [principle] -->`.

   Note: The "same principle" test defined above is also used by criterion 6
   with a different removal target (agent-specific framing instead of
   domain-specific terms).

6. **Cross-agent deduplication (교차 에이전트 중복 제거)**:
   승격 후보 및 기존 global 학습 전체에서, 다른 에이전트 파일에 동일 원칙이
   관점만 달리하여 반복되는 항목을 식별한다.

   Same-principle test: criterion 5와 동일한 테스트를 사용하되,
   제거 대상이 다르다:
   - criterion 5: domain-specific terms 제거 후 비교
   - criterion 6: agent-specific framing 제거 후 비교

   Primary owner 결정: 원칙의 내용에 가장 가까운 검증 차원의 에이전트.
   Tiebreaker: 먼저 생성된 학습의 에이전트가 primary owner.

   통합 형식: criterion 5의 consolidated format을 준용.
   비주(non-owner) 파일의 원본은 `<!-- consolidated into: [principle] -->` 주석 처리.

   실행 모델: 단일 주체(`axiology` 또는 designated reviewer lens)가 순차 실행.
   Step 3의 다른 criteria는 3-agent 병렬이나, criterion 6만 단일 순차.
   양방향 삭제 위험을 방지하기 위함.

   User Approval: 통합은 복합 연산(생성 + 주석 처리)이므로
   가장 엄격한 티어 적용 → 항목별 승인.

**Step 3 내 실행 순서**:
criterion 4 (축 태그 재평가) → criterion 6 (교차 에이전트 중복 제거) →
criterion 5 (후보 vs global 중복 제거).

이유: 태그 변경은 중복 판정에 영향을 미치고, 중복 제거는 비율에 영향을 미친다.
역전 시 중간 결과 불일치가 발생한다.

[Report Format]
For each item:
- Judgment: promote / defer / reject
- Reason: (1 sentence)
- Axis tag judgment: retain current tags / add tag ({additional tag}) / modify tag
- If a contradiction item: whether to replace the existing global entry or defer
```

#### Error Recovery

> process.md Error Handling Rules의 Retry Protocol을 적용한다.
> 감지 시점: 패널 에이전트 전원 응답 완료 시 미응답 에이전트.
> promote 고유 사항: 없음 (review.md와 동일 패턴).

### 4. Consensus Judgment

Aggregates the 3 reviewers' results:

| Consensus | Action |
|---|---|
| 3/3 promote | Automatic promotion candidate |
| 2/3 promote | Promotion candidate (minority opinion attached) |
| 2/3 or more defer | Defer |
| 2/3 or more reject | Reject |

**Contradiction items**: Regardless of consensus, always require user confirmation.

### 4a. Event Marker Review

Event marker(`<!-- applied-then-found-invalid: ... -->`)가 2개 이상 부착된 global 학습을 식별하여 퇴역 후보로 분류한다.

**실행 조건**: event marker 2개 이상 보유 학습이 존재할 때. Judgment 재검증(Step 8)의 "10개 이상" 조건과 독립적으로 실행된다.

**`<!-- retention-confirmed: ... -->` 마커 처리**: retention-confirmed 이후에 새로 추가된 event marker만 카운트한다.

**출력**: Step 5 User Approval에 "Event Marker Review" 섹션으로 포함.

**Note**: 이 단계의 분석 로직은 Step 5 이전에 실행되어야 하므로 Step 4a에 배치한다.
Event marker에 기반한 퇴역은 process.md의 Consumption Feedback 정의를 참조한다.

### 5. User Approval

Presents the judgment results to the user:

```markdown
## Learning Promotion Review Result

### Domains: {domains derived from learning tags}
### Target Agents: {agent-id list}

---

### Recommended for Promotion (N items)
| # | Agent | Learning Content | Consensus | Axis Tags | Notes |
|---|---|---|---|---|---|
| 1 | {agent} | {content summary} | 3/3 | [methodology] [domain/SE] | |
| 2 | {agent} | {content summary} | 2/3 | [domain/SE] | Minority opinion: {reason} |

### Contradiction — User Judgment Required (N items)
| # | Agent | Project Learning | Existing Global | Panel Recommendation |
|---|---|---|---|---|
| 1 | {agent} | {project entry} | {global entry} | {replace/defer} |

### Deferred (N items)
| # | Agent | Learning Content | Reason |
|---|---|---|---|

### Rejected (N items)
| # | Agent | Learning Content | Reason |
|---|---|---|---|

---

Please specify which items to promote. (e.g., "promote all", "promote 1,3", "replace contradiction #1")
```

### 6. Promotion Execution

Processes only user-approved items:

- **New promotion**: Appends the entry to `~/.onto/learnings/{agent-id}.md` (with axis tags).
  - Changes the source to `(source: promoted from {project name}, {original source}, {promotion date})`.
- **Contradiction replacement**: Replaces the existing global entry with the new entry.
  - Preserves the replaced entry as `<!-- replaced ({date}): {original content} -->` in a comment.
- **Product-scope learning cleanup**: Tags promoted entries with `(-> promoted to global, {date})`. Does not delete them.

### 7. Domain Document Update Proposal

Automatically detects items among promoted domain learnings that match the following conditions.

**Selection rationale for the 3 update targets** (by agent-domain document coupling type):
- `concepts.md` (accumulable): terminology definitions are naturally extracted from learnings
- `competency_qs.md` (accumulable): competency questions are naturally extracted from learnings
- `domain_scope.md` (scope-defining): domain scope discoveries are extracted from learnings
- The remaining 4 types (`logic_rules.md`, `structure_spec.md`, `dependency_rules.md`, `extension_cases.md`) are rule-defining; automatic extraction from learnings risks baseline contamination, so manual management is recommended.

| Condition | Target Document | Judgment Criteria |
|---|---|---|
| Learnings about concept definitions, term mappings, synonyms/homonyms | `concepts.md` | When the learning is from `semantics` and concerns term definitions/distinctions/mappings |
| Learnings about competency questions, query paths, usage scenarios | `competency_qs.md` | When the learning is from `pragmatics` and is in the form "should be able to answer this question" |
| Learnings about domain scope, sub-areas, required concept categories | `domain_scope.md` | When the learning is from `coverage` and concerns domain scope/sub-areas/reference standards |

If items are detected, proposes to the user:

```markdown
## Domain Document Update Proposal

Among promoted learnings, there are items that can be reflected in domain documents.

### concepts.md Update Candidates (N items)
| # | Learning Content | Reflection Form |
|---|---|---|
| 1 | {learning summary} | {add term / modify definition / add mapping} |

### competency_qs.md Update Candidates (N items)
| # | Learning Content | Reflection Form |
|---|---|---|
| 1 | {learning summary} | {add question / modify question / delete question} |

### domain_scope.md Update Candidates (N items)
| # | Learning Content | Reflection Form |
|---|---|---|
| 1 | {learning summary} | {add sub-area / modify scope / add standard} |

Please specify which items to reflect. (e.g., "concepts all", "domain_scope #1 only")
If the document does not yet exist, it will be created.
```

Upon user approval:
- If the document does not exist, creates `~/.onto/domains/{domain}/concepts.md` or `competency_qs.md`.
- If the document exists, adds to/modifies the existing content.
- If no items are detected, skips this step.

### 8. Judgment Learning Re-verification

If any agent has accumulated 10 or more `[judgment]`-type learnings, re-verifies the contextual validity of existing judgment learnings. (Event marker review is handled independently in Step 4a.)

```markdown
## Judgment Learning Re-verification

{agent-id} has accumulated {N} judgment learnings. Re-verifying contextual validity.
Re-verification criteria: Is this judgment still valid in the current context?

| # | Judgment Learning | Source | Verdict |
|---|---|---|---|
| 1 | {learning content} | {source} | retain / delete / modify |
```

### 9. Completion Report

```markdown
## Promotion Complete

| Action | Count |
|---|---|
| Promoted (new) | N items |
| Promoted (replaced) | N items |
| Deferred | N items |
| Rejected | N items |
| Duplicate (pre-excluded) | N items |
| Document update | N items |
| Judgment learning deleted/modified | N items |

Global learning path: `~/.onto/learnings/`

### Collection Health Snapshot

| Metric | Value |
|--------|-------|
| Total global learnings | N |
| Axis distribution: methodology-only / domain-only / dual | N% / N% / N% |
| Purpose distribution: guardrail / foundation / convention / insight | N / N / N / N |
| Judgment ratio | N% |
| Cross-agent dedup candidates remaining | N clusters |
| Axis tag re-evaluation changes this session | N items |
| Event marker review candidates | N items |
| Creation gate failures (tag-incomplete markers) | N items |
| Applied Learnings yes/no aggregate | yes: N / no: N (from review results in scope) |

### Separation Trigger Check
- 에이전트당 학습 파일 100행 초과: {list or "none"}
- 분리 1차 후보: criterion 4(태그 재평가), criterion 6(교차 에이전트 중복 제거)
- 트리거 발동 시: 별도 설계 세션을 실행하여 분리 방법을 결정한다.

(Note: 시계열 비교(Previous/Δ)는 현재 규모에서 구현하지 않는다.
주체자가 직전 promote 보고서와 수동 비교하여 추세를 판단한다.)
```
