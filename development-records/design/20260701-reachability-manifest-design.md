# reachability-authority manifest 설계 (graceful-terminal Cut-1 조각 B)

> 상태: **DESIGN v2 (v0·v1 양-패밀리 반증 후 witness-기반 재설계·교차검증 대기)**. 날짜 2026-07-01 · baseline `feat/maturation-value-read` HEAD `940fdb0`.
> 상위: `20260701-shared-graceful-terminal-step1-design.md`(§5.5·§12). onto union delta issue-016/011.

## 0. 문제 (한 줄·불변)
graceful terminal이 **미도달 stage를 무조건 skipped로 채우면**, *진짜 미배선(un-wired) stage*(버그)가 "의도적 미도달"로 위장하는 **마스킹 표면**이 됨(Defect-1 telemetry class 재현). 필요 = 미도달을 정직히 기록하되 **버그가 legit-skip으로 위장 불가**하게.

## 0.5 v0 REFUTED (canonical-index cut) — 박제
v0(단일 canonical-index 경계 cut)=양 패밀리 반증(ultracode `wf_0d1e57be-867` masking_hole_closed=false + onto `20260701-0f5f0f1b` 19 issue[10 high]). 반증 전제: **단조성 거짓**(`leaf_read` idx30가 `lineage` idx28보다 먼저 실행·`post_maturation` idx16-18 post-handoff → canonical 순서 ≠ 실행 순서)·마스킹 미해결·site-1 경계 오류(실제=`source_safety` idx10).

## 0.6 v1 REFUTED (execution-measured + allowlist) — 박제 + ★진짜 구조 발견
v1(실행-측정 reached-set + skip_kind + allowlist-membership)=양 패밀리 반증(ultracode `wf_c8e89119-692` masking_hole_closed=false·reached_authority_sound=false·3 high + onto `20260701-7bde8295` 15 issue[8 high]). **★그러나 두 리뷰 모두 "실행-측정 authority 방향은 SOUND·생존"** — v0의 순서-추측을 올바로 죽임. 깨진 3 다리 + 진짜 해법:
1. **capture-point(M1)**: reached를 artifact-ref *기록 시점*에 잡으면 "reached AND no-ref → legit_conditional" 분기가 **논리적 공집합**(ref 썼으니 reached). ⇒ ref 없이 돌 수 있는 stage가 항상 not_reached로 붕괴·버그 은닉.
2. **allowlist-membership-only(M2)**: §4가 조건 아닌 **멤버십만** 검사. witness-less 조건부 stage(delta/lineage/reentry)는 정상 no-op 크래시 회피 위해 **반드시 allowlist에 있어야** 하는데, 있으면 legit no-op과 ref-drop 버그가 구별 불가.
3. **drift-guard 공허(M3)**: ref-write capture 하에서 guard 두 검사가 구조적으로 무의미(allowlisted=ref-면제라 "돌았나"를 ref로 못 물음).
★**진짜 해법(양 패밀리 수렴·leaf_read 선례)**: **witness**. `leaf_read`(run.ts:1698-1710)·`maturation_value_read`(3212)는 **돌면 census를 *항상* 기록**(영 라벨이라도)·**author가 못하면 census 없음→skipped**·`all_attempts_failed` 플래그=condition-witness. 코드 주석: "No census — honestly distinct from 'ran and produced nothing'". 저자가 이 문제를 이미 leaf_read엔 풀었음(f1a3c1b). ⇒ **v2 = 이 witness 패턴을 authority로 일반화.**

## 1. v2 핵심 원칙 = **witness가 유일 reachability authority**
"stage X가 돌았나?"는 **기록된 사실(witness)**로만 답한다 — 순서 추측(v0)도, ref-존재 추론(v1)도, allowlist 멤버십(v1)도 아님.
- **witness** = stage가 돌았을 때 *항상* 남는 흔적: (a) 그 stage의 artifact ref(항상-산출 stage), 또는 (b) **항상-기록 census/breadcrumb**(조건부 stage·leaf_read식), 조건 결과도 함께 기록.
- **reached = {witness 존재 stage}**. witness 없음 = not_reached(정직).

## 2. 두-클래스 모델 (M4·명시)
| 클래스 | stage | witness | 오늘 상태 |
|---|---|---|---|
| **witness-bearing** | 대부분 unconditional(ref 항상 산출) + `leaf_read`·`maturation_value_read`(항상-census) | ref/census 존재=돎·부재=안 돎 | **이미 sound**(신규 불요·machinery 제외) |
| **witness-less 조건부** | `source_observation_delta`·`_validation`·`source_observation_reentry_validation`·`source_observation_lineage_index`·`_validation` (run.ts:2881-2948·라운드 루프서 no-op 시 ref 없음·census 없음) | **없음** | null-ref가 "no-op vs 안 돎 vs 버그" 3중 모호 |

## 3. v2 메커니즘 = witness-less 5개에 census 부여 (leaf_read 패턴 재사용)
- **witness-less 조건부 stage에 항상-기록 witness 추가**. ★최소-scope 권장: 이 5개는 전부 **다중-라운드 관측 lineage** 소속 → **단일 `source-observation-lineage-census`(항상 기록: 실행 라운드 수·라운드별 delta 유무·lineage 종결 여부)** 하나가 5개 전부를 witness(개별 5 census 불요). = leaf_read census와 동형·조건 결과 포함.
  - lineage census 존재 → delta/lineage/reentry 그룹 **돎**(census가 각 산출 유무 기록). 없음 → 그룹 전체 **not_reached**.
- **manifest 규칙**: 각 canonical stage —
  - witness(ref/census) 존재 **AND** artifact ref 존재 → `completedStep`.
  - witness 존재 **AND** ref 없음 → witness의 조건 결과로 판정: 조건=legit-no-op → `skippedStep(skip_kind='legit_conditional')`; 조건=produce-expected인데 ref 없음 → **위반**(버그).
  - witness 없음 → `skippedStep(skip_kind='not_reached')`.
- `ReconstructRunManifestStep`에 **typed `skip_kind: 'legit_conditional' | 'not_reached'`**(v1서 유지).

## 4. validator 규칙 (M2·M5·M7 해소)
graceful는 **manifest의 명시 플래그**(`terminal_disposition ∈ {blocked,limited}` 또는 `graceful_terminal: true`)로 식별 — **">=1 not_reached step" 추론 폐기**(M5 spoof 차단). 플래그 있을 때:
1. **completed**: ref 존재 필수(종전·버그 적발).
2. **`legit_conditional`**: 그 stage의 **condition-witness가 "legit no-op 조건 성립"을 확인**해야(멤버십 아님·M2). witness가 "produce-expected" 또는 witness 부재면 legit_conditional 불가 → 위반 `manifest_unwitnessed_conditional_skip`.
3. **`not_reached`**: witness 부재 확인(census/ref 없음). witness 있는데 not_reached면 위반(마스킹 시도).
4. **completeness**: 89 stage 각 step 존재. **reached-gating은 전 unconditional 블록 커버**: 2825-2880 + **2966-2993(source_purpose_candidates/validation·M7 누락 교정)** + 2994-3108.
5. **completed run(플래그 없음)**: 종전 규칙만·**byte-parity**.
- **allowlist 폐기(M7)**: "legit-skip 가능" = "condition-witness 방출" — 별도 hand-list 없음(2번째 진리원 제거). witness 방출 여부가 곧 authority.

## 5. execution_profile 정직화 (RM-2)
graceful면 `execution_profile.allowed_completion_claim`을 truthful 문구로 치환·`profile_kind` 강등. done-when이 blocked manifest에 "completed the live integral reconstruct path" 부재 단언.

## 6. falsifiable done-when (M6·비-공허·다중 site·condition-vector)
- **P1 site-1**(경계=`source_safety`·교정): graceful → manifest valid.
- **★N1 배선버그(M6 교정)**: reached stage(ref 산출형)의 ref 강제 null → `manifest_artifact_ref_missing`.
- **★N-COND(M6 핵심·v1 놓침)**: witness-less stage가 **돌았고(census 존재) 조건=produce-expected인데 ref null**(=ref-drop 버그) → `manifest_unwitnessed_conditional_skip` 위반. + 같은 stage가 **돌았고 조건=legit-no-op** → legit_conditional valid. 두 벡터가 **census 조건 필드로 구별**됨을 단언.
- **N2 site-3 leaf_read**: leaf_read census 존재(돎)면 not_reached로 강등 안 됨.
- **N3 witness 부재**: census/ref 둘 다 없는 stage만 not_reached.
- **N4 marker**: bare skipped(skip_kind 없음)로 위장한 not-reached 버그 stage → graceful 플래그 하 위반(M5).
- **C1 대조군**: completed run byte-parity.
- **cardinality>0**: 각 대조 subject 비어있지 않음.

## 7. v1 반증 → v2 해소 매핑
| v1 반증 | v2 해소 |
|---|---|
| M1 capture-point 공집합 | §1 witness(census)로 capture — ref-write 아님·§3 lineage census |
| M2 allowlist membership-only | §4 rule2 **condition-witness 평가**(멤버십 폐기) |
| M3 drift-guard 공허 | §1 reached=witness 존재(ref-면제 아님)→guard 유의미 |
| M4 witness 비대칭 | §2 두-클래스 명시·witness-bearing 제외·witness-less만 census |
| M5 marker spoof + partial 미하드닝 | §4 명시 graceful 플래그(추론 폐기) |
| M6 done-when 공허 | §6 N-COND condition-vector 대조 |
| M7 enum 누락 + allowlist drift | §4.4 2966-2993 포함·§4 allowlist 폐기(witness=authority) |
| M8 halted overload | 상위 §5.1과 정합(halted=run-control·reached=manifest·분리 유지) |

## 8. scope (owner "제대로" 선택)
- **신규 코드**: witness-less lineage 그룹에 **단일 항상-기록 census**(leaf_read `f1a3c1b` 패턴 재사용·조건 필드 포함) + createRunManifest witness-gating + validator condition-witness 규칙 + skip_kind enum + 명시 graceful 플래그. **개념경제**: 신규 top-level status 없음(skipped 재사용)·allowlist 없음(witness=authority)·INVARIANT 완화 없음.
- **캡처 방식**: reached는 witness(ref/census) 존재로 파생 — **89-site threading 불요**(witness가 이미 disk 사실).

## 9. 다음
v2 → 교차검증(양 패밀리·§6 N-COND가 핵심 falsifiable 판정자) → 구현 → Cut-1 나머지 조립.
포인터: 상위 `20260701-shared-graceful-terminal-step1-design.md` · census `20260701-reconstruct-throw-census-triage.md`.
