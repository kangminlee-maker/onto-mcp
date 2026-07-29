# 공허 테스트 4건 정리 — 시작 지점 (2026-07-29)

> **한 줄**: 배달 재조정(PR #271) 구현은 끝났다. 남은 것은 **변이를 통과하는 테스트 4건**을 실패하게 만드는 일이다. 코드 수정이 아니라 **테스트가 무엇을 증명하는지**를 고치는 작업이다.

## 0. 지금 어디에 있나

| 항목 | 값 |
|---|---|
| 브랜치 | `feat/observation-grant-stage2` |
| HEAD | `dfc7cc7` (푸시됨) |
| origin/main 대비 | 57 커밋 |
| PR | #271 (열림, 머지는 owner 결정) |
| vitest | 234파일 · **4,006 pass** · 1 todo |
| 게이트 | **15 green + 2 rc=1** (gitignored 세션 잔해, 매번 `ignored=yes tracked=no` 확인) |
| 워킹트리 | `benchmark/` 만 untracked |

**지켜야 할 제약**: `git add -A` 금지(경로 명시) · main 직접 커밋 금지 · **push/PR/merge는 owner 승인 후** · 리뷰 좌석은 `gpt-5.6-sol` 단독(terra/luna는 리뷰 수준 아님 — 렌즈는 effort·관점·라운드로 넓힌다) · vitest는 **총계**를 봐야 침묵 스킵이 잡힌다.

## 1. 이 작업이 왜 남았나

이 세션에서 **공허 테스트를 12번 만들었다.** 마지막 것(F6)은 리뷰어가 잡았는데, 내가 F6을 *고치면서* 그 수정을 지키지 못하는 테스트를 함께 넣은 경우였다. 8건은 봉인했고 **4건이 남았다.**

판정 기준은 하나다: **제품 코드에 변이를 넣었을 때 테스트가 실패하는가.** 실패하지 않으면 그 테스트는 통과할 뿐 아무것도 증명하지 않는다.

## 2. 남은 4건 — 각각 무엇이 공허한가

### V1. `pull` 테스트: `delivered`가 `cited`의 **진부분집합**이 된 적이 없다

- 위치: `src/core-runtime/reconstruct/observation-read-pull.test.ts:784` (`describe("... 인용 ⊆ 배달 ...")`)
- 현 상태: 두 테스트가 `rendered: emissions`(전부) 또는 `rendered: ["Warning: truncated..."]`(전무)만 쓴다. **all-or-nothing 두 점뿐이다.**
- **통과해 버리는 변이**: "페이지가 하나라도 배달됐으면 모든 인용을 승인" — 부분집합 판정을 통째로 버려도 두 테스트가 다 green.
- 필요한 것: 관찰 2건을 조회·인용하되 **한 건의 페이지만** `rendered`에 넣는다 → 그 한 건만 살아남고 나머지는 거절되는지 단언.

### V2. `O_EXCL` 시작권리를 **순차적으로만** 확인한다

- 제품: `observation-read-facade.ts:561` — `closeSync(openSync(args.descriptor.emissions_path, "wx"))`
- 테스트: `observation-read-facade.test.ts:1016` — `writeFileSync(emissionsPath, "")`로 **먼저 만들어 두고** 생성자가 던지는지 본다.
- **통과해 버리는 변이**: `if (existsSync(p)) throw ...; writeFileSync(p, "")` — TOCTOU 창이 열린 채로도 이 테스트는 green. 즉 지금 증명된 건 "파일이 있으면 거절한다"이지 **"주장이 원자적이다"가 아니다.**
- 후보: (a) 자식 프로세스 N개가 같은 경로를 동시에 주장 → 정확히 1개만 성공, (b) 최소한 던져진 에러의 `code === "EEXIST"`를 단언(손으로 만든 검사에서는 나오지 않는 errno). (a)가 정의적, (b)는 값싼 차선. **플래키 위험이 있으니 (a)는 결정론적으로 설계할 것.**

### V3. temp 이름 고유성을 **작성자 한 명**으로만 확인한다

- 제품: `observation-read-facade.ts:753` `writeFileAtomically` — `${destinationPath}.${randomBytes(6).toString("hex")}.tmp`
- 현 상태: 이 성질을 이름으로 단언하는 테스트가 **없다.**
- **통과해 버리는 변이**: 랜덤 접미사를 지우고 `${path}.tmp`로 되돌려도 전 스위트 green — 그런데 그게 바로 §11-L2에서 고친 결함이다(두 façade가 같은 temp에 쓰고 서로의 반쪽을 rename).
- 증명할 성질: **반쯤 쓰인 바이트가 절대 published 되지 않는다.** `writeFileAtomically`는 동기 함수라 한 프로세스 안에서는 진짜 동시성이 안 나온다 → V2와 같은 자식 프로세스 하니스를 공유하는 게 자연스럽다.

### V4. 다중집합 비교가 **서로 다른 문자열**로만 검증됐다

- 제품: `delivery-reconciliation.ts:100` `unaccountedFor` — `Map<string, number>` 카운트 차집합
- 현 상태: 모든 픽스처의 페이지 문자열이 서로 다르다.
- **통과해 버리는 변이**: `Map` 카운트를 `Set` 소속 검사로 바꿔도 green — 그러면 **같은 페이지가 두 번 방출됐는데 트랜스크립트에 한 번만 있는** 경우가 조용히 정산된다.
- 필요한 것: 동일 `canonical_text` 2회 방출 vs 트랜스크립트 1회 → `recorded_emission_without_sent_record` 거절. 반대 방향(트랜스크립트 2회 · 기록 1회 → `sent_without_recorded_emission`)도 같이.

## 3. 작업 방법 — 이 세션에서 값을 증명한 절차

1. **먼저 변이를 넣고** 현 테스트가 green인지 확인한다(공허함의 실증).
2. 테스트를 고친다.
3. **같은 변이를 다시 넣어** 이제 실패하는지 확인한다. 실패 개수를 기록한다.
4. 변이를 되돌리고 전체 스위트 + 게이트.

> **F6에서 배운 함정**: 내가 돌린 대조군이 내 테스트와 **같은 착각을 공유**했다. 대조는 반드시 **제품 코드**에 넣어라 — 테스트 헬퍼에 넣은 변이는 아무것도 증명하지 않는다.

## 4. 이 4건 다음

| 순위 | 항목 | 내용 |
|---|---|---|
| 1 | **F5** | OFF가 byte-identical이 아니다. emissions + `reconcileFacadeDelivery`가 `pull`(카탈로그 도구 플래그)에만 걸려 있고 `sourceDeliveryReconciliation`에는 안 걸려 있다. **내가 PR 본문·커밋에 "OFF는 오늘과 동일"이라고 쓴 것이 사실과 다르다** — 고치면 그 문장이 참이 된다. |
| 2 | **F4** | 재사용이 배달 기록에 결속되지 않았다(설계 §11-L4 미종결 — 플래그 범위 `delivered_citation_rule_version`만 추가됨). |
| 3 | 미측정 위상 | `Promise.all` 동시 호출 · 다중 `text()` · 겹치는 외부 exec |
| 4 | 기타 | 계약 레지스트리 미등록(façade 영수증도 — 기존 문제) · 워커 프롬프트가 ON일 때도 `served` 규칙을 설명함 · `output-budget.ts`의 `json_parse_repair: 16_000`은 디스패치 사이저로는 죽었으나 출력 헤드룸의 최댓값(제거 시 16k→9k) |

머지는 owner 결정이다.

## 5. 참조

- 설계 SSOT: `development-records/design/20260727-observation-pull-layer-redesign/11-implementation-design-delivery-reconciliation.md` (§6 단계 계획 · §11 결함 목록 · §13 결정)
- 측정: 같은 폴더 `20-measurement-rollout-record-structure.md`
- 직전 핸드오프: `development-records/handoff/20260728-delivery-reconciliation-stage-plan-start-here.md`
