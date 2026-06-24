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
- **강제**: 역량 경계(단일 source import) + 검증 게이트 + G8(prompt-projection 패리티 가드) + G9(final-output-sections 패리티 가드). `↔ AGENTS §0-2`
- **검증**: submit tool schema와 validator가 같은 source를 참조하는지 테스트로 확인. 참조 예: [src/core-runtime/review/problem-framing-spine.ts](src/core-runtime/review/problem-framing-spine.ts). prompt-projection 계약은 registry `prompt_projection_contracts` 선언과 runtime 모듈 surface가 어긋나지 않도록 `npm run check:prompt-projection-parity`(G8)가, final-output append-section 집합은 registry `final_output_append_sections`와 `final-output-sections.ts` SSOT가 어긋나지 않도록 `npm run check:final-output-sections-parity`(G9)가 강제한다.

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

## INV-MODEL-1 — 모델 선택은 벤치마크로 지원 검증된 모델만
- **규칙**: settings.json에서 선택 가능한 LLM 모델은 권위 레지스트리 [.onto/authority/supported-models.yaml](.onto/authority/supported-models.yaml)에 등록된 `(provider, model)`로 한정한다. 레지스트리에는 벤치마크 기록이 파이프라인 완주를 입증한 모델만(사람 큐레이션, 벤치마크 record 인용) 올린다. 미등록 모델 선택은 supported-model 게이트가 reconstruct live 실행 경계(실제 provider 호출)와 G7 가드(커밋된 모든 seat)에서 fail-loud로 거부한다. review 런타임 강제는 후속 과제이므로 런타임 게이트는 현재 reconstruct live 경로에만 배선돼 있고, review의 커밋 seat은 G7가 커버한다. settings 해석(`resolveSettingsChain`)은 순수 projection이며 이 게이트를 적용하지 않는다(게이트≠projection — mock/test 해석이 임의 fixture 모델로 통과할 수 있게).
- **근거**: 검증되지 않은 모델로 운영하면 파이프라인 안정성·품질 기준선이 무근거로 흔들린다. "지원함"은 벤치마크 증거로만 확립한다.
- **현재 source**: 권위 = `.onto/authority/supported-models.yaml`. runtime 게이트 = `assertSettingsModelsSupported`([settings-chain.ts](src/core-runtime/discovery/settings-chain.ts)) — 멤버십 검사는 [supported-models.ts](src/core-runtime/discovery/supported-models.ts)의 `assertSupportedModelRoutes`. 호출 지점: reconstruct live 실행 경계(`!mockRealizationEnabled`, [reconstruct-api.ts](src/core-api/reconstruct-api.ts))와 G7 가드. `resolveSettingsChain`은 게이트를 적용하지 않는다.
- **강제**: 역량 경계(reconstruct live 실행 경계에서 fail-loud 거부) + G7 가드. 레지스트리의 `context_window_tokens`(reconstruct projection 예산 SSOT)는 추가로 **G4 보호** — 변경 시 `INVARIANT-CHANGE: INV-MODEL-1` 마커 필요. `↔ AGENTS §0-2`(.onto/settings.json 스키마/계약 변경은 사람 승인).
- **검증**: `npm run check:supported-models` — 커밋된 .onto/settings.json의 모든 모델이 레지스트리에 있는지 검사, 위반 시 비-0. window 필드는 G4(`check:invariant-change`)가 마커 동반을 강제한다.

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

## INV-OBLIGATION-COVERAGE-1 — 선언된 validation_obligation은 살아있는 강제자 또는 명시적 backlog를 갖는다
- **규칙**: reconstruct registry `validator_records`의 모든 ACTIVE `validation_obligation`(flat ∪ conditional, `(validator_id, obligation_id)` 키)은 (i) 실제 validator 실행에서 `asserted_obligation_ids`로 동적 입증된 **recorded** 항목이거나, (ii) checked-in pending 원장(`obligation-coverage-ledger.yaml`)에 **parked**된 항목이어야 한다. 둘 다 아닌 새 ACTIVE obligation은 빌드 에러다. 그리고 LEGACY pending 집합은 `origin/main` 대비 **단조 비증가**(non-increasing)다 — 새로 선언된 active obligation만 pending에 진입할 수 있다.
- **근거**: 단계가 obligation을 선언하고도 강제자를 배선하지 않는 "declared, not wired" 누락을 리뷰 라운드에서야 잡던 것을, recorded/parked 가시화 + ratchet으로 빌드 게이트에서 닫는다. (게이트는 obligation이 *조용히 미추적*이 아님과 recorded id가 *강제 블록에 도달*함을 증명할 뿐, 강제자의 *의미적 정확성*은 증명하지 않는다.)
- **강제**: G10(`npm run check:obligation-coverage`) 정적 절(완전성·원장 정직성·역검증) + git base-diff ratchet(legacy pending 비증가·recorded→pending 강등 금지·재-park 금지, base 부재 시 fail-loud) + CI. INV 텍스트 자체는 사람 게이트(AGENTS §0-2; INVARIANTS.md는 PROTECTED_TARGETS 아님), 가드는 하드 CI 머지 게이트. recorded-set 신선도는 `obligation-coverage-harvest.test.ts`가 동적 입증한다.

## INV-SHARD-1 — review obligation의 shardability 선언은 exhaustive·fail-closed다
- **규칙**: 각 material kind의 review obligation(`reviewMaterialGoals(kind)`)은 정확히 1개의 `material_shardability` 선언(`whole`/`shardable_independent`/`shardable_with_seam`)을 갖는다(exhaustive·중복·orphan 없음). 관계형 obligation(cross-section 증거 — 봉인된 `RELATIONAL_OBLIGATIONS` 권위)은 `shardable_independent`로 선언될 수 없고(🔴 ILC-2), `shardable_with_seam`은 관계형 obligation에만 허용된다. relational ground truth는 shardability 선택과 분리된 **봉인 권위**에서 도출되며 선언 필드가 아니다(동반-flip 차단).
- **근거**: Stage 3 섹션 분할 전에, 관계형 obligation을 독립 shard로 쪼개 cross-section 증거를 파괴하는 ILC-2를 fail-closed로 잠근다. relational을 선언 필드로 두면 shardability와 함께 co-flip되어 보호가 무력화되므로 봉인 권위로 분리한다. 실 분할은 Stage 3 소관 — Stage 2는 선언+validator+순수 게이트 함수뿐(동작 변화 0).
- **강제**: G3 불변식 테스트(`src/core-runtime/review/obligation-shardability.invariant.test.ts`) — 모든 kind에서 validator(`validateObligationShardability`)가 `[]`임을 잠그고, 주입된 위반(relational_independent·seam_on_local·missing/orphan/duplicate)을 실제로 잡음을 mutation-test로 입증하며, 봉인 `RELATIONAL_OBLIGATIONS` 멤버십을 고정한다. 실 분할(Stage 3)은 순수 게이트 `isObligationShardable`을 호출한다. INVARIANTS.md·테스트는 PROTECTED_TARGETS 아님(G4 마커 불요). 관련 코드: [src/core-runtime/review/obligation-shardability.ts](src/core-runtime/review/obligation-shardability.ts).

---

## 강제 수단 구현 현황

구조적 가드 G1~G6이 구현되어 있다(설계: [docs/architecture/structural-guardrails-enforcement.md](docs/architecture/structural-guardrails-enforcement.md)). CI는 [.github/workflows/invariants.yml](.github/workflows/invariants.yml)이 PR마다 G1·G2·G4를 강제한다.

| 가드 | 불변식 | 실행 |
|---|---|---|
| G1 import 경계 | INV-MOCK-1 (+repo-layout 레이어링) | `npm run check:import-boundary` |
| G2 스펙 기본값 스캐너 | INV-AUTH-1, INV-CFG-1 | `npm run check:spec-defaults` (인가 정규화는 가시적 waiver) |
| G3 불변식 테스트 | INV-AUTH-1, INV-SCHEMA-1, INV-TEST-1, INV-SHARD-1 | `src/**/*.invariant.test.ts` (vitest) |
| G4 보호 키 변경 마커 | INV-AUTH-1, INV-CFG-1, INV-MATERIAL-1, INV-MODEL-1 | `npm run check:invariant-change [-- baseRef]` + CI |
| G5 벤치마크 게이트 | INV-BENCH-1, INV-EXP-1 | 하니스 내장(decision gate: runs≥3·fixtures≥2 미충족 시 `comparison_conclusion=null` + PRELIMINARY) |
| G6 드리프트 리포트 | 집계 | `npm run check:invariant-drift [-- baseRef]` |
| G7 지원 모델 가드 | INV-MODEL-1 | `npm run check:supported-models` (커밋된 settings.json ⊆ supported-models.yaml; runtime도 reconstruct live 실행 경계에서 동일 게이트 `assertSettingsModelsSupported` 호출) |
| G8 prompt-projection 패리티 | INV-SCHEMA-1 | `npm run check:prompt-projection-parity` (registry `prompt_projection_contracts` 선언 = runtime 계약 모듈 surface, exact-set + run.ts 소비 강제) |
| G9 final-output-sections 패리티 | INV-SCHEMA-1 | `npm run check:final-output-sections-parity` (registry `final_output_append_sections` 선언 = `final-output-sections.ts` SSOT, exact-set/per-row + run.ts heading 소비 강제) |
| G10 obligation-coverage ratchet | INV-OBLIGATION-COVERAGE-1 | `npm run check:obligation-coverage [-- baseRef]` + CI (active obligation = recorded 또는 parked; legacy pending 비증가; recorded-set 신선도는 harvest 테스트) |

INV-LOOP-1·INV-SCOPE-1은 지침 강제로 남는다(무인 루프·스코프 판단은 구조화 대상 아님).
