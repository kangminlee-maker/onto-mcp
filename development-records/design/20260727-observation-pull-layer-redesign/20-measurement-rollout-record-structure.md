# 측정 — rollout 레코드 구조와 위상 커버리지 (2026-07-28, 단계 1 착수 전)

단계 1(rollout 리더)을 짜기 전에 §1-1이 주장한 구조를 **디스크의 실 아티팩트로 재확인**했다.
결과는 두 가지다: 기계적 사실은 전부 성립했고, **설계 서술 두 곳이 틀렸다.**

## 0. 대상

`benchmark/tool-result-truncation/*/worker-stderr.txt`의 `session id:` 14개 → 전부
`~/.codex/sessions/2026/07/27/rollout-*.jsonl`로 **14/14 존재**. 이 문서의 모든 수치는 그 14개에서
직접 센 것이다.

| 항목 | 값 |
|---|---|
| `session_meta.cli_version` | `0.145.0` (14개 전부 동일) |
| `session_meta.cwd` | `/Users/kangmin/Documents/onto-mcp` (전부 동일) |
| `event_msg`/`mcp_tool_call_end` (전송분) | **28** |
| `response_item`/`custom_tool_call_output` (수신분) | **34** |

## 1. 정정 ① — 이 측정은 **실 façade가 아니라 합성 probe 서버**로 했다

14개 세션의 MCP 호출 28건은 **전부** `invocation = {server:"probe", tool:"probe_fetch"}`다.
`onto_observation_read`는 **한 건도 없다.**

§1-1은 "본 세션 실측"이라고만 적어 마치 우리 디스패치를 측정한 것처럼 읽힌다. 실제로는 절단
거동을 재현하기 위한 **probe MCP 서버**였다.

- **여전히 성립하는 것**: 봉투 구조(레코드 종류·필드·id 공간·절단 배너)는 codex 쪽 코드 경로라
  서버가 누구든 같다. 세션 결속 재료(`session id` stderr 배너, `session_meta`)도 서버 무관.
- **성립하지 않는 것**: "9지점 생존/소실" 같은 **페이로드 수준 수치**는 probe의 텍스트에 대한
  것이지 관찰 페이지에 대한 것이 아니다. 실 façade에서 재측정하기 전까지 페이지 단위 수치로
  인용하면 안 된다.

## 2. 정정 ② — "전부 exec당 MCP 호출 1회 위상"은 **틀렸다**

§9-M4와 §6-5는 확보된 실행이 전부 단일 호출 위상이라 다중 호출 파서를 반증할 수 없다고 적었다.
실제로 세어 보면:

| exec 하나가 부른 `tools.mcp__` 횟수 | exec 수 |
|---|---|
| 0회 | 15 |
| 1회 | 17 |
| **4회** | **2** |

`exec` 호출 총 34건 중 **2건이 한 exec 안에서 MCP를 4번 부른다.** 즉 §9-M4가 요구한 위상 중
**최소 3개가 이미 실 아티팩트에 있다**:

- **다중 순차 호출 + 전부 한 출력에 렌더링** — 세션 `019fa332-ae9e-…`:
  `r0..r3` 4회 fetch 후 `text(JSON.stringify({r0,r1,r2,r3}))` → 수신분 1건, 40,103자에서 절단.
  **리뷰어 F1의 시퀀스가 그대로 실측돼 있다** — 전송분 4 : 수신분 1이므로 서수 짝짓기는 여기서
  즉시 깨진다.
- **다중 호출 + 페이로드가 나중 exec에서 도달** — 세션 `019fa334-7926-…`:
  `r0..r3` 4회 fetch 후 `store("probe2", r2); text("done")` → 그 exec의 수신분은 **4자(`done`)**.
  그런데 **몇 턴 뒤 별개의 exec가 `load("probe2"); text(...)`** 를 실행해 32,137자를 출력한다.
  즉 **4건 중 1건이 자기를 만든 호출과 무관한 나중 시점에 컨텍스트에 들어가고, 3건은 끝내 안
  들어간다.**
  > **정정(2026-07-28, 단계 1 리더 테스트가 반박)**: 이 절의 최초 판본은 "모델 컨텍스트에는 안
  > 들어갔다 · `delivered=0`은 참"이라고 적었다. **틀렸다** — `store`/`load`를 못 봤다. 오히려 이
  > 위상은 §9-F1을 **더 강하게 지지한다**: 전송분과 "그 출력"을 짝짓는 규칙도, 호출한 exec의
  > 출력만 보는 규칙도 이 런을 **양방향으로** 틀린다. 전 수신분을 훑는 형태만 맞는다.
- **호출 0회 exec** — 15건.

아직 없는 위상: **동시 호출**(`Promise.all`), **다중 `text()`**, **겹치는 외부 exec**.

## 3. 레코드 모양 (단계 1 리더가 의존하는 사실)

### 전송분 `event_msg` / `mcp_tool_call_end`

```
{ type, call_id: "exec-<uuid>", invocation: {server, tool, arguments},
  duration: {secs, nanos},
  result: { Ok: { content: [{type:"text", text: <서버가 보낸 정본>}], isError: false } } }
```

### 수신분 `response_item` / `custom_tool_call_output`

```
{ type, call_id: "call_<...>", output: [ {type:"input_text", text}, {type:"input_text", text} ] }
```

- `output`은 **문자열이 아니라 배열**이고, 34건 전부 **원소 2개**였다.
- `[0]`은 exec 배너: `"Script completed\nWall time 0.0 seconds\nOutput:\n"` (47자).
- `[1]`이 실제 렌더링 결과. 절단됐다면 그 **안에** 경고가 들어간다:
  `"Warning: truncated output (original token count: 42576)\nTotal output lines: 1\n\n{...`

→ §9-F4의 "실제 출력 페이로드 안에서만 찾는다"는 **`output[*].text`를 대상으로 한다**는 뜻으로
확정된다. 봉투 전체 문자열 검색이 아니다.

### id 공간이 다르다 (§8-4 확인)

전송분 `call_id`는 `exec-<uuid>`, 수신분 `call_id`는 `call_<...>`로 **다른 공간**이다. 둘을 직접
짝지을 키가 없다 — §9-F1의 "짝짓기를 없앤다"가 우회가 아니라 **유일한 선택**임이 확인된다.

## 4. 절단 천장 — §1-1의 40,490은 부정확

| 구분 | n | 길이 |
|---|---|---|
| 절단된 수신분(`output` 두 원소 합) | 8 | **40,149 ~ 40,150자** |
| 절단 안 된 수신분 | 26 | 51 ~ 32,151자 |

절단분이 40,149/40,150에 몰려 있고 비절단 최대치가 32,151로 그 아래다 — 천장이 실재한다는 §1-1의
결론은 유지된다. 다만 **수치는 ≈40,150**(배너 47자 포함)이고 렌더링 본문만 보면 ≈40,103이다.
§1-1의 "약 40,490자"는 이 코퍼스에서 재현되지 않는다.

## 5. 단계 1에 미치는 영향

1. **위상 fixture를 새로 만들 필요가 줄었다.** 3개 위상이 실 아티팩트에 있으므로 단계 1의 고정본은
   이 14개에서 뽑는다. 남은 3개 위상(동시·다중 `text()`·겹친 exec)만 미확보로 계상한다.
2. **양방향 대응(§11-L1)을 단순 개수 비교로 짜면 안 된다.** 이 코퍼스에서 전송 28 : 수신 34이고,
   차이는 MCP를 안 부른 exec가 수신분을 만들기 때문이다. "우리 서버에서 온 결과"로 좁힌 뒤에
   비교해야 한다.
3. **실 façade 재측정이 남는다.** 페이지 단위 수치와 `invocation.server` 값은 probe로 대체할 수
   없다. 단계 3·4의 라이브 N=1에서 함께 확보한다.

## 6. 추가 측정 (2026-07-28, 라이브 검증 착수 직전) — `--ephemeral`이 rollout을 없앤다

단계 4의 라이브 N=1을 준비하다 프로덕션 인자를 다시 읽었다. **설계 §8-5의 "현재 `--ephemeral`
미사용"은 틀렸다** — `llm-caller.ts`의 codex args에 그 플래그가 있다.

통제군을 포함한 최소 probe(각 1회 디스패치, `gpt-5.6-luna`/low):

| 인자 | stderr `session id` | `~/.codex`의 rollout |
|---|---|---|
| `--ephemeral` (= 프로덕션) | 찍힘 `019fa8aa-0cc4-…` | **없음** |
| 없음 (= 측정 probe) | 찍힘 `019fa8aa-434c-…` | **있음** |

즉 **session id가 있다고 전사본이 있는 것이 아니다.** 배너만 보고 결속을 시도하면 항상
`rollout_not_found`로 떨어진다 — 그리고 그것이 지금까지 이 트랙이 쌓아온 모든 코퍼스가
`--ephemeral` 없이 돌아간 probe였던 이유이기도 하다.

**처방(구현됨)**: `LlmCallConfig.persist_worker_transcript`. `source_delivery_reconciliation`이
ON일 때만 저자가 요청하고, 그때만 codex args에서 `--ephemeral`이 빠진다. OFF는 byte-identical.

**대가**: 워커 호출마다 세션 파일이 `CODEX_HOME`에 남는다 — `--ephemeral`이 막고 있던 바로 그것.
이 머신엔 이미 55,000개가 넘는 rollout이 있다. 상시 ON 승격을 논할 때 함께 판단할 항목이다.

**부수 확인**: 그렇게 남은 rollout의 `session_meta`는 리더가 기대하는 모양 그대로였다
(`session_id` · `cwd` · `cli_version: "0.145.0"`).

## 7. 라이브 N=1 (2026-07-28) — 실 façade에서 전 구간 통과

`scripts/observation-read-pull-live.mts`를 재조정까지 확장해 실 codex 워커 1회로 돌렸다.
증거: `benchmark/observation-read-pull-live/2026-07-28T12-24-46-105Z/`.

| 항목 | 결과 |
|---|---|
| 워커 배너 | `session id` **정확히 1개** (`019fa8af-6551-…`) |
| rollout | `--ephemeral` 제거 후 **남았다** — `~/.codex/sessions/2026/07/28/rollout-…-019fa8af-….jsonl` |
| 전송분 `invocation` | **`{server:"onto_observation", tool:"onto_observation_read"}`** — 실 값 첫 확인 |
| 재조정 | **verified** |
| `delivered` | `obs_9f291d6235fdb41c` · `obs_eb90f83378bd57a0` (서빙된 것과 동일) |
| attestation | 방출 1건 15,177자, `verbatim_delivered` (1/1) |
| **재조정 소요** | **4 ms** |

**§13-D1이 요구한 수치가 이것이다.** owner는 "명시적 복구 행위를 만들지 않고 문서화한다"를
고르면서 "창 폭이 예상을 크게 벗어나면 재개한다"를 조건으로 달았다. 재조정이 복구 불가 창에
더하는 시간은 **4 ms**다 — 파일 로케이트·읽기·파싱·대조·영속 전부 포함. 결정은 유지된다.

**§1-1의 미해결 항목 하나가 닫혔다**: 지금까지 모든 코퍼스가 합성 `probe` 서버였고 실 façade의
`invocation.server` 값은 미측정이었다. 이제 실측됐고, 코드가 스코프하는 상수와 일치한다.

**대조군** — 같은 전사본·같은 emissions에 서버 이름만 옛 철자로 바꿔 재생:

```
server=onto_observation         -> verified, delivered=2
server=observation_read_facade  -> unverifiable (recorded_emission_without_sent_record)
```

즉 이 라이브 통과는 **이름에 민감하다**. 커밋 `2c3400f`에서 고친 추측이 살아 있었다면
이 실행은 통과하지 못했다.

**아직 미확보**: `Promise.all` 동시 호출 · 다중 `text()` · 겹치는 외부 exec. 이번 런은 워커가
도구를 1회 호출한 위상이다.
