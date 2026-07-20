# 환경 컨텍스트 프로파일 설계 — 적대적 grounding 검증 리포트 (claude opus-4-8 frontier, repo-aware)

**검증 기준**: HEAD `e150589`. 대상: `src/core-runtime/reconstruct/run.ts` 외. 파일 수정 없음(검증 전용).

## 판정 요약

| # | 주장 | 판정 | severity |
|---|---|---|---|
| 1 | attention seat 재정렬이 절단 전 소비되어 살아남는 excerpt를 바꾼다 | **REFUTED** | MATERIAL |
| 2 | repo-수준 신호(imports·topology·material-kind)가 공존하는 hook 지점 실재 | **CONFIRMED** | — (caveat) |
| 3 | reconstruct 결과 경로에 disclosure 채널(structuredContent.disclosures/llmPresentation) 실재 | **PARTIAL** | MINOR |
| 4 | onto review가 완성 seed를 검증 대상으로 받는 재사용 실현가능 | **PARTIAL** | MINOR |
| 5 | 생성-중 프로파일이 seed userPayload로 유입될 위험 경로 존재 | **PARTIAL(잠재)** | MATERIAL |

## Claim 1 — attention seat: REFUTED (MATERIAL)

설계의 최대 위험(양 draft 독립 수렴)이 틀린 인과 모델 위에 서 있다.

근거(실코드):
- `selectedObservationIds` (run.ts:10487-10497): `directive.selected_observations`의 id를 dedup만 반환. 랭킹 없음. candidate 호출은 run.ts:12484.
- candidate projection (run.ts:12512-12518): `projectObservationsForPrompt(sourceObservations, { observationIds: requiredCoverageObservationIds, contentExcerptCharLimit: PROMPT_OBSERVATION_EXCERPT_LIMIT, expandSingleDocumentExcerpt: true, ... })`. `includeStructuralData` 미전달 → 기본값 `!== false` = true (run.ts:10185). 원문 읽기·excerpt 1200(run.ts:10012) 확인. 이 seat이 원문을 읽는다는 sub-fact는 CONFIRMED.
- `observationPromptPayload` (run.ts:10153): 필터는 `[...new Set(options.observationIds)].map(id => byId.get(id)).filter(...)` (10162-10166) — 출력 배열 순서 = observationIds 순서. 방출은 `observations.map(...)` (10176-10284) — 선택된 모든 관찰을 방출, 배열-레벨 cut·N-limit·slice 전무. 절단은 `compactStructuralDataForPrompt` 내부 `excerpt.slice(0, limit)` (10137-10144) — 관찰별 excerpt char cap, 순서 무관. 배열-내 유일 `.slice`는 `MAX_PROVISIONAL_LABELS_PER_OBSERVATION = 64` (10251/10270/10276) — 관찰-내부, 순서 무관.
- 관찰을 drop하는 유일한 N-limit `.slice(0, ONTOLOGY_SEED_OBSERVATION_LIMIT=160)`은 `ontologySeedObservationIds`(run.ts:7591)·`observedSourceRefsForObservationIds`(run.ts:7625)에만 존재 — 둘 다 writeOntologySeed 전용이고 그 projection은 `includeStructuralData: false`(run.ts:12773).

결론: 설계가 고른 seat(12484 candidate)에는 관찰-drop 절단이 없으므로 재정렬은 항상 "배열 위치만 바꾸는" 연산이다. 관찰-drop N-limit(slice 160)이 있는 seat(7591)은 원문을 안 읽는다. 원문-읽기와 survival-절단이 서로 다른 seat에 있어 "재정렬→절단→생존 변화" 사슬은 어느 seat에서도 성립하지 않는다. 검증 규율("절단 유발 fixture로만 검증")은 엉뚱한 신호를 겨냥한다(재정렬 시 각 excerpt byte-identical, 위치만 이동). 재정렬의 유일 실효과 = 프롬프트 내 배열 순서 = LLM primacy/순서 민감도(약·비결정), 설계가 회피하려던 vacuous 신호.

심화(B-1): 같은 candidate 프롬프트가 재정렬된 `source_observations`(12512)와 재정렬 안 된 `selected_observations: input.sourceObservationDirective.selected_observations`(run.ts:12506)를 동시에 실어보낸다.

## Claim 2 — repo-수준 신호 공존 지점: CONFIRMED

프로파일 계산 훅을 꽂을 실제 공존 지점이 runReconstruct에 실재하며 새 순회를 강제하지 않는다. run.ts 17000-17064:
- set-tier topology: `if (params.codeSetTier === true)`(17001) 하에서 `sourceObservations.observations` 순회(17004)로 `assembleCodeSetTier`(17024).
- observer imports census: 각 관찰의 `structural_data.code_structure_inventory`를 읽음(17006-17012).
- target-material-kind census: `targetMaterialProfile`가 이 스코프에서 가용(17044). dirent walk = `detectTargetMaterialRefs`/`detectTargetMaterialKind`(target-material-kind.ts:305/312, maxEntries 200·maxDepth 3).

세 신호원이 동일 스코프에 공존 → set-tier 블록(17001-17033)을 미러링해 프로파일 훅 배선 가능. 새 순회 불필요.

Caveat(블로커 아님): A/B/C 매니페스트 내용 신호는 현 파이프라인이 config를 6000자 excerpt로만 캡처하므로 신뢰 파싱엔 allowlist 재읽기(Stage 3) 필요 = 캡처 예산 밖 새 fs-read 권한(symlink/root-escape 의무). "known-signal census 확장"도 walk의 bounded 확장 필요.

## Claim 3 — disclosure 채널: PARTIAL (MINOR)

명명된 채널은 reconstruct에 없다. 동등 surface는 실재.
- `ReconstructSessionResult`(reconstruct-api.ts:257) = `{ finalOutputPath, finalOutputText, reconstructRunManifestPath, reconstructRunManifest }`. `getRunResult`(1816-1838)에 `llmPresentation`·`disclosures`·`structuredContent` 없음.
- `llmPresentation`/`disclosures`는 review 전용(review-api.ts:164, server.ts 885/915).
- 동등 surface 2종: (i) `artifactRefs: reconstructRecord.artifact_refs`(reconstruct-api.ts:1803) — 신규 프로파일 아티팩트를 write하면 참조 노출. (ii) `finalOutputText`(final-output.md) — `writeFinalOutput`(run.ts:624)+`final-output-sections.ts`(run.ts:1287). final_output은 post-seed projection(run.ts:5292/5295)이라 seed 미접촉 disclosure 섹션 주입이 구조적으로 안전.

## Claim 4 — flags-first(review 재사용): PARTIAL (MINOR)

입력 계약 수준 재사용은 실현가능, "seed를 구조로 검증"하는 의미(렌즈)는 미구축(설계가 후속으로 올바르게 스코프).
- review 타깃 계약: `target: z.string().min(1)`(tool-schemas.ts:24), `targetRefs: z.array(...).min(1)`(tool-schemas.ts:124) — 임의 string ref 배열.
- review는 refs를 `detectTargetMaterialKind`(materializers.ts:67) 후 `buildReviewTargetProfileArtifact`(materializers.ts:1354)로 조립. 완성 seed는 `.yaml ∈ CODE_EXTENSIONS`(target-material-kind.ts:50)라 inspectable material로 기계적 수용 가능.
- 단 review는 타깃을 일반 렌즈로 검사할 뿐 "seed-대-source 구조검증 의미"는 신규 렌즈/역할 필요. synthesis §0이 flags-first를 "후속 방향(기록)"으로만 표기 → 과대주장 아님.

## Claim 5 — 경계 누출: PARTIAL/잠재 (MATERIAL)

누출 경로가 실재하고 idiomatic. 구조적 격리는 가능하나 규율에 의존하며 역량-표면 방벽이 아님.
- seed 프롬프트(writeOntologySeed userPayload, run.ts:12727-12799)는 이미 구조 신호를 closure 변수로 fold: `code_set_tier`(12756), `semantic_map`(12751), `target_material_profile`(12729).
- idiom: closure 변수(`codeSetTierOverview`, 11638) → setter(`setCodeSetTierOverview`, 11692) → runReconstruct에서 명시 opt-in wire(17030-17032).
- 프로파일을 seed에 유입시키려면 `setEnvironmentProfile` setter + closure 변수 + `...(profile ? { environment_profile: profile } : {})` 한 줄이면 충분. "seed 미접촉"은 "setter를 배선하지 않는다"는 규율이지 타입·스코프 강제 방벽이 아님. MATERIAL.
- 격리 실현가능: 프로파일을 runReconstruct 스코프(17001류)에서 계산해 아티팩트+final-output 섹션으로만 내보내고 setter 호출을 생략하면 seed closure에 절대 진입 안 함. 권고: 역량-표면 방벽(seed userPayload 키 닫힌집합 assert·environment_profile 배제, 또는 프로파일 타입을 seed-payload 빌더 스코프에서 import 불가 격리).

## 놓친 feasibility 블로커

- B-1 (MATERIAL, Claim 1 심화): candidate 프롬프트가 재정렬 `source_observations`(12512)와 비재정렬 `selected_observations`(12506) 동시 노출 → 순서 신호 희석.
- B-2 (조건부 MINOR): set-tier는 `codeSetTierAggregateFingerprint`를 `authoredArtifactReuseMatch`에 fold(17064). 신규 프로파일 아티팩트가 어떤 프롬프트에라도 영향 주는 순간 그 fingerprint+ruleset_version을 reuse-key(17040-17065)에 배선 필수. 현 disclosure-only에선 moot, F 후속 fold 시 필수.
- B-3 (MINOR-MATERIAL): Stage-3 content 재읽기 = 캡처 예산(6000자) 밖 새 fs-read 권한 → path-safety/symlink/root-escape 의무를 새 사이트에 부과.

## 결론

- Claim 1 = 설계 최대 결함(MATERIAL): 채택 seat(candidate 12484)에서 재정렬은 "어떤 excerpt가 살아남는지"를 바꾸지 못함. 두 draft "고신뢰 수렴" 위험 프레이밍이 인과 오진, 처방 검증(절단 fixture)은 무효 신호 겨냥.
- Claim 2 CONFIRMED: 훅 공존 지점(runReconstruct ~17000) 실재, 새 순회 불필요.
- Claim 3·4 PARTIAL(MINOR): 의도는 실현가능하나 명명 개념이 실코드와 불일치(final-output-sections/artifactRefs·신규 렌즈로 교정).
- Claim 5 PARTIAL/잠재(MATERIAL): seed 미접촉 경계가 idiomatic 한-줄 배선으로 깨질 수 있고 방벽은 규율뿐 — 역량-표면 강제 필요.

핵심 앵커: run.ts 10153·10162-10166·10176·10137-10144·10185·10487-10497·12484·12506·12512·7591·7625·12773·17001-17033·17064·12729/12751/12756·11638/11692. reconstruct-api.ts:257·1816-1838·1803. tool-schemas.ts:24·124. review/materializers.ts:1354. target-material-kind.ts:50·305·312.
