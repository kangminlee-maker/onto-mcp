# 교차검증 결과 — 구간 단위 배달 구현 프로세스 계획 (`gpt-5.6-sol`/max, 2026-07-30)

패킷: `24-crossverify-packet-range-delivery-plan.md`. 대상: `23-implementation-process-range-delivery.md`.

## 0. 실행과 참여 — 판정을 믿기 전에 확인한 것

| | correctness | security | reproduction |
|---|---|---|---|
| rc | 0 | 0 | 0 |
| 읽은 `src/` 고유 파일 | 55 | 216 | 32 |
| findings | HIGH 4 · MEDIUM 1 | BLOCKER 1 · HIGH 2 · MEDIUM 1 | HIGH 4 · MEDIUM 1 |

세 패스 모두 `--profile hermetic`(사용자 config·AGENTS.md 없음) · `--sandbox read-only` · `--model gpt-5.6-sol`
`--effort max`. 디스패치 전에 **통제군을 먼저** 돌렸다 — `--effort banana`는 rc=1(HTTP 400), `--effort max`는
rc=0. rc에 판정력이 있음을 확인한 뒤에 본 런을 걸었다.

**독립성**: 패킷이 `development-records/` 열람을 금지했고, 세 패스 모두 boundary note에서 지키지 않았음을
선언하지 않았다(둘은 명시적으로 "열지 않았다"고 적었다).

**세 렌즈 전부 VERDICT가 "이 순서로는 짓지 말라"였다.**

## 1. 주 세션이 실코드로 재확인한 것 — findings도 가설이다

| 검증 대상 | 방법 | 결과 |
|---|---|---|
| 대조군 3벌이 잘못된 구현을 통과시킨다 | reviewer의 반례(`16-id p1 + solo p2 + 16-id p3..14`)를 실 fixture로 재현 | **확증.** 구멍 `[62083,62528)` 445자 **와** 중첩 882자가 동시에 존재, 길이 합 780,551 > body 780,114 → `sum >= bodyLen` 구현이 complete=true |
| evidence ref에 range identity가 없다 | `artifact-types.ts:906-911` 직접 읽음 | **확증.** `ReconstructEvidenceRef`는 `observation_id`·`target_material_kind`·`source_ref`·`location`뿐 |
| 보류가 카탈로그 게이트보다 먼저다 | `direct-call-directive-author.ts` filter/map 위치 | **확증.** `.filter` `:3479` → `.map` `:3502` |
| façade가 mint에 예산을 넘기지 않는다 | `observation-read-facade.ts:574` 직접 읽음 | **확증.** `mint({sources, systemPrompt, userPrompt, ttlMs})` — `pageCharBudget` 없음 → 라이브는 65,536 기본값 |
| 구 cursor가 S1을 정직하게 거부하는가 | cursor payload `{v,d,b,ids,o,p}` 확인 | **반박됨.** `b`는 **페이지 예산**이지 allowance가 아니다. S1이 framing을 키우면 예산은 같은데 분해 경계가 이동한다 → 구 cursor가 검사를 통과하고 다른 파트를 가리킨다 |

## 2. 주장 판정

| 주장 | correctness | security | reproduction | 종합 |
|---|---|---|---|---|
| **A** 오프셋 합집합이 파티션 기계를 대체 | 확증 | 부분 반박 | 부분 반박 | **알고리즘은 확증.** 단 "개념 표면이 줄어든다"는 **반박** — S3가 range 원장·range-aware evidence ref·정확한 구간 투영을 **새로** 요구한다 |
| **B** 기본 경로가 영수증이다 | 확증 | 확증 | 확증 | **확증** (3/3) |
| **C** 비용 +190자 · 0.6% | 부분 반박 | 확증(framing 한정) | 정량 확증 | **산술은 정확하나 일반화가 틀렸다.** `partAllowance`는 **최대** 엔트리 framing 하나로 계산되지만 실제 페이지는 **엔트리마다** framing을 낸다 |
| **D** 32,000 > 40,000 | 확증(상대 선택) | 부분 반박 | 부분 반박 | **상대 선택은 지지.** 수치는 31,968 → **31,960**(최종 형상). 그리고 **페이지가 절단의 단위가 아니다** |

### 2-1. 주장 C가 실제로 틀린 지점

32,000 예산에서 1,600자짜리 관찰 16개는 구 계약으로 29,810자 **1페이지**지만, 새 필드를 더하면 32,610자가
되어 **2페이지**가 된다. 그런 묶음 17개를 처리하면 17호출 → 34페이지가 되어 **33번째에서
`call_limit_exhausted`**가 난다. "0.6%, 사실상 공짜"는 **단일 최대 파트 용량**에만 맞고 페이지·호출
비용에는 맞지 않는다.

### 2-2. 주장 D가 실제로 틀린 지점 — 절단의 단위

`31,968 < 32,151`은 **개별 페이지**에 대해서만 성립한다. 실 Codex 경로는 **한 exec에서 가져온 여러 tool
payload를 하나의 received output으로 합칠 수 있고**(`delivery-reconciliation.ts:9`가 이미 그렇게 적고 있다),
커밋된 회귀가 그 묶음에서 32,035자 payload가 잘린 사례를 보존한다(`delivery-reconciliation.test.ts:55`).

→ **실효 경계를 페이지 크기만의 구간 `(32,151, 40,149]`로 표현할 수 없다.** 같은 페이지도 동시 결과 수와
누적 출력 크기에 따라 도달 여부가 갈린다. §0-1의 프레이밍이 틀렸다.

## 3. 확정된 findings — 중복 제거

### F-1 · BLOCKER — S4가 S3보다 **먼저** 와야 한다 (3/3 수렴)

S3가 착지하고 S4가 아직이면 합법적 구간 페이지가 여전히 최대 65,536자다. 전송이 가운데를 잘라도 façade는
stdout write 성공 후 **전체 페이지를 영수증에 commit**하고, 기본 OFF 경로는 전사본을 보지 않고 그
영수증만으로 인용을 인정한다. → **모델이 metadata에서 본 `range_id`를 인용하는데 그 구간 본문의 가운데가
모델 문맥에 없어도 승인된다.**

`anchor`: `observation-read-grant.ts:107` · `observation-read-facade-server.ts:105-114` ·
`direct-call-directive-author.ts:3454-3469`

### F-2 · HIGH — S2는 단독으로 green일 수 없다 (3/3 수렴)

S2가 citable set을 구간으로 바꾸는데 S3 전의 author는 여전히 `evidence_observation_ids`를 요구한다.
`ids.has(observationId)`가 항상 false가 되어 **실제로 가져온 인용도 "never served"로 throw**한다. 두 id가
모두 `string`이라 타입도 못 잡는다.

`anchor`: `direct-call-directive-author.ts:3542`

### F-3 · HIGH — 절단의 단위는 페이지가 아니라 **수신 레코드**다 (security)

S4 이후에도 워커가 한 exec에서 31,968자 페이지 둘을 요청하면 누적 ~64KB가 하나의 출력으로 합쳐져 잘린다.
영수증에는 둘 다 served로 남고 기본 경로가 그 구간들을 인용 가능하게 만든다. → **"개별 최대 페이지 <
관측 무손실 최대"라는 S4 완료 조건을 통과한 구현에서도 같은 권위 오류가 재현된다.**

### F-4 · HIGH — 구간 provenance가 하류에서 **소실**된다 (correctness + security 수렴)

인용을 구간으로 바꿔도 영속 evidence ref는 관찰 id만 보존한다(`artifact-types.ts:906`, 재확인함). 후속
독립 judge는 그 id로 **관찰 전체를 다시 선택**해 500자 투영을 넣는다(`direct-call-directive-author.ts:3652-3657`,
`authoring-prompt-payloads.ts:2067-2073`). → **judge가 인용된 구간 밖의 내용을 보고 support를 판정한다.**

security 렌즈가 같은 구멍을 다른 각도에서: 관찰의 구간 A는 주장과 무관하고 B만 지지하는데 워커가 A만
인용하면, `direct_authority` 검증은 "evidence ref가 하나 이상"만 보고 통과시킨다.

### F-5 · HIGH — S3의 완료 조건이 게이트 순서 때문에 성립하지 않는다 (correctness)

`unverifiable`일 때 보류(`:3479` filter)가 카탈로그·해소 게이트(`:3502` map 안 `:3524`)보다 **먼저** 돈다.
따라서 "방출된 적 없는 id를 인용하면 거부된다"는 완료 조건은 `unverifiable` 상태에서 도달조차 하지 않는다.

### F-6 · HIGH — S4의 완료 조건이 공허하다 (reproduction, 재확인함)

측정 하니스만 `pageCharBudget: 32000`으로 부르고 라이브 상수를 그대로 두어도 완료 조건이 통과한다.
`observation-read-facade.ts:574`의 `mint`는 예산을 넘기지 않으므로 라이브는 계속 65,536이다.

### F-7 · HIGH — S2의 대조군 3벌이 잘못된 구현을 통과시킨다 (reproduction, **재현함**)

§1 표 참조. **구멍과 중첩이 동시에 존재하는 네 번째 대조군**이 필요하다.

### F-8 · MEDIUM — 구 cursor가 S1에서 거부되지 않는다 (security, 재확인함)

마이그레이션 입장의 "커서는 예산에 결속돼 있어 정직하게 거부된다"는 **S4에는 맞지만 S1에는 틀리다.**
cursor는 snapshot digest와 **페이지 예산**에 결속되는데, S1은 예산을 그대로 두고 **framing만 키운다** →
allowance와 분할 경계가 바뀌는데 cursor 검사는 통과한다. fixture 계산상 첫 경계가 62,528 → 62,395로
이동해 133자가 중복된다.

### F-9 · MEDIUM — 리더 자기검사는 구조적 증명이 아니다 (correctness + reproduction 수렴)

S1의 "`entryFramingChars` 반영을 빠뜨려도 자기검사가 잡는다"는 **입력 의존**이다. 최대 관찰의 첫 페이지는
32,142자가 되어 `:854-859`가 잡지만, 가장 작은 관찰은 2,515자라 발화하지 않는다.

## 4. 경계 노트 — findings로 올리지 않았지만 기록할 것

- **`range_id` 위조 우회로는 발견되지 않았다.** 워커가 digest를 계산할 수는 있으나, 같은 launch의 영속
  emission 원장에서만 해소하면 계산 자체가 권한을 만들지 않는다. 단 **같은 `range_id`가 서로 다른 튜플로
  해소되면 fail-closed**여야 한다(구현 조건)
- **버전 불일치는 fail-open되지 않는다.** 구 배달 레코드 → `null` → `unverifiable`(보류), 구 영수증 →
  `null` → 빈 served set(인용 거부). 둘 다 과승인은 아니다. 다만 후자는 "확인 불가"가 아니라 **잘못된 부정
  문장**이다
- **source-safety 우회는 발견되지 않았다.** range가 스냅샷의 관찰로 역해소되는 한 구간화가 withheld
  관찰을 새로 노출하지 않는다
- **32,000은 다른 상수와 충돌하지 않는다.** 최소 4,096 · 세션 예약 8,192 · 교환 프레이밍 1,024와 산술 정합
- **S1 단독 착지는 깨지는 경로가 발견되지 않았다** — 단 F-8의 cursor 건은 예외
- **S1의 구간 해시 oracle을 명시해야 한다**: `fullBody.slice(start,end)`를 **독립적으로** 해시해야 한다.
  `entry.body`를 해시하면 내부 경계를 1자 옮겨도 세 조건이 전부 통과한다
- **32,000 이하에서도 절단되는 실패는 관측되지 않았다.** 현재 증거는 상대 선택을 지지할 뿐 안정적 전송
  경계를 통계적으로 확립하지는 않는다
