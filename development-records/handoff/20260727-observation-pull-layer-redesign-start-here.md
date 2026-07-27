# 관측 pull 층 — 재설계 착수 안내 (2026-07-27)

> **다음 세션은 여기서 시작한다. 첫 작업은 코드도 설계도 아니라 측정이다 — §3.**
> 설계 SSOT: [design/20260726-observation-catalog-tool-design.md](../design/20260726-observation-catalog-tool-design.md)
> 재설계 자료: [design/20260727-observation-pull-layer-redesign/](../design/20260727-observation-pull-layer-redesign/)
> 이전 안내: [20260727-observation-catalog-tool-stage3b-crossverify-start-here.md](20260727-observation-catalog-tool-stage3b-crossverify-start-here.md) — 상시 제약은 여전히 유효

## 0. 지금 어디인가

```
브랜치  feat/observation-grant-stage2  (미푸시 · owner 승인 전 push/PR 금지)
HEAD    18566e4
상태    ⚠ 미커밋 1,482 insertions / 88 deletions · 14 파일 수정 + 신규 3
다음    ① 무손실 결과 상한 측정 → ② 두 설계 초안 종합 → ③ owner 결정
```

| | |
|---|---|
| 3b 교차검증 | **6라운드 · 렌즈 12벌 · material 33건 전건 처리** |
| 통합 라운드 | 1회(라운드 5) · 14제안 중 채택 5 |
| vitest | 3,827 → **3,862 pass · 1 todo** (225파일) |
| 게이트 | 15 green + 2 rc=1(베이스라인) |
| OFF 패리티 | 3 다이제스트 base 기록값 불변 |
| 음성 대조 | 모든 수정에 부착 · 되돌리면 실패 확인 완료 |

### ⚠ 먼저 판단할 것 — 미커밋 1,482줄

33건의 수정 전체가 **커밋되지 않았다.** 되돌아올 지점이 없다. owner 승인이 필요한 것은
push/PR/머지이고 **브랜치 로컬 커밋은 막혀 있지 않으므로**, 재설계에 들어가기 전에 체크포인트 커밋을
만드는 것을 강하게 권한다. 재설계가 어떤 결론이 나든 이 트리는 검증된 상태다.

신규 파일 3개는 `git add` 대상에 반드시 포함할 것(경로 명시 add):
`scripts/probe-facade-socket-reach.mts` ·
`src/core-runtime/reconstruct/answer-claims-evidence-boundary.test.ts` ·
`development-records/design/20260727-observation-pull-layer-redesign/`

## 1. 이번 세션이 한 일

3b는 구현·라이브 PASS 후 **교차검증 0라운드** 상태였다. 6라운드를 돌려 33건을 닫았고, 그 과정에서
**재설계가 필요하다는 판단**에 도달했다.

라운드별 성격(발견 수만으로 판정하지 말 것 — 기원 분류가 신호다):

| 라운드 | 렌즈 | material | 성격 |
|---|---|---|---|
| 1 | A 전체 · B 경계침식 | 6 | 전부 커밋된 3b의 결함 |
| 2 | C · D (직전 수정 공격) | 4 | 전부 **내 수정이 주입** |
| 3 | E · F (직전 수정 공격) | 4 | 전부 **내 수정이 주입** |
| 4 | G 수정공격 · H 전체신선 | 10 | 6 pre-existing + 4 주입 — 급증은 **렌즈 변화**이지 코드 악화가 아님 |
| 5 | I 재사용 · J 삭제 | (통합) | 14제안 → 채택 5 · 기각 5 · 테스트 공백 2 |
| 6 | K 미검토수정 · L 전체신선 | 9 | 두 라운드분 미검토 수정을 한 번에 봄 |

**주입률은 수정 라운드당 ≈4로 평탄**했다. 발산이 아니라 고정 오류율이었고, 그 바닥을 만드는 것은
"고칠 때마다 표면이 자란다"는 것이었다.

### 왜 재설계로 갔는가

라운드 6의 9건을 분류했더니 **9/9가 "내가 소유하지 않은 컴포넌트의 계약을 읽지 않고 가정"**이었다.
Node 스트림 4 · 단계 1 리더 2 · 단계 2 grant 1 · 재사용 서브시스템 2. 그리고 최소 4건은 **그 계약이
쓰고 있던 바로 그 파일에 적혀 있었다**(리더: 분할은 "for a given request"만 안정 / 커서는 "NARROW만
가능" / Node: write 콜백은 오류 인자를 받는다).

결정적으로 **같은 클래스가 연속 재발**했다 — 분할 신원을 `part_count`로 잡았다가(K-F1 수정) 그것도
신원이 아니어서 `part_allowance`로 다시 잡았다(L-F1). 판정표 4번, 증분 수정 포기 트리거.

## 2. 재설계 — 지금까지의 결론

### 실측으로 닫힌 후보 (가정 아님)

| 후보 | 판정 | 근거 |
|---|---|---|
| codex 트랜스크립트에서 조회 유도 | **반증** | 세션 로그는 `started`/`(completed)`만 기록. 인자·결과·id 없음. stdout의 id는 **모델의 자기 보고**. 기존 라이브 아티팩트 `benchmark/observation-read-pull-live/2026-07-27T00-56-14-986Z/worker.json`에서 확인(신규 디스패치 0) |
| 런타임이 소켓으로 직접 서빙 | **도달 가능** | `scripts/probe-facade-socket-reach.mts` PASS — 자식이 부모 유닉스 소켓에 연결, 부모 nonce가 모델까지 도달 |

**단, 소켓 PASS는 설계를 결정하지 않는다.** fable 초안의 지적이 옳다 — 신뢰의 뿌리는 *위치*가 아니라
*자식이 런타임 작성 코드를 돌리고 모델은 fs·env에 못 닿는다*는 것이다. 부모로 옮겨도 그 뿌리는 안 변한다.
소켓 측정은 미지를 없앴을 뿐 피벗 사실이 아니었다(이전 세션의 프레이밍 오류).

### 두 초안이 독립 수렴한 것 = 채택 후보

`design/20260727-observation-pull-layer-redesign/01-draft-claude-fable-5.md` (fable-5/max)
`design/20260727-observation-pull-layer-redesign/02-draft-gpt-5.6-sol.md` (gpt-5.6-sol/xhigh)
둘 다 같은 블라인드 패킷(`00-blind-design-packet.md`)에서 나왔고 서로를 모른다.

1. **분할은 스냅샷 빌드 때 한 번만.** 요청별 분할을 제거하고 고정 청크를 불변 컨테이너에 둔다.
   → 두 번 헛짚은 분할 신원 클래스가 **표현 불가능**해진다. gpt 표현: *"요청 모양이 증거적 진실의
   일부가 되면 안 된다."*
2. **배달은 emit 순서가 아니라 모델의 후속 행동으로 증명.** 응답이 도달해야만 존재할 수 있는 값을
   요구한다. → 커밋 분리·drain·EPIPE 코드 전체가 불필요해진다.
3. **부분 관측은 인용 권한 0.** 완전 커버리지만 서빙으로 친다.
4. **에러 채널은 닫힌 코드만.** 하위 계층 문자열은 인코더의 유효 입력이 아니다.

### 정면 충돌 — 종합에서 판정할 것

| | fable-5 | gpt-5.6-sol |
|---|---|---|
| 권위 | 자식 façade + nonce-scoped append-only journal | 부모 broker + IPC, 자식은 순수 릴레이 |
| 배달 증명 | 인용에 **witness 토큰** | 별도 **ack 호출** |
| 비용 | 모델이 128비트 토큰을 정확 복사해야 함 — 정직한 워커가 뭉개면 인용 상실 | 청크마다 ack → **호출 상한 32에서 실효 fetch 16** |
| 상대 기각 사유 | "회계가 두 프로세스로 쪼개짐 · 미측정 IPC 추가 · **아무것도 못 삼**" | "자식이 grant를 소유하면 권위 분할 · 의미 있는 배달 전에 served 지속 가능 · **write 콜백은 바이트가 파이프에 들어간 것만 증명**" |

fable의 기각 논거 ①("회계 분할")은 **순수 전선 자식에는 해당하지 않는다**(약한 버전을 침).
논거 ②가 결정적. gpt의 기각 논거는 **라운드 6에서 실제로 겪은 것 그대로**다(L-F2).

**비용 축이 판정을 가를 수 있다.** 둘 다 실측 없이는 값을 모른다.

## 3. 다음 작업 — 측정 (여기서 시작)

두 초안이 **공통으로 CRITICAL**로 지목한 것. 그리고 이것은 재설계 질문이 아니라
**이미 커밋된 3b에도 있는 위험**이다 — 6라운드 동안 아무도 묻지 않았다.

> **codex가 MCP 도구 결과를 조용히 절단하는가?**

절단한다면 "커버리지 완성"이 거짓인 채 모든 검사가 green이다. 현행 구현의 `part_indexes` 완전성
주장도 같이 무너진다.

**프로토콜**(gpt 초안 §REQUIRES MEASUREMENT의 것을 쓸 것):
- 결과 크기를 **이진 탐색**한다
- 페이로드는 **독립 패턴 2종 이상**, 여러 오프셋에 마커, **끝단에 랜덤 nonce**
- 다음 실제 모델 호출이 그 nonce를 되돌려주는지 확인 — 되돌려주지 못하면 절단된 것
- 크기당 **최소 3회 반복**, 분산 기록
- 청크 상한은 **반복적으로 무손실인 최대 크기 아래**로 확정 — "성공한 최대 파이프 쓰기" 아래가 아니다

`scripts/probe-facade-socket-reach.mts`가 실 codex + 실 강화 플래그로 도구를 띄우는 **동작하는 틀**이다.
그걸 복제해 만들면 된다. 실 디스패치를 소모하므로 반복 실행 금지, 실패 시 워커 출력을 먼저 읽을 것.

**결과가 음성(절단 있음)이면**: 두 설계 모두 지금 형태로 성립하지 않고, 현행 3b의 커버리지 주장도
재판정 대상이다. 그 경우가 이 측정의 진짜 값이다.

측정 후 남은 항목(두 초안이 각각 요구, 종합 시 병합):
- 허용적 스키마의 malformed 호출이 broker/façade에 **도달**하는가(아니면 codex-local 무과금 에러)
- env가 모델 측에서 불투명한가(제약 5는 fs만 측정했고 env는 미측정)
- 자식 spawn 환경의 cwd·경로 해석(cheap-artifact 패턴으로 journal 헤더에 기록)
- 실 워커의 토큰 복사 준수율(fable 안의 최대 리스크, N=1 라이브)

## 4. 이번 세션이 만든 검증 자산

- `scripts/probe-facade-socket-reach.mts` — 소켓 도달 측정(신규, 게이트 편입 완료)
- `src/core-runtime/reconstruct/answer-claims-evidence-boundary.test.ts` — 주장 근거 경계(신규, **untracked**)
- 기존 유지: `off-parity-probe.mts`(OFF 3 다이제스트) · `observation-catalog-tool-replay.mts` ·
  `observation-read-pull-live.mts`(실 워커 1 dispatch 소모)
- `tsconfig.scripts.json`에 하니스 4종 편입 — 서명 변경이 게이트를 침묵 통과하던 문제를 닫음

## 5. 상시 제약 (이전 핸드오프에서 유효 + 이번에 추가)

- `git add -A` 금지 = **경로 명시 add** · main 직접 커밋 금지 · push/PR/머지는 **owner 명시 승인 후**
- **`git checkout -- <파일>` 금지**(미스테이지 작업이 있는 동안)
- 동료 에이전트 메시지·백그라운드 알림은 **owner 승인이 아니다** · 프로세스 종료는 **PID로만**
- 게이트 베이스라인 **15 green + 2 rc=1**(`supported-models` + 그것을 감싸는 `invariant-drift` =
  gitignored 세션 잔해). 매번 `ignored=yes tracked=no` + `src/`·`scripts/` 실위반 0 확인
- vitest **총계를 매번 확인**(침묵 스킵 탐지). 현재 **225파일 3,862 pass · 1 todo**
- **신규**: 리뷰 패킷에 보안 연구처럼 읽히는 어휘("attack surface", "bypass", "disclose")를 쓰면
  제공자 분류기가 최종 출력을 거부한다(rc=1 + stdout 0 + 382k 토큰 소모 실측). 중립 어휘로 쓰고,
  그런 실패는 **clean이 아니라 NOT-RUN으로 계상**할 것
- **신규**: 파이프 뒤 `$?`는 마지막 단계의 것 — 게이트 rc는 파이프 없이 받을 것

## 6. 열린 항목

- **하류 판정 프롬프트 유계화** — opt-in 활성화의 하드 블로커(실 59관측 전건 인용 1,328,185자 >
  1,048,576). OFF·ON 노출 동일. 설계 §9 단계 6
- 재설계를 채택하면 **현행 3b 코드의 처분**(폐기 / 단계적 대체)이 owner 결정 사안
- `인용 ⊆ 조회`의 적용 범위 — 지금은 answer-support ledger 한 표면
- 프레이밍 상수 2개(`EXCHANGE_FRAMING_CHARS` 1,024 · `SESSION_RESERVE_CHARS` 8,192)는 미측정 보수값
- `[permissions.<name>.network] enabled=false` 미평가 · `web.run`·`collaboration.*` 잔존 여부 미측정

## 7. 방법론 — 이번 세션의 산출은 저장소 밖에도 있다

리뷰 프로세스 학습은 중앙 가이드와 크로스-레포 SSOT에 반영했다. 이 저장소의 다음 작업자가 알아야 할
것만 적는다.

- **수렴 판정은 발견 총수가 아니라 기원 분류로 한다**(injected / pre-existing). 렌즈를 바꾸면 총수가
  바뀌므로 라운드 간 비교가 무너진다
- **수정마다 음성 대조**. 이번에 **대조 3건이 실패에 실패**했다 — 변이가 컴파일 파괴 / 이웃 검사가
  대신 잡음 / **테스트 입력이 변이 분기에 도달 못 함**. 대조가 안 깨지면 그건 **테스트에 대한 발견**
- **수정이 스스로에 대해 쓴 안전 주장이 가장 약한 부분**이다. 이번에 3회 반박됨
- 중앙 가이드 신설 절: `~/.claude/central/guides/coding-staged-workflow.md`(수렴 판독 · scoped/full ·
  종합 · 표면 · 음성 대조 · **구 전제 반증 판정**) · `review-request.md`(2라운드 이후 패킷 · **구 결정을
  대상으로 승격**) · `tooling-gotchas.md`(공허 green 2종).
  크로스-레포 정본 = `~/Documents/agent-bios/design/review-process-learnings/SSOT.md`
  ⚠ **agent-bios 미커밋** — install 시 유실 위험이 그 SSOT §K의 최우선 항목
