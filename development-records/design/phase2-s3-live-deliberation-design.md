# S3 — Agent-teams live 심의 설계 (실험 carve-out)

> 상태: **실행 완료** (L1~L5, flat+peer 실증 — PRELIMINARY; teamlead 변형 미실증). 결과: `development-records/benchmark/20260611-s3-live-deliberation-record.md`, 계약: `.onto/processes/review/live-deliberation-experiment-contract.md`. 기준 코드: `main 120a4e3`에서 설계, `feat/s3-live-deliberation`에서 실행.
> 상위: `phase2-host-orchestration-roadmap.md` §4 Stage 3. claude 전용 실험 평면.
> **비재오픈 경계(핵심)**: 31c25f7이 닫은 것은 "런타임이 agent-team 오케스트레이션(coordinator state machine·TeamCreate transport)을 소유"하는 모델이다. S3는 이를 재오픈하지 않는다 — **onto 런타임 변경 0**, live 심의는 기존 B 라운드 계약 위의 **host-side 실현**이다.

## 1. 정의와 전제 (실측)

- **현 계약**(host-orchestration §7): deliberation 유닛도 DAG 위의 ready unit — host가 어떻게 실행하든 seat 계약만 지키면 된다("별도 라이브 채널 없음"은 *런타임이 제공하지 않는다*는 뜻이지 host의 실현 자유를 막지 않는다).
- **host fabric 능력**(roadmap §5 실측): teammate(TeamCreate)는 지속형 + SendMessage 수신 + subagent 생성 가능. subagent는 leaf·one-shot.
- **controlled vs live의 유일한 차이**: 동료 관점의 수송 방식. controlled = packet에 동료 seat 내용을 임베드(런타임이 재구성). live = 살아있는 lens teammate들이 SendMessage로 직접 교환. **양쪽 모두 진실은 canonical seat** — 검증·gate·frontier·record 계약 동일.

## 2. 실현 구조

```
host = claude 세션 (라운드 드라이버, B 계약: prepare → round → advance → assemble)
  lens 단계: lens별 teammate 생성(지속형) — 각자 unit executor 호출 또는 직접 작성으로 lens seat 기록
  … (issue artifacts: 기존 실현 — subprocess/nested 그대로) …
  deliberation 유닛 ready 시(live 분기):
    flat+peer    — 이슈별로 관련 lens teammate들이 SendMessage 교환(자기 stance 재평가) 후
                   각자 자기 deliberation unit seat(issue-deliberation-response YAML)를 기록
    flat+teamlead+peer — 추가로 teamlead teammate가 교환을 리드하고 resolution seat를 기록
  advance: onto가 seat 검증·gate — 기존 그대로
```

- **신뢰 모델**: SendMessage 교환은 컨텍스트 수송일 뿐. seat 검증(`validateIssueDeliberationResponseObject` 등 기존 validator)·ledger·trust가 그대로 진실을 소유. 교환 내용 자체는 아티팩트가 아니다(단, 실험 기록으로 host가 transcript를 세션 외부에 보관 가능).
- **packet과의 관계**: live에서도 unit packet(스키마·allowed_evidence_refs·boundary)은 **계약 권위로 사용** — teammate는 packet을 읽고 응답 스키마를 지키되, 동료 관점은 packet 임베드 대신 live 교환에서 얻는다.

## 3. done-when (roadmap §4)

1. teammate 팀이 live 심의로 `completed` ReviewRecord 도달 (실 claude host 1회 실증)
2. **controlled와 결과 동등성**: 동일 입력의 controlled run과 대조 — 아티팩트 *계약* 동등(동일 seat 스키마·검증 통과·record 신뢰 통과·참여 구조 동일). 내용 단어 수준 동일은 비목표(LLM 산출).
3. 실험 carve-out 유지: 런타임 diff 0, 계약은 실험 표시된 rank-5 문서로만.

## 4. 단계

| Step | 내용 | 게이트 |
|---|---|---|
| **L1** | **rank-5 실험 계약** `.onto/processes/review/live-deliberation-experiment-contract.md`: §2 실현 구조·의무(seat 계약 불변·packet=계약 권위·교환=수송)·토폴로지 2종·비재오픈 경계 명문화. lexicon은 기존 `ReviewOrchestrationOwner`/심의 개념 재사용(신규 개념 0; note 1줄) | 계약↔런타임 대조(변경 0 확인) |
| **L2** | **host bridge + 플레이북**: round/advance를 host(claude 세션)가 Bash로 부를 수 있는 얇은 CLI(`scripts/review-host-round-cli.ts` — core-api reviewRound/reviewAdvance 호출만; 런타임 무변경) + host 수행 절차 문서(팀 생성→라운드→live 교환→seat→advance) | CLI 결정론 테스트(mock 세션 round/advance) |
| **L3** | **live 실험 실행**: 이 세션(claude)이 직접 host가 되어 TeamCreate/SendMessage로 §2를 1회 실증 — 소형 fixture, core-axis 3 lens, flat+peer 우선(teamlead 변형은 성공 시 2차) | `completed` ReviewRecord + record 신뢰 통과 |
| **L4** | **동등성 대조**: 동일 fixture controlled run과 구조 대조(스키마·검증·참여·record 필드) + 차이 기록 | 대조 보고서 |
| **L5** | **기록·마무리**: 실험 기록 문서, roadmap S3 갱신, 메모리 | 전체 검증(코드 diff 0이므로 vitest 무회귀 자명) |

## 5. 리스크

- **teammate 도구 가용성**: host 세션의 TeamCreate/SendMessage 실측 필요(L3 첫 단계에서 스모크). 불가 시 실험을 "host 절차 문서 + bridge"까지로 축소하고 사용자 확인.
- **교환 품질**: live 교환이 controlled의 packet 임베드보다 동료 관점 누락 위험 — seat validator가 구조를 강제하므로 fail-loud; 내용 비교는 L4에서 관찰 기록.
- **installed MCP 서버 구버전**: round/advance 미노출 → L2 bridge가 해소(repo core-api 직접 호출).

## 6. 비범위

- 런타임/엔진/MCP 표면 변경, 새 settings, codex live 심의(claude 전용), 교환 transcript의 아티팩트화.
