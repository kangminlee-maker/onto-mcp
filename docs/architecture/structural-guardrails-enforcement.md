# 구조적 가드: INVARIANTS 강제

> 상태: Active — **G1~G6 구현 완료** (구현 현황 표는 [INVARIANTS.md](../../INVARIANTS.md) §강제 수단 구현 현황)
> 목적: [INVARIANTS.md](../../INVARIANTS.md)의 불변식을 지침(AGENTS §0)에서 **구조적 강제**(역량 경계·검증 게이트)로 끌어올린다.
> 관계: [AGENTS.md](../../AGENTS.md) §0
> 구현 노트: G1·G2는 eslint/dependency-cruiser 대신 기존 `check:*` 패턴의 tsx conformance 스크립트로 구현했다(신규 lint 의존성 0; 수용 기준 — 위반 시 비-0 종료 — 은 동일하게 충족). G2의 스펙 인가 정규화 지점은 스크립트 내 가시적 waiver로 등록되며 stale waiver는 실패한다. G4는 로컬 `check:invariant-change` + PR CI([invariants.yml](../../.github/workflows/invariants.yml))로 강제한다. G5는 [scripts/review-pipeline-benchmark.ts](../../scripts/review-pipeline-benchmark.ts)의 decision gate로 이미 충족되어 있었다.

## 원칙

- 가드는 설정·tooling·스크립트·테스트로만 구현한다. 제품 동작(runtime semantic 경로)은 바꾸지 않는다.
- 가드 추가는 허용하되, 인증·`.onto/settings.json` 스키마·단계 출력 계약·material 정의 변경은 멈추고 사용자 확인을 받는다(AGENTS §0).
- 가드 구현은 별도 변경집합으로 격리한다.
- 새 npm script는 기존 `check:*` 네이밍을 따른다.

## G1. mock/fixture import 경계 lint  (INV-MOCK-1)

- mock/fixture payload·executor는 단일 boundary 디렉터리에만 둔다. 운영 코드는 boundary로의 import만 가진다.
- eslint flat config(`eslint.config.mjs`)의 `no-restricted-imports` 또는 `dependency-cruiser`로, 운영 코드(`src/core-runtime/**`, boundary 제외)의 boundary import를 차단한다. 테스트(`**/*.test.ts`)는 예외.
- `package.json`에 `check:import-boundary`를 추가한다.
- **수용 기준**: 운영 코드가 boundary를 import하면 `check:import-boundary`가 실패한다. boundary 디렉터리만 지우면 mock 지원이 한 번에 제거된다.

## G2. 스펙 경계 값 하드코딩 스캐너  (INV-AUTH-1, INV-CFG-1)

- `scripts/check-no-hardcoded-spec-defaults.ts`로 운영 코드(테스트·fixture 제외)의 effort/auth/모델 리터럴 기본값을 탐지한다.
- `package.json`에 `check:spec-defaults`를 추가한다. 탐지 시 비-0 종료.
- **수용 기준**: [src/core-runtime/llm/model-switcher.ts](../../src/core-runtime/llm/model-switcher.ts)에서 `provider=openai` auth 생략이 OAuth로 정규화되고, effort/auth 기본값이 [.onto/settings.json](../../.onto/settings.json)에서만 흘러온다.

## G3. 불변식 테스트  (INV-AUTH-1, INV-SCHEMA-1, INV-TEST-1)

- 명세를 검증하는 테스트는 `*.invariant.test.ts`로 명명한다(소스 옆 동거 컨벤션).
- 최소: `auth` 생략 시 OpenAI가 OAuth/Codex로 해석; submit tool schema와 validator가 동일 단일 source를 참조(예: [src/core-runtime/review/problem-framing-spine.ts](../../src/core-runtime/review/problem-framing-spine.ts)).
- 기대값을 바꿀 때는 명세 근거를 명시한다.
- **수용 기준**: 구현이 명세를 어기면 `*.invariant.test.ts`가 실패한다.

## G4. 보호 키 변경 감지  (INV-AUTH-1, INV-CFG-1, INV-MATERIAL-1)

- diff에 보호 키(`auth:`, `provider:`, 기본 `effort`, material 정의 파일) 변경이 있고 커밋 메시지에 `INVARIANT-CHANGE: <INV-ID>` 표식이 없으면 실패하는 검사를 `.github/workflows/` 또는 pre-commit으로 둔다.
- **수용 기준**: 표식 없는 보호 키 변경이 차단된다.

## G5. 벤치마크 하니스 게이트  (INV-BENCH-1, INV-EXP-1)

- [benchmark-harness-requirements.md](benchmark-harness-requirements.md)의 요구대로 [scripts/review-pipeline-benchmark.ts](../../scripts/review-pipeline-benchmark.ts)를 보강한다: 반복 ≥3·fixture ≥2 미충족 시 결론 출력 거부, 분산 병기, 2×2(effort×IO-control) 한-변수 비교.
- **수용 기준**: 조건 미충족 시 결과가 `PRELIMINARY`로 라벨되고 결론 필드가 비워진다.

## G6. 드리프트 리포트  (INV-SCOPE-1)

- 머지 전 최종 상태를 INVARIANTS와 대조해 이탈 목록을 출력하는 `check:invariant-drift`. 우선순위 낮음.

## 완료 정의

- G1~G4가 `check:*`로 실행 가능하고 위반을 잡는다.
- 새 검사가 통과하는 상태에서 별도 변경집합으로 묶인다.
- [INVARIANTS.md](../../INVARIANTS.md)의 강제 현황을 구현된 항목 기준으로 갱신한다.
