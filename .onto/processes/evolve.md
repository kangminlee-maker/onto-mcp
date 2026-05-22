# Evolve Process

> 온톨로지를 기반으로, 이미 존재하는 설계 대상(evolve target — 코드, 스프레드시트,
> 문서 등)에 새로운 영역을 추가하는 과정. 새로운 영역은 기존 설계 대상과 공존해야
> 하므로, 현재 시스템의 상태를 제약(constraint)으로 인식하고 그 안에서 설계한다.
> 이 프로세스는 brownfield(기존 대상이 존재하는 상황) 전용이다.
> Related: 설계 산출물 검증은 MCP review path를 사용한다. 학습 승격은 별도 MCP-native 설계가 필요하다.

## 0. Domain Selection

`process.md`의 "Domain Determination Rules"에 따라 `{session_domain}` 결정.

---

## 1. Context Acquisition (맥락 수집)

주체자와의 대화 없이, 시스템이 사용 가능한 정보를 수집하는 단계.

수집 대상:

| 입력 | 출처 | 필수 여부 |
|---|---|---|
| 설계 목표 | 주체자 입력 | 필수 |
| 설계 대상 (evolve target) | 코드/문서/스프레드시트 등 | 필수 — brownfield 전용이므로 대상이 존재해야 함 |
| ontology | `.onto/builds/` 또는 주체자 지정 | 선택 (있으면 constraint discovery 품질 향상) |
| 학습 | `~/.onto/learnings/` (promoted lens learning 만) | 선택 |
| 도메인 문서 | `~/.onto/domains/{domain}/` | 선택 (주체자 명시 지정) |
| 기존 설계 | 주체자 지정 이전 버전 | 선택 (반복 설계) |

학습 소비·저장·promote 규칙은 `learning-rules.md`가 단일 소유한다.

brownfield 경로 분기:

| 조건 | 경로 | 동작 |
|---|---|---|
| ontology 있음 | brownfield (full) | ontology에서 constraint 추출 가능 |
| ontology 없음 + 대상 소스 있음 | brownfield (ontology 미보유) | build 먼저 안내 (아래 재진입 경로 참조). 주체자가 거부 시 소스 직접 참조로 진행 |

**Reconstruct → Evolve 재진입 경로**: ontology가 없어 reconstruct를 선행 안내한 경우, reconstruct 완료 후
주체자가 evolve를 다시 요청하면 Context Acquisition이 `.onto/builds/`에서
생성된 ontology를 자동 감지하여 brownfield (full) 경로로 진입한다.
reconstruct를 별도 세션으로 실행하므로 evolve 세션의 상태는 유지되지 않는다 — 새 evolve 세션을 시작한다.

수집 결과를 주체자에게 보고하고 확인 후 Phase 1 진입.

---

## 2. Evolve Inquiry (설계 탐구 — 6 Phase)

주체자의 인지 한계 4가지를 체계적으로 보완하는 구조화된 대화.

인지 한계:
1. 목적/가치를 명확하게 정의하지 못함
2. 자기 결정들 사이의 모순을 인지하지 못함
3. constraint를 명확하게 인지하지 못함
4. 변경 가능 범위와 수용 범위의 경계를 모름

### Phase 1: 목적 정밀화

보완 대상: 인지 한계 #1.

주체자가 어떤 수준에서 시작하든 "달성하려는 결과(outcome)" 수준으로 재정위한다.

| 주체자의 시작점 | 재정위 |
|---|---|
| 결과(outcome) | 이미 결과 수준. 구체화 질문 |
| 해결책(solution) | "그것으로 달성하려는 결과는?" |
| 문제(pain point) | "이 문제가 해결되면 달성하려는 결과는?" |
| 기능 명세(feature) | "이 기능이 달성하려는 결과를 먼저 확인" |
| 지표(metric) | "이 지표가 개선되면 어떤 상태에 도달하는가?" |

전환 기준: 주체자가 결과 목록과 우선순위에 동의.

### Phase 2: 영역 탐색

보완 대상: 인지 한계 #3 (영역 수준).

목표에 어떤 영역(area)이 관련되는지 발견한다. 영역별 격차(gap)를 측정한다.

**격차 판정 절차** (W-B-14):
1. 각 영역에 대해 Phase 1 outcome과 현재 상태 사이의 차이를 정성 3등급으로 산정: large / medium / small.
2. 판정 기준: large = 근본적 구조 변경 필요, medium = 기능 추가/수정, small = 설정/조정 수준.
3. 등급이 불분명하면 주체자에게 "이 영역의 변경 범위를 large/medium/small 중 어떻게 보시나요?"로 질의.
4. 주체자 응답이 판정 기준과 다를 경우, 근거를 제시하되 최종 판정은 주체자를 따름.

탐색 방법:
- ontology 있음: 구조/변화 가능성/행위에서 관련 entity를 매칭하여 식별
- ontology 없음: 대상 소스를 탐색하거나 주체자와 대화로 식별

전환 기준: 주체자가 영역 목록에 동의.

### Phase 3: 현재 상태 매핑

보완 대상: 인지 한계 #3 (상세 수준).

각 영역의 현재 상태를 주체자가 이해할 수 있는 언어로 번역한다.

규칙:
- 변경 방향을 제안하지 않음 (Phase 4에서 도출)
- 기술적 난이도를 언급하지 않음
- 주체자가 기술 세부사항을 질문하면 설명하되, 설계 방향을 유도하지 않음

전환 기준: 주체자가 현재 상태 설명에 동의.

### Phase 4: 목표 상태 탐색

보완 대상: 인지 한계 #4.

시나리오 순서: Phase 1 결과 우선순위(높은 것 먼저) × Phase 2 격차 크기(큰 것 먼저).

시나리오당 흐름: 추출 → 제안 → 확정.

1. **추출**: 주체자의 의도를 먼저 확인. "이 영역에서 가장 중요한 변화는 무엇입니까?"
2. **제안**: 주체자 답변 확인 후 대안 제시. 대안 출처를 명시:
   - `[ontology]`: ontology의 구조/변화 가능성/행위에서 도출
   - `[학습]`: promoted 학습에서 도출
   - `[도메인 관행]`: LLM이 해당 도메인의 관행임을 확인할 수 있는 경우에만
   - 세 출처 어디에서도 대안이 없으면 "대안 없음" 안내 후 확정으로 진행
3. **확정**: 주체자의 최종 선택 기록

규칙:
- 대안을 먼저 제시하지 않음 — 주체자가 의도를 말한 후에만
- 대안을 "더 좋은 것"으로 프레이밍하지 않음
- 주체자가 유지를 선택하면 존중

전환 기준: 핵심 시나리오를 모두 다룸.

### Phase 5: 가정·제약 검증

보완 대상: 인지 한계 #2.

Phase 1~4 결정에 깔린 암묵적 가정을 드러내고 교차 대조한다.

검증 방법:
- ontology + 학습 있음: 두 소스 교차 대조
- ontology만 있음: ontology constraint 단독 대조
- 학습만 있음: 학습 단독 대조. ontology 부재 안내
- 둘 다 없음: Phase 1~4 결정 간 내적 모순 발견으로 축소

constraint 분류:

| 분류 | 정의 | 주체자 행동 |
|---|---|---|
| 변경 가능 (changeable) | 이번 설계에서 의도적으로 변경할 수 있는 constraint | 변경할지 유지할지 결정 |
| 수용 필수 (immutable) | 이번 설계에서 변경할 수 없는 constraint | 수용하고 설계에 반영 |
| 확인 필요 (unverified) | 현재 정보로 판별할 수 없는 constraint | 확인 방법과 불가능 시 대안 기록 |

전환 기준: 가정 대조 완료 + 미해소 항목 이관.

### Phase 6: 범위 합의

Phase 1~5 종합.

제시 형식:
- **포함** — 이번에 변경하는 것
- **제외** — 이번에 변경하지 않는 것
- **변경하는 constraint** — changeable로 분류된 것 중 변경 결정
- **수용하는 constraint** — immutable로 분류된 것
- **확인 필요 사항** — unverified + 보류 시나리오 + 미해소 모순

완결 검증 (Specification 전환 전 필수):

| # | 검증 항목 | 통과 기준 | 실패 시 |
|---|---|---|---|
| 1 | outcome 커버리지 | 모든 Phase 1 outcome이 Phase 4 시나리오로 커버됨 | Phase 4 역행 |
| 2 | area 커버리지 | 모든 Phase 2 area가 "포함" 또는 "제외"에 있음 | Phase 6 내 처리 |
| 3 | 가정 처리 완료 | 모든 Phase 5 가정이 확인/수정/이관됨 | Phase 5 역행 |
| 4 | outcome 간 충돌 부재 | outcome A의 시나리오가 outcome B의 **수용 필수** constraint를 위반하지 않음. 변경 가능은 검사 대상 아님. 확인 필요는 등재되어 있으면 통과 | Phase 4 또는 5 역행 |
| 5 | 보류/미해소 등재 | Phase 4 보류 + Phase 5 미해소가 "확인 필요 사항"에 등재됨 | Phase 6 내 추가 |

전체 통과 + 주체자 확인 → Specification 자동 전환.
실패 시: (a) Phase 6 내 조정, (b) 해당 Phase 역행, (c) Phase 1 전체 재시작.

### Phase 전환 공통 규칙

- 단일 발화 블록으로 제시 (누적 요약 + 맥락 구체적 선택지)
- 경량 정합 게이트: 이전 Phase와 현재 결정 사이 구문적 모순 감지
- 선택지: 번호 + 이름 + 다음 동작 설명 + 자연어 fallback
- 열린 질문 최소화: 분석 결과와 결론을 먼저 제시

### 제어 규칙

- **주체자 판단 비대체**: 시스템은 정보 구조화 / constraint 노출 / 모순 명시 / 대안 제시만 수행
- **질문 금기**: 유도 질문, 해결책 쇼핑, 맥락 없는 질문, 기술 프레이밍
- **역행 규칙**: 목적 변경(전체 재시작) / 결정 수정(해당 Phase부터) / Phase 6 내 처리

---

## 3. Specification (설계 명세 생성)

inquiry 완료 후 설계 문서를 생성한다. 최소 구조:

1. **Context** — 목적, 범위, 경로, ontology, lineage
2. **현재 상태 요약** — Phase 3 누적 요약
3. **설계 변경** — 각 변경의 what / why / 변경 방향(add/modify/reduce/migrate)
4. **Constraint 처리** — 변경/수용/확인 필요
5. **구현 상세** — 대상 유형에 따라 달라짐
6. **검증 방법** — 설계가 Phase 1 목표를 달성했는지 확인하는 방법

---

## 4. 반복 설계

review 결과를 반영하여 설계를 개선하는 흐름.

1. review finding → Phase 분류 (목적 불명확→P1, 영역 누락→P2, 상태 오류→P3, 목표 불완전→P4, 가정 미검증→P5, 범위 불일치→P6, 명세 불완전→Spec 재생성)
2. 해당 Phase로 역행 → 재설계
3. 동일 지적 2회 연속 미해소 시 주체자에게 안내 후 미수용/scope 재조정 요청

---

## 5. 대상 중립성

evolve 프로세스 자체는 설계 대상(evolve target)의 형태에 의존하지 않는다.
대상 형태에 의존하는 것은 adapter(런타임이 대상 유형별로 분기하는 구성요소)이다.
evolve는 adapter의 산출물을 소비할 뿐이며, 프로세스 규칙 자체는 대상 중립적이다.

---

## 6. 학습 저장

evolve는 주체자에게 도메인 지식을 직접 확보하는 과정이므로 높은 가치의 학습이 발생한다.

원칙:
- evolve 산출물을 review한 결과 → review가 저장. evolve가 중복 저장하지 않음
- evolve 프로세스 자체에서 발견한 패턴 → evolve가 저장

저장/소비/promote 상세 규칙은 `learning-rules.md`가 단일 소유한다.

---

## 6.5. Schema 호환성 계약 (W-B-13)

evolve 프로세스의 데이터 구조(scope event, config, adapter output)가 변경될 때의 호환성 규칙.

### Reader 분기 정책

| 데이터 | 버전 식별 | reader 동작 |
|---|---|---|
| scope events (ndjson) | `types.ts` EventType union | 미인식 event type → skip (forward compat). payload 필드 추가 → 무시 (additive) |
| project config (.sprint-kit.yaml) | `projectConfigSchema` Zod | 미인식 필드 → strip (Zod default). 필수 필드 누락 → parse error |
| constraint pool (json) | reducer 출력 | reducer가 event stream에서 매번 재계산. 별도 migration 불필요 |
| scope.md | renderScopeMd 출력 | 매번 재생성. 이전 버전과의 호환성 불필요 |

### Migration 소유권

| 변경 유형 | 소유자 | 절차 |
|---|---|---|
| Event payload 필드 추가 (additive) | 변경 작성자 | `types.ts` 수정 + reducer 대응. 기존 event stream 호환 |
| Event type 추가 | 변경 작성자 | `types.ts` union 확장 + state-machine matrix 추가 + gate-guard 규칙 |
| Event type 제거/이름 변경 | 변경 작성자 + Principal 승인 | 기존 scope의 event stream이 깨지므로 migration script 필수 |
| Config 필드 추가 | 변경 작성자 | Zod schema에 `.optional()` 추가. 기존 config 호환 |
| Config 필드 제거/필수화 | 변경 작성자 + Principal 승인 | 기존 프로젝트 config가 깨지므로 migration 안내 필수 |

### Backward 호환성 정책

- **Additive change**: minor version으로 취급. 기존 scope/config 계속 작동.
- **Breaking change**: major version. 기존 scope는 migration 후 사용. migration script 또는 수동 절차 문서화 필수.
- **Materialized view** (constraint-pool.json, verdict-log.json, scope.md): reducer/renderer가 매번 재생성하므로 호환성 문제 없음.

---

## 7. 현재 구현 상태

### LLM / Runtime / Script 소유 분리

| 소유 | 책임 | 현재 상태 |
|---|---|---|
| LLM | 6-Phase inquiry, constraint discovery, specification 생성 | 실행 가능 (프로세스 문서 기반) |
| Runtime | scope lifecycle, 이벤트 기록, 상태 전이 | code-product 경로 구현 완료 (production 검증) |
| Script | stale check, 해시 계산 | 구현 완료 |

### adapter별 상태

| adapter | scope_kind | 상태 |
|---|---|---|
| code-product | experience, interface | 런타임 경로 구현 완료 |
| methodology | process | 스켈레톤. CLI command에서 분기하지 않음. 런타임 경로 미구현 |

---

## 8. Entrypoint Reference Surfaces

MCP-native evolve surface는 아직 설계 전이다. 현재 이 문서는 process authority
seat이며, public invoke surface는 향후 `src/mcp/` tool schema로 고정한다.

| Surface | 파일 | 실행 형태 (prompt-backed) | authority 역할 |
|---|---|---|---|
| **process** | `.onto/processes/evolve.md` | 호출 직후 LLM 이 context 로 로드. 6-Phase 계약·adapter 분기·4절 반복 설계·5절 대상 중립성 등 활동 전반 규칙 | 프로세스 계약 (이 문서) — evolve 의 canonical rule seat |
| **overview** | `process.md` (repo 루트) | 세 번째로 로드. activity_enum, invocation_interpretation/binding, entrypoint 공통 정의 등 활동 간 공통 개념 | 공통 정의 — 복수 활동이 공유하는 개념 seat |

### 8.1 실행 순서

1. future MCP tool schema가 호출 입력을 고정한다
2. runtime이 overview → process → learning-rules.md 순으로 필요한 authority를 로드한다
3. surface 로드 완료 후 6-Phase 실행이 시작된다

### 8.2 추가 read-target 과의 경계

`learning-rules.md` 는 public invoke surface가 아니다. 학습 저장 규칙(§6)의 단일 소유 seat일 뿐이다.

### 8.3 Non-prompt-backed 경로

runtime-bound adapter (code-product)는 prompt-backed reference 경로가 아니다. runtime은 bounded input을 해석하고 6-Phase를 runtime 상태 머신으로 구동한다. 이 경우 overview surface의 활동 간 공통 정의는 `src/core-runtime/scope-runtime/types.ts`가 적용되는 구현으로 해석한다.

---

## 9. Install-Surface Authority Alignment

entrypoint 가 호출될 때, 주체자가 실제로 접근하는 파일(`invoke_surface`) 과 repo 의 authority seat(`.onto/processes/evolve.md` canonical 본문) 이 동일 artifact truth 를 보도록 보장하는 규칙.

### 9.1 세 경로의 구분

| 개념 | 실체 | 역할 |
|---|---|---|
| **authority seat** | repo 의 `.onto/processes/evolve.md` (이 파일) | canonical rule 의 원천. 모든 버전 기준의 진실 |
| **invoke surface** | future MCP tool schema | 주체자가 호출로 진입하는 표면 |
| **install surface** | npm package + project-local `.onto/` | 활성 실행 시 invoke surface 가 읽는 실제 파일 위치 |

### 9.2 Alignment 불변식

1. **Mirror requirement**: install surface 는 authority seat 의 deterministic snapshot 이다. 설치 시점 이후 authority seat 가 개정되면 install surface 는 재설치 전까지 stale 이다.
2. **Single-truth citation**: invoke surface는 process authority를 하나의 project/install surface에서 읽어야 한다. repo 상대 경로와 install 상대 경로가 한 블록 안에서 혼용되면 artifact truth가 이원화된다.
3. **Version parity**: install surface 와 authority seat 버전 차이는 재설치(또는 plugin update) 로만 해소된다. runtime 은 mismatch 를 감지할 책임이 없다 — 주체자가 install 절차로 보정한다.
4. **Non-mutation**: install surface 에 대한 현장 수정은 금지한다. 실험은 repo 에서 수행하고 재설치로 반영한다. install surface 의 파일은 authority seat 의 materialization 일 뿐이며, 독립적 authority 를 갖지 않는다.

### 9.3 Drift 탐지 기준

runtime 은 install/authority drift 를 자동으로 탐지하지 않는다. 다음 경로로 주체자 또는 거버넌스 프로세스가 보정한다.

- **명시적 재설치**: plugin install 스크립트 실행 → authority seat 의 현재 snapshot 이 install surface 로 복제.
- **Version 문자열 점검**: `.onto/authority/core-lexicon.yaml` 의 `lexicon_version` 과 install tree 의 동일 파일의 `lexicon_version` 을 비교하여 drift 를 수동 확인. 불일치 시 재설치.
- **Governance 통과 시점**: §1 정본 개정이 merge 된 시점에 install surface 는 잠정 stale 로 간주. 다음 실행 전 재설치가 권장 경로.

### 9.4 Runtime-bound 경로와의 관계

runtime-bound adapter (code-product) 는 invoke surface 의 CLI 인자만 해석하므로 install-surface drift 가 prompt-backed 경로만큼 직접적으로 노출되지는 않는다. 그러나 runtime 도 repo 외부의 packaged binary 로 배포될 때 동일 불변식이 적용된다 — binary 버전과 authority seat 버전의 mirror requirement.

### 9.5 용어

`invoke_surface`, `install_surface` 는 `.onto/authority/core-lexicon.yaml#provisional_terms` 에 seed 로 등재된다 (W-A-52). authority seat 는 기존 rank 1 authority 파일 개념과 동일하며 별도 seed 가 아니다.

---
