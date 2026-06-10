# Live Deliberation Experiment Contract

> 상태: **Experimental** (Phase 2 · roadmap S3 — claude 전용 실험 평면)
> 목적: deliberation 유닛의 **동료 관점 수송**을 살아있는 lens teammate 간 SendMessage 교환으로 실현하는 host-side 실험 계약을 고정한다. 런타임 변경 0 — live 심의는 기존 B 라운드 계약(`host-orchestration-contract.md`) 위의 host 실현 자유다.
> Authority: rank-1 `.onto/authority/core-lexicon.yaml` → `ReviewOrchestrationOwner`(신규 개념 없음 — host의 unit 실행 실현 자유 재사용). rank-5 형제: `host-orchestration-contract.md` §7(controlled 심의), `nesting-batch-worker-contract.md`(S2).
> 기준 문서: `development-records/design/phase2-s3-live-deliberation-design.md`

---

## 1. 비재오픈 경계

31c25f7이 닫은 것은 "**런타임이** agent-team 오케스트레이션(coordinator state machine·TeamCreate transport)을 소유"하는 모델이다. 본 실험은 이를 재오픈하지 않는다:

- **onto 런타임 diff 0.** TeamCreate/SendMessage는 host 평면의 도구이며 런타임 코드·설정·MCP 표면 어디에도 등장하지 않는다.
- live 심의는 B 계약의 기존 문장("host는 deliberation 유닛을 다른 라운드 유닛과 동일하게 실행한다")의 한 실현일 뿐이다. "별도 라이브 채널 없음"(§7)은 *런타임이 제공하지 않는다*는 뜻이며, host의 실현 자유를 막지 않는다.

## 2. 실현 구조

```
host = claude 세션 (B 라운드 드라이버: prepare → round → 실행 → advance → assemble)
  lens 단계: lens별 teammate 생성(지속형) — 각자 lens unit seat 기록
  issue artifacts: 기존 실현(host가 unit executor subprocess 또는 직접 실행) — 본 계약 비관심사
  deliberation 유닛 ready 시(live 분기):
    flat+peer          — 이슈별 관련 lens teammate들이 SendMessage로 stance를 교환(자기 입장 재평가)한 뒤
                         각자 자기 deliberation unit seat(issue-deliberation-response)를 기록
    flat+teamlead+peer — 추가로 teamlead teammate가 교환을 리드하고 resolution seat를 기록
```

### controlled와의 유일한 차이

| | controlled (§7) | live (본 계약) |
|---|---|---|
| 동료 관점 수송 | packet에 동료 seat 내용 임베드(런타임 재구성) | 살아있는 teammate 간 SendMessage 직접 교환 |
| 진실 위치 | canonical seat | canonical seat (**동일**) |
| seat 스키마·검증·gate·frontier·record | onto 소유 | onto 소유 (**동일**) |

## 3. 의무

1. **seat 계약 불변** — live teammate가 기록하는 seat는 controlled와 동일한 스키마·동일한 validator(`validateIssueDeliberationResponseObject` 등)를 통과해야 한다. 교환 내용이 아니라 seat가 진실이다.
2. **packet = 계약 권위** — live에서도 unit packet(스키마·allowed_evidence_refs·boundary)을 계약 권위로 사용한다. teammate는 packet을 읽고 응답 스키마를 지키되, 동료 관점만 packet 임베드 대신 live 교환에서 얻는다.
3. **교환 = 수송** — SendMessage 교환은 컨텍스트 수송일 뿐 아티팩트가 아니다. 검증·ledger·trust 경로에 진입하지 않는다. 단, host가 실험 기록으로 transcript를 세션 외부에 보관할 수 있다.
4. **orchestration stamp 준수** — 세션은 prepare 시 `orchestration: host`로 불변 각인되며, live/controlled 분기는 stamp를 바꾸지 않는다(실현 선택일 뿐).

## 4. 토폴로지 2종

| 토폴로지 | 참여 | resolution seat |
|---|---|---|
| `flat+peer` | 이슈별 관련 lens teammate 전원 (대칭) | 없음 — 각 lens response seat만 |
| `flat+teamlead+peer` | peer + teamlead teammate(교환 리드) | teamlead가 resolution seat 기록 |

1차 실증은 `flat+peer`. teamlead 변형은 성공 시 2차.

## 5. done-when (roadmap §4 S3)

1. teammate 팀이 live 심의로 `completed` ReviewRecord 도달 (실 claude host 1회 실증)
2. controlled run과 아티팩트 **계약** 동등 — 동일 seat 스키마·검증 통과·record 신뢰 통과·참여 구조 동일. 내용 단어 수준 동일은 비목표(LLM 산출).
3. 실험 carve-out 유지 — 런타임 diff 0.

## 6. 비범위

런타임/엔진/MCP 표면 변경, 새 settings 키, codex live 심의(claude 전용), 교환 transcript의 아티팩트화.
