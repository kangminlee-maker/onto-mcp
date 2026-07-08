# handoff — Layer-2 누적 LLM 의미 채널 START-HERE (다음 세션)

> 2026-07-01. **Layer-1 완료 + 머지**(PR #158 → origin/main `bc94ebc`). 이 노트만으로 다음 세션이 Layer-2를 바로 착수.
> 메모리: [[unified-comprehension-engine-track]]. 설계 SSOT(=main에 머지됨): `development-records/design/20260701-reduce-merge-layer-boundary-design.md` (§2.2 Layer-2 정의 · §2.3 구조앵커 · §2.5 경계 · §4 2-tier epoch/resume · §8 교차검증 F2 · §9 Claim M 측정).

## 0. 환경 — 어디서 시작하나

- **Layer-1 코어 + 설계문서 + consolidation handoff = origin/main에 머지됨**(PR #158). 단, *이 폴더*(`onto-mcp-claude`)는 `feat/maturation-value-read` 브랜치라 disk엔 없음(다른 트랙).
- **Layer-2 착수 = origin/main 기반 새 격리 워크트리**(PR #158과 동일 패턴, 메인 폴더 미접촉):
  ```
  cd /Users/kangmin/cowork/onto-mcp-claude && git fetch origin
  git worktree add -b feat/comprehension-reduce-layer2 /Users/kangmin/cowork/onto-mcp-l2 origin/main
  ln -s /Users/kangmin/cowork/onto-mcp-claude/node_modules /Users/kangmin/cowork/onto-mcp-l2/node_modules
  ```
  → 그 워크트리에 `comprehension-reduce.ts`(Layer-1) + 설계 SSOT + `20260701-recursive-reduce-measurement-consolidation.md`가 전부 있음. 거기서 작업·검증·커밋·PR.
- 참고 하네스(scratchpad·이 폴더): `scripts/reduce-proof-harness.mts`, `scripts/claim-m-{probe,coverage,semantic}.mts` (재현 명령은 consolidation handoff §2).

## 1. Layer-2가 무엇인가 (design §2.2 · owner 교정)

merge는 **항상 결정론 합집합**(Layer-1 뼈대 = `comprehension-reduce.ts`, 머지됨). **Layer-2 = 각 마디에서 LLM이 자식들의 판단을
종합해 내린 의미 판단을 뼈대 옆에 *별도 저장·누적*하는 병렬 채널** → leaf→구역→시트→워크북 **계층적 의미 지도**. **resume 키(ground)서
제외**, 결정론 트리 위에 얹혀 **seed에 provisional 피드**. = 현 leaf-read provisional label(seed 주입)을 **leaf 하나 → 트리 전체로** 확장.

## 2. 왜 (design §9 실증 — 이미 측정 끝)

over-context서 누적이 flat이 놓치는 전체를 **충실·환각 0**으로 덮음(Claim M coverage ✅·깊은 트리 3레벨도 drop 0). **tenet 2 = 누적은
over-context(한 콜 초과)서만 값함.** ★**의미-품질 "더 나은 seed"인지는 inherently soft → 재측정 금지**(coverage 교란·name confound).

## 3. Layer-1 API (이 위에 Layer-2를 붙임 — ground 무접촉)

`src/core-runtime/reconstruct/comprehension-reduce.ts`: `ComprehensionReduceNode`(뼈대 노드=byte-안정 ground) · `mergeReduceNodes`
· `reduceColumnLeaves(leaves, fanin)` · `buildColumnLeaves` · `reduceNodeGround(Hash)`. Layer-2는 이 트리의 각 노드에 **병렬 LLM 판단**을
부착하되 ground(resume 키)는 **절대 안 건드림**(R1: LLM이 ground 저작 시 ~33% 드리프트).

## 4. ★설계 선결 (design-first · LLM 채널이라 R1 hybrid보다 고위험 · owner 규율)

- **resume 계약**: Layer-2 판단 → §4.1 ⓑ **`llm_touch_fingerprint`**(model·route·prompt·schema)에 fold, resume 키(ground)서 제외.
  재도출 트리거 = **자식 Layer-1 ground 변화(결정론 신호)**; 자식 불변 → 진행 저널 캐시 재사용(자기-jitter 차단, §5.1 P3).
- **★case-2 honesty gap (§8 F2 material · 교차검증이 남긴 미해결)**: 구조 앵커(§2.3: 구조경계 vs 의미경계 대조)는 **case-2(구조 신호 0인
  순수 의미경계)에 구조적으로 눈멈** — 그게 곧 "LLM의 진짜 가치"이자 최고위험. **Layer-2 설계가 이걸 어떻게 검증/표기하는지 선결**:
  (i) §9-f material-only 적대 재검증 / (ii) Claim M을 anchored 경계로 narrow / (iii) 독립 검사. 구조 채널을 *일반* 거짓말탐지기로 제시 금지.
- **honesty**: LLM 판단 = provisional·비권위. 구조 채널은 볼 수 있는 곳에서만 거짓말 탐지기. seed-confirmation(user gate)이 최종 방어.
- **위치**: 트리 저층 = 국소화(Layer-1 우세), 고층 = 의미/함축(Layer-2 필요↑). over-context 전용. per-column 넘는 계층·§5.6 cross-sheet는 별도.

## 5. 프로세스 (owner 규율)

설계 먼저 → **ultracode + onto 교차검증**(★코드 교차검증이 설계리뷰·초기 16테스트가 못 본 실버그 2개[F3 환각-seam·boundary-sort 비-total]를
잡은 전례 — Layer-2는 LLM 채널이라 더 필요) → owner 승인 → 빌드(**mock/fixture LLM 우선**·월 한도) → 실 LLM은 owner 승인/한도 회복 시.

## 6. 함정 / 주의

- **Layer-1 F3 교훈**: "그럴듯한 silent proxy" 금지 — edge shape는 실제 행 shape(note-파생)지 세그먼트 dominant(다수결)가 아니었음. Layer-2도
  대리값·요약이 진짜 신호를 대체하는 함정 주의.
- 깊은 트리 = 3레벨만 검증(무한 아님)·identity-보존 과제. 실 semantic-transform 깊은 트리 drop은 미검증.
- "내 테스트 green ≠ 옳은 걸 쟀다" — 반증가능(negative control) 테스트 필수.
