# Productization Charter

> 상태: Active
> 목적: onto-mcp의 현재 제품 방향, 권위 구조, 개발 기준, 우선순위를 고정한다.
> 기준 문서:
> - `.onto/authority/core-lexicon.yaml`
> - `.onto/principles/ontology-as-code-guideline.md`
> - `.onto/principles/llm-native-development-guideline.md`
> - `.onto/principles/llm-runtime-interface-principles.md`

---

## 1. Position

onto-mcp는 더 이상 "프로토타입을 제품으로 옮기는 준비 문서"가 아니다.

현재 기준은 아래다.

1. `.onto/` contracts와 `src/core-runtime/` TypeScript runtime이 active product truth다.
2. `src/mcp/`는 host-facing MCP tool surface를 제공한다.
3. `review`는 가장 성숙한 canonical product path다.
4. `reconstruct`는 bounded MCP/Core API surface가 있는 active product path다.
5. prompt/provider 실행은 의미 판단 realization이며, 별도 artifact truth가 아니다.
6. historical prototype prose와 migration 기록은 참고 자료일 수 있지만 active runtime authority가 아니다.

한 문장으로 말하면:

- 이 레포의 제품 방향은 `ontology as code` contract를 TypeScript runtime과 MCP-native tool surface로 실행하는 것이다.

---

## 2. Product Goal

목표는 LLM을 없애거나 모든 판단을 deterministic code로 바꾸는 것이 아니다.

목표는 아래를 동시에 만족하는 제품 경로다.

1. `LLM`은 의미 판단, tradeoff, causality, materiality, semantic quality를 맡는다.
2. runtime은 context, permission, id/path, artifact, validator, projection, status를 맡는다.
3. host/model/provider가 바뀌어도 같은 concept, contract, artifact truth가 유지된다.
4. machine artifact는 submit tool 또는 동등한 constrained channel로 생성된다.
5. human-readable output은 가능한 한 machine artifact의 projection으로 남는다.
6. product completion과 semantic quality evidence는 실제 runtime/provider path에서만 주장한다.

---

## 3. Non-Goals

현재 목표가 아닌 것은 아래다.

1. LLM-free system을 만드는 것
2. host별 slash command나 adapter를 canonical interface로 삼는 것
3. historical prompt path를 active artifact truth로 병행 운영하는 것
4. mock/fixture-backed run을 제품 완료 증거로 삼는 것
5. prose-only 문서를 runtime contract의 최종 authority로 삼는 것
6. review가 learn/govern promotion 경로를 대신 수행하게 하는 것

---

## 4. Authority Structure

현재 권위 구조는 아래 순서를 따른다.

1. `.onto/authority/core-lexicon.yaml`
2. `.onto/processes/**` process contracts
3. `.onto/principles/**` active principles
4. TypeScript validators, submit handlers, artifact writers
5. MCP/Core API schemas and surfaces
6. generated runtime artifacts
7. historical notes, migration records, prototype prose

원칙:

- machine-readable authority가 있으면 runtime은 그 source를 직접 참조한다.
- prose는 설계와 설명의 authority일 수 있지만, runtime-owned field의 canonical source가 되면 안 된다.
- schema, validator, submit tool, prompt contract가 같은 constraint를 공유하면 단일 source에서 파생하거나 drift-catching test를 둔다.

---

## 5. Core Product Principles

### 5.1 TypeScript core first

core runtime은 TypeScript가 소유한다.

TypeScript core가 소유하는 것은 아래다.

1. artifact assembly
2. schema/validator execution
3. id/path/envelope/metadata generation
4. deterministic projection
5. status/result/cancel/continue run control
6. provider/worker adapters

### 5.2 MCP-native surface

host-facing interface는 MCP tool call이다.

`src/mcp/`는 tool schema와 server surface를 얇게 유지한다.
`onto` 의미론은 `.onto/` contracts와 `src/core-runtime/`이 소유한다.

### 5.3 Artifact-first execution

실행 truth는 대화 transcript가 아니라 artifact다.

현재 review primary artifact는 `review-record.yaml`이다.
Markdown은 사람이 읽는 projection이며, source layer를 대체하지 않는다.

### 5.4 Capability boundary

LLM/runtime 경계는 `/Users/kangmin/.codex/guides/llm-capability-boundary.md`를 따른다.
onto-mcp 적용 규칙은 `.onto/principles/llm-native-development-guideline.md`와
`.onto/principles/llm-runtime-interface-principles.md`가 소유한다.

### 5.5 Actual environment evidence

mock/fixture/prepare-only evidence는 wiring과 contract 검증에 유용하지만,
제품 behavior와 semantic quality 완료 증거가 아니다.

실제 provider 호출이 필요한 경로에서 호출이 불가능하면 blocked/degraded로 기록한다.

---

## 6. Current Product Paths

### 6.1 Review

`review`는 현재 가장 성숙한 product path다.

canonical flow:

1. user request
2. `호출 해석 (InvocationInterpretation)`
3. 주체자 확인 / 선택 확정
4. `호출 고정 (InvocationBinding)`
5. execution preparation artifacts
6. selected lens set execution
7. issue artifact construction
8. controlled lens deliberation
9. synthesize
10. `final-output.md`
11. `review-record.yaml`

Current host-facing tools:

- `onto_review`
- `onto_prepare_review`
- `onto_review_continue`
- `onto_review_cancel`
- `onto_review_status`
- `onto_review_result`
- `onto_list_lenses`
- `onto_list_domains`

Review contracts own the exact artifact list, issue handling, problem framing, and materiality criteria.
This charter does not redefine those contracts.

### 6.2 Reconstruct

`reconstruct` is an active bounded MCP/Core API surface.

Current host-facing tools:

- `onto_list_source_profiles`
- `onto_observe_source`
- `onto_validate_reconstruct_directive`
- `onto_reconstruct`
- `onto_reconstruct_status`
- `onto_reconstruct_result`

Runtime owns source observation, material-kind handling, directive validation, artifact persistence,
status, and result surfaces.

`LLM`-authored ontology meaning is accepted only through bounded directive validation.

### 6.3 Learn/Govern

`learn` and `govern` remain conceptually important, but they are not the current productized runtime path.

References to promotion, canonicalization, lifecycle movement, or governance approval must be treated as
future or separate process work unless a current contract and MCP/Core API surface exists.

---

## 7. Execution Profiles

Current active review execution path:

1. `ReviewExecutionProfile.mode=main-workers`
2. worker executor `codex`
3. worker executor `direct_call`
4. separate `synthesize.llm` actor seat after deliberation

`nested-workers` remains a profile concept, but active product path must fail-loud when it cannot enforce
sidecar structured output, read-only lens execution, and bounded dispatch.

Provider and host differences are absorbed by provider/worker contracts. They must not create separate
artifact truth.

---

## 8. Development Method

For meaningful product work, use this order.

1. Identify the concept being changed.
2. Find its canonical seat.
3. Decide whether the changed fields are `LLM`-owned or runtime-owned.
4. Reuse existing concept, contract, validator, submit tool, and MCP/Core API surface where possible.
5. Add or update bounded output channels before relying on machine-consumed LLM output.
6. Keep source layer and projection layer separate.
7. Verify with the narrowest reliable checks, then report evidence class.

When a semantic path is still being explored, prompt/provider execution may be used as a reference realization.
It must still write the same artifact truth and use the same accepted output channel as the product path.

---

## 9. Current Priority

Current priority order:

1. Keep `review` productized live path as artifact-backed canonical truth.
2. Preserve `selected lens set -> issue artifacts -> controlled deliberation -> synthesize -> final-output -> ReviewRecord`.
3. Keep `ReviewRecord` as primary artifact and markdown as projection/rendering layer.
4. Keep MCP tool surface thin and runtime semantics in `.onto/` contracts plus `src/core-runtime/`.
5. Maintain run-control tools: status, continue, cancel, result.
6. Mature `reconstruct` through material-aware observation, directive validation, and artifact persistence.
7. Use provider contracts to absorb Codex, Claude, local, and future host differences.
8. Claim semantic quality only from actual runtime/provider path evidence.

---

## 10. Success Criteria

A product change is complete when:

1. concept, contract, artifact seat, type/interface, field name, and path align.
2. `LLM`-owned and runtime-owned fields are separated.
3. canonical machine artifacts are written through an accepted output channel.
4. runtime-owned values are created by runtime and rejected from `LLM` submission.
5. human-readable outputs are projections where possible.
6. product-path evidence and mock/fixture support evidence are reported separately.
7. affected links, docs, validators, schemas, and tests are checked.

---

## 11. Operating Questions

Start new work by asking:

1. 어떤 ontology concept를 바꾸는가
2. canonical seat가 어디인가
3. 대상물 형식(`target_material_kind`)이 무엇이며 처리 방식이 달라지는가
4. `LLM` 소유인가, runtime 소유인가
5. source layer와 projection layer가 무엇인가
6. 기존 contract, validator, submit tool, MCP/Core API surface 중 무엇을 재사용해야 하는가
7. verification evidence가 product-path/live evidence인지 mock/fixture support evidence인지 무엇인가
8. 변경이 `INVARIANTS.md` 보호 항목에 닿는가
