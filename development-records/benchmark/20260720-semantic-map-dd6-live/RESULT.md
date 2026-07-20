# 실험1 결과 — G-SEM 게이트 **FAIL (T vs B1 = 1/5)** · 단 v1 대비 뚜렷한 개선 · B2 전승 (2026-07-20)

> 사전 등록: [PROTOCOL.md](PROTOCOL.md) (run 실행·렌더 생성 전 커밋 `ce814bc`). 판정 기준·질문·
> 봉인 규칙·유효성 전제는 등록본에서 변경 없음. 코드 상태 = `d662735` (등록대로;
> 이후 커밋 `7a091cf`는 map 스테이지·judge arm 무접촉 경로 — 유효성 영향 없음).

## run 요약

- 대상: `src/core-runtime/code-structure-observer.ts` (414줄, content sha `8f055465…` run 시 단언 통과)
- status **completed**, 2,142s (v1 2,163s와 동급). synthesize **109회** (v1·결정론 프로브와 정확 일치),
  verify **3회**, map_present 1/1, produced_nodes 109. 로그 [live-run.log](live-run.log),
  census [semantic-map-census.yaml](semantic-map-census.yaml), sidecar [semantic-map.yaml](semantic-map.yaml),
  events [runtime-events.ndjson](runtime-events.ndjson).
- **처치 차이 기계 확증 (A/B 규율)**: frontier 봉투 **55/55**에 DD6′ `source_lines` 실림
  (`"source_lines\": {` 55회·`truncated: false` 55회 — census frontier 55와 일치). v1 events에는
  `source_lines` 0회. ※ 최초 스캔에서 0으로 보였던 것은 ndjson 이스케이프(`\"`) 미반영 패턴의
  검색 오류였고, 정밀 패턴으로 정정했다.
- **유효성 전제 충족** ([metrics.json](metrics.json)): admit **51 ≥ 30**, 라인 커버리지
  **100% ≥ 80%** → 시험 유효 (FAIL은 진짜 FAIL).
- **B1 무결성**: 이 세션 관찰로 재생성한 flat outline 본문 102행이 v1
  `control-outline.txt`와 **바이트 동일** (차이는 세션 고유 헤더 주석 2줄 — observation id·
  worktree 경로 — 로, judge 패킷 블록에 미포함). [control-outline.txt](control-outline.txt).

## 평정

- judge = **claude-fable-5, `claude -p` 헤드리스 fresh 세션** — 문맥-무 디렉터리(스크래치패드)
  실행이라 repo CLAUDE.md·MCP·프로젝트 컨텍스트 미로딩. 패킷 stdin 전달(자기완결).
  **도구 사용 0 기계 검증**: 응답 스트림 383 이벤트 중 tool_use 0건, `num_turns: 1`,
  subtype success, 987s. 원본 [judge-response-raw.json](judge-response-raw.json),
  응답 [judge-response.md](judge-response.md), 패킷 [judge-packet.md](judge-packet.md).
- 1차 dispatch 중 로컬 망 단절·재연결 1회 발생 — CLI 내부 재시도로 흡수, 프로세스·응답 정상
  (재발송 불요였음).
- unblind (봉인 순열표 idx 2 = sha 첫 hex `8` mod 6): **A=B1 flat outline · B=T v2 맵 · C=B2 원시 소스**.

### 1차 게이트 채점 (T vs B1 — PASS 기준 ≥3/5)

| 질문 | B1(A) | T(B) | T 우위? | 근거 |
|---|---|---|---|---|
| Q1 전체 목적·영역 | yes | yes | ✗ | 양쪽 완전 분해 — 명백한 우위 없음 |
| Q2 언어별 처리 위치·관계 | partial | **yes** | **✓** | B1은 호출 결선 부재 명시, T는 확장자→로드→디스패치 흐름 연결 |
| Q3 결정론 장치 | yes | yes | ✗ | B1이 주석 계약(재료 전체·자동 회전)을 오히려 더 완전히 인용 |
| Q4 목적 전환 경계 | yes | yes | ✗ | 양쪽 풍부 — 명백한 우위 없음 |
| Q5 진입점·의존 순서 | partial | partial | ✗ | 상보적 결손(B1=이름 있음·순서 없음 / T=순서 골격·이름 없음) — "명백히 더 완전" 아님 |

**판정: FAIL — 1/5.** (Q5를 T 우위로 쳐도 2/5로 FAIL — 판정은 경계 판단에 강건.)
주장 범위(재평정 게이트 5항): **저자-주석-풍부 소형 파일 regime(N=1)에서, 본문 봉투(DD6′)로도
결정론 flat outline을 상회하지 못한다** — 보편적 의미 상한의 확정 증거가 아니라 경계 결정 입력.

### 2차 신호 (held-out 3문)

Q6: 양쪽 yes / Q7·Q8: 양쪽 partial — T 우위 없음 (1차와 정합).

### v1 대비 판독 (진단 — 판정과 분리)

v1은 **0/5 전패**(B1이 전 문항 완승, T answerable: partial 2·no 3)였다. v2에서 T는
**yes 5·partial 3으로 B1(yes 4·partial 4)을 answerable 집합에서 포괄-상회**하고, 지는 문항이
0이며, Q2에서 명백 우위다. **DD6′(frontier 소스 본문) + DD10(기아 해소)은 맵 품질을 실질
개선했다** — 다만 O-5 보강 outline(주석·시그니처 전문 노출)이 이 파일에서 매우 강한
베이스라인이라 게이트(≥3/5)에는 미달.

### 실험3 측정 (T vs B2 — 게이트 아님, 경계 결정 입력)

B2(원시 소스 전문)는 **8문 전부 yes** — 유일하게 완전한 근거 제공(judge 총평). T는 Q5·Q7·Q8
(호출 결선·생성 지점·해시 합성 결선)에서 detail 손실. **fit 파일에서 맵은 결정론/원시 경로를
cover하지 못한다** (핸드오프 §4 실험1의 사전 예상과 일치). ⇒ 경계 제안(§5)의 "파일 ≤ doc
budget → 맵 비활성" 지지 증거. 맵의 후보 가치는 원시 소스가 닿지 못하는 초과 regime(실험2)에만 남는다.

## 처분

- `semantic_map_code` **미승격** (워킹트리 옵트인 되돌림 — repo settings 무변경 유지).
- 실험2(중간 파일 314K, 초과 regime)로 진행 — 맵의 본래 가치 가설이 검증되는 영역.
  실험1의 교훈 반영: 실험2 대조군에는 flat outline이 아니라 **제품 실제 경쟁자**
  (head-투영 원시 소스 + bounded 인벤토리 projection 40K)를 세운다.
