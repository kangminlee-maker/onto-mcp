# 환경 컨텍스트 프로파일 — Stage 3 착수 start-here (2026-07-21, /clear 후 재개용)

> Stage 0(결정론 census 추출) + Stage 0.5(known-signal 스캔) **구현·교차검증·live 실사용 검증·머지
> 완료**. 이것은 **Stage 3 착수 핸드오프**다. 재개 시 pwd/branch/HEAD 재검증 필수. 코드 인용은
> 심볼명으로 재확인(라인번호는 힌트).

## 0. 상태 핀 (재개 전 확인)

```
cd /Users/kangmin/Documents/onto-mcp && git fetch origin main && git log --oneline -3 origin/main
npx vitest run   # 3,387 green + 1 todo 기준
```

- **Stage 0(PR #241)·Stage 0.5 스캔(PR #242) main 머지 완료** (머지 시점 main `a48ecaa`).
- **릴리스 v0.4.15 준비 완료**: 버전 bump 커밋 `dc40f4d` + 태그 `v0.4.15` 푸시됨.
  **`npm publish`는 owner가 OAuth로 직접 수행**(이 문서 작성 시점 미발행일 수 있음 — `npm view
  onto-mcp version`으로 확인).
- **승격 PR #243 (`chore/env-profile-repo-settings-promotion`)**: repo settings
  `environment_context_profile: true` — **⚠️ v0.4.15 발행 + `npm i -g onto-mcp@latest` 이후에만
  머지**(신규 키를 0.4.14 strict 스키마가 모르면 settings 로드 fail-loud). 미머지면 main settings는
  프로파일 OFF.
- **중요(제품 실행 환경)**: 세션의 `onto` MCP 서버·글로벌 `onto`는 글로벌 npm 설치를 실행한다.
  Stage 3 코드를 제품 MCP로 검증하려면 v0.4.16 발행+재설치가 또 필요하다. 로컬 검증은 tsx live run
  (아래 §7) 사용.

## 1. Stage 3 스코프 (설계 SSOT)

**SSOT**: `design/20260720-env-context-profile-crossverify-synthesis.md` §0 + `.../design-verify-findings.md`.
현재 구현: `src/core-runtime/reconstruct/environment-context-profile.ts`(순수 assembler)·
`environment-signal-scan.ts`(fs 스캔)·`run.ts` 훅(`projectEnvironmentContextProfileInput`+훅
~17200)·`environment-context-profile-boundary.test.ts`·`environment-signal-scan.test.ts`.

Stage 0+0.5가 하는 것: basename/extension/import/스캔 신호 → 결정론 detection(닫힌 카탈로그·
scope 토큰·confidence certain|likely|weak)·disclosure-only(M2 경계)·신규 content 미읽음.

**Stage 3 = 3개 독립 증분(순서대로, 각 default-off·되돌리기=키 제거):**

### 3a. content_parse (정적-only manifest 내용 파싱) — 최우선
- **가치**: 지금은 파일 **존재**만 봄. content_parse는 package.json의 `dependencies`(react/express/
  next → framework), engine 핀, `type: module`, Cargo.toml의 deps 등 **내용**을 읽어 detection을
  정밀화(현재 weak/likely → certain으로 승격, import 없이도 framework 검출).
- **경계/안전(design-verify B-3·gpt #9)**: **정적 파싱만**(`next.config.js`/`Gemfile` 등 **코드 실행
  금지** — JSON/TOML/YAML 안전 파서만, JS/Ruby 설정은 정적 토큰만). **새 fs-read 권한**이므로
  스캔과 동일한 path-safety(symlink 미추적·root 내부·유계) 부과. **실패 taxonomy**: parse-error /
  unsupported / partial(truncation) / true-silence 구분(honest gap, 절대 날조 금지).
- **입력원**: 스캔이 이미 찾은 known-signal 파일(`KNOWN_SIGNAL_BASENAMES`)을 **allowlist 재읽기**
  (6000자 excerpt 아님 — 전체/스트리밍). 스캔 결과를 content_parse에 넘기는 배선.
- **닫힌 어휘 방벽 유지**: 파싱한 dep 이름 중 **카탈로그 매칭만** detection(도메인 dep `@corp/x`는
  기여 0·미방출), version 등은 `properties`에 닫힌 형식으로만.
- **fingerprint**: 파싱한 content_sha + parser 버전을 fold(현 fingerprint에 parser hash 추가).

### 3b. 유계 LLM assist (침묵/충돌 잔여만) — content_parse 후
- **트리거**: detection=0(침묵) OR 상호배타 certain≥2(충돌) — 저장소당 **최대 1회**.
- **계약(gpt draft §2.1)**: payload 유계(정규화 signal ≤96·candidate ≤32·≤12K자·**원문/env값/도메인명
  금지**), 반환은 `candidate_key`·`weak|strong`·`signal_ref`만(새 기술명·경로·confirmed 발명 금지),
  코드가 응답 검증·id/정렬/fingerprint 생성. **confidence≤likely 캡**. 닫힌 candidate 어휘 validate.
  `assist.status: not_needed|used|failed` (실패=응답 전체 거부·결정론 core 유지).
- **경계**: 이건 **아티팩트에만**(disclosure) — seed 미접촉 유지(M2). LLM 결과가 seed에 흐르는 건
  F 워크스트림(§3c 후속).

### 3c. attention seat + 검증/보강 fold — 후속 워크스트림(별도, 지금 아님)
- **attention**: design-verify M1이 candidate-seat 재정렬을 **무효 메커니즘**으로 확정(excerpt 생존
  불변). 제대로 하려면 **파일별 excerpt 예산**이라는 신규 손잡이 필요 — 이번에도 스코프 초과 가능성
  높음. 실 mid-file 벤치 증거 나온 뒤에만 승격.
- **검증·보강(F)**: 프로파일→seed placement 실증 보강. **flags-first**(onto review 재사용,
  `targetRefs`가 임의 ref 수용) 방향. **fold 미채택** 확정(생성/검증 시간·아키텍처 분리로 경계 확보).
  근거 축적 후 별도 설계.

## 2. 개념 경제 (재사용/신규)

- **재사용**: `KNOWN_SIGNAL_BASENAMES`(스캔↔content_parse 단일-소스)·스캔의 path-safe walk 패턴·
  카탈로그 `BASENAME_RULES`·fingerprint fold 패턴·assembler detection 병합.
- **신규(3a)**: content parser 모듈(정적 파서 per 포맷)·실패 taxonomy enum·parser 버전 상수·
  detection `properties`(version/module mode)·새 config 키(3a/3b 각각 또는 단일). 이름
  traceability 유지.

## 3. 검증 (staged workflow)

- 정적: typecheck·lint·**전체 게이트 배터리**(이전에 `check:graceful-signal-rethrow` 누락→CI가 적발
  한 교훈 — run.ts 새 catch는 반드시 `if(isGracefulTerminalSignal(e))throw e;`+provider-output 가드).
- 단위: 각 포맷 파서 fixture(정상·parse-error·partial·코드-실행-시도 거부)·닫힌 어휘 검사·
  fingerprint(parser hash fold)·off=부작용0.
- **live 실사용**: §7 tsx harness로 소규모 manifest 타겟에 실 run — content_parse가 dep을 읽어
  framework certain 승격되는지 확인.
- **구현 후 독립 3-렌즈 교차검증**(신규 fs-read 권한 = path-safety 렌즈 필수; 코드-접지 이종 렌즈).

## 4. 잔여 owner 결정 (구현 중)

- content_parse config 키: 3a/3b 각각 vs 단일 `environment_context_profile_content`.
- truncation 정책: 대형 manifest 정직 gap 수용(기본) vs capture 예산 상향(경계 리스크).
- LLM assist 활성화(3b)는 근거 후 별도 owner 승인(spend).

## 5. 교훈 (이번 사이클)

- **cross-kind 렌즈 다양성**: Stage 0 BLOCKER(record W3-001)를 런타임 렌즈만 적발(경계·설계 렌즈 놓침).
- **CI가 로컬 놓친 것 적발**: 게이트 배터리에서 `check:graceful-signal-rethrow` 누락 → 전체 배터리 습관.
- **live 검증이 갭 실증**: replay가 census 갭(walk cap이 manifest 매장) 노출 → 스캔 증분 정당화.
- **stale MCP**: 제품은 글로벌 npm 설치 실행 → 코드 변경은 발행+재설치 후에만 제품 반영.
- **비결정성 자체발견**: `Function.toString()` fold가 transpiler 의존 → `RegExp.source` fold로 교정.

## 6. 첫 명령 (fresh 세션)

```
cd /Users/kangmin/Documents/onto-mcp && git fetch origin main && git log --oneline -5 origin/main
npm view onto-mcp version              # v0.4.15 발행됐는지
gh pr view 243 --json state            # 승격 PR 머지됐는지
npx vitest run                          # 3,387 green 기준
```
그다음 설계 SSOT 읽기: synthesis §0 → design-verify-findings → 현 구현 모듈. 모델: 구현 WORKHORSE +
검증 강화(path-safety 렌즈 필수 — 신규 fs-read 권한).

## 7. 로컬 live 검증 harness (재작성용 — 이번 세션에서 검증됨)

제품 MCP는 stale라 로컬 src로 검증한다. 임시 `.mts`(repo 루트, 실행 후 삭제):
```ts
import { createOntoReconstructCoreApi } from "./src/core-api/reconstruct-api.ts";
// 소규모 manifest 타겟 프로젝트(.onto/settings.json에 environment_context_profile:true) 생성 후:
const api = createOntoReconstructCoreApi({ ontoHome: process.cwd() });
await api.runReconstruct({ projectRoot, targetRefs: ["demo-app"], sessionRoot: ".onto/reconstruct/s",
  intent: "...", profilesRoot: "<repo>/.onto/processes/reconstruct/source-profiles",
  filesystemAllowedRoots: [projectRoot],
  semanticAuthorRealization: "direct_call", confirmationProviderRealization: "direct_call" });
// 실행: node --env-file=.env --import tsx tmp.mts (타임아웃 후 세션 dir의 comprehension/
// environment-context-profile.yaml 검사 — 훅은 seed authoring 전에 아티팩트를 씀).
```
`.onto/temp/`는 gitignored. 실행 후 임시 파일·temp 프로젝트 정리.
