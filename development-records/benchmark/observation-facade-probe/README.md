# 워커 façade 도달 실측 (관측 카탈로그 도구 단계 3 선행)

설계: [`development-records/design/20260726-observation-catalog-tool-design.md`](../../development-records/design/20260726-observation-catalog-tool-design.md) §5·§12
핸드오프 §2가 요구한 선행 실측이다. **단계 3을 시작하기 전에 답해야 하는 것**: PR #268이 워커에서
사용자 설정 MCP 서버를 전부 지웠는데(`--ignore-user-config`), 범위 제한 façade **하나만** 다시
넣을 수 있는가 · 세션 토큰은 어느 경로로 전달되는가 · 그 토큰이 **모델에게 보이는가**.

- 실행: `ONTO_PROBE_RUN_ID=<id> ONTO_PROBE_ARMS=A,B,C node run-probe.mjs`
- 계측기: `facade-probe-server.mjs` (최소 stdio MCP 서버 — 자기 spawn·요청·토큰 채널을 사이드 로그에 적는다)
- 모델 입력 실측: `capture-model-request.mjs` (codex를 로컬 provider 엔드포인트로 돌려 **실제 요청 본문**을 포획)
- 증거: `runs/20260727T020952/`

측정 조건은 **production 배선 그대로**다(`callCodexCli`, `llm-caller.ts:944-995`):
`exec --skip-git-repo-check --ephemeral -s read-only --ignore-user-config --disable apps --disable shell_tool`.
모델 `gpt-5.6-luna`, effort `low`.

## 결과

| 팔 | 추가 인자 | 결과 |
|---|---|---|
| **A 대조군** | 없음 (façade 미등록) | `SERVERS: NONE` · `SHELL: NO` · façade 프로세스 미기동 |
| **B** | façade 등록 | **서버 기동됨** — `initialize` + `tools/list` 수신(사이드 로그). 모델 자기보고는 `SERVERS: NONE`(자기보고는 신뢰 불가) |
| **C** | B + 호출 지시 | `mcp: onto_probe/... started` → **`user cancelled MCP tool call`**(승인 자동 거부) |
| **D** | C + `default_tools_approval_mode="approve"` | 모델이 **시도조차 안 함**(`FAILED:tool unavailable`) — F에서 플레이크로 판정 |
| **E** | C + `approval_policy="never"` | 여전히 `user cancelled` — 전역 정책은 지렛대가 아니다(exec 기본값이 이미 `never`) |
| **F** | D 반복 | **완료** — 마커 수신. 즉 D는 모델 플레이크였다 |
| **G** | C + 도구별 `tools.<tool>.approval_mode="approve"` | **완료** |
| **H** | C + `default_tools_approval_mode="auto"` | `user cancelled` — `auto`로는 부족하다 |
| **I** | F + **350,000자 프롬프트** | **완료** — 큰 페이로드와 함께여도 도구가 산다(설계 §12 미해결 항목) |
| **J/K** | F + **65,535자 도구 응답** | **완료·무손실** — 본문 5개 마커(0/25/50/75/99%) 전부 수신. J는 양끝만 봤고 K가 내부까지 확인 |

### 확정된 사실

1. **façade는 강화 세트 하에서 등록된다.** `-c mcp_servers.<name>.command/args/env`로 넣으면
   codex가 서버를 띄우고 `tools/list`까지 간다. `--ignore-user-config`는 **사용자 config만** 무시하고
   `-c` 오버라이드는 살아 있다.
2. **`--disable shell_tool` 하에서 MCP 도구 호출은 살아 있다**(F·G·I·J·K). 셸과 MCP는 다른 경로라는
   가정이 실측으로 확인됐다.
3. **승인 지렛대가 반드시 필요하다.** 기본값에서 MCP 도구 호출은 `user cancelled MCP tool call`로
   죽는다(비대화형이라 승인 UI가 없다). 듣는 키는 **`mcp_servers.<name>.default_tools_approval_mode="approve"`**
   또는 도구별 `mcp_servers.<name>.tools.<tool>.approval_mode="approve"`이며, 둘 다 **우리가 등록한
   서버로 범위가 한정된다**(전역 승인 완화가 아니다). `auto`·`approval_policy="never"`는 안 듣는다.
   (유효값 `auto|prompt|writes|approve`는 잘못된 값을 넣어 serde 에러로 열거했다 — LLM 없이 확정.)
4. **우리 `spawn` env는 façade에 상속되지 않는다.** codex가 MCP 자식에게 주는 env는 **10개**
   (`HOME LANG LOGNAME PATH SHELL TERM TMPDIR USER __CF_USER_TEXT_ENCODING` + config로 준 것).
   따라서 토큰은 `mcp_servers.<name>.env.*` 또는 `args`로 전달해야 한다. **둘 다 도달 확인.**
5. **토큰은 모델 입력에 없다.** codex가 상류로 보내는 **실제 요청 본문**을 포획했다(6회, 각 89,049자):
   두 비밀 문자열·façade 스크립트 경로·node 경로 **전부 0회 등장**. `onto_probe`의 유일한 등장은
   내가 쓴 프롬프트 문장이다. 공허하지 않음의 근거: 본문은 비어있지 않고(89,049자) 파싱되며
   프롬프트·지시·도구 선언이 모두 들어 있다.
   **경계**: 첫 턴 요청만 포획했다(가짜 provider라 턴이 이어지지 않는다).

### 부수 발견 — 설계에 영향 있음

- **codex는 MCP 도구를 모델에게 직접 광고하지 않는다.** 도구 목록에 있는 것은 `exec`(V8 격리에서 JS를
  돌리는 도구) · `wait` · `request_user_input` 셋뿐이고, MCP 도구는 그 샌드박스 안에서
  `tools.mcp__<server>__<tool>()` 식별자로 노출되며 `ALL_TOOLS`로 찾게 되어 있다. 즉 **모델이 façade를
  발견하도록 우리 프롬프트가 이름을 알려주는 편이 확실하다**(F·G·I·J·K가 그 방식으로 성공했다).
- **`exec` 설명에 `max_output_tokens` 기본 10,000 토큰이 적혀 있다.** 65,535자 응답이 무손실로 온
  것은 모델이 샌드박스에서 프로그램적으로 훑었기 때문일 수 있다 — 페이지 내용이 모델 맥락에
  그 크기 그대로 들어간다는 뜻은 아니다. 누적 예산 회계는 **더 많이 과금하는 방향**이므로 천장은
  안전하지만, 단계 5에서 볼 것은 "모델이 실제로 무엇을 읽었나"다.
- **세션 프레이밍이 설계 상수보다 훨씬 크다.** 첫 요청 89,049자의 내역:
  도구 선언 12,342 · codex 지시 18,088 · 권한 지시 21,390 · **cwd의 AGENTS.md 53,047**(!) · 우리 프롬프트 146.
  설계의 `OBSERVATION_READ_SESSION_RESERVE_CHARS = 8,192`는 이 숫자들과 자릿수가 다르다.
  단, 설계가 모델링하는 천장은 **stdin 한계**이고 이 프레이밍은 codex가 상류로 보내는 쪽이라
  같은 저울이 아니다 — 설계 §12가 "같은 천장인가"를 가정으로 명기한 바로 그 지점이며,
  이 측정이 그 가정에 처음으로 숫자를 붙인다.
- **모델이 도구를 안 부르는 일이 실제로 일어난다.** 동일 배선 2회(D·F) 중 1회는 호출을 시도조차 하지
  않고 "tool unavailable"이라고 답했다. luna/low에서의 관측이고 실사용 좌석은 더 강하지만,
  설계 §8의 "모델이 도구를 안 씀 → 계약 거부"는 이론적 경우가 아니다.

## 재현

```
ONTO_PROBE_RUN_ID=$(date +%Y%m%dT%H%M%S) ONTO_PROBE_ARMS=A,B,C,F,G,H,I,K node run-probe.mjs
ONTO_PROBE_RUN_ID=<same> node capture-model-request.mjs
```

각 팔은 자기 사이드 로그를 지우고 시작하므로 "서버가 안 떴다"와 "이전 실행 잔해"가 구별된다.
