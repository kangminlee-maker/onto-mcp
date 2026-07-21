# 환경 컨텍스트 프로파일 — Stage 3a content_parse 상세 설계 (2026-07-21)

> Stage 0(census 존재-기반 detection) + Stage 0.5(known-signal 스캔) 위에 얹는 **정적-only 매니페스트
> 내용 파싱** 증분. 상위 SSOT: `20260720-env-context-profile-crossverify-synthesis.md` §0 +
> `.../design-verify-findings.md`(§2 B-3·gpt #9). 착수 핸드오프:
> `handoff/20260721-env-context-profile-stage3-start-here.md` §1(3a).
>
> **성격**: 신규 fs-read 권한(파일 **내용** 읽기, 지금까지는 존재만) 도입 증분 → 구현 전 owner 승인 +
> 구현 후 3-렌즈 교차검증(path-safety 렌즈 필수). default-off, 되돌리기 = 키 제거.

## 0. 왜 (가치)

현재 detection 입력은 세 가지뿐: 파일 **존재**(basename), 확장자 분포, **관찰된** import 지정자.
한계: (i) import는 코드가 관찰될 때만(관찰 안 됐거나 set-tier capture opt-in OFF면 `imports_available=false`
→ framework 신호 상실), (ii) 6000자 excerpt로는 대형 매니페스트 dep 목록을 신뢰성 있게 못 봄
(synthesis §2 gpt 지적). content_parse는 스캔이 이미 찾은 **매니페스트 전체 내용**을 정적으로 읽어:

- **선언 의존성 → framework**: `package.json`의 `dependencies`/`devDependencies`에 `react`/`express`/
  `next`가 있으면 import 없이도 framework 검출.
- **confidence 승격**: dep 선언(strong) + import(strong) = 서로 다른 method 2개 → certain.
- **닫힌 properties 추출**: `engines.node`(런타임 버전 핀), `type: module`(ESM/CJS 모드).

## 1. 스코프 확정 (최소 실행 경로)

**3a = JSON 매니페스트만.** `package.json`이 명확한 80/20 타깃. 근거:
- `JSON.parse` 네이티브 → **신규 의존성 0**(TOML 파서 미설치 — 증분에 supply-chain 추가 회피).
- Cargo.toml/pyproject.toml은 basename만으로 이미 language 신호(rust decisive·python strong); 그 dep의
  framework 값은 python import로 대부분 커버됨. TOML dep 파싱은 **honest `unsupported` 상태**로
  정직하게 남기고 fast-follow(별도 증분, `smol-toml` 도입 결정 포함).
- YAML(`yaml` lib 존재)은 docker-compose(이미 basename→infrastructure)·lockfile뿐이라 3a 가치 없음 → `unsupported`.

**파싱 대상**: 스캔/census가 찾은 절대경로 중 basename이 알려진 JSON 매니페스트인 것
(`package.json`·`composer.json`·`angular.json`·`vercel.json` 등 `.json` known-signal). `package.json`은
전용 추출(deps + engines + type); 나머지 JSON은 **일반 dep-키 추출**(카탈로그 매칭만, 대부분 무매칭 =
true silence, 정직).

## 2. 경계 / 안전 (design-verify B-3 · gpt #9 — 신규 fs-read 권한)

1. **정적-only**: JSON 안전 파서(`JSON.parse`)만. **코드 실행 절대 금지** — `next.config.js`/`Gemfile`/
   `setup.py`/`vue.config.js`는 JS/Ruby/Python **코드**라 파싱 대상에서 제외(정적 토큰 스캔조차 3a 밖 —
   `unsupported`). 단위 테스트로 "코드-config 입력 → eval/require 미발생" 봉인.
2. **경로 안전 = 스캔 재사용, 신규 traversal 0**: content_parse는 **스스로 경로를 발견하지 않는다**.
   `environment-signal-scan.ts`가 이미 path-safe walk(심링크 미추적·root 내부·depth/breadth 유계·
   dotdir/vendored skip)로 vetting하고 **심링크 파일 자체도 제외**(scan.ts:102 `isSymbolicLink()→continue`)한
   절대경로 allowlist만 재읽기. 방어적으로 읽기 직전 **재-lstat**(정규 파일 확인·심링크면 skip)·**scan root
   내부 확인**·**바이트 캡 읽기**(TOCTOU + 대형 파일 backstop). 단일 사용자 own-data 도구라 TOCTOU는
   저위험이나 path-safety 렌즈 만족 위해 명시 가드.
3. **닫힌 어휘 방벽 유지**: 파싱한 dep **이름은 닫힌 카탈로그(IMPORT_RULES 재사용) 정확 매칭만** detection
   방출. 도메인 dep(`@corp/payroll-tax-engine`)은 무매칭 → 기여 0·**출력 미방출**(원시 dep 목록은
   content-parse 모듈 내부에만 존재, assembler가 매칭 후 폐기). version 값은 **charset 제한
   (`[\d.^~><=* x|,-]`)+길이 캡+버전-shape 검증** 후 `properties`에 닫힌 키로만(`file:`/`github:` 같은
   경로/org 유입 차단 — 버전-shape 불일치 시 drop).
4. **실패 taxonomy**(honest gap, 절대 날조 금지): per-file 상태
   `parsed | parse_error | unsupported | truncated`. 집계 `true_silence` = 전부 parsed·신규 detection 0
   (모호 아님, 3b LLM-assist 트리거가 "clean-empty" vs "parse 실패" 구별하는 근거).

## 3. 개념 경제 (재사용 우선)

**재사용**:
- `KNOWN_SIGNAL_BASENAMES`(스캔↔content_parse 단일 소스) — 스캔이 찾고 content_parse가 읽는다.
- **`IMPORT_RULES` 카탈로그를 dep 매칭에 재사용**(신규 DEP_RULES 테이블 **미도입**): 대부분 prefix가
  bare 패키지명(react·vue·express·django·`@angular/core`·`@nestjs/core`)이라 dep 이름 = import prefix.
  dep 이름을 `IMPORT_RULES`의 bare-package와 **정확 매칭** → 같은 canonical_name 버킷으로 병합
  (react dep + react import = 한 framework 두 method). 단일 카탈로그 유지, 중복 리스트 회피.
- `CatalogEmit` shape·`combineConfidence`(method 독립성 로직)·`resolveScopes`·`addContribution`·
  fingerprint fold 패턴·`catalogDigest`.

**신규**:
- **모듈 `environment-content-parse.ts`**(fs-read + 정적 파서, `environment-signal-scan.ts`와 형제 =
  impure 경계): candidate 절대경로 목록 → 정규화된 `ParsedManifest[]`(닫힌 데이터: `{rel_path, format,
  status, declared_packages: string[], runtime_version_constraint?, module_type?, content_sha256}`).
  원시 dep 목록(`declared_packages`)은 이 모듈 출력에 있으나 assembler가 카탈로그 매칭 후 detection만
  방출 — 원시 목록은 profile 출력에 절대 미유입.
- **method `manifest_dependency`** (신규 `EnvironmentSignalMethod` 값), `signal_ref = "dep:<name>"`
  (카탈로그 매칭명만).
- **`EnvironmentContextDetection.properties?: Record<string,string>`** — 닫힌 키(`runtime_version_constraint`·
  `module_type`)·정제 값만. `runtime:node` detection에 부착.
- **`coverage.content_parse`** 블록: `{ files_read, parsed, parse_error, unsupported, truncated }` +
  `parser_version`. 정직 taxonomy 표면화.
- **상수 `ENVIRONMENT_CONTENT_PARSE_VERSION`** — fingerprint fold(파서 로직 변경 → 재사용 무효).
- **config 키 (§7.1 owner)**: `environment_context_profile_content`(단일, 3a fs-read 권한 게이트).
  base(`environment_context_profile`, 존재-only)와 별도; 미래 3b LLM-assist는 또 별도 키(spend 게이트).

## 4. 배선 (run.ts 훅 — 기존 17200 블록 내부)

기존 `if (params.environmentContextProfile === true)` 블록 **안에 중첩**:
```
scan = await scanEnvironmentSignalFiles(...)          // 기존 (Stage 0.5)
let parsed: ParsedManifest[] = []                       // 신규
if (params.environmentContextProfileContent === true) { // 신규 게이트
  parsed = await parseEnvironmentManifests({
    candidatePaths: [...scan.signals, ...censusManifestRefs],  // dedup·JSON known-signal만
    scanRoots,                                           // root 내부 확인용
  })
}
profile = assembleEnvironmentContextProfile(projectEnvironmentContextProfileInput({
  ..., contentManifests: parsed,                         // 신규 입력(빈 배열 = 미변경)
}))
```
- content_parse의 catch는 **반드시** `if (isGracefulTerminalSignal(e)) throw e;` +
  `readReconstructLlmDispatchFailureError` 가드(교훈: `check:graceful-signal-rethrow`).
- **게이트 위계**: base OFF → 프로파일 전무(content moot). base ON + content OFF → **Stage 0.5와
  byte-identical**(fs 내용 읽기 0). base ON + content ON → deps/properties 추가.
- **신규 아티팩트 없음**: 기존 `environment-context-profile.yaml` 증강뿐 → `record.ts`
  `RECORD_ARTIFACT_KEYS` 신규 키 불필요(surgical). M2 경계 불변(setter 없음·disclosure-only 유지).

## 5. assembler 변경 (environment-context-profile.ts)

- 입력에 `content_manifests: ParsedManifest[]` 추가(기본 `[]` = Stage 0.5 동작 불변).
- 각 `ParsedManifest`의 `declared_packages`를 `IMPORT_RULES` bare-package와 정확 매칭 →
  `addContribution(method="manifest_dependency", strength=rule.emit.strength, signal_ref="dep:<name>")`
  (scope = 매니페스트 디렉터리의 scopeOf). dep+import는 **다른 evidence class**(선언 vs 사용)라 별도
  correlation_group 미부여(각각 독립 method로 카운트 = 의도).
- `runtime_version_constraint`/`module_type` → 해당 scope의 `runtime:node`(또는 language) detection
  `properties`에 닫힌 키로 병합.
- **fingerprint fold**(M5): 입력 스냅샷에 `content_manifests`(rel_path·content_sha256·status·
  추출값 정렬) + `parser_version` 추가. `catalogDigest`는 IMPORT_RULES 이미 fold(dep 매칭이 같은
  테이블 사용). 매니페스트 내용 1비트 변경 → fingerprint 회전.
- confidence 로직 불변(`manifest_dependency`는 strong 기여로 기존 `independentStrongMethods` 카운트에
  자연 편입 — dep 단독 = likely, dep+import 또는 dep+config = certain).

## 6. 검증 (staged workflow)

- **정적**: typecheck·lint·**전체 게이트 배터리**(특히 `check:graceful-signal-rethrow`).
- **단위**(신규 fixture):
  - 파서: 정상 package.json → deps 추출·engines/type properties; malformed JSON → `parse_error`
    (throw 없음, 정직 상태); >캡 → `truncated`; JS 코드-config 입력 → `unsupported`·**eval/require
    미발생 봉인**; 도메인 dep `@corp/x` → 기여 0(방벽); version `file:../x` → drop(shape 불일치).
  - 닫힌 어휘: 출력에 원시 dep명·경로·도메인 version 부재 단언.
  - fingerprint: content_sha+parser_version fold(내용 변경 → 회전), 순서 무관 동일.
  - **off = 부작용 0**(M4): content 키 OFF → `fs.readFile` 미호출(spy) + Stage 0.5 byte-identical.
  - **계열별 positive**(M4, subject cardinality>0): react dep 있는 package.json → `framework:react`
    detection 존재(빈-구현 PASS 차단).
- **live**(§8 harness): react/express 선언 package.json 소규모 타깃 → framework certain(dep+import)/
  likely(dep only) 승격 확인; content OFF 동일 타깃 → Stage 0.5 불변.
- **구현 후 독립 3-렌즈 교차검증**: path-safety(신규 fs-read)·경계/닫힌어휘·결정론/fingerprint. 코드-접지
  이종 렌즈, material 0 확인 후 완료.

### 6.1 검증 결과 (2026-07-21 — 구현 완료)
- **정적**: typecheck PASS·graceful-signal-rethrow PASS(신규 catch 0 — content_parse는 propagate=fail-loud)·
  import-boundary·spec-defaults·invariant-change·ts-core PASS. (`check:supported-models`는 **선행 실패**
  = 무관 — stale `20260720` 벤치 아티팩트, 내 변경 stash 후에도 실패.)
- **단위+통합**: 전체 스위트 **3,419 green**(신규 테스트 +32, 회귀 0). 신규: content-parse fs 파서·assembler
  dep/properties/coverage/fingerprint·**real-fs end-to-end**(module→projection→assembler 실 package.json).
- **3-렌즈 교차검증 (frontier 이종, 실코드+실증)**: 전부 **SOUND / material 0**.
  - path-safety: containment·심링크/device 거부·JSON-only·byte cap·off⇒read 0 확인.
  - boundary: 코드 추적 **+ 적대적 hostile-package.json live probe**(직렬화 아티팩트에 ~18 마커 0건,
    positive/negative 대조 통과)·M2 byte-unchanged.
  - determinism: **HEAD vs 워킹트리 assembler 실행 byte-compare**(off 동일·fingerprint `079eaeef`)·
    catalogDigest 불변·content 변경 회전·순서무관 확증.
- **반영한 하드닝(비차단, 원칙적)**: ① version 배리어 emission-local화(sanitizer를 순수 모듈로 단일화·
  assembler 방출 지점 재적용 — M2 capability-surface 원칙)+falsifiable rogue-row 테스트, ② best-effort
  read(read 에러 skip — doc 정합), ③ content_manifests 정렬로 contract-level 결정성, ④ true_silence 주석 정정.

### 6.2 알려진 한계 (3b 핸드오프로 이월)
- **unreadable-manifest → true_silence 정직성 홀 (path-safety Nit A)**: 스캔이 찾은 package.json이
  read 시점에 사라지거나(race) 읽기 불가면 skip(행 없음) → 드물게 `true_silence`가 거짓-참 가능. 3a
  출력엔 무영향(3b 미구현). **3b가 true_silence를 소비할 때** unreadable에 별도 status 필요 여부 결정.
  현재 닫힌 4-status taxonomy 유지(미구현 소비자 위해 투기적 확장 안 함).

## 7. owner 결정 (구현 전) — **확정 2026-07-21**

1. **[config 키]** — ✅ **단일 `environment_context_profile_content`**(3a). content_parse는 하나의
   fs-read 권한 게이트; 3b LLM-assist는 성격이 다른 spend/authority라 착지 시 별도 키. base와도 별도.
2. **[TOML 스코프]** — ✅ **3a = JSON-only**(신규 의존성 0). Cargo/pyproject dep는 `unsupported` 정직
   표기 + fast-follow(TOML 파서 도입 결정 포함). 근거: 값 대부분이 JS/TS 생태계(선언-비import 갭),
   python framework는 대개 import로 커버.
3. **[truncation 정책]** — ✅ **honest gap 기본**(바이트 캡·`truncated` 표기·날조 0).
4. **[검증 순서]** — ✅ **구현 먼저 → 실코드 3-렌즈 교차검증**(path-safety 렌즈 필수). 근거: 3a 위험
   3종(off fs-read 게이트·닫힌어휘 누출·off 부작용0)은 코드-레벨이라 설계 산문보다 실코드 검증이 유효.

## 8. live 검증 harness (핸드오프 §7 재사용)

제품 MCP는 stale(글로벌 npm)라 로컬 src `.mts`로 검증(`node --env-file=.env --import tsx`). 소규모
temp 프로젝트(`.onto/settings.json`에 `environment_context_profile:true` +
`environment_context_profile_content:true`, `package.json`에 react/express dep) 생성 →
`createOntoReconstructCoreApi` → `runReconstruct` → 세션 dir `comprehension/
environment-context-profile.yaml`에서 dep-derived framework detection·properties 확인. 실행 후 정리.

## 9. 되돌리기 / 리스크

- **되돌리기**: `environment_context_profile_content` 키 제거 → base 프로파일 Stage 0.5로 복귀
  (byte-identical, off=부작용0 테스트 보증).
- **리스크**: (i) 신규 fs-read = path-safety(스캔 allowlist 재읽기 + 재-lstat로 완화), (ii) 닫힌 어휘
  누출(dep명/version — 카탈로그 매칭 + charset 제한으로 구조적 차단), (iii) 대형 매니페스트(바이트 캡 +
  honest truncated). 전부 §2 가드로 처리.
