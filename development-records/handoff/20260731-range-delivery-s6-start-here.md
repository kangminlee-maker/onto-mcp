# 구간 단위 배달 — S6(하류 range 보존) 시작 지점 (2026-07-31)

> **한 줄**: **S6까지 끝났다** (2026-07-31, `4995621`). 인용도 하류도 구간 단위다. 남은 것은 **S5 잔여 정리**와,
> 그 다음 **`source_observation_catalog_tool` 승격 결정**이다.
>
> 아래 §2는 S6이 무엇이었는지의 기록으로 남긴다 — 착수 지점이 아니라 **닫힌 구멍의 설명**이다.

## 0. 지금 어디에 있나

| 항목 | 값 |
|---|---|
| 브랜치 | `feat/observation-grant-stage2` |
| HEAD | `4be607d` |
| **미푸시** | **20커밋** |
| vitest | 235파일 · **4,039 pass** · 1 todo |
| 정적 게이트 | 7종 rc=0 (`check:supported-models`·`check:invariant-drift` 2건은 **선재 잡음** — §5) |
| 워킹트리 | 클린 |

**지켜야 할 제약**: `git add -A` 금지(경로 명시) · main 직접 커밋 금지 · **push/merge는 owner 승인 후** ·
리뷰 좌석은 `gpt-5.6-sol` 단독 · vitest **총계**를 봐야 침묵 스킵이 잡힌다.

## 1. 착지한 것 (이번 트랙 6커밋)

| 커밋 | 단계 | 내용 |
|---|---|---|
| `5be9fd2` | **S1** | 페이지 엔트리가 `body_start`·`body_end`·`range_content_sha256`을 싣는다. 프레이밍 리터럴 통합(필드 누락이 **표현 불가**) · cursor v2 |
| `ee1152d` | **S4** | 페이지 예산 65,536 → **32,000**. 완료 조건을 산술이 아니라 **배선**으로(실제 mint 영수증, 리터럴 핀) |
| `76f150e` | — | 승인된 재조정 flip이 **inert**임을 실측 기록 |
| `45e8b8f` | **F-3** | 풀 층과 전사본 확인 배달을 **한 스위치로**. `source_delivery_reconciliation` 키 제거 · `served` basis 삭제 |
| `1f19741` | **S2** | 배달 판정 좌표를 파트 인덱스 → **문자 구간**. 영수증 v3 · 배달 레코드 v2 |
| `4aec942`·`4be607d` | **S3** | `orng_v1_` 발급·해소 + **인용 단위 교체**. 게이트 순서 해소→카탈로그→배달 |

## 2. 닫힌 것 — S6 (완료, `4995621`)

**owner 결정 A(2026-07-30)**: 구간 provenance를 하류까지 보존한다. 세 지점이다.

| 지점 | 실코드 | 어떻게 닫혔나 |
|---|---|---|
| 영속 evidence ref | `artifact-types.ts` `ReconstructEvidenceRef` | 선택적 `range`를 지닌다. 클러스터의 ref는 **인용된 구간마다 하나** |
| judge 투영 | `direct-call-directive-author.ts` `writeAnswerSupportJudgment` | 구간이 있으면 `cited_ranges`만 보내고 **관찰 투영은 아예 없다**. 본문은 레코드에서 다시 잘라 페이지 해시와 대조(`citedRangeText`) |
| `direct_authority` 검증 | `maturation-validation.ts` | **부분 구간 위에 설 수 없다** — judge를 건너뛰는 유일한 모드라 위반으로 막는다 |

**왜 이게 구멍인가**: 워커가 관찰의 구간 A를 인용했는데 정답이 구간 B에만 있으면, judge는 **B를 보고 A의
인용을 지지한 것으로** 판정할 수 있다. 인용 게이트는 이미 구간 단위지만 **의미 검증 층이 관찰 단위**다.

**완료 조건**: "같은 관찰의 **비인용** 구간에만 정답이 있는" 음성 fixture에서 judge가 지지 판정을 내리지
**못한다**. 공허 방지 — 그 fixture에서 judge 입력이 **인용 구간만 담고 앞뒤 sentinel을 담지 않음**을 먼저
단언한다.

**변이 확인**: judge에 관찰 투영 되돌리기 · 구간과 투영 동시 전송 · 구간 해시 검증 끄기 ·
`direct_authority` 규칙 끄기 — 넷 전부 발화.

## 3. 그 다음 — S5

파티션 기계 제거. **제거 전에** 네 production import 지점(grant fold/projection · reconciliation
fold/projection)이 모두 새 range 권위만 쓰는지 확인한다. 지금은 이미 그렇지만, 제거는 **별도 커밋**이다.

실제로는 `observation-read-coverage.ts`가 이미 range 기반으로 **교체**됐으므로 S5는 잔여 정리에 가깝다:
`part_allowance`의 "분해 identity" 역할 주석 정리, `observationIdsServed`의 위치 재검토(프로덕션 소비자
없음 — 단, **영수증 테스트 18곳이 증거로 읽으므로 지우지 말 것**).

## 4. 켜는 것은 owner 결정이다

**`source_observation_catalog_tool`이 풀 층 전체의 스위치다.** S6까지 끝났으므로 §2의 구멍은 닫혔고,
켜는 것을 막는 *구현* 사유는 더 없다. 다만 켜면:

- 인용 권위가 **전사본 확인 배달**로 옮겨간다(F-3에서 한 스위치로 묶었다). 확인 못 하는 경우는 런 사망이
  아니라 **클러스터 보류 + 공시**다
- 페이지 예산 32,000이 실사용된다. 밀집 요청에서 페이지 수가 늘어 호출 상한 32에 먼저 닿는다(§0-3 정정)
- **라이브 실측이 없다.** 이 트랙은 전부 실 fixture·실 전사본 replay로 검증했고, 풀 층 전체를 켠
  라이브 런은 돌린 적이 없다. `scripts/observation-read-pull-live.mts`가 그 프로브다

## 5. 게이트 rc=1 2건은 선재 잡음이다

`check:supported-models`(G7)가 실패하고 `check:invariant-drift`가 그 실패를 되받는다 — **한 원인**이다.
지적된 13줄의 고유 경로는 2개뿐이고 둘 다 `ignored=yes tracked=no`
(`.onto/reconstruct/20260720-dd6-live-exp2/runtime-events.ndjson` · `.onto/review/20260714-147a9121/runtime-events.ndjson`)
— 로컬 세션 산출물이지 저장소 내용이 아니다. **전수로 뽑아 확인할 것. 빈 출력에서 결론 내지 말 것**
(경로 추출 정규식이 `.ndjson`을 빠뜨려 "1건"이라는 빈 결과가 먼저 나온 적이 있다).

## 6. 문서

| 문서 | 역할 |
|---|---|
| `design/20260727-…/23-implementation-process-range-delivery.md` | **단계 계획 SSOT**. §3에 실측 좌표, §4에 열린 결정과 owner 판단 |
| `design/20260727-…/24-crossverify-packet-range-delivery-plan.md` | 교차검증 패킷 + 실제 디스패치된 세 렌즈 지시문 |
| `design/20260727-…/25-review-gpt-5.6-sol-range-delivery-plan.md` | 교차검증 결과. F-1~F-9와 주 세션의 실코드 재확인 |
| `benchmark/20260730-range-delivery-arithmetic/` | 수치의 출처. **의심되면 다시 재지 말고 다시 돌려라** |

## 7. 이 트랙의 검증 교훈 — 대조군이 네 번 공허했다

전부 **실패해서** 알았지, 리뷰가 알려준 게 아니다.

- **커서 테스트가 1파트 관찰을 써서** `p:1`이 버전과 무관하게 경계 검사로 거부됐다 — 버전 인상 전에도 통과
- **프레이밍 테스트가 `JSON.stringify` 동어반복**이라 리더의 예약을 전혀 안 봤다 — 필드가 없을 때도 통과
- **grant 대조군 둘**이 각각 호출 상한을 넘고 solo 첫 페이지까지 서빙해 구멍을 메웠다
- **충돌 테스트가 `expect(ErrorClass).toBeDefined()`** 로 얼버무렸다 — 진짜 digest 충돌은 구성 불가

처방은 하나다: **대조군을 세운 뒤 "이게 실패할 수 있는가"를 따로 확인한다.** 구멍 대조군은 방향이
load-bearing이고(작은 allowance에서 앞, 큰 데서 뒤), 재조립 길이가 body와 다른 것이 그걸 드러낸다.

그리고 **부재 주장은 전수 확인**이다. `observationIdsServed`를 "프로덕션 소비자 없음"으로 판단했지만
테스트 18곳이 영수증 의미의 증거로 읽고 있었다.
