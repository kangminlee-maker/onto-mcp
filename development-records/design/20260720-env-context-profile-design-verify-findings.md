# 환경 컨텍스트 프로파일 — design-verify findings (2026-07-20)

> 확정 설계에 대한 구현-전 적대적 design-verify. 렌즈 2벌: (A) gpt-5.6-sol codex hermetic
> — 설계 논리·경계·개념경제·falsifiability(텍스트만); (B) claude opus-4-8 frontier repo-aware
> — grounding·실현가능성 실코드 검증. 원본: `20260720-env-context-profile-drafts/verify-gpt-sol.md`·
> `.../verify-claude-frontier-grounding.md`. 주 세션이 **결정적 finding을 실코드로 독립 재확인**. HEAD `e150589`.
>
> **판정: 현 설계는 verify 통과 못 함 — attention 기둥 return-to-design.**

## 0. 핵심 결론

design-verify가 **두 설계 draft가 공유한 맹점**을 잡았다. D/E(attention seat)의 "고신뢰
cross-family 수렴"은 **두 designer가 같은 packet §4 grounding(주 세션 저작)의 부정확한 인과
모델을 물려받은** 것이라 신뢰할 수 없었다. 다른 kind(코드-접지) 리뷰어가 이를 적발 — 수렴
휴리스틱대로 "same-input 수렴 ≠ 검증".

## 1. CONFIRMED MATERIAL (재확인/교차수렴)

**M1. attention 메커니즘이 무효 (frontier Claim 1, 주 세션 실코드 CONFIRMED; gpt #4/#5 수렴).**
채택 seat(candidate 12484→`observationPromptPayload` 10153)는 선택된 **모든 관찰을 방출**
(10176 `.map`, 배열-drop 없음), 절단은 **관찰별 excerpt char cap**(10186 compact, 순서 무관).
관찰-drop 절단(`slice(0,160)` ONTOLOGY_SEED_OBSERVATION_LIMIT, 7591)이 있는 seed seat은
`includeStructuralData:false`(12773)라 원문 미읽음. → **재정렬은 위치만 바꿈, excerpt 생존
불변.** "절단 유발 fixture로 검증"은 무효 신호를 겨냥(재정렬해도 excerpt byte-identical).
재정렬의 유일 실효과 = 프롬프트 배열 순서(약·비결정 LLM primacy) = 설계가 회피하려던 vacuous
신호. **Stage 1 attention(D=per-source·E=12484)이 의도한 결정론 효과를 내지 못함.**
- 심화 B-1: candidate가 재정렬 `source_observations`(12512)와 **비재정렬**
  `selected_observations`(12506)를 동시 노출 → 순서 신호마저 희석.

**M2. "seed 미접촉" 경계가 역량-표면 방벽이 아닌 규율 (frontier Claim 5 + gpt #2/#4, 교차수렴).**
seed userPayload가 구조 신호를 setter idiom으로 fold(`code_set_tier` 12756 ←
setCodeSetTierOverview 11692 ← wire 17030). 프로파일도 **한 줄 setter**로 유입 가능 → 격리는
"배선 안 함" 규율일 뿐. CLAUDE.md("금지 반복 대신 불가능·무효로")·설계 자체 목표("프롬프트-held
경계 회피")에 반함. **fix**: 프로파일을 runReconstruct 스코프(17001류)에서 계산해 아티팩트+
final-output 섹션으로만 방출·setter 생략 + seed userPayload 키를 닫힌 집합으로 assert(프로파일
배제) + 프로파일 타입을 seed-payload 빌더 스코프에서 import 불가 격리.

**M3. 종합-이식 누락 (주 세션 종합 버그).**
- scope_path 없음(gpt #7): gpt draft `EnvironmentDetection.scope_path`를 종합이 떨어뜨림.
  monorepo 전역 detection 오적용·Node18/20 다중 scope를 `certain≥2` 충돌 오인.
- confidence 어휘 미조정(gpt #12): 최종 `certain|likely|weak` vs 이식 규칙 `decisive→confirmed`·
  "confirmed 발명 금지" 미변환. + 상관 증거 중복계산(manifest+lockfile+import 동일 선언 = 1
  사실인데 3 강신호 합산 → Vue 앱이 React confirmed 오분류).

**M4. falsifiability 갭 (gpt #13/#15; #14는 M1로 subsume).**
- done-when이 빈 구현으로 PASS(gpt #13): A–G fixture·polyglot≥2·unknown certain=0이 **신호
  계열별 양성 detection을 요구 안 함** — 확장자 언어 2개만 내고 A–C parser가 항상 [] 반환해도
  통과. → 계열별 positive 단언(subject cardinality>0) 필요.
- off byte-identical이 부작용 미차단(gpt #15): 출력 diff만 같으면 off에서도 스캔·`.env.example`
  읽기·LLM 호출·캐시/아티팩트 write·로그 노출 가능. → off = **부작용 0** 단언 필요.

**M5. fingerprint가 입력 snapshot 미결속 (gpt #10 + frontier B-2, 교차수렴).**
`source_set_fingerprint`만으론 census/manifest 내용·scan cap·parser/rule-table hash·LLM
provenance 미포함 → package.json만 바뀌어도 stale 프로파일 재사용. F 후속에서 프로파일이
프롬프트에 영향하면 fingerprint+ruleset_version을 reuse-key(17040-17065)에 배선 필수.

## 2. CONFIRMED — 경계 spec 갭 / 구현-단계 (bounded)

- **닫힌 어휘 방벽 범위 협소 (gpt #3, 경계)**: `detection.value`에만 적용, `evidence_refs`·경로·
  `properties`·패키지명(`@corp/payroll-tax-engine`)·`.env.example` 키(`PATIENT_RECORD_BUCKET`)·
  `method`/`signal_ref`로 도메인 의미 누출. "도메인명 금지"는 의미 판정이라 결정론 검사 불가 —
  방벽 대상 채널을 **구조적으로** 한정해야.
- **A–G 커버리지 갭 (gpt #8)**: 재사용 walk(depth3·entries200·**dotdir skip**)가 `.github/
  workflows`(CI 신호) 누락·심층 monorepo manifest 누락. B=혼합 부분 재개 — 프로파일 전용
  known-signal allowlist(dotdir 포함) 필요.
- **침묵-LLM 계약 (gpt #6)**: 닫힌 candidate 어휘에서 분류(발명 아님)로 해소 가능 — gpt draft가
  이미 규정, 종합이 미명세.
- **content parser 안전 (gpt #9, Stage3)**: `next.config.*` 실행 설정 = full parse가 코드 실행
  위험 → **정적-only** 강제 + 실패 taxonomy(parse-error/unsupported/partial/true-silence 구분).
- **Stage3 새 fs-read 권한 (frontier B-3)**: 6000자 캡처 밖 재읽기 = path-safety/symlink/
  root-escape 의무를 새 사이트에 부과 — 경량 취급 금지.

## 3. MINOR — 채널 명명 교정 (frontier)

- **disclosure 채널 (Claim 3)**: `structuredContent.disclosures`/`llmPresentation`은 **review
  전용, reconstruct에 없음**. 동등 surface = `artifactRefs`(reconstruct-api.ts:1803) +
  `finalOutputText`(final-output-sections, **post-seed projection**이라 seed-safe). 의도 실현
  가능, 명명만 교정.
- **flags-first review 재사용 (Claim 4)**: review `targetRefs`(tool-schemas.ts:124)가 임의 ref
  배열 수용 → seed.yaml 기계적 수용 가능. 단 "seed-대-source 구조검증 의미(렌즈)"는 신규 저작
  필요. 설계가 후속으로 스코프한 건 정직(과대주장 아님).
- 단일 파일 미생성 상태 모호(gpt #17): not_applicable/off/scan-fail 미구분.

## 4. doc 결함 (주 세션 유발) — 수정 대상

- §3이 옛 fold 종합안(projection→disclosure→fold opt-in)을 아직 서술 → §0/§5 정정과 충돌
  (gpt #18). confirmed/certain 불일치도 동류.

## 5. SOLID (검증 통과 — 설계의 견고한 부분)

- **A=신규 독립 아티팩트 grounding (frontier Claim 2 CONFIRMED)**: 프로파일 훅 공존 지점이
  runReconstruct ~17001-17064에 실재(set-tier 블록 미러), **새 순회 불필요**.
- disclosure 의도 실현가능(final-output-sections·artifactRefs, seed-safe).

## 6. 처분

**return-to-design (attention 기둥) + 종합 수정 + 경계 역량-표면화 + done-when 하드닝.**

1. **attention 재triage (owner)**: candidate seat 무효 확정. 대안 — (a) seed seat(7591, slice
   160) 재정렬 = 관찰 수>160일 때만·summary 기준(excerpt 아님)으로 **어떤 관찰이 seed에
   들어가나**를 실제 바꿈(좁은·조건부 값) / (b) attention을 selection 변경으로 승격(사용자
   coverage 권위 침해 — 설계가 기각했던 것) / (c) **attention 트랙 자체를 이번 스코프에서 제외**
   (프로파일 disclosure만 유지, attention은 실효 seat 확인 후 별도). M1이 D/E/Stage1을 무효화.
2. **경계 M2**: 역량-표면 방벽(스코프 격리 + 키 닫힌집합 assert) — 설계 필수 반영.
3. **종합 M3 수정**: scope_path 복원, confidence 어휘 단일화 + 상관증거 dedup 규칙.
4. **M4/M5**: 계열별 positive 단언·off 부작용-0 단언·fingerprint 전-입력 fold.
5. **doc §3 정정**(§4 결함).

**owner 결정 (2026-07-20): (c) attention 이번 스코프 제외** — 프로파일 + seed-safe disclosure만
확정, attention 없이 결과 확인 후 추가여부 결정(제대로 하려면 파일별 excerpt 예산 = 신규 손잡이
필요, 이번 스코프 초과). M2~M5·doc·채널·어휘 수정은 개정 설계에 반영(synthesis §0).
