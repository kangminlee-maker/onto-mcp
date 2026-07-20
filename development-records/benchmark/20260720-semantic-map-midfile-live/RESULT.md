# 실험2 결과 — **C1 PASS (5/5) · C2 FAIL (1/5)**: 초과 regime의 가치 원천은 맵이 아니라 결정론 인벤토리 (2026-07-20)

> 사전 등록: [PROTOCOL.md](PROTOCOL.md) (arm 산출물 생성 전 커밋 `8c1fcef`; 질문은 그 전
> 문맥-무 저작 커밋 `6c364a0`). 판정 규칙·조건 구성·유효성 전제는 등록본에서 변경 없음.

## run 요약

- 대상: `src/core-runtime/cli/run-review-prompt-execution.ts` (8,556줄·314,559자, sha
  `d9253eeb…` run 시 단언 통과). 코드 상태 = `63330b2` (등록대로).
- **맵 스테이지 완주**: synthesize **419**(사전 결정론 계산과 정확 일치), verify 21(캡
  1,000 여유), map_present 1/1. 토큰 실측: luna@low 419콜(in 457K/out 39K) + sol@medium
  (후속 포함, in ~745K/out ~12K), 맵 스테이지 wall ~110분.
- **run 자체는 하류 maturation 스테이지에서 fail-loud 중단**: sol 저작
  `maturation-convergence-ledger`가 커버리지 계약 위반(expansion row 2건이 closure row에
  미귀속) → `assertRuntimeValidationValid`(run.ts:1489)가 정직 중단. **측정 무손상** —
  세 arm(①head 소스 ②+인벤토리 ③+맵)은 전부 맵 sidecar·결정론 소스에서 파생되며 맵
  스테이지는 크래시 전 완료. (후속 항목: maturation ledger 실패의 resubmit 후보 — 본
  트랙 밖.)
- **처치 차이 기계 확증**: frontier 봉투 **211개**에 DD6′ `source_lines` 실림
  (untruncated 208 · 12K 캡 절단 3 — 정직 플래그).
- **유효성 전제 충족** ([metrics.json](metrics.json)): admit **51 ≥ 30**, 라인 커버리지
  **100% ≥ 80%** (root-first admission — nodes_total 419 중 51 admit).

## 평정

- judge = claude-fable-5 `claude -p` 헤드리스 fresh 세션, 문맥-무 디렉터리(프로젝트
  컨텍스트·MCP 미로딩; 사용자-전역 CLAUDE.md 일반 규범만 로딩 — 응답 1행의 SpawnGate
  기록은 그 산물로 arm 정보 무관). **도구 사용 0 기계 검증**(tool_use 0·num_turns 1),
  270초. 패킷 282,188자(X 200,000 + Y 39,869 + Z 39,879 + 질문).
  원문 [judge-response.md](judge-response.md)·[raw](judge-response-raw.json).
- 중첩 조건이라 라벨 순열 불가(등록본 공시); 통제 = 질문 선봉인·판정 규칙 선핀·judge
  문맥-무·answerable 자가 표기.

### C1 — ON(③) vs OFF(①): **PASS 5/5**

| 질문 | ① | ③ | ③ 우위? | 근거 |
|---|---|---|---|---|
| Q1 오케스트레이터·진입점 | no | yes | ✓ | ①은 함수·라인·진입점 확정 불가, ③은 전부 확정 |
| Q2 영역 구분·라인 | partial | yes | ✓ | ①은 라인 지목 불가(컷 밖), ③은 전 영역 라인 배정 |
| Q3 frontier 루프 | partial | partial | ✓ | ③이 라우팅 함수 라인 핀(5011-5038 등)+루프 위치 특정 — ①은 이름 수준 |
| Q4 breaker 두 풀 | partial | partial | ✓ | ③이 stance 풀 사용처 라인 확정+귀속 확인 — ①은 라인 없음 |
| Q5 nested 진입점 | partial | partial | ✓ | ③이 공유 진입점 정의 위치 확정(4372-4473 등) — ①은 이름만 |

### C2 — ③ vs ②(+인벤토리): **FAIL 1/5**

| 질문 | ② | ③ | ③ 우위? | judge 원문 근거 |
|---|---|---|---|---|
| Q1 | partial | yes | ✓ | Z 요약이 역할(오케스트레이션·CLI 위임)을 확증해 partial→yes |
| Q2 | yes | yes | ✗ | "답은 ②와 동일하며 신뢰도만 올라갑니다" |
| Q3 | partial | partial | ✗ | "종료 조건은 Z에도 없다" |
| Q4 | partial | partial | ✗ | lens 풀 지점 "여전히 추정" |
| Q5 | partial | partial | ✗ | "lens 풀의 진입 함수명은 어디에도 없다" |

2차(held-out Q6~8)도 동형: Z의 신규 사실 기여 0 (Q6 ② partial=③ partial, Q7 경계 확증만,
Q8 전 조건 no). judge 총평: "Z는 역할 서술로 배정 신뢰도를 올려줄 뿐 새 지점 사실을
추가하지는 못한다."

## 판독 (등록 해석표)

**C1 PASS + C2 FAIL → "결정론 인벤토리로 충분 — 맵 비용(파일당 ~2h LLM) 정당화 불가,
경계는 '초과 = 인벤토리'".**

- 초과 regime에서 ON 구성의 가치는 실재하며 크다(5/5) — 그러나 그 가치의 사실상 전부가
  **무료 결정론 산출물**(bounded code inventory projection, 40K — `d662735`/`7a091cf`로
  이번 세션 착지)에서 나온다. LLM 맵(419콜·~110분·DD6′ 소스 본문 포함)의 한계 기여는
  "배정 신뢰도 상승 + Q1 역할 확증" 1건.
- 실험1(fit regime: 원시 소스 ≫ 맵 ≥ outline)과 합치면 전 regime에서 일관된 상:
  **본문이 필요한 사실은 본문(또는 그 슬라이스)만이 주고, 구조 사실은 결정론 인벤토리가
  주며, LLM 요약은 그 사이에서 신뢰도를 보탤 뿐 새 사실을 만들지 못한다.**
- 한계: N=1 파일/도메인, judge 1회(반복 없음), 중첩 조건 설계 — 이 결론은 이 regime의
  경계 결정 입력이지 보편 정리가 아니다.

## 처분

- `semantic_map_code` **미승격 유지**(워킹트리 옵트인 원복 완료).
- 경계 제안·OD-7(1b LLM 층 처분)은 owner 재결정으로 회부 — 본 결과는 "deterministic
  우선" 방향을 지지하는 입력.
