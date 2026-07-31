# 구간 단위 배달 — 라이브 프로브 (2026-07-31)

이 트랙(S1~S6)의 **첫 라이브 실증**이다. 그 전까지는 전부 실 fixture와 실 전사본 replay였다.

```
npx tsx scripts/observation-read-pull-live.mts
```

실 `codex exec` 워커를 프로덕션 하드닝 그대로 띄우고, 실 59-관찰 코퍼스 위에 façade를 등록하고, 실 모델이
관찰을 가져가게 한다. OAuth 세션에서 실 디스패치 1회를 쓴다. 원본 증거는 `benchmark/`(gitignored) 아래
타임스탬프 디렉터리에 쌓이고, 여기 있는 것은 그중 **판정에 필요한 것만** 옮긴 것이다.

| 파일 | 무엇 |
|---|---|
| `delivery-verdict.json` | 재조정 판정 — 스키마 버전, 배달된 구간, attestation |
| `receipt.json` | façade 영수증 — 런타임이 **서빙한** 것 |
| `emitted-ranges.json` | 방출된 페이지의 **엔트리 shape만** (본문 제외, 4 MB → 1 KB) |
| `worker.json` | 워커 세션·전사본 결속 |

`source-observations.yaml`(3.9 MB)은 옮기지 않았다 — `scripts/fixtures/observation-catalog/`에 이미
커밋된 같은 코퍼스다. `descriptor.json`도 뺐다(런치 토큰을 담는다. 이미 죽은 값이지만 남길 이유가 없다).

## 무엇이 증명됐나

**codex-cli 0.145.0** — `VERIFIED_CODEX_CLI_VERSIONS`에 핀된 버전이라 재조정이 전사본을 수용한다.

- **페이지가 구간을 싣는다**: `part_allowance: 31253`(S4의 32,000 예산에서 프레이밍을 뺀 값),
  `body_start`/`body_end`, `range_content_sha256`, `range_id: orng_v1_…` — 전부 실 페이지에 실렸다
- **배달 레코드가 `observation-read-delivery/v2`**이고 `delivered`가 구간이다:
  `[[0, 3483]]` / `body_length: 3483`, `[[0, 10018]]` / `body_length: 10018`
- **`verbatim_delivered`** — 방출 정본이 워커 문맥에서 그대로 발견됐다. 재조정 4~5 ms
- 1-파트 관찰에서 `range_content_sha256 === observation_content_sha256`이다. 구간이 곧 본문 전체라
  그래야 맞는다 — 두 해시가 독립적으로 계산되므로 우연이 아니다

## 두 번 돌렸고, 첫 런이 결함을 찾았다

첫 런은 PASS했지만 로그에 `delivered = 2 observation(s): [object Object], [object Object]`가 찍혔다.
S2가 `delivered`를 id 배열에서 커버리지 레코드로 바꿨는데 프로브의 **단언은 고쳤고 로그 줄은 안 고쳤다.**
판정은 옳았지만 사람이 읽는 줄이 아무것도 보여주지 않았다 — 통과처럼 읽히는 침묵이다. 고친 뒤 두 번째
런에서 `obs_9f291d6235fdb41c [0,3483)/3483, obs_eb90f83378bd57a0 [0,10018)/10018`로 나온다.

**교훈**: 타입이 바뀌면 단언뿐 아니라 그 값을 **렌더링하는 곳**도 바뀌어야 한다. `join`은 객체 배열에서
조용히 무의미해지고, 그 무의미가 초록색으로 출력된다.

## 이 프로브가 덮지 않는 것

- **큰 관찰의 분할·재조립**: 여기서 가져간 둘은 3,483자와 10,018자라 각각 1파트다. 780 KB 관찰을 28파트로
  걷는 경로는 라이브로 돌린 적이 없다
- **부분 인용**: 워커가 관찰 일부만 읽고 그 구간만 인용하는 경로 — 즉 이 트랙의 **목적** — 는 라이브로
  미실증이다. 단위 테스트와 replay가 덮는다
- **S6의 judge 구간 투영**: 이 프로브는 answer-support judge까지 가지 않는다
