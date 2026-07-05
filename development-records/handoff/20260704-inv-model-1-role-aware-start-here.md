# START-HERE — INV-MODEL-1 역할-인지(role-aware) 진화 트랙

갱신 2026-07-04 (설계 종결판). 이 문서는 `/clear` 후 이 트랙의 단일 진입점.
상위 이력은 auto-memory `unified-comprehension-engine-track.md` 최신 블록 참조.

---

## 0. 현 상태 한 줄

**B1~B3 완료 · L2 트랙 PR #164 머지됨(main=555ffad) · role-aware rebase 후 PR #165
오픈(CI pass·머지 대기) · 다음 = owner 머지 승인 → B4~B7** (설계 SSOT:
`development-records/design/20260704-inv-model-1-role-aware-design.md` §11).

## 0.1 push/PR 기록 (2026-07-05·owner 결정 (a) 실행)

- PR **#164**(feat/l2-real-llm-authoring, 9커밋) 생성·CI pass·**머지 완료** → main `555ffad`.
- role-aware 브랜치를 origin/main에 **rebase**(충돌 0·settings-chain.ts 중첩은 자동 병합) →
  재검증 전부 green: tsc·**full vitest 2396 pass**(main측 +20 흡수·회귀 0)·
  `check:invariant-change -- origin/main` passed·구조 가드 4종.
- rebase 후 커밋 해시: B1 `19b8819`·B2 `cca91b1`·B3 `3a67f40`·FIX `c758e56`·FIX `3c049b8`.
- PR **#165** 오픈(CI pass)·**머지는 owner 승인 대기**.

## 0.5 B1~B3 빌드 기록 (CONFIRMED — 커밋이 증거)

- 브랜치 **`feat/inv-model-1-role-aware`** (2750166에서 분기·미push):
  `2caa59f`(B1 레지스트리 role 스키마) → `eeef1c4`(B2 dispatch resolver+role-aware 게이트)
  → `bbc8780`(B3 소스층 재구조화+seat/opt-in 배선+정본 fold) → `cf8412a`(ultracode 구현
  리뷰 FIX: **P3 mutation-kill 강화**[스프레드 제거→FAIL 실증]·스칼라 축 상수 파생·주석
  정정) → `9206037`(onto 리뷰 FIX: opt-in 술어 단일화·주석 스코프).
- 검증: full vitest **2376 pass**(baseline 2329·회귀 0)·tsc clean·구조 가드 6종·
  `check:invariant-change -- 405c1b5` passed(마커 INV-MODEL-1+INV-CFG-1).
- 구현 교차검증: ultracode `wf_2431489d-7fb`(24a) **pass_with_minor_fixes**→FIX 전부 반영 /
  onto `20260705-7e0e5263`(diff 리뷰) material 5→ 2건 수정·**3건(issue-001/003/006)은 B5
  산물로 이연**(roles 엔트리↔synthesize-cert/v1 record 결속 검증기 — §11 B5 하드 게이트;
  현재 roles 엔트리 0개라 노출 없음)·issue-005는 semantic parity로 수용.
- ⚠️ B5 착수 시 **record 검증기(§6.4)가 선결** — 이연 3건이 그 검증기다.

## 1. 워크트리 / 브랜치

- 워크트리 `/Users/kangmin/cowork/onto-mcp-l2wire` · 브랜치 `feat/inv-model-1-role-aware` ·
  HEAD `9206037`(미push·아래에 L2 트랙 미push 커밋 9개). full vitest = 2376 pass + 1 todo.
- **push/PR owner 결정 대기**: L2 커밋 9개가 브랜치 아래에 깔려 있어 머지 순서
  (L2 먼저 vs 함께) 결정 필요.

## 2. 결정 이력 (전부 owner 확정)

1. role-aware 진화 확정 / 어휘 5종 전체 + 증거계약 2종(author·synthesize) / ⑤a 전례 확장.
2. 1라운드 fork: **(A) 프로덕션 opt-in 배선 포함 · (O1) 완전 충족 벤치 후 등록 ·
   (O2) 벤치 예외 = scoped capability로 지금 재설계**(ambient env 기각).
3. U6: dormant seat(live×seat×opt-in off)은 **opt-in 조건화**(salvage 전례).
4. 진행 방식: §6 한정 확인 라운드 통과 후 빌드 — **통과·fold 완료(v4.1)**.

## 3. 교차검증 이력 (재실행 금지 — 전부 종결)

| 라운드 | ultracode | onto | 결과 |
|---|---|---|---|
| 1 (v1) | `wf_372b8c7c-6c1` 39a·생존 23 | `20260704-990e7395` 15 issue | redesign_narrow → v2 |
| 2 (v2) | `wf_142a1a2f-7c1` 생존 18(쿼터 중단 2회·resume) | `20260704-94e096a6` 23 issue·high 14 | 수렴 T1~T7 → v3 |
| 3 (v3) | `wf_721acd28-c1e` 19a 무오류 | `20260704-ace660db` 14 material | headline 3연속 생존·U1~U7 → v4 |
| §6 확인 (v4) | `wf_17569309-7ec` S6-1/S6-2 | `20260704-cd60f18f` 13 material(전부 med↓) | 전부 bounded → v4.1 fold·종결 |

메타: 매 라운드 양 패밀리 독립 수렴이 결정적이었음([[design-validation-ultracode-onto]]).
주요 수렴: settings-projection strip(F19)·G4 diff-prefix regex(F18·직접 재현)·§6 선언-신뢰
순환·benchCandidate carrier(F25)·@auth phantom(F23)·configure-provider seat 삭제(F20).

## 4. 빌드 착수 가이드 (§11이 정본 — 여기는 요약)

- **B1~B3 즉시 가능**(레지스트리 스키마 → resolver+게이트 → 소스층 재구조화+seat+opt-in+fold).
  전 구간 default-off·커밋 settings 무변경. INVARIANT-CHANGE: INV-MODEL-1 마커 필수
  (settings 스키마 라인은 INV-CFG-1도).
- **B4/B5 선행 의존(비용·owner 인지 필요)**: fixture≥2 = **두 번째 실 워크북 라이브 캡처**
  (merge-stratum은 연쇄 실-LLM leaf authoring·baseline 반복≥3 라이브) — 예산-캡 트랙.
  B1~B3와 독립이므로 월 한도 상황이면 B4/B5만 이연.
- B6(INVARIANTS·G4 패턴·matcher export)·B7(benchCandidate 기계+INVARIANTS §9 문구 동시 착지).
- 검증 앵커: §7 byte-parity 4종·§8 매트릭스(N1~N16·P1~P4·N↔P 쌍)·full vitest 회귀 0.

## 5. clear 후 첫 커맨드

```
cd /Users/kangmin/cowork/onto-mcp-l2wire
git log --oneline -3          # HEAD 2750166 확인
```
그다음 설계 SSOT §11 B1부터. 설계 재검증 불요(§3 표 종결) — 단 B4 하니스 실물화 시점에
record 스키마 자기검증(§6.3 파서 공유 모듈)이 §6의 잔여 검증을 담당.
