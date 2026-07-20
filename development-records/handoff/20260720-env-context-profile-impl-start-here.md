# 환경 컨텍스트 프로파일 — 구현 start-here (2026-07-20, /clear 후 재개용)

> 설계 저작 + design-verify + 개정 **완료**. **이것은 구현 단계다** (설계 아님).
> 재개 시 pwd/branch/HEAD 재검증 필수. 코드 인용은 심볼명으로 재확인(라인번호는 힌트).

## 0. 상태 핀

- 설계 사이클 완료: blind packet → 이종 2벌 병렬설계(gpt-5.6-sol codex hermetic · claude opus-4-8
  frontier, OAuth) → 교차검증 → 종합 → **design-verify(적대 2렌즈)** → 개정.
- 이 핸드오프 + 설계 산출물은 PR `docs/env-context-profile-design`으로 커밋됨. **이 핸드오프를 담은
  커밋 해시는 불안정 — merged design PR 이후 상태에서 재개.**
- 스위트 기준: `npx vitest run` = **3,331 green**(설계는 런타임 코드 무변경). 6게이트 green.
- settings: 프로파일 신규 키 **미도입**(구현 시 추가). `code_structure_inventory` ON(repo)·
  `semantic_map_code`·`semantic_map_code_set_tier` OFF.

## 1. 무엇을 구현하나 (확정 스코프)

**SSOT = `design/20260720-env-context-profile-crossverify-synthesis.md` §0**(최종 확정+개정).
findings = `design/20260720-env-context-profile-design-verify-findings.md`.
drafts/verify 원본 = `design/20260720-env-context-profile-drafts/`.

**스코프 = 환경 컨텍스트 프로파일 아티팩트(결정론 추출) + seed-safe disclosure.**
**제외(후속)**: attention(무효 메커니즘 — 아래 §2)·검증·보강(flags-first 후속 워크스트림).

## 2. CONFIRMED grounding (design-verify 실코드 확인 — 재검증 대상)

- **훅 지점 실재**: `runReconstruct`의 set-tier 블록(`assembleCodeSetTier` 호출부, run.ts ~17001-
  17033)을 미러링. topology·observer imports census(관찰의 `structural_data.
  code_structure_inventory`)·`targetMaterialProfile`가 동일 스코프 공존 → **새 순회 불필요.**
- **disclosure 채널**: reconstruct엔 review식 `structuredContent.disclosures`/`llmPresentation`
  **없음**. `finalOutputText`(`writeFinalOutput` → `final-output-sections.ts`, **post-seed
  projection이라 seed-safe**) + `artifactRefs`(reconstruct-api.ts `artifact_refs`)로 표출.
- **경계(M2)**: seed userPayload가 구조 신호를 setter로 fold(`setCodeSetTierOverview` idiom,
  writeOntologySeed userPayload의 `code_set_tier`). → **프로파일 setter를 배선하지 말 것** +
  seed userPayload 키 닫힌집합 assert 회귀가드(environment_profile 배제).
- **attention seat 무효(구현 금지)**: candidate seat(`observationPromptPayload`)는 선택 관찰 전부
  방출·excerpt는 관찰별 순서무관 cap이라 재정렬이 excerpt 생존을 못 바꿈. **attention 미구현.**

## 3. 개정 반영 필수 (design-verify MATERIAL)

- **M2 경계 역량-표면화**: 프로파일을 runReconstruct 스코프에서 계산·**seed에 setter 미배선**·
  seed 키 닫힌집합 회귀가드.
- **M3 detection 품질**: `scope_path`(monorepo per-package 적용범위)·confidence 어휘 단일화
  (`certain|likely|weak`)·**상관증거 dedup**(manifest+lockfile+import 동일 선언 = 1 신호, 3
  중복계산 금지).
- **M4 done-when**: A–G **계열별 positive 단언**(hollow-impl PASS 차단)·off = **부작용 0**
  (스캔·읽기·write·LLM 없음, 출력 byte-identical만 아님).
- **M5 fingerprint**: 프로파일 fingerprint에 census/manifest 내용·ruleset_version·scan cap·
  parser hash fold(set-tier fingerprint 참조만으론 stale 재사용).
- **닫힌 어휘 방벽 채널 한정**: `detection.value`뿐 아니라 `evidence_refs`·경로·패키지명·
  `.env.example` 키를 프로파일 출력/disclosure에서 구조적 배제/정제(도메인 의미 누출 차단).
- **커버리지**: 프로파일 전용 known-signal allowlist(dotdir `.github/workflows` 포함) — 재사용
  walk의 dotdir-skip/depth3/entries200 한계 보완.

## 4. 최소 실행 경로 (Stage 0, default-off)

1. 신규 `src/core-runtime/reconstruct/environment-context-profile.ts`(순수 함수, set-tier
   sibling): 기존 관찰의 census+topology+imports에서 결정론 detection 집합 추출(폴리글랏 보존·
   충돌 둘 다 보존).
2. 신규 아티팩트 타입 `ReconstructEnvironmentContextProfileArtifact`(artifact-types.ts).
3. 신규 config 키 `environment_context_profile`(default off). off=미호출·부작용0·byte-identical.
4. runReconstruct 훅(set-tier 블록 미러): 게이트 → in-scope 조립 → 아티팩트 write → final-output
   섹션 표출(seed 미접촉).
5. 되돌리기 = 키 제거.
- **Stage 3(후속)**: content_parse(정적-only·config 실행 금지·실패 taxonomy·새 fs-read
  authority)·유계 LLM assist(침묵/충돌 시만·닫힌 candidate 어휘·confidence≤likely).

## 5. 개념 경제 (재사용/신규)

- **재사용**: set-tier topology/relation/fingerprint(입력), observer imports census,
  target-material-kind census/walk, final-output-sections, artifactRefs.
- **신규**: `ReconstructEnvironmentContextProfileArtifact`·`EnvironmentContextDetection`
  (+`scope_path`·`confidence`)·rule table(데이터)·config 키·(Stage3) content parse·LLM assist.
- 이름 traceability: `environment-context-profile.ts` → `EnvironmentContextProfile` →
  `environment_context_profile`(필드·키 prefix).

## 6. 잔여 owner 결정 (구현 중 확인)

- 닫힌 어휘 hard-block 여부 + 어휘 확장 절차(경계의 유일 방벽).
- 스캔 상한(entry·depth·byte) 기본값 + 상한 도달 시 fail-loud 정책.
- content_parse truncation(Stage 3): 정직 gap 수용 vs capture 예산 상향(materialize-preparation
  변경, 경계 리스크).

## 7. 검증 (staged workflow)

- 정적: typecheck·lint·6게이트.
- Stage0 done-when(falsifiable): off byte-identical+**부작용0** diff; A–G **계열별 positive**
  fixture(Next.js·Django·폴리글랏·unknown); 폴리글랏 language≥2; unknown certain framework=0;
  순서 섞어도 fingerprint 동일; 닫힌 어휘 검사; **seed userPayload 키 닫힌집합(프로파일 배제)
  회귀가드**.
- 구현 후 **독립 3-렌즈 교차검증**(관례, 코드-접지 렌즈 포함 — design-verify 교훈).

## 8. 첫 명령 (fresh 세션)

```
cd /Users/kangmin/Documents/onto-mcp && git fetch origin main && git log --oneline -3 origin/main
npx vitest run   # 3,331 green 기준
```
그다음 설계 SSOT 읽기: synthesis §0 → design-verify-findings → drafts/. 모델: 구현 WORKHORSE
+ 검증 강화(코드-접지 이종 렌즈 필수 — 병렬 draft 공유 맹점 교훈).
