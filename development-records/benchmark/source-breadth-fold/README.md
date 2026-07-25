# source_breadth_fold — rung 선택 실측 증거

`development-records/design/20260723-deterministic-recursive-observation-design.md` §3.3 / §8(PR-4b)이 인용하는
수치의 **durable 원본**이다. 이전에는 `.onto/temp/source-breadth-fold-promotion/`에만 있었는데 그 경로는
`.gitignore:14`로 커밋되지 않아, 머지된 설계 결론을 클린 클론에서 재구성할 수 없었다(적대 교차검증 M2).

## 재현

```
npx tsx development-records/benchmark/source-breadth-fold/probes/<probe>.mts
```

전부 결정론적이다 — LLM 호출 없음(`tail-rung-ceiling-measured.mts`만 실 author를 stub `llmCall`로 돌린다).
캡처된 출력은 [probe-output.txt](probe-output.txt).

코퍼스는 Stage-2 value bench가 남긴 실 관찰 아티팩트(openai-node src 59파일)이며 `.onto/temp/`에 있다.
그 코퍼스가 없으면 probe는 fail-loud한다 — 재현하려면 벤치를 다시 돌려야 한다. 결론에 필요한 수치는
`probe-output.txt`에 전부 들어 있다.

## probe별 소유 결론

| probe | 답하는 질문 | 핵심 수치 |
|---|---|---|
| `one-line-floor-anatomy.mts` | 오버플로우를 무엇이 만드는가 | id 리스트는 payload의 **6.2%**뿐 · per-row 절대경로 텍스트가 446 B 행 중 ~285 B |
| `coarse-rung-candidates.mts` | 어느 coarse rung이 monotone-safe한가 | 군집도 1→8 files/dir에서 rollup 353.5→251.2 B/unit(**29% 이동**) vs 파생 rung 157.3→156.4(**0.6%**) |
| `rollup-rung-headroom.mts` | rollup이 사는 headroom | 8 files/dir 기준 ceiling 3,454 files · **구조적 floor(id만) ≈ 31,049** |
| `tail-rung-ceiling-measured.mts` | 실제 배송된 사다리의 ceiling | one_line **2,007** → summary_anchor **2,881** → anchor **3,445** (1.72×), N+1은 거부 확인 |
| `region-corpus-reach.mts` | region 분해 코퍼스에서는 얼마를 버는가 | whole-file **1.83×** vs region-decomposed **1.20×** · 꼬리 floor에서 sibling SEPARABLE |

## 결론에 직접 걸리는 주의사항

- **1.72×/1.83×는 whole-file 코퍼스 수치다.** `source_region_decomposition` ON이면 `location`이 더 이상
  `source_ref`와 중복이 아니라 redundancy predicate가 그것을 보존하고, `summary_anchor`는 **no-op**이 된다.
  그 코퍼스의 실측 reach는 **1.20×**. 분해 런에 whole-file 수치를 인용하지 않는다.
- **root-relative refs는 다음 레버가 아니다.** 이 코퍼스의 root가 99자 temp 경로라 상대화가 커 보인다.
  root 길이를 realistic한 30자로 두면 anchor 위 상대화 이득이 ~1.48× → ~1.11×로 줄고, 멀티레포 축은 공유 root를
  더 짧게 만들어 이득이 0에 수렴한다.
- **rollup 353.5 vs 302 쌍은 기저가 섞였다**(1 file/dir vs 8 files/dir, 상대화 방식도 다름). 단일 기저 재서술과
  실제 기각 근거는 `coarse-rung-candidates.mts` 헤더의 2026-07-25 CORRECTION에 있다.
