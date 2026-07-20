# 환경 컨텍스트 프로파일 — 병렬 설계 착수 start-here (2026-07-20, /clear 후 재개용)

> task #10 semantic-map 코드 트랙의 다음 설계 단계. **이것은 설계 저작 단계다** —
> 구현이 아니라 병렬 설계(격리 2벌 + 상호 교차검증) 후 종합이 산출물.
> 재개 시 pwd/branch/HEAD 재검증 필수.

## 0. 상태 핀 (2026-07-20 세션 종료 시점)

- main tip = `2235571` (PR #238 머지). task #10 코드 트랙 **구현 3건 착지**:
  인벤토리 독립화(#236)·경계 addendum v2.3(#237)·Phase 1b set-tier deterministic(#238).
- 이 핸드오프는 wrapup 브랜치 `docs/task10-wrapup-env-profile-handoff`에 커밋됨(머지 후 main).
- 스위트 기준: `npx vitest run` = **3,331 green**(203 files, +1 todo). 6게이트 전건 green.
- settings: `code_structure_inventory` ON(repo), `semantic_map_code`·`semantic_map_code_set_tier`
  미승격(OFF). 되돌리기 = 키 제거(byte-identical).

## 1. 이 설계가 무엇의 대체재인가 (owner 전략 — 근거)

owner 전략 방향(실험1·2 일관 상 "본문 사실은 본문, 구조 사실은 결정론 인벤토리, LLM 요약은
신뢰도만"): **코드 재귀 LLM 추가투자 중단**. 코드 이해 = 세 결정론 축의 합성이다.

1. **결정론 3단 줌** (이미 존재/착지):
   - 줌3 = 디렉터리 롤업 (Phase 1b set-tier topology, #238).
   - 줌2 = 인벤토리 40K bounded projection (#235 착지, `code-structure-inventory-projection.ts`).
   - 줌1 = span 원문 슬라이스 (DD6′ frontier source_lines).
2. **환경 컨텍스트 1차 의미 부여** ← **이 설계의 대상**. 규칙 우선 + 유계 LLM 1패스.
3. **개념 매핑** (seed 저작 + 표적 본문 읽기 보강 — 별도 후속).

즉 이 설계는 **Phase 1b의 보류된 LLM set 층(FD9/FD10 synthesize·G11)의 결정론 대체재**다.
set-tier가 "무엇이 있고 무엇을 import하는가"(구조 사실)를 준다면, 환경 프로파일은 "이것이
무슨 성격의 코드베이스인가"(1차 의미)를 규칙 기반으로 부여한다.

## 2. 설계 스코프 (owner 제시 — packet에 넣을 것)

- **언어/프레임워크/인프라 판별**: 설정 파일 신호(package.json·tsconfig·requirements.txt·
  pyproject·Dockerfile·*.yaml 등) → 언어·런타임·프레임워크·인프라 판정. 규칙 테이블 우선.
- **레이어 분류**: 경로 관례(src/·test/·api/·core/·ui/ 등) → 아키텍처 레이어 후보 부여.
- **힌트 테이블**: 구조 신호(디렉터리명·파일명 패턴·import 성격) → 온톨로지 후보 매핑.
- 유계 LLM 1패스는 규칙이 침묵/모호할 때만(규칙 우선, LLM은 신뢰도 보조 — 실험 상과 정합).

경계 질문(설계가 답할 것): 결정론 규칙 vs 유계 LLM의 분업선은 어디인가? 산출물은
reconstruct의 어느 소비 지점(seed 저작 프롬프트? candidate inventory? 별도 아티팩트?)에
주입되는가? set-tier 아티팩트/fingerprint와 어떻게 합성/격리되는가?

## 3. 설계 방법 — 병렬 설계 표준 (필수, 메모리 `design-parallel-frontier-crossverify`)

- **트리거 성립**: 신규 개념·아키텍처 설계 → isolated frontier ≥2 병렬 + 상호 교차검증.
- **⚠️ owner 승인 게이트**: 이종 provider frontier 설계(OAuth/이종 API 키 dispatch)는
  **요청마다 명시 승인 필요**(standing 아님 — CLAUDE.md Multi-Model Workflow). 착수 시
  owner에게 "이 설계에 이종 provider(fable-5 + gpt-5.6-sol 등) API 사용 승인?" 1줄 확인 후 진행.
  승인 전에는 blind packet 저작·스코프 확정까지만.
- **blind packet 원칙**: 각 설계자에게 증거·제약·루브릭·중립 대안만 전달(주 세션 결론·상대
  초안 비공개). **corpus 설계 원칙 주입 필수**(외부 모델은 이 corpus를 로드하지 않음):
  concept economy·LLM/capability boundary·staged workflow.
- **종합**: 수렴 채택(고신뢰)·발산 합집합 검토·owner 결정 항목 분리. 이후 구현 착수 시
  기존 관례(구현 후 3-렌즈 교차검증) 병존.

## 4. 참조

- 전략·경계 근거: `design/20260720-semantic-map-multi-artifact-phase1-detailed-design.md` §10
  addendum v2.3(경계 확정), 실험 disclosure 2건(`benchmark/20260720-semantic-map-dd6-live/`·
  `20260720-semantic-map-midfile-live/`).
- 1b 착지 실코드(합성/격리 대상): `src/core-runtime/reconstruct/comprehension-set-tier.ts`
  (topology·relation·overview·fingerprint), `src/core-runtime/code-structure-observer.ts`
  (인벤토리·import 캡처), impl plan `design/20260720-semantic-map-1b-deterministic-impl-plan.md`.
- 설계 표준: 메모리 `design-parallel-frontier-crossverify`. 트랙 전체:
  `onto-mcp-semantic-map-multiartifact-start-20260718`.

## 5. 검증 명령 (설계는 코드 무변경이나, 착수 전 상태 재확인용)

```
git fetch origin main && git log --oneline -1 origin/main   # 2235571 이상
npx vitest run                                              # 3,331 green 기준
```

## 6. 백로그 (이 설계 밖, task #10 트랙 잔여)

- `semantic_map_code_set_tier` 승격 여부 — deterministic set-tier 실사용/live 근거 후 owner.
- 디렉터리/glob targetRef → 초기 관찰 집합 파일별 확장 (코드베이스 스코프 케이스 — set 조립
  위치 이동이 아니라 초기 집합 확장. impl plan §적응8).
- 1b LLM set 층(FD9 synthesize/seed 계약·FD10 passthrough·G11) — 환경 프로파일이 대체하면 폐기 후보.
- 문서 트랙(텍스트 티어 + D3 비전 채널 docx/pdf — owner 필수 지정).
- maturation-convergence-ledger fail-loud(run.ts, exp2 재현) — resubmit/재시도 후보.
