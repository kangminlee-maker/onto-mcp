# 공허 테스트 정리 — **완료** (2026-07-29)

> **한 줄**: 4건으로 적었으나 **실제로 열려 있던 것은 3건**이었고, 전부 봉인했다. 남은 일은 F5 → F4다(§4).

**결과**: V1·V2·V4 봉인(테스트 3건 추가, 제품 코드 변경 0). **V3은 이미 닫혀 있었다** — 아래 §2 참조.
vitest **234파일 4,009 pass · 1 todo**, 게이트 **15 green + 2 rc=1**(잔해 2건 `ignored=yes tracked=no` 확인).

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

## 2. 4건의 처리 결과

각 항목은 **변이를 넣어 공허함을 실증한 뒤** 고쳤고, 같은 변이를 다시 넣어 실패를 확인했다.

### V1. `pull` 테스트: `delivered`가 `cited`의 **진부분집합**이 된 적이 없다 — ✅ 봉인

- 위치: `src/core-runtime/reconstruct/observation-read-pull.test.ts:784` (`describe("... 인용 ⊆ 배달 ...")`)
- 현 상태: 두 테스트가 `rendered: emissions`(전부) 또는 `rendered: ["Warning: truncated..."]`(전무)만 쓴다. **all-or-nothing 두 점뿐이다.**
- **통과해 버리던 변이**: "페이지가 하나라도 배달됐으면 모든 인용을 승인"(`delivered` 분기 한정 — `served` 분기엔 이미 진부분집합 테스트가 있다). **39개 전부 green이었다.**
- **처방**: 헬퍼에 `fetchCalls`(호출당 배치 하나)를 추가해 관찰마다 **자기 페이지**를 갖게 하고, 한 관찰의 페이지만 `rendered`에 넣는다. 도착한 것만 인용하면 승인되고, 못 온 것을 인용하면 **그 id만 이름이 불려** 거절된다(`not.toContain(arrived)`가 진부분집합 단언).
- 실측: 수정 후 같은 변이 → **1 failed**.

### V2. `O_EXCL` 시작권리를 **순차적으로만** 확인한다 — ✅ 봉인

- 제품: `observation-read-facade.ts:561` — `closeSync(openSync(args.descriptor.emissions_path, "wx"))`
- 테스트: `observation-read-facade.test.ts:1016` — `writeFileSync(emissionsPath, "")`로 **먼저 만들어 두고** 생성자가 던지는지 본다.
- **통과해 버리던 변이**: `if (existsSync(p)) throw ...; writeFileSync(p, "")` — TOCTOU 창이 열린 채로도 green이었다. 증명돼 있던 건 "파일이 있으면 거절한다"이지 **"주장이 원자적이다"가 아니었다.**
- **처방 — 동시성 없이 결정론적으로 가른다**: 방출 경로에 **끊어진 심링크**를 놓는다. 이 플랫폼 실측으로 `existsSync`는 링크를 **따라가서 false**를 보고하는데, `O_CREAT|O_EXCL`은 심링크를 **EEXIST로 거부**한다(POSIX). 그래서 check-then-write 주장은 그대로 통과하고 **링크의 타깃까지 만들어 버리는** 반면, 배타적 open은 속지 않는다. 자식 프로세스도 배리어도 필요 없고 플래키하지 않다.
- 실측: 수정 후 같은 변이 → **1 failed**(`expected [Function] to throw an error`).

### V3. temp 이름 고유성 — ⚠️ **이미 닫혀 있었다 (내 §2 서술이 틀렸다)**

- 제품: `observation-read-facade.ts:753` `writeFileAtomically` — `${destinationPath}.${randomBytes(6).toString("hex")}.tmp`
- **"이 성질을 단언하는 테스트가 없다"고 적었는데 있었다.** `observation-read-facade.test.ts:1145` "publishes through a temp name no other facade can pick" — 커밋 `844a8c2`(단계 3a-1)에 이미 들어 있었고, 심지어 **내가 새로 쓴 것과 동일한 트릭**(예측 가능한 이름 자리에 디렉터리를 놓아 `openSync(w)`를 EISDIR로 만든다)을 쓴다. 랜덤 접미사를 지우는 변이를 넣으니 그 기존 테스트도 함께 실패했다 → 내 중복분은 삭제.
- **왜 틀렸나**: 테스트 파일에서 `rg ... | head -20`으로 검색하고, **잘린 목록에서 부재를 결론냈다.** 1145행은 잘려 나간 뒤였다. → 부재를 주장할 땐 검색을 자르지 말 것.

### V4. 다중집합 비교가 **서로 다른 문자열**로만 검증됐다 — ✅ 봉인

- 제품: `delivery-reconciliation.ts:100` `unaccountedFor` — `Map<string, number>` 카운트 차집합
- 현 상태: 모든 픽스처의 페이지 문자열이 서로 다르다.
- **통과해 버리던 변이**: `Map` 카운트를 `Set` 소속 검사로 바꿔도 **51개 전부 green** — 그러면 **같은 페이지가 두 번 방출됐는데 트랜스크립트에 한 번만 있는** 경우가 조용히 정산된다. 반복 조회는 가설이 아니다: fold가 그것을 한 part로 접는 이유가 façade가 같은 페이지를 두 번 서빙할 수 있어서다.
- **처방**: 동일 `canonical_text` 2회 기록 vs 전사본 1회 → `recorded_emission_without_sent_record`. 반대 방향(전사본 2회·기록 1회) → `sent_without_recorded_emission`. **대조군**으로 2회 대 2회는 여전히 `verified`(안 그러면 "중복이면 무조건 거절"도 통과한다).
- 실측: 수정 후 같은 변이 → **1 failed**.

## 3. 작업 방법 — 이번에 값을 증명한 절차

1. **먼저 변이를 넣고** 현 테스트가 green인지 확인한다(공허함의 실증).
2. 테스트를 고친다.
3. **같은 변이를 다시 넣어** 이제 실패하는지 확인한다.
4. 변이를 되돌리고 — `git diff --stat -- src/`로 **제품 파일이 바이트 복원됐는지** 확인하고 — 전체 스위트 + 게이트.

> **F6에서 배운 함정**: 내가 돌린 대조군이 내 테스트와 **같은 착각을 공유**했다. 대조는 반드시 **제품 코드**에 넣어라 — 테스트 헬퍼에 넣은 변이는 아무것도 증명하지 않는다.

> **이번에 얻은 것**: 동시성이 필요해 보이는 성질도 **커널이 두 구현을 다르게 대하는 지점**을 찾으면 결정론적으로 갈린다. 끊어진 심링크(`existsSync` false vs `O_EXCL` EEXIST)와 자리를 점유한 디렉터리(`openSync(w)` EISDIR)가 그것이다. 자식 프로세스 경합 하니스는 결국 필요 없었다.

## 4. 다음

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
