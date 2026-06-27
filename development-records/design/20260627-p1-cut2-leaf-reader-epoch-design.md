# design — P1-C2(첫 LLM cut): leaf-reader(저신뢰 라벨 1개) + 2-tier 에포크/`llm_touch_fingerprint` 실배선

> 상태: DRAFT (2026-06-27). 브랜치 `feat/comprehension-cut2-de-risk`. HEAD `3dc1813`.
> ⚠️ **이건 "엔진 전체" 설계가 아니다.** P1-C1이 깐 결정론 substrate(value-tile·ComprehensionArtifact 결정론판) 위에 **LLM이 한 leaf를 *resume-sound하게* 읽는** 가장 작은 cut. 의미 triage·재귀 reduce는 **다음 cut**.
> SSOT = `20260625-rescoped-comprehension-engine-design.md`(§3.2 leaf·§4.1/§4.4 2-tier 에포크·§5.4 honesty fold·§5.7 ComprehensionArtifact). 토대 = `20260627-p1-cut1-deterministic-sidecar-design.md`(§12 T1~T8).
> 프로세스: 이 설계 → **owner 검토** → **ultracode + onto 교차검증**(resume 계약 변경 = 비협상·[[design-validation-ultracode-onto]]) → 승인 후 **mock/fixture LLM 우선** 빌드(월 한도·[[effort-calibration-track]]).
> 메모리: [[unified-comprehension-engine-track]] · [[domain-agnostic-no-static-enums]] · [[design-validation-ultracode-onto]] · [[dep-discovery-design-gate]] · [[explain-decisions-plainly]](owner=plain outcome-framed).

---

## 0. 한 줄 — 무엇을 배선하고, 무엇을 입증하나 (plain)

P1-C1은 "이 컬럼은 어느 행에서 포맷이 바뀐다"(결정론 경계)를 reconstruct에 처음 연결했다 — 그러나 **LLM은 한 번도 안 닿았다**(순수 결정론 sidecar). 그래서 *비정형(저신뢰 헤더) 영역*은 여전히 "어느 행이 라벨인가"를 못 읽는다 — 그건 결정론이 아니라 **독해**다(§3.2: "어느 행이 헤더인가"=읽기 질문).

**P1-C2 첫 cut = 그 저신뢰 영역 *하나*를 LLM이 읽어 *잠정 라벨*을 달되, 그 LLM-touch를 *재개에 안전*하게 만드는 배관까지 한 묶음으로 굳히는 것.** "엔진"이 아니라 "LLM이 한 leaf를 resume-sound하게 읽는다".

- **바뀌는 것**: `header_confidence:"low"`인 영역에 대해 LLM이 **잠정 라벨**(low-confidence·is_lower_bound 정직 태그)을 읽고, 그게 ComprehensionArtifact의 `spine_claims`를 `producer_kind='llm'`로 채운다 — **T4 validator의 "llm producer는 not_applicable 금지" 경로가 production서 *처음* 발화**.
- **resume**: leaf-read는 첫 **Layer 2**(LLM 닿음) 산출물 → 키가 `content_sha256+adapter_version`만으론 부족(모델/프롬프트 바뀌면 옛 라벨 silent 재사용). → **`llm_touch_fingerprint`(staged·non-circular) 실배선** + **non-circular-key validator** + model-identity-rotation 테스트.
- **비용**: leaf-read 1콜 — 단 ⚠️ **월 한도** 때문에 빌드/검증은 **mock/fixture LLM 우선**, 실 LLM 의미 측정은 한도 회복 후(P1-C1 정직 갭 계승).
- **입증(done-when)**: ① 저신뢰 영역 leaf-read가 잠정 라벨을 정직 태그와 함께 산출(graceful degrade — 모르는 라벨 가식 0) ② 그 LLM-touch가 `llm_touch_fingerprint`로 키잉돼 model/prompt 회전 시 옛 산출 fail-closed ③ non-circular-key validator가 *출력ⓒ가 게이팅 키에 누설 0*을 강제 ④ ComprehensionArtifact가 `producer_kind='llm'`로 산출되고 completeness validator pass(leaf-read 필드 PRESENT·미착수 엔진필드는 명시 `deferred`) — **전부 mock/fixture LLM로 wiring/계약/resume 입증, 실 LLM 의미품질은 *측정 미수행*(정직 갭)**.

**왜 leaf-read와 에포크가 *한 cut*인가**: leaf-read를 *resume-sound*하게 만드는 것이 곧 `llm_touch_fingerprint`다 — 둘은 분리 불가(LLM touch 없으면 fingerprint 무의미, fingerprint 없으면 leaf-read는 silent-stale 재사용). Cut-4a가 *reference impl*로만 입증한 staged non-circular fingerprint를 **처음으로 실 배선**한다.

---

## 1. 범위 절단 (in vs deferred)

| | 이 cut(P1-C2-A) | 다음 cut으로 이연 |
|---|---|---|
| LLM 엔진 | **leaf-reader 1종**: 저신뢰 헤더영역 잠정-라벨 독해(§3.2). 위치앵커(결정론)+value-tile(P1-C1)+잠정 라벨(LLM·정직 태그) | **의미 triage**(§3.4 깊이 배분·Cut-2b)·**재귀 reduce**(§3.3/§5 monoid)·고신뢰 label-complete LLM 보강 |
| resume | **`llm_touch_fingerprint` 실배선**(§4.1 staged ⓐⓑ→digest·ⓒ 키 제외) + **non-circular-key validator**(§4.4) + model-identity-rotation | triage-policy-rotation(triage 도입과 동반)·vision geometry·deep-mode·equivalence pre-image(§5.1) |
| 계약 | ComprehensionArtifact **`producer_kind='llm'` 실현**: `spine_claims`·`confidence_by_claim`·`is_lower_bound_by_claim`·`limiting_witness` PRESENT(leaf-read); 미착수 엔진필드(`semantic_depth`·triage_audit 등) = 명시 **`deferred`**(not_applicable 아님) | facet registry·spine→소비자 projection 충분도 실측(Cut-4b 잔여) |
| dependency-discovery | ❌(이 cut = *closure 주어졌을 때* fail-closed까지 = Cut-4a 수준). 새 LLM-touch dep(leaf 프롬프트·모델)을 fingerprint가 덮음을 *명시 등록* | **자동 열거 메커니즘** = §11 빌드스펙(redesign-narrow·[[dep-discovery-design-gate]]) |
| 소비자 | **reconstruct** authoring(주). 저신뢰 영역 잠정 라벨이 authoring 프롬프트에 도달 | 실 review lens 소비·deliberation projection |
| LLM 검증 | **mock/fixture LLM 우선**(월 한도) — wiring·계약·resume·fail-closed 입증. 실 LLM = 측정 미수행(정직 갭) | 실 LLM 의미품질 측정(한도 회복 후) |

**핵심 단순화**: 이 cut은 **leaf-read 1종만 Layer 2**. triage/reduce/vision은 미도입이라 fingerprint ⓑ의 해당 슬롯은 *부재=정상*(Cut-4a §7.5 패턴). 단 fingerprint **구조는 미래 슬롯을 예약**(slot 추가가 회전이지 키-로직 재작성 아님).

---

## 2. leaf-reader 설계 (§3.2 — 저신뢰 라벨 1종)

### 2.1 무엇이 갭인가 (현 코드 grounding)
- `header_confidence`는 observer가 이미 결정론으로 산출(`spreadsheet-structure-observer.ts`). **고신뢰**(`"high"`)는 explorer-D pre-pass가 라벨 구조를 결정론으로 잡아 label-complete.
- **저신뢰**(`"low"` = 비정형 실파일 = P0.5 난제)는 "어느 행이 헤더인가"가 *독해 질문*이라 결정론이 비워둔다 → leaf가 위치앵커+값사실만 갖고 **라벨이 빈다**. P1-C1 결정론판은 이 영역에 `spine_claims=not_applicable`(LLM 0).
- **국소화는 이미 견고**(P1-C1 value-tile·R8): 라벨 불확실해도 "A5501에서 포맷 변화"는 잡힘. **degrade는 라벨 *naming/의미역*뿐**(§3.2) — 이 cut이 그 naming을 LLM 잠정 독해로 채운다.

### 2.2 leaf-read 산출 (홀로 해석 가능·정직 degrade)
저신뢰 영역마다 leaf-reader는 **bounded 결정론 증거**(P1-C1 value-tile·인벤토리: 세그먼트 시그니처·경계 witness·헤더후보 행·dimensions) 위에서 LLM에 **잠정 라벨**을 요청 → 산출:
- `tentative_labels`: 컬럼별 잠정 라벨 텍스트(LLM). **항상 `is_lower_bound:true`·`confidence:"low"` 태그**(저신뢰 영역이므로 — graceful degrade, 가식 0).
- `localization_anchor`: 결정론 value-tile witness(라벨과 *독립* — R8 ground). 라벨이 틀려도 위치는 견딘다.
- `limiting_witness`: 어느 leaf/영역이 confidence를 끌어내렸나(§5.4; 단일-leaf라 leaf 자신).
- **`unread_marking`**: 라벨을 못 읽은 컬럼은 **명시 미독**(`{status:"unread", reason}`) — silent drop 0(§0 "충실한 읽기"·onto issue-002).

**입력 = bounded·aggregate-only**(P1-C1 §3.4 honesty 계약 상속): leaf-reader는 raw 셀값/리터럴 formatCode를 *받지 않음*(source-safety). value-tile sanitized 시그니처 + 헤더후보 행범위만. → 새 source-safety 표면 0(§7 게이트).

### 2.3 graceful degrade · 비-권위 (over-trust 차단)
- 잠정 라벨은 **non-authoritative**(§3.2): 소비자는 "low-confidence 잠정 읽기"를 "검증된 라벨"로 over-trust 금지. ComprehensionArtifact `confidence_by_claim`·`is_lower_bound_by_claim`가 1급 필드로 그 비-권위를 운반.
- **상관 오염 완화**(§3.2 위험): cross-sheet 상관·merge는 잠정 라벨이 아니라 **결정론 키**(value-signature tile·`cross_sheet_key_overlap`)에 ground — 이 cut은 라벨을 *상관에 안 먹임*(reduce 미도입이라 자연 충족).

---

## 3. 2-tier 에포크 / `llm_touch_fingerprint` 실배선 (§4.1/§4.4 — ★resume 계약 변경)

### 3.1 왜 P1-C1 키로 부족한가 (Layer-1 → Layer-2 경계 첫 횡단)
P1-C1 키(`sourceObservationsReuseSha256`)는 **전부 Layer 1**(content_sha256+adapter_version+value_tile_config+data_layer_caps+comprehension_artifact_contract — 전부 LLM-0). leaf-read는 **첫 LLM-touch 산출물** → 모델/프롬프트가 바뀌면 같은 입력도 라벨이 달라질 수 있어 **옛 라벨 재사용은 unsound**. content_sha256(raw byte)·adapter_version(schema shape)은 그 변화에 *눈먼다* → silent-stale(CG-2/DET-1 부류 재발). → leaf-read는 **Layer 2** 키(`llm_touch_fingerprint`)로 키잉돼야 한다(§4.1 정의: "입력 사슬에 LLM이 한 번이라도 닿나?").

### 3.2 `llm_touch_fingerprint` (staged·non-circular — Cut-4a reference impl → 실배선)
게이팅 digest = **ⓐ + ⓑ만**(실행-*전* 알려진 입력); 출력ⓒ는 *타입상* 키에 도달 불가(Cut-4a가 by-construction 증명한 비순환을 실 배선이 보존):
- **ⓐ Layer1 결정론 pre-image**: 그 영역의 `content_sha256 + adapter_version + value_tile_config + data_layer_caps`(= P1-C1 Layer-1 키 재사용·LLM 0).
- **ⓑ 실행-전 LLM-touch pre-image** *(게이팅 키 = ⓐ+ⓑ)*: `leaf-reader 모델 지문(provider/model_id/route_identity) + leaf 프롬프트 해시(authoring-prompt 카탈로그 경유·CG-1 패턴) + schema/tool 버전 + comprehension-version(수동 무효화 노브)`. **triage policy·vision geometry·deep-mode·equivalence는 이 cut서 미도입 = 슬롯 부재**(미래 cut서 추가=회전; 키-로직 재작성 아님).
- **ⓒ 에포크-내 LLM 출력** *(키 아님)*: leaf-read 라벨·confidence·미독 마킹 → **게이팅 키에서 제외**(넣으면 출력이 자기 생성을 게이팅=순환). provenance manifest(§4.4)에만 기록.

**비순환을 타입으로 강제**(Cut-4a §7.5): `llmTouchFingerprint(args: {ⓐ, ⓑ})`의 *입력 타입에 ⓒ 슬롯이 없음* → ⓒ는 키에 도달 불가(컴파일-타임). 실 배선은 이 함수를 *그대로* 호출해 ⓒ를 절대 안 넘김.

### 3.3 영속 + 재사용 = 기존 reuse-provenance 기계 재사용 (신규 에포크 메커니즘 0)
> ⚠️ **§11 게이트 retract**: 아래 "신규 resume 로직 0"·임베드 위치는 *최대 과신*으로 판정(양 패밀리). 정확본 = **§11 R1/R2**(leaf-read=별도 Layer-2 authored 아티팩트·임베드는 결정론-only 유지·fingerprint는 `authoredArtifactReuseMatch`에만 fold·인스턴스 절대 미fold). 원문은 추적용 보존.
> 개념경제: 새 "에포크 저널" 영속 메커니즘을 발명하지 *않는다*. 기존 `writeFreshAuthoredYamlDocument`(run.ts:1342) + `authoredArtifactReuseMatch` + reuse-provenance(`reuse_match_hash` 불일치 시 THROW)가 이미 "LLM 산출물 영속 + reuse 키 fail-closed"를 처리 → leaf-read를 **그 패턴의 새 authored 산출물**로 영속하고, **reuse_match에 `llm_touch_fingerprint`를 fold**.

- leaf-read 산출물 = 작은 authored 아티팩트(`writeFreshAuthoredYamlDocument` 경유, reuse_match = `llm_touch_fingerprint`). → `assertCurrentReuseProvenance` + `reuse_match_hash` 불일치 THROW가 **fingerprint 회전 시 옛 라벨 fail-closed**를 *기존 코드로* 보장. **신규 resume 로직 0**.
- **하류 seed 회전**: comprehension 아티팩트를 소비하는 authored seed가 옛 leaf-read로 작성됐으면 재개 시 stale이어야 → leaf-read fingerprint(또는 그 sha)를 **`authoredArtifactReuseMatch`에 fold**(P1-C1 T2 `comprehension_artifact_contract` fold 미러). = "옛 leaf-read로 authored된 seed 재개=fail-closed".

### 3.4 §4.4 결정성 테스트 (이 cut 범위 — mock/fixture LLM로 입증)
| 테스트 | 이 cut서 입증 |
|---|---|
| **non-circular-key** | 게이팅 fingerprint ∩ ⓒ(라벨·confidence·미독) = ∅ — 정적 검사(타입 + 런타임 구조 단언). ⓒ 누설 시 fail-closed. |
| **model-identity-rotation (DET-1)** | leaf-reader `model_id` 단독 변경(content·comprehension-version 불변) → fingerprint 회전 → 옛 leaf-read 재사용 0(THROW). **수동 bump 없이 stale 차단**(mock 모델 A→B). |
| **leaf-prompt-rotation (CG-1 패턴)** | leaf 프롬프트 카탈로그 편집 → fingerprint 회전(프롬프트 해시 fold). |
| **layer1-cross-epoch-reuse** | comprehension-version만 변경 → ⓐ Layer1(결정론 관측·value-tile) **재사용**(불변), Layer2 leaf-read만 재계산. |
| **llm-touch-validator(구조 게이트)** | leaf-read 산출물의 입력 closure가 LLM 콜 포함 → *반드시* fingerprint 아래(Layer 1 오배치 시 fail-closed). **+coverage**: 새 LLM-touch 입력(leaf 프롬프트·모델)이 fingerprint 구성에 *등록*됐는지 검사(누락 시 fail-closed). ⚠️ **이 cut = closure가 *주어졌을 때* fail-closed만**(자동 dep 열거 = 이연·§11). |
| **crash-resume(무변경)** | 동일 입력·동일 fingerprint → leaf-read 진행 저장물 재사용(비용 0). |

⚠️ **triage-policy-rotation·allocation-no-rotate는 이 cut 밖**(triage 미도입). fingerprint 구조는 그 슬롯을 *예약*(다음 cut 추가).

---

## 4. ComprehensionArtifact `producer_kind='llm'` 실현 (§5.7 — T4 첫 발화)

### 4.1 무엇이 바뀌나 (현 타입 grounding)
현 `comprehension-artifact.ts`: LLM-touch 필드 전부 `Baseline<never>`(= 부재만)·`buildDeterministicComprehensionArtifact`가 전부 `not_applicable`. T4 validator는 *이미* "llm producer는 LLM-touch 필드 not_applicable 금지"를 강제하나 **producer_kind='llm' 경로가 production서 한 번도 안 발화**. P1-C2가 그 경로를 *처음으로* 실현.

### 4.2 필드 (이 cut의 값 — PRESENT vs 명시 deferred)
저신뢰 영역의 leaf-read가 있으면 `provenance.producer_kind='llm'`:
- `spine_claims` → **PRESENT**: 잠정 라벨(structure/semantics slot — §3.3 spine; 단 reduce 미도입이라 *영역별 leaf claim*만, root fold 없음). `Baseline<never>`→실타입 확장.
- `confidence_by_claim` → **PRESENT**: claim별 confidence(저신뢰=low). `is_lower_bound_by_claim` → **PRESENT**: leaf-read는 is_lower_bound=true.
- `limiting_witness` → **PRESENT**: confidence를 끈 leaf/영역(단일-leaf라 leaf 자신).
- `semantic_depth`·`consumer_handoff_notes`·`relation_obligation_lifecycle_state`·`downstream_blocking_semantics`·`trigger_provenance`·`triage_audit_status` → **명시 `deferred`**(+lineage "triage·reduce engine = 다음 cut; 이 cut은 leaf 라벨 독해만"). **`not_applicable` 아님**(producer_kind='llm'서 not_applicable=T4 위반) — `deferred`는 모든 producer서 허용(현 validator 정합).
- `provenance.epoch_fingerprint_contribution` → **`llm_touch_fingerprint`** 값(현 null→실값; §4.4 manifest 기여).

**결정론 substrate 영역**(고신뢰·leaf-read 없음)은 P1-C1대로 `producer_kind='deterministic'`·LLM-touch=not_applicable 유지. → 한 워크북서 영역마다 producer_kind 다름(혼합) = 자연(영역-단위 아티팩트).

### 4.3 validator 영향 (T4 경로 첫 실측)
> ⚠️ **§11 게이트 retract**: "현 validator 무변경으로 충족"은 *불충분*으로 판정(양 패밀리 수렴·onto issue-001 high). T4는 리터럴 not_applicable만 금지·`deferred`는 무조건 통과 → 실패 leaf-read가 성공과 구분 불가. 정확본 = **§11 R4**(content↔attempt provenance 분리·required-PRESENT 가드·deferred_allowlist). §4.3 default "attempted=llm+all-deferred"도 retract.
- **현 validator 무변경으로 충족**: T4는 not_applicable만 금지(llm producer), `deferred`/`unknown`/PRESENT는 허용 → leaf-read 필드 PRESENT + 미착수필드 deferred = pass. **검증 = producer_kind='llm'서 leaf-read 필드를 not_applicable로 두면 *fail-closed***(T4 첫 production 발화 테스트).
- **graceful-degrade 정직**: leaf-read가 *전 컬럼 미독*(LLM 실패·예산)이면 → `spine_claims` = `deferred`(불가식)이되 `producer_kind`는 여전히... ⚠️ **경계 판정 필요**(§7 게이트 표적): leaf-read를 *시도했으나 0 산출*이면 producer_kind='llm'+전부 deferred인가, 'deterministic'+not_applicable인가. **default = 시도=llm·미독=deferred**(시도 사실을 honesty로 운반); 미시도=deterministic. ⚠️ 표시.

---

## 5. mock-realization 경계 (월 한도 — 검증 realization ≠ production 의미경로)

> [[effort-calibration-track]] 월 한도 → 실 LLM sweep 당분간 불가. `~/.claude-1/guides/mock-realization-boundary.md` 적용.

- **production 의미경로** = 실 leaf-reader(실 `LlmCallConfig`·`callJsonAuthor` 패턴 재사용). **이게 제품 완성**(mock-backed ≠ 완성).
- **검증 realization** = **fixture leaf-reader executor**(명시 realization 스위치 — 현 `ReconstructSemanticAuthorRealization="direct_call"` 패턴 미러로 mock 추가, 또는 별도 fixture executor). 고정 잠정 라벨 반환 → wiring/계약/resume/fail-closed 테스트가 결정론.
- **삭제 경계**: mock payload를 작은 fixture 모듈 1곳에 집중(함께 제거/교체 가능).
- **정직 갭(P1-C1 계승·명시)**: ① **실 LLM leaf-read 의미품질 = 측정 미수행**(mock는 wiring만 입증, "저신뢰 라벨을 *충실히* 읽는다"는 plausible-not-proven). ② resume·non-circular·T4·fail-closed는 mock로 *완전 입증 가능*(결정론 기계라 LLM 품질 무관). → **이 cut의 claim 범위 = 배관·계약·resume·정직-degrade 구조** (≠ 의미품질·≠ 충분도). Cut-4b 메타교훈: 가장 안전한 cut도 과신 — claim을 *구조*에 한정.

---

## 6. E2E (실 소비자 도달 — mock LLM)

- **입력**: 저신뢰 시트 포함 워크북(de-risk 4b 합성 2시트 `StatusRef` low-conf 또는 동급; 실 101MB는 세션 산출물·레포 밖).
- **흐름**: 워크북 → `observeSpreadsheetSource`(value-tile) → 저신뢰 영역 **fixture leaf-read**(producer_kind='llm') → ComprehensionArtifact(llm판)·validator pass → `projectInventoryForPrompt`(잠정 라벨 섹션·정직 태그) → reconstruct authoring 도달.
- **측정(done-when E2E·mock)**: ① 저신뢰 영역 잠정 라벨이 정직 태그(low-conf·is_lower_bound)와 함께 산출·미독 명시 ② fingerprint 회전(모델 A→B)→옛 leaf-read fail-closed ③ non-circular-key validator pass(ⓒ 누설 0) ④ ComprehensionArtifact producer_kind='llm'·completeness pass ⑤ 잠정 라벨 authoring 프롬프트 도달(정직 태그 보존).
- **측정하되 입증 아님(정직)**: 잠정 라벨이 authored 온톨로지를 *개선/unblock* 하는지 = **관측 outcome**(실 LLM 미측정). 배관·계약·도달·정직-degrade를 굳히지, *의미 충분도*를 주장 안 함.

---

## 7. 교차검증 표적 (ultracode + onto 입력 — 빌드 전 비협상 게이트)

> [[design-validation-ultracode-onto]] 두 패밀리 병행·독립 수렴. 메타교훈: **가장 안전해 보이는 cut도 과신** — ✅/low/0 단언을 적대적으로 친다.

1. **Layer 경계 진짜 횡단인가**: leaf-read가 *유일한* 새 LLM-touch인가? 결정론 필드가 leaf-read 출력에 *몰래* 의존(순환)하지 않나? (Cut-4a RC-2: upstream-LLM의 결정론 투영 fold는 합당[순환 아님]이나, *자기/동단계 ⓒ* fold는 순환.)
2. **fingerprint coverage = dependency-discovery 미해결 정직**: `llm_touch_fingerprint`가 leaf-read의 *모든* LLM-touch dep(model·프롬프트·schema)을 덮나? — Cut-4a §7.5 양 패밀리 수렴 open: validator는 *closure 주어졌을 때* fail-closed만, **closure 자동 열거는 이연**. 이 cut이 그 한계를 *과대 닫힘으로 읽히지* 않게(honesty).
3. **non-circular by construction 보존**: 타입이 정말 ⓒ 누설을 막나? 실 배선이 reference impl의 비순환을 *깨지* 않나?(Cut-4a는 reference impl만 증명·실 배선이 보존해야).
4. **T4 첫 발화 정합**: producer_kind='llm'+미착수필드 `deferred`가 honesty 약화 선례가 되지 않나? `deferred` 남발 위험 — leaf-read가 *실제로* 채워야 할 필드를 deferred로 빠뜨리지 않게 lineage 강제 충분한가? (§4.3 ⚠️ 미독=llm-deferred vs deterministic-na 경계 판정.)
5. **mock vs 실 LLM 정직 절단**: 이 cut이 "comprehension 의미품질 입증"으로 *과대 읽히지* 않게(§5 claim=구조 한정). 실 LLM 미측정이 어디까지 정직히 표기됐나?
6. **resume 회전 상호작용**: 기존 shipping 키(이미 `semantic_author_model_identity`·`judge_model_identity`·`authoring_prompt_contract_sha256` fold)와 새 comprehension fingerprint가 *충돌/중복* 없나? leaf-reader 모델이 authoring 모델과 *다를 때* 둘 다 독립 회전하나?
7. **국소화 견고성 보존**: 잠정 라벨이 틀려도 value-tile 국소화가 견디나? 잘못된 라벨이 merge/상관 오염 안 시키나(이 cut=reduce 미도입이라 자연 충족, 단 확인)?
8. **개념경제**: leaf-read 영속을 기존 reuse-provenance 기계 재사용이 *정말* 맞나(새 에포크 저널 발명 회피)? `spine_claims` 실타입 확장이 기존 개념과 중복 없나?

---

## 8. 빌드 순서 (승인·교차검증 후 — mock/fixture LLM 우선)

1. **fixture leaf-reader executor**(mock realization 스위치·삭제경계) → 고정 잠정 라벨 반환.
2. **`llmTouchFingerprint(ⓐ,ⓑ)`** 함수(타입상 ⓒ 슬롯 부재=비순환 by-construction) + **non-circular-key validator**(정적+런타임 구조 단언) → unit green(ⓒ 누설=fail-closed).
3. **leaf-read 영속**(`writeFreshAuthoredYamlDocument` reuse_match=fingerprint) + **하류 seed fold**(`authoredArtifactReuseMatch`) → resume 회귀(model A→B·프롬프트편집=fail-closed; comprehension-version만=Layer1 재사용).
4. **ComprehensionArtifact llm판**: `Baseline<never>`→실타입 확장(spine_claims 등) + producer_kind='llm' 빌더 + 미착수=deferred → T4 첫-발화 테스트(llm+not_applicable=fail-closed·deferred=pass).
5. **`projectInventoryForPrompt`** 잠정-라벨 섹션(reconstruct만·정직 태그·미독 명시·truncation 정직).
6. **E2E**(fixture LLM 워크북 1개·§6) + 측정 기록.
7. full vitest + 정적 게이트(ts-core·import-boundary·invariant-drift/change·INVARIANT-CHANGE 마커 필요 시) → 커밋.

각 스텝 = surgical·기존 style 준수·changed line이 전부 이 설계로 추적.

---

## 9. 이연 (P1-C2-A 밖·명시)

- **의미 triage**(§3.4 깊이 배분·Cut-2b safety path B 미실증) = 다음 cut(P1-C2-B). triage-policy-rotation 동반.
- **재귀 reduce**(§3.3/§5 monoid·grouping-invariance·honesty fold·synthesis COEXIST) = 그 다음 cut.
- **dependency-discovery 자동 열거** = §11 빌드스펙(이연·[[dep-discovery-design-gate]]).
- **고신뢰 영역 LLM 보강**(label-complete 위 의미 독해) = triage가 깊이 배분한 뒤.
- **실 LLM 의미품질 측정**(저신뢰 라벨 충실도) = 월 한도 회복 후.
- **vision-assist**(§4.3)·**equivalence pre-image**(§5.1)·**exact-membership post-pass**(§5.6) = 후속.
- **review E2E**(공유 producer 수혜 실측) = 별도 cut.

---

## 10. baked-in 제약 준수 (SSOT §2 대조 — ✅는 *가드 빌드 후*)

> ⚠️ P1-C1 메타교훈: ✅ 단언은 교차검증 전 과신일 수 있음. 아래는 *설계 의도*이지 입증 아님 — §7 게이트가 친다.

- **tenet 1**(구조≠깊이): leaf-read는 저신뢰 영역만(triage 미도입이라 깊이배분 없음·자연 충족) — 단 "어디에 leaf-read를 쓸지"=`header_confidence` 결정론 신호(구조 게이트 아닌 신호). ⚠️ §7-4 표적.
- **tenet 2**(재귀=윈도 부산물): 이 cut 재귀 0(단일 leaf·reduce 미도입). 게이트 위(에포크/저널)는 leaf-read 영속에 필요 → 2-tier 실배선. 
- **R1/R2**(결정성): `llm_touch_fingerprint` 실배선·non-circular·model-rotation. ⚠️ §7-1/2/3/6 표적(과신 금지).
- **R8**(merge 결정성): 이 cut reduce 미도입 — leaf-read는 *산출*만. 국소화는 결정론 키 ground(§2.3).
- **R9**(honesty fold): leaf-read is_lower_bound=true·confidence=low·limiting_witness 국소화(스칼라 collapse 0·단일 leaf).
- **onto issue-002**(정직): 잠정 라벨 non-authoritative·미독 명시·capped/deferred 1급. claim=구조 한정(§5).
- **§5.7 completeness**: producer_kind='llm'·PRESENT-or-deferred·fail-closed(T4 첫 발화).
- **비-목표 가드**: 북극성 통합 ❌·explorer-V ❌·synthesis REPLACE ❌·마스킹/redaction ❌·도메인 명명 enum ❌·전면 production ❌(저신뢰 leaf-read 1종만). 

---

**잔여 정직(가드 후에도)**: 실 LLM 의미품질 미측정(mock-first)·E2E 단일 워크북·dependency-discovery 자동열거 이연·triage/reduce 미도입·review 수혜 미입증. **owner 승인 후 교차검증 → 빌드** — ⚠️ 표시 결정(§4.3 미독 경계·§3.3 영속 위치)은 뒤집기 가능.

---

## 11. 교차검증 결과 (2026-06-27) — gate: **REVISE-BEFORE-BUILD** (thesis SOUND·placement slice 재절단)

> **두 패밀리 병행·독립 수렴**([[design-validation-ultracode-onto]]): **ultracode** workflow `wf_d9eae396-83c`(8 적대 표적→44 agent→**19 confirmed material**·synthesizer 구조필드 `verdict=redesign_narrow`·`headline_survives=true`·theme=`placement`[자유텍스트는 degenerate "test"/"a"라 폐기·구조필드만 채택]) + **onto** core-axis review `20260627-e8e95c1a`(codex_cli/gpt-5.5·6 lens·deliberation 완료·**5 material issue**=1 high·4 med + low/info).
> **종합 판정 = redesign_narrow**(thesis 생존: LLM이 한 leaf를 resume-sound하게·fingerprint **primitive sound** — onto issue-007이 *독립 확인* "core Layer-1→Layer-2 crossing·non-circular key 무결함 as written"). 단 **placement slice 재절단 + ~8 가드** 선결. **메타교훈 정확 재현**: 가장 안전해 보인 §3.3 "기존 기계 재사용·resume 로직 0"이 *최대 과신* — 임베드 위치가 그 주장과 자기모순이고, 그 모순이 곧 silent-stale 결함(P1-C1 §12와 동형).

### 수렴 지도
| 테마 | ultracode | onto | 강도 |
|---|---|---|---|
| **T4 honesty / deferred-loophole** (시도-but-0 leaf-read가 성공과 contract-구분 불가; `producer_kind='llm'`+all-deferred가 T4 통과 — deferred는 모든 producer 허용) | T4·T6 | **issue-001(high)**·003·004 | ★최강(양 패밀리 top) |
| **fingerprint coverage = dep-discovery 공허** ("+coverage 누락 fail-closed"가 완전 coverage로 오독 = {observed}⊆{folded} DET-DISC-1 패턴 재발) | T2 | issue-002·**006** | 수렴 |
| **spine_claims 명명/권위 과장** | T7 | issue-005 | 수렴(minor) |
| **★PLACEMENT / silent-stale** (leaf-read 출력 위치 모순; 임베드→run.ts:1173-1175 "instance=inventory-derived" 불변식 파괴→`sourceObservationsReuseSha256` 인스턴스 미fold→모델 회전 후 **silent-stale=CG-2/DET-1**) | **T1·T3·T6·T7 high·design_flaw** | issue-007=primitive 무결함(placement 미스캔) | ultracode 단독(코드-grounding) |

> **placement가 ultracode 단독인 이유(모순 아님)**: ultracode finder는 *실 코드를 읽으라* 지시받아(run.ts·materialize-preparation.ts) "설계가 출력 위치를 모순·미명세 → 코드레벨 silent-stale"을 잡음; onto는 설계 텍스트 위주라 primitive **내부 논리**(sound)만 확인. primitive는 sound하나 *그것을 감싼 실 reuse 키 배선*이 샘 = 인접 층. 양 패밀리가 **T4·coverage·naming은 독립 수렴**, placement는 code-grounding이 추가 포착 — 둘 다 빌드 전 닫아야.

각 정정 → **해소 결정**(default = minimal-viable·기존 기계 정합·repo 원칙). ⚠️ = owner 검토 시 뒤집기 가능.

### R1 — PLACEMENT: leaf-read = 별도 Layer-2 authored 아티팩트 (★핵심 재절단·high)
- **결함**(ultracode T1·T3·T6·T7 high): 설계가 leaf-read LLM 출력 위치를 **모순**(§3.3 "기존 기계 재사용" ↔ §4.2/§6 "임베드 comprehension_artifact에 producer_kind='llm'"). 임베드 경로는 `buildSpreadsheetSourceObservation`(materialize-preparation.ts:540/566)=**LLM-free 결정론**·plain `writeYamlDocument`(reuse-provenance 없음·매런 재도출)·reuse는 `sourceObservationsReuseSha256`가 계약 DESCRIPTOR만 fold(인스턴스 제외). LLM 출력을 그 임베드에 넣으면 불변식 파괴 → **모델 회전 후 silent-stale = done-when ②가 죽이겠다던 CG-2/DET-1**.
- **결정**: leaf-read = **별도 authored Layer-2 아티팩트**(자체 doc), `writeFreshAuthoredYamlDocument(reuseMatch=llm_touch_fingerprint)`로 영속, observation_id로 join. **임베드 ComprehensionArtifact는 결정론-only·LLM-free 유지**(P1-C1 불변식 무손상 → run.ts:1173-1175 주석 *그대로 참*). 프롬프트 투영은 그 별도 doc을 join해 읽음. + **재호출 차단 게이트**: 유효 fingerprinted 아티팩트 존재 시 materialize-preparation이 LLM 재콜 0(resume soundness). §3.3 "resume 로직 0" **retract** → "별도 authored 아티팩트 1종 신규 배선(기존 reuse-provenance *패턴* 재사용·새 키 payload=fingerprint)."

### R2 — seed 키가 fingerprint를 fold (인스턴스 절대 미fold·high·guard)
- **결함**(ultracode T1·standalone high): R1로 임베드가 결정론 유지되면 `sourceObservationsReuseSha256`는 무변경 OK. 단 하류 seed가 옛 leaf-read로 authored되면 stale이어야.
- **결정**: leaf-read **fingerprint(또는 그 sha)를 `authoredArtifactReuseMatch`에 NEW 필드로 fold**(T2 `comprehension_artifact_contract` fold 미러). **ⓒ-운반 인스턴스(spine_claims·confidence)는 `sourceObservationsReuseSha256`에 절대 미fold**(누설=순환). + 비-공허 회귀: leaf-read model/prompt 변경·content_sha256/adapter_version 불변 → seed reuse fail-closed.

### R3 — non-circular validator를 *실 seed 다이제스트*로 스코프 (guard)
- **결함**(ultracode T1·T3 medium): §4.4 "fingerprint ∩ ⓒ=∅"은 `llmTouchFingerprint` 함수만 — 실 누설면은 seed 키(`sourceObservationsReuseSha256`·`authoredArtifactReuseMatch`).
- **결정**: non-circular-key validator를 **모든 게이팅 다이제스트**로 스코프(정적+런타임 구조 단언): `sourceObservationsReuseSha256`·`authoredArtifactReuseMatch`가 ⓐ/ⓑ-class + fingerprint VALUE만 직렬화·ⓒ 필드(spine_claims·confidence·미독) 0.

### R4 — T4 불충분: content provenance ↔ attempt provenance 분리 (★high·양 패밀리 수렴)
- **결함**(ultracode T4·T6 / onto issue-001 high·003·004 med): T4는 리터럴 `not_applicable`만 금지 — `deferred`는 모든 producer 무조건 통과 → **`producer_kind='llm'`+9필드 전부 deferred(over-trust 가드 confidence/is_lower_bound 포함)도 valid** = done-when ④·§2.3/§5.4 모순. 실패한 leaf-read가 성공과 contract-구분 불가.
- **결정**(3-leg):
  - (a) **content ↔ attempt provenance 분리**: `producer_kind='llm'`=LLM **content 산출** 전용. 별도 **leaf-read attempt status**(`attempted`/`produced`/`unread`/`failed`) 신설. 0-산출/실패 = 명시 unread/failure state(§4.3 ⚠️ "attempted=llm+all-deferred" default **retract**).
  - (b) **producer-keyed required-PRESENT 가드**: `producer_kind='llm'` AND attempt=`produced`면 leaf-read 소유 필드{spine_claims·confidence_by_claim·(R5 leaf lower-bound)·limiting_witness} **PRESENT(또는 unknown+witness) 필수·never deferred/not_applicable**.
  - (c) **stage-scoped `deferred_field_allowlist`**(onto issue-003): 각 deferred 필드의 *왜 P1-C2-A 밖인가*·closure policy·소비자-blocking 기록; leaf-read 소유 필드가 allowlist 밖에서 deferred면 validator fail.

### R5 — `is_lower_bound_by_claim` 오배치 금지 (concept economy·authority)
- **결함**(ultracode T1 medium): 그 필드는 코드상 **결정론·caps-driven**(R9·comprehension-artifact.ts:67/88/264). §4.2가 leaf confidence로 재용도 = 결정론 필드에 LLM 출력 밀반입.
- **결정**: 결정론 `is_lower_bound_by_claim` **유지**(authority 불변). leaf 라벨의 lower-bound는 **llm-touch 필드**로(예: `confidence_by_claim` per-claim shape에 fold 또는 신규 llm-touch `tentative_label_*`).

### R6 — fingerprint coverage 정직: declared-closure-only 구조 인코딩 (양 패밀리 수렴)
- **결함**(ultracode T2 / onto issue-002·006 med): §3.4 "+coverage 누락 fail-closed"가 *완전 dep coverage*로 오독 = sibling dep-discovery 설계가 게이트 탈락한 **{observed}⊆{folded} 공허 패턴**(DET-DISC-1). + ⓑ closure 3 known 결손.
- **결정**:
  - (a) **구조 인코딩**: validator 산출 라벨 = `declared_llm_touch_dependency_closure`·`fingerprint_covers_declared_closure`·`dependency_discovery_realization: declared_closure_only`. **자동 발견 함의 pass 라벨 금지**(closure-given fail-closed만·§11 dep-discovery 이연 일관).
  - (b) **ⓑ precision**: `route_identity`는 일부 post-call → ⓑ엔 **pre-image projection{provider·model_id·execution_adapter·declared billing_mode}만**(reconstructAuthoringModelIdentity 미러), witnessed residue(effective_base_url·observed billing)는 별도 기록. `reasoning_effort`·leaf **repair-prompt**(callJsonAuthor 수선 경로) ⓑ에 포함.
  - (c) **LLM-touch surface inventory**(onto issue-002): call-site·layer·producer/consumer·realization·fingerprint authority·output-affecting config 기록 = build+verify 게이트.

### R7 — spine_claims 권위 명명 (minor concept economy)
- **결함**(ultracode T7 / onto issue-005 low): 저신뢰 잠정 라벨을 `spine_claims`에 넣으면 권위 과장.
- **결정**: 잠정 페이로드를 **provisional로 타입화**: `claim_kind='provisional_label_read'`·`authority='non_authoritative'`, 또는 `leaf_label_claims` 서브타입을 spine_claims로 projection.

### R8 — N-region fingerprint 집계 (granularity·guard)
- **결함**(ultracode T3·T6 med): N 저신뢰 영역 → N per-region fingerprint인데 §3.3은 단수 fold.
- **결정**: **순서무관 집계**(sorted {observation_id/region_id, fingerprint} 위 sha256)를 seed reuse-match 필드로. + 회전 테스트: 한 영역 leaf 모델만 회전 → 집계 seed 키 회전(partial-stale fail-closed). leaf-reader model-identity surfacing 함수 전용·silent `unspecified` 금지(fail-loud).

### R9 — MISSING 실패모드: 관측-시 LLM 하드 에러 (guard)
- **결함**(ultracode standalone med): `buildSpreadsheetSourceObservation`은 현재 LLM-무관 infallible — leaf-read가 network/timeout/budget/parse 실패를 materialize 경로에 도입.
- **결정**: leaf-read 하드실패 → **`producer_kind='deterministic'`로 degrade(abort 아님)**·per-column 'unread'와 구분되는 명시 honesty 마킹. + fixture: 관측-시 LLM 에러 주입 → 런 결정론 진행.

### R10 — mock 경계를 기존 INV-MOCK-1에 바인딩 (삭제경계 무분할)
- **결함**(ultracode T5 med): §5가 새 fixture executor 발명 제안 = 기존 삭제경계 분할·잘못된 개념 참조.
- **결정**: fixture leaf-reader를 **기존 INV-MOCK-1 모듈**(`callReconstructMockLlm`·`RECONSTRUCT_MOCK_AUTHOR_*`)에 바인딩(else throw에 leaf-read 분기 추가)·realization 태그 `"direct_call"` 불변. **회전 테스트는 production `LlmCallConfig`(provider/model_id via reconstructAuthoringModelIdentity)를 변이**(mock 상수 아님 = CG-2 contamination 차단).

### R11 — per-region producer_kind 재조정 (R1과 동반 해소)
- **결함**(ultracode T1 med): 코드는 **observation당 1 아티팩트**(region_identity=전 시트·단일 producer_kind). §4.2 "영역-단위·영역마다 producer_kind 다름"은 미존재 구조 가정.
- **결정**: R1로 자연 해소 — 결정론 임베드 아티팩트는 observation당 1 유지; 별도 leaf-read 아티팩트가 **per-region 잠정 라벨 claim**(R7 서브타입)을 담음(producer_kind 혼합을 한 임베드 객체에 강제 안 함).

### 보강 빌드 순서 (§8 대체·R 가드 포함) — ▶ 빌드 진행 상태 (2026-06-28)

> **✅ Steps A-C 완료 (모듈 레벨·mock 완전검증·회귀 0)**: ts-core clean · **full vitest 2018 pass**(baseline 1991 +27 신규·133 파일 회귀 0). 신규 모듈 3 + mock 분기 1. 게이트 정정 R3·R4·R5·R6·R7·R9·R10·R11이 **모듈 레벨 실현·테스트**됨. ⏸️ **Steps D-E = 라이브 파이프라인 배선(run.ts) 잔여** — 별도 신선-집중 청크(resume 키 수술).

- **✅ Step A (R4/R5/R7/R11)** `comprehension-artifact.ts`: `Baseline<never>`→실타입(spine_claims=`ProvisionalLabelClaim[]`·confidence_by_claim=`LeafClaimConfidence[]`[leaf lower-bound 여기·결정론 `is_lower_bound_by_claim` 불변=R5]·limiting_witness). **attempt↔content provenance 분리**=`provenance.leaf_read_attempt{not_attempted|produced|unread|failed}`. validator: producer↔attempt coupling(llm⟺produced·unread/failed⟹deterministic)·**required-PRESENT 가드**·**deferred allowlist**(engine 필드만). `contract_version 1→2`. 빌더 2(`buildDeterministic…`[degrade 옵션]·`buildLlm…`[빈 read=throw]). **11 테스트**.
- **✅ Step B (R6/R3)** `llm-touch-fingerprint.ts`(신규): `llmTouchFingerprint(ⓐ,ⓑ)`=staged·ⓒ 타입 슬롯 부재(비순환 by-construction)·`declared_closure_only` 라벨(R6a)·ⓑ=model-identity pre-image projection·reasoning_effort·leaf_prompt_sha256·schema/tool·cv(route residue 제외=R6b). **`assertGatingKeyExcludesInEpochOutput`**(R3)=실 seed 키가 ⓒ 키 포함 시 throw(재귀). **11 테스트**.
- **✅ Step C (R10/R9)** `leaf-reader.ts`(신규): `extractLowConfidenceLeafEvidence`(저신뢰 시트만·source-safe bounded·raw 값 0)·`readLowConfidenceLeaf`(주입형 callLlm·저신뢰=confidence/is_lower_bound **결정론 강제**·LLM은 라벨 텍스트만·R9 hard-fail→`failed`·빈 read→`unread`)·`LEAF_READ_SYSTEM_PROMPT`. **R10 mock 분기**(INV-MOCK-1 삭제경계 무분할). **12 테스트 + 풀 서브시스템 통합**(produced→fingerprint→llm 아티팩트→비순환·degrade·model 회전).

⏸️ **Step D (R1/R2/R8) — 라이브 배선 잔여**: run.ts post-observation leaf-read 단계. **삽입 지점 확정**=`run.ts:11270 refreshAuthoredArtifactReuseMatch` 직전(`sourceObservations`·`directiveAuthor`[LLM] in-scope). 필요: (i) `ReconstructDirectiveAuthor`에 leaf-read 콜 노출(또는 llmCall/llmConfig 스레딩) (ii) 저신뢰 영역→`readLowConfidenceLeaf`→`buildLlmComprehensionArtifact`→**별도 authored doc 영속**(`writeFreshAuthoredYamlDocument` reuseMatch=fingerprint·임베드는 결정론 유지·재호출 차단) (iii) **R2** 집계 fingerprint를 `authoredArtifactReuseMatch`에 NEW 필드 fold(인스턴스 미fold) (iv) **R8** N-region 순서무관 집계(sorted {observation_id, fingerprint} sha256) (v) **R3 실배선** `assertGatingKeyExcludesInEpochOutput`를 seed 다이제스트에 호출 (vi) **CG-1** `LEAF_READ_SYSTEM_PROMPT`를 `RECONSTRUCT_AUTHORING_PROMPT_CONTRACT.leaf_read` 등록. resume 회귀=model A→B·1영역 회전 partial fail-closed.
⏸️ **Step E — 잔여**: `projectInventoryForPrompt` 잠정-라벨 섹션(별도 doc join·정직 태그·미독 명시·truncation) + E2E(§6) + full vitest + 정적 게이트(import-boundary: leaf-reader→mock-llm-realization은 테스트 경유라 무관·실 caller는 run.ts) → 커밋.

**잔여 정직(R1~R11 후에도)**: 실 LLM 의미품질 미측정(mock-first)·dependency-discovery 자동열거 이연(R6=declared-closure-only)·E2E 단일 워크북·triage/reduce·review 수혜 미입증. **▶ 다음 = 정정본 owner 검토 → (선택) 재-게이트 또는 승인 후 빌드.** ⚠️ R1 placement 결정(별도 아티팩트 vs sourceObservationsReuseSha256 fingerprint fold)·R4 attempt-status 모양은 뒤집기 가능.
