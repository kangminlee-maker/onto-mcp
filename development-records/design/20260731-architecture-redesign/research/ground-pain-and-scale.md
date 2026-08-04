# 연구노트 — 현행 학습 채굴: 실제 고통 지점과 규모 압력

> 재설계 워크플로 산출물 (2026-07-31). 목적: 재설계자가 같은 실수를 반복하지 않게 하는 것.
> 방법: development-records/handoff 최근 15개 + bug/ + debug/ + run.ts 분해 이력 + 규모축 설계 문서를
> 실파일로 읽고, git 이력·실코드로 재확인했다. 설계 문서의 주장은 가설로 취급했고, 코드/기록으로
> 확인된 것과 UNVERIFIED를 구분해 표기한다. 라인 번호는 2026-07-31 `feat/observation-grant-stage2`
> HEAD 기준이며 스테일해진다 — 심볼로 재확인할 것.

---

## 1. 21,576줄짜리 단일 파일은 왜 생겼고 왜 분해됐는가

### 1.1 형성 — 두 달 만에 859 → 21,576줄 (git 실측)

`git log -- src/core-runtime/reconstruct/run.ts`를 샘플링해 각 커밋 시점의 파일 크기를 실측했다:

| 날짜 | 커밋 | run.ts 줄수 |
|---|---|---:|
| 2026-05-27 | `40fe57e` (최초, "material-aware reconstruct happy path") | 859 |
| 2026-06-03 | `61336fb` | **10,379** |
| 2026-06-16 | `bc9bde4` | 12,691 |
| 2026-06-30 | `71dacc8` | 14,747 |
| 2026-07-14 | `2c48c0f` | 18,941 |
| 2026-07-25 | `3c3909f` | 21,523 |
| 2026-07-26 | `1d8a4e1` (추출 중) | 8,436 |
| 2026-07-26 | `3057e8b` (추출 후) | 4,966 |

**첫 일주일에 859 → 10,379줄.** 이후 두 달간 주당 약 1,000줄씩 선형 증가. 커밋 메시지 계열
("direct-call seed workflow" → "top-level concept discovery" → "maturation gates" → "trust validation
gates" → "source scout authority gates" …, 총 146커밋)이 보여주는 형성 기전은 명확하다:
**reconstruct 파이프라인의 모든 신규 단계·게이트·검증·투영이 orchestrator 파일에 직접 누적됐다.**
분리를 미룬 대가가 아니라, 처음부터 "orchestrator가 모든 상태를 지역 변수로 소유하는" 구조의
필연적 결과였다.

### 1.2 왜 그 구조가 자를 수 없는 덩어리가 됐는가 — AST 실측이 말해주는 것

분해 설계(`design/20260726-run-reconstruct-decomposition-design.md`)의 AST 실측
(2026-07-26 HEAD `66587e0`):

- `runReconstruct` 한 함수가 **4,382줄**, 잔류분의 77% (설계 §1)
- 단일 try 블록 4,088줄, 최상위 문장 351개, **한 스코프에 평평하게 누적된 이름 288개** (설계 §2)
- 함수를 파이프라인 단계로 자르려면 각 지점에서 "앞에서 선언되고 뒤에서 쓰이는" 값을 넘겨야
  하는데, 그 수가 **최대 142개**, 중간 구간(300~3,700줄)의 최저점도 23개 (설계 §2.1)
- 반면 "이미 닫혀 있는 블록"의 **출력은 전부 0~1개** — 이 함수는 지역 상태를 읽어서
  **파일(아티팩트)로 쓰는(write-through)** 구조라, 블록이 값을 돌려줄 필요가 없었다 (설계 §2.2)

여기서 나오는 구조적 진단: **상태의 진실이 지역 변수에 있고 아티팩트는 그 사본이다.**
아티팩트(session 파일들)가 이미 write-through로 존재하는데도, 파이프라인 단계 간 인터페이스는
아티팩트가 아니라 288개의 지역 이름이었다. 만약 각 단계가 아티팩트를 읽고 아티팩트를 쓰는
구조였다면 경계통과 값이 142개일 수 없다. 즉 **거대 함수는 "아티팩트가 진실"이라는 자기 선언
(debug/review-invocation-runner.md §3 "runner returns projections derived from artifacts. It does
not create a second truth source")을 reconstruct 쪽에서 지키지 않은 증거다.** review 쪽은 같은
시기(2026-05-28)에 typed runner + 아티팩트 진실 구조로 정리됐고 그쪽엔 21k 파일이 생기지 않았다.

### 1.3 분해가 실제로 치른 비용 — "옮기기"가 아니라 "증명 체계 구축"

1~3차 추출(21,576 → 5,723줄, handoff `20260725-run-ts-extraction-start-here.md` ·
`20260726-run-ts-extraction-3rd-pass-complete.md`)은 순수 이동이었는데도 전용 도구 4종이 필요했다:

- 계획기 `scripts/run-split-plan.mts` — 392 top-level 선언의 의존 그래프·소유권 계산
- 커터 `scripts/run-extract-symbols.mts` — 역방향 import(순환)를 BLOCKER로 거절, `--append` 시
  이름 충돌·조용한 의미 변경 차단 (3rd-pass §1.1, negative control 6종 실측)
- 바이트 동일성 검사기 `scripts/run-extraction-identity.mts` — 최종 MOVED 376 · MODIFIED 0
- 죽은 import 정리기 `scripts/run-dead-import-clean.mts` — 4배치에서 총 59+293개 제거

확인된 유일한 구조적 행운: **392 선언 전부 순환 0(단일 SCC 아님, 위상 정렬 가능)** (1st-pass §2.1).
이게 없었으면 순수 이동 자체가 불가능했다.

그리고 분해 직전 실측된 안전망 공백 (분해 설계 §3.1): `runReconstruct`를 완주시키는 테스트 14회
중 **최종 산출물을 단정하는 것은 2건**. 게이트 17종·vitest 3,689건은 "참조가 맞는가"만 지켰다.
**규모가 커진 orchestrator는 산출물 등가성 증명 없이는 재구조화할 수 없는데, 그 증명이 사후에야
발명됐다** (mock 결정론 경로 스냅샷 + falsifiable 확인 요구, 설계 §5.2).

### 1.4 분해 과정에서 반복 실증된 게이트 붕괴 클래스 — 이번 repo의 가장 비싼 학습 중 하나

**"표면이 쪼개지면, 소스 텍스트를 스캔하는 게이트는 실패하지 않으면서 커버리지를 잃는다."**
같은 유형이 두 번 실측됐다 (1st-pass §0.2-5·§0.2-6):

1. `check:graceful-signal-rethrow`(G11)가 run.ts 한 파일만 스캔 — 1차 추출로 catch 27개 중
   16개가 모듈로 빠져나갔는데도 **green** (run.ts에 11개가 남아 "0이면 실패" 가드 미발화)
2. parity 게이트 4종 + telemetry 가드 1종이 5차 추출에서 표면 이동을 못 따라감

처방으로 정착한 메커니즘: 파일별 비어있음 가드 + **총량 하한**(`MIN_GUARDED_CATCH_TOTAL=28`) +
재조준마다 negative control 2종. "절차 문구"가 아니라 "하한 가드 메커니즘"으로 봉인한 것이
핵심이다 — green이라도 숫자를 확인해야 한다는 교훈이 코드로 내려갔다.

부수 클래스 2종 (3rd-pass §2.2, 1st-pass §0.2-4):
- **vitest 총계를 보지 않으면 침묵 스킵을 놓친다** — 중복 import 파싱 오류로 테스트 12개가
  실행 자체가 안 됐는데 요약은 "1 failed"로만 보임 (총계 3,690→3,678)
- **tsconfig가 테스트를 제외하므로 이동된 심볼을 참조하던 테스트는 tsc green인 채 vitest에서만
  터진다** (4회 연속 재현)

---

## 2. 규모 축(큰 파일 → 여러 파일 → 멀티레포)에서 무엇이 먼저 깨졌는가

owner의 규모축 로드맵: 큰 파일(S1) → 여러 파일(S2) → 멀티레포. 깨진 순서와 원인을 기록으로
재구성하면, **매 단계에서 깨진 것은 "단위(unit)가 크기에 결합돼 있다"는 같은 하나의 결함**이었다.

### 2.1 S1 큰 파일 — 절단이 먼저 깨졌다 (2026-06-16)

`design/20260616-large-input-stage1-design.md`: 단일 문서 투영 예산이 정적 200K 문자 천장이라
모델 윈도보다 작았고, 넘치는 문서는 **후반부가 조용히 잘렸다.** 설계 v5의 교차검증이 잡아낸
결함이 이후 반복될 패턴의 원형이다:

- **C1: `chars/token≈2` 가정은 비보수적** — CJK 밀집 텍스트는 chars/token≈1 이하. 문자 단위
  예산과 토큰 단위 실제 한도의 불일치.
- **C2: overflow 신호가 2층인데 하나로 오인** — capture 절단(`excerpt_truncated`)과 투영 절단
  (`prompt_content_excerpt_truncated`)은 다른 사건인데 done-when이 엉뚱한 신호를 봤다.
- 처방: capture 정적 천장(`DOCUMENT_CAPTURE_CEILING_CHARS = 5_000_000`,
  `materialize-preparation.ts:262` 실확인) vs projection 동적 예산(`…PROJECTION_FLOOR = 200_000`,
  `:269` 실확인) 분리 + 무음 절단 금지(durable 기록).

이어서 관찰 정체성 자체를 **파일 → 구간(region)** 으로 내렸다
(`design/20260722-source-region-decomposition-stage1-design.md` §1): `stableObservationId`가 이미
`sha256(resolve(sourceRef)\nlocation)`을 접고 있어서 **신규 타입 0·신규 id 스킴 0**으로 구간 id가
나왔고, 파일-키를 쓰는 전 지점을 `regionKey` 헬퍼 하나로 통과시킨 뒤 **exhaustiveness 게이트**로
"지점 누락" 실패모드를 봉인했다. 이때 발굴된 잠복 결함이 교훈적이다:
- `observationsBySourceRef`의 `Map(resolve(ref)→obs)`가 **last-wins silent-drop** (§5-A4)
- `run.ts:1713`(당시) `path.resolve(observation.location)` — location이 앵커가 되는 순간
  `path.resolve("L128-210")` → CWD 의존 → **reuse 키 비결정·replay 파괴** (§5 누락지점).
  repo 전체에서 location을 path-resolve하는 유일 지점이었다.

### 2.2 S2 여러 파일 — 합산 무계(unbounded sum)가 깨졌다 (2026-07-23)

가치 벤치가 실 코퍼스(openai-node src/ 59파일)를 넣자마자:
**directive flat 투영 1.35MB > codex stdin 1MiB → 즉사**
(handoff `20260723-deterministic-recursive-observation-design-start-here.md` §1).
per-file cap과 excerpt limit은 있었지만 **파일 수 곱은 무계**였다 (§3). 단순 fixture는 이걸 못
잡았고 실 이종 코퍼스가 잡았다 (MEMORY 동일 결론).

처방 2단: (a) always-on byte 가드 — 오버플로우를 codex 불투명 exit가 아니라 사전 fail-loud로
(`CODEX_PROMPT_STDIN_BYTE_LIMIT`, `source-breadth-fold.ts:283` 실확인),
(b) **결정론 breadth fold** — 투영-층에서만 접고(관찰 mint/mutate 0, navigation-only, rolled-up
노드 authority 0) 전 파일 id는 selectable 유지. owner 통찰이 프레이밍을 정정했다:
*"오버플로우는 결정론적으로 다 읽어 쌓다 보니 양이 폭발한 것 → 읽은 내용을 결정론적으로 한 번 더
접으면 LLM 삼킬 크기가 되고, 결정론이라 정확히 추적 가능"* — LLM summary-of-summary 권위
(20260616 설계 §4.2가 거부)와 구분되는 지점.

### 2.3 배달·인용 — 전송 천장과 단위 "전체"의 산술 충돌 (2026-07-27~31)

관측 카탈로그 도구(pull 층)에서 세 번째 벽. 실측 연쇄
(handoff `20260727-observation-pull-layer-redesign-start-here.md` §3,
`20260730-size-robust-span-delivery-start-here.md` §1):

1. **codex가 MCP 도구 결과를 조용히 절단한다** — 기본 설정에서 32,035자 무손실 / 65,553자 절단.
   커밋돼 있던 페이지 예산 65,536자는 **그 자체로 라이브 결함**이었다.
2. **절단 모양이 `head … tail`** — 가운데가 사라지고 양 끝이 남는다. 그래서 "끝단에 놓은 배달
   증명 토큰"은 본문 소실에도 멀쩡히 도착한다. 독립 저작된 두 프론티어 설계 초안(fable-5·gpt-5.6)
   의 배달 증명 위치가 **둘 다** 이 실측 하나로 무효화됐다. 처방: 증명을 본문 *인접*이 아니라
   본문 *소유*에 결속.
3. **런타임은 못 보고, 모델은 안 알린다** — 절단은 codex 안에서 일어나 façade는 온전한 바이트를
   내보낸 줄 알고, 모델은 7/9 소실 회차에서 `notice=NONE`을 보고했다.
4. **두 상수의 산술 충돌**: exec 출력 천장 ≈40,150자(외부 제약, 내릴 수만 있음) < 페이지 예산
   65,536자. `delivered`는 정본 전체가 하나의 수신 레코드에 있기를 요구하므로, **천장을 넘는
   관찰은 모델이 아무리 성실해도 영구 `not_attested`** — 결함이 아니라 산술. 예산을 내리면 파트
   수가 늘어 호출 상한 32와 충돌. *"단위가 '전체'인 한 어떤 상수 조합으로도 큰 내용은 벽을
   만난다"* (20260730 §1).

결론이 구간 계약이다: `(observation_id, observation_content_sha256, [start,end),
range_content_sha256)` — 모델에는 불투명 id(`orng_v1_…`)만 주고 런타임이 해석, 인용은 해시로
자기 검증 (현행 `direct-call-directive-author.ts:3480`·`artifact-types.ts:925` 실확인, 페이지 예산
65,536→32,000 인하 `observation-read-grant.ts:126` 실확인). S6까지 완료로 배달·인용·하류(judge
투영·evidence ref·`direct_authority`)가 전부 구간 단위가 됐다 (handoff
`20260731-range-delivery-s6-start-here.md` §1~2).

**단, 라이브가 곧바로 다음 벽을 보여줬다** (같은 문서 §4): 개별 페이지는 예산 아래인데 워커가
여러 페이지를 한 exec 출력으로 병합해 가져가면 합산이 천장을 넘어 **방출 3건 전부 미도달**
(fail-closed는 옳게 동작). 단위를 내려도 **소비자의 호출 패턴**은 여전히 프롬프트 유도
("exec당 1회 요청")에 의존한다 — 구조로 막지 못한 잔여 자유도.

### 2.4 판정: 표현 형식의 문제인가 파이프라인 구조의 문제인가

기록이 지지하는 답은 **"둘 다이지만, 근본은 정체성·배달 단위의 표현 문제이고, 파이프라인 구조가
그 오류를 증폭했다"**:

- **표현(단위) 차원이 근본이다.** 세 단계에서 깨진 방식이 동형이다 — S1: 관찰 단위=파일이라 큰
  파일이 절단됨 → region으로 해소. S2: 투영 단위=전 관찰 flat이라 합산 무계 → fold 사다리로
  해소. 배달: 인정 단위=관찰 전체라 천장 초과분이 영구 불인정 → range로 해소. 매번 해법은
  상수 조정이 아니라 **단위를 내부 구조가 있는 것(구간)으로 내리는 것**이었고, 내린 뒤에는
  "같은 메커니즘이 500자와 800KB를 모두 처리"하게 됐다. 상수 충돌(65,536 vs 40,150 vs 32콜)은
  전부 단위가 "전체"였기 때문에 생긴 파생 증상이다.
- **파이프라인 구조가 증폭기였다.** (a) push 기반 flat 투영 — 런타임이 모든 것을 프롬프트에
  밀어 넣는 구조라 예산 상수가 애초에 필요했고, 상수마다 국소적으로 추가되며 서로 충돌했다
  (capture 5M / projection floor 200K / excerpt 1,200 / stdin 1MiB−8KiB / 페이지 32K / exec 40,150
  / 호출 32 / 하류 judge 1,048,576 — 최소 8개의 독립 천장이 실재, 각각 다른 단위로 측정됨).
  (b) 예산의 측정 단위 불일치 — 문자로 재고 토큰으로 잘리고 JSON 이스케이프 비용으로 쪼개진다.
  "오프셋은 산술로 안 나온다"는 교차검증 반박(20260730 §2: `splitBodyByJsonCost`의
  `codePointJsonCost`가 비균일 — `"`·`\`=2, 제어문자·surrogate=6)이 이를 못박았고, 결론은
  **런타임이 오프셋을 명시적으로 실어 보내는 것**(산출을 도구/코드가 소유)이었다.
- **경계 불투명성은 제3의 축이다.** codex 절단은 표현도 파이프라인도 아닌 **신뢰 경계 문제** —
  런타임과 모델 사이의 전송 계층이 조용히 손실을 일으키고 양쪽 다 모른다. 이건 어떤 단위 설계로도
  제거되지 않고, **자기 검증적 표현(해시)** + **전사본 재조정(수신 레코드로 도달 증명)** 이라는
  이중 방어로만 다뤄졌다. 재조정 자체도 `--ephemeral`이 rollout을 지운다는 실측
  (handoff 20260728 §3: probe 인자≠프로덕션 인자, session id가 있다고 전사본이 있는 게 아니다)
  같은 환경 의존을 안는다.

---

## 3. bug/·debug/ 기록이 추가로 말해주는 것

- **`bug/20260530-review-record-assembly-lens-stringlist-parse.md`**: LLM이 저작한 렌즈 출력의
  자유 텍스트 섹션을 런타임이 strict YAML로 파싱해, 자연스러운 markdown bullet
  (`- "PATH resolution" means …`)에서 실 리뷰가 통째로 failed. 실행 12단계와 final-output은
  성공했는데 정본 아티팩트 조립이 죽었다. **LLM-native 경계 원칙의 실패 사례**: 자유 산문 채널에
  구조화 파서를 대면 안 되고, 구조가 필요하면 스키마 강제 채널(--json-schema, 이후 §4-6c에서
  실제로 그렇게 해소)을 써야 한다. 같은 문서 말미: `review_status` 응답 ~85KB에 투영 제어 부재 —
  **투영 없는 전체 응답은 MCP 클라이언트 토큰 캡과 충돌** (규모 문제의 축소판이 응답 표면에도).
- **`bug/20260330-subagent-fallback-on-first-install.md`** (플러그인 시절): 프로세스 문서가
  TeamCreate 사용을 서술했지만 deferred tool이라 스키마가 로드 안 됨 → LLM은 "실패"가 아니라
  "부재"라 fallback 조건조차 발화하지 않고 조용히 다른 경로로 감. **역량 표면에 없는 것은
  지시문으로 존재하지 않는다** — 후일 "구조적 제약은 역량 표면으로 강제"라는 원칙의 초기 실증.
- **`debug/review-invocation-runner.md`** (2026-05-28): review 쪽은 일찍 "adapter가 argv를 만들고
  stdout JSON을 파싱하는" 구조를 typed runner + 아티팩트 진실 파생 투영으로 정리했다. §14의 위험
  표("accidental new artifact authority → runner result must derive from existing artifacts")가
  reconstruct 쪽 run.ts에는 적용되지 않았고, 그 비대칭의 결과가 §1이다.

---

## 4. 검증 방법 자체의 실패 — 기록에 정량된 것

재설계는 코드 구조만이 아니라 **검증 체계**를 설계해야 한다. 이 repo가 정량 기록한 자기 실패:

| 실패 클래스 | 실측 빈도 | 출처 |
|---|---|---|
| 공허 테스트 저작 (변이를 넣어도 green) | 한 세션에서 **12건** | handoff 20260729 §1 |
| 테스트가 자기 이름이 주장하는 것을 검사 안 함 | 5번, 전부 변이 배터리가 잡음 (그린 스위트 0건 검출) | handoff 20260728 §7 |
| 대조군(negative control)이 공허 | 4번 (커서 버전·JSON.stringify 동어반복·상한 초과·toBeDefined) | handoff 20260731-s6 §7 |
| 내 서술이 실측에 반박됨 | 한 작업에서 7번 | handoff 20260728 §7 |
| 부재 주장("소비자 없음"·"테스트 없음") 오판 | 하루 3~4번, 전부 잘린 검색·비전수 확인 | handoff 20260730 §8, 20260729 §2-V3 |
| 소유하지 않은 컴포넌트 계약을 안 읽고 가정 | 리뷰 라운드 6에서 9/9건, 최소 4건은 계약이 그 파일에 적혀 있었음 | handoff 20260727 §1 |
| 같은 결함 클래스 연속 재발 (분할 신원 part_count→part_allowance) | 2회 — 증분 수정 포기 트리거 | handoff 20260727 §1 |
| fixture 전수 착각 ("3벌 모두 일관" 보고 후 라이브 파괴) | 1회, 4벌째가 회귀를 잡음 | handoff 20260730 §8 |

여기서 정착된 메커니즘 (재설계가 계승할 실행 규율):
1. **변이 먼저**: 변이를 제품 코드에 넣어 현 테스트가 green임을 실증 → 고침 → 같은 변이로 실패
   확인 → 바이트 복원 확인 (20260729 §3). 대조를 테스트 헬퍼에 넣으면 무의미.
2. **판정 대상 카디널리티>0 선단언** (PROVENANCE.md의 "ledger from a different run would join to
   nothing and every gate test would pass vacuously" — fixture 자체에 공허 방지 설계).
3. **측정값은 PROVENANCE로 박제하고 다시 재지 않는다** — 프로덕션 표현(JSON 비용)과 다른 도구
   (Python json.dumps)로 다시 재서 틀린 실전례 (20260730 §3).
4. **수렴 판정은 발견 총수가 아니라 기원 분류(injected/pre-existing)로** — 렌즈를 바꾸면 총수가
   흔들려 라운드 비교가 무너진다 (20260727 §7).
5. **플래키 라이브보다 실 아티팩트 결정론 replay가 정의적** (MEMORY, DW-3b/3d 패턴).

부수 관찰: 게이트 베이스라인이 "15 green + **2 rc=1**"로 상수화돼 있다 — gitignored 세션 잔해가
G7·invariant-drift를 상시 오염시켜, 매 세션 "전수로 뽑아 `ignored=yes tracked=no` 확인"이라는
수작업 의례가 붙었다 (여러 handoff 반복). **세션 산출물과 repo 검증 표면의 미분리**가 만든 만성
마찰이며, 재설계에서 산출물 배치로 해소해야 할 항목이다.

---

## 5. 재설계 함의 — 계승/폐기 목록

### 계승 (버리면 같은 벽을 다시 만난다)

1. **크기 견고 단위**: 정체성·배달·인용의 단위는 처음부터 내부 구조를 갖게(구간/range) 설계한다.
   "전체" 단위 + 예산 상수 조합은 세 번 깨졌다. 새 아키텍처에서 어떤 산출물이든 "한 번에 통째로
   전달·인정된다"를 가정하는 계약은 그 자체로 결함 후보다.
2. **결정론이 정체성·오프셋·직렬화를 소유**: 앵커·id·오프셋·해시는 순수 함수 + 런타임 명시 전달.
   LLM은 불투명 토큰만 다룬다. 산술로 유도 가능해 보여도 표현 비용(JSON 이스케이프)이 비균일하면
   유도는 틀린다 — 명시 전달이 답이었다.
3. **신뢰 경계에는 자기 검증 표현 + 사후 재조정**: 전송 계층은 조용히 손실한다(실측). 해시 결속
   인용과 전사본 재조정의 이중 방어는 폐기 불가. 단 재조정은 환경 플래그(`--ephemeral`)에
   민감하다는 것까지가 학습이다.
4. **접기는 결정론·navigation-only**: 규모 축소는 LLM 요약이 아니라 결정론 fold로, 접힌 노드는
   권위 0·전 원소 selectable 유지. summary-of-summary 권위 금지 (20260616 §4.2).
5. **게이트는 하한·전수·negative control 메커니즘으로**: 표면이 쪼개져도 살아남는 게이트만
   게이트다. 파일 목록형 스캔 게이트는 두 번 조용히 죽었다.
6. **default-off byte-identical opt-in + 조건부 reuse-key 회전**: 모든 규모축 변경(S1 region,
   S2 fold, range delivery)이 이 패턴으로 가역 착지에 성공했다.
7. **아티팩트가 진실, 런타임 값은 투영** (debug/review-invocation-runner.md §3): 이걸 지킨
   review는 유지보수 가능했고 안 지킨 reconstruct는 21k 파일이 됐다.

### 폐기해도 되는 것 (구조가 낳은 우발적 잔해)

1. **단일 orchestrator 함수의 평평한 상태 누적** — 288 이름 스코프는 설계가 아니라 부채였다.
   단, 폐기하려면 §1.3의 교훈대로 **산출물 등가 하니스가 선행**해야 한다.
2. **국소적으로 추가된 예산 상수의 성좌** — 최소 8개의 독립 천장이 서로 다른 단위로 존재한다.
   재설계에서는 천장을 "외부 실측 제약"(stdin·exec·토큰)과 "내부 설계 예산"으로 분리하고, 외부
   제약은 프로브로 핀하며(`tool_output_token_limit` 명시 설정 전례), 내부 예산은 단위를 통일해
   한 곳에서 파생시킨다.
3. **push 전용 투영** — pull(모델이 구간을 요청, 런타임이 검증 서빙) 층이 이미 구현·검증됐다.
   push flat 투영은 예산 문제의 발생원이었다.
4. 죽은 코드 12심볼 842줄 (tracking/20260726-reconstruct-timeout-recovery-unwired-backlog.md,
   owner 결정 대기) — 단, "죽은 필드" 판정은 이 repo에서 반복 오진된 클래스이므로 전수 확인 후.

### UNVERIFIED로 남는 것

- exec 출력 천장 ≈40,150자, 절단 괄호 32,035/65,553자 등 전송 실측값: 기록된 측정이며 이 노트에서
  재실측하지 않았다. codex 버전이 바뀌면 이동한다 — 설계 입력으로 쓰기 전 재프로브 필요.
- "첫 일주일 10,379줄"의 내용 구성(어떤 단계가 얼마나): 커밋 메시지로만 추정, diff 단위 분석은
  하지 않았다.
- 멀티레포 단계: 설계·구현 기록이 없다. S2 fold의 PR-4(directory-topology rollup)가 토대로
  지목됐을 뿐 (handoff 20260724 §0.1) 실증 0.
- "규모축에서 review 경로는 왜 같은 벽을 안 맞았는가": review는 대상이 단일 타깃 중심이라 규모
  압력이 반사되지 않았을 가능성이 높지만, `review_status` 85KB 무투영 문제(§3)는 같은 클래스의
  초기 신호다 — 전수 확인하지 않았다.
