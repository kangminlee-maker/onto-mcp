# dispatch breaker 동시-풀 결정성 (Codex F1) — 설계 선작업

작성 2026-07-07. 상태: **owner 결정 C-2 확정 (2026-07-07)** — foundation(concurrent
capability + 결정성 테스트) 배선 완료·default-off(behavior 무변경); 리뷰 풀 배선(concurrent
opt-in)은 하니스(F3) 후 별도 PR. §4-1 후속.
근거 커밋: main `7e4c598`(§4-1 머지 후). 관련: `20260706-s4-backlog-work-order-and-d1-authority.md` §7.

## 0. 요약

Codex 교차검증이 낸 F1(동시 풀 breaker 판정이 completion-order 의존)을 실코드로 재도출한 결과,
**blast radius가 리뷰 lens/stance 풀에 한정되고 severity는 medium**(Codex "high"에서 교정)이다.
이유: 리뷰 회복은 D1a에 따라 continuation frontier(execution-result) 구동이라, F1은 조기-halt
타이밍과 dispatch-incomplete.yaml **disclosure의 재현성**만 흔들 뿐 실 회복을 깨지 않는다.
reconstruct는 순차 canonical 처리라 **면역**이다. 이 문서는 결함 재도출·blast radius·수정 옵션·
테스트 계획·하니스와의 순서를 확정해, 하니스 착지 즉시 구현·검증할 수 있게 한다.

## 1. 결함 재도출 (실코드)

breaker 상태기계(`llm/dispatch-breaker.ts:235-247`): `recordItemSuccess`는 **trip 이전**에
`pendingSystemic` 전체를 dead-letter로 flush하고 streak을 리셋한다(poison-vs-systemic 귀속
휴리스틱: "성공이 lane 생존을 증명하면 pending 실패는 poison이었다"). trip 이후는 freeze
(242행, 동시 풀의 late success가 victim을 poison으로 오분류하는 것을 이미 방지 — 즉 **post-trip
동시성은 처리됨**).

미처리는 **pre-trip 동시성**이다. 리뷰 풀은 `Promise.all`로 동시 실행(stance
`run-review-prompt-execution.ts` `runIssueStanceWorker`, lens `runLensWorker`)하며, 각 워커가 완료
순서대로 같은 `breakerState`에 기록한다. 따라서 systemic 실패 A·B와 성공 D가 있을 때:
- 기록 순서 A→B→C(실패)→D: C에서 pending=3 → **트립**, A·B·C는 incomplete victim.
- 기록 순서 A→B→D→C: D 성공이 pre-trip에 A·B를 flush(dead-letter)·streak 리셋 → C만 pending →
  **트립 안 함**.

동일 outcome 집합이 완료 순서에 따라 트립/분류가 갈린다. (Codex가 `npx tsx`로 재현.)

## 2. Blast radius (실코드로 확정)

| caller | 동시성 | F1 적용 | 회복 authority |
|---|---|---|---|
| 리뷰 lens/stance 풀 | **동시**(Promise.all) | 적용 | **frontier**(execution-result, D1a) — dispatch-incomplete.yaml은 disclosure |
| reconstruct semantic-map | **순차**(canonical observation_id 정렬 후 `for`, run.ts:2528-2536) | **면역** | dispatch-incomplete.yaml이 회복 authority(§4-2) — 순차라 결정적 |

**핵심**: reconstruct는 dispatch-incomplete.yaml이 회복 authority인데(재도출할 frontier 없음),
바로 그래서 저자가 **의도적으로 순차 canonical 처리**해 결정적으로 만들었다(주석 명시). 리뷰는
동시지만 회복이 frontier라 disclosure 비결정성이 회복을 깨지 않는다. 두 경로가 각자의 회복
authority에 맞게 이미 정합한다.

## 3. Severity 교정 (Codex high → medium)

Codex는 "트립/incomplete 집합 상이 → 회복 손상"으로 high를 매겼다. 그러나 리뷰에서 dead-letter된
systemic victim도 execution-result엔 status:failed로 남아 **frontier가 재디스패치**한다 — 회복
손실 없음. 따라서 리뷰 F1의 실 영향은:
1. **조기-halt 타이밍 비결정성** (최적화 — 트립이 늦으면 디스패치 몇 건 더 씀).
2. **dispatch-incomplete.yaml disclosure 재현성** (감사 아티팩트가 순서 의존; 리뷰에선 회복
   authority 아님).

둘 다 재현성/관측성 약화이지 회복·데이터 손상이 아니다 → **medium**(감사·재현성). 단, 향후 리뷰
회복 authority가 frontier에서 아티팩트로 바뀌면(§4-2 재개 시) 재평가 필요.

## 4. 수정 옵션

### Option A — 사후 결정적 기록
풀 완료 후 outcome을 dispatch-index 순서로 breaker에 기록. **비용: 조기-halt 상실**(트립이
전량 완료 후라 미디스패치 절약 없음). 리뷰 breaker의 명시 가치(§8: "조기 halt")를 버린다. 기각 후보.

### Option B — 조기-halt 유지 + disclosure만 사후 결정적 재도출
풀 중엔 live breaker로 조기-halt(tripped() 체크), 최종 disclosure(dead-letter/incomplete)는
완료 outcome을 canonical 순서로 **재분류**해 결정적으로 산출. 장점: 조기-halt·결정적 disclosure
모두. 비용: 분류 경로 이중화(복잡도), live 트립과 disclosure가 다를 수 있음(설명 필요).

### Option C — concurrent-mode 정책: 성공 flush 비활성 → count-based 결정적 트립 (권장)
breaker policy에 `concurrent: true`(리뷰 풀만) 추가. 이 모드에선 `recordItemSuccess`가 pending을
flush하지 않는다 → systemic 실패가 완료 순서와 무관하게 누적, threshold에서 트립(결정적).
**근거**: 동시 버스트에서 일부 성공·일부 429는 "lane 생존 증명"이 아니라 부분 rate-limit이므로,
성공이 victim을 poison으로 되돌리는 휴리스틱은 순차엔 맞아도 동시엔 부적절하다. 미트립 시 pending
systemic은 victim(incomplete)로 종결 — frontier가 어차피 재디스패치. 장점: 결정적 트립 + 조기-halt
유지 + 동시 풀에 더 옳은 의미. reconstruct는 `concurrent` 미설정이라 **불변**. item-local(null
class) 즉시 dead-letter는 그대로. 비용: breaker 상태기계에 정책 분기 1개, 리뷰 풀 동작 변경(검증 필요).

### Option D — 문서화·수용
리뷰 breaker를 best-effort 조기-halt 신호로 규정하고, disclosure 비결정성은 "리뷰 회복은 frontier가
authority"임을 계약에 명기하고 수용. 코드 변경 최소. F1을 low로 재분류. 트립/disclosure 재현성이
감사에 필요하면 부족.

## 5. 권장

**Option C(concurrent-mode 정책)**를 권장한다. 결정적 트립·조기-halt 유지·동시 풀에 더 옳은 의미를
동시에 얻고, 정책 플래그로 reconstruct를 건드리지 않는다. **default 정책 결정은 owner 몫**:
- (C-1) 리뷰 풀 default-on: 현행 동작 변경 → §4-1류 교차검증 필요.
- (C-2) opt-in default-off: 현행 보존(diff로 증명) + 명시 opt-in으로 결정적 모드. §4-1과 동일한
  "default-off 보존" 규율. **권장 default = C-2**(리스크 역전 가능·점진 검증).

Option C가 과하다고 판단되면 **Option D**(문서화)가 최소 대안 — 리뷰 회복이 frontier라 실 손상이
없다는 재도출에 기반한 정당한 수용이다.

## 6. 테스트 계획 (하니스 종속성 분리)

- **breaker 단위(하니스 불요, 지금도 가능)**: `dispatch-breaker.test.ts`에 **결정성 대조 테스트** —
  동일 outcome 집합을 두 순서(A→B→C→D vs A→B→D→C)로 `concurrent` 모드 breaker에 기록 → 트립·
  dead-letter·incomplete가 **동일**함을 고정. 현행(비concurrent) 모드는 상이함을 문서화 테스트로 병기.
- **러너 통합(F3 하니스 필요)**: nested-workers 러너를 동시 stance 풀로 태워, 트립·dispatch-
  incomplete.yaml이 재현적임을 고정. 진행 중인 F3 하니스가 이 경로를 열어준다.
- **OFF twin**: `concurrent` 미설정 시 byte-무변경(diff 증명).

## 7. 하니스와의 순서

- breaker 단위 결정성 테스트(§6-1)와 Option C 상태기계 변경은 **하니스와 독립**(다른 파일:
  dispatch-breaker.ts + 테스트) — 하니스 착지 전에도 가능하나, 리뷰 풀 배선(recordItemSuccess
  호출부는 run-review-prompt-execution.ts로 하니스 영역과 겹침)은 **하니스 다음**이 안전.
- 권장 순서: (1) owner가 §5 default 결정 → (2) breaker 상태기계 `concurrent` 정책 + 단위 결정성
  테스트(하니스 독립) → (3) 하니스 착지 후 리뷰 풀 배선(policy 전달) + 러너 통합 테스트.

## 8. Owner 결정 (2026-07-07 확정)

1. Option C vs D → **C 확정** (결정적 모드 배선).
2. C default → **C-2 확정** (opt-in default-off; 현행 보존 + 리뷰 풀이 코드로 opt-in).
3. F1 severity 교정 high→medium → **승인**.

**후속 상태:** foundation(§4·§6-1 = concurrent capability + breaker 단위 결정성 테스트)은
default-off로 배선·검증 완료. 리뷰 풀 배선(§7-3: `reviewDispatchBreakerFromProfile`에서
`concurrent:true` 전달 + 러너 통합 테스트)은 F3 하니스 착지 후 별도 PR로 진행.

## 9. 독립 리뷰 2라운드 반영 (2026-07-07, foundation PR #178)

라운드1: Claude 집중 2렌즈(상태기계 · 설계-주장). 라운드2: Codex(cross-family) ultracode 3렌즈.
설계 load-bearing 주장(reconstruct 이중 면역·리뷰 frontier-안전 → severity medium·동시성 전제)은
**두 라운드 모두 CONFIRMED**. failure_class 결정성은 2라운드에 걸쳐 정정:

- **[medium] concurrent 트립 `failure_class` 비결정성 → de-scope(정직한 축소)**: 라운드1이 혼합-클래스
  버스트에서 crossing 아이템 클래스가 순서 의존임을 지적 → 1차로 pending 최빈(`dominantPendingClass`)
  도출로 수정. **라운드2(Codex)가 그 수정이 불완전함을 재현**: 트립은 조기(첫 임계 = 먼저 완료된
  N개 prefix)에 발생하므로 최빈을 prefix에서 계산하면 여전히 순서 의존({a:auth,b:auth,c:tr,d:tr}
  threshold 3 → 24순열 12/12로 갈림). **근본 이유**: 트립-시점 failure_class는 본질적으로 prefix
  기반 — 전체 victim 집합은 배치 끝에야 확정된다. **해결**: `dominantPendingClass` 되돌리고
  concurrent 보장을 실제 값으로 축소 — **트립 결정(bool)·count·회복셋·집합 멤버십은 결정적**,
  failure_class는 crossing 클래스 = **best-effort 진단 label**(회복 무관). 테스트도 혼합-클래스에서
  회복-관련 결정성(트립·count·집합)만 단언하도록 교체(failure_class 미단언). 전체 결정적 class 요약이
  필요하면 배치 끝 전체 pending에서 별도 산출(F1 후속, 미착수).
- **[low 문서화] `consecutive_item_count` 네이밍**: concurrent 모드에선 "consecutive"가 아니라
  "누적 distinct" N에서 트립(값은 항상 threshold로 정확). 필드명은 비concurrent 유래 — 감사 시 유의.
- **[low 문서화] disclosure 배열 순서**: `completed_item_ids`/`dead_letter` **배열 순서**는 기록순
  유지(집합은 결정적). 회복 집합 `incomplete_item_ids`는 planned 순서라 **결정적**. concurrent가
  보장하는 재현성 = 트립 bool·count·failure_class·**집합 멤버십**·회복셋. 배열 바이트-순서까지는
  요구 안 함(회복 무관 cosmetic). 필요 시 wiring PR에서 canonical sort.
- **[wiring 고려] poison 비종결**: concurrent 모드는 성공 flush가 없어 systemic-분류 실패를
  dead-letter로 종결하지 않음 → 진짜 item-local(과대 프롬프트 등 매번 systemic 메시지) 유닛을
  frontier가 반복 재디스패치할 수 있음. 리뷰 회복상 dead-letter/incomplete 무차별이라 현재 inert이나,
  **리뷰 풀 배선 시 frontier의 per-unit 시도 상한이 poison 루프를 종결하는지 확인**할 것.

검증: typecheck PASS · dispatch-breaker 테스트(결정성 대조 + 혼합-클래스) PASS · vitest 전체 PASS.
