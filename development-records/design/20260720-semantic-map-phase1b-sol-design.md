<!-- sol 격리 병렬 설계 산출 (gpt-5.6-sol@xhigh, 2026-07-20T02:45:58.089Z, 1048s) -->

# Phase 1b 멀티파일 set-tier 및 relational seam 상세 설계

- 문서 상태: 제안
- 기준일: 2026-07-20
- 대상: `onto-mcp reconstruct`의 code semantic-map
- 목표: 단일 파일 단위 semantic-map을 파일 집합·디렉터리·파일 root를 포괄하는 set-tier로 확장하고, import 관계를 set 경계의 근거로 제공한다.
- 완료 정의: 옵트인 OFF와 스프레드시트 산출물이 기존 바이트를 유지하고, ON 경로에서 멀티파일 topology·import 관계·set 의미 투영이 artifact-backed 상태로 생성·재개·검증되며, 실제 provider를 사용한 2파일 의미 수용 게이트를 통과한다.

## 1. 범위와 경계

### 1.1 포함 범위

1. code semantic-map이 완료된 복수의 실재 observation을 하나의 파일 집합으로 조립한다.
2. 파일 경로 계층에서 set 노드를 만들고, 각 파일의 기존 span root를 set 트리에 graft한다.
3. 코드 관찰 단계에서 정형 import specifier를 추출한다.
4. set 조립 단계에서 import 대상을 관찰 집합 안의 파일로 보수적으로 해석한다.
5. import 관계를 정렬·중복 제거하고 해당 관계를 소유할 최저 공통 set 노드에 배치한다.
6. set 노드에 대해 유계 LLM synthesis를 실행한다.
7. set-tier 결과를 실재 observation 배열과 분리된 sidecar 파티션에 기록한다.
8. resume, aggregate fingerprint, authored artifact reuse, preflight, census를 set-tier까지 확장한다.
9. set 결과를 synthetic observation으로 위장하지 않고 별도 set-scoped prompt surface로 후속 semantic seed 경로에 제공한다.

### 1.2 비포함 범위

1. 기존 span reducer를 region-union 일반 엔진으로 전면 재작성하는 작업.
2. 스프레드시트 semantic 경로 변경.
3. `semantic_map_code` 기존 OFF/ON 의미 변경.
4. 공유 계약 버전 또는 공유 budget 상수의 bump.
5. 실행 환경의 전체 module resolution을 재현하는 resolver.
6. 동적 import, 런타임 생성 경로, package alias, 외부 package 내부까지 추적하는 dependency graph.
7. 여러 source root, symlink, submodule 및 중첩 repository의 의미를 임의로 결정하는 작업.
8. 문서 관찰에 파일별 semantic-map root가 존재한다고 가정한 문서집합 지원.

마지막 항목 때문에 Phase 1b의 최초 완료 주장은 `멀티파일 code set-tier`로 제한한다. 문서집합으로의 일반화는 owner가 별도 근거와 파일별 projection 계약을 제공하거나 승인한 뒤 확장한다.

## 2. 권한과 source/projection 경계

| 대상 | canonical owner | 역할 |
|---|---|---|
| 경로 정규화, topology 조립, partition 검증 | runtime | 결정론적 구조 authority |
| import AST 추출 | observation/runtime adapter | 원시 관계 관찰 authority |
| import 대상 해석 | set assembler/runtime | 현재 관찰 집합에 대한 결정론적 projection |
| relation 정렬·중복 제거·LCA 배치 | runtime | set-node ground 생성 |
| set 노드 의미 요약 | LLM | semantic projection |
| set semantic seed 저작 | LLM | set-scoped semantic contribution |
| cap, 호출 수요, fingerprint, resume 검증 | runtime | 실행·재사용 authority |
| sidecar 및 census 직렬화 | runtime | canonical artifact |
| Markdown 또는 prompt rendering | runtime | canonical artifact의 유계 projection |

runtime은 LLM 출력을 의미적으로 보정하거나 누락을 추론해 채우지 않는다. 스키마 실패·출력 절단·부모 노드 입력 부족은 구조적으로 실패시키고, LLM 의미 품질은 live 의미 게이트에서 판정한다.

## 3. 제안 개념 모델

```text
SemanticMapSetTier
├── SetTopology
│   ├── SetRegion(path)
│   ├── 하위 SetRegion
│   └── 기존 파일 SpanRegion root
├── SetImportInventory
│   ├── observed import
│   ├── resolved relation
│   └── resolution/omission census
├── SetTierNodeGround
│   ├── child projections
│   ├── owned relations
│   └── census
├── SetTierNodeProjection         ← LLM 저작
├── SetTierSeedProjection         ← 별도 set-scoped prompt 결과
└── SetTierResumePartition        ← observation resume와 분리
```

region 판별 합집합은 상위 프레임을 따른다.

```ts
type SemanticMapRegion =
  | { kind: "span"; /* 기존 파일·span 좌표 */ }
  | { kind: "set"; path: string };
```

파일 root는 별도 `file-root` region kind를 만들지 않는다. 기존 span root를 set 노드의 자식으로 연결한다. 이는 새 개념 수를 줄이고 기존 파일 내부 좌표 authority를 보존한다.

## 4. 설계 결정

### P1B-DD01 — 별도 옵트인 `semantic_map_code_set_tier`

**결정**

- Phase 1b는 기존 `semantic_map_code`와 분리된 boolean 설정 `semantic_map_code_set_tier`로 활성화한다.
- 키 부재와 `false`는 OFF다.
- 기본값은 설정 해석 authority 한 곳에서만 정의하고 사용처에 인라인하지 않는다.
- `semantic_map_code_set_tier=true`이면서 `semantic_map_code`가 false이면 암묵적으로 1a를 활성화하지 않고, `requires_semantic_map_code` 구조 오류로 종료한다.
- 최종 키 이름과 설정 스키마 변경은 owner 승인을 받아야 한다.

**근거**

현재 code 분기 전체가 `codeEligible` 게이트로 감싸져 있으므로 동일 형태의 신규 게이트가 OFF 미접촉을 보장할 수 있다. `processCodeObservation` 내부 상태도 현재 observation 로컬이어서 신규 set 경로를 명시적으로 분리해야 한다. 정찰 앵커 [8].

**기각 대안**

- 기존 `semantic_map_code=true`만으로 set-tier까지 자동 실행: 기존 옵트인의 비용·출력·재사용 의미를 바꾸고 G-OFF를 위협하므로 기각한다.
- set-tier가 1a를 암묵적으로 활성화: 사용자가 요청하지 않은 수백 회 LLM 호출을 유발할 수 있어 기각한다.
- 설정 없이 파일 수로 자동 활성화: 기본 OFF 규범과 정면 충돌하므로 기각한다.

---

### P1B-DD02 — 기존 span core를 우회하는 병렬 set-tier reducer

**결정**

`ReduceCoordAdapter`를 일반화하지 않고 신규 병렬 reducer를 둔다.

제안 모듈 책임은 다음과 같다.

```text
comprehension-reduce-set
├── normalizeSetPath
├── buildSetTopology
├── validateSetPartition
├── graftFileRoot
├── assignRelationOwner
└── reduceSetHierarchy
```

기존 `HierarchyFoldNode`의 leaf/children 재귀 shape은 재사용할 수 있지만, 기존 span 정렬·overlap·인접성 판단 코드는 set partition에 호출하지 않는다. set-tier walk는 파일별로 이미 완료된 root projection을 opaque leaf로 보고 set 노드만 post-order로 합성한다.

**근거**

기존 core는 span 시작·끝 정렬, overlap, `spanEnd(a)+1===spanStart(b)` 인접성을 하드코딩하고 있다. code adapter의 `containerEquals`도 파일 동일성을 요구하므로 cross-file 결합이 불가능하다. 반면 set 관계는 구간 인접이 아니라 경로-prefix 포함 관계다. 정찰 앵커 [2].

**기각 대안**

- 경로를 합성 정수 좌표로 바꾸어 기존 span reducer 사용: prefix 포함과 sibling partition을 정수 인접성으로 위장하며 오류 메시지·검증 의미도 거짓이 되므로 기각한다.
- 기존 `ReduceCoordAdapter`를 region union으로 즉시 일반화: 1a의 핵심 경로를 변경하고 OFF 바이트 및 기존 의미 회귀 범위를 확대하므로 Phase 1b에서는 기각한다.
- 모든 파일 subtree를 다시 하나의 span container로 평탄화: 파일 경계를 없애 relational seam의 canonical seat를 잃으므로 기각한다.

---

### P1B-DD03 — set partition은 prefix containment와 전단사 membership으로 fail-closed 검증

**결정**

set partition 검증기는 다음을 모두 강제한다.

1. 모든 경로는 source-set 상대 경로의 단일 canonical 표현이어야 한다.
2. 절대 경로, 빈 segment, `.`·`..` segment, 정규화 후 충돌하는 경로는 거부한다.
3. 후보 code observation의 파일 root는 정확히 한 번 나타나야 한다.
4. 파일 root는 자신의 canonical path를 포함하는 가장 가까운 set parent에만 연결된다.
5. non-root set 노드는 정확히 하나의 parent를 가진다.
6. set child path는 parent path의 strict prefix descendant여야 한다.
7. sibling set path는 서로 동일하거나 조상·후손일 수 없다.
8. 파일과 디렉터리가 동일 canonical path를 점유할 수 없다.
9. 모든 노드는 root set에서 도달 가능해야 한다.
10. candidate observation 집합과 graft된 파일 root 집합은 동일해야 한다.
11. 누락·중복·orphan·cycle·경로 충돌 중 하나라도 있으면 set LLM 호출 전에 실패한다.

**근거**

상위 프레임이 span 연속성의 fail-closed 대칭물로 경로-prefix 포함과 중복 없음을 요구한다. 기존 span 검증을 재사용할 수 없다는 정찰 [2]의 결과를 구조적으로 반영한다.

**기각 대안**

- 중복 시 첫 항목 채택: 관찰 누락을 숨기므로 기각한다.
- 유효한 subset으로 자동 복구: repo 전체 map처럼 보이는 부분 map을 만들므로 기각한다.
- 경로 문자열의 단순 lexicographic 정렬만 검사: prefix·도달성·전단사 membership을 증명하지 못하므로 기각한다.

---

### P1B-DD04 — 파일 tree는 persisted inventory에서 결정론적으로 재구성

**결정**

메인 observation 루프에 전체 `trace`나 `nodesByKey` Map을 장기 보관하지 않는다. post-loop에서 다음 입력으로 파일별 구조 tree를 결정론적으로 재구성한다.

1. persisted observation inventory
2. 기존 per-observation fingerprint
3. `projectionByObservation`의 완료된 파일 root projection
4. 현재 code tree builder의 결정론적 규칙

재구성된 tree는 해당 observation의 저장 fingerprint·root key와 일치해야 한다. 일치하지 않으면 그 observation을 임의로 제외하지 않고 set assembly를 중단한다.

**근거**

현재 `processCodeObservation`의 `trace`와 `nodesByKey`는 로컬에서 폐기된다. 메모리에 추가 보관하거나 persisted inventory에서 재구성하는 갈림길이 존재한다. 정찰 앵커 [8]. 재구성 방식은 대규모 파일 수에서 메모리 체류를 줄이고 resume에서도 동일 경로를 사용할 수 있다.

**기각 대안**

- 메인 루프에 모든 파일 tree Map 보관: 구현은 짧지만 파일 수·파일 크기에 비례해 메모리가 누적되고 process 재시작 후 resume에 사용할 수 없어 기각한다.
- set 조립을 위해 1a LLM을 재실행: 비용·비결정성이 증가하고 기존 완료 projection을 무시하므로 기각한다.
- projection만 연결하고 구조 tree 일치 검증 생략: 잘못된 파일 root가 set에 graft되어도 검출하지 못하므로 기각한다.

---

### P1B-DD05 — import는 전용 정형 관찰 필드로 추출

**결정**

`signature_line`을 파싱하지 않고 code observation inventory에 전용 import 목록을 추가한다.

```ts
interface ObservedCodeImport {
  from: string;
  to_specifier: string;
  resolved_in_set: null;
}

interface CodeImportInventoryCensus {
  import_nodes_seen: number;
  imports_recorded: number;
  duplicates_observed: number;
  omitted: number;
  omission_reasons: Record<string, number>;
}
```

- `from`은 canonical set-relative observation path다.
- `to_specifier`는 AST adapter가 import statement에서 추출한 module/source specifier다.
- 하나의 statement에 복수 specifier가 있으면 별도 record로 정규화한다.
- 관찰 시점에는 다른 observation 집합을 알 수 없으므로 `resolved_in_set`은 null이다.
- set assembler가 원본 record를 변형하지 않고 resolved record를 새로 만든다.
- 추출 불가, 지원하지 않는 import form, 한도 초과를 빈 배열과 동일시하지 않고 census reason으로 남긴다.
- 필드 emission은 새 set-tier 옵트인 경로 안에서만 수행한다.

**근거**

TS_KIND/PY_KIND에 import node 분류는 있지만 `CodeSymbolSpan`에는 specifier 필드가 없고, 140자 `signature_line`은 비구조화·절단 가능하다. `symbolNameOf`도 import specifier authority가 될 수 없다. 정찰 앵커 [6].

**기각 대안**

- `signature_line` 정규식 파싱: 언어 문법과 절단에 의존하고 silent mis-resolution을 만들므로 기각한다.
- import를 일반 symbol name에 저장: symbol과 module specifier의 개념을 혼합하므로 기각한다.
- set 조립 때 소스 전문을 다시 파싱: observation authority를 우회하고 resume 입력이 달라질 수 있어 기각한다.

---

### P1B-DD06 — 보수적·관찰집합 한정 import resolver

**결정**

초기 resolver는 현재 set에 실제로 존재하는 파일 중 유일하게 매칭되는 경우에만 `resolved_in_set`을 설정한다.

canonical relation은 다음 형태다.

```ts
interface SetImportRelation {
  relation_id: string;
  from: string;
  to_specifier: string;
  resolved_in_set: string | null;
}
```

처리 순서:

1. `from`과 `to_specifier` 원문을 보존한다.
2. parser family에 따라 후보 경로 key를 결정론적으로 생성한다.
3. 후보를 canonical member path 집합과 비교한다.
4. 정확히 하나만 일치하면 해당 파일 path를 기록한다.
5. 0개 또는 2개 이상이면 null을 유지한다.
6. `(from, to_specifier, resolved_in_set)` 기준으로 중복 제거한다.
7. 위 tuple로 정렬한 뒤 relation ID를 결정론적으로 파생한다.

초기 지원 범위:

- TS_KIND 계열: 상대 path specifier에 한해 exact path와 관찰된 파일의 마지막 suffix를 제거한 key를 비교한다.
- PY_KIND 계열: AST가 제공한 module specifier를 path segment로 정규화할 수 있는 정적 import만 동일 방식으로 비교한다.
- package alias, 환경 설정 기반 alias, 동적 import, 외부 package, 복수 후보는 해석하지 않는다.
- resolver가 이해하지 못한 form도 import inventory에서는 보존한다.

필수 resolution reason:

- `resolved_unique`
- `external_or_bare`
- `unsupported_form`
- `no_member_match`
- `ambiguous_member_match`
- `inventory_truncated`
- `parse_unavailable`

reason은 relation 자체를 임의 변경하지 않고 별도 resolution census에서 relation ID와 연결한다.

**근거**

`resolved_in_set`은 파일 단위 관찰 시점에 계산할 수 없고 set 조립 시점에만 계산할 수 있다. 정찰 앵커 [6]. 실제 실행환경의 module resolution 정보를 패킷이 제공하지 않으므로 환경 동등성을 가정하지 않는다.

**기각 대안**

- 모든 bare specifier를 set root 상대 경로로 간주: 외부 package와 내부 파일을 혼동하므로 기각한다.
- 첫 번째 후보를 채택: ambiguity를 숨기므로 기각한다.
- `resolved_in_set`이 null인 relation 삭제: 외부·미지원·불명확 상태를 silent drop하므로 기각한다.
- 실행환경 전체 resolver 재현: 별도 authority와 config fingerprint 설계가 필요한 확장으로 Phase 1b에서 기각한다.

---

### P1B-DD07 — relation은 최저 공통 set 노드가 한 번만 소유

**결정**

- resolved relation의 owner는 `from` 파일과 `resolved_in_set` 파일을 모두 포함하는 최저 공통 set 노드다.
- unresolved relation의 owner는 `from` 파일을 직접 또는 간접 포함하는 가장 가까운 set 노드다.
- 같은 relation은 하나의 canonical set-node ground에만 저장한다.
- 상위 노드는 하위 relation 전문을 복제하지 않고 child relation census만 받는다.
- LLM-visible `relations`는 canonical 정렬 후 set별 prompt cap까지 제공한다.
- cap을 넘긴 relation은 `total`, `exposed`, `omitted`, `omission_reason=relation_prompt_cap`으로 기록한다.
- canonical sidecar relation inventory는 전체 inventory cap 이내의 모든 relation을 보존한다. 전체 inventory cap을 넘으면 부분 semantic set map을 만들지 않고 preflight에서 set-tier를 중단한다.

**근거**

import 관계를 모든 조상 노드에 복제하면 prompt와 fingerprint가 파일 수·깊이에 곱으로 증가한다. LCA ownership은 관계가 실제로 경계를 가로지르는 최소 tier에서 한 번만 의미 근거가 되게 한다.

**기각 대안**

- 모든 관계를 root에만 배치: 하위 디렉터리 경계의 의미를 잃고 root prompt를 과밀하게 하므로 기각한다.
- 모든 조상에 복제: 비용과 중복이 증가하므로 기각한다.
- cap 초과 relation을 알림 없이 절단: census 정직 공시 규범을 위반하므로 기각한다.

---

### P1B-DD08 — observation sidecar와 분리된 최상위 set-tier 파티션

**결정**

현재 `observations` 배열의 “1 row = 1 실재 observation_id” 불변식을 유지하고, sidecar에 optional top-level `set_tier`를 추가한다.

```ts
interface ReconstructSemanticMapSetTierSidecar {
  schema_version: string;
  status:
    | "complete"
    | "not_applicable"
    | "skipped_capacity"
    | "failed_structure"
    | "failed_provider";

  input_fingerprint: string;
  member_observation_ids: string[];

  topology: SetTopologyArtifact;
  relations: SetImportRelation[];
  relation_census: SetRelationCensus;

  nodes: SetTierNodeResult[];
  root_projection?: ExistingSemanticMapProjection;
  seed_projection?: ExistingSemanticSeedProjection;

  execution_census: SetTierExecutionCensus;
  omission_census: SetTierOmissionCensus;
}
```

- OFF이면 필드 자체를 생성하거나 직렬화하지 않는다.
- set node에 synthetic observation ID를 발급하지 않는다.
- `member_observation_ids`는 실재 observation ID만 포함한다.
- set node identity는 canonical set path와 node fingerprint가 소유한다.
- status가 `complete`일 때만 `root_projection`과 `seed_projection`을 downstream에서 사용할 수 있다.
- `not_applicable`은 후보 code observation이 2개 미만인 경우에만 허용한다.
- capacity/provider failure를 `not_applicable`로 낮추지 않는다.

**근거**

현재 resume 검증과 sidecar row는 observation ID 매칭을 전제로 하며 unknown·duplicate·missing ID를 거부한다. set node를 observations 배열에 넣으면 해당 불변식을 깨뜨린다. 정찰 앵커 [5].

**기각 대안**

- `observation_id="set:..."` synthetic row 추가: 기존 resume validator와 artifact 의미를 동시에 깨므로 기각한다.
- 각 파일 observation row에 같은 set 결과 복제: canonical source가 여러 개가 되고 재사용 판정이 모호해져 기각한다.
- set 결과를 sidecar 밖 임시 메모리에만 유지: resume와 artifact truth를 충족하지 못하므로 기각한다.

---

### P1B-DD09 — set-tier 전용 resume validation

**결정**

resume은 두 파티션으로 검증한다.

```text
기존 observation resume validation
+
신규 set-tier resume validation
```

set-tier validation은 다음을 확인한다.

1. sidecar schema version
2. 전체 input fingerprint
3. member observation ID 집합의 정확한 일치
4. topology의 path·parent·file membership
5. relation inventory 및 relation census digest
6. set node path 중복·unknown path·missing node
7. node별 input fingerprint
8. child projection fingerprint
9. prompt contract digest와 LLM-visible cap 값
10. 완료 node의 출력 스키마
11. root 및 seed projection의 status 일관성

재사용 정책:

- 전체가 일치하면 완료 set-tier를 재사용한다.
- 전체 fingerprint는 달라도 node input fingerprint가 정확히 일치하는 완료 node는 재사용할 수 있다.
- malformed·unknown·duplicate node는 사용하지 않는다.
- sidecar 불일치가 현재 입력의 구조 오류를 뜻하지 않으면, 해당 set partition만 폐기하고 현재 persisted inventory에서 다시 조립한다.
- 기존 observation resume 결과는 set partition 오류 때문에 폐기하지 않는다.
- 재구축 사실과 불일치 reason을 validation artifact에 기록한다.

**근거**

기존 resume 경로는 observation ID 기반이므로 set path identity를 같은 검증기에 억지로 넣을 수 없다. 정찰 앵커 [5].

**기각 대안**

- aggregate fingerprint만 같으면 set block 재사용: 부분 node·prompt cap·relation 불일치를 검출하지 못하므로 기각한다.
- set block 하나가 잘못되면 모든 per-file LLM 결과 폐기: 불필요한 비용을 유발하므로 기각한다.
- 잘못된 set node를 runtime이 의미적으로 보정: artifact truth를 훼손하므로 기각한다.

---

### P1B-DD10 — 신규 set-scoped prompt surface와 seed 슬롯

**결정**

기존 observation prompt에 synthetic payload를 추가하거나 `mergeSemanticSeedProjections`를 observation 간 merge로 재해석하지 않는다. 다음 두 prompt contract를 code set-tier 전용으로 신설한다.

1. `code-set-node-synthesis`
   - 입력: set path, direct child projection 전부, 해당 set이 소유한 bounded relations, census
   - 출력: 기존 1a 파일 root projection과 동일한 semantic projection 타입
2. `code-set-seed-synthesis`
   - 입력: complete root projection, bounded root/context relations, 전체 member·omission census
   - 출력: 기존 downstream이 소비하는 semantic seed projection 타입

후속 입력 envelope는 observation과 set을 구별한다.

```ts
interface SemanticSeedBundle {
  observations: ExistingObservationSeedSlot[];
  set_tier?: {
    set_fingerprint: string;
    projection: ExistingSemanticSeedProjection;
    census: SetTierSeedCensus;
  };
}
```

- 기존 `observations` 배열의 의미와 직렬화는 변경하지 않는다.
- set seed는 정확히 한 set-scoped invocation으로 생성한다.
- set-tier OFF에서는 기존 prompt builder를 그대로 사용한다.
- 새 prompt contract는 CG-1 전역 카탈로그에 등록하지 않고 code set-tier 로컬 digest를 fingerprint에 직접 fold한다.
- 패킷에 기존 projection의 정확한 타입명이 없으므로 구현 시 실제 1a type authority를 찾아 동일 타입을 직접 참조해야 한다. 표현력이 부족한 것이 확인되면 임의 필드를 추가하지 않고 owner 결정으로 되돌린다.

**근거**

현재 seed projection merge는 한 스프레드시트 observation 안의 컬럼 merge일 뿐이고, prompt 주입도 “실재 observation ID 1개 = payload 슬롯 1개” 구조다. 여러 observation을 포괄하는 set node를 넣을 기존 슬롯이 없다. 정찰 앵커 [7].

**기각 대안**

- set을 가짜 observation으로 추가: sidecar·resume·prompt 슬롯의 실재 observation 불변식을 깨므로 기각한다.
- 모든 observation prompt에 root set map 반복 주입: 호출 수와 token 사용이 observation 수에 비례해 증가하므로 기각한다.
- `mergeSemanticSeedProjections`를 cross-observation merge로 확장: 기존 spreadsheet 내부 의미와 새 set 의미를 혼합하므로 기각한다.
- 전역 prompt catalog 등록: 무관한 kind fingerprint까지 회전시키므로 기각한다.

---

### P1B-DD11 — set node synthesis 호출 최소화와 의미 비변형 passthrough

**결정**

set node가 다음 중 하나를 만족할 때만 LLM synthesis를 요구한다.

1. direct child가 둘 이상이다.
2. 해당 set node가 하나 이상의 relation을 소유한다.

그 외 unary set node는 child projection을 의미 변경 없이 전달하고 scope/path metadata만 runtime projection으로 감싼다. runtime은 summary를 다시 쓰지 않는다.

최상위 root가 unary라면 실제 synthesis가 수행된 하위 projection을 그대로 root projection으로 승격한다. set 전체에는 별도 seed synthesis 호출 한 번이 필요하다.

**근거**

경로 깊이만 긴 unary directory마다 LLM을 호출하면 의미 결합 없이 비용만 증가한다. passthrough는 새로운 의미 판단이 아니라 기존 projection의 구조적 전달이다.

**기각 대안**

- 모든 directory set마다 호출: 깊은 경로에서 불필요한 fan-out을 만든다.
- unary directory 자체를 topology에서 제거: 상위 프레임이 요구한 경로 계층을 artifact에서 잃으므로 기각한다.
- runtime이 unary projection을 요약: semantic work를 runtime으로 이동시키므로 기각한다.

---

### P1B-DD12 — 이중 preflight와 동시성 1

**결정**

set-tier는 두 번의 preflight를 통과해야 한다.

#### 조기 structural preflight

per-observation LLM 루프 전에 다음을 계산한다.

- candidate code observation 수
- canonical path 수와 중복
- set node 수
- 최대 direct child 수
- import inventory 예상/관찰 한도
- 최소 set synthesis call 수요

이 preflight는 set-tier 추가 작업이 명백히 cap을 넘는지 일찍 판정한다. 기존 1a 실행 여부는 기존 설정과 예산 규칙을 따른다.

#### post-loop execution preflight

모든 후보 파일의 1a root projection이 준비된 뒤 다음을 정확히 계산한다.

- 완료 member 수와 누락 수
- 실제 synthesis 대상 set node 수
- set seed call 1회
- relation 총수와 node별 노출 수
- 렌더된 prompt 문자 수
- 요청 output token 총량
- X7 기존 누적 spend
- set 전용 최대 호출 수
- 남은 stage 호출 budget

조건식은 개념적으로 다음을 모두 만족해야 한다.

```text
set_call_demand <= SET_MAX_SYNTHESIZE_CALLS
prior_stage_spend + set_call_demand <= max_synthesize_calls
member_count <= SET_MAX_MEMBERS
set_node_count <= SET_MAX_NODES
max_direct_children <= SET_MAX_DIRECT_CHILDREN
relation_count <= SET_MAX_RELATIONS_TOTAL
rendered_prompt_chars <= SET_MAX_PROMPT_CHARS_TOTAL
requested_output_tokens <= SET_MAX_OUTPUT_TOKENS_TOTAL
```

초기 구현의 set 호출 동시성은 1로 고정한다. breaker·running budget·sidecar checkpoint 순서가 결정론적으로 유지된다. 동시성 값도 set fingerprint pre-image에 포함한다.

**근거**

현재 X7은 stage 전체 누적 budget이지만 observation별 preflight만 수행하므로 combined tree fan-out을 차단하지 못한다. post-loop 가상 관찰 방식으로 기존 패턴을 확장할 수 있다. 정찰 앵커 [4]. 단일 대형 파일에 419회가 사용된 실측은 파일 수가 큰 경우 별도 set cap 없이는 비용 위험이 크다는 것을 보여준다.

**기각 대안**

- X7 잔여량만 확인: set 자체가 stage budget 대부분을 소비할 수 있어 기각한다.
- 호출 중 cap 초과 시 중단: 비용을 이미 지출하고 부분 root가 생성되므로 기각한다.
- 초기부터 병렬 호출: running budget·breaker·checkpoint race의 별도 설계가 필요하므로 기각한다.
- direct child를 조용히 일부만 prompt에 포함: 부분 set을 전체처럼 보이게 하므로 기각한다.

---

### P1B-DD13 — ON 전용 aggregate fingerprint와 재사용 완결성 조건

**결정**

OFF 경로에서는 현재 aggregate fingerprint 함수를 그대로 호출한다. ON 경로에서만 신규 set aggregate fingerprint를 계산한다.

```text
sha256(stableJson({
  member_observation_fingerprints: sorted [...],
  set_topology: sorted [...],
  observed_imports: sorted [...],
  resolved_relations: sorted [...],
  set_config_values: {...},
  set_prompt_contract_digests: {...},
  set_schema_values: {...},
  set_cap_values: {...}
}))
```

포함해야 할 값:

- `{observation_id, fingerprint}` 정렬 목록
- set path·parent·file root topology
- deduplicated import relation 전체
- resolver 규칙 version
- node synthesis predicate version
- set node·set seed prompt digest
- relation render cap
- member/node/fan-out/call/input/output cap
- concurrency 값
- set sidecar schema version
- resolved opt-in 값

기존 kind-agnostic aggregate hash는 OFF에서 바꾸지 않는다. 새 상수는 code set-tier 전용 top-level constant로 두고 그 **값**을 set fingerprint에 fold한다.

`authoredArtifactReuseMatch`의 ON 경로는 해시 일치 외에 다음을 요구한다.

- set-tier status가 `complete`, 또는 후보가 2개 미만인 정확한 `not_applicable`
- sidecar set fingerprint 일치
- root/seed projection schema 유효
- capacity/provider/structure failure 상태가 아님

**근거**

현재 aggregate는 정렬된 per-observation fingerprint만 해시하며 소비자는 문자열만 비교한다. 정찰 앵커 [3]. hash만 바꾸고 completeness를 확인하지 않으면 동일 입력에서 과거의 incomplete set 결과를 재사용할 수 있다.

**기각 대안**

- 공유 aggregate 알고리즘을 항상 변경: OFF 및 무관 kind fingerprint를 회전시키므로 기각한다.
- relation cap을 fingerprint에서 제외: LLM-visible 입력이 달라져도 reuse key가 같아지는 silent-stale 결함이므로 기각한다.
- status를 aggregate 입력에 넣는 것으로만 해결: 실패 후 동일 입력의 재시도와 input identity가 섞이므로 기각한다. status는 reuse eligibility로 별도 확인한다.

---

### P1B-DD14 — partial member map은 set root로 승격하지 않음

**결정**

조기 snapshot으로 정한 candidate code observation 모두에 유효한 1a file root projection이 있어야 set synthesis를 시작한다.

- 하나라도 누락되면 `member_projection_incomplete`로 set-tier를 생성하지 않는다.
- 누락 파일을 제외한 subset을 repo/set map으로 표시하지 않는다.
- 누락 observation ID와 원인을 omission census에 기록한다.
- 개별 1a 결과는 보존한다.
- 구조 실패는 downstream set seed 사용을 차단한다.
- provider 실패의 전체 reconstruct 중단 여부는 owner 정책으로 남기되, set root가 없는 상태에서 set 의미가 있는 것처럼 fallback하지 않는다.

**근거**

현재 observation은 완전히 독립적으로 실행되고 cross-observation 병합 지점이 없다. 정찰 앵커 [1]. 일부 observation만 성공했을 때 별도 membership 계약 없이 합치면 set의 경계가 실행 결과에 따라 비결정적으로 변한다.

**기각 대안**

- 성공한 파일만 자동 포함: 동일 source가 provider 상태에 따라 다른 set 의미를 갖게 되므로 기각한다.
- 실패 파일에 빈 projection 삽입: 의미 없는 placeholder를 정상 근거처럼 제공하므로 기각한다.
- 실패 파일을 relation endpoint로만 유지: topology와 semantic membership이 달라져 기각한다.

## 5. 런타임 실행 흐름

```text
설정 해석
  │
  ├─ set-tier OFF ───────────────────────► 기존 경로 그대로
  │
  └─ set-tier ON
       │
       ├─ code 설정 의존성 검증
       ├─ candidate observation snapshot
       ├─ 경로 정규화 + 조기 structural preflight
       ├─ observation별 기존 1a 실행
       │    └─ import 정형 inventory 기록
       ├─ persisted inventory에서 파일 tree 재구성
       ├─ 파일 root projection 완결성 확인
       ├─ set topology graft + partition 검증
       ├─ import resolve + dedupe + relation LCA 배치
       ├─ set input/aggregate fingerprint 계산
       ├─ set-tier resume 검증
       ├─ post-loop execution preflight
       ├─ set node post-order synthesis, concurrency=1
       ├─ root projection 확정
       ├─ set-scoped seed synthesis 1회
       ├─ sidecar set_tier complete checkpoint
       └─ downstream SemanticSeedBundle.set_tier 노출
```

### 5.1 관찰 후보 snapshot

`runSemanticMapStage`의 observation 루프 전, 기존 code eligibility와 같은 기준으로 candidate ID를 고정한다. 정찰 앵커 [1]의 `for (const observation of eligibleObservations)` 결과가 provider 성공 여부에 따라 membership authority가 되지 않도록 한다.

census는 최소한 다음을 구별한다.

- 전체 observation
- code candidate
- unsupported kind
- code map disabled
- path invalid
- duplicate path
- 1a projection complete
- 1a projection missing/failed
- set member included

### 5.2 combined trace 조립

1. source-set 상대 canonical root를 하나 만든다.
2. 각 파일 path의 디렉터리 segment마다 필요한 set node를 만든다.
3. 빈 디렉터리는 관찰하지 않았으므로 만들지 않는다.
4. 파일 path의 마지막 디렉터리 set에 기존 span root를 연결한다.
5. 파일 내부 subtree는 기존 좌표와 container를 유지한다.
6. set reducer는 파일 root 아래 span subtree를 다시 합성하지 않는다.
7. 파일 root projection fingerprint가 sidecar의 observation fingerprint와 일치하는지 검증한다.

### 5.3 set node ground

```ts
interface SetTierNodeGround {
  set_path: string;
  direct_children: Array<{
    region: SemanticMapRegion;
    projection_fingerprint: string;
    projection: ExistingSemanticMapProjection;
  }>;
  relations: SetImportRelation[];
  child_census: {
    set_children: number;
    file_children: number;
    descendant_files: number;
  };
  relation_census: {
    total_owned: number;
    exposed: number;
    omitted: number;
    omission_reason?: "relation_prompt_cap";
  };
}
```

- `direct_children`는 하나라도 누락하면 호출하지 않는다.
- child 순서는 canonical path 순이다.
- relation 순서는 `(from, to_specifier, resolved_in_set)` 순이다.
- prompt renderer는 이 정렬을 변경하지 않는다.
- prompt 문자 cap을 넘으면 child를 자르지 않고 preflight를 실패시킨다.
- relation만 계약된 cap까지 절단할 수 있으며 census를 함께 노출한다.

### 5.4 set node 실패 전파

- child node 실패 시 parent는 실행하지 않는다.
- 실패한 node와 영향을 받은 ancestor를 구별해 기록한다.
- 이미 완료된 sibling node checkpoint는 resume 후보로 보존한다.
- root가 완료되지 않으면 seed synthesis는 실행하지 않는다.
- 구조 validator 실패는 provider 호출 전에 종료한다.
- provider 출력 schema 실패를 runtime이 재요약하거나 부분 parse하지 않는다.

## 6. artifact 및 resume 상태 계약

### 6.1 node 상태

```ts
interface SetTierNodeResult {
  set_path: string;
  input_fingerprint: string;
  status:
    | "passthrough"
    | "complete"
    | "failed_provider"
    | "blocked_by_child";
  child_fingerprints: string[];
  relation_digest: string;
  projection?: ExistingSemanticMapProjection;
  failure_ref?: string;
}
```

`passthrough`는 LLM 호출이 없었음을 뜻하며 child projection과 의미적으로 동일해야 한다. validator는 projection payload의 canonical bytes 또는 canonical digest가 child와 동일함을 확인한다.

### 6.2 status별 downstream 규칙

| status | 기존 observation map | set root 사용 | set seed 호출 | authored artifact reuse |
|---|---:|---:|---:|---:|
| `complete` | 보존 | 허용 | 완료되어야 함 | 허용 |
| `not_applicable` | 보존 | 없음 | 없음 | 조건부 허용 |
| `skipped_capacity` | 보존 | 금지 | 금지 | 금지 |
| `failed_structure` | 보존 가능 | 금지 | 금지 | 금지 |
| `failed_provider` | 보존 | 금지 | 금지 | 금지 |

### 6.3 원자성

- canonical set-tier block은 node checkpoint 단위로 내구성 있게 기록한다.
- `status=complete`는 모든 required node와 seed projection의 검증이 끝난 뒤 마지막에 기록한다.
- root projection만 있고 seed projection이 없으면 complete로 승격하지 않는다.
- aggregate authored artifact는 complete checkpoint 이후에만 set-tier 결과를 참조한다.

## 7. 예산·비용 설계

### 7.1 신규 per-kind 상수

정확한 값은 owner 결정 전까지 미결이지만 다음 상수는 분리되어야 한다.

```text
SEMANTIC_MAP_CODE_SET_MAX_MEMBERS
SEMANTIC_MAP_CODE_SET_MAX_NODES
SEMANTIC_MAP_CODE_SET_MAX_DIRECT_CHILDREN
SEMANTIC_MAP_CODE_SET_MAX_IMPORT_RECORDS
SEMANTIC_MAP_CODE_SET_MAX_RELATIONS_PER_PROMPT
SEMANTIC_MAP_CODE_SET_MAX_SYNTHESIZE_CALLS
SEMANTIC_MAP_CODE_SET_MAX_PROMPT_CHARS_TOTAL
SEMANTIC_MAP_CODE_SET_MAX_OUTPUT_TOKENS_PER_CALL
SEMANTIC_MAP_CODE_SET_MAX_OUTPUT_TOKENS_TOTAL
SEMANTIC_MAP_CODE_SET_CONCURRENCY
SEMANTIC_MAP_CODE_SET_SCHEMA_VERSION
SEMANTIC_MAP_CODE_SET_RESOLVER_VERSION
```

모든 LLM-visible cap, prompt contract, resolver 및 synthesis predicate 값은 set fingerprint에 포함한다. 공유 X7 budget 값이나 공유 계약 버전은 bump하지 않는다.

### 7.2 호출 수요

```text
set_call_demand =
  synthesis_required_set_node_count
  + 1 set_seed_call
  - reusable_completed_node_count
  - reusable_completed_seed_call
```

재사용 node를 빼기 전에 해당 node의 현재 input fingerprint 일치를 확인해야 한다.

### 7.3 대규모 repository 의미

단일 8,556줄 파일에서 419회 호출이 관측되었으므로 수백~수천 파일 비용의 주된 항은 여전히 per-file 1a일 수 있다. Phase 1b set cap은 추가 set fan-out을 제한하지만 기존 per-file 비용을 해결하지 않는다. 따라서 다음 주장을 금지한다.

- “set-tier cap이 repository 전체 비용을 제한한다.”
- “수천 파일에서 완료 가능하다.”
- “set-tier가 원시 source 또는 per-file map보다 비용 효율적이다.”

이 항목들은 별도 측정 전 미결이다.

## 8. Falsifiable 완료 게이트

각 게이트는 실행 대상 수가 0이면 실패해야 한다. 신규 branch를 검증하는 테스트는 branch entry counter 또는 신규 artifact cardinality가 1 이상임을 먼저 assert한다.

### G1 — OFF 전체 바이트 불변

**준비**

- 설정 키 부재
- `semantic_map_code_set_tier=false`
- 기존 code fixture 최소 1개
- 기존 semantic-map 활성·비활성 조합

**통과 조건**

1. 신규 설정 키 부재 결과가 기준 HEAD 결과와 byte-for-byte 동일하다.
2. 명시적 false 결과가 키 부재 결과와 byte-for-byte 동일하다.
3. 신규 top-level `set_tier`, import inventory, census, warning이 출력에 존재하지 않는다.
4. 기존 aggregate fingerprint가 동일하다.
5. set-tier module entry counter가 0이다.

한 fixture도 실제 code path에 진입하지 않으면 실패한다.

### G2 — 스프레드시트 산출물·골든 불변

**통과 조건**

1. spreadsheet-only fixture의 기존 산출물과 golden bytes가 모두 동일하다.
2. mixed fixture에서 spreadsheet별 artifact bytes가 동일하다.
3. `mergeSemanticSeedProjections`의 spreadsheet 내부 동작과 golden이 동일하다.
4. spreadsheet observation이 set membership에 들어가지 않는다.
5. 비교 대상 spreadsheet artifact 수가 1 이상이어야 한다.

### G3 — set partition의 부정 대조

각 mutation이 provider 호출 전에 실패해야 한다.

- 중복 canonical file path
- 누락 file root
- extra file root
- orphan set node
- sibling prefix overlap
- `..` 경로
- file/directory path collision
- 동일 observation의 중복 graft

정상 2파일 fixture는 통과하고, 위 mutation 각각은 정해진 구조 reason으로 실패해야 한다. mutation을 적용하지 못했거나 validator 대상 node 수가 0이면 실패한다.

### G4 — import inventory 정직성

최소 하나의 TS_KIND 또는 PY_KIND 정적 import를 포함하는 fixture에서 다음을 assert한다.

1. `import_nodes_seen > 0`
2. `imports_recorded > 0`
3. `to_specifier`가 `signature_line` 재파싱 없이 AST field에서 생성됨
4. observation inventory의 `resolved_in_set`은 null
5. set assembly 이후 정확히 하나의 relation이 unique member path로 해석됨
6. 중복 statement fixture에서 dedupe 수가 1 이상
7. 미지원 form은 null relation과 reason으로 남음
8. `imports_recorded + omitted`가 관찰된 import 처리 census와 일치함

### G5 — relation LCA 및 bounded exposure

세 디렉터리 수준을 가진 fixture에서 다음을 assert한다.

1. 같은 디렉터리 파일 간 relation은 해당 디렉터리 set이 소유한다.
2. 서로 다른 디렉터리 간 relation은 공통 상위 set이 소유한다.
3. canonical inventory에서 relation별 owner가 정확히 하나다.
4. cap보다 relation이 하나 많은 fixture에서 exposed 수는 cap, omitted 수는 1이다.
5. cap을 바꾸면 set fingerprint가 달라진다.
6. relation 순서를 뒤섞은 입력은 동일 canonical artifact와 fingerprint를 만든다.

### G6 — fingerprint 회전 격리

다음 각 변화는 ON fingerprint만 변경해야 한다.

- member observation fingerprint 1개
- set topology
- import specifier
- resolved endpoint
- relation cap
- prompt contract digest
- concurrency
- set schema/resolver version

다음은 OFF fingerprint를 변경하면 안 된다.

- set-tier 전용 cap
- set-tier prompt text
- set-tier schema version

negative control로 relation cap 값을 바꾸되 fingerprint가 같도록 의도적으로 fold를 제거한 test double은 반드시 실패해야 한다.

### G7 — preflight 무호출 보장

각 cap을 정확히 1 초과하는 fixture에서 다음을 assert한다.

1. set provider call 수가 0이다.
2. 부분 set root 또는 seed projection이 없다.
3. 정확한 capacity reason과 실제/한도 값이 기록된다.
4. 기존 완료 per-observation projection은 보존된다.
5. cap 이하의 같은 fixture는 set branch에 진입한다.

대상 set node나 relation 수가 0이면 실패한다.

### G8 — resume 파티션 검증

다음 시나리오를 모두 수행한다.

1. 중간 set node 완료 후 중단·재개
2. 완료 node fingerprint 일치 시 provider 재호출 0
3. relation 하나 변경 시 영향 node와 ancestor만 재실행
4. unrelated sibling node는 재사용
5. unknown set path는 재사용 거부
6. duplicate set path는 재사용 거부
7. missing member ID는 set partition 재구축
8. 기존 observation resume row는 그대로 재사용
9. incomplete set block으로 authored artifact reuse가 성립하지 않음

실제로 재사용되는 node와 무효화되는 node가 각각 1개 이상이어야 한다.

### G9 — sidecar 및 prompt schema

1. `observations` 배열의 모든 row는 실재 observation ID와 일치한다.
2. set node ID가 observations 배열에 존재하지 않는다.
3. complete set block에는 root와 seed projection이 모두 존재한다.
4. `code-set-node-synthesis` 입력에 child가 1개 이상 존재한다.
5. relation fixture에서는 prompt `relations`가 1개 이상이다.
6. 출력 schema 일부를 삭제한 provider fixture는 complete로 승격되지 않는다.
7. set prompt contract 변경은 무관 kind fingerprint를 바꾸지 않는다.

### G10 — 실제 provider 2파일 구조 E2E

실제 semantic/provider path로 다음을 증명한다.

- 정확히 2개의 code observation
- 파일 A에서 파일 B로 향하는 해석 가능한 import 1개 이상
- set node synthesis 실제 호출 1회 이상
- set seed 실제 호출 1회
- `artifact_generation_realization`이 mock/fixture provider가 아님
- root/seed projection이 비어 있지 않음
- final downstream 입력에 set slot이 정확히 1개
- synthetic observation ID가 없음
- 완료 sidecar로 resume 시 set provider 호출 0

mock, prepare-only, dry-run 또는 출력이 비어 있는 run은 이 게이트를 통과할 수 없다.

### G11 — 실제 provider 비공허 의미 게이트

#### fixture

정확히 2개 파일로 구성하며 사전 ground truth를 다음처럼 고정한다.

- cross-file 사실 4개
- file-local 보존 사실 2개
- 존재하지 않는 관계를 탐지하는 hallucination trap 1개

cross-file 사실은 import relation 없이는 bounded set input에서 답할 수 없도록 fixture와 평가 질문을 설계한다.

#### 실험 arm

동일 provider·model·prompt 이외 설정·budget으로 각 arm을 5회 paired 반복한다.

- A: set-tier + relations
- B: set-tier + relations redacted
- C: 기존 per-file map만 사용

A 대 B는 relation 유무만 바꾼다. A 대 C는 set-tier의 추가 가치를 측정한다.

#### 통과 조건

1. 모든 arm에서 질문 subject 수가 정확히 7개다.
2. A가 5회 중 4회 이상 cross-file 4문항을 모두 맞힌다.
3. A가 5회 중 4회 이상 file-local 2문항을 모두 보존한다.
4. A의 5회 모두 hallucination trap에 존재하지 않는 relation을 만들지 않는다.
5. A의 cross-file 평균 점수가 B보다 최소 1문항 높다.
6. paired 5회 중 최소 3회에서 A가 B보다 높다.
7. A의 cross-file 평균 점수가 C보다 최소 1문항 높다.
8. A의 file-local 평균은 C보다 낮지 않다.
9. 평균·분산·호출 수·input/output token·latency를 arm별로 보고한다.
10. blind judge 입력에는 arm 이름을 노출하지 않는다.
11. judge가 빈 응답, 누락 질문 또는 잘못된 schema를 내면 해당 반복을 PASS로 계산하지 않는다.

B가 관계 없이도 만점을 받아 negative control이 무효가 되면 통과 처리하지 않고 fixture를 재설계한다. 이 게이트는 원시 source 전문보다 우월함을 주장하지 않으며, bounded cross-file seam의 추가 가치만 판정한다.

### G12 — 비용·출력 예산 상호작용

2파일 live run과 cap 근접 deterministic run에서 다음을 보고한다.

- per-file 기존 call 수
- set node call 수
- set seed call 수
- prior X7 spend
- set 추가 spend
- output token 요청 상한과 실제치
- resume으로 절감된 call 수

`prior_stage_spend + set_call_demand`가 X7 한도를 1 초과하는 negative fixture는 set 호출 0이어야 한다.

## 9. 검증 계획

### 9.1 단위 검증

| 영역 | 검증 항목 |
|---|---|
| 경로 | 정규화, prefix, 충돌, traversal, 정렬 |
| topology | root 생성, 하위 set, 파일 graft, 전단사 membership |
| partition | duplicate·missing·orphan·cycle 부정 대조 |
| import extractor | TS_KIND/PY_KIND specifier 정형 추출, 복수 specifier |
| resolver | unique·none·ambiguous·unsupported |
| relation | dedupe, canonical sort, LCA owner, unresolved owner |
| reducer | post-order, unary passthrough, child failure 전파 |
| preflight | 모든 cap의 경계값과 `cap+1` |
| fingerprint | topology·relation·cap 회전과 OFF 비회전 |
| resume | node 단위 재사용·무효화 |
| serialization | optional field 부재, status 일관성 |

property-based 검증이 가능하면 임의 path tree에 대해 다음 불변식을 확인한다.

```text
grafted_file_roots == candidate_member_roots
각 non-root node parent 수 == 1
각 relation owner 수 == 1
canonicalize(canonicalize(x)) == canonicalize(x)
```

### 9.2 골든 검증

1. 기존 code OFF artifact 전체.
2. 기존 spreadsheet artifact 전체.
3. ON 2파일 topology artifact.
4. import 정렬·중복 제거 artifact.
5. relation cap·omission census artifact.
6. complete set-tier sidecar.
7. partial checkpoint 및 resume validation artifact.
8. capacity skip artifact.
9. provider schema failure artifact.

골든 기대값 변경은 Phase 1b 명세에 의해 새로 생긴 ON artifact에만 허용한다. 기존 골든이 현재 코드 동작과 다르다는 이유만으로 기대값을 수정하지 않는다.

### 9.3 결정론적 E2E

1. 2파일 같은 디렉터리.
2. 2파일 다른 하위 디렉터리.
3. resolved와 unresolved import 혼합.
4. 파일 경로 입력 순서 shuffle.
5. import 입력 순서 shuffle.
6. cap 초과 무호출.
7. 중간 중단·resume.
8. relation 변경 후 부분 invalidation.
9. mixed code/spreadsheet에서 spreadsheet bytes 보존.

mock realization은 wiring, schema, artifact, resume, cap 검증에만 사용한다. 제품 의미 완료 증거로 보고하지 않는다.

### 9.4 live E2E

- G10과 G11을 실제 provider 경로로 수행한다.
- 호출 전 candidate file 수, import 수, relation 수를 assert한다.
- 실제 artifact가 non-empty임을 확인한다.
- provider provenance, model 식별자, 설정, 반복 수, 비용·분산을 기록한다.
- run이 예상보다 빠르거나 결과가 비면 실제 branch entry, call ledger, output schema를 덤프하고 실패 처리한다.

### 9.5 회귀 검증

1. 기존 typecheck·lint·build.
2. 기존 code semantic-map 테스트 전체.
3. spreadsheet golden 전체.
4. invariant drift 검사.
5. OFF baseline 전체 artifact byte comparison.
6. 실제 변경 code가 dispatch 경로를 통과하는 narrow live test.

## 10. 구현 순서

### 단계 A — owner 승인과 실제 타입 확인

1. settings key와 스키마 변경 승인.
2. sidecar top-level 필드 및 pipeline output schema 승인.
3. set prompt output이 재사용할 기존 projection 타입 확인.
4. 신규 cap 값 확정.
5. code-only 범위 승인.
6. provider failure 시 전체 reconstruct 처리 정책 확정.

**완료 조건:** owner 결정 표의 차단 항목이 모두 선택되고, 패킷에 없는 타입·artifact 이름을 실제 authority에서 확인했다.

### 단계 B — 구조와 schema

1. optional import inventory 타입 추가.
2. set region·topology·relation 타입 추가.
3. set-tier sidecar 타입 추가.
4. 별도 설정 resolver와 OFF gate 추가.
5. ON/OFF serialization test 추가.

**완료 조건:** provider 호출 없이 G1, G2, G3의 schema·byte 부분이 통과한다.

### 단계 C — import inventory와 resolver

1. TS_KIND/PY_KIND AST adapter에서 specifier 추출.
2. observation inventory와 census 기록.
3. 보수적 resolver 구현.
4. dedupe·sort·reason census 구현.
5. resolver version을 set fingerprint pre-image에 연결.

**완료 조건:** G4와 G5의 import 관련 단위·골든이 통과한다.

### 단계 D — topology와 reducer

1. persisted inventory 기반 파일 tree 재구성.
2. set path tree 생성.
3. 파일 span root graft.
4. partition validator.
5. relation LCA 배치.
6. unary passthrough 및 post-order set walk.

**완료 조건:** G3·G5의 모든 부정 대조가 실제 validator를 통과하며 provider 호출 수 0을 확인한다.

### 단계 E — fingerprint·preflight·resume

1. ON 전용 aggregate fingerprint.
2. node input fingerprint.
3. 이중 preflight와 set cap.
4. sidecar checkpoint.
5. set-tier resume validator.
6. authored artifact reuse completeness gate.

**완료 조건:** G6·G7·G8이 통과한다.

### 단계 F — prompt와 downstream 소비

1. code-local set node prompt contract.
2. code-local set seed prompt contract.
3. `SemanticSeedBundle.set_tier` 별도 슬롯.
4. output validator와 failure propagation.
5. LLM-visible cap 값 fingerprint fold.

**완료 조건:** G9가 통과하고 observation 슬롯에 synthetic ID가 없음을 증명한다.

### 단계 G — 실제 검증

1. G10 실제 2파일 E2E.
2. G11 3-arm × 5회 paired 의미 실험.
3. G12 비용·분산 보고.
4. OFF와 spreadsheet 최종 byte comparison.

**완료 조건:** G1~G12가 모두 non-vacuous 상태로 통과한다. 하나라도 blocked이면 Phase 1b 제품 완료를 주장하지 않는다.

## 11. Owner 결정 항목

### O1 — 옵트인 키와 설정 스키마 변경

| 선택 | 사용자 결과 | 비용·위험 |
|---|---|---|
| `semantic_map_code_set_tier` 별도 키 — 권고 | 기존 code map과 set 추가 비용을 독립 제어 | 설정·문서·validator 변경 필요 |
| 기존 `semantic_map_code` 재사용 | 설정은 단순 | 기존 opt-in 의미와 비용이 바뀌어 G-OFF 위험 |
| generic `semantic_map_set_tier` | 향후 문서집합 확장 이름 확보 | 현재 code-only capability보다 이름이 넓어 오해 가능 |

**권고:** code-specific 별도 키. 설정 스키마 보호 항목이므로 구현 전 명시적 승인 필요.

### O2 — 최초 지원 material kind

| 선택 | 사용자 결과 | 비용·위험 |
|---|---|---|
| code-only — 권고 | 1a와 정찰 근거 안에서 완료 가능 | 문서집합 일반화는 후속 |
| code + document | 상위 원리의 두 예시를 함께 지원 | 문서 파일 root projection 계약이 패킷에 없어 새 설계 필요 |
| 모든 observation kind | 단일 feature처럼 보임 | spreadsheet 불변 및 kind별 의미 계약과 충돌 가능 |

**권고:** Phase 1b 완료 주장을 code-only로 제한한다.

### O3 — import resolution 범위

| 선택 | 사용자 결과 | 비용·위험 |
|---|---|---|
| 관찰집합 한정 보수적 resolver — 권고 | 거짓 연결을 피하고 null reason을 보존 | alias·외부 package는 미해석 |
| 환경-aware resolver | 실제 build resolution과 가까움 | config·runtime authority·fingerprint 범위가 크게 증가 |
| resolution 없이 specifier만 노출 | 구현은 빠름 | `resolved_in_set` seam 완료 조건을 만족하지 못함 |

**권고:** 보수적 resolver로 완료한 뒤 실제 미해석 census를 근거로 확장한다.

### O4 — 신규 cap의 정확한 값

owner가 다음 값을 확정해야 한다.

- member 수
- set node 수
- direct child 수
- import inventory 총수
- node별 relation 노출 수
- set synthesis call 수
- prompt 총 문자 수
- call별·전체 output token 수

선택지는 다음과 같다.

| 선택 | 사용자 결과 | 비용·위험 |
|---|---|---|
| live 2파일 및 dry census 후 보수적 값 확정 — 권고 | 근거 기반, 비용 통제 | 구현 중 한 차례 calibration 필요 |
| 임시 큰 값으로 시작 | 더 많은 repository가 실행됨 | X7 전에 비용·출력 폭증 가능 |
| 매우 작은 값으로 시작 | 비용 위험 최소 | 실제 repository 대부분이 capacity skip될 수 있음 |

숫자가 확정되지 않으면 preflight 구현은 가능하지만 제품 완료는 불가능하다.

### O5 — provider 실패 시 전체 reconstruct 처리

| 선택 | 사용자 결과 | 비용·위험 |
|---|---|---|
| per-file 결과를 보존하고 set-tier degraded로 계속 — 권고 | 기존 단일 파일 결과를 잃지 않음 | 최종 결과에 set 의미가 없음을 명확히 표시해야 함 |
| 전체 reconstruct 중단 | 요청한 set 의미가 없는 결과를 막음 | 일시 provider 실패의 blast radius가 큼 |
| 성공 subset으로 set 생성 | 일부 결과라도 제공 | 전체 set처럼 보이는 부분 map이 되어 기각 권고 |

구조·partition 실패는 어느 선택에서도 set 사용을 차단해야 한다.

### O6 — set projection 출력 타입

| 선택 | 사용자 결과 | 비용·위험 |
|---|---|---|
| 기존 1a root/seed projection 타입 재사용 — 권고 | 개념·validator·downstream 변경 최소 | set 관계 표현력이 부족할 수 있음 |
| 신규 set 전용 semantic 필드 | 관계 표현력이 명시적 | 출력 계약·schema·consumer 전부 변경 |
| 자유 Markdown 출력 | 구현은 단순 | machine source와 resume 검증이 약해져 부적합 |

실제 기존 타입 정의가 패킷에 없으므로 타입 재사용 가능 여부를 먼저 확인해야 한다. 부족하면 owner에게 되돌리고 임의 확장하지 않는다.

### O7 — 진행 중인 C2 실험 결과의 처리

| 결과 | 권고 disposition |
|---|---|
| C2 PASS | Phase 1b live 관계 게이트를 독립 수행 |
| C2 FAIL | 구조·import seam 구현은 OFF 뒤에서 계속할 수 있으나 LLM set-tier 가치 주장은 보류하고, deterministic relational inventory만 제공하는 대안을 재검토 |
| C2 불확정 | Phase 1b는 experimental OFF 상태로만 유지하고 G11 통과 전 완료 주장 금지 |

단일 파일 map의 한계 기여 실패가 cross-file relation seam의 실패를 자동 증명하지는 않는다. 그러나 LLM set synthesis의 비용 정당성을 다시 판단해야 하는 신호다.

### O8 — multi-root·symlink 처리

패킷에는 source root, symlink, 중첩 repository authority가 없다.

| 선택 | 사용자 결과 | 비용·위험 |
|---|---|---|
| 단일 canonical source root만 지원하고 나머지는 reason과 함께 거부 — 권고 | partition과 fingerprint가 명확 | 일부 repository 미지원 |
| 각 root를 최상위 child set으로 조립 | 넓은 지원 | root identity·충돌·외부 경계 계약 필요 |
| symlink 실경로 해석 | 실제 파일 중복을 줄일 수 있음 | 경로 authority와 재현성이 환경에 의존 |

Phase 1b 초기 구현은 단일 root로 제한하는 것이 안전하다.

## 12. 리스크

| ID | 리스크 | 영향 | 완화 |
|---|---|---|---|
| R1 | 기존 per-file 1a 비용이 set preflight 전에 이미 큼 | 대규모 repo에서 set에 도달하지 못함 | 조기 member/node census, 별도 비용 과제로 공시 |
| R2 | relation cap이 핵심 edge를 잘라냄 | 의미 map이 관계를 누락 | full census, cap fingerprint fold, G11 negative control |
| R3 | resolver가 실제 module resolution과 다름 | false null 또는 false positive | unique match만 허용, ambiguity null, reason 보존 |
| R4 | 경로 정규화 충돌 | 파일 누락·잘못된 graft | canonical path validator와 fail-closed partition |
| R5 | set sidecar가 observation resume와 결합 | unknown synthetic ID 또는 전체 invalidation | 최상위 병렬 파티션 |
| R6 | incomplete set 결과 재사용 | 오래된 authored artifact 노출 | hash 외 complete/status/schema gate |
| R7 | prompt cap 상수 fold 누락 | silent-stale reuse | cap별 fingerprint negative test |
| R8 | set LLM이 import 관계를 과장 | semantic hallucination | relation ID grounding, live hallucination trap |
| R9 | unary passthrough가 의미 수정으로 구현됨 | runtime이 semantic authority 침범 | payload digest 동일성 검사 |
| R10 | 전역 prompt catalog 등록 | 무관 kind fingerprint 회전 | code-local prompt digest |
| R11 | mixed source에서 spreadsheet artifact 변화 | G-SS 위반 | code gate 분리, spreadsheet byte golden |
| R12 | persisted inventory가 tree 재구성에 충분하지 않음 | combined trace 조립 불가 | 구현 전 inventory completeness 확인; 부족하면 owner 재결정 |
| R13 | sidecar schema 변경이 외부 consumer를 깨뜨림 | 호환성 회귀 | optional top-level field, OFF 부재, consumer 검증 |
| R14 | C2가 LLM map의 한계 기여를 부정 | 추가 set LLM 비용 정당성 상실 | deterministic seam 대안으로 회귀 가능한 OFF 설계 |
| R15 | live judge가 공허하거나 편향됨 | 의미 없는 PASS | 고정 질문 수, blind arm, negative control, schema fail-loud |

## 13. 미결 사항

1. 기존 1a root projection과 semantic seed projection의 정확한 TypeScript 타입명 및 표현력.
2. persisted observation inventory가 파일 tree를 완전 재구성하기에 충분한지 여부.
3. TS_KIND/PY_KIND AST adapter가 제공할 수 있는 specifier의 정확한 구조.
4. PY_KIND relative module specifier를 canonical path로 바꾸는 세부 규칙.
5. source-set canonical root authority.
6. symlink, 중첩 source root, 동일 파일 다중 observation 처리.
7. 신규 cap의 정확한 수치.
8. provider 실패 시 전체 reconstruct의 최종 상태.
9. set-tier sidecar top-level schema 변경에 대한 owner 승인.
10. set-scoped seed bundle을 소비할 downstream prompt의 정확한 canonical 위치.
11. 진행 중 C2 결과가 LLM set synthesis scope에 미칠 disposition.
12. 문서집합용 파일별 semantic projection 계약.
13. live 2파일 fixture가 사용할 parser family와 지원 import form.
14. actual provider 5회 반복의 허용 비용 및 실행 시간 상한.

이 미결 중 1, 2, 7, 9, 10은 구현 착수 또는 제품 완료를 직접 차단한다. 나머지는 code-only·단일-root·보수적 resolver 범위로 명시적으로 제한하면 Phase 1b 초기 구현에서 유예할 수 있다.
