# 환경 컨텍스트 프로파일 — Stage 0 구현 완료·다음 단계 (2026-07-20)

> 설계(병렬 2벌+design-verify+개정) → **Stage 0 구현 + 이종 3렌즈 교차검증 + delta 재검증 완료.**
> 재개 시 pwd/branch/HEAD 재검증. 코드 인용은 심볼명으로 재확인(라인번호는 힌트).

## 0. 상태 핀

- **미커밋** — 변경은 `main` 워킹트리에 있음(커밋/PR 미실행). 재개 전 `git status` 확인.
- 스위트 `npx vitest run` = **3,370 green + 1 todo**. tsc·6정적게이트 exit 0.
- config: `environment_context_profile` **미도입 상태에서 OFF**(신규 키, default off). repo settings 미변경(승격 안 함 — set-tier 선례대로 live 근거 후 owner).
- 무관 사전 노이즈: `check:invariant-drift`는 gitignore된 벤치 로그(`dd6-live-exp2`)의 `benchCandidate` 토큰으로 exit 1 — 내 변경 파일 무관(확인 완료).

## 1. 무엇이 착지했나 (Stage 0, owner 확정 스코프)

owner 2결정(2026-07-20): **기존 census만**(신규 fs 스캔 0) + **아티팩트+artifactRefs만**(final-output 섹션 없음).

- **순수 모듈** `src/core-runtime/reconstruct/environment-context-profile.ts`
  — 닫힌 rule 카탈로그(basename/extension/import → language·framework·package_manager·infrastructure·runtime),
    detection 키 `(category, canonical_name, scope_id)` 병합으로 **M3 상관증거 dedup 구조보장**,
    confidence `certain|likely|weak`(framework는 extension 단독 금지), **경로-배제 scope 토큰**
    (`root`=진짜 타겟루트 / `package:N`=deeper 패키지루트), conflict 보존(polyglot≠conflict),
    fingerprint = ruleset_version + **catalog_digest**(카탈로그 편집 시 구조적 회전) + walk-bounds +
    입력 스냅샷 fold. **fs/LLM 접근 0**(순수).
- **아티팩트 타입** `ReconstructEnvironmentContextProfileArtifact` (artifact-types.ts) + **record 키**
  `environment_context_profile`(ReconstructRecordArtifactRefs + `RECORD_ARTIFACT_KEYS` + artifactRefsWithDefaults).
- **config 키** `environment_context_profile`(settings-chain `RECONSTRUCT_EXECUTION_SCALAR_KEYS`,
  default OFF, **코드 opt-in과 독립** — reconstruct-api에서 직접 read → `params.environmentContextProfile`).
- **훅** runReconstruct set-tier sibling(~17050): `projectEnvironmentContextProfileInput`(순수 추출 —
  per_ref census + observation structural_data → 모듈 입력, 절대경로→deepest-common-dir 상대화)
  → `comprehension/environment-context-profile.yaml` write → artifactRef 4 터미널 사이트 배선.
  **setter 미배선 = seed userPayload 미접촉**(M2).
- **M2 경계 가드** `assertSeedUserPayloadBoundary` + `SEED_USER_PAYLOAD_ALLOWED_KEYS`(run.ts ~2200):
  양 seed dispatch 표면(primary + minimal-kernel timeout-recovery) 래핑, 프로파일 배제 회귀가드.
- **단일-소싱**: `TARGET_MATERIAL_WALK_MAX_ENTRIES/_DEPTH`(target-material-kind.ts) — census bounds 정직 공시.

## 2. 교차검증에서 잡힌 것 (전부 수정됨)

**이종 3렌즈**(경계·누출 / 런타임정합·배선 / 설계충실도) → **BLOCKER 1 + MEDIUM 3 + LOW.** cross-kind
다양성이 결정적: 같은-kind 2렌즈가 놓친 BLOCKER를 다른-kind(런타임) 렌즈가 적발.

- **BLOCKER**: `record.ts`의 손유지 리스트 `RECORD_ARTIFACT_KEYS`(normalizeRefs가 순회)에 신규 키
  누락 → persisted record에서 ref **침묵 드롭**(`satisfies`는 membership만 검사, exhaustiveness 미검 =
  W3-001 클래스; leaf_read_census 전례). → 키 추가 + **컴파일타임 exhaustiveness 가드**(`_MissingRecord
  ArtifactKeys`)로 **클래스 종결**. 가드가 **기존 잠재드롭 3건**(`maturation_value_discharge{,_validation,
  _census}` — write+consume되나 record에서 드롭 중) 적발 → 함께 수정.
- **MEDIUM**: ①census 정직성 — unreliable `census_capped` boolean(depth cut 못 봄·multi-ref false-pos)
  → **구조적 walk-bound 공시**(`census_bounds`: max_entries/max_depth/dotdirs/vendored 제외). ②kernel
  fallback seed 표면 assert 누락 → 래핑(+`timeout_recovery` allowed). ③rootless-monorepo anchor 오라벨
  (root manifest 없으면 첫 package가 "root" 찬탈) → "root"=진짜 타겟루트 전용으로 재작성.
- 추가 수정: imports_available를 **데이터 파생**(inventory imports 필드 존재)으로 — flag 의존 제거(직접
  호출자 robust); observation_id dead input 제거; hollow fingerprint 테스트 → fixed-input 스냅샷.

**delta 재검증(1렌즈, mutation+cmp byte-identical+별프로세스 결정론 control)**: 5 fix 전건 CORRECT·
blocker 0·regression 0. LOW 3(sibling 정합 symbol_tiles hop / resume 토글 엣지 / node_modules doc)
= 조치 불요 또는 doc 반영(vendored_dirs_excluded 추가).

## 3. 다음 단계 (우선순위)

1. **커밋 / PR** — 현재 미커밋. main이므로 브랜치 먼저(예: `feat/env-context-profile-stage0`).
   변경 파일: `environment-context-profile.ts`(+2 테스트)·`record.ts`·`run.ts`·`artifact-types.ts`·
   `settings-chain.ts`·`reconstruct-api.ts`·`target-material-kind.ts`·`record.test.ts`·IMPLEMENTATION_MAP.html.
2. **live 검증 → 승격** — repo settings에 키 ON 후 실 reconstruct run으로 프로파일 아티팩트 품질 확인
   (set-tier·인벤토리 선례 패턴). owner가 결과 보고 승격 결정.
3. **Stage 3 후속**(설계에 스코프됨): content_parse(정적-only·config 실행 금지·실패 taxonomy·새 fs-read
   권한)·유계 LLM assist(침묵/충돌 시만·닫힌 candidate 어휘·confidence≤likely)·`.github/workflows`
   known-signal 스캔(dotdir 커버)·attention seat(파일별 excerpt 예산 신규 손잡이 필요)·검증/보강 fold
   (flags-first, onto review 재사용).

## 4. 열린 노트 (Stage 3 설계 시 참조)

- 상관증거 dedup은 현재 **데이터 규율**(correlation_group) — Stage 3에서 manifest-content 방출이 새
  cross-method 상관쌍을 추가하면 같은 group 공유를 강제하는 lint 없음(미공유 시 M3 실패 재발 가능).
- `imports_available`는 whole-run OR — resume+캡처토글 엣지에서 per-file 진실을 coarsen(허용됨).
- 문서 SSOT: `design/20260720-env-context-profile-crossverify-synthesis.md` §0 + design-verify-findings.
