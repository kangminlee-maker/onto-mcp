# AGENTS

> 상태: Active
> 목적: 이 레포에서 작업하는 에이전트가 핵심 authority와 개발 기준을 빠르게 찾도록 한다.

---

## 1. Position

이 레포는 `onto` 프로토타입을 보존하면서 `ontology as code` 기준으로 서비스화하는 전환 레포다. 현재 제품 방향은 TS core를 유지하고 Codex/Claude/기타 host가 호출할 수 있는 MCP-native tool surface를 추가하는 것이다.

- reference prototype + prompt-backed reference execution source + TS product core + MCP tool surface

---

## 2. Authority Hierarchy

문서가 충돌하면 아래 우선순위를 따른다. 상세 위계는 `CLAUDE.md`를 참조한다.

| 순위 | 파일 | 폴더 |
|---|---|---|
| 1 | [core-lexicon.yaml](/Users/kangmin/cowork/onto-mcp/.onto/authority/core-lexicon.yaml) | .onto/authority/ |
| 2 | [ontology-as-code-guideline.md](/Users/kangmin/cowork/onto-mcp/.onto/principles/ontology-as-code-guideline.md) | .onto/principles/ |
| 2 | [llm-native-development-guideline.md](/Users/kangmin/cowork/onto-mcp/.onto/principles/llm-native-development-guideline.md) | .onto/principles/ |
| 2 | [product-locality-principle.md](/Users/kangmin/cowork/onto-mcp/.onto/principles/product-locality-principle.md) | .onto/principles/ |
| 3 | [productization-charter.md](/Users/kangmin/cowork/onto-mcp/.onto/principles/productization-charter.md) | .onto/principles/ |
| 4 | [llm-runtime-interface-principles.md](/Users/kangmin/cowork/onto-mcp/.onto/principles/llm-runtime-interface-principles.md) | .onto/principles/ |
| 4 | [ontology-as-code-naming-charter.md](/Users/kangmin/cowork/onto-mcp/.onto/principles/ontology-as-code-naming-charter.md) | .onto/principles/ |

### 폴더 구조

| 폴더 | 역할 | 배포 |
|---|---|---|
| `.onto/authority/` | canonical data — 개념 SSOT + 런타임 설정 + 온보딩 보조 | 포함 |
| `.onto/principles/` | 개발 규범 — 설계·구현 원칙 (rank 2~4) | 제외 |
| `development-records/` | 개발 이력 — 감사, 설계, 추적, handoff 기록 | 제외 |

`review` 작업 시 추가로 읽을 문서:

1. [productized-live-path.md](/Users/kangmin/cowork/onto-mcp/.onto/processes/review/productized-live-path.md)
2. [nested-spawn-coordinator-contract.md](/Users/kangmin/cowork/onto-mcp/.onto/processes/review/nested-spawn-coordinator-contract.md)
3. [lens-registry.md](/Users/kangmin/cowork/onto-mcp/.onto/processes/review/lens-registry.md)
4. [interpretation-contract.md](/Users/kangmin/cowork/onto-mcp/.onto/processes/review/interpretation-contract.md)
5. [binding-contract.md](/Users/kangmin/cowork/onto-mcp/.onto/processes/review/binding-contract.md)
6. [lens-prompt-contract.md](/Users/kangmin/cowork/onto-mcp/.onto/processes/review/lens-prompt-contract.md)
7. [synthesize-prompt-contract.md](/Users/kangmin/cowork/onto-mcp/.onto/processes/review/synthesize-prompt-contract.md)
8. [issue-stance-deliberation-contract.md](/Users/kangmin/cowork/onto-mcp/.onto/processes/review/issue-stance-deliberation-contract.md)
9. selected domain `problem_framing_profile.md` if `session_domain` is not `none`
10. [execution-preparation-artifacts.md](/Users/kangmin/cowork/onto-mcp/.onto/processes/review/execution-preparation-artifacts.md)
11. [prompt-execution-runner-contract.md](/Users/kangmin/cowork/onto-mcp/.onto/processes/review/prompt-execution-runner-contract.md)
12. [record-contract.md](/Users/kangmin/cowork/onto-mcp/.onto/processes/review/record-contract.md)
13. [record-field-mapping.md](/Users/kangmin/cowork/onto-mcp/.onto/processes/review/record-field-mapping.md)

---

## 3. Core Principles

원칙은 .onto/principles/ 문서에 정의되어 있다. 재서술하지 않는다.

- **LLM/runtime 소유 분리**: READ `.onto/principles/llm-native-development-guideline.md`
- **Ontology as Code 규칙**: READ `.onto/principles/ontology-as-code-guideline.md`
- **인터페이스 원칙**: READ `.onto/principles/llm-runtime-interface-principles.md`
- **제품 방향·결정**: READ `.onto/principles/productization-charter.md`

---

## 4. Canonical Terms

개념 SSOT: [core-lexicon.yaml](/Users/kangmin/cowork/onto-mcp/.onto/authority/core-lexicon.yaml)
이름 규칙: [ontology-as-code-naming-charter.md](/Users/kangmin/cowork/onto-mcp/.onto/principles/ontology-as-code-naming-charter.md)

자주 쓰는 개념:

- `호출 해석 (InvocationInterpretation)` — LLM 소유
- `호출 고정 (InvocationBinding)` — runtime 소유
- `리뷰 기록 (ReviewRecord)` — primary artifact
- `맥락 격리 추론 단위 (ContextIsolatedReasoningUnit)` — lens 실행 원칙

---

## 5. Review Canonical Direction

현재 1순위 제품화 대상은 `검토 (review)`다.

canonical review 구조:

1. `호출 해석 (InvocationInterpretation)`
2. 주체자 확인 / 선택 확정
3. `호출 고정 (InvocationBinding)`
4. execution preparation artifacts
5. `9개 lens`
6. controlled lens deliberation
7. `종합 단계 (synthesize)`
8. `리뷰 기록 (ReviewRecord)`
9. human-readable final output

DO:
- `9개 lens → controlled lens deliberation → synthesize` 구조를 따른다
- issue-stance target에서는 surface finding을 root-cause issue cluster로 묶은 뒤 모든 lens stance를 기록하고 material conflict issue만 숙의한다
- `New Perspectives`는 `axiology`에서 제안한다
- `deliberation.md`가 contested lens position의 resolution authority다
- `synthesize`는 lens 결과와 `deliberation.md`를 보존적으로 종합한다

---

## 6. Context-Isolated Reasoning Units

`review lens`는 **맥락 격리 추론 단위 (ContextIsolatedReasoningUnit)** 로 실행되어야 한다.

핵심 속성:

1. 메인 콘텍스트와 상태를 공유하지 않는다
2. 계약된 입력만 받는다
3. 계약된 출력만 낸다
4. 독립적으로 판단한다

현재 wired execution profile:

- `main-workers` + Codex worker
- `main-workers` + direct-call provider
- `main-workers` + mock executor
- `nested-workers` + Codex worker bridge

기준 문서:

- [lens-registry.md](/Users/kangmin/cowork/onto-mcp/.onto/processes/review/lens-registry.md)
- [lens-prompt-contract.md](/Users/kangmin/cowork/onto-mcp/.onto/processes/review/lens-prompt-contract.md)
- [synthesize-prompt-contract.md](/Users/kangmin/cowork/onto-mcp/.onto/processes/review/synthesize-prompt-contract.md)
- [issue-stance-deliberation-contract.md](/Users/kangmin/cowork/onto-mcp/.onto/processes/review/issue-stance-deliberation-contract.md)
- [productized-live-path.md](/Users/kangmin/cowork/onto-mcp/.onto/processes/review/productized-live-path.md)

---

## 7. Artifact Truth

현재 `review`의 artifact truth:

- `interpretation.yaml`
- `binding.yaml`
- `session-metadata.yaml`
- `execution-plan.yaml`
- `execution-preparation/*`
- `deliberation/round1/*`
- `deliberation.md`
- `final-output.md`
- `review-record.yaml` ← primary artifact

issue-stance deliberation target artifact:

- `finding-ledger.yaml`
- `finding-relation-graph.yaml`
- `issue-ledger.yaml`
- `issue-stance-matrix.yaml`
- `deliberation-plan.yaml`
- `problem-framing.yaml`

`problem-framing.yaml` uses a common spine owned by the review contract and optional domain axes owned by `.onto/domains/{domain}/problem_framing_profile.md`.

관련 문서:

- [execution-preparation-artifacts.md](/Users/kangmin/cowork/onto-mcp/.onto/processes/review/execution-preparation-artifacts.md)
- [record-contract.md](/Users/kangmin/cowork/onto-mcp/.onto/processes/review/record-contract.md)
- [record-field-mapping.md](/Users/kangmin/cowork/onto-mcp/.onto/processes/review/record-field-mapping.md)

---

## 8. TypeScript Core

core 제품화 계층은 TypeScript다.

주요 entrypoint:

- `npm run review:invoke -- ...` (preferred)
- `npm run review:start-session -- ...`
- `npm run review:run-prompt-execution -- ...`
- `npm run review:complete-session -- ...`

관련 설정: [package.json](/Users/kangmin/cowork/onto-mcp/package.json), [tsconfig.json](/Users/kangmin/cowork/onto-mcp/tsconfig.json)

---

## 9. MCP-Native Boundary

장기 interface는 host별 slash command가 아니라 MCP tool call이다.

```text
.onto YAML/MD contracts
        -> TS core runtime
        -> MCP tool surface
        -> provider adapters
```

경계:

- `.onto/`와 `src/core-runtime/`이 `onto` 의미론을 소유한다.
- `src/core-api/`는 기존 runtime을 library처럼 부르는 facade다.
- `src/mcp/`는 tool schema와 server surface만 소유한다.
- `src/providers/`는 host별 실행 능력만 소유한다.
- External host integration은 provider evidence 또는 conformance harness로만 취급한다.

기준 문서:

- [DD-010](/Users/kangmin/cowork/onto-mcp/docs/decisions/DD-010-onto-mcp-native-tool-surface.md)
- [repo-layout.md](/Users/kangmin/cowork/onto-mcp/docs/architecture/repo-layout.md)
- [mcp-native-tool-surface.md](/Users/kangmin/cowork/onto-mcp/docs/architecture/mcp-native-tool-surface.md)

---

## 10. Current Priority

1. `검토 (review)`의 `제품화된 실시간 경로`를 canonical execution truth로 정착
2. `9개 lens + controlled lens deliberation + synthesize` 구조를 실제 실행 truth로 유지하면서, issue-stance deliberation target을 구현한다
3. `맥락 격리 추론 단위`를 유지
4. `리뷰 기록 (ReviewRecord)`를 actual primary artifact로 도입
5. TS core API를 정리한 뒤 MCP tool surface로 노출
6. provider contract로 Codex / Claude / local / future host 실행 차이를 흡수

새 작업은 항상 아래 질문으로 시작한다.

1. 어떤 ontology concept를 바꾸는가
2. canonical seat가 어디인가
3. `LLM` 소유인가, runtime 소유인가
4. 먼저 prompt-backed path에서 작동시킬 수 있는가
5. 이후 어떤 bounded TS runtime step으로 치환할 것인가
