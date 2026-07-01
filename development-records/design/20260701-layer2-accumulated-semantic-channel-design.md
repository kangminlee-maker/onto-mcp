# design — Layer-2 누적 LLM 의미 채널 (accumulated semantic channel)

> 상태: **v2.1 build-spec — 2-라운드 교차검증 통과 (2026-07-01)**. baseline = origin/main `bc94ebc`(PR #158). 실 LLM 불필요(설계-먼저·재측정 금지).
> **★ 빌드 지배 = §13 v2 실행 build-spec (v2.1 패치 반영)**. §11=v1 양-패밀리 수렴 / §12=narrow / §13=실행 계약 / **§14=v2 재-교차검증(codex SOUND_WITH_REVISIONS)**. §2~§8=v1 세부(§13 대체).
> **owner 결정 확정**: N3=전량 unanchored 적대재검증 / N4=부가 ReduceTopologyTrace(byte-parity) / C8=Layer-2 로컬 allowlist(전역 리팩터 이연).
> 검증: v1=ultracode(Claude)+onto(gpt-5.5) 양패밀리 REDESIGN_NARROW → v2=**$ultracode-for-codex**(gpt-5.5·자체 verify+tsx probe+vitest 63pass) SOUND_WITH_REVISIONS → v2.1 5수정 반영.
> **다음 = owner 빌드 승인 → S1(mock 우선·default-off·behavior change 0)**. 브랜치: `feat/comprehension-reduce-layer2` (워크트리 `onto-mcp-l2`).
> 상위 SSOT: `20260701-reduce-merge-layer-boundary-design.md`(경계 확정 = 증가 Layer-1 / 함축 Layer-2). §2.2 Layer-2 정의·§2.3 구조앵커·§4 resume·§8 교차검증 F2·§9 Claim M.
> 코어: `src/core-runtime/reconstruct/comprehension-reduce.ts`(Layer-1 뼈대). fingerprint: `llm-touch-fingerprint.ts`. 계약: `comprehension-artifact.ts`. 규율 앵커: `leaf-reader.ts:22-35`.
> 프로세스: 이 설계 → **ultracode + onto 교차검증** → owner 승인 → 빌드(mock/fixture LLM 우선·월 한도). 한 번에 production 금지.
> 메모리: [[unified-comprehension-engine-track]] · [[design-validation-ultracode-onto]] · [[domain-agnostic-no-static-enums]] · [[contract-runtime-gap-ledger]].

---

## 0. 무엇을 확정하나 (경계는 이미 확정 — 이 문서는 그 위)

상위 설계(§2)가 **경계**를 확정했다: merge는 **항상 결정론 합집합 뼈대**(Layer-1, 머지됨), **Layer-2 = 각 마디에서 LLM이
자식들의 판단을 종합해 내린 의미 판단을 뼈대 옆에 별도 저장·누적하는 병렬 채널**. 이 문서는 그 Layer-2 채널의 **데이터 모델 ·
누적 메커니즘 · resume 계약 · case-2 정직 게이트 · seed 출력 · 빌드 절단**을 확정한다. **경계 자체는 재개방하지 않는다**(owner-settled).

이 문서가 새 개념을 만드는 게 아니라 두 기존 기계를 조합한다: **leaf-read 규율**(`leaf-reader.ts` — provisional·비권위·결정론 tag·
"feeds no reduce/merge")을 leaf 하나 → 트리 전체로 확장하고, **2-tier 에포크 fingerprint**(`llm-touch-fingerprint.ts`)를
누적 채널의 재사용 게이트로 확장한다.

## 1. 확정된 근거 (재측정 금지 — 이미 실측)

상위 §9 실 gpt-5.5 측정이 확정한 것(이 설계의 전제, **재측정 금지 목록** = 상위 §4·consolidation §4):

| 확정 | 값 | 함의 (이 설계가 의존) |
|---|---|---|
| over-context 커버리지 | 0.19(flat) → **1.00**(누적)·환각 0·2/2런 | 뼈대 위 누적은 **빠짐없이·충실히** 덮음 → §2 채널 정당성 |
| 깊은 트리(3레벨) drop | **0**·환각 0·통제 0.00 | 누적 경로가 깊어도 R6 silent-drop 미발생(양호) → §3 accumulation 정당성 |
| 의미 fidelity (case-2 위험) | 0.72 ≫ floor 0.40·환각 0 | 누적이 **결정론 사실과 어긋난 구조 안 지어냄**(단 통제 부실=name confound) |
| resume-soundness (R1/R8) | live 4/6 실패 vs hybrid 5/5 | **LLM은 resume 키서 제외**(§4 계약의 근거) — 이 설계의 하드 제약 |
| "더 나은 seed인가"(의미-품질) | **inherently soft** | §5-M = asserted-not-established, **재측정 X**(coverage 교란·name confound) |

> **재측정 금지**: 이 설계의 검증은 (a) 결정론 로직의 by-construction 테스트 + (b) mock/fixture LLM E2E + (c) 설계 교차검증뿐.
> 의미-품질 상승분(§5-M)은 grounded 측정 밖 → judge 붙여도 gameable → **정직하게 미확정으로 둔다**.

## 2. 데이터 모델 (D1) — 뼈대 노드마다 병렬 의미 판단

### 2.1 개념 경제 (신규 vs 재사용 결정)

| 개념 | 결정 | 이유 |
|---|---|---|
| `ComprehensionReduceNode`(Layer-1 뼈대) | **재사용·무접촉** | byte-안정 ground. Layer-2는 이 위에 얹기만·절대 안 건드림(R1 33% 드리프트). |
| Layer-2 판단 노드 | **신규** `ComprehensionSemanticNode` | 뼈대와 별개 소유·수명·권위(provisional). 뼈대 노드에 필드 추가 = ground 오염 → 금지. |
| 모듈 | **신규** `comprehension-semantic-map.ts` | 뼈대(`comprehension-reduce.ts`)와 물리 분리 = "LLM은 여기만" 경계를 파일로 강제. |
| `ProvisionalLabelClaim`(leaf-read) | **확장 재사용** | Layer-2 leaf 판단 = 기존 leaf-read 판단과 동종. 트리 상위로 **누적 형태만** 추가. |
| `LlmTouchFingerprint`(재사용 게이트) | **확장** ⓑ 프리이미지 | 신규 fingerprint 개념 금지 — 기존 staged non-circular에 reduce-reader 필드 추가(§4). |
| 아티팩트 `semantic_depth` 등 engine-not-yet(`comprehension-artifact.ts:151-156`) | **투영 후보(별도 판단)** | Layer-2 트리는 자기 구조. 아티팩트로는 **bounded 뷰만** 투영(§6). 지금 배선 안 함. |

### 2.2 `ComprehensionSemanticNode` (제안 형태 — 뼈대 노드와 1:1)

각 Layer-1 `ComprehensionReduceNode`(region identity = `{sheet, column_index, row_start, row_end}`)에 **정확히 하나**의 병렬
의미 노드가 대응. 트리 모양은 **결정론(뼈대)이라 고정** — 누적 경로는 안 흔들리고 내용만 LLM(§2.2 상위).

```
interface ComprehensionSemanticNode {
  node_ref: ComprehensionReduceRegion;          // 결정론 앵커(뼈대 노드 identity). Layer-2의 '주소'.
  layer1_ground_hash: string;                    // reduceNodeGroundHash(뼈대 노드) — 재도출 트리거(§4).
  authority: "non_authoritative";                // leaf-read 규율 계승(항상).
  provisional: true;                             // seed-confirmation 전엔 신뢰 금지(항상).
  // ── LLM 판단(누적) ──
  semantic_summary: string;                      // 이 마디/서브트리가 '무엇을 의미하나'(frame-neutral·도메인 명명은 LLM).
  semantic_boundaries: SemanticBoundary[];       // 이 마디 안에서 '성격이 바뀌는' 지점 + anchor_status(§3).
  child_judgment_refs: string[];                 // 종합한 자식 판단들(node_ref key) — 오류누적 audit 계보(§5-A).
  // ── 재사용 게이트(비순환) ──
  epoch_fingerprint_contribution: string;        // §4 재귀 fingerprint 값(LLM 출력 아님). resume 키서 제외.
}

interface SemanticBoundary {
  row: number;                                   // 성격이 바뀐다고 LLM이 판단한 행(결정론 뼈대 좌표).
  character_before: string;                      // 위 성격(LLM, frame-neutral).
  character_after: string;                       // 아래 성격(LLM).
  anchor_status: "anchored" | "unanchored" | "structure_contradicted";  // §3 — 최고가치=최고위험 게이트.
  material: boolean;                             // §5-A material-only 적대재검증 라우팅 플래그(unanchored 한정).
}
```

- `semantic_summary`/`semantic_boundaries`/`character_*` = **LLM 텍스트 기여**뿐(leaf-read `captured_note`와 동종). 도메인 명명
  enum 박기 금지([[domain-agnostic-no-static-enums]]) — 의미 명명은 런타임 LLM, 결정론은 좌표·구조·identity만.
- `node_ref`·`layer1_ground_hash`·`epoch_fingerprint_contribution` = **결정론**(코드 소유). 이게 뼈대와의 앵커·재사용 계약을 진다.

## 3. ★case-2 정직 게이트 (D2 — 최고가치=최고위험, START-HERE §4 선결)

상위 §2.3의 구조앵커 대조를 **필드로 강제**한다. LLM이 낸 각 `SemanticBoundary`를 뼈대 노드의 결정론
`boundaries: ComprehensionBoundaryWitness[]`(value-shape seam) + `format_clusters`에 대조해 `anchor_status`를 **결정론으로** 배정:

| 뼈대 구조신호(그 행 근처) | LLM 의미경계 | `anchor_status` | 처리 |
|---|---|---|---|
| 있음(seam·shape 전환) | 있음(같은 위치) | **`anchored`** | 고신뢰 — 구조가 corroborate. seed에 강신뢰 태그. |
| **없음**(shape 동일·seam 0) | **있음** | **`unanchored`** | **case-2 = LLM 진짜 가치·구조적 눈멈**. **구조로 검증 불가** → §3.1 처리. |
| 있음(seam) | 없음(LLM이 균일 주장) | **`structure_contradicted`** | LLM이 볼 수 있는 결정론 사실과 **모순** → fail-flag(거짓말탐지기 발화). |

### 3.1 ★"거짓말탐지기는 case-2에 눈멈"을 명세로 못박음 (상위 §8 F2 material)

- **거짓말탐지기(구조 채널)는 `anchored`/`structure_contradicted`에서만 작동** — 대조할 결정론 신호가 있는 곳. `unanchored`(case-2·
  순수 의미경계)는 **구조적으로 눈멈**: 대조할 뼈대 신호가 0이라 참/거짓을 구조로 못 가림. → **구조 채널을 *일반* 거짓말탐지기로 제시 금지**.
- ∴ 세 갈래 정직 처리(START-HERE §4 (i)+(ii)+(iii) 결합, 배타 아님):
  - **(ii) 주장 narrow**: "구조앵커가 경계를 검증한다"는 §5-M 가치 주장을 **`anchored` 경계로 한정**. `unanchored`는 **검증됨으로 라벨 금지**.
  - **(iii)/(i) 독립 검사**: `material && unanchored` 경계만 **독립 적대 재검증**으로 라우팅(§5-A) — 구조가 못 보니 **LLM-on-LLM 독립 렌즈**가
    유일한 검사. 이건 구조 채널과 **다른 KIND**의 검사이며 **결정론보다 약함**을 라벨(`verified_by: adversarial_llm`, not `structural`).
  - **최종 방어 = user seed-confirmation**: `unanchored`는 seed에 **provisional-only + "구조 검증 불가"** 명시로만 흘러가고, 사용자 확인 게이트가 최종.
- **하드 규칙(fail-closed)**: `unanchored` 경계는 (a) resume 키 진입 금지(§4), (b) `verified_by: structural` 태그 금지, (c) seed 출력 시
  `structurally_unverifiable: true` 동반 필수. 이 셋을 `assertSemanticBoundaryHonesty` 검증기로 강제(§4 R9 대칭).

### 3.2 `anchor_status` 배정은 결정론 (LLM 아님)

배정 함수 `classifyAnchorStatus(boundary, reduceNode)`는 **순수 결정론**: LLM이 낸 `row`를 뼈대의 `boundaries`/`edge_*`/
`format_clusters`에 대조. 근접 허용오차(예: ±1행 = leaf-read `first_new_format_row` 규약)는 **명시 상수**. → **anchor_status 자체는
게임 불가**(LLM이 자기 경계를 anchored로 못 주장; 뼈대가 판정). 이게 case-2 정직성의 결정론 핵심.

## 4. resume 계약 (D3 — Layer-2 재사용 게이트, START-HERE §4 선결)

### 4.1 하드 불변식 (상위 §2.5·§4 — 위반 시 fail-closed)

> **resume 키(byte-안정 ground)에 들어가는 모든 것 = Layer-1 결정론.** Layer-2가 만든 모든 것 = resume 키서 **제외**되고
> epoch-fingerprint로만 재현.

- Layer-2는 `reduceNodeGround`(resume subject)에 **필드 0 추가** — 별도 노드라 구성상 제외(§2.1). 이건 by-construction.
- `LLM_TOUCH_IN_EPOCH_OUTPUT_FIELDS`(llm-touch-fingerprint.ts:130)에 Layer-2 출력 필드 추가:
  `semantic_summary`, `semantic_boundaries`, `character_before`, `character_after`, `child_judgment_refs`. → `assertGatingKeyExcludesInEpochOutput`가
  이들을 게이팅 키서 발견 시 **throw**(비순환 by construction). = leaf-read `tentative_label`/`captured_note` 가드와 대칭.

### 4.2 ★재도출 트리거 = 자식 Layer-1 변화 (재귀 fingerprint)

Layer-2 노드의 재사용 키를 **재귀적으로** 정의(load-bearing — §5 반증표적):

```
node.epoch_fingerprint_contribution
  = sha256( stableJson({
      layer1_ground_hash: reduceNodeGroundHash(node),           // ⓐ' 이 마디 구조(결정론)
      child_contributions: children.map(c => c.epoch_fingerprint_contribution).sort(),  // 재귀: 자식 재도출→부모 재도출
      layer2_pre_image: {                                        // ⓑ' reduce-reader LLM-touch 프리이미지
        reduce_reader_model_identity, reduce_prompt_sha256,
        reduce_schema_tool_version, comprehension_version,
        over_context_gate_config_sha256,                         // §5 accumulate-vs-flat 게이트 config
      },
    }) )
```

- **왜 재귀가 load-bearing인가** (비자명·반증표적): 부모의 `reduceNodeGroundHash`는 자식 ground의 결정론 함수지만 **부모 ground가 byte-동일한데
  자식 ground가 바뀔 수 있다**. 그 경우 부모 자기 ground 해시만 접으면 자식 변화를 **못 잡음** → `child_contributions`를 접어야 함.
  `child_contributions`는 자식의 **fingerprint 값**(ⓐ'+ⓑ'+손자…의 해시)이지 **LLM 출력이 아님** → 비순환 유지.
  > ⚠️ **v1 factual 오류 (교차검증 5-렌즈 수렴 §11)**: 원 예시 "자식 내부 seam 변화 → 부모 ground 불변"은 **틀림**. `mergeReduceNodes`가 모든
  > 자식 boundary를 부모로 union하고(comprehension-reduce.ts:239-242) `reduceNodeGround`가 직렬화하므로(:120), 자식 seam 변화는 부모 ground를
  > **바꾼다**. **진짜 비전파 케이스**(재귀가 실제로 잡는 것) = ① 비-최저 `limiting_witness` 변화(부모는 `witnessCandidates[0]`=최저행만 보존, :293)
  > ② 이미 sibling이 true인 OR-접힌 중복 lower-bound flag flip(:271) ③ 중간 자식 edge shape 변화(부모 edge=first/last 자식만, :288-289). §12-N3이
  > §7 음성대조를 이 케이스로 고정(cardinality>0)한다.
- ⓑ' 프리이미지 필드는 `LlmTouchPreExecutionPreImage`(llm-touch-fingerprint.ts:38-63)에 **reduce-reader 대응 필드로 추가**(leaf 프리이미지와
  병렬; 신규 fingerprint 함수 아님). `reduce_prompt_sha256` = 누적 종합 프롬프트를 authoring-prompt 카탈로그(CG-1)에 등록 → 편집이 키 회전.

### 4.3 자기-jitter 차단 (§5.1 P3)

- 자식 불변(ground 해시 + fingerprint 불변) → **진행 저널 캐시 재사용**(LLM 재호출 안 함). LLM 런-투-런 변동이 위로 캐스케이드하는 것 차단.
- 자식 Layer-1 ground 변화(결정론 신호)만 재도출. → **well-founded**: 재도출 트리거가 결정론이라 무한 재도출·자기-jitter 루프 없음(R4).
- 저널 = epoch-scoped(byte-안정 불요·상위 §3 R8). 저널 히트 = `epoch_fingerprint_contribution` 일치.

## 5. ★load-bearing 주장 + 위험 (교차검증이 반증할 표적)

**주장 L2-STRUCT (재귀 fingerprint 정확)**: *§4.2 재귀 정의가 "자식 변화 → 부모 재도출"을 정확히 트리거하고 자기-jitter는 차단한다.*
- 반증표적: (a) 부모 ground 불변인데 자식 변화한 케이스서 부모가 재도출 **안 됨**(스킵) → stale 부모 판단. (b) 재귀가 비순환 위반(LLM 출력이
  키에 샘). (c) 트리거가 non-well-founded(무한 재도출). → by-construction 테스트 + 음성대조 필수(§7).

**주장 L2-ANCHOR (case-2 게이트 정직)**: *`anchor_status`가 결정론으로 배정되고, `unanchored`가 구조-검증됨으로 절대 라벨 안 되며
resume 키·seed 강신뢰 진입이 fail-closed 차단된다.*
- 반증표적: (a) LLM이 자기 경계를 anchored로 게임. (b) `unanchored`가 어딘가서 `verified_by:structural`/강신뢰로 새어 seed 오염.
  (c) `structure_contradicted` 미발화(모순인데 통과). → 정직 검증기 음성대조(§7).

**주장 M (seed 가치 — 상위 §5)**: *누적 지도가 flat 라벨보다 나은 seed다.* → **미확정·asserted-not-established**(상위 §8·§9). 이 설계는
M을 **입증하지 않는다**; §9-f/user-gate로 **안전하게 취급**만 한다. **재측정 금지**(coverage 교란·name confound·inherently soft).

**위험 A (오류 누적 — 상위 §5)**: 중간 마디 LLM 오판이 상위로 전파. 완화 = ①`structure_contradicted` 결정론 게이트(§3, 볼 수 있는 곳) +
②`child_judgment_refs` 계보 audit + ③`material && unanchored` 독립 적대재검증 + ④Layer-2 resume 제외라 **결정론 코어 불오염**(구성상) +
⑤user seed-confirmation. **정직 잔여**: `unanchored` case-2 오류누적은 **결정론으로 못 잡음**(구조 눈멈) → material만 LLM-독립검사, 나머지는
provisional 라벨 + user gate. **이 완화 충분성 = 미실증**(측정 밖). 이걸 확립됨으로 취급 **금지**.

> 교차검증 우선표적: **L2-STRUCT(재귀 정확성) + L2-ANCHOR(case-2 정직) + 위험 A(누적)**. M은 R1/§9로 이미 "safe-not-proven" 확정.

## 6. seed 출력 (D6 — §2.4) — flat 라벨을 계층 지도로 승격

현 seed 경로(실측): leaf-read `spine_claims` → `provisionalLabelsByObservation`(observation당 flat 라인, run.ts:11760) →
`payload.provisional_labels`(비권위·display-bounded·authoritative totals, run.ts:6476). Layer-2는 이걸 **계층 지도**로 승격:

- 각 지도 노드 = `semantic_summary` + 계층 위치(node_ref) + `semantic_boundaries`(각 `anchor_status` 동반). **누적이라 빠짐없음**(§1 coverage 1.00).
- **정직 투영 규칙**: `anchored`=강신뢰 태그 / `unanchored`=`structurally_unverifiable:true`(구조 검증 불가·provisional) / `structure_contradicted`=
  seed 진입 전 flag(억제 또는 재검증). display-bounded 시 **authoritative totals**(run.ts:6469 규약) 계승 — silent drop 금지.
- **배선은 default-off**(§8): 이 문서는 지도 → seed 계약만 확정. 실 배선은 owner 승인 후 별도 cut(현 flat 경로 보존, opt-in).

## 7. 검증 계획 (재측정 금지 — 결정론 로직 + mock + 음성대조)

- **결정론 by-construction** (LLM-0): 재귀 fingerprint 트리거(자식변화→부모재도출·자기-jitter 스킵·비순환 가드 throw), `anchor_status` 배정
  (anchored/unanchored/contradicted 3케이스), `assertSemanticBoundaryHonesty`(unanchored→강신뢰/resume 진입 시 reject), 지도→seed 투영(totals·flag).
- **★음성대조(falsifiable)** 필수(상위 §7 F3 교훈·"green ≠ 옳은 걸 쟀다"): 각 검증기가 **틀린 입력에 반드시 fail**하는 쌍 — anchored인데 뼈대 seam
  없음→검증기 catch, unanchored가 resume 키에 샘→throw, 부모ground불변+자식변화→재도출 트리거(스킵이면 테스트 fail). **subject 카디널리티 >0** 단언.
- **mock/fixture LLM E2E** (월 한도): 누적 엔진을 `callLlm` 주입형(leaf-reader 패턴)으로 — mock 디스패처가 결정론 판단 반환 → 트리 누적·anchor 대조·
  seed 투영 실경로 실행. **실 LLM 의미품질은 owner 승인/한도 회복 시**(§9 이미 측정분과 별개, 재측정 아님).
- **함정 회피**(상위 §6): "그럴듯한 silent proxy" 금지 — `anchor_status`는 실제 뼈대 `boundaries` 대조지 요약/다수결 아님. 대리값이 진짜 신호 대체 금지.

## 8. 빌드 절단 (D8 — mock-first, default-off, 한 번에 production 금지)

1. **S1 타입·게이트** (LLM-0): `ComprehensionSemanticNode`/`SemanticBoundary` 타입 + `LLM_TOUCH_IN_EPOCH_OUTPUT_FIELDS` 확장 +
   `LlmTouchPreExecutionPreImage` reduce-reader 필드 + `classifyAnchorStatus` + `assertSemanticBoundaryHonesty` + 재귀 fingerprint. by-construction 테스트 + 음성대조.
2. **S2 누적 엔진** (mock LLM): `callLlm` 주입형 `accumulateSemanticMap(reduceTree, callLlm)` — 뼈대 트리 위 bottom-up 누적 + anchor 대조 + 저널 재사용. mock 디스패처 E2E.
3. **S3 over-context 게이트**: accumulate-vs-flat 결정론 게이트(tenet 2 — 서브트리가 윈도 초과 시만 누적). config가 fingerprint ⓑ'에 fold.
4. **S4 seed 투영** (default-off): 지도 → `provisional_labels` 계층 승격 경로(opt-in·flat 경로 보존·byte-parity로 off 증명). material&&unanchored 적대재검증 라우팅.
5. **실 LLM 의미 검증**: owner 승인/한도 회복 시. §9 측정분 재사용, **재측정 금지**.

각 S 후 검증 루프(ts clean·게이트·full vitest 회귀0·음성대조). risky/behavior-change는 **default-off + diff로 off 증명**(상위 규율).

## 9. 비-목표 (이 문서가 정하지 않는 것)

- Layer-2 추상화 **품질**(좋은 타입 내나) = 별도 가치 실측(상위 §6·구 R3). **재측정 금지 목록**.
- cross-sheet relational seam(§5.6)·per-column 넘는 계층 = 별도.
- review-side finding-reduce·reconstruct 게이트 = carve-out(엔진 밖).
- 실 production 배선 = 이 교차검증 + owner 승인 후. 경계(§2 상위) 재개방 = 금지.

## 10. 다음

이 설계 → **ultracode + onto 교차검증**(양 패밀리 독립, [[design-validation-ultracode-onto]] — Layer-1 F3/boundary-sort 실버그를
초기 테스트가 못 봤던 전례; Layer-2는 LLM 채널이라 더 필요) → narrow 반영(§11·§12) → owner 승인 → S1부터 빌드(mock 우선).

---

## 11. v1 교차검증 결과 (2026-07-01, 양 패밀리 독립·**REDESIGN_NARROW**)

**Family-1 ultracode** `wf_2d0ef9e8-4bf`(6 distinct-KIND 렌즈·28 findings/9 HIGH). ⚠️**메타**: 워크플로 합성이 "SOUND/0 findings"로
보고했으나 이는 **verify 단계가 session limit(9:50pm KST)로 크래시 → findings가 null 필터**된 **거짓 green**. raw journal에서 review
findings 복구 + **main-loop가 직접 실코드 재검증**(CLAUDE.md "orchestrated all-green 불신·직접 재검증" 규율). **Family-2 onto** `20260701-10dfb5b1`
(9 렌즈·11 issues/5 HIGH·gpt-5.5 codex_cli subscription). **양 패밀리가 모든 주요 클러스터에 독립 수렴** + 각자 고유 발견(union 반영).

**헤드라인 생존**: 결정론 뼈대 위 누적 LLM 의미 채널·resume 제외·seed 피드(§2 경계) = 양 패밀리 모두 **논지 아닌 메커니즘** 공격. → REDESIGN_NARROW.

| # | 표적 (수렴) | Family-1 | Family-2 | 판정 |
|---|---|---|---|---|
| C1 | `structure_contradicted`가 **LLM 경계 누락**(정확히 그 모순 케이스)에 못 발화 — per-boundary status라 대조할 객체 부재 | L2H-4·TOPO-2 | issue-001(logic·structure·dep)·004(pragmatics) | **2F·5렌즈** |
| C2 | `material` 게이트 = case-2 유일 검사인데 provenance 미정 → LLM 자기-면제(`material:false`) | TOPO-1·C2·CC-1·L2H-3 | issue-003(structure·dep·evolution)·006 | **2F·7렌즈** |
| C3 | 재귀 fingerprint가 Layer-1이 **미보존한 자식 트리** 요구(`mergeReduceNodes`=folded 단일노드·children 없음) + §4.2 예시 factual 오류 | C4·TOPO-6·CC-3·L2R-1·C1 | issue-002·005(pragmatics) | **2F·6렌즈** |
| C4 | Layer-2 **완결성/honesty 검증기 부재**(assertContiguousChildren 대칭 없음) + verification-status 필드 미정의라 validator 대상 없음 | TOPO-3·L2H-5 | issue-008·009(coverage) | **2F** |
| C5 | unanchored 오류 **taint 미전파** — 부모 summary/seed가 미검증 입력 위에 세워졌음을 표기 안 함(Risk A 미봉쇄) | TOPO-2 | issue-011(axiology) | **2F** |
| C6 | `anchored`가 **위치만** corroborate·**내용(character) 아님** → 진짜 seam(예: Total 텍스트행)에 환각 의미분할이 강신뢰 스탬프 | L2H-1·L2H-2 | (issue-001 two-sided 인접) | **F1 주도** |
| C7 | 개념 중복: 재귀 fold=신규 함수(타입가드 미승계)·이름충돌·verified_by↔evidence_quality·6 Baseline<never> 미매핑 | CE-1··5 | issue-010(conciseness) | **2F** |
| C8 | **[F2 고유·상보]** 비순환 가드 = field-name **denylist**(신규 LLM 필드마다 수동 추가=취약) → **allowlist 결정론 프리이미지 계약**으로 | — | issue-007(evolution) | **F2 단독** |
| C9 | **[F1 고유]** §0가 leaf-read "feeds no reduce/merge" 규율을 승계한다 주장하나 Layer-2가 **정확히 그 절을 무효화**(자식→부모 feed) | CC-2 | — | **F1 단독** |
| C10 | over-context 게이트 미정의(임계·측정량)·1:1 노드 모델 상충·합성 프롬프트 source-safety 봉투 미명세 | C3·TOPO-5·C6 | (issue-009 인접) | **F1 주도** |

전체 findings raw = ultracode journal(`wf_2d0ef9e8-4bf`)·onto issue-ledger(`.onto/review/20260701-10dfb5b1/issue-ledger.yaml`).

## 12. v2 build-contract (§11 narrow 반영 — 이 절이 빌드를 지배·§2~§8 메커니즘 세부 대체)

> 헤드라인·경계(§2 상위)·resume 불변식(§4.1)·재측정 금지(§1)는 유지. 아래는 메커니즘 narrow. **★ = owner 결정 필요**.

- **N1 (C1) 모순 게이트 = 2-면 결정론 재조정.** `structure_contradicted`를 per-boundary status에서 빼고, 노드마다 **결정론 seam-coverage 대조**를
  추가: 뼈대 `reduceNode.boundaries`를 순회하며 각 material seam이 tolerance 내 LLM 경계로 **덮이는지** 판정 → `covered | missed_by_llm`. **음성대조
  필수**: `boundaries.length>0 && semantic_boundaries.length===0` → **반드시 contradiction 방출**(스킵이면 테스트 fail). `assertSemanticBoundaryHonesty`가
  양 컬렉션 소비.
- **N2 (C6) `anchored`=위치-only.** anchored는 "구조 seam이 이 행에 공존" 만 주장; **character 내용은 검증 안 됨**. → seed에서 anchored에 강신뢰/verified
  태그 **금지**(내용은 unanchored처럼 provisional·user-gated). anchor 판정은 **seam KIND/전환 내용 매칭**까지(단순 행±tolerance 금지); 전환 불일치 seam-근접
  = unanchored. tolerance = **명명 상수 + 근거**(§3.2 "예:±1" 폐기).
- **★N3 (C2) `material` 자기-면제 차단.** 기본 = **모든 unanchored를 적대재검증으로 라우팅**(material 게이트를 case-2 경로서 제거·fail-closed). `material`은
  **결정론 우선순위**(노드 magnitude=row-span/cluster-count)로만 쓰고 **억제 게이트로 금지**. LLM-authored면 advisory-only + `LLM_TOUCH_IN_EPOCH_OUTPUT_FIELDS`
  등재. ★owner 결정 = "전량 재검증(안전·LLM 비용↑)" vs "결정론 magnitude 임계 재검증(비용↓·임계 위험)".
- **N4 (C3) 보존 트리 + 재귀 예시 교정.** Layer-1에 **비-ground 부가 출력** `ReduceTopologyTrace`(`node_ref → child_node_refs[]`) 추가 — `reduceNodeGround`
  바이트 **불변(byte-parity 증명)**, "ground 무접촉" 유지. `accumulateSemanticMap`이 이 topology 소비. §4.2 재귀 정당화 = **진짜 비전파 케이스**(비-최저
  limiting_witness·OR-접힌 중복 flag)로 재기술 + §7 음성대조를 그 케이스로 고정(**cardinality>0 단언**). ★owner 결정 = 부가 트리 출력(추천) vs Layer-2 독립 재빌드.
- **N5 (C4) Layer-2 fail-closed 검증기(Layer-1 대칭).** `assertChildJudgmentCoverage(parent, deterministicChildren)` — `child_judgment_refs`가 고정 트리의
  자식 집합과 **정확히 일치** 아니면 throw(assertContiguousChildren 대칭·S1 by-construction + 음성대조). verification-status 필드 추가: `verified_by`(deterministic
  projection of anchor_status)·seed-projection status = **머신-리더블**이라 validator가 실제 대상 보유.
- **N6 (C5) taint 전파 census.** 각 노드에 `unanchored_unverified_count`(자식들의 미검증 unanchored/failed 합) 전파 → 부모 summary·seed 노드가 "미검증 입력
  위에 세워짐" 표기. Risk A를 **봉쇄가 아니라 정직한 disclosure**로(seed-confirmation이 최종). = leaf-read `not_examined_capped` census 패턴 확장.
- **N7 (C7·C8) 개념 경제.** 재귀 fold = **자기 이름**(`reduceNodeEpochContribution`)·**자기 비순환 증명 의무**(ⓒ 구조적 배제 param 타입 or 가드 경유)·"신규
  함수 아님" 주장 철회. `epoch_fingerprint_contribution` 이름충돌 회피(→ `subtree_epoch_contribution`). `structurally_unverifiable` = anchor_status의 **파생
  projection**(이중 저장 금지). `verified_by` vs `evidence_quality` 조정. 6 `Baseline<never>` engine-not-yet 필드 각각 reuse/rename/retire 매핑 +
  `semantic_depth` 투영 시 `COMPREHENSION_ARTIFACT_CONTRACT_VERSION` bump 명기. ★C8 = 전역 denylist→allowlist 리팩터는 **별도 follow-up**(shipping leaf-read
  경로 영향); Layer-2는 자기 신규 fold에 allowlist-형 타입만 로컬 적용.
- **N8 (C9) §0 정직 교정.** Layer-2는 leaf-read "feeds no reduce/merge"를 **무효화**함을 명시 — 승계하는 건 provisional·비권위·결정론-tag뿐. 대체 안전 근거
  = resume-키 제외(§4) + 전량-unanchored 적대재검증(N3) + user seed-confirmation, 그리고 **이 근거는 미입증**(Risk A) 명기.
- **N9 (C10) over-context 게이트.** 임계 = **결정론 양만**(leaf 수/row-span/ground byte 크기·LLM summary 길이 금지). 1:1 상충 해소 = "게이트는 fan-out
  배칭만 제어, 모든 뼈대 노드는 항상 의미노드 보유" 또는 "1:1을 accumulation frontier 노드로 완화" 중 명시. 합성 프롬프트 = **bounded source-safe 봉투**(Layer-1
  ground 필드 + 자식 summary/character 텍스트만·raw cell/formatCode 금지·leaf-reader.ts:26-32 대칭) + 구성-시 단언.

**빌드 순서(v2)**: S1(타입 = N1 2-면 게이트·N2·N4 topology·N5 검증기·N6 census·N7 개념·N9 봉투 + 전부 by-construction 음성대조) → S2(mock LLM 누적) →
S3(over-context 게이트) → S4(seed 투영 default-off·byte-parity) → 실 LLM은 owner 승인/한도 회복 시. **★owner 결정 3개(N3·N4·C8) 선결.**

## 13. v2 실행 build-spec (owner 결정 반영 — 이 절이 §12를 실행 계약으로 구체화·빌드 단일 SSOT)

**13.0 owner 결정 확정(2026-07-01)**: **N3 = 전량 unanchored 적대재검증**(fail-closed·material 억제게이트 폐기). **N4 = 부가 `ReduceTopologyTrace`
(byte-parity·"ground 무접촉" 유지)**. **C8 = Layer-2 신규 fold는 로컬 allowlist param 타입**(전역 denylist→allowlist 리팩터=별도 follow-up).

### 13.1 Layer-1 부가 출력 — `ReduceTopologyTrace` (N4·비-ground·byte-parity)
`comprehension-reduce.ts`에 **부가** 함수만 추가(기존 `reduceColumnLeaves`·`reduceNodeGround`·`mergeReduceNodes` **바이트 불변**):
```
type SemanticNodeKey = string;   // `${sheet}#${column_index}:${row_start}-${row_end}` — 결정론·grep-friendly
interface ReduceTopologyTrace {
  nodes: Map<SemanticNodeKey, { node_ref: ComprehensionReduceRegion; ground_hash: string; child_keys: SemanticNodeKey[] }>;
  root_key: SemanticNodeKey;
}
export function reduceColumnLeavesWithTrace(leaves, fanin?): { root: ComprehensionReduceNode; trace: ReduceTopologyTrace };
```
- 구현 = `reduceColumnLeaves` 레벨 루프를 **재사용**하되 각 `mergeReduceNodes` 호출의 부모 key→자식 keys를 trace에 기록. **`root`는 기존과 byte-동일**
  (음성대조: 실 101MB grouping-invariance 해시가 trace-변형서도 flat/bin/ter byte-동일). "ground 무접촉"=ground 함수 미변경으로 성립.
- **★trace 완결성(v2.1·codex-F4)**: merge 콜만 기록하면 **leaf·pass-through 노드 누락**(reduceColumnLeaves:307-332는 group.length===1서 `next.push(single)` 무-merge).
  → 모든 leaf를 루프 前 등록 + 모든 pass-through 노드를 `child_keys:[]`(또는 보존된 단일-자식 매핑)로 등록. **불변식 = trace 노드 = 뼈대 전 노드**(merge 출력만 아님). 음성대조: single-leaf/홀수 fan-in 입력서 trace 카디널리티 == 뼈대 노드 수 단언.

### 13.2 Layer-2 타입 (v2)
`comprehension-semantic-map.ts`(신규):
```
interface ComprehensionSemanticNode {
  node_ref: ComprehensionReduceRegion;         // 결정론 앵커(= trace key 원천)
  layer1_ground_hash: string;                  // reduceNodeGroundHash(node) — 재도출 트리거 입력(결정론)
  subtree_epoch_contribution: string;          // N7: 재귀 다이제스트(이름충돌 회피=NOT epoch_fingerprint_contribution). resume키 제외.
  authority: "non_authoritative"; provisional: true;   // leaf-read 규율 계승분(항상)
  reduce_read_attempt: "produced" | "unread" | "failed" | "subsumed";   // C4/onto-009: subsumed=frontier 아래(§13.6)
  semantic_summary: string;                    // LLM 텍스트(자식 종합)
  semantic_boundaries: SemanticBoundary[];     // LLM 경계 + 결정론 anchor_status/verification (상태기계 §13.5)
  structure_boundary_coverage: StructureBoundaryCoverage[];  // N1: 뼈대 seam 전수 2-면 대조(결정론)
  // ★v2.1(codex-F1): topology(구조) vs consumed(실제 종합) 분리 — subsumed 노드 충돌 해소
  topology_child_keys: SemanticNodeKey[];      // 고정 트리 전 구조 자식(trace서·모든 노드). 결정론.
  consumed_child_judgment_keys: SemanticNodeKey[];  // 이 노드가 실제 종합한 자식 판단(누적 노드만 비어있지 않음)
  unanchored_unverified_count: number;         // N6: 자기+자식 미검증(unverified/adversarial_refuted/failed/unread) 합(OR-monotone·§13.5)
}
interface SemanticBoundary {
  row: number; character_before: string; character_after: string;   // LLM 출력
  anchor_status: "anchored" | "unanchored";    // 결정론(§13.3 1:1 매칭). structure_contradicted는 여기 없음=coverage측(N1).
  verification: "structural_location_only"     // anchored: 위치만 corroborate·내용 미검증(N2·L2H-1)
              | "adversarial_confirmed" | "adversarial_refuted"   // unanchored 전량 적대재검증 결과(N3)
              | "unverified";                  // 미처리(seed 진입 前엔 unanchored엔 금지=honesty validator)
}
interface StructureBoundaryCoverage {          // N1: 결정론 seam마다 하나
  boundary_ref: ComprehensionBoundaryWitness;  // value_shape seam만(display_format=noise 제외·L2H-4)
  status: "covered" | "missed_by_llm";         // missed=LLM 미커버 seam(=disclosure·기본 downweight·자동 lie 아님·L2H-4)
}
```
- `structurally_unverifiable` = **저장 안 함**; `verification !== "structural_location_only" && anchor_status==="unanchored"`의 파생(CE-5). `material` = **삭제**
  (억제게이트 폐기·N3); 필요 시 결정론 우선순위는 노드 magnitude로 별도 계산(억제 아님).

### 13.3 ★2-면 결정론 재조정 `reconcileBoundaries(semanticBoundaries, reduceNode)` (N1+N2 통합·onto-001 crystallize)
1. 뼈대 `reduceNode.boundaries`를 `boundary_kind==="value_shape"`로 필터(display_format=noise·L2H-4).
2. **1:1 매칭 — 순서-안정(v2.1·codex-F3)**: (a) **정확행 매칭 먼저**(LLM row == seam first_new_format_row), (b) 남은 것만 `ANCHOR_ROW_TOLERANCE`(명명 상수=1·근거:
   seam이 last_prev/first_new 2행 span이라 ±1이 그 span만 덮음·과확장 금지) 내 **최근접 미매칭** seam에, (c) 동률 = **canonical witness 튜플**(§comprehension-reduce
   canonicalBoundaries 7-필드 순서)로 tie-break. → **매칭 = `anchored`(verification=`structural_location_only`·위치만), 미매칭 = `unanchored`**. 탐욕 순서 의존
   제거(seam 11/12 인접서 row12가 11 greedy 매칭하는 것 차단). dense-seam 남발서도 seam 하나가 경계 하나만 앵커(L2H-2). **음성대조 = 인접 dense-seam 케이스**.
3. `structure_boundary_coverage` = seam 전수: 매칭=`covered`, 미매칭=`missed_by_llm`. **완결성 강제**: 모든 value_shape seam이 정확히 한 번 등장 아니면 throw.
4. **음성대조(N1)**: `value_shape seam ≥1 && semantic_boundaries.length===0` → coverage에 `missed_by_llm` **≥1**(silent uniform 금지·`length>0` 단언).
   단 missed=**disclosure**(기본 disposition=downweight·owner-settled 상위 §2.3 존중)이지 자동 lie 아님; "positively uniform 주장"의 hard `structure_contradicted`
   판정은 의미(prose)라 **적대/user 층**이 함(결정론 게이트는 disclosure 누락만 fail-closed).

### 13.4 재귀 fingerprint `reduceNodeEpochContribution` (N7·CE-1·C8·L2R-2)
```
interface SemanticEpochPreImage {              // ★allowlist — 결정론 필드만 (ⓒ LLM출력 슬롯 구조적 부재)
  layer1_ground_hash: string;
  child_contributions: string[];               // 자식 subtree_epoch_contribution(재귀·결정론)
  reduce_reader_model_identity: string; reduce_prompt_sha256: string;
  reduce_schema_tool_version: string; comprehension_version: string;
  over_context_gate_config_sha256: string; over_context_gate_logic_sha256: string;   // L2R-2: config+LOGIC 양쪽(누락시 predicate 편집이 키 미회전)
}
export function reduceNodeEpochContribution(pre: SemanticEpochPreImage): string;   // = subtree_epoch_contribution
```
- **자기 비순환 증명 의무**(CE-1: 타입가드 미승계 명시): (a) param 타입이 ⓒ 배제(allowlist by construction) + (b) 런타임 `assertPreImageKeysAllowlisted(pre)`
  = 키 ⊆ 고정 allowlist 아니면 throw(신규 필드 syntactic leak fail-closed). "신규 함수 아님" 주장 철회 = 이건 **자기 개념**.
- §4.2 예시 교정 완료(inline). **음성대조(cardinality>0)**: 비-최저 `limiting_witness` 자식(부모는 `witnessCandidates[0]`=최저행만 보존·:293) 변화 →
  부모 ground **byte-동일**한데 자식 contribution 변화 → 부모 재도출(스킵이면 fail). + **mutation control**: preimage서 `child_contributions` 제거 → 그 변화 **미검출**(테스트 fail로 재귀 필요성 실증).

### 13.5 fail-closed 검증기 (Layer-1 대칭·S1 by-construction)
- `assertChildJudgmentCoverage(node, trace)`(N5·v2.1 codex-F1): **누적 노드(reduce_read_attempt!=="subsumed")만** 검사 — `consumed_child_judgment_keys` 집합 ==
  frontier 위 직속 자식 keys(subsumed 서브트리는 그 frontier 노드로 접힘) → 아니면 throw. `topology_child_keys`는 항상 trace 전수(구조·검사 아님). subsumed 노드는
  consumed=[] 허용(판단 없음·명시). 대칭=`assertContiguousChildren`이나 **subsumed 예외 명시**로 topology-vs-consumed 충돌 해소.
- **★verification 상태기계(v2.1·codex-F2·fail-closed)** `assertSemanticBoundaryHonesty(node, seedBound)`: 합법 `(anchor_status, verification)` = **anchored→항상
  `structural_location_only`**(anchored는 적대검증 안 함·위치만) / **unanchored→`unverified`(pre-adversarial)|`adversarial_confirmed`|`adversarial_refuted`**. 위반
  조합(예: anchored+adversarial_*·unanchored+structural_location_only) → **throw**. **seed 투영 규칙**: anchored=provisional(위치-corroborated·user-gated)·
  unanchored+confirmed=provisional(적대 생존·user-gated)·**unanchored+refuted=seed 경계서 제외**(refuted disclosure에 기록+taint 카운트)·**unanchored+unverified & seedBound
  → throw**(N3 전량 강제). 필드 실존이라 validator 대상 보유.
- `assertTaintCensusMonotone(node, children)`(N6): `unanchored_unverified_count` < Σ자식 + 자기미검증(unverified/refuted/failed/unread) → throw(부모가 taint 낮추기 금지·`assertHonestyFold` 대칭).
- `reconcileBoundaries` 완결성(§13.3-3): seam 전수 커버 아니면 throw.

### 13.6 over-context 게이트 (N9·TOPO-5·C3 해소)
- `shouldAccumulate(node, trace): boolean` = `deterministicSubtreeSize(node,trace) > OVER_CONTEXT_BUDGET`. **★단일 canonical metric(v2.1·codex-F5)**: size =
  **서브트리 leaf 수 하나로 고정**(단위 명시·row_span/ground-byte 혼용 금지 — 두 metric이 같은 서브트리를 budget 안/밖으로 엇갈리게 판정하는 것 차단). `OVER_CONTEXT_BUDGET`
  (config·leaf-count 단위)+게이트 predicate/ordering(logic sha) 둘 다 §13.4 preimage에 fold. mixed-default = 구성-시 reject.
- **1:1 해소(TOPO-5)**: accumulation **frontier** 정의 = over-context 서브트리는 노드마다 누적(각각 의미노드), in-context 서브트리는 **frontier 노드 하나만** flat-read
  하고 그 아래는 `reduce_read_attempt="subsumed"`(의미노드 존재하나 판단은 frontier가 흡수). ∴ 불변식 = **"frontier 위/on 모든 뼈대 노드는 populated 의미노드 정확히 하나,
  아래는 subsumed(명시)"** — epoch 간 frontier가 LLM 출력에 안 흔들림(size가 결정론이라).
- **합성 프롬프트 봉투(C6·source-safety)**: 입력 = Layer-1 ground 필드 + 자식 `semantic_summary`/`character_*` 텍스트만. **raw cell value·formatCode·examples 금지**
  (leaf-reader.ts:26-32 대칭) + 구성-시 `assertSynthesisInputBounded` 단언. `reduce_prompt_sha256`=catalog 등록(CG-1·편집→키 회전).

### 13.7 음성대조 매트릭스 (전부 subject cardinality>0·falsifiable·상위 §7 "green≠옳은걸 쟀다")
| 게이트 | 양성(valid) | 음성(반드시 fail) |
|---|---|---|
| reconcile coverage | seam↔경계 매칭 → 전수 covered | seam≥1 && 경계=0 → `missed_by_llm`≥1(length>0 단언) |
| anchor 1:1 | seam1·경계1 → anchored | seam1·경계2 → 2번째 unanchored(dense-seam 통제) |
| 재귀 fingerprint | 비-최저 witness 변화 → 부모 재도출 | preimage서 child_contributions 제거 → 그 변화 미검출(fail) |
| child coverage | keys==det → ok | key 1개 drop → throw |
| boundary honesty (상태기계) | anchored+structural_location_only·unanchored+adversarial_* → ok | anchored+adversarial_*·unanchored+structural_location_only → throw / seed 노드 unanchored+unverified → throw / **unanchored+refuted가 seed 경계에 남음 → throw**(codex-F2) |
| taint monotone | 부모≥자식 → ok | 부모 축소 → throw |
| allowlist preimage | 키⊆allowlist → ok | top-level semantic_summary 키 주입 → throw / **nested(중첩) LLM 필드 주입 → throw**(codex 잔여: 중첩 음성대조 필수) |
| anchor 순서-안정(v2.1) | 인접 seam 11/12·row12 → seam12 매칭 | 탐욕이 row12→seam11 매칭 → 테스트 fail(codex-F3) |
| trace 완결성(v2.1) | trace 노드 수 == 뼈대 노드 수 | single-leaf/pass-through 누락 → 카디널리티 불일치 fail(codex-F4) |
| subsumed coverage(v2.1) | subsumed 노드 consumed=[] 허용 | subsumed 노드에 exact-coverage 요구 → false throw(codex-F1 회귀) |

### 13.8 빌드 순서(v2 확정) · 검증 루프
S1 타입·검증기·reconcile·fingerprint(§13.1~13.5·13.7 음성대조 전부·**LLM-0 by-construction**) → S2 mock `accumulateSemanticMap(trace, callLlm)`(bottom-up·frontier·
전량 unanchored→mock 적대재검증) → S3 over-context 게이트(§13.6) → S4 seed 투영(default-off·byte-parity·§6 정직 투영규칙+taint census) → 실 LLM=owner 승인/한도 회복 시.
각 S 후: ts clean·정적게이트·**full vitest 회귀0**·음성대조 fail 확인. behavior change 0(default-off·diff로 off 증명).

## 14. v2 재-교차검증 결과 (2026-07-01·**$ultracode-for-codex**·SOUND_WITH_REVISIONS)

owner 지시로 Family-1 검증 경로를 **Claude Workflow → codex-native `$ultracode-for-codex`**(gpt-5.5·xhigh·별도 OpenAI 쿼터 = Claude session-limit 무관)로 전환.
codex가 **자체 verify + 실 `tsx` 음성대조 probe + `npx vitest run`(4 reconstruct 테스트파일·63 pass)** 실행 → **거짓-green 아님**(v1 Claude workflow의 verify-크래시와 대조).

**판정 = SOUND_WITH_REVISIONS**(§13 방향 견고·대부분 v1 결함 닫음·narrow contract 수정만·redesign 아님). **closure**: N1·N3·N4·N7 **CLOSED**(★N4 = codex tsx probe로 "비-최저
witness 변화 → 부모 ground byte-동일·자식 해시 변화" **실증** = §4.2 교정·재귀 필요성 확정). N2·N5·N6·N9 **PARTIAL** → 아래 5 수정으로 닫음.

**신규 findings 5개 → 전부 §13에 v2.1 반영 완료**:
- **codex-F1 [HIGH] §13.6↔13.5** subsumed 노드 ↔ exact child coverage 충돌 → **topology_child_keys / consumed_child_judgment_keys 분리**·coverage는 누적 노드만(§13.2·13.5).
- **codex-F2 [HIGH] §13.2/13.5** verification 상태기계 비-fail-closed(refuted가 confirmed처럼 통과) → **합법 (anchor_status,verification,seedBound) 상태기계 + refuted seed 제외**(§13.5).
- **codex-F3 [MED] §13.3** greedy 매칭 순서 불안정 → **정확행 우선→최근접→canonical witness tie-break**(§13.3-2).
- **codex-F4 [MED] §13.1** trace가 merge 콜만 기록→leaf/pass-through 누락 → **전 노드 등록·카디널리티 단언**(§13.1).
- **codex-F5 [MED] §13.6** over-context 다중 metric → **단일 leaf-count metric**(§13.6).
- 음성대조 매트릭스(§13.7)에 5개 신규 통제 추가. allowlist는 **중첩(nested) 음성대조**를 빌드 시 추가(codex 잔여·구조는 closed typed preimage로 이미 방어).

**정직 잔여**(codex): Layer-2 코드 미존재=설계-계약 검증이지 구현 검증 아님. product 의미품질·적대검증기 품질·seed UX = **미입증**(설계 밖·재측정 금지 정합). **∴ §13 = 빌드 착수 가능
계약**(2-패밀리[v1] + codex 재검증[v2] 통과·owner 결정 3개 반영). 남은 건 owner 빌드 승인 → S1(mock 우선).
