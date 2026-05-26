# Global AGENTS.md Concept Economy Handoff

> 상태: handoff
> 작성일: 2026-05-26
> 대상: `/Users/kangmin/.codex/AGENTS.md`를 관리하는 LLM
> 목적: `onto-mcp` concept surface simplification 작업에서 확인한 일반 지침을 전역 AGENTS.md의 `Concept Economy` 섹션에 반영할 수 있도록 정리한다.

---

## 1. Context

`onto-mcp`에서 review runtime을 MCP-native 경로로 정리하는 과정에서, 기능을 고칠 때마다 새 type, field, enum token, artifact, helper, failure kind가 늘어나면 시스템이 빠르게 복잡해진다는 문제가 반복적으로 확인되었다.

이번 작업의 핵심 교훈은 다음과 같다.

- 작은 이름 하나도 새 개념 후보가 될 수 있다.
- 리뷰 finding을 고치는 과정 자체가 concept surface를 늘릴 수 있다.
- 내부 projection/helper가 public config, CLI/MCP input, artifact authority로 승격되면 source authority가 갈라진다.
- runtime이 계산할 수 있는 파생값을 입력으로 다시 받으면 drift가 생긴다.
- 실패/재시도/복구 token도 concept economy 대상이다.
- stale comment/docs는 미래의 잘못된 개념을 유도한다.

전역 AGENTS.md에는 이미 `Concept Economy` 섹션이 있다. 새 섹션을 만들기보다 기존 섹션을 확장하는 방식이 적절하다.

---

## 2. Current Gap In Global Concept Economy

현재 전역 `Concept Economy`는 큰 방향은 좋다.

- 기존 개념 재사용
- nearest existing concept 확인
- reuse / extend / rename / split 중 명시적 선택
- split 조건으로 ownership, lifecycle, validation, failure mode 등 확인
- derived value를 source concept의 property/projection으로 유지

다만 이번 작업에서 필요했던 아래 항목은 더 명시적으로 보강할 필요가 있다.

| Gap | 왜 필요한가 |
|---|---|
| concept candidate 범위 확장 | enum value, CLI flag, MCP/tool field, failure kind, retry token도 새 개념이 될 수 있다. |
| fix 전후 concept surface 판정 | 문제를 고치면서 active concept surface를 더 키우는 일을 막아야 한다. |
| internal projection 승격 제한 | 내부 계산 helper가 public authority가 되면 source truth가 갈라진다. |
| derived input 금지 | runtime 파생값을 사용자 입력으로 다시 받으면 충돌과 drift가 생긴다. |
| artifact truth 기준 | 어떤 값이 authority인지, copied visibility인지 구분해야 한다. |
| failure/recovery vocabulary economy | timeout/retry/failure token이 무분별하게 늘어나면 복구 의미가 흐려진다. |
| fallback/shim/deprecated alias 제한 | 조용한 호환 경로는 context pollution과 silent drift를 만든다. |
| stale wording 관리 | 오래된 comment/docs가 실제 runtime contract처럼 오해될 수 있다. |

---

## 3. Recommended Patch Shape

전역 AGENTS.md의 `## Concept Economy` 섹션에 아래 bullet을 추가하는 것을 권장한다.

```md
- Treat every new type, field, enum value, config key, CLI flag, MCP/tool field,
  public response field, artifact field, failure kind, retry/recovery token,
  helper module, process name, and documentation term as a concept candidate.
- Before fixing a review finding or test failure, classify the proposed fix as
  reducing, preserving, or increasing the active concept surface.
- If a fix increases the active concept surface, require evidence that the new
  concept has distinct ownership, lifecycle, validation, failure mode,
  user-visible behavior, or audit/replay requirements.
- Keep internal projections and helper outputs internal unless public exposure
  is required for user behavior or artifact truth. Do not promote them into
  config, CLI/MCP input, public API, or canonical artifact authority for
  implementation convenience.
- Do not accept runtime-derived values as user input when they can be derived
  again from their source authority.
- Reuse existing enum values, failure kinds, retry/recovery tokens, and
  result/failure surfaces before introducing new vocabulary.
- Distinguish authority from visibility: public responses may expose bounded
  views copied from artifacts, but the artifact or source concept must remain
  the truth location.
- Do not add fallback paths, compatibility shims, or deprecated alias
  normalization unless the user explicitly asks for migration compatibility.
- Treat stale comments and active documentation as concept drift. Update wording
  when runtime behavior, failure semantics, retry policy, ownership, or authority
  changes.
```

---

## 4. Optional Subsection

If the maintainer prefers a separate subsection under `Concept Economy`, use this.

```md
### Concept Promotion Gate

- A new name or field is not neutral; it is a concept candidate.
- Promote a concept only when it has a distinct owner, lifecycle, validation
  rule, failure mode, user-visible behavior, or audit/replay need.
- If the difference is only implementation convenience, keep it private,
  derive it from the parent concept, or express it as a child property.
- For review-driven fixes, write down whether the fix reduces, preserves, or
  increases concept surface before implementation.
```

This subsection is useful if the global file should make the promotion standard easy to cite.

---

## 5. Recommended Wording Principles

When incorporating this into global AGENTS.md:

- Prefer concise, general rules over `onto`-specific examples.
- Avoid introducing too many new named policies; this guidance itself should follow concept economy.
- Keep the terms `Concept Economy` and `Concept Promotion Gate` only if the latter will be cited often.
- Do not mention the `onto-mcp` runtime details in the global file.
- Phrase rules as current preferred behavior, not historical lessons.

---

## 6. Example Consequences

These examples explain the intended behavior for future agents.

| Situation | Preferred behavior |
|---|---|
| A test needs a new enum token like `low-medium` | Reuse an existing allowed token or update the canonical enum with explicit justification and tests. |
| A helper calculates a route/provider summary | Keep it internal unless the public contract needs that exact field. |
| Runtime can derive a value from settings and artifacts | Do not add a CLI/MCP/config input for the derived value. |
| A failure path needs reporting | Use the existing result/failure surface first. Add a new failure kind only when consumers need a distinct recovery meaning. |
| A comment says retry is exponential but code is linear | Treat the comment as stale runtime contract drift and update it. |
| A deprecated flag could be silently accepted | Prefer fail-loud unless explicit migration compatibility is requested. |

---

## 7. Summary For The Managing LLM

Please update the global `Concept Economy` guidance so future coding agents treat small public names, enum tokens, failure kinds, retry/recovery labels, artifact fields, and documentation terms as concept candidates. The intended default is to reuse existing concepts and result/failure surfaces, keep projections internal, keep derived values out of user input, and prevent fixes from accidentally increasing the active concept surface.
