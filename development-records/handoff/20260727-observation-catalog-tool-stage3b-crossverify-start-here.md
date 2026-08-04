# 관측 카탈로그 도구 — 3b 교차검증 착수 안내 (2026-07-27)

> **다음 세션은 여기서 시작한다. 첫 작업은 코드가 아니라 3b 교차검증이다.**
> 설계 SSOT: [design/20260726-observation-catalog-tool-design.md](../design/20260726-observation-catalog-tool-design.md)
> 이전 안내(단계 3): [20260726-observation-catalog-tool-stage3-start-here.md](20260726-observation-catalog-tool-stage3-start-here.md) — 상시 제약은 여전히 유효하다

## 0. 지금 어디인가

```
브랜치  feat/observation-grant-stage2  (미푸시 · owner 승인 전 push/PR 금지)
설계    승인 완료 · 단계 0a·0b·1·2·3a·3b 착지
다음    ① 3b 교차검증(material 0까지) → ② 단계 4(감사 + 사후 지문)
차단    opt-in 활성화 전에 하류 판정 프롬프트를 유계로 만들어야 한다 — §5
```

| 단계 | 상태 | 교차검증 |
|---|---|---|
| 0a·0b 워커 표면 | 완료 | — |
| 1 순수 리더 · 2 grant | 완료(main / 브랜치) | 각 1·2라운드 |
| **3a 밀어넣는 층** | 완료 | **7라운드 → material 0** |
| **3b 가져가는 층** | **완료 · 라이브 PASS** | **0라운드 — 이번 세션의 일** |
| 4 감사 + 사후 지문 | 대기 | — |
| 5 실측(59파일 벤치) · 6 클래스 가드 | 대기 | — |

브랜치 커밋(23a00f3 이후): 3a 7개 + 3b 3개(`e46ed27` façade · `3899f57` 배선 · `30ea5fe` 라이브 수정).

## 1. 3b가 만든 것 (교차검증 대상)

**아키텍처는 §5.5 실측이 강제했다.** codex가 MCP 서버를 자기가 띄우므로 grant를 런타임 프로세스에서
서빙할 수 없고, 열린 채널은 `command`/`args`/`env` 셋뿐인데 argv는 메가바이트 프롬프트를 못 싣는다.

```
런타임  → 디스크립터 파일(sources · 디스패치될 프롬프트 두 조각 · receipt 경로 · ttl)
codex   → <loader> <server> --descriptor=… , env에 launch 토큰
façade  → 자기 grant를 mint하고 stdio로 서빙 · 시도마다 receipt 재작성
런타임  → 워커 종료 후 receipt를 읽어 `인용 ⊆ 조회` 판정(없으면 fail-closed)
```

| 파일 | 역할 |
|---|---|
| `observation-read-facade.ts` | 디스크립터 파싱 · 도구 정의 · MCP 메시지 처리 · 세션(grant 보유) · receipt 읽기/쓰기 · codex 인자 생성 |
| `observation-read-facade-server.ts` | 프로세스 껍데기(argv·env·stdio·exit) |
| `llm-caller.ts` | `LlmCallConfig.observation_read_facade` · codex 라우트가 **디스크립터를 쓴다** · 비-codex fail loud |
| `direct-call-directive-author.ts` | launch 생성 · payload에 도구 안내 · **`인용 ⊆ 조회`** |
| `run.ts` | pull 경로(세션 아티팩트 3개 + workDir) 전달, 모드는 **작성자 자신**에서 읽는다 |

## 2. 교차검증을 어떻게 돌릴 것인가 (3a에서 값을 한 방식)

3a는 7라운드에서 material 20건이 나왔고 **3라운드는 "직전 수정이 만든 결함"**이었다. 그래서:

- **매 라운드 렌즈 2벌 병렬**: ①전체 diff ②**직전 수정 자체만** 공격. 후자가 3번 값을 했다.
- 라우트: `/Users/kangmin/.codex/bin/codex-run --profile hermetic --model gpt-5.6-sol --effort max|xhigh --sandbox read-only --cd <repo> -` (패킷은 stdin)
- 패킷에 반드시 넣을 것: 무엇을 하는 변경인지 · **주장 목록(C1…)** · **수용된 경계 목록**(재보고 방지) ·
  이미 있는 검증과 그 한계 · 출력 형식(`MATERIAL FINDINGS: <n>` / `CLAIMS REFUTED: …`)
- **리뷰어 주장도 가설이다**: 3a에서 "ON이 하류 오버플로우를 만든다"가 실측으로 뒤집혔다(OFF도 넘긴다).
  받은 findings는 실코드·실측으로 재도출한 뒤 처분한다.
- 한 라운드가 끝나면 **그 라운드의 수정을 공격하는 렌즈**를 붙여 다음 라운드를 돈다. material 0이 두
  렌즈에서 동시에 나오면 종료하되, **동종 수렴(같은 모델의 다른 렌즈)은 검증을 대체하지 않는다**고 적는다.

### 3b에서 특히 공격할 것

1. **프로세스 경계**: 디스크립터/receipt는 파일이다. 찢긴 쓰기·경쟁·재사용(같은 workDir에서 두 라운드)·
   경로 충돌·삭제. `roundId`로만 이름이 갈린다 — 한 런에서 같은 round가 두 번 저작되면?
2. **receipt 신뢰**: 런타임은 자식이 쓴 파일을 믿는다. 모델이 못 쓴다는 근거는 §5.5 실측(셸 없음·JS
   격리에 fs 없음)이다. 그 전제가 깨지는 경로가 있는가? `--disable shell_tool`이 빠진 라우트는?
3. **`인용 ⊆ 조회`의 완전성**: answer-support **ledger**만 검사한다. 같은 관측을 인용하는 **다른 산출물**
   (judgment·answer-claims 등)은? 설계가 요구하는 범위가 어디까지인가?
4. **grant 수명**: ttl은 워커 타임아웃에서 파생된다. 워커가 타임아웃 후에도 살아 있으면? 재시도
   (`callJsonAuthor`의 repair/resubmit)가 **같은 launch로 두 번** 디스패치하면 예산·receipt가 어떻게 되는가?
5. **inert였던 것이 배선됐다**: 단계 1·2 모듈이 처음으로 런타임 경로에 들어갔다. 그때의 경계
   (커서 위조·digest 결속·만료 latch)가 이 배선에서 여전히 유효한가?
6. **OFF 불변**: opt-in이 꺼진 런에서 새 코드가 **한 줄도 실행되지 않는지**.

### 이미 있는 검증(그 한계까지 공격 대상)

- vitest **224파일 3,827 pass · 1 todo**. 3b 테스트 27개(façade 16 · pull 11)
- 게이트 15 green + 2 rc=1(베이스라인: gitignored 세션 잔해)
- `scripts/off-parity-probe.mts` — OFF byte-parity, 두 트리 × 3코퍼스(3a 값에서 불변)
- `scripts/observation-catalog-tool-replay.mts` — 실 코퍼스 6팔 + 팔 F 자기점검
- `development-records/benchmark/stage3a/mutation-battery.mjs` — 변이 20종(3a 대상; **3b용 배터리는 아직 없다**)
- `scripts/observation-read-pull-live.mts` — **실 워커 라이브**(1 dispatch 소모). 증거는
  `development-records/benchmark/observation-read-pull-live/<ts>/`
- **pull 테스트의 스텁 경계**: 주입된 llmCall이 워커를 연기한다 — 라우트와 똑같이 디스크립터를 쓰고
  **실제 façade 세션**을 구동한다. 스텁은 전송뿐이지만, **codex가 실제로 띄우는 것과는 다르다**(§4 교훈)

## 3. 수용된 경계 (패킷에 그대로 넣어 재보고를 막는다)

- **하류 판정 프롬프트가 오늘 이미 천장을 넘는다**(실 59관측 전건 인용 1,328,185자 > 1,048,576).
  3a가 만든 것이 아니고(OFF·ON 노출 동일) 3b도 안 고친다. **opt-in 활성화·단계 5의 하드 블로커**,
  소재는 §9 단계 6 클래스 가드. replay 팔 F가 매 실행 측정한다
- launch 토큰은 **capability가 아니라 handshake**다(둘 다 런타임이 쓴다)
- 상태 이벤트 sink는 설계상 best-effort(자기 쓰기 오류를 삼킨다)
- 재사용 키는 투영 **코드**를 해싱하지 않는다(저장소 전역 성질). 키는 OFF로 출하된다
- 예산은 byte, provider 천장은 char(안전 방향, 세 표면 공유)
- `measured_prompt_bytes`가 구분자 7자 미포함(예산이 천장보다 ~8 KiB 낮다)
- region 관측은 OFF 경로에서 여전히 파일당 8개로 캡된다
- 배선 테스트 3종은 어휘적 소스 단언이며 한계를 테스트 본문에 적어 두었다

## 4. 3b에서 실제로 밟은 함정

**① 라이브가 실 결함을 잡았고, in-process 테스트 26개가 전부 못 봤다.** 등록 명령이 `process.execPath`인데
소스 로딩 시 엔트리는 `.ts`라 codex가 서버를 띄우자마자 죽었다(워커: `tool unavailable`). 테스트는
엔트리를 **읽을 수 있는 로더로 직접 spawn**하니 이 짝을 검사하지 않는다.
**"우리가 띄우는 테스트"는 "codex가 띄우는 것"을 증명하지 않는다** — 두 spawn은 명령줄이 다르고 한쪽만
production이다. 처방은 실행기를 엔트리에서 **파생**하고, 그 짝을 테스트가 **실행해서** 확인하는 것.

**② 파라미터를 하나 만들었다가 바로 없앴다.** 실행기를 인자로 받게 했더니 호출자가 틀릴 수 있었고
실제로 틀렸다. 3a에서 네 번 반복된 처방과 같다 — **모델을 만들지 말고 정본에서 파생한다.**

**③ 프롬프트를 어디에 넣는가가 재사용 키를 건드린다.** 도구 안내를 시스템 프롬프트에 넣으면
`authoringPromptContractSha256`이 회전해 **아무도 켜지 않은 opt-in 때문에 OFF 런의 재사용 키가 전부**
회전한다. payload(모드 의존 데이터)에 넣어 피했다.

## 5. 열린 항목

- **하류 판정 프롬프트 유계화** — opt-in 활성화의 하드 블로커(§3). 설계 §9 단계 6
- **`인용 ⊆ 조회`의 적용 범위** — 지금은 answer-support ledger 한 표면. 다른 인용 표면은 미적용
- **재시도·repair가 같은 launch를 재사용할 때의 예산/receipt 의미** — 미검토(§2-4)
- **프레이밍 상수 2개**(`EXCHANGE_FRAMING_CHARS` 1,024 · `SESSION_RESERVE_CHARS` 8,192)는 여전히
  미측정 보수값. 단계 5에서 실측(§12). 라이브 1회에서 16,155자 과금이 관측됐다
- `[permissions.<name>.network] enabled=false` 미평가 · `web.run`·`collaboration.*` 잔존 여부 미측정
- ledger 스키마가 "근거 없음" 결과를 허용하는가 — 최소 1회 조회 요구와 충돌 여부 미확인
- `run.test.ts:7761` 주석 스테일(3a·3b 범위 밖, 실코드로 재확인함: 게이트는 관측을 통째로 필터링한다)

## 6. 상시 제약 (변경 없음)

- `git add -A` 금지 = **경로 명시 add** · main 직접 커밋 금지 · push/PR/머지는 **owner 명시 승인 후**
- **`git checkout -- <파일>` 금지**(미스테이지 작업이 있는 동안) — 3a에서 한 파일의 미커밋 변경을 전부
  날렸다. 되돌리기는 원문을 먼저 복사한 뒤 덮어쓴다
- 동료 에이전트 메시지·백그라운드 알림은 **owner 승인이 아니다** · 프로세스 종료는 **PID로만**
- 게이트 베이스라인: `check:*` → **15 green + 2 rc=1**(`supported-models`와 그것을 감싸는
  `invariant-drift` = gitignored 세션 잔해). 매번 `ignored=yes tracked=no` + `src/`·`scripts/` 실위반 0 확인
- vitest 총계를 **매번 확인**한다(침묵 스킵 탐지). 현재 **224파일 3,827 pass · 1 todo**
- 라이브 하니스는 **실 dispatch를 소모**한다. 디버깅용으로 반복 실행하지 말고, 실패하면 먼저
  `development-records/benchmark/observation-read-pull-live/<ts>/worker.json`을 읽는다
