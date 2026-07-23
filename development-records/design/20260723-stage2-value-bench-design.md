# Stage 2 value-magnitude bench — design (common-basis, real OSS corpus, CQ-judged)

> **상태 (2026-07-23)**: **§9(v2 LOCKED)가 최종 methodology — 아래 §0~§7과 충돌 시 §9가 우선한다.** 이종 2벌 적대검증(타당성/공정성 + falsifiability) → 종합 → §9로 확정 → owner "이대로 가자" 승인 → 실행. 원래 §0~§8은 리뷰 이전 초안(이력). 계보: inter-document-breadth-stage2-design §14 "가치 가설(명명)". owner 결정(2026-07-23): 코퍼스=**외부 실제 OSS 슬라이스**, 품질=**공통-basis CQ 채점(엄밀)**.

## §0. 가설 · done-when

**가설(§14)**: reconstruct의 deep 관찰 비용은 **목적 관련성**에 비례하지 **코퍼스 크기**가 아니다. Stage 2(admission)는 목적-무관 파일을 deferred로 남겨 deep 비용을 유계로 만들되, seed 품질은 non-inferior.

**done-when (falsifiable, 둘 다 충족해야 "가치 입증")**:
1. **비용 승리**: ON의 deep-observed 파일 수 ≪ OFF(전량). 구체: ON admission deep set ≤ `SOURCE_ADMISSION_DEEP_FILE_LIMIT`(16), OFF = 전 supported 파일(~59). 총 dispatch·wall-time·토큰도 ON < OFF.
2. **품질 non-inferior**: 공통 CQ 세트에 대해 ON seed의 supported-rate ≥ OFF seed − ε(ε=1문항 또는 10%p 중 큰 쪽). 즉 훨씬 적게 읽고도 목적 질문 답변력이 안 떨어짐.

**반증 조건(정직)**: (a) ON supported-rate가 OFF−ε 미만이면 "품질 하락"—threshold/budget/outline 튜닝(PR-2c) 필요로 기록, 승격 보류. (b) ON deep set이 OFF와 비슷하면(exploration이 대부분 재승격) "비용 미절감"—admission-vs-exploration 상호작용 재검토.

## §1. 코퍼스 (외부 실제 OSS 슬라이스)

**출처**: `node_modules/openai/src/` (openai-node SDK, **Apache-2.0**, authored TypeScript 277파일). 실 외부 OSS·오프라인 on-disk·resource별 도메인 분리 명확. **분석 목적 read-only**(재배포 아님)·seed는 파생 추상. license 고지를 evidence에 기록.

**슬라이스 (결정론·10 디렉터리 = 59 .ts, `.d.ts` 제외)**:
| 역할 | 도메인(파일수) | 계 |
|---|---|---|
| **목적 타깃**(선택 기대) | chat(6)·responses(7)·realtime(4)·conversations(3) | 20 |
| **distractor**(deferred 기대) | audio(5)·fine-tuning(15)·vector-stores(4)·uploads(3)·evals(6)·containers(6) | 39 |

= **59 파일 > THRESHOLD(48)** → admission 모드 진입. 슬라이스는 `resources/<domain>/**/*.ts ! *.d.ts` 전량(shim 포함=현실적). ground-truth 도메인 라벨(target/distractor)은 **선택 정밀도** 부가 신호로 사용(§4).

**왜 이 슬라이스**: 도메인이 코드로 분리(파일 경로=도메인)돼 "목적이 subset을 고른다"가 falsifiable. near-duplicate 아님(각 resource 상이). 59면 OFF(전량 deep)도 감당 가능(~1.5–2h 추정).

## §2. Intent (공통·양 런 동일)

> "Reconstruct the conversational API surface of this SDK: how chat completions, responses, realtime sessions, and conversations relate — messages, roles, tool/function calls, streaming, and their parameters and result shapes. Treat audio, fine-tuning, vector stores, uploads, evals, and containers as out of scope unless the conversational flow directly depends on them."

목적이 명시적으로 target 도메인을 가리키고 distractor를 배제 → ON이 목적-선택을 보일 표면.

## §3. 런 프로토콜 (공통 basis)

**같은 코퍼스 · 같은 intent · 같은 seat(gpt-5.6-sol OAuth) · 같은 코드(main 774603a)**. 유일 변수 = opt-in.
- **OFF 런(baseline)**: `source_admission_selection` 미설정 → 관찰-ALL. 59 파일 전량 deep.
- **ON 런(admission)**: opt-in additive 오버레이만 → admission 모드. ~16 deep + exploration.
- 하니스: `scripts/stage2-admission-live-e2e.mts` 확장 또는 신규 `scripts/stage2-value-bench.mts`—두 런을 같은 코퍼스 스냅샷(동일 파일 바이트)으로 순차 실행, 각 세션 아티팩트 보존, 결정론 지표 추출. 실 OAuth라 백그라운드.
- **provenance**: 코퍼스 파일 sha·git HEAD·seat route·intent sha를 evidence에 고정(공통 basis 증명).

## §4. 지표

**A. 비용 (결정론·아티팩트에서 직접 산출)**
- deep-observed distinct 파일 수 (source-observations의 distinct source_ref) — ON vs OFF **핵심 대비**.
- admission deep set 크기(ON만, `observation_batch_id="source-observation-batch:admission"`).
- deferred 파일 수(ON, `deferredSourceRefs`).
- 총 codex dispatch 수·wall-time·입출력 토큰 합(하니스 model-call 로그 집계).

**B. 선택 정밀도 (부가·결정론·ground-truth 라벨)**
- ON이 deep 관찰한 파일 중 target-도메인 비율(admission 선택 + exploration 승격 각각). "목적 파일을 골랐나" falsifiable 신호. (비-게이팅·기록용)

**C. 품질 non-inferiority (공통-basis CQ 채점)** — §5.

## §5. 공통-basis CQ 방법론 (crux — home-field bias 제거)

문제: 파이프라인은 런마다 자기 seed에서 CQ를 저작 → 서로 다른 문항 = 불공정. 해결 = **중립 고정 CQ 세트를 양 seed에 동일 채점**.

1. **중립 CQ 세트 저작 (seed 무관·intent+코퍼스 기반)**: 별도 1콜(judge seat)이 intent + 코퍼스 도메인 요약(결정론 outline projection, seed 아님)을 읽고 목적이 답해야 할 competency question **N=12±** 저작. 어느 런의 seed도 안 봄 → 양쪽에 중립. 산출 `value-bench-cq-set.yaml`(고정·양 런 공유).
2. **블라인드 채점**: judge가 각 seed를 **유일 증거**로 각 CQ를 `{supported, partial, unsupported}` + 근거 1줄 분류. seed 라벨(OFF/ON) **블라인드**(파일명 무작위화). 양 seed 동일 rubric·동일 judge.
3. **judge 독립성**: 저작 seat=gpt-5.6-sol이므로 채점은 **가능하면 이종 seat**(claude 계열 or gpt-5.6-luna)로 self-judging 회피. 이종 seat 미가용 시 동일 seat + 엄격 rubric + 블라인드로 완화(evidence에 명기).
4. **지표**: supported-rate = supported/(N) (+ partial=0.5 가중 보조). ON vs OFF. non-inferiority = ON ≥ OFF − ε(§0).

**비-vacuous 가드**: CQ 세트 N≥8·양 seed 채점 결과 non-empty·최소 1개 CQ에서 두 seed가 다른 판정(세트가 변별력 있음 확인). OFF seed가 자기 CQ 아닌 중립 세트에서도 높게 나오는지로 세트 난이도 sanity.

## §6. 위협-타당성 (threats to validity)

- **N=1 코퍼스/intent**: 단일 슬라이스·단일 목적. 일반화 제한 → "이 코퍼스에서" 한정 결론. owner가 N 확대 원하면 2번째 슬라이스/intent(비용↑). 기본 N=1(단일-사용자 도구 비례).
- **judge 신뢰성**: LLM judge 잡음. 완화=이종 seat·블라인드·rubric·partial 보조. 필요 시 judge 2회 다seat 다수결(비용↑, 기본 미채택).
- **exploration 재승격**: ON도 exploration이 deferred를 추가 deep → deep set이 admission보다 큼. 비용 대비는 **최종 deep set** 기준(정직). admission 순효과는 별도 기록(§4-A).
- **compiled-vs-source**: `src/*.ts`는 authored 소스라 무관(dist 아님, 확인됨).
- **shim 파일**: re-export 1줄 파일 포함=현실적. admission이 이들을 deferred로 두는지 관찰(신호).
- **floor/threshold 상수**: PRELIMINARY(16/48). 이 벤치는 상수 튜닝 아님(그건 PR-2c)·현 상수로 가치 측정.

## §7. 비용 통제 · 실행 계획

- **비용 추정**: OFF ~1.5–2h(59 전량 deep + exploration + scout + seed), ON ~40–60min. 합 **~2.5–3h 백그라운드 OAuth·실 quota**. + CQ 저작 1콜 + 채점 ~24콜(12 CQ × 2 seed). 비대화형 OAuth 동작 확인됨(주세션 백그라운드).
- **순서**: (1) 코퍼스 스냅샷 생성·sha 고정 → (2) OFF 런 → (3) ON 런(동일 스냅샷) → (4) 중립 CQ 저작 → (5) 양 seed 블라인드 채점 → (6) 비교 리포트 evidence.
- **circuit breaker**: 하니스에 per-런 dispatch cap(예 400)·실패 checkpoint(admission 하니스 패턴 재사용).
- **산출**: `development-records/benchmark/stage2-value-bench/<runId>/`에 OFF/ON 세션 요약·CQ 세트·채점·비교 리포트.

## §8. owner 결정 (실행 전)

1. **코퍼스 확정**: openai SDK src 59-파일 슬라이스(§1)로 OK? (대안: owner가 `! git clone`으로 특정 레포 지정 시 교체—오프라인이라 주세션 clone 불가.)
2. **N**: 기본 N=1(단일 슬라이스/intent). 2번째 pair 추가?(비용 2배)
3. **judge seat**: 이종 seat 선호(claude/luna)—repo에 가용 seat 확인 필요. 미가용 시 동일 seat+블라인드로 진행?
4. **방법론 적대검증**: 실행 전 독립 적대검증 1벌(타당성/공정성/falsifiability 렌즈) 돌릴지(권장·비용 저렴, 3h 런 낭비 방지).

---

## §9. v2 LOCKED methodology (적대검증 종합 후·최종·§0~§7 우선)

이종 2벌 적대검증(A=타당성/공정성, B=falsifiability)이 실코드로 확인한 결함을 반영해 확정. 원 초안은 "그럴듯한 PASS를 내면서 아무것도 증명 못 하는" 구멍이 있었음(블라인드 깨짐·비용 done-when 공허·품질축 실패불가). owner 승인(2026-07-23) 저렴 기본값.

### §9.1 확정 done-when (falsifiable·비-vacuous)
- **비용(정직·재정의)**: 주지표 = **총 input+output 토큰** ON vs OFF(런 구조 비대칭에 강건) + **최종 distinct deep-observed 파일 수**(admission+모든 exploration 라운드, 양 arm 동일 순수함수). dispatch 수·wall-time은 **참고용**(ON이 exploration 9렌즈×≤5라운드 오버헤드로 dispatch/시간은 질 수 있음 — 정직 명기). 폐기: "admission ≤16"(cap이 코드 강제=공허).
- **품질(non-inferior)**: 중립 CQ 세트에 대해 ON supported-rate ≥ OFF − ε, **ε = max(제품하한 1문항, 2σ)**, σ=paired judge ≥3패스에서 측정. 주지표 1개(supported-rate) pre-commit·partial-weighted는 sensitivity만.
- **음성 대조 게이트(신규·필수)**: distractor-only 증거로 저작한 "그럴듯하나 틀린" 대조 seed가 OFF보다 **material하게 낮아야**(예 OFF−control ≥ 3 CQ). 아니면 judge/CQ 변별력 없음 → **전체 벤치 무효·중단**(어떤 ON-vs-OFF 수치도 신뢰 불가).
- **가설 범위 축소(정직)**: "크기-독립" 주장 폐기(N=1 단일크기로 검증 불가). 확정 주장 = "이 코퍼스/intent에서 admission이 deep set을 59→K로 축소하며 목적 CQ 답변력을 유지."

### §9.2 확정 코퍼스·intent
- 코퍼스 §1 그대로(openai src 59-파일 슬라이스). **pre-registered manifest**(59파일·per-file sha·target/distractor 라벨)·재설치 drift 시 **fail-loud**.
- **intent 배제목록 제거(rig 방지)**: "…streaming, and their parameters and result shapes."까지만. "Treat audio, fine-tuning… as out of scope" 삭제 → 선택기가 무관성을 **추론**하게. (선택 정밀도는 비-게이팅·"지시된 scope와의 일관성"으로 정직 프레이밍, "emergent 목적추론" 과장 금지.)

### §9.3 확정 공통-basis (증명·assert)
- **settings 해석 실측 정정(2026-07-23)**: `resolveSettingsChain(_ontoHome, projectRoot)`의 1st 인자는 **무시**(underscore). user layer = **`~/.onto/settings.json`(홈)**, project layer = `projectRoot/.onto/settings.json`. → 벤치는 **repo `.onto/settings.json`을 안 읽음**. 홈엔 seats(gpt-5.6-sol OAuth)만·code 옵트인 없음. 따라서 **양 arm 오버레이에 `code_structure_inventory:true`+`code_structure_layout:true`를 명시**(결정론=추가 LLM 0·admission outline에 실 code skeleton 부여=공정·production 충실). `semantic_map_authoring`은 OFF(무거운 별개 LLM 기능·측정대상 아님). 상속 X이므로 명시.
- 오버레이는 [code 옵트인 공통] + [ON만 `source_admission_selection`]. 하니스가 **양 arm의 완전 해석 `reconstruct.execution` config를 evidence에 스냅샷**하고 **`source_admission_selection` 외 바이트동일 단언**(preflight 실측: OFF/ON keys=actors+code_inv+layout, equal-except-opt-in True). 코퍼스 sha·git HEAD·seat route·intent sha 고정.

### §9.4 확정 judge (이종·저렴)
- judge = **신선 Opus 서브에이전트**(claude 계열 = gpt-5.6과 **이종**·metered 0·블라인드/다회). luna(같은 gpt-5.6 계열) 폐기.
- **블라인드 정규화(신규)**: judge는 각 seed의 **실질 온톨로지 투영**(concepts/object_types/action_types/relations/bindings + CQ 관련 답)만 봄. **limitation/deferred/provenance/source-ref 메타 제거**(ON self-identify 신호 차단). 라벨 무작위화(seed-A/B/C). 음성대조 seed도 같은 블라인드 풀에.
- **paired 채점**: CQ별 두(세) seed 동시 채점(paired delta=저분산). ≥3 패스로 σ.

### §9.5 확정 CQ 세트 (변별력·경계)
- 중립 저작(intent 위주·seed 무관·outline은 phrasing만). N≥12. **경계 CQ 포함**(목적-관련이나 deferred 도메인 의존 질문 = ON deferral이 아플 지점, 예 "realtime turn에 audio 입력이 어떻게 들어오나"). CQ-author 입력 verbatim 기록(ON 선택입력과 상관 audit).
- 비-vacuous 가드 강화: **≥3 discriminating CQ**(두 seed 판정 상이)·depth-varying(deep target 파일에서만 답 가능한 것 포함). 충족 못 하면 세트 무효.

### §9.6 확정 하니스 하드가드 (silent-pass 봉인)
- 양 런 `record_stage==completed` 아니면 비교 거부. **OFF admitted=0 ∧ ON admitted>0** 단언(각 arm 의도 경로 확인). judge 실패콜=하니스 에러(≠ 침묵 unsupported). CQ N≥8·채점 non-empty·discriminating≥3 = **throw**. 코퍼스 manifest sha drift=throw. 비용 = 순수함수 `distinctDeepObservedRefs(finalObservations)` 양 arm 동일 적용 + arm별 fixture 단위테스트. per-런 dispatch cap·실패 checkpoint(admission 하니스 패턴).

### §9.7 확정 반복 (저렴·owner 승인)
- reconstruct = **arm당 1회**(긴 pole). 변동성은 **싼 부분 반복**으로 유계: admission 선택 스테이지 단독 ≥3회(선택 안정성)·judge paired ≥3패스(σ→ε). 추가 ON 풀런·2번째 크기점 = **미채택**(단일-사용자 도구 비례).

### §9.8 확정 실행 순서
1. 코퍼스 스냅샷+manifest(sha·라벨·drift fail-loud). 2. **OFF 런**→3. **ON 런**(동일 스냅샷·config 스냅샷+바이트동일 단언). [여기까지 긴 pole ~3h 백그라운드] 4. 최종 deep수·토큰·라운드·promoted 추출(순수함수). 5. 음성대조 seed 저작(distractor-only 1콜). 6. 중립 CQ 저작(경계 포함). 7. 정규화 투영 3 seed(OFF/ON/control) 블라인드 paired 채점 ×≥3(Opus). 8. σ→ε·supported-rate·음성대조 게이트·verdict. 9. evidence(비용·품질·정밀도·provenance·Apache-2.0 NOTICE+상류 copyright·완전config·범위한정 명기).
- 4~9는 영속 seed 대상=런 안 막음(런 중 병행 구축).

---

## §10. 실행 결과 · 발견 · 수정 (2026-07-23)

벤치가 실 openai-SDK 59-파일 코퍼스에서 **②선택 다리(Stage 2)의 실 결함 2건 + 값 신호**를 드러냄. "clean ON 완주 + 정량 non-inferiority" close-out은 이 하드 코퍼스가 매 런 다른 LLM-출력 게이트에서 실패해 미달성이나, 벤치는 이미 목적(실 코퍼스로 결함 표면화)을 달성.

**발견 1 — OFF(관찰-ALL) 오버플로우 (값 신호)**: 59파일 전량 deep 관찰 후 첫 source-observation-directive 투영이 **1,349,907 char > 1,048,576(codex 한도)** → OFF 13초 즉사(dispatch 2). "observe-all은 이 규모에서 완주 불가". 단 총량 cap 부재 탓이라 "Stage 2만이 유일 해법"은 과장 — 진짜 값 = 목적-집중 선택(+ owner 지적 ②결정론 재귀가 provenance 보존 대안). evidence: `.onto/temp/stage2-value-bench-2026-07-22T17-45-58-944Z`(보존).

**발견 2 — ON scenario-2 provenance 강등 하드-실패 (실 버그·수정함)**: admission이 deferred한 사용자 타깃(chat.ts 등)을 exploration이 회수 → `is_runtime_target_source:false` 스탬프 → seed answer-support가 material 인용 시 `answer-support-ledger` 검증 하드-실패. 설계 §5/§14 "scenario-2 full parity follow-up"이 승격 블로커로 실증됨. **수정(별도 브랜치 `fix/reconstruct-scenario-2-provenance-parity`, 커밋 `8d282a4`)**: ledger-층 provenance 부여 — 회수 관찰의 source_ref가 신뢰 inventory `scan_status:"admitted"`면 material_claim/public_output 허용(Basis A 두 번째 증명). 경계 위조가드 불변. **3중 검증**: 단위 6/6·**실 실패 아티팩트 결정론 replay**(4 관찰 unknown→authorized)·**신선 Opus 적대검증 CLEAN(safe to merge)**·스위트 3651(+6·회귀 0). off byte-identical(opt-in 게이트).
- **비블로킹 MINOR 후속** (적대검증 발견): F4 value-read 게이트(run.ts:5280)+value-discharge 검증기(maturation-validation.ts:2595)는 여전히 `is_runtime_target_source===true` 직접 필터 → 회수된 **스프레드시트** 타깃 cell value는 value-read 제외 유지(보수적 under-auth·안전 방향·회귀 아님·value-read가 회수 관찰 미제공이라 미발화). 완전 parity 원하면 이 2 게이트도 admitted-proof 수용으로 후속.

**발견 3 — candidate-labeling LLM 환각 (코퍼스 난이도)**: fix 후 재실행은 8 dispatch만에 `candidate_labels evidence_observation_ids references no known observation ids`(LLM이 없는 obs id 인용)로 이른 실패. fix 무관·이 코퍼스가 파이프라인에 어려움(유사 파일 多·type-heavy). clean ON 완주는 이 코퍼스로 비신뢰 → 값 close-out은 발견 1·2로 충분.
