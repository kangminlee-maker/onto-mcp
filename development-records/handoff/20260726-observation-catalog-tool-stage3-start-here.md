# 관측 카탈로그 도구 — 단계 3 착수 안내 (2026-07-26 · 3a 착지 후 2026-07-27 갱신)

> **다음 세션은 여기서 시작한다.** 설계 SSOT: [design/20260726-observation-catalog-tool-design.md](../design/20260726-observation-catalog-tool-design.md)
> 이전 안내(단계 2): [20260726-observation-catalog-tool-stage2-start-here.md](20260726-observation-catalog-tool-stage2-start-here.md) — 상시 제약은 여전히 유효하다

## 0. 지금 어디인가

```
브랜치  feat/observation-grant-stage2  (미푸시 · owner 승인 전 push/PR 금지)
설계    승인 완료 · 단계 0a·0b·1·2 완료 · 선행 실측 완료(§2) · 단계 3a 완료
        교차검증 7라운드 → **material 0**(설계 §9.3). 커밋 6개(10fbf05 3a · 이후 5개 리뷰 반영)
다음    단계 3b — 가져가는 층 배선(façade + 토큰 + 인용⊆조회). owner 결정 2건은 §3에 반영됨
차단    **opt-in 활성화 전에 하류 판정 프롬프트를 유계로 만들어야 한다** — 아래 §6
```

| 단계 | 상태 | 착지 |
|---|---|---|
| 0a 잔여 표면 능력 열거 | 완료 | 설계 §5.3 |
| 0b 워커 도구 표면 차단 | 완료 | PR #268 |
| 1 순수 아티팩트 리더 | 완료 | main `3178127` (PR #269) · 설계 §9.1 |
| **2 세션 결속 + 누적 예산 + 소비 게이트** | **완료** | 브랜치 `feat/observation-grant-stage2`(미푸시) · 설계 §9.2 |
| **3a 밀어넣는 층**(카탈로그 고정·캡 제거·기동 전 실패) | **완료** | 브랜치 `feat/observation-grant-stage2` · 설계 §9.3 |
| **3b 가져가는 층**(façade·토큰·인용⊆조회) | **다음** | — |
| 4 감사 + 사후 지문 | 대기 | — |
| 5 실측(59파일 벤치 완주) | 대기 | — |
| 6 클래스 가드 | 대기 | — |

## 1. 단계 2가 남긴 표면 (단계 3이 기대는 것)

`src/core-runtime/reconstruct/observation-read-grant.ts` — inert(런타임 소비자 0).

```ts
new ObservationReadGrantRegistry({ now? })          // 런타임이 프로세스당 1개 보유
  .mint({ sources, systemPrompt, userPrompt, ttlMs, pageCharBudget? })
      -> { token, receipt }                          // token = 워커 환경에 구워 넣을 값
  .serve({ token, request })  -> ObservationReadPage  // request = {observation_ids[1..16]} XOR {cursor}
  .revoke(token)                                     // 워커 종료 시
  .receipt(token) -> ObservationReadReceipt           // 회수·만료 후에도 읽힌다(감사용)

sources = { observationsPath, safetyLedgerPath, safetyLedgerValidationPath }
          // 내용이 아니라 경로 — serve마다 다시 읽는다. mint가 문자열을 복사하므로 나중에 못 바꾼다
          // 검증 아티팩트는 mint에서 validation_status === "valid" + 두 ref 동일성까지 단언한다
systemPrompt / userPrompt = dispatch가 보낼 두 조각   // codexCombinedPrompt로 합쳐 길이를 잰다
천장 = CODEX_PROMPT_INPUT_CHAR_LIMIT import           // 파라미터 아님 — 호출자가 선언할 수 없다

OBSERVATION_READ_PAGE_CHAR_BUDGET      65_536
OBSERVATION_READ_MIN_PAGE_CHAR_BUDGET   4_096   (실측 하한 — 그 아래는 누적 상한이 깨진다)
OBSERVATION_READ_MAX_CALLS             32       (상수 — 총량에서 도출하면 문자 가드가 죽는다)
OBSERVATION_READ_EXCHANGE_FRAMING_CHARS 1_024   (미측정 보수 상수 — 단계 5에서 실측)
OBSERVATION_READ_SESSION_RESERVE_CHARS  8_192   (같음)
OBSERVATION_READ_MAX_ID_CHARS          128      (실패 메시지 크기를 묶기 위한 입력 상한)
```

**단계 3이 넘길 것은 `run.ts`가 이미 전부 들고 있다**: `preparationRefs.source_observations` ·
`sourceSafetyLedgerPath` · `sourceSafetyLedgerValidationPath`(`run.ts:1756-1766`), 그리고
`callCodexCli`의 `systemPrompt`/`userPrompt` 파라미터. **새로 만들거나 계산할 값이 없다.**

**게이트는 스냅샷 생성자 안에 있고, 스냅샷 타입은 nominal이다.** `fixObservationSnapshot(text, ledger)`가
유일한 생성자이고 `ObservationSnapshot`은 모듈-private 브랜드를 갖는다 — 손으로 쓴 객체 리터럴은
타입이 거부한다(게이트 = `check:ts-scripts`, `scripts/observation-snapshot-nominal-guard.mts`).
단계 3이 실수로 우회할 코드를 **작성할 수 없다**.

**receipt가 §3의 `조회` 항이다.** 인용 검증(`인용 ⊆ 조회`)은 `receipt.served`를 쓴다.

## 2. 선행 실측 — **완료(2026-07-27)**. 결과가 단계 3의 배선을 바꾼다

증거·재현: `benchmark/observation-facade-probe/` · 설계 반영: §5.5. 11팔 전부 production 배선 + 대조군.

| 질문 | 답 |
|---|---|
| 강화 세트 하에서 façade가 등록되는가 | **된다.** `-c mcp_servers.<n>.command/args/env` — `--ignore-user-config`는 사용자 config만 무시한다 |
| `--disable shell_tool`에서 MCP 호출이 사는가 | **산다** |
| 토큰이 `spawn` env로 상속되는가 | **안 된다.** codex가 MCP 자식에게 주는 env는 10개뿐 → `mcp_servers.<n>.env.*` 또는 `args`로만 도달(둘 다 확인) |
| 토큰이 모델에게 보이는가 | **안 보인다.** 상류 요청 본문 포획(6회 × 89,049자)에서 비밀·경로 **0회**. 단 첫 턴만 포획 |
| 큰 페이로드와 함께여도 사는가 | **산다**(350,000자 프롬프트) |
| 페이지 크기 응답이 온전한가 | **온전하다**(65,535자, 0/25/50/75/99% 마커 전수) |

**단계 3이 새로 져야 할 것 3가지**

1. **승인 지렛대가 필수다.** 기본값에서 MCP 호출은 `user cancelled MCP tool call`로 죽는다.
   듣는 키는 `mcp_servers.<n>.default_tools_approval_mode="approve"`(또는 도구별 `tools.<t>.approval_mode`)
   **뿐**이고 — `auto`도 `approval_policy="never"`도 안 듣는다 — **우리가 등록한 서버로 범위가 한정된다.**
2. **프롬프트가 façade 이름을 알려줘야 한다.** codex는 MCP 도구를 모델에게 직접 광고하지 않는다.
   요청에 실리는 도구는 `exec`(V8 격리 JS)·`wait`·`request_user_input` 셋뿐이고 MCP 도구는 그 안에서
   `tools.mcp__<server>__<tool>()`로 노출된다. 성공한 팔은 전부 프롬프트가 이름을 준 경우다.
3. **토큰 채널 결정이 남는다.** `env`·`args` 둘 다 **codex의 argv에 남으므로** 같은 사용자의 다른
   프로세스에게는 보인다(모델 노출과는 다른 층). 대안 = 세션 파일 0600 + 경로만 넘기기.

**정직한 경계**: 동일 배선 2회 중 1회는 모델이 호출을 시도조차 안 했다(luna/low). 설계 §8의
"모델이 도구를 안 씀 → 계약 거부"는 이론적 경우가 아니다.

## 3. 단계 3 — owner 결정 2건(2026-07-27)과 남은 일

**결정 ①: 3a / 3b 분리 착지.** **결정 ②: 토큰 채널 = codex config `env`**
(`-c mcp_servers.<n>.env.<KEY>=<token>`).

### 3a — 완료. 설계 §9.3

opt-in 키 **`reconstruct.execution.source_observation_catalog_tool`**(default OFF). ON이면
answer-support 프롬프트가 소비 승인된 **전 관측**을 `one_line` 항해 행으로 싣고(캡 없음·상세 없음),
카탈로그가 예산을 넘으면 tail 등급으로만 강등하며, `anchor`조차 안 맞으면 dispatch 전에 실패한다.

3b가 기대는 표면:
- `src/core-runtime/reconstruct/direct-call-directive-author.ts` `writeAnswerSupportLedger` —
  `observationCatalogTool` 분기가 이미 있다. 3b는 **같은 분기 안에서** façade를 켜고 프롬프트에
  도구 사용법을 준다.
- `args.sourceObservationCatalogTool` — 작성자 생성 인자. `reconstruct-api.ts`가 두 작성자
  (주·fallback) 모두에 넘긴다.
- `sourceBreadthFoldDisclosures`는 이제 `{surface, disclosure}` 레코드다.
- 재사용 키에 `source_observation_catalog_tool` 필드가 있다 — 3b가 프롬프트를 바꿔도 키는 이미 돈다.

### 3b — 다음. 가져가는 층

façade 등록(+ **승인 지렛대** §2) + 토큰(config `env`) + 프롬프트에 도구 이름·사용법 + `인용 ⊆ 조회` 검증.
`인용 ⊆ 조회`는 `receipt.served`를 쓰고, 이미 있는 `promptObservationIdSet` 게이트
(`direct-call-directive-author.ts:3349` 부근, "인용 ⊆ 카탈로그")와 **직렬로** 놓는다 — 그 게이트를
바꾸지 않는다(설계 §3: 기존 경로를 한 줄도 바꾸지 않는다).

done-when(설계 §9): 조회 안 하면 실패 / A 조회 후 B 인용하면 실패 / **OFF는 byte-identical**.

**3a에서 실제로 밟은 것 3가지**

1. **내 fixture가 한 축에서만 다양했다.** 모든 관측에 서로 다른 `source_ref`를 준 탓에 **region 축이
   통째로 미검증**이었고, 교차검증이 그 축에서 "전 관측 제공" 주장을 반박했다(한 파일 9 region → 8개만
   나감). catalog-tool 모드에서 region 캡을 해제하고 OFF/ON 대조 테스트를 넣었다.
   **"전부"라고 쓰기 전에 fixture가 몇 개의 축에서 다양한지 세어라.**
2. **변이 배터리가 거짓 공시를 잡았다.** 사다리 시작을 되돌리면 투영기가 `full`을 요청받고도 one_line
   행을 돌려줘 폴드가 없던 등급을 기록한다. 구현하지 않은 등급에 **fail-loud**하도록 고쳤다.
   **투영기가 인자를 조용히 무시하면 그 위의 공시는 거짓말이 된다.**
3. **공시 문구를 호출부에 쓰면 사다리와 어긋난다.** `summary_anchor`는 `summary`를 남기는데 문구는
   "요약을 버렸다"고 말했다. 문구를 사다리 소유 모듈로 옮겨 등급에서 파생시켰다.

## 4. 이번에 실제로 밟은 함정 (단계 2)

**① 승인된 설계에 우회 경로가 있었다 — 배선 직전에 발견됐다.** push 경로는 fail-closed 소스-안전성
게이트를 지나는데(`sourceObservationsForPrompt`, 프롬프트 표면 25곳 전부) 단계 1의 리더는 **디스크 원본**을
읽는다. 그대로 배선하면 두 번째 문이 된다. 설계 §3에 항목이 없었다. **owner 판단으로 단계 2에 접었다** —
검증이 아니라 **구성**으로(grant를 만드는 유일한 경로가 원장을 요구하고, 승인 안 된 관측은 스냅샷에
애초에 없다). 교훈: **"다음 단계에서 배선할 때 하자"는 절차적 약속이고, 이 저장소에서 두 번 실패한 방식이다.**

**② 테스트를 다 통과한 상태에서 변이 검증이 설계 결함을 잡았다.** `max_calls = floor(total/perCall)`로
도출하면 `max_calls × perCall ≤ total`이 되어 **문자 가드가 절대 먼저 발화하지 못한다** — 설계가 요구한
두 상한 중 하나가 도달 불가 코드였다. 30 테스트 green이 이걸 못 봤고 변이가 봤다. 호출 상한을 상수로
독립시켜 둘 다 살렸다.

**③ 미탐지 변이를 "테스트 구멍"으로 오진할 뻔했다.** `pageCharBudget = min(page, 잔여)`가 미탐지였는데,
최악치 admission을 통과한 뒤에는 `min(page, 잔여) = page`가 **항상** 성립하므로 관측 가능한 차이가 없다 —
원리적으로 탐지 불가이고 미탐지가 정답이다. 그 대안을 실제로 막는 가드는 admission 쪽이며 그것은 탐지된다.
**미탐지 변이를 보면 먼저 "그 변이가 정말 행동을 바꾸는가"를 증명하라.**

**④ 실 원장이 게이트를 증명하지 못한다.** 실 코퍼스의 `prompt_context` 59행이 **전부 승인**이라
"게이트가 동작한다" 테스트가 실 데이터만으로는 **공허 통과**한다. 실 원장에서 한 줄만 고친 변이 3종을
따로 만들고, **각 변이를 production push 게이트에도 걸어** 진짜 withholding인지 대조했다.
(단계 1의 "실 데이터는 필요조건이지 충분조건이 아니다"와 같은 클래스.)

**⑤ 잘못된 추상을 한 번 만들었다.** 게이트 함수가 처음엔 `ReadonlySet`처럼 생긴 객체를 돌려주는데
`has()`는 observation id를 받고 `values()`는 **row id**를 돌려줬다. 타입은 통과한다. 후보 id를 인자로 받아
평범한 `Set<observation id>`를 돌려주는 형태로 고쳤다 — **row id와 observation id는 다른 식별자이고,
한쪽을 다른 쪽 자리에 돌려주면 게이트가 조용히 전부 승인/전부 거부한다.**

**⑥ 가드 안의 관대한 비교가 가드를 무력화한다.** `promptInputCharLimit`을 검증하지 않았더니 **NaN 천장에서
무제한 서빙**이 됐다 — NaN 비교는 전부 false라 unservable 검사·admission 검사·초과 가드가 **셋 다 통과**한다.
실측으로 65,507자 페이지가 나갔다. 자체 재검토에서 잡았고 교차검증 전이었다. 유계성을 주장하는 코드는
그 유계성이 의존하는 입력을 스스로 검증해야 한다.

**⑦ 내가 쓴 주장이 과했다.** "A의 커서는 B에서 거부된다"고 리뷰 패킷에 적었는데 실측하니 **동일 내용
두 grant 사이에서는 통과**한다(digest가 같으니 당연하다). 해롭지는 않다(받는 토큰이 직접 요청할 수 있는
것뿐 — 위조는 좁힐 수만 있다) 그러나 주장은 정확해야 한다. **리뷰에 내보내는 주장은 먼저 실측하라** —
안 그러면 리뷰어가 내 문장을 반박하는 데 예산을 쓴다.

**⑧ "이 모듈이 유일한 호출자다"는 제약이 아니라 규약이다 — 교차검증이 6건 전부 high로 잡았다.**
게이트를 grant 층에 두고 리더의 ungated 생성자를 export한 채 두면, 미래 배선이 **둘을 짝지어 모든 타입을
만족시키면서** 우회한다. 마찬가지로 `readInputs` 클로저는 `() => cached`로 만족되어 필수 드리프트 검사가
스테일 값 위를 통과했고, 천장은 호출자가 `3_000_000`을 선언할 수 있었다. 처방은 전부 같은 모양이다 —
**잘못 쓸 수 있는 파라미터를 없앤다**(게이트를 생성자 인자로, 클로저를 경로로, 천장을 import로,
프롬프트 길이를 텍스트로). 자체검토가 앞서 NaN 천장을 잡았지만 그건 **검증을 추가한 것**이었고,
파라미터 자체를 없애는 편이 그 검증조차 불필요하게 만들었다.

**⑨ 고치고도 테스트를 안 쓰면 변이가 미탐지로 나온다.** 만료 latch를 코드에서 고친 뒤 변이 배터리에서
M13이 **미탐지**로 떴다 — 역행 시계 테스트를 안 썼기 때문이다. 배터리가 없었으면 "고쳤다"로 끝났을 자리다.

**⑩ 파라미터를 없애는 것과 타입·아티팩트 신뢰를 고치는 것은 다른 일이다 — 2차 교차검증이 6건을 더 냈다.**
1차 수정은 잘못 쓸 수 있는 **파라미터**를 없앴지만, ①타입이 여전히 **구조적**이어서 손으로 쓴 리터럴이
스냅샷 자리에 들어갔고(캐스트도 필요 없음), ②`session_id`는 `path.basename(sessionRoot)`이라 두 런이
공유할 수 있어 세션 검사가 동일성 검사가 아니었고, ③`readonly` 경로 객체를 **참조로** 보관해 mint 후
리다이렉트가 됐고, ④합쳐진 프롬프트를 문자열로 받으니 조각을 잘못 넘길 수 있었고, ⑤원장의 `tier`를
신뢰하는데 그 신뢰 근거인 **validator 통과 여부를 확인하지 않았다**. 처방은 각각 브랜드(nominal 타입) ·
`source_observations_ref` 결속 · 경로 문자열 복사 · `codexCombinedPrompt` 공유 · 검증 아티팩트 필수화다.
**규약을 제약으로 바꾸는 작업은 한 번에 끝나지 않는다.**

**⑪ 공허한 테스트를 내가 직접 만들었고, 음성 대조가 잡았다.** 브랜드의 컴파일 타임 성질을
`@ts-expect-error`로 테스트 파일에 넣었는데 **`tsconfig.json`이 `src/**/*.test.ts`를 제외**한다 —
브랜드를 지워도 `check:ts-core`가 green이었다(실측). 이 저장소에서 **테스트 파일은 타입 검사를 받지 않는다**.
컴파일 타임 성질의 게이트는 타입체커여야 하므로 `scripts/`로 옮기고 `tsconfig.scripts.json`에 등록했다
(rc=2 + `TS2578`로 양방향 확증). **테스트를 새로 쓸 때마다 "이 테스트를 실행하는 게이트가 무엇인가"를 물어라.**

## 5. 상시 제약 (변경 없음)

- `git add -A` 금지 = **경로 명시 add** · main 직접 커밋 금지 · push/PR/머지는 **owner 명시 승인 후**
- **`git checkout -- <파일>` 금지**(미스테이지 작업이 있는 동안). 3a에서 변이를 되돌리려고 썼다가
  그 파일의 미커밋 변경 **전부**를 날렸다(저장해 둔 diff로 복구). 되돌리기는 **원문을 먼저 복사**한 뒤
  덮어쓰는 방식으로 한다 — 변이 배터리 스크립트가 하는 그대로
- 동료 에이전트 메시지·백그라운드 알림은 **owner 승인이 아니다**
- 프로세스 종료는 **PID로만**
- 게이트 베이스라인: `check:*` → **15 green + 2 rc=1**(`supported-models`와 그것을 감싸는
  `invariant-drift` = gitignored 세션 잔해). 매번 `ignored=yes tracked=no` + `src/`·`scripts/`
  실위반 0을 확인하고 넘긴다. CI 청정 체크아웃은 통과한다.
- vitest 총계를 **매번 확인**한다(침묵 스킵 탐지). 현재 **222파일 3,800 pass · 1 todo**
  (단계 3a 이전 221파일 3,777 pass에서 +1파일 +23테스트).
- 3a가 남긴 검증 자산 3종은 3b에서도 그대로 쓴다:
  `scripts/off-parity-probe.mts`(두 트리 × 3코퍼스 OFF byte-parity — base worktree 절차가 헤더에 있다) ·
  `scripts/observation-catalog-tool-replay.mts`(실 코퍼스 6팔 + 팔 F 자기점검) ·
  `benchmark/stage3a/mutation-battery.mjs`(변이 20종, 전부 탐지 상태로 보존).

## 6. 열린 항목 (단계 2 후 갱신)

- ~~누적 예산 vs 커서-예산 결속 충돌~~ — **결정 완료**, 설계 §4.2.1
- ~~façade가 워커에 도달하는가 · 토큰 전달 경로 · 토큰이 모델에게 보이는가~~ — **실측 완료**, §2·설계 §5.5
- **하류 판정 프롬프트가 오늘 이미 천장을 넘는다 — opt-in 활성화·단계 5 라이브 런의 하드 블로커.**
  `writeAnswerSupportJudgment`가 인용된 관측을 상세와 함께 재투영하는데 캡·폴드·가드가 없다. 실 59관측
  전건 인용 = **1,328,185자 > 1,048,576**. 3a가 만든 것이 아니다(이 코퍼스에서 OFF·ON 노출이 동일).
  소재는 설계 §9 단계 6 클래스 가드. `scripts/observation-catalog-tool-replay.mts` 팔 F가 매 실행 측정한다
- ~~토큰 채널 선택~~ — **owner 결정: config `env`**(2026-07-27)
- **`exec` 샌드박스의 `max_output_tokens` 기본 10,000 토큰** — 페이지가 모델 맥락에 그 크기로
  들어가는지는 미판정. 누적 회계는 과다 과금 방향이라 천장은 안전하다(설계 §5.5)
- **프레이밍 상수 2개가 실제와 맞는가** — 단계 5. 반증 조건: 실측 프레이밍이 예비를 넘으면 오버플로우가
  codex 내부로 돌아간다
- **누적 예산이 codex의 실제 대화 제약과 같은 천장인가** — `CODEX_PROMPT_INPUT_CHAR_LIMIT`은 stdin 한계
  실측값이고, 쌓인 대화에 같은 값이 적용된다는 것은 모델링 가정이다(보수적 방향)
- `[permissions.<name>.network] enabled=false` — `sandbox_mode`와 상호배타, 별도 평가 필요
- 큰 페이로드와 함께일 때도 워커 도구가 살아 있는가 — 미측정
- ledger 스키마가 "근거 없음" 결과를 허용하는가 — 최소 1회 조회 요구와 충돌하는지 확인 필요
- `web.run`·`collaboration.*`이 `--disable apps` 뒤에도 남는지 — 미측정
- **`run.test.ts:7761`의 주석이 스테일하다** — "sourceObservationsForPrompt deletes content_excerpt for
  redacted observations"라고 적혀 있지만 현 구현은 관측을 통째로 필터링할 뿐 필드를 지우지 않는다.
  단계 2 범위 밖이라 손대지 않았다

## 7. 별건 백로그 (이 트랙과 무관 — 변경 없음)

- **S1/S2 값 측정** — `source_region_decomposition`·`source_admission_selection` 둘 다 default OFF.
- `runReconstruct` 잔여 3,769줄 — Tier 2·3은 **별도 승인 사안**.
- 죽은 코드 12심볼 842줄 — 백로그(권장=보류).
- `run.ts` L309~321 고아 배너 주석 · `check-prompt-projection-parity` 스테일 항목 3개.
