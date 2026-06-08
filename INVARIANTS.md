# INVARIANTS

> 상태: Active
> 목적: 이 레포에서 **어떤 변경에도 항상 참이어야 하는 비협상 규칙**을 정의한다.
> 관계: [AGENTS.md](AGENTS.md) `§0. 비협상 규칙`의 요약 8개 항목을, 검증 가능한 상세 불변식으로 뒷받침한다.
> 사용법: 매 작업·루프 시작 시 이 파일을 다시 읽고, 만들려는 변경이 어떤 불변식에 닿는지 먼저 점검한다. 닿으면 멈추고 사용자에게 확인한다.

각 불변식의 `강제`는 규칙을 실제로 지키게 만드는 가장 강한 수단을, `검증`은 위반을 자동으로 잡는 방법을 가리킨다. 강제 수단의 구현은 [docs/architecture/structural-guardrails-enforcement.md](docs/architecture/structural-guardrails-enforcement.md)에서 다룬다.

---

## INV-AUTH-1 — 기본 인증은 항상 OAuth
- **규칙**: review 실행의 기본 인증(auth)은 항상 `oauth`다. `api_key`·`local`은 사용자가 명시적으로 지정했을 때만 쓴다.
- **근거**: 보안·인증 경계 값이 편의로 바뀌면 조용한 drift가 장기간 미검출될 수 있다.
- **강제**: 역량 경계(보호 경로 승인제) + 검증 게이트. `↔ AGENTS §0-2, §0-3`
- **검증**: `auth` 생략 시 `provider=openai`가 OAuth/Codex 경로로 해석되는지 테스트로 고정한다. 관련 코드: [src/core-runtime/llm/model-switcher.ts](src/core-runtime/llm/model-switcher.ts).

## INV-CFG-1 — 스펙 경계 값은 settings.json이 유일 권위 (코드 기본값 금지)
- **규칙**: 인증 방식, 기본 모델/provider, reasoning effort, retry 횟수 등 "스펙 경계 값"은 [.onto/settings.json](.onto/settings.json)(및 settings chain) 한 곳에서만 나온다. 코드에 기본 상수를 두지 않는다. 값이 없으면 조용히 기본값으로 가지 말고 즉시 멈춘다(fail-loud).
- **근거**: 설정 권위를 코드 기본값으로 끌어오면 조용한 drift가 생긴다.
- **강제**: 역량 경계(보호 경로 승인제) + 검증 게이트(하드코딩 스캐너). `↔ AGENTS §0-2, §0-3`
- **검증**: 운영 코드의 effort/auth/모델 리터럴 기본값을 스캔해 발견 시 실패. 관련 코드: [src/core-runtime/discovery/settings-chain.ts](src/core-runtime/discovery/settings-chain.ts).

## INV-TEST-1 — 테스트는 명세를 검증한다 (코드 현재 동작이 아니라)
- **규칙**: 불변식 테스트의 기대값은 "의도한 명세"를 따른다. "코드가 지금 이렇게 하니까"를 이유로 기대값을 바꾸지 않는다. 기대값 변경에는 명세 변경 근거를 명시한다.
- **근거**: 잘못된 동작이 "테스트 통과" 신호 뒤에 숨으면 자동 검증으로 잡히지 않는다.
- **강제**: 검증 게이트 + 지침. `↔ AGENTS §0-4`
- **검증**: 불변식 성격의 테스트는 별도 식별(예: `*.invariant.test.ts`)하고, 변경 시 명세 근거를 요구한다. 테스트는 소스 옆 `*.test.ts`로 동거한다(현 레포 컨벤션).

## INV-SCHEMA-1 — 단계 출력 계약/스키마는 단일 source
- **규칙**: 각 파이프라인 단계의 출력 스키마·계약은 고정된 단일 source에서 정의하고, 런타임 validator와 submit tool이 그 source를 직접 참조한다. 정의가 여러 곳에 복제되어 어긋나는 상태(drift)를 금지한다.
- **근거**: 스키마 정의가 여러 곳에 복제되면 단계 간 계약이 어긋난다.
- **강제**: 역량 경계(단일 source import) + 검증 게이트. `↔ AGENTS §0-2`
- **검증**: submit tool schema와 validator가 같은 source를 참조하는지 테스트로 확인. 참조 예: [src/core-runtime/review/problem-framing-spine.ts](src/core-runtime/review/problem-framing-spine.ts).

## INV-MOCK-1 — 운영 경로는 mock/fixture를 import하지 않는다
- **규칙**: mock은 검증 realization이지 제품 의미 경로가 아니다. semantic mock(판단 날조)과 boundary stub(외부 의존만 격리, 실제 제품 코드 실행)을 구분한다. 모든 mock/fixture payload는 지정 boundary 모듈에만 두고, 운영 코드는 그 모듈을 import하지 않는다. 생성된 artifact는 realization을 provenance에 기록한다.
- **근거**: mock이 운영 경로에 얽히면 삭제·교체가 안전하지 않다.
- **강제**: 역량 경계(import 경계 lint). `↔ AGENTS §0-6`
- **검증**: 의존 경계 lint로 운영 코드의 mock/fixture import를 차단한다. 현재 레포에 mock 전용 디렉터리가 분리돼 있지 않으므로 boundary 모듈을 먼저 확정한다.

## INV-BENCH-1 — 표본 1은 결정 근거가 아니다
- **규칙**: 의사결정 근거로 쓰는 비교 수치는 조건당 반복 ≥ 3회, fixture ≥ 2개, 분산(평균·표준편차·n) 병기를 충족해야 한다. 충족하지 못한 결과는 "예비 관찰(PRELIMINARY)"로만 표기하고 결론으로 쓰지 않는다.
- **근거**: 표본이 1이면 진짜 차이와 우연한 변동을 구분할 수 없다.
- **강제**: 역량 경계(벤치마크 하니스 게이트) + 지침. `↔ AGENTS §0-5`
- **검증**: 하니스가 반복·fixture 조건 미충족 시 결론 출력을 거부한다. 관련 코드: [scripts/review-pipeline-benchmark.ts](scripts/review-pipeline-benchmark.ts). 상세 요구: [docs/architecture/benchmark-harness-requirements.md](docs/architecture/benchmark-harness-requirements.md).

## INV-EXP-1 — 비교 실험은 한 번에 한 변수만 바꾼다
- **규칙**: A/B 비교 시 한 번에 하나의 변수만 변경한다. 두 변수를 동시에 비교해야 하면 2×2 이상의 매트릭스로 효과를 분리한다.
- **근거**: 한 비교에서 두 변수를 동시에 바꾸면 개선의 출처를 분리할 수 없다.
- **강제**: 지침 + 검증 게이트(하니스 설계 제약). `↔ AGENTS §0-5`

## INV-MATERIAL-1 — material issue 정의는 고정 source, 변경은 사람 승인
- **규칙**: "material issue"의 정의·판정 기준은 단일 source 문서에 고정한다. 정의 변경은 사람 승인을 거친다.
- **현재 source**: [.onto/processes/review/material-issue-contract.md](.onto/processes/review/material-issue-contract.md)가 canonical predicate와 machine-readable contract를 소유한다. [.onto/authority/core-lexicon.yaml](.onto/authority/core-lexicon.yaml)의 `material_issue` term은 개념 seat이고, [src/core-runtime/review/review-result-classification.ts](src/core-runtime/review/review-result-classification.ts)가 runtime predicate owner다.
- **현재 정의**: material issue는 `severity in {blocker, high, medium}` 그리고 `NOT admission_disqualified`일 때만 참인 classification/disclosure이며, 그 자체로 hot path나 stage progress를 차단하지 않는다. 차단은 deterministic runtime gate의 구조·계약 실패만 소유한다.
- **근거**: 판정 기준이 흔들리면 파이프라인 의미와 품질 비교의 기준선도 흔들린다.
- **강제**: 역량 경계(보호 경로) + 지침. `↔ AGENTS §0-2`. 관련 계약: [.onto/processes/review/](.onto/processes/review/).

## INV-LOOP-1 — 무인 자율 루프는 상한에서 멈추고 보고한다
- **규칙**: "조건 충족까지 반복" 형태의 무인 루프는 최대 턴 수·시간·변경 파일 수 상한을 가지며, 도달 시 강제로 멈추고 변경 요약과 INVARIANTS 대조 결과를 보고한다.
- **근거**: 무인 루프가 길어지고 컨텍스트 압축이 누적되면 조용한 drift가 장기간 미검출될 수 있다.
- **강제**: 역량 경계(루프 래퍼 상한). `↔ AGENTS §0-7`

## INV-SCOPE-1 — 스코프가 재설계로 커지면 성공기준을 재검증한다
- **규칙**: 작업이 "최적화"에서 "재설계"로 실질 확장되면, 원래 성공기준("품질 손상 없음")을 확장된 스코프 기준으로 다시 측정·검증한다.
- **근거**: 스코프가 커지면 원래 성공기준이 새 범위에서 더 이상 검증되지 않은 상태가 된다.
- **강제**: 지침 + 검증 게이트(드리프트/품질 리포트). `↔ AGENTS §0-8`

---

## 강제 수단 구현 현황

위 불변식 중 다수는 현재 지침(AGENTS §0)으로만 강제되고, 구조적 강제(역량 경계·검증 게이트)는 아직 미구현이다. 구현은 [docs/architecture/structural-guardrails-enforcement.md](docs/architecture/structural-guardrails-enforcement.md)에서 다룬다.
