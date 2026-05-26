# CLAUDE.md

## Authority 위계

| 순위 | 역할 | 위치 |
|---|---|---|
| 1 | 개념 SSOT | .onto/authority/core-lexicon.yaml |
| 2 | 개발 원칙: OaC | .onto/principles/ontology-as-code-guideline.md |
| 2 | 개발 원칙: LLM-Native | .onto/principles/llm-native-development-guideline.md |
| 2 | 개발 원칙: 비전문가 소통 | .onto/principles/non-specialist-communication-guideline.md |
| 2 | 개발 원칙: product 우선 | .onto/principles/product-locality-principle.md |
| 3 | 제품 방향 | .onto/principles/productization-charter.md |
| 4 | 인터페이스 명세 | .onto/principles/llm-runtime-interface-principles.md |
| 4 | 이름 규칙 | .onto/principles/ontology-as-code-naming-charter.md |
| 5 | 기능별 계약 | .onto/processes/{feature}/*.md (계약 파일) |
| 6 | 타입·구현 | src/core-runtime/ |
| 7 | 기능 프로세스 | .onto/processes/review/*.md, .onto/roles/*.md |
| 8 | 개발 기록 | development-records/ |

.onto/authority/ 구성: 개념 SSOT + runtime lens registry (core-lens-registry.yaml)
.onto/principles/ 구성: rank 2~4 개발 규범 문서 7개 (배포 제외)
위계 밖: development-records/ (이력/참조)

## current runtime 구조

```
src/core-runtime/
├── cli/                    ← review bounded step entrypoints
├── discovery/              ← settings, onto home, lens registry
├── llm/                    ← provider switcher + LLM call wrappers
├── review/                 ← review artifact types, materializers, deliberation, route policy
├── logger.ts               ← 공용 로거
```

- **review**: 현재 제품화 대상. context-isolated lenses, controlled deliberation, synthesize, ReviewRecord를 소유한다.
- **llm**: API key / OAuth / local provider selection을 단순화한 runtime boundary다.
- **development-records/archive/**: retired CLI/process/learning/govern/evolve material을 격리 보관한다.

동일 순위 충돌 해소: 같은 순위 파일은 규범 내용이 중복되지 않는다. 중복 발견 시, 원칙의 성격에 부합하는 파일이 canonical이며, 나머지는 참조만 한다. 예외: 동일 개념이 서로 다른 소비 목적(구조 규칙 vs 설계 가이드)으로 필요한 경우, 각 파일의 고유 범위를 확정하고 상호 참조를 명기하여 이중 존재를 허용한다.
