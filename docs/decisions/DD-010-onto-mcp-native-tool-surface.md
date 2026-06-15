# DD-010 — Onto MCP-Native Tool Surface

**Decided**: 2026-05-21
**Status**: Realized — direction shipped across v0.4.x
**Owner**: operations
**Active architecture**: [`docs/architecture/mcp-native-tool-surface.md`](../architecture/mcp-native-tool-surface.md)
— current tool set, provider/route model, and runtime behavior live there. This
record captures *what was decided and why*, not current behavior.

## Context

Early `onto` work explored binding review semantics to external host adapters
(the "Slice A-I" experiments, plus Python parity code). The open question was
whether the product path should keep growing those adapters or consolidate
review semantics in one runtime behind a stable tool surface.

## Decision

`onto`의 제품 경로는 **TS core + MCP-native tool surface**이다. 외부 adapter
결합은 제품 중심 경로가 아니다. 이전 adapter 실험은 독립 관점 리뷰·artifact
equivalence·controlled lens deliberation 요구를 검증한 증거와 conformance
harness로만 보존한다.

## Rationale

사용자에게 중요한 결과는 “어느 host에서 실행하든 같은 `onto` 의미론과 같은
review artifact를 얻는다”는 점이다. 이를 보장하려면 review 의미론이 host별
adapter에 흩어지지 않고 한 런타임에 있어야 하고, host는 플랫폼별 명령을 외우는
대신 작고 안정된 tool을 호출하면 된다.

## Boundary Commitments

결정이 약속하는 불변식 (현행 집행·실현 형태는 활성 아키텍처 문서 참조):

- YAML/MD가 언어중립 계약 source로 남는다.
- TS runtime이 `onto` 의미론의 유일한 실행 소유자다.
- MCP server는 thin tool surface이며 review 의미론의 2차 구현이 아니다.
- execution realization은 capability만 수행한다(격리 컨텍스트, deliberation
  transport, 동시성, 타임아웃, artifact 수집). review의 의미를 결정하지 않는다.
- 외부 adapter는 canonical `onto` 의미론을 누적하지 않는다.

이 불변식은 구조 가드 G1–G6(import boundary, spec-defaults / `INVARIANTS.md`)로
집행된다.

## Consequences

- 구체 host/plugin/messaging backend를 외부 adapter dispatcher에 다음 단계로
  묶지 않았다.
- Slice A-I 적층은 MCP/provider 계약 증거이자 conformance bed로 재분류했고,
  Python parity 코드는 제거했다.
- 구현 순서를 core API → MCP server → execution realization으로 잡았다.

## Status — Realized

방향은 v0.4.x에 걸쳐 실현되었다:

- core API facade (`src/core-api/`: `createOntoReviewCoreApi`,
  `createOntoReconstructCoreApi`)
- 16개 `onto_*` MCP 툴 (`src/mcp/tool-schemas.ts`), thin dispatch
  (`src/mcp/server.ts`)
- codex / claude_code worker + inline-http direct-call realization, mock
  conformance harness 보존
- Python parity 코드 제거 완료

현행 tool set, 타입·route 형태, 실행 동작의 단일 출처는
[`docs/architecture/mcp-native-tool-surface.md`](../architecture/mcp-native-tool-surface.md)이다.
