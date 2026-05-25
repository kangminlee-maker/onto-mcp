# Output Language Boundary

**Authority**: rank 4 (인터페이스 명세). CLAUDE.md §"Authority 위계" 에 등록.

## 1. 원칙

onto 시스템의 모든 텍스트는 두 축으로 분리하여 언어 정책을 적용한다:

| 축 | 언어 정책 | 대상 |
|---|---|---|
| **External output** | `output_language` 설정값에 따라 번역 (en/ko/ja/...) | 개발자·이용자가 읽는 최종 텍스트 |
| **Internal system** | **English 단일 언어 강제** | LLM agent 프롬프트, agent 간 hand-off payload, runtime 상태 artifact, 스크립트·코드 문자열 |

### 판정 기준 (single rule)

> "이 텍스트를 소비하는 **다음 agent 또는 run** 이 존재하는가?"

- **Yes** → Internal → English 고정 (예외 없음)
- **No** (오직 사용자만 읽음) → External 후보 → `.onto/authority/external-render-points.yaml` 에 등록된 지점에서만 번역

## 2. Rationale — 왜 이 경계가 필요한가

### 2.1 LLM Semantic Drift

동일 의미의 프롬프트·artifact 를 언어별로 번역하면, 언어마다 동의어·뉘앙스·concept cluster 가 미세하게 달라져 LLM 의 추론이 분기한다. onto 의 여러 agent 가 공유하는 artifact (`wip.yml`, `deltas/`, `session-log.yml` 등) 에 번역된 텍스트가 섞이면:

- downstream agent 가 번역된 텍스트를 해석해 또 다른 편차를 만듦 — 중간 번역층이 누적된다
- 같은 session 을 resume 하거나 여러 run 을 재실행할 때 결정론적 재현성 파괴
- 여러 세션 간 cross-comparison (learning extraction, benchmark, audit) 불가능

### 2.2 UX 본능이 원칙을 덮어쓸 때

"사용자가 한국어 결과를 즉시 보게 하려면 agent 프롬프트에 `Respond in ko` 를 넣는 게 제일 쉽다" — 이 UX 본능이 semantic drift 비용을 가린다. 이런 패턴은 agent 출력이 곧바로 user 에게 노출되는 단순한 case 에서는 동작하지만, agent → agent hand-off 나 artifact 에 번역문이 섞이는 순간 onto 의 multi-agent 아키텍처 전제가 무너진다.

## 3. 경계 정의 — 구체적 케이스

### 3.1 Internal (English 고정)

- LLM agent system prompt / user prompt 본문
- Agent 가 다음 agent·round·artifact 로 전달하는 모든 natural-language payload
- `wip.yml`, `deltas/`, `session-log.yml`, epsilon/conflict 메시지, reasoning log
- 코드 내 상수 문자열·로그 메시지
- Runtime diagnostic (structured JSON/YAML) 의 `message` 필드

### 3.2 External (output_language 적용)

- onto CLI 가 사용자에게 표시하는 최종 리포트 (Phase 5 완료 리포트, review synthesize 최종본)
- Halt 메시지 템플릿 렌더링
- Phase 3 사용자 요약·inquiry (interactive 단계에서 사용자가 직접 읽음)
- `onto help` / `onto onboard` 대화형 출력
- `onto govern submit` 응답 메시지
- 사용자 직접 소비를 전제한 review round1 파일의 "user-visible annotation" 섹션 (단, synthesize 에 넘기는 본문은 English 유지)

### 3.3 경계 판정이 애매한 케이스의 지침

- **Review lens 출력** — "이중 목적" 문제. lens 본문은 synthesize 에 넘어가므로 English 유지 원칙. 단 리포트 최상단의 summary 같은 "사용자 직접 소비 영역" 은 분리해 render_for_user 통과 가능
- **Halt 메시지** — 사용자 직접 소비이므로 번역 대상이되, 템플릿 자체는 English 로 작성해 internal 에 저장하고 **render 시점에만** 번역

## 4. 예외 절차 — 새 external render point 추가

새로 번역이 필요한 지점이 발견되면:

1. `.onto/authority/external-render-points.yaml` 에 PR 로 항목 추가
2. `rationale` 필드에 "이 지점 이후 다른 agent 소비 없음" 을 증명
3. 해당 render 로직은 `src/core-runtime/translate/render-for-user.ts` (canonical render 함수) 를 통해서만 호출
4. 리뷰어는 제안된 지점이 §3.1 에 속하지 않는지 확인

## 5. 구현 상태 (2026-04-17 기준)

**확립된 것**:
- 본 원칙 문서 (rank 4)
- `.onto/authority/external-render-points.yaml` — 10 개 초기 entries 등록 (halt 6 + phase 3 summary + phase 5 report + onboard + help)
- `CLAUDE.md` Authority 위계 등록
- Canonical render 함수 `src/core-runtime/translate/render-for-user.ts` — 런타임 registry 검증 + passthrough 렌더 (Phase 1). `renderForUser({renderPointId, internalPayload, userLanguage})` 호출 시 미등록 id 는 예외
- review lens / synthesize 프롬프트에서 `Respond in {output_language}` 제거 → `Respond in English` + render seat 참조
- **CI lint gate 활성** (`scripts/lint-output-language-boundary.ts` + GitHub Actions). `Respond in {output_language}` 패턴이 allowlist 외 파일에 등장하면 build fail. 374 파일 스캔 baseline clean
- **Review contract 정렬 완료**: `lens-prompt-contract.md` §3.1 + `synthesize-prompt-contract.md` §2.1 에 Language Policy 섹션 신설. `output_language` 를 Required Inputs 에서 제거 (orphaned contract clause 해소). contract reader 가 보는 계약 표면이 원칙과 일치
- **Production synthesize packet `Tools: required` 활성** — `materialize-review-prompt-packets.ts` 가 synthesize 전용으로 `- tools: required` 를 패킷에 포함. A4 fail-fast 가 실제 운영 경로에서 가동 (이전까지는 benchmark 패킷에서만 동작)
- **Standard `[Language Policy]` prompt boilerplate 전수 주입 완료** — `.onto/processes/review/lens-prompt-contract.md` + `.onto/processes/review/synthesize-prompt-contract.md` example skeleton 에 §7 canonical 블록 주입. 기존 inline "Respond in English" 지시와 병행해 LLM attention redundancy 확보

**미확립 — 후속 PR 로 정식화 필요**:
- 실제 번역 로직 (현재는 passthrough). 선택지: (a) 등록 지점별 per-language 템플릿 테이블, (b) LLM 기반 on-demand 번역. 어느 쪽이든 renderForUser 시그니처는 안정
- Review lens/synthesize output 의 **body vs user-visible summary 구조적 분리** — §3.3 dual-purpose case. `ReviewRecord` 스키마와 `materialize-review-prompt-packets.ts` 까지 영향. 독립 설계 세션 필요

**현재 상태의 함의**: 원칙 + registry + canonical render seat + 모든 프롬프트 위반 수정 + CI lint 활성 + review contract 정렬 + production A4 활성 + prompt boilerplate 전수 주입 — **5 레이어 방어 완비**. 기여자가 새 위반을 도입하면 CI 에서 즉시 차단하고, LLM 은 실행 시점에 [Language Policy] 블록으로 원칙을 직접 인지한다. 남은 작업은 모두 "확장" 성격 (실제 번역 layer, 구조적 output 분리).

## 7. Standard [Language Policy] Block (canonical)

Agent 프롬프트에 주입하는 표준 블록. 새 agent prompt 를 추가할 때 본 블록을 `[Task Directives]` (또는 동등 섹션) **바로 앞** 에 삽입한다.

```
[Language Policy]
Respond in English. Reasoning, tool arguments, YAML / markdown emits, and
hand-offs to other agents stay English-only regardless of `output_language`.
Principal-facing translation happens at the Runtime Coordinator's render seat
(.onto/principles/output-language-boundary.md).
```

주입 위치 원칙:
- `[Your Definition]` / `[Context Self-Loading]` / `[Agent-Domain Document Mapping]` 이후 (모든 context 를 읽은 뒤)
- `[Task Directives]` / `[Team Rules]` / `[Rules]` / `[Output Rules]` 이전 (지시를 시작하기 전)
- 본 블록은 **복사 주입** 방식이다. 문구 변경이 필요하면 본 §7 이 canonical seat 이므로 여기서 수정 후 전 사용처에 전파한다. Template 변수화 (`{language_policy_block}`) 는 Phase 2 번역 로직 도입 시점에 고려 (현재는 lint가 정적 문자열을 요구).

현재 주입된 위치 (2026-04-17 기준):
- `.onto/processes/review/lens-prompt-contract.md` §10 Example Prompt Skeleton
- `.onto/processes/review/synthesize-prompt-contract.md` §7 Example Prompt Skeleton

## 8. Phase 2 Decision Tree (번역 로직 착수 시)

§5 에서 미확립으로 남은 "실제 번역 로직" 은 아래 trigger → backend → scope 의 순서로 결정한다.

### 8.1 Trigger 판정

| Trigger | 조건 | 발동 시 필요 판단 |
|---|---|---|
| T1. Principal 비영어 요구 | `output_language ≠ en` 로 실제 운영 + principal 이 English 잔존을 UX 불편으로 보고 | 지원 언어 allowlist, 번역 backend 선택 |
| T2. Review/reconstruct 본문 비영어 소비 | principal 이 review 결과를 비영어로 읽고자 함 | E-2 (output structural split) 선행 필수 |
| T3. 다국어 principal 팀 | 같은 프로젝트에 여러 언어 principal 공존 | 언어별 선언적 allowlist + 일관성 검증 |

Trigger 미도달 시 Phase 2 미착수. passthrough 유지 자체가 보호 장치.

### 8.2 Backend 선택

| Backend | 적합 case | Trade-off |
|---|---|---|
| A. per-language template table (`.onto/authority/external-render-translations/{id}.{lang}.md`) | halt 메시지, 완료 리포트, help — 구조 고정 + 짧은 텍스트 | 정확성 높음 / add new point 시 전 언어 동시 작성 부담 |
| B. LLM on-demand | Phase 3 user summary, review synthesize — 동적·긴 텍스트 | 유연성 높음 / latency·cost + semantic drift 재유입 risk |
| C. Hybrid (per-point 모드 선언) | 혼재 필요 시 | registry schema 확대, 기여자 인지 부담 |

### 8.3 진입 경로 (sketch `20260417-phase-2-translation-design-sketch.md` §7 반영)

1. Minimal viable: T1 + Backend A 로 halt (6) + phase_5_report 만 지원
2. 운영 측정 (수 주) 후 다른 render point 확장 판정
3. Backend B 는 측정 근거 + 번역 품질 regression test 확립 후에만 도입

### 8.4 구현 시 invariant

- `renderForUser` signature 변경 금지 (현 호출자 안정)
- 번역 실패 → English fallback (절대 halt 하지 않음)
- 번역 결과 snapshot test 도입 (baseline 급변 시 CI fail)

## 9. Translation Policy Layers (용어 번역 정책)

Phase 2 번역 backend 가 도입되어도 **canonical identifier 의 번역 규칙** 없이는 개념 identity drift 가 발생한다 (예: `ontology`, `principle`, `review_record` 등이 실행마다 다른 번역어로 렌더). 이 drift 는 lexicon-citation-check 및 experience → learn 파이프라인의 cross-reference 를 무너뜨린다.

본 §9 는 해당 공백에 대한 **4 layer 구조** 를 규범으로 고정한다. Layer 1/2/4 는 lexicon v0.20.0-v0.21.0 에서 구체화, Layer 3 은 Phase 2 backend 도입 시점에 확정.

### 9.0 정책 핵심 (v0.21.0 flip)

> **rank 1-4 authority 정의 개념 + command 어휘는 원어 통일 (preserved).**
>
> Lexicon entities/terms (rank 1) + .onto/principles/productization-charter/interface-specs (rank 2-4) + CLI command 어휘는 번역 대상에서 제외. Translation 은 비-core prose 에만 명시적 opt-in 으로 적용.

이유:
- rank 1-4 개념은 lexicon-citation-check, experience → learn 파이프라인, synthesize output 의 cross-reference 의 anchor. 번역되면 이 anchor 가 깨짐
- 중간 지점 (bilingual 병기) 을 정책으로 유지하면 "언제 병기, 언제 원어" 의 런타임 state tracking 필요 — complexity 대비 실익 미미
- korean_label 은 Korean-speaking 기여자의 개념 이해용 descriptive reference 로 유지 (렌더링에는 쓰이지 않음)

### 9.1 Layer 1 — Lexicon `translation_mode` 필드 (SSOT)

`.onto/authority/core-lexicon.yaml` 의 `authoring_rules.translation_policy` 가 정책 SSOT. 각 entity / term 은 필요 시 `translation_mode` 를 선언한다.

| Mode | 규칙 | 예시 |
|---|---|---|
| `preserved` (default) | 원어 유지. 번역 대상에서 제외 | `ontology`, `review_process`, `principle`, `principal` — rank 1-4 정의 개념 전수 |
| `translated` (explicit opt-in) | `korean_label` 또는 glossary `translated_label` 로 치환 | 현재 0 건. 미래 rank 1-4 밖 일반어가 lexicon 등재 + 번역 무해 시 사용 |

**bilingual mode 는 v0.21.0 에서 완전 제거**됨 (v0.20.0 에서 6 entries 시험 후 abolish).

### 9.2 Layer 2 — Translation glossary (언어별)

`.onto/authority/translation-glossary/{lang}.yaml` 에 Layer 1 mode 의 보조 정보를 유지한다.

```yaml
# .onto/authority/translation-glossary/ko.yaml 예시 (v0.21.0)
version: "1.1"
language: "ko"
schema_version: "1"
entries:
  - term_id: "ontology"
    mode: "preserved"
    rationale: "project-specific technical term. 번역 시 identity 손상"
  # translated 예시 (현재 사용 없음):
  # - term_id: "some_generic_noun"
  #   mode: "translated"
  #   translated_label: "일반 명사"
  #   rationale: "rank 1-4 외부 일반어. 번역 무해"
```

**역할 분담**:
- lexicon = mode 의 SSOT
- glossary = preserved 항목의 rationale 문서 (optional) + translated 항목의 translated_label 보유 (lint R3 enforce)

### 9.3 Layer 3 — 번역 엔진의 term-aware 규칙

`renderForUser` 의 Phase 2 구현 시 반드시 다음 순서 적용:

1. 입력 text 를 glossary 의 canonical_label 에 대해 token match (word boundary)
2. 각 match 에 mode 적용:
   - `preserved`: 치환 없음 (default 경로)
   - `translated`: `translated_label` 치환 (없으면 lexicon `korean_label` fallback)
3. File path / code identifier / 이미 번역된 segment 는 lookup 우회
4. 나머지 일반 문장은 backend 로 번역

### 9.4 Layer 4 — CI lint 로 drift 방어

`scripts/lint-output-language-boundary.ts` 의 규칙 (v0.21.0 재정의):

- **R3**: lexicon 에 `translation_mode: translated` 가 explicit 선언된 경우, 지원 언어 glossary 에 translated_label 포함 entry 존재
- **R4**: glossary entry 의 mode 가 lexicon 의 declared mode 와 일치
- **R5**: glossary entry 의 term_id 가 lexicon 의 entity key 또는 term_id 에 존재

R3 은 v0.20.0 의 "preserved|bilingual 선언 시 glossary 필수" 에서 "translated 선언 시 translated_label 필수" 로 재정의됨 (default=preserved 기반 정합).

### 9.5 구현 분산

| Layer | 구현 PR | 상태 |
|---|---|---|
| 1 (lexicon translation_policy + default=preserved) | v0.21.0 | ✅ 확정 |
| 2 (ko glossary — preserved rationale + translated opt-in slot) | v0.21.0 | ✅ seed 존재 |
| 3 (엔진 term-aware 규칙) | Phase 2 backend 도입 PR | ⏳ deferred |
| 4 (lint R3/R4/R5 v0.21.0 재정의) | 동일 v0.21.0 PR | ✅ 재정의 완료 |

## 6. 관련 문서

- `.onto/authority/external-render-points.yaml` — 허용된 render 지점 레지스트리
- `.onto/principles/llm-runtime-interface-principles.md` — rank 4 동료 문서
- `.onto/principles/llm-native-development-guideline.md` — rank 2. LLM-native 설계 원칙의 상위 컨텍스트
- 초안 메모: `.onto/temp/output-language-boundary-proposal.md` (2026-04-17 세션의 5-layer 구조 제안. 본 문서는 해당 proposal 의 §1 원칙 + §L1 registry + §L2 render seat + §L3 CI gate + §L4 [Language Policy] boilerplate + §L5 doc 구조를 레포에 순차적으로 착륙시킨 결과. 5 레이어 중 L2 의 실제 번역 구현 + review contract 의 body/summary 구조적 split 만 trigger-based 이연)
