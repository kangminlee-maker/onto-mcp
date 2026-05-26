# Review Lens Registry

> 상태: Active
> 목적: 현재 `onto` 메인 레포의 `검토 (review)`에서 사용하는 canonical review 구조를 고정한다.
> 기준 문서:
> - `.onto/authority/core-lexicon.yaml`
> - `.onto/processes/review/issue-stance-deliberation-contract.md`

---

## 1. Canonical Review Structure

`검토 (review)`의 canonical 구조는 아래다.

- `9개 review lens`
- `controlled lens deliberation`
- `1개 종합 단계 (synthesize)`

즉:

- `8개의 기존 검증 관점`
- `가치/목적 정합 lens (axiology)`
- `teamlead 통제 하의 lens 간 숙의`
- `종합 단계 (synthesize)`

로 구성된다.

---

## 2. Review Lenses

| Lens ID | 한글 설명 | 책임 |
|---|---|---|
| `logic` | 논리 lens | 모순, 타입 충돌, 제약 충돌 |
| `structure` | 구조 lens | 고립 요소, 끊긴 경로, 누락 관계 |
| `dependency` | 의존성 lens | 순환, 역방향, 다이아몬드 의존 |
| `semantics` | 의미 lens | 이름-의미 불일치, 동의어/동음이의 |
| `pragmatics` | 실용성 lens | 질의 가능성, competency question 적합성 |
| `evolution` | 진화 lens | 신규 데이터/도메인 추가 시 파손 위험 |
| `coverage` | 커버리지 lens | 누락 하위영역, 개념 편향, 표준 대비 갭 |
| `conciseness` | 간결성 lens | 중복 정의, 과잉 구체화, 불필요한 구분 |
| `axiology` | 가치/목적 정합 lens | 목적 이탈, 가치 충돌, mission misalignment |

---

## 3. Synthesize Stage

| Stage ID | 한글 설명 | 책임 |
|---|---|---|
| `controlled-lens-deliberation` | 통제된 lens 숙의 | root-cause issue별 lens stance를 확인하고 material conflict resolution을 `deliberation.md`에 기록 |
| `synthesize` | 종합 단계 | lens 결과와 `deliberation.md`를 읽고 consensus, disagreement, overlooked premises, final review output을 구성 |

중요한 구분:

- `axiology`는 **독립 lens**다.
- `controlled-lens-deliberation`은 **synthesize 이전의 resolution authority**다.
- `synthesize`는 **종합 단계**다.

즉 `axiology`는 다른 lens들과 동등한 한 관점이고,
controlled deliberation은 관점 간 충돌을 제한 맥락에서 정리하며,
`synthesize`는 그 결과를 보존적으로 모아 최종 결과를 작성한다.

---

## 4. Role Distinction

### 4.1 `axiology`

- 목적/가치 정합을 보는 독립 lens
- 자체 finding을 만든다
- 다른 lens 전체를 요약하지 않는다
- `New Perspectives` canonical slot을 소유한다 (axiology-exclusive)

### 4.2 `synthesize`

- lens set 전체와 `deliberation.md`를 읽어 final review output을 만든다
- 새로운 독립 관점 행세를 하면 안 된다
- unresolved disagreement를 묵살하지 않고 보존해야 한다

### 4.3 Overlap-permitted lens claims

여러 lens가 동일 현상에 대해 각자 lens-qualified claim을 내는 것이 허용된다. overlap 정책과 claim relation 분류의 normative seat는 `.onto/processes/review/shared-phenomenon-contract.md`이다.

---

## 5. Execution Separation Rule

실행 분리 규칙의 normative seat는 `.onto/processes/review/lens-prompt-contract.md` §3 (Core Execution Rule)이다. 이 섹션은 개관만 제공한다.

`review lens`는 개념적으로도 실행상으로도 서로 독립이어야 한다.

여기서 canonical 개념은
**맥락 격리 추론 단위 (ContextIsolatedReasoningUnit)** 다.

어떤 host realization을 쓰더라도 변하지 않는 canonical rule:

1. 각 lens는 자기 전용 맥락에서 실행된다
2. Round 1에서는 다른 lens의 결과를 보지 않는다
3. controlled lens deliberation은 Round 1 lens finding 이후 실행된다
4. `synthesize`는 `deliberation.md`가 나온 뒤에만 실행된다
5. 메인 `LLM` 콘텍스트는 lens별 세부 reasoning을 직접 모두 담지 않는다

---

## 6. Prompt Contract Source

현재 `review`의 prompt-backed reference path에서
각 lens와 synthesize 단계의 source material은 아래다.

- 공통 lens wrapper: `src/core-runtime/cli/materialize-review-prompt-packets.ts`
- 개별 lens perspective: `.onto/roles/{lens-id}.md`
- synthesize specialization: `.onto/roles/synthesize.md`

관련 계약 문서:

- `.onto/processes/review/lens-prompt-contract.md`
- `.onto/processes/review/synthesize-prompt-contract.md`

---

## 7. Registry Note

`review`의 canonical 구조는 아래다.

- `axiology`
- controlled lens deliberation
- `synthesize`
