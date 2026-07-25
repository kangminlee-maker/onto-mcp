# coarse rung 선택품질 — 실측 증거

`development-records/design/20260723-deterministic-recursive-observation-design.md` §9가 인용하는 수치의
**durable 원본**이다. 원래 `.onto/temp/`에만 있었는데 그 경로는 `.gitignore:14`로 커밋되지 않아, 머지된
설계 결론을 클린 클론에서 재구성할 수 없었다(적대 교차검증 M2). 하니스도 이제 여기에 쓴다.

| 파일 | 내용 |
|---|---|
| [selection-quality.json](selection-quality.json) | arm별 선택 id 전체 + 파생 지표 (하니스가 씀) |
| [live-run.log](live-run.log) | 실행 전문 — dispatch 전 purity 검사, **input token 실측**, console 표 |

**input token 수치는 JSON에 없다** — 런타임의 `[model-call] codex success: … input_tokens~=` 줄에서만
나오므로 로그를 함께 커밋한다. JSON만으로 재구성 가능한 것은 dispatch **byte**(1,028,392 → 54,770 = 18.8×)이고,
토큰비(257,428 → 14,023 = 18.4×)는 로그가 근거다.

## 재현

```
npx tsx scripts/breadth-fold-selection-quality-bench.mts        # dry: arm 구성 + purity 검사만
npx tsx scripts/breadth-fold-selection-quality-bench.mts --go   # live: 실 seat에 4회 dispatch
```

코퍼스는 Stage-2 value bench가 남긴 실 관찰 아티팩트(openai-node src 59파일)이며 `.onto/temp/`에 있다.
없으면 fail-loud한다.

## 읽는 법

기준선은 `full` **1회차**다. `full` 2회차(= 노이즈 바닥)는 같은 rung·같은 바이트를 다시 보낸 것이므로,
거기서 나오는 불일치는 전부 실행간 분산이다. coarse arm은 **그 바닥보다 아래로 떨어져야** 열화 신호다.

| arm | jaccard | recall | precision | top-5 일치 |
|---|---|---|---|---|
| `full` (참조) | 1.000 | — | — | — |
| `full` 반복 = 바닥 | 0.813 | 13/15 = .867 | 13/14 = .929 | 5/5 |
| `inventory_skeleton` | 0.824 | 14/15 = .933 | 14/16 = .875 | 5/5 |
| `one_line` | 0.824 | 14/15 = .933 | 14/16 = .875 | **4/5** |

- coarse arm은 바닥 대비 **recall이 높고 precision이 낮다**(더 많이 고른다: 16 vs 14). jaccard는 둘을
  합산해서 0.813 → 0.824로 사실상 동률. 방어 가능한 서술은 **"바닥과 구별 불가"**이지 "바닥과 같거나 그 위"가
  아니다 — 세 축의 부호가 서로 다르다.
- **`one_line`의 top-5 4/5는 표에서 빼지 않는다**(coarse arm이 바닥 아래로 떨어지는 유일한 컬럼). 다만
  무엇을 재는 컬럼인지는 정확히 써야 한다: `selected_observations`는 프롬프트 계약상 **집합**이고
  (run.ts:11704 "selected_observations is a set keyed by observation_id"), 런타임은 중복 제거된 id 리스트로
  정규화하며(`selectedObservationIds` run.ts:11298) **순서를 rank로 읽는 소비자가 없다**(선택 집합을 top-N으로
  자르는 코드 없음). 즉 이 컬럼은 계약이 정의하지 않는 **방출 순서**를 잰다.
- 결정적으로, **두 coarse arm은 완전히 같은 16개를 골랐다**(집합 동일, 순서만 다름 — JSON의 `ids`로 확인
  가능). 같은 집합이 순서 때문에 5/5와 4/5로 갈린다면 그 컬럼이 재는 것은 선택품질이 아니라 방출 순서다.
- 일어난 일도 탈락이 아니라 재배열이다: `one_line`은 `obs_dd7a…`(참조 12위)를 2위로 올리고
  `obs_bf42…`(참조 5위)를 7위로 내렸다 — **`obs_bf42…`는 여전히 선택되어 있다.**

## 한계 (정직)

arm당 N=1(참조만 2회)·단일 코퍼스·단일 intent·단일 seat·`full`을 정답으로 간주. 바닥 자체도 1회 표본이라
분산의 폭을 모른다. 작은 효과는 해상 불가 — 주장은 "열화 없음"이 아니라 **"이 워크로드에서 큰 노이즈 바닥
대비 큰 효과 아님"**이다. top-5 한 칸 차이를 열화의 증거로도, 무해함의 증거로도 쓸 수 없다.
