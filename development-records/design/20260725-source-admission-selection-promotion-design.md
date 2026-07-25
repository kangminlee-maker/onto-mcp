# `source_admission_selection` 승격 결정 설계 (SSOT)

- 작성: 2026-07-25
- 상태: **owner 승인 — 하니스 선행 작업 착수**
- 결정 대상: `reconstruct.execution.source_admission_selection` 을 repo 기본값 ON 으로 승격할 것인가
- 현재 상태: `.onto/settings.json` 에 **부재 ⇒ OFF**

## 1. 권고 — Q(측정 후 결정), 사전등록 규칙으로 1회 종결

기본값은 OFF 로 유지하고, 아래 사전등록 규칙 하에 가치 벤치를 **1회** 돌린 뒤
그 결과가 기계적으로 승격/거부를 결정한다. 결과 해석 논쟁이 생기지 않도록
합격선은 **실행 전에** 고정한다.

### 1.1 왜 그냥 켜지 않는가 — 창립 근거가 이미 소멸했다

admission 은 **고장 대응**으로 만들어졌다. 59파일 코퍼스에서 관찰-ALL 이
`source-observation-directive` 투영을 1,349,907자로 만들어 codex stdin 상한
(1,048,576 byte)을 넘겨 **13초에 죽었다**.

그 고장은 **다른 기능이 이미 닫았다**. `source_breadth_fold` (현재 라이브 ON)가
detail ladder 로 접어 동일 코퍼스에서 **1.35MB → 353KB 정상 dispatch** 를 만든다.

가치 벤치 문서 자신의 결론(원문): *"단 총량 cap 부재 탓이라 'Stage 2만이 유일
해법'은 과장 — 진짜 값 = 목적-집중 선택"*.

⇒ 남은 주장은 **비용 절감(확실) ↔ 이해폭 손실(미측정)** 뿐이다.
59 deep → 최대 16 deep 은 산술적으로 확실하지만, 나머지 43파일이 600자 outline
으로만 보이는 대가는 **한 번도 측정된 적이 없다**. 이 미지수는 owner 가 밝힌
제품 본령("대규모 시스템 증류")을 정면으로 겨눈다.

### 1.2 왜 그냥 거부하지도 않는가

확실한 절감을 감으로 버리는 것이 된다. 그리고 **fold 승격이 곧 이 비교를 처음으로
가능하게 만든 사건**이다 — 이전에는 OFF arm 이 완주 자체를 못 했다.

### 1.3 왜 지금이 적기인가

승격은 어차피 **0.4.17 publish 전까지 불가능**(§5). Q 는 그 대기 시간 안에서
수행되므로 일정상 추가 비용이 사실상 없다.

## 2. 증거 재판정 — 기존 live N=1 은 값을 증명하지 않는다

`benchmark/stage2-admission-live/2026-07-22T14-08-21-904Z.json` (60파일, 실 OAuth,
done-when 3/3 PASS)에 대한 감사 결과:

| 항목 | 판정 |
|---|---|
| 코퍼스 | **합성.** 4개 하드코딩 템플릿 × 15 사본 (`stage2-admission-live-e2e.mts:104-160`), `i` 접미사만 치환 |
| "60개 중 1개 선택" | **LLM 실선택 맞음** (rationale 이 도메인 특정적이고 floor 고정 문구 미포함). 다만 LM 자신이 나머지를 *"structurally duplicative"* 라 기록 — **선택은 옳았고, 코퍼스가 변별력이 없다** |
| done-when #1 | **공허.** `SOURCE_ADMISSION_SELECTION_FLOOR=1` 이 `accepted≥1` 을 구조적으로 보장하고 floor 가 비어있지 않은 rationale 까지 주입하므로, 실선택과 floor fallback 을 구별 못 함 |
| done-when #2/#3 | 실제 회귀 포착력 있음(경로·누출·outline 보존). 단 **선택 개수에 대한 단언은 없음** — 1~16 이면 통과 |
| 미계상 14유닛 | 60−1−45=14. 후속 frontier/maturation 라운드가 admitted 파일을 독립 deep 관찰하되 `is_runtime_target_source:false` 로 찍는 제3 모집단 가설(`run.ts:16273,16418,16043`). **저장 증거로 확증 불가** — 원 아티팩트는 gitignored `.onto/temp/` 에 있다 소실 |

**이 아티팩트가 licensing 하는 주장**: "실 OAuth seat 에서 경로가 end-to-end 로
발화하고 admitted/deep/deferred 3분할이 구조적으로 온전하다" — 그 이상은 아니다.
아티팩트 자신의 `product_claim_limit` 과 일치한다.

### 2.1 형제 벤치 선례 — 애매한 결과가 나올 확률이 낮지 않다

`benchmark/breadth-fold-selection-quality/` (실 openai-node src 48파일 부분집합,
동일 기능군의 선택 품질 측정): jaccard ≈0.82 로 `full` 자기반복 노이즈 바닥과
구별 불가. 표제 *"indistinguishable from noise, not evidence of parity."*

⇒ **동점 처리 규칙을 실행 전에 못 박는 것이 이 설계의 핵심**이다.

## 3. 사전등록 판정 규칙

계기: `scripts/stage2-value-bench-run.mts` (실 openai-node src 코퍼스, drift 가드 있음)
판정: **신선 Opus 서브에이전트의 블라인드 paired 채점** — 중립 CQ 세트 기준.
근거 SSOT = `development-records/design/20260723-stage2-value-bench-design.md` §5·§9.1·§9.4~§9.6.

> **정정 (2026-07-25)**: 이 문서 초안은 판정자를 `semantic-quality-gate.ts` 로 적었다.
> **틀렸다.** 그 게이트는 `ReconstructQualityGateFixtureId = "reconstruct-golden-target-v1"
> | "reconstruct-golden-target-v2"` 의 **닫힌 fixture 집합**에 `scope:"fixture_specific"`
> 로 묶여 있어 openai-node 코퍼스를 채점할 수 **없다**. 원인은 내가 blind packet 에
> 그 게이트를 "가용 판정기"로 넣으면서 fixture-scope 를 명기하지 않은 것이고, 그래서
> 두 초안 모두 실행 불가능한 계기 위에 판정 규칙을 세웠다. 아래는 벤치 설계가 이미
> 소유한 실 계기로 교체한 것이며, 교체본이 초안보다 **더 엄격**하다(음성 대조 게이트,
> 측정된 ε, discriminating-CQ 요구가 모두 추가됨).

### 3.1 유효성 조건 (하나라도 실패 ⇒ 판정 없음, 계기 수리 후 재실행)

런 층 (§9.6, 하니스가 throw 로 강제):
- 양 arm `record_stage == completed`
- `OFF admitted == 0 ∧ ON admitted > 0`
- `configsMatchExceptOptIn` 통과 (해결된 config 가 opt-in 외 동일)
- 코퍼스 manifest sha drift 없음
- **ON 의 floor-이전 LLM 선택 수 > 0** — floor 가 만든 green 은 "실패"가 아니라
  **"측정 무효"** 로 분류한다. floor 강제승격만으로 통과한 run 은 admission 의
  선택 능력을 전혀 검증하지 않는다. (§4.2 로 측정 가능해짐. 이 조건은 이번 설계가
  벤치 설계 §9.6 에 **추가**하는 항목이다.)

판정 층 (§9.5·§9.6):
- CQ 세트 N ≥ 8 (저작 목표 N ≥ 12), 양 seed 채점 결과 non-empty
- **discriminating CQ ≥ 3** (두 seed 판정이 갈리는 문항). 미달 = 세트 무효 —
  변별력 없는 세트의 "동등" 은 동등의 증거가 아니다
- **음성 대조 게이트 (필수·선행)**: distractor-only 증거로 저작한 "그럴듯하나 틀린"
  대조 seed 가 OFF 보다 material 하게 낮아야 한다 (`OFF − control ≥ 3 CQ`).
  실패 시 **ON-vs-OFF 수치를 읽지 않고 전체 벤치 무효·중단** — judge/CQ 가 좋은 seed 와
  나쁜 seed 를 구별 못 한다는 뜻이므로 어떤 비교도 신뢰할 수 없다.
- judge 실패콜 = 하니스 에러 (침묵 `unsupported` 로 흡수 금지 — salvage 금지)
- 블라인드 정규화 적용 확인 (`seed-*.normalized.yaml`: limitation/deferred/provenance/
  source-ref 메타 제거 — ON 자기식별 신호 차단), 라벨 무작위화

### 3.2 승격 조건 (전부 충족해야 승격 후보)

1. **품질 비열등성** (주지표 1개 pre-commit): 중립 CQ 세트에 대해
   **ON supported-rate ≥ OFF − ε**, **ε = max(제품하한 1문항, 2σ)**,
   σ 는 **paired judge ≥3 패스에서 측정**한다. partial-weighted 는 sensitivity 보조일 뿐
   게이트가 아니다.
2. **비용**: 하니스가 선언한 primary axes 로만 판정 —
   **`provider_tokens_total` + `final_deep_file_count`** (양쪽 `:409-410` 에 실재 확인).
   ON 이 실질 절감을 못 내면 남은 주장이 없으므로 거부.

**1회 종결 방식 (초안 대비 변경)**: 초안은 ±0.05/±0.10 고정 밴드와 "경계면 풀런 1회 반복"
을 규정했다. 교체본은 반복을 **비싼 축이 아니라 싼 축**에 둔다 — reconstruct 풀런은
**arm 당 1회**(긴 pole)이고, 변동성은 judge paired ≥3 패스(σ→ε)와 admission 선택 스테이지
단독 ≥3회(선택 안정성)로 유계화한다(§9.7). 즉 임계값을 내가 손으로 고르는 대신
**판정자 잡음에서 측정해** 정한다. 이쪽이 사전등록으로서 더 정직하다.

**드롭된 초안 게이트 — "Q3 zero-dropped-CQ 하드 거부"**: 유지하지 않는다. ε 프레임워크가
judge 잡음을 흡수하려고 존재하는데 그 위에 단일 문항 무관용 게이트를 얹으면 잡음 1건이
승격을 죽인다(과잉 제약). 대신 **비블로킹 disclosure** 로 강등한다 — 리포트가
`OFF supported → ON unsupported` 로 뒤집힌 CQ 목록을 per-CQ 로 싣고, 총계가 통과해도
owner 가 어떤 이해폭이 깎였는지 보고 판단한다. (원칙: 결정론적으로 판정 가능한 구조/보안
위반만 하드 블록하고, 의미·커버리지 우려는 disclosure 로 라우팅.)

**wall-time / dispatch 수는 게이트로 쓰지 않는다** — 하니스가 이미 informational
로 선언했고, ON 은 선택 라운드 추가로 **정당하게 wall-time 에서 질 수 있다**
(`"round asymmetry may make ON lose here — honest"`). 이를 승격 게이트로 걸면
좋은 결과를 잘못 거부한다.

### 3.3 측정을 무효화하는 것

arm 간 overlay 외 차이 / ON arm 공허(admitted 0 또는 floor-only) / de-blinding 누출 /
judge 실패콜 / discriminating CQ < 3 / **음성 대조 게이트 실패**.
CQ 세트 천장 한계(§6)는 무효화 사유가 아니라 **공개된 타당성 한계**다.

## 4. 하니스 선행 작업 (런타임 변경 0)

### 4.1 fold 를 양 arm 에 명시 설정 — **필수**

`CODE_OPTINS` (`stage2-value-bench-run.mts:73`) 에 `source_breadth_fold: true` 추가.

근거: 벤치는 repo `.onto/settings.json` 을 **읽지 않는다**
(`resolveSettingsChain(_ontoHome, projectRoot)` 의 첫 인자 미사용,
`settings-chain.ts:2119-2122`). `~/.onto/settings.json` 에도 세 키 전부 부재.
부재 = false (`run.ts:2031` `sourceBreadthFold === true`).
⇒ **오늘 그대로 돌리면 양 arm 다 fold OFF 이고 OFF arm 은 예전처럼 죽는다.**
"fold 덕에 OFF arm 이 완주 가능"은 런타임엔 참이나 **하니스엔 거짓**이었다.

안전성: `configsMatchExceptOptIn` 은 `source_admission_selection` 만 stripping
하므로 양 arm 동일 적용 시 common-basis 가드 무손상. 그 파일 주석이 이미 정한
원칙("opt-in 은 상속받지 말고 명시 설정")과도 일치.

### 4.2 floor 발동 여부 기록 — **필수, 벤치 측 파생값**

ON arm 에서 `sessionRoot/source-admission-selection.yaml` (`run.ts:17534`) 을 읽어
`frontier_refs` 중 `frontier_ref_id` 가 `admission_floor_` 로 시작하는 수를 센다.

- `floor_promoted_count` = 접두사 일치 수
- `llm_selected_count` = 전체 − floor_promoted_count

floor 는 이미 구조적 표식을 찍는다 (`run.ts:11250` `admission_floor_${index+1}`)
— **런타임 계측 추가 불필요**. floor 적용 시 이 파일을 다시 쓰므로
(`run.ts:16057+69`) 사후 상태가 정확히 남는다.

§3.1 의 `llm_selected_count > 0` 유효성 조건이 이로써 측정 가능해진다.

### 4.3 코퍼스 — **작업 없음**

가치 벤치는 처음부터 실 openai-node src 를 쓴다 (`:30` §9.2, `buildCorpusSnapshot`
`:132`, `EXPECTED_FILE_COUNT`/`EXPECTED_TARGET_COUNT` drift 가드).
합성 코퍼스는 **live-e2e 하니스**(별개 스크립트)의 것이며, §2 의 증거 약화는
그쪽에만 적용된다.

## 5. 결함 판정 — 벤치와 독립 트랙

두 결함 모두 **벤치에 영향 0**이다(벤치 코퍼스는 TypeScript 정적 스냅샷: D-A 는
파일 소실, D-B 는 스프레드시트). ⇒ **벤치의 선행조건으로 걸지 않는다.**
승격 안 할 수도 있는 기능을 위해 먼저 일하지 않기 위함. 단 **flip 전에는 필수**.

> **[2026-07-25 해소 — 구현 완료]** 두 결함 모두 브랜치
> `fix/admission-selection-preflight-defects` 커밋 `60ab4a7` 로 착지했다. 아래 원안
> 두 블록은 **각각 처방이 틀렸고** 실코드 재검증으로 교정됐다. 원문은 기록으로 남기되
> 각 블록 끝의 정정을 SSOT로 읽는다. 전체 3689 tests green, OFF 경로 동작 불변.

### D-A — floor 승격 TOCTOU ⇒ hard crash

**판정: terminal 판정부에서 수정** (`isZeroObservationGracefulTerminalEligible`,
`run.ts:5732-5739`). `.every(scan_status === "skipped")` 에 `"admitted"` 를 허용하도록
술어 확장.

- 결함 CONFIRMED. 추가 전제: **admitted 유닛 ≥2** 이고 floor 승격분만 시도된 경우.
  전체 소실은 `admitInventoryUnit` 이 이미 전부 `"skipped"` 로 강등하므로 현재
  술어로 정상 처리된다. **갭은 *부분* 소실 케이스뿐.**
- deep-observe 는 실패 시 throw 하지 않음 — `scan_status:"skipped"` + `skippedRef`
  (`materialize-preparation.ts:1007-1024`, `run.ts:16177-16179`). TOCTOU 는
  `buildReconstructSourceObservation` 이 live `fs.stat` 후 "the ref may have vanished
  in between (TOCTOU)... degrade to null" 로 자인 (`materialize-preparation.ts:538-547`).
- **floor 정책에서 고치는 안은 기각**: `applyAdmissionSelectionFloorPolicy` 는
  순수·동기이고 I/O 이전에 돌아 재시도를 구성할 수 없으며(스테이지 루프 수준
  재구조화 필요), 더 결정적으로 **floor 미경유 경로(LLM 이 직접 선택한 파일이
  소실)의 동일 클래스를 놓친다**. terminal 판정부 수정은 **상태 기반**이라 경로
  무관하게 클래스를 닫는다.
- **blast radius**: 프로덕션 호출부 **1곳**(`run.ts:17571`, `assertSemanticAuthoring
  HasObservedEvidence` 직전). 나머지는 테스트 호출부뿐
  (`graceful-terminal.test.ts` 4건, `run-source-admission-selection.test.ts` 1건).
  신규 배선 0 — 함수가 이미 `scan_status` 를 받는다 (`artifact-types.ts:366`).
- 검증: 선택 직후 승격 유닛을 소실시키고 **throw 가 아니라 graceful `blocked`** 임을
  단언하는 재현 테스트. admitted ≥2 전제를 만족시켜야 함(공허 통과 방지).

**[2026-07-25 정정 — 처방 교체]** 위 "`"admitted"` 를 허용" 은 **공허 함정**이었다.
그대로 구현하면 zero-observation 하에서 admitted 유닛이 전부 무조건 통과해
**gate 가 admission ON 에서 항상 graceful** 이 되고, N-elig 대조(지원되지만 빈
타깃은 crash)가 파괴된다. 실제 결함 상태는 하나뿐이다 — **시도 집합이 전부 소실 +
deferred admitted 잔존**.

- 실제 술어: optional `attemptedSourceRefs`(accepted ∩ file-limit cap =
  `run.ts` 의 `frontierBySourceRef` 키)를 stage 반환값에 추가하고, **시도되지 않은**
  admitted 유닛만 자격에서 면제한다. 인자 부재 시 admission 이전 규칙과 동일.
- 근거: 설계 §16.2 의 자격 의미는 "planned인데 미관측 unit 0" = *관찰하려던 것 중
  미해결 없음*이지 "코퍼스에 관찰 가능한 것이 전무"가 아니다. §16.2(2026-07-01)는
  admission(07-22)보다 앞서 **자발적 deferred 상태를 표현할 술어가 없었다** — 시도
  집합으로의 확장은 원의도의 재정의가 아니라 충실한 확장이다.
- 대안 B(`skipped_refs` OR 절) 기각: producer 버그/desync 서명을 조용한 graceful 로
  바꾸면서 얻는 것이 없다.
- **저자 오류 기록**: 실행 중 나는 "OFF 경로도 같은 결함"이라 주장했으나 **틀렸다**.
  `observeInventoryUnitDeep` 이 소실 유닛을 `skipped` 로 강등하고
  (`materialize-preparation.ts:1007-1024`) OFF(`:1284-1288`)·ON(`run.ts:16187-16188`)
  양쪽이 이를 채택하므로 OFF 전체소실은 **이미 graceful**이다 — 위 원문이 옳았고
  내가 내 문서와 모순됐다. 원인: `run.ts:5744-5746` 의 **stale 주석**("inventory 는
  재관찰 전에 만들어진다")을 권위로 읽고 producer 를 확인하지 않음. 그 주석도 같은
  커밋에서 정정했다.
- 부수: `deferred_admitted_refs` 를 zero-observation 진단에 비-0 일 때만 덧붙여
  blocked terminal 이 "못 읽은 것"과 "일부러 남긴 것"을 구분한다.
- 검증: 동일 inventory 에서 `attemptedSourceRefs` **유무만** 갈리는 OFF-parity 대조로
  공허 통과 배제 + N-elig 대조 2건(시도했으나 미해결 = desync, stray planned).

### D-B — value-read 미인가

**판정: 중복 사전필터 삭제** (`run.ts:5344`, `maturation-validation.ts:2595`).

- 두 소비자 **모두 ledger 를 이미 로드**한다 (`run.ts:5340`,
  `maturation-validation.ts:2471-2485`). consumer 1 은 3줄 뒤에서 실제로
  `proof_sufficiency_state === "sufficient_for_claim" && visibility_tier ===
  "consumption_allowed"` 를 조회한다 (`run.ts:5352-5356`).
  ledger row 가 **이미 2-증명 결과를 담고 있다**.
- 버그는 권위(ledger)에 묻기 **전에** 한-증명 로컬 체크가 단락시키는 것.
  ⇒ 사전필터를 **삭제**하고 ledger 가 판정하게 한다.
- **"`runtimeTargetProven` 술어를 채택" 안은 구성 불가**: 그것은
  `buildSafetyRowForObservation` 내부의 **로컬 const** (`source-safety-validation.ts:248`)
  이지 export 된 술어가 아니다. 채택하려면 추출·export 하고 `admittedSourceRefs` 를
  두 신규 호출부로 배선해야 한다 — 삭제안이 더 작고 개념 표면을 **감소**시킨다.
- off-path 동등성 주장: 비-타깃이면서 비-admitted ⇒ ledger row 가
  `consumption_allowed` 가 아님 ⇒ 여전히 거부. **단 이는 추론이므로 테스트로 증명한다.**
- 방향은 under-authorization(누출 아님)이나 **조용한** 품질 구멍이라 fail-loud
  규율에 어긋난다.

**[2026-07-25 정정 — 처방 교체]** "사전필터 삭제" 는 **틀렸다**. 삭제하면 `material_claim`
행이 **명시적 authorization(basis B)만으로도** `consumption_allowed` 가 되는 비-타깃
스프레드시트까지 value-read 가 통과한다 — 문서화된 의도를 넘어서는 **확장**이며,
"off-path 동등성" 추론(비-타깃 ∧ 비-admitted ⇒ 거부)이 basis B 를 빠뜨렸다.

- 실제 처방: **additive 술어**. 기존 증명 1(`is_runtime_target_source`)을 **그대로 두고**
  증명 2를 OR 로 더한다 — `material_claim` 행의
  `authorization_scope_ref === "runtime_target_ref_read_scope"`. 오늘 통과하는 것은
  하나도 실패로 바뀌지 않는다.
- "`runtimeTargetProven` 채택은 구성 불가" 도 정정: 추출·export 가 필요 없다.
  **권위가 이미 근거를 발행한다** — `source-safety-validation.ts:278-282` 가
  `authorization_scope_ref` 로 basis 를 기록하고, `runtimeInternalConsumption`
  (`:157-161`)이 `material_claim` 을 **제외**하므로 material_claim 행에서
  `"runtime_target_ref_read_scope"` ⟺ `runtimeTargetProven ∧ ¬explicitlyAuthorized`.
  ⇒ 위양성 없음. 신규 배선·신규 개념 0.
- 잔여(문서화): 두 증명을 **동시에** 가진 원본은 ternary 가 explicit scope 를 기록해
  증명 2가 놓친다 — flag 로도 잡히지 않던 케이스라 **수정 전보다 나빠지지 않는다**.
- 검증(반증 가능성 실증): 술어를 구형으로 되돌리면 positive 2건이 정확히 FAIL 하고
  **negative control 2건(basis B 비-타깃)은 양쪽 모두 PASS** — 결함이 닫혔고 확장은
  없음을 각각 독립적으로 고정.

## 6. 공개된 타당성 한계

**중립 CQ 세트가 측정 천장이다.** N≈12 의 저작된 문항이 보는 것만 보인다.
admission 이 일으키는 이해폭 손실은 **그 문항들이 열거하지 못한 롱테일**에 살 수 있다
⇒ **거짓 parity** 가능. (초안은 이 한계를 `semantic-quality-gate` 의 Q1 천장으로 적었으나,
계기가 교체되어도 한계의 **구조는 동일**하다 — 유한한 질문 목록이 무한한 이해폭을 대리한다.)

벤치 설계가 이 천장을 부분적으로 낮춘다: **경계 CQ**(deferred 도메인 의존 질문 — ON 의
deferral 이 아플 지점)와 **depth-varying CQ**(deep target 파일에서만 답 가능)를 세트에
강제 포함시킨다(§9.5). 즉 천장은 남지만, **손실이 나타날 지점을 조준한** 천장이다.

비대칭으로 처리한다: **거친 세트에서조차 *검출된* 손실은 결정적 거부**이고,
parity 판정은 **잠정 신뢰**일 뿐이며 되돌리기 경로를 열어 둔다.
breadth-민감 신규 지표 제작은 **범위 밖**(단일 사용자 도구에 불비례).

## 7. 순서와 게이트

1. **하니스 2건** (§4.1, §4.2) + 회귀 확인. 런타임 변경 0.
2. **사전등록 확정** — §3 수치를 실행 전 고정.
3. **벤치 1회 실행** (`--go`). 유효성 조건 → 판정.
4. **분기.**
   - 거부 ⇒ opt-in 유지로 **종결**, 벤치를 근거로 기록. 로드맵 "여러 파일" 단계는
     *닫힌다*(측정된 결정으로).
   - 승격 후보 ⇒ 5로.
5. **결함 2건 수정** (§5) + 재현 테스트 + OFF byte-identity 확인.
6. **publish 게이트** — 0.4.17 발행 후에만 flip. INV-CFG-1: 0.4.16 의 키 레지스트리
   (실 tarball 해부로 확인, 72키 비공허)에 `source_admission_selection` **부재**.
   **참고: main 이 이미 `source_breadth_fold: true` 를 커밋했고 0.4.16 은 이 역시
   모른다 — 이 부채는 본 결정과 무관하게 이미 미결이며 1회 publish 가 둘 다 해소한다.**
7. **flip PR** — `.onto/settings.json` 에 키 추가 + 이해폭 tradeoff 와 벤치 증거
   경로를 명시하는 disclosure. **G4 는 이 승격을 가드하지 않음**(`PROTECTED_TARGETS`
   의 `.onto/settings.json` linePattern 이 `auth|provider|model|effort` 뿐) — 강제력은
   런타임 로드타임 strict 스키마뿐임을 인지하고 진행.
8. **flip 후 probe** — >48유닛 실 코퍼스 1회 실행으로 admission 실발화 확인
   (`admitted>0`, deep ≤16, deferred outline 보존, **floor-only 아님**).
   admission 이 발화하지 않은 run 은 공허 green 이며 계산에 넣지 않는다.

### 범위 밖

breadth-민감 신규 품질 지표 / 48·16 상수 변경 / adaptive depth / fold 자체 변경 /
다중 코퍼스 캠페인 / per-call 플래그 배선.

### 재설계 트리거

손실이 고정 cap 크기에 귀속되는 벤치 거부 ⇒ 대안 S(진입조건·상수·적응 depth) 재개.
계기 실패 2회(gate rejection 2회) ⇒ 라인 중단하고 owner 에게 에스컬레이션.

## 8. 개념 경제성

**신규 config key / field / enum / failure kind: 0개.**

- 승격은 기존 키의 **값 변경**이지 개념 변경이 아니다.
- D-A 는 기존 graceful `blocked` terminal 과 기존 `scan_status` 어휘를 **확장(extend)**
  — 신규 failure kind 아님.
- D-B 는 중복 파생을 **삭제**하고 기존 ledger 권위로 단일화 — 개념 표면 **감소**.
- §4.2 는 기존 아티팩트에서 파생하는 **벤치 측 계산**이며 새 runtime artifact truth 를
  만들지 않는다.
- 대안 S 는 신규 adaptivity 노브로 개념 표면을 늘리므로, 측정된 필요가 생기기
  전까지 이 근거로도 보류한다.

## 9. 수용/거부 위험과 되돌리기

**수용**: N=1~2 증거(단일 사용자·자기 데이터에 비례) / ON arm 내부 LLM 선택
비결정성 / §6 의 거짓-parity 위험(공개) / publish 대기 중 소비되는 벤치 비용.

**거부**: 소멸한 오버플로우 근거로 승격 / 알려진 잘못된 방향의 hard crash(D-A)를
기본 경로에 활성화 / 조용한 under-authorization(D-B) 기본 경로 반입 /
메커니즘-only live N=1 로 완료 주장 / 미발행 런타임이 모르는 설정 배포.

**되돌리기**: `.onto/settings.json` 에서 키 제거. default-off 설계 + 기존 동등성
테스트가 byte-identical OFF 동작을 보증하므로 데이터·스키마 migration 없음.
**사후 되돌리기 트리거**: deferred 파일에 살던 개념을 놓친 seed 를 owner 가 관측 /
D-A 클래스의 실사용 재발.

## 10. 이 설계의 검증 provenance

- 설계 초안: 블라인드 패킷 1벌로 **이종 2벌 독립 저작** — gpt-5.6-sol(codex OAuth,
  xhigh)과 claude frontier. 하우스 답 미포함, 중립 대안 P/Q/R/S 제시.
  **둘 다 독립적으로 Q 수렴** (이종 계열 수렴).
- 주 세션이 **모든 load-bearing 주장을 실코드로 재판정**했고, 그 결과 두 초안
  공통의 오류 3건을 정정했다:
  1. "fold 덕에 OFF arm 완주 가능" — 하니스엔 거짓 (§4.1)
  2. 비용 게이트를 wall-time/dispatch 에 걸었음 — 하니스가 informational 로 선언 (§3.2)
  3. D-B 를 "`runtimeTargetProven` 채택"으로 서술 — 구성 불가 (§5)
- D-A 위치는 두 초안이 **정반대**로 갈려 실코드 판정으로 해소 (§5).
- live N=1 증거는 독립 감사로 무게 재평가 (§2).
- **주 세션 자체 오류 3건 정정**:
  1. 종합 초판에서 "실 코퍼스로 교체"를 할 일로 올렸으나, 가치 벤치는 처음부터
     실 코퍼스였다 — live-e2e 하니스와 혼동 (§4.3).
  2. floor 계측에 런타임 변경이 필요하다고 적었으나, floor 는 이미
     `admission_floor_N` 을 찍고 있어 **벤치 측 파생**으로 충분했다 (§4.2).
  3. **blind packet 오류 (가장 무거움)**: `semantic-quality-gate.ts` 를 "가용 판정기"로
     패킷에 넣으면서 그것이 **닫힌 2-fixture 스코프**임을 명기하지 않았다. 결과로
     **두 초안이 모두 실행 불가능한 계기 위에 판정 규칙 전체를 세웠고**, 이종 수렴이
     그 오류를 **걸러내지 못했다** — 공유 패킷의 결함은 독립 저작으로 상쇄되지 않는다.
     §3 을 벤치 설계가 이미 소유한 실 계기(블라인드 Opus paired 채점)로 교체.
- **교훈**: 이종 독립 저작의 수렴은 *추론*의 독립성만 보증한다. **패킷에 심어진 전제는
  양쪽에 그대로 전파**되므로, 수렴한 결론이라도 계기 실재성은 별도로 실코드 확인해야 한다.
  이번에 4개 필드명(`provider_tokens_total`·`final_deep_file_count`·
  `distinctDeepObservedRefs`·정규화 seed)을 같은 방식으로 재확인했고 전부 실재했다.

### 10.1 결함 트랙 구현 provenance (2026-07-25)

- **SpawnGate: Escalation FRONTIER spawn** — D-A 에서 처방 두 개(시도-집합 술어 vs
  `skipped_refs` OR)가 지속되어 블라인드 패킷(증거·제약·루브릭·중립 대안, 하우스 답
  미포함)으로 판정 위임. **사전 기록한 변경 조건**: "OFF 경로에도 같은 클래스가
  존재한다"는 내 전제가 무너지면 B 를 철회한다.
- **disposition**: 조건이 **발동**했다. 판정은 OFF 클래스가 실재하지 않음을
  producer(`materialize-preparation.ts:1007-1024`)로 보이며 내 전제를 뒤집었고, 나는
  그 주장을 판정을 신뢰하지 않고 **독립 재확인한 뒤** B 를 철회하고 A(+시도집합
  refinement)를 채택했다. 판정이 스스로 건 번복 조건(§16.2 가 graceful 을 "코퍼스에
  관찰 가능한 것이 전무"로 정의하면 A 도 기각)은 **미발동** — §16.2 의 의미 주석이
  "planned인데 미관측 unit 0"이므로 시도-집합 해석을 지지한다.
- **SpawnGate: Parallelism WORKHORSE spawn** — D-B 는 스펙이 동결돼 있어 별도
  워크호스에 위임. 반환물은 자기보고를 신뢰하지 않고 **주 세션이 diff 를 직접 검토**해
  두 안전성을 확인했다: (1) `safetyRowsById` 는 ledger 부재 시 빈 Map 이므로 hoist
  후에도 flag-only 로 정확히 이전 동작, (2) `sourceSafetyRowIdForObservation` 은 순수
  문자열 결합이라 무조건 호출이 throw 를 유발하지 않는다. 이어 **술어를 구형으로
  되돌려 테스트가 실제로 FAIL 하는지**까지 실행해 공허 통과를 배제했다.
- **주 세션 자체 오류 4번째**: §5 D-A 정정에 기록한 stale-주석 신뢰 오류. 이 문서가
  이미 옳게 적어둔 사실("전체 소실은 정상 처리")과 **내 실행 중 주장이 모순**했는데도
  문서를 재대조하지 않았다.
