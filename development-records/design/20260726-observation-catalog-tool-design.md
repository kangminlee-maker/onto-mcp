# 관측 카탈로그 도구 — 설계 (2026-07-26)

> 상태: **승인 완료**(핸드오프 `20260726-observation-catalog-tool-stage1-start-here.md` 기록) ·
> **단계 0a·0b·1·2·3a 착지.** 다음 = 단계 3b(가져가는 층 배선).
> 계기: owner 지시 "입력하지 않고 직접 가져가게 할 수는 없나?" (2026-07-26)
> 방법: 블라인드 패킷 1벌 → **이종 계열 독립 설계 2벌**(Codex gpt-5.6-sol/max hermetic ·
> Claude opus, 저장소 열람 허용) → 주 세션이 실코드로 재검증 후 종합. 초안 원문은
> `development-records/design/drafts/20260726-observation-catalog-tool/`.
> 선행 착지: PR #265(총량 백스톱 `c0a9eac`) · PR #266(워커 read-only `1420364`)

## §0. 한 줄

**고르기 위한 정보는 밀어넣고, 고른 뒤의 상세는 가져가게 한다.** 단, "가져갔다"가
런타임 영수증으로 증명되지 않으면 인용을 거부한다.

## §1. 문제 — 측정된 것 (교차검증으로 2건 정정됨)

### 1.1 스케일 축은 "개수"가 아니라 **"개수 × 상세"** — 정정

초안은 "개수에 비례하는 표면"이라고 적었으나 **첫 적용 표면(answer-support ledger)은 개수가
이미 캡돼 있다**(실코드 확인):

```
ANSWER_SUPPORT_SOURCE_OBSERVATION_LIMIT = 64      authoring-prompt-payloads.ts:1847
CODE_STRUCTURE_INVENTORY_PROMPT_CHAR_BUDGET = 40_000
  → 최악 64 × 40,000 = 2,560,000자 = 한계(1,048,576)의 2.44배
  → 실제 관측된 초과 1,361,154자가 이 구간에 든다
```

즉 이 표면에서 움직이는 축은 **관측당 상세**다. 처방이 "개수를 줄인다"가 아니라
**"상세를 유계로 만들고, 필요한 것만 가져오게 한다"** 여야 하는 이유다.

### 1.2 같은 표면에 크기와 별개인 **breadth 결함**이 있다 — 신규 발견

`promptObservationIds = [...prioritized, ...supplemental].slice(0, 64)` (`:497`).

- **prioritized** 초과 → 이미 **fail-loud**(`:525` 오버플로 단언, 런 크래시)
- **supplemental** 초과 → **조용히 잘린다.** 누락 추적 필드가 없다
  (`omittedPrioritizedObservationIds`는 있으나 supplemental 대응물은 없음)

크기를 줄이는 것만으로는 이 결함이 안 없어진다. 도구 방식은 프롬프트가 항해 층만 지므로
**캡 자체를 들어낼 수 있다** — 크기가 아니라 **커버리지** 이득이다.

### 1.3 오버플로우는 여전히 클래스 결함이다

authoring 호출 23곳 중 16곳이 입력 규모에 반응하고, 크기 가드가 붙은 표면은 2개뿐이다.
벤치가 그 패턴을 실측했다(07-23 dispatch 2 즉사 → 07-26 dispatch 74에서 **세 번째 표면** 사망).

PR #265의 총량 백스톱은 **조용한 죽음만** 없앴다. 크기는 줄이지 않는다.
**도구는 채택한 표면만 유계로 만든다. 백스톱은 나머지 전부에 대해 계속 필요하다** — 둘 다 필요하다.

### 1.4 큰 것은 한 필드다

```
관측 59건 · 2,634 KB (JSON)
  structural_data                2,611 KB   99%
  observation_id+source_ref+summary  13 KB   0.5%
```

## §2. 실측으로 확인한 전제

| 전제 | 결과 |
|---|---|
| 워커에서 onto MCP 도구 도달 | **도달** (실호출로 실데이터 수신) |
| read-only 샌드박스에서도 도달 | **도달** — 아래 §5.1의 근거이기도 하다 |
| 좌석/과금 변경 필요 | **불필요.** OAuth 그대로 |
| 관측 아티팩트가 불변인가 | **아니다 — 제자리 변경되고 런 중 자란다**(`source-admission-selection-stage.ts:586·716` 덮어쓰기, run.ts에서 `sourceObservations` 3회 재대입) → **스냅샷 고정은 공짜가 아니라 필수 작업** |

## §3. 출처 추적 — 강화된다 (owner 제약 C1)

기존 경로(모델이 `requested_source_refs` 요청 → 런타임 승인 → 관측 생성 → id 부여 → 인용,
미해석 id는 산출물 거부)를 **한 줄도 바꾸지 않는다.** 그 위에 한 단계를 **더한다**:

```
인용된 관측 id  ⊆  런타임 영수증이 증명한 조회 id  ⊆  고정된 스냅샷 id
```

**불변식 OBS-1** 도구는 관측을 생성·변형하지 않는다(mint 0).
**불변식 OBS-2** 도구는 세션 스냅샷 밖을 읽지 않는다.
**불변식 OBS-3** 페이지·커서는 전송 투영일 뿐 증거 실체가 아니며 인용될 수 없다.

### 3.1 소비 권한 게이트 — 신규 (owner 결정, 2026-07-26)

**단계 1 배선 직전에 발견된 우회 경로.** 밀어넣는 경로는 이미 fail-closed 게이트를 지난다:
`sourceObservationsForPrompt`(`authoring-prompt-payloads.ts:2477`)는 관측의 `prompt_context`
소스-안전성 행이 `visibility_tier: "consumption_allowed"`일 때만 프롬프트에 넣고, 다른 tier거나
**행이 없으면 뺀다**. `run.ts:1781`이 그 투영을 만들고 프롬프트 표면 약 25곳 전부가 그것만 쓴다.

그런데 단계 1의 `fixObservationSnapshot(artifactText)`는 **디스크의 원본 아티팩트**를 읽는다.
그대로 배선하면 pull 경로가 push가 막는 관측을 내주는 **기존 권한의 두 번째 문**이 된다.

**불변식 OBS-4** 도구가 서빙할 수 있는 관측은 `prompt_context` 소비가 승인된 것뿐이며, 규칙은
push 게이트와 **정확히 같다**(더 좁지도 넓지도 않다 — 카탈로그에 보이는 id를 못 가져오는 불일치를
만들지 않기 위해).

강제 방식은 검증이 아니라 **구성**이다: 스냅샷 생성자 `fixObservationSnapshot(text, ledger)`가 원장을
필수 인자로 받고, 리더는 스냅샷 외에 아무것도 읽지 않는다. 따라서 **ungated 스냅샷이라는 값이 타입
체계에 존재하지 않고**, 승인 안 된 id 요청은 OBS-2에 의해 **없는 id와 동일한** `unknown_observation_id`가
된다. 이후 배선 단계가 잊을 수 없는 이유는 규약이 아니라 **우회를 작성할 수 없기 때문**이다.

> 첫 구현은 게이트를 grant 층에 두고 "이 모듈이 유일한 호출자"에 기댔다. 교차검증이 export된
> `fixObservationSnapshot(text)`와 `readObservationPage`를 짝지어 **모든 타입을 만족시키면서** 승인 안 된
> 관측을 서빙해 보였다(§9.2 CLAIM 1). 규약과 제약의 차이가 정확히 여기다.

owner 판단(2026-07-26): 단계 3 배선 때 처리하는 대안 대신 **단계 2에 접는다** — "다음에 잘 하자"는
약속이 아니라 잘못하는 방법이 없는 구성이기 때문. 착지 기록은 §9.2.

체결의 부수 효과: 게이트 결정이 스냅샷 digest에 실리므로, 런 중 원장이 승인을 **철회하거나 추가하면**
digest가 회전해 진행 중 커서가 조용히 재범위화되지 않고 거부된다(§8의 "도중 변경" 행과 같은 처방).

## §4. 도구 계약

**이름 `onto_observation_read`** — repo의 MCP 명명 관례(`onto_*`)를 따른다.
**호스트에 광고하지 않는다.** 워커 전용 façade에만 노출된다(광고 표면과 호출 표면을 분리).

### 4.1 입력 — 모델이 표현할 수 없는 것으로 안전을 만든다

```
{ observation_ids: string[1..16] }   |   { cursor: <opaque> }
```

**세션 식별자·경로·글롭·질의·상세 등급·바이트 상한이 입력에 없다.** C3(일반 파일 리더가
되지 않는다)를 *검증*으로 만족시키는 게 아니라 **표현 불가능하게** 만든다 — 역량 경계 원칙.

세션은 런타임이 워커를 띄울 때 **연결 설정/환경에 구워 넣고**, 종료 시 회수한다.
스냅샷은 기동 시 고정하고 digest를 만든다(§2의 가변성 때문에 필수). 커서는 그 digest에 묶인다.

### 4.2 예산 — 새 상한을 만들지 않는다

가져가는 양은 **이미 있는 `CODEX_PROMPT_INPUT_CHAR_LIMIT`의 잔여**로 잡는다
(`llm-caller.ts`, PR #265). 밀어넣은 것과 가져간 것이 **한 천장을 나눠 쓴다.**

```
fetch 총예산 = 한계 − 초기 프롬프트 실측 − 프레이밍 예비
하위 상한: 응답 1건당 상한 · dispatch당 호출 횟수 상한
```

누적 예산이 **반드시 필요하다**: 도구 응답은 워커 대화에 쌓이므로, 응답당 상한만 두면
오버플로우가 codex 내부로 옮겨갈 뿐이다(Codex 초안 지적).

초과 시 **조용한 절단 없이** 결정론적 페이지 + 계속 커서를 주고, 예산 소진은 명시 오류로 끝낸다.
관측 하나가 한 페이지보다 클 수 있으므로 **분할 전송**이 필요하다.

### 4.2.1 누적 예산 vs 커서-예산 결속 — 결정 (단계 2, 2026-07-26)

단계 1이 남긴 충돌: 커서는 분할을 계산한 예산에 결속되므로(예산이 바뀌면 `part_count`의 의미가 바뀐다),
호출마다 줄어드는 예산을 **페이지 크기로** 쓰면 모든 이어받기가 `cursor_malformed`로 거부된다.

**채택**: 페이지 예산은 grant 수명 동안 **상수**로 두고, 줄어드는 것은 크기가 아니라 **admission**으로
표현한다 — "한 페이지를 더 낼 여유가 남았는가". 소진은 §4.2대로 명시 오류.

```
page_char_budget        = 상수 (기본 65,536)
total_fetch_char_budget = CODEX_PROMPT_INPUT_CHAR_LIMIT − 실측 프롬프트 − 세션 예비
admission               = 잔여 ≥ page_char_budget + 교환 프레이밍   (최악치 기준)
과금                    = 실제 직렬 길이 + 교환 프레이밍 (실패 호출도 과금)
```

**기각**: 커서에 실린 예산 필드를 런타임이 신뢰하는 방식. 커서가 천장보다 큰 예산을 주장할 수 있게 되어
§9.1의 "커서는 권한이 아니라 좌표"를 깨뜨린다. 예산은 모델이 주소지정할 수 없는 런타임 상태에만 산다.

**최악치 admission이 상수 예산을 규약이 아니라 불변식으로 만든다**: `잔여 ≥ page + framing`을 통과한
뒤에는 `min(page, 잔여)`가 항상 `page`이므로 "잔여로 축소" 변형은 **관측 가능한 차이가 없다**(변이 M6
미탐지의 이유이며, 그 대안을 실제로 막는 가드는 admission 쪽 M5·M13이다 — §9.2).

**정정: 호출 횟수 상한은 총량에서 도출하지 않는다.** `floor(total / perCall)`로 도출하면
`max_calls × perCall ≤ total`이 되어 **문자 가드가 절대 먼저 발화하지 못한다** — 설계가 요구한 두 상한
중 하나가 도달 불가 코드가 된다(구현 중 변이 검증으로 실측). 상수(`32`)로 두면 두 상한이 서로 다른
것을 재고 둘 다 산다: 문자는 천장 점유량을, 호출 수는 왕복 횟수를(작은 페이지 병리 루프는 문자 가드가
못 본다).

**정직한 귀결**: 이 도구는 천장을 **재배분**할 뿐 늘리지 않는다. 353KB 프롬프트에서 총예산은 약 690KB이고
실측 최대 관측 하나가 780,114자이므로 **그 관측 하나를 전부 가져오는 것은 불가능하다**. 값은 크기가
아니라 "모델이 무엇으로 그 자리를 채울지 고른다" + §1.2의 64 캡 제거(커버리지)다.

## §5. 워커 도구 표면 — 설계와 분리해 먼저 (Stage 0)

### 5.1 지금 실재하는 노출

**read-only 샌드박스는 MCP 도구를 덮지 않는다.** 샌드박스는 codex 자신의 셸·패치만 통제하고,
MCP 서버는 별도 프로세스다. 근거는 우리 프로브 자체다 — `-s read-only`를 붙인 상태에서
**onto MCP 도구를 호출해 결과를 받았다.**

그리고 워커는 운영자의 MCP 목록을 통째로 상속한다:

- `day1-mcp` (enabled) — Google Sheets/Docs/Drive **쓰기** 도구
- `onto` (enabled) — `onto_reconstruct` 포함 → **재귀 위험**

즉 PR #266은 파일시스템 셸·패치 경로를 닫았지만, **MCP 경유 쓰기 권한은 그대로다.**

### 5.2 처방 — 실측으로 개정됨 (2026-07-26)

두 초안 모두 "상속 설정을 대체하고 도구 목록이 허용 목록과 **정확히 일치**하는지 대조"를
요구했다. **실측 결과 정확 일치는 달성 불가능하다.** 세 경로를 대조군과 함께 시험했다:

| 시도 | 결과 |
|---|---|
| A) 오버라이드 없음 (대조군) | `codex_apps`, `onto` |
| B) `-c mcp_servers={}` | `codex_apps`, `onto` — **설정 오버라이드로는 비워지지 않는다** |
| C) `--ignore-user-config` | `codex_apps` — onto/day1-mcp **제거됨** |
| D) hermetic `CODEX_HOME`(auth만) | `codex_apps` — onto/day1-mcp **제거됨** |

**닫히는 것**: 사용자 설정 서버 전부 — §5.1이 지목한 실제 위험(`day1-mcp`의 Workspace 쓰기,
`onto_reconstruct` 재귀)은 제거 가능하다.
**안 닫히는 것**: `codex_apps`는 provider 쪽 표면이라 사용자 설정으로 지워지지 않는다.
같은 계열로 `web.run`(네트워크 송출)·`collaboration.*`(에이전트 생성)이 워커 도구 목록에
남는다(프로브 1 실측). read-only 샌드박스는 이들을 덮지 않는다(§5.1과 같은 이유).

또한 사용자 설정을 무시하면 **우리가 필요한 `onto`도 같이 사라진다.** 따라서 기제는
"상속 제거"가 아니라 **"목적에 맞게 지은 CODEX_HOME"**이다: `auth.json` + 최소 `config.toml`에
**범위 제한 façade 하나만** 넣어 띄운다(`-c` 오버라이드가 아니라 전용 홈).

**개정된 요구**:

1. 워커는 전용 `CODEX_HOME`으로 띄운다. 사용자 config는 로드하지 않는다.
2. 그 홈의 `config.toml`에는 관측 façade **한 개만** 등록한다.
3. 기동 시 열거된 MCP 서버 집합이 `{façade} ∪ {알려진 provider-side 집합}` **부분집합인지**
   확인한다. 정확 일치가 아니라 **부분집합 + 금지 능력 부재**로 판정한다.
4. provider-side 잔여 표면은 **설정으로 못 지운다.** 그 크기는 §5.3에서 실측했다.

### 5.3 잔여 표면 실측 (단계 0a, 2026-07-26) — "수용" 문안 철회

전용 `CODEX_HOME`(auth만) 조건에서 워커가 부를 수 있는 도구를 전수 열거했다. **193개**가 나왔고,
`codex_apps`에 다음이 포함된다:

```
github._merge_pull_request              (쓰기·네트워크)   PR 머지
github._create_file / _update_file / _delete_file        저장소 파일 조작
github._create_branch / _create_pull_request
github._enable_auto_merge / _dismiss_pull_request_review
github._rerun_workflow_job              (쓰기·네트워크·프로세스)
plugin_management._uninstall_app / _update_app_permissions
```

`--ignore-user-config`와 전용 `CODEX_HOME`만으로는 살아남는다 — 사용자 config가 아니라
운영자의 ChatGPT 계정 커넥터에서 오기 때문이다.

**따라서 이전 문안 "수용하는 잔여 위험"은 철회한다.** 크기를 재기 전에 쓴 문장이었고,
재보니 수용을 선언할 수 있는 크기가 아니었다.

### 5.3.1 기동 시점 제한 수단 — 발견 (owner 제안, 2026-07-26)

> owner: *"CLI 생성 시에 exec 커맨드로 제한할 방법을 찾아보는 것은 의미 있을 것 같아."*

있었다. `codex exec --disable <FEATURE>`(= `-c features.<name>=false`)다.

feature 이름은 **LLM 호출 없이** 확정했다 — `--strict-config`가 인식하지 못하는 설정 키에
즉시 실패하므로, 존재하지 않는 키를 음성 대조군으로 두고 후보를 걸렀다:
`features.codex_apps` REJECTED / **`features.apps` ACCEPTED**.

효과는 대조군과 함께 실측했다:

| | MCP 서버 | `tool_search`로 'github' 검색 |
|---|---|---|
| A) 대조군 | `codex_apps` | **8개 발견**(`_rerun_workflow_job` 등) |
| B) `--disable apps` | **`SERVERS_NONE`** | **`tool_search` 자체가 없음** |

즉 `--disable apps` + 전용 `CODEX_HOME`이면 **MCP 서버가 하나도 남지 않고**, 지연 로딩 도구
검색 기구까지 사라진다. §5.3의 GitHub 쓰기·머지 표면은 **기동 시점에 닫을 수 있다.**

이로써 §5.2·§5.3의 "설정으로 못 지운다"는 진술은 **정정된다.** `-c mcp_servers={}`가 안 통해서
내린 결론이었고, 옳은 손잡이는 features 쪽이었다.

### 5.3.2 MCP만 닫는 것으로는 부족하다 — owner 지적 (2026-07-26)

> owner: *"GitHub은 auth 토큰이 이 기기에 남아있는 거라 안 막히는 것일 수 있어.
> 이건 bash로 불러내는 걸 막으면 막힐 거야."*

**맞았고, §5.3.1의 "닫을 수 있다"는 결론은 그대로 두면 틀린다.** MCP 도구를 전부 없애도
워커에는 셸(`functions.exec`)이 남고, 이 기기에는 `gh` CLI와 git 자격증명이 있다. 문이 둘인데
하나만 닫고 닫혔다고 적은 것이다.

실측(대조군 동반, 읽기 전용 명령만 사용):

| 팔 | 셸 실행 | `gh auth status` |
|---|---|---|
| `--disable apps`만 | **실행됨** | `The token in default is invalid` |
| `+ --disable unified_exec --disable web_search` | **여전히 실행됨** | 동일 |

두 가지가 드러났다.

1. **셸 경로는 열려 있다.** `features.unified_exec`는 설정으로 인식되지만 셸을 끄지 못한다 —
   **키가 유효한 것과 그것이 원하는 것을 끄는 것은 다르다.**
2. **토큰은 실제로 쓰이지 않는다.** `gh`는 keyring(macOS 키체인)에 저장돼 있고
   (`GH_TOKEN` 등 환경변수는 전부 미설정, git credential helper도 `osxkeychain`,
   `~/.netrc`·`~/.git-credentials` 없음), **키체인 항목 접근은 사용자 인증을 요구하므로
   운영자가 없으면 열리지 않는다**(owner 확인). 이건 우연이 아니라 실질 보호다.

### 5.3.3 셸 차단 수단 — 발견·검증 (owner 지시로 조사, 2026-07-26)

바이너리 문자열에서 `ConfigToml`의 96개 필드 전체를 추출하고(실체 =
`codex-aarch64-apple-darwin` 0.145.0), 공식 Configuration Reference로 교차 확인했다.

**`--disable shell_tool`**(= `features.shell_tool=false`)이 답이다.

키 유효성은 `--strict-config`로 판별했다 — 대조군 `features.definitely_not_real` REJECTED /
**`features.shell_tool` ACCEPTED**. 효과는 대조군과 함께 실측했다:

| 팔 | `echo PROBE_SHELL_RAN` |
|---|---|
| A) `--disable apps` | **실행됨** |
| B) `+ --disable shell_tool` | **`NO_SHELL` — `TypeError: tools.exec_command is not a function`** |

도구가 실제로 사라진다.

**방법론 정정**: `--strict-config` 판별은 **top-level 알려진 필드에만** 유효하다.
`[permissions.<name>]`은 이름이 자유로운 테이블이라 내부를 검증하지 않는다 — 실제로 존재하지도
않는 프로파일 이름과 `enabled_tools=[]`가 통과했다. **그 구간의 ACCEPTED는 신호가 아니다.**

### 5.3.4 실측된 강화 세트

| 표면 | 수단 | 상태 |
|---|---|---|
| 파일시스템 쓰기(셸·패치) | `-s read-only` | 착지 완료(PR #266) |
| 사용자 config MCP(`day1-mcp` Workspace 쓰기, `onto` 재귀) | 전용 `CODEX_HOME` | 실측 확인 |
| 계정 커넥터(GitHub 쓰기·머지, `tool_search`) | `--disable apps` | 실측 확인 |
| **셸 실행 전체** | **`--disable shell_tool`** | **실측 확인** |
| GitHub 토큰 실사용 | macOS 키체인 = 사용자 인증 필요 | 별도 층(설정 아님) |

**아직 측정하지 않은 것**:
- `[permissions.<name>.network] enabled=false` — 네트워크 자체를 끊는 더 강한 후보.
  셸이 남아도 유출·API 호출이 불가능해진다. `sandbox_mode`와 상호배타이므로 `-s`를 대체한다.
- **셸을 끈 상태에서 reconstruct 저작이 정상 동작하는지.** 저작 프롬프트는 JSON 산출만
  요구하므로 셸이 불필요해 보이지만 **확인 전에는 가정이다** → 단계 0b의 필수 검증.

### 5.4 정확한 프레이밍 (owner, 2026-07-26)

> **"로컬 CLI를 쓰는 이상 내 권한과 같은 권한을 가질 수밖에 없다."**

이것이 이 문제의 성격이다. 워커는 운영자의 기계에서 운영자의 자격증명으로 도는 로컬 CLI다.
**운영자 권한을 물려받는 것은 설정 결함이 아니라 실행 모델의 성질**이며, 설정으로 제거할 수 없다.

그러므로 이 설계의 목표를 정정한다:

- **목표가 아닌 것** — "워커가 운영자보다 적은 권한을 갖게 한다". 로컬 CLI로는 달성 불가능하다.
  §5.3.1로 MCP 표면을 전부 닫아도 워커는 여전히 운영자 자격증명으로 도는 로컬 프로세스다.
- **목표인 것** —
  1. **기동 시점에 닫을 수 있는 것은 전부 닫는다** — 실측된 수단은 두 개다:
     전용 `CODEX_HOME`(사용자 config 서버: `day1-mcp`·`onto` 재귀) +
     `--disable apps`(계정 커넥터: GitHub 쓰기·머지, `tool_search`).
     **둘 다 실측으로 효과가 확인됐다**(§5.3.1).
  2. **남는 것을 기동 시 열거해 기록한다** — 닫을 수 없다면 최소한 **모른 채로 돌지는 않는다**
  3. **없는 보장을 주장하지 않는다** — 문서와 공개 라벨에 실제 경계를 적는다

이 프레이밍은 §5.3.1의 발견 뒤에도 유효하다. 바뀐 것은 **닫을 수 있는 범위**이지 권한 모델이
아니다 — 표면을 다 닫아도 워커는 운영자의 셸(read-only 샌드박스 하)과 자격증명을 갖는다.

**따라서 이 설계의 안전 가치는 입력 격리가 아니라 출력 게이트에 있다.** 출처 추적
(`인용 ⊆ 조회 ⊆ 스냅샷`)은 워커가 무엇에 손댈 수 있는지와 무관하게 성립한다 — 산출물이
관측으로 뒷받침되지 않으면 거부되기 때문이다. 입력 표면 축소는 blast radius를 줄이는
보조 수단이지 이 설계가 기대는 근거가 아니다.

진짜 격리가 요구된다면 로컬 CLI가 아닌 **다른 실행 모델**(별도 자격증명·격리 환경)이 필요하다.
이 설계의 범위 밖이며, 필요해지면 별도 결정 사안이다.

> 정확 일치를 요구했던 원 문안은 **실측으로 기각**됐다. 그 문안을 그대로 두면 구현이
> 영원히 통과할 수 없는 게이트를 만든다.
>
> 이 단계는 여전히 **관측 도구 설계의 채택 여부와 무관하게** 값이 있다 — §5.1의 실제 위험
> 두 건이 여기서 닫힌다.

### 5.5 façade 도달·토큰 전달 실측 (단계 3 선행, 2026-07-27)

§12가 단계 3의 선행 조건으로 남겨둔 세 질문에 답한다. **측정 조건은 production 배선 그대로**이며
(`callCodexCli`, `llm-caller.ts:944-995`), 모든 팔이 대조군을 동반한다.
증거·재현 절차는 `benchmark/observation-facade-probe/`.

| 팔 | 추가 | 결과 |
|---|---|---|
| A 대조군 | 없음 | `SERVERS: NONE` · `SHELL: NO` · façade 프로세스 미기동 |
| B | façade 등록(`-c mcp_servers.*`) | **서버 기동 + `initialize` + `tools/list`** (계측기 자신의 사이드 로그) |
| C | B + 호출 지시 | `user cancelled MCP tool call` |
| E | C + `approval_policy="never"` | 동일 실패 — exec 기본값이 이미 `never`다 |
| H | C + `default_tools_approval_mode="auto"` | 동일 실패 |
| **F·G** | C + `default_tools_approval_mode="approve"` / 도구별 `approval_mode="approve"` | **호출 완료** |
| I | F + **350,000자 프롬프트** | **완료** |
| J·K | F + **65,535자 도구 응답** | **완료·무손실**(0/25/50/75/99% 마커 전수 수신) |

1. **façade는 강화 세트 하에서 등록된다.** `--ignore-user-config`는 사용자 config만 무시하고 `-c`
   오버라이드는 살아 있다. §12의 "명시 등록 서버가 살아남는가"는 **살아남는다**로 닫힌다.
2. **`--disable shell_tool` 하에서 MCP 호출이 산다** — 셸과 MCP가 다른 경로라는 가정이 확인됐다.
3. **승인 지렛대가 새로 필요하다.** 비대화형이라 승인 요청은 자동 거부된다. 듣는 키는
   `mcp_servers.<name>.default_tools_approval_mode="approve"`(또는 도구별 `tools.<tool>.approval_mode`)
   뿐이고 **우리가 등록한 서버로 범위가 한정된다** — 전역 승인 완화가 아니다. 유효값
   `auto|prompt|writes|approve`는 잘못된 값의 serde 에러로 **LLM 없이** 열거했다.
4. **`spawn` env는 상속되지 않는다.** codex가 MCP 자식에게 주는 env는 10개뿐이다. 토큰 경로는
   `mcp_servers.<name>.env.*` 또는 `args`이며 **둘 다 도달**한다. §4.1의 "환경에 구워 넣는다"는
   **codex config를 경유**하는 형태로만 성립한다.
5. **토큰은 모델 입력에 없다.** codex가 상류로 보내는 실제 요청 본문을 포획해(6회 × 89,049자) 두 비밀
   문자열·façade 경로·node 경로가 **0회**임을 확인했다. 공허하지 않음의 근거는 본문이 파싱되고
   프롬프트·지시·도구 선언을 모두 담고 있다는 것이다. **경계**: 첫 턴만 포획했다.
   → §4.1의 "모델 입력에 세션 식별자가 없다"는 전제가 유지된다.

**설계에 영향 있는 부수 발견**

- **codex는 MCP 도구를 모델에게 직접 광고하지 않는다.** 요청에 실리는 도구는 `exec`(V8 격리 JS) ·
  `wait` · `request_user_input` 셋이고, MCP 도구는 그 샌드박스 안에서 `tools.mcp__<server>__<tool>()`로
  노출돼 `ALL_TOOLS`로 찾게 되어 있다. **단계 3의 프롬프트가 façade 이름과 호출 방법을 명시해야 한다** —
  발견을 모델의 탐색에 맡기지 않는다(성공한 팔이 전부 그 방식이다).
- **`exec`의 `max_output_tokens` 기본값이 10,000 토큰이다.** 65,535자 페이지가 무손실로 온 것은 모델이
  샌드박스에서 프로그램적으로 훑을 수 있기 때문일 수 있고, 그 크기가 모델 맥락에 그대로 들어간다는
  뜻은 아니다. 누적 회계는 **과다 과금 방향**이라 천장은 안전하다. 단계 5가 볼 것은 "모델이 실제로 무엇을
  읽었나"다.
- **세션 프레이밍 실측치가 상수와 자릿수가 다르다.** 첫 요청 89,049자 = 도구 선언 12,342 + codex 지시
  18,088 + 권한 지시 21,390 + **cwd의 AGENTS.md 53,047** + 우리 프롬프트 146. `OBSERVATION_READ_SESSION_
  RESERVE_CHARS = 8,192`와 비교되지만 **같은 저울이 아니다** — 설계가 모델링하는 천장은 stdin 한계이고
  이 프레이밍은 상류 방향이다. §12의 "같은 천장인가" 가정에 처음으로 숫자가 붙었다.
- **모델이 도구를 안 부르는 일이 실제로 일어난다.** 동일 배선 2회 중 1회(D)가 호출을 시도조차 하지 않고
  "tool unavailable"이라 답했다(luna/low 관측). §8의 "모델이 도구를 안 씀" 행은 이론이 아니다.

## §6. 밀어넣는 층

모든 관측의 **상세 없는 카탈로그**를 유지한다. 목표 표현은 기존 fold의 `one_line` 등급
(`observation_id` · `source_ref` · `summary` 최소 포함) — §1.4의 13KB 층이다.

- 카탈로그가 안 들어가면 기존 fold 사다리로 `summary_anchor` → `anchor` 강등한다.
  **관측을 버리지 않는다.**
- 최소 `anchor`조차 안 들어가면 **워커 기동 전에 실패**한다(모델에게 id를 추측시키지 않는다).
- `one_line`으로 고정하면 프롬프트가 **오늘보다 더 결정론적**이 된다(오늘은 fold 등급이
  입력에 따라 달라진다).
- §1.2의 64 캡을 들어낸다 — 항해 층만 지므로 전 관측이 선택 가능해진다.

## §7. 결정론 — 무엇이 남고 무엇을 잃는가

**정직하게: 사전 재사용(pre-execution reuse)을 포기한다.**

도구 사용 호출은 프롬프트-지문 캐시를 읽지도 쓰지도 않는다. 대신 **사후 실행 지문**을 만든다:

```
H(결정론적 입력 지문, 도구 계약 버전, 스냅샷 digest,
  정렬된 (조회 관측 id, 내용 해시) 쌍, 페이지 응답 digest)
```

- **남는 것** = *사후 의존성 재현성*. 승인된 산출물이 자신의 결정론적 입력·스냅샷·정확히 어떤
  상세를 읽었는지·내용 해시·출력을 모두 식별한다. 보존된 관측으로 검증·재현이 가능하다.
- **잃는 것** = 같은 입력이 같은 조회 순서·같은 출력·사전 캐시 적중을 보장하지 않는다.

이 교환을 받아들이는 이유: 프롬프트-only 키를 그대로 두면 **틀린 재사용을 허용**하게 된다.
완전한 실행 재생은 별도의 기록-재생 모드가 필요하며 최소 경로 밖이다.

### 감사 기록 (owner 결정 D2)

dispatch 시도별 감사 레코드에 **조회한 id + 내용 해시 + 페이지 영수증**을 남긴다(관측 아티팩트가
아니라 감사 레코드에). 실패한 dispatch도 조회 기록을 유지한다.

정직한 명명: 이것은 "모델이 읽은 것"의 감사가 아니라 **"런타임이 내준 것"**의 감사다.
모델이 실제로 읽었는지는 강제 불가능하며, 공개 라벨도 그렇게 적는다.

## §8. 실패 모드와 탐지

| 실패 | 탐지 |
|---|---|
| 모델이 도구를 안 씀 | 비어있지 않은 스냅샷에는 최소 1회 성공 조회 요구 + `인용 ⊆ 조회` 검증 → 계약 거부 |
| 실재하지만 조회 안 한 id 인용 | 부분집합 검증이 거부. **런타임이 인용을 고쳐주지 않는다** |
| 없는 id 인용 | 기존 관측 해석 게이트가 거부 |
| 타 세션 id 추측 | 스냅샷 밖 = 동일한 오류(타 세션 존재를 누설하지 않음) |
| **소비 미승인 관측을 pull로 가져감** | **§3.1 — grant 스냅샷에 부재. 없는 id와 동일한 오류** |
| **원장이 도중에 승인을 철회/추가** | **게이트 결정이 digest에 실려 회전 → `snapshot_drift`** |
| **회수·만료된 토큰 재생** | **`grant_revoked`·`grant_expired`. 회수 전 발급된 커서도 동일** |
| **실패 호출로 무한 왕복(오류도 워커 맥락을 먹는다)** | **실패도 호출·프레이밍을 과금 + 호출 횟수 상한** |
| 누적 초과가 codex 내부로 이동 | 누적 예산 + 호출 횟수 상한 |
| 카탈로그 자체가 초과 | 기동 전 anchor-적합 검사 실패 |
| 관측 아티팩트가 도중 변경 | 스냅샷 digest·내용 해시 불일치 → "최신으로 전환" 안 함 |
| 감사 기록 실패 | 상세를 내주기 **전에** 실패시킨다 |
| 워커가 위험 도구를 봄 | 기동 시 화이트리스트 대조 실패 |
| 캐시가 프롬프트-only 결과를 반환 | 도구 사용 호출의 레거시 캐시 조회를 단언으로 금지 + 오염 캐시 음성 테스트 |

## §9. 단계별 계획

| 단계 | 내용 | 검증 |
|---|---|---|
| **0a** | ~~잔여 표면 능력 열거~~ — **완료(2026-07-26)**, 결과는 §5.3 | 도구 193개 열거(비어있지 않음 확인). GitHub 쓰기·머지 능력 발견 → §5.2의 "수용" 문안 철회, §5.4로 프레이밍 정정 |
| **0b** | **워커 기동 강화 세트 적용**(§5.3.4): 전용 `CODEX_HOME` + `--disable apps` + `--disable shell_tool` (+ `-s read-only` 유지) | ①도구 열거가 비어있지 않음을 단언(공허 통과 방지) ②`day1-mcp`·`onto_reconstruct`·`mcp__codex_apps__github._*`·셸 **부재를 개별 확인** ③**셸을 끈 상태에서 reconstruct 저작이 정상 완주하는지** — 미확인 가정이므로 필수 ④`web.run`·`collaboration.*` 잔존 여부 기록 ⑤네트워크 차단 프로파일(§5.3.4 미측정) 평가. **설계 채택과 무관하게 값 있음** |
| **1** | ~~순수 아티팩트 리더~~ — **완료(2026-07-26)**, `src/core-runtime/reconstruct/observation-read.ts` (inert, 소비자=테스트뿐) | §9.1 참조 — done-when 4/4 + 교차검증 반영 |
| **2** | ~~세션 범위 결속 + 누적 예산~~ — **완료(2026-07-26)**, `observation-read-grant.ts` (inert, 소비자=테스트뿐). owner 결정으로 **§3.1 소비 권한 게이트 포함** | §9.2 참조 — done-when 8/8 + 변이 13종 검증 |
| **3a** | ~~ledger 표면 **밀어넣는 층**~~ — **완료(2026-07-27)**, opt-in `source_observation_catalog_tool` default OFF. owner 결정으로 3b와 분리 착지 | §9.3 참조 — done-when 4/4 + 변이 9종 검증 |
| 3b | ledger 표면 **가져가는 층**: façade + 토큰 + `인용 ⊆ 조회` (같은 opt-in) | 조회 안 하면 실패 / A 조회 후 B 인용하면 실패 / OFF는 byte-identical |
| 4 | 감사 + 사후 지문 | 조회 후 크래시해도 조회 기록 유지. 감사 실패 시 상세 미반출 |
| 5 | 실측 — 59파일 코퍼스 재실행 | 크기 거부 없이 완주 · 인용 100% 해석 · 인용 ⊆ 조회 |
| 6 | 클래스 가드 — 모든 규모-반응 투영을 공용 상세 예산 층으로 | AST 인벤토리 재실행 전 **대상 집합 비어있지 않음** 단언 + 의도적 위반 fixture가 잡히는지 확인 |

**반증 조건**: 59파일 벤치가 여전히 한계를 넘음 / 워커가 허용 목록 밖 도구에 도달 / 내준 id가
감사에서 누락 가능 / 페이지로 관측 하나를 못 가져옴 / OFF 경로의 바이트가 달라짐.

### §9.1 단계 1 착지 기록 (2026-07-26)

**산출**: `observation-read.ts` + `observation-read.test.ts` (28 테스트) + 실 fixture
`scripts/fixtures/observation-catalog/source-observations.yaml`(59관측 3.9MB, gitignored 세션에서 보존).
런타임 소비자 0 — 설계대로 inert.

**계약 요약**: `fixObservationSnapshot(artifactText)` → 동결 스냅샷(관측별 본문 = 아티팩트 키 순서
그대로의 JSON, `observation_content_sha256`, 단사 인코딩 digest) · `readObservationPage({snapshot,
request, pageCharBudget})` → 예산은 **직렬화된 페이지**(`JSON.stringify(page).length`) 기준.
분할은 `(body, partAllowance)`만의 함수이므로 커서 재개가 동일 분해를 걷는다.

**done-when 실측**:

| 항목 | 결과 |
|---|---|
| 페이지 재조립 = 원본 바이트 동일 | 59관측 전수 통과 + `JSON.parse` 결과가 아티팩트 관측과 deep-equal |
| 모든 응답이 상한 이하 | 전 페이지 단언 + **모듈 자체 가드**(초과 시 fail-loud) |
| 과대 스칼라 음성 대조 | 222,483자 `content_excerpt` **내부**에 분할 경계 3개 — 필드 경계 분할기는 통과 불가 |
| fixture 비어있지 않음 선행 단언 | 관측 수 > 0 · 전 관측 `structural_data` 비어있지 않음 |

**추가로 산 것**: 비용 모델을 **전 코드포인트 1,114,112개 전수 검증**(+ naive 모델 음성 대조) ·
이스케이프가 1.83배인 병리적 코퍼스에서도 예산 유지 · 변이 8종 전부 탐지(각 변이가 대응 테스트만 실패).

**교차검증**(codex `gpt-5.6-sol`/xhigh, hermetic read-only, 7개 주장 적대 공격): 발견 6건.

| 발견 | 판정 |
|---|---|
| 스냅샷이 외부에서 **가변** — 페이지 사이에 본문 교체 가능, 무결성 검사는 통과 (high) | **수정**: 엔트리·배열 `Object.freeze`, Map 대신 `lookup` 클로저 |
| digest preimage가 **구분자 결합이라 단사가 아님** — session_id로 다른 스냅샷 위조 (high) | **수정**: 구조 튜플 JSON 인코딩. 위조 재현이 이제 테스트 |
| `-0`이 조용히 `0`이 됨 (medium) | **수정**: `Object.is(v,-0)` 거부 (기존 non-finite 가드와 같은 클래스) |
| 테스트의 `part_count` 오라클이 마지막 값으로 덮어씀 (medium) | **수정**: 첫 선언 고정 후 전 페이지 대조 |
| 커서 예약 때문에 ~500자 미만 예산에서 서빙 가능한 페이지를 거부 (medium) | **미수정·경계 명시**: 종단 페이지만 예약 없이 재산정하면 `part_count`가 "마지막인가"에 의존하게 되어 **분할 결정성이 깨진다**. 해당 대역은 1 MiB 천장에서 파생될 어떤 예산보다 낮고, 오류가 정확한 프레이밍 비용을 알려준다 |
| 손으로 만든 커서가 part를 건너뛸 수 있음 (medium) | **미수정·경계 명시**: 커서는 권한이 아니라 좌표다. 위조로 **좁힐** 수만 있고(스냅샷 밖·id 상한 초과 불가 — 테스트로 봉인) 넓힐 수 없다. MAC/서버 핸들은 §10에서 검토 후 digest 결속을 채택한 대안 |

주 세션 자체 판단으로 추가 정정 1건: 엔트리 해시 필드명 `content_sha256` → `observation_content_sha256`
(본문 안에 실려 오는 `structural_data.content_sha256`은 **소스 파일** 해시라 이름 충돌 — 서로 다른 개념).

### §9.2 단계 2 착지 기록 (2026-07-26)

**산출**: `observation-read-grant.ts` + `observation-read-grant.test.ts`(38 테스트) + 실 원장 fixture
`scripts/fixtures/observation-catalog/source-safety-ledger.yaml`(같은 벤치 런의 295행). 런타임 소비자 0 — inert.
단계 1 모듈 수정 3건(`sealSnapshot` 추출 · `restrictObservationSnapshot` · `assertObservationSnapshotDigestUnchanged`),
`source-safety-validation.ts`에 `sourceSafetyRowIdForObservationId` 추가(행 id 형식 단일 출처화).

**개념**: **grant** = 세션 범위·회수 가능·예산 보유의 읽기 권한. `capability`는 이 저장소에서 이미
과적재(dispatch capability·adapter capabilities)이므로 새 이름을 골랐다. 실패 어휘는 **새로 만들지 않고**
`ObservationReadFailureReason`을 확장했다 — 워커가 보는 표면이 하나이므로 `reason` 집합도 하나여야 한다.

**계약 요약**: `registry.mint({sources, systemPrompt, userPrompt, ttlMs, pageCharBudget?})` →
`{token, receipt}` · `registry.serve({token, request})` · `revoke(token)` · `receipt(token)`.

- `sources` = **세 아티팩트의 경로**(관측 · 안전성 원장 · 원장 검증). 내용이 아니라 경로이므로 mint가
  읽어 스냅샷을 고정하고 **serve마다 다시 읽어** 드리프트를 검사한다 — 검사를 건너뛰거나 스테일 사본을
  먹이는 경로가 없다. 경로 문자열은 mint에서 **복사**한다(참조 보관은 mint 후 리다이렉트를 허용했다).
- 프롬프트는 **두 조각**으로 받고 `codexCombinedPrompt`(= `callCodexCli`가 stdin에 쓰는 그 함수)로
  합쳐 길이를 잰다. 천장은 파라미터가 아니라 `CODEX_PROMPT_INPUT_CHAR_LIMIT` import다.
- `pageCharBudget`은 `OBSERVATION_READ_MIN_PAGE_CHAR_BUDGET`(4,096) 이상만 허용된다(실측 근거는 §9.2).
- ttl은 호출자 것 — spawn이 이미 워커 수명을 안다.

**done-when 실측**:

| 항목 | 결과 |
|---|---|
| pull 게이트 = push 게이트 (실 코퍼스) | `sourceObservationsForPrompt`와 **id 집합 동일**, 크기 59 > 0 선행 단언 |
| 승인 안 된 관측 도달 불가 | tier 강등·행 삭제·전건 강등 3변이 전부 `unknown_observation_id`, 없는 id와 **메시지 동일** |
| 변이가 실제 withholding인지 대조 | 각 변이를 **push 게이트에도** 걸어 58/59로 줄어드는 것 확인(변이가 내 규칙의 산물이 아님) |
| 세션 격리 | A 토큰이 B의 id·B 토큰이 A의 id 둘 다 거부 + **각자 자기 grant에서는 서빙됨**(공허 방지) |
| 커서 교차 제출 | `snapshot_drift` |
| 누적 총량 ≤ 천장 | 문자 바운드 소진까지 walk 후 `chars_served ≤ total`, **거부된 호출은 과금 0** |
| 커서 결속 무충돌 | 전 walk가 `cursor_malformed` 없이 완주, 재조립 = 아티팩트 본문 **바이트 동일** |
| 토큰 비노출 | 오류 3종·receipt 직렬화에 토큰 문자열 부재 |

**변이 검증 16종 → 15 탐지**(각 변이가 해당 테스트만 실패):
게이트 제거 · 게이트 fail-open · tier 검사 제거 · 실패 호출 미과금 · admission을 실잔여로 · 드리프트 검사 생략 ·
드리프트 fast-path가 스냅샷 id만 재검사 · 만료 off-by-one · 토큰 에코 · 제한 후 digest 재도출 생략 ·
회수를 삭제로 · **기각 대안(예산=잔여 + admission=잔여)** · 천장 미검증 · 드리프트를 과금 전에 검사 ·
중복 행 id first-wins.

미탐지 1종은 `pageCharBudget = min(page, 잔여)` 단독이며, §4.2.1이 증명한 대로 최악치 admission 하에서
**관측 가능한 차이가 없다**(따라서 원리적으로 탐지 불가). 실제 가드는 admission 쪽이고 그것은 탐지된다.
**교훈: 미탐지 변이를 테스트 구멍으로 오진하기 전에 그 변이가 정말 행동을 바꾸는지 증명하라.**

**변이 검증이 잡은 설계 결함 1건**: `max_calls`를 총량에서 도출하면 문자 가드가 도달 불가 코드가 된다 →
호출 상한을 상수로 독립시켜 두 상한을 모두 살렸다(§4.2.1). **테스트를 다 통과하는 상태에서 발견됐다** —
green이 아니라 변이가 잡았다.

**자체 재검토가 잡은 4건**(교차검증 대기 중 수행, 전부 실측으로 확인):

| 발견 | 처분 |
|---|---|
| `promptInputCharLimit`이 미검증 → **NaN 천장이면 무제한 서빙**(NaN 비교가 전부 false라 unservable·admission·초과 가드가 모두 통과). 실측: NaN으로 65,507자 페이지 서빙됨 | **수정**: 양의 정수 검증. 변이 M14로 봉인 |
| 드리프트 실패가 **미과금**이라 무한 무료 루프. 오류도 워커 맥락을 먹는다 | **수정**: 과금을 드리프트 검사보다 앞으로. 순서 = resolve → admission → 과금 → 드리프트 → read |
| 게이트가 중복 행 id를 any-wins로 처리 → push 게이트(`new Map`, **last-wins**)와 `[allowed, denied]` 쌍에서 갈린다 | **수정**: last-wins Map으로 정확히 미러(원장 validator가 중복을 막지만 "정확히 미러"라는 주장을 코드가 지켜야 한다) |
| **주장 과대**: "A의 커서는 B에서 거부된다"는 스냅샷이 다를 때만 참. 동일 내용 두 grant는 digest가 같아 커서가 통과한다(실측) | **주장 정정·경계 테스트 추가**: 성질은 "토큰은 자기 스냅샷만 도달"이고 커서는 grant에 결속되지 않는다. 위조는 여전히 **좁힐** 수만 있고 과금은 서빙한 grant에 붙는다. 결속은 per-grant MAC이 필요하며 §10에서 미채택 |

**교차검증**(codex `gpt-5.6-sol`/xhigh, hermetic read-only, 8개 주장 적대 공격): **6건 전부 high, 전부 사실**.
실코드로 재확인 후 전건 수정했다.

| 발견 | 처분 |
|---|---|
| **CLAIM 1** 게이트 우회 가능 — `fixObservationSnapshot(text)`와 `readObservationPage`가 나란히 export돼 있어, 미래 façade가 둘을 짝지으면 **모든 타입을 만족시키면서** 승인 안 된 관측을 서빙한다 | **수정**: 게이트를 **스냅샷 생성자 안으로**. `fixObservationSnapshot(text, ledger)`가 유일한 생성자이고 리더는 스냅샷만 읽으므로 **ungated 스냅샷 타입 자체가 없다**. "이 모듈이 유일한 호출자라서" 성립하던 성질이 "우회를 작성할 수 없어서" 성립하게 됐다 |
| **CLAIM 5** mint가 두 아티팩트의 `session_id`를 **비교하지 않음** — 세션 A 관측 + 타입 맞는 세션 B 원장이면 B의 결정으로 A를 게이팅한다(원장 validator는 `session_id_mismatch`로 잡지만 grant가 그 검증을 요구하지 않았다) | **수정**: 생성자에서 세션 일치 단언 |
| **CLAIM 3** 실패 메시지 크기 미과금 — 200,000자 id가 ~200,000자 오류를 만드는데 1,024로 과금 | **수정 2겹**: id 길이 상한(`OBSERVATION_READ_MAX_ID_CHARS=128`, 오버사이즈 id는 **에코하지 않음**) + 실패 메시지 **실길이 과금**. 최악치가 예약 안에 드는 것을 테스트 |
| **CLAIM 6** `readInputs: () => cached` 클로저면 필수 드리프트 검사가 **스테일 값 위를 통과** — 검사는 돌지만 아무것도 증명하지 못한다 | **수정**: 내용이 아니라 **경로**를 받는다. serve마다 두 파일을 다시 읽으므로 스테일이 표현 불가. 실측으로 정당화(읽기 5.5ms vs 재파싱 579ms → 텍스트 해시 fast path) |
| **CLAIM 7** 만료가 latch되지 않아 **시계가 뒤로 가면 부활** | **수정**: `expired` 상태로 latch |
| **추가** 천장이 **호출자 선언값** — `promptInputCharLimit: 3_000_000`(합법적 양의 정수)으로 실제 한계보다 1,064,510자 더 서빙됨. `initialPromptChars`도 검증 안 된 스칼라 | **수정**: 천장은 `CODEX_PROMPT_INPUT_CHAR_LIMIT`를 **import**(파라미터 제거) · 프롬프트는 **텍스트**를 받아 길이를 여기서 측정. 앞서 자체검토가 넣었던 NaN 검증은 **파라미터가 사라져 불필요**해졌고, 해당 테스트는 "천장을 선언할 수 없다"는 구조 테스트로 대체 |

**수정 후 변이 18종 → 18 탐지**(게이트 무시·fail-open·tier 제거·세션 미비교·id 상한 제거·중복 first-wins·
digest 미회전·admission 실잔여·**기각 대안**·드리프트 생략·드리프트를 과금 전에·실패 텍스트 미과금·
**만료 미latch**·만료 off-by-one·토큰 에코·회수를 삭제로·원장 shape 미검증·아티팩트 1회만 읽기).
`min(page, 잔여)` 단독 변이는 §4.2.1이 증명한 대로 관측 가능한 차이가 없어 배터리에서 제외했다.

**만료 latch는 코드를 고친 뒤에도 변이가 미탐지**로 나왔다 — 수정은 했는데 **역행 시계 테스트를 안 썼기**
때문이다. 배터리가 없었으면 "고쳤다"로 끝났을 자리다.

**남는 경계(정직)**: 예산 소진 후의 거부는 과금할 잔여가 없으므로 무한 반복 가능하다. 거부 메시지는
크기가 상수이고 **관측 내용은 더 나가지 않는다** — 워커의 턴 수를 묶는 것은 codex 쪽 일이다.

#### 2차 교차검증 — 렌즈 2벌 병렬 (2026-07-26)

같은 렌즈를 반복하면 같은 맹점을 공유하므로 **서로 다른 렌즈 2벌**을 병렬로 돌렸다.
렌즈 A = "수정이 정말 구멍을 닫았는가" (`gpt-5.6-sol`/max) · 렌즈 B = "산술과 테스트 스위트 자체"
(`gpt-5.6-sol`/xhigh). **렌즈 B: 4건(medium) — 전부 사실, 전건 수정.**

| 발견 | 처분 |
|---|---|
| **누적 상한이 실제로 깨진다** — `pageCharBudget: 1`이면 총량이 정확히 1,025자 예약과 같아 mint가 통과하고, 한 번의 **합법 호출**이 1,181자를 과금해 **156자 초과**. 실패 메시지 과금이 "예약이 메시지를 압도한다"에 의존했는데 작은 페이지 예산에서는 성립하지 않는다 | **수정**: `OBSERVATION_READ_MIN_PAGE_CHAR_BUDGET = 4_096`. 하한을 **실측으로** 정했다 — 최악 shape-legal 요청(16 ids × 128자)이 **3,376자**를 필요로 하고 도달 가능한 최장 실패 메시지가 **200자**이므로, 4,096은 두 성질(합법 요청이 거부되지 않음 · 예약 5,120 ≫ 200)을 동시에 만족한다. 두 측정 모두 테스트에 박아, id 상한을 올리거나 하한을 낮추면 실패한다 |
| **admission off-by-one이 미탐지** — `<`를 `<=`로 바꾸면 정당하게 자금이 있는 grant의 **첫 페이지**를 거부하는데, "정확히 한 페이지" 테스트가 mint와 스칼라만 보고 **serve를 안 했다** | **수정**: 그 테스트가 실제로 한 페이지를 서빙하고 다음 호출이 거부되는 것까지 확인 |
| **상수 변이가 전부 green** — 모든 회계 오라클이 production 상수를 import해 기대값을 재계산하므로 `OBSERVATION_READ_EXCHANGE_FRAMING_CHARS`를 **0으로 바꿔도** 스위트가 통과한다(예약과 과금에서 프레이밍이 전부 사라지는데) | **수정**: 천장 계약이 의존하는 상수 7개의 **값을 리터럴로 고정**하는 테스트 하나. 상수 변경은 이 테스트를 함께 고치는 의도적 행위가 된다 |
| **내용 해시가 sha256이 아니어도 통과** — receipt 테스트가 `/^[0-9a-f]{64}$/` 모양만 봐서 `sha256("x"+body)`가 미탐지. §7 지문의 (id, 내용 해시) 쌍이므로 replay 검증이 깨진다 | **수정**: 재조립한 본문에서 node crypto로 **독립 재계산**해 대조 + 본문이 아티팩트 관측과 deep-equal인지(공허 방지) |

**주 세션 자체 검증(리뷰 대기 중, 리뷰와 독립)**:

- **예산 경계 산술**: "정확히 한 페이지" 경계 ±1 · 프롬프트가 천장 이상 · 적대적 `pageCharBudget: 5_000_000`
  (mint 거부) · 긴 walk에서 두 상한 유지 — 전부 통과. **작은 쪽은 놓쳤다**(렌즈 B가 잡은 것이 그 방향이다).
- **게이트 미러**: 양쪽 게이트와 코드를 공유하지 않는 **제3의 오라클**로 6변이 대조, 전부 일치. 중복 행의
  **양방향**이 갈리는 것(58 vs 59)까지 셋 다 같이 움직임 → 테스트를 한 방향에서 양방향으로 보강
  (한 방향만 보면 "충돌 시 항상 거부"라는 다른 규칙도 통과한다).
- **비용 모델 가산성**: 단계 1은 코드포인트 개별 전수였고 가산성은 미검증이었다. 쌍·삼중, 찢어진 서로게이트
  600종, 3,000개 60자 혼합, 전 코드포인트를 이스케이프 문맥에 → 반례 없음.
- **새 결함 1건 자체 발견**: 경로 기반 재읽기(F4 수정)가 fs 오류를 `serve` 경로에 올렸는데, 아티팩트가
  삭제되면 **닫힌 실패 어휘를 벗어난 raw ENOENT**가 나갔다(torn write는 정상적으로 `artifact_malformed`).
  `reason` 분기가 계약의 전부이므로 분류되지 않은 throw는 단계 3이 errno를 특수 처리하게 만든다 →
  `artifact_malformed`로 매핑(개념을 쪼개지 않음)하고 메시지에 **경로 대신 아티팩트 역할만** 싣는다.
  부수 확인: **withheld 관측의 내용 변경은 드리프트가 아니다**(digest가 서빙 대상만 덮으므로) — admitted
  변경은 드리프트라는 대조군까지 테스트.

**렌즈 B 지목 변이 9종 재검증 → 9 탐지**(admission off-by-one · 프레이밍 0 · 세션예비 0 · 페이지예산 절반 ·
호출상한 2배 · **하한을 1로** · 해시 오염 · **id 상한 4,096으로** · 미분류 fs 오류).
id 상한을 올리면 하한 테스트가 실패하는 결속이 실측으로 확인됐다.

**렌즈 A (수정이 정말 닫혔는가, `gpt-5.6-sol`/max): F5만 CLOSED, 5건 STILL OPEN + 신규 1건.
전부 재현했고 전건 수정했다.** 이 렌즈가 1차 수정의 성격을 정확히 짚었다 — 1차는 **파라미터를 없앴지만
타입과 아티팩트 신뢰는 그대로 뒀다**.

| 발견 | 재현 | 처분 |
|---|---|---|
| **F1 STILL OPEN** — 게이트를 생성자로 옮겨도 `ObservationSnapshot`이 **구조적 타입**이라 손으로 쓴 객체 리터럴(`{entries:[], lookup:()=>withheldEntry}`)이 그대로 서빙된다. 캐스트도 생성자도 필요 없다 | **재현**: withheld 본문이 서빙됨 | **수정**: 모듈-private `unique symbol` **브랜드**로 nominal 타입화. `sealSnapshot`의 캐스트 한 곳만이 타입을 발행한다. 명시적 `as` 캐스트는 여전히 뚫지만 그것은 **리뷰 가능한 행위**다 |
| **F2 STILL OPEN** — `session_id`는 `path.basename(sessionRoot)`이고 관측 id는 소스 경로 해시라, 서로 다른 두 런이 **둘 다 공유**할 수 있다. A의 관측을 B의 허용 원장으로 게이팅해도 세션 검사를 통과한다 | 전제 확인(`reconstruct-api.ts:1141`·`materialize-preparation.ts:99`) | **수정**: 원장 자신의 `source_observations_ref`(런타임 writer가 `path.resolve`로 채움)와 대조 = 진짜 **아티팩트 동일성** 결속. `null`은 실패(런타임 writer가 안 쓴 원장) |
| **F3 STILL OPEN** — 원장의 `session_id`가 200,000자면 불일치 메시지가 그대로 echo돼 **134,556자 초과** | **재현**: `charged=201,116 / total=66,560` | **수정**: 아티팩트·호출자 유래 값의 **모든** 보간을 `elide`(96자)로. 5개 사이트 전수 |
| **F4 STILL OPEN** — `sources` 객체를 **참조로** 보관하므로(`readonly`는 컴파일 타임뿐) mint 후 caller가 mutate해 재읽기를 사본으로 돌릴 수 있다 | **재현**: 정본 원장에서 회수해도 서빙됨 | **수정**: mint에서 경로 문자열을 **복사**+freeze |
| **F6 STILL OPEN** — `initialPrompt`가 dispatch 문자열과 **동일성 결속이 없다**. user prompt만 넘기면 system+구분자를 누락(100k+900k에서 140,384 부여 vs 실제 1,000,007 dispatch) | 전제 확인(`llm-caller.ts:983`) | **수정**: `codexCombinedPrompt(system, user)`를 llm-caller에서 **추출**해 `callCodexCli`와 grant가 **같은 함수**를 쓴다. mint는 **두 조각**을 받는다 — 파라미터로 틀릴 여지가 사라진다 |
| **A1 신규** — 게이트가 `visibility_tier`를 그대로 신뢰하는데(push와 동일), 그 tier의 신뢰 근거는 **정본 validator**가 축에서 파생되지 않은 tier를 거부하는 것이다. `authorization_state: unauthorized` + `consumption_allowed`를 넣으면 validator는 잡고 게이트는 못 잡는다 | **재현**: validator가 `visibility_derivation_mismatch` 보고 | **수정**: `safetyLedgerValidationPath`를 필수 입력으로 받아 `validation_status === "valid"` + 두 ref 동일성을 mint에서 단언. **미러는 유지된다** — push가 동작하는 런이면 `run.ts:1767`이 같은 아티팩트를 이미 valid로 단언했다 |
| **F5 CLOSED** | — | 만료 latch는 모든 내용 읽기 경로가 통과하고 `revoke`가 되돌릴 수 없음을 리뷰어가 확인 |

리뷰어는 §4.2.1의 `min(page, 잔여) = page` 증명을 **독립적으로 재확인**했다(PROOF HOLDS).

**렌즈 A 수정 재검증 = 각 수정을 되돌려 스위트가 잡는지 확인 → 7/8 탐지 + 대조군 1건 탐지.**
미탐지 1건은 **F1(브랜드)이며 vitest가 원리적으로 볼 수 없다** — vitest는 타입 검사 없이 트랜스파일한다.

**그 과정에서 자체 공허 테스트 1건 적발**: 처음엔 `@ts-expect-error`를 테스트 파일에 넣었는데,
`tsconfig.json`이 `src/**/*.test.ts`를 **제외**하므로 그 테스트는 **아무것에도 검사되지 않았다**
(브랜드를 지워도 `check:ts-core` green — 실측). 컴파일 타임 성질의 게이트는 타입체커여야 하므로
`scripts/observation-snapshot-nominal-guard.mts`로 옮기고 `tsconfig.scripts.json` include에 등록했다
(그 파일 자신의 헤더가 같은 클래스의 갭을 위해 존재한다고 적혀 있다). **양방향 확증**: 브랜드 있으면
`check:ts-scripts` rc=0 / 지우면 **rc=2 + `TS2578 Unused '@ts-expect-error' directive`**.

**교훈**: 음성 대조를 안 돌렸으면 "브랜드로 막았다 + 테스트도 있다"로 끝났을 자리다. 두 진술이 다
사실이었지만 **그 테스트가 실행되는 게이트가 없었다.**

**게이트**: `check:*` 15 green + 2 rc=1(베이스라인과 동일, gitignored 세션 잔해 2파일 `ignored=yes tracked=no`,
`src/`·`scripts/` 실위반 0 확인) · vitest **221파일 3,777 pass · 1 todo**(단계 1의 220/3,727에서 +50테스트).

### §9.3 단계 3a 착지 기록 (2026-07-27)

**owner 결정(2026-07-27)**: 단계 3을 3a(밀어넣는 층)와 3b(가져가는 층)로 **분리 착지**한다.
토큰 채널은 **codex config `env`**(§5.5 실측 4)로 정한다 — 3b에서 쓴다.

**산출**: 신규 파일은 테스트 하나(`observation-catalog-tool.test.ts`, 7 테스트). 나머지는 배선이다 —
`authoring-prompt-payloads.ts`(캡 제거 모드) · `source-breadth-fold.ts`(`OBSERVATION_CATALOG_TOOL_FOLD_LEVELS`) ·
`direct-call-directive-author.ts`(투영·폴드·가드·공시) · `directive-author-contract.ts`(플래그 + 공시 레코드) ·
`run.ts`(공시 소비) · `authored-artifact-reuse.ts`(재사용 키) · `reconstruct-api.ts`·`settings-chain.ts`(설정 키).

**계약 요약**: `source_observation_catalog_tool: true`면 maturation answer-support 프롬프트가
**소비 승인된 전 관측**을 `one_line` 등급 항해 행으로 싣는다(캡 없음, 상세 없음). 카탈로그 자체가
예산을 넘으면 tail 등급으로만 강등하고(관측은 안 버린다), `anchor`조차 안 맞으면 **dispatch 전에** 실패한다.
OFF는 오늘의 캡 64 + 상세 투영 그대로다.

| done-when | 결과 |
|---|---|
| OFF byte-identical | **두 트리 × 세 코퍼스**로 증명 — `scripts/off-parity-probe.mts`는 신규 플래그를 언급하지 않아 base(`23a00f3`) worktree와 브랜치 양쪽에서 컴파일되고, **실제 dispatch 문자열**(system + 구분자 + user)을 해싱한다. 세 digest(실 코퍼스 `8658b612…` · 500으로 확대해 slice를 때리는 `2575c57f…` · 한 파일 9 region으로 캡을 때리는 `fc9a6126…`) 양쪽 동일. 음성 대조: slice 64→63은 세 digest 전부, **캡 8→7은 region 팔만** 움직인다. 여기에 단위 테스트의 키 순서·policy 값·행 identity 오라클 + 전체 스위트 회귀 0 |
| §1.2 조용한 절단 제거 | OFF는 71개 중 64개만 싣고 `omitted_prioritized_observation_count: 0`(= 안 보임)을 실측으로 재현, ON은 71개 전부 + OFF가 버린 `obs-70` 존재 |
| 강등은 상세만, 폭은 유지 | **등급을 고정해** 두 단계 각각 검증 — 긴 ref+짧은 요약 1,600관측은 `summary_anchor`(요약 생존), 400자 요약 3,000관측은 `anchor`. 둘 다 행 수 유지 · 예산 이하 · 공시 1건 · 공시 바이트 = 실제 측정치. **region 축도 확인** — 한 파일 9 region에서 OFF 8 / ON 9 |
| anchor도 안 맞으면 기동 전 실패 | 4,000관측 × 긴 경로에서 `assertPromptPayloadByteLimit` throw, **dispatch 0회** |

**실 코퍼스 replay**(`scripts/observation-catalog-tool-replay.mts`, LLM 미호출) 5팔: OFF는 실 59관측에서
**1,333,545자 — 워커 천장 1,048,576자 초과**(이 표면이 실제로 런을 죽인다 · 이제 전제를 **단언**한다),
ON은 **35,096 B(38× 작음)**에 전 관측 제공. 실 행 500개 복제 시 OFF는 64개만 싣고 누락 카운터는 **0을 보고**
(§1.2 결함을 실데이터로 재현), ON은 500개 전부를 고정 등급에서 예산 이하로. **팔 E = 실 원장 소비 게이트**:
게이트 집합 59 → ON 59, 한 행을 `no_prompt_use`로 바꾸면 **그 관측이 카탈로그에서 사라진다**(58, id 부재) —
전건 승인 원장 단독으로는 공허하므로 붙인 대조다.

**변이 9종 → 9 탐지**(모드 플래그 무시 · 캡을 계속 적용 · 사다리 시작을 `full`로 · 바이트 가드 제거 ·
공시 제거 · 공시 표면 오귀속 · 캡 값 오보고 · OFF policy 문구 드리프트 · 강등 없어도 공시).

**변이가 잡은 결함 1건**: 사다리 시작을 `full`로 되돌리는 변이가 **거짓 공시**를 만들었다 —
투영기는 `full`을 요청받아도 one_line 행을 돌려주므로 폴드가 `fold_level: "full"`이라고 **없던 등급을**
기록한다. 테스트는 잡았지만(공시 대조) 원인이 아니라 증상을 잡은 것이라, 투영기가 구현하지 않은 등급에
대해 **fail-loud**하도록 고쳤다. 재실행하니 같은 변이가 5개 테스트를 명시적 에러로 실패시킨다.

**교차검증**(codex `gpt-5.6-sol`/xhigh, hermetic read-only, 주장 6개 적대 공격): **5건. 2건 수정, 1건 주장 정정,
2건 경계 명시.** 리뷰어가 `C2`(전 관측 제공)·`C3`(조용한 드롭 없음)·`C5`(재사용)를 반박했다.

| 발견 | 재현 | 처분 |
|---|---|---|
| **F1 high** — ON에서도 `capProjectedRegionsPerFile`이 걸린다. 한 파일의 region 관측 9개 중 **8개만** 나가고, 누락 카운터는 0이며, 인용 게이트가 9번째 인용을 거부한다. **그리고 내 테스트는 이 경로에 공허했다** — fixture의 모든 관측이 서로 다른 `source_ref`를 갖는다 | **재현**: `catalogTool=true in=9 out=8` | **수정**: catalog-tool 모드에서 region 캡을 **해제**했다. 그 캡의 근거는 64 슬롯 경쟁인데 슬롯이 없어지면 근거가 사라지고 **바로 그 §1.2 결함이 region 축에서 재발**한다. region 형제 9개 테스트 추가(OFF 8 / ON 9 대조) |
| **F2 medium** — 플래그를 뒤집고 resume하면 "재생성"이 아니라 `resume provenance mismatch`로 **실패**한다 | 확인(`authored-artifact-reuse.ts:458-464`) | **주장 정정**: 성질은 "다른 모드의 산출물을 재사용하지 않는다"이고 그 강제 방식은 **fail-loud**다. 안전한 방향이며 `source_breadth_fold`와 동일 메커니즘 |
| **F3 medium** — 강등 공시는 저작이 **실패하면** 유실된다(push는 dispatch 전, drain은 저작 성공 후, 다음 런이 sink를 비운다) | 확인(`run.ts:1221`·drain 위치) | **경계 명시**: admission 표면과 동일한 형태다. 저작이 죽은 런은 산출물이 없으므로 "LM이 무엇으로 골랐나"의 공시 대상도 없다. 고치려면 저작기에 sessionRoot를 통과시켜야 하고 3a 범위 밖 |
| **F4 low** — `summary_anchor` 공시 문구가 **틀렸다**. 그 등급은 `summary`를 유지하고 중복 `location`만 버리는데 메시지는 항상 "요약을 버렸다"고 말했다 | 확인(`SOURCE_BREADTH_FOLD_TAIL_RUNG_KEYS`) | **수정**: 문구를 사다리 소유 모듈로 옮겨 등급별로 파생(`breadthFoldRungDetailLoss`) + 등급별 문구가 서로 다르고 키 선언과 일치하는지 테스트 |
| **F5 low** — `measured_prompt_bytes`가 `codexCombinedPrompt` 구분자 **7자**를 안 센다 | 확인(산술 정확) | **미수정·경계 명시**: `promptPayloadByteCount`는 세 표면이 공유하는 측정 규약이고, 예산이 천장보다 ~8 KiB 낮은 이유가 바로 이 구분자+codex 프레이밍이다. 여기만 바꾸면 나머지 두 표면과 갈린다 |

**수정 후 변이 11종 → 11 탐지**(기존 9 + region 캡 재적용 + 두 tail 등급이 같은 문구).
**교훈: 내 fixture가 한 축에서만 다양했다** — 모든 관측에 서로 다른 `source_ref`를 준 탓에 region 축이
통째로 미검증이었고, "전 관측"이라는 문장은 그 축에서 거짓이었다.

#### 2차 교차검증 — 렌즈 2벌 병렬 (2026-07-27)

같은 렌즈를 반복하면 같은 맹점을 공유하므로 **서로 다른 렌즈 2벌**을 병렬로 돌렸다.
렌즈 A = "수정이 정말 구멍을 닫았는가 · 같은 결함 클래스가 다른 곳에 있는가"(`gpt-5.6-sol`/max) ·
렌즈 B = "산술·오라클·테스트 스위트 자체"(`gpt-5.6-sol`/xhigh). **A 3건 · B 8건. 4건 수정, 5건 경계 명시,
2건은 선행 정정과 동일.** 두 렌즈가 **독립적으로 F3(강등 공시 유실)을 재확인**했고 — 서로 다른 경로로 —
1차의 "경계 명시" 처분을 뒤집었다.

| 발견 | 재현 | 처분 |
|---|---|---|
| **B4 medium — 내 테스트 오라클이 개수만 봤다.** 리뷰어가 살아남는 구체 결함을 지목: ON 투영을 `rows.map(() => rows[0])`로 바꾸면 **개수·id 목록·키 모양·크기·강등·오버플로우가 전부 green**인데 항해 행 하나만 남는다 | 변이 M12로 재현 | **수정**: 행 단위 identity 오라클(`expectRowsMatchObservations`) — 행의 id 순서·값이 아티팩트와 일치하는지. **그 오라클이 내 기대값을 먼저 반박했다**(카탈로그 순서는 prioritized 우선인데 나는 아티팩트 순서로 적었다) → 순서 규칙을 fixture에서 재도출하는 함수로 고정 |
| **A3·B3 medium — 강등 공시가 저작 실패 시 유실된다.** 렌즈 A는 resume 경로(아티팩트 기록 후 drain 전 종료), 렌즈 B는 저작 실패(malformed 응답 2회) 경로로 같은 곳에 도달했다 | 확인(push는 dispatch 전, drain은 성공 후, 다음 런이 sink를 비움) | **수정(1차 처분 철회)**: drain을 `finally`로. 저작 실패가 바로 "카탈로그가 강등됐다"가 진단인 경우다. **남는 창**: 아티팩트+provenance 기록과 drain 사이의 하드 킬 — 그 세션의 이전 런이 남긴 이벤트가 없으면 복구 불가 |
| **B8 medium — production 배선이 변이에 무방비.** `const sourceObservationCatalogTool = false`(Core API)와 재사용 키 `false` 하드코딩이 **커밋된 테스트 전체를 통과**한다 — 작성자-레벨 테스트는 작성자를 직접 만들기 때문 | 변이 M13·M14로 재현 | **수정**: ①settings 키가 체인을 통과하는지(정규화 테스트) ②Core API가 키를 읽고 **두 작성자 모두**에 전달하는지 ③실제 `authoredArtifactReuseMatch`로 ON/OFF 키가 갈리고 **나머지가 전부 동일**한지 |
| **B5 low — 문구 테스트가 run.ts 통합을 증명하지 않는다** | 확인 | **수정**: 호출부가 헬퍼를 쓰는지 + 하드코딩 문구 부재를 구조 테스트로(변이 M15가 잡는다) |
| **B6 medium — 두 트리 parity 증명이 부실하다.** `userPrompt`만 해싱해 system prompt 변경이 안 보이고, 코퍼스가 하나(59 < 64)라 **slice도 region 캡도 미측정** | 확인 | **수정**: 해시를 **실제 dispatch 문자열**(system + 구분자 + user)로. 팔 3개(실 코퍼스 · 500으로 확대 = slice · 한 파일 9 region = 캡). 음성 대조: slice 64→63은 세 digest 전부, **캡 8→7은 region 팔만** 움직인다 |
| **B7 medium — replay에 거짓 통과 경로들.** `offOverCeiling`이 출력에만 쓰이고, 행 id를 안 보고, policy 카운트를 안 보고, 바이트가 dispatch 문자열이 아니었다 | 확인 | **수정**: 전제를 **단언**으로(천장 미달이면 FAIL) · 행 identity 오라클 · policy 카운트 단언 · dispatch 문자열 측정 + **신규 팔 E**: 실 원장으로 소비 게이트를 통과시켜 ON 카탈로그 = 게이트 집합임을 확인하고, **한 행을 `no_prompt_use`로 바꾸면 그 관측이 카탈로그에서 사라지는** 대조까지(전건 승인 원장 단독으로는 공허하므로) |
| **B1 medium — byte 예산 vs char 천장.** 다중바이트 페이로드는 provider가 받을 것을 우리가 거부한다(CJK 경로 2,661행 = 1,040,549 B이지만 614,796자) | 산술 확인 | **미수정·주석 정정**: 방향은 안전(early-refuse)하고 단위를 고치면 **세 표면이 함께 바뀐다**. 다만 "codex도 거부할 것만 거부한다"는 기존 주석이 다중바이트에서 거짓이므로 그 문장을 실측과 함께 정정했다 |
| **A1 medium — 재사용 키가 투영 코드를 해싱하지 않는다.** 수정 전 빌드가 authored한 ON 세션을 resume하면 고쳐진 투영기가 안 돌고 옛 원장이 재사용된다 | 확인 | **미수정·경계 명시**: 저장소 전역의 기존 성질이다(어떤 투영 코드도 키에 없다). 이 키는 **OFF로 출하**되므로 released ON 아티팩트가 존재할 수 없고, 재현 조건은 "미출하 중간 커밋이 만든 세션의 resume"이다 |
| **A2 medium — "durable" 주장이 과하다.** 상태 이벤트 sink는 자기 쓰기 오류를 **의도적으로 삼킨다**(`appendRuntimeStreamEventSync`: "Observation is operational; it must never affect pipeline execution") | 코드 확인 | **주장 정정**: 공시는 **best-effort**다. sink의 불변식을 바꾸는 것은 이 단계 범위 밖 |
| **B2 low — `measured_prompt_bytes`가 구분자 7자 미포함** | 리뷰어가 천장 안전성까지 독립 확인 | 1차와 동일 처분(경계 명시). 단위 규약이 세 표면 공유 |

**수정 후 변이 17종 → 17 탐지**(기존 11 + 행 복제 · Core API 무시 · 재사용 키 하드코딩 · 문구 하드코딩 ·
`finally` 제거 · 카탈로그 순서 교환). 리뷰어가 "이 변이는 green으로 남는다"고 지목한 3종 전부 이제 잡힌다.

**교훈 2건**
- **개수 오라클은 내용 오라클이 아니다.** 개수·id 목록·키 모양을 다 검사해도 "행이 그 관측인가"를 안 보면
  N개 복제가 통과한다. 그리고 그 오라클을 넣자 **내 기대값이 먼저 틀렸다** — 검사를 강화하면 코드가 아니라
  내 가정이 먼저 반박되는 일이 흔하다.
- **두 렌즈가 같은 결함에 서로 다른 경로로 도달하면 그것은 경계가 아니라 결함이다.** 1차에서 "sibling 표면과
  같은 형태"라고 경계 처리한 F3을 2차 두 렌즈가 각각 resume·저작실패 경로로 재확인했고, 처분을 수정으로 뒤집었다.

#### 3차 교차검증 — 렌즈 2벌 병렬 (2026-07-27)

렌즈 C = "material 결함이 남아 있는가"(`gpt-5.6-sol`/max, 전체 diff) · 렌즈 D = **2차가 추가한 수정 자체를
공격**(`gpt-5.6-sol`/xhigh, 2차 diff 한정). **C 2건 · D 7건. 6건 수정, 1건 실측으로 프레이밍 정정,
2건 범위 명시.** 렌즈 D가 **2차 수정이 만든 결함 1건**을 잡았다.

| 발견 | 재현 | 처분 |
|---|---|---|
| **D3 medium — `finally`가 거짓 공시를 낸다(2차 수정이 만든 결함).** 작성자가 공시를 push한 뒤 바이트 가드가 throw하면, dispatch는 0회인데 `finally`가 "모든 관측이 선택 가능했다"를 기록한다 | 내 기존 테스트 fixture(4,001관측·긴 ref)가 그대로 재현 조건 | **수정**: push를 **가드 통과 후로** 옮겼다. 이제 공시가 존재한다 = 그 페이로드가 나갔거나 dispatch에서 죽었다. 변이 M18(순서 되돌리기)이 잡는다 |
| **C2 medium — 정책 문구가 등급을 반영하지 않는다.** `anchor`에서 summary가 없는데 정책은 항상 "(id, source_ref, summary)"라고 워커에게 말한다 — 맥락이 가장 적을 때 **거짓 입력 계약**을 준다 | 3,001관측 fixture가 `anchor`를 고르고 정책은 그대로 | **수정**: 정책을 **등급의 함수**로(`navigationRowFieldsForLevel`). 폴드의 `measure`가 등급을 받아 각 등급이 실제로 보낼 텍스트로 측정한다 |
| **D1 medium — 순서 오라클이 한 카테고리만 모델링했다.** 실제 규칙은 hint→requested→member→cross이고 fixture가 전부 단일 카테고리라 **우연히 일치**했다 | 확인 | **수정**: 오라클이 네 카테고리를 재도출 + 네 카테고리를 모두 채운 fixture 테스트 추가(손으로 쓴 기대 순서와 오라클이 동시에 일치해야 한다) |
| **D2 medium — 행 identity 오라클이 `location`을 안 봤다.** region 형제는 `location`만이 구별자인데, 한 region의 location을 전 행에 복사해도 통과한다 | 확인 | **수정**: 네비게이션 키 전부 비교 + ON 행은 **정확한 키 집합**까지(상세가 되돌아오지 못한다) |
| **D5 medium — parity probe가 `codexCombinedPrompt`를 재구현했다.** 복사한 구분자는 두 트리에서 자기와 일치하므로 production 조립이 바뀌어도 digest가 안 움직인다 | 확인 | **수정**: 정본 헬퍼를 **import**(base 커밋에도 존재). 음성 대조로 구분자 변경이 **세 digest 전부**를 움직이는 것 확인 |
| **D6 medium — probe의 region 행이 producer 모양이 아니라 캡의 랭킹이 미측정이었다**(`region_role`·`region_line_start` 부재 → 전부 fallback 동률) | 확인 | **수정**: producer 모양으로 스탬프하고 declaration을 마지막에 둔다. 음성 대조 2종(role tier 제거 · line-start 역전)이 **region 팔만** 움직이는 것 확인 |
| **D7 medium — replay 팔 E가 production 배선을 증명하지 않는다**(스크립트가 미리 걸러 넘긴다) + tier만 바꾼 원장은 정본 validator가 거부한다 | 확인 | **수정**: 팔 E의 주장 범위를 정직하게(게이트 함수 + 작성자 충실도) 다시 쓰고, **누락된 이음매를 별도 테스트로** 고정(run.ts가 `promptSourceObservations`를 넘기는지) |
| **D4 medium — 배선 테스트가 어휘적이라 각각 실제 결함을 놓친다** | 확인 | **부분 수정**: ①문구는 **문장 전체**를 사다리 모듈 함수로 옮겨 "헬퍼를 부르고 딴 문장을 쓴다"가 표현 불가가 됐다(단위 테스트 추가) ②Core API 테스트를 "**모든** 생성이 전달한다"로 조여 세 번째 OFF 작성자를 막았다 ③`finally`·이음매는 여전히 구조 테스트이며 **그 한계를 테스트 본문에 적었다** |
| **C1 high — ON이 하류 판정 프롬프트의 오버플로우를 새로 도달 가능하게 한다.** `writeAnswerSupportJudgment`가 인용된 관측을 **상세와 함께** 재투영하는데 캡·폴드·가드가 없다 | **실측으로 프레이밍 정정**(replay 팔 F 신설) | **미수정·실측 기록**: 실 59관측 코퍼스에서 **OFF도 ON도 1,328,185자로 천장을 넘는다** — 59 ≤ 64라 두 노출 집합이 **동일**하므로 이 오버플로우는 **3a가 만든 것이 아니라 오늘 이미 있다**. 리뷰어의 수치는 캡이 무는 1,000관측 코퍼스 가정이었다. 팔 F는 두 노출을 각각 측정하고 **3a가 소유하는 교차**(OFF는 천장 아래, ON은 위)에서만 FAIL한다. **opt-in 활성화와 단계 5 라이브 런의 하드 블로커**이며 소재는 §9 단계 6 클래스 가드다 |

**수정 후 변이 20종 → 20 탐지**(추가: 공시를 가드 앞으로 · 정책이 등급 무시 · 문장 하드코딩 · run.ts 문구
하드코딩 재-앵커).

**교훈 2건**
- **수정은 새 결함을 만든다.** 2차의 `finally`가 3차에서 거짓 공시로 잡혔다 — 그리고 그 재현 조건은
  **내가 2차에 추가한 테스트 fixture 그대로**였다. 수정 자체를 별도 렌즈로 공격하지 않았으면 남았다.
- **리뷰어 수치도 가설이다.** C1은 실재하지만 "3a가 만들었다"는 프레이밍은 실측에서 틀렸다(실 코퍼스에서는
  OFF·ON 노출이 동일). 그러나 그 실측이 **더 나쁜 사실**을 드러냈다 — 그 표면은 오늘 이미 천장을 넘는다.

#### 4차 교차검증 — 렌즈 2벌 병렬 (2026-07-27)

렌즈 E = "material이 남아 있는가"(`gpt-5.6-sol`/max, 전체 diff) · 렌즈 F = **3차 수정 자체 공격**
(`gpt-5.6-sol`/xhigh, 3차 diff 한정). **E 1건(material) · F 6건(material 1). 두 렌즈가 같은 결함에 수렴했고,
그것은 3차 수정이 만든 것이었다.**

| 발견 | 재현 | 처분 |
|---|---|---|
| **E1 = F1/F3 (수렴, medium) — 3차의 등급-키 정책 문구가 region 행에서 거짓이다.** `projectBreadthFoldTailRung`은 `location`이 `source_ref`와 중복이 **아닌 행에서는 유지**하는데(모든 region 행), 등급으로 키를 정한 문구는 `summary_anchor`/`anchor`에서 `location`을 빼고 말한다. **더 나쁜 것**: 그 거짓 문구가 예산 선택에 참여한다 — 렌즈 E가 2,000 region(고유 location)에서 one_line이 1바이트 초과일 때 `summary_anchor`가 **행은 바이트 동일한데** 문구가 10바이트 짧아서 "강등"으로 통과하고, 공시는 없었던 location 삭제를 주장한다 | 실측 재현(2,000행·locPad 300) | **수정**: 문구를 **행에서 파생**(`navigationRowFieldsFromRows`). 행이 바이트 동일하면 문구도 동일하므로 `summary_anchor`가 공짜로 통과할 수 없고 사다리는 `anchor`까지 간다(실측: `finer_levels_over_budget = ["one_line","summary_anchor"]`). 등급 파라미터가 사라져 `measure(projection, level)`도 되돌렸다 — **잘못 쓸 수 있는 파라미터를 없앤다** |
| **F6 material — 팔 F가 OFF를 손으로 slice했다**(3차가 만든 결함). production OFF는 prioritized 우선 후 slice이므로, 앞쪽에 상세가 큰 행이 있으면 F가 OFF를 "이미 초과"로 분류해 **진짜 ON-단독 교차를 통과시킨다**(리뷰어 구성: 128관측·앞 64 대형 supplemental·뒤 64 prioritized) | 확인 | **수정**: OFF 노출을 **정본 `maturationAnswerSupportPromptCatalog`**로 계산. 게다가 팔 F에 **자기 점검**을 넣었다 — prioritized를 뒤에 둔 코퍼스에서 노출이 prioritized로 시작하지 않으면 FAIL(다시 slice로 회귀하면 팔의 판정이 무의미해진다) |
| **F4 low — "정확한 키 집합" 오라클이 추가 키만 거부했다.** 기대 키를 요구하지 않고, 선택된 등급의 집합이 아니라 전 등급 키의 **합집합**을 썼다 → index 0 이후 행에서 `location`을 빼도 통과 | 확인 | **수정**: 전 행에 대해 `Object.keys(row).sort()`가 **등급의 정확한 집합과 같음**을 요구. 등급별 집합을 테스트에 명시 |
| **F5 low — probe의 region 행에 `heading` 역할이 없다.** production은 `declaration`과 `heading`을 함께 상위 tier로 두는데 probe는 declaration/body만 만들어, tier에서 heading을 빼는 변경이 green으로 남는다 | 확인 | **수정**: heading 행을 추가하고 음성 대조 확인(heading 제거가 region 팔 digest를 움직인다) |
| **F2 — 가드/공시 순서는 옳다**(리뷰어가 3상태 전수 확인: 가드 throw 시 공시 없음 · 가드 후 dispatch 실패 시 공시 있음 · 사이에 throw하는 연산 없음) | — | 확인만 |
| **F3 잔여 — `navigationRowFieldsForLevel`이 detail 등급에 답했다** | 확인 | 함수 자체가 **사라졌다**(행 파생으로 대체) |

**변이 21종 → 21 탐지**(추가: 등급-키 정책 문구 복원 = 새 region 테스트 3개가 잡는다).

**교훈**: **수정이 만든 결함이 2라운드 연속 나왔다**(2차 `finally` → 3차 등급-키 문구). 두 번 다
"모델을 하나 더 만든" 수정이었고, 두 번 다 처방은 **모델을 없애는 것**이었다 — 공시를 가드 뒤로(순서
가정 제거), 문구를 행에서 파생(등급 가정 제거), OFF 노출을 정본 함수로(slice 가정 제거).
**수정 라운드마다 그 수정만 공격하는 렌즈를 붙이는 것이 이 트랙에서 세 번 값을 했다.**

#### 5차 교차검증 — 렌즈 2벌 병렬 (2026-07-27)

렌즈 G = 전체 diff(`max`) · 렌즈 H = **4차 수정 자체**(`xhigh`). **두 렌즈가 또 같은 결함에 수렴했고,
또 4차 수정이 만든 것이었다** — 그리고 이번에는 **주 세션이 리뷰가 도는 동안 독립적으로 같은 결함을 찾아
고쳤다**(렌즈 G가 "동시 미커밋 패치가 이 사례를 다룬다"고 명기). material 2건, 둘 다 수정.

| 발견 | 재현 | 처분 |
|---|---|---|
| **G1 = H1 (수렴, medium) — 행 파생 문구가 *합집합*이라 혼합 카탈로그에서 거짓이다.** tail 등급은 `location`을 **행마다** 조건부로 유지하므로(region 행은 유지, whole-file 행은 삭제) 한 카탈로그에 두 모양이 공존한다. 합집합은 없는 필드를 주장하고, 교집합은 있는 필드를 숨긴다 — 둘 다 거짓 계약이다 | 렌즈 G가 1,000 region + 1,000 whole-file로 구성(`anchor` 875,459 B) | **수정**: 문구를 **"모든 행이 가진 것"과 "일부 행만 가진 것"으로 분리**(`…; location on some rows only`). 그 혼합 코퍼스를 테스트로 고정 — 두 모양이 실제로 다른 것을 먼저 단언한 뒤(공허 방지) 계약이 그것을 말하는지 본다. **오라클도 함께 고쳤다**: 한 개의 정확한 키 집합을 전 행에 요구하면 정당한 혼합 모양을 **거짓 실패**시킨다(H2) → `exactKeys` 미지정 시 행별로 검사 |
| **H3 low — 팔 F의 자기 점검이 `offExposure`를 만드는 코드를 지나지 않았다.** 정본 함수를 따로 호출하므로 팔 안의 코드가 slice로 회귀해도 green | 확인 | **수정**: 노출 계산을 **하나의 함수로** 만들어 팔과 자기 점검이 같이 쓴다. 그러자 자기 점검이 **그 함수의 실제 결함을 즉시 잡았다** — 아티팩트 순서로 필터해서 카탈로그 순서를 잃었다 → 카탈로그 id 순서로 map하도록 고쳤다. 회귀 대조: slice로 되돌리면 자기 점검이 FAIL(실측) |
| **H — 폴드 자체는 결함 없음** | 리뷰어 확인 | 측정=디스패치 정합 · 비증가 · 결정론 · region 테스트 상수가 전이를 정확히 고정 · heading 행이 상위 tier를 실제로 지난다 |

**교훈**: **수정이 만든 결함이 3라운드 연속**이고, 세 번 다 "모델을 하나 더 만든" 것이었다(순서 · 등급-키 ·
합집합/slice). 그리고 이번 라운드는 **자기 점검을 공유 코드에 붙이자 그 코드의 결함이 즉시 드러났다** —
검사기를 피검 코드와 같은 경로에 놓는 것이 별도로 재도출하는 것보다 강하다.

**경계(정직)**:
- **3a 단독으로 ON은 제품적으로 완성이 아니다** — 상세를 가져올 층이 없으니 ON은 요약만 남은 프롬프트다.
  키가 default OFF인 이유이고, 승격은 3b 이후 별도 결정이다.
- **재사용 키가 도는 것과 resume이 이어지는 것은 다르다.** 플래그를 뒤집은 채 기존 세션을 resume하면
  `resume provenance mismatch`로 **실패**한다(다른 모드의 산출물을 쓰지 않는다는 성질은 지켜진다).
  모드를 바꾸려면 새 세션이 필요하다.
- **재사용 키는 투영 *코드*를 해싱하지 않는다**(저장소 전역 성질). 이 키가 OFF로 출하되므로 released ON
  아티팩트는 존재할 수 없지만, 미출하 중간 커밋이 만든 ON 세션을 resume하면 고쳐진 투영기가 안 돈다.
- **공시는 best-effort다.** 상태 이벤트 sink는 자기 쓰기 오류를 의도적으로 삼킨다. `finally` drain은
  저작 실패까지 덮지만, 아티팩트 기록과 drain 사이의 하드 킬은 여전히 기록 없이 지나갈 수 있다.
- **하류 판정 프롬프트가 오늘 이미 천장을 넘는다**(실 59관측 전건 인용 시 1,328,185자). 3a가 만든 것이
  아니고(OFF·ON 노출이 이 코퍼스에서 동일) 3a가 고치지도 않는다. **opt-in 활성화와 단계 5 라이브 런의
  하드 블로커**이며, replay 팔 F가 이 숫자를 매번 다시 측정한다.
- **예산은 byte, provider 천장은 char다.** 다중바이트 코퍼스에서 guard가 provider보다 먼저 거부한다
  (안전한 방향). 단위 정정은 이 예산을 공유하는 세 표면 전체의 별건이다.
- **표면 가드는 모드에 게이팅했다.** 항상-켬으로 두면 예산과 천장 사이 좁은 대역에서 OFF 런의 동작이
  바뀌어 byte-identical이 깨진다. 그 대역의 안전망은 PR #265의 dispatch 백스톱이 계속 진다.
- IMPLEMENTATION_MAP.html은 이 트랙 전체가 아직 갱신하지 않았다(단계 1·2도 동일). 3b 착지 때 한 번에.

## §10. 두 초안이 갈린 곳과 종합 판단

| 쟁점 | Codex | Claude | 채택 |
|---|---|---|---|
| 예산 | 새 상수 3개 | **기존 상한의 잔여** | Claude — 개념을 안 늘리고 한 천장으로 증명됨. Codex의 하위 상한(페이지·호출수)은 함께 채택 |
| 세션 결속 | grant + MAC 커서 | **환경에 구워 넣기** | Claude(단순) + Codex의 스냅샷 digest·커서 결속(§2 가변성 때문에 필수) |
| 이름 | `reconstruct_observation_fetch` | `onto_observation_read` | Claude — repo 관례 `onto_*` |
| 결정론 | **사전 재사용 폐기 + 사후 지문** | 밀어넣는 층이 더 결정론적 | 양립. Codex의 처방을 본문으로 |
| D3 충분성 | 불충분, 클래스 가드 필요 | 불충분, 백스톱 병존 필요 | **수렴** → §9 단계 6 |

**수렴한 것(독립 2벌 + 주 세션 초안 = 3벌 일치)**: 좁은 신규 도구 · 항해/상세 분리 ·
세션 식별자를 모델 입력에서 제거 · `인용 ⊆ 조회` 강제 · 워커 도구 표면 제한.

## §11. owner 결정 (반영 완료)

- **D1** 신규 도구 — §4
- **D2** 조회한 id까지 기록 — §7 (명명은 "런타임이 내준 것"으로 정직화)
- **D3** 첫 표면 = answer-support ledger — §9 단계 3. 단 §1.1 정정으로 **처방의 성격이 바뀌었다**
  (개수 축소가 아니라 상세 유계화)
- **D4** 병렬 설계 2벌 + 교차검증 — 수행 완료, §10

## §12. 미해결 (정직)

- ~~큰 페이로드와 함께일 때도 워커 도구가 살아 있는가~~ — **확인 완료(2026-07-27, §5.5 팔 I)**.
  350,000자 프롬프트와 함께 façade 호출이 완주했다.
- ~~codex가 상속 MCP 설정을 완전히 대체할 수 있는가~~ — **확인 완료(2026-07-26)**. 사용자 설정
  서버는 제거 가능, `codex_apps`는 불가 → §5.2로 요구를 개정했다. 출하 차단 조건은 해소됐으나
  **정확 일치 요구는 기각**됐다.
- `codex_apps`·`web.run`·`collaboration.*`이 실제로 어떤 능력을 노출하는가 — **미측정**.
  잔여 위험의 크기를 모른 채 "수용한다"고 적었다. 단계 0에서 열거해 문서화해야 한다.
- 왕복 증가로 인한 실제 지연·호출 수 — 미측정
- 모델이 항해 층만으로 오늘과 동등하게 고르는가 — 단계 5의 목적
- ledger 스키마가 "근거 없음" 결과를 허용하는가 — 최소 1회 조회 요구와 충돌하는지 확인 필요
- **codex가 워커 대화에 tool 교환당·세션당 얼마를 덧붙이는가** — 미측정. §4.2.1의 두 상수
  (`OBSERVATION_READ_EXCHANGE_FRAMING_CHARS=1,024` · `OBSERVATION_READ_SESSION_RESERVE_CHARS=8,192`)는
  보수적 **모델**이지 측정값이 아니다. 단계 5에서 실측한다. **반증 조건**: 실측 프레이밍이 예비를
  넘으면 오버플로우가 codex 내부로 돌아가므로 상수를 올려야 한다.
  **부분 진전(2026-07-27, §5.5)**: 상류 요청의 세션 프레이밍을 실측했다 — codex 자체 51,820자 +
  cwd AGENTS.md 53,047자. 다만 이는 stdin 저울이 아니라 **다음 항목의 가정**에 붙는 숫자다.
  교환당 프레이밍은 여전히 미측정(포획한 것이 첫 턴뿐이다).
- **누적 예산이 codex의 실제 제약과 같은 천장을 쓰는가** — `CODEX_PROMPT_INPUT_CHAR_LIMIT`은 **stdin
  입력** 한계로 실측된 값이고(`input_too_large` 페이로드), 턴이 쌓인 대화에 같은 한계가 적용된다는 것은
  §4.2의 **모델링 가정**이다. 보수적 방향(실제가 더 크면 덜 쓸 뿐)이지만 가정임을 명기한다.
- ~~`--disable shell_tool` 하에서 façade MCP 서버를 등록할 수 있는가~~ — **확인 완료(2026-07-27, §5.5)**.
  등록되고, 호출되며, 토큰은 codex config 경유로만 도달하고, 모델 입력에는 나타나지 않는다.
  **새로 열린 항목**: 승인 지렛대(`default_tools_approval_mode="approve"`)가 워커 배선에 추가돼야 하고,
  토큰을 `env`로 줄지 `args`로 줄지는 단계 3의 결정 사안이다(둘 다 codex의 argv에 남으므로 **동일 사용자의
  다른 프로세스에게는 보인다** — 모델 노출과는 다른 층이다. 세션 파일 0600 + 경로만 넘기는 대안이 있다).
