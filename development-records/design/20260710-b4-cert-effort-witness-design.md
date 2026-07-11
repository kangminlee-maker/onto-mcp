# B4 synthesize-cert: certified dispatch config를 witness 증거로 (2026-07-10)

> 상태: **구현 완료 (2026-07-11) — §4 게이트 전체 green**
> 교차검증(구현 전, 리뷰어 2종): opus/witness-flow(H1 rejudge-binding 구멍·M1 realization 경계·M2
> 순수 guard — §4.5.1 반영), fable/schema-compat(구형 라인 무증거 의미론·null 금지·record 수 정정 —
> §3/§4.5.1-10 반영). 검증 증거: development-records/benchmark/effort-witness-20260711/ — 실제
> b4-rejudge 리허설 3변형(legacy skip 회귀 / witness 방출 / 불일치 guard exit 1, persist 전 throw
> byte-비교 확증), 기존 record n=2 회귀 0, discovery 스위트 313 passed, G7 passed.
>
> 배경: gpt-5.6-luna(openai/codex) candidate 지원을 위한 B4 하니스 수정을 다관점 리뷰(fable 4-lens)로
> 검증하던 중, "certified effort가 어떤 영속 산출물에도 남지 않고 어떤 게이트도 거치지 않는다"는
> 증거 공백이 확인됐다. sonnet-5 인증의 `thinking_mode`와 동형(스크립트 상수 + 휘발성 로그로만
> 존재)이지만, 그 비대칭 자체가 인증 record의 authority 결함이다.
>
> 이 설계는 **이름표 버그(candidateModelIdentity가 resolved provider를 쓰는 문제)와 독립**이다.
> 이름표 버그 fix는 이 설계의 선행 조건이다(둘 다 openai candidate cert run의 전제).

## 0. 문제와 결정적 발견

### 0.1 문제 (fable #3 / #1 verification lens 수렴)

certified dispatch config(effort, thinking_mode)가:
- record 스키마(synthesize-cert/v1)에 필드 없음 — 기존 record 전부 미보유
- preflight.json에도 없음
- capture JSONL은 systemPrompt/userPrompt/text만 기록, config 미포함

결과: "luna를 effort=low로 인증"의 근거가 커밋된 스크립트 상수(CANDIDATE) + 휘발성 model-call 로그뿐이다.
**선언(CANDIDATE.reasoning_effort)과 실제 dispatch effort 사이 갭**이 구조적으로 열려 있다 — codex worker는
config 미주입 시 `~/.codex/config.toml`의 값을 상속하므로("Absent → TOML default"), 선언 low인데 실제
다른 값으로 dispatch돼도 record는 아무것도 반증하지 못한다.

### 0.2 결정적 발견 — witness가 이미 가능하다

effort는 실행 시점에 이미 witness된다:
- `run.ts:9480` telemetry: `effort = args.llmConfig.reasoning_effort`
- `run.ts:9644` reuse key: `@synthesize_effort=<effort>` — lineage에 folded

즉 record의 effort를 **선언값 복사가 아니라 실제 dispatch된 값의 projection**으로 만들 수 있다. 이것이
갭을 닫는 열쇠다. 단 현재 B4 capture line(`b4-live-realization.mts:265`)은 config를 싣지 않으므로
witness 값을 capture로 끌어올리는 한 줄 추가가 필요하다.

## 1. 확정 결정

| 결정 | 선택 | 근거 |
|---|---|---|
| 값 출처 | **witness projection** | 선언값 복사는 선언≠실제 갭을 남긴 채 "숫자만 적힌 종이"가 된다. witness가 authority. |
| 기록 범위 | **effort+thinking 통합 `arm_dispatch`** | effort(openai/codex)와 thinking_mode(anthropic)는 같은 역할의 provider별 dispatch knob. effort만 기록하면 thinking과 반대 방향 비대칭이 새로 생긴다. |
| 어느 arm | baseline/candidate/negative_control 3개 | `arm_model`/`arm_prompt_sha256`과 대칭. witness라 자동. |
| 기존 record 호환 | optional 필드 | 기존 record 2개(tracked sonnet-5 + gitignored mock 리허설; 20260707-live엔 record 없음 — fable 리뷰 실측 정정) 무손상, G7 재검증 무손상. 소급 기록 안 함(감사 무결성). |
| 검증 | arm 내 일관성 + 선언(preflight) vs witness(record) 대조 | 선언≠실제면 fail-loud — 이 대조가 authority의 실체. |

## 2. 스키마 설계

`synthesize-cert-record.ts`에 optional `arm_dispatch` 추가 (기존 `arm_model`의 자매):

```
DispatchConfigSchema = z.object({
  reasoning_effort: z.string().min(1).optional(),      // openai/codex arm에서 witness됨
  thinking_mode: z.enum(["disabled"]).optional(),       // anthropic arm에서 witness됨
}).strict()

arm_dispatch: z.object({
  baseline: DispatchConfigSchema,
  candidate: DispatchConfigSchema,
  negative_control: DispatchConfigSchema,
}).optional()   // 필드 도입 전 record(v1)는 absent — 하위호환
```

- `.strict()` — 미지 knob 유입 차단.
- 두 필드 모두 optional: 한 arm은 정확히 하나만 채워짐(codex arm→effort, anthropic arm→thinking).
  둘 다 비면 "provider default로 dispatch"(예: 현재 base-effort anthropic)를 정직하게 표현.
- `arm_dispatch` 자체 optional: 기존 v1 record는 이 키 없이 파싱 통과.

## 3. 데이터 흐름

```
[dispatch]  arm별 call → callLlm(config)  (config.reasoning_effort = 주입된 witness값)
     │
[capture]   b4-live-realization.mts capture line에 `dispatch` 객체 추가 —
            존재하는 knob만 조건부 spread로 담고(null 값 금지 — cell 스키마가 null을
            거부함을 실측), 객체 자체는 신형 라인에 항상 존재(빈 `{}` 포함).
            `dispatch` key 부재 = 구형 라인(무증거) ≠ `dispatch:{}` = "knob 없는
            config로 dispatch됨"의 witness — 이 구분이 거짓 witness 조작을 차단
     │
[assemble]  synthesize-cert-assemble.ts:
            capture JSONL을 role(arm)별로 그룹핑 →
            arm 내 모든 call이 동일 dispatch config임을 검증(일관성 guard) →
            record.arm_dispatch[arm] = witness된 config
     │
[record]    arm_dispatch 채워진 record
     │
[verify]    선언(preflight.candidate 선언 effort) vs witness(record.arm_dispatch.candidate) 대조
            → 불일치 시 fail-loud
```

preflight = 계획(선언 effort), record = 증거(witness effort). 둘의 대조가 "인증한 effort = 실제 돌린
effort"를 보장한다.

## 4. 검증 게이트 (구현 순서 = 게이트 순서)

1. **스키마**: `arm_dispatch` optional 추가 → 기존 record(정확히 2개) 파싱 회귀 0 + baseline n=2 비어있지 않음 단언 (첫 게이트, 실측 필수).
2. **capture**: capture line에 witnessed `{reasoning_effort, thinking_mode}` 추가 (성공/에러 양쪽 line).
3. **assemble**: capture에서 arm별 witness config projection + arm 내 일관성 guard.
4. **preflight**: b4-cert-run.mts가 선언 effort를 preflight에 기록.
5. **대조 guard**: 선언(preflight) vs witness(record) 불일치 fail.
6. **검증 스위트**:
   - 기존 record 회귀 0 (arm_dispatch absent로 파싱)
   - 신규 record가 witness effort를 담음 (positive)
   - **선언≠실제 시 fail (음성 대조)** — 이 음성 대조가 없으면 게이트가 vacuous.

## 4.5 구현 확정 (2026-07-11, 코드 사실 기반 — Phase 1 완료 후)

교차검증 전 코드 조사로 확정한 구현 수준 결정:

1. **witness 소스 = capture 파일 재독** (`runDir/local/live-calls.jsonl`): resume run이 같은 파일에
   append되므로(harness 경로 상수, b4-cert-run.mts:417) 재개 세션에서도 전체 dispatch를 포괄한다.
   인메모리 누적은 resume에서 어떤 arm의 신규 콜이 0건일 때 witness 공백을 오탐하므로 배제.
   capture line(성공/에러 모두)에 `dispatch: { reasoning_effort?, thinking_mode? }`를 추가 — config
   클로저에서 즉시 취득(b4-live-realization.mts forRole).
2. **arm_dispatch 스코프 = fresh `--go` record 전용**: mock 경로는 capture 파일이 없고(§헤더 "--go
   only") dispatch 주장 자체가 없으므로 생략(optional). rejudge record는 리터럴 조립(b4-rejudge.mts
   rawRecord)이며 재판정이지 재dispatch가 아니므로 생략 — 그 dispatch identity는 원 run의 runDir로
   소급 가능. optional 스키마라 두 생략 모두 하위호환.
3. **preflight 선언 = `declared_dispatch` 필드**: fresh/resume preflight 공통(b4-cert-run.mts:394-,
   같은 writeFile). baseline/reference는 `B4_SYNTHESIZE_REASONING_EFFORT_OVERRIDE`("low"),
   candidate/negative_control은 `CANDIDATE`의 effort/thinking 선언을 기록.
4. **대조 guard 위치 = b4-cert-run `--go` 경로, record 조립 직후·persist 전**: witnessed
   arm_dispatch vs preflight `declared_dispatch` 불일치 시 throw. capture의 reference/judge role
   라인은 record arm이 아니므로 projection에서 제외(3 arm role만 그룹핑).
5. **arm 일관성 + 무증거 fail-loud**: 한 role 내 상이한 dispatch 발견 시 throw; `--go`인데 어느
   arm의 캡처 라인이 0건이면(선언은 있는데 witness 무) throw — 선언만 있고 증거 없는 record를
   만들지 않는다.
6. **스키마 위치**: `SynthesizeCertRecordSchema`(synthesize-cert-record.ts:203-)에 optional
   `arm_dispatch`(cell: `.strict()`, 두 필드 모두 optional). validator에 신규 recompute 없음 —
   witness 일관성은 조립-시 guard가 소유(runtime/code는 계약 집행만, 재해석 금지).

### 4.5.1 교차검증 반영 (2026-07-11, opus/witness-flow 리뷰 — H1·M1·M2·L1)

7. **H1(HIGH) — rejudge 경로가 진짜 binding 경로**: registry에 인용된 sonnet-5 record의
   `reproduction.command`가 `b4-rejudge.mts --go`임을 실측 — binding record는 rejudge 산출물이며,
   rejudge `--go`는 fresh record와 같은 경로(`runDir/synthesize-cert-record.json`)를 **덮어쓴다**
   (b4-cert-run.mts:588 ↔ b4-rejudge.mts:432). 따라서 §4.5-2의 "fresh 전용" 스코프는 witness가
   binding에 도달하지 못하는 구멍이었다(guard-실패 run의 캡처가 rejudge로 '깨끗한' tracked record가
   되는 우회 포함). **수정**: witness projection + 선언-대조 guard를 순수 export 함수로 두고(아래 8),
   **b4-rejudge도 같은 guard를 재실행 + 자기 record에 `arm_dispatch`를 방출**한다. rejudge는 이미
   `local/live-calls.jsonl`을 읽으므로(b4-rejudge.mts:161) 새 입력 요구 없음. mock 리허설 record도
   동일 경로로 방출(입력이 같으므로).
8. **M2(MEDIUM) — guard는 순수 export 함수**: projection(캡처 라인→arm별 dispatch)과 비교
   guard(선언 vs witness)를 `synthesize-cert-assemble.ts`의 순수 export로 구현 — b4-cert-run(fresh)과
   b4-rejudge(양 모드)가 공유하고, §4 gate 6의 음성 대조가 라이브 없이 함수 단위로 실행 가능해진다
   (인라인이면 음성 대조가 라이브 run을 요구해 vacuous).
9. **M1(MEDIUM) — config-witness ≠ provider-realization 경계**: arm_dispatch는 "dispatch된 config"의
   witness이지 provider가 실현한 값이 아니다(anthropic 경로는 thinking_mode가 effort를 무시:
   llm-caller.ts:514-528; codex 경로는 effort 부재 시 host TOML을 상속: callCodexCli). 이 경계를
   스키마 주석과 record 계약에 명시하고, guard에 결정론 규칙 2개를 둔다(둘 다 declared provider
   brand 기준): **(a)** openai(codex-route) arm은 witnessed `reasoning_effort`가 반드시 존재해야
   한다 — null은 "provider default"가 아니라 관측 불가한 TOML 상속이므로 인증 불가, fail-loud;
   **(b)** 한 arm의 witness에 effort와 thinking_mode가 동시 존재하면 fail-loud — anthropic 경로에서
   effort는 실현되지 않으므로 그런 인증 주장은 거짓이 된다.
10. **legacy run 규칙 + 라인 단위 무증거 의미론** (fable/schema-compat 리뷰 MEDIUM 반영):
    캡처 라인의 `dispatch` **key 부재 = 무증거**(구형 라인)이며, 절대 "빈 dispatch config의
    witness"로 정규화하지 않는다 — 20260708 run의 구 라인들은 실제로 effort=low 주입
    dispatch였으므로 그 정규화는 거짓 witness 조작이 된다. 규칙: preflight에 `declared_dispatch`
    없음 + 3 arm role 라인 전부 key-부재 → guard skip, arm_dispatch 미방출(legacy 하위호환).
    `declared_dispatch` 존재 → projection이 arm role 라인에서 key-부재를 하나라도 만나면
    fail-loud(신-시대 run의 무증거 라인은 오류; resume으로 신구 라인이 섞인 파일 포함).
11. **L1(LOW) 한계 명시**: 오늘 B4 arm은 `synthesizeSemanticMapNode` 단일 호출이며 within-role
    일관성 guard는 그 가정 위에 있다. 미래에 arm이 base-effort `verifySemanticMapBoundary`를 함께
    호출하면 정당한 effort 혼합으로 false-throw — 그때 guard를 call-kind 축으로 확장해야 한다
    (guard 에러 메시지에 이 한계를 적는다).

## 5. 리스크 / 경계

- **스키마 변경 = authority 변경**: optional이라 하위호환. INVARIANT-CHANGE 마커 필요 여부는 구현 시
  G4/invariant 게이트 실행으로 확정(현재 synthesize-cert가 마커 파일에 미등록 → 아마 불필요, 실측).
- **기존 sonnet-5 record**: 소급 기록 안 함. "arm_dispatch 도입 전 인증"으로 남긴다(record 수정은
  감사 무결성 훼손).
- **capture 의존**: witness projection이 capture JSONL에 의존 — capture 유실 시 record 조립 실패
  (현재도 lineage 유실은 조립 실패이므로 새 실패 모드 아님).
- **selection 편향 없음**: baseline/reference/negative는 witness라 자동. judge/reference는 record arm이
  아니므로 arm_dispatch에 안 나타남(설계상 정합).

## 6. 스코프

- 파일: `synthesize-cert-record.ts`(스키마+검증), `synthesize-cert-assemble.ts`(projection+일관성),
  `b4-live-realization.mts`(capture), `b4-cert-run.mts`(preflight).
- 기존 아티팩트: 무변경(optional).
- 검증: 회귀 + positive + 음성 대조.

## 7. 관련

- 선행: 이름표 버그 fix (candidateModelIdentity → declared brand). 미해결 시 openai candidate cert run이
  rejudge B5 binding에서 aggregate_mismatch로 실패.
- 인증 권위: INV-MODEL-1 (supported-models.yaml, `semantic_map_synthesize` role).
- 검증 기록: 2026-07-10 fable 4-lens 다관점 리뷰(코드정확성/검증방법론/개념설계/주장-증거).
