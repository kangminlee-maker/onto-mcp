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

## 5. 2차 — flat+teamlead+peer 실증 + 심의 인스턴스 대조 (PRELIMINARY)

### 5.1 flat+teamlead+peer (세션 `teamlead-20260611-24c15f0c`)

teamlead teammate가 교환을 리드(개시 재촉·probe 1회·quiescence 선언)하고 **resolution seat를 직접 작성** → `completed` ReviewRecord. **계약 의무 5 위반 0 실증**: 4개 심의 seat가 quiescence 선언 후 작성(06:22), advance(06:24) 이후 무수정(mtime 불변) — 1차 flat+peer의 post-gate 보강 2건과 대비, teamlead의 quiescence 집행이 경계를 구조적으로 차단했다.

**런타임 발견 2건** (이 run이 실측):
1. **B 계약 공백 — failed runtime reduce의 host 복구 표면 부재**: issue-stance-matrix reduce가 issue-ledger의 무효 병합(duplicates 관계를 병합 증거로 사용)을 거부하며 failed 기록 → frontier는 failed reduce를 재시도하지 않고, continue 경로는 `assertRuntimeOrchestratedSession`으로 host 세션을 거부 → **영구 halt**. 워크어라운드(기록·백업 후 failed 행 제거 + 빈 executed advance로 fixed-point 재유도)로 복구. 런타임 후속 후보: 입력 변경 시 failed reduce 재시도 또는 host 가시 재시도 표면.
2. **상류 교정의 하류 연쇄는 host 수동 조율**: 교정된 issue-ledger에 대해 기존 stance seat 3건이 stale — 엔진은 신뢰 확정 유닛의 재보고를 거부하므로(정상 fail-closed) host가 재실행을 조율(stale packet의 ledger 스냅숏 대신 live ledger를 내용 권위로 지정). deep 검증은 reduce 시점에 일어나는 비대칭(advance 게이트는 얕음)이 원인 — PR #33 P1과 동일 뿌리.

### 5.2 심의 인스턴스 대조 (세션 `controlled2-20260611-732cebe9`)

controlled arm 재설계: 1차 controlled(one-shot stance)가 2/2 만장일치로 planned=0에 그친 반면, live arm들은 2/2 분기 — **stance 분기는 수송이 아니라 executor 지속성(round-1 컨텍스트 보유)과 상관**(4-run 근거). 이에 stance까지는 지속형 teammate(무교환), 심의 유닛만 packet-임베드 수송의 fresh one-shot으로 실행해 continuity를 live와 맞추고 수송만 변수로 격리 → planned 2 이슈(6 유닛) 확보.

**인스턴스 대조 결과** (`validate-contrast-seats.mts`, 결과 `contrast-seat-validation.yaml`):

| arm | seats | 동일 deep validator | changed=true | 분쟁 처리 |
|---|---|---|---|---|
| live flat+peer | 12 | 12/12 | 6/12 (50%) | 패널 수렴(상호 설득) |
| live flat+teamlead+peer | 4 | 4/4 | 2/4 (50%) | 패널 수렴(teamlead 리드) |
| controlled packet-임베드 | 6 | 6/6 | 1/6 (17%) | 1방향 양보만; 상호 설득형 분쟁(issue-002 severity 2:1)은 미해소 보존 → resolution 판정 |

- **계약 동등(인스턴스 수준) 성립**: 3 arm 22 seat 전부 동일 deep validator 통과 — 1차의 "인스턴스 대조 미달성"이 해소됐다.
- **행동 특성화**: live 수송은 양방향 이동(상호 반박→수렴), controlled 수송은 임베드 읽기 기반 1방향 양보까지만 — 분쟁 해소 위치가 패널(live) vs resolution(controlled)로 갈린다. 내용 분산·소표본(PRELIMINARY) 유의.
- 정직 비고: controlled arm의 lens-logic이 형식 확인용으로 이전 세션 산출물을 참조(자진 신고) — round-1 독립성 회색지대 1건. ECONNRESET 사망 2건은 seat 단위 멱등 재실행으로 복구.

### 5.3 운영 재현성 발견

- claude CLI 인증의 격리-환경 3요소: `~/.claude`(디렉토리) + `~/.claude.json`(로그인 상태 파일) + `~/Library/Keychains`(OAuth 토큰 — **HOME 기반 해석**, 실측).
- worker 탐지는 `CLAUDE_CONFIG_DIR`을 따름 — claude-1/claude-2 세션 전환이 벤치마크 worker 해소에 영향(마커 `.oauth-token`은 config dir별). 재현 시 명시 고정 필요.

## 6. 한계·후속

- 각 arm 1 run — PRELIMINARY. ~~teamlead 토폴로지 미실증~~ → §5.1에서 실증 완료. ~~인스턴스 대조 미달성~~ → §5.2에서 해소(22/22 동일 validator).
- live 운영 규율은 계약 의무 5로 승격 완료 — §5.1이 위반 0 준수를 실증(1차 run의 위반 2건과 대비).
- host 평면의 teammate 도구(TeamCreate/SendMessage)는 실측 가용(스모크 + 본 실험). 설치형 MCP 서버의 round/advance 미노출은 L2 bridge로 해소 확인.
- 런타임 후속 후보(§5.1 발견): host 세션의 failed runtime reduce 재시도 표면(입력 변경 감지 재시도 또는 명시 재시도 호출) — 현재는 문서화된 워크어라운드만 존재.
