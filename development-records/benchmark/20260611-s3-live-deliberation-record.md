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

**live 심의로 `completed` ReviewRecord 도달.** record_status=completed, execution_status=completed, deliberation_status=performed, 참여 3 lens/degraded 0.

**검증 증거의 정확한 범위** (Codex P1 반영): advance의 B 게이트는 심의 seat에 대해 얕은 검증(존재·비공백 + frontier 신뢰 부기)이고, 아래 관찰처럼 advance *이후* seat 2건이 보강되었으므로 "assemble 도달"만으로는 최종 바이트의 deep 검증을 주장할 수 없다. 따라서 **최종 디스크 바이트에 대해 controlled 경로의 deep validator(`validateIssueDeliberationResponseObject`)로 사후 재검증을 수행 — 12/12 통과** (`fixtures/s3-live-deliberation/validate-live-seats.mts`, 결과 `evidence/live-*/seat-revalidation.yaml`; allowedEvidenceRefs 검사는 packet 권위 미번들로 제외 명기). 이 경계는 계약 의무 5(교환 quiescence 후 advance + advance 후 seat 동결)로 승격했다.

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

- **계약 동등성의 정확한 범위** (Codex P2 반영): 단계 구조·게이트·record 필드·stamp 수준의 동등성은 성립. 단, **controlled arm이 per-issue 심의 seat를 0건 실행**(planned=[])했으므로 *심의 계약의 인스턴스 수준 대조는 미달성*이다 — live 심의 seat의 계약 적합성은 인스턴스 대조가 아니라 "동일 deep validator를 최종 바이트가 통과"(§2 사후 재검증)로 입증된다. 인스턴스 대조는 stance 분기를 유도한 controlled 재실행이 후속 후보. 내용 단어 수준 동일은 설계상 비목표(LLM 산출).
- **주의(귀속)**: planned 심의 5 vs 0 차이는 **수송 변수와 무관** — stance는 양 arm 모두 격리 작성이므로 run간 내용 분산이다. controlled arm은 결과적으로 no-planned-issue 경로를 실증했다.

## 4. done-when 판정 (roadmap §4 S3)

1. teammate 팀 live 심의 → completed ReviewRecord: **달성** (1회 실증; 심의 seat 최종 바이트 deep 재검증 12/12)
2. controlled와 아티팩트 계약 동등: **구조·게이트 수준 달성 / 심의 인스턴스 대조 미달성** (controlled arm planned=0 — stance 분기 유도 재실행이 후속 후보)
3. 실험 carve-out — 런타임 diff 0: **달성** (변경 = rank-5 계약 문서 + lexicon note + scripts/ CLI + 테스트뿐)

## 5. 한계·후속

- 각 arm 1 run — PRELIMINARY. `flat+teamlead+peer` 토폴로지는 미실증(설계상 2차; flat+peer 성공으로 전제 충족). 심의 인스턴스 수준 controlled 대조 미달성(stance 분기 유도 재실행 후속).
- live 운영 규율은 계약 의무 5로 승격 완료(교환 quiescence 후 advance + advance 후 seat 동결; 위반 시 deep 사후 재검증 없이는 증거 불성립).
- host 평면의 teammate 도구(TeamCreate/SendMessage)는 실측 가용(스모크 + 본 실험). 설치형 MCP 서버의 round/advance 미노출은 L2 bridge로 해소 확인.
