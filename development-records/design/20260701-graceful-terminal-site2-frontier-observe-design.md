# graceful-terminal site 2 — accepted-frontier-ref un-observable (설계)

> Slice 4 후보. graceful-terminal 안정화의 **두 번째 site** 배선 설계. 날짜 2026-07-01.
> 선행: Slice 3(machinery + site 1) = 커밋 `14aecd9`(교차검증 완료). census/triage SSOT =
> `development-records/design/20260701-reconstruct-throw-census-triage.md`(§7.6 order:
> 2229[site1·done] → **11149[site2·이 문서]** → 12527 → [12688 별도] → 12716 → 12860 → [14123 별도]).
> **이 문서 = 설계만.** 빌드는 교차검증(ultracode+onto)·owner 승인 후(§7.6: 각 site = 설계→교차검증→빌드).

## 0. site 2 identity (실코드 재확인)

`observeAcceptedFrontierRefs`(run.ts:11379) — 탐색 라운드에서 frontier 검증이 **accepted**한 ref를 관측한다. throw가 **3개**:

| line | 조건 | 분류 | 처분 |
|---|---|---|---|
| 11409 | accepted id에 대응하는 source-frontier row 없음 | **구조적 INVARIANT** | 크래시 유지(버그캐처) |
| 11415 | accepted ref가 source inventory에 없음 | **구조적 INVARIANT** | 크래시 유지(버그캐처) |
| **11437** | `!observation \|\| spreadsheetUnsupportedReason(observation)` — 현 runtime이 관측 불가(미지원 .xls/.xlsb/.ods·소멸 ref) | **INPUT-CONDITIONAL** | **graceful 표적 (이 문서)** |

11437만 graceful-ize 대상. 11409/11415는 정상 입력이 깨지 못하는 구조 불변식이라 크래시 유지.

## 1. 처분(disposition) 긴장과 해소 — ★ load-bearing

**긴장**: 코드 주석(11433-36)은 의도를 *"materialize-loop demotion을 mirror"*(= **skip-continue**: 그 ref만 강등, 탐색 계속)로 명시. 반면 census §4는 batch를 *"정직한 blocked/limited 조립 출력"*(= **terminal**)로 프레이밍. site 1(관측 0→terminal)과 달리 site 2는 **관측이 이미 있는 상태**라 두 처분 모두 표면상 가능.

**해소 = 하류 delta 불변식 분석(실코드)**:
- 11437 직후(호출부 13030) → `writeSourceObservationDeltaArtifact`(13050) → **`source-observation-delta-validation`**(13062, `assertRuntimeValidationValid`).
- delta validator(`source-observation-delta-validation.ts:440-454`)는 **모든 accepted frontier id마다 delta row 존재**를 강제: `deltaByFrontierId.has(acceptedId)` 실패 → **`delta_row_missing` violation** → 검증 invalid → `assertRuntimeValidationValid` throw.
- delta row는 관측된 ref서만 생성. ∴ **skip-continue(관측 누락) → delta_row_missing → 더 깊은 크래시**. **census §5(하류 INVARIANT 전제 붕괴) 위험 실증.**
- **terminal(정지)**: 11437서 신호 전파 → delta write(13050) **도달 전** 탈출 → 하류 delta 검증 **회피**. 안전.

**∴ 결정 = graceful TERMINAL** (Slice 3 기계 재사용). skip-continue는 delta 불변식을 함께 완화(별도·큰 변경)하지 않는 한 비viable. 코드 주석의 "mirror"는 오도: materialize-loop demotion은 frontier/delta 기계 *전*(초기 인벤)이라 안전하나, site 2는 ref가 이미 **accepted**되어 delta validator가 관측을 요구.

## 2. disposition 값 = `blocked` (not `limited`)

blocked vs limited는 **출력**을 반영(입력 증거량 아님): `limited`=부분 재구성 산출, `blocked`=재구성 미산출. site 2는 site 1과 동일하게 **semantic authoring 도달 전 정지**(seed/claims/output 0). ∴ **`blocked`**. terminalStepId=탐색/frontier 단계(§3). `limited`는 부분 산출하는 미래 site용 예약 유지.

## 3. 배선 — 중첩 throw + 호출부 ctx populate

**난점**: 11437은 helper(`observeAcceptedFrontierRefs`) *내부*라 run-level ctx(contractRegistry·targetMaterialProfile·reachedRefs) 미가시. site 1은 runReconstruct 본문서 직접 throw라 hoisted `gracefulTerminalContext`를 즉시 populate했으나, site 2는 helper 深部.

**설계**:
- **호출부(13030)서 `gracefulTerminalContext`를 call 직전 populate** — 탐색-phase reachedArtifactRefs(전 prep + source_frontier(+validation) + 현재 sourceObservations + 이전 라운드 delta/lineage 등 **디스크 존재분**)·contractRegistry·targetMaterialProfile. 라운드마다 재-populate(마지막 값=신호 시점 상태).
- **helper는 11437서 `throw new GracefulTerminalSignal({disposition:"blocked", terminalStepId:<§3.1>, reason:<진단>})`** — 신호는 ctx 미운반(site 1과 동일 계약). 신호 전파 → main catch(§S6) → `assembleGracefulTerminal`(기존, 무변경) → ctx read.
- **기존 machinery 무변경 재사용**(assembleGracefulTerminal·createRunManifest graceful·finalize halted·구조가드). site 2는 **새 throw + 새 ctx-populate 지점**만 추가.

### 3.1 terminalStepId 후보
탐색 관측 실패 지점 = `source_observation`(관측 계층) 또는 `source_frontier`(frontier 계층). site 1이 `source_observation`을 씀. site 2는 frontier-accepted-ref 관측이라 **`source_observation`** 재사용이 자연(둘 다 관측 실패)이나, frontier 라운드 맥락을 반영하려면 `source_frontier`도 후보. **교차검증 표적**(§6).

### 3.2 reachedArtifactRefs 정합
site 2 ctx의 reachedRefs는 site 1보다 큼(frontier·delta·scout 등 라운드 산물 추가). **모두 disk 존재필터**(§16.5 재사용). 미도달 하류 stage=transform not_reached. **census witness**: site 2가 census write(`source-observation-lineage-census.yaml`) 前/後인지 실코드 재확인 필요(前이면 witnessRef=null·witness-less 5 stage not_reached; 後면 census read로 legit_conditional 판정). **교차검증/빌드 선결 확인**(§6).

## 4. 개념경제
- **신규 개념 0**. site 1 machinery 전부 재사용. 추가=(a) 11437 throw 교체(Error→GracefulTerminalSignal) (b) 호출부 ctx-populate 1블록.
- eligibility 술어 **불요**: 11437 도달 자체가 조건(관측 null·미지원). site 1의 `isZeroObservationGracefulTerminalEligible` 같은 별도 분류자 없음(throw site가 곧 조건).
- reason=기존 진단 재사용/확장(`accepted source frontier ref cannot be observed by current runtime: <ref>` + 미지원/소멸 구분).

## 5. 안전성 재확인 (census §5·§7.4 비협상 제약)
1. **하류 precondition-break 없음**: terminal이 delta write(13050) 전 탈출 → delta_row_missing 회피(§1 실증). ✓
2. **masking-order**: site 1(2229)이 최우선(이미 done)·site 2는 그 뒤. site 2 graceful화가 앞 site 마스킹 안 함(site 1이 zero-obs서 이미 종결). ✓
3. **sibling invariants(11409/11415) 불변**: 크래시 유지. ✓
4. **비-graceful byte-parity**: 정상 관측(11437 미도달) 경로 무변경. ✓

## 6. 교차검증 표적 (두 패밀리·§7.6)
1. **처분 재검증**: skip-continue가 정말 delta_row_missing으로 깨지나?(§1 실코드 주장 독립 재도출) terminal이 정말 delta write 전 탈출하나?(신호 전파 경로)
2. **terminalStepId**(§3.1): `source_observation` vs `source_frontier` — witness/manifest 정합 어느 쪽이 옳나?
3. **census witness 위치**(§3.2): site 2가 census write 前/後? witnessRef null/실경로 정합.
4. **reachedRefs 완전성**: 라운드 N서 reached 집합이 정확한가?(delta·scout·lineage 라운드 산물 포함·disk 존재)·manifest 검증 통과하나?
5. **ctx-populate 위치**: 13030 call-직전 populate가 multi-round서 stale 위험 없나?(신호는 항상 populate 직후 throw라 안전 주장 검증)
6. **disposition blocked vs limited**(§2): 출력-기준 blocked 판정 sound?
7. **다른 accepted-ref throw**: `observeAcceptedMaturationClosureSourceRequests`(11467) 등 sibling이 같은 패턴인가?(별도 site·범위 확인)

## 7. done-when (falsifiable)
| # | 입력/조건 | 기대 | 반증 |
|---|---|---|---|
| P1 | 초기 관측 有 + 미지원(.xls) accepted frontier ref | blocked terminal 조립·manifest valid·halted·delta 검증 **미도달** | 크래시/delta_row_missing/failed |
| N-inv | 11409/11415 조건(구조 불일치) | **크래시**(INVARIANT 유지) | graceful 오종결 |
| C-parity | 정상 관측(11437 미도달) | 무변경 byte-parity | drift |
| Down-safe | site 2 terminal 후 재-read | terminal 표기·delta artifact **부재**(도달 안 함) | delta invalid 잔존 |
- 각 행 cardinality>0. P1은 **exploration 라운드에 진입**(초기 관측 有)해야 site 1과 변별(site 1은 초기 관측 0).

## 8. 미해결(빌드 선결·교차검증)
- terminalStepId 확정(§3.1·§6-2). → **§9 N2 확정=`source_observation_delta`**
- census witness 위치 실측(§3.2·§6-3). → **§9 N1 확정=site 2 後(13131)·witnessRef=null**
- P1 테스트 fixture: 초기 관측 有 + 미지원 accepted frontier ref를 exploration 라운드서 유발하는 실입력 구성(초기 관측 있는 타깃 + 라운드서 .xls frontier ref accept). site 1보다 구성 복잡.
- ctx-populate 코드 위치(13030 직전) 라인 재확인(Slice 3 shift 반영). → **§9 N4**

## 9. 교차검증 결과 + narrows 확정 (2026-07-01)
`$ultracode-for-codex`(gpt-5.5·xhigh·read-only·3 explorer lens·token 188k) = **gate `gate_pass_with_minor_revisions`**. **방향(skip 아닌 `blocked` graceful terminal)·`blocked` 값·sibling invariant 유지·sibling site 분리 전부 CONFIRMED sound**. wiring 세부 4 narrows(전부 **내가 실코드 독립 재검증**):

- **N1 [HIGH] reachedArtifactRefs 완전성**: site 2(호출부 13030) 시점엔 이미 라운드 산물이 디스크에 있음 — directive(12864)·lens_judgment_index(12932)·exploration_synthesis(12939)·source_frontier+validation(13010) + 이전 라운드 delta/reentry + prep + safety/scout + optional leaf_read_census. **ctx에 이들을 전부 열거하지 않으면** graceful manifest가 *실제 산출된* stage를 `not_reached`로 **거짓 보고**(validator는 non-witness-less stage의 거짓 not_reached를 안 잡음 → honesty 결함·크래시 아님). **제외**(site 2 *후*라 미도달): source_observation_lineage_index(13108)·census(13131)·pre-seed 등. → **빌드=ctx.reachedArtifactRefs에 13030 시점 write-완료 ref 전수 열거**(disk 존재필터가 미존재분만 제거·미열거분은 못 살림).
- **N2 [MED] terminalStepId = `source_observation_delta`**(not `source_observation`): 실코드 확인=`source_observation_delta`는 유효 stage(artifact-types.ts:1580). site 2 시점 source_frontier 이미 write(13010)라 "초기 관측 단계 정지"는 거짓; **다음 실패 경계 = delta write(13050)** → `source_observation_delta`가 witness-truthful·정직. validator는 이 의미 정합 미검사→설계가 직접 맞춤.
- **N3 [MED] §1 문구 정정(first-failure 지점)**: skip-continue의 첫 크래시는 delta **validator**의 `delta_row_missing`(source-observation-delta-validation.ts:440)이 **아니라** delta **builder/writer**(같은 파일 257 `accepted frontier id did not produce a new observation`)—**더 이른** 지점. **결론(skip-continue 크래시→terminal 회피)은 불변**, WHERE만 정정. §1 주장을 "delta writer(257) 또는 validator downstream invariant가 깨진다"로 읽을 것.
- **N4 [LOW] ctx stale 위험**: 호출부 pre-populate는 성공 라운드 뒤 ctx 잔존→미래 site가 set 누락 시 stale assembly. **빌드=ctx를 site-2 call 직전 set + 성공 후 즉시 `null` clear**(guard-clean: 신규 catch 불요→구조가드 `check-graceful-signal-rethrow` 무영향; codex의 local-catch 대안은 populate-then-rethrow가 first-statement bare-rethrow 규칙과 충돌하므로 채택 안 함). `assembleGracefulTerminal`의 `if(!ctx) throw`가 forgot-set을 fail-loud로 잡음(clear 덕분).

**개념경제 재확인**: N1~N4 전부 wiring 정련(신규 개념 0 유지). Slice 3 machinery 무변경. **sibling** `observeAcceptedMaturationClosureSourceRequests`(11533·codex line; seed 後)는 별도 site(disposition/reached 다를 수 있음)=이 cut 밖 확정.

**completeness critic(codex)**: static inspection만·테스트 미실행. 빌드 시 P1 fixture가 실제 site 2 도달하는지·manifest가 real path서 valid인지·stale/reused session root서 census 오독 없는지·poll/MCP status가 `blocked` 종결인지 확인 필요(=§7 done-when + 빌드 검증).

**판정 = 방향 확정·wiring narrows 4 반영 후 빌드**(재설계 아님). §16(Slice 3) machinery 재사용.

### 9.1 빌드 완료(2026-07-01·미커밋)
- **N1~N4 전부 반영**: 11437 throw→GracefulTerminalSignal(blocked·`source_observation_delta`·N2)+진단 reason(unsupported/vanished 구분)·주석 정정(N3). 13043 호출부 ctx **전수 reached refs**(prep+run-control+registry+safety/scout+leaf_read_census+directive+lens+synthesis+frontier+prior delta/reentry)·성공 후 `null` clear(N4). 11409/11415 크래시 유지. 신규 catch 0=구조가드 무영향.
- **E2E 실증(N1 직접 검증)**: custom mock(frontier author가 `.xls` accept)로 exploration 라운드→site 2 실도달. `run.test.ts` "site 2 un-observable" = status blocked·terminal_disposition·terminal_step_id `source_observation_delta`·**reached exploration artifacts(directive/lens/synthesis/frontier) 전부 completed**(N1: 누락 시 not_reached됐을 것)·delta 미완료·manifest valid·halted. 실입력(materialize 실demote+frontier 실accept+실 미관측). frontier 검증이 in-inventory·미관측 ref accept(11310-18) 실코드 확인.
- **검증**: tsc clean·정적게이트 통과·**full vitest 140파일 2148 pass 회귀0**·구조가드 15 catch.
- **미해결→해소**: mock 기본 frontier=빈=[](mock-llm-realization.ts:258)라 표준 하네스로 site 2 미도달→custom llmCall override("Convert exploration synthesis" 분기)로 실도달 E2E 구성.
