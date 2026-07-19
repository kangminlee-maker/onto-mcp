# G-SEM live N=1 사전 등록 프로토콜 (2026-07-19)

> 설계 SSOT: `development-records/design/20260718-semantic-map-multi-artifact-phase1-detailed-design.md`
> §1 G-SEM · §6-5 · O-2. 핸드오프: `development-records/handoff/20260719-semantic-map-step7-start-here.md` §2.
> **이 문서는 live run 실행·산출물 열람 전에 커밋된다** (질문 사후 선택 금지 요건).

## 대상 (owner 결정 2026-07-19)

- 파일: `src/core-runtime/code-structure-observer.ts` (owner가 run.ts 제안 → 결정론 프로브
  데이터 검토 후 본 파일로 확정: 414줄, synthesize 수요 109, verify 캡 여유.
  run.ts(19,697줄·수요 1,295)는 verify 캡 1,000 초과 시 관찰 전체 무효화 리스크로 후속 이월).
- content sha256 (선두 16hex): `8f055465204ffb4e`
- 경로: 1a (단일 파일, per-observation), 전 구간 live reconstruct.
- seat: synthesize = `gpt-5.6-luna@low` (repo settings `actors.semantic_map_synthesize`),
  verify = base author `gpt-5.6-sol@medium`. 스테이지 config = `DEFAULT_SEMANTIC_MAP_STAGE_CONFIG`
  (leaf 8·fanin 2·budget 2·synth 2,400·verify 1,000·nodes 60·disclosure 30).
- 활성화: repo `.onto/settings.json` `reconstruct.execution.semantic_map_code: true` —
  run 시 워킹트리 한정, main 승격 커밋은 **G-SEM 판정 후 owner 결정** (O-1 승격 게이트).

## 양 arm

- **대조군 (control)**: `scripts/semantic-map-gsem-control.mts`가 live run의
  `source-observations.yaml`에서 생성하는 flat 심볼 outline (LLM 무접촉, 결정론).
- **처치군 (treatment)**: live run 재귀 seed projection — 세션 `comprehension/semantic-map.yaml`
  sidecar code 행을 DD9 렌더러(`renderSemanticMapProjection`, includeNote=false)로 렌더.

## 블라인드 절차

- 평정자: **독립 judge** (owner 아님 — 기록 요건 충족). 실현: 프로젝트 문맥 없는 별도 LLM
  세션(judge 신원은 RESULT.md에 기록). judge는 라벨 "자료 A"/"자료 B"만 받고 어느 쪽이
  어느 arm인지·본 실험의 목적을 모른다.
- 라벨 배정(봉인 규칙, judge 비공개): 대상 content sha 선두 hex digit 짝수 → **A=처치군,
  B=대조군**; 홀수 → 반대. (`8` = 짝수 → A=처치군.)
- 평정 방식: 각 질문에 대해 judge가 **자료 A만으로** 1회, **자료 B만으로** 1회 독립 답변
  + 각 답변에 "이 자료만으로 답할 수 있는가(answerable)"를 자가 표기. 이후 unblind하여
  질문별로 "처치군만 답 가능(또는 처치군 답이 실질적으로 더 완전)" 여부를 채점.

## 고정 질문 (5문 — 평정 전 커밋, 사후 추가·선택 금지)

1. 이 파일의 전체 목적은 무엇이며, 최상위에서 어떤 주요 기능 영역(블록)으로 나뉘는가?
   각 영역의 라인 범위를 근거와 함께 제시하라.
2. 언어별 처리(문법/파서 로딩, 언어→구성 매핑)와 관련된 코드는 어느 영역들에 있고,
   서로 어떤 관계로 연결되는가?
3. 이 파일에서 산출물의 결정론(재실행 동일성)을 보장하기 위한 장치는 어디에 위치하며
   무엇을 하는가?
4. 파일 내에서 코드의 목적이 전환되는 경계(예: 정의/등록부 → 실행/추출부)는 어디이며,
   그 전후 코드는 각각 어떤 성격인가?
5. 외부 소비자가 이 파일에서 호출하는 진입점은 무엇이고, 그 진입점이 내부적으로 의존하는
   하위 구조는 어떤 순서로 구성되는가?

## 판정

- **PASS**: 5문 중 **≥ 3문**에서 처치군만 답 가능하거나 처치군 답이 대조군 답 대비 명백히
  더 완전·구체 (unblind 채점 근거를 RESULT.md에 질문별 기록).
- **FAIL**: 상기 미달 → **재설계 스톱** (O-5로 봉투 보강 fallback 소진 — 추가 봉투 확장
  재제안 금지, 설계 §1).
- 기록물: run 로그·census·sidecar·양 arm 산출물·judge 원문 응답·채점표·판정 — 본 디렉터리.
