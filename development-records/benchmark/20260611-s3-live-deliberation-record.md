# S3 live 심의 실험 기록 (L3 실증 + L4 대조)

> 상태: 완료 (PRELIMINARY — 각 arm 1 run). 계약: `.onto/processes/review/live-deliberation-experiment-contract.md` (Experimental).
> 설계: `development-records/design/phase2-s3-live-deliberation-design.md`. 기준 코드: `feat/s3-live-deliberation` (런타임 diff 0).
> evidence: `fixtures/s3-live-deliberation/` (target + 양 arm 세션 아티팩트 영속화).

## 1. 실험 구성

- **fixture**: `notification-batcher.ts` (~50줄, 심은 결함 2: ①주석의 carry-over 약속 vs `pending.clear()` 동작 모순, ②enqueue=`Date.now()` vs flush=주입 `now` 시간 권위 이원화).
- **host**: claude 세션(이 세션)이 B 라운드 드라이버 — L2 bridge CLI(`scripts/review-host-round-cli.ts`)로 prepare/round/advance.
- **live arm** (`live-20260611-bad3651a`): lens 3종(logic·coverage·semantics)을 **지속형 teammate**(TeamCreate)로 생성. round1 lens seat·stance는 격리 작성(계약 동일), **deliberation 유닛에서만 teammate 간 SendMessage 직접 교환(flat+peer)** 후 각자 seat 기록. issue artifacts·resolution·synthesis는 기존 실현(one-shot subagent).
- **controlled arm** (`controlled-20260611-d9760486`): 동일 fixture·동일 settings·fresh 세션. 전 유닛 one-shot subagent, 심의는 packet 임베드 수송(교환 없음). live 컨텍스트 오염 차단(teammate 종료 후 실행).
- settings: `orchestration: host`, direct_call, dummy `OPENAI_API_KEY`(B에서 런타임은 LLM을 dispatch하지 않음 — 전 host_llm 유닛은 host 실행, reduce 2종은 advance 내부 코드. 실측 확인됨).

## 2. L3 결과 — done-when #1

**live 심의로 `completed` ReviewRecord 도달.** record_status=completed, execution_status=completed, deliberation_status=performed, 참여 3 lens/degraded 0. 12개 `deliberation:<issue>:<lens>` live seat 전부 **controlled와 동일한 validator 코드 경로**(advance의 seat 검증 게이트)를 통과 — advance frontier gate는 비신뢰 유닛을 통과시키지 않으므로 assemble 도달 자체가 전 유닛 신뢰 증명이다.

### live 교환의 실질 (관찰)

- **다중 라운드 수렴**: logic이 5유닛 중 4곳에서 입장 이동(issue-002 high→medium 양보 + 방향-중립 root 수용, issue-004 narrow→support, issue-005/007 raise 철회), coverage가 root 재정의 수용(changed=true), semantics가 종결 교환에서 issue-003 low→medium 이동. 견해차 1건(issue-003 medium vs low)은 보존 후 resolution이 판정(medium). **상호 반박→근거 교환→수렴은 controlled의 1-pass packet 임베드로는 구조적으로 불가능한 패턴.**
- **동기화 경계 2건**: 교차 전송된 반박이 advance(검증·신뢰 확정) 후 도착 → teammate가 입장 불변·스키마 재검증 하에 seat를 외과적 보강(2회 관찰: logic의 issue-003/004 보강, semantics의 종료 직전 issue-003 이동). 다운스트림이 디스크를 읽는 단계에서는 반영되나, **검증 시점의 seat와 디스크 seat가 달라질 수 있다** → live 운영 규율 필요: **advance 전 교환 완전 정착(quiescence) + advance 후 seat freeze**.
- **재시도 내성**: 실행기 1개가 네트워크 단절(ECONNRESET)로 사망 → seat 단위 멱등 재실행으로 무손실 복구(controlled arm issue-ledger).

## 3. L4 대조 — done-when #2

| 차원 | live (flat+peer) | controlled | 판정 |
|---|---|---|---|
| record_status / execution_status | completed / completed | completed / completed | **동등** |
| deliberation_status | performed | performed | **동등** |
| 참여 lens / degraded | 3종 / 0 | 3종 / 0 | **동등** |
| seat 스키마·validator | 전 유닛 advance 게이트 통과 | 전 유닛 advance 게이트 통과 | **동등** (동일 코드 경로) |
| orchestration stamp | host (prepare 불변 각인) | host | **동등** |
| 단계 구조 | lens→ledger→graph→issue→stance→plan→delib→resolution→framing→synthesis→assemble | 동일 | **동등** |
| findings | 13 | 13 | 동등 (우연) |
| issues / deps | 8 / 1 | 12 / 4 | 내용 분산 |
| planned 심의 / 심의 seat | 5 issues / 12 seats | 0 / 0 (stance 36/36 만장일치) | 내용 분산 |
| material / non-material | 8 / 0 | 7 / 5 | 내용 분산 |

- **계약 동등성 성립**: 동일 seat 스키마·동일 검증 통과·record 신뢰 통과·동일 단계 구조·동일 stamp. 내용 단어 수준 동일은 설계상 비목표(LLM 산출).
- **주의(귀속)**: planned 심의 5 vs 0 차이는 **수송 변수와 무관** — stance는 양 arm 모두 격리 작성이므로 run간 내용 분산이다. controlled arm은 결과적으로 no-planned-issue 경로를 실증했고, live 심의 seat의 계약 동등성은 "동일 validator 통과" 사실로 입증된다.

## 4. done-when 판정 (roadmap §4 S3)

1. teammate 팀 live 심의 → completed ReviewRecord: **달성** (1회 실증)
2. controlled와 아티팩트 계약 동등: **달성** (위 표; 내용 분산은 비목표 명기)
3. 실험 carve-out — 런타임 diff 0: **달성** (변경 = rank-5 계약 문서 + lexicon note + scripts/ CLI + 테스트뿐)

## 5. 한계·후속

- 각 arm 1 run — PRELIMINARY. `flat+teamlead+peer` 토폴로지는 미실증(설계상 2차; flat+peer 성공으로 전제 충족).
- live 운영 규율 후보(계약 갱신 후보): 교환 quiescence 확인 후 advance, advance 후 seat freeze. 현 계약 §3.3(교환=수송)은 유지.
- host 평면의 teammate 도구(TeamCreate/SendMessage)는 실측 가용(스모크 + 본 실험). 설치형 MCP 서버의 round/advance 미노출은 L2 bridge로 해소 확인.
