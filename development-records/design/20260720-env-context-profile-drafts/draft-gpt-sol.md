# 1. 설계 요약

`ReconstructEnvironmentContextProfileArtifact`를 새 독립 아티팩트로 두고, 기존 inventory와 set-tier 결과를 읽는 파생 산출물로 만든다.  
저장소 입력 수집은 `materialize-preparation.ts`의 권한·경로 경계를 재사용하되, opt-in일 때만 설정 파일 전체 또는 스트리밍 파싱용 캡처를 추가한다.  
A–G 신호는 버전이 고정된 규칙표로 정규화·합성하며, 결과는 단일 라벨이 아닌 scope별 복수 detection과 확신도로 표현한다.  
규칙이 침묵하거나 같은 scope에서 명시적으로 충돌할 때만, 정규화된 구조 사실을 대상으로 저장소당 최대 1회의 유계 LLM 보조를 허용한다.  
주의 타깃팅은 per-source 우선순위만 산출하여 candidate inventory와 disposition이 실제 원문을 읽기 전에 입력 순서를 바꾼다.  
candidate 생성 뒤에는 evidence ref의 fan-in·토폴로지·레이어 정합성을 결정론으로 측정하여 disposition 입력에 fold한다.  
단일 설정 키가 없으면 신규 스캔·아티팩트·프롬프트 변경이 전혀 없으며, 키 제거만으로 기존 동작으로 복귀한다.

# 2. §8 루브릭 8개 답

## 2.1 분업선

결정은 “정적 파서와 버전 고정 규칙표가 판정하고, LLM은 제한된 후보의 불확실성만 보조한다”이다.

규칙은 코드로 표현되는 다음 형태를 갖는다.

```ts
type EnvironmentRule = {
  rule_id: string;
  accepted_signal_families: Array<"A" | "B" | "C" | "D" | "E" | "F" | "G">;
  match: DeterministicPredicate;
  emit?: {
    category:
      | "language"
      | "runtime"
      | "framework"
      | "package_manager"
      | "infrastructure"
      | "architecture_layer";
    canonical_name: string;
    strength: "decisive" | "strong" | "corroborating" | "weak";
  };
  conflict_group?: string;
  attention_delta?: number;
};
```

| 계열 | 결정론 판정 | detection 생성 권한 |
|---|---|---|
| A | 안전한 형식별 파서로 dependency, engine, module mode, version pin, lockfile 소유자 추출 | 직접 생성 가능 |
| B | Docker/YAML/HCL/CI·플랫폼 설정의 정규화된 키·토큰 매칭 | 직접 생성 가능 |
| C | 정확한 basename과 정적 설정 서명 매칭 | 직접 생성 가능 |
| D | set-tier 토폴로지의 경로 관례·workspace 경계·생성물 분류 | 단독 framework 생성 금지; A/C/E 보강 또는 D+E로 architecture layer 판정 |
| E | import specifier의 relative/bare/stdlib 분류와 알려진 패키지 사전 매칭 | 언어·런타임·framework 보강 또는 생성 |
| F | shebang·헤더 지시자의 정규식/토큰 매칭 | 해당 파일 scope의 runtime 판정 가능 |
| G | 확장자 분포, linguist override, ignore 패턴 | 최대 tentative language; framework/runtime 생성 금지 |

확신도 합성은 코드가 수행한다.

- `decisive` 1개 또는 독립 계열의 `strong` 2개: `confirmed`
- `strong` 1개 또는 `strong + corroborating`: `supported`
- 약신호나 LLM 보조만 존재: `tentative`
- D와 G는 framework 확신도를 단독으로 올리지 못한다.
- 상충 detection은 하나로 압축하지 않고 모두 보존하며 conflict disclosure를 붙인다.
- Python+TS처럼 다중 기술이 공존하는 것은 충돌이 아니다. 같은 scope·동일 conflict group의 양립 불가능한 주장만 모호성이다.

LLM 호출 조건은 다음 둘 중 하나로 제한한다.

1. 파싱된 구조 사실은 있으나 어떤 규칙도 detection을 확정하지 못한 경우
2. 같은 scope와 conflict group에서 강도가 동률인 상충 후보가 남은 경우

저장소 전체에 최대 1회 호출하며, 입력은 정규화된 signal 최대 96개, 사전 등록된 후보 최대 32개, 직렬화 기준 12K자로 제한한다. 원문·환경변수 값·도메인 후보의 이름이나 설명은 제공하지 않는다.

LLM은 제공된 `candidate_key`, `weak|strong` 보조 강도, 제공된 `signal_ref`만 반환할 수 있다. 새 기술명·경로·ID·`confirmed` 판정을 만들거나 기존 confirmed detection을 삭제할 수 없다. 코드가 응답을 검증하고 ID·최종 확신도·정렬·fingerprint를 생성한다. 아무 구조 사실도 없는 진정한 무신호 상태에서는 LLM을 부르지 않고 명시적 unknown disclosure를 남긴다.

## 2.2 추출 아키텍처

수집 방식은 혼합형이다.

1. `materialize-preparation.ts`가 기존과 동일한 승인된 material root 아래에서 opt-in 전용 파일 열거를 수행한다.
2. 이미 만들어진 observer inventory와 set-tier topology/import relation은 D·E·G에 재사용한다.
3. A·B·C에 필요한 설정 파일은 기존 6000자 excerpt를 파싱하지 않는다. 완전 캡처임이 증명된 기존 내용은 재사용하고, 아니면 allowlist 파일만 다시 읽어 전체 또는 스트리밍 파싱한다.
4. F는 이미 열린 코드의 제한된 헤더에서 정규화된 사실만 보존한다. 내용이 남아 있지 않으면 첫 4KiB만 승인 경로에서 다시 읽는다.
5. 모든 사실을 정규화한 뒤 규칙 합성, 조건부 LLM 보조, attention 계산 순으로 처리한다.

A–G의 구체적 처리는 다음과 같다.

- A: JSON/JSONC, TOML, XML, go.mod, requirements, lockfile별 전용 파서를 사용한다. Gemfile이나 JS 설정은 실행하지 않고 정적 토큰만 읽는다.
- B: Dockerfile `FROM`, compose와 k8s의 안전한 YAML schema, Helm·Terraform·CI·플랫폼 설정을 파싱한다. YAML 임의 tag는 금지하고 alias 수를 제한한다.
- C: 설정 파일 존재 규칙과 정적 import/export 또는 알려진 키를 결합한다.
- D: package/workspace root를 먼저 확정한 뒤, 각 파일을 가장 가까운 root scope에 귀속한다. `models`, `services`, `migrations`, `tests`, generated/vendor 등의 역할은 구조 라벨로만 사용한다.
- E: 언어별로 bare package root와 stdlib를 정규화한다. 내부 import fan-in/out은 set-tier relation에서 다시 계산하며 set-tier shape는 바꾸지 않는다.
- F: shebang, `@ts-check`, `from __future__` 등 제한된 헤더 문법만 읽는다.
- G: scope별 확장자 수를 집계하고 `.gitattributes`·`.gitignore`의 안전한 패턴만 반영한다. Git 이력이나 `.git` 내부는 읽지 않는다.

기존 `target-material-kind.ts`의 basename/extension 표는 후보 파일 식별의 기반으로 재사용하되, 전역 분류 동작은 변경하지 않는다. 프로파일 전용 추가 패턴은 opt-in branch 안에 둔다.

스캐너는 symlink를 따라가지 않고, 정규화 경로가 root 밖으로 벗어나면 hard fail한다. `.github` 같은 필요한 dot-directory는 명시적으로 허용하고 `.git`, dependency vendor, build/cache 디렉터리는 제외한다. 엔트리·깊이·총 파싱 바이트 상한에 도달하면 부분 프로파일을 만들지 않고 실패한다. 정확한 상한은 내부 상수이며 사용자 설정으로 노출하지 않는다.

`.env.example`은 키 이름만 남기고 값은 파싱 직후 폐기한다. 원시 secret 값이나 임의 source excerpt가 profile artifact 또는 보조 LLM payload에 포함되면 검증 실패다.

## 2.3 검증·보강 주입

새 post-seed LLM 패스를 만들지 않고 disposition 단계에 fold한다.

`writeCandidateInventory`가 candidate를 만든 직후, 순수 함수 `projectCandidateStructuralSupport`가 candidate의 `candidate_id`, `salience`, `evidence_refs`만 읽는다. candidate의 이름·설명은 읽지 않으므로 도메인 의미를 재판정할 수 없다.

출력 계약은 다음과 같다.

```ts
type CandidateStructuralSupportProjection = Array<{
  candidate_id: string;
  structural_alignment: "reinforces" | "tension" | "insufficient";
  measurements: {
    mapped_code_source_count: number;
    cited_directory_count: number;
    max_internal_fan_in_percentile: number | null;
    max_attention_percentile: number | null;
    architecture_layer_hit_count: number;
    nonproduction_only: boolean;
  };
  evidence_refs: string[];
}>;
```

판정 규칙은 다음과 같다.

- `reinforces`: 인용 source가 scope 내 fan-in 상위 25%이거나, 서로 독립적인 두 source가 활성화된 architecture layer에 위치하며 nonproduction-only가 아닌 경우
- `tension`: `salience:"high"`인데 매핑 가능한 인용이 모두 test/migration/generated이거나, 모두 하위 25%·fan-in 0이고 layer hit도 없는 경우
- `insufficient`: 인용을 코드 source에 매핑할 수 없거나 위 두 조건을 만족하지 않는 경우

`tension`은 의미적 반증이나 hard-block이 아니라 “구조적 중심성 증거가 관측되지 않았다”는 disclosure다.

`writeCandidateDisposition` 요청에는 모든 candidate가 정확히 한 번 등장하는 `candidate_structural_support` 블록을 의무적으로 넣는다. 누락·중복·알 수 없는 candidate ID는 dispatch 전에 실패한다. disposition은 기존 `{candidate_id, disposition_id, target_seed_refs, rationale, evidence_refs}` shape를 유지하고, 그 결과가 기존 최종 seed 경로로 전달된다.

## 2.4 주의 타깃팅 주입과 계약

최초 범위는 per-source ranking만 선택한다. per-span 가중은 새 ID 체계와 excerpt 조립 정책을 요구하고, 현재 구조 신호만으로 도메인 내용이 있는 span을 안정적으로 구분할 증거가 부족하므로 도입하지 않는다.

profile의 attention shape는 다음과 같다.

```ts
attention: {
  sources: Array<{
    observation_id: string;
    read_priority: number;
    reason_signal_refs: string[];
  }>;
}
```

점수는 확률이나 도메인 관련도가 아니라 읽기 우선순위다. 최초 고정 규칙은 다음과 같다.

- confirmed/supported framework가 활성화한 구조 경로: `+40`
- D+E로 판정된 architecture layer: `+30`
- scope 내 fan-in 상위 10%: `+20`, 상위 25%: `+10`
- production code: `+10`
- test: `-10`, migration: `-20`, config/infra: `-30`
- generated/vendor: `-100`
- LLM-only tentative detection이 줄 수 있는 총 영향: 최대 `+5`

`run.ts`의 `selectedObservationIds(directive)` 직후, 기존 선택 집합을 이 점수로 stable sort한다. 동점은 기존 순서, 그다음 observation ID 순으로 결정한다. ID를 추가하거나 삭제하지 않으며, 순열 보존 검증을 통과한 뒤에만 12512와 12630의 `projectObservationsForPrompt`로 보낸다. 따라서 예산 절단 전에 실제 source excerpt 순서가 바뀐다.

`ontologySeedObservationIds`의 160개 slice와 `writeOntologySeed`의 `includeStructuralData:false`는 변경하지 않는다. attention은 source text를 읽는 candidate inventory/disposition 단계에서 이미 소비되므로 최종 seed dispatch에 구조 데이터를 억지로 넣지 않는다.

## 2.5 set-tier와 합성·격리

프로파일은 독립 아티팩트로 둔다.

```ts
type ReconstructEnvironmentContextProfileArtifact = {
  schema_version: 1;
  ruleset_version: string;
  source_set_fingerprint: string;
  signals: EnvironmentSignal[];
  detections: Array<{
    detection_id: string;
    category:
      | "language"
      | "runtime"
      | "framework"
      | "package_manager"
      | "infrastructure"
      | "architecture_layer";
    canonical_name: string;
    scope_path: string;
    confidence: "confirmed" | "supported" | "tentative";
    basis: "rule" | "rule_plus_llm" | "llm_assist";
    properties: Record<string, string>;
    signal_refs: string[];
  }>;
  attention: EnvironmentSourceAttention;
  assist: {
    status: "not_needed" | "used" | "failed";
    trigger?: "rule_silence" | "rule_conflict";
  };
  disclosures: Array<Record<string, unknown>>;
  fingerprint: string;
};
```

버전·module mode 같은 파생값은 별도 detection을 만들지 않고 해당 runtime/framework detection의 `properties`로 둔다.

set-tier는 계속 LLM-free 순수 조립물이며 shape를 바꾸지 않는다. profile이 topology, relation, inventory language token, fingerprint를 입력으로 읽는다. `source_set_fingerprint`가 실제 set-tier fingerprint와 다르면 합성을 중단한다.

profile fingerprint는 정렬된 signal·detection·attention·assist 결과와 ruleset version을 코드가 canonical serialization한 뒤 계산한다. LLM은 fingerprint나 detection ID를 제공하지 못한다.

## 2.6 개념 경제 결산

새 독립 아티팩트 하나와 단일 opt-in 키만 추가한다. 기존 `evidence_refs`, set-tier topology/relation/fingerprint, observer import, candidate `salience`, disposition 및 최종 seed shape는 재사용한다.

다만 candidate `salience`는 의미적 중요도이고 환경 detection의 `confidence`는 증거 확실성이므로 같은 enum으로 재사용하지 않는다. `target-material-kind`도 material routing용 단일 버킷이어서 scope별 복수 기술 detection을 담도록 확장하지 않는다.

새 CLI 플래그, 새 failure kind, per-span ID, post-seed LLM 패스, 최종 seed 필드는 만들지 않는다. 세부 정당화는 §4 표에 정리한다.

## 2.7 최소 실행 경로

설정에 `environment_context_profile: true`가 없으면 신규 collector 호출 전 분기하여 기존 실행을 그대로 진행한다.

키가 있으면 한 번의 repository capture로 profile을 생성하고, 동일 실행에서 반드시 다음 두 소비자를 함께 켠다.

1. candidate inventory/disposition의 source 순서 변경
2. candidate 이후 구조 보강 projection을 disposition 요청에 포함

아티팩트만 생성하고 소비자를 나중에 붙이는 중간 단계는 허용하지 않는다. 조건부 LLM 보조도 같은 opt-in 경로에 포함하며 호출 조건이 아니면 0회, 조건이면 정확히 1회다.

## 2.8 실패·검증

Hard fail 대상은 다음과 같다.

- 승인 root 이탈, symlink 우회, 스캔 상한 도달, 읽기 도중 snapshot 변경
- 알려진 고신호 파일의 파싱 실패·중복 키·부분 캡처
- set-tier fingerprint 불일치
- signal/detection의 존재하지 않는 evidence ref
- 비결정적 정렬, 중복 detection ID, attention의 ID 추가·누락
- 원문 secret 또는 허용되지 않은 raw excerpt의 artifact/LLM payload 유입

규칙이 기술을 인식하지 못하는 것은 실패가 아니다. unknown 또는 conflict disclosure로 남긴다. LLM 호출·응답 실패도 결정론 core를 폐기하지 않지만 `assist.status:"failed"`로 명시하고 해당 응답 전체를 거부한다. 구조적으로 무효한 LLM payload를 부분 수용하지 않는다.

완료 기준은 다음과 같이 falsifiable하다.

- 플래그 미설정 golden test에서 아티팩트, LLM 요청 bytes, 호출 순서·횟수, fingerprint가 기준선과 byte-identical이다.
- A–G parser fixture가 예상 signal·scope·confidence를 정확히 산출하며 입력 순서를 섞어도 profile bytes와 fingerprint가 같다.
- Python backend + TS frontend + Terraform fixture가 단일 primary label 없이 세 scope의 detection을 모두 낸다.
- `models/` 경로만 있는 fixture는 framework detection을 만들지 않는다.
- unambiguous fixture는 보조 LLM 0회, silence/conflict fixture는 저장소당 정확히 1회다.
- LLM이 미제공 candidate ID, evidence ref 또는 confirmed를 반환하면 응답 전체가 거부되고 실패 disclosure가 남는다.
- attention integration fixture에서 선택 ID 집합은 같지만 예산 안에 들어오는 excerpt가 실제로 바뀐다.
- 중앙 source를 인용한 high-salience candidate와 migration-only candidate가 서로 다른 structural alignment를 만들며, disposition 요청 bytes에 그 차이가 나타난다.
- 릴리스 전에는 실제 파일시스템 권한의 폴리글랏 checkout과 실제 `callJsonAuthor` 경로로 on/off 양쪽을 실행한다. mock fixture 결과만으로 완료 처리하지 않는다.

# 3. §9 중립 대안 선택

| 축 | 선택 | 이유 |
|---|---|---|
| A. 출력 형태 | (a) 신규 독립 아티팩트 | set-tier의 순수·LLM-free 수명과 repo 설정 파싱·조건부 LLM 수명을 섞지 않는다. |
| B. 수집 범위 | (c) 혼합 | 기존 inventory/set-tier를 재사용하되, 잘린 raw excerpt로는 A–C를 신뢰성 있게 파싱할 수 없다. |
| C. LLM 보조 | (b′) 침묵 또는 명시적 충돌에서만 1패스 | packet의 침묵/모호 조건을 모두 포함하되 후보·확신도 권한을 구조적으로 제한한다. |
| D. attention 입도 | (a) per-source만 | 실제 원문 선택 seat에 즉시 착지하며 새 span identity·슬라이스 정책을 만들 필요가 없다. |
| E. attention seat | (a) `selectedObservationIds` | candidate inventory가 source text를 읽기 전에 예산 우선순위를 바꿀 수 있는 가장 이른 기존 seat다. |
| F. 검증·보강 | (b) disposition에 fold | candidate가 생긴 뒤 구조 대조가 가능하고, 새 post-seed LLM 패스나 최종 seed shape 변경이 없다. |

# 4. 개념 경제 결산 표

| 새 개념 | 기존 대안 | 재사용 불가 이유 |
|---|---|---|
| `ReconstructEnvironmentContextProfileArtifact` | set-tier result 확장 | set-tier는 관찰된 코드의 순수 조립물이고 profile은 repo 설정 파싱과 조건부 LLM이라는 다른 권한·실패모드·수명을 가진다. |
| `EnvironmentSignal` 정규화 레코드 | raw `content_excerpt` | excerpt는 잘릴 수 있고 parser 결과·locator·보안 정제를 증명하지 못한다. |
| scope별 `EnvironmentDetection` 집합 | `target-material-kind` 버킷 | material kind는 단일 routing 분류이며 폴리글랏·확신도·기술 속성을 표현하지 못한다. |
| `confidence` enum | candidate `salience` | salience는 의미적 중요도, confidence는 구조 증거의 확실성으로 의미와 소비 규칙이 다르다. |
| detection `properties` | runtime-version 등 별도 타입 | 버전·module mode는 detection의 파생 속성이므로 새 아티팩트나 detection 종류가 필요 없다. |
| `attention.sources[]` | inventory에 priority 필드 추가 | priority는 profile+set-tier에 의존하는 실행별 projection이며 단일 파일 inventory의 고유 사실이 아니다. |
| `CandidateStructuralSupportProjection` | candidate/disposition shape 확장 | 코드 소유 측정값과 LLM 소유 산출물을 섞지 않으면서 disposition 입력에서만 소비해야 한다. |
| 버전 고정 environment rule/catalog | target basename 목록만 확장 | 내용 키, import, strength, conflict, attention 효과를 basename 표로 표현할 수 없다. |
| `environment_context_profile: true` | CLI 플래그 또는 여러 세부 키 | 단일 가역 opt-in이면 충분하며 스캔·LLM·소비자가 분리 활성화되어 inert해지는 것을 막는다. |
| `assist.status`와 profile disclosure | 새 failure kind | LLM 보조 실패와 인식 불확실성은 구조 실행 실패가 아니므로 기존 실행 오류 enum을 늘리지 않고 명시적으로 노출한다. |

# 5. 최소 실행 경로

1. Default-off 스켈레톤

   - `artifact-types.ts`: 새 profile 타입만 선언한다.
   - `run.ts`: 선택적 `environment_context_profile: true`를 읽되, 키가 없으면 collector 이전에 기존 경로로 분기한다.
   - off 경로에서는 `materialize-preparation.ts`, observer import 옵션, set-tier 호출 인자, prompt assembly를 전혀 변경하지 않는다.
   - 기준 golden에서 prompt·artifact·호출 ledger의 byte diff가 0이어야 한다.

2. 최초 opt-in 행동

   - `materialize-preparation.ts`: 승인 root에서 profile용 allowlist 캡처와 A–C/F/G 정규화를 수행한다.
   - `code-structure-observer.ts`: 새 필드 없이 기존 opt-in `imports[]`를 공급한다.
   - `comprehension-set-tier.ts`: 수정하지 않고 topology·relation·fingerprint를 입력으로 제공한다.
   - 신규 `environment-context-profile.ts`: A–G 합성, 조건부 1-pass 보조, 검증, canonical serialization, fingerprint, source priority를 담당한다.
   - `run.ts`, `selectedObservationIds(directive)` 직후: profile priority로 stable sort한다.
   - `run.ts:12512`, `12630`: 동일한 ranked ID 순서를 실제 excerpt projection에 사용한다.
   - `writeCandidateInventory` 반환 직후: `projectCandidateStructuralSupport`를 실행한다.
   - `writeCandidateDisposition`(`run.ts:12606`) 입력에 구조 보강 블록을 의무 삽입한다.
   - `ontologySeedObservationIds`와 `writeOntologySeed`(`includeStructuralData:false`)는 그대로 둔다.

3. 복귀

   - 설정에서 `environment_context_profile` 키를 제거한다.
   - 별도 migration, artifact cleanup, CLI 상태 복구 없이 기존 경로로 돌아가야 한다.

# 6. 위험·미해결

- 규칙·기술 catalog가 오래되면 신기술은 정직하게 unknown으로 남는다. owner는 ruleset 갱신 책임자와 호환성 정책을 지정해야 한다.
- per-source만으로는 대형 단일 파일 중간의 핵심 내용을 놓칠 수 있다. 실제 mid-file benchmark에서 source ranking이 부족하다는 증거가 나온 뒤에만 per-span 계약을 별도 승격해야 한다.
- 대형 monorepo에서는 엄격한 스캔 상한이 가용성을 낮출 수 있다. owner가 엔트리·깊이·바이트 기본값을 확정해야 하지만, 상한 도달 시 부분 성공 대신 fail-loud한다는 정책은 유지한다.
