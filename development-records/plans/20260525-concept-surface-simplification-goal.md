# Concept Surface Simplification Goal

> 상태: Draft
> 작성일: 2026-05-25
> 목적: `onto-mcp` 전역의 개념 surface를 감사하고, 불필요하게 세분화된 runtime/document/type 개념을 정리하기 위한 실행 goal을 정의한다.

---

## Goal Prompt

```text
/goal onto-mcp 전역의 개념 surface를 감사하고, 불필요하게 세분화된 runtime/document/type 개념을 정리해 canonical review runtime을 단순화한다.

Authority:
- AGENTS.md
- CLAUDE.md
- .onto/authority/core-lexicon.yaml
- .onto/principles/ontology-as-code-guideline.md
- .onto/principles/llm-native-development-guideline.md
- .onto/principles/product-locality-principle.md
- .onto/principles/llm-runtime-interface-principles.md
- .onto/principles/ontology-as-code-naming-charter.md
- .onto/processes/review/productized-live-path.md
- .onto/processes/review/pre-dispatch-contracts.md
- .onto/processes/review/review-context-manifest-contract.md
- .onto/processes/review/execution-preparation-artifacts.md
- .onto/processes/review/record-contract.md
- IMPLEMENTATION_MAP.html

목표:
- 레포 전역에서 유사하거나 과분화된 개념, 필드, enum, artifact 용어를 수집하고 감사한다.
- 개념 분리의 필요성이 입증되지 않는 항목은 병합, 하위 필드화, rename, retire/archive 대상으로 분류한다.
- review runtime의 canonical concept spine을 단순화한다.
- 사용자 입력 개념과 runtime 파생 개념을 명확히 구분한다.
- active runtime path에는 fallback, compatibility shim, deprecated alias, history pollution을 남기지 않는다.
- 정리 결과가 TS runtime, MCP response, artifact truth, prompt contract, active docs에 일관되게 반영되도록 한다.
- IMPLEMENTATION_MAP.html을 최신 상태로 갱신한다.

검사 범위:
- .onto/authority/**
- .onto/processes/**
- .onto/domains/**
- src/**/*.ts
- src/mcp/**
- src/core-api/**
- docs/**
- package.json
- IMPLEMENTATION_MAP.html

제외 범위:
- development-records/archive/**
- retired/deprecated docs
- 과거 handoff/audit/history 문서
- 생성된 review session artifact는 참고 샘플로만 사용한다.

우선 감사할 개념 cluster:
1. provider / runtime / host / executor / route
2. target / scope / boundary / input / artifact / profile
3. binding / manifest / plan / record / packet
4. selected / resolved / effective / normalized / inferred
5. actor / worker / lens / unit / agent / subprocess
6. finding / issue / problem / cluster / stance / deliberation
7. domain / axiology / alignment / value / criteria

판정 기준:
- 유지: 독립 owner, lifecycle, failure condition, artifact truth가 있다.
- 병합: 같은 owner/phase/lifecycle이고 항상 함께 변한다.
- 하위 필드화: 독립 concept가 아니라 parent concept의 파생 속성이다.
- rename: 개념은 맞지만 이름이 혼선을 만든다.
- retire/archive: active runtime authority가 없거나 canonical path에서 제거해야 한다.
- 보류: 증거가 부족하며 active runtime은 변경하지 않는다.

설계 가이드라인:
- 설계 단계는 새 개념을 발명하는 단계가 아니라, 기존 개념의 독립 자격을 심사하는 단계다.
- 새 concept는 아래 질문에 명확히 답할 수 있을 때만 도입한다.
  - 누가 결정하는가?
  - 언제 결정되는가?
  - 어떤 artifact에 truth로 남는가?
  - 실패 조건이 다른 개념과 다른가?
  - 사용자가 직접 설정하는 값인가, runtime이 파생하는 값인가?
  - 이 개념을 없애면 재현성이나 검증 가능성이 깨지는가?
- 새 type, field, artifact, CLI flag, MCP field, helper module, process name은 모두 concept 후보로 취급하고 같은 기준으로 심사한다.
- projection/helper는 중복 derivation을 줄이는 내부 구현물로만 둘 수 있다. user config, CLI/MCP input, active artifact authority, canonical spine으로 승격하려면 독립 owner/lifecycle/failure/artifact truth가 입증되어야 한다.
- review finding을 수정하기 전에는 proposed fix가 active concept surface를 줄이는지, 유지하는지, 늘리는지 먼저 판정한다.
- review finding을 수정한 후에는 같은 기준으로 다시 판정한다. 특히 fixture, enum token, failure reason, timeout/retry 정책이 새 public concept나 runtime authority로 승격되지 않았는지 확인한다.
- 파생값은 downstream 편의를 위해 다시 입력으로 받지 않는다. 필요한 경우 parent authority에서 다시 계산하거나 artifact visibility로만 기록한다.
- 분리 필요성이 입증되지 않으면 parent concept의 하위 필드로 흡수하거나 병합한다.
- 설계에서 닫을 것은 canonical concept 이름, parent/child 관계, owner, lifecycle phase, artifact truth 위치, failure semantics, retired term 처리 정책, MCP public shape다.
- 구현 중 정해도 되는 것은 TypeScript type 이름, helper 함수 구조, 파일 내부 배치, test fixture 형태, private 변수명, 세부 validator 구현 방식이다.

하지 말아야 할 것:
- 비슷한 개념을 조금 더 정확한 이름이라는 이유만으로 새로 만들지 않는다.
- selected/resolved/effective/normalized/inferred 같은 수식어를 붙여 병렬 개념을 늘리지 않는다.
- runtime이 실제로 다른 결정을 내리지 않는 값을 독립 entity로 만들지 않는다.
- 실패 처리 개선을 별도 domain concept로 만들지 않는다. timeout, retry, halt reason은 기존 dispatch/execution-result/failure-record 체계 안에서 표현한다.
- 사용자 입력값과 runtime 파생값을 같은 field 이름으로 섞지 않는다.
- active docs에 과거 구조, fallback 경로, migration history를 남기지 않는다.
- compatibility shim으로 이전 이름을 조용히 받아주지 않는다.
- deprecated alias를 runtime에서 normalize하지 않는다.
- 테스트 없이 artifact schema나 MCP response field를 바꾸지 않는다.
- 하나의 cluster를 정리하면서 unrelated cluster까지 같이 리팩토링하지 않는다.

진행 방식:
1. 전역 concept inventory를 생성한다.
2. 유사 개념 cluster별로 사용처, owner, lifecycle, artifact truth, failure semantics를 확인한다.
3. 각 개념을 유지/병합/하위 필드화/rename/retire/archive/보류로 분류한다.
4. 감사 결과를 바탕으로 개선 계획을 작성한다.
5. 우선순위 cluster부터 작은 단위로 구현한다.
6. 각 cluster 변경 후 typecheck/test/e2e/MCP review conformance를 실행한다.
7. 실제 onto review를 software-engineering domain으로 실행해 개념 정리 결과를 재검증한다.
8. IMPLEMENTATION_MAP.html과 active docs를 최신화한다.
9. 마지막에 남은 gap, 테스트 결과, 변경 파일, 다음 작업 후보를 요약한다.

산출물:
- development-records/audit/YYYYMMDD-concept-surface-audit.md
- development-records/audit/YYYYMMDD-concept-surface-inventory.json
- development-records/plans/YYYYMMDD-concept-surface-simplification-plan.md
- 필요한 TS/runtime/MCP/artifact/prompt/doc 변경
- 갱신된 IMPLEMENTATION_MAP.html
- 실제 review run artifact

검증:
- npm run check:ts-core
- npm run test:mcp:review
- npm run test:e2e
- git diff --check
- 필요한 경우 관련 vitest targeted suite 추가 실행
- 실제 review invoke full-scale 실행

완료 기준:
- 전역 concept inventory와 audit 문서가 생성됨
- 우선순위 cluster들이 유지/병합/하위 필드화/rename/retire/archive/보류 중 하나로 판정됨
- 개선 계획이 작성됨
- 선택된 cleanup cluster가 구현 완료됨
- active runtime path에 fallback/shim/deprecated alias/history pollution이 없음
- TS typecheck, MCP review test, e2e test가 통과함
- 실제 review run이 성공하고 artifact가 생성됨
- IMPLEMENTATION_MAP.html에 현재 architecture/status/risk가 반영됨
- 남은 gap과 다음 작업 후보가 명확히 정리됨

제약:
- production 전 단계이므로 fail-loud를 우선한다.
- compatibility shim을 만들지 않는다.
- retired/deprecated alias를 canonical runtime에서 받아주지 않는다.
- history log와 과거 rationale는 development-records 또는 archive에만 둔다.
- unrelated user changes는 되돌리지 않는다.
- 커밋/푸시는 명시적으로 요청받기 전에는 하지 않는다.
```

---

## Notes

- 이 goal은 설계 단계가 새 개념 생산으로 흐르지 않도록, "개념 분리의 필요성 입증"을 중심 기준으로 둔다.
- `runtime_provider`, `worker_executor`, `host_runtime`처럼 유사 개념이 병렬로 커지는 경우는 우선 parent concept로 흡수 가능한지 검토한다.
- cleanup은 cluster 단위로 진행하며, 각 cluster 변경 후 검증을 완료한다.
