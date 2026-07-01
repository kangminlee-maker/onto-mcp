# handoff — Layer-2 S3 resume (over-context frontier)

> 2026-07-01. **설계 v2.1 + S1 + S2 + 코드 교차검증 하드닝 = 전부 커밋**(브랜치 `feat/comprehension-reduce-layer2`·워크트리 `onto-mcp-l2`·origin/main `bc94ebc` 기반).
> **브랜치 독립 완료**: `origin/feat/comprehension-reduce-layer2`에 push·upstream=자체 원격(origin/main 추적 아님·pull 안전). PR 미생성. 다른 세션(`feat/maturation-value-read`)과 파일 무충돌(내 파일 미접촉).
> 설계 SSOT: `development-records/design/20260701-layer2-accumulated-semantic-channel-design.md` (**§13 = 빌드 지배 v2.1 build-spec**·§11/§14 검증기록).
> 메모리: [[unified-comprehension-engine-track]] · [[design-validation-ultracode-onto]].

## 0. 환경
- 워크트리 `/Users/kangmin/cowork/onto-mcp-l2` (node_modules 심링크·**gitignore 안 됨→커밋 시 explicit pathspec으로 제외**).
- 메인 폴더(`onto-mcp-claude`)는 `feat/maturation-value-read`(다른 트랙)·미접촉.
- 검증: `npm run check:ts-core` · `npx vitest run` · `npm run check:import-boundary`.

## 1. 커밋된 상태 (origin/main..HEAD = 4 커밋)
| 커밋 | 내용 |
|---|---|
| `97ecbd1` | docs(design): v2.1 build-spec (2-round cross-validation) |
| `acecd09` | feat: S1 결정론 코어 (ReduceTopologyTrace + reconcile + fingerprint + 검증기) |
| `2015ca2` | feat: S2 mock 누적엔진 (accumulateSemanticMap) |
| `8c3ab64` | fix: fail-closed 하드닝 (코드 교차검증 8 findings) |

- 검증 baseline: **full vitest 139파일 2152 pass +1 todo·회귀0** · semantic-map **53 pass** · ts clean · import-boundary pass.
- behavior change 0: `comprehension-semantic-map.ts`는 standalone(어떤 live 경로도 import 안 함).

## 2. 무엇이 검증됐나
- **설계**: v1 양패밀리(ultracode+onto) REDESIGN_NARROW → v2 $ultracode-for-codex SOUND_WITH_REVISIONS → v2.1.
- **코드(S1+S2)**: $ultracode-for-codex(CHANGES_REQUIRED·8 confirmed·tsx probe) + onto(16 issue) **강한 수렴** = fail-closed 가드가 malformed 입력에 fail-open → 전부 하드닝(`8c3ab64`)·11 adversarial 음성대조. **★코드-레벨 교차검증이 by-construction 테스트가 못 본 fail-open 7개 적발**(Layer-1 F3 전례 반복).

## 3. ▶ NEXT = S3 (over-context frontier 게이트) — 설계 §13.6
- `shouldAccumulate(node, trace)`: **단일 결정론 metric = 서브트리 leaf 수**(row_span/ground-byte 혼용 금지·codex-F5) > `OVER_CONTEXT_BUDGET`. config + predicate/ordering logic sha 둘 다 §13.4 preimage(`over_context_gate_config_sha256`·`over_context_gate_logic_sha256`)에 fold.
- **frontier/subsumed**: over-context 서브트리=노드마다 누적, in-context 서브트리=frontier 노드 하나만 flat-read·그 아래 `reduce_read_attempt="subsumed"`(의미노드 존재하나 판단은 frontier 흡수·consumed=[]). 불변식 = "frontier 위/on 모든 뼈대 노드 populated 정확히 하나, 아래 subsumed(명시)".
- S2의 `accumulateSemanticMap`는 현재 **전 노드 누적**(frontier 없음·consumed==topology). S3 = frontier 게이트를 walk에 배선 + subsumed 처리 + `assertChildJudgmentCoverage`가 이미 subsumed-aware(consumed=[]).
- tenet 2: 누적은 over-context서만 값함(재측정 금지·§1). in-context는 flat.

## 4. 이후
- **S4**: seed 투영(default-off·byte-parity·§6 정직 투영규칙 + taint census + refuted disclosure).
- **실 LLM**: owner 승인/월 한도 회복 시. §9 측정분 재사용·**재측정 금지**.
- **production 배선**: 최소증명 후. `ComprehensionArtifact` engine-not-yet 필드(`semantic_depth` 등)·§12 N7 6-필드 매핑은 배선 시.

## 5. ⚠️ 별도 SHIPPING 이슈 (Layer-2 범위 밖·owner 결정)
codex 코드리뷰가 부수 확인: `src/core-runtime/reconstruct/llm-touch-fingerprint.ts`도 **동일 inherited-key 클래스**(`stableJson`=Object.keys own-only → `Object.create` 프리이미지 시 required 필드가 해시서 drop). = leaf-read resume 다이제스트. Layer-2 F3와 동종이나 **shipping 경로**라 별도 하드닝 패스 필요(live 콜러가 실제 트리거하는지 먼저 확인).

## 6. 재현 (교차검증)
- codex-ultracode: `codex exec -C <wt> -o result.md < prompt.md`(gpt-5.5·xhigh·approval=never·OpenAI 쿼터=Claude 한도 무관·자체 verify+probe+vitest).
- onto: `onto_review(target=<dir>, diffRange="<a>..<b>", reviewMode=full, noDomain=true)` → `onto_review_read(latest=true)` 폴링 / `.onto/review/<id>/issue-ledger.yaml` 직접 판독. ⚠️ target=파일+diffRange는 git-cwd ENOTDIR→target=디렉토리.
