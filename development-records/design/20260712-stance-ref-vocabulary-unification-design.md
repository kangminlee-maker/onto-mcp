# stance evidence-ref 어휘 단일화(H2) + 변형 사전 + 기록 시 정본화 (2026-07-12)

상태: **v1 기각·축소 (2026-07-12 4-렌즈 검증, gpt-5.6-sol@ultra ×4)** — 본문
§1-§2는 기록용 원안. 판정과 축소안은 §5(맨 아래)가 우선한다. 리뷰 원문:
세션 스크래치 design-review2/out1..4.md.
owner 방향 승인(2026-07-12, "결정론적 sidecar" 논의): 구축-시점 어휘 확장 +
유일-일치 가드 + 기록 시 정본화 조건 충족 형태 — 검증 결과 이 중 "기록 시
정본화"와 "packet 임베드"가 기각됐다.
상위: 20260712-format-rescue-ladder-design.md §3 H2 + §6 결정적 정규화 재론 조건.
resubmit(활성화 확정, 52d18bc)의 대체가 아니라 보완 — 결정 가능한 표기 변형은
반려 자체를 없애고, 결정 불가(라인범위·스니펫)는 resubmit이 계속 담당.

## 0. 실측 근거 (현재 코드의 이원화 — H2)

두 검증기가 같은 개념의 허용 집합을 **다른 알고리즘으로** 만든다:

| 축 | submit-시 (runtime-submit-context.ts:187-352) | on-disk (issue-artifact-runtime.ts:4340-4524) |
|---|---|---|
| 입력 | packet의 projection YAML 재파싱 | 정본 artifact + executionPlan |
| 경로 rooting | artifactRef 원문 + basename (2종, :156-166) | session상대 + project상대 + basename (3종, :4290-4306) |
| finding anchor | 요청-lens의 finding을 **전 이슈에 합집합** (:237→309) | 이슈의 surface_finding_ids만 (:4473-4483) |
| bare relation id | issue.relation_refs만 bare 등록 (:330대) | graph-endpoint·dependency도 bare 등록 (:4396-4404, 4436-4437) |

결과: submit 통과 → on-disk 거부(합집합 finding anchor), submit 거부 →
on-disk 허용(bare rel-id) 양방향 divergence가 실존. 실측 반려 `rel-007`
(bare), `.onto/review/<sid>/...#rel-002`(rooting)는 이 비대칭의 직접 산물.

## 1. 확정 구조 — "packet이 재료가 아니라 답을 나른다"

경계 제약: submit-측 executor는 packet 텍스트만 가진다(정본 artifact 접근
없음). 따라서 단일화의 유일한 건전 지점은 **packet 빌드 시점에 정본
builder가 계산한 허용 목록 자체를 packet에 실어 보내는 것**이다.

```
[packet 빌드, per unit(lens)]  단일 builder가 정본 artifact에서
  이슈별 canonical 허용 ref 목록 계산 → packet에 명시 섹션으로 렌더
       ↓ (모델은 이 목록을 '보고 베낀다' — 프롬프트 개선 부수효과)
[submit 검증]   packet의 명시 섹션 파싱 → 공유 확장 함수로
  {허용 집합(변형 포함), 변형→정본 사전} 생성 → 멤버십 검사
       ↓ 통과 payload의 evidence_refs를 변형→정본 사전으로 재작성(정본화)
[artifact 기록] 정본 표기만 기록됨
[on-disk 재검증] 같은 builder + 같은 확장 함수 → 구성상 parity
```

## 2. 코드 변경 (정확 명세)

### 2.1 신규 공유 모듈 `src/core-runtime/review/stance-evidence-vocabulary.ts`

순수 함수 2개(HEAVY import 금지 — path/문자열 연산만; cli↔review 순환 차단):

```ts
export interface StanceRefTarget {
  /** 정본 표기 — anchored ref는 `${basename}#${anchor}`, ledger 원문 ref는 자신. */
  canonical: string;
  /** anchored ref만: 변형 생성용. raw ref는 undefined. */
  anchored?: { artifactKey: "finding_ledger" | "finding_relation_graph" | "issue_ledger" | "lens_findings"; anchor: string };
}
export interface StanceArtifactPathTable {
  /** artifactKey → { session_relative, project_relative, basename }.
   * basename 충돌 시(현행 4종 artifact에선 불가) 충돌 항목은 basename 변형 미생성. */
  [artifactKey: string]: { session_relative: string; project_relative: string; basename: string };
}
export function expandStanceAllowedRefs(args: {
  targets: readonly StanceRefTarget[];
  paths: StanceArtifactPathTable;
}): { allowed: Set<string>; variantToCanonical: Map<string, string> } 
```

확장 정책(전부 이 함수 한 곳 소유 — 두 검증기의 유일 정책 소스):
- raw target: 자신 1개.
- anchored target: `{session_relative|project_relative|basename}` × `#anchor`
  6변형(경로 3 + 각 `#anchor`) + **bare anchor** — 단, bare는 해당 이슈
  target 집합 내에서 anchor가 유일할 때만(`유일-일치 가드`; 충돌 시 bare
  미등록, 나머지 변형은 유지).
- 모든 변형은 `variantToCanonical`에 정본으로 매핑(정본 자신도 identity 등록).
- 반환 `allowed` = 사전의 key 전체. 재해석·근사 매칭 없음 — 정확 일치만.

### 2.2 단일 builder (issue-artifact-runtime.ts)

기존 on-disk builder(4340-4524)를 2단 분해(순수 리팩터 + 정책 치환):
- `collectStanceRefTargets(args) → Map<issueId, Map<lensId, StanceRefTarget[]>>`
  — 기존 수집 로직에서 **variant 생성 호출(addPathRefVariants)을 제거**하고
  canonical target만 수집. 수집 범위는 기존 on-disk 범위 그대로(이슈-엄격
  finding anchor, graph-endpoint relation 포함) — on-disk가 권위.
- 검증용 집합: `expandStanceAllowedRefs`로 확장. `addPathRefVariants`
  (4290-4306)는 stance 경로에서 삭제(다른 소비자 있으면 유지, grep으로 확정).

### 2.3 packet 임베드 (issue-artifact-runtime.ts:1601 renderIssueStanceInputProjectionSection)

projection 섹션 뒤에 신규 섹션 렌더(단위 packet은 per-lens이므로 요청 lens
것만):

```
## Runtime Issue Stance Allowed Evidence Refs
targets(issue별 canonical 목록)과 artifact_paths(경로표)를 YAML로 직렬화
```

- 내용: `artifact_paths: StanceArtifactPathTable` + `issues: [{issue_id,
  refs: [{canonical, artifact_key?, anchor?}]}]`. 변형은 싣지 않는다(확장은
  소비 측 공유 함수) — packet 크기 통제 + 모델에게는 정본만 노출.
- 모델 지시 1줄: "evidence_refs는 아래 목록의 표기를 그대로 복사하라."

### 2.4 submit 소비 (runtime-submit-context.ts)

`parseRuntimeIssueStanceSchemaContext`:
- 신규 섹션이 **있으면**: 그것만 파싱 → `expandStanceAllowedRefs` →
  `issue_evidence_refs`(기존 필드명 유지, 값=allowed 배열) +
  신규 `issue_ref_canonicalizer: Map<issueId, Map<variant, canonical>>`.
  기존 projection-파생 로직은 실행하지 않는다.
- **없으면**(구 packet — halted 세션 resume 호환): 기존 파생 로직 그대로
  (바이트-동일 fallback), canonicalizer는 identity(빈 Map → 재작성 생략).
- 스키마 컨텍스트 타입 `RuntimeSubmitIssueStanceSchemaContext`에
  canonicalizer 필드 추가(옵셔널) — 스키마 생성(enum 아님)은 무변경.

### 2.5 정본화-재작성 (structured-output-tools.ts:860-870)

`normalizeIssueStanceResponseSubmitArgs`의 멤버십 검사 자리:

```ts
const mapped = canonicalizer?.get(issueId)?.get(evidenceRef);
if (allowedRefs && !allowed.has(evidenceRef)) throw ...  // 기존 반려 문형 유지(분류기 계약)
return mapped ?? evidenceRef;  // 통과 ref를 정본으로 재작성해 payload에 반영
```

- 반려 메시지 문형은 **불변**(unit-resubmit 분류기·resubmit 오류명세가 이
  문형에 앵커됨 — unit-resubmit.ts:61-66).
- resubmit 오류명세의 allowed 목록은 canonical만 나열(변형 포함 allowed가
  아니라 packet 임베드의 canonical 목록을 전달) — 가독성·복사 정확도.

### 2.6 on-disk 검증 (issue-artifact-runtime.ts:4526-4605)

`knownStanceEvidenceRefs` 구축을 2.2의 `collectStanceRefTargets` +
`expandStanceAllowedRefs`로 치환. 검사 로직(4596-4604)은 무변경. 정본화된
새 artifact는 canonical만 담으므로 항상 통과; 구 artifact(혼합 표기)도
확장 집합이 기존 대비 초집합이라 회귀 없음(아래 2.8-③이 증명).

### 2.7 범위·비변경 목록

- stance만. deliberation/synthesis는 동일 패턴 후속 diff(§4).
- 스키마(enum) 무변경, settings 무변경(노브 없음 — packet 섹션 존재가
  스위치, 구 packet은 legacy 경로), cert 하니스 무변경.
- 기존 `addPromptRefVariants`(submit측)는 legacy fallback 전용으로 존치.

### 2.8 검증 (명령 수준)

1. 단위(신규 모듈): 6변형 생성, bare 유일-일치/충돌 미등록, identity 매핑,
   basename 충돌 가드.
2. **parity 테스트**(핵심): fixture 세션에서 (a) packet 임베드→submit측 확장
   집합과 (b) on-disk 확장 집합이 이슈×lens 전 조합에서 집합-동일함을 단언
   (cardinality>0 선단언 — vacuous 방지).
3. 회귀: on-disk 신규 집합 ⊇ 기존 집합(기존 builder를 테스트에 임시 보존해
   포함관계 단언 — 구 artifact 호환 증명), submit 신규 집합 ⊇ 기존 집합.
4. normalize 재작성: 변형 제출→정본 기록, 미등록 제출→기존 문형 반려.
5. legacy fallback: 섹션 없는 packet → 기존 파생과 바이트-동일 컨텍스트.
6. e2e: mock 리허설 1회 + (owner 지시 시) fable5 stance-heavy 라이브 1
   attempt — 반려율 변화와 `rel-007`류 변형의 정본 기록 관측.

## 3. 실측 12건 기대 효과

커버(반려 소멸): bare anchor ~1, rooting 변형 ~1-2. 비커버(resubmit 몫):
라인범위 6+, 스니펫 1, 괄호주석 1(파서 규칙은 의도적 제외 — 경계 애매).
추가로 packet에 정본 목록이 명시되므로 모델의 자작 표기 자체가 줄어들
것으로 기대(프롬프트 효과 — 라이브 1 attempt로 관측).

## 4. 후속/owner 잔여

- deliberation(`allowed_evidence_refs`)·synthesis(`allowed_source_refs`)
  동일 패턴 확장 — stance parity 실증 후.
- 괄호주석형 파서 규칙 채택 여부(기본 불채택).
- format-rescue-ladder §4의 cert v2·준승인 tier 결정은 본 diff와 독립.

## 5. 검증 판정 (v1 → 기각·축소, 2026-07-12)

### 기각된 구성요소와 사유 (재제안 금지; 재론 조건 병기)

- **기록 시 정본화(2.5) 기각**: variant→canonical이 함수가 아니다 — 한
  이슈에 같은 artifact의 anchor가 2개면 path-only ref(`finding-ledger.yaml`,
  현행 유효)가 복수 canonical에 대응하고, 임의 선택은 **모델이 고르지 않은
  provenance를 런타임이 기록**하는 것(비저자 근거 재선택 — salvage-first
  기각과 같은 사유). raw ref와 생성 변형의 key 충돌도 동급. 재론 조건:
  전역 유일-매핑만 사전 등재 + 충돌 key는 identity + host-B 경로 커버.
- **packet 임베드(2.3-2.4) 기각(현 형태)**: renderer는 lensId를 받지 않고 A
  경로는 projection을 lens 루프 밖에서 1회 생성·전 lens 재사용, host-B
  (`reviewRound`/`reconstructStancePacket`)는 별도 생산자 — per-lens 임베드는
  3개 생산 좌석 재구조를 요구하는 대형 diff. 크기도 이슈×lens ref로 무계
  (예비 산정: projection ~184KB에 lens당 +71-98KB). host-B는 submit 도구를
  거치지 않아 "정본만 기록" 자체가 성립 불가.
- **효과 추정 정정**: 실측 12건 중 직접 구제 확정은 bare `rel-007` 1건뿐.
  `.onto/.../…#rel-002`형은 양측이 이미 허용하는 project-relative 표기 —
  반려 원인은 rooting이 아니라 해당 relation의 issue-provenance 밖 인용으로
  추정(원 artifact 소실로 재현 불가). v1의 "2-3건 커버" 주장은 과대.

### 살아남은 것 (축소안 — 후속 결정 대상)

- **K1. submit-측 파생을 on-disk 정책에 정렬** (소diff, H2의 핵심만):
  runtime-submit-context의 이슈별 집합을 on-disk와 같은 정책으로 —
  (a) 요청-lens finding anchor의 전-이슈 합집합 제거(이슈-엄격),
  (b) graph-endpoint/dependency relation의 bare id 등록(on-disk와 대칭 —
  `rel-007` 클래스 반려 소멸). packet 임베드·정본화·신규 모듈 없음.
  parity 테스트는 실제 packet 렌더→파싱 경로 + negative control
  (타 이슈/타 lens 전용 ref 부재 단언) + 비-vacuous 선단언으로.
- **K2. resubmit×manifest hash 잠복 버그 수정** (확정, 출하물 영향):
  resubmit이 packet을 수정하면서 manifest packet_sha256(등록 :3503, 검증
  :3362 fail-close)을 갱신하지 않음 → 오류명세 주입 후 halt된 세션은
  `onto_review_continue`가 packet_hash_mismatch로 차단. 수정: 명세 주입
  시점에 manifest hash 갱신(또는 검증기가 marker-strip 후 비교). 벤치
  경로(무 continuation)는 무영향.
- K3(선택): allowed 목록의 모델-가시 노출은 packet 임베드가 아니라
  resubmit 오류명세(이미 canonical 나열)가 담당 중 — 추가 조치 불요.
