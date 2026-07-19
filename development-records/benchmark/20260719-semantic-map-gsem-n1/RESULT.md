# G-SEM live N=1 결과 — **FAIL (0/5)** → 재설계 스톱 (2026-07-19)

> 사전 등록: [PROTOCOL.md](PROTOCOL.md) (run 실행 전 커밋 `d5c828f`). 판정 기준·질문·블라인드
> 절차는 등록본에서 변경 없음.

## run 요약

- 대상: `src/core-runtime/code-structure-observer.ts` (414줄, content sha `8f055465204ffb4e`)
- status **completed**, 2,163s. synthesize **109회** (결정론 프로브 예측 109와 정확 일치,
  `synth:codex/gpt-5.6-luna@adapter=codex_cli@synthesize_effort=low`), verify **2회**
  (unanchored 2 — live author가 경계 115개를 seam에 접지; confirmed 1·refuted 1).
  map_present 1/1, produced_nodes 109. X7 캡 무접촉. 로그 [run-log.txt](run-log.txt),
  census [semantic-map-census.yaml](semantic-map-census.yaml),
  sidecar [semantic-map.yaml](semantic-map.yaml).

## 평정

- 평정자 기록(프로토콜 요건): **독립 judge** = claude-fable-5 서브에이전트, 프로젝트 문맥
  없음, **도구 사용 0회**(사용 시 무효 규칙 — usage 카운터로 확인), 라벨 A/B만 제공.
- unblind (봉인 규칙: sha 선두 `8` 짝수 → A=처치군): **A=재귀 seed projection 렌더**
  ([treatment-render.json](treatment-render.json)), **B=flat 심볼 outline**
  ([control-outline.txt](control-outline.txt)). judge 패킷 [judge-packet.md](judge-packet.md),
  judge 원문 응답 [judge-response.md](judge-response.md).

| 질문 | A(처치군) | B(대조군) | 처치군 우위? |
|---|---|---|---|
| Q1 전체 목적·최상위 블록 | partial | yes | ✗ |
| Q2 언어별 처리 위치·관계 | no | yes | ✗ |
| Q3 결정론 장치 위치·동작 | no | yes | ✗ |
| Q4 목적 전환 경계 | partial | yes | ✗ |
| Q5 진입점·내부 의존 구조 | no | yes | ✗ |

**판정: FAIL** — 기준(처치군 우위 ≥3문)에 대해 0문. 대조군이 전 문항 완승.

## 진단 (판정과 분리된 관찰 — 사후 기준 변경 아님)

두 층위가 겹쳐 있고, 각각 독립 증거가 있다:

1. **렌더 기아 (결정론, 코드로 재현 가능)**: judge가 받은 처치군은 **109노드 중 4노드**
   (`render_truncated: true`). 원인 (a) region 라벨이 절대경로(~120자/노드)로 직렬화되어
   4,000자 budget을 잠식, (b) admission 순서가 lex-키 정렬(`"1-17" < "1-2" < "1-361" < "1-4"`)
   이라 import 소영역이 앞자리를 차지. 이 구조에서는 맵 품질과 무관하게 seed(및 judge)는
   맵의 3.6%만 본다. spreadsheet에서는 노드 수가 적어 잠복했던 코드-스케일 신규 결함.
2. **의미 상한 (생산된 요약 자체에서 관찰)**: 노출된 요약들도 대체로 범주 나열
   ("import declarations only", "선언들을 포함합니다 … 구체적 구현 동작은 제공되지
   않았습니다")로, outline 재서술 수준. 특히 **대조군이 O-5 보강(doc/signature 첫 줄)으로
   파일 헤더 주석 전문을 사실상 그대로 노출**하여(작성자가 쓴 목적 서술) 매우 강한
   베이스라인이 됨 — 재귀 요약이 그 위로 올라가지 못했다.

리뷰 gf-F1의 예언("outline 재발명이 전 게이트 green으로 통과")이 G-SEM에 의해 정확히
차단되었다 — 이 게이트가 유일한 의미 게이트라는 설계 판단이 실증됨.

## 처분

- 프로토콜·설계 §1대로 **재설계 스톱**. O-5로 봉투 보강 fallback은 소진 — **추가 봉투 확장
  재제안 금지** 준수. 렌더-계층(경로 직렬화·admission 순서·budget)은 봉투와 별개 축이며
  설계 §8이 "live N=1 실측 후 재조정"으로 예정한 범위 — 재착수 여부는 owner 결정.
- `reconstruct.execution.semantic_map_code`는 **미승격**(워킹트리 활성화를 되돌림 — repo
  settings 불변). G-OFF 보증대로 제품 spreadsheet 경로 무손상.
- 비용 실측: semantic-map dispatch 111회(luna@low synthesize 109 + sol@medium verify 2 —
  census 권위), 전체 파이프라인 model-call 이벤트 288행(탐색 lens·seed·CQ·maturation 등
  비-semantic-map 단계 포함), wall 36분(2,163s).
